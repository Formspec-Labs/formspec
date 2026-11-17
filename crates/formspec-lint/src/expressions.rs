//! Pass 4: Expression compilation — parses all FEL expression slots in a definition,
//! producing `CompiledExpression` structs for downstream dependency analysis (pass 5)
//! and E400 diagnostics for parse errors.
//!
//! `walk_*` helpers traverse binds, shapes, and variables.
#![allow(clippy::missing_docs_in_private_items)]

use std::collections::HashMap;

use serde_json::Value;

use crate::types::LintDiagnostic;

/// A Bind property that holds a FEL expression.
///
/// Which of these write the targeted Item's value is a dependency-graph question
/// (Core §3.6.1), answered in [`crate::dependencies`], not here.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum BindProperty {
    /// `calculate`: computes the Item's value.
    Calculate,
    /// `relevant`: decides whether the Item is relevant.
    Relevant,
    /// `required`: decides whether the Item needs an answer.
    Required,
    /// `readonly`: decides whether the Item can be edited.
    Readonly,
    /// `constraint`: validates the Item's value.
    Constraint,
    /// `default` written as `=expr`: the value restored when the Item becomes relevant again.
    Default,
}

/// The expression-bearing Bind properties, in the order they are walked.
const BIND_EXPRESSION_PROPERTIES: &[(&str, BindProperty)] = &[
    ("calculate", BindProperty::Calculate),
    ("relevant", BindProperty::Relevant),
    ("required", BindProperty::Required),
    ("readonly", BindProperty::Readonly),
    ("constraint", BindProperty::Constraint),
];

/// The Bind an expression belongs to: its `path` spelling and property.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BindSlot {
    /// The Bind's target path as written (`name`, `group.name`, `rows[*].amount`).
    pub path: String,
    /// The Bind property holding the expression.
    pub property: BindProperty,
}

/// A variable declaration's lexical identity (Core §4.5.1).
#[derive(Debug, Clone)]
pub struct VariableSlot {
    /// The name used by `@name` references.
    pub name: String,
    /// Item key defining visibility; `"#"` means definition-wide.
    pub scope: String,
}

/// A successfully parsed FEL expression with its location metadata.
#[derive(Debug, Clone)]
pub struct CompiledExpression {
    /// The original FEL source text.
    pub expression: String,
    /// Reuse the successful parse in dependency analysis instead of parsing twice.
    pub(crate) parsed: fel_core::Expr,
    /// JSONPath to the expression slot, e.g. `$.binds.name.calculate`.
    pub expression_path: String,
    /// The Bind slot holding this expression; `None` for Shapes, variables and routes.
    pub bind: Option<BindSlot>,
    /// The `target` of the Shape whose validity this expression decides (`constraint`,
    /// `activeWhen` and composed members); `None` everywhere else, Shape `context` included.
    pub shape_target: Option<String>,
    /// Index of the Shape owning this validity-deciding expression.
    pub shape_index: Option<usize>,
    /// Variable declaration computed by this expression, if any.
    pub variable: Option<VariableSlot>,
}

/// What an expression belongs to, as recorded on [`CompiledExpression`].
enum Owner {
    /// Routes and Shape `context` values.
    None,
    /// A Bind property.
    Bind(BindSlot),
    /// A validity-deciding slot of the Shape with this `target`.
    Shape {
        index: usize,
        target: Option<String>,
    },
    /// A scoped variable declaration.
    Variable(VariableSlot),
}

/// Result of compiling all FEL expression slots in a definition document.
#[derive(Debug)]
pub struct ExpressionCompilationResult {
    /// Successfully parsed expressions.
    pub compiled: Vec<CompiledExpression>,
    /// E400 diagnostics for unparseable expressions.
    pub diagnostics: Vec<LintDiagnostic>,
}

/// Walk all FEL expression slots in a definition document, parse each,
/// and return compiled expressions plus E400 diagnostics for parse failures.
pub fn compile_expressions(document: &Value) -> ExpressionCompilationResult {
    let mut compiled = Vec::new();
    let mut diagnostics = Vec::new();

    walk_binds(document.get("binds"), "$", &mut compiled, &mut diagnostics);
    walk_shapes(document.get("shapes"), &mut compiled, &mut diagnostics);
    walk_variables(document.get("variables"), &mut compiled, &mut diagnostics);

    ExpressionCompilationResult {
        compiled,
        diagnostics,
    }
}

// ── Item initialValue ───────────────────────────────────────────

/// E400 for each Item `initialValue` written as `=expr` that fails to parse (Core §4.2.3).
///
/// Kept out of [`compile_expressions`]: an `initialValue` is a creation seed, evaluated
/// once, so it is neither a dependency-graph vertex (Core §3.6.1) nor part of the
/// evaluation-time expression census callers such as wos-server read from `compiled`.
pub(crate) fn initial_value_parse_errors(document: &Value) -> Vec<LintDiagnostic> {
    let mut diagnostics = Vec::new();
    formspec_core::visit_definition_items_from_document(document, &mut |ctx| {
        if let Some(fel_source) = ctx
            .item
            .get("initialValue")
            .and_then(Value::as_str)
            .and_then(|value| value.strip_prefix('='))
            && let Err(error) = fel_core::parse(fel_source)
        {
            diagnostics.push(parse_error(
                &format!("{}.initialValue", ctx.json_path),
                &error,
            ));
        }
    });
    diagnostics
}

// ── Binds ────────────────────────────────────────────────────────

/// Dispatch to object or array format handler.
fn walk_binds(
    binds: Option<&Value>,
    path_prefix: &str,
    compiled: &mut Vec<CompiledExpression>,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    if binds.and_then(|v| v.as_object()).is_some() {
        walk_binds_object(binds, path_prefix, compiled, diagnostics);
    } else if let Some(arr) = binds.and_then(|v| v.as_array()) {
        walk_binds_array(arr, path_prefix, compiled, diagnostics);
    }
}

fn walk_binds_object(
    binds: Option<&Value>,
    path_prefix: &str,
    compiled: &mut Vec<CompiledExpression>,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    let binds = match binds.and_then(|v| v.as_object()) {
        Some(obj) => obj,
        None => return,
    };

    for (bind_key, bind_val) in binds {
        if let Some(bind) = bind_val.as_object() {
            let bind_json_path = format!("{path_prefix}.binds.{bind_key}");
            walk_bind(bind, bind_key, &bind_json_path, compiled, diagnostics);
        }
    }
}

fn walk_binds_array(
    binds: &[Value],
    path_prefix: &str,
    compiled: &mut Vec<CompiledExpression>,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    for (i, bind) in binds.iter().enumerate() {
        let obj = match bind.as_object() {
            Some(o) => o,
            None => continue,
        };

        let bind_key = match obj.get("path").and_then(|v| v.as_str()) {
            Some(k) => k,
            None => continue,
        };

        let bind_json_path = format!("{path_prefix}.binds[{i}]");
        walk_bind(obj, bind_key, &bind_json_path, compiled, diagnostics);
    }
}

/// Parse every expression-bearing property of one Bind, recording its path and property.
///
/// The object-form walk, the array-form walk and standalone Screener Binds all route through
/// here, so the property list and the `=`-prefixed `default` rule have one owner.
fn walk_bind(
    bind: &serde_json::Map<String, Value>,
    bind_path: &str,
    bind_json_path: &str,
    compiled: &mut Vec<CompiledExpression>,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    let slot = |property| {
        Owner::Bind(BindSlot {
            path: bind_path.to_string(),
            property,
        })
    };
    for &(name, property) in BIND_EXPRESSION_PROPERTIES {
        if let Some(expr_str) = bind.get(name).and_then(Value::as_str) {
            let expression_path = format!("{bind_json_path}.{name}");
            try_parse(
                expr_str,
                expression_path,
                slot(property),
                compiled,
                diagnostics,
            );
        }
    }

    // `default` — only when the value starts with `=` (FEL heuristic)
    if let Some(default_str) = bind.get("default").and_then(Value::as_str)
        && let Some(fel_source) = default_str.strip_prefix('=')
    {
        let expression_path = format!("{bind_json_path}.default");
        try_parse(
            fel_source,
            expression_path,
            slot(BindProperty::Default),
            compiled,
            diagnostics,
        );
    }
}

// ── Shapes ──────────────────────────────────────────────────────

/// A composition member resolved according to Core §5.2.2.
pub(crate) enum ShapeMember<'a> {
    Reference(usize),
    Expression {
        operator: &'static str,
        index: Option<usize>,
        source: &'a str,
    },
}

/// Resolve composition members as Shape ids first, otherwise inline FEL.
pub(crate) fn shape_members<'a>(
    shape: &'a Value,
    ids: &'a HashMap<&'a str, usize>,
) -> impl Iterator<Item = ShapeMember<'a>> {
    ["and", "or", "xone"]
        .into_iter()
        .flat_map(move |op| {
            shape
                .get(op)
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .enumerate()
                .filter_map(move |(index, value)| {
                    value.as_str().map(|source| (op, Some(index), source))
                })
        })
        .chain(
            shape
                .get("not")
                .and_then(Value::as_str)
                .map(|source| ("not", None, source)),
        )
        .map(|(op, index, source)| match ids.get(source) {
            Some(&index) => ShapeMember::Reference(index),
            None => ShapeMember::Expression {
                operator: op,
                index,
                source,
            },
        })
}

fn walk_shapes(
    shapes: Option<&Value>,
    compiled: &mut Vec<CompiledExpression>,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    let shapes = match shapes.and_then(|v| v.as_array()) {
        Some(arr) => arr,
        None => return,
    };

    let shape_ids: HashMap<&str, usize> = shapes
        .iter()
        .enumerate()
        .filter_map(|(index, shape)| Some((shape.get("id")?.as_str()?, index)))
        .collect();
    for (i, shape) in shapes.iter().enumerate() {
        let target = shape.get("target").and_then(Value::as_str);
        let owner = || Owner::Shape {
            index: i,
            target: target.map(str::to_owned),
        };

        // Direct expression slots
        for &slot in &["constraint", "activeWhen"] {
            if let Some(expr_str) = shape.get(slot).and_then(|v| v.as_str()) {
                let expression_path = format!("$.shapes[{i}].{slot}");
                try_parse(expr_str, expression_path, owner(), compiled, diagnostics);
            }
        }

        // Context object: all values are FEL strings
        if let Some(ctx) = shape.get("context").and_then(|v| v.as_object()) {
            for (ctx_key, ctx_val) in ctx {
                if let Some(expr_str) = ctx_val.as_str() {
                    let expression_path = format!("$.shapes[{i}].context.{ctx_key}");
                    try_parse(
                        expr_str,
                        expression_path,
                        Owner::None,
                        compiled,
                        diagnostics,
                    );
                }
            }
        }

        for member in shape_members(shape, &shape_ids) {
            if let ShapeMember::Expression {
                operator,
                index,
                source,
            } = member
            {
                let expression_path = match index {
                    Some(index) => format!("$.shapes[{i}].{operator}[{index}]"),
                    None => format!("$.shapes[{i}].{operator}"),
                };
                try_parse(source, expression_path, owner(), compiled, diagnostics);
            }
        }
    }
}

// ── Variables ───────────────────────────────────────────────────

fn walk_variables(
    variables: Option<&Value>,
    compiled: &mut Vec<CompiledExpression>,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    let variables = match variables.and_then(|v| v.as_array()) {
        Some(arr) => arr,
        None => return,
    };

    for (i, var) in variables.iter().enumerate() {
        if let Some(expr_str) = var.get("expression").and_then(|v| v.as_str()) {
            let expression_path = format!("$.variables[{i}].expression");
            try_parse(
                expr_str,
                expression_path,
                var.get("name")
                    .and_then(Value::as_str)
                    .map_or(Owner::None, |name| {
                        Owner::Variable(VariableSlot {
                            name: name.to_owned(),
                            scope: var
                                .get("scope")
                                .and_then(Value::as_str)
                                .unwrap_or("#")
                                .to_owned(),
                        })
                    }),
                compiled,
                diagnostics,
            );
        }
    }
}

// ── Standalone Screener Document ────────────────────────────────

/// Walk all FEL expression slots in a standalone Screener Document.
/// Paths: $.evaluation[N].routes[M].condition, $.evaluation[N].routes[M].score,
/// $.evaluation[N].activeWhen, $.binds (screener-scoped).
pub fn compile_screener_expressions(document: &Value) -> ExpressionCompilationResult {
    let mut compiled = Vec::new();
    let mut diagnostics = Vec::new();

    // Screener-scoped binds
    walk_binds(document.get("binds"), "$", &mut compiled, &mut diagnostics);

    // Evaluation pipeline
    if let Some(phases) = document.get("evaluation").and_then(Value::as_array) {
        for (i, phase) in phases.iter().enumerate() {
            // Phase activeWhen
            if let Some(expr_str) = phase.get("activeWhen").and_then(Value::as_str) {
                let path = format!("$.evaluation[{i}].activeWhen");
                try_parse(expr_str, path, Owner::None, &mut compiled, &mut diagnostics);
            }

            // Routes: condition and score expressions
            if let Some(routes) = phase.get("routes").and_then(Value::as_array) {
                for (j, route) in routes.iter().enumerate() {
                    if let Some(expr_str) = route.get("condition").and_then(Value::as_str) {
                        let path = format!("$.evaluation[{i}].routes[{j}].condition");
                        try_parse(expr_str, path, Owner::None, &mut compiled, &mut diagnostics);
                    }
                    if let Some(expr_str) = route.get("score").and_then(Value::as_str) {
                        let path = format!("$.evaluation[{i}].routes[{j}].score");
                        try_parse(expr_str, path, Owner::None, &mut compiled, &mut diagnostics);
                    }
                }
            }
        }
    }

    ExpressionCompilationResult {
        compiled,
        diagnostics,
    }
}

// ── Parse helper ────────────────────────────────────────────────

fn try_parse(
    source: &str,
    expression_path: String,
    owner: Owner,
    compiled: &mut Vec<CompiledExpression>,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    match fel_core::parse(source) {
        Ok(parsed) => {
            let (bind, shape_target, shape_index, variable) = match owner {
                Owner::None => (None, None, None, None),
                Owner::Bind(slot) => (Some(slot), None, None, None),
                Owner::Shape { index, target } => (None, target, Some(index), None),
                Owner::Variable(slot) => (None, None, None, Some(slot)),
            };
            compiled.push(CompiledExpression {
                expression: source.to_string(),
                parsed,
                expression_path,
                bind,
                shape_target,
                shape_index,
                variable,
            });
        }
        Err(e) => diagnostics.push(parse_error(&expression_path, &e)),
    }
}

/// The E400 finding for a FEL expression at `expression_path` that failed to parse.
pub(crate) fn parse_error(expression_path: &str, error: &fel_core::Error) -> LintDiagnostic {
    crate::metadata::with_metadata(LintDiagnostic::error(
        crate::LintCode::E400,
        4,
        expression_path,
        format!("FEL parse error: {error}"),
    ))
}

// ── Tests ───────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;
    use serde_json::json;

    fn slot(path: &str, property: BindProperty) -> Option<BindSlot> {
        Some(BindSlot {
            path: path.to_string(),
            property,
        })
    }

    #[test]
    fn valid_bind_calculate_compiles_with_its_bind_slot() {
        let doc = json!({
            "binds": {
                "total": { "calculate": "$a + $b" }
            }
        });
        let result = compile_expressions(&doc);

        assert!(result.diagnostics.is_empty());
        assert_eq!(result.compiled.len(), 1);

        let expr = &result.compiled[0];
        assert_eq!(expr.expression, "$a + $b");
        assert_eq!(expr.expression_path, "$.binds.total.calculate");
        assert_eq!(expr.bind, slot("total", BindProperty::Calculate));
    }

    // wos-server admits task Definitions from `compiled`, whose census excludes creation
    // seeds; `initialValue` is parse-checked separately and never joins it.
    #[test]
    fn initial_values_are_checked_outside_the_expression_census() {
        let item = |initial: &str| {
            let field =
                json!({ "key": "d", "type": "field", "dataType": "date", "initialValue": initial });
            json!({ "items": [field] })
        };
        let well_formed = item("=today()");
        assert!(compile_expressions(&well_formed).compiled.is_empty());
        assert!(initial_value_parse_errors(&well_formed).is_empty());

        let broken = item("=today( +");
        let malformed = initial_value_parse_errors(&broken);
        assert_eq!(malformed.len(), 1);
        assert_eq!(malformed[0].path, "$.items[0].initialValue");
        assert!(compile_expressions(&broken).diagnostics.is_empty());
    }

    #[test]
    fn invalid_expression_emits_e400() {
        let doc = json!({
            "binds": {
                "name": { "calculate": "1 + + 2" }
            }
        });
        let result = compile_expressions(&doc);

        assert!(result.compiled.is_empty());
        assert_eq!(result.diagnostics.len(), 1);

        let diag = &result.diagnostics[0];
        assert_eq!(diag.code, "E400");
        assert_eq!(diag.pass, 4);
        assert_eq!(diag.path, "$.binds.name.calculate");
        assert!(diag.message.contains("FEL parse error"));
    }

    // Before Core §3.6.1 vertices, `constraint` carried no target and every other property
    // was a write; the record now names each expression's Bind slot, and the dependency
    // pass decides which slots write a value.
    #[test]
    fn constraint_records_its_bind_slot() {
        let doc = json!({
            "binds": {
                "age": { "constraint": "$ >= 0" }
            }
        });
        let result = compile_expressions(&doc);

        assert!(result.diagnostics.is_empty());
        assert_eq!(result.compiled.len(), 1);
        assert_eq!(
            result.compiled[0].bind,
            slot("age", BindProperty::Constraint)
        );
        assert_eq!(result.compiled[0].expression_path, "$.binds.age.constraint");
    }

    #[test]
    fn every_bind_expression_records_its_property() {
        let doc = json!({
            "binds": {
                "x": {
                    "calculate": "1",
                    "relevant": "true",
                    "required": "true",
                    "readonly": "true"
                }
            }
        });
        let result = compile_expressions(&doc);

        assert!(result.diagnostics.is_empty());
        let recorded: Vec<(&str, Option<BindSlot>)> = result
            .compiled
            .iter()
            .map(|expr| (expr.expression_path.as_str(), expr.bind.clone()))
            .collect();
        assert_eq!(
            recorded,
            vec![
                ("$.binds.x.calculate", slot("x", BindProperty::Calculate)),
                ("$.binds.x.relevant", slot("x", BindProperty::Relevant)),
                ("$.binds.x.required", slot("x", BindProperty::Required)),
                ("$.binds.x.readonly", slot("x", BindProperty::Readonly)),
            ]
        );
    }

    #[test]
    fn shape_constraint_and_active_when_parsed() {
        let doc = json!({
            "shapes": [
                {
                    "constraint": "$total > 0",
                    "activeWhen": "$status = 'active'"
                }
            ]
        });
        let result = compile_expressions(&doc);

        assert!(result.diagnostics.is_empty());
        assert_eq!(result.compiled.len(), 2);

        let paths: Vec<&str> = result
            .compiled
            .iter()
            .map(|e| e.expression_path.as_str())
            .collect();
        assert!(paths.contains(&"$.shapes[0].constraint"));
        assert!(paths.contains(&"$.shapes[0].activeWhen"));

        // Shape expressions belong to no Bind
        for expr in &result.compiled {
            assert_eq!(expr.bind, None);
        }
    }

    #[test]
    fn shape_context_values_parsed() {
        let doc = json!({
            "shapes": [
                {
                    "constraint": "$total > 0",
                    "context": {
                        "total": "sum($items[*].amount)"
                    }
                }
            ]
        });
        let result = compile_expressions(&doc);

        assert!(result.diagnostics.is_empty());
        let ctx_expr = result
            .compiled
            .iter()
            .find(|e| e.expression_path == "$.shapes[0].context.total")
            .expect("context expression should be compiled");
        assert_eq!(ctx_expr.expression, "sum($items[*].amount)");
    }

    #[test]
    fn shape_composed_operators_parsed() {
        let doc = json!({
            "shapes": [
                {
                    "and": ["$a > 0", "$b > 0"],
                    "or": ["$c = 1"],
                    "not": "$d = false",
                    "xone": ["$e", "$f"]
                }
            ]
        });
        let result = compile_expressions(&doc);

        assert!(result.diagnostics.is_empty());
        let paths: Vec<&str> = result
            .compiled
            .iter()
            .map(|e| e.expression_path.as_str())
            .collect();
        assert!(paths.contains(&"$.shapes[0].and[0]"));
        assert!(paths.contains(&"$.shapes[0].and[1]"));
        assert!(paths.contains(&"$.shapes[0].or[0]"));
        assert!(paths.contains(&"$.shapes[0].not"));
        assert!(paths.contains(&"$.shapes[0].xone[0]"));
        assert!(paths.contains(&"$.shapes[0].xone[1]"));
        assert_eq!(result.compiled.len(), 6);
    }

    #[test]
    fn variables_expression_parsed() {
        let doc = json!({
            "variables": [
                { "name": "totalDirect", "expression": "sum($items[*].amount)" }
            ]
        });
        let result = compile_expressions(&doc);

        assert!(result.diagnostics.is_empty());
        assert_eq!(result.compiled.len(), 1);
        assert_eq!(
            result.compiled[0].expression_path,
            "$.variables[0].expression"
        );
        assert_eq!(result.compiled[0].expression, "sum($items[*].amount)");
    }

    #[test]
    fn default_with_equals_prefix_parsed() {
        let doc = json!({
            "binds": {
                "name": { "default": "=concat($first, ' ', $last)" }
            }
        });
        let result = compile_expressions(&doc);

        assert!(result.diagnostics.is_empty());
        assert_eq!(result.compiled.len(), 1);

        let expr = &result.compiled[0];
        assert_eq!(expr.expression, "concat($first, ' ', $last)");
        assert_eq!(expr.expression_path, "$.binds.name.default");
        assert_eq!(expr.bind, slot("name", BindProperty::Default));
    }

    #[test]
    fn default_without_equals_prefix_ignored() {
        let doc = json!({
            "binds": {
                "name": { "default": "some static value" }
            }
        });
        let result = compile_expressions(&doc);

        // Static defaults are not FEL — should not be compiled
        assert!(result.compiled.is_empty());
        assert!(result.diagnostics.is_empty());
    }

    #[test]
    fn empty_document_no_panic() {
        let doc = json!({});
        let result = compile_expressions(&doc);

        assert!(result.compiled.is_empty());
        assert!(result.diagnostics.is_empty());
    }

    #[test]
    fn null_document_no_panic() {
        let doc = Value::Null;
        let result = compile_expressions(&doc);

        assert!(result.compiled.is_empty());
        assert!(result.diagnostics.is_empty());
    }

    // ── Array-format binds (schema-canonical) ──────────────────

    #[test]
    fn array_format_binds_compiled() {
        let doc = json!({
            "binds": [{ "path": "total", "calculate": "$a + $b" }]
        });
        let result = compile_expressions(&doc);
        assert!(result.diagnostics.is_empty());
        assert_eq!(result.compiled.len(), 1);
        assert_eq!(
            result.compiled[0].bind,
            slot("total", BindProperty::Calculate)
        );
        assert_eq!(result.compiled[0].expression_path, "$.binds[0].calculate");
    }

    #[test]
    fn array_format_binds_constraint_records_its_bind_slot() {
        let doc = json!({
            "binds": [{ "path": "age", "constraint": "$ >= 0" }]
        });
        let result = compile_expressions(&doc);
        assert!(result.diagnostics.is_empty());
        assert_eq!(result.compiled.len(), 1);
        assert_eq!(
            result.compiled[0].bind,
            slot("age", BindProperty::Constraint)
        );
        assert_eq!(result.compiled[0].expression_path, "$.binds[0].constraint");
    }

    #[test]
    fn array_format_binds_all_slots() {
        let doc = json!({
            "binds": [{
                "path": "x",
                "calculate": "1",
                "relevant": "true",
                "required": "true",
                "readonly": "true"
            }]
        });
        let result = compile_expressions(&doc);
        assert!(result.diagnostics.is_empty());
        assert_eq!(result.compiled.len(), 4);
        for expr in &result.compiled {
            assert_eq!(expr.bind.as_ref().map(|bind| bind.path.as_str()), Some("x"));
        }
    }

    #[test]
    fn array_format_binds_default_with_equals() {
        let doc = json!({
            "binds": [{ "path": "name", "default": "=concat($first, ' ', $last)" }]
        });
        let result = compile_expressions(&doc);
        assert!(result.diagnostics.is_empty());
        assert_eq!(result.compiled.len(), 1);
        assert_eq!(result.compiled[0].expression, "concat($first, ' ', $last)");
        assert_eq!(result.compiled[0].expression_path, "$.binds[0].default");
        assert_eq!(result.compiled[0].bind, slot("name", BindProperty::Default));
    }

    #[test]
    fn array_format_binds_invalid_expression_emits_e400() {
        let doc = json!({
            "binds": [{ "path": "x", "calculate": "1 + + 2" }]
        });
        let result = compile_expressions(&doc);
        assert!(result.compiled.is_empty());
        assert_eq!(result.diagnostics.len(), 1);
        assert_eq!(result.diagnostics[0].code, "E400");
        assert_eq!(result.diagnostics[0].path, "$.binds[0].calculate");
    }

    #[test]
    fn array_format_empty_binds_no_panic() {
        let doc = json!({ "binds": [] });
        let result = compile_expressions(&doc);
        assert!(result.compiled.is_empty());
        assert!(result.diagnostics.is_empty());
    }

    // ── Finding 54: Non-object bind value skipped gracefully ────

    /// Spec: core/spec.md §4.3.1 (line 2236), schemas/definition.schema.json —
    /// bind values that are strings, numbers, or null (not objects) are skipped
    /// gracefully by walk_binds_object.
    #[test]
    fn bind_value_string_skipped_gracefully() {
        let doc = json!({
            "binds": {
                "name": "just a string, not an object",
                "age": 42,
                "empty": null
            }
        });
        let result = compile_expressions(&doc);
        assert!(
            result.compiled.is_empty(),
            "Non-object bind values should be skipped"
        );
        assert!(
            result.diagnostics.is_empty(),
            "Non-object bind values should not produce diagnostics"
        );
    }

    // ── Finding 55: Array bind entry without path skipped ────────

    /// Spec: core/spec.md §4.3.1 (line 2239) — array-format bind entries without
    /// a `path` field are skipped. Spec says `path` is REQUIRED, but the linter
    /// is lenient here (schema validation catches missing path).
    #[test]
    fn array_format_bind_without_path_skipped() {
        let doc = json!({
            "binds": [
                { "calculate": "$x + 1" },
                { "path": "valid", "calculate": "$y + 1" }
            ]
        });
        let result = compile_expressions(&doc);
        // Only the entry WITH a path should be compiled
        assert_eq!(
            result.compiled.len(),
            1,
            "Only bind with path should be compiled"
        );
        assert_eq!(
            result.compiled[0].bind,
            slot("valid", BindProperty::Calculate)
        );
        assert!(result.diagnostics.is_empty());
    }

    #[test]
    fn mixed_valid_and_invalid_expressions() {
        let doc = json!({
            "binds": {
                "a": { "calculate": "$x + 1" },
                "b": { "calculate": "1 + + 2" },
                "c": { "relevant": "true" }
            }
        });
        let result = compile_expressions(&doc);

        assert_eq!(result.compiled.len(), 2, "two valid expressions");
        assert_eq!(result.diagnostics.len(), 1, "one parse error");
        assert_eq!(result.diagnostics[0].path, "$.binds.b.calculate");
    }

    // ── Shape with both constraint and composed operator ────────

    /// Spec: spec.md §6.3 — shapes can have both constraint and composed operators simultaneously
    #[test]
    fn shape_constraint_and_composed_operator_simultaneously() {
        let doc = json!({
            "shapes": [{
                "constraint": "$total > 0",
                "and": ["$a > 0", "$b > 0"]
            }]
        });
        let result = compile_expressions(&doc);

        assert!(result.diagnostics.is_empty());
        assert_eq!(result.compiled.len(), 3);

        let paths: Vec<&str> = result
            .compiled
            .iter()
            .map(|e| e.expression_path.as_str())
            .collect();
        assert!(paths.contains(&"$.shapes[0].constraint"));
        assert!(paths.contains(&"$.shapes[0].and[0]"));
        assert!(paths.contains(&"$.shapes[0].and[1]"));
    }

    // ── Variables array with missing expression field ────────────

    /// Spec: spec.md §8.1 — variable entries without an expression field are silently skipped
    #[test]
    fn variables_missing_expression_field_skipped() {
        let doc = json!({
            "variables": [
                { "name": "total" },
                { "name": "average", "expression": "sum($items) / count($items)" }
            ]
        });
        let result = compile_expressions(&doc);

        assert!(result.diagnostics.is_empty());
        assert_eq!(
            result.compiled.len(),
            1,
            "Only the variable with expression should compile"
        );
        assert_eq!(
            result.compiled[0].expression_path,
            "$.variables[1].expression"
        );
    }

    // ── Standalone Screener Document walker ────────────────────────

    #[test]
    fn screener_document_route_conditions_parsed() {
        let doc = json!({
            "$formspecScreener": "1.0",
            "evaluation": [{
                "id": "p1",
                "strategy": "first-match",
                "routes": [
                    { "condition": "$orgType = 'nonprofit'", "target": "urn:a" },
                    { "condition": "true", "target": "urn:b" }
                ]
            }]
        });
        let result = compile_screener_expressions(&doc);

        assert!(result.diagnostics.is_empty());
        assert_eq!(result.compiled.len(), 2);
        let paths: Vec<&str> = result
            .compiled
            .iter()
            .map(|e| e.expression_path.as_str())
            .collect();
        assert!(paths.contains(&"$.evaluation[0].routes[0].condition"));
        assert!(paths.contains(&"$.evaluation[0].routes[1].condition"));
    }

    #[test]
    fn screener_document_score_expressions_parsed() {
        let doc = json!({
            "$formspecScreener": "1.0",
            "evaluation": [{
                "id": "scoring",
                "strategy": "score-threshold",
                "routes": [
                    { "score": "$risk_factor * 10", "threshold": 50, "target": "urn:high" },
                    { "score": "$risk_factor * 5", "threshold": 25, "target": "urn:low" }
                ]
            }]
        });
        let result = compile_screener_expressions(&doc);

        assert!(result.diagnostics.is_empty());
        assert_eq!(result.compiled.len(), 2);
        let paths: Vec<&str> = result
            .compiled
            .iter()
            .map(|e| e.expression_path.as_str())
            .collect();
        assert!(paths.contains(&"$.evaluation[0].routes[0].score"));
        assert!(paths.contains(&"$.evaluation[0].routes[1].score"));
    }

    #[test]
    fn screener_document_active_when_parsed() {
        let doc = json!({
            "$formspecScreener": "1.0",
            "evaluation": [{
                "id": "conditional",
                "strategy": "first-match",
                "activeWhen": "$has_prior_grants",
                "routes": []
            }]
        });
        let result = compile_screener_expressions(&doc);

        assert!(result.diagnostics.is_empty());
        assert_eq!(result.compiled.len(), 1);
        assert_eq!(
            result.compiled[0].expression_path,
            "$.evaluation[0].activeWhen"
        );
    }

    #[test]
    fn screener_document_binds_parsed() {
        let doc = json!({
            "$formspecScreener": "1.0",
            "binds": [
                { "path": "income", "required": "true", "constraint": "$income >= 0" }
            ],
            "evaluation": []
        });
        let result = compile_screener_expressions(&doc);

        assert!(result.diagnostics.is_empty());
        let paths: Vec<&str> = result
            .compiled
            .iter()
            .map(|e| e.expression_path.as_str())
            .collect();
        assert!(paths.contains(&"$.binds[0].required"));
        assert!(paths.contains(&"$.binds[0].constraint"));
    }

    #[test]
    fn screener_document_invalid_condition_emits_e400() {
        let doc = json!({
            "$formspecScreener": "1.0",
            "evaluation": [{
                "id": "p1",
                "strategy": "first-match",
                "routes": [
                    { "condition": "bad ++", "target": "urn:fail" }
                ]
            }]
        });
        let result = compile_screener_expressions(&doc);

        assert_eq!(result.compiled.len(), 0);
        assert_eq!(result.diagnostics.len(), 1);
        assert_eq!(result.diagnostics[0].code, "E400");
        assert_eq!(
            result.diagnostics[0].path,
            "$.evaluation[0].routes[0].condition"
        );
    }

    #[test]
    fn screener_document_multi_phase_all_expressions_walked() {
        let doc = json!({
            "$formspecScreener": "1.0",
            "evaluation": [
                {
                    "id": "p1",
                    "strategy": "fan-out",
                    "activeWhen": "$eligible",
                    "routes": [
                        { "condition": "$a", "target": "urn:a" }
                    ]
                },
                {
                    "id": "p2",
                    "strategy": "score-threshold",
                    "routes": [
                        { "score": "$score1", "threshold": 50, "target": "urn:b" },
                        { "condition": "true", "score": "$score2", "threshold": 0, "target": "urn:c" }
                    ]
                }
            ]
        });
        let result = compile_screener_expressions(&doc);

        assert!(result.diagnostics.is_empty());
        // p1: activeWhen + 1 condition = 2
        // p2: 2 scores + 1 condition = 3
        assert_eq!(result.compiled.len(), 5);
    }
}

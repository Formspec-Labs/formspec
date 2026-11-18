//! Pass 4: Expression compilation — parses all FEL expression slots in a definition,
//! producing `CompiledExpression` structs for downstream dependency analysis (pass 5)
//! and E400 (parse error) and E406 (bare field name) diagnostics.
//!
//! `walk_*` helpers traverse binds, shapes, and variables.
#![allow(clippy::missing_docs_in_private_items)]

use fel_core::parser::SiteKind;
pub use formspec_core::definition_expressions::BindProperty;
use formspec_core::definition_expressions::{
    ExpressionSite, visit_bind_expressions, visit_expressions, visit_initial_value_expressions,
};
pub(crate) use formspec_core::definition_expressions::{ShapeMember, shape_members};
use serde_json::Value;

use crate::types::LintDiagnostic;

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
    /// Lexical target for a Shape context slot, which does not decide Shape validity.
    pub(crate) shape_context_target: Option<String>,
    /// Variable declaration computed by this expression, if any.
    pub variable: Option<VariableSlot>,
}

fn definition_owner(site: ExpressionSite<'_>) -> Owner {
    match site {
        ExpressionSite::Bind(target, property) => Owner::Bind(BindSlot {
            path: target.to_owned(),
            property,
        }),
        ExpressionSite::Shape(index, target) => Owner::Shape {
            index,
            target: target.map(str::to_owned),
        },
        ExpressionSite::ShapeContext(target) => Owner::ShapeContext(target.map(str::to_owned)),
        ExpressionSite::Variable(Some(name), scope) => Owner::Variable(VariableSlot {
            name: name.to_owned(),
            scope: scope.to_owned(),
        }),
        ExpressionSite::Variable(None, _) => Owner::None,
    }
}

/// What an expression belongs to, as recorded on [`CompiledExpression`].
enum Owner {
    /// Routes and expressions without a site.
    None,
    /// A Bind property.
    Bind(BindSlot),
    /// A validity-deciding slot of the Shape with this `target`.
    Shape {
        index: usize,
        target: Option<String>,
    },
    /// A context value evaluated at the Shape target after validation.
    ShapeContext(Option<String>),
    /// A scoped variable declaration.
    Variable(VariableSlot),
}

/// Result of compiling all FEL expression slots in a definition document.
#[derive(Debug)]
pub struct ExpressionCompilationResult {
    /// Successfully parsed expressions.
    pub compiled: Vec<CompiledExpression>,
    /// E400 for unparseable expressions and E406 for bare field names.
    pub diagnostics: Vec<LintDiagnostic>,
}

/// Walk all FEL expression slots in a definition document, parse each,
/// and return compiled expressions plus E400 and E406 diagnostics.
pub fn compile_expressions(document: &Value) -> ExpressionCompilationResult {
    let mut compiled = Vec::new();
    let mut diagnostics = Vec::new();

    visit_expressions(document, |source, location, site| {
        try_parse(
            source,
            location,
            definition_owner(site),
            &mut compiled,
            &mut diagnostics,
        );
    });

    ExpressionCompilationResult {
        compiled,
        diagnostics,
    }
}

// ── Item initialValue ───────────────────────────────────────────

/// Check Item `initialValue` expressions for parse and repeat-reference errors.
///
/// Kept out of [`compile_expressions`]: an `initialValue` is a creation seed, evaluated
/// once, so it is neither a dependency-graph vertex (Core §3.6.1) nor part of the
/// evaluation-time expression census callers such as wos-server read from `compiled`.
pub(crate) fn initial_value_diagnostics(
    document: &Value,
    items: &crate::tree::ItemTreeIndex,
) -> Vec<LintDiagnostic> {
    let mut diagnostics = Vec::new();
    visit_initial_value_expressions(document, |source, target, path| {
        if let Some(parsed) = parse_expression(source, path, &mut diagnostics) {
            crate::repeat_references::check_expression(
                items,
                Some(target),
                path,
                &parsed,
                &mut diagnostics,
            );
        }
    });
    diagnostics
}

// ── Standalone Screener Document ────────────────────────────────

/// Walk all FEL expression slots in a standalone Screener Document.
/// Paths: $.evaluation[N].routes[M].condition, $.evaluation[N].routes[M].score,
/// $.evaluation[N].activeWhen, $.binds (screener-scoped).
pub fn compile_screener_expressions(document: &Value) -> ExpressionCompilationResult {
    let mut compiled = Vec::new();
    let mut diagnostics = Vec::new();

    // Screener-scoped binds
    visit_bind_expressions(document, |source, location, site| {
        try_parse(
            source,
            location,
            definition_owner(site),
            &mut compiled,
            &mut diagnostics,
        );
    });

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
    let Some(parsed) = parse_expression(source, &expression_path, diagnostics) else {
        return;
    };
    let mut expression = CompiledExpression {
        expression: source.to_string(),
        parsed,
        expression_path,
        bind: None,
        shape_target: None,
        shape_index: None,
        shape_context_target: None,
        variable: None,
    };
    match owner {
        Owner::None => {}
        Owner::Bind(slot) => expression.bind = Some(slot),
        Owner::Shape { index, target } => {
            expression.shape_target = target;
            expression.shape_index = Some(index);
        }
        Owner::ShapeContext(target) => expression.shape_context_target = target,
        Owner::Variable(slot) => expression.variable = Some(slot),
    }
    compiled.push(expression);
}

/// Parse one FEL slot for lint: E400 when it does not parse, plus [`parse_fel`]'s E406.
pub(crate) fn parse_expression(
    source: &str,
    expression_path: &str,
    diagnostics: &mut Vec<LintDiagnostic>,
) -> Option<fel_core::Expr> {
    parse_fel(source, expression_path, diagnostics)
        .map_err(|error| diagnostics.push(parse_error(expression_path, &error)))
        .ok()
}

/// Parse FEL for lint, reporting E406 once per bare name no `let` binds: the grammar has no
/// bare field reference, though hosts read `amount` as `$amount`. Every lint FEL slot parses
/// here; the caller reports a parse error in its slot's own terms.
pub(crate) fn parse_fel(
    source: &str,
    expression_path: &str,
    diagnostics: &mut Vec<LintDiagnostic>,
) -> Result<fel_core::Expr, fel_core::Error> {
    let (parsed, sites) = fel_core::parser::parse_with_sites(source)?;
    let mut reported = Vec::new();
    for site in sites {
        if let SiteKind::UnboundName { name, .. } = site.kind
            && !reported.contains(&name)
        {
            diagnostics.push(crate::metadata::with_metadata(LintDiagnostic::error(
                crate::LintCode::E406,
                4,
                expression_path,
                format!("FEL has no bare field reference: write ${name} instead of {name}"),
            )));
            reported.push(name);
        }
    }
    Ok(parsed)
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
        assert!(
            initial_value_diagnostics(&well_formed, &crate::tree::build_item_index(&well_formed))
                .is_empty()
        );

        let broken = item("=today( +");
        let malformed = initial_value_diagnostics(&broken, &crate::tree::build_item_index(&broken));
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

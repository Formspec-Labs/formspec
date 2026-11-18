//! FEL static analysis and expression rewriting for field references and variables.
//!
//! Parses FEL to extract field references, variables, and function calls, and declares the
//! rename callbacks ([`RewriteOptions`]) that `fel_rewrite_exact` applies to authored text.
//!
//! The private walker `collect_info` implements AST traversal; the public API wraps it.
#![allow(clippy::missing_docs_in_private_items)]

use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

use fel_core::ast::{BinaryOp, Expr, PathSegment, UnaryOp};
use fel_core::extensions::FelType;
use fel_core::extensions::builtin_function_catalog;
use fel_core::{Error, extract_dependencies, parse};
use serde_json::{Value, json};
use std::ops::Range;

/// Callback that rewrites a single string reference, returning `None` to keep the original.
type RewriteFn = Box<dyn Fn(&str) -> Option<String>>;

/// Callback that rewrites a two-argument reference (e.g. navigation function + field name).
type RewriteFn2 = Box<dyn Fn(&str, &str) -> Option<String>>;

// ── Analysis result ─────────────────────────────────────────────

/// Result of statically analyzing a FEL expression.
#[derive(Debug, Clone)]
pub struct FelAnalysis {
    /// Whether the expression parsed successfully.
    pub valid: bool,
    /// Parse errors, if any.
    pub errors: Vec<FelAnalysisError>,
    /// Non-fatal warnings (arity mismatches, etc.).
    pub warnings: Vec<FelAnalysisWarning>,
    /// Field path references (e.g., `$name`, `$address.city`).
    pub references: HashSet<String>,
    /// Variable references via `@name` (excluding reserved: current, index, count, instance).
    pub variables: HashSet<String>,
    /// Function names called in the expression.
    pub functions: HashSet<String>,
}

/// A parse/analysis error with a human-readable message.
#[derive(Debug, Clone)]
pub struct FelAnalysisError {
    /// Error text from the FEL parser or evaluator.
    pub message: String,
    /// Unicode scalar (char) index range in the expression when the parser reported a span.
    pub span: Option<Range<usize>>,
}

/// A non-fatal analysis warning.
#[derive(Debug, Clone)]
pub struct FelAnalysisWarning {
    /// Warning text.
    pub message: String,
}

/// Field/variable/navigation targets that can be rewritten in a FEL expression.
#[allow(missing_docs)]
#[derive(Debug, Clone, Default)]
pub struct FelRewriteTargets {
    pub field_paths: HashSet<String>,
    pub current_paths: HashSet<String>,
    pub variables: HashSet<String>,
    pub instance_names: HashSet<String>,
    pub navigation_targets: Vec<NavigationTarget>,
}

/// A literal navigation target passed to `prev` / `next` / `parent`.
#[allow(missing_docs)]
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct NavigationTarget {
    pub function_name: String,
    pub name: String,
}

/// Analyze a FEL expression string, extracting structural information.
pub fn analyze_fel(expression: &str) -> FelAnalysis {
    match parse(expression) {
        Ok(expr) => {
            let dependencies = extract_dependencies(&expr);
            let functions = dependencies.functions().map(str::to_owned).collect();
            let variables = dependencies.context_names()
                .filter(|name| !RESERVED_CONTEXT_NAMES.contains(name))
                .map(str::to_owned).collect();
            let mut warnings = check_function_arity(&dependencies.function_calls);
            let empty_field_types: HashMap<String, String> = HashMap::new();
            check_parameter_types(&expr, &empty_field_types, &mut warnings);

            FelAnalysis {
                valid: true,
                errors: vec![],
                warnings,
                references: dependencies.fields,
                variables,
                functions,
            }
        }
        Err(Error::Parse(pe)) => FelAnalysis {
            valid: false,
            errors: vec![FelAnalysisError {
                message: pe.message,
                span: pe.span,
            }],
            warnings: vec![],
            references: HashSet::new(),
            variables: HashSet::new(),
            functions: HashSet::new(),
        },
    }
}

/// Check function call arity against the builtin catalog.
fn check_function_arity(calls: &[(String, usize)]) -> Vec<FelAnalysisWarning> {
    let catalog: HashMap<&str, (usize, Option<usize>)> = builtin_function_catalog()
        .iter()
        .map(|entry| {
            let min = entry
                .parameters
                .iter()
                .filter(|p| p.required && !p.variadic)
                .count();
            let max = if entry.parameters.iter().any(|p| p.variadic) {
                None
            } else {
                Some(entry.parameters.len())
            };
            (entry.name, (min, max))
        })
        .collect();

    let mut warnings = Vec::new();
    for (name, arg_count) in calls {
        let Some(&(min, max)) = catalog.get(name.as_str()) else {
            continue; // unknown function — no arity to check
        };
        if *arg_count < min {
            warnings.push(FelAnalysisWarning {
                message: format!("{name}() requires at least {min} arg(s), got {arg_count}"),
            });
        } else if let Some(mx) = max {
            if *arg_count > mx {
                warnings.push(FelAnalysisWarning {
                    message: format!("{name}() accepts at most {mx} arg(s), got {arg_count}"),
                });
            }
        }
    }
    warnings
}

// ── Operator type checking (ARCH-3) ────────────────────────────────────────

/// Coarse FEL type tag for comparison type-checking. Not a full type system --
/// just enough to detect known-bad operator combinations.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CoarseType {
    Number,
    String,
    Date,
    Money,
    Boolean,
    Unknown,
}

/// Built-in function name → declared return type, sourced from the FEL catalog.
///
/// Lazily materialized so the lookup is O(1) per `FunctionCall` during analysis.
/// The catalog is the single source of truth — adding a new builtin to fel-core
/// automatically widens this map.
static CATALOG_RETURNS: LazyLock<HashMap<&'static str, FelType>> = LazyLock::new(|| {
    builtin_function_catalog()
        .iter()
        .map(|e| (e.name, e.returns))
        .collect()
});

/// Map a fel-core `FelType` to this module's coarser typing taxonomy.
///
/// `CoarseType` collapses `Date`/`DateTime`/`Time` (all date-shaped) and treats
/// `Array`/`Any`/`Null` as `Unknown` (no useful comparison-time signal).
fn fel_type_to_coarse(t: FelType) -> CoarseType {
    match t {
        FelType::String => CoarseType::String,
        FelType::Number => CoarseType::Number,
        FelType::Boolean => CoarseType::Boolean,
        FelType::Date | FelType::DateTime | FelType::Time => CoarseType::Date,
        FelType::Money => CoarseType::Money,
        FelType::Array | FelType::Any | FelType::Null => CoarseType::Unknown,
    }
}

/// Infer the coarse type of an expression using field data types, literal types,
/// and known function return types. Returns `Unknown` when the type is ambiguous
/// or depends on runtime values.
fn infer_coarse_type(expr: &Expr, field_types: &HashMap<String, String>) -> CoarseType {
    match expr {
        Expr::Number(_) => CoarseType::Number,
        Expr::String(_) => CoarseType::String,
        Expr::Boolean(_) => CoarseType::Boolean,
        Expr::DateLiteral(_) | Expr::DateTimeLiteral(_) => CoarseType::Date,
        Expr::Null => CoarseType::Unknown,

        Expr::FieldRef { name, path } => {
            let mut segments = Vec::new();
            if let Some(n) = name {
                segments.push(n.clone());
            }
            for seg in path {
                match seg {
                    PathSegment::Dot(s) => segments.push(s.clone()),
                    PathSegment::Index(_) | PathSegment::Wildcard => {}
                }
            }
            let key = segments.join(".");
            match field_types.get(&key).map(|s| s.as_str()) {
                Some("date") => CoarseType::Date,
                Some("dateTime") => CoarseType::Date,
                Some("number" | "integer" | "decimal") => CoarseType::Number,
                Some("money") => CoarseType::Money,
                Some("string" | "text") => CoarseType::String,
                Some("boolean") => CoarseType::Boolean,
                _ => CoarseType::Unknown,
            }
        }

        Expr::VarRef { name, path } => {
            let mut segments = vec![name.clone()];
            for seg in path {
                match seg {
                    PathSegment::Dot(s) => segments.push(s.clone()),
                    PathSegment::Index(_) | PathSegment::Wildcard => {}
                }
            }
            let key = segments.join(".");
            match field_types.get(&key).map(|s| s.as_str()) {
                Some("date") => CoarseType::Date,
                Some("dateTime") => CoarseType::Date,
                Some("number" | "integer" | "decimal") => CoarseType::Number,
                Some("money") => CoarseType::Money,
                Some("string" | "text") => CoarseType::String,
                Some("boolean") => CoarseType::Boolean,
                _ => CoarseType::Unknown,
            }
        }

        Expr::FunctionCall { name, .. } => CATALOG_RETURNS
            .get(name.as_str())
            .copied()
            .map(fel_type_to_coarse)
            .unwrap_or(CoarseType::Unknown),

        Expr::UnaryOp {
            op: UnaryOp::Neg, ..
        } => CoarseType::Number,
        Expr::UnaryOp {
            op: UnaryOp::Not, ..
        } => CoarseType::Boolean,

        _ => CoarseType::Unknown,
    }
}

/// Check comparison operators for known-bad type combinations.
///
/// Walks the AST looking for `BinaryOp` nodes with relational or equality
/// operators, infers the coarse types of both operands, and warns on:
/// - Money vs Number (suggest `moneyAmount()`)
/// - Date vs String (suggest `date()` cast)
fn check_comparison_types(
    expr: &Expr,
    field_types: &HashMap<String, String>,
    warnings: &mut Vec<FelAnalysisWarning>,
) {
    match expr {
        Expr::BinaryOp { op, left, right } => {
            let is_comparison = matches!(
                op,
                BinaryOp::Eq
                    | BinaryOp::NotEq
                    | BinaryOp::Lt
                    | BinaryOp::Gt
                    | BinaryOp::LtEq
                    | BinaryOp::GtEq
            );

            if is_comparison {
                let left_type = infer_coarse_type(left, field_types);
                let right_type = infer_coarse_type(right, field_types);

                if left_type != CoarseType::Unknown
                    && right_type != CoarseType::Unknown
                    && left_type != right_type
                {
                    match (left_type, right_type) {
                        (CoarseType::Money, CoarseType::Number)
                        | (CoarseType::Number, CoarseType::Money) => {
                            warnings.push(FelAnalysisWarning {
                                message: "Comparing money with number: use moneyAmount() to extract the numeric amount".to_string(),
                            });
                        }
                        (CoarseType::Date, CoarseType::String)
                        | (CoarseType::String, CoarseType::Date) => {
                            warnings.push(FelAnalysisWarning {
                                message: "Comparing date with string: use date() to convert the string, or declare the field as dataType \"date\"".to_string(),
                            });
                        }
                        _ => {
                            // Other mismatches: generic warning
                            warnings.push(FelAnalysisWarning {
                                message: format!(
                                    "Type mismatch in comparison: {:?} vs {:?}",
                                    left_type, right_type
                                ),
                            });
                        }
                    }
                }
            }

            // Recurse into sub-expressions
            check_comparison_types(left, field_types, warnings);
            check_comparison_types(right, field_types, warnings);
        }
        Expr::UnaryOp { operand, .. } => {
            check_comparison_types(operand, field_types, warnings);
        }
        Expr::Ternary {
            condition,
            then_branch,
            else_branch,
        }
        | Expr::IfThenElse {
            condition,
            then_branch,
            else_branch,
        } => {
            check_comparison_types(condition, field_types, warnings);
            check_comparison_types(then_branch, field_types, warnings);
            check_comparison_types(else_branch, field_types, warnings);
        }
        Expr::FunctionCall { args, .. } => {
            for arg in args {
                check_comparison_types(arg, field_types, warnings);
            }
        }
        Expr::Membership {
            value, container, ..
        } => {
            check_comparison_types(value, field_types, warnings);
            check_comparison_types(container, field_types, warnings);
        }
        Expr::NullCoalesce { left, right }
        | Expr::RowLookup {
            source: left,
            key: right,
            ..
        } => {
            check_comparison_types(left, field_types, warnings);
            check_comparison_types(right, field_types, warnings);
        }
        Expr::LetBinding { value, body, .. } => {
            check_comparison_types(value, field_types, warnings);
            check_comparison_types(body, field_types, warnings);
        }
        Expr::Array(elems) => {
            for e in elems {
                check_comparison_types(e, field_types, warnings);
            }
        }
        Expr::Object(entries) => {
            for (_, v) in entries {
                check_comparison_types(v, field_types, warnings);
            }
        }
        Expr::PostfixAccess { expr, .. } => {
            check_comparison_types(expr, field_types, warnings);
        }
        // Leaves with no sub-expressions
        _ => {}
    }
}

/// Check each `FunctionCall` arg against its declared `fel_type` in the catalog.
///
/// Emits a warning for concrete type mismatches (both sides known, different).
/// Skips `Any` parameters, unknown inferred types, and args past a variadic param.
/// Special-cases enum-restricted string params (e.g. dateAdd/dateDiff `unit`):
/// if the arg is a string literal, validates it against `allowed_values`.
fn check_parameter_types(
    expr: &Expr,
    field_types: &HashMap<String, String>,
    warnings: &mut Vec<FelAnalysisWarning>,
) {
    match expr {
        Expr::FunctionCall { name, args } => {
            if name == "sum"
                && let Some(first) = args.first()
                && infer_coarse_type(first, field_types) == CoarseType::Money
            {
                warnings.push(FelAnalysisWarning {
                    message:
                        "FEL_SUM_OF_MONEY_PATH: sum() input appears money-typed; use moneySum()"
                            .to_string(),
                });
            }
            if name == "money"
                && let Some(first) = args.first()
                && infer_coarse_type(first, field_types) == CoarseType::Money
            {
                warnings.push(FelAnalysisWarning {
                    message:
                        "FEL_REDUNDANT_MONEY_WRAP: money() wraps an already money-typed expression"
                            .to_string(),
                });
            }

            // Look up catalog entry by name.
            if let Some(entry) = builtin_function_catalog()
                .iter()
                .find(|e| e.name == name.as_str())
            {
                // Find the index of the first variadic param (if any).
                let variadic_pos = entry.parameters.iter().position(|p| p.variadic);

                for (i, arg) in args.iter().enumerate() {
                    // Stop pairing once we hit a variadic param position.
                    if variadic_pos.is_some_and(|vp| i >= vp) {
                        // Past variadic — no per-position check possible.
                        break;
                    }

                    let Some(param) = entry.parameters.get(i) else {
                        break;
                    };

                    let pos = i + 1; // 1-based for messages

                    // Skip Any params — they accept everything.
                    if param.fel_type == FelType::Any {
                        continue;
                    }

                    // Enum-restricted string param: if arg is a literal, validate against allowed_values.
                    if param.fel_type == FelType::String
                        && let Some(allowed) = param.allowed_values
                    {
                        if let Expr::String(s) = arg
                            && !allowed.contains(&s.as_str())
                        {
                            let vals = allowed.join(", ");
                            warnings.push(FelAnalysisWarning {
                                message: format!(
                                    "{name}() arg {pos} value '{s}' not in allowed values [{vals}]"
                                ),
                            });
                        }
                        // Non-literal arg against enum param: can't statically check, skip.
                        continue;
                    }

                    // Standard coarse-type mismatch check.
                    let inferred = infer_coarse_type(arg, field_types);
                    let expected = fel_type_to_coarse(param.fel_type);

                    if expected != CoarseType::Unknown
                        && inferred != CoarseType::Unknown
                        && inferred != expected
                    {
                        let expected_str = coarse_type_name(expected);
                        let inferred_str = coarse_type_name(inferred);
                        warnings.push(FelAnalysisWarning {
                            message: format!(
                                "{name}() arg {pos} expected {expected_str}, got {inferred_str}"
                            ),
                        });
                    }
                }
            }

            // Recurse into args regardless.
            for arg in args {
                check_parameter_types(arg, field_types, warnings);
            }
        }
        Expr::BinaryOp { left, right, .. } => {
            check_parameter_types(left, field_types, warnings);
            check_parameter_types(right, field_types, warnings);
        }
        Expr::UnaryOp { operand, .. } => {
            check_parameter_types(operand, field_types, warnings);
        }
        Expr::Ternary {
            condition,
            then_branch,
            else_branch,
        }
        | Expr::IfThenElse {
            condition,
            then_branch,
            else_branch,
        } => {
            check_parameter_types(condition, field_types, warnings);
            check_parameter_types(then_branch, field_types, warnings);
            check_parameter_types(else_branch, field_types, warnings);
        }
        Expr::Membership {
            value, container, ..
        } => {
            check_parameter_types(value, field_types, warnings);
            check_parameter_types(container, field_types, warnings);
        }
        Expr::NullCoalesce { left, right }
        | Expr::RowLookup {
            source: left,
            key: right,
            ..
        } => {
            check_parameter_types(left, field_types, warnings);
            check_parameter_types(right, field_types, warnings);
        }
        Expr::LetBinding { value, body, .. } => {
            check_parameter_types(value, field_types, warnings);
            check_parameter_types(body, field_types, warnings);
        }
        Expr::Array(elems) => {
            for e in elems {
                check_parameter_types(e, field_types, warnings);
            }
        }
        Expr::Object(entries) => {
            for (_, v) in entries {
                check_parameter_types(v, field_types, warnings);
            }
        }
        Expr::PostfixAccess { expr, .. } => {
            check_parameter_types(expr, field_types, warnings);
        }
        _ => {}
    }
}

/// Lowercase display name for a `CoarseType` (used in warning messages).
fn coarse_type_name(t: CoarseType) -> &'static str {
    match t {
        CoarseType::Number => "number",
        CoarseType::String => "string",
        CoarseType::Date => "date",
        CoarseType::Money => "money",
        CoarseType::Boolean => "boolean",
        CoarseType::Unknown => "unknown",
    }
}

/// Analyze a FEL expression with field data type context for type-aware warnings.
///
/// `field_types` maps field path (e.g. "revenue") to data type (e.g. "money").
/// Produces the same output as [`analyze_fel`] plus additional warnings for
/// type-mismatched comparisons (money vs number, date vs string) and
/// type-mismatched function arguments.
pub fn analyze_fel_with_field_types(
    expression: &str,
    field_types: &HashMap<String, String>,
) -> FelAnalysis {
    let mut result = analyze_fel(expression);
    if result.valid
        && let Ok(expr) = parse(expression)
    {
        let mut type_warnings = Vec::new();
        if !field_types.is_empty() {
            check_comparison_types(&expr, field_types, &mut type_warnings);
        }
        check_parameter_types(&expr, field_types, &mut type_warnings);
        result.warnings.extend(type_warnings);
    }
    result
}

/// Extract static dependencies, returning an empty set for unparsable runtime expressions.
pub fn get_fel_dependencies(expression: &str) -> fel_core::Dependencies {
    parse(expression).map(|expr| extract_dependencies(&expr)).unwrap_or_default()
}

// ── AST walking ─────────────────────────────────────────────────

/// Context names supplied by FEL rather than Definition variable declarations.
pub const RESERVED_CONTEXT_NAMES: &[&str] = &["current", "index", "count", "instance"];

fn postfix_base(mut expr: &Expr) -> &Expr {
    while let Expr::PostfixAccess { expr: inner, .. } = expr {
        expr = inner;
    }
    expr
}

// ── Expression rewriting ────────────────────────────────────────

/// Options for rewriting references in a FEL expression.
///
/// Each callback receives the current value and returns the replacement.
/// Return `None` to keep the original.
pub struct RewriteOptions {
    /// Rewrite `$field.path` references.
    pub rewrite_field_path: Option<RewriteFn>,
    /// Rewrite the dotted tail of `@current.foo.bar`.
    pub rewrite_current_path: Option<RewriteFn>,
    /// Rewrite `@variable` names.
    pub rewrite_variable: Option<RewriteFn>,
    /// Rewrite `@instance('name')` names.
    pub rewrite_instance_name: Option<RewriteFn>,
    /// Rewrite literal field-name arguments to prev()/next()/parent().
    pub rewrite_navigation_target: Option<RewriteFn2>,
}

// ── JSON projections + rewrite map parsing (WASM / tooling) ─────

/// Static analysis result as JSON (`valid`, `errors`, `warnings`, `references`, `variables`, `functions`).
///
/// Each `errors` element is `{"message": string, "span": object | null}` with `start`/`end` character (Unicode scalar) offsets when known.
pub fn fel_analysis_to_json_value(result: &FelAnalysis) -> Value {
    json!({
        "valid": result.valid,
        "errors": result.errors.iter().map(|e| {
            json!({
                "message": e.message,
                "span": e.span.as_ref().map_or(Value::Null, |r| json!({ "start": r.start, "end": r.end }))
            })
        }).collect::<Vec<_>>(),
        "warnings": result.warnings.iter().map(|w| &w.message).collect::<Vec<_>>(),
        "references": result.references.iter().collect::<Vec<_>>(),
        "variables": result.variables.iter().collect::<Vec<_>>(),
        "functions": result.functions.iter().collect::<Vec<_>>(),
    })
}

/// [`FelRewriteTargets`] as sorted JSON (camelCase keys) for `collectFelRewriteTargets`.
pub fn fel_rewrite_targets_to_json_value(targets: &FelRewriteTargets) -> Value {
    let mut field_paths: Vec<_> = targets.field_paths.iter().cloned().collect();
    field_paths.sort();
    let mut current_paths: Vec<_> = targets.current_paths.iter().cloned().collect();
    current_paths.sort();
    let mut variables: Vec<_> = targets.variables.iter().cloned().collect();
    variables.sort();
    let mut instance_names: Vec<_> = targets.instance_names.iter().cloned().collect();
    instance_names.sort();
    let navigation_targets = targets
        .navigation_targets
        .iter()
        .map(|entry| {
            json!({
                "functionName": entry.function_name,
                "name": entry.name,
            })
        })
        .collect::<Vec<_>>();
    json!({
        "fieldPaths": field_paths,
        "currentPaths": current_paths,
        "variables": variables,
        "instanceNames": instance_names,
        "navigationTargets": navigation_targets,
    })
}

/// Build [`RewriteOptions`] from the camelCase JSON map used by `rewriteFelReferences` / `rewriteMessageTemplate`.
pub fn rewrite_options_from_camel_case_json(rewrites: &Value) -> RewriteOptions {
    let empty = serde_json::Map::new();
    let rewrites_obj = rewrites.as_object().unwrap_or(&empty);
    let field_paths = rewrites_obj.get("fieldPaths").and_then(Value::as_object);
    let current_paths = rewrites_obj.get("currentPaths").and_then(Value::as_object);
    let variables = rewrites_obj.get("variables").and_then(Value::as_object);
    let instance_names = rewrites_obj.get("instanceNames").and_then(Value::as_object);
    let navigation_targets = rewrites_obj
        .get("navigationTargets")
        .and_then(Value::as_object);

    RewriteOptions {
        rewrite_field_path: field_paths.map(|entries| {
            let map = entries.clone();
            Box::new(move |path: &str| {
                map.get(path)
                    .and_then(Value::as_str)
                    .map(|value| value.to_string())
            }) as RewriteFn
        }),
        rewrite_current_path: current_paths.map(|entries| {
            let map = entries.clone();
            Box::new(move |path: &str| {
                map.get(path)
                    .and_then(Value::as_str)
                    .map(|value| value.to_string())
            }) as RewriteFn
        }),
        rewrite_variable: variables.map(|entries| {
            let map = entries.clone();
            Box::new(move |name: &str| {
                map.get(name)
                    .and_then(Value::as_str)
                    .map(|value| value.to_string())
            }) as RewriteFn
        }),
        rewrite_instance_name: instance_names.map(|entries| {
            let map = entries.clone();
            Box::new(move |name: &str| {
                map.get(name)
                    .and_then(Value::as_str)
                    .map(|value| value.to_string())
            }) as RewriteFn
        }),
        rewrite_navigation_target: navigation_targets.map(|entries| {
            let map = entries.clone();
            Box::new(move |name: &str, fn_name: &str| {
                let key = format!("{fn_name}:{name}");
                map.get(&key)
                    .and_then(Value::as_str)
                    .map(|value| value.to_string())
            }) as RewriteFn2
        }),
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;

    #[test]
    fn test_analyze_simple_expression() {
        let result = analyze_fel("$name + 1");
        assert!(result.valid);
        assert!(result.references.contains("name"));
        assert!(result.errors.is_empty());
    }

    #[test]
    fn test_analyze_nested_references() {
        let result = analyze_fel("$address.city & ', ' & $address.state");
        assert!(result.valid);
        assert!(result.references.contains("address.city"));
        assert!(result.references.contains("address.state"));
    }

    #[test]
    fn test_analyze_variables() {
        let result = analyze_fel("@total + @subtotal");
        assert!(result.valid);
        assert!(result.variables.contains("total"));
        assert!(result.variables.contains("subtotal"));
    }

    #[test]
    fn test_analyze_reserved_context_not_variable() {
        let result = analyze_fel("@current + @index + @count");
        assert!(result.valid);
        assert!(result.variables.is_empty()); // current, index, count are reserved
    }

    #[test]
    fn test_analyze_functions() {
        let result = analyze_fel("sum($items[*].qty) + round($total, 2)");
        assert!(result.valid);
        assert!(result.functions.contains("sum"));
        assert!(result.functions.contains("round"));
    }

    #[test]
    fn test_analyze_invalid_expression() {
        let result = analyze_fel("1 + + 2");
        assert!(!result.valid);
        assert!(!result.errors.is_empty());
    }

    #[test]
    fn test_get_dependencies() {
        let refs = get_fel_dependencies("if $age >= 18 then $category else 'minor'");
        assert!(refs.fields.contains("age"));
        assert!(refs.fields.contains("category"));
    }

    #[test]
    fn test_get_dependencies_on_parse_error() {
        let refs = get_fel_dependencies("invalid ++ expr");
        assert!(refs.fields.is_empty());
    }

    #[test]
    fn test_wildcard_in_references() {
        let result = analyze_fel("sum($items[*].price)");
        assert!(result.references.contains("items[*].price"));
    }

    // ── Object and array literal analysis ────────────────────────

    /// Spec: fel-grammar.md §3.5 — "Object literal values are analyzed for references"
    #[test]
    fn analyze_object_literal() {
        let result = analyze_fel("{name: $first, addr: $city}");
        assert!(result.valid);
        assert!(result.references.contains("first"));
        assert!(result.references.contains("city"));
    }

    /// Spec: fel-grammar.md §3.4 — "Array literal elements are analyzed for references"
    #[test]
    fn analyze_array_literal() {
        let result = analyze_fel("[$a, $b, $c]");
        assert!(result.valid);
        assert!(result.references.contains("a"));
        assert!(result.references.contains("b"));
        assert!(result.references.contains("c"));
    }

    // ── PostfixAccess analysis ───────────────────────────────────

    /// Spec: fel-grammar.md §3.6 — "PostfixAccess inner expression is analyzed"
    #[test]
    fn analyze_postfix_access() {
        let result = analyze_fel("$obj.name");
        assert!(result.valid);
        // FieldRef with path segments captures the full dotted path
        assert!(
            result.references.contains("obj.name") || result.references.contains("obj"),
            "refs: {:?}",
            result.references
        );
    }

    // ── LetBinding analysis ──────────────────────────────────────

    /// Spec: fel-grammar.md §7 — "Let binding value and body are both analyzed"
    #[test]
    fn analyze_let_binding() {
        let result = analyze_fel("let total = $qty * $price in total + $tax");
        assert!(result.valid);
        assert!(
            result.references.contains("qty"),
            "refs: {:?}",
            result.references
        );
        assert!(
            result.references.contains("price"),
            "refs: {:?}",
            result.references
        );
        assert!(
            result.references.contains("tax"),
            "refs: {:?}",
            result.references
        );
    }

    // ── Membership analysis ──────────────────────────────────────

    /// Spec: fel-grammar.md §5.2 — "Membership (in/not-in) operands are analyzed"
    #[test]
    fn analyze_membership_expression() {
        let result = analyze_fel("$val in $list");
        assert!(result.valid);
        assert!(result.references.contains("val"));
        assert!(result.references.contains("list"));
    }

    // ── NullCoalesce analysis ────────────────────────────────────

    /// Spec: fel-grammar.md §5.3 — "NullCoalesce operands are analyzed"
    #[test]
    fn analyze_null_coalesce() {
        let result = analyze_fel("$primary ?? $fallback");
        assert!(result.valid);
        assert!(result.references.contains("primary"));
        assert!(result.references.contains("fallback"));
    }

    /// Spec: fel/fel-grammar.md §4-5 — PostfixAccess on a function call result.
    /// `someFunc($x).name` parses as PostfixAccess { expr: FunctionCall, path: [Dot("name")] }.
    /// The analysis should collect `$x` as a reference but NOT collect `.name`
    /// as a field reference — it's a property access on a computed result.
    #[test]
    fn test_analyze_postfix_access() {
        let result = analyze_fel("coalesce($obj, null).name");
        assert!(result.valid);
        // $obj is a field reference
        assert!(
            result.references.contains("obj"),
            "should contain 'obj', got: {:?}",
            result.references
        );
        // ".name" is postfix access on the function result, not a field reference.
        // It should NOT appear in references.
        assert!(
            !result.references.contains("name"),
            "postfix .name should not be a field reference"
        );
        // coalesce is a function call
        assert!(result.functions.contains("coalesce"));
    }

    // ── BUG-5: Arity checking at analysis time ──────────────────

    #[test]
    fn arity_too_few_args_produces_warning() {
        // sum() requires 1 arg, calling with 0 should warn
        let result = analyze_fel("sum()");
        assert!(result.valid, "expression should still parse");
        assert!(
            result
                .warnings
                .iter()
                .any(|w| w.message.contains("sum") && w.message.contains("arg")),
            "should warn about arity mismatch for sum(), got warnings: {:?}",
            result.warnings
        );
    }

    #[test]
    fn arity_too_many_args_produces_warning() {
        // abs() takes 1 arg, calling with 3 should warn
        let result = analyze_fel("abs(1, 2, 3)");
        assert!(result.valid, "expression should still parse");
        assert!(
            result
                .warnings
                .iter()
                .any(|w| w.message.contains("abs") && w.message.contains("arg")),
            "should warn about arity mismatch for abs(), got warnings: {:?}",
            result.warnings
        );
    }

    #[test]
    fn arity_correct_args_no_warning() {
        let result = analyze_fel("sum($items[*].qty) + round($total, 2)");
        assert!(result.valid);
        assert!(
            result.warnings.is_empty(),
            "correct arity should produce no warnings, got: {:?}",
            result.warnings
        );
    }

    #[test]
    fn arity_optional_param_accepted() {
        // round(number, number?) — both 1 and 2 args should be fine
        let result1 = analyze_fel("round(1)");
        assert!(
            !result1.warnings.iter().any(|w| w.message.contains("round")),
            "round with 1 arg should not warn"
        );
        let result2 = analyze_fel("round(1, 2)");
        assert!(
            !result2.warnings.iter().any(|w| w.message.contains("round")),
            "round with 2 args should not warn"
        );
    }

    #[test]
    fn arity_variadic_accepts_many() {
        // coalesce(...any) — any number of args >= 1
        let result = analyze_fel("coalesce(1, 2, 3, 4, 5)");
        assert!(
            !result
                .warnings
                .iter()
                .any(|w| w.message.contains("coalesce")),
            "coalesce is variadic, should not warn"
        );
    }

    #[test]
    fn arity_zero_param_function_warns_on_args() {
        // today() takes 0 args
        let result = analyze_fel("today(1)");
        assert!(result.valid);
        assert!(
            result
                .warnings
                .iter()
                .any(|w| w.message.contains("today") && w.message.contains("arg")),
            "today with args should warn, got: {:?}",
            result.warnings
        );
    }

    #[test]
    fn arity_unknown_function_no_arity_warning() {
        // Unknown functions can't have arity checked — only report "unknown function"
        let result = analyze_fel("myCustomFunc(1, 2)");
        assert!(
            !result.warnings.iter().any(|w| w.message.contains("arg")),
            "unknown function should not get arity warnings"
        );
    }

    // ── ARCH-3: Operator type checking ────────────────────────────────────

    #[test]
    fn type_check_money_vs_number_warns() {
        let mut field_types = HashMap::new();
        field_types.insert("revenue".to_string(), "money".to_string());

        let result = analyze_fel_with_field_types("$revenue > 0", &field_types);
        assert!(result.valid);
        assert!(
            result
                .warnings
                .iter()
                .any(|w| w.message.contains("moneyAmount")),
            "should warn about money vs number comparison, got: {:?}",
            result.warnings
        );
    }

    #[test]
    fn type_check_money_amount_no_warning() {
        let mut field_types = HashMap::new();
        field_types.insert("revenue".to_string(), "money".to_string());

        let result = analyze_fel_with_field_types("moneyAmount($revenue) > 0", &field_types);
        assert!(result.valid);
        let type_warnings: Vec<_> = result
            .warnings
            .iter()
            .filter(|w| w.message.contains("money") || w.message.contains("Money"))
            .collect();
        assert!(
            type_warnings.is_empty(),
            "moneyAmount() extracts number, no type warning expected, got: {:?}",
            type_warnings
        );
    }

    #[test]
    fn type_check_date_vs_string_warns() {
        // When a string-typed field is compared with today(), should warn
        let mut field_types = HashMap::new();
        field_types.insert("deadline".to_string(), "string".to_string());

        let result = analyze_fel_with_field_types("$deadline >= today()", &field_types);
        assert!(result.valid);
        assert!(
            result.warnings.iter().any(|w| w.message.contains("date")),
            "should warn about string vs date comparison, got: {:?}",
            result.warnings
        );
    }

    #[test]
    fn type_check_date_vs_date_no_warning() {
        // When a date-typed field is compared with today(), no warning
        let mut field_types = HashMap::new();
        field_types.insert("deadline".to_string(), "date".to_string());

        let result = analyze_fel_with_field_types("$deadline >= today()", &field_types);
        assert!(result.valid);
        let type_warnings: Vec<_> = result
            .warnings
            .iter()
            .filter(|w| {
                w.message.contains("date")
                    || w.message.contains("Date")
                    || w.message.contains("string")
                    || w.message.contains("String")
            })
            .collect();
        assert!(
            type_warnings.is_empty(),
            "date vs date should not warn, got: {:?}",
            type_warnings
        );
    }

    #[test]
    fn type_check_no_field_types_no_warning() {
        // Without field type context, no type warnings
        let result = analyze_fel_with_field_types("$revenue > 0", &HashMap::new());
        assert!(result.valid);
        let type_warnings: Vec<_> = result
            .warnings
            .iter()
            .filter(|w| w.message.contains("money") || w.message.contains("date"))
            .collect();
        assert!(
            type_warnings.is_empty(),
            "without field types, no type warnings expected"
        );
    }

    #[test]
    fn type_check_number_vs_number_no_warning() {
        let mut field_types = HashMap::new();
        field_types.insert("age".to_string(), "number".to_string());

        let result = analyze_fel_with_field_types("$age >= 18", &field_types);
        assert!(result.valid);
        let type_warnings: Vec<_> = result
            .warnings
            .iter()
            .filter(|w| {
                w.message.contains("mismatch")
                    || w.message.contains("money")
                    || w.message.contains("date")
            })
            .collect();
        assert!(type_warnings.is_empty(), "number vs number should not warn");
    }

    #[test]
    fn type_check_nested_comparison_in_if() {
        let mut field_types = HashMap::new();
        field_types.insert("balance".to_string(), "money".to_string());

        let result = analyze_fel_with_field_types(
            "if($balance > 0, \"positive\", \"negative\")",
            &field_types,
        );
        assert!(result.valid);
        assert!(
            result
                .warnings
                .iter()
                .any(|w| w.message.contains("moneyAmount")),
            "should detect money vs number in nested if() comparison, got: {:?}",
            result.warnings
        );
    }

    // ── Parameter type checking ───────────────────────────────────────────────

    /// `length(42)` — arg 1 expects String, got Number.
    #[test]
    fn param_type_mismatch_concrete_int_for_string() {
        let result = analyze_fel("length(42)");
        assert!(result.valid);
        assert!(
            result.warnings.iter().any(|w| w.message.contains("length")
                && w.message.contains("arg 1")
                && w.message.contains("string")
                && w.message.contains("number")),
            "expected type mismatch warning for length(42), got: {:?}",
            result.warnings
        );
    }

    /// `dateAdd("not-a-date", 1, "days")` — arg 1 expects Date, got String.
    #[test]
    fn param_type_mismatch_string_for_date() {
        let result = analyze_fel("dateAdd(\"not-a-date\", 1, \"days\")");
        assert!(result.valid);
        assert!(
            result.warnings.iter().any(|w| w.message.contains("dateAdd")
                && w.message.contains("arg 1")
                && w.message.contains("date")
                && w.message.contains("string")),
            "expected date/string mismatch for dateAdd arg 1, got: {:?}",
            result.warnings
        );
    }

    /// `coalesce("a", 42)` — variadic Any param: no type warnings.
    #[test]
    fn param_type_any_arg_skipped() {
        let result = analyze_fel("coalesce(\"a\", 42)");
        assert!(result.valid);
        let type_warnings: Vec<_> = result
            .warnings
            .iter()
            .filter(|w| w.message.contains("coalesce") && w.message.contains("arg"))
            .collect();
        assert!(
            type_warnings.is_empty(),
            "coalesce Any param should not warn, got: {:?}",
            type_warnings
        );
    }

    /// `format("{0}={1}", 1, "x", true)` — only template (arg 1 = String) checked; past
    /// variadic, no per-position checks.
    #[test]
    fn param_variadic_stops_pairing() {
        // arg 1 is template (String) — literal "pattern" is fine, no mismatch.
        // args 2+ are variadic Any — no checks.
        let result = analyze_fel("format(\"{0}={1}\", 1, \"x\", true)");
        assert!(result.valid);
        let type_warnings: Vec<_> = result
            .warnings
            .iter()
            .filter(|w| w.message.contains("format") && w.message.contains("arg"))
            .collect();
        assert!(
            type_warnings.is_empty(),
            "format variadic args should not warn, got: {:?}",
            type_warnings
        );
    }

    /// `dateAdd(d, 1, "weeks")` — enum mismatch: 'weeks' not in [days, months, years].
    #[test]
    fn param_enum_invalid_literal() {
        // Use a date field so arg 1 (date) is Unknown (field ref with no types), still arg 3 should be caught.
        let result = analyze_fel("dateAdd(today(), 1, \"weeks\")");
        assert!(result.valid);
        assert!(
            result.warnings.iter().any(|w| w.message.contains("dateAdd")
                && w.message.contains("arg 3")
                && w.message.contains("weeks")
                && w.message.contains("not in allowed values")),
            "expected enum invalid literal warning, got: {:?}",
            result.warnings
        );
    }

    /// `dateAdd(today(), 1, $unit)` — enum param with non-literal arg: skip.
    #[test]
    fn param_enum_dynamic_arg_skipped() {
        // $unit is a FieldRef — can't statically check against enum.
        let result = analyze_fel("dateAdd(today(), 1, $unit)");
        assert!(result.valid);
        let enum_warnings: Vec<_> = result
            .warnings
            .iter()
            .filter(|w| w.message.contains("not in allowed values"))
            .collect();
        assert!(
            enum_warnings.is_empty(),
            "dynamic arg should not trigger enum check, got: {:?}",
            enum_warnings
        );
    }

    /// `length($someField)` with no field_types entry: Unknown inferred type, no warning.
    #[test]
    fn param_unknown_inferred_skipped() {
        // $someField has Unknown coarse type without a field_types map entry.
        let result = analyze_fel("length($someField)");
        assert!(result.valid);
        let type_warnings: Vec<_> = result
            .warnings
            .iter()
            .filter(|w| w.message.contains("length") && w.message.contains("arg"))
            .collect();
        assert!(
            type_warnings.is_empty(),
            "unknown inferred type should not warn, got: {:?}",
            type_warnings
        );
    }

    /// `length(power("abc", 2))` — warns for BOTH power arg 1 (String for Number)
    /// AND length arg 1 (Number return from power, for String param).
    #[test]
    fn nested_function_call_arg_checked() {
        let result = analyze_fel("length(power(\"abc\", 2))");
        assert!(result.valid);
        // power() arg 1 expects Number, got String
        assert!(
            result.warnings.iter().any(|w| w.message.contains("power")
                && w.message.contains("arg 1")
                && w.message.contains("number")
                && w.message.contains("string")),
            "expected power arg1 type warning, got: {:?}",
            result.warnings
        );
        // length() arg 1 expects String, got Number (power returns Number)
        assert!(
            result.warnings.iter().any(|w| w.message.contains("length")
                && w.message.contains("arg 1")
                && w.message.contains("string")
                && w.message.contains("number")),
            "expected length arg1 type warning from power return, got: {:?}",
            result.warnings
        );
    }

    /// `power(2, 10)` — both Number args: no type warning.
    #[test]
    fn valid_call_no_warning() {
        let result = analyze_fel("power(2, 10)");
        assert!(result.valid);
        let type_warnings: Vec<_> = result
            .warnings
            .iter()
            .filter(|w| w.message.contains("arg"))
            .collect();
        assert!(
            type_warnings.is_empty(),
            "power(2,10) should produce no type warnings, got: {:?}",
            type_warnings
        );
    }

    /// `if(cond, then, else)`: only cond (Boolean) is checked; then/else are Any.
    #[test]
    fn param_if_only_cond_checked() {
        // Condition is a Number literal — should warn about Boolean expected.
        let result = analyze_fel("if(42, \"yes\", \"no\")");
        assert!(result.valid);
        assert!(
            result.warnings.iter().any(|w| w.message.contains("if")
                && w.message.contains("arg 1")
                && w.message.contains("boolean")
                && w.message.contains("number")),
            "if() should warn when cond is not Boolean, got: {:?}",
            result.warnings
        );
        // then/else are Any — no extra warnings from those
        let then_else_warn: Vec<_> = result
            .warnings
            .iter()
            .filter(|w| {
                w.message.contains("if")
                    && (w.message.contains("arg 2") || w.message.contains("arg 3"))
            })
            .collect();
        assert!(
            then_else_warn.is_empty(),
            "then/else (Any) should not warn, got: {:?}",
            then_else_warn
        );
    }

    /// `selected(42, "active")` — value is Any, option is String: only option warns if wrong type.
    #[test]
    fn param_selected_any_value_string_option() {
        // option is a String literal — no type mismatch.
        let result = analyze_fel("selected(42, \"active\")");
        assert!(result.valid);
        // No warning expected: value is Any (skip), option is String literal (ok).
        let type_warnings: Vec<_> = result
            .warnings
            .iter()
            .filter(|w| w.message.contains("selected") && w.message.contains("arg"))
            .collect();
        assert!(
            type_warnings.is_empty(),
            "selected(42, string) should not warn, got: {:?}",
            type_warnings
        );
        // But if option is a number literal, it should warn.
        let result2 = analyze_fel("selected($field, 42)");
        assert!(result2.valid);
        assert!(
            result2
                .warnings
                .iter()
                .any(|w| w.message.contains("selected")
                    && w.message.contains("arg 2")
                    && w.message.contains("string")
                    && w.message.contains("number")),
            "selected($field, 42) should warn about number for String option, got: {:?}",
            result2.warnings
        );
    }

    /// `dateDiff` also has enum-restricted unit: 'weeks' triggers warning.
    #[test]
    fn param_date_diff_enum_invalid() {
        let result = analyze_fel("dateDiff(today(), today(), \"weeks\")");
        assert!(result.valid);
        assert!(
            result
                .warnings
                .iter()
                .any(|w| w.message.contains("dateDiff")
                    && w.message.contains("arg 3")
                    && w.message.contains("weeks")
                    && w.message.contains("not in allowed values")),
            "expected dateDiff enum warning, got: {:?}",
            result.warnings
        );
    }

    /// `time("a", "b", "c")` — all three params are Number; String args warn.
    #[test]
    fn param_time_string_for_number() {
        let result = analyze_fel("time(\"a\", \"b\", \"c\")");
        assert!(result.valid);
        assert!(
            result
                .warnings
                .iter()
                .any(|w| w.message.contains("time") && w.message.contains("arg 1")),
            "time arg 1 should warn, got: {:?}",
            result.warnings
        );
        assert!(
            result
                .warnings
                .iter()
                .any(|w| w.message.contains("time") && w.message.contains("arg 2")),
            "time arg 2 should warn, got: {:?}",
            result.warnings
        );
        assert!(
            result
                .warnings
                .iter()
                .any(|w| w.message.contains("time") && w.message.contains("arg 3")),
            "time arg 3 should warn, got: {:?}",
            result.warnings
        );
    }

    /// field_types path: `length($name)` where $name is "string" → Unknown for length arg (string matches) → no warn.
    #[test]
    fn param_type_check_with_field_types_correct() {
        let mut field_types = HashMap::new();
        field_types.insert("name".to_string(), "string".to_string());
        let result = analyze_fel_with_field_types("length($name)", &field_types);
        assert!(result.valid);
        let type_warnings: Vec<_> = result
            .warnings
            .iter()
            .filter(|w| w.message.contains("length") && w.message.contains("arg"))
            .collect();
        assert!(
            type_warnings.is_empty(),
            "length($name:string) should not warn, got: {:?}",
            type_warnings
        );
    }

    /// field_types path: `length($count)` where $count is "number" → warns.
    #[test]
    fn param_type_check_with_field_types_mismatch() {
        let mut field_types = HashMap::new();
        field_types.insert("count".to_string(), "number".to_string());
        let result = analyze_fel_with_field_types("length($count)", &field_types);
        assert!(result.valid);
        assert!(
            result.warnings.iter().any(|w| w.message.contains("length")
                && w.message.contains("arg 1")
                && w.message.contains("string")
                && w.message.contains("number")),
            "length($count:number) should warn, got: {:?}",
            result.warnings
        );
    }
}

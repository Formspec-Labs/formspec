//! FEL evaluation, analysis, and path utilities (`wasm_bindgen`). `fel-authoring` adds parse/tokenize/print/rewrites/catalog.
//!
//! ## `*_inner` test-seam pattern
//!
//! Public `#[wasm_bindgen]` entrypoints return `Result<String, JsError>` so JS callers see
//! thrown errors. Behavior lives in `pub(crate) fn *_inner(...) -> Result<String, String>`
//! siblings, which native `cargo nextest` tests in [`crate::wasm_tests`] can drive without
//! linking the `wasm-bindgen` runtime. The wrappers only wrap `String` → `JsError`.

use std::cell::Cell;

use fel_core::{
    EvaluatorOptions, Trace, evaluate, evaluate_with, expr_is_interpolation_static_literal,
    fel_diagnostics_to_json_value, fel_to_ui_json, field_map_from_json_str,
    formspec_environment_from_json_map, has_error_diagnostics, host_options_from_json, parse,
    prepare, reject_undefined_functions,
};
#[cfg(feature = "fel-authoring")]
use fel_core::{
    builtin_function_catalog_json_value, dependencies_to_json_value, extract_dependencies,
    print_expr, tokenize_to_json_value,
};
#[cfg(feature = "fel-authoring")]
use formspec_core::try_lift_condition_group;
use formspec_core::{
    JsonWireStyle, analyze_fel, analyze_fel_with_field_types,
    definition_item_location_to_json_value, fel_analysis_to_json_value, get_fel_dependencies,
    json_definition_item_at_path, normalize_indexed_path,
};
#[cfg(feature = "fel-authoring")]
use formspec_core::{
    assembly_fel_rewrite_map_from_value, collect_fel_rewrite_targets,
    fel_rewrite_targets_to_json_value, rewrite_fel_for_assembly, rewrite_fel_source_references,
    rewrite_message_template, rewrite_options_from_camel_case_json,
};
use serde_json::Value;
use wasm_bindgen::prelude::*;

use crate::json_host::{parse_json_as, parse_value_str, to_json_string};

fn parse_fel_source(expression: &str) -> Result<fel_core::Expr, String> {
    parse(expression).map_err(|e| e.to_string())
}

/// Whether the expression is an interpolation static literal (locale spec §3.3.1).
#[wasm_bindgen(js_name = "felExprIsInterpolationStaticLiteral")]
pub fn fel_expr_is_interpolation_static_literal(expression: &str) -> bool {
    parse(expression)
        .map(|ast| expr_is_interpolation_static_literal(&ast))
        .unwrap_or(false)
}

// ── Diagnostic side-channel for interpolation rule 2 ────────────
//
// Locale §3.3.1 rule 2: if FEL evaluation records error-severity diagnostics,
// the interpolation is treated as failed even if a value was produced.
// The TS `interpolateMessage` receives an opaque evaluator callback and cannot
// inspect diagnostics directly. This thread-local flag lets the TS side check
// *after* evaluation whether error diagnostics were recorded.
// Safe because WASM is single-threaded.
thread_local! {
    static LAST_EVAL_HAD_ERROR_DIAGNOSTICS: Cell<bool> = const { Cell::new(false) };
}

/// Read and reset the error-diagnostics flag. Returns `true` if the most
/// recent `evalFEL` / `evalFELWithContext` call recorded error-severity
/// diagnostics. The flag is reset to `false` after reading.
#[wasm_bindgen(js_name = "consumeLastEvalErrorDiagnostics")]
pub fn consume_last_eval_error_diagnostics() -> bool {
    LAST_EVAL_HAD_ERROR_DIAGNOSTICS.with(|c| {
        let had = c.get();
        c.set(false);
        had
    })
}

// ── FEL Evaluation ──────────────────────────────────────────────

/// Parse and evaluate a FEL expression with optional field values (JSON object).
/// Returns the result as a JSON string.
#[wasm_bindgen(js_name = "evalFEL")]
pub fn eval_fel(expression: &str, fields_json: &str) -> Result<String, JsError> {
    eval_fel_inner(expression, fields_json).map_err(|e| JsError::new(&e))
}

pub(crate) fn eval_fel_inner(expression: &str, fields_json: &str) -> Result<String, String> {
    let expr = parse_fel_source(expression)?;
    let fields = field_map_from_json_str(fields_json)?;
    let env = fel_core::MapEnvironment::with_fields(fields);
    let result = evaluate(&expr, &env);
    LAST_EVAL_HAD_ERROR_DIAGNOSTICS.with(|c| c.set(has_error_diagnostics(&result.diagnostics)));
    let json = fel_to_ui_json(&result.value);
    to_json_string(&json)
}

/// Evaluate a FEL expression with a structured trace of evaluation steps.
///
/// Returns a JSON string of shape `{ "value": ..., "diagnostics": [...], "trace": [TraceStep, ...] }`.
/// TraceStep is the tagged union from [`fel_core::TraceStep`] (`kind` = `"FieldResolved"`,
/// `"FunctionCalled"`, `"BinaryOp"`, `"IfBranch"`, `"ShortCircuit"`).
#[wasm_bindgen(js_name = "evalFELWithTrace")]
pub fn eval_fel_with_trace(expression: &str, fields_json: &str) -> Result<String, JsError> {
    eval_fel_with_trace_inner(expression, fields_json).map_err(|e| JsError::new(&e))
}

pub(crate) fn eval_fel_with_trace_inner(
    expression: &str,
    fields_json: &str,
) -> Result<String, String> {
    let expr = parse_fel_source(expression)?;
    let fields = field_map_from_json_str(fields_json)?;
    let env = fel_core::MapEnvironment::with_fields(fields);
    let mut trace = Trace::new();
    let result = evaluate_with(
        &expr,
        &env,
        EvaluatorOptions {
            trace: Some(&mut trace),
            ..EvaluatorOptions::default()
        },
    );
    LAST_EVAL_HAD_ERROR_DIAGNOSTICS.with(|c| c.set(has_error_diagnostics(&result.diagnostics)));
    let payload = serde_json::json!({
        "value": fel_to_ui_json(&result.value),
        "diagnostics": fel_diagnostics_to_json_value(&result.diagnostics),
        "trace": trace.steps,
    });
    to_json_string(&payload)
}

/// Evaluate a FEL expression with full FormspecEnvironment context.
/// `context_json` is a JSON object: { fields, variables?, mipStates?, repeatContext? }
#[wasm_bindgen(js_name = "evalFELWithContext")]
pub fn eval_fel_with_context(expression: &str, context_json: &str) -> Result<String, JsError> {
    eval_fel_with_context_inner(expression, context_json).map_err(|e| JsError::new(&e))
}

pub(crate) fn eval_fel_with_context_inner(
    expression: &str,
    context_json: &str,
) -> Result<String, String> {
    let expr = parse_fel_source(expression)?;
    let ctx: Value = parse_value_str(context_json, "context JSON")?;
    let ctx_obj = ctx.as_object().ok_or("context must be a JSON object")?;
    let env = formspec_environment_from_json_map(ctx_obj);
    let result = evaluate(&expr, &env);
    LAST_EVAL_HAD_ERROR_DIAGNOSTICS.with(|c| c.set(has_error_diagnostics(&result.diagnostics)));
    reject_undefined_functions(&result.diagnostics)?;
    let json = fel_to_ui_json(&result.value);
    to_json_string(&json)
}

/// Parse a FEL expression and return whether it's valid.
#[cfg(feature = "fel-authoring")]
#[wasm_bindgen(js_name = "parseFEL")]
pub fn parse_fel(expression: &str) -> bool {
    parse(expression).is_ok()
}

#[cfg(feature = "fel-authoring")]
#[wasm_bindgen(js_name = "tokenizeFEL")]
pub fn tokenize_fel(expression: &str) -> Result<String, JsError> {
    tokenize_fel_inner(expression).map_err(|e| JsError::new(&e))
}

#[cfg(feature = "fel-authoring")]
pub(crate) fn tokenize_fel_inner(expression: &str) -> Result<String, String> {
    let json = tokenize_to_json_value(expression)?;
    to_json_string(&json)
}

/// Print a FEL expression AST back to normalized source string.
#[cfg(feature = "fel-authoring")]
#[wasm_bindgen(js_name = "printFEL")]
pub fn print_fel(expression: &str) -> Result<String, JsError> {
    let expr = parse_fel_source(expression).map_err(|e| JsError::new(&e))?;
    Ok(print_expr(&expr))
}

/// Try to lift a FEL expression into Studio `ConditionGroup` JSON (`lifted` / `unlifted`).
#[cfg(feature = "fel-authoring")]
#[wasm_bindgen(js_name = "tryLiftConditionGroup")]
pub fn try_lift_condition_group_wasm(expression: &str) -> Result<String, JsError> {
    let json = try_lift_condition_group(expression);
    to_json_string(&json).map_err(|e| JsError::new(&e))
}

/// Extract field dependencies from a FEL expression.
#[wasm_bindgen(js_name = "getFELDependencies")]
pub fn get_fel_deps(expression: &str) -> Result<String, JsError> {
    let deps = get_fel_dependencies(expression);
    let arr: Vec<&str> = deps.iter().map(|s| s.as_str()).collect();
    to_json_string(&arr).map_err(|e| JsError::new(&e))
}

/// Extract full dependency info from a FEL expression.
#[cfg(feature = "fel-authoring")]
#[wasm_bindgen(js_name = "extractDependencies")]
pub fn extract_deps(expression: &str) -> Result<String, JsError> {
    let expr = parse_fel_source(expression).map_err(|e| JsError::new(&e))?;
    let deps = extract_dependencies(&expr);
    let json = dependencies_to_json_value(&deps);
    to_json_string(&json).map_err(|e| JsError::new(&e))
}

// ── FEL Analysis ────────────────────────────────────────────────

#[wasm_bindgen(js_name = "analyzeFEL")]
pub fn analyze_fel_wasm(expression: &str) -> Result<String, JsError> {
    let result = analyze_fel(expression);
    let json = fel_analysis_to_json_value(&result);
    to_json_string(&json).map_err(|e| JsError::new(&e))
}

/// Analyze a FEL expression with field data type context for type-mismatch warnings.
///
/// `field_types_json` is a JSON object mapping field paths to data type strings,
/// e.g. `{"revenue": "money", "age": "number"}`.
#[wasm_bindgen(js_name = "analyzeFELWithFieldTypes")]
pub fn analyze_fel_with_field_types_wasm(
    expression: &str,
    field_types_json: &str,
) -> Result<String, JsError> {
    analyze_fel_with_field_types_inner(expression, field_types_json).map_err(|e| JsError::new(&e))
}

fn analyze_fel_with_field_types_inner(
    expression: &str,
    field_types_json: &str,
) -> Result<String, String> {
    let val: Value = parse_value_str(field_types_json, "field types JSON")?;
    let obj = val
        .as_object()
        .ok_or("field_types_json must be a JSON object")?;
    let field_types: std::collections::HashMap<String, String> = obj
        .iter()
        .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_owned())))
        .collect();
    let result = analyze_fel_with_field_types(expression, &field_types);
    let json = fel_analysis_to_json_value(&result);
    to_json_string(&json)
}

#[cfg(feature = "fel-authoring")]
#[wasm_bindgen(js_name = "collectFELRewriteTargets")]
pub fn collect_fel_rewrite_targets_wasm(expression: &str) -> Result<String, JsError> {
    let targets = collect_fel_rewrite_targets(expression);
    let json = fel_rewrite_targets_to_json_value(&targets);
    to_json_string(&json).map_err(|e| JsError::new(&e))
}

#[cfg(feature = "fel-authoring")]
#[wasm_bindgen(js_name = "rewriteFELReferences")]
pub fn rewrite_fel_references_wasm(
    expression: &str,
    rewrites_json: &str,
) -> Result<String, JsError> {
    let rewrites: Value =
        parse_value_str(rewrites_json, "rewrites JSON").map_err(|e| JsError::new(&e))?;
    let options = rewrite_options_from_camel_case_json(&rewrites);
    Ok(rewrite_fel_source_references(expression, &options))
}

#[cfg(feature = "fel-authoring")]
#[wasm_bindgen(js_name = "rewriteMessageTemplate")]
pub fn rewrite_message_template_wasm(
    message: &str,
    rewrites_json: &str,
) -> Result<String, JsError> {
    let rewrites: Value =
        parse_value_str(rewrites_json, "rewrites JSON").map_err(|e| JsError::new(&e))?;
    let options = rewrite_options_from_camel_case_json(&rewrites);
    Ok(rewrite_message_template(message, &options))
}

#[cfg(feature = "fel-authoring")]
pub(crate) fn rewrite_fel_for_assembly_inner(
    expression: &str,
    map_json: &str,
) -> Result<String, String> {
    let map_value: Value = parse_value_str(map_json, "assembly rewrite map JSON")?;
    let map = assembly_fel_rewrite_map_from_value(&map_value)?;
    Ok(rewrite_fel_for_assembly(expression, &map))
}

/// Rewrite FEL using assembly `RewriteMap` JSON (`fragmentRootKey`, `hostGroupKey`, `importedKeys`, `keyPrefix`).
#[cfg(feature = "fel-authoring")]
#[wasm_bindgen(js_name = "rewriteFelForAssembly")]
pub fn rewrite_fel_for_assembly_wasm(expression: &str, map_json: &str) -> Result<String, JsError> {
    rewrite_fel_for_assembly_inner(expression, map_json).map_err(|e| JsError::new(&e))
}

#[cfg(feature = "fel-authoring")]
#[wasm_bindgen(js_name = "listBuiltinFunctions")]
pub fn list_builtin_functions() -> Result<String, JsError> {
    let json = builtin_function_catalog_json_value();
    to_json_string(&json).map_err(|e| JsError::new(&e))
}

/// Normalize FEL source for host evaluation (bare `$`, repeat qualifiers, repeat aliases).
/// `options_json`: `{ expression, currentItemPath?, replaceSelfRef?, repeatCounts?, valuesByPath? | fieldPaths? }`.
#[wasm_bindgen(js_name = "prepareFelExpression")]
pub fn prepare_expression_wasm(options_json: &str) -> Result<String, JsError> {
    prepare_expression_inner(options_json).map_err(|e| JsError::new(&e))
}

pub(crate) fn prepare_expression_inner(options_json: &str) -> Result<String, String> {
    let v: Value = parse_value_str(options_json, "prepareFelExpression options JSON")?;
    let obj = v
        .as_object()
        .ok_or("prepareFelExpression options must be a JSON object")?;
    let owned = host_options_from_json(obj)?;
    Ok(prepare(&owned))
}

// ── Path Utils ──────────────────────────────────────────────────

#[wasm_bindgen(js_name = "normalizeIndexedPath")]
pub fn normalize_path(path: &str) -> String {
    normalize_indexed_path(path)
}

#[wasm_bindgen(js_name = "itemAtPath")]
pub fn item_at_path_wasm(items_json: &str, path: &str) -> Result<String, JsError> {
    let items: Vec<Value> =
        parse_json_as(items_json, "items JSON").map_err(|e| JsError::new(&e))?;
    let json = json_definition_item_at_path(&items, path)
        .cloned()
        .unwrap_or(Value::Null);
    to_json_string(&json).map_err(|e| JsError::new(&e))
}

#[wasm_bindgen(js_name = "itemLocationAtPath")]
pub fn item_location_at_path_wasm(items_json: &str, path: &str) -> Result<String, JsError> {
    let items: Vec<Value> =
        parse_json_as(items_json, "items JSON").map_err(|e| JsError::new(&e))?;
    let json = definition_item_location_to_json_value(&items, path, JsonWireStyle::JsCamel);
    to_json_string(&json).map_err(|e| JsError::new(&e))
}

/// Check if a string is a valid FEL identifier.
#[wasm_bindgen(js_name = "isValidFelIdentifier")]
pub fn is_valid_fel_identifier_wasm(s: &str) -> bool {
    fel_core::is_valid_fel_identifier(s)
}

/// Sanitize a string into a valid FEL identifier.
#[wasm_bindgen(js_name = "sanitizeFelIdentifier")]
pub fn sanitize_fel_identifier_wasm(s: &str) -> String {
    fel_core::sanitize_fel_identifier(s)
}

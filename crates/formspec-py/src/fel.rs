//! FEL evaluation, parse, and dependency PyO3 bindings.

use std::collections::HashMap;

use pyo3::prelude::*;
use pyo3::types::PyDict;

use fel_core::{
    EvaluatorOptions, JsonWireStyle, MapEnvironment, Trace, builtin_function_catalog_json_value,
    dependencies_to_json_value_styled, evaluate, evaluate_with, extract_dependencies,
    fel_diagnostics_to_json_value, host_options_from_json, parse, prepare,
};
use formspec_core::{
    analyze_fel, assembly_fel_rewrite_map_from_value, fel_analysis_to_json_value,
    get_fel_dependencies, rewrite_fel_for_assembly as rewrite_fel_for_assembly_core,
};
use serde_json::Value;

use crate::PyObject;
use crate::convert::{
    build_formspec_env, depythonize_json, fel_to_python, fel_to_python_tagged, json_to_python,
    normalize_wire_json_for_python, parse_fel_expr, pydict_to_field_map,
};

// ── FEL Evaluation ──────────────────────────────────────────────

/// Parse and evaluate a FEL expression with optional field values.
///
/// Args:
///     expression: FEL expression string
///     fields: Optional dict of field name → value
///
/// Returns:
///     The evaluated result as a Python value (None, bool, int, float, str, list, dict)
#[pyfunction]
pub fn eval_fel(
    py: Python,
    expression: &str,
    fields: Option<&Bound<'_, PyDict>>,
) -> PyResult<PyObject> {
    let expr = parse_fel_expr(expression)?;

    let field_map = match fields {
        Some(dict) => pydict_to_field_map(py, dict)?,
        None => HashMap::new(),
    };

    let env = MapEnvironment::with_fields(field_map);
    let result = evaluate(&expr, &env);

    fel_to_python(py, &result.value)
}

/// Parse and evaluate a FEL expression, returning a structured trace of evaluation steps.
///
/// Args:
///     expression: FEL expression string
///     fields: Optional dict of field name → value
///
/// Returns:
///     A dict with: value, diagnostics, trace. Each trace step is a dict with a
///     PascalCase `kind` tag (`FieldResolved`, `FunctionCalled`, `BinaryOp`,
///     `IfBranch`, `ShortCircuit`) and per-kind payload fields. Values in the
///     trace are raw JSON-like Python (no type tagging) — the trace is for
///     human/LLM consumption, not re-evaluation.
#[pyfunction]
pub fn eval_fel_with_trace(
    py: Python,
    expression: &str,
    fields: Option<&Bound<'_, PyDict>>,
) -> PyResult<PyObject> {
    let expr = parse_fel_expr(expression)?;

    let field_map = match fields {
        Some(dict) => pydict_to_field_map(py, dict)?,
        None => HashMap::new(),
    };

    let env = MapEnvironment::with_fields(field_map);
    let mut trace = Trace::new();
    let result = evaluate_with(
        &expr,
        &env,
        EvaluatorOptions {
            trace: Some(&mut trace),
            ..EvaluatorOptions::default()
        },
    );

    let value = fel_to_python(py, &result.value)?;
    let diagnostics = json_to_python(py, &fel_diagnostics_to_json_value(&result.diagnostics))?;
    let trace_json = serde_json::to_value(&trace.steps).map_err(|e| {
        pyo3::exceptions::PyValueError::new_err(format!("trace serialization: {e}"))
    })?;
    let trace_json = normalize_wire_json_for_python(&trace_json);
    let trace_py = json_to_python(py, &trace_json)?;

    let payload = PyDict::new(py);
    payload.set_item("value", value)?;
    payload.set_item("diagnostics", diagnostics)?;
    payload.set_item("trace", trace_py)?;
    Ok(payload.into())
}

/// Parse and evaluate a FEL expression with full Formspec context.
///
/// Args:
///     expression: FEL expression string
///     fields: Optional dict of field name → value
///     instances: Optional dict of instance name → value
///     mip_states: Optional dict of field path → {valid, relevant, readonly, required}
///     variables: Optional dict of variable name → value
///
/// Returns:
///     A dict with: value, diagnostics
#[pyfunction(signature = (expression, fields=None, instances=None, mip_states=None, variables=None, now_iso=None))]
pub fn eval_fel_detailed(
    py: Python,
    expression: &str,
    fields: Option<&Bound<'_, PyDict>>,
    instances: Option<&Bound<'_, PyDict>>,
    mip_states: Option<&Bound<'_, PyDict>>,
    variables: Option<&Bound<'_, PyDict>>,
    now_iso: Option<&str>,
) -> PyResult<PyObject> {
    let expr = parse_fel_expr(expression)?;
    let env = build_formspec_env(py, fields, instances, mip_states, variables, now_iso)?;
    let mut result = evaluate(&expr, &env);

    attach_spans_to_diagnostics(&mut result.diagnostics, expression);

    let diagnostics = json_to_python(py, &fel_diagnostics_to_json_value(&result.diagnostics))?;

    let payload = PyDict::new(py);
    payload.set_item("value", fel_to_python_tagged(py, &result.value)?)?;
    payload.set_item("diagnostics", diagnostics)?;
    Ok(payload.into())
}

/// Helper to ensure all evaluation diagnostics carry byte spans into the expression source.
fn attach_spans_to_diagnostics(diagnostics: &mut [fel_core::Diagnostic], expression: &str) {
    for d in diagnostics.iter_mut() {
        if d.span.is_none() {
            d.span = find_diagnostic_span(d, expression);
        }
    }
}

fn find_diagnostic_span(
    d: &fel_core::Diagnostic,
    expression: &str,
) -> Option<std::ops::Range<usize>> {
    // 1. Function-based diagnostic kinds
    if let Some(ref kind) = d.kind {
        let name = match kind {
            fel_core::DiagnosticKind::UndefinedFunction { name } => name.as_str(),
            fel_core::DiagnosticKind::ArityMismatch { name, .. } => name.as_str(),
            fel_core::DiagnosticKind::TypeMismatch { fn_name, .. } => fn_name.as_str(),
            fel_core::DiagnosticKind::MissingTimezoneContext { fn_name, .. } => fn_name.as_str(),
        };
        if let Ok(tokens) = fel_core::lexer::Lexer::new(expression).tokenize() {
            for st in &tokens {
                if let fel_core::lexer::Token::Identifier(ref id) = st.token {
                    if id == name {
                        return Some(st.span.start..st.span.end);
                    }
                }
            }
        }
        if let Some(idx) = expression.find(name) {
            return Some(idx..idx + name.len());
        }
        if !expression.is_empty() {
            return Some(0..expression.len());
        }
        return None;
    }

    // 2. Operator extraction when kind is None
    let target_str: Option<String> = if d.message.contains("cannot apply") {
        if let Some(start) = d.message.find('\'') {
            if let Some(end) = d.message[start + 1..].find('\'') {
                Some(d.message[start + 1..start + 1 + end].to_string())
            } else {
                None
            }
        } else {
            None
        }
    } else if d.message.contains("division by zero") || d.message.contains("division overflow") {
        Some("/".to_string())
    } else if d.message.contains("cannot add") || d.message.contains("arithmetic overflow (+)") {
        Some("+".to_string())
    } else if d.message.contains("cannot subtract")
        || d.message.contains("arithmetic overflow (-)")
        || d.message.contains("cannot negate")
    {
        Some("-".to_string())
    } else if d.message.contains("cannot multiply") || d.message.contains("arithmetic overflow (*)")
    {
        Some("*".to_string())
    } else if d.message.contains("cannot concat") {
        Some("&".to_string())
    } else {
        None
    };

    // 3. Token-based span matching
    if let Ok(tokens) = fel_core::lexer::Lexer::new(expression).tokenize() {
        // For division by zero: if there is a `/` followed by literal zero, match that exact operator
        if d.message.contains("division by zero") {
            for (i, st) in tokens.iter().enumerate() {
                if matches!(st.token, fel_core::lexer::Token::Slash) {
                    if let Some(next) = tokens.get(i + 1) {
                        if matches!(&next.token, fel_core::lexer::Token::Number(n) if n.is_zero()) {
                            return Some(st.span.start..st.span.end);
                        }
                    }
                }
            }
        }

        if let Some(ref target) = target_str {
            // For binary operators, search from the end (rev) so compound expressions point to failing operator
            for st in tokens.iter().rev() {
                let matches_target = match (&st.token, target.as_str()) {
                    (fel_core::lexer::Token::Plus, "+") => true,
                    (fel_core::lexer::Token::Minus, "-") => true,
                    (fel_core::lexer::Token::Star, "*") => true,
                    (fel_core::lexer::Token::Slash, "/") => true,
                    (fel_core::lexer::Token::Percent, "%") => true,
                    (fel_core::lexer::Token::Ampersand, "&") => true,
                    (fel_core::lexer::Token::And, "and") => true,
                    (fel_core::lexer::Token::Or, "or") => true,
                    (fel_core::lexer::Token::Not, "not") => true,
                    (fel_core::lexer::Token::Bang, "!") => true,
                    (fel_core::lexer::Token::Identifier(id), t) if id == t => true,
                    _ => false,
                };
                if matches_target {
                    return Some(st.span.start..st.span.end);
                }
            }
        }
    }

    // 4. String-based fallback
    if d.message.contains("division by zero") {
        let zero_div_pos = expression.match_indices('/').find_map(|(idx, _)| {
            let after = expression[idx + 1..].trim_start();
            if after.starts_with('0') || after.starts_with("(0") {
                Some(idx)
            } else {
                None
            }
        });
        if let Some(idx) = zero_div_pos {
            return Some(idx..idx + 1);
        }
    }

    if let Some(ref target) = target_str {
        if let Some(idx) = expression.rfind(target.as_str()) {
            return Some(idx..idx + target.len());
        }
        if let Some(idx) = expression.find(target.as_str()) {
            return Some(idx..idx + target.len());
        }
    }

    if !expression.is_empty() {
        Some(0..expression.len())
    } else {
        None
    }
}

/// Parse a FEL expression and return None if valid, or Some(error_message) if invalid.
#[pyfunction]
pub fn parse_fel(expression: &str) -> Option<String> {
    match parse(expression) {
        Ok(_) => None,
        Err(fel_core::Error::Parse(pe)) => {
            if let Some(span) = pe.span {
                if pe.message.contains("at position") || pe.message.contains("starting at position") {
                    Some(pe.message)
                } else {
                    Some(format!("{} at position {}", pe.message, span.start))
                }
            } else {
                Some(pe.message)
            }
        }
    }
}

/// Extract field dependencies from a FEL expression.
///
/// Returns a list of field path strings.
#[pyfunction]
pub fn get_dependencies(expression: &str) -> Vec<String> {
    get_fel_dependencies(expression).into_iter().collect()
}

/// Extract full dependency info from a FEL expression.
///
/// Returns a dict with: fields, context_refs, instance_refs, mip_deps,
/// has_self_ref, has_wildcard, uses_prev_next.
#[pyfunction]
pub fn extract_deps(py: Python, expression: &str) -> PyResult<PyObject> {
    let expr = parse_fel_expr(expression)?;
    let deps = extract_dependencies(&expr);
    let json = dependencies_to_json_value_styled(&deps, JsonWireStyle::PythonSnake);
    json_to_python(py, &json)
}

// ── FEL Analysis ────────────────────────────────────────────────

/// Analyze a FEL expression, extracting references, variables, and functions.
///
/// Returns a dict with: `valid`, `errors`, `warnings`, `references`, `variables`, `functions`
/// (same JSON shape as Rust `fel_analysis_to_json_value` / TS `analyzeFEL`).
///
/// Each entry in `errors` is a dict with `message` (str) and `span` (`None` or
/// `{"start": int, "end": int}` — character indices into the expression).
/// `warnings` is a list of warning message strings (non-fatal arity/type hints).
#[pyfunction]
pub fn analyze_expression(py: Python, expression: &str) -> PyResult<PyObject> {
    let result = analyze_fel(expression);
    let json = fel_analysis_to_json_value(&result);
    json_to_python(py, &json)
}

/// Return builtin FEL function metadata for Python tooling surfaces.
#[pyfunction]
pub fn list_builtin_functions(py: Python) -> PyResult<PyObject> {
    let json = builtin_function_catalog_json_value();
    json_to_python(py, &json)
}

/// Normalize FEL source for evaluation (same rules as the TS engine / `prepareFelExpression` WASM).
///
/// Args:
///     options: dict with `expression` (required), optional `current_item_path` / `currentItemPath`,
///         `replace_self_ref` / `replaceSelfRef`, `repeat_counts` / `repeatCounts`,
///         and `values_by_path` / `valuesByPath` or `field_paths` / `fieldPaths`.
#[pyfunction]
pub fn prepare_expression(options: &Bound<'_, PyAny>) -> PyResult<String> {
    let v: Value = depythonize_json(options)?;
    let m = v.as_object().ok_or_else(|| {
        pyo3::exceptions::PyTypeError::new_err("prepare_expression options must be a dict")
    })?;
    let owned =
        host_options_from_json(m).map_err(|e| pyo3::exceptions::PyValueError::new_err(e))?;
    Ok(prepare(&owned))
}

/// Rewrite FEL using definition-assembly RewriteMap (fragment + host keys, same as TS `rewriteFEL`).
#[pyfunction]
#[pyo3(name = "rewrite_fel_for_assembly")]
pub fn rewrite_fel_for_assembly_py(expression: &str, map: &Bound<'_, PyAny>) -> PyResult<String> {
    let v: Value = depythonize_json(map)?;
    let m = assembly_fel_rewrite_map_from_value(&v)
        .map_err(|e| pyo3::exceptions::PyValueError::new_err(e))?;
    Ok(rewrite_fel_for_assembly_core(expression, &m))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_fel_valid() {
        assert_eq!(parse_fel("1 + 2"), None);
        assert_eq!(parse_fel("$a > 10 and $b"), None);
    }

    #[test]
    fn test_parse_fel_invalid_surfaces_message_and_position() {
        // Test 1: trailing operator / unexpected eof
        let err1 = parse_fel("1 +").expect("should error");
        assert!(err1.contains("unexpected token") || err1.contains("position"), "{err1}");

        // Test 2: unexpected token / character
        let err2 = parse_fel("1 @ 2").expect("should error");
        assert!((err2.contains("unexpected character") || err2.contains("unexpected token")) && err2.contains("position"), "{err2}");

        // Test 3: unclosed string literal
        let err3 = parse_fel("'unterminated").expect("should error");
        assert!(err3.contains("unterminated string") && err3.contains("position"), "{err3}");
    }

    #[test]
    fn test_attach_spans_to_diagnostics() {
        let mut diags = vec![
            fel_core::Diagnostic::undefined_function("unknownFn"),
            fel_core::Diagnostic::error("division by zero"),
        ];
        attach_spans_to_diagnostics(&mut diags, "unknownFn(1 / 0)");
        assert_eq!(diags[0].span, Some(0..9));
        assert_eq!(diags[1].span, Some(12..13));
    }

    #[test]
    fn test_attach_spans_repeated_binary_operators_and_cannot_apply() {
        // Division by zero in compound expression points accurately to the failing operator
        let mut diags1 = vec![fel_core::Diagnostic::error("division by zero")];
        attach_spans_to_diagnostics(&mut diags1, "10 / 2 + 50 / 0");
        assert_eq!(diags1[0].span, Some(12..13));

        // Division by zero where first division is the failing one
        let mut diags2 = vec![fel_core::Diagnostic::error("division by zero")];
        attach_spans_to_diagnostics(&mut diags2, "10 / 0 + 50 / 2");
        assert_eq!(diags2[0].span, Some(3..4));

        // cannot apply '+' extracts '+' and targets the failing operator in compound expression
        let mut diags3 = vec![fel_core::Diagnostic::error("cannot apply '+' to string and number")];
        attach_spans_to_diagnostics(&mut diags3, "1 + 2\n\"abc\" + 3");
        assert_eq!(diags3[0].span, Some(12..13));

        // cannot apply '-' extracts '-' and searches from the end
        let mut diags4 = vec![fel_core::Diagnostic::error("cannot apply '-' to number and string")];
        attach_spans_to_diagnostics(&mut diags4, "10 - 5 - \"bad\"");
        assert_eq!(diags4[0].span, Some(7..8));
    }
}


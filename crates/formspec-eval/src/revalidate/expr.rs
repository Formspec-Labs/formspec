//! FEL expression evaluation for validation (shape and bind constraint truthiness).
#![allow(clippy::missing_docs_in_private_items)]

use fel_core::error::{Diagnostic, Severity};
use fel_core::{
    EvalResult, FormspecEnvironment, Value, evaluate, expr_is_interpolation_static_literal, parse,
};

use crate::types::EvalDiagnostic;

/// Whether a constraint-position value passes.
///
/// `null` passes (Core §3.8.1), including `null` from an evaluation error
/// (§3.10.2): those errors go to authors via [`ConstraintSite::record_eval_errors`],
/// never to end users as validation failures. Otherwise truthiness decides.
pub(super) fn constraint_passes(value: &Value) -> bool {
    value.is_null() || value.is_truthy()
}

/// Bind or shape target an evaluated constraint expression belongs to.
pub(super) struct ConstraintSite<'a> {
    /// Resolved target path.
    pub(super) path: &'a str,
    /// Shape ID for shape expressions.
    pub(super) shape_id: Option<&'a str>,
}

impl ConstraintSite<'_> {
    /// Parse and evaluate a constraint-position `expression` at this site.
    ///
    /// Returns `None` for a syntax error: that is a definition error (§3.10.1),
    /// which callers treat as failing rather than as a passing `null`.
    pub(super) fn evaluate(
        &self,
        expression: &str,
        env: &FormspecEnvironment,
        diagnostics: &mut Vec<EvalDiagnostic>,
    ) -> Option<Value> {
        let parsed = parse(expression).ok()?;
        let result = evaluate(&parsed, env);
        self.record_eval_errors(&result, expression, diagnostics);
        Some(result.value)
    }

    /// Record `result`'s error-severity diagnostics for authors (Core §3.10.2).
    pub(super) fn record_eval_errors(
        &self,
        result: &EvalResult,
        expression: &str,
        diagnostics: &mut Vec<EvalDiagnostic>,
    ) {
        diagnostics.extend(
            result
                .diagnostics
                .iter()
                .filter(|d| d.severity == Severity::Error)
                .map(|d| EvalDiagnostic {
                    path: self.path.to_string(),
                    expression: expression.to_string(),
                    shape_id: self.shape_id.map(str::to_string),
                    message: d.message.clone(),
                }),
        );
    }
}

/// True when the evaluation produced error-level diagnostics (broken expression).
pub(crate) fn result_has_eval_errors(result: &EvalResult) -> bool {
    result
        .diagnostics
        .iter()
        .any(|d| d.severity == Severity::Error)
}

/// Evaluate a FEL expression, folding parse errors into an error diagnostic.
///
/// Used where any failure is one "expression error" signal (screener routes,
/// shape `context` values). Constraint positions use [`ConstraintSite::evaluate`],
/// which keeps syntax errors distinct from evaluation errors.
pub(crate) fn evaluate_shape_expression(expr: &str, env: &FormspecEnvironment) -> EvalResult {
    match parse(expr) {
        Ok(parsed) => evaluate(&parsed, env),
        Err(e) => EvalResult {
            value: Value::Null,
            diagnostics: vec![Diagnostic::error(format!(
                "FEL parse error in constraint: {e}"
            ))],
        },
    }
}

/// Resolve `{{expression}}` interpolation sequences in a message string.
///
/// Rules (per locale spec §3.3.1):
/// 1. `{{{{` -> literal `{{` (escape handling)
/// 2. Failed parse, eval error diagnostics, or rule 3a -> literal `{{original expr}}`
/// 3. Otherwise coerce value to display string (null -> "" when allowed)
/// 4. Non-recursive: replacement text is not re-scanned
pub(super) fn interpolate_message(template: &str, env: &FormspecEnvironment) -> String {
    // No {{ at all — fast path
    if !template.contains("{{") {
        return template.to_string();
    }

    let mut result = String::with_capacity(template.len());
    let bytes = template.as_bytes();
    let len = bytes.len();
    let mut i = 0;

    while i < len {
        if i + 1 < len && bytes[i] == b'{' && bytes[i + 1] == b'{' {
            // Escaped: {{{{ -> literal {{
            if i + 3 < len && bytes[i + 2] == b'{' && bytes[i + 3] == b'{' {
                result.push_str("{{");
                i += 4;
                continue;
            }

            // Find closing }}
            if let Some(close) = find_closing_braces(template, i + 2) {
                let expr = &template[i + 2..close];
                let evaluated = match parse(expr) {
                    Ok(parsed) => {
                        let er = evaluate(&parsed, env);
                        let trim = expr.trim();
                        let has_binding_sigil = trim.contains('$') || trim.contains('@');
                        if er.diagnostics.iter().any(|d| d.severity == Severity::Error) {
                            format!("{{{{{expr}}}}}")
                        } else if er.value.is_null()
                            && !has_binding_sigil
                            && !expr_is_interpolation_static_literal(&parsed)
                        {
                            format!("{{{{{expr}}}}}")
                        } else {
                            fel_value_to_display(&er.value)
                        }
                    }
                    Err(_) => format!("{{{{{expr}}}}}"),
                };
                result.push_str(&evaluated);
                i = close + 2;
            } else {
                // No closing }} found — emit literal
                result.push_str("{{");
                i += 2;
            }
        } else if let Some(ch) = template[i..].chars().next() {
            result.push(ch);
            i += ch.len_utf8();
        } else {
            break;
        }
    }

    result
}

/// Find the position of the closing `}}` starting from `start`.
/// Returns the index of the first `}` in the `}}` pair.
fn find_closing_braces(s: &str, start: usize) -> Option<usize> {
    let bytes = s.as_bytes();
    let mut i = start;
    while i + 1 < bytes.len() {
        if bytes[i] == b'}' && bytes[i + 1] == b'}' {
            return Some(i);
        }
        i += 1;
    }
    None
}

/// Coerce a Value to its display string for message interpolation.
fn fel_value_to_display(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::Boolean(b) => if *b { "true" } else { "false" }.to_string(),
        Value::Number(n) => fel_core::types::format_number(*n),
        Value::String(s) => s.clone(),
        Value::Date(d) => d.format_iso(),
        Value::Money(m) => format!(
            "{} {}",
            fel_core::types::format_number(m.amount),
            m.currency
        ),
        Value::Array(_) | Value::Object(_) => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal::Decimal;

    /// Core §3.8.1 / §3.10.2: `null` passes whether it came from missing data or an eval error.
    #[test]
    fn constraint_passes_null_and_truthy_values() {
        assert!(constraint_passes(&Value::Null));
        assert!(constraint_passes(&Value::Boolean(true)));
        assert!(!constraint_passes(&Value::Boolean(false)));
    }

    #[test]
    fn site_records_only_error_diagnostics() {
        let site = ConstraintSite {
            path: "amount",
            shape_id: Some("s1"),
        };
        let result = EvalResult {
            value: Value::Null,
            diagnostics: vec![
                Diagnostic::error("undefined function: bogusFunc"),
                Diagnostic::warning("some warning"),
            ],
        };
        let mut diagnostics = Vec::new();
        site.record_eval_errors(&result, "bogusFunc($amount)", &mut diagnostics);
        assert_eq!(
            diagnostics,
            vec![EvalDiagnostic {
                path: "amount".to_string(),
                expression: "bogusFunc($amount)".to_string(),
                shape_id: Some("s1".to_string()),
                message: "undefined function: bogusFunc".to_string(),
            }]
        );
    }

    #[test]
    fn site_evaluate_returns_none_for_syntax_error() {
        let site = ConstraintSite {
            path: "x",
            shape_id: None,
        };
        let mut diagnostics = Vec::new();
        assert_eq!(
            site.evaluate("((( broken >>>", &make_env(), &mut diagnostics),
            None
        );
        assert!(diagnostics.is_empty());
    }

    fn make_env() -> FormspecEnvironment {
        let mut env = FormspecEnvironment::new();
        env.set_field("budget", Value::Number(Decimal::from(1000)));
        env.set_field("limit", Value::Number(Decimal::from(500)));
        env.set_field("name", Value::String("Alice".to_string()));
        env.set_field("empty", Value::Null);
        env.set_field("flag", Value::Boolean(true));
        env
    }

    #[test]
    fn basic_interpolation() {
        let env = make_env();
        let result = interpolate_message("Budget {{$budget}} exceeds {{$limit}}", &env);
        assert_eq!(result, "Budget 1000 exceeds 500");
    }

    #[test]
    fn escape_double_braces() {
        let env = make_env();
        let result = interpolate_message("Use {{{{ for templates", &env);
        assert_eq!(result, "Use {{ for templates");
    }

    #[test]
    fn error_recovery_bad_expr() {
        let env = make_env();
        let result = interpolate_message("{{badExpr!!!}}", &env);
        assert_eq!(result, "{{badExpr!!!}}");
    }

    #[test]
    fn interpolation_preserves_null_without_sigil_or_static_literal() {
        let env = make_env();
        assert_eq!(
            interpolate_message("x {{!!!bad}} y", &env),
            "x {{!!!bad}} y"
        );
    }

    #[test]
    fn interpolation_null_literal_still_empty() {
        let env = make_env();
        assert_eq!(interpolate_message("{{null}}", &env), "");
    }

    #[test]
    fn interpolation_not_null_still_empty() {
        let env = make_env();
        assert_eq!(interpolate_message("{{not null}}", &env), "");
    }

    #[test]
    fn interpolation_eval_error_preserves_literal() {
        let env = make_env();
        let result = interpolate_message("{{noSuchFn()}}", &env);
        assert_eq!(result, "{{noSuchFn()}}");
    }

    #[test]
    fn null_coercion() {
        let env = make_env();
        let result = interpolate_message("Value is '{{$empty}}'", &env);
        assert_eq!(result, "Value is ''");
    }

    #[test]
    fn no_expressions_passthrough() {
        let env = make_env();
        let result = interpolate_message("Plain text", &env);
        assert_eq!(result, "Plain text");
    }

    #[test]
    fn non_recursive() {
        let mut env = FormspecEnvironment::new();
        env.set_field("trick", Value::String("{{$budget}}".to_string()));
        env.set_field("budget", Value::Number(Decimal::from(999)));
        let result = interpolate_message("Got {{$trick}}", &env);
        assert_eq!(result, "Got {{$budget}}");
    }

    #[test]
    fn boolean_coercion() {
        let env = make_env();
        let result = interpolate_message("Flag is {{$flag}}", &env);
        assert_eq!(result, "Flag is true");
    }

    #[test]
    fn string_interpolation() {
        let env = make_env();
        let result = interpolate_message("Hello {{$name}}", &env);
        assert_eq!(result, "Hello Alice");
    }

    #[test]
    fn mixed_text_and_expressions() {
        let env = make_env();
        let result = interpolate_message("{{$name}} spent {{$budget}} of {{$limit}} allowed", &env);
        assert_eq!(result, "Alice spent 1000 of 500 allowed");
    }

    #[test]
    fn unclosed_braces_literal() {
        let env = make_env();
        let result = interpolate_message("Unclosed {{expr here", &env);
        assert_eq!(result, "Unclosed {{expr here");
    }

    #[test]
    fn preserves_utf8_non_ascii_text() {
        let env = make_env();
        let result = interpolate_message("Café déjà vu — Привет 你好", &env);
        assert_eq!(result, "Café déjà vu — Привет 你好");
    }
}

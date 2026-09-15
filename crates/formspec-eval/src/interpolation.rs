//! `{{expression}}` interpolation (Locale §3.3.1) for Item text, Locale strings, and Shape messages.
//!
//! One implementation owns the template rules for every host:
//!
//! 1. `{{{{` renders a literal `{{`.
//! 2. An expression that fails to parse, or whose evaluation records an error
//!    diagnostic, renders as its literal `{{expression}}` and adds a warning; the
//!    rest of the string still resolves.
//! 3. A `null` result renders as `""`, unless (rule 3a) the trimmed expression has
//!    neither a `$` nor an `@` sigil and is not an interpolation static literal, in
//!    which case it fails like rule 2.
//! 4. Other results coerce to display strings.
//! 5. Replacement text is not re-scanned.
//!
//! [`interpolate_template`] scans a template and asks a resolver for each expression;
//! [`interpolation_text`] applies rules 2–4 to one evaluated expression, so a host that
//! evaluates elsewhere (a JavaScript callback) keeps the same rules.
//! [`interpolate_fel_template`] does both against a FEL environment.

use fel_core::{
    Environment, ExtensionFunctions, FormspecEnvironment, Value,
    expr_is_interpolation_static_literal, has_error_diagnostics, parse,
};

use crate::fel_eval::Fel;

/// Resolved template text plus a warning per expression left literal.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Interpolated {
    /// Text with every resolvable `{{expression}}` replaced.
    pub text: String,
    /// One entry per expression rendered literally (Locale §3.3.1 rules 2 and 3a).
    pub warnings: Vec<InterpolationWarning>,
}

/// An `{{expression}}` that failed and stayed literal.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InterpolationWarning {
    /// Expression source between the braces, untrimmed.
    pub expression: String,
    /// Why it failed.
    pub message: String,
}

/// Resolves every `{{expression}}` in `template` through `resolve`.
///
/// `resolve` returns the display text, or an error message to keep the expression
/// literal and record a warning. Escapes, unclosed braces, and non-recursion are
/// handled here.
pub fn interpolate_template(
    template: &str,
    mut resolve: impl FnMut(&str) -> Result<String, String>,
) -> Interpolated {
    if !template.contains("{{") {
        return Interpolated {
            text: template.to_string(),
            warnings: Vec::new(),
        };
    }

    let mut out = Interpolated {
        text: String::with_capacity(template.len()),
        warnings: Vec::new(),
    };
    let mut rest = template;
    while let Some(open) = rest.find("{{") {
        out.text.push_str(&rest[..open]);
        let after_open = &rest[open + 2..];
        if let Some(escaped) = after_open.strip_prefix("{{") {
            out.text.push_str("{{");
            rest = escaped;
            continue;
        }
        let Some(close) = after_open.find("}}") else {
            out.text.push_str("{{");
            rest = after_open;
            continue;
        };
        let expression = &after_open[..close];
        match resolve(expression) {
            Ok(text) => out.text.push_str(&text),
            Err(message) => {
                out.text.push_str("{{");
                out.text.push_str(expression);
                out.text.push_str("}}");
                out.warnings.push(InterpolationWarning {
                    expression: expression.to_string(),
                    message,
                });
            }
        }
        rest = &after_open[close + 2..];
    }
    out.text.push_str(rest);
    out
}

/// Display text for one evaluated `expression` (Locale §3.3.1 rules 2–4).
///
/// # Errors
///
/// A warning message when the expression must stay literal: `has_error_diagnostics`
/// (rule 2), or a `null` result without a `$` / `@` sigil from an expression that is
/// not an interpolation static literal (rule 3a).
pub fn interpolation_text(
    expression: &str,
    value: &Value,
    has_error_diagnostics: bool,
) -> Result<String, String> {
    if has_error_diagnostics {
        return Err("evaluation recorded error diagnostics".to_string());
    }
    if value.is_null() {
        let trimmed = expression.trim();
        let has_sigil = trimmed.contains('$') || trimmed.contains('@');
        let static_literal =
            parse(expression).is_ok_and(|ast| expr_is_interpolation_static_literal(&ast));
        if !has_sigil && !static_literal {
            return Err("null result without a $ or @ reference".to_string());
        }
    }
    Ok(display_text(value))
}

/// Interpolates `template` against `env`, resolving host `extensions` (Core §3.12).
pub fn interpolate_fel_template(
    template: &str,
    env: &FormspecEnvironment,
    extensions: Option<&dyn ExtensionFunctions>,
) -> Interpolated {
    interpolate_fel(template, env, Fel::new(extensions), |expression| {
        expression.to_string()
    })
}

/// Interpolates `template` against `env`; `prepare` rewrites each expression before parsing.
pub(crate) fn interpolate_fel(
    template: &str,
    env: &dyn Environment,
    fel: Fel<'_>,
    prepare: impl Fn(&str) -> String,
) -> Interpolated {
    interpolate_template(template, |expression| {
        let parsed = parse(&prepare(expression)).map_err(|e| e.to_string())?;
        let result = fel.evaluate(&parsed, env);
        interpolation_text(
            expression,
            &result.value,
            has_error_diagnostics(&result.diagnostics),
        )
    })
}

/// Display string for an interpolation result (Locale §3.3.1 rule 4).
fn display_text(value: &Value) -> String {
    match value {
        Value::Null | Value::Array(_) | Value::Object(_) => String::new(),
        Value::Boolean(b) => b.to_string(),
        Value::Number(n) => fel_core::types::format_number(*n),
        Value::String(s) => s.clone(),
        Value::Date(d) => d.format_iso(),
        Value::Money(m) => format!(
            "{} {}",
            fel_core::types::format_number(m.amount),
            m.currency
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal::Decimal;

    fn fel_text(template: &str, env: &FormspecEnvironment) -> String {
        interpolate_fel(template, env, Fel::default(), str::to_string).text
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
        let result = fel_text("Budget {{$budget}} exceeds {{$limit}}", &env);
        assert_eq!(result, "Budget 1000 exceeds 500");
    }

    #[test]
    fn escape_double_braces() {
        let env = make_env();
        let result = fel_text("Use {{{{ for templates", &env);
        assert_eq!(result, "Use {{ for templates");
    }

    #[test]
    fn error_recovery_bad_expr() {
        let env = make_env();
        let result = fel_text("{{badExpr!!!}}", &env);
        assert_eq!(result, "{{badExpr!!!}}");
    }

    #[test]
    fn interpolation_preserves_null_without_sigil_or_static_literal() {
        let env = make_env();
        assert_eq!(fel_text("x {{!!!bad}} y", &env), "x {{!!!bad}} y");
    }

    #[test]
    fn interpolation_null_literal_still_empty() {
        let env = make_env();
        assert_eq!(fel_text("{{null}}", &env), "");
    }

    #[test]
    fn interpolation_not_null_still_empty() {
        let env = make_env();
        assert_eq!(fel_text("{{not null}}", &env), "");
    }

    #[test]
    fn interpolation_eval_error_preserves_literal() {
        let env = make_env();
        let result = fel_text("{{noSuchFn()}}", &env);
        assert_eq!(result, "{{noSuchFn()}}");
    }

    #[test]
    fn null_coercion() {
        let env = make_env();
        let result = fel_text("Value is '{{$empty}}'", &env);
        assert_eq!(result, "Value is ''");
    }

    #[test]
    fn no_expressions_passthrough() {
        let env = make_env();
        let result = fel_text("Plain text", &env);
        assert_eq!(result, "Plain text");
    }

    #[test]
    fn non_recursive() {
        let mut env = FormspecEnvironment::new();
        env.set_field("trick", Value::String("{{$budget}}".to_string()));
        env.set_field("budget", Value::Number(Decimal::from(999)));
        let result = fel_text("Got {{$trick}}", &env);
        assert_eq!(result, "Got {{$budget}}");
    }

    #[test]
    fn boolean_coercion() {
        let env = make_env();
        let result = fel_text("Flag is {{$flag}}", &env);
        assert_eq!(result, "Flag is true");
    }

    #[test]
    fn string_interpolation() {
        let env = make_env();
        let result = fel_text("Hello {{$name}}", &env);
        assert_eq!(result, "Hello Alice");
    }

    #[test]
    fn mixed_text_and_expressions() {
        let env = make_env();
        let result = fel_text("{{$name}} spent {{$budget}} of {{$limit}} allowed", &env);
        assert_eq!(result, "Alice spent 1000 of 500 allowed");
    }

    #[test]
    fn unclosed_braces_literal() {
        let env = make_env();
        let result = fel_text("Unclosed {{expr here", &env);
        assert_eq!(result, "Unclosed {{expr here");
    }

    #[test]
    fn preserves_utf8_non_ascii_text() {
        let env = make_env();
        let result = fel_text("Café déjà vu — Привет 你好", &env);
        assert_eq!(result, "Café déjà vu — Привет 你好");
    }

    #[test]
    fn failed_expressions_record_warnings() {
        let out = interpolate_fel(
            "{{$budget}} {{((}} {{nope}}",
            &make_env(),
            Fel::default(),
            str::to_string,
        );
        assert_eq!(out.text, "1000 {{((}} {{nope}}");
        let failed: Vec<&str> = out.warnings.iter().map(|w| w.expression.as_str()).collect();
        assert_eq!(failed, vec!["((", "nope"]);
    }

    #[test]
    fn escape_then_expression_and_trailing_text() {
        assert_eq!(
            fel_text("{{{{{{$budget}} and }}", &make_env()),
            "{{1000 and }}"
        );
    }
}

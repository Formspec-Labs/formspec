//! FEL expression evaluation for validation (shape and bind constraint truthiness).
#![allow(clippy::missing_docs_in_private_items)]

use fel_core::error::Severity;
use fel_core::{
    EvalResult, FormspecEnvironment, Value, parse, undefined_function_names_from_diagnostics,
};

use crate::fel_eval::Fel;
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
    /// FEL evaluation seam.
    pub(super) fel: Fel<'a>,
}

impl ConstraintSite<'_> {
    /// Parse and evaluate a constraint-position `expression` at this site.
    ///
    /// Returns `None` for a definition error (§3.10.1): a syntax error or an
    /// undefined function. Callers treat it as failing rather than as a passing `null`.
    pub(super) fn evaluate(
        &self,
        expression: &str,
        env: &FormspecEnvironment,
        diagnostics: &mut Vec<EvalDiagnostic>,
    ) -> Option<Value> {
        let parsed = parse(expression).ok()?;
        self.settle(self.fel.evaluate(&parsed, env), expression, diagnostics)
            .ok()
    }

    /// Record `result`'s errors for authors, then return its value unless a function is undefined.
    ///
    /// A type error is an evaluation error (§3.10.2): its `null` value stands.
    /// An undefined function is a definition error (§3.10.1): `Err` naming the functions.
    pub(super) fn settle(
        &self,
        result: EvalResult,
        expression: &str,
        diagnostics: &mut Vec<EvalDiagnostic>,
    ) -> Result<Value, String> {
        self.record_eval_errors(&result, expression, diagnostics);
        let undefined = undefined_function_names_from_diagnostics(&result.diagnostics);
        if undefined.is_empty() {
            Ok(result.value)
        } else {
            Err(format!("undefined function: {}", undefined.join(", ")))
        }
    }

    /// Record `result`'s error-severity diagnostics for authors (Core §3.10.2).
    fn record_eval_errors(
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

#[cfg(test)]
mod tests {
    use super::*;
    use fel_core::Diagnostic;
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
            fel: Fel::default(),
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
            fel: Fel::default(),
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
        env
    }
}

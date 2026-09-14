//! FEL evaluation seam: every Definition expression evaluates through [`Fel`].
//!
//! Keeping one entry point means the host's extension functions (Core §3.12)
//! reach binds, variables, initial values, constraints, shapes, and text alike.

use fel_core::error::Diagnostic;
use fel_core::{
    EvalResult, EvaluatorOptions, Expr, ExtensionFunctions, FormspecEnvironment, Value,
    evaluate_with, parse,
};

/// Evaluates FEL with the host's extension functions, if any.
#[derive(Clone, Copy, Default)]
pub(crate) struct Fel<'a> {
    /// Host extension functions consulted for non-builtin names.
    extensions: Option<&'a dyn ExtensionFunctions>,
}

impl Fel<'_> {
    /// Evaluates parsed `expr` in `env`.
    pub(crate) fn evaluate(self, expr: &Expr, env: &FormspecEnvironment) -> EvalResult {
        evaluate_with(
            expr,
            env,
            EvaluatorOptions {
                extensions: self.extensions,
                ..EvaluatorOptions::default()
            },
        )
    }

    /// Parses and evaluates `source`, folding a parse error into an error diagnostic.
    ///
    /// For positions where any failure is one "expression error" signal (screener
    /// routes, shape `context` values). Constraint positions keep syntax errors
    /// distinct from evaluation errors instead.
    pub(crate) fn evaluate_source(self, source: &str, env: &FormspecEnvironment) -> EvalResult {
        match parse(source) {
            Ok(parsed) => self.evaluate(&parsed, env),
            Err(e) => EvalResult {
                value: Value::Null,
                diagnostics: vec![Diagnostic::error(format!(
                    "FEL parse error in constraint: {e}"
                ))],
            },
        }
    }

    /// Boolean value of `source`; `default` when it fails to parse or is not a boolean.
    pub(crate) fn eval_bool(self, source: &str, env: &FormspecEnvironment, default: bool) -> bool {
        match parse(source) {
            Ok(parsed) => match self.evaluate(&parsed, env).value {
                Value::Boolean(b) => b,
                _ => default,
            },
            Err(_) => default,
        }
    }
}

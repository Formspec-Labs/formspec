//! FEL evaluation seam: every Definition expression evaluates through [`Fel`].
//!
//! Keeping one entry point means the host's extension functions (Core §3.12)
//! reach binds, variables, initial values, constraints, shapes, and text alike.

use fel_core::error::Diagnostic;
use fel_core::{
    Environment, EvalResult, EvaluatorOptions, Expr, ExtensionFunctions, Value, evaluate_with,
    parse,
};

/// Checks the Core §3.5.9 argument rule shared by Rebuild and host expressions.
pub(crate) fn mip_argument_error(source: &str, expr: &Expr) -> Option<String> {
    formspec_core::dependency_reads::Reads::new(expr)
        .non_field_property_arguments
        .first()
        .map(|property| {
            format!(
                "`{}()` in {source:?} takes a `$path` field reference (Core §3.5.9)",
                property.function_name()
            )
        })
}

/// Parses an expression read by a host outside Definition Rebuild.
pub(crate) fn parse_host_expression(source: &str) -> Result<Expr, String> {
    let expr = parse(source).map_err(|error| error.to_string())?;
    match mip_argument_error(source, &expr) {
        Some(error) => Err(error),
        None => Ok(expr),
    }
}

/// Evaluates FEL with the host's extension functions, if any.
#[derive(Clone, Copy, Default)]
pub(crate) struct Fel<'a> {
    /// Host extension functions consulted for non-builtin names.
    extensions: Option<&'a dyn ExtensionFunctions>,
}

impl<'a> Fel<'a> {
    /// Evaluator resolving unknown function names through `extensions`.
    pub(crate) fn new(extensions: Option<&'a dyn ExtensionFunctions>) -> Self {
        Self { extensions }
    }

    /// Evaluates parsed `expr` in `env`.
    pub(crate) fn evaluate(self, expr: &Expr, env: &dyn Environment) -> EvalResult {
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
    pub(crate) fn evaluate_source(self, source: &str, env: &dyn Environment) -> EvalResult {
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

    /// Return the boolean value, or `default`, and expose any evaluation errors.
    pub(crate) fn eval_bool(
        self,
        source: &str,
        env: &dyn Environment,
        default: bool,
        record: impl FnOnce(&EvalResult),
    ) -> bool {
        let Ok(parsed) = parse(source) else {
            return default;
        };
        let result = self.evaluate(&parsed, env);
        record(&result);
        match result.value {
            Value::Boolean(value) => value,
            _ => default,
        }
    }
}

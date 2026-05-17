//! FEL condition and numeric evaluation for screener routes.

use fel_core::FormspecEnvironment;
use rust_decimal::prelude::ToPrimitive;

use crate::types::determination::{EliminationReason, RouteResult};

pub(crate) const REASON_EXPRESSION_ERROR: &str = "expression-error";
pub(crate) const WARNING_FEL_EXPRESSION_ERROR: &str = "fel-expression-error";

pub(crate) struct ConditionEval {
    pub(crate) truthy: bool,
    pub(crate) expression_error: bool,
}

pub(crate) struct NumericEval {
    pub(crate) value: Option<f64>,
    pub(crate) expression_error: bool,
}

pub(crate) fn eval_screener_condition(condition: &str, env: &FormspecEnvironment) -> ConditionEval {
    let result = crate::revalidate::evaluate_shape_expression(condition, env);
    let expression_error = crate::revalidate::result_has_eval_errors(&result);
    let truthy = !expression_error && result.value.is_truthy();
    ConditionEval {
        truthy,
        expression_error,
    }
}

pub(crate) fn eval_screener_numeric(expr_str: &str, env: &FormspecEnvironment) -> NumericEval {
    let result = crate::revalidate::evaluate_shape_expression(expr_str, env);
    if crate::revalidate::result_has_eval_errors(&result) {
        return NumericEval {
            value: None,
            expression_error: true,
        };
    }
    if result.value.is_null() {
        return NumericEval {
            value: None,
            expression_error: false,
        };
    }
    NumericEval {
        value: result.value.as_number().and_then(|d| d.to_f64()),
        expression_error: false,
    }
}

pub(crate) fn elimination_reason_for_condition(eval: &ConditionEval) -> EliminationReason {
    if eval.expression_error {
        EliminationReason::ExpressionError
    } else {
        EliminationReason::ConditionFalse
    }
}

pub(crate) fn phase_warnings_from_eliminated(eliminated: &[RouteResult]) -> Vec<String> {
    if eliminated
        .iter()
        .any(|r| r.reason == Some(EliminationReason::ExpressionError))
    {
        vec![WARNING_FEL_EXPRESSION_ERROR.to_string()]
    } else {
        Vec::new()
    }
}

/// Append a warning code once (phase / document warning lists are code sets).
pub(crate) fn push_unique_warning(warnings: &mut Vec<String>, code: &str) {
    if !warnings.iter().any(|w| w == code) {
        warnings.push(code.to_string());
    }
}

pub(crate) fn extend_unique_warnings(target: &mut Vec<String>, source: &[String]) {
    for code in source {
        push_unique_warning(target, code);
    }
}

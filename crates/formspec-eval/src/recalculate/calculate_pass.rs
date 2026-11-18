//! Evaluate one calculated field at its concrete Item path.

use std::collections::HashMap;

use fel_core::Expr;
use fel_core::exact_json::Value;

use super::json_fel::coerce_calculated_value;
use super::walk::Walk;
use crate::fel_json::fel_to_runtime_json;
use crate::scope::ScopeData;
use crate::types::{EvalDiagnostic, ItemInfo};

/// Evaluate, coerce, and write one calculated value, recording its evaluation errors.
pub(super) fn evaluate_calculate(
    item: &ItemInfo,
    expression: &Expr,
    state: &mut ScopeData,
    values: &mut HashMap<String, Value>,
    walk: &Walk<'_>,
    diagnostics: &mut Vec<EvalDiagnostic>,
) -> bool {
    let result = walk
        .fel
        .evaluate(expression, &state.site(walk.index, &item.path));
    let source = item.calculate.as_deref().unwrap_or_default();
    EvalDiagnostic::record(diagnostics, &result, &item.path, source, None);
    let coerced = coerce_calculated_value(item, result.value);
    values.insert(item.path.clone(), fel_to_runtime_json(&coerced));
    state.set_field(&item.path, coerced)
}

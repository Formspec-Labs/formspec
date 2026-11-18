//! Fixpoint calculate passes until sibling and cross-field calculates stabilize.

use std::collections::HashMap;

use fel_core::exact_json::Value;
use fel_core::{Expr, parse};

use super::json_fel::coerce_calculated_value;
use super::walk::{Visit, Walk};
use crate::fel_json::fel_to_runtime_json;
use crate::scope::ScopeData;
use crate::types::{EvalDiagnostic, ItemInfo};

/// Upper bound on calculate passes; cyclic calculates stop here instead of spinning.
const MAX_CALCULATE_PASSES: usize = 100;

/// Re-evaluates every `calculate` until a pass changes no value.
///
/// Returns the diagnostics of the last pass, which produced the returned values.
pub(super) fn settle_calculated_values(
    items: &mut [ItemInfo],
    state: &mut ScopeData,
    values: &mut HashMap<String, Value>,
    walk: &Walk<'_>,
) -> Vec<EvalDiagnostic> {
    let mut pass = CalculatePass::default();
    for _ in 0..MAX_CALCULATE_PASSES {
        pass = CalculatePass::default();
        walk.items(items, state, values, &mut pass, ());
        if !pass.changed {
            break;
        }
    }
    pass.diagnostics
}

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

/// One calculate pass over the tree.
#[derive(Default)]
struct CalculatePass {
    /// Whether any calculated value differs from the previous pass.
    changed: bool,
    /// Evaluation errors from this pass.
    diagnostics: Vec<EvalDiagnostic>,
}

impl Visit for CalculatePass {
    type Inherited = ();

    fn item(
        &mut self,
        walk: &Walk<'_>,
        item: &mut ItemInfo,
        state: &mut ScopeData,
        values: &mut HashMap<String, Value>,
        (): (),
    ) {
        let Some(ref expr) = item.calculate else {
            return;
        };
        let Ok(parsed) = parse(expr) else {
            return;
        };

        self.changed |=
            evaluate_calculate(item, &parsed, state, values, walk, &mut self.diagnostics);
        item.value.clone_from(&values[&item.path]);
    }
}

//! Fixpoint calculate passes until sibling and cross-field calculates stabilize.

use std::collections::HashMap;

use fel_core::exact_json::Value;
use fel_core::parse;

use super::json_fel::coerce_calculated_value;
use super::walk::{Visit, Walk};
use crate::fel_json::fel_to_runtime_json;
use crate::scope::ScopeData;
use crate::types::ItemInfo;

/// Upper bound on calculate passes; cyclic calculates stop here instead of spinning.
const MAX_CALCULATE_PASSES: usize = 100;

/// Re-evaluates every `calculate` until a pass changes no value.
pub(super) fn settle_calculated_values(
    items: &mut [ItemInfo],
    state: &mut ScopeData,
    values: &mut HashMap<String, Value>,
    walk: &Walk<'_>,
) {
    for _ in 0..MAX_CALCULATE_PASSES {
        let mut pass = CalculatePass { changed: false };
        walk.items(items, state, values, &mut pass, ());
        if !pass.changed {
            break;
        }
    }
}

/// One calculate pass over the tree.
struct CalculatePass {
    /// Whether any calculated value differs from the previous pass.
    changed: bool,
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

        let result = walk
            .fel
            .evaluate(&parsed, &state.site(walk.index, &item.path));
        let coerced = coerce_calculated_value(item, result.value);
        let json_val = fel_to_runtime_json(&coerced);
        self.changed |= values.get(&item.path) != Some(&json_val);

        values.insert(item.path.clone(), json_val.clone());
        item.value = json_val;
        state.set_field(&item.path, coerced);
    }
}

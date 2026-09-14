//! Fixpoint calculate passes until sibling and cross-field calculates stabilize.

use std::collections::HashMap;

use fel_core::{FormspecEnvironment, fel_to_ui_json, parse};
use serde_json::Value;

use super::json_fel::coerce_calculated_value;
use super::walk::{Visit, Walk};
use crate::types::{ItemInfo, resolve_qualified_repeat_refs};

/// Upper bound on calculate passes; cyclic calculates stop here instead of spinning.
const MAX_CALCULATE_PASSES: usize = 100;

/// Re-evaluates every `calculate` until a pass changes no value.
pub(super) fn settle_calculated_values(
    items: &mut [ItemInfo],
    env: &mut FormspecEnvironment,
    values: &mut HashMap<String, Value>,
    walk: &Walk<'_>,
) {
    for _ in 0..MAX_CALCULATE_PASSES {
        let mut pass = CalculatePass { changed: false };
        walk.items(items, env, values, &mut pass, ());
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
        env: &mut FormspecEnvironment,
        values: &mut HashMap<String, Value>,
        (): (),
    ) {
        let Some(ref expr) = item.calculate else {
            return;
        };
        let normalized_expr = resolve_qualified_repeat_refs(expr, &item.path);
        let Ok(parsed) = parse(&normalized_expr) else {
            return;
        };

        let result = walk.fel.evaluate(&parsed, env);
        let coerced = coerce_calculated_value(item, result.value);
        let json_val = fel_to_ui_json(&coerced);
        self.changed |= values.get(&item.path) != Some(&json_val);

        values.insert(item.path.clone(), json_val.clone());
        item.value = json_val;
        env.set_field(&item.path, coerced);
    }
}

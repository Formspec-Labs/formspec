//! Seed `initialValue` into flat data when a field path is missing (9e).

use std::collections::HashMap;

use serde_json::Value;

use crate::fel_eval::Fel;
use crate::types::ItemInfo;

/// Seed initial values for fields that are missing from data (9e).
/// If initialValue is a string starting with "=", evaluate as FEL expression.
/// Otherwise use as literal.
pub(crate) fn seed_initial_values(
    items: &[ItemInfo],
    data: &mut HashMap<String, Value>,
    now_iso: Option<&str>,
    fel: Fel<'_>,
) {
    for item in items {
        if let Some(ref init_val) = item.initial_value
            && !data.contains_key(&item.path)
        {
            match init_val {
                Value::String(s) if s.starts_with('=') => {
                    // FEL expression — evaluate in a temporary env with current data
                    let expr_str = &s[1..];
                    if let Ok(parsed) = fel_core::parse(expr_str) {
                        let mut env = fel_core::FormspecEnvironment::new();
                        if let Some(now_iso) = now_iso {
                            env.set_now_from_iso(now_iso);
                        }
                        for (k, v) in data.iter() {
                            env.set_field(k, crate::fel_json::json_to_runtime_fel(v));
                        }
                        let result = fel.evaluate(&parsed, &env);
                        data.insert(item.path.clone(), fel_core::fel_to_json(&result.value));
                    }
                }
                _ => {
                    data.insert(item.path.clone(), init_val.clone());
                }
            }
        }
        seed_initial_values(&item.children, data, now_iso, fel);
    }
}

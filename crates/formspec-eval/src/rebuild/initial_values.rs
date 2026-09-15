//! Seed `initialValue` into flat data when a field path is missing (9e).

use std::collections::HashMap;

use fel_core::FormspecEnvironment;
use serde_json::Value;

use crate::fel_eval::Fel;
use crate::fel_json::json_to_runtime_fel;
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
    let mut env = SeedEnv {
        now_iso,
        env: None,
        dirty: Vec::new(),
    };
    seed_items(items, data, fel, &mut env);
}

/// The environment `=` initial values evaluate in.
///
/// Rebuilding it from every value per expression cost O(seeded items × data) — the product of two
/// independent inputs. It is built on the first `=` value a pass meets (a definition with none pays
/// nothing) and carries each seeded value forward, so the pass costs O(data + items) instead.
struct SeedEnv<'a> {
    /// Clock backing `now()` / `today()` in seeded expressions.
    now_iso: Option<&'a str>,
    /// The environment, once some `=` initial value has needed it.
    env: Option<FormspecEnvironment>,
    /// Paths seeded before the environment existed, folded in when it is built.
    dirty: Vec<String>,
}

impl SeedEnv<'_> {
    /// The environment reflecting every value currently in `data`.
    fn get(&mut self, data: &HashMap<String, Value>) -> &FormspecEnvironment {
        let now_iso = self.now_iso;
        let env = self.env.get_or_insert_with(|| {
            let mut env = FormspecEnvironment::new();
            if let Some(now_iso) = now_iso {
                env.set_now_from_iso(now_iso);
            }
            for (path, value) in data {
                env.set_field(path, json_to_runtime_fel(value));
            }
            env
        });
        for path in self.dirty.drain(..) {
            if let Some(value) = data.get(&path) {
                env.set_field(&path, json_to_runtime_fel(value));
            }
        }
        env
    }

    /// Records a value just seeded at `path`, so later expressions resolve it.
    fn seeded(&mut self, path: &str) {
        if self.env.is_some() {
            self.dirty.push(path.to_string());
        }
    }
}

/// Walks the item tree depth-first, seeding every missing field against `env`.
fn seed_items(
    items: &[ItemInfo],
    data: &mut HashMap<String, Value>,
    fel: Fel<'_>,
    env: &mut SeedEnv<'_>,
) {
    for item in items {
        if let Some(ref init_val) = item.initial_value
            && !data.contains_key(&item.path)
        {
            match init_val {
                Value::String(s) if s.starts_with('=') => {
                    if let Ok(parsed) = fel_core::parse(&s[1..]) {
                        let result = fel.evaluate(&parsed, env.get(data));
                        data.insert(item.path.clone(), fel_core::fel_to_json(&result.value));
                        env.seeded(&item.path);
                    }
                }
                _ => {
                    data.insert(item.path.clone(), init_val.clone());
                    env.seeded(&item.path);
                }
            }
        }
        seed_items(&item.children, data, fel, env);
    }
}

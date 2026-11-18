//! Seed `initialValue` into flat data when a field path is missing (9e).

use std::collections::HashMap;

use fel_core::exact_json::Value;

use crate::EvalOptions;
use crate::fel_eval::Fel;
use crate::fel_json::{fel_to_runtime_json, json_to_runtime_fel_typed};
use crate::scope::{ScopeData, ScopeIndex};
use crate::types::ItemInfo;

/// Seed initial values for fields that are missing from data (9e).
/// If initialValue is a string starting with "=", evaluate as FEL expression.
/// Otherwise use as literal.
pub(crate) fn seed_initial_values(
    items: &[ItemInfo],
    data: &mut HashMap<String, Value>,
    index: &ScopeIndex,
    options: &EvalOptions<'_>,
) {
    let mut env = SeedEnv {
        index,
        options,
        state: None,
        dirty: Vec::new(),
    };
    seed_items(items, data, Fel::new(options.extensions), &mut env);
}

/// The environment `=` initial values evaluate in.
///
/// Rebuilding it from every value per expression cost O(seeded items × data) — the product of two
/// independent inputs. It is built on the first `=` value a pass meets (a definition with none pays
/// nothing) and carries each seeded value forward, so the pass costs O(data + items) instead.
struct SeedEnv<'a> {
    index: &'a ScopeIndex,
    options: &'a EvalOptions<'a>,
    state: Option<ScopeData>,
    /// Paths seeded before the environment existed, folded in when it is built.
    dirty: Vec<String>,
}

impl SeedEnv<'_> {
    fn get(&mut self, data: &HashMap<String, Value>) -> &ScopeData {
        let state = self
            .state
            .get_or_insert_with(|| ScopeData::for_values(self.index, data, self.options));
        for path in self.dirty.drain(..) {
            if let Some(value) = data.get(&path) {
                state.set_field(
                    &path,
                    json_to_runtime_fel_typed(value, self.index.data_type(&path)),
                );
            }
        }
        state
    }

    /// Records a value just seeded at `path`, so later expressions resolve it.
    fn seeded(&mut self, path: &str) {
        if self.state.is_some() {
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
                        let index = env.index;
                        let result = fel.evaluate(&parsed, &env.get(data).site(index, &item.path));
                        data.insert(item.path.clone(), fel_to_runtime_json(&result.value));
                        env.seeded(&item.path);
                    }
                }
                _ => {
                    data.insert(item.path.clone(), init_val.clone());
                    env.seeded(&item.path);
                }
            }
        }
        // The browser still owns repeat-row initialization until fs-i731.
        if !item.repeatable {
            seed_items(&item.children, data, fel, env);
        }
    }
}

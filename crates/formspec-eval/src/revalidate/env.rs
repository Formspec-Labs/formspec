//! FEL environment construction for validation: fields, variables, instances, repeat arrays, row aliases.
#![allow(clippy::missing_docs_in_private_items)]

use std::collections::HashMap;

use fel_core::{FormspecEnvironment, Value as EnvVal, json_to_fel};
use serde_json::Value;

use crate::fel_json::json_to_runtime_fel_typed;
use crate::rebuild::is_repeat_group_array;
use crate::recalculate::repeats::{ResponseIndex, data_type_of};
use crate::types::ItemInfo;

/// Apply excludedValue="null" to the FEL environment for non-relevant items (9a).
pub(super) fn apply_excluded_values_to_env(items: &[ItemInfo], env: &mut FormspecEnvironment) {
    for item in items {
        if !item.relevant && item.excluded_value == Some(crate::types::ExcludedValueMode::Null) {
            env.set_field(&item.path, EnvVal::Null);
        }
        apply_excluded_values_to_env(&item.children, env);
    }
}

#[cfg(test)]
pub(crate) fn build_validation_env(
    values: &HashMap<String, Value>,
    variables: &HashMap<String, EnvVal>,
    now_iso: Option<&str>,
    instances: &HashMap<String, Value>,
) -> FormspecEnvironment {
    build_validation_env_typed(values, variables, now_iso, instances, &HashMap::new())
}

pub(crate) fn build_validation_env_typed(
    values: &HashMap<String, Value>,
    variables: &HashMap<String, EnvVal>,
    now_iso: Option<&str>,
    instances: &HashMap<String, Value>,
    data_types: &HashMap<String, String>,
) -> FormspecEnvironment {
    let mut env = FormspecEnvironment::new();
    if let Some(now_iso) = now_iso {
        env.set_now_from_iso(now_iso);
    }
    for (k, v) in values {
        // Skip repeat group arrays — flat indexed keys exist and FEL should
        // use those instead (array path resolution uses 1-based indexing).
        if !is_repeat_group_array(v) {
            env.set_field(k, json_to_runtime_fel_typed(v, data_type_of(data_types, k)));
        }
    }
    env.variables.clone_from(variables);
    for (name, value) in instances {
        env.set_instance(name, json_to_fel(value));
    }
    env
}

/// `$group` row arrays for every repeatable item, built once and swapped in per shape.
///
/// Values do not change during revalidation, so the arrays are too; swapping moves
/// them between this set and the env instead of rebuilding them for every shape.
pub(super) struct RepeatGroupArrays {
    /// Group path and the value on the other side of the swap (`None`: absent).
    slots: Vec<(String, Option<EnvVal>)>,
}

impl RepeatGroupArrays {
    pub(super) fn new(
        items: &[ItemInfo],
        values: &HashMap<String, Value>,
        index: &ResponseIndex,
    ) -> Self {
        let mut slots = Vec::new();
        collect_repeat_group_arrays(items, values, index, &mut slots);
        Self { slots }
    }

    /// Exchange the arrays with the env's values at those paths; a second call restores.
    pub(super) fn swap(&mut self, env: &mut FormspecEnvironment) {
        for (path, slot) in &mut self.slots {
            *slot = match slot.take() {
                Some(value) => env.data.insert(path.clone(), value),
                None => env.data.remove(path.as_str()),
            };
        }
    }
}

fn collect_repeat_group_arrays(
    items: &[ItemInfo],
    values: &HashMap<String, Value>,
    index: &ResponseIndex,
    slots: &mut Vec<(String, Option<EnvVal>)>,
) {
    for item in items {
        if item.repeatable
            && let Some(array) = index
                .repeats
                .fel_array(&item.path, values, &index.data_types)
        {
            slots.push((item.path.clone(), Some(array)));
        }
        collect_repeat_group_arrays(&item.children, values, index, slots);
    }
}

pub(super) fn bind_sibling_aliases(
    env: &mut FormspecEnvironment,
    values: &HashMap<String, Value>,
    data_types: &HashMap<String, String>,
    concrete_path: &str,
) -> HashMap<String, Option<EnvVal>> {
    let Some((row_prefix, _)) = concrete_path.rsplit_once('.') else {
        return HashMap::new();
    };

    let mut saved = HashMap::new();
    let prefix = format!("{row_prefix}.");
    for (path, value) in values {
        if let Some(alias) = path.strip_prefix(&prefix)
            && !alias.contains('.')
        {
            saved.insert(alias.to_string(), env.data.get(alias).cloned());
            env.set_field(
                alias,
                json_to_runtime_fel_typed(value, data_type_of(data_types, path)),
            );
        }
    }
    saved
}

pub(super) fn restore_sibling_aliases(
    env: &mut FormspecEnvironment,
    saved_aliases: HashMap<String, Option<EnvVal>>,
) {
    for (alias, previous) in saved_aliases {
        match previous {
            Some(value) => env.set_field(&alias, value),
            None => {
                env.data.remove(&alias);
            }
        }
    }
}

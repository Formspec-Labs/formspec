//! FEL environment construction for validation: fields, variables, instances, repeat arrays, row aliases.
#![allow(clippy::missing_docs_in_private_items)]

use std::collections::HashMap;

use fel_core::{FormspecEnvironment, Value as EnvVal, json_to_fel};
use serde_json::Value;

use formspec_core::path_utils::{Path, PathSegment};

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

/// The FEL repeat context (`@index`, `@count`, `@current`, `prev()`, `next()`, `parent()`) for concrete row
/// paths visited in order, as a wildcard Shape visits `rows[0].qty`, `rows[1].qty`, ….
///
/// Every enclosing repeat is entered, outermost first, so `parent()` reads the outer row exactly as it does
/// for a Bind constraint under the recalculate walk's `InstanceScope`. Revalidation never writes values, so
/// a group's rows are built once when its first path is entered and only `current`/`index` move after that;
/// `InstanceScope` also refreshes a row its calculates wrote, which validation has no need for.
pub(super) struct RowContext {
    /// Group path and instance of each repeat currently pushed, outermost first.
    entered: Vec<(String, usize)>,
}

impl RowContext {
    pub(super) fn new() -> Self {
        Self {
            entered: Vec::new(),
        }
    }

    /// Point the repeat context at every repeat instance `concrete_path` sits in, outermost first.
    pub(super) fn enter(
        &mut self,
        concrete_path: &str,
        env: &mut FormspecEnvironment,
        values: &HashMap<String, Value>,
        index: &ResponseIndex,
    ) {
        let wanted = enclosing_instances(concrete_path);

        // Keep the contexts the last path shared with this one; leave the rest, innermost first.
        let keep = wanted
            .iter()
            .zip(&self.entered)
            .take_while(|(want, have)| want.0 == have.0)
            .count();
        while self.entered.len() > keep {
            self.entered.pop();
            env.pop_repeat();
        }

        // A kept context moves to this path's row instead of being rebuilt: same group, a later row. The
        // env's chain runs innermost-first, and after the pops above its innermost is `entered[keep - 1]`.
        let mut context = env.repeat_context.as_mut();
        for level in (0..keep).rev() {
            let Some(current) = context else { break };
            let instance = wanted[level].1;
            if self.entered[level].1 != instance && instance < current.collection.len() {
                current.current = current.collection[instance].clone();
                current.index = instance + 1;
                self.entered[level].1 = instance;
            }
            context = current.parent.as_deref_mut();
        }

        for (group, instance) in &wanted[keep.min(wanted.len())..] {
            let rows = index.repeats.fel_rows(group, values, &index.data_types);
            let Some(current) = rows.get(*instance).cloned() else {
                return;
            };
            env.push_repeat(current, instance + 1, rows.len(), rows);
            self.entered.push((group.clone(), *instance));
        }
    }

    /// Pop every repeat context this pushed.
    pub(super) fn finish(&mut self, env: &mut FormspecEnvironment) {
        for _ in self.entered.drain(..) {
            env.pop_repeat();
        }
    }
}

/// Every repeat instance `concrete_path` sits in, outermost first: `rows[1].inner[0].qty` →
/// `[("rows", 1), ("rows[1].inner", 0)]`.
fn enclosing_instances(concrete_path: &str) -> Vec<(String, usize)> {
    let mut enclosing = Vec::new();
    let mut prefix: Vec<PathSegment> = Vec::new();
    for segment in Path::parse(concrete_path).segments {
        if let PathSegment::Indexed(instance) = segment {
            enclosing.push((
                Path {
                    segments: prefix.clone(),
                }
                .to_string(),
                instance,
            ));
        }
        prefix.push(segment);
    }
    enclosing
}

/// Response values grouped by parent path, built once per revalidation.
///
/// A constraint or shape at `rows[3].qty` binds the bare siblings under `rows[3]`
/// (`$qty`, `$price`). Reading only that parent's bucket keeps each binding O(row)
/// instead of scanning every response value per constraint (O(constraints x values)).
pub(super) struct SiblingValues<'a> {
    /// Parent path to its direct children: `(alias, full path, value)`.
    by_parent: HashMap<&'a str, Vec<(&'a str, &'a str, &'a Value)>>,
    data_types: &'a HashMap<String, String>,
}

impl<'a> SiblingValues<'a> {
    pub(super) fn new(
        values: &'a HashMap<String, Value>,
        data_types: &'a HashMap<String, String>,
    ) -> Self {
        let mut by_parent: HashMap<&str, Vec<_>> = HashMap::new();
        for (path, value) in values {
            if let Some((parent, alias)) = path.rsplit_once('.') {
                by_parent
                    .entry(parent)
                    .or_default()
                    .push((alias, path.as_str(), value));
            }
        }
        Self {
            by_parent,
            data_types,
        }
    }

    /// Field `dataType` for a concrete response path.
    pub(super) fn data_type(&self, path: &str) -> Option<&str> {
        data_type_of(self.data_types, path)
    }

    /// Bind `concrete_path`'s bare siblings into `env`, typed by their `dataType`.
    ///
    /// Returns the shadowed env values for [`restore_sibling_aliases`].
    pub(super) fn bind(
        &self,
        env: &mut FormspecEnvironment,
        concrete_path: &str,
    ) -> HashMap<String, Option<EnvVal>> {
        let Some(siblings) = concrete_path
            .rsplit_once('.')
            .and_then(|(parent, _)| self.by_parent.get(parent))
        else {
            return HashMap::new();
        };
        siblings
            .iter()
            .map(|&(alias, path, value)| {
                let previous = env.data.get(alias).cloned();
                env.set_field(
                    alias,
                    json_to_runtime_fel_typed(value, self.data_type(path)),
                );
                (alias.to_string(), previous)
            })
            .collect()
    }
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

//! Repeat groups: indexed row paths, per-instance FEL scope, nested JSON path building.
//!
//! A [`RepeatIndex`] buckets every response path by repeat group and instance once
//! per phase, so building a row reads only that row's paths. Walking a group's
//! instances then costs O(values) per pass instead of O(instances x values) per
//! instance.

use std::collections::{HashMap, HashSet};

use fel_core::{FormspecEnvironment, Value};
use serde_json::Value as JsonValue;

use super::json_fel::{json_to_runtime_fel, json_to_runtime_fel_typed};
use crate::fel_json::typed_json_leaf;
use crate::types::{ItemInfo, collect_data_types};

use formspec_core::path_utils::{Path, PathSegment};

/// Field data types and repeat-group row paths for one evaluation phase.
pub(crate) struct ResponseIndex {
    /// Field `dataType` by concrete and un-indexed path.
    pub(crate) data_types: HashMap<String, String>,
    /// Paths under each repeat group instance.
    pub(crate) repeats: RepeatIndex,
}

impl ResponseIndex {
    /// Index `items` and every path that can hold a value: `values` keys and item paths.
    ///
    /// Calculates and defaults only write item paths, so the index stays complete
    /// while a phase writes `values`.
    pub(crate) fn new(items: &[ItemInfo], values: &HashMap<String, JsonValue>) -> Self {
        let mut item_paths = Vec::new();
        collect_item_paths(items, &mut item_paths);
        Self {
            data_types: collect_data_types(items),
            repeats: RepeatIndex::new(
                values
                    .keys()
                    .map(String::as_str)
                    .chain(item_paths.iter().copied()),
            ),
        }
    }

    /// Field `dataType` for a concrete response path, if the path names a typed field.
    pub(crate) fn data_type(&self, path: &str) -> Option<&str> {
        data_type_of(&self.data_types, path)
    }
}

fn collect_item_paths<'a>(items: &'a [ItemInfo], out: &mut Vec<&'a str>) {
    for item in items {
        out.push(&item.path);
        collect_item_paths(&item.children, out);
    }
}

/// Response paths bucketed by repeat group and instance index.
///
/// `rows[0].tasks[1].mins` is filed under group `rows` instance 0 and under group
/// `rows[0].tasks` instance 1. Rows read current `values`, so writes to indexed
/// paths show up without rebuilding.
#[derive(Debug, Default)]
pub(crate) struct RepeatIndex {
    groups: HashMap<String, HashMap<usize, Vec<String>>>,
}

impl RepeatIndex {
    /// Bucket `paths` (duplicates ignored) by every `group[i].` prefix they carry.
    pub(crate) fn new<'a>(paths: impl IntoIterator<Item = &'a str>) -> Self {
        let mut groups: HashMap<String, HashMap<usize, Vec<String>>> = HashMap::new();
        let mut seen = HashSet::new();
        for path in paths {
            if !seen.insert(path) {
                continue;
            }
            for (group_end, index) in instance_prefixes(path) {
                groups
                    .entry(path[..group_end].to_string())
                    .or_default()
                    .entry(index)
                    .or_default()
                    .push(path.to_string());
            }
        }
        Self { groups }
    }

    /// Paths under `group[index].`, whether or not they currently hold a value.
    pub(crate) fn instance_paths(&self, group: &str, index: usize) -> &[String] {
        self.groups
            .get(group)
            .and_then(|instances| instances.get(&index))
            .map_or(&[], Vec::as_slice)
    }

    /// Instance count from current `values` (same rule as `detect_repeat_count`).
    ///
    /// An array value at `group` gives its length; otherwise the highest instance
    /// index that holds a value, plus one.
    pub(crate) fn count(&self, group: &str, values: &HashMap<String, JsonValue>) -> usize {
        if let Some(JsonValue::Array(rows)) = values.get(group) {
            return rows.len();
        }
        self.groups.get(group).map_or(0, |instances| {
            instances
                .iter()
                .filter(|(_, paths)| paths.iter().any(|path| values.contains_key(path)))
                .map(|(index, _)| index + 1)
                .max()
                .unwrap_or(0)
        })
    }

    /// FEL row object for `group[index]`, each leaf typed by its field `dataType`.
    ///
    /// Core §2.1.3: a `date` leaf reads as FEL `date` through `$group`, `@current`,
    /// and nested-group aliases alike.
    pub(crate) fn fel_row(
        &self,
        group: &str,
        index: usize,
        values: &HashMap<String, JsonValue>,
        data_types: &HashMap<String, String>,
    ) -> Value {
        json_to_runtime_fel(&self.json_row(group, index, values, data_types))
    }

    fn json_row(
        &self,
        group: &str,
        index: usize,
        values: &HashMap<String, JsonValue>,
        data_types: &HashMap<String, String>,
    ) -> JsonValue {
        let prefix = format!("{group}[{index}].");
        let mut row = JsonValue::Object(serde_json::Map::new());
        for path in self.instance_paths(group, index) {
            if let Some(value) = values.get(path) {
                set_nested_json_path(
                    &mut row,
                    &path[prefix.len()..],
                    typed_json_leaf(value, data_type_of(data_types, path)),
                );
            }
        }
        row
    }

    /// All FEL rows of `group`, in instance order.
    pub(crate) fn fel_rows(
        &self,
        group: &str,
        values: &HashMap<String, JsonValue>,
        data_types: &HashMap<String, String>,
    ) -> Vec<Value> {
        (0..self.count(group, values))
            .map(|index| self.fel_row(group, index, values, data_types))
            .collect()
    }

    /// FEL row array for `group`, or `None` when it has no instances.
    pub(crate) fn fel_array(
        &self,
        group: &str,
        values: &HashMap<String, JsonValue>,
        data_types: &HashMap<String, String>,
    ) -> Option<Value> {
        let rows = self.fel_rows(group, values, data_types);
        (!rows.is_empty()).then_some(Value::Array(rows))
    }
}

/// `(group end, index)` for each `group[index].` prefix of `path`.
fn instance_prefixes(path: &str) -> impl Iterator<Item = (usize, usize)> + '_ {
    path.match_indices('[').filter_map(|(open, _)| {
        let rest = &path[open + 1..];
        let close = rest.find(']')?;
        let index = rest[..close].parse::<usize>().ok()?;
        rest[close + 1..].starts_with('.').then_some((open, index))
    })
}

/// Group path and instance index of a repeat instance prefix like `rows[2]`.
fn parse_repeat_instance_prefix(prefix: &str) -> Option<(String, usize)> {
    let mut segments = Path::parse(prefix).segments;
    let PathSegment::Indexed(index) = segments.pop()? else {
        return None;
    };
    Some((Path { segments }.to_string(), index))
}

/// FEL scope for walking one repeat group's expanded children, instance by instance.
///
/// For the current instance it binds bare sibling aliases (`$rd`), nested-group
/// arrays, and the repeat context (`@current`, `@index`, `@count`, `prev()`,
/// `next()`). The row collection is built once per walk; entering the next
/// instance refreshes only the row just left, which holds any values its items wrote.
pub(crate) struct InstanceScope {
    /// Group path and FEL rows, while the rows are not lent to the repeat context.
    group: Option<(String, Vec<Value>)>,
    /// Instance prefix (`rows[2]`) and index currently entered.
    current: Option<(String, Option<usize>)>,
    /// Whether this scope pushed the innermost repeat context.
    context_active: bool,
    aliases: Vec<String>,
    nested_groups: Vec<String>,
    saved: HashMap<String, Option<Value>>,
}

impl InstanceScope {
    /// Scope for `children`, the expanded instance children of one repeat group.
    pub(crate) fn new(
        children: &[ItemInfo],
        values: &HashMap<String, JsonValue>,
        index: &ResponseIndex,
    ) -> Self {
        let group = children
            .first()
            .and_then(|child| child.parent_path.as_deref())
            .and_then(parse_repeat_instance_prefix)
            .map(|(group, _)| {
                let rows = index.repeats.fel_rows(&group, values, &index.data_types);
                (group, rows)
            });
        Self {
            group,
            current: None,
            context_active: false,
            aliases: Vec::new(),
            nested_groups: Vec::new(),
            saved: HashMap::new(),
        }
    }

    /// Bind the FEL scope for `item`'s instance, leaving the previous one first.
    pub(crate) fn enter(
        &mut self,
        item: &ItemInfo,
        env: &mut FormspecEnvironment,
        values: &HashMap<String, JsonValue>,
        index: &ResponseIndex,
    ) {
        let prefix = item.parent_path.as_deref().unwrap_or_default();
        if self
            .current
            .as_ref()
            .is_some_and(|(current, _)| current == prefix)
        {
            return;
        }
        let previous = self.current.take().and_then(|(_, instance)| instance);
        self.restore_aliases(env);

        let instance = parse_repeat_instance_prefix(prefix)
            .filter(|(group, _)| self.group_path() == Some(group.as_str()))
            .map(|(_, instance)| instance);
        self.current = Some((prefix.to_string(), instance));
        self.bind_aliases(prefix, instance, env, values, index);
        self.move_repeat_context(previous, instance, env, values, index);
    }

    /// After `item`'s calculate wrote `values`, rebind its bare alias and nested-group arrays.
    pub(crate) fn refresh_after_calculate(
        &mut self,
        item: &ItemInfo,
        env: &mut FormspecEnvironment,
        values: &HashMap<String, JsonValue>,
        index: &ResponseIndex,
    ) {
        let Some(value) = values.get(&item.path) else {
            return;
        };
        env.set_field(
            &item.key,
            json_to_runtime_fel_typed(value, item.data_type.as_deref()),
        );
        let Some((prefix, _)) = self.current.as_ref() else {
            return;
        };
        for name in &self.nested_groups {
            let nested = format!("{prefix}.{name}");
            set_or_remove_field(
                env,
                name,
                index.repeats.fel_array(&nested, values, &index.data_types),
            );
        }
    }

    /// Leave the last instance: pop the repeat context and restore shadowed aliases.
    pub(crate) fn finish(mut self, env: &mut FormspecEnvironment) {
        if self.context_active {
            env.pop_repeat();
        }
        self.restore_aliases(env);
    }

    fn group_path(&self) -> Option<&str> {
        self.group.as_ref().map(|(group, _)| group.as_str())
    }

    fn bind_aliases(
        &mut self,
        prefix: &str,
        instance: Option<usize>,
        env: &mut FormspecEnvironment,
        values: &HashMap<String, JsonValue>,
        index: &ResponseIndex,
    ) {
        let (Some(group), Some(instance)) = (self.group_path(), instance) else {
            return;
        };
        let mut nested_groups = Vec::new();

        for path in index.repeats.instance_paths(group, instance) {
            let (Some(value), Some(relative)) = (
                values.get(path),
                path.strip_prefix(prefix)
                    .and_then(|rest| rest.strip_prefix('.')),
            ) else {
                continue;
            };
            if !relative.contains('.') {
                let alias = json_to_runtime_fel_typed(value, index.data_type(path));
                self.shadow(env, relative, Some(alias));
                continue;
            }
            let segments = Path::parse(relative).segments;
            if let [PathSegment::Exact(name), PathSegment::Indexed(_), ..] = segments.as_slice()
                && !name.contains('.')
                && !nested_groups.contains(name)
            {
                nested_groups.push(name.clone());
            }
        }

        for name in &nested_groups {
            let nested = format!("{prefix}.{name}");
            let array = index.repeats.fel_array(&nested, values, &index.data_types);
            self.shadow(env, name, array);
        }
        self.nested_groups = nested_groups;
    }

    /// Set (or remove) env field `name`, remembering its value from before this instance.
    fn shadow(&mut self, env: &mut FormspecEnvironment, name: &str, value: Option<Value>) {
        if !self.saved.contains_key(name) {
            self.saved
                .insert(name.to_string(), env.data.get(name).cloned());
            self.aliases.push(name.to_string());
        }
        set_or_remove_field(env, name, value);
    }

    fn restore_aliases(&mut self, env: &mut FormspecEnvironment) {
        for name in self.aliases.drain(..) {
            set_or_remove_field(env, &name, self.saved.remove(&name).flatten());
        }
        self.nested_groups.clear();
    }

    /// Point the repeat context at `instance`, refreshing the `previous` row in place.
    fn move_repeat_context(
        &mut self,
        previous: Option<usize>,
        instance: Option<usize>,
        env: &mut FormspecEnvironment,
        values: &HashMap<String, JsonValue>,
        index: &ResponseIndex,
    ) {
        let Some((group, rows)) = self.group.as_mut() else {
            return;
        };
        if self.context_active {
            let context = env
                .repeat_context
                .as_mut()
                .expect("an active scope owns the innermost repeat context");
            if let Some(previous) = previous {
                context.collection[previous] =
                    index
                        .repeats
                        .fel_row(group, previous, values, &index.data_types);
            }
            match instance.filter(|instance| *instance < context.collection.len()) {
                Some(instance) => {
                    context.current = context.collection[instance].clone();
                    context.index = instance + 1;
                }
                None => {
                    // Instances run in index order, so no later instance has a row either.
                    env.pop_repeat();
                    self.context_active = false;
                }
            }
        } else if let Some(instance) = instance.filter(|instance| *instance < rows.len()) {
            let count = rows.len();
            let current = rows[instance].clone();
            env.push_repeat(current, instance + 1, count, std::mem::take(rows));
            self.context_active = true;
        }
    }
}

fn set_or_remove_field(env: &mut FormspecEnvironment, name: &str, value: Option<Value>) {
    match value {
        Some(value) => env.set_field(name, value),
        None => {
            env.data.remove(name);
        }
    }
}

/// Bind `$group` row arrays for every repeatable item, nested instances included.
pub(crate) fn populate_repeat_group_arrays(
    items: &[ItemInfo],
    values: &HashMap<String, JsonValue>,
    index: &ResponseIndex,
    env: &mut FormspecEnvironment,
) {
    for item in items {
        if item.repeatable
            && let Some(array) = index
                .repeats
                .fel_array(&item.path, values, &index.data_types)
        {
            env.set_field(&item.path, array);
        }
        populate_repeat_group_arrays(&item.children, values, index, env);
    }
}

/// Field `dataType` for a concrete response path, if the path names a typed field.
pub(crate) fn data_type_of<'a>(
    data_types: &'a HashMap<String, String>,
    path: &str,
) -> Option<&'a str> {
    data_types.get(path).map(String::as_str)
}

/// Build the nested-object path under `target` and write `value` at the leaf.
///
/// Path semantics follow [`Path::parse`]. `Exact` and `Indexed` segments build
/// objects and arrays respectively. `Wildcard` and `Special` segments are
/// **filtered out upfront** (no-op): they are not valid in a concrete data-path
/// and would have no defined write target. Pass concrete paths only —
/// repeat-group data contexts emit `[Indexed(_)]`, never `[Wildcard]` or
/// `[Special]`. The upfront filter ensures the `next_is_index` lookahead sees
/// only real container segments; without it, a `Wildcard` between an `Exact`
/// and an `Indexed` would create the wrong container type and then overwrite
/// it on the next step.
pub(crate) fn set_nested_json_path(target: &mut JsonValue, path: &str, value: JsonValue) {
    // Filter to concrete segments only — see fn docstring.
    let segments: Vec<PathSegment> = Path::parse(path)
        .segments
        .into_iter()
        .filter(|s| matches!(s, PathSegment::Exact(_) | PathSegment::Indexed(_)))
        .collect();
    if segments.is_empty() {
        *target = value;
        return;
    }

    let mut current = target;
    for i in 0..segments.len() - 1 {
        let next_is_index = matches!(segments[i + 1], PathSegment::Indexed(_));
        match &segments[i] {
            PathSegment::Exact(key) => {
                if !current.is_object() {
                    *current = JsonValue::Object(serde_json::Map::new());
                }
                let map = current.as_object_mut().expect("object ensured above");
                current = map.entry(key.clone()).or_insert_with(|| {
                    if next_is_index {
                        JsonValue::Array(vec![])
                    } else {
                        JsonValue::Object(serde_json::Map::new())
                    }
                });
            }
            PathSegment::Indexed(array_index) => {
                if !current.is_array() {
                    *current = JsonValue::Array(vec![]);
                }
                let array = current.as_array_mut().expect("array ensured above");
                while array.len() <= *array_index {
                    array.push(JsonValue::Null);
                }
                if array[*array_index].is_null() {
                    array[*array_index] = if next_is_index {
                        JsonValue::Array(vec![])
                    } else {
                        JsonValue::Object(serde_json::Map::new())
                    };
                }
                current = &mut array[*array_index];
            }
            _ => unreachable!("filter above leaves only Exact and Indexed"),
        }
    }

    match &segments[segments.len() - 1] {
        PathSegment::Exact(key) => {
            if !current.is_object() {
                *current = JsonValue::Object(serde_json::Map::new());
            }
            current
                .as_object_mut()
                .expect("object ensured above")
                .insert(key.clone(), value);
        }
        PathSegment::Indexed(array_index) => {
            if !current.is_array() {
                *current = JsonValue::Array(vec![]);
            }
            let array = current.as_array_mut().expect("array ensured above");
            while array.len() <= *array_index {
                array.push(JsonValue::Null);
            }
            array[*array_index] = value;
        }
        _ => unreachable!("filter above leaves only Exact and Indexed"),
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;
    use serde_json::json;

    #[test]
    fn set_nested_json_path_object() {
        let mut target = json!({});
        set_nested_json_path(&mut target, "a.b.c", json!(42));
        assert_eq!(target, json!({"a": {"b": {"c": 42}}}));
    }

    #[test]
    fn set_nested_json_path_indexed() {
        let mut target = json!({});
        set_nested_json_path(&mut target, "rows[0].name", json!("Alice"));
        set_nested_json_path(&mut target, "rows[1].name", json!("Bob"));
        assert_eq!(
            target,
            json!({"rows": [{"name": "Alice"}, {"name": "Bob"}]})
        );
    }

    /// F-8 regression: Wildcard and Special segments are elided silently
    /// (matching the pre-refactor `tokenize_json_path` behavior of dropping
    /// non-numeric bracket content). `a[*].b` writes to `a.b`.
    #[test]
    fn set_nested_json_path_elides_wildcard_and_special() {
        let mut target = json!({});
        set_nested_json_path(&mut target, "a[*].b", json!(1));
        assert_eq!(target, json!({"a": {"b": 1}}));

        let mut target2 = json!({});
        set_nested_json_path(&mut target2, "a[@index].b", json!(2));
        assert_eq!(target2, json!({"a": {"b": 2}}));
    }

    /// F-8 (review-2): a Wildcard between an Exact and an Indexed must not
    /// cause the intermediate container to be created with the wrong type
    /// (Object) and then overwritten by the next Indexed step. The upfront
    /// filter strips Wildcard/Special so the lookahead sees the true next
    /// concrete segment. `a[*][0]` after filter is `a[0]` → Array.
    #[test]
    fn set_nested_json_path_wildcard_between_exact_and_indexed() {
        let mut target = json!({});
        set_nested_json_path(&mut target, "a[*][0]", json!("first"));
        // After filter: segments are [Exact("a"), Indexed(0)] → a is an Array.
        assert_eq!(target, json!({"a": ["first"]}));

        // Same shape with Special instead of Wildcard.
        let mut target2 = json!({});
        set_nested_json_path(&mut target2, "a[@idx][0]", json!("second"));
        assert_eq!(target2, json!({"a": ["second"]}));
    }

    #[test]
    fn set_nested_json_path_empty_path_replaces_target() {
        let mut target = json!({"keep": 1});
        set_nested_json_path(&mut target, "", json!(99));
        assert_eq!(target, json!(99));
    }
}

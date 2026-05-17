//! Repeat groups: env row arrays, bare-name instance aliases, nested JSON path building.

use std::collections::HashMap;

use fel_core::{FormspecEnvironment, Value};
use serde_json::Value as JsonValue;

use super::json_fel::json_to_runtime_fel;
use crate::types::ItemInfo;

use formspec_core::path_utils::{Path, PathSegment};

pub(crate) fn restore_instance_aliases(
    env: &mut FormspecEnvironment,
    alias_names: &[String],
    saved_values: &mut HashMap<String, Option<Value>>,
) {
    for name in alias_names {
        match saved_values.remove(name) {
            Some(Some(val)) => env.set_field(name, val),
            _ => {
                env.data.remove(name);
            }
        }
    }
}

pub(crate) fn apply_instance_aliases(
    instance_prefix: &str,
    env: &mut FormspecEnvironment,
    values: &HashMap<String, JsonValue>,
    saved_values: &mut HashMap<String, Option<Value>>,
) -> (Vec<String>, Vec<String>) {
    let mut alias_names = Vec::new();
    let mut nested_groups = Vec::new();
    let mut seen_groups = std::collections::HashSet::new();
    let prefix_dot = format!("{instance_prefix}.");

    for (k, v) in values.iter() {
        let Some(relative) = k.strip_prefix(&prefix_dot) else {
            continue;
        };
        if !relative.contains('.') {
            saved_values.insert(relative.to_string(), env.data.get(relative).cloned());
            env.set_field(relative, json_to_runtime_fel(v));
            alias_names.push(relative.to_string());
            continue;
        }

        let p = Path::parse(relative);
        if let Some(PathSegment::Exact(group_name)) = p.segments.get(0) {
            if p.segments.get(1).is_some_and(|s| matches!(s, PathSegment::Indexed(_))) {
                if !group_name.contains('.') && seen_groups.insert(group_name.to_string()) {
                    saved_values.insert(group_name.to_string(), env.data.get(group_name).cloned());
                    let group_path = format!("{instance_prefix}.{group_name}");
                    if let Some(array) = build_repeat_group_array(&group_path, values) {
                        env.set_field(group_name, json_to_runtime_fel(&array));
                    } else {
                        env.data.remove(group_name);
                    }
                    alias_names.push(group_name.to_string());
                    nested_groups.push(group_name.to_string());
                }
            }
        }
    }

    (alias_names, nested_groups)
}

pub(crate) fn refresh_nested_group_aliases(
    instance_prefix: &str,
    nested_groups: &[String],
    env: &mut FormspecEnvironment,
    values: &HashMap<String, JsonValue>,
) {
    for group_name in nested_groups {
        let group_path = format!("{instance_prefix}.{group_name}");
        if let Some(array) = build_repeat_group_array(&group_path, values) {
            env.set_field(group_name, json_to_runtime_fel(&array));
        } else {
            env.data.remove(group_name);
        }
    }
}

fn parse_repeat_instance_prefix(prefix: &str) -> Option<(String, usize)> {
    let p = Path::parse(prefix);
    if p.segments.is_empty() {
        return None;
    }
    let last = p.segments.last()?;
    if let PathSegment::Indexed(idx) = last {
        let mut group_path_segs = p.segments.clone();
        group_path_segs.pop();
        let group_path = Path { segments: group_path_segs }.to_string();
        Some((group_path, *idx))
    } else {
        None
    }
}

pub(crate) fn push_repeat_context_for_instance(
    instance_prefix: &str,
    env: &mut FormspecEnvironment,
    values: &HashMap<String, JsonValue>,
) -> bool {
    let Some((group_path, index)) = parse_repeat_instance_prefix(instance_prefix) else {
        return false;
    };
    let Some(array) = build_repeat_group_array(&group_path, values).and_then(|value| match value {
        JsonValue::Array(entries) => Some(entries),
        _ => None,
    }) else {
        return false;
    };
    let Some(current) = array.get(index).cloned() else {
        return false;
    };
    let collection = array
        .iter()
        .map(json_to_runtime_fel)
        .collect::<Vec<Value>>();
    env.push_repeat(
        json_to_runtime_fel(&current),
        index + 1,
        array.len(),
        collection,
    );
    true
}

pub(crate) fn populate_repeat_group_arrays(
    items: &[ItemInfo],
    values: &HashMap<String, JsonValue>,
    env: &mut FormspecEnvironment,
) {
    for item in items {
        if item.repeatable
            && let Some(array) = build_repeat_group_array(&item.path, values)
        {
            env.set_field(&item.path, json_to_runtime_fel(&array));
        }
        populate_repeat_group_arrays(&item.children, values, env);
    }
}

pub(crate) fn build_repeat_group_array(
    group_path: &str,
    values: &HashMap<String, JsonValue>,
) -> Option<JsonValue> {
    let count = crate::rebuild::detect_repeat_count(group_path, values);
    if count == 0 {
        return None;
    }

    let mut rows = Vec::with_capacity(count);
    for index in 0..count {
        let prefix = format!("{group_path}[{index}].");
        let mut row = JsonValue::Object(serde_json::Map::new());
        let mut has_values = false;
        for (path, value) in values {
            if let Some(relative) = path.strip_prefix(&prefix) {
                set_nested_json_path(&mut row, relative, value.clone());
                has_values = true;
            }
        }
        rows.push(if has_values {
            row
        } else {
            JsonValue::Object(serde_json::Map::new())
        });
    }

    Some(JsonValue::Array(rows))
}

pub(crate) fn set_nested_json_path(target: &mut JsonValue, path: &str, value: JsonValue) {
    let p = Path::parse(path);
    if p.segments.is_empty() {
        *target = value;
        return;
    }

    let mut current = target;
    for i in 0..p.segments.len() - 1 {
        let next_is_index = matches!(p.segments[i + 1], PathSegment::Indexed(_));
        match &p.segments[i] {
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
            _ => {} // Skip wildcards/specials for JSON building
        }
    }

    match &p.segments[p.segments.len() - 1] {
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
        _ => {} // Skip wildcards/specials
    }
}

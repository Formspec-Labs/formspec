//! Runtime seeding: prePopulate instances, repeat seedFrom, and previous non-relevant state.
#![allow(clippy::missing_docs_in_private_items)]

use crate::rebuild::detect_repeat_count;
use crate::types::ItemInfo;
use serde_json::Value;
use std::collections::HashMap;

/// Copy `definition.instances.*.data` into the instance map when the host omitted that name.
pub(crate) fn hydrate_inline_instances(definition: &Value, instances: &mut HashMap<String, Value>) {
    let Some(declared) = definition.get("instances").and_then(Value::as_object) else {
        return;
    };
    for (name, instance) in declared {
        if instances.contains_key(name) {
            continue;
        }
        if let Some(data) = instance.get("data") {
            instances.insert(name.clone(), data.clone());
        }
    }
}

/// Expand repeatable groups from `seedFrom` arrays on secondary instances (new Response only).
pub(crate) fn seed_repeat_from_instances(
    definition: &Value,
    values: &mut HashMap<String, Value>,
    instances: &HashMap<String, Value>,
) {
    let Some(items) = definition.get("items").and_then(Value::as_array) else {
        return;
    };
    for item in items {
        walk_seed_from(item, "", values, instances);
    }
}

fn walk_seed_from(
    item: &Value,
    prefix: &str,
    values: &mut HashMap<String, Value>,
    instances: &HashMap<String, Value>,
) {
    let Some(key) = item.get("key").and_then(Value::as_str) else {
        return;
    };
    let path = if prefix.is_empty() {
        key.to_string()
    } else {
        format!("{prefix}.{key}")
    };

    let repeatable = item.get("repeatable").and_then(Value::as_bool) == Some(true);
    if repeatable {
        if let Some(seed_from) = item.get("seedFrom") {
            apply_group_seed_from(item, &path, seed_from, values, instances);
        }
        return;
    }

    if let Some(children) = item.get("children").and_then(Value::as_array) {
        for child in children {
            walk_seed_from(child, &path, values, instances);
        }
    }
}

fn apply_group_seed_from(
    group: &Value,
    group_path: &str,
    seed_from: &Value,
    values: &mut HashMap<String, Value>,
    instances: &HashMap<String, Value>,
) {
    let min_repeat = group.get("minRepeat").and_then(Value::as_u64).unwrap_or(0) as usize;
    if repeat_has_host_data(group_path, values, min_repeat) {
        return;
    }
    let Some(inst_name) = seed_from.get("instance").and_then(Value::as_str) else {
        return;
    };
    let Some(array_path) = seed_from.get("path").and_then(Value::as_str) else {
        return;
    };
    let Some(instance_data) = instances.get(inst_name) else {
        return;
    };
    let array = get_by_dotted_path(instance_data, array_path);
    let n = array.as_array().map(|a| a.len()).unwrap_or(0);
    let max_repeat = group.get("maxRepeat").and_then(Value::as_u64).map(|m| m as usize);
    let mut target = n.max(min_repeat);
    if let Some(max) = max_repeat {
        target = target.min(max);
    }
    let Some(children) = group.get("children").and_then(Value::as_array) else {
        return;
    };
    for index in 0..target {
        let element = array
            .as_array()
            .and_then(|arr| arr.get(index))
            .cloned()
            .unwrap_or(Value::Null);
        let row_prefix = format!("{group_path}[{index}]");
        seed_row_children(children, &row_prefix, inst_name, &element, values);
    }
}

fn seed_row_children(
    children: &[Value],
    row_prefix: &str,
    seed_instance: &str,
    seed_element: &Value,
    values: &mut HashMap<String, Value>,
) {
    for child in children {
        let Some(key) = child.get("key").and_then(Value::as_str) else {
            continue;
        };
        let child_path = format!("{row_prefix}.{key}");
        if child.get("type").and_then(Value::as_str) == Some("field") {
            if let Some(pre) = child.get("prePopulate") {
                let inst = pre.get("instance").and_then(Value::as_str);
                let rel_path = pre.get("path").and_then(Value::as_str);
                if inst == Some(seed_instance)
                    && let Some(rel_path) = rel_path
                {
                    let val = get_by_dotted_path(seed_element, rel_path);
                    if !val.is_null() {
                        values.insert(child_path.clone(), val);
                    }
                }
            }
        }
        if let Some(grandchildren) = child.get("children").and_then(Value::as_array) {
            seed_row_children(grandchildren, &child_path, seed_instance, seed_element, values);
        }
    }
}

fn repeat_has_host_data(group_path: &str, values: &HashMap<String, Value>, min_repeat: usize) -> bool {
    if matches!(values.get(group_path), Some(Value::Array(_))) {
        return true;
    }
    let count = detect_repeat_count(group_path, values);
    if count > min_repeat {
        return true;
    }
    let prefix = format!("{group_path}[");
    values.keys().any(|key| {
        key.starts_with(&prefix)
            && values
                .get(key)
                .map(|v| !v.is_null())
                .unwrap_or(false)
    })
}

/// Mark items as previously non-relevant for transition detection.
pub(crate) fn apply_previous_non_relevant(items: &mut [ItemInfo], non_relevant_paths: &[String]) {
    for item in items.iter_mut() {
        if non_relevant_paths.contains(&item.path) {
            item.prev_relevant = false;
        }
        apply_previous_non_relevant(&mut item.children, non_relevant_paths);
    }
}

/// Walk the item tree and seed missing/null field values from named instances.
pub(crate) fn seed_prepopulate_tree(
    items: &[ItemInfo],
    values: &mut HashMap<String, Value>,
    instances: &HashMap<String, Value>,
) {
    for item in items {
        seed_prepopulate(item, values, instances);
    }
}

fn seed_prepopulate(
    item: &ItemInfo,
    values: &mut HashMap<String, Value>,
    instances: &HashMap<String, Value>,
) {
    if let Some(existing) = values.get(&item.path) {
        if !existing.is_null() {
            for child in &item.children {
                seed_prepopulate(child, values, instances);
            }
            return;
        }
    }

    if let (Some(inst_name), Some(inst_path)) =
        (&item.pre_populate_instance, &item.pre_populate_path)
    {
        if let Some(instance_data) = instances.get(inst_name) {
            let val = get_by_dotted_path(instance_data, inst_path);
            if !val.is_null() {
                values.insert(item.path.clone(), val);
            }
        }
    }

    for child in &item.children {
        seed_prepopulate(child, values, instances);
    }
}

fn get_by_dotted_path(val: &Value, path: &str) -> Value {
    let mut current = val;
    for seg in path.split('.') {
        match current.get(seg) {
            Some(v) => current = v,
            None => return Value::Null,
        }
    }
    current.clone()
}

#[cfg(test)]
mod seed_from_tests {
    use super::*;
    use serde_json::json;
    use std::collections::HashMap;

    fn rows_seed_items() -> Value {
        json!([{
            "key": "rows",
            "type": "group",
            "repeatable": true,
            "minRepeat": 0,
            "seedFrom": { "instance": "record", "path": "items" },
            "children": [{
                "key": "name",
                "type": "field",
                "dataType": "string",
                "prePopulate": { "instance": "record", "path": "name" }
            }]
        }])
    }

    fn rows_seed_definition() -> Value {
        json!({ "items": rows_seed_items() })
    }

    fn rows_seed_definition_with_record(items: Value) -> Value {
        json!({
            "items": rows_seed_items(),
            "instances": { "record": { "data": { "items": items } } }
        })
    }

    fn record_items(items: Value) -> HashMap<String, Value> {
        HashMap::from([("record".to_string(), json!({ "items": items }))])
    }

    #[test]
    fn seed_repeat_from_instances_expands_rows_and_relative_prepopulate() {
        let definition = rows_seed_definition();
        let mut values = HashMap::new();
        let instances = record_items(json!([{ "name": "ACME" }, { "name": "Widget Co" }]));
        seed_repeat_from_instances(&definition, &mut values, &instances);
        assert_eq!(values.get("rows[0].name"), Some(&json!("ACME")));
        assert_eq!(values.get("rows[1].name"), Some(&json!("Widget Co")));
    }

    #[test]
    fn seed_repeat_from_instances_skips_when_host_data_present() {
        let definition = rows_seed_definition();
        let mut values = HashMap::from([("rows[0].name".to_string(), json!("Host"))]);
        let instances = record_items(json!([{ "name": "A" }, { "name": "B" }]));
        seed_repeat_from_instances(&definition, &mut values, &instances);
        assert_eq!(values.get("rows[0].name"), Some(&json!("Host")));
        assert!(!values.contains_key("rows[1].name"));
    }

    #[test]
    fn evaluate_skips_seed_when_apply_creation_seeds_is_false() {
        let definition = rows_seed_definition_with_record(json!([{ "name": "A" }, { "name": "B" }]));
        let result = crate::evaluate(
            &definition,
            &HashMap::new(),
            &crate::EvalOptions::default().apply_creation_seeds(false),
        );
        assert!(!result.values.contains_key("rows[0].name"));
    }

    #[test]
    fn evaluate_seeds_from_inline_definition_instances() {
        let definition = rows_seed_definition_with_record(json!([{ "name": "A" }, { "name": "B" }]));
        let result = crate::evaluate(&definition, &HashMap::new(), &crate::EvalOptions::default());
        assert_eq!(result.values.get("rows[0].name"), Some(&json!("A")));
        assert_eq!(result.values.get("rows[1].name"), Some(&json!("B")));
    }

    #[test]
    fn evaluate_does_not_seed_present_empty_array() {
        let definition = rows_seed_definition_with_record(json!([{ "name": "A" }]));
        let data = HashMap::from([("rows".to_string(), json!([]))]);
        let result = crate::evaluate(&definition, &data, &crate::EvalOptions::default());
        assert!(!result.values.contains_key("rows[0].name"));
    }
}

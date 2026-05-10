//! Repeat groups: env row arrays, bare-name instance aliases, nested JSON path building.

use std::collections::HashMap;

use fel_core::{FormspecEnvironment, Value};
use serde_json::Value as JsonValue;

use super::json_fel::json_to_runtime_fel;
use crate::types::ItemInfo;

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

        if let Some(bracket_pos) = relative.find('[') {
            let group_name = &relative[..bracket_pos];
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
    if !prefix.ends_with(']') {
        return None;
    }
    let bracket = prefix.rfind('[')?;
    let index = prefix[bracket + 1..prefix.len() - 1]
        .parse::<usize>()
        .ok()?;
    Some((prefix[..bracket].to_string(), index))
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
    let tokens = tokenize_json_path(path);
    if tokens.is_empty() {
        *target = value;
        return;
    }

    let mut current = target;
    for index in 0..tokens.len() - 1 {
        let next_is_index = matches!(tokens[index + 1], JsonPathToken::Index(_));
        match &tokens[index] {
            JsonPathToken::Key(key) => {
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
            JsonPathToken::Index(array_index) => {
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
        }
    }

    match &tokens[tokens.len() - 1] {
        JsonPathToken::Key(key) => {
            if !current.is_object() {
                *current = JsonValue::Object(serde_json::Map::new());
            }
            current
                .as_object_mut()
                .expect("object ensured above")
                .insert(key.clone(), value);
        }
        JsonPathToken::Index(array_index) => {
            if !current.is_array() {
                *current = JsonValue::Array(vec![]);
            }
            let array = current.as_array_mut().expect("array ensured above");
            while array.len() <= *array_index {
                array.push(JsonValue::Null);
            }
            array[*array_index] = value;
        }
    }
}

#[derive(Clone)]
enum JsonPathToken {
    Key(String),
    Index(usize),
}

fn tokenize_json_path(path: &str) -> Vec<JsonPathToken> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let chars: Vec<char> = path.chars().collect();
    let mut index = 0;

    while index < chars.len() {
        match chars[index] {
            '.' => {
                if !current.is_empty() {
                    tokens.push(JsonPathToken::Key(std::mem::take(&mut current)));
                }
                index += 1;
            }
            '[' => {
                if !current.is_empty() {
                    tokens.push(JsonPathToken::Key(std::mem::take(&mut current)));
                }
                let mut close = index + 1;
                while close < chars.len() && chars[close] != ']' {
                    close += 1;
                }
                if close > index + 1
                    && let Ok(array_index) = path[index + 1..close].parse::<usize>()
                {
                    tokens.push(JsonPathToken::Index(array_index));
                }
                index = close.saturating_add(1);
            }
            ch => {
                current.push(ch);
                index += 1;
            }
        }
    }

    if !current.is_empty() {
        tokens.push(JsonPathToken::Key(current));
    }

    tokens
}

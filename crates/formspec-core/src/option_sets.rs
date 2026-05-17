//! Resolve `options` from `optionSets` in a Formspec Definition.

use serde_json::{Map, Value};

fn options_from_set_entry(entry: &Value) -> Value {
    match entry {
        Value::Array(_) => entry.clone(),
        Value::Object(map) => map
            .get("options")
            .filter(|v| v.is_array())
            .cloned()
            .unwrap_or_else(|| Value::Array(vec![])),
        _ => Value::Array(vec![]),
    }
}

fn visit_items(items: &mut [Value], sets: &Map<String, Value>) {
    for item in items.iter_mut() {
        let Some(obj) = item.as_object_mut() else {
            continue;
        };
        let set_key = obj
            .get("optionSet")
            .and_then(|v| v.as_str());
        if let Some(name) = set_key {
            if let Some(entry) = sets.get(name) {
                obj.insert("options".to_string(), options_from_set_entry(entry));
            }
        }
        if let Some(Value::Array(children)) = obj.get_mut("children") {
            visit_items(children, sets);
        }
    }
}

/// Walk `definition.items` (recursively) and set `options` from `optionSets`.
///
/// Matches `resolveOptionSetsOnDefinition` in `packages/formspec-engine/src/engine/definition-setup.ts`.
pub fn resolve_option_sets_on_definition(definition: &mut Value) {
    let sets: Map<String, Value> = {
        let Some(obj) = definition.as_object() else {
            return;
        };
        let Some(Value::Object(m)) = obj.get("optionSets")
        else {
            return;
        };
        m.clone()
    };

    if let Some(Value::Array(items)) = definition.get_mut("items") {
        visit_items(items, &sets);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_resolve_option_sets() {
        let mut def = json!({
            "items": [
                { "key": "a", "type": "field", "dataType": "choice", "optionSet": "countries" },
                { "key": "b", "type": "field", "dataType": "choice", "optionSet": "unknown" },
                {
                    "key": "group",
                    "type": "group",
                    "children": [
                        { "key": "c", "type": "field", "dataType": "choice", "optionSet": "countries" }
                    ]
                }
            ],
            "optionSets": {
                "countries": [
                    { "value": "us", "label": "USA" },
                    { "value": "ca", "label": "Canada" }
                ]
            }
        });

        resolve_option_sets_on_definition(&mut def);

        assert_eq!(def["items"][0]["options"][0]["value"], "us");
        assert_eq!(def["items"][2]["children"][0]["options"][1]["value"], "ca");
        assert!(def["items"][1].get("options").is_none());
    }

    #[test]
    fn test_option_sets_object_shape() {
        let mut def = json!({
            "items": [
                { "key": "a", "type": "field", "dataType": "choice", "optionSet": "colors" }
            ],
            "optionSets": {
                "colors": {
                    "options": [
                        { "value": "red", "label": "Red" }
                    ]
                }
            }
        });

        resolve_option_sets_on_definition(&mut def);
        assert_eq!(def["items"][0]["options"][0]["value"], "red");
    }

    #[test]
    fn test_option_sets_inheritance() {
        let mut def = json!({
            "items": [
                { "key": "a", "type": "field", "dataType": "choice", "optionSet": "states" }
            ],
            "optionSets": {
                "states": [
                    { "value": "ca", "label": "California", "keywords": ["CA", "Calif"] }
                ]
            }
        });
        resolve_option_sets_on_definition(&mut def);
        assert_eq!(
            def["items"][0]["options"][0]["keywords"],
            json!(["CA", "Calif"])
        );
    }
}

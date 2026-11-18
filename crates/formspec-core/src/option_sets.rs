//! Resolve `options` from `optionSets` in a Formspec Definition.

use fel_core::exact_json::{Map, Value};

static EMPTY_OPTIONS: Value = Value::Array(Vec::new());

/// Return the Item's effective options, with a defined named set taking precedence.
/// Remote named sets supply no inline options.
pub fn effective_item_options<'a>(
    item: &'a Value,
    sets: Option<&'a Map<String, Value>>,
) -> Option<&'a Value> {
    if let Some(entry) = item
        .get("optionSet")
        .and_then(Value::as_str)
        .and_then(|name| sets?.get(name))
    {
        return Some(if entry.is_array() {
            entry
        } else {
            entry
                .get("options")
                .filter(|options| options.is_array())
                .unwrap_or(&EMPTY_OPTIONS)
        });
    }
    item.get("options")
}

fn visit_and_resolve_items(items: &mut [Value], sets: &Map<String, Value>) {
    for item in items.iter_mut() {
        if item.get("optionSet").is_some()
            && let Some(options) = effective_item_options(item, Some(sets)).cloned()
        {
            item["options"] = options;
        }
        let Some(obj) = item.as_object_mut() else {
            continue;
        };
        if let Some(Value::Array(children)) = obj.get_mut("children") {
            visit_and_resolve_items(children, sets);
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
        let Some(Value::Object(m)) = obj.get("optionSets") else {
            return;
        };
        m.clone()
    };

    if let Some(Value::Array(items)) = definition.get_mut("items") {
        visit_and_resolve_items(items, &sets);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use fel_core::exact_json::native_json as json;

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
    fn remote_named_set_still_resolves_to_empty_inline_options() {
        let mut definition = json!({
            "items": [{
                "key": "code", "type": "field", "dataType": "choice", "optionSet": "codes",
                "options": [{"value": "inline", "label": "Inline"}]
            }],
            "optionSets": {"codes": {
                "source": "https://example.test/codes",
                "valueField": "code",
                "labelField": "name"
            }}
        });

        resolve_option_sets_on_definition(&mut definition);

        assert_eq!(definition["items"][0]["options"], json!([]));
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

    /// Core readers are camelCase-only; snake_case field names are not aliased (SWEEP-002).
    #[test]
    fn snake_case_option_set_key_is_ignored() {
        let mut def = json!({
            "items": [
                { "key": "a", "type": "field", "dataType": "choice", "option_set": "countries" }
            ],
            "optionSets": {
                "countries": [{ "value": "us", "label": "USA" }]
            }
        });
        resolve_option_sets_on_definition(&mut def);
        assert!(def["items"][0].get("options").is_none());
    }
}

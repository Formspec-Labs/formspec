//! Definition field lookup for cross-artifact bind resolution.

use std::collections::HashMap;

use formspec_core::visit_definition_items_from_document;
use serde_json::Value;

#[derive(Clone)]
pub(crate) struct FieldInfo {
    pub data_type: Option<String>,
    pub has_options: bool,
}

pub(crate) fn build_field_lookup(definition: &Value) -> HashMap<String, FieldInfo> {
    let mut lookup = HashMap::new();
    visit_definition_items_from_document(definition, &mut |ctx| {
        let full = ctx.dotted_path.clone();
        let data_type = ctx
            .item
            .get("dataType")
            .and_then(|v| v.as_str())
            .map(String::from);
        let has_options = ctx.item.get("optionSet").is_some()
            || ctx
                .item
                .get("options")
                .and_then(|v| v.as_array())
                .is_some_and(|a| !a.is_empty());
        let info = FieldInfo {
            data_type,
            has_options,
        };
        lookup.insert(full.clone(), info.clone());
        lookup.insert(ctx.key.to_string(), info);
    });
    lookup
}

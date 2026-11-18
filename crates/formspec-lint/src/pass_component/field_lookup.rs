//! Definition item lookup for cross-artifact bind resolution.

use std::collections::HashMap;

use formspec_core::visit_definition_items_from_document;
use serde_json::Value;

/// What kind of Definition item a bind names (Core §4.2).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ItemKind {
    /// `type: "field"`: holds a value.
    Field,
    /// `type: "group"`: holds other items.
    Group,
    /// `type: "display"`: holds no value; renders its label.
    Display,
    /// Any other or missing `type`.
    Other,
}

#[derive(Clone)]
pub(crate) struct FieldInfo {
    /// Dotted path from the Definition root (`employers.contact.phone`).
    pub full_path: String,
    pub kind: ItemKind,
    pub repeatable: bool,
    pub data_type: Option<String>,
    pub has_options: bool,
}

pub(crate) fn build_field_lookup(definition: &Value) -> HashMap<String, FieldInfo> {
    let mut lookup = HashMap::new();
    visit_definition_items_from_document(definition, &mut |ctx| {
        let full = ctx.dotted_path.clone();
        let kind = match ctx.item.get("type").and_then(Value::as_str) {
            Some("field") => ItemKind::Field,
            Some("group") => ItemKind::Group,
            Some("display") => ItemKind::Display,
            _ => ItemKind::Other,
        };
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
            full_path: full.clone(),
            kind,
            repeatable: crate::tree::is_repeatable(ctx.item),
            data_type,
            has_options,
        };
        lookup.insert(full.clone(), info.clone());
        lookup.insert(ctx.key.to_string(), info);
    });
    lookup
}

/// Resolve a component `bind`, inside a repeat template first relative to its group.
///
/// Component §4.4 item 2: within a template over a repeatable group, a child `bind` is the
/// Item's path relative to that group, through nested non-repeatable groups.
pub(crate) fn resolve<'l>(
    lookup: &'l HashMap<String, FieldInfo>,
    repeat_group: Option<&str>,
    bind: &str,
) -> Option<&'l FieldInfo> {
    repeat_group
        .and_then(|group| lookup.get(&format!("{group}.{bind}")))
        .or_else(|| lookup.get(bind))
}

/// Resolve the group opened by a repeat template (Component §4.4).
pub(crate) fn repeat_group_path<'l>(
    lookup: &'l HashMap<String, FieldInfo>,
    repeat_group: Option<&str>,
    component: &str,
    bind: &str,
) -> Option<&'l str> {
    if !matches!(component, "DataTable" | "Accordion") {
        return None;
    }
    let group = resolve(lookup, repeat_group, bind)?;
    (group.kind == ItemKind::Group && group.repeatable).then_some(group.full_path.as_str())
}

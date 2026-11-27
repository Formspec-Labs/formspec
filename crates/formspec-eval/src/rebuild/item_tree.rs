//! Build `ItemInfo` tree from definition `items` and merge `binds` (object or array style).
//!
//! # Item `key` policy (eval vs lint)
//!
//! Runtime rebuild uses [`formspec_core::visit_definition_items_json_shallow`] with
//! [`formspec_core::DefinitionItemKeyPolicy::CoerceNonStringKeyToEmpty`] at each `items` /
//! `children` array, then recurses into each node's `children` with the same policy. Dotted paths and
//! `json_path` prefixes match [`formspec_core::visit_definition_items_json_with_policy`] for the
//! same policy.
//!
//! That **differs** from lint’s [`formspec_core::visit_definition_items_json`], which applies
//! [`formspec_core::DefinitionItemKeyPolicy::RequireStringKey`] and skips keyless nodes (and their
//! subtrees). We intentionally do **not** use require semantics here — that would change evaluation.
//!
//! ## Spec cross-references (`specs/*.llm.md`)
//!
//! - `specs/core/spec.llm.md` — **§3 Item**, **§4 Bind** (bind `path` / targets align with dotted
//!   item keys; schema text requires paths to resolve to definition items), **Phase 1: Rebuild**
//!   (structural re-index and dependency graph after definition changes).
//! - `specs/core/definition-spec.llm.md` — item tree + stable keys as the binding surface for
//!   behavior and data shape.
//!
//! Valid definitions satisfy Item `key` constraints in `schemas/definition.schema.json`. Coercing
//! missing or non-string keys to `""` is **defensive** so eval can still traverse malformed JSON;
//! it does not relax the normative spec for published definitions.
#![allow(clippy::missing_docs_in_private_items)]

use fel_core::exact_json::{Map, Value};
use formspec_core::repeat_references::is_repeatable_group;
use formspec_core::value_coerce::LetterCase;
use formspec_core::{
    DefinitionItemKeyPolicy, DefinitionItemVisitCtx, visit_definition_items_json_shallow,
};

use crate::types::{
    ExcludedValueMode, ItemInfo, MipState, NrbMode, RemoteOptionSource, VariableDef, WhitespaceMode,
};
use formspec_core::BindTargets;
use std::collections::HashSet;
use std::sync::Arc;

pub(super) fn bool_or_string_expr(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Bool(flag) => Some(flag.to_string()),
        _ => None,
    }
}

/// Build the item tree from a definition JSON.
pub fn rebuild_item_tree(definition: &Value) -> Vec<ItemInfo> {
    let items = definition.get("items").and_then(|v| v.as_array());
    let binds = BindTargets::new(definition.get("binds"));
    let default_currency = definition
        .get("formPresentation")
        .and_then(|v| v.get("defaultCurrency"))
        .and_then(|v| v.as_str());

    match items {
        Some(items) => rebuild_items_slice(
            items,
            &binds,
            None,
            default_currency,
            "$.items",
            definition.get("optionSets").and_then(Value::as_object),
        ),
        None => vec![],
    }
}

/// Parse variables from definition JSON.
pub fn parse_variables(definition: &Value) -> Vec<VariableDef> {
    definition
        .get("variables")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| {
                    let name = v.get("name")?.as_str()?;
                    let expression = v.get("expression")?.as_str()?;
                    let scope = v.get("scope").and_then(|s| s.as_str()).map(String::from);
                    Some(VariableDef {
                        name: name.to_string(),
                        expression: expression.to_string(),
                        scope,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn rebuild_items_slice(
    items: &[Value],
    binds: &BindTargets<'_, Value>,
    parent_dotted: Option<&str>,
    default_currency: Option<&str>,
    json_array_parent: &str,
    sets: Option<&Map<String, Value>>,
) -> Vec<ItemInfo> {
    let mut out = Vec::new();
    visit_definition_items_json_shallow(
        items,
        json_array_parent,
        parent_dotted,
        DefinitionItemKeyPolicy::CoerceNonStringKeyToEmpty,
        &mut |ctx| {
            out.push(build_item_info_from_ctx(ctx, binds, default_currency, sets));
        },
    );
    out
}

fn build_item_info_from_ctx(
    ctx: &DefinitionItemVisitCtx<'_, Value>,
    binds: &BindTargets<'_, Value>,
    default_currency: Option<&str>,
    sets: Option<&Map<String, Value>>,
) -> ItemInfo {
    let item = ctx.item;
    let key = ctx.key.to_string();
    let path = ctx.dotted_path.clone();

    let item_type = item
        .get("type")
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_else(|| {
            if item.get("children").is_some() || item.get("repeatable").is_some() {
                "group".to_string()
            } else {
                "field".to_string()
            }
        });
    let data_type = item
        .get("dataType")
        .and_then(|v| v.as_str())
        .map(String::from);
    let currency = item
        .get("currency")
        .and_then(|v| v.as_str())
        .or(default_currency)
        .map(String::from);

    // Merge authored Binds in document order. When no Bind targets the full path,
    // look for a Bind addressed by the Item's bare key.
    let target = if binds.entries(&path).is_empty() {
        key.as_str()
    } else {
        path.as_str()
    };
    let bind = binds.merged(target);

    let children = item
        .get("children")
        .and_then(|v| v.as_array())
        .map(|kids| {
            let child_prefix = format!("{}.children", ctx.json_path);
            rebuild_items_slice(
                kids,
                binds,
                Some(path.as_str()),
                default_currency,
                &child_prefix,
                sets,
            )
        })
        .unwrap_or_default();

    let (option_values, option_source) = resolve_item_option_binding(item, sets);

    let mut info = ItemInfo {
        key,
        path,
        item_type,
        data_type,
        currency,
        value: Value::Null,
        mip: MipState::default(),
        calculate: None,
        precision: item
            .get("precision")
            .and_then(Value::as_u64)
            .and_then(|value| u32::try_from(value).ok()),
        constraint: None,
        constraint_message: None,
        relevance: None,
        required_expr: None,
        readonly_expr: None,
        whitespace: None,
        letter_case: None,
        nrb: None,
        excluded_value: None,
        default_value: None,
        default_expression: None,
        initial_value: item.get("initialValue").cloned(),
        parent_path: ctx.parent_dotted.clone(),
        repeatable: is_repeatable_group(item["type"].as_str(), item["repeatable"].as_bool()),
        repeat_min: item.get("minRepeat").and_then(|v| v.as_u64()),
        repeat_max: item.get("maxRepeat").and_then(|v| v.as_u64()),
        option_values,
        option_source,
        accept_types: item
            .get("accept")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default(),
        extensions: item
            .get("extensions")
            .and_then(|v| v.as_object())
            .map(|obj| {
                obj.iter()
                    .filter(|(_, v)| !v.is_null() && v.as_bool() != Some(false))
                    .map(|(k, _)| k.clone())
                    .collect()
            })
            .unwrap_or_default(),
        pre_populate_instance: item
            .get("prePopulate")
            .and_then(|pp| pp.get("instance"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        pre_populate_path: item
            .get("prePopulate")
            .and_then(|pp| pp.get("path"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        pre_populate_locked: item
            .get("prePopulate")
            .and_then(|pp| pp.get("editable"))
            .and_then(Value::as_bool)
            == Some(false),
        children,
    };
    apply_bind(&mut info, &bind);
    info
}

/// Resolve a Field item's inline option values or remote option reference (Core §4.2.3, §4.6).
///
/// When both `optionSet` and `options` are present and `optionSet` names a declared top-level
/// set, `optionSet` takes precedence — even when the named set is URL-backed (`source`).
fn resolve_item_option_binding(
    item: &Value,
    sets: Option<&Map<String, Value>>,
) -> (Arc<HashSet<String>>, Option<RemoteOptionSource>) {
    if let Some(name) = item.get("optionSet").and_then(Value::as_str)
        && let Some(entry) = sets.and_then(|map| map.get(name))
    {
        if let Some(source) = entry
            .get("source")
            .and_then(Value::as_str)
            .filter(|uri| !uri.is_empty())
        {
            return (
                Arc::default(),
                Some(RemoteOptionSource::OptionSet {
                    name: name.to_owned(),
                    source: source.to_owned(),
                }),
            );
        }
        let values = entry
            .get("options")
            .unwrap_or(entry)
            .as_array()
            .map(|arr| extract_option_values(arr))
            .unwrap_or_default();
        return (values, None);
    }

    match item.get("options") {
        Some(Value::Array(arr)) => (extract_option_values(arr), None),
        Some(Value::String(uri)) if !uri.is_empty() => {
            (Arc::default(), Some(RemoteOptionSource::Uri(uri.clone())))
        }
        _ => (Arc::default(), None),
    }
}

fn extract_option_values(arr: &[Value]) -> Arc<HashSet<String>> {
    arr.iter()
        .filter_map(|opt| opt.get("value").and_then(Value::as_str).map(String::from))
        .collect::<HashSet<_>>()
        .into()
}

pub(super) fn apply_bind(item: &mut ItemInfo, bind: &Map<String, Value>) {
    if let Some(value) = bind.get("calculate") {
        item.calculate = Some(value).and_then(|v| v.as_str()).map(String::from);
    }
    if let Some(value) = bind.get("precision") {
        item.precision = Some(value)
            .and_then(|v| v.as_u64())
            .and_then(|value| u32::try_from(value).ok());
    }
    if let Some(value) = bind.get("constraint") {
        item.constraint = Some(value).and_then(|v| v.as_str()).map(String::from);
    }
    if let Some(value) = bind.get("constraintMessage") {
        item.constraint_message = Some(value).and_then(|v| v.as_str()).map(String::from);
    }
    if let Some(value) = bind.get("relevant") {
        item.relevance = Some(value).and_then(bool_or_string_expr);
    }
    if let Some(value) = bind.get("required") {
        item.required_expr = Some(value).and_then(bool_or_string_expr);
    }
    if let Some(value) = bind.get("readonly") {
        item.readonly_expr = Some(value).and_then(bool_or_string_expr);
    }
    if let Some(value) = bind.get("whitespace") {
        item.whitespace = Some(value)
            .and_then(|v| v.as_str())
            .map(WhitespaceMode::from_str_lossy);
    }
    if let Some(value) = bind.get("letterCase") {
        item.letter_case = LetterCase::for_field(item.data_type.as_deref(), value.as_str());
    }
    if let Some(value) = bind.get("nonRelevantBehavior") {
        item.nrb = Some(value)
            .and_then(|v| v.as_str())
            .map(NrbMode::from_str_lossy);
    }
    if let Some(value) = bind.get("excludedValue") {
        item.excluded_value = Some(value)
            .and_then(|v| v.as_str())
            .and_then(ExcludedValueMode::parse_wire);
    }
    if let Some(value) = bind.get("default") {
        item.default_value = Some(value).and_then(|v| match v {
            Value::String(s) if s.starts_with('=') => None,
            other => Some(other.clone()),
        });
    }
    if let Some(value) = bind.get("default") {
        item.default_expression = Some(value)
            .and_then(|v| v.as_str())
            .filter(|s| s.starts_with('='))
            .map(|s| s[1..].to_string());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{ExcludedValueMode, NrbMode, WhitespaceMode};
    use fel_core::exact_json::native_json as json;

    #[test]
    fn item_tree_parses_whitespace_nrb_and_excluded_value_modes() {
        let def = json!({
            "items": [{
                "key": "name",
                "dataType": "string"
            }],
            "binds": [
                {"path": "name", "whitespace": "trim", "nonRelevantBehavior": "empty", "excludedValue": "null"},
            ]
        });
        let items = rebuild_item_tree(&def);
        assert_eq!(items.len(), 1);
        let item = &items[0];
        assert_eq!(item.whitespace, Some(WhitespaceMode::Trim));
        assert_eq!(item.nrb, Some(NrbMode::Empty));
        assert_eq!(item.excluded_value, Some(ExcludedValueMode::Null));
    }

    #[test]
    fn item_tree_omits_invalid_excluded_value() {
        let def = json!({
            "items": [{
                "key": "x",
                "dataType": "string"
            }],
            "binds": [
                {"path": "x", "excludedValue": "not-a-mode"},
            ]
        });
        let items = rebuild_item_tree(&def);
        assert!(items[0].excluded_value.is_none());
    }
}

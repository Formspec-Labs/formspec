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

use formspec_core::{
    DefinitionItemKeyPolicy, DefinitionItemVisitCtx, visit_definition_items_json_shallow,
};
use serde_json::Value;

use crate::types::{ExcludedValueMode, ItemInfo, NrbMode, VariableDef, WhitespaceMode};

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
    let binds = definition.get("binds");
    let default_currency = definition
        .get("formPresentation")
        .and_then(|v| v.get("defaultCurrency"))
        .and_then(|v| v.as_str());

    match items {
        Some(items) => rebuild_items_slice(items, binds, None, default_currency, "$.items"),
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
    binds: Option<&Value>,
    parent_dotted: Option<&str>,
    default_currency: Option<&str>,
    json_array_parent: &str,
) -> Vec<ItemInfo> {
    let mut out = Vec::new();
    visit_definition_items_json_shallow(
        items,
        json_array_parent,
        parent_dotted,
        DefinitionItemKeyPolicy::CoerceNonStringKeyToEmpty,
        &mut |ctx| {
            out.push(build_item_info_from_ctx(ctx, binds, default_currency));
        },
    );
    out
}

fn resolve_bind<'a>(binds: Option<&'a Value>, key: &str) -> Option<serde_json::Map<String, Value>> {
    let binds = binds?;
    // Support both object-style and array-style binds
    match binds {
        Value::Object(map) => map.get(key)?.as_object().cloned(),
        Value::Array(arr) => {
            let mut merged = serde_json::Map::new();
            for bind in arr {
                if bind.get("path").and_then(|v| v.as_str()) == Some(key) {
                    if let Some(bind_obj) = bind.as_object() {
                        for (field, value) in bind_obj {
                            merged.insert(field.clone(), value.clone());
                        }
                    }
                }
            }
            if merged.is_empty() {
                None
            } else {
                Some(merged)
            }
        }
        _ => None,
    }
}

fn build_item_info_from_ctx(
    ctx: &DefinitionItemVisitCtx<'_>,
    binds: Option<&Value>,
    default_currency: Option<&str>,
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

    // Look up bind for this path
    let mut bind = resolve_bind(binds, &path)
        .or_else(|| resolve_bind(binds, &key))
        .unwrap_or_default();
    for field in [
        "calculate",
        "constraint",
        "constraintMessage",
        "relevant",
        "required",
        "readonly",
        "default",
        "precision",
        "disabledDisplay",
        "whitespace",
        "nonRelevantBehavior",
        "excludedValue",
    ] {
        if let Some(value) = item.get(field) {
            bind.insert(field.to_string(), value.clone());
        }
    }
    if bind.get("relevant").is_none()
        && let Some(value) = item.get("visible")
    {
        bind.insert("relevant".to_string(), value.clone());
    }

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
            )
        })
        .unwrap_or_default();

    ItemInfo {
        key,
        path,
        item_type,
        data_type,
        currency,
        value: Value::Null,
        relevant: true,
        required: false,
        readonly: false,
        calculate: Some(&bind)
            .and_then(|b| b.get("calculate"))
            .and_then(|v| v.as_str())
            .map(String::from),
        precision: Some(&bind)
            .and_then(|b| b.get("precision"))
            .and_then(|v| v.as_u64())
            .and_then(|value| u32::try_from(value).ok()),
        constraint: Some(&bind)
            .and_then(|b| b.get("constraint"))
            .and_then(|v| v.as_str())
            .map(String::from),
        constraint_message: Some(&bind)
            .and_then(|b| b.get("constraintMessage"))
            .and_then(|v| v.as_str())
            .map(String::from),
        relevance: Some(&bind)
            .and_then(|b| b.get("relevant"))
            .and_then(bool_or_string_expr),
        required_expr: Some(&bind)
            .and_then(|b| b.get("required"))
            .and_then(bool_or_string_expr),
        readonly_expr: Some(&bind)
            .and_then(|b| b.get("readonly"))
            .and_then(bool_or_string_expr),
        whitespace: Some(&bind)
            .and_then(|b| b.get("whitespace"))
            .and_then(|v| v.as_str())
            .map(WhitespaceMode::from_str_lossy),
        nrb: Some(&bind)
            .and_then(|b| b.get("nonRelevantBehavior"))
            .and_then(|v| v.as_str())
            .map(NrbMode::from_str_lossy),
        excluded_value: Some(&bind)
            .and_then(|b| b.get("excludedValue"))
            .and_then(|v| v.as_str())
            .and_then(ExcludedValueMode::parse_wire),
        default_value: Some(&bind)
            .and_then(|b| b.get("default"))
            .and_then(|v| match v {
                Value::String(s) if s.starts_with('=') => None,
                other => Some(other.clone()),
            }),
        default_expression: Some(&bind)
            .and_then(|b| b.get("default"))
            .and_then(|v| v.as_str())
            .filter(|s| s.starts_with('='))
            .map(|s| s[1..].to_string()),
        initial_value: item.get("initialValue").cloned(),
        prev_relevant: true,
        parent_path: ctx.parent_dotted.clone(),
        repeatable: item
            .get("repeatable")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        repeat_min: item.get("minRepeat").and_then(|v| v.as_u64()),
        repeat_max: item.get("maxRepeat").and_then(|v| v.as_u64()),
        option_values: item
            .get("options")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|opt| opt.get("value").and_then(Value::as_str).map(String::from))
                    .collect()
            })
            .unwrap_or_default(),
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
        children,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{ExcludedValueMode, NrbMode, WhitespaceMode};
    use serde_json::json;

    #[test]
    fn item_tree_parses_whitespace_nrb_and_excluded_value_modes() {
        let def = json!({
            "items": [{
                "key": "name",
                "dataType": "string",
                "whitespace": "trim",
                "nonRelevantBehavior": "empty",
                "excludedValue": "null"
            }]
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
                "dataType": "string",
                "excludedValue": "not-a-mode"
            }]
        });
        let items = rebuild_item_tree(&def);
        assert!(items[0].excluded_value.is_none());
    }
}

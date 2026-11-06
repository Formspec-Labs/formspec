//! Depth-first traversal of definition `items` / `children` JSON arrays.
//!
//! Call sites choose [`DefinitionItemKeyPolicy`]:
//! - **Lint / static analysis** use [`DefinitionItemKeyPolicy::RequireStringKey`]: only visit nodes
//!   whose `key` is a JSON string (including `""`). Skip other elements and **do not** recurse into
//!   their `children`.
//! - **Runtime eval item-tree rebuild** uses [`visit_definition_items_json_shallow`] with
//!   [`DefinitionItemKeyPolicy::CoerceNonStringKeyToEmpty`] at each `items` / `children` array, then
//!   recurses into `children` with the same policy (see `formspec-eval` `rebuild_item_tree`).
//!   [`coerce_definition_item_key_segment`] implements the coerce key segment for that policy.
//! - **Extension diagnostic prefixes** (lint pass 3b): map [`DefinitionItemVisitCtx::dotted_path`] via
//!   [`extension_item_diagnostic_path_from_dotted`] to stable `$.items[key=…]`-style paths.
//!
//! ## Spec cross-references (`specs/*.llm.md`)
//!
//! Normative shape and behavior for items and paths:
//!
//! - `specs/core/spec.llm.md` — **§3 Item** (structural tree nodes identified by `key`), **§4 Bind**
//!   (dot-separated paths onto those keys), **Processing model · Phase 1: Rebuild** (re-index items
//!   / dependency structure after definition change).
//! - `specs/core/definition-spec.llm.md` — *Semantic capsule*: stable `key` identifiers as the
//!   binding surface across rendering, validation, and mapping.
//! - `specs/component/component-spec.llm.md` — slot `bind` resolves by item `key` (not arbitrary
//!   FEL paths).
//!
//! Conformant definitions: Item `key` is required with pattern `^[a-zA-Z][a-zA-Z0-9_]*$` in
//! `schemas/definition.schema.json`. The two policies here are **tooling/runtime** choices for
//! walking JSON before or aside from full schema validation: skip ill-formed nodes vs coerce and
//! keep descending.

use fel_core::exact_json::JsonTree;
use serde_json::Value;

/// How to interpret `item["key"]` when walking definition `items` / `children`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DefinitionItemKeyPolicy {
    /// Only visit objects whose `key` is a JSON string (including `""`).
    ///
    /// Missing, null, number, object, or array: skip the node and **do not** descend into
    /// `children`.
    RequireStringKey,
    /// Missing or non-string `key` is treated as `""`.
    ///
    /// Visit every array element and always recurse into `children` when present.
    CoerceNonStringKeyToEmpty,
}

/// One definition item with canonical paths for diagnostics and binds.
#[derive(Debug, Clone)]
pub struct DefinitionItemVisitCtx<'a, V = Value> {
    /// Raw JSON object for this definition item.
    pub item: &'a V,
    /// Resolved key segment (may be `""` when policy coerces).
    pub key: &'a str,
    /// Index of this node within its parent's `items` or `children` array.
    pub index: usize,
    /// JSONPath-style location, e.g. `$.items[0]` or `$.items[0].children[1]`.
    pub json_path: String,
    /// Dotted field path (`name`, `address.street`).
    pub dotted_path: String,
    /// Parent dotted path; `None` for top-level items under `document.items`.
    pub parent_dotted: Option<String>,
}

/// Key segment for runtime item-tree rebuild: missing or non-string `key` → `""`.
#[inline]
pub fn coerce_definition_item_key_segment<V: JsonTree>(item: &V) -> &str {
    item.get("key").and_then(V::as_str).unwrap_or("")
}

/// Resolve the key segment for `item` under `policy`.
///
/// Returns `None` only for [`DefinitionItemKeyPolicy::RequireStringKey`] when `key` is not a JSON
/// string.
pub fn definition_item_key_segment<V: JsonTree>(
    item: &V,
    policy: DefinitionItemKeyPolicy,
) -> Option<&str> {
    match policy {
        DefinitionItemKeyPolicy::RequireStringKey => item.get("key").and_then(V::as_str),
        DefinitionItemKeyPolicy::CoerceNonStringKeyToEmpty => {
            Some(coerce_definition_item_key_segment(item))
        }
    }
}

/// Dotted bind path from an optional parent prefix and this node's key segment (may be `""`).
pub fn definition_item_dotted_path(parent_dotted: Option<&str>, key_segment: &str) -> String {
    match parent_dotted {
        Some(prefix) => format!("{prefix}.{key_segment}"),
        None => key_segment.to_string(),
    }
}

/// Map a bind-style dotted item path to the extensions-pass diagnostic prefix.
///
/// The lint extensions pass reports locations like `$.items[key=rootKey].nestedKey` (key-stable,
/// not `$.items[0]`). That string is derived from the same dotted paths as
/// [`visit_definition_items_json`] / [`DefinitionItemVisitCtx::dotted_path`]: the first segment is
/// wrapped as `$.items[key=…]`; further segments are appended with dots.
pub fn extension_item_diagnostic_path_from_dotted(dotted: &str) -> String {
    let mut segments = dotted.split('.');
    let Some(first) = segments.next() else {
        return String::from("$.items[key=]");
    };
    let mut out = format!("$.items[key={first}]");
    for seg in segments {
        out.push('.');
        out.push_str(seg);
    }
    out
}

/// Visit each element of a definition `items` or `children` array **once** (no recursion).
///
/// For each index `i`, builds the same [`DefinitionItemVisitCtx`] as the depth-first visitor:
/// `json_path` is `{json_array_parent}[{i}]`, `dotted_path` from [`definition_item_dotted_path`].
///
/// Used by `formspec-eval` to rebuild the eval `ItemInfo` tree: recurse by walking
/// `ctx.item["children"]` and calling this again with `json_array_parent =
/// format!("{}.children", ctx.json_path)`.
pub fn visit_definition_items_json_shallow<V: JsonTree>(
    items: &[V],
    json_array_parent: &str,
    parent_dotted: Option<&str>,
    policy: DefinitionItemKeyPolicy,
    visitor: &mut impl FnMut(&DefinitionItemVisitCtx<'_, V>),
) {
    for (i, item) in items.iter().enumerate() {
        if let Some(ctx) =
            definition_item_visit_ctx_at(i, item, json_array_parent, parent_dotted, policy)
        {
            visitor(&ctx);
        }
    }
}

/// Build a visit context for array index `i` or return `None` when the key policy skips the node.
fn definition_item_visit_ctx_at<'a, V: JsonTree>(
    i: usize,
    item: &'a V,
    json_array_parent: &str,
    parent_dotted: Option<&str>,
    policy: DefinitionItemKeyPolicy,
) -> Option<DefinitionItemVisitCtx<'a, V>> {
    let key_str = definition_item_key_segment(item, policy)?;
    let json_path = format!("{json_array_parent}[{i}]");
    let dotted_path = definition_item_dotted_path(parent_dotted, key_str);
    Some(DefinitionItemVisitCtx {
        item,
        key: key_str,
        index: i,
        json_path,
        dotted_path,
        parent_dotted: parent_dotted.map(str::to_string),
    })
}

/// Visit definition items under a JSON array with an explicit key policy.
///
/// `json_array_parent` is the path to the **array** (no `[i]` suffix), e.g. `$.items` or
/// `$.items[0].children`.
pub fn visit_definition_items_json_with_policy<V: JsonTree>(
    items: &[V],
    json_array_parent: &str,
    parent_dotted: Option<&str>,
    policy: DefinitionItemKeyPolicy,
    visitor: &mut impl FnMut(&DefinitionItemVisitCtx<'_, V>),
) {
    for (i, item) in items.iter().enumerate() {
        if let Some(ctx) =
            definition_item_visit_ctx_at(i, item, json_array_parent, parent_dotted, policy)
        {
            let dotted_for_children = ctx.dotted_path.clone();
            visitor(&ctx);
            if let Some(children) = ctx.item.get("children").and_then(V::as_array) {
                let child_parent = format!("{}.children", ctx.json_path);
                visit_definition_items_json_with_policy(
                    children,
                    &child_parent,
                    Some(&dotted_for_children),
                    policy,
                    visitor,
                );
            }
        }
    }
}

/// Visit every object with a string `key` under `items`, depth-first ([`DefinitionItemKeyPolicy::RequireStringKey`]).
pub fn visit_definition_items_json<V: JsonTree>(
    items: &[V],
    json_array_parent: &str,
    parent_dotted: Option<&str>,
    visitor: &mut impl FnMut(&DefinitionItemVisitCtx<'_, V>),
) {
    visit_definition_items_json_with_policy(
        items,
        json_array_parent,
        parent_dotted,
        DefinitionItemKeyPolicy::RequireStringKey,
        visitor,
    );
}

/// Walk `document["items"]` when present; no-op if missing or not an array.
pub fn visit_definition_items_from_document<V: JsonTree>(
    document: &V,
    visitor: &mut impl FnMut(&DefinitionItemVisitCtx<'_, V>),
) {
    let Some(items) = document.get("items").and_then(V::as_array) else {
        return;
    };
    visit_definition_items_json(items, "$.items", None, visitor);
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;
    use serde_json::json;

    #[test]
    fn require_string_key_skips_keyless_parent_and_children() {
        let doc = json!({
            "items": [
                { "key": 1, "children": [{ "key": "child" }] }
            ]
        });
        let items = doc["items"].as_array().unwrap();
        let mut keys = Vec::new();
        visit_definition_items_json_with_policy(
            items,
            "$.items",
            None,
            DefinitionItemKeyPolicy::RequireStringKey,
            &mut |ctx| keys.push(ctx.dotted_path.clone()),
        );
        assert!(keys.is_empty());
    }

    #[test]
    fn require_string_key_visits_empty_string_key() {
        let doc = json!({ "items": [{ "key": "", "type": "field" }] });
        let items = doc["items"].as_array().unwrap();
        let mut keys = Vec::new();
        visit_definition_items_json_with_policy(
            items,
            "$.items",
            None,
            DefinitionItemKeyPolicy::RequireStringKey,
            &mut |ctx| keys.push(ctx.key.to_string()),
        );
        assert_eq!(keys, vec![""]);
    }

    #[test]
    fn coerce_visits_keyless_parent_and_descends_to_keyed_child() {
        let doc = json!({
            "items": [
                { "key": null, "children": [{ "key": "child" }] }
            ]
        });
        let items = doc["items"].as_array().unwrap();
        let mut paths = Vec::new();
        visit_definition_items_json_with_policy(
            items,
            "$.items",
            None,
            DefinitionItemKeyPolicy::CoerceNonStringKeyToEmpty,
            &mut |ctx| paths.push(ctx.dotted_path.clone()),
        );
        assert_eq!(paths, vec!["", ".child"]);
    }

    #[test]
    fn definition_item_dotted_path_matches_eval_style() {
        assert_eq!(definition_item_dotted_path(None, ""), "");
        assert_eq!(definition_item_dotted_path(Some("a"), ""), "a.");
        assert_eq!(definition_item_dotted_path(Some("a"), "b"), "a.b");
    }

    #[test]
    fn extension_diagnostic_path_from_dotted() {
        assert_eq!(
            extension_item_diagnostic_path_from_dotted("field"),
            "$.items[key=field]"
        );
        assert_eq!(
            extension_item_diagnostic_path_from_dotted("group.child"),
            "$.items[key=group].child"
        );
        assert_eq!(
            extension_item_diagnostic_path_from_dotted(""),
            "$.items[key=]"
        );
    }

    #[test]
    fn shallow_visits_only_direct_array_members() {
        let doc = json!({
            "items": [
                {
                    "key": "g",
                    "children": [{ "key": "c" }]
                }
            ]
        });
        let items = doc["items"].as_array().unwrap();
        let mut paths = Vec::new();
        visit_definition_items_json_shallow(
            items,
            "$.items",
            None,
            DefinitionItemKeyPolicy::RequireStringKey,
            &mut |ctx| paths.push(ctx.dotted_path.clone()),
        );
        assert_eq!(paths, vec!["g"]);
    }
}

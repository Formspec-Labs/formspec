//! Pass 2: Tree indexing — flattens the item tree into a lookup index.
//!
//! Walks `document["items"]` recursively, building an `ItemTreeIndex` that maps
//! keys and full dotted paths to `ItemRef` metadata. Emits E200 (duplicate key)
//! and E201 (duplicate full path) diagnostics during indexing.

use std::collections::{HashMap, HashSet};

use serde_json::Value;

use formspec_core::visit_definition_items_from_document;

use crate::types::LintDiagnostic;

/// Metadata for one item in the definition tree.
#[derive(Debug, Clone)]
pub struct ItemRef {
    /// The item's key.
    pub key: String,
    /// Dotted path from root (e.g., "address.street").
    pub full_path: String,
    /// JSONPath for diagnostics (e.g., `$.items[0].children[1]`).
    pub json_path: String,
    /// The parent's full dotted path, if nested.
    pub parent_full_path: Option<String>,
    /// The item's `dataType` value, if present.
    pub data_type: Option<String>,
    /// Whether this item is a repeatable group (`"repeatable": true` or legacy `"repeat": {…}`).
    pub is_repeatable: bool,
}

/// Index built by walking the item tree. Consumed by downstream lint passes.
#[derive(Debug)]
pub struct ItemTreeIndex {
    /// First item encountered with each key.
    pub by_key: HashMap<String, ItemRef>,
    /// All items by full dotted path.
    pub by_full_path: HashMap<String, ItemRef>,
    /// Full paths of repeatable group items.
    pub repeatable_groups: HashSet<String>,
    /// Keys that appear more than once anywhere in the tree.
    pub ambiguous_keys: HashSet<String>,
    /// E200/E201 diagnostics emitted during indexing.
    pub diagnostics: Vec<LintDiagnostic>,
}

/// Build an `ItemTreeIndex` from a definition document.
///
/// Walks `document["items"]` recursively. Items without a `key` field are skipped.
pub fn build_item_index(document: &Value) -> ItemTreeIndex {
    let mut index = ItemTreeIndex {
        by_key: HashMap::new(),
        by_full_path: HashMap::new(),
        repeatable_groups: HashSet::new(),
        ambiguous_keys: HashSet::new(),
        diagnostics: Vec::new(),
    };

    visit_definition_items_from_document(document, &mut |ctx| {
        let data_type = ctx
            .item
            .get("dataType")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let is_repeatable = ctx
            .item
            .get("repeatable")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
            || ctx.item.get("repeat").is_some();

        let item_ref = ItemRef {
            key: ctx.key.to_string(),
            full_path: ctx.dotted_path.clone(),
            json_path: ctx.json_path.clone(),
            parent_full_path: ctx.parent_dotted.clone(),
            data_type,
            is_repeatable,
        };

        // E200: duplicate key (different location in the tree)
        if index.by_key.contains_key(ctx.key) {
            index.ambiguous_keys.insert(ctx.key.to_string());
            index
                .diagnostics
                .push(crate::metadata::with_metadata(LintDiagnostic::error(
                    crate::LintCode::E200,
                    2,
                    &ctx.json_path,
                    format!(
                        "Duplicate item key '{}' (first seen at {})",
                        ctx.key, index.by_key[ctx.key].json_path
                    ),
                )));
        } else {
            index.by_key.insert(ctx.key.to_string(), item_ref.clone());
        }

        // E201: duplicate full path
        if index.by_full_path.contains_key(&ctx.dotted_path) {
            index
                .diagnostics
                .push(crate::metadata::with_metadata(LintDiagnostic::error(
                    crate::LintCode::E201,
                    2,
                    &ctx.json_path,
                    format!("Duplicate item path '{}'", ctx.dotted_path),
                )));
        } else {
            index.by_full_path.insert(ctx.dotted_path.clone(), item_ref);
        }

        if is_repeatable {
            index.repeatable_groups.insert(ctx.dotted_path.clone());
        }
    });
    index
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;
    use serde_json::json;

    #[test]
    fn flat_items_indexed_by_key_and_path() {
        let doc = json!({
            "items": [
                { "key": "name", "dataType": "string" },
                { "key": "age", "dataType": "integer" }
            ]
        });
        let index = build_item_index(&doc);

        assert_eq!(index.by_key.len(), 2);
        assert_eq!(index.by_full_path.len(), 2);
        assert!(index.by_key.contains_key("name"));
        assert!(index.by_key.contains_key("age"));
        assert!(index.by_full_path.contains_key("name"));
        assert!(index.by_full_path.contains_key("age"));
        assert_eq!(index.by_key["name"].data_type.as_deref(), Some("string"));
        assert_eq!(index.by_key["age"].data_type.as_deref(), Some("integer"));
        assert!(index.diagnostics.is_empty());
    }

    #[test]
    fn nested_items_build_dotted_paths() {
        let doc = json!({
            "items": [
                {
                    "key": "address",
                    "children": [
                        { "key": "street", "dataType": "string" },
                        { "key": "city", "dataType": "string" }
                    ]
                }
            ]
        });
        let index = build_item_index(&doc);

        assert!(index.by_full_path.contains_key("address"));
        assert!(index.by_full_path.contains_key("address.street"));
        assert!(index.by_full_path.contains_key("address.city"));

        let street = &index.by_full_path["address.street"];
        assert_eq!(street.parent_full_path.as_deref(), Some("address"));
        assert_eq!(street.json_path, "$.items[0].children[0]");

        assert!(index.diagnostics.is_empty());
    }

    #[test]
    fn e200_duplicate_key_at_different_levels() {
        let doc = json!({
            "items": [
                { "key": "name", "dataType": "string" },
                {
                    "key": "address",
                    "children": [
                        { "key": "name", "dataType": "string" }
                    ]
                }
            ]
        });
        let index = build_item_index(&doc);

        let e200: Vec<_> = index
            .diagnostics
            .iter()
            .filter(|d| d.code == crate::LintCode::E200)
            .collect();
        assert_eq!(e200.len(), 1, "Expected one E200 for duplicate key 'name'");
        assert!(e200[0].message.contains("name"));

        assert!(index.ambiguous_keys.contains("name"));

        // Both full paths are distinct so no E201
        let e201_count = index
            .diagnostics
            .iter()
            .filter(|d| d.code == crate::LintCode::E201)
            .count();
        assert_eq!(e201_count, 0);
    }

    #[test]
    fn e201_duplicate_full_path() {
        let doc = json!({
            "items": [
                { "key": "name", "dataType": "string" },
                { "key": "name", "dataType": "string" }
            ]
        });
        let index = build_item_index(&doc);

        let e201: Vec<_> = index
            .diagnostics
            .iter()
            .filter(|d| d.code == crate::LintCode::E201)
            .collect();
        assert_eq!(
            e201.len(),
            1,
            "Expected one E201 for duplicate full path 'name'"
        );
        assert!(e201[0].message.contains("name"));

        // Also triggers E200 since the key is duplicated
        let e200_count = index
            .diagnostics
            .iter()
            .filter(|d| d.code == crate::LintCode::E200)
            .count();
        assert_eq!(e200_count, 1);
    }

    #[test]
    fn repeatable_group_tracking_canonical_boolean() {
        let doc = json!({
            "items": [
                { "key": "name", "dataType": "string" },
                {
                    "key": "lines",
                    "repeatable": true,
                    "children": [
                        { "key": "amount", "dataType": "decimal" }
                    ]
                }
            ]
        });
        let index = build_item_index(&doc);

        assert!(index.repeatable_groups.contains("lines"));
        assert!(!index.repeatable_groups.contains("name"));
        assert!(!index.repeatable_groups.contains("lines.amount"));

        let lines = &index.by_key["lines"];
        assert!(lines.is_repeatable);
    }

    #[test]
    fn repeatable_group_tracking_legacy_repeat_object() {
        let doc = json!({
            "items": [
                {
                    "key": "lines",
                    "repeat": { "min": 1, "max": 10 },
                    "children": [
                        { "key": "amount", "dataType": "decimal" }
                    ]
                }
            ]
        });
        let index = build_item_index(&doc);

        assert!(index.repeatable_groups.contains("lines"));
        let lines = &index.by_key["lines"];
        assert!(lines.is_repeatable);
    }

    #[test]
    fn no_items_field_returns_empty_index() {
        let doc = json!({ "title": "Empty" });
        let index = build_item_index(&doc);

        assert!(index.by_key.is_empty());
        assert!(index.by_full_path.is_empty());
        assert!(index.repeatable_groups.is_empty());
        assert!(index.ambiguous_keys.is_empty());
        assert!(index.diagnostics.is_empty());
    }

    #[test]
    fn ambiguous_keys_populated_for_e200() {
        let doc = json!({
            "items": [
                { "key": "x" },
                { "key": "y", "children": [{ "key": "x" }] },
                { "key": "z", "children": [{ "key": "x" }] }
            ]
        });
        let index = build_item_index(&doc);

        assert!(index.ambiguous_keys.contains("x"));
        assert!(!index.ambiguous_keys.contains("y"));
        assert!(!index.ambiguous_keys.contains("z"));

        // Two E200 diagnostics (second and third occurrence of key "x")
        let e200_count = index
            .diagnostics
            .iter()
            .filter(|d| d.code == crate::LintCode::E200)
            .count();
        assert_eq!(e200_count, 2);
    }

    #[test]
    fn items_without_key_are_skipped() {
        let doc = json!({
            "items": [
                { "key": "name" },
                { "label": "Just a heading" },
                { "key": "age" }
            ]
        });
        let index = build_item_index(&doc);

        assert_eq!(index.by_key.len(), 2);
        assert!(index.by_key.contains_key("name"));
        assert!(index.by_key.contains_key("age"));
        // JSONPath indices account for the keyless item
        assert_eq!(index.by_key["age"].json_path, "$.items[2]");
    }

    #[test]
    fn json_paths_track_nesting_correctly() {
        let doc = json!({
            "items": [
                {
                    "key": "outer",
                    "children": [
                        { "key": "a" },
                        {
                            "key": "inner",
                            "children": [
                                { "key": "deep" }
                            ]
                        }
                    ]
                }
            ]
        });
        let index = build_item_index(&doc);

        assert_eq!(index.by_key["outer"].json_path, "$.items[0]");
        assert_eq!(index.by_key["a"].json_path, "$.items[0].children[0]");
        assert_eq!(index.by_key["inner"].json_path, "$.items[0].children[1]");
        assert_eq!(
            index.by_key["deep"].json_path,
            "$.items[0].children[1].children[0]"
        );
        assert_eq!(
            index.by_full_path["outer.inner.deep"].full_path,
            "outer.inner.deep"
        );
    }

    // ── Edge cases: non-string keys ──────────────────────────────

    /// Spec: spec.md §3.1 — "key" must be a string; null key is skipped
    #[test]
    fn item_with_null_key_is_skipped() {
        let doc = json!({
            "items": [
                { "key": null, "dataType": "string" },
                { "key": "valid", "dataType": "string" }
            ]
        });
        let index = build_item_index(&doc);
        assert_eq!(index.by_key.len(), 1);
        assert!(index.by_key.contains_key("valid"));
        assert!(index.diagnostics.is_empty());
    }

    /// Spec: spec.md §3.1 — "key" must be a string; numeric key is skipped
    #[test]
    fn item_with_numeric_key_is_skipped() {
        let doc = json!({
            "items": [
                { "key": 123, "dataType": "string" },
                { "key": "valid", "dataType": "integer" }
            ]
        });
        let index = build_item_index(&doc);
        assert_eq!(index.by_key.len(), 1);
        assert!(index.by_key.contains_key("valid"));
        assert!(index.diagnostics.is_empty());
    }

    // ── Deeply nested groups (3+ levels) with repeatable at intermediate ──

    /// Spec: spec.md §5.3 — repeatable groups can nest to arbitrary depth
    #[test]
    fn deeply_nested_groups_with_intermediate_repeatable() {
        let doc = json!({
            "items": [{
                "key": "sections",
                "repeatable": true,
                "children": [{
                    "key": "rows",
                    "repeatable": true,
                    "children": [{
                        "key": "cells",
                        "repeatable": true,
                        "children": [
                            { "key": "value", "dataType": "string" }
                        ]
                    }]
                }]
            }]
        });
        let index = build_item_index(&doc);

        // All 4 levels present
        assert!(index.by_full_path.contains_key("sections"));
        assert!(index.by_full_path.contains_key("sections.rows"));
        assert!(index.by_full_path.contains_key("sections.rows.cells"));
        assert!(index.by_full_path.contains_key("sections.rows.cells.value"));

        // All 3 intermediate groups marked repeatable
        assert!(index.repeatable_groups.contains("sections"));
        assert!(index.repeatable_groups.contains("sections.rows"));
        assert!(index.repeatable_groups.contains("sections.rows.cells"));
        assert!(
            !index
                .repeatable_groups
                .contains("sections.rows.cells.value")
        );

        // Parent paths are correct
        assert_eq!(
            index.by_full_path["sections.rows.cells.value"]
                .parent_full_path
                .as_deref(),
            Some("sections.rows.cells")
        );

        assert!(index.diagnostics.is_empty());
    }
}

#![allow(clippy::missing_docs_in_private_items)]

use std::collections::HashMap;

use serde_json::json;

use crate::types::find_item_by_path;

use super::{
    detect_repeat_count, flatten_response_data, expand_repeat_instances, expand_wildcard_path,
    instantiate_wildcard_expr, parse_variables, rebuild_item_tree,
};

#[test]
fn test_rebuild_item_tree() {
    let def = json!({
        "items": [
            { "key": "name", "dataType": "string" },
            { "key": "age", "dataType": "integer" }
        ],
        "binds": {
            "name": { "required": "true" },
            "age": { "calculate": "$name" }
        }
    });
    let items = rebuild_item_tree(&def);
    assert_eq!(items.len(), 2);
    assert_eq!(items[0].key, "name");
    assert!(items[0].required_expr.is_some());
    assert_eq!(items[1].key, "age");
    assert!(items[1].calculate.is_some());
}

#[test]
fn test_wildcard_expansion() {
    let mut data = HashMap::new();
    data.insert("items[0].total".to_string(), json!(10));
    data.insert("items[1].total".to_string(), json!(20));
    data.insert("items[2].total".to_string(), json!(30));

    let expanded = expand_wildcard_path("items[*].total", &data);
    assert_eq!(expanded.len(), 3);
    assert_eq!(expanded[0], "items[0].total");
    assert_eq!(expanded[1], "items[1].total");
    assert_eq!(expanded[2], "items[2].total");
}

#[test]
fn test_wildcard_expansion_no_data() {
    let data = HashMap::new();
    let expanded = expand_wildcard_path("items[*].total", &data);
    assert!(expanded.is_empty(), "no data means zero expansion");
}

#[test]
fn test_wildcard_expansion_non_wildcard() {
    let data = HashMap::new();
    let expanded = expand_wildcard_path("simple.path", &data);
    assert_eq!(expanded, vec!["simple.path"]);
}

// ── Finding 34: Nested wildcard expansion ────────────────────

#[test]
fn expand_wildcard_path_nested_wildcards_expands_all_levels() {
    let mut data = HashMap::new();
    data.insert("items[0].subitems[0].value".to_string(), json!(1));
    data.insert("items[0].subitems[1].value".to_string(), json!(2));
    data.insert("items[1].subitems[0].value".to_string(), json!(3));

    let expanded = expand_wildcard_path("items[*].subitems[*].value", &data);
    assert_eq!(expanded.len(), 3);
    assert_eq!(expanded[0], "items[0].subitems[0].value");
    assert_eq!(expanded[1], "items[0].subitems[1].value");
    assert_eq!(expanded[2], "items[1].subitems[0].value");
}

// ── Finding 35: Sparse repeat indices ────────────────────────

#[test]
fn detect_repeat_count_sparse_indices_returns_max_plus_one() {
    let mut data = HashMap::new();
    data.insert("items[0].name".to_string(), json!("first"));
    data.insert("items[5].name".to_string(), json!("sixth"));

    let count = detect_repeat_count("items", &data);
    assert_eq!(count, 6, "returns max_index+1 (6), not actual count (2)");
}

// ── parse_variables edge cases ──────────────────────────────

#[test]
fn parse_variables_skips_missing_name() {
    let def = json!({
        "variables": [
            { "expression": "42" },
            { "name": "valid", "expression": "10" }
        ]
    });

    let vars = parse_variables(&def);
    assert_eq!(vars.len(), 1, "variable without name should be skipped");
    assert_eq!(vars[0].name, "valid");
}

#[test]
fn parse_variables_skips_missing_expression() {
    let def = json!({
        "variables": [
            { "name": "broken" },
            { "name": "valid", "expression": "10" }
        ]
    });

    let vars = parse_variables(&def);
    assert_eq!(
        vars.len(),
        1,
        "variable without expression should be skipped"
    );
    assert_eq!(vars[0].name, "valid");
}

#[test]
fn parse_variables_no_variables_key() {
    let def = json!({ "items": [] });
    let vars = parse_variables(&def);
    assert!(vars.is_empty());
}

#[test]
fn parse_variables_empty_array() {
    let def = json!({ "variables": [] });
    let vars = parse_variables(&def);
    assert!(vars.is_empty());
}

// ── Bind resolution fallback ─────────────────────────────────

#[test]
fn bind_resolution_fallback_to_bare_key() {
    let def = json!({
        "items": [{
            "key": "group",
            "children": [
                { "key": "name", "dataType": "string" }
            ]
        }],
        "binds": {
            "name": { "required": "true" }
        }
    });

    let items = rebuild_item_tree(&def);
    let child = find_item_by_path(&items, "group.name").unwrap();
    assert!(
        child.required_expr.is_some(),
        "nested item 'group.name' falls back to bare-key bind 'name' — \
         this could match the wrong bind if multiple items share a key"
    );
}

#[test]
fn bind_resolution_full_path_takes_priority() {
    let def = json!({
        "items": [{
            "key": "group",
            "children": [
                { "key": "name", "dataType": "string" }
            ]
        }],
        "binds": {
            "name": { "required": "true" },
            "group.name": { "required": "false" }
        }
    });

    let items = rebuild_item_tree(&def);
    let child = find_item_by_path(&items, "group.name").unwrap();
    assert_eq!(
        child.required_expr.as_deref(),
        Some("false"),
        "full path bind 'group.name' takes priority over bare key 'name'"
    );
}

// ── Repeat instance expansion ────────────────────────────────

#[test]
fn repeat_instance_expansion_creates_concrete_items() {
    let def = json!({
        "items": [
            {
                "key": "items",
                "repeatable": true,
                "children": [
                    { "key": "name", "dataType": "string" }
                ]
            }
        ]
    });

    let mut items = rebuild_item_tree(&def);
    let mut data = HashMap::new();
    data.insert("items[0].name".to_string(), json!("first"));
    data.insert("items[1].name".to_string(), json!("second"));

    expand_repeat_instances(&mut items, &data);

    assert!(
        find_item_by_path(&items, "items[0].name").is_some(),
        "items[0].name should exist after expansion"
    );
    assert!(
        find_item_by_path(&items, "items[1].name").is_some(),
        "items[1].name should exist after expansion"
    );
}

#[test]
fn expand_repeat_instances_no_repeatables() {
    let def = json!({
        "items": [
            { "key": "name", "dataType": "string" }
        ]
    });

    let mut items = rebuild_item_tree(&def);
    let data = HashMap::new();
    expand_repeat_instances(&mut items, &data);
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].key, "name");
}

// ── Wildcard expr instantiation ─────────────────────────────

#[test]
fn instantiate_wildcard_expr_no_prefix_collision() {
    let result = instantiate_wildcard_expr("$myrow[*].field + $row[*].field", "row", 0);
    assert_eq!(
        result, "$myrow[*].field + $row[0].field",
        "must not replace inside $myrow — only $row"
    );
}

#[test]
fn instantiate_wildcard_expr_dotted_base() {
    let result = instantiate_wildcard_expr(
        "$section.rows[*].qty * $section.rows[*].price",
        "section.rows",
        3,
    );
    assert_eq!(result, "$section.rows[3].qty * $section.rows[3].price");
}

#[test]
fn instantiate_wildcard_expr_no_match() {
    let result = instantiate_wildcard_expr("$other[*].x", "items", 0);
    assert_eq!(result, "$other[*].x");
}

// ── flatten_response_data ────────────────────────────────────

#[test]
fn flatten_response_data_leaves_field_arrays_whole() {
    let items = rebuild_item_tree(&json!({
        "items": [{ "key": "tags", "type": "field", "dataType": "multiChoice" }]
    }));
    let mut data = HashMap::new();
    data.insert("tags".to_string(), json!(["a", "b", "c"]));
    let flat = flatten_response_data(&items, &data).unwrap();
    assert!(!flat.values.contains_key("tags[0]"));
    assert_eq!(flat.values.get("tags"), Some(&json!(["a", "b", "c"])));
    assert!(flat.repeat_counts.is_empty());
}

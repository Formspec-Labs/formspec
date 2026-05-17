//! Phase 2: Recalculate — evaluate computed values and bind expressions.
//!
//! Submodules follow data flow: `json_fel` (coercion) → `variables` / `repeats` →
//! `bind_pass` (relevance, required, readonly, whitespace) → `calculate_pass` (fixpoint).
#![allow(clippy::missing_docs_in_private_items)]

mod bind_pass;
mod calculate_pass;
pub(crate) mod json_fel;
pub(crate) mod repeats;
mod variables;

use std::collections::{HashMap, HashSet};

use fel_core::FormspecEnvironment;
use serde_json::Value;

use crate::rebuild::parse_variables;
use crate::types::{ItemInfo, collect_data_types};

pub use variables::topo_sort_variables;

pub(crate) use bind_pass::eval_bool;

/// Recalculate all computed values with full processing model.
pub fn recalculate(
    items: &mut [ItemInfo],
    data: &HashMap<String, Value>,
    definition: &Value,
    now_iso: Option<&str>,
    previous_validations: Option<&[crate::types::ValidationResult]>,
    instances: &HashMap<String, Value>,
) -> (
    HashMap<String, Value>,
    HashMap<String, Value>,
    Option<String>,
) {
    let mut env = FormspecEnvironment::new();
    if let Some(now_iso) = now_iso {
        env.set_now_from_iso(now_iso);
    }

    for (name, value) in instances {
        env.set_instance(name, json_fel::json_to_runtime_fel(value));
    }
    let mut values = data.clone();

    // Build path→dataType map for type-aware coercion (spec S2.1.3: date strings → Date)
    let data_types = collect_data_types(items);

    for (k, v) in &values {
        env.set_field(
            k,
            json_fel::json_to_runtime_fel_typed(v, data_types.get(k).map(|s| s.as_str())),
        );
    }

    bind_pass::apply_whitespace_to_items(items, &mut values);

    for (k, v) in &values {
        env.set_field(
            k,
            json_fel::json_to_runtime_fel_typed(v, data_types.get(k).map(|s| s.as_str())),
        );
    }
    repeats::populate_repeat_group_arrays(items, &values, &mut env);

    let var_defs = parse_variables(definition);
    let (initial_var_values, scoped_var_values, cycle_err) =
        variables::evaluate_variables_scoped(&var_defs, &mut env);

    for (name, val) in &initial_var_values {
        env.set_variable(name, json_fel::json_to_runtime_fel(val));
    }

    let has_scoped = var_defs
        .iter()
        .any(|v| v.scope.as_deref().unwrap_or("#") != "#");
    let invalid_paths: HashSet<String> = previous_validations
        .unwrap_or(&[])
        .iter()
        .filter(|result| result.severity == crate::types::Severity::Error && !result.path.is_empty())
        .map(|result| result.path.clone())
        .collect();

    if has_scoped {
        bind_pass::evaluate_items_with_inheritance_scoped(
            items,
            &mut env,
            &mut values,
            true,
            false,
            &scoped_var_values,
            &invalid_paths,
        );
    } else {
        bind_pass::evaluate_items_with_inheritance(
            items,
            &mut env,
            &mut values,
            true,
            false,
            &invalid_paths,
        );
    }

    calculate_pass::settle_calculated_values(
        items,
        &mut env,
        &mut values,
        has_scoped.then_some(&scoped_var_values),
    );
    repeats::populate_repeat_group_arrays(items, &values, &mut env);

    let (mut final_var_values, final_scoped_var_values, _) =
        variables::evaluate_variables_scoped(&var_defs, &mut env);
    for (name, val) in &final_var_values {
        env.set_variable(name, json_fel::json_to_runtime_fel(val));
    }

    calculate_pass::settle_calculated_values(
        items,
        &mut env,
        &mut values,
        has_scoped.then_some(&final_scoped_var_values),
    );
    repeats::populate_repeat_group_arrays(items, &values, &mut env);

    (final_var_values, _, _) = variables::evaluate_variables_scoped(&var_defs, &mut env);
    for (name, val) in &final_var_values {
        env.set_variable(name, json_fel::json_to_runtime_fel(val));
    }

    // Re-evaluate required expressions now that all calculated values and
    // variables have settled. The initial bind pass evaluated required before
    // calculate for each item, so required states that depend on calculated
    // fields may be stale (spec S2.4: topological evaluation order).
    bind_pass::refresh_required_state(items, &mut env, &invalid_paths);

    (values, final_var_values, cycle_err)
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;
    use crate::rebuild::rebuild_item_tree;
    use crate::types::find_item_by_path;
    use serde_json::json;

    #[test]
    fn test_relevance_and_inheritance() {
        let def = json!({
            "items": [
                {
                    "key": "parent",
                    "children": [
                        { "key": "child", "dataType": "string" }
                    ]
                }
            ],
            "binds": {
                "parent": { "relevant": "false" },
                "parent.child": { "required": "true" }
            }
        });

        let data = HashMap::new();
        let mut items = rebuild_item_tree(&def);
        let _ = recalculate(&mut items, &data, &def, None, None, &HashMap::new());

        let parent = find_item_by_path(&items, "parent").unwrap();
        assert!(!parent.relevant, "parent should be non-relevant");
        let child = find_item_by_path(&items, "parent.child").unwrap();
        assert!(
            !child.relevant,
            "child should be non-relevant due to parent"
        );
    }

    #[test]
    fn test_relevance_child_irrelevant_parent_relevant() {
        let def = json!({
            "items": [
                {
                    "key": "parent",
                    "children": [
                        { "key": "child", "dataType": "string" }
                    ]
                }
            ],
            "binds": {
                "parent.child": { "relevant": "false" }
            }
        });

        let data = HashMap::new();
        let mut items = rebuild_item_tree(&def);
        let _ = recalculate(&mut items, &data, &def, None, None, &HashMap::new());

        let parent = find_item_by_path(&items, "parent").unwrap();
        assert!(parent.relevant, "parent should be relevant");
        let child = find_item_by_path(&items, "parent.child").unwrap();
        assert!(
            !child.relevant,
            "child should be non-relevant from own bind"
        );
    }

    #[test]
    fn test_readonly_or_inheritance() {
        let def = json!({
            "items": [
                {
                    "key": "section",
                    "children": [
                        { "key": "field", "dataType": "string" }
                    ]
                }
            ],
            "binds": {
                "section": { "readonly": "true" }
            }
        });

        let mut data = HashMap::new();
        data.insert("section.field".to_string(), json!("test"));

        let mut items = rebuild_item_tree(&def);
        let (values, _, _) = recalculate(&mut items, &data, &def, None, None, &HashMap::new());

        let child = find_item_by_path(&items, "section.field").unwrap();
        assert!(
            child.readonly,
            "child should be readonly due to OR inheritance from parent"
        );

        let parent = find_item_by_path(&items, "section").unwrap();
        assert!(parent.readonly, "parent should be explicitly readonly");

        let _ = values;
    }

    #[test]
    fn test_readonly_child_not_inherited_when_parent_not_readonly() {
        let def = json!({
            "items": [
                {
                    "key": "section",
                    "children": [
                        { "key": "field", "dataType": "string" }
                    ]
                }
            ],
            "binds": {
                "section.field": { "readonly": "true" }
            }
        });

        let mut data = HashMap::new();
        data.insert("section.field".to_string(), json!("test"));

        let mut items = rebuild_item_tree(&def);
        let _ = recalculate(&mut items, &data, &def, None, None, &HashMap::new());

        let parent = find_item_by_path(&items, "section").unwrap();
        assert!(
            !parent.readonly,
            "parent should not inherit readonly from child"
        );

        let child = find_item_by_path(&items, "section.field").unwrap();
        assert!(child.readonly, "child should be explicitly readonly");
    }

    #[test]
    fn recalculate_returns_values_and_variables() {
        let def = json!({
            "items": [
                { "key": "price", "dataType": "number" },
                { "key": "qty", "dataType": "integer" },
                { "key": "total", "dataType": "number" }
            ],
            "binds": {
                "total": { "calculate": "$price * $qty" }
            },
            "variables": [
                { "name": "taxRate", "expression": "0.1" }
            ]
        });

        let mut data = HashMap::new();
        data.insert("price".to_string(), json!(25));
        data.insert("qty".to_string(), json!(4));

        let mut items = rebuild_item_tree(&def);
        let (values, var_values, _) =
            recalculate(&mut items, &data, &def, None, None, &HashMap::new());

        assert_eq!(values.get("total"), Some(&json!(100)));
        assert!(
            var_values.contains_key("taxRate"),
            "variable should be evaluated"
        );
    }

    #[test]
    fn recalculate_sets_item_state() {
        let def = json!({
            "items": [
                { "key": "toggle", "dataType": "boolean" },
                { "key": "field", "dataType": "string" }
            ],
            "binds": {
                "field": { "relevant": "$toggle", "readonly": "true", "required": "true" }
            }
        });

        let mut data = HashMap::new();
        data.insert("toggle".to_string(), json!(false));

        let mut items = rebuild_item_tree(&def);
        let _ = recalculate(&mut items, &data, &def, None, None, &HashMap::new());

        let field = find_item_by_path(&items, "field").unwrap();
        assert!(
            !field.relevant,
            "field should be non-relevant when toggle is false"
        );
        assert!(field.readonly, "field should be readonly");
        assert!(!field.required, "required suppressed when non-relevant");
    }

    #[test]
    fn relevant_and_inheritance_three_levels() {
        let def = json!({
            "items": [{
                "key": "grandparent",
                "children": [{
                    "key": "parent",
                    "children": [
                        { "key": "child", "dataType": "string" }
                    ]
                }]
            }],
            "binds": {
                "grandparent": { "relevant": "false" }
            }
        });

        let data = HashMap::new();
        let mut items = rebuild_item_tree(&def);
        let _ = recalculate(&mut items, &data, &def, None, None, &HashMap::new());

        assert!(!find_item_by_path(&items, "grandparent").unwrap().relevant);
        assert!(
            !find_item_by_path(&items, "grandparent.parent")
                .unwrap()
                .relevant
        );
        assert!(
            !find_item_by_path(&items, "grandparent.parent.child")
                .unwrap()
                .relevant,
            "grandchild should be non-relevant via AND inheritance from grandparent"
        );
    }

    #[test]
    fn readonly_or_inheritance_three_levels() {
        let def = json!({
            "items": [{
                "key": "grandparent",
                "children": [{
                    "key": "parent",
                    "children": [
                        { "key": "child", "dataType": "string" }
                    ]
                }]
            }],
            "binds": {
                "grandparent": { "readonly": "true" }
            }
        });

        let mut data = HashMap::new();
        data.insert("grandparent.parent.child".to_string(), json!("val"));

        let mut items = rebuild_item_tree(&def);
        let _ = recalculate(&mut items, &data, &def, None, None, &HashMap::new());

        let child = find_item_by_path(&items, "grandparent.parent.child").unwrap();
        assert!(
            child.readonly,
            "grandchild should be readonly via OR inheritance from grandparent"
        );

        let parent = find_item_by_path(&items, "grandparent.parent").unwrap();
        assert!(
            parent.readonly,
            "parent should be readonly via OR inheritance from grandparent"
        );
    }

    #[test]
    fn required_not_inherited_three_levels() {
        let def = json!({
            "items": [{
                "key": "grandparent",
                "children": [{
                    "key": "parent",
                    "children": [
                        { "key": "child", "dataType": "string" }
                    ]
                }]
            }],
            "binds": {
                "grandparent": { "required": "true" }
            }
        });

        let data = HashMap::new();
        let mut items = rebuild_item_tree(&def);
        let _ = recalculate(&mut items, &data, &def, None, None, &HashMap::new());

        let grandparent = find_item_by_path(&items, "grandparent").unwrap();
        assert!(
            grandparent.required,
            "grandparent has explicit required bind"
        );

        let parent = find_item_by_path(&items, "grandparent.parent").unwrap();
        assert!(!parent.required, "parent should NOT inherit required");

        let child = find_item_by_path(&items, "grandparent.parent.child").unwrap();
        assert!(!child.required, "grandchild should NOT inherit required");
    }

    #[test]
    fn calculate_not_inherited() {
        let def = json!({
            "items": [{
                "key": "parent",
                "children": [
                    { "key": "child", "dataType": "integer" }
                ]
            }],
            "binds": {
                "parent": { "calculate": "42" }
            }
        });

        let data = HashMap::new();
        let mut items = rebuild_item_tree(&def);
        let (values, _, _) = recalculate(&mut items, &data, &def, None, None, &HashMap::new());

        assert_eq!(values.get("parent"), Some(&json!(42)));
        assert_eq!(values.get("parent.child"), None);
    }
}

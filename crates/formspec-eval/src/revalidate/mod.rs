//! Phase 3: Revalidate — validate all constraints and shapes.
#![allow(clippy::missing_docs_in_private_items)]

mod env;
mod expr;
mod items;
mod shapes;

/// Shared FEL evaluation for screener route conditions (see `screener_eval`).
pub(crate) use expr::{evaluate_shape_expression, result_has_eval_errors};

use std::collections::HashMap;

use serde_json::Value;

use crate::types::{
    EvalTrigger, ExtensionConstraint, ItemInfo, ValidationResult, collect_data_types,
};

use env::{apply_excluded_values_to_env, build_validation_env_typed};
use items::validate_items;
use shapes::validate_shape;

/// Validate all constraints and shapes.
pub fn revalidate(
    items: &[ItemInfo],
    values: &HashMap<String, Value>,
    variables: &HashMap<String, Value>,
    shapes: Option<&[Value]>,
    trigger: EvalTrigger,
    extension_constraints: &[ExtensionConstraint],
    formspec_version: &str,
    now_iso: Option<&str>,
    repeat_counts: Option<&HashMap<String, u64>>,
    instances: &HashMap<String, Value>,
) -> Vec<ValidationResult> {
    let mut results = Vec::new();

    if trigger == EvalTrigger::Disabled {
        return results;
    }

    let data_types = collect_data_types(items);
    let mut env = build_validation_env_typed(values, variables, now_iso, instances, &data_types);

    // 9a: Apply excludedValue — non-relevant fields with excludedValue="null" appear as null in FEL
    apply_excluded_values_to_env(items, &mut env);

    let shapes_by_id: HashMap<String, &Value> = shapes
        .unwrap_or(&[])
        .iter()
        .filter_map(|shape| {
            shape
                .get("id")
                .and_then(|v| v.as_str())
                .map(|id| (id.to_string(), shape))
        })
        .collect();

    // Build extension lookup map
    let ext_by_name: HashMap<&str, &ExtensionConstraint> = extension_constraints
        .iter()
        .map(|c| (c.name.as_str(), c))
        .collect();

    // Bind constraints + extension constraints
    validate_items(
        items,
        &mut env,
        values,
        &ext_by_name,
        formspec_version,
        repeat_counts,
        &mut results,
    );

    // Shape rules — filtered by timing
    if let Some(shapes) = shapes {
        for shape in shapes {
            let timing = shape
                .get("timing")
                .and_then(|v| v.as_str())
                .unwrap_or("continuous");
            match trigger {
                EvalTrigger::Disabled => unreachable!(),
                EvalTrigger::Continuous => {
                    if timing != "continuous" {
                        continue;
                    }
                }
                EvalTrigger::Submit => {
                    if timing == "demand" {
                        continue;
                    }
                }
                EvalTrigger::Demand => {
                    if timing != "demand" {
                        continue;
                    }
                }
            }
            validate_shape(shape, &shapes_by_id, &mut env, values, items, &mut results);
        }
    }

    results
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::env::build_validation_env;
    use super::*;
    use serde_json::json;

    #[test]
    fn revalidate_with_hand_built_items() {
        let items = vec![ItemInfo {
            key: "email".to_string(),
            path: "email".to_string(),
            item_type: "field".to_string(),
            data_type: Some("string".to_string()),
            currency: None,
            value: Value::Null,
            relevant: true,
            required: true,
            readonly: false,
            calculate: None,
            precision: None,
            constraint: Some("contains($email, \"@\")".to_string()),
            constraint_message: None,
            relevance: None,
            required_expr: None,
            readonly_expr: None,
            whitespace: None,
            nrb: None,
            excluded_value: None,
            default_value: None,
            default_expression: None,
            initial_value: None,
            prev_relevant: true,
            parent_path: None,
            repeatable: false,
            repeat_min: None,
            repeat_max: None,
            option_values: vec![],
            accept_types: vec![],
            extensions: vec![],
            pre_populate_instance: None,
            pre_populate_path: None,
            children: vec![],
        }];

        let values: HashMap<String, Value> = HashMap::new();
        let results = revalidate(
            &items,
            &values,
            &HashMap::new(),
            None,
            EvalTrigger::Continuous,
            &[],
            "1.0.0",
            None,
            None,
            &HashMap::new(),
        );
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].path, "email");
        assert_eq!(results[0].constraint_kind, "required");
        assert!(results[0].message.contains("Required"));
    }

    #[test]
    fn revalidate_skips_non_relevant() {
        let items = vec![ItemInfo {
            key: "hidden".to_string(),
            path: "hidden".to_string(),
            item_type: "field".to_string(),
            data_type: Some("string".to_string()),
            currency: None,
            value: Value::Null,
            relevant: false,
            required: true,
            readonly: false,
            calculate: None,
            precision: None,
            constraint: Some("false".to_string()),
            constraint_message: None,
            relevance: None,
            required_expr: None,
            readonly_expr: None,
            whitespace: None,
            nrb: None,
            excluded_value: None,
            default_value: None,
            default_expression: None,
            initial_value: None,
            prev_relevant: true,
            parent_path: None,
            repeatable: false,
            repeat_min: None,
            repeat_max: None,
            option_values: vec![],
            accept_types: vec![],
            extensions: vec![],
            pre_populate_instance: None,
            pre_populate_path: None,
            children: vec![],
        }];

        let values: HashMap<String, Value> = HashMap::new();
        let results = revalidate(
            &items,
            &values,
            &HashMap::new(),
            None,
            EvalTrigger::Continuous,
            &[],
            "1.0.0",
            None,
            None,
            &HashMap::new(),
        );
        assert!(
            results.is_empty(),
            "non-relevant items should be skipped entirely"
        );
    }

    #[test]
    fn revalidate_constraint_passes() {
        let items = vec![ItemInfo {
            key: "age".to_string(),
            path: "age".to_string(),
            item_type: "field".to_string(),
            data_type: Some("integer".to_string()),
            currency: None,
            value: json!(25),
            relevant: true,
            required: false,
            readonly: false,
            calculate: None,
            precision: None,
            constraint: Some("$age >= 18".to_string()),
            constraint_message: None,
            relevance: None,
            required_expr: None,
            readonly_expr: None,
            whitespace: None,
            nrb: None,
            excluded_value: None,
            default_value: None,
            default_expression: None,
            initial_value: None,
            prev_relevant: true,
            parent_path: None,
            repeatable: false,
            repeat_min: None,
            repeat_max: None,
            option_values: vec![],
            accept_types: vec![],
            extensions: vec![],
            pre_populate_instance: None,
            pre_populate_path: None,
            children: vec![],
        }];

        let mut values = HashMap::new();
        values.insert("age".to_string(), json!(25));

        let results = revalidate(
            &items,
            &values,
            &HashMap::new(),
            None,
            EvalTrigger::Continuous,
            &[],
            "1.0.0",
            None,
            None,
            &HashMap::new(),
        );
        assert!(
            results.is_empty(),
            "constraint $age >= 18 should pass for 25"
        );
    }

    #[test]
    fn build_validation_env_skips_repeat_group_arrays() {
        let mut data = HashMap::new();
        data.insert("rows".to_string(), json!([{"a": 1}]));
        data.insert("rows[0].a".to_string(), json!(1));

        let env = build_validation_env(&data, &HashMap::new(), None, &HashMap::new());
        assert!(
            !env.data.contains_key("rows"),
            "build_validation_env should skip repeat group arrays entirely"
        );
    }

    /// Spec: §3.8.1 — Bind constraint skipped when value is empty.
    /// "A constraint that cannot be evaluated due to null inputs is not considered
    /// violated."  Empty string, null, and empty array should all skip constraint.
    #[test]
    fn constraint_skipped_on_empty_string() {
        let items = vec![ItemInfo {
            key: "email".to_string(),
            path: "email".to_string(),
            item_type: "field".to_string(),
            data_type: Some("string".to_string()),
            currency: None,
            value: Value::Null,
            relevant: true,
            required: false,
            readonly: false,
            calculate: None,
            precision: None,
            constraint: Some("matches($, '.*@.*')".to_string()),
            constraint_message: None,
            relevance: None,
            required_expr: None,
            readonly_expr: None,
            whitespace: None,
            nrb: None,
            excluded_value: None,
            default_value: None,
            default_expression: None,
            initial_value: None,
            prev_relevant: true,
            parent_path: None,
            repeatable: false,
            repeat_min: None,
            repeat_max: None,
            option_values: vec![],
            accept_types: vec![],
            extensions: vec![],
            pre_populate_instance: None,
            pre_populate_path: None,
            children: vec![],
        }];

        // Empty string value — constraint must not fire
        let mut values: HashMap<String, Value> = HashMap::new();
        values.insert("email".to_string(), json!(""));
        let results = revalidate(
            &items,
            &values,
            &HashMap::new(),
            None,
            EvalTrigger::Continuous,
            &[],
            "1.0.0",
            None,
            None,
            &HashMap::new(),
        );
        let constraint_errors: Vec<_> = results
            .iter()
            .filter(|r| r.code == "CONSTRAINT_FAILED")
            .collect();
        assert!(
            constraint_errors.is_empty(),
            "constraint must not fire on empty string, got: {constraint_errors:?}"
        );
    }

    #[test]
    fn constraint_skipped_on_null() {
        let items = vec![ItemInfo {
            key: "email".to_string(),
            path: "email".to_string(),
            item_type: "field".to_string(),
            data_type: Some("string".to_string()),
            currency: None,
            value: Value::Null,
            relevant: true,
            required: false,
            readonly: false,
            calculate: None,
            precision: None,
            constraint: Some("matches($, '.*@.*')".to_string()),
            constraint_message: None,
            relevance: None,
            required_expr: None,
            readonly_expr: None,
            whitespace: None,
            nrb: None,
            excluded_value: None,
            default_value: None,
            default_expression: None,
            initial_value: None,
            prev_relevant: true,
            parent_path: None,
            repeatable: false,
            repeat_min: None,
            repeat_max: None,
            option_values: vec![],
            accept_types: vec![],
            extensions: vec![],
            pre_populate_instance: None,
            pre_populate_path: None,
            children: vec![],
        }];

        let values: HashMap<String, Value> = HashMap::new();
        let results = revalidate(
            &items,
            &values,
            &HashMap::new(),
            None,
            EvalTrigger::Continuous,
            &[],
            "1.0.0",
            None,
            None,
            &HashMap::new(),
        );
        let constraint_errors: Vec<_> = results
            .iter()
            .filter(|r| r.code == "CONSTRAINT_FAILED")
            .collect();
        assert!(
            constraint_errors.is_empty(),
            "constraint must not fire on null value, got: {constraint_errors:?}"
        );
    }

    #[test]
    fn constraint_skipped_on_empty_array() {
        let items = vec![ItemInfo {
            key: "tags".to_string(),
            path: "tags".to_string(),
            item_type: "field".to_string(),
            data_type: Some("multiChoice".to_string()),
            currency: None,
            value: Value::Null,
            relevant: true,
            required: false,
            readonly: false,
            calculate: None,
            precision: None,
            constraint: Some("count($tags) > 0".to_string()),
            constraint_message: None,
            relevance: None,
            required_expr: None,
            readonly_expr: None,
            whitespace: None,
            nrb: None,
            excluded_value: None,
            default_value: None,
            default_expression: None,
            initial_value: None,
            prev_relevant: true,
            parent_path: None,
            repeatable: false,
            repeat_min: None,
            repeat_max: None,
            option_values: vec![],
            accept_types: vec![],
            extensions: vec![],
            pre_populate_instance: None,
            pre_populate_path: None,
            children: vec![],
        }];

        let mut values: HashMap<String, Value> = HashMap::new();
        values.insert("tags".to_string(), json!([]));
        let results = revalidate(
            &items,
            &values,
            &HashMap::new(),
            None,
            EvalTrigger::Continuous,
            &[],
            "1.0.0",
            None,
            None,
            &HashMap::new(),
        );
        let constraint_errors: Vec<_> = results
            .iter()
            .filter(|r| r.code == "CONSTRAINT_FAILED")
            .collect();
        assert!(
            constraint_errors.is_empty(),
            "constraint must not fire on empty array, got: {constraint_errors:?}"
        );
    }

    /// BUG-3: A constraint calling an undefined function currently produces Null,
    /// which constraint_passes treats as "pass." This should emit a validation error.
    #[test]
    fn constraint_with_undefined_function_should_fail() {
        let items = vec![ItemInfo {
            key: "amount".to_string(),
            path: "amount".to_string(),
            item_type: "field".to_string(),
            data_type: Some("number".to_string()),
            currency: None,
            value: json!(100),
            relevant: true,
            required: false,
            readonly: false,
            calculate: None,
            precision: None,
            constraint: Some("bogusFunc($amount) > 0".to_string()),
            constraint_message: Some("Custom message".to_string()),
            relevance: None,
            required_expr: None,
            readonly_expr: None,
            whitespace: None,
            nrb: None,
            excluded_value: None,
            default_value: None,
            default_expression: None,
            initial_value: None,
            prev_relevant: true,
            parent_path: None,
            repeatable: false,
            repeat_min: None,
            repeat_max: None,
            option_values: vec![],
            accept_types: vec![],
            extensions: vec![],
            pre_populate_instance: None,
            pre_populate_path: None,
            children: vec![],
        }];

        let mut values = HashMap::new();
        values.insert("amount".to_string(), json!(100));

        let results = revalidate(
            &items,
            &values,
            &HashMap::new(),
            None,
            EvalTrigger::Continuous,
            &[],
            "1.0.0",
            None,
            None,
            &HashMap::new(),
        );
        let constraint_errors: Vec<_> = results
            .iter()
            .filter(|r| r.code == "CONSTRAINT_FAILED")
            .collect();
        assert!(
            !constraint_errors.is_empty(),
            "constraint using undefined function should produce a validation error, got none"
        );
    }

    /// BUG-3: Shape constraint with undefined function should also fail.
    #[test]
    fn shape_with_undefined_function_should_fail() {
        let items = vec![ItemInfo {
            key: "amount".to_string(),
            path: "amount".to_string(),
            item_type: "field".to_string(),
            data_type: Some("number".to_string()),
            currency: None,
            value: json!(100),
            relevant: true,
            required: false,
            readonly: false,
            calculate: None,
            precision: None,
            constraint: None,
            constraint_message: None,
            relevance: None,
            required_expr: None,
            readonly_expr: None,
            whitespace: None,
            nrb: None,
            excluded_value: None,
            default_value: None,
            default_expression: None,
            initial_value: None,
            prev_relevant: true,
            parent_path: None,
            repeatable: false,
            repeat_min: None,
            repeat_max: None,
            option_values: vec![],
            accept_types: vec![],
            extensions: vec![],
            pre_populate_instance: None,
            pre_populate_path: None,
            children: vec![],
        }];

        let mut values = HashMap::new();
        values.insert("amount".to_string(), json!(100));

        let shapes = vec![json!({
            "target": "amount",
            "constraint": "bogusFunc($amount) > 0",
            "message": "Amount must pass bogus check",
            "severity": "error"
        })];

        let results = revalidate(
            &items,
            &values,
            &HashMap::new(),
            Some(&shapes),
            EvalTrigger::Continuous,
            &[],
            "1.0.0",
            None,
            None,
            &HashMap::new(),
        );
        let shape_errors: Vec<_> = results
            .iter()
            .filter(|r| r.code == "SHAPE_FAILED")
            .collect();
        assert!(
            !shape_errors.is_empty(),
            "shape using undefined function should produce a validation error, got none"
        );
    }
}

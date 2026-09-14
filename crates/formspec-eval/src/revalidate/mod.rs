//! Phase 3: Revalidate — validate all constraints and shapes.
#![allow(clippy::missing_docs_in_private_items)]

mod env;
mod expr;
mod items;
mod shapes;

/// Shared FEL evaluation for screener route conditions (see `screener_eval`).
pub(crate) use expr::{evaluate_shape_expression, result_has_eval_errors};

use std::collections::{HashMap, HashSet};

use serde_json::Value;

use crate::types::{EvalDiagnostic, EvalTrigger, ExtensionConstraint, ItemInfo, ValidationResult};

use crate::rebuild::is_wildcard_bind;
use crate::recalculate::repeats::ResponseIndex;
use env::{
    RepeatGroupArrays, SiblingValues, apply_excluded_values_to_env, build_validation_env_typed,
};
use items::validate_items;
use shapes::validate_shape;

/// Validate all constraints and shapes.
///
/// Returns validation results and, separately, author diagnostics for
/// constraint and shape expressions that hit evaluation errors (Core §3.10.2).
/// Those expressions evaluate to `null` and pass (§3.8.1), so they never
/// appear among the validation results.
pub fn revalidate(
    items: &[ItemInfo],
    values: &HashMap<String, Value>,
    variables: &HashMap<String, fel_core::Value>,
    shapes: Option<&[Value]>,
    trigger: EvalTrigger,
    extension_constraints: &[ExtensionConstraint],
    formspec_version: &str,
    now_iso: Option<&str>,
    repeat_counts: Option<&HashMap<String, u64>>,
    instances: &HashMap<String, Value>,
) -> (Vec<ValidationResult>, Vec<EvalDiagnostic>) {
    let mut results = Vec::new();
    let mut diagnostics = Vec::new();

    if trigger == EvalTrigger::Disabled {
        return (results, diagnostics);
    }

    let index = ResponseIndex::new(items, values);
    let data_types = &index.data_types;
    let mut env = build_validation_env_typed(values, variables, now_iso, instances, data_types);

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

    let siblings = SiblingValues::new(values, data_types);

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
        &siblings,
        &ext_by_name,
        formspec_version,
        repeat_counts,
        &mut results,
        &mut diagnostics,
    );

    // Shape rules — filtered by timing. Non-wildcard shapes read `$group` row
    // arrays; wildcard shapes resolve rows through flat indexed keys.
    if let Some(shapes) = shapes {
        let mut repeat_arrays = RepeatGroupArrays::new(items, values, &index);
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
            let target = shape.get("target").and_then(|v| v.as_str()).unwrap_or("");
            let with_arrays = !is_wildcard_bind(target);
            if with_arrays {
                repeat_arrays.swap(&mut env);
            }
            validate_shape(
                shape,
                &shapes_by_id,
                &mut env,
                values,
                &siblings,
                items,
                &mut results,
                &mut diagnostics,
            );
            if with_arrays {
                repeat_arrays.swap(&mut env);
            }
        }
    }

    // A shape referenced from a composition is evaluated again there; keep one copy.
    let mut seen = HashSet::new();
    diagnostics.retain(|d| seen.insert(d.clone()));

    (results, diagnostics)
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
        let (results, _) = revalidate(
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
        let (results, _) = revalidate(
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

        let (results, _) = revalidate(
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
        let (results, _) = revalidate(
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
        let (results, _) = revalidate(
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
        let (results, _) = revalidate(
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

    /// BUG-3: an undefined function is a definition error (Core §3.10.1), so the
    /// constraint fails like a syntax error; authors also get the diagnostic.
    #[test]
    fn constraint_with_undefined_function_fails_with_diagnostic() {
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

        let (results, diagnostics) = revalidate(
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
        assert_eq!(results.len(), 1, "got {results:?}");
        assert_eq!(results[0].code, "CONSTRAINT_PARSE_ERROR");
        assert_eq!(
            results[0].message,
            "Constraint expression error: undefined function: bogusFunc"
        );
        assert_eq!(diagnostics.len(), 1, "{diagnostics:?}");
        assert_eq!(diagnostics[0].path, "amount");
        assert_eq!(diagnostics[0].message, "undefined function: bogusFunc");
    }

    /// BUG-3 for shapes: fail (Core §3.10.1), plus a diagnostic naming the expression.
    #[test]
    fn shape_with_undefined_function_fails_with_diagnostic() {
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

        let (results, diagnostics) = revalidate(
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
        assert_eq!(results.len(), 1, "got {results:?}");
        assert_eq!(results[0].message, "Amount must pass bogus check");
        assert_eq!(diagnostics.len(), 1, "{diagnostics:?}");
        assert_eq!(diagnostics[0].expression, "bogusFunc($amount) > 0");
    }
}

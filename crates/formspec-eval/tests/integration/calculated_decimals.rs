//! Calculated numbers retain their type until evaluation and validation finish.
// Rust guideline compliant 2026-02-21

use std::collections::HashMap;

use formspec_eval::{EvalOptions, ExtensionConstraint, evaluate};
use serde_json::{Value, json};

const THIRD: &str = "0.3333333333333333333333333333";

fn definition(expression: &str, data_type: &str) -> Value {
    json!({
        "items": [
            { "key": "ratio", "type": "field", "dataType": data_type }
        ],
        "binds": [{ "path": "ratio", "calculate": expression }]
    })
}

#[test]
fn calculated_decimals_validate_without_losing_digits() {
    for (expression, expected) in [
        ("1 / 3", json!(THIRD)),
        ("-1 / 3", json!(format!("-{THIRD}"))),
        ("2 / 5", json!(0.4)),
        ("0 / 3", json!(0)),
        (
            "0.1234567890123456789012345678",
            json!("0.1234567890123456789012345678"),
        ),
    ] {
        let result = evaluate(
            &definition(expression, "decimal"),
            &HashMap::new(),
            &EvalOptions::default(),
        );
        assert_eq!(result.values["ratio"], expected, "{expression}");
        assert!(
            result.validations.is_empty(),
            "{expression}: {:?}",
            result.validations
        );
        assert!(
            result.diagnostics.is_empty(),
            "{expression}: {:?}",
            result.diagnostics
        );
    }
}

#[test]
fn decimal_constraints_and_shapes_receive_numbers() {
    let mut def = definition("1 / 3", "decimal");
    def["binds"][0]["constraint"] = json!("$ > 0 and $ < 1");
    def["shapes"] = json!([{
        "id": "precise-ratio", "target": "ratio",
        "constraint": "$ratio * 3 == 0.9999999999999999999999999999"
    }]);
    let result = evaluate(&def, &HashMap::new(), &EvalOptions::default());
    assert!(result.validations.is_empty(), "{:?}", result.validations);
    assert!(result.diagnostics.is_empty(), "{:?}", result.diagnostics);
}

#[test]
fn calculated_numeric_strings_and_fractional_integers_remain_invalid() {
    for (expression, data_type) in [
        ("'3.14'", "decimal"),
        ("1 / 3", "integer"),
        ("1 / 3", "string"),
    ] {
        let result = evaluate(
            &definition(expression, data_type),
            &HashMap::new(),
            &EvalOptions::default(),
        );
        assert!(
            result.validations.iter().any(|v| v.code == "TYPE_MISMATCH"),
            "{data_type}: {expression}"
        );
    }
}

#[test]
fn recurring_repeat_values_are_included_in_aggregates() {
    let def = json!({
        "items": [
            { "key": "rows", "type": "group", "repeatable": true, "children": [
                { "key": "ratio", "type": "field", "dataType": "decimal" }
            ] },
            { "key": "total", "type": "field", "dataType": "decimal" }
        ],
        "binds": [
            { "path": "rows[*].ratio", "calculate": "1 / 3", "constraint": "$ > 0" },
            { "path": "total", "calculate": "sum($rows[*].ratio)" }
        ]
    });
    let data = HashMap::from([("rows".to_string(), json!([{}, {}]))]);
    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(
        result.values["total"],
        json!("0.6666666666666666666666666666")
    );
    assert!(result.validations.is_empty(), "{:?}", result.validations);
    assert!(result.diagnostics.is_empty(), "{:?}", result.diagnostics);
}

#[test]
fn exact_decimals_still_enforce_registry_numeric_limits() {
    let mut def = definition("1 / 3", "decimal");
    def["items"][0]["extensions"] = json!({ "x-ratio-limit": true });
    for (minimum, maximum, expected_code) in [
        (Some(0.5), None, "RANGE_UNDERFLOW"),
        (None, Some(0.2), "RANGE_OVERFLOW"),
    ] {
        let options = EvalOptions::default().extension_constraints(vec![ExtensionConstraint {
            name: "x-ratio-limit".to_string(),
            display_name: None,
            pattern: None,
            max_length: None,
            minimum,
            maximum,
            base_type: Some("decimal".to_string()),
            status: "stable".to_string(),
            deprecation_notice: None,
            compatibility_version: None,
        }]);
        let result = evaluate(&def, &HashMap::new(), &options);
        assert_eq!(result.validations.len(), 1, "{:?}", result.validations);
        assert_eq!(result.validations[0].code, expected_code);
    }
}

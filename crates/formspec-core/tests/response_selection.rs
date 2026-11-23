//! Shared Response-selection vectors from the Core spec.

use formspec_core::response_selection::select_json;
use serde_json::Value;

const CASES: &str =
    include_str!("../../../tests/conformance/fixtures/response-selection/selection.json");

fn merged(base: &Value, changes: &Value) -> String {
    let mut merged = base.as_object().unwrap().clone();
    merged.extend(changes.as_object().unwrap().clone());
    Value::Object(merged).to_string()
}

#[test]
fn response_selection_conformance() {
    let suite: Value = serde_json::from_str(CASES).unwrap();
    // Keep original numeric spellings when handing Responses to the selector.
    let raw_suite: std::collections::HashMap<String, Box<serde_json::value::RawValue>> =
        serde_json::from_str(CASES).unwrap();
    let records: std::collections::HashMap<String, Box<serde_json::value::RawValue>> =
        serde_json::from_str(raw_suite["records"].get()).unwrap();
    for case in suite["cases"].as_array().unwrap() {
        let inputs: Vec<_> = case["records"]
            .as_array()
            .unwrap()
            .iter()
            .map(|name| &records[name.as_str().unwrap()])
            .collect();
        let result = select_json(
            &serde_json::to_string(&inputs).unwrap(),
            &merged(&suite["selection"], &case["selection"]),
            &merged(&suite["context"], &case["context"]),
        )
        .unwrap();
        let actual: Value = serde_json::from_str(&result).unwrap();
        assert_eq!(actual, case["expected"], "{}", case["name"]);
    }
}

#[test]
fn records_require_a_store_owned_kind() {
    let suite: Value = serde_json::from_str(CASES).unwrap();
    let mut record = suite["records"]["prepared"].clone();
    record.as_object_mut().unwrap().remove("kind");
    let error = select_json(
        &serde_json::to_string(&[record]).unwrap(),
        &suite["selection"].to_string(),
        &suite["context"].to_string(),
    )
    .unwrap_err();
    assert!(error.contains("missing field `kind`"), "{error}");
}

#[test]
fn missing_upstream_subject_is_a_wire_error() {
    let suite: Value = serde_json::from_str(CASES).unwrap();
    let case = &suite["missingUpstreamSubject"];
    let error = select_json(
        "[]",
        &merged(&suite["selection"], &case["selection"]),
        &case["context"].to_string(),
    )
    .unwrap_err();
    assert!(
        error.contains(case["expectedError"].as_str().unwrap()),
        "{error}"
    );
}

#[test]
fn retained_mapping_requires_the_current_verified_digest() {
    let suite: Value = serde_json::from_str(CASES).unwrap();
    let case = suite["cases"]
        .as_array()
        .unwrap()
        .iter()
        .find(|case| case["name"] == "mapping receives the whole projected array once")
        .unwrap();
    let records: Vec<_> = case["records"]
        .as_array()
        .unwrap()
        .iter()
        .map(|name| &suite["records"][name.as_str().unwrap()])
        .collect();
    let records = serde_json::to_string(&records).unwrap();
    let mut selection = case["selection"].clone();
    selection["pin"] = "at-open".into();
    let selection = merged(&suite["selection"], &selection);
    let mut context: Value =
        serde_json::from_str(&merged(&suite["context"], &case["context"])).unwrap();
    let run = |context: &Value| -> Value {
        let outcome = select_json(&records, &selection, &context.to_string()).unwrap();
        serde_json::from_str(&outcome).unwrap()
    };
    let opened = run(&context);
    assert_eq!(opened["status"], "available");
    context["pin"] = opened;
    assert_eq!(run(&context)["status"], "available");
    context["mapping"]["reference"]["digest"] = format!("sha256:{}", "b".repeat(64)).into();
    assert_eq!(run(&context)["status"], "unavailable");
    context.as_object_mut().unwrap().remove("mapping");
    assert_eq!(run(&context)["status"], "unavailable");
}

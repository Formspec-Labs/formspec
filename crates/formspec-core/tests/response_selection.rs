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

#[test]
fn prepare_exposes_every_matching_position_before_delivery() {
    use formspec_core::response_selection::{SelectionOutcome, prepare};
    let suite: Value = serde_json::from_str(CASES).unwrap();
    let records: Vec<_> = serde_json::from_value(serde_json::json!([
        suite["records"]["wrong-scope"],
        suite["records"]["old"],
        suite["records"]["draft"],
        suite["records"]["filed"]
    ]))
    .unwrap();
    let selection = serde_json::from_value(suite["selection"].clone()).unwrap();
    let mut context: formspec_core::response_selection::SelectionContext =
        serde_json::from_value(suite["context"].clone()).unwrap();
    context.include_input_positions = true;
    let prepared = prepare(&records, &selection, &context).unwrap();
    assert_eq!(prepared.candidate_positions().collect::<Vec<_>>(), [1, 3]);
    // A host drops a prepared selection when record authorization fails.
    drop(prepared);
    let result = prepare(&records, &selection, &context).unwrap().complete();
    let SelectionOutcome::Available {
        input_positions, ..
    } = result
    else {
        panic!("expected available delivery");
    };
    assert_eq!(input_positions.unwrap(), [3]);
    context.authorized = false;
    assert!(prepare(&records, &selection, &context).is_none());
}

#[test]
fn host_record_id_breaks_ties_and_keys_disposition_evidence() {
    use serde_json::json;

    let suite: Value = serde_json::from_str(CASES).unwrap();
    let mut old = suite["records"]["old"].clone();
    let mut filed = suite["records"]["filed"].clone();
    old["recordId"] = json!("host-a");
    filed["recordId"] = json!("host-b");
    old["response"]["authored"] = filed["response"]["authored"].clone();
    old["response"]["id"] = json!("client-z");
    filed["response"]["id"] = json!("client-a");
    let inputs = json!([filed, old]).to_string();
    let context = &suite["context"];
    let select = |inputs: &str, selection: &Value, overrides: &Value| -> Value {
        let text =
            select_json(inputs, &selection.to_string(), &merged(context, overrides)).unwrap();
        serde_json::from_str(&text).unwrap()
    };
    let selection = &suite["selection"];
    let ranked = select(&inputs, selection, &json!({}));
    assert_eq!(ranked["records"][0]["responseId"], "host-a");
    assert_eq!(ranked["value"], json!({"result":"old"}));
    let filed_delivery = select(&json!([filed]).to_string(), selection, &json!({}));
    let mut disposition_selection = selection.clone();
    disposition_selection["disposition"] = json!("urn:test:accepted");
    let dispositions = json!({"dispositions":[{
        "value":"urn:test:accepted",
        "responseId":"host-b",
        "responseHash":filed_delivery["records"][0]["responseHash"],
    }]});
    let accepted = select(&inputs, &disposition_selection, &dispositions);
    assert_eq!(accepted["records"][0]["responseId"], "host-b");

    let mut no_authored_id = old.clone();
    no_authored_id["response"]
        .as_object_mut()
        .unwrap()
        .remove("id");
    let selected = select(&json!([no_authored_id]).to_string(), selection, &json!({}));
    assert_eq!(selected["records"][0]["responseId"], "host-a");

    filed.as_object_mut().unwrap().remove("recordId");
    let default = select(&json!([filed]).to_string(), selection, &json!({}));
    assert_eq!(default["records"][0]["responseId"], "client-a");
}

#[test]
fn a_completed_list_pin_cannot_contain_two_revisions_of_one_subject() {
    use formspec_core::subject_key::{SubjectKey, subject_id};
    use serde_json::json;
    use std::collections::BTreeMap;

    let suite: Value = serde_json::from_str(CASES).unwrap();
    let old = &suite["records"]["old"];
    let mut filing = suite["records"]["filed"].clone();
    let selection = merged(
        &suite["selection"],
        &json!({"cardinality":"latest-per-subject","pin":"at-open"}),
    );
    let select = |inputs: Value, context: &Value| -> Value {
        serde_json::from_str(
            &select_json(&inputs.to_string(), &selection, &context.to_string()).unwrap(),
        )
        .unwrap()
    };
    let context = &suite["context"];
    let evidence = select(json!([filing]), context)["records"][0].clone();
    // Produce a valid list value and digest from two distinct subjects, then use the actual
    // evidence of two revisions of one subject. The answer data is identical in both lists.
    let subject_type = filing["response"]["subject"]["type"]
        .as_str()
        .unwrap()
        .to_owned();
    let mut distinct_keys: BTreeMap<String, SubjectKey> =
        serde_json::from_value(filing["response"]["subject"]["keys"].clone()).unwrap();
    for value in distinct_keys.values_mut() {
        if let SubjectKey::String(text) = value {
            *text = "org-other".to_owned();
            break;
        }
    }
    let distinct_id = subject_id(&subject_type, &distinct_keys).unwrap();
    filing["response"]["subject"] = json!({
        "id": distinct_id,
        "type": subject_type,
        "keys": distinct_keys
    });
    let mut pin = select(json!([filing, old]), context);
    assert_eq!(pin["records"].as_array().unwrap().len(), 2);
    let record = pin["records"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|record| record["responseId"] == evidence["responseId"])
        .unwrap();
    *record = evidence;
    pin.as_object_mut().unwrap().remove("status");
    let mut pinned_context = context.clone();
    pinned_context["pin"] = pin;
    let result = select(json!([suite["records"]["filed"], old]), &pinned_context);
    assert_eq!(result, json!({"status":"unavailable"}));
}

//! Candidate assembly fixtures shared with the Python and engine binding tests.

use formspec_eval::{
    CandidateAssemblyError, assemble_candidate, assemble_candidate_json, exact_json,
};

const FIXTURE: &str = include_str!("../../../tests/fixtures/assemble-candidate.json");

fn inputs() -> exact_json::Value {
    exact_json::from_str(FIXTURE).unwrap()
}

#[test]
fn assembles_available_receipts_in_name_order_and_reassembly_is_a_fixpoint() {
    let fixture = inputs();
    let definition = fixture["definition"].to_string();
    let response = fixture["response"].to_string();
    let resolution = fixture["resolution"].to_string();
    let assembled = assemble_candidate_json(&definition, &response, "{}", &resolution).unwrap();
    let mut expected = fixture["response"].clone();
    expected.as_object_mut().unwrap().insert(
        "resolvedInstances".into(),
        fixture["resolvedInstances"].clone(),
    );
    assert_eq!(exact_json::from_str(&assembled).unwrap(), expected);
    assert!(assembled.contains("1234567890.123456789012345678"));
    assert_eq!(
        assemble_candidate_json(&definition, &assembled, "{}", &resolution).unwrap(),
        assembled
    );
}

#[test]
fn refuses_missing_resolution_and_removes_stale_evidence_without_response_reads() {
    let fixture = inputs();
    let input = fixture["response"].to_string();
    let refusal = assemble_candidate_json(&fixture["definition"].to_string(), &input, "{}", "{}")
        .unwrap_err();
    assert!(refusal.contains("a_completed"), "{refusal}");

    let assembled = assemble_candidate_json("{}", &input, "{}", "{}").unwrap();
    let mut expected = fixture["response"].clone();
    expected
        .as_object_mut()
        .unwrap()
        .shift_remove("resolvedInstances");
    assert_eq!(exact_json::from_str(&assembled).unwrap(), expected);
}

#[test]
fn refuses_deliveries_that_disagree_with_the_definition() {
    let fixture = inputs();
    let definition = fixture["definition"].to_string();
    let response = fixture["response"].to_string();
    let mut failures = Vec::new();

    for case in fixture["refusals"].as_array().unwrap() {
        let instance = case["instance"].as_str().unwrap();
        let expected = format!(
            "Response instance '{instance}' {}",
            case["message"].as_str().unwrap()
        );
        let mut resolution = fixture["resolution"].clone();
        resolution.as_object_mut().unwrap()[instance]
            .as_object_mut()
            .unwrap()
            .extend(case["delivery"].as_object().unwrap().clone());
        match assemble_candidate_json(&definition, &response, "{}", &resolution.to_string()) {
            Err(error) if error == expected => {}
            Err(error) => failures.push(format!("expected {expected}, got {error}")),
            Ok(_) => failures.push(format!("expected {expected}, but assembly succeeded")),
        }
    }

    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn native_callers_can_match_the_refusal_without_parsing_the_message() {
    let fixture = inputs();
    let mut resolution: std::collections::BTreeMap<
        String,
        formspec_core::instance_resolution::DeliveredSelection,
    > = serde_json::from_str(&fixture["resolution"].to_string()).unwrap();
    resolution.get_mut("a_completed").unwrap().pinned = false;

    let error = assemble_candidate(
        &fixture["definition"],
        fixture["response"].clone(),
        &exact_json::Value::Null,
        &resolution,
    )
    .unwrap_err();

    assert!(matches!(error, CandidateAssemblyError::PinMismatch(name) if name == "a_completed"));
}

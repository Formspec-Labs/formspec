//! Shared Rust/JavaScript result qualification and native empty-input regression.
use std::collections::HashMap;

use formspec_eval::{
    evaluate_screener_document, qualify_screener_determination, AnswerInput, AnswerState,
    DeterminationRecord,
};
use serde_json::{json, Value};

#[test]
fn shared_javascript_qualification_cases() {
    let fixtures: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/screener-qualification.json"
    ))
    .unwrap();
    for case in fixtures["cases"].as_array().unwrap() {
        let mut input = fixtures["base"].clone();
        for patch in case["patches"].as_array().unwrap() {
            let (parent, key) = patch["path"].as_str().unwrap().rsplit_once('/').unwrap();
            input
                .pointer_mut(parent)
                .unwrap()
                .as_object_mut()
                .unwrap()
                .insert(key.to_owned(), patch["value"].clone());
        }
        let record: DeterminationRecord =
            serde_json::from_value(input["determination"].clone()).unwrap();
        let answers: HashMap<String, AnswerInput> = input["answers"]
            .as_object()
            .unwrap()
            .iter()
            .map(|(key, value)| {
                let state = input["answerStates"]
                    .get(key)
                    .cloned()
                    .unwrap_or(json!("answered"));
                (
                    key.clone(),
                    AnswerInput {
                        value: value.clone(),
                        state: serde_json::from_value(state).unwrap(),
                    },
                )
            })
            .collect();
        let targets: Vec<String> = serde_json::from_value(input["allowedTargets"].clone()).unwrap();
        let before = serde_json::to_value(&record).unwrap();
        let result = qualify_screener_determination(
            &input["document"],
            &record,
            &answers,
            input["evaluationTime"].as_str().unwrap(),
            input["nowIso"].as_str().unwrap(),
            &targets,
        );
        assert_eq!(
            serde_json::to_value(result).unwrap(),
            case["expected"],
            "{}",
            case["id"]
        );
        assert_eq!(serde_json::to_value(&record).unwrap(), before);
    }
}

#[test]
fn actual_native_completed_without_answers_does_not_authorize_navigation() {
    let fixtures: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/screener-qualification.json"
    ))
    .unwrap();
    let document = &fixtures["base"]["document"];
    let time = "2026-10-09T12:00:00Z";
    let allowed = vec!["surface:apply".to_owned(), "surface:paper".to_owned()];
    let empty = HashMap::new();
    let record = evaluate_screener_document(document, &empty, Some(time), None);
    assert_eq!(record.status, "completed");
    assert_eq!(
        serde_json::to_value(qualify_screener_determination(
            document, &record, &empty, time, time, &allowed
        ))
        .unwrap(),
        json!({"status":"refused","reason":"determination-input-coverage"})
    );
    for (value, target) in [(true, "surface:apply"), (false, "surface:paper")] {
        let answers = HashMap::from([(
            "eligible".to_owned(),
            AnswerInput {
                value: json!(value),
                state: AnswerState::Answered,
            },
        )]);
        let record = evaluate_screener_document(document, &answers, Some(time), None);
        let wire = serde_json::to_value(&record).unwrap();
        let reopened: DeterminationRecord = serde_json::from_value(wire.clone()).unwrap();
        assert_eq!(serde_json::to_value(&reopened).unwrap(), wire);
        assert_eq!(
            serde_json::to_value(qualify_screener_determination(
                document, &reopened, &answers, time, time, &allowed
            ))
            .unwrap(),
            json!({"status":"ready","target":target})
        );
    }
}

#[test]
fn retained_record_decoder_refuses_unknown_invalid_and_missing_fields() {
    let fixtures: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/screener-qualification.json"
    ))
    .unwrap();
    let base = &fixtures["base"]["determination"];
    for pointer in [
        "",
        "/screener",
        "/overrides",
        "/phases/0",
        "/phases/0/matched/0",
        "/inputs/eligible",
    ] {
        let mut wire = base.clone();
        wire.pointer_mut(pointer)
            .unwrap()
            .as_object_mut()
            .unwrap()
            .insert("unknown".into(), json!(true));
        assert!(
            serde_json::from_value::<DeterminationRecord>(wire).is_err(),
            "{pointer}"
        );
    }
    let mut validity = base.clone();
    validity["validity"] =
        json!({"validUntil":"2026-10-09T13:00:00Z","resultValidity":"PT1H","unknown":true});
    assert!(serde_json::from_value::<DeterminationRecord>(validity).is_err());
    for pointer in ["/status", "/phases/0/status", "/inputs/eligible/state"] {
        let mut wire = base.clone();
        *wire.pointer_mut(pointer).unwrap() = json!("unknown");
        assert!(
            serde_json::from_value::<DeterminationRecord>(wire).is_err(),
            "{pointer}"
        );
    }
    for key in [
        "inputs",
        "timestamp",
        "overrides",
        "phases",
        "screener",
        "status",
    ] {
        let mut wire = base.clone();
        wire.as_object_mut().unwrap().remove(key);
        assert!(
            serde_json::from_value::<DeterminationRecord>(wire).is_err(),
            "{key}"
        );
    }
    let mut extended = base.clone();
    extended["extensions"] = json!({"host":{"unknown":"preserved"}});
    extended["phases"][0]["matched"][0]["metadata"] = json!({"arbitrary":[1,false,"yes"]});
    let reopened: DeterminationRecord = serde_json::from_value(extended.clone()).unwrap();
    assert_eq!(serde_json::to_value(reopened).unwrap(), extended);
}

#[test]
fn startup_admission_reuses_supported_profile_without_evaluation() {
    use formspec_eval::admit_screener_qualification_profile;
    let fixtures: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/screener-qualification.json"
    ))
    .unwrap();
    let document = &fixtures["base"]["document"];
    assert!(admit_screener_qualification_profile(document).is_ok());
    for (pointer, value, reason) in [
        ("/items/0/dataType", json!("money"), "item-unsupported"),
        ("/binds/0/required", json!("$other"), "bind-unsupported"),
        (
            "/evaluation/0/strategy",
            json!("future"),
            "determination-diagnostics",
        ),
    ] {
        let mut candidate = document.clone();
        *candidate.pointer_mut(pointer).unwrap() = value;
        assert_eq!(
            serde_json::to_value(admit_screener_qualification_profile(&candidate).unwrap_err())
                .unwrap(),
            json!(reason)
        );
    }
}

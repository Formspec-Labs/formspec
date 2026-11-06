//! Shared Rust/JavaScript result qualification and native empty-input regression.
use std::collections::HashMap;

use fel_core::exact_json::{Value, native_json as json};
use formspec_eval::{
    AnswerInput, AnswerState, DeterminationRecord, evaluate_screener_document,
    qualify_screener_determination,
};

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
            fel_core::exact_json::from_value(input["determination"].clone()).unwrap();
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
                        state: fel_core::exact_json::from_value(state).unwrap(),
                    },
                )
            })
            .collect();
        let targets: Vec<String> =
            fel_core::exact_json::from_value(input["allowedTargets"].clone()).unwrap();
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
    let record = evaluate_screener_document(document, &empty, Some(time), None).unwrap();
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
        let record = evaluate_screener_document(document, &answers, Some(time), None).unwrap();
        let wire = serde_json::to_value(&record).unwrap();
        let reopened: DeterminationRecord = fel_core::exact_json::from_value(wire.clone()).unwrap();
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
            fel_core::exact_json::from_value::<DeterminationRecord>(wire).is_err(),
            "{pointer}"
        );
    }
    let mut validity = base.clone();
    validity["validity"] =
        json!({"validUntil":"2026-10-09T13:00:00Z","resultValidity":"PT1H","unknown":true});
    assert!(fel_core::exact_json::from_value::<DeterminationRecord>(validity).is_err());
    for pointer in ["/status", "/phases/0/status", "/inputs/eligible/state"] {
        let mut wire = base.clone();
        *wire.pointer_mut(pointer).unwrap() = json!("unknown");
        assert!(
            fel_core::exact_json::from_value::<DeterminationRecord>(wire).is_err(),
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
            fel_core::exact_json::from_value::<DeterminationRecord>(wire).is_err(),
            "{key}"
        );
    }
    let mut extended = base.clone();
    extended["extensions"] = json!({"host":{"unknown":"preserved"}});
    extended["phases"][0]["matched"][0]["metadata"] = json!({"arbitrary":[1,false,"yes"]});
    let reopened: DeterminationRecord = fel_core::exact_json::from_value(extended.clone()).unwrap();
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

#[test]
fn canonical_bind_generation_metadata_is_inert() {
    use formspec_eval::admit_screener_qualification_profile;
    let fixtures: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/screener-qualification.json"
    ))
    .unwrap();
    let baseline = &fixtures["base"]["document"];
    let mut annotated = baseline.clone();
    annotated["binds"][0]["x-generation"] = json!({"anchors": ["need:gate@1"]});
    let before = serde_json::to_vec(&annotated).unwrap();
    assert_eq!(admit_screener_qualification_profile(&annotated), Ok(()));
    assert_eq!(serde_json::to_vec(&annotated).unwrap(), before);

    let time = "2026-10-09T12:00:00Z";
    let targets = vec!["surface:apply".to_owned(), "surface:paper".to_owned()];
    for (answer, target) in [(true, "surface:apply"), (false, "surface:paper")] {
        let answers = HashMap::from([(
            "eligible".to_owned(),
            AnswerInput {
                value: json!(answer),
                state: AnswerState::Answered,
            },
        )]);
        let record = evaluate_screener_document(&annotated, &answers, Some(time), None).unwrap();
        let original = evaluate_screener_document(baseline, &answers, Some(time), None).unwrap();
        let record_before = serde_json::to_vec(&record).unwrap();
        assert_eq!(record_before, serde_json::to_vec(&original).unwrap());
        assert_eq!(
            serde_json::to_value(qualify_screener_determination(
                &annotated, &record, &answers, time, time, &targets,
            ))
            .unwrap(),
            json!({"status": "ready", "target": target})
        );
        assert_eq!(serde_json::to_vec(&record).unwrap(), record_before);
        assert_eq!(serde_json::to_vec(&annotated).unwrap(), before);
    }
}

#[test]
fn annotated_binds_preserve_bounded_semantic_refusals() {
    use formspec_eval::{ScreenerQualificationRefusal, admit_screener_qualification_profile};
    let fixtures: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/screener-qualification.json"
    ))
    .unwrap();
    let mut document = fixtures["base"]["document"].clone();
    document["binds"][0]["x-generation"] = json!({"anchors": ["need:gate@1"]});
    for (key, value) in [
        ("required", json!("$other")),
        ("required", json!(true)),
        ("readonly", json!("true")),
        ("calculate", json!("true")),
        ("unknown", json!(true)),
        ("x-other", json!({})),
        ("path", json!("foreign")),
    ] {
        let mut candidate = document.clone();
        candidate["binds"][0][key] = value;
        let before = serde_json::to_vec(&candidate).unwrap();
        assert_eq!(
            admit_screener_qualification_profile(&candidate),
            Err(ScreenerQualificationRefusal::BindUnsupported),
            "{key}"
        );
        assert_eq!(serde_json::to_vec(&candidate).unwrap(), before);
    }
    let bind = document["binds"][0].clone();
    document["binds"].as_array_mut().unwrap().push(bind);
    assert_eq!(
        admit_screener_qualification_profile(&document),
        Err(ScreenerQualificationRefusal::BindUnsupported)
    );
}

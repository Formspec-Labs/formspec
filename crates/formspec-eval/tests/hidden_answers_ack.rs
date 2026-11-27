//! Integration tests for hidden-answer grouped acknowledgement at Submit (`fs-2cbq`, ADR 0173).

use std::collections::{BTreeMap, HashMap};

use fel_core::exact_json::{Value, native_json as json};
use formspec_eval::explanations::{
    HIDDEN_ANSWERS_CODE, HIDDEN_ANSWERS_SHAPE_ID, group_basis, hidden_answer_findings,
};
use formspec_eval::types::{ConstraintKind, Severity};
use formspec_eval::{
    EvalContext, EvalOptions, EvalTrigger, assemble_candidate, evaluate, evaluate_filed,
};

fn sample_definition() -> Value {
    json!({
        "$formspec": "1.0",
        "url": "https://example.org/forms/hidden-answers-ack",
        "version": "1.0.0",
        "title": "Hidden Answers Acknowledgement",
        "nonRelevantBehavior": "remove",
        "items": [
            { "key": "showDetails", "type": "field", "dataType": "boolean" },
            { "key": "banner", "type": "display", "label": "Section header" },
            { "key": "detailNote", "type": "field", "dataType": "string" },
            { "key": "detailCount", "type": "field", "dataType": "integer" },
            { "key": "detailFlag", "type": "field", "dataType": "boolean" },
            { "key": "detailCalculated", "type": "field", "dataType": "integer" },
            { "key": "keptNote", "type": "field", "dataType": "string" },
            { "key": "emptiedNote", "type": "field", "dataType": "string" }
        ],
        "binds": [
            { "path": "banner", "relevant": "$showDetails = true" },
            { "path": "detailNote", "relevant": "$showDetails = true" },
            { "path": "detailCount", "relevant": "$showDetails = true" },
            { "path": "detailFlag", "relevant": "$showDetails = true" },
            { "path": "detailCalculated", "relevant": "$showDetails = true", "calculate": "10 + 5" },
            { "path": "keptNote", "relevant": "$showDetails = true", "nonRelevantBehavior": "keep" },
            { "path": "emptiedNote", "relevant": "$showDetails = true", "nonRelevantBehavior": "empty" }
        ]
    })
}

fn stamped_hidden_ack(paths: &[&str], basis: &str) -> Value {
    json!({
        "code": HIDDEN_ANSWERS_CODE,
        "group": true,
        "paths": paths,
        "basis": basis,
        "author": { "id": "filer-1", "name": "Alex Filer" },
        "recorded": "2026-11-27T12:00:00Z"
    })
}

#[test]
fn submit_requires_one_grouped_acknowledgement_for_removed_held_answers_excluding_calculated_and_empty() {
    let def = sample_definition();
    let data = HashMap::from([
        ("showDetails".into(), json!(false)),
        ("detailNote".into(), json!("earlier text")),
        ("detailCount".into(), json!(0)),
        ("detailFlag".into(), json!(false)),
        ("keptNote".into(), json!("kept under keep")),
        ("emptiedNote".into(), json!("nulled under empty")),
    ]);

    // Continuous evaluation exposes held paths without blocking edits.
    let live = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(
        live.held_non_relevant_values.keys().cloned().collect::<Vec<_>>(),
        vec!["detailCount", "detailFlag", "detailNote"]
    );
    assert!(
        !live
            .validations
            .iter()
            .any(|v| v.constraint_kind == ConstraintKind::Explanation),
        "live evaluation must not emit submit explanation errors"
    );

    // Submit without acknowledgement refuses with EXPLANATION_REQUIRED and still omits held values from data.
    let unacked = evaluate_filed(&def, &data, &EvalOptions::default()).expect("settles");
    assert_eq!(
        unacked.held_non_relevant_values.keys().cloned().collect::<Vec<_>>(),
        vec!["detailCount", "detailFlag", "detailNote"]
    );
    assert!(unacked.data.get("detailNote").is_none());
    assert!(unacked.data.get("detailCount").is_none());
    assert!(unacked.data.get("detailFlag").is_none());
    assert!(unacked.data.get("detailCalculated").is_none());
    assert_eq!(unacked.data.get("keptNote"), Some(&json!("kept under keep")));
    assert_eq!(unacked.data.get("emptiedNote"), Some(&Value::Null));

    let explanation_errors: Vec<_> = unacked
        .validations
        .iter()
        .filter(|v| v.constraint_kind == ConstraintKind::Explanation && v.severity == Severity::Error)
        .collect();
    assert_eq!(explanation_errors.len(), 1);
    assert_eq!(explanation_errors[0].path, "#");
    assert_eq!(explanation_errors[0].code.as_wire_str(), "EXPLANATION_REQUIRED");
    assert_eq!(
        explanation_errors[0]
            .context
            .as_ref()
            .and_then(|c| c.get("code")),
        Some(&json!(HIDDEN_ANSWERS_CODE))
    );

    // Verify basis matches shared helper and one grouped acknowledgement satisfies Submit.
    let expected_findings =
        hidden_answer_findings(&unacked.held_non_relevant_values).expect("findings");
    assert_eq!(expected_findings.len(), 3);
    assert!(expected_findings.iter().all(|f| f.shape_id == HIDDEN_ANSWERS_SHAPE_ID));
    let basis = group_basis(HIDDEN_ANSWERS_CODE, &expected_findings).expect("group basis");
    assert_eq!(unacked.explanation_actions.len(), 3);
    assert_eq!(
        unacked.explanation_actions[0]["groupBasis"].as_str(),
        Some(basis.as_str())
    );

    let ack = stamped_hidden_ack(&["detailCount", "detailFlag", "detailNote"], &basis);
    let acked = evaluate_filed(
        &def,
        &data,
        &EvalOptions::new().context(EvalContext {
            explanations: vec![ack.clone()],
            ..Default::default()
        }),
    )
    .expect("settles");
    assert!(
        !acked.validations.iter().any(|v| v.severity == Severity::Error),
        "acknowledged hidden answers must pass Submit: {:?}",
        acked.validations
    );
    assert!(acked.data.get("detailNote").is_none());
    assert_eq!(acked.candidate_explanations, Some(vec![ack.clone()]));

    // assemble_candidate preserves the grouped acknowledgement while omitting held values.
    let base_response = json!({
        "$formspecResponse": "1.0",
        "definitionUrl": "https://example.org/forms/hidden-answers-ack",
        "definitionVersion": "1.0.0",
        "status": "completed",
        "authored": "2026-11-27T12:00:00Z",
        "data": acked.data,
        "explanations": [ack.clone()]
    });
    let eval_json = json!({ "candidateExplanations": acked.candidate_explanations });
    let assembled =
        assemble_candidate(&def, base_response, &eval_json, &BTreeMap::new()).expect("assembles");
    assert!(assembled["data"].get("detailNote").is_none());
    assert_eq!(assembled["explanations"], json!([ack]));
}

#[test]
fn changing_held_answer_value_or_set_invalidates_acknowledgement_as_stale() {
    let def = sample_definition();
    let initial_data = HashMap::from([
        ("showDetails".into(), json!(false)),
        ("detailNote".into(), json!("first")),
    ]);
    let initial = evaluate_filed(&def, &initial_data, &EvalOptions::default()).expect("settles");
    let basis = initial.explanation_actions[0]["groupBasis"]
        .as_str()
        .expect("basis")
        .to_owned();
    let ack = stamped_hidden_ack(&["detailNote"], &basis);

    // Changing the held value invalidates the basis.
    let edited_value = HashMap::from([
        ("showDetails".into(), json!(false)),
        ("detailNote".into(), json!("second")),
    ]);
    let stale_val = evaluate_filed(
        &def,
        &edited_value,
        &EvalOptions::new().context(EvalContext {
            explanations: vec![ack.clone()],
            ..Default::default()
        }),
    )
    .expect("settles");
    assert!(stale_val.validations.iter().any(|v| {
        v.constraint_kind == ConstraintKind::Explanation
            && v.code.as_wire_str() == "EXPLANATION_STALE"
            && v.context.as_ref().and_then(|c| c.get("code")) == Some(&json!(HIDDEN_ANSWERS_CODE))
    }));

    // Adding a second held path invalidates the acknowledgement.
    let added_path = HashMap::from([
        ("showDetails".into(), json!(false)),
        ("detailNote".into(), json!("first")),
        ("detailCount".into(), json!(7)),
    ]);
    let stale_set = evaluate_filed(
        &def,
        &added_path,
        &EvalOptions::new().context(EvalContext {
            explanations: vec![ack],
            ..Default::default()
        }),
    )
    .expect("settles");
    assert!(stale_set.validations.iter().any(|v| {
        v.constraint_kind == ConstraintKind::Explanation
            && v.code.as_wire_str() == "EXPLANATION_STALE"
            && v.context.as_ref().and_then(|c| c.get("code")) == Some(&json!(HIDDEN_ANSWERS_CODE))
    }));
}

#[test]
fn cascading_nrb_removals_accumulate_all_removed_paths_in_evaluate_filed() {
    let def = json!({
        "$formspec": "1.0",
        "url": "https://example.org/forms/cascade-hidden",
        "version": "1.0.0",
        "title": "Cascade Hidden",
        "nonRelevantBehavior": "remove",
        "items": [
            { "key": "x", "type": "field", "dataType": "integer" },
            { "key": "y", "type": "field", "dataType": "integer" },
            { "key": "z", "type": "field", "dataType": "integer" }
        ],
        "binds": [
            { "path": "x", "relevant": "false" },
            { "path": "y", "relevant": "present($x)" },
            { "path": "z", "relevant": "present($y)" }
        ]
    });
    let data = HashMap::from([
        ("x".into(), json!(5)),
        ("y".into(), json!(6)),
        ("z".into(), json!(7)),
    ]);
    let unacked = evaluate_filed(&def, &data, &EvalOptions::default()).expect("settles");
    assert_eq!(unacked.data, json!({}));
    assert_eq!(
        unacked.held_non_relevant_values.keys().cloned().collect::<Vec<_>>(),
        vec!["x", "y", "z"]
    );
    assert!(unacked.validations.iter().any(|v| {
        v.code.as_wire_str() == "EXPLANATION_REQUIRED"
            && v.context.as_ref().and_then(|c| c.get("code")) == Some(&json!(HIDDEN_ANSWERS_CODE))
    }));

    let basis = unacked.explanation_actions[0]["groupBasis"]
        .as_str()
        .expect("basis")
        .to_owned();
    let ack = stamped_hidden_ack(&["x", "y", "z"], &basis);
    let acked = evaluate_filed(
        &def,
        &data,
        &EvalOptions::new().context(EvalContext {
            explanations: vec![ack],
            ..Default::default()
        }),
    )
    .expect("settles");
    assert_eq!(acked.data, json!({}));
    assert!(!acked.validations.iter().any(|v| v.severity == Severity::Error));
}

#[test]
fn empty_non_relevant_values_do_not_trigger_hidden_answer_acknowledgement() {
    let def = sample_definition();
    let data = HashMap::from([
        ("showDetails".into(), json!(false)),
        ("detailNote".into(), json!("")),
        ("detailCount".into(), Value::Null),
    ]);
    let res = evaluate(
        &def,
        &data,
        &EvalOptions::new().trigger(EvalTrigger::Submit),
    );
    assert!(res.held_non_relevant_values.is_empty());
    assert!(
        !res.validations
            .iter()
            .any(|v| v.constraint_kind == ConstraintKind::Explanation)
    );
}

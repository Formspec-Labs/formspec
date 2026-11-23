//! Filing verdicts for grouped blank answers and an individual value warning.
// Rust guideline compliant 2026-02-21

use std::collections::HashMap;

use formspec_eval::exact_json::Value;
use formspec_eval::types::{Severity, ValidationSource};
use formspec_eval::{EvalOptions, EvalTrigger, evaluate};

const DEFINITION: &str =
    include_str!("../../../tests/conformance/fixtures/explanations/first-slice.definition.json");
const BLANK: &str = "WORKSHOP_NOT_ANSWERED";

#[test]
fn three_blank_shapes_and_one_value_warning_need_two_explanations_at_submit() {
    let definition: Value = serde_json::from_str(DEFINITION).unwrap();
    // Answering one question and clearing another preserves the count but changes the set.
    for (input, blank_paths) in [
        (
            r#"{"partner":"Library","attendance":125}"#,
            ["outcome", "topic", "venue"],
        ),
        (
            r#"{"venue":"Hall","attendance":125}"#,
            ["outcome", "partner", "topic"],
        ),
    ] {
        let data: HashMap<String, Value> = serde_json::from_str(input).unwrap();
        let editing = evaluate(&definition, &data, &EvalOptions::default());
        assert!(editing.validations.is_empty());

        let submit = evaluate(
            &definition,
            &data,
            &EvalOptions::new().trigger(EvalTrigger::Submit),
        );
        assert!(submit.diagnostics.is_empty());
        let warnings: Vec<_> = submit
            .validations
            .iter()
            .filter(|result| result.severity == Severity::Warning)
            .collect();
        let mut blanks: Vec<_> = warnings
            .iter()
            .filter(|result| result.code.as_wire_str() == BLANK)
            .map(|result| result.path.as_str())
            .collect();
        blanks.sort_unstable();
        assert_eq!(blanks, blank_paths);
        assert_eq!(warnings.len(), 4);
        assert!(warnings.iter().any(|result| {
            result.code.as_wire_str() == "HIGH_ATTENDANCE" && result.path == "attendance"
        }));

        let errors: Vec<_> = submit
            .validations
            .iter()
            .filter(|result| result.severity == Severity::Error)
            .collect();
        assert_eq!(
            errors.len(),
            2,
            "expected one group error and one instance error"
        );
        assert!(errors.iter().all(|result| {
            result.code.as_wire_str() == "EXPLANATION_REQUIRED"
                && result.constraint_kind.as_wire_str() == "explanation"
                && result.source == Some(ValidationSource::Shape)
        }));
        assert!(errors.iter().any(|result| {
            result.path == "#"
                && result.shape_id.is_none()
                && result.context.as_ref().is_some_and(|context| {
                    context.len() == 1 && context.get("code").and_then(Value::as_str) == Some(BLANK)
                })
        }));
        assert!(errors.iter().any(|result| {
            result.path == "attendance" && result.shape_id.as_deref() == Some("largeEvent")
        }));
    }
}

#[test]
fn changing_the_blank_set_or_attendance_invalidates_only_its_own_entry() {
    let definition: Value = serde_json::from_str(DEFINITION).unwrap();
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../tests/conformance/fixtures/explanations/first-slice.entries.json"
    ))
    .unwrap();
    let entries = &fixture["entries"];
    let original_group = &entries["originalGroup"];
    let changed_group = &entries["changedGroup"];
    let value_explanation = &entries["valueExplanation"];
    let original = r#"{"partner":"Library","attendance":125}"#;
    let changed_set = r#"{"venue":"Hall","attendance":125}"#;
    let changed_value = r#"{"venue":"Hall","attendance":130}"#;

    let assert_errors = |response_data: &str, saved: &[&Value], expected: &[(&str, &str)]| {
        let data = serde_json::from_str(response_data).unwrap();
        let context = formspec_eval::exact_json::native_json!({ "explanations": saved });
        let options = EvalOptions::new().trigger(EvalTrigger::Submit).context(
            formspec_eval::eval_context_from_json_object(context.as_object().unwrap()).unwrap(),
        );
        let report = evaluate(&definition, &data, &options);
        assert!(report.diagnostics.is_empty());
        let errors: Vec<_> = report
            .validations
            .iter()
            .filter(|finding| finding.severity == Severity::Error)
            .collect();
        assert_eq!(errors.len(), expected.len(), "{errors:?}");
        for &(code, path) in expected {
            assert!(
                errors.iter().any(|finding| {
                    finding.code.as_wire_str() == code
                        && finding.path == path
                        && (path != "#"
                            || finding
                                .context
                                .as_ref()
                                .and_then(|c| c.get("code"))
                                .and_then(Value::as_str)
                                == Some(BLANK))
                }),
                "missing {code} at {path}: {errors:?}"
            );
        }
    };

    assert_errors(
        original,
        &[original_group],
        &[("EXPLANATION_REQUIRED", "attendance")],
    );
    assert_errors(
        original,
        &[value_explanation],
        &[("EXPLANATION_REQUIRED", "#")],
    );
    assert_errors(original, &[original_group, value_explanation], &[]);
    assert_errors(
        changed_set,
        &[original_group, value_explanation],
        &[("EXPLANATION_STALE", "#")],
    );
    assert_errors(changed_set, &[changed_group, value_explanation], &[]);
    assert_errors(
        changed_value,
        &[changed_group, value_explanation],
        &[("EXPLANATION_STALE", "attendance")],
    );
}

#[test]
fn assembly_preserves_saved_order_drops_unused_and_keeps_stale_with_its_error() {
    let def: Value = serde_json::from_str(DEFINITION).unwrap();
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../tests/conformance/fixtures/explanations/first-slice.entries.json"
    ))
    .unwrap();
    let data = serde_json::from_str(r#"{"venue":"Hall","attendance":125}"#).unwrap();
    let entries = &fixture["entries"];
    let mut stale = entries["originalGroup"].clone();
    stale["paths"].as_array_mut().unwrap().reverse();
    let mut unused = entries["valueExplanation"].clone();
    unused["shapeId"] = Value::String("resolvedWarning".into());
    let mut options = EvalOptions::new().trigger(EvalTrigger::Submit);
    options.context.explanations = vec![unused, entries["valueExplanation"].clone(), stale];
    let expected = vec![
        entries["valueExplanation"].clone(),
        entries["originalGroup"].clone(),
    ];
    for _ in 0..2 {
        let result = evaluate(&def, &data, &options);
        assert!(
            result
                .validations
                .iter()
                .any(|v| v.code == "EXPLANATION_STALE")
        );
        options.context.explanations = result.candidate_explanations.unwrap();
        assert_eq!(options.context.explanations, expected);
    }
}

#[test]
fn warning_with_blank_dynamic_instance_or_subject_and_empty_predicate_can_be_answered() {
    let definition: Value = serde_json::from_str(
        r##"{
            "$formspec": "1.0",
            "id": "dynamic-instance",
            "version": "1.0.0",
            "title": "Dynamic",
            "warningExplanation": "explain",
            "subject": {
                "type": "client",
                "keys": {
                    "year": { "type": "string" }
                }
            },
            "items": [
                { "key": "source", "type": "field", "dataType": "string", "label": "Source" },
                { "key": "subjectKey", "type": "field", "dataType": "string", "label": "Subject key" },
                {
                    "key": "rows",
                    "type": "group",
                    "repeatable": true,
                    "children": [
                        { "key": "src", "type": "field", "dataType": "string" }
                    ]
                }
            ],
            "shapes": [
                {
                    "id": "checkDynamicInstance",
                    "target": "source",
                    "severity": "warning",
                    "timing": "submit",
                    "code": "MISSING_SOURCE",
                    "constraint": "present(instance($source))",
                    "message": "Pick a valid source."
                },
                {
                    "id": "checkDynamicSubject",
                    "target": "subjectKey",
                    "severity": "warning",
                    "timing": "submit",
                    "code": "MISSING_SUBJECT_KEY",
                    "constraint": "present(subject($subjectKey))",
                    "message": "Pick a valid subject key."
                },
                {
                    "id": "checkPredicateDynamic",
                    "target": "#",
                    "severity": "warning",
                    "timing": "submit",
                    "code": "EMPTY_ROWS_DYNAMIC",
                    "constraint": "count($rows) > 0 and every($rows, present(instance($.src)))",
                    "message": "Add at least one sourced row."
                }
            ]
        }"##,
    )
    .unwrap();

    let report = evaluate(
        &definition,
        &HashMap::new(),
        &EvalOptions::new().trigger(EvalTrigger::Submit),
    );
    assert!(
        !report
            .validations
            .iter()
            .any(|v| v.code.as_wire_str() == "CONSTRAINT_PARSE_ERROR"),
        "unexpected parse errors: {:?}",
        report.validations
    );
    let required: Vec<_> = report
        .validations
        .iter()
        .filter(|v| v.code.as_wire_str() == "EXPLANATION_REQUIRED")
        .collect();
    assert_eq!(required.len(), 3, "{:?}", report.validations);
    assert_eq!(report.explanation_actions.len(), 3);
}

#[test]
fn equivalent_repeat_and_projection_references_share_exact_basis() {
    let definition: Value = serde_json::from_str(
        r##"{
            "$formspec": "1.0",
            "id": "equivalent-refs",
            "version": "1.0.0",
            "title": "Equivalent references",
            "warningExplanation": "explain",
            "items": [
                {
                    "key": "groups",
                    "type": "group",
                    "repeatable": true,
                    "children": [
                        { "key": "tag", "type": "field", "dataType": "string" },
                        {
                            "key": "subrows",
                            "type": "group",
                            "repeatable": true,
                            "children": [
                                { "key": "amount", "type": "field", "dataType": "number" }
                            ]
                        }
                    ]
                }
            ],
            "shapes": [
                {
                    "id": "bareSubrows",
                    "target": "groups[*]",
                    "severity": "warning",
                    "timing": "submit",
                    "code": "SUBROWS_A",
                    "constraint": "count($subrows) > 99",
                    "message": "A"
                },
                {
                    "id": "currentSubrows",
                    "target": "groups[*]",
                    "severity": "warning",
                    "timing": "submit",
                    "code": "SUBROWS_B",
                    "constraint": "count(@current.subrows) > 99",
                    "message": "B"
                },
                {
                    "id": "prevSubrows",
                    "target": "groups[1]",
                    "severity": "warning",
                    "timing": "submit",
                    "code": "PREV_A",
                    "constraint": "count(prev().subrows) > 99",
                    "message": "Prev A"
                },
                {
                    "id": "indexedSubrows",
                    "target": "groups[1]",
                    "severity": "warning",
                    "timing": "submit",
                    "code": "PREV_B",
                    "constraint": "count($groups[1].subrows[*]) > 99",
                    "message": "Prev B"
                },
                {
                    "id": "nestedRepeatBare",
                    "target": "#",
                    "severity": "warning",
                    "timing": "submit",
                    "code": "NESTED_A",
                    "constraint": "count($groups[*].subrows) > 99",
                    "message": "Nested A"
                },
                {
                    "id": "nestedRepeatWildcard",
                    "target": "#",
                    "severity": "warning",
                    "timing": "submit",
                    "code": "NESTED_B",
                    "constraint": "count($groups[*].subrows[*]) > 99",
                    "message": "Nested B"
                },
                {
                    "id": "projectedIndex",
                    "target": "#",
                    "severity": "warning",
                    "timing": "submit",
                    "code": "PROJ_A",
                    "constraint": "($groups[*].tag)[1] == 'never'",
                    "message": "Proj A"
                },
                {
                    "id": "directIndex",
                    "target": "#",
                    "severity": "warning",
                    "timing": "submit",
                    "code": "PROJ_B",
                    "constraint": "$groups[1].tag == 'never'",
                    "message": "Proj B"
                }
            ]
        }"##,
    )
    .unwrap();

    // Even when outer repeat `groups` has zero rows, nested repeat keys normalize identically.
    let empty_report = evaluate(
        &definition,
        &HashMap::new(),
        &EvalOptions::new().trigger(EvalTrigger::Submit),
    );
    let find_inputs =
        |report: &formspec_eval::types::EvaluationResult, shape_id: &str, path: &str| {
            report
                .explanation_actions
                .iter()
                .find(|row| {
                    row["shapeId"].as_str() == Some(shape_id) && row["path"].as_str() == Some(path)
                })
                .unwrap_or_else(|| {
                    panic!(
                        "missing {shape_id} at {path}; validations={:?}, actions={:?}",
                        report.validations, report.explanation_actions
                    )
                })["inputs"]
                .clone()
        };
    assert_eq!(
        find_inputs(&empty_report, "nestedRepeatBare", "#"),
        find_inputs(&empty_report, "nestedRepeatWildcard", "#")
    );

    let populated: HashMap<String, Value> = serde_json::from_str(
        r#"{
            "groups": [
                { "tag": "alpha", "subrows": [{ "amount": 10 }] },
                { "tag": "beta", "subrows": [] }
            ]
        }"#,
    )
    .unwrap();
    let report = evaluate(
        &definition,
        &populated,
        &EvalOptions::new().trigger(EvalTrigger::Submit),
    );
    assert_eq!(
        find_inputs(&report, "bareSubrows", "groups[0]"),
        find_inputs(&report, "currentSubrows", "groups[0]")
    );
    assert_eq!(
        find_inputs(&report, "prevSubrows", "groups[1]"),
        find_inputs(&report, "indexedSubrows", "groups[1]")
    );
    assert_eq!(
        find_inputs(&report, "nestedRepeatBare", "#"),
        find_inputs(&report, "nestedRepeatWildcard", "#")
    );
    assert_eq!(
        find_inputs(&report, "projectedIndex", "#"),
        find_inputs(&report, "directIndex", "#")
    );
}

#[test]
fn rust_assembly_prunes_unused_and_sorts_paths_with_byte_identical_reassembly() {
    let def: Value = serde_json::from_str(DEFINITION).unwrap();
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../tests/conformance/fixtures/explanations/first-slice.entries.json"
    ))
    .unwrap();
    let entries = &fixture["entries"];
    let mut reversed_group = entries["originalGroup"].clone();
    reversed_group["paths"].as_array_mut().unwrap().reverse();
    let mut unused = entries["valueExplanation"].clone();
    unused["shapeId"] = Value::String("resolvedWarning".into());

    let draft_entries = vec![unused, reversed_group, entries["valueExplanation"].clone()];
    let data: HashMap<String, Value> =
        serde_json::from_str(r#"{"partner":"Library","attendance":125}"#).unwrap();
    let mut options = EvalOptions::new().trigger(EvalTrigger::Submit);
    options.context.explanations = draft_entries.clone();
    let report = evaluate(&def, &data, &options);
    assert!(
        report
            .validations
            .iter()
            .all(|v| v.severity != Severity::Error),
        "{:?}",
        report.validations
    );

    let draft = formspec_eval::exact_json::native_json!({
        "id": "resp-1",
        "definitionUrl": "https://example.org/forms/workshop/1.0.0",
        "definitionVersion": "1.0.0",
        "status": "completed",
        "data": report.data,
        "explanations": draft_entries,
    });
    let eval_payload = formspec_eval::exact_json::native_json!({
        "candidateExplanations": report.candidate_explanations,
    });
    let assembled_once = formspec_eval::assemble_candidate_json(
        DEFINITION,
        &serde_json::to_string(&draft).unwrap(),
        &serde_json::to_string(&eval_payload).unwrap(),
        "{}",
    )
    .unwrap();
    let assembled_twice = formspec_eval::assemble_candidate_json(
        DEFINITION,
        &assembled_once,
        &serde_json::to_string(&eval_payload).unwrap(),
        "{}",
    )
    .unwrap();
    assert_eq!(assembled_once, assembled_twice);

    let parsed: Value = serde_json::from_str(&assembled_once).unwrap();
    let expected = formspec_eval::exact_json::native_json!([
        entries["originalGroup"],
        entries["valueExplanation"],
    ]);
    assert_eq!(parsed["explanations"], expected);
}

fn evaluate_review_probe(
    constraint: &str,
    prior_instance: Value,
) -> (
    formspec_eval::types::EvaluationResult,
    formspec_eval::exact_json::Value,
) {
    let definition = formspec_eval::exact_json::native_json!({
        "$formspec": "1.0",
        "url": "urn:review:reads",
        "version": "1.0.0",
        "title": "Review",
        "warningExplanation": "confirm",
        "items": [
            {
                "type": "group",
                "key": "rows",
                "repeatable": true,
                "children": [{ "type": "field", "key": "src", "dataType": "string" }]
            },
            { "type": "field", "key": "selection", "dataType": "string" }
        ],
        "shapes": [{
            "id": "warn",
            "target": "#",
            "severity": "warning",
            "timing": "submit",
            "constraint": constraint,
            "message": "Review"
        }],
        "instances": { "prior": { "data": prior_instance } }
    });
    let data: HashMap<String, Value> =
        serde_json::from_str(r#"{"rows":[{"src":"prior"}],"selection":"x"}"#).unwrap();
    let mut instances = HashMap::new();
    instances.insert("prior".to_owned(), prior_instance);
    let options = EvalOptions::new()
        .trigger(EvalTrigger::Submit)
        .instances(instances);
    let report = evaluate(&definition, &data, &options);
    let error_codes: Vec<_> = report
        .validations
        .iter()
        .filter(|v| v.severity == Severity::Error)
        .map(|v| v.code.as_wire_str().into_owned())
        .collect();
    assert_eq!(
        error_codes,
        vec!["EXPLANATION_REQUIRED".to_owned()],
        "validations={:?}",
        report.validations
    );
    let action = report.explanation_actions[0].clone();
    (report, action)
}

#[test]
fn parenthesized_predicate_element_binds_and_invalidates_warning_basis() {
    let (_, direct_one) = evaluate_review_probe(
        "every($rows, instance($.src).v > 9)",
        serde_json::from_str(r#"{"v":1}"#).unwrap(),
    );
    let (_, paren_one) = evaluate_review_probe(
        "every($rows, instance(($).src).v > 9)",
        serde_json::from_str(r#"{"v":1}"#).unwrap(),
    );
    let (_, paren_two) = evaluate_review_probe(
        "every($rows, instance(($).src).v > 9)",
        serde_json::from_str(r#"{"v":2}"#).unwrap(),
    );
    assert_eq!(direct_one["inputs"], paren_one["inputs"]);
    assert_ne!(paren_one["basis"], paren_two["basis"]);
}

#[test]
fn keyed_row_lookup_on_instance_retains_collection_source_read() {
    let expr = "instance('prior').rows[id = $selection].label == 'future'";
    let (_, first) = evaluate_review_probe(
        expr,
        serde_json::from_str(r#"{"rows":[{"id":"x","label":"current","count":1}]}"#).unwrap(),
    );
    let (_, second) = evaluate_review_probe(
        expr,
        serde_json::from_str(r#"{"rows":[{"id":"x","label":"current","count":2}]}"#).unwrap(),
    );
    assert!(
        first["inputs"]
            .as_object()
            .unwrap()
            .contains_key("@instance(\"prior\").rows"),
        "inputs={:?}",
        first["inputs"]
    );
    assert_ne!(first["basis"], second["basis"]);
}

#[test]
fn one_based_index_zero_preserves_warning_action_and_out_of_bounds_diagnostic() {
    let (_, short_circuit_action) = evaluate_review_probe(
        "false and present($rows[0].src)",
        Value::Object(Default::default()),
    );
    assert_eq!(short_circuit_action["shapeId"].as_str(), Some("warn"));

    let (report, evaluated_action) = evaluate_review_probe(
        "present($rows[0].src) and false",
        Value::Object(Default::default()),
    );
    assert_eq!(evaluated_action["shapeId"].as_str(), Some("warn"));
    assert!(
        report
            .validations
            .iter()
            .all(|v| v.code.as_wire_str() != "SYNTAX_ERROR"
                && v.code.as_wire_str() != "CONSTRAINT_PARSE_ERROR"),
        "validations={:?}",
        report.validations
    );
}

#[test]
fn rust_assembly_refuses_response_explanations_without_settled_selection() {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../tests/conformance/fixtures/explanations/first-slice.entries.json"
    ))
    .unwrap();
    let mut retired = fixture["entries"]["valueExplanation"].clone();
    retired["shapeId"] = Value::String("retired".into());
    let draft = serde_json::to_string(&formspec_eval::exact_json::native_json!({
        "data": { "partner": "Library", "attendance": 125 },
        "explanations": [retired],
    }))
    .unwrap();
    for eval_json in ["null", "{}", r#"{"candidateExplanations":null}"#] {
        let err = formspec_eval::assemble_candidate_json(DEFINITION, &draft, eval_json, "{}")
            .expect_err(
                "missing candidateExplanations must be refused when response has explanations",
            );
        assert!(
            err.contains("candidateExplanations"),
            "unexpected error for {eval_json}: {err:?}"
        );
    }
}

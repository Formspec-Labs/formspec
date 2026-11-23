//! What `valid()` and the other MIP queries read (Core §3.5.9, §3.6.1), fs-4jfg.

use fel_core::exact_json::{Value, native_json as json};
use formspec_eval::{
    EvalOptions, EvalTrigger, EvaluationResult, HostFelContext, ItemTextRequest, evaluate,
};
use std::collections::HashMap;

fn submit() -> EvalOptions<'static> {
    EvalOptions::new().trigger(EvalTrigger::Submit)
}

fn input(value: Value) -> HashMap<String, Value> {
    value
        .as_object()
        .expect("object")
        .clone()
        .into_iter()
        .collect()
}

fn refusals(result: &EvaluationResult) -> Vec<(String, String)> {
    assert!(
        result.refused,
        "expected a refusal: {:?}",
        result.validations
    );
    result
        .validations
        .iter()
        .map(|finding| {
            (
                finding.path.clone(),
                finding.code.as_wire_str().into_owned(),
            )
        })
        .collect()
}

fn refusal(path: &str, code: &str) -> Vec<(String, String)> {
    vec![(path.to_owned(), code.to_owned())]
}

#[test]
fn valid_mip_query_reflects_current_validation_state() {
    let def = json!({
        "$formspec": "1.0",
        "url": "test",
        "version": "1.0.0",
        "title": "T",
        "items": [
            { "key": "email", "type": "field", "dataType": "string", "label": "Email" },
            { "key": "status", "type": "field", "dataType": "string", "label": "Status" }
        ],
        "binds": [
            { "path": "email", "required": true },
            { "path": "status", "calculate": "if valid($email) then 'ok' else 'missing'" }
        ]
    });

    let result = evaluate(&def, &HashMap::new(), &EvalOptions::default());
    assert_eq!(result.values.get("status"), Some(&json!("missing")));
}

type SettledAnswer = (Vec<(String, String)>, Vec<String>);

fn integer_fields(keys: &[&str]) -> Value {
    Value::Array(
        keys.iter()
            .map(|key| json!({"key": *key, "type": "field", "dataType": "integer"}))
            .collect(),
    )
}

fn expect(findings: &[(&str, &str)], non_relevant: &[&str]) -> SettledAnswer {
    (
        findings
            .iter()
            .map(|(path, code)| ((*path).to_owned(), (*code).to_owned()))
            .collect(),
        non_relevant.iter().map(|path| (*path).to_owned()).collect(),
    )
}

/// FEL `$path` for a concrete Item path: repeat indexes are 0-based in paths, 1-based in FEL.
fn fel_reference(path: &str) -> String {
    let mut reference = String::from("$");
    let mut digits = String::new();
    let mut in_index = false;
    for character in path.chars() {
        match character {
            '[' => {
                in_index = true;
                reference.push('[');
            }
            ']' => {
                let index: usize = digits.parse().expect("row index");
                reference.push_str(&(index + 1).to_string());
                reference.push(']');
                digits.clear();
                in_index = false;
            }
            digit if in_index => digits.push(digit),
            other => reference.push(other),
        }
    }
    reference
}

/// Sorted findings and non-relevant paths of a submit evaluation, after checking that the host
/// context (component `when`, Locale text) reads every Item's validity as the evaluation does.
fn settled_answer(def: &Value, data: &[(&str, Value)]) -> SettledAnswer {
    let data: HashMap<_, _> = data
        .iter()
        .map(|(path, value)| ((*path).to_owned(), value.clone()))
        .collect();
    let options = submit();
    let result = evaluate(def, &data, &options);
    let host = HostFelContext::from_evaluation(def, &result, &options);
    for path in result.required.keys() {
        let read = host
            .evaluate(
                &format!("valid({})", fel_reference(path)),
                "",
                false,
                None,
                None,
            )
            .unwrap();
        assert_eq!(
            read.value,
            fel_core::Value::Boolean(!result.invalid_paths.contains(path)),
            "host valid() of {path}"
        );
    }
    let mut findings: Vec<_> = result
        .validations
        .iter()
        .map(|finding| {
            (
                finding.path.clone(),
                finding.code.as_wire_str().into_owned(),
            )
        })
        .collect();
    findings.sort();
    let mut non_relevant = result.non_relevant.clone();
    non_relevant.sort();
    (findings, non_relevant)
}

#[test]
fn relevance_reads_validity_through_a_variable() {
    let definition = json!({
        "items": integer_fields(&["gate", "answer"]),
        "variables": [{"name": "gateOk", "expression": "valid($gate)"}],
        "binds": [
            {"path": "gate", "required": true},
            {"path": "answer", "required": true, "relevant": "@gateOk"}
        ]
    });
    assert_eq!(
        settled_answer(&definition, &[]),
        expect(&[("gate", "REQUIRED")], &["answer"])
    );
    assert_eq!(
        settled_answer(&definition, &[("gate", json!(1))]),
        expect(&[("answer", "REQUIRED")], &[])
    );
}

/// Core §2.5.4: a non-relevant field produces no findings, including when its
/// relevance reads `valid()` of a field this evaluation finds invalid (fs-4jfg).
#[test]
fn valid_gated_relevance_hides_the_required_finding() {
    let def = json!({"items": integer_fields(&["gate", "answer"]), "binds": [
        {"path": "gate", "required": true},
        {"path": "answer", "required": true, "relevant": "valid($gate)"}
    ]});
    assert_eq!(
        settled_answer(&def, &[]),
        expect(&[("gate", "REQUIRED")], &["answer"])
    );
    // A valid gate shows the blank answer again, and its REQUIRED returns.
    assert_eq!(
        settled_answer(&def, &[("gate", json!(1))]),
        expect(&[("answer", "REQUIRED")], &[])
    );
}

/// `x` is relevant while `y` is valid; `y` is required while `w` is invalid.
/// Validity settles only after a third pass, so the evaluator must not stop at two.
#[test]
fn validity_that_settles_late_still_hides_required() {
    let def = json!({"items": integer_fields(&["w", "y", "x"]), "binds": [
        {"path": "w", "required": true},
        {"path": "y", "required": "not(valid($w))"},
        {"path": "x", "required": true, "relevant": "valid($y)"}
    ]});
    assert_eq!(
        settled_answer(&def, &[]),
        expect(&[("w", "REQUIRED"), ("y", "REQUIRED")], &["x"])
    );
    assert_eq!(
        settled_answer(&def, &[("y", json!(1))]),
        expect(&[("w", "REQUIRED"), ("x", "REQUIRED")], &[])
    );
}

/// The same late settling hides constraint and Shape findings on the hidden field.
#[test]
fn validity_that_settles_late_still_hides_constraint_and_shape() {
    let def = json!({"items": integer_fields(&["w", "y", "x"]), "binds": [
        {"path": "w", "required": true},
        {"path": "y", "required": "not(valid($w))"},
        {"path": "x", "constraint": "$ > 10", "relevant": "valid($y)"}
    ], "shapes": [
        {"id": "xShape", "target": "x", "constraint": "$ > 20", "message": "x must exceed 20"}
    ]});
    assert_eq!(
        settled_answer(&def, &[("x", json!(1))]),
        expect(&[("w", "REQUIRED"), ("y", "REQUIRED")], &["x"])
    );
    assert_eq!(
        settled_answer(&def, &[("y", json!(1)), ("x", json!(1))]),
        expect(
            &[
                ("w", "REQUIRED"),
                ("x", "CONSTRAINT_FAILED"),
                ("x", "SHAPE_FAILED")
            ],
            &[]
        )
    );
}

/// A field hidden by `valid()` has no findings, so it reads as valid to the next
/// field in the chain (Core §3.5.9: `true` if it has no error-severity results).
#[test]
fn a_field_hidden_by_validity_reads_as_valid_downstream() {
    let def = json!({"items": integer_fields(&["a", "b", "c"]), "binds": [
        {"path": "a", "required": true},
        {"path": "b", "required": true, "relevant": "valid($a)"},
        {"path": "c", "required": true, "relevant": "valid($b)"}
    ]});
    assert_eq!(
        settled_answer(&def, &[]),
        expect(&[("a", "REQUIRED"), ("c", "REQUIRED")], &["b"])
    );
    assert_eq!(
        settled_answer(&def, &[("a", json!(1))]),
        expect(&[("b", "REQUIRED")], &["c"])
    );
}

/// A Shape's `valid()` reads this evaluation's findings (Core §3.5.9), so a server
/// recheck with no editing history reports what the browser reports.
#[test]
fn shape_reading_valid_sees_this_evaluations_findings() {
    let def = json!({"items": integer_fields(&["w", "z"]), "binds": [
        {"path": "w", "required": true}
    ], "shapes": [
        {"id": "wFirst", "target": "z", "constraint": "valid($w)", "message": "Fix w first"}
    ]});
    assert_eq!(
        settled_answer(&def, &[("z", json!(1))]),
        expect(&[("w", "REQUIRED"), ("z", "SHAPE_FAILED")], &[])
    );
    assert_eq!(
        settled_answer(&def, &[("w", json!(1)), ("z", json!(1))]),
        expect(&[], &[])
    );
}

fn rows_with(binds: Value, shapes: Value) -> Value {
    json!({"items": [{"key": "rows", "type": "group", "repeatable": true, "children": [
        {"key": "amount", "type": "field", "dataType": "integer"},
        {"key": "note", "type": "field", "dataType": "string"},
        {"key": "flag", "type": "field", "dataType": "boolean"}
    ]}], "variables": [{"name": "total", "expression": "1"}], "binds": binds, "shapes": shapes})
}

/// Core §3.5.9: a MIP query's argument is a `$path` field reference; any other argument is a
/// definition error at the authored expression (§3.10.1), whichever query and site it is in.
#[test]
fn mip_query_arguments_other_than_field_references_are_refused() {
    let data = input(json!({"rows": [{"amount": 1, "note": "n"}]}));
    for function in ["valid", "relevant", "readonly", "required"] {
        for argument in [
            "@current.amount",
            "@current",
            "@total",
            "amount",
            "1",
            "'amount'",
            "coalesce($amount)",
            "prev().amount",
        ] {
            let call = format!("{function}({argument})");
            let calculated = rows_with(
                json!([{"path": "rows[*].flag", "calculate": call}]),
                json!([]),
            );
            assert_eq!(
                refusals(&evaluate(&calculated, &data, &submit())),
                refusal("$.binds[0].calculate", "MIP_ARGUMENT_NOT_FIELD"),
                "{call}"
            );
            let shaped = rows_with(
                json!([]),
                json!([{"id": "s", "target": "rows[*].note", "constraint": call, "message": "m"}]),
            );
            assert_eq!(
                refusals(&evaluate(&shaped, &data, &submit())),
                refusal("$.shapes[0].constraint", "MIP_ARGUMENT_NOT_FIELD"),
                "{call}"
            );
        }
    }
    // Definition text is checked too: a message template is part of the Definition.
    let messaged = rows_with(
        json!([{"path": "rows[*].amount", "constraint": "false",
                "constraintMessage": "{{valid(@current.note)}}"}]),
        json!([]),
    );
    assert_eq!(
        refusals(&evaluate(&messaged, &data, &submit())),
        refusal("$.binds[0].constraintMessage", "MIP_ARGUMENT_NOT_FIELD")
    );
}

/// fs-4jfg review B1: `@current.amount` read the note's own validity, so each pass flipped
/// the Shape's finding and the verdict followed the parity of the item count. Rebuild now
/// refuses the argument, whatever the item count, and names it rather than a cycle.
#[test]
fn a_context_reference_mip_argument_is_refused_whatever_the_item_count() {
    let data = input(json!({"rows": [{"amount": 1, "note": "n"}]}));
    let mut definition = rows_with(
        json!([]),
        json!([{"id": "s", "target": "rows[*].note",
                "constraint": "not(valid(@current.amount))", "message": "m"}]),
    );
    for extra in 0..3 {
        assert_eq!(
            refusals(&evaluate(&definition, &data, &submit())),
            refusal("$.shapes[0].constraint", "MIP_ARGUMENT_NOT_FIELD"),
            "{extra} extra fields"
        );
        definition["items"]
            .as_array_mut()
            .unwrap()
            .push(json!({"key": format!("extra{extra}"), "type": "field", "dataType": "string"}));
    }
    let bind = rows_with(
        json!([{"path": "rows[*].note", "required": true, "relevant": "valid(@current.amount)"}]),
        json!([]),
    );
    assert_eq!(
        refusals(&evaluate(&bind, &input(json!({"rows": [{}]})), &submit())),
        refusal("$.binds[0].relevant", "MIP_ARGUMENT_NOT_FIELD")
    );
}

/// Inside a repeat row `$amount` names that row's field (Core §3.2.2, §3.5.9), the legal
/// "this row" spelling for a MIP query; `$rows[2].amount` names one row from anywhere.
#[test]
fn row_relative_field_references_are_the_this_row_spelling() {
    let def = json!({"items": [
        {"key": "rows", "type": "group", "repeatable": true, "children": [
            {"key": "amount", "type": "field", "dataType": "integer"},
            {"key": "note", "type": "field", "dataType": "string"}
        ]},
        {"key": "secondOk", "type": "field", "dataType": "boolean"}
    ], "binds": [
        {"path": "rows[*].amount", "constraint": "$ > 0"},
        {"path": "rows[*].note", "required": true, "relevant": "valid($amount)"},
        {"path": "secondOk", "calculate": "valid($rows[2].amount)"}
    ]});
    let data = [("rows", json!([{"amount": -1}, {"amount": 5}]))];
    assert_eq!(
        settled_answer(&def, &data),
        expect(
            &[
                ("rows[0].amount", "CONSTRAINT_FAILED"),
                ("rows[1].note", "REQUIRED")
            ],
            &["rows[0].note"]
        )
    );
    let result = evaluate(
        &def,
        &input(json!({"rows": [{"amount": -1}, {"amount": 5}]})),
        &submit(),
    );
    assert_eq!(result.values.get("secondOk"), Some(&json!(true)));
}

/// Core §3.5.9: `valid()` reads Bind and Shape results. An explanation owed on Submit
/// (§5.3.1) blocks filing but does not make the field read as invalid, in a Bind or in the
/// host context that serves component `when` and Locale text.
#[test]
fn an_owed_explanation_does_not_change_what_valid_reads() {
    let def = json!({"$formspec": "1.0", "url": "urn:test:owed", "version": "1.0.0",
        "title": "Owed", "warningExplanation": "confirm",
        "items": [{"key": "income", "type": "field", "dataType": "integer"},
                  {"key": "note", "type": "field", "dataType": "string"}],
        "binds": [{"path": "note", "calculate": "if(valid($income), 'income ok', 'income owed')"}],
        "shapes": [{"id": "high", "target": "income", "severity": "warning", "timing": "submit",
                    "constraint": "$ < 100", "message": "High"}]});
    let options = submit();
    let result = evaluate(&def, &input(json!({"income": 500})), &options);
    assert!(
        result
            .validations
            .iter()
            .any(|finding| finding.code.as_wire_str() == "EXPLANATION_REQUIRED"),
        "{:?}",
        result.validations
    );
    assert_eq!(result.values.get("note"), Some(&json!("income ok")));
    let host = HostFelContext::from_evaluation(&def, &result, &options);
    let read = host
        .evaluate("valid($income)", "note", false, None, None)
        .unwrap();
    assert_eq!(read.value, fel_core::Value::Boolean(true));
}

/// Text that interpolates `valid()` reads the settled findings: a Shape message, a
/// `constraintMessage` and an Item label (fs-4jfg review S4).
#[test]
fn interpolated_text_reads_the_settled_validity() {
    let text = "w is {{if(valid($w), 'ok', 'bad')}}";
    let def = json!({"items": [
        {"key": "w", "type": "field", "dataType": "string"},
        {"key": "z", "type": "field", "dataType": "integer", "label": text},
        {"key": "y", "type": "field", "dataType": "integer"}
    ], "binds": [
        {"path": "w", "required": true},
        {"path": "y", "constraint": "false", "constraintMessage": text}
    ], "shapes": [{"id": "s", "target": "z", "constraint": "false", "message": text}]});
    let data = input(json!({"z": 1, "y": 1}));
    let options = submit().item_text(ItemTextRequest::default());
    let cold = evaluate(&def, &data, &options);
    let texts = |result: &EvaluationResult| {
        let mut texts: Vec<_> = result
            .validations
            .iter()
            .filter(|finding| finding.path != "w")
            .map(|finding| (finding.path.clone(), finding.message.clone()))
            .collect();
        texts.sort();
        let label = result
            .item_text
            .as_ref()
            .and_then(|text| text.get("z"))
            .map(|text| text.label.clone());
        (texts, label)
    };
    let expected = (
        vec![
            ("y".to_owned(), "w is bad".to_owned()),
            ("z".to_owned(), "w is bad".to_owned()),
        ],
        Some("w is bad".to_owned()),
    );
    assert_eq!(texts(&cold), expected);
}

/// Core §3.5.9: `valid($g)` reads the results reported for `g` itself. A failing child does
/// not make its group invalid; a Shape that targets the group does.
#[test]
fn a_group_path_reads_the_results_reported_for_the_group() {
    let def = |shapes: Value| {
        json!({"items": [
        {"key": "g", "type": "group", "children": [
            {"key": "q", "type": "field", "dataType": "integer"}
        ]},
        {"key": "x", "type": "field", "dataType": "integer"}
    ], "binds": [
        {"path": "g.q", "required": true},
        {"path": "x", "required": true, "relevant": "valid($g)"}
    ], "shapes": shapes})
    };
    assert_eq!(
        settled_answer(&def(json!([])), &[]),
        expect(&[("g.q", "REQUIRED"), ("x", "REQUIRED")], &[])
    );
    let group_shape =
        json!([{"id": "gShape", "target": "g", "constraint": "false", "message": "g"}]);
    assert_eq!(
        settled_answer(&def(group_shape), &[]),
        expect(&[("g", "SHAPE_FAILED"), ("g.q", "REQUIRED")], &["x"])
    );
}

#[test]
fn validity_includes_type_and_repeat_cardinality_errors() {
    let definition = json!({
        "items": [
            {"key": "amount", "type": "field", "dataType": "integer"},
            {"key": "rows", "type": "group", "repeatable": true, "minRepeat": 1,
             "children": [{"key": "label", "type": "field", "dataType": "string"}]},
            {"key": "answer", "type": "field", "dataType": "string"}
        ],
        "binds": [{"path": "answer", "required": true, "relevant": "valid($amount) or valid($rows)"}]
    });
    assert_eq!(
        settled_answer(
            &definition,
            &[("amount", json!("abc")), ("rows", json!([]))]
        ),
        expect(
            &[("amount", "TYPE_MISMATCH"), ("rows", "MIN_REPEAT")],
            &["answer"]
        )
    );
}

/// A Shape's `activeWhen` that reads `valid()` takes part in the same settling: `z` fails only
/// while `w` is valid, and `y` is shown only while `z` is valid.
#[test]
fn active_when_reading_valid_settles_with_the_rest() {
    let def = json!({"items": integer_fields(&["w", "z", "y"]), "binds": [
        {"path": "w", "constraint": "$ > 0"},
        {"path": "y", "required": true, "relevant": "valid($z)"}
    ], "shapes": [{"id": "zShape", "target": "z", "activeWhen": "valid($w)",
                   "constraint": "false", "message": "z"}]});
    assert_eq!(
        settled_answer(&def, &[("w", json!(1))]),
        expect(&[("z", "SHAPE_FAILED")], &["y"])
    );
    assert_eq!(
        settled_answer(&def, &[("w", json!(-1))]),
        expect(&[("w", "CONSTRAINT_FAILED"), ("y", "REQUIRED")], &[])
    );
}

//! Core §3.10: Definition errors and evaluation errors.
//!
//! A syntax error or arity mismatch refuses the Definition before Recalculate.
//! A type error yields `null`, and a `null` constraint passes. The error is
//! recorded as an author diagnostic on `EvaluationResult.diagnostics`, never as
//! a `ValidationResult`.

use fel_core::exact_json::{Value, native_json as json};
use formspec_eval::{EvalOptions, evaluate, evaluation_result_to_json_value};
use std::collections::HashMap;

fn definition(binds: Value, shapes: Value) -> Value {
    json!({
        "$formspec": "1.0",
        "url": "test",
        "version": "1.0.0",
        "title": "T",
        "items": [
            { "key": "name", "type": "field", "dataType": "string", "label": "N" },
            {
                "key": "rows",
                "type": "group",
                "label": "Rows",
                "repeatable": true,
                "children": [
                    { "key": "note", "type": "field", "dataType": "string", "label": "Note" }
                ]
            }
        ],
        "binds": binds,
        "shapes": shapes
    })
}

fn data() -> HashMap<String, Value> {
    HashMap::from([
        ("name".to_string(), json!("abc")),
        ("rows[0].note".to_string(), json!("x")),
    ])
}

#[test]
fn bind_constraint_type_error_passes_and_records_diagnostic() {
    let def = definition(
        json!([{ "path": "name", "constraint": "$name + 5 > 0" }]),
        json!([]),
    );
    let result = evaluate(&def, &data(), &EvalOptions::default());

    assert!(
        result.validations.is_empty(),
        "a null constraint passes (§3.8.1); got {:?}",
        result.validations
    );
    assert_eq!(result.diagnostics.len(), 1, "{:?}", result.diagnostics);
    let diagnostic = &result.diagnostics[0];
    assert_eq!(diagnostic.path, "name");
    assert_eq!(diagnostic.expression, "$name + 5 > 0");
    assert_eq!(diagnostic.shape_id, None);
    assert!(!diagnostic.message.is_empty());
}

/// An undefined function is a definition error (§3.10.1), like a syntax error: it
/// fails with the definition-error code, not the data-rule code.
#[test]
fn bind_constraint_undefined_function_fails_and_records_diagnostic() {
    let def = definition(
        json!([{ "path": "name", "constraint": "bogusFunc($name)" }]),
        json!([]),
    );
    let result = evaluate(&def, &data(), &EvalOptions::default());

    let codes: Vec<String> = result
        .validations
        .iter()
        .map(|v| v.code.to_string())
        .collect();
    assert_eq!(
        codes,
        vec!["CONSTRAINT_PARSE_ERROR"],
        "{:?}",
        result.validations
    );
    assert_eq!(result.diagnostics.len(), 1, "{:?}", result.diagnostics);
    assert!(
        result.diagnostics[0].message.contains("bogusFunc"),
        "{:?}",
        result.diagnostics
    );
}

/// Core Phase 3 step 1a: a definition error carries a processor-generated message.
/// The Bind's `constraintMessage` describes a `false` result, so it never labels one.
#[test]
fn bind_constraint_definition_error_ignores_constraint_message() {
    let def = definition(
        json!([{
            "path": "name",
            "constraint": "bogusFunc($name)",
            "constraintMessage": "Name is not allowed"
        }]),
        json!([]),
    );
    let result = evaluate(&def, &data(), &EvalOptions::default());

    assert_eq!(result.validations.len(), 1, "{:?}", result.validations);
    let failure = &result.validations[0];
    assert_eq!(failure.code, "CONSTRAINT_PARSE_ERROR");
    assert!(
        failure.message.starts_with("Constraint expression error: "),
        "{:?}",
        failure.message
    );
}

/// A `false` result keeps the author's `constraintMessage`.
#[test]
fn bind_constraint_false_uses_constraint_message() {
    let def = definition(
        json!([{
            "path": "name",
            "constraint": "$name = 'other'",
            "constraintMessage": "Name is not allowed"
        }]),
        json!([]),
    );
    let result = evaluate(&def, &data(), &EvalOptions::default());

    let messages: Vec<&str> = result
        .validations
        .iter()
        .map(|v| v.message.as_str())
        .collect();
    assert_eq!(messages, vec!["Name is not allowed"]);
}

#[test]
fn shape_undefined_function_fails_in_every_position() {
    let def = definition(
        json!([]),
        json!([
            { "id": "constraintCheck", "target": "name", "constraint": "bogusFunc($name)", "message": "c" },
            { "id": "notCheck", "target": "#", "not": "bogusFunc($name)", "message": "n" },
            { "id": "rowCheck", "target": "rows[*].note", "constraint": "bogusFunc($note)", "message": "r" }
        ]),
    );
    let result = evaluate(&def, &data(), &EvalOptions::default());

    let failed: Vec<(&str, Option<&str>)> = result
        .validations
        .iter()
        .map(|v| (v.path.as_str(), v.shape_id.as_deref()))
        .collect();
    assert_eq!(
        failed,
        vec![
            ("name", Some("constraintCheck")),
            ("#", Some("notCheck")),
            ("rows[0].note", Some("rowCheck")),
        ]
    );
    assert_eq!(result.diagnostics.len(), 3, "{:?}", result.diagnostics);
}

#[test]
fn shape_constraint_type_error_passes_and_records_diagnostic() {
    let def = definition(
        json!([]),
        json!([{
            "id": "nameCheck",
            "target": "name",
            "constraint": "$name + 5 > 0",
            "message": "bad"
        }]),
    );
    let result = evaluate(&def, &data(), &EvalOptions::default());

    assert!(result.validations.is_empty(), "{:?}", result.validations);
    assert_eq!(result.diagnostics.len(), 1, "{:?}", result.diagnostics);
    assert_eq!(result.diagnostics[0].path, "name");
    assert_eq!(result.diagnostics[0].shape_id.as_deref(), Some("nameCheck"));
}

#[test]
fn wildcard_shape_type_error_records_concrete_path() {
    let def = definition(
        json!([]),
        json!([{
            "id": "noteCheck",
            "target": "rows[*].note",
            "constraint": "$note + 5 > 0",
            "message": "bad"
        }]),
    );
    let result = evaluate(&def, &data(), &EvalOptions::default());

    assert!(result.validations.is_empty(), "{:?}", result.validations);
    let paths: Vec<&str> = result.diagnostics.iter().map(|d| d.path.as_str()).collect();
    assert_eq!(paths, vec!["rows[0].note"]);
}

#[test]
fn composition_type_errors_follow_null_semantics() {
    let def = definition(
        json!([]),
        json!([
            { "id": "andCheck", "target": "#", "message": "and", "and": ["$name + 5 > 0"] },
            { "id": "notCheck", "target": "#", "message": "not", "not": "$name + 5 > 0" },
            { "id": "xoneCheck", "target": "#", "message": "xone", "xone": ["$name + 5 > 0", "true"] }
        ]),
    );
    let result = evaluate(&def, &data(), &EvalOptions::default());

    assert!(result.validations.is_empty(), "{:?}", result.validations);
    assert_eq!(result.diagnostics.len(), 3, "{:?}", result.diagnostics);
}

/// Composition folds `null` as Kleene unknown, through shape references too; unknown passes.
#[test]
fn composition_folds_null_as_kleene_unknown() {
    let def = definition(
        json!([]),
        json!([
            { "id": "typeError", "target": "#", "message": "typeError", "constraint": "$name + 5 > 0" },
            { "id": "notTypeError", "target": "#", "message": "notTypeError", "not": "typeError" },
            { "id": "xoneUnknown", "target": "#", "message": "xoneUnknown", "xone": ["$name + 5 > 0", "false"] },
            { "id": "orUnknown", "target": "#", "message": "orUnknown", "or": ["$name + 5 > 0", "false"] },
            { "id": "xoneTwoTrue", "target": "#", "message": "xoneTwoTrue", "xone": ["true", "true", "$name + 5 > 0"] },
            { "id": "andFalse", "target": "#", "message": "andFalse", "and": ["typeError", "false"] }
        ]),
    );
    let result = evaluate(&def, &data(), &EvalOptions::default());

    let failed: Vec<Option<&str>> = result
        .validations
        .iter()
        .map(|v| v.shape_id.as_deref())
        .collect();
    assert_eq!(failed, vec![Some("xoneTwoTrue"), Some("andFalse")]);
}

/// Core §3.10.1: a syntax error in any authored expression refuses the Definition before
/// Recalculate, so a readonly calculate cannot keep a supplied value. Display text
/// interpolation renders a broken expression literally (Core §4.2.1) and refuses nothing.
#[test]
fn syntax_errors_refuse_the_definition_in_every_position() {
    let def = json!({
        "items": [
            { "key": "x", "dataType": "integer", "label": "X {{1 +}}" },
            { "key": "ok", "dataType": "integer", "initialValue": "=2 +" }
        ],
        "binds": [
            { "path": "x", "calculate": "1 +", "readonly": "true", "constraint": "3 +" },
            { "path": "ok", "relevant": "4 +", "default": "=5 +" }
        ],
        "shapes": [{
            "id": "s", "target": "x", "constraint": "6 +", "activeWhen": "7 +",
            "context": { "seen": "8 +" }, "message": "m"
        }],
        "variables": [{ "name": "v", "expression": "9 +" }]
    });
    let result = evaluate(
        &def,
        &HashMap::from([("x".into(), json!(5))]),
        &EvalOptions::default(),
    );

    assert!(result.values.is_empty(), "{:?}", result.values);
    assert_eq!(result.data, json!({}));
    assert!(result.diagnostics.is_empty(), "{:?}", result.diagnostics);
    let refused: Vec<(&str, &str)> = result
        .validations
        .iter()
        .map(|v| (v.path.as_str(), v.constraint.as_deref().unwrap()))
        .collect();
    assert_eq!(
        refused,
        [
            ("$.binds[0].calculate", "1 +"),
            ("$.binds[0].constraint", "3 +"),
            ("$.binds[1].relevant", "4 +"),
            ("$.binds[1].default", "5 +"),
            ("$.shapes[0].constraint", "6 +"),
            ("$.shapes[0].activeWhen", "7 +"),
            ("$.shapes[0].context.seen", "8 +"),
            ("$.variables[0].expression", "9 +"),
            ("$.items[1].initialValue", "2 +"),
        ]
    );
    for finding in &result.validations {
        assert_eq!(finding.code, "SYNTAX_ERROR");
        assert_eq!(finding.constraint_kind, "definition");
        assert_eq!(
            finding.source.map(|source| source.as_wire_str()),
            Some("definition")
        );
        let source = finding.constraint.as_deref().unwrap();
        assert!(
            finding
                .message
                .contains(&format!("{source:?} at position 3")),
            "{}",
            finding.message
        );
    }
}

/// Core §3.10.1: an arity mismatch is a Definition error, in any position.
#[test]
fn arity_mismatches_refuse_the_definition() {
    let def = definition(
        json!([{ "path": "name", "calculate": "string(date(2027, 10, 1))" }]),
        json!([{ "id": "s", "target": "#", "constraint": "true", "activeWhen": "abs()", "message": "m" }]),
    );
    let result = evaluate(&def, &data(), &EvalOptions::default());

    assert!(result.values.is_empty(), "{:?}", result.values);
    let refused: Vec<(&str, String, &str)> = result
        .validations
        .iter()
        .map(|v| (v.path.as_str(), v.code.to_string(), v.message.as_str()))
        .collect();
    assert_eq!(
        refused,
        [
            (
                "$.binds[0].calculate",
                "ARITY_MISMATCH".into(),
                "date: requires exactly 1 argument"
            ),
            (
                "$.shapes[0].activeWhen",
                "ARITY_MISMATCH".into(),
                "abs: requires exactly 1 argument"
            ),
        ]
    );
}

/// Each calculate reports the evaluation errors of the evaluation that produced its value,
/// once per resolved row and with the FEL code, on both the document-order and the
/// dependency-ordered calculation paths.
#[test]
fn calculate_records_one_coded_diagnostic_per_resolved_site() {
    let document_order = definition(
        json!([{ "path": "rows[*].note", "calculate": "sum([money(10, 'USD')])" }]),
        json!([]),
    );
    let mut input = data();
    input.insert("rows[1].note".into(), json!("y"));
    let wire = evaluation_result_to_json_value(&evaluate(
        &document_order,
        &input,
        &EvalOptions::default(),
    ));
    let sites: Vec<(&str, &str, &str)> = wire["diagnostics"]
        .as_array()
        .unwrap()
        .iter()
        .map(|d| {
            (
                d["path"].as_str().unwrap(),
                d["expression"].as_str().unwrap(),
                d["code"].as_str().unwrap(),
            )
        })
        .collect();
    assert_eq!(
        sites,
        [
            (
                "rows[0].note",
                "sum([money(10, 'USD')])",
                "FEL_SUM_REJECTS_MONEY"
            ),
            (
                "rows[1].note",
                "sum([money(10, 'USD')])",
                "FEL_SUM_REJECTS_MONEY"
            ),
        ]
    );

    let ordered = json!({
        "items": [
            { "key": "total", "dataType": "decimal" },
            { "key": "rows", "repeatable": true, "children": [
                { "key": "input", "dataType": "integer" },
                { "key": "amt", "dataType": "money" }
            ] }
        ],
        "binds": [
            { "path": "total", "calculate": "sum($rows[*].amt)" },
            { "path": "rows[*].amt", "calculate": "money($input, 'USD')" }
        ]
    });
    let rows = HashMap::from([
        ("rows[0].input".into(), json!(1)),
        ("rows[1].input".into(), json!(2)),
    ]);
    let result = evaluate(&ordered, &rows, &EvalOptions::default());
    let sites: Vec<(&str, Option<&str>)> = result
        .diagnostics
        .iter()
        .map(|d| (d.path.as_str(), d.code.as_deref()))
        .collect();
    assert_eq!(sites, [("total", Some("FEL_SUM_REJECTS_MONEY"))]);
}

#[test]
fn diagnostics_serialize_beside_validations() {
    let def = definition(
        json!([{ "path": "name", "constraint": "$name + 5 > 0" }]),
        json!([]),
    );
    let json = evaluation_result_to_json_value(&evaluate(&def, &data(), &EvalOptions::default()));

    assert_eq!(json["validations"], json!([]));
    assert_eq!(json["diagnostics"][0]["path"], json!("name"));
    assert_eq!(json["diagnostics"][0]["expression"], json!("$name + 5 > 0"));
    assert!(json["diagnostics"][0]["message"].is_string());
    assert!(json["diagnostics"][0].get("shapeId").is_none());
}

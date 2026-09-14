//! Core §3.8.1 / §3.10.2: evaluation errors in constraint position.
//!
//! A type error yields `null`, and a `null` constraint passes. The error is
//! recorded as an author diagnostic on `EvaluationResult.diagnostics`, never as
//! a `ValidationResult`.

use formspec_eval::{EvalOptions, evaluate, evaluation_result_to_json_value};
use serde_json::{Value, json};
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

/// An undefined function is a definition error (§3.10.1), like a syntax error: it fails.
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
    assert_eq!(codes, vec!["CONSTRAINT_FAILED"], "{:?}", result.validations);
    assert_eq!(result.diagnostics.len(), 1, "{:?}", result.diagnostics);
    assert!(
        result.diagnostics[0].message.contains("bogusFunc"),
        "{:?}",
        result.diagnostics
    );
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

/// Syntax errors are definition errors (§3.10.1), not evaluation errors: they still fail.
#[test]
fn shape_syntax_error_still_fails() {
    let def = definition(
        json!([]),
        json!([{ "id": "broken", "target": "#", "constraint": "((( broken >>>", "message": "broken" }]),
    );
    let result = evaluate(&def, &data(), &EvalOptions::default());

    let shape_ids: Vec<Option<&str>> = result
        .validations
        .iter()
        .map(|v| v.shape_id.as_deref())
        .collect();
    assert_eq!(shape_ids, vec![Some("broken")]);
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

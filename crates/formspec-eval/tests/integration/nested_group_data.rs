//! Response `data` is nested (Core, `response.schema.json`): groups are objects, repeats arrays of
//! rows. The evaluator takes it nested or flat and answers the same: `values` flat by path, `data`
//! nested, with `nonRelevantBehavior` applied to both.

use formspec_eval::{EvalOptions, EvaluationResult, evaluate};
use serde_json::{Value, json};
use std::collections::HashMap;

fn definition() -> Value {
    json!({
        "$formspec": "1.0", "url": "urn:test:nested", "version": "1.0.0", "title": "T",
        "items": [
            { "key": "project", "type": "group", "label": "P", "children": [
                { "key": "hasSubawards", "type": "field", "dataType": "boolean", "label": "H", "initialValue": false },
                { "key": "region", "type": "field", "dataType": "string", "label": "R", "initialValue": "north" },
                { "key": "note", "type": "field", "dataType": "string", "label": "N" },
                { "key": "amount", "type": "field", "dataType": "money", "label": "A" },
                { "key": "doubled", "type": "field", "dataType": "boolean", "label": "D" },
                { "key": "detail", "type": "group", "label": "Dt", "children": [
                    { "key": "reason", "type": "field", "dataType": "string", "label": "Re" }
                ] }
            ] },
            { "key": "rows", "type": "group", "label": "Rows", "repeatable": true, "children": [
                { "key": "name", "type": "field", "dataType": "string", "label": "Nm" },
                { "key": "secret", "type": "field", "dataType": "string", "label": "S" },
                { "key": "docs", "type": "field", "dataType": "attachment", "label": "Docs" },
                { "key": "addr", "type": "group", "label": "Ad", "children": [
                    { "key": "flag", "type": "field", "dataType": "boolean", "label": "F", "initialValue": true },
                    { "key": "city", "type": "field", "dataType": "string", "label": "C" }
                ] }
            ] }
        ],
        "binds": [
            { "path": "project.doubled", "calculate": "$project.hasSubawards" },
            { "path": "project.note", "relevant": "$project.hasSubawards = true", "nonRelevantBehavior": "remove" },
            { "path": "project.detail.reason", "relevant": "$project.hasSubawards = true" },
            { "path": "rows[*].secret", "relevant": "false" }
        ]
    })
}

fn eval(data: Value) -> EvaluationResult {
    let map: HashMap<String, Value> = data.as_object().unwrap().clone().into_iter().collect();
    evaluate(&definition(), &map, &EvalOptions::default())
}

fn same(a: &EvaluationResult, b: &EvaluationResult) {
    assert_eq!(a.values, b.values);
    assert_eq!(a.data, b.data);
    assert_eq!(a.required, b.required);
    let (mut na, mut nb) = (a.non_relevant.clone(), b.non_relevant.clone());
    na.sort();
    nb.sort();
    assert_eq!(na, nb);
    assert_eq!(a.validations.len(), b.validations.len());
}

#[test]
fn nested_and_flat_group_input_calculate_alike_and_data_is_nested() {
    let nested = eval(json!({ "project": { "hasSubawards": true } }));
    let flat = eval(json!({ "project.hasSubawards": true }));
    assert_eq!(nested.values.get("project.doubled"), Some(&json!(true)));
    assert_eq!(nested.data["project"]["doubled"], json!(true));
    assert_eq!(nested.data["project"]["hasSubawards"], json!(true));
    same(&nested, &flat);
}

#[test]
fn nested_value_wins_over_initial_value_seeding() {
    let nested = eval(json!({ "project": { "hasSubawards": true, "region": "south" } }));
    let flat = eval(json!({ "project.hasSubawards": true, "project.region": "south" }));
    assert_eq!(nested.values.get("project.region"), Some(&json!("south")));
    same(&nested, &flat);
}

#[test]
fn non_relevant_group_fields_are_pruned_from_values_and_data() {
    let nested = eval(json!({ "project": { "hasSubawards": false, "note": "x", "detail": { "reason": "r" } } }));
    let flat = eval(json!({ "project.hasSubawards": false, "project.note": "x", "project.detail.reason": "r" }));
    assert!(!nested.values.contains_key("project.note"));
    assert!(!nested.values.contains_key("project"), "the group object is consumed, not echoed beside its leaves");
    assert!(nested.data["project"].get("note").is_none());
    assert!(nested.data["project"].get("detail").is_none());
    same(&nested, &flat);
}

#[test]
fn repeat_rows_and_groups_in_rows_flatten_and_nest_back_identically() {
    let nested = eval(json!({ "rows": [
        { "name": "a", "addr": { "city": "X", "flag": false } },
        { "name": "b", "addr": { "city": "Y" } }
    ] }));
    let flat = eval(json!({
        "rows[0].name": "a", "rows[0].addr.city": "X", "rows[0].addr.flag": false,
        "rows[1].name": "b", "rows[1].addr.city": "Y"
    }));
    assert_eq!(nested.values.get("rows[0].addr.flag"), Some(&json!(false)));
    assert_eq!(nested.values.get("rows[1].addr.city"), Some(&json!("Y")));
    assert!(!nested.values.contains_key("rows"), "the row array is consumed, not echoed");
    assert!(!nested.values.contains_key("rows[0].addr"));
    assert_eq!(nested.data["rows"][0]["addr"], json!({ "city": "X", "flag": false }));
    assert_eq!(nested.data["rows"][1]["name"], json!("b"));
    same(&nested, &flat);
}

#[test]
fn non_relevant_repeat_field_does_not_leak_from_the_row_array() {
    let nested = eval(json!({ "rows": [{ "name": "a", "secret": "leak" }] }));
    let flat = eval(json!({ "rows[0].name": "a", "rows[0].secret": "leak" }));
    assert!(!nested.values.contains_key("rows[0].secret"));
    assert_eq!(nested.data["rows"], json!([{ "name": "a" }]));
    assert!(!nested.data.to_string().contains("leak"));
    same(&nested, &flat);
}

#[test]
fn a_repeat_row_with_no_answered_field_still_counts() {
    let empty_row = eval(json!({ "rows": [{}, { "name": "b" }] }));
    assert_eq!(empty_row.data["rows"].as_array().map(Vec::len), Some(2));
}

#[test]
fn money_and_attachments_stay_whole_and_unknown_keys_survive() {
    let attachment = json!([{ "kind": "attachment-ref", "name": "a.pdf" }]);
    let nested = eval(json!({
        "project": { "amount": { "amount": "5", "currency": "USD" }, "mystery": 7 },
        "rows": [{ "docs": attachment }],
        "x-extra": { "kept": true }
    }));
    assert_eq!(nested.values.get("project.amount"), Some(&json!({ "amount": "5", "currency": "USD" })));
    assert_eq!(nested.values.get("rows[0].docs"), Some(&attachment));
    assert!(!nested.values.contains_key("rows[0].docs[0]"));
    assert_eq!(nested.data["project"]["mystery"], json!(7));
    assert_eq!(nested.data["rows"][0]["docs"], attachment);
    assert_eq!(nested.data["x-extra"], json!({ "kept": true }));
}

#[test]
fn a_field_supplied_flat_and_nested_is_refused() {
    let result = eval(json!({ "project": { "hasSubawards": true }, "project.hasSubawards": false }));
    assert!(result.values.is_empty());
    assert_eq!(result.validations.len(), 1);
    assert_eq!(result.validations[0].path, "project.hasSubawards");
}

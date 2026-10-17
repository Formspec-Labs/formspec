//! Response `data` nests non-repeatable groups (Core, `response.schema.json`); the evaluator
//! must give the same answer whether a field arrives nested or as a flat dotted key.

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
            ] }
        ],
        "binds": [
            { "path": "project.doubled", "calculate": "$project.hasSubawards" },
            { "path": "project.note", "relevant": "$project.hasSubawards = true", "nonRelevantBehavior": "remove" },
            { "path": "project.detail.reason", "relevant": "$project.hasSubawards = true" }
        ]
    })
}

fn eval(data: Value) -> EvaluationResult {
    let map: HashMap<String, Value> = data.as_object().unwrap().clone().into_iter().collect();
    evaluate(&definition(), &map, &EvalOptions::default())
}

fn same(a: &EvaluationResult, b: &EvaluationResult) {
    assert_eq!(a.values, b.values);
    assert_eq!(a.required, b.required);
    let mut na = a.non_relevant.clone();
    let mut nb = b.non_relevant.clone();
    na.sort();
    nb.sort();
    assert_eq!(na, nb);
    assert_eq!(a.validations.len(), b.validations.len());
}

#[test]
fn nested_and_flat_input_calculate_alike() {
    let nested = eval(json!({ "project": { "hasSubawards": true } }));
    let flat = eval(json!({ "project.hasSubawards": true }));
    assert_eq!(nested.values.get("project.doubled"), Some(&json!(true)));
    same(&nested, &flat);
}

#[test]
fn nested_value_wins_over_initial_value_seeding() {
    let nested = eval(json!({ "project": { "hasSubawards": true, "region": "south" } }));
    let flat = eval(json!({ "project.hasSubawards": true, "project.region": "south" }));
    assert_eq!(nested.values.get("project.hasSubawards"), Some(&json!(true)));
    assert_eq!(nested.values.get("project.region"), Some(&json!("south")));
    same(&nested, &flat);
}

#[test]
fn nested_non_relevant_field_is_pruned_and_output_is_flat() {
    let nested = eval(json!({ "project": { "hasSubawards": false, "note": "keep me?", "detail": { "reason": "r" } } }));
    let flat = eval(json!({ "project.hasSubawards": false, "project.note": "keep me?", "project.detail.reason": "r" }));
    assert!(!nested.values.contains_key("project.note"));
    assert!(!nested.values.contains_key("project.detail.reason"));
    assert!(!nested.values.contains_key("project"), "the group object is consumed, not echoed beside its flat keys");
    same(&nested, &flat);
}

#[test]
fn a_money_field_stays_one_value_and_unknown_keys_survive() {
    let nested = eval(json!({
        "project": { "amount": { "amount": "5", "currency": "USD" }, "mystery": 7 },
        "x-extra": { "kept": true }
    }));
    assert_eq!(nested.values.get("project.amount"), Some(&json!({ "amount": "5", "currency": "USD" })));
    assert_eq!(nested.values.get("project.mystery"), Some(&json!(7)));
    assert_eq!(nested.values.get("x-extra"), Some(&json!({ "kept": true })));
}

#[test]
fn a_field_supplied_flat_and_nested_is_refused() {
    let result = eval(json!({ "project": { "hasSubawards": true }, "project.hasSubawards": false }));
    assert!(result.values.is_empty());
    assert_eq!(result.validations.len(), 1);
    assert_eq!(result.validations[0].path, "project.hasSubawards");
}

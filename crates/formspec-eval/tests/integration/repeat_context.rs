//! Repeat context while walking a group (FEL §4.3): `@index`, `@count`, `prev()`, `next()`,
//! and nested-group aliases, including values calculated earlier in the same walk.

use formspec_eval::{EvalOptions, evaluate};
use serde_json::{Value, json};
use std::collections::HashMap;

fn evaluate_rows(binds: Value, data: HashMap<String, Value>) -> formspec_eval::EvaluationResult {
    let def = json!({
        "$formspec": "1.0",
        "url": "test",
        "version": "1.0.0",
        "title": "T",
        "items": [{
            "key": "rows",
            "type": "group",
            "label": "Rows",
            "repeatable": true,
            "children": [
                { "key": "qty", "type": "field", "dataType": "integer", "label": "Qty" },
                { "key": "total", "type": "field", "dataType": "integer", "label": "Total" },
                { "key": "prevTotal", "type": "field", "dataType": "integer", "label": "Prev" },
                { "key": "nextQty", "type": "field", "dataType": "integer", "label": "Next" },
                { "key": "position", "type": "field", "dataType": "string", "label": "Pos" },
                {
                    "key": "tasks",
                    "type": "group",
                    "label": "Tasks",
                    "repeatable": true,
                    "children": [
                        { "key": "mins", "type": "field", "dataType": "integer", "label": "Mins" },
                        { "key": "double", "type": "field", "dataType": "integer", "label": "Double" }
                    ]
                },
                { "key": "taskDouble", "type": "field", "dataType": "integer", "label": "TD" }
            ]
        }],
        "binds": binds
    });
    let result = evaluate(&def, &data, &EvalOptions::default());
    assert!(result.validations.is_empty(), "{:?}", result.validations);
    result
}

fn three_rows() -> HashMap<String, Value> {
    HashMap::from([(
        "rows".to_string(),
        json!([
            { "qty": 1, "tasks": [{ "mins": 5 }, { "mins": 7 }] },
            { "qty": 2, "tasks": [{ "mins": 11 }] },
            { "qty": 3 }
        ]),
    )])
}

#[test]
fn prev_and_next_read_neighbour_rows_including_calculated_values() {
    let values = evaluate_rows(
        json!([
            { "path": "rows[*].total", "calculate": "$qty * 10" },
            { "path": "rows[*].prevTotal", "calculate": "prev().total" },
            { "path": "rows[*].nextQty", "calculate": "next().qty" },
            { "path": "rows[*].position", "calculate": "string(@index) & '/' & string(@count)" }
        ]),
        three_rows(),
    )
    .values;

    let column = |field: &str| -> Vec<Option<&Value>> {
        (0..3)
            .map(|row| values.get(&format!("rows[{row}].{field}")))
            .collect()
    };
    assert_eq!(
        column("total"),
        vec![Some(&json!(10)), Some(&json!(20)), Some(&json!(30))]
    );
    assert_eq!(
        column("prevTotal"),
        vec![Some(&Value::Null), Some(&json!(10)), Some(&json!(20))]
    );
    assert_eq!(
        column("nextQty"),
        vec![Some(&json!(2)), Some(&json!(3)), Some(&Value::Null)]
    );
    assert_eq!(
        column("position"),
        vec![
            Some(&json!("1/3")),
            Some(&json!("2/3")),
            Some(&json!("3/3"))
        ]
    );
}

#[test]
fn nested_group_alias_sees_nested_calculated_values() {
    let values = evaluate_rows(
        json!([
            { "path": "rows[*].tasks[*].double", "calculate": "$mins * 2" },
            { "path": "rows[*].taskDouble", "calculate": "sum($tasks[*].double)" }
        ]),
        three_rows(),
    )
    .values;

    assert_eq!(values.get("rows[0].tasks[1].double"), Some(&json!(14)));
    assert_eq!(values.get("rows[0].taskDouble"), Some(&json!(24)));
    assert_eq!(values.get("rows[1].taskDouble"), Some(&json!(22)));
}

/// Relevance is evaluated once per walk, so it must see a previous row's total
/// calculated earlier in the same walk (a `null` `prev().total` would keep it relevant).
#[test]
fn relevance_reads_previous_row_calculated_in_the_same_walk() {
    let result = evaluate_rows(
        json!([
            { "path": "rows[*].total", "calculate": "$qty * 10" },
            { "path": "rows[*].nextQty", "relevant": "prev().total < 5" }
        ]),
        three_rows(),
    );

    let mut non_relevant: Vec<&str> = result
        .non_relevant
        .iter()
        .map(String::as_str)
        .filter(|path| path.ends_with(".nextQty"))
        .collect();
    non_relevant.sort_unstable();
    assert_eq!(non_relevant, vec!["rows[1].nextQty", "rows[2].nextQty"]);
}

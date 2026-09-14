//! Core §2.1.3 dataType→FEL type mapping inside repeat groups.
//!
//! A `date`/`dateTime` field is FEL type `date` wherever FEL reads it: sibling
//! aliases (`$rd`), the repeat-context current row, and the group array (`$r`).

use formspec_eval::{EvalOptions, evaluate};
use serde_json::{Value, json};
use std::collections::HashMap;

fn repeat_date_definition(binds: Value) -> Value {
    json!({
        "$formspec": "1.0",
        "url": "test",
        "version": "1.0.0",
        "title": "T",
        "items": [
            {
                "key": "r",
                "type": "group",
                "label": "R",
                "repeatable": true,
                "minRepeat": 1,
                "children": [
                    { "key": "rd", "type": "field", "dataType": "date", "label": "RD" },
                    { "key": "rflag", "type": "field", "dataType": "boolean", "label": "RF" },
                    { "key": "rcalc", "type": "field", "dataType": "string", "label": "RC" },
                    { "key": "rcon", "type": "field", "dataType": "string", "label": "RCON" }
                ]
            },
            { "key": "calc", "type": "field", "dataType": "string", "label": "C" }
        ],
        "binds": binds
    })
}

fn early_row_data() -> HashMap<String, Value> {
    HashMap::from([
        ("r[0].rd".to_string(), json!("2025-03-01")),
        ("r[0].rcon".to_string(), json!("x")),
    ])
}

fn early_and_late_row_data() -> HashMap<String, Value> {
    let mut data = early_row_data();
    data.insert("r[1].rd".to_string(), json!("2025-04-01"));
    data.insert("r[1].rcon".to_string(), json!("y"));
    data
}

#[test]
fn repeat_sibling_date_is_fel_date_in_relevance() {
    let def = repeat_date_definition(json!([
        { "path": "r[*].rflag", "relevant": "$rd > date('2025-03-29')" }
    ]));
    let result = evaluate(&def, &early_row_data(), &EvalOptions::default());
    assert!(
        result.non_relevant.contains(&"r[0].rflag".to_string()),
        "2025-03-01 > 2025-03-29 is false, so rflag must be non-relevant; non_relevant={:?}",
        result.non_relevant
    );
}

#[test]
fn repeat_sibling_date_is_fel_date_in_calculate() {
    let def = repeat_date_definition(json!([
        { "path": "r[*].rcalc", "calculate": "typeOf($rd)" }
    ]));
    let result = evaluate(&def, &early_row_data(), &EvalOptions::default());
    assert_eq!(result.values.get("r[0].rcalc"), Some(&json!("date")));
}

/// A string-typed `$rd` would make the comparison null, so both rows would pass with diagnostics.
#[test]
fn repeat_sibling_date_is_fel_date_in_constraint() {
    let def = repeat_date_definition(json!([
        { "path": "r[*].rcon", "constraint": "$rd <= date('2025-03-29')" }
    ]));
    let result = evaluate(&def, &early_and_late_row_data(), &EvalOptions::default());
    let paths: Vec<&str> = result.validations.iter().map(|v| v.path.as_str()).collect();
    assert_eq!(paths, vec!["r[1].rcon"], "only the late row fails");
    assert!(result.diagnostics.is_empty(), "{:?}", result.diagnostics);
}

#[test]
fn repeat_group_array_leaves_are_fel_dates() {
    let def = repeat_date_definition(json!([
        { "path": "calc", "calculate": "typeOf($r[1].rd)" },
        { "path": "r[*].rcalc", "calculate": "typeOf(@current.rd)" }
    ]));
    let result = evaluate(&def, &early_row_data(), &EvalOptions::default());
    assert_eq!(result.values.get("calc"), Some(&json!("date")));
    assert_eq!(result.values.get("r[0].rcalc"), Some(&json!("date")));
}

#[test]
fn repeat_wildcard_shape_sees_sibling_dates() {
    let mut def = repeat_date_definition(json!([]));
    def["shapes"] = json!([{
        "id": "late",
        "target": "r[*].rcon",
        "constraint": "$rd <= date('2025-03-29')",
        "message": "late"
    }]);
    let result = evaluate(&def, &early_and_late_row_data(), &EvalOptions::default());
    let paths: Vec<&str> = result.validations.iter().map(|v| v.path.as_str()).collect();
    assert_eq!(paths, vec!["r[1].rcon"], "only the late row fails");
    assert!(result.diagnostics.is_empty(), "{:?}", result.diagnostics);
}

/// Core §2.5.1 / §5.3.1: repeat result paths carry the concrete 0-based index.
#[test]
fn repeat_constraint_result_path_is_zero_based() {
    let def = repeat_date_definition(json!([
        { "path": "r[*].rd", "constraint": "$ > date('2025-03-29')", "constraintMessage": "late" }
    ]));
    let result = evaluate(&def, &early_row_data(), &EvalOptions::default());
    let paths: Vec<&str> = result.validations.iter().map(|v| v.path.as_str()).collect();
    assert_eq!(paths, vec!["r[0].rd"]);
}

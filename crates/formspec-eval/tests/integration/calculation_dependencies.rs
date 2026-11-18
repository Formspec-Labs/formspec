//! Rebuild resolves calculate dependencies at the rows that actually exist.

use std::collections::HashMap;

use fel_core::exact_json::{Value, native_json as json};
use formspec_eval::{EvalOptions, evaluate};

fn definition(binds: Value) -> Value {
    json!({
        "$formspec": "1.0", "url": "urn:test:calculation-dependencies",
        "version": "1.0.0", "title": "Calculation dependencies",
        "items": [{
            "key": "rows", "type": "group", "label": "Rows", "repeatable": true,
            "children": [
                {"key": "a", "type": "field", "dataType": "integer", "label": "A"},
                {"key": "b", "type": "field", "dataType": "integer", "label": "B"},
                {"key": "downstream", "type": "field", "dataType": "integer", "label": "Downstream"}
            ]
        }],
        "binds": binds
    })
}

#[test]
fn calculation_dependencies_refuse_an_unconditional_cycle_with_zero_rows() {
    let definition = definition(json!([
        {"path": "rows[*].a", "calculate": "$b + 1"},
        {"path": "rows[*].b", "calculate": "$a + 1"}
    ]));
    let result = evaluate(&definition, &HashMap::new(), &EvalOptions::default());
    assert_eq!(result.data, json!({}));
    assert_eq!(result.validations.len(), 1);
    assert_eq!(result.validations[0].code, "CIRCULAR_DEPENDENCY");
    assert_eq!(result.validations[0].constraint_kind, "definition");
    assert!(result.validations[0].message.contains("rows.a"));
    assert!(result.validations[0].message.contains("rows.b"));
}

#[test]
fn calculation_dependencies_refuse_cross_row_cycle_when_neighbors_exist() {
    let definition = definition(json!([
        {"path": "rows[*].a", "calculate": "(prev().b ?? 0) + 1"},
        {"path": "rows[*].b", "calculate": "(next().a ?? 0) + 1"},
        {"path": "rows[*].downstream", "calculate": "$a + $b"}
    ]));
    let one_row = HashMap::from([("rows".into(), json!([{}]))]);
    let result = evaluate(&definition, &one_row, &EvalOptions::default());
    assert!(result.validations.is_empty());
    assert_eq!(
        result.data["rows"],
        json!([{"a": 1, "b": 1, "downstream": 2}])
    );

    let two_rows = HashMap::from([("rows".into(), json!([{}, {}]))]);
    let result = evaluate(&definition, &two_rows, &EvalOptions::default());
    assert!(
        result
            .validations
            .iter()
            .any(|v| v.code == "CIRCULAR_DEPENDENCY"),
        "{:?}",
        result.data
    );
    assert_eq!(result.data, json!({}));
    let message = &result.validations[0].message;
    assert!(
        message.contains("rows[1].a") && message.contains("rows[0].b"),
        "{message}"
    );
    assert!(!message.contains("downstream"), "{message}");
}

#[test]
fn calculation_dependencies_order_a_reverse_chain_longer_than_the_old_cap() {
    let definition = definition(json!([
        {"path": "rows[*].a", "calculate": "(next().a ?? 0) + 1"}
    ]));
    let rows = vec![json!({}); 150];
    let data = HashMap::from([("rows".into(), json!(rows))]);
    let result = evaluate(&definition, &data, &EvalOptions::default());
    assert!(result.validations.is_empty(), "{:?}", result.validations);
    for (row, expected) in result.data["rows"]
        .as_array()
        .unwrap()
        .iter()
        .zip((1..=150).rev())
    {
        assert_eq!(row["a"], json!(expected));
    }
}

#[test]
fn calculation_dependencies_apply_an_indexed_writer_to_its_own_row() {
    let data = HashMap::from([("rows".into(), json!([{"a": 7}, {}]))]);
    for calculate in ["$rows[1].a + 1", "($rows[*].a)[1] + 1"] {
        let definition = definition(json!([
            {"path": "rows[ @index = 2 ].a", "calculate": calculate}
        ]));
        let result = evaluate(&definition, &data, &EvalOptions::default());
        assert!(result.validations.is_empty(), "{:?}", result.validations);
        assert_eq!(result.data["rows"], json!([{"a": 7}, {"a": 8}]));
    }
}

#[test]
fn calculation_dependencies_count_rows_without_reading_their_calculated_fields() {
    let definition = definition(json!([
        {"path": "rows[*].a", "calculate": "count($rows[*])"},
        {"path": "rows[*].b", "calculate": "count($rows)"}
    ]));
    let data = HashMap::from([("rows".into(), json!([{}, {}]))]);
    let result = evaluate(&definition, &data, &EvalOptions::default());
    assert!(result.validations.is_empty(), "{:?}", result.validations);
    assert_eq!(
        result.data["rows"],
        json!([{"a": 2, "b": 2}, {"a": 2, "b": 2}])
    );
}

#[test]
fn calculation_dependencies_refuse_competing_writers_as_a_target_conflict() {
    let definition = definition(json!([
        {"path": "rows[*].a", "calculate": "$a + 1"},
        {"path": "rows[@index = 2].a", "calculate": "2"}
    ]));
    let result = evaluate(&definition, &HashMap::new(), &EvalOptions::default());
    assert_eq!(result.validations.len(), 1);
    assert_eq!(result.validations[0].code, "CALCULATE_TARGET_CONFLICT");
    assert_eq!(result.data, json!({}));
}

#[test]
fn calculation_dependencies_track_row_object_predicate_members() {
    let definition = definition(json!([
        {"path": "rows[*].a", "calculate": "countWhere($rows[*], $.b > 0)"}
    ]));
    let data = HashMap::from([("rows".into(), json!([{"b": 3}, {"b": -1}]))]);
    let result = evaluate(&definition, &data, &EvalOptions::default());
    assert!(result.validations.is_empty(), "{:?}", result.validations);
    assert_eq!(
        result.data["rows"],
        json!([{"a": 1, "b": 3}, {"a": 1, "b": -1}])
    );
}

#[test]
fn calculation_dependencies_refuse_cycles_through_variables_and_required() {
    let mut through_variable = definition(json!([
        {"path": "rows[*].a", "calculate": "@v + 1"}
    ]));
    through_variable["variables"] = json!([{"name": "v", "scope": "rows", "expression": "$a"}]);
    let through_required = definition(json!([
        {"path": "rows[*].a", "calculate": "if(required($b), 1, 0)"},
        {"path": "rows[*].b", "required": "$a > 0"}
    ]));
    for definition in [through_variable, through_required] {
        let result = evaluate(&definition, &HashMap::new(), &EvalOptions::default());
        assert_eq!(result.validations.len(), 1, "{definition}");
        assert_eq!(result.validations[0].code, "CIRCULAR_DEPENDENCY");
        assert_eq!(result.data, json!({}));
    }
}

#[test]
fn calculation_dependencies_settle_required_before_a_calculate_reads_it() {
    let definition = definition(json!([
        {"path": "rows[*].a", "calculate": "if(required($b), 1, 0)"},
        {"path": "rows[*].b", "required": "$downstream > 0"},
        {"path": "rows[*].downstream", "calculate": "7"}
    ]));
    let data = HashMap::from([("rows".into(), json!([{"b": 3}]))]);
    let result = evaluate(&definition, &data, &EvalOptions::default());
    assert!(result.validations.is_empty(), "{:?}", result.validations);
    assert_eq!(
        result.data["rows"],
        json!([{"a": 1, "b": 3, "downstream": 7}])
    );
}

#[test]
fn calculation_dependencies_refuse_cycles_through_excluded_values_and_error_shapes() {
    let through_exclusion = definition(json!([
        {"path": "rows[*].a", "calculate": "$b + 1"},
        {"path": "rows[*].b", "relevant": "$a > 0", "excludedValue": "null"}
    ]));
    let mut through_shape = definition(json!([
        {"path": "rows[*].a", "calculate": "if(valid($b), 1, 0)"}
    ]));
    through_shape["shapes"] = json!([{
        "id": "row-rule", "target": "rows[*].b", "severity": "error",
        "constraint": "$a > 0", "message": "A must be positive"
    }]);
    for definition in [through_exclusion, through_shape] {
        let result = evaluate(&definition, &HashMap::new(), &EvalOptions::default());
        assert_eq!(result.validations.len(), 1, "{definition}");
        assert_eq!(result.validations[0].code, "CIRCULAR_DEPENDENCY");
    }
}

//! Instance dependency inventory combines authored FEL and creation declarations.
use formspec_core::definition_instance_reads::definition_instance_reads;
use serde_json::{Value, json};

#[test]
fn complete_inventory_matches_the_public_fixture() {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/fel/definition-instance-reads.json"
    ))
    .unwrap();
    let reads = definition_instance_reads(&fixture["definition"]).unwrap();
    assert_eq!(json!(reads), fixture["instanceReads"]);
}

#[test]
fn malformed_expression_cannot_yield_a_partial_inventory() {
    let definition = json!({"variables":[{"name":"broken","expression":"1 +"}]});
    assert!(
        definition_instance_reads(&definition)
            .unwrap_err()
            .contains("$.variables[0].expression")
    );
}

#[test]
fn nested_seed_is_ignored_and_keeps_outer_row_scope() {
    let definition = json!({"items":[
        {"type":"group","key":"outer","repeatable":true,"seedFrom":{"instance":"one","path":"rows"},"children":[
            {"type":"group","key":"inner","repeatable":true,"seedFrom":{"instance":"two","path":"ignored"},"children":[
                {"type":"field","key":"copy","prePopulate":{"instance":"one","path":"value"}}
            ]}
        ]}
    ]});
    assert_eq!(
        json!(definition_instance_reads(&definition).unwrap()),
        json!({"one":["rows","rows[*].value"]})
    );
}

#[test]
fn literal_instance_keys_stay_distinct_from_array_subscripts_in_definition_inventory() {
    let definition = json!({
        "instances": {"source": {"data": {}}},
        "items": [
            {"type": "field", "key": "literalKey", "dataType": "string",
             "initialValue": "=instance('source', 'rows[1].code')"},
            {"type": "field", "key": "arrayMember", "dataType": "string",
             "initialValue": "=@instance('source').rows[1].code"}
        ]
    });
    assert_eq!(
        json!(definition_instance_reads(&definition).unwrap()),
        json!({"source": ["[\"rows[1]\"].code", "rows[1].code"]})
    );
}

#[test]
fn seed_where_predicate_contributes_row_relative_and_instance_reads() {
    let definition = json!({
        "instances": {"records": {"data": {}}, "config": {"data": {}}},
        "items": [
            {
                "type": "group", "key": "rows", "repeatable": true,
                "seedFrom": {
                    "instance": "records",
                    "path": "entries",
                    "where": "empty($.closed) and $.tier = @instance('config').activeTier"
                },
                "children": [
                    {"type": "field", "key": "name", "prePopulate": {"instance": "records", "path": "name"}}
                ]
            }
        ]
    });
    assert_eq!(
        json!(definition_instance_reads(&definition).unwrap()),
        json!({
            "config": ["activeTier"],
            "records": ["entries", "entries[*].closed", "entries[*].name", "entries[*].tier"]
        })
    );
}

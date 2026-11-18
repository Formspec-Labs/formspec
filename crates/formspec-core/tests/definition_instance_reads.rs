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

use formspec_lint::{LintCode, lint};
use serde_json::Value;

#[test]
fn keyed_row_lookup_is_valid_and_incomplete_predicates_fail_to_parse() {
    let mut definition: Value = serde_json::from_str(include_str!(
        "../../../tests/conformance/suite/fixtures/fel-keyed-row-subject.definition.json"
    ))
    .unwrap();
    let result = lint(&definition);
    assert!(result.valid, "{:#?}", result.diagnostics);

    definition["binds"][0]["calculate"] =
        serde_json::json!("@instance('agencies').rows[id = ].name");
    assert!(
        lint(&definition)
            .diagnostics
            .iter()
            .any(|d| d.code == LintCode::E400)
    );
}

#[test]
fn keyed_lookup_tracks_cycles_through_the_key_and_result_fields() {
    for row_field in ["id", "label"] {
        let definition = serde_json::json!({
            "$formspec": "1.0", "url": "urn:example:lookup-cycle", "version": "1.0.0",
            "title": "Lookup cycle", "status": "draft",
            "items": [
                {"key": "sel", "type": "field", "dataType": "string", "label": "Selection"},
                {"key": "out", "type": "field", "dataType": "string", "label": "Output"},
                {"key": "rows", "type": "group", "label": "Rows", "repeatable": true,
                 "children": [
                     {"key": "id", "type": "field", "dataType": "string", "label": "ID"},
                     {"key": "label", "type": "field", "dataType": "string", "label": "Label"}
                 ]}
            ],
            "binds": [
                {"path": "out", "calculate": "$rows[id = $sel].label"},
                {"path": format!("rows[*].{row_field}"), "calculate": "$out"}
            ]
        });
        let result = lint(&definition);
        assert!(
            result.diagnostics.iter().any(|d| d.code == LintCode::E500),
            "{row_field}: {:#?}",
            result.diagnostics
        );
    }
}

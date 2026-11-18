//! FEL has no bare field reference: lint flags a bare name no `let` binds (fs-lvmp).

use formspec_lint::lint;
use serde_json::{Value, json};

fn e406(doc: &Value) -> Vec<(String, String)> {
    lint(doc)
        .diagnostics
        .into_iter()
        .filter(|d| d.code.as_wire_str() == "E406" && d.suggested_fix.is_some())
        .map(|d| (d.path, d.message))
        .collect()
}

#[test]
fn bare_names_read_as_fields_are_errors_with_the_dollar_spelling() {
    let mut doc: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/lint/E406-bare-field-name.json"
    ))
    .unwrap();
    let found = e406(&doc);
    assert_eq!(found.len(), 1, "{found:?}");
    assert!(found[0].0.ends_with(".relevant"), "{found:?}");
    assert!(found[0].1.contains("$amount"), "{found:?}");

    doc["binds"][0]["relevant"] = json!("$amount > 0 and (let limit = 10 in limit > $amount)");
    doc["items"][1]["initialValue"] = json!("=upper(note)");
    let found = e406(&doc);
    assert_eq!(found.len(), 1, "a let local is not a field: {found:?}");
    assert!(found[0].0.ends_with(".initialValue"), "{found:?}");
}

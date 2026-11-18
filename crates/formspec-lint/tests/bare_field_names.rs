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

fn paths(doc: &Value) -> Vec<String> {
    e406(doc).into_iter().map(|(path, _)| path).collect()
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

    // One finding per name and slot; a `let` local does not cover the same name outside it.
    doc["items"][1]
        .as_object_mut()
        .unwrap()
        .remove("initialValue");
    doc["binds"][0]["relevant"] = json!("amount > 0 and amount < 10 and (let n = 1 in n) = n");
    let found = e406(&doc);
    assert_eq!(found.len(), 2, "{found:?}");
    assert!(found[1].1.contains("$n"), "{found:?}");

    doc["binds"][0]["relevant"] = json!("$amount > 0");
    doc["items"][1]["label"] = json!("Note for {{amount}}");
    assert_eq!(paths(&doc), ["$.items[1].label"]);
}

#[test]
fn every_lint_fel_slot_reports_bare_names() {
    let screener = json!({
        "$formspecScreener": "1.0", "url": "urn:test:gate", "version": "1.0.0", "title": "Gate",
        "items": [{ "key": "eligible", "type": "field", "dataType": "boolean", "label": "Eligible" }],
        "evaluation": [{ "id": "route", "strategy": "first-match",
            "routes": [{ "target": "urn:test:yes", "condition": "eligible = true" }] }]
    });
    assert_eq!(paths(&screener), ["$.evaluation[0].routes[0].condition"]);

    let component = json!({
        "$formspecComponent": "1.0", "version": "1.0.0",
        "targetDefinition": { "url": "urn:test:gate" },
        "tree": { "component": "Stack", "children": [
            { "component": "Text", "text": "Eligible", "when": "eligible = true" }
        ] }
    });
    assert_eq!(paths(&component), ["$.tree.children[0].when"]);

    let locale = json!({
        "$formspecLocale": "2.0", "version": "1.0.0", "locale": "es-US",
        "targetDefinition": { "url": "urn:test:gate" },
        "strings": { "eligible.label": "Elegible: {{eligible}}" }
    });
    assert_eq!(e406(&locale).len(), 1, "{:?}", e406(&locale));
}

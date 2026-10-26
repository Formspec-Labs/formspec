//! E613 end to end: the `lint` cases of the shared access-class conformance fixture.
// Rust guideline compliant 2026-02-21
use formspec_lint::{LintOptions, lint_with_options};
use serde_json::{Value, json};

/// Load the shared access-class value fixture.
fn class_values() -> Value {
    serde_json::from_str(include_str!(
        "../../../tests/conformance/fixtures/access-class/class-values.json"
    ))
    .unwrap()
}

/// Load the shared E613 lint fixture (registered prefix, undeclared token).
fn lint_fixture() -> Value {
    serde_json::from_str(include_str!(
        "../../../tests/fixtures/lint/E613-access-class-unregistered.json"
    ))
    .unwrap()
}

/// Load the Formspec common registry, which publishes the core classes and prefixes.
fn common_registry() -> Value {
    serde_json::from_str(include_str!(
        "../../../registries/formspec-common.registry.json"
    ))
    .unwrap()
}

/// Build a deployment registry declaring `tokens` (each `{token, status}`).
fn deployment_registry(tokens: &Value) -> Value {
    let entries: Vec<Value> = tokens
        .as_array()
        .unwrap()
        .iter()
        .map(|row| {
            json!({
                "name": "x-acme-access-class",
                "category": "access-class",
                "status": row["status"],
                "classShape": { "token": row["token"] }
            })
        })
        .collect();
    json!({ "entries": entries })
}

/// Return the sorted diagnostic codes for `doc` with `registries` loaded.
fn codes(doc: &Value, registries: Vec<Value>) -> Vec<String> {
    let options = LintOptions {
        registry_documents: registries,
        ..LintOptions::default()
    };
    let mut found: Vec<String> = lint_with_options(doc, &options)
        .diagnostics
        .into_iter()
        .map(|d| d.code.to_string())
        .collect();
    found.sort();
    found
}

#[test]
fn shared_fixture_lint_cases() {
    for case in class_values()["lint"].as_array().unwrap() {
        let mut doc = lint_fixture();
        doc["items"][0]["accessControl"]["class"] = case["class"].clone();
        let registries = vec![
            common_registry(),
            deployment_registry(&case["deploymentTokens"]),
        ];
        let expected: Vec<String> = case["codes"]
            .as_array()
            .unwrap()
            .iter()
            .map(|c| c.as_str().unwrap().to_string())
            .collect();
        assert_eq!(codes(&doc, registries), expected, "{case}");
    }
}

#[test]
fn core_tokens_pass_without_registries() {
    let mut doc = lint_fixture();
    doc["items"][0]["accessControl"]["class"] = json!("protected");
    assert!(codes(&doc, vec![]).is_empty());
}

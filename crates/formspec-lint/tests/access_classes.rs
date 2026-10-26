//! E613 end to end: `accessControl.class` against the Access-Class Registry.
// Rust guideline compliant 2026-02-21
use formspec_lint::{LintOptions, lint_with_options};
use serde_json::{Value, json};

/// Load the shared E613 lint fixture (registered prefix, undeclared token).
fn fixture() -> Value {
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

/// Return the diagnostic codes emitted for `doc` with `registries` loaded.
fn codes(doc: &Value, registries: Vec<Value>) -> Vec<String> {
    let options = LintOptions {
        registry_documents: registries,
        ..LintOptions::default()
    };
    lint_with_options(doc, &options)
        .diagnostics
        .into_iter()
        .map(|d| d.code.to_string())
        .collect()
}

/// Set the fixture field's class.
fn with_class(class: &str) -> Value {
    let mut doc = fixture();
    doc["items"][0]["accessControl"]["class"] = json!(class);
    doc
}

#[test]
fn undeclared_prefixed_token_is_e613_only() {
    assert_eq!(codes(&fixture(), vec![common_registry()]), ["E613"]);
}

#[test]
fn deployment_registry_declaration_resolves_the_token() {
    let deployment = json!({ "entries": [{
        "name": "x-acme-access-class-cui-privacy",
        "category": "access-class",
        "status": "stable",
        "classShape": { "token": "cui.privacy", "maps": { "cui": ["PRVCY"] } }
    }] });
    assert!(codes(&fixture(), vec![common_registry(), deployment]).is_empty());
}

#[test]
fn core_tokens_pass_without_registries() {
    assert!(codes(&with_class("protected"), vec![]).is_empty());
}

#[test]
fn unregistered_prefix_fails_schema_and_registry() {
    let found = codes(&with_class("wos.case"), vec![common_registry()]);
    assert!(found.contains(&"E101".to_string()), "{found:?}");
    assert!(found.contains(&"E613".to_string()), "{found:?}");
}

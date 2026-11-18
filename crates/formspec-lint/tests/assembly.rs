//! Reject Definitions that still contain Group inclusions.

use formspec_core::{MapResolver, assemble_definition};
use formspec_lint::{LintSeverity, lint};
use serde_json::{Value, json};

#[test]
fn a_group_ref_must_be_assembled_before_linting() {
    let authored: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/lint/E313-unassembled-definition-reference.json"
    ))
    .unwrap();
    let report = lint(&authored);
    assert!(!report.valid);
    assert!(
        report.diagnostics.iter().any(|finding| {
            finding.code.as_wire_str() == "E313"
                && finding.severity == LintSeverity::Error
                && finding.path == "$.items[0].children[0].$ref"
        }),
        "{:?}",
        report.diagnostics
    );

    let mut resolver = MapResolver::new();
    resolver.add(
        "urn:example:cover|1.0.0",
        json!({
            "$formspec": "1.0",
            "url": "urn:example:cover",
            "version": "1.0.0",
            "status": "draft",
            "title": "Shared cover",
            "items": [{ "key": "c_name", "type": "field", "dataType": "string", "label": "Name" }],
            "binds": [{ "path": "c_name", "required": "true" }]
        }),
    );
    let assembled = assemble_definition(&authored, &resolver);
    assert!(assembled.errors.is_empty(), "{:?}", assembled.errors);
    let report = lint(&assembled.definition);
    assert!(report.valid, "{:?}", report.diagnostics);
}

#[test]
fn an_unassembled_group_is_reported_even_with_duplicate_item_keys() {
    let mut authored: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/lint/E313-unassembled-definition-reference.json"
    ))
    .unwrap();
    let items = authored["items"].as_array_mut().unwrap();
    items.push(items[1].clone());
    let diagnostics = lint(&authored).diagnostics;
    assert!(diagnostics.iter().any(|finding| finding.code.as_wire_str() == "E200"));
    assert!(diagnostics.iter().any(|finding| finding.code.as_wire_str() == "E313"));
}

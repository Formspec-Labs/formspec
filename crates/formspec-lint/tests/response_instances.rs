//! Exercise filing-unit declarations and response instances through the public linter.
// Rust guideline compliant 2026-02-21

use formspec_lint::{LintSeverity, lint};
use serde_json::{Value, json};

/// Load the landed Definition with a typed subject and response selection.
fn definition() -> Value {
    serde_json::from_str(include_str!(
        "../../../tests/fixtures/response-selection/valid-response-instance.definition.json"
    ))
    .unwrap()
}

/// Require an error with the owning code and exact authoring path.
fn assert_error(doc: &Value, code: &str, path: &str) {
    let result = lint(doc);
    assert!(
        result.diagnostics.iter().any(|diagnostic| {
            diagnostic.code == code
                && diagnostic.severity == LintSeverity::Error
                && diagnostic.path == path
                && diagnostic.spec_ref.is_some()
        }),
        "expected {code} at {path}, got {:#?}",
        result.diagnostics
    );
    assert!(!result.valid);
}

/// Require the Definition to pass without any findings.
fn assert_clean(doc: &Value) {
    let result = lint(doc);
    assert!(result.valid, "{:#?}", result.diagnostics);
    assert!(result.diagnostics.is_empty(), "{:#?}", result.diagnostics);
}

#[test]
fn instance_requires_one_content_source() {
    let doc: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/response-selection/invalid-doubly-sourced.definition.json"
    ))
    .unwrap();
    assert_error(&doc, "E305", "$.instances.priorYear");

    let mut doc = definition();
    doc["instances"]["priorYear"] = json!({"static": true});
    assert_error(&doc, "E305", "$.instances.priorYear");
}

#[test]
fn route_parameter_is_rejected_in_definition_instance() {
    let mut doc = definition();
    doc["instances"]["priorYear"]["response"]["subject"][0]["from"] =
        json!({"routeParam": "agencyId"});
    assert_error(
        &doc,
        "E306",
        "$.instances.priorYear.response.subject[0].from.routeParam",
    );
}

#[test]
fn subject_predicate_must_reference_a_key_declared_by_the_consumer() {
    let mut doc = definition();
    doc["instances"]["priorYear"]["response"]["subject"][0]["key"] = json!("missing");
    doc["instances"]["priorYear"]["response"]["subject"][0]["from"]["subject"] = json!("missing");
    assert_error(
        &doc,
        "E307",
        "$.instances.priorYear.response.subject[0].from.subject",
    );

    let mut doc = definition();
    doc.as_object_mut().unwrap().remove("subject");
    assert_error(
        &doc,
        "E307",
        "$.instances.priorYear.response.subject[0].from.subject",
    );
}

#[test]
fn response_instance_requires_a_projection_schema() {
    let mut doc = definition();
    doc["instances"]["priorYear"]
        .as_object_mut()
        .unwrap()
        .remove("schema");
    assert_error(&doc, "E308", "$.instances.priorYear.schema");

    doc["instances"]["priorYear"]["schema"] = Value::Null;
    assert_error(&doc, "E308", "$.instances.priorYear.schema");
}

#[test]
fn response_projection_requires_wildcard_paths_and_core_data_types() {
    for schema in [
        json!({"agencies[0].uei": "string"}),
        json!({"expenditures.employment": "unknown"}),
    ] {
        let mut doc = definition();
        doc["instances"]["priorYear"]["schema"] = schema;
        let result = lint(&doc);
        assert!(!result.valid);
        assert!(
            result
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.code == "E101"),
            "{:#?}",
            result.diagnostics
        );
    }
}

#[test]
fn authorization_parent_requires_a_declared_string_key() {
    let mut doc = definition();
    doc["subject"]["keys"]["ffy"]["authorizationParent"] = json!("year");
    assert_error(&doc, "E309", "$.subject.keys.ffy.authorizationParent");
}

#[test]
fn integer_predicate_checks_belong_to_cross_definition_validation() {
    let mut doc = definition();
    let predicate = &mut doc["instances"]["priorYear"]["response"]["subject"][0];
    predicate["op"] = json!("le");
    predicate["offset"] = json!(0);
    // Core §4.4.1 assigns both checks to check_instance_projection.
    assert_clean(&doc);
}

#[test]
fn subject_key_requires_a_string_or_integer_data_type() {
    let mut doc = definition();
    doc["subject"]["keys"]["ffy"]["dataType"] = json!("decimal");
    assert_error(&doc, "E311", "$.subject.keys.ffy.dataType");

    doc["subject"]["keys"]["ffy"] = json!({});
    assert_error(&doc, "E311", "$.subject.keys.ffy.dataType");
}

#[test]
fn non_string_subject_key_data_type_reports_once() {
    let mut doc = definition();
    doc["subject"]["keys"]["ffy"]["dataType"] = json!(42);
    assert_error(&doc, "E311", "$.subject.keys.ffy.dataType");
    let result = lint(&doc);
    assert_eq!(result.diagnostics.len(), 1, "{:#?}", result.diagnostics);
}

#[test]
fn subject_type_uri_is_validated_by_the_schema() {
    let mut doc = definition();
    for subject_type in ["", "relative/type", "urn:example:bad type"] {
        doc["subject"]["type"] = json!(subject_type);
        assert_error(&doc, "E101", "$.subject.type");
    }
}

#[test]
fn instance_diagnostics_quote_literal_names() {
    for (name, path) in [
        ("", r#"$.instances[""]"#),
        ("prior/year~a.b", r#"$.instances["prior/year~a.b"]"#),
    ] {
        let mut doc = definition();
        let mut instance = doc["instances"]["priorYear"].clone();
        instance["response"]["subject"][0]["from"] = json!({"routeParam": "agencyId"});
        instance.as_object_mut().unwrap().remove("schema");
        doc["instances"] = json!({name: instance});
        assert_error(&doc, "E308", &format!("{path}.schema"));
        assert_error(
            &doc,
            "E306",
            &format!("{path}.response.subject[0].from.routeParam"),
        );
    }
}

#[test]
fn singleton_without_predicates_and_dataless_projection_are_valid() {
    let mut doc = definition();
    doc["subject"]["keys"] = json!({});
    doc["instances"]["priorYear"]["response"]["subject"] = json!([]);
    doc["instances"]["priorYear"]["schema"] = json!({});
    assert_clean(&doc);

    doc.as_object_mut().unwrap().remove("subject");
    assert_clean(&doc);
}

#[test]
fn local_keys_can_differ_from_upstream_keys_and_fallback_is_allowed() {
    let mut doc = definition();
    doc["instances"]["priorYear"]["response"]["subject"][1]["key"] = json!("upstreamYear");
    doc["instances"]["priorYear"]["response"]["subject"][1]["op"] = json!("ge");
    doc["instances"]["remote"] = json!({"source": "urn:example:lookup", "data": null});
    doc["instances"]["inline"] = json!({"data": null});
    assert_clean(&doc);
}

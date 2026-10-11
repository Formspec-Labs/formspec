//! Neutral external JSON source association regressions.
use formspec_lint::{LintCode, pass_mapping::analyze_mapping};
use serde_json::{Value, json};

fn mapping() -> Value {
    json!({"$formspecMapping":"1.0", "version":"1.0.0",
        "sourceSchema":{"url":"urn:neutral:records", "version":"1.0.0", "schema":{
            "type":"object", "$defs":{"record":{"type":"object", "properties":{
                "label":{"type":"string"}, "children":{"type":"array", "items":{
                    "type":"object", "properties":{"label":{"type":"string"}}}}}}},
            "properties":{"label":{"type":"string"}, "records":{"type":"array", "items":{"$ref":"#/$defs/record"}}}}},
        "targetSchema":{"format":"json"}, "rules":[{"sourcePath":"records", "targetPath":"rows", "transform":"preserve", "array":{
            "mode":"each", "innerRules":[{"sourcePath":"label", "targetPath":"name", "transform":"preserve"},
                {"sourcePath":"children", "targetPath":"children", "transform":"preserve", "array":{"mode":"each", "innerRules":[
                    {"sourcePath":"label", "targetPath":"childName", "transform":"preserve"}]}}]}}]})
}

#[test]
fn external_paths_use_schema_and_nested_array_scope_not_paired_definition() {
    let definition = json!({"items":[{"key":"unrelated", "type":"field", "dataType":"string"}]});
    let mut document = mapping();
    assert!(
        analyze_mapping(&document, Some(&definition))
            .diagnostics
            .iter()
            .all(|d| d.severity != formspec_lint::LintSeverity::Error)
    );
    document["rules"][0]["array"]["innerRules"][0]["sourcePath"] = json!("absent");
    assert!(
        analyze_mapping(&document, None)
            .diagnostics
            .iter()
            .any(|d| matches!(d.code, LintCode::E1110 | LintCode::E1111))
    );
}

#[test]
fn external_association_refuses_mixed_and_unresolved_schema() {
    let mut document = mapping();
    document["definitionRef"] = json!("urn:neutral:form");
    assert!(
        analyze_mapping(&document, None)
            .diagnostics
            .iter()
            .any(|d| d.severity == formspec_lint::LintSeverity::Error)
    );
    let mut document = mapping();
    document["sourceSchema"]["schema"]["properties"]["records"]["items"]["$ref"] =
        json!("#/missing");
    assert!(
        analyze_mapping(&document, None)
            .diagnostics
            .iter()
            .any(|d| d.severity == formspec_lint::LintSeverity::Error)
    );
}

#[test]
fn runtime_source_backend_validates_same_schema_and_refuses_invalid_inputs() {
    let schema = json!({"type":"object", "required":["email"], "additionalProperties":false,
        "properties":{"email":{"type":"string", "format":"email"}}});
    assert!(
        formspec_lint::validate_mapping_source(&schema, &json!({"email":"reader@example.com"}))
            .is_ok()
    );
    for input in [
        json!({}),
        json!({"email":"bad"}),
        json!({"email":"reader@example.com", "extra":true}),
    ] {
        assert!(formspec_lint::validate_mapping_source(&schema, &input).is_err());
    }
    for invalid_schema in [
        json!({"type":"invalid"}),
        json!({"$ref":"#/absent"}),
        json!({"$ref":"https://unselected.invalid/schema"}),
    ] {
        assert!(formspec_lint::validate_mapping_source(&invalid_schema, &json!({})).is_err());
    }
}

#[test]
fn genuine_definition_path_validation_remains_intact() {
    let document = json!({"definitionRef":"urn:neutral:form", "definitionVersion":"1.0.0",
        "targetSchema":{"format":"json"}, "rules":[{"sourcePath":"absent", "targetPath":"out", "transform":"preserve"}]});
    let definition = json!({"items":[{"key":"present", "type":"field", "dataType":"string"}]});
    assert!(
        analyze_mapping(&document, Some(&definition))
            .diagnostics
            .iter()
            .any(|d| d.code == LintCode::E1110)
    );
}

#[test]
fn static_schema_limits_are_explicit_and_populated_paths_are_checked() {
    let mut document = mapping();
    document["rules"] =
        json!([{"sourcePath":"label", "targetPath":"name", "transform":"preserve"}]);
    document["sourceSchema"]["schema"] = json!({"anyOf":[
        {"type":"object", "properties":{"label":{"type":"string"}}},
        {"type":"object", "properties":{"label":{"type":"number"}}}]});
    let analysis = analyze_mapping(&document, None);
    assert!(
        analysis
            .diagnostics
            .iter()
            .any(|d| d.message.contains("unsupported by static"))
    );
    document["sourceSchema"]["schema"] = json!({"type":"invalid"});
    assert!(
        analyze_mapping(&document, None)
            .diagnostics
            .iter()
            .any(|d| d.code == LintCode::E1100)
    );
}

#[test]
fn full_lint_accepts_external_association_without_inventing_a_definition() {
    let result = formspec_lint::lint(&mapping());
    assert!(result.valid, "{:?}", result.diagnostics);
    let mut mixed = mapping();
    mixed["definitionVersion"] = json!("1.0.0");
    assert!(!formspec_lint::lint(&mixed).valid);
}

#[test]
fn external_association_metadata_is_strict_in_semantic_lint() {
    let valid = mapping()["sourceSchema"].clone();
    assert!(formspec_lint::validate_mapping_source_association(&valid).is_ok());
    for invalid in [
        json!({"url":null, "version":"1.0.0", "schema":{}}),
        json!({"url":"not a URI", "version":"1.0.0", "schema":{}}),
        json!({"url":"urn:neutral:source", "version":"01.0.0", "schema":{}}),
        json!({"url":"urn:neutral:source", "version":"1.0", "schema":{}}),
        json!({"url":"urn:neutral:source", "version":"1.0.0", "schema":{}, "unknown":true}),
        json!({"url":"urn:neutral:source", "version":"1.0.0"}),
    ] {
        assert!(formspec_lint::validate_mapping_source_association(&invalid).is_err());
        let mut document = mapping();
        document["sourceSchema"] = invalid;
        assert!(
            analyze_mapping(&document, None)
                .diagnostics
                .iter()
                .any(|d| d.code == LintCode::E1100
                    && d.message.contains("Invalid external source association"))
        );
    }
}

#[test]
fn nested_resource_identifiers_are_explicitly_outside_static_path_analysis() {
    let mut document = mapping();
    document["sourceSchema"]["schema"]["$id"] = json!("urn:neutral:root");
    document["sourceSchema"]["schema"]["$defs"]["record"]["$id"] = json!("urn:neutral:record");
    let result = analyze_mapping(&document, None);
    assert!(
        result
            .diagnostics
            .iter()
            .any(|d| d.message.contains("nested schema resource identifiers"))
    );
    // The full runtime compiler still validates the actual resource-aware schema.
    assert!(
        formspec_lint::validate_mapping_source(
            &document["sourceSchema"]["schema"],
            &json!({"records":[{"label":"nested", "children":[]}]})
        )
        .is_ok()
    );
}

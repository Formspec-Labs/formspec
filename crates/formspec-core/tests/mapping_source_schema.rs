//! External-source mapping admission and validation boundaries.

use formspec_core::{
    MappingDirection, MappingErrorCode, execute_mapping_doc, execute_mapping_doc_with_validation,
    parse_mapping_document_from_value,
};
use serde_json::{Value, json};

#[test]
fn external_source_requires_validation_before_execution() {
    let doc = parse_mapping_document_from_value(&json!({
        "sourceSchema": {"url": "urn:neutral:source", "version": "1.0.0",
            "schema": {"type": "object", "required": ["label"]}},
        "rules": [{"sourcePath": "label", "targetPath": "name", "transform": "preserve"}]
    }))
    .unwrap();
    let result = execute_mapping_doc(&doc, &json!({"label": "root"}), MappingDirection::Forward);
    assert_eq!(result.output, json!({}));
    assert_eq!(result.rules_applied, 0);
    assert_eq!(
        result.diagnostics[0].error_code,
        MappingErrorCode::InvalidDocument
    );
}

fn document() -> Value {
    json!({"sourceSchema": {"url": "urn:neutral:source", "version": "1.0.0",
        "schema": {"type": "object", "required": ["label"]}},
        "rules": [{"sourcePath": "label", "targetPath": "name", "transform": "preserve", "bidirectional": true}]})
}

#[test]
fn parsed_source_schema_keeps_identity_and_rejects_malformed_or_mixed_associations() {
    let doc = parse_mapping_document_from_value(&document()).unwrap();
    let association = doc.source_schema.unwrap();
    assert_eq!(association.url, "urn:neutral:source");
    assert_eq!(association.version, "1.0.0");
    assert_eq!(association.schema["required"], json!(["label"]));
    for value in [
        Value::Null,
        json!({}),
        json!({"url":"urn:x", "version":"1", "schema":true}),
        json!({"url":"urn:x", "version":"1", "schema":{}, "unknown":true}),
    ] {
        let mut candidate = document();
        candidate["sourceSchema"] = value;
        assert!(parse_mapping_document_from_value(&candidate).is_err());
    }
    for name in ["definitionRef", "definitionVersion"] {
        let mut candidate = document();
        candidate[name] = json!("legacy");
        assert!(parse_mapping_document_from_value(&candidate).is_err());
    }
}

#[test]
fn forward_validation_sees_actual_input_and_invalid_input_produces_no_output() {
    let doc = parse_mapping_document_from_value(&document()).unwrap();
    let validate = |schema: &Value, value: &Value| {
        if schema["properties"]["url"]["format"] == "uri" {
            assert_eq!(value["url"], "urn:neutral:source");
            return Ok(());
        }
        assert_eq!(schema, &document()["sourceSchema"]["schema"]);
        if value["label"].is_string() {
            Ok(())
        } else {
            Err("label must be a string".into())
        }
    };
    let good = execute_mapping_doc_with_validation(
        &doc,
        &json!({"label":"root"}),
        MappingDirection::Forward,
        validate,
    );
    assert_eq!(good.output, json!({"name":"root"}));
    assert_eq!(good.rules_applied, 1);
    assert!(good.diagnostics.is_empty());
    let bad = execute_mapping_doc_with_validation(
        &doc,
        &json!({"label":42}),
        MappingDirection::Forward,
        validate,
    );
    assert_eq!(bad.output, json!({}));
    assert_eq!(bad.rules_applied, 0);
    assert_eq!(
        bad.diagnostics[0].error_code,
        MappingErrorCode::InvalidDocument
    );
}

#[test]
fn reverse_validates_mapped_source_shape_and_discards_refused_output() {
    let doc = parse_mapping_document_from_value(&document()).unwrap();
    let validate = |schema: &Value, value: &Value| {
        if schema["properties"]["url"]["format"] == "uri" {
            return Ok(());
        }
        assert!(value.get("name").is_none());
        if value["label"].is_string() {
            Ok(())
        } else {
            Err("source label must be a string".into())
        }
    };
    let good = execute_mapping_doc_with_validation(
        &doc,
        &json!({"name":"root"}),
        MappingDirection::Reverse,
        validate,
    );
    assert_eq!(good.output, json!({"label":"root"}));
    let bad = execute_mapping_doc_with_validation(
        &doc,
        &json!({"name":false}),
        MappingDirection::Reverse,
        validate,
    );
    assert_eq!(bad.output, json!({}));
    assert_eq!(bad.rules_applied, 0);
    assert_eq!(
        bad.diagnostics[0].error_code,
        MappingErrorCode::InvalidDocument
    );
}

#[test]
fn unavailable_or_refused_validator_does_not_reach_mapping_results() {
    let doc = parse_mapping_document_from_value(&document()).unwrap();
    for direction in [MappingDirection::Forward, MappingDirection::Reverse] {
        let no_validator =
            execute_mapping_doc(&doc, &json!({"label":"root", "name":"root"}), direction);
        assert_eq!(no_validator.output, json!({}));
        let refusal = execute_mapping_doc_with_validation(
            &doc,
            &json!({"label":"root", "name":"root"}),
            direction,
            |_, _| Err("invalid schema or unresolved reference".into()),
        );
        assert_eq!(refusal.output, json!({}));
        assert_eq!(
            refusal.diagnostics[0].error_code,
            MappingErrorCode::InvalidDocument
        );
    }
}

#[test]
fn definition_mapping_keeps_existing_behavior_without_calling_external_validator() {
    let doc = parse_mapping_document_from_value(
        &json!({"definitionRef":"urn:neutral:form", "definitionVersion":"1.0.0",
        "rules":[{"sourcePath":"label", "targetPath":"name", "transform":"preserve"}]}),
    )
    .unwrap();
    let source = json!({"label":"legacy"});
    let result =
        execute_mapping_doc_with_validation(&doc, &source, MappingDirection::Forward, |_, _| {
            panic!("Definition mapping must not call an external source validator")
        });
    assert_eq!(
        result.output,
        execute_mapping_doc(&doc, &source, MappingDirection::Forward).output
    );
}

#[test]
fn external_source_preserves_nested_duplicate_property_names() {
    let doc = parse_mapping_document_from_value(&json!({
        "sourceSchema": {"url":"urn:neutral:nested", "version":"1.0.0", "schema":{
            "type":"object", "properties":{"label":{"type":"string"}, "records":{
                "type":"array", "items":{"type":"object", "properties":{"label":{"type":"string"}}}
            }}
        }},
        "rules":[{"sourcePath":"label", "targetPath":"label", "transform":"preserve"},
            {"sourcePath":"records", "targetPath":"records", "transform":"preserve", "array":{
                "mode":"each", "innerRules":[{"sourcePath":"label", "targetPath":"label", "transform":"preserve"}]
            }}]
    })).unwrap();
    let source = json!({"label":"root", "records":[{"label":"nested"}]});
    let result = execute_mapping_doc_with_validation(
        &doc,
        &source,
        MappingDirection::Forward,
        |schema, actual| {
            if schema["properties"]["url"]["format"] == "uri" {
                return Ok(());
            }
            assert_eq!(
                schema["properties"]["records"]["items"]["properties"]["label"]["type"],
                "string"
            );
            assert_eq!(actual, &source);
            Ok(())
        },
    );
    assert_eq!(result.output, source);
    assert!(result.diagnostics.is_empty());
}

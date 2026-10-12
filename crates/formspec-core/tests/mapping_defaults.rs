//! Regression checks for Mapping defaults and source presence.

use formspec_core::runtime_mapping::{
    MappingDirection, execute_mapping_doc, parse_mapping_document_from_value,
};
use serde_json::json;

#[test]
fn missing_source_writes_default_without_value_map_lookup() {
    let doc = parse_mapping_document_from_value(&json!({
        "rules":[{"sourcePath":"input", "targetPath":"output", "transform":"valueMap",
                  "default":"fallback", "valueMap":{"forward":{"fallback":"changed"}}}]
    }))
    .unwrap();
    let result = execute_mapping_doc(&doc, &json!({}), MappingDirection::Forward);
    assert_eq!(result.output, json!({"output":"fallback"}));
    assert!(result.diagnostics.is_empty());
}

#[test]
fn missing_source_defaults_are_final_values_for_each_supported_transform_and_direction() {
    for fallback in [json!(false), json!(0), json!(null), json!("literal")] {
        for transform in [
            json!({"transform":"preserve"}),
            json!({"transform":"expression", "expression":"$ + 1"}),
            json!({"transform":"coerce", "coerce":{"to":"number"}}),
            json!({"transform":"valueMap", "valueMap":{"forward":{"literal":"changed"}}}),
        ] {
            let mut rule = json!({"sourcePath":"input", "targetPath":"output", "default":fallback});
            rule.as_object_mut()
                .unwrap()
                .extend(transform.as_object().unwrap().clone());
            let doc = parse_mapping_document_from_value(&json!({"rules":[rule]})).unwrap();
            for (direction, target) in [
                (MappingDirection::Forward, "output"),
                (MappingDirection::Reverse, "input"),
            ] {
                let result = execute_mapping_doc(&doc, &json!({}), direction);
                assert_eq!(
                    result.output.as_object().unwrap().get(target),
                    Some(&fallback)
                );
                assert_eq!(result.rules_applied, 1);
                assert!(result.diagnostics.is_empty(), "{:?}", result.diagnostics);
            }
        }
    }
}

#[test]
fn missing_source_without_default_omits_target_except_expression() {
    for transform in [
        json!({"transform":"preserve"}),
        json!({"transform":"coerce", "coerce":{"to":"number"}}),
        json!({"transform":"valueMap", "valueMap":{"forward":{"present":"mapped"}}}),
        json!({"transform":"expression", "expression":"$"}),
    ] {
        let expression = transform["transform"] == "expression";
        let mut rule = json!({"sourcePath":"input", "targetPath":"output"});
        rule.as_object_mut()
            .unwrap()
            .extend(transform.as_object().unwrap().clone());
        let doc = parse_mapping_document_from_value(&json!({"rules":[rule]})).unwrap();
        let result = execute_mapping_doc(&doc, &json!({}), MappingDirection::Forward);
        assert_eq!(
            result.output.get("output"),
            if expression {
                Some(&serde_json::Value::Null)
            } else {
                None
            }
        );
        assert!(result.diagnostics.is_empty(), "{:?}", result.diagnostics);
    }
}

#[test]
fn present_false_zero_and_string_still_use_value_map() {
    let doc = parse_mapping_document_from_value(&json!({"rules":[{
        "sourcePath":"input", "targetPath":"output", "transform":"valueMap", "default":"fallback",
        "valueMap":{"forward":{"false":"mapped-false", "0":"mapped-zero", "present":"mapped"}}
    }]}))
    .unwrap();
    for (input, expected) in [
        (json!(false), json!("mapped-false")),
        (json!(0), json!("mapped-zero")),
        (json!("present"), json!("mapped")),
    ] {
        let result = execute_mapping_doc(&doc, &json!({"input":input}), MappingDirection::Forward);
        assert_eq!(result.output["output"], expected);
        assert!(result.diagnostics.is_empty());
    }
}

#[test]
fn array_each_inner_missing_source_uses_final_default() {
    let doc = parse_mapping_document_from_value(&json!({"rules":[{
        "sourcePath":"rows", "targetPath":"entries", "transform":"preserve",
        "array":{"mode":"each", "innerRules":[{
            "sourcePath":"input", "targetPath":"output", "transform":"valueMap", "default":"fallback",
            "valueMap":{"forward":{"fallback":"changed", "present":"mapped"}}
        }]}
    }]})).unwrap();
    let result = execute_mapping_doc(
        &doc,
        &json!({"rows":[{}, {"input":"present"}]}),
        MappingDirection::Forward,
    );
    assert_eq!(
        result.output,
        json!({"entries":[{"output":"fallback"}, {"output":"mapped"}]})
    );
}

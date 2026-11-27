//! Tests for canonical recheck `EvalOptions` (`fs-20e3`) and normative remote option membership (`fs-oxsy`).

use std::collections::HashMap;

use fel_core::exact_json::{Value, native_json as json};
use formspec_eval::types::ValidationCode;
use formspec_eval::{
    EvalOptions, EvalSubject, EvalTrigger, RegistryConstraintsError, ResolvedOptionLists, evaluate,
    evaluate_filed, recheck_eval_options,
};

fn remote_option_set_definition() -> Value {
    json!({
        "$formspec": "1.0",
        "url": "urn:test:remote-option-sets",
        "version": "1.0.0",
        "status": "active",
        "title": "Remote Option Sets",
        "optionSets": {
            "regions": {
                "source": "https://catalog.example.test/regions",
                "valueField": "code",
                "labelField": "name"
            },
            "tags": {
                "source": "https://catalog.example.test/tags",
                "valueField": "id",
                "labelField": "title"
            },
            "summaryOnly": {
                "source": "https://catalog.example.test/summary-only",
                "valueField": "code",
                "labelField": "name"
            }
        },
        "items": [
            { "key": "show", "type": "field", "dataType": "boolean", "label": "Show" },
            { "key": "region", "type": "field", "dataType": "choice", "label": "Region", "optionSet": "regions" },
            { "key": "tags", "type": "field", "dataType": "multiChoice", "label": "Tags", "optionSet": "tags" },
            { "key": "hiddenChoice", "type": "field", "dataType": "choice", "label": "Hidden", "optionSet": "regions" }
        ],
        "binds": [
            { "path": "hiddenChoice", "relevant": "$show = true" }
        ]
    })
}

fn uri_options_definition() -> Value {
    json!({
        "$formspec": "1.0",
        "url": "urn:test:uri-options",
        "version": "1.0.0",
        "status": "active",
        "title": "URI Options",
        "items": [
            {
                "key": "category",
                "type": "field",
                "dataType": "choice",
                "label": "Category",
                "options": "https://catalog.example.test/categories"
            },
            {
                "key": "flags",
                "type": "field",
                "dataType": "multiChoice",
                "label": "Flags",
                "options": "https://catalog.example.test/flags"
            }
        ]
    })
}

#[test]
fn url_backed_option_set_absent_emits_options_unavailable_not_silent_acceptance() {
    let def = remote_option_set_definition();
    let data = HashMap::from([
        ("show".into(), json!(false)),
        ("region".into(), json!("zz")),
        ("tags".into(), json!(["unknown"])),
        ("hiddenChoice".into(), json!("zz")),
    ]);

    let result = evaluate_filed(&def, &data, &EvalOptions::default()).expect("settles");
    let codes: Vec<_> = result
        .validations
        .iter()
        .map(|v| {
            (
                v.path.as_str(),
                v.code.as_wire_str().into_owned(),
                v.severity.as_wire_str(),
            )
        })
        .collect();
    assert_eq!(
        codes,
        vec![
            ("region", "OPTIONS_UNAVAILABLE".into(), "error"),
            ("tags", "OPTIONS_UNAVAILABLE".into(), "error"),
            ("#", "EXPLANATION_REQUIRED".into(), "error"),
        ],
        "non-relevant hiddenChoice must not emit OPTIONS_UNAVAILABLE, and its held value triggers hidden-answer acknowledgement"
    );
}

#[test]
fn url_backed_option_set_blank_values_and_summary_only_sets_do_not_emit_options_unavailable() {
    let def = remote_option_set_definition();
    let data = HashMap::from([("region".into(), Value::Null), ("tags".into(), json!([]))]);
    let result = evaluate_filed(&def, &data, &EvalOptions::default()).expect("settles");
    assert!(result.validations.is_empty(), "{:?}", result.validations);
}

#[test]
fn url_backed_option_set_supplied_by_name_or_source_uri_checks_membership() {
    let def = remote_option_set_definition();
    let by_name = ResolvedOptionLists::new()
        .with_option_set("regions", ["north", "south"])
        .with_option_set("tags", ["alpha", "beta"])
        .with_option_set("summaryOnly", ["s1"]);

    let valid_data = HashMap::from([
        ("region".into(), json!("north")),
        ("tags".into(), json!(["alpha", "beta"])),
    ]);
    let valid = evaluate_filed(
        &def,
        &valid_data,
        &EvalOptions::new().resolved_option_lists(by_name.clone()),
    )
    .expect("settles");
    assert!(valid.validations.is_empty(), "{:?}", valid.validations);

    let invalid_data = HashMap::from([
        ("region".into(), json!("zz")),
        ("tags".into(), json!(["alpha", "zz"])),
    ]);
    let invalid = evaluate_filed(
        &def,
        &invalid_data,
        &EvalOptions::new().resolved_option_lists(by_name),
    )
    .expect("settles");
    assert_eq!(invalid.validations.len(), 2, "{:?}", invalid.validations);
    assert!(
        invalid
            .validations
            .iter()
            .all(|v| v.code == ValidationCode::TypeMismatch)
    );

    // Resolving via source URI works identically when optionSets map omits the name.
    let by_uri = ResolvedOptionLists::new()
        .with_uri("https://catalog.example.test/regions", ["north"])
        .with_uri("https://catalog.example.test/tags", ["alpha"]);
    let uri_valid = evaluate_filed(
        &def,
        &HashMap::from([
            ("region".into(), json!("north")),
            ("tags".into(), json!(["alpha"])),
        ]),
        &EvalOptions::new().resolved_option_lists(by_uri),
    )
    .expect("settles");
    assert!(
        uri_valid.validations.is_empty(),
        "{:?}",
        uri_valid.validations
    );
}

#[test]
fn url_backed_option_set_supplied_empty_list_rejects_selection_with_type_mismatch() {
    let def = remote_option_set_definition();
    let empty_supplied =
        ResolvedOptionLists::new().with_option_set("regions", Vec::<String>::new());
    let data = HashMap::from([("region".into(), json!("north"))]);
    let result = evaluate(
        &def,
        &data,
        &EvalOptions::new()
            .trigger(EvalTrigger::Submit)
            .resolved_option_lists(empty_supplied),
    );
    assert_eq!(result.validations.len(), 1);
    assert_eq!(result.validations[0].code, ValidationCode::TypeMismatch);
}

#[test]
fn uri_string_options_enforces_supplied_list_and_emits_options_unavailable_when_absent() {
    let def = uri_options_definition();
    let data = HashMap::from([
        ("category".into(), json!("zz")),
        ("flags".into(), json!(["ok", "zz"])),
    ]);

    let absent = evaluate_filed(&def, &data, &EvalOptions::default()).expect("settles");
    assert_eq!(absent.validations.len(), 2);
    assert!(
        absent
            .validations
            .iter()
            .all(|v| v.code == ValidationCode::OptionsUnavailable)
    );

    let supplied = ResolvedOptionLists::new()
        .with_uri("https://catalog.example.test/categories", ["a", "b"])
        .with_uri("https://catalog.example.test/flags", ["ok", "extra"]);
    let out_of_list = evaluate_filed(
        &def,
        &data,
        &EvalOptions::new().resolved_option_lists(supplied.clone()),
    )
    .expect("settles");
    assert_eq!(out_of_list.validations.len(), 2);
    assert!(
        out_of_list
            .validations
            .iter()
            .all(|v| v.code == ValidationCode::TypeMismatch)
    );

    let in_list = evaluate_filed(
        &def,
        &HashMap::from([
            ("category".into(), json!("a")),
            ("flags".into(), json!(["ok"])),
        ]),
        &EvalOptions::new().resolved_option_lists(supplied),
    )
    .expect("settles");
    assert!(in_list.validations.is_empty(), "{:?}", in_list.validations);
}

#[test]
fn inline_options_plus_url_option_set_precedence_emits_options_unavailable_when_absent() {
    // fs-6q36 review edge case: optionSet takes precedence over inline options (Core §4.2.3).
    // When the named optionSet is URL-backed and absent, neither 'zz' nor 'inline' is silently accepted.
    let def = json!({
        "$formspec": "1.0",
        "url": "urn:test:precedence-remote",
        "version": "1.0.0",
        "status": "active",
        "title": "Precedence",
        "optionSets": {
            "codes": {
                "source": "https://catalog.example.test/codes",
                "valueField": "code",
                "labelField": "label"
            }
        },
        "items": [{
            "key": "code",
            "type": "field",
            "dataType": "choice",
            "label": "Code",
            "optionSet": "codes",
            "options": [{ "value": "inline", "label": "Inline" }]
        }]
    });

    for candidate in ["zz", "inline"] {
        let absent = evaluate_filed(
            &def,
            &HashMap::from([("code".into(), json!(candidate))]),
            &EvalOptions::default(),
        )
        .expect("settles");
        assert_eq!(absent.validations.len(), 1, "candidate={candidate}");
        assert_eq!(
            absent.validations[0].code,
            ValidationCode::OptionsUnavailable
        );
    }

    let supplied = ResolvedOptionLists::new().with_option_set("codes", ["remote-a", "remote-b"]);
    let inline_rejected = evaluate_filed(
        &def,
        &HashMap::from([("code".into(), json!("inline"))]),
        &EvalOptions::new().resolved_option_lists(supplied.clone()),
    )
    .expect("settles");
    assert_eq!(inline_rejected.validations.len(), 1);
    assert_eq!(
        inline_rejected.validations[0].code,
        ValidationCode::TypeMismatch
    );

    let remote_accepted = evaluate_filed(
        &def,
        &HashMap::from([("code".into(), json!("remote-a"))]),
        &EvalOptions::new().resolved_option_lists(supplied),
    )
    .expect("settles");
    assert!(remote_accepted.validations.is_empty());
}

#[test]
fn recheck_eval_options_validates_registries_and_preserves_exact_decimal_limits() {
    let registry: Value = serde_json::from_str(
        r#"{
            "$formspecRegistry": "1.1",
            "entries": [{
                "name": "x-test-precise-limit",
                "category": "dataType",
                "version": "1.0.0",
                "status": "stable",
                "compatibility": { "formspecVersion": ">=1.0.0 <2.0.0" },
                "baseType": "decimal",
                "constraints": {
                    "minimum": 0.0000000000000000000000000001,
                    "maximum": 1.0000000000000000000000000000
                }
            }]
        }"#,
    )
    .expect("exact JSON");

    let def = json!({
        "$formspec": "1.0",
        "url": "urn:test:recheck-exact",
        "version": "1.0.0",
        "status": "active",
        "title": "Exact Recheck",
        "items": [{
            "key": "ratio",
            "type": "field",
            "dataType": "decimal",
            "label": "Ratio",
            "extensions": { "x-test-precise-limit": true }
        }]
    });

    let options = recheck_eval_options(
        EvalTrigger::Submit,
        Some("2026-11-17T12:00:00Z".into()),
        HashMap::new(),
        &[registry.clone()],
        ResolvedOptionLists::new(),
    )
    .expect("valid registry")
    .with_subject(Some(EvalSubject::default()))
    .with_explanations(Vec::new());
    // Clear synthetic subject so Definition without subject stays valid.
    let options = options.with_subject(None);

    let at_min: Value =
        serde_json::from_str(r#"{"ratio": 0.0000000000000000000000000001}"#).unwrap();
    let at_min_map = formspec_core::json_object_to_string_map(&at_min);
    let ok = evaluate(&def, &at_min_map, &options);
    assert!(ok.validations.is_empty(), "{:?}", ok.validations);

    let below_min: Value = serde_json::from_str(r#"{"ratio": 0}"#).unwrap();
    let below_min_map = formspec_core::json_object_to_string_map(&below_min);
    let under = evaluate(&def, &below_min_map, &options);
    assert_eq!(under.validations.len(), 1);
    assert_eq!(under.validations[0].code, ValidationCode::RangeUnderflow);

    // Duplicate registry entries across documents must be rejected once.
    let dup_err = recheck_eval_options(
        EvalTrigger::Submit,
        None,
        HashMap::new(),
        &[registry.clone(), registry],
        ResolvedOptionLists::new(),
    )
    .expect_err("duplicate extension rejected");
    assert_eq!(
        dup_err,
        RegistryConstraintsError::DuplicateExtension {
            name: "x-test-precise-limit".into()
        }
    );

    // Unsupported registry constraint keys must be rejected once.
    let unsupported = json!({
        "entries": [{
            "name": "x-test-bad-key",
            "constraints": { "multipleOf": 5 }
        }]
    });
    let unsup_err = recheck_eval_options(
        EvalTrigger::Submit,
        None,
        HashMap::new(),
        &[unsupported],
        ResolvedOptionLists::new(),
    )
    .expect_err("unsupported constraint rejected");
    assert_eq!(
        unsup_err,
        RegistryConstraintsError::UnsupportedConstraint {
            extension: "x-test-bad-key".into(),
            key: "multipleOf".into()
        }
    );
}

//! Full `evaluate_*` pipeline integration tests.

use fel_core::exact_json::{Value, native_json as json};
use formspec_eval::types::ValidationSource;
use formspec_eval::{
    CreateOptions, EvalContext, EvalOptions, EvalSubject, EvalTrigger, ValidationResult,
    create_response, evaluate,
};
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

#[test]
fn evaluating_saved_data_never_applies_creation_values() {
    let definition = json!({
        "instances": { "record": { "data": { "name": "Root", "people": [{"name": "A"}] } } },
        "items": [
            { "key": "note", "type": "field", "dataType": "string", "initialValue": "New" },
            { "key": "name", "type": "field", "dataType": "string",
              "prePopulate": { "instance": "record", "path": "name" } },
            { "key": "rows", "type": "group", "repeatable": true, "minRepeat": 2,
              "seedFrom": { "instance": "record", "path": "people" }, "children": [
                  { "key": "name", "type": "field", "dataType": "string" }
              ] }
        ],
        "binds": [{ "path": "name", "required": "true" }]
    });
    let options = EvalOptions::new().trigger(EvalTrigger::Submit);
    for input in [json!({"name": null}), json!({"name": null, "rows": []})] {
        let data = input.as_object().unwrap().clone().into_iter().collect();
        let result = evaluate(&definition, &data, &options);
        assert_eq!(result.data, json!({"name": null, "rows": []}));
        assert_eq!(result.validations.len(), 2);
        assert!(
            result
                .validations
                .iter()
                .any(|finding| finding.path == "name")
        );
        assert!(
            result
                .validations
                .iter()
                .any(|finding| finding.path == "rows")
        );
    }
}

#[test]
fn default_evaluation_json_includes_refusal_status_and_preserves_data_shape() {
    let definition = json!({
        "items": [
            {"key": "hidden", "type": "field", "dataType": "string"},
            {"key": "rows", "type": "group", "repeatable": true, "children": [
                {"key": "amount", "type": "field", "dataType": "integer"}
            ]}
        ],
        "binds": [{"path": "hidden", "relevant": "false"}],
        "nonRelevantBehavior": "remove"
    });
    let data = HashMap::from([
        ("hidden".into(), json!("draft answer")),
        ("rows".into(), json!([{"amount": 3}])),
    ]);
    let result = evaluate(&definition, &data, &EvalOptions::default());
    let expected_mips = HashMap::from([
        ("hidden".into(), false),
        ("rows".into(), false),
        ("rows[0].amount".into(), false),
    ]);
    assert_eq!(result.required, expected_mips);
    assert_eq!(result.readonly, expected_mips);
    // Match the iteration order of the two maps while pinning the report fields.
    // `invalidPaths` is what `valid()` reads in the settled state (Core §3.5.9, fs-4jfg).
    let expected = format!(
        concat!(
            r#"{{"refused":false,"values":{{"rows[0].amount":3}},"data":{{"rows":[{{"amount":3}}]}},"#,
            r#""validations":[],"diagnostics":[],"nonRelevant":["hidden"],"invalidPaths":[],"#,
            r#""variables":{{}},"#,
            r#""required":{},"readonly":{}}}"#
        ),
        fel_core::exact_json::to_value(&result.required).unwrap(),
        fel_core::exact_json::to_value(&result.readonly).unwrap(),
    );
    assert_eq!(
        formspec_eval::evaluation_result_to_json_value(&result).to_string(),
        expected
    );
}

#[test]
fn unsubscripted_repeat_reference_stops_before_recalculate() {
    let definition = json!({
        "items": [
            {"key": "total", "type": "field", "dataType": "integer"},
            {"key": "rows", "type": "group", "repeatable": true, "minRepeat": 0,
             "children": [{"key": "amount", "type": "field", "dataType": "integer"}]}
        ],
        "binds": [
            {"path": "total", "calculate": "recordRecalculate()"},
            {"path": "rows[*].amount", "constraint": "$ <= ($rows).amount"}
        ]
    });
    let calls = Arc::new(AtomicUsize::new(0));
    let mut extensions = fel_core::ExtensionRegistry::new();
    let observed_calls = Arc::clone(&calls);
    extensions
        .register("recordRecalculate", 0, Some(0), move |_| {
            observed_calls.fetch_add(1, Ordering::Relaxed);
            fel_core::Value::Number(42.into())
        })
        .unwrap();
    let options = EvalOptions::new()
        .trigger(EvalTrigger::Submit)
        .extensions(&extensions);
    for rows in [json!([]), json!([{"amount": 1}, {"amount": 2}])] {
        let result = evaluate(
            &definition,
            &HashMap::from([("rows".to_string(), rows)]),
            &options,
        );
        assert_eq!(
            result.validations.len(),
            1,
            "expected one refusal at the authored constraint: {:?}",
            result.validations
        );
        let error = &result.validations[0];
        assert_eq!(error.path, "$.binds[1].constraint");
        assert_eq!(error.code.as_wire_str(), "UNSUBSCRIPTED_REPEAT_REFERENCE");
        assert_eq!(error.constraint_kind.as_wire_str(), "definition");
        assert_eq!(error.source, Some(ValidationSource::Definition));
        assert_eq!(error.constraint.as_deref(), Some("$ <= ($rows).amount"));
        assert!(!result.values.contains_key("total"), "Recalculate ran");
        assert_eq!(calls.load(Ordering::Relaxed), 0, "Calculate was called");
    }
    let mut control = definition;
    control["binds"].as_array_mut().unwrap().pop();
    let evaluated = evaluate(&control, &HashMap::new(), &options);
    assert_eq!(evaluated.values.get("total"), Some(&json!(42)));
    assert!(calls.load(Ordering::Relaxed) > 0);
}

#[test]
fn repeat_variable_scope_uses_the_item_key() {
    let mut definition = json!({
        "items": [{
            "key": "section", "type": "group", "children": [{
                "key": "rows", "type": "group", "repeatable": true, "children": [{
                    "key": "lines", "type": "group", "repeatable": true, "children": [{
                        "key": "amount", "type": "field", "dataType": "integer"
                    }]
                }]
            }]
        }],
        "variables": [{"name": "probe", "scope": "rows", "expression": "@current.lines.amount"}]
    });
    let evaluate_definition = |definition: &Value| {
        evaluate(definition, &HashMap::new(), &EvalOptions::default())
            .validations
            .into_iter()
            .filter(|finding| finding.code.as_wire_str() == "UNSUBSCRIPTED_REPEAT_REFERENCE")
            .collect::<Vec<_>>()
    };

    let errors = evaluate_definition(&definition);
    assert_eq!(errors.len(), 1);
    assert_eq!(errors[0].path, "$.variables[0].expression");
    assert!(errors[0].message.contains("'section.rows.lines'"));

    definition["variables"][0]["scope"] = json!("section.rows");
    assert!(evaluate_definition(&definition).is_empty());
}

#[test]
fn subject_keys_feed_seed_calculate_and_validation() {
    let definition = json!({"subject": {"type": "urn:example:agency-year", "keys": {
        "serial": {"dataType": "integer"}, "uei": {"dataType": "string"}
    }}, "items": [
        {"key": "seeded", "type": "field", "dataType": "string", "initialValue": "=subject('uei')"},
        {"key": "year", "type": "field", "dataType": "integer"}
    ], "binds": [{"path": "year", "calculate": "subject('serial')",
                 "constraint": "subject('uei') = '00123'"}]});
    let wire = json!({"subjectType": "urn:example:agency-year",
        "subjectKeys": {"uei": "00123", "serial": 9_007_199_254_740_991_i64}, "meta": {"uei": "other"}});
    let context = formspec_eval::eval_context_from_json_object(wire.as_object().unwrap()).unwrap();
    let created = create_response(
        &definition,
        json!({}),
        &CreateOptions {
            subject: context.subject.clone(),
            ..CreateOptions::default()
        },
    );
    let data = created
        .data
        .as_object()
        .unwrap()
        .clone()
        .into_iter()
        .collect();
    let evaluation = evaluate(&definition, &data, &EvalOptions::new().context(context));
    assert_eq!(
        evaluation.data,
        json!({"seeded": "00123", "year": 9_007_199_254_740_991_i64})
    );
    assert!(
        evaluation.validations.is_empty(),
        "{:?}",
        evaluation.validations
    );
    assert!(
        evaluation.diagnostics.is_empty(),
        "{:?}",
        evaluation.diagnostics
    );
}

#[test]
fn subject_keys_reject_an_invalid_native_identity_value() {
    let definition = json!({"subject": {"type": "urn:example:filing", "keys": {
        "flag": {"dataType": "string"}
    }}, "items": [
        {"key": "flag", "type": "field", "dataType": "boolean"}
    ], "binds": [{"path": "flag", "calculate": "subject('flag')"}]});
    let context = EvalContext {
        subject: Some(EvalSubject {
            subject_type: Some("urn:example:filing".into()),
            keys: Some(HashMap::from([(
                "flag".into(),
                fel_core::Value::Boolean(true),
            )])),
        }),
        ..EvalContext::default()
    };
    let evaluation = evaluate(
        &definition,
        &HashMap::new(),
        &EvalOptions::new().context(context),
    );
    assert_eq!(evaluation.data, json!({}));
    assert_eq!(evaluation.validations[0].path, "#subjectKeys.flag");
    assert_eq!(
        evaluation.validations[0].code,
        formspec_eval::types::ValidationCode::TypeMismatch
    );
}

#[test]
fn subject_inputs_match_the_definition_on_native_and_json_paths() {
    let definition = json!({
        "subject": {"type": "urn:example:agency-year", "keys": {
            "ffy": {"dataType": "integer"}, "uei": {"dataType": "string"}
        }},
        "items": [{"key": "agency", "type": "field", "dataType": "string"}],
        "binds": [{"path": "agency", "calculate": "subject('uei')"}]
    });
    let mut undeclared = definition.clone();
    undeclared.as_object_mut().unwrap().shift_remove("subject");
    let matching_type = "urn:example:agency-year";
    let cases = [
        (
            &undeclared,
            matching_type,
            json!({"uei": "A"}),
            "#subjectKeys.uei",
            "Subject key is not declared by the Definition",
        ),
        (
            &definition,
            matching_type,
            json!({"ffy": "2026", "uei": "A"}),
            "#subjectKeys.ffy",
            "Subject key must be an integer",
        ),
        (
            &definition,
            "urn:example:other",
            json!({"ffy": 2026, "uei": "A"}),
            "#subjectType",
            "Subject type must match the Definition's declaration (urn:example:agency-year)",
        ),
        (
            &definition,
            matching_type,
            json!({"uei": "A"}),
            "#subjectKeys.ffy",
            "Declared subject key is missing",
        ),
        (
            &definition,
            matching_type,
            json!({"extra": "B", "ffy": 2026, "uei": "A"}),
            "#subjectKeys.extra",
            "Subject key is not declared by the Definition",
        ),
        (
            &definition,
            matching_type,
            json!({"ffy": 2026, "not a key": "B", "uei": "A"}),
            "#subjectKeys.not a key",
            "Invalid subject key name",
        ),
        (
            &definition,
            matching_type,
            json!({"uei": false, "ffy": null}),
            "#subjectKeys.ffy",
            "Subject key must be an integer",
        ),
        (
            &definition,
            matching_type,
            json!({"uei": "A", "ffy": 9_007_199_254_740_993_i64}),
            "#subjectKeys.ffy",
            "Integer subject key must be in the I-JSON range",
        ),
        (
            &definition,
            matching_type,
            json!({"uei": "A", "ffy": -9_007_199_254_740_992_i64}),
            "#subjectKeys.ffy",
            "Integer subject key must be in the I-JSON range",
        ),
    ];
    let mut observed = Vec::new();
    let mut expected = Vec::new();
    for (definition, subject_type, keys, path, message) in cases {
        let context = EvalContext {
            subject: Some(EvalSubject {
                subject_type: Some(subject_type.to_string()),
                keys: Some(
                    keys.as_object()
                        .unwrap()
                        .iter()
                        .map(|(key, value)| {
                            (key.clone(), fel_core::exact_json::to_fel(value).unwrap())
                        })
                        .collect(),
                ),
            }),
            ..Default::default()
        };
        let wire = json!({"subjectType": subject_type, "subjectKeys": keys});
        let json_context = formspec_eval::eval_context_from_json_object(wire.as_object().unwrap());
        let findings = |context| {
            let evaluation = evaluate(
                definition,
                &HashMap::new(),
                &EvalOptions::new().context(context),
            );
            let findings = evaluation
                .validations
                .into_iter()
                .map(|finding| (finding.path, finding.code, finding.message))
                .collect::<Vec<_>>();
            (evaluation.data, findings)
        };
        observed.push((findings(context), json_context.map(findings)));
        let refusal = (
            json!({}),
            vec![(
                path.to_string(),
                formspec_eval::types::ValidationCode::TypeMismatch,
                message.to_string(),
            )],
        );
        expected.push((refusal.clone(), Ok(refusal)));
    }
    assert_eq!(observed, expected);
}

// validation-result.schema.json `source`: Item cardinality has no source category.
#[test]
fn cardinality_results_omit_source_in_both_json_styles() {
    let def = json!({"items": [
        {"key": "under", "type": "group", "repeatable": true, "minRepeat": 2,
         "children": [{"key": "a", "type": "field", "dataType": "string"}]},
        {"key": "over", "type": "group", "repeatable": true, "maxRepeat": 1,
         "children": [{"key": "a", "type": "field", "dataType": "string"}]},
        {"key": "name", "type": "field", "dataType": "string"}
    ], "binds": [{"path": "name", "required": "true"}]});
    let data = HashMap::from([
        ("under".into(), json!([])),
        ("over".into(), json!([{"a": "x"}, {"a": "y"}])),
    ]);
    for trigger in [EvalTrigger::Continuous, EvalTrigger::Submit] {
        let result = evaluate(&def, &data, &EvalOptions::default().trigger(trigger));
        for style in [
            formspec_core::JsonWireStyle::JsCamel,
            formspec_core::JsonWireStyle::PythonSnake,
        ] {
            let wire = formspec_eval::evaluation_result_to_json_value_styled(&result, style);
            let findings = wire["validations"].as_array().unwrap();
            for (path, code) in [("under", "MIN_REPEAT"), ("over", "MAX_REPEAT")] {
                let finding = findings.iter().find(|v| v["code"] == code).unwrap();
                assert_eq!(finding["path"], json!(path));
                assert!(finding.get("source").is_none(), "{code}: {finding}");
            }
            let required = findings.iter().find(|v| v["code"] == "REQUIRED").unwrap();
            assert_eq!(required["source"], json!("bind"));
        }
    }
}

/// Core §4.2.3: named sets take precedence over inline options, including inside repeats.
#[test]
fn authored_definition_resolves_named_option_sets() {
    let def = json!({
        "items": [
            {"key": "state", "type": "field", "dataType": "choice", "optionSet": "states",
             "options": [{"value": "ZZ", "label": "Wrong inline"}]},
            {"key": "rows", "type": "group", "repeatable": true, "children": [
                {"key": "picks", "type": "field", "dataType": "multiChoice", "optionSet": "colors"}
            ]}
        ],
        "optionSets": {
            "states": {"options": [{"value": "NJ", "label": "New Jersey"}]},
            "colors": [{"value": "red", "label": "Red"}]
        }
    });
    let authored = def.clone();
    for (state, picks, expected_paths) in [
        ("ZZ", json!(["red", "teal"]), vec!["rows[0].picks", "state"]),
        ("NJ", json!(["red"]), vec![]),
    ] {
        let data = HashMap::from([
            ("state".into(), json!(state)),
            ("rows".into(), json!([{"picks": picks}])),
        ]);
        let result = evaluate(&def, &data, &EvalOptions::default());
        let mut paths: Vec<_> = result.validations.iter().map(|v| v.path.as_str()).collect();
        paths.sort();
        assert_eq!(paths, expected_paths);
        assert!(
            result
                .validations
                .iter()
                .all(|v| v.code.as_wire_str() == "TYPE_MISMATCH")
        );
        assert_eq!(
            def, authored,
            "evaluation must preserve the authored Definition"
        );
    }
}

/// Core §4.2.3: the pre-fill lock applies even without a resolved value or with readonly:false.
#[test]
fn authored_definition_prepopulate_lock_reaches_readonly_and_fel() {
    let def = json!({
        "items": [
            {"key": "name", "type": "field", "dataType": "string",
             "prePopulate": {"instance": "org", "path": "name", "editable": false}},
            {"key": "editable", "type": "field", "dataType": "string",
             "prePopulate": {"instance": "org", "path": "name"}},
            {"key": "rows", "type": "group", "repeatable": true, "children": [
                {"key": "name", "type": "field", "dataType": "string",
                 "prePopulate": {"instance": "org", "path": "name", "editable": false}}
            ]},
            {"key": "locked", "type": "field", "dataType": "boolean"}
        ],
        "binds": [
            {"path": "name", "readonly": "false"},
            {"path": "rows[*].name", "readonly": "false"},
            {"path": "locked", "calculate": "readonly($name)"}
        ]
    });
    // No instance is supplied: readonly comes from the declaration, not successful prefill.
    let data = HashMap::from([("rows".into(), json!([{}, {}]))]);
    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(result.readonly.get("name"), Some(&true));
    assert_eq!(result.readonly.get("editable"), Some(&false));
    assert_eq!(result.readonly.get("rows[0].name"), Some(&true));
    assert_eq!(result.readonly.get("rows[1].name"), Some(&true));
    assert_eq!(result.values.get("locked"), Some(&json!(true)));
}

#[test]
fn test_evaluate_calculate() {
    let def = json!({
        "items": [
            { "key": "a", "dataType": "integer" },
            { "key": "b", "dataType": "integer" },
            { "key": "total", "dataType": "integer" }
        ],
        "binds": {
            "total": { "calculate": "$a + $b" }
        }
    });

    let mut data = HashMap::new();
    data.insert("a".to_string(), json!(10));
    data.insert("b".to_string(), json!(20));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(result.values.get("total"), Some(&json!(30)));
}

#[test]
fn calculated_value_applies_precision() {
    let def = json!({
        "$formspec": "1.0",
        "url": "test",
        "version": "1.0.0",
        "title": "T",
        "items": [
            { "key": "price", "type": "field", "dataType": "decimal", "label": "P" },
            { "key": "tax", "type": "field", "dataType": "decimal", "label": "Tax" }
        ],
        "binds": [
            { "path": "tax", "calculate": "$price * 0.0725", "precision": 2 }
        ]
    });

    let mut data = HashMap::new();
    data.insert("price".to_string(), json!(99.99));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(result.values.get("tax"), Some(&json!(7.25)));
}

#[test]
fn calculated_money_field_wraps_as_money_object() {
    let def = json!({
        "$formspec": "1.0",
        "url": "test",
        "version": "1.0.0",
        "title": "T",
        "formPresentation": { "defaultCurrency": "USD" },
        "items": [
            { "key": "qty", "type": "field", "dataType": "integer", "label": "Q" },
            { "key": "rate", "type": "field", "dataType": "decimal", "label": "R" },
            { "key": "total", "type": "field", "dataType": "money", "label": "Total" }
        ],
        "binds": [
            { "path": "total", "calculate": "$qty * $rate" }
        ]
    });

    let mut data = HashMap::new();
    data.insert("qty".to_string(), json!(5));
    data.insert("rate".to_string(), json!(19.99));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(
        result.values.get("total"),
        Some(&json!({ "amount": "99.95", "currency": "USD" })),
    );
}

#[test]
fn test_required_validation() {
    let def = json!({
        "items": [
            { "key": "name", "dataType": "string" }
        ],
        "binds": {
            "name": { "required": "true" }
        }
    });

    let data = HashMap::new();
    let result = evaluate(&def, &data, &EvalOptions::default());
    assert!(!result.validations.is_empty());
    assert_eq!(result.validations[0].constraint_kind, "required");
    assert_eq!(result.validations[0].code, "REQUIRED");
    assert!(result.validations[0].message.contains("Required"));
}

#[test]
fn required_boolean_bind_sets_required_state() {
    let def = json!({
        "items": [
            { "key": "zip", "dataType": "string" }
        ],
        "binds": [
            { "path": "zip", "required": true }
        ]
    });

    let result = evaluate(&def, &HashMap::new(), &EvalOptions::default());
    assert_eq!(result.required.get("zip"), Some(&true));
}

#[test]
fn test_relevance_suppresses_validation() {
    let def = json!({
        "items": [
            { "key": "name", "dataType": "string" }
        ],
        "binds": {
            "name": { "required": "true", "relevant": "false" }
        }
    });

    let data = HashMap::new();
    let result = evaluate(&def, &data, &EvalOptions::default());
    assert!(result.validations.is_empty());
    assert!(result.non_relevant.contains(&"name".to_string()));
}

#[test]
fn test_constraint_validation() {
    let def = json!({
        "items": [
            { "key": "age", "dataType": "integer" }
        ],
        "binds": {
            "age": { "constraint": "$age >= 18" }
        }
    });

    let mut data = HashMap::new();
    data.insert("age".to_string(), json!(15));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert!(!result.validations.is_empty());
    assert!(result.validations[0].message.contains("Constraint failed"));
}

#[test]
fn test_relevance_and_inheritance() {
    let def = json!({
        "items": [
            {
                "key": "parent",
                "children": [
                    { "key": "child", "dataType": "string" }
                ]
            }
        ],
        "binds": {
            "parent": { "relevant": "false" },
            "parent.child": { "required": "true" }
        }
    });

    let data = HashMap::new();
    let result = evaluate(&def, &data, &EvalOptions::default());

    assert!(
        result.non_relevant.contains(&"parent".to_string()),
        "parent should be non-relevant"
    );
    assert!(
        result.non_relevant.contains(&"parent.child".to_string()),
        "child should be non-relevant due to parent"
    );
    assert!(
        result.validations.is_empty(),
        "no validations when parent is non-relevant"
    );
}

// ── NRB modes ────────────────────────────────────────────────

#[test]
fn test_nrb_remove_mode() {
    let def = json!({
        "items": [
            { "key": "hidden", "dataType": "string" }
        ],
        "binds": {
            "hidden": { "relevant": "false" }
        },
        "nonRelevantBehavior": "remove"
    });

    let mut data = HashMap::new();
    data.insert("hidden".to_string(), json!("secret"));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert!(
        !result.values.contains_key("hidden"),
        "non-relevant field should be removed in 'remove' mode"
    );
}

#[test]
fn test_nrb_empty_mode() {
    let def = json!({
        "items": [
            { "key": "hidden", "dataType": "string" }
        ],
        "binds": {
            "hidden": { "relevant": "false", "nonRelevantBehavior": "empty" }
        }
    });

    let mut data = HashMap::new();
    data.insert("hidden".to_string(), json!("secret"));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(
        result.values.get("hidden"),
        Some(&Value::Null),
        "non-relevant field should be null in 'empty' mode"
    );
}

#[test]
fn test_nrb_keep_mode() {
    let def = json!({
        "items": [
            { "key": "hidden", "dataType": "string" }
        ],
        "binds": {
            "hidden": { "relevant": "false", "nonRelevantBehavior": "keep" }
        }
    });

    let mut data = HashMap::new();
    data.insert("hidden".to_string(), json!("secret"));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(
        result.values.get("hidden"),
        Some(&json!("secret")),
        "non-relevant field should keep value in 'keep' mode"
    );
}

// ── Variable evaluation ──────────────────────────────────────

#[test]
fn test_variable_evaluation_order() {
    let def = json!({
        "items": [
            { "key": "result", "dataType": "integer" }
        ],
        "binds": {
            "result": { "calculate": "@total" }
        },
        "variables": [
            { "name": "base", "expression": "10" },
            { "name": "total", "expression": "@base * 2" }
        ]
    });

    let data = HashMap::new();
    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(
        result.values.get("result"),
        Some(&json!(20)),
        "variable chain should evaluate correctly"
    );
}

// ── Whitespace normalization ─────────────────────────────────

#[test]
fn letter_case_normalizes_batch_input_before_expressions_and_validation() {
    let definition = fel_core::exact_json::from_str(include_str!(
        "../../../../tests/conformance/suite/fixtures/parity-letter-case.definition.json"
    ))
    .unwrap();
    let data = json!({
        "registry": " straße 7 ", "notes": "ΟΣ", "preserved": "MiXeD",
        "unchanged": "MiXeD", "offices": [{"code": "aB"}, {"code": "Cd"}]
    });
    let expected = json!({
        "registry": "STRASSE7", "notes": "ος", "preserved": "MiXeD",
        "unchanged": "MiXeD", "offices": [{"code": "AB"}, {"code": "CD"}]
    });
    let result = evaluate(
        &definition,
        &data.as_object().unwrap().clone().into_iter().collect(),
        &EvalOptions::default(),
    );
    assert_eq!(result.data, expected);
    assert!(result.validations.is_empty(), "{:?}", result.validations);
}

#[test]
fn test_whitespace_trim() {
    let def = json!({
        "items": [
            { "key": "name", "dataType": "string" }
        ],
        "binds": {
            "name": { "whitespace": "trim" }
        }
    });

    let mut data = HashMap::new();
    data.insert("name".to_string(), json!("  hello world  "));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(
        result.values.get("name"),
        Some(&json!("hello world")),
        "trim should remove leading/trailing whitespace"
    );
}

#[test]
fn test_whitespace_normalize() {
    let def = json!({
        "items": [
            { "key": "name", "dataType": "string" }
        ],
        "binds": {
            "name": { "whitespace": "normalize" }
        }
    });

    let mut data = HashMap::new();
    data.insert("name".to_string(), json!("  hello   world  "));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(
        result.values.get("name"),
        Some(&json!("hello world")),
        "normalize should collapse whitespace runs to single space"
    );
}

#[test]
fn test_whitespace_remove() {
    let def = json!({
        "items": [
            { "key": "code", "dataType": "string" }
        ],
        "binds": {
            "code": { "whitespace": "remove" }
        }
    });

    let mut data = HashMap::new();
    data.insert("code".to_string(), json!("AB CD EF"));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(
        result.values.get("code"),
        Some(&json!("ABCDEF")),
        "remove should strip all whitespace"
    );
}

// ── Full processing model integration ────────────────────────

#[test]
fn test_full_processing_model_integration() {
    let def = json!({
        "items": [
            { "key": "showDetails", "dataType": "boolean" },
            {
                "key": "details",
                "children": [
                    { "key": "firstName", "dataType": "string" },
                    { "key": "lastName", "dataType": "string" },
                    { "key": "fullName", "dataType": "string" }
                ]
            }
        ],
        "binds": {
            "details": { "relevant": "$showDetails" },
            "details.firstName": { "required": "true" },
            "details.lastName": { "required": "true" },
            "details.fullName": { "calculate": "$details.firstName & \" \" & $details.lastName" }
        }
    });

    let mut data = HashMap::new();
    data.insert("showDetails".to_string(), json!(false));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert!(result.non_relevant.contains(&"details".to_string()));
    assert!(
        result
            .non_relevant
            .contains(&"details.firstName".to_string())
    );
    assert!(
        result
            .non_relevant
            .contains(&"details.lastName".to_string())
    );
    assert!(result.validations.is_empty());

    let mut data2 = HashMap::new();
    data2.insert("showDetails".to_string(), json!(true));
    data2.insert("details.firstName".to_string(), json!("John"));
    data2.insert("details.lastName".to_string(), json!("Doe"));

    let result2 = evaluate(&def, &data2, &EvalOptions::default());
    assert!(result2.non_relevant.is_empty());
    assert!(result2.validations.is_empty());
    assert_eq!(
        result2.values.get("details.fullName"),
        Some(&json!("John Doe"))
    );
}

// ── Shape validation ─────────────────────────────────────────

#[test]
fn shape_failing_constraint_produces_validation_result() {
    let def = json!({
        "items": [
            { "key": "a", "dataType": "integer" },
            { "key": "b", "dataType": "integer" }
        ],
        "shapes": [{
            "target": "b",
            "constraint": "$a > $b",
            "severity": "error",
            "message": "a must exceed b"
        }]
    });

    let mut data = HashMap::new();
    data.insert("a".to_string(), json!(1));
    data.insert("b".to_string(), json!(10));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(result.validations.len(), 1, "one shape violation expected");
    assert_eq!(result.validations[0].constraint_kind, "shape");
    assert_eq!(result.validations[0].path, "b");
    assert_eq!(result.validations[0].message, "a must exceed b");
    assert_eq!(result.validations[0].severity, "error");
}

#[test]
fn shape_severity_warning_is_propagated() {
    let def = json!({
        "items": [
            { "key": "score", "dataType": "integer" }
        ],
        "shapes": [{
            "target": "score",
            "constraint": "$score > 50",
            "severity": "warning",
            "message": "Score is low"
        }]
    });

    let mut data = HashMap::new();
    data.insert("score".to_string(), json!(30));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(result.validations.len(), 1);
    assert_eq!(
        result.validations[0].severity, "warning",
        "shape severity must be 'warning' when declared as such"
    );
}

#[test]
fn shape_active_when_false_suppresses_validation() {
    let def = json!({
        "items": [
            { "key": "mode", "dataType": "string" },
            { "key": "value", "dataType": "integer" }
        ],
        "shapes": [{
            "target": "value",
            "constraint": "$value > 0",
            "activeWhen": "$mode = 'strict'",
            "severity": "error",
            "message": "Value must be positive in strict mode"
        }]
    });

    let mut data = HashMap::new();
    data.insert("mode".to_string(), json!("relaxed"));
    data.insert("value".to_string(), json!(-5));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert!(
        result.validations.is_empty(),
        "shape must not fire when activeWhen evaluates to false"
    );
}

#[test]
fn shape_active_when_true_allows_validation() {
    let def = json!({
        "items": [
            { "key": "mode", "dataType": "string" },
            { "key": "value", "dataType": "integer" }
        ],
        "shapes": [{
            "target": "value",
            "constraint": "$value > 0",
            "activeWhen": "$mode = 'strict'",
            "severity": "error",
            "message": "Value must be positive"
        }]
    });

    let mut data = HashMap::new();
    data.insert("mode".to_string(), json!("strict"));
    data.insert("value".to_string(), json!(-5));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(result.validations.len(), 1);
    assert_eq!(result.validations[0].message, "Value must be positive");
}

#[test]
fn shape_passing_constraint_produces_no_result() {
    let def = json!({
        "items": [
            { "key": "x", "dataType": "integer" }
        ],
        "shapes": [{
            "target": "x",
            "constraint": "$x > 0",
            "severity": "error",
            "message": "Must be positive"
        }]
    });

    let mut data = HashMap::new();
    data.insert("x".to_string(), json!(42));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert!(
        result.validations.is_empty(),
        "passing shape constraint must not produce a validation result"
    );
}

#[test]
fn shape_composition_operators_follow_ts_null_semantics() {
    let def = json!({
        "items": [
            { "key": "age", "dataType": "integer" },
            { "key": "contactEmail", "dataType": "string" },
            { "key": "contactPhone", "dataType": "string" },
            { "key": "amount", "dataType": "integer" },
            { "key": "optA", "dataType": "boolean" },
            { "key": "optB", "dataType": "boolean" }
        ],
        "shapes": [
            {
                "id": "adultCheck",
                "target": "#",
                "message": "Must be adult",
                "constraint": "$age >= 18"
            },
            {
                "id": "contactCheck",
                "target": "#",
                "message": "Need contact info",
                "or": ["present($contactEmail)", "present($contactPhone)"]
            },
            {
                "id": "composedEligibility",
                "target": "#",
                "message": "Composite failed",
                "and": ["adultCheck", "contactCheck"]
            },
            {
                "id": "datesDiffer",
                "target": "#",
                "message": "Dates must differ",
                "not": "$amount > 0"
            },
            {
                "id": "exactlyOne",
                "target": "#",
                "message": "Select exactly one",
                "xone": ["$optA = true", "$optB = true", "$age > 99"]
            }
        ]
    });

    let mut data = HashMap::new();
    data.insert("contactEmail".to_string(), json!("person@example.org"));
    data.insert("optA".to_string(), json!(true));

    let result = evaluate(&def, &data, &EvalOptions::default());

    assert!(
        result
            .validations
            .iter()
            .all(|validation| validation.message != "Composite failed"),
        "null adultCheck should pass inside and-composition when contactCheck passes"
    );
    assert!(
        result
            .validations
            .iter()
            .all(|validation| validation.message != "Need contact info"),
        "or-composition should pass when one branch passes"
    );
    assert!(
        result
            .validations
            .iter()
            .all(|validation| validation.message != "Dates must differ"),
        "not-composition should pass when the inner comparison is null"
    );
    assert!(
        result
            .validations
            .iter()
            .all(|validation| validation.message != "Select exactly one"),
        "xone should count one true branch and ignore null branches"
    );
}

// ── Constraint edge cases ────────────────────────────────────

#[test]
fn constraint_returning_true_passes() {
    let def = json!({
        "items": [
            { "key": "age", "dataType": "integer" }
        ],
        "binds": {
            "age": { "constraint": "$age >= 18" }
        }
    });

    let mut data = HashMap::new();
    data.insert("age".to_string(), json!(21));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert!(
        result.validations.is_empty(),
        "constraint returning true must produce no validation error"
    );
}

#[test]
fn constraint_returning_null_passes() {
    let def = json!({
        "items": [
            { "key": "age", "dataType": "integer" }
        ],
        "binds": {
            "age": { "constraint": "$age >= 18" }
        }
    });

    let data = HashMap::new();

    let result = evaluate(&def, &data, &EvalOptions::default());
    let constraint_violations: Vec<_> = result
        .validations
        .iter()
        .filter(|v| v.message.contains("Constraint"))
        .collect();
    assert!(
        constraint_violations.is_empty(),
        "constraint returning null must pass (spec S3.8 L1575)"
    );
}

#[test]
fn bind_constraint_uses_constraint_message_when_present() {
    let def = json!({
        "items": [
            { "key": "amount", "dataType": "integer" }
        ],
        "binds": {
            "amount": {
                "constraint": "$amount > 0",
                "constraintMessage": "Must be positive"
            }
        }
    });

    let mut data = HashMap::new();
    data.insert("amount".to_string(), json!(0));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(result.validations.len(), 1);
    assert_eq!(result.validations[0].message, "Must be positive");
}

#[test]
fn bind_constraint_and_message_see_the_repeat_row() {
    let def = json!({
        "items": [{
            "key": "rows", "type": "group", "repeatable": true,
            "children": [{ "key": "position", "type": "field", "dataType": "integer" }]
        }],
        "binds": [{
            "path": "rows[*].position",
            "constraint": "$ = @index and @current.position = $",
            "constraintMessage": "Row {{@index}} of {{@count}}"
        }]
    });

    let mut data = HashMap::new();
    data.insert(
        "rows".to_string(),
        json!([{ "position": 1 }, { "position": 5 }]),
    );

    let result = evaluate(&def, &data, &EvalOptions::default());
    let failures: Vec<_> = result
        .validations
        .iter()
        .map(|v| (v.path.as_str(), v.message.as_str()))
        .collect();
    assert_eq!(failures, vec![("rows[1].position", "Row 2 of 2")]);
}

#[test]
fn wildcard_shape_on_an_empty_field_still_sees_null_not_the_row() {
    let def = json!({
        "items": [{
            "key": "rows", "type": "group", "repeatable": true,
            "children": [{ "key": "email", "type": "field", "dataType": "string" }]
        }],
        "shapes": [{ "id": "blank-ok", "target": "rows[*].email", "constraint": "$ = null", "message": "Must be blank" }]
    });

    let mut data = HashMap::new();
    data.insert("rows".to_string(), json!([{ "other": "x" }]));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(
        result.validations,
        vec![],
        "an absent field is null, as it is for a concrete target"
    );
}

#[test]
fn a_nested_wildcard_shape_reaches_its_parent_row() {
    let def = json!({
        "items": [{
            "key": "rows", "type": "group", "repeatable": true,
            "children": [
                { "key": "label", "type": "field", "dataType": "string" },
                {
                    "key": "inner", "type": "group", "repeatable": true,
                    "children": [{ "key": "qty", "type": "field", "dataType": "integer" }]
                }
            ]
        }],
        "shapes": [{
            "id": "inner-check", "target": "rows[*].inner[*].qty", "constraint": "false",
            "message": "{{parent().label}} row {{@index}} of {{@count}}"
        }]
    });

    let mut data = HashMap::new();
    data.insert(
        "rows".to_string(),
        json!([
            { "label": "outerA", "inner": [{ "qty": 1 }, { "qty": 2 }] },
            { "label": "outerB", "inner": [{ "qty": 3 }] }
        ]),
    );

    let result = evaluate(&def, &data, &EvalOptions::default());
    let messages: Vec<_> = result
        .validations
        .iter()
        .map(|v| v.message.as_str())
        .collect();
    // The outer row moves with the inner one: outerB's inner row reads outerB, not the row before it.
    assert_eq!(
        messages,
        vec![
            "outerA row 1 of 2",
            "outerA row 2 of 2",
            "outerB row 1 of 1"
        ]
    );
}

#[test]
fn required_with_empty_string_fails() {
    let def = json!({
        "items": [
            { "key": "name", "dataType": "string" }
        ],
        "binds": {
            "name": { "required": "true" }
        }
    });

    let mut data = HashMap::new();
    data.insert("name".to_string(), json!(""));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(
        result.validations.len(),
        1,
        "empty string must fail required check"
    );
    assert_eq!(result.validations[0].constraint_kind, "required");
    assert!(result.validations[0].message.contains("Required"));
}

#[test]
fn required_preserves_whitespace_by_default() {
    let def = json!({
        "items": [
            { "key": "name", "dataType": "string" }
        ],
        "binds": {
            "name": { "required": "true" }
        }
    });

    let mut data = HashMap::new();
    data.insert("name".to_string(), json!("   "));

    let result = evaluate(&def, &data, &EvalOptions::default());
    // Core §4.3.1 applies an authored whitespace transform before validation.
    assert!(result.validations.is_empty());
}

// ── Calculate continues when non-relevant ────────────────────

#[test]
fn calculate_continues_when_non_relevant() {
    let def = json!({
        "items": [
            { "key": "hidden", "dataType": "integer" },
            { "key": "visible", "dataType": "integer" }
        ],
        "binds": {
            "hidden": { "relevant": "false", "calculate": "1 + 1", "nonRelevantBehavior": "keep" },
            "visible": { "calculate": "$hidden * 10" }
        }
    });

    let data = HashMap::new();

    let result = evaluate(&def, &data, &EvalOptions::default());

    assert!(result.non_relevant.contains(&"hidden".to_string()));
    assert_eq!(
        result.values.get("visible"),
        Some(&json!(20)),
        "non-relevant field's calculated value must be available to downstream expressions"
    );
    assert_eq!(
        result.values.get("hidden"),
        Some(&json!(2)),
        "non-relevant field with NRB=keep should retain its calculated value"
    );
}

#[test]
fn non_relevant_field_suppresses_validation_even_with_calculate() {
    let def = json!({
        "items": [
            { "key": "field", "dataType": "integer" }
        ],
        "binds": {
            "field": {
                "relevant": "false",
                "calculate": "0 - 5",
                "constraint": "$field > 0",
                "nonRelevantBehavior": "keep"
            }
        }
    });

    let data = HashMap::new();
    let result = evaluate(&def, &data, &EvalOptions::default());

    assert!(
        result.validations.is_empty(),
        "validation must be suppressed for non-relevant fields even when calculate runs"
    );
}

// ── Array-style binds ────────────────────────────────────────

#[test]
fn array_style_binds_are_resolved() {
    let def = json!({
        "items": [
            { "key": "name", "dataType": "string" },
            { "key": "greeting", "dataType": "string" }
        ],
        "binds": [
            { "path": "name", "required": "true" },
            { "path": "greeting", "calculate": "'Hello ' & $name" }
        ]
    });

    let mut data = HashMap::new();
    data.insert("name".to_string(), json!("Alice"));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(
        result.values.get("greeting"),
        Some(&json!("Hello Alice")),
        "array-style binds should be resolved and calculate should work"
    );
}

#[test]
fn array_style_binds_required_validation() {
    let def = json!({
        "items": [
            { "key": "email", "dataType": "string" }
        ],
        "binds": [
            { "path": "email", "required": "true" }
        ]
    });

    let data = HashMap::new();

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(
        result.validations.len(),
        1,
        "required validation must work with array-style binds"
    );
    assert!(result.validations[0].message.contains("Required"));
}

// ── json_to_fel / fel_to_json round-trip ─────────────────────

#[test]
fn round_trip_null() {
    use serde_json::json;
    let json_val = json!(null);
    let fel_val = fel_core::json_to_fel(&json_val);
    let back = fel_core::fel_to_json(&fel_val);
    assert_eq!(back, json_val);
}

#[test]
fn round_trip_boolean_true() {
    use serde_json::json;
    let json_val = json!(true);
    let fel_val = fel_core::json_to_fel(&json_val);
    let back = fel_core::fel_to_json(&fel_val);
    assert_eq!(back, json_val);
}

#[test]
fn round_trip_boolean_false() {
    use serde_json::json;
    let json_val = json!(false);
    let fel_val = fel_core::json_to_fel(&json_val);
    let back = fel_core::fel_to_json(&fel_val);
    assert_eq!(back, json_val);
}

#[test]
fn round_trip_string() {
    use serde_json::json;
    let json_val = json!("hello world");
    let fel_val = fel_core::json_to_fel(&json_val);
    let back = fel_core::fel_to_json(&fel_val);
    assert_eq!(back, json_val);
}

#[test]
fn round_trip_number_integer() {
    use serde_json::json;
    let json_val = json!(42);
    let fel_val = fel_core::json_to_fel(&json_val);
    let back = fel_core::fel_to_json(&fel_val);
    assert_eq!(back, json_val);
}

#[test]
fn round_trip_number_decimal() {
    use serde_json::json;
    let json_val = json!(12.34);
    let fel_val = fel_core::json_to_fel(&json_val);
    let back = fel_core::fel_to_json(&fel_val);
    let back_f = back.as_f64().expect("should be a number");
    assert!(
        (back_f - 12.34).abs() < 0.001,
        "decimal round-trip: got {back_f}"
    );
}

#[test]
fn round_trip_array() {
    use serde_json::json;
    let json_val = json!([1, "two", true, null]);
    let fel_val = fel_core::json_to_fel(&json_val);
    let back = fel_core::fel_to_json(&fel_val);
    assert_eq!(back.as_array().unwrap().len(), 4);
    assert_eq!(back[0], json!(1));
    assert_eq!(back[1], json!("two"));
    assert_eq!(back[2], json!(true));
    assert_eq!(back[3], json!(null));
}

#[test]
fn round_trip_object() {
    use serde_json::json;
    let json_val = json!({"name": "Alice", "age": 30});
    let fel_val = fel_core::json_to_fel(&json_val);
    let back = fel_core::fel_to_json(&fel_val);
    assert_eq!(back.get("name"), Some(&json!("Alice")));
    assert_eq!(back.get("age"), Some(&json!(30)));
}

#[test]
fn round_trip_money() {
    use rust_decimal::Decimal;
    use rust_decimal::prelude::FromPrimitive;
    use serde_json::json;
    let money = fel_core::Value::Money(fel_core::Money {
        amount: Decimal::from_f64(99.99).unwrap(),
        currency: fel_core::CurrencyCode::parse("USD").expect("USD"),
    });
    let json_val = fel_core::fel_to_json(&money);
    assert_eq!(json_val.get("currency"), Some(&json!("USD")));
    let amount_json = json_val.get("amount").expect("amount field");
    let parsed = match amount_json {
        serde_json::Value::String(s) => Decimal::from_str_exact(s).expect("decimal string"),
        serde_json::Value::Number(n) => {
            Decimal::from_f64(n.as_f64().expect("f64")).expect("decimal")
        }
        other => panic!("unexpected amount JSON: {other:?}"),
    };
    let expected = Decimal::from_f64(99.99).unwrap();
    assert!(
        (parsed - expected).abs() < Decimal::from_str_exact("0.01").unwrap(),
        "money amount round-trip"
    );
}

#[test]
fn round_trip_date() {
    use serde_json::json;
    let date = fel_core::Value::Date(fel_core::Date::Date {
        year: 2025,
        month: 6,
        day: 15,
    });
    let json_val = fel_core::fel_to_json(&date);
    assert_eq!(json_val, json!("2025-06-15"));
}

// ── Repeatable groups / indexed paths ────────────────────────

#[test]
fn repeatable_group_with_indexed_binds() {
    let def = json!({
        "items": [
            {
                "key": "items",
                "children": [
                    { "key": "qty", "dataType": "integer" },
                    { "key": "price", "dataType": "decimal" },
                    { "key": "total", "dataType": "decimal" }
                ]
            }
        ],
        "binds": {
            "items.total": { "calculate": "$items.qty * $items.price" }
        }
    });

    let mut data = HashMap::new();
    data.insert("items.qty".to_string(), json!(3));
    data.insert("items.price".to_string(), json!(10));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(
        result.values.get("items.total"),
        Some(&json!(30)),
        "repeatable group child calculate should evaluate"
    );
}

// ── ValidationResult field specifics ─────────────────────────

#[test]
fn validation_result_required_kind_is_bind() {
    let def = json!({
        "items": [
            { "key": "name", "dataType": "string" }
        ],
        "binds": {
            "name": { "required": "true" }
        }
    });

    let data = HashMap::new();
    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(result.validations.len(), 1);
    assert_eq!(
        result.validations[0].constraint_kind, "required",
        "required violations should have constraint_kind='required'"
    );
    assert_eq!(result.validations[0].code, "REQUIRED");
    assert_eq!(result.validations[0].severity, "error");
}

#[test]
fn validation_result_constraint_kind_is_bind() {
    let def = json!({
        "items": [
            { "key": "age", "dataType": "integer" }
        ],
        "binds": {
            "age": { "constraint": "$age >= 0" }
        }
    });

    let mut data = HashMap::new();
    data.insert("age".to_string(), json!(-1));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(result.validations.len(), 1);
    assert_eq!(
        result.validations[0].constraint_kind, "constraint",
        "constraint violations should have constraint_kind='constraint'"
    );
    assert_eq!(result.validations[0].code, "CONSTRAINT_FAILED");
}

#[test]
fn validation_result_shape_kind_is_shape() {
    let def = json!({
        "items": [
            { "key": "x", "dataType": "integer" }
        ],
        "shapes": [{
            "target": "x",
            "constraint": "$x > 100",
            "severity": "error",
            "message": "x too small"
        }]
    });

    let mut data = HashMap::new();
    data.insert("x".to_string(), json!(5));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(result.validations.len(), 1);
    assert_eq!(
        result.validations[0].constraint_kind, "shape",
        "shape violations should have constraint_kind='shape'"
    );
}

// ── Variable scope ───────────────────────────────────────────

#[test]
fn variable_scoped_to_non_ancestor_is_invisible() {
    let def = json!({
        "items": [
            { "key": "result", "dataType": "integer" },
            { "key": "local", "type": "group", "children": [] }
        ],
        "binds": {
            "result": { "calculate": "@scoped_var" }
        },
        "variables": [
            { "name": "scoped_var", "expression": "42", "scope": "local" }
        ]
    });

    let data = HashMap::new();
    let result = evaluate(&def, &data, &EvalOptions::default());

    let val = result.values.get("result");
    assert!(
        val.is_none() || val == Some(&Value::Null),
        "scoped variable at non-ancestor 'local' should not be visible to 'result'"
    );
    assert_eq!(result.variables.get("scoped_var"), Some(&json!(42)));
}

// ── Required edge cases ──────────────────────────────────────

#[test]
fn required_with_zero_passes() {
    let def = json!({
        "items": [{ "key": "count", "dataType": "integer" }],
        "binds": { "count": { "required": "true" } }
    });
    let mut data = HashMap::new();
    data.insert("count".to_string(), json!(0));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert!(
        result.validations.is_empty(),
        "0 is not empty — required should pass"
    );
}

#[test]
fn required_with_false_passes() {
    let def = json!({
        "items": [{ "key": "flag", "dataType": "boolean" }],
        "binds": { "flag": { "required": "true" } }
    });
    let mut data = HashMap::new();
    data.insert("flag".to_string(), json!(false));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert!(
        result.validations.is_empty(),
        "false is not empty — required should pass"
    );
}

#[test]
fn required_with_empty_array_fails() {
    let def = json!({
        "items": [{ "key": "tags", "dataType": "string" }],
        "binds": { "tags": { "required": "true" } }
    });
    let mut data = HashMap::new();
    data.insert("tags".to_string(), json!([]));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(
        result.validations.len(),
        1,
        "empty array is empty — required should fail"
    );
    assert_eq!(result.validations[0].constraint_kind, "required");
}

#[test]
fn required_with_empty_object_passes() {
    // Empty object is not in the spec's 'empty' list — required should NOT fire.
    // (TYPE_MISMATCH may still fire since {} is not a string, but that's a separate concern.)
    let def = json!({
        "items": [{ "key": "meta", "dataType": "string" }],
        "binds": { "meta": { "required": "true" } }
    });
    let mut data = HashMap::new();
    data.insert("meta".to_string(), json!({}));

    let result = evaluate(&def, &data, &EvalOptions::default());
    let required_errors: Vec<_> = result
        .validations
        .iter()
        .filter(|r| r.code == "REQUIRED")
        .collect();
    assert!(
        required_errors.is_empty(),
        "empty object is not in the spec's 'empty' list — required should pass"
    );
}

#[test]
fn required_with_non_empty_array_passes() {
    // Non-empty array passes required. TYPE_MISMATCH may fire (array is not a string),
    // but required should NOT.
    let def = json!({
        "items": [{ "key": "tags", "dataType": "string" }],
        "binds": { "tags": { "required": "true" } }
    });
    let mut data = HashMap::new();
    data.insert("tags".to_string(), json!(["a"]));

    let result = evaluate(&def, &data, &EvalOptions::default());
    let required_errors: Vec<_> = result
        .validations
        .iter()
        .filter(|r| r.code == "REQUIRED")
        .collect();
    assert!(
        required_errors.is_empty(),
        "non-empty array passes required"
    );
}

// ── Multiple shapes same path ────────────────────────────────

#[test]
fn multiple_shapes_same_path_accumulate() {
    let def = json!({
        "items": [
            { "key": "value", "dataType": "integer" }
        ],
        "shapes": [
            {
                "target": "value",
                "constraint": "$value > 0",
                "severity": "error",
                "message": "Must be positive"
            },
            {
                "target": "value",
                "constraint": "$value < 100",
                "severity": "warning",
                "message": "Should be under 100"
            }
        ]
    });

    let mut data = HashMap::new();
    data.insert("value".to_string(), json!(-5));

    let result = evaluate(&def, &data, &EvalOptions::default());
    let shape_results: Vec<&ValidationResult> = result
        .validations
        .iter()
        .filter(|v| v.constraint_kind == "shape")
        .collect();
    assert_eq!(shape_results.len(), 1, "only the > 0 shape should fail");
    assert_eq!(shape_results[0].message, "Must be positive");
    assert_eq!(shape_results[0].severity, "error");
}

#[test]
fn multiple_shapes_both_fail() {
    let def = json!({
        "items": [
            { "key": "value", "dataType": "integer" }
        ],
        "shapes": [
            {
                "target": "value",
                "constraint": "$value > 10",
                "severity": "error",
                "message": "Must be greater than 10"
            },
            {
                "target": "value",
                "constraint": "$value < 0",
                "severity": "warning",
                "message": "Must be negative"
            }
        ]
    });

    let mut data = HashMap::new();
    data.insert("value".to_string(), json!(5));

    let result = evaluate(&def, &data, &EvalOptions::default());
    let shape_results: Vec<&ValidationResult> = result
        .validations
        .iter()
        .filter(|v| v.constraint_kind == "shape")
        .collect();
    assert_eq!(
        shape_results.len(),
        2,
        "both shapes should fire independently"
    );

    let messages: Vec<&str> = shape_results.iter().map(|r| r.message.as_str()).collect();
    assert!(messages.contains(&"Must be greater than 10"));
    assert!(messages.contains(&"Must be negative"));
}

#[test]
fn multiple_shapes_preserve_severities() {
    let def = json!({
        "items": [
            { "key": "score", "dataType": "integer" }
        ],
        "shapes": [
            {
                "target": "score",
                "constraint": "$score >= 0",
                "severity": "error",
                "message": "Score must not be negative"
            },
            {
                "target": "score",
                "constraint": "$score <= 100",
                "severity": "info",
                "message": "Score should be at most 100"
            }
        ]
    });

    let mut data = HashMap::new();
    data.insert("score".to_string(), json!(150));

    let result = evaluate(&def, &data, &EvalOptions::default());
    let shape_results: Vec<&ValidationResult> = result
        .validations
        .iter()
        .filter(|v| v.constraint_kind == "shape")
        .collect();
    assert_eq!(shape_results.len(), 1);
    assert_eq!(shape_results[0].severity, "info");
    assert_eq!(shape_results[0].message, "Score should be at most 100");
}

#[test]
fn shape_suppressed_when_target_non_relevant() {
    let def = json!({
        "items": [
            { "key": "hidden_field", "dataType": "string" }
        ],
        "binds": {
            "hidden_field": { "relevant": "false" }
        },
        "shapes": [
            {
                "target": "hidden_field",
                "constraint": "false",
                "severity": "error",
                "message": "Should never appear"
            }
        ]
    });

    let data = HashMap::new();
    let result = evaluate(&def, &data, &EvalOptions::default());
    let shape_results: Vec<&ValidationResult> = result
        .validations
        .iter()
        .filter(|v| v.constraint_kind == "shape")
        .collect();
    assert!(
        shape_results.is_empty(),
        "shape targeting non-relevant field must be suppressed"
    );
}

#[test]
fn shape_root_target_always_evaluated() {
    let def = json!({
        "items": [
            { "key": "a", "dataType": "integer" }
        ],
        "shapes": [
            {
                "target": "#",
                "constraint": "false",
                "severity": "error",
                "message": "Root shape fires"
            }
        ]
    });

    let mut data = HashMap::new();
    data.insert("a".to_string(), json!(1));
    let result = evaluate(&def, &data, &EvalOptions::default());
    let shape_results: Vec<&ValidationResult> = result
        .validations
        .iter()
        .filter(|v| v.constraint_kind == "shape")
        .collect();
    assert_eq!(shape_results.len(), 1, "root shapes must always fire");
}

#[test]
fn circular_variable_deps_produce_validation_error() {
    let def = json!({
        "items": [
            { "key": "x", "dataType": "integer" }
        ],
        "variables": [
            { "name": "a", "expression": "@b + 1" },
            { "name": "b", "expression": "@a + 1" }
        ]
    });

    let data = HashMap::new();
    let result = evaluate(&def, &data, &EvalOptions::default());
    let cycle_errors: Vec<&ValidationResult> = result
        .validations
        .iter()
        .filter(|v| v.constraint_kind == "definition" && v.message.contains("ircular"))
        .collect();
    assert!(
        !cycle_errors.is_empty(),
        "circular variable deps must produce a validation error"
    );
    assert_eq!(cycle_errors[0].severity, "error");
}

// ── Shape timing (EvalTrigger) ──────────────────────────────

fn shape_timing_def() -> Value {
    json!({
        "items": [
            { "key": "x", "dataType": "integer" }
        ],
        "shapes": [
            {
                "id": "s1",
                "target": "#",
                "timing": "continuous",
                "constraint": "false",
                "severity": "error",
                "message": "Continuous shape"
            },
            {
                "id": "s2",
                "target": "#",
                "timing": "submit",
                "constraint": "false",
                "severity": "error",
                "message": "Submit shape"
            },
            {
                "id": "s3",
                "target": "#",
                "timing": "demand",
                "constraint": "false",
                "severity": "error",
                "message": "Demand shape"
            }
        ]
    })
}

#[test]
fn trigger_continuous_skips_submit_and_demand_shapes() {
    let def = shape_timing_def();
    let data = HashMap::new();
    let result = evaluate(
        &def,
        &data,
        &EvalOptions::default().trigger(EvalTrigger::Continuous),
    );
    let msgs: Vec<&str> = result
        .validations
        .iter()
        .map(|v| v.message.as_str())
        .collect();
    assert!(msgs.contains(&"Continuous shape"));
    assert!(!msgs.contains(&"Submit shape"));
    assert!(!msgs.contains(&"Demand shape"));
}

#[test]
fn trigger_submit_includes_continuous_and_submit_but_not_demand() {
    let def = shape_timing_def();
    let data = HashMap::new();
    let result = evaluate(
        &def,
        &data,
        &EvalOptions::default().trigger(EvalTrigger::Submit),
    );
    let msgs: Vec<&str> = result
        .validations
        .iter()
        .map(|v| v.message.as_str())
        .collect();
    assert!(msgs.contains(&"Continuous shape"));
    assert!(msgs.contains(&"Submit shape"));
    assert!(!msgs.contains(&"Demand shape"));
}

#[test]
fn trigger_disabled_skips_all_validation() {
    let def = shape_timing_def();
    let data = HashMap::new();
    let result = evaluate(
        &def,
        &data,
        &EvalOptions::default().trigger(EvalTrigger::Disabled),
    );
    assert!(
        result.validations.is_empty(),
        "disabled trigger should skip all validation"
    );
}

// ── 9a: excludedValue ────────────────────────────────────────

#[test]
fn excluded_value_null_hides_from_shapes() {
    let def = json!({
        "items": [
            { "key": "show", "dataType": "boolean" },
            { "key": "extra", "dataType": "integer" }
        ],
        "binds": [
            { "path": "extra", "relevant": "$show", "excludedValue": "null", "nonRelevantBehavior": "keep" }
        ],
        "shapes": [{
            "id": "s1", "target": "#", "severity": "error",
            "message": "Extra must be positive",
            "constraint": "$extra == null or $extra > 0"
        }]
    });
    let mut data = HashMap::new();
    data.insert("show".to_string(), json!(false));
    data.insert("extra".to_string(), json!(-5));

    let result = evaluate(&def, &data, &EvalOptions::default());
    let shape_errors: Vec<_> = result
        .validations
        .iter()
        .filter(|v| v.constraint_kind == "shape")
        .collect();
    assert!(
        shape_errors.is_empty(),
        "shape should pass because excluded extra is null in FEL"
    );
    assert_eq!(result.values.get("extra"), Some(&json!(-5)));
}

#[test]
fn eval_result_includes_required_state() {
    let def = json!({
        "$formspec": "1.0",
        "url": "test",
        "version": "1.0.0",
        "title": "T",
        "items": [{ "key": "name", "type": "field", "dataType": "string", "label": "N" }],
        "binds": [{ "path": "name", "required": "true" }],
    });

    let data = HashMap::new();
    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(result.required.get("name"), Some(&true));
}

#[test]
fn eval_result_includes_readonly_state() {
    let def = json!({
        "$formspec": "1.0",
        "url": "test",
        "version": "1.0.0",
        "title": "T",
        "items": [{ "key": "name", "type": "field", "dataType": "string", "label": "N" }],
        "binds": [{ "path": "name", "readonly": "true" }],
    });

    let data = HashMap::new();
    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(result.readonly.get("name"), Some(&true));
}

/// Core §4.3.1: a `calculate` Bind makes its node readonly unless `readonly` is set explicitly.
#[test]
fn calculated_field_is_readonly_unless_readonly_is_explicit() {
    let def = json!({
        "$formspec": "1.0",
        "url": "test",
        "version": "1.0.0",
        "title": "T",
        "items": [
            { "key": "qty", "type": "field", "dataType": "integer", "label": "Qty" },
            { "key": "total", "type": "field", "dataType": "integer", "label": "Total" },
            { "key": "override", "type": "field", "dataType": "integer", "label": "Override" },
            {
                "key": "rows", "type": "group", "label": "Rows", "repeatable": true, "minRepeat": 1,
                "children": [{ "key": "double", "type": "field", "dataType": "integer", "label": "Double" }]
            }
        ],
        "binds": [
            { "path": "total", "calculate": "$qty * 2" },
            { "path": "override", "calculate": "$qty * 3", "readonly": "false" },
            { "path": "rows[*].double", "calculate": "$qty * 2" }
        ],
    });

    // Repeat rows must be supplied by the caller of evaluate.
    let data = HashMap::from([
        ("qty".to_string(), json!(2)),
        ("rows".to_string(), json!([{}])),
    ]);
    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(result.readonly.get("qty"), Some(&false));
    assert_eq!(result.readonly.get("total"), Some(&true));
    assert_eq!(result.readonly.get("override"), Some(&false));
    assert_eq!(result.readonly.get("rows[0].double"), Some(&true));
}

#[test]
fn eval_with_runtime_context_uses_injected_now() {
    let def = json!({
        "$formspec": "1.0",
        "url": "test",
        "version": "1.0.0",
        "title": "T",
        "items": [{ "key": "d", "type": "field", "dataType": "date", "label": "D" }],
        "binds": [{ "path": "d", "calculate": "today()" }],
    });

    let data = HashMap::new();
    let ctx = EvalContext {
        now_iso: Some("2025-06-15T00:00:00".to_string()),
        ..EvalContext::default()
    };
    let result = evaluate(&def, &data, &EvalOptions::default().context(ctx.clone()));
    assert_eq!(result.values.get("d"), Some(&json!("2025-06-15")));
}

#[test]
fn calculate_fixpoint_cross_field_dependency() {
    let def = json!({
        "$formspec": "1.0",
        "url": "test",
        "version": "1.0.0",
        "title": "T",
        "items": [
            { "key": "total", "type": "field", "dataType": "decimal", "label": "Total" },
            { "key": "subtotal", "type": "field", "dataType": "decimal", "label": "Sub" },
            { "key": "qty", "type": "field", "dataType": "decimal", "label": "Qty" }
        ],
        "binds": [
            { "path": "subtotal", "calculate": "$qty * 10" },
            { "path": "total", "calculate": "$subtotal * 1.1" }
        ],
    });

    let mut data = HashMap::new();
    data.insert("qty".into(), json!(5));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(result.values.get("subtotal"), Some(&json!(50)));
    assert_eq!(result.values.get("total"), Some(&json!(55)));
}

// ── 9b: Shape-id composition ─────────────────────────────────

#[test]
fn or_composition_with_shape_id_reference() {
    let def = json!({
        "items": [
            { "key": "email", "dataType": "string" },
            { "key": "phone", "dataType": "string" }
        ],
        "shapes": [
            {
                "id": "hasEmail", "target": "#", "severity": "error",
                "message": "Email required", "constraint": "present($email)"
            },
            {
                "id": "hasPhone", "target": "#", "severity": "error",
                "message": "Phone required", "constraint": "present($phone)"
            },
            {
                "id": "contactable", "target": "#", "severity": "error",
                "message": "Need email or phone",
                "or": ["hasEmail", "hasPhone"]
            }
        ]
    });

    let mut data = HashMap::new();
    data.insert("email".to_string(), json!(null));
    data.insert("phone".to_string(), json!(null));
    let result = evaluate(&def, &data, &EvalOptions::default());
    let contactable_errors: Vec<_> = result
        .validations
        .iter()
        .filter(|v| v.message == "Need email or phone")
        .collect();
    assert_eq!(
        contactable_errors.len(),
        1,
        "should fail when neither present"
    );

    let mut data2 = HashMap::new();
    data2.insert("email".to_string(), json!("a@b.com"));
    data2.insert("phone".to_string(), json!(null));
    let result2 = evaluate(&def, &data2, &EvalOptions::default());
    let contactable_ok: Vec<_> = result2
        .validations
        .iter()
        .filter(|v| v.message == "Need email or phone")
        .collect();
    assert!(contactable_ok.is_empty(), "should pass when email present");
}

#[test]
fn shape_validations_include_shape_id() {
    let def = json!({
        "$formspec": "1.0",
        "url": "test",
        "version": "1.0.0",
        "title": "T",
        "items": [
            { "key": "a", "type": "field", "dataType": "decimal", "label": "A" },
            { "key": "b", "type": "field", "dataType": "decimal", "label": "B" }
        ],
        "shapes": [{
            "id": "ab-check",
            "target": "a",
            "constraint": "$a > $b",
            "message": "A must exceed B"
        }]
    });
    let mut data = HashMap::new();
    data.insert("a".into(), json!(1));
    data.insert("b".into(), json!(10));

    let result = evaluate(&def, &data, &EvalOptions::default());
    let shape_results: Vec<_> = result
        .validations
        .iter()
        .filter(|v| v.shape_id.as_deref() == Some("ab-check"))
        .collect();
    assert!(
        !shape_results.is_empty(),
        "shape validation should include shape_id"
    );
}

#[test]
fn shape_context_evaluated_on_failure() {
    let def = json!({
        "$formspec": "1.0",
        "url": "test",
        "version": "1.0.0",
        "title": "T",
        "items": [
            { "key": "budget", "type": "field", "dataType": "decimal", "label": "Budget" },
            { "key": "spent", "type": "field", "dataType": "decimal", "label": "Spent" }
        ],
        "shapes": [{
            "id": "budget-check",
            "target": "spent",
            "constraint": "$spent <= $budget",
            "message": "Over budget",
            "context": {
                "remaining": "$budget - $spent",
                "overBy": "$spent - $budget"
            }
        }]
    });

    let mut data = HashMap::new();
    data.insert("budget".into(), json!(100));
    data.insert("spent".into(), json!(150));

    let result = evaluate(&def, &data, &EvalOptions::default());
    let shape_result = result
        .validations
        .iter()
        .find(|v| v.shape_id.as_deref() == Some("budget-check"))
        .expect("shape validation should exist");
    let ctx = shape_result
        .context
        .as_ref()
        .expect("context should be populated");
    assert_eq!(ctx.get("remaining"), Some(&json!(-50)));
    assert_eq!(ctx.get("overBy"), Some(&json!(50)));
}

#[test]
fn repeat_calculate_has_access_to_index_and_count() {
    let def = json!({
        "$formspec": "1.0",
        "url": "test",
        "version": "1.0.0",
        "title": "T",
        "items": [
            {
                "key": "items",
                "type": "group",
                "repeatable": true,
                "minRepeat": 2,
                "children": [
                    { "key": "position", "type": "field", "dataType": "string", "label": "Position" }
                ]
            }
        ],
        "binds": [
            { "path": "items[*].position", "calculate": "string(@index) & ' of ' & string(@count)" }
        ]
    });

    let result = evaluate(
        &def,
        &HashMap::from([("items".to_string(), json!([{}, {}]))]),
        &EvalOptions::default(),
    );
    assert_eq!(
        result.values.get("items[0].position"),
        Some(&json!("1 of 2"))
    );
    assert_eq!(
        result.values.get("items[1].position"),
        Some(&json!("2 of 2"))
    );
}

#[test]
fn supplied_empty_rows_satisfy_min_repeat() {
    let def = json!({
        "$formspec": "1.0",
        "url": "test",
        "version": "1.0.0",
        "title": "T",
        "items": [{
            "key": "items",
            "type": "group",
            "repeatable": true,
            "minRepeat": 2,
            "children": [
                { "key": "x", "type": "field", "dataType": "string", "label": "X" }
            ]
        }],
    });

    // Empty rows are supplied in Response data, as required after removing host row counts.
    let data = HashMap::from([("items".to_owned(), json!([{}, {}]))]);
    let result = evaluate(&def, &data, &EvalOptions::default());

    let min_repeat = result
        .validations
        .iter()
        .filter(|v| v.code == "MIN_REPEAT")
        .count();
    assert_eq!(min_repeat, 0);
}

#[test]
fn repeat_field_projection_supports_count_where() {
    // Core §3.2.2 requires an explicit wildcard to read across rows.
    let def = json!({
        "$formspec": "1.0",
        "url": "test",
        "version": "1.0.0",
        "title": "T",
        "items": [
            {
                "key": "rows",
                "type": "group",
                "repeatable": true,
                "minRepeat": 3,
                "children": [
                    { "key": "score", "type": "field", "dataType": "integer", "label": "Score" }
                ]
            },
            { "key": "passing", "type": "field", "dataType": "integer", "label": "Passing" }
        ],
        "binds": [
            { "path": "passing", "calculate": "countWhere($rows[*].score, $ >= 50)" }
        ]
    });

    let mut data = HashMap::new();
    data.insert("rows[0].score".to_string(), json!(80));
    data.insert("rows[1].score".to_string(), json!(30));
    data.insert("rows[2].score".to_string(), json!(50));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(result.values.get("passing"), Some(&json!(2)));
}

#[test]
fn sibling_refs_resolve_to_same_instance() {
    // Core §3.2.2 spells this-row references with the sibling key.
    let def = json!({
        "$formspec": "1.0",
        "url": "test",
        "version": "1.0.0",
        "title": "T",
        "items": [
            {
                "key": "line_items",
                "type": "group",
                "repeatable": true,
                "minRepeat": 2,
                "children": [
                    { "key": "qty", "type": "field", "dataType": "integer", "label": "Qty" },
                    { "key": "price", "type": "field", "dataType": "decimal", "label": "Price" },
                    { "key": "total", "type": "field", "dataType": "decimal", "label": "Total" }
                ]
            }
        ],
        "binds": [
            { "path": "line_items[*].total", "calculate": "$qty * $price" }
        ]
    });

    let mut data = HashMap::new();
    data.insert("line_items[0].qty".to_string(), json!(3));
    data.insert("line_items[0].price".to_string(), json!(10));
    data.insert("line_items[1].qty".to_string(), json!(5));
    data.insert("line_items[1].price".to_string(), json!(20));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(result.values.get("line_items[0].total"), Some(&json!(30)));
    assert_eq!(result.values.get("line_items[1].total"), Some(&json!(100)));
}

#[test]
fn sibling_refs_resolve_to_enclosing_instance() {
    // Core §3.2.2 resolves the outer row field through its enclosing scope.
    let def = json!({
        "$formspec": "1.0",
        "url": "test",
        "version": "1.0.0",
        "title": "T",
        "items": [
            {
                "key": "orders",
                "type": "group",
                "repeatable": true,
                "minRepeat": 2,
                "children": [
                    { "key": "discount_pct", "type": "field", "dataType": "decimal", "label": "Discount %" },
                    {
                        "key": "items",
                        "type": "group",
                        "repeatable": true,
                        "minRepeat": 1,
                        "children": [
                            { "key": "qty", "type": "field", "dataType": "integer", "label": "Qty" },
                            { "key": "unit_price", "type": "field", "dataType": "decimal", "label": "Unit Price" },
                            { "key": "discounted_total", "type": "field", "dataType": "decimal", "label": "Discounted Total" }
                        ]
                    }
                ]
            }
        ],
        "binds": [
            {
                "path": "orders[*].items[*].discounted_total",
                "calculate": "$qty * $unit_price * (1 - $discount_pct / 100)"
            }
        ]
    });

    let mut data = HashMap::new();
    data.insert("orders[0].discount_pct".to_string(), json!(10));
    data.insert("orders[0].items[0].qty".to_string(), json!(2));
    data.insert("orders[0].items[0].unit_price".to_string(), json!(100));
    data.insert("orders[1].discount_pct".to_string(), json!(50));
    data.insert("orders[1].items[0].qty".to_string(), json!(2));
    data.insert("orders[1].items[0].unit_price".to_string(), json!(100));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(
        result.values.get("orders[0].items[0].discounted_total"),
        Some(&json!(180)),
    );
    assert_eq!(
        result.values.get("orders[1].items[0].discounted_total"),
        Some(&json!(100)),
    );
}

#[test]
fn sibling_refs_apply_in_relevance_expressions() {
    // Core §3.2.2 uses the sibling key for a same-row read.
    let def = json!({
        "$formspec": "1.0",
        "url": "test",
        "version": "1.0.0",
        "title": "T",
        "items": [
            {
                "key": "rows",
                "type": "group",
                "repeatable": true,
                "minRepeat": 2,
                "children": [
                    { "key": "show_detail", "type": "field", "dataType": "boolean", "label": "Show" },
                    { "key": "detail", "type": "field", "dataType": "string", "label": "Detail" }
                ]
            }
        ],
        "binds": [
            { "path": "rows[*].detail", "relevant": "$show_detail = true" }
        ]
    });

    let mut data = HashMap::new();
    data.insert("rows[0].show_detail".to_string(), json!(true));
    data.insert("rows[1].show_detail".to_string(), json!(false));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert!(
        !result.non_relevant.contains(&"rows[0].detail".to_string()),
        "row 0 detail should stay relevant",
    );
    assert!(
        result.non_relevant.contains(&"rows[1].detail".to_string()),
        "row 1 detail should be non-relevant",
    );
}

#[test]
fn calculated_field_reacts_to_final_scoped_variable_values() {
    let def = json!({
        "$formspec": "1.0",
        "url": "test",
        "version": "1.0.0",
        "title": "T",
        "variables": [
            {
                "name": "budgetHasLineItems",
                "expression": "not isNull($lineItems[1].category)",
                "scope": "budget"
            }
        ],
        "items": [
            {
                "key": "budget",
                "type": "group",
                "children": [
                    {
                        "key": "lineItems",
                        "type": "group",
                        "repeatable": true,
                        "minRepeat": 2,
                        "children": [
                            { "key": "category", "type": "field", "dataType": "string", "label": "Category" }
                        ]
                    },
                    { "key": "hasLineItems", "type": "field", "dataType": "string", "label": "Has" }
                ]
            }
        ],
        "binds": [
            { "path": "budget.hasLineItems", "calculate": "string(@budgetHasLineItems)" }
        ]
    });

    let mut data = HashMap::new();
    data.insert(
        "budget.lineItems[0].category".to_string(),
        json!("Personnel"),
    );

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(
        result.values.get("budget.hasLineItems"),
        Some(&json!("true"))
    );
}

#[test]
fn calculated_field_reacts_to_final_global_variable_values() {
    let def = json!({
        "$formspec": "1.0",
        "url": "test",
        "version": "1.0.0",
        "title": "T",
        "variables": [
            { "name": "totalDirect", "expression": "money(sum($budget.lineItems[*].subtotal), 'USD')" },
            { "name": "grandTotal", "expression": "@totalDirect" }
        ],
        "items": [
            {
                "key": "budget",
                "type": "group",
                "children": [
                    {
                        "key": "lineItems",
                        "type": "group",
                        "repeatable": true,
                        "minRepeat": 2,
                        "children": [
                            { "key": "quantity", "type": "field", "dataType": "integer", "label": "Qty" },
                            { "key": "unitCost", "type": "field", "dataType": "decimal", "label": "Cost" },
                            { "key": "subtotal", "type": "field", "dataType": "decimal", "label": "Subtotal" }
                        ]
                    },
                    { "key": "requestedAmount", "type": "field", "dataType": "money", "currency": "USD", "label": "Requested" },
                    { "key": "budgetDeviation", "type": "field", "dataType": "money", "currency": "USD", "label": "Deviation" }
                ]
            }
        ],
        "binds": [
            { "path": "budget.lineItems[*].subtotal", "calculate": "$quantity * $unitCost" },
            { "path": "budget.budgetDeviation", "calculate": "money(abs(moneyAmount($budget.requestedAmount) - moneyAmount(@grandTotal)), 'USD')" }
        ]
    });

    let mut data = HashMap::new();
    data.insert("budget.lineItems[0].quantity".to_string(), json!(1));
    data.insert("budget.lineItems[0].unitCost".to_string(), json!(1000));
    data.insert(
        "budget.requestedAmount".to_string(),
        json!({ "amount": 800, "currency": "USD" }),
    );

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(
        result.values.get("budget.budgetDeviation"),
        Some(&json!({ "amount": "200", "currency": "USD" })),
    );
}

#[test]
fn non_relevant_display_calculation_survives_nrb() {
    let def = json!({
        "$formspec": "1.0",
        "url": "test",
        "version": "1.0.0",
        "title": "T",
        "items": [
            { "key": "show", "type": "field", "dataType": "boolean", "label": "Show" },
            { "key": "count", "type": "field", "dataType": "integer", "label": "Count" },
            { "key": "info", "type": "display", "label": "Info" }
        ],
        "binds": [
            { "path": "info", "relevant": "$show = true", "calculate": "format('Items: %s', $count)" }
        ]
    });

    let mut data = HashMap::new();
    data.insert("show".to_string(), json!(false));
    data.insert("count".to_string(), json!(42));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(result.values.get("info"), Some(&json!("Items: 42")));
}

// ── 9c: Default on relevance transition ──────────────────────

#[test]
fn default_applies_on_relevance_transition() {
    let def = json!({
        "items": [
            { "key": "show", "dataType": "boolean" },
            { "key": "amount", "dataType": "decimal" }
        ],
        "binds": [
            { "path": "amount", "relevant": "$show", "default": 0 }
        ]
    });

    let mut data = HashMap::new();
    data.insert("show".to_string(), json!(false));
    let result1 = evaluate(&def, &data, &EvalOptions::default());
    assert!(!result1.values.contains_key("amount"));
}

// ── 9d: Nested bare $ in group bind paths ────────────────────

#[test]
fn bare_dollar_resolves_nested_group_path() {
    let def = json!({
        "items": [
            {
                "type": "group", "key": "expenditures",
                "children": [
                    { "type": "field", "key": "employment", "dataType": "decimal" }
                ]
            }
        ],
        "binds": [
            { "path": "expenditures.employment", "constraint": "$ >= 0", "constraintMessage": "Cannot be negative" }
        ]
    });

    let mut data = HashMap::new();
    data.insert("expenditures".to_string(), json!({"employment": 45000}));
    let result = evaluate(&def, &data, &EvalOptions::default());
    let errors: Vec<_> = result
        .validations
        .iter()
        .filter(|v| v.source == Some(ValidationSource::Bind) && v.message.contains("negative"))
        .collect();
    assert!(errors.is_empty(), "positive value should pass constraint");

    let mut data2 = HashMap::new();
    data2.insert("expenditures".to_string(), json!({"employment": -100}));
    let result2 = evaluate(&def, &data2, &EvalOptions::default());
    let errors2: Vec<_> = result2
        .validations
        .iter()
        .filter(|v| v.source == Some(ValidationSource::Bind) && v.message.contains("negative"))
        .collect();
    assert_eq!(errors2.len(), 1, "negative value should fail constraint");
}

// ── 9e: initialValue ─────────────────────────────────────────

#[test]
fn initial_value_literal_seeds_missing_field() {
    let def = json!({
        "items": [
            { "key": "status", "dataType": "string", "initialValue": "draft" }
        ]
    });

    // Initial values now belong to creation, before evaluating a Response.
    let result = create_response(&def, json!({}), &CreateOptions::default());
    assert_eq!(result.data.get("status"), Some(&json!("draft")));
}

#[test]
fn initial_value_not_applied_when_field_present() {
    let def = json!({
        "items": [
            { "key": "status", "dataType": "string", "initialValue": "draft" }
        ]
    });

    let mut data = HashMap::new();
    data.insert("status".to_string(), json!("final"));
    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(result.values.get("status"), Some(&json!("final")));
}

#[test]
fn initial_value_fel_expression() {
    let def = json!({
        "items": [
            { "key": "base", "dataType": "integer" },
            { "key": "doubled", "dataType": "integer", "initialValue": "=$base * 2" }
        ]
    });

    let result = create_response(&def, json!({"base": 10}), &CreateOptions::default());
    assert_eq!(result.data.get("doubled"), Some(&json!(20)));
}

#[test]
fn initial_value_fel_expression_uses_context_now() {
    let def = json!({
        "items": [
            { "key": "startDate", "dataType": "date", "initialValue": "=today()" }
        ]
    });

    let result = create_response(
        &def,
        json!({}),
        &CreateOptions {
            now_iso: Some("2026-03-22T12:00:00.000Z".to_string()),
            ..CreateOptions::default()
        },
    );
    assert_eq!(result.data.get("startDate"), Some(&json!("2026-03-22")));
}

// ── Wildcard bind paths + per-instance eval ──────────────────

#[test]
fn wildcard_bind_per_instance_calculate() {
    // Core §3.2.2: the Bind targets every row and each expression reads siblings.
    let def = json!({
        "items": [
            {
                "key": "items",
                "repeatable": true,
                "children": [
                    { "key": "qty", "dataType": "integer" },
                    { "key": "price", "dataType": "decimal" },
                    { "key": "total", "dataType": "decimal" }
                ]
            }
        ],
        "binds": {
            "items[*].total": { "calculate": "$qty * $price" }
        }
    });

    let mut data = HashMap::new();
    data.insert("items[0].qty".to_string(), json!(2));
    data.insert("items[0].price".to_string(), json!(10));
    data.insert("items[1].qty".to_string(), json!(5));
    data.insert("items[1].price".to_string(), json!(3));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(
        result.values.get("items[0].total"),
        Some(&json!(20)),
        "instance 0: 2 * 10 = 20"
    );
    assert_eq!(
        result.values.get("items[1].total"),
        Some(&json!(15)),
        "instance 1: 5 * 3 = 15"
    );
}

#[test]
fn wildcard_bind_per_instance_constraint() {
    let def = json!({
        "items": [
            {
                "key": "rows",
                "repeatable": true,
                "children": [
                    { "key": "amount", "dataType": "decimal" }
                ]
            }
        ],
        "binds": {
            "rows[*].amount": {
                "constraint": "$ >= 0",
                "constraintMessage": "Amount must be non-negative"
            }
        }
    });

    let mut data = HashMap::new();
    data.insert("rows[0].amount".to_string(), json!(100));
    data.insert("rows[1].amount".to_string(), json!(-5));
    data.insert("rows[2].amount".to_string(), json!(50));

    let result = evaluate(&def, &data, &EvalOptions::default());
    let errors: Vec<_> = result
        .validations
        .iter()
        .filter(|v| v.source == Some(ValidationSource::Bind) && v.message.contains("non-negative"))
        .collect();
    assert_eq!(errors.len(), 1, "only instance 1 should fail");
    assert_eq!(errors[0].path, "rows[1].amount");
}

#[test]
fn wildcard_shape_target_expands_to_concrete_paths() {
    let def = json!({
        "items": [
            {
                "key": "entries",
                "repeatable": true,
                "children": [
                    { "key": "value", "dataType": "integer" }
                ]
            }
        ],
        "shapes": [{
            "id": "s1",
            "target": "entries[*].value",
            "constraint": "$ > 0",
            "severity": "error",
            "message": "Must be positive"
        }]
    });

    let mut data = HashMap::new();
    data.insert("entries[0].value".to_string(), json!(10));
    data.insert("entries[1].value".to_string(), json!(-3));
    data.insert("entries[2].value".to_string(), json!(7));

    let result = evaluate(&def, &data, &EvalOptions::default());
    let shape_errors: Vec<_> = result
        .validations
        .iter()
        .filter(|v| v.constraint_kind == "shape")
        .collect();
    assert_eq!(shape_errors.len(), 1, "only instance 1 should fail");
    assert_eq!(
        shape_errors[0].path, "entries[1].value",
        "path should be concrete 0-based"
    );
}

#[test]
fn wildcard_shape_row_scoped_sibling_references() {
    let def = json!({
        "items": [
            {
                "key": "rows",
                "repeatable": true,
                "children": [
                    { "key": "start", "dataType": "integer" },
                    { "key": "end", "dataType": "integer" }
                ]
            }
        ],
        "shapes": [{
            "id": "s1",
            "target": "rows[*].end",
            // Core §3.2.2: [*] reads every row. This Shape compares siblings.
            "constraint": "$end > $start",
            "severity": "error",
            "message": "End must exceed start"
        }]
    });

    let mut data = HashMap::new();
    data.insert("rows[0].start".to_string(), json!(1));
    data.insert("rows[0].end".to_string(), json!(10));
    data.insert("rows[1].start".to_string(), json!(20));
    data.insert("rows[1].end".to_string(), json!(5));

    let result = evaluate(&def, &data, &EvalOptions::default());
    let shape_errors: Vec<_> = result
        .validations
        .iter()
        .filter(|v| v.constraint_kind == "shape" && v.message == "End must exceed start")
        .collect();
    assert_eq!(shape_errors.len(), 1, "only row 1 should fail");
    assert_eq!(shape_errors[0].path, "rows[1].end");
}

#[test]
fn wildcard_shape_bare_dollar_gt_sibling_row_ref() {
    // Core §3.2.2: a bare sibling key reads the same row and [*] reads every row.
    let def = json!({
        "items": [
            {
                "key": "rows",
                "repeatable": true,
                "children": [
                    { "key": "min", "dataType": "integer" },
                    { "key": "max", "dataType": "integer" }
                ]
            }
        ],
        "shapes": [{
            "id": "s1",
            "target": "rows[*].max",
            "constraint": "$ > $min",
            "severity": "error",
            "message": "Max must exceed min",
            "code": "RANGE"
        }]
    });

    let mut data = HashMap::new();
    data.insert("rows[0].min".to_string(), json!(1));
    data.insert("rows[0].max".to_string(), json!(10));
    data.insert("rows[1].min".to_string(), json!(5));
    data.insert("rows[1].max".to_string(), json!(3));

    let result = evaluate(&def, &data, &EvalOptions::default());
    let shape_errors: Vec<_> = result
        .validations
        .iter()
        .filter(|v| v.constraint_kind == "shape" && v.message.contains("exceed"))
        .collect();
    assert_eq!(shape_errors.len(), 1, "only row 1 max should fail");
    assert_eq!(shape_errors[0].path, "rows[1].max");
}

#[test]
fn wildcard_shape_bare_dollar_gt_sibling_nested_rows_array() {
    let def = json!({
        "items": [
            {
                "key": "rows",
                "repeatable": true,
                "children": [
                    { "key": "min", "dataType": "integer" },
                    { "key": "max", "dataType": "integer" }
                ]
            }
        ],
        "shapes": [{
            "id": "s1",
            "target": "rows[*].max",
            "constraint": "$ > $min",
            "severity": "error",
            "message": "Max must exceed min",
            "code": "RANGE"
        }]
    });

    let mut data = HashMap::new();
    data.insert(
        "rows".to_string(),
        json!([{"min": 1, "max": 10}, {"min": 5, "max": 3}]),
    );

    let result = evaluate(&def, &data, &EvalOptions::default());
    let shape_errors: Vec<_> = result
        .validations
        .iter()
        .filter(|v| v.constraint_kind == "shape" && v.message.contains("exceed"))
        .collect();
    assert_eq!(shape_errors.len(), 1, "only row 1 max should fail");
    assert_eq!(shape_errors[0].path, "rows[1].max");
}

#[test]
fn wildcard_shape_active_when_and_constraint_use_current_row_aliases() {
    let def = json!({
        "items": [
            {
                "key": "rows",
                "repeatable": true,
                "children": [
                    { "key": "role", "dataType": "string" },
                    { "key": "age", "dataType": "integer" },
                    { "key": "isStudent", "dataType": "boolean" }
                ]
            }
        ],
        "shapes": [{
            "id": "child-age",
            "target": "rows[*].age",
            "activeWhen": "role == 'child'",
            "constraint": "$ < 19 or ($ < 22 and isStudent == true)",
            "severity": "error",
            "message": "Child age invalid"
        }]
    });

    let mut data = HashMap::new();
    data.insert("rows[0].role".to_string(), json!("adult"));
    data.insert("rows[0].age".to_string(), json!(40));
    data.insert("rows[0].isStudent".to_string(), json!(false));
    data.insert("rows[1].role".to_string(), json!("child"));
    data.insert("rows[1].age".to_string(), json!(21));
    data.insert("rows[1].isStudent".to_string(), json!(false));

    let result = evaluate(&def, &data, &EvalOptions::default());
    let shape_errors: Vec<_> = result
        .validations
        .iter()
        .filter(|v| v.shape_id.as_deref() == Some("child-age"))
        .collect();
    assert_eq!(shape_errors.len(), 1, "only child row should fail");
    assert_eq!(shape_errors[0].path, "rows[1].age");
}

#[test]
fn variables_recompute_from_repeat_calculations() {
    let def = json!({
        "items": [
            {
                "key": "lines",
                "type": "group",
                "repeatable": true,
                "children": [
                    { "key": "qty", "type": "field", "label": "Qty", "dataType": "integer" },
                    { "key": "unit", "type": "field", "label": "Unit", "dataType": "integer" },
                    { "key": "subtotal", "type": "field", "label": "Subtotal", "dataType": "integer" }
                ]
            }
        ],
        "binds": [
            { "path": "lines[*].subtotal", "calculate": "$qty * $unit" }
        ],
        "variables": [
            { "name": "grandTotal", "expression": "sum($lines[*].subtotal)" }
        ]
    });

    let mut data = HashMap::new();
    data.insert("lines".to_string(), json!([{ "qty": 2, "unit": 50 }]));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(result.values.get("lines[0].subtotal"), Some(&json!(100)));
    assert_eq!(result.variables.get("grandTotal"), Some(&json!(100)));
}

#[test]
fn shape_constraints_can_reference_computed_variables() {
    let def = json!({
        "items": [
            { "key": "qty", "type": "field", "label": "Qty", "dataType": "integer" },
            { "key": "unit", "type": "field", "label": "Unit", "dataType": "integer" },
            { "key": "requested", "type": "field", "label": "Requested", "dataType": "integer" }
        ],
        "variables": [
            { "name": "grandTotal", "expression": "$qty * $unit" }
        ],
        "shapes": [{
            "id": "budget-match",
            "target": "requested",
            "constraint": "$requested == @grandTotal",
            "severity": "error",
            "message": "Requested must equal grand total"
        }]
    });

    let mut data = HashMap::new();
    data.insert("qty".to_string(), json!(2));
    data.insert("unit".to_string(), json!(50));
    data.insert("requested".to_string(), json!(0));

    let result = evaluate(&def, &data, &EvalOptions::default());
    let shape_errors: Vec<_> = result
        .validations
        .iter()
        .filter(|v| v.shape_id.as_deref() == Some("budget-match"))
        .collect();
    assert_eq!(result.variables.get("grandTotal"), Some(&json!(100)));
    assert_eq!(
        shape_errors.len(),
        1,
        "shape should see computed @grandTotal"
    );
    assert_eq!(shape_errors[0].path, "requested");
}

#[test]
fn shape_constraints_handle_plain_money_field_values() {
    let def = json!({
        "items": [
            { "key": "requested", "type": "field", "label": "Requested", "dataType": "money" }
        ],
        "variables": [
            { "name": "grandTotal", "expression": "money(100, 'USD')" }
        ],
        "shapes": [{
            "id": "budget-match",
            "target": "requested",
            "constraint": "abs(moneyAmount($requested) - moneyAmount(@grandTotal)) < 1",
            "severity": "error",
            "message": "Requested must equal grand total"
        }]
    });

    let mut data = HashMap::new();
    data.insert(
        "requested".to_string(),
        json!({ "amount": 0, "currency": "USD" }),
    );

    let result = evaluate(&def, &data, &EvalOptions::default());
    let shape_errors: Vec<_> = result
        .validations
        .iter()
        .filter(|v| v.shape_id.as_deref() == Some("budget-match"))
        .collect();
    assert_eq!(
        result.variables.get("grandTotal"),
        Some(&json!({ "amount": "100", "currency": "USD" }))
    );
    assert_eq!(
        shape_errors.len(),
        1,
        "shape should evaluate plain money field values"
    );
    assert_eq!(shape_errors[0].path, "requested");
}

#[test]
fn calculated_money_sum_uses_plain_money_field_values() {
    let def = json!({
        "items": [
            { "key": "employment", "type": "field", "dataType": "money" },
            { "key": "housing", "type": "field", "dataType": "money" },
            { "key": "health", "type": "field", "dataType": "money" },
            { "key": "total", "type": "field", "dataType": "money" }
        ],
        "binds": [{
            "path": "total",
            "calculate": "coalesce(moneySum([$employment, $housing, $health]), money(0, 'USD'))"
        }]
    });

    let mut data = HashMap::new();
    data.insert(
        "employment".to_string(),
        json!({ "amount": 45000, "currency": "USD" }),
    );
    data.insert(
        "housing".to_string(),
        json!({ "amount": 32000, "currency": "USD" }),
    );
    data.insert(
        "health".to_string(),
        json!({ "amount": 28000, "currency": "USD" }),
    );

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(
        result.values.get("total"),
        Some(&json!({ "amount": "105000", "currency": "USD" }))
    );
}

// ── Scoped variables ─────────────────────────────────────────

#[test]
fn scoped_variable_visible_within_group() {
    let def = json!({
        "items": [
            {
                "key": "section",
                "children": [
                    { "key": "field", "dataType": "integer" }
                ]
            }
        ],
        "binds": {
            "section.field": { "calculate": "@rate * 2" }
        },
        "variables": [
            { "name": "rate", "expression": "10", "scope": "section" }
        ]
    });

    let data = HashMap::new();
    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(
        result.values.get("section.field"),
        Some(&json!(20)),
        "scoped variable @rate should be visible to section.field"
    );
}

#[test]
fn scoped_variable_expression_can_reference_fields_in_scope() {
    let def = json!({
        "items": [
            { "key": "rate", "type": "field", "dataType": "decimal", "initialValue": 0.1 },
            {
                "key": "order",
                "children": [
                    { "key": "amount", "type": "field", "dataType": "decimal", "initialValue": 200 },
                    { "key": "tax", "type": "field", "dataType": "decimal" }
                ]
            }
        ],
        "binds": {
            "order.tax": { "calculate": "@localTax" }
        },
        "variables": [
            { "name": "globalRate", "expression": "rate" },
            { "name": "localTax", "expression": "amount * @globalRate", "scope": "order" }
        ]
    });

    // The scoped variable reads answers, regardless of when they were created.
    let data = HashMap::from([
        ("rate".to_string(), json!(0.1)),
        ("order".to_string(), json!({"amount": 200})),
    ]);
    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(result.variables.get("globalRate"), Some(&json!(0.1)));
    assert_eq!(result.variables.get("localTax"), Some(&json!(20)));
    assert_eq!(result.values.get("order.tax"), Some(&json!(20)));
}

#[test]
fn scoped_variable_invisible_outside_group() {
    let def = json!({
        "items": [
            {
                "key": "section",
                "children": [
                    { "key": "inner", "dataType": "integer" }
                ]
            },
            { "key": "outer", "dataType": "integer" }
        ],
        "binds": {
            "section.inner": { "calculate": "@rate * 2" },
            "outer": { "calculate": "@rate * 3" }
        },
        "variables": [
            { "name": "rate", "expression": "10", "scope": "section" }
        ]
    });

    let data = HashMap::new();
    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(
        result.values.get("section.inner"),
        Some(&json!(20)),
        "inner field within scope should see @rate"
    );
    let outer_val = result.values.get("outer");
    assert!(
        outer_val.is_none() || outer_val == Some(&Value::Null),
        "outer field outside scope should not see @rate (got {:?})",
        outer_val
    );
}

#[test]
fn wildcard_bind_constraint_can_use_current_field_alias() {
    let def = json!({
        "items": [
            {
                "key": "lines",
                "type": "group",
                "repeatable": true,
                "children": [
                    { "key": "quantity", "type": "field", "dataType": "integer" }
                ]
            }
        ],
        "binds": [
            {
                "path": "lines[*].quantity",
                "constraint": "$quantity = null or $quantity >= 0",
                "constraintMessage": "Quantity must be non-negative"
            }
        ]
    });

    let mut data = HashMap::new();
    data.insert("lines[0].quantity".to_string(), json!(2));
    data.insert("lines[1].quantity".to_string(), json!(-1));

    let result = evaluate(&def, &data, &EvalOptions::default());
    let constraint_errors: Vec<_> = result
        .validations
        .iter()
        .filter(|v| v.constraint_kind == "constraint")
        .collect();
    assert_eq!(
        constraint_errors.len(),
        1,
        "only the negative row should fail"
    );
    assert_eq!(constraint_errors[0].path, "lines[1].quantity");
    assert_eq!(
        constraint_errors[0].message,
        "Quantity must be non-negative"
    );
}

#[test]
fn nested_repeat_wildcard_bind_constraint_applies_to_concrete_child_items() {
    let def = json!({
        "items": [
            {
                "key": "projectPhases",
                "type": "group",
                "repeatable": true,
                "children": [
                    {
                        "key": "phaseTasks",
                        "type": "group",
                        "repeatable": true,
                        "children": [
                            { "key": "hourlyRate", "type": "field", "dataType": "money" }
                        ]
                    }
                ]
            }
        ],
        "binds": [
            {
                "path": "projectPhases[*].phaseTasks[*].hourlyRate",
                "constraint": "$hourlyRate = null or moneyAmount($hourlyRate) >= 0",
                "constraintMessage": "Hourly rate must not be negative."
            }
        ]
    });

    let mut data = HashMap::new();
    data.insert(
        "projectPhases[0].phaseTasks[0].hourlyRate".to_string(),
        json!({ "amount": -100, "currency": "USD" }),
    );

    let result = evaluate(&def, &data, &EvalOptions::default());
    let constraint_errors: Vec<_> = result
        .validations
        .iter()
        .filter(|v| v.constraint_kind == "constraint")
        .collect();
    assert_eq!(
        constraint_errors.len(),
        1,
        "nested repeat child should fail constraint"
    );
    assert_eq!(
        constraint_errors[0].path,
        "projectPhases[0].phaseTasks[0].hourlyRate"
    );
    assert_eq!(
        constraint_errors[0].message,
        "Hourly rate must not be negative."
    );
}

#[test]
fn global_scope_variable_visible_everywhere() {
    let def = json!({
        "items": [
            {
                "key": "group",
                "children": [
                    { "key": "nested", "dataType": "integer" }
                ]
            },
            { "key": "top", "dataType": "integer" }
        ],
        "binds": {
            "group.nested": { "calculate": "@globalRate * 2" },
            "top": { "calculate": "@globalRate * 3" }
        },
        "variables": [
            { "name": "globalRate", "expression": "5", "scope": "#" }
        ]
    });

    let data = HashMap::new();
    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(
        result.values.get("group.nested"),
        Some(&json!(10)),
        "nested field should see global variable"
    );
    assert_eq!(
        result.values.get("top"),
        Some(&json!(15)),
        "top-level field should see global variable"
    );
}

#[test]
fn scoped_variable_nearest_scope_wins() {
    let def = json!({
        "items": [
            {
                "key": "section",
                "children": [
                    { "key": "field", "dataType": "integer" }
                ]
            },
            { "key": "top", "dataType": "integer" }
        ],
        "binds": {
            "section.field": { "calculate": "@rate" },
            "top": { "calculate": "@rate" }
        },
        "variables": [
            { "name": "rate", "expression": "100", "scope": "#" },
            { "name": "rate", "expression": "999", "scope": "section" }
        ]
    });

    let data = HashMap::new();
    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(
        result.values.get("section.field"),
        Some(&json!(999)),
        "nearest scope (section) should win for section.field"
    );
    assert_eq!(
        result.values.get("top"),
        Some(&json!(100)),
        "global scope should apply for top-level field"
    );
}

// ── Edge cases: wildcard binds ───────────────────────────────

#[test]
fn wildcard_bind_array_style() {
    // Core §3.2.2: [*] belongs on the target, and bare keys read this row.
    let def = json!({
        "items": [
            {
                "key": "rows",
                "repeatable": true,
                "children": [
                    { "key": "x", "dataType": "integer" },
                    { "key": "doubled", "dataType": "integer" }
                ]
            }
        ],
        "binds": [
            { "path": "rows[*].doubled", "calculate": "$x * 2" }
        ]
    });

    let mut data = HashMap::new();
    data.insert("rows[0].x".to_string(), json!(5));
    data.insert("rows[1].x".to_string(), json!(10));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(
        result.values.get("rows[0].doubled"),
        Some(&json!(10)),
        "array-style wildcard bind: 5 * 2 = 10"
    );
    assert_eq!(
        result.values.get("rows[1].doubled"),
        Some(&json!(20)),
        "array-style wildcard bind: 10 * 2 = 20"
    );
}

#[test]
fn wildcard_bind_zero_instances() {
    let def = json!({
        "items": [
            {
                "key": "rows",
                "repeatable": true,
                "children": [
                    { "key": "val", "dataType": "integer" }
                ]
            }
        ],
        "binds": {
            "rows[*].val": { "constraint": "$ > 0", "constraintMessage": "fail" }
        }
    });

    let data = HashMap::new();
    let result = evaluate(&def, &data, &EvalOptions::default());
    assert!(
        result.validations.is_empty(),
        "zero instances should produce no validation errors"
    );
}

#[test]
fn wildcard_bind_required_per_instance() {
    let def = json!({
        "items": [
            {
                "key": "items",
                "repeatable": true,
                "children": [
                    { "key": "name", "dataType": "string" }
                ]
            }
        ],
        "binds": {
            "items[*].name": { "required": "true" }
        }
    });

    let mut data = HashMap::new();
    data.insert("items[0].name".to_string(), json!("Alice"));
    data.insert("items[1].name".to_string(), json!(""));

    let result = evaluate(&def, &data, &EvalOptions::default());
    let req_errors: Vec<_> = result
        .validations
        .iter()
        .filter(|v| v.message.contains("Required"))
        .collect();
    assert_eq!(req_errors.len(), 1, "only instance 1 should fail required");
    assert_eq!(req_errors[0].path, "items[1].name");
}

#[test]
fn wildcard_bind_bare_sibling_relevance_suppresses_required() {
    let def = json!({
        "items": [
            {
                "key": "rows",
                "repeatable": true,
                "children": [
                    { "key": "enabled", "dataType": "boolean" },
                    { "key": "note", "dataType": "string" }
                ]
            }
        ],
        "binds": [
            { "path": "rows[*].note", "relevant": "$enabled" },
            { "path": "rows[*].note", "required": "true" }
        ]
    });

    let mut data = HashMap::new();
    data.insert("rows[0].enabled".to_string(), json!(false));
    data.insert("rows[0].note".to_string(), json!(""));

    let result = evaluate(&def, &data, &EvalOptions::default());
    let req_errors: Vec<_> = result
        .validations
        .iter()
        .filter(|v| v.message.contains("Required"))
        .collect();
    assert!(
        req_errors.is_empty(),
        "non-relevant field should suppress required: {:?}",
        req_errors
    );
}

#[test]
fn wildcard_bind_bare_sibling_nested_data() {
    let def = json!({
        "items": [
            {
                "key": "rows",
                "repeatable": true,
                "children": [
                    { "key": "enabled", "dataType": "boolean" },
                    { "key": "note", "dataType": "string" }
                ]
            }
        ],
        "binds": [
            { "path": "rows[*].note", "relevant": "$enabled" },
            { "path": "rows[*].note", "required": "true" }
        ]
    });

    let mut data = HashMap::new();
    data.insert("rows".to_string(), json!([{"enabled": false, "note": ""}]));

    let result = evaluate(
        &def,
        &data,
        &EvalOptions::default().trigger(EvalTrigger::Continuous),
    );
    let req_errors: Vec<_> = result
        .validations
        .iter()
        .filter(|v| v.message.contains("Required"))
        .collect();
    assert!(
        req_errors.is_empty(),
        "nested data: non-relevant field should suppress required: {:?}",
        req_errors
    );
}

// ── Edge cases: scoped variables ─────────────────────────────

#[test]
fn variable_default_scope_is_global() {
    let def = json!({
        "items": [
            {
                "key": "group",
                "children": [
                    { "key": "field", "dataType": "integer" }
                ]
            }
        ],
        "binds": {
            "group.field": { "calculate": "@v" }
        },
        "variables": [
            { "name": "v", "expression": "77" }
        ]
    });

    let data = HashMap::new();
    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(
        result.values.get("group.field"),
        Some(&json!(77)),
        "variable with no scope should default to global (#)"
    );
}

// ── Bug regression tests ─────────────────────────────────────

#[test]
fn scoped_variable_visible_inside_repeatable_group() {
    let def = json!({
        "items": [
            {
                "key": "section",
                "children": [
                    {
                        "key": "rows",
                        "repeatable": true,
                        "children": [
                            { "key": "amount", "dataType": "integer" },
                            { "key": "adjusted", "dataType": "integer" }
                        ]
                    }
                ]
            }
        ],
        "binds": {
            "section.rows[*].adjusted": { "calculate": "$amount * @rate" }
        },
        "variables": [
            { "name": "rate", "expression": "2", "scope": "section" }
        ]
    });

    let mut data = HashMap::new();
    data.insert("section.rows[0].amount".to_string(), json!(100));
    data.insert("section.rows[1].amount".to_string(), json!(200));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(
        result.values.get("section.rows[0].adjusted"),
        Some(&json!(200)),
        "scoped @rate should be visible inside repeatable group children"
    );
    assert_eq!(
        result.values.get("section.rows[1].adjusted"),
        Some(&json!(400)),
        "scoped @rate should be visible inside second repeat instance"
    );
}

#[test]
fn bare_name_alias_does_not_shadow_top_level_field() {
    let def = json!({
        "items": [
            {
                "key": "rows",
                "repeatable": true,
                "children": [
                    { "key": "amount", "dataType": "decimal" }
                ]
            },
            { "key": "amount", "dataType": "decimal" },
            { "key": "result", "dataType": "decimal" }
        ],
        "binds": {
            "result": { "calculate": "$amount" }
        }
    });

    let mut data = HashMap::new();
    data.insert("amount".to_string(), json!(999));
    data.insert("rows[0].amount".to_string(), json!(10));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(
        result.values.get("amount"),
        Some(&json!(999)),
        "top-level field 'amount' must survive bare-name alias cleanup"
    );
    assert_eq!(
        result.values.get("result"),
        Some(&json!(999)),
        "calculate referencing $amount should use top-level value, not null from alias cleanup"
    );
}

// ── @instance() in FEL expressions ──────────────────────────

#[test]
fn instance_ref_in_calculate_resolves() {
    let def = json!({
        "$formspec": "1.0", "url": "test", "version": "1.0.0", "title": "T",
        "items": [{ "key": "rate", "type": "field", "dataType": "decimal", "label": "Rate" }],
        "binds": [{ "path": "rate", "calculate": "@instance('config').defaultRate" }],
        "instances": [{ "name": "config", "src": "static", "data": {} }],
    });
    let data = HashMap::new();
    let mut instances = HashMap::new();
    instances.insert("config".into(), json!({ "defaultRate": 0.15 }));
    let result = evaluate(
        &def,
        &data,
        &EvalOptions::default()
            .trigger(EvalTrigger::Continuous)
            .instances(instances.clone()),
    );
    assert_eq!(result.values.get("rate"), Some(&json!(0.15)));
}

#[test]
fn instance_ref_in_constraint_resolves() {
    let def = json!({
        "$formspec": "1.0", "url": "test", "version": "1.0.0", "title": "T",
        "items": [{ "key": "amount", "type": "field", "dataType": "decimal", "label": "Amt" }],
        "binds": [{ "path": "amount",
            "constraint": "$amount <= @instance('limits').maxAmount",
            "constraintMessage": "Exceeds limit" }],
        "instances": [{ "name": "limits", "src": "static", "data": {} }],
    });
    let mut data = HashMap::new();
    data.insert("amount".into(), json!(500));
    let mut instances = HashMap::new();
    instances.insert("limits".into(), json!({ "maxAmount": 100 }));
    let result = evaluate(
        &def,
        &data,
        &EvalOptions::default()
            .trigger(EvalTrigger::Continuous)
            .instances(instances.clone()),
    );
    assert!(
        result
            .validations
            .iter()
            .any(|v| v.code == "CONSTRAINT_FAILED"),
        "constraint referencing @instance should fire"
    );
}

#[test]
fn instance_ref_in_shape_constraint_resolves() {
    let def = json!({
        "$formspec": "1.0", "url": "test", "version": "1.0.0", "title": "T",
        "items": [{ "key": "total", "type": "field", "dataType": "decimal", "label": "T" }],
        "shapes": [{ "id": "cap", "target": "total", "severity": "error",
            "constraint": "$total <= @instance('rules').cap",
            "message": "Over cap", "code": "OVER_CAP" }],
        "instances": [{ "name": "rules", "src": "static", "data": {} }],
    });
    let mut data = HashMap::new();
    data.insert("total".into(), json!(200));
    let mut instances = HashMap::new();
    instances.insert("rules".into(), json!({ "cap": 100 }));
    let result = evaluate(
        &def,
        &data,
        &EvalOptions::default()
            .trigger(EvalTrigger::Continuous)
            .instances(instances.clone()),
    );
    assert!(result.validations.iter().any(|v| v.code == "OVER_CAP"));
}

#[test]
fn instance_ref_in_relevant_resolves() {
    let def = json!({
        "$formspec": "1.0", "url": "test", "version": "1.0.0", "title": "T",
        "items": [{ "key": "extra", "type": "field", "dataType": "string", "label": "E" }],
        "binds": [{ "path": "extra", "relevant": "@instance('flags').showExtra" }],
        "instances": [{ "name": "flags", "src": "static", "data": {} }],
    });
    let data = HashMap::new();
    let mut instances = HashMap::new();
    instances.insert("flags".into(), json!({ "showExtra": false }));
    let result = evaluate(
        &def,
        &data,
        &EvalOptions::default()
            .trigger(EvalTrigger::Continuous)
            .instances(instances.clone()),
    );
    assert!(result.non_relevant.contains(&"extra".to_string()));
}

#[test]
fn missing_instance_name_returns_null_not_panic() {
    let def = json!({
        "$formspec": "1.0", "url": "test", "version": "1.0.0", "title": "T",
        "items": [{ "key": "val", "type": "field", "dataType": "string", "label": "V" }],
        "binds": [{ "path": "val", "calculate": "@instance('nonexistent').foo" }],
    });
    let result = evaluate(
        &def,
        &HashMap::new(),
        &EvalOptions::default().trigger(EvalTrigger::Continuous),
    );
    // Should not panic — value should be null
    assert!(result.values.get("val").is_none() || result.values.get("val") == Some(&json!(null)));
}

#[test]
fn nested_instance_path_resolves() {
    let def = json!({
        "$formspec": "1.0", "url": "test", "version": "1.0.0", "title": "T",
        "items": [{ "key": "city", "type": "field", "dataType": "string", "label": "C" }],
        "binds": [{ "path": "city", "calculate": "@instance('org').address.city" }],
        "instances": [{ "name": "org", "src": "static", "data": {} }],
    });
    let mut instances = HashMap::new();
    instances.insert(
        "org".into(),
        json!({ "address": { "city": "Springfield" } }),
    );
    let result = evaluate(
        &def,
        &HashMap::new(),
        &EvalOptions::default()
            .trigger(EvalTrigger::Continuous)
            .instances(instances.clone()),
    );
    assert_eq!(result.values.get("city"), Some(&json!("Springfield")));
}

// ── 0b: Expression defaults on relevance transition ─────────

#[test]
fn expression_default_applied_on_relevance_transition() {
    let def = json!({
        "$formspec": "1.0", "url": "test", "version": "1.0.0", "title": "T",
        "items": [
            { "key": "toggle", "type": "field", "dataType": "boolean", "label": "Toggle" },
            { "key": "derived", "type": "field", "dataType": "string", "label": "D" },
        ],
        "binds": [
            { "path": "derived", "relevant": "$toggle", "default": "='hello' & ' world'" },
        ],
    });
    // Pass 1: toggle=false → derived non-relevant
    let mut data = HashMap::new();
    data.insert("toggle".into(), json!(false));
    let result1 = evaluate(&def, &data, &EvalOptions::default());
    assert!(
        result1.non_relevant.contains(&"derived".to_string()),
        "derived should be non-relevant when toggle=false"
    );

    // Pass 2: toggle=true, carry forward non-relevant state → transition fires
    data.insert("toggle".into(), json!(true));
    let result2 = evaluate(
        &def,
        &data,
        &EvalOptions::default().context(EvalContext {
            now_iso: None,
            previous_non_relevant: Some(result1.non_relevant.clone()),
            ..EvalContext::default()
        }),
    );
    assert_eq!(
        result2.values.get("derived"),
        Some(&json!("hello world")),
        "expression default should fire on non-relevant → relevant transition"
    );
}

#[test]
fn money_literal_default_coerces_string_amount_on_relevance_transition() {
    let def = json!({
        "$formspec": "1.0",
        "url": "http://example.org/money-defaults",
        "version": "1.0.0",
        "title": "Money Defaults",
        "formPresentation": { "defaultCurrency": "USD" },
        "items": [
            { "key": "show", "type": "field", "dataType": "boolean", "label": "Show", "initialValue": false },
            { "key": "amount", "type": "field", "dataType": "money", "label": "Amount" },
        ],
        "binds": [
            { "path": "amount", "relevant": "show == true", "default": { "amount": "0", "currency": "USD" } },
        ],
    });
    let mut data = HashMap::new();
    data.insert("show".into(), json!(false));
    let result1 = evaluate(&def, &data, &EvalOptions::default());
    assert!(
        result1.non_relevant.contains(&"amount".to_string()),
        "amount non-relevant when show=false"
    );

    data.insert("show".into(), json!(true));
    let result2 = evaluate(
        &def,
        &data,
        &EvalOptions::default().context(EvalContext {
            now_iso: None,
            previous_non_relevant: Some(result1.non_relevant.clone()),
            ..EvalContext::default()
        }),
    );
    let amount = result2.values.get("amount").expect("amount default");
    assert_eq!(
        amount.get("amount"),
        Some(&json!("0")),
        "money bind defaults retain the schema string amount"
    );
    assert_eq!(amount.get("currency"), Some(&json!("USD")));
}

#[test]
fn expression_default_does_not_overwrite_user_value() {
    let def = json!({
        "$formspec": "1.0", "url": "test", "version": "1.0.0", "title": "T",
        "items": [
            { "key": "toggle", "type": "field", "dataType": "boolean", "label": "Toggle" },
            { "key": "name", "type": "field", "dataType": "string", "label": "Name" },
        ],
        "binds": [
            { "path": "name", "relevant": "$toggle", "default": "='default' & 'Name'" },
        ],
    });
    // toggle=true, user has entered a value → default must NOT overwrite
    let mut data = HashMap::new();
    data.insert("toggle".into(), json!(true));
    data.insert("name".into(), json!("UserValue"));
    let result = evaluate(
        &def,
        &data,
        &EvalOptions::default().context(EvalContext {
            now_iso: None,
            previous_non_relevant: Some(vec!["name".to_string()]),
            ..EvalContext::default()
        }),
    );
    assert_eq!(
        result.values.get("name"),
        Some(&json!("UserValue")),
        "expression default must not overwrite user-entered value"
    );
}

#[test]
fn literal_default_still_works_after_expression_default_change() {
    let def = json!({
        "$formspec": "1.0", "url": "test", "version": "1.0.0", "title": "T",
        "items": [
            { "key": "toggle", "type": "field", "dataType": "boolean", "label": "Toggle" },
            { "key": "status", "type": "field", "dataType": "string", "label": "S" },
        ],
        "binds": [
            { "path": "status", "relevant": "$toggle", "default": "active" },
        ],
    });
    // Pass 1: toggle=false → status non-relevant
    let mut data = HashMap::new();
    data.insert("toggle".into(), json!(false));
    let result1 = evaluate(&def, &data, &EvalOptions::default());
    assert!(result1.non_relevant.contains(&"status".to_string()));

    // Pass 2: toggle=true, carry forward non-relevant → literal default fires
    data.insert("toggle".into(), json!(true));
    let result2 = evaluate(
        &def,
        &data,
        &EvalOptions::default().context(EvalContext {
            now_iso: None,
            previous_non_relevant: Some(result1.non_relevant.clone()),
            ..EvalContext::default()
        }),
    );
    assert_eq!(
        result2.values.get("status"),
        Some(&json!("active")),
        "literal default should still fire on relevance transition"
    );
}

#[test]
fn expression_default_in_repeat_group() {
    let def = json!({
        "$formspec": "1.0", "url": "test", "version": "1.0.0", "title": "T",
        "items": [
            { "key": "toggle", "type": "field", "dataType": "boolean", "label": "T" },
            { "key": "items", "type": "group", "label": "Items", "repeatable": true,
              "children": [
                { "key": "label", "type": "field", "dataType": "string", "label": "L" }
            ]}
        ],
        "binds": [
            { "path": "items[*].label", "relevant": "$toggle", "default": "='item' & '-default'" },
        ],
    });
    // Pass 1: toggle=false → items[0].label non-relevant
    let mut data = HashMap::new();
    data.insert("toggle".into(), json!(false));
    data.insert("items[0].label".into(), Value::Null);
    let result1 = evaluate(&def, &data, &EvalOptions::default());

    // Pass 2: toggle=true → transition fires expression default in repeat
    data.insert("toggle".into(), json!(true));
    let result2 = evaluate(
        &def,
        &data,
        &EvalOptions::default().context(EvalContext {
            now_iso: None,
            previous_non_relevant: Some(result1.non_relevant.clone()),
            ..EvalContext::default()
        }),
    );
    let label = result2.values.get("items[0].label");
    assert_eq!(
        label,
        Some(&json!("item-default")),
        "expression default should fire in repeat group on relevance transition"
    );
}

/// Spec §5.3: shape message `{{expression}}` sequences MUST be resolved before surfacing.
#[test]
fn shape_message_interpolates_expressions() {
    let def = json!({
        "items": [
            { "key": "budget", "dataType": "integer" },
            { "key": "limit", "dataType": "integer" }
        ],
        "shapes": [{
            "target": "budget",
            "constraint": "$budget <= $limit",
            "severity": "error",
            "message": "Budget {{$budget}} exceeds limit {{$limit}}"
        }]
    });

    let mut data = HashMap::new();
    data.insert("budget".to_string(), json!(1000));
    data.insert("limit".to_string(), json!(500));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(result.validations.len(), 1);
    assert_eq!(
        result.validations[0].message, "Budget 1000 exceeds limit 500",
        "shape message must resolve {{expr}} interpolation"
    );
}

/// Spec §5.3: shape message without interpolation passes through unchanged.
#[test]
fn shape_message_plain_text_unchanged() {
    let def = json!({
        "items": [
            { "key": "a", "dataType": "integer" }
        ],
        "shapes": [{
            "target": "a",
            "constraint": "$a > 10",
            "severity": "error",
            "message": "Value too low"
        }]
    });

    let mut data = HashMap::new();
    data.insert("a".to_string(), json!(5));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(result.validations.len(), 1);
    assert_eq!(result.validations[0].message, "Value too low");
}

/// Spec §5.3: `{{{{` escapes to literal `{{` in shape messages.
#[test]
fn shape_message_escape_braces() {
    let def = json!({
        "items": [
            { "key": "x", "dataType": "integer" }
        ],
        "shapes": [{
            "target": "x",
            "constraint": "$x > 0",
            "severity": "error",
            "message": "Use {{{{ for templates"
        }]
    });

    let mut data = HashMap::new();
    data.insert("x".to_string(), json!(-1));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(result.validations.len(), 1);
    assert_eq!(result.validations[0].message, "Use {{ for templates");
}

/// Spec §5.3: failed parse in `{{expr}}` preserves the literal.
#[test]
fn shape_message_bad_expr_preserved() {
    let def = json!({
        "items": [
            { "key": "x", "dataType": "integer" }
        ],
        "shapes": [{
            "target": "x",
            "constraint": "$x > 0",
            "severity": "error",
            "message": "Error: {{!!!bad}}"
        }]
    });

    let mut data = HashMap::new();
    data.insert("x".to_string(), json!(-1));

    let result = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(result.validations.len(), 1);
    assert_eq!(result.validations[0].message, "Error: {{!!!bad}}");
}

// ── BUG-2 / FIX 4: Date coercion at context entry ─────────────────────────

/// A date-typed field with value "2026-12-25" must be comparable to today()
/// via `>=`. Before the fix, the field entered FEL as a string, making the
/// comparison produce null (treated as constraint failure).
#[test]
fn date_field_compared_to_today_passes_when_future() {
    let def = json!({
        "items": [
            { "key": "deadline", "dataType": "date" }
        ],
        "shapes": [{
            "target": "deadline",
            "constraint": "$deadline >= today()",
            "severity": "error",
            "message": "Deadline must be today or later"
        }]
    });

    let mut data = HashMap::new();
    data.insert("deadline".to_string(), json!("2099-12-25"));

    let context = EvalContext {
        now_iso: Some("2026-04-07T12:00:00".to_string()),
        ..Default::default()
    };
    let result = evaluate(
        &def,
        &data,
        &EvalOptions::default().context(context.clone()),
    );

    let shape_errors: Vec<&ValidationResult> = result
        .validations
        .iter()
        .filter(|v| v.constraint_kind == "shape")
        .collect();
    assert!(
        shape_errors.is_empty(),
        "date field '2099-12-25' should pass >= today() (2026-04-07), got: {shape_errors:?}"
    );
}

/// A date-typed field with a past date must fail the >= today() constraint.
#[test]
fn date_field_compared_to_today_fails_when_past() {
    let def = json!({
        "items": [
            { "key": "deadline", "dataType": "date" }
        ],
        "shapes": [{
            "target": "deadline",
            "constraint": "$deadline >= today()",
            "severity": "error",
            "message": "Deadline must be today or later"
        }]
    });

    let mut data = HashMap::new();
    data.insert("deadline".to_string(), json!("2020-01-01"));

    let context = EvalContext {
        now_iso: Some("2026-04-07T12:00:00".to_string()),
        ..Default::default()
    };
    let result = evaluate(
        &def,
        &data,
        &EvalOptions::default().context(context.clone()),
    );

    let shape_errors: Vec<&ValidationResult> = result
        .validations
        .iter()
        .filter(|v| v.constraint_kind == "shape")
        .collect();
    assert_eq!(
        shape_errors.len(),
        1,
        "date field '2020-01-01' should fail >= today() (2026-04-07)"
    );
}

/// Date coercion must also work in bind constraints, not just shapes.
#[test]
fn date_field_bind_constraint_compares_with_today() {
    let def = json!({
        "items": [
            { "key": "start_date", "dataType": "date" }
        ],
        "binds": {
            "start_date": { "constraint": "$start_date >= today()" }
        }
    });

    let mut data = HashMap::new();
    data.insert("start_date".to_string(), json!("2099-06-15"));

    let context = EvalContext {
        now_iso: Some("2026-04-07T12:00:00".to_string()),
        ..Default::default()
    };
    let result = evaluate(
        &def,
        &data,
        &EvalOptions::default().context(context.clone()),
    );

    let constraint_errors: Vec<&ValidationResult> = result
        .validations
        .iter()
        .filter(|v| v.code == "CONSTRAINT_FAILED")
        .collect();
    assert!(
        constraint_errors.is_empty(),
        "date field '2099-06-15' should pass >= today() bind constraint, got: {constraint_errors:?}"
    );
}

/// dateTime-typed fields should also be coerced.
#[test]
fn datetime_field_coerced_at_context_entry() {
    let def = json!({
        "items": [
            { "key": "timestamp", "dataType": "dateTime" }
        ],
        "shapes": [{
            "target": "timestamp",
            "constraint": "$timestamp >= today()",
            "severity": "error",
            "message": "Timestamp must be today or later"
        }]
    });

    let mut data = HashMap::new();
    data.insert("timestamp".to_string(), json!("2099-12-25T10:30:00"));

    let context = EvalContext {
        now_iso: Some("2026-04-07T12:00:00".to_string()),
        ..Default::default()
    };
    let result = evaluate(
        &def,
        &data,
        &EvalOptions::default().context(context.clone()),
    );

    let shape_errors: Vec<&ValidationResult> = result
        .validations
        .iter()
        .filter(|v| v.constraint_kind == "shape")
        .collect();
    assert!(
        shape_errors.is_empty(),
        "dateTime field should be coerced and pass >= today(), got: {shape_errors:?}"
    );
}

// ── BUG-4 / FIX 5: Calculate-before-required evaluation order ──────────────

/// When field B's required condition depends on calculated field A, the
/// required state must reflect A's calculated value, not the pre-calculate data.
#[test]
fn required_condition_sees_calculated_field_value() {
    let def = json!({
        "items": [
            { "key": "revenue", "dataType": "number" },
            { "key": "expenses", "dataType": "number" },
            { "key": "net_income", "dataType": "number" },
            { "key": "loss_explanation", "dataType": "string" }
        ],
        "binds": {
            "net_income": { "calculate": "$revenue - $expenses" },
            "loss_explanation": { "required": "$net_income < 0" }
        }
    });

    let mut data = HashMap::new();
    data.insert("revenue".to_string(), json!(100));
    data.insert("expenses".to_string(), json!(200));

    let result = evaluate(&def, &data, &EvalOptions::default());

    // net_income should be -100
    assert_eq!(
        result.values.get("net_income"),
        Some(&json!(-100)),
        "net_income should be calculated as revenue - expenses"
    );

    // loss_explanation should be required because net_income < 0
    assert_eq!(
        result.required.get("loss_explanation"),
        Some(&true),
        "loss_explanation must be required when net_income < 0"
    );
}

/// When the calculated field is positive, the conditional required should NOT fire.
#[test]
fn required_condition_not_triggered_when_calculated_field_is_positive() {
    let def = json!({
        "items": [
            { "key": "revenue", "dataType": "number" },
            { "key": "expenses", "dataType": "number" },
            { "key": "net_income", "dataType": "number" },
            { "key": "loss_explanation", "dataType": "string" }
        ],
        "binds": {
            "net_income": { "calculate": "$revenue - $expenses" },
            "loss_explanation": { "required": "$net_income < 0" }
        }
    });

    let mut data = HashMap::new();
    data.insert("revenue".to_string(), json!(500));
    data.insert("expenses".to_string(), json!(200));

    let result = evaluate(&def, &data, &EvalOptions::default());

    // net_income should be 300
    assert_eq!(result.values.get("net_income"), Some(&json!(300)));

    // loss_explanation should NOT be required
    assert!(
        result.required.get("loss_explanation") != Some(&true),
        "loss_explanation should NOT be required when net_income >= 0"
    );
}

/// The required condition must see the calculated value even when items are
/// declared in the "wrong" order (required field appears before the calculated
/// field in the items array).
#[test]
fn required_sees_calculated_value_regardless_of_declaration_order() {
    let def = json!({
        "items": [
            { "key": "loss_explanation", "dataType": "string" },
            { "key": "net_income", "dataType": "number" },
            { "key": "revenue", "dataType": "number" },
            { "key": "expenses", "dataType": "number" }
        ],
        "binds": {
            "net_income": { "calculate": "$revenue - $expenses" },
            "loss_explanation": { "required": "$net_income < 0" }
        }
    });

    let mut data = HashMap::new();
    data.insert("revenue".to_string(), json!(100));
    data.insert("expenses".to_string(), json!(200));

    let result = evaluate(&def, &data, &EvalOptions::default());

    assert_eq!(result.values.get("net_income"), Some(&json!(-100)));
    assert_eq!(
        result.required.get("loss_explanation"),
        Some(&true),
        "loss_explanation must be required even when declared before net_income"
    );
}

// ── BUG-6 / FIX 6: Skip repeat template validation at 0 instances ─────────

/// When a repeatable group has minRepeat: 0 and no instances in the data,
/// required validation must NOT fire on the template paths.
#[test]
fn repeat_group_zero_instances_no_required_errors() {
    let def = json!({
        "items": [
            {
                "key": "health_history",
                "repeatable": true,
                "minRepeat": 0,
                "children": [
                    { "key": "condition_name", "dataType": "string" }
                ]
            }
        ],
        "binds": {
            "health_history[*].condition_name": { "required": "true" }
        }
    });

    let data = HashMap::new();
    let result = evaluate(&def, &data, &EvalOptions::default());

    let required_errors: Vec<&ValidationResult> = result
        .validations
        .iter()
        .filter(|v| v.code == "REQUIRED")
        .collect();
    assert!(
        required_errors.is_empty(),
        "required must not fire on repeat template with 0 instances, got: {required_errors:?}"
    );
}

/// A required Bind addressed by the Item path must still skip a repeat with zero rows.
#[test]
fn repeat_group_zero_instances_item_path_required_no_errors() {
    let def = json!({
        "items": [
            {
                "key": "past_conditions",
                "repeatable": true,
                "minRepeat": 0,
                "children": [
                    { "key": "condition_name", "dataType": "string" }
                ]
            }
        ],
        "binds": [
            {"path": "past_conditions.condition_name", "required": true},
        ]
    });

    let data = HashMap::new();
    let result = evaluate(&def, &data, &EvalOptions::default());

    let required_errors: Vec<&ValidationResult> = result
        .validations
        .iter()
        .filter(|v| v.code == "REQUIRED")
        .collect();
    assert!(
        required_errors.is_empty(),
        "required must not fire on repeat template with 0 instances (required by Item path), got: {required_errors:?}"
    );
}

/// When instances DO exist, required should fire normally.
#[test]
fn repeat_group_with_instances_required_fires_normally() {
    let def = json!({
        "items": [
            {
                "key": "items",
                "repeatable": true,
                "minRepeat": 1,
                "children": [
                    { "key": "name", "dataType": "string" }
                ]
            }
        ],
        "binds": {
            "items[*].name": { "required": "true" }
        }
    });

    let mut data = HashMap::new();
    data.insert("items[0].name".to_string(), json!(""));

    let result = evaluate(&def, &data, &EvalOptions::default());

    let required_errors: Vec<&ValidationResult> = result
        .validations
        .iter()
        .filter(|v| v.code == "REQUIRED")
        .collect();
    assert_eq!(
        required_errors.len(),
        1,
        "required must fire on existing instance with empty value"
    );
}

#[test]
fn row_totals_refresh_after_writes_and_stay_within_their_enclosing_row() {
    let def = json!({
        "items": [{
            "key": "orders", "type": "group", "repeatable": true,
            "children": [
                {"key": "label", "dataType": "string"},
                {"key": "lines", "type": "group", "repeatable": true, "children": [
                    {"key": "share", "dataType": "decimal"},
                    {"key": "amt", "dataType": "integer"},
                    {"key": "input", "dataType": "integer"},
                    {"key": "local", "dataType": "integer"},
                    {"key": "orderLabel", "dataType": "string"},
                    {"key": "variableCopy", "dataType": "integer"}
                ]}
            ]
        }],
        "variables": [
            {"name": "rowAmount", "expression": "99"},
            {"name": "rowAmount", "scope": "lines", "expression": "@actual"},
            {"name": "actual", "scope": "lines", "expression": "$amt"}
        ],
        "binds": [
            {"path": "orders[*].lines[*].share", "calculate": "$amt / sum($lines[*].amt)"},
            {"path": "orders[*].lines[*].amt", "calculate": "$input * 2"},
            {"path": "orders[*].lines[*].local", "calculate": "let lines = [{amt: $amt}] in sum($lines[*].amt)"},
            {"path": "orders[*].lines[*].orderLabel", "calculate": "parent().label"},
            {"path": "orders[*].lines[*].variableCopy", "calculate": "@rowAmount"}
        ]
    });
    let data = HashMap::from([(
        "orders".to_owned(),
        json!([
            {"label": "first", "lines": [{"amt": 1, "input": 1}, {"amt": 1, "input": 3}, {}]},
            {"label": "second", "lines": [{"amt": 5, "input": 2}, {"amt": 5, "input": 2}]}
        ]),
    )]);

    let outcome = evaluate(&def, &data, &EvalOptions::default());
    assert_eq!(outcome.values["orders[0].lines[0].share"], json!(0.25));
    assert_eq!(outcome.values["orders[0].lines[1].share"], json!(0.75));
    assert_eq!(outcome.values["orders[0].lines[2].share"], Value::Null);
    assert_eq!(outcome.values["orders[1].lines[0].share"], json!(0.5));
    assert_eq!(outcome.values["orders[0].lines[1].local"], json!(6));
    assert_eq!(
        outcome.values["orders[1].lines[0].orderLabel"],
        json!("second")
    );
    assert_eq!(outcome.values["orders[0].lines[1].variableCopy"], json!(6));
}

#[test]
fn host_snapshot_agrees_on_declared_fields_preserved_values_and_row_counts() {
    let def = json!({
        "items": [
            {"key": "rate", "dataType": "integer"},
            {"key": "hidden", "dataType": "integer"},
            {"key": "rows", "type": "group", "repeatable": true, "children": [
                {"key": "own", "dataType": "integer"},
                {"key": "copy", "dataType": "integer"},
                {"key": "empty", "type": "group", "children": []}
            ]}
        ],
        "binds": [
            {"path": "hidden", "relevant": "false", "excludedValue": "preserve"},
            {"path": "rows[*].copy", "calculate": "$rate + $own"}
        ]
    });
    let data = HashMap::from([
        ("rate".to_owned(), json!(2)),
        ("hidden".to_owned(), json!(47)),
        (
            "rows".to_owned(),
            json!([{"own": 10, "rate": 999}, {"own": 20}]),
        ),
    ]);
    let options = EvalOptions::default();
    let result = evaluate(&def, &data, &options);
    assert_eq!(result.row_counts["rows"], 2);
    assert_eq!(result.values["rows[0].copy"], json!(12));
    assert_eq!(result.values["rows[1].copy"], json!(22));
    assert!(!result.values.contains_key("hidden"));
    let host = formspec_eval::HostFelContext::from_evaluation(&def, &result, &options);
    let read = |expr| {
        fel_core::exact_json::from_fel(
            &host
                .evaluate(expr, "rows[0].own", true, None, None)
                .unwrap()
                .value,
        )
    };
    assert_eq!(read("$rate"), json!(2));
    assert_eq!(read("$hidden"), json!(47));
    assert_eq!(read("$"), json!(10));
    assert_eq!(read("@count"), json!(2));
}

#[test]
fn recheck_uses_the_filed_subject_and_distinguishes_input_refusal() {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../../tests/conformance/fixtures/subject-recheck.json"
    )).unwrap();
    let definition = &fixture["definition"];
    let mut subject = fixture["response"]["subject"].clone();
    for (year, refused) in [(9_007_199_254_740_991_i64, false), (9_007_199_254_740_993, true)] {
        subject["keys"]["serial"] = json!(year);
        let context = formspec_eval::EvalContext {
            subject: formspec_eval::EvalSubject::for_response(definition, Some(&subject)),
            ..Default::default()
        };
        let result = evaluate(definition, &Default::default(), &EvalOptions::new().context(context));
        assert_eq!(result.refused, refused);
        if refused {
            assert_eq!(result.validations[0].path, "#subjectKeys.serial");
        } else {
            assert!(result.validations.is_empty());
            assert_eq!(result.data, fixture["response"]["data"]);
        }
    }
}

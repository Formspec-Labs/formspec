//! Core §3.12: host extension functions reach every expression site through `EvalOptions`.

use fel_core::exact_json::{Value, native_json as json};
use fel_core::{ExtensionRegistry, Value as FelValue};
use formspec_eval::{EvalOptions, EvalTrigger, evaluate};
use rust_decimal::Decimal;
use std::collections::HashMap;

/// `double(n)` = `2 * n`; `shout(s)` = upper-cased `s`.
fn registry() -> ExtensionRegistry {
    let mut registry = ExtensionRegistry::new();
    registry
        .register("double", 1, Some(1), |args| match &args[0] {
            FelValue::Number(n) => FelValue::Number(*n * Decimal::from(2)),
            _ => FelValue::Null,
        })
        .expect("double is not a builtin");
    registry
        .register("shout", 1, Some(1), |args| match &args[0] {
            FelValue::String(s) => FelValue::String(s.to_uppercase()),
            _ => FelValue::Null,
        })
        .expect("shout is not a builtin");
    registry
}

fn definition() -> Value {
    json!({
        "$formspec": "1.0",
        "url": "urn:test:extensions",
        "version": "1.0.0",
        "title": "Extensions",
        "items": [
            { "key": "qty", "type": "field", "dataType": "integer", "label": "Qty" },
            { "key": "seeded", "type": "field", "dataType": "integer", "label": "Seeded", "initialValue": "=double(21)" },
            { "key": "total", "type": "field", "dataType": "integer", "label": "Total" },
            { "key": "note", "type": "field", "dataType": "string", "label": "Note" },
            {
                "key": "rows", "type": "group", "label": "Rows", "repeatable": true,
                "children": [{ "key": "n", "type": "field", "dataType": "integer", "label": "N" }]
            }
        ],
        "variables": [{ "name": "twice", "expression": "double($qty)" }],
        "binds": [
            { "path": "total", "calculate": "double($qty) + @twice" },
            { "path": "note", "relevant": "double($qty) > 4", "constraint": "shout($note) = 'OK'" },
            { "path": "qty", "constraint": "double($qty) < 100" }
        ],
        "shapes": [
            { "id": "big", "target": "#", "constraint": "double($qty) < 10", "message": "Too big: {{double($qty)}}" },
            { "id": "rowCap", "target": "rows[*].n", "constraint": "double($n) < 10", "message": "Row cap" }
        ]
    })
}

fn data() -> HashMap<String, Value> {
    HashMap::from([
        ("qty".to_string(), json!(5)),
        ("note".to_string(), json!("ok")),
        ("rows[0].n".to_string(), json!(7)),
    ])
}

#[test]
fn registered_extensions_evaluate_at_every_expression_site() {
    let registry = registry();
    let options = EvalOptions::default()
        .trigger(EvalTrigger::Submit)
        .extensions(&registry);

    // The extension in initialValue runs at creation; the other sites run in evaluate.
    let definition = definition();
    let seeded = formspec_eval::create_response(
        &definition,
        json!({}),
        &formspec_eval::CreateOptions {
            extensions: Some(&registry),
            ..formspec_eval::CreateOptions::default()
        },
    );
    let mut data = data();
    data.insert("seeded".to_owned(), seeded.data["seeded"].clone());
    let result = evaluate(&definition, &data, &options);

    assert_eq!(
        result.values.get("seeded"),
        Some(&json!(42)),
        "initialValue"
    );
    assert_eq!(result.variables.get("twice"), Some(&json!(10)), "variable");
    assert_eq!(
        result.values.get("total"),
        Some(&json!(20)),
        "calculate + variable"
    );
    assert!(
        !result.non_relevant.contains(&"note".to_string()),
        "relevant"
    );
    assert!(result.diagnostics.is_empty(), "{:?}", result.diagnostics);

    let failures: Vec<(String, String, String)> = result
        .validations
        .iter()
        .map(|v| (v.path.clone(), v.code.to_string(), v.message.clone()))
        .collect();
    let expected = [
        ("#", "SHAPE_FAILED", "Too big: 10"),
        ("rows[0].n", "SHAPE_FAILED", "Row cap"),
    ]
    .map(|(p, c, m)| (p.to_string(), c.to_string(), m.to_string()));
    assert_eq!(
        failures, expected,
        "bind constraints pass; shape, wildcard shape, and message interpolation call extensions"
    );
}

/// Core §3.12 / §3.10.1: without the host registration the same Definition is a definition error.
#[test]
fn unregistered_extension_stays_a_definition_error() {
    let result = evaluate(
        &definition(),
        &data(),
        &EvalOptions::default().trigger(EvalTrigger::Submit),
    );

    // Rebuild refuses the entire Definition, including creation-time expressions.
    assert!(result.refused);
    assert!(
        result
            .validations
            .iter()
            .any(|finding| finding.path == "$.binds[2].constraint"
                && finding.code == "UNDEFINED_FUNCTION")
    );
    assert!(result.diagnostics.is_empty());
}

#[test]
fn diagnostics_follow_up_checks_extension_signatures_per_evaluation_without_calling_them() {
    let def = json!({"items": [{"key": "result", "type": "field", "dataType": "integer"}],
        "binds": [{"path": "result", "calculate": "double(5)"}]});
    let prepared = formspec_eval::PreparedDefinition::new(def);
    let mut wrong = ExtensionRegistry::new();
    wrong
        .register("double", 2, Some(2), |_| panic!("invalid call executed"))
        .unwrap();
    let right = registry();
    let data = HashMap::new();
    for (options, code) in [
        (EvalOptions::default().extensions(&wrong), "ARITY_MISMATCH"),
        (EvalOptions::default(), "UNDEFINED_FUNCTION"),
        (EvalOptions::default().extensions(&wrong), "ARITY_MISMATCH"),
    ] {
        let refused = prepared.evaluate(&data, &options);
        assert_eq!(refused.data, json!({}));
        assert_eq!(refused.validations.len(), 1);
        assert_eq!(refused.validations[0].path, "$.binds[0].calculate");
        assert_eq!(refused.validations[0].code, code);
        assert!(refused.diagnostics.is_empty());
        assert_eq!(
            prepared
                .evaluate(&data, &EvalOptions::default().extensions(&right))
                .data,
            json!({"result": 10})
        );
    }
}

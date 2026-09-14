//! Core §3.12: host extension functions reach every expression site through `EvalOptions`.

use fel_core::{ExtensionRegistry, Value as FelValue};
use formspec_eval::{EvalOptions, EvalTrigger, evaluate};
use rust_decimal::Decimal;
use serde_json::{Value, json};
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

    let result = evaluate(&definition(), &data(), &options);

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

    let qty = result
        .validations
        .iter()
        .find(|v| v.path == "qty")
        .expect("qty constraint result");
    assert_eq!(qty.code, "CONSTRAINT_PARSE_ERROR");
}

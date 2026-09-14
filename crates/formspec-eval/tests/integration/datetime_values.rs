//! Core §2.1.3 `date`/`dateTime` response values: authored text survives, FEL sees `date`.

use formspec_eval::{EvalContext, EvalOptions, evaluate};
use serde_json::{Value, json};
use std::collections::HashMap;

fn defaulted_datetime_definition(default: &str) -> Value {
    json!({
        "$formspec": "1.0",
        "url": "test",
        "version": "1.0.0",
        "title": "T",
        "items": [
            { "key": "toggle", "type": "field", "dataType": "boolean", "label": "Toggle" },
            { "key": "when", "type": "field", "dataType": "dateTime", "label": "When" },
            { "key": "kind", "type": "field", "dataType": "string", "label": "Kind" }
        ],
        "binds": [
            { "path": "when", "relevant": "$toggle", "default": default },
            { "path": "kind", "calculate": "typeOf($when)" }
        ]
    })
}

/// A literal `default` is the authored response value; the FEL date is only its reading.
#[test]
fn datetime_default_keeps_authored_zone_offset_and_precision() {
    for authored in [
        "2025-03-01T10:30:00+05:00",
        "2025-03-01T10:30:00Z",
        "2025-03-01T10:30",
    ] {
        let data = HashMap::from([("toggle".to_string(), json!(true))]);
        let options = EvalOptions::default().context(EvalContext {
            previous_non_relevant: Some(vec!["when".to_string()]),
            ..EvalContext::default()
        });
        let result = evaluate(&defaulted_datetime_definition(authored), &data, &options);

        assert_eq!(
            result.values.get("when"),
            Some(&json!(authored)),
            "{authored}"
        );
        assert_eq!(
            result.values.get("kind"),
            Some(&json!("date")),
            "{authored}"
        );
    }
}

/// A `datetime-local` value (`YYYY-MM-DDTHH:MM`) is a valid dateTime and reads as FEL `date`.
#[test]
fn datetime_without_seconds_is_valid_and_reads_as_fel_date() {
    let def = json!({
        "$formspec": "1.0",
        "url": "test",
        "version": "1.0.0",
        "title": "T",
        "items": [
            { "key": "when", "type": "field", "dataType": "dateTime", "label": "When" },
            { "key": "late", "type": "field", "dataType": "boolean", "label": "Late" }
        ],
        "binds": [
            { "path": "late", "calculate": "$when > date('2025-03-01T09:00:00')" }
        ]
    });
    let data = HashMap::from([("when".to_string(), json!("2025-03-01T10:30"))]);
    let result = evaluate(&def, &data, &EvalOptions::default());

    assert!(result.validations.is_empty(), "{:?}", result.validations);
    assert!(result.diagnostics.is_empty(), "{:?}", result.diagnostics);
    assert_eq!(result.values.get("when"), Some(&json!("2025-03-01T10:30")));
    assert_eq!(result.values.get("late"), Some(&json!(true)));
}

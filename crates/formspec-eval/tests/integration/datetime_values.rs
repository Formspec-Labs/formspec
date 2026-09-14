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

/// A variable's type is its expression's FEL value (Core §4.5): `@deadline = $d` is a `date`
/// everywhere it is read, not the string its JSON output renders.
#[test]
fn date_valued_variables_stay_fel_dates() {
    let def = json!({
        "$formspec": "1.0",
        "url": "test",
        "version": "1.0.0",
        "title": "T",
        "items": [
            { "key": "d", "type": "field", "dataType": "date", "label": "D" },
            { "key": "d2", "type": "field", "dataType": "date", "label": "D2" },
            { "key": "kind", "type": "field", "dataType": "string", "label": "Kind" },
            { "key": "later", "type": "field", "dataType": "boolean", "label": "Later" },
            {
                "key": "g",
                "type": "group",
                "label": "G",
                "children": [
                    { "key": "gd", "type": "field", "dataType": "date", "label": "GD" },
                    { "key": "gkind", "type": "field", "dataType": "string", "label": "GKind" }
                ]
            }
        ],
        "variables": [
            { "name": "deadline", "expression": "$d" },
            { "name": "groupDeadline", "expression": "$gd", "scope": "g" }
        ],
        "binds": [
            { "path": "kind", "calculate": "typeOf(@deadline)" },
            { "path": "later", "calculate": "@deadline > $d2" },
            { "path": "d2", "constraint": "$d2 <= @deadline" },
            { "path": "g.gkind", "calculate": "typeOf(@groupDeadline)" }
        ],
        "shapes": [
            { "id": "early", "target": "#", "constraint": "@deadline >= date('2025-06-01')", "message": "early" }
        ]
    });
    let data = HashMap::from([
        ("d".to_string(), json!("2025-03-01")),
        ("d2".to_string(), json!("2025-02-01")),
        ("g.gd".to_string(), json!("2025-04-01")),
    ]);
    let result = evaluate(&def, &data, &EvalOptions::default());

    assert_eq!(result.values.get("kind"), Some(&json!("date")));
    assert_eq!(result.values.get("later"), Some(&json!(true)));
    assert_eq!(result.values.get("g.gkind"), Some(&json!("date")));
    let shape_ids: Vec<Option<&str>> = result
        .validations
        .iter()
        .map(|v| v.shape_id.as_deref())
        .collect();
    assert_eq!(shape_ids, vec![Some("early")], "{:?}", result.validations);
    assert!(result.diagnostics.is_empty(), "{:?}", result.diagnostics);
    assert_eq!(result.variables.get("deadline"), Some(&json!("2025-03-01")));
}

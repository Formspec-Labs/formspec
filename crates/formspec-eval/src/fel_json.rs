//! Money-aware and date-aware JSON normalization for FEL field/variable loading (shared across pipeline stages).
//!
//! Spec S2.1.3: `dataType: "date"` maps to FEL type `date`. When response values
//! enter the evaluation context, date-typed fields must be resolved as FEL `date`
//! values, not raw JSON strings.
#![allow(clippy::missing_docs_in_private_items)]

use fel_core::{Value, json_to_fel, parse_date_literal, parse_datetime_literal};
use serde_json::Value as JsonValue;

fn normalize_money_like_json(value: &JsonValue) -> JsonValue {
    match value {
        JsonValue::Array(array) => {
            JsonValue::Array(array.iter().map(normalize_money_like_json).collect())
        }
        JsonValue::Object(object) => {
            let mut normalized: serde_json::Map<String, JsonValue> = object
                .iter()
                .map(|(key, value)| (key.clone(), normalize_money_like_json(value)))
                .collect();
            if !normalized.contains_key("$type")
                && normalized.contains_key("amount")
                && normalized.contains_key("currency")
            {
                normalized.insert("$type".to_string(), JsonValue::String("money".to_string()));
            }
            JsonValue::Object(normalized)
        }
        _ => value.clone(),
    }
}

/// Convert response JSON to a FEL [`Value`] with the same money inference as recalculation and validation.
pub(crate) fn json_to_runtime_fel(value: &JsonValue) -> Value {
    json_to_fel(&normalize_money_like_json(value))
}

/// Convert response JSON to a FEL [`Value`] with type-aware coercion.
///
/// When `data_type` is `"date"` or `"dateTime"`, ISO date strings are coerced
/// to `Value::Date` at context entry (spec S2.1.3). This keeps the FEL
/// evaluator type-strict while ensuring date comparisons work correctly.
pub(crate) fn json_to_runtime_fel_typed(value: &JsonValue, data_type: Option<&str>) -> Value {
    match data_type {
        Some("date") => {
            if let Some(s) = value.as_str() {
                if let Some(date) = parse_date_literal(&format!("@{s}")) {
                    return Value::Date(date);
                }
            }
        }
        Some("dateTime") => {
            if let Some(s) = value.as_str() {
                if let Some(dt) = parse_datetime_literal(&format!("@{s}")) {
                    return Value::Date(dt);
                }
                // Fall back to date-only parse for dateTime fields with date-only strings
                if let Some(date) = parse_date_literal(&format!("@{s}")) {
                    return Value::Date(date);
                }
            }
        }
        _ => {}
    }
    json_to_runtime_fel(value)
}

//! Money-aware and date-aware JSON normalization for FEL field/variable loading (shared across pipeline stages).
//!
//! Spec S2.1.3: `dataType: "date"` maps to FEL type `date`. When response values
//! enter the evaluation context, date-typed fields must be resolved as FEL `date`
//! values, not raw JSON strings.
#![allow(clippy::missing_docs_in_private_items)]

use fel_core::{Value, json_to_fel};
use serde_json::{Value as JsonValue, json};

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

/// Tag a response leaf with its field `dataType` so [`json_to_fel`] decodes the spec FEL type.
///
/// Core §2.1.3 maps `date` and `dateTime` to FEL `date`. Strings for those types
/// become fel-core's `{"$type": "date", "value": ...}` envelope, so fel-core owns
/// the ISO parse (unparsable text decodes to `null`). The engine's ad-hoc FEL
/// context uses the same envelope. Other values pass through unchanged.
pub(crate) fn typed_json_leaf(value: &JsonValue, data_type: Option<&str>) -> JsonValue {
    match (data_type, value) {
        (Some("date" | "dateTime"), JsonValue::String(text)) => {
            json!({ "$type": "date", "value": text })
        }
        _ => value.clone(),
    }
}

/// Convert a response leaf of field type `data_type` to a FEL [`Value`] (Core §2.1.3).
pub(crate) fn json_to_runtime_fel_typed(value: &JsonValue, data_type: Option<&str>) -> Value {
    json_to_runtime_fel(&typed_json_leaf(value, data_type))
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;

    #[test]
    fn date_and_datetime_strings_decode_as_fel_dates() {
        for (data_type, text) in [
            ("date", "2025-03-01"),
            ("dateTime", "2025-03-01T10:30:00"),
            ("dateTime", "2025-03-01"),
        ] {
            let value = json_to_runtime_fel_typed(&json!(text), Some(data_type));
            assert!(
                matches!(value, Value::Date(_)),
                "{data_type} {text:?} -> {value:?}"
            );
        }
    }

    /// fel-core's date envelope owns the parse: text that is not a date is `null`, not a string.
    #[test]
    fn unparsable_date_text_decodes_as_null() {
        assert_eq!(
            json_to_runtime_fel_typed(&json!("not-a-date"), Some("date")),
            Value::Null
        );
    }

    #[test]
    fn untyped_and_non_string_leaves_pass_through() {
        assert_eq!(
            json_to_runtime_fel_typed(&json!("2025-03-01"), Some("string")),
            Value::String("2025-03-01".to_string())
        );
        assert_eq!(
            json_to_runtime_fel_typed(&json!(null), Some("date")),
            Value::Null
        );
    }
}

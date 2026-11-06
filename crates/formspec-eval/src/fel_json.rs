//! Money-aware and date-aware JSON normalization for FEL field/variable loading (shared across pipeline stages).
//!
//! Spec S2.1.3: `dataType: "date"` maps to FEL type `date`. When response values
//! enter the evaluation context, date-typed fields must be resolved as FEL `date`
//! values, not raw JSON strings.
#![allow(clippy::missing_docs_in_private_items)]

use fel_core::{
    Value,
    exact_json::{self, Value as JsonValue},
};
use rust_decimal::Decimal;

pub(crate) use exact_json::from_fel as fel_to_runtime_json;

/// Convert ordinary JSON to FEL; money inference follows the form data model.
pub(crate) fn json_to_runtime_fel(value: &JsonValue) -> Value {
    match value {
        JsonValue::Array(values) => Value::Array(values.iter().map(json_to_runtime_fel).collect()),
        JsonValue::Object(object) => {
            if let (Some(amount), Some(currency)) = (
                object.get("amount"),
                object.get("currency").and_then(JsonValue::as_str),
            ) {
                let amount = amount.as_decimal().or_else(|| {
                    amount
                        .as_str()
                        .and_then(|s| Decimal::from_str_exact(s).ok())
                });
                if let (Some(amount), Some(currency)) =
                    (amount, fel_core::CurrencyCode::parse(currency))
                {
                    return Value::Money(fel_core::Money { amount, currency });
                }
            }
            Value::Object(
                object
                    .iter()
                    .map(|(k, v)| (k.clone(), json_to_runtime_fel(v)))
                    .collect(),
            )
        }
        _ => exact_json::to_fel(value).unwrap_or(Value::Null),
    }
}

/// Convert a nested response using the same field typing as flat values.
pub(crate) fn json_tree_to_runtime_fel<'a>(
    value: &JsonValue,
    path: &str,
    data_type: &impl Fn(&str) -> Option<&'a str>,
) -> Value {
    if data_type(path).is_some() {
        return json_to_runtime_fel_typed(value, data_type(path));
    }
    match value {
        JsonValue::Object(object) => Value::Object(
            object
                .iter()
                .map(|(key, value)| {
                    let child = if path.is_empty() {
                        key.clone()
                    } else {
                        format!("{path}.{key}")
                    };
                    (
                        key.clone(),
                        json_tree_to_runtime_fel(value, &child, data_type),
                    )
                })
                .collect(),
        ),
        JsonValue::Array(array) => Value::Array(
            array
                .iter()
                .enumerate()
                .map(|(index, value)| {
                    json_tree_to_runtime_fel(value, &format!("{path}[{index}]"), data_type)
                })
                .collect(),
        ),
        _ => json_to_runtime_fel(value),
    }
}

/// Whether a field `dataType` reads as FEL `date` (Core §2.1.3).
///
/// FEL `date` has no zone, offset, or source precision, so its JSON rendering
/// is not the response value: keep the authored text for these types.
pub(crate) fn is_date_data_type(data_type: Option<&str>) -> bool {
    matches!(data_type, Some("date" | "dateTime"))
}

/// Convert a response leaf of field type `data_type` to a FEL [`Value`] (Core §2.1.3).
pub(crate) fn json_to_runtime_fel_typed(value: &JsonValue, data_type: Option<&str>) -> Value {
    if is_date_data_type(data_type) {
        if let Some(text) = value.as_str() {
            return fel_core::parse_datetime_literal(&format!("@{text}"))
                .or_else(|| fel_core::parse_date_literal(&format!("@{text}")))
                .map(Value::Date)
                .unwrap_or(Value::Null);
        }
    }
    json_to_runtime_fel(value)
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;
    use fel_core::exact_json::native_json as json;

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

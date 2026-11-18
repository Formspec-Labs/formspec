//! Core §4.3.1 emptiness after input whitespace normalization.

use fel_core::exact_json::Value;

/// Required, type and constraint checks share the same definition of an empty value.
pub(crate) fn is_empty_bind_value(value: &Value) -> bool {
    match value {
        Value::Null => true,
        Value::String(text) => text.is_empty(),
        Value::Array(items) => items.is_empty(),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use fel_core::exact_json::native_json as json;

    #[test]
    fn only_null_empty_strings_and_empty_arrays_are_empty() {
        for empty in [Value::Null, json!(""), json!([])] {
            assert!(is_empty_bind_value(&empty));
        }
        for present in [json!("   "), json!([null]), json!({}), json!(false), json!(0)] {
            assert!(!is_empty_bind_value(&present));
        }
    }
}

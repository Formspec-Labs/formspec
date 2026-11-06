//! Shared predicates for “is this value empty?” across bind validation (required vs constraint rules differ).

use fel_core::exact_json::Value;

/// `required` bind: empty means null, whitespace-only string, or empty array.
pub(crate) fn is_empty_for_required_bind(val: &Value) -> bool {
    match val {
        Value::Null => true,
        Value::String(s) => s.trim().is_empty(),
        Value::Array(arr) => arr.is_empty(),
        _ => false,
    }
}

/// Bind `constraint` and extension value checks (§3.8.1): skip when null, **non-trimmed** empty string, or empty array.
pub(crate) fn value_skips_optional_bind_checks(val: &Value) -> bool {
    match val {
        Value::Null => true,
        Value::String(s) => s.is_empty(),
        Value::Array(arr) => arr.is_empty(),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;
    use fel_core::exact_json::native_json as json;

    #[test]
    fn required_trims_string_whitespace_only() {
        assert!(is_empty_for_required_bind(&json!("   ")));
        assert!(!value_skips_optional_bind_checks(&json!("   ")));
    }

    #[test]
    fn constraint_does_not_trim_whitespace_only_string() {
        assert!(!value_skips_optional_bind_checks(&json!(" x ")));
        assert!(value_skips_optional_bind_checks(&json!("")));
    }
}

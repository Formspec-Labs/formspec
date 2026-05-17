//! Value resolution helpers for dotted paths and nested objects.

use formspec_core::path_utils::{Path, PathSegment};
use serde_json::Value;
use std::collections::HashMap;

/// Resolve a value from a flat HashMap by dotted path, walking nested objects if needed.
/// Returns an owned Value because the result may not exist in the HashMap.
pub fn resolve_value_by_path(values: &HashMap<String, Value>, path: &str) -> Value {
    if let Some(val) = values.get(path) {
        return val.clone();
    }
    let parsed = Path::parse(path);
    let mut iter = parsed.segments.iter();
    let root_key = match iter.next() {
        Some(PathSegment::Exact(s)) => s,
        _ => return Value::Null,
    };
    let Some(root) = values.get(root_key.as_str()) else {
        return Value::Null;
    };
    let mut current = root;
    for seg in iter {
        current = match seg {
            PathSegment::Exact(key) => match current {
                Value::Object(map) => match map.get(key) {
                    Some(v) => v,
                    None => return Value::Null,
                },
                _ => return Value::Null,
            },
            PathSegment::Indexed(idx) => match current.as_array().and_then(|a| a.get(*idx)) {
                Some(v) => v,
                None => return Value::Null,
            },
            _ => return Value::Null,
        };
    }
    current.clone()
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;
    use serde_json::json;

    #[test]
    fn resolve_value_by_path_empty_path() {
        let values = HashMap::new();
        let result = resolve_value_by_path(&values, "");
        assert_eq!(result, Value::Null);
    }

    #[test]
    fn resolve_value_by_path_flat_lookup() {
        let mut values = HashMap::new();
        values.insert("name".to_string(), json!("Alice"));
        assert_eq!(resolve_value_by_path(&values, "name"), json!("Alice"));
    }

    #[test]
    fn resolve_value_by_path_nested_object() {
        let mut values = HashMap::new();
        values.insert("expenditures".to_string(), json!({"employment": 45000}));
        assert_eq!(
            resolve_value_by_path(&values, "expenditures.employment"),
            json!(45000)
        );
    }

    #[test]
    fn resolve_value_by_path_indexed() {
        let mut values = HashMap::new();
        values.insert("rows".to_string(), json!([{"a": 1}, {"a": 2}]));
        assert_eq!(resolve_value_by_path(&values, "rows[0].a"), json!(1));
        assert_eq!(resolve_value_by_path(&values, "rows[1].a"), json!(2));
    }

    #[test]
    fn resolve_value_by_path_missing() {
        let values = HashMap::new();
        assert_eq!(
            resolve_value_by_path(&values, "nonexistent.path"),
            Value::Null
        );
    }
}

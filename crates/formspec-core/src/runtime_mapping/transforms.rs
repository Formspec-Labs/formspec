//! Value-map, coercion, flatten string, and FEL evaluation helpers.
//!
//! `apply_*` functions implement individual [`TransformType`](super::types::TransformType) steps.
#![allow(clippy::missing_docs_in_private_items)]

use fel_core::{evaluate, fel_to_json, parse};
use serde_json::Value;

use super::env::build_mapping_env;
use super::types::{CoerceType, MappingDiagnostic, MappingErrorCode, UnmappedStrategy};

pub(crate) fn apply_value_map(
    value: &Value,
    map: &[(Value, Value)],
    unmapped: UnmappedStrategy,
    rule_idx: usize,
    target_path: &str,
    diagnostics: &mut Vec<MappingDiagnostic>,
    rule_default: Option<&Value>,
) -> Option<Value> {
    // Map keys are JSON object keys, so they are strings; a source value matches by its string form
    // (mapping spec: "matched by string equality" — `true` finds `"true"`, `2` finds `"2"`).
    let key = match value {
        Value::Bool(b) => Some(b.to_string()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    };
    for (from, to) in map {
        if value == from || (key.is_some() && from.as_str() == key.as_deref()) {
            return Some(to.clone());
        }
    }
    match unmapped {
        UnmappedStrategy::PassThrough => Some(value.clone()),
        UnmappedStrategy::Drop => None,
        UnmappedStrategy::Error => {
            diagnostics.push(MappingDiagnostic {
                rule_index: rule_idx,
                source_path: None,
                target_path: target_path.to_string(),
                error_code: MappingErrorCode::UnmappedValue,
                message: format!("No value map entry for: {value}"),
            });
            None // Error strategy skips the field (same as Drop)
        }
        UnmappedStrategy::Default => Some(rule_default.cloned().unwrap_or(Value::Null)),
    }
}

pub(crate) fn apply_coerce(
    value: &Value,
    target_type: CoerceType,
    _rule_idx: usize,
    _target_path: &str,
    _diagnostics: &mut [MappingDiagnostic],
) -> Value {
    match target_type {
        CoerceType::String => match value {
            Value::String(_) => value.clone(),
            Value::Number(n) => Value::String(n.to_string()),
            Value::Bool(b) => Value::String(b.to_string()),
            Value::Null => Value::Null,
            _ => Value::String(value.to_string()),
        },
        CoerceType::Number => match value {
            Value::Number(_) => value.clone(),
            Value::String(s) => {
                if let Ok(n) = s.parse::<f64>() {
                    serde_json::Number::from_f64(n)
                        .map(Value::Number)
                        .unwrap_or(Value::Null)
                } else {
                    Value::Null
                }
            }
            Value::Bool(b) => Value::Number(serde_json::Number::from(if *b { 1 } else { 0 })),
            _ => Value::Null,
        },
        CoerceType::Integer => match value {
            Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    Value::Number(serde_json::Number::from(i))
                } else if let Some(f) = n.as_f64() {
                    Value::Number(serde_json::Number::from(f as i64))
                } else {
                    Value::Null
                }
            }
            Value::String(s) => {
                if let Ok(i) = s.parse::<i64>() {
                    Value::Number(serde_json::Number::from(i))
                } else {
                    Value::Null
                }
            }
            _ => Value::Null,
        },
        CoerceType::Boolean => match value {
            Value::Bool(_) => value.clone(),
            Value::Number(n) => Value::Bool(n.as_f64().unwrap_or(0.0) != 0.0),
            Value::String(s) => match s.as_str() {
                "true" | "1" | "yes" => Value::Bool(true),
                "false" | "0" | "no" => Value::Bool(false),
                _ => Value::Null,
            },
            _ => Value::Null,
        },
        CoerceType::Date | CoerceType::DateTime => {
            // Dates pass through as strings
            match value {
                Value::String(_) => value.clone(),
                _ => Value::Null,
            }
        }
        CoerceType::Array => match value {
            Value::Array(_) => value.clone(),
            Value::Null => Value::Null,
            _ => Value::Array(vec![value.clone()]),
        },
    }
}
pub(crate) fn value_to_flat_string(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Null => "null".to_string(),
        other => other.to_string(),
    }
}
/// Evaluate a FEL expression with `$` bound to the source value and source document fields in scope.
pub(crate) fn eval_fel_with_dollar(
    fel_expr: &str,
    source_value: &Value,
    source_doc: &Value,
    rule_idx: usize,
    src_path: Option<&str>,
    tgt_path: &str,
    diagnostics: &mut Vec<MappingDiagnostic>,
) -> Value {
    match parse(fel_expr) {
        Ok(expr) => {
            let env = build_mapping_env(source_doc, &Value::Null, Some(source_value));
            let result = evaluate(&expr, &env);
            fel_to_json(&result.value)
        }
        Err(e) => {
            diagnostics.push(MappingDiagnostic {
                rule_index: rule_idx,
                source_path: src_path.map(String::from),
                target_path: tgt_path.to_string(),
                error_code: MappingErrorCode::FelRuntime,
                message: format!("FEL parse error: {e}"),
            });
            Value::Null
        }
    }
}

//! Inbound field coercion (parity with TS `coerceFieldValue` in `formspec-engine` helpers).

use serde_json::{Value, json};

fn data_type(item: &Value) -> Option<&str> {
    item.get("dataType")
        .and_then(|v| v.as_str())
}

fn item_currency(item: &Value) -> Option<&str> {
    item.get("currency").and_then(|v| v.as_str())
}

fn default_currency(definition: &Value) -> Option<&str> {
    definition
        .get("formPresentation")
        .and_then(|fp| {
            fp.get("defaultCurrency")
        })
        .and_then(|v| v.as_str())
}

fn is_numeric_data_type(dt: &str) -> bool {
    matches!(dt, "integer" | "decimal" | "number")
}

fn apply_whitespace(s: &str, mode: &str) -> String {
    match mode {
        "trim" => s.trim().to_string(),
        "normalize" => {
            let mut out = String::with_capacity(s.len());
            let mut pending_space = false;
            for ch in s.chars() {
                if ch.is_whitespace() {
                    pending_space = !out.is_empty();
                } else {
                    if pending_space {
                        out.push(' ');
                        pending_space = false;
                    }
                    out.push(ch);
                }
            }
            out.trim().to_string()
        }
        "remove" => s.chars().filter(|c| !c.is_whitespace()).collect(),
        _ => s.to_string(),
    }
}

fn json_number_from_f64(n: f64) -> Value {
    if n.is_nan() || n.is_infinite() {
        return Value::Null;
    }
    serde_json::Number::from_f64(n)
        .map(Value::Number)
        .unwrap_or(Value::Null)
}

fn round_to_precision(n: f64, precision: u32) -> f64 {
    let factor = 10_f64.powi(precision as i32);
    (n * factor).round() / factor
}

fn bind_whitespace(bind: Option<&Value>) -> Option<&str> {
    bind?.get("whitespace").and_then(|v| v.as_str())
}

fn bind_precision(bind: Option<&Value>) -> Option<u32> {
    let p = bind?.get("precision")?;
    let n = p
        .as_u64()
        .or_else(|| p.as_i64().filter(|&i| i >= 0).map(|i| i as u64))?;
    u32::try_from(n).ok()
}

/// Coerce an inbound field value (whitespace, numeric strings, money shape, `precision` rounding).
///
/// Matches TypeScript `coerceFieldValue(item, bind, definition, value)` in `packages/formspec-engine`.
pub fn coerce_field_value(
    item: &Value,
    bind: Option<&Value>,
    definition: &Value,
    mut value: Value,
) -> Value {
    if let Value::String(ref s) = value {
        if let Some(mode) = bind_whitespace(bind) {
            let t = apply_whitespace(s, mode);
            value = Value::String(t);
        }
    }

    if let Value::String(ref s) = value {
        if data_type(item).is_some_and(is_numeric_data_type) {
            value = if s.is_empty() {
                Value::Null
            } else if let Ok(n) = s.parse::<f64>() {
                json_number_from_f64(n)
            } else {
                Value::String(s.clone())
            };
        }
    }

    if data_type(item) == Some("money") {
        if let Value::Number(n) = &value {
            if let Some(f) = n.as_f64() {
                let cur = item_currency(item)
                    .or_else(|| default_currency(definition))
                    .unwrap_or("");
                value = json!({ "amount": f, "currency": cur });
            }
        } else if let Value::Object(map) = &value {
            if let Some(Value::String(amt_s)) = map.get("amount") {
                let mut out = map.clone();
                let amt_val = if amt_s.is_empty() {
                    Value::Null
                } else if let Ok(n) = amt_s.parse::<f64>() {
                    json_number_from_f64(n)
                } else {
                    Value::String(amt_s.clone())
                };
                out.insert("amount".to_string(), amt_val);
                if !out.contains_key("currency") {
                    let cur = item_currency(item)
                        .or_else(|| default_currency(definition))
                        .unwrap_or("");
                    out.insert("currency".to_string(), json!(cur));
                }
                value = Value::Object(out);
            } else if !map.contains_key("currency") {
                let mut out = map.clone();
                let cur = item_currency(item)
                    .or_else(|| default_currency(definition))
                    .unwrap_or("");
                out.insert("currency".to_string(), json!(cur));
                value = Value::Object(out);
            }
        }
    }

    if let Some(precision) = bind_precision(bind) {
        if let Some(f) = value.as_f64() {
            value = json_number_from_f64(round_to_precision(f, precision));
        } else if let Some(obj) = value.as_object_mut() {
            if let Some(amt) = obj.get("amount").and_then(|v| v.as_f64()) {
                obj.insert(
                    "amount".to_string(),
                    json_number_from_f64(round_to_precision(amt, precision)),
                );
            }
        }
    }

    value
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn item(dt: &str) -> Value {
        json!({ "dataType": dt })
    }

    #[test]
    fn whitespace_trim() {
        let b = json!({ "whitespace": "trim" });
        let out = coerce_field_value(&item("string"), Some(&b), &json!({}), json!("  hi  "));
        assert_eq!(out, json!("hi"));
    }

    #[test]
    fn whitespace_normalize() {
        let b = json!({ "whitespace": "normalize" });
        let out = coerce_field_value(&item("string"), Some(&b), &json!({}), json!("  hi   there  "));
        assert_eq!(out, json!("hi there"));
    }

    #[test]
    fn whitespace_remove() {
        let b = json!({ "whitespace": "remove" });
        let out = coerce_field_value(&item("string"), Some(&b), &json!({}), json!(" h i "));
        assert_eq!(out, json!("hi"));
    }

    #[test]
    fn integer_coercion() {
        let out = coerce_field_value(&item("integer"), None, &json!({}), json!("123"));
        assert_eq!(out, json!(123.0));
    }

    #[test]
    fn money_coercion() {
        let def = json!({ "formPresentation": { "defaultCurrency": "USD" } });
        let out = coerce_field_value(&item("money"), None, &def, json!(42));
        assert_eq!(out, json!({ "amount": 42.0, "currency": "USD" }));

        let out = coerce_field_value(&item("money"), None, &def, json!("42"));
        assert_eq!(out, json!("42")); // String "42" is not coerced to money object automatically

        let out = coerce_field_value(&item("money"), None, &def, json!({ "amount": "42.50" }));
        assert_eq!(out, json!({ "amount": 42.50, "currency": "USD" }));

        let out = coerce_field_value(&item("money"), None, &def, json!({ "amount": "" }));
        assert_eq!(out, json!({ "amount": null, "currency": "USD" }));
    }

    #[test]
    fn precision_rounds() {
        let b = json!({ "precision": 2 });
        let out = coerce_field_value(&item("decimal"), Some(&b), &json!({}), json!(1.234567));
        assert_eq!(out, json!(1.23));
    }
}

//! Inbound field coercion (parity with TS `coerceFieldValue` in `formspec-engine` helpers).

use fel_core::exact_json::{Number, Value, native_json as json};
use rust_decimal::{Decimal, RoundingStrategy};

fn data_type(item: &Value) -> Option<&str> {
    item.get("dataType").and_then(|v| v.as_str())
}

fn item_currency(item: &Value) -> Option<&str> {
    item.get("currency").and_then(|v| v.as_str())
}

fn default_currency(definition: &Value) -> Option<&str> {
    definition
        .get("formPresentation")
        .and_then(|fp| fp.get("defaultCurrency"))
        .and_then(|v| v.as_str())
}

fn is_numeric_data_type(dt: &str) -> bool {
    matches!(dt, "integer" | "decimal" | "number")
}

/// A case conversion for free-text input.
#[derive(Debug, Clone, Copy)]
pub enum LetterCase {
    /// Apply full Unicode uppercase conversion.
    Upper,
    /// Apply full Unicode lowercase conversion.
    Lower,
}

impl LetterCase {
    /// Whether a data type permits letter-case normalization.
    pub fn supports(data_type: Option<&str>) -> bool {
        matches!(data_type, Some("string" | "text"))
    }

    /// Read the effective mode, returning `None` when the field preserves case.
    pub fn for_field(data_type: Option<&str>, mode: Option<&str>) -> Option<Self> {
        if !Self::supports(data_type) {
            return None;
        }
        match mode {
            Some("upper") => Some(Self::Upper),
            Some("lower") => Some(Self::Lower),
            _ => None,
        }
    }

    /// Apply locale-independent Unicode case conversion.
    pub fn apply(self, value: &str) -> String {
        match self {
            Self::Upper => value.to_uppercase(),
            Self::Lower => value.to_lowercase(),
        }
    }
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

fn parse_decimal_number(text: &str) -> Option<Number> {
    Decimal::from_str_exact(text)
        .ok()
        .map(Number::from)
        .or_else(|| {
            text.parse::<Number>()
                .ok()
                .filter(|number| number.as_decimal().is_some())
        })
}

fn round_to_precision(number: Decimal, precision: u32) -> Value {
    Value::Number(
        number
            .round_dp_with_strategy(precision, RoundingStrategy::MidpointAwayFromZero)
            .into(),
    )
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

/// Normalize inbound text and coerce numbers, money, and precision.
///
/// Matches TypeScript `coerceFieldValue(item, bind, definition, value)` in `packages/formspec-engine`.
pub fn coerce_field_value(
    item: &Value,
    bind: Option<&Value>,
    definition: &Value,
    mut value: Value,
) -> Value {
    if let Value::String(text) = &mut value {
        if let Some(mode) = bind_whitespace(bind) {
            *text = apply_whitespace(text, mode);
        }
        let mode = bind
            .and_then(|bind| bind.get("letterCase"))
            .and_then(Value::as_str);
        if let Some(letter_case) = LetterCase::for_field(data_type(item), mode) {
            *text = letter_case.apply(text);
        }
    }

    if let Value::String(ref s) = value {
        if data_type(item).is_some_and(is_numeric_data_type) {
            value = if s.is_empty() {
                Value::Null
            } else if let Some(n) = parse_decimal_number(s) {
                Value::Number(n)
            } else {
                Value::String(s.clone())
            };
        }
    }

    if data_type(item) == Some("money") {
        if let Value::Number(n) = &value {
            if n.as_decimal().is_some() {
                let cur = item_currency(item)
                    .or_else(|| default_currency(definition))
                    .unwrap_or("");
                value = json!({ "amount": n.to_string(), "currency": cur });
            }
        } else if let Value::Object(map) = &mut value {
            if let Some(amount) = map.get_mut("amount") {
                let number = amount
                    .as_decimal()
                    .map(Number::from)
                    .or_else(|| amount.as_str().and_then(parse_decimal_number));
                if let Some(number) = number {
                    *amount = Value::String(number.to_string());
                } else if amount.as_str() == Some("") {
                    *amount = Value::Null;
                }
            }
            if !map.contains_key("currency") {
                let cur = item_currency(item)
                    .or_else(|| default_currency(definition))
                    .unwrap_or("");
                map.insert("currency".to_string(), json!(cur));
            }
        }
    }

    if let Some(precision) = bind_precision(bind) {
        if let Some(number) = value.as_decimal() {
            value = round_to_precision(number, precision);
        } else if let Some(obj) = value.as_object_mut() {
            if let Some(amt) = obj.get("amount").and_then(|v| {
                v.as_decimal().or_else(|| {
                    v.as_str()
                        .and_then(|s| parse_decimal_number(s)?.as_decimal())
                })
            }) {
                obj.insert(
                    "amount".to_string(),
                    Value::String(round_to_precision(amt, precision).to_string()),
                );
            }
        }
    }

    value
}

#[cfg(test)]
mod tests {
    use super::*;
    use fel_core::exact_json::native_json as json;

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
        let out = coerce_field_value(
            &item("string"),
            Some(&b),
            &json!({}),
            json!("  hi   there  "),
        );
        assert_eq!(out, json!("hi there"));
    }

    #[test]
    fn whitespace_remove() {
        let b = json!({ "whitespace": "remove" });
        let out = coerce_field_value(&item("string"), Some(&b), &json!({}), json!(" h i "));
        assert_eq!(out, json!("hi"));
    }

    #[test]
    fn letter_case_coerces_only_free_text() {
        for (data_type, mode, input, expected) in [
            ("string", "upper", " straße 7 ", "STRASSE7"),
            ("text", "lower", " Ο Σ ", "ος"),
            ("string", "preserve", " MiXeD ", "MiXeD"),
            (
                "uri",
                "upper",
                "https://example.test/MiXeD",
                "https://example.test/MiXeD",
            ),
            ("choice", "lower", "MiXeD", "MiXeD"),
        ] {
            let bind = json!({ "letterCase": mode, "whitespace": "remove" });
            assert_eq!(
                coerce_field_value(&item(data_type), Some(&bind), &json!({}), json!(input)),
                json!(expected),
                "{data_type} with {mode}",
            );
        }
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
        assert_eq!(out, json!({ "amount": "42", "currency": "USD" }));

        let out = coerce_field_value(&item("money"), None, &def, json!("42"));
        assert_eq!(out, json!("42")); // String "42" is not coerced to money object automatically

        let out = coerce_field_value(&item("money"), None, &def, json!({ "amount": "42.50" }));
        assert_eq!(out, json!({ "amount": "42.5", "currency": "USD" }));

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

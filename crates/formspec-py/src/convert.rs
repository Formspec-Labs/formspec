//! Python ↔ FEL / JSON conversion helpers for the PyO3 `formspec_rust` module.

use std::collections::HashMap;

use indexmap::IndexMap;
use pyo3::prelude::*;
use pyo3::types::{PyBool, PyDict, PyList};
use pythonize::depythonize;
use rust_decimal::Decimal;
use rust_decimal::prelude::{FromPrimitive, ToPrimitive};
use serde::de::DeserializeOwned;
use serde_json::Value as JsonValue;

use fel_core::{FormspecEnvironment, MipState, Value};
use formspec_core::extension_analysis::RegistryEntryStatus;
use formspec_core::registry_client;

use crate::PyObject;

pub(crate) use formspec_core::json_object_to_string_map;

/// Deserialize a Python object into `T` (typically `serde_json::Value`), mapping errors to `PyValueError`.
pub(crate) fn depythonize_json<T: DeserializeOwned>(obj: &Bound<'_, PyAny>) -> PyResult<T> {
    depythonize(obj).map_err(|e| pyo3::exceptions::PyValueError::new_err(e.to_string()))
}

/// Parse a FEL source string into an AST; maps [`fel_core::Error`] to `PyValueError`.
pub(crate) fn parse_fel_expr(source: &str) -> PyResult<fel_core::Expr> {
    fel_core::parse(source).map_err(|e| pyo3::exceptions::PyValueError::new_err(e.to_string()))
}

fn merge_fel_dict_into_env(
    py: Python,
    env: &mut FormspecEnvironment,
    dict: &Bound<'_, PyDict>,
    mut apply: impl FnMut(&mut FormspecEnvironment, &str, Value),
) -> PyResult<()> {
    for (key, value) in dict.iter() {
        let k: String = key.extract()?;
        apply(env, &k, python_to_fel(py, &value)?);
    }
    Ok(())
}

pub(crate) fn pydict_to_field_map(
    py: Python,
    dict: &Bound<'_, PyDict>,
) -> PyResult<HashMap<String, Value>> {
    let mut map = HashMap::new();
    for (key, value) in dict.iter() {
        let k: String = key.extract()?;
        let v = python_to_fel(py, &value)?;
        map.insert(k, v);
    }
    Ok(map)
}

pub(crate) fn build_formspec_env(
    py: Python,
    fields: Option<&Bound<'_, PyDict>>,
    instances: Option<&Bound<'_, PyDict>>,
    mip_states: Option<&Bound<'_, PyDict>>,
    variables: Option<&Bound<'_, PyDict>>,
    now_iso: Option<&str>,
) -> PyResult<FormspecEnvironment> {
    let mut env = FormspecEnvironment::new();

    if let Some(dict) = fields {
        merge_fel_dict_into_env(py, &mut env, dict, |e, k, v| e.set_field(k, v))?;
    }

    if let Some(dict) = instances {
        merge_fel_dict_into_env(py, &mut env, dict, |e, k, v| e.set_instance(k, v))?;
    }

    if let Some(dict) = mip_states {
        for (key, value) in dict.iter() {
            let k: String = key.extract()?;
            env.set_mip(&k, pyany_to_mip_state(&value)?);
        }
    }

    if let Some(dict) = variables {
        merge_fel_dict_into_env(py, &mut env, dict, |e, k, v| e.set_variable(k, v))?;
    }

    if let Some(now) = now_iso {
        env.set_now_from_iso(now);
    }

    Ok(env)
}

pub(crate) fn pyany_to_mip_state(obj: &Bound<'_, PyAny>) -> PyResult<MipState> {
    if let Ok(dict) = obj.cast::<PyDict>() {
        return Ok(MipState {
            valid: dict
                .get_item("valid")?
                .and_then(|value| value.extract::<bool>().ok())
                .unwrap_or(true),
            relevant: dict
                .get_item("relevant")?
                .and_then(|value| value.extract::<bool>().ok())
                .unwrap_or(true),
            readonly: dict
                .get_item("readonly")?
                .and_then(|value| value.extract::<bool>().ok())
                .unwrap_or(false),
            required: dict
                .get_item("required")?
                .and_then(|value| value.extract::<bool>().ok())
                .unwrap_or(false),
        });
    }

    Ok(MipState::default())
}

#[allow(clippy::only_used_in_recursion)]
pub(crate) fn python_to_fel(py: Python, obj: &Bound<'_, PyAny>) -> PyResult<Value> {
    if obj.is_none() {
        return Ok(Value::Null);
    }
    if let Ok(b) = obj.extract::<bool>() {
        return Ok(Value::Boolean(b));
    }
    if let Ok(i) = obj.extract::<i64>() {
        return Ok(Value::Number(Decimal::from(i)));
    }
    if let Ok(f) = obj.extract::<f64>() {
        return Ok(match Decimal::from_f64(f) {
            Some(d) => Value::Number(d),
            None => Value::Null, // NaN, Infinity → Null, not zero
        });
    }
    if let Ok(s) = obj.extract::<String>() {
        return Ok(Value::String(s));
    }
    if let Ok(list) = obj.cast::<PyList>() {
        let mut arr = Vec::new();
        for item in list.iter() {
            arr.push(python_to_fel(py, &item)?);
        }
        return Ok(Value::Array(arr));
    }
    if let Ok(dict) = obj.cast::<PyDict>() {
        let tagged_type = dict
            .get_item("__fel_type__")?
            .and_then(|value| value.extract::<String>().ok());
        if let Some(tagged_type) = tagged_type.as_deref() {
            match tagged_type {
                "number" => {
                    if let Some(raw) = dict.get_item("value")?
                        && let Ok(text) = raw.extract::<String>()
                    {
                        return Ok(match Decimal::from_str_exact(&text) {
                            Ok(d) => Value::Number(d),
                            Err(_) => Value::Null,
                        });
                    }
                }
                "date" | "datetime" => {
                    if let Some(raw) = dict.get_item("value")?
                        && let Ok(text) = raw.extract::<String>()
                    {
                        if let Some(date) = fel_core::parse_datetime_literal(&format!("@{text}")) {
                            return Ok(Value::Date(date));
                        }
                        if let Some(date) = fel_core::parse_date_literal(&format!("@{text}")) {
                            return Ok(Value::Date(date));
                        }
                    }
                }
                "money" => {
                    let amount_str = dict
                        .get_item("amount")?
                        .and_then(|value| value.extract::<String>().ok())
                        .unwrap_or_else(|| "0".to_string());
                    let currency = dict
                        .get_item("currency")?
                        .and_then(|value| value.extract::<String>().ok())
                        .unwrap_or_default();
                    return Ok(
                        match (
                            Decimal::from_str_exact(&amount_str).ok(),
                            fel_core::CurrencyCode::parse(&currency),
                        ) {
                            (Some(amount), Some(cc)) => Value::Money(fel_core::Money {
                                amount,
                                currency: cc,
                            }),
                            _ => Value::Null,
                        },
                    );
                }
                _ => {}
            }
        }

        let currency = dict
            .get_item("currency")?
            .and_then(|value| value.extract::<String>().ok());
        if let Some(currency) = currency
            && let Some(amount_obj) = dict.get_item("amount")?
        {
            // Try numeric extraction first (int → Decimal, float → Decimal)
            let maybe_decimal = if let Ok(i) = amount_obj.extract::<i64>() {
                Some(Decimal::from(i))
            } else if let Ok(f) = amount_obj.extract::<f64>() {
                Decimal::from_f64(f)
            } else if let Ok(s) = amount_obj.extract::<String>() {
                Decimal::from_str_exact(&s).ok()
            } else {
                None
            };
            if let Some(amount) = maybe_decimal {
                if let Some(cc) = fel_core::CurrencyCode::parse(&currency) {
                    return Ok(Value::Money(fel_core::Money {
                        amount,
                        currency: cc,
                    }));
                }
            }
        }

        let mut entries = IndexMap::new();
        for (k, v) in dict.iter() {
            let key: String = k.extract()?;
            let val = python_to_fel(py, &v)?;
            entries.insert(key, val);
        }
        return Ok(Value::Object(entries));
    }
    Err(pyo3::exceptions::PyTypeError::new_err(format!(
        "cannot convert Python type '{}' to FEL value",
        obj.get_type().name()?
    )))
}

pub(crate) fn fel_to_python(py: Python, val: &Value) -> PyResult<PyObject> {
    match val {
        Value::Null => Ok(py.None()),
        Value::Boolean(b) => Ok(PyBool::new(py, *b).to_owned().into_any().unbind()),
        Value::Number(n) => {
            if n.fract().is_zero()
                && let Some(i) = n.to_i64()
            {
                return Ok(i.into_pyobject(py)?.into_any().unbind());
            }
            if let Some(f) = n.to_f64() {
                Ok(f.into_pyobject(py)?.into_any().unbind())
            } else {
                Ok(py.None())
            }
        }
        Value::String(s) => Ok(s.into_pyobject(py)?.into_any().unbind()),
        Value::Date(d) => Ok(d.format_iso().into_pyobject(py)?.into_any().unbind()),
        Value::Array(arr) => {
            let list = PyList::empty(py);
            for item in arr {
                list.append(fel_to_python(py, item)?)?;
            }
            Ok(list.into())
        }
        Value::Object(entries) => {
            let dict = PyDict::new(py);
            for (k, v) in entries {
                dict.set_item(k, fel_to_python(py, v)?)?;
            }
            Ok(dict.into())
        }
        Value::Money(m) => {
            let dict = PyDict::new(py);
            dict.set_item("amount", fel_to_python(py, &Value::Number(m.amount))?)?;
            dict.set_item("currency", m.currency.as_str())?;
            Ok(dict.into())
        }
    }
}

pub(crate) fn fel_to_python_tagged(py: Python, val: &Value) -> PyResult<PyObject> {
    match val {
        Value::Null => Ok(py.None()),
        Value::Boolean(b) => Ok(PyBool::new(py, *b).to_owned().into_any().unbind()),
        Value::Number(n) => {
            let dict = PyDict::new(py);
            dict.set_item("__fel_type__", "number")?;
            dict.set_item("value", n.to_string())?;
            Ok(dict.into())
        }
        Value::String(s) => Ok(s.into_pyobject(py)?.into_any().unbind()),
        Value::Date(d) => {
            let dict = PyDict::new(py);
            dict.set_item(
                "__fel_type__",
                match d {
                    fel_core::Date::Date { .. } => "date",
                    fel_core::Date::DateTime { .. } => "datetime",
                },
            )?;
            dict.set_item("value", d.format_iso())?;
            Ok(dict.into())
        }
        Value::Array(arr) => {
            let list = PyList::empty(py);
            for item in arr {
                list.append(fel_to_python_tagged(py, item)?)?;
            }
            Ok(list.into())
        }
        Value::Object(entries) => {
            let dict = PyDict::new(py);
            for (k, v) in entries {
                dict.set_item(k, fel_to_python_tagged(py, v)?)?;
            }
            Ok(dict.into())
        }
        Value::Money(m) => {
            let dict = PyDict::new(py);
            dict.set_item("__fel_type__", "money")?;
            dict.set_item("amount", m.amount.to_string())?;
            dict.set_item("currency", m.currency.as_str())?;
            Ok(dict.into())
        }
    }
}

pub(crate) fn json_to_python(py: Python, val: &JsonValue) -> PyResult<PyObject> {
    match val {
        JsonValue::Null => Ok(py.None()),
        JsonValue::Bool(b) => Ok(PyBool::new(py, *b).to_owned().into_any().unbind()),
        JsonValue::Number(n) => {
            if let Some(i) = n.as_i64() {
                Ok(i.into_pyobject(py)?.into_any().unbind())
            } else if let Some(f) = n.as_f64() {
                Ok(f.into_pyobject(py)?.into_any().unbind())
            } else {
                Ok(py.None())
            }
        }
        JsonValue::String(s) => Ok(s.into_pyobject(py)?.into_any().unbind()),
        JsonValue::Array(arr) => {
            let list = PyList::empty(py);
            for item in arr {
                list.append(json_to_python(py, item)?)?;
            }
            Ok(list.into())
        }
        JsonValue::Object(map) => {
            let dict = PyDict::new(py);
            for (k, v) in map {
                dict.set_item(k, json_to_python(py, v)?)?;
            }
            Ok(dict.into())
        }
    }
}

/// Normalize tagged wire JSON fragments into UI-friendly host JSON.
///
/// The Python bridge historically returns untagged scalar values for host-facing
/// APIs (`evaluate_def`, `execute_mapping_doc`, trace payloads). Some internal
/// call paths can still surface tagged fragments (`{"$type":"number",...}`),
/// so this helper strips those tags while preserving normal object shape.
pub(crate) fn normalize_wire_json_for_python(val: &JsonValue) -> JsonValue {
    fn parse_decimal_number(text: &str) -> JsonValue {
        if let Ok(i) = text.parse::<i64>() {
            return JsonValue::Number(serde_json::Number::from(i));
        }
        let Ok(d) = Decimal::from_str_exact(text) else {
            return JsonValue::String(text.to_string());
        };
        if d.fract().is_zero()
            && let Some(i) = d.to_i64()
        {
            return JsonValue::Number(serde_json::Number::from(i));
        }
        if let Some(f) = d.to_f64()
            && f.is_finite()
            && let Some(back) = Decimal::from_f64(f)
            && back == d
            && let Some(num) = serde_json::Number::from_f64(f)
        {
            return JsonValue::Number(num);
        }
        JsonValue::String(text.to_string())
    }

    fn normalize_number_payload(value: &JsonValue) -> JsonValue {
        match value {
            JsonValue::Number(_) => value.clone(),
            JsonValue::String(text) => parse_decimal_number(text),
            other => other.clone(),
        }
    }

    match val {
        JsonValue::Array(arr) => JsonValue::Array(
            arr.iter()
                .map(normalize_wire_json_for_python)
                .collect::<Vec<_>>(),
        ),
        JsonValue::Object(map) => {
            if let Some(JsonValue::String(kind)) = map.get("$type") {
                match kind.as_str() {
                    "number" => {
                        if let Some(value) = map.get("value") {
                            return normalize_number_payload(value);
                        }
                    }
                    "date" | "datetime" => {
                        if let Some(value) = map.get("value") {
                            return value.clone();
                        }
                    }
                    "money" => {
                        let mut out = serde_json::Map::new();
                        out.insert("$type".to_string(), JsonValue::String("money".to_string()));
                        if let Some(amount) = map.get("amount") {
                            out.insert("amount".to_string(), normalize_number_payload(amount));
                        }
                        if let Some(currency) = map.get("currency") {
                            out.insert("currency".to_string(), currency.clone());
                        }
                        return JsonValue::Object(out);
                    }
                    _ => {}
                }
            }
            let normalized = map
                .iter()
                .map(|(k, v)| (k.clone(), normalize_wire_json_for_python(v)))
                .collect::<serde_json::Map<String, JsonValue>>();
            JsonValue::Object(normalized)
        }
        _ => val.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::normalize_wire_json_for_python;
    use serde_json::json;

    #[test]
    fn normalize_tagged_number_string_preserves_high_precision() {
        let input = json!({"$type":"number","value":"12345678901234567890.123456789012345678"});
        let out = normalize_wire_json_for_python(&input);
        assert_eq!(out, json!("12345678901234567890.123456789012345678"));
    }

    #[test]
    fn normalize_tagged_number_string_to_numeric_when_exactly_representable() {
        let input = json!({"$type":"number","value":"3.5"});
        let out = normalize_wire_json_for_python(&input);
        assert_eq!(out, json!(3.5));
    }

    #[test]
    fn normalize_nested_tagged_values_recursively() {
        let input = json!({
            "trace": [
                {"result": {"$type":"number", "value":"7"}},
                {"result": {"$type":"date", "value":"2026-05-07"}},
                {"result": {"$type":"money", "amount":"1000", "currency":"USD"}}
            ]
        });
        let out = normalize_wire_json_for_python(&input);
        assert_eq!(
            out,
            json!({
                "trace": [
                    {"result": 7},
                    {"result": "2026-05-07"},
                    {"result": {"$type":"money", "amount": 1000, "currency":"USD"}}
                ]
            })
        );
    }
}

// ── Registry helpers ────────────────────────────────────────────

pub(crate) fn parse_status_str(s: &str) -> Option<RegistryEntryStatus> {
    registry_client::parse_registry_entry_status(s)
}

#[cfg(test)]
pub(crate) fn status_str(s: RegistryEntryStatus) -> &'static str {
    registry_client::registry_entry_status_to_wire(s)
}

#[cfg(test)]
pub(crate) fn category_str(c: registry_client::ExtensionCategory) -> &'static str {
    registry_client::extension_category_to_wire(c)
}

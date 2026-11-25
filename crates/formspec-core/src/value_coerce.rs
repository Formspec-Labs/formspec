//! Inbound field coercion (parity with TS `coerceFieldValue` in `formspec-engine` helpers)
//! and whole-Response data canonicalization.

use std::collections::HashMap;

use fel_core::exact_json::{Map, Number, Value, native_json as json};
use rust_decimal::{Decimal, RoundingStrategy};

use crate::bind_targets::BindTargets;
use crate::repeat_references::is_repeatable_group;

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

fn precision(item: &Value, bind: Option<&Value>) -> Option<u32> {
    let p = bind
        .and_then(|bind| bind.get("precision"))
        .or_else(|| item.get("precision"))?;
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

    if let Some(precision) = precision(item, bind) {
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

/// Kind of a declared Definition item within one Response `data` object scope.
#[derive(Clone, Copy)]
enum ScopeItemKind {
    /// A scalar/value field item.
    Field,
    /// A group item (nested object when non-repeatable, array of row objects when repeatable).
    Group {
        /// Whether this group repeats (`repeatable: true`).
        repeatable: bool,
    },
}

/// One declared item whose key belongs to the current Response `data` object scope.
struct ScopeItem<'a> {
    /// Raw Definition item JSON.
    item: &'a Value,
    /// Declared item kind (never `display`).
    kind: ScopeItemKind,
    /// Concrete Definition model path including zero-based repeat indexes (for `@index = N` Binds).
    model_instance_path: String,
    /// Unindexed Definition model path (for template Binds, `[*]` stripped).
    model_template_path: String,
    /// Concrete Response `data` path reported for canonicalization changes.
    data_path: String,
}

/// Effective Definition item type matching evaluator rebuild inference.
fn effective_item_type(item: &Value) -> &str {
    item.get("type")
        .and_then(Value::as_str)
        .unwrap_or_else(|| {
            if item.get("children").is_some() || item.get("repeatable").is_some() {
                "group"
            } else {
                "field"
            }
        })
}

/// Join a non-empty prefix with a child key.
fn join_path(prefix: &str, key: &str) -> String {
    if prefix.is_empty() {
        key.to_string()
    } else {
        format!("{prefix}.{key}")
    }
}

/// Split `segment` into `(name, Some(index))` when it ends with `[digits]`.
fn split_index(segment: &str) -> (&str, Option<usize>) {
    if let Some((s, open)) = segment
        .strip_suffix(']')
        .and_then(|s| s.rfind('[').map(|o| (s, o)))
        && let Ok(i) = s[open + 1..].parse::<usize>()
    {
        return (&s[..open], Some(i));
    }
    (segment, None)
}

/// Collect declared items residing directly in one Response `data` object scope.
///
/// Display items have no Response `data` representation and are excluded. Dependent
/// children of scalar fields share their parent's Response `data` object, so they are
/// flattened into the same `data_prefix` while keeping their authored model paths.
fn collect_object_scope<'a>(
    items: &'a [Value],
    model_instance_prefix: &str,
    model_template_prefix: &str,
    data_prefix: &str,
    out: &mut HashMap<&'a str, ScopeItem<'a>>,
) {
    for item in items {
        let Some(key) = item.get("key").and_then(Value::as_str) else {
            continue;
        };
        let item_type = effective_item_type(item);
        if item_type == "display" {
            continue;
        }
        let model_instance_path = join_path(model_instance_prefix, key);
        let model_template_path = join_path(model_template_prefix, key);
        let data_path = join_path(data_prefix, key);
        if item_type == "group" {
            let repeatable = is_repeatable_group(
                Some(item_type),
                item.get("repeatable").and_then(Value::as_bool),
            );
            out.insert(
                key,
                ScopeItem {
                    item,
                    kind: ScopeItemKind::Group { repeatable },
                    model_instance_path,
                    model_template_path,
                    data_path,
                },
            );
        } else {
            let children = item
                .get("children")
                .and_then(Value::as_array)
                .map(Vec::as_slice)
                .unwrap_or_default();
            out.insert(
                key,
                ScopeItem {
                    item,
                    kind: ScopeItemKind::Field,
                    model_instance_path: model_instance_path.clone(),
                    model_template_path: model_template_path.clone(),
                    data_path,
                },
            );
            collect_object_scope(
                children,
                &model_instance_path,
                &model_template_path,
                data_prefix,
                out,
            );
        }
    }
}

/// Resolve the effective Bind for an item using only authored Bind paths (no bare-key fallback).
fn resolve_authored_bind(
    binds: &BindTargets<'_, Value>,
    model_instance_path: &str,
    model_template_path: &str,
) -> Option<Value> {
    let merged = binds
        .merged_concrete(model_instance_path)
        .unwrap_or_else(|| binds.merged(model_template_path));
    (!merged.is_empty()).then_some(Value::Object(merged))
}

/// Coerce a single declared field value in place and record any difference.
fn canonicalize_field_value(
    definition: &Value,
    binds: &BindTargets<'_, Value>,
    entry: &ScopeItem<'_>,
    value: &mut Value,
    changes: &mut Option<&mut Vec<(String, Value)>>,
) {
    let bind = resolve_authored_bind(
        binds,
        &entry.model_instance_path,
        &entry.model_template_path,
    );
    let coerced = coerce_field_value(entry.item, bind.as_ref(), definition, value.clone());
    if coerced != *value {
        if let Some(list) = changes.as_deref_mut() {
            list.push((entry.data_path.clone(), coerced.clone()));
        }
        *value = coerced;
    }
}

/// Canonicalize a flat dotted/indexed key in place when it resolves through declared items.
#[expect(
    clippy::too_many_arguments,
    reason = "tracks parallel model instance/template paths and Response data path during flat-key walk"
)]
fn canonicalize_flat_key(
    definition: &Value,
    binds: &BindTargets<'_, Value>,
    items: &[Value],
    key: &str,
    value: &mut Value,
    model_instance_prefix: &str,
    model_template_prefix: &str,
    data_prefix: &str,
    changes: &mut Option<&mut Vec<(String, Value)>>,
) {
    let mut scope = HashMap::new();
    collect_object_scope(
        items,
        model_instance_prefix,
        model_template_prefix,
        data_prefix,
        &mut scope,
    );
    if let Some(entry) = scope.get(key) {
        match entry.kind {
            ScopeItemKind::Field => {
                canonicalize_field_value(definition, binds, entry, value, changes);
            }
            ScopeItemKind::Group { repeatable: false } => {
                if let Value::Object(map) = value {
                    let children = entry
                        .item
                        .get("children")
                        .and_then(Value::as_array)
                        .map(Vec::as_slice)
                        .unwrap_or_default();
                    canonicalize_object(
                        definition,
                        binds,
                        children,
                        map,
                        &entry.model_instance_path,
                        &entry.model_template_path,
                        &entry.data_path,
                        changes,
                    );
                }
            }
            ScopeItemKind::Group { repeatable: true } => {
                if let Value::Array(rows) = value {
                    let children = entry
                        .item
                        .get("children")
                        .and_then(Value::as_array)
                        .map(Vec::as_slice)
                        .unwrap_or_default();
                    for (i, row) in rows.iter_mut().enumerate() {
                        if let Value::Object(row_map) = row {
                            let row_model = format!("{}[{i}]", entry.model_instance_path);
                            let row_data = format!("{}[{i}]", entry.data_path);
                            canonicalize_object(
                                definition,
                                binds,
                                children,
                                row_map,
                                &row_model,
                                &entry.model_template_path,
                                &row_data,
                                changes,
                            );
                        }
                    }
                }
            }
        }
        return;
    }

    let (segment, rest) = match key.split_once('.') {
        Some((head, tail)) => (head, Some(tail)),
        None => (key, None),
    };
    let (name, index) = split_index(segment);
    let Some(entry) = scope.get(name) else {
        return;
    };
    let children = entry
        .item
        .get("children")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default();
    match (entry.kind, index, rest) {
        (ScopeItemKind::Group { repeatable: true }, Some(i), Some(rest)) => {
            let row_model = format!("{}[{i}]", entry.model_instance_path);
            let row_data = format!("{}[{i}]", entry.data_path);
            canonicalize_flat_key(
                definition,
                binds,
                children,
                rest,
                value,
                &row_model,
                &entry.model_template_path,
                &row_data,
                changes,
            );
        }
        (ScopeItemKind::Group { repeatable: true }, Some(i), None) => {
            if let Value::Object(row_map) = value {
                let row_model = format!("{}[{i}]", entry.model_instance_path);
                let row_data = format!("{}[{i}]", entry.data_path);
                canonicalize_object(
                    definition,
                    binds,
                    children,
                    row_map,
                    &row_model,
                    &entry.model_template_path,
                    &row_data,
                    changes,
                );
            }
        }
        (ScopeItemKind::Group { repeatable: false }, None, Some(rest)) => {
            canonicalize_flat_key(
                definition,
                binds,
                children,
                rest,
                value,
                &entry.model_instance_path,
                &entry.model_template_path,
                &entry.data_path,
                changes,
            );
        }
        (ScopeItemKind::Field, None, Some(rest)) if !children.is_empty() => {
            canonicalize_flat_key(
                definition,
                binds,
                children,
                rest,
                value,
                &entry.model_instance_path,
                &entry.model_template_path,
                data_prefix,
                changes,
            );
        }
        _ => {}
    }
}

/// Canonicalize one Response `data` object scope in place.
#[expect(
    clippy::too_many_arguments,
    reason = "tracks parallel model instance/template paths and Response data path during tree walk"
)]
fn canonicalize_object(
    definition: &Value,
    binds: &BindTargets<'_, Value>,
    items: &[Value],
    map: &mut Map<String, Value>,
    model_instance_prefix: &str,
    model_template_prefix: &str,
    data_prefix: &str,
    changes: &mut Option<&mut Vec<(String, Value)>>,
) {
    let mut scope = HashMap::new();
    collect_object_scope(
        items,
        model_instance_prefix,
        model_template_prefix,
        data_prefix,
        &mut scope,
    );
    for (raw_key, value) in map.iter_mut() {
        if let Some(entry) = scope.get(raw_key.as_str()) {
            match entry.kind {
                ScopeItemKind::Field => {
                    canonicalize_field_value(definition, binds, entry, value, changes);
                }
                ScopeItemKind::Group { repeatable: false } => {
                    if let Value::Object(child_map) = value {
                        let children = entry
                            .item
                            .get("children")
                            .and_then(Value::as_array)
                            .map(Vec::as_slice)
                            .unwrap_or_default();
                        canonicalize_object(
                            definition,
                            binds,
                            children,
                            child_map,
                            &entry.model_instance_path,
                            &entry.model_template_path,
                            &entry.data_path,
                            changes,
                        );
                    }
                }
                ScopeItemKind::Group { repeatable: true } => {
                    if let Value::Array(rows) = value {
                        let children = entry
                            .item
                            .get("children")
                            .and_then(Value::as_array)
                            .map(Vec::as_slice)
                            .unwrap_or_default();
                        for (i, row) in rows.iter_mut().enumerate() {
                            if let Value::Object(row_map) = row {
                                let row_model = format!("{}[{i}]", entry.model_instance_path);
                                let row_data = format!("{}[{i}]", entry.data_path);
                                canonicalize_object(
                                    definition,
                                    binds,
                                    children,
                                    row_map,
                                    &row_model,
                                    &entry.model_template_path,
                                    &row_data,
                                    changes,
                                );
                            }
                        }
                    }
                }
            }
        } else {
            canonicalize_flat_key(
                definition,
                binds,
                items,
                raw_key,
                value,
                model_instance_prefix,
                model_template_prefix,
                data_prefix,
                changes,
            );
        }
    }
}

/// Canonicalize Response `data` against a Definition's declared fields and authored Binds.
///
/// Applies [`coerce_field_value`] (whitespace modes, `letterCase`, numeric strings, money,
/// precision) to every declared field value in place, leaving undeclared properties and
/// properties sharing a `display` Item key untouched. Binds resolve strictly by authored
/// path (never by bare-key fallback).
pub fn canonicalize_response_data(definition: &Value, mut data: Value) -> Value {
    let Some(items) = definition.get("items").and_then(Value::as_array) else {
        return data;
    };
    let Some(root) = data.as_object_mut() else {
        return data;
    };
    let binds = BindTargets::new(definition.get("binds"));
    let mut none: Option<&mut Vec<(String, Value)>> = None;
    canonicalize_object(definition, &binds, items, root, "", "", "", &mut none);
    data
}

/// Return sorted `(path, canonical_value)` pairs for every field in `data` that
/// [`canonicalize_response_data`] would change.
///
/// Hosts and API ingress use this detector to refuse non-canonical submissions without
/// rewriting submitted bytes.
pub fn noncanonical_response_values(definition: &Value, mut data: Value) -> Vec<(String, Value)> {
    let Some(items) = definition.get("items").and_then(Value::as_array) else {
        return Vec::new();
    };
    let Some(root) = data.as_object_mut() else {
        return Vec::new();
    };
    let binds = BindTargets::new(definition.get("binds"));
    let mut changes = Vec::new();
    let mut tracker = Some(&mut changes);
    canonicalize_object(definition, &binds, items, root, "", "", "", &mut tracker);
    changes.sort_by(|a, b| a.0.cmp(&b.0));
    changes
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

    #[test]
    fn canonicalize_response_data_coerces_declared_fields_only() {
        let def = json!({
            "formPresentation": { "defaultCurrency": "USD" },
            "items": [
                { "key": "banner", "type": "display", "label": "Banner" },
                { "key": "name", "type": "field", "dataType": "string" },
                { "key": "code", "type": "field", "dataType": "string" },
                { "key": "amount", "type": "field", "dataType": "decimal" },
                { "key": "price", "type": "field", "dataType": "money" },
                {
                    "key": "control",
                    "type": "field",
                    "dataType": "boolean",
                    "children": [
                        { "key": "detail", "type": "field", "dataType": "string" }
                    ]
                },
                {
                    "key": "g",
                    "type": "group",
                    "children": [
                        { "key": "x", "type": "field", "dataType": "string" },
                        { "key": "count", "type": "field", "dataType": "integer" }
                    ]
                },
                {
                    "key": "rows",
                    "type": "group",
                    "repeatable": true,
                    "children": [
                        { "key": "qty", "type": "field", "dataType": "integer" },
                        { "key": "tag", "type": "field", "dataType": "string" }
                    ]
                }
            ],
            "binds": [
                { "path": "name", "whitespace": "normalize" },
                { "path": "code", "whitespace": "trim", "letterCase": "upper" },
                { "path": "control.detail", "whitespace": "trim" },
                { "path": "x", "whitespace": "trim" },
                { "path": "rows[*].tag", "whitespace": "trim" },
                { "path": "rows[@index = 2].tag", "letterCase": "upper" }
            ]
        });

        let raw: Value = serde_json::from_str(
            r#"{
                "banner": "  untouched display-key extra  ",
                "bogus": "  untouched extra  ",
                "name": "  Ada   Lovelace  ",
                "code": " ab-9 ",
                "amount": "1234567890.123456789",
                "price": { "amount": "150.00" },
                "control": true,
                "detail": "  dep  ",
                "g": { "x": "  no bare-key bind  ", "count": "9007199254740993", "extra": "  keep  " },
                "rows": [
                    { "qty": "1", "tag": "  first  ", "legacy": "  keep  " },
                    { "qty": "2", "tag": "  second  " }
                ]
            }"#,
        )
        .unwrap();

        let expected: Value = serde_json::from_str(
            r#"{
                "banner": "  untouched display-key extra  ",
                "bogus": "  untouched extra  ",
                "name": "Ada Lovelace",
                "code": "AB-9",
                "amount": 1234567890.123456789,
                "price": { "amount": "150", "currency": "USD" },
                "control": true,
                "detail": "dep",
                "g": { "x": "  no bare-key bind  ", "count": 9007199254740993, "extra": "  keep  " },
                "rows": [
                    { "qty": 1, "tag": "first", "legacy": "  keep  " },
                    { "qty": 2, "tag": "SECOND" }
                ]
            }"#,
        )
        .unwrap();

        let canonical = canonicalize_response_data(&def, raw.clone());
        assert_eq!(canonical, expected);
        assert!(noncanonical_response_values(&def, canonical).is_empty());

        let diffs = noncanonical_response_values(&def, raw);
        let paths: Vec<&str> = diffs.iter().map(|(p, _)| p.as_str()).collect();
        assert_eq!(
            paths,
            vec![
                "amount",
                "code",
                "detail",
                "g.count",
                "name",
                "price",
                "rows[0].qty",
                "rows[0].tag",
                "rows[1].qty",
                "rows[1].tag",
            ]
        );
        // Verify exact numeric literals survived without f64 rounding.
        assert_eq!(diffs[0].1.to_string(), "1234567890.123456789");
        assert_eq!(diffs[3].1.to_string(), "9007199254740993");
    }

    #[test]
    fn canonicalize_flat_group_members_in_place() {
        let def = json!({
            "items": [
                {
                    "key": "g",
                    "type": "group",
                    "children": [
                        { "key": "n", "type": "field", "dataType": "decimal" }
                    ]
                }
            ]
        });
        let raw = json!({ "g.n": "12.5", "g.extra": "  keep  " });
        let out = canonicalize_response_data(&def, raw.clone());
        assert_eq!(out, json!({ "g.n": 12.5, "g.extra": "  keep  " }));
        assert_eq!(
            noncanonical_response_values(&def, raw),
            vec![("g.n".to_string(), json!(12.5))]
        );
    }
}

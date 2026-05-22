//! JSON projections for registry client (host bindings).

use serde_json::{Map, Value, json};

use crate::JsonWireStyle;
use crate::wire_keys::{registry_entry_keys, registry_parse_summary_keys};

use super::{
    ContactPoint, Registry, RegistryEntry, RegistryWarning, extension_category_to_wire,
    registry_entry_status_to_wire,
};

/// Empty string means “no constraint” for `find_one` host inputs.
pub fn version_constraint_option(s: &str) -> Option<&str> {
    if s.is_empty() { None } else { Some(s) }
}

/// Entry count from raw registry JSON (`entries` array length).
pub fn registry_entry_count_from_raw(val: &Value) -> usize {
    val.get("entries")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0)
}

/// `parseRegistry` / `parse_registry` summary object.
pub fn registry_parse_summary_to_json_value(
    registry: &Registry,
    raw: &Value,
    issues: &[String],
    style: JsonWireStyle,
) -> Value {
    let (entry_count_k, validation_k) = registry_parse_summary_keys(style);

    let mut publisher = Map::new();
    publisher.insert("name".into(), registry.publisher.name.clone());
    publisher.insert("identifier".into(), json!(registry.publisher.identifier));
    publisher.insert("homepage".into(), json!(registry.publisher.homepage));
    publisher.insert("url".into(), json!(registry.publisher.legacy_url));
    publisher.insert(
        "contactPoint".into(),
        contact_points_to_json_value(&registry.publisher.contact_points),
    );
    publisher.insert("contact".into(), json!(registry.publisher.legacy_contact));

    let mut root = Map::new();
    root.insert("publisher".into(), Value::Object(publisher));
    root.insert("published".into(), json!(registry.published));
    root.insert(
        entry_count_k.into(),
        json!(registry_entry_count_from_raw(raw)),
    );
    root.insert(validation_k.into(), json!(issues));
    root.insert(
        "warnings".into(),
        registry_warnings_to_json_value(&registry.warnings),
    );
    Value::Object(root)
}

fn contact_points_to_json_value(points: &[ContactPoint]) -> Value {
    Value::Array(
        points
            .iter()
            .map(|point| {
                json!({
                    "contactType": point.contact_type,
                    "email": point.email,
                    "telephone": point.telephone,
                    "url": point.url,
                    "availableLanguage": point.available_language,
                })
            })
            .collect(),
    )
}

fn registry_warnings_to_json_value(warnings: &[RegistryWarning]) -> Value {
    Value::Array(
        warnings
            .iter()
            .map(|warning| match warning {
                RegistryWarning::DeprecatedField { field, replacement } => json!({
                    "kind": "deprecatedField",
                    "field": field,
                    "replacement": replacement,
                }),
            })
            .collect(),
    )
}

/// Single registry entry for `findRegistryEntry` / `find_registry_entry`.
pub fn registry_entry_to_json_value(entry: &RegistryEntry, style: JsonWireStyle) -> Value {
    let (deprecation_k, base_type_k) = registry_entry_keys(style);

    let mut m = Map::new();
    m.insert("name".into(), json!(entry.name));
    m.insert(
        "category".into(),
        json!(extension_category_to_wire(entry.category)),
    );
    m.insert("version".into(), json!(entry.version));
    m.insert(
        "status".into(),
        json!(registry_entry_status_to_wire(entry.status)),
    );
    m.insert("description".into(), json!(entry.description));
    m.insert(deprecation_k.into(), json!(entry.deprecation_notice));
    m.insert(base_type_k.into(), json!(entry.base_type));
    m.insert("returns".into(), json!(entry.returns));

    let params_json: Value = match &entry.parameters {
        None => Value::Null,
        Some(params) => {
            let rows: Vec<Value> = params
                .iter()
                .map(|p| {
                    json!({
                        "name": p.name,
                        "type": p.param_type,
                        "description": p.description,
                    })
                })
                .collect();
            Value::Array(rows)
        }
    };
    m.insert("parameters".into(), params_json);
    Value::Object(m)
}

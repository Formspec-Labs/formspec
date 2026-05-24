//! JSON parsing helpers for registry documents.
//!
//! `parse_*` functions validate JSON shape and build typed registry rows.
#![allow(clippy::missing_docs_in_private_items)]

use serde_json::{Map, Value};

use crate::extension_analysis::RegistryEntryStatus;

use super::types::{
    ContactPoint, ExtensionCategory, Parameter, Publisher, RegistryEntry, RegistryError,
    RegistryWarning,
};

pub(super) fn parse_publisher(
    val: &Value,
) -> Result<(Publisher, Vec<RegistryWarning>), RegistryError> {
    let obj = val
        .as_object()
        .ok_or_else(|| RegistryError::InvalidField("publisher must be an object".into()))?;
    let name = parse_name(obj, "publisher.name")?;

    let mut warnings = Vec::new();
    let identifier = optional_string_field(obj, "identifier", "publisher.identifier")?;
    let preferred_homepage = optional_string_field(obj, "homepage", "publisher.homepage")?;
    let legacy_url = optional_string_field(obj, "url", "publisher.url")?;
    let homepage = preferred_homepage.clone().or_else(|| legacy_url.clone());

    if legacy_url.is_some() {
        warnings.push(RegistryWarning::DeprecatedField {
            field: "publisher.url".into(),
            replacement: "publisher.homepage".into(),
        });
    }

    let contact_points = obj
        .get("contactPoint")
        .map(parse_contact_points)
        .unwrap_or_else(|| Ok(Vec::new()))?;
    let legacy_contact = optional_string_field(obj, "contact", "publisher.contact")?;
    if legacy_contact.is_some() {
        warnings.push(RegistryWarning::DeprecatedField {
            field: "publisher.contact".into(),
            replacement: "publisher.contactPoint".into(),
        });
    }

    Ok((
        Publisher {
            name,
            identifier,
            homepage,
            contact_points,
            legacy_url,
            legacy_contact,
        },
        warnings,
    ))
}

fn optional_string_field(
    obj: &Map<String, Value>,
    key: &str,
    field_path: &str,
) -> Result<Option<String>, RegistryError> {
    obj.get(key)
        .map(|v| {
            v.as_str().map(String::from).ok_or_else(|| {
                RegistryError::InvalidField(format!("{field_path} must be a string"))
            })
        })
        .transpose()
}

fn parse_name(obj: &Map<String, Value>, field_path: &str) -> Result<Value, RegistryError> {
    let value = obj
        .get("name")
        .ok_or_else(|| RegistryError::MissingField(field_path.into()))?;
    match value {
        Value::String(_) => Ok(value.clone()),
        Value::Object(map) => {
            if map.is_empty() {
                return Err(RegistryError::InvalidField(format!(
                    "{field_path} language map must not be empty"
                )));
            }
            if map.values().all(Value::is_string) {
                Ok(value.clone())
            } else {
                Err(RegistryError::InvalidField(format!(
                    "{field_path} language map values must be strings"
                )))
            }
        }
        _ => Err(RegistryError::InvalidField(format!(
            "{field_path} must be a string or language map"
        ))),
    }
}

fn parse_contact_points(val: &Value) -> Result<Vec<ContactPoint>, RegistryError> {
    match val {
        Value::Array(items) => items.iter().map(parse_one_contact_point).collect(),
        Value::Object(_) => parse_one_contact_point(val).map(|point| vec![point]),
        _ => Err(RegistryError::InvalidField(
            "publisher.contactPoint must be an object or array".into(),
        )),
    }
}

fn parse_one_contact_point(val: &Value) -> Result<ContactPoint, RegistryError> {
    let obj = val.as_object().ok_or_else(|| {
        RegistryError::InvalidField("publisher.contactPoint must be an object".into())
    })?;
    let available_language = obj
        .get("availableLanguage")
        .map(|v| {
            let arr = v.as_array().ok_or_else(|| {
                RegistryError::InvalidField(
                    "publisher.contactPoint.availableLanguage must be an array".into(),
                )
            })?;
            arr.iter()
                .map(|item| {
                    item.as_str().map(String::from).ok_or_else(|| {
                        RegistryError::InvalidField(
                            "publisher.contactPoint.availableLanguage entries must be strings"
                                .into(),
                        )
                    })
                })
                .collect()
        })
        .transpose()?
        .unwrap_or_default();

    Ok(ContactPoint {
        contact_type: optional_string_field(
            obj,
            "contactType",
            "publisher.contactPoint.contactType",
        )?,
        email: optional_string_field(obj, "email", "publisher.contactPoint.email")?,
        telephone: optional_string_field(obj, "telephone", "publisher.contactPoint.telephone")?,
        url: optional_string_field(obj, "url", "publisher.contactPoint.url")?,
        available_language,
    })
}

pub(super) fn parse_status(s: &str) -> Option<RegistryEntryStatus> {
    match s {
        "draft" => Some(RegistryEntryStatus::Draft),
        "stable" | "active" => Some(RegistryEntryStatus::Active),
        "deprecated" => Some(RegistryEntryStatus::Deprecated),
        "retired" => Some(RegistryEntryStatus::Retired),
        _ => None,
    }
}

pub(super) fn parse_category(s: &str) -> Option<ExtensionCategory> {
    // Per ADR 0150 §4.1/§4.2: `namespace` was renamed to `module` (greenfield,
    // no alias). The six new contribution categories + `concept`/`vocabulary`
    // are now surfaced on the Rust enum per P1 — see `ExtensionCategory` for
    // the full list. Parse-rejection remains the policy for genuinely unknown
    // categories (greenfield posture).
    match s {
        "dataType" => Some(ExtensionCategory::DataType),
        "function" => Some(ExtensionCategory::Function),
        "constraint" => Some(ExtensionCategory::Constraint),
        "property" => Some(ExtensionCategory::Property),
        "module" => Some(ExtensionCategory::Module),
        "concept" => Some(ExtensionCategory::Concept),
        "vocabulary" => Some(ExtensionCategory::Vocabulary),
        "unit-kind" => Some(ExtensionCategory::UnitKind),
        "widget" => Some(ExtensionCategory::Widget),
        "action-intent" => Some(ExtensionCategory::ActionIntent),
        "slot-type" => Some(ExtensionCategory::SlotType),
        "validation-mapping-row" => Some(ExtensionCategory::ValidationMappingRow),
        "token-category" => Some(ExtensionCategory::TokenCategory),
        _ => None,
    }
}

fn parse_parameter(val: &Value) -> Option<Parameter> {
    let obj = val.as_object()?;
    Some(Parameter {
        name: obj.get("name")?.as_str()?.to_string(),
        param_type: obj.get("type")?.as_str()?.to_string(),
        description: obj
            .get("description")
            .and_then(|v| v.as_str())
            .map(String::from),
    })
}

pub(super) fn parse_entry(val: &Value, index: usize) -> Result<RegistryEntry, RegistryError> {
    let obj = val
        .as_object()
        .ok_or_else(|| RegistryError::InvalidEntry(index, "entry must be an object".into()))?;

    let name = obj
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RegistryError::InvalidEntry(index, "missing name".into()))?
        .to_string();

    let category_str = obj
        .get("category")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RegistryError::InvalidEntry(index, "missing category".into()))?;
    let category = parse_category(category_str).ok_or_else(|| {
        RegistryError::InvalidEntry(index, format!("unknown category: {category_str}"))
    })?;

    let version = obj
        .get("version")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RegistryError::InvalidEntry(index, "missing version".into()))?
        .to_string();

    let status_str = obj
        .get("status")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RegistryError::InvalidEntry(index, "missing status".into()))?;
    let status = parse_status(status_str).ok_or_else(|| {
        RegistryError::InvalidEntry(index, format!("unknown status: {status_str}"))
    })?;

    let description = obj
        .get("description")
        .and_then(|v| v.as_str())
        .ok_or_else(|| RegistryError::InvalidEntry(index, "missing description".into()))?
        .to_string();

    let deprecation_notice = obj
        .get("deprecationNotice")
        .and_then(|v| v.as_str())
        .map(String::from);

    let base_type = obj
        .get("baseType")
        .and_then(|v| v.as_str())
        .map(String::from);

    let parameters = obj.get("parameters").and_then(|v| {
        v.as_array()
            .map(|arr| arr.iter().filter_map(parse_parameter).collect())
    });

    let returns = obj
        .get("returns")
        .and_then(|v| v.as_str())
        .map(String::from);

    Ok(RegistryEntry {
        name,
        category,
        version,
        status,
        description,
        deprecation_notice,
        base_type,
        parameters,
        returns,
    })
}

//! Diagnose Definition-local response instances and subject declarations.
// Rust guideline compliant 2026-02-21

use jsonschema::{ValidationError, error::ValidationErrorKind};
use serde_json::Value;

use crate::semantic_helpers::{error, json_path_member};
use crate::{LintCode, LintDiagnostic};

/// Give authored fixes to Definition schema errors for specific Core requirements.
pub(crate) fn schema_diagnostic(doc: &Value, err: &ValidationError<'_>) -> Option<LintDiagnostic> {
    let pointer = err.instance_path().as_str();
    let (code, path, message) = match err.schema_path().as_str() {
        "/$defs/Instance/oneOf" => {
            let instance = err.instance().as_object()?;
            let path = instance_path(pointer)?;
            match (
                instance.contains_key("source"),
                instance.contains_key("response"),
            ) {
                (true, true) => (
                    LintCode::E305,
                    path,
                    "An instance may declare either source or response, or inline data alone",
                ),
                (false, true) if !instance.contains_key("schema") => (
                    LintCode::E308,
                    format!("{path}.schema"),
                    "A response instance requires a path-keyed schema",
                ),
                (false, false) if !instance.contains_key("data") => (
                    LintCode::E305,
                    path,
                    "An instance requires source, response, or inline data",
                ),
                _ => return None,
            }
        }
        "/$defs/Instance/properties/schema/type" => {
            let instance_pointer = pointer.strip_suffix("/schema")?;
            doc.pointer(instance_pointer)?.get("response")?;
            (
                LintCode::E308,
                format!("{}.schema", instance_path(instance_pointer)?),
                "A response instance requires a path-keyed schema object",
            )
        }
        "/properties/subject/properties/keys/additionalProperties/dependentSchemas/authorizationParent/properties/dataType/const" => {
            (
                LintCode::E309,
                subject_key_path(pointer.strip_suffix("/dataType")?, "authorizationParent")?,
                "authorizationParent requires a string subject key",
            )
        }
        "/properties/subject/properties/keys/additionalProperties/properties/minted/type" => (
            LintCode::E312,
            subject_key_path(pointer.strip_suffix("/minted")?, "minted")?,
            "minted must be a boolean",
        ),
        "/properties/subject/properties/keys/additionalProperties/then/properties/dataType/const" => {
            (
                LintCode::E312,
                subject_key_path(pointer.strip_suffix("/dataType")?, "minted")?,
                "minted requires a string subject key",
            )
        }
        "/properties/subject/properties/keys/additionalProperties/then/properties/authorizationParent" => {
            (
                LintCode::E312,
                subject_key_path(pointer.strip_suffix("/authorizationParent")?, "minted")?,
                "A minted subject key cannot declare authorizationParent",
            )
        }
        "/properties/subject/properties/keys/additionalProperties/properties/dataType/enum" => (
            LintCode::E311,
            subject_key_path(pointer.strip_suffix("/dataType")?, "dataType")?,
            "A subject key must declare dataType string or integer",
        ),
        "/properties/subject/properties/keys/additionalProperties/required" if matches!(err.kind(), ValidationErrorKind::Required { property } if property == "dataType") => {
            (
                LintCode::E311,
                subject_key_path(pointer, "dataType")?,
                "A subject key must declare dataType string or integer",
            )
        }
        _ => return None,
    };
    Some(error(code, code.pass(), path, message))
}

/// Format a schema error at a named Definition instance.
fn instance_path(pointer: &str) -> Option<String> {
    let name = pointer.strip_prefix("/instances/")?;
    Some(json_path_member("$.instances", &decode_pointer_key(name)))
}

/// Format a schema error at a declaration property of a named subject key.
fn subject_key_path(pointer: &str, property: &str) -> Option<String> {
    let key = pointer.strip_prefix("/subject/keys/")?;
    let path = json_path_member("$.subject.keys", &decode_pointer_key(key));
    Some(format!("{path}.{property}"))
}

/// Decode one escaped JSON Pointer member name.
fn decode_pointer_key(key: &str) -> String {
    key.replace("~1", "/").replace("~0", "~")
}

/// Check selection predicates against the consuming Definition.
pub(crate) fn lint_definition(doc: &Value) -> Vec<LintDiagnostic> {
    let mut diagnostics = Vec::new();
    let subject_keys = doc.pointer("/subject/keys").and_then(Value::as_object);
    let Some(instances) = doc.get("instances").and_then(Value::as_object) else {
        return diagnostics;
    };

    for (name, instance) in instances {
        let Some(predicates) = instance
            .pointer("/response/subject")
            .and_then(Value::as_array)
        else {
            continue;
        };
        let instance_path = json_path_member("$.instances", name);
        for (index, predicate) in predicates.iter().enumerate() {
            let path = format!("{instance_path}.response.subject[{index}]");
            if predicate.pointer("/from/routeParam").is_some() {
                diagnostics.push(error(
                    LintCode::E306,
                    3,
                    format!("{path}.from.routeParam"),
                    "Definition instance predicates must use from.subject",
                ));
            }

            let Some(key) = predicate.pointer("/from/subject").and_then(Value::as_str) else {
                continue;
            };
            if !subject_keys.is_some_and(|keys| keys.contains_key(key)) {
                diagnostics.push(error(
                    LintCode::E307,
                    3,
                    format!("{path}.from.subject"),
                    format!("Subject key {key:?} is not declared in this Definition"),
                ));
            }
        }
    }
    diagnostics
}

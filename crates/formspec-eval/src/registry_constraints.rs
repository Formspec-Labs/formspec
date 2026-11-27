//! Build and validate [`ExtensionConstraint`](crate::ExtensionConstraint) vectors from registry JSON documents.

use std::collections::HashSet;

use fancy_regex::Regex;
use fel_core::exact_json::Value;
use thiserror::Error;

use crate::ExtensionConstraint;

/// Supported keys inside a registry entry's `constraints` object.
const SUPPORTED_CONSTRAINT_KEYS: &[&str] = &["pattern", "maxLength", "minimum", "maximum"];

/// Why a set of Extension Registry documents could not be qualified for evaluation.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
#[non_exhaustive]
pub enum RegistryConstraintsError {
    /// A registry document was not a JSON object or lacked an `entries` array.
    #[error("invalid registry document at index {document_index}: {reason}")]
    InvalidDocument {
        /// Zero-based index of the offending document.
        document_index: usize,
        /// Human-readable reason.
        reason: String,
    },
    /// A registry entry was malformed or omitted a non-empty extension name.
    #[error("invalid registry entry at document {document_index}, entry {entry_index}: {reason}")]
    InvalidEntry {
        /// Zero-based index of the containing document.
        document_index: usize,
        /// Zero-based index of the entry within `entries`.
        entry_index: usize,
        /// Human-readable reason.
        reason: String,
    },
    /// Two registry entries declared the same extension name across the supplied documents.
    #[error("duplicate registry extension entry '{name}'")]
    DuplicateExtension {
        /// Conflicting extension name.
        name: String,
    },
    /// A registry entry declared a constraint key not enforced by `formspec-eval`.
    #[error("unsupported registry constraint '{key}' on extension '{extension}'")]
    UnsupportedConstraint {
        /// Extension name carrying the unsupported constraint.
        extension: String,
        /// Unsupported constraint key name.
        key: String,
    },
    /// A supported registry constraint had an invalid type, regex, or range bound.
    #[error("invalid registry constraint '{key}' on extension '{extension}': {reason}")]
    InvalidConstraintValue {
        /// Extension name carrying the malformed constraint.
        extension: String,
        /// Constraint key name (`constraints`, `pattern`, `maxLength`, `minimum`, `maximum`).
        key: String,
        /// Human-readable validation failure.
        reason: String,
    },
}

/// Extract extension constraint payloads from raw registry documents (`entries` arrays) without
/// rejecting duplicate entries or unsupported constraint keys.
///
/// Prefer [`validated_extension_constraints_from_registry_documents`] or
/// [`crate::recheck_eval_options`] for authoritative rechecks.
pub fn extension_constraints_from_registry_documents(docs: &[Value]) -> Vec<ExtensionConstraint> {
    let mut constraints = Vec::new();

    for doc_val in docs {
        let entries = match doc_val.get("entries").and_then(|v| v.as_array()) {
            Some(arr) => arr,
            None => continue,
        };

        for entry in entries {
            let Some(name) = entry.get("name").and_then(|v| v.as_str()) else {
                continue;
            };
            constraints.push(extract_entry_lossy(name, entry));
        }
    }

    constraints
}

/// Qualify registry documents once and extract exact [`ExtensionConstraint`] payloads.
///
/// Rejects malformed documents/entries, duplicate extension names across all supplied documents,
/// unsupported `constraints` keys outside `{pattern, maxLength, minimum, maximum}`, invalid regex
/// patterns, non-integer or negative `maxLength`, non-decimal `minimum`/`maximum` bounds, and
/// inverted `minimum > maximum` ranges. Numeric limits are preserved as exact decimals.
///
/// # Errors
///
/// Returns [`RegistryConstraintsError`] on the first qualification failure encountered.
pub fn validated_extension_constraints_from_registry_documents(
    docs: &[Value],
) -> Result<Vec<ExtensionConstraint>, RegistryConstraintsError> {
    let mut seen_names = HashSet::new();
    let mut constraints = Vec::new();

    for (document_index, doc_val) in docs.iter().enumerate() {
        let Some(doc_obj) = doc_val.as_object() else {
            return Err(RegistryConstraintsError::InvalidDocument {
                document_index,
                reason: "registry document must be a JSON object".into(),
            });
        };
        let Some(entries) = doc_obj.get("entries").and_then(Value::as_array) else {
            return Err(RegistryConstraintsError::InvalidDocument {
                document_index,
                reason: "registry document must contain an 'entries' array".into(),
            });
        };

        for (entry_index, entry) in entries.iter().enumerate() {
            let Some(entry_obj) = entry.as_object() else {
                return Err(RegistryConstraintsError::InvalidEntry {
                    document_index,
                    entry_index,
                    reason: "registry entry must be a JSON object".into(),
                });
            };
            let Some(name) = entry_obj
                .get("name")
                .and_then(Value::as_str)
                .filter(|n| !n.is_empty())
            else {
                return Err(RegistryConstraintsError::InvalidEntry {
                    document_index,
                    entry_index,
                    reason: "registry entry must declare a non-empty string 'name'".into(),
                });
            };
            if !seen_names.insert(name.to_owned()) {
                return Err(RegistryConstraintsError::DuplicateExtension {
                    name: name.to_owned(),
                });
            }

            let mut pattern = None;
            let mut max_length = None;
            let mut minimum = None;
            let mut maximum = None;

            if let Some(constraint_val) = entry_obj.get("constraints").filter(|v| !v.is_null()) {
                let Some(constraint_obj) = constraint_val.as_object() else {
                    return Err(RegistryConstraintsError::InvalidConstraintValue {
                        extension: name.to_owned(),
                        key: "constraints".into(),
                        reason: "must be a JSON object".into(),
                    });
                };

                for (key, value) in constraint_obj {
                    if !SUPPORTED_CONSTRAINT_KEYS.contains(&key.as_str()) {
                        return Err(RegistryConstraintsError::UnsupportedConstraint {
                            extension: name.to_owned(),
                            key: key.clone(),
                        });
                    }
                    match key.as_str() {
                        "pattern" => {
                            let Some(pat) = value.as_str() else {
                                return Err(RegistryConstraintsError::InvalidConstraintValue {
                                    extension: name.to_owned(),
                                    key: key.clone(),
                                    reason: "must be a string".into(),
                                });
                            };
                            if let Err(err) = Regex::new(pat) {
                                return Err(RegistryConstraintsError::InvalidConstraintValue {
                                    extension: name.to_owned(),
                                    key: key.clone(),
                                    reason: format!("invalid regular expression: {err}"),
                                });
                            }
                            pattern = Some(pat.to_owned());
                        }
                        "maxLength" => {
                            let Some(len) = value.as_u64() else {
                                return Err(RegistryConstraintsError::InvalidConstraintValue {
                                    extension: name.to_owned(),
                                    key: key.clone(),
                                    reason: "must be a non-negative integer".into(),
                                });
                            };
                            max_length = Some(len);
                        }
                        "minimum" => {
                            let Some(min) = value.is_number().then(|| value.as_decimal()).flatten()
                            else {
                                return Err(RegistryConstraintsError::InvalidConstraintValue {
                                    extension: name.to_owned(),
                                    key: key.clone(),
                                    reason: "must be a valid decimal number".into(),
                                });
                            };
                            minimum = Some(min);
                        }
                        "maximum" => {
                            let Some(max) = value.is_number().then(|| value.as_decimal()).flatten()
                            else {
                                return Err(RegistryConstraintsError::InvalidConstraintValue {
                                    extension: name.to_owned(),
                                    key: key.clone(),
                                    reason: "must be a valid decimal number".into(),
                                });
                            };
                            maximum = Some(max);
                        }
                        _ => unreachable!(),
                    }
                }
                if let (Some(min), Some(max)) = (minimum, maximum)
                    && min > max
                {
                    return Err(RegistryConstraintsError::InvalidConstraintValue {
                        extension: name.to_owned(),
                        key: "minimum".into(),
                        reason: format!("minimum ({min}) exceeds maximum ({max})"),
                    });
                }
            }

            constraints.push(ExtensionConstraint {
                name: name.to_owned(),
                display_name: entry_metadata_str(entry, "displayName"),
                pattern,
                max_length,
                minimum,
                maximum,
                base_type: entry_str(entry, "baseType"),
                status: entry_str(entry, "status").unwrap_or_else(|| "stable".to_string()),
                deprecation_notice: entry_str(entry, "deprecationNotice"),
                compatibility_version: entry
                    .get("compatibility")
                    .and_then(|c| c.get("formspecVersion"))
                    .and_then(Value::as_str)
                    .map(String::from),
            });
        }
    }

    Ok(constraints)
}

/// Lossy extraction helper preserving historical behavior of
/// [`extension_constraints_from_registry_documents`].
fn extract_entry_lossy(name: &str, entry: &Value) -> ExtensionConstraint {
    let constraint_obj = entry.get("constraints");
    ExtensionConstraint {
        name: name.to_owned(),
        display_name: entry_metadata_str(entry, "displayName"),
        pattern: constraint_obj
            .and_then(|c| c.get("pattern"))
            .and_then(Value::as_str)
            .map(String::from),
        max_length: constraint_obj
            .and_then(|c| c.get("maxLength"))
            .and_then(Value::as_u64),
        minimum: constraint_obj
            .and_then(|c| c.get("minimum"))
            .and_then(Value::as_decimal),
        maximum: constraint_obj
            .and_then(|c| c.get("maximum"))
            .and_then(Value::as_decimal),
        base_type: entry_str(entry, "baseType"),
        status: entry_str(entry, "status").unwrap_or_else(|| "stable".to_string()),
        deprecation_notice: entry_str(entry, "deprecationNotice"),
        compatibility_version: entry
            .get("compatibility")
            .and_then(|c| c.get("formspecVersion"))
            .and_then(Value::as_str)
            .map(String::from),
    }
}

/// Read an optional string property from a registry entry.
fn entry_str(entry: &Value, key: &str) -> Option<String> {
    entry.get(key).and_then(Value::as_str).map(String::from)
}

/// Read an optional string property from a registry entry's `metadata` object.
fn entry_metadata_str(entry: &Value, key: &str) -> Option<String> {
    entry
        .get("metadata")
        .and_then(|m| m.get(key))
        .and_then(Value::as_str)
        .map(String::from)
}

#[cfg(test)]
mod tests {
    use super::*;
    use fel_core::exact_json::native_json as json;

    #[test]
    fn validated_extraction_preserves_exact_decimal_bounds() {
        let doc: Value = serde_json::from_str(
            r#"{
                "entries": [{
                    "name": "x-test-exact",
                    "status": "stable",
                    "constraints": {
                        "minimum": 0.0000000000000000000000000001,
                        "maximum": 99999999999999999999.12345678
                    }
                }]
            }"#,
        )
        .expect("exact JSON");
        let extracted =
            validated_extension_constraints_from_registry_documents(&[doc]).expect("valid");
        assert_eq!(extracted.len(), 1);
        assert_eq!(
            extracted[0].minimum.unwrap().to_string(),
            "0.0000000000000000000000000001"
        );
        assert_eq!(
            extracted[0].maximum.unwrap().to_string(),
            "99999999999999999999.12345678"
        );
    }

    #[test]
    fn validated_extraction_rejects_duplicate_extension_names_across_docs() {
        let doc_a = json!({ "entries": [{ "name": "x-test-dup", "status": "stable" }] });
        let doc_b = json!({ "entries": [{ "name": "x-test-dup", "status": "stable" }] });
        let err = validated_extension_constraints_from_registry_documents(&[doc_a, doc_b])
            .expect_err("duplicate extension must be rejected");
        assert_eq!(
            err,
            RegistryConstraintsError::DuplicateExtension {
                name: "x-test-dup".into()
            }
        );
    }

    #[test]
    fn validated_extraction_rejects_unsupported_and_malformed_constraints() {
        let unsupported = json!({
            "entries": [{
                "name": "x-test-extra",
                "constraints": { "minLength": 3 }
            }]
        });
        assert_eq!(
            validated_extension_constraints_from_registry_documents(&[unsupported]).unwrap_err(),
            RegistryConstraintsError::UnsupportedConstraint {
                extension: "x-test-extra".into(),
                key: "minLength".into(),
            }
        );

        let bad_regex = json!({
            "entries": [{
                "name": "x-test-regex",
                "constraints": { "pattern": "[unclosed" }
            }]
        });
        assert!(matches!(
            validated_extension_constraints_from_registry_documents(&[bad_regex]).unwrap_err(),
            RegistryConstraintsError::InvalidConstraintValue { key, .. } if key == "pattern"
        ));

        let inverted = json!({
            "entries": [{
                "name": "x-test-range",
                "constraints": { "minimum": 100, "maximum": 10 }
            }]
        });
        assert!(matches!(
            validated_extension_constraints_from_registry_documents(&[inverted]).unwrap_err(),
            RegistryConstraintsError::InvalidConstraintValue { key, .. } if key == "minimum"
        ));
    }
}

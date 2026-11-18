//! Cross-Definition validation for response-backed instance projections.

// Rust guideline compliant 2026-02-21

use std::collections::BTreeMap;

use serde::Serialize;
use serde_json::Value;

use crate::compatible_versions::{parse_compatible_range, parse_definition_version};

/// Machine-readable reason a response instance fails projection validation.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub enum InstanceProjectionCode {
    /// The supplied Definition has a different URL from the selection.
    #[serde(rename = "INSTANCE-PROJECTION-DEFINITION-MISMATCH")]
    DefinitionMismatch,
    /// The selected version range or upstream version cannot be interpreted.
    #[serde(rename = "INSTANCE-PROJECTION-VERSION-INVALID")]
    VersionInvalid,
    /// No published version matches the selection's range.
    #[serde(rename = "INSTANCE-PROJECTION-NO-ELIGIBLE-VERSION")]
    NoEligibleVersion,
    /// A response instance lacks its path-keyed schema.
    #[serde(rename = "INSTANCE-PROJECTION-SCHEMA-MISSING")]
    SchemaMissing,
    /// A projected path has no corresponding upstream data field.
    #[serde(rename = "INSTANCE-PROJECTION-PATH-MISSING")]
    PathMissing,
    /// A projected field declares a different type from the upstream field.
    #[serde(rename = "INSTANCE-PROJECTION-FIELD-TYPE-MISMATCH")]
    FieldTypeMismatch,
    /// The upstream Definition lacks a subject declaration.
    #[serde(rename = "INSTANCE-PROJECTION-SUBJECT-MISSING")]
    SubjectMissing,
    /// Eligible upstream versions declare different subject types.
    #[serde(rename = "INSTANCE-PROJECTION-SUBJECT-TYPE-MISMATCH")]
    SubjectTypeMismatch,
    /// Eligible upstream versions declare different sets of subject keys or key types.
    #[serde(rename = "INSTANCE-PROJECTION-SUBJECT-KEY-TYPE-DRIFT")]
    SubjectKeyTypeDrift,
    /// A predicate names an undeclared upstream or consuming subject key.
    #[serde(rename = "INSTANCE-PROJECTION-SUBJECT-KEY-MISSING")]
    SubjectKeyMissing,
    /// A predicate compares keys with incompatible declared types.
    #[serde(rename = "INSTANCE-PROJECTION-SUBJECT-KEY-TYPE-MISMATCH")]
    SubjectKeyTypeMismatch,
    /// A predicate uses an integer-only operation on a non-integer key.
    #[serde(rename = "INSTANCE-PROJECTION-SUBJECT-INTEGER-REQUIRED")]
    SubjectIntegerRequired,
}

/// One error in a response instance's projection or subject predicates.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceProjectionDiagnostic {
    /// Stable reason for rejecting the instance.
    pub code: InstanceProjectionCode,
    /// JSON Pointer relative to the instance document.
    pub json_pointer: String,
    /// The associated upstream version, when the finding identifies one.
    pub upstream_version: Option<String>,
    /// Description of the incompatible declaration.
    pub message: String,
}

impl InstanceProjectionDiagnostic {
    /// Builds a finding pointing into the consuming instance.
    fn new(
        code: InstanceProjectionCode,
        json_pointer: impl Into<String>,
        upstream_version: Option<&str>,
        message: String,
    ) -> Self {
        Self {
            code,
            json_pointer: json_pointer.into(),
            upstream_version: upstream_version.map(str::to_owned),
            message,
        }
    }
}

/// Checks a response instance against every eligible published upstream Definition version.
///
/// Pass every published Definition for the URL in `response.definition`. This function
/// filters the list by `compatibleVersions` and reports an error if no version is eligible.
/// It compares the subject type and key types against the earliest eligible version
/// with a subject, and checks the fields and predicates against each eligible version.
///
/// Pass the consuming Definition's `subject` declaration for `from.subject` predicates.
/// Catalog selections using `from.routeParam` pass `None`.
/// Inline and URI-backed instances return no findings.
///
/// On consumer publish, pass all upstream versions for each response instance. On
/// upstream publish, include the candidate in that list and recheck each dependent
/// instance before admitting the version. Publish must refuse on any finding.
///
/// # Examples
///
/// ```
/// use formspec_core::check_instance_projection;
/// use serde_json::json;
///
/// let instance = json!({"data": {"rate": 5}});
/// assert!(check_instance_projection(&instance, None, &[]).is_empty());
/// ```
pub fn check_instance_projection(
    instance: &Value,
    consumer_subject: Option<&Value>,
    upstream_definitions: &[Value],
) -> Vec<InstanceProjectionDiagnostic> {
    use InstanceProjectionCode as Code;

    let Some(response) = instance.get("response") else {
        return Vec::new();
    };
    let target = &response["definition"];
    let Some(url) = target["url"].as_str() else {
        return vec![InstanceProjectionDiagnostic::new(
            Code::DefinitionMismatch,
            "/response/definition/url",
            None,
            "The selection requires an upstream Definition URL.".to_owned(),
        )];
    };
    let range = match target.get("compatibleVersions") {
        Some(raw) => {
            let Some(range) = raw.as_str().and_then(parse_compatible_range) else {
                return vec![InstanceProjectionDiagnostic::new(
                    Code::VersionInvalid,
                    "/response/definition/compatibleVersions",
                    None,
                    format!("Cannot interpret upstream Definition version range {raw}."),
                )];
            };
            Some(range)
        }
        None => None,
    };

    let mut diagnostics = Vec::new();
    let mut eligible = Vec::new();
    for definition in upstream_definitions {
        let version = definition["version"].as_str();
        if definition["url"] != url {
            diagnostics.push(InstanceProjectionDiagnostic::new(
                Code::DefinitionMismatch,
                "/response/definition/url",
                version,
                format!(
                    "Selection targets Definition '{url}' but the supplied Definition has URL {}.",
                    definition["url"]
                ),
            ));
            continue;
        }
        let Some((version, parsed_version)) =
            version.and_then(|version| Some((version, parse_definition_version(version)?)))
        else {
            diagnostics.push(InstanceProjectionDiagnostic::new(
                Code::VersionInvalid,
                "/response/definition",
                version,
                format!(
                    "Invalid upstream Definition version {}.",
                    definition["version"]
                ),
            ));
            continue;
        };
        if range
            .as_ref()
            .is_none_or(|range| range.test(&parsed_version))
        {
            eligible.push((parsed_version, version, definition));
        }
    }
    if eligible.is_empty() && diagnostics.is_empty() {
        diagnostics.push(InstanceProjectionDiagnostic::new(
            Code::NoEligibleVersion,
            "/response/definition",
            None,
            format!("No published version of Definition '{url}' matches this selection."),
        ));
    }

    eligible.sort_unstable_by(|(a, a_text, _), (b, b_text, _)| {
        a.cmp(b).then_with(|| a_text.cmp(b_text))
    });
    let mut baseline = None;
    for (_, version, definition) in eligible {
        check_projected_fields(
            &instance["schema"],
            &definition["items"],
            version,
            &mut diagnostics,
        );
        let subject = &definition["subject"];
        let Some(subject_type) = subject["type"].as_str().filter(|ty| !ty.is_empty()) else {
            diagnostics.push(InstanceProjectionDiagnostic::new(
                Code::SubjectMissing,
                "/response/definition",
                Some(version),
                "The upstream Definition must declare a subject.".to_owned(),
            ));
            continue;
        };
        let key_types = subject_key_types(subject);
        if let Some((baseline_version, baseline_type, baseline_keys)) = &baseline {
            if subject_type != *baseline_type {
                diagnostics.push(InstanceProjectionDiagnostic::new(
                    Code::SubjectTypeMismatch,
                    "/response/definition",
                    Some(version),
                    format!(
                        "Upstream subject type '{subject_type}' differs from '{baseline_type}' in version '{baseline_version}'."
                    ),
                ));
            }
            if key_types != *baseline_keys {
                diagnostics.push(InstanceProjectionDiagnostic::new(
                    Code::SubjectKeyTypeDrift,
                    "/response/definition",
                    Some(version),
                    format!(
                        "Upstream subject key types {key_types:?} differ from {baseline_keys:?} in version '{baseline_version}'."
                    ),
                ));
            }
        } else {
            baseline = Some((version, subject_type, key_types));
        }
        check_subject_predicates(
            response,
            consumer_subject,
            subject,
            version,
            &mut diagnostics,
        );
    }
    diagnostics
}

/// Collects key names and data types independently of declaration order or authorization metadata.
fn subject_key_types(subject: &Value) -> BTreeMap<&str, &str> {
    subject["keys"]
        .as_object()
        .into_iter()
        .flatten()
        .map(|(key, declaration)| {
            (
                key.as_str(),
                declaration["dataType"].as_str().unwrap_or_default(),
            )
        })
        .collect()
}

/// Checks each projected field's path and declared data type.
fn check_projected_fields(
    schema: &Value,
    items: &Value,
    upstream_version: &str,
    diagnostics: &mut Vec<InstanceProjectionDiagnostic>,
) {
    use InstanceProjectionCode as Code;

    let Some(schema) = schema.as_object() else {
        diagnostics.push(InstanceProjectionDiagnostic::new(
            Code::SchemaMissing,
            "/schema",
            Some(upstream_version),
            "A response instance requires a path-keyed schema.".to_owned(),
        ));
        return;
    };
    for (path, expected_type) in schema {
        let (code, message) = match projected_field_type(items, path) {
            Some(actual_type) if expected_type.as_str() == Some(actual_type) => continue,
            Some(actual_type) => (
                Code::FieldTypeMismatch,
                format!(
                    "Projected field '{path}' declares {expected_type}, but the upstream field has type '{actual_type}'."
                ),
            ),
            None => (
                Code::PathMissing,
                format!(
                    "Projected path '{path}' does not identify a field in the upstream Definition."
                ),
            ),
        };
        let pointer_token = path.replace('~', "~0").replace('/', "~1");
        diagnostics.push(InstanceProjectionDiagnostic::new(
            code,
            format!("/schema/{pointer_token}"),
            Some(upstream_version),
            message,
        ));
    }
}

/// Resolves a data path while checking the array traversal at each group.
fn projected_field_type<'a>(mut items: &'a Value, path: &str) -> Option<&'a str> {
    let mut segments = path.split('.').peekable();
    while let Some(segment) = segments.next() {
        let (key, wildcard) = segment
            .strip_suffix("[*]")
            .map_or((segment, false), |key| (key, true));
        let item = items.as_array()?.iter().find(|item| item["key"] == key)?;
        if segments.peek().is_none() {
            return if item["type"] == "field" && !wildcard {
                item["dataType"].as_str()
            } else {
                None
            };
        }
        match item["type"].as_str() {
            Some("group") if wildcard == (item["repeatable"] == true) => {}
            Some("field") if !wildcard => {}
            _ => return None,
        }
        items = &item["children"];
    }
    None
}

/// Checks the upstream key and the consuming source for each predicate.
fn check_subject_predicates(
    response: &Value,
    consumer_subject: Option<&Value>,
    upstream_subject: &Value,
    upstream_version: &str,
    diagnostics: &mut Vec<InstanceProjectionDiagnostic>,
) {
    use InstanceProjectionCode as Code;

    let Some(predicates) = response["subject"].as_array() else {
        return;
    };
    for (index, predicate) in predicates.iter().enumerate() {
        let Some(key) = predicate["key"].as_str() else {
            continue;
        };
        let pointer = format!("/response/subject/{index}");
        let Some(upstream_key) = upstream_subject["keys"].get(key) else {
            diagnostics.push(InstanceProjectionDiagnostic::new(
                Code::SubjectKeyMissing,
                format!("{pointer}/key"),
                Some(upstream_version),
                format!("The upstream subject does not declare key '{key}'."),
            ));
            continue;
        };
        let Some(key_type @ ("string" | "integer")) = upstream_key["dataType"].as_str() else {
            diagnostics.push(InstanceProjectionDiagnostic::new(
                Code::SubjectKeyTypeMismatch,
                format!("{pointer}/key"),
                Some(upstream_version),
                format!("Upstream subject key '{key}' must have type 'string' or 'integer'."),
            ));
            continue;
        };
        if key_type != "integer" {
            for (member, used) in [
                ("op", matches!(predicate["op"].as_str(), Some("le" | "ge"))),
                ("offset", predicate.get("offset").is_some()),
            ] {
                if used {
                    diagnostics.push(InstanceProjectionDiagnostic::new(
                        Code::SubjectIntegerRequired,
                        format!("{pointer}/{member}"),
                        Some(upstream_version),
                        format!(
                            "Predicate member '{member}' requires integer upstream key '{key}'."
                        ),
                    ));
                }
            }
        }
        if let Some(source_key) = predicate["from"]["subject"].as_str() {
            let source_type = consumer_subject
                .and_then(|subject| subject["keys"][source_key]["dataType"].as_str());
            let (code, message) = match source_type {
                Some(source_type) if source_type == key_type => continue,
                Some(source_type) => (
                    Code::SubjectKeyTypeMismatch,
                    format!(
                        "Consuming subject key '{source_key}' has type '{source_type}' but upstream key '{key}' has type '{key_type}'."
                    ),
                ),
                None => (
                    Code::SubjectKeyMissing,
                    format!("The consuming Definition's subject must declare key '{source_key}'."),
                ),
            };
            diagnostics.push(InstanceProjectionDiagnostic::new(
                code,
                format!("{pointer}/from/subject"),
                Some(upstream_version),
                message,
            ));
        }
    }
}

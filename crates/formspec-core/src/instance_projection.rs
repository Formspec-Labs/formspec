//! Cross-Definition validation for response-backed instance projections.

// Rust guideline compliant 2026-02-21

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

mod choices;
use choices::ChoiceCarry;
use serde_json::{Map, Value};

use crate::compatible_versions::{parse_compatible_range, parse_definition_version};

/// The authored link from a response source to a consuming form.
#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum ProjectionConsumer {
    /// Named secondary instance in this Definition.
    Instance {
        /// The Definition that declares the instance and receiving fields.
        definition: Value,
        /// Instance key, before JSON Pointer escaping.
        name: String,
    },
    /// A Surface form slot bound to this source through initialData.
    Prefill {
        /// The form receiving the catalog payload.
        definition: Value,
        /// A reverse Mapping changes the relationship between field paths.
        mapped: bool,
    },
}

impl ProjectionConsumer {
    fn definition(&self) -> &Value {
        match self {
            Self::Instance { definition, .. } | Self::Prefill { definition, .. } => definition,
        }
    }
}

/// Machine-readable reason a response instance fails projection validation.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub enum InstanceProjectionCode {
    /// The supplied Definition has a different URL from the selection.
    #[serde(rename = "INSTANCE-PROJECTION-DEFINITION-MISMATCH")]
    DefinitionMismatch,
    /// The selected version range or upstream version cannot be interpreted.
    #[serde(rename = "INSTANCE-PROJECTION-VERSION-INVALID")]
    VersionInvalid,
    /// More than one supplied Definition matches the same eligible version.
    #[serde(rename = "INSTANCE-PROJECTION-VERSION-AMBIGUOUS")]
    VersionAmbiguous,
    /// No published version matches the selection's range.
    #[serde(rename = "INSTANCE-PROJECTION-NO-ELIGIBLE-VERSION")]
    NoEligibleVersion,
    /// A catalog schema or mapped output cannot be compared statically.
    #[serde(rename = "INSTANCE-PROJECTION-SCHEMA-UNSUPPORTED")]
    SchemaUnsupported,
    /// A projected path has no corresponding upstream data field.
    #[serde(rename = "INSTANCE-PROJECTION-PATH-MISSING")]
    PathMissing,
    /// A projected field declares a different type from the upstream field.
    #[serde(rename = "INSTANCE-PROJECTION-FIELD-TYPE-MISMATCH")]
    FieldTypeMismatch,
    /// Directly carried choices have different sets of stored option values.
    #[serde(rename = "INSTANCE-PROJECTION-OPTION-VALUES-MISMATCH")]
    OptionValuesMismatch,
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

/// Checks a response projection against every eligible upstream Definition version.
///
/// Pass every published Definition for the URL in `response.definition`. This function
/// filters the list by `compatibleVersions` when declared and reports an error if no
/// version is eligible. It checks the fields and predicates against each eligible
/// version. For subject drift, it uses the first version with a subject in semantic
/// version order when ranged and in byte order of the version text otherwise.
///
/// Pass the consuming Definition and its authored instance or prefill binding.
/// Pass `None` for catalog reads without a receiving form.
/// The Definition schema and document lint check the local response instance declaration.
/// Inline and URI-backed instances return no findings.
/// A `definition-response` catalog source uses its own `responseSelection` and
/// JSON Schema. For session drafts, pass the one resolved Definition for `definitionRef`.
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
    consumer: Option<&ProjectionConsumer>,
    upstream_definitions: &[Value],
) -> Vec<InstanceProjectionDiagnostic> {
    use InstanceProjectionCode as Code;

    let consumer_subject = consumer.and_then(|value| value.definition().get("subject"));
    let catalog = instance["kind"] == "definition-response";
    let draft = catalog && instance["runtime"]["delivery"] == "draft";
    let member = if catalog {
        "responseSelection"
    } else {
        "response"
    };
    let response = &instance[member];
    if !catalog && instance.get(member).is_none() {
        return Vec::new();
    }
    let target = &response["definition"];
    let (url, target_pointer, url_pointer) = if draft {
        (
            instance["definitionRef"].as_str(),
            "/definitionRef".to_owned(),
            "/definitionRef".to_owned(),
        )
    } else {
        (
            target["url"].as_str(),
            format!("/{member}/definition"),
            format!("/{member}/definition/url"),
        )
    };
    let Some(url) = url else {
        return vec![InstanceProjectionDiagnostic::new(
            Code::DefinitionMismatch,
            url_pointer,
            None,
            "The selection requires an upstream Definition URL.".to_owned(),
        )];
    };
    if draft {
        return check_catalog_draft(instance, url, upstream_definitions);
    }
    let range = match target.get("compatibleVersions") {
        Some(raw) => {
            let Some(range) = raw.as_str().and_then(parse_compatible_range) else {
                return vec![InstanceProjectionDiagnostic::new(
                    Code::VersionInvalid,
                    format!("{target_pointer}/compatibleVersions"),
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
                &url_pointer,
                version,
                format!(
                    "Selection targets Definition '{url}' but the supplied Definition has URL {}.",
                    definition["url"]
                ),
            ));
            continue;
        }
        let parsed_version = range
            .as_ref()
            .and_then(|_| version.and_then(parse_definition_version));
        let Some(version) = version.filter(|_| range.is_none() || parsed_version.is_some()) else {
            diagnostics.push(InstanceProjectionDiagnostic::new(
                Code::VersionInvalid,
                &target_pointer,
                version,
                format!(
                    "Invalid upstream Definition version {}.",
                    definition["version"]
                ),
            ));
            continue;
        };
        if range.as_ref().is_none_or(|range| {
            parsed_version
                .as_ref()
                .is_some_and(|version| range.test(version))
        }) {
            eligible.push((parsed_version, version, definition));
        }
    }
    if eligible.is_empty() && diagnostics.is_empty() {
        diagnostics.push(InstanceProjectionDiagnostic::new(
            Code::NoEligibleVersion,
            &target_pointer,
            None,
            format!("No published version of Definition '{url}' matches this selection."),
        ));
    }

    let catalog_fields = if catalog {
        check_catalog_subject_keys(response, consumer_subject, &mut diagnostics);
        catalog_schema_properties(instance, response, &mut diagnostics)
    } else {
        None
    };
    let choice_consumer = consumer.filter(|consumer| match consumer {
        ProjectionConsumer::Instance { .. } => !catalog,
        ProjectionConsumer::Prefill { definition, .. } => {
            catalog
                && definition["url"] == url
                && definition["version"]
                    .as_str()
                    .filter(|version| !version.is_empty())
                    .is_some_and(|version| {
                        range.as_ref().is_none_or(|range| {
                            parse_definition_version(version)
                                .is_some_and(|version| range.test(&version))
                        })
                    })
                && (instance.get("schema").is_none() || catalog_fields.is_some())
        }
    });
    let carries = ChoiceCarry::from_source(instance, choice_consumer);
    let projected_fields = instance["schema"].as_object().filter(|_| !catalog);
    eligible.sort_unstable_by(|(a, a_text, _), (b, b_text, _)| {
        a.cmp(b).then_with(|| a_text.cmp(b_text))
    });
    let mut baseline = None;
    for versions in eligible.chunk_by(|(_, a, _), (_, b, _)| a == b) {
        let (_, version, definition) = versions[0];
        if versions.len() > 1 {
            diagnostics.push(InstanceProjectionDiagnostic::new(
                Code::VersionAmbiguous,
                &target_pointer,
                Some(version),
                format!("More than one supplied Definition has version '{version}'."),
            ));
            continue;
        }
        if let Some((schema_pointer, properties)) = catalog_fields {
            check_catalog_fields(
                schema_pointer,
                properties,
                definition,
                Some(version),
                &mut diagnostics,
            );
        }
        if let Some(fields) = projected_fields {
            check_projected_fields(fields, &definition["items"], version, &mut diagnostics);
        }
        for carry in &carries {
            carry.check(definition, Some(version), &mut diagnostics);
        }
        let subject = &definition["subject"];
        let Some(subject_type) = subject["type"].as_str().filter(|ty| !ty.is_empty()) else {
            diagnostics.push(InstanceProjectionDiagnostic::new(
                Code::SubjectMissing,
                &target_pointer,
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
                    &target_pointer,
                    Some(version),
                    format!(
                        "Upstream subject type '{subject_type}' differs from '{baseline_type}' in version '{baseline_version}'."
                    ),
                ));
            }
            if key_types != *baseline_keys {
                diagnostics.push(InstanceProjectionDiagnostic::new(
                    Code::SubjectKeyTypeDrift,
                    &target_pointer,
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
            member,
            &mut diagnostics,
        );
    }
    diagnostics
}

/// Checks a session draft against its single resolved Definition.
fn check_catalog_draft(
    source: &Value,
    url: &str,
    upstream: &[Value],
) -> Vec<InstanceProjectionDiagnostic> {
    use InstanceProjectionCode as Code;

    match upstream {
        [definition] if definition["url"] == url => {
            let version = definition["version"].as_str();
            let mut diagnostics = Vec::new();
            if let Some((schema_pointer, properties)) =
                catalog_schema_properties(source, &Value::Null, &mut diagnostics)
            {
                check_catalog_fields(
                    schema_pointer,
                    properties,
                    definition,
                    version,
                    &mut diagnostics,
                );
            }
            diagnostics
        }
        [definition] => vec![InstanceProjectionDiagnostic::new(
            Code::DefinitionMismatch,
            "/definitionRef",
            definition["version"].as_str(),
            format!(
                "Draft source targets Definition '{url}' but received {}.",
                definition["url"]
            ),
        )],
        [] => vec![InstanceProjectionDiagnostic::new(
            Code::NoEligibleVersion,
            "/definitionRef",
            None,
            format!("No loaded Definition matches draft source '{url}'."),
        )],
        _ => vec![InstanceProjectionDiagnostic::new(
            Code::VersionAmbiguous,
            "/definitionRef",
            None,
            format!("More than one Definition was supplied for draft source '{url}'."),
        )],
    }
}

/// Extracts the declared root properties or reports an unsupported catalog schema.
fn catalog_schema_properties<'a>(
    source: &'a Value,
    selection: &Value,
    diagnostics: &mut Vec<InstanceProjectionDiagnostic>,
) -> Option<(&'static str, &'a Map<String, Value>)> {
    let mut schema_pointer = "/schema";
    let mut report = |pointer, message| {
        diagnostics.push(InstanceProjectionDiagnostic::new(
            InstanceProjectionCode::SchemaUnsupported,
            pointer,
            None,
            message,
        ));
    };
    if selection.get("mapping").is_some() {
        report("/responseSelection/mapping".to_owned(),
            "The Mapping's upstream reads and output shape cannot be proven from this source and the upstream Definition.".to_owned());
        return None;
    }
    let schema = source.get("schema")?;
    let schema = if selection["cardinality"] == "latest-per-subject" {
        if let Some(keyword) = unsupported_catalog_keyword(schema) {
            report(
                format!("/schema/{keyword}"),
                format!(
                    "Cannot determine delivered record keys through JSON Schema keyword '{keyword}'."
                ),
            );
            return None;
        }
        if !schema_type_admits(schema, "array") {
            report(
                "/schema/type".to_owned(),
                "A latest-per-subject catalog schema must describe an array of records.".to_owned(),
            );
            return None;
        }
        schema_pointer = "/schema/items";
        &schema["items"]
    } else {
        schema
    };
    if let Some(keyword) = unsupported_catalog_keyword(schema) {
        report(
            format!("{schema_pointer}/{keyword}"),
            format!(
                "Cannot determine delivered record keys through JSON Schema keyword '{keyword}'."
            ),
        );
        return None;
    }
    if !schema.is_object() || !schema_type_admits(schema, "object") {
        report(
            schema_pointer.to_owned(),
            "The catalog record schema must describe an object to compare its delivered keys."
                .to_owned(),
        );
        return None;
    }
    let Some(properties) = schema.get("properties")?.as_object() else {
        report(
            format!("{schema_pointer}/properties"),
            "The catalog record properties must be an object.".to_owned(),
        );
        return None;
    };
    Some((schema_pointer, properties))
}

/// Checks catalog root keys and their JSON types against one upstream Definition.
fn check_catalog_fields(
    schema_pointer: &str,
    properties: &Map<String, Value>,
    definition: &Value,
    upstream_version: Option<&str>,
    diagnostics: &mut Vec<InstanceProjectionDiagnostic>,
) {
    use InstanceProjectionCode as Code;

    let mut report = |code, pointer, message| {
        diagnostics.push(InstanceProjectionDiagnostic::new(
            code,
            pointer,
            upstream_version,
            message,
        ));
    };
    let Some(items) = definition["items"].as_array() else {
        report(
            Code::SchemaUnsupported,
            format!("{schema_pointer}/properties"),
            "The upstream Definition items cannot be compared with the catalog record properties."
                .to_owned(),
        );
        return;
    };
    for (key, property_schema) in properties.iter().collect::<BTreeMap<_, _>>() {
        let pointer = format!("{schema_pointer}/properties/{}", json_pointer_token(key));
        let item = items.iter().find(|item| {
            item["key"] == key.as_str() && matches!(item["type"].as_str(), Some("field" | "group"))
        });
        let Some(item) = item else {
            report(
                Code::PathMissing,
                pointer,
                format!(
                    "Catalog property '{key}' does not identify a root data key in the upstream Definition."
                ),
            );
            continue;
        };
        if let Some(actual) = value_json_type(item)
            && !schema_type_admits(property_schema, actual)
        {
            report(
                Code::FieldTypeMismatch,
                format!("{pointer}/type"),
                format!(
                    "Catalog property '{key}' declares {}, but the upstream value has JSON type '{actual}'.",
                    property_schema["type"],
                ),
            );
        }
    }
}

/// Checks whether a JSON Schema permits the serialized type.
fn schema_type_admits(schema: &Value, actual: &str) -> bool {
    let Some(expected) = schema.get("type") else {
        return true;
    };
    let matches =
        |declared: &Value| declared == actual || (actual == "integer" && declared == "number");
    matches(expected)
        || expected
            .as_array()
            .is_some_and(|types| types.iter().any(matches))
}

/// Finds a schema keyword that prevents a direct comparison of root keys.
fn unsupported_catalog_keyword(schema: &Value) -> Option<&'static str> {
    // These keywords can declare or constrain root keys outside direct `properties`.
    [
        "$dynamicRef",
        "$ref",
        "allOf",
        "anyOf",
        "dependentSchemas",
        "else",
        "if",
        "not",
        "oneOf",
        "patternProperties",
        "propertyNames",
        "then",
        "unevaluatedProperties",
    ]
    .into_iter()
    .find(|key| schema.get(*key).is_some())
}

/// Returns the JSON type of a data-producing Formspec item.
fn value_json_type(item: &Value) -> Option<&'static str> {
    if item["type"] == "group" {
        return Some(if item["repeatable"] == true {
            "array"
        } else {
            "object"
        });
    }
    // Core §4.2.3 defines the serialized types of data-producing fields.
    match item["dataType"].as_str()? {
        "integer" => Some("integer"),
        "decimal" => Some("number"),
        "boolean" => Some("boolean"),
        "attachment" | "money" => Some("object"),
        "multiChoice" => Some("array"),
        "choice" | "date" | "dateTime" | "string" | "text" | "time" | "uri" => Some("string"),
        _ => None,
    }
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
    schema: &Map<String, Value>,
    items: &Value,
    upstream_version: &str,
    diagnostics: &mut Vec<InstanceProjectionDiagnostic>,
) {
    use InstanceProjectionCode as Code;

    for (path, expected_type) in schema {
        let (code, message) = match projected_field(items, path)
            .and_then(|field| field["dataType"].as_str())
        {
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
        diagnostics.push(InstanceProjectionDiagnostic::new(
            code,
            format!("/schema/{}", json_pointer_token(path)),
            Some(upstream_version),
            message,
        ));
    }
}

/// Escapes a member name for use as a JSON Pointer token.
fn json_pointer_token(value: &str) -> String {
    value.replace('~', "~0").replace('/', "~1")
}

/// Resolves a data path while checking the array traversal at each group.
fn projected_field<'a>(mut items: &'a Value, path: &str) -> Option<&'a Value> {
    let mut segments = path.split('.').peekable();
    while let Some(segment) = segments.next() {
        let (key, wildcard) = segment
            .strip_suffix("[*]")
            .map_or((segment, false), |key| (key, true));
        let item = items.as_array()?.iter().find(|item| item["key"] == key)?;
        if segments.peek().is_none() {
            return if item["type"] == "field" && !wildcard {
                Some(item)
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

/// Reports catalog predicates that reference an undeclared consuming subject key.
fn check_catalog_subject_keys(
    response: &Value,
    consumer_subject: Option<&Value>,
    diagnostics: &mut Vec<InstanceProjectionDiagnostic>,
) {
    let Some(predicates) = response["subject"].as_array() else {
        return;
    };
    for (index, predicate) in predicates.iter().enumerate() {
        if let Some(source_key) = predicate["from"]["subject"].as_str()
            && consumer_subject.is_none_or(|subject| subject["keys"].get(source_key).is_none())
        {
            diagnostics.push(InstanceProjectionDiagnostic::new(
                InstanceProjectionCode::SubjectKeyMissing,
                format!("/responseSelection/subject/{index}/from/subject"),
                None,
                format!("The consuming Definition's subject must declare key '{source_key}'."),
            ));
        }
    }
}

/// Checks each upstream predicate key and compares its type with the consuming key.
fn check_subject_predicates(
    response: &Value,
    consumer_subject: Option<&Value>,
    upstream_subject: &Value,
    upstream_version: &str,
    member: &str,
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
        let pointer = format!("/{member}/subject/{index}");
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
        if let Some(source_key) = predicate["from"]["subject"].as_str()
            && let Some(source_type) = consumer_subject
                .and_then(|subject| subject["keys"][source_key]["dataType"].as_str())
            && source_type != key_type
        {
            diagnostics.push(InstanceProjectionDiagnostic::new(
                Code::SubjectKeyTypeMismatch,
                format!("{pointer}/from/subject"),
                Some(upstream_version),
                format!(
                    "Consuming subject key '{source_key}' has type '{source_type}' but upstream key '{key}' has type '{key_type}'."
                ),
            ));
        }
    }
}

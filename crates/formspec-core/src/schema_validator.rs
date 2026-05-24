//! Schema validation with document type detection and validation dispatch.
//!
//! Uses dependency inversion: JSON Schema validation is provided by the host via
//! [`JsonSchemaValidator`]. This module detects document types, translates paths, and
//! plans per-component validation for component trees.

use serde::Serialize;
use serde_json::Value;

// ── Document types ──────────────────────────────────────────────

/// All recognized Formspec document types.
#[allow(missing_docs)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum DocumentType {
    Definition,
    Issuer,
    Theme,
    Mapping,
    ValidationMapping,
    ResponseActions,
    Ontology,
    References,
    Locale,
    Experience,
    Component,
    Response,
    IntakeHandoff,
    ValidationReport,
    ValidationResult,
    Registry,
    Changelog,
    FelFunctions,
    Screener,
    Determination,
    /// Surface document per ADR 0150 §6 — composition primitive that names
    /// routes and binds slots (definition-form, experience-unit, module-widget,
    /// static-content, embed-route). Marker field `$formspecSurface`.
    Surface,
}

impl DocumentType {
    /// Schema key for this document type (used as discriminator).
    pub fn schema_key(&self) -> &'static str {
        match self {
            DocumentType::Definition => "definition",
            DocumentType::Issuer => "issuer",
            DocumentType::Theme => "theme",
            DocumentType::Mapping => "mapping",
            DocumentType::ValidationMapping => "validation_mapping",
            DocumentType::ResponseActions => "response_actions",
            DocumentType::Ontology => "ontology",
            DocumentType::References => "references",
            DocumentType::Locale => "locale",
            DocumentType::Experience => "experience",
            DocumentType::Component => "component",
            DocumentType::Response => "response",
            DocumentType::IntakeHandoff => "intake_handoff",
            DocumentType::ValidationReport => "validation_report",
            DocumentType::ValidationResult => "validation_result",
            DocumentType::Registry => "registry",
            DocumentType::Changelog => "changelog",
            DocumentType::FelFunctions => "fel_functions",
            DocumentType::Screener => "screener",
            DocumentType::Determination => "determination",
            DocumentType::Surface => "surface",
        }
    }

    /// Parse the public schema key string used by the TS/Python layers.
    pub fn from_schema_key(key: &str) -> Option<Self> {
        match key {
            "definition" => Some(DocumentType::Definition),
            "issuer" => Some(DocumentType::Issuer),
            "theme" => Some(DocumentType::Theme),
            "mapping" => Some(DocumentType::Mapping),
            "validation_mapping" | "validationMapping" | "validation-mapping" => {
                Some(DocumentType::ValidationMapping)
            }
            "response_actions" | "responseActions" | "response-actions" => {
                Some(DocumentType::ResponseActions)
            }
            "ontology" => Some(DocumentType::Ontology),
            "references" => Some(DocumentType::References),
            "locale" => Some(DocumentType::Locale),
            "experience" => Some(DocumentType::Experience),
            "component" => Some(DocumentType::Component),
            "response" => Some(DocumentType::Response),
            "intake_handoff" | "intakeHandoff" | "intake-handoff" => {
                Some(DocumentType::IntakeHandoff)
            }
            "validation_report" | "validationReport" => Some(DocumentType::ValidationReport),
            "validation_result" | "validationResult" => Some(DocumentType::ValidationResult),
            "registry" => Some(DocumentType::Registry),
            "changelog" => Some(DocumentType::Changelog),
            "fel_functions" | "fel-functions" => Some(DocumentType::FelFunctions),
            "screener" => Some(DocumentType::Screener),
            "determination" => Some(DocumentType::Determination),
            "surface" => Some(DocumentType::Surface),
            _ => None,
        }
    }
}

// ── Validation types ────────────────────────────────────────────

/// A schema validation error with path and message.
#[derive(Debug, Clone)]
pub struct SchemaValidationError {
    /// JSONPath to the invalid element (e.g., `$.items\[0\].key`).
    pub path: String,
    /// Human-readable error message.
    pub message: String,
}

/// Result of schema validation.
#[derive(Debug, Clone)]
pub struct SchemaValidationResult {
    /// Detected document type (None if detection failed).
    pub document_type: Option<DocumentType>,
    /// Validation errors.
    pub errors: Vec<SchemaValidationError>,
}

/// A single component subtree node that needs host-side schema execution.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentValidationTarget {
    /// JSON Pointer to the node root (e.g. `/tree/children/0`).
    pub pointer: String,
    /// Component type string used to pick the correct schema definition.
    pub component: String,
    /// Raw node value to validate.
    pub node: Value,
}

/// Validation dispatch plan returned to host runtimes that execute JSON Schema locally.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaValidationPlan {
    /// Detected or explicitly requested document type.
    pub document_type: Option<String>,
    /// Strategy discriminator: `unknown`, `document`, or `component`.
    pub mode: String,
    /// Per-node validation targets for component documents.
    pub component_targets: Vec<ComponentValidationTarget>,
    /// Populated only for `unknown` mode.
    pub error: Option<String>,
}

// ── Document type detection ─────────────────────────────────────

/// Marker fields that identify document types.
/// Every Formspec document type has a `$formspec*` marker field (required, const "1.0"):
///   - Definition:        `$formspec`
///   - Theme:             `$formspecTheme`
///   - Component:         `$formspecComponent`
///   - Registry:          `$formspecRegistry`
///   - Locale:            `$formspecLocale`
///   - References:        `$formspecReferences`
///   - Experience:        `$formspecExperience`
///   - Mapping:           `$formspecMapping`
///   - ValidationMapping: `$formspecValidationMapping`
///   - ResponseActions:   `$formspecResponseActions`
///   - Response:          `$formspecResponse`
///   - Issuer:            `$formspecIssuer`
///   - IntakeHandoff:     `$formspecIntakeHandoff`
///   - ValidationReport:  `$formspecValidationReport`
///   - ValidationResult:  `$formspecValidationResult`
///   - Changelog:         `$formspecChangelog`
///   - FEL Functions:     `$formspecFelFunctions`
const MARKER_FIELDS: &[(&str, DocumentType)] = &[
    ("$formspec", DocumentType::Definition),
    ("$formspecIssuer", DocumentType::Issuer),
    ("$formspecTheme", DocumentType::Theme),
    ("$formspecComponent", DocumentType::Component),
    ("$formspecRegistry", DocumentType::Registry),
    ("$formspecLocale", DocumentType::Locale),
    ("$formspecReferences", DocumentType::References),
    ("$formspecOntology", DocumentType::Ontology),
    ("$formspecMapping", DocumentType::Mapping),
    (
        "$formspecValidationMapping",
        DocumentType::ValidationMapping,
    ),
    ("$formspecResponseActions", DocumentType::ResponseActions),
    ("$formspecExperience", DocumentType::Experience),
    ("$formspecResponse", DocumentType::Response),
    ("$formspecIntakeHandoff", DocumentType::IntakeHandoff),
    ("$formspecValidationReport", DocumentType::ValidationReport),
    ("$formspecValidationResult", DocumentType::ValidationResult),
    ("$formspecChangelog", DocumentType::Changelog),
    ("$formspecFelFunctions", DocumentType::FelFunctions),
    ("$formspecScreener", DocumentType::Screener),
    ("$formspecDetermination", DocumentType::Determination),
    ("$formspecSurface", DocumentType::Surface),
];

/// Detect the document type from a JSON value by examining marker fields.
pub fn detect_document_type(doc: &Value) -> Option<DocumentType> {
    let obj = doc.as_object()?;

    // Check marker fields — the only authoritative signal for document type.
    for &(field, doc_type) in MARKER_FIELDS {
        if obj.contains_key(field) {
            return Some(doc_type);
        }
    }

    None
}

// ── JSON Schema validator trait (dependency inversion) ───────────

/// Trait for JSON Schema validation — implemented by the host/binding layer.
///
/// This allows the WASM layer to use AJV and the PyO3 layer to use jsonschema-rs
/// without coupling `formspec-core` to either.
pub trait JsonSchemaValidator {
    /// Validate a document against the schema for the given document type.
    /// Returns a list of validation errors (empty = valid).
    fn validate(&self, doc: &Value, doc_type: DocumentType) -> Vec<SchemaValidationError>;
}

// ── High-level validation ───────────────────────────────────────

/// Validate a Formspec document, auto-detecting its type and running schema validation.
pub fn validate_document(
    doc: &Value,
    validator: &dyn JsonSchemaValidator,
) -> SchemaValidationResult {
    let doc_type = detect_document_type(doc);

    match doc_type {
        None => SchemaValidationResult {
            document_type: None,
            errors: vec![SchemaValidationError {
                path: "$".to_string(),
                message: "Cannot determine document type: no recognized marker field found"
                    .to_string(),
            }],
        },
        Some(dt) => {
            let errors = validator.validate(doc, dt);
            SchemaValidationResult {
                document_type: Some(dt),
                errors,
            }
        }
    }
}

// ── Path translation utilities ──────────────────────────────────

/// Convert a JSON Pointer (e.g., `/items/0/key`) to a JSONPath (e.g., `$.items\[0\].key`).
pub fn json_pointer_to_jsonpath(pointer: &str) -> String {
    if pointer.is_empty() {
        return "$".to_string();
    }

    let mut result = String::from("$");
    for part in pointer.split('/').skip(1) {
        if let Ok(idx) = part.parse::<usize>() {
            result.push_str(&format!("[{idx}]"));
        } else {
            result.push('.');
            result.push_str(part);
        }
    }
    result
}

/// Build the validation execution plan for a document.
///
/// Non-component documents validate as a single root document. Component documents use
/// the same shallow-document + per-node strategy as the host validators to avoid
/// whole-tree oneOf backtracking.
pub fn schema_validation_plan(
    doc: &Value,
    document_type_override: Option<DocumentType>,
) -> SchemaValidationPlan {
    let detected = document_type_override.or_else(|| detect_document_type(doc));

    match detected {
        None => SchemaValidationPlan {
            document_type: None,
            mode: "unknown".to_string(),
            component_targets: Vec::new(),
            error: Some("Unable to detect Formspec document type".to_string()),
        },
        Some(DocumentType::Component) => SchemaValidationPlan {
            document_type: Some(DocumentType::Component.schema_key().to_string()),
            mode: "component".to_string(),
            component_targets: collect_component_targets(doc),
            error: None,
        },
        Some(dt) => SchemaValidationPlan {
            document_type: Some(dt.schema_key().to_string()),
            mode: "document".to_string(),
            component_targets: Vec::new(),
            error: None,
        },
    }
}

/// Walk `tree` and `components/*/tree` to build [`ComponentValidationTarget`] rows for host validators.
fn collect_component_targets(doc: &Value) -> Vec<ComponentValidationTarget> {
    let mut targets = Vec::new();
    let Some(obj) = doc.as_object() else {
        return targets;
    };

    if let Some(tree) = obj.get("tree") {
        walk_component_node(tree, "/tree", &mut targets);
    }

    if let Some(components) = obj.get("components").and_then(Value::as_object) {
        for (name, component_def) in components {
            if let Some(template_tree) = component_def.get("tree") {
                let pointer = format!("/components/{name}/tree");
                walk_component_node(template_tree, &pointer, &mut targets);
            }
        }
    }

    targets
}

/// Depth-first visit of one component JSON node, pushing leaf widgets that declare `component`.
fn walk_component_node(node: &Value, pointer: &str, out: &mut Vec<ComponentValidationTarget>) {
    let child_seg = |parent: &str, i: usize| format!("{parent}/children/{i}");
    crate::component_tree::visit_component_subtree(node, pointer, &child_seg, &mut |n, p| {
        let Some(obj) = n.as_object() else {
            return;
        };
        let Some(component_name) = obj.get("component").and_then(Value::as_str) else {
            return;
        };
        out.push(ComponentValidationTarget {
            pointer: p.to_string(),
            component: component_name.to_string(),
            node: n.clone(),
        });
    });
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;
    use serde_json::json;

    #[test]
    fn test_detect_definition() {
        let doc = json!({ "$formspec": "1.0", "items": [], "title": "Test" });
        assert_eq!(detect_document_type(&doc), Some(DocumentType::Definition));
    }

    #[test]
    fn test_detect_issuer() {
        let doc = json!({
            "$formspecIssuer": "1.0",
            "url": "https://example.org/issuers/acme.json",
            "version": "1.0.0",
            "name": "Acme",
            "kind": "organization"
        });
        assert_eq!(detect_document_type(&doc), Some(DocumentType::Issuer));
    }

    #[test]
    fn test_detect_theme() {
        let doc = json!({ "$formspecTheme": "1.0", "tokens": {} });
        assert_eq!(detect_document_type(&doc), Some(DocumentType::Theme));
    }

    #[test]
    fn test_detect_mapping() {
        let doc = json!({ "$formspecMapping": "1.0", "rules": [], "targetSchema": "urn:example", "definitionRef": "https://example.org/forms/x", "definitionVersion": "1.0.0", "version": "1.0.0" });
        assert_eq!(detect_document_type(&doc), Some(DocumentType::Mapping));
    }

    #[test]
    fn test_detect_validation_mapping() {
        let doc = json!({
            "$formspecValidationMapping": "1.0",
            "version": "1.0.0"
        });
        assert_eq!(
            detect_document_type(&doc),
            Some(DocumentType::ValidationMapping)
        );
    }

    #[test]
    fn test_detect_response_actions() {
        let doc = json!({
            "$formspecResponseActions": "1.0",
            "version": "1.0.0"
        });
        assert_eq!(
            detect_document_type(&doc),
            Some(DocumentType::ResponseActions)
        );
    }

    #[test]
    fn test_detect_ontology() {
        let doc = json!({
            "$formspecOntology": "1.0",
            "version": "1.0.0",
            "targetDefinition": { "url": "https://example.org/forms/x" }
        });
        assert_eq!(detect_document_type(&doc), Some(DocumentType::Ontology));
    }

    #[test]
    fn test_detect_references() {
        let doc = json!({
            "$formspecReferences": "1.0",
            "version": "1.0.0",
            "targetDefinition": { "url": "https://example.org/forms/x" },
            "references": []
        });
        assert_eq!(detect_document_type(&doc), Some(DocumentType::References));
    }

    #[test]
    fn test_detect_locale() {
        let doc = json!({
            "$formspecLocale": "1.0",
            "version": "1.0.0",
            "locale": "en",
            "targetDefinition": { "url": "https://example.org/forms/x" },
            "strings": {}
        });
        assert_eq!(detect_document_type(&doc), Some(DocumentType::Locale));
    }

    #[test]
    fn test_detect_experience() {
        let doc = json!({
            "$formspecExperience": "1.0",
            "version": "1.0.0",
            "targetDefinition": { "url": "https://example.org/forms/x" }
        });
        assert_eq!(detect_document_type(&doc), Some(DocumentType::Experience));
    }

    #[test]
    fn test_detect_component() {
        let doc = json!({ "$formspecComponent": "1.0", "tree": {}, "componentType": "Stack" });
        assert_eq!(detect_document_type(&doc), Some(DocumentType::Component));
    }

    #[test]
    fn test_detect_response() {
        let doc = json!({
            "$formspecResponse": "1.0",
            "definitionUrl": "https://example.org/forms/x",
            "definitionVersion": "1.0.0",
            "status": "in-progress",
            "data": {},
            "authored": "2025-01-01T00:00:00Z"
        });
        assert_eq!(detect_document_type(&doc), Some(DocumentType::Response));
    }

    #[test]
    fn test_detect_intake_handoff() {
        let doc = json!({
            "$formspecIntakeHandoff": "1.0",
            "handoffId": "handoff-1",
            "initiationMode": "publicIntake",
            "definitionRef": {
                "url": "https://example.org/forms/x",
                "version": "1.0.0"
            },
            "responseRef": "urn:formspec:response:resp-1",
            "responseHash": "sha256:abc",
            "validationReportRef": "urn:formspec:validation-report:vr-1",
            "intakeSessionId": "session-1",
            "ledgerHeadRef": "urn:formspec:respondent-ledger-event:evt-1",
            "occurredAt": "2026-04-22T17:15:00Z"
        });
        assert_eq!(
            detect_document_type(&doc),
            Some(DocumentType::IntakeHandoff)
        );
    }

    #[test]
    fn test_detect_validation_report() {
        let doc = json!({
            "$formspecValidationReport": "1.0",
            "valid": true,
            "results": [],
            "counts": { "error": 0, "warning": 0, "info": 0 },
            "timestamp": "2025-01-01T00:00:00Z"
        });
        assert_eq!(
            detect_document_type(&doc),
            Some(DocumentType::ValidationReport)
        );
    }

    #[test]
    fn test_detect_validation_result() {
        let doc = json!({
            "$formspecValidationResult": "1.0",
            "path": "field",
            "severity": "error",
            "constraintKind": "required",
            "message": "Required",
        });
        assert_eq!(
            detect_document_type(&doc),
            Some(DocumentType::ValidationResult)
        );
    }

    #[test]
    fn test_detect_fel_functions() {
        let doc = json!({
            "$formspecFelFunctions": "1.0",
            "version": "1.0.0",
            "functions": [],
        });
        assert_eq!(detect_document_type(&doc), Some(DocumentType::FelFunctions));
    }

    #[test]
    fn test_detect_changelog() {
        let doc = json!({
            "$formspecChangelog": "1.0",
            "definitionUrl": "https://example.org/forms/x",
            "fromVersion": "1.0.0",
            "toVersion": "2.0.0",
            "semverImpact": "breaking",
            "changes": []
        });
        assert_eq!(detect_document_type(&doc), Some(DocumentType::Changelog));
    }

    #[test]
    fn test_detect_unknown() {
        let doc = json!({ "random": "data" });
        assert_eq!(detect_document_type(&doc), None);
    }

    #[test]
    fn test_json_pointer_to_jsonpath() {
        assert_eq!(json_pointer_to_jsonpath(""), "$");
        assert_eq!(json_pointer_to_jsonpath("/items/0/key"), "$.items[0].key");
        assert_eq!(
            json_pointer_to_jsonpath("/items/0/children/1"),
            "$.items[0].children[1]"
        );
        assert_eq!(json_pointer_to_jsonpath("/title"), "$.title");
    }

    #[test]
    fn test_validate_unknown_document() {
        struct NoopValidator;
        impl JsonSchemaValidator for NoopValidator {
            fn validate(&self, _doc: &Value, _dt: DocumentType) -> Vec<SchemaValidationError> {
                vec![]
            }
        }

        let doc = json!({ "random": "data" });
        let result = validate_document(&doc, &NoopValidator);
        assert!(result.document_type.is_none());
        assert_eq!(result.errors.len(), 1);
        assert!(
            result.errors[0]
                .message
                .contains("Cannot determine document type")
        );
    }

    #[test]
    fn test_validate_valid_document() {
        struct AlwaysValid;
        impl JsonSchemaValidator for AlwaysValid {
            fn validate(&self, _doc: &Value, _dt: DocumentType) -> Vec<SchemaValidationError> {
                vec![]
            }
        }

        let doc = json!({ "$formspec": "1.0", "items": [], "title": "Test" });
        let result = validate_document(&doc, &AlwaysValid);
        assert_eq!(result.document_type, Some(DocumentType::Definition));
        assert!(result.errors.is_empty());
    }

    // ── Marker detection — schema_validator ──────────────────────

    /// Spec: schema spec — "Marker field ($formspec) identifies definition documents"
    #[test]
    fn marker_identifies_definition() {
        // Doc has the definition marker along with other fields
        let doc = json!({
            "$formspec": "1.0",
            "items": [],
            "title": "Test",
            "tokens": {},
            "selectors": []
        });
        assert_eq!(detect_document_type(&doc), Some(DocumentType::Definition));
    }

    /// Spec: schema spec — "Marker field ($formspecTheme) identifies theme documents"
    #[test]
    fn theme_marker_identifies_theme() {
        let doc = json!({
            "$formspecTheme": "1.0",
            "tokens": {},
            "items": [],
            "title": "Test"
        });
        assert_eq!(detect_document_type(&doc), Some(DocumentType::Theme));
    }

    // ── Non-object input ─────────────────────────────────────────

    /// Spec: schema spec — "Non-object input returns None from detect_document_type"
    #[test]
    fn detect_non_object_returns_none() {
        assert_eq!(detect_document_type(&json!("string")), None);
        assert_eq!(detect_document_type(&json!(42)), None);
        assert_eq!(detect_document_type(&json!(null)), None);
        assert_eq!(detect_document_type(&json!(true)), None);
        assert_eq!(detect_document_type(&json!([1, 2, 3])), None);
    }

    // ── DocumentType::schema_key coverage ────────────────────────

    /// Spec: schema spec — "All document types have correct schema_key values"
    #[test]
    fn schema_key_values() {
        assert_eq!(DocumentType::Definition.schema_key(), "definition");
        assert_eq!(DocumentType::Issuer.schema_key(), "issuer");
        assert_eq!(DocumentType::Theme.schema_key(), "theme");
        assert_eq!(DocumentType::Mapping.schema_key(), "mapping");
        assert_eq!(
            DocumentType::ValidationMapping.schema_key(),
            "validation_mapping"
        );
        assert_eq!(
            DocumentType::ResponseActions.schema_key(),
            "response_actions"
        );
        assert_eq!(DocumentType::Ontology.schema_key(), "ontology");
        assert_eq!(DocumentType::References.schema_key(), "references");
        assert_eq!(DocumentType::Locale.schema_key(), "locale");
        assert_eq!(DocumentType::Experience.schema_key(), "experience");
        assert_eq!(DocumentType::Component.schema_key(), "component");
        assert_eq!(DocumentType::Response.schema_key(), "response");
        assert_eq!(DocumentType::IntakeHandoff.schema_key(), "intake_handoff");
        assert_eq!(
            DocumentType::ValidationReport.schema_key(),
            "validation_report"
        );
        assert_eq!(
            DocumentType::ValidationResult.schema_key(),
            "validation_result"
        );
        assert_eq!(DocumentType::Registry.schema_key(), "registry");
        assert_eq!(DocumentType::Changelog.schema_key(), "changelog");
        assert_eq!(DocumentType::FelFunctions.schema_key(), "fel_functions");
    }

    #[test]
    fn schema_key_parser_accepts_public_values() {
        assert_eq!(
            DocumentType::from_schema_key("issuer"),
            Some(DocumentType::Issuer)
        );
        assert_eq!(
            DocumentType::from_schema_key("validation_report"),
            Some(DocumentType::ValidationReport)
        );
        assert_eq!(
            DocumentType::from_schema_key("validation_result"),
            Some(DocumentType::ValidationResult)
        );
        assert_eq!(
            DocumentType::from_schema_key("intake_handoff"),
            Some(DocumentType::IntakeHandoff)
        );
        assert_eq!(
            DocumentType::from_schema_key("intake-handoff"),
            Some(DocumentType::IntakeHandoff)
        );
        assert_eq!(
            DocumentType::from_schema_key("intakeHandoff"),
            Some(DocumentType::IntakeHandoff)
        );
        assert_eq!(
            DocumentType::from_schema_key("validation_mapping"),
            Some(DocumentType::ValidationMapping)
        );
        assert_eq!(
            DocumentType::from_schema_key("validation-mapping"),
            Some(DocumentType::ValidationMapping)
        );
        assert_eq!(
            DocumentType::from_schema_key("validationMapping"),
            Some(DocumentType::ValidationMapping)
        );
        assert_eq!(
            DocumentType::from_schema_key("response_actions"),
            Some(DocumentType::ResponseActions)
        );
        assert_eq!(
            DocumentType::from_schema_key("response-actions"),
            Some(DocumentType::ResponseActions)
        );
        assert_eq!(
            DocumentType::from_schema_key("responseActions"),
            Some(DocumentType::ResponseActions)
        );
        assert_eq!(
            DocumentType::from_schema_key("fel_functions"),
            Some(DocumentType::FelFunctions)
        );
        assert_eq!(
            DocumentType::from_schema_key("ontology"),
            Some(DocumentType::Ontology)
        );
        assert_eq!(
            DocumentType::from_schema_key("references"),
            Some(DocumentType::References)
        );
        assert_eq!(
            DocumentType::from_schema_key("locale"),
            Some(DocumentType::Locale)
        );
        assert_eq!(
            DocumentType::from_schema_key("experience"),
            Some(DocumentType::Experience)
        );
        assert_eq!(DocumentType::from_schema_key("missing"), None);
    }

    #[test]
    fn component_validation_plan_collects_main_tree_and_templates() {
        let doc = json!({
            "$formspecComponent": "1.0",
            "version": "1.0.0",
            "targetDefinition": { "url": "https://example.com/def" },
            "tree": {
                "component": "Section",
                "children": [
                    { "component": "TextInput", "bind": "name" }
                ]
            },
            "components": {
                "CustomCard": {
                    "tree": {
                        "component": "Stack",
                        "children": [
                            { "component": "TextInput", "bind": "email" }
                        ]
                    }
                }
            }
        });

        let plan = schema_validation_plan(&doc, None);
        assert_eq!(plan.document_type.as_deref(), Some("component"));
        assert_eq!(plan.mode, "component");
        assert_eq!(plan.component_targets.len(), 4);
        assert_eq!(plan.component_targets[0].pointer, "/tree");
        assert_eq!(plan.component_targets[1].pointer, "/tree/children/0");
        assert_eq!(
            plan.component_targets[2].pointer,
            "/components/CustomCard/tree"
        );
        assert_eq!(
            plan.component_targets[3].pointer,
            "/components/CustomCard/tree/children/0"
        );
    }

    #[test]
    fn schema_validation_plan_serialize_uses_camel_case_keys() {
        let doc = json!({ "$formspec": "1.0", "items": [], "title": "T" });
        let plan = schema_validation_plan(&doc, None);
        let v = serde_json::to_value(&plan).unwrap();
        assert!(v.get("documentType").is_some(), "expected documentType key");
        assert!(
            v.get("document_type").is_none(),
            "Rust field names must not leak to JSON"
        );
        assert!(v.get("componentTargets").is_some());
    }

    #[test]
    fn unknown_validation_plan_reports_error() {
        let doc = json!({ "random": true });
        let plan = schema_validation_plan(&doc, None);
        assert_eq!(plan.document_type, None);
        assert_eq!(plan.mode, "unknown");
        assert_eq!(
            plan.error.as_deref(),
            Some("Unable to detect Formspec document type")
        );
    }
    /// Spec: schemas/definition.schema.json — validate_document with a mock
    /// validator that returns actual SchemaValidationError instances, verifying
    /// that detected type is passed through and errors are propagated.
    #[test]
    fn test_validate_document_with_errors() {
        struct ErrorValidator;
        impl JsonSchemaValidator for ErrorValidator {
            fn validate(&self, _doc: &Value, dt: DocumentType) -> Vec<SchemaValidationError> {
                vec![
                    SchemaValidationError {
                        path: "$.items[0].key".to_string(),
                        message: format!("required property missing in {}", dt.schema_key()),
                    },
                    SchemaValidationError {
                        path: "$.title".to_string(),
                        message: "must be a string".to_string(),
                    },
                ]
            }
        }

        let doc = json!({ "$formspec": "1.0", "items": [{}], "title": 42 });
        let result = validate_document(&doc, &ErrorValidator);
        assert_eq!(result.document_type, Some(DocumentType::Definition));
        assert_eq!(result.errors.len(), 2);
        assert_eq!(result.errors[0].path, "$.items[0].key");
        assert!(result.errors[0].message.contains("definition"));
        assert_eq!(result.errors[1].path, "$.title");
        assert_eq!(result.errors[1].message, "must be a string");
    }

    /// Spec: core/spec.md §5.3 (RFC 6901) — JSON Pointer segment `01` is an opaque
    /// string per RFC 6901, not array index 1. `json_pointer_to_jsonpath` currently
    /// treats any numeric segment as an array index. This test documents that
    /// leading-zero segments like `/items/01/key` are treated as array indices.
    #[test]
    fn json_pointer_leading_zero_treated_as_index() {
        // `01` parses as usize 1, so it becomes [1] in JSONPath.
        // This documents the current behavior — RFC 6901 says `01` is opaque,
        // but practical JSON Pointer usage in schemas treats it as an index.
        let result = json_pointer_to_jsonpath("/items/01/key");
        assert_eq!(result, "$.items[1].key");
    }
}

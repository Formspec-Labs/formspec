//! Pass 1b: JSON Schema validation — validates documents against embedded schemas (E101).
//!
//! Component documents use per-node validation to avoid O(N^depth) backtracking
//! from oneOf + unevaluatedProperties on recursive component trees. Each node is
//! validated against its specific `$defs` entry (discriminated by `component` const),
//! while the document envelope is validated with a shallow placeholder tree.
//!
//! Embedded schema text, compiled validators, and per-node component validators are internal.
#![allow(clippy::missing_docs_in_private_items)]

use std::collections::HashMap;
use std::sync::OnceLock;

use formspec_core::{DocumentType, json_pointer_to_jsonpath, visit_component_subtree};
use jsonschema::{Resource, Validator};
use serde_json::{Value, json};

use crate::types::LintDiagnostic;

// ── Embedded schemas ─────────────────────────────────────────────

const DEFINITION_SCHEMA: &str = include_str!("../schemas/definition.schema.json");
const COMPONENT_SCHEMA: &str = include_str!("../schemas/component.schema.json");
const THEME_SCHEMA: &str = include_str!("../schemas/theme.schema.json");
const RESPONSE_SCHEMA: &str = include_str!("../schemas/response.schema.json");
const INTAKE_HANDOFF_SCHEMA: &str = include_str!("../schemas/intake-handoff.schema.json");
const MAPPING_SCHEMA: &str = include_str!("../schemas/mapping.schema.json");
const CHANGELOG_SCHEMA: &str = include_str!("../schemas/changelog.schema.json");
const REGISTRY_SCHEMA: &str = include_str!("../schemas/registry.schema.json");
const VALIDATION_REPORT_SCHEMA: &str = include_str!("../schemas/validation-report.schema.json");
const VALIDATION_RESULT_SCHEMA: &str = include_str!("../schemas/validation-result.schema.json");
const VERIFICATION_RECEIPT_SCHEMA: &str =
    include_str!("../schemas/verification-receipt.schema.json");
const SCREENER_SCHEMA: &str = include_str!("../schemas/screener.schema.json");
const DETERMINATION_SCHEMA: &str = include_str!("../schemas/determination.schema.json");
const TOKEN_REGISTRY_SCHEMA: &str = include_str!("../schemas/token-registry.schema.json");

// ── Schema text + $id pairs for cross-file $ref resolution ───────

/// All schemas that may be referenced by `$ref` from other schemas.
/// Each entry: (schema JSON text, $id URI from the schema).
const CROSS_REF_SCHEMAS: &[(&str, &str)] = &[
    (
        VALIDATION_RESULT_SCHEMA,
        "https://formspec.org/schemas/validationResult/1.0",
    ),
    (
        COMPONENT_SCHEMA,
        "https://formspec.org/schemas/component/1.0",
    ),
    (
        DEFINITION_SCHEMA,
        "https://formspec.org/schemas/definition/1.0",
    ),
    (
        TOKEN_REGISTRY_SCHEMA,
        "https://formspec.org/schemas/token-registry/1.0",
    ),
    (
        VERIFICATION_RECEIPT_SCHEMA,
        "https://formspec.org/schemas/verification-receipt/1.0",
    ),
];

// ── Compiled validators (lazily initialized) ─────────────────────

struct SchemaSet {
    definition: Validator,
    envelope_component: Validator,
    theme: Validator,
    response: Validator,
    intake_handoff: Validator,
    mapping: Validator,
    changelog: Validator,
    registry: Validator,
    validation_report: Validator,
    validation_result: Validator,
    screener: Validator,
    determination: Validator,
}

fn schema_set() -> &'static SchemaSet {
    static SET: OnceLock<SchemaSet> = OnceLock::new();
    SET.get_or_init(|| SchemaSet {
        definition: build_validator(DEFINITION_SCHEMA),
        envelope_component: build_validator(COMPONENT_SCHEMA),
        theme: build_validator(THEME_SCHEMA),
        response: build_validator(RESPONSE_SCHEMA),
        intake_handoff: build_validator(INTAKE_HANDOFF_SCHEMA),
        mapping: build_validator(MAPPING_SCHEMA),
        changelog: build_validator(CHANGELOG_SCHEMA),
        registry: build_validator(REGISTRY_SCHEMA),
        validation_report: build_validator(VALIDATION_REPORT_SCHEMA),
        validation_result: build_validator(VALIDATION_RESULT_SCHEMA),
        screener: build_validator(SCREENER_SCHEMA),
        determination: build_validator(DETERMINATION_SCHEMA),
    })
}

fn build_validator(schema_text: &str) -> Validator {
    let schema: Value = serde_json::from_str(schema_text).expect("embedded schema is valid JSON");

    let mut opts = jsonschema::options();
    // Register all cross-referenced schemas so $ref resolution works.
    for &(ref_text, ref_id) in CROSS_REF_SCHEMAS {
        let ref_val: Value =
            serde_json::from_str(ref_text).expect("cross-ref schema is valid JSON");
        let resource = Resource::from_contents(ref_val);
        opts = opts.with_resource(ref_id, resource);
    }
    opts.build(&schema).expect("embedded schema compiles")
}

// ── Per-node component validators ───────────────────────────────

/// One compiled validator per component type, keyed by the `component` const value.
/// Built from the component schema's `$defs` with recursive refs (ChildrenArray,
/// AnyComponent) replaced by permissive stubs — we handle recursion ourselves.
struct ComponentNodeValidators {
    per_type: HashMap<String, Validator>,
    /// Fallback for custom component refs (any `component` value not matching a built-in).
    custom_ref: Validator,
}

fn component_node_validators() -> &'static ComponentNodeValidators {
    static VALIDATORS: OnceLock<ComponentNodeValidators> = OnceLock::new();
    VALIDATORS.get_or_init(|| {
        let full_schema: Value =
            serde_json::from_str(COMPONENT_SCHEMA).expect("embedded schema is valid JSON");
        let original_defs = full_schema
            .get("$defs")
            .and_then(Value::as_object)
            .expect("component schema has $defs");

        // Copy all $defs, then override the recursive ones to break the cycle.
        let mut defs = original_defs.clone();
        defs.insert("ChildrenArray".to_string(), json!({"type": "array"}));
        defs.insert(
            "AnyComponent".to_string(),
            json!({
                "type": "object",
                "required": ["component"],
                "properties": {
                    "component": {"type": "string", "minLength": 1}
                }
            }),
        );

        // Find component types: those whose `properties.component` has a `const`.
        let component_names: Vec<String> = original_defs
            .iter()
            .filter(|(_, v)| {
                v.get("properties")
                    .and_then(|p| p.get("component"))
                    .and_then(|c| c.get("const"))
                    .is_some()
            })
            .map(|(k, _)| k.clone())
            .collect();

        let mut per_type = HashMap::new();
        for name in &component_names {
            let const_val = original_defs[name]["properties"]["component"]["const"]
                .as_str()
                .unwrap_or(name)
                .to_string();

            let wrapper = json!({
                "$defs": defs,
                "$ref": format!("#/$defs/{}", name)
            });

            let validator = jsonschema::options()
                .build(&wrapper)
                .unwrap_or_else(|e| panic!("embedded component schema '{name}' must compile: {e}"));
            per_type.insert(const_val, validator);
        }

        // CustomComponentRef: fallback for any component name not matching a built-in.
        // Uses `not: { enum: [...] }` instead of a const, so we build it separately.
        let custom_ref_wrapper = json!({
            "$defs": defs,
            "$ref": "#/$defs/CustomComponentRef"
        });
        let custom_ref = jsonschema::options()
            .build(&custom_ref_wrapper)
            .expect("embedded CustomComponentRef schema must compile");

        ComponentNodeValidators {
            per_type,
            custom_ref,
        }
    })
}

// ── Public API ───────────────────────────────────────────────────

/// Validate a document against its JSON Schema, returning E101 diagnostics.
pub fn validate_schema(doc: &Value, doc_type: DocumentType) -> Vec<LintDiagnostic> {
    if doc_type == DocumentType::Component {
        return validate_component_schema(doc);
    }

    let set = schema_set();

    let validator = match doc_type {
        DocumentType::Definition => &set.definition,
        DocumentType::Component => unreachable!(),
        DocumentType::Theme => &set.theme,
        DocumentType::Response => &set.response,
        DocumentType::IntakeHandoff => &set.intake_handoff,
        DocumentType::Mapping => &set.mapping,
        DocumentType::Changelog => &set.changelog,
        DocumentType::Registry => &set.registry,
        DocumentType::ValidationReport => &set.validation_report,
        DocumentType::ValidationResult => &set.validation_result,
        DocumentType::Screener => &set.screener,
        DocumentType::Determination => &set.determination,
        DocumentType::FelFunctions => return Vec::new(),
    };

    validator
        .iter_errors(doc)
        .map(|err| {
            let pointer = err.instance_path().as_str();
            let path = json_pointer_to_jsonpath(pointer);
            crate::metadata::with_metadata(LintDiagnostic::error("E101", 1, path, err.to_string()))
        })
        .collect()
}

/// Component-specific validation: envelope + per-node.
///
/// 1. Validates the document envelope (version, targetDefinition, etc.) by
///    substituting a minimal single-node tree — no recursive oneOf.
/// 2. Walks the real tree and validates each component node individually
///    against its specific `$defs` entry (discriminated by `component` const).
fn validate_component_schema(doc: &Value) -> Vec<LintDiagnostic> {
    let set = schema_set();
    let node_validators = component_node_validators();
    let mut diags = Vec::new();

    // ── Envelope validation ──────────────────────────────────────
    // Replace all trees with a minimal valid single-node tree to avoid
    // oneOf backtracking while still validating envelope fields.
    let minimal_node = json!({"component": "Stack"});
    let mut shallow = doc.clone();
    if let Some(obj) = shallow.as_object_mut() {
        obj.insert("tree".to_string(), minimal_node.clone());
        if let Some(comps) = obj.get_mut("components").and_then(Value::as_object_mut) {
            for comp_def in comps.values_mut() {
                if let Some(cd) = comp_def.as_object_mut() {
                    cd.insert("tree".to_string(), minimal_node.clone());
                }
            }
        }
    }
    for err in set.envelope_component.iter_errors(&shallow) {
        let pointer = err.instance_path().as_str();
        let path = json_pointer_to_jsonpath(pointer);
        diags.push(crate::metadata::with_metadata(LintDiagnostic::error(
            "E101",
            1,
            path,
            err.to_string(),
        )));
    }

    // ── Per-node validation ──────────────────────────────────────
    if let Some(tree) = doc.get("tree") {
        walk_and_validate(tree, "/tree", node_validators, &mut diags);
    }
    if let Some(comps) = doc.get("components").and_then(Value::as_object) {
        for (name, comp_def) in comps {
            if let Some(template_tree) = comp_def.get("tree") {
                let pointer = format!("/components/{name}/tree");
                walk_and_validate(template_tree, &pointer, node_validators, &mut diags);
            }
        }
    }

    diags
}

/// Recursively walk a component tree and validate each node against its
/// type-specific validator (built-in) or the CustomComponentRef validator (fallback).
fn walk_and_validate(
    node: &Value,
    pointer: &str,
    node_validators: &ComponentNodeValidators,
    diags: &mut Vec<LintDiagnostic>,
) {
    let child_seg = |parent: &str, i: usize| format!("{parent}/children/{i}");
    visit_component_subtree(node, pointer, &child_seg, &mut |n, p| {
        let Some(obj) = n.as_object() else {
            return;
        };
        let Some(component) = obj.get("component").and_then(Value::as_str) else {
            return;
        };

        let validator = node_validators
            .per_type
            .get(component)
            .unwrap_or(&node_validators.custom_ref);

        for err in validator.iter_errors(n) {
            let err_pointer = err.instance_path().as_str();
            let full_pointer = if err_pointer.is_empty() {
                p.to_string()
            } else {
                format!("{p}{err_pointer}")
            };
            let path = json_pointer_to_jsonpath(&full_pointer);
            diags.push(crate::metadata::with_metadata(LintDiagnostic::error(
                "E101",
                1,
                path,
                err.to_string(),
            )));
        }
    });
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;
    use crate::LintSeverity;
    use serde_json::json;

    #[test]
    fn detects_invalid_enum_value() {
        let def = json!({
            "$formspec": "1.0",
            "url": "https://example.com/forms/x",
            "version": "1.0.0",
            "status": "draft",
            "title": "X",
            "items": [{"key": "f1", "type": "field", "label": "F1", "dataType": "blob"}]
        });
        let diags = validate_schema(&def, DocumentType::Definition);
        assert!(
            diags.iter().any(|d| d.code == "E101"),
            "Should emit E101 for invalid dataType, got: {:?}",
            diags
                .iter()
                .map(|d| (&d.code, &d.path, &d.message))
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn valid_definition_produces_no_e101() {
        let def = json!({
            "$formspec": "1.0",
            "url": "https://example.com/forms/x",
            "version": "1.0.0",
            "status": "draft",
            "title": "X",
            "items": [{"key": "f1", "type": "field", "label": "F1", "dataType": "string"}]
        });
        let diags = validate_schema(&def, DocumentType::Definition);
        assert!(
            diags.is_empty(),
            "Valid definition should produce no E101, got: {:?}",
            diags
                .iter()
                .map(|d| (&d.code, &d.path, &d.message))
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn form_presentation_showprogress_valid() {
        let def = json!({
            "$formspec": "1.0",
            "url": "https://example.com/forms/x",
            "version": "1.0.0",
            "status": "draft",
            "title": "X",
            "items": [{"key": "f1", "type": "field", "label": "F1", "dataType": "string"}],
            "formPresentation": {
                "pageMode": "wizard",
                "showProgress": true,
                "allowSkip": false,
                "defaultTab": 0,
                "tabPosition": "top"
            }
        });
        let diags = validate_schema(&def, DocumentType::Definition);
        assert!(
            diags.is_empty(),
            "formPresentation with wizard/tabs properties should produce no E101, got: {:?}",
            diags
                .iter()
                .map(|d| (&d.code, &d.path, &d.message))
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn e101_path_uses_jsonpath() {
        let def = json!({
            "$formspec": "1.0",
            "url": "https://example.com/forms/x",
            "version": "1.0.0",
            "status": "draft",
            "title": "X",
            "items": [{"key": "f1", "type": "field", "label": "F1", "dataType": "blob"}]
        });
        let diags = validate_schema(&def, DocumentType::Definition);
        // All paths should start with "$"
        for d in &diags {
            assert!(
                d.path.starts_with('$'),
                "Path should be JSONPath: {}",
                d.path
            );
        }
    }

    #[test]
    fn fel_functions_returns_empty() {
        let doc = json!({"version": "1.0", "functions": []});
        let diags = validate_schema(&doc, DocumentType::FelFunctions);
        assert!(diags.is_empty());
    }

    #[test]
    fn detects_missing_required_field() {
        // Missing "title" which is required
        let def = json!({
            "$formspec": "1.0",
            "url": "https://example.com/forms/x",
            "version": "1.0.0",
            "status": "draft",
            "items": [{"key": "f1", "type": "field", "label": "F1", "dataType": "string"}]
        });
        let diags = validate_schema(&def, DocumentType::Definition);
        assert!(
            diags
                .iter()
                .any(|d| d.code == "E101" && d.message.contains("title")),
            "Should report missing 'title', got: {:?}",
            diags
                .iter()
                .map(|d| (&d.code, &d.message))
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn valid_theme_produces_no_e101() {
        let theme = json!({
            "$formspecTheme": "1.0",
            "version": "1.0.0",
            "targetDefinition": { "url": "https://example.com/forms/x" }
        });
        let diags = validate_schema(&theme, DocumentType::Theme);
        assert!(
            diags.is_empty(),
            "Valid theme should produce no E101, got: {:?}",
            diags
                .iter()
                .map(|d| (&d.code, &d.message))
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn valid_component_produces_no_e101() {
        let comp = json!({
            "$formspecComponent": "1.0",
            "version": "1.0.0",
            "targetDefinition": { "url": "https://example.com/forms/x" },
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "TextInput", "bind": "name" }
                ]
            }
        });
        let diags = validate_schema(&comp, DocumentType::Component);
        assert!(
            diags.is_empty(),
            "Valid component should produce no E101, got: {:?}",
            diags
                .iter()
                .map(|d| (&d.code, &d.message))
                .collect::<Vec<_>>()
        );
    }

    fn valid_public_intake_handoff() -> Value {
        json!({
            "$formspecIntakeHandoff": "1.0",
            "handoffId": "handoff-public-2026-0001",
            "initiationMode": "publicIntake",
            "definitionRef": {
                "url": "https://example.gov/forms/benefits-intake",
                "version": "1.0.0"
            },
            "responseRef": "urn:formspec:response:resp-2026-0001",
            "responseHash": "sha256:0123456789abcdef",
            "validationReportRef": "urn:formspec:validation-report:vr-2026-0001",
            "intakeSessionId": "session-2026-0001",
            "ledgerHeadRef": "urn:formspec:respondent-ledger-event:evt-2026-0003",
            "occurredAt": "2026-04-22T17:15:00Z"
        })
    }

    #[test]
    fn valid_intake_handoff_produces_no_e101() {
        let diags = validate_schema(&valid_public_intake_handoff(), DocumentType::IntakeHandoff);
        assert!(
            diags.is_empty(),
            "Valid intake handoff should produce no E101, got: {:?}",
            diags
                .iter()
                .map(|d| (&d.code, &d.path, &d.message))
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn public_intake_handoff_rejects_existing_case_ref() {
        let mut handoff = valid_public_intake_handoff();
        handoff
            .as_object_mut()
            .unwrap()
            .insert("caseRef".to_string(), json!("urn:wos:case:case-2026-0042"));

        let diags = validate_schema(&handoff, DocumentType::IntakeHandoff);
        assert!(
            diags.iter().any(|d| d.code == "E101"),
            "Public intake with a caseRef should produce E101, got: {:?}",
            diags
                .iter()
                .map(|d| (&d.code, &d.path, &d.message))
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn workflow_intake_handoff_requires_case_ref() {
        let mut handoff = valid_public_intake_handoff();
        handoff
            .as_object_mut()
            .unwrap()
            .insert("initiationMode".to_string(), json!("workflowInitiated"));

        let diags = validate_schema(&handoff, DocumentType::IntakeHandoff);
        assert!(
            diags.iter().any(|d| d.code == "E101"),
            "Workflow-initiated intake without caseRef should produce E101, got: {:?}",
            diags
                .iter()
                .map(|d| (&d.code, &d.path, &d.message))
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn all_diagnostics_are_pass_1_e101() {
        let def = json!({
            "$formspec": "1.0",
            "items": []
        });
        let diags = validate_schema(&def, DocumentType::Definition);
        for d in &diags {
            assert_eq!(d.code, "E101");
            assert_eq!(d.pass, 1);
            assert_eq!(d.severity, LintSeverity::Error);
        }
    }

    #[test]
    fn component_deep_tree_validates_in_linear_time() {
        // Build a 50-level deep component tree — would hang with oneOf backtracking.
        fn nest(depth: u32) -> Value {
            if depth == 0 {
                return json!({"component": "TextInput", "bind": "leaf"});
            }
            json!({
                "component": "Stack",
                "children": [nest(depth - 1)]
            })
        }
        let comp = json!({
            "$formspecComponent": "1.0",
            "version": "1.0.0",
            "targetDefinition": { "url": "https://example.com/forms/x" },
            "tree": nest(50)
        });
        let diags = validate_schema(&comp, DocumentType::Component);
        assert!(
            diags.is_empty(),
            "Deep valid tree should produce no E101, got: {:?}",
            diags
                .iter()
                .map(|d| (&d.code, &d.path, &d.message))
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn component_per_node_catches_invalid_property() {
        let comp = json!({
            "$formspecComponent": "1.0",
            "version": "1.0.0",
            "targetDefinition": { "url": "https://example.com/forms/x" },
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "TextInput", "bind": "name", "direction": "vertical" }
                ]
            }
        });
        let diags = validate_schema(&comp, DocumentType::Component);
        // "direction" is not a valid TextInput property — unevaluatedProperties: false should catch it
        assert!(
            diags
                .iter()
                .any(|d| d.code == "E101" && d.path.contains("children[0]")),
            "Should emit E101 for invalid TextInput property, got: {:?}",
            diags
                .iter()
                .map(|d| (&d.code, &d.path, &d.message))
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn component_envelope_catches_missing_version() {
        let comp = json!({
            "$formspecComponent": "1.0",
            "targetDefinition": { "url": "https://example.com/forms/x" },
            "tree": { "component": "Stack" }
        });
        let diags = validate_schema(&comp, DocumentType::Component);
        assert!(
            diags
                .iter()
                .any(|d| d.code == "E101" && d.message.contains("version")),
            "Should report missing 'version', got: {:?}",
            diags
                .iter()
                .map(|d| (&d.code, &d.message))
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn custom_component_ref_valid_no_e101() {
        let comp = json!({
            "$formspecComponent": "1.0",
            "version": "1.0.0",
            "targetDefinition": { "url": "https://example.com/forms/x" },
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "AddressBlock", "params": { "prefix": "home" } }
                ]
            }
        });
        let diags = validate_schema(&comp, DocumentType::Component);
        assert!(
            diags.is_empty(),
            "Valid custom component ref should produce no E101, got: {:?}",
            diags
                .iter()
                .map(|d| (&d.code, &d.path, &d.message))
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn custom_component_ref_rejects_invalid_property() {
        let comp = json!({
            "$formspecComponent": "1.0",
            "version": "1.0.0",
            "targetDefinition": { "url": "https://example.com/forms/x" },
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "AddressBlock", "bogusField": 42 }
                ]
            }
        });
        let diags = validate_schema(&comp, DocumentType::Component);
        assert!(
            diags
                .iter()
                .any(|d| d.code == "E101" && d.path.contains("children[0]")),
            "Should emit E101 for invalid custom component ref property, got: {:?}",
            diags
                .iter()
                .map(|d| (&d.code, &d.path, &d.message))
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn custom_component_template_tree_validated() {
        let comp = json!({
            "$formspecComponent": "1.0",
            "version": "1.0.0",
            "targetDefinition": { "url": "https://example.com/forms/x" },
            "components": {
                "AddressBlock": {
                    "params": ["prefix"],
                    "tree": {
                        "component": "Stack",
                        "children": [
                            { "component": "TextInput", "bind": "street", "direction": "vertical" }
                        ]
                    }
                }
            },
            "tree": { "component": "Stack" }
        });
        let diags = validate_schema(&comp, DocumentType::Component);
        assert!(
            diags.iter().any(|d| d.code == "E101"
                && d.path.contains("components")
                && d.path.contains("children[0]")),
            "Should catch invalid property in custom component template tree, got: {:?}",
            diags
                .iter()
                .map(|d| (&d.code, &d.path, &d.message))
                .collect::<Vec<_>>()
        );
    }
}

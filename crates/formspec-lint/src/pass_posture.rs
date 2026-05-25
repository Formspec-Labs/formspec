//! Pass 3e: Posture admission (E608 / E609) — ADR 0150 §4.4/§5.4.
//!
//! Cross-document join between a posture-declaration document and a consuming
//! artifact. Emits nothing when `posture_declaration` is absent. Matcher
//! semantics live in [`crate::posture_admission`] and mirror the TS oracle in
//! `packages/formspec-app-graph/src/posture-admission.ts`.

use serde_json::Value;

use crate::metadata;
use crate::posture_admission::{
    allowed_actors_from_posture, allowed_modules_from_posture, evaluate_actor_posture_admission,
    evaluate_module_posture_admission, module_ref_fields_from_value, ModulePostureAdmissionFailure,
};
use crate::types::LintDiagnostic;

pub(crate) const PASS: u8 = 3;

/// Run posture module + actor admission checks against `doc`.
pub fn check_posture_admission(
    doc: &Value,
    posture_declaration: Option<&Value>,
) -> Vec<LintDiagnostic> {
    let Some(posture) = posture_declaration else {
        return Vec::new();
    };

    let mut diagnostics = Vec::new();
    let allowed_modules = allowed_modules_from_posture(posture);
    if !allowed_modules.is_empty() {
        if let Some(modules) = doc.get("modules").and_then(Value::as_array) {
            for (index, module) in modules.iter().enumerate() {
                let Some(doc_fields) = module_ref_fields_from_value(module) else {
                    continue;
                };
                let path = format!("$.modules[{index}]");
                match evaluate_module_posture_admission(&doc_fields, &allowed_modules) {
                    Ok(()) => {}
                    Err(ModulePostureAdmissionFailure::NotListed) => {
                        diagnostics.push(emit_e608(
                            &path,
                            format!(
                                "Module '{}' is not admitted by posture.allowedModules[]",
                                doc_fields.id
                            ),
                        ));
                    }
                    Err(ModulePostureAdmissionFailure::FieldMismatch(field)) => {
                        diagnostics.push(emit_e608(
                            &path,
                            format!(
                                "Module '{}' fails posture field-equality on '{field}' \
                                 (ADR 0150 §4.4)",
                                doc_fields.id
                            ),
                        ));
                    }
                }
            }
        }
    }

    let allowed_actors = allowed_actors_from_posture(posture);
    if !allowed_actors.is_empty() {
        for (path, actor_urn) in collect_author_actor_urns(doc) {
            if !evaluate_actor_posture_admission(&actor_urn, &allowed_actors) {
                diagnostics.push(emit_e609(
                    &path,
                    format!(
                        "Authoring actor '{actor_urn}' is not admitted by posture.allowedActors[]"
                    ),
                ));
            }
        }
    }

    diagnostics
}

fn emit_e608(path: &str, message: String) -> LintDiagnostic {
    metadata::with_metadata(LintDiagnostic::error(
        crate::LintCode::E608,
        PASS,
        path,
        message,
    ))
}

fn emit_e609(path: &str, message: String) -> LintDiagnostic {
    metadata::with_metadata(LintDiagnostic::error(
        crate::LintCode::E609,
        PASS,
        path,
        message,
    ))
}

fn collect_author_actor_urns(doc: &Value) -> Vec<(String, String)> {
    let mut out = Vec::new();
    walk_author_actor_urns(doc, "$", &mut out);
    out
}

fn walk_author_actor_urns(value: &Value, path: &str, out: &mut Vec<(String, String)>) {
    match value {
        Value::Object(map) => {
            if let Some(generated_by) = map.get("generatedBy") {
                if let Some(urn) = author_actor_urn_from_value(generated_by) {
                    out.push((format!("{path}.generatedBy"), urn));
                }
            }
            if map.contains_key("eventType")
                && let Some(actor) = map.get("actor")
                && let Some(urn) = author_actor_urn_from_value(actor)
            {
                out.push((format!("{path}.actor"), urn));
            }
            for (key, child) in map {
                let child_path = if path == "$" {
                    format!("$.{key}")
                } else {
                    format!("{path}.{key}")
                };
                walk_author_actor_urns(child, &child_path, out);
            }
        }
        Value::Array(items) => {
            for (index, child) in items.iter().enumerate() {
                walk_author_actor_urns(child, &format!("{path}[{index}]"), out);
            }
        }
        _ => {}
    }
}

fn author_actor_urn_from_value(value: &Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        return actor_urn(text);
    }
    value.get("id").and_then(Value::as_str).and_then(actor_urn)
}

fn actor_urn(value: &str) -> Option<String> {
    if value.starts_with("urn:formspec:actor:") {
        Some(value.to_string())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]

    use super::*;
    use serde_json::json;

    #[test]
    fn e608_emits_on_lock_hash_mismatch() {
        let posture = json!({
            "$postureDeclaration": "1.0",
            "url": "https://example.com/posture",
            "version": "1.0.0",
            "signaturePolicy": {
                "allowedMethods": ["urn:formspec:sig-method:ed25519-cose-sign1@1"],
                "minimumPrimitiveVerification": "verified",
                "receiptSigningRequired": false
            },
            "allowedModules": [{
                "id": "x-formspec-presentation",
                "version": "0.1.0",
                "lockHash": "sha256:expected"
            }]
        });
        let doc = json!({
            "$formspecExperience": "1.0",
            "version": "1.0.0",
            "targetDefinition": { "url": "https://example.com/forms/e608" },
            "modules": [{
                "id": "x-formspec-presentation",
                "version": "0.1.0",
                "lockHash": "sha256:actual"
            }],
            "units": [],
            "tasks": []
        });
        let diags = check_posture_admission(&doc, Some(&posture));
        assert_eq!(diags.len(), 1);
        assert_eq!(diags[0].code, crate::LintCode::E608);
    }

    #[test]
    fn e609_emits_on_unlisted_actor() {
        let posture = json!({
            "$postureDeclaration": "1.0",
            "url": "https://example.com/posture",
            "version": "1.0.0",
            "signaturePolicy": {
                "allowedMethods": ["urn:formspec:sig-method:ed25519-cose-sign1@1"],
                "minimumPrimitiveVerification": "verified",
                "receiptSigningRequired": false
            },
            "allowedActors": ["urn:formspec:actor:human:editor"]
        });
        let doc = json!({
            "$formspecComponent": "1.0",
            "version": "1.0.0",
            "targetDefinition": { "url": "https://example.com/forms/e609" },
            "tree": {
                "component": "Stack",
                "children": [{
                    "component": "TextInput",
                    "bind": "name",
                    "x-generation": {
                        "generatedBy": "urn:formspec:actor:ai-agent:wireframes"
                    }
                }]
            }
        });
        let diags = check_posture_admission(&doc, Some(&posture));
        assert_eq!(diags.len(), 1);
        assert_eq!(diags[0].code, crate::LintCode::E609);
    }
}

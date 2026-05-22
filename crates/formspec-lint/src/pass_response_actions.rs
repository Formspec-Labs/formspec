//! Pass 9: Response Actions semantic checks.
#![allow(clippy::missing_docs_in_private_items)]

use std::collections::{HashMap, HashSet};

use formspec_core::visit_component_subtree;
use serde_json::Value;

use crate::semantic_helpers::{
    compatible_version_satisfied, definition_url, definition_version, error, json_path_member,
    target_definition_compatible_versions, target_definition_url, warning,
};
use crate::types::LintDiagnostic;

pub(crate) const PASS: u8 = 9;

pub(crate) fn lint_response_actions(
    doc: &Value,
    definition: Option<&Value>,
    component_documents: &[Value],
) -> Vec<LintDiagnostic> {
    let mut analyzer = Analyzer {
        doc,
        definition,
        component_documents,
        action_ids: collect_action_ids(doc),
        diagnostics: Vec::new(),
    };
    analyzer.check_target_definition();
    analyzer.check_duplicate_action_ids();
    analyzer.check_invalid_validation_overrides();
    analyzer.check_component_action_refs();
    analyzer.diagnostics
}

/// VM §6.3 permitted-tuple predicate.
///
/// Returns `Some(rationale)` when the (profile, blocking, persistence) tuple
/// fails one of the four VM §6.2 prohibitions. Returns `None` when the tuple
/// is permitted OR when an axis is missing (schema validation owns shape
/// errors; this predicate only judges fully-shaped tuples).
fn vmap_override_violation(
    profile: Option<&str>,
    blocking: Option<&str>,
    persistence: Option<&str>,
) -> Option<&'static str> {
    let (profile, blocking, persistence) = (profile?, blocking?, persistence?);
    if persistence == "complete-response" && blocking != "block-on-error" {
        return Some(
            "complete-response persistence requires block-on-error blocking \
             (VM §6.2 #2 — would let error-severity findings reach completed)",
        );
    }
    if persistence == "complete-response" && profile != "on-submit" {
        return Some(
            "complete-response persistence requires on-submit profile \
             (VM §6.2 #3 — partial report could allow completion)",
        );
    }
    if blocking == "block-on-error" && persistence != "complete-response" {
        return Some(
            "block-on-error blocking requires complete-response persistence \
             (VM §6.2 #5 — blocked draft checkpoints violate VE-05)",
        );
    }
    if profile == "off" && blocking == "block-on-error" {
        return Some(
            "off profile with block-on-error blocking is forbidden \
             (VM §6.2 #4 — no report under off, nothing to block on)",
        );
    }
    None
}

struct Analyzer<'a> {
    doc: &'a Value,
    definition: Option<&'a Value>,
    component_documents: &'a [Value],
    action_ids: HashSet<String>,
    diagnostics: Vec<LintDiagnostic>,
}

impl Analyzer<'_> {
    fn check_target_definition(&mut self) {
        let Some(definition) = self.definition else {
            return;
        };
        if let (Some(target_url), Some(def_url)) =
            (target_definition_url(self.doc), definition_url(definition))
            && target_url != def_url
        {
            self.diagnostics.push(error(
                crate::LintCode::E1800,
                PASS,
                "$.targetDefinition.url",
                format!(
                    "Response Actions targetDefinition.url ({target_url:?}) does not match paired Definition url ({def_url:?})"
                ),
            ));
        }
        if let (Some(range), Some(version)) = (
            target_definition_compatible_versions(self.doc),
            definition_version(definition),
        ) && compatible_version_satisfied(range, version) != Some(true)
        {
            self.diagnostics.push(warning(
                crate::LintCode::W1800,
                PASS,
                "$.targetDefinition.compatibleVersions",
                format!(
                    "Response Actions compatibleVersions ({range:?}) does not confidently include paired Definition version ({version:?})"
                ),
            ));
        }
    }

    fn check_duplicate_action_ids(&mut self) {
        let Some(actions) = self.doc.get("actions").and_then(Value::as_array) else {
            return;
        };
        let mut first_paths = HashMap::<String, String>::new();
        for (index, action) in actions.iter().enumerate() {
            let Some(id) = action.get("id").and_then(Value::as_str) else {
                continue;
            };
            let path = format!("$.actions[{index}].id");
            if let Some(first_path) = first_paths.get(id) {
                self.diagnostics.push(error(
                    crate::LintCode::E1801,
                    PASS,
                    path,
                    format!(
                        "Response Actions action id {id:?} duplicates an earlier action at {first_path}"
                    ),
                ));
            } else {
                first_paths.insert(id.to_string(), path);
            }
        }
    }

    fn check_invalid_validation_overrides(&mut self) {
        let Some(actions) = self.doc.get("actions").and_then(Value::as_array) else {
            return;
        };
        for (index, action) in actions.iter().enumerate() {
            let Some(validation) = action.get("validation").and_then(Value::as_object) else {
                continue;
            };
            let profile = validation.get("profile").and_then(Value::as_str);
            let blocking = validation.get("blocking").and_then(Value::as_str);
            let persistence = validation.get("persistence").and_then(Value::as_str);
            if let Some(rationale) = vmap_override_violation(profile, blocking, persistence) {
                let id = action
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or("<unknown>");
                self.diagnostics.push(error(
                    crate::LintCode::E1803,
                    PASS,
                    format!("$.actions[{index}].validation"),
                    format!(
                        "VMAP-INVALID-OVERRIDE: Action {id:?} validation override \
                         (profile={profile:?}, blocking={blocking:?}, persistence={persistence:?}) \
                         violates the VM §6.3 permitted-tuple predicate: {rationale}"
                    ),
                ));
            }
        }
    }

    fn check_component_action_refs(&mut self) {
        if self.component_documents.is_empty() {
            return;
        }
        for (doc_index, component_doc) in self.component_documents.iter().enumerate() {
            if let Some(tree) = component_doc.get("tree") {
                self.check_component_tree(tree, &format!("$.componentDocuments[{doc_index}].tree"));
            }
            if let Some(components) = component_doc.get("components").and_then(Value::as_object) {
                for (name, component) in components {
                    if let Some(tree) = component.get("tree") {
                        let base = json_path_member(
                            &format!("$.componentDocuments[{doc_index}].components"),
                            name,
                        );
                        self.check_component_tree(tree, &format!("{base}.tree"));
                    }
                }
            }
        }
    }

    fn check_component_tree(&mut self, tree: &Value, base_path: &str) {
        let child_seg = |parent: &str, index: usize| format!("{parent}.children[{index}]");
        visit_component_subtree(tree, base_path, &child_seg, &mut |node, path| {
            if node.get("component").and_then(Value::as_str) != Some("ActionButton") {
                return;
            }
            let Some(action_ref) = node.get("actionRef").and_then(Value::as_str) else {
                return;
            };
            if !self.action_ids.contains(action_ref) {
                self.diagnostics.push(error(
                    crate::LintCode::E1802,
                    PASS,
                    format!("{path}.actionRef"),
                    format!(
                        "ActionButton actionRef {action_ref:?} does not resolve to any Response Actions actions[].id"
                    ),
                ));
            }
        });
    }
}

fn collect_action_ids(doc: &Value) -> HashSet<String> {
    doc.get("actions")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|action| action.get("id").and_then(Value::as_str))
        .map(ToOwned::to_owned)
        .collect()
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::lint_response_actions;

    fn response_actions() -> serde_json::Value {
        json!({
            "$formspecResponseActions": "1.0",
            "version": "1.0.0",
            "targetDefinition": {
                "url": "https://example.gov/forms/intake",
                "compatibleVersions": ">=1.0.0 <2.0.0"
            },
            "actions": [
                {
                    "id": "send-application",
                    "intent": "submit",
                    "effects": [
                        { "type": "hostEvent", "eventName": "formspec-submit" }
                    ]
                }
            ]
        })
    }

    fn definition() -> serde_json::Value {
        json!({
            "$formspec": "1.0",
            "url": "https://example.gov/forms/intake",
            "version": "1.2.0",
            "title": "Intake",
            "items": []
        })
    }

    #[test]
    fn matching_definition_and_component_refs_produce_no_diagnostics() {
        let component = json!({
            "$formspecComponent": "1.0",
            "version": "1.0.0",
            "targetDefinition": { "url": "https://example.gov/forms/intake" },
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "ActionButton", "actionRef": "send-application" }
                ]
            }
        });

        let diags = lint_response_actions(&response_actions(), Some(&definition()), &[component]);

        assert!(diags.is_empty(), "{diags:#?}");
    }

    #[test]
    fn target_definition_mismatch_emits_e1800() {
        let def = json!({
            "$formspec": "1.0",
            "url": "https://example.gov/forms/other",
            "version": "1.2.0",
            "title": "Other",
            "items": []
        });

        let diags = lint_response_actions(&response_actions(), Some(&def), &[]);

        assert!(diags.iter().any(|diag| diag.code == crate::LintCode::E1800));
    }

    #[test]
    fn compatible_versions_mismatch_emits_w1800() {
        let def = json!({
            "$formspec": "1.0",
            "url": "https://example.gov/forms/intake",
            "version": "2.0.0",
            "title": "Intake",
            "items": []
        });

        let diags = lint_response_actions(&response_actions(), Some(&def), &[]);

        assert!(diags.iter().any(|diag| diag.code == crate::LintCode::W1800));
    }

    #[test]
    fn duplicate_action_ids_emit_e1801() {
        let mut actions = response_actions();
        actions["actions"].as_array_mut().unwrap().push(json!({
            "id": "send-application",
            "intent": "save-draft",
            "effects": [
                { "type": "hostEvent", "eventName": "formspec-submit" }
            ]
        }));

        let diags = lint_response_actions(&actions, None, &[]);

        assert!(diags.iter().any(|diag| diag.code == crate::LintCode::E1801));
    }

    #[test]
    fn unresolved_component_action_ref_emits_e1802_at_error_severity() {
        // Component spec §5.19 Resolver Invariants mandate error severity for
        // unresolved actionRef. A warning would let broken docs sneak past
        // `lint --deny error` gates, defeating the trust contract that the
        // ActionButton resolver never silently degrades.
        let component = json!({
            "$formspecComponent": "1.0",
            "version": "1.0.0",
            "targetDefinition": { "url": "https://example.gov/forms/intake" },
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "ActionButton", "actionRef": "missing-action" }
                ]
            }
        });

        let diags = lint_response_actions(&response_actions(), None, &[component]);

        let actionref_diag = diags
            .iter()
            .find(|diag| diag.code == crate::LintCode::E1802)
            .expect("E1802 not emitted");
        assert_eq!(
            actionref_diag.severity,
            crate::types::LintSeverity::Error,
            "E1802 MUST be error severity per Component §5.19 Resolver Invariants"
        );
    }

    #[test]
    fn invalid_validation_override_emits_e1803_vmap_invalid_override() {
        // VM §6.2 prohibition #5: block-on-error with non-complete-response
        // persistence creates an incoherent blocked-draft state. Processors
        // MUST reject with VMAP-INVALID-OVERRIDE per §8.1.2.
        let mut doc = response_actions();
        doc["actions"][0]["validation"] = json!({
            "profile": "live",
            "blocking": "block-on-error",
            "persistence": "draft-checkpoint"
        });

        let diags = lint_response_actions(&doc, None, &[]);

        let vmap_diag = diags
            .iter()
            .find(|d| d.code == crate::LintCode::E1803)
            .expect("E1803 not emitted for VMAP-INVALID-OVERRIDE tuple");
        assert_eq!(vmap_diag.severity, crate::types::LintSeverity::Error);
        assert!(
            vmap_diag.message.contains("VMAP-INVALID-OVERRIDE"),
            "diagnostic message must carry the spec-mandated VMAP-INVALID-OVERRIDE string \
             code so TS runtime + Rust lint emit the same surface: {:?}",
            vmap_diag.message
        );
    }

    #[test]
    fn valid_master_table_override_emits_no_e1803() {
        // The submit master-table row is a permitted tuple. An override that
        // restates it MUST NOT trip the predicate.
        let mut doc = response_actions();
        doc["actions"][0]["validation"] = json!({
            "profile": "on-submit",
            "blocking": "block-on-error",
            "persistence": "complete-response"
        });

        let diags = lint_response_actions(&doc, None, &[]);

        assert!(
            !diags.iter().any(|d| d.code == crate::LintCode::E1803),
            "permitted-tuple override must not emit E1803: {diags:#?}"
        );
    }
}

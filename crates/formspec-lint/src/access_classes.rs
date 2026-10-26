// Rust guideline compliant 2026-02-21
//! Pass 3b (E613): `accessControl.class` resolution against the Access-Class Registry.
//!
//! A class resolves when it is a core token (`unclassified`, `protected`) or when a
//! loaded registry document declares it through an `access-class` entry's
//! `classShape.token` (extension-registry.md §3.2.3). Schema validation (E101) already
//! refuses values outside the core tokens and registered prefixes; this pass catches
//! the remaining gap, a well-formed `<prefix>.<name>` token that no loaded registry
//! declares, and restates any schema-refused class with a registry-specific message.

use std::collections::HashSet;

use serde_json::Value;

use formspec_core::{
    extension_item_diagnostic_path_from_dotted, visit_definition_items_from_document,
};

use crate::types::LintDiagnostic;

/// Lint pass number shared with extension resolution (E600-E602).
const PASS: u8 = 3;

/// Core Access-Class Registry tokens; mirrors `common.schema.json` `$defs/AccessClass`.
const CORE_ACCESS_CLASSES: [&str; 2] = ["unclassified", "protected"];

/// Collects `classShape.token` values from `access-class` entries in loaded registries.
fn registry_access_classes(registry_documents: &[Value]) -> HashSet<&str> {
    registry_documents
        .iter()
        .filter_map(|doc| doc.get("entries").and_then(Value::as_array))
        .flatten()
        .filter(|entry| entry.get("category").and_then(Value::as_str) == Some("access-class"))
        .filter_map(|entry| entry.pointer("/classShape/token").and_then(Value::as_str))
        .collect()
}

/// Reports every item `accessControl.class` that resolves no core or registry token.
///
/// Returns one **E613** error per unresolved class, located at
/// `$.items[key=…].accessControl.class`. Items without `accessControl`, or with a
/// non-string class (a schema error already), produce nothing.
pub fn check_access_classes(document: &Value, registry_documents: &[Value]) -> Vec<LintDiagnostic> {
    let declared = registry_access_classes(registry_documents);
    let mut diagnostics = Vec::new();
    visit_definition_items_from_document(document, &mut |ctx| {
        let Some(class) = ctx
            .item
            .pointer("/accessControl/class")
            .and_then(Value::as_str)
        else {
            return;
        };
        if CORE_ACCESS_CLASSES.contains(&class) || declared.contains(class) {
            return;
        }
        let path = extension_item_diagnostic_path_from_dotted(&ctx.dotted_path);
        diagnostics.push(crate::metadata::with_metadata(LintDiagnostic::error(
            crate::LintCode::E613,
            PASS,
            format!("{path}.accessControl.class"),
            format!(
                "Access class '{class}' is not a core token and no loaded registry declares it"
            ),
        )));
    });
    diagnostics
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;
    use serde_json::json;

    fn definition(class: &str) -> Value {
        json!({
            "$formspec": "1.0",
            "items": [{
                "key": "home",
                "type": "group",
                "children": [{ "key": "street", "type": "field", "accessControl": { "class": class } }]
            }]
        })
    }

    fn registry_declaring(token: &str) -> Value {
        json!({ "entries": [{
            "name": "x-acme-access-class",
            "category": "access-class",
            "status": "stable",
            "classShape": { "token": token }
        }] })
    }

    #[test]
    fn core_tokens_resolve_without_registries() {
        for class in CORE_ACCESS_CLASSES {
            assert!(
                check_access_classes(&definition(class), &[]).is_empty(),
                "{class}"
            );
        }
    }

    #[test]
    fn undeclared_prefixed_token_emits_e613() {
        let diags = check_access_classes(
            &definition("cui.privacy"),
            &[registry_declaring("cui.other")],
        );
        assert_eq!(diags.len(), 1);
        assert_eq!(diags[0].code, "E613");
        assert_eq!(diags[0].severity, crate::types::LintSeverity::Error);
        assert_eq!(
            diags[0].path,
            "$.items[key=home].street.accessControl.class"
        );
        assert!(diags[0].message.contains("cui.privacy"));
    }

    #[test]
    fn registry_declared_prefixed_token_resolves() {
        assert!(
            check_access_classes(
                &definition("cui.privacy"),
                &[registry_declaring("cui.privacy")]
            )
            .is_empty()
        );
    }

    #[test]
    fn unknown_dot_free_token_emits_e613() {
        let diags = check_access_classes(&definition("safe-address"), &[]);
        assert_eq!(diags.len(), 1);
        assert_eq!(diags[0].code, "E613");
    }

    #[test]
    fn non_access_class_entries_do_not_declare_tokens() {
        let registry = json!({ "entries": [{
            "name": "x-acme", "category": "property", "classShape": { "token": "cui.privacy" }
        }] });
        assert_eq!(
            check_access_classes(&definition("cui.privacy"), &[registry]).len(),
            1
        );
    }

    #[test]
    fn core_tokens_mirror_common_schema() {
        let common: Value = serde_json::from_str(include_str!("../schemas/common.schema.json"))
            .expect("embedded common schema parses");
        let mirrored: Vec<&str> = common
            .pointer("/$defs/AccessClass/anyOf/0/enum")
            .and_then(Value::as_array)
            .expect("AccessClass core enum")
            .iter()
            .filter_map(Value::as_str)
            .collect();
        assert_eq!(mirrored, CORE_ACCESS_CLASSES);
    }
}

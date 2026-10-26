// Rust guideline compliant 2026-02-21
//! Pass 3b (E613): `accessControl.class` resolution against the Access-Class Registry.
//!
//! Schema validation (E101) refuses any class outside the core tokens and the
//! registered prefixes. This pass covers what the schema cannot see: a well-formed
//! `<prefix>.<name>` token under a registered prefix that no loaded registry declares
//! through a `draft` or `stable` `access-class` entry (extension-registry.md §3.2.3).
//! Schema-refused values are left to E101, so a value is never reported twice.

use std::collections::HashSet;

use serde_json::Value;

use formspec_core::{
    extension_item_diagnostic_path_from_dotted, visit_definition_items_from_document,
};

use crate::types::LintDiagnostic;

/// Lint pass number shared with extension resolution (E600-E602).
const PASS: u8 = 3;

/// Registered deployment prefixes; mirrors the `common.schema.json` `AccessClass` pattern.
const REGISTERED_PREFIXES: [&str; 2] = ["cui", "hipaa"];

/// Returns whether `segment` matches the token grammar `[a-z][a-z0-9]*(-[a-z0-9]+)*`.
fn is_token_segment(segment: &str) -> bool {
    let mut parts = segment.split('-');
    let head = parts.next().unwrap_or_default();
    let starts_with_letter = head.starts_with(|c: char| c.is_ascii_lowercase());
    let alnum = |part: &str| {
        !part.is_empty()
            && part
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
    };
    starts_with_letter && alnum(head) && parts.all(alnum)
}

/// Returns whether `class` is a schema-valid `<prefix>.<name>` deployment token.
fn is_prefixed_token(class: &str) -> bool {
    let mut segments = class.split('.');
    let prefix = segments.next().unwrap_or_default();
    let rest: Vec<&str> = segments.collect();
    REGISTERED_PREFIXES.contains(&prefix)
        && !rest.is_empty()
        && rest.iter().all(|segment| is_token_segment(segment))
}

/// Collects tokens declared by `draft` or `stable` `access-class` registry entries.
fn declared_access_classes(registry_documents: &[Value]) -> HashSet<&str> {
    registry_documents
        .iter()
        .filter_map(|doc| doc.get("entries").and_then(Value::as_array))
        .flatten()
        .filter(|entry| entry.get("category").and_then(Value::as_str) == Some("access-class"))
        .filter(|entry| {
            matches!(
                entry.get("status").and_then(Value::as_str),
                Some("draft" | "stable")
            )
        })
        .filter_map(|entry| entry.pointer("/classShape/token").and_then(Value::as_str))
        .collect()
}

/// Reports prefixed item classes that no loaded registry declares.
///
/// Returns one **E613** error per well-formed `<prefix>.<name>` class under a
/// registered prefix that no `draft` or `stable` `access-class` entry declares,
/// located at `$.items[key=…].accessControl.class`. Core tokens and
/// schema-refused values produce nothing here.
pub fn check_access_classes(document: &Value, registry_documents: &[Value]) -> Vec<LintDiagnostic> {
    let declared = declared_access_classes(registry_documents);
    let mut diagnostics = Vec::new();
    visit_definition_items_from_document(document, &mut |ctx| {
        let Some(class) = ctx
            .item
            .pointer("/accessControl/class")
            .and_then(Value::as_str)
        else {
            return;
        };
        if !is_prefixed_token(class) || declared.contains(class) {
            return;
        }
        let path = extension_item_diagnostic_path_from_dotted(&ctx.dotted_path);
        diagnostics.push(crate::metadata::with_metadata(LintDiagnostic::error(
            crate::LintCode::E613,
            PASS,
            format!("{path}.accessControl.class"),
            format!("Access class '{class}' is not declared by a draft or stable registry entry"),
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

    fn registry_declaring(token: &str, status: &str) -> Value {
        json!({ "entries": [{
            "name": "x-acme-access-class",
            "category": "access-class",
            "status": status,
            "classShape": { "token": token }
        }] })
    }

    #[test]
    fn undeclared_prefixed_token_emits_e613() {
        let diags = check_access_classes(
            &definition("cui.privacy"),
            &[registry_declaring("cui.other", "stable")],
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
    fn schema_refused_values_are_left_to_e101() {
        for class in [
            "safe-address",
            "wos.case",
            "cui",
            "cui.",
            "CUI.privacy",
            "cui.Bad",
        ] {
            assert!(
                check_access_classes(&definition(class), &[]).is_empty(),
                "{class}"
            );
        }
    }

    #[test]
    fn non_access_class_entries_do_not_declare_tokens() {
        let registry = json!({ "entries": [{
            "name": "x-acme", "category": "property", "status": "stable",
            "classShape": { "token": "cui.privacy" }
        }] });
        assert_eq!(
            check_access_classes(&definition("cui.privacy"), &[registry]).len(),
            1
        );
    }

    #[test]
    fn token_grammar_matches_the_schema_segment() {
        for ok in ["a", "law-enforcement", "sp2", "a1-b2"] {
            assert!(is_token_segment(ok), "{ok}");
        }
        for bad in ["", "1a", "A", "a-", "-a", "a--b", "a_b"] {
            assert!(!is_token_segment(bad), "{bad}");
        }
    }

    #[test]
    fn registered_prefixes_mirror_common_schema() {
        let common: Value = serde_json::from_str(include_str!("../schemas/common.schema.json"))
            .expect("embedded common schema parses");
        let pattern = common
            .pointer("/$defs/AccessClass/anyOf/1/pattern")
            .and_then(Value::as_str)
            .expect("AccessClass prefix pattern");
        let alternation = pattern
            .strip_prefix("^(")
            .and_then(|rest| rest.split_once(')'))
            .map(|(alternation, _)| alternation)
            .expect("pattern starts with a prefix alternation");
        assert_eq!(
            alternation.split('|').collect::<Vec<_>>(),
            REGISTERED_PREFIXES
        );
        assert!(
            pattern.ends_with(r"(\.[a-z][a-z0-9]*(-[a-z0-9]+)*)+$"),
            "segment grammar changed; update is_token_segment: {pattern}"
        );
    }
}

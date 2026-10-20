//! Check declared document references, locale identity, and available inline bytes.
//!
//! URL resolution remains a host responsibility. These checks never fetch a source
//! or treat a declaration as signing assent (Core §4.1.3).
// Rust guideline compliant 2026-02-21

use std::collections::HashSet;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use formspec_core::visit_definition_items_from_document;
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::semantic_helpers::error;
use crate::{LintCode, LintDiagnostic};

/// Core §4.1.3 bounds inline declarations; larger documents use host-resolved URLs.
const MAX_INLINE_BYTES: usize = 1024 * 1024;
/// Reject oversized encoded input before allocating a decoded byte buffer.
const MAX_ENCODED_BYTES: usize = MAX_INLINE_BYTES.div_ceil(3) * 4;

/// Validate Definition-local document scope and source bytes available in the declaration.
pub(crate) fn lint_documents(doc: &Value) -> Vec<LintDiagnostic> {
    let mut diagnostics = Vec::new();
    let documents = doc.get("documents").and_then(Value::as_object);
    if let Some(documents) = documents {
        for (id, declaration) in documents {
            let prefix = format!("$.documents[{id:?}]");
            let Some(variants) = declaration.get("variants").and_then(Value::as_object) else {
                continue;
            };
            let mut locales = HashSet::new();
            for (locale, variant) in variants {
                let variant_path = format!("{prefix}.variants[{locale:?}]");
                if !locales.insert(locale.to_ascii_lowercase()) {
                    diagnostics.push(error(
                        LintCode::E303,
                        3,
                        &variant_path,
                        "Document variants must not contain case-equivalent locale keys",
                    ));
                }
                check_inline_variant(variant, &variant_path, &mut diagnostics);
            }
            if let Some(default) = declaration.get("defaultLocale").and_then(Value::as_str) {
                if !locales.contains(&default.to_ascii_lowercase()) {
                    diagnostics.push(error(
                        LintCode::E303, 3, format!("{prefix}.defaultLocale"),
                        "Document defaultLocale must identify a declared variant (case-insensitive)",
                    ));
                }
            }
        }
    }
    visit_definition_items_from_document(doc, &mut |ctx| {
        let Some(attests) = ctx.item.get("attests").and_then(Value::as_array) else {
            return;
        };
        for (index, document_id) in attests.iter().enumerate() {
            let Some(id) = document_id.as_str() else {
                continue;
            };
            if documents.is_none_or(|entries| !entries.contains_key(id)) {
                diagnostics.push(error(
                    LintCode::E303,
                    3,
                    format!("{}.attests[{index}]", ctx.json_path),
                    "Field attests must reference a document declared in this pinned Definition",
                ));
            }
        }
    });
    diagnostics
}

/// Check canonical decoding, resource bounds, and the exact raw-byte digest.
fn check_inline_variant(variant: &Value, path: &str, diagnostics: &mut Vec<LintDiagnostic>) {
    let Some(source) = variant.get("source") else {
        return;
    };
    if source.get("kind").and_then(Value::as_str) != Some("inline") {
        return;
    }
    let Some(data) = source.get("data").and_then(Value::as_str) else {
        return;
    };
    let data_path = format!("{path}.source.data");
    if data.len() > MAX_ENCODED_BYTES {
        diagnostics.push(error(
            LintCode::E303,
            3,
            data_path,
            "Inline document exceeds the 1 MiB decoded-byte limit",
        ));
        return;
    }
    let bytes = match STANDARD.decode(data) {
        Ok(bytes) => bytes,
        Err(_) => {
            diagnostics.push(error(
                LintCode::E303,
                3,
                data_path,
                "Inline document requires canonical padded standard base64",
            ));
            return;
        }
    };
    if bytes.len() > MAX_INLINE_BYTES {
        diagnostics.push(error(
            LintCode::E303,
            3,
            data_path,
            "Inline document exceeds the 1 MiB decoded-byte limit",
        ));
        return;
    }
    if let Some(expected) = variant.get("documentHash").and_then(Value::as_str) {
        let actual = format!("{:x}", Sha256::digest(&bytes));
        if expected != actual {
            diagnostics.push(error(
                LintCode::E303,
                3,
                format!("{path}.documentHash"),
                "Document hash must equal SHA-256 of the exact decoded inline bytes",
            ));
        }
    }
}

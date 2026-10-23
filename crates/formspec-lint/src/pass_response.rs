//! Pass 8 — Response cross-field invariants and signature method validation.
//!
//! Validates the `authoredSignatures[*].signedPayload` pin triple against the
//! top-level Response pins, and validates signature method URIs against the
//! canonical signature-method registry. JSON Schema cannot encode the equality
//! constraint; Core spec §2.1.6 ("When `authoredSignatures` is present") lists
//! it MUST.
//!
//! Emits:
//! - E900: `signedPayload.responseId` != top-level `id`
//! - E901: `signedPayload.definitionUrl` != top-level `definitionUrl`
//! - E902: `signedPayload.definitionVersion` != top-level `definitionVersion`
//! - E905: Signature method URI not registered in signature-method-registry.json or deprecated (FORMSPEC-SIG-METHOD-REGISTERED-001)
//!
//! Parity target: Python `_pass_signed_payload_validation` in
//! `src/formspec/validate.py` (SIGNED_PAYLOAD_RESPONSE_ID_MISMATCH and
//! siblings). Diagnostic shapes differ — Rust emits per-pass codes; Python
//! emits SIGNED_PAYLOAD_* codes through `validate_all`. Both reject the same
//! fixtures with the same root cause.
#![allow(clippy::missing_docs_in_private_items)]

use std::collections::HashSet;
use std::sync::LazyLock;

use base64::Engine;
use serde::Deserialize;
use serde_json::Value;

use crate::metadata::with_metadata;
use crate::types::LintDiagnostic;

const SIGNATURE_METHOD_REGISTRY_JSON: &str =
    include_str!("../../../registries/signature-method-registry.json");

#[derive(Debug, Clone, Deserialize)]
struct RegistryEntry {
    id: String,
    #[serde(default)]
    status: String,
}

#[derive(Debug, Clone, Deserialize)]
struct RegistryDoc {
    #[serde(default)]
    entries: Vec<RegistryEntry>,
}

static REGISTERED_SIGNATURE_METHODS: LazyLock<HashSet<String>> = LazyLock::new(|| {
    let doc: RegistryDoc = serde_json::from_str(SIGNATURE_METHOD_REGISTRY_JSON)
        .expect("signature-method-registry.json must parse");
    doc.entries
        .into_iter()
        .filter(|entry| entry.status != "deprecated")
        .map(|entry| entry.id)
        .collect()
});

/// Returns `true` if `uri` is an active, registered signature method in the registry.
#[must_use]
pub fn is_registered_signature_method(uri: &str) -> bool {
    REGISTERED_SIGNATURE_METHODS.contains(uri)
}

/// Extracts a method URI string from CBOR-encoded COSE_Sign1 bytes by locating
/// label `-65540` (`[0x3a, 0x00, 0x01, 0x00, 0x03]`) in the protected header.
fn extract_method_uri_from_cose_bytes(bytes: &[u8]) -> Option<String> {
    const LABEL_BYTES: [u8; 5] = [0x3a, 0x00, 0x01, 0x00, 0x03];
    let pos = bytes.windows(LABEL_BYTES.len()).position(|w| w == LABEL_BYTES)?;
    let mut idx = pos + LABEL_BYTES.len();
    if idx >= bytes.len() {
        return None;
    }
    let header_byte = bytes[idx];
    idx += 1;
    let len = match header_byte {
        0x60..=0x77 => (header_byte - 0x60) as usize,
        0x78 => {
            if idx >= bytes.len() {
                return None;
            }
            let l = bytes[idx] as usize;
            idx += 1;
            l
        }
        0x79 => {
            if idx + 2 > bytes.len() {
                return None;
            }
            let l = u16::from_be_bytes([bytes[idx], bytes[idx + 1]]) as usize;
            idx += 2;
            l
        }
        0x7a => {
            if idx + 4 > bytes.len() {
                return None;
            }
            let l = u32::from_be_bytes([
                bytes[idx],
                bytes[idx + 1],
                bytes[idx + 2],
                bytes[idx + 3],
            ]) as usize;
            idx += 4;
            l
        }
        _ => return None,
    };
    if idx + len > bytes.len() {
        return None;
    }
    std::str::from_utf8(&bytes[idx..idx + len]).ok().map(String::from)
}

fn check_signature_method_registration(i: usize, sig: &Value, diags: &mut Vec<LintDiagnostic>) {
    let (declared_method, path) = if let Some(method_val) = sig.get("signatureMethod") {
        (
            Some(method_val.as_str().unwrap_or("").to_string()),
            format!("$.authoredSignatures[{i}].signatureMethod"),
        )
    } else if let Some(method_val) = sig.get("methodUri") {
        (
            Some(method_val.as_str().unwrap_or("").to_string()),
            format!("$.authoredSignatures[{i}].methodUri"),
        )
    } else if let Some(method_val) = sig.get("method") {
        (
            Some(method_val.as_str().unwrap_or("").to_string()),
            format!("$.authoredSignatures[{i}].method"),
        )
    } else if let Some(vr) = sig.get("verificationReceipt").and_then(Value::as_object) {
        if let Some(method_val) = vr.get("method") {
            (
                Some(method_val.as_str().unwrap_or("").to_string()),
                format!("$.authoredSignatures[{i}].verificationReceipt.method"),
            )
        } else {
            (None, format!("$.authoredSignatures[{i}].verificationReceipt"))
        }
    } else if let Some(sig_val) = sig.get("signatureValue").and_then(Value::as_str) {
        if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(sig_val.trim()) {
            if let Some(uri) = extract_method_uri_from_cose_bytes(&bytes) {
                (Some(uri), format!("$.authoredSignatures[{i}].signatureValue"))
            } else {
                (None, format!("$.authoredSignatures[{i}].signatureValue"))
            }
        } else {
            (None, format!("$.authoredSignatures[{i}].signatureValue"))
        }
    } else {
        (None, format!("$.authoredSignatures[{i}]"))
    };

    if let Some(uri) = declared_method
        && !is_registered_signature_method(&uri)
    {
        diags.push(with_metadata(LintDiagnostic::error(
            crate::LintCode::E905,
            8,
            path,
            format!(
                "authoredSignatures[{i}] signature method URI ({uri:?}) is not registered in signature-method-registry.json or is deprecated (FORMSPEC-SIG-METHOD-REGISTERED-001)"
            ),
        )));
    }
}

/// Run the Response pass: cross-field signature pin invariants and signature method checks.
///
/// Returns no diagnostics for Response documents that omit `authoredSignatures`.
pub fn lint_response(doc: &Value) -> Vec<LintDiagnostic> {
    let signatures = match doc.get("authoredSignatures").and_then(Value::as_array) {
        Some(arr) if !arr.is_empty() => arr,
        _ => return Vec::new(),
    };

    let top_id = doc.get("id").and_then(Value::as_str);
    let top_def_url = doc.get("definitionUrl").and_then(Value::as_str);
    let top_def_ver = doc.get("definitionVersion").and_then(Value::as_str);

    let mut diags = Vec::new();
    for (i, sig) in signatures.iter().enumerate() {
        // E905: Signature method registry validation (FORMSPEC-SIG-METHOD-REGISTERED-001)
        check_signature_method_registration(i, sig, &mut diags);

        let Some(sp) = sig.get("signedPayload") else {
            continue;
        };

        let prefix = format!("$.authoredSignatures[{i}].signedPayload");

        // E900: responseId mismatch
        if let (Some(top), Some(sp_id)) = (top_id, sp.get("responseId").and_then(Value::as_str)) {
            if sp_id != top {
                diags.push(with_metadata(LintDiagnostic::error(
                    crate::LintCode::E900,
                    8,
                    format!("{prefix}.responseId"),
                    format!(
                        "authoredSignatures[{i}].signedPayload.responseId ({sp_id:?}) != top-level id ({top:?})"
                    ),
                )));
            }
        }

        // E901: definitionUrl mismatch
        if let (Some(top), Some(sp_url)) =
            (top_def_url, sp.get("definitionUrl").and_then(Value::as_str))
        {
            if sp_url != top {
                diags.push(with_metadata(LintDiagnostic::error(
                    crate::LintCode::E901,
                    8,
                    format!("{prefix}.definitionUrl"),
                    format!(
                        "authoredSignatures[{i}].signedPayload.definitionUrl ({sp_url:?}) != top-level definitionUrl ({top:?})"
                    ),
                )));
            }
        }

        // E902: definitionVersion mismatch
        if let (Some(top), Some(sp_ver)) = (
            top_def_ver,
            sp.get("definitionVersion").and_then(Value::as_str),
        ) {
            if sp_ver != top {
                diags.push(with_metadata(LintDiagnostic::error(
                    crate::LintCode::E902,
                    8,
                    format!("{prefix}.definitionVersion"),
                    format!(
                        "authoredSignatures[{i}].signedPayload.definitionVersion ({sp_ver:?}) != top-level definitionVersion ({top:?})"
                    ),
                )));
            }
        }
    }

    diags
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn base_response() -> Value {
        json!({
            "$formspecResponse": "1.0",
            "definitionUrl": "https://example.org/forms/x",
            "definitionVersion": "1.0.0",
            "id": "resp-1",
            "status": "completed",
            "data": {},
            "authored": "2026-04-22T12:00:00Z",
        })
    }

    fn signature(response_id: &str, def_url: &str, def_ver: &str) -> Value {
        json!({
            "signatureId": "sig-1",
            "documentId": "d",
            "signingIntent": "urn:x:y:z",
            "signatureValue": "AA==",
            "signedPayload": {
                "canonicalization": "formspec-response-signing-v1",
                "digestAlgorithm": "sha-256",
                "digest": "0".repeat(64),
                "responseId": response_id,
                "definitionUrl": def_url,
                "definitionVersion": def_ver,
                "signedAt": "2026-04-22T12:00:00Z",
                "signingIntent": "urn:x:y:z",
            }
        })
    }

    #[test]
    fn aligned_pins_produce_no_diagnostics() {
        let mut doc = base_response();
        doc["authoredSignatures"] = Value::Array(vec![signature(
            "resp-1",
            "https://example.org/forms/x",
            "1.0.0",
        )]);
        assert!(lint_response(&doc).is_empty());
    }

    #[test]
    fn response_id_mismatch_emits_e900() {
        let mut doc = base_response();
        doc["authoredSignatures"] = Value::Array(vec![signature(
            "resp-OTHER",
            "https://example.org/forms/x",
            "1.0.0",
        )]);
        let diags = lint_response(&doc);
        assert_eq!(diags.len(), 1);
        assert_eq!(diags[0].code, "E900");
        assert!(diags[0].path.contains("responseId"));
    }

    #[test]
    fn definition_url_mismatch_emits_e901() {
        let mut doc = base_response();
        doc["authoredSignatures"] = Value::Array(vec![signature(
            "resp-1",
            "https://example.org/forms/OTHER",
            "1.0.0",
        )]);
        let diags = lint_response(&doc);
        assert_eq!(diags.len(), 1);
        assert_eq!(diags[0].code, "E901");
    }

    #[test]
    fn definition_version_mismatch_emits_e902() {
        let mut doc = base_response();
        doc["authoredSignatures"] = Value::Array(vec![signature(
            "resp-1",
            "https://example.org/forms/x",
            "2.0.0",
        )]);
        let diags = lint_response(&doc);
        assert_eq!(diags.len(), 1);
        assert_eq!(diags[0].code, "E902");
    }

    #[test]
    fn multiple_mismatches_emit_all_three_codes() {
        let mut doc = base_response();
        doc["authoredSignatures"] = Value::Array(vec![signature(
            "resp-OTHER",
            "https://example.org/forms/OTHER",
            "2.0.0",
        )]);
        let diags = lint_response(&doc);
        assert_eq!(diags.len(), 3);
        let codes: Vec<_> = diags.iter().map(|d| d.code.as_wire_str()).collect();
        assert!(codes.contains(&"E900"));
        assert!(codes.contains(&"E901"));
        assert!(codes.contains(&"E902"));
    }

    #[test]
    fn no_authored_signatures_produces_no_diagnostics() {
        let doc = base_response();
        assert!(lint_response(&doc).is_empty());
    }

    #[test]
    fn registered_signature_method_passes_cleanly() {
        let mut doc = base_response();
        let mut sig = signature("resp-1", "https://example.org/forms/x", "1.0.0");
        sig["signatureMethod"] = json!("urn:formspec:sig-method:ed25519-cose-sign1@1");
        doc["authoredSignatures"] = Value::Array(vec![sig]);
        assert!(lint_response(&doc).is_empty());

        let mut doc_receipt = base_response();
        let mut sig_receipt = signature("resp-1", "https://example.org/forms/x", "1.0.0");
        sig_receipt["signatureMethod"] = json!("urn:formspec:receipt-method:ed25519-cose-sign1@1");
        doc_receipt["authoredSignatures"] = Value::Array(vec![sig_receipt]);
        assert!(lint_response(&doc_receipt).is_empty());
    }

    #[test]
    fn unregistered_signature_method_emits_e905() {
        let mut doc = base_response();
        let mut sig = signature("resp-1", "https://example.org/forms/x", "1.0.0");
        sig["signatureMethod"] = json!("urn:formspec:sig-method:unregistered-quantum@1");
        doc["authoredSignatures"] = Value::Array(vec![sig]);

        let diags = lint_response(&doc);
        assert_eq!(diags.len(), 1);
        assert_eq!(diags[0].code, "E905");
        assert_eq!(diags[0].path, "$.authoredSignatures[0].signatureMethod");
        assert!(diags[0].message.contains("FORMSPEC-SIG-METHOD-REGISTERED-001"));
    }

    #[test]
    fn unregistered_method_uri_field_emits_e905() {
        let mut doc = base_response();
        let mut sig = signature("resp-1", "https://example.org/forms/x", "1.0.0");
        sig["methodUri"] = json!("urn:unregistered:unknown@1");
        doc["authoredSignatures"] = Value::Array(vec![sig]);

        let diags = lint_response(&doc);
        assert_eq!(diags.len(), 1);
        assert_eq!(diags[0].code, "E905");
        assert_eq!(diags[0].path, "$.authoredSignatures[0].methodUri");
    }

    #[test]
    fn unregistered_verification_receipt_method_emits_e905() {
        let mut doc = base_response();
        let mut sig = signature("resp-1", "https://example.org/forms/x", "1.0.0");
        sig["verificationReceipt"] = json!({
            "method": "urn:unregistered:receipt-method@1"
        });
        doc["authoredSignatures"] = Value::Array(vec![sig]);

        let diags = lint_response(&doc);
        assert_eq!(diags.len(), 1);
        assert_eq!(diags[0].code, "E905");
        assert_eq!(
            diags[0].path,
            "$.authoredSignatures[0].verificationReceipt.method"
        );
    }

    #[test]
    fn cose_protected_header_method_uri_validation() {
        // Construct CBOR map with -65540 => "urn:formspec:sig-method:ed25519-cose-sign1@1"
        let valid_uri = "urn:formspec:sig-method:ed25519-cose-sign1@1";
        let mut valid_cbor = vec![
            0x3a, 0x00, 0x01, 0x00, 0x03, // label -65540
            0x78, valid_uri.len() as u8,  // tstr length
        ];
        valid_cbor.extend_from_slice(valid_uri.as_bytes());
        let valid_b64 = base64::engine::general_purpose::STANDARD.encode(&valid_cbor);

        let mut doc_valid = base_response();
        let mut sig_valid = signature("resp-1", "https://example.org/forms/x", "1.0.0");
        sig_valid["signatureValue"] = json!(valid_b64);
        doc_valid["authoredSignatures"] = Value::Array(vec![sig_valid]);
        assert!(lint_response(&doc_valid).is_empty());

        // Construct CBOR map with -65540 => "urn:bad:cose-method@1"
        let invalid_uri = "urn:bad:cose-method@1";
        let mut invalid_cbor = vec![
            0x3a, 0x00, 0x01, 0x00, 0x03, // label -65540
            0x78, invalid_uri.len() as u8, // tstr length
        ];
        invalid_cbor.extend_from_slice(invalid_uri.as_bytes());
        let invalid_b64 = base64::engine::general_purpose::STANDARD.encode(&invalid_cbor);

        let mut doc_invalid = base_response();
        let mut sig_invalid = signature("resp-1", "https://example.org/forms/x", "1.0.0");
        sig_invalid["signatureValue"] = json!(invalid_b64);
        doc_invalid["authoredSignatures"] = Value::Array(vec![sig_invalid]);

        let diags = lint_response(&doc_invalid);
        assert_eq!(diags.len(), 1);
        assert_eq!(diags[0].code, "E905");
        assert_eq!(diags[0].path, "$.authoredSignatures[0].signatureValue");
    }

    #[test]
    fn e905_fixture_emits_e905() {
        let fixture_str = include_str!("../../../tests/fixtures/lint/E905-unregistered-signature-method.json");
        let doc: Value = serde_json::from_str(fixture_str).expect("parse E905 fixture");
        let diags = lint_response(&doc);
        assert!(
            diags.iter().any(|d| d.code == crate::LintCode::E905),
            "E905 fixture must emit E905 diagnostic, got {:?}",
            diags.iter().map(|d| &d.code).collect::<Vec<_>>()
        );
    }
}


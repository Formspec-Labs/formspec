//! Pass 8 — Response cross-field invariants.
//!
//! Validates the `authoredSignatures[*].signedPayload` pin triple against the
//! top-level Response pins. JSON Schema cannot encode the equality constraint;
//! Core spec §2.1.6 ("When `authoredSignatures` is present") lists it MUST.
//!
//! Emits:
//! - E900: `signedPayload.responseId` != top-level `id`
//! - E901: `signedPayload.definitionUrl` != top-level `definitionUrl`
//! - E902: `signedPayload.definitionVersion` != top-level `definitionVersion`
//!
//! Parity target: Python `_pass_signed_payload_validation` in
//! `src/formspec/validate.py` (SIGNED_PAYLOAD_RESPONSE_ID_MISMATCH and
//! siblings). Diagnostic shapes differ — Rust emits per-pass codes; Python
//! emits SIGNED_PAYLOAD_* codes through `validate_all`. Both reject the same
//! fixtures with the same root cause.
#![allow(clippy::missing_docs_in_private_items)]

use serde_json::Value;

use crate::metadata::with_metadata;
use crate::types::LintDiagnostic;

/// Run the Response pass: cross-field signature pin invariants.
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
}

// Rust guideline compliant 2026-02-21
//! Cross-language JSON round-trip tests for Formspec `VerificationReceipt`
//! against the `integrity-signature-port` owner types (fs-gftu).

use formspec_signature_port::{
    AdapterInfo, KeyInfo, RevocationContext, TimestampingContext, TrellisAnchorRef,
    VerificationContext, VerificationReceipt, VerificationResult, WitnessContext,
};

fn sample_full_receipt() -> VerificationReceipt {
    VerificationReceipt {
        result: VerificationResult::Verified,
        method: "urn:formspec:sig-method:ed25519-cose-sign1@1".into(),
        method_registry_version: "1.1.0".into(),
        adapter: AdapterInfo {
            id: "urn:formspec:adapter:ring@1".into(),
            version: "1.0.0".into(),
        },
        key: KeyInfo {
            r#ref: "did:key:z6MkhaXgB8LuS998781s6...".into(),
            version: Some("key-v1".to_string()),
            snapshot: Some("sha256:abc123456789...".to_string()),
        },
        verified_at: "2026-05-17T00:00:00Z".to_string(),
        context: Some(VerificationContext {
            revocation: Some(RevocationContext {
                kind: "ocsp".to_string(),
                response_hash: "aGVsbG8tcmV2b2NhdGlvbg==".to_string(),
            }),
            timestamping: Some(TimestampingContext {
                authority: "https://timestamp.example.gov".into(),
                receipt_hash: "dGltZXN0YW1wLXJlY2VpcHQ=".to_string(),
            }),
            witness: Some(WitnessContext {
                anchor: TrellisAnchorRef {
                    event_hash: "ZXZlbnQtaGFzaC1hbmNob3I=".to_string(),
                    ledger_scope: "urn:trellis:scope:test-scope".to_string(),
                },
            }),
        }),
        receipt_bytes: Some("0oRWoQExiQEFQnNpZ25lZA==".to_string()),
    }
}

fn sample_minimal_receipt(result: VerificationResult) -> VerificationReceipt {
    VerificationReceipt {
        result,
        method: "urn:formspec:sig-method:ecdsa-p256-cose-sign1@1".into(),
        method_registry_version: "1.1.0".into(),
        adapter: AdapterInfo {
            id: "urn:formspec:adapter:webcrypto@1".into(),
            version: "1.0.0".into(),
        },
        key: KeyInfo {
            r#ref: "test-key-id".into(),
            version: None,
            snapshot: None,
        },
        verified_at: "2026-05-17T12:00:00Z".to_string(),
        context: None,
        receipt_bytes: None,
    }
}

#[test]
fn full_verification_receipt_json_roundtrip() {
    let receipt = sample_full_receipt();
    let json_str = serde_json::to_string_pretty(&receipt).expect("serialize full receipt");
    let deserialized: VerificationReceipt =
        serde_json::from_str(&json_str).expect("deserialize full receipt");

    assert_eq!(receipt, deserialized);
    assert!(deserialized.is_verified());
    assert!(!deserialized.is_failed());
    assert!(!deserialized.is_unsupported());
}

#[test]
fn minimal_verification_receipt_json_roundtrip_all_verdicts() {
    for verdict in [
        VerificationResult::Verified,
        VerificationResult::Failed,
        VerificationResult::Unsupported,
    ] {
        let receipt = sample_minimal_receipt(verdict.clone());
        let json_str = serde_json::to_string(&receipt).expect("serialize minimal receipt");
        let deserialized: VerificationReceipt =
            serde_json::from_str(&json_str).expect("deserialize minimal receipt");

        assert_eq!(receipt, deserialized);
        match verdict {
            VerificationResult::Verified => {
                assert!(deserialized.is_verified());
                assert!(!deserialized.is_failed());
                assert!(!deserialized.is_unsupported());
            }
            VerificationResult::Failed => {
                assert!(!deserialized.is_verified());
                assert!(deserialized.is_failed());
                assert!(!deserialized.is_unsupported());
            }
            VerificationResult::Unsupported => {
                assert!(!deserialized.is_verified());
                assert!(!deserialized.is_failed());
                assert!(deserialized.is_unsupported());
            }
        }
    }
}

#[test]
fn typescript_contract_json_shape_and_field_naming_parity() {
    // Validates JSON representation matches exact TypeScript interface contract:
    // interface VerificationReceipt {
    //   result: 'verified' | 'failed' | 'unsupported';
    //   method: string;
    //   methodRegistryVersion: string;
    //   adapter: { id: string; version: string; };
    //   key: { ref: string; version?: string; snapshot?: string; };
    //   verifiedAt: string;
    //   context?: { revocation?: ...; timestamping?: ...; witness?: ...; };
    //   receiptBytes?: string;
    // }
    let ts_canonical_json = r#"{
        "result": "verified",
        "method": "urn:formspec:sig-method:ed25519-cose-sign1@1",
        "methodRegistryVersion": "1.1.0",
        "adapter": {
            "id": "urn:formspec:adapter:ring@1",
            "version": "1.0.0"
        },
        "key": {
            "ref": "receipt-key-reference-001",
            "version": "1",
            "snapshot": "sha256:0123456789abcdef"
        },
        "verifiedAt": "2026-10-23T12:00:00Z",
        "context": {
            "revocation": {
                "kind": "ocsp",
                "responseHash": "cmVzcG9uc2UtaGFzaA=="
            },
            "timestamping": {
                "authority": "https://tsa.example.gov/v1",
                "receiptHash": "dGltZXN0YW1wLWhhc2g="
            },
            "witness": {
                "anchor": {
                    "eventHash": "ZXZlbnQtaGFzaA==",
                    "ledgerScope": "urn:trellis:scope:default"
                }
            }
        },
        "receiptBytes": "0oRWoQExiQEFQnNpZ25lZA=="
    }"#;

    let receipt: VerificationReceipt =
        serde_json::from_str(ts_canonical_json).expect("deserialize TS-shaped receipt");
    assert_eq!(receipt.result, VerificationResult::Verified);
    assert_eq!(receipt.method.as_str(), "urn:formspec:sig-method:ed25519-cose-sign1@1");
    assert_eq!(receipt.method_registry_version.as_str(), "1.1.0");
    assert_eq!(receipt.adapter.id.as_str(), "urn:formspec:adapter:ring@1");
    assert_eq!(receipt.adapter.version.as_str(), "1.0.0");
    assert_eq!(receipt.key.r#ref.as_str(), "receipt-key-reference-001");
    assert_eq!(receipt.key.version.as_deref(), Some("1"));
    assert_eq!(receipt.key.snapshot.as_deref(), Some("sha256:0123456789abcdef"));
    assert_eq!(receipt.verified_at, "2026-10-23T12:00:00Z");

    let context = receipt.context.as_ref().expect("context must be present");
    let revocation = context.revocation.as_ref().expect("revocation present");
    assert_eq!(revocation.kind, "ocsp");
    assert_eq!(revocation.response_hash, "cmVzcG9uc2UtaGFzaA==");

    let timestamping = context.timestamping.as_ref().expect("timestamping present");
    assert_eq!(timestamping.authority.as_str(), "https://tsa.example.gov/v1");
    assert_eq!(timestamping.receipt_hash, "dGltZXN0YW1wLWhhc2g=");

    let witness = context.witness.as_ref().expect("witness present");
    assert_eq!(witness.anchor.event_hash, "ZXZlbnQtaGFzaA==");
    assert_eq!(witness.anchor.ledger_scope, "urn:trellis:scope:default");

    assert_eq!(
        receipt.receipt_bytes.as_deref(),
        Some("0oRWoQExiQEFQnNpZ25lZA==")
    );

    // Re-serialize and check serialized value fields
    let reserialized = serde_json::to_value(&receipt).expect("re-serialize");
    assert_eq!(reserialized["result"], "verified");
    assert_eq!(reserialized["methodRegistryVersion"], "1.1.0");
    assert_eq!(reserialized["verifiedAt"], "2026-10-23T12:00:00Z");
    assert_eq!(reserialized["receiptBytes"], "0oRWoQExiQEFQnNpZ25lZA==");
    assert_eq!(
        reserialized["context"]["revocation"]["responseHash"],
        "cmVzcG9uc2UtaGFzaA=="
    );
    assert_eq!(
        reserialized["context"]["timestamping"]["receiptHash"],
        "dGltZXN0YW1wLWhhc2g="
    );
    assert_eq!(
        reserialized["context"]["witness"]["anchor"]["eventHash"],
        "ZXZlbnQtaGFzaA=="
    );
    assert_eq!(
        reserialized["context"]["witness"]["anchor"]["ledgerScope"],
        "urn:trellis:scope:default"
    );
}

#[test]
fn omitted_optional_fields_are_absent_from_json_wire() {
    let receipt = sample_minimal_receipt(VerificationResult::Failed);
    let serialized = serde_json::to_value(&receipt).expect("serialize minimal");

    assert!(serialized.get("context").is_none());
    assert!(serialized.get("receiptBytes").is_none());
    assert!(serialized["key"].get("version").is_none());
    assert!(serialized["key"].get("snapshot").is_none());
}

#[test]
fn canonical_receipt_payload_bytes_strips_receipt_bytes_properly() {
    use integrity_signature::canonical_receipt_payload_bytes;

    let receipt_with_bytes = sample_full_receipt();
    let mut receipt_without_bytes = receipt_with_bytes.clone();
    receipt_without_bytes.receipt_bytes = None;

    let bytes_a = canonical_receipt_payload_bytes(&receipt_with_bytes)
        .expect("canonical bytes with receipt_bytes");
    let bytes_b = canonical_receipt_payload_bytes(&receipt_without_bytes)
        .expect("canonical bytes without receipt_bytes");

    // Both must yield identical canonical bytes because receiptBytes is excluded before JCS
    assert_eq!(bytes_a, bytes_b);
    assert!(!bytes_a.is_empty());
}

#[test]
fn invalid_json_rejections() {
    // Missing required field 'method'
    let invalid_missing_method = r#"{
        "result": "verified",
        "methodRegistryVersion": "1.1.0",
        "adapter": { "id": "urn:test", "version": "1.0.0" },
        "key": { "ref": "key-1" },
        "verifiedAt": "2026-10-23T00:00:00Z"
    }"#;
    assert!(serde_json::from_str::<VerificationReceipt>(invalid_missing_method).is_err());

    // Unknown verdict
    let invalid_verdict = r#"{
        "result": "partially_valid",
        "method": "urn:formspec:sig-method:ed25519-cose-sign1@1",
        "methodRegistryVersion": "1.1.0",
        "adapter": { "id": "urn:test", "version": "1.0.0" },
        "key": { "ref": "key-1" },
        "verifiedAt": "2026-10-23T00:00:00Z"
    }"#;
    assert!(serde_json::from_str::<VerificationReceipt>(invalid_verdict).is_err());

    // Missing adapter.version
    let invalid_adapter = r#"{
        "result": "verified",
        "method": "urn:formspec:sig-method:ed25519-cose-sign1@1",
        "methodRegistryVersion": "1.1.0",
        "adapter": { "id": "urn:test" },
        "key": { "ref": "key-1" },
        "verifiedAt": "2026-10-23T00:00:00Z"
    }"#;
    assert!(serde_json::from_str::<VerificationReceipt>(invalid_adapter).is_err());
}

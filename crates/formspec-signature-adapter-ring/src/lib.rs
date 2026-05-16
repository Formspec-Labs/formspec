use formspec_signature_port::{
    AdapterInfo, ClockHandle, KeyInfo, SignatureMethodRegistry, SystemClock, VerificationReceipt,
    VerificationResult, Verifier, VerifierError, VerifyRequest, utc_to_rfc3339_seconds,
};
use ring::signature;
use std::sync::Arc;

const ADAPTER_ID: &str = "urn:formspec:adapter:ring@1";
const ADAPTER_VERSION: &str = "0.1.0";

pub struct RingVerifier {
    adapter_info: AdapterInfo,
    clock: ClockHandle,
}

impl RingVerifier {
    pub fn new() -> Self {
        Self::new_with_clock(Arc::new(SystemClock))
    }

    pub fn new_with_clock(clock: ClockHandle) -> Self {
        Self {
            adapter_info: AdapterInfo {
                id: ADAPTER_ID.into(),
                version: ADAPTER_VERSION.into(),
            },
            clock,
        }
    }

    fn unsupported_receipt(
        &self,
        request: &VerifyRequest,
        registry: &SignatureMethodRegistry,
    ) -> VerificationReceipt {
        VerificationReceipt {
            result: VerificationResult::Unsupported,
            method: request.signature_method.clone(),
            method_registry_version: registry.version.clone(),
            adapter: self.adapter_info.clone(),
            key: KeyInfo {
                r#ref: request.key_ref.clone(),
                version: None,
                snapshot: None,
            },
            verified_at: utc_to_rfc3339_seconds(self.clock.now_utc()),
            context: None,
            receipt_bytes: None,
        }
    }

    fn failed_receipt(
        &self,
        request: &VerifyRequest,
        registry: &SignatureMethodRegistry,
    ) -> VerificationReceipt {
        VerificationReceipt {
            result: VerificationResult::Failed,
            method: request.signature_method.clone(),
            method_registry_version: registry.version.clone(),
            adapter: self.adapter_info.clone(),
            key: KeyInfo {
                r#ref: request.key_ref.clone(),
                version: None,
                snapshot: None,
            },
            verified_at: utc_to_rfc3339_seconds(self.clock.now_utc()),
            context: None,
            receipt_bytes: None,
        }
    }

    fn verified_receipt(
        &self,
        request: &VerifyRequest,
        registry: &SignatureMethodRegistry,
    ) -> VerificationReceipt {
        VerificationReceipt {
            result: VerificationResult::Verified,
            method: request.signature_method.clone(),
            method_registry_version: registry.version.clone(),
            adapter: self.adapter_info.clone(),
            key: KeyInfo {
                r#ref: request.key_ref.clone(),
                version: None,
                snapshot: None,
            },
            verified_at: utc_to_rfc3339_seconds(self.clock.now_utc()),
            context: None,
            receipt_bytes: None,
        }
    }

    fn verify_ed25519(
        signed_bytes: &[u8],
        signature_bytes: &[u8],
        key_bytes: &[u8],
    ) -> Result<(), String> {
        let public_key = signature::UnparsedPublicKey::new(&signature::ED25519, key_bytes);
        public_key
            .verify(signed_bytes, signature_bytes)
            .map_err(|e| format!("ed25519 verification failed: {e}"))
    }

    fn verify_ecdsa_p256(
        signed_bytes: &[u8],
        signature_bytes: &[u8],
        key_bytes: &[u8],
    ) -> Result<(), String> {
        let public_key =
            signature::UnparsedPublicKey::new(&signature::ECDSA_P256_SHA256_FIXED, key_bytes);
        public_key
            .verify(signed_bytes, signature_bytes)
            .map_err(|e| format!("ecdsa-p256 verification failed: {e}"))
    }

    fn verify_rsa_pss(
        signed_bytes: &[u8],
        signature_bytes: &[u8],
        key_bytes: &[u8],
    ) -> Result<(), String> {
        let public_key =
            signature::UnparsedPublicKey::new(&signature::RSA_PSS_2048_8192_SHA256, key_bytes);
        public_key
            .verify(signed_bytes, signature_bytes)
            .map_err(|e| format!("rsa-pss verification failed: {e}"))
    }
}

impl Default for RingVerifier {
    fn default() -> Self {
        Self::new()
    }
}

impl Verifier for RingVerifier {
    fn verify(
        &self,
        request: &VerifyRequest,
        registry: &SignatureMethodRegistry,
    ) -> Result<VerificationReceipt, VerifierError> {
        let entry = registry.resolve(&request.signature_method);
        let entry = match entry {
            Some(e) => {
                if e.status == "deprecated" {
                    return Ok(self.unsupported_receipt(request, registry));
                }
                e
            }
            None => {
                return Ok(self.unsupported_receipt(request, registry));
            }
        };

        let key_ref = request.key_ref.as_str();
        let key_bytes = if key_ref.starts_with("did:") || key_ref.starts_with("urn:") {
            return Err(VerifierError::Internal {
                reason: format!(
                    "key resolution for '{}' not supported; pass raw base64-encoded public key bytes",
                    &key_ref[..key_ref.len().min(32)]
                ),
            });
        } else {
            base64::Engine::decode(&base64::engine::general_purpose::STANDARD, key_ref).map_err(
                |e| VerifierError::Internal {
                    reason: format!("invalid base64 key: {e}"),
                },
            )?
        };

        let result = match entry.alg {
            Some(-8) | Some(-7) | Some(-37) => {
                let cose = formspec_signature_cose::decode_cose_sign1_with_profile_id(
                    &request.signature_bytes,
                )
                .map_err(|error| VerifierError::InvalidCoseEncoding {
                    reason: error.to_string(),
                })?;
                if cose.alg() != entry.alg.map(i128::from) {
                    return Ok(self.failed_receipt(request, registry));
                }
                let payload =
                    cose.resolve_payload(Some(&request.signed_bytes))
                        .map_err(|error| VerifierError::InvalidCoseEncoding {
                            reason: error.to_string(),
                        })?;
                let sig_structure =
                    formspec_signature_cose::sig_structure_bytes(cose.protected_header(), payload);
                match entry.alg {
                    Some(-8) => Self::verify_ed25519(&sig_structure, cose.signature(), &key_bytes),
                    Some(-7) => {
                        Self::verify_ecdsa_p256(&sig_structure, cose.signature(), &key_bytes)
                    }
                    Some(-37) => Self::verify_rsa_pss(&sig_structure, cose.signature(), &key_bytes),
                    _ => unreachable!("outer match restricts supported algorithms"),
                }
            }
            None => {
                return Ok(self.unsupported_receipt(request, registry));
            }
            _ => {
                return Ok(self.unsupported_receipt(request, registry));
            }
        };

        match result {
            Ok(()) => Ok(self.verified_receipt(request, registry)),
            Err(_) => Ok(self.failed_receipt(request, registry)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use formspec_signature_port::{FixedClock, RegistryEntry};
    use ring::rand::SystemRandom;
    use ring::signature::KeyPair;

    fn test_registry() -> SignatureMethodRegistry {
        SignatureMethodRegistry {
            version: "1.0.0".into(),
            entries: vec![
                RegistryEntry {
                    id: "urn:formspec:sig-method:ed25519-cose-sign1@1".into(),
                    suite: "Ed25519".to_string(),
                    wire: "COSE_Sign1 with alg = -8 (EdDSA)".to_string(),
                    alg: Some(-8),
                    status: "registered".to_string(),
                    deprecation_notice: None,
                },
                RegistryEntry {
                    id: "urn:formspec:sig-method:ecdsa-p256-cose-sign1@1".into(),
                    suite: "ECDSA-P256".to_string(),
                    wire: "COSE_Sign1 with alg = -7 (ES256)".to_string(),
                    alg: Some(-7),
                    status: "registered".to_string(),
                    deprecation_notice: None,
                },
                RegistryEntry {
                    id: "urn:formspec:sig-method:rsa-pss-sha256-cose-sign1@1".into(),
                    suite: "RSA-PSS-SHA256".to_string(),
                    wire: "COSE_Sign1 with alg = -37 (PS256)".to_string(),
                    alg: Some(-37),
                    status: "registered".to_string(),
                    deprecation_notice: None,
                },
                RegistryEntry {
                    id: "urn:formspec:sig-method:ml-dsa-65-cose-sign1@1".into(),
                    suite: "ML-DSA-65 (FIPS 204)".to_string(),
                    wire: "COSE_Sign1 with alg = TBD".to_string(),
                    alg: None,
                    status: "registered".to_string(),
                    deprecation_notice: None,
                },
            ],
        }
    }

    #[test]
    fn test_unsupported_for_unknown_method() {
        let verifier = RingVerifier::new();
        let registry = test_registry();
        let receipt = verifier
            .verify(
                &VerifyRequest {
                    signed_bytes: vec![1, 2, 3],
                    signature_bytes: vec![4, 5, 6],
                    signature_method: "urn:formspec:sig-method:unknown@1".into(),
                    key_ref: "deadbeef".into(),
                },
                &registry,
            )
            .unwrap();
        assert_eq!(receipt.result.to_string(), "unsupported");
    }

    #[test]
    fn ring_adapter_uses_injected_clock_for_receipt_timestamp() {
        let verifier = RingVerifier::new_with_clock(Arc::new(
            FixedClock::at_rfc3339("2026-05-13T12:00:00Z").expect("fixed clock"),
        ));
        let registry = test_registry();
        let receipt = verifier
            .verify(
                &VerifyRequest {
                    signed_bytes: vec![1, 2, 3],
                    signature_bytes: vec![4, 5, 6],
                    signature_method: "urn:formspec:sig-method:unknown@1".into(),
                    key_ref: "deadbeef".into(),
                },
                &registry,
            )
            .expect("receipt");

        assert_eq!(receipt.verified_at, "2026-05-13T12:00:00Z");
    }

    #[test]
    fn test_unsupported_for_pqc_null_alg() {
        let verifier = RingVerifier::new();
        let registry = test_registry();
        let receipt = verifier
            .verify(
                &VerifyRequest {
                    signed_bytes: vec![1, 2, 3],
                    signature_bytes: vec![4, 5, 6],
                    signature_method: "urn:formspec:sig-method:ml-dsa-65-cose-sign1@1".into(),
                    key_ref: "deadbeef".into(),
                },
                &registry,
            )
            .unwrap();
        assert_eq!(receipt.result.to_string(), "unsupported");
    }

    #[test]
    fn test_adapter_info_in_receipt() {
        let verifier = RingVerifier::new();
        let registry = test_registry();
        let protected = formspec_signature_cose::protected_header_bytes(-7, None);
        let signature_bytes =
            formspec_signature_cose::encode_cose_sign1(&protected, None, &[0u8; 64]);
        let receipt = verifier
            .verify(
                &VerifyRequest {
                    signed_bytes: vec![1, 2, 3],
                    signature_bytes,
                    signature_method: "urn:formspec:sig-method:ecdsa-p256-cose-sign1@1".into(),
                    key_ref: "a2V5LWRhdGE=".into(),
                },
                &registry,
            )
            .unwrap();
        assert_eq!(receipt.adapter.id, "urn:formspec:adapter:ring@1");
        assert_eq!(receipt.adapter.version, "0.1.0");
        assert!(receipt.verified_at.len() > 0);
    }

    #[test]
    fn test_ed25519_invalid_signature_fails() {
        let verifier = RingVerifier::new();
        let registry = test_registry();
        let key_b64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
        let protected = formspec_signature_cose::protected_header_bytes(-8, None);
        let signature_bytes =
            formspec_signature_cose::encode_cose_sign1(&protected, None, &[0u8; 64]);
        let receipt = verifier
            .verify(
                &VerifyRequest {
                    signed_bytes: b"test message".to_vec(),
                    signature_bytes,
                    signature_method: "urn:formspec:sig-method:ed25519-cose-sign1@1".into(),
                    key_ref: key_b64.into(),
                },
                &registry,
            )
            .unwrap();
        assert_eq!(receipt.result.to_string(), "failed");
    }

    #[test]
    fn ring_adapter_rejects_cose_sign1_without_profile_id() {
        let verifier = RingVerifier::new();
        let registry = test_registry();
        let legacy_protected = [0xa1, 0x01, 0x27];
        let signature_bytes =
            formspec_signature_cose::encode_cose_sign1(&legacy_protected, None, &[0u8; 64]);
        let key_b64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

        let error = verifier
            .verify(
                &VerifyRequest {
                    signed_bytes: b"test message".to_vec(),
                    signature_bytes,
                    signature_method: "urn:formspec:sig-method:ed25519-cose-sign1@1".into(),
                    key_ref: key_b64.into(),
                },
                &registry,
            )
            .expect_err("missing profile_id should reject");

        match error {
            VerifierError::InvalidCoseEncoding { reason } => {
                assert!(
                    reason.contains("profile_id"),
                    "expected profile_id rejection, got: {reason}"
                );
            }
            other => panic!("expected InvalidCoseEncoding error, got: {other}"),
        }
    }

    #[test]
    fn test_ed25519_cose_sign1_valid_signature_verifies() {
        let rng = SystemRandom::new();
        let pkcs8 = signature::Ed25519KeyPair::generate_pkcs8(&rng).expect("generate key");
        let key_pair = signature::Ed25519KeyPair::from_pkcs8(pkcs8.as_ref()).expect("parse key");
        let signed_bytes = b"formspec signed payload".to_vec();
        let protected = formspec_signature_cose::protected_header_bytes(-8, Some(b"test-kid"));
        let sig_structure = formspec_signature_cose::sig_structure_bytes(&protected, &signed_bytes);
        let primitive_signature = key_pair.sign(&sig_structure);
        let signature_bytes = formspec_signature_cose::encode_cose_sign1(
            &protected,
            None,
            primitive_signature.as_ref(),
        );
        let key_ref = base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            key_pair.public_key().as_ref(),
        );

        let verifier = RingVerifier::new();
        let registry = test_registry();
        let receipt = verifier
            .verify(
                &VerifyRequest {
                    signed_bytes,
                    signature_bytes,
                    signature_method: "urn:formspec:sig-method:ed25519-cose-sign1@1".into(),
                    key_ref: key_ref.into(),
                },
                &registry,
            )
            .expect("verify");

        assert_eq!(receipt.result.to_string(), "verified");
    }

    #[test]
    fn test_did_key_ref_returns_clear_error() {
        let verifier = RingVerifier::new();
        let registry = test_registry();
        let result = verifier.verify(
            &VerifyRequest {
                signed_bytes: vec![1, 2, 3],
                signature_bytes: vec![4, 5, 6],
                signature_method: "urn:formspec:sig-method:ed25519-cose-sign1@1".into(),
                key_ref: "did:key:z6MkhaXgBZbuRxQRRMfWWr6PGpbNtAomVqJcg3w9oVUFCzkWn".into(),
            },
            &registry,
        );
        assert!(result.is_err());
        match result.unwrap_err() {
            VerifierError::Internal { reason } => {
                assert!(
                    reason.contains("key resolution"),
                    "expected key-resolution message, got: {reason}"
                );
            }
            other => panic!("expected Internal error, got: {other}"),
        }
    }

    #[test]
    fn test_urn_key_ref_returns_clear_error() {
        let verifier = RingVerifier::new();
        let registry = test_registry();
        let result = verifier.verify(
            &VerifyRequest {
                signed_bytes: vec![1, 2, 3],
                signature_bytes: vec![4, 5, 6],
                signature_method: "urn:formspec:sig-method:ed25519-cose-sign1@1".into(),
                key_ref: "urn:formspec:key:test-key-001".into(),
            },
            &registry,
        );
        assert!(result.is_err());
        match result.unwrap_err() {
            VerifierError::Internal { reason } => {
                assert!(
                    reason.contains("key resolution"),
                    "expected key-resolution message, got: {reason}"
                );
            }
            other => panic!("expected Internal error, got: {other}"),
        }
    }

    // ---------- Golden-vector round-trips (fs-wxoz) ----------
    //
    // Real cross-adapter import vectors. Each test:
    //   1. Generates / loads a real key, signs `signed_bytes` via ring's
    //      *signing* API, wraps the signature in COSE_Sign1.
    //   2. Routes through `RingVerifier::verify` and asserts the receipt is
    //      "verified" — proves ring's *dispatch* path (key parse + verify
    //      constants + COSE decode) is sound end-to-end.
    //   3. Flips one byte of the inner signature bytes and re-verifies,
    //      asserting the receipt is "failed" — proves the negative path
    //      rejects tampered signatures rather than silently passing.
    //   4. Emits the vector to `tests/fixtures/golden-vectors/<alg>.json`
    //      when `FORMSPEC_REGENERATE_GOLDEN_VECTORS=1`. The committed file
    //      is then re-loaded and re-verified in a separate fixture-import
    //      test, mirroring the byte-for-byte path webcrypto and Trellis
    //      adapters will take when consuming these vectors.

    use std::path::PathBuf;

    fn fixture_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("golden-vectors")
    }

    fn to_hex(bytes: &[u8]) -> String {
        const HEX: &[u8; 16] = b"0123456789abcdef";
        let mut out = String::with_capacity(bytes.len() * 2);
        for &b in bytes {
            out.push(HEX[(b >> 4) as usize] as char);
            out.push(HEX[(b & 0x0f) as usize] as char);
        }
        out
    }

    fn to_b64(bytes: &[u8]) -> String {
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes)
    }

    fn from_b64(s: &str) -> Vec<u8> {
        base64::Engine::decode(&base64::engine::general_purpose::STANDARD, s)
            .expect("base64 decode")
    }

    /// Reads a committed golden-vector JSON or fails loudly. Skipping silently
    /// on missing file hides regressions (deleted fixture → green test); the
    /// `FORMSPEC_REGENERATE_GOLDEN_VECTORS=1` opt-out exists for the path
    /// where the round-trip test must produce the file before this one
    /// re-reads it under parallel nextest.
    fn read_committed_vector_or_panic(path: &std::path::Path, name: &str) -> String {
        if let Ok(json) = std::fs::read_to_string(path) {
            return json;
        }
        if std::env::var_os("FORMSPEC_REGENERATE_GOLDEN_VECTORS").is_some() {
            panic!(
                "{name} not present yet under FORMSPEC_REGENERATE_GOLDEN_VECTORS; \
                 round-trip test must run before import test on first regen pass"
            );
        }
        panic!(
            "{name} committed golden vector missing at {}; \
             this fixture is committed to the repo and must be present. \
             To regenerate, set FORMSPEC_REGENERATE_GOLDEN_VECTORS=1 and \
             rerun the round-trip test first.",
            path.display()
        );
    }

    /// JSON fixture shape. Hand-rolled (no serde) so the crate keeps zero
    /// extra dev-deps and importers can match the exact key ordering
    /// byte-for-byte if they care to.
    fn write_vector(path: &std::path::Path, vector: &GoldenVector<'_>) {
        let mut s = String::new();
        s.push_str("{\n");
        s.push_str(&format!(
            "  \"signature_method\": \"{}\",\n",
            vector.signature_method
        ));
        s.push_str(&format!("  \"registry_alg\": {},\n", vector.registry_alg));
        s.push_str("  \"adapter\": {\n");
        s.push_str("    \"id\": \"urn:formspec:adapter:ring@1\",\n");
        s.push_str("    \"version\": \"0.1.0\"\n");
        s.push_str("  },\n");
        s.push_str(&format!(
            "  \"public_key_format\": \"{}\",\n",
            vector.public_key_format
        ));
        s.push_str(&hex_b64_field("public_key", vector.public_key, false));
        s.push_str(&hex_b64_field("signed_bytes", vector.signed_bytes, false));
        s.push_str(&hex_b64_field("protected_header", vector.protected_header, false));
        s.push_str(&hex_b64_field("sig_structure", vector.sig_structure, false));
        s.push_str(&hex_b64_field("raw_signature", vector.raw_signature, false));
        s.push_str(&hex_b64_field(
            "signature_bytes_cose_sign1",
            vector.signature_bytes_cose_sign1,
            true,
        ));
        s.push_str("}\n");
        std::fs::write(path, s).expect("write vector");
    }

    fn hex_b64_field(name: &str, bytes: &[u8], last: bool) -> String {
        let comma = if last { "" } else { "," };
        format!(
            "  \"{name}\": {{\n    \"hex\": \"{}\",\n    \"base64\": \"{}\"\n  }}{comma}\n",
            to_hex(bytes),
            to_b64(bytes),
        )
    }

    struct GoldenVector<'a> {
        signature_method: &'a str,
        registry_alg: i32,
        public_key_format: &'a str,
        public_key: &'a [u8],
        signed_bytes: &'a [u8],
        protected_header: &'a [u8],
        sig_structure: &'a [u8],
        raw_signature: &'a [u8],
        signature_bytes_cose_sign1: &'a [u8],
    }

    fn read_b64_field(json: &str, field: &str) -> Vec<u8> {
        // Minimal hand-rolled grep — the fixture format above is fixed enough
        // that we don't need a full JSON parser to round-trip a few base64
        // strings. The inner `"base64": "<value>"` is unique per field after
        // its enclosing `"<field>":` opener.
        let anchor = format!("\"{field}\": {{");
        let start = json.find(&anchor).unwrap_or_else(|| panic!("missing field {field}"));
        let after = &json[start..];
        let b64_anchor = "\"base64\": \"";
        let b64_start = after.find(b64_anchor).unwrap_or_else(|| panic!("missing base64 for {field}"));
        let payload_start = start + b64_start + b64_anchor.len();
        let rest = &json[payload_start..];
        let payload_end = rest.find('"').expect("unterminated base64 string");
        from_b64(&json[payload_start..payload_start + payload_end])
    }

    fn maybe_regenerate() -> bool {
        std::env::var("FORMSPEC_REGENERATE_GOLDEN_VECTORS").ok().as_deref() == Some("1")
    }

    fn flip_inner_signature(cose_bytes: &[u8], raw_sig: &[u8]) -> Vec<u8> {
        // The COSE_Sign1 envelope embeds the raw signature byte-for-byte as
        // the final bstr; flipping one byte there changes the inner sig
        // without disturbing the protected header or other framing.
        let needle_start = cose_bytes
            .windows(raw_sig.len())
            .position(|w| w == raw_sig)
            .expect("raw signature must appear inside COSE_Sign1 envelope");
        let mut tampered = cose_bytes.to_vec();
        tampered[needle_start] ^= 0x01;
        tampered
    }

    #[test]
    fn test_ecdsa_p256_cose_sign1_valid_signature_verifies() {
        let rng = SystemRandom::new();
        let pkcs8 = signature::EcdsaKeyPair::generate_pkcs8(
            &signature::ECDSA_P256_SHA256_FIXED_SIGNING,
            &rng,
        )
        .expect("generate ecdsa pkcs8");
        let key_pair = signature::EcdsaKeyPair::from_pkcs8(
            &signature::ECDSA_P256_SHA256_FIXED_SIGNING,
            pkcs8.as_ref(),
            &rng,
        )
        .expect("parse ecdsa pkcs8");

        let signed_bytes = b"formspec ecdsa-p256 golden vector payload".to_vec();
        let protected = formspec_signature_cose::protected_header_bytes(-7, Some(b"test-kid"));
        let sig_structure =
            formspec_signature_cose::sig_structure_bytes(&protected, &signed_bytes);
        let raw_signature = key_pair
            .sign(&rng, &sig_structure)
            .expect("ecdsa sign");
        let signature_bytes = formspec_signature_cose::encode_cose_sign1(
            &protected,
            None,
            raw_signature.as_ref(),
        );
        let public_key_bytes = key_pair.public_key().as_ref().to_vec();
        let key_ref = to_b64(&public_key_bytes);

        let verifier = RingVerifier::new();
        let registry = test_registry();

        // Positive path.
        let receipt = verifier
            .verify(
                &VerifyRequest {
                    signed_bytes: signed_bytes.clone(),
                    signature_bytes: signature_bytes.clone(),
                    signature_method: "urn:formspec:sig-method:ecdsa-p256-cose-sign1@1".into(),
                    key_ref: key_ref.clone().into(),
                },
                &registry,
            )
            .expect("verify ecdsa");
        assert_eq!(
            receipt.result.to_string(),
            "verified",
            "ecdsa-p256 positive round-trip must verify"
        );

        // Negative path — flip one byte of the inner signature.
        let tampered = flip_inner_signature(&signature_bytes, raw_signature.as_ref());
        assert_ne!(tampered, signature_bytes, "tamper must mutate envelope");
        let receipt = verifier
            .verify(
                &VerifyRequest {
                    signed_bytes: signed_bytes.clone(),
                    signature_bytes: tampered,
                    signature_method: "urn:formspec:sig-method:ecdsa-p256-cose-sign1@1".into(),
                    key_ref: key_ref.clone().into(),
                },
                &registry,
            )
            .expect("verify tampered ecdsa");
        assert_eq!(
            receipt.result.to_string(),
            "failed",
            "ecdsa-p256 tampered signature must reject"
        );

        if maybe_regenerate() {
            std::fs::create_dir_all(fixture_dir()).expect("mkdir");
            write_vector(
                &fixture_dir().join("ecdsa-p256-sha256.json"),
                &GoldenVector {
                    signature_method: "urn:formspec:sig-method:ecdsa-p256-cose-sign1@1",
                    registry_alg: -7,
                    public_key_format: "SEC1 uncompressed P-256 (65 bytes, 0x04 prefix)",
                    public_key: &public_key_bytes,
                    signed_bytes: &signed_bytes,
                    protected_header: &protected,
                    sig_structure: &sig_structure,
                    raw_signature: raw_signature.as_ref(),
                    signature_bytes_cose_sign1: &signature_bytes,
                },
            );
        }
    }

    #[test]
    fn test_rsa_pss_sha256_cose_sign1_valid_signature_verifies() {
        // Ring cannot generate RSA keys. Load a pre-committed PKCS#8 v1
        // test key (2048-bit, generated once via `openssl genpkey`).
        let pkcs8_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("rsa-test-key.pkcs8");
        let pkcs8 = std::fs::read(&pkcs8_path).expect("rsa test key pkcs8");
        let key_pair = signature::RsaKeyPair::from_pkcs8(&pkcs8).expect("parse rsa pkcs8");

        let rng = SystemRandom::new();
        let signed_bytes = b"formspec rsa-pss-sha256 golden vector payload".to_vec();
        let protected = formspec_signature_cose::protected_header_bytes(-37, Some(b"test-kid"));
        let sig_structure =
            formspec_signature_cose::sig_structure_bytes(&protected, &signed_bytes);

        let mut raw_signature = vec![0u8; key_pair.public().modulus_len()];
        key_pair
            .sign(
                &signature::RSA_PSS_SHA256,
                &rng,
                &sig_structure,
                &mut raw_signature,
            )
            .expect("rsa-pss sign");

        let signature_bytes = formspec_signature_cose::encode_cose_sign1(
            &protected,
            None,
            &raw_signature,
        );

        use ring::signature::KeyPair as _;
        let public_key_bytes = key_pair.public_key().as_ref().to_vec();
        let key_ref = to_b64(&public_key_bytes);

        let verifier = RingVerifier::new();
        let registry = test_registry();

        let receipt = verifier
            .verify(
                &VerifyRequest {
                    signed_bytes: signed_bytes.clone(),
                    signature_bytes: signature_bytes.clone(),
                    signature_method: "urn:formspec:sig-method:rsa-pss-sha256-cose-sign1@1".into(),
                    key_ref: key_ref.clone().into(),
                },
                &registry,
            )
            .expect("verify rsa-pss");
        assert_eq!(
            receipt.result.to_string(),
            "verified",
            "rsa-pss-sha256 positive round-trip must verify"
        );

        let tampered = flip_inner_signature(&signature_bytes, &raw_signature);
        assert_ne!(tampered, signature_bytes);
        let receipt = verifier
            .verify(
                &VerifyRequest {
                    signed_bytes: signed_bytes.clone(),
                    signature_bytes: tampered,
                    signature_method: "urn:formspec:sig-method:rsa-pss-sha256-cose-sign1@1".into(),
                    key_ref: key_ref.clone().into(),
                },
                &registry,
            )
            .expect("verify tampered rsa-pss");
        assert_eq!(
            receipt.result.to_string(),
            "failed",
            "rsa-pss-sha256 tampered signature must reject"
        );

        if maybe_regenerate() {
            std::fs::create_dir_all(fixture_dir()).expect("mkdir");
            write_vector(
                &fixture_dir().join("rsa-pss-sha256.json"),
                &GoldenVector {
                    signature_method: "urn:formspec:sig-method:rsa-pss-sha256-cose-sign1@1",
                    registry_alg: -37,
                    public_key_format: "DER-encoded RSAPublicKey (PKCS#1 SEQUENCE { n, e })",
                    public_key: &public_key_bytes,
                    signed_bytes: &signed_bytes,
                    protected_header: &protected,
                    sig_structure: &sig_structure,
                    raw_signature: &raw_signature,
                    signature_bytes_cose_sign1: &signature_bytes,
                },
            );
        }
    }

    #[test]
    fn test_ecdsa_p256_committed_golden_vector_imports_and_verifies() {
        // Mirrors the byte-for-byte path another adapter (webcrypto,
        // trellis-admission-formspec) will take when importing this vector:
        // read JSON → decode public_key + signed_bytes + COSE_Sign1 → verify.
        // Regenerate mode is the only path that may bypass the fixture-present
        // assertion (the round-trip test produces the file before this one
        // re-reads it; parallel nextest can't guarantee ordering).
        let path = fixture_dir().join("ecdsa-p256-sha256.json");
        let json = read_committed_vector_or_panic(&path, "ecdsa-p256-sha256.json");
        let public_key = read_b64_field(&json, "public_key");
        let signed_bytes = read_b64_field(&json, "signed_bytes");
        let signature_bytes = read_b64_field(&json, "signature_bytes_cose_sign1");
        let key_ref = to_b64(&public_key);

        let verifier = RingVerifier::new();
        let registry = test_registry();
        let receipt = verifier
            .verify(
                &VerifyRequest {
                    signed_bytes,
                    signature_bytes,
                    signature_method: "urn:formspec:sig-method:ecdsa-p256-cose-sign1@1".into(),
                    key_ref: key_ref.into(),
                },
                &registry,
            )
            .expect("verify imported ecdsa vector");
        assert_eq!(receipt.result.to_string(), "verified");
    }

    #[test]
    fn test_rsa_pss_sha256_committed_golden_vector_imports_and_verifies() {
        let path = fixture_dir().join("rsa-pss-sha256.json");
        let json = read_committed_vector_or_panic(&path, "rsa-pss-sha256.json");
        let public_key = read_b64_field(&json, "public_key");
        let signed_bytes = read_b64_field(&json, "signed_bytes");
        let signature_bytes = read_b64_field(&json, "signature_bytes_cose_sign1");
        let key_ref = to_b64(&public_key);

        let verifier = RingVerifier::new();
        let registry = test_registry();
        let receipt = verifier
            .verify(
                &VerifyRequest {
                    signed_bytes,
                    signature_bytes,
                    signature_method: "urn:formspec:sig-method:rsa-pss-sha256-cose-sign1@1".into(),
                    key_ref: key_ref.into(),
                },
                &registry,
            )
            .expect("verify imported rsa-pss vector");
        assert_eq!(receipt.result.to_string(), "verified");
    }
}

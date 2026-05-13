use formspec_signature_port::{
    AdapterInfo, ClockHandle, KeyInfo, SignatureMethodRegistry, SystemClock, VerificationReceipt,
    VerificationResult, Verifier, VerifierError, VerifyRequest,
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
            verified_at: self.clock.now_rfc3339(),
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
            verified_at: self.clock.now_rfc3339(),
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
            verified_at: self.clock.now_rfc3339(),
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
}

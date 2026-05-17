#![forbid(unsafe_code)]

//! Formspec facade for the shared ring signature adapter.
//!
//! The cryptographic implementation lives in `integrity-signature-ring`.
//! This crate owns only Formspec semantics: method-URI prefix, adapter
//! identity, receipt-signing method URI, and the Formspec verification-receipt
//! payload domain.

use formspec_signature_cose::FORMSPEC_SIG_METHOD_URI_PREFIX;
use formspec_signature_port::{
    ClockHandle, KeyResolverHandle, ReceiptSigner, ReceiptSignerError, ReceiptSignerHandle,
    SignatureMethodRegistry, VerificationReceipt, Verifier, VerifierError, VerifyRequest,
};
use ring::signature;

pub use integrity_signature_ring::RingVerifierConfig;

const ADAPTER_ID: &str = "urn:formspec:adapter:ring@1";
const ADAPTER_VERSION: &str = env!("CARGO_PKG_VERSION");
const IN_PROCESS_RECEIPT_SIGNER_ID: &str = "urn:formspec:receipt-signer:ring-in-process@1";
const RECEIPT_METHOD_URI: &str = "urn:formspec:receipt-method:ed25519-cose-sign1@1";

/// Domain tag for Formspec verification-receipt signed bytes.
pub const RECEIPT_SIGNED_PAYLOAD_DOMAIN: &str = "formspec.verification.receipt.v1";

fn formspec_config() -> RingVerifierConfig {
    RingVerifierConfig::new(FORMSPEC_SIG_METHOD_URI_PREFIX)
        .with_adapter_id(ADAPTER_ID)
        .with_adapter_version(ADAPTER_VERSION)
        .with_receipt_payload_domain(RECEIPT_SIGNED_PAYLOAD_DOMAIN)
}

/// Builds the canonical, domain-separated Formspec receipt payload bytes.
///
/// # Errors
/// Returns an error when the receipt is not serializable as a JSON object or
/// canonical JSON encoding fails.
pub fn canonical_receipt_payload_bytes(receipt: &VerificationReceipt) -> Result<Vec<u8>, String> {
    integrity_signature_ring::canonical_receipt_payload_bytes_with_domain(
        receipt,
        RECEIPT_SIGNED_PAYLOAD_DOMAIN,
    )
}

/// Formspec ring verifier facade.
pub struct RingVerifier {
    inner: integrity_signature_ring::RingVerifier,
}

impl RingVerifier {
    #[must_use]
    pub fn new() -> Self {
        Self {
            inner: integrity_signature_ring::RingVerifier::new_with_config(formspec_config()),
        }
    }

    #[must_use]
    pub fn new_with_clock(clock: ClockHandle) -> Self {
        Self {
            inner: integrity_signature_ring::RingVerifier::new_with_clock_and_config(
                clock,
                formspec_config(),
            ),
        }
    }

    #[must_use]
    pub fn new_with_key_resolver(resolver: KeyResolverHandle) -> Self {
        Self {
            inner: integrity_signature_ring::RingVerifier::new_with_config_and_key_resolver(
                formspec_config(),
                resolver,
            ),
        }
    }

    #[must_use]
    pub fn new_with_receipt_signer(signer: ReceiptSignerHandle) -> Self {
        Self {
            inner: integrity_signature_ring::RingVerifier::new_with_config_and_receipt_signer(
                formspec_config(),
                signer,
            ),
        }
    }

    #[must_use]
    pub fn new_with_clock_and_receipt_signer(
        clock: ClockHandle,
        signer: ReceiptSignerHandle,
    ) -> Self {
        Self {
            inner: integrity_signature_ring::RingVerifier::new_with_clock_config_and_receipt_signer(
                clock,
                formspec_config(),
                signer,
            ),
        }
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
        self.inner.verify(request, registry)
    }
}

/// In-process Formspec receipt signer facade.
pub struct InProcessReceiptSigner {
    inner: integrity_signature_ring::InProcessReceiptSigner,
}

impl InProcessReceiptSigner {
    #[must_use]
    pub fn new(key_pair: signature::Ed25519KeyPair, kid: Option<&[u8]>) -> Self {
        Self {
            inner: integrity_signature_ring::InProcessReceiptSigner::new_with_identity(
                key_pair,
                kid,
                IN_PROCESS_RECEIPT_SIGNER_ID,
                RECEIPT_METHOD_URI,
            ),
        }
    }

    pub fn generate(kid: Option<&[u8]>) -> Result<(Self, Vec<u8>), ReceiptSignerError> {
        let (inner, public_key) =
            integrity_signature_ring::InProcessReceiptSigner::generate_with_identity(
                kid,
                IN_PROCESS_RECEIPT_SIGNER_ID,
                RECEIPT_METHOD_URI,
            )?;
        Ok((Self { inner }, public_key))
    }

    #[must_use]
    pub fn public_key_bytes(&self) -> &[u8] {
        self.inner.public_key_bytes()
    }
}

impl ReceiptSigner for InProcessReceiptSigner {
    fn sign_receipt(&self, canonical_payload: &[u8]) -> Result<Vec<u8>, ReceiptSignerError> {
        self.inner.sign_receipt(canonical_payload)
    }

    fn signer_id(&self) -> &str {
        self.inner.signer_id()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use formspec_signature_port::{AdapterInfo, KeyInfo, KeyRef, VerificationResult};

    #[test]
    fn facade_uses_formspec_receipt_payload_domain() {
        let receipt = VerificationReceipt {
            result: VerificationResult::Verified,
            method: "urn:formspec:sig-method:ed25519-cose-sign1@1".into(),
            method_registry_version: "1.0.0".into(),
            adapter: AdapterInfo {
                id: ADAPTER_ID.into(),
                version: ADAPTER_VERSION.into(),
            },
            key: KeyInfo {
                r#ref: "kid".into(),
                version: None,
                snapshot: None,
            },
            verified_at: "2026-05-17T00:00:00Z".to_string(),
            context: None,
            receipt_bytes: None,
        };

        let payload = canonical_receipt_payload_bytes(&receipt).expect("payload");
        assert!(payload.starts_with(RECEIPT_SIGNED_PAYLOAD_DOMAIN.as_bytes()));
        assert_eq!(payload[RECEIPT_SIGNED_PAYLOAD_DOMAIN.len()], 0);
    }

    #[test]
    fn facade_preserves_formspec_adapter_identity() {
        let verifier = RingVerifier::new();
        let registry = SignatureMethodRegistry {
            version: "1.0.0".into(),
            entries: vec![],
        };
        let receipt = verifier
            .verify(
                &VerifyRequest {
                    signed_bytes: vec![1, 2, 3],
                    signature_bytes: vec![4, 5, 6],
                    method_uri: "urn:formspec:sig-method:unknown@1".into(),
                    key_ref: KeyRef::RawPublicKey(vec![0u8; 32]),
                },
                &registry,
            )
            .expect("unsupported receipt");

        assert_eq!(receipt.adapter.id, ADAPTER_ID);
        assert_eq!(receipt.adapter.version, ADAPTER_VERSION);
        assert!(receipt.is_unsupported());
    }

    #[test]
    fn receipt_signer_uses_formspec_receipt_method_prefix() {
        let (signer, public_key) =
            InProcessReceiptSigner::generate(Some(b"receipt-kid")).expect("signer");
        assert_eq!(signer.signer_id(), IN_PROCESS_RECEIPT_SIGNER_ID);

        let envelope = signer
            .sign_receipt(b"receipt payload")
            .expect("sign receipt");
        let (cose, method_uri) = formspec_signature_cose::decode_cose_sign1_with_method_uri(
            &envelope,
            formspec_signature_cose::FORMSPEC_RECEIPT_METHOD_URI_PREFIX,
        )
        .expect("decode receipt");
        assert_eq!(method_uri, RECEIPT_METHOD_URI);
        assert_eq!(cose.kid(), Some(&b"receipt-kid"[..]));
        assert_eq!(public_key, signer.public_key_bytes());

        assert!(!envelope.is_empty());
    }
}

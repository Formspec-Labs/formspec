use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use std::{fmt, ops::Deref, sync::Arc};
use thiserror::Error;

pub trait ClockPort: Send + Sync + 'static {
    fn now_utc(&self) -> DateTime<Utc>;

    fn now_unix_millis(&self) -> i64 {
        self.now_utc().timestamp_millis()
    }
}

pub type ClockHandle = Arc<dyn ClockPort>;

#[derive(Debug, Clone, Copy, Default)]
pub struct SystemClock;

impl ClockPort for SystemClock {
    fn now_utc(&self) -> DateTime<Utc> {
        Utc::now()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FixedClock {
    now: DateTime<Utc>,
}

impl FixedClock {
    pub fn at_rfc3339(rfc3339: &str) -> Result<Self, chrono::ParseError> {
        let parsed = chrono::DateTime::parse_from_rfc3339(rfc3339)?.with_timezone(&chrono::Utc);
        Ok(Self { now: parsed })
    }
}

impl ClockPort for FixedClock {
    fn now_utc(&self) -> DateTime<Utc> {
        self.now
    }
}

/// Formats a UTC timestamp as second-precision RFC 3339.
pub fn utc_to_rfc3339_seconds(value: DateTime<Utc>) -> String {
    value.to_rfc3339_opts(SecondsFormat::Secs, true)
}

/// Formats a UTC timestamp as millisecond-precision RFC 3339.
pub fn utc_to_rfc3339_millis(value: DateTime<Utc>) -> String {
    value.to_rfc3339_opts(SecondsFormat::Millis, true)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(transparent)]
pub struct SemVer(pub String);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(transparent)]
pub struct Uri(pub String);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(transparent)]
pub struct KidOrThumbprint(pub String);

macro_rules! string_newtype {
    ($type:ident) => {
        impl $type {
            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl From<String> for $type {
            fn from(value: String) -> Self {
                Self(value)
            }
        }

        impl From<&str> for $type {
            fn from(value: &str) -> Self {
                Self(value.to_string())
            }
        }

        impl AsRef<str> for $type {
            fn as_ref(&self) -> &str {
                self.as_str()
            }
        }

        impl Deref for $type {
            type Target = str;

            fn deref(&self) -> &Self::Target {
                self.as_str()
            }
        }

        impl fmt::Display for $type {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str(self.as_str())
            }
        }

        impl PartialEq<&str> for $type {
            fn eq(&self, other: &&str) -> bool {
                self.as_str() == *other
            }
        }

        impl PartialEq<$type> for &str {
            fn eq(&self, other: &$type) -> bool {
                *self == other.as_str()
            }
        }
    };
}

string_newtype!(SemVer);
string_newtype!(Uri);
string_newtype!(KidOrThumbprint);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationReceipt {
    pub result: VerificationResult,
    pub method: Uri,
    pub method_registry_version: SemVer,
    pub adapter: AdapterInfo,
    pub key: KeyInfo,
    pub verified_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<VerificationContext>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub receipt_bytes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum VerificationResult {
    Verified,
    Failed,
    Unsupported,
}

impl fmt::Display for VerificationResult {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Verified => write!(f, "verified"),
            Self::Failed => write!(f, "failed"),
            Self::Unsupported => write!(f, "unsupported"),
        }
    }
}

impl VerificationReceipt {
    /// Returns `true` iff the verdict is [`VerificationResult::Verified`].
    ///
    /// Centralizes the verdict check so callers do not stringly-type the
    /// result (`result.to_string() == "verified"`). The trait contract says
    /// [`Verifier::verify`] returns `Ok(receipt)` for any *reached* verdict
    /// (verified/failed/unsupported); callers MUST distinguish "verified"
    /// from "failed-or-unsupported" — this method is the canonical check.
    pub fn is_verified(&self) -> bool {
        matches!(self.result, VerificationResult::Verified)
    }

    /// Returns `true` iff the verdict is [`VerificationResult::Failed`]
    /// (signature was checked and cryptographically rejected).
    pub fn is_failed(&self) -> bool {
        matches!(self.result, VerificationResult::Failed)
    }

    /// Returns `true` iff the verdict is [`VerificationResult::Unsupported`]
    /// (method not in registry, deprecated, or CBOR malformed — no
    /// cryptographic verification was attempted).
    pub fn is_unsupported(&self) -> bool {
        matches!(self.result, VerificationResult::Unsupported)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterInfo {
    pub id: Uri,
    pub version: SemVer,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyInfo {
    pub r#ref: KidOrThumbprint,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snapshot: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationContext {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub revocation: Option<RevocationContext>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamping: Option<TimestampingContext>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub witness: Option<WitnessContext>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RevocationContext {
    pub kind: String,
    #[serde(rename = "responseHash")]
    pub response_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimestampingContext {
    pub authority: Uri,
    #[serde(rename = "receiptHash")]
    pub receipt_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WitnessContext {
    pub anchor: TrellisAnchorRef,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrellisAnchorRef {
    #[serde(rename = "eventHash")]
    pub event_hash: String,
    #[serde(rename = "ledgerScope")]
    pub ledger_scope: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyRequest {
    pub signed_bytes: Vec<u8>,
    pub signature_bytes: Vec<u8>,
    pub signature_method: Uri,
    pub key_ref: KidOrThumbprint,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignatureMethodRegistry {
    pub version: SemVer,
    pub entries: Vec<RegistryEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryEntry {
    pub id: Uri,
    pub suite: String,
    pub wire: String,
    pub alg: Option<i32>,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deprecation_notice: Option<String>,
}

impl SignatureMethodRegistry {
    pub fn resolve(&self, method: &str) -> Option<&RegistryEntry> {
        self.entries.iter().find(|e| e.id.as_str() == method)
    }

    pub fn current_version(&self) -> &str {
        self.version.as_str()
    }
}

/// Adapter-internal error surface for [`Verifier::verify`].
///
/// **Trait contract (security-critical, see fs-no9r).** `Verifier::verify`
/// returns:
///
/// - `Ok(VerificationReceipt)` for any *reached verdict* —
///   [`VerificationResult::Verified`], [`VerificationResult::Failed`], or
///   [`VerificationResult::Unsupported`]. A `Failed` receipt means
///   "signature was decoded, key was parsed, the crypto primitive said no".
/// - `Err(VerifierError)` ONLY for *adapter-internal* problems — the
///   verifier could not reach a verdict. Examples: malformed key bytes that
///   the adapter cannot import, COSE_Sign1 envelope that cannot be decoded,
///   internal crypto-library failure.
///
/// Collapsing internal errors into `Ok(failed_receipt)` is a security bug:
/// an attacker who finds an adapter-crashing input would otherwise get a
/// false-positive "signature checked and failed" record. Callers MUST treat
/// `Err(_)` as "verdict not reached" and never as "signature is forged".
#[derive(Debug, Error)]
pub enum VerifierError {
    #[error("unsupported method: {method}")]
    MethodUnsupported { method: Uri },
    #[error("verification failed: {reason}")]
    VerificationFailed { reason: String },
    #[error("invalid COSE: {reason}")]
    InvalidCoseEncoding { reason: String },
    #[error("internal error: {reason}")]
    Internal { reason: String },
}

/// Verify a signature against the given request and registry.
///
/// See [`VerifierError`] for the `Ok` vs `Err` contract. Callers checking
/// the verdict SHOULD use [`VerificationReceipt::is_verified`] rather than
/// pattern-matching `VerificationResult::Verified` directly — the helper
/// stays in sync if the enum grows new "verified-with-caveat" variants.
///
/// The registry parameter is not in the original plan §2.4.1 trait signature;
/// it was added because verifiers need method resolution to determine
/// algorithm, key types, and adapter dispatch. The plan will be updated.
pub trait Verifier {
    fn verify(
        &self,
        request: &VerifyRequest,
        registry: &SignatureMethodRegistry,
    ) -> Result<VerificationReceipt, VerifierError>;
}

/// Adapter-internal error surface for [`ReceiptSigner::sign_receipt`].
///
/// Receipt signing is an audit-binding step: if it cannot produce signed
/// bytes the caller MUST surface the failure rather than emitting an
/// unsigned receipt that lies about being signed. The signer port returns
/// errors instead of an `Option<Vec<u8>>` so a misconfigured signing path
/// cannot silently degrade to "verification-only" mode — opt-out at the
/// construction site, not at the call site.
#[derive(Debug, Error)]
pub enum ReceiptSignerError {
    /// The signing primitive itself rejected the payload.
    #[error("receipt signing failed: {reason}")]
    SigningFailed { reason: String },
    /// The signer could not locate or import its key material.
    #[error("signing key unavailable: {reason}")]
    KeyUnavailable { reason: String },
    /// Adapter-internal failure unrelated to the payload (envelope encoding,
    /// I/O against a key service, etc.).
    #[error("internal error: {reason}")]
    Internal { reason: String },
}

/// Signs the canonical receipt-payload bytes for a [`VerificationReceipt`].
///
/// **Contract.**
///
/// - Input is the **canonical, domain-separated bytes** of the receipt's
///   non-signature fields, produced by the calling verifier. The signer
///   does not canonicalize — it just signs. This keeps the port
///   cross-runtime: Rust, TypeScript, and Python adapters all see the same
///   "bytes in, bytes out" shape.
/// - Output is the **COSE_Sign1 envelope bytes** binding the signer's key
///   to the input. Callers store these bytes in
///   [`VerificationReceipt::receipt_bytes`] (base64-encoded by the receipt
///   serializer) so an independent verifier can re-derive the canonical
///   payload from the receipt fields and check the signature.
/// - Implementations MUST be deterministic for the same `(payload, key)`
///   pair when the signature suite is itself deterministic (Ed25519);
///   ECDSA/RSA-PSS signers MAY use fresh randomness per call. Either way,
///   a *correct* verification of the returned bytes under the signer's
///   public key MUST succeed.
/// - [`signer_id`] returns a stable adapter identifier (URN-shaped, e.g.
///   `urn:formspec:receipt-signer:ring-in-process@1`) for telemetry and
///   audit. It is not a key identifier — distinct keys MAY share a signer
///   id.
///
/// Cross-runtime compatibility: only `&[u8]` and `Vec<u8>` cross the trait
/// boundary. Adapters in other runtimes (webcrypto, Trellis-managed key
/// services) implement the same shape.
pub trait ReceiptSigner: Send + Sync {
    /// Signs canonical receipt-payload bytes and returns the COSE_Sign1
    /// envelope bytes.
    ///
    /// # Errors
    ///
    /// Returns [`ReceiptSignerError`] when key material is unavailable, the
    /// crypto primitive rejects the payload, or the envelope cannot be
    /// encoded.
    fn sign_receipt(&self, canonical_payload: &[u8]) -> Result<Vec<u8>, ReceiptSignerError>;

    /// Returns a stable adapter identifier for telemetry / debugging.
    fn signer_id(&self) -> &str;
}

/// Shared handle for a boxed [`ReceiptSigner`] implementation.
pub type ReceiptSignerHandle = Arc<dyn ReceiptSigner>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_verification_receipt_json_roundtrip() {
        let receipt = VerificationReceipt {
            result: VerificationResult::Verified,
            method: "urn:formspec:sig-method:ed25519-cose-sign1@1".into(),
            method_registry_version: "1.0.0".into(),
            adapter: AdapterInfo {
                id: "urn:formspec:adapter:webcrypto@1".into(),
                version: "1.0.0".into(),
            },
            key: KeyInfo {
                r#ref: "did:key:z6MkhaXgB...".into(),
                version: Some("1".to_string()),
                snapshot: None,
            },
            verified_at: "2026-05-08T15:45:00Z".to_string(),
            context: Some(VerificationContext {
                revocation: Some(RevocationContext {
                    kind: "ocsp".to_string(),
                    response_hash: "aGVsbG8=".to_string(),
                }),
                timestamping: Some(TimestampingContext {
                    authority: "https://timestamp.example.gov".into(),
                    receipt_hash: "d29ybGQ=".to_string(),
                }),
                witness: Some(WitnessContext {
                    anchor: TrellisAnchorRef {
                        event_hash: "Zm9vYmFy".to_string(),
                        ledger_scope: "urn:trellis:scope:default".to_string(),
                    },
                }),
            }),
            receipt_bytes: Some("0oRWoQExiQEFQnNpZ25lZA==".to_string()),
        };

        let json = serde_json::to_string(&receipt).expect("serialize");
        let roundtripped: VerificationReceipt = serde_json::from_str(&json).expect("deserialize");

        // re-serialize both and compare to avoid PartialEq requirement
        let json2 = serde_json::to_string(&roundtripped).expect("re-serialize");
        assert_eq!(json, json2);
    }

    #[test]
    fn test_verification_result_display() {
        assert_eq!(VerificationResult::Verified.to_string(), "verified");
        assert_eq!(VerificationResult::Failed.to_string(), "failed");
        assert_eq!(VerificationResult::Unsupported.to_string(), "unsupported");
    }

    #[test]
    fn test_registry_resolve_known() {
        let registry = SignatureMethodRegistry {
            version: "1.0.0".into(),
            entries: vec![RegistryEntry {
                id: "urn:formspec:sig-method:ed25519-cose-sign1@1".into(),
                suite: "ed25519".to_string(),
                wire: "cose-sign1".to_string(),
                alg: Some(-8),
                status: "active".to_string(),
                deprecation_notice: None,
            }],
        };
        let resolved = registry.resolve("urn:formspec:sig-method:ed25519-cose-sign1@1");
        assert!(resolved.is_some());
        assert_eq!(resolved.unwrap().suite, "ed25519");
    }

    #[test]
    fn test_registry_resolve_unknown() {
        let registry = SignatureMethodRegistry {
            version: "1.0.0".into(),
            entries: vec![RegistryEntry {
                id: "urn:formspec:sig-method:ed25519-cose-sign1@1".into(),
                suite: "ed25519".to_string(),
                wire: "cose-sign1".to_string(),
                alg: Some(-8),
                status: "active".to_string(),
                deprecation_notice: None,
            }],
        };
        assert!(registry.resolve("urn:nonexistent").is_none());
    }

    #[test]
    fn test_verifier_error_display() {
        assert_eq!(
            VerifierError::MethodUnsupported {
                method: "urn:unknown".into()
            }
            .to_string(),
            "unsupported method: urn:unknown"
        );
        assert_eq!(
            VerifierError::VerificationFailed {
                reason: "bad signature".to_string()
            }
            .to_string(),
            "verification failed: bad signature"
        );
        assert_eq!(
            VerifierError::InvalidCoseEncoding {
                reason: "malformed CBOR".to_string()
            }
            .to_string(),
            "invalid COSE: malformed CBOR"
        );
        assert_eq!(
            VerifierError::Internal {
                reason: "adapter crashed".to_string()
            }
            .to_string(),
            "internal error: adapter crashed"
        );
    }

    /// Centralizes the verdict check so callers no longer stringly-type
    /// `receipt.result.to_string() == "verified"`. fs-no9r.
    #[test]
    fn is_verified_returns_true_only_for_verified_variant() {
        let mut receipt = VerificationReceipt {
            result: VerificationResult::Verified,
            method: "urn:formspec:sig-method:ed25519-cose-sign1@1".into(),
            method_registry_version: "1.0.0".into(),
            adapter: AdapterInfo {
                id: "urn:formspec:adapter:test@1".into(),
                version: "0.0.0".into(),
            },
            key: KeyInfo {
                r#ref: "k".into(),
                version: None,
                snapshot: None,
            },
            verified_at: "2026-05-16T00:00:00Z".to_string(),
            context: None,
            receipt_bytes: None,
        };
        assert!(receipt.is_verified());
        receipt.result = VerificationResult::Failed;
        assert!(!receipt.is_verified());
        receipt.result = VerificationResult::Unsupported;
        assert!(!receipt.is_verified());
    }

    /// `VerifierError` must implement `std::error::Error` so callers can
    /// `?`-chain it into anyhow / custom error enums (fs-no9r / F-P-5).
    #[test]
    fn verifier_error_is_std_error() {
        fn assert_error<E: std::error::Error>(_: &E) {}
        let err = VerifierError::Internal {
            reason: "adapter crashed".to_string(),
        };
        assert_error(&err);
        // Re-check Display payload to ensure thiserror derivation produced
        // the same surface text the previous hand-rolled impl did.
        assert_eq!(err.to_string(), "internal error: adapter crashed");
    }

    /// `ReceiptSignerError` must implement `std::error::Error` so callers
    /// can `?`-chain it into anyhow / custom error enums alongside
    /// `VerifierError`.
    #[test]
    fn receipt_signer_error_is_std_error() {
        fn assert_error<E: std::error::Error>(_: &E) {}
        let err = ReceiptSignerError::KeyUnavailable {
            reason: "no key bound".to_string(),
        };
        assert_error(&err);
        assert_eq!(err.to_string(), "signing key unavailable: no key bound");
    }

    /// The port must accept Arc'd implementers — RingVerifier holds the
    /// signer behind a [`ReceiptSignerHandle`], and downstream code must
    /// be able to clone the handle across worker tasks.
    #[test]
    fn receipt_signer_handle_is_send_sync_clone() {
        fn assert_send_sync_clone<T: Send + Sync + Clone>(_: &T) {}

        struct NoopSigner;
        impl ReceiptSigner for NoopSigner {
            fn sign_receipt(&self, _: &[u8]) -> Result<Vec<u8>, ReceiptSignerError> {
                Ok(vec![])
            }
            fn signer_id(&self) -> &str {
                "urn:formspec:receipt-signer:noop@1"
            }
        }

        let handle: ReceiptSignerHandle = Arc::new(NoopSigner);
        assert_send_sync_clone(&handle);
        assert_eq!(handle.signer_id(), "urn:formspec:receipt-signer:noop@1");
        assert_eq!(handle.sign_receipt(b"payload").unwrap(), Vec::<u8>::new());
    }

    #[test]
    fn test_verify_request_fields() {
        let req = VerifyRequest {
            signed_bytes: vec![1, 2, 3],
            signature_bytes: vec![4, 5, 6],
            signature_method: "urn:formspec:sig-method:ed25519-cose-sign1@1".into(),
            key_ref: "did:key:z6MkhaXgB...".into(),
        };
        assert_eq!(req.signed_bytes, vec![1, 2, 3]);
        assert_eq!(req.signature_bytes, vec![4, 5, 6]);
        assert_eq!(
            req.signature_method,
            "urn:formspec:sig-method:ed25519-cose-sign1@1"
        );
        assert_eq!(req.key_ref, "did:key:z6MkhaXgB...");
    }
}

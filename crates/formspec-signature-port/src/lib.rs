use serde::{Deserialize, Serialize};
use std::{fmt, ops::Deref};

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

#[derive(Debug)]
pub enum VerifierError {
    MethodUnsupported { method: Uri },
    VerificationFailed { reason: String },
    InvalidCoseEncoding { reason: String },
    Internal { reason: String },
}

impl fmt::Display for VerifierError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MethodUnsupported { method } => write!(f, "unsupported method: {method}"),
            Self::VerificationFailed { reason } => write!(f, "verification failed: {reason}"),
            Self::InvalidCoseEncoding { reason } => write!(f, "invalid COSE: {reason}"),
            Self::Internal { reason } => write!(f, "internal error: {reason}"),
        }
    }
}

/// Verify a signature against the given request and registry.
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

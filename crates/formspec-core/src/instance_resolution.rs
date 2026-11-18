//! Delivered values and evidence shared by Response selection and candidate assembly.

use std::fmt;

#[cfg(feature = "response-selection")]
use integrity_canonical::{DigestAlgorithm, compute_digest};
use serde::{Deserialize, Serialize};
use serde_json::value::RawValue;

/// Lowercase hexadecimal SHA-256 with the Core wire prefix.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(try_from = "String")]
pub struct Sha256Digest(String);

impl Sha256Digest {
    /// Hashes framed bytes using the shared integrity primitive.
    #[cfg(feature = "response-selection")]
    pub(crate) fn hash(bytes: &[u8]) -> Self {
        Self(format!(
            "sha256:{}",
            compute_digest(bytes, DigestAlgorithm::Sha256)
        ))
    }

    /// Returns the digest in its wire format.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl TryFrom<String> for Sha256Digest {
    type Error = &'static str;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        let hex = value
            .strip_prefix("sha256:")
            .ok_or("missing sha256: prefix")?;
        if hex.len() != 64
            || !hex
                .bytes()
                .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
        {
            return Err("expected 64 lowercase hexadecimal digits");
        }
        Ok(Self(value))
    }
}

impl fmt::Display for Sha256Digest {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

/// Identity and digest of the Mapping used to produce the delivered value.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MappingReference {
    /// Declared Mapping URL.
    pub url: String,
    /// Caller-verified digest of the resolved Mapping.
    pub digest: Sha256Digest,
}

/// Evidence identifying one selected Response.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SelectedRecord {
    /// Response id.
    pub response_id: String,
    /// Version of the selected Response's Definition.
    pub definition_version: String,
    /// Handoff hash of a completed Response. Drafts omit this.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_hash: Option<Sha256Digest>,
}

/// An available value together with the evidence needed to keep a pin.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeliveredSelection {
    /// Selected records in selection order.
    pub records: Vec<SelectedRecord>,
    /// The exact JSON value read by the consumer.
    pub value: Box<RawValue>,
    /// The digest of the delivered value.
    pub value_digest: Sha256Digest,
    /// Whether the delivery came from a successful empty match.
    pub none: bool,
    /// Whether this delivery is pinned at open.
    pub pinned: bool,
    /// Identity of the Mapping applied at delivery.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mapping: Option<MappingReference>,
}

//! Wire admission and subject identity hashing for the selector.

use std::collections::BTreeMap;
use std::fmt;

use integrity_canonical::{DigestAlgorithm, compute_digest, domain_separated_canonical_bytes};
use serde::{Deserialize, Deserializer, Serialize, de::Error};
use serde_json::{json, value::RawValue};

use crate::subject_key::SubjectKey;

use super::{SelectionContext, SelectionRecord, select};

const SUBJECT_INTEGER_RANGE_ERROR: &str = "subject key is outside the I-JSON integer range";

impl<'de> Deserialize<'de> for SubjectKey {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let raw = Box::<RawValue>::deserialize(deserializer)?;
        if raw.get().starts_with('"') {
            return serde_json::from_str(raw.get())
                .map(Self::String)
                .map_err(D::Error::custom);
        }
        let value = integer(&raw).map_err(D::Error::custom)?;
        if !Self::is_integer_in_range(&value) {
            return Err(D::Error::custom(SUBJECT_INTEGER_RANGE_ERROR));
        }
        Ok(Self::Integer(value))
    }
}

/// Read a signed offset without rounding.
pub(super) fn deserialize_offset<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<i64>, D::Error> {
    let raw = Box::<RawValue>::deserialize(deserializer)?;
    integer(&raw).map(Some).map_err(D::Error::custom)
}

/// Parse an integral JSON number without rounding, including equivalent decimal spellings.
fn integer(raw: &RawValue) -> Result<i64, String> {
    if let Ok(integer) = raw.get().parse() {
        return Ok(integer);
    }
    let canonical = integrity_canonical::canonical_json_from_bytes(raw.get().as_bytes())?;
    std::str::from_utf8(&canonical)
        .ok()
        .and_then(|value| value.parse().ok())
        .ok_or_else(|| "expected a signed 64-bit JSON integer".to_owned())
}

/// Lowercase hexadecimal SHA-256 with the Core wire prefix.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(try_from = "String")]
pub struct Sha256Digest(String);

impl Sha256Digest {
    /// Hashes framed bytes using the shared integrity primitive.
    pub(super) fn hash(bytes: &[u8]) -> Self {
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

/// Derives the unprefixed filing-unit id from its type and typed keys.
///
/// # Errors
///
/// Returns an error for an out-of-range integer key or a canonical encoding failure.
pub fn subject_id(
    subject_type: &str,
    keys: &BTreeMap<String, SubjectKey>,
) -> Result<String, String> {
    if keys.values().any(
        |key| matches!(key, SubjectKey::Integer(value) if !SubjectKey::is_integer_in_range(value)),
    ) {
        return Err(SUBJECT_INTEGER_RANGE_ERROR.to_owned());
    }
    let bytes = domain_separated_canonical_bytes(
        "formspec.subject.id.v1",
        &json!({ "type": subject_type, "keys": keys }),
    )?;
    Ok(compute_digest(&bytes, DigestAlgorithm::Sha256))
}

/// Derives the subject id from JSON text for the subject keys.
///
/// # Errors
///
/// Returns an error for malformed JSON, untyped keys or a canonical encoding failure.
pub fn subject_id_json(subject_type: &str, keys_json: &str) -> Result<String, String> {
    // The canonical reader refuses repeated keys before serde deserializes the map.
    integrity_canonical::canonical_json_from_bytes(keys_json.as_bytes())?;
    let keys = serde_json::from_str(keys_json)
        .map_err(|error| format!("invalid subject keys: {error}"))?;
    subject_id(subject_type, &keys)
}

/// Runs the shared selector on its JSON wire inputs.
///
/// # Errors
///
/// Returns an error if any of the JSON inputs cannot be decoded or the result cannot
/// be serialized. Valid input with an unavailable resolution returns a JSON outcome.
pub fn select_json(
    records_json: &str,
    selection_json: &str,
    context_json: &str,
) -> Result<String, String> {
    let records: Vec<SelectionRecord> = serde_json::from_str(records_json)
        .map_err(|error| format!("invalid selection records: {error}"))?;
    let selection = serde_json::from_str(selection_json)
        .map_err(|error| format!("invalid Response selection: {error}"))?;
    let context: SelectionContext = serde_json::from_str(context_json)
        .map_err(|error| format!("invalid selection context: {error}"))?;
    serde_json::to_string(&select(&records, &selection, &context))
        .map_err(|error| error.to_string())
}

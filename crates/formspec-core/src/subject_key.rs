//! Typed keys and canonical identity for Formspec filing units.
//!
//! A subject-declaring Definition names its filing unit by a type URI and typed keys
//! (Core §2.1.6). [`subject_id`] derives the unit's `Response.subject.id` from them. Both
//! the respondent runtime and the Response selector use this module, so it compiles
//! without the `response-selection` feature.
// Rust guideline compliant 2026-02-21

use std::collections::BTreeMap;
use std::ops::Neg;

use integrity_canonical::{DigestAlgorithm, compute_digest, domain_separated_canonical_bytes};
use serde::{Deserialize, Deserializer, Serialize, de::Error};
use serde_json::{json, value::RawValue};

/// Refusal text shared by key decoding and [`subject_id`].
const SUBJECT_INTEGER_RANGE_ERROR: &str = "subject key is outside the I-JSON integer range";

/// A filed unit's typed key value.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(untagged)]
pub enum SubjectKey {
    /// Text preserved verbatim.
    String(String),
    /// Signed integer in the I-JSON safe range.
    Integer(i64),
}

impl SubjectKey {
    /// Checks the inclusive I-JSON bounds for an already integral key.
    ///
    /// RFC 7493 §2.2 sets these bounds so browsers preserve key values
    /// exactly. The selector uses integers and the evaluator uses exact decimals.
    #[inline]
    pub fn is_integer_in_range<T>(value: &T) -> bool
    where
        T: Copy + From<i64> + Neg<Output = T> + PartialOrd,
    {
        const MAX_SAFE_INTEGER: i64 = (1 << 53) - 1;
        let max = T::from(MAX_SAFE_INTEGER);
        (-max..=max).contains(value)
    }
}

impl<'de> Deserialize<'de> for SubjectKey {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let raw = Box::<RawValue>::deserialize(deserializer)?;
        if raw.get().starts_with('"') {
            return serde_json::from_str(raw.get())
                .map(Self::String)
                .map_err(D::Error::custom);
        }
        let value = json_integer(&raw).map_err(D::Error::custom)?;
        if !Self::is_integer_in_range(&value) {
            return Err(D::Error::custom(SUBJECT_INTEGER_RANGE_ERROR));
        }
        Ok(Self::Integer(value))
    }
}

/// Parse an integral JSON number without rounding, including equivalent decimal spellings.
pub(crate) fn json_integer(raw: &RawValue) -> Result<i64, String> {
    if let Ok(integer) = raw.get().parse() {
        return Ok(integer);
    }
    let canonical = integrity_canonical::canonical_json_from_bytes(raw.get().as_bytes())?;
    std::str::from_utf8(&canonical)
        .ok()
        .and_then(|value| value.parse().ok())
        .ok_or_else(|| "expected a signed 64-bit JSON integer".to_owned())
}

/// Derives the unprefixed filing-unit id from its type and typed keys.
///
/// The id is the lowercase hex SHA-256 of the `formspec.subject.id.v1` domain-separated
/// canonical JSON of `{type, keys}`, so key order never changes it.
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

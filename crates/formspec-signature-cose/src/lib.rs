// Rust guideline compliant 2026-02-21

//! COSE_Sign1 parsing helpers.
//!
//! This crate keeps COSE wire decoding separate from cryptographic adapter
//! implementations. Adapters provide algorithm-specific key import and
//! primitive verification.

#![forbid(unsafe_code)]

use std::{
    collections::HashSet,
    fmt::{Display, Formatter},
};

/// COSE algorithm protected-header label.
pub const COSE_LABEL_ALG: i128 = 1;
/// COSE key identifier protected-header label.
pub const COSE_LABEL_KID: i128 = 4;
/// COSE_Sign1 CBOR tag.
pub const COSE_SIGN1_TAG: u64 = 18;

/// Decoded COSE_Sign1 envelope.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CoseSign1 {
    protected_header: Vec<u8>,
    alg: Option<i32>,
    kid: Option<Vec<u8>>,
    payload: Option<Vec<u8>>,
    signature: Vec<u8>,
}

impl CoseSign1 {
    /// Returns the protected-header byte string.
    #[must_use]
    pub fn protected_header(&self) -> &[u8] {
        &self.protected_header
    }

    /// Returns the COSE algorithm value, if present.
    #[must_use]
    pub fn alg(&self) -> Option<i32> {
        self.alg
    }

    /// Returns the COSE key identifier, if present.
    #[must_use]
    pub fn kid(&self) -> Option<&[u8]> {
        self.kid.as_deref()
    }

    /// Returns the embedded payload, if the Sign1 is not detached.
    #[must_use]
    pub fn payload(&self) -> Option<&[u8]> {
        self.payload.as_deref()
    }

    /// Returns the primitive signature bytes.
    #[must_use]
    pub fn signature(&self) -> &[u8] {
        &self.signature
    }

    /// Resolves the payload used by RFC 9052 Sig_structure construction.
    ///
    /// Detached Sign1 envelopes use `detached_payload`. Embedded-payload
    /// envelopes are accepted only if the embedded bytes exactly match the
    /// adapter-provided payload, preventing callers from accidentally verifying
    /// bytes different from the application-level signed payload.
    ///
    /// # Errors
    /// Returns an error when an embedded payload differs from `detached_payload`.
    pub fn resolve_payload<'a>(
        &'a self,
        detached_payload: &'a [u8],
    ) -> Result<&'a [u8], CoseError> {
        match self.payload() {
            Some(payload) if payload == detached_payload => Ok(payload),
            Some(_) => Err(CoseError::new(
                "embedded COSE payload does not match supplied signed bytes",
            )),
            None => Ok(detached_payload),
        }
    }
}

/// COSE decode error.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CoseError {
    message: String,
}

impl CoseError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl Display for CoseError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for CoseError {}

/// Decodes one tagged COSE_Sign1 envelope.
///
/// # Errors
/// Returns an error when bytes are not CBOR tag 18 with the COSE_Sign1
/// four-field body.
pub fn decode_cose_sign1(bytes: &[u8]) -> Result<CoseSign1, CoseError> {
    let value: ciborium::Value = ciborium::from_reader(bytes)
        .map_err(|error| CoseError::new(format!("failed to decode CBOR: {error}")))?;
    decode_cose_sign1_value(&value)
}

fn decode_cose_sign1_value(value: &ciborium::Value) -> Result<CoseSign1, CoseError> {
    let body = match value {
        ciborium::Value::Tag(COSE_SIGN1_TAG, inner) => inner,
        ciborium::Value::Tag(tag, _) => {
            return Err(CoseError::new(format!(
                "unexpected COSE tag {tag}; expected {COSE_SIGN1_TAG}"
            )));
        }
        _ => return Err(CoseError::new("value is not tagged COSE_Sign1")),
    };
    let items = body
        .as_array()
        .ok_or_else(|| CoseError::new("COSE_Sign1 body is not an array"))?;
    if items.len() != 4 {
        return Err(CoseError::new("COSE_Sign1 body must have four fields"));
    }

    let protected_header = items[0]
        .as_bytes()
        .cloned()
        .ok_or_else(|| CoseError::new("protected header is not a byte string"))?;
    let protected_value: ciborium::Value = ciborium::from_reader(protected_header.as_slice())
        .map_err(|error| CoseError::new(format!("failed to decode protected header: {error}")))?;
    let protected_map = protected_value
        .as_map()
        .ok_or_else(|| CoseError::new("protected header does not decode to a map"))?;
    reject_duplicate_integer_labels(protected_map)?;
    let alg = integer_label_i32(protected_map, COSE_LABEL_ALG)?;
    let kid = integer_label_bytes(protected_map, COSE_LABEL_KID)?;

    match &items[1] {
        ciborium::Value::Map(entries) if entries.is_empty() => {}
        ciborium::Value::Map(_) => {
            return Err(CoseError::new(
                "unprotected header map must be empty for Formspec signatures",
            ));
        }
        _ => return Err(CoseError::new("unprotected header is not a map")),
    }

    let payload = match &items[2] {
        ciborium::Value::Bytes(bytes) => Some(bytes.clone()),
        ciborium::Value::Null => None,
        _ => return Err(CoseError::new("payload is neither bytes nor null")),
    };
    let signature = items[3]
        .as_bytes()
        .cloned()
        .ok_or_else(|| CoseError::new("signature is not a byte string"))?;

    Ok(CoseSign1 {
        protected_header,
        alg,
        kid,
        payload,
        signature,
    })
}

fn integer_label_i32(
    map: &[(ciborium::Value, ciborium::Value)],
    label: i128,
) -> Result<Option<i32>, CoseError> {
    let Some(value) = integer_label_value(map, label) else {
        return Ok(None);
    };
    let integer = value
        .as_integer()
        .map(i128::from)
        .ok_or_else(|| CoseError::new(format!("COSE label {label} is not an integer")))?;
    i32::try_from(integer)
        .map(Some)
        .map_err(|_| CoseError::new(format!("COSE label {label} is outside i32 range")))
}

fn reject_duplicate_integer_labels(
    map: &[(ciborium::Value, ciborium::Value)],
) -> Result<(), CoseError> {
    let mut seen = HashSet::new();
    for (key, _) in map {
        let Some(integer) = key.as_integer().map(i128::from) else {
            continue;
        };
        if !seen.insert(integer) {
            return Err(CoseError::new(format!(
                "duplicate protected-header label {integer}"
            )));
        }
    }
    Ok(())
}

fn integer_label_bytes(
    map: &[(ciborium::Value, ciborium::Value)],
    label: i128,
) -> Result<Option<Vec<u8>>, CoseError> {
    integer_label_value(map, label)
        .map(|value| {
            value
                .as_bytes()
                .cloned()
                .ok_or_else(|| CoseError::new(format!("COSE label {label} is not bytes")))
        })
        .transpose()
}

fn integer_label_value(
    map: &[(ciborium::Value, ciborium::Value)],
    label: i128,
) -> Option<&ciborium::Value> {
    map.iter()
        .find(|(key, _)| {
            key.as_integer()
                .is_some_and(|integer| i128::from(integer) == label)
        })
        .map(|(_, value)| value)
}

/// Builds the RFC 9052 Sig_structure for COSE_Sign1 verification.
#[must_use]
pub fn sig_structure_bytes(protected_header: &[u8], payload: &[u8]) -> Vec<u8> {
    let mut bytes = Vec::new();
    bytes.push(0x84);
    bytes.extend_from_slice(&encode_tstr("Signature1"));
    bytes.extend_from_slice(&encode_bstr(protected_header));
    bytes.push(0x40);
    bytes.extend_from_slice(&encode_bstr(payload));
    bytes
}

/// Builds a tagged COSE_Sign1 envelope.
#[must_use]
pub fn encode_cose_sign1(
    protected_header: &[u8],
    payload: Option<&[u8]>,
    signature: &[u8],
) -> Vec<u8> {
    let mut bytes = Vec::new();
    bytes.push(0xd2);
    bytes.push(0x84);
    bytes.extend_from_slice(&encode_bstr(protected_header));
    bytes.push(0xa0);
    match payload {
        Some(payload) => bytes.extend_from_slice(&encode_bstr(payload)),
        None => bytes.push(0xf6),
    }
    bytes.extend_from_slice(&encode_bstr(signature));
    bytes
}

/// Builds a protected-header byte string for common Formspec tests/adapters.
#[must_use]
pub fn protected_header_bytes(alg: i32, kid: Option<&[u8]>) -> Vec<u8> {
    let pair_count = if kid.is_some() { 2 } else { 1 };
    let mut bytes = Vec::new();
    bytes.extend_from_slice(&encode_major_len(5, pair_count));
    bytes.extend_from_slice(&encode_i128(COSE_LABEL_ALG));
    bytes.extend_from_slice(&encode_i128(i128::from(alg)));
    if let Some(kid) = kid {
        bytes.extend_from_slice(&encode_i128(COSE_LABEL_KID));
        bytes.extend_from_slice(&encode_bstr(kid));
    }
    bytes
}

fn encode_tstr(text: &str) -> Vec<u8> {
    let mut encoded = encode_major_len(3, text.len());
    encoded.extend_from_slice(text.as_bytes());
    encoded
}

fn encode_bstr(bytes: &[u8]) -> Vec<u8> {
    let mut encoded = encode_major_len(2, bytes.len());
    encoded.extend_from_slice(bytes);
    encoded
}

fn encode_i128(value: i128) -> Vec<u8> {
    if value >= 0 {
        encode_major_len(0, value as usize)
    } else {
        encode_major_len(1, (-1 - value) as usize)
    }
}

fn encode_major_len(major: u8, value: usize) -> Vec<u8> {
    let header = major << 5;
    match value {
        0..=23 => vec![header | value as u8],
        24..=0xff => vec![header | 24, value as u8],
        0x100..=0xffff => {
            let mut encoded = vec![header | 25];
            encoded.extend_from_slice(&(value as u16).to_be_bytes());
            encoded
        }
        0x1_0000..=0xffff_ffff => {
            let mut encoded = vec![header | 26];
            encoded.extend_from_slice(&(value as u32).to_be_bytes());
            encoded
        }
        _ => {
            let mut encoded = vec![header | 27];
            encoded.extend_from_slice(&(value as u64).to_be_bytes());
            encoded
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_detached_cose_sign1() {
        let protected = protected_header_bytes(-8, Some(b"kid-1"));
        let signature = vec![7u8; 64];
        let encoded = encode_cose_sign1(&protected, None, &signature);

        let decoded = decode_cose_sign1(&encoded).expect("decode");
        assert_eq!(decoded.protected_header(), protected.as_slice());
        assert_eq!(decoded.alg(), Some(-8));
        assert_eq!(decoded.kid(), Some(&b"kid-1"[..]));
        assert_eq!(decoded.payload(), None);
        assert_eq!(decoded.signature(), signature.as_slice());
        assert_eq!(
            decoded.resolve_payload(b"payload").expect("payload"),
            b"payload"
        );
    }

    #[test]
    fn rejects_embedded_payload_mismatch() {
        let protected = protected_header_bytes(-8, None);
        let encoded = encode_cose_sign1(&protected, Some(b"inside"), &[1, 2, 3]);
        let decoded = decode_cose_sign1(&encoded).expect("decode");
        let error = decoded.resolve_payload(b"outside").unwrap_err();
        assert!(
            error
                .to_string()
                .contains("embedded COSE payload does not match")
        );
    }

    #[test]
    fn rejects_duplicate_protected_header_label() {
        let protected = [0xa2, 0x01, 0x27, 0x01, 0x26];
        let bytes = encode_cose_sign1(&protected, None, &[4, 5, 6]);
        let err = decode_cose_sign1(&bytes).expect_err("duplicate labels must reject");
        assert!(
            err.to_string().contains("duplicate protected-header label"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn sig_structure_matches_rfc_shape() {
        let bytes = sig_structure_bytes(&[0xa1, 0x01, 0x27], b"abc");
        assert_eq!(
            bytes,
            vec![
                0x84, 0x6a, b'S', b'i', b'g', b'n', b'a', b't', b'u', b'r', b'e', b'1', 0x43, 0xa1,
                0x01, 0x27, 0x40, 0x43, b'a', b'b', b'c',
            ]
        );
    }
}

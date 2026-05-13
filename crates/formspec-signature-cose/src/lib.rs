// Rust guideline compliant 2026-02-21

//! Formspec COSE_Sign1 compatibility helpers.
//!
//! The shared COSE implementation lives in `integrity-cose`. This crate keeps
//! the existing Formspec crate name and protected-header helper signature while
//! re-exporting the common implementation.

#![forbid(unsafe_code)]

use std::fmt::{Display, Formatter};

pub use integrity_cose::{
    COSE_LABEL_ALG, COSE_LABEL_KID, COSE_LABEL_PROFILE_ID, COSE_SIGN1_TAG, CoseError, CoseSign1,
    decode_cose_sign1, decode_cose_sign1_array, decode_cose_sign1_value, encode_cose_sign1,
    sig_structure_bytes,
};
pub use integrity_verify::FORMSPEC_PROFILE_ID;

/// Formspec COSE profile decode failure.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum FormspecCoseError {
    /// The underlying COSE envelope did not decode.
    Decode(String),
    /// The protected header omitted the `profile_id` label.
    MissingProfileId,
    /// The protected header carried a non-Formspec profile value.
    WrongProfileId { expected: u64, got: u64 },
}

impl Display for FormspecCoseError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Decode(message) => write!(f, "COSE decode failed: {message}"),
            Self::MissingProfileId => write!(
                f,
                "missing Formspec profile_id protected header (label {COSE_LABEL_PROFILE_ID})"
            ),
            Self::WrongProfileId { expected, got } => {
                write!(
                    f,
                    "wrong Formspec profile_id: expected {expected}, got {got}"
                )
            }
        }
    }
}

impl std::error::Error for FormspecCoseError {}

/// Builds a protected-header byte string for Formspec signature adapters.
#[must_use]
pub fn protected_header_bytes(alg: i32, kid: Option<&[u8]>) -> Vec<u8> {
    integrity_cose::protected_header_bytes_for_alg_with_profile_id(
        i128::from(alg),
        kid,
        FORMSPEC_PROFILE_ID,
    )
}

/// Decodes a Formspec COSE_Sign1 envelope and requires profile dispatch.
///
/// # Errors
/// Returns an error when COSE decode fails, `profile_id` is absent, or the
/// profile value is not [`FORMSPEC_PROFILE_ID`].
pub fn decode_cose_sign1_with_profile_id(bytes: &[u8]) -> Result<CoseSign1, FormspecCoseError> {
    let cose =
        decode_cose_sign1(bytes).map_err(|error| FormspecCoseError::Decode(error.to_string()))?;
    match cose.profile_id() {
        Some(FORMSPEC_PROFILE_ID) => Ok(cose),
        Some(got) => Err(FormspecCoseError::WrongProfileId {
            expected: FORMSPEC_PROFILE_ID,
            got,
        }),
        None => Err(FormspecCoseError::MissingProfileId),
    }
}

/// Extracts the Formspec profile identifier from a COSE_Sign1 envelope.
///
/// # Errors
/// Returns an error under the same conditions as
/// [`decode_cose_sign1_with_profile_id`].
pub fn extract_profile_id(bytes: &[u8]) -> Result<u64, FormspecCoseError> {
    decode_cose_sign1_with_profile_id(bytes).map(|cose| {
        cose.profile_id()
            .expect("decode_cose_sign1_with_profile_id guarantees profile_id")
    })
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
        assert_eq!(decoded.profile_id(), Some(FORMSPEC_PROFILE_ID));
        assert_eq!(decoded.payload(), None);
        assert_eq!(decoded.signature(), signature.as_slice());
        assert_eq!(
            decoded.resolve_payload(Some(b"payload")).expect("payload"),
            b"payload"
        );
    }

    #[test]
    fn rejects_embedded_payload_mismatch() {
        let protected = protected_header_bytes(-8, None);
        let encoded = encode_cose_sign1(&protected, Some(b"inside"), &[1, 2, 3]);
        let decoded = decode_cose_sign1_with_profile_id(&encoded).expect("decode");
        let error = decoded.resolve_payload(Some(b"outside")).unwrap_err();
        assert!(
            error
                .to_string()
                .contains("embedded COSE payload does not match")
        );
    }

    #[test]
    fn protected_header_emits_formspec_profile_id() {
        let protected = protected_header_bytes(-8, Some(&[0xAA; 16]));
        let encoded = encode_cose_sign1(&protected, Some(b"payload"), &[0x01; 64]);

        let profile_id = extract_profile_id(&encoded).expect("extract profile_id");

        assert_eq!(profile_id, FORMSPEC_PROFILE_ID);
    }

    #[test]
    fn decode_rejects_cose_sign1_without_profile_id() {
        let protected = integrity_cose::protected_header_bytes_for_alg(-8, Some(&[0xAA; 16]));
        let encoded = encode_cose_sign1(&protected, Some(b"payload"), &[0x01; 64]);

        let error = decode_cose_sign1_with_profile_id(&encoded).unwrap_err();

        assert_eq!(error, FormspecCoseError::MissingProfileId);
    }

    #[test]
    fn decode_rejects_wrong_profile_id() {
        let protected =
            integrity_cose::protected_header_bytes_for_alg_with_profile_id(-8, None, 99);
        let encoded = encode_cose_sign1(&protected, Some(b"payload"), &[0x01; 64]);

        let error = decode_cose_sign1_with_profile_id(&encoded).unwrap_err();

        assert_eq!(
            error,
            FormspecCoseError::WrongProfileId {
                expected: FORMSPEC_PROFILE_ID,
                got: 99,
            }
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

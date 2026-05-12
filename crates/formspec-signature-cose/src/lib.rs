// Rust guideline compliant 2026-02-21

//! Formspec COSE_Sign1 compatibility helpers.
//!
//! The shared COSE implementation lives in `integrity-cose`. This crate keeps
//! the existing Formspec crate name and protected-header helper signature while
//! re-exporting the common implementation.

#![forbid(unsafe_code)]

pub use integrity_cose::{
    COSE_LABEL_ALG, COSE_LABEL_KID, COSE_SIGN1_TAG, CoseError, CoseSign1, decode_cose_sign1,
    decode_cose_sign1_array, decode_cose_sign1_value, encode_cose_sign1, sig_structure_bytes,
};

/// Builds a protected-header byte string for Formspec signature adapters.
#[must_use]
pub fn protected_header_bytes(alg: i32, kid: Option<&[u8]>) -> Vec<u8> {
    integrity_cose::protected_header_bytes_for_alg(i128::from(alg), kid)
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
            decoded.resolve_payload(Some(b"payload")).expect("payload"),
            b"payload"
        );
    }

    #[test]
    fn rejects_embedded_payload_mismatch() {
        let protected = protected_header_bytes(-8, None);
        let encoded = encode_cose_sign1(&protected, Some(b"inside"), &[1, 2, 3]);
        let decoded = decode_cose_sign1(&encoded).expect("decode");
        let error = decoded.resolve_payload(Some(b"outside")).unwrap_err();
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

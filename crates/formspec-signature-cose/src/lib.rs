// Rust guideline compliant 2026-02-21

//! Formspec COSE_Sign1 compatibility helpers.
//!
//! The shared COSE implementation lives in `integrity-cose`. This crate keeps
//! the existing Formspec crate name and helper signatures while re-exporting
//! the common implementation, plus the post-ADR-0109 `method_uri` dispatch
//! surface for the consumer detached-signature envelope shape (MAP_3 with
//! `method_uri` at COSE label `-65540`).

#![forbid(unsafe_code)]

use std::fmt::{Display, Formatter};

pub use integrity_cose::{
    COSE_LABEL_ALG, COSE_LABEL_KID, COSE_LABEL_METHOD_URI, COSE_SIGN1_TAG, CoseError, CoseSign1,
    ProtectedHeader, decode_cose_sign1, decode_cose_sign1_array, decode_cose_sign1_value,
    decode_protected_header, detached_signature_protected_header, encode_cose_sign1,
    sig_structure_bytes,
};

/// Formspec response-signing URI prefix (`urn:formspec:sig-method:`).
///
/// Method URIs under this prefix identify response-signing methods registered
/// in `formspec/specs/registry/signature-method-registry.md`. Distinct from
/// the receipt-signing prefix; cross-domain reuse is forbidden by ADR 0111's
/// threat model.
pub const FORMSPEC_SIG_METHOD_URI_PREFIX: &str = "urn:formspec:sig-method:";

/// Formspec receipt-signing URI prefix (`urn:formspec:receipt-method:`).
///
/// Method URIs under this prefix identify receipt-signing methods registered
/// per ADR 0111. The preimage uses `RECEIPT_SIGNED_PAYLOAD_DOMAIN`, distinct
/// from response-signing — these subspaces MUST NOT overlap.
pub const FORMSPEC_RECEIPT_METHOD_URI_PREFIX: &str = "urn:formspec:receipt-method:";

/// Formspec COSE profile decode failure.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum FormspecCoseError {
    /// The underlying COSE envelope did not decode.
    Decode(String),
    /// The protected header omitted the `method_uri` label.
    MissingMethodUri,
    /// The protected header carried a method URI outside the expected prefix.
    WrongMethodUriPrefix {
        /// Prefix the caller expected (e.g. `urn:formspec:sig-method:`).
        expected_prefix: &'static str,
        /// Method URI the envelope carried.
        got: String,
    },
}

impl Display for FormspecCoseError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Decode(message) => write!(f, "COSE decode failed: {message}"),
            Self::MissingMethodUri => write!(
                f,
                "missing Formspec method_uri protected header (label {COSE_LABEL_METHOD_URI})"
            ),
            Self::WrongMethodUriPrefix {
                expected_prefix,
                got,
            } => {
                write!(
                    f,
                    "method_uri {got:?} does not match expected prefix {expected_prefix:?}"
                )
            }
        }
    }
}

impl std::error::Error for FormspecCoseError {}

/// Builds a Formspec consumer detached-signature protected header (ADR 0109).
///
/// Emits a MAP_3 with `alg`, `kid`, and `method_uri` at COSE label `-65540`.
/// `method_uri` MUST start with [`FORMSPEC_SIG_METHOD_URI_PREFIX`] for response
/// signatures or [`FORMSPEC_RECEIPT_METHOD_URI_PREFIX`] for receipts; this
/// helper does not enforce the prefix (callers select which subspace they
/// emit) but the verifier rejects values outside the expected prefix.
#[must_use]
pub fn protected_header_bytes(alg: i32, kid: &[u8], method_uri: &str) -> Vec<u8> {
    detached_signature_protected_header(alg, kid, method_uri)
}

/// Decodes a Formspec COSE_Sign1 envelope and validates the `method_uri` prefix.
///
/// Reads the COSE envelope, extracts `method_uri` from the protected header,
/// and rejects unless the value starts with `expected_prefix` (typically
/// [`FORMSPEC_SIG_METHOD_URI_PREFIX`] or [`FORMSPEC_RECEIPT_METHOD_URI_PREFIX`]).
///
/// # Errors
/// Returns [`FormspecCoseError::Decode`] when COSE decoding fails,
/// [`FormspecCoseError::MissingMethodUri`] when the protected header omits the
/// label, or [`FormspecCoseError::WrongMethodUriPrefix`] when the value does
/// not start with `expected_prefix`.
pub fn decode_cose_sign1_with_method_uri(
    bytes: &[u8],
    expected_prefix: &'static str,
) -> Result<(CoseSign1, String), FormspecCoseError> {
    let cose =
        decode_cose_sign1(bytes).map_err(|error| FormspecCoseError::Decode(error.to_string()))?;
    let header = decode_protected_header(cose.protected_header())
        .map_err(|error| FormspecCoseError::Decode(error.to_string()))?;
    match header.method_uri {
        Some(method_uri) if method_uri.starts_with(expected_prefix) => Ok((cose, method_uri)),
        Some(got) => Err(FormspecCoseError::WrongMethodUriPrefix {
            expected_prefix,
            got,
        }),
        None => Err(FormspecCoseError::MissingMethodUri),
    }
}

/// Extracts the Formspec method URI from a COSE_Sign1 envelope.
///
/// Returns the `method_uri` value when present and prefixed with
/// `expected_prefix`. Use this for routing / inspection paths that need the
/// URI value (e.g. to dispatch to a specific adapter by exact-value lookup).
///
/// # Errors
/// Returns an error under the same conditions as
/// [`decode_cose_sign1_with_method_uri`].
pub fn extract_method_uri(
    bytes: &[u8],
    expected_prefix: &'static str,
) -> Result<String, FormspecCoseError> {
    decode_cose_sign1_with_method_uri(bytes, expected_prefix).map(|(_, method_uri)| method_uri)
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    const SIG_METHOD_ED25519: &str = "urn:formspec:sig-method:ed25519-cose-sign1@1";
    const RECEIPT_METHOD_ED25519: &str = "urn:formspec:receipt-method:ed25519-cose-sign1@1";

    #[test]
    fn decodes_detached_cose_sign1() {
        let protected = protected_header_bytes(-8, &[0x11; 16], SIG_METHOD_ED25519);
        let signature = vec![7u8; 64];
        let encoded = encode_cose_sign1(&protected, None, &signature);

        let decoded = decode_cose_sign1(&encoded).expect("decode");
        assert_eq!(decoded.protected_header(), protected.as_slice());
        assert_eq!(decoded.alg(), Some(-8));
        assert_eq!(decoded.kid(), Some(&[0x11u8; 16][..]));
        assert_eq!(decoded.payload(), None);
        assert_eq!(decoded.signature(), signature.as_slice());
        assert_eq!(
            decoded.resolve_payload(Some(b"payload")).expect("payload"),
            b"payload"
        );
    }

    #[test]
    fn rejects_embedded_payload_mismatch() {
        let protected = protected_header_bytes(-8, &[0x22; 16], SIG_METHOD_ED25519);
        let encoded = encode_cose_sign1(&protected, Some(b"inside"), &[1, 2, 3]);
        let (cose, _) = decode_cose_sign1_with_method_uri(&encoded, FORMSPEC_SIG_METHOD_URI_PREFIX)
            .expect("decode");
        let error = cose.resolve_payload(Some(b"outside")).unwrap_err();
        assert!(
            error
                .to_string()
                .contains("embedded COSE payload does not match")
        );
    }

    #[test]
    fn protected_header_emits_sig_method_uri() {
        let protected = protected_header_bytes(-8, &[0xAA; 16], SIG_METHOD_ED25519);
        let encoded = encode_cose_sign1(&protected, Some(b"payload"), &[0x01; 64]);

        let method_uri =
            extract_method_uri(&encoded, FORMSPEC_SIG_METHOD_URI_PREFIX).expect("extract");

        assert_eq!(method_uri, SIG_METHOD_ED25519);
    }

    #[test]
    fn protected_header_emits_receipt_method_uri() {
        let protected = protected_header_bytes(-8, &[0xAA; 16], RECEIPT_METHOD_ED25519);
        let encoded = encode_cose_sign1(&protected, Some(b"payload"), &[0x01; 64]);

        let method_uri =
            extract_method_uri(&encoded, FORMSPEC_RECEIPT_METHOD_URI_PREFIX).expect("extract");

        assert_eq!(method_uri, RECEIPT_METHOD_ED25519);
    }

    #[test]
    fn decode_rejects_cose_sign1_without_method_uri() {
        // Build a legacy alg-only header (no method_uri) and confirm decode rejects.
        let protected = integrity_cose::protected_header_bytes_for_alg(-8, Some(&[0xAA; 16]));
        let encoded = encode_cose_sign1(&protected, Some(b"payload"), &[0x01; 64]);

        let error = decode_cose_sign1_with_method_uri(&encoded, FORMSPEC_SIG_METHOD_URI_PREFIX)
            .unwrap_err();

        assert_eq!(error, FormspecCoseError::MissingMethodUri);
    }

    #[test]
    fn decode_rejects_wrong_method_uri_prefix() {
        // Build a header with a sig-method URI but ask the verifier to expect
        // the receipt-method prefix — cross-domain reuse must reject.
        let protected = protected_header_bytes(-8, &[0xAA; 16], SIG_METHOD_ED25519);
        let encoded = encode_cose_sign1(&protected, Some(b"payload"), &[0x01; 64]);

        let error = decode_cose_sign1_with_method_uri(&encoded, FORMSPEC_RECEIPT_METHOD_URI_PREFIX)
            .unwrap_err();

        match error {
            FormspecCoseError::WrongMethodUriPrefix {
                expected_prefix,
                got,
            } => {
                assert_eq!(expected_prefix, FORMSPEC_RECEIPT_METHOD_URI_PREFIX);
                assert_eq!(got, SIG_METHOD_ED25519);
            }
            other => panic!("unexpected error: {other}"),
        }
    }

    #[test]
    fn decode_rejects_receipt_uri_when_response_signing_expected() {
        // Inverse cross-domain check: receipt envelope routed through the
        // response-signing path must reject.
        let protected = protected_header_bytes(-8, &[0xAA; 16], RECEIPT_METHOD_ED25519);
        let encoded = encode_cose_sign1(&protected, Some(b"payload"), &[0x01; 64]);

        let error = decode_cose_sign1_with_method_uri(&encoded, FORMSPEC_SIG_METHOD_URI_PREFIX)
            .unwrap_err();

        match error {
            FormspecCoseError::WrongMethodUriPrefix {
                expected_prefix,
                got,
            } => {
                assert_eq!(expected_prefix, FORMSPEC_SIG_METHOD_URI_PREFIX);
                assert_eq!(got, RECEIPT_METHOD_ED25519);
            }
            other => panic!("unexpected error: {other}"),
        }
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

    fn hex_to_bytes(hex: &str) -> Vec<u8> {
        assert_eq!(hex.len() % 2, 0, "fixture hex must have even length");
        (0..hex.len())
            .step_by(2)
            .map(|offset| u8::from_str_radix(&hex[offset..offset + 2], 16).expect("fixture hex"))
            .collect()
    }

    #[test]
    fn method_uri_rejection_fixtures_decode_with_expected_reason() {
        let fixture_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("tests")
            .join("fixtures")
            .join("signature-method-uri-fail-closed");

        for fixture_name in [
            "unknown-exact.json",
            "unknown-prefix.json",
            "receipt-on-response.json",
            "sig-on-receipt.json",
        ] {
            let fixture_path = fixture_dir.join(fixture_name);
            let fixture: serde_json::Value = serde_json::from_slice(
                &std::fs::read(&fixture_path)
                    .unwrap_or_else(|error| panic!("read fixture {fixture_path:?}: {error}")),
            )
            .expect("fixture json");
            let method_uri = fixture["methodUri"].as_str().expect("methodUri");
            let expected_prefix = match fixture["expectedPrefix"].as_str().expect("expectedPrefix")
            {
                FORMSPEC_SIG_METHOD_URI_PREFIX => FORMSPEC_SIG_METHOD_URI_PREFIX,
                FORMSPEC_RECEIPT_METHOD_URI_PREFIX => FORMSPEC_RECEIPT_METHOD_URI_PREFIX,
                other => panic!("unsupported expectedPrefix in {fixture_name}: {other}"),
            };
            let expected_reason = fixture["expectedReason"].as_str().expect("expectedReason");
            let protected = protected_header_bytes(-8, &[0xAA; 16], method_uri);
            assert_eq!(
                protected,
                hex_to_bytes(
                    fixture["protectedHeaderHex"]
                        .as_str()
                        .expect("protectedHeaderHex")
                ),
                "{fixture_name} protected header bytes"
            );
            let bytes = hex_to_bytes(
                fixture["signatureBytesCoseSign1Hex"]
                    .as_str()
                    .expect("signatureBytesCoseSign1Hex"),
            );
            assert_eq!(
                bytes,
                encode_cose_sign1(&protected, None, &[0u8; 64]),
                "{fixture_name} COSE_Sign1 bytes"
            );

            let actual = match decode_cose_sign1_with_method_uri(&bytes, expected_prefix) {
                Ok((_, decoded_uri)) if decoded_uri == method_uri => "accepted_by_prefix_gate",
                Ok((_, decoded_uri)) => panic!(
                    "{fixture_name} decoded unexpected method_uri {decoded_uri:?}; expected {method_uri:?}"
                ),
                Err(FormspecCoseError::WrongMethodUriPrefix { .. }) => "wrong_method_uri_prefix",
                Err(FormspecCoseError::MissingMethodUri) => "missing_method_uri",
                Err(FormspecCoseError::Decode(error)) => {
                    panic!("{fixture_name} failed fixture COSE decode: {error}")
                }
            };

            match expected_reason {
                "method_unsupported" => assert_eq!(actual, "accepted_by_prefix_gate"),
                "wrong_method_uri_prefix" => assert_eq!(actual, "wrong_method_uri_prefix"),
                other => panic!("unsupported expectedReason in {fixture_name}: {other}"),
            }
        }
    }

    proptest! {
        #[test]
        fn wrong_method_uri_prefix_rejects_before_signature_verification(
            suffix in "[a-z0-9][a-z0-9._@-]{0,48}"
        ) {
            let method_uri = format!("urn:example:sig-method:{suffix}");
            let protected = protected_header_bytes(-8, &[0xAA; 16], &method_uri);
            let encoded = encode_cose_sign1(&protected, Some(b"payload"), &[0x01; 64]);

            let error = decode_cose_sign1_with_method_uri(
                &encoded,
                FORMSPEC_SIG_METHOD_URI_PREFIX,
            )
            .expect_err("wrong prefix must reject");

            prop_assert_eq!(
                error,
                FormspecCoseError::WrongMethodUriPrefix {
                    expected_prefix: FORMSPEC_SIG_METHOD_URI_PREFIX,
                    got: method_uri,
                }
            );
        }

        #[test]
        fn receipt_method_uri_on_response_path_rejects_before_signature_verification(
            suffix in "[a-z0-9][a-z0-9._@-]{0,48}"
        ) {
            let method_uri = format!("{FORMSPEC_RECEIPT_METHOD_URI_PREFIX}{suffix}");
            let protected = protected_header_bytes(-8, &[0xAA; 16], &method_uri);
            let encoded = encode_cose_sign1(&protected, Some(b"payload"), &[0x01; 64]);

            let error = decode_cose_sign1_with_method_uri(
                &encoded,
                FORMSPEC_SIG_METHOD_URI_PREFIX,
            )
            .expect_err("receipt method routed through response path must reject");

            prop_assert_eq!(
                error,
                FormspecCoseError::WrongMethodUriPrefix {
                    expected_prefix: FORMSPEC_SIG_METHOD_URI_PREFIX,
                    got: method_uri,
                }
            );
        }

        #[test]
        fn sig_method_uri_on_receipt_path_rejects_before_signature_verification(
            suffix in "[a-z0-9][a-z0-9._@-]{0,48}"
        ) {
            let method_uri = format!("{FORMSPEC_SIG_METHOD_URI_PREFIX}{suffix}");
            let protected = protected_header_bytes(-8, &[0xAA; 16], &method_uri);
            let encoded = encode_cose_sign1(&protected, Some(b"payload"), &[0x01; 64]);

            let error = decode_cose_sign1_with_method_uri(
                &encoded,
                FORMSPEC_RECEIPT_METHOD_URI_PREFIX,
            )
            .expect_err("sig method routed through receipt path must reject");

            prop_assert_eq!(
                error,
                FormspecCoseError::WrongMethodUriPrefix {
                    expected_prefix: FORMSPEC_RECEIPT_METHOD_URI_PREFIX,
                    got: method_uri,
                }
            );
        }
    }
}

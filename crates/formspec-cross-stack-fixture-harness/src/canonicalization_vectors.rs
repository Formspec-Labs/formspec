//! Pinned canonicalization vectors for the Formspec response-handoff and
//! response-signed-payload digests.
//!
//! These vectors are consumed by `formspec-server` integration tests and any
//! future cross-stack verifier that needs byte-stable expected values. The
//! preimage construction is owned by `integrity-canonical`; this module pins
//! one Response without `authoredSignatures` (handoff and signed-payload
//! diverge solely because their domain tags differ — projection is a no-op),
//! one with `authoredSignatures` (handoff and signed-payload diverge because
//! of both domain tag AND the `authoredSignatures` strip applied to the
//! signed-payload projection), and one bundle-derived vector pinned from
//! cross-stack fixture bundle 001 so the canonicalization contract is exercised
//! against the same byte response the cross-stack harness uses to drive ring
//! verification (fs-7md4 regression coverage).

use integrity_canonical::{
    DigestAlgorithm, canonical_response_handoff_bytes, canonical_response_signed_payload_bytes,
    compute_digest,
};
use serde_json::{Value, json};
use std::path::PathBuf;

/// One canonicalization vector covering both digest contracts for a Response.
pub struct CanonicalizationVector {
    /// Friendly name for diagnostics.
    pub name: &'static str,

    /// Response JSON used as canonicalization input.
    pub response: Value,

    /// Lowercase hex digest of the response-handoff preimage (authoredSignatures retained).
    pub expected_handoff_hex: &'static str,

    /// Lowercase hex digest of the signed-payload preimage (authoredSignatures omitted).
    pub expected_signed_payload_hex: &'static str,
}

// The pinned hex constants in vector_a_without_signatures and
// vector_b_with_signatures are byte-stable expected values. They MUST agree
// with `integrity-canonical`'s current preimage construction.
//
// Regeneration (after any intentional change to integrity-canonical's
// canonical_response_handoff_bytes / canonical_response_signed_payload_bytes):
//
//   cargo nextest run -p formspec-cross-stack-fixture-harness \
//       pinned_hex_matches_integrity_canonical_recomputation
//
// The test fails with both the expected and actual hex for each vector — copy
// the actual values into the two `expected_*_hex` fields below, re-run, and
// commit. The `vectors_diverge_handoff_vs_signed_payload` test independently
// guards the handoff != signed-payload domain separation invariant.

/// Vector A: Response without `authoredSignatures`. Handoff and signed-payload
/// hashes commit to the same payload bytes because the strip is a no-op.
pub fn vector_a_without_signatures() -> CanonicalizationVector {
    CanonicalizationVector {
        name: "vector-a-no-signatures",
        response: json!({
            "$formspecResponse": "1.0",
            "definitionUrl": "https://example.org/forms/test",
            "definitionVersion": "1.0.0",
            "id": "resp-vector-a",
            "status": "completed",
            "data": { "name": "Ada" },
            "authored": "2026-05-08T12:00:00Z"
        }),
        expected_handoff_hex: "0912e0fdca5b0901ad0b24f7ff5a45af2f46685b6857222ff304730c590fffe5",
        expected_signed_payload_hex: "0580b4321a18d888907a5053f956b681404656bd5bd612348f69df1b026f0660",
    }
}

/// Vector B: Response with `authoredSignatures` populated. Handoff and
/// signed-payload hashes diverge because the signed-payload strips signatures.
pub fn vector_b_with_signatures() -> CanonicalizationVector {
    CanonicalizationVector {
        name: "vector-b-with-signatures",
        response: json!({
            "$formspecResponse": "1.0",
            "definitionUrl": "https://example.org/forms/test",
            "definitionVersion": "1.0.0",
            "id": "resp-vector-b",
            "status": "completed",
            "data": { "name": "Ada" },
            "authored": "2026-05-08T12:00:00Z",
            "authoredSignatures": [
                {
                    "signatureId": "sig-001",
                    "signingIntent": "urn:example:signing-intent:test"
                }
            ]
        }),
        expected_handoff_hex: "7c2d46794e7904e2bc3ec2bfce0cd076a3957bd1c33631c03933e87eca9c4d27",
        expected_signed_payload_hex: "f784073dbcdd2efe685fb900ec9cdedcd602daeb173b7188fa4a5387894e0422",
    }
}

/// Vector C: Bundle-derived. Pinned from cross-stack fixture bundle 001's
/// canonical `formspec-response.json`. Anchors the canonicalization contract to
/// the same response bytes the cross-stack harness uses to drive ring
/// verification — drift between `integrity-canonical` and the bundle response
/// is caught here before it can propagate into the bundle-byte tests.
///
/// `expected_signed_payload_hex` MUST equal
/// `authoredSignatures[0].signedPayload.digest` from the bundle response
/// (asserted by `bundle_001_signed_payload_hex_matches_in_file_digest`).
pub fn vector_c_bundle_001() -> CanonicalizationVector {
    CanonicalizationVector {
        name: "vector-c-bundle-001",
        response: bundle_001_response(),
        expected_handoff_hex: "6635b196113f2ee762bdf0b0518cb89220cc9a45f48d285a6e2e112ecd99ef3c",
        expected_signed_payload_hex:
            "de16829bf9271c3910c4d23cdf5fc5624074516080351ef90fc410cef15d2189",
    }
}

/// Loads bundle 001's `formspec-response.json` as a JSON value.
///
/// Resolves the path relative to this crate's manifest dir so the loader stays
/// reproducible across workspaces.
fn bundle_001_response() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("crate dir has a parent")
        .parent()
        .expect("crates dir has a parent")
        .join("tests")
        .join("fixtures")
        .join("cross-stack")
        .join("001-standalone-formspec-verified")
        .join("formspec-response.json");
    let bytes = std::fs::read(&path)
        .unwrap_or_else(|error| panic!("read bundle 001 response at {path:?}: {error}"));
    serde_json::from_slice(&bytes)
        .unwrap_or_else(|error| panic!("parse bundle 001 response at {path:?}: {error}"))
}

/// All pinned vectors.
pub fn all_vectors() -> Vec<CanonicalizationVector> {
    vec![
        vector_a_without_signatures(),
        vector_b_with_signatures(),
        vector_c_bundle_001(),
    ]
}

/// Recomputes both digests for a vector using `integrity-canonical`.
///
/// Returns `(handoff_hex, signed_payload_hex)`.
///
/// # Errors
///
/// Returns an error when the response cannot be canonicalized.
pub fn recompute_digests(vector: &CanonicalizationVector) -> Result<(String, String), String> {
    let handoff_bytes = canonical_response_handoff_bytes(&vector.response)?;
    let signed_bytes = canonical_response_signed_payload_bytes(&vector.response)?;
    Ok((
        compute_digest(&handoff_bytes, DigestAlgorithm::Sha256),
        compute_digest(&signed_bytes, DigestAlgorithm::Sha256),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vectors_diverge_handoff_vs_signed_payload() {
        for vector in all_vectors() {
            assert_ne!(
                vector.expected_handoff_hex, vector.expected_signed_payload_hex,
                "{}: handoff and signed-payload domains MUST produce distinct digests",
                vector.name
            );
        }
    }

    #[test]
    fn pinned_hex_matches_integrity_canonical_recomputation() {
        for vector in all_vectors() {
            let (handoff_hex, signed_hex) = recompute_digests(&vector).expect("recompute");
            assert_eq!(
                handoff_hex, vector.expected_handoff_hex,
                "{}: pinned handoff hex must match integrity-canonical recomputation",
                vector.name
            );
            assert_eq!(
                signed_hex, vector.expected_signed_payload_hex,
                "{}: pinned signed-payload hex must match integrity-canonical recomputation",
                vector.name
            );
        }
    }

    #[test]
    fn bundle_001_signed_payload_hex_matches_in_file_digest() {
        // The bundle response's in-file `signedPayload.digest` is the byte
        // authority — vector_c's pinned hex MUST equal it. If this diverges,
        // either the bundle response was regenerated without updating the
        // vector or canonicalization drifted; both cases require attention.
        let vector = vector_c_bundle_001();
        let in_file_digest = vector
            .response
            .get("authoredSignatures")
            .and_then(|s| s.get(0))
            .and_then(|s| s.get("signedPayload"))
            .and_then(|sp| sp.get("digest"))
            .and_then(|d| d.as_str())
            .expect("bundle 001 response carries signedPayload.digest");
        assert_eq!(
            vector.expected_signed_payload_hex, in_file_digest,
            "vector-c pinned signed-payload hex must match bundle 001 in-file digest"
        );
    }
}

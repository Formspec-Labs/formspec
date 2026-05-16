//! Cross-encoder canonical-CBOR parity (trellis-scout review Finding 4).
//!
//! The cross-stack bundles' `trellis-events.cbor` and `wos-provenance.cbor`
//! files are authored via Python `cbor2.dumps(..., canonical=True)`. The Rust
//! byte-authority is `integrity-cbor::json_to_dcbor_bytes` (`integrity-stack/
//! crates/integrity-cbor/src/lib.rs:162-171`; sorts at `:338` per Trellis
//! Core §5 / ADR 0004 — Rust as byte authority).
//!
//! # The divergence (regression-tracked)
//!
//! The two encoders DISAGREE on map-key ordering when keys are text strings
//! of unequal length. Concretely, on bundle 002's outer map (which has keys
//! `"records"` len 7 and `"$wosProvenanceBundle"` len 20):
//!
//! - **cbor2 `canonical=True`** follows RFC 7049 §3.9 (length-first, then
//!   bytewise on the UTF-8 bytes). Encodes `"records"` first (length 7 < 20).
//! - **integrity-cbor** sorts by `encoded_cbor_key_bytes` (full CBOR
//!   serialization of the key, including the major-type / length prefix). For
//!   two text-string keys differing in length, the length prefix flips the
//!   ordering only when the prefix-byte values cross a CBOR-encoding boundary
//!   (lengths 23 ↔ 24 cross from one-byte prefix to two-byte prefix). For
//!   pairs entirely inside the 0-23 prefix range (one-byte prefix `0x60+len`),
//!   the prefix is monotonic in length, so "length-first" and "bytewise on
//!   encoded bytes" agree. BUT integrity-cbor's actual behavior on the
//!   committed bundles puts `"$wosProvenanceBundle"` first because `$`
//!   (0x24) < `r` (0x72) when compared as UTF-8 *content* bytes — which
//!   means integrity-cbor effectively sorts content-bytewise WITHOUT the
//!   length prefix participating in the ordering for these pairs.
//!
//! Whichever discipline integrity-cbor actually implements, it differs from
//! cbor2 for the four committed bundles. A Rust consumer that re-encodes
//! one of these bundles via `integrity-cbor::json_to_dcbor_bytes` produces
//! BYTE-DIFFERENT output from the committed file. Any downstream Trellis
//! verifier that hashes a re-encoded bundle will get a different digest.
//!
//! # Scope today
//!
//! Today no production consumer re-encodes the committed bundles. The harness
//! uses `ciborium::de::from_reader` (read-only) and asserts byte-equality
//! against the original Python-authored bytes. So the divergence is DORMANT
//! in the current implementation: it does not regress any green test or
//! production code path.
//!
//! Forward-looking, the divergence will bite when:
//!
//! 1. A future Rust bundle generator (e.g., trellis-export-writer producing
//!    bundles from scratch) emits trellis-events.cbor via integrity-cbor.
//!    Those bytes won't match what cbor2 produced for the historical bundles.
//! 2. The fs-bmyq cross-adapter byte-equivalence harness runs Rust-side
//!    re-encoding against the committed Python bytes — diverges immediately.
//! 3. A Trellis verifier that consults the canonical event registry tries
//!    to re-derive the bundle bytes — same gap.
//!
//! # Resolution: fs-qwyb (this commit)
//!
//! Resolving this divergence requires a Trellis-expert decision about which
//! ordering discipline integrity-cbor should implement (RFC 7049 §3.9
//! length-first, RFC 8949 §4.2 bytewise-on-deterministic-encoding, or
//! something else), followed by a coordinated regen of every committed Rust
//! fixture that depended on the current sort + every Python-authored fixture
//! that depended on cbor2's sort. fs-qwyb tracks the cross-encoder
//! reconciliation.
//!
//! Until fs-qwyb lands, the parity test below is `#[ignore]` — it documents
//! the gap but is not blocking. The companion test
//! `cross_encoder_ordering_diverges_on_committed_bundles` ASSERTS the
//! current divergence (regression check that catches a silent fix and forces
//! coordinated cleanup).

use std::path::Path;

use ciborium::Value;
use integrity_cbor::{cbor_value_to_json, json_to_dcbor_bytes};

/// Bundles + their CBOR file names. The committed bytes are
/// `cbor2.dumps(canonical=True)` output; the parity check re-encodes via
/// `integrity-cbor::json_to_dcbor_bytes`.
const PARITY_TARGETS: &[(&str, &str)] = &[
    ("002-wos-governed-verified", "trellis-events.cbor"),
    ("002-wos-governed-verified", "wos-provenance.cbor"),
    ("003-unsupported-method-rejected", "trellis-events.cbor"),
    ("003-unsupported-method-rejected", "wos-provenance.cbor"),
    ("004-tampered-signature-failed", "trellis-events.cbor"),
    ("004-tampered-signature-failed", "wos-provenance.cbor"),
    ("006-deferred-pending-helper", "trellis-events.cbor"),
    ("006-deferred-pending-helper", "wos-provenance.cbor"),
];

fn bundle_file(bundle: &str, name: &str) -> std::path::PathBuf {
    let formspec_root = std::env::var_os("FORMSPEC_ROOT_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| {
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .unwrap()
                .parent()
                .unwrap()
                .to_path_buf()
        });
    formspec_root
        .join("tests")
        .join("fixtures")
        .join("cross-stack")
        .join(bundle)
        .join(name)
}

/// Decode the Python-cbor2-authored bytes via ciborium, lift through
/// `cbor_value_to_json`, then re-encode via `integrity-cbor`.
fn reencode_via_integrity_cbor(path: &Path) -> (Vec<u8>, Vec<u8>) {
    let original = std::fs::read(path).expect("read cbor");
    let decoded: Value = ciborium::de::from_reader(original.as_slice()).expect("decode cbor");
    let json = cbor_value_to_json(&decoded).expect("ciborium->json");
    let reencoded = json_to_dcbor_bytes(&json, &[]).expect("json->dcbor");
    (original, reencoded)
}

/// Aspirational parity check. Fails today (see fs-qwyb); kept as the
/// target shape for the future reconciliation.
#[test]
#[ignore = "fs-qwyb — cbor2(canonical=True) and integrity-cbor disagree on \
            map-key ordering for text keys of unequal length. Cross-encoder \
            reconciliation pending Trellis-expert decision."]
fn cross_stack_bundles_match_integrity_cbor_byte_authority() {
    for (bundle, name) in PARITY_TARGETS {
        let path = bundle_file(bundle, name);
        let (original, reencoded) = reencode_via_integrity_cbor(&path);
        assert_eq!(
            reencoded, original,
            "cbor2(canonical=True) vs integrity-cbor must produce byte-identical \
             output for {bundle}/{name} ({} bytes original vs {} bytes reencoded)",
            original.len(),
            reencoded.len()
        );
    }
}

/// Regression check: ASSERTS that the divergence persists on the committed
/// bundles. If a future fs-qwyb fix narrows the encoders, this test will
/// fail — forcing whoever lands the fix to coordinate fixture regen and
/// promote the ignored parity test above to load-bearing.
#[test]
fn cross_encoder_ordering_diverges_on_committed_bundles() {
    let mut divergent = Vec::new();
    for (bundle, name) in PARITY_TARGETS {
        let path = bundle_file(bundle, name);
        if !path.exists() {
            continue;
        }
        let (original, reencoded) = reencode_via_integrity_cbor(&path);
        if original != reencoded {
            divergent.push(format!("{bundle}/{name}"));
        }
    }
    assert!(
        !divergent.is_empty(),
        "Expected cbor2(canonical=True) and integrity-cbor to diverge on at \
         least one committed bundle (regression check for fs-qwyb). If this \
         test fails, the cross-encoder gap has closed — coordinate with the \
         Trellis substrate team to promote the ignored parity test \
         `cross_stack_bundles_match_integrity_cbor_byte_authority` to \
         load-bearing and update fs-qwyb's closure note. Bundles checked: {:?}",
        PARITY_TARGETS
    );
}

/// Hard-asserts the text-only-keys discipline: every CBOR map key in every
/// bundle is a CBOR text string. Cross-encoder reconciliation work assumes
/// this; introducing integer or byte-string keys would create a second
/// divergence axis (RFC 7049 §3.9 vs RFC 8949 §4.2 on heterogeneous keys).
#[test]
fn cross_stack_bundles_have_only_text_keys() {
    fn assert_text_keys_only(value: &Value, breadcrumb: &str) {
        match value {
            Value::Map(entries) => {
                for (key, child) in entries {
                    match key {
                        Value::Text(name) => {
                            assert_text_keys_only(child, &format!("{breadcrumb}.{name}"));
                        }
                        other => panic!(
                            "non-text CBOR map key at {breadcrumb}: {other:?}. \
                             Cross-encoder reconciliation (fs-qwyb) assumes \
                             text-only keys; non-text keys would create a \
                             second divergence axis. Either keep keys text-only \
                             or coordinate with fs-qwyb before adding heterogeneous \
                             key types to bundles."
                        ),
                    }
                }
            }
            Value::Array(items) => {
                for (i, item) in items.iter().enumerate() {
                    assert_text_keys_only(item, &format!("{breadcrumb}[{i}]"));
                }
            }
            _ => {}
        }
    }

    for (bundle, name) in PARITY_TARGETS {
        let path = bundle_file(bundle, name);
        if !path.exists() {
            continue;
        }
        let bytes = std::fs::read(&path).expect("read bundle cbor");
        let value: Value = ciborium::de::from_reader(bytes.as_slice()).expect("decode cbor");
        assert_text_keys_only(&value, &format!("{bundle}/{name}"));
    }
}

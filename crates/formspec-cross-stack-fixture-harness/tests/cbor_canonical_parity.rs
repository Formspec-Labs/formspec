//! Cross-encoder canonical-CBOR parity.
//!
//! The cross-stack bundles' `trellis-events.cbor` and `wos-provenance.cbor`
//! files must match the Rust byte-authority,
//! `integrity-cbor::json_to_dcbor_bytes` (`integrity-stack/
//! crates/integrity-cbor/src/lib.rs:162-171`). Trellis Core §5 / ADR 0004
//! pins Rust as byte authority.
//!
//! # Prior divergence
//!
//! Review finding `fs-qwyb` found byte drift in committed bundle CBOR files.
//! The stale bytes put `"$wosProvenanceBundle"` before `"records"` in some
//! maps, while the canonical Rust encoder sorts by deterministic CBOR key
//! bytes and puts `"records"` first.
//!
//! This test file keeps that byte-order invariant load-bearing: each committed
//! CBOR fixture is decoded, lifted through JSON, re-encoded by `integrity-cbor`,
//! and compared byte-for-byte with the committed artifact.

use std::path::Path;

use ciborium::Value;
use integrity_cbor::{cbor_value_to_json, json_to_dcbor_bytes};

/// Bundles + their CBOR file names.
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

#[test]
fn cross_stack_bundles_match_integrity_cbor_byte_authority() {
    for (bundle, name) in PARITY_TARGETS {
        let path = bundle_file(bundle, name);
        let (original, reencoded) = reencode_via_integrity_cbor(&path);
        assert_eq!(
            reencoded,
            original,
            "committed fixture must match integrity-cbor byte-authority for \
             {bundle}/{name} ({} bytes original vs {} bytes reencoded)",
            original.len(),
            reencoded.len()
        );
    }
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

use formspec_cross_stack_fixture_harness::*;
use std::path::PathBuf;

fn cross_stack_root() -> PathBuf {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let root = manifest_dir
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("tests")
        .join("fixtures")
        .join("cross-stack");
    assert!(
        root.join("manifest.schema.json").exists(),
        "cross-stack fixtures not found at {:?} — crate may have moved",
        root
    );
    root
}

#[test]
fn test_all_manifests_parse_and_validate_against_schema() {
    let root = cross_stack_root();
    let manifests = all_manifest_schema_paths(root.to_str().unwrap()).unwrap();

    assert!(
        !manifests.is_empty(),
        "no manifest files found in cross-stack test fixtures"
    );

    for manifest_path in &manifests {
        validate_manifest_schema(manifest_path)
            .unwrap_or_else(|e| panic!("manifest {:?} failed schema: {e}", manifest_path));
    }
}

#[test]
fn test_all_seven_bundles_discovered() {
    let root = cross_stack_root();
    let bundles = discover_bundles(root.to_str().unwrap()).unwrap();

    assert_eq!(bundles.len(), 7, "expected exactly 7 bundles");
    let ids: Vec<_> = bundles.iter().map(|b| b.id.as_str()).collect();
    assert_eq!(ids, vec!["001", "002", "003", "004", "005", "006", "007"]);
}

#[test]
fn test_bundle_001_has_expected_shape() {
    let root = cross_stack_root();
    let bundles = discover_bundles(root.to_str().unwrap()).unwrap();
    let b001 = bundles
        .iter()
        .find(|b| b.id == "001")
        .expect("bundle 001 not found");

    assert_eq!(b001.name, "standalone-formspec-verified");
    assert!(b001.manifest.expected_outcomes.formspec.schema_valid);
    assert!(b001.manifest.required_files.formspec_response);
    assert!(b001.manifest.required_files.verification_receipt);
    assert!(b001.manifest.required_files.posture_declaration);
    assert!(!b001.manifest.required_files.wos_provenance);
    assert!(!b001.manifest.required_files.trellis_events);
    assert!(!b001.manifest.required_files.trellis_export);
}

#[test]
fn test_bundle_003_rejects_unsupported_method() {
    let root = cross_stack_root();
    let bundles = discover_bundles(root.to_str().unwrap()).unwrap();
    let b003 = bundles
        .iter()
        .find(|b| b.id == "003")
        .expect("bundle 003 not found");

    let wos = b003
        .manifest
        .expected_outcomes
        .wos
        .as_ref()
        .expect("wos outcome missing");
    assert_eq!(wos.record_kind.as_deref(), Some("signatureAdmissionFailed"));
    assert_eq!(
        wos.admission_failed_reason.as_deref(),
        Some("method_unsupported")
    );
}

#[test]
fn test_bundle_005_expects_divergence() {
    let root = cross_stack_root();
    let bundles = discover_bundles(root.to_str().unwrap()).unwrap();
    let b005 = bundles
        .iter()
        .find(|b| b.id == "005")
        .expect("bundle 005 not found");

    let fs = &b005.manifest.expected_outcomes.formspec;
    assert!(fs.schema_valid);
    assert!(!fs.semantic_valid.unwrap());
    assert!(
        fs.expected_errors
            .contains(&"SOURCE_OF_TRUTH_DIVERGENCE".to_string())
    );
}

#[test]
fn test_bundle_007_expects_byte_equality() {
    let root = cross_stack_root();
    let bundles = discover_bundles(root.to_str().unwrap()).unwrap();
    let b007 = bundles
        .iter()
        .find(|b| b.id == "007")
        .expect("bundle 007 not found");

    let eq = &b007.manifest.cross_layer_byte_equality;
    assert!(eq.signature_value_bytes_equals_trellis_uca.unwrap());
    assert!(eq.verification_receipt_bytes_identical.unwrap());
    assert!(eq.response_hash_equals_export.unwrap());

    let trellis = b007
        .manifest
        .expected_outcomes
        .trellis
        .as_ref()
        .expect("trellis outcome missing");
    assert!(trellis.uca_corroborated.unwrap());
    assert!(trellis.export_present.unwrap());
}

fn invalid_dir() -> PathBuf {
    cross_stack_root().join(".invalid")
}

#[test]
fn test_validate_schema_errors_on_string_bool() {
    let path = invalid_dir().join("invalid-type.toml");
    let result = validate_manifest_schema(&path);
    assert!(
        result.is_err(),
        "expected schema validation to fail on string schema_valid"
    );
}

#[test]
fn test_validate_schema_errors_on_missing_bundle() {
    let path = invalid_dir().join("missing-bundle.toml");
    let result = validate_manifest_schema(&path);
    assert!(
        result.is_err(),
        "expected schema validation to fail on missing [bundle] section"
    );
}

#[test]
fn test_discover_bundles_errors_on_malformed_toml() {
    let result = discover_bundles(invalid_dir().to_str().unwrap());
    let Err(error) = result else {
        panic!("expected parse error for malformed manifest");
    };
    assert!(
        error.contains("failed to parse manifest"),
        "expected parse error for malformed manifest"
    );
}

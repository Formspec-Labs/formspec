use formspec_cross_stack_fixture_harness::*;
use std::path::PathBuf;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct FixtureResponse {
    id: String,
    definition_url: String,
    definition_version: String,
    authored_signatures: Vec<FixtureAuthoredSignature>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct FixtureAuthoredSignature {
    signing_intent: String,
    signature_value: String,
    signature_method: String,
    verification_receipt: String,
    signed_payload: FixtureSignedPayload,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct FixtureSignedPayload {
    digest_algorithm: String,
    digest: String,
    response_id: String,
    definition_url: String,
    definition_version: String,
    signed_at: String,
    signing_intent: String,
}

struct VerifiedResponseFixture {
    signature: FixtureAuthoredSignature,
    signed_bytes: Vec<u8>,
    receipt_bytes: Vec<u8>,
    receipt: formspec_signature_port::VerificationReceipt,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct WosProvenanceBundle {
    records: Vec<WosProvenanceRecord>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct WosProvenanceRecord {
    record_kind: String,
    data: serde_json::Value,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct WosSignatureAffirmationData {
    source_signature_id: String,
    signed_payload_digest: String,
    signing_intent: String,
    custody_hook_eligible: bool,
    primitive_verification: PrimitiveVerification,
    verification_receipt: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct WosSignatureAdmissionFailedData {
    reason: String,
    evidence_bindings: WosEvidenceBindings,
    signer_id: Option<String>,
    emitted_at: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct WosEvidenceBindings {
    response_id: String,
    signed_payload_digest: String,
    signature_id: String,
    signing_intent: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrimitiveVerification {
    status: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrellisEventsBundle {
    events: Vec<TrellisEvent>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrellisEvent {
    event_kind: String,
    data: TrellisEventData,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrellisEventData {
    signed_payload_digest: String,
    verification_receipt: String,
    custody_hook_present: bool,
    admission_failed_reason: Option<String>,
}

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

fn formspec_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .to_path_buf()
}

fn load_verified_response_fixture(bundle_name: &str) -> VerifiedResponseFixture {
    use base64::Engine;
    use formspec_signature_cose::decode_cose_sign1;
    use integrity_canonical::{DigestAlgorithm, build_signed_payload};

    let bundle_dir = cross_stack_root().join(bundle_name);
    let response_path = bundle_dir.join("formspec-response.json");
    let receipt_path = bundle_dir.join("verification-receipt.cose");
    let posture_path = bundle_dir.join("posture-declaration.json");

    assert!(response_path.exists(), "{bundle_name} response missing");
    assert!(
        receipt_path.exists(),
        "{bundle_name} verification receipt missing"
    );
    assert!(
        posture_path.exists(),
        "{bundle_name} posture declaration missing"
    );

    let response_json: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&response_path).expect("read response"))
            .expect("parse response");
    validate_response_schema(&response_json);

    let response: FixtureResponse =
        serde_json::from_value(response_json.clone()).expect("typed response");
    assert_eq!(response.authored_signatures.len(), 1);
    let signature = response
        .authored_signatures
        .into_iter()
        .next()
        .expect("one signature");

    assert_eq!(signature.signed_payload.response_id, response.id);
    assert_eq!(
        signature.signed_payload.definition_url,
        response.definition_url
    );
    assert_eq!(
        signature.signed_payload.definition_version,
        response.definition_version
    );
    assert_eq!(
        signature.signed_payload.signing_intent,
        signature.signing_intent
    );
    assert!(
        !signature.signed_payload.signed_at.is_empty(),
        "signedAt must be carried inside signedPayload"
    );

    let algorithm = DigestAlgorithm::from_str(&signature.signed_payload.digest_algorithm)
        .expect("digest algorithm");
    let signed_payload = build_signed_payload(&response_json, algorithm).expect("signed payload");
    assert_eq!(signed_payload.digest, signature.signed_payload.digest);

    let receipt_bytes = std::fs::read(&receipt_path).expect("read receipt");
    let receipt_b64 = base64::engine::general_purpose::STANDARD.encode(&receipt_bytes);
    assert_eq!(
        signature.verification_receipt, receipt_b64,
        "response verificationReceipt must byte-match verification-receipt.cose"
    );

    let receipt_cose = decode_cose_sign1(&receipt_bytes).expect("decode receipt cose");
    let receipt_payload = receipt_cose
        .payload()
        .expect("receipt must embed its JSON payload");
    let receipt =
        serde_json::from_slice(receipt_payload).expect("parse VerificationReceipt payload");

    VerifiedResponseFixture {
        signature,
        signed_bytes: signed_payload.canonical_bytes,
        receipt_bytes,
        receipt,
    }
}

fn validate_response_schema(response_json: &serde_json::Value) {
    let schema_path = formspec_root().join("schemas/response.schema.json");
    let response_schema: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(schema_path).expect("read response schema"))
            .expect("parse response schema");
    let validation_result_schema_path =
        formspec_root().join("schemas/validation-result.schema.json");
    let validation_result_schema: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(validation_result_schema_path)
            .expect("read validation result schema"),
    )
    .expect("parse validation result schema");
    let response_validator = jsonschema::options()
        .with_resource(
            "https://formspec.org/schemas/validationResult/1.0",
            jsonschema::Resource::from_contents(validation_result_schema),
        )
        .build(&response_schema)
        .expect("compile response schema");
    response_validator
        .validate(response_json)
        .expect("response must validate against response.schema.json");
}

fn verify_with_ring(fixture: &VerifiedResponseFixture) {
    use base64::Engine;
    use formspec_signature_adapter_ring::RingVerifier;
    use formspec_signature_port::{
        SignatureMethodRegistry, VerificationResult, Verifier, VerifyRequest,
    };

    assert_eq!(
        fixture.receipt.result.to_string(),
        VerificationResult::Verified.to_string()
    );
    assert_eq!(
        fixture.receipt.method.as_str(),
        fixture.signature.signature_method
    );

    let registry_path = formspec_root().join("registries/signature-method-registry.json");
    let registry: SignatureMethodRegistry =
        serde_json::from_str(&std::fs::read_to_string(registry_path).expect("read registry"))
            .expect("parse registry");
    let signature_bytes = base64::engine::general_purpose::STANDARD
        .decode(&fixture.signature.signature_value)
        .expect("decode signatureValue");
    let verifier = RingVerifier::new();
    let verification = verifier
        .verify(
            &VerifyRequest {
                signed_bytes: fixture.signed_bytes.clone(),
                signature_bytes,
                signature_method: fixture.signature.signature_method.as_str().into(),
                key_ref: fixture.receipt.key.r#ref.clone(),
            },
            &registry,
        )
        .expect("ring verification");
    assert_eq!(verification.result.to_string(), "verified");
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
fn test_bundle_001_bytes_verify_with_ring_adapter() {
    let fixture = load_verified_response_fixture("001-standalone-formspec-verified");
    verify_with_ring(&fixture);
}

#[test]
fn test_bundle_002_wos_governed_bytes_match_formspec_receipt() {
    use base64::Engine;

    let fixture = load_verified_response_fixture("002-wos-governed-verified");
    verify_with_ring(&fixture);

    let bundle_dir = cross_stack_root().join("002-wos-governed-verified");
    let wos_bytes =
        std::fs::read(bundle_dir.join("wos-provenance.cbor")).expect("read wos-provenance.cbor");
    let wos: WosProvenanceBundle =
        ciborium::from_reader(wos_bytes.as_slice()).expect("decode WOS provenance CBOR");
    assert_eq!(wos.records.len(), 1);
    let record = &wos.records[0];
    assert_eq!(record.record_kind, "signatureAffirmation");
    let data: WosSignatureAffirmationData =
        serde_json::from_value(record.data.clone()).expect("signatureAffirmation data");
    assert_eq!(data.source_signature_id, "sig-cross-stack-002");
    assert_eq!(
        data.signed_payload_digest,
        fixture.signature.signed_payload.digest
    );
    assert_eq!(data.signing_intent, fixture.signature.signing_intent);
    assert!(data.custody_hook_eligible);
    assert_eq!(data.primitive_verification.status, "verified");
    assert_eq!(
        data.verification_receipt,
        base64::engine::general_purpose::STANDARD.encode(&fixture.receipt_bytes)
    );

    let trellis_bytes =
        std::fs::read(bundle_dir.join("trellis-events.cbor")).expect("read trellis-events.cbor");
    let trellis: TrellisEventsBundle =
        ciborium::from_reader(trellis_bytes.as_slice()).expect("decode Trellis events CBOR");
    assert_eq!(trellis.events.len(), 1);
    let event = &trellis.events[0];
    assert_eq!(event.event_kind, "wos.signature.signatureAffirmation");
    assert!(event.data.custody_hook_present);
    assert_eq!(
        event.data.signed_payload_digest,
        fixture.signature.signed_payload.digest
    );
    assert_eq!(event.data.verification_receipt, data.verification_receipt);
}

#[test]
fn test_bundle_003_posture_forbids_registered_verified_method() {
    use base64::Engine;

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

    let fixture = load_verified_response_fixture("003-unsupported-method-rejected");
    verify_with_ring(&fixture);

    let bundle_dir = cross_stack_root().join("003-unsupported-method-rejected");
    let posture: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(bundle_dir.join("posture-declaration.json"))
            .expect("read posture-declaration.json"),
    )
    .expect("parse posture declaration");
    let allowed_methods = posture["signaturePolicy"]["allowedMethods"]
        .as_array()
        .expect("allowedMethods array");
    assert!(
        !allowed_methods
            .iter()
            .any(|method| method.as_str() == Some(fixture.signature.signature_method.as_str())),
        "posture must forbid the otherwise registered and verified signature method"
    );
    let allowed_intents = posture["signaturePolicy"]["allowedSigningIntents"]
        .as_array()
        .expect("allowedSigningIntents array");
    assert!(
        allowed_intents
            .iter()
            .any(|intent| intent.as_str() == Some(fixture.signature.signing_intent.as_str())),
        "signing intent must be allowed so Bundle 003 proves method rejection, not intent rejection"
    );

    let wos_bytes =
        std::fs::read(bundle_dir.join("wos-provenance.cbor")).expect("read wos-provenance.cbor");
    let wos_bundle: WosProvenanceBundle =
        ciborium::from_reader(wos_bytes.as_slice()).expect("decode WOS provenance CBOR");
    assert!(
        !wos_bundle
            .records
            .iter()
            .any(|record| record.record_kind == "signatureAffirmation"),
        "forbidden method must not admit a SignatureAffirmation"
    );
    assert_eq!(wos_bundle.records.len(), 1);
    let record = &wos_bundle.records[0];
    assert_eq!(record.record_kind, "signatureAdmissionFailed");
    let data: WosSignatureAdmissionFailedData =
        serde_json::from_value(record.data.clone()).expect("signatureAdmissionFailed data");
    assert_eq!(data.reason, "method_unsupported");
    assert_eq!(data.signer_id.as_deref(), Some("applicant"));
    assert_eq!(data.emitted_at, fixture.signature.signed_payload.signed_at);
    assert_eq!(
        data.evidence_bindings.response_id,
        fixture.signature.signed_payload.response_id
    );
    assert_eq!(
        data.evidence_bindings.signed_payload_digest,
        fixture.signature.signed_payload.digest
    );
    assert_eq!(data.evidence_bindings.signature_id, "sig-cross-stack-003");
    assert_eq!(
        data.evidence_bindings.signing_intent,
        fixture.signature.signing_intent
    );

    let trellis_bytes =
        std::fs::read(bundle_dir.join("trellis-events.cbor")).expect("read trellis-events.cbor");
    let trellis: TrellisEventsBundle =
        ciborium::from_reader(trellis_bytes.as_slice()).expect("decode Trellis events CBOR");
    assert_eq!(trellis.events.len(), 1);
    let event = &trellis.events[0];
    assert_eq!(event.event_kind, "wos.signature.signatureAdmissionFailed");
    assert!(
        !event.data.custody_hook_present,
        "failed admission must not create a custody hook"
    );
    assert_eq!(
        event.data.signed_payload_digest,
        fixture.signature.signed_payload.digest
    );
    assert_eq!(
        event.data.verification_receipt,
        base64::engine::general_purpose::STANDARD.encode(&fixture.receipt_bytes)
    );
    assert_eq!(
        event.data.admission_failed_reason.as_deref(),
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

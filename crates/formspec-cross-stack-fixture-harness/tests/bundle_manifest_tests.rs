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
    /// Optional because bundles that declare `verification_receipt = false` in
    /// their manifest (005, 006) omit this field. Receipt-bearing bundles
    /// (001-004) carry it inline; [`load_receipt_fixture`] then asserts the
    /// inline string byte-matches the bundle's `verification-receipt.cose`.
    #[serde(default)]
    verification_receipt: Option<String>,
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

/// Response-side bytes plus authored-signature view. No receipt is read; the
/// caller decides whether the bundle's manifest declares `verification_receipt`
/// and pulls receipt bytes through [`load_receipt_fixture`] when it does.
/// Used by receipt-less bundles 005, 006 (fs-5wrh helper factoring).
#[allow(dead_code)]
struct ResponseFixture {
    response_json: serde_json::Value,
    signature: FixtureAuthoredSignature,
    signature_method: String,
    signed_bytes: Vec<u8>,
}

/// Response-side + receipt-side bytes. Used by bundles that declare
/// `verification_receipt = true` in their manifest. Bundles declaring
/// `verification_receipt = false` use [`load_response_fixture`] directly.
struct VerifiedResponseFixture {
    signature: FixtureAuthoredSignature,
    signature_method: String,
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
    /// Verified paths embed the COSE_Sign1 receipt bytes (base64). The
    /// `deferredPendingHelper` path (bundle 006) omits this — no primitive
    /// verification fired, so there is no receipt to embed.
    #[serde(default)]
    verification_receipt: Option<String>,
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
    /// Optional for the same reason as `WosSignatureAffirmationData` —
    /// `deferredPendingHelper` events emit no receipt (bundle 006). Receipt-
    /// bearing events (002, 003, 004) still carry it inline.
    #[serde(default)]
    verification_receipt: Option<String>,
    custody_hook_present: bool,
    admission_failed_reason: Option<String>,
}

/// Resolves the formspec crate root.
///
/// Default path: walks up two parents from `CARGO_MANIFEST_DIR`
/// (`crates/formspec-cross-stack-fixture-harness/` → `crates/` → repo root).
/// `FORMSPEC_ROOT_DIR` env var overrides — set this when the harness moves to
/// another location relative to the formspec repo, rather than rewriting the
/// parent walk. Uses `var_os` so non-UTF8 paths work on platforms where
/// filesystem paths are not guaranteed UTF-8.
fn formspec_root() -> PathBuf {
    if let Some(override_path) = std::env::var_os("FORMSPEC_ROOT_DIR") {
        return PathBuf::from(override_path);
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .to_path_buf()
}

/// Resolves the cross-stack fixture corpus directory under the formspec repo.
///
/// Asserts the manifest schema is present so a stale checkout or a crate move
/// fails loudly rather than silently discovering zero bundles.
fn cross_stack_root() -> PathBuf {
    let root = formspec_root()
        .join("tests")
        .join("fixtures")
        .join("cross-stack");
    assert!(
        root.join("manifest.schema.json").exists(),
        "cross-stack fixtures not found at {:?} — crate may have moved; set FORMSPEC_ROOT_DIR to override",
        root
    );
    root
}

/// Decodes the response-signing method URI from `signatureValue`.
fn signature_method_from_signature_value(signature_value: &str) -> String {
    use base64::Engine;
    use formspec_signature_cose::{FORMSPEC_SIG_METHOD_URI_PREFIX, extract_method_uri};

    let signature_bytes = base64::engine::general_purpose::STANDARD
        .decode(signature_value)
        .expect("decode signatureValue");
    extract_method_uri(&signature_bytes, FORMSPEC_SIG_METHOD_URI_PREFIX)
        .expect("signatureValue must carry response-signing method_uri")
}

/// Reads a bundle's `formspec-response.json` + `posture-declaration.json`,
/// validates schema, asserts source-of-truth bindings between the top-level
/// response and `signedPayload`, and recomputes the canonical signed-payload
/// digest. Receipt-less: bundles declaring `verification_receipt = false` in
/// their manifest (e.g. 005, 006) load through here without touching
/// `verification-receipt.cose` (fs-5wrh helper factoring).
fn load_response_fixture(bundle_name: &str) -> ResponseFixture {
    use integrity_canonical::{DigestAlgorithm, build_signed_payload};

    let bundle_dir = cross_stack_root().join(bundle_name);
    let response_path = bundle_dir.join("formspec-response.json");
    let posture_path = bundle_dir.join("posture-declaration.json");

    assert!(response_path.exists(), "{bundle_name} response missing");
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
    let signature_method = signature_method_from_signature_value(&signature.signature_value);

    ResponseFixture {
        response_json,
        signature,
        signature_method,
        signed_bytes: signed_payload.canonical_bytes,
    }
}

/// Reads a bundle's `verification-receipt.cose`, asserts it byte-matches the
/// `verificationReceipt` field inlined on the authored signature, and decodes
/// the COSE_Sign1 payload as a [`formspec_signature_port::VerificationReceipt`].
/// Caller MUST only invoke this for bundles whose manifest declares
/// `verification_receipt = true`.
fn load_receipt_fixture(
    bundle_name: &str,
    signature: &FixtureAuthoredSignature,
) -> (Vec<u8>, formspec_signature_port::VerificationReceipt) {
    use base64::Engine;
    use formspec_signature_cose::{
        FORMSPEC_RECEIPT_METHOD_URI_PREFIX, decode_cose_sign1_with_method_uri,
    };

    let bundle_dir = cross_stack_root().join(bundle_name);
    let receipt_path = bundle_dir.join("verification-receipt.cose");
    assert!(
        receipt_path.exists(),
        "{bundle_name} verification receipt missing"
    );

    let receipt_bytes = std::fs::read(&receipt_path).expect("read receipt");
    let receipt_b64 = base64::engine::general_purpose::STANDARD.encode(&receipt_bytes);
    let inline_receipt = signature
        .verification_receipt
        .as_deref()
        .expect("receipt-bearing bundle must inline verificationReceipt on the signature");
    assert_eq!(
        inline_receipt, receipt_b64,
        "response verificationReceipt must byte-match verification-receipt.cose"
    );

    let (receipt_cose, receipt_method) =
        decode_cose_sign1_with_method_uri(&receipt_bytes, FORMSPEC_RECEIPT_METHOD_URI_PREFIX)
            .expect("decode receipt cose");
    assert_eq!(
        receipt_method, "urn:formspec:receipt-method:ed25519-cose-sign1@1",
        "verification-receipt.cose must use the receipt-method URI subspace"
    );
    let receipt_payload = receipt_cose
        .payload()
        .expect("receipt must embed its JSON payload");
    let receipt =
        serde_json::from_slice(receipt_payload).expect("parse VerificationReceipt payload");
    (receipt_bytes, receipt)
}

/// Composes [`load_response_fixture`] + [`load_receipt_fixture`] for bundles
/// 001-004 (receipt-bearing happy/admission-failed paths). Receipt-less
/// bundles 005, 006 call [`load_response_fixture`] directly.
fn load_verified_response_fixture(bundle_name: &str) -> VerifiedResponseFixture {
    let ResponseFixture {
        response_json: _,
        signature,
        signature_method,
        signed_bytes,
    } = load_response_fixture(bundle_name);
    let (receipt_bytes, receipt) = load_receipt_fixture(bundle_name, &signature);
    VerifiedResponseFixture {
        signature,
        signature_method,
        signed_bytes,
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
    use formspec_signature_port::{KeyRef, SignatureMethodRegistry, Verifier, VerifyRequest};

    assert!(
        fixture.receipt.is_verified(),
        "fixture receipt must already attest a verified signature"
    );
    assert_eq!(
        fixture.receipt.method.as_str(),
        fixture.signature_method.as_str()
    );

    let registry_path = formspec_root().join("registries/signature-method-registry.json");
    let registry: SignatureMethodRegistry =
        serde_json::from_str(&std::fs::read_to_string(registry_path).expect("read registry"))
            .expect("parse registry");
    let signature_bytes = base64::engine::general_purpose::STANDARD
        .decode(&fixture.signature.signature_value)
        .expect("decode signatureValue");
    // fs-0gzb migration: receipts carry the raw public key (base64) in
    // `key.ref`; decode it to KeyRef::RawPublicKey rather than passing the
    // stringly-typed base64 through the legacy KidOrThumbprint path.
    let key_bytes = base64::engine::general_purpose::STANDARD
        .decode(fixture.receipt.key.r#ref.as_str())
        .expect("decode receipt.key.ref as base64 raw public key");
    let verifier = RingVerifier::new();
    let verification = verifier
        .verify(
            &VerifyRequest {
                signed_bytes: fixture.signed_bytes.clone(),
                signature_bytes,
                signature_method: fixture.signature_method.as_str().into(),
                key_ref: KeyRef::RawPublicKey(key_bytes),
            },
            &registry,
        )
        .expect("ring verification");
    assert!(
        verification.is_verified(),
        "ring re-verification of a happy-path fixture must succeed"
    );
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
fn test_all_bundles_discovered_match_directory_listing() {
    let root = cross_stack_root();
    let bundles = discover_bundles(root.to_str().unwrap()).unwrap();

    // Expected set: every NNN-* subdirectory under cross_stack_root() with a
    // manifest.toml. Hidden directories (e.g. `.invalid`) are excluded.
    let mut expected_ids: Vec<String> = std::fs::read_dir(&root)
        .expect("read cross-stack fixtures dir")
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                return None;
            }
            if !entry.file_type().ok()?.is_dir() {
                return None;
            }
            if !entry.path().join("manifest.toml").exists() {
                return None;
            }
            let (id, _) = name.split_once('-')?;
            Some(id.to_string())
        })
        .collect();
    expected_ids.sort();

    assert!(
        !expected_ids.is_empty(),
        "no bundle directories with manifest.toml found in {root:?}"
    );

    let discovered_ids: Vec<String> = bundles.iter().map(|b| b.id.clone()).collect();
    assert_eq!(
        discovered_ids, expected_ids,
        "discover_bundles must return every NNN-* subdirectory, in sorted order"
    );

    // Bundle ids form a contiguous range starting at 001 — drift trap for new
    // bundles landed out of order or with skipped numbers.
    for (offset, id) in expected_ids.iter().enumerate() {
        let expected = format!("{:03}", offset + 1);
        assert_eq!(
            id, &expected,
            "bundle ids must be contiguous starting at 001; got {id} at position {offset}"
        );
    }
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
        data.verification_receipt.as_deref(),
        Some(
            base64::engine::general_purpose::STANDARD
                .encode(&fixture.receipt_bytes)
                .as_str()
        )
    );

    let trellis_bytes =
        std::fs::read(bundle_dir.join("trellis-events.cbor")).expect("read trellis-events.cbor");
    let trellis: TrellisEventsBundle =
        ciborium::from_reader(trellis_bytes.as_slice()).expect("decode Trellis events CBOR");
    assert_eq!(trellis.events.len(), 1);
    let event = &trellis.events[0];
    assert_eq!(event.event_kind, "wos.kernel.signature_affirmation");
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
            .any(|method| method.as_str() == Some(fixture.signature_method.as_str())),
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
    assert_eq!(event.event_kind, "wos.kernel.signature_admission_failed");
    assert!(
        !event.data.custody_hook_present,
        "failed admission must not create a custody hook"
    );
    assert_eq!(
        event.data.signed_payload_digest,
        fixture.signature.signed_payload.digest
    );
    assert_eq!(
        event.data.verification_receipt.as_deref(),
        Some(
            base64::engine::general_purpose::STANDARD
                .encode(&fixture.receipt_bytes)
                .as_str()
        )
    );
    assert_eq!(
        event.data.admission_failed_reason.as_deref(),
        Some("method_unsupported")
    );
}

#[test]
fn test_bundle_004_tampered_signature_admission_failed() {
    use base64::Engine;
    use formspec_signature_adapter_ring::RingVerifier;
    use formspec_signature_port::{
        KeyRef, SignatureMethodRegistry, VerificationResult, Verifier, VerifyRequest,
    };

    let root = cross_stack_root();
    let bundles = discover_bundles(root.to_str().unwrap()).unwrap();
    let b004 = bundles
        .iter()
        .find(|b| b.id == "004")
        .expect("bundle 004 not found");

    let wos = b004
        .manifest
        .expected_outcomes
        .wos
        .as_ref()
        .expect("wos outcome missing");
    assert_eq!(wos.record_kind.as_deref(), Some("signatureAdmissionFailed"));
    assert_eq!(
        wos.admission_failed_reason.as_deref(),
        Some("primitive_verification_failed"),
        "bundle 004 manifest must pin primitive_verification_failed reason"
    );

    let fixture = load_verified_response_fixture("004-tampered-signature-failed");

    // Wedge: the COSE_Sign1 signatureValue was byte-mutated, so the ring
    // verifier MUST report failed. This is the byte-level proof that bundle 004
    // exercises the tamper path rather than the verified path.
    let registry_path = formspec_root().join("registries/signature-method-registry.json");
    let registry: SignatureMethodRegistry =
        serde_json::from_str(&std::fs::read_to_string(registry_path).expect("read registry"))
            .expect("parse registry");
    let signature_bytes = base64::engine::general_purpose::STANDARD
        .decode(&fixture.signature.signature_value)
        .expect("decode signatureValue");
    let key_bytes = base64::engine::general_purpose::STANDARD
        .decode(fixture.receipt.key.r#ref.as_str())
        .expect("decode receipt.key.ref as base64 raw public key");
    let verifier = RingVerifier::new();
    let verification = verifier
        .verify(
            &VerifyRequest {
                signed_bytes: fixture.signed_bytes.clone(),
                signature_bytes,
                signature_method: fixture.signature_method.as_str().into(),
                key_ref: KeyRef::RawPublicKey(key_bytes),
            },
            &registry,
        )
        .expect("ring verification call must complete");
    assert_eq!(
        verification.result.to_string(),
        VerificationResult::Failed.to_string(),
        "tampered signature byte must drive ring verifier to failed"
    );
    assert_eq!(
        fixture.receipt.result.to_string(),
        VerificationResult::Failed.to_string(),
        "bundle 004 receipt must attest failed verification"
    );

    let bundle_dir = cross_stack_root().join("004-tampered-signature-failed");
    let wos_bytes =
        std::fs::read(bundle_dir.join("wos-provenance.cbor")).expect("read wos-provenance.cbor");
    let wos_bundle: WosProvenanceBundle =
        ciborium::from_reader(wos_bytes.as_slice()).expect("decode WOS provenance CBOR");
    assert!(
        !wos_bundle
            .records
            .iter()
            .any(|record| record.record_kind == "signatureAffirmation"),
        "failed primitive verification must not admit a SignatureAffirmation"
    );
    assert_eq!(wos_bundle.records.len(), 1);
    let record = &wos_bundle.records[0];
    assert_eq!(record.record_kind, "signatureAdmissionFailed");
    let data: WosSignatureAdmissionFailedData =
        serde_json::from_value(record.data.clone()).expect("signatureAdmissionFailed data");
    assert_eq!(data.reason, "primitive_verification_failed");
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
    assert_eq!(data.evidence_bindings.signature_id, "sig-cross-stack-004");
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
    assert_eq!(event.event_kind, "wos.kernel.signature_admission_failed");
    assert!(
        !event.data.custody_hook_present,
        "failed admission must not create a custody hook"
    );
    assert_eq!(
        event.data.signed_payload_digest,
        fixture.signature.signed_payload.digest
    );
    assert_eq!(
        event.data.verification_receipt.as_deref(),
        Some(
            base64::engine::general_purpose::STANDARD
                .encode(&fixture.receipt_bytes)
                .as_str()
        )
    );
    assert_eq!(
        event.data.admission_failed_reason.as_deref(),
        Some("primitive_verification_failed")
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

/// Bundle 005 = evidence-divergence-rejected. Schema-valid response; semantic
/// check fails because `data.consentAcceptedAt` (the data-path consent
/// timestamp) diverges from `signedPayload.signedAt`. Receipt-less + WOS-less +
/// Trellis-less per manifest. Exercises [`load_response_fixture`] (no
/// `verification-receipt.cose` exists for this bundle).
#[test]
fn test_bundle_005_response_diverges_from_signed_payload_signed_at() {
    let root = cross_stack_root();
    let bundles = discover_bundles(root.to_str().unwrap()).unwrap();
    let b005 = bundles
        .iter()
        .find(|b| b.id == "005")
        .expect("bundle 005 not found");

    // Bundle 005 declares no receipt + no WOS + no Trellis; only response +
    // posture are byte-present.
    assert!(b005.manifest.required_files.formspec_response);
    assert!(b005.manifest.required_files.posture_declaration);
    assert!(!b005.manifest.required_files.verification_receipt);
    assert!(!b005.manifest.required_files.wos_provenance);
    assert!(!b005.manifest.required_files.trellis_events);

    // load_response_fixture runs schema validation + signedPayload binding
    // invariants + canonical digest recomputation. Bundle 005 is schema-valid;
    // the divergence is purely semantic (signedAt source-of-truth mismatch).
    let fixture = load_response_fixture("005-evidence-divergence-rejected");

    // Source-of-truth divergence: the data-path consent timestamp is
    // authoritative, but signedPayload.signedAt carries a different value. A
    // semantic verifier downstream surfaces SOURCE_OF_TRUTH_DIVERGENCE.
    let consent_accepted_at = fixture
        .response_json
        .get("data")
        .and_then(|d| d.get("consentAcceptedAt"))
        .and_then(|v| v.as_str())
        .expect("bundle 005 response data must carry consentAcceptedAt");
    assert_ne!(
        consent_accepted_at, fixture.signature.signed_payload.signed_at,
        "bundle 005 must encode signedAt divergence between data consent path and signedPayload"
    );

    // Posture admits the method/intent — divergence is the ONLY reason
    // admission fails. Forbidding the method or intent here would cross
    // bundle 005's evidence with bundle 003's (method_unsupported) wedge.
    let bundle_dir = cross_stack_root().join("005-evidence-divergence-rejected");
    let posture: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(bundle_dir.join("posture-declaration.json"))
            .expect("read posture"),
    )
    .expect("parse posture");
    let allowed_methods = posture["signaturePolicy"]["allowedMethods"]
        .as_array()
        .expect("allowedMethods array");
    assert!(
        allowed_methods
            .iter()
            .any(|m| m.as_str() == Some(fixture.signature_method.as_str())),
        "bundle 005 posture must admit the signature method"
    );
    let allowed_intents = posture["signaturePolicy"]["allowedSigningIntents"]
        .as_array()
        .expect("allowedSigningIntents array");
    assert!(
        allowed_intents
            .iter()
            .any(|i| i.as_str() == Some(fixture.signature.signing_intent.as_str())),
        "bundle 005 posture must admit the signing intent"
    );

    // No receipt / WOS / Trellis bytes exist. Asserting absence keeps the
    // bundle from drifting into the WOS-governed shape over time.
    assert!(!bundle_dir.join("verification-receipt.cose").exists());
    assert!(!bundle_dir.join("wos-provenance.cbor").exists());
    assert!(!bundle_dir.join("trellis-events.cbor").exists());
}

/// Bundle 006 = deferred-pending-helper. Signature method IS in the production
/// registry AND in posture allowedMethods, but the signing helper is not
/// bundled in this deployment, so the primitive verification status is
/// `deferredPendingHelper`. Posture admits it via
/// `minimumPrimitiveVerification: "deferredPendingHelper"`. WOS emits
/// `SignatureAffirmation` (NOT `SignatureAdmissionFailed`), Trellis records
/// the canonical event literal `wos.kernel.signature_affirmation`. Receipt-
/// less: no primitive verification ran, so no receipt exists.
#[test]
fn test_bundle_006_deferred_pending_helper_path() {
    use formspec_signature_port::SignatureMethodRegistry;

    let root = cross_stack_root();
    let bundles = discover_bundles(root.to_str().unwrap()).unwrap();
    let b006 = bundles
        .iter()
        .find(|b| b.id == "006")
        .expect("bundle 006 not found");

    // Required-file declaration: response + posture + WOS + Trellis, NO
    // receipt + NO export. This is the discriminant between bundle 006 (a
    // deferred-but-admitted path) and bundle 005 (a divergence-rejected path
    // with no WOS/Trellis records).
    assert!(b006.manifest.required_files.formspec_response);
    assert!(b006.manifest.required_files.posture_declaration);
    assert!(b006.manifest.required_files.wos_provenance);
    assert!(b006.manifest.required_files.trellis_events);
    assert!(!b006.manifest.required_files.verification_receipt);
    assert!(!b006.manifest.required_files.trellis_export);

    // Manifest pins the deferred-path discriminants.
    let wos_outcome = b006
        .manifest
        .expected_outcomes
        .wos
        .as_ref()
        .expect("bundle 006 manifest must declare wos outcome");
    assert_eq!(
        wos_outcome.record_kind.as_deref(),
        Some("signatureAffirmation")
    );
    assert_eq!(
        wos_outcome.primitive_verification_status.as_deref(),
        Some("deferredPendingHelper")
    );

    // load_response_fixture runs schema validation + signedPayload binding
    // invariants + canonical digest recomputation. Receipt-less path.
    let fixture = load_response_fixture("006-deferred-pending-helper");

    // Signature method MUST be in the production registry — the deferred path
    // is about a *registered* method whose helper isn't bundled, NOT a wholly
    // unregistered method (that's bundle 003's wedge).
    let registry_path = formspec_root().join("registries/signature-method-registry.json");
    let registry: SignatureMethodRegistry =
        serde_json::from_str(&std::fs::read_to_string(registry_path).expect("read registry"))
            .expect("parse registry");
    assert!(
        registry
            .entries
            .iter()
            .any(|e| e.id.as_str() == fixture.signature_method.as_str()),
        "bundle 006 signature method must be in the production registry"
    );

    let bundle_dir = cross_stack_root().join("006-deferred-pending-helper");

    // Posture: admits the method AND lowers minimumPrimitiveVerification to
    // `deferredPendingHelper`. Either of those alone would flip the bundle's
    // outcome — both together are load-bearing for the deferred-admit path.
    let posture: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(bundle_dir.join("posture-declaration.json"))
            .expect("read posture"),
    )
    .expect("parse posture");
    assert_eq!(
        posture["signaturePolicy"]["minimumPrimitiveVerification"].as_str(),
        Some("deferredPendingHelper"),
        "bundle 006 posture MUST lower the floor to deferredPendingHelper"
    );
    let allowed_methods = posture["signaturePolicy"]["allowedMethods"]
        .as_array()
        .expect("allowedMethods array");
    assert!(
        allowed_methods
            .iter()
            .any(|m| m.as_str() == Some(fixture.signature_method.as_str())),
        "bundle 006 posture must admit the signature method (registered + allowed)"
    );

    // No receipt exists — the discriminant for the deferred-helper path.
    assert!(
        !bundle_dir.join("verification-receipt.cose").exists(),
        "bundle 006 must NOT carry verification-receipt.cose — no primitive ran"
    );
    assert!(
        fixture.signature.verification_receipt.is_none(),
        "bundle 006 response signature MUST omit inline verificationReceipt"
    );

    // WOS provenance: signatureAffirmation (NOT admissionFailed), with
    // primitiveVerification.status = deferredPendingHelper, and no
    // verificationReceipt embedded.
    let wos_bytes =
        std::fs::read(bundle_dir.join("wos-provenance.cbor")).expect("read wos-provenance.cbor");
    let wos: WosProvenanceBundle =
        ciborium::from_reader(wos_bytes.as_slice()).expect("decode WOS provenance CBOR");
    assert_eq!(wos.records.len(), 1);
    let record = &wos.records[0];
    assert_eq!(
        record.record_kind, "signatureAffirmation",
        "deferred-pending-helper is an AFFIRMATION, not a rejection"
    );
    let data: WosSignatureAffirmationData =
        serde_json::from_value(record.data.clone()).expect("signatureAffirmation data");
    assert_eq!(data.source_signature_id, "sig-cross-stack-006");
    assert_eq!(
        data.signed_payload_digest, fixture.signature.signed_payload.digest,
        "WOS signedPayloadDigest must match Formspec signedPayload.digest (cross-layer byte equality)"
    );
    assert_eq!(data.signing_intent, fixture.signature.signing_intent);
    assert!(data.custody_hook_eligible);
    assert_eq!(
        data.primitive_verification.status, "deferredPendingHelper",
        "deferred-pending-helper bundle MUST surface deferredPendingHelper status, not verified"
    );
    assert!(
        data.verification_receipt.is_none(),
        "WOS signatureAffirmation MUST omit verificationReceipt on the deferred path — no primitive fired"
    );

    // Trellis: canonical event literal (`wos.kernel.signature_affirmation`)
    // per the WOS canonical substrate registry. Anti-regression wedge against
    // re-introducing the legacy camelCase `wos.signature.signatureAffirmation`
    // shim retired in fs-1j21.
    let trellis_bytes =
        std::fs::read(bundle_dir.join("trellis-events.cbor")).expect("read trellis-events.cbor");
    let trellis: TrellisEventsBundle =
        ciborium::from_reader(trellis_bytes.as_slice()).expect("decode Trellis events CBOR");
    assert_eq!(trellis.events.len(), 1);
    let event = &trellis.events[0];
    assert_eq!(
        event.event_kind, "wos.kernel.signature_affirmation",
        "bundle 006 trellis event MUST use the canonical WOS substrate literal — \
         the camelCase `wos.signature.signatureAffirmation` shim was retired with fs-1j21"
    );
    assert!(
        event.data.custody_hook_present,
        "manifest declares custody_hook_present = true for bundle 006"
    );
    assert_eq!(
        event.data.signed_payload_digest,
        fixture.signature.signed_payload.digest
    );
    assert!(
        event.data.verification_receipt.is_none(),
        "trellis event for deferred-pending-helper MUST omit verificationReceipt"
    );
    assert!(
        event.data.admission_failed_reason.is_none(),
        "affirmation path MUST NOT carry admissionFailedReason"
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

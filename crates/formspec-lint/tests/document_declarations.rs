//! Actual native Definition document declarations and standalone Screener boundaries.
// Rust guideline compliant 2026-02-21
use formspec_lint::{LintCode, lint};
use serde_json::{Value, json};

/// Load the shared authored declaration fixture.
fn definition() -> Value {
    serde_json::from_str(include_str!(
        "../../../tests/fixtures/definition-documents/valid.definition.json"
    ))
    .unwrap()
}

/// Assert the maintained linter emits a located owning refusal.
fn refused(doc: &Value, code: LintCode, suffix: &str) {
    let report = lint(doc);
    assert!(!report.valid);
    assert!(
        report
            .diagnostics
            .iter()
            .any(|d| d.code == code && d.path.ends_with(suffix)),
        "{:#?}",
        report.diagnostics
    );
}

#[test]
fn declared_inline_and_url_documents_with_shared_attestation_scope_pass() {
    let result = lint(&definition());
    assert!(result.valid, "{:#?}", result.diagnostics);
}

#[test]
fn absence_preserves_existing_definition_behavior() {
    let mut doc = definition();
    doc.as_object_mut().unwrap().remove("documents");
    for item in doc["items"].as_array_mut().unwrap() {
        item.as_object_mut().unwrap().remove("attests");
    }
    assert!(lint(&doc).valid);
}

#[test]
fn attestation_ids_resolve_in_the_same_definition_including_nested_repeats() {
    let mut doc = definition();
    let mut field = doc["items"][0].clone();
    field["attests"] = json!(["foreign"]);
    doc["items"] = json!([{"type":"group","key":"people","label":"People","repeatable":true,"children":[field]}]);
    refused(&doc, LintCode::E303, ".children[0].attests[0]");
    doc["items"][0]["children"][0]["attests"] = json!(["terms-v2"]);
    assert!(lint(&doc).valid);
    doc.as_object_mut().unwrap().remove("documents");
    refused(&doc, LintCode::E303, ".children[0].attests[0]");
}

#[test]
fn default_membership_and_unique_locale_identity_are_case_insensitive() {
    let mut doc = definition();
    doc["documents"]["terms-v2"]["defaultLocale"] = json!("EN-us");
    assert!(lint(&doc).valid);
    doc["documents"]["terms-v2"]["defaultLocale"] = json!("fr");
    refused(&doc, LintCode::E303, ".defaultLocale");
    doc = definition();
    doc["documents"]["terms-v2"]["variants"]["EN-us"] =
        doc["documents"]["terms-v2"]["variants"]["en-US"].clone();
    let result = lint(&doc);
    assert!(!result.valid);
    assert!(
        result
            .diagnostics
            .iter()
            .any(|d| d.code == LintCode::E303 && d.message.contains("case-equivalent"))
    );
}

#[test]
fn inline_digest_is_exact_source_bytes_not_url_or_ceremony_json() {
    let mut doc = definition();
    doc["documents"]["terms-v2"]["variants"]["en-US"]["documentHash"] = json!("0".repeat(64));
    refused(&doc, LintCode::E303, ".documentHash");
    // URL bytes are unavailable here: a declaration is not a fetch/integrity verdict.
    doc = definition();
    doc["documents"]["privacy-v1"]["variants"]["en"]["documentHash"] = json!("0".repeat(64));
    doc["documents"]["privacy-v1"]["variants"]["en"]["source"]["href"] =
        json!("https://unreachable.invalid/private");
    assert!(lint(&doc).valid);
}

#[test]
fn base64_padding_bits_are_checked_beyond_schema_spelling() {
    let mut doc = definition();
    doc["documents"]["terms-v2"]["variants"]["en-US"]["source"]["data"] = json!("SGVsbG9=");
    refused(&doc, LintCode::E303, ".source.data");
}

#[test]
fn exact_one_mib_binary_source_is_accepted_without_text_normalization() {
    use base64::Engine;
    let mut doc = definition();
    let bytes = vec![255_u8; 1024 * 1024];
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    let variant = &mut doc["documents"]["terms-v2"]["variants"]["en-US"];
    variant["source"]["data"] = json!(encoded);
    // Independent Python hashlib vector: one MiB of 0xff, including non-UTF-8 bytes.
    variant["documentHash"] =
        json!("f5fb04aa5b882706b9309e885f19477261336ef76a150c3b4d3489dfac3953ec");
    assert!(lint(&doc).valid);
}

#[test]
fn inline_decoded_limit_is_enforced_even_within_encoded_length_bound() {
    use base64::Engine;
    let mut doc = definition();
    let bytes = vec![0_u8; 1024 * 1024 + 1];
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    assert_eq!(encoded.len(), 1_398_104);
    doc["documents"]["terms-v2"]["variants"]["en-US"]["source"]["data"] = json!(encoded);
    refused(&doc, LintCode::E303, ".source.data");
}

#[test]
fn schema_refuses_group_display_duplicate_refs_and_source_shape_errors() {
    for ty in ["group", "display"] {
        let mut doc = definition();
        doc["items"][0] =
            json!({"type":ty,"key":"invalid","label":"Invalid","attests":["terms-v2"]});
        assert!(!lint(&doc).valid);
    }
    let mut doc = definition();
    doc["items"][0]["attests"] = json!(["terms-v2", "terms-v2"]);
    assert!(!lint(&doc).valid);
}

#[test]
fn standalone_screener_refuses_top_level_and_nested_attests() {
    let baseline: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/lint/valid-screener-semantic.json"
    ))
    .unwrap();
    assert!(lint(&baseline).valid);
    for nested in [false, true] {
        let mut doc = baseline.clone();
        let field = json!({"type":"field","key":"attestation","label":"Attestation","dataType":"boolean","attests":["terms-v2"]});
        doc["items"].as_array_mut().unwrap().push(if nested {
            json!({"type":"group","key":"group","label":"Group","children":[field]})
        } else {
            field
        });
        refused(&doc, LintCode::E1508, ".attests");
    }
}

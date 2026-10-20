//! Response document bindings through the existing paired-Definition native API.
// Rust guideline compliant 2026-02-21
use formspec_lint::{LintOptions, lint_with_options};
use serde_json::{Value, json};
fn definition() -> Value {
    serde_json::from_str(include_str!(
        "../../../tests/fixtures/document-attestations/definition.json"
    ))
    .unwrap()
}
fn response() -> Value {
    serde_json::from_str(include_str!(
        "../../../tests/fixtures/document-attestations/prepared-response.json"
    ))
    .unwrap()
}
/// Structural evidence only: crypto qualification belongs to genuine engine COSE tests.
fn mirrored_response() -> Value {
    let mut doc = response();
    let commitment = doc["extensions"]["x-formspec-document-attestations"].clone();
    let records: Vec<Value> = commitment["attestations"].as_array().unwrap().iter().enumerate().map(|(index, selection)| {
        let mut record = commitment.as_object().unwrap().clone();
        for name in ["version", "fieldPath", "attestations", "signedAt"] { record.remove(name); }
        record.extend(selection.as_object().unwrap().clone());
        record.insert("documentId".into(), selection["documentRef"]["documentId"].clone());
        record.insert("signatureValue".into(), json!("TQ=="));
        record.insert("documentHashAlgorithm".into(), json!("sha-256"));
        for name in ["documentHash", "presentationHash"] { record.insert(name.into(), doc["resolvedDocuments"][index][name].clone()); }
        record.insert("signedPayload".into(), json!({"canonicalization":"formspec-response-signing-v1", "digestAlgorithm":"sha-256", "digest":"a".repeat(64), "responseId":doc["id"], "definitionUrl":doc["definitionUrl"], "definitionVersion":doc["definitionVersion"], "signedAt":commitment["signedAt"], "signingIntent":commitment["signingIntent"]}));
        Value::Object(record)
    }).collect();
    doc["authoredSignatures"] = json!(records);
    doc
}
fn report(doc: &Value, definition: Option<Value>) -> formspec_lint::LintResult {
    lint_with_options(
        doc,
        &LintOptions {
            definition_document: definition,
            ..LintOptions::default()
        },
    )
}
fn refuses(doc: &Value, definition: Option<Value>, code: &str, path: &str) {
    let result = report(doc, definition);
    assert!(!result.valid);
    assert!(
        result
            .diagnostics
            .iter()
            .any(|d| d.code == code && d.path.contains(path)),
        "{:#?}",
        result.diagnostics
    );
}
#[test]
fn supported_prepared_gesture_and_exact_declared_variants_pass() {
    let result = report(&response(), Some(definition()));
    assert!(result.valid, "{:#?}", result.diagnostics);
}
#[test]
fn new_resolved_documents_require_a_genuine_matching_paired_definition() {
    refuses(&response(), None, "E903", "definitionUrl");
    let mut definition = definition();
    definition["version"] = json!("different");
    refuses(&response(), Some(definition), "E903", "definitionVersion");
}
#[test]
fn foreign_variants_source_media_hash_and_duplicate_pairs_refuse() {
    for (field, value) in [
        ("documentId", json!("foreign")),
        ("locale", json!("fr")),
        ("mediaType", json!("application/pdf")),
        (
            "source",
            json!({"kind":"url","href":"https://foreign.invalid"}),
        ),
        ("documentHash", json!("0".repeat(64))),
    ] {
        let mut doc = response();
        doc["resolvedDocuments"][0][field] = value;
        refuses(&doc, Some(definition()), "E903", "resolvedDocuments");
    }
    let mut doc = response();
    let mut duplicate = doc["resolvedDocuments"][0].clone();
    duplicate["locale"] = json!("ES-us");
    doc["resolvedDocuments"]
        .as_array_mut()
        .unwrap()
        .push(duplicate);
    refuses(&doc, Some(definition()), "E903", "resolvedDocuments");
}
#[test]
fn field_scope_refuses_unknown_groups_missing_or_extra_documents_and_repeat_indices() {
    for field in ["missing", "signature[0]", "signature[*]"] {
        let mut doc = response();
        doc["extensions"]["x-formspec-document-attestations"]["fieldPath"] = json!(field);
        refuses(&doc, Some(definition()), "E904", "fieldPath");
    }
    let mut doc = response();
    doc["extensions"]["x-formspec-document-attestations"]["attestations"]
        .as_array_mut()
        .unwrap()
        .pop();
    refuses(&doc, Some(definition()), "E904", "attestations");
}

#[test]
fn complete_mirrors_pass_and_every_shared_claim_or_optional_presence_change_refuses() {
    let doc = mirrored_response();
    assert!(
        report(&doc, Some(definition())).valid,
        "{:#?}",
        report(&doc, Some(definition())).diagnostics
    );
    for field in [
        "signingActId",
        "signerId",
        "signerName",
        "signingIntent",
        "consentTextRef",
        "consentVersion",
        "affirmationText",
        "signatureProvider",
        "ceremonyId",
    ] {
        let mut changed = doc.clone();
        changed["authoredSignatures"][0][field] = json!("urn:changed");
        refuses(&changed, Some(definition()), "E904", field);
    }
    for (field, value) in [
        ("signerEvidence", json!({"kind":"typed","value":"Ada"})),
        ("identityProofRef", json!("urn:proof")),
        (
            "identityBinding",
            json!({"method":"email-otp","assuranceLevel":"standard"}),
        ),
    ] {
        let mut changed = doc.clone();
        changed["authoredSignatures"][0][field] = value.clone();
        refuses(&changed, Some(definition()), "E904", field);
        changed["extensions"]["x-formspec-document-attestations"][field] = value.clone();
        changed["authoredSignatures"][1][field] = value;
        assert!(
            report(&changed, Some(definition())).valid,
            "{field}: {:#?}",
            report(&changed, Some(definition())).diagnostics
        );
        changed["authoredSignatures"][0]
            .as_object_mut()
            .unwrap()
            .remove(field);
        refuses(&changed, Some(definition()), "E904", field);
    }
}

#[test]
fn record_selection_hash_presentation_and_payload_mirrors_refuse_independently() {
    for (field, value) in [
        ("documentId", json!("foreign")),
        ("documentHash", json!("0".repeat(64))),
        ("presentationHash", json!("0".repeat(64))),
        ("documentHashAlgorithm", json!("sha-512")),
        ("signatureValue", json!("Tg==")),
        (
            "documentRef",
            json!({"documentId":"privacy-v1","locale":"en"}),
        ),
        (
            "witnessedSignatureRef",
            json!({"responseId":"principal","signatureId":"p","signedPayloadDigest":"a".repeat(64)}),
        ),
    ] {
        let mut doc = mirrored_response();
        doc["authoredSignatures"][0][field] = value;
        refuses(&doc, Some(definition()), "E904", "authoredSignatures");
    }
    for (field, value) in [
        ("signedAt", json!("2026-10-21T19:01:00Z")),
        ("signingIntent", json!("urn:changed")),
        ("digest", json!("b".repeat(64))),
        (
            "canonicalization",
            json!("formspec-response-section-signing-v1"),
        ),
    ] {
        let mut doc = mirrored_response();
        doc["authoredSignatures"][0]["signedPayload"][field] = value;
        refuses(
            &doc,
            Some(definition()),
            "E904",
            if field == "digest" {
                "authoredSignatures"
            } else {
                "signedPayload"
            },
        );
    }
    let mut doc = mirrored_response();
    doc["authoredSignatures"][0]
        .as_object_mut()
        .unwrap()
        .remove("presentationHash");
    refuses(&doc, Some(definition()), "E904", "presentationHash");
}

#[test]
fn partial_extra_duplicate_and_uncommitted_authored_claims_refuse() {
    let mut doc = mirrored_response();
    doc["authoredSignatures"].as_array_mut().unwrap().pop();
    refuses(&doc, Some(definition()), "E904", "authoredSignatures");
    let mut doc = mirrored_response();
    let extra = doc["authoredSignatures"][0].clone();
    doc["authoredSignatures"]
        .as_array_mut()
        .unwrap()
        .push(extra);
    refuses(&doc, Some(definition()), "E904", "authoredSignatures");
    let mut doc = mirrored_response();
    doc["authoredSignatures"][1]["signatureId"] = json!("sig-1");
    refuses(&doc, Some(definition()), "E904", "signatureId");
    let mut doc = mirrored_response();
    doc["extensions"]
        .as_object_mut()
        .unwrap()
        .remove("x-formspec-document-attestations");
    refuses(&doc, Some(definition()), "E904", "extensions");
    let mut doc = response();
    doc["extensions"]["x-formspec-document-attestations"]["attestations"][1] =
        doc["extensions"]["x-formspec-document-attestations"]["attestations"][0].clone();
    refuses(&doc, Some(definition()), "E904", "attestations");
}

#[test]
fn nested_repeat_requires_actual_concrete_instances_but_not_an_assent_value() {
    let mut definition = definition();
    let field = definition["items"][0].clone();
    definition["items"] = json!([{"key":"people","type":"group","label":"People","repeatable":true,"children":[{"key":"rounds","type":"group","label":"Rounds","repeatable":true,"children":[field]}]}]);
    let mut doc = response();
    doc["data"] = json!({"people":[{"rounds":[{}]}]});
    let path = &mut doc["extensions"]["x-formspec-document-attestations"]["fieldPath"];
    *path = json!("people[0].rounds[0].signature");
    assert!(
        report(&doc, Some(definition.clone())).valid,
        "{:#?}",
        report(&doc, Some(definition.clone())).diagnostics
    );
    for path in [
        "people[1].rounds[0].signature",
        "people[0].rounds[1].signature",
        "people.rounds.signature",
        "people[*].rounds[0].signature",
        "people[0].rounds[0]",
    ] {
        doc["extensions"]["x-formspec-document-attestations"]["fieldPath"] = json!(path);
        refuses(&doc, Some(definition.clone()), "E904", "fieldPath");
    }
}

#[test]
fn legacy_responses_and_passive_resolved_variants_preserve_distinct_claims() {
    let mut passive = response();
    passive["extensions"]
        .as_object_mut()
        .unwrap()
        .remove("x-formspec-document-attestations");
    assert!(report(&passive, Some(definition())).valid);
    let mut legacy = passive;
    legacy.as_object_mut().unwrap().remove("resolvedDocuments");
    assert!(report(&legacy, None).valid);
    let mut bad_definition = definition();
    bad_definition["documents"]["terms-v2"]["variants"]["en-US"]["documentHash"] =
        json!("0".repeat(64));
    refuses(&response(), Some(bad_definition), "E903", "definitionUrl");
}

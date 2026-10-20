//! Bind resolved document selections to their Definition and committed signing gesture.
//!
//! This pass checks available JSON evidence only. It does not fetch URL bytes,
//! authenticate a signer, verify COSE, or qualify an external witness. Those
//! checks remain with the signing/verifying owner and governed host admission.
// Rust guideline compliant 2026-02-21

use std::collections::{HashMap, HashSet};

use formspec_core::{DocumentType, visit_definition_items_from_document};
use serde_json::Value;

use crate::semantic_helpers::{StrictPathSegment, error, parse_form_path, resolve_item_path};
use crate::{LintCode, LintDiagnostic, document_declarations, schema_validation, tree};

/// The typed extension is included in the unchanged whole-Response v1 preimage.
const COMMITMENT: &str = "x-formspec-document-attestations";
/// Existing metadata copied into signer-assented bytes, with exact optional presence.
const SHARED_CLAIMS: &[&str] = &[
    "signingActId",
    "signerId",
    "signerName",
    "signingIntent",
    "consentAccepted",
    "consentTextRef",
    "consentVersion",
    "affirmationText",
    "signatureProvider",
    "ceremonyId",
    "signerEvidence",
    "identityProofRef",
    "identityBinding",
];
/// Document IDs are case-sensitive; locale identity follows Core's ASCII tag grammar.
type DocumentKey = (String, String);

/// Check available document pins, Field scope, and exact authored metadata mirrors.
pub(crate) fn lint_document_attestations(
    response: &Value,
    definition: Option<&Value>,
) -> Vec<LintDiagnostic> {
    let commitment = response.get("extensions").and_then(|v| v.get(COMMITMENT));
    let signatures = response.get("authoredSignatures").and_then(Value::as_array);
    let has_claims = signatures.is_some_and(|entries| {
        entries.iter().any(|signature| {
            [
                "signingActId",
                "documentRef",
                "presentationHash",
                "witnessedSignatureRef",
            ]
            .iter()
            .any(|name| signature.get(name).is_some())
        })
    });
    if response.get("resolvedDocuments").is_none() && commitment.is_none() && !has_claims {
        return Vec::new();
    }

    let mut diagnostics = Vec::new();
    let definition = paired_definition(response, definition, &mut diagnostics);
    let documents = response.get("resolvedDocuments").and_then(Value::as_array);
    let resolved = check_resolved_documents(
        documents.map_or(&[], Vec::as_slice),
        definition,
        &mut diagnostics,
    );
    let Some(commitment) = commitment else {
        if has_claims {
            diagnostics.push(error(
                LintCode::E904,
                8,
                "$.extensions",
                "Declared-document signature claims require their typed root commitment",
            ));
        }
        return diagnostics;
    };
    let selections = commitment
        .get("attestations")
        .and_then(Value::as_array)
        .map_or(&[][..], Vec::as_slice);
    check_selections(
        response,
        definition,
        commitment,
        selections,
        &resolved,
        &mut diagnostics,
    );
    if let Some(signatures) = signatures.filter(|entries| !entries.is_empty()) {
        check_signature_mirrors(
            commitment,
            selections,
            signatures,
            &resolved,
            &mut diagnostics,
        );
    }
    diagnostics
}

/// Admit the explicit paired Definition before consuming its reference tables.
fn paired_definition<'a>(
    response: &Value,
    definition: Option<&'a Value>,
    diagnostics: &mut Vec<LintDiagnostic>,
) -> Option<&'a Value> {
    let Some(definition) = definition else {
        diagnostics.push(error(
            LintCode::E903,
            8,
            "$.definitionUrl",
            "Resolved documents require the exact paired Definition for semantic validation",
        ));
        return None;
    };
    if !schema_validation::validate_schema(definition, DocumentType::Definition).is_empty()
        || !document_declarations::lint_documents(definition).is_empty()
        || !tree::build_item_index(definition).diagnostics.is_empty()
    {
        diagnostics.push(error(
            LintCode::E903,
            8,
            "$.definitionUrl",
            "Paired Definition must have valid structure, declarations and item identity",
        ));
        return None;
    }
    let mut matches = true;
    for (response_name, definition_name) in
        [("definitionUrl", "url"), ("definitionVersion", "version")]
    {
        if response.get(response_name) != definition.get(definition_name) {
            diagnostics.push(error(
                LintCode::E903,
                8,
                format!("$.{response_name}"),
                "Resolved documents require the same immutable Definition pin as the Response",
            ));
            matches = false;
        }
    }
    matches.then_some(definition)
}

/// Form a lookup identity without changing any retained locale spelling.
fn document_key(value: &Value) -> Option<DocumentKey> {
    Some((
        value.get("documentId")?.as_str()?.to_owned(),
        value.get("locale")?.as_str()?.to_ascii_lowercase(),
    ))
}

/// Resolve each unique pair against the exact declared variant and source metadata.
fn check_resolved_documents<'a>(
    documents: &'a [Value],
    definition: Option<&Value>,
    diagnostics: &mut Vec<LintDiagnostic>,
) -> HashMap<DocumentKey, &'a Value> {
    let mut resolved = HashMap::new();
    for (index, entry) in documents.iter().enumerate() {
        let path = format!("$.resolvedDocuments[{index}]");
        let Some(key) = document_key(entry) else {
            continue;
        };
        if resolved.insert(key.clone(), entry).is_some() {
            diagnostics.push(error(
                LintCode::E903,
                8,
                &path,
                "Resolved document pairs must be unique under case-insensitive locale identity",
            ));
        }
        let Some(definition) = definition else {
            continue;
        };
        let variant = definition
            .get("documents")
            .and_then(|v| v.get(&key.0))
            .and_then(|v| v.get("variants"))
            .and_then(Value::as_object)
            .and_then(|variants| {
                variants
                    .iter()
                    .find(|(locale, _)| locale.eq_ignore_ascii_case(&key.1))
                    .map(|(_, value)| value)
            });
        let Some(variant) = variant else {
            diagnostics.push(error(
                LintCode::E903,
                8,
                &path,
                "Resolved document must select a declared document and locale variant",
            ));
            continue;
        };
        for field in ["source", "mediaType", "documentHash"] {
            if entry.get(field) != variant.get(field) {
                diagnostics.push(error(
                    LintCode::E903,
                    8,
                    format!("{path}.{field}"),
                    "Resolved source metadata must equal the exact pinned Definition variant",
                ));
            }
        }
        // presentationHash selects P12-framed artifact bytes. It is not a raw
        // source hash and cannot be recomputed without the host's selected artifact.
    }
    resolved
}

/// Check unique selections, resolved membership, and the referenced Field's entire scope.
fn check_selections(
    response: &Value,
    definition: Option<&Value>,
    commitment: &Value,
    selections: &[Value],
    resolved: &HashMap<DocumentKey, &Value>,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    let prefix = format!("$.extensions.{COMMITMENT}");
    let mut ids = HashSet::new();
    let mut pairs = HashSet::new();
    let mut selected_documents = HashSet::new();
    for (index, selection) in selections.iter().enumerate() {
        let path = format!("{prefix}.attestations[{index}]");
        if let Some(id) = selection.get("signatureId").and_then(Value::as_str) {
            if !ids.insert(id) {
                diagnostics.push(error(
                    LintCode::E904,
                    8,
                    format!("{path}.signatureId"),
                    "Each committed document record requires a unique signatureId",
                ));
            }
        }
        if let Some(key) = selection.get("documentRef").and_then(document_key) {
            selected_documents.insert(key.0.clone());
            if !pairs.insert(key.clone()) || !resolved.contains_key(&key) {
                diagnostics.push(error(
                    LintCode::E904,
                    8,
                    format!("{path}.documentRef"),
                    "Each selection must identify one unique resolved document/locale pair",
                ));
            }
        }
    }
    if let Some(definition) = definition {
        if let Some(path) = commitment.get("fieldPath").and_then(Value::as_str) {
            match field_scope(definition, response, path) {
                Ok(expected) if expected == selected_documents => {}
                Ok(_) => diagnostics.push(error(
                    LintCode::E904,
                    8,
                    format!("{prefix}.attestations"),
                    "Selected document IDs must equal the referenced Field attests scope",
                )),
                Err(reason) => diagnostics.push(error(
                    LintCode::E904,
                    8,
                    format!("{prefix}.fieldPath"),
                    reason,
                )),
            }
        }
    }
}

/// Resolve a concrete Field instance; an unset leaf value does not itself imply assent.
fn field_scope(
    definition: &Value,
    response: &Value,
    path: &str,
) -> Result<HashSet<String>, String> {
    let index = tree::build_item_index(definition);
    let item = resolve_item_path(path, &index, false)?
        .ok_or("Signing fieldPath does not resolve in the paired Definition")?;
    if item.data_type.is_none() {
        return Err("Signing fieldPath must select a Field".into());
    }
    let segments = parse_form_path(path, false)?;
    let mut cursor = response.get("data");
    let mut definition_path = String::new();
    for (position, segment) in segments.iter().enumerate() {
        match segment {
            StrictPathSegment::Exact(name) => {
                if !definition_path.is_empty() {
                    definition_path.push('.');
                }
                definition_path.push_str(name);
                let object = cursor
                    .and_then(Value::as_object)
                    .ok_or("Signing fieldPath containers must exist in Response.data")?;
                if index.repeatable_groups.contains(&definition_path)
                    && !matches!(
                        segments.get(position + 1),
                        Some(StrictPathSegment::Indexed(_))
                    )
                {
                    return Err(
                        "Signing fieldPath requires a concrete index for each repeat".into(),
                    );
                }
                cursor = object.get(name);
            }
            StrictPathSegment::Indexed(position) => {
                cursor = cursor
                    .and_then(Value::as_array)
                    .and_then(|values| values.get(*position));
                if cursor.is_none() {
                    return Err(
                        "Signing fieldPath repeat index does not exist in Response.data".into(),
                    );
                }
            }
            _ => {
                return Err(
                    "Signing fieldPath must be a concrete Field path without wildcards or aliases"
                        .into(),
                );
            }
        }
    }
    let mut scope = HashSet::new();
    visit_definition_items_from_document(definition, &mut |ctx| {
        if ctx.dotted_path == item.full_path {
            if let Some(ids) = ctx.item.get("attests").and_then(Value::as_array) {
                scope.extend(ids.iter().filter_map(Value::as_str).map(str::to_owned));
            }
        }
    });
    if scope.is_empty() {
        return Err("Signing fieldPath must select a Field with declared attests scope".into());
    }
    Ok(scope)
}

/// Require exactly the committed records and preserve every optional metadata distinction.
fn check_signature_mirrors(
    commitment: &Value,
    selections: &[Value],
    signatures: &[Value],
    resolved: &HashMap<DocumentKey, &Value>,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    if signatures.len() != selections.len() {
        diagnostics.push(error(
            LintCode::E904,
            8,
            "$.authoredSignatures",
            "A committed gesture requires exactly one record per selected document",
        ));
    }
    let selected: HashMap<&str, &Value> = selections
        .iter()
        .filter_map(|value| Some((value.get("signatureId")?.as_str()?, value)))
        .collect();
    let mut ids = HashSet::new();
    for (index, signature) in signatures.iter().enumerate() {
        let prefix = format!("$.authoredSignatures[{index}]");
        let id = signature
            .get("signatureId")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let Some(selection) = selected.get(id) else {
            diagnostics.push(error(
                LintCode::E904,
                8,
                format!("{prefix}.signatureId"),
                "Authored record is not a member of the signed gesture",
            ));
            continue;
        };
        if !ids.insert(id) {
            diagnostics.push(error(
                LintCode::E904,
                8,
                format!("{prefix}.signatureId"),
                "Authored signature IDs must be unique",
            ));
        }
        for field in SHARED_CLAIMS {
            if signature.get(field) != commitment.get(field) {
                diagnostics.push(error(LintCode::E904, 8, format!("{prefix}.{field}"), "Authored metadata must exactly mirror the signer-assented gesture, including optional presence"));
            }
        }
        for field in ["documentRef", "witnessedSignatureRef"] {
            if signature.get(field) != selection.get(field) {
                diagnostics.push(error(
                    LintCode::E904,
                    8,
                    format!("{prefix}.{field}"),
                    "Authored selection must exactly mirror its signer-assented document record",
                ));
            }
        }
        let payload = &signature["signedPayload"];
        for (field, expected) in [
            (
                "canonicalization",
                Some(&Value::String("formspec-response-signing-v1".into())),
            ),
            ("digestAlgorithm", Some(&Value::String("sha-256".into()))),
            ("signedAt", commitment.get("signedAt")),
            ("signingIntent", commitment.get("signingIntent")),
        ] {
            if payload.get(field) != expected {
                diagnostics.push(error(LintCode::E904, 8, format!("{prefix}.signedPayload.{field}"), "Declared document claims require whole-response v1 and matching committed metadata"));
            }
        }
        if signature.get("signatureValue") != signatures[0].get("signatureValue")
            || payload.get("digest") != signatures[0]["signedPayload"].get("digest")
        {
            diagnostics.push(error(LintCode::E904, 8, &prefix, "One signing gesture requires the same COSE evidence and whole-response digest for every selected document"));
        }
        let digest = payload
            .get("digest")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if digest.len() != 64
            || !digest
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        {
            diagnostics.push(error(LintCode::E904, 8, format!("{prefix}.signedPayload.digest"), "Declared document evidence requires the exact lowercase SHA-256 signed-payload digest"));
        }
        if let Some(reference) = selection.get("documentRef") {
            if signature.get("documentId") != reference.get("documentId") {
                diagnostics.push(error(
                    LintCode::E904,
                    8,
                    format!("{prefix}.documentId"),
                    "Legacy documentId must equal the committed documentRef.documentId",
                ));
            }
            if let Some(document) = document_key(reference).and_then(|key| resolved.get(&key)) {
                for field in ["documentHash", "presentationHash"] {
                    if signature.get(field) != document.get(field) {
                        diagnostics.push(error(LintCode::E904, 8, format!("{prefix}.{field}"), "Authored document digests must exactly mirror the resolved source/presentation selection"));
                    }
                }
                if signature
                    .get("documentHashAlgorithm")
                    .and_then(Value::as_str)
                    != Some("sha-256")
                {
                    diagnostics.push(error(
                        LintCode::E904,
                        8,
                        format!("{prefix}.documentHashAlgorithm"),
                        "Declared source documents use SHA-256",
                    ));
                }
            }
        }
    }
}

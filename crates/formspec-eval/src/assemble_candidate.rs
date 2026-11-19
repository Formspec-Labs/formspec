//! Assemble the Response evidence that is covered by signing.

use std::collections::BTreeMap;

use fel_core::exact_json::{self, Value};
use formspec_core::instance_resolution::{
    DeliveredSelection, MappingReference, SelectedRecord, Sha256Digest,
};
use serde::Serialize;
use thiserror::Error;

/// Why a candidate's Response instance evidence could not be assembled.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum CandidateAssemblyError {
    /// The Response must be a JSON object.
    #[error("Response must be an object")]
    InvalidResponse,
    /// The host did not deliver a required instance.
    #[error("Response instance '{0}' is unavailable")]
    Unavailable(String),
    /// The host's pinned flag differs from the declared pin policy.
    #[error("Response instance '{0}' has a pin status that disagrees with the Definition")]
    PinMismatch(String),
    /// The host supplied Mapping evidence for an empty match or an unmapped instance.
    #[error("Response instance '{0}' has an unexpected Mapping")]
    UnexpectedMapping(String),
    /// The host omitted the declared Mapping.
    #[error("Response instance '{0}' is missing its declared Mapping")]
    MissingMapping(String),
    /// The host supplied a different Mapping URL.
    #[error("Response instance '{0}' has a Mapping URL that disagrees with the Definition")]
    MappingUrlMismatch(String),
    /// An instance selecting completed filings received a record without a hash.
    #[error("Response instance '{0}' has a completed record without responseHash")]
    MissingResponseHash(String),
    /// A latest-only instance received multiple records.
    #[error("Response instance '{0}' has more than one record for a latest selection")]
    TooManyRecords(String),
    /// The declared empty-match policy does not permit a fallback delivery.
    #[error("Response instance '{0}' requires whenNone: empty to deliver an empty match")]
    UnexpectedEmptyMatch(String),
    /// The host's empty-match flag disagrees with the presence of records.
    #[error("Response instance '{0}' has inconsistent empty-match evidence")]
    InconsistentEmptyMatch(String),
    /// The evaluation report's candidate explanations could not be assembled.
    #[error("invalid Response explanation evidence: {0}")]
    InvalidExplanations(String),
    /// The evidence could not be serialized.
    #[error("invalid Response instance evidence: {0}")]
    Serialize(#[from] serde_json::Error),
}

/// The signed evidence fields of a delivered value, without the value itself.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ResolvedInstance<'a> {
    instance: &'a str,
    records: &'a [SelectedRecord],
    value_digest: &'a Sha256Digest,
    none: bool,
    pinned: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    mapping: Option<&'a MappingReference>,
}

/// Set the evidence for the Response instance values used in evaluation.
///
/// Supply the selector's available deliveries by Definition instance name. Each
/// delivery already contains the exact projected value's digest and the selected
/// records' host identities. Entries are emitted in instance name order, and
/// selected records retain selection order. The evaluation report is reserved
/// for explanation assembly (ADR 0173).
///
/// # Errors
///
/// Returns an error if the Response is not an object or a required delivery
/// is missing or disagrees with its declaration.
pub fn assemble_candidate(
    definition: &Value,
    mut response: Value,
    evaluation: &Value,
    resolution: &BTreeMap<String, DeliveredSelection>,
) -> Result<Value, CandidateAssemblyError> {
    let response_object = response
        .as_object_mut()
        .ok_or(CandidateAssemblyError::InvalidResponse)?;
    let mut declarations: Vec<_> = definition["instances"]
        .as_object()
        .into_iter()
        .flatten()
        .filter_map(|(name, instance)| {
            let declaration = &instance["response"];
            declaration.is_object().then_some((name, declaration))
        })
        .collect();
    declarations.sort_unstable_by_key(|(name, _)| *name);
    if declarations.is_empty() {
        response_object.shift_remove("resolvedInstances");
    } else {
        let evidence = declarations
            .into_iter()
            .map(|(instance, declaration)| {
                let delivery = resolution
                    .get(instance)
                    .ok_or_else(|| CandidateAssemblyError::Unavailable(instance.clone()))?;
                check_delivery(instance, declaration, delivery)?;
                Ok(ResolvedInstance {
                    instance,
                    records: &delivery.records,
                    value_digest: &delivery.value_digest,
                    none: delivery.none,
                    pinned: delivery.pinned,
                    mapping: delivery.mapping.as_ref(),
                })
            })
            .collect::<Result<Vec<_>, CandidateAssemblyError>>()?;
        response_object.insert("resolvedInstances".into(), exact_json::to_value(&evidence)?);
    }

    match evaluation
        .as_object()
        .and_then(|eval| eval.get("candidateExplanations"))
        .filter(|value| !value.is_null())
    {
        Some(candidate_explanations) => {
            let entries = candidate_explanations.as_array().ok_or_else(|| {
                CandidateAssemblyError::InvalidExplanations(
                    "candidateExplanations must be an array".into(),
                )
            })?;
            let mut normalized = Vec::with_capacity(entries.len());
            for entry in entries {
                let mut entry = entry.clone();
                let obj = entry.as_object_mut().ok_or_else(|| {
                    CandidateAssemblyError::InvalidExplanations(
                        "explanation entry must be an object".into(),
                    )
                })?;
                if obj.get("group").and_then(Value::as_bool) == Some(true)
                    && let Some(paths) = obj.get_mut("paths").and_then(Value::as_array_mut)
                {
                    paths.sort_by(|a, b| a.as_str().cmp(&b.as_str()));
                }
                normalized.push(entry);
            }
            if normalized.is_empty() {
                response_object.shift_remove("explanations");
            } else {
                response_object.insert("explanations".into(), Value::Array(normalized));
            }
        }
        None if response_object.contains_key("explanations") => {
            return Err(CandidateAssemblyError::InvalidExplanations(
                "missing settled candidateExplanations for Response explanations".into(),
            ));
        }
        None => {}
    }

    Ok(response)
}

/// Compare Definition-owned facts before copying the host's evidence.
fn check_delivery(
    instance: &str,
    declaration: &Value,
    delivery: &DeliveredSelection,
) -> Result<(), CandidateAssemblyError> {
    use CandidateAssemblyError::*;

    if delivery.none != delivery.records.is_empty() {
        return Err(InconsistentEmptyMatch(instance.into()));
    }
    if delivery.none && declaration["whenNone"].as_str() != Some("empty") {
        return Err(UnexpectedEmptyMatch(instance.into()));
    }
    if delivery.pinned != (declaration["pin"].as_str() == Some("at-open")) {
        return Err(PinMismatch(instance.into()));
    }
    // An empty match delivers the fallback directly.
    let expected_mapping = if delivery.none {
        None
    } else {
        declaration["mapping"].as_str()
    };
    match (expected_mapping, delivery.mapping.as_ref()) {
        (None, Some(_)) => return Err(UnexpectedMapping(instance.into())),
        (Some(_), None) => return Err(MissingMapping(instance.into())),
        (Some(url), Some(mapping)) if mapping.url != url => {
            return Err(MappingUrlMismatch(instance.into()));
        }
        _ => {}
    }
    if declaration["cardinality"].as_str() == Some("latest") && delivery.records.len() > 1 {
        return Err(TooManyRecords(instance.into()));
    }
    if declaration["status"].as_str() == Some("completed")
        && delivery
            .records
            .iter()
            .any(|record| record.response_hash.is_none())
    {
        return Err(MissingResponseHash(instance.into()));
    }
    Ok(())
}

/// Assemble a candidate from exact JSON text for bindings and storage adapters.
///
/// # Errors
///
/// Returns an error if inputs cannot be decoded or candidate assembly fails.
pub fn assemble_candidate_json(
    definition_json: &str,
    response_json: &str,
    evaluation_json: &str,
    resolution_json: &str,
) -> Result<String, String> {
    let definition = exact_json::from_str(definition_json)
        .map_err(|error| format!("invalid Definition: {error}"))?;
    let response = exact_json::from_str(response_json)
        .map_err(|error| format!("invalid Response: {error}"))?;
    let evaluation = exact_json::from_str(evaluation_json)
        .map_err(|error| format!("invalid evaluation report: {error}"))?;
    let resolution = serde_json::from_str(resolution_json)
        .map_err(|error| format!("invalid Response instance resolution: {error}"))?;
    let candidate = assemble_candidate(&definition, response, &evaluation, &resolution)
        .map_err(|error| error.to_string())?;
    serde_json::to_string(&candidate).map_err(|error| error.to_string())
}

//! Warning answers checked against the resolved reads of submit-profile Shape firings.

use std::collections::{BTreeMap, BTreeSet, HashMap};

use fel_core::exact_json::Value;
use integrity_canonical::{
    DOMAIN_SEPARATOR_BYTE, DigestAlgorithm, canonical_json_from_bytes, compute_digest,
};
use serde::Serialize;
use serde_json::json;

use crate::types::{ConstraintKind, Severity, ValidationCode, ValidationResult, ValidationSource};

/// The authored action for a warning requiring an answer.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ExplanationMode {
    /// Per-firing acknowledgement, with optional text.
    Confirm,
    /// Per-firing explanation with required text.
    Explain,
    /// Acknowledgement of the firings sharing a code.
    Acknowledge,
}

/// One explainable warning in the settled submit evaluation.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplanationFinding {
    /// Authored Shape id.
    pub shape_id: String,
    /// Resolved target, including zero-based repeat indexes.
    pub path: String,
    /// Machine-readable finding code.
    pub code: String,
    /// Effective action after the Shape override.
    pub mode: ExplanationMode,
    /// Resolved reference keys and exact value digests.
    pub inputs: BTreeMap<String, String>,
}

fn digest(domain: &str, value: &impl Serialize) -> Result<String, String> {
    let bytes = serde_json::to_vec(value).map_err(|error| error.to_string())?;
    let canonical = canonical_json_from_bytes(&bytes)?;
    let mut framed = Vec::with_capacity(domain.len() + 1 + canonical.len());
    framed.extend(domain.as_bytes());
    framed.push(DOMAIN_SEPARATOR_BYTE);
    framed.extend(canonical);
    Ok(format!(
        "sha256:{}",
        compute_digest(&framed, DigestAlgorithm::Sha256)
    ))
}

/// Digest one resolved FEL reference without rounding JSON numbers.
///
/// # Errors
/// Returns the canonicalizer's refusal for an invalid value.
pub fn reference_digest(value: &Value) -> Result<String, String> {
    digest("formspec.explanation.ref.v1", value)
}

/// Stamp the basis for one concrete warning.
///
/// # Errors
/// Returns the canonicalizer's refusal for an invalid preimage.
pub fn instance_basis(
    shape_id: &str,
    path: &str,
    inputs: &BTreeMap<String, String>,
) -> Result<String, String> {
    digest(
        "formspec.explanation.basis.v1",
        &json!({
            "shapeId": shape_id, "path": path, "inputs": inputs.iter().collect::<Vec<_>>()
        }),
    )
}

/// Stamp a group's covered firings in wire order.
///
/// # Errors
/// Returns an error if any firing belongs to another code or mode, or canonicalization fails.
pub fn group_basis<'a>(
    code: &str,
    firings: impl IntoIterator<Item = &'a ExplanationFinding>,
) -> Result<String, String> {
    let mut rows = Vec::new();
    for firing in firings {
        if firing.code != code || firing.mode != ExplanationMode::Acknowledge {
            return Err("group basis requires acknowledge firings with the requested code".into());
        }
        rows.push((
            &firing.shape_id,
            &firing.path,
            firing.inputs.iter().collect::<Vec<_>>(),
        ));
    }
    rows.sort_unstable_by(|a, b| (&a.0, &a.1).cmp(&(&b.0, &b.1)));
    digest(
        "formspec.explanation.group-basis.v1",
        &json!({ "code": code, "firings": rows }),
    )
}

#[derive(Clone, Copy)]
enum Status {
    Required,
    Stale,
    Unused,
}

impl Status {
    fn result(self, shape: Option<&str>, path: &str, code: Option<&str>) -> ValidationResult {
        let (wire_code, message, severity) = match self {
            Self::Required => (
                "EXPLANATION_REQUIRED",
                "An answer to this warning is required.",
                Severity::Error,
            ),
            Self::Stale => (
                "EXPLANATION_STALE",
                "The answers covered by this warning have changed.",
                Severity::Error,
            ),
            Self::Unused => (
                "EXPLANATION_UNUSED",
                "This warning no longer requires an answer.",
                Severity::Info,
            ),
        };
        ValidationResult {
            path: path.into(),
            severity,
            constraint_kind: ConstraintKind::Explanation,
            code: ValidationCode::from_wire(wire_code),
            message: message.into(),
            constraint: None,
            source: Some(ValidationSource::Shape),
            shape_id: shape.map(str::to_owned),
            context: code.map(|c| HashMap::from([("code".into(), Value::String(c.into()))])),
        }
    }
}

/// Compare draft entries to current firings, independently of draft-save authority checks.
pub(crate) fn compare(
    firings: &[ExplanationFinding],
    entries: &[Value],
    non_relevant: &[String],
) -> Result<Vec<ValidationResult>, String> {
    let mut instances = BTreeMap::new();
    let mut groups = BTreeMap::<&str, Vec<&Value>>::new();
    let mut group_ids = BTreeSet::new();
    for entry in entries {
        if entry["group"].as_bool() == Some(true) {
            let code = entry["code"].as_str().ok_or("missing explanation code")?;
            if !group_ids.insert((code, entry["partyRef"].as_str())) {
                return Err("duplicate group explanation".into());
            }
            groups.entry(code).or_default().push(entry);
        } else {
            let id = (
                entry["shapeId"]
                    .as_str()
                    .ok_or("missing explanation shapeId")?,
                entry["path"].as_str().ok_or("missing explanation path")?,
            );
            if instances.insert(id, entry).is_some() {
                return Err("duplicate instance explanation".into());
            }
        }
    }
    let mut results = Vec::new();
    let mut grouped = BTreeMap::<&str, Vec<&ExplanationFinding>>::new();
    for finding in firings {
        if finding.mode == ExplanationMode::Acknowledge {
            grouped.entry(&finding.code).or_default().push(finding);
            continue;
        }
        let id = (finding.shape_id.as_str(), finding.path.as_str());
        let status = match instances.remove(&id) {
            None => Some(Status::Required),
            Some(entry)
                if entry["basis"].as_str()
                    != Some(instance_basis(id.0, id.1, &finding.inputs)?.as_str()) =>
            {
                Some(Status::Stale)
            }
            Some(entry)
                if finding.mode == ExplanationMode::Explain
                    && entry["text"].as_str().unwrap_or("").is_empty() =>
            {
                Some(Status::Required)
            }
            _ => None,
        };
        if let Some(status) = status {
            results.push(status.result(Some(id.0), id.1, None));
        }
    }
    for (code, rows) in grouped {
        let status = match groups.remove(code) {
            None => Some(Status::Required),
            Some(entries) if !group_matches(code, &rows, &entries)? => Some(Status::Stale),
            _ => None,
        };
        if let Some(status) = status {
            results.push(status.result(None, "#", Some(code)));
        }
    }
    for (shape, path) in instances.keys() {
        if !non_relevant.iter().any(|hidden| {
            path.strip_prefix(hidden)
                .is_some_and(|suffix| suffix.is_empty() || suffix.starts_with(['.', '[']))
        }) {
            results.push(Status::Unused.result(Some(shape), path, None));
        }
    }
    results.extend(
        groups
            .keys()
            .map(|code| Status::Unused.result(None, "#", Some(code))),
    );
    Ok(results)
}

fn group_matches(
    code: &str,
    firings: &[&ExplanationFinding],
    entries: &[&Value],
) -> Result<bool, String> {
    let mut by_path = BTreeMap::<&str, Vec<&ExplanationFinding>>::new();
    for &firing in firings {
        by_path.entry(&firing.path).or_default().push(firing);
    }
    let mut covered = BTreeSet::new();
    for entry in entries {
        let paths = entry["paths"]
            .as_array()
            .ok_or("missing group explanation paths")?;
        let mut rows = Vec::new();
        let mut seen = BTreeSet::new();
        for path in paths {
            let path = path.as_str().ok_or("invalid group explanation path")?;
            if !seen.insert(path) {
                return Ok(false);
            }
            let Some(firings) = by_path.get(path) else {
                return Ok(false);
            };
            rows.extend(firings.iter().copied());
            covered.insert(path);
        }
        if rows.is_empty() || entry["basis"].as_str() != Some(group_basis(code, rows)?.as_str()) {
            return Ok(false);
        }
    }
    Ok(covered.len() == by_path.len())
}

/// Select current and stale entries in saved order, dropping unused entries even at hidden paths.
pub fn candidate_entries(entries: &[Value], firings: &[ExplanationFinding]) -> Vec<Value> {
    let mut groups = BTreeSet::new();
    let mut instances = BTreeSet::new();
    for f in firings {
        if f.mode == ExplanationMode::Acknowledge {
            groups.insert(f.code.as_str());
        } else {
            instances.insert((f.shape_id.as_str(), f.path.as_str()));
        }
    }
    entries
        .iter()
        .filter_map(|entry| {
            if entry["group"].as_bool() == Some(true) {
                if !groups.contains(entry["code"].as_str()?) {
                    return None;
                }
                let mut retained = entry.clone();
                if let Some(paths) = retained["paths"].as_array_mut() {
                    paths.sort_by(|a, b| a.as_str().cmp(&b.as_str()));
                }
                Some(retained)
            } else {
                instances
                    .contains(&(entry["shapeId"].as_str()?, entry["path"].as_str()?))
                    .then(|| entry.clone())
            }
        })
        .collect()
}

/// Add the basis the respondent can stamp to each actionable finding.
pub(crate) fn action_rows(firings: &[ExplanationFinding]) -> Result<Vec<Value>, String> {
    let mut groups = BTreeMap::<&str, Vec<&ExplanationFinding>>::new();
    for f in firings
        .iter()
        .filter(|f| f.mode == ExplanationMode::Acknowledge)
    {
        groups.entry(&f.code).or_default().push(f);
    }
    let bases = groups
        .into_iter()
        .map(|(code, rows)| Ok((code, group_basis(code, rows)?)))
        .collect::<Result<BTreeMap<_, _>, String>>()?;
    firings
        .iter()
        .map(|f| {
            let mut row = fel_core::exact_json::to_value(f).map_err(|e| e.to_string())?;
            if f.mode == ExplanationMode::Acknowledge {
                row["groupBasis"] = Value::String(bases[f.code.as_str()].clone());
            } else {
                row["basis"] = Value::String(instance_basis(&f.shape_id, &f.path, &f.inputs)?);
            }
            Ok(row)
        })
        .collect()
}

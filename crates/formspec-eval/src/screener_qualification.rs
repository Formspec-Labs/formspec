//! Qualify a native Screener result before selecting a bounded Surface destination.
//!
//! Evaluation, host authority, persistence, and navigation remain separate. This
//! module checks the native result against the exact invocation and supported
//! flat presentation. It does not evaluate expressions or modify the result.
// Rust guideline compliant 2026-02-21

use std::collections::{HashMap, HashSet};

use chrono::{DateTime, Timelike};
use serde::Serialize;
use serde_json::Value;

use crate::types::determination::{
    AnswerInput, AnswerState, DeterminationRecord, DeterminationStatus, PhaseStatus, PhaseStrategy,
};

/// A bounded qualification finding, using the JavaScript qualifier's wire names.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ScreenerQualificationRefusal {
    /// The document marker, URL, or semantic version is invalid.
    ScreenerPinInvalid,
    /// No presented items were declared.
    ItemsEmpty,
    /// An item needs unsupported presentation semantics.
    ItemUnsupported,
    /// Static single-choice options are missing or ambiguous.
    OptionsUnsupported,
    /// A bind needs unsupported presentation semantics.
    BindUnsupported,
    /// Result and selected document pins differ.
    DeterminationPinMismatch,
    /// Native evaluation did not complete.
    DeterminationNotCompleted,
    /// Invocation or acceptance time does not match this result.
    DeterminationTimeInvalid,
    /// Authored result validity is absent from the record.
    DeterminationValidityMissing,
    /// Result validity is malformed or has expired.
    DeterminationExpired,
    /// Expected inputs are missing or extra inputs are present.
    DeterminationInputCoverage,
    /// Input keys, types, or values contradict the supplied answers.
    DeterminationInputMismatch,
    /// A supplied or retained input was declined or not presented.
    DeterminationInputUnanswered,
    /// A required string answer is empty.
    DeterminationRequiredAnswer,
    /// Native phase diagnostics or strategy prevent qualification.
    DeterminationDiagnostics,
    /// Allowed destinations are empty, repeated, or unauthored.
    AllowedTargetInvalid,
    /// A result matched a destination outside the allowed set.
    DeterminationTargetDisallowed,
    /// The result does not select exactly one distinct destination.
    DeterminationTargetNotUnique,
}

/// A qualified destination or an explicit non-actionable finding.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum ScreenerDeterminationQualification {
    /// Exactly one authored, allowed target was selected.
    Ready {
        /// The native result's unchanged destination.
        target: String,
    },
    /// The caller must not navigate from this result.
    Refused {
        /// A typed qualification finding, distinct from transport failure.
        reason: ScreenerQualificationRefusal,
    },
}

/// Admit the supported flat Screener profile before enabling a host run service.
///
/// This pure check reuses qualification's item, bind, static-choice, phase and
/// route shape checks. It performs no evaluation and needs no fabricated answers.
/// Hosts still own document schema validation, size limits and selection authority.
///
/// # Errors
/// Returns the same typed unsupported-profile finding used by qualification.
pub fn admit_screener_qualification_profile(
    document: &Value,
) -> Result<(), ScreenerQualificationRefusal> {
    qualification_items(document).map(|_| ())
}

/// Qualify a native result against its exact invocation and allowed destinations.
///
/// `document`, `determination`, and typed `answers` must come from the caller's
/// admitted selection and evaluation. `evaluation_time` identifies that invocation;
/// `now_iso` is a fresh host-supplied acceptance time. RFC3339 instants compare at
/// JavaScript millisecond precision. `allowed_targets` supplies the exact authored
/// Surface destinations. This bounded API supports flat primitive/static-choice
/// items and literal required binds, matching the maintained JavaScript presenter.
///
/// A Ready result establishes these semantic checks only. It grants no actor,
/// publication, persistence, draft, or signing authority. The host must retain
/// and qualify those authorities separately. Inputs and the native result are
/// borrowed and remain unchanged. Incomplete native runs can be retained by the
/// host as pending evidence; their findings never authorize navigation.
#[must_use]
pub fn qualify_screener_determination(
    document: &Value,
    determination: &DeterminationRecord,
    answers: &HashMap<String, AnswerInput>,
    evaluation_time: &str,
    now_iso: &str,
    allowed_targets: &[String],
) -> ScreenerDeterminationQualification {
    use ScreenerQualificationRefusal as R;
    let items = match qualification_items(document) {
        Ok(items) => items,
        Err(reason) => return refuse(reason),
    };
    if determination.marker != "1.0"
        || document["url"].as_str() != Some(determination.screener.url.as_str())
        || document["version"].as_str() != Some(determination.screener.version.as_str())
        || document["version"].as_str() != Some(determination.evaluation_version.as_str())
    {
        return refuse(R::DeterminationPinMismatch);
    }
    if determination.status != DeterminationStatus::Completed {
        return refuse(R::DeterminationNotCompleted);
    }
    let (Some(evaluated), Some(invocation), Some(now)) = (
        instant(&determination.timestamp),
        instant(evaluation_time),
        instant(now_iso),
    ) else {
        return refuse(R::DeterminationTimeInvalid);
    };
    if evaluated != invocation || now < evaluated {
        return refuse(R::DeterminationTimeInvalid);
    }
    if document.get("resultValidity").is_some() && determination.validity.is_none() {
        return refuse(R::DeterminationValidityMissing);
    }
    if let Some(validity) = &determination.validity {
        let Some(expires) = instant(&validity.valid_until) else {
            return refuse(R::DeterminationExpired);
        };
        if expires < evaluated || expires <= now {
            return refuse(R::DeterminationExpired);
        }
    }
    if determination.inputs.len() != items.len() || answers.len() != items.len() {
        return refuse(R::DeterminationInputCoverage);
    }
    for item in items {
        let key = item["key"].as_str().unwrap_or_default();
        let (Some(entry), Some(answer)) = (determination.inputs.get(key), answers.get(key)) else {
            return refuse(R::DeterminationInputMismatch);
        };
        if entry.state != AnswerState::Answered || answer.state != AnswerState::Answered {
            return refuse(R::DeterminationInputUnanswered);
        }
        if !answer_matches(item, &entry.value) || !same_answer(&entry.value, &answer.value) {
            return refuse(R::DeterminationInputMismatch);
        }
        if entry.value.as_str() == Some("")
            && document["binds"].as_array().is_some_and(|binds| {
                binds
                    .iter()
                    .any(|bind| bind["path"] == key && bind["required"] == "true")
            })
        {
            return refuse(R::DeterminationRequiredAnswer);
        }
    }
    if determination.phases.iter().any(|phase| {
        phase.status == PhaseStatus::UnsupportedStrategy
            || matches!(phase.strategy, PhaseStrategy::Other(_))
            || !phase.warnings.is_empty()
    }) {
        return refuse(R::DeterminationDiagnostics);
    }
    let Some(phases) = document["evaluation"].as_array() else {
        return refuse(R::DeterminationDiagnostics);
    };
    let mut authored = HashSet::new();
    for phase in phases {
        let Some(routes) = phase["routes"].as_array() else {
            return refuse(R::DeterminationDiagnostics);
        };
        for route in routes {
            let Some(target) = route["target"].as_str() else {
                return refuse(R::DeterminationDiagnostics);
            };
            authored.insert(target);
        }
    }
    let allowed: HashSet<&str> = allowed_targets.iter().map(String::as_str).collect();
    if allowed.is_empty()
        || allowed.len() != allowed_targets.len()
        || allowed
            .iter()
            .any(|target| !target.starts_with("surface:") || !authored.contains(target))
    {
        return refuse(R::AllowedTargetInvalid);
    }
    let mut selected = HashSet::new();
    for matched in determination.overrides.matched.iter().chain(
        determination
            .phases
            .iter()
            .flat_map(|phase| phase.matched.iter()),
    ) {
        if !allowed.contains(matched.target.as_str()) {
            return refuse(R::DeterminationTargetDisallowed);
        }
        selected.insert(matched.target.as_str());
    }
    if selected.len() != 1 {
        return refuse(R::DeterminationTargetNotUnique);
    }
    ScreenerDeterminationQualification::Ready {
        target: selected.into_iter().next().unwrap_or_default().to_owned(),
    }
}

/// Construct a non-actionable qualification finding.
fn refuse(reason: ScreenerQualificationRefusal) -> ScreenerDeterminationQualification {
    ScreenerDeterminationQualification::Refused { reason }
}

/// Parse native timestamps using the browser qualifier's millisecond precision.
fn instant(value: &str) -> Option<i64> {
    if value.as_bytes().get(10) != Some(&b'T') || value.ends_with('z') {
        return None;
    }
    let date = DateTime::parse_from_rfc3339(value).ok()?;
    // JavaScript rejects leap-second spellings; chrono otherwise admits them.
    (date.nanosecond() < 1_000_000_000).then(|| date.timestamp_millis())
}

/// Check supported authored phases and reuse the bounded item/bind classifier.
fn qualification_items(document: &Value) -> Result<&Vec<Value>, ScreenerQualificationRefusal> {
    let items = presented_items(document)?;
    let phases = document["evaluation"]
        .as_array()
        .filter(|phases| !phases.is_empty())
        .ok_or(ScreenerQualificationRefusal::DeterminationDiagnostics)?;
    for phase in phases {
        if !matches!(
            phase["strategy"].as_str(),
            Some("first-match" | "fan-out" | "score-threshold")
        ) {
            return Err(ScreenerQualificationRefusal::DeterminationDiagnostics);
        }
        let routes = phase["routes"]
            .as_array()
            .ok_or(ScreenerQualificationRefusal::DeterminationDiagnostics)?;
        if routes
            .iter()
            .any(|route| route["target"].as_str().is_none())
        {
            return Err(ScreenerQualificationRefusal::DeterminationDiagnostics);
        }
    }
    Ok(items)
}

/// Admit the bounded flat presentation without interpreting expressions.
fn presented_items(document: &Value) -> Result<&Vec<Value>, ScreenerQualificationRefusal> {
    use ScreenerQualificationRefusal as R;
    let version = document["version"]
        .as_str()
        .and_then(|value| semver_rs::Version::new(value).parse().ok());
    if document["$formspecScreener"] != "1.0"
        || document["url"].as_str().is_none_or(str::is_empty)
        || version.is_none_or(|version| version.is_empty() || version.is_any())
    {
        return Err(R::ScreenerPinInvalid);
    }
    let items = document["items"]
        .as_array()
        .filter(|items| !items.is_empty())
        .ok_or(R::ItemsEmpty)?;
    let mut keys = HashSet::new();
    for item in items {
        let Some(object) = item.as_object() else {
            return Err(R::ItemUnsupported);
        };
        let key = item["key"].as_str().unwrap_or_default();
        if item["type"] != "field"
            || !key.as_bytes().first().is_some_and(u8::is_ascii_alphabetic)
            || !key
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
            || !keys.insert(key)
            || !matches!(
                item["dataType"].as_str(),
                Some("string" | "integer" | "decimal" | "boolean" | "choice")
            )
            || object.keys().any(|key| {
                ![
                    "type",
                    "key",
                    "dataType",
                    "label",
                    "options",
                    "extensions",
                    "x-generation",
                ]
                .contains(&key.as_str())
            })
        {
            return Err(R::ItemUnsupported);
        }
        if item["dataType"] == "choice" {
            let Some(options) = item["options"]
                .as_array()
                .filter(|options| !options.is_empty())
            else {
                return Err(R::OptionsUnsupported);
            };
            let mut values = HashSet::new();
            for option in options {
                let Some(value) = option["value"].as_str().filter(|value| !value.is_empty()) else {
                    return Err(R::OptionsUnsupported);
                };
                if !values.insert(value) {
                    return Err(R::OptionsUnsupported);
                }
            }
        } else if item.get("options").is_some() {
            return Err(R::OptionsUnsupported);
        }
    }
    if let Some(binds) = document.get("binds") {
        let Some(binds) = binds.as_array() else {
            return Err(R::BindUnsupported);
        };
        let mut paths = HashSet::new();
        for bind in binds {
            let Some(object) = bind.as_object() else {
                return Err(R::BindUnsupported);
            };
            let path = bind["path"].as_str().unwrap_or_default();
            if !keys.contains(path)
                || !paths.insert(path)
                || object
                    .keys()
                    .any(|key| !["path", "required"].contains(&key.as_str()))
                || bind
                    .get("required")
                    .is_some_and(|required| !matches!(required.as_str(), Some("true" | "false")))
            {
                return Err(R::BindUnsupported);
            }
        }
    }
    Ok(items)
}

/// Check the same supported primitive values as the JavaScript presenter.
fn answer_matches(item: &Value, value: &Value) -> bool {
    // Number.isSafeInteger's inclusive bound preserves browser/Rust value agreement.
    const MAX_JS_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;
    match item["dataType"].as_str() {
        Some("boolean") => value.is_boolean(),
        Some("string") => value.is_string(),
        Some("integer") => value.as_f64().is_some_and(|number| {
            number.is_finite() && number.fract() == 0.0 && number.abs() <= MAX_JS_SAFE_INTEGER
        }),
        Some("decimal") => value.as_f64().is_some_and(f64::is_finite),
        Some("choice") => {
            value.is_string()
                && item["options"]
                    .as_array()
                    .is_some_and(|options| options.iter().any(|option| option["value"] == *value))
        }
        _ => false,
    }
}

/// Compare JSON numeric spellings as the JavaScript primitive number type does.
fn same_answer(left: &Value, right: &Value) -> bool {
    if left.is_number() && right.is_number() {
        left.as_f64() == right.as_f64()
    } else {
        left == right
    }
}

//! Version strings under their `versionAlgorithm` (Core §6.2).

use serde_json::Value;

use crate::LintDiagnostic;
use crate::semantic_helpers::{error, parse_calendar_date};

/// Report a Definition version its algorithm rejects. The schema owns missing, empty and
/// mistyped properties and unknown algorithms.
pub(crate) fn check(doc: &Value) -> Option<LintDiagnostic> {
    let version = doc.get("version")?.as_str()?;
    let algorithm = match doc.get("versionAlgorithm") {
        Some(value) => value.as_str()?,
        None => "semver",
    };
    let conforms = match algorithm {
        "semver" => is_semver(version),
        "integer" => version.bytes().all(|b| b.is_ascii_digit()),
        "date" => parse_calendar_date(version, b'.').is_some(),
        _ => return None, // `natural` accepts any string.
    };
    (!version.is_empty() && !conforms).then(|| {
        error(
            crate::LintCode::E202,
            crate::LintCode::E202.pass(),
            "$.version",
            format!(
                "Definition version {version:?} does not match the {algorithm} version algorithm."
            ),
        )
    })
}

/// Semantic Versioning 2.0.0 syntax, without a bound on numeric components.
pub(crate) fn is_semver(value: &str) -> bool {
    let (without_build, build) = value.split_once('+').unwrap_or((value, ""));
    if value.contains('+') && !identifiers(build, |_| true) {
        return false;
    }
    let (core, pre_release) = without_build.split_once('-').unwrap_or((without_build, ""));
    if without_build.contains('-') && !identifiers(pre_release, |part| !is_padded_number(part)) {
        return false;
    }
    let parts = core.split('.').collect::<Vec<_>>();
    parts.len() == 3
        && parts.iter().all(|part| {
            !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit()) && !is_padded_number(part)
        })
}

/// Dot-separated non-empty `[0-9A-Za-z-]` identifiers that each satisfy `accept`.
fn identifiers(value: &str, accept: impl Fn(&str) -> bool) -> bool {
    value.split('.').all(|part| {
        !part.is_empty()
            && part.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
            && accept(part)
    })
}

/// A numeric identifier with a leading zero, which SemVer forbids outside build metadata.
fn is_padded_number(part: &str) -> bool {
    part.len() > 1 && part.starts_with('0') && part.bytes().all(|b| b.is_ascii_digit())
}

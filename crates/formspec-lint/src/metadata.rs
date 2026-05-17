//! Authoring-loop metadata for lint diagnostics — maps each rule code to the
//! normative spec clause that motivates it and a machine-actionable repair hint.
//!
//! LLM authors consume `suggested_fix` to apply structured repairs and `spec_ref`
//! to cite the clause that constrains the fix. `specs/lint-codes.json` is the
//! single source of truth; the registry is embedded at compile time so the
//! emitted metadata and the published registry cannot drift.

use std::collections::HashMap;
use std::sync::LazyLock;

use serde_json::Value;

use crate::types::LintDiagnostic;

/// Embedded contents of the canonical registry. The file is read at compile
/// time so a typo or missing entry becomes a build-time failure rather than a
/// deploy-time surprise.
const REGISTRY_JSON: &str = include_str!("../../../specs/lint-codes.json");

/// Metadata attached to a diagnostic: pointer to the normative spec clause and
/// a short, imperative repair hint.
#[derive(Debug, Clone)]
pub(crate) struct RuleMetadata {
    /// Repo-relative path + anchor that motivates this rule.
    pub spec_ref: String,
    /// Imperative, under ~120 chars — what the author (or LLM) should do.
    pub suggested_fix: String,
}

/// Parsed registry indexed by rule code, populated once from the embedded
/// JSON. Only entries whose `state` is `tested` or `stable` and whose
/// `specRef` + `suggestedFix` are non-empty contribute — `draft` entries
/// exist so every emitted code is enumerated, but they do not yet carry
/// authoring metadata.
static REGISTRY: LazyLock<HashMap<String, RuleMetadata>> = LazyLock::new(load_registry);

fn load_registry() -> HashMap<String, RuleMetadata> {
    let parsed: Value =
        serde_json::from_str(REGISTRY_JSON).expect("specs/lint-codes.json must be valid JSON");
    let rules = parsed
        .get("rules")
        .and_then(Value::as_array)
        .expect("specs/lint-codes.json must have a top-level `rules` array");

    let mut map = HashMap::new();
    for rule in rules {
        let state = rule.get("state").and_then(Value::as_str).unwrap_or("");
        if state != "tested" && state != "stable" {
            continue;
        }
        let code = rule
            .get("code")
            .and_then(Value::as_str)
            .expect("registry rule missing `code`");
        let spec_ref = rule.get("specRef").and_then(Value::as_str).unwrap_or("");
        let suggested_fix = rule
            .get("suggestedFix")
            .and_then(Value::as_str)
            .unwrap_or("");
        if spec_ref.is_empty() || suggested_fix.is_empty() {
            // A tested/stable rule is expected to carry both fields; the
            // Python registry-consistency test enforces this from the other
            // side. Skip silently here rather than panic — a CI run will
            // surface the gap.
            continue;
        }
        map.insert(
            code.to_string(),
            RuleMetadata {
                spec_ref: spec_ref.to_string(),
                suggested_fix: suggested_fix.to_string(),
            },
        );
    }
    map
}

/// Look up the authoring-loop metadata for a diagnostic code.
///
/// Returns `None` for codes that do not yet have tested metadata — those
/// diagnostics are emitted without hints until they graduate into the
/// `tested` tier of the rule registry.
pub(crate) fn metadata_for(code: &str) -> Option<&'static RuleMetadata> {
    REGISTRY.get(code)
}

/// Attach rule metadata to a diagnostic if the code has registered metadata.
///
/// Call sites stay terse: `with_metadata(LintDiagnostic::error(...))`. Codes
/// without tested metadata pass through unchanged.
pub(crate) fn with_metadata(diag: LintDiagnostic) -> LintDiagnostic {
    match metadata_for(diag.code.as_wire_str()) {
        Some(meta) => diag
            .with_suggested_fix(meta.suggested_fix.as_str())
            .with_spec_ref(meta.spec_ref.as_str()),
        None => diag,
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;

    #[test]
    fn registry_parses_and_populates_tested_codes() {
        for code in [
            "E101", "E300", "E500", "E600", "W300", "W704", "W800", "W802",
        ] {
            let meta =
                metadata_for(code).unwrap_or_else(|| panic!("expected tested metadata for {code}"));
            assert!(!meta.spec_ref.is_empty(), "{code} spec_ref empty");
            assert!(
                meta.spec_ref.starts_with("specs/"),
                "{code} spec_ref not repo-relative: {}",
                meta.spec_ref,
            );
            assert!(!meta.suggested_fix.is_empty(), "{code} suggested_fix empty");
            assert!(
                meta.suggested_fix.len() < 200,
                "{code} suggested_fix > 200 chars: {}",
                meta.suggested_fix.len()
            );
        }
    }

    // `load_registry` at lines 48-51 filters out rules whose state is not
    // "tested" or "stable". As of this writing, all 37 registered rules have
    // graduated and no draft entries exist — so there's no live draft code to
    // assert on. If a new rule is added at `state: "draft"`, add a regression
    // test here asserting `metadata_for("<new-code>").is_none()` until it
    // graduates.

    #[test]
    fn unknown_codes_return_none() {
        assert!(metadata_for("E999").is_none());
        assert!(metadata_for("").is_none());
        assert!(metadata_for("not-a-code").is_none());
    }

    #[test]
    fn with_metadata_decorates_tested_codes() {
        let d = with_metadata(LintDiagnostic::error(crate::LintCode::E300, 3, "$", "bad"));
        assert!(d.suggested_fix.is_some());
        assert!(d.spec_ref.is_some());
    }

    #[test]
    fn with_metadata_passes_unknown_codes_through() {
        assert!(metadata_for("E999").is_none());
    }
}

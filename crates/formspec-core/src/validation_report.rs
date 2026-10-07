//! Assemble validation-report candidates from qualified public findings.
//!
//! This pure helper mirrors the JavaScript `buildValidationReportEnvelope` algorithm.
//! Callers own evaluation, result tagging, clocks, Definition pins, and canonical
//! schema admission. An assembled candidate must pass that admission before use.

use serde_json::{Value, json};
use std::{backtrace::Backtrace, error::Error, fmt};

/// A finding cannot participate in report assembly.
#[derive(Debug)]
pub struct ValidationReportAssemblyError {
    /// Position of the rejected finding.
    index: usize,
    /// Property needed by the assembly algorithm.
    field: &'static str,
    /// Diagnostic trace captured without retaining finding values.
    backtrace: Backtrace,
}

impl ValidationReportAssemblyError {
    /// Record an assembly failure without copying potentially sensitive findings.
    fn new(index: usize, field: &'static str) -> Self {
        Self {
            index,
            field,
            backtrace: Backtrace::capture(),
        }
    }

    /// Return the zero-based position of the rejected finding.
    pub fn index(&self) -> usize {
        self.index
    }

    /// Return the invalid property, or `$` for a nonobject finding.
    pub fn field(&self) -> &'static str {
        self.field
    }
}

impl fmt::Display for ValidationReportAssemblyError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "Validation finding {} has invalid {}.\n{}",
            self.index, self.field, self.backtrace
        )
    }
}

impl Error for ValidationReportAssemblyError {}

/// Assemble a validation-report candidate without evaluating or admitting it.
///
/// `results` contains qualified, tagged public ValidationResult objects. Findings
/// retain their order and values; only cardinality findings lose `source`, matching
/// the maintained JavaScript assembler. The caller supplies `timestamp` and pins.
/// Empty optional pins are omitted, also matching JavaScript.
///
/// `Ok` is not canonical schema admission. The caller must validate the candidate
/// against the maintained ValidationReport schema before persistence, submission,
/// or deriving acceptance from its counts. In particular, internal Definition/cycle
/// findings must be refused by admission, never dropped or relabeled. Raw evaluator
/// receipt retention and explicit standard result tagging belong to the caller.
///
/// # Examples
/// ```
/// let candidate = formspec_core::build_validation_report(
///     &[], "2026-10-07T00:00:00Z", Some("urn:example"), Some("1.0.0"),
/// )?;
/// assert_eq!(candidate["counts"]["error"], 0);
/// // Admit the candidate with the host's canonical schema validator before use.
/// # Ok::<(), formspec_core::ValidationReportAssemblyError>(())
/// ```
///
/// # Errors
/// Returns an indexed error for a nonobject finding, a missing or conflicting
/// `$formspecValidationResult` marker, or a missing/unknown severity. Other schema
/// violations are the host's admission responsibility.
pub fn build_validation_report(
    results: &[Value],
    timestamp: &str,
    definition_url: Option<&str>,
    definition_version: Option<&str>,
) -> Result<Value, ValidationReportAssemblyError> {
    // Canonical public result/report markers use the specification version 1.0.
    const VERSION: &str = "1.0";
    let (mut errors, mut warnings, mut information) = (0_usize, 0_usize, 0_usize);
    let mut findings = Vec::with_capacity(results.len());
    for (index, result) in results.iter().enumerate() {
        let mut finding = result
            .as_object()
            .cloned()
            .ok_or_else(|| ValidationReportAssemblyError::new(index, "$"))?;
        if finding
            .get("$formspecValidationResult")
            .and_then(Value::as_str)
            != Some(VERSION)
        {
            return Err(ValidationReportAssemblyError::new(
                index,
                "$formspecValidationResult",
            ));
        }
        let count = match finding.get("severity").and_then(Value::as_str) {
            Some("error") => &mut errors,
            Some("warning") => &mut warnings,
            Some("info") => &mut information,
            _ => return Err(ValidationReportAssemblyError::new(index, "severity")),
        };
        *count += 1;
        if finding.get("constraintKind").and_then(Value::as_str) == Some("cardinality") {
            finding.remove("source");
        }
        findings.push(Value::Object(finding));
    }
    let mut report = json!({
        "$formspecValidationReport": VERSION,
        "valid": errors == 0,
        "results": findings,
        "counts": { "error": errors, "warning": warnings, "info": information },
        "timestamp": timestamp,
    });
    if let Some(url) = definition_url.filter(|value| !value.is_empty()) {
        report["definitionUrl"] = Value::String(url.to_owned());
    }
    if let Some(version) = definition_version.filter(|value| !value.is_empty()) {
        report["definitionVersion"] = Value::String(version.to_owned());
    }
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_public_javascript_fixtures_without_changing_input() {
        let fixtures: Value = serde_json::from_str(include_str!(
            "../tests/fixtures/validation-report-assembly.json"
        ))
        .unwrap();
        for case in fixtures.as_array().unwrap() {
            let input = case["results"].as_array().unwrap();
            let original = input.clone();
            let report = build_validation_report(
                input,
                case["timestamp"].as_str().unwrap(),
                case["definitionUrl"].as_str(),
                case["definitionVersion"].as_str(),
            )
            .unwrap();
            assert_eq!(report, case["expected"], "{}", case["name"]);
            assert_eq!(input, &original);
        }
    }

    #[test]
    fn refuses_malformed_assembly_inputs_with_indexed_safe_errors() {
        let good = json!({"$formspecValidationResult":"1.0", "severity":"info"});
        for (bad, field) in [
            (Value::Null, "$"),
            (json!({"severity":"error"}), "$formspecValidationResult"),
            (
                json!({"$formspecValidationResult":"2.0", "severity":"error"}),
                "$formspecValidationResult",
            ),
            (
                json!({"$formspecValidationResult":"1.0", "severity":"fatal", "message":"private-value"}),
                "severity",
            ),
            (json!({"$formspecValidationResult":"1.0"}), "severity"),
        ] {
            let error =
                build_validation_report(&[good.clone(), bad], "fixed", None, None).unwrap_err();
            assert_eq!(error.index(), 1);
            assert_eq!(error.field(), field);
            assert!(!format!("{error:?}").contains("private-value"));
        }
    }

    #[test]
    fn preserves_noncanonical_cycle_findings_for_host_refusal() {
        let cycle = json!({"$formspecValidationResult":"1.0", "severity":"error", "constraintKind":"definition", "source":"definition", "path":"#", "message":"cycle"});
        let report = build_validation_report(&[cycle.clone()], "fixed", None, None).unwrap();
        assert_eq!(report["results"][0], cycle);
        assert_eq!(report["valid"], false);
        assert_eq!(report["counts"]["error"], 1);
        // This remains a candidate: maintained schema admission rejects this finding.
    }
}

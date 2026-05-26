//! Bridges completed AppGraph reports into lint-facing diagnostics.
//!
//! This module validates `AppGraphValidationReport` JSON produced by the shared
//! app-graph package, then exposes diagnostics without mapping their codes into
//! the legacy lint-code enum. It does not load artifacts, run the TypeScript
//! resolver kernels, or reinterpret app-graph ownership.

#![expect(
    clippy::missing_docs_in_private_items,
    reason = "Private serde mirrors the published app-graph report schema."
)]

use std::sync::OnceLock;

use jsonschema::Validator;
use serde::Deserialize;
use serde_json::{Value, json};

/// Embedded AppGraph report schema.
///
/// The bridge consumes the lint-local mirror so the crate remains buildable
/// when packaged without the repository root.
const APP_GRAPH_REPORT_SCHEMA: &str =
    include_str!("../schemas/app-graph-validation-report.schema.json");

/// A lint-facing view of a completed app-graph validation report.
#[derive(Debug, Clone, PartialEq)]
pub struct AppGraphLintReport {
    /// Whether the source app-graph report was valid.
    pub ok: bool,
    /// Diagnostics preserved from the source app-graph report.
    pub diagnostics: Vec<AppGraphLintDiagnostic>,
}

/// An app-graph diagnostic preserved for lint consumers.
#[derive(Debug, Clone, PartialEq)]
pub struct AppGraphLintDiagnostic {
    /// Stable app-graph diagnostic code.
    pub code: String,
    /// Diagnostic severity from the app-graph report.
    pub severity: String,
    /// AppGraph report phase that produced or imported the diagnostic.
    pub phase: String,
    /// Producer origin from the app-graph report.
    pub origin: String,
    /// Human-readable diagnostic message.
    pub message: String,
    /// Primary source pointer preserved from the app-graph report.
    pub primary_source: Option<Value>,
    /// Related source pointers preserved from the app-graph report.
    pub related_sources: Vec<Value>,
    /// Stable machine-readable details preserved from the app-graph report.
    pub details: Option<Value>,
}

/// Schema validation errors for an app-graph report bridge input.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppGraphReportSchemaError {
    /// Schema-validation error messages.
    pub errors: Vec<String>,
}

impl std::fmt::Display for AppGraphReportSchemaError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.errors.join("; "))
    }
}

impl std::error::Error for AppGraphReportSchemaError {}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppGraphValidationReportJson {
    ok: bool,
    diagnostics: Vec<AppGraphDiagnosticJson>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppGraphDiagnosticJson {
    code: String,
    severity: String,
    phase: String,
    origin: String,
    message: String,
    #[serde(default)]
    primary_source: Option<Value>,
    #[serde(default)]
    related_sources: Vec<Value>,
    #[serde(default)]
    details: Option<Value>,
}

/// Bridges a completed app-graph validation report for lint consumers.
///
/// The function validates `report` against
/// `schemas/app-graph-validation-report.schema.json`, then copies diagnostics
/// into lint-facing structures without recoding app-graph diagnostic identity.
///
/// # Errors
///
/// Returns [`AppGraphReportSchemaError`] when `report` is not a valid
/// `AppGraphValidationReport`.
pub fn bridge_app_graph_report(
    report: &Value,
) -> Result<AppGraphLintReport, AppGraphReportSchemaError> {
    let schema_errors = app_graph_report_validator()
        .iter_errors(report)
        .map(|error| error.to_string())
        .collect::<Vec<_>>();
    if !schema_errors.is_empty() {
        return Err(AppGraphReportSchemaError {
            errors: schema_errors,
        });
    }

    let parsed: AppGraphValidationReportJson =
        serde_json::from_value(report.clone()).map_err(|error| AppGraphReportSchemaError {
            errors: vec![error.to_string()],
        })?;

    Ok(AppGraphLintReport {
        ok: parsed.ok,
        diagnostics: parsed
            .diagnostics
            .into_iter()
            .map(|diagnostic| AppGraphLintDiagnostic {
                code: diagnostic.code,
                severity: diagnostic.severity,
                phase: diagnostic.phase,
                origin: diagnostic.origin,
                message: diagnostic.message,
                primary_source: diagnostic.primary_source,
                related_sources: diagnostic.related_sources,
                details: diagnostic.details,
            })
            .collect(),
    })
}

/// Serializes a lint-facing app-graph report bridge result.
pub fn app_graph_lint_report_to_json_value(report: &AppGraphLintReport) -> Value {
    json!({
        "ok": report.ok,
        "diagnostics": report.diagnostics.iter().map(app_graph_lint_diagnostic_to_json_value).collect::<Vec<_>>(),
    })
}

fn app_graph_lint_diagnostic_to_json_value(diagnostic: &AppGraphLintDiagnostic) -> Value {
    let mut value = json!({
        "code": diagnostic.code,
        "severity": diagnostic.severity,
        "phase": diagnostic.phase,
        "origin": diagnostic.origin,
        "message": diagnostic.message,
    });

    let Some(object) = value.as_object_mut() else {
        return value;
    };
    if let Some(primary_source) = &diagnostic.primary_source {
        object.insert("primarySource".to_string(), primary_source.clone());
    }
    if !diagnostic.related_sources.is_empty() {
        object.insert(
            "relatedSources".to_string(),
            Value::Array(diagnostic.related_sources.clone()),
        );
    }
    if let Some(details) = &diagnostic.details {
        object.insert("details".to_string(), details.clone());
    }
    value
}

fn app_graph_report_validator() -> &'static Validator {
    static VALIDATOR: OnceLock<Validator> = OnceLock::new();
    VALIDATOR.get_or_init(|| {
        let schema: Value = serde_json::from_str(APP_GRAPH_REPORT_SCHEMA)
            .expect("embedded app-graph schema is valid JSON");
        jsonschema::options()
            .build(&schema)
            .expect("embedded app-graph schema compiles")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const CANONICAL_APP_GRAPH_REPORT_SCHEMA: &str =
        include_str!("../../../schemas/app-graph-validation-report.schema.json");

    fn valid_report() -> Value {
        json!({
            "ok": false,
            "summary": {
                "artifacts": 3,
                "loadedArtifacts": 2,
                "schemaFailures": 0,
                "unvalidatedArtifacts": 0,
                "graphErrors": 1,
                "errors": 1,
                "warnings": 0,
                "infos": 0,
                "importedDiagnostics": 1,
                "unsupportedFeatures": 0,
                "skippedPhases": 0
            },
            "schemaResults": [],
            "evidenceResults": [],
            "diagnostics": [
                {
                    "code": "MODULE-CONTRIBUTION-OWNER",
                    "severity": "error",
                    "phase": "module-resolution",
                    "origin": "module-resolver",
                    "message": "Widget evidence is owned by a different admitted module.",
                    "primarySource": {
                        "artifactSlot": "surfaces[0]",
                        "artifactKind": "surface",
                        "source": "memory://surface/respondent",
                        "jsonPointer": "/routes/0/slots/0/binding/widgetName",
                        "ref": {
                            "url": "https://example.gov/surfaces/respondent",
                            "version": "1.0.0"
                        }
                    },
                    "relatedSources": [
                        {
                            "artifactSlot": "registries[0]",
                            "artifactKind": "registry",
                            "source": "memory://registry/modules",
                            "jsonPointer": "/entries/7"
                        }
                    ],
                    "details": {
                        "expectedModule": "x-acme-surface",
                        "actualModule": "x-other-surface"
                    }
                }
            ],
            "phases": [
                {"phase": "artifact-resolution", "status": "completed"},
                {"phase": "module-resolution", "status": "completed"},
                {"phase": "cross-artifact", "status": "completed"}
            ]
        })
    }

    #[test]
    fn bridge_preserves_app_graph_diagnostic_identity() {
        let bridged = bridge_app_graph_report(&valid_report()).expect("report should bridge");
        assert!(!bridged.ok);
        assert_eq!(bridged.diagnostics.len(), 1);
        let diagnostic = &bridged.diagnostics[0];
        assert_eq!(diagnostic.code, "MODULE-CONTRIBUTION-OWNER");
        assert_eq!(diagnostic.origin, "module-resolver");
        assert_eq!(diagnostic.phase, "module-resolution");
        assert_eq!(diagnostic.severity, "error");
        assert_eq!(
            diagnostic
                .primary_source
                .as_ref()
                .and_then(|source| source.get("artifactSlot"))
                .and_then(Value::as_str),
            Some("surfaces[0]")
        );
        assert_eq!(
            diagnostic
                .related_sources
                .first()
                .and_then(|source| source.get("artifactKind"))
                .and_then(Value::as_str),
            Some("registry")
        );
        assert_eq!(
            diagnostic
                .details
                .as_ref()
                .and_then(|details| details.get("expectedModule"))
                .and_then(Value::as_str),
            Some("x-acme-surface")
        );
    }

    #[test]
    fn bridge_rejects_non_report_shape() {
        let error = bridge_app_graph_report(&json!({"diagnostics": []}))
            .expect_err("missing required report fields should fail schema validation");
        assert!(!error.errors.is_empty());
    }

    #[test]
    fn bridge_json_output_keeps_app_graph_codes() {
        let bridged = bridge_app_graph_report(&valid_report()).expect("report should bridge");
        let output = app_graph_lint_report_to_json_value(&bridged);
        assert_eq!(
            output["diagnostics"][0]["code"],
            json!("MODULE-CONTRIBUTION-OWNER")
        );
        assert_ne!(output["diagnostics"][0]["code"], json!("E603"));
        assert_eq!(output["diagnostics"][0]["origin"], json!("module-resolver"));
        assert_eq!(
            output["diagnostics"][0]["phase"],
            json!("module-resolution")
        );
    }

    #[test]
    fn embedded_app_graph_report_schema_matches_canonical_schema() {
        let embedded: Value =
            serde_json::from_str(APP_GRAPH_REPORT_SCHEMA).expect("embedded schema parses");
        let canonical: Value = serde_json::from_str(CANONICAL_APP_GRAPH_REPORT_SCHEMA)
            .expect("canonical schema parses");

        assert_eq!(
            embedded, canonical,
            "formspec-lint embeds schemas/app-graph-validation-report.schema.json; update both together"
        );
    }
}

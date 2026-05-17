//! Shared types for the formspec lint pipeline (diagnostics, modes, results).

use std::cmp::Ordering;

use serde_json::Value;

use formspec_core::DocumentType;

use crate::generated::LintCode;

// ── Severity ────────────────────────────────────────────────────

/// Severity of a lint diagnostic (sorting, validity, and JSON wire values).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LintSeverity {
    /// Fails [`LintResult::valid`]; blocks publishing in strict pipelines.
    Error,
    /// Should be fixed but does not alone invalidate the document in runtime mode.
    Warning,
    /// Informational (least severe; sorted after errors and warnings).
    Info,
}

impl LintSeverity {
    /// Numeric rank for sorting: lower = more severe.
    fn rank(self) -> u8 {
        match self {
            LintSeverity::Error => 0,
            LintSeverity::Warning => 1,
            LintSeverity::Info => 2,
        }
    }

    /// Wire string for JSON diagnostics (`error` / `warning` / `info`).
    pub fn as_wire_str(self) -> &'static str {
        match self {
            LintSeverity::Error => "error",
            LintSeverity::Warning => "warning",
            LintSeverity::Info => "info",
        }
    }
}

impl PartialOrd for LintSeverity {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for LintSeverity {
    fn cmp(&self, other: &Self) -> Ordering {
        self.rank().cmp(&other.rank())
    }
}

// ── Lint mode ───────────────────────────────────────────────────

/// Controls which diagnostics are emitted.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum LintMode {
    /// Full checking — all diagnostics emitted. Used for CI/publishing.
    #[default]
    Runtime,
    /// Authoring mode — suppresses certain warnings that are noisy during editing
    /// (e.g., W300 incompatible dataType for optionSet).
    Authoring,
    /// Strict mode — all diagnostics emitted, and component compatibility warnings
    /// (W800, W802, W803, W804) are promoted to errors.
    Strict,
}

impl LintMode {
    /// Whether this mode is the relaxed authoring mode.
    pub fn is_authoring(self) -> bool {
        self == LintMode::Authoring
    }

    /// Map host option strings (`authoring` / `strict` / default) to a lint mode.
    pub fn from_host_option_str(mode: Option<&str>) -> Self {
        match mode {
            Some("authoring") => LintMode::Authoring,
            Some("strict") => LintMode::Strict,
            _ => LintMode::Runtime,
        }
    }
}

// ── Diagnostic ──────────────────────────────────────────────────

/// A lint diagnostic.
#[derive(Debug, Clone)]
pub struct LintDiagnostic {
    /// Error/warning code (e.g., `E100`, `E201`, `W300`).
    pub code: LintCode,
    /// Pass number (1-8).
    pub pass: u8,
    /// Severity: error, warning, info.
    pub severity: LintSeverity,
    /// JSONPath to the problematic element.
    pub path: String,
    /// Human-readable message.
    pub message: String,
    /// Machine-readable repair hint for the authoring loop.
    /// Populated opportunistically by individual rules; LLM authors consume this
    /// to apply structured fixes rather than reparse prose messages.
    pub suggested_fix: Option<String>,
    /// Pointer to the normative spec clause that motivates this rule
    /// (e.g., `specs/core/spec.md#bind-target`). Links diagnostics back to spec for traceability.
    pub spec_ref: Option<String>,
}

impl LintDiagnostic {
    /// Create an error diagnostic.
    pub fn error(
        code: LintCode,
        pass: u8,
        path: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            code,
            pass,
            severity: LintSeverity::Error,
            path: path.into(),
            message: message.into(),
            suggested_fix: None,
            spec_ref: None,
        }
    }

    /// Create a warning diagnostic.
    pub fn warning(
        code: LintCode,
        pass: u8,
        path: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            code,
            pass,
            severity: LintSeverity::Warning,
            path: path.into(),
            message: message.into(),
            suggested_fix: None,
            spec_ref: None,
        }
    }

    /// Create an info diagnostic.
    pub fn info(code: LintCode, pass: u8, path: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code,
            pass,
            severity: LintSeverity::Info,
            path: path.into(),
            message: message.into(),
            suggested_fix: None,
            spec_ref: None,
        }
    }

    /// Attach a machine-readable repair hint (e.g., `"rename 'amount' to 'quantity'"`).
    pub fn with_suggested_fix(mut self, fix: impl Into<String>) -> Self {
        self.suggested_fix = Some(fix.into());
        self
    }

    /// Attach a pointer to the normative spec clause that motivates this rule
    /// (e.g., `"specs/core/spec.md#bind-target"`).
    pub fn with_spec_ref(mut self, spec_ref: impl Into<String>) -> Self {
        self.spec_ref = Some(spec_ref.into());
        self
    }

    /// Promote component compatibility warnings to errors when `mode` is [`LintMode::Strict`].
    pub fn promote_in_strict_mode(&mut self, mode: LintMode) {
        if mode == LintMode::Strict
            && matches!(
                self.code,
                crate::LintCode::W800 | crate::LintCode::W802 | crate::LintCode::W803 | crate::LintCode::W804
            )
        {
            self.severity = LintSeverity::Error;
        }
    }

    /// Whether this diagnostic should be suppressed in the given lint mode.
    pub fn suppressed_in(&self, mode: LintMode) -> bool {
        match mode {
            LintMode::Runtime | LintMode::Strict => false,
            LintMode::Authoring => {
                // W300: incompatible dataType for optionSet (noisy during editing)
                // W802: compatible-with-warning fallback (authoring mode allows it)
                self.code == crate::LintCode::W300 || self.code == crate::LintCode::W802
            }
        }
    }
}

/// Sort diagnostics: pass ASC, severity (error > warning > info), path ASC.
pub fn sort_diagnostics(diags: &mut [LintDiagnostic]) {
    diags.sort_by(|a, b| {
        a.pass
            .cmp(&b.pass)
            .then(a.severity.cmp(&b.severity))
            .then(a.path.cmp(&b.path))
    });
}

// ── Lint options ────────────────────────────────────────────────

/// Options for the lint pipeline.
#[derive(Debug, Clone, Default)]
pub struct LintOptions {
    /// Lint mode (Runtime, Authoring, or Strict).
    pub mode: LintMode,
    /// Optional registry documents for extension resolution (E600).
    /// Each value should be a JSON registry document with `entries` array.
    pub registry_documents: Vec<Value>,
    /// Optional paired definition document for cross-artifact validation.
    /// Used by pass 6 (theme: W705-W707) and pass 7 (components: W800/E802-E803).
    /// When `None`, cross-artifact checks are skipped (single-document mode).
    pub definition_document: Option<Value>,
    /// When `true`, run only pass 1 (document type detection) and return early.
    /// Useful for fast schema-level validation without semantic analysis.
    pub schema_only: bool,
    /// When `true`, skip FEL-related passes (pass 4: expression compilation,
    /// pass 5: dependency cycle detection). Useful when FEL is handled externally.
    pub no_fel: bool,
}

// ── Lint result ─────────────────────────────────────────────────

/// Result of linting.
#[derive(Debug, Clone)]
pub struct LintResult {
    /// Document type (if detected).
    pub document_type: Option<DocumentType>,
    /// All diagnostics from all passes (sorted).
    pub diagnostics: Vec<LintDiagnostic>,
    /// Whether the document is valid (no errors).
    pub valid: bool,
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;

    // ── Finding 45: LintSeverity ordering ────────────────────────

    /// Spec: Diagnostic sorting relies on Error < Warning < Info ordering.
    /// This ordering drives diagnostic sorting in sort_diagnostics.
    #[test]
    fn severity_ord_error_less_than_warning_less_than_info() {
        assert!(LintSeverity::Error < LintSeverity::Warning);
        assert!(LintSeverity::Warning < LintSeverity::Info);
        assert!(LintSeverity::Error < LintSeverity::Info);
        // Reflexive equality
        assert_eq!(
            LintSeverity::Error.cmp(&LintSeverity::Error),
            std::cmp::Ordering::Equal
        );
    }

    // ── Finding 46: suppressed_in by mode ────────────────────────

    /// Spec: W300 and W802 are suppressed in Authoring mode but not Runtime.
    #[test]
    fn w300_suppressed_in_authoring_not_runtime() {
        let diag = LintDiagnostic::warning(crate::LintCode::W300, 3, "$.test", "test");
        assert!(
            diag.suppressed_in(LintMode::Authoring),
            "W300 should be suppressed in Authoring"
        );
        assert!(
            !diag.suppressed_in(LintMode::Runtime),
            "W300 should NOT be suppressed in Runtime"
        );
    }

    /// Spec: W802 component compatibility warning suppressed during authoring.
    #[test]
    fn w802_suppressed_in_authoring_not_runtime() {
        let diag = LintDiagnostic::warning(crate::LintCode::W802, 7, "$.test", "test");
        assert!(
            diag.suppressed_in(LintMode::Authoring),
            "W802 should be suppressed in Authoring"
        );
        assert!(
            !diag.suppressed_in(LintMode::Runtime),
            "W802 should NOT be suppressed in Runtime"
        );
    }

    /// Spec: No diagnostics are suppressed in Runtime mode.
    #[test]
    fn runtime_mode_suppresses_nothing() {
        for code in [
            crate::LintCode::E100,
            crate::LintCode::E300,
            crate::LintCode::W300,
            crate::LintCode::W700,
            crate::LintCode::W802,
            crate::LintCode::E500,
        ] {
            let diag = LintDiagnostic::warning(code, 1, "$", "test");
            assert!(
                !diag.suppressed_in(LintMode::Runtime),
                "Runtime mode should never suppress, but suppressed {code}"
            );
        }
    }

    /// Spec: No diagnostics are suppressed in Strict mode.
    #[test]
    fn strict_mode_suppresses_nothing() {
        for code in [
            crate::LintCode::E100,
            crate::LintCode::E300,
            crate::LintCode::W300,
            crate::LintCode::W700,
            crate::LintCode::W802,
            crate::LintCode::E500,
            crate::LintCode::W800,
            crate::LintCode::W804,
        ] {
            let diag = LintDiagnostic::warning(code, 1, "$", "test");
            assert!(
                !diag.suppressed_in(LintMode::Strict),
                "Strict mode should never suppress, but suppressed {code}"
            );
        }
    }

    /// Spec: Only W300 and W802 are suppressed in Authoring; others are not.
    #[test]
    fn authoring_mode_does_not_suppress_other_codes() {
        for code in [
            crate::LintCode::E100,
            crate::LintCode::E300,
            crate::LintCode::W700,
            crate::LintCode::W704,
            crate::LintCode::E500,
            crate::LintCode::E800,
        ] {
            let diag = LintDiagnostic::warning(code, 1, "$", "test");
            assert!(
                !diag.suppressed_in(LintMode::Authoring),
                "Authoring mode should NOT suppress {code}"
            );
        }
    }

    // ── Finding 47: sort_diagnostics stability ───────────────────

    // ── Authoring-loop metadata: suggested_fix + spec_ref ───────

    /// Spec: New diagnostics default to `None` for suggested_fix and spec_ref —
    /// existing call sites keep working unchanged.
    #[test]
    fn diagnostic_defaults_authoring_metadata_to_none() {
        let diag = LintDiagnostic::error(crate::LintCode::E300, 3, "$.binds.0", "bind target missing");
        assert!(diag.suggested_fix.is_none());
        assert!(diag.spec_ref.is_none());
    }

    /// Spec: `with_suggested_fix` attaches a fix hint for the authoring loop.
    /// LLMs consuming diagnostics need structured repair suggestions, not prose.
    #[test]
    fn diagnostic_with_suggested_fix_attaches_hint() {
        let diag = LintDiagnostic::error(crate::LintCode::E300, 3, "$.binds.0", "bind target missing")
            .with_suggested_fix("change 'amount' to 'quantity'");
        assert_eq!(
            diag.suggested_fix.as_deref(),
            Some("change 'amount' to 'quantity'")
        );
    }

    /// Spec: `with_spec_ref` attaches a pointer to the normative spec clause
    /// that motivates the rule, enabling spec traceability from every diagnostic.
    #[test]
    fn diagnostic_with_spec_ref_attaches_reference() {
        let diag = LintDiagnostic::warning(crate::LintCode::W704, 6, "$.tokens.x", "unresolved token")
            .with_spec_ref("specs/theme/theme-spec.md#token-cascade");
        assert_eq!(
            diag.spec_ref.as_deref(),
            Some("specs/theme/theme-spec.md#token-cascade")
        );
    }

    /// Spec: Builders compose — a diagnostic can carry both fix and spec ref.
    #[test]
    fn diagnostic_builders_chain() {
        let diag = LintDiagnostic::error(crate::LintCode::E300, 3, "$", "bad")
            .with_suggested_fix("fix it")
            .with_spec_ref("specs/core/spec.md#bind-target");
        assert_eq!(diag.suggested_fix.as_deref(), Some("fix it"));
        assert_eq!(
            diag.spec_ref.as_deref(),
            Some("specs/core/spec.md#bind-target")
        );
    }

    // ── Finding 47: sort_diagnostics stability ───────────────────

    /// Spec: sort_diagnostics orders by (pass ASC, severity ASC, path ASC).
    /// Diagnostics with identical (pass, severity, path) preserve relative order (stable sort).
    #[test]
    fn sort_diagnostics_all_severities_with_duplicates() {
        let mut diags = vec![
            LintDiagnostic::info(crate::LintCode::W704, 6, "$.tokens.z", "info z"),
            LintDiagnostic::error(crate::LintCode::E300, 3, "$.binds.a", "error a"),
            LintDiagnostic::warning(crate::LintCode::W300, 3, "$.binds.b", "warning b"),
            LintDiagnostic::error(crate::LintCode::E300, 3, "$.binds.a", "error a duplicate"),
            LintDiagnostic::warning(crate::LintCode::W700, 6, "$.tokens.a", "warning a"),
            LintDiagnostic::error(crate::LintCode::E710, 6, "$.pages.a", "error page"),
        ];
        sort_diagnostics(&mut diags);

        // Verify non-decreasing sort order
        for window in diags.windows(2) {
            let a = &window[0];
            let b = &window[1];
            let order = a
                .pass
                .cmp(&b.pass)
                .then(a.severity.cmp(&b.severity))
                .then(a.path.cmp(&b.path));
            assert!(
                order != std::cmp::Ordering::Greater,
                "Sort violation: ({}, {:?}, {}) should not come after ({}, {:?}, {})",
                a.pass,
                a.severity,
                a.path,
                b.pass,
                b.severity,
                b.path,
            );
        }

        // Verify stability: the two E300 diagnostics at pass 3, path $.binds.a
        // should keep their original relative order.
        let e300s: Vec<&str> = diags
            .iter()
            .filter(|d| d.code == crate::LintCode::E300 && d.path == "$.binds.a")
            .map(|d| d.message.as_str())
            .collect();
        assert_eq!(
            e300s,
            vec!["error a", "error a duplicate"],
            "Identical (pass, severity, path) diagnostics should preserve insertion order"
        );
    }
}

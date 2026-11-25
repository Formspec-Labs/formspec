//! Evaluation trigger, context, and output types.

use super::taxonomy::{ConstraintKind, Severity, ValidationCode, ValidationSource};
use fel_core::exact_json::Value;
use std::collections::{HashMap, HashSet};

/// Validation result for a single field.
#[derive(Debug, Clone, PartialEq)]
pub struct ValidationResult {
    /// Path to the field.
    pub path: String,
    /// Severity: error, warning, info.
    pub severity: Severity,
    /// Constraint kind: required, constraint, type, cardinality, shape.
    pub constraint_kind: ConstraintKind,
    /// Validation code: REQUIRED, CONSTRAINT_FAILED, TYPE_MISMATCH, etc.
    pub code: ValidationCode,
    /// Human-readable message.
    pub message: String,
    /// Original constraint expression when available.
    pub constraint: Option<String>,
    /// Origin category, absent for Item cardinality checks (validation-result.schema.json `source`).
    pub source: Option<ValidationSource>,
    /// Shape ID (for shape validations only).
    pub shape_id: Option<String>,
    /// Evaluated shape failure context values.
    pub context: Option<HashMap<String, Value>>,
}

/// Paths with an error from an Item, Bind, or Shape, which `valid()` reads as invalid.
///
/// Core §3.5.9: explanation results (§5.3.1) and Definition errors do not count, and the
/// evaluator never sees host-injected external results (§5.7).
pub(crate) fn error_paths(findings: &[ValidationResult]) -> HashSet<String> {
    findings
        .iter()
        .filter(|finding| {
            finding.severity == Severity::Error
                && !finding.path.is_empty()
                && !matches!(
                    finding.constraint_kind,
                    ConstraintKind::Explanation | ConstraintKind::Definition
                )
        })
        .map(|finding| finding.path.clone())
        .collect()
}

/// Evaluation error from a Definition expression (Core §3.10.2).
///
/// The expression evaluated to `null`; in constraint position that passes (§3.8.1).
/// The diagnostic is for Definition authors (debug consoles, previews) and MUST NOT
/// be shown to end users as a validation error, so it never enters
/// [`EvaluationResult::validations`].
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct EvalDiagnostic {
    /// Concrete path of the expression target or variable scope (`#` at form level).
    pub path: String,
    /// FEL expression that raised the error, as evaluated.
    pub expression: String,
    /// Shape ID when a shape expression raised the error.
    pub shape_id: Option<String>,
    /// fel-core diagnostic code, such as `FEL_AMBIGUOUS_ROW_LOOKUP`, when it has one.
    pub code: Option<String>,
    /// fel-core diagnostic message.
    pub message: String,
}

impl EvalDiagnostic {
    /// Append `result`'s error-severity diagnostics for the expression at `path`.
    pub(crate) fn record(
        output: &mut Vec<Self>,
        result: &fel_core::EvalResult,
        path: &str,
        expression: &str,
        shape_id: Option<&str>,
    ) {
        output.extend(
            result
                .diagnostics
                .iter()
                .filter(|d| d.severity == fel_core::error::Severity::Error)
                .map(|d| Self {
                    path: path.to_owned(),
                    expression: expression.to_owned(),
                    shape_id: shape_id.map(str::to_owned),
                    code: d.code.clone(),
                    message: d.message.clone(),
                }),
        );
    }
}

/// When to evaluate shape rules.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EvalTrigger {
    /// Evaluate only shapes with timing "continuous" (or no timing).
    Continuous,
    /// Evaluate shapes with timing "continuous" or "submit" (skip "demand").
    Submit,
    /// Evaluate only shapes with timing "demand".
    Demand,
    /// Skip all shape evaluation.
    Disabled,
}

impl EvalTrigger {
    /// Python `evaluate_def` trigger strings (`submit` / `disabled` / default → continuous).
    pub fn from_python_eval_def_option(trigger: Option<&str>) -> Self {
        match trigger {
            Some("submit") => EvalTrigger::Submit,
            Some("disabled") => EvalTrigger::Disabled,
            _ => EvalTrigger::Continuous,
        }
    }
}

/// Optional runtime context injected into a single evaluation cycle.
#[derive(Debug, Clone, Default)]
pub struct EvalContext {
    /// Stored warning answers to compare on Submit.
    pub explanations: Vec<Value>,
    /// Current Response identity supplied by the host.
    pub subject: Option<EvalSubject>,
    /// Wall-clock instant for FEL `now()` / date helpers (ISO-8601 string).
    pub now_iso: Option<String>,
    /// Paths that were non-relevant in the prior evaluation cycle.
    pub previous_non_relevant: Option<Vec<String>>,
}

/// The parts of `Response.subject` that the evaluator checks and reads.
///
/// Integer keys must be within ±(2^53−1), inclusive, per RFC 7493 §2.2.
/// Use string keys for larger identifiers.
#[derive(Debug, Clone, Default)]
pub struct EvalSubject {
    /// Subject type from the Response.
    pub subject_type: Option<String>,
    /// Keys from the Response. An empty map is an explicit singleton key set.
    pub keys: Option<HashMap<String, fel_core::Value>>,
}

impl EvalContext {
    /// Keys available to FEL after the pipeline checks the supplied subject.
    pub(crate) fn subject_keys(&self) -> Option<&HashMap<String, fel_core::Value>> {
        self.subject.as_ref()?.keys.as_ref()
    }
}

/// Request to resolve Item text in the same evaluation (Core §4.2.1 text interpolation).
#[derive(Debug, Clone, Default)]
pub struct ItemTextRequest {
    /// Active Locale strings by key (`<itemKey>.label`, `<itemKey>.label@short`, …).
    ///
    /// The caller applies the Locale fallback cascade (Locale §4) first, so each key maps
    /// to the string the cascade would return; missing keys fall back to inline text.
    pub locale_strings: HashMap<String, String>,
}

/// Display text for one Item instance, `{{expression}}` resolved in its scope.
///
/// Each property follows the Locale cascade (§3.1.1–§3.1.2) for a display context `c`: Locale
/// `<key>.<property>@c`, then Locale `<key>.<property>`, then — for `label` only — the Definition's
/// `labels[c]`, then the inline property; interpolated under Locale §3.3.1. The context-less
/// resolution is [`ItemText::label`] / `description` / `hint`; per-context results live in
/// [`ItemText::labels`] / `descriptions` / `hints`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ItemText {
    /// Primary label (`""` when neither Locale nor Definition has one).
    pub label: String,
    /// Context labels by context name: every Definition `labels` context and Locale `label@context` key.
    pub labels: HashMap<String, String>,
    /// Help text, when the Locale or Definition has it.
    pub description: Option<String>,
    /// Instructional hint, when the Locale or Definition has it.
    pub hint: Option<String>,
    /// Context descriptions by context name, for every Locale `description@context` key.
    ///
    /// No Definition-side context alternative exists for `description`, so a context without such a
    /// Locale key resolves to [`ItemText::description`] and is left out.
    pub descriptions: HashMap<String, String>,
    /// Context hints by context name, for every Locale `hint@context` key ([`ItemText::descriptions`]).
    pub hints: HashMap<String, String>,
}

/// Result of the full evaluation cycle.
#[derive(Debug, Clone)]
pub struct EvaluationResult {
    /// Evaluation stopped before Recalculate because the Definition or input was refused.
    pub refused: bool,
    /// Explainable Shape firings from this submit evaluation.
    pub explanation_actions: Vec<Value>,
    /// Entries selected for assembly by the submit evaluation.
    pub candidate_explanations: Option<Vec<Value>>,
    /// All field values after recalculation (post-NRB): flat state keyed by path
    /// (`group.field`, `rows[0].name`), like [`Self::required`] and [`Self::readonly`].
    pub values: HashMap<String, Value>,
    /// Settled values before applying the filed Response's non-relevant behavior.
    pub(crate) host_values: HashMap<String, Value>,
    /// Calculated Item paths for the editing host.
    pub(crate) calculated_paths: Vec<String>,
    /// Effective Bind properties at paths affected by row-specific Binds.
    pub(crate) indexed_binds: fel_core::exact_json::Map<String, Value>,
    /// The Response projection of [`Self::values`]: groups are nested objects and repeats arrays of
    /// row objects, after `nonRelevantBehavior`. What a Response stores as `data`.
    pub data: Value,
    /// Sorted Response `data` instance paths present in the input that no Definition Item declares.
    pub undeclared_data_paths: Vec<String>,
    /// Validation results.
    pub validations: Vec<ValidationResult>,
    /// Sorted paths that `valid()` reads as invalid in the settled state (Core §3.5.9).
    ///
    /// Hosts evaluating FEL against this result read validity from this list, so component
    /// `when` and Locale text agree with Binds and Shapes.
    pub invalid_paths: Vec<String>,
    /// Author-facing errors raised while evaluating Definition expressions.
    pub diagnostics: Vec<EvalDiagnostic>,
    /// Fields marked non-relevant.
    pub non_relevant: Vec<String>,
    /// Evaluated variable values.
    pub variables: HashMap<String, Value>,
    /// Variables by concrete scope and name, with FEL types.
    pub scoped_variables: HashMap<String, HashMap<String, fel_core::Value>>,
    /// Materialized row count by concrete repeat group.
    pub row_counts: HashMap<String, u64>,
    /// Required state by path.
    pub required: HashMap<String, bool>,
    /// Readonly state by path.
    pub readonly: HashMap<String, bool>,
    /// Item text by instance path; `Some` only when [`crate::EvalOptions::item_text`] asked for it.
    pub item_text: Option<HashMap<String, ItemText>>,
}

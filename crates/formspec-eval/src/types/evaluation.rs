//! Evaluation trigger, context, and output types.

use super::taxonomy::{ConstraintKind, Severity, ValidationCode, ValidationSource};
use serde_json::Value;
use std::collections::HashMap;

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
    /// Source of the validation: bind, shape, definition.
    pub source: ValidationSource,
    /// Shape ID (for shape validations only).
    pub shape_id: Option<String>,
    /// Evaluated shape failure context values.
    pub context: Option<HashMap<String, Value>>,
}

/// Evaluation error from a constraint or shape expression (Core §3.10.2).
///
/// The expression evaluated to `null`, so the constraint passed (§3.8.1). The
/// diagnostic is for Definition authors (debug consoles, previews) and MUST NOT
/// be shown to end users as a validation error, so it never enters
/// [`EvaluationResult::validations`].
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct EvalDiagnostic {
    /// Resolved path of the bind or shape target (`#` for form-level shapes).
    pub path: String,
    /// FEL expression that raised the error, as evaluated.
    pub expression: String,
    /// Shape ID when a shape expression raised the error.
    pub shape_id: Option<String>,
    /// fel-core diagnostic message.
    pub message: String,
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
    /// Wall-clock instant for FEL `now()` / date helpers (ISO-8601 string).
    pub now_iso: Option<String>,
    /// Prior cycle validation results (e.g. for host-driven revalidation hints).
    pub previous_validations: Option<Vec<ValidationResult>>,
    /// Paths that were non-relevant in the prior evaluation cycle.
    pub previous_non_relevant: Option<Vec<String>>,
    /// Authoritative repeat row counts by **group base path** (e.g. `items`), when the host
    /// keeps counts outside flat `values` keys (browser signals). When `None`, cardinality falls
    /// back to repeat-count detection from `values` only.
    pub repeat_counts: Option<HashMap<String, u64>>,
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
    /// All field values after recalculation (post-NRB).
    pub values: HashMap<String, Value>,
    /// Validation results.
    pub validations: Vec<ValidationResult>,
    /// Author-facing evaluation errors from constraint and shape expressions.
    pub diagnostics: Vec<EvalDiagnostic>,
    /// Fields marked non-relevant.
    pub non_relevant: Vec<String>,
    /// Evaluated variable values.
    pub variables: HashMap<String, Value>,
    /// Required state by path.
    pub required: HashMap<String, bool>,
    /// Readonly state by path.
    pub readonly: HashMap<String, bool>,
    /// Item text by instance path; `Some` only when [`crate::EvalOptions::item_text`] asked for it.
    pub item_text: Option<HashMap<String, ItemText>>,
}

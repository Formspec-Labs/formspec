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

/// Result of the full evaluation cycle.
#[derive(Debug, Clone)]
pub struct EvaluationResult {
    /// All field values after recalculation (post-NRB).
    pub values: HashMap<String, Value>,
    /// Validation results.
    pub validations: Vec<ValidationResult>,
    /// Fields marked non-relevant.
    pub non_relevant: Vec<String>,
    /// Evaluated variable values.
    pub variables: HashMap<String, Value>,
    /// Required state by path.
    pub required: HashMap<String, bool>,
    /// Readonly state by path.
    pub readonly: HashMap<String, bool>,
}

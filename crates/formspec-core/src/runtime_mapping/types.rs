//! Type definitions for mapping rules, diagnostics, and documents.

use serde_json::Value;

/// Transform direction.
#[allow(missing_docs)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MappingDirection {
    Forward,
    Reverse,
}

/// A mapping rule — one transform in the pipeline.
#[derive(Debug, Clone)]
pub struct MappingRule {
    /// Source path (dot notation).
    pub source_path: Option<String>,
    /// Target path (dot notation).
    pub target_path: String,
    /// Transform type.
    pub transform: TransformType,
    /// Optional FEL condition guard.
    pub condition: Option<String>,
    /// Priority (higher = earlier in forward).
    pub priority: i32,
    /// Reverse priority (if different from forward).
    pub reverse_priority: Option<i32>,
    /// Fallback value when source resolves to null/absent.
    pub default: Option<Value>,
    /// Whether this rule participates in reverse execution (default true).
    pub bidirectional: bool,
    /// Array descriptor for iterating over array source values.
    pub array: Option<ArrayDescriptor>,
    /// Reverse-direction transform override.
    pub reverse: Option<Box<ReverseOverride>>,
}

/// Array iteration descriptor.
#[derive(Debug, Clone)]
pub struct ArrayDescriptor {
    /// Iteration mode: "each", "indexed", or "whole".
    pub mode: ArrayMode,
    /// Sub-rules applied per element (each/indexed modes).
    pub inner_rules: Vec<MappingRule>,
}

/// Array iteration mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArrayMode {
    /// Process each element individually.
    Each,
    /// Access elements by index.
    Indexed,
    /// Treat the array as a single value (default).
    Whole,
}

/// Reverse-direction transform override.
#[allow(missing_docs)]
#[derive(Debug, Clone)]
pub struct ReverseOverride {
    pub transform: TransformType,
}

/// Supported transform types.
#[allow(missing_docs)]
#[derive(Debug, Clone)]
pub enum TransformType {
    /// Copy value as-is.
    Preserve,
    /// Drop the value (skip this rule).
    Drop,
    /// Inject a constant value (no source path required).
    Constant(Value),
    /// Map values through a lookup table.
    ValueMap {
        forward: Vec<(Value, Value)>,
        unmapped: UnmappedStrategy,
    },
    /// Coerce to a target type.
    Coerce(CoerceType),
    /// Evaluate a FEL expression.
    Expression(String),
    /// Flatten nested/array structure to a scalar string using separator.
    Flatten { separator: String },
    /// Expand flat string into nested object by splitting on separator.
    Nest { separator: String },
    /// FEL expression that must evaluate to a string ($ = source value, full doc in scope).
    Concat(String),
    /// FEL expression that must return array or object ($ = source value, full doc in scope).
    Split(String),
}

/// Strategy for values not found in a value map.
///
/// Spec: mapping/mapping-spec.md §4.6 — ValueMap unmapped strategies.
/// The spec defines exactly four strategies: "error", "drop", "passthrough", "default".
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UnmappedStrategy {
    /// `"passthrough"` — copy the source value through unchanged.
    PassThrough,
    /// `"drop"` — omit the target field entirely (returns None from apply_value_map).
    Drop,
    /// `"error"` — produce a runtime mapping diagnostic.
    Error,
    /// `"default"` — use the default value from the rule's `default` property.
    Default,
}

/// Target types for coercion.
#[allow(missing_docs)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CoerceType {
    String,
    Number,
    Integer,
    Boolean,
    Date,
    DateTime,
    Array,
}

/// Structured error codes for mapping diagnostics.
#[allow(missing_docs)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MappingErrorCode {
    UnmappedValue,
    CoerceFailure,
    FelRuntime,
    /// Document-level restriction violated (e.g. forward-only doc executed in reverse).
    InvalidDocument,
}

impl MappingErrorCode {
    /// Uppercase wire token for JSON diagnostics.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::UnmappedValue => "UNMAPPED_VALUE",
            Self::CoerceFailure => "COERCE_FAILURE",
            Self::FelRuntime => "FEL_RUNTIME",
            Self::InvalidDocument => "INVALID_DOCUMENT",
        }
    }
}

/// A diagnostic from mapping execution.
#[allow(missing_docs)]
#[derive(Debug, Clone)]
pub struct MappingDiagnostic {
    pub rule_index: usize,
    pub source_path: Option<String>,
    pub target_path: String,
    pub error_code: MappingErrorCode,
    pub message: String,
}

/// Result of a mapping execution.
#[allow(missing_docs)]
#[derive(Debug, Clone)]
pub struct MappingResult {
    pub direction: MappingDirection,
    pub output: Value,
    pub rules_applied: usize,
    pub diagnostics: Vec<MappingDiagnostic>,
}

/// A complete mapping document with rules, defaults, and autoMap.
#[allow(missing_docs)]
#[derive(Debug, Clone)]
pub struct MappingDocument {
    /// External source association; execution requires an independent schema validator.
    pub source_schema: Option<MappingSourceSchema>,
    pub rules: Vec<MappingRule>,
    /// Key-value defaults pre-populated into the output before rules execute (forward only).
    pub defaults: Option<serde_json::Map<String, Value>>,
    /// When true, generate synthetic preserve rules for unmapped top-level source keys.
    pub auto_map: bool,
    /// When set, [`execute_mapping_doc`](super::document::execute_mapping_doc) only permits this direction.
    pub direction_restriction: Option<MappingDirection>,
}

/// Versioned external source identity and its inline JSON Schema.
#[derive(Debug, Clone)]
pub struct MappingSourceSchema {
    /// Canonical external schema identity.
    pub url: String,
    /// Exact external schema version.
    pub version: String,
    /// Inline schema validated by the binding's maintained JSON Schema implementation.
    pub schema: Value,
}

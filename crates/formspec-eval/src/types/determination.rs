//! Determination Record types — structured output of screener evaluation.
//!
//! Maps directly to `schemas/determination.schema.json`. All types derive
//! `Serialize` for JSON output via serde.

use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;

/// The complete evaluation output of a Screener Document.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeterminationRecord {
    /// Marker field. Always `"1.0"`.
    #[serde(rename = "$formspecDetermination")]
    pub marker: String,
    /// Reference to the screener that produced this record.
    pub screener: ScreenerRef,
    /// ISO 8601 datetime when evaluation completed.
    pub timestamp: String,
    /// Version of evaluation logic applied (reflects evaluationBinding).
    pub evaluation_version: String,
    /// `completed`, `partial`, `expired`, or `unavailable`.
    pub status: String,
    /// Override route evaluation results.
    pub overrides: OverrideBlock,
    /// Per-phase evaluation results. Empty if overrides halted.
    pub phases: Vec<PhaseResult>,
    /// Item path → input entry for every screener item.
    pub inputs: HashMap<String, InputEntry>,
    /// Present when screener declares `resultValidity`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub validity: Option<ValidityBlock>,
    /// Extension data.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extensions: Option<Value>,
}

/// Reference to the screener that produced a Determination Record.
#[derive(Debug, Clone, Serialize)]
pub struct ScreenerRef {
    /// Canonical URI of the screener.
    pub url: String,
    /// Semantic version of the screener.
    pub version: String,
}

/// Override evaluation results.
#[derive(Debug, Clone, Serialize)]
pub struct OverrideBlock {
    /// Override routes that fired.
    pub matched: Vec<RouteResult>,
    /// `true` if a terminal override halted the pipeline.
    pub halted: bool,
}

/// Result of evaluating a single phase.
#[derive(Debug, Clone, Serialize)]
pub struct PhaseResult {
    /// Phase identifier.
    pub id: String,
    /// `evaluated`, `skipped`, or `unsupported-strategy`.
    pub status: String,
    /// Strategy used.
    pub strategy: String,
    /// Routes that matched.
    pub matched: Vec<RouteResult>,
    /// Routes that did not match.
    pub eliminated: Vec<RouteResult>,
    /// Phase-level warnings (e.g. `"below-minimum"`). Always present (empty array when none).
    pub warnings: Vec<String>,
}

/// A single route's evaluation outcome.
#[derive(Debug, Clone, Serialize)]
pub struct RouteResult {
    /// Route target URI.
    pub target: String,
    /// Human-readable label.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// Respondent-facing message.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    /// Computed score (score-threshold only).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score: Option<f64>,
    /// Elimination reason (eliminated routes only).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// Arbitrary metadata from the route.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}

/// A screener item's value and answer state at evaluation time.
#[derive(Debug, Clone, Serialize)]
pub struct InputEntry {
    /// The item's value (any JSON type, null when declined/not-presented).
    pub value: Value,
    /// Answer state at evaluation time.
    pub state: AnswerState,
}

/// Expiration metadata derived from `resultValidity`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidityBlock {
    /// When this record expires (timestamp + resultValidity).
    pub valid_until: String,
    /// The original ISO 8601 duration from the screener.
    pub result_validity: String,
}

/// Answer state for a screener item input.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum AnswerState {
    /// Respondent provided a value.
    #[serde(rename = "answered")]
    Answered,
    /// Item presented but respondent declined to answer.
    #[serde(rename = "declined")]
    Declined,
    /// Item not shown (e.g. relevance was false).
    #[serde(rename = "not-presented")]
    NotPresented,
}

impl AnswerState {
    /// Convert to the schema string representation.
    pub fn as_str(&self) -> &'static str {
        match self {
            AnswerState::Answered => "answered",
            AnswerState::Declined => "declined",
            AnswerState::NotPresented => "not-presented",
        }
    }
}

/// Parse a wire string into an [`AnswerState`]. Unknown values fall back to
/// [`AnswerState::Answered`] — shared by the WASM and Python bindings so the
/// two surfaces cannot silently disagree on screener answer-state semantics.
pub fn parse_answer_state(s: &str) -> AnswerState {
    match s {
        "declined" => AnswerState::Declined,
        "not-presented" => AnswerState::NotPresented,
        _ => AnswerState::Answered,
    }
}

/// Input for a single screener item — value + answer state.
#[derive(Debug, Clone)]
pub struct AnswerInput {
    /// The item's value (any JSON value).
    pub value: Value,
    /// Answer state.
    pub state: AnswerState,
}

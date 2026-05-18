//! Determination Record types — structured output of screener evaluation.
//!
//! Maps directly to `schemas/determination.schema.json`. All types derive
//! `Serialize` for JSON output via serde.

use std::borrow::Cow;

use serde::{Deserialize, Deserializer, Serialize, Serializer};
use serde_json::Value;
use std::collections::HashMap;

/// Top-level determination status on the wire.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum DeterminationStatus {
    /// All phases evaluated; record is actionable.
    Completed,
    /// Pipeline stopped before all phases (e.g. override halt).
    Partial,
    /// Past `validUntil` from `resultValidity`.
    Expired,
    /// Required inputs missing or screener could not run.
    Unavailable,
}

impl DeterminationStatus {
    /// Serialize to the determination schema string.
    pub fn as_wire_str(self) -> &'static str {
        match self {
            DeterminationStatus::Completed => "completed",
            DeterminationStatus::Partial => "partial",
            DeterminationStatus::Expired => "expired",
            DeterminationStatus::Unavailable => "unavailable",
        }
    }

    /// Parse a determination schema status string.
    pub fn parse_wire(s: &str) -> Option<Self> {
        match s {
            "completed" => Some(DeterminationStatus::Completed),
            "partial" => Some(DeterminationStatus::Partial),
            "expired" => Some(DeterminationStatus::Expired),
            "unavailable" => Some(DeterminationStatus::Unavailable),
            _ => None,
        }
    }
}

impl Serialize for DeterminationStatus {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.as_wire_str())
    }
}

impl<'de> Deserialize<'de> for DeterminationStatus {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        Self::parse_wire(&s)
            .ok_or_else(|| serde::de::Error::custom(format!("unknown determination status: {s}")))
    }
}

impl PartialEq<str> for DeterminationStatus {
    fn eq(&self, other: &str) -> bool {
        self.as_wire_str() == other
    }
}

impl PartialEq<&str> for DeterminationStatus {
    fn eq(&self, other: &&str) -> bool {
        self.as_wire_str() == *other
    }
}

/// Per-phase evaluation status on the wire.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PhaseStatus {
    /// Phase ran with the declared strategy.
    Evaluated,
    /// Phase omitted (e.g. prior override halt).
    Skipped,
    /// Strategy id is not implemented in this evaluator.
    UnsupportedStrategy,
}

impl PhaseStatus {
    /// Serialize to the determination schema phase status string.
    pub fn as_wire_str(self) -> &'static str {
        match self {
            PhaseStatus::Evaluated => "evaluated",
            PhaseStatus::Skipped => "skipped",
            PhaseStatus::UnsupportedStrategy => "unsupported-strategy",
        }
    }

    /// Parse a determination schema phase status string.
    pub fn parse_wire(s: &str) -> Option<Self> {
        match s {
            "evaluated" => Some(PhaseStatus::Evaluated),
            "skipped" => Some(PhaseStatus::Skipped),
            "unsupported-strategy" => Some(PhaseStatus::UnsupportedStrategy),
            _ => None,
        }
    }
}

impl Serialize for PhaseStatus {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.as_wire_str())
    }
}

impl<'de> Deserialize<'de> for PhaseStatus {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        Self::parse_wire(&s)
            .ok_or_else(|| serde::de::Error::custom(format!("unknown phase status: {s}")))
    }
}

impl PartialEq<str> for PhaseStatus {
    fn eq(&self, other: &str) -> bool {
        self.as_wire_str() == other
    }
}

impl PartialEq<&str> for PhaseStatus {
    fn eq(&self, other: &&str) -> bool {
        self.as_wire_str() == *other
    }
}

/// Phase evaluation strategy (built-ins + screener-declared extensions).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum PhaseStrategy {
    /// First matching route wins.
    FirstMatch,
    /// All matching routes are retained.
    FanOut,
    /// Routes ranked by score against a threshold.
    ScoreThreshold,
    /// Any other strategy id from the screener document (including `x-*`).
    Other(String),
}

impl PhaseStrategy {
    /// Parse built-in strategy ids; unknown ids become [`PhaseStrategy::Other`].
    pub fn from_wire(s: impl Into<String>) -> Self {
        let s = s.into();
        match s.as_str() {
            "first-match" => PhaseStrategy::FirstMatch,
            "fan-out" => PhaseStrategy::FanOut,
            "score-threshold" => PhaseStrategy::ScoreThreshold,
            _ => PhaseStrategy::Other(s),
        }
    }

    /// Serialize to the screener/determination strategy id string.
    pub fn as_wire_str(&self) -> Cow<'_, str> {
        Cow::Borrowed(match self {
            PhaseStrategy::FirstMatch => "first-match",
            PhaseStrategy::FanOut => "fan-out",
            PhaseStrategy::ScoreThreshold => "score-threshold",
            PhaseStrategy::Other(s) => s.as_str(),
        })
    }
}

impl Serialize for PhaseStrategy {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.as_wire_str())
    }
}

impl<'de> Deserialize<'de> for PhaseStrategy {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        Ok(Self::from_wire(s))
    }
}

impl PartialEq<str> for PhaseStrategy {
    fn eq(&self, other: &str) -> bool {
        self.as_wire_str() == other
    }
}

impl PartialEq<&str> for PhaseStrategy {
    fn eq(&self, other: &&str) -> bool {
        self.as_wire_str() == *other
    }
}

/// Why an eliminated route did not match.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum EliminationReason {
    /// Route condition evaluated to false.
    ConditionFalse,
    /// Score below the phase threshold.
    BelowThreshold,
    /// Fan-out cap exceeded.
    MaxExceeded,
    /// Score expression yielded null.
    NullScore,
    /// Condition or score FEL evaluation failed.
    ExpressionError,
}

impl EliminationReason {
    /// Serialize to the determination schema elimination reason string.
    pub fn as_wire_str(self) -> &'static str {
        match self {
            EliminationReason::ConditionFalse => "condition-false",
            EliminationReason::BelowThreshold => "below-threshold",
            EliminationReason::MaxExceeded => "max-exceeded",
            EliminationReason::NullScore => "null-score",
            EliminationReason::ExpressionError => "expression-error",
        }
    }

    /// Parse a determination schema elimination reason string.
    pub fn parse_wire(s: &str) -> Option<Self> {
        match s {
            "condition-false" => Some(EliminationReason::ConditionFalse),
            "below-threshold" => Some(EliminationReason::BelowThreshold),
            "max-exceeded" => Some(EliminationReason::MaxExceeded),
            "null-score" => Some(EliminationReason::NullScore),
            "expression-error" => Some(EliminationReason::ExpressionError),
            _ => None,
        }
    }
}

impl Serialize for EliminationReason {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.as_wire_str())
    }
}

impl<'de> Deserialize<'de> for EliminationReason {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        Self::parse_wire(&s)
            .ok_or_else(|| serde::de::Error::custom(format!("unknown elimination reason: {s}")))
    }
}

impl PartialEq<str> for EliminationReason {
    fn eq(&self, other: &str) -> bool {
        self.as_wire_str() == other
    }
}

impl PartialEq<&str> for EliminationReason {
    fn eq(&self, other: &&str) -> bool {
        self.as_wire_str() == *other
    }
}

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
    pub status: DeterminationStatus,
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
    pub status: PhaseStatus,
    /// Strategy used.
    pub strategy: PhaseStrategy,
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
    pub reason: Option<EliminationReason>,
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn determination_status_serde_round_trip() {
        let status = DeterminationStatus::Partial;
        let wire = serde_json::to_value(status).unwrap();
        assert_eq!(wire, json!("partial"));
        let back: DeterminationStatus = serde_json::from_value(wire).unwrap();
        assert_eq!(back, status);
    }

    #[test]
    fn phase_status_and_strategy_wire_unchanged() {
        let phase = PhaseResult {
            id: "p1".into(),
            status: PhaseStatus::UnsupportedStrategy,
            strategy: PhaseStrategy::Other("x-custom".into()),
            matched: vec![],
            eliminated: vec![],
            warnings: vec![],
        };
        let v = serde_json::to_value(&phase).unwrap();
        assert_eq!(v["status"], json!("unsupported-strategy"));
        assert_eq!(v["strategy"], json!("x-custom"));
    }

    #[test]
    fn elimination_reason_on_route_result() {
        let route = RouteResult {
            target: "urn:t".into(),
            label: None,
            message: None,
            score: None,
            reason: Some(EliminationReason::BelowThreshold),
            metadata: None,
        };
        let v = serde_json::to_value(&route).unwrap();
        assert_eq!(v["reason"], json!("below-threshold"));
    }
}

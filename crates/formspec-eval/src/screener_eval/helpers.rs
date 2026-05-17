//! Shared helpers for determination record assembly and route mapping.

use std::collections::HashMap;

use serde_json::Value;

use crate::types::determination::{
    AnswerInput, AnswerState, DeterminationStatus, InputEntry, PhaseResult, PhaseStatus,
    PhaseStrategy, RouteResult,
};

/// Build a RouteResult from a JSON route value.
pub(crate) fn route_to_result(route: &Value) -> RouteResult {
    RouteResult {
        target: route
            .get("target")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        label: route.get("label").and_then(Value::as_str).map(String::from),
        message: route
            .get("message")
            .and_then(Value::as_str)
            .map(String::from),
        score: None,
        reason: None,
        metadata: route.get("metadata").cloned(),
    }
}

/// Build the inputs map from answers.
pub(crate) fn build_inputs(answers: &HashMap<String, AnswerInput>) -> HashMap<String, InputEntry> {
    answers
        .iter()
        .map(|(k, v)| {
            (
                k.clone(),
                InputEntry {
                    value: v.value.clone(),
                    state: v.state,
                },
            )
        })
        .collect()
}

/// Determine status from answer states.
pub(crate) fn determine_status(answers: &HashMap<String, AnswerInput>) -> DeterminationStatus {
    let all_answered = answers
        .values()
        .all(|a| a.state == AnswerState::Answered || a.state == AnswerState::NotPresented);
    if all_answered {
        DeterminationStatus::Completed
    } else {
        DeterminationStatus::Partial
    }
}

pub(crate) fn warning_only_phase(warnings: Vec<String>) -> Vec<PhaseResult> {
    if warnings.is_empty() {
        return Vec::new();
    }
    vec![PhaseResult {
        id: "_evaluation".to_string(),
        status: PhaseStatus::Evaluated,
        strategy: PhaseStrategy::Other(String::new()),
        matched: Vec::new(),
        eliminated: Vec::new(),
        warnings,
    }]
}

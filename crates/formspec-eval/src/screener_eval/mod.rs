//! Standalone Screener Document evaluation — full pipeline per screener-spec.md §10.
//!
//! Replaces the embedded-screener first-match-only `evaluate_screener` with a
//! multi-phase, multi-strategy pipeline that produces a Determination Record.

mod availability;
mod condition;
mod helpers;
mod strategies;
mod validity;

#[cfg(test)]
mod tests;

use std::collections::HashMap;

use fel_core::FormspecEnvironment;
use serde_json::Value;

use crate::fel_json::json_to_runtime_fel;
use crate::types::determination::{
    AnswerInput, AnswerState, DeterminationRecord, OverrideBlock, PhaseResult, PhaseStatus,
    PhaseStrategy, ScreenerRef,
};

use availability::{is_within_availability, make_unavailable, parse_date_from_iso};
use condition::{
    eval_screener_condition, extend_unique_warnings, push_unique_warning,
    WARNING_FEL_EXPRESSION_ERROR,
};
use helpers::{build_inputs, determine_status, route_to_result, warning_only_phase};
use strategies::{eval_fan_out, eval_first_match, eval_score_threshold};
use validity::build_validity;

/// Evaluate a standalone Screener Document against respondent inputs.
///
/// Implements the full pipeline from screener-spec.md §10:
/// 1. Availability check
/// 2. Build FEL environment from answers
/// 3. Hoist and evaluate override routes
/// 4. Evaluate phases by strategy
/// 5. Assemble Determination Record
pub fn evaluate_screener_document(
    screener: &Value,
    answers: &HashMap<String, AnswerInput>,
    now_iso: Option<&str>,
) -> DeterminationRecord {
    let url = screener
        .get("url")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let version = screener
        .get("version")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let screener_ref = ScreenerRef {
        url,
        version: version.clone(),
    };

    let now_str = now_iso.unwrap_or("");
    let timestamp = now_str.to_string();

    // ── 1. Availability check (§10.1 step 1, SC-04) ───────────────
    if let Some(availability) = screener.get("availability") {
        let Some(today) = parse_date_from_iso(now_str) else {
            return make_unavailable(screener_ref, &timestamp, &version, answers);
        };
        if !is_within_availability(availability, today) {
            return make_unavailable(screener_ref, &timestamp, &version, answers);
        }
    }

    // ── 2. Build FEL environment (§3.2, §3.4) ─────────────────────
    let mut env = FormspecEnvironment::new();
    for (key, input) in answers {
        match input.state {
            AnswerState::Answered => {
                env.set_field(key, json_to_runtime_fel(&input.value));
            }
            // SC-02, SC-03: declined and not-presented → null
            AnswerState::Declined | AnswerState::NotPresented => {
                env.set_field(key, json_to_runtime_fel(&Value::Null));
            }
        }
    }

    // ── 3. Hoist override routes (§6.1) ────────────────────────────
    let evaluation = screener
        .get("evaluation")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut override_routes: Vec<&Value> = Vec::new();
    for phase in &evaluation {
        if let Some(routes) = phase.get("routes").and_then(Value::as_array) {
            for route in routes {
                if route
                    .get("override")
                    .and_then(Value::as_bool)
                    .unwrap_or(false)
                {
                    override_routes.push(route);
                }
            }
        }
    }

    // ── 4. Evaluate overrides (§6.2) ───────────────────────────────
    let mut override_matched = Vec::new();
    let mut has_terminal = false;
    let mut document_warnings: Vec<String> = Vec::new();

    for route in &override_routes {
        let condition = route
            .get("condition")
            .and_then(Value::as_str)
            .unwrap_or("false");
        let cond = eval_screener_condition(condition, &env);
        if cond.expression_error {
            push_unique_warning(&mut document_warnings, WARNING_FEL_EXPRESSION_ERROR);
        }
        if cond.truthy {
            let mut result = route_to_result(route);
            result.reason = None; // matched, not eliminated
            override_matched.push(result);
            if route
                .get("terminal")
                .and_then(Value::as_bool)
                .unwrap_or(false)
            {
                has_terminal = true;
            }
        }
    }

    let override_block = OverrideBlock {
        matched: override_matched,
        halted: has_terminal,
    };

    // ── 5. Terminal halt check (§6.2 stage 2) ──────────────────────
    if has_terminal {
        return DeterminationRecord {
            marker: "1.0".to_string(),
            screener: screener_ref,
            timestamp,
            evaluation_version: version,
            status: determine_status(answers),
            overrides: override_block,
            phases: warning_only_phase(document_warnings),
            inputs: build_inputs(answers),
            validity: build_validity(screener, now_str),
            extensions: None,
        };
    }

    // ── 6. Phase evaluation (§4.4, §5) ─────────────────────────────
    let mut phase_results = Vec::new();

    for phase_val in &evaluation {
        let phase_id = phase_val
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let strategy = PhaseStrategy::from_wire(
            phase_val
                .get("strategy")
                .and_then(Value::as_str)
                .unwrap_or(""),
        );

        // Filter out override routes for phase evaluation
        let phase_routes: Vec<&Value> = phase_val
            .get("routes")
            .and_then(Value::as_array)
            .map(|arr| {
                arr.iter()
                    .filter(|r| !r.get("override").and_then(Value::as_bool).unwrap_or(false))
                    .collect()
            })
            .unwrap_or_default();

        // Check activeWhen
        if let Some(active_when) = phase_val.get("activeWhen").and_then(Value::as_str) {
            let active = eval_screener_condition(active_when, &env);
            if !active.truthy {
                let mut warnings = Vec::new();
                if active.expression_error {
                    push_unique_warning(&mut warnings, WARNING_FEL_EXPRESSION_ERROR);
                }
                phase_results.push(PhaseResult {
                    id: phase_id,
                    status: PhaseStatus::Skipped,
                    strategy: strategy.clone(),
                    matched: Vec::new(),
                    eliminated: Vec::new(),
                    warnings,
                });
                continue;
            }
        }

        let config = phase_val.get("config");

        let result = match &strategy {
            PhaseStrategy::FirstMatch => {
                eval_first_match(&phase_id, strategy.clone(), &phase_routes, &env)
            }
            PhaseStrategy::FanOut => {
                eval_fan_out(&phase_id, strategy.clone(), &phase_routes, &env, config)
            }
            PhaseStrategy::ScoreThreshold => {
                eval_score_threshold(&phase_id, strategy.clone(), &phase_routes, &env, config)
            }
            PhaseStrategy::Other(s) if s.starts_with("x-") => PhaseResult {
                id: phase_id,
                status: PhaseStatus::UnsupportedStrategy,
                strategy,
                matched: Vec::new(),
                eliminated: Vec::new(),
                warnings: Vec::new(),
            },
            PhaseStrategy::Other(_) => PhaseResult {
                id: phase_id,
                status: PhaseStatus::UnsupportedStrategy,
                strategy,
                matched: Vec::new(),
                eliminated: Vec::new(),
                warnings: Vec::new(),
            },
        };

        phase_results.push(result);
    }

    if !document_warnings.is_empty() {
        if let Some(first) = phase_results.first_mut() {
            extend_unique_warnings(&mut first.warnings, &document_warnings);
        }
    }

    // ── 7. Assemble DeterminationRecord (§8) ───────────────────────
    DeterminationRecord {
        marker: "1.0".to_string(),
        screener: screener_ref,
        timestamp,
        evaluation_version: version,
        status: determine_status(answers),
        overrides: override_block,
        phases: phase_results,
        inputs: build_inputs(answers),
        validity: build_validity(screener, now_str),
        extensions: None,
    }
}

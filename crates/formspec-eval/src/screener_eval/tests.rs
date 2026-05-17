use std::collections::HashMap;

use serde_json::{json, Value};

use crate::types::determination::{AnswerInput, AnswerState, EliminationReason};

use super::evaluate_screener_document;

fn answer(value: Value) -> AnswerInput {
    AnswerInput {
        value,
        state: AnswerState::Answered,
    }
}

fn declined() -> AnswerInput {
    AnswerInput {
        value: Value::Null,
        state: AnswerState::Declined,
    }
}

fn not_presented() -> AnswerInput {
    AnswerInput {
        value: Value::Null,
        state: AnswerState::NotPresented,
    }
}

fn simple_screener() -> Value {
    json!({
        "$formspecScreener": "1.0",
        "url": "urn:test:screener",
        "version": "1.0.0",
        "title": "Test Screener",
        "items": [
            { "key": "orgType", "type": "field", "dataType": "choice", "label": "Org Type" }
        ],
        "evaluation": [
            {
                "id": "routing",
                "strategy": "first-match",
                "routes": [
                    {
                        "condition": "$orgType = 'nonprofit'",
                        "target": "urn:forms:nonprofit|1.0.0",
                        "label": "Nonprofit Form"
                    },
                    {
                        "condition": "true",
                        "target": "urn:forms:general|1.0.0",
                        "label": "General Form"
                    }
                ]
            }
        ]
    })
}

// ── Basic pipeline tests ───────────────────────────────────────

#[test]
fn first_match_returns_first_truthy_route() {
    let screener = simple_screener();
    let mut answers = HashMap::new();
    answers.insert("orgType".to_string(), answer(json!("nonprofit")));
    let det = evaluate_screener_document(&screener, &answers, Some("2026-04-01T10:00:00Z"));

    assert_eq!(det.status, "completed");
    assert_eq!(det.marker, "1.0");
    assert_eq!(det.screener.url, "urn:test:screener");
    assert_eq!(det.phases.len(), 1);
    assert_eq!(det.phases[0].matched.len(), 1);
    assert_eq!(det.phases[0].matched[0].target, "urn:forms:nonprofit|1.0.0");
    assert_eq!(det.phases[0].eliminated.len(), 0);
}

#[test]
fn malformed_route_condition_emits_warning_and_expression_error_reason() {
    let screener = json!({
        "$formspecScreener": "1.0",
        "url": "urn:test:screener",
        "version": "1.0.0",
        "title": "Test",
        "items": [],
        "evaluation": [{
            "id": "routing",
            "strategy": "first-match",
            "routes": [{
                "condition": "$x ==",
                "target": "urn:broken"
            }]
        }]
    });
    let answers = HashMap::new();
    let det = evaluate_screener_document(&screener, &answers, Some("2026-04-01T10:00:00Z"));

    assert_eq!(det.phases[0].matched.len(), 0);
    assert_eq!(det.phases[0].eliminated.len(), 1);
    assert_eq!(
        det.phases[0].eliminated[0].reason.map(|r| r.as_wire_str()),
        Some("expression-error")
    );
    assert!(
        det.phases[0]
            .warnings
            .contains(&"fel-expression-error".to_string())
    );
}

#[test]
fn malformed_score_expression_emits_warning_and_expression_error_reason() {
    let screener = json!({
        "$formspecScreener": "1.0",
        "url": "urn:test:screener",
        "version": "1.0.0",
        "title": "Test",
        "items": [],
        "evaluation": [{
            "id": "scoring",
            "strategy": "score-threshold",
            "routes": [{
                "score": "$x ==",
                "threshold": 0,
                "target": "urn:broken"
            }]
        }]
    });
    let answers = HashMap::new();
    let det = evaluate_screener_document(&screener, &answers, Some("2026-04-01T10:00:00Z"));

    assert_eq!(det.phases[0].matched.len(), 0);
    assert_eq!(det.phases[0].eliminated.len(), 1);
    assert_eq!(
        det.phases[0].eliminated[0].reason.map(|r| r.as_wire_str()),
        Some("expression-error")
    );
    assert!(
        det.phases[0]
            .warnings
            .contains(&"fel-expression-error".to_string())
    );
}

#[test]
fn first_match_falls_through_to_default() {
    let screener = simple_screener();
    let mut answers = HashMap::new();
    answers.insert("orgType".to_string(), answer(json!("forprofit")));
    let det = evaluate_screener_document(&screener, &answers, Some("2026-04-01T10:00:00Z"));

    assert_eq!(det.phases[0].matched.len(), 1);
    assert_eq!(det.phases[0].matched[0].target, "urn:forms:general|1.0.0");
    assert_eq!(det.phases[0].eliminated.len(), 1);
    assert_eq!(
        det.phases[0].eliminated[0].reason.map(|r| r.as_wire_str()),
        Some("condition-false")
    );
}

#[test]
fn first_match_no_match_produces_empty() {
    let screener = json!({
        "$formspecScreener": "1.0",
        "url": "urn:test:screener",
        "version": "1.0.0",
        "title": "Test",
        "items": [],
        "evaluation": [{
            "id": "p1",
            "strategy": "first-match",
            "routes": [{
                "condition": "$x = 'y'",
                "target": "urn:t"
            }]
        }]
    });
    let answers = HashMap::new();
    let det = evaluate_screener_document(&screener, &answers, Some("2026-04-01T10:00:00Z"));

    assert_eq!(det.phases[0].matched.len(), 0);
    assert_eq!(det.phases[0].eliminated.len(), 1);
}

// ── Fan-out tests ──────────────────────────────────────────────

#[test]
fn fan_out_returns_all_matching_routes() {
    let screener = json!({
        "$formspecScreener": "1.0",
        "url": "urn:test:screener",
        "version": "1.0.0",
        "title": "Test",
        "items": [],
        "evaluation": [{
            "id": "eligibility",
            "strategy": "fan-out",
            "routes": [
                { "condition": "$income < 50000", "target": "urn:snap", "label": "SNAP" },
                { "condition": "$income < 80000", "target": "urn:housing", "label": "Housing" },
                { "condition": "$income < 20000", "target": "urn:emergency", "label": "Emergency" }
            ]
        }]
    });
    let mut answers = HashMap::new();
    answers.insert("income".to_string(), answer(json!(15000)));
    let det = evaluate_screener_document(&screener, &answers, Some("2026-04-01T10:00:00Z"));

    assert_eq!(det.phases[0].strategy, "fan-out");
    assert_eq!(det.phases[0].matched.len(), 3);
    assert_eq!(det.phases[0].eliminated.len(), 0);
}

#[test]
fn fan_out_max_matches_limits_results() {
    let screener = json!({
        "$formspecScreener": "1.0",
        "url": "urn:test:screener",
        "version": "1.0.0",
        "title": "Test",
        "items": [],
        "evaluation": [{
            "id": "p1",
            "strategy": "fan-out",
            "config": { "maxMatches": 2 },
            "routes": [
                { "condition": "true", "target": "urn:a" },
                { "condition": "true", "target": "urn:b" },
                { "condition": "true", "target": "urn:c" }
            ]
        }]
    });
    let answers = HashMap::new();
    let det = evaluate_screener_document(&screener, &answers, Some("2026-04-01T10:00:00Z"));

    assert_eq!(det.phases[0].matched.len(), 2);
    // Excess route eliminated with reason "max-exceeded"
    let max_exceeded: Vec<_> = det.phases[0]
        .eliminated
        .iter()
        .filter(|r| r.reason == Some(EliminationReason::MaxExceeded))
        .collect();
    assert_eq!(max_exceeded.len(), 1);
}

#[test]
fn fan_out_below_minimum_emits_warning() {
    let screener = json!({
        "$formspecScreener": "1.0",
        "url": "urn:test:screener",
        "version": "1.0.0",
        "title": "Test",
        "items": [],
        "evaluation": [{
            "id": "p1",
            "strategy": "fan-out",
            "config": { "minMatches": 3 },
            "routes": [
                { "condition": "true", "target": "urn:a" },
                { "condition": "false", "target": "urn:b" }
            ]
        }]
    });
    let answers = HashMap::new();
    let det = evaluate_screener_document(&screener, &answers, Some("2026-04-01T10:00:00Z"));

    assert_eq!(det.phases[0].matched.len(), 1);
    assert!(
        det.phases[0]
            .warnings
            .contains(&"below-minimum".to_string())
    );
}

// ── Score-threshold tests ──────────────────────────────────────

#[test]
fn score_threshold_basic() {
    let screener = json!({
        "$formspecScreener": "1.0",
        "url": "urn:test:screener",
        "version": "1.0.0",
        "title": "Test",
        "items": [],
        "evaluation": [{
            "id": "scoring",
            "strategy": "score-threshold",
            "routes": [
                { "score": "80", "threshold": 70, "target": "urn:high", "label": "High" },
                { "score": "50", "threshold": 70, "target": "urn:low", "label": "Low" }
            ]
        }]
    });
    let answers = HashMap::new();
    let det = evaluate_screener_document(&screener, &answers, Some("2026-04-01T10:00:00Z"));

    assert_eq!(det.phases[0].matched.len(), 1);
    assert_eq!(det.phases[0].matched[0].target, "urn:high");
    assert_eq!(det.phases[0].matched[0].score, Some(80.0));
    assert_eq!(det.phases[0].eliminated.len(), 1);
    assert_eq!(
        det.phases[0].eliminated[0].reason.map(|r| r.as_wire_str()),
        Some("below-threshold")
    );
}

#[test]
fn score_threshold_null_score_eliminated() {
    let screener = json!({
        "$formspecScreener": "1.0",
        "url": "urn:test:screener",
        "version": "1.0.0",
        "title": "Test",
        "items": [],
        "evaluation": [{
            "id": "scoring",
            "strategy": "score-threshold",
            "routes": [
                { "score": "$missing_field", "threshold": 0, "target": "urn:t" }
            ]
        }]
    });
    let answers = HashMap::new();
    let det = evaluate_screener_document(&screener, &answers, Some("2026-04-01T10:00:00Z"));

    assert_eq!(det.phases[0].matched.len(), 0);
    assert_eq!(det.phases[0].eliminated.len(), 1);
    assert_eq!(
        det.phases[0].eliminated[0].reason.map(|r| r.as_wire_str()),
        Some("null-score")
    );
}

#[test]
fn score_threshold_top_n() {
    let screener = json!({
        "$formspecScreener": "1.0",
        "url": "urn:test:screener",
        "version": "1.0.0",
        "title": "Test",
        "items": [],
        "evaluation": [{
            "id": "scoring",
            "strategy": "score-threshold",
            "config": { "topN": 1 },
            "routes": [
                { "score": "80", "threshold": 0, "target": "urn:high" },
                { "score": "90", "threshold": 0, "target": "urn:highest" },
                { "score": "50", "threshold": 0, "target": "urn:low" }
            ]
        }]
    });
    let answers = HashMap::new();
    let det = evaluate_screener_document(&screener, &answers, Some("2026-04-01T10:00:00Z"));

    // After sorting by score desc, top 1 should be the highest
    assert_eq!(det.phases[0].matched.len(), 1);
    assert_eq!(det.phases[0].matched[0].target, "urn:highest");
}

#[test]
fn score_threshold_normalize() {
    let screener = json!({
        "$formspecScreener": "1.0",
        "url": "urn:test:screener",
        "version": "1.0.0",
        "title": "Test",
        "items": [],
        "evaluation": [{
            "id": "scoring",
            "strategy": "score-threshold",
            "config": { "normalize": true },
            "routes": [
                { "score": "100", "threshold": 0.5, "target": "urn:a" },
                { "score": "40", "threshold": 0.5, "target": "urn:b" }
            ]
        }]
    });
    let answers = HashMap::new();
    let det = evaluate_screener_document(&screener, &answers, Some("2026-04-01T10:00:00Z"));

    // After normalization: a=1.0 (>=0.5 → match), b=0.4 (<0.5 → eliminated)
    assert_eq!(det.phases[0].matched.len(), 1);
    assert_eq!(det.phases[0].matched[0].target, "urn:a");
    assert_eq!(det.phases[0].eliminated.len(), 1);
    assert_eq!(
        det.phases[0].eliminated[0].reason.map(|r| r.as_wire_str()),
        Some("below-threshold")
    );
}

// ── Override tests ─────────────────────────────────────────────

#[test]
fn override_routes_fire_before_phases() {
    let screener = json!({
        "$formspecScreener": "1.0",
        "url": "urn:test:screener",
        "version": "1.0.0",
        "title": "Test",
        "items": [],
        "evaluation": [{
            "id": "p1",
            "strategy": "first-match",
            "routes": [
                {
                    "condition": "true",
                    "target": "outcome:blocked",
                    "override": true,
                    "label": "Blocked"
                },
                {
                    "condition": "true",
                    "target": "urn:forms:normal|1.0.0",
                    "label": "Normal"
                }
            ]
        }]
    });
    let answers = HashMap::new();
    let det = evaluate_screener_document(&screener, &answers, Some("2026-04-01T10:00:00Z"));

    // Override matched
    assert_eq!(det.overrides.matched.len(), 1);
    assert_eq!(det.overrides.matched[0].target, "outcome:blocked");
    assert!(!det.overrides.halted);
    // Phases still execute (non-terminal override)
    assert_eq!(det.phases.len(), 1);
    assert_eq!(det.phases[0].matched.len(), 1);
}

#[test]
fn terminal_override_halts_pipeline() {
    let screener = json!({
        "$formspecScreener": "1.0",
        "url": "urn:test:screener",
        "version": "1.0.0",
        "title": "Test",
        "items": [],
        "evaluation": [{
            "id": "p1",
            "strategy": "first-match",
            "routes": [
                {
                    "condition": "true",
                    "target": "outcome:sanctioned",
                    "override": true,
                    "terminal": true
                },
                { "condition": "true", "target": "urn:forms:normal|1.0.0" }
            ]
        }]
    });
    let answers = HashMap::new();
    let det = evaluate_screener_document(&screener, &answers, Some("2026-04-01T10:00:00Z"));

    assert!(det.overrides.halted);
    assert_eq!(det.overrides.matched.len(), 1);
    assert_eq!(det.phases.len(), 0); // pipeline halted
}

#[test]
fn multiple_overrides_all_evaluated() {
    let screener = json!({
        "$formspecScreener": "1.0",
        "url": "urn:test:screener",
        "version": "1.0.0",
        "title": "Test",
        "items": [],
        "evaluation": [{
            "id": "p1",
            "strategy": "first-match",
            "routes": [
                { "condition": "true", "target": "urn:override1", "override": true, "terminal": true },
                { "condition": "true", "target": "urn:override2", "override": true },
                { "condition": "true", "target": "urn:normal" }
            ]
        }]
    });
    let answers = HashMap::new();
    let det = evaluate_screener_document(&screener, &answers, Some("2026-04-01T10:00:00Z"));

    // All overrides evaluated even though first is terminal
    assert_eq!(det.overrides.matched.len(), 2);
    assert!(det.overrides.halted);
}

// ── activeWhen tests ───────────────────────────────────────────

#[test]
fn active_when_false_skips_phase() {
    let screener = json!({
        "$formspecScreener": "1.0",
        "url": "urn:test:screener",
        "version": "1.0.0",
        "title": "Test",
        "items": [],
        "evaluation": [{
            "id": "skipped-phase",
            "strategy": "first-match",
            "activeWhen": "false",
            "routes": [
                { "condition": "true", "target": "urn:should-not-match" }
            ]
        }]
    });
    let answers = HashMap::new();
    let det = evaluate_screener_document(&screener, &answers, Some("2026-04-01T10:00:00Z"));

    assert_eq!(det.phases[0].status, "skipped");
    assert_eq!(det.phases[0].matched.len(), 0);
}

// ── Availability tests ─────────────────────────────────────────

#[test]
fn availability_window_before_start_returns_unavailable() {
    let screener = json!({
        "$formspecScreener": "1.0",
        "url": "urn:test:screener",
        "version": "1.0.0",
        "title": "Test",
        "items": [],
        "availability": { "from": "2026-06-01" },
        "evaluation": [{ "id": "p1", "strategy": "first-match", "routes": [] }]
    });
    let answers = HashMap::new();
    let det = evaluate_screener_document(&screener, &answers, Some("2026-04-01"));

    assert_eq!(det.status, "unavailable");
    assert_eq!(det.phases.len(), 0);
}

#[test]
fn availability_window_after_end_returns_unavailable() {
    let screener = json!({
        "$formspecScreener": "1.0",
        "url": "urn:test:screener",
        "version": "1.0.0",
        "title": "Test",
        "items": [],
        "availability": { "until": "2026-03-31" },
        "evaluation": [{ "id": "p1", "strategy": "first-match", "routes": [] }]
    });
    let answers = HashMap::new();
    let det = evaluate_screener_document(&screener, &answers, Some("2026-04-01"));

    assert_eq!(det.status, "unavailable");
}

#[test]
fn availability_within_window_proceeds() {
    let screener = json!({
        "$formspecScreener": "1.0",
        "url": "urn:test:screener",
        "version": "1.0.0",
        "title": "Test",
        "items": [],
        "availability": { "from": "2026-01-01", "until": "2026-12-31" },
        "evaluation": [{ "id": "p1", "strategy": "first-match", "routes": [] }]
    });
    let answers = HashMap::new();
    let det = evaluate_screener_document(&screener, &answers, Some("2026-06-15"));

    assert_ne!(det.status, "unavailable");
}

#[test]
fn availability_until_inclusive_uses_offset_calendar_date_not_utc() {
    let screener = json!({
        "$formspecScreener": "1.0",
        "url": "urn:test:screener",
        "version": "1.0.0",
        "title": "Test",
        "items": [],
        "availability": { "until": "2026-04-01" },
        "evaluation": [{ "id": "p1", "strategy": "first-match", "routes": [] }]
    });
    let answers = HashMap::new();
    let det = evaluate_screener_document(
        &screener,
        &answers,
        Some("2026-04-01T23:00:00-08:00"),
    );

    assert_ne!(
        det.status, "unavailable",
        "late evening on 2026-04-01 in -08 must count as 2026-04-01, not UTC 2026-04-02"
    );
}

// ── Answer state tests ─────────────────────────────────────────

#[test]
fn declined_item_evaluates_as_null_in_conditions() {
    let screener = json!({
        "$formspecScreener": "1.0",
        "url": "urn:test:screener",
        "version": "1.0.0",
        "title": "Test",
        "items": [],
        "evaluation": [{
            "id": "p1",
            "strategy": "first-match",
            "routes": [
                { "condition": "empty($choice)", "target": "urn:empty" },
                { "condition": "true", "target": "urn:fallback" }
            ]
        }]
    });
    let mut answers = HashMap::new();
    answers.insert("choice".to_string(), declined());
    let det = evaluate_screener_document(&screener, &answers, Some("2026-04-01T10:00:00Z"));

    // Declined → null → empty($choice) should be true
    assert_eq!(det.phases[0].matched[0].target, "urn:empty");
    // Input state preserved
    assert_eq!(det.inputs["choice"].state, AnswerState::Declined);
}

#[test]
fn not_presented_item_evaluates_as_null() {
    let screener = json!({
        "$formspecScreener": "1.0",
        "url": "urn:test:screener",
        "version": "1.0.0",
        "title": "Test",
        "items": [],
        "evaluation": [{
            "id": "p1",
            "strategy": "first-match",
            "routes": [
                { "condition": "empty($hidden)", "target": "urn:empty" }
            ]
        }]
    });
    let mut answers = HashMap::new();
    answers.insert("hidden".to_string(), not_presented());
    let det = evaluate_screener_document(&screener, &answers, Some("2026-04-01T10:00:00Z"));

    assert_eq!(det.phases[0].matched[0].target, "urn:empty");
    assert_eq!(det.inputs["hidden"].state, AnswerState::NotPresented);
}

#[test]
fn partial_status_when_declined_items_present() {
    let screener = simple_screener();
    let mut answers = HashMap::new();
    answers.insert("orgType".to_string(), declined());
    let det = evaluate_screener_document(&screener, &answers, Some("2026-04-01T10:00:00Z"));

    assert_eq!(det.status, "partial");
}

// ── Extension strategy test ────────────────────────────────────

#[test]
fn extension_strategy_returns_unsupported() {
    let screener = json!({
        "$formspecScreener": "1.0",
        "url": "urn:test:screener",
        "version": "1.0.0",
        "title": "Test",
        "items": [],
        "evaluation": [{
            "id": "custom",
            "strategy": "x-custom-algo",
            "routes": [
                { "condition": "true", "target": "urn:t" }
            ]
        }]
    });
    let answers = HashMap::new();
    let det = evaluate_screener_document(&screener, &answers, Some("2026-04-01T10:00:00Z"));

    assert_eq!(det.phases[0].status, "unsupported-strategy");
    assert_eq!(det.phases[0].strategy, "x-custom-algo");
}

// ── Multi-phase tests ──────────────────────────────────────────

#[test]
fn multiple_phases_all_execute_independently() {
    let screener = json!({
        "$formspecScreener": "1.0",
        "url": "urn:test:screener",
        "version": "1.0.0",
        "title": "Test",
        "items": [],
        "evaluation": [
            {
                "id": "eligibility",
                "strategy": "fan-out",
                "routes": [
                    { "condition": "true", "target": "urn:a" },
                    { "condition": "true", "target": "urn:b" }
                ]
            },
            {
                "id": "form-selection",
                "strategy": "first-match",
                "routes": [
                    { "condition": "true", "target": "urn:c" }
                ]
            }
        ]
    });
    let answers = HashMap::new();
    let det = evaluate_screener_document(&screener, &answers, Some("2026-04-01T10:00:00Z"));

    assert_eq!(det.phases.len(), 2);
    assert_eq!(det.phases[0].matched.len(), 2); // fan-out: both match
    assert_eq!(det.phases[1].matched.len(), 1); // first-match: one match
}

// ── Serialization test ─────────────────────────────────────────

#[test]
fn determination_serializes_with_correct_keys() {
    let screener = simple_screener();
    let mut answers = HashMap::new();
    answers.insert("orgType".to_string(), answer(json!("nonprofit")));
    let det = evaluate_screener_document(&screener, &answers, Some("2026-04-01T10:00:00Z"));

    let json = serde_json::to_value(&det).unwrap();
    assert_eq!(json["$formspecDetermination"], "1.0");
    assert!(json.get("screener").is_some());
    assert!(json.get("evaluationVersion").is_some());
    assert!(json.get("evaluation_version").is_none()); // must be camelCase
}

//! Integration tests for screener-spec §9.2 `resultValidity` → `validUntil` (SC-21).
//!
//! Exercises [`evaluate_screener_document`] across the public boundary —
//! covering zero duration, leap-year rollover, timezone preservation,
//! composite durations, and malformed inputs. Companion to the unit-level
//! tests in `screener_eval.rs`.

use std::collections::HashMap;

use formspec_eval::screener_eval::evaluate_screener_document;
use formspec_eval::types::AnswerInput;
use serde_json::{Value, json};

fn empty_answers() -> HashMap<String, AnswerInput> {
    HashMap::new()
}

fn screener_with_validity(duration: &str) -> Value {
    json!({
        "$formspecScreener": "1.0",
        "url": "urn:test:screener",
        "version": "1.0.0",
        "title": "Test",
        "items": [],
        "resultValidity": duration,
        "evaluation": [{
            "id": "p1",
            "strategy": "first-match",
            "routes": [{ "condition": "true", "target": "urn:t" }]
        }]
    })
}

fn screener_without_validity() -> Value {
    json!({
        "$formspecScreener": "1.0",
        "url": "urn:test:screener",
        "version": "1.0.0",
        "title": "Test",
        "items": [],
        "evaluation": [{
            "id": "p1",
            "strategy": "first-match",
            "routes": [{ "condition": "true", "target": "urn:t" }]
        }]
    })
}

#[test]
fn no_result_validity_means_no_block() {
    let det = evaluate_screener_document(
        &screener_without_validity(),
        &empty_answers(),
        Some("2026-04-01T10:00:00Z"),
    );
    assert!(det.validity.is_none());
}

#[test]
fn zero_duration_yields_now_as_valid_until() {
    let det = evaluate_screener_document(
        &screener_with_validity("P0D"),
        &empty_answers(),
        Some("2026-04-01T10:00:00Z"),
    );
    let v = det.validity.expect("validity block");
    assert_eq!(v.result_validity, "P0D");
    // RFC 3339 round-trip — `Z` in input becomes `+00:00` in chrono output.
    assert_eq!(v.valid_until, "2026-04-01T10:00:00+00:00");
}

#[test]
fn days_duration_adds_to_now() {
    let det = evaluate_screener_document(
        &screener_with_validity("P14D"),
        &empty_answers(),
        Some("2026-04-01T10:00:00Z"),
    );
    let v = det.validity.unwrap();
    assert_eq!(v.valid_until, "2026-04-15T10:00:00+00:00");
}

#[test]
fn one_year_duration_adds_one_year() {
    let det = evaluate_screener_document(
        &screener_with_validity("P1Y"),
        &empty_answers(),
        Some("2026-04-01T10:00:00Z"),
    );
    let v = det.validity.unwrap();
    assert_eq!(v.valid_until, "2027-04-01T10:00:00+00:00");
}

#[test]
fn leap_year_p1y_clamps_to_feb_28() {
    // 2024-02-29 + P1Y → 2025-02-28 (chrono::Months end-of-month clamp).
    let det = evaluate_screener_document(
        &screener_with_validity("P1Y"),
        &empty_answers(),
        Some("2024-02-29T12:00:00Z"),
    );
    let v = det.validity.unwrap();
    assert_eq!(v.valid_until, "2025-02-28T12:00:00+00:00");
}

#[test]
fn timezone_offset_preserved_across_day_addition() {
    let det = evaluate_screener_document(
        &screener_with_validity("P1D"),
        &empty_answers(),
        Some("2026-01-01T00:00:00-05:00"),
    );
    let v = det.validity.unwrap();
    // Offset preserved; calendar day rolls forward.
    assert_eq!(v.valid_until, "2026-01-02T00:00:00-05:00");
}

#[test]
fn weeks_duration_adds_seven_days_per_week() {
    let det = evaluate_screener_document(
        &screener_with_validity("P2W"),
        &empty_answers(),
        Some("2026-04-01T10:00:00Z"),
    );
    let v = det.validity.unwrap();
    assert_eq!(v.valid_until, "2026-04-15T10:00:00+00:00");
}

#[test]
fn time_only_duration_works() {
    let det = evaluate_screener_document(
        &screener_with_validity("PT1H30M"),
        &empty_answers(),
        Some("2026-04-01T10:00:00Z"),
    );
    let v = det.validity.unwrap();
    assert_eq!(v.valid_until, "2026-04-01T11:30:00+00:00");
}

#[test]
fn composite_duration_combines_calendar_and_time_units() {
    // P1Y2M3DT4H5M against 2026-01-01T00:00:00Z.
    //   +14 months → 2027-03-01
    //   +3 days   → 2027-03-04
    //   +4h 5m    → 2027-03-04T04:05:00Z
    let det = evaluate_screener_document(
        &screener_with_validity("P1Y2M3DT4H5M"),
        &empty_answers(),
        Some("2026-01-01T00:00:00Z"),
    );
    let v = det.validity.unwrap();
    assert_eq!(v.valid_until, "2027-03-04T04:05:00+00:00");
}

#[test]
fn malformed_duration_drops_validity_block() {
    // SC-21 says the block MUST be present when resultValidity is declared.
    // We elect to drop the block on parse failure rather than emit a
    // schema-invalid empty `validUntil` — defect surfaces as absence.
    for bad in [
        "P1X",     // unknown unit
        "1Y",      // missing leading P
        "P",       // no components
        "PT",      // empty time section
        "p1y",     // lowercase units
        "P1.5Y",   // decimals not in our subset
        "P-1Y",    // negative
        "P1Y2",    // trailing digits without unit
        "garbage", // not a duration
    ] {
        let det = evaluate_screener_document(
            &screener_with_validity(bad),
            &empty_answers(),
            Some("2026-04-01T10:00:00Z"),
        );
        assert!(
            det.validity.is_none(),
            "expected None for malformed duration {bad:?}, got {:?}",
            det.validity
        );
    }
}

#[test]
fn malformed_now_drops_validity_block() {
    // build_validity requires RFC 3339; a date-only string (used elsewhere
    // for availability checks) cannot anchor `validUntil`.
    let det = evaluate_screener_document(
        &screener_with_validity("P14D"),
        &empty_answers(),
        Some("2026-04-01"),
    );
    assert!(det.validity.is_none());
}

#[test]
fn no_now_drops_validity_block() {
    let det = evaluate_screener_document(&screener_with_validity("P14D"), &empty_answers(), None);
    assert!(det.validity.is_none());
}

#[test]
fn serialized_validity_uses_camel_case() {
    let det = evaluate_screener_document(
        &screener_with_validity("P90D"),
        &empty_answers(),
        Some("2026-04-01T10:00:00Z"),
    );
    let serialized = serde_json::to_value(&det).expect("serialize");
    let v = &serialized["validity"];
    assert!(v.get("validUntil").is_some(), "camelCase key required");
    assert!(v.get("resultValidity").is_some());
    assert_eq!(v["resultValidity"], "P90D");
}

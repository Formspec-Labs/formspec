//! Screener availability window checks and unavailable determinations (screener-spec §9.1).
//!
//! ## Calendar date semantics
//!
//! Availability `from` / `until` are ISO 8601 **dates** (inclusive calendar bounds). The
//! evaluation timestamp (`now_iso` passed to [`super::evaluate_screener_document`]) may be a
//! date or a full RFC 3339 datetime.
//!
//! When `now_iso` is a datetime, the calendar date used for the availability check is the
//! **local calendar date in that timestamp's stated offset** (the date component before the
//! offset in the string), not the UTC calendar date of the same instant. Example:
//! `2026-04-01T23:00:00-08:00` is still 2026-04-01 for availability even though the instant
//! is 2026-04-02 in UTC.
//!
//! When `availability` is declared, a missing or unparseable evaluation timestamp MUST NOT
//! proceed to route evaluation (SC-04): the processor returns status `"unavailable"`.

use std::collections::HashMap;

use chrono::{DateTime, NaiveDate};
use serde_json::Value;

use crate::types::determination::{
    AnswerInput, DeterminationRecord, DeterminationStatus, OverrideBlock, ScreenerRef,
};

use super::helpers::build_inputs;

/// Parse the evaluation calendar date from an ISO 8601 date or RFC 3339 datetime string.
pub(crate) fn parse_date_from_iso(s: &str) -> Option<NaiveDate> {
    if s.is_empty() {
        return None;
    }
    if let Ok(date) = NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        return Some(date);
    }
    DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|dt| dt.date_naive())
}

/// Check if a date is within an availability window.
pub(crate) fn is_within_availability(availability: &Value, today: NaiveDate) -> bool {
    if let Some(from) = availability
        .get("from")
        .and_then(Value::as_str)
        .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
    {
        if today < from {
            return false;
        }
    }
    if let Some(until) = availability
        .get("until")
        .and_then(Value::as_str)
        .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
    {
        if today > until {
            return false;
        }
    }
    true
}

/// Build an "unavailable" Determination Record.
pub(crate) fn make_unavailable(
    screener_ref: ScreenerRef,
    timestamp: &str,
    version: &str,
    answers: &HashMap<String, AnswerInput>,
) -> DeterminationRecord {
    DeterminationRecord {
        marker: "1.0".to_string(),
        screener: screener_ref,
        timestamp: timestamp.to_string(),
        evaluation_version: version.to_string(),
        status: DeterminationStatus::Unavailable,
        overrides: OverrideBlock {
            matched: Vec::new(),
            halted: false,
        },
        phases: Vec::new(),
        inputs: build_inputs(answers),
        validity: None,
        extensions: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_date_from_iso_offset_datetime_uses_stated_offset_calendar_date() {
        // 23:00 on 2026-04-01 in -08; UTC instant is 2026-04-02 — availability uses Apr 1.
        let date = parse_date_from_iso("2026-04-01T23:00:00-08:00").unwrap();
        assert_eq!(date, NaiveDate::from_ymd_opt(2026, 4, 1).unwrap());
        assert_ne!(date, NaiveDate::from_ymd_opt(2026, 4, 2).unwrap());
    }

    #[test]
    fn parse_date_from_iso_date_only_unchanged() {
        assert_eq!(
            parse_date_from_iso("2026-06-15").unwrap(),
            NaiveDate::from_ymd_opt(2026, 6, 15).unwrap()
        );
    }
}

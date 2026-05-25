//! Pass 9: Screener semantic hardening and Determination Record consistency.
#![allow(clippy::missing_docs_in_private_items)]

use std::collections::HashSet;

use serde_json::Value;

use crate::semantic_helpers::{error, parse_form_path, resolve_item_path, scan_interpolations};
use crate::tree;
use crate::types::LintDiagnostic;

pub(crate) const PASS: u8 = 9;

pub(crate) fn lint_screener_semantics(
    doc: &Value,
    parse_interpolations: bool,
) -> Vec<LintDiagnostic> {
    let mut diagnostics = Vec::new();
    let tree_index = tree::build_item_index(doc);
    diagnostics.extend(tree_index.diagnostics.clone());
    check_binds(doc, &tree_index, &mut diagnostics);
    check_lifecycle(doc, &mut diagnostics);
    check_evaluation(doc, parse_interpolations, &mut diagnostics);
    diagnostics
}

pub(crate) fn lint_determination_record(doc: &Value) -> Vec<LintDiagnostic> {
    let mut diagnostics = Vec::new();
    let status = doc.get("status").and_then(Value::as_str);
    let halted = doc
        .get("overrides")
        .and_then(|v| v.get("halted"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let phases_empty = doc
        .get("phases")
        .and_then(Value::as_array)
        .is_none_or(Vec::is_empty);
    if halted && !phases_empty {
        diagnostics.push(error(
            crate::LintCode::E1506,
            PASS,
            "$.phases",
            "Determination Record has overrides.halted=true but phases is not empty",
        ));
    }
    if status == Some("unavailable") {
        if !phases_empty {
            diagnostics.push(error(
                crate::LintCode::E1506,
                PASS,
                "$.phases",
                "Unavailable Determination Record must not contain evaluated phases",
            ));
        }
        let overrides_matched_empty = doc
            .get("overrides")
            .and_then(|v| v.get("matched"))
            .and_then(Value::as_array)
            .is_none_or(Vec::is_empty);
        if halted || !overrides_matched_empty {
            diagnostics.push(error(
                crate::LintCode::E1506,
                PASS,
                "$.overrides",
                "Unavailable Determination Record must not contain matched or halted overrides",
            ));
        }
    } else if !halted && phases_empty {
        diagnostics.push(error(
            crate::LintCode::E1506,
            PASS,
            "$.phases",
            "Available Determination Record must contain evaluated phases unless overrides halted evaluation",
        ));
    }
    if let (Some(screener_version), Some(evaluation_version)) = (
        doc.get("screener")
            .and_then(|v| v.get("version"))
            .and_then(Value::as_str),
        doc.get("evaluationVersion").and_then(Value::as_str),
    ) && (screener_version.trim().is_empty() || evaluation_version.trim().is_empty())
    {
        diagnostics.push(error(
            crate::LintCode::E1506,
            PASS,
            "$.evaluationVersion",
            "Determination Record screener.version and evaluationVersion must be non-empty",
        ));
    }
    check_determination_validity(doc, status, &mut diagnostics);
    diagnostics
}

fn check_binds(doc: &Value, index: &tree::ItemTreeIndex, diagnostics: &mut Vec<LintDiagnostic>) {
    let Some(binds) = doc.get("binds").and_then(Value::as_array) else {
        return;
    };
    for (i, bind) in binds.iter().enumerate() {
        let Some(path) = bind.get("path").and_then(Value::as_str) else {
            continue;
        };
        let json_path = format!("$.binds[{i}].path");
        if let Err(err) = parse_form_path(path, false) {
            diagnostics.push(error(
                crate::LintCode::E1500,
                PASS,
                json_path,
                format!("Invalid Screener bind path syntax: {err}"),
            ));
            continue;
        }
        match resolve_item_path(path, index, false) {
            Ok(Some(_)) => {}
            Ok(None) => diagnostics.push(error(
                crate::LintCode::E1500,
                PASS,
                json_path,
                format!("Screener bind path {path:?} does not resolve within screener items"),
            )),
            Err(err) => diagnostics.push(error(crate::LintCode::E1500, PASS, json_path, err)),
        }
    }
}

fn check_lifecycle(doc: &Value, diagnostics: &mut Vec<LintDiagnostic>) {
    check_availability(doc, diagnostics);
    if let Some(result_validity) = doc.get("resultValidity").and_then(Value::as_str)
        && !is_valid_iso_duration(result_validity)
    {
        diagnostics.push(error(
            crate::LintCode::E1505,
            PASS,
            "$.resultValidity",
            "Screener resultValidity must be a non-empty ISO 8601 duration with at least one component",
        ));
    }
    if let Some(binding) = doc.get("evaluationBinding").and_then(Value::as_str) {
        if !matches!(binding, "submission" | "completion") {
            diagnostics.push(error(
                crate::LintCode::E1505,
                PASS,
                "$.evaluationBinding",
                "Screener evaluationBinding must be submission or completion",
            ));
            return;
        }
        if let Some(version) = doc.get("version").and_then(Value::as_str)
            && !is_semver(version)
        {
            diagnostics.push(error(
                crate::LintCode::E1505,
                PASS,
                "$.version",
                "Screener evaluationBinding requires a semantic version in version",
            ));
        }
    }
}

fn check_availability(doc: &Value, diagnostics: &mut Vec<LintDiagnostic>) {
    let Some(availability) = doc.get("availability") else {
        return;
    };
    let from = availability.get("from").and_then(Value::as_str);
    let until = availability.get("until").and_then(Value::as_str);
    let parsed_from = from.and_then(parse_iso_date);
    let parsed_until = until.and_then(parse_iso_date);
    if from.is_some() && parsed_from.is_none() {
        diagnostics.push(error(
            crate::LintCode::E1505,
            PASS,
            "$.availability.from",
            "Screener availability.from must be a valid ISO 8601 calendar date",
        ));
    }
    if until.is_some() && parsed_until.is_none() {
        diagnostics.push(error(
            crate::LintCode::E1505,
            PASS,
            "$.availability.until",
            "Screener availability.until must be a valid ISO 8601 calendar date",
        ));
    }
    if let (Some(from), Some(until)) = (parsed_from, parsed_until)
        && from > until
    {
        diagnostics.push(error(
            crate::LintCode::E1505,
            PASS,
            "$.availability",
            "Screener availability.from must not be after availability.until",
        ));
    }
}

fn check_determination_validity(
    doc: &Value,
    status: Option<&str>,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    let validity = doc.get("validity");
    if status == Some("unavailable") && validity.is_some() {
        diagnostics.push(error(
            crate::LintCode::E1506,
            PASS,
            "$.validity",
            "Unavailable Determination Record must not include validity metadata",
        ));
    }
    if status == Some("expired") && validity.is_none() {
        diagnostics.push(error(
            crate::LintCode::E1506,
            PASS,
            "$.validity",
            "Expired Determination Record must include validity metadata",
        ));
    }

    let Some(validity) = validity.and_then(Value::as_object) else {
        return;
    };
    let valid_until = validity.get("validUntil").and_then(Value::as_str);
    let result_validity = validity.get("resultValidity").and_then(Value::as_str);
    if valid_until.is_none_or(|value| value.trim().is_empty())
        || result_validity.is_none_or(|value| value.trim().is_empty())
    {
        diagnostics.push(error(
            crate::LintCode::E1506,
            PASS,
            "$.validity",
            "Determination Record validity must include non-empty validUntil and resultValidity",
        ));
    }
    if let Some(valid_until) = valid_until
        && !valid_until_has_valid_date(valid_until)
    {
        diagnostics.push(error(
            crate::LintCode::E1506,
            PASS,
            "$.validity.validUntil",
            "Determination Record validUntil must begin with a valid ISO 8601 date-time",
        ));
    }
    if let Some(result_validity) = result_validity
        && !is_valid_iso_duration(result_validity)
    {
        diagnostics.push(error(
            crate::LintCode::E1506,
            PASS,
            "$.validity.resultValidity",
            "Determination Record resultValidity must be a non-empty ISO 8601 duration with at least one component",
        ));
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct CalendarDate {
    year: i32,
    month: u8,
    day: u8,
}

fn parse_iso_date(value: &str) -> Option<CalendarDate> {
    let bytes = value.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return None;
    }
    let year = parse_ascii_digits(&bytes[0..4])? as i32;
    let month = parse_ascii_digits(&bytes[5..7])? as u8;
    let day = parse_ascii_digits(&bytes[8..10])? as u8;
    let max_day = days_in_month(year, month)?;
    if day == 0 || day > max_day {
        return None;
    }
    Some(CalendarDate { year, month, day })
}

fn parse_ascii_digits(bytes: &[u8]) -> Option<u32> {
    if bytes.is_empty() || !bytes.iter().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    bytes.iter().try_fold(0_u32, |value, byte| {
        value.checked_mul(10)?.checked_add(u32::from(byte - b'0'))
    })
}

fn days_in_month(year: i32, month: u8) -> Option<u8> {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => Some(31),
        4 | 6 | 9 | 11 => Some(30),
        2 if is_leap_year(year) => Some(29),
        2 => Some(28),
        _ => None,
    }
}

fn is_leap_year(year: i32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

fn is_valid_iso_duration(value: &str) -> bool {
    let Some(mut rest) = value.strip_prefix('P') else {
        return false;
    };
    if rest.is_empty() {
        return false;
    }

    let mut in_time = false;
    let mut saw_component = false;
    while !rest.is_empty() {
        if let Some(after_time_marker) = rest.strip_prefix('T') {
            if in_time || after_time_marker.is_empty() {
                return false;
            }
            in_time = true;
            rest = after_time_marker;
            continue;
        }

        let digit_count = rest.bytes().take_while(u8::is_ascii_digit).count();
        if digit_count == 0 || digit_count >= rest.len() {
            return false;
        }
        let (number, remainder) = rest.split_at(digit_count);
        if parse_ascii_digits(number.as_bytes()).is_none() {
            return false;
        }
        let Some(unit) = remainder.chars().next() else {
            return false;
        };
        let valid_unit = if in_time {
            matches!(unit, 'H' | 'M' | 'S')
        } else {
            matches!(unit, 'Y' | 'M' | 'W' | 'D')
        };
        if !valid_unit {
            return false;
        }
        saw_component = true;
        rest = &remainder[unit.len_utf8()..];
    }
    saw_component
}

fn valid_until_has_valid_date(value: &str) -> bool {
    let Some((date, time)) = value.split_once('T') else {
        return false;
    };
    !time.is_empty() && parse_iso_date(date).is_some()
}

fn is_semver(value: &str) -> bool {
    let (without_build, build) = value.split_once('+').unwrap_or((value, ""));
    if value.contains('+') && (build.is_empty() || !is_semver_identifier_list(build)) {
        return false;
    }
    let (core, pre_release) = without_build.split_once('-').unwrap_or((without_build, ""));
    if without_build.contains('-')
        && (pre_release.is_empty() || !is_semver_identifier_list(pre_release))
    {
        return false;
    }
    let parts = core.split('.').collect::<Vec<_>>();
    parts.len() == 3 && parts.iter().all(|part| is_semver_numeric_identifier(part))
}

fn is_semver_numeric_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.bytes().all(|byte| byte.is_ascii_digit())
        && (value == "0" || !value.starts_with('0'))
}

fn is_semver_identifier_list(value: &str) -> bool {
    value.split('.').all(|part| {
        !part.is_empty()
            && part
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
    })
}

fn check_evaluation(
    doc: &Value,
    parse_interpolations: bool,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    let Some(phases) = doc.get("evaluation").and_then(Value::as_array) else {
        return;
    };
    if phases.is_empty() {
        diagnostics.push(error(
            crate::LintCode::E1501,
            PASS,
            "$.evaluation",
            "Screener evaluation must contain at least one phase",
        ));
    }

    let mut phase_ids = HashSet::new();
    for (phase_index, phase) in phases.iter().enumerate() {
        let phase_path = format!("$.evaluation[{phase_index}]");
        if let Some(id) = phase.get("id").and_then(Value::as_str)
            && !phase_ids.insert(id.to_string())
        {
            diagnostics.push(error(
                crate::LintCode::E1501,
                PASS,
                format!("{phase_path}.id"),
                format!("Duplicate Screener phase id {id:?}"),
            ));
        }
        let strategy = phase
            .get("strategy")
            .and_then(Value::as_str)
            .unwrap_or("first-match");
        if !matches!(strategy, "first-match" | "fan-out" | "score-threshold")
            && !strategy.starts_with("x-")
        {
            diagnostics.push(error(
                crate::LintCode::E1501,
                PASS,
                format!("{phase_path}.strategy"),
                format!("Screener strategy {strategy:?} must be normative or x-prefixed"),
            ));
        }

        let Some(routes) = phase.get("routes").and_then(Value::as_array) else {
            continue;
        };
        if routes.is_empty() {
            diagnostics.push(error(
                crate::LintCode::E1501,
                PASS,
                format!("{phase_path}.routes"),
                "Screener phase must contain at least one route",
            ));
        }
        let mut previous_unconditional = false;
        for (route_index, route) in routes.iter().enumerate() {
            let route_path = format!("{phase_path}.routes[{route_index}]");
            check_route(strategy, route, &route_path, diagnostics);
            if parse_interpolations
                && let Some(message) = route.get("message").and_then(Value::as_str)
            {
                scan_interpolations(
                    message,
                    &format!("{route_path}.message"),
                    crate::LintCode::E1507,
                    PASS,
                    "Screener route message",
                    diagnostics,
                );
            }
            if strategy == "first-match" {
                let condition = route.get("condition").and_then(Value::as_str);
                if previous_unconditional {
                    diagnostics.push(crate::semantic_helpers::warning(
                        crate::LintCode::W1500,
                        PASS,
                        route_path.clone(),
                        "Screener first-match route is shadowed by a prior unconditional route",
                    ));
                }
                if matches!(condition.map(str::trim), Some("true")) {
                    previous_unconditional = true;
                }
            }
        }
    }
}

fn check_route(
    strategy: &str,
    route: &Value,
    route_path: &str,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    if let Some(target) = route.get("target").and_then(Value::as_str) {
        check_route_target(target, route_path, diagnostics);
    }

    let has_condition = route.get("condition").and_then(Value::as_str).is_some();
    let has_score = route.get("score").and_then(Value::as_str).is_some();
    let has_threshold = route.get("threshold").and_then(Value::as_f64).is_some();
    let is_override = route
        .get("override")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    if matches!(strategy, "first-match" | "fan-out") && !has_condition {
        diagnostics.push(error(
            crate::LintCode::E1502,
            PASS,
            route_path,
            format!("Screener {strategy} route must declare condition"),
        ));
    }
    if strategy == "score-threshold" && !is_override && (!has_score || !has_threshold) {
        diagnostics.push(error(
            crate::LintCode::E1503,
            PASS,
            route_path,
            "Screener score-threshold route must declare score and threshold",
        ));
    }
    if is_override && !has_condition {
        diagnostics.push(error(
            crate::LintCode::E1502,
            PASS,
            route_path,
            "Screener override route must declare condition",
        ));
    }
}

fn check_route_target(target: &str, route_path: &str, diagnostics: &mut Vec<LintDiagnostic>) {
    if target.trim().is_empty() || target.chars().any(char::is_whitespace) {
        diagnostics.push(error(
            crate::LintCode::E1504,
            PASS,
            format!("{route_path}.target"),
            "Screener route target must be a non-empty URI, Definition reference, or outcome target without whitespace",
        ));
        return;
    }
    if target.starts_with("outcome:") {
        if target == "outcome:" {
            diagnostics.push(error(
                crate::LintCode::E1504,
                PASS,
                format!("{route_path}.target"),
                "Screener outcome target must include an outcome name",
            ));
        }
        return;
    }
    if let Some((url, version)) = target.split_once('|') {
        if url.is_empty() || version.is_empty() {
            diagnostics.push(error(
                crate::LintCode::E1504,
                PASS,
                format!("{route_path}.target"),
                "Screener Definition route target must use non-empty url|version",
            ));
        }
        return;
    }
    if !(target.contains(':') || target.starts_with('/')) {
        diagnostics.push(error(
            crate::LintCode::E1504,
            PASS,
            format!("{route_path}.target"),
            "Screener route target must be an absolute/relative URI, url|version reference, or outcome:name",
        ));
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]

    use serde_json::json;

    use super::*;

    #[test]
    fn screener_lifecycle_rejects_invalid_dates_duration_and_binding_version() {
        let doc = json!({
            "$formspecScreener": "1.0",
            "url": "https://example.com/screeners/lifecycle",
            "version": "not-semver",
            "title": "Lifecycle",
            "availability": {
                "from": "2026-02-30",
                "until": "2026-03-01"
            },
            "resultValidity": "P",
            "evaluationBinding": "completion",
            "items": [
                { "key": "name", "type": "field", "label": "Name", "dataType": "string" }
            ],
            "evaluation": [
                {
                    "id": "phase",
                    "strategy": "first-match",
                    "routes": [
                        { "target": "outcome:any", "condition": "true" }
                    ]
                }
            ]
        });

        let diagnostics = lint_screener_semantics(&doc, false);

        assert!(diagnostics.iter().any(|diag| {
            diag.code == crate::LintCode::E1505 && diag.path == "$.availability.from"
        }));
        assert!(diagnostics.iter().any(|diag| {
            diag.code == crate::LintCode::E1505 && diag.path == "$.resultValidity"
        }));
        assert!(diagnostics
            .iter()
            .any(|diag| { diag.code == crate::LintCode::E1505 && diag.path == "$.version" }));
    }

    #[test]
    fn score_threshold_override_routes_use_condition_not_score() {
        let doc = json!({
            "$formspecScreener": "1.0",
            "url": "https://example.com/screeners/override",
            "version": "1.0.0",
            "title": "Override",
            "items": [
                { "key": "risk", "type": "field", "label": "Risk", "dataType": "boolean" }
            ],
            "evaluation": [
                {
                    "id": "phase",
                    "strategy": "score-threshold",
                    "routes": [
                        { "target": "outcome:stop", "override": true, "condition": "$risk" },
                        { "target": "outcome:continue", "score": "1", "threshold": 1 }
                    ]
                }
            ]
        });

        let diagnostics = lint_screener_semantics(&doc, false);

        assert!(
            !diagnostics
                .iter()
                .any(|diag| diag.code == crate::LintCode::E1503),
            "score-threshold override routes should not require score/threshold: {:?}",
            diagnostics
        );
    }

    #[test]
    fn determination_validity_and_unavailable_state_are_consistent() {
        let unavailable = json!({
            "$formspecDetermination": "1.0",
            "screener": { "url": "https://example.com/screeners/x", "version": "1.0.0" },
            "timestamp": "2026-05-19T12:00:00Z",
            "evaluationVersion": "1.0.0",
            "status": "unavailable",
            "overrides": {
                "matched": [{ "target": "outcome:override" }],
                "halted": true
            },
            "phases": [],
            "inputs": {},
            "validity": { "resultValidity": "P" }
        });
        let expired = json!({
            "$formspecDetermination": "1.0",
            "screener": { "url": "https://example.com/screeners/x", "version": "1.0.0" },
            "timestamp": "2026-05-19T12:00:00Z",
            "evaluationVersion": "1.0.0",
            "status": "expired",
            "overrides": { "matched": [], "halted": false },
            "phases": [
                {
                    "id": "phase",
                    "status": "evaluated",
                    "strategy": "first-match",
                    "matched": [{ "target": "outcome:any" }],
                    "eliminated": []
                }
            ],
            "inputs": {}
        });

        let unavailable_diagnostics = lint_determination_record(&unavailable);
        let expired_diagnostics = lint_determination_record(&expired);

        assert!(unavailable_diagnostics
            .iter()
            .any(|diag| { diag.code == crate::LintCode::E1506 && diag.path == "$.overrides" }));
        assert!(unavailable_diagnostics
            .iter()
            .any(|diag| { diag.code == crate::LintCode::E1506 && diag.path == "$.validity" }));
        assert!(unavailable_diagnostics.iter().any(|diag| {
            diag.code == crate::LintCode::E1506 && diag.path == "$.validity.resultValidity"
        }));
        assert!(expired_diagnostics
            .iter()
            .any(|diag| { diag.code == crate::LintCode::E1506 && diag.path == "$.validity" }));
    }
}

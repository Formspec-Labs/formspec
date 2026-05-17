//! Standalone Screener Document evaluation — full pipeline per screener-spec.md §10.
//!
//! Replaces the embedded-screener first-match-only `evaluate_screener` with a
//! multi-phase, multi-strategy pipeline that produces a Determination Record.

use std::collections::HashMap;

use chrono::{DateTime, Days, FixedOffset, Months, NaiveDate, TimeDelta};
use fel_core::FormspecEnvironment;
use rust_decimal::prelude::ToPrimitive;
use serde_json::Value;

use crate::fel_json::json_to_runtime_fel;
use crate::types::determination::{
    AnswerInput, AnswerState, DeterminationRecord, InputEntry, OverrideBlock, PhaseResult,
    RouteResult, ScreenerRef, ValidityBlock,
};

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

    // ── 1. Availability check (§10.1 step 1) ──────────────────────
    if let Some(availability) = screener.get("availability") {
        if let Some(today) = parse_date_from_iso(now_str) {
            if !is_within_availability(availability, today) {
                return make_unavailable(screener_ref, &timestamp, &version, answers);
            }
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
            document_warnings.push(WARNING_FEL_EXPRESSION_ERROR.to_string());
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
        let strategy = phase_val
            .get("strategy")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();

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
            if active.expression_error {
                document_warnings.push(WARNING_FEL_EXPRESSION_ERROR.to_string());
            }
            if !active.truthy {
                let mut warnings = Vec::new();
                if active.expression_error {
                    warnings.push(WARNING_FEL_EXPRESSION_ERROR.to_string());
                }
                phase_results.push(PhaseResult {
                    id: phase_id,
                    status: "skipped".to_string(),
                    strategy,
                    matched: Vec::new(),
                    eliminated: Vec::new(),
                    warnings,
                });
                continue;
            }
        }

        let config = phase_val.get("config");

        let result = match strategy.as_str() {
            "first-match" => eval_first_match(&phase_id, &strategy, &phase_routes, &env),
            "fan-out" => eval_fan_out(&phase_id, &strategy, &phase_routes, &env, config),
            "score-threshold" => {
                eval_score_threshold(&phase_id, &strategy, &phase_routes, &env, config)
            }
            _ if strategy.starts_with("x-") => PhaseResult {
                id: phase_id,
                status: "unsupported-strategy".to_string(),
                strategy,
                matched: Vec::new(),
                eliminated: Vec::new(),
                warnings: Vec::new(),
            },
            _ => PhaseResult {
                id: phase_id,
                status: "unsupported-strategy".to_string(),
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
            first.warnings.extend(document_warnings);
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

// ── Strategy implementations ───────────────────────────────────────

/// §5.1 first-match: sequential, first condition=true wins.
fn eval_first_match(
    phase_id: &str,
    strategy: &str,
    routes: &[&Value],
    env: &FormspecEnvironment,
) -> PhaseResult {
    let mut matched = Vec::new();
    let mut eliminated = Vec::new();

    for route in routes {
        let condition = route
            .get("condition")
            .and_then(Value::as_str)
            .unwrap_or("false");
        let cond = eval_screener_condition(condition, env);
        if cond.truthy {
            matched.push(route_to_result(route));
            // Remaining routes go to eliminated as not-evaluated
            // (spec says evaluation stops after first match)
            break;
        } else {
            let mut result = route_to_result(route);
            result.reason = Some(elimination_reason_for_condition(&cond).to_string());
            eliminated.push(result);
        }
    }

    let warnings = phase_warnings_from_eliminated(&eliminated);
    PhaseResult {
        id: phase_id.to_string(),
        status: "evaluated".to_string(),
        strategy: strategy.to_string(),
        matched,
        eliminated,
        warnings,
    }
}

/// §5.2 fan-out: evaluate all, return all true.
fn eval_fan_out(
    phase_id: &str,
    strategy: &str,
    routes: &[&Value],
    env: &FormspecEnvironment,
    config: Option<&Value>,
) -> PhaseResult {
    let mut matched = Vec::new();
    let mut eliminated = Vec::new();
    let mut warnings = Vec::new();

    for route in routes {
        let condition = route
            .get("condition")
            .and_then(Value::as_str)
            .unwrap_or("false");
        let cond = eval_screener_condition(condition, env);
        if cond.truthy {
            matched.push(route_to_result(route));
        } else {
            let mut result = route_to_result(route);
            result.reason = Some(elimination_reason_for_condition(&cond).to_string());
            eliminated.push(result);
        }
    }

    warnings.extend(phase_warnings_from_eliminated(&eliminated));

    // Apply maxMatches
    if let Some(max) = config
        .and_then(|c| c.get("maxMatches"))
        .and_then(Value::as_u64)
    {
        let max = max as usize;
        while matched.len() > max {
            let mut excess = matched.pop().unwrap();
            excess.reason = Some("max-exceeded".to_string());
            eliminated.push(excess);
        }
    }

    // Check minMatches
    if let Some(min) = config
        .and_then(|c| c.get("minMatches"))
        .and_then(Value::as_u64)
    {
        if (matched.len() as u64) < min {
            warnings.push("below-minimum".to_string());
        }
    }

    PhaseResult {
        id: phase_id.to_string(),
        status: "evaluated".to_string(),
        strategy: strategy.to_string(),
        matched,
        eliminated,
        warnings,
    }
}

/// §5.3 score-threshold: evaluate scores, compare to thresholds.
fn eval_score_threshold(
    phase_id: &str,
    strategy: &str,
    routes: &[&Value],
    env: &FormspecEnvironment,
    config: Option<&Value>,
) -> PhaseResult {
    let normalize = config
        .and_then(|c| c.get("normalize"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let top_n = config
        .and_then(|c| c.get("topN"))
        .and_then(Value::as_u64)
        .map(|n| n as usize);

    // Pass 1: evaluate all score expressions
    struct ScoredRoute<'a> {
        route: &'a Value,
        raw_score: Option<f64>,
        threshold: f64,
        expression_error: bool,
    }

    let mut scored: Vec<ScoredRoute> = routes
        .iter()
        .map(|route| {
            let score_expr = route.get("score").and_then(Value::as_str).unwrap_or("0");
            let threshold = route
                .get("threshold")
                .and_then(Value::as_f64)
                .unwrap_or(0.0);
            let score_eval = eval_screener_numeric(score_expr, env);

            ScoredRoute {
                route,
                raw_score: score_eval.value,
                threshold,
                expression_error: score_eval.expression_error,
            }
        })
        .collect();

    // Pass 2: normalize if requested
    if normalize {
        let max_score = scored
            .iter()
            .filter_map(|s| s.raw_score)
            .fold(f64::NEG_INFINITY, f64::max);

        if max_score > 0.0 {
            for s in &mut scored {
                if let Some(ref mut score) = s.raw_score {
                    *score /= max_score;
                }
            }
        } else {
            // max is 0 or all null → all normalized to 0
            for s in &mut scored {
                if s.raw_score.is_some() {
                    s.raw_score = Some(0.0);
                }
            }
        }
    }

    // Pass 3: compare against thresholds
    let mut matched = Vec::new();
    let mut eliminated = Vec::new();
    let mut warnings = Vec::new();

    for s in &scored {
        if s.expression_error {
            warnings.push(WARNING_FEL_EXPRESSION_ERROR.to_string());
        }
        match s.raw_score {
            None => {
                let mut result = route_to_result(s.route);
                result.reason = Some(if s.expression_error {
                    REASON_EXPRESSION_ERROR.to_string()
                } else {
                    "null-score".to_string()
                });
                eliminated.push(result);
            }
            Some(score) => {
                let mut result = route_to_result(s.route);
                result.score = Some(score);
                if score >= s.threshold {
                    matched.push(result);
                } else {
                    result.reason = Some("below-threshold".to_string());
                    eliminated.push(result);
                }
            }
        }
    }

    // Sort matched descending by score, ties by declaration order (stable sort)
    matched.sort_by(|a, b| {
        b.score
            .unwrap_or(0.0)
            .partial_cmp(&a.score.unwrap_or(0.0))
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    // Apply topN
    if let Some(n) = top_n {
        while matched.len() > n {
            let mut excess = matched.pop().unwrap();
            excess.reason = Some("max-exceeded".to_string());
            eliminated.push(excess);
        }
    }

    warnings.extend(phase_warnings_from_eliminated(&eliminated));

    PhaseResult {
        id: phase_id.to_string(),
        status: "evaluated".to_string(),
        strategy: strategy.to_string(),
        matched,
        eliminated,
        warnings,
    }
}

// ── FEL evaluation (shared with revalidate::expr) ─────────────────

const REASON_EXPRESSION_ERROR: &str = "expression-error";
const WARNING_FEL_EXPRESSION_ERROR: &str = "fel-expression-error";

struct ConditionEval {
    truthy: bool,
    expression_error: bool,
}

struct NumericEval {
    value: Option<f64>,
    expression_error: bool,
}

fn eval_screener_condition(condition: &str, env: &FormspecEnvironment) -> ConditionEval {
    let result = crate::revalidate::evaluate_shape_expression(condition, env);
    let expression_error = crate::revalidate::result_has_eval_errors(&result);
    let truthy = !expression_error && result.value.is_truthy();
    ConditionEval {
        truthy,
        expression_error,
    }
}

fn eval_screener_numeric(expr_str: &str, env: &FormspecEnvironment) -> NumericEval {
    let result = crate::revalidate::evaluate_shape_expression(expr_str, env);
    if crate::revalidate::result_has_eval_errors(&result) {
        return NumericEval {
            value: None,
            expression_error: true,
        };
    }
    if result.value.is_null() {
        return NumericEval {
            value: None,
            expression_error: false,
        };
    }
    NumericEval {
        value: result.value.as_number().and_then(|d| d.to_f64()),
        expression_error: false,
    }
}

fn elimination_reason_for_condition(eval: &ConditionEval) -> &'static str {
    if eval.expression_error {
        REASON_EXPRESSION_ERROR
    } else {
        "condition-false"
    }
}

fn phase_warnings_from_eliminated(eliminated: &[RouteResult]) -> Vec<String> {
    if eliminated
        .iter()
        .any(|r| r.reason.as_deref() == Some(REASON_EXPRESSION_ERROR))
    {
        vec![WARNING_FEL_EXPRESSION_ERROR.to_string()]
    } else {
        Vec::new()
    }
}

fn warning_only_phase(warnings: Vec<String>) -> Vec<PhaseResult> {
    if warnings.is_empty() {
        return Vec::new();
    }
    vec![PhaseResult {
        id: "_evaluation".to_string(),
        status: "evaluated".to_string(),
        strategy: String::new(),
        matched: Vec::new(),
        eliminated: Vec::new(),
        warnings,
    }]
}

// ── Helper functions ───────────────────────────────────────────────

/// Build a RouteResult from a JSON route value.
fn route_to_result(route: &Value) -> RouteResult {
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
fn build_inputs(answers: &HashMap<String, AnswerInput>) -> HashMap<String, InputEntry> {
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
fn determine_status(answers: &HashMap<String, AnswerInput>) -> String {
    // If any answered item has a non-null value, check completeness
    // "completed" if all answered items have values, "partial" otherwise
    let all_answered = answers
        .values()
        .all(|a| a.state == AnswerState::Answered || a.state == AnswerState::NotPresented);
    if all_answered {
        "completed".to_string()
    } else {
        "partial".to_string()
    }
}

/// Build validity block from screener `resultValidity` (screener-spec §9.2, SC-21).
///
/// Computes `validUntil = now + resultValidity` as RFC 3339. Returns `None`
/// when the screener declares no `resultValidity`, when `now` is not RFC 3339,
/// or when the duration string is not a parseable ISO 8601 duration —
/// surfacing a SC-21 conformance defect by absence rather than emitting a
/// schema-invalid empty `validUntil` (schema requires `format: date-time`).
fn build_validity(screener: &Value, now_str: &str) -> Option<ValidityBlock> {
    let duration_str = screener.get("resultValidity").and_then(Value::as_str)?;
    let now = DateTime::parse_from_rfc3339(now_str).ok()?;
    let duration = parse_iso8601_duration(duration_str)?;
    let valid_until = duration.add_to(now)?;
    Some(ValidityBlock {
        valid_until: valid_until.to_rfc3339(),
        result_validity: duration_str.to_string(),
    })
}

/// ISO 8601 duration components — the closed subset Screener uses.
///
/// Grammar (per ISO 8601 §4.4.4.2, restricted): `P[nY][nM][nW][nD][T[nH][nM][nS]]`.
/// At least one component must be present. Components are non-negative integers
/// (seconds may carry a single decimal fraction). Weeks combine with other
/// components (we don't enforce the "weeks-only" pure form of §4.4.4.3).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
struct Iso8601Duration {
    /// `nY` — calendar years.
    years: u32,
    /// `nM` (date section) — calendar months.
    months: u32,
    /// `nW` — weeks (7-day blocks).
    weeks: u32,
    /// `nD` — calendar days.
    days: u32,
    /// `nH` (time section) — hours.
    hours: u64,
    /// `nM` (time section) — minutes.
    minutes: u64,
    /// `nS` — seconds (integer; fractional seconds not supported).
    seconds: u64,
}

impl Iso8601Duration {
    /// Add this duration to an RFC 3339 timestamp.
    ///
    /// Calendar units (years, months) use `chrono::Months` (end-of-month clamp:
    /// 2024-02-29 + P1Y → 2025-02-28). Week/day units use `chrono::Days`
    /// (preserves offset). Time units use fixed `TimeDelta` seconds.
    /// Returns `None` on arithmetic overflow.
    fn add_to(self, dt: DateTime<FixedOffset>) -> Option<DateTime<FixedOffset>> {
        let total_months =
            u32::try_from(u64::from(self.years) * 12 + u64::from(self.months)).ok()?;
        let total_days = u64::from(self.weeks) * 7 + u64::from(self.days);
        let total_seconds = self
            .hours
            .checked_mul(3600)?
            .checked_add(self.minutes.checked_mul(60)?)?
            .checked_add(self.seconds)?;

        let mut out = dt;
        if total_months > 0 {
            out = out.checked_add_months(Months::new(total_months))?;
        }
        if total_days > 0 {
            out = out.checked_add_days(Days::new(total_days))?;
        }
        if total_seconds > 0 {
            let delta = TimeDelta::try_seconds(i64::try_from(total_seconds).ok()?)?;
            out = out.checked_add_signed(delta)?;
        }
        Some(out)
    }
}

/// Parse an ISO 8601 duration string into [`Iso8601Duration`].
///
/// Accepts the closed subset `P[nY][nM][nW][nD][T[nH][nM][nS]]` with
/// non-negative integer components. Returns `None` for any malformed input
/// (missing leading `P`, no components, unknown unit letter, lowercase units,
/// negative values, decimal points, stray characters, empty `T` section).
fn parse_iso8601_duration(s: &str) -> Option<Iso8601Duration> {
    let rest = s.strip_prefix('P')?;
    if rest.is_empty() {
        return None;
    }

    let (date_part, time_part) = match rest.split_once('T') {
        Some((d, t)) => {
            if t.is_empty() {
                return None;
            }
            (d, Some(t))
        }
        None => (rest, None),
    };

    let mut dur = Iso8601Duration::default();
    let mut any = false;

    if !date_part.is_empty() {
        let mut iter = date_part.chars().peekable();
        let mut last_unit_rank = 0u8;
        while iter.peek().is_some() {
            let (n, unit) = read_component(&mut iter)?;
            let rank = match unit {
                'Y' => 1,
                'M' => 2,
                'W' => 3,
                'D' => 4,
                _ => return None,
            };
            if rank <= last_unit_rank {
                return None;
            }
            last_unit_rank = rank;
            let n32 = u32::try_from(n).ok()?;
            match unit {
                'Y' => dur.years = n32,
                'M' => dur.months = n32,
                'W' => dur.weeks = n32,
                'D' => dur.days = n32,
                _ => unreachable!(),
            }
            any = true;
        }
    }

    if let Some(time) = time_part {
        let mut iter = time.chars().peekable();
        let mut last_unit_rank = 0u8;
        while iter.peek().is_some() {
            let (n, unit) = read_component(&mut iter)?;
            let rank = match unit {
                'H' => 1,
                'M' => 2,
                'S' => 3,
                _ => return None,
            };
            if rank <= last_unit_rank {
                return None;
            }
            last_unit_rank = rank;
            match unit {
                'H' => dur.hours = n,
                'M' => dur.minutes = n,
                'S' => dur.seconds = n,
                _ => unreachable!(),
            }
            any = true;
        }
    }

    if !any {
        return None;
    }
    Some(dur)
}

/// Read one `[digits][unit-letter]` component. Digits are non-negative integer
/// (no sign, no decimal). Unit is a single ASCII uppercase letter.
fn read_component(iter: &mut std::iter::Peekable<std::str::Chars<'_>>) -> Option<(u64, char)> {
    let mut digits = String::new();
    while let Some(&c) = iter.peek() {
        if c.is_ascii_digit() {
            digits.push(c);
            iter.next();
        } else {
            break;
        }
    }
    if digits.is_empty() {
        return None;
    }
    let n: u64 = digits.parse().ok()?;
    let unit = iter.next()?;
    if !unit.is_ascii_uppercase() {
        return None;
    }
    Some((n, unit))
}

/// Parse date from ISO datetime or date string.
fn parse_date_from_iso(s: &str) -> Option<NaiveDate> {
    if s.is_empty() {
        return None;
    }
    // Try date-only first, then datetime
    NaiveDate::parse_from_str(s, "%Y-%m-%d")
        .or_else(|_| NaiveDate::parse_from_str(&s[..10.min(s.len())], "%Y-%m-%d"))
        .ok()
}

/// Check if a date is within an availability window.
fn is_within_availability(availability: &Value, today: NaiveDate) -> bool {
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
fn make_unavailable(
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
        status: "unavailable".to_string(),
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
    use serde_json::json;

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
            det.phases[0].eliminated[0].reason.as_deref(),
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
            det.phases[0].eliminated[0].reason.as_deref(),
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
            det.phases[0].eliminated[0].reason.as_deref(),
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
            .filter(|r| r.reason.as_deref() == Some("max-exceeded"))
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
            det.phases[0].eliminated[0].reason.as_deref(),
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
            det.phases[0].eliminated[0].reason.as_deref(),
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
            det.phases[0].eliminated[0].reason.as_deref(),
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
}

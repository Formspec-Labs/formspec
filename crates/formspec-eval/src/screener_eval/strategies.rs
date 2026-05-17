//! Phase strategy implementations (first-match, fan-out, score-threshold).

use fel_core::FormspecEnvironment;
use serde_json::Value;

use crate::types::determination::{
    EliminationReason, PhaseResult, PhaseStatus, PhaseStrategy,
};

use super::condition::{
    eval_screener_condition, eval_screener_numeric, elimination_reason_for_condition,
    phase_warnings_from_eliminated,
};
use super::helpers::route_to_result;

/// §5.1 first-match: sequential, first condition=true wins.
pub(crate) fn eval_first_match(
    phase_id: &str,
    strategy: PhaseStrategy,
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
            break;
        } else {
            let mut result = route_to_result(route);
            result.reason = Some(elimination_reason_for_condition(&cond));
            eliminated.push(result);
        }
    }

    let warnings = phase_warnings_from_eliminated(&eliminated);
    PhaseResult {
        id: phase_id.to_string(),
        status: PhaseStatus::Evaluated,
        strategy,
        matched,
        eliminated,
        warnings,
    }
}

/// §5.2 fan-out: evaluate all, return all true.
pub(crate) fn eval_fan_out(
    phase_id: &str,
    strategy: PhaseStrategy,
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
            result.reason = Some(elimination_reason_for_condition(&cond));
            eliminated.push(result);
        }
    }

    warnings.extend(phase_warnings_from_eliminated(&eliminated));

    if let Some(max) = config
        .and_then(|c| c.get("maxMatches"))
        .and_then(Value::as_u64)
    {
        let max = max as usize;
        while matched.len() > max {
            let mut excess = matched.pop().unwrap();
            excess.reason = Some(EliminationReason::MaxExceeded);
            eliminated.push(excess);
        }
    }

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
        status: PhaseStatus::Evaluated,
        strategy,
        matched,
        eliminated,
        warnings,
    }
}

/// §5.3 score-threshold: evaluate scores, compare to thresholds.
pub(crate) fn eval_score_threshold(
    phase_id: &str,
    strategy: PhaseStrategy,
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
            for s in &mut scored {
                if s.raw_score.is_some() {
                    s.raw_score = Some(0.0);
                }
            }
        }
    }

    let mut matched = Vec::new();
    let mut eliminated = Vec::new();

    for s in &scored {
        match s.raw_score {
            None => {
                let mut result = route_to_result(s.route);
                result.reason = Some(if s.expression_error {
                    EliminationReason::ExpressionError
                } else {
                    EliminationReason::NullScore
                });
                eliminated.push(result);
            }
            Some(score) => {
                let mut result = route_to_result(s.route);
                result.score = Some(score);
                if score >= s.threshold {
                    matched.push(result);
                } else {
                    result.reason = Some(EliminationReason::BelowThreshold);
                    eliminated.push(result);
                }
            }
        }
    }

    matched.sort_by(|a, b| {
        b.score
            .unwrap_or(0.0)
            .partial_cmp(&a.score.unwrap_or(0.0))
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    if let Some(n) = top_n {
        while matched.len() > n {
            let mut excess = matched.pop().unwrap();
            excess.reason = Some(EliminationReason::MaxExceeded);
            eliminated.push(excess);
        }
    }

    let warnings = phase_warnings_from_eliminated(&eliminated);

    PhaseResult {
        id: phase_id.to_string(),
        status: PhaseStatus::Evaluated,
        strategy,
        matched,
        eliminated,
        warnings,
    }
}

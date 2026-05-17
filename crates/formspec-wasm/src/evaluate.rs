//! Definition batch evaluation and screener (`wasm_bindgen`).

use std::collections::HashMap;

use formspec_core::json_object_to_string_map;
use formspec_eval::{
    AnswerInput, AnswerState, EvalContext, EvalOptions, EvalTrigger, eval_host_context_from_json_map,
    evaluate, evaluate_screener_document, evaluation_result_to_json_value, parse_answer_state,
};
use serde_json::Value;
use wasm_bindgen::prelude::*;

use crate::json_host::{parse_value_str, to_json_string};

// ── Definition Evaluation ───────────────────────────────────────

/// Evaluate a Formspec definition against provided data (4-phase batch processor).
/// Returns JSON: { values, validations, nonRelevant, variables, required, readonly }
#[wasm_bindgen(js_name = "evaluateDefinition")]
pub fn evaluate_definition_wasm(
    definition_json: &str,
    data_json: &str,
    context_json: Option<String>,
) -> Result<String, JsError> {
    evaluate_definition_inner(definition_json, data_json, context_json)
        .map_err(|e| JsError::new(&e))
}

pub(crate) fn evaluate_definition_inner(
    definition_json: &str,
    data_json: &str,
    context_json: Option<String>,
) -> Result<String, String> {
    let definition: Value = parse_value_str(definition_json, "definition JSON")?;
    let data_val: Value = parse_value_str(data_json, "data JSON")?;

    let data = json_object_to_string_map(&data_val);

    let (context, trigger, instances, constraints) = match context_json {
        Some(context_json) => {
            let ctx: Value = parse_value_str(&context_json, "context JSON")?;
            let ctx_obj = ctx.as_object().ok_or("context must be a JSON object")?;
            let bundle = eval_host_context_from_json_map(ctx_obj)?;
            (
                bundle.context,
                bundle.trigger,
                bundle.instances,
                bundle.constraints,
            )
        }
        None => (
            EvalContext::default(),
            EvalTrigger::Continuous,
            HashMap::new(),
            Vec::new(),
        ),
    };

    let options = EvalOptions::default()
        .trigger(trigger)
        .extension_constraints(constraints)
        .instances(instances)
        .context(context);

    let result = evaluate(&definition, &data, &options);

    let json = evaluation_result_to_json_value(&result);
    to_json_string(&json)
}

// ── Standalone Screener Document Evaluation ────────────────────

/// Evaluate a standalone Screener Document against respondent inputs.
///
/// Returns a Determination Record JSON string (always non-null).
///
/// `context_json` is an optional JSON object with:
/// - `answerStates`: `Record<string, "answered"|"declined"|"not-presented">` — per-item states
/// - `nowIso`: ISO 8601 datetime string for availability/validity checks
#[wasm_bindgen(js_name = "evaluateScreenerDocument")]
pub fn evaluate_screener_document_wasm(
    screener_json: &str,
    answers_json: &str,
    context_json: Option<String>,
) -> Result<String, JsError> {
    evaluate_screener_document_inner(screener_json, answers_json, context_json)
        .map_err(|e| JsError::new(&e))
}

fn evaluate_screener_document_inner(
    screener_json: &str,
    answers_json: &str,
    context_json: Option<String>,
) -> Result<String, String> {
    let screener: Value = parse_value_str(screener_json, "screener JSON")?;
    let answers_val: Value = parse_value_str(answers_json, "answers JSON")?;

    let raw_answers = json_object_to_string_map(&answers_val);

    // Parse context for answerStates and nowIso
    let (answer_states, now_iso) = match &context_json {
        Some(ctx_str) => {
            let ctx: Value = parse_value_str(ctx_str, "context JSON")?;
            let states = ctx.get("answerStates").and_then(Value::as_object).cloned();
            let now = ctx.get("nowIso").and_then(Value::as_str).map(String::from);
            (states, now)
        }
        None => (None, None),
    };

    // Build HashMap<String, AnswerInput> from flat answers + optional states
    let mut answers: HashMap<String, AnswerInput> = raw_answers
        .into_iter()
        .map(|(key, value)| {
            let state = answer_states
                .as_ref()
                .and_then(|s| s.get(&key))
                .and_then(Value::as_str)
                .map(parse_answer_state)
                .unwrap_or(AnswerState::Answered);
            (key, AnswerInput { value, state })
        })
        .collect();

    // SC-01: Add declined/not-presented items that weren't in raw_answers
    if let Some(ref states) = answer_states {
        for (key, state_val) in states {
            if !answers.contains_key(key) {
                let state = state_val
                    .as_str()
                    .map(parse_answer_state)
                    .unwrap_or(AnswerState::Answered);
                answers.insert(
                    key.clone(),
                    AnswerInput {
                        value: Value::Null,
                        state,
                    },
                );
            }
        }
    }

    let record = evaluate_screener_document(&screener, &answers, now_iso.as_deref());

    serde_json::to_string(&record).map_err(|e| format!("serialization error: {e}"))
}

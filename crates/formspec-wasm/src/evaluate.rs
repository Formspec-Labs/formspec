//! Definition batch evaluation and screener (`wasm_bindgen`).

use std::collections::HashMap;

use fel_core::ExtensionFunctions;
use fel_core::exact_json::Value;
use formspec_core::json_object_to_string_map;
use formspec_eval::{
    AnswerInput, AnswerState, EvalOptions, eval_host_context_from_json_map, evaluate,
    evaluate_filed, evaluate_screener_document, evaluation_result_to_host_snapshot_json_value,
    parse_answer_state,
};
use wasm_bindgen::prelude::*;

use crate::extensions::FelExtensionHost;
use crate::json_host::{parse_json_as, to_json_string};

// ── Definition Evaluation ───────────────────────────────────────

/// Evaluate a Formspec definition against provided data (4-phase batch processor).
/// Returns the camelCase evaluation report with the browser's editing state.
///
/// `context_json.subjectType` and `context_json.subjectKeys` supply the current Response's subject.
/// `extensions` resolves Definition calls to host extension functions (Core §3.12).
#[wasm_bindgen(js_name = "evaluateDefinition")]
pub fn evaluate_definition_wasm(
    definition_json: &str,
    data_json: &str,
    context_json: Option<String>,
    extensions: Option<FelExtensionHost>,
) -> Result<String, JsError> {
    evaluate_definition_inner(
        definition_json,
        data_json,
        context_json,
        extensions.as_ref().map(|e| e as &dyn ExtensionFunctions),
    )
    .map_err(|e| JsError::new(&e))
}

pub(crate) fn evaluate_definition_inner(
    definition_json: &str,
    data_json: &str,
    context_json: Option<String>,
    extensions: Option<&dyn ExtensionFunctions>,
) -> Result<String, String> {
    evaluate_definition_json(definition_json, data_json, context_json, extensions, false)
}

/// Prepare stable Response data and its submit verdict with the supplied clock.
///
/// # Errors
///
/// Returns an error for invalid JSON, invalid context, or data that do not settle.
#[wasm_bindgen(js_name = "evaluateFiled")]
pub fn evaluate_filed_wasm(
    definition_json: &str,
    data_json: &str,
    context_json: Option<String>,
    extensions: Option<FelExtensionHost>,
) -> Result<String, JsError> {
    evaluate_definition_json(
        definition_json,
        data_json,
        context_json,
        extensions.as_ref().map(|e| e as &dyn ExtensionFunctions),
        true,
    )
    .map_err(|e| JsError::new(&e))
}

fn evaluate_definition_json(
    definition_json: &str,
    data_json: &str,
    context_json: Option<String>,
    extensions: Option<&dyn ExtensionFunctions>,
    settle: bool,
) -> Result<String, String> {
    let definition: Value = parse_json_as(definition_json, "definition JSON")?;
    let data_val: Value = parse_json_as(data_json, "data JSON")?;

    let data = json_object_to_string_map(&data_val);

    let options = match context_json {
        Some(context_json) => {
            let ctx: Value = parse_json_as(&context_json, "context JSON")?;
            let ctx_obj = ctx.as_object().ok_or("context must be a JSON object")?;
            for (name, value) in ctx_obj {
                // These inputs have their own checks in the evaluator and can return findings.
                if !matches!(name.as_str(), "subjectType" | "subjectKeys" | "instances") {
                    fel_core::exact_json::check_decimal_range(value)?;
                }
            }
            let bundle = eval_host_context_from_json_map(ctx_obj)?;
            EvalOptions {
                trigger: bundle.trigger,
                extension_constraints: bundle.constraints,
                instances: bundle.instances,
                context: bundle.context,
                extensions,
                item_text: bundle.item_text,
            }
        }
        None => EvalOptions {
            extensions,
            ..EvalOptions::default()
        },
    };

    let result = if settle {
        evaluate_filed(&definition, &data, &options).map_err(|e| e.to_string())?
    } else {
        evaluate(&definition, &data, &options)
    };

    let json = evaluation_result_to_host_snapshot_json_value(&result);
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
///
/// `extensions` resolves host extension functions (Core §3.12) in route conditions and scores.
#[wasm_bindgen(js_name = "evaluateScreenerDocument")]
pub fn evaluate_screener_document_wasm(
    screener_json: &str,
    answers_json: &str,
    context_json: Option<String>,
    extensions: Option<FelExtensionHost>,
) -> Result<String, JsError> {
    evaluate_screener_document_inner(
        screener_json,
        answers_json,
        context_json,
        extensions.as_ref().map(|e| e as &dyn ExtensionFunctions),
    )
    .map_err(|e| JsError::new(&e))
}

pub(crate) fn evaluate_screener_document_inner(
    screener_json: &str,
    answers_json: &str,
    context_json: Option<String>,
    extensions: Option<&dyn ExtensionFunctions>,
) -> Result<String, String> {
    let screener: Value = parse_json_as(screener_json, "screener JSON")?;
    let answers_val: Value = parse_json_as(answers_json, "answers JSON")?;

    let raw_answers = json_object_to_string_map(&answers_val);

    // Parse context for answerStates and nowIso
    let (answer_states, now_iso) = match &context_json {
        Some(ctx_str) => {
            let ctx: Value = parse_json_as(ctx_str, "context JSON")?;
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

    let record = evaluate_screener_document(&screener, &answers, now_iso.as_deref(), extensions)?;

    serde_json::to_string(&record).map_err(|e| format!("serialization error: {e}"))
}

/// Create a new Response from host prefill and available sources.
#[wasm_bindgen(js_name = "createResponse")]
pub fn create_response_wasm(
    definition_json: &str,
    prefill_json: &str,
    context_json: Option<String>,
    extensions: Option<FelExtensionHost>,
) -> Result<String, JsError> {
    create_inner(
        definition_json,
        prefill_json,
        None,
        context_json.as_deref(),
        extensions.as_ref().map(|e| e as &dyn ExtensionFunctions),
    )
    .map_err(|error| JsError::new(&error))
}

/// Initialize one added repeat row in its Response context.
#[wasm_bindgen(js_name = "createRepeatRow")]
pub fn create_repeat_row_wasm(
    definition_json: &str,
    data_json: &str,
    group_path: &str,
    context_json: Option<String>,
    extensions: Option<FelExtensionHost>,
) -> Result<String, JsError> {
    create_inner(
        definition_json,
        data_json,
        Some(group_path),
        context_json.as_deref(),
        extensions.as_ref().map(|e| e as &dyn ExtensionFunctions),
    )
    .map_err(|error| JsError::new(&error))
}

fn create_inner(
    definition_json: &str,
    data_json: &str,
    group_path: Option<&str>,
    context_json: Option<&str>,
    extensions: Option<&dyn ExtensionFunctions>,
) -> Result<String, String> {
    let definition: Value = parse_json_as(definition_json, "definition JSON")?;
    let data: Value = parse_json_as(data_json, "response data JSON")?;
    if !data.is_object() {
        return Err("response data must be a JSON object".into());
    }
    let context: Value = parse_json_as(context_json.unwrap_or("{}"), "creation context JSON")?;
    let context = context
        .as_object()
        .ok_or("creation context must be a JSON object")?;
    let bundle = eval_host_context_from_json_map(context)?;
    let strings = |key: &str| {
        context.get(key).and_then(Value::as_array).map(|values| {
            values
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
    };
    let options = formspec_eval::CreateOptions {
        instances: bundle.instances,
        pending_instances: strings("pendingInstances").unwrap_or_default(),
        pending_paths: strings("pendingPaths"),
        now_iso: bundle.context.now_iso,
        subject: bundle.context.subject,
        extensions,
    };
    let created = match group_path {
        Some(group_path) => {
            formspec_eval::create_repeat_row(&definition, data, group_path, &options)
        }
        None => Some(formspec_eval::create_response(&definition, data, &options)),
    };
    to_json_string(&created)
}

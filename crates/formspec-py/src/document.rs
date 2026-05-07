//! Document type detection, linting, definition evaluation, and screener bindings.

use std::collections::HashMap;

use pyo3::prelude::*;
use pyo3::types::PyList;
use serde_json::Value;

use formspec_core::{
    JsonWireStyle, apply_migrations_to_response_data as apply_migrations_to_response_data_core,
    coerce_field_value as coerce_field_value_core, detect_document_type,
    resolve_option_sets_on_definition as resolve_option_sets_on_definition_core,
};
use formspec_eval::{
    AnswerInput, AnswerState, EvalContext, eval_context_from_json_object,
    evaluate_definition_full_with_instances_and_context, evaluate_screener_document,
    evaluation_result_to_json_value_styled, extension_constraints_from_registry_documents,
};
use formspec_lint::{LintMode, LintOptions, lint_result_to_json_value, lint_with_options};

use crate::PyObject;
use crate::convert::{
    depythonize_json, json_object_to_string_map, json_to_python, normalize_wire_json_for_python,
};

// ── Document Type Detection ─────────────────────────────────────

/// Detect the Formspec document type from a JSON string.
///
/// Returns the document type string or None.
#[pyfunction]
pub fn detect_type(document: &Bound<'_, PyAny>) -> PyResult<Option<String>> {
    let doc: Value = depythonize_json(document)?;
    Ok(detect_document_type(&doc).map(|dt| dt.schema_key().to_string()))
}

// ── Linting ─────────────────────────────────────────────────────

/// Lint a Formspec document (7-pass static analysis).
///
/// Args:
///     document: Python dict of the Formspec document
///     mode: Optional lint mode — "authoring", "strict", or "runtime" (default)
///     registry_documents: Optional list of registry document dicts for extension resolution
///     definition_document: Optional definition document dict for cross-artifact validation
///     schema_only: When true, run only schema-level validation (skip semantic passes)
///     no_fel: When true, skip FEL expression passes
///
/// Returns:
///     A dict with: document_type, valid, diagnostics (list of dicts)
#[pyfunction(signature = (document, mode=None, registry_documents=None, definition_document=None, schema_only=None, no_fel=None))]
pub fn lint_document(
    py: Python,
    document: &Bound<'_, PyAny>,
    mode: Option<&str>,
    registry_documents: Option<&Bound<'_, PyList>>,
    definition_document: Option<&Bound<'_, PyAny>>,
    schema_only: Option<bool>,
    no_fel: Option<bool>,
) -> PyResult<PyObject> {
    let doc: Value = depythonize_json(document)?;

    let lint_mode = LintMode::from_host_option_str(mode);

    let registry_docs: Vec<Value> = match registry_documents {
        Some(list) => {
            let mut docs = Vec::new();
            for item in list.iter() {
                docs.push(depythonize_json(&item)?);
            }
            docs
        }
        None => Vec::new(),
    };

    let def_doc: Option<Value> = match definition_document {
        Some(d) => Some(depythonize_json(d)?),
        None => None,
    };

    let options = LintOptions {
        mode: lint_mode,
        registry_documents: registry_docs,
        definition_document: def_doc,
        schema_only: schema_only.unwrap_or(false),
        no_fel: no_fel.unwrap_or(false),
    };

    let result = lint_with_options(&doc, &options);
    let json = lint_result_to_json_value(&result, JsonWireStyle::PythonSnake);
    json_to_python(py, &json)
}

// ── Evaluation ──────────────────────────────────────────────────

/// Evaluate a Formspec definition against provided data.
///
/// Args:
///     definition: Python dict of the definition
///     data: Python dict of field values
///     trigger: Optional shape timing mode ("continuous", "submit", "disabled")
///     registry_documents: Optional list of registry document dicts
///     instances: Optional dict of named instance payloads
///     context: Optional dict with now_iso / previous_validations / repeat_counts (snake or camel keys)
///
/// Returns:
///     A dict with: values, validations, nonRelevant, variables, required, readonly (camelCase validation fields).
#[pyfunction(signature = (definition, data, trigger=None, registry_documents=None, instances=None, context=None))]
pub fn evaluate_def(
    py: Python,
    definition: &Bound<'_, PyAny>,
    data: &Bound<'_, PyAny>,
    trigger: Option<&str>,
    registry_documents: Option<&Bound<'_, PyList>>,
    instances: Option<&Bound<'_, PyAny>>,
    context: Option<&Bound<'_, PyAny>>,
) -> PyResult<PyObject> {
    let definition: Value = depythonize_json(definition)?;
    let data_val: Value = depythonize_json(data)?;

    let data = json_object_to_string_map(&data_val);

    let eval_trigger = formspec_eval::EvalTrigger::from_python_eval_def_option(trigger);

    let constraints = match registry_documents {
        Some(docs) => {
            let mut raw = Vec::new();
            for item in docs.iter() {
                raw.push(depythonize_json(&item)?);
            }
            extension_constraints_from_registry_documents(&raw)
        }
        None => Vec::new(),
    };

    let instances_map: HashMap<String, Value> = match instances {
        Some(inst) => json_object_to_string_map(&depythonize_json(inst)?),
        None => HashMap::new(),
    };

    let eval_context = match context {
        None => EvalContext::default(),
        Some(ctx_any) => {
            let ctx_val: Value = depythonize_json(ctx_any)?;
            let map = ctx_val
                .as_object()
                .ok_or_else(|| pyo3::exceptions::PyTypeError::new_err("context must be a dict"))?;
            eval_context_from_json_object(map)
                .map_err(|e| pyo3::exceptions::PyValueError::new_err(e))?
        }
    };

    let result = evaluate_definition_full_with_instances_and_context(
        &definition,
        &data,
        eval_trigger,
        &constraints,
        &instances_map,
        &eval_context,
    );

    // Match TypeScript/WASM and Python tests: validation results use constraintKind / shapeId (see schemas).
    let json = evaluation_result_to_json_value_styled(&result, JsonWireStyle::JsCamel);
    let normalized = normalize_wire_json_for_python(&json);
    json_to_python(py, &normalized)
}

// ── Field coercion ──────────────────────────────────────────────

/// Coerce an inbound field value (whitespace, numeric strings, money, precision).
///
/// Args:
///     item: Field item dict (at least `dataType`, optional `currency`)
///     definition: Definition dict (`formPresentation.defaultCurrency` for money)
///     value: Raw inbound value
///     bind: Optional bind dict (`whitespace`, `precision`)
#[pyfunction(signature = (item, definition, value, bind=None))]
pub fn coerce_field_value(
    py: Python,
    item: &Bound<'_, PyAny>,
    definition: &Bound<'_, PyAny>,
    value: &Bound<'_, PyAny>,
    bind: Option<&Bound<'_, PyAny>>,
) -> PyResult<PyObject> {
    let item_v: Value = depythonize_json(item)?;
    let def_v: Value = depythonize_json(definition)?;
    let val_v: Value = depythonize_json(value)?;
    let bind_v = match bind {
        None => None,
        Some(b) => {
            let v: Value = depythonize_json(b)?;
            if v.is_null() { None } else { Some(v) }
        }
    };
    let out = coerce_field_value_core(&item_v, bind_v.as_ref(), &def_v, val_v);
    json_to_python(py, &out)
}

/// Inline `optionSet` references from `optionSets` on a definition dict (mutates a copy).
#[pyfunction]
pub fn resolve_option_sets_on_definition(
    py: Python,
    definition: &Bound<'_, PyAny>,
) -> PyResult<PyObject> {
    let mut v: Value = depythonize_json(definition)?;
    resolve_option_sets_on_definition_core(&mut v);
    json_to_python(py, &v)
}

/// Apply definition `migrations` to flat response field data (FEL `transform` in Rust).
#[pyfunction]
pub fn apply_migrations_to_response_data(
    py: Python,
    definition: &Bound<'_, PyAny>,
    data: &Bound<'_, PyAny>,
    from_version: &str,
    now_iso: &str,
) -> PyResult<PyObject> {
    let def_v: Value = depythonize_json(definition)?;
    let data_v: Value = depythonize_json(data)?;
    let out = apply_migrations_to_response_data_core(&def_v, data_v, from_version, now_iso);
    json_to_python(py, &out)
}

// ── Standalone Screener Document Evaluation ────────────────────

/// Evaluate a standalone Screener Document against respondent inputs.
///
/// Args:
///     screener: Python dict of the Screener Document
///     answers: Python dict of screener answers (key → value)
///     context: Optional Python dict with `answerStates` and `nowIso`
///
/// Returns:
///     A dict representing the Determination Record (always non-None).
#[pyfunction(signature = (screener, answers, context=None))]
pub fn evaluate_screener_document_py(
    py: Python,
    screener: &Bound<'_, PyAny>,
    answers: &Bound<'_, PyAny>,
    context: Option<&Bound<'_, PyAny>>,
) -> PyResult<PyObject> {
    let screener_val: Value = depythonize_json(screener)?;
    let raw_answers = json_object_to_string_map(&depythonize_json(answers)?);

    // Parse context for answerStates and nowIso
    let (answer_states, now_iso) = match context {
        Some(ctx) => {
            let ctx_val: Value = depythonize_json(ctx)?;
            let states = ctx_val
                .get("answerStates")
                .and_then(Value::as_object)
                .cloned();
            let now = ctx_val
                .get("nowIso")
                .and_then(Value::as_str)
                .map(String::from);
            (states, now)
        }
        None => (None, None),
    };

    // Build HashMap<String, AnswerInput>
    let mut answer_inputs: HashMap<String, AnswerInput> = raw_answers
        .into_iter()
        .map(|(key, value)| {
            let state = answer_states
                .as_ref()
                .and_then(|s| s.get(&key))
                .and_then(Value::as_str)
                .map(|s| match s {
                    "declined" => AnswerState::Declined,
                    "not-presented" => AnswerState::NotPresented,
                    _ => AnswerState::Answered,
                })
                .unwrap_or(AnswerState::Answered);
            (key, AnswerInput { value, state })
        })
        .collect();

    // SC-01: Add declined/not-presented items that weren't in raw_answers
    if let Some(ref states) = answer_states {
        for (key, state_val) in states {
            if !answer_inputs.contains_key(key) {
                let state = state_val
                    .as_str()
                    .map(|s| match s {
                        "declined" => AnswerState::Declined,
                        "not-presented" => AnswerState::NotPresented,
                        _ => AnswerState::Answered,
                    })
                    .unwrap_or(AnswerState::Answered);
                answer_inputs.insert(
                    key.clone(),
                    AnswerInput {
                        value: Value::Null,
                        state,
                    },
                );
            }
        }
    }

    let record = evaluate_screener_document(&screener_val, &answer_inputs, now_iso.as_deref());
    let json = serde_json::to_value(&record)
        .map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(format!("serialization: {e}")))?;
    json_to_python(py, &json)
}

//! JSON helpers for definition evaluation and WASM eval context parsing.
//!
//! Private `parse_*` helpers deserialize host maps into [`EvalHostContextBundle`] fields.
#![allow(clippy::missing_docs_in_private_items)]

use std::collections::HashMap;

use fel_core::{
    Value as FelValue,
    exact_json::{Map, Value, native_json as json},
};

use formspec_core::JsonWireStyle;
use formspec_core::json_object_to_string_map;
use formspec_core::wire_keys::{evaluation_batch_keys, evaluation_undeclared_data_paths_key};

use crate::extension_constraints_from_registry_documents;
use crate::resolved_options::ResolvedOptionLists;
use crate::types::{
    EvalContext, EvalDiagnostic, EvalSubject, EvalTrigger, EvaluationResult, ExtensionConstraint,
    ItemText, ItemTextRequest, ValidationResult,
};

/// Serialize the batch evaluation report with camelCase keys.
pub fn evaluation_result_to_json_value(result: &EvaluationResult) -> Value {
    evaluation_result_to_json_value_styled(result, JsonWireStyle::JsCamel)
}

/// Serialize the batch evaluation report in the requested wire style.
pub fn evaluation_result_to_json_value_styled(
    result: &EvaluationResult,
    style: JsonWireStyle,
) -> Value {
    Value::Object(evaluation_report(result, style))
}

/// Serialize the browser's editing snapshot alongside the camelCase evaluation report.
///
/// The snapshot can contain draft answers excluded from the filed Response.
pub fn evaluation_result_to_host_snapshot_json_value(result: &EvaluationResult) -> Value {
    let mut root = evaluation_report(result, JsonWireStyle::JsCamel);
    // Editing expressions see the settled values before filing removes or
    // nulls non-relevant fields. Send only the entries that differ.
    let preserved = result
        .host_values
        .iter()
        .filter(|(path, value)| result.values.get(*path) != Some(*value))
        .map(|(path, value)| (path.clone(), value.clone()))
        .collect();
    root.insert("preservedValues".into(), Value::Object(preserved));
    let filing_only: Vec<_> = result
        .values
        .keys()
        .filter(|path| !result.host_values.contains_key(*path))
        .collect();
    root.insert("filingOnlyPaths".into(), json!(filing_only));
    root.insert("invalidPaths".into(), json!(result.invalid_paths));
    root.insert("repeatCounts".into(), json!(result.row_counts));
    root.insert("calculatedPaths".into(), json!(result.calculated_paths));
    if !result.held_non_relevant_values.is_empty() {
        root.insert(
            "heldNonRelevantValues".into(),
            fel_core::exact_json::to_value(&result.held_non_relevant_values)
                .expect("held non-relevant values serialize"),
        );
    }
    if !result.indexed_binds.is_empty() {
        root.insert(
            "indexedBinds".into(),
            Value::Object(result.indexed_binds.clone()),
        );
    }
    root.insert(
        "scopedVariables".into(),
        Value::Object(
            result
                .scoped_variables
                .iter()
                .map(|(scope, names)| {
                    let names = names
                        .iter()
                        .map(|(key, value)| (key.clone(), crate::fel_json::variable_to_wire(value)))
                        .collect();
                    (scope.clone(), Value::Object(names))
                })
                .collect(),
        ),
    );
    Value::Object(root)
}

fn evaluation_report(result: &EvaluationResult, style: JsonWireStyle) -> Map<String, Value> {
    let (nr_key, ck_key, sid_key) = evaluation_batch_keys(style);
    let undeclared_key = evaluation_undeclared_data_paths_key(style);

    let validations: Vec<Value> = result
        .validations
        .iter()
        .map(|v| validation_result_to_json_object(v, ck_key, sid_key))
        .collect();

    let mut root = Map::new();
    root.insert("refused".into(), Value::Bool(result.refused));
    root.insert(
        "values".into(),
        fel_core::exact_json::to_value(&result.values).expect("evaluation values serialize"),
    );
    root.insert("data".into(), result.data.clone());
    if !result.undeclared_data_paths.is_empty() {
        root.insert(undeclared_key.into(), json!(result.undeclared_data_paths));
    }
    if !result.explanation_actions.is_empty() {
        root.insert(
            "explanationFindings".into(),
            Value::Array(result.explanation_actions.clone()),
        );
    }
    if let Some(entries) = &result.candidate_explanations {
        root.insert(
            "candidateExplanations".into(),
            Value::Array(entries.clone()),
        );
    }
    root.insert("validations".into(), Value::Array(validations));
    root.insert(
        "diagnostics".into(),
        Value::Array(
            result
                .diagnostics
                .iter()
                .map(|d| eval_diagnostic_to_json_object(d, sid_key))
                .collect(),
        ),
    );
    root.insert(nr_key.into(), json!(result.non_relevant));
    root.insert(
        "variables".into(),
        fel_core::exact_json::to_value(&result.variables).expect("variables serialize"),
    );
    root.insert("required".into(), json!(result.required));
    root.insert("readonly".into(), json!(result.readonly));
    if let Some(item_text) = &result.item_text {
        root.insert(
            "itemText".into(),
            Value::Object(
                item_text
                    .iter()
                    .map(|(path, text)| (path.clone(), item_text_to_json_object(text)))
                    .collect(),
            ),
        );
    }
    root
}

/// `{ label, labels?, description?, descriptions?, hint?, hints? }`: absent properties are omitted.
fn item_text_to_json_object(text: &ItemText) -> Value {
    let mut m = Map::new();
    m.insert("label".into(), json!(text.label));
    if !text.labels.is_empty() {
        m.insert("labels".into(), json!(text.labels));
    }
    if let Some(description) = &text.description {
        m.insert("description".into(), json!(description));
    }
    if !text.descriptions.is_empty() {
        m.insert("descriptions".into(), json!(text.descriptions));
    }
    if let Some(hint) = &text.hint {
        m.insert("hint".into(), json!(hint));
    }
    if !text.hints.is_empty() {
        m.insert("hints".into(), json!(text.hints));
    }
    Value::Object(m)
}

fn validation_result_to_json_object(
    v: &ValidationResult,
    constraint_kind_key: &str,
    shape_id_key: &str,
) -> Value {
    let mut m = Map::new();
    m.insert("path".into(), json!(v.path));
    m.insert("severity".into(), json!(v.severity.as_wire_str()));
    m.insert(
        constraint_kind_key.into(),
        json!(v.constraint_kind.as_wire_str()),
    );
    m.insert("code".into(), json!(v.code.as_wire_str()));
    m.insert("message".into(), json!(v.message));
    if let Some(source) = v.source {
        m.insert("source".into(), json!(source.as_wire_str()));
    }
    if let Some(ref c) = v.constraint {
        m.insert("constraint".into(), json!(c));
    }
    if let Some(ref sid) = v.shape_id {
        m.insert(shape_id_key.into(), json!(sid));
    }
    if let Some(ref ctx) = v.context {
        m.insert(
            "context".into(),
            fel_core::exact_json::to_value(ctx).expect("shape context serializes"),
        );
    }
    Value::Object(m)
}

fn eval_diagnostic_to_json_object(d: &EvalDiagnostic, shape_id_key: &str) -> Value {
    let mut m = Map::new();
    m.insert("path".into(), json!(d.path));
    m.insert("expression".into(), json!(d.expression));
    if let Some(code) = &d.code {
        m.insert("code".into(), json!(code));
    }
    m.insert("message".into(), json!(d.message));
    if let Some(ref sid) = d.shape_id {
        m.insert(shape_id_key.into(), json!(sid));
    }
    Value::Object(m)
}

/// Parsed WASM / JSON evaluation context bundle.
pub struct EvalHostContextBundle {
    /// Clock, explanations, subject, and prior non-relevant paths.
    pub context: EvalContext,
    /// Shape-rule timing for this batch (`submit` / `continuous` / …).
    pub trigger: EvalTrigger,
    /// Named instance payloads merged into the FEL environment.
    pub instances: HashMap<String, Value>,
    /// Extension constraints derived from optional registry documents in the context object.
    pub constraints: Vec<ExtensionConstraint>,
    /// Host-supplied resolved option lists for remote `optionSets` and URI-string `Item.options`.
    pub resolved_option_lists: ResolvedOptionLists,
    /// Item text request from `itemText: { localeStrings? }`, when present.
    pub item_text: Option<ItemTextRequest>,
}

/// Parse the optional JSON context object passed to `evaluateDefinition` from JavaScript.
pub fn eval_host_context_from_json_map(
    ctx_obj: &Map<String, Value>,
) -> Result<EvalHostContextBundle, String> {
    Ok(EvalHostContextBundle {
        context: parse_eval_context(ctx_obj)?,
        trigger: parse_eval_trigger(ctx_obj)?,
        instances: parse_instances(ctx_obj),
        constraints: parse_registry_documents(ctx_obj),
        resolved_option_lists: resolved_option_lists_from_json_object(ctx_obj)?,
        item_text: item_text_request_from_json_object(ctx_obj),
    })
}

/// Parse optional `resolvedOptions` / `resolved_options` from a host context JSON object.
///
/// Returns an empty [`ResolvedOptionLists`] when the key is omitted or null.
///
/// # Errors
///
/// Returns an error if the value is present and malformed.
pub fn resolved_option_lists_from_json_object(
    ctx_obj: &Map<String, Value>,
) -> Result<ResolvedOptionLists, String> {
    let Some(raw) = ctx_obj
        .get("resolvedOptions")
        .or_else(|| ctx_obj.get("resolved_options"))
        .filter(|value| !value.is_null())
    else {
        return Ok(ResolvedOptionLists::default());
    };
    ResolvedOptionLists::from_json_value(raw)
}

/// The Item text request in a host context object: `itemText: { localeStrings? }` (Core §4.2.1).
///
/// `None` when the object has no `itemText` key — the evaluation skips the text pass.
pub fn item_text_request_from_json_object(ctx_obj: &Map<String, Value>) -> Option<ItemTextRequest> {
    let request = ctx_obj
        .get("itemText")
        .or_else(|| ctx_obj.get("item_text"))?
        .as_object()?;
    let locale_strings = request
        .get("localeStrings")
        .or_else(|| request.get("locale_strings"))
        .and_then(Value::as_object)
        .map(|strings| {
            strings
                .iter()
                .filter_map(|(key, value)| Some((key.clone(), value.as_str()?.to_string())))
                .collect()
        })
        .unwrap_or_default();
    Some(ItemTextRequest { locale_strings })
}

fn parse_eval_context(ctx_obj: &Map<String, Value>) -> Result<EvalContext, String> {
    let previous_non_relevant = ctx_obj
        .get("previousNonRelevant")
        .or_else(|| ctx_obj.get("previous_non_relevant"))
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect()
        });

    let subject_type = ctx_obj.get("subjectType");
    let keys = subject_keys_from_json_object(ctx_obj)?;
    let subject = if subject_type.is_some() || keys.is_some() {
        Some(EvalSubject {
            subject_type: subject_type.and_then(Value::as_str).map(str::to_owned),
            keys,
        })
    } else {
        None
    };

    Ok(EvalContext {
        explanations: match ctx_obj.get("explanations") {
            None => Vec::new(),
            Some(value) => value
                .as_array()
                .ok_or("explanations must be an array")?
                .clone(),
        },
        subject,
        now_iso: ctx_obj
            .get("nowIso")
            .or_else(|| ctx_obj.get("now_iso"))
            .and_then(|v| v.as_str())
            .map(str::to_string),
        previous_non_relevant,
    })
}

/// Decode the host's `Response.subject.keys` for validation at evaluation time.
///
/// # Errors
/// Returns an error if the key set is present and is not an object.
pub(crate) fn subject_keys_from_json_object(
    context: &Map<String, Value>,
) -> Result<Option<HashMap<String, FelValue>>, String> {
    let Some(keys) = context.get("subjectKeys") else {
        return Ok(None);
    };
    let keys = keys
        .as_object()
        .ok_or("subjectKeys must be a JSON object")?;
    Ok(Some(decode_subject_keys(keys)))
}

impl EvalSubject {
    /// Bind a stored Response's subject for a Definition recheck.
    ///
    /// A missing declared subject enters the evaluator's ordinary subject-type check.
    pub fn for_response(definition: &Value, subject: Option<&Value>) -> Option<Self> {
        subject
            .map(Self::from_response_subject)
            .or_else(|| definition.get("subject").map(|_| Self::default()))
    }

    /// Read the filed subject without converting numeric keys through floating point.
    fn from_response_subject(subject: &Value) -> Self {
        Self {
            subject_type: subject
                .get("type")
                .and_then(Value::as_str)
                .map(str::to_owned),
            keys: subject
                .get("keys")
                .and_then(Value::as_object)
                .map(decode_subject_keys),
        }
    }
}

fn decode_subject_keys(keys: &Map<String, Value>) -> HashMap<String, FelValue> {
    keys.iter()
        .map(|(name, value)| {
            // Keep exact numbers for the shared subject-key range check. Preserve invalid
            // keys as null values so they take part in the same sorted validation order.
            let value = match value {
                Value::String(value) => FelValue::String(value.clone()),
                Value::Number(number) => {
                    number.as_decimal().map_or(FelValue::Null, FelValue::Number)
                }
                _ => FelValue::Null,
            };
            (name.clone(), value)
        })
        .collect()
}

/// Parses [`EvalContext`] fields from a host JSON object (clock, prior validations, …).
///
/// Trigger, `instances`, and registry documents are not read; use [`eval_host_context_from_json_map`] for the full bundle.
pub fn eval_context_from_json_object(ctx_obj: &Map<String, Value>) -> Result<EvalContext, String> {
    parse_eval_context(ctx_obj)
}

fn parse_eval_trigger(ctx_obj: &Map<String, Value>) -> Result<EvalTrigger, String> {
    let trigger = ctx_obj
        .get("trigger")
        .or_else(|| ctx_obj.get("evalTrigger"))
        .or_else(|| ctx_obj.get("eval_trigger"))
        .and_then(|value| value.as_str())
        .unwrap_or("continuous");

    match trigger {
        "continuous" => Ok(EvalTrigger::Continuous),
        "submit" => Ok(EvalTrigger::Submit),
        "demand" => Ok(EvalTrigger::Demand),
        "disabled" => Ok(EvalTrigger::Disabled),
        _ => Err(format!("invalid eval trigger: {trigger}")),
    }
}

fn parse_instances(ctx_obj: &Map<String, Value>) -> HashMap<String, Value> {
    ctx_obj
        .get("instances")
        .map(json_object_to_string_map)
        .unwrap_or_default()
}

fn parse_registry_documents(ctx_obj: &Map<String, Value>) -> Vec<ExtensionConstraint> {
    let Some(docs) = ctx_obj
        .get("registryDocuments")
        .or_else(|| ctx_obj.get("registry_documents"))
        .and_then(|v| v.as_array())
    else {
        return Vec::new();
    };
    extension_constraints_from_registry_documents(docs)
}

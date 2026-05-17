//! JSON helpers for definition evaluation and WASM eval context parsing.
//!
//! Private `parse_*` helpers deserialize host maps into [`EvalHostContextBundle`] fields.
#![allow(clippy::missing_docs_in_private_items)]

use std::collections::HashMap;

use serde_json::{Map, Value, json};

use formspec_core::JsonWireStyle;
use formspec_core::json_object_to_string_map;
use formspec_core::wire_keys::evaluation_batch_keys;

use crate::extension_constraints_from_registry_documents;
use crate::types::{
    ConstraintKind, EvalContext, EvalTrigger, EvaluationResult, ExtensionConstraint, Severity,
    ValidationCode, ValidationResult, ValidationSource,
};

/// Full batch evaluation output as JSON (matches `evaluateDefinition` WASM shape, camelCase).
pub fn evaluation_result_to_json_value(result: &EvaluationResult) -> Value {
    evaluation_result_to_json_value_styled(result, JsonWireStyle::JsCamel)
}

/// Serialize [`EvaluationResult`] for host bindings (`JsCamel` vs `PythonSnake` keys).
pub fn evaluation_result_to_json_value_styled(
    result: &EvaluationResult,
    style: JsonWireStyle,
) -> Value {
    let (nr_key, ck_key, sid_key) = evaluation_batch_keys(style);

    let validations: Vec<Value> = result
        .validations
        .iter()
        .map(|v| validation_result_to_json_object(v, ck_key, sid_key))
        .collect();

    let mut root = Map::new();
    root.insert("values".into(), json!(result.values));
    root.insert("validations".into(), Value::Array(validations));
    root.insert(nr_key.into(), json!(result.non_relevant));
    root.insert("variables".into(), json!(result.variables));
    root.insert("required".into(), json!(result.required));
    root.insert("readonly".into(), json!(result.readonly));
    Value::Object(root)
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
    m.insert("source".into(), json!(v.source.as_wire_str()));
    if let Some(ref c) = v.constraint {
        m.insert("constraint".into(), json!(c));
    }
    if let Some(ref sid) = v.shape_id {
        m.insert(shape_id_key.into(), json!(sid));
    }
    if let Some(ref ctx) = v.context {
        m.insert("context".into(), json!(ctx));
    }
    Value::Object(m)
}

/// Parsed WASM / JSON evaluation context bundle.
pub struct EvalHostContextBundle {
    /// Clock, prior validations, and prior non-relevant paths.
    pub context: EvalContext,
    /// Shape-rule timing for this batch (`submit` / `continuous` / …).
    pub trigger: EvalTrigger,
    /// Named instance payloads merged into the FEL environment.
    pub instances: HashMap<String, Value>,
    /// Extension constraints derived from optional registry documents in the context object.
    pub constraints: Vec<ExtensionConstraint>,
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
    })
}

fn parse_eval_context(ctx_obj: &Map<String, Value>) -> Result<EvalContext, String> {
    let previous_validations = ctx_obj
        .get("previousValidations")
        .or_else(|| ctx_obj.get("previous_validations"))
        .map(parse_validation_results)
        .transpose()?;

    let previous_non_relevant = ctx_obj
        .get("previousNonRelevant")
        .or_else(|| ctx_obj.get("previous_non_relevant"))
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect()
        });

    Ok(EvalContext {
        now_iso: ctx_obj
            .get("nowIso")
            .or_else(|| ctx_obj.get("now_iso"))
            .and_then(|v| v.as_str())
            .map(str::to_string),
        previous_validations,
        previous_non_relevant,
        repeat_counts: parse_repeat_counts(ctx_obj),
    })
}

/// Parses [`EvalContext`] fields from a host JSON object (clock, prior validations, `repeatCounts`, …).
///
/// Trigger, `instances`, and registry documents are not read; use [`eval_host_context_from_json_map`] for the full bundle.
pub fn eval_context_from_json_object(ctx_obj: &Map<String, Value>) -> Result<EvalContext, String> {
    parse_eval_context(ctx_obj)
}

fn parse_repeat_counts(ctx_obj: &Map<String, Value>) -> Option<HashMap<String, u64>> {
    let obj = ctx_obj
        .get("repeatCounts")
        .or_else(|| ctx_obj.get("repeat_counts"))
        .and_then(|v| v.as_object())?;
    let mut out = HashMap::new();
    for (k, v) in obj.iter() {
        if let Some(n) = v
            .as_u64()
            .or_else(|| v.as_i64().filter(|&i| i >= 0).map(|i| i as u64))
        {
            out.insert(k.clone(), n);
        }
    }
    Some(out)
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

fn parse_validation_results(value: &Value) -> Result<Vec<ValidationResult>, String> {
    let validations = value
        .as_array()
        .ok_or("previousValidations must be an array")?;

    validations
        .iter()
        .map(parse_validation_result)
        .collect::<Result<Vec<_>, _>>()
}

fn parse_validation_result(value: &Value) -> Result<ValidationResult, String> {
    let obj = value
        .as_object()
        .ok_or("validation result must be an object")?;

    let severity = required_string_field(obj, "severity")?;
    let constraint_kind =
        required_string_field_either(obj, "constraintKind", "constraint_kind")?;
    let code = required_string_field(obj, "code")?;
    let source = required_string_field(obj, "source")?;

    Ok(ValidationResult {
        path: required_string_field(obj, "path")?,
        severity: Severity::parse_wire(&severity)
            .ok_or_else(|| format!("unknown severity: {severity}"))?,
        constraint_kind: ConstraintKind::parse_wire(&constraint_kind)
            .ok_or_else(|| format!("unknown constraint_kind: {constraint_kind}"))?,
        code: ValidationCode::from_wire(&code),
        message: required_string_field(obj, "message")?,
        constraint: optional_string_field_either(obj, "constraint", "constraint"),
        source: ValidationSource::parse_wire(&source)
            .ok_or_else(|| format!("unknown source: {source}"))?,
        shape_id: optional_string_field_either(obj, "shapeId", "shape_id"),
        context: match obj.get("context") {
            Some(ctx) => {
                let ctx_obj = ctx
                    .as_object()
                    .ok_or("validation context must be an object")?;
                Some(
                    ctx_obj
                        .iter()
                        .map(|(key, value)| (key.clone(), value.clone()))
                        .collect::<HashMap<_, _>>(),
                )
            }
            None => None,
        },
    })
}

fn required_string_field(obj: &Map<String, Value>, key: &str) -> Result<String, String> {
    obj.get(key)
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| format!("validation result missing string field '{key}'"))
}

fn required_string_field_either(
    obj: &Map<String, Value>,
    primary: &str,
    secondary: &str,
) -> Result<String, String> {
    obj.get(primary)
        .or_else(|| obj.get(secondary))
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| {
            format!("validation result missing string field '{primary}' or '{secondary}'")
        })
}

fn optional_string_field_either(
    obj: &Map<String, Value>,
    primary: &str,
    secondary: &str,
) -> Option<String> {
    obj.get(primary)
        .or_else(|| obj.get(secondary))
        .and_then(Value::as_str)
        .map(str::to_string)
}

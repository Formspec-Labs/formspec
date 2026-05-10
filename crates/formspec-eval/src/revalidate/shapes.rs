//! Shape rules: single targets, wildcard expansion, composition (and/or/not/xone), context.
#![allow(clippy::missing_docs_in_private_items)]

use std::collections::{HashMap, HashSet};

use fel_core::{EvalResult, FormspecEnvironment, Value, fel_to_json};
use serde_json::Value as JsonValue;

use crate::fel_json::json_to_runtime_fel_typed;
use crate::rebuild::{
    expand_wildcard_path, instantiate_wildcard_expr, is_wildcard_bind, wildcard_base,
};
use crate::recalculate::eval_bool;
use crate::types::{ItemInfo, ValidationResult, find_item_by_path};

use super::env::{
    bind_repeat_group_arrays, bind_sibling_aliases, restore_repeat_group_arrays,
    restore_sibling_aliases,
};
use super::expr::{
    constraint_passes, evaluate_shape_expression, interpolate_message, result_has_eval_errors,
};

pub(super) fn validate_shape(
    shape: &JsonValue,
    shapes_by_id: &HashMap<String, &JsonValue>,
    env: &mut FormspecEnvironment,
    values: &HashMap<String, JsonValue>,
    items: &[ItemInfo],
    results: &mut Vec<ValidationResult>,
) {
    let target = shape.get("target").and_then(|v| v.as_str()).unwrap_or("");

    // Wildcard shape target: expand and evaluate per-instance
    if is_wildcard_bind(target) {
        validate_wildcard_shape(shape, shapes_by_id, env, values, items, results);
        return;
    }

    // §5.6 rule 1: non-relevant targets suppress shape evaluation
    if target != "#"
        && !target.is_empty()
        && let Some(item) = find_item_by_path(items, target)
        && !item.relevant
    {
        return;
    }
    let severity = shape
        .get("severity")
        .and_then(|v| v.as_str())
        .unwrap_or("error");
    let message = shape
        .get("message")
        .and_then(|v| v.as_str())
        .unwrap_or("Shape constraint failed");

    // Check activeWhen
    let saved_repeat_arrays = bind_repeat_group_arrays(env, items, values);
    let saved_aliases = if target.is_empty() || target == "#" {
        HashMap::new()
    } else {
        bind_sibling_aliases(env, values, target)
    };
    if let Some(active_when) = shape.get("activeWhen").and_then(|v| v.as_str())
        && !eval_bool(active_when, env, true)
    {
        restore_sibling_aliases(env, saved_aliases);
        restore_repeat_group_arrays(env, saved_repeat_arrays);
        return;
    }

    // Bind bare $ to target field value for shape constraint evaluation
    let prev_dollar = env.data.remove("");
    if !target.is_empty()
        && let Some(target_val) = values.get(target)
    {
        let data_type = find_item_by_path(items, target).and_then(|i| i.data_type.as_deref());
        env.data.insert(
            String::new(),
            json_to_runtime_fel_typed(target_val, data_type),
        );
    }

    let sid = shape.get("id").and_then(|v| v.as_str()).map(str::to_string);
    let scode = shape
        .get("code")
        .and_then(|v| v.as_str())
        .unwrap_or("SHAPE_FAILED");

    let mut visiting = HashSet::new();
    if !shape_passes(shape, shapes_by_id, env, &mut visiting) {
        results.push(ValidationResult {
            path: target.to_string(),
            severity: severity.to_string(),
            constraint_kind: "shape".to_string(),
            code: scode.to_string(),
            message: interpolate_message(message, env),
            constraint: shape
                .get("constraint")
                .and_then(|v| v.as_str())
                .map(str::to_string),
            source: "shape".to_string(),
            shape_id: sid.clone(),
            context: evaluate_shape_context(shape, env, None),
        });
    }

    restore_sibling_aliases(env, saved_aliases);
    restore_repeat_group_arrays(env, saved_repeat_arrays);
    // Restore previous bare $ binding
    env.data.remove("");
    if let Some(prev) = prev_dollar {
        env.data.insert(String::new(), prev);
    }
}

/// Validate a shape with a wildcard target, evaluating per concrete instance.
fn validate_wildcard_shape(
    shape: &JsonValue,
    _shapes_by_id: &HashMap<String, &JsonValue>,
    env: &mut FormspecEnvironment,
    values: &HashMap<String, JsonValue>,
    items: &[ItemInfo],
    results: &mut Vec<ValidationResult>,
) {
    let target = shape.get("target").and_then(|v| v.as_str()).unwrap_or("");
    let severity = shape
        .get("severity")
        .and_then(|v| v.as_str())
        .unwrap_or("error");
    let message = shape
        .get("message")
        .and_then(|v| v.as_str())
        .unwrap_or("Shape constraint failed");

    let base = match wildcard_base(target) {
        Some(b) => b.to_string(),
        None => return,
    };

    let concrete_paths = expand_wildcard_path(target, values);

    for concrete_path in &concrete_paths {
        // §5.6 rule 1: skip non-relevant targets
        if let Some(item) = find_item_by_path(items, concrete_path)
            && !item.relevant
        {
            continue;
        }

        // Extract the index from the concrete path to instantiate the constraint
        let index = match concrete_path.find('[') {
            Some(pos) => {
                let rest = &concrete_path[pos + 1..];
                rest.split(']')
                    .next()
                    .and_then(|s| s.parse::<usize>().ok())
                    .unwrap_or(0)
            }
            None => continue,
        };

        let saved_aliases = bind_sibling_aliases(env, values, concrete_path);

        // Build a row-scoped environment: instantiate [*] references in the constraint
        let prev_dollar = env.data.remove("");
        if let Some(val) = values.get(concrete_path.as_str()) {
            let data_type = find_item_by_path(items, concrete_path.as_str())
                .and_then(|i| i.data_type.as_deref());
            env.data
                .insert(String::new(), json_to_runtime_fel_typed(val, data_type));
        }

        let active = shape
            .get("activeWhen")
            .and_then(|v| v.as_str())
            .map(|expr| instantiate_wildcard_expr(expr, &base, index))
            .map(|expr| eval_bool(&expr, env, true))
            .unwrap_or(true);
        if !active {
            restore_sibling_aliases(env, saved_aliases);
            env.data.remove("");
            if let Some(prev) = prev_dollar {
                env.data.insert(String::new(), prev);
            }
            continue;
        }

        // Create an instantiated shape for this row
        let constraint_expr = shape
            .get("constraint")
            .and_then(|v| v.as_str())
            .map(|expr| instantiate_wildcard_expr(expr, &base, index));

        let passes = if let Some(ref expr) = constraint_expr {
            constraint_passes(&evaluate_shape_expression(expr, env))
        } else {
            true
        };

        let sid = shape.get("id").and_then(|v| v.as_str()).map(str::to_string);
        let scode = shape
            .get("code")
            .and_then(|v| v.as_str())
            .unwrap_or("SHAPE_FAILED");

        if !passes {
            results.push(ValidationResult {
                path: concrete_path.clone(),
                severity: severity.to_string(),
                constraint_kind: "shape".to_string(),
                code: scode.to_string(),
                message: interpolate_message(message, env),
                constraint: constraint_expr.clone(),
                source: "shape".to_string(),
                shape_id: sid.clone(),
                context: evaluate_shape_context(shape, env, Some((&base, index))),
            });
        }

        // Restore bare $
        restore_sibling_aliases(env, saved_aliases);
        env.data.remove("");
        if let Some(prev) = prev_dollar {
            env.data.insert(String::new(), prev);
        }
    }
}

fn evaluate_shape_context(
    shape: &JsonValue,
    env: &FormspecEnvironment,
    wildcard: Option<(&str, usize)>,
) -> Option<HashMap<String, JsonValue>> {
    let context = shape.get("context")?.as_object()?;
    let mut evaluated = HashMap::new();

    for (key, raw_expr) in context {
        let value = match raw_expr.as_str() {
            Some(expr) => {
                let expression = wildcard
                    .map(|(base, index)| instantiate_wildcard_expr(expr, base, index))
                    .unwrap_or_else(|| expr.to_string());
                fel_to_json(&evaluate_shape_expression(&expression, env).value)
            }
            None => raw_expr.clone(),
        };
        evaluated.insert(key.clone(), value);
    }

    Some(evaluated)
}

fn evaluate_composition_element(
    expr: &str,
    shapes_by_id: &HashMap<String, &JsonValue>,
    env: &FormspecEnvironment,
    visiting: &mut HashSet<String>,
) -> EvalResult {
    if let Some(shape) = shapes_by_id.get(expr) {
        return EvalResult {
            value: Value::Boolean(shape_passes(shape, shapes_by_id, env, visiting)),
            diagnostics: vec![],
        };
    }
    evaluate_shape_expression(expr, env)
}

fn shape_passes(
    shape: &JsonValue,
    shapes_by_id: &HashMap<String, &JsonValue>,
    env: &FormspecEnvironment,
    visiting: &mut HashSet<String>,
) -> bool {
    let shape_id = shape.get("id").and_then(|v| v.as_str()).map(str::to_string);

    if let Some(ref id) = shape_id
        && !visiting.insert(id.clone())
    {
        return true;
    }

    // activeWhen follows the existing batch evaluator contract: null defaults to active.
    if let Some(active_when) = shape.get("activeWhen").and_then(|v| v.as_str())
        && !eval_bool(active_when, env, true)
    {
        if let Some(id) = shape_id {
            visiting.remove(&id);
        }
        return true;
    }

    let passes = if let Some(expr) = shape.get("constraint").and_then(|v| v.as_str()) {
        constraint_passes(&evaluate_shape_expression(expr, env))
    } else {
        true
    } && shape
        .get("and")
        .and_then(|v| v.as_array())
        .map(|clauses| {
            clauses.iter().all(|clause| {
                clause
                    .as_str()
                    .map(|expr| {
                        constraint_passes(&evaluate_composition_element(
                            expr,
                            shapes_by_id,
                            env,
                            visiting,
                        ))
                    })
                    .unwrap_or(true)
            })
        })
        .unwrap_or(true)
        && shape
            .get("or")
            .and_then(|v| v.as_array())
            .map(|clauses| {
                clauses.iter().any(|clause| {
                    clause
                        .as_str()
                        .map(|expr| {
                            constraint_passes(&evaluate_composition_element(
                                expr,
                                shapes_by_id,
                                env,
                                visiting,
                            ))
                        })
                        .unwrap_or(false)
                })
            })
            .unwrap_or(true)
        && shape
            .get("not")
            .and_then(|v| v.as_str())
            .map(|expr| {
                let result = evaluate_composition_element(expr, shapes_by_id, env, visiting);
                // NOT inverts truthiness, but eval errors always propagate as failures.
                // null-clean → true (not evaluated, don't fire). true → false. false → true.
                // null-with-errors → false (broken expression).
                if result_has_eval_errors(&result) {
                    false
                } else {
                    result.value.is_null() || !result.value.is_truthy()
                }
            })
            .unwrap_or(true)
        && shape
            .get("xone")
            .and_then(|v| v.as_array())
            .map(|clauses| {
                clauses
                    .iter()
                    .filter(|clause| {
                        clause
                            .as_str()
                            .map(|expr| {
                                let result =
                                    evaluate_composition_element(expr, shapes_by_id, env, visiting);
                                // Only count as "true" if it's a clean truthy result
                                constraint_passes(&result) && !result.value.is_null()
                            })
                            .unwrap_or(false)
                    })
                    .count()
                    == 1
            })
            .unwrap_or(true);

    if let Some(id) = shape_id {
        visiting.remove(&id);
    }

    passes
}

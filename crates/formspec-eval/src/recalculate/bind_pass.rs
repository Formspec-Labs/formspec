//! Per-item bind evaluation: relevance, readonly, required, defaults, whitespace, repeat aliases.

use std::collections::{HashMap, HashSet};

use fel_core::{FormspecEnvironment, MipState, Value, evaluate, fel_to_ui_json, parse};
use serde_json::Value as JsonValue;

use super::json_fel::{coerce_calculated_value, json_to_runtime_fel};
use super::repeats::{
    apply_instance_aliases, push_repeat_context_for_instance, refresh_nested_group_aliases,
    restore_instance_aliases,
};
use super::variables::visible_variables;
use crate::types::{ItemInfo, WhitespaceMode, resolve_qualified_repeat_refs};

/// Apply whitespace normalization to all items that have a whitespace bind.
pub(crate) fn apply_whitespace_to_items(
    items: &mut [ItemInfo],
    values: &mut HashMap<String, JsonValue>,
) {
    for item in items.iter_mut() {
        if let Some(mode) = item.whitespace {
            if mode != WhitespaceMode::Preserve
                && let Some(JsonValue::String(s)) = values.get(&item.path)
            {
                let transformed = mode.apply(s);
                values.insert(item.path.clone(), JsonValue::String(transformed.clone()));
                item.value = JsonValue::String(transformed);
            }
        }
        apply_whitespace_to_items(&mut item.children, values);
    }
}

pub(crate) fn eval_bool(expr: &str, env: &FormspecEnvironment, default: bool) -> bool {
    match parse(expr) {
        Ok(parsed) => {
            let result = evaluate(&parsed, env);
            match result.value {
                Value::Boolean(b) => b,
                Value::Null => default,
                _ => default,
            }
        }
        Err(_) => default,
    }
}

/// Evaluate a single item's bind expressions with inheritance.
pub(crate) fn evaluate_single_item(
    item: &mut ItemInfo,
    env: &mut FormspecEnvironment,
    values: &mut HashMap<String, JsonValue>,
    parent_relevant: bool,
    parent_readonly: bool,
    invalid_paths: &HashSet<String>,
) {
    let normalize_expr = |expr: &str| resolve_qualified_repeat_refs(expr, &item.path);

    let was_relevant = item.prev_relevant;

    let own_relevant = if let Some(ref expr) = item.relevance {
        let normalized_expr = normalize_expr(expr);
        eval_bool(&normalized_expr, env, true)
    } else {
        true
    };
    item.relevant = own_relevant && parent_relevant;

    if item.relevant && !was_relevant {
        let current = values.get(&item.path);
        let is_empty = match current {
            None | Some(JsonValue::Null) => true,
            Some(JsonValue::String(s)) => s.is_empty(),
            _ => false,
        };
        if is_empty {
            if let Some(ref expr) = item.default_expression {
                let normalized_expr = normalize_expr(expr);
                if let Ok(parsed) = parse(&normalized_expr) {
                    let result = evaluate(&parsed, env);
                    let coerced = coerce_calculated_value(item, result.value);
                    let json_val = fel_to_ui_json(&coerced);
                    values.insert(item.path.clone(), json_val.clone());
                    env.set_field(&item.path, coerced);
                }
            } else if let Some(ref default_val) = item.default_value {
                let fel = json_to_runtime_fel(default_val);
                let coerced = coerce_calculated_value(item, fel);
                let json_val = fel_to_ui_json(&coerced);
                values.insert(item.path.clone(), json_val.clone());
                env.set_field(&item.path, coerced);
            }
        }
    }

    if !item.relevant
        && item.excluded_value == Some(crate::types::ExcludedValueMode::Null)
    {
        env.set_field(&item.path, Value::Null);
    }

    let own_readonly = if let Some(ref expr) = item.readonly_expr {
        let normalized_expr = normalize_expr(expr);
        eval_bool(&normalized_expr, env, false)
    } else {
        false
    };
    item.readonly = own_readonly || parent_readonly;

    if item.relevant {
        if let Some(ref expr) = item.required_expr {
            let normalized_expr = normalize_expr(expr);
            item.required = eval_bool(&normalized_expr, env, false);
        }
    } else {
        item.required = false;
    }

    if let Some(val) = values.get(&item.path) {
        item.value = val.clone();
    }

    if let Some(ref expr) = item.calculate {
        let normalized_expr = normalize_expr(expr);
        if let Ok(parsed) = parse(&normalized_expr) {
            let result = evaluate(&parsed, env);
            let coerced = coerce_calculated_value(item, result.value);
            let json_val = fel_to_ui_json(&coerced);
            values.insert(item.path.clone(), json_val.clone());
            item.value = json_val.clone();
            env.set_field(&item.path, coerced);
        }
    }

    env.set_mip(
        &item.path,
        MipState {
            valid: !invalid_paths.contains(&item.path),
            relevant: item.relevant,
            readonly: item.readonly,
            required: item.required,
        },
    );
}

pub(crate) fn evaluate_items_with_inheritance(
    items: &mut [ItemInfo],
    env: &mut FormspecEnvironment,
    values: &mut HashMap<String, JsonValue>,
    parent_relevant: bool,
    parent_readonly: bool,
    invalid_paths: &HashSet<String>,
) {
    for item in items.iter_mut() {
        evaluate_single_item(
            item,
            env,
            values,
            parent_relevant,
            parent_readonly,
            invalid_paths,
        );

        if item.repeatable && !item.children.is_empty() {
            evaluate_repeat_children_with_aliases(
                &mut item.children,
                env,
                values,
                item.relevant,
                item.readonly,
                None,
                invalid_paths,
            );
        } else {
            evaluate_items_with_inheritance(
                &mut item.children,
                env,
                values,
                item.relevant,
                item.readonly,
                invalid_paths,
            );
        }
    }
}

fn evaluate_repeat_children_with_aliases(
    children: &mut [ItemInfo],
    env: &mut FormspecEnvironment,
    values: &mut HashMap<String, JsonValue>,
    parent_relevant: bool,
    parent_readonly: bool,
    scoped_vars: Option<&HashMap<String, JsonValue>>,
    invalid_paths: &HashSet<String>,
) {
    let mut current_instance: Option<String> = None;
    let mut alias_names: Vec<String> = Vec::new();
    let mut nested_groups: Vec<String> = Vec::new();
    let mut saved_values: HashMap<String, Option<Value>> = HashMap::new();
    let mut repeat_context_active = false;

    for item in children.iter_mut() {
        let instance_prefix = item.parent_path.clone().unwrap_or_default();

        if current_instance.as_deref() != Some(instance_prefix.as_str()) {
            if repeat_context_active {
                env.pop_repeat();
            }
            restore_instance_aliases(env, &alias_names, &mut saved_values);
            alias_names.clear();
            nested_groups.clear();
            current_instance = Some(instance_prefix.clone());
            let (next_aliases, next_nested_groups) =
                apply_instance_aliases(&instance_prefix, env, values, &mut saved_values);
            alias_names = next_aliases;
            nested_groups = next_nested_groups;
            repeat_context_active = push_repeat_context_for_instance(&instance_prefix, env, values);
        }

        if let Some(sv) = scoped_vars {
            let visible = visible_variables(sv, &item.path);
            env.variables.clear();
            for (name, val) in &visible {
                env.set_variable(name, json_to_runtime_fel(val));
            }
        }

        evaluate_single_item(
            item,
            env,
            values,
            parent_relevant,
            parent_readonly,
            invalid_paths,
        );

        if item.calculate.is_some()
            && let Some(val) = values.get(&item.path)
        {
            env.set_field(&item.key, json_to_runtime_fel(val));
            refresh_nested_group_aliases(&instance_prefix, &nested_groups, env, values);
        }

        if item.repeatable && !item.children.is_empty() {
            evaluate_repeat_children_with_aliases(
                &mut item.children,
                env,
                values,
                item.relevant,
                item.readonly,
                scoped_vars,
                invalid_paths,
            );
        } else if let Some(sv) = scoped_vars {
            evaluate_items_with_inheritance_scoped(
                &mut item.children,
                env,
                values,
                item.relevant,
                item.readonly,
                sv,
                invalid_paths,
            );
        } else {
            evaluate_items_with_inheritance(
                &mut item.children,
                env,
                values,
                item.relevant,
                item.readonly,
                invalid_paths,
            );
        }
    }

    if repeat_context_active {
        env.pop_repeat();
    }
    restore_instance_aliases(env, &alias_names, &mut saved_values);
}

pub(crate) fn evaluate_items_with_inheritance_scoped(
    items: &mut [ItemInfo],
    env: &mut FormspecEnvironment,
    values: &mut HashMap<String, JsonValue>,
    parent_relevant: bool,
    parent_readonly: bool,
    scoped_vars: &HashMap<String, JsonValue>,
    invalid_paths: &HashSet<String>,
) {
    for item in items.iter_mut() {
        let visible = visible_variables(scoped_vars, &item.path);
        env.variables.clear();
        for (name, val) in &visible {
            env.set_variable(name, json_to_runtime_fel(val));
        }

        evaluate_single_item(
            item,
            env,
            values,
            parent_relevant,
            parent_readonly,
            invalid_paths,
        );

        if item.repeatable && !item.children.is_empty() {
            evaluate_repeat_children_with_aliases(
                &mut item.children,
                env,
                values,
                item.relevant,
                item.readonly,
                Some(scoped_vars),
                invalid_paths,
            );
        } else {
            evaluate_items_with_inheritance_scoped(
                &mut item.children,
                env,
                values,
                item.relevant,
                item.readonly,
                scoped_vars,
                invalid_paths,
            );
        }
    }
}

// ── Post-calculate required refresh ────────────────────────────────────────

/// Re-evaluate required expressions after calculated values have settled.
///
/// The initial bind pass evaluates required before calculate for each item.
/// When a required condition depends on a calculated field that appears later
/// in the tree, the required state may be stale. This function re-evaluates
/// only required expressions using the current environment (which now has
/// settled calculated values) and updates MIP state.
pub(crate) fn refresh_required_state(
    items: &mut [ItemInfo],
    env: &mut FormspecEnvironment,
    invalid_paths: &HashSet<String>,
) {
    for item in items.iter_mut() {
        if item.relevant {
            if let Some(ref expr) = item.required_expr {
                let normalized_expr = resolve_qualified_repeat_refs(expr, &item.path);
                item.required = eval_bool(&normalized_expr, env, false);
            }
        } else {
            item.required = false;
        }

        env.set_mip(
            &item.path,
            MipState {
                valid: !invalid_paths.contains(&item.path),
                relevant: item.relevant,
                readonly: item.readonly,
                required: item.required,
            },
        );

        refresh_required_state(&mut item.children, env, invalid_paths);
    }
}

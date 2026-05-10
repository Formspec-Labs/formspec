//! Fixpoint calculate passes until sibling and cross-field calculates stabilize.

use std::collections::HashMap;

use fel_core::{FormspecEnvironment, Value as EnvVal, evaluate, fel_to_ui_json, parse};
use serde_json::Value;

use super::json_fel::{coerce_calculated_value, json_to_runtime_fel};
use super::repeats::{
    apply_instance_aliases, push_repeat_context_for_instance, refresh_nested_group_aliases,
    restore_instance_aliases,
};
use super::variables::visible_variables;
use crate::types::{ItemInfo, resolve_qualified_repeat_refs};

pub(super) fn settle_calculated_values(
    items: &mut [ItemInfo],
    env: &mut FormspecEnvironment,
    values: &mut HashMap<String, Value>,
    scoped_vars: Option<&HashMap<String, Value>>,
) {
    for _ in 0..100 {
        let changed = match scoped_vars {
            Some(scoped_vars) => calculate_pass_items_scoped(items, env, values, scoped_vars),
            None => calculate_pass_items(items, env, values),
        };
        if !changed {
            break;
        }
    }
}

fn calculate_pass_items(
    items: &mut [ItemInfo],
    env: &mut FormspecEnvironment,
    values: &mut HashMap<String, Value>,
) -> bool {
    let mut changed = false;

    for item in items.iter_mut() {
        changed |= evaluate_calculate_only(item, env, values);

        if item.repeatable && !item.children.is_empty() {
            changed |=
                calculate_pass_repeat_children_with_aliases(&mut item.children, env, values, None);
        } else {
            changed |= calculate_pass_items(&mut item.children, env, values);
        }
    }

    changed
}

fn calculate_pass_items_scoped(
    items: &mut [ItemInfo],
    env: &mut FormspecEnvironment,
    values: &mut HashMap<String, Value>,
    scoped_vars: &HashMap<String, Value>,
) -> bool {
    let mut changed = false;

    for item in items.iter_mut() {
        let visible = visible_variables(scoped_vars, &item.path);
        env.variables.clear();
        for (name, val) in &visible {
            env.set_variable(name, json_to_runtime_fel(val));
        }

        changed |= evaluate_calculate_only(item, env, values);

        if item.repeatable && !item.children.is_empty() {
            changed |= calculate_pass_repeat_children_with_aliases(
                &mut item.children,
                env,
                values,
                Some(scoped_vars),
            );
        } else {
            changed |= calculate_pass_items_scoped(&mut item.children, env, values, scoped_vars);
        }
    }

    changed
}

fn calculate_pass_repeat_children_with_aliases(
    children: &mut [ItemInfo],
    env: &mut FormspecEnvironment,
    values: &mut HashMap<String, Value>,
    scoped_vars: Option<&HashMap<String, Value>>,
) -> bool {
    let mut changed = false;
    let mut current_instance: Option<String> = None;
    let mut alias_names: Vec<String> = Vec::new();
    let mut nested_groups: Vec<String> = Vec::new();
    let mut saved_values: HashMap<String, Option<EnvVal>> = HashMap::new();
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

        if let Some(scoped_vars) = scoped_vars {
            let visible = visible_variables(scoped_vars, &item.path);
            env.variables.clear();
            for (name, val) in &visible {
                env.set_variable(name, json_to_runtime_fel(val));
            }
        }

        changed |= evaluate_calculate_only(item, env, values);

        if item.calculate.is_some()
            && let Some(val) = values.get(&item.path)
        {
            env.set_field(&item.key, json_to_runtime_fel(val));
            refresh_nested_group_aliases(&instance_prefix, &nested_groups, env, values);
        }

        if item.repeatable && !item.children.is_empty() {
            changed |= calculate_pass_repeat_children_with_aliases(
                &mut item.children,
                env,
                values,
                scoped_vars,
            );
        } else if let Some(scoped_vars) = scoped_vars {
            changed |= calculate_pass_items_scoped(&mut item.children, env, values, scoped_vars);
        } else {
            changed |= calculate_pass_items(&mut item.children, env, values);
        }
    }

    if repeat_context_active {
        env.pop_repeat();
    }
    restore_instance_aliases(env, &alias_names, &mut saved_values);

    changed
}

fn evaluate_calculate_only(
    item: &mut ItemInfo,
    env: &mut FormspecEnvironment,
    values: &mut HashMap<String, Value>,
) -> bool {
    let Some(ref expr) = item.calculate else {
        return false;
    };
    let normalized_expr = resolve_qualified_repeat_refs(expr, &item.path);
    let Ok(parsed) = parse(&normalized_expr) else {
        return false;
    };

    let result = evaluate(&parsed, env);
    let coerced = coerce_calculated_value(item, result.value);
    let json_val = fel_to_ui_json(&coerced);
    let changed = values.get(&item.path) != Some(&json_val);

    values.insert(item.path.clone(), json_val.clone());
    item.value = json_val.clone();
    env.set_field(&item.path, coerced);

    changed
}

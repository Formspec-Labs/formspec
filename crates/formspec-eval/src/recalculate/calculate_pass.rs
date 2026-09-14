//! Fixpoint calculate passes until sibling and cross-field calculates stabilize.

use std::collections::HashMap;

use fel_core::{FormspecEnvironment, Value as EnvVal, evaluate, fel_to_ui_json, parse};
use serde_json::Value;

use super::json_fel::coerce_calculated_value;
use super::repeats::{InstanceScope, ResponseIndex};
use super::variables::visible_variables;
use crate::types::{ItemInfo, resolve_qualified_repeat_refs};

pub(super) fn settle_calculated_values(
    items: &mut [ItemInfo],
    env: &mut FormspecEnvironment,
    values: &mut HashMap<String, Value>,
    index: &ResponseIndex,
    scoped_vars: Option<&HashMap<String, EnvVal>>,
) {
    for _ in 0..100 {
        let changed = match scoped_vars {
            Some(scoped_vars) => {
                calculate_pass_items_scoped(items, env, values, index, scoped_vars)
            }
            None => calculate_pass_items(items, env, values, index),
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
    index: &ResponseIndex,
) -> bool {
    let mut changed = false;

    for item in items.iter_mut() {
        changed |= evaluate_calculate_only(item, env, values);

        if item.repeatable && !item.children.is_empty() {
            changed |= calculate_pass_repeat_children_with_aliases(
                &mut item.children,
                env,
                values,
                index,
                None,
            );
        } else {
            changed |= calculate_pass_items(&mut item.children, env, values, index);
        }
    }

    changed
}

fn calculate_pass_items_scoped(
    items: &mut [ItemInfo],
    env: &mut FormspecEnvironment,
    values: &mut HashMap<String, Value>,
    index: &ResponseIndex,
    scoped_vars: &HashMap<String, EnvVal>,
) -> bool {
    let mut changed = false;

    for item in items.iter_mut() {
        env.variables = visible_variables(scoped_vars, &item.path);

        changed |= evaluate_calculate_only(item, env, values);

        if item.repeatable && !item.children.is_empty() {
            changed |= calculate_pass_repeat_children_with_aliases(
                &mut item.children,
                env,
                values,
                index,
                Some(scoped_vars),
            );
        } else {
            changed |=
                calculate_pass_items_scoped(&mut item.children, env, values, index, scoped_vars);
        }
    }

    changed
}

fn calculate_pass_repeat_children_with_aliases(
    children: &mut [ItemInfo],
    env: &mut FormspecEnvironment,
    values: &mut HashMap<String, Value>,
    index: &ResponseIndex,
    scoped_vars: Option<&HashMap<String, EnvVal>>,
) -> bool {
    let mut changed = false;
    let mut scope = InstanceScope::new(children, values, index);

    for item in children.iter_mut() {
        scope.enter(item, env, values, index);

        if let Some(scoped_vars) = scoped_vars {
            env.variables = visible_variables(scoped_vars, &item.path);
        }

        changed |= evaluate_calculate_only(item, env, values);

        if item.calculate.is_some() {
            scope.refresh_after_calculate(item, env, values, index);
        }

        if item.repeatable && !item.children.is_empty() {
            changed |= calculate_pass_repeat_children_with_aliases(
                &mut item.children,
                env,
                values,
                index,
                scoped_vars,
            );
        } else if let Some(scoped_vars) = scoped_vars {
            changed |=
                calculate_pass_items_scoped(&mut item.children, env, values, index, scoped_vars);
        } else {
            changed |= calculate_pass_items(&mut item.children, env, values, index);
        }
    }

    scope.finish(env);

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

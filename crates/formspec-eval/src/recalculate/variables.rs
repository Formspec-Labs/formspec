//! Definition variables: dependency topo sort, scope keys, and scoped evaluation order.

use std::collections::{HashMap, HashSet};

use fel_core::{
    FormspecEnvironment, Value as EnvVal, evaluate, extract_dependencies, fel_to_json, parse,
};
use serde_json::Value;

use super::json_fel::json_to_runtime_fel;
use crate::types::{VariableDef, strip_indices};

/// Topologically sort variables by their dependencies.
pub fn topo_sort_variables(variables: &[VariableDef]) -> Result<Vec<String>, String> {
    let var_names: HashSet<&str> = variables.iter().map(|v| v.name.as_str()).collect();
    let mut resolved: Vec<String> = Vec::new();
    let mut remaining: Vec<&str> = variables.iter().map(|v| v.name.as_str()).collect();

    while !remaining.is_empty() {
        let mut progress = false;
        let mut next_remaining = Vec::new();

        for &name in &remaining {
            let var = variables.iter().find(|v| v.name == name).unwrap();
            let deps = variable_deps(&var.expression, &var_names);
            if deps.iter().all(|d| resolved.iter().any(|r| r == d)) {
                resolved.push(name.to_string());
                progress = true;
            } else {
                next_remaining.push(name);
            }
        }

        remaining = next_remaining;
        if !progress {
            let cycle: Vec<String> = remaining.iter().map(|s| s.to_string()).collect();
            return Err(format!("Circular variable dependencies: {:?}", cycle));
        }
    }

    Ok(resolved)
}

/// Extract variable-level dependencies from a FEL expression.
pub(crate) fn variable_deps(expr: &str, known_vars: &HashSet<&str>) -> Vec<String> {
    match parse(expr) {
        Ok(ast) => {
            let deps = extract_dependencies(&ast);
            deps.context_refs
                .iter()
                .filter_map(|r| {
                    let name = r.strip_prefix('@')?;
                    let base = name.split('.').next().unwrap_or(name);
                    let base = base.split('(').next().unwrap_or(base);
                    if known_vars.contains(base) {
                        Some(base.to_string())
                    } else {
                        None
                    }
                })
                .collect()
        }
        Err(_) => vec![],
    }
}

/// Visible variables for a given item path (scope-qualified keys in `all_vars`).
pub(crate) fn visible_variables(
    all_vars: &HashMap<String, Value>,
    item_path: &str,
) -> HashMap<String, Value> {
    let mut visible = HashMap::new();

    for (key, val) in all_vars {
        if let Some(name) = key.strip_prefix("#:") {
            visible.insert(name.to_string(), val.clone());
        }
    }

    let stripped = strip_indices(item_path);
    let parts: Vec<&str> = stripped.split('.').collect();
    for i in 1..=parts.len() {
        let ancestor = parts[..i].join(".");
        let prefix = format!("{ancestor}:");
        for (key, val) in all_vars {
            if let Some(name) = key.strip_prefix(&prefix) {
                visible.insert(name.to_string(), val.clone());
            }
        }
    }

    visible
}

fn visible_variables_for_scope(
    all_vars: &HashMap<String, Value>,
    scope: &str,
) -> HashMap<String, Value> {
    if scope == "#" {
        let mut visible = HashMap::new();
        for (key, val) in all_vars {
            if let Some(name) = key.strip_prefix("#:") {
                visible.insert(name.to_string(), val.clone());
            }
        }
        visible
    } else {
        visible_variables(all_vars, scope)
    }
}

fn bind_scope_field_aliases(
    env: &mut FormspecEnvironment,
    scope: &str,
) -> HashMap<String, Option<EnvVal>> {
    if scope == "#" {
        return HashMap::new();
    }

    let mut saved = HashMap::new();
    let prefix = format!("{scope}.");
    let entries: Vec<(String, EnvVal)> = env
        .data
        .iter()
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect();

    for (path, value) in entries {
        if let Some(alias) = path.strip_prefix(&prefix)
            && !alias.contains('.')
        {
            saved.insert(alias.to_string(), env.data.get(alias).cloned());
            env.set_field(alias, value);
        }
    }

    saved
}

fn restore_scope_field_aliases(
    env: &mut FormspecEnvironment,
    saved_aliases: HashMap<String, Option<EnvVal>>,
) {
    for (alias, previous) in saved_aliases {
        match previous {
            Some(value) => env.set_field(&alias, value),
            None => {
                env.data.remove(&alias);
            }
        }
    }
}

/// Evaluate variables in topological order; returns bare-name map, scope-keyed map, cycle error.
pub(crate) fn evaluate_variables_scoped(
    var_defs: &[VariableDef],
    env: &mut FormspecEnvironment,
) -> (
    HashMap<String, Value>,
    HashMap<String, Value>,
    Option<String>,
) {
    let (order, cycle_err) = match topo_sort_variables(var_defs) {
        Ok(order) => (order, None),
        Err(cycle_msg) => {
            let order = var_defs.iter().map(|v| v.name.clone()).collect();
            (order, Some(cycle_msg))
        }
    };

    let mut var_values = HashMap::new();
    let mut scoped_values = HashMap::new();

    for name in &order {
        let matching: Vec<_> = var_defs.iter().filter(|v| v.name == *name).collect();
        for var in matching {
            let scope = var.scope.as_deref().unwrap_or("#");
            let saved_aliases = bind_scope_field_aliases(env, scope);
            let saved_variables = env.variables.clone();
            env.variables.clear();
            for (visible_name, visible_value) in visible_variables_for_scope(&scoped_values, scope)
            {
                env.set_variable(&visible_name, json_to_runtime_fel(&visible_value));
            }
            if let Ok(parsed) = parse(&var.expression) {
                let result = evaluate(&parsed, env);
                let json_val = fel_to_json(&result.value);
                env.set_variable(name, result.value);
                var_values.insert(name.clone(), json_val.clone());

                let scoped_key = format!("{scope}:{name}");
                scoped_values.insert(scoped_key, json_val);
            }
            env.variables = saved_variables;
            restore_scope_field_aliases(env, saved_aliases);
        }
    }

    (var_values, scoped_values, cycle_err)
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;
    use serde_json::json;

    #[test]
    fn test_topo_sort_correct_order() {
        let vars = vec![
            VariableDef {
                name: "c".to_string(),
                expression: "@b + 1".to_string(),
                scope: None,
            },
            VariableDef {
                name: "a".to_string(),
                expression: "42".to_string(),
                scope: None,
            },
            VariableDef {
                name: "b".to_string(),
                expression: "@a * 2".to_string(),
                scope: None,
            },
        ];

        let order = topo_sort_variables(&vars).unwrap();
        assert_eq!(order.len(), 3);

        let pos_a = order.iter().position(|n| n == "a").unwrap();
        let pos_b = order.iter().position(|n| n == "b").unwrap();
        let pos_c = order.iter().position(|n| n == "c").unwrap();
        assert!(pos_a < pos_b, "a must be evaluated before b");
        assert!(pos_b < pos_c, "b must be evaluated before c");
    }

    #[test]
    fn test_topo_sort_cycle_detection() {
        let vars = vec![
            VariableDef {
                name: "x".to_string(),
                expression: "@y + 1".to_string(),
                scope: None,
            },
            VariableDef {
                name: "y".to_string(),
                expression: "@x + 1".to_string(),
                scope: None,
            },
        ];

        let result = topo_sort_variables(&vars);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            err.contains("Circular"),
            "Error should mention circular: {}",
            err
        );
    }

    #[test]
    fn test_topo_sort_independent_vars() {
        let vars = vec![
            VariableDef {
                name: "x".to_string(),
                expression: "10".to_string(),
                scope: None,
            },
            VariableDef {
                name: "y".to_string(),
                expression: "20".to_string(),
                scope: None,
            },
        ];

        let order = topo_sort_variables(&vars).unwrap();
        assert_eq!(order.len(), 2);
        assert!(order.contains(&"x".to_string()));
        assert!(order.contains(&"y".to_string()));
    }

    #[test]
    fn variable_deps_dotted_context_ref() {
        let known: HashSet<&str> = ["config"].iter().cloned().collect();
        let deps = variable_deps("@config.threshold + 1", &known);
        assert_eq!(
            deps,
            vec!["config"],
            "dotted ref @config.threshold resolves to base 'config'"
        );
    }

    #[test]
    fn variable_deps_parse_failure_returns_empty() {
        let known: HashSet<&str> = ["x"].iter().cloned().collect();
        let deps = variable_deps("@@@ !!invalid!!", &known);
        assert!(deps.is_empty(), "parse failure should return empty vec");
    }

    #[test]
    fn variable_deps_filters_unknown_refs() {
        let known: HashSet<&str> = ["a"].iter().cloned().collect();
        let deps = variable_deps("@a + @b", &known);
        assert_eq!(deps, vec!["a"], "only known vars returned");
    }

    #[test]
    fn visible_variables_unit_test() {
        let mut all_vars = HashMap::new();
        all_vars.insert("#:global_var".to_string(), json!(1));
        all_vars.insert("section:local_var".to_string(), json!(2));
        all_vars.insert("other:other_var".to_string(), json!(3));

        let visible = visible_variables(&all_vars, "section.field");
        assert_eq!(visible.get("global_var"), Some(&json!(1)));
        assert_eq!(visible.get("local_var"), Some(&json!(2)));
        assert_eq!(visible.get("other_var"), None);

        let visible_top = visible_variables(&all_vars, "top");
        assert_eq!(visible_top.get("global_var"), Some(&json!(1)));
        assert_eq!(visible_top.get("local_var"), None);
    }
}

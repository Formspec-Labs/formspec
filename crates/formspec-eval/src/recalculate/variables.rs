//! Order and evaluate Definition variables at their concrete item paths.

use std::collections::{HashMap, HashSet};

use fel_core::{Expr, Value, extract_dependencies};

use crate::fel_eval::Fel;
use crate::scope::{ScopeData, ScopeIndex};
use crate::types::VariableDef;

use super::topological_order;

fn context_dependencies(ast: &Expr, known_vars: &HashSet<&str>) -> Vec<String> {
    let deps = extract_dependencies(ast);
    deps.context_refs
        .iter()
        .filter_map(|r| {
            let name = r.strip_prefix('@')?.split(['.', '(']).next()?;
            (!matches!(name, "current" | "index" | "count" | "instance")
                && known_vars.contains(name))
            .then(|| name.to_owned())
        })
        .collect()
}

/// Parsed variable declarations and their concrete evaluation order.
pub(super) struct Variables<'a> {
    bindings: Vec<Binding<'a>>,
    order: Result<Vec<usize>, String>,
}

struct Binding<'a> {
    name: &'a str,
    site: &'a str,
    expression: &'a Expr,
    declaration: usize,
}

impl<'a> Variables<'a> {
    pub(super) fn new(
        definitions: &'a [VariableDef],
        index: &'a ScopeIndex,
        expressions: &'a [Option<Expr>],
    ) -> Self {
        let mut bindings = Vec::new();
        let mut by_site = HashMap::new();
        for (declaration, (definition, expression)) in
            definitions.iter().zip(expressions).enumerate()
        {
            let Some(expression) = expression else {
                continue;
            };
            let name = definition.name.as_str();
            for site in variable_sites(index, definition) {
                by_site.insert((site, name), bindings.len());
                bindings.push(Binding {
                    name,
                    site,
                    expression,
                    declaration,
                });
            }
        }
        let names: HashSet<_> = definitions.iter().map(|var| var.name.as_str()).collect();
        let dependencies: Vec<_> = expressions
            .iter()
            .map(|expr| {
                expr.as_ref()
                    .map_or_else(Vec::new, |expr| context_dependencies(expr, &names))
            })
            .collect();
        let mut incoming = vec![0; bindings.len()];
        let mut dependents = vec![Vec::new(); bindings.len()];
        for (id, binding) in bindings.iter().enumerate() {
            for name in &dependencies[binding.declaration] {
                if let Some(&dependency) = crate::scope::lexical_scopes(binding.site)
                    .chain(std::iter::once("#"))
                    .find_map(|site| by_site.get(&(site, name.as_str())))
                {
                    incoming[id] += 1;
                    dependents[dependency].push(id);
                }
            }
        }
        let order = topological_order(&mut incoming, &dependents).ok_or_else(|| {
            let cycle: Vec<_> = bindings
                .iter()
                .zip(incoming)
                .filter_map(|(binding, count)| (count != 0).then_some(binding.name))
                .collect();
            format!("Circular variable dependencies: {cycle:?}")
        });
        Self { bindings, order }
    }

    /// Read each declaration at its concrete site after its visible dependencies.
    pub(super) fn evaluate(
        &self,
        state: &mut ScopeData,
        index: &ScopeIndex,
        fel: Fel<'_>,
    ) -> (HashMap<String, Value>, Option<String>) {
        state.variables.clear();
        let order = match &self.order {
            Ok(order) => order,
            Err(cycle) => return (HashMap::new(), Some(cycle.clone())),
        };
        let mut result = HashMap::new();
        for &id in order {
            let binding = &self.bindings[id];
            let value = fel
                .evaluate(binding.expression, &state.site(index, binding.site))
                .value;
            result.insert(binding.name.to_owned(), value.clone());
            state
                .variables
                .entry(binding.site.to_owned())
                .or_default()
                .insert(binding.name.to_owned(), value);
        }
        (result, None)
    }
}

pub(super) fn variable_sites<'a>(
    index: &'a ScopeIndex,
    definition: &'a VariableDef,
) -> impl Iterator<Item = &'a str> {
    let scope = definition.scope.as_deref().unwrap_or("#");
    (scope == "#")
        .then_some("#")
        .into_iter()
        .chain(index.variable_sites(scope))
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;

    // Exercise the ordering used by evaluation after removal of the flat sorter.
    fn variable_order(definitions: &[VariableDef]) -> Result<Vec<&str>, String> {
        let index = ScopeIndex::default();
        let expressions: Vec<_> = definitions
            .iter()
            .map(|definition| fel_core::parse(&definition.expression).ok())
            .collect();
        let variables = Variables::new(definitions, &index, &expressions);
        variables.order.map(|order| {
            order
                .into_iter()
                .map(|id| {
                    definitions[variables.bindings[id].declaration]
                        .name
                        .as_str()
                })
                .collect()
        })
    }

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

        let order = variable_order(&vars).unwrap();
        assert_eq!(order.len(), 3);

        let pos_a = order.iter().position(|&n| n == "a").unwrap();
        let pos_b = order.iter().position(|&n| n == "b").unwrap();
        let pos_c = order.iter().position(|&n| n == "c").unwrap();
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

        let result = variable_order(&vars);
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

        let order = variable_order(&vars).unwrap();
        assert_eq!(order.len(), 2);
        assert!(order.contains(&"x"));
        assert!(order.contains(&"y"));
    }

    #[test]
    fn variable_deps_dotted_context_ref() {
        let known: HashSet<&str> = ["config"].iter().cloned().collect();
        let expr = fel_core::parse("@config.threshold + 1").unwrap();
        let deps = context_dependencies(&expr, &known);
        assert_eq!(
            deps,
            vec!["config"],
            "dotted ref @config.threshold resolves to base 'config'"
        );
    }

    #[test]
    fn variable_order_skips_invalid_expression() {
        let definitions = [VariableDef {
            name: "x".into(),
            expression: "@@@ !!invalid!!".into(),
            scope: None,
        }];
        assert!(variable_order(&definitions).unwrap().is_empty());
    }

    #[test]
    fn variable_deps_filters_unknown_refs() {
        let known: HashSet<&str> = ["a"].iter().cloned().collect();
        let expr = fel_core::parse("@a + @b").unwrap();
        let deps = context_dependencies(&expr, &known);
        assert_eq!(deps, vec!["a"], "only known vars returned");
    }
}

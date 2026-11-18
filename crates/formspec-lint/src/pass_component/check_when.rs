//! Component `when` guards must parse as FEL and use explicit repeat subscripts.
//!
//! A runtime hides a component whose `when` is malformed and warns (§8.4); authoring and
//! publication refuse it, since the guard can never evaluate as written.

use std::collections::{HashMap, HashSet};

use serde_json::{Map, Value};

use super::field_lookup::{self, FieldInfo};
use crate::tree::ItemTreeIndex;
use crate::types::LintDiagnostic;

/// Check each authored guard in the scopes where it can render.
pub(crate) fn check(
    tree: &Value,
    custom_defs: Option<&Map<String, Value>>,
    items: Option<&ItemTreeIndex>,
    lookup: Option<&HashMap<String, FieldInfo>>,
    diags: &mut Vec<LintDiagnostic>,
) {
    let mut guards = GuardCheck {
        items,
        lookup,
        custom_defs,
        visited: HashMap::new(),
        diagnostics: Vec::new(),
    };
    guards.walk(tree, "$.tree", "");
    for (name, template) in custom_defs.into_iter().flatten() {
        if !guards.visited.contains_key(name.as_str())
            && let Some(tree) = template.get("tree")
        {
            guards.template(name, tree, "");
        }
    }
    let mut reported = HashSet::new();
    diags.extend(guards.diagnostics.into_iter().filter(|diagnostic| {
        reported.insert((
            diagnostic.code,
            diagnostic.path.clone(),
            diagnostic.message.clone(),
        ))
    }));
}

/// Inputs and visit state for component guards.
struct GuardCheck<'a> {
    /// Definition declarations for resolving expression paths.
    items: Option<&'a ItemTreeIndex>,
    /// Definition items for resolving repeat template bindings.
    lookup: Option<&'a HashMap<String, FieldInfo>>,
    /// Reusable component trees by authored name.
    custom_defs: Option<&'a Map<String, Value>>,
    /// Scopes already visited for each template, including recursive references.
    visited: HashMap<&'a str, HashSet<String>>,
    /// Guard findings before deduplication across template call sites.
    diagnostics: Vec<LintDiagnostic>,
}

impl<'a> GuardCheck<'a> {
    /// Check a template at the scope inherited from its caller.
    fn template(&mut self, name: &'a str, tree: &Value, scope: &str) {
        if self
            .visited
            .entry(name)
            .or_default()
            .insert(scope.to_owned())
        {
            self.walk(tree, &format!("$.components.{name}.tree"), scope);
        }
    }

    /// Check the node in the incoming scope and resolve its children's scope.
    fn walk(&mut self, node: &Value, path: &str, scope: &str) {
        let Some(component) = node.get("component").and_then(Value::as_str) else {
            return;
        };
        if let Some(when) = node.get("when").and_then(Value::as_str) {
            let path = format!("{path}.when");
            match fel_core::parse(when) {
                Ok(parsed) => {
                    if let Some(items) = self.items {
                        crate::repeat_references::check_expression(
                            items,
                            Some(scope),
                            &path,
                            &parsed,
                            &mut self.diagnostics,
                        );
                    }
                }
                Err(error) => self
                    .diagnostics
                    .push(crate::expressions::parse_error(&path, &error)),
            }
        }
        if let Some((name, template)) = self
            .custom_defs
            .and_then(|defs| defs.get_key_value(component))
            && let Some(tree) = template.get("tree")
        {
            self.template(name, tree, scope);
        }
        if let Some(children) = node.get("children").and_then(Value::as_array) {
            let child_scope = self.lookup.and_then(|lookup| {
                let bind = node.get("bind")?.as_str()?;
                let group = field_lookup::repeat_group_path(
                    lookup,
                    scope.strip_suffix("[*]"),
                    component,
                    bind,
                )?;
                Some(format!("{group}[*]"))
            });
            let child_scope = child_scope.as_deref().unwrap_or(scope);
            for (index, child) in children.iter().enumerate() {
                self.walk(child, &format!("{path}.children[{index}]"), child_scope);
            }
        }
    }
}

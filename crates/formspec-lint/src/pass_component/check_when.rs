//! Component `when` guards must parse as FEL (E400, Component §8).
//!
//! A runtime hides a component whose `when` is malformed and warns (§8.4); authoring and
//! publication refuse it, since the guard can never evaluate as written.

use formspec_core::visit_component_subtree;
use serde_json::{Map, Value};

use crate::types::LintDiagnostic;

/// E400 when `node`'s `when` fails to parse.
pub(crate) fn check(node: &Value, path: &str, diags: &mut Vec<LintDiagnostic>) {
    if let Some(when) = node.get("when").and_then(Value::as_str)
        && let Err(error) = fel_core::parse(when)
    {
        diags.push(crate::expressions::parse_error(
            &format!("{path}.when"),
            &error,
        ));
    }
}

/// E400 for each malformed `when` in custom component templates (`$.components.<name>.tree`).
pub(crate) fn check_templates(
    custom_defs: Option<&Map<String, Value>>,
    diags: &mut Vec<LintDiagnostic>,
) {
    let child_seg = |parent: &str, i: usize| format!("{parent}.children[{i}]");
    for (name, definition) in custom_defs.into_iter().flatten() {
        if let Some(tree) = definition.get("tree") {
            let root = format!("$.components.{name}.tree");
            visit_component_subtree(tree, &root, &child_seg, &mut |node, path| {
                check(node, path, diags);
            });
        }
    }
}

//! Pass 7: Component document semantic checks (E800-E807, W800-W804).
#![allow(clippy::missing_docs_in_private_items)]

mod check_duplicate_bind;
mod check_input_compat;
mod check_layout_bind;
mod check_options_source;
mod check_params;
mod check_textinput_variant;
mod check_unknown;
mod classification;
mod custom_cycles;
mod field_lookup;
mod walk;

use std::collections::HashSet;

use serde_json::Value;

use crate::metadata;
use crate::types::LintDiagnostic;

pub(crate) const PASS: u8 = 7;

/// Validate a component document and return all diagnostics.
/// When `definition` is provided, cross-artifact checks (W800, E802-E803) are enabled.
pub fn lint_component(component: &Value, definition: Option<&Value>) -> Vec<LintDiagnostic> {
    let tree = match component.get("tree") {
        Some(t) => t,
        None => return Vec::new(),
    };

    let custom_defs = component.get("components").and_then(|v| v.as_object());
    let custom_names: HashSet<_> = custom_defs
        .map(|m| m.keys().map(|k| k.as_str()).collect())
        .unwrap_or_default();

    let mut diags = Vec::new();

    let root_type = tree.get("component").and_then(|v| v.as_str()).unwrap_or("");
    if root_type.is_empty() || !classification::LAYOUT_ROOTS.contains(&root_type) {
        diags.push(metadata::with_metadata(LintDiagnostic::error(
            "E800",
            PASS,
            "$.tree",
            format!(
                "Root component must be a layout type ({}), found '{root_type}'",
                classification::LAYOUT_ROOTS.join(", ")
            ),
        )));
    }

    if let Some(defs) = custom_defs {
        custom_cycles::lint_custom_component_cycles(defs, &custom_names, &mut diags);
    }

    let field_lookup = definition.map(field_lookup::build_field_lookup);

    let mut state = walk::WalkState {
        custom_names,
        custom_defs,
        field_lookup,
        all_binds: HashSet::new(),
        editable_binds: HashSet::new(),
        diags,
    };

    state.walk_node(tree, "$.tree");
    state.diags
}

#[cfg(test)]
mod tests;

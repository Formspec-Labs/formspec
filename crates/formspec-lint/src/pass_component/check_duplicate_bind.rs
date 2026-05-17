//! Duplicate binds in tree (W804) and editable binding uniqueness (W803).

use crate::component_matrix::is_input_component;
use crate::metadata;
use crate::types::LintDiagnostic;

use super::walk::WalkState;
use super::PASS;

pub(crate) fn check_tree_duplicate(state: &mut WalkState<'_>, path: &str, bind: &str) {
    if !state.all_binds.insert(bind.to_string()) {
        state.diags.push(metadata::with_metadata(LintDiagnostic::warning(
            "W804",
            PASS,
            path,
            format!("Duplicate bind in component tree: {bind}"),
        )));
    }
}

pub(crate) fn check_editable_uniqueness(
    state: &mut WalkState<'_>,
    path: &str,
    comp_type: &str,
    bind: &str,
) {
    if !is_input_component(comp_type) {
        return;
    }
    if !state.editable_binds.insert(bind.to_string()) {
        state.diags.push(metadata::with_metadata(LintDiagnostic::warning(
            "W803",
            PASS,
            path,
            format!("Multiple editable inputs bind to the same field: '{bind}'"),
        )));
    }
}

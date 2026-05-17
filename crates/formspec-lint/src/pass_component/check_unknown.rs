//! Unknown component type (E801).

use crate::metadata;
use crate::types::LintDiagnostic;

use super::classification::is_builtin;
use super::walk::WalkState;
use super::PASS;

pub(crate) fn check(state: &mut WalkState<'_>, path: &str, comp_type: &str) {
    if !is_builtin(comp_type) && !state.custom_names.contains(comp_type) {
        state.diags.push(metadata::with_metadata(LintDiagnostic::error(
            "E801",
            PASS,
            path,
            format!("Unknown component type: '{comp_type}'"),
        )));
    }
}

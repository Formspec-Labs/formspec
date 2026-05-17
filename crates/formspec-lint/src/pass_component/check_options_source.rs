//! Options-required components without field options (E803).

use crate::component_matrix::{is_input_component, requires_options_source};
use crate::metadata;
use crate::types::LintDiagnostic;

use super::walk::WalkState;
use super::PASS;

pub(crate) fn check(state: &mut WalkState<'_>, path: &str, comp_type: &str, bind: &str) {
    if !is_input_component(comp_type) || !requires_options_source(comp_type) {
        return;
    }
    let Some(ref field_lookup) = state.field_lookup else {
        return;
    };
    let Some(field_info) = field_lookup.get(bind) else {
        return;
    };
    if !field_info.has_options {
        state.diags.push(metadata::with_metadata(LintDiagnostic::error(
            "E803",
            PASS,
            path,
            format!(
                "Component '{comp_type}' requires an optionSet or options, but field '{bind}' has neither"
            ),
        )));
    }
}

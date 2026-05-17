//! Layout/container bind misuse (W801).

use crate::metadata;
use crate::types::LintDiagnostic;

use super::classification::should_not_bind;
use super::walk::WalkState;
use super::PASS;

pub(crate) fn check(state: &mut WalkState<'_>, path: &str, comp_type: &str) {
    if should_not_bind(comp_type) {
        state.diags.push(metadata::with_metadata(LintDiagnostic::warning(
            crate::LintCode::W801,
            PASS,
            path,
            format!("Layout/container component '{comp_type}' should not declare a bind"),
        )));
    }
}

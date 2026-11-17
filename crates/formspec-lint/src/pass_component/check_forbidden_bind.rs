//! Forbidden component binds (W801), from each component's own Bind clause.
//!
//! Component §4.2 covers Layout/Container. Display prohibitions: Heading (§5.13),
//! Divider (§5.15), ActionButton (§5.19), Alert (§6.9), Badge (§6.10), Summary (§6.12),
//! and ValidationSummary (§6.13). Text (§5.14) and ProgressBar (§6.11) allow binds.

use crate::metadata;
use crate::types::LintDiagnostic;
use crate::ui_policy::component_forbids_bind;

use super::PASS;
use super::walk::WalkState;

pub(crate) fn check(state: &mut WalkState<'_>, path: &str, comp_type: &str) {
    if component_forbids_bind(comp_type) {
        state
            .diags
            .push(metadata::with_metadata(LintDiagnostic::warning(
                crate::LintCode::W801,
                PASS,
                path,
                format!("Component '{comp_type}' forbids bind; remove the bind property"),
            )));
    }
}

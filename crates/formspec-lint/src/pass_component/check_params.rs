//! Custom component required params (E806).

use serde_json::Value;

use crate::metadata;
use crate::types::LintDiagnostic;

use super::walk::WalkState;
use super::PASS;

pub(crate) fn check(state: &mut WalkState<'_>, node: &Value, path: &str, comp_type: &str) {
    if !state.custom_names.contains(comp_type) {
        return;
    }
    let Some(custom_defs) = state.custom_defs else {
        return;
    };
    let Some(def) = custom_defs.get(comp_type) else {
        return;
    };
    let Some(params) = def.get("params").and_then(|v| v.as_array()) else {
        return;
    };
    let provided_params = node.get("params").and_then(|v| v.as_object());
    for param_val in params {
        if let Some(param_name) = param_val.as_str()
            && !provided_params.is_some_and(|p| p.contains_key(param_name))
        {
            state.diags.push(metadata::with_metadata(LintDiagnostic::error(
                "E806",
                PASS,
                path,
                format!("Custom component '{comp_type}' missing required param '{param_name}'"),
            )));
        }
    }
}

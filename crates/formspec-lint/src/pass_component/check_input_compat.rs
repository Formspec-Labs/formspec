//! Bind resolution and field/component type compatibility (W800, E802, W802).

use crate::component_matrix::{Compatibility, classify_compatibility, is_input_component};
use crate::metadata;
use crate::types::LintDiagnostic;
use serde_json::Value;

use super::PASS;
use super::walk::WalkState;

pub(crate) fn check(
    state: &mut WalkState<'_>,
    node: &Value,
    path: &str,
    comp_type: &str,
    bind: &str,
) {
    if !is_input_component(comp_type) {
        return;
    }
    let Some(ref field_lookup) = state.field_lookup else {
        return;
    };
    match field_lookup.get(bind) {
        None => {
            state
                .diags
                .push(metadata::with_metadata(LintDiagnostic::warning(
                    crate::LintCode::W800,
                    PASS,
                    path,
                    format!(
                        "Component bind '{bind}' does not resolve to a field in the definition"
                    ),
                )));
        }
        Some(field_info) => {
            if let Some(ref dt) = field_info.data_type {
                match classify_node_compatibility(node, comp_type, dt) {
                    Compatibility::Incompatible => {
                        state.diags.push(metadata::with_metadata(LintDiagnostic::error(
                            crate::LintCode::E802,
                            PASS,
                            path,
                            format!(
                                "Component '{comp_type}' is incompatible with field dataType '{dt}'"
                            ),
                        )));
                    }
                    Compatibility::CompatibleWithWarning => {
                        state.diags.push(metadata::with_metadata(LintDiagnostic::warning(
                            crate::LintCode::W802,
                            PASS,
                            path,
                            format!(
                                "Component '{comp_type}' is only loosely compatible with field dataType '{dt}'"
                            ),
                        )));
                    }
                    _ => {}
                }
            }
        }
    }
}

fn classify_node_compatibility(node: &Value, comp_type: &str, data_type: &str) -> Compatibility {
    if comp_type == "Select" && data_type == "multiChoice" {
        return if node
            .get("multiple")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            Compatibility::Compatible
        } else {
            Compatibility::Incompatible
        };
    }

    classify_compatibility(comp_type, data_type)
}

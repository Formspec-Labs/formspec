//! Component responsive override lint (W806).

use serde_json::Value;

use crate::metadata;
use crate::types::LintDiagnostic;
use crate::ui_policy::ui_policy;

use super::walk::WalkState;
use super::PASS;

pub(crate) fn check(state: &mut WalkState<'_>, node: &Value, path: &str, comp_type: &str) {
    let Some(responsive) = node.get("responsive").and_then(Value::as_object) else {
        return;
    };
    let policy = &ui_policy().responsive;
    let Some(component_allowed) = policy.allowed_props_by_component.get(comp_type) else {
        return;
    };

    for (breakpoint, override_value) in responsive {
        let Some(props) = override_value.as_object() else {
            continue;
        };
        for prop in props.keys() {
            if policy.forbidden_keys.contains(prop) {
                state
                    .diags
                    .push(metadata::with_metadata(LintDiagnostic::warning(
                        crate::LintCode::W806,
                        PASS,
                        format!("{path}.responsive.{breakpoint}.{prop}"),
                        format!(
                            "Responsive override for component '{comp_type}' cannot override structural property '{prop}'"
                        ),
                    )));
                continue;
            }

            if !policy.base_allowed_props.contains(prop) && !component_allowed.contains(prop) {
                state
                    .diags
                    .push(metadata::with_metadata(LintDiagnostic::warning(
                        crate::LintCode::W806,
                        PASS,
                        format!("{path}.responsive.{breakpoint}.{prop}"),
                        format!(
                            "Responsive override property '{prop}' is not valid for component '{comp_type}'"
                        ),
                    )));
            }
        }
    }
}

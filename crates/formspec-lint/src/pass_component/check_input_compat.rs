//! Bind resolution by component category (W800) and field/component type compatibility
//! (E802, W802).
//!
//! Component §4.2: an Input component binds a field; a Display component binds a field, a
//! display item, or nothing; DataTable and Accordion bind a repeatable group (§6.14, §6.3).
//! Layout and other container binds are W801's.

use crate::component_matrix::{Compatibility, classify_compatibility, is_input_component};
use crate::metadata;
use crate::types::LintDiagnostic;
use crate::ui_policy::component_category;
use serde_json::Value;

use super::PASS;
use super::field_lookup::{self, FieldInfo, ItemKind};
use super::walk::WalkState;

/// Which Definition items a component category may bind (Component §4.2).
#[derive(Clone, Copy)]
enum Accepts {
    Field,
    FieldOrDisplay,
    RepeatableGroup,
}

fn accepts(comp_type: &str) -> Option<Accepts> {
    match comp_type {
        "DataTable" | "Accordion" => Some(Accepts::RepeatableGroup),
        _ if is_input_component(comp_type) => Some(Accepts::Field),
        _ if component_category(comp_type) == Some("display") => Some(Accepts::FieldOrDisplay),
        _ => None,
    }
}

/// Why `comp_type` may not bind `bind`, or `None` when the bind is acceptable.
fn bind_problem(comp_type: &str, bind: &str, target: Option<&FieldInfo>) -> Option<String> {
    let accepted = accepts(comp_type)?;
    let Some(target) = target else {
        return Some(match accepted {
            Accepts::Field => {
                format!("Component bind '{bind}' does not resolve to a field in the definition")
            }
            Accepts::FieldOrDisplay | Accepts::RepeatableGroup => {
                format!("Component bind '{bind}' does not resolve to an item in the definition")
            }
        });
    };
    let what = match target.kind {
        ItemKind::Field => "a field",
        ItemKind::Group if target.repeatable => "a repeatable group",
        ItemKind::Group => "a non-repeatable group",
        ItemKind::Display => "a display item",
        ItemKind::Other => "an item with no recognized type",
    };
    // An item with no recognized `type` is a schema error (E101); its kind is not judged twice.
    let fits = target.kind == ItemKind::Other
        || match accepted {
            Accepts::Field => target.kind == ItemKind::Field,
            Accepts::FieldOrDisplay => matches!(target.kind, ItemKind::Field | ItemKind::Display),
            Accepts::RepeatableGroup => target.kind == ItemKind::Group && target.repeatable,
        };
    let rule = match accepted {
        Accepts::Field => "an Input component binds a field",
        Accepts::FieldOrDisplay => "a Display component binds a field or a display item",
        Accepts::RepeatableGroup => "DataTable and Accordion bind a repeatable group",
    };
    (!fits).then(|| {
        format!("Component '{comp_type}' binds '{bind}', which is {what}; {rule} (Component §4.2)")
    })
}

pub(crate) fn check(
    state: &mut WalkState<'_>,
    node: &Value,
    path: &str,
    comp_type: &str,
    bind: &str,
) {
    let Some(ref field_lookup) = state.field_lookup else {
        return;
    };
    let repeat_group = state.repeat_scopes.last().map(|(_, group)| group.as_str());
    let target = field_lookup::resolve(field_lookup, repeat_group, bind);
    if let Some(message) = bind_problem(comp_type, bind, target) {
        state
            .diags
            .push(metadata::with_metadata(LintDiagnostic::warning(
                crate::LintCode::W800,
                PASS,
                path,
                message,
            )));
        return;
    }
    if !is_input_component(comp_type) {
        return;
    }
    if let Some(field_info) = target
        && let Some(ref dt) = field_info.data_type
    {
        match classify_node_compatibility(node, comp_type, dt) {
            Compatibility::Incompatible => {
                state
                    .diags
                    .push(metadata::with_metadata(LintDiagnostic::error(
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

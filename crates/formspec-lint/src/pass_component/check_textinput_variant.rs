//! TextInput formatted variants require string fields (E804).

use serde_json::Value;

use crate::component_matrix::is_input_component;
use crate::metadata;
use crate::types::LintDiagnostic;

use super::walk::WalkState;
use super::PASS;

pub(crate) fn check(state: &mut WalkState<'_>, node: &Value, path: &str, comp_type: &str, bind: &str) {
    if comp_type != "TextInput" || !is_input_component(comp_type) {
        return;
    }
    let variant = node
        .get("variant")
        .and_then(|v| v.as_str())
        .unwrap_or("plain");
    if !matches!(variant, "richtext" | "markdown" | "latex") {
        return;
    }
    let Some(ref field_lookup) = state.field_lookup else {
        return;
    };
    let Some(field_info) = field_lookup.get(bind) else {
        return;
    };
    let is_string = field_info
        .data_type
        .as_deref()
        .is_some_and(|dt| dt == "string" || dt == "text");
    if !is_string {
        state.diags.push(metadata::with_metadata(LintDiagnostic::error(
            "E804",
            PASS,
            path,
            format!(
                "TextInput with variant '{variant}' must bind to a string field, found '{}'",
                field_info.data_type.as_deref().unwrap_or("unknown")
            ),
        )));
    }
}

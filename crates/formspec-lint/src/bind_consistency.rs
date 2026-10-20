//! Core §3.10.3: nonblocking advisories from effective Item Bind properties.

use std::collections::HashMap;

use formspec_core::{BindTargets, visit_definition_items_from_document};
use serde_json::Value;

use crate::{LintCode, LintDiagnostic, metadata::with_metadata};

/// Advisory phase, separate from Surface/Response and companion-document checks.
const PASS: u8 = 10;

/// Detect declared Bind combinations without consulting Instance data.
pub(crate) fn check_bind_consistency(doc: &Value) -> Vec<LintDiagnostic> {
    let targets = BindTargets::new(doc.get("binds"));
    let mut readonly_by_path: HashMap<String, bool> = HashMap::new();
    let mut diagnostics = Vec::new();

    visit_definition_items_from_document(doc, &mut |ctx| {
        let bind = targets.merged(&ctx.dotted_path);
        let calculate = bind
            .get("calculate")
            .and_then(Value::as_str)
            .is_some_and(|expression| !expression.trim().is_empty());
        let inherited_readonly = ctx
            .parent_dotted
            .as_ref()
            .and_then(|parent| readonly_by_path.get(parent))
            .copied()
            .unwrap_or(false);
        // Core §4.3.2: a locked ancestor wins even over an explicit child false.
        let readonly = inherited_readonly
            || statically_true(bind.get("readonly"))
            || (calculate && !bind.contains_key("readonly"));
        readonly_by_path.insert(ctx.dotted_path.clone(), readonly);
        if ctx.item.get("type").and_then(Value::as_str) != Some("field") {
            return;
        }

        let required = statically_true(bind.get("required"));
        let pre_populate = ctx.item.get("prePopulate").is_some();
        let path_for = |property: &str| {
            targets
                .winning_path(&ctx.dotted_path, property)
                .unwrap_or(&ctx.dotted_path)
                .to_owned()
        };

        if required
            && readonly
            && !calculate
            && !pre_populate
            && ctx.item.get("initialValue").is_none()
        {
            diagnostics.push(with_metadata(LintDiagnostic::warning(
                LintCode::W900, PASS, path_for("required"),
                "This field is required but locked and has no declared value source. A loaded Response or programmatic population may supply its value.",
            )));
        }
        if pre_populate && calculate {
            diagnostics.push(with_metadata(LintDiagnostic::warning(
                LintCode::W901, PASS, path_for("calculate"),
                "The formula replaces the pre-fill during recalculation. Verify that both declarations are intentional.",
            )));
        }
        if required && readonly && calculate {
            diagnostics.push(with_metadata(LintDiagnostic::info(
                LintCode::W902, PASS, path_for("required"),
                "Required validation may be redundant when this read-only field's formula is non-empty. It still applies when the formula produces no value.",
            )));
        }
    });
    diagnostics
}

/// Recognize the literal floor; never infer truth from Instance-dependent values.
fn statically_true(expression: Option<&Value>) -> bool {
    expression
        .and_then(Value::as_str)
        .is_some_and(|text| text.trim() == "true")
}

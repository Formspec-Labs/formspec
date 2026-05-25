//! Pass 6: Theme document semantic checks (W700-W712, E710).
#![allow(clippy::missing_docs_in_private_items)]

mod token_refs;
mod token_registry;
mod value_validators;

use std::collections::{HashMap, HashSet};

use formspec_core::visit_definition_items_from_document;
use serde_json::Value;

use crate::component_matrix::{classify_compatibility, Compatibility};
use crate::metadata;
use crate::types::LintDiagnostic;

pub(crate) const PASS: u8 = 6;

/// Validate a theme document and return all diagnostics.
/// When `definition` is provided, cross-artifact checks (W705-W707) are enabled.
pub fn lint_theme(theme: &Value, definition: Option<&Value>) -> Vec<LintDiagnostic> {
    let mut diags = Vec::new();

    let token_names: HashSet<String> = theme
        .get("tokens")
        .and_then(|v| v.as_object())
        .map(|obj| obj.keys().cloned().collect())
        .unwrap_or_default();

    token_registry::lint_declared_tokens(theme, &mut diags);
    token_refs::lint_token_reference_integrity(theme, &token_names, &mut diags);
    lint_pages(theme, &mut diags);
    lint_selector_widget_compatibility(theme, &mut diags);

    if let Some(def) = definition {
        lint_cross_artifact(theme, def, &mut diags);
    }

    diags
}

fn lint_pages(theme: &Value, diags: &mut Vec<LintDiagnostic>) {
    let Some(pages) = theme.get("pages").and_then(|v| v.as_array()) else {
        return;
    };

    let mut seen_ids = HashSet::new();
    for (i, page) in pages.iter().enumerate() {
        if let Some(id) = page.get("id").and_then(|v| v.as_str())
            && !seen_ids.insert(id.to_string())
        {
            diags.push(metadata::with_metadata(LintDiagnostic::error(
                crate::LintCode::E710,
                PASS,
                format!("$.pages[{i}].id"),
                format!("Duplicate page ID: '{id}'"),
            )));
        }
    }

    let breakpoint_names: HashSet<String> = theme
        .get("breakpoints")
        .and_then(|v| v.as_object())
        .map(|obj| obj.keys().cloned().collect())
        .unwrap_or_default();

    for (i, page) in pages.iter().enumerate() {
        let Some(regions) = page.get("regions").and_then(|v| v.as_array()) else {
            continue;
        };
        for (j, region) in regions.iter().enumerate() {
            let Some(responsive) = region.get("responsive").and_then(|v| v.as_object()) else {
                continue;
            };
            for bp_key in responsive.keys() {
                if !breakpoint_names.contains(bp_key) {
                    diags.push(metadata::with_metadata(LintDiagnostic::warning(
                        crate::LintCode::W711,
                        PASS,
                        format!("$.pages[{i}].regions[{j}].responsive.{bp_key}"),
                        format!(
                            "Responsive breakpoint '{bp_key}' not declared in theme breakpoints"
                        ),
                    )));
                }
            }
        }
    }
}

fn lint_cross_artifact(theme: &Value, definition: &Value, diags: &mut Vec<LintDiagnostic>) {
    let item_keys = token_refs::collect_definition_item_keys(definition);
    let item_data_types = collect_definition_item_data_types(definition);

    if let Some(items) = theme.get("items").and_then(|v| v.as_object()) {
        for (key, block) in items {
            if !item_keys.contains(key.as_str()) {
                diags.push(metadata::with_metadata(LintDiagnostic::warning(
                    crate::LintCode::W705,
                    PASS,
                    format!("$.items.{key}"),
                    format!("Theme item override '{key}' does not match any definition item path"),
                )));
            }
            if let Some(data_type) = item_data_types.get(key.as_str()) {
                lint_theme_widget_block(
                    block,
                    data_type,
                    &format!("$.items.{key}.widget"),
                    "Theme item override",
                    diags,
                );
            }
        }
    }

    if let Some(pages) = theme.get("pages").and_then(|v| v.as_array()) {
        for (i, page) in pages.iter().enumerate() {
            let Some(regions) = page.get("regions").and_then(|v| v.as_array()) else {
                continue;
            };
            for (j, region) in regions.iter().enumerate() {
                if let Some(key) = region.get("key").and_then(|v| v.as_str())
                    && !item_keys.contains(key)
                {
                    diags.push(metadata::with_metadata(LintDiagnostic::warning(
                        crate::LintCode::W706,
                        PASS,
                        format!("$.pages[{i}].regions[{j}].key"),
                        format!("Page region key '{key}' does not match any definition item path"),
                    )));
                }
            }
        }
    }

    if let Some(target_url) = theme
        .get("targetDefinition")
        .and_then(|v| v.get("url"))
        .and_then(|v| v.as_str())
        && let Some(def_url) = definition.get("url").and_then(|v| v.as_str())
        && target_url != def_url
    {
        diags.push(metadata::with_metadata(LintDiagnostic::warning(
            crate::LintCode::W707,
            PASS,
            "$.targetDefinition.url",
            format!(
                "Theme targets definition URL '{target_url}' but provided definition has URL '{def_url}'"
            ),
        )));
    }
}

fn collect_definition_item_data_types(definition: &Value) -> HashMap<String, String> {
    let mut lookup = HashMap::new();
    visit_definition_items_from_document(definition, &mut |ctx| {
        let Some(data_type) = ctx.item.get("dataType").and_then(Value::as_str) else {
            return;
        };
        lookup.insert(ctx.dotted_path.clone(), data_type.to_string());
        lookup.insert(ctx.key.to_string(), data_type.to_string());
    });
    lookup
}

fn lint_selector_widget_compatibility(theme: &Value, diags: &mut Vec<LintDiagnostic>) {
    let Some(selectors) = theme.get("selectors").and_then(Value::as_array) else {
        return;
    };

    for (index, selector) in selectors.iter().enumerate() {
        let Some(data_type) = selector
            .get("match")
            .and_then(|v| v.get("dataType"))
            .and_then(Value::as_str)
        else {
            continue;
        };
        let Some(apply) = selector.get("apply") else {
            continue;
        };
        lint_theme_widget_block(
            apply,
            data_type,
            &format!("$.selectors[{index}].apply.widget"),
            "Theme selector",
            diags,
        );
    }
}

fn lint_theme_widget_block(
    block: &Value,
    data_type: &str,
    path: &str,
    source: &str,
    diags: &mut Vec<LintDiagnostic>,
) {
    let Some(widget) = block.get("widget").and_then(Value::as_str) else {
        return;
    };
    if widget == "none" || widget.starts_with("x-") {
        return;
    }

    let compatibility = classify_theme_widget_compatibility(block, widget, data_type);
    if !matches!(
        compatibility,
        Compatibility::Incompatible | Compatibility::CompatibleWithWarning
    ) {
        return;
    }

    let message = if widget == "Select" && data_type == "multiChoice" {
        format!(
            "{source} widget 'Select' targets multiChoice data but does not set widgetConfig.multiple: true"
        )
    } else if compatibility == Compatibility::CompatibleWithWarning {
        format!("{source} widget '{widget}' is loosely compatible with dataType '{data_type}'")
    } else {
        format!("{source} widget '{widget}' is incompatible with dataType '{data_type}'")
    };

    diags.push(metadata::with_metadata(LintDiagnostic::warning(
        crate::LintCode::W712,
        PASS,
        path,
        message,
    )));
}

fn classify_theme_widget_compatibility(
    block: &Value,
    widget: &str,
    data_type: &str,
) -> Compatibility {
    if widget == "Select" && data_type == "multiChoice" {
        return if block
            .get("widgetConfig")
            .and_then(|v| v.get("multiple"))
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            Compatibility::Compatible
        } else {
            Compatibility::Incompatible
        };
    }

    classify_compatibility(widget, data_type)
}

#[cfg(test)]
mod tests;

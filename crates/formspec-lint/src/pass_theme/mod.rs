//! Pass 6: Theme document semantic checks (W700-W711, E710).
#![allow(clippy::missing_docs_in_private_items)]

mod token_refs;
mod token_registry;
mod value_validators;

use std::collections::HashSet;

use serde_json::Value;

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

    if let Some(items) = theme.get("items").and_then(|v| v.as_object()) {
        for key in items.keys() {
            if !item_keys.contains(key.as_str()) {
                diags.push(metadata::with_metadata(LintDiagnostic::warning(
                    crate::LintCode::W705,
                    PASS,
                    format!("$.items.{key}"),
                    format!(
                        "Theme item override '{key}' does not match any definition item path"
                    ),
                )));
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

#[cfg(test)]
mod tests;

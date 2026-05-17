//! `$token.*` reference extraction and integrity checks (W704).

use std::collections::HashSet;

use formspec_core::visit_definition_items_from_document;
use serde_json::Value;

use crate::metadata;
use crate::types::LintDiagnostic;

use super::PASS;

/// Extract all `$token.X` references from a string (token name after `$token.`).
pub(crate) fn extract_token_refs(text: &str) -> Vec<&str> {
    let mut refs = Vec::new();
    let mut search_from = 0;
    while let Some(pos) = text[search_from..].find("$token.") {
        let abs_pos = search_from + pos;
        let name_start = abs_pos + 7;
        if name_start >= text.len() {
            break;
        }
        let name_end = text[name_start..]
            .find(|c: char| {
                c.is_whitespace()
                    || c == ','
                    || c == ';'
                    || c == '\''
                    || c == '"'
                    || c == ')'
                    || c == '}'
            })
            .map_or(text.len(), |e| name_start + e);
        if name_end > name_start {
            refs.push(&text[name_start..name_end]);
        }
        search_from = name_end;
    }
    refs
}

/// Collect item keys and dotted paths from a definition item tree.
pub(crate) fn collect_definition_item_keys(definition: &Value) -> HashSet<String> {
    let mut keys = HashSet::new();
    visit_definition_items_from_document(definition, &mut |ctx| {
        keys.insert(ctx.dotted_path.clone());
        keys.insert(ctx.key.to_string());
    });
    keys
}

fn walk_token_refs(
    value: &Value,
    path: &str,
    token_names: &HashSet<String>,
    diags: &mut Vec<LintDiagnostic>,
) {
    match value {
        Value::String(s) => {
            for token_name in extract_token_refs(s) {
                if !token_names.contains(token_name) {
                    diags.push(metadata::with_metadata(LintDiagnostic::warning(
                        "W704",
                        PASS,
                        path,
                        format!(
                            "Token reference '$token.{token_name}' not found in declared tokens"
                        ),
                    )));
                }
            }
        }
        Value::Object(map) => {
            for (k, v) in map {
                walk_token_refs(v, &format!("{path}.{k}"), token_names, diags);
            }
        }
        Value::Array(arr) => {
            for (i, v) in arr.iter().enumerate() {
                walk_token_refs(v, &format!("{path}[{i}]"), token_names, diags);
            }
        }
        _ => {}
    }
}

/// Walk theme surfaces that may contain `$token.*` references (W704).
pub(crate) fn lint_token_reference_integrity(
    theme: &Value,
    token_names: &HashSet<String>,
    diags: &mut Vec<LintDiagnostic>,
) {
    if let Some(defaults) = theme.get("defaults") {
        walk_token_refs(defaults, "$.defaults", token_names, diags);
    }
    if let Some(selectors) = theme.get("selectors").and_then(|v| v.as_array()) {
        for (i, selector) in selectors.iter().enumerate() {
            if let Some(apply) = selector.get("apply") {
                walk_token_refs(
                    apply,
                    &format!("$.selectors[{i}].apply"),
                    token_names,
                    diags,
                );
            }
            if let Some(props) = selector.get("properties") {
                walk_token_refs(
                    props,
                    &format!("$.selectors[{i}].properties"),
                    token_names,
                    diags,
                );
            }
        }
    }
    if let Some(items) = theme.get("items").and_then(|v| v.as_object()) {
        for (key, block) in items {
            walk_token_refs(block, &format!("$.items.{key}"), token_names, diags);
        }
    }
}

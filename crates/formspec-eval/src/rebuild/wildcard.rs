//! Wildcard bind paths (`[*]`) — match concrete items and instantiate FEL expressions.
#![allow(clippy::missing_docs_in_private_items)]

use std::collections::HashMap;

use serde_json::Value;

use crate::types::{
    ExcludedValueMode, ItemInfo, NrbMode, WhitespaceMode, find_item_by_path_mut,
    internal_path_to_fel_path,
};

use super::item_tree::bool_or_string_expr;
use super::repeat_data::expand_wildcard_path;

/// Check if a bind path is a wildcard path (contains `[*]`).
pub(crate) fn is_wildcard_bind(path: &str) -> bool {
    path.contains("[*]")
}

/// Resolve a wildcard bind expression by replacing `[*]` references with
/// a concrete index. E.g., `$items[*].qty * $items[*].price` with index 2
/// becomes `$items[2].qty * $items[2].price`.
pub(crate) fn instantiate_wildcard_expr(expr: &str, base: &str, index: usize) -> String {
    let wildcard_pattern = format!("${}[*]", base);
    let concrete = format!("${}[{}]", base, index);
    expr.replace(&wildcard_pattern, &concrete)
}

/// Extract the base path from a wildcard bind path.
/// E.g., `items[*].total` → `items`.
pub(crate) fn wildcard_base(path: &str) -> Option<&str> {
    path.find("[*]").map(|pos| &path[..pos])
}

/// Apply wildcard binds to expanded concrete items.
///
/// For each wildcard bind (path contains `[*]`), find matching concrete items
/// and set their bind properties (calculate, constraint, etc.) with the
/// wildcard expression instantiated for their concrete index.
pub(crate) fn apply_wildcard_binds(
    items: &mut [ItemInfo],
    binds: Option<&Value>,
    data: &HashMap<String, Value>,
) {
    let wildcard_binds = collect_wildcard_binds(binds);
    if wildcard_binds.is_empty() {
        return;
    }

    for (bind_path, bind_obj) in &wildcard_binds {
        let concrete_paths = {
            let from_data = expand_wildcard_path(bind_path, data);
            if from_data.is_empty() {
                collect_matching_item_paths(items, bind_path)
            } else {
                from_data
            }
        };
        for concrete_path in concrete_paths {
            if let Some(item) = find_item_by_path_mut(items, &concrete_path) {
                let inst = |expr: &str| -> String {
                    instantiate_concrete_expr(expr, bind_path, &concrete_path)
                };
                if let Some(expr) = bind_obj.get("calculate").and_then(|v| v.as_str()) {
                    item.calculate = Some(inst(expr));
                }
                if let Some(expr) = bind_obj.get("constraint").and_then(|v| v.as_str()) {
                    item.constraint = Some(inst(expr));
                }
                if let Some(msg) = bind_obj.get("constraintMessage").and_then(|v| v.as_str()) {
                    item.constraint_message = Some(msg.to_string());
                }
                if let Some(expr) = bind_obj.get("relevant").and_then(bool_or_string_expr) {
                    item.relevance = Some(inst(&expr));
                }
                if let Some(expr) = bind_obj.get("required").and_then(bool_or_string_expr) {
                    item.required_expr = Some(inst(&expr));
                }
                if let Some(expr) = bind_obj.get("readonly").and_then(bool_or_string_expr) {
                    item.readonly_expr = Some(inst(&expr));
                }
                if let Some(ws) = bind_obj.get("whitespace").and_then(|v| v.as_str()) {
                    item.whitespace = Some(WhitespaceMode::from_str_lossy(ws));
                }
                if let Some(nrb) = bind_obj.get("nonRelevantBehavior").and_then(|v| v.as_str()) {
                    item.nrb = Some(NrbMode::from_str_lossy(nrb));
                }
                if let Some(ev) = bind_obj.get("excludedValue").and_then(|v| v.as_str()) {
                    item.excluded_value = ExcludedValueMode::parse_wire(ev);
                }
                if let Some(default_val) = bind_obj.get("default") {
                    match default_val {
                        Value::String(s) if s.starts_with('=') => {
                            item.default_expression = Some(inst(&s[1..]));
                            item.default_value = None;
                        }
                        other => {
                            item.default_value = Some(other.clone());
                            item.default_expression = None;
                        }
                    }
                }
            }
        }
    }
}

fn collect_matching_item_paths(items: &[ItemInfo], wildcard_path: &str) -> Vec<String> {
    let mut paths = Vec::new();
    collect_matching_item_paths_inner(items, wildcard_path, &mut paths);
    paths
}

fn collect_matching_item_paths_inner(
    items: &[ItemInfo],
    wildcard_path: &str,
    out: &mut Vec<String>,
) {
    for item in items {
        if wildcard_path_matches(wildcard_path, &item.path) {
            out.push(item.path.clone());
        }
        collect_matching_item_paths_inner(&item.children, wildcard_path, out);
    }
}

fn wildcard_path_matches(pattern: &str, path: &str) -> bool {
    let parts: Vec<&str> = pattern.split("[*]").collect();
    if parts.len() == 1 {
        return pattern == path;
    }

    let mut remainder = path;
    for (index, part) in parts.iter().enumerate() {
        if index == 0 {
            let Some(stripped) = remainder.strip_prefix(part) else {
                return false;
            };
            remainder = stripped;
            continue;
        }

        if !remainder.starts_with('[') {
            return false;
        }
        let Some(end) = remainder.find(']') else {
            return false;
        };
        if remainder[1..end].parse::<usize>().is_err() {
            return false;
        }
        remainder = &remainder[end + 1..];
        let Some(stripped) = remainder.strip_prefix(part) else {
            return false;
        };
        remainder = stripped;
    }

    remainder.is_empty()
}

fn instantiate_concrete_expr(expr: &str, wildcard_path: &str, concrete_path: &str) -> String {
    let wildcard_parts: Vec<&str> = wildcard_path.split('.').collect();
    let concrete_parts: Vec<&str> = concrete_path.split('.').collect();
    let mut result = expr.to_string();
    let mut wildcard_prefix = Vec::new();
    let mut concrete_prefix = Vec::new();

    for (wildcard_part, concrete_part) in wildcard_parts.iter().zip(concrete_parts.iter()) {
        wildcard_prefix.push(*wildcard_part);
        concrete_prefix.push(*concrete_part);
        if !wildcard_part.contains("[*]") {
            continue;
        }
        let wildcard_ref = format!("${}", wildcard_prefix.join("."));
        let concrete_ref = format!("${}", internal_path_to_fel_path(&concrete_prefix.join(".")));
        result = result.replace(&wildcard_ref, &concrete_ref);
    }

    result
}

/// Collect wildcard bind entries from the binds object/array.
fn collect_wildcard_binds(binds: Option<&Value>) -> Vec<(String, serde_json::Map<String, Value>)> {
    let mut merged: HashMap<String, serde_json::Map<String, Value>> = HashMap::new();
    match binds {
        Some(Value::Object(map)) => {
            for (path, val) in map {
                if is_wildcard_bind(path)
                    && let Some(obj) = val.as_object()
                {
                    merged.insert(path.clone(), obj.clone());
                }
            }
        }
        Some(Value::Array(arr)) => {
            for bind in arr {
                if let Some(path) = bind.get("path").and_then(|v| v.as_str())
                    && is_wildcard_bind(path)
                    && let Some(obj) = bind.as_object()
                {
                    let entry = merged.entry(path.to_string()).or_default();
                    for (field, value) in obj {
                        entry.insert(field.clone(), value.clone());
                    }
                }
            }
        }
        _ => {}
    }
    merged.into_iter().collect()
}

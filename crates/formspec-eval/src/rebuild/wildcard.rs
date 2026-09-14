//! Wildcard bind paths (`[*]`) — match concrete items and instantiate FEL expressions.
#![allow(clippy::missing_docs_in_private_items)]

use serde_json::Value;

use crate::types::{ItemInfo, internal_path_to_fel_path, strip_indices};

use super::bind_targets::BindTargets;

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

/// Instantiate `[*]` Bind expressions on expanded repeat instances.
///
/// Rebuild already merged every Bind spelling onto the template Item (Core §4.3.1),
/// so concrete instances carry the effective properties. An expression property
/// whose winning Bind was spelled with `[*]` refers to rows as `$group[*].field`;
/// here each instance's copy is rewritten to its concrete index. Properties won by
/// an exact-path Bind or the Item itself stay as authored.
pub(crate) fn apply_wildcard_binds(items: &mut [ItemInfo], binds: Option<&Value>) {
    let targets = BindTargets::new(binds);
    instantiate_instance_expressions(items, &targets);
}

fn instantiate_instance_expressions(items: &mut [ItemInfo], targets: &BindTargets<'_>) {
    for item in items.iter_mut() {
        let template = strip_indices(&item.path);
        if template != item.path {
            let concrete = item.path.clone();
            let wildcard = |property: &str| {
                targets
                    .winning_path(&template, property)
                    .filter(|path| is_wildcard_bind(path))
            };
            let instantiate = |slot: &mut Option<String>, property: &str| {
                if let (Some(path), Some(expr)) = (wildcard(property), slot.as_deref()) {
                    *slot = Some(instantiate_concrete_expr(expr, path, &concrete));
                }
            };
            instantiate(&mut item.calculate, "calculate");
            instantiate(&mut item.constraint, "constraint");
            instantiate(&mut item.relevance, "relevant");
            instantiate(&mut item.required_expr, "required");
            instantiate(&mut item.readonly_expr, "readonly");
            instantiate(&mut item.default_expression, "default");
        }
        instantiate_instance_expressions(&mut item.children, targets);
    }
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

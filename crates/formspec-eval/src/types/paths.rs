//! Path normalization, tree lookup, and qualified repeat reference helpers.
#![allow(clippy::missing_docs_in_private_items)]

use super::item_tree::ItemInfo;
use std::collections::HashMap;

pub(crate) fn find_item_by_path<'a>(items: &'a [ItemInfo], path: &str) -> Option<&'a ItemInfo> {
    for item in items {
        if item.path == path {
            return Some(item);
        }
        if let Some(found) = find_item_by_path(&item.children, path) {
            return Some(found);
        }
    }
    None
}

pub(crate) fn find_item_by_path_mut<'a>(
    items: &'a mut [ItemInfo],
    path: &str,
) -> Option<&'a mut ItemInfo> {
    for item in items.iter_mut() {
        if item.path == path {
            return Some(item);
        }
        if let Some(found) = find_item_by_path_mut(&mut item.children, path) {
            return Some(found);
        }
    }
    None
}

use formspec_core::path_utils::{Path, PathSegment};

pub(crate) fn strip_indices(path: &str) -> String {
    Path::parse(path).strip_indices()
}

pub(crate) fn to_wildcard_path(path: &str) -> String {
    Path::parse(path).to_wildcard_string()
}

pub(crate) fn parent_path(path: &str) -> Option<String> {
    let p = Path::parse(path);
    if p.segments.is_empty() {
        return None;
    }
    Some(p.parent_string())
}

fn repeat_ancestors(path: &str) -> Vec<(String, String)> {
    let mut ancestors = Vec::new();
    let p = Path::parse(path);
    let mut current_segments = Vec::new();

    for seg in p.segments {
        current_segments.push(seg.clone());
        if let PathSegment::Indexed(_) = seg {
            // Found an indexed segment. The group name is the segment immediately preceding it.
            if current_segments.len() >= 2 {
                if let PathSegment::Exact(group_name) = &current_segments[current_segments.len() - 2] {
                    let prefix = Path {
                        segments: current_segments.clone(),
                    }
                    .to_string();
                    ancestors.push((group_name.clone(), prefix));
                }
            }
        }
    }

    ancestors
}

fn is_ident_start(ch: char) -> bool {
    ch == '_' || ch.is_ascii_alphabetic()
}

fn is_ident_continue(ch: char) -> bool {
    ch == '_' || ch.is_ascii_alphanumeric()
}

fn replace_qualified_group_ref(
    expression: &str,
    group_name: &str,
    concrete_prefix: &str,
) -> String {
    let needle = format!("${group_name}.");
    let mut result = String::new();
    let mut search_from = 0usize;

    while let Some(found) = expression[search_from..].find(&needle) {
        let start = search_from + found;
        let field_start = start + needle.len();
        let Some(first_char) = expression[field_start..].chars().next() else {
            break;
        };
        if !is_ident_start(first_char) {
            result.push_str(&expression[search_from..field_start]);
            search_from = field_start;
            continue;
        }

        let mut field_end = field_start + first_char.len_utf8();
        for ch in expression[field_end..].chars() {
            if !is_ident_continue(ch) {
                break;
            }
            field_end += ch.len_utf8();
        }

        result.push_str(&expression[search_from..start]);
        result.push('$');
        result.push_str(concrete_prefix);
        result.push('.');
        result.push_str(&expression[field_start..field_end]);
        search_from = field_end;
    }

    result.push_str(&expression[search_from..]);
    result
}

pub(crate) fn internal_path_to_fel_path(path: &str) -> String {
    Path::parse(path).to_fel_string()
}

pub(crate) fn resolve_qualified_repeat_refs(expression: &str, current_item_path: &str) -> String {
    let mut normalized = expression.to_string();

    for (group_name, concrete_prefix) in repeat_ancestors(current_item_path).into_iter().rev() {
        let fel_prefix = internal_path_to_fel_path(&concrete_prefix);
        normalized = replace_qualified_group_ref(&normalized, &group_name, &fel_prefix);
    }

    normalized
}

pub(crate) fn collect_non_relevant(items: &[ItemInfo], out: &mut Vec<String>) {
    for item in items {
        if !item.relevant {
            out.push(item.path.clone());
        }
        collect_non_relevant(&item.children, out);
    }
}

pub(crate) fn collect_mip_state(
    items: &[ItemInfo],
    required: &mut HashMap<String, bool>,
    readonly: &mut HashMap<String, bool>,
) {
    for item in items {
        required.insert(item.path.clone(), item.required);
        readonly.insert(item.path.clone(), item.readonly);
        collect_mip_state(&item.children, required, readonly);
    }
}

/// Build a map from field path to data type string for type-aware coercion.
///
/// For indexed repeat paths like `group[0].field`, also registers the base
/// path `group.field` so that pre-expansion lookups succeed.
pub(crate) fn collect_data_types(items: &[ItemInfo]) -> HashMap<String, String> {
    let mut map = HashMap::new();
    collect_data_types_inner(items, &mut map);
    map
}

fn collect_data_types_inner(items: &[ItemInfo], map: &mut HashMap<String, String>) {
    for item in items {
        if let Some(ref dt) = item.data_type {
            map.insert(item.path.clone(), dt.clone());
            // Also map the base (un-indexed) path for repeat group children
            let base = strip_indices(&item.path);
            if base != item.path {
                map.insert(base, dt.clone());
            }
        }
        collect_data_types_inner(&item.children, map);
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;

    #[test]
    fn test_strip_indices() {
        assert_eq!(strip_indices("items[0].total"), "items.total");
        assert_eq!(strip_indices("a[1].b[2].c"), "a.b.c");
        assert_eq!(strip_indices("simple"), "simple");
        assert_eq!(strip_indices("naïve[0].café"), "naïve.café");
    }

    #[test]
    fn test_to_wildcard_path() {
        assert_eq!(to_wildcard_path("items[0].total"), "items[*].total");
        assert_eq!(to_wildcard_path("a[1].b[2].c"), "a[*].b[*].c");
        assert_eq!(to_wildcard_path("items[*].total"), "items[*].total");
        assert_eq!(to_wildcard_path("naïve[12].café"), "naïve[*].café");
    }

    #[test]
    fn qualified_repeat_refs_resolve_to_concrete_instance_paths() {
        assert_eq!(
            resolve_qualified_repeat_refs(
                "$line_items.qty * $line_items.price",
                "line_items[0].total",
            ),
            "$line_items[1].qty * $line_items[1].price",
        );
        assert_eq!(
            resolve_qualified_repeat_refs(
                "$qty * $unit_price * (1 - $orders.discount_pct / 100)",
                "orders[1].items[0].discounted_total",
            ),
            "$qty * $unit_price * (1 - $orders[2].discount_pct / 100)",
        );
    }
}

//! Path normalization and item-tree lookup.
#![allow(clippy::missing_docs_in_private_items)]

use super::item_tree::ItemInfo;
use formspec_core::path_utils::Path;
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

pub(crate) fn collect_non_relevant(items: &[ItemInfo], out: &mut Vec<String>) {
    for item in items {
        if !item.mip.relevant {
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
        required.insert(item.path.clone(), item.mip.required);
        readonly.insert(item.path.clone(), item.mip.readonly);
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
}

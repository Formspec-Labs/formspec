//! Phase 4: NRB (Non-Relevant Behavior) application.
#![allow(clippy::missing_docs_in_private_items)]

use serde_json::Value;
use std::collections::HashMap;

use crate::types::{
    ItemInfo, NrbMode, find_item_by_path, parent_path, strip_indices, to_wildcard_path,
};

/// Get the NRB mode for a given path using the lookup precedence:
/// exact path -> wildcard -> stripped indices -> parent -> definition default.
pub fn resolve_nrb(path: &str, items: &[ItemInfo], definition_default: &str) -> NrbMode {
    // Look up exact match in items
    if let Some(item) = find_item_by_path(items, path)
        && let Some(nrb) = item.nrb
    {
        return nrb;
    }

    // Try wildcard version (replace [N] with [*])
    let wildcard_path = to_wildcard_path(path);
    if wildcard_path != path
        && let Some(item) = find_item_by_path(items, &wildcard_path)
        && let Some(nrb) = item.nrb
    {
        return nrb;
    }

    // Try stripped indices version
    let stripped = strip_indices(path);
    if stripped != path
        && let Some(item) = find_item_by_path(items, &stripped)
        && let Some(nrb) = item.nrb
    {
        return nrb;
    }

    // Try parent path
    if let Some(parent) = parent_path(path) {
        return resolve_nrb(&parent, items, definition_default);
    }

    NrbMode::from_str_lossy(definition_default)
}

/// Apply NRB to non-relevant fields.
///
/// A node's mode is its own Bind's `nonRelevantBehavior`, else its nearest ancestor's, else the
/// Definition's: a group bound `empty` nulls its descendants, as the TypeScript engine's
/// `getResponse` does and as [`resolve_nrb`] resolves a path.
pub fn apply_nrb(
    values: &mut HashMap<String, Value>,
    items: &[ItemInfo],
    definition_default: &str,
) {
    let mut non_relevant = Vec::new();
    collect_non_relevant_with_nrb(
        items,
        NrbMode::from_str_lossy(definition_default),
        &mut non_relevant,
    );

    for (path, mode) in non_relevant {
        match mode {
            NrbMode::Remove => {
                values.remove(&path);
            }
            NrbMode::Empty => {
                values.insert(path, Value::Null);
            }
            NrbMode::Keep => {
                // Leave unchanged
            }
        }
    }
}

fn collect_non_relevant_with_nrb(
    items: &[ItemInfo],
    inherited: NrbMode,
    out: &mut Vec<(String, NrbMode)>,
) {
    for item in items {
        let mode = item.nrb.unwrap_or(inherited);
        if !item.mip.relevant && item.item_type != "display" {
            out.push((item.path.clone(), mode));
        }
        collect_non_relevant_with_nrb(&item.children, mode, out);
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;
    use crate::types::MipState;

    fn make_item(path: &str, nrb: Option<NrbMode>) -> ItemInfo {
        ItemInfo {
            key: path.split('.').last().unwrap_or(path).to_string(),
            path: path.to_string(),
            nrb,
            mip: MipState {
                relevant: false,
                ..Default::default()
            },
            ..Default::default()
        }
    }

    fn make_item_with_parent(path: &str, nrb: Option<NrbMode>, parent: &str) -> ItemInfo {
        let mut item = make_item(path, nrb);
        item.parent_path = Some(parent.to_string());
        item
    }

    #[test]
    fn nrb_resolve_exact_path_match() {
        let items = vec![make_item("items", Some(NrbMode::Keep))];
        let mode = resolve_nrb("items", &items, "remove");
        assert_eq!(
            mode,
            NrbMode::Keep,
            "exact path match should return item's NRB"
        );
    }

    #[test]
    fn nrb_resolve_wildcard_path_fallback() {
        let items = vec![make_item_with_parent(
            "items[*].total",
            Some(NrbMode::Keep),
            "items[*]",
        )];

        let mode = resolve_nrb("items[0].total", &items, "remove");
        assert_eq!(
            mode,
            NrbMode::Keep,
            "wildcard path items[*].total should match items[0].total"
        );
    }

    #[test]
    fn nrb_resolve_stripped_indices_fallback() {
        let items = vec![make_item_with_parent(
            "items.total",
            Some(NrbMode::Empty),
            "items",
        )];

        let mode = resolve_nrb("items[0].total", &items, "remove");
        assert_eq!(
            mode,
            NrbMode::Empty,
            "stripped-indices path items.total should match items[0].total"
        );
    }

    #[test]
    fn nrb_resolve_parent_path_fallback() {
        let items = vec![make_item("details", Some(NrbMode::Keep))];

        let mode = resolve_nrb("details.name", &items, "remove");
        assert_eq!(
            mode,
            NrbMode::Keep,
            "parent path 'details' NRB should apply to 'details.name'"
        );
    }

    #[test]
    fn nrb_resolve_definition_default_last_resort() {
        let items: Vec<ItemInfo> = vec![];

        let mode = resolve_nrb("totally.unknown.path", &items, "empty");
        assert_eq!(
            mode,
            NrbMode::Empty,
            "when no path matches, definition default must be used"
        );
    }

    #[test]
    fn nrb_resolve_precedence_exact_wins_over_wildcard() {
        let exact_item = make_item_with_parent("items[0].total", Some(NrbMode::Empty), "items[0]");
        let wildcard_item =
            make_item_with_parent("items[*].total", Some(NrbMode::Keep), "items[*]");

        let items = vec![exact_item, wildcard_item];

        let mode = resolve_nrb("items[0].total", &items, "remove");
        assert_eq!(
            mode,
            NrbMode::Empty,
            "exact path must take precedence over wildcard"
        );
    }
}

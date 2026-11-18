//! Expand repeatable groups into concrete indexed items from response data.
#![allow(clippy::missing_docs_in_private_items)]

use std::collections::HashMap;

use fel_core::exact_json::Value;
use formspec_core::BindTargets;

use crate::types::ItemInfo;

use crate::scope::{RowCounts, count_flat_rows};

/// Expand repeatable groups into concrete indexed instances based on data.
///
/// For each repeatable group, counts instances in data and clones the
/// template children N times with indexed paths: `group[0].child`, `group[1].child`.
pub fn expand_repeat_instances(items: &mut [ItemInfo], data: &HashMap<String, Value>) {
    let mut counts = RowCounts::new();
    count_flat_rows(data.keys(), &mut counts);
    expand_repeat_instances_counted(items, &mut counts);
}

fn rebase_item_paths(item: &mut ItemInfo, from: &str, to: &str) {
    if item.path == from {
        item.path = to.to_string();
    } else if let Some(relative) = item.path.strip_prefix(&format!("{from}.")) {
        item.path = format!("{to}.{relative}");
    }

    if let Some(parent_path) = item.parent_path.clone() {
        if parent_path == from {
            item.parent_path = Some(to.to_string());
        } else if let Some(relative) = parent_path.strip_prefix(&format!("{from}.")) {
            item.parent_path = Some(format!("{to}.{relative}"));
        }
    }

    for child in &mut item.children {
        rebase_item_paths(child, from, to);
    }
}

/// Expand rows from the flatten pass.
pub(crate) fn expand_repeat_instances_counted(items: &mut [ItemInfo], counts: &mut RowCounts) {
    for item in items.iter_mut() {
        if item.repeatable {
            let count = *counts.entry(item.path.clone()).or_default() as usize;
            if count > 0 {
                // Clone template children into concrete indexed instances
                let template_children = item.children.clone();
                let mut expanded = Vec::new();
                for i in 0..count {
                    for child in &template_children {
                        let mut concrete = child.clone();
                        let original_path = concrete.path.clone();
                        let indexed_path = format!("{}[{}].{}", item.path, i, child.key);
                        rebase_item_paths(&mut concrete, &original_path, &indexed_path);
                        concrete.parent_path = Some(format!("{}[{}]", item.path, i));
                        // Recursively expand nested repeatables
                        expand_repeat_instances_counted(
                            std::slice::from_mut(&mut concrete),
                            counts,
                        );
                        expanded.push(concrete);
                    }
                }
                item.children = expanded;
            } else {
                // Zero instances: clear template children so downstream phases
                // (validation, NRB) don't process un-indexed template paths.
                // The definition still holds the template; the item tree is
                // the evaluation-time expansion.
                item.children.clear();
            }
        } else {
            // Recurse into non-repeatable groups
            expand_repeat_instances_counted(&mut item.children, counts);
        }
    }
}

pub(crate) fn apply_indexed_binds(
    items: &mut [ItemInfo],
    binds: &BindTargets<'_, Value>,
    resolved: &mut fel_core::exact_json::Map<String, Value>,
) {
    for item in items {
        if let Some(bind) = binds.merged_concrete(&item.path) {
            super::item_tree::apply_bind(item, &bind);
            resolved.insert(item.path.clone(), Value::Object(bind));
        }
        apply_indexed_binds(&mut item.children, binds, resolved);
    }
}

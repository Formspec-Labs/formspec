//! Expand repeatable groups into concrete indexed items from response data.
#![allow(clippy::missing_docs_in_private_items)]

use std::collections::HashMap;

use serde_json::Value;

use crate::types::ItemInfo;

use super::repeat_data::detect_repeat_count;

/// Expand repeatable groups into concrete indexed instances based on data.
///
/// For each repeatable group, counts instances in data and clones the
/// template children N times with indexed paths: `group[0].child`, `group[1].child`.
pub fn expand_repeat_instances(items: &mut [ItemInfo], data: &HashMap<String, Value>) {
    expand_repeat_instances_inner(items, data, &HashMap::new());
}

/// [`expand_repeat_instances`] with row counts supplied beside the data (a row with no answered
/// field has no key in `data`); a repeat takes the larger of the two counts.
pub(crate) fn expand_repeat_instances_counted(
    items: &mut [ItemInfo],
    data: &HashMap<String, Value>,
    counts: &HashMap<String, u64>,
) {
    expand_repeat_instances_inner(items, data, counts);
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

fn expand_repeat_instances_inner(
    items: &mut [ItemInfo],
    data: &HashMap<String, Value>,
    counts: &HashMap<String, u64>,
) {
    for item in items.iter_mut() {
        if item.repeatable {
            let count = detect_repeat_count(&item.path, data)
                .max(counts.get(&item.path).copied().unwrap_or(0) as usize)
                .max(item.repeat_min.unwrap_or(0) as usize);
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
                        expand_repeat_instances_inner(std::slice::from_mut(&mut concrete), data, counts);
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
            expand_repeat_instances_inner(&mut item.children, data, counts);
        }
    }
}

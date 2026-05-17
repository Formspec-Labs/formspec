//! Dependency graph construction and connected-component grouping.
//!
//! Given a set of [`RecordedEntry`] values, builds a graph where edges
//! represent "entry B references a key that entry A created" or "entries
//! A and B target the same key". Connected components become
//! [`DependencyGroup`]s that must be accepted or rejected together.

use serde::Serialize;

use crate::extract::{RecordedEntry, extract_keys};

/// A dependency group — entries within a group are coupled and must be
/// accepted or rejected as a unit.
#[derive(Debug, Clone, Serialize)]
pub struct DependencyGroup {
    /// Indices into the original entries array.
    pub entries: Vec<usize>,
    /// Human-readable explanation of why these entries are grouped.
    pub reason: String,
}

/// Compute dependency groups from a set of recorded changeset entries.
pub fn compute_dependency_groups(entries: &[RecordedEntry]) -> Vec<DependencyGroup> {
    let n = entries.len();
    if n == 0 {
        return Vec::new();
    }
    if n == 1 {
        return vec![DependencyGroup {
            entries: vec![0],
            reason: "single entry".to_string(),
        }];
    }

    let entry_keys: Vec<_> = entries.iter().map(|e| extract_keys(e)).collect();

    let mut key_to_creator: std::collections::HashMap<&str, usize> =
        std::collections::HashMap::new();
    for (i, ek) in entry_keys.iter().enumerate() {
        for key in &ek.creates {
            key_to_creator.insert(key.as_str(), i);
        }
    }

    // Inlined union-find (path compression + union by rank) — avoids a graph crate dep
    // for a single connected-components pass over changeset entry indices.
    let mut parent: Vec<usize> = (0..n).collect();
    let mut rank: Vec<usize> = vec![0; n];

    fn find(parent: &mut [usize], x: usize) -> usize {
        let mut root = x;
        while parent[root] != root {
            root = parent[root];
        }
        let mut current = x;
        while parent[current] != root {
            let next = parent[current];
            parent[current] = root;
            current = next;
        }
        root
    }

    fn union(parent: &mut [usize], rank: &mut [usize], a: usize, b: usize) {
        let ra = find(parent, a);
        let rb = find(parent, b);
        if ra == rb {
            return;
        }
        if rank[ra] < rank[rb] {
            parent[ra] = rb;
        } else if rank[ra] > rank[rb] {
            parent[rb] = ra;
        } else {
            parent[rb] = ra;
            rank[ra] += 1;
        }
    }

    let mut shared_keys: std::collections::HashMap<usize, std::collections::BTreeSet<String>> =
        std::collections::HashMap::new();

    let do_union =
        |parent: &mut Vec<usize>,
         rank: &mut Vec<usize>,
         shared_keys: &mut std::collections::HashMap<usize, std::collections::BTreeSet<String>>,
         a: usize,
         b: usize,
         key: &str| {
            let ra = find(parent, a);
            let rb = find(parent, b);
            union(parent, rank, a, b);
            let new_root = find(parent, a);
            let mut merged: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
            if let Some(existing) = shared_keys.remove(&ra) {
                merged.extend(existing);
            }
            if let Some(existing) = shared_keys.remove(&rb) {
                merged.extend(existing);
            }
            merged.insert(key.to_string());
            shared_keys.insert(new_root, merged);
        };

    // Union via creates/references
    for (b, ek) in entry_keys.iter().enumerate() {
        for ref_key in &ek.references {
            if let Some(&a) = key_to_creator.get(ref_key.as_str()) {
                if a != b {
                    do_union(&mut parent, &mut rank, &mut shared_keys, a, b, ref_key);
                }
            }
        }
    }

    // Union via same-target
    let mut target_to_first: std::collections::HashMap<&str, usize> =
        std::collections::HashMap::new();
    for (i, ek) in entry_keys.iter().enumerate() {
        for target in &ek.targets {
            if let Some(&first) = target_to_first.get(target.as_str()) {
                if find(&mut parent, first) != find(&mut parent, i) {
                    do_union(&mut parent, &mut rank, &mut shared_keys, first, i, target);
                }
            } else {
                target_to_first.insert(target.as_str(), i);
            }
        }
    }

    let mut components: std::collections::HashMap<usize, Vec<usize>> =
        std::collections::HashMap::new();
    for i in 0..n {
        let root = find(&mut parent, i);
        components.entry(root).or_default().push(i);
    }

    let mut groups: Vec<DependencyGroup> = components
        .into_iter()
        .map(|(root, mut entries)| {
            entries.sort();
            let reason = if entries.len() == 1 {
                "independent entry".to_string()
            } else if let Some(keys) = shared_keys.get(&root) {
                let key_list: Vec<&str> = keys.iter().map(String::as_str).collect();
                format!("shared dependencies on: {}", key_list.join(", "))
            } else {
                "connected entries".to_string()
            };
            DependencyGroup { entries, reason }
        })
        .collect();

    groups.sort_by_key(|g| g.entries[0]);
    groups
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::extract::{RecordedCommand, RecordedEntry};
    use serde_json::json;

    fn entry(commands: Vec<Vec<RecordedCommand>>) -> RecordedEntry {
        RecordedEntry {
            commands,
            tool_name: None,
        }
    }

    fn cmd(cmd_type: &str, payload: serde_json::Value) -> RecordedCommand {
        RecordedCommand {
            cmd_type: cmd_type.to_string(),
            payload,
        }
    }

    #[test]
    fn empty_entries() {
        assert!(compute_dependency_groups(&[]).is_empty());
    }

    #[test]
    fn single_entry_single_group() {
        let entries = vec![entry(vec![vec![cmd(
            "definition.addItem",
            json!({"key": "name", "type": "text"}),
        )]])];
        let g = compute_dependency_groups(&entries);
        assert_eq!(g.len(), 1);
        assert_eq!(g[0].entries, vec![0]);
        assert_eq!(g[0].reason, "single entry");
    }

    #[test]
    fn two_independent_entries_two_groups() {
        let entries = vec![
            entry(vec![vec![cmd(
                "definition.addItem",
                json!({"key": "name", "type": "text"}),
            )]]),
            entry(vec![vec![cmd(
                "definition.addItem",
                json!({"key": "email", "type": "text"}),
            )]]),
        ];
        let g = compute_dependency_groups(&entries);
        assert_eq!(g.len(), 2);
        assert_eq!(g[0].entries, vec![0]);
        assert_eq!(g[1].entries, vec![1]);
    }

    #[test]
    fn two_entries_b_references_a() {
        let entries = vec![
            entry(vec![vec![cmd(
                "definition.addItem",
                json!({"key": "email", "type": "text"}),
            )]]),
            entry(vec![vec![cmd(
                "definition.setBind",
                json!({"path": "email", "properties": {"required": true}}),
            )]]),
        ];
        let g = compute_dependency_groups(&entries);
        assert_eq!(g.len(), 1);
        assert_eq!(g[0].entries, vec![0, 1]);
        assert!(g[0].reason.contains("email"));
    }

    #[test]
    fn three_entries_ab_dependent_c_independent() {
        let entries = vec![
            entry(vec![vec![cmd(
                "definition.addItem",
                json!({"key": "name", "type": "text"}),
            )]]),
            entry(vec![vec![cmd(
                "definition.addBind",
                json!({"path": "name", "properties": {"required": true}}),
            )]]),
            entry(vec![vec![cmd(
                "definition.addItem",
                json!({"key": "age", "type": "number"}),
            )]]),
        ];
        let g = compute_dependency_groups(&entries);
        assert_eq!(g.len(), 2);
        assert_eq!(g[0].entries, vec![0, 1]);
        assert_eq!(g[1].entries, vec![2]);
    }

    #[test]
    fn chain_dependency() {
        let entries = vec![
            entry(vec![vec![cmd(
                "definition.addItem",
                json!({"key": "price", "type": "number"}),
            )]]),
            entry(vec![
                vec![cmd(
                    "definition.addItem",
                    json!({"key": "quantity", "type": "number"}),
                )],
                vec![cmd(
                    "definition.setBind",
                    json!({"path": "quantity", "properties": {"constraint": "$price > 0"}}),
                )],
            ]),
            entry(vec![vec![cmd(
                "definition.setBind",
                json!({"path": "total", "properties": {"calculate": "$quantity * 2"}}),
            )]]),
        ];
        let g = compute_dependency_groups(&entries);
        assert_eq!(g.len(), 1);
        assert_eq!(g[0].entries, vec![0, 1, 2]);
    }

    #[test]
    fn component_references_create_dependency() {
        let entries = vec![
            entry(vec![vec![cmd(
                "definition.addItem",
                json!({"key": "email", "type": "text"}),
            )]]),
            entry(vec![vec![cmd(
                "component.setFieldWidget",
                json!({"fieldKey": "email", "widget": "email-input"}),
            )]]),
        ];
        let g = compute_dependency_groups(&entries);
        assert_eq!(g.len(), 1);
        assert_eq!(g[0].entries, vec![0, 1]);
    }

    #[test]
    fn component_add_node_bind() {
        let entries = vec![
            entry(vec![vec![cmd(
                "definition.addItem",
                json!({"key": "phone", "type": "text"}),
            )]]),
            entry(vec![vec![cmd(
                "component.addNode",
                json!({"pageIndex": 0, "node": {"bind": "phone", "type": "input"}}),
            )]]),
        ];
        let g = compute_dependency_groups(&entries);
        assert_eq!(g.len(), 1);
        assert_eq!(g[0].entries, vec![0, 1]);
    }

    #[test]
    fn fel_expression_dependency() {
        let entries = vec![
            entry(vec![vec![cmd(
                "definition.addItem",
                json!({"key": "subtotal", "type": "number"}),
            )]]),
            entry(vec![
                vec![cmd(
                    "definition.addItem",
                    json!({"key": "total", "type": "number"}),
                )],
                vec![cmd(
                    "definition.setBind",
                    json!({"path": "total", "properties": {"calculate": "$subtotal * 1.1"}}),
                )],
            ]),
        ];
        let g = compute_dependency_groups(&entries);
        assert_eq!(g.len(), 1);
        assert_eq!(g[0].entries, vec![0, 1]);
    }

    #[test]
    fn four_entries_two_pairs() {
        let entries = vec![
            entry(vec![vec![cmd(
                "definition.addItem",
                json!({"key": "name", "type": "text"}),
            )]]),
            entry(vec![vec![cmd(
                "definition.setBind",
                json!({"path": "name", "properties": {"required": true}}),
            )]]),
            entry(vec![vec![cmd(
                "definition.addItem",
                json!({"key": "age", "type": "number"}),
            )]]),
            entry(vec![vec![cmd(
                "definition.setBind",
                json!({"path": "age", "properties": {"constraint": "$age >= 0"}}),
            )]]),
        ];
        let g = compute_dependency_groups(&entries);
        assert_eq!(g.len(), 2);
        assert_eq!(g[0].entries, vec![0, 1]);
        assert_eq!(g[1].entries, vec![2, 3]);
    }

    #[test]
    fn reason_includes_shared_keys() {
        let entries = vec![
            entry(vec![vec![cmd(
                "definition.addItem",
                json!({"key": "email", "type": "text"}),
            )]]),
            entry(vec![vec![cmd(
                "definition.addBind",
                json!({"path": "email", "properties": {"required": true}}),
            )]]),
        ];
        let g = compute_dependency_groups(&entries);
        assert_eq!(g.len(), 1);
        assert!(g[0].reason.contains("email"));
    }

    // Edge #1: Variable scope
    #[test]
    fn variable_scope_groups_with_key_creator() {
        let entries = vec![
            entry(vec![vec![cmd(
                "definition.addItem",
                json!({"key": "address", "type": "group"}),
            )]]),
            entry(vec![vec![cmd(
                "definition.addVariable",
                json!({"name": "addrTotal", "expression": "42", "scope": "address"}),
            )]]),
        ];
        let g = compute_dependency_groups(&entries);
        assert_eq!(g.len(), 1, "variable scope should group with key creator");
        assert_eq!(g[0].entries, vec![0, 1]);
    }

    // Edge #2: optionSet/options same-target
    #[test]
    fn option_set_and_options_on_same_field_grouped() {
        let entries = vec![
            entry(vec![vec![cmd(
                "definition.setItemProperty",
                json!({"path": "color", "property": "optionSet", "value": "colors"}),
            )]]),
            entry(vec![vec![cmd(
                "definition.setFieldOptions",
                json!({"path": "color", "options": [{"value": "red", "label": "Red"}]}),
            )]]),
        ];
        let g = compute_dependency_groups(&entries);
        assert_eq!(
            g.len(),
            1,
            "optionSet and options on same field should be grouped"
        );
        assert_eq!(g[0].entries, vec![0, 1]);
    }

    // Edge #3: calculate/readonly same-target
    #[test]
    fn calculate_and_readonly_on_same_field_grouped() {
        let entries = vec![
            entry(vec![vec![cmd(
                "definition.setBind",
                json!({"path": "total", "properties": {"calculate": "$a + $b"}}),
            )]]),
            entry(vec![vec![cmd(
                "definition.setBind",
                json!({"path": "total", "properties": {"readonly": "true()"}}),
            )]]),
        ];
        let g = compute_dependency_groups(&entries);
        assert_eq!(
            g.len(),
            1,
            "calculate and readonly on same field should be grouped"
        );
        assert_eq!(g[0].entries, vec![0, 1]);
    }

    // Edge #4: relevant/nonRelevantBehavior same-target
    #[test]
    fn relevant_and_non_relevant_behavior_grouped() {
        let entries = vec![
            entry(vec![vec![cmd(
                "definition.addBind",
                json!({"path": "age", "properties": {"relevant": "$show_age"}}),
            )]]),
            entry(vec![vec![cmd(
                "definition.setBind",
                json!({"path": "age", "properties": {"nonRelevantBehavior": "empty"}}),
            )]]),
        ];
        let g = compute_dependency_groups(&entries);
        assert_eq!(
            g.len(),
            1,
            "relevant and nonRelevantBehavior on same path should be grouped"
        );
        assert_eq!(g[0].entries, vec![0, 1]);
    }

    // Regression: shared reference to pre-existing key must NOT cause grouping
    // (only shared TARGETS should group — two readers don't depend on each other)
    #[test]
    fn shared_reference_to_existing_key_stays_separate() {
        let entries = vec![
            // Entry 0: setBind on "total" with calculate referencing pre-existing "price"
            entry(vec![vec![cmd(
                "definition.setBind",
                json!({"path": "total", "properties": {"calculate": "$price * $qty"}}),
            )]]),
            // Entry 1: theme override referencing pre-existing "price" (no target)
            entry(vec![vec![cmd(
                "theme.setItemOverride",
                json!({"itemKey": "price", "property": "widget", "value": "currency"}),
            )]]),
        ];
        let g = compute_dependency_groups(&entries);
        // These share a reference to "price" but neither CREATES it and they have different targets.
        // Entry 0 targets "total", Entry 1 has no target. They should be separate.
        assert_eq!(
            g.len(),
            2,
            "shared reference without shared target should not group"
        );
    }

    // Edge #6: Theme item override
    #[test]
    fn theme_item_override_groups_with_key_creator() {
        let entries = vec![
            entry(vec![vec![cmd(
                "definition.addItem",
                json!({"key": "email", "type": "text"}),
            )]]),
            entry(vec![vec![cmd(
                "theme.setItemOverride",
                json!({"itemKey": "email", "property": "widget", "value": "email-input"}),
            )]]),
        ];
        let g = compute_dependency_groups(&entries);
        assert_eq!(
            g.len(),
            1,
            "theme item override should group with key creator"
        );
        assert_eq!(g[0].entries, vec![0, 1]);
    }
}

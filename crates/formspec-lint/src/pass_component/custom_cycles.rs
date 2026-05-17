//! Custom component reference cycle detection (E807).

use std::collections::{HashMap, HashSet};

use serde_json::Value;

use crate::metadata;
use crate::types::LintDiagnostic;

use super::PASS;

fn collect_component_refs(node: &Value, custom_names: &HashSet<&str>, refs: &mut HashSet<String>) {
    let comp_type = node.get("component").and_then(|v| v.as_str()).unwrap_or("");
    if custom_names.contains(comp_type) {
        refs.insert(comp_type.to_string());
    }
    if let Some(children) = node.get("children").and_then(|v| v.as_array()) {
        for child in children {
            collect_component_refs(child, custom_names, refs);
        }
    }
}

fn detect_custom_cycles(
    node: &str,
    graph: &HashMap<&str, HashSet<String>>,
    visited: &mut HashSet<String>,
    in_stack: &mut HashSet<String>,
    cycles: &mut Vec<(String, String)>,
) {
    visited.insert(node.to_string());
    in_stack.insert(node.to_string());

    if let Some(deps) = graph.get(node) {
        for dep in deps {
            if !visited.contains(dep.as_str()) {
                detect_custom_cycles(dep, graph, visited, in_stack, cycles);
            } else if in_stack.contains(dep.as_str()) {
                cycles.push((node.to_string(), dep.clone()));
            }
        }
    }

    in_stack.remove(node);
}

/// Detect cycles in the custom component reference graph.
pub(crate) fn lint_custom_component_cycles(
    custom_defs: &serde_json::Map<String, Value>,
    custom_names: &HashSet<&str>,
    diags: &mut Vec<LintDiagnostic>,
) {
    let mut graph: HashMap<&str, HashSet<String>> = HashMap::new();
    for (name, def) in custom_defs {
        let mut refs = HashSet::new();
        if let Some(sub_tree) = def.get("tree") {
            collect_component_refs(sub_tree, custom_names, &mut refs);
        }
        graph.insert(name.as_str(), refs);
    }

    let mut visited = HashSet::new();
    let mut in_stack = HashSet::new();
    let mut cycles = Vec::new();
    for &name in graph.keys() {
        if !visited.contains(name) {
            detect_custom_cycles(name, &graph, &mut visited, &mut in_stack, &mut cycles);
        }
    }
    for (from, to) in cycles {
        diags.push(metadata::with_metadata(LintDiagnostic::error(
            crate::LintCode::E807,
            PASS,
            format!("$.components.{from}"),
            format!("Custom component reference cycle: '{from}' -> '{to}'"),
        )));
    }
}

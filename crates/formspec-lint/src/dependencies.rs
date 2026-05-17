//! Pass 5: Dependency analysis — builds a dependency graph from compiled expressions and detects cycles via DFS.
//!
//! Only dataflow expressions (`bind_target = Some(key)`) create graph edges.
//! Constraint expressions are excluded since they allow self-reference without
//! creating a dataflow dependency.
//!
//! Graph building, DFS cycle detection, and diagnostic emission are internal.
#![allow(clippy::missing_docs_in_private_items)]

use std::collections::{HashMap, HashSet};

use formspec_core::get_fel_dependencies;

use crate::expressions::CompiledExpression;
use crate::types::LintDiagnostic;

/// Analyze compiled expressions for dependency cycles.
///
/// Builds a directed graph where each bind key points to the set of bind keys
/// its expression references. Runs DFS cycle detection and emits one E500
/// diagnostic per unique cycle (canonically deduplicated).
pub fn analyze_dependencies(compiled: &[CompiledExpression]) -> Vec<LintDiagnostic> {
    let (graph, path_map) = build_graph(compiled);
    let cycles = detect_cycles(&graph);
    emit_diagnostics(&cycles, &path_map)
}

/// Map from bind key → set of bind keys it depends on, plus bind key → expression path.
fn build_graph(
    compiled: &[CompiledExpression],
) -> (HashMap<String, HashSet<String>>, HashMap<String, String>) {
    let mut graph: HashMap<String, HashSet<String>> = HashMap::new();
    let mut path_map: HashMap<String, String> = HashMap::new();

    for expr in compiled {
        let bind_key = match &expr.bind_target {
            Some(key) => key,
            None => continue, // constraint — no dataflow edge
        };

        let deps = get_fel_dependencies(&expr.expression);
        let base_keys: HashSet<String> = deps.iter().map(|dep| base_key(dep).to_string()).collect();

        graph.entry(bind_key.clone()).or_default().extend(base_keys);
        path_map
            .entry(bind_key.clone())
            .or_insert_with(|| expr.expression_path.clone());
    }

    (graph, path_map)
}

/// Extract the first path segment (before any `.` or `[`).
fn base_key(dep: &str) -> &str {
    let dot = dep.find('.');
    let bracket = dep.find('[');
    match (dot, bracket) {
        (Some(d), Some(b)) => &dep[..d.min(b)],
        (Some(d), None) => &dep[..d],
        (None, Some(b)) => &dep[..b],
        (None, None) => dep,
    }
}

// ── Cycle detection ─────────────────────────────────────────────

/// DFS-based cycle detection. Returns all unique cycles, canonically deduplicated.
fn detect_cycles(graph: &HashMap<String, HashSet<String>>) -> Vec<Vec<String>> {
    let mut visited = HashSet::new();
    let mut stack = Vec::new();
    let mut on_stack = HashSet::new();
    let mut raw_cycles = Vec::new();

    for key in graph.keys() {
        if !visited.contains(key.as_str()) {
            dfs(
                key,
                graph,
                &mut visited,
                &mut stack,
                &mut on_stack,
                &mut raw_cycles,
            );
        }
    }

    dedup_cycles(raw_cycles)
}

fn dfs(
    node: &str,
    graph: &HashMap<String, HashSet<String>>,
    visited: &mut HashSet<String>,
    stack: &mut Vec<String>,
    on_stack: &mut HashSet<String>,
    cycles: &mut Vec<Vec<String>>,
) {
    visited.insert(node.to_string());
    stack.push(node.to_string());
    on_stack.insert(node.to_string());

    if let Some(deps) = graph.get(node) {
        for dep in deps {
            if !visited.contains(dep.as_str()) {
                if graph.contains_key(dep.as_str()) {
                    dfs(dep, graph, visited, stack, on_stack, cycles);
                }
            } else if on_stack.contains(dep.as_str()) {
                // Found a cycle — extract the cycle path from the stack.
                let cycle_start = stack.iter().position(|n| n == dep).unwrap();
                let cycle: Vec<String> = stack[cycle_start..].to_vec();
                cycles.push(cycle);
            }
        }
    }

    stack.pop();
    on_stack.remove(node);
}

// ── Canonical dedup ─────────────────────────────────────────────

/// Normalize each cycle by rotating to the lexicographic minimum element,
/// then deduplicate.
fn dedup_cycles(raw: Vec<Vec<String>>) -> Vec<Vec<String>> {
    let mut seen: HashSet<Vec<String>> = HashSet::new();
    let mut unique = Vec::new();

    for cycle in raw {
        let canonical = canonicalize(&cycle);
        if seen.insert(canonical.clone()) {
            unique.push(canonical);
        }
    }

    unique
}

/// Rotate a cycle so the lexicographically smallest element is first.
fn canonicalize(cycle: &[String]) -> Vec<String> {
    if cycle.is_empty() {
        return Vec::new();
    }
    let min_pos = cycle
        .iter()
        .enumerate()
        .min_by_key(|(_, s)| s.as_str())
        .map(|(i, _)| i)
        .unwrap_or(0);

    let mut rotated = Vec::with_capacity(cycle.len());
    rotated.extend_from_slice(&cycle[min_pos..]);
    rotated.extend_from_slice(&cycle[..min_pos]);
    rotated
}

// ── Diagnostics ─────────────────────────────────────────────────

fn emit_diagnostics(
    cycles: &[Vec<String>],
    path_map: &HashMap<String, String>,
) -> Vec<LintDiagnostic> {
    cycles
        .iter()
        .map(|cycle| {
            let first = &cycle[0];
            let path = path_map
                .get(first)
                .cloned()
                .unwrap_or_else(|| format!("$.binds.{first}"));

            let chain: Vec<&str> = cycle.iter().map(|s| s.as_str()).collect();
            let message = format!(
                "Dependency cycle detected: {} \u{2192} {}",
                chain.join(" \u{2192} "),
                chain[0],
            );

            crate::metadata::with_metadata(LintDiagnostic::error(crate::LintCode::E500, 5, path, message))
        })
        .collect()
}

// ── Tests ───────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;
    use crate::expressions::CompiledExpression;

    fn expr(bind_target: &str, expression: &str) -> CompiledExpression {
        CompiledExpression {
            expression: expression.to_string(),
            expression_path: format!("$.binds.{bind_target}.calculate"),
            bind_target: Some(bind_target.to_string()),
        }
    }

    fn constraint_expr(expression: &str) -> CompiledExpression {
        CompiledExpression {
            expression: expression.to_string(),
            expression_path: "$.binds.age.constraint".to_string(),
            bind_target: None,
        }
    }

    #[test]
    fn no_cycle_produces_no_diagnostics() {
        // a → b → c (chain, no cycle)
        let compiled = vec![expr("a", "$b + 1"), expr("b", "$c + 1"), expr("c", "42")];
        let diags = analyze_dependencies(&compiled);
        assert!(
            diags.is_empty(),
            "Acyclic graph should produce no diagnostics"
        );
    }

    #[test]
    fn simple_two_node_cycle() {
        let compiled = vec![expr("a", "$b + 1"), expr("b", "$a + 1")];
        let diags = analyze_dependencies(&compiled);
        assert_eq!(diags.len(), 1, "Expected exactly 1 E500 for a↔b cycle");
        assert_eq!(diags[0].code, "E500");
        assert_eq!(diags[0].pass, 5);
        assert!(diags[0].message.contains("Dependency cycle detected"));
        // Both 'a' and 'b' should appear in the message
        assert!(diags[0].message.contains('a'));
        assert!(diags[0].message.contains('b'));
    }

    #[test]
    fn self_cycle() {
        let compiled = vec![expr("a", "$a + 1")];
        let diags = analyze_dependencies(&compiled);
        assert_eq!(diags.len(), 1, "Self-reference should produce 1 E500");
        assert!(diags[0].message.contains('a'));
    }

    #[test]
    fn constraint_excluded_from_graph() {
        // Constraint references self — should NOT create a cycle
        let compiled = vec![expr("age", "18"), constraint_expr("$ >= 0 and $age > 0")];
        let diags = analyze_dependencies(&compiled);
        assert!(
            diags.is_empty(),
            "Constraint expressions should not participate in dependency graph"
        );
    }

    #[test]
    fn cycle_dedup_same_cycle_from_multiple_starts() {
        // a → b → a — DFS from both 'a' and 'b' should still produce 1 diagnostic
        let compiled = vec![expr("a", "$b"), expr("b", "$a")];
        let diags = analyze_dependencies(&compiled);
        assert_eq!(
            diags.len(),
            1,
            "Same cycle discovered from multiple DFS starts should be deduplicated"
        );
    }

    #[test]
    fn three_node_cycle() {
        let compiled = vec![expr("a", "$b"), expr("b", "$c"), expr("c", "$a")];
        let diags = analyze_dependencies(&compiled);
        assert_eq!(diags.len(), 1, "Expected exactly 1 E500 for a→b→c→a cycle");

        // The canonical cycle starts at the lex-minimum ('a'), so message should show a → b → c → a
        let msg = &diags[0].message;
        assert!(
            msg.contains("a \u{2192} b \u{2192} c \u{2192} a"),
            "Expected canonical order, got: {msg}"
        );
    }

    #[test]
    fn empty_input() {
        let diags = analyze_dependencies(&[]);
        assert!(diags.is_empty());
    }

    #[test]
    fn multiple_expressions_same_bind_merge_deps() {
        // bind 'a' has calculate referencing 'b', and relevant referencing 'c'
        // bind 'b' references 'a' → cycle between a and b
        // 'c' has no deps → no extra cycle
        let compiled = vec![
            CompiledExpression {
                expression: "$b".to_string(),
                expression_path: "$.binds.a.calculate".to_string(),
                bind_target: Some("a".to_string()),
            },
            CompiledExpression {
                expression: "$c".to_string(),
                expression_path: "$.binds.a.relevant".to_string(),
                bind_target: Some("a".to_string()),
            },
            expr("b", "$a"),
            expr("c", "true"),
        ];
        let diags = analyze_dependencies(&compiled);
        assert_eq!(diags.len(), 1, "One cycle between a and b");
    }

    #[test]
    fn nested_path_uses_base_key() {
        // Expression references $addr.city — base key is 'addr'
        // No 'addr' in the graph as a bind target, so no cycle possible
        let compiled = vec![expr("total", "$addr.city")];
        let diags = analyze_dependencies(&compiled);
        assert!(diags.is_empty());
    }

    #[test]
    fn diagnostic_path_uses_expression_path() {
        let compiled = vec![expr("x", "$x * 2")];
        let diags = analyze_dependencies(&compiled);
        assert_eq!(diags.len(), 1);
        assert_eq!(diags[0].path, "$.binds.x.calculate");
    }

    #[test]
    fn canonicalize_rotates_to_lex_min() {
        let cycle = vec!["c".to_string(), "a".to_string(), "b".to_string()];
        let canonical = canonicalize(&cycle);
        assert_eq!(canonical, vec!["a", "b", "c"]);
    }

    // ── Finding 65: base_key with bracket-only and plain paths ─

    /// Spec: core/spec.md §4.3.3 (lines 2280-2287) — base_key extracts the
    /// first path segment before any `.` or `[`.
    #[test]
    fn base_key_bracket_only_path() {
        assert_eq!(
            base_key("items[0]"),
            "items",
            "Bracket-only path should extract base"
        );
        assert_eq!(base_key("plain"), "plain", "Plain key returns itself");
        assert_eq!(base_key("a.b.c"), "a", "Dotted path extracts first segment");
        assert_eq!(
            base_key("group[0].field"),
            "group",
            "Mixed path extracts first segment"
        );
    }

    // ── Finding 66: Cycle path attribution with shared bind target ─

    /// Spec: core/spec.md §3.6.2 (lines 1386-1391) — when multiple expressions
    /// share a bind target, path_map uses `or_insert_with` (first-processed wins).
    /// The diagnostic points to whichever expression was processed first.
    #[test]
    fn cycle_diagnostic_points_to_first_expression_for_bind() {
        let compiled = vec![
            CompiledExpression {
                expression: "$b".to_string(),
                expression_path: "$.binds.a.calculate".to_string(),
                bind_target: Some("a".to_string()),
            },
            CompiledExpression {
                expression: "$b".to_string(),
                expression_path: "$.binds.a.relevant".to_string(),
                bind_target: Some("a".to_string()),
            },
            CompiledExpression {
                expression: "$a".to_string(),
                expression_path: "$.binds.b.calculate".to_string(),
                bind_target: Some("b".to_string()),
            },
        ];
        let diags = analyze_dependencies(&compiled);
        assert_eq!(diags.len(), 1);

        // The cycle is a ↔ b. The canonical cycle starts at 'a'.
        // The path should come from the FIRST expression processed for 'a',
        // which is "$.binds.a.calculate" (or_insert_with semantics).
        assert_eq!(
            diags[0].path, "$.binds.a.calculate",
            "Diagnostic should point to the first-processed expression for the bind target"
        );
    }

    #[test]
    fn two_independent_cycles() {
        let compiled = vec![
            expr("a", "$b"),
            expr("b", "$a"),
            expr("x", "$y"),
            expr("y", "$x"),
        ];
        let diags = analyze_dependencies(&compiled);
        assert_eq!(
            diags.len(),
            2,
            "Two independent cycles should produce 2 diagnostics"
        );
    }

    // ── Wildcard path dependencies ─────────────────────────────

    /// Spec: spec.md §5.4 — wildcard paths like $lines[*].amount create dependency on base key
    #[test]
    fn wildcard_path_dependency_uses_base_key() {
        // "total" depends on "$lines[*].amount" — base key is "lines"
        // If "lines" also depends on "total", we have a cycle
        let compiled = vec![
            expr("total", "sum($lines[*].amount)"),
            expr("lines", "$total"),
        ];
        let diags = analyze_dependencies(&compiled);
        assert_eq!(
            diags.len(),
            1,
            "Wildcard dependency should use base key 'lines' and detect cycle"
        );
        assert!(diags[0].message.contains("lines"));
        assert!(diags[0].message.contains("total"));
    }

    /// Spec: spec.md §5.4 — wildcard ref with no cycle
    #[test]
    fn wildcard_path_no_cycle_when_acyclic() {
        let compiled = vec![expr("total", "sum($lines[*].amount)"), expr("lines", "42")];
        let diags = analyze_dependencies(&compiled);
        assert!(
            diags.is_empty(),
            "No cycle when wildcard target doesn't reference source"
        );
    }

    // ── relevant + calculate on same bind key merge dependencies ─

    /// Spec: spec.md §4.3 — multiple expression slots on the same bind key
    /// merge into a single node in the dependency graph
    #[test]
    fn relevant_and_calculate_on_same_key_merge_deps() {
        // 'a' has calculate=$b and relevant=$c
        // 'b' depends on nothing, 'c' depends on $a → cycle between a and c
        let compiled = vec![
            CompiledExpression {
                expression: "$b + 1".to_string(),
                expression_path: "$.binds.a.calculate".to_string(),
                bind_target: Some("a".to_string()),
            },
            CompiledExpression {
                expression: "$c".to_string(),
                expression_path: "$.binds.a.relevant".to_string(),
                bind_target: Some("a".to_string()),
            },
            expr("b", "10"),
            expr("c", "$a"),
        ];
        let diags = analyze_dependencies(&compiled);
        // a → c → a cycle (via relevant slot)
        assert_eq!(
            diags.len(),
            1,
            "Should detect cycle between a and c through merged deps"
        );
        assert!(diags[0].message.contains('a'));
        assert!(diags[0].message.contains('c'));
    }
}

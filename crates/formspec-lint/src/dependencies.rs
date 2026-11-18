//! Pass 5: dependency analysis — E500 for every cycle in the Core §3.6.1 dependency graph.
//!
//! The graph has vertices for Item values, Bind/variable expressions, and Shape validity.
//!
//! - An expression depends on every value it references, and on what each MIP query
//!   function reads of the queried Item X (§4.3.2 inheritance, §5.6):
//!   - `relevant(X)`: X's and its ancestors' `relevant`;
//!   - `readonly(X)`: X's and its ancestors' `readonly`;
//!   - `required(X)`: X's `required`, and X's and its ancestors' `relevant`;
//!   - `valid(X)`: X's value, `required` and `constraint`, X's and its ancestors'
//!     `relevant`, and every Shape targeting X (`constraint`, `activeWhen`, composed members).
//! - A value depends on the expressions that write it:
//!   - `calculate` and an `=`-prefixed `default` write their Item's value;
//!   - `relevant` writes the value of its Item, and of every descendant (relevance inherits,
//!     §4.3.2), whose effective Bind sets `excludedValue` to `"null"` (§4.3.1) or declares a
//!     `default` (restored on re-relevance, §5.6 rule 5): only then does relevance change
//!     what other expressions read;
//!   - `required`, `readonly` and `constraint` write nothing.
//!
//! Variables resolve lexically (Core §4.5.1); Shape composition follows ids before FEL
//! (§5.2.2). Routes cannot feed values or validity, so they do not enter the graph.
//!
//! Paths resolve to Item keys, which E200 makes unique before this pass runs. A path that
//! names no Item is its own vertex, which nothing writes. One E500 is emitted per distinct
//! cycle of Item keys. Graph building, cycle detection and diagnostic emission are internal.
#![allow(clippy::missing_docs_in_private_items)]

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

use fel_core::{Expr, extract_dependencies};
use formspec_core::BindTargets;
use serde_json::Value;

use crate::expressions::{BindProperty, CompiledExpression, ShapeMember, shape_members};
use crate::tree::{ItemRef, ItemTreeIndex};
use crate::types::LintDiagnostic;

/// Report every dependency cycle among `compiled` as one E500 per distinct cycle.
///
/// `items` resolves paths to Item keys and ancestors. `document` supplies effective Binds
/// and Shape composition references.
pub fn analyze_dependencies(
    compiled: &[CompiledExpression],
    items: &ItemTreeIndex,
    document: &Value,
) -> Vec<LintDiagnostic> {
    let graph = build_graph(compiled, items, document);
    let cycles = detect_cycles(&graph);
    emit_diagnostics(&cycles, compiled, items, document)
}

/// A Core §3.6.1 vertex: an Item value, compiled expression, or Shape validity.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
enum Vertex {
    /// The value of the Item with this key (or of an unknown path).
    Value(String),
    /// The expression at this index of the compiled list.
    Expression(usize),
    /// Aggregate validity of the Shape at this document index, including composition.
    Shape(usize),
}

/// Vertex to the vertices it depends on. Ordered, so cycle discovery is deterministic.
type Graph = BTreeMap<Vertex, BTreeSet<Vertex>>;

fn build_graph(compiled: &[CompiledExpression], items: &ItemTreeIndex, document: &Value) -> Graph {
    let mut by_slot: HashMap<(String, BindProperty), Vec<usize>> = HashMap::new();
    let mut shapes: HashMap<String, Vec<usize>> = HashMap::new();
    let mut variables: HashMap<(&str, String), usize> = HashMap::new();
    let mut writers: BTreeMap<String, BTreeSet<usize>> = BTreeMap::new();
    let mut graph = Graph::new();

    let declarations = document.get("shapes").and_then(Value::as_array);
    let mut shape_expressions = vec![Vec::new(); declarations.map_or(0, Vec::len)];
    if let Some(declarations) = declarations {
        let ids: HashMap<&str, usize> = declarations
            .iter()
            .enumerate()
            .filter_map(|(index, shape)| Some((shape.get("id")?.as_str()?, index)))
            .collect();
        for (index, shape) in declarations.iter().enumerate() {
            if let Some(target) = shape.get("target").and_then(Value::as_str) {
                shapes
                    .entry(item_key(target, items))
                    .or_default()
                    .push(index);
            }
            // References remain graph edges even when a Shape has no FEL expression.
            let reads: BTreeSet<Vertex> = shape_members(shape, &ids)
                .filter_map(|member| match member {
                    ShapeMember::Reference(reference) => Some(Vertex::Shape(reference)),
                    ShapeMember::Expression { .. } => None,
                })
                .collect();
            if !reads.is_empty() {
                graph.insert(Vertex::Shape(index), reads);
            }
        }
    }

    for (index, expression) in compiled.iter().enumerate() {
        if let Some(shape) = expression.shape_index
            && let Some(expressions) = shape_expressions.get_mut(shape)
        {
            expressions.push(index);
        }
        if let Some(variable) = &expression.variable {
            variables.insert((&variable.name, item_key(&variable.scope, items)), index);
        }
        let Some(bind) = &expression.bind else {
            continue;
        };
        let key = item_key(&bind.path, items);
        if matches!(
            bind.property,
            BindProperty::Calculate | BindProperty::Default
        ) {
            writers.entry(key.clone()).or_default().insert(index);
        }
        by_slot.entry((key, bind.property)).or_default().push(index);
    }

    // Relevance inherits; only effective Binds that change a value create writers.
    for item in relevance_written_items(items, document.get("binds")) {
        for governing in self_and_ancestors(item, items) {
            if let Some(relevant) = by_slot.get(&(governing, BindProperty::Relevant)) {
                writers
                    .entry(item.key.clone())
                    .or_default()
                    .extend(relevant.iter().copied());
            }
        }
    }
    for (key, expressions) in writers {
        graph.insert(
            Vertex::Value(key),
            expressions.into_iter().map(Vertex::Expression).collect(),
        );
    }

    // Bind/variable expressions always participate. Shape queries must seed themselves
    // (they can cycle without Binds); other Shape expressions are needed only when a
    // valid() query reaches their Shape. Reference-only cycles already exist above.
    let mut pending: Vec<Vertex> = compiled
        .iter()
        .enumerate()
        .filter_map(|(index, expression)| {
            if expression.bind.is_some() || expression.variable.is_some() {
                return Some(Vertex::Expression(index));
            }
            if expression.shape_index.is_some() {
                let mut queries = Vec::new();
                collect_mip_queries(&expression.parsed, &mut queries);
                if !queries.is_empty() {
                    return Some(Vertex::Expression(index));
                }
            }
            None
        })
        .collect();
    let mut expanded = HashSet::new();
    while let Some(vertex) = pending.pop() {
        if !expanded.insert(vertex.clone()) {
            continue;
        }
        let index = match vertex {
            Vertex::Expression(index) => index,
            Vertex::Shape(shape) => {
                let reads = graph.entry(Vertex::Shape(shape)).or_default();
                reads.extend(
                    shape_expressions[shape]
                        .iter()
                        .copied()
                        .map(Vertex::Expression),
                );
                pending.extend(reads.iter().cloned());
                continue;
            }
            Vertex::Value(_) => continue,
        };
        let expression = &compiled[index];
        let parsed = &expression.parsed;
        let dependencies = extract_dependencies(parsed);
        let mut reads: BTreeSet<Vertex> = dependencies
            .fields
            .iter()
            .map(|field| Vertex::Value(item_key(field, items)))
            .collect();
        for reference in &dependencies.context_refs {
            if let Some(field) = reference.strip_prefix("@current.") {
                reads.insert(Vertex::Value(item_key(field, items)));
            } else if let Some(variable) = variable_read(reference, expression, items, &variables) {
                reads.insert(Vertex::Expression(variable));
            }
        }
        if dependencies.has_self_ref
            && let Some(target) = expression
                .bind
                .as_ref()
                .map(|bind| bind.path.as_str())
                .or(expression.shape_target.as_deref())
                .or_else(|| {
                    expression
                        .variable
                        .as_ref()
                        .map(|variable| variable.scope.as_str())
                        .filter(|scope| *scope != "#")
                })
        {
            reads.insert(Vertex::Value(item_key(target, items)));
        }
        let mut queries = Vec::new();
        collect_mip_queries(parsed, &mut queries);
        for (function, path) in queries {
            reads.extend(mip_query_reads(&function, &path, items, &by_slot, &shapes));
        }
        pending.extend(
            reads
                .iter()
                .filter(|vertex| matches!(vertex, Vertex::Shape(_)))
                .cloned(),
        );
        if !reads.is_empty() {
            graph.insert(Vertex::Expression(index), reads);
        }
    }
    graph
}

/// Resolve `@name` (including members of its value) in the nearest visible scope.
fn variable_read(
    reference: &str,
    expression: &CompiledExpression,
    items: &ItemTreeIndex,
    variables: &HashMap<(&str, String), usize>,
) -> Option<usize> {
    let name = reference.strip_prefix('@')?.split('.').next()?;
    // FEL grammar reserves these names for repeat/external-instance context.
    if matches!(name, "current" | "index" | "count" | "instance") {
        return None;
    }
    let target = expression
        .bind
        .as_ref()
        .map(|bind| bind.path.as_str())
        .or(expression.shape_target.as_deref())
        .or_else(|| {
            expression
                .variable
                .as_ref()
                .map(|variable| variable.scope.as_str())
        });
    if let Some(item) = target.and_then(|target| items.by_key.get(&item_key(target, items))) {
        for scope in self_and_ancestors(item, items) {
            if let Some(&index) = variables.get(&(name, scope)) {
                return Some(index);
            }
        }
    }
    variables.get(&(name, "#".to_owned())).copied()
}

/// The Item key a path names (keys are unique, E200).
///
/// The path with indices removed is tried whole, then without its trailing segments, so
/// a member of a field's value (`price.amount` on a money field) names that field. Each
/// candidate matches an Item whose full path is the candidate, or ends with it (a key or
/// a relative path). A path that names no Item is its own vertex.
fn item_key(path: &str, items: &ItemTreeIndex) -> String {
    let dotted = strip_indices(path);
    let mut candidate: &str = &dotted;
    loop {
        if let Some(item) = items.by_full_path.get(candidate) {
            return item.key.clone();
        }
        let leaf = candidate.rsplit('.').next().unwrap_or(candidate);
        if let Some(item) = items.by_key.get(leaf)
            && is_path_suffix(&item.full_path, candidate)
        {
            return item.key.clone();
        }
        match candidate.rsplit_once('.') {
            Some((parent, _)) => candidate = parent,
            None => return dotted.into_owned(),
        }
    }
}

/// Whether `suffix` is `full_path` itself or its trailing dotted segments.
fn is_path_suffix(full_path: &str, suffix: &str) -> bool {
    full_path
        .strip_suffix(suffix)
        .is_some_and(|head| head.is_empty() || head.ends_with('.'))
}

/// `rows[*].amount` and `rows[0].amount` both become `rows.amount`.
fn strip_indices(path: &str) -> std::borrow::Cow<'_, str> {
    if !path.contains('[') {
        return std::borrow::Cow::Borrowed(path);
    }
    let mut dotted = String::with_capacity(path.len());
    let mut depth = 0_usize;
    for character in path.chars() {
        match character {
            '[' => depth += 1,
            ']' => depth = depth.saturating_sub(1),
            _ if depth == 0 => dotted.push(character),
            _ => {}
        }
    }
    std::borrow::Cow::Owned(dotted)
}

/// Items whose value relevance changes: their effective (merged, Core §4.3) Bind sets
/// `excludedValue` to `"null"` (§4.3.1) or declares a `default` (§5.6 rule 5).
fn relevance_written_items<'a>(
    items: &'a ItemTreeIndex,
    binds: Option<&Value>,
) -> Vec<&'a ItemRef> {
    // Most Definitions set neither property; skip indexing the Binds for them.
    let declares =
        |bind: &Value| bind.get("excludedValue").is_some() || bind.get("default").is_some();
    let any_declared = match binds {
        Some(Value::Array(entries)) => entries.iter().any(declares),
        Some(Value::Object(entries)) => entries.values().any(declares),
        _ => false,
    };
    if !any_declared {
        return Vec::new();
    }
    let targets = BindTargets::new(binds);
    let mut found: Vec<&ItemRef> = items
        .by_full_path
        .values()
        .filter(|item| {
            let entries = match targets.entries(&item.full_path) {
                [] => targets.entries(&item.key),
                entries => entries,
            };
            // Merged per Core §4.3: the last entry setting a property wins.
            let excluded_null = entries
                .iter()
                .rev()
                .find_map(|(_, bind)| bind.get("excludedValue"))
                .and_then(Value::as_str)
                == Some("null");
            excluded_null
                || entries
                    .iter()
                    .any(|(_, bind)| bind.get("default").is_some())
        })
        .collect();
    found.sort_by(|left, right| left.full_path.cmp(&right.full_path));
    found
}

/// The item's own key followed by each ancestor's key, nearest first.
fn self_and_ancestors(item: &ItemRef, items: &ItemTreeIndex) -> Vec<String> {
    let mut keys = vec![item.key.clone()];
    let mut parent = item.parent_full_path.as_deref();
    while let Some(path) = parent {
        let Some(ancestor) = items.by_full_path.get(path) else {
            break;
        };
        keys.push(ancestor.key.clone());
        parent = ancestor.parent_full_path.as_deref();
    }
    keys
}

/// The vertices a MIP query function call on `path` reads (see the module docs).
fn mip_query_reads(
    function: &str,
    path: &str,
    items: &ItemTreeIndex,
    by_slot: &HashMap<(String, BindProperty), Vec<usize>>,
    shapes: &HashMap<String, Vec<usize>>,
) -> Vec<Vertex> {
    let key = item_key(path, items);
    let lineage = match items.by_key.get(&key) {
        Some(item) => self_and_ancestors(item, items),
        None => vec![key.clone()],
    };
    let own = |property: BindProperty| {
        by_slot
            .get(&(key.clone(), property))
            .into_iter()
            .flatten()
            .copied()
            .map(Vertex::Expression)
            .collect::<Vec<_>>()
    };
    let inherited = |property: BindProperty| {
        lineage
            .iter()
            .filter_map(|governing| by_slot.get(&(governing.clone(), property)))
            .flatten()
            .copied()
            .map(Vertex::Expression)
            .collect::<Vec<_>>()
    };
    match function {
        "relevant" => inherited(BindProperty::Relevant),
        "readonly" => inherited(BindProperty::Readonly),
        "required" => [
            own(BindProperty::Required),
            inherited(BindProperty::Relevant),
        ]
        .concat(),
        "valid" => {
            let shape_reads = shapes
                .get(&key)
                .into_iter()
                .flatten()
                .copied()
                .map(Vertex::Shape)
                .collect::<Vec<_>>();
            [
                vec![Vertex::Value(key.clone())],
                own(BindProperty::Required),
                own(BindProperty::Constraint),
                inherited(BindProperty::Relevant),
                shape_reads,
            ]
            .concat()
        }
        _ => Vec::new(),
    }
}

/// Collect `(function, path)` for every MIP query function call in `expr`.
///
/// fel-core reports the queried paths but not which function queried them; the function
/// decides which Bind expression is read. The match is exhaustive on purpose, so a new
/// FEL expression form fails to compile here instead of being skipped silently.
fn collect_mip_queries(expr: &Expr, queries: &mut Vec<(String, String)>) {
    match expr {
        Expr::FunctionCall { name, args } => {
            if matches!(
                name.as_str(),
                "relevant" | "readonly" | "required" | "valid"
            ) && let Some(first) = args.first()
            {
                for path in extract_dependencies(first).fields {
                    queries.push((name.clone(), path));
                }
            }
            for arg in args {
                collect_mip_queries(arg, queries);
            }
        }
        Expr::Null
        | Expr::Boolean(_)
        | Expr::Number(_)
        | Expr::String(_)
        | Expr::DateLiteral(_)
        | Expr::DateTimeLiteral(_)
        | Expr::FieldRef { .. }
        | Expr::VarRef { .. }
        | Expr::ContextRef { .. } => {}
        Expr::Array(elements) => {
            for element in elements {
                collect_mip_queries(element, queries);
            }
        }
        Expr::Object(entries) => {
            for (_, value) in entries {
                collect_mip_queries(value, queries);
            }
        }
        Expr::UnaryOp { operand, .. } => collect_mip_queries(operand, queries),
        Expr::BinaryOp { left, right, .. }
        | Expr::NullCoalesce { left, right }
        | Expr::RowLookup {
            source: left,
            key: right,
            ..
        } => {
            collect_mip_queries(left, queries);
            collect_mip_queries(right, queries);
        }
        Expr::Ternary {
            condition,
            then_branch,
            else_branch,
        }
        | Expr::IfThenElse {
            condition,
            then_branch,
            else_branch,
        } => {
            collect_mip_queries(condition, queries);
            collect_mip_queries(then_branch, queries);
            collect_mip_queries(else_branch, queries);
        }
        Expr::Membership {
            value, container, ..
        } => {
            collect_mip_queries(value, queries);
            collect_mip_queries(container, queries);
        }
        Expr::LetBinding { value, body, .. } => {
            collect_mip_queries(value, queries);
            collect_mip_queries(body, queries);
        }
        Expr::PostfixAccess { expr, .. } => collect_mip_queries(expr, queries),
    }
}

// ── Cycle detection ─────────────────────────────────────────────

/// Depth-first back-edge detection. Returns each cycle as its vertex sequence.
fn detect_cycles(graph: &Graph) -> Vec<Vec<Vertex>> {
    let mut visited = HashSet::new();
    let mut stack = Vec::new();
    let mut on_stack = HashSet::new();
    let mut cycles = Vec::new();

    for vertex in graph.keys() {
        if !visited.contains(vertex) {
            dfs(
                vertex,
                graph,
                &mut visited,
                &mut stack,
                &mut on_stack,
                &mut cycles,
            );
        }
    }
    cycles
}

fn dfs(
    vertex: &Vertex,
    graph: &Graph,
    visited: &mut HashSet<Vertex>,
    stack: &mut Vec<Vertex>,
    on_stack: &mut HashSet<Vertex>,
    cycles: &mut Vec<Vec<Vertex>>,
) {
    visited.insert(vertex.clone());
    stack.push(vertex.clone());
    on_stack.insert(vertex.clone());

    if let Some(dependencies) = graph.get(vertex) {
        for dependency in dependencies {
            if !visited.contains(dependency) {
                if graph.contains_key(dependency) {
                    dfs(dependency, graph, visited, stack, on_stack, cycles);
                }
            } else if on_stack.contains(dependency)
                && let Some(start) = stack.iter().position(|entry| entry == dependency)
            {
                cycles.push(stack[start..].to_vec());
            }
        }
    }

    stack.pop();
    on_stack.remove(vertex);
}

// ── Diagnostics ─────────────────────────────────────────────────

/// The Item key a vertex stands for: a value's key, or the key an expression's Bind targets.
fn vertex_key(
    vertex: &Vertex,
    compiled: &[CompiledExpression],
    items: &ItemTreeIndex,
    document: &Value,
) -> Option<String> {
    match vertex {
        Vertex::Value(key) => Some(key.clone()),
        Vertex::Expression(index) => {
            let expression = &compiled[*index];
            expression
                .bind
                .as_ref()
                .map(|bind| item_key(&bind.path, items))
                .or_else(|| {
                    expression.shape_index.and_then(|index| {
                        vertex_key(&Vertex::Shape(index), compiled, items, document)
                    })
                })
                .or_else(|| {
                    expression
                        .shape_target
                        .as_deref()
                        .map(|target| item_key(target, items))
                })
                .or_else(|| {
                    expression.variable.as_ref().map(|variable| {
                        if variable.scope == "#" {
                            format!("@{}", variable.name)
                        } else {
                            format!(
                                "@{} (scope: {})",
                                variable.name,
                                item_key(&variable.scope, items)
                            )
                        }
                    })
                })
        }
        Vertex::Shape(index) => {
            let shape = document.get("shapes")?.get(*index)?;
            let target = item_key(shape.get("target")?.as_str()?, items);
            Some(match shape.get("id").and_then(Value::as_str) {
                Some(id) => format!("{target} (Shape: {id})"),
                None => target,
            })
        }
    }
}

/// The cycle's Item keys, consecutive repeats collapsed, rotated to the smallest key.
fn key_cycle(
    cycle: &[Vertex],
    compiled: &[CompiledExpression],
    items: &ItemTreeIndex,
    document: &Value,
) -> Vec<String> {
    let mut keys: Vec<String> = Vec::new();
    for key in cycle
        .iter()
        .filter_map(|vertex| vertex_key(vertex, compiled, items, document))
    {
        if keys.last() != Some(&key) {
            keys.push(key);
        }
    }
    if keys.len() > 1 && keys.first() == keys.last() {
        keys.pop();
    }
    canonicalize(&keys)
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

/// The path of the first expression on the cycle, read from the first key's vertex onward.
fn cycle_path(
    cycle: &[Vertex],
    first_key: &str,
    compiled: &[CompiledExpression],
    items: &ItemTreeIndex,
    document: &Value,
) -> String {
    let start = cycle
        .iter()
        .position(|vertex| {
            vertex_key(vertex, compiled, items, document).as_deref() == Some(first_key)
        })
        .unwrap_or(0);
    cycle[start..]
        .iter()
        .chain(&cycle[..start])
        .find_map(|vertex| match vertex {
            Vertex::Expression(index) => Some(compiled[*index].expression_path.clone()),
            Vertex::Shape(index) => Some(format!("$.shapes[{index}]")),
            Vertex::Value(_) => None,
        })
        .unwrap_or_else(|| format!("$.binds.{first_key}"))
}

fn emit_diagnostics(
    cycles: &[Vec<Vertex>],
    compiled: &[CompiledExpression],
    items: &ItemTreeIndex,
    document: &Value,
) -> Vec<LintDiagnostic> {
    let mut seen: HashSet<Vec<String>> = HashSet::new();
    let mut diagnostics = Vec::new();
    for cycle in cycles {
        let keys = key_cycle(cycle, compiled, items, document);
        if keys.is_empty() || !seen.insert(keys.clone()) {
            continue;
        }
        let path = cycle_path(cycle, &keys[0], compiled, items, document);
        let chain: Vec<&str> = keys.iter().map(String::as_str).collect();
        let message = format!(
            "Dependency cycle detected: {} \u{2192} {}",
            chain.join(" \u{2192} "),
            chain[0],
        );
        diagnostics.push(crate::metadata::with_metadata(LintDiagnostic::error(
            crate::LintCode::E500,
            5,
            path,
            message,
        )));
    }
    diagnostics
}

// ── Tests ───────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;
    use crate::expressions::{BindSlot, compile_expressions};
    use crate::tree::build_item_index;
    use serde_json::json;

    fn slot_expr(path: &str, property: BindProperty, expression: &str) -> CompiledExpression {
        let name = match property {
            BindProperty::Calculate => "calculate",
            BindProperty::Relevant => "relevant",
            BindProperty::Required => "required",
            BindProperty::Readonly => "readonly",
            BindProperty::Constraint => "constraint",
            BindProperty::Default => "default",
        };
        CompiledExpression {
            expression: expression.to_string(),
            parsed: fel_core::parse(expression).expect("valid test expression"),
            expression_path: format!("$.binds.{path}.{name}"),
            bind: Some(BindSlot {
                path: path.to_string(),
                property,
            }),
            shape_target: None,
            shape_index: None,
            shape_context_target: None,
            variable: None,
        }
    }

    fn expr(path: &str, expression: &str) -> CompiledExpression {
        slot_expr(path, BindProperty::Calculate, expression)
    }

    fn constraint_expr(expression: &str) -> CompiledExpression {
        slot_expr("age", BindProperty::Constraint, expression)
    }

    /// Analyze with no Item tree and no Binds: every path is its own vertex.
    fn analyze(compiled: &[CompiledExpression]) -> Vec<LintDiagnostic> {
        analyze_dependencies(compiled, &build_item_index(&json!({})), &json!({}))
    }

    /// Analyze a whole document: its Binds, its Item tree, and its `excludedValue` settings.
    fn analyze_document(document: &Value) -> Vec<LintDiagnostic> {
        let compilation = compile_expressions(document);
        analyze_dependencies(&compilation.compiled, &build_item_index(document), document)
    }

    #[test]
    fn compiled_shapes_from_a_different_document_do_not_panic() {
        let compilation = compile_expressions(&json!({
            "shapes": [{ "id": "rule", "target": "a", "constraint": "true" }]
        }));
        assert!(analyze(&compilation.compiled).is_empty());
    }

    #[test]
    fn no_cycle_produces_no_diagnostics() {
        // a → b → c (chain, no cycle)
        let compiled = vec![expr("a", "$b + 1"), expr("b", "$c + 1"), expr("c", "42")];
        let diags = analyze(&compiled);
        assert!(
            diags.is_empty(),
            "Acyclic graph should produce no diagnostics"
        );
    }

    #[test]
    fn simple_two_node_cycle() {
        let compiled = vec![expr("a", "$b + 1"), expr("b", "$a + 1")];
        let diags = analyze(&compiled);
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
        let diags = analyze(&compiled);
        assert_eq!(diags.len(), 1, "Self-reference should produce 1 E500");
        assert!(diags[0].message.contains('a'));
    }

    #[test]
    fn constraint_excluded_from_graph() {
        // Constraint references self — should NOT create a cycle
        let compiled = vec![expr("age", "18"), constraint_expr("$ >= 0 and $age > 0")];
        let diags = analyze(&compiled);
        assert!(
            diags.is_empty(),
            "Constraint expressions write no value, so they cannot close a cycle"
        );
    }

    #[test]
    fn cycle_dedup_same_cycle_from_multiple_starts() {
        // a → b → a — DFS from both 'a' and 'b' should still produce 1 diagnostic
        let compiled = vec![expr("a", "$b"), expr("b", "$a")];
        let diags = analyze(&compiled);
        assert_eq!(
            diags.len(),
            1,
            "Same cycle discovered from multiple DFS starts should be deduplicated"
        );
    }

    #[test]
    fn three_node_cycle() {
        let compiled = vec![expr("a", "$b"), expr("b", "$c"), expr("c", "$a")];
        let diags = analyze(&compiled);
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
        let diags = analyze(&[]);
        assert!(diags.is_empty());
    }

    #[test]
    fn calculate_cycle_is_found_beside_a_relevant_expression() {
        // bind 'a' has calculate referencing 'b', and relevant referencing 'c'
        // bind 'b' references 'a' → cycle between a and b through the calculates
        // 'c' has no deps → no extra cycle
        let compiled = vec![
            expr("a", "$b"),
            slot_expr("a", BindProperty::Relevant, "$c"),
            expr("b", "$a"),
            expr("c", "true"),
        ];
        let diags = analyze(&compiled);
        assert_eq!(diags.len(), 1, "One cycle between a and b");
    }

    #[test]
    fn nested_reference_without_a_writer_is_not_a_cycle() {
        // Expression references $addr.city — nothing writes it, so no cycle is possible
        let compiled = vec![expr("total", "$addr.city")];
        let diags = analyze(&compiled);
        assert!(diags.is_empty());
    }

    #[test]
    fn diagnostic_path_uses_expression_path() {
        let compiled = vec![expr("x", "$x * 2")];
        let diags = analyze(&compiled);
        assert_eq!(diags.len(), 1);
        assert_eq!(diags[0].path, "$.binds.x.calculate");
    }

    #[test]
    fn canonicalize_rotates_to_lex_min() {
        let cycle = vec!["c".to_string(), "a".to_string(), "b".to_string()];
        let canonical = canonicalize(&cycle);
        assert_eq!(canonical, vec!["a", "b", "c"]);
    }

    // Replaces `base_key_bracket_only_path`: vertices used to be named by a path's first
    // segment, so `$applicant.name` and a Bind on `applicant.name` never met. Paths now
    // resolve to the Item key they name (keys are unique, E200).
    #[test]
    fn paths_resolve_to_item_keys() {
        let items = build_item_index(&json!({
            "items": [
                { "key": "applicant", "type": "group", "label": "Applicant",
                  "children": [{ "key": "name", "type": "field", "dataType": "string", "label": "Name" }] },
                { "key": "rows", "type": "group", "label": "Rows", "repeatable": true,
                  "children": [{ "key": "amount", "type": "field", "dataType": "decimal", "label": "Amount" }] }
            ]
        }));
        assert_eq!(item_key("applicant.name", &items), "name");
        assert_eq!(item_key("name", &items), "name");
        assert_eq!(item_key("rows[*].amount", &items), "amount");
        assert_eq!(item_key("rows[0].amount", &items), "amount");
        assert_eq!(item_key("rows", &items), "rows");
        assert_eq!(item_key("unknown[2].thing", &items), "unknown.thing");
    }

    /// Spec: core/spec.md §3.6.2 — the diagnostic points at an expression on the cycle,
    /// starting from the canonical first key: here `a`'s `calculate`, not its `relevant`,
    /// which writes no value and so is not on the cycle.
    #[test]
    fn cycle_diagnostic_points_to_the_writing_expression_on_the_cycle() {
        let compiled = vec![
            expr("a", "$b"),
            slot_expr("a", BindProperty::Relevant, "$b"),
            expr("b", "$a"),
        ];
        let diags = analyze(&compiled);
        assert_eq!(diags.len(), 1);
        assert_eq!(
            diags[0].path, "$.binds.a.calculate",
            "Diagnostic should point to the expression that writes the first key"
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
        let diags = analyze(&compiled);
        assert_eq!(
            diags.len(),
            2,
            "Two independent cycles should produce 2 diagnostics"
        );
    }

    // ── Wildcard path dependencies ─────────────────────────────

    // Replaces `wildcard_path_dependency_uses_base_key`, which put the `calculate` on the
    // repeat group `lines` itself. A group holds no value, so that cycle was an artefact of
    // first-segment naming; the real cycle runs through the repeated field `amount`, which
    // first-segment naming missed.
    /// Spec: spec.md §5.4 — a wildcard path depends on the repeated field it names
    #[test]
    fn wildcard_path_dependency_reaches_the_repeated_field() {
        let compiled = vec![
            expr("total", "sum($lines[*].amount)"),
            expr("lines[*].amount", "$total"),
        ];
        let diags = analyze(&compiled);
        assert_eq!(
            diags.len(),
            1,
            "Wildcard dependency should reach the repeated field and detect the cycle"
        );
        assert!(diags[0].message.contains("lines.amount"));
        assert!(diags[0].message.contains("total"));
    }

    /// Spec: spec.md §5.4 — wildcard ref with no cycle
    #[test]
    fn wildcard_path_no_cycle_when_acyclic() {
        let compiled = vec![expr("total", "sum($lines[*].amount)"), expr("lines", "42")];
        let diags = analyze(&compiled);
        assert!(
            diags.is_empty(),
            "No cycle when wildcard target doesn't reference source"
        );
    }

    // ── relevant writes a value only when non-relevant values read null ─

    // Replaces `relevant_and_calculate_on_same_key_merge_deps`, which merged every slot of
    // a Bind onto one vertex. Core §3.6.1 gives each expression its own vertex; `relevant`
    // writes the Item's value only when its `excludedValue` is "null" (§4.3.1).
    #[test]
    fn relevant_expression_closes_a_cycle_only_when_values_read_null() {
        let document = |excluded: &str| {
            json!({
                "items": [
                    { "key": "a", "type": "field", "dataType": "string", "label": "A" },
                    { "key": "b", "type": "field", "dataType": "string", "label": "B" },
                    { "key": "c", "type": "field", "dataType": "string", "label": "C" }
                ],
                "binds": [
                    { "path": "a", "calculate": "$b", "relevant": "$c != ''", "excludedValue": excluded },
                    { "path": "c", "calculate": "$a" }
                ]
            })
        };
        assert!(analyze_document(&document("preserve")).is_empty());
        let diags = analyze_document(&document("null"));
        assert_eq!(diags.len(), 1, "{diags:?}");
        assert!(
            diags[0].message.contains("a \u{2192} c \u{2192} a"),
            "{diags:?}"
        );
    }

    #[test]
    fn valid_query_reads_constraint_and_required() {
        let document = json!({
            "items": [
                { "key": "a", "type": "field", "dataType": "boolean", "label": "A" },
                { "key": "b", "type": "field", "dataType": "string", "label": "B" }
            ],
            "binds": [
                { "path": "a", "calculate": "valid($b)" },
                { "path": "b", "constraint": "$a = true" }
            ]
        });
        assert_eq!(analyze_document(&document).len(), 1);
    }

    #[test]
    fn relevant_query_reads_the_ancestors_relevant_expressions() {
        let document = json!({
            "items": [
                { "key": "flag", "type": "field", "dataType": "boolean", "label": "Flag" },
                { "key": "section", "type": "group", "label": "Section",
                  "children": [{ "key": "inner", "type": "field", "dataType": "string", "label": "Inner" }] }
            ],
            "binds": [
                { "path": "flag", "calculate": "relevant($section.inner)" },
                { "path": "section", "relevant": "$flag = true" }
            ]
        });
        assert_eq!(analyze_document(&document).len(), 1);
    }
}

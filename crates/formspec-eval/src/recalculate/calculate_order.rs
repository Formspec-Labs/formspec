//! Resolve concrete calculate reads once for ordering and cycle refusal.

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

use formspec_core::definition_expressions::{ShapeMember, shape_members};

use fel_core::{Expr, ast::PathSegment, exact_json::Value, parse};

use super::calculate_pass::evaluate_calculate;
use super::variables::variable_sites;
use super::walk::Walk;
use crate::rebuild::expand_repeat_instances_counted;
use crate::scope::{AggregateMemo, RowCounts, ScopeData, ScopeIndex, Site, lexical_scopes};
use crate::types::{EvalDiagnostic, ItemInfo, VariableDef, strip_indices};
use formspec_core::dependency_order::dependency_order;
use formspec_core::dependency_reads::{Property, PropertyInput, Read, Reads, Root};

#[derive(Debug)]
pub(crate) struct CalculateOrder {
    expressions: Vec<(Expr, Reads)>,
    steps: Vec<(Step, usize)>,
    early_batch: Vec<(usize, usize)>,
    early: HashSet<String>,
    seed_memo: bool,
}

#[derive(Debug)]
enum Step {
    Calculate(usize),
    Required(usize),
    Variable { name: String, path: String },
}

#[derive(Clone, Copy)]
enum Slot {
    Calculate(usize),
    Property(usize, Property),
    Constraint,
    Default,
    Variable(usize),
    Shape,
}

struct Node<'a> {
    path: &'a str,
    expression: usize,
    slot: Slot,
}

impl CalculateOrder {
    /// Check same-row dependencies even when a Response contains no rows.
    pub(crate) fn check_definition(
        items: &[ItemInfo],
        variables: &[VariableDef],
        definition: &Value,
    ) -> Result<(), String> {
        let mut sites = items.to_vec();
        let mut counts = RowCounts::new();
        representative_row_counts(items, "", &mut counts);
        expand_repeat_instances_counted(&mut sites, &mut counts);
        let index = ScopeIndex::new(&sites, counts);
        Self::resolve(&sites, &index, variables, definition, true).map(|_| ())
    }

    pub(crate) fn new(
        items: &[ItemInfo],
        index: &ScopeIndex,
        variables: &[VariableDef],
        definition: &Value,
    ) -> Result<Self, String> {
        Self::resolve(items, index, variables, definition, false)
    }

    fn resolve(
        items: &[ItemInfo],
        index: &ScopeIndex,
        variables: &[VariableDef],
        definition: &Value,
        authored: bool,
    ) -> Result<Self, String> {
        let state = ScopeData::default();
        let mut items_in_order = Vec::new();
        collect_items(items, &mut items_in_order);
        let shapes = definition
            .get("shapes")
            .and_then(Value::as_array)
            .map_or(&[][..], Vec::as_slice);
        let shape_sites: Vec<_> = shapes
            .iter()
            .enumerate()
            .flat_map(|(i, shape)| {
                let target = shape.get("target").and_then(Value::as_str).unwrap_or("");
                index.targets(target).into_iter().map(move |path| (path, i))
            })
            .collect();
        let mut expressions = Vec::new();
        let mut parsed = HashMap::new();
        let mut nodes = Vec::new();
        let mut graph = Graph::new(index, authored);
        for (position, item) in items_in_order.iter().enumerate() {
            let path = item.path.as_str();
            for (source, slot) in [
                (item.calculate.as_deref(), Slot::Calculate(position)),
                (
                    item.required_expr.as_deref(),
                    Slot::Property(position, Property::Required),
                ),
                (
                    item.relevance.as_deref(),
                    Slot::Property(position, Property::Relevant),
                ),
                (
                    item.readonly_expr.as_deref(),
                    Slot::Property(position, Property::Readonly),
                ),
                (item.constraint.as_deref(), Slot::Constraint),
                (
                    item.default_expression
                        .as_deref()
                        .or(item.default_value.as_ref().map(|_| "null")),
                    Slot::Default,
                ),
            ] {
                if let Some(source) = source
                    && let Some(expression) = expression_id(source, &mut parsed, &mut expressions)
                {
                    let id = nodes.len();
                    match slot {
                        Slot::Calculate(_) => {
                            graph.writers.entry(path).or_default().push(id);
                        }
                        Slot::Property(_, property) => {
                            graph.properties.insert((path, property), id);
                        }
                        Slot::Constraint => {
                            graph.constraints.insert(path, id);
                        }
                        Slot::Default => {
                            graph.writers.entry(path).or_default().push(id);
                        }
                        Slot::Variable(_) | Slot::Shape => unreachable!(),
                    }
                    nodes.push(Node {
                        path,
                        expression,
                        slot,
                    });
                }
            }
        }

        for item in &items_in_order {
            if item.excluded_value == Some(crate::types::ExcludedValueMode::Null)
                || item.default_value.is_some()
                || item.default_expression.is_some()
            {
                for ancestor in lexical_scopes(&item.path) {
                    if let Some(&id) = graph.properties.get(&(ancestor, Property::Relevant)) {
                        graph.writers.entry(&item.path).or_default().push(id);
                    }
                }
            }
        }

        for (position, variable) in variables.iter().enumerate() {
            if let Some(expression) =
                expression_id(&variable.expression, &mut parsed, &mut expressions)
            {
                for path in variable_sites(index, variable) {
                    graph
                        .variables
                        .insert((path, variable.name.as_str()), nodes.len());
                    nodes.push(Node {
                        path,
                        expression,
                        slot: Slot::Variable(position),
                    });
                }
            }
        }

        let mut shape_dependencies = Vec::new();
        if !shapes.is_empty() {
            let rules = shape_rules(shapes, &mut parsed, &mut expressions);
            let mut shape_graph = ShapeGraph {
                at_site: HashMap::new(),
                edges: &mut shape_dependencies,
            };
            let empty = expression_id("null", &mut parsed, &mut expressions).expect("valid FEL");
            for (path, i) in &shape_sites {
                let id = shape_graph.visit(path, *i, &rules, &mut nodes, empty);
                let severity = shapes[*i].get("severity").and_then(Value::as_str);
                if !matches!(severity, Some("warning" | "info")) {
                    graph.validity_checks.entry(path).or_default().push(id);
                }
            }
        }

        graph.edges.resize_with(nodes.len(), Vec::new);
        let mut current_inputs = HashMap::new();
        for (id, node) in nodes.iter().enumerate() {
            let (all, without_prior_validity) = graph.reads(
                &expressions[node.expression].1,
                &state.site(index, node.path),
                node.path,
            );
            graph.edges[id] = all;
            if let Some(inputs) = without_prior_validity {
                current_inputs.insert(id, inputs);
            }
        }
        for (reader, input) in shape_dependencies {
            graph.edges[reader].push(input);
        }
        let order = graph.order(&nodes, variables)?;
        let inputs_to_calculates = graph.reachable(
            nodes
                .iter()
                .enumerate()
                .filter(|(_, node)| matches!(node.slot, Slot::Calculate(_)))
                .flat_map(|(id, _)| graph.edges[id].iter().copied())
                .collect(),
        );
        let steps = order
            .iter()
            .filter_map(|&id| {
                let node = nodes.get(id)?;
                let step = match node.slot {
                    Slot::Calculate(position) => Step::Calculate(position),
                    Slot::Property(position, Property::Required)
                        if inputs_to_calculates.contains(&id) =>
                    {
                        Step::Required(position)
                    }
                    Slot::Variable(position)
                        if inputs_to_calculates.contains(&id) && !graph.edges[id].is_empty() =>
                    {
                        Step::Variable {
                            name: variables[position].name.clone(),
                            path: node.path.to_owned(),
                        }
                    }
                    _ => return None,
                };
                Some((step, node.expression))
            })
            .collect();

        let early_inputs = graph.reachable(
            nodes
                .iter()
                .enumerate()
                .filter(|(_, node)| {
                    matches!(
                        node.slot,
                        Slot::Property(_, Property::Relevant | Property::Readonly) | Slot::Default
                    )
                })
                .flat_map(|(id, _)| graph.edges[id].iter().copied())
                .collect(),
        );
        let mut early_batch = Vec::new();
        let mut early = HashSet::new();
        // Calculate input-only prerequisites for early Binds in dependency order.
        // An early dependency on a default or model-item state needs the Bind walk.
        let mut stable_before_binds = vec![false; graph.edges.len()];
        for id in order {
            stable_before_binds[id] = current_inputs
                .get(&id)
                .unwrap_or(&graph.edges[id])
                .iter()
                .all(|&input| stable_before_binds[input])
                && nodes.get(id).is_none_or(|node| {
                    matches!(node.slot, Slot::Calculate(_))
                        && expressions[node.expression]
                            .1
                            .properties
                            .iter()
                            .all(|(property, _)| *property == Property::Valid)
                });
            if early_inputs.contains(&id)
                && let Some(Node {
                    path,
                    expression,
                    slot: Slot::Calculate(position),
                }) = nodes.get(id)
            {
                if stable_before_binds[id] {
                    early_batch.push((*position, *expression));
                } else {
                    early.insert((*path).to_owned());
                }
            }
        }

        // The first variable pass itself must see the input data.
        let seed_memo = !graph
            .reachable(
                nodes
                    .iter()
                    .enumerate()
                    .filter(|(_, node)| matches!(node.slot, Slot::Variable(_)))
                    .flat_map(|(id, _)| graph.edges[id].iter().copied())
                    .collect(),
            )
            .into_iter()
            .any(|id| {
                nodes
                    .get(id)
                    .is_some_and(|node| matches!(node.slot, Slot::Calculate(_)))
            });
        Ok(Self {
            expressions,
            steps,
            early_batch,
            early,
            seed_memo,
        })
    }

    pub(super) fn early_writers(&self) -> &HashSet<String> {
        &self.early
    }

    pub(crate) fn writer_paths(&self, items: &[ItemInfo]) -> Vec<String> {
        let mut sites = Vec::new();
        collect_items(items, &mut sites);
        self.steps
            .iter()
            .filter_map(|(step, _)| match step {
                Step::Calculate(position) => Some(sites[*position].path.clone()),
                _ => None,
            })
            .collect()
    }

    pub(super) fn seed_previous_values(
        &self,
        items: &[ItemInfo],
        state: &mut ScopeData,
        memo: &AggregateMemo,
    ) {
        if self.seed_memo && memo.has_results() {
            seed_calculated_values(items, state, memo, &self.early);
        }
    }

    pub(super) fn evaluate_early(
        &self,
        items: &[ItemInfo],
        state: &mut ScopeData,
        values: &mut HashMap<String, Value>,
        walk: &Walk<'_>,
    ) {
        if self.early_batch.is_empty() {
            return;
        }
        let mut sites = Vec::new();
        collect_items(items, &mut sites);
        let mut diagnostics = Vec::new();
        for &(position, expression) in &self.early_batch {
            evaluate_calculate(
                sites[position],
                &self.expressions[expression].0,
                state,
                values,
                walk,
                &mut diagnostics,
            );
        }
    }

    pub(super) fn evaluate(
        &self,
        items: &mut [ItemInfo],
        state: &mut ScopeData,
        values: &mut HashMap<String, Value>,
        walk: &Walk<'_>,
    ) -> Vec<EvalDiagnostic> {
        if self.steps.is_empty() {
            return Vec::new();
        }
        let mut diagnostics = Vec::new();
        let mut sites = Vec::new();
        collect_items(items, &mut sites);
        for (step, expression) in &self.steps {
            let expression = &self.expressions[*expression].0;
            match step {
                Step::Calculate(position) => {
                    evaluate_calculate(
                        sites[*position],
                        expression,
                        state,
                        values,
                        walk,
                        &mut diagnostics,
                    );
                }
                Step::Required(position) => {
                    let item = sites[*position];
                    let required = item.mip.relevant
                        && walk
                            .fel
                            .evaluate(expression, &state.site(walk.index, &item.path))
                            .value
                            .as_bool()
                            .unwrap_or(false);
                    if let Some(mip) = state.env.mip_states.get_mut(&item.path) {
                        mip.required = required;
                    }
                }
                Step::Variable { name, path } => {
                    let value = walk
                        .fel
                        .evaluate(expression, &state.site(walk.index, path))
                        .value;
                    state
                        .variables
                        .entry(path.clone())
                        .or_default()
                        .insert(name.clone(), value);
                }
            }
        }
        sync_item_values(items, values);
        diagnostics
    }
}

#[derive(Default)]
struct ShapeRule {
    expressions: Vec<usize>,
    references: Vec<usize>,
}

fn shape_rules(
    shapes: &[Value],
    parsed: &mut HashMap<String, Option<usize>>,
    expressions: &mut Vec<(Expr, Reads)>,
) -> Vec<ShapeRule> {
    let ids = shapes
        .iter()
        .enumerate()
        .filter_map(|(i, shape)| Some((shape.get("id")?.as_str()?, i)))
        .collect();
    shapes
        .iter()
        .map(|shape| {
            let mut rule = ShapeRule::default();
            rule.expressions.extend(
                ["constraint", "activeWhen"]
                    .into_iter()
                    .filter_map(|property| shape.get(property).and_then(Value::as_str))
                    .filter_map(|source| expression_id(source, parsed, expressions)),
            );
            for member in shape_members(shape, &ids) {
                match member {
                    ShapeMember::Reference(next) => rule.references.push(next),
                    ShapeMember::Expression { source, .. } => {
                        rule.expressions
                            .extend(expression_id(source, parsed, expressions));
                    }
                }
            }
            rule
        })
        .collect()
}

struct ShapeGraph<'a, 'e> {
    at_site: HashMap<(&'a str, usize), usize>,
    edges: &'e mut Vec<(usize, usize)>,
}

impl<'a> ShapeGraph<'a, '_> {
    fn visit(
        &mut self,
        path: &'a str,
        index: usize,
        rules: &[ShapeRule],
        nodes: &mut Vec<Node<'a>>,
        empty: usize,
    ) -> usize {
        let mut pending = Vec::new();
        let root = self.shape_vertex(path, index, nodes, empty, &mut pending);
        while let Some((index, id)) = pending.pop() {
            let rule = &rules[index];
            for &next in &rule.references {
                let dependency = self.shape_vertex(path, next, nodes, empty, &mut pending);
                self.edges.push((id, dependency));
            }
            for &expression in &rule.expressions {
                self.edges.push((id, nodes.len()));
                nodes.push(Node {
                    path,
                    expression,
                    slot: Slot::Shape,
                });
            }
        }
        root
    }

    fn shape_vertex(
        &mut self,
        path: &'a str,
        index: usize,
        nodes: &mut Vec<Node<'a>>,
        empty: usize,
        pending: &mut Vec<(usize, usize)>,
    ) -> usize {
        *self.at_site.entry((path, index)).or_insert_with(|| {
            let id = nodes.len();
            nodes.push(Node {
                path,
                expression: empty,
                slot: Slot::Shape,
            });
            pending.push((index, id));
            id
        })
    }
}

fn expression_id(
    source: &str,
    parsed: &mut HashMap<String, Option<usize>>,
    expressions: &mut Vec<(Expr, Reads)>,
) -> Option<usize> {
    if let Some(id) = parsed.get(source) {
        return *id;
    }
    let id = parse(source).ok().map(|expression| {
        let reads = Reads::new(&expression);
        expressions.push((expression, reads));
        expressions.len() - 1
    });
    parsed.insert(source.to_owned(), id);
    id
}

/// Writer vertices precede shared wildcard vertices. An edge points to an input.
struct Graph<'a> {
    index: &'a ScopeIndex,
    authored: bool,
    writers: BTreeMap<&'a str, Vec<usize>>,
    properties: HashMap<(&'a str, Property), usize>,
    constraints: HashMap<&'a str, usize>,
    validity_checks: HashMap<&'a str, Vec<usize>>,
    variables: HashMap<(&'a str, &'a str), usize>,
    edges: Vec<Vec<usize>>,
    projections: HashMap<String, Vec<(Vec<PathSegment>, Option<usize>)>>,
}

impl<'a> Graph<'a> {
    fn new(index: &'a ScopeIndex, authored: bool) -> Self {
        Self {
            index,
            authored,
            writers: BTreeMap::new(),
            properties: HashMap::new(),
            constraints: HashMap::new(),
            validity_checks: HashMap::new(),
            variables: HashMap::new(),
            edges: Vec::new(),
            projections: HashMap::new(),
        }
    }

    fn reads(
        &mut self,
        reads: &Reads,
        site: &Site<'_>,
        path: &str,
    ) -> (Vec<usize>, Option<Vec<usize>>) {
        let mut inputs = Vec::new();
        for Read {
            root,
            path: segments,
            row_count,
        } in &reads.values
        {
            if let Some(root) = read_root(root, site, path) {
                self.resolve_read(root, segments, *row_count, &mut inputs);
            }
        }
        for name in &reads.variables {
            if let Some(&id) = lexical_scopes(path)
                .chain(std::iter::once("#"))
                .find_map(|scope| self.variables.get(&(scope, name.as_str())))
            {
                inputs.push(id);
            }
        }
        let mut previous = Vec::new();
        for (property, read) in &reads.properties {
            let Some(target) = read_root(&read.root, site, path)
                .and_then(|root| self.property_target(root, &read.path))
            else {
                continue;
            };
            // Validity participates in refusal. During recalculation, valid()
            // reads the already available result of the previous validation.
            let inputs = if *property == Property::Valid {
                &mut previous
            } else {
                &mut inputs
            };
            for input in property.inputs() {
                match *input {
                    PropertyInput::Value => {
                        inputs.extend(
                            self.writers
                                .get(target.as_str())
                                .into_iter()
                                .flatten()
                                .copied(),
                        );
                    }
                    PropertyInput::Inherited(kind) => inputs
                        .extend(lexical_scopes(&target).filter_map(|ancestor| {
                            self.properties.get(&(ancestor, kind)).copied()
                        })),
                    PropertyInput::Own(kind) => {
                        inputs.extend(self.properties.get(&(target.as_str(), kind)).copied());
                    }
                    PropertyInput::Constraint => {
                        inputs.extend(self.constraints.get(target.as_str()).copied());
                    }
                    PropertyInput::ErrorShapes => {
                        inputs.extend(
                            self.validity_checks
                                .get(target.as_str())
                                .into_iter()
                                .flatten()
                                .copied(),
                        );
                    }
                }
            }
        }
        let current = (!previous.is_empty()).then(|| inputs.clone());
        inputs.extend(previous);
        inputs.sort_unstable();
        inputs.dedup();
        (inputs, current)
    }

    fn property_target(&self, mut path: String, segments: &[PathSegment]) -> Option<String> {
        for part in segments {
            match part {
                PathSegment::Dot(key) => {
                    path.push('.');
                    path.push_str(key);
                }
                PathSegment::Index(index)
                    if !self.authored
                        && *index > 0
                        && *index
                            <= self.index.counts.get(&path).copied().unwrap_or(0) as usize =>
                {
                    path.push_str(&format!("[{}]", index - 1));
                }
                _ => return None,
            }
        }
        Some(path)
    }

    fn resolve_read(
        &mut self,
        mut path: String,
        segments: &[PathSegment],
        row_count: bool,
        inputs: &mut Vec<usize>,
    ) {
        for (position, segment) in segments.iter().enumerate() {
            match (self.index.counts.get(&path), segment) {
                (Some(&count), PathSegment::Index(index))
                    if !self.authored && *index > 0 && *index as u64 <= count =>
                {
                    path.push_str(&format!("[{}]", index - 1));
                }
                (Some(&count), PathSegment::Wildcard) => {
                    let tail = &segments[position + 1..];
                    if row_count && tail.is_empty() {
                        return;
                    }
                    if let Some(id) = self.projection(path, count, tail) {
                        inputs.push(id);
                    }
                    return;
                }
                (Some(_), _) => return,
                (None, PathSegment::Dot(key)) => {
                    if !path.is_empty() {
                        path.push('.');
                    }
                    path.push_str(key);
                }
                (None, _) => break,
            }
        }
        if row_count && self.index.counts.contains_key(&path) {
            return;
        }
        // An object-valued writer can supply a member that has no Item of its own.
        if let Some(id) = std::iter::once(path.as_str())
            .chain(path.rmatch_indices(['.', '[']).map(|(at, _)| &path[..at]))
            .find_map(|ancestor| self.writers.get(ancestor))
        {
            inputs.extend(id);
        }
        // An Item can have child Items and still hold its own typed field value.
        if self.index.data_type(&path).is_some() {
            return;
        }
        for delimiter in ['.', '['] {
            let prefix = format!("{path}{delimiter}");
            inputs.extend(
                self.writers
                    .range(prefix.as_str()..)
                    .take_while(|(candidate, _)| candidate.starts_with(&prefix))
                    .flat_map(|(_, ids)| ids.iter().copied()),
            );
        }
        if path.is_empty() {
            inputs.extend(self.writers.values().flatten().copied());
        }
    }

    fn projection(&mut self, group: String, count: u64, tail: &[PathSegment]) -> Option<usize> {
        if let Some(found) = self
            .projections
            .get(&group)
            .and_then(|calls| calls.iter().find(|(path, _)| path == tail))
        {
            return found.1;
        }
        let mut writers = Vec::new();
        for row in 0..count {
            self.resolve_read(format!("{group}[{row}]"), tail, false, &mut writers);
        }
        let id = if writers.is_empty() {
            None
        } else {
            writers.sort_unstable();
            writers.dedup();
            self.edges.push(writers);
            Some(self.edges.len() - 1)
        };
        self.projections
            .entry(group)
            .or_default()
            .push((tail.to_vec(), id));
        id
    }

    fn order(&self, nodes: &[Node<'_>], variables: &[VariableDef]) -> Result<Vec<usize>, String> {
        let members = match dependency_order(&self.edges) {
            Ok(order) => return Ok(order),
            Err(members) => members,
        };
        let mut variable_only = true;
        let cycle: BTreeSet<_> = members
            .into_iter()
            .filter_map(|id| nodes.get(id))
            .map(|node| {
                let path = if self.authored {
                    strip_indices(node.path)
                } else {
                    node.path.to_owned()
                };
                if let Slot::Variable(position) = node.slot {
                    return format!("{path}:@{}", variables[position].name);
                }
                variable_only = false;
                path
            })
            .collect();
        let message = if variable_only {
            "Circular variable dependency"
        } else {
            "Cyclic dependency detected"
        };
        Err(format!(
            "{message}: {}",
            cycle.into_iter().collect::<Vec<_>>().join(", ")
        ))
    }

    fn reachable(&self, mut pending: Vec<usize>) -> HashSet<usize> {
        let mut seen = HashSet::new();
        while let Some(id) = pending.pop() {
            if seen.insert(id) {
                pending.extend(&self.edges[id]);
            }
        }
        seen
    }
}

fn read_root(root: &Root, site: &Site<'_>, path: &str) -> Option<String> {
    match root {
        Root::Field(name) => Some(site.head(name)),
        Root::Target => Some(path.to_owned()),
        Root::Current => site.current_row_path(),
        Root::Previous => site.relative_row(-1),
        Root::Next => site.relative_row(1),
        Root::Parent => site.parent_path(),
    }
}

fn representative_row_counts(items: &[ItemInfo], parent: &str, counts: &mut RowCounts) {
    for item in items {
        let mut path = if parent.is_empty() {
            item.path.clone()
        } else {
            format!("{parent}.{}", item.key)
        };
        if item.repeatable {
            counts.insert(path.clone(), 1);
            path.push_str("[0]");
        }
        representative_row_counts(&item.children, &path, counts);
    }
}

fn seed_calculated_values(
    items: &[ItemInfo],
    state: &mut ScopeData,
    memo: &AggregateMemo,
    early: &HashSet<String>,
) {
    for item in items {
        if item.calculate.is_some()
            && !early.contains(&item.path)
            && let Some(value) = memo.previous_value(&item.path)
        {
            state.env.data.insert(item.path.clone(), value.clone());
        }
        seed_calculated_values(&item.children, state, memo, early);
    }
}

fn collect_items<'a>(items: &'a [ItemInfo], out: &mut Vec<&'a ItemInfo>) {
    for item in items {
        out.push(item);
        collect_items(&item.children, out);
    }
}

fn sync_item_values(items: &mut [ItemInfo], values: &HashMap<String, Value>) {
    for item in items {
        if item.calculate.is_some()
            && let Some(value) = values.get(&item.path)
        {
            item.value.clone_from(value);
        }
        sync_item_values(&mut item.children, values);
    }
}

//! Conservative scoped read-dependency analysis for Definition rule-mutation selection.
//!
//! Reuses the evaluator's [`ScopeIndex`], [`Reads`], [`shape_members`], and [`CalculateOrder`]
//! cycle check to compute, for each bounded conformance case query, the set of authored item
//! template paths, Shapes, variables, and option sets that can influence its outcome.

use std::collections::{BTreeSet, HashMap, HashSet};

use fel_core::ast::PathSegment;
use fel_core::exact_json::Value;
use fel_core::parse;
use formspec_core::definition_expressions::{ShapeMember, shape_members};
use formspec_core::dependency_reads::{Property, Read, Reads, Root};

use super::calculate_order::{CalculateOrder, representative_row_counts};
use super::variables::variable_sites;
use crate::rebuild::{expand_repeat_instances_counted, parse_variables, rebuild_item_tree};
use crate::scope::{RowCounts, ScopeData, ScopeIndex, Site, lexical_scopes};
use crate::types::{ItemInfo, strip_indices};

/// A conformance case's observation boundary against a single Definition.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DependencyQuery {
    /// A single FEL expression evaluated at a concrete `site` (empty string for form root).
    #[serde(rename_all = "camelCase")]
    Fel {
        /// FEL expression text.
        expression: String,
        /// Instance path where the expression is evaluated (e.g. `""` or `"groupA.rows[0]"`).
        site: String,
        /// Whether the case runs new-Response creation (`origin == "new"`).
        #[serde(default)]
        origin_new: bool,
    },
    /// A processing/report case whose assertions only inspect explicit data, state, or validation targets.
    #[serde(rename_all = "camelCase")]
    Targets {
        /// Concrete Response data paths checked by `dataAt`.
        #[serde(default)]
        data_paths: Vec<String>,
        /// Concrete Item paths checked by `states`.
        #[serde(default)]
        state_paths: Vec<String>,
        /// Concrete validation result paths checked by `present` / `absent`.
        #[serde(default)]
        validation_paths: Vec<String>,
        /// Validation result path prefixes checked by `present` / `absent`.
        #[serde(default)]
        validation_prefixes: Vec<String>,
        /// Whether the case runs new-Response creation (`origin == "new"`).
        #[serde(default)]
        origin_new: bool,
    },
    /// Whole-form or opaque observation that must run against every mutant.
    Unbounded,
}

/// Conservative set of authored Definition rules that can influence one bounded case.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadScope {
    /// Template Item paths (repeat indices stripped, e.g. `"section.rows.amount"`).
    pub item_paths: BTreeSet<String>,
    /// Zero-based indices into `definition.shapes`.
    pub shapes: BTreeSet<usize>,
    /// `definition.optionSets` keys referenced by items in `item_paths`.
    pub option_sets: BTreeSet<String>,
    /// Scoped variable identifiers (`"<scope>:<name>"`) read transitively.
    pub variables: BTreeSet<String>,
    /// Whether top-level `definition.nonRelevantBehavior` can influence the query.
    pub include_nrb: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
enum Vertex {
    Value(String),
    Relevant(String),
    Required(String),
    Readonly(String),
    Constraint(String),
    Valid(String),
    Validation(String),
    Variable(String, String),
    Shape(String, usize),
}

struct ScopeGraph {
    index: ScopeIndex,
    item_paths_by_site: Vec<String>,
    site_set: HashSet<String>,
    template_to_sites: HashMap<String, Vec<String>>,
    item_option_sets: HashMap<String, String>,
    item_has_relevant: HashSet<String>,
    edges: HashMap<Vertex, Vec<Vertex>>,
    unbounded_vertices: HashSet<Vertex>,
}

impl ScopeGraph {
    fn build(definition: &Value) -> Option<Self> {
        if definition.get("screener").is_some() || definition.get("$ref").is_some() {
            return None;
        }
        let items = rebuild_item_tree(definition);
        let variables = parse_variables(definition);
        if CalculateOrder::check_definition(&items, &variables, definition).is_err() {
            return None;
        }

        let mut sites = items;
        let mut counts = RowCounts::new();
        representative_row_counts(&sites, "", &mut counts);
        expand_repeat_instances_counted(&mut sites, &mut counts);
        let index = ScopeIndex::new(&sites, counts);

        let mut flat_items = Vec::new();
        collect_item_infos(&sites, &mut flat_items);

        let mut item_paths_by_site = Vec::with_capacity(flat_items.len());
        let mut site_set = HashSet::with_capacity(flat_items.len());
        let mut template_to_sites: HashMap<String, Vec<String>> = HashMap::new();
        let mut item_has_relevant = HashSet::new();

        for item in &flat_items {
            item_paths_by_site.push(item.path.clone());
            site_set.insert(item.path.clone());
            let tmpl = strip_indices(&item.path);
            template_to_sites
                .entry(tmpl.clone())
                .or_default()
                .push(item.path.clone());
            if item.relevance.is_some() {
                item_has_relevant.insert(tmpl);
            }
        }

        let mut item_option_sets = HashMap::new();
        let mut item_creation_exprs: HashMap<String, Vec<String>> = HashMap::new();
        collect_authored_item_metadata(
            definition.get("items"),
            "",
            &mut item_option_sets,
            &mut item_creation_exprs,
        )?;

        let mut graph = Self {
            index,
            item_paths_by_site,
            site_set,
            template_to_sites,
            item_option_sets,
            item_has_relevant,
            edges: HashMap::new(),
            unbounded_vertices: HashSet::new(),
        };

        let state = ScopeData::default();
        let shapes = definition
            .get("shapes")
            .and_then(Value::as_array)
            .map_or(&[][..], Vec::as_slice);
        let shape_ids: HashMap<&str, usize> = shapes
            .iter()
            .enumerate()
            .filter_map(|(i, shape)| Some((shape.get("id")?.as_str()?, i)))
            .collect();

        // Map concrete target sites to all Shapes targeting them (and error-severity Shapes separately).
        let mut all_shapes_at: HashMap<String, Vec<usize>> = HashMap::new();
        let mut error_shapes_at: HashMap<String, Vec<usize>> = HashMap::new();
        for (i, shape) in shapes.iter().enumerate() {
            let target = shape.get("target").and_then(Value::as_str).unwrap_or("");
            let is_error = !matches!(
                shape.get("severity").and_then(Value::as_str),
                Some("warning" | "info")
            );
            for target_site in graph.index.targets(target) {
                all_shapes_at.entry(target_site.clone()).or_default().push(i);
                if is_error {
                    error_shapes_at.entry(target_site).or_default().push(i);
                }
            }
        }

        // Map variables by scope for lexical lookup.
        let mut variable_scopes: HashMap<(String, String), String> = HashMap::new();
        for var in &variables {
            for site_path in variable_sites(&graph.index, var) {
                variable_scopes.insert(
                    (site_path.to_owned(), var.name.clone()),
                    var.expression.clone(),
                );
            }
        }

        // Populate Item vertices (Value, Relevant, Required, Readonly, Constraint, Valid, Validation).
        for item in &flat_items {
            let p = item.path.as_str();
            let v_val = Vertex::Value(p.to_owned());
            let v_rel = Vertex::Relevant(p.to_owned());
            let v_req = Vertex::Required(p.to_owned());
            let v_ro = Vertex::Readonly(p.to_owned());
            let v_con = Vertex::Constraint(p.to_owned());
            let v_valid = Vertex::Valid(p.to_owned());
            let v_validation = Vertex::Validation(p.to_owned());

            // Value depends on ancestor relevance (NRB / excludedValue) and any calculate/default/creation exprs.
            for ancestor in lexical_scopes(p) {
                graph.add_edge(&v_val, Vertex::Relevant(ancestor.to_owned()));
            }
            if let Some(parent) = parent_site(p) {
                graph.add_edge(&v_rel, Vertex::Relevant(parent.to_owned()));
                graph.add_edge(&v_ro, Vertex::Readonly(parent.to_owned()));
            }
            graph.add_edge(&v_req, v_rel.clone());
            graph.add_edge(&v_con, v_val.clone());
            graph.add_edge(&v_con, v_rel.clone());

            graph.add_edge(&v_valid, v_val.clone());
            graph.add_edge(&v_valid, v_rel.clone());
            graph.add_edge(&v_valid, v_req.clone());
            graph.add_edge(&v_valid, v_con.clone());
            for &shape_idx in error_shapes_at.get(p).into_iter().flatten() {
                graph.add_edge(&v_valid, Vertex::Shape(p.to_owned(), shape_idx));
            }

            graph.add_edge(&v_validation, v_val.clone());
            graph.add_edge(&v_validation, v_rel.clone());
            graph.add_edge(&v_validation, v_req.clone());
            graph.add_edge(&v_validation, v_ro.clone());
            graph.add_edge(&v_validation, v_con.clone());
            for &shape_idx in all_shapes_at.get(p).into_iter().flatten() {
                graph.add_edge(&v_validation, Vertex::Shape(p.to_owned(), shape_idx));
            }

            for (expr_opt, owner) in [
                (item.calculate.as_deref(), &v_val),
                (item.default_expression.as_deref(), &v_val),
                (item.relevance.as_deref(), &v_rel),
                (item.required_expr.as_deref(), &v_req),
                (item.readonly_expr.as_deref(), &v_ro),
                (item.constraint.as_deref(), &v_con),
            ] {
                if let Some(source) = expr_opt {
                    if !graph.wire_expression(owner, source, p, &state, &variable_scopes)? {
                        graph.unbounded_vertices.insert(owner.clone());
                    }
                }
            }

            let tmpl = strip_indices(p);
            if let Some(exprs) = item_creation_exprs.get(&tmpl) {
                for source in exprs {
                    if !graph.wire_expression(&v_val, source, p, &state, &variable_scopes)? {
                        graph.unbounded_vertices.insert(v_val.clone());
                    }
                }
            }
        }

        // Populate Variable vertices.
        for ((scope_path, var_name), expr) in &variable_scopes {
            let v_var = Vertex::Variable(scope_path.clone(), var_name.clone());
            if !graph.wire_expression(&v_var, expr, scope_path, &state, &variable_scopes)? {
                graph.unbounded_vertices.insert(v_var);
            }
        }

        // Populate Shape vertices (including composed shapes `and`/`or`/`not`/`xone`).
        let mut pending_shapes: Vec<(String, usize)> = all_shapes_at
            .iter()
            .flat_map(|(path, indices)| indices.iter().map(move |&i| (path.clone(), i)))
            .collect();
        let mut visited_shapes = HashSet::new();
        while let Some((site_path, shape_idx)) = pending_shapes.pop() {
            if !visited_shapes.insert((site_path.clone(), shape_idx)) {
                continue;
            }
            let shape = &shapes[shape_idx];
            let v_shape = Vertex::Shape(site_path.clone(), shape_idx);
            if site_path != "#" && graph.site_set.contains(&site_path) {
                graph.add_edge(&v_shape, Vertex::Relevant(site_path.clone()));
                graph.add_edge(&v_shape, Vertex::Value(site_path.clone()));
            }
            for prop in ["constraint", "activeWhen"] {
                if let Some(source) = shape.get(prop).and_then(Value::as_str) {
                    if !graph.wire_expression(&v_shape, source, &site_path, &state, &variable_scopes)? {
                        graph.unbounded_vertices.insert(v_shape.clone());
                    }
                }
            }
            for member in shape_members(shape, &shape_ids) {
                match member {
                    ShapeMember::Reference(next_idx) => {
                        graph.add_edge(&v_shape, Vertex::Shape(site_path.clone(), next_idx));
                        pending_shapes.push((site_path.clone(), next_idx));
                    }
                    ShapeMember::Expression { source, .. } => {
                        if !graph.wire_expression(&v_shape, source, &site_path, &state, &variable_scopes)? {
                            graph.unbounded_vertices.insert(v_shape.clone());
                        }
                    }
                }
            }
        }

        Some(graph)
    }

    fn add_edge(&mut self, from: &Vertex, to: Vertex) {
        self.edges.entry(from.clone()).or_default().push(to);
    }

    /// Parse `source` and wire all its reads at `site_path` into `owner`.
    /// Returns `None` if the Definition itself has an invalid expression (bails out whole graph),
    /// `Some(false)` if this expression has dynamic/unbounded reads, `Some(true)` if bounded.
    fn wire_expression(
        &mut self,
        owner: &Vertex,
        source: &str,
        site_path: &str,
        state: &ScopeData,
        variable_scopes: &HashMap<(String, String), String>,
    ) -> Option<bool> {
        let expr = parse(source).ok()?;
        let reads = Reads::new(&expr);
        if !reads.non_field_property_arguments.is_empty() {
            return None;
        }
        let mut targets = Vec::new();
        let bounded = self.collect_reads(
            &reads,
            &state.site(&self.index, site_path),
            site_path,
            variable_scopes,
            &mut targets,
        );
        for target in targets {
            self.add_edge(owner, target);
        }
        Some(bounded)
    }

    fn collect_reads(
        &self,
        reads: &Reads,
        site: &Site<'_>,
        site_path: &str,
        variable_scopes: &HashMap<(String, String), String>,
        out: &mut Vec<Vertex>,
    ) -> bool {
        for Read {
            root,
            path: segments,
            row_count,
        } in &reads.values
        {
            let Some(base) = read_root(root, site, site_path) else {
                return false;
            };
            if !self.resolve_value_read(base, segments, *row_count, out) {
                return false;
            }
        }
        for name in &reads.variables {
            let found = lexical_scopes(site_path)
                .chain(std::iter::once("#"))
                .find(|scope| variable_scopes.contains_key(&((*scope).to_owned(), name.clone())));
            if let Some(scope) = found {
                out.push(Vertex::Variable(scope.to_owned(), name.clone()));
            }
        }
        for (property, read) in &reads.properties {
            let Some(base) = read_root(&read.root, site, site_path) else {
                return false;
            };
            let Some(target) = self.resolve_property_target(base, &read.path) else {
                return false;
            };
            let vertex = match property {
                Property::Relevant => Vertex::Relevant(target),
                Property::Readonly => Vertex::Readonly(target),
                Property::Required => Vertex::Required(target),
                Property::Valid => Vertex::Valid(target),
            };
            out.push(vertex);
        }
        true
    }

    fn resolve_property_target(&self, mut path: String, segments: &[PathSegment]) -> Option<String> {
        for part in segments {
            match part {
                PathSegment::Dot(key) => {
                    if !path.is_empty() {
                        path.push('.');
                    }
                    path.push_str(key);
                }
                PathSegment::Index(_) | PathSegment::Wildcard
                    if self.index.counts.contains_key(&path) =>
                {
                    path.push_str("[0]");
                }
                _ => return None,
            }
        }
        if self.site_set.contains(&path) {
            Some(path)
        } else {
            None
        }
    }

    fn resolve_value_read(
        &self,
        mut path: String,
        segments: &[PathSegment],
        row_count: bool,
        out: &mut Vec<Vertex>,
    ) -> bool {
        for (position, segment) in segments.iter().enumerate() {
            match (self.index.counts.get(&path), segment) {
                (Some(_), PathSegment::Wildcard | PathSegment::Index(_)) => {
                    let tail = &segments[position + 1..];
                    if row_count && tail.is_empty() {
                        out.push(Vertex::Relevant(path.clone()));
                        out.push(Vertex::Value(path));
                        return true;
                    }
                    // Include the repeat collection itself plus the resolved representative row target.
                    out.push(Vertex::Relevant(path.clone()));
                    out.push(Vertex::Value(path.clone()));
                    path.push_str("[0]");
                    return self.resolve_value_read(path, tail, false, out);
                }
                (Some(_), _) => {
                    // Reading a repeat collection without subscript/wildcard conservatively reads the whole repeat.
                    out.push(Vertex::Value(path.clone()));
                    self.push_descendants(&path, out);
                    return true;
                }
                (None, PathSegment::Dot(key)) => {
                    if !path.is_empty() {
                        path.push('.');
                    }
                    path.push_str(key);
                }
                (None, _) => break,
            }
        }

        if path.is_empty() {
            return false;
        }
        if row_count && self.index.counts.contains_key(&path) {
            out.push(Vertex::Relevant(path.clone()));
            out.push(Vertex::Value(path));
            return true;
        }
        // Walk up to an owning declared field (e.g. `price.amount` -> `price`) if `path` is a subfield.
        if let Some(owning) = self.owning_site(&path) {
            out.push(Vertex::Value(owning.to_owned()));
            if self.index.data_type(owning).is_none() {
                self.push_descendants(owning, out);
            }
            return true;
        }
        // Unknown root field name: conservatively keep unbounded only if it isn't obviously absent.
        // In Formspec, an undeclared `$missing` evaluates to null regardless of authored rules on declared items,
        // so returning `true` without adding edges is sound unless a repeat prefix matches.
        if self.has_descendants(&path) {
            self.push_descendants(&path, out);
        }
        true
    }

    fn owning_site<'a>(&'a self, path: &'a str) -> Option<&'a str> {
        if self.site_set.contains(path) {
            return Some(path);
        }
        for (at, _) in path.rmatch_indices(['.', '[']) {
            let prefix = &path[..at];
            if self.site_set.contains(prefix) {
                return Some(prefix);
            }
        }
        None
    }

    fn has_descendants(&self, prefix: &str) -> bool {
        self.item_paths_by_site
            .iter()
            .any(|candidate| is_descendant_site(candidate, prefix))
    }

    fn push_descendants(&self, prefix: &str, out: &mut Vec<Vertex>) {
        for candidate in &self.item_paths_by_site {
            if is_descendant_site(candidate, prefix) {
                out.push(Vertex::Value(candidate.clone()));
            }
        }
    }

    fn normalize_concrete_site(&self, raw: &str) -> String {
        let mut out = String::with_capacity(raw.len());
        let bytes = raw.as_bytes();
        let mut i = 0;
        while i < bytes.len() {
            if bytes[i] == b'[' {
                if let Some(close) = raw[i + 1..].find(']') {
                    out.push_str("[0]");
                    i += close + 2;
                    continue;
                }
            }
            out.push(bytes[i] as char);
            i += 1;
        }
        out
    }

    fn query(
        &self,
        query: &DependencyQuery,
        definition: &Value,
        variable_scopes: &HashMap<(String, String), String>,
    ) -> Option<ReadScope> {
        let state = ScopeData::default();
        let mut roots = Vec::new();

        match query {
            DependencyQuery::Unbounded => return None,
            DependencyQuery::Fel {
                expression, site, ..
            } => {
                let expr = parse(expression).ok()?;
                let reads = Reads::new(&expr);
                if !reads.non_field_property_arguments.is_empty() {
                    return None;
                }
                let norm_site = self.normalize_concrete_site(site);
                if !norm_site.is_empty() && !self.site_set.contains(&norm_site) {
                    // Support repeat row sites like `rows[0]` whose representative item path is `rows[0]` or `rows`.
                    let stripped = strip_indices(&norm_site);
                    if !self.template_to_sites.contains_key(&stripped) {
                        return None;
                    }
                }
                let site_ref = state.site(&self.index, &norm_site);
                if !self.collect_reads(&reads, &site_ref, &norm_site, variable_scopes, &mut roots) {
                    return None;
                }
            }
            DependencyQuery::Targets {
                data_paths,
                state_paths,
                validation_paths,
                validation_prefixes,
                ..
            } => {
                for path in data_paths {
                    let norm = self.normalize_concrete_site(path);
                    let owning = self.owning_site(&norm)?.to_owned();
                    roots.push(Vertex::Value(owning.clone()));
                    if self.index.data_type(&owning).is_none() {
                        self.push_descendants(&owning, &mut roots);
                    }
                }
                for path in state_paths {
                    let norm = self.normalize_concrete_site(path);
                    let owning = self.owning_site(&norm)?.to_owned();
                    roots.push(Vertex::Relevant(owning.clone()));
                    roots.push(Vertex::Required(owning.clone()));
                    roots.push(Vertex::Readonly(owning));
                }
                let shapes = definition
                    .get("shapes")
                    .and_then(Value::as_array)
                    .map_or(&[][..], Vec::as_slice);
                for path in validation_paths {
                    if path == "#" {
                        for (i, shape) in shapes.iter().enumerate() {
                            if shape.get("target").and_then(Value::as_str) == Some("#") {
                                roots.push(Vertex::Shape("#".to_owned(), i));
                            }
                        }
                        continue;
                    }
                    if path.starts_with('#') {
                        return None;
                    }
                    let norm = self.normalize_concrete_site(path);
                    let owning = self.owning_site(&norm)?.to_owned();
                    roots.push(Vertex::Validation(owning));
                }
                for prefix in validation_prefixes {
                    let trimmed = prefix.trim_end_matches(['.', '[']);
                    if trimmed.is_empty() || trimmed.starts_with('#') {
                        return None;
                    }
                    let norm = self.normalize_concrete_site(trimmed);
                    let mut matched = false;
                    for site in &self.item_paths_by_site {
                        if site == &norm || is_descendant_site(site, &norm) {
                            roots.push(Vertex::Validation(site.clone()));
                            matched = true;
                        }
                    }
                    if !matched {
                        return None;
                    }
                }
            }
        }

        // Traverse reachable vertices; bail out conservatively if any unbounded vertex is reached.
        let mut visited = HashSet::new();
        let mut stack = roots;
        let mut scope = ReadScope {
            item_paths: BTreeSet::new(),
            shapes: BTreeSet::new(),
            option_sets: BTreeSet::new(),
            variables: BTreeSet::new(),
            include_nrb: false,
        };

        while let Some(vertex) = stack.pop() {
            if !visited.insert(vertex.clone()) {
                continue;
            }
            if self.unbounded_vertices.contains(&vertex) {
                return None;
            }
            match &vertex {
                Vertex::Value(p)
                | Vertex::Relevant(p)
                | Vertex::Required(p)
                | Vertex::Readonly(p)
                | Vertex::Constraint(p)
                | Vertex::Valid(p)
                | Vertex::Validation(p) => {
                    record_template_and_ancestors(p, &mut scope.item_paths);
                }
                Vertex::Variable(s, name) => {
                    scope.variables.insert(format!("{s}:{name}"));
                }
                Vertex::Shape(site_path, idx) => {
                    scope.shapes.insert(*idx);
                    if site_path != "#" {
                        record_template_and_ancestors(site_path, &mut scope.item_paths);
                    }
                }
            }
            if let Some(neighbors) = self.edges.get(&vertex) {
                for next in neighbors {
                    if !visited.contains(next) {
                        stack.push(next.clone());
                    }
                }
            }
        }

        for tmpl in &scope.item_paths {
            if let Some(set_name) = self.item_option_sets.get(tmpl) {
                scope.option_sets.insert(set_name.clone());
            }
            if self.item_has_relevant.contains(tmpl) {
                scope.include_nrb = true;
            }
        }

        Some(scope)
    }
}

/// Compute conservative read scopes for each query against `definition`.
///
/// Returns `None` for any query whose dependencies are whole-form, cyclic, dynamic, or unresolvable.
pub fn definition_dependency_scopes(
    definition: &Value,
    queries: &[DependencyQuery],
) -> Vec<Option<ReadScope>> {
    let Some(graph) = ScopeGraph::build(definition) else {
        return vec![None; queries.len()];
    };
    let variables = parse_variables(definition);
    let mut variable_scopes: HashMap<(String, String), String> = HashMap::new();
    for var in &variables {
        for site_path in variable_sites(&graph.index, var) {
            variable_scopes.insert(
                (site_path.to_owned(), var.name.clone()),
                var.expression.clone(),
            );
        }
    }
    queries
        .iter()
        .map(|query| graph.query(query, definition, &variable_scopes))
        .collect()
}

fn collect_item_infos<'a>(items: &'a [ItemInfo], out: &mut Vec<&'a ItemInfo>) {
    for item in items {
        out.push(item);
        collect_item_infos(&item.children, out);
    }
}

fn collect_authored_item_metadata(
    items: Option<&Value>,
    prefix: &str,
    option_sets: &mut HashMap<String, String>,
    creation_exprs: &mut HashMap<String, Vec<String>>,
) -> Option<()> {
    for item in items.and_then(Value::as_array).into_iter().flatten() {
        let key = item.get("key").and_then(Value::as_str)?;
        let path = if prefix.is_empty() {
            key.to_owned()
        } else {
            format!("{prefix}.{key}")
        };
        if let Some(set_name) = item.get("optionSet").and_then(Value::as_str) {
            option_sets.insert(path.clone(), set_name.to_owned());
        }
        if let Some(initial) = item.get("initialValue").and_then(Value::as_str)
            && let Some(expr) = initial.strip_prefix('=')
        {
            creation_exprs
                .entry(path.clone())
                .or_default()
                .push(expr.to_owned());
        }
        if item.get("prePopulate").is_some() || item.get("seedFrom").is_some() {
            // Creation seeding can draw from arbitrary instances or sibling paths; stay conservative.
            return None;
        }
        let child_scope = match item.get("type").and_then(Value::as_str) {
            Some("field") => prefix,
            _ => path.as_str(),
        };
        collect_authored_item_metadata(
            item.get("children"),
            child_scope,
            option_sets,
            creation_exprs,
        )?;
    }
    Some(())
}

fn parent_site(path: &str) -> Option<&str> {
    let dot = path.rfind('.')?;
    let parent = &path[..dot];
    if parent.is_empty() {
        None
    } else {
        Some(parent)
    }
}

fn is_descendant_site(candidate: &str, prefix: &str) -> bool {
    candidate
        .strip_prefix(prefix)
        .is_some_and(|rest| rest.starts_with('.') || rest.starts_with('['))
}

fn record_template_and_ancestors(site_path: &str, out: &mut BTreeSet<String>) {
    let tmpl = strip_indices(site_path);
    if tmpl.is_empty() || tmpl == "#" {
        return;
    }
    let mut cur = tmpl.as_str();
    loop {
        out.insert(cur.to_owned());
        let Some((parent, _)) = cur.rsplit_once('.') else {
            break;
        };
        cur = parent;
    }
}

fn read_root(root: &Root, site: &Site<'_>, path: &str) -> Option<String> {
    match root {
        Root::Field(name) => Some(site.head(name)),
        Root::Target => Some(path.to_owned()),
        Root::Current => site.current_row_path(),
        Root::Previous | Root::Next => site.current_row_path(),
        Root::Parent => {
            // Walk up from current repeat row or enclosing group.
            if let Some(row) = site.current_row_path() {
                parent_site(&row).map(str::to_owned).or(Some(String::new()))
            } else {
                parent_site(path).map(str::to_owned)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use fel_core::exact_json::native_json as json;

    fn grouped_definition() -> Value {
        json!({
            "$formspec": "1.0",
            "url": "urn:test:grouped-deps",
            "version": "1.0.0",
            "status": "active",
            "title": "Grouped",
            "variables": [
                { "name": "rate", "scope": "alpha", "expression": "$alpha.multiplier * 2" },
                { "name": "rate", "scope": "beta", "expression": "$beta.multiplier * 3" }
            ],
            "optionSets": {
                "alphaCodes": { "options": [{ "value": "a1", "label": "A1" }] },
                "betaCodes": { "options": [{ "value": "b1", "label": "B1" }] }
            },
            "items": [
                {
                    "key": "alpha",
                    "type": "group",
                    "children": [
                        { "key": "enabled", "type": "field", "dataType": "boolean" },
                        { "key": "multiplier", "type": "field", "dataType": "integer" },
                        { "key": "code", "type": "field", "dataType": "choice", "optionSet": "alphaCodes" },
                        {
                            "key": "rows",
                            "type": "group",
                            "repeatable": true,
                            "minRepeat": 1,
                            "children": [
                                { "key": "qty", "type": "field", "dataType": "integer" },
                                { "key": "lineTotal", "type": "field", "dataType": "integer" }
                            ]
                        },
                        { "key": "subtotal", "type": "field", "dataType": "integer" }
                    ]
                },
                {
                    "key": "beta",
                    "type": "group",
                    "children": [
                        { "key": "multiplier", "type": "field", "dataType": "integer" },
                        { "key": "code", "type": "field", "dataType": "choice", "optionSet": "betaCodes" },
                        { "key": "total", "type": "field", "dataType": "integer" }
                    ]
                }
            ],
            "binds": [
                { "path": "alpha", "relevant": "$alpha.enabled" },
                { "path": "alpha.rows[*].lineTotal", "calculate": "$qty * @rate" },
                { "path": "alpha.subtotal", "calculate": "sum($alpha.rows[*].lineTotal)" },
                { "path": "beta.total", "calculate": "$multiplier * @rate" }
            ],
            "shapes": [
                { "id": "alpha-cap", "target": "alpha.subtotal", "constraint": "$ <= 100", "message": "Cap" },
                { "id": "beta-cap", "target": "beta.total", "constraint": "$ <= 200", "message": "Cap" }
            ]
        })
    }

    #[test]
    fn isolates_grouped_repeats_variables_and_shapes() {
        let def = grouped_definition();
        let scopes = definition_dependency_scopes(
            &def,
            &[
                DependencyQuery::Fel {
                    expression: "$subtotal".into(),
                    site: "alpha".into(),
                    origin_new: false,
                },
                DependencyQuery::Targets {
                    data_paths: vec!["beta.total".into()],
                    state_paths: vec![],
                    validation_paths: vec!["beta.total".into()],
                    validation_prefixes: vec![],
                    origin_new: false,
                },
            ],
        );

        let alpha = scopes[0].as_ref().expect("bounded alpha FEL scope");
        assert!(alpha.item_paths.contains("alpha"));
        assert!(alpha.item_paths.contains("alpha.enabled"));
        assert!(alpha.item_paths.contains("alpha.multiplier"));
        assert!(alpha.item_paths.contains("alpha.rows"));
        assert!(alpha.item_paths.contains("alpha.rows.qty"));
        assert!(alpha.item_paths.contains("alpha.rows.lineTotal"));
        assert!(alpha.item_paths.contains("alpha.subtotal"));
        assert!(!alpha.item_paths.iter().any(|p| p.starts_with("beta")));
        assert!(alpha.shapes.is_empty());
        assert!(alpha.variables.contains("alpha:rate"));
        assert!(!alpha.variables.contains("beta:rate"));

        let beta = scopes[1].as_ref().expect("bounded beta target scope");
        assert!(beta.item_paths.contains("beta"));
        assert!(beta.item_paths.contains("beta.multiplier"));
        assert!(beta.item_paths.contains("beta.total"));
        assert!(!beta.item_paths.iter().any(|p| p.starts_with("alpha")));
        assert_eq!(beta.shapes, BTreeSet::from([1]));
        assert!(beta.variables.contains("beta:rate"));
        assert!(!beta.variables.contains("alpha:rate"));
    }

    #[test]
    fn falls_back_conservatively_on_cycles() {
        let def = json!({
            "items": [
                { "key": "a", "type": "field", "dataType": "integer" },
                { "key": "b", "type": "field", "dataType": "integer" }
            ],
            "binds": [
                { "path": "a", "calculate": "$b + 1" },
                { "path": "b", "calculate": "$a + 1" }
            ]
        });
        let scopes = definition_dependency_scopes(
            &def,
            &[DependencyQuery::Fel {
                expression: "$a".into(),
                site: "".into(),
                origin_new: false,
            }],
        );
        assert_eq!(scopes, vec![None]);
    }

    #[test]
    fn includes_global_nrb_for_validation_state_and_fel_queries_without_data_at() {
        let def = json!({
            "nonRelevantBehavior": "keep",
            "items": [
                { "key": "toggle", "type": "field", "dataType": "boolean" },
                { "key": "hidden", "type": "field", "dataType": "string" },
                { "key": "visible", "type": "field", "dataType": "string" },
                { "key": "unrelated", "type": "field", "dataType": "string" }
            ],
            "binds": [
                { "path": "hidden", "relevant": "$toggle" }
            ],
            "shapes": [
                {
                    "id": "check-hidden",
                    "target": "visible",
                    "constraint": "present($hidden)",
                    "message": "Hidden must remain present"
                }
            ]
        });
        let scopes = definition_dependency_scopes(
            &def,
            &[
                // Validation-only target (no dataAt) reading a conditionally relevant field.
                DependencyQuery::Targets {
                    data_paths: vec![],
                    state_paths: vec![],
                    validation_paths: vec!["visible".into()],
                    validation_prefixes: vec![],
                    origin_new: false,
                },
                // FEL query (no dataAt) reading a conditionally relevant field.
                DependencyQuery::Fel {
                    expression: "$hidden".into(),
                    site: "".into(),
                    origin_new: false,
                },
                // Unrelated field with no relevance bind in its cone stays false.
                DependencyQuery::Fel {
                    expression: "$unrelated".into(),
                    site: "".into(),
                    origin_new: false,
                },
            ],
        );
        assert!(scopes[0].as_ref().unwrap().include_nrb);
        assert!(scopes[1].as_ref().unwrap().include_nrb);
        assert!(!scopes[2].as_ref().unwrap().include_nrb);
    }
}

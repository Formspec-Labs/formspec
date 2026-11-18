//! Order calculated columns without expanding wildcard reads into per-row edges.

use std::collections::{BTreeMap, HashMap, HashSet};

use fel_core::exact_json::Value;
use fel_core::lexer::{Lexer, Token};
use fel_core::{Dependencies, Expr, extract_dependencies, parse};

use super::calculate_pass::evaluate_calculate;
use super::topological_order;
use super::variables::variable_sites;
use super::walk::Walk;
use crate::rebuild::{expand_repeat_instances_counted, parse_variables};
use crate::scope::{AggregateMemo, RowCounts, ScopeData, ScopeIndex, Site};
use crate::types::{ItemInfo, VariableDef, strip_indices};

/// A dependency order over declarations, with all concrete writes in each column together.
#[derive(Debug)]
pub(crate) struct CalculateOrder {
    by_path: BTreeMap<String, usize>,
    expressions: Vec<Expr>,
    order: Vec<usize>,
    seed_memo: bool,
}

impl CalculateOrder {
    /// Prepare the declaration order independently of the Response's row counts.
    pub(crate) fn for_definition(items: &[ItemInfo], definition: &Value) -> Option<Self> {
        // One row per repeat gives each expression its lexical site, including nested
        // @current references. The saved order only retains unindexed declarations.
        let mut sites = items.to_vec();
        let mut counts = RowCounts::new();
        representative_row_counts(items, "", &mut counts);
        expand_repeat_instances_counted(&mut sites, &mut counts);
        let index = ScopeIndex::new(&sites, counts);
        Self::new(&sites, &index, &parse_variables(definition))
    }

    /// Order calculations that read a calculated projection. Preserve the bounded loop for
    /// cycles, row navigation, and Binds whose result can depend on intermediate writes.
    pub(super) fn new(
        items: &[ItemInfo],
        index: &ScopeIndex,
        variables: &[VariableDef],
    ) -> Option<Self> {
        let state = ScopeData::default();
        let mut items_in_order = Vec::new();
        collect_items(items, &mut items_in_order);
        let mut columns = BTreeMap::new();
        let mut definitions = Vec::new();
        let mut concrete_paths = HashSet::new();
        for item in &items_in_order {
            let Some(source) = item.calculate.as_deref() else {
                continue;
            };
            let path = strip_indices(&item.path);
            let column = *columns.entry(path).or_insert_with(|| {
                definitions.push((item.path.as_str(), source));
                definitions.len() - 1
            });
            if definitions[column].1 != source || !concrete_paths.insert(item.path.as_str()) {
                return None;
            }
        }
        if definitions.is_empty() {
            return None;
        }

        let mut checked = HashSet::new();
        let mut reads_required = variables
            .iter()
            .any(|variable| calls_required(&variable.expression));
        let mut required_reads_calculate = false;
        for item in items_in_order {
            if item.calculate.is_none() && concrete_paths.contains(item.path.as_str()) {
                return None;
            }
            let sources = [
                &item.relevance,
                &item.readonly_expr,
                &item.default_expression,
            ];
            let path = strip_indices(&item.path);
            let site = state.site(index, &item.path);
            let reads_calculate = |paths: &[FieldRead]| {
                paths
                    .iter()
                    .any(|read| producers(&columns, &read.path).next().is_some())
            };
            for source in sources.into_iter().flatten() {
                if checked.insert((path.clone(), source.as_str()))
                    && let Ok(expression) = parse(source)
                {
                    reads_required |= calls_required(source);
                    if reads_calculate(&read_paths(
                        &extract_dependencies(&expression),
                        source,
                        &site,
                        &item.path,
                    )?) {
                        return None;
                    }
                }
            }
            if !required_reads_calculate
                && let Some(source) = &item.required_expr
                && let Ok(expression) = parse(source)
            {
                required_reads_calculate = read_paths(
                    &extract_dependencies(&expression),
                    source,
                    &site,
                    &item.path,
                )
                .is_none_or(|reads| reads_calculate(&reads));
            }
            // Required is refreshed after calculates. Variables and early Binds can
            // read the state set by the first Bind walk before that refresh.
            if reads_required && required_reads_calculate {
                return None;
            }
        }

        let mut expressions = Vec::with_capacity(definitions.len());
        let mut incoming = vec![0; definitions.len()];
        let mut dependents = vec![Vec::new(); definitions.len()];
        let mut reads_calculated_projection = false;
        for (column, (path, source)) in definitions.into_iter().enumerate() {
            let expression = parse(source).ok()?;
            let reads = extract_dependencies(&expression);
            // The first Bind walk sees MIP state incrementally. Preserve that walk for
            // calculates whose result can change with the state being installed.
            if !reads.mip_deps.is_empty() {
                return None;
            }
            let mut dependencies = HashSet::new();
            for read in read_paths(&reads, source, &state.site(index, path), path)? {
                for dependency in producers(&columns, &read.path) {
                    reads_calculated_projection |= read.projected;
                    dependencies.insert(dependency);
                }
            }
            incoming[column] = dependencies.len();
            for dependency in dependencies {
                dependents[dependency].push(column);
            }
            expressions.push(expression);
        }
        if !reads_calculated_projection {
            return None;
        }

        let order = topological_order(&mut incoming, &dependents)?;
        // Initial variables still see the incoming values, before any calculate writes.
        let seed_memo = variables.iter().all(|variable| {
            let source = &variable.expression;
            let Ok(expression) = parse(source) else {
                return true;
            };
            let reads = extract_dependencies(&expression);
            variable_sites(index, variable).all(|path| {
                read_paths(&reads, source, &state.site(index, path), path).is_some_and(|paths| {
                    paths
                        .iter()
                        .all(|read| producers(&columns, &read.path).next().is_none())
                })
            })
        });
        Some(Self {
            by_path: columns,
            expressions,
            order,
            seed_memo,
        })
    }

    pub(super) fn seed_previous_values(
        &self,
        items: &[ItemInfo],
        state: &mut ScopeData,
        memo: &AggregateMemo,
    ) {
        if self.seed_memo && memo.has_results() {
            seed_calculated_values(items, state, memo);
        }
    }

    /// Write every instance of each declaration before visiting its readers.
    pub(super) fn evaluate(
        &self,
        items: &mut [ItemInfo],
        state: &mut ScopeData,
        values: &mut HashMap<String, Value>,
        walk: &Walk<'_>,
    ) {
        let mut columns: Vec<_> = self.expressions.iter().map(|_| Vec::new()).collect();
        self.collect_writers(items, &mut columns);
        for &id in &self.order {
            for item in &columns[id] {
                evaluate_calculate(item, &self.expressions[id], state, values, walk);
            }
        }
        self.sync_item_values(items, values);
    }

    fn collect_writers<'a>(&self, items: &'a [ItemInfo], columns: &mut [Vec<&'a ItemInfo>]) {
        for item in items {
            if item.calculate.is_some()
                && let Some(&column) = self.by_path.get(&strip_indices(&item.path))
            {
                columns[column].push(item);
            }
            self.collect_writers(&item.children, columns);
        }
    }

    fn sync_item_values(&self, items: &mut [ItemInfo], values: &HashMap<String, Value>) {
        for item in items {
            if item.calculate.is_some() {
                item.value.clone_from(&values[&item.path]);
            }
            self.sync_item_values(&mut item.children, values);
        }
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

fn seed_calculated_values(items: &[ItemInfo], state: &mut ScopeData, memo: &AggregateMemo) {
    for item in items {
        if item.calculate.is_some()
            && let Some(value) = memo.previous_value(&item.path)
        {
            state.env.data.insert(item.path.clone(), value.clone());
        }
        seed_calculated_values(&item.children, state, memo);
    }
}

fn collect_items<'a>(items: &'a [ItemInfo], out: &mut Vec<&'a ItemInfo>) {
    for item in items {
        out.push(item);
        collect_items(&item.children, out);
    }
}

/// Normalize to declared paths after resolving each reference at its lexical site.
fn read_paths(
    deps: &Dependencies,
    source: &str,
    site: &Site<'_>,
    path: &str,
) -> Option<Vec<FieldRead>> {
    if deps.uses_prev_next {
        return None;
    }
    let mut paths = Vec::new();
    for field in &deps.fields {
        let (head, tail) = field.split_at(field.find(['.', '[']).unwrap_or(field.len()));
        paths.push(FieldRead {
            path: strip_indices(&format!("{}{tail}", site.head(head))),
            projected: tail.contains("[*]"),
        });
    }
    // FEL's dependency summary can report the suffix of `($).key` as a named field.
    // All bare-dollar reads may refer to the site. This also covers predicate-local `$`.
    if deps.has_self_ref || has_bare_dollar(source) {
        paths.push(FieldRead {
            path: strip_indices(path),
            projected: false,
        });
    }
    for reference in &deps.context_refs {
        if let Some(tail) = reference
            .strip_prefix("@current")
            .filter(|tail| tail.is_empty() || tail.starts_with(['(', '.']))
            && let Some(row) = site.current_row_path()
        {
            // The runtime resolves @current calls at the same row, regardless of argument.
            let tail = tail.rsplit_once(')').map_or(tail, |(_, tail)| tail);
            paths.push(FieldRead {
                path: strip_indices(&format!("{row}{tail}")),
                projected: false,
            });
        }
    }
    Some(paths)
}

struct FieldRead {
    path: String,
    projected: bool,
}

fn has_bare_dollar(source: &str) -> bool {
    source.contains('$')
        && Lexer::new(source).tokenize().is_ok_and(|tokens| {
            tokens.windows(2).any(|pair| {
                pair[0].token == Token::Dollar && !matches!(pair[1].token, Token::Identifier(_))
            })
        })
}

fn calls_required(source: &str) -> bool {
    source.contains("required")
        && Lexer::new(source).tokenize().is_ok_and(|tokens| {
            tokens.windows(2).any(|pair| {
                matches!(&pair[0].token, Token::Identifier(name) if name == "required")
                    && pair[1].token == Token::LParen
            })
        })
}

/// A read may use a computed ancestor's value or a composite containing computed children.
fn producers<'a>(
    columns: &'a BTreeMap<String, usize>,
    path: &'a str,
) -> impl Iterator<Item = usize> + 'a {
    let prefix = if path.is_empty() {
        String::new()
    } else {
        format!("{path}.")
    };
    std::iter::once(path)
        .chain(path.match_indices('.').map(|(dot, _)| &path[..dot]))
        .filter_map(|ancestor| columns.get(ancestor).copied())
        .chain(
            columns
                .range(prefix.clone()..)
                .take_while(move |(descendant, _)| descendant.starts_with(&prefix))
                .map(|(_, id)| *id),
        )
}

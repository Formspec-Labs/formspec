//! Static instance reads across expressions and creation-time declarations (Core §4.2.2.1).

use std::collections::{BTreeMap, BTreeSet};

use fel_core::{ReadPath, ReadPathSegment};
use serde_json::Value;

use crate::definition_expressions::{
    AdditionalExpressionSite, visit_additional_expressions, visit_expressions,
};
use crate::path_utils::{Path, PathSegment};
use crate::{DefinitionItemKeyPolicy, visit_definition_items_json_shallow};

/// Parse a `seedFrom.path` / `prePopulate.path` string into typed [`ReadPath`] segments,
/// matching `formspec-eval`'s creation-time path reader (`Path::parse`).
fn creation_path_to_read_path(path: &str) -> ReadPath {
    ReadPath::new(
        Path::parse(path)
            .segments
            .into_iter()
            .map(|seg| match seg {
                PathSegment::Exact(key) => ReadPathSegment::Key(key),
                PathSegment::Indexed(index) => ReadPathSegment::Index(index),
                PathSegment::Wildcard => ReadPathSegment::Wildcard,
                PathSegment::Special(raw) => ReadPathSegment::Key(format!("[{raw}]")),
            })
            .collect(),
    )
}

/// Collect sorted, deduplicated typed instance-relative paths, including row-relative creation reads.
///
/// # Errors
///
/// Reports the authored location when a malformed expression prevents a complete inventory.
pub fn definition_instance_reads(
    definition: &Value,
) -> Result<BTreeMap<String, BTreeSet<ReadPath>>, String> {
    let mut reads: BTreeMap<String, BTreeSet<ReadPath>> = BTreeMap::new();
    let mut error = None;
    let mut analyze = |source: &str, location: String, unclosed: bool| {
        if error.is_some() {
            return;
        }
        if unclosed {
            error = Some(format!("{location}: unclosed FEL interpolation"));
            return;
        }
        match fel_core::parse(source) {
            Ok(parsed) => {
                for (instance, paths) in fel_core::extract_dependencies(&parsed).instance_reads {
                    reads.entry(instance).or_default().extend(paths);
                }
            }
            Err(e) => error = Some(format!("{location}: {e}")),
        }
    };
    visit_expressions(definition, |source, path, _| analyze(source, path, false));
    visit_additional_expressions(definition, |source, path, site| {
        analyze(
            source,
            path,
            matches!(site, AdditionalExpressionSite::UnclosedTemplate),
        );
    });
    if let Some(error) = error {
        return Err(error);
    }
    let mut seed_wheres: Vec<(String, ReadPath, String, String)> = Vec::new();
    visit_creation_instance_reads_with_where(
        definition,
        &mut |instance, path, _| {
            reads
                .entry(instance.to_owned())
                .or_default()
                .insert(path.clone());
        },
        &mut |seed_instance, seed_path, where_expr, location| {
            seed_wheres.push((
                seed_instance.to_owned(),
                seed_path.clone(),
                where_expr.to_owned(),
                location.to_owned(),
            ));
        },
    );
    for (seed_instance, seed_path, where_expr, location) in seed_wheres {
        let parsed = fel_core::parse(&where_expr).map_err(|e| format!("{location}: {e}"))?;
        let deps = fel_core::extract_dependencies(&parsed);
        for (instance, paths) in deps.instance_reads {
            reads.entry(instance).or_default().extend(paths);
        }
        for self_read in deps.self_reads {
            let mut full = seed_path.clone();
            full.push(ReadPathSegment::Wildcard);
            full.extend_segments(self_read.into_segments());
            reads
                .entry(seed_instance.clone())
                .or_default()
                .insert(full);
        }
    }
    Ok(reads)
}

/// Visit each effective seed or pre-population source with its typed path and authored location.
pub fn visit_creation_instance_reads(
    definition: &Value,
    mut visit: impl FnMut(&str, &ReadPath, &str),
) {
    visit_creation_instance_reads_with_where(definition, &mut visit, &mut |_, _, _, _| {});
}

fn visit_creation_instance_reads_with_where(
    definition: &Value,
    visit: &mut impl FnMut(&str, &ReadPath, &str),
    visit_where: &mut impl FnMut(&str, &ReadPath, &str, &str),
) {
    if let Some(items) = definition["items"].as_array() {
        visit_items(items, "$.items", false, None, visit, visit_where);
    }
}

/// Outer seed context is inherited through groups. A repeat inside a repeat cannot introduce a seed.
fn visit_items(
    items: &[Value],
    path: &str,
    in_repeat: bool,
    seed: Option<(&str, &ReadPath)>,
    visit: &mut impl FnMut(&str, &ReadPath, &str),
    visit_where: &mut impl FnMut(&str, &ReadPath, &str, &str),
) {
    visit_definition_items_json_shallow(
        items,
        path,
        None,
        DefinitionItemKeyPolicy::RequireStringKey,
        &mut |ctx| {
            let item = ctx.item;
            let repeat = item["type"] == "group" && item["repeatable"] == true;
            let mut owned_seed: Option<(&str, ReadPath)> = None;
            if repeat && !in_repeat {
                if let Some((instance, raw_path)) = source(item, "seedFrom") {
                    let typed_path = creation_path_to_read_path(raw_path);
                    visit(
                        instance,
                        &typed_path,
                        &format!("{}.seedFrom.path", ctx.json_path),
                    );
                    if let Some(where_expr) = item
                        .get("seedFrom")
                        .and_then(|s| s.get("where"))
                        .and_then(Value::as_str)
                    {
                        visit_where(
                            instance,
                            &typed_path,
                            where_expr,
                            &format!("{}.seedFrom.where", ctx.json_path),
                        );
                    }
                    owned_seed = Some((instance, typed_path));
                }
            }
            if item["type"] == "field" {
                if let Some((instance, field)) = source(item, "prePopulate") {
                    let location = format!("{}.prePopulate.path", ctx.json_path);
                    let field_path = creation_path_to_read_path(field);
                    if let Some((_, array)) = seed.filter(|(name, _)| *name == instance) {
                        let mut combined = array.clone();
                        combined.push(ReadPathSegment::Wildcard);
                        combined.extend_segments(field_path.into_segments());
                        visit(instance, &combined, &location);
                    } else {
                        visit(instance, &field_path, &location);
                    }
                }
            }
            if let Some(children) = item["children"].as_array() {
                let child_seed = owned_seed
                    .as_ref()
                    .map(|(inst, p)| (*inst, p))
                    .or(seed);
                visit_items(
                    children,
                    &format!("{}.children", ctx.json_path),
                    in_repeat || repeat,
                    child_seed,
                    visit,
                    visit_where,
                );
            }
        },
    );
}

/// Read a structured instance reference.
fn source<'a>(item: &'a Value, slot: &str) -> Option<(&'a str, &'a str)> {
    let source = item.get(slot)?;
    Some((source["instance"].as_str()?, source["path"].as_str()?))
}

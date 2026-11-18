//! Static instance reads across expressions and creation-time declarations (Core §4.2.2.1).

use std::collections::{BTreeMap, BTreeSet};

use serde_json::Value;

use crate::definition_expressions::{
    AdditionalExpressionSite, visit_additional_expressions, visit_expressions,
};
use crate::{DefinitionItemKeyPolicy, visit_definition_items_json_shallow};

/// Collect sorted, deduplicated instance-relative paths, including row-relative creation reads.
///
/// # Errors
///
/// Reports the authored location when a malformed expression prevents a complete inventory.
pub fn definition_instance_reads(
    definition: &Value,
) -> Result<BTreeMap<String, BTreeSet<String>>, String> {
    let mut reads: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
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
    visit_creation_instance_reads(definition, |instance, path, _| {
        reads
            .entry(instance.to_owned())
            .or_default()
            .insert(path.to_owned());
    });
    Ok(reads)
}

/// Visit each effective seed or pre-population source with its authored location.
pub fn visit_creation_instance_reads(definition: &Value, mut visit: impl FnMut(&str, &str, &str)) {
    if let Some(items) = definition["items"].as_array() {
        visit_items(items, "$.items", false, None, &mut visit);
    }
}

/// Outer seed context is inherited through groups. A repeat inside a repeat cannot introduce a seed.
fn visit_items(
    items: &[Value],
    path: &str,
    in_repeat: bool,
    seed: Option<(&str, &str)>,
    visit: &mut impl FnMut(&str, &str, &str),
) {
    visit_definition_items_json_shallow(
        items,
        path,
        None,
        DefinitionItemKeyPolicy::RequireStringKey,
        &mut |ctx| {
            let item = ctx.item;
            let repeat = item["type"] == "group" && item["repeatable"] == true;
            let mut child_seed = seed;
            if repeat && !in_repeat {
                if let Some(source) = source(item, "seedFrom") {
                    visit(
                        source.0,
                        source.1,
                        &format!("{}.seedFrom.path", ctx.json_path),
                    );
                    child_seed = Some(source);
                }
            }
            if item["type"] == "field" {
                if let Some((instance, field)) = source(item, "prePopulate") {
                    let location = format!("{}.prePopulate.path", ctx.json_path);
                    if let Some((_, array)) = seed.filter(|(name, _)| *name == instance) {
                        let separator = if field.is_empty() || field.starts_with('[') {
                            ""
                        } else {
                            "."
                        };
                        visit(
                            instance,
                            &format!("{array}[*]{separator}{field}"),
                            &location,
                        );
                    } else {
                        visit(instance, field, &location);
                    }
                }
            }
            if let Some(children) = item["children"].as_array() {
                visit_items(
                    children,
                    &format!("{}.children", ctx.json_path),
                    in_repeat || repeat,
                    child_seed,
                    visit,
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

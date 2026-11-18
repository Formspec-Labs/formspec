//! Compare the stored keys of choices connected by an untransformed response read.

use super::{
    InstanceProjectionCode, InstanceProjectionDiagnostic, ProjectionConsumer, json_pointer_token,
    projected_field,
};
use crate::bind_targets::BindTargets;
use crate::definition_items::{DefinitionItemKeyPolicy, visit_definition_items_json_shallow};
use crate::option_sets::{inline_set_options, named_item_option_set};
use crate::path_utils::{Path, PathSegment};
use fel_core::ast::PathSegment as FelSegment;
use fel_core::{Expr, parse};
use serde_json::Value;
use std::collections::BTreeSet;

pub(super) struct ChoiceCarry {
    source: String,
    destination: String,
    pointer: String,
    data_type: String,
    values: BTreeSet<String>,
}

impl ChoiceCarry {
    pub(super) fn from_source(source: &Value, consumer: Option<&ProjectionConsumer>) -> Vec<Self> {
        let Some(consumer) = consumer else {
            return Vec::new();
        };
        let selection = if source["kind"] == "definition-response" {
            &source["responseSelection"]
        } else {
            &source["response"]
        };
        if matches!(consumer, ProjectionConsumer::Prefill { mapped: true, .. })
            || selection.get("mapping").is_some()
            || selection["cardinality"] == "latest-per-subject"
        {
            return Vec::new();
        }
        let binds = BindTargets::new(consumer.definition().get("binds"));
        let mut carries = Vec::new();
        visit_fields(
            &consumer.definition()["items"],
            "$.items",
            None,
            None,
            false,
            &mut |field, destination, seed| {
                let Some(data_type @ ("choice" | "multiChoice")) = field["dataType"].as_str()
                else {
                    return;
                };
                let Some(values) = values(consumer.definition(), field) else {
                    return;
                };
                let paths = match consumer {
                    ProjectionConsumer::Instance { name, .. } => {
                        let bind = binds.merged(&Path::parse(destination).strip_indices());
                        choice_reads(field, name, seed, bind.get("calculate"))
                            .into_iter()
                            .filter(|path| source["schema"][path] == data_type)
                            .map(|path| {
                                let pointer = format!("/schema/{}", json_pointer_token(&path));
                                (path, pointer)
                            })
                            .collect::<Vec<_>>()
                    }
                    ProjectionConsumer::Prefill { .. } => {
                        let root = destination.split(['.', '[']).next().unwrap_or(destination);
                        let pointer =
                            if let Some(properties) = source["schema"]["properties"].as_object() {
                                if !properties.contains_key(root) {
                                    return;
                                }
                                format!("/schema/properties/{}", json_pointer_token(root))
                            } else {
                                String::new()
                            };
                        vec![(destination.to_owned(), pointer)]
                    }
                };
                let destination = match consumer.definition()["url"].as_str() {
                    Some(url) => format!(
                        "{url} ({}), {destination}",
                        consumer.definition()["version"]
                    ),
                    None => destination.to_owned(),
                };
                carries.extend(paths.into_iter().map(|(source, pointer)| Self {
                    source,
                    destination: destination.clone(),
                    pointer,
                    data_type: data_type.to_owned(),
                    values: values.iter().map(|value| (*value).to_owned()).collect(),
                }));
            },
        );
        carries
    }

    pub(super) fn check(
        &self,
        definition: &Value,
        version: Option<&str>,
        diagnostics: &mut Vec<InstanceProjectionDiagnostic>,
    ) {
        let Some(field) = projected_field(&definition["items"], &self.source) else {
            return;
        };
        if field["dataType"] != self.data_type {
            return;
        }
        let Some(upstream) = values(definition, field) else {
            return;
        };
        if !upstream
            .iter()
            .copied()
            .eq(self.values.iter().map(String::as_str))
        {
            diagnostics.push(InstanceProjectionDiagnostic::new(
                InstanceProjectionCode::OptionValuesMismatch,
                &self.pointer,
                version,
                format!(
                    "Consumer field '{}' stores {:?}, but upstream field '{}' stores {:?}.",
                    self.destination, self.values, self.source, upstream
                ),
            ));
        }
    }
}

// The item walker supplies canonical paths. Carry the outer repeat's seed into each child.
fn visit_fields(
    items: &Value,
    json_parent: &str,
    parent: Option<&str>,
    seed: Option<&Value>,
    in_repeat: bool,
    visit: &mut impl FnMut(&Value, &str, Option<&Value>),
) {
    let Some(items) = items.as_array() else {
        return;
    };
    visit_definition_items_json_shallow(
        items,
        json_parent,
        parent,
        DefinitionItemKeyPolicy::RequireStringKey,
        &mut |entry| {
            let item = entry.item;
            let repeat = item["type"] == "group" && item["repeatable"] == true;
            let seed = if repeat && !in_repeat {
                item.get("seedFrom")
            } else {
                seed
            };
            if item["type"] == "field" {
                visit(item, &entry.dotted_path, seed);
            }
            let mut path = entry.dotted_path.clone();
            if repeat {
                path.push_str("[*]");
            }
            visit_fields(
                &item["children"],
                &format!("{}.children", entry.json_path),
                Some(&path),
                seed,
                repeat || in_repeat,
                visit,
            );
        },
    );
}

fn choice_reads(
    field: &Value,
    name: &str,
    seed: Option<&Value>,
    calculate: Option<&Value>,
) -> BTreeSet<String> {
    if let Some(calculate) = calculate {
        return calculate
            .as_str()
            .and_then(|expr| literal_read(expr, name))
            .into_iter()
            .collect();
    }
    let initial_read = field["initialValue"]
        .as_str()
        .and_then(|expr| expr.strip_prefix('='))
        .and_then(|expr| literal_read(expr, name));
    [prepopulate_read(field, name, seed), initial_read]
        .into_iter()
        .flatten()
        .collect()
}

fn prepopulate_read(field: &Value, name: &str, seed: Option<&Value>) -> Option<String> {
    let prefill = &field["prePopulate"];
    if prefill["instance"] != name {
        return None;
    }
    let read = |value: &Value| {
        let path = Path::parse(value.as_str()?);
        path.segments
            .iter()
            .all(|segment| matches!(segment, PathSegment::Exact(_) | PathSegment::Indexed(_)))
            .then_some(path)
    };
    let mut path = read(&prefill["path"])?;
    if let Some(seed) = seed.filter(|seed| seed["instance"] == name) {
        let mut row = read(&seed["path"])?;
        row.segments.push(PathSegment::Wildcard);
        row.segments.append(&mut path.segments);
        path = row;
    }
    Some(path.to_wildcard_string())
}

fn literal_read(expression: &str, name: &str) -> Option<String> {
    Some(singleton_instance_path(&parse(expression).ok()?, name)?.to_wildcard_string())
}

// Follow the expression's returned value. A row selector chooses a record without changing the choice.
fn singleton_instance_path(expression: &Expr, name: &str) -> Option<Path> {
    match expression {
        Expr::ContextRef {
            name: fun,
            arg: Some(arg),
            tail,
            ..
        } if fun == "instance" && arg == name => Some(Path {
            segments: tail.iter().cloned().map(PathSegment::Exact).collect(),
        }),
        Expr::FunctionCall { name: fun, args } if fun == "instance" => match args.as_slice() {
            [Expr::String(arg)] if arg == name => Some(Path::new()),
            [Expr::String(arg), Expr::String(path)] if arg == name && path.is_empty() => {
                Some(Path::new())
            }
            [Expr::String(arg), Expr::String(path)]
                if arg == name && !path.contains(['[', ']']) =>
            {
                Some(Path {
                    segments: path
                        .split('.')
                        .map(|key| PathSegment::Exact(key.to_owned()))
                        .collect(),
                })
            }
            _ => None,
        },
        Expr::PostfixAccess { expr, path } => {
            let mut read = singleton_instance_path(expr, name)?;
            for segment in path {
                read.segments.push(match segment {
                    FelSegment::Dot(key) => PathSegment::Exact(key.clone()),
                    FelSegment::Index(index) if *index > 0 => PathSegment::Wildcard,
                    _ => return None,
                });
            }
            Some(read)
        }
        Expr::RowLookup { source, .. } => {
            let mut read = singleton_instance_path(source, name)?;
            read.segments.push(PathSegment::Wildcard);
            Some(read)
        }
        _ => None,
    }
}

fn values<'a>(definition: &'a Value, field: &'a Value) -> Option<BTreeSet<&'a str>> {
    let options = if let Some(set) =
        named_item_option_set(field, |name| definition["optionSets"].get(name))
    {
        if set.get("source").is_some() {
            return None;
        }
        inline_set_options(set)?
    } else {
        &field["options"]
    };
    options
        .as_array()?
        .iter()
        .map(|entry| entry["value"].as_str())
        .collect()
}

//! Compare the stored keys of choices connected by an untransformed response read.

use super::{
    InstanceProjectionCode, InstanceProjectionDiagnostic, ProjectionConsumer, json_pointer_token,
    projected_field,
};
use crate::bind_targets::BindTargets;
use crate::definition_items::definition_item_dotted_path;
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
            None,
            None,
            false,
            &mut |field, destination, seed| {
                let Some(data_type @ ("choice" | "multiChoice")) = field["dataType"].as_str()
                else {
                    return;
                };
                let (path, pointer) = match consumer {
                    ProjectionConsumer::Instance { name, .. } => {
                        let bind = binds.merged(&destination.replace("[*]", ""));
                        let read = match bind.get("calculate") {
                            Some(calculate) => {
                                calculate.as_str().and_then(|expr| literal_read(expr, name))
                            }
                            None => direct_read(field, name, seed),
                        };
                        let Some(path) = read else {
                            return;
                        };
                        if source["schema"][&path] != data_type {
                            return;
                        }
                        let pointer = format!("/schema/{}", json_pointer_token(&path));
                        (path, pointer)
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
                        (destination.to_owned(), pointer)
                    }
                };
                if let Some(values) = values(consumer.definition(), field) {
                    carries.push(Self {
                        source: path,
                        destination: match consumer.definition()["url"].as_str() {
                            Some(url) => format!(
                                "{url} ({}), {destination}",
                                consumer.definition()["version"]
                            ),
                            None => destination.to_owned(),
                        },
                        pointer,
                        data_type: data_type.to_owned(),
                        values: values.into_iter().map(str::to_owned).collect(),
                    });
                }
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

// A nested repeat cannot introduce a new seed (Core §4.2.2.1).
fn visit_fields(
    items: &Value,
    parent: Option<&str>,
    seed: Option<&Value>,
    in_repeat: bool,
    visit: &mut impl FnMut(&Value, &str, Option<&Value>),
) {
    for field in items.as_array().into_iter().flatten() {
        let Some(key) = field["key"].as_str() else {
            continue;
        };
        let mut path = definition_item_dotted_path(parent, key);
        let repeat = field["type"] == "group" && field["repeatable"] == true;
        let seed = if repeat && !in_repeat {
            field.get("seedFrom")
        } else {
            seed
        };
        if repeat {
            path.push_str("[*]");
        }
        if field["type"] == "field" {
            visit(field, &path, seed);
        }
        visit_fields(
            &field["children"],
            Some(&path),
            seed,
            repeat || in_repeat,
            visit,
        );
    }
}

fn direct_read(field: &Value, name: &str, seed: Option<&Value>) -> Option<String> {
    if let Some(prefill) = field.get("prePopulate") {
        if prefill["instance"] != name {
            return None;
        }
        let path = prefill["path"].as_str()?;
        return match seed.filter(|seed| seed["instance"] == name) {
            Some(seed) => Some(format!("{}[*].{path}", seed["path"].as_str()?)),
            None => Some(path.to_owned()),
        };
    }
    literal_read(field["initialValue"].as_str()?.strip_prefix('=')?, name)
}

fn literal_read(expression: &str, name: &str) -> Option<String> {
    match parse(expression).ok()? {
        Expr::ContextRef {
            name: fun,
            arg: Some(arg),
            tail,
            ..
        } if fun == "instance" && arg == name => Some(tail.join(".")),
        Expr::FunctionCall { name: fun, args } if fun == "instance" => match args.as_slice() {
            [Expr::String(arg), Expr::String(path)] if arg == name => Some(path.clone()),
            _ => None,
        },
        _ => None,
    }
}

fn values<'a>(definition: &'a Value, field: &'a Value) -> Option<BTreeSet<&'a str>> {
    use crate::option_sets::{inline_set_options, named_item_option_set};

    let options = if let Some(set) = named_item_option_set(field, |name| definition["optionSets"].get(name)) {
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

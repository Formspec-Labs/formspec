//! Create Response values once, before the evaluation pipeline.

use std::collections::{HashMap, HashSet};

use fel_core::ExtensionFunctions;
use fel_core::exact_json::{Map, Value};
use formspec_core::path_utils::{Path, PathSegment};
use formspec_core::value_coerce::coerce_field_value;

use crate::fel_eval::Fel;
use crate::fel_json::{fel_to_runtime_json, json_to_runtime_fel_typed};
use crate::rebuild::{expand_repeat_instances_counted, flatten_response_data, rebuild_item_tree};
use crate::runtime_context::hydrate_inline_instances;
use crate::scope::{ScopeData, ScopeIndex};
use crate::{EvalContext, EvalOptions, EvalSubject};

/// Host inputs for a new Response or repeat row.
#[derive(Default)]
pub struct CreateOptions<'a> {
    /// Values delivered by the host, taking precedence over authored inline data.
    pub instances: HashMap<String, Value>,
    /// Sources still loading. Authored fallback data is held until loading finishes.
    pub pending_instances: HashSet<String>,
    /// On continuation, only initialize these pending paths and any new descendants.
    pub pending_paths: Option<HashSet<String>>,
    /// Wall-clock instant for expression initial values.
    pub now_iso: Option<String>,
    /// Current filing-unit identity for FEL subject lookups.
    pub subject: Option<EvalSubject>,
    /// Host FEL extension functions.
    pub extensions: Option<&'a dyn ExtensionFunctions>,
}

/// Created data and outstanding source-dependent values.
#[derive(Debug, Default, serde::Serialize)]
pub struct CreateResult {
    /// New Response data or the new repeat row.
    pub data: Value,
    /// Concrete item paths awaiting an instance source.
    pub pending: Vec<String>,
    /// Missing seed source details for the host.
    pub diagnostics: Vec<String>,
}

/// Fill absent Response data with the Definition's creation-time values.
pub fn create_response(
    definition: &Value,
    prefill: Value,
    options: &CreateOptions<'_>,
) -> CreateResult {
    let mut data = prefill;
    let evaluation_options = creation_evaluation_options(definition, options);
    let mut creation = Creation::new(definition, options, &evaluation_options);
    if let Some(root) = data.as_object_mut() {
        creation.items(children(definition, "items"), root, &Location::default());
    }
    creation.evaluate_initials(definition, &mut data);
    creation.result.data = data;
    creation.result
}

/// Initialize a new row at the end of an existing repeat, using its actual FEL site.
///
/// Returns `None` for an unknown repeat path, inaccessible parent row, or full repeat.
pub fn create_repeat_row(
    definition: &Value,
    mut data: Value,
    group_path: &str,
    options: &CreateOptions<'_>,
) -> Option<CreateResult> {
    let mut wire_path = Vec::new();
    let (group, relative_instance) = find_repeat(
        children(definition, "items"),
        &Path::parse(group_path).segments,
        &mut wire_path,
        None,
        false,
    )?;
    let rows = ensure_rows(&mut data, &wire_path)?;
    if group
        .get("maxRepeat")
        .and_then(Value::as_u64)
        .is_some_and(|max| rows.len() as u64 >= max)
    {
        return None;
    }
    let index = rows.len();
    wire_path.push(PathSegment::Indexed(index));
    let evaluation_options = creation_evaluation_options(definition, options);
    let mut creation = Creation::new(definition, options, &evaluation_options);
    let mut row = Map::new();
    creation.items(
        children(group, "children"),
        &mut row,
        &Location {
            model: format!("{group_path}[{index}]"),
            wire: wire_path.clone(),
            in_repeat: true,
            relative: relative_instance.map(|instance| Relative {
                instance,
                element: None,
            }),
            initialize_all: true,
        },
    );
    rows.push(Value::Object(row));
    creation.evaluate_initials(definition, &mut data);
    creation.result.data = std::mem::take(at_mut(&mut data, &wire_path)?);
    Some(creation.result)
}

#[derive(Clone, Copy)]
struct Relative<'a> {
    instance: &'a str,
    element: Option<&'a Value>,
}

#[derive(Default)]
struct Location<'a> {
    model: String,
    wire: Vec<PathSegment>,
    in_repeat: bool,
    relative: Option<Relative<'a>>,
    initialize_all: bool,
}

struct Initial<'a> {
    model: String,
    object: Vec<PathSegment>,
    key: &'a str,
    expression: &'a str,
}

struct Creation<'a> {
    definition: &'a Value,
    options: &'a CreateOptions<'a>,
    evaluation_options: &'a EvalOptions<'a>,
    result: CreateResult,
    initials: Vec<Initial<'a>>,
}

impl<'a> Creation<'a> {
    fn new(
        definition: &'a Value,
        options: &'a CreateOptions<'a>,
        evaluation_options: &'a EvalOptions<'a>,
    ) -> Self {
        Self {
            definition,
            options,
            evaluation_options,
            result: CreateResult::default(),
            initials: Vec::new(),
        }
    }

    fn eligible(&self, location: &Location<'_>, model: &str) -> bool {
        location.initialize_all
            || self
                .options
                .pending_paths
                .as_ref()
                .is_none_or(|paths| paths.contains(model))
    }

    fn items(&mut self, items: &'a [Value], data: &mut Map<String, Value>, parent: &Location<'a>) {
        for item in items {
            let Some(key) = string(item, "key") else {
                continue;
            };
            let model = if parent.model.is_empty() {
                key.to_owned()
            } else {
                format!("{}.{key}", parent.model)
            };
            let mut location = Location {
                model,
                wire: parent.wire.clone(),
                ..*parent
            };
            match item_type(item) {
                "field" => {
                    if !data.contains_key(key) && self.eligible(parent, &location.model) {
                        self.field(item, key, data, &location);
                    }
                    self.items(children(item, "children"), data, &location);
                }
                "group" => {
                    location.wire.push(PathSegment::Exact(key.to_owned()));
                    if is_repeat(item) {
                        self.repeat(item, key, data, &location);
                    } else if let Some(current) = data.get_mut(key) {
                        if let Some(object) = current.as_object_mut() {
                            self.items(children(item, "children"), object, &location);
                        }
                    } else {
                        let mut object = Map::new();
                        self.items(children(item, "children"), &mut object, &location);
                        // Keep a container if an expression will write into it.
                        if !object.is_empty()
                            || self
                                .initials
                                .last()
                                .is_some_and(|value| value.object.starts_with(&location.wire))
                        {
                            data.insert(key.to_owned(), Value::Object(object));
                        }
                    }
                }
                _ => {}
            }
        }
    }

    fn field(
        &mut self,
        item: &'a Value,
        key: &'a str,
        data: &mut Map<String, Value>,
        location: &Location<'a>,
    ) {
        if let Some((instance, path)) = source(item, "prePopulate") {
            if let Some(relative) = location
                .relative
                .filter(|relative| instance == relative.instance)
            {
                if let Some(element) = relative.element {
                    if let Some(value) = read(element, path).filter(|value| !value.is_null()) {
                        data.insert(key.to_owned(), value.clone());
                    }
                    return;
                }
                // This row has no seed element. Its initialValue may still apply.
            } else {
                if self.options.pending_instances.contains(instance) {
                    self.result.pending.push(location.model.clone());
                    return;
                }
                if let Some(value) = self
                    .evaluation_options
                    .instances
                    .get(instance)
                    .and_then(|value| read(value, path))
                    .filter(|value| !value.is_null())
                {
                    data.insert(key.to_owned(), value.clone());
                    return;
                }
            }
        }
        match item.get("initialValue") {
            Some(Value::String(expression)) if expression.starts_with('=') => {
                self.initials.push(Initial {
                    model: location.model.clone(),
                    object: location.wire.clone(),
                    key,
                    expression: &expression[1..],
                });
            }
            Some(value) => {
                let value = if string(item, "dataType") == Some("money") {
                    coerce_field_value(item, None, self.definition, value.clone())
                } else {
                    value.clone()
                };
                data.insert(key.to_owned(), value);
            }
            None => {}
        }
    }

    fn repeat(
        &mut self,
        item: &'a Value,
        key: &str,
        data: &mut Map<String, Value>,
        location: &Location<'a>,
    ) {
        let seed = (!location.in_repeat)
            .then(|| source(item, "seedFrom"))
            .flatten();
        if let Some(existing) = data.get_mut(key) {
            if let Some(rows) = existing.as_array_mut() {
                for (index, row) in rows.iter_mut().enumerate() {
                    if let Some(row) = row.as_object_mut() {
                        self.row(
                            item,
                            row,
                            location,
                            index,
                            seed.map(|(instance, _)| Relative {
                                instance,
                                element: None,
                            }),
                            false,
                        );
                    }
                }
            }
            return;
        }
        if !self.eligible(location, &location.model) {
            return;
        }
        let minimum = item.get("minRepeat").and_then(Value::as_u64).unwrap_or(0) as usize;
        let maximum = item
            .get("maxRepeat")
            .and_then(Value::as_u64)
            .unwrap_or(u64::MAX) as usize;
        let seed_elements = if let Some((instance, path)) = seed {
            if self.options.pending_instances.contains(instance) {
                self.result.pending.push(location.model.clone());
                return;
            }
            let value = self
                .evaluation_options
                .instances
                .get(instance)
                .and_then(|root| read(root, path))
                .and_then(Value::as_array);
            if value.is_none() {
                self.result.diagnostics.push(format!(
                    "No array at {instance}.{path} for seedFrom on {}",
                    location.model
                ));
            }
            value.map(Vec::as_slice).unwrap_or_default()
        } else {
            &[]
        };

        let count = minimum.max(seed_elements.len().min(maximum));
        let mut rows = Vec::with_capacity(count);
        for index in 0..count {
            let mut row = Map::new();
            let relative = seed.map(|(instance, _)| Relative {
                instance,
                element: seed_elements.get(index),
            });
            // Padding a seeded repeat never assigns values to rows outside the source.
            if relative.is_none_or(|source| source.element.is_some()) {
                self.row(item, &mut row, location, index, relative, true);
            }
            rows.push(Value::Object(row));
        }
        data.insert(key.to_owned(), Value::Array(rows));
    }

    fn row(
        &mut self,
        item: &'a Value,
        row: &mut Map<String, Value>,
        location: &Location<'a>,
        index: usize,
        relative: Option<Relative<'a>>,
        new: bool,
    ) {
        let mut wire = location.wire.clone();
        wire.push(PathSegment::Indexed(index));
        self.items(
            children(item, "children"),
            row,
            &Location {
                model: format!("{}[{index}]", location.model),
                wire,
                in_repeat: true,
                relative: relative.or(location.relative),
                initialize_all: new || location.initialize_all,
            },
        );
    }

    fn evaluate_initials(&mut self, definition: &Value, data: &mut Value) {
        if self.initials.is_empty() {
            return;
        }
        let Some(root) = data.as_object() else { return };
        let mut items = rebuild_item_tree(definition);
        let input = root
            .iter()
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect();
        let Ok(mut flat) = flatten_response_data(&items, &input) else {
            return;
        };
        expand_repeat_instances_counted(&mut items, &mut flat.repeat_counts);
        let mut index = ScopeIndex::new(&items, flat.repeat_counts);
        for path in flat.values.keys() {
            index.add_value_path(path);
        }
        let mut scope = ScopeData::for_values(&index, &flat.values, self.evaluation_options);
        let fel = Fel::new(self.options.extensions);
        let definitions = crate::rebuild::parse_variables(definition);
        let expressions: Vec<_> = definitions
            .iter()
            .map(|var| fel_core::parse(&var.expression).ok())
            .collect();
        let variables =
            crate::recalculate::variables::Variables::new(&definitions, &index, &expressions);
        let pending = variables.pending_sources(&self.options.pending_instances);
        for initial in &self.initials {
            if let Ok(parsed) = fel_core::parse(initial.expression) {
                if pending.waits_for(&parsed, &initial.model) {
                    self.result.pending.push(initial.model.clone());
                    continue;
                }
                if !definitions.is_empty() {
                    variables.evaluate(&mut scope, &index, fel);
                }
                let value = fel_to_runtime_json(
                    &fel.evaluate(&parsed, &scope.site(&index, &initial.model))
                        .value,
                );
                let value_for_scope =
                    json_to_runtime_fel_typed(&value, index.data_type(&initial.model));
                if let Some(object) = at_mut(data, &initial.object).and_then(Value::as_object_mut) {
                    object.insert(initial.key.to_owned(), value);
                    scope.set_field(&initial.model, value_for_scope);
                }
            }
        }
    }
}

fn creation_evaluation_options(
    definition: &Value,
    options: &CreateOptions<'_>,
) -> EvalOptions<'static> {
    let mut instances = options.instances.clone();
    hydrate_inline_instances(definition, &mut instances);
    EvalOptions {
        instances,
        context: EvalContext {
            now_iso: options.now_iso.clone(),
            subject: options.subject.clone(),
            ..EvalContext::default()
        },
        ..EvalOptions::default()
    }
}

fn children<'a>(item: &'a Value, property: &str) -> &'a [Value] {
    item.get(property)
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default()
}

fn string<'a>(item: &'a Value, property: &str) -> Option<&'a str> {
    item.get(property).and_then(Value::as_str)
}

fn source<'a>(item: &'a Value, property: &str) -> Option<(&'a str, &'a str)> {
    let source = item.get(property)?;
    Some((string(source, "instance")?, string(source, "path")?))
}

fn item_type(item: &Value) -> &str {
    string(item, "type").unwrap_or_else(|| {
        if item.get("children").is_some() || item.get("repeatable").is_some() {
            "group"
        } else {
            "field"
        }
    })
}

fn is_repeat(item: &Value) -> bool {
    item_type(item) == "group" && item.get("repeatable").and_then(Value::as_bool) == Some(true)
}

fn read<'a>(mut value: &'a Value, path: &str) -> Option<&'a Value> {
    for segment in Path::parse(path).segments {
        value = match segment {
            PathSegment::Exact(key) => value.get(&key)?,
            PathSegment::Indexed(index) => value.as_array()?.get(index)?,
            _ => return None,
        };
    }
    Some(value)
}

fn at_mut<'a>(mut value: &'a mut Value, path: &[PathSegment]) -> Option<&'a mut Value> {
    for segment in path {
        value = match segment {
            PathSegment::Exact(key) => value.get_mut(key)?,
            PathSegment::Indexed(index) => value.as_array_mut()?.get_mut(*index)?,
            _ => return None,
        };
    }
    Some(value)
}

fn ensure_rows<'a>(data: &'a mut Value, wire: &[PathSegment]) -> Option<&'a mut Vec<Value>> {
    let (last, parents) = wire.split_last()?;
    let mut value = data;
    for segment in parents {
        value = match segment {
            PathSegment::Exact(key) => value
                .as_object_mut()?
                .entry(key.clone())
                .or_insert_with(|| Value::Object(Map::new())),
            PathSegment::Indexed(index) => value.as_array_mut()?.get_mut(*index)?,
            _ => return None,
        };
    }
    value
        .as_object_mut()?
        .entry(last.as_str()?.to_owned())
        .or_insert_with(|| Value::Array(Vec::new()))
        .as_array_mut()
}

fn find_repeat<'a>(
    items: &'a [Value],
    model: &[PathSegment],
    wire: &mut Vec<PathSegment>,
    mut relative: Option<&'a str>,
    in_repeat: bool,
) -> Option<(&'a Value, Option<&'a str>)> {
    let (head, tail) = model.split_first()?;
    let item = items
        .iter()
        .find(|item| string(item, "key") == head.as_str())?;
    if item_type(item) == "group" {
        wire.push(head.clone());
    }
    if is_repeat(item) {
        if !in_repeat {
            relative = source(item, "seedFrom").map(|(instance, _)| instance);
        }
        if tail.is_empty() {
            return Some((item, relative));
        }
        let (index @ PathSegment::Indexed(_), rest) = tail.split_first()? else {
            return None;
        };
        wire.push(index.clone());
        return find_repeat(children(item, "children"), rest, wire, relative, true);
    }
    find_repeat(children(item, "children"), tail, wire, relative, in_repeat)
}

#[cfg(test)]
mod tests;

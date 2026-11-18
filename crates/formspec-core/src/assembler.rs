//! Resolves $ref inclusions and assembles self-contained definitions with FEL rewriting.
//!
//! ## Internal helpers
//! Private functions walk `items`, merge referenced fragments (`resolve_*`, `perform_assembly`),
//! hoist binds/shapes/variables (`import_*`), and rewrite FEL via [`crate::assembly_fel_rewrite`].
#![allow(clippy::missing_docs_in_private_items)]

use std::collections::{HashMap, HashSet};

use fel_core::exact_json::JsonTree;
use serde_json::{Map, Value, json};

use crate::JsonWireStyle;
use crate::assembly_fel_rewrite::{
    AssemblyFelRewriteMap as FelRewriteMap, assembly_prefix_path, rewrite_fel_for_assembly,
    rewrite_message_template_for_assembly,
};
use crate::definition_items::visit_definition_items_from_document;
use crate::wire_keys::assembly_provenance_keys;

/// Failure while resolving `$ref` or merging assembled fragments.
#[derive(Debug, Clone)]
pub enum AssemblyError {
    /// A `$ref` cycle was detected.
    CircularRef(String),
    /// Two sources contributed the same item `key`.
    KeyCollision {
        /// Colliding item key in the merged tree.
        key: String,
        /// Description of the conflicting source (e.g. URI).
        source: String,
    },
    /// `$ref` target was not found in the resolver.
    RefNotFound(String),
    /// Resolver or merge failed with a message.
    ResolutionError(String),
}

impl std::fmt::Display for AssemblyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AssemblyError::CircularRef(r) => write!(f, "Circular $ref detected: {r}"),
            AssemblyError::KeyCollision { key, source } => {
                write!(f, "key collision: '{key}' from {source}")
            }
            AssemblyError::RefNotFound(r) => write!(f, "$ref not found: {r}"),
            AssemblyError::ResolutionError(msg) => write!(f, "resolution error: {msg}"),
        }
    }
}

impl std::error::Error for AssemblyError {}

/// Source record for one merged definition fragment (URL, version, optional key prefix).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AssemblyProvenance {
    /// Source document URL or identifier.
    pub url: String,
    /// Version string from the source document.
    pub version: String,
    /// Optional key prefix applied when merging items from this fragment.
    pub key_prefix: Option<String>,
    /// Optional JSON Pointer–style fragment path within the resolved document.
    pub fragment: Option<String>,
}

/// Output of [`assemble_definition`]: merged definition plus warnings, errors, provenance.
#[derive(Debug, Clone)]
pub struct AssemblyResult {
    /// Assembled definition JSON (typically includes merged `items`).
    pub definition: Value,
    /// Non-fatal issues (e.g. skipped optional refs).
    pub warnings: Vec<String>,
    /// Fatal assembly problems.
    pub errors: Vec<AssemblyError>,
    /// Ordered list of fragments that contributed to the result.
    pub assembled_from: Vec<AssemblyProvenance>,
}

/// Resolves a `$ref` URI string to a JSON fragment.
pub trait RefResolver {
    /// Return the resolved JSON value, or `None` if unknown.
    fn resolve(&self, ref_uri: &str) -> Option<Value>;
}

/// In-memory [`RefResolver`] backed by a URI → JSON map.
pub struct MapResolver {
    /// Resolved URI → JSON fragment map.
    fragments: HashMap<String, Value>,
}

impl MapResolver {
    /// Empty resolver.
    pub fn new() -> Self {
        Self {
            fragments: HashMap::new(),
        }
    }

    /// Insert or replace a resolved fragment for `uri`.
    pub fn add(&mut self, uri: &str, fragment: Value) {
        self.fragments.insert(uri.to_string(), fragment);
    }

    /// Load URI → fragment entries from a JSON object (non-objects yield no inserts).
    pub fn merge_from_json_object(&mut self, fragments: &Value) {
        if let Some(obj) = fragments.as_object() {
            for (uri, fragment) in obj {
                self.add(uri, fragment.clone());
            }
        }
    }
}

impl Default for MapResolver {
    fn default() -> Self {
        Self::new()
    }
}

impl RefResolver for MapResolver {
    fn resolve(&self, ref_uri: &str) -> Option<Value> {
        self.fragments.get(ref_uri).cloned()
    }
}

/// Walk `definition["items"]`, expand `$ref` objects using `resolver`, and merge fragments.
///
/// Item keys are rewritten when fragments supply `keyPrefix`. FEL in binds and message
/// templates is rewritten to match merged keys (see `rewrite_fel_source_references`).
pub fn assemble_definition(definition: &Value, resolver: &dyn RefResolver) -> AssemblyResult {
    let mut result = AssemblyResult {
        definition: definition.clone(),
        warnings: Vec::new(),
        errors: Vec::new(),
        assembled_from: Vec::new(),
    };

    let mut visited_refs = HashSet::new();
    let items = definition
        .get("items")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let assembled_items = resolve_items(
        &items,
        "",
        resolver,
        &mut visited_refs,
        &mut result.definition,
        &mut result.errors,
        &mut result.assembled_from,
    );

    if let Some(host) = result.definition.as_object_mut() {
        host.insert("items".to_string(), Value::Array(assembled_items));
    }

    result
}

/// Locate Group inclusions that still need assembly (Core §6.6.2).
///
/// Each pair contains the authored `$ref` JSONPath and its diagnostic message.
pub fn unassembled_definition_references<V: JsonTree>(definition: &V) -> Vec<(String, String)> {
    let mut findings = Vec::new();
    visit_definition_items_from_document(definition, &mut |item| {
        if item.item.get("type").and_then(V::as_str) == Some("group")
            && let Some(reference) = item.item.get("$ref").and_then(V::as_str)
        {
            findings.push((
                format!("{}.$ref", item.json_path),
                format!("Assemble this Definition before use: Group reference {reference:?} is unassembled"),
            ));
        }
    });
    findings
}

/// Assembly output for host bindings (camelCase vs snake_case provenance keys).
pub fn assembly_result_to_json_value(result: &AssemblyResult, style: JsonWireStyle) -> Value {
    let (key_prefix_k, assembled_k) = assembly_provenance_keys(style);

    let assembled: Vec<Value> = result
        .assembled_from
        .iter()
        .map(|entry| {
            let mut m = Map::new();
            m.insert("url".into(), json!(entry.url));
            m.insert("version".into(), json!(entry.version));
            m.insert(key_prefix_k.into(), json!(entry.key_prefix));
            m.insert("fragment".into(), json!(entry.fragment));
            Value::Object(m)
        })
        .collect();

    let mut root = Map::new();
    root.insert("definition".into(), result.definition.clone());
    root.insert("warnings".into(), json!(result.warnings));
    root.insert(
        "errors".into(),
        json!(
            result
                .errors
                .iter()
                .map(|e| e.to_string())
                .collect::<Vec<_>>()
        ),
    );
    root.insert(assembled_k.into(), Value::Array(assembled));
    Value::Object(root)
}

fn resolve_items(
    items: &[Value],
    parent_path: &str,
    resolver: &dyn RefResolver,
    visited_refs: &mut HashSet<String>,
    host: &mut Value,
    errors: &mut Vec<AssemblyError>,
    assembled_from: &mut Vec<AssemblyProvenance>,
) -> Vec<Value> {
    let mut resolved = Vec::with_capacity(items.len());
    for item in items {
        resolved.push(resolve_item(
            item,
            parent_path,
            resolver,
            visited_refs,
            host,
            errors,
            assembled_from,
        ));
    }
    resolved
}

fn resolve_item(
    item: &Value,
    parent_path: &str,
    resolver: &dyn RefResolver,
    visited_refs: &mut HashSet<String>,
    host: &mut Value,
    errors: &mut Vec<AssemblyError>,
    assembled_from: &mut Vec<AssemblyProvenance>,
) -> Value {
    let Some(obj) = item.as_object() else {
        return item.clone();
    };

    if let Some(ref_uri) = obj.get("$ref").and_then(Value::as_str) {
        let parsed_ref = parse_ref(ref_uri);
        let ref_key = versioned_ref_key(&parsed_ref.url, parsed_ref.version.as_deref());
        if visited_refs.contains(&ref_key) {
            errors.push(AssemblyError::CircularRef(ref_key));
            return item.clone();
        }

        visited_refs.insert(ref_key.clone());
        let Some(referenced) = resolve_reference(resolver, ref_uri, &parsed_ref) else {
            errors.push(AssemblyError::RefNotFound(ref_uri.to_string()));
            visited_refs.remove(&ref_key);
            return item.clone();
        };

        let mut assembled = perform_assembly(
            item,
            parent_path,
            &referenced,
            &parsed_ref,
            host,
            errors,
            assembled_from,
        );
        let full_path = current_item_path(
            parent_path,
            obj.get("key").and_then(Value::as_str).unwrap_or(""),
        );

        if let Some(children) = assembled.get("children").and_then(Value::as_array).cloned() {
            let resolved_children = resolve_items(
                &children,
                &full_path,
                resolver,
                visited_refs,
                host,
                errors,
                assembled_from,
            );
            if let Some(assembled_obj) = assembled.as_object_mut() {
                assembled_obj.insert("children".to_string(), Value::Array(resolved_children));
            }
        }

        visited_refs.remove(&ref_key);
        return assembled;
    }

    if let Some(children) = obj.get("children").and_then(Value::as_array) {
        let mut cloned = item.clone();
        let full_path = current_item_path(
            parent_path,
            obj.get("key").and_then(Value::as_str).unwrap_or(""),
        );
        let resolved_children = resolve_items(
            children,
            &full_path,
            resolver,
            visited_refs,
            host,
            errors,
            assembled_from,
        );
        if let Some(cloned_obj) = cloned.as_object_mut() {
            cloned_obj.insert("children".to_string(), Value::Array(resolved_children));
        }
        return cloned;
    }

    item.clone()
}

fn perform_assembly(
    group_item: &Value,
    parent_path: &str,
    referenced_def: &Value,
    parsed_ref: &ParsedRef,
    host: &mut Value,
    errors: &mut Vec<AssemblyError>,
    assembled_from: &mut Vec<AssemblyProvenance>,
) -> Value {
    let Some(group_obj) = group_item.as_object() else {
        return group_item.clone();
    };

    let group_key = group_obj.get("key").and_then(Value::as_str).unwrap_or("");
    let key_prefix = group_obj
        .get("keyPrefix")
        .and_then(Value::as_str)
        .unwrap_or("");
    let Some(source_items) = select_source_items(referenced_def, parsed_ref.fragment.as_deref())
    else {
        errors.push(AssemblyError::ResolutionError(format!(
            "Fragment key \"{}\" not found in referenced definition {}",
            parsed_ref.fragment.as_deref().unwrap_or(""),
            parsed_ref.url
        )));
        return group_item.clone();
    };

    let imported_items: Vec<Value> = source_items
        .iter()
        .map(|item| prefix_item(item, key_prefix))
        .collect();

    let mut imported_keys = HashSet::new();
    for item in &source_items {
        collect_all_keys(item, &mut imported_keys);
    }

    let group_path = current_item_path(parent_path, group_key);
    let map = FelRewriteMap {
        fragment_root_key: parsed_ref.fragment.clone().unwrap_or_default(),
        host_group_key: group_key.to_string(),
        imported_keys,
        key_prefix: key_prefix.to_string(),
    };

    import_binds(
        referenced_def,
        parsed_ref.fragment.as_deref(),
        &group_path,
        &map,
        host,
    );
    import_shapes(
        referenced_def,
        parsed_ref.fragment.as_deref(),
        &group_path,
        group_key,
        &map,
        host,
        errors,
    );
    import_variables(
        referenced_def,
        parsed_ref.fragment.as_deref(),
        &map,
        host,
        errors,
    );

    let host_paths = collect_key_paths(
        host.get("items")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
            .as_slice(),
        "",
    );
    let imported_paths = collect_key_paths(&imported_items, &group_path);
    for path in imported_paths {
        if host_paths.contains(&path) {
            errors.push(AssemblyError::KeyCollision {
                key: path,
                source: parsed_ref.url.clone(),
            });
        }
    }

    assembled_from.push(AssemblyProvenance {
        url: parsed_ref.url.clone(),
        version: parsed_ref.version.clone().unwrap_or_else(|| {
            referenced_def
                .get("version")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string()
        }),
        key_prefix: if key_prefix.is_empty() {
            None
        } else {
            Some(key_prefix.to_string())
        },
        fragment: parsed_ref.fragment.clone(),
    });

    let mut assembled = Map::new();
    for (key, value) in group_obj {
        if key != "$ref" && key != "keyPrefix" {
            assembled.insert(key.clone(), value.clone());
        }
    }
    assembled.insert("children".to_string(), Value::Array(imported_items));
    Value::Object(assembled)
}

fn import_binds(
    referenced_def: &Value,
    fragment: Option<&str>,
    group_path: &str,
    map: &FelRewriteMap,
    host: &mut Value,
) {
    let mut binds = extract_binds(referenced_def);
    if fragment.is_some() {
        binds.retain(|bind| bind_applies_to_fragment(bind, &map.imported_keys));
    }
    let binds: Vec<Value> = binds
        .into_iter()
        .map(|bind| rewrite_bind(prefix_bind_path(bind, group_path, map), map))
        .collect();
    if binds.is_empty() {
        return;
    }

    let Some(host_obj) = host.as_object_mut() else {
        return;
    };
    let host_binds = host_obj
        .entry("binds")
        .or_insert_with(|| Value::Array(Vec::new()));
    if let Some(bind_array) = host_binds.as_array_mut() {
        bind_array.extend(binds);
    }
}

fn import_shapes(
    referenced_def: &Value,
    fragment: Option<&str>,
    group_path: &str,
    group_key: &str,
    map: &FelRewriteMap,
    host: &mut Value,
    errors: &mut Vec<AssemblyError>,
) {
    let Some(host_obj) = host.as_object_mut() else {
        return;
    };

    let mut shapes = referenced_def
        .get("shapes")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if fragment.is_some() {
        shapes.retain(|shape| shape_applies_to_fragment(shape, &map.imported_keys));
    }
    if shapes.is_empty() {
        return;
    }

    let existing_shape_ids: HashSet<String> = host_obj
        .get("shapes")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|shape| {
                    shape
                        .get("id")
                        .and_then(Value::as_str)
                        .map(ToString::to_string)
                })
                .collect()
        })
        .unwrap_or_default();

    let imported_shape_ids: HashSet<String> = shapes
        .iter()
        .filter_map(|shape| {
            shape
                .get("id")
                .and_then(Value::as_str)
                .map(ToString::to_string)
        })
        .collect();

    let mut rename_map = HashMap::new();
    for shape in &mut shapes {
        if let Some(id) = shape.get("id").and_then(Value::as_str)
            && existing_shape_ids.contains(id)
        {
            let renamed = format!("{group_key}_{id}");
            rename_map.insert(id.to_string(), renamed.clone());
            if let Some(shape_obj) = shape.as_object_mut() {
                shape_obj.insert("id".to_string(), Value::String(renamed));
            }
        }
    }

    let shapes: Vec<Value> = shapes
        .into_iter()
        .map(|shape| {
            rewrite_shape(
                prefix_shape_target(shape, group_path, map),
                map,
                &rename_map,
                &imported_shape_ids,
            )
        })
        .collect();

    let host_shapes = host_obj
        .entry("shapes")
        .or_insert_with(|| Value::Array(Vec::new()));
    if let Some(shape_array) = host_shapes.as_array_mut() {
        shape_array.extend(shapes);
    } else {
        errors.push(AssemblyError::ResolutionError(
            "host shapes must be an array".to_string(),
        ));
    }
}

fn import_variables(
    referenced_def: &Value,
    fragment: Option<&str>,
    map: &FelRewriteMap,
    host: &mut Value,
    errors: &mut Vec<AssemblyError>,
) {
    let mut variables = referenced_def
        .get("variables")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if variables.is_empty() {
        return;
    }

    if fragment.is_some() {
        variables.retain(|variable| variable_applies_to_fragment(variable, map));
    }
    if variables.is_empty() {
        return;
    }

    let Some(host_obj) = host.as_object_mut() else {
        return;
    };
    let existing_names: HashSet<String> = host_obj
        .get("variables")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|var| {
                    var.get("name")
                        .and_then(Value::as_str)
                        .map(ToString::to_string)
                })
                .collect()
        })
        .unwrap_or_default();

    let mut rewritten = Vec::new();
    for mut variable in variables {
        let name = variable
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        if existing_names.contains(&name) {
            errors.push(AssemblyError::ResolutionError(format!(
                "Variable name collision during assembly: \"{name}\" already exists in host definition"
            )));
            continue;
        }
        if let Some(obj) = variable.as_object_mut() {
            if let Some(expression) = obj.get("expression").and_then(Value::as_str) {
                obj.insert(
                    "expression".to_string(),
                    Value::String(rewrite_fel_for_assembly(expression, map)),
                );
            }
            if let Some(scope) = obj.get("scope").and_then(Value::as_str) {
                let next_scope = if scope == "#" || scope.is_empty() {
                    scope.to_string()
                } else if scope == map.fragment_root_key {
                    map.host_group_key.clone()
                } else if map.imported_keys.contains(scope) {
                    format!("{}{}", map.key_prefix, scope)
                } else {
                    scope.to_string()
                };
                obj.insert("scope".to_string(), Value::String(next_scope));
            }
        }
        rewritten.push(variable);
    }

    if rewritten.is_empty() {
        return;
    }

    let host_variables = host_obj
        .entry("variables")
        .or_insert_with(|| Value::Array(Vec::new()));
    if let Some(var_array) = host_variables.as_array_mut() {
        var_array.extend(rewritten);
    }
}

fn extract_binds(definition: &Value) -> Vec<Value> {
    match definition.get("binds") {
        Some(Value::Array(array)) => array.clone(),
        Some(Value::Object(object)) => object
            .iter()
            .map(|(path, value)| {
                let mut bind = value.clone();
                if let Some(bind_obj) = bind.as_object_mut() {
                    bind_obj.insert("path".to_string(), Value::String(path.clone()));
                    Value::Object(bind_obj.clone())
                } else {
                    let mut obj = Map::new();
                    obj.insert("path".to_string(), Value::String(path.clone()));
                    Value::Object(obj)
                }
            })
            .collect(),
        _ => Vec::new(),
    }
}

fn bind_applies_to_fragment(bind: &Value, imported_keys: &HashSet<String>) -> bool {
    bind.get("path")
        .and_then(Value::as_str)
        .map(|path| {
            let first = path
                .split('.')
                .next()
                .unwrap_or("")
                .split('[')
                .next()
                .unwrap_or("");
            imported_keys.contains(first)
        })
        .unwrap_or(false)
}

fn shape_applies_to_fragment(shape: &Value, imported_keys: &HashSet<String>) -> bool {
    let Some(target) = shape.get("target").and_then(Value::as_str) else {
        return false;
    };
    if target == "#" {
        return true;
    }
    let first = target
        .split('.')
        .next()
        .unwrap_or("")
        .split('[')
        .next()
        .unwrap_or("");
    imported_keys.contains(first)
}

fn variable_applies_to_fragment(variable: &Value, map: &FelRewriteMap) -> bool {
    let Some(scope) = variable.get("scope").and_then(Value::as_str) else {
        return true;
    };
    scope == "#" || scope.is_empty() || map.imported_keys.contains(scope)
}

fn prefix_item(item: &Value, prefix: &str) -> Value {
    if prefix.is_empty() {
        return item.clone();
    }
    let mut prefixed = item.clone();
    if let Some(obj) = prefixed.as_object_mut() {
        if let Some(key) = obj.get("key").and_then(Value::as_str) {
            obj.insert("key".to_string(), Value::String(format!("{prefix}{key}")));
        }
        if let Some(children) = obj.get("children").and_then(Value::as_array).cloned() {
            let children: Vec<Value> = children
                .iter()
                .map(|child| prefix_item(child, prefix))
                .collect();
            obj.insert("children".to_string(), Value::Array(children));
        }
    }
    prefixed
}

fn collect_all_keys(item: &Value, keys: &mut HashSet<String>) {
    if let Some(key) = item.get("key").and_then(Value::as_str) {
        keys.insert(key.to_string());
    }
    if let Some(children) = item.get("children").and_then(Value::as_array) {
        for child in children {
            collect_all_keys(child, keys);
        }
    }
}

fn collect_key_paths(items: &[Value], parent_path: &str) -> HashSet<String> {
    let mut paths = HashSet::new();
    for item in items {
        let Some(key) = item.get("key").and_then(Value::as_str) else {
            continue;
        };
        let path = current_item_path(parent_path, key);
        paths.insert(path.clone());
        if let Some(children) = item.get("children").and_then(Value::as_array) {
            paths.extend(collect_key_paths(children, &path));
        }
    }
    paths
}

fn prefix_bind_path(bind: Value, group_path: &str, map: &FelRewriteMap) -> Value {
    let mut bind = bind;
    if let Some(obj) = bind.as_object_mut()
        && let Some(path) = obj.get("path").and_then(Value::as_str)
    {
        let next_path = assembly_prefix_path(path, &map.key_prefix, &map.imported_keys);
        let next_path = if group_path.is_empty() {
            next_path
        } else {
            format!("{group_path}.{next_path}")
        };
        obj.insert("path".to_string(), Value::String(next_path));
    }
    bind
}

fn prefix_shape_target(shape: Value, group_path: &str, map: &FelRewriteMap) -> Value {
    let mut shape = shape;
    if let Some(obj) = shape.as_object_mut()
        && let Some(target) = obj.get("target").and_then(Value::as_str)
        && target != "#"
    {
        let next_target = assembly_prefix_path(target, &map.key_prefix, &map.imported_keys);
        let next_target = if group_path.is_empty() {
            next_target
        } else {
            format!("{group_path}.{next_target}")
        };
        obj.insert("target".to_string(), Value::String(next_target));
    }
    shape
}

fn rewrite_bind(bind: Value, map: &FelRewriteMap) -> Value {
    let mut bind = bind;
    if let Some(obj) = bind.as_object_mut() {
        for key in [
            "calculate",
            "constraint",
            "relevant",
            "readonly",
            "required",
        ] {
            if let Some(expression) = obj.get(key).and_then(Value::as_str) {
                obj.insert(
                    key.to_string(),
                    Value::String(rewrite_fel_for_assembly(expression, map)),
                );
            }
        }
        if let Some(default_expr) = obj.get("default").and_then(Value::as_str)
            && let Some(expr) = default_expr.strip_prefix('=')
        {
            obj.insert(
                "default".to_string(),
                Value::String(format!("={}", rewrite_fel_for_assembly(expr, map))),
            );
        }
    }
    bind
}

fn rewrite_shape(
    shape: Value,
    map: &FelRewriteMap,
    rename_map: &HashMap<String, String>,
    imported_shape_ids: &HashSet<String>,
) -> Value {
    let mut shape = shape;
    if let Some(obj) = shape.as_object_mut() {
        for key in ["constraint", "activeWhen"] {
            if let Some(expression) = obj.get(key).and_then(Value::as_str) {
                obj.insert(
                    key.to_string(),
                    Value::String(rewrite_fel_for_assembly(expression, map)),
                );
            }
        }
        if let Some(Value::Object(context)) = obj.get_mut("context") {
            for value in context.values_mut() {
                if let Some(expression) = value.as_str() {
                    *value = Value::String(rewrite_fel_for_assembly(expression, map));
                }
            }
        }
        if let Some(message) = obj.get("message").and_then(Value::as_str) {
            obj.insert(
                "message".to_string(),
                Value::String(rewrite_message(message, map)),
            );
        }
        for key in ["and", "or", "xone"] {
            if let Some(Value::Array(entries)) = obj.get_mut(key) {
                for entry in entries.iter_mut() {
                    if let Some(text) = entry.as_str() {
                        *entry = Value::String(rewrite_shape_entry(
                            text,
                            map,
                            rename_map,
                            imported_shape_ids,
                        ));
                    }
                }
            }
        }
        if let Some(text) = obj.get("not").and_then(Value::as_str) {
            obj.insert(
                "not".to_string(),
                Value::String(rewrite_shape_entry(
                    text,
                    map,
                    rename_map,
                    imported_shape_ids,
                )),
            );
        }
    }
    shape
}

fn rewrite_shape_entry(
    entry: &str,
    map: &FelRewriteMap,
    rename_map: &HashMap<String, String>,
    imported_shape_ids: &HashSet<String>,
) -> String {
    if imported_shape_ids.contains(entry) {
        return rename_map
            .get(entry)
            .cloned()
            .unwrap_or_else(|| entry.to_string());
    }
    rewrite_fel_for_assembly(entry, map)
}

fn rewrite_message(message: &str, map: &FelRewriteMap) -> String {
    rewrite_message_template_for_assembly(message, map)
}

fn current_item_path(parent_path: &str, key: &str) -> String {
    if parent_path.is_empty() {
        key.to_string()
    } else {
        format!("{parent_path}.{key}")
    }
}

fn select_source_items(definition: &Value, fragment: Option<&str>) -> Option<Vec<Value>> {
    let items = definition.get("items").and_then(Value::as_array)?;
    match fragment {
        Some(fragment) => items
            .iter()
            .find(|item| item.get("key").and_then(Value::as_str) == Some(fragment))
            .cloned()
            .map(|item| vec![item]),
        None => Some(items.clone()),
    }
}

fn resolve_reference(
    resolver: &dyn RefResolver,
    ref_uri: &str,
    parsed_ref: &ParsedRef,
) -> Option<Value> {
    resolver
        .resolve(ref_uri)
        .or_else(|| {
            resolver.resolve(&versioned_ref_key(
                &parsed_ref.url,
                parsed_ref.version.as_deref(),
            ))
        })
        .or_else(|| resolver.resolve(&parsed_ref.url))
}

fn versioned_ref_key(url: &str, version: Option<&str>) -> String {
    match version {
        Some(version) if !version.is_empty() => format!("{url}|{version}"),
        _ => url.to_string(),
    }
}

#[derive(Debug, Clone)]
struct ParsedRef {
    url: String,
    version: Option<String>,
    fragment: Option<String>,
}

fn parse_ref(ref_uri: &str) -> ParsedRef {
    let mut remainder = ref_uri;
    let mut fragment = None;
    if let Some(index) = remainder.find('#') {
        fragment = Some(remainder[index + 1..].to_string());
        remainder = &remainder[..index];
    }

    if let Some(index) = remainder.find('|') {
        ParsedRef {
            url: remainder[..index].to_string(),
            version: Some(remainder[index + 1..].to_string()),
            fragment,
        }
    } else {
        ParsedRef {
            url: remainder.to_string(),
            version: None,
            fragment,
        }
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;
    use serde_json::json;

    #[test]
    fn assemble_imports_array_binds_into_host_root() {
        let host = json!({
            "$formspec": "1.0",
            "items": [
                {
                    "key": "homeAddress",
                    "type": "group",
                    "$ref": "https://example.org/common/address|1.0.0",
                    "keyPrefix": "home_"
                }
            ]
        });
        let mut resolver = MapResolver::new();
        resolver.add(
            "https://example.org/common/address",
            json!({
                "version": "1.0.0",
                "items": [
                    { "key": "street", "type": "field", "dataType": "string" },
                    { "key": "zip", "type": "field", "dataType": "string" }
                ],
                "binds": [
                    { "path": "zip", "required": true }
                ]
            }),
        );

        let result = assemble_definition(&host, &resolver);
        assert!(result.errors.is_empty(), "{:?}", result.errors);
        assert_eq!(
            result.definition["items"][0]["children"][0]["key"],
            json!("home_street")
        );
        assert_eq!(
            result.definition["items"][0]["children"][1]["key"],
            json!("home_zip")
        );
        assert_eq!(
            result.definition["binds"][0]["path"],
            json!("homeAddress.home_zip")
        );
        assert_eq!(result.assembled_from.len(), 1);
    }

    #[test]
    fn assemble_fragment_rewrites_bind_fel_paths() {
        let host = json!({
            "$formspec": "1.0",
            "items": [
                {
                    "key": "host",
                    "type": "group",
                    "$ref": "https://example.org/lib|1.0.0#budget",
                    "keyPrefix": "proj_"
                }
            ]
        });
        let mut resolver = MapResolver::new();
        resolver.add(
            "https://example.org/lib",
            json!({
                "version": "1.0.0",
                "items": [
                    {
                        "key": "budget",
                        "type": "group",
                        "children": [
                            { "key": "lineItems", "type": "group", "children": [
                                { "key": "lineAmount", "type": "field", "dataType": "decimal" }
                            ]},
                            { "key": "total", "type": "field", "dataType": "decimal" }
                        ]
                    }
                ],
                "binds": [
                    { "path": "budget.total", "calculate": "sum($budget.lineItems[*].lineAmount)" }
                ]
            }),
        );

        let result = assemble_definition(&host, &resolver);
        assert!(result.errors.is_empty(), "{:?}", result.errors);
        let bind = &result.definition["binds"][0];
        assert_eq!(bind["path"], json!("host.proj_budget.proj_total"));
        assert_eq!(
            bind["calculate"],
            json!("sum($host.proj_lineItems[*].proj_lineAmount)")
        );
    }

    #[test]
    fn assemble_shapes_and_variables_follow_ts_contract() {
        let host = json!({
            "$formspec": "1.0",
            "items": [
                {
                    "key": "host",
                    "type": "group",
                    "$ref": "https://example.org/lib|1.0.0#budget",
                    "keyPrefix": "proj_"
                }
            ],
            "shapes": [
                { "id": "existing-shape", "target": "#", "message": "Existing" }
            ],
            "variables": [
                { "name": "alreadyHere", "expression": "true", "scope": "#" }
            ]
        });
        let mut resolver = MapResolver::new();
        resolver.add(
            "https://example.org/lib",
            json!({
                "version": "1.0.0",
                "items": [
                    {
                        "key": "budget",
                        "type": "group",
                        "children": [
                            { "key": "grandTotal", "type": "field", "dataType": "decimal" }
                        ]
                    }
                ],
                "shapes": [
                    { "id": "existing-shape", "target": "budget", "message": "{{$budget.grandTotal}}" },
                    { "id": "ref-shape", "target": "budget", "message": "Refs", "and": ["existing-shape"] }
                ],
                "variables": [
                    { "name": "budgetComplete", "expression": "present($budget.grandTotal)", "scope": "#" },
                    { "name": "scopedToFragment", "expression": "true", "scope": "budget" }
                ]
            }),
        );

        let result = assemble_definition(&host, &resolver);
        assert!(result.errors.is_empty(), "{:?}", result.errors);
        assert_eq!(
            result.definition["shapes"][1]["id"],
            json!("host_existing-shape")
        );
        assert_eq!(
            result.definition["shapes"][2]["and"][0],
            json!("host_existing-shape")
        );
        assert_eq!(
            result.definition["shapes"][1]["message"],
            json!("{{$host.proj_grandTotal}}")
        );
        assert_eq!(
            result.definition["variables"][1]["expression"],
            json!("present($host.proj_grandTotal)")
        );
        assert_eq!(result.definition["variables"][2]["scope"], json!("host"));
    }

    #[test]
    fn assemble_detects_circular_refs() {
        let host = json!({
            "$formspec": "1.0",
            "items": [
                { "key": "a", "type": "group", "$ref": "a.json" }
            ]
        });
        let mut resolver = MapResolver::new();
        resolver.add(
            "a.json",
            json!({
                "items": [
                    { "key": "child", "type": "group", "$ref": "a.json" }
                ]
            }),
        );

        let result = assemble_definition(&host, &resolver);
        assert!(
            result
                .errors
                .iter()
                .any(|error| matches!(error, AssemblyError::CircularRef(_)))
        );
    }
}

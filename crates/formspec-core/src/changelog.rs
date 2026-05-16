//! Changelog — diffs two definition versions into a structured changelog.
//!
//! Compares two Formspec definition JSON documents section-by-section and
//! produces an ordered list of `Change` records with impact classification.
//!
//! Private `diff_*` / `merge_*` / `classify_*` helpers implement the section-by-section comparison.
#![allow(clippy::missing_docs_in_private_items)]

use std::collections::{HashMap, HashSet};

use serde_json::Map;
use serde_json::Value;

/// Kind of change between two definition versions.
#[allow(missing_docs)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ChangeType {
    Added,
    Removed,
    Modified,
}

/// Definition subsystem affected by a change.
#[allow(missing_docs)]
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum ChangeTarget {
    Item,
    Bind,
    Shape,
    OptionSet,
    DataSource,
    Screener,
    Migration,
    Metadata,
}

/// Severity classification of a single change.
#[allow(missing_docs)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum ChangeImpact {
    Cosmetic,
    Compatible,
    Breaking,
}

/// Semantic version bump implied by the aggregate impact.
#[allow(missing_docs)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SemverImpact {
    Patch,
    Minor,
    Major,
}

/// A single atomic change between two definition versions.
#[allow(missing_docs)]
pub struct Change {
    pub change_type: ChangeType,
    pub target: ChangeTarget,
    pub path: String,
    pub impact: ChangeImpact,
    pub key: Option<String>,
    pub description: Option<String>,
    pub before: Option<Value>,
    pub after: Option<Value>,
    pub migration_hint: Option<String>,
}

/// Structured diff between two definition versions.
#[allow(missing_docs)]
pub struct Changelog {
    pub definition_url: String,
    pub from_version: String,
    pub to_version: String,
    pub semver_impact: SemverImpact,
    pub changes: Vec<Change>,
}

/// Keys on an item that are purely presentational — changes to only these
/// keys produce `Cosmetic` impact, not `Compatible`.
const ITEM_COSMETIC_KEYS: &[&str] = &["label", "hint", "description", "help"];

/// Keys on an item whose change is `Breaking`.
const ITEM_BREAKING_KEYS: &[&str] = &["dataType", "type"];

/// Diff two Formspec definition JSON documents and produce a changelog.
///
/// Walks items, binds, shapes, optionSets, dataSources, screener, migrations,
/// and metadata sections. Each difference produces a `Change` with an impact
/// classification. The aggregate `semver_impact` is the maximum across all changes.
pub fn generate_changelog(old_def: &Value, new_def: &Value, definition_url: &str) -> Changelog {
    let from_version = str_field(old_def, "version").to_string();
    let to_version = str_field(new_def, "version").to_string();

    let mut changes = Vec::new();

    diff_items(old_def, new_def, &mut changes);
    diff_binds(old_def, new_def, &mut changes);
    diff_keyed_array(
        old_def,
        new_def,
        "shapes",
        "name",
        ChangeTarget::Shape,
        &mut changes,
    );
    diff_dict(
        old_def,
        new_def,
        "optionSets",
        ChangeTarget::OptionSet,
        &mut changes,
    );
    diff_dict(
        old_def,
        new_def,
        "dataSources",
        ChangeTarget::DataSource,
        &mut changes,
    );
    diff_screener(old_def, new_def, &mut changes);
    diff_migrations(old_def, new_def, &mut changes);
    diff_metadata_keys(old_def, new_def, METADATA_KEYS, &mut changes);

    // Deterministic emission: HashMap-indexed diff order is nondeterministic.
    changes.sort_by(|a, b| (&a.target, &a.path).cmp(&(&b.target, &b.path)));

    let semver_impact = compute_semver_impact(&changes);

    Changelog {
        definition_url: definition_url.to_string(),
        from_version,
        to_version,
        semver_impact,
        changes,
    }
}

/// Fold the per-change impacts into the implied semver bump.
fn compute_semver_impact(changes: &[Change]) -> SemverImpact {
    let max_impact = changes
        .iter()
        .map(|c| c.impact)
        .max()
        .unwrap_or(ChangeImpact::Cosmetic);
    match max_impact {
        ChangeImpact::Breaking => SemverImpact::Major,
        ChangeImpact::Compatible => SemverImpact::Minor,
        ChangeImpact::Cosmetic => SemverImpact::Patch,
    }
}

// ---------------------------------------------------------------------------
// Section diff helpers
// ---------------------------------------------------------------------------

fn str_field<'a>(val: &'a Value, key: &str) -> &'a str {
    val.get(key).and_then(|v| v.as_str()).unwrap_or("")
}

/// Index an array of objects by a string key field, returning (key → &Value).
///
/// O(1) lookup per key — used by `diff_items` / `diff_binds` / `diff_keyed_array`
/// to avoid quadratic `iter().find()` scans on the modify pass.
fn index_by_key<'a>(arr: &'a [Value], key_field: &str) -> HashMap<&'a str, &'a Value> {
    arr.iter()
        .filter_map(|v| v.get(key_field).and_then(|k| k.as_str()).map(|k| (k, v)))
        .collect()
}

/// Diff the `items` array, keyed by the `key` field on each item.
fn diff_items(old_def: &Value, new_def: &Value, changes: &mut Vec<Change>) {
    let empty = vec![];
    let old_items = old_def
        .get("items")
        .and_then(|v| v.as_array())
        .unwrap_or(&empty);
    let new_items = new_def
        .get("items")
        .and_then(|v| v.as_array())
        .unwrap_or(&empty);

    let old_map = index_by_key(old_items, "key");
    let new_map = index_by_key(new_items, "key");

    // Added
    for (&key, &val) in &new_map {
        if !old_map.contains_key(key) {
            changes.push(Change {
                change_type: ChangeType::Added,
                target: ChangeTarget::Item,
                path: format!("items.{key}"),
                impact: ChangeImpact::Compatible,
                key: Some(key.to_string()),
                description: None,
                before: None,
                after: Some(val.clone()),
                migration_hint: None,
            });
        }
    }

    // Removed
    for (&key, &val) in &old_map {
        if !new_map.contains_key(key) {
            changes.push(Change {
                change_type: ChangeType::Removed,
                target: ChangeTarget::Item,
                path: format!("items.{key}"),
                impact: ChangeImpact::Breaking,
                key: Some(key.to_string()),
                description: None,
                before: Some(val.clone()),
                after: None,
                migration_hint: Some("drop".to_string()),
            });
        }
    }

    // Modified
    for (&key, &old_val) in &old_map {
        if let Some(&new_val) = new_map.get(key)
            && old_val != new_val
        {
            let impact = classify_item_modification(old_val, new_val);
            changes.push(Change {
                change_type: ChangeType::Modified,
                target: ChangeTarget::Item,
                path: format!("items.{key}"),
                impact,
                key: Some(key.to_string()),
                description: None,
                before: Some(old_val.clone()),
                after: Some(new_val.clone()),
                migration_hint: None,
            });
        }
    }
}

/// Classify an item modification's impact by inspecting which keys changed.
fn classify_item_modification(old: &Value, new: &Value) -> ChangeImpact {
    let old_obj = old.as_object();
    let new_obj = new.as_object();
    let (Some(old_obj), Some(new_obj)) = (old_obj, new_obj) else {
        return ChangeImpact::Compatible;
    };

    // Collect all keys that differ
    let all_keys: HashSet<&String> = old_obj.keys().chain(new_obj.keys()).collect();

    let mut has_breaking = false;
    let mut has_non_cosmetic = false;

    for key in &all_keys {
        let old_v = old_obj.get(key.as_str());
        let new_v = new_obj.get(key.as_str());
        if old_v == new_v {
            continue;
        }
        if ITEM_BREAKING_KEYS.contains(&key.as_str()) {
            has_breaking = true;
        } else if !ITEM_COSMETIC_KEYS.contains(&key.as_str()) {
            has_non_cosmetic = true;
        }
    }

    if has_breaking {
        ChangeImpact::Breaking
    } else if has_non_cosmetic {
        ChangeImpact::Compatible
    } else {
        ChangeImpact::Cosmetic
    }
}

/// Index binds by path. Handles both formats:
/// - Object format: `"binds": { "name": { "required": "true" } }` (key = path)
/// - Array format: `"binds": [{ "path": "name", "required": "true" }]`
fn index_binds_by_path(def: &Value) -> Vec<(String, Value)> {
    let entries = match def.get("binds") {
        Some(Value::Object(obj)) => obj.iter().map(|(k, v)| (k.clone(), v.clone())).collect(),
        Some(Value::Array(arr)) => merge_bind_array_entries(arr),
        _ => vec![],
    };
    dedupe_bind_entries(entries)
}

/// Merge any duplicate `path` rows left after array/object indexing (e.g. Python
/// `depythonize` can yield multiple array elements for the same path where
/// `merge_bind_array_entries` already merged in the serde_json case).
fn dedupe_bind_entries(entries: Vec<(String, Value)>) -> Vec<(String, Value)> {
    let mut out: Vec<(String, Value)> = Vec::new();
    let mut positions: HashMap<String, usize> = HashMap::new();
    for (path, val) in entries {
        if let Some(&idx) = positions.get(&path) {
            merge_bind_value(&mut out[idx].1, &val, &path);
        } else {
            positions.insert(path.clone(), out.len());
            out.push((path, val));
        }
    }
    out
}

fn merge_bind_array_entries(arr: &[Value]) -> Vec<(String, Value)> {
    let mut merged: Vec<(String, Value)> = Vec::new();
    let mut positions: HashMap<String, usize> = HashMap::new();

    for bind in arr {
        let Some(path) = bind.get("path").and_then(|p| p.as_str()) else {
            continue;
        };

        if let Some(index) = positions.get(path).copied() {
            merge_bind_value(&mut merged[index].1, bind, path);
            continue;
        }

        let mut initial = Value::Object(Map::new());
        merge_bind_value(&mut initial, bind, path);
        positions.insert(path.to_string(), merged.len());
        merged.push((path.to_string(), initial));
    }

    merged
}

fn merge_bind_value(target: &mut Value, incoming: &Value, path: &str) {
    let Value::Object(target_obj) = target else {
        *target = incoming.clone();
        return;
    };

    let Some(incoming_obj) = incoming.as_object() else {
        *target = incoming.clone();
        return;
    };

    target_obj.insert("path".to_string(), Value::String(path.to_string()));
    for (key, value) in incoming_obj {
        target_obj.insert(key.clone(), value.clone());
    }
}

/// Diff the `binds` array, keyed by each bind's `path` field.
fn diff_binds(old_def: &Value, new_def: &Value, changes: &mut Vec<Change>) {
    let old_binds = index_binds_by_path(old_def);
    let new_binds = index_binds_by_path(new_def);

    // O(1) lookup keyed by &str borrowed from the owning Vec entries.
    let old_map: HashMap<&str, &Value> =
        old_binds.iter().map(|(k, v)| (k.as_str(), v)).collect();
    let new_map: HashMap<&str, &Value> =
        new_binds.iter().map(|(k, v)| (k.as_str(), v)).collect();

    // Added
    for (&path, &val) in &new_map {
        if !old_map.contains_key(path) {
            let has_required = bind_has_required(val);
            changes.push(Change {
                change_type: ChangeType::Added,
                target: ChangeTarget::Bind,
                path: path.to_string(),
                impact: if has_required {
                    ChangeImpact::Breaking
                } else {
                    ChangeImpact::Compatible
                },
                key: None,
                description: None,
                before: None,
                after: Some(val.clone()),
                migration_hint: None,
            });
        }
    }

    // Removed
    for (&path, &val) in &old_map {
        if !new_map.contains_key(path) {
            changes.push(Change {
                change_type: ChangeType::Removed,
                target: ChangeTarget::Bind,
                path: path.to_string(),
                impact: ChangeImpact::Breaking,
                key: None,
                description: None,
                before: Some(val.clone()),
                after: None,
                migration_hint: None,
            });
        }
    }

    // Modified
    for (&path, &old_val) in &old_map {
        if let Some(&new_val) = new_map.get(path)
            && old_val != new_val
        {
            let impact = classify_bind_modification(old_val, new_val);
            changes.push(Change {
                change_type: ChangeType::Modified,
                target: ChangeTarget::Bind,
                path: path.to_string(),
                impact,
                key: None,
                description: None,
                before: Some(old_val.clone()),
                after: Some(new_val.clone()),
                migration_hint: None,
            });
        }
    }
}

/// Check if a bind value contains a truthy `required` property.
fn bind_has_required(bind: &Value) -> bool {
    match bind.get("required") {
        Some(Value::String(s)) => !s.is_empty() && s != "false",
        Some(Value::Bool(b)) => *b,
        _ => false,
    }
}

/// Classify a bind modification by checking required gain/loss.
fn classify_bind_modification(old: &Value, new: &Value) -> ChangeImpact {
    let old_req = bind_has_required(old);
    let new_req = bind_has_required(new);

    if !old_req && new_req {
        // Gained required → Breaking
        ChangeImpact::Breaking
    } else if old_req && !new_req {
        // Lost required → Compatible
        ChangeImpact::Compatible
    } else if old.get("constraint") != new.get("constraint") {
        ChangeImpact::Compatible
    } else {
        ChangeImpact::Cosmetic
    }
}

/// Diff a keyed array section (shapes). Elements are matched by a key field.
fn diff_keyed_array(
    old_def: &Value,
    new_def: &Value,
    section: &str,
    key_field: &str,
    target: ChangeTarget,
    changes: &mut Vec<Change>,
) {
    let empty = vec![];
    let old_arr = old_def
        .get(section)
        .and_then(|v| v.as_array())
        .unwrap_or(&empty);
    let new_arr = new_def
        .get(section)
        .and_then(|v| v.as_array())
        .unwrap_or(&empty);

    let old_map = index_by_key(old_arr, key_field);
    let new_map = index_by_key(new_arr, key_field);

    let (add_impact, remove_impact, modify_impact) = keyed_array_impacts(&target);

    for (&key, &val) in &new_map {
        if !old_map.contains_key(key) {
            changes.push(Change {
                change_type: ChangeType::Added,
                target: target.clone(),
                path: format!("{section}.{key}"),
                impact: add_impact,
                key: None,
                description: None,
                before: None,
                after: Some(val.clone()),
                migration_hint: None,
            });
        }
    }

    for (&key, &val) in &old_map {
        if !new_map.contains_key(key) {
            changes.push(Change {
                change_type: ChangeType::Removed,
                target: target.clone(),
                path: format!("{section}.{key}"),
                impact: remove_impact,
                key: None,
                description: None,
                before: Some(val.clone()),
                after: None,
                migration_hint: None,
            });
        }
    }

    for (&key, &old_val) in &old_map {
        if let Some(&new_val) = new_map.get(key)
            && old_val != new_val
        {
            changes.push(Change {
                change_type: ChangeType::Modified,
                target: target.clone(),
                path: format!("{section}.{key}"),
                impact: modify_impact,
                key: None,
                description: None,
                before: Some(old_val.clone()),
                after: Some(new_val.clone()),
                migration_hint: None,
            });
        }
    }
}

/// Impact rules for keyed array sections: (add, remove, modify).
fn keyed_array_impacts(target: &ChangeTarget) -> (ChangeImpact, ChangeImpact, ChangeImpact) {
    match target {
        // Shape add/remove are both Compatible (shapes are constraints; removing loosens).
        ChangeTarget::Shape => (
            ChangeImpact::Compatible,
            ChangeImpact::Compatible,
            ChangeImpact::Cosmetic,
        ),
        _ => (
            ChangeImpact::Compatible,
            ChangeImpact::Breaking,
            ChangeImpact::Compatible,
        ),
    }
}

/// Diff a dict section (optionSets, dataSources).
fn diff_dict(
    old_def: &Value,
    new_def: &Value,
    section: &str,
    target: ChangeTarget,
    changes: &mut Vec<Change>,
) {
    let empty_obj = serde_json::Map::new();
    let old_dict = old_def
        .get(section)
        .and_then(|v| v.as_object())
        .unwrap_or(&empty_obj);
    let new_dict = new_def
        .get(section)
        .and_then(|v| v.as_object())
        .unwrap_or(&empty_obj);

    let old_keys: HashSet<&String> = old_dict.keys().collect();
    let new_keys: HashSet<&String> = new_dict.keys().collect();

    for key in new_keys.difference(&old_keys) {
        changes.push(Change {
            change_type: ChangeType::Added,
            target: target.clone(),
            path: format!("{section}.{key}"),
            impact: ChangeImpact::Compatible,
            key: None,
            description: None,
            before: None,
            after: Some(new_dict[key.as_str()].clone()),
            migration_hint: None,
        });
    }

    for key in old_keys.difference(&new_keys) {
        changes.push(Change {
            change_type: ChangeType::Removed,
            target: target.clone(),
            path: format!("{section}.{key}"),
            impact: ChangeImpact::Breaking,
            key: None,
            description: None,
            before: Some(old_dict[key.as_str()].clone()),
            after: None,
            migration_hint: None,
        });
    }

    for key in old_keys.intersection(&new_keys) {
        let old_val = &old_dict[key.as_str()];
        let new_val = &new_dict[key.as_str()];
        if old_val != new_val {
            changes.push(Change {
                change_type: ChangeType::Modified,
                target: target.clone(),
                path: format!("{section}.{key}"),
                impact: ChangeImpact::Compatible,
                key: None,
                description: None,
                before: Some(old_val.clone()),
                after: Some(new_val.clone()),
                migration_hint: None,
            });
        }
    }
}

/// Diff the singleton `screener` section.
fn diff_screener(old_def: &Value, new_def: &Value, changes: &mut Vec<Change>) {
    let old_s = old_def.get("screener");
    let new_s = new_def.get("screener");

    match (old_s, new_s) {
        (None, Some(val)) => {
            changes.push(Change {
                change_type: ChangeType::Added,
                target: ChangeTarget::Screener,
                path: "screener".to_string(),
                impact: ChangeImpact::Compatible,
                key: None,
                description: None,
                before: None,
                after: Some(val.clone()),
                migration_hint: None,
            });
        }
        (Some(val), None) => {
            changes.push(Change {
                change_type: ChangeType::Removed,
                target: ChangeTarget::Screener,
                path: "screener".to_string(),
                impact: ChangeImpact::Breaking,
                key: None,
                description: None,
                before: Some(val.clone()),
                after: None,
                migration_hint: None,
            });
        }
        (Some(old_val), Some(new_val)) if old_val != new_val => {
            changes.push(Change {
                change_type: ChangeType::Modified,
                target: ChangeTarget::Screener,
                path: "screener".to_string(),
                impact: ChangeImpact::Compatible,
                key: None,
                description: None,
                before: Some(old_val.clone()),
                after: Some(new_val.clone()),
                migration_hint: None,
            });
        }
        _ => {}
    }
}

/// Diff the `migrations` array (positional, not keyed).
fn diff_migrations(old_def: &Value, new_def: &Value, changes: &mut Vec<Change>) {
    let empty = vec![];
    let old_arr = old_def
        .get("migrations")
        .and_then(|v| v.as_array())
        .unwrap_or(&empty);
    let new_arr = new_def
        .get("migrations")
        .and_then(|v| v.as_array())
        .unwrap_or(&empty);

    let max_len = old_arr.len().max(new_arr.len());
    for i in 0..max_len {
        let old_val = old_arr.get(i);
        let new_val = new_arr.get(i);
        match (old_val, new_val) {
            (None, Some(val)) => {
                changes.push(Change {
                    change_type: ChangeType::Added,
                    target: ChangeTarget::Migration,
                    path: format!("migrations[{i}]"),
                    impact: ChangeImpact::Compatible,
                    key: None,
                    description: None,
                    before: None,
                    after: Some(val.clone()),
                    migration_hint: None,
                });
            }
            (Some(val), None) => {
                changes.push(Change {
                    change_type: ChangeType::Removed,
                    target: ChangeTarget::Migration,
                    path: format!("migrations[{i}]"),
                    impact: ChangeImpact::Compatible,
                    key: None,
                    description: None,
                    before: Some(val.clone()),
                    after: None,
                    migration_hint: None,
                });
            }
            (Some(o), Some(n)) if o != n => {
                changes.push(Change {
                    change_type: ChangeType::Modified,
                    target: ChangeTarget::Migration,
                    path: format!("migrations[{i}]"),
                    impact: ChangeImpact::Cosmetic,
                    key: None,
                    description: None,
                    before: Some(o.clone()),
                    after: Some(n.clone()),
                    migration_hint: None,
                });
            }
            _ => {}
        }
    }
}

/// Metadata keys to compare.
const METADATA_KEYS: &[&str] = &[
    "title",
    "url",
    "version",
    "$formspec",
    "description",
    "formPresentation",
];

/// Diff a fixed set of top-level metadata keys, emitting `Cosmetic` changes.
fn diff_metadata_keys(
    old_def: &Value,
    new_def: &Value,
    keys: &[&str],
    changes: &mut Vec<Change>,
) {
    for &key in keys {
        let old_val = old_def.get(key);
        let new_val = new_def.get(key);
        if old_val != new_val {
            changes.push(Change {
                change_type: match (old_val, new_val) {
                    (None, Some(_)) => ChangeType::Added,
                    (Some(_), None) => ChangeType::Removed,
                    _ => ChangeType::Modified,
                },
                target: ChangeTarget::Metadata,
                path: key.to_string(),
                impact: ChangeImpact::Cosmetic,
                key: None,
                description: None,
                before: old_val.cloned(),
                after: new_val.cloned(),
                migration_hint: None,
            });
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
// Standalone Screener Document diffing
// ═══════════════════════════════════════════════════════════════════

/// Screener metadata keys.
const SCREENER_METADATA_KEYS: &[&str] = &[
    "title",
    "url",
    "version",
    "$formspecScreener",
    "description",
    "evaluationBinding",
    "resultValidity",
];

/// Diff two standalone Screener Documents and produce a changelog.
///
/// Walks items, binds, evaluation phases, routes, availability, and metadata.
pub fn generate_screener_changelog(
    old_doc: &Value,
    new_doc: &Value,
    screener_url: &str,
) -> Changelog {
    let from_version = str_field(old_doc, "version").to_string();
    let to_version = str_field(new_doc, "version").to_string();

    let mut changes = Vec::new();

    // Items (keyed by "key")
    diff_keyed_array(
        old_doc,
        new_doc,
        "items",
        "key",
        ChangeTarget::Item,
        &mut changes,
    );

    // Binds
    diff_binds(old_doc, new_doc, &mut changes);

    // Evaluation phases (keyed by "id")
    diff_screener_evaluation(old_doc, new_doc, &mut changes);

    // Availability window
    diff_availability(old_doc, new_doc, &mut changes);

    // Metadata
    diff_metadata_keys(old_doc, new_doc, SCREENER_METADATA_KEYS, &mut changes);

    // Deterministic emission: HashMap-indexed diff order is nondeterministic.
    changes.sort_by(|a, b| (&a.target, &a.path).cmp(&(&b.target, &b.path)));

    let semver_impact = compute_semver_impact(&changes);

    Changelog {
        definition_url: screener_url.to_string(),
        from_version,
        to_version,
        semver_impact,
        changes,
    }
}

/// Diff the evaluation pipeline (phases keyed by `id`, routes by index within phase).
fn diff_screener_evaluation(old_doc: &Value, new_doc: &Value, changes: &mut Vec<Change>) {
    let empty = vec![];
    let old_phases = old_doc
        .get("evaluation")
        .and_then(Value::as_array)
        .unwrap_or(&empty);
    let new_phases = new_doc
        .get("evaluation")
        .and_then(Value::as_array)
        .unwrap_or(&empty);

    let old_map: HashMap<&str, &Value> = old_phases
        .iter()
        .filter_map(|p| p.get("id").and_then(Value::as_str).map(|id| (id, p)))
        .collect();
    let new_map: HashMap<&str, &Value> = new_phases
        .iter()
        .filter_map(|p| p.get("id").and_then(Value::as_str).map(|id| (id, p)))
        .collect();

    // Added phases
    for (&id, &val) in &new_map {
        if !old_map.contains_key(id) {
            changes.push(Change {
                change_type: ChangeType::Added,
                target: ChangeTarget::Screener,
                path: format!("evaluation.{id}"),
                impact: ChangeImpact::Compatible,
                key: Some(id.to_string()),
                description: None,
                before: None,
                after: Some(val.clone()),
                migration_hint: None,
            });
        }
    }

    // Removed phases
    for (&id, &val) in &old_map {
        if !new_map.contains_key(id) {
            changes.push(Change {
                change_type: ChangeType::Removed,
                target: ChangeTarget::Screener,
                path: format!("evaluation.{id}"),
                impact: ChangeImpact::Breaking,
                key: Some(id.to_string()),
                description: None,
                before: Some(val.clone()),
                after: None,
                migration_hint: None,
            });
        }
    }

    // Modified phases
    for (&id, &old_val) in &old_map {
        if let Some(&new_val) = new_map.get(id) {
            if old_val != new_val {
                // Strategy change is breaking
                let old_strategy = old_val.get("strategy").and_then(Value::as_str);
                let new_strategy = new_val.get("strategy").and_then(Value::as_str);
                let impact = if old_strategy != new_strategy {
                    ChangeImpact::Breaking
                } else {
                    ChangeImpact::Compatible
                };

                changes.push(Change {
                    change_type: ChangeType::Modified,
                    target: ChangeTarget::Screener,
                    path: format!("evaluation.{id}"),
                    impact,
                    key: Some(id.to_string()),
                    description: None,
                    before: Some(old_val.clone()),
                    after: Some(new_val.clone()),
                    migration_hint: None,
                });
            }
        }
    }
}

/// Diff the availability window.
fn diff_availability(old_doc: &Value, new_doc: &Value, changes: &mut Vec<Change>) {
    let old_val = old_doc.get("availability");
    let new_val = new_doc.get("availability");

    if old_val == new_val {
        return;
    }

    changes.push(Change {
        change_type: match (old_val, new_val) {
            (None, Some(_)) => ChangeType::Added,
            (Some(_), None) => ChangeType::Removed,
            _ => ChangeType::Modified,
        },
        target: ChangeTarget::Screener,
        path: "availability".to_string(),
        impact: ChangeImpact::Compatible,
        key: None,
        description: None,
        before: old_val.cloned(),
        after: new_val.cloned(),
        migration_hint: None,
    });
}

// Tests live in crates/formspec-core/tests/changelog_test.rs (integration test)
// to avoid compilation issues with sibling module test blocks.

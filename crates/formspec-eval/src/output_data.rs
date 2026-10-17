//! The nested Response projection of an evaluation: [`EvaluationResult::data`].
//!
//! `values` is the flat state keyed by path (what an editing engine updates on every keystroke).
//! `data` is what a Response stores (Core: field items are scalar properties, non-repeatable groups
//! nested objects, repeatable groups arrays of row objects, display items nothing). It is built from
//! the evaluated item tree and the post-NRB `values`, so `nonRelevantBehavior` shapes it exactly as
//! it shapes the serialized output. It is the inverse of [`crate::rebuild::flatten_response_data`].

use std::collections::{HashMap, HashSet};

use serde_json::{Map, Value};

use crate::types::{ItemInfo, NrbMode};

/// Build the nested projection of `values` through the evaluated `items`.
pub(crate) fn build_output_data(
    items: &[ItemInfo],
    values: &HashMap<String, Value>,
    default_nrb: &str,
) -> Value {
    let mut covered = HashSet::new();
    let mut root = Map::new();
    let inherited = NrbMode::from_str_lossy(default_nrb);
    emit(items, values, inherited, &mut covered, &mut root);
    // Keys no Item names (additional properties the input carried) keep their place: dotted paths nest.
    let mut extras: Vec<&String> = values.keys().filter(|path| !covered.contains(path.as_str())).collect();
    extras.sort();
    for path in extras {
        insert_extra(&mut root, path, values[path].clone());
    }
    Value::Object(root)
}

/// `inherited` is the nearest enclosing `nonRelevantBehavior` (the Definition's at the root), the
/// same resolution [`crate::nrb::apply_nrb`] used to shape `values`.
fn emit(
    items: &[ItemInfo],
    values: &HashMap<String, Value>,
    inherited: NrbMode,
    covered: &mut HashSet<String>,
    into: &mut Map<String, Value>,
) {
    for item in items {
        let mode = item.nrb.unwrap_or(inherited);
        match (item.item_type.as_str(), item.repeatable) {
            ("display", _) => {}
            ("group", false) => {
                // A group's own path is never an answer: `empty` nulls it in `values`, and that null
                // must not replace the group's object.
                covered.insert(item.path.clone());
                let mut object = Map::new();
                emit(&item.children, values, mode, covered, &mut object);
                if !object.is_empty() {
                    into.insert(item.key.clone(), Value::Object(object));
                }
            }
            ("group", true) => {
                covered.insert(item.path.clone());
                // Rows come from the post-NRB `values`, so each leaf's most specific behavior already
                // applied: `empty` left null leaves, `keep` the answers, `remove` nothing.
                // Expanded rows are consecutive runs of children sharing a `parent_path` (`rows[i]`).
                let mut rows: Vec<(&str, Map<String, Value>)> = Vec::new();
                for child in &item.children {
                    let row = child.parent_path.as_deref().unwrap_or("");
                    if rows.last().is_none_or(|(last, _)| *last != row) {
                        rows.push((row, Map::new()));
                    }
                    let (_, object) = rows.last_mut().expect("row pushed above");
                    emit(std::slice::from_ref(child), values, mode, covered, object);
                }
                // A repeat removed as non-relevant survives only through a descendant whose own
                // `keep` or `empty` outranks it, the rule the group branch applies to its object.
                let removed = !item.relevant && mode == NrbMode::Remove;
                if removed && rows.iter().all(|(_, row)| row.is_empty()) {
                    continue;
                }
                into.insert(
                    item.key.clone(),
                    Value::Array(rows.into_iter().map(|(_, row)| Value::Object(row)).collect()),
                );
            }
            _ => {
                covered.insert(item.path.clone());
                if let Some(value) = values.get(&item.path) {
                    into.insert(item.key.clone(), value.clone());
                }
            }
        }
    }
}

fn insert_extra(root: &mut Map<String, Value>, path: &str, value: Value) {
    if path.contains('[') {
        root.insert(path.to_string(), value);
        return;
    }
    let mut segments = path.split('.').peekable();
    let mut cursor = root;
    while let Some(segment) = segments.next() {
        if segments.peek().is_none() {
            cursor.insert(segment.to_string(), value);
            return;
        }
        // A scalar already sits where a group would nest; keep the dotted spelling.
        if cursor.get(segment).is_some_and(|v| !v.is_object()) {
            cursor.insert(path.to_string(), value);
            return;
        }
        cursor = cursor
            .entry(segment.to_string())
            .or_insert_with(|| Value::Object(Map::new()))
            .as_object_mut()
            .expect("an object by the check above");
    }
}

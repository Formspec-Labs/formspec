//! The nested Response projection of an evaluation: [`EvaluationResult::data`].
//!
//! `values` is the flat state keyed by path (what an editing engine updates on every keystroke).
//! `data` is what a Response stores (Core: field items are scalar properties, non-repeatable groups
//! nested objects, repeatable groups arrays of row objects, display items nothing). It is built from
//! the evaluated item tree and the post-NRB `values`, so `nonRelevantBehavior` shapes it exactly as
//! it shapes the serialized output. It is the inverse of [`crate::rebuild::flatten_response_data`].

use std::collections::{HashMap, HashSet};

use fel_core::exact_json::{Map, Value};

use crate::rebuild::rebuild_item_tree;
use crate::scope::RowCounts;
use crate::types::{ItemInfo, NrbMode};

/// Checks whether a filed Response's data matches its evaluation.
///
/// Pass the Definition used to produce `evaluated` (the evaluation's `data` field).
/// The evaluation may add `[]` for an omitted declared repeat and non-repeatable
/// group objects that contain only those additions. All filed values, including
/// calculated fields, and the number and order of repeat rows must match. Callers
/// handle validation findings separately.
pub fn filed_response_data_matches(definition: &Value, filed: &Value, evaluated: &Value) -> bool {
    filed == evaluated
        || object_matches(
            &collect_group_items(&rebuild_item_tree(definition)),
            Some(filed),
            evaluated,
        )
}

/// Checks one object scope, including a group object absent from the filed data.
fn object_matches(
    groups: &HashMap<&str, &ItemInfo>,
    filed: Option<&Value>,
    evaluated: &Value,
) -> bool {
    let Value::Object(evaluated) = evaluated else {
        return false;
    };
    let empty = Map::new();
    let filed = match filed {
        Some(Value::Object(filed)) => filed,
        None if !evaluated.is_empty() => &empty,
        _ => return false,
    };
    if filed.keys().any(|key| !evaluated.contains_key(key)) {
        return false;
    }

    evaluated.iter().all(|(key, value)| {
        let prior = filed.get(key);
        prior == Some(value)
            || groups
                .get(key.as_str())
                .is_some_and(|group| group_matches(group, prior, value))
    })
}

/// Collects group declarations that `emit` represents in this object scope.
fn collect_group_items(items: &[ItemInfo]) -> HashMap<&str, &ItemInfo> {
    fn walk<'a>(items: &'a [ItemInfo], groups: &mut HashMap<&'a str, &'a ItemInfo>) {
        for item in items {
            match item.item_type.as_str() {
                "group" => {
                    groups.insert(item.key.as_str(), item);
                }
                "display" => {}
                // Dependent questions share their parent's object.
                _ => walk(&item.children, groups),
            }
        }
    }
    let mut groups = HashMap::new();
    walk(items, &mut groups);
    groups
}

/// Allows omitted empty repeats and requires filed rows to match in count and order.
fn group_matches(item: &ItemInfo, filed: Option<&Value>, evaluated: &Value) -> bool {
    match (item.repeatable, filed, evaluated) {
        (false, _, _) => object_matches(&collect_group_items(&item.children), filed, evaluated),
        (true, None, Value::Array(rows)) => rows.is_empty(),
        (true, Some(Value::Array(filed)), Value::Array(evaluated))
            if filed.len() == evaluated.len() =>
        {
            let groups = collect_group_items(&item.children);
            filed
                .iter()
                .zip(evaluated)
                .all(|(prior, row)| prior == row || object_matches(&groups, Some(prior), row))
        }
        _ => false,
    }
}

/// Build the nested projection of `values` through the evaluated `items`.
pub(crate) fn build_output_data(
    items: &[ItemInfo],
    counts: &RowCounts,
    values: &HashMap<String, Value>,
    default_nrb: &str,
) -> Value {
    let mut covered = HashSet::new();
    let mut root = Map::new();
    let inherited = NrbMode::from_str_lossy(default_nrb);
    emit(items, counts, values, inherited, &mut covered, &mut root);
    // Keys no Item names (additional properties the input carried) keep their place: dotted paths nest.
    let mut extras: Vec<&String> = values
        .keys()
        .filter(|path| !covered.contains(path.as_str()))
        .collect();
    extras.sort();
    for path in extras {
        insert_extra(&mut root, path, values[path].clone());
    }
    Value::Object(root)
}

/// `inherited` is the nearest enclosing `nonRelevantBehavior` (the Definition's at the root), the
/// same resolution [`crate::nrb::apply_nrb`] used to shape `values`.
/// Keep the object scope rules in sync with `collect_group_items`.
fn emit(
    items: &[ItemInfo],
    counts: &RowCounts,
    values: &HashMap<String, Value>,
    inherited: NrbMode,
    covered: &mut HashSet<String>,
    into: &mut Map<String, Value>,
) {
    for item in items {
        let mode = item.nrb.unwrap_or(inherited);
        match (item.item_type.as_str(), item.repeatable) {
            ("display", _) => {
                covered.insert(item.path.clone());
            }
            ("group", false) => {
                // A group's own path is never an answer: `empty` nulls it in `values`, and that null
                // must not replace the group's object.
                covered.insert(item.path.clone());
                let mut object = Map::new();
                emit(&item.children, counts, values, mode, covered, &mut object);
                if !object.is_empty() {
                    into.insert(item.key.clone(), Value::Object(object));
                }
            }
            ("group", true) => {
                covered.insert(item.path.clone());
                // Rows come from the post-NRB `values`, so each leaf's most specific behavior already
                // applied: `empty` left null leaves, `keep` the answers, `remove` nothing.
                let count = counts.get(&item.path).copied().unwrap_or(0) as usize;
                let mut rows = vec![Map::new(); count];
                for child in &item.children {
                    let Some(index) = child
                        .parent_path
                        .as_deref()
                        .and_then(|row| row.strip_suffix(']'))
                        .and_then(|row| row.rsplit_once('['))
                        .and_then(|(_, index)| index.parse::<usize>().ok())
                    else {
                        continue;
                    };
                    emit(
                        std::slice::from_ref(child),
                        counts,
                        values,
                        mode,
                        covered,
                        &mut rows[index],
                    );
                }
                // A repeat removed as non-relevant survives only through a descendant whose own
                // `keep` or `empty` outranks it, the rule the group branch applies to its object.
                let removed = !item.mip.relevant && mode == NrbMode::Remove;
                if removed && rows.iter().all(Map::is_empty) {
                    continue;
                }
                into.insert(
                    item.key.clone(),
                    Value::Array(rows.into_iter().map(Value::Object).collect()),
                );
            }
            _ => {
                covered.insert(item.path.clone());
                if let Some(value) = values.get(&item.path) {
                    into.insert(item.key.clone(), value.clone());
                }
                // Dependent questions share the parent's object because a scalar cannot contain children.
                emit(&item.children, counts, values, mode, covered, into);
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

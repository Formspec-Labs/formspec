//! Response `data` arrives nested (Core: non-repeatable groups are objects, repeatable groups are
//! arrays of row objects); the evaluator works on flat paths. This one walk over the item tree is
//! where the two meet: it flattens and *consumes* groups and repeats, so no group object or row
//! array survives beside its own leaves. [`crate::output_data`] is its inverse.

use std::collections::HashMap;

use serde_json::Value;

use crate::types::ItemInfo;

/// Flat evaluation input produced by [`flatten_response_data`].
pub(crate) struct FlatInput {
    /// Leaf values by instance path (`group.field`, `rows[0].name`, `rows[0].addr.flag`).
    pub values: HashMap<String, Value>,
    /// Row count per repeat instance path (`rows`, `rows[0].tasks`) for every array supplied,
    /// so a row with no answered field still counts.
    pub repeat_counts: HashMap<String, u64>,
}

/// Flatten non-repeatable group objects and repeat row arrays, following the item tree.
///
/// - A key naming a non-repeatable group whose value is an object, or a repeatable group whose
///   value is an array of row objects, is replaced by its leaves (recursively, rows included).
/// - Field values are never opened: a money `{amount, currency}` or an attachment list stays one
///   value, whatever its shape.
/// - Flat spellings (`g.a`, `rows[0].name`, `rows[1].addr` holding an object) walk the same way, so
///   nested and flat input produce identical output.
/// - A key that matches no Item is kept at its position: Response `data` allows additional
///   properties (`response.schema.json`).
///
/// Returns the sorted paths supplied twice as the error: which value is the respondent's answer
/// cannot be decided, so the caller refuses the input.
pub(crate) fn flatten_response_data(
    items: &[ItemInfo],
    data: &HashMap<String, Value>,
) -> Result<FlatInput, Vec<String>> {
    let mut walk = Walk {
        out: HashMap::with_capacity(data.len()),
        counts: HashMap::new(),
        conflicts: Vec::new(),
    };
    for (key, value) in data {
        walk.place(items, key, value, "");
    }
    if walk.conflicts.is_empty() {
        Ok(FlatInput { values: walk.out, repeat_counts: walk.counts })
    } else {
        walk.conflicts.sort();
        walk.conflicts.dedup();
        Err(walk.conflicts)
    }
}

struct Walk {
    out: HashMap<String, Value>,
    counts: HashMap<String, u64>,
    conflicts: Vec<String>,
}

/// `name` and its `[i]` row index, when the segment has one.
fn split_index(segment: &str) -> (&str, Option<usize>) {
    if let Some(open) = segment.strip_suffix(']').and_then(|s| s.rfind('[').map(|o| (s, o))) {
        let (s, o) = open;
        if let Ok(i) = s[o + 1..].parse::<usize>() {
            return (&s[..o], Some(i));
        }
    }
    (segment, None)
}

impl Walk {
    fn insert(&mut self, path: String, value: Value) {
        if self.out.contains_key(&path) {
            self.conflicts.push(path);
        } else {
            self.out.insert(path, value);
        }
    }

    fn count(&mut self, path: String, n: usize) {
        let entry = self.counts.entry(path).or_insert(0);
        *entry = (*entry).max(n as u64);
    }

    /// Place `key` (one key, or a flat dotted/indexed path) with `value` under `prefix`.
    fn place(&mut self, siblings: &[ItemInfo], key: &str, value: &Value, prefix: &str) {
        let (segment, rest) = match key.split_once('.') {
            Some((head, rest)) => (head, Some(rest)),
            None => (key, None),
        };
        let (name, index) = split_index(segment);
        let item = siblings.iter().find(|i| i.key == name && i.item_type == "group");
        match (item, index, rest) {
            // `rows[i].rest`: a flat path into row i.
            (Some(group), Some(i), Some(rest)) if group.repeatable => {
                self.count(format!("{prefix}{name}"), i + 1);
                let row = format!("{prefix}{name}[{i}].");
                self.place(&group.children, rest, value, &row);
            }
            // `group.rest`: a flat path through a non-repeatable group.
            (Some(group), None, Some(rest)) if !group.repeatable => {
                self.place(&group.children, rest, value, &format!("{prefix}{name}."));
            }
            // `rows[i]`: one whole row.
            (Some(group), Some(i), None) if group.repeatable => {
                self.count(format!("{prefix}{name}"), i + 1);
                self.row(group, i, value, prefix);
            }
            // `group`: the group's object.
            (Some(group), None, None) if !group.repeatable => {
                if let Value::Object(map) = value {
                    for (k, v) in map {
                        self.place(&group.children, k, v, &format!("{prefix}{name}."));
                    }
                } else {
                    self.insert(format!("{prefix}{key}"), value.clone());
                }
            }
            // `rows`: the row array.
            (Some(group), None, None) if group.repeatable => match value {
                Value::Array(rows) => {
                    self.count(format!("{prefix}{name}"), rows.len());
                    for (i, row) in rows.iter().enumerate() {
                        self.row(group, i, row, prefix);
                    }
                }
                Value::Null => {}
                other => self.insert(format!("{prefix}{key}"), other.clone()),
            },
            // A field, or a key that matches no Item: kept as supplied.
            _ => self.insert(format!("{prefix}{key}"), value.clone()),
        }
    }

    fn row(&mut self, group: &ItemInfo, index: usize, row: &Value, prefix: &str) {
        let row_prefix = format!("{prefix}{}[{index}].", group.key);
        if let Value::Object(map) = row {
            for (k, v) in map {
                self.place(&group.children, k, v, &row_prefix);
            }
        }
    }
}

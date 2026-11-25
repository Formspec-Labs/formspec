//! Response `data` arrives nested (Core: non-repeatable groups are objects, repeatable groups are
//! arrays of row objects); the evaluator works on flat paths. This one walk over the item tree is
//! where the two meet: it flattens and *consumes* groups and repeats, so no group object or row
//! array survives beside its own leaves. [`crate::output_data`] is its inverse.

use std::collections::{HashMap, HashSet};

use fel_core::exact_json::Value;

use crate::types::ItemInfo;

/// One container hop from the Response `data` root to an undeclared property's owning object.
#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub(crate) enum DataStep {
    /// A declared non-repeatable group object key.
    Group(String),
    /// Row `index` of a declared repeatable group array key.
    RepeatRow(String, usize),
}

/// One undeclared Response `data` property captured at its exact arrival scope.
#[derive(Clone, Debug)]
pub(crate) struct UndeclaredEntry {
    /// Declared group/repeat-row hops from Response `data` root to the owning object.
    pub scope: Vec<DataStep>,
    /// Literal property key inside that owning object (never split on `.` or `[`).
    pub key: String,
    /// Instance path reported in `EvaluationResult::undeclared_data_paths`.
    pub path: String,
    /// Unmodified JSON value as supplied.
    pub value: Value,
}

/// Flat evaluation input produced by [`flatten_response_data`].
pub(crate) struct FlatInput {
    /// Leaf values by instance path (`group.field`, `rows[0].name`, `rows[0].addr.flag`).
    pub values: HashMap<String, Value>,
    /// Row count per repeat instance path (`rows`, `rows[0].tasks`) for every array supplied,
    /// so a row with no answered field still counts.
    pub repeat_counts: HashMap<String, u64>,
    /// Undeclared Response `data` properties kept at their exact container scope.
    pub undeclared: Vec<UndeclaredEntry>,
}

/// Flatten non-repeatable group objects and repeat row arrays, following the item tree.
///
/// - A key naming a non-repeatable group whose value is an object, or a repeatable group whose
///   value is an array of row objects, is replaced by its leaves (recursively, rows included).
/// - Field values are never opened: a money `{amount, currency}` or an attachment list stays one
///   value, whatever its shape.
/// - Display items have no Response `data` representation; any saved property sharing a `display`
///   item's key is preserved in `undeclared` rather than dropped.
/// - Flat spellings (`g.a`, `rows[0].name`, `rows[1].addr` holding an object) walk the same way, so
///   nested and flat input produce identical output.
/// - A key that matches no declared field or group is kept in place at its exact `data` scope and
///   listed in `undeclared` (`response.schema.json` allows additional properties).
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
        undeclared: Vec::new(),
        undeclared_keys: HashSet::new(),
        conflicts: Vec::new(),
    };
    let mut scope = Vec::new();
    for (key, value) in data {
        walk.place(items, key, value, "", &mut scope, "");
    }
    if walk.conflicts.is_empty() {
        walk.undeclared.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(FlatInput {
            values: walk.out,
            repeat_counts: walk.counts,
            undeclared: walk.undeclared,
        })
    } else {
        walk.conflicts.sort();
        walk.conflicts.dedup();
        Err(walk.conflicts)
    }
}

struct Walk {
    out: HashMap<String, Value>,
    counts: HashMap<String, u64>,
    undeclared: Vec<UndeclaredEntry>,
    undeclared_keys: HashSet<(Vec<DataStep>, String)>,
    conflicts: Vec<String>,
}

/// `name` and its `[i]` row index, when the segment has one.
fn split_index(segment: &str) -> (&str, Option<usize>) {
    if let Some(open) = segment
        .strip_suffix(']')
        .and_then(|s| s.rfind('[').map(|o| (s, o)))
    {
        let (s, o) = open;
        if let Ok(i) = s[o + 1..].parse::<usize>() {
            return (&s[..o], Some(i));
        }
    }
    (segment, None)
}

impl Walk {
    fn insert_declared(&mut self, path: String, value: Value) {
        if self.out.contains_key(&path) {
            self.conflicts.push(path);
        } else {
            self.out.insert(path, value);
        }
    }

    fn record_undeclared(
        &mut self,
        scope: &[DataStep],
        key: &str,
        data_prefix: &str,
        value: Value,
        expose_in_values: bool,
    ) {
        let path = format!("{data_prefix}{key}");
        let identity = (scope.to_vec(), key.to_string());
        if !self.undeclared_keys.insert(identity) {
            self.conflicts.push(path);
            return;
        }
        if expose_in_values {
            self.out.entry(path.clone()).or_insert_with(|| value.clone());
        }
        self.undeclared.push(UndeclaredEntry {
            scope: scope.to_vec(),
            key: key.to_string(),
            path,
            value,
        });
    }

    fn count(&mut self, path: String, n: usize) {
        let entry = self.counts.entry(path).or_insert(0);
        *entry = (*entry).max(n as u64);
    }

    /// Place `key` (one key, or a flat dotted/indexed path) with `value`.
    ///
    /// `model_prefix` tracks the Definition item path (including scalar parent fields for
    /// dependent items). `data_scope` and `data_prefix` track the Response `data` container
    /// path (excluding scalar parent fields because dependent items share their parent's object).
    fn place(
        &mut self,
        siblings: &[ItemInfo],
        key: &str,
        value: &Value,
        model_prefix: &str,
        data_scope: &mut Vec<DataStep>,
        data_prefix: &str,
    ) {
        let (segment, rest) = match key.split_once('.') {
            Some((head, rest)) => (head, Some(rest)),
            None => (key, None),
        };
        let (name, index) = split_index(segment);

        // Dependent items (fields or groups) share their scalar parent's object in Response data.
        // Restore their declared parent path before evaluation while keeping `data_scope` unchanged.
        let direct_non_display = siblings
            .iter()
            .find(|item| item.key == name && item.item_type != "display");
        if direct_non_display.is_none() {
            for parent in siblings.iter().filter(|item| item.item_type == "field") {
                if has_dependent_key(&parent.children, name) {
                    self.place(
                        &parent.children,
                        key,
                        value,
                        &format!("{model_prefix}{}.", parent.key),
                        data_scope,
                        data_prefix,
                    );
                    return;
                }
            }
        }

        // Flat declared path through a scalar field (e.g. `parent.child` or `parent.sub.s1`):
        // only descend when the next segment names a declared dependent item of that field.
        if let (Some(field), None, Some(rest)) = (direct_non_display, index, rest)
            && field.item_type == "field"
        {
            let next_segment = rest.split_once('.').map_or(rest, |(head, _)| head);
            let (next_name, _) = split_index(next_segment);
            if has_dependent_key(&field.children, next_name) {
                self.place(
                    &field.children,
                    rest,
                    value,
                    &format!("{model_prefix}{}.", field.key),
                    data_scope,
                    data_prefix,
                );
                return;
            }
        }

        // Exact declared field match.
        if let (Some(field), None, None) = (direct_non_display, index, rest)
            && field.item_type == "field"
        {
            self.insert_declared(format!("{model_prefix}{key}"), value.clone());
            return;
        }

        let group_item = direct_non_display.filter(|i| i.item_type == "group");
        match (group_item, index, rest) {
            // `rows[i].rest`: a flat path into row i.
            (Some(group), Some(i), Some(rest)) if group.repeatable => {
                self.count(format!("{model_prefix}{name}"), i + 1);
                let row_model = format!("{model_prefix}{name}[{i}].");
                let row_data = format!("{data_prefix}{name}[{i}].");
                data_scope.push(DataStep::RepeatRow(group.key.clone(), i));
                self.place(&group.children, rest, value, &row_model, data_scope, &row_data);
                data_scope.pop();
            }
            // `group.rest`: a flat path through a non-repeatable group.
            (Some(group), None, Some(rest)) if !group.repeatable => {
                let group_model = format!("{model_prefix}{name}.");
                let group_data = format!("{data_prefix}{name}.");
                data_scope.push(DataStep::Group(group.key.clone()));
                self.place(
                    &group.children,
                    rest,
                    value,
                    &group_model,
                    data_scope,
                    &group_data,
                );
                data_scope.pop();
            }
            // `rows[i]`: one whole row.
            (Some(group), Some(i), None) if group.repeatable => {
                self.count(format!("{model_prefix}{name}"), i + 1);
                self.row(group, i, value, model_prefix, data_scope, data_prefix);
            }
            // `group`: the group's object.
            (Some(group), None, None) if !group.repeatable => {
                if let Value::Object(map) = value {
                    let group_model = format!("{model_prefix}{name}.");
                    let group_data = format!("{data_prefix}{name}.");
                    data_scope.push(DataStep::Group(group.key.clone()));
                    for (k, v) in map {
                        self.place(&group.children, k, v, &group_model, data_scope, &group_data);
                    }
                    data_scope.pop();
                } else {
                    self.insert_declared(format!("{model_prefix}{key}"), value.clone());
                }
            }
            // `rows`: the row array.
            (Some(group), None, None) if group.repeatable => match value {
                Value::Array(rows) => {
                    self.count(format!("{model_prefix}{name}"), rows.len());
                    for (i, row) in rows.iter().enumerate() {
                        self.row(group, i, row, model_prefix, data_scope, data_prefix);
                    }
                }
                Value::Null => {}
                other => self.insert_declared(format!("{model_prefix}{key}"), other.clone()),
            },
            // Key that matches no declared field/group (including keys matching a display item):
            // keep it in place at its exact data scope.
            _ => {
                let shares_display_key =
                    rest.is_none() && index.is_none() && has_display_key(siblings, key);
                self.record_undeclared(
                    data_scope,
                    key,
                    data_prefix,
                    value.clone(),
                    !shares_display_key,
                );
            }
        }
    }

    fn row(
        &mut self,
        group: &ItemInfo,
        index: usize,
        row: &Value,
        model_prefix: &str,
        data_scope: &mut Vec<DataStep>,
        data_prefix: &str,
    ) {
        let row_model = format!("{model_prefix}{}[{index}].", group.key);
        let row_data = format!("{data_prefix}{}[{index}].", group.key);
        if let Value::Object(map) = row {
            data_scope.push(DataStep::RepeatRow(group.key.clone(), index));
            for (k, v) in map {
                self.place(&group.children, k, v, &row_model, data_scope, &row_data);
            }
            data_scope.pop();
        }
    }
}

fn has_dependent_key(items: &[ItemInfo], key: &str) -> bool {
    items.iter().any(|item| {
        (item.item_type != "display" && item.key == key)
            || (item.item_type == "field" && has_dependent_key(&item.children, key))
    })
}

fn has_display_key(items: &[ItemInfo], key: &str) -> bool {
    items.iter().any(|item| {
        (item.item_type == "display" && item.key == key)
            || (item.item_type == "field" && has_display_key(&item.children, key))
    })
}

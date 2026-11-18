//! Bind entries grouped by the Item they target, for document-order merging (Core §4.3.1).

use std::collections::HashMap;

use fel_core::exact_json::JsonTree;
use serde_json::Value;

use crate::path_utils::{Path, PathSegment};

/// One Bind entry: its `path` spelling and its properties.
pub type BindEntry<'a, V = Value> = (&'a str, &'a V);

/// Bind entries by target Item path, each list in document order.
///
/// Core §4.3.3: a `[*]` path targets the Item whose path is the Bind path with every
/// `[*]` removed, so `jobs[*].hours` and `jobs.hours` share one list. Array-style and
/// object-style `binds` are both read; object keys keep document order.
pub struct BindTargets<'a, V = Value> {
    /// `[*]`-stripped Bind path to its entries.
    by_item: HashMap<String, Vec<BindEntry<'a, V>>>,
    by_concrete_item: HashMap<String, Vec<ConcreteBind<'a, V>>>,
}

struct ConcreteBind<'a, V> {
    bind: &'a V,
    /// Position of the group key in the unindexed path and the zero-based row.
    rows: Vec<(usize, usize)>,
}

impl<'a, V: JsonTree> BindTargets<'a, V> {
    /// Group the Definition's `binds` value by target Item path.
    pub fn new(binds: Option<&'a V>) -> Self {
        let entries: Vec<BindEntry<'a, V>> = match binds {
            Some(binds) if binds.as_array().is_some() => binds
                .as_array()
                .unwrap()
                .iter()
                .filter_map(|bind| {
                    let path = bind.get("path")?.as_str()?;
                    bind.is_object().then_some((path, bind))
                })
                .collect(),
            Some(binds) if binds.is_object() => binds
                .members()
                .filter_map(|(path, bind)| bind.is_object().then_some((path.as_str(), bind)))
                .collect(),
            _ => Vec::new(),
        };
        let mut by_item: HashMap<String, Vec<BindEntry<'a, V>>> = HashMap::new();
        for &entry in &entries {
            by_item
                .entry(entry.0.replace("[*]", ""))
                .or_default()
                .push(entry);
        }
        let mut by_concrete_item = HashMap::new();
        if entries.iter().any(|(path, _)| path.contains("@index")) {
            for (path, bind) in entries {
                let Some((keys, rows)) = bind_rows(path) else {
                    continue;
                };
                by_concrete_item
                    .entry(keys)
                    .or_insert_with(Vec::new)
                    .push(ConcreteBind { bind, rows });
            }
            by_concrete_item.retain(|_, binds| binds.iter().any(|bind| !bind.rows.is_empty()));
        }
        Self {
            by_item,
            by_concrete_item,
        }
    }

    /// Entries targeting the Item at `item_path`, in document order.
    pub fn entries(&self, item_path: &str) -> &[BindEntry<'a, V>] {
        self.by_item.get(item_path).map_or(&[], Vec::as_slice)
    }

    /// The effective Bind: properties merged in document order, later values winning.
    pub fn merged(&self, item_path: &str) -> V::Object {
        let mut merged = V::Object::default();
        for (_, bind) in self.entries(item_path) {
            merged.extend(
                bind.members()
                    .map(|(key, value)| (key.clone(), value.clone())),
            );
        }
        merged
    }

    /// The `path` spelling of the entry whose `property` wins for `item_path`.
    pub fn winning_path(&self, item_path: &str, property: &str) -> Option<&'a str> {
        self.entries(item_path)
            .iter()
            .rev()
            .find(|(_, bind)| bind.get(property).is_some())
            .map(|(path, _)| *path)
    }

    /// Merge Binds for an indexed Item when a row-specific Bind applies.
    pub fn merged_concrete(&self, item_path: &str) -> Option<V::Object> {
        if self.by_concrete_item.is_empty() || !item_path.contains('[') {
            return None;
        }
        let (keys, rows) = split_rows(item_path, |part| match part {
            PathSegment::Indexed(index) => Some(index),
            _ => None,
        })?;
        let binds = self.by_concrete_item.get(&keys)?;
        let mut merged = V::Object::default();
        let mut indexed = false;
        for entry in binds
            .iter()
            .filter(|entry| entry.rows.iter().all(|row| rows.contains(row)))
        {
            indexed |= !entry.rows.is_empty();
            merged.extend(
                entry
                    .bind
                    .members()
                    .map(|(key, value)| (key.clone(), value.clone())),
            );
        }
        indexed.then_some(merged)
    }

    /// Whether the Definition has row-specific Binds to apply after row expansion.
    pub fn has_indexed(&self) -> bool {
        !self.by_concrete_item.is_empty()
    }

    /// Whether two calculate Binds can write the same instance of this Item.
    pub fn has_calculate_conflict(&self, item_path: &str) -> bool {
        if let Some(binds) = self.by_concrete_item.get(item_path) {
            let writers: Vec<_> = binds
                .iter()
                .filter(|entry| entry.bind.get("calculate").is_some())
                .collect();
            return writers.iter().enumerate().any(|(i, left)| {
                writers[i + 1..].iter().any(|right| {
                    !left.rows.iter().any(|(part, index)| {
                        right.rows.iter().any(|(other_part, other_index)| {
                            part == other_part && index != other_index
                        })
                    })
                })
            });
        }
        self.entries(item_path)
            .iter()
            .filter(|(_, bind)| bind.get("calculate").is_some())
            .nth(1)
            .is_some()
    }
}

fn bind_rows(path: &str) -> Option<(String, Vec<(usize, usize)>)> {
    split_rows(path, |part| {
        let PathSegment::Special(selector) = part else {
            return None;
        };
        bind_row_index(&selector)
    })
}

/// Translate a Bind selector's one-based `@index = N` into a zero-based row.
pub fn bind_row_index(selector: &str) -> Option<usize> {
    let (name, index) = selector.split_once('=')?;
    if name.trim() != "@index" {
        return None;
    }
    index.trim().parse::<usize>().ok()?.checked_sub(1)
}

fn split_rows(
    path: &str,
    index: impl Fn(PathSegment) -> Option<usize>,
) -> Option<(String, Vec<(usize, usize)>)> {
    let mut keys = Vec::new();
    let mut rows = Vec::new();
    for part in Path::parse(path).segments {
        match part {
            PathSegment::Exact(key) => keys.push(key),
            PathSegment::Wildcard => {}
            _ => rows.push((keys.len().checked_sub(1)?, index(part)?)),
        }
    }
    Some((keys.join("."), rows))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn spellings_merge_in_document_order() {
        let binds = json!([
            { "path": "jobs[*].hours", "required": "true", "relevant": "$on" },
            { "path": "jobs.hours", "required": "false", "precision": 2 },
            { "path": "jobs.rate", "required": "true" }
        ]);
        let targets = BindTargets::new(Some(&binds));
        let merged = targets.merged("jobs.hours");

        assert_eq!(merged["required"], json!("false"));
        assert_eq!(merged["precision"], json!(2));
        assert_eq!(merged["relevant"], json!("$on"));
        assert_eq!(
            targets.winning_path("jobs.hours", "required"),
            Some("jobs.hours")
        );
        assert_eq!(
            targets.winning_path("jobs.hours", "relevant"),
            Some("jobs[*].hours")
        );
        assert_eq!(targets.winning_path("jobs.hours", "calculate"), None);
    }
}

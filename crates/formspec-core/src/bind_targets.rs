//! Bind entries grouped by the Item they target, for document-order merging (Core §4.3.1).

use std::collections::HashMap;

use fel_core::exact_json::JsonTree;
use serde_json::Value;

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
        for entry in entries {
            by_item
                .entry(entry.0.replace("[*]", ""))
                .or_default()
                .push(entry);
        }
        Self { by_item }
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

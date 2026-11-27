//! Host-supplied resolved option lists for remote `optionSets` and URI-string `Item.options`.

use std::collections::{BTreeMap, BTreeSet};

use fel_core::exact_json::Value;
use integrity_canonical::{
    DOMAIN_SEPARATOR_BYTE, DigestAlgorithm, canonical_json_from_bytes, compute_digest,
};
use serde::{Deserialize, Serialize};

/// Domain separator for canonical digests of [`ResolvedOptionLists`] snapshots.
const OPTION_SNAPSHOT_DIGEST_DOMAIN: &str = "formspec.option-snapshot.v1";

/// Host-supplied resolved option lists for remote `optionSets` and URI-string `Item.options`
/// (Core §4.6, §4.2.3).
///
/// Values are stored in deterministic sorted sets (`BTreeMap<String, BTreeSet<String>>`) so a
/// filing host can retain a trusted snapshot alongside evaluation context, compute its canonical
/// digest, and forward the exact same snapshot to every server recheck.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResolvedOptionLists {
    /// Allowed option values keyed by Definition `optionSets` name.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub option_sets: BTreeMap<String, BTreeSet<String>>,
    /// Allowed option values keyed by remote option-list URI (`Item.options` string or
    /// `OptionSet.source`).
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub uris: BTreeMap<String, BTreeSet<String>>,
}

impl ResolvedOptionLists {
    /// Create an empty resolved option list snapshot.
    pub fn new() -> Self {
        Self::default()
    }

    /// Return `true` when neither `option_sets` nor `uris` contains an entry.
    pub fn is_empty(&self) -> bool {
        self.option_sets.is_empty() && self.uris.is_empty()
    }

    /// Insert or replace the allowed values for a named `optionSets` entry (builder form).
    pub fn with_option_set<I, S>(mut self, name: impl Into<String>, values: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.insert_option_set(name, values);
        self
    }

    /// Insert or replace the allowed values for a remote URI (builder form).
    pub fn with_uri<I, S>(mut self, uri: impl Into<String>, values: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.insert_uri(uri, values);
        self
    }

    /// Insert or replace the allowed values for a named `optionSets` entry.
    pub fn insert_option_set<I, S>(&mut self, name: impl Into<String>, values: I)
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.option_sets
            .insert(name.into(), values.into_iter().map(Into::into).collect());
    }

    /// Insert or replace the allowed values for a remote URI.
    pub fn insert_uri<I, S>(&mut self, uri: impl Into<String>, values: I)
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.uris
            .insert(uri.into(), values.into_iter().map(Into::into).collect());
    }

    /// Resolve a URL-backed named `optionSet`, checking `option_sets[name]` first and then
    /// `uris[source_uri]` when a source URI is supplied.
    pub fn resolve_option_set(
        &self,
        name: &str,
        source_uri: Option<&str>,
    ) -> Option<&BTreeSet<String>> {
        self.option_sets
            .get(name)
            .or_else(|| source_uri.and_then(|uri| self.uris.get(uri)))
    }

    /// Resolve a URI-string `Item.options` reference.
    pub fn resolve_uri(&self, uri: &str) -> Option<&BTreeSet<String>> {
        self.uris.get(uri)
    }

    /// Parse a host JSON object `{ optionSets?: Record<string, (string | { value: string })[]>, uris?: ... }`.
    ///
    /// Accepts both `optionSets` and `option_sets` keys for host-language ergonomics.
    ///
    /// # Errors
    ///
    /// Returns an error message when the object or any option list entry has an invalid shape.
    pub fn from_json_value(value: &Value) -> Result<Self, String> {
        let obj = value
            .as_object()
            .ok_or_else(|| "resolvedOptions must be a JSON object".to_string())?;
        for key in obj.keys() {
            if !matches!(key.as_str(), "optionSets" | "option_sets" | "uris") {
                return Err(format!("unknown resolvedOptions key '{key}'"));
            }
        }
        let mut out = Self::new();
        if let Some(sets_val) = obj.get("optionSets").or_else(|| obj.get("option_sets")) {
            let sets = sets_val
                .as_object()
                .ok_or_else(|| "resolvedOptions.optionSets must be a JSON object".to_string())?;
            for (name, list) in sets {
                out.option_sets
                    .insert(name.clone(), parse_option_value_set(list, name)?);
            }
        }
        if let Some(uris_val) = obj.get("uris") {
            let uris = uris_val
                .as_object()
                .ok_or_else(|| "resolvedOptions.uris must be a JSON object".to_string())?;
            for (uri, list) in uris {
                out.uris
                    .insert(uri.clone(), parse_option_value_set(list, uri)?);
            }
        }
        Ok(out)
    }

    /// Compute a canonical domain-framed SHA-256 digest (`sha256:...`) over this snapshot.
    ///
    /// Filing hosts can pin this digest with the evaluation context and verify that every
    /// subsequent recheck receives the exact same option snapshot.
    ///
    /// # Errors
    ///
    /// Returns an error if canonical serialization fails.
    pub fn snapshot_digest(&self) -> Result<String, String> {
        let bytes = serde_json::to_vec(self).map_err(|err| err.to_string())?;
        let canonical = canonical_json_from_bytes(&bytes)?;
        let mut framed =
            Vec::with_capacity(OPTION_SNAPSHOT_DIGEST_DOMAIN.len() + 1 + canonical.len());
        framed.extend_from_slice(OPTION_SNAPSHOT_DIGEST_DOMAIN.as_bytes());
        framed.push(DOMAIN_SEPARATOR_BYTE);
        framed.extend_from_slice(&canonical);
        Ok(format!(
            "sha256:{}",
            compute_digest(&framed, DigestAlgorithm::Sha256)
        ))
    }
}

/// Extract the set of permitted string values from an array of strings or `{ value, ... }` objects.
fn parse_option_value_set(value: &Value, label: &str) -> Result<BTreeSet<String>, String> {
    let entries = value
        .as_array()
        .ok_or_else(|| format!("resolvedOptions entry '{label}' must be an array"))?;
    let mut allowed = BTreeSet::new();
    for (idx, entry) in entries.iter().enumerate() {
        if let Some(s) = entry.as_str() {
            allowed.insert(s.to_owned());
        } else if let Some(v) = entry.get("value").and_then(Value::as_str) {
            allowed.insert(v.to_owned());
        } else {
            return Err(format!(
                "resolvedOptions entry '{label}'[{idx}] must be a string or an object with a string 'value'"
            ));
        }
    }
    Ok(allowed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use fel_core::exact_json::native_json as json;

    #[test]
    fn parses_string_and_option_entry_lists_and_produces_stable_digest() {
        let from_strings = ResolvedOptionLists::from_json_value(&json!({
            "optionSets": { "codes": ["b", "a", "a"] },
            "uris": { "https://example.test/list": ["y", "x"] }
        }))
        .expect("parse strings");
        let from_entries = ResolvedOptionLists::from_json_value(&json!({
            "optionSets": {
                "codes": [
                    { "value": "a", "label": "Alpha" },
                    { "value": "b", "label": "Beta" }
                ]
            },
            "uris": {
                "https://example.test/list": [
                    { "value": "x", "label": "X" },
                    { "value": "y", "label": "Y" }
                ]
            }
        }))
        .expect("parse option entries");

        assert_eq!(from_strings, from_entries);
        let d1 = from_strings.snapshot_digest().expect("digest");
        let d2 = from_entries.snapshot_digest().expect("digest");
        assert_eq!(d1, d2);
        assert!(d1.starts_with("sha256:"));
        assert_eq!(d1.len(), 7 + 64);
    }

    #[test]
    fn rejects_unknown_keys_and_non_string_entries() {
        let err = ResolvedOptionLists::from_json_value(&json!({ "other": {} })).unwrap_err();
        assert!(err.contains("unknown resolvedOptions key"));
        let err = ResolvedOptionLists::from_json_value(&json!({
            "uris": { "https://example.test/list": [123] }
        }))
        .unwrap_err();
        assert!(err.contains("must be a string"));
    }
}

//! `Registry` inherent API and `RegistryLookup` bridge.

use std::collections::HashMap;

use serde_json::Value;

use crate::extension_analysis::{RegistryEntryInfo, RegistryEntryStatus, RegistryLookup};

use super::name::is_valid_extension_name;
use super::parse::{parse_entry, parse_publisher};
use super::types::{ExtensionCategory, Registry, RegistryEntry, RegistryError};
use super::version::{compare_versions, version_satisfies};

impl Registry {
    /// Parse a registry document from a JSON value.
    pub fn from_json(value: &Value) -> Result<Self, RegistryError> {
        let obj = value
            .as_object()
            .ok_or_else(|| RegistryError::InvalidField("root must be an object".into()))?;

        // publisher
        let pub_val = obj
            .get("publisher")
            .ok_or_else(|| RegistryError::MissingField("publisher".into()))?;
        let (publisher, warnings) = parse_publisher(pub_val)?;

        // published
        let published = obj
            .get("published")
            .and_then(|v| v.as_str())
            .ok_or_else(|| RegistryError::MissingField("published".into()))?
            .to_string();

        // entries
        let entries_val = obj
            .get("entries")
            .and_then(|v| v.as_array())
            .ok_or_else(|| RegistryError::MissingField("entries".into()))?;

        let mut entries = Vec::with_capacity(entries_val.len());
        let mut by_name: HashMap<String, Vec<usize>> = HashMap::new();

        for (i, entry_val) in entries_val.iter().enumerate() {
            let entry = parse_entry(entry_val, i)?;
            by_name.entry(entry.name.clone()).or_default().push(i);
            entries.push(entry);
        }

        Ok(Registry {
            publisher,
            published,
            warnings,
            entries,
            by_name,
        })
    }

    /// Find all entries matching `name`, optionally filtered by a version constraint.
    /// Results are sorted by version descending (highest first).
    pub fn find(&self, name: &str, version_constraint: Option<&str>) -> Vec<&RegistryEntry> {
        let Some(indices) = self.by_name.get(name) else {
            return vec![];
        };
        let mut matches: Vec<&RegistryEntry> = indices
            .iter()
            .map(|&i| &self.entries[i])
            .filter(|e| {
                version_constraint
                    .map(|c| version_satisfies(&e.version, c))
                    .unwrap_or(true)
            })
            .collect();
        matches.sort_by(|a, b| compare_versions(&b.version, &a.version));
        matches
    }

    /// Find the highest-version entry matching `name` and optional constraint.
    pub fn find_one(&self, name: &str, version_constraint: Option<&str>) -> Option<&RegistryEntry> {
        self.find(name, version_constraint).into_iter().next()
    }

    /// List all entries in a given category.
    pub fn list_by_category(&self, category: ExtensionCategory) -> Vec<&RegistryEntry> {
        self.entries
            .iter()
            .filter(|e| e.category == category)
            .collect()
    }

    /// List all entries with a given lifecycle status.
    pub fn list_by_status(&self, status: RegistryEntryStatus) -> Vec<&RegistryEntry> {
        self.entries.iter().filter(|e| e.status == status).collect()
    }

    /// Validate registry entries against structural rules.
    /// Returns a list of human-readable validation messages.
    pub fn validate(&self) -> Vec<String> {
        let mut messages = Vec::new();

        for (i, entry) in self.entries.iter().enumerate() {
            if !is_valid_extension_name(&entry.name) {
                messages.push(format!(
                    "entry[{i}]: name '{}' does not match x-prefixed pattern",
                    entry.name
                ));
            }

            if entry.status == RegistryEntryStatus::Deprecated && entry.deprecation_notice.is_none()
            {
                messages.push(format!(
                    "entry[{i}]: deprecated entry '{}' missing deprecationNotice",
                    entry.name
                ));
            }

            if entry.category == ExtensionCategory::DataType && entry.base_type.is_none() {
                messages.push(format!(
                    "entry[{i}]: dataType entry '{}' missing baseType",
                    entry.name
                ));
            }

            if entry.category == ExtensionCategory::Function {
                if entry.parameters.is_none() {
                    messages.push(format!(
                        "entry[{i}]: function entry '{}' missing parameters",
                        entry.name
                    ));
                }
                if entry.returns.is_none() {
                    messages.push(format!(
                        "entry[{i}]: function entry '{}' missing returns",
                        entry.name
                    ));
                }
            }

            if entry.category == ExtensionCategory::Constraint && entry.parameters.is_none() {
                messages.push(format!(
                    "entry[{i}]: constraint entry '{}' missing parameters",
                    entry.name
                ));
            }
        }

        messages
    }
}

impl RegistryLookup for Registry {
    fn lookup(&self, extension_name: &str) -> Option<RegistryEntryInfo> {
        let entry = self.find_one(extension_name, None)?;
        // Extract displayName from the entry description as a fallback;
        // real registries would carry metadata.displayName but that's not
        // modeled in RegistryEntry — use the name itself.
        Some(RegistryEntryInfo {
            name: entry.name.clone(),
            status: entry.status,
            display_name: Some(entry.description.clone()),
            deprecation_notice: entry.deprecation_notice.clone(),
        })
    }
}

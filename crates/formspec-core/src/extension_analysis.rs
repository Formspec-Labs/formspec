//! Validates extension usage in item trees against a registry catalog.
//!
//! Checks for unresolved, retired, and deprecated extensions on definition items.
//!
//! `walk_items` recurses the [`ExtensionItem`] tree; [`JsonDefinitionItem`] is the JSON-backed adapter.
#![allow(clippy::missing_docs_in_private_items)]

use std::collections::HashMap;

use serde_json::Value;

use crate::registry_client;

// ── Types ───────────────────────────────────────────────────────

/// Severity levels for extension validation issues.
#[allow(missing_docs)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExtensionSeverity {
    Error,
    Warning,
    Info,
}

impl ExtensionSeverity {
    /// Wire string for JSON output (`error` / `warning` / `info`).
    pub fn as_wire_str(self) -> &'static str {
        match self {
            Self::Error => "error",
            Self::Warning => "warning",
            Self::Info => "info",
        }
    }
}

/// Error codes for extension validation.
#[allow(missing_docs)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExtensionErrorCode {
    UnresolvedExtension,
    ExtensionRetired,
    ExtensionDeprecated,
}

impl ExtensionErrorCode {
    /// Uppercase wire token for JSON (`UNRESOLVED_EXTENSION`, etc.).
    pub fn as_wire_str(self) -> &'static str {
        match self {
            Self::UnresolvedExtension => "UNRESOLVED_EXTENSION",
            Self::ExtensionRetired => "EXTENSION_RETIRED",
            Self::ExtensionDeprecated => "EXTENSION_DEPRECATED",
        }
    }
}

/// A single extension usage validation issue.
#[derive(Debug, Clone)]
pub struct ExtensionUsageIssue {
    /// Dotted path to the item declaring the extension.
    pub path: String,
    /// The extension name (e.g., "x-formspec-url").
    pub extension: String,
    /// Severity level.
    pub severity: ExtensionSeverity,
    /// Error code for programmatic handling.
    pub code: ExtensionErrorCode,
    /// Human-readable message.
    pub message: String,
}

/// Lifecycle status of a registry entry.
#[allow(missing_docs)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RegistryEntryStatus {
    Draft,
    Active,
    Deprecated,
    Retired,
}

/// Minimal registry entry info needed for extension validation.
#[derive(Debug, Clone)]
pub struct RegistryEntryInfo {
    /// Extension name (e.g. `x-formspec-url`).
    pub name: String,
    /// Lifecycle state from the registry document.
    pub status: RegistryEntryStatus,
    /// Optional human-readable title from the registry.
    pub display_name: Option<String>,
    /// Optional deprecation message when status is deprecated.
    pub deprecation_notice: Option<String>,
}

/// Callback trait for looking up registry entries.
pub trait RegistryLookup {
    /// Return registry metadata for `extension_name`, or `None` if unknown.
    fn lookup(&self, extension_name: &str) -> Option<RegistryEntryInfo>;
}

/// Simple HashMap-based registry for testing.
pub struct MapRegistry {
    entries: HashMap<String, RegistryEntryInfo>,
}

impl MapRegistry {
    /// Empty registry.
    pub fn new() -> Self {
        Self {
            entries: HashMap::new(),
        }
    }

    /// Insert or replace an entry keyed by [`RegistryEntryInfo::name`].
    pub fn add(&mut self, entry: RegistryEntryInfo) {
        self.entries.insert(entry.name.clone(), entry);
    }
}

impl Default for MapRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl RegistryLookup for MapRegistry {
    fn lookup(&self, extension_name: &str) -> Option<RegistryEntryInfo> {
        self.entries.get(extension_name).cloned()
    }
}

// ── Item abstraction ────────────────────────────────────────────

/// Minimal item interface for extension validation.
pub trait ExtensionItem {
    /// The item's key.
    fn key(&self) -> &str;
    /// Extensions declared on this item (extension name → enabled).
    fn declared_extensions(&self) -> Vec<String>;
    /// Child items.
    fn children(&self) -> &[Self]
    where
        Self: Sized;
}

// ── Validation ──────────────────────────────────────────────────

/// Validate extension usage in an item tree against a registry.
pub fn validate_extension_usage<I: ExtensionItem>(
    items: &[I],
    registry: &dyn RegistryLookup,
) -> Vec<ExtensionUsageIssue> {
    let mut issues = Vec::new();
    walk_items(items, "", registry, &mut issues);
    issues
}

fn walk_items<I: ExtensionItem>(
    items: &[I],
    prefix: &str,
    registry: &dyn RegistryLookup,
    issues: &mut Vec<ExtensionUsageIssue>,
) {
    for item in items {
        let path = if prefix.is_empty() {
            item.key().to_string()
        } else {
            format!("{}.{}", prefix, item.key())
        };

        for ext_name in item.declared_extensions() {
            match registry.lookup(&ext_name) {
                None => {
                    issues.push(ExtensionUsageIssue {
                        path: path.clone(),
                        extension: ext_name.clone(),
                        severity: ExtensionSeverity::Error,
                        code: ExtensionErrorCode::UnresolvedExtension,
                        message: format!("Unresolved extension: {ext_name}"),
                    });
                }
                Some(entry) => {
                    match entry.status {
                        RegistryEntryStatus::Retired => {
                            issues.push(ExtensionUsageIssue {
                                path: path.clone(),
                                extension: ext_name.clone(),
                                severity: ExtensionSeverity::Warning,
                                code: ExtensionErrorCode::ExtensionRetired,
                                message: format!(
                                    "Extension retired: {}",
                                    entry.display_name.as_deref().unwrap_or(&ext_name)
                                ),
                            });
                        }
                        RegistryEntryStatus::Deprecated => {
                            let notice =
                                entry.deprecation_notice.as_deref().unwrap_or("deprecated");
                            issues.push(ExtensionUsageIssue {
                                path: path.clone(),
                                extension: ext_name.clone(),
                                severity: ExtensionSeverity::Info,
                                code: ExtensionErrorCode::ExtensionDeprecated,
                                message: format!(
                                    "Extension deprecated: {} — {notice}",
                                    entry.display_name.as_deref().unwrap_or(&ext_name)
                                ),
                            });
                        }
                        RegistryEntryStatus::Active | RegistryEntryStatus::Draft => {
                            // OK — no issue
                        }
                    }
                }
            }
        }

        walk_items(item.children(), &path, registry, issues);
    }
}

// ── JSON item tree + registry map (shared by WASM / Python bindings) ─

/// Definition item node parsed from JSON (`key`, `children`, `extensions`, top-level `x-*` flags).
#[derive(Debug)]
pub struct JsonDefinitionItem {
    key: String,
    children: Vec<JsonDefinitionItem>,
    extensions: Option<HashMap<String, Value>>,
    extra: HashMap<String, Value>,
}

impl JsonDefinitionItem {
    /// Parse a single item object; returns `None` if `key` is missing or not a string.
    pub fn from_json(value: &Value) -> Option<Self> {
        let obj = value.as_object()?;
        let key = obj.get("key")?.as_str()?.to_string();
        let children = obj
            .get("children")
            .and_then(|child| child.as_array())
            .map(|arr| arr.iter().filter_map(Self::from_json).collect())
            .unwrap_or_default();
        let extensions = obj
            .get("extensions")
            .and_then(|extensions| extensions.as_object())
            .map(|map| map.iter().map(|(k, v)| (k.clone(), v.clone())).collect());
        let extra = obj
            .iter()
            .filter(|(name, _)| *name != "key" && *name != "children" && *name != "extensions")
            .map(|(name, value)| (name.clone(), value.clone()))
            .collect();
        Some(Self {
            key,
            children,
            extensions,
            extra,
        })
    }

    /// Parse a root items array (definition `items` tree).
    pub fn tree_from_items_json(items: &[Value]) -> Vec<JsonDefinitionItem> {
        items.iter().filter_map(Self::from_json).collect()
    }
}

/// Parse a JSON value as a root `items` array for extension validation.
pub fn json_definition_items_tree_from_value(
    val: &Value,
) -> Result<Vec<JsonDefinitionItem>, String> {
    let arr = val
        .as_array()
        .ok_or_else(|| "items JSON must be an array".to_string())?;
    Ok(JsonDefinitionItem::tree_from_items_json(arr))
}

impl ExtensionItem for JsonDefinitionItem {
    fn key(&self) -> &str {
        &self.key
    }

    fn declared_extensions(&self) -> Vec<String> {
        let mut found = Vec::new();
        for (name, value) in &self.extra {
            // Item.x-generation is canonical Generation provenance, not a registry extension.
            // The separate `extensions` declaration channel still requires registry resolution.
            if name == "x-generation" {
                continue;
            }
            if !name.starts_with("x-") {
                continue;
            }
            if value.is_null() || value == &Value::Bool(false) {
                continue;
            }
            found.push(name.clone());
        }
        if let Some(extensions) = &self.extensions {
            for (name, enabled) in extensions {
                if !name.starts_with("x-") {
                    continue;
                }
                if enabled.is_null() || enabled == &Value::Bool(false) {
                    continue;
                }
                found.push(name.clone());
            }
        }
        found.sort();
        found.dedup();
        found
    }

    fn children(&self) -> &[Self] {
        &self.children
    }
}

/// Build a [`MapRegistry`] from a JSON object mapping extension name → partial entry objects
/// (`status`, `displayName`, `deprecationNotice`, …) as produced by WASM callers.
pub fn map_registry_from_extension_entry_map(entries: &HashMap<String, Value>) -> MapRegistry {
    let mut registry = MapRegistry::new();
    for (name, entry) in entries {
        let status = entry
            .get("status")
            .and_then(|value| value.as_str())
            .and_then(registry_client::parse_registry_entry_status)
            .unwrap_or(RegistryEntryStatus::Active);
        registry.add(RegistryEntryInfo {
            name: name.clone(),
            status,
            display_name: entry
                .get("displayName")
                .and_then(|value| value.as_str())
                .map(String::from),
            deprecation_notice: entry
                .get("deprecationNotice")
                .and_then(|value| value.as_str())
                .map(String::from),
        });
    }
    registry
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;

    struct TestItem {
        key: String,
        extensions: Vec<String>,
        kids: Vec<TestItem>,
    }

    impl ExtensionItem for TestItem {
        fn key(&self) -> &str {
            &self.key
        }
        fn declared_extensions(&self) -> Vec<String> {
            self.extensions.clone()
        }
        fn children(&self) -> &[TestItem] {
            &self.kids
        }
    }

    fn make_registry() -> MapRegistry {
        let mut reg = MapRegistry::new();
        reg.add(RegistryEntryInfo {
            name: "x-formspec-url".to_string(),
            status: RegistryEntryStatus::Active,
            display_name: Some("URL Validation".to_string()),
            deprecation_notice: None,
        });
        reg.add(RegistryEntryInfo {
            name: "x-formspec-old".to_string(),
            status: RegistryEntryStatus::Deprecated,
            display_name: Some("Old Extension".to_string()),
            deprecation_notice: Some("Use x-formspec-new instead".to_string()),
        });
        reg.add(RegistryEntryInfo {
            name: "x-formspec-retired".to_string(),
            status: RegistryEntryStatus::Retired,
            display_name: Some("Retired Ext".to_string()),
            deprecation_notice: None,
        });
        reg
    }

    #[test]
    fn canonical_item_generation_is_preserved_without_registry_diagnostics() {
        let generation = serde_json::json!({
            "generatedBy": "test-author",
            "anchors": ["need:review-provenance@1"]
        });
        let input = serde_json::json!([
            {"key": "group", "type": "group", "x-generation": generation,
             "children": [
                {"key": "field", "type": "field", "dataType": "string",
                 "x-generation": generation},
                {"key": "display", "type": "display", "x-generation": generation}
             ]}
        ]);
        let original = input.clone();
        let items = json_definition_items_tree_from_value(&input).expect("valid Item tree");

        assert!(validate_extension_usage(&items, &MapRegistry::new()).is_empty());
        assert_eq!(items[0].extra["x-generation"], generation);
        for child in &items[0].children {
            assert_eq!(child.extra["x-generation"], generation);
        }
        assert_eq!(input, original);
    }

    #[test]
    fn provenance_exception_keeps_nested_and_unknown_extension_refusals() {
        let input = serde_json::json!([
            {"key": "group", "type": "group", "x-generation": {},
             "x-generation-extra": true, "x-disabled": false,
             "extensions": {"x-generation": true, "x-disabled": false},
             "children": [{"key": "child", "type": "field", "dataType": "string",
                           "x-generation": {}, "x-custom": true}]}
        ]);
        let items = json_definition_items_tree_from_value(&input).expect("valid Item tree");
        let issues = validate_extension_usage(&items, &MapRegistry::new());

        assert_eq!(issues.len(), 3);
        assert_eq!(issues[0].path, "group");
        assert_eq!(issues[0].extension, "x-generation");
        assert_eq!(issues[1].extension, "x-generation-extra");
        assert_eq!(issues[2].path, "group.child");
        assert_eq!(issues[2].extension, "x-custom");
        assert!(
            issues
                .iter()
                .all(|issue| issue.code == ExtensionErrorCode::UnresolvedExtension)
        );
    }

    #[test]
    fn canonical_provenance_keeps_registered_extension_lifecycle_checks() {
        let input = serde_json::json!([
            {"key": "field", "type": "field", "dataType": "string", "x-generation": {},
             "extensions": {"x-formspec-url": true, "x-formspec-old": true,
                            "x-formspec-retired": true}}
        ]);
        let items = json_definition_items_tree_from_value(&input).expect("valid Item tree");
        let issues = validate_extension_usage(&items, &make_registry());

        assert_eq!(issues.len(), 2);
        assert_eq!(issues[0].code, ExtensionErrorCode::ExtensionDeprecated);
        assert_eq!(issues[1].code, ExtensionErrorCode::ExtensionRetired);
    }

    #[test]
    fn test_active_extension_passes() {
        let registry = make_registry();
        let items = vec![TestItem {
            key: "email".to_string(),
            extensions: vec!["x-formspec-url".to_string()],
            kids: vec![],
        }];
        let issues = validate_extension_usage(&items, &registry);
        assert!(issues.is_empty());
    }

    #[test]
    fn test_unresolved_extension() {
        let registry = make_registry();
        let items = vec![TestItem {
            key: "field".to_string(),
            extensions: vec!["x-unknown".to_string()],
            kids: vec![],
        }];
        let issues = validate_extension_usage(&items, &registry);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].code, ExtensionErrorCode::UnresolvedExtension);
        assert_eq!(issues[0].severity, ExtensionSeverity::Error);
    }

    #[test]
    fn test_deprecated_extension() {
        let registry = make_registry();
        let items = vec![TestItem {
            key: "field".to_string(),
            extensions: vec!["x-formspec-old".to_string()],
            kids: vec![],
        }];
        let issues = validate_extension_usage(&items, &registry);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].code, ExtensionErrorCode::ExtensionDeprecated);
        assert_eq!(issues[0].severity, ExtensionSeverity::Info);
        assert!(issues[0].message.contains("Use x-formspec-new instead"));
    }

    #[test]
    fn test_retired_extension() {
        let registry = make_registry();
        let items = vec![TestItem {
            key: "field".to_string(),
            extensions: vec!["x-formspec-retired".to_string()],
            kids: vec![],
        }];
        let issues = validate_extension_usage(&items, &registry);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].code, ExtensionErrorCode::ExtensionRetired);
        assert_eq!(issues[0].severity, ExtensionSeverity::Warning);
    }

    #[test]
    fn test_nested_items() {
        let registry = make_registry();
        let items = vec![TestItem {
            key: "group".to_string(),
            extensions: vec![],
            kids: vec![TestItem {
                key: "child".to_string(),
                extensions: vec!["x-missing".to_string()],
                kids: vec![],
            }],
        }];
        let issues = validate_extension_usage(&items, &registry);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].path, "group.child");
    }

    #[test]
    fn test_multiple_issues() {
        let registry = make_registry();
        let items = vec![TestItem {
            key: "field".to_string(),
            extensions: vec!["x-unknown".to_string(), "x-formspec-old".to_string()],
            kids: vec![],
        }];
        let issues = validate_extension_usage(&items, &registry);
        assert_eq!(issues.len(), 2);
    }

    // ── Draft status passes clean — extension-registry.md §3.1 ──

    /// Spec: extension-registry.md §3.1 — "Draft status passes clean (no issue emitted)"
    #[test]
    fn draft_extension_passes_clean() {
        let mut registry = MapRegistry::new();
        registry.add(RegistryEntryInfo {
            name: "x-formspec-draft".to_string(),
            status: RegistryEntryStatus::Draft,
            display_name: Some("Draft Extension".to_string()),
            deprecation_notice: None,
        });
        let items = vec![TestItem {
            key: "field".to_string(),
            extensions: vec!["x-formspec-draft".to_string()],
            kids: vec![],
        }];
        let issues = validate_extension_usage(&items, &registry);
        assert!(
            issues.is_empty(),
            "Draft extension should not produce issues"
        );
    }

    // ── Empty item tree — extension-registry.md §4 ──────────────

    /// Spec: extension-registry.md §4 — "Empty item tree produces no issues"
    #[test]
    fn empty_item_tree() {
        let registry = make_registry();
        let items: Vec<TestItem> = vec![];
        let issues = validate_extension_usage(&items, &registry);
        assert!(issues.is_empty());
    }

    // ── display_name being None in messages — extension-registry.md §3.2 ─

    /// Spec: extension-registry.md §3.2 — "Retired extension with None display_name uses extension name"
    #[test]
    fn retired_extension_none_display_name_uses_ext_name() {
        let mut registry = MapRegistry::new();
        registry.add(RegistryEntryInfo {
            name: "x-formspec-gone".to_string(),
            status: RegistryEntryStatus::Retired,
            display_name: None,
            deprecation_notice: None,
        });
        let items = vec![TestItem {
            key: "field".to_string(),
            extensions: vec!["x-formspec-gone".to_string()],
            kids: vec![],
        }];
        let issues = validate_extension_usage(&items, &registry);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].code, ExtensionErrorCode::ExtensionRetired);
        // When display_name is None, the message should use the extension name
        assert!(
            issues[0].message.contains("x-formspec-gone"),
            "msg: {}",
            issues[0].message
        );
    }

    /// Spec: extension-registry.md §3.2 — "Deprecated extension with None display_name uses extension name"
    #[test]
    fn deprecated_extension_none_display_name_uses_ext_name() {
        let mut registry = MapRegistry::new();
        registry.add(RegistryEntryInfo {
            name: "x-formspec-legacy".to_string(),
            status: RegistryEntryStatus::Deprecated,
            display_name: None,
            deprecation_notice: Some("Use x-formspec-new".to_string()),
        });
        let items = vec![TestItem {
            key: "field".to_string(),
            extensions: vec!["x-formspec-legacy".to_string()],
            kids: vec![],
        }];
        let issues = validate_extension_usage(&items, &registry);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].code, ExtensionErrorCode::ExtensionDeprecated);
        assert!(
            issues[0].message.contains("x-formspec-legacy"),
            "msg: {}",
            issues[0].message
        );
    }

    /// Spec: extension-registry.md §3.2 — "Deprecated without notice uses 'deprecated' fallback"
    #[test]
    fn deprecated_extension_no_notice_uses_fallback() {
        let mut registry = MapRegistry::new();
        registry.add(RegistryEntryInfo {
            name: "x-formspec-old2".to_string(),
            status: RegistryEntryStatus::Deprecated,
            display_name: Some("Old Extension 2".to_string()),
            deprecation_notice: None,
        });
        let items = vec![TestItem {
            key: "field".to_string(),
            extensions: vec!["x-formspec-old2".to_string()],
            kids: vec![],
        }];
        let issues = validate_extension_usage(&items, &registry);
        assert_eq!(issues.len(), 1);
        assert!(
            issues[0].message.contains("deprecated"),
            "msg: {}",
            issues[0].message
        );
    }
}

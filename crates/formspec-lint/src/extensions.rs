//! Pass 3b: Extension validation (E600/E601/E602).
//!
//! Validates extension declarations on definition items against loaded registry
//! documents. Builds a [`MapRegistry`] from raw JSON registry documents, then
//! walks the item tree emitting diagnostics for unresolved, retired, or
//! deprecated extensions.
//!
//! ## Diagnostic paths (key-based vs index-based)
//!
//! Item locations use the shared `formspec_core::visit_definition_items_from_document` walker
//! (same skip rules as other lint passes) plus
//! `formspec_core::extension_item_diagnostic_path_from_dotted` to format **semantic** prefixes
//! (`$.items[key=foo]`, `$.items[key=foo].bar`). Those strings are **not** interchangeable with the
//! index-based `json_path` values on `formspec_core::DefinitionItemVisitCtx` (for example
//! `$.items\[0\]`). Key-based
//! prefixes stay stable when sibling order changes. Switching extension diagnostics to indexed JSON
//! paths would be a **user-visible** behavior change, not a refactor.
//!
//! ## Spec cross-references (`specs/*.llm.md`)
//!
//! - `specs/registry/extension-registry.llm.md` — registry entry lifecycle, compatibility, and
//!   **UNRESOLVED_EXTENSION** when an enabled item extension has no registry match; item-level
//!   `extensions` use `x-` property names.
//! - `specs/core/spec.llm.md` — **§3 Item** (`key` identifies nodes in the structural tree); binds
//!   and instance data use the same dot-separated key paths. Key-based diagnostic paths here follow
//!   that **semantic** naming surface; indexed `$.items\[n\]` paths follow JSON array order instead
//!   (see `formspec_core::visit_definition_items_json`).
//! - `specs/core/definition-spec.llm.md` — items declare structure with stable keys as the primary
//!   binding surface across tiers.
//!
//! ## Code naming convention
//!
//! The E-prefix on E600/E601/E602 stands for "Extensions pass" following the
//! pass-numbering convention (E100=pass1, E200=pass2, E600=pass3b), NOT the
//! severity. Actual severities:
//! - **E600**: Error — extension not found in any registry
//! - **E601**: Warning — extension found but retired
//! - **E602**: Info — extension found but deprecated
//!
//! Registry construction and item walks beyond [`check_extensions`] are internal.
#![allow(clippy::missing_docs_in_private_items)]

use serde_json::Value;

use formspec_core::extension_analysis::{
    MapRegistry, RegistryEntryInfo, RegistryEntryStatus, RegistryLookup,
};
use formspec_core::{
    extension_item_diagnostic_path_from_dotted, visit_definition_items_from_document,
};

use crate::types::LintDiagnostic;

const PASS: u8 = 3;

// ── Registry construction ──────────────────────────────────────

/// Build a [`MapRegistry`] from raw JSON registry documents.
///
/// Each document is expected to have an `entries` array of objects with at
/// least `name` and `status` fields.  Optional: `metadata.displayName`,
/// `deprecationNotice`.
fn build_registry(registry_documents: &[Value]) -> MapRegistry {
    let mut registry = MapRegistry::new();
    for doc in registry_documents {
        let entries = match doc.get("entries").and_then(|v| v.as_array()) {
            Some(arr) => arr,
            None => continue,
        };
        for entry in entries {
            let name = match entry.get("name").and_then(|v| v.as_str()) {
                Some(n) => n,
                None => continue,
            };
            let status = match entry.get("status").and_then(|v| v.as_str()) {
                Some("draft") => RegistryEntryStatus::Draft,
                Some("stable" | "active") => RegistryEntryStatus::Active,
                Some("deprecated") => RegistryEntryStatus::Deprecated,
                Some("retired") => RegistryEntryStatus::Retired,
                _ => continue,
            };
            let display_name = entry
                .get("metadata")
                .and_then(|m| m.get("displayName"))
                .and_then(|v| v.as_str())
                .map(String::from);
            let deprecation_notice = entry
                .get("deprecationNotice")
                .and_then(|v| v.as_str())
                .map(String::from);

            registry.add(RegistryEntryInfo {
                name: name.to_string(),
                status,
                display_name,
                deprecation_notice,
            });
        }
    }
    registry
}

// ── Extension checking ─────────────────────────────────────────

/// Returns `true` when the extension value counts as enabled.
///
/// Enabled means `true` or a config object (`{...}`).
/// `false`, `null`, or any other scalar is disabled.
fn is_extension_enabled(value: &Value) -> bool {
    value.as_bool().unwrap_or(false) || value.is_object()
}

/// Check extensions on a single item's `extensions` object, emitting
/// diagnostics into `out`.
fn check_extensions_object(
    extensions: &serde_json::Map<String, Value>,
    path: &str,
    registry: &dyn RegistryLookup,
    out: &mut Vec<LintDiagnostic>,
) {
    for (ext_name, ext_value) in extensions {
        if !is_extension_enabled(ext_value) {
            continue;
        }
        let ext_path = format!("{path}.extensions.{ext_name}");
        match registry.lookup(ext_name) {
            None => {
                out.push(crate::metadata::with_metadata(LintDiagnostic::error(
                    crate::LintCode::E600,
                    PASS,
                    &ext_path,
                    format!("Unresolved extension: {ext_name}"),
                )));
            }
            Some(info) => match info.status {
                RegistryEntryStatus::Retired => {
                    let label = info.display_name.as_deref().unwrap_or(ext_name.as_str());
                    out.push(crate::metadata::with_metadata(LintDiagnostic::warning(
                        crate::LintCode::E601,
                        PASS,
                        &ext_path,
                        format!("Extension retired: {label}"),
                    )));
                }
                RegistryEntryStatus::Deprecated => {
                    let label = info.display_name.as_deref().unwrap_or(ext_name.as_str());
                    let notice = info.deprecation_notice.as_deref().unwrap_or("deprecated");
                    out.push(crate::metadata::with_metadata(LintDiagnostic::info(
                        crate::LintCode::E602,
                        PASS,
                        &ext_path,
                        format!("Extension deprecated: {label} — {notice}"),
                    )));
                }
                RegistryEntryStatus::Active | RegistryEntryStatus::Draft => {}
            },
        }
    }
}

// ── Public API ─────────────────────────────────────────────────

/// Collect all enabled extensions from the item tree.
/// Returns `(JSONPath, extension_name)` for each extension with a truthy value.
fn collect_all_enabled_extensions(document: &Value) -> Vec<(String, String)> {
    let mut result = Vec::new();
    visit_definition_items_from_document(document, &mut |ctx| {
        let path = extension_item_diagnostic_path_from_dotted(&ctx.dotted_path);
        if let Some(extensions) = ctx.item.get("extensions").and_then(|v| v.as_object()) {
            for (ext_name, ext_value) in extensions {
                if is_extension_enabled(ext_value) {
                    result.push((format!("{path}.extensions.{ext_name}"), ext_name.clone()));
                }
            }
        }
    });
    result
}

/// Validate extension declarations in a definition document against registry
/// documents.
///
/// Returns diagnostics for:
/// - **E600** (Error) — extension not found in any registry
/// - **E601** (Warning) — extension found but retired
/// - **E602** (Info) — extension found but deprecated
///
/// When no registries are loaded, every enabled extension is unresolved (E600).
pub fn check_extensions(document: &Value, registry_documents: &[Value]) -> Vec<LintDiagnostic> {
    if registry_documents.is_empty() {
        // No registries → every enabled extension is unresolved
        return collect_all_enabled_extensions(document)
            .into_iter()
            .map(|(path, name)| {
                crate::metadata::with_metadata(LintDiagnostic::error(
                    crate::LintCode::E600,
                    PASS,
                    &path,
                    format!("Unresolved extension: {name}"),
                ))
            })
            .collect();
    }

    let registry = build_registry(registry_documents);

    let mut diagnostics = Vec::new();
    visit_definition_items_from_document(document, &mut |ctx| {
        let path = extension_item_diagnostic_path_from_dotted(&ctx.dotted_path);
        if let Some(extensions) = ctx.item.get("extensions").and_then(|v| v.as_object()) {
            check_extensions_object(extensions, &path, &registry, &mut diagnostics);
        }
    });
    diagnostics
}

// ── Tests ──────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;
    use serde_json::json;

    fn registry_with_entries(entries: Value) -> Value {
        json!({ "entries": entries })
    }

    fn active_entry(name: &str) -> Value {
        json!({
            "name": name,
            "status": "stable",
            "metadata": { "displayName": name }
        })
    }

    fn retired_entry(name: &str, display_name: &str) -> Value {
        json!({
            "name": name,
            "status": "retired",
            "metadata": { "displayName": display_name }
        })
    }

    fn deprecated_entry(name: &str, display_name: &str, notice: &str) -> Value {
        json!({
            "name": name,
            "status": "deprecated",
            "metadata": { "displayName": display_name },
            "deprecationNotice": notice
        })
    }

    fn def_with_items(items: Value) -> Value {
        json!({
            "$formspec": "1.0",
            "items": items
        })
    }

    // 1. Unresolved extension → E600
    #[test]
    fn unresolved_extension_emits_e600() {
        let doc = def_with_items(json!([
            { "key": "field", "extensions": { "x-unknown": true } }
        ]));
        let reg = registry_with_entries(json!([]));
        let diags = check_extensions(&doc, &[reg]);

        assert_eq!(diags.len(), 1);
        assert_eq!(diags[0].code, "E600");
        assert_eq!(diags[0].severity, crate::types::LintSeverity::Error);
        assert!(diags[0].message.contains("x-unknown"));
    }

    // 2. Active extension → no diagnostic
    #[test]
    fn active_extension_produces_no_diagnostic() {
        let doc = def_with_items(json!([
            { "key": "email", "extensions": { "x-formspec-email": true } }
        ]));
        let reg = registry_with_entries(json!([active_entry("x-formspec-email")]));
        let diags = check_extensions(&doc, &[reg]);

        assert!(diags.is_empty());
    }

    // 3. Retired extension → E601 (Warning)
    #[test]
    fn retired_extension_emits_e601_warning() {
        let doc = def_with_items(json!([
            { "key": "field", "extensions": { "x-old": true } }
        ]));
        let reg = registry_with_entries(json!([retired_entry("x-old", "Old Extension")]));
        let diags = check_extensions(&doc, &[reg]);

        assert_eq!(diags.len(), 1);
        assert_eq!(diags[0].code, "E601");
        assert_eq!(diags[0].severity, crate::types::LintSeverity::Warning);
        assert!(diags[0].message.contains("Old Extension"));
    }

    // 4. Deprecated extension → E602 (Info)
    #[test]
    fn deprecated_extension_emits_e602_info() {
        let doc = def_with_items(json!([
            { "key": "field", "extensions": { "x-legacy": true } }
        ]));
        let reg = registry_with_entries(json!([deprecated_entry(
            "x-legacy",
            "Legacy Ext",
            "Use x-new instead"
        )]));
        let diags = check_extensions(&doc, &[reg]);

        assert_eq!(diags.len(), 1);
        assert_eq!(diags[0].code, "E602");
        assert_eq!(diags[0].severity, crate::types::LintSeverity::Info);
        assert!(diags[0].message.contains("Legacy Ext"));
        assert!(diags[0].message.contains("Use x-new instead"));
    }

    // 5. Multiple registries — extension found in second registry
    #[test]
    fn extension_resolved_from_second_registry() {
        let doc = def_with_items(json!([
            { "key": "field", "extensions": { "x-ext-b": true } }
        ]));
        let reg1 = registry_with_entries(json!([active_entry("x-ext-a")]));
        let reg2 = registry_with_entries(json!([active_entry("x-ext-b")]));
        let diags = check_extensions(&doc, &[reg1, reg2]);

        assert!(diags.is_empty());
    }

    // 6. Disabled extension (value=false) — not checked
    #[test]
    fn disabled_extension_not_checked() {
        let doc = def_with_items(json!([
            { "key": "field", "extensions": { "x-unknown": false } }
        ]));
        let reg = registry_with_entries(json!([]));
        let diags = check_extensions(&doc, &[reg]);

        assert!(diags.is_empty());
    }

    // 7. Extension config object (value={...}) — checked as enabled
    #[test]
    fn extension_config_object_treated_as_enabled() {
        let doc = def_with_items(json!([
            { "key": "field", "extensions": { "x-unknown": { "option": "value" } } }
        ]));
        let reg = registry_with_entries(json!([]));
        let diags = check_extensions(&doc, &[reg]);

        assert_eq!(diags.len(), 1);
        assert_eq!(diags[0].code, "E600");
    }

    // 8. Nested items — correct path in diagnostic
    #[test]
    fn nested_item_has_correct_path() {
        let doc = def_with_items(json!([
            {
                "key": "group",
                "children": [
                    { "key": "child", "extensions": { "x-missing": true } }
                ]
            }
        ]));
        let reg = registry_with_entries(json!([]));
        let diags = check_extensions(&doc, &[reg]);

        assert_eq!(diags.len(), 1);
        assert!(
            diags[0].path.contains("group") && diags[0].path.contains("child"),
            "Path should include both group and child: {}",
            diags[0].path
        );
    }

    // 9. No items field — no panic, empty result
    #[test]
    fn no_items_field_returns_empty() {
        let doc = json!({ "$formspec": "1.0" });
        let reg = registry_with_entries(json!([active_entry("x-something")]));
        let diags = check_extensions(&doc, &[reg]);

        assert!(diags.is_empty());
    }

    // 10. Empty registry documents — all extensions unresolved
    #[test]
    fn empty_registry_means_all_unresolved() {
        let doc = def_with_items(json!([
            { "key": "a", "extensions": { "x-one": true } },
            { "key": "b", "extensions": { "x-two": true } }
        ]));
        let reg = registry_with_entries(json!([]));
        let diags = check_extensions(&doc, &[reg]);

        assert_eq!(diags.len(), 2);
        assert!(diags.iter().all(|d| d.code == crate::LintCode::E600));
    }

    // Extra: draft extension passes (same as active)
    #[test]
    fn draft_extension_produces_no_diagnostic() {
        let doc = def_with_items(json!([
            { "key": "field", "extensions": { "x-draft": true } }
        ]));
        let reg = registry_with_entries(json!([{
            "name": "x-draft",
            "status": "draft"
        }]));
        let diags = check_extensions(&doc, &[reg]);

        assert!(diags.is_empty());
    }

    // No registries at all → every enabled extension is unresolved (E600)
    #[test]
    fn no_registries_emits_e600_for_enabled_extensions() {
        let doc = def_with_items(json!([
            { "key": "field", "extensions": { "x-anything": true } }
        ]));
        let diags = check_extensions(&doc, &[]);

        assert_eq!(diags.len(), 1);
        assert_eq!(diags[0].code, "E600");
        assert!(diags[0].message.contains("x-anything"));
    }

    // No registries — disabled extensions not flagged
    #[test]
    fn no_registries_skips_disabled_extensions() {
        let doc = def_with_items(json!([
            { "key": "field", "extensions": { "x-off": false, "x-null": null } }
        ]));
        let diags = check_extensions(&doc, &[]);

        assert!(diags.is_empty());
    }

    // No registries — multiple enabled across items
    #[test]
    fn no_registries_emits_e600_for_all_enabled() {
        let doc = def_with_items(json!([
            { "key": "a", "extensions": { "x-one": true } },
            { "key": "b", "extensions": { "x-two": { "opt": 1 }, "x-off": false } }
        ]));
        let diags = check_extensions(&doc, &[]);

        assert_eq!(diags.len(), 2);
        assert!(diags.iter().all(|d| d.code == crate::LintCode::E600));
    }

    // Extra: null extension value — treated as disabled
    #[test]
    fn null_extension_value_not_checked() {
        let doc = def_with_items(json!([
            { "key": "field", "extensions": { "x-unknown": null } }
        ]));
        let reg = registry_with_entries(json!([]));
        let diags = check_extensions(&doc, &[reg]);

        assert!(diags.is_empty());
    }

    // Extra: mixed enabled/disabled on same item
    #[test]
    fn mixed_enabled_disabled_extensions() {
        let doc = def_with_items(json!([
            {
                "key": "field",
                "extensions": {
                    "x-known": true,
                    "x-disabled": false,
                    "x-missing": true
                }
            }
        ]));
        let reg = registry_with_entries(json!([active_entry("x-known")]));
        let diags = check_extensions(&doc, &[reg]);

        // Only x-missing should produce E600; x-disabled is skipped
        assert_eq!(diags.len(), 1);
        assert_eq!(diags[0].code, "E600");
        assert!(diags[0].message.contains("x-missing"));
    }

    // 11. Extension with "active" status — same as "stable", no diagnostic
    /// Spec: extension-registry.md §2.1 — "active" and "stable" are both valid active statuses
    #[test]
    fn active_status_extension_produces_no_diagnostic() {
        let doc = def_with_items(json!([
            { "key": "field", "extensions": { "x-ext": true } }
        ]));
        let reg = registry_with_entries(json!([{
            "name": "x-ext",
            "status": "active"
        }]));
        let diags = check_extensions(&doc, &[reg]);
        assert!(
            diags.is_empty(),
            "status='active' should resolve without diagnostics"
        );
    }

    // Extra: deeply nested items
    #[test]
    fn deeply_nested_items_path() {
        let doc = def_with_items(json!([
            {
                "key": "level1",
                "children": [{
                    "key": "level2",
                    "children": [{
                        "key": "level3",
                        "extensions": { "x-deep": true }
                    }]
                }]
            }
        ]));
        let reg = registry_with_entries(json!([]));
        let diags = check_extensions(&doc, &[reg]);

        assert_eq!(diags.len(), 1);
        assert!(diags[0].path.contains("level1"));
        assert!(diags[0].path.contains("level2"));
        assert!(diags[0].path.contains("level3"));
    }
}

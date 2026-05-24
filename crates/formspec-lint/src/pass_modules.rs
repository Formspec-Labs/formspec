//! Pass 3c: Module contribution resolution (E603 / E604) — ADR 0150 §4.2/§4.3/§4.5.
//!
//! Two cross-document invariants land here, both keyed to a document's
//! `modules[]` declaration and a set of loaded registry documents:
//!
//! - **E603** — every module-extensible enum value matching the `^x-` lane
//!   (per ADR §4.5's uniform `oneOf [closed-core, x-pattern]` convention)
//!   MUST resolve against a `contributes[]` entry of a module declared in
//!   the document's `modules[]`. Closed-core values bypass this pass —
//!   schema-level validation already accepts them.
//!
//! - **E604** — when a consuming-document field carries a value owned by a
//!   contributing module's payload shape (e.g. Theme `widgetConfig` against
//!   the contributing widget's `widgetShape.props`), the value MUST validate
//!   against that schema. P0 scope: Theme `defaults.widgetConfig` keyed by
//!   `widget: x-...`. The remaining sites (Surface slot bindings, Experience
//!   unit payloads, validation-mapping-row, token-category) light up as the
//!   consuming schemas land in P1+. Future module-contributed
//!   `Component.component: x-...` widget admittance gates through this same
//!   pass per ADR §4.5 (deferred from Task 5).
//!
//! The pass is permissive when inputs are missing: no `modules[]` and/or no
//! registry documents → no diagnostics. This preserves the default-module-set
//! behavior per ADR §4.9 for form-only documents.
#![allow(clippy::missing_docs_in_private_items)]

use std::collections::{HashMap, HashSet};

use jsonschema::Validator;
use serde_json::Value;

use crate::metadata;
use crate::types::LintDiagnostic;

pub(crate) const PASS: u8 = 3;

// ── Registry index ───────────────────────────────────────────────

/// Per-module index built from registry_documents.
///
/// Keyed by module name (e.g. `x-formspec-presentation`). Each entry holds
/// the module's declared contribution names; module entries themselves are
/// distinguished from their contributions by category.
struct ModuleContributions {
    /// modName → set of contributed-entry names
    by_module: HashMap<String, HashSet<String>>,
    /// contribName → module that contributes it (first occurrence wins).
    /// Used by E604 + reverse-lookup for diagnostic messages.
    owning_module: HashMap<String, String>,
    /// contribName → registry entry (used by E604 to find the payload shape).
    contribution_entry: HashMap<String, Value>,
}

impl ModuleContributions {
    fn build(registry_documents: &[Value]) -> Self {
        let mut by_module: HashMap<String, HashSet<String>> = HashMap::new();
        let mut owning_module: HashMap<String, String> = HashMap::new();
        let mut contribution_entry: HashMap<String, Value> = HashMap::new();

        // Pass 1: index every entry by name → owning module via `category: module`.
        for doc in registry_documents {
            let Some(entries) = doc.get("entries").and_then(Value::as_array) else {
                continue;
            };
            for entry in entries {
                let Some(name) = entry.get("name").and_then(Value::as_str) else {
                    continue;
                };
                let category = entry.get("category").and_then(Value::as_str).unwrap_or("");
                if category == "module" {
                    let contributes: HashSet<String> = entry
                        .get("contributes")
                        .and_then(Value::as_array)
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|v| v.as_str().map(String::from))
                                .collect()
                        })
                        .unwrap_or_default();
                    for c in &contributes {
                        owning_module
                            .entry(c.clone())
                            .or_insert_with(|| name.to_string());
                    }
                    by_module.insert(name.to_string(), contributes);
                } else {
                    contribution_entry
                        .entry(name.to_string())
                        .or_insert_with(|| entry.clone());
                }
            }
        }

        Self {
            by_module,
            owning_module,
            contribution_entry,
        }
    }

    /// Union of contributions across modules declared by the document.
    fn admitted_for(&self, declared_modules: &HashSet<String>) -> HashSet<String> {
        let mut admitted = HashSet::new();
        for module_id in declared_modules {
            if let Some(contribs) = self.by_module.get(module_id) {
                admitted.extend(contribs.iter().cloned());
            }
        }
        admitted
    }

    fn module_owning(&self, contribution_name: &str) -> Option<&str> {
        self.owning_module.get(contribution_name).map(String::as_str)
    }

    fn entry_for(&self, contribution_name: &str) -> Option<&Value> {
        self.contribution_entry.get(contribution_name)
    }
}

fn declared_modules(doc: &Value) -> HashSet<String> {
    let Some(modules) = doc.get("modules").and_then(Value::as_array) else {
        return HashSet::new();
    };
    modules
        .iter()
        .filter_map(|m| m.get("id").and_then(Value::as_str).map(String::from))
        .collect()
}

fn is_x_extension(value: &str) -> bool {
    value.starts_with("x-")
}

// ── E603: module-enum-unresolved ─────────────────────────────────

/// Walk a document's module-extensible enum sites and emit E603 for any
/// `x-` value that resolves no declared-module contribution.
///
/// P0 sites:
/// - Experience: `units[].kind` (UnitKind)
/// - respondent-ledger-event: `eventType`, `changes[].valueClass`
/// - screener: `strategy`
/// - changelog: `target`
/// - mapping: `rules[].transform`, `rules[].reverse.transform`
/// - trace-index: `sources[].kind`, `edges[].kind`
fn check_e603(
    doc: &Value,
    doc_type_name: &str,
    contributions: &ModuleContributions,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    let declared = declared_modules(doc);
    if declared.is_empty() {
        // No modules[] declared → nothing to resolve against.
        // (Default-module-set per ADR §4.9 covers closed-core; x- values without
        // any modules[] declaration are caught by schema-level x-pattern + this
        // pass's absence-of-resolution; emitting here without a declared module
        // would noise the form-only path. Lint stays silent; future strict mode
        // can promote.)
        return;
    }
    let admitted = contributions.admitted_for(&declared);

    match doc_type_name {
        "experience" => walk_experience_kinds(doc, &admitted, diagnostics),
        "respondent-ledger-event" => walk_ledger_event(doc, &admitted, diagnostics),
        "screener" => walk_screener(doc, &admitted, diagnostics),
        "changelog" => walk_changelog(doc, &admitted, diagnostics),
        "mapping" => walk_mapping(doc, &admitted, diagnostics),
        "trace-index" => walk_trace_index(doc, &admitted, diagnostics),
        _ => {}
    }
}

fn emit_e603(path: String, value: &str, diagnostics: &mut Vec<LintDiagnostic>) {
    diagnostics.push(metadata::with_metadata(LintDiagnostic::error(
        crate::LintCode::E603,
        PASS,
        path,
        format!(
            "Module-extensible value '{value}' resolves no declared-module contribution \
             — add the contributing module to the document's modules[] declaration"
        ),
    )));
}

fn check_x_value_admitted(
    value: &str,
    path: impl Into<String>,
    admitted: &HashSet<String>,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    if !is_x_extension(value) {
        return;
    }
    if !admitted.contains(value) {
        emit_e603(path.into(), value, diagnostics);
    }
}

fn walk_experience_kinds(
    doc: &Value,
    admitted: &HashSet<String>,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    let Some(units) = doc.get("units").and_then(Value::as_array) else {
        return;
    };
    for (i, unit) in units.iter().enumerate() {
        let Some(kind) = unit.get("kind").and_then(Value::as_str) else {
            continue;
        };
        check_x_value_admitted(kind, format!("$.units[{i}].kind"), admitted, diagnostics);
    }
}

fn walk_ledger_event(
    doc: &Value,
    admitted: &HashSet<String>,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    if let Some(et) = doc.get("eventType").and_then(Value::as_str) {
        check_x_value_admitted(et, "$.eventType", admitted, diagnostics);
    }
    if let Some(changes) = doc.get("changes").and_then(Value::as_array) {
        for (i, change) in changes.iter().enumerate() {
            if let Some(vc) = change.get("valueClass").and_then(Value::as_str) {
                check_x_value_admitted(
                    vc,
                    format!("$.changes[{i}].valueClass"),
                    admitted,
                    diagnostics,
                );
            }
        }
    }
}

fn walk_screener(
    doc: &Value,
    admitted: &HashSet<String>,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    if let Some(strategy) = doc.get("strategy").and_then(Value::as_str) {
        check_x_value_admitted(strategy, "$.strategy", admitted, diagnostics);
    }
}

fn walk_changelog(
    doc: &Value,
    admitted: &HashSet<String>,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    if let Some(changes) = doc.get("changes").and_then(Value::as_array) {
        for (i, change) in changes.iter().enumerate() {
            if let Some(target) = change.get("target").and_then(Value::as_str) {
                check_x_value_admitted(
                    target,
                    format!("$.changes[{i}].target"),
                    admitted,
                    diagnostics,
                );
            }
        }
    }
}

fn walk_mapping(
    doc: &Value,
    admitted: &HashSet<String>,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    let Some(rules) = doc.get("rules").and_then(Value::as_array) else {
        return;
    };
    for (i, rule) in rules.iter().enumerate() {
        if let Some(t) = rule.get("transform").and_then(Value::as_str) {
            check_x_value_admitted(
                t,
                format!("$.rules[{i}].transform"),
                admitted,
                diagnostics,
            );
        }
        if let Some(rev) = rule.get("reverse")
            && let Some(t) = rev.get("transform").and_then(Value::as_str)
        {
            check_x_value_admitted(
                t,
                format!("$.rules[{i}].reverse.transform"),
                admitted,
                diagnostics,
            );
        }
    }
}

fn walk_trace_index(
    doc: &Value,
    admitted: &HashSet<String>,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    if let Some(sources) = doc.get("sources").and_then(Value::as_array) {
        for (i, source) in sources.iter().enumerate() {
            if let Some(k) = source.get("kind").and_then(Value::as_str) {
                check_x_value_admitted(
                    k,
                    format!("$.sources[{i}].kind"),
                    admitted,
                    diagnostics,
                );
            }
        }
    }
    if let Some(edges) = doc.get("edges").and_then(Value::as_array) {
        for (i, edge) in edges.iter().enumerate() {
            if let Some(k) = edge.get("kind").and_then(Value::as_str) {
                check_x_value_admitted(
                    k,
                    format!("$.edges[{i}].kind"),
                    admitted,
                    diagnostics,
                );
            }
        }
    }
}

// ── E604: MODULE-PAYLOAD-SCHEMA-MISMATCH ─────────────────────────

/// Walk a document's module-payload sites and emit E604 for any value that
/// fails its contributing module's declared payload schema.
///
/// P0 scope: Theme `defaults.widgetConfig` against `widget.widgetShape.props`.
/// Selector- and item-level `widgetConfig` slots follow the same shape and
/// are checked too. Other consuming surfaces (Surface slot bindings,
/// Experience unit payloads, validation-mapping-row, token-category) attach
/// as their owning P1+ shapes land.
fn check_e604(
    doc: &Value,
    doc_type_name: &str,
    contributions: &ModuleContributions,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    if doc_type_name != "theme" {
        return;
    }
    let declared = declared_modules(doc);
    if declared.is_empty() {
        return;
    }
    let admitted = contributions.admitted_for(&declared);

    // defaults (cascade level 1)
    if let Some(defaults) = doc.get("defaults") {
        check_widget_config_site(
            defaults,
            "$.defaults",
            contributions,
            &admitted,
            diagnostics,
        );
    }

    // selectors[].apply (cascade level 2)
    if let Some(selectors) = doc.get("selectors").and_then(Value::as_array) {
        for (i, selector) in selectors.iter().enumerate() {
            if let Some(apply) = selector.get("apply") {
                check_widget_config_site(
                    apply,
                    &format!("$.selectors[{i}].apply"),
                    contributions,
                    &admitted,
                    diagnostics,
                );
            }
        }
    }

    // items (cascade level 3) — keys are item paths
    if let Some(items) = doc.get("items").and_then(Value::as_object) {
        for (key, block) in items {
            check_widget_config_site(
                block,
                &format!("$.items[{key:?}]"),
                contributions,
                &admitted,
                diagnostics,
            );
        }
    }
}

/// One PresentationBlock site: if the block names an `x-...` widget that's
/// admitted and contributes a `widgetShape.props`, validate `widgetConfig`
/// against it.
fn check_widget_config_site(
    block: &Value,
    path: &str,
    contributions: &ModuleContributions,
    admitted: &HashSet<String>,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    let Some(widget) = block.get("widget").and_then(Value::as_str) else {
        return;
    };
    if !is_x_extension(widget) || !admitted.contains(widget) {
        // closed-core widget OR unresolved x-widget — E603/E600 handles the latter
        // in their own passes; E604 only fires when the widget IS admitted.
        return;
    }
    let Some(widget_config) = block.get("widgetConfig") else {
        return;
    };
    let Some(entry) = contributions.entry_for(widget) else {
        return;
    };
    let Some(props_schema) = entry.pointer("/widgetShape/props") else {
        return;
    };

    // Compile the props schema. If compilation fails, we silently skip; that's
    // a module-author error (E604 isn't meant to flag broken module schemas).
    let Ok(validator) = jsonschema::options().build(props_schema) else {
        return;
    };

    emit_validation_errors(
        &validator,
        widget_config,
        &format!("{path}.widgetConfig"),
        widget,
        contributions,
        diagnostics,
    );
}

fn emit_validation_errors(
    validator: &Validator,
    value: &Value,
    path: &str,
    contribution: &str,
    contributions: &ModuleContributions,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    let owning = contributions
        .module_owning(contribution)
        .unwrap_or("<unknown>");
    for err in validator.iter_errors(value) {
        let pointer = err.instance_path().as_str();
        let full_path = if pointer.is_empty() {
            path.to_string()
        } else {
            format!("{path}{pointer}")
        };
        diagnostics.push(metadata::with_metadata(LintDiagnostic::error(
            crate::LintCode::E604,
            PASS,
            full_path,
            format!(
                "Module contribution '{contribution}' (from module '{owning}') payload mismatch: {err}"
            ),
        )));
    }
}

// ── Public entry ─────────────────────────────────────────────────

/// Run E603 + E604 for the given document. Always safe to call — emits
/// nothing when registry_documents is empty or the document declares no
/// modules[].
pub fn check_module_contributions(
    doc: &Value,
    doc_type_name: &str,
    registry_documents: &[Value],
) -> Vec<LintDiagnostic> {
    if registry_documents.is_empty() {
        return Vec::new();
    }
    let contributions = ModuleContributions::build(registry_documents);
    let mut diagnostics = Vec::new();
    check_e603(doc, doc_type_name, &contributions, &mut diagnostics);
    check_e604(doc, doc_type_name, &contributions, &mut diagnostics);
    diagnostics
}

// ── Tests ────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;
    use serde_json::json;

    fn module_registry(module_name: &str, contributes: &[&str]) -> Value {
        json!({
            "$formspecRegistry": "1.0",
            "publisher": { "name": "Test" },
            "entries": [{
                "name": module_name,
                "version": "1.0.0",
                "status": "stable",
                "category": "module",
                "description": "test module",
                "compatibility": { "formspecVersion": ">=1.0.0" },
                "contributes": contributes,
            }]
        })
    }

    fn widget_registry_with_module() -> Value {
        json!({
            "$formspecRegistry": "1.0",
            "publisher": { "name": "Test" },
            "entries": [
                {
                    "name": "x-test-mod",
                    "version": "1.0.0",
                    "status": "stable",
                    "category": "module",
                    "description": "test module",
                    "compatibility": { "formspecVersion": ">=1.0.0" },
                    "contributes": ["x-test-slider"],
                },
                {
                    "name": "x-test-slider",
                    "version": "1.0.0",
                    "status": "stable",
                    "category": "widget",
                    "description": "slider widget",
                    "compatibility": { "formspecVersion": ">=1.0.0" },
                    "widgetShape": {
                        "props": {
                            "type": "object",
                            "properties": {
                                "min": { "type": "number" },
                                "max": { "type": "number" }
                            },
                            "additionalProperties": false
                        },
                        "childrenPolicy": "no-children"
                    }
                }
            ]
        })
    }

    // ── E603 ──

    #[test]
    fn e603_unresolved_x_kind_emits_diagnostic() {
        let doc = json!({
            "$formspecExperience": "1.0",
            "modules": [{ "id": "x-foo-mod", "version": "1.0.0" }],
            "units": [{ "id": "u1", "kind": "x-foo-bar" }]
        });
        let reg = module_registry("x-foo-mod", &["x-foo-other"]);
        let diags = check_module_contributions(&doc, "experience", &[reg]);
        let e603: Vec<_> = diags.iter().filter(|d| d.code == "E603").collect();
        assert_eq!(e603.len(), 1, "expected 1 E603, got {:?}", diags);
        assert!(e603[0].path.contains("units[0].kind"));
    }

    #[test]
    fn e603_resolved_x_kind_passes() {
        let doc = json!({
            "$formspecExperience": "1.0",
            "modules": [{ "id": "x-foo-mod", "version": "1.0.0" }],
            "units": [{ "id": "u1", "kind": "x-foo-bar" }]
        });
        let reg = module_registry("x-foo-mod", &["x-foo-bar"]);
        let diags = check_module_contributions(&doc, "experience", &[reg]);
        assert!(diags.iter().all(|d| d.code != "E603"));
    }

    #[test]
    fn e603_closed_core_kind_ignored() {
        let doc = json!({
            "$formspecExperience": "1.0",
            "modules": [{ "id": "x-foo-mod", "version": "1.0.0" }],
            "units": [{ "id": "u1", "kind": "data-entry" }]
        });
        let reg = module_registry("x-foo-mod", &[]);
        let diags = check_module_contributions(&doc, "experience", &[reg]);
        assert!(diags.iter().all(|d| d.code != "E603"));
    }

    #[test]
    fn e603_no_modules_declared_silent() {
        let doc = json!({
            "$formspecExperience": "1.0",
            "units": [{ "id": "u1", "kind": "x-foo-bar" }]
        });
        let reg = module_registry("x-foo-mod", &["x-foo-bar"]);
        let diags = check_module_contributions(&doc, "experience", &[reg]);
        assert!(
            diags.iter().all(|d| d.code != "E603"),
            "form-only docs (no modules[]) should not emit E603"
        );
    }

    #[test]
    fn e603_no_registries_silent() {
        let doc = json!({
            "$formspecExperience": "1.0",
            "modules": [{ "id": "x-foo-mod", "version": "1.0.0" }],
            "units": [{ "id": "u1", "kind": "x-foo-bar" }]
        });
        let diags = check_module_contributions(&doc, "experience", &[]);
        assert!(diags.is_empty());
    }

    #[test]
    fn e603_event_type_x_value() {
        let doc = json!({
            "$formspecRespondentLedgerEvent": "1.0",
            "modules": [{ "id": "x-foo-mod", "version": "1.0.0" }],
            "eventType": "x-unknown-event"
        });
        let reg = module_registry("x-foo-mod", &[]);
        let diags = check_module_contributions(&doc, "respondent-ledger-event", &[reg]);
        let e603: Vec<_> = diags.iter().filter(|d| d.code == "E603").collect();
        assert_eq!(e603.len(), 1);
        assert!(e603[0].path.contains("eventType"));
    }

    // ── E604 ──

    #[test]
    fn e604_widget_config_mismatch_emits_diagnostic() {
        let doc = json!({
            "$formspecTheme": "1.0",
            "modules": [{ "id": "x-test-mod", "version": "1.0.0" }],
            "defaults": {
                "widget": "x-test-slider",
                "widgetConfig": { "min": "not-a-number", "max": 10 }
            }
        });
        let reg = widget_registry_with_module();
        let diags = check_module_contributions(&doc, "theme", &[reg]);
        let e604: Vec<_> = diags.iter().filter(|d| d.code == "E604").collect();
        assert!(!e604.is_empty(), "expected E604, got {:?}", diags);
        assert!(e604[0].path.contains("widgetConfig"));
        assert!(e604[0].message.contains("x-test-slider"));
        assert!(e604[0].message.contains("x-test-mod"));
    }

    #[test]
    fn e604_widget_config_match_passes() {
        let doc = json!({
            "$formspecTheme": "1.0",
            "modules": [{ "id": "x-test-mod", "version": "1.0.0" }],
            "defaults": {
                "widget": "x-test-slider",
                "widgetConfig": { "min": 0, "max": 10 }
            }
        });
        let reg = widget_registry_with_module();
        let diags = check_module_contributions(&doc, "theme", &[reg]);
        assert!(diags.iter().all(|d| d.code != "E604"));
    }

    #[test]
    fn e604_closed_core_widget_skipped() {
        let doc = json!({
            "$formspecTheme": "1.0",
            "modules": [{ "id": "x-test-mod", "version": "1.0.0" }],
            "defaults": {
                "widget": "Slider",
                "widgetConfig": { "min": 0, "max": 10 }
            }
        });
        let reg = widget_registry_with_module();
        let diags = check_module_contributions(&doc, "theme", &[reg]);
        assert!(diags.iter().all(|d| d.code != "E604"));
    }

    #[test]
    fn e604_no_widget_config_skipped() {
        let doc = json!({
            "$formspecTheme": "1.0",
            "modules": [{ "id": "x-test-mod", "version": "1.0.0" }],
            "defaults": { "widget": "x-test-slider" }
        });
        let reg = widget_registry_with_module();
        let diags = check_module_contributions(&doc, "theme", &[reg]);
        assert!(diags.iter().all(|d| d.code != "E604"));
    }

    #[test]
    fn e604_selector_widget_config_checked() {
        let doc = json!({
            "$formspecTheme": "1.0",
            "modules": [{ "id": "x-test-mod", "version": "1.0.0" }],
            "selectors": [{
                "match": "*",
                "apply": {
                    "widget": "x-test-slider",
                    "widgetConfig": { "min": "bad" }
                }
            }]
        });
        let reg = widget_registry_with_module();
        let diags = check_module_contributions(&doc, "theme", &[reg]);
        let e604: Vec<_> = diags.iter().filter(|d| d.code == "E604").collect();
        assert!(!e604.is_empty(), "expected E604 at selectors path: {:?}", diags);
        assert!(e604[0].path.contains("selectors[0].apply.widgetConfig"));
    }

    // ── E605 binding lands in Task 11 — sentinel test confirms the
    //    skip mechanism the conformance suite uses, not the binding.

    #[test]
    #[ignore = "E605 lint binding lands in Task 11 (bundle-unique id invariant)"]
    fn e605_bundle_collision_placeholder() {
        // Intentional: this test will be authored when Task 11 binds the
        // COMP-BUNDLE-ID-COLLISION lint pass. Mirror of the Python skip.
        unreachable!("Task 11 implements E605");
    }
}

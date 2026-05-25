//! Pass 3c: Module contribution resolution (E603 / E604) and bundle-graph
//! Component-id uniqueness (E605) — ADR 0150 §4.2/§4.3/§4.5/§5.3.
//!
//! Three cross-document invariants land here:
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
//!   `widget: x-...`. Surface `module-widget` slot configs are checked against
//!   the bound module widget's `widgetShape.props`. The remaining sites
//!   (Experience unit payloads, validation-mapping-row, token-category) light up
//!   as the consuming schemas land in P1+. Future module-contributed
//!   `Component.component: x-...` widget admittance gates through this same
//!   pass per ADR §4.5 (deferred from Task 5).
//!
//! - **E605** (COMP-BUNDLE-ID-COLLISION) — every authored `ComponentBase.id`
//!   reachable from a single App Manifest MUST be unique across all
//!   referenced Component documents (not merely within a single document).
//!   The binding consumes `LintOptions.bundle_component_documents` — when ≥2
//!   documents are present it builds an id-index keyed on every `id` string
//!   field at any depth and emits one diagnostic per colliding id citing all
//!   occurrences. JSON Schema cannot enforce this graph-level invariant; the
//!   lint is the substrate enforcement. Load-bearing for ADR 0151 cross-doc
//!   move (CRDT bidirectional map relies on no-collision in the target doc).
//!
//! The pass is permissive when inputs are missing: no `modules[]` and/or no
//! registry documents → no diagnostics. This preserves the default-module-set
//! behavior per ADR §4.9 for form-only documents.
//!
//! ## E605 walker semantics — Rust analogue of Python audit v3
//!
//! The id-walker matches the reference implementation at
//! `tests/conformance/tools/comp_bundle_id_audit.py::walk_deep()` (v3). That
//! script's v2 walker had a false-negative bug on non-standard nesting because
//! it only recursed under known structural keys; v3 is the conservative
//! posture — recurse through EVERY dict/list value at any depth and collect
//! every `id` string field encountered. The Rust binding MUST preserve v3
//! semantics; widening the walker to skip non-standard keys re-opens the
//! false-negative.
//!
//! Excluded subtrees (e.g. `tests/conformance/fixtures/regeneration-merge/`
//! — three-way merge fixtures whose four revisions of one Component reuse
//! ids by design) are the caller's concern. The Python audit applies
//! `EXCLUDED_TREES` at the bundle-resolution layer; this lint binding sees
//! only what the caller hands it. See
//! `tests/conformance/COMP-BUNDLE-ID-MIGRATION.md` §1 Exclusion.
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
        self.owning_module
            .get(contribution_name)
            .map(String::as_str)
    }

    fn entry_for(&self, contribution_name: &str) -> Option<&Value> {
        self.contribution_entry.get(contribution_name)
    }

    fn widget_entry_for(&self, module_id: &str, widget_name: &str) -> Option<(&str, &Value)> {
        let contributed = self.by_module.get(module_id)?;
        for contribution_name in contributed {
            let Some(entry) = self.entry_for(contribution_name) else {
                continue;
            };
            if entry.get("category").and_then(Value::as_str) != Some("widget") {
                continue;
            }
            if entry
                .pointer("/widgetShape/widgetName")
                .and_then(Value::as_str)
                == Some(widget_name)
            {
                return Some((contribution_name.as_str(), entry));
            }
        }
        None
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
/// - Surface: `routes[].slots[].binding.moduleId` for `module-widget` slots
fn check_e603(
    doc: &Value,
    doc_type_name: &str,
    contributions: &ModuleContributions,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    let declared = declared_modules(doc);
    if doc_type_name == "surface" {
        walk_surface_module_widget_modules(doc, &declared, diagnostics);
    }
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
        "surface" => walk_surface_module_widget_names(doc, &declared, contributions, diagnostics),
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

fn emit_e603_module(path: String, module_id: &str, diagnostics: &mut Vec<LintDiagnostic>) {
    diagnostics.push(metadata::with_metadata(LintDiagnostic::error(
        crate::LintCode::E603,
        PASS,
        path,
        format!(
            "Surface module-widget moduleId '{module_id}' is not declared in \
             this document's modules[] declaration"
        ),
    )));
}

fn emit_e603_surface_widget(
    path: String,
    module_id: &str,
    widget_name: &str,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    diagnostics.push(metadata::with_metadata(LintDiagnostic::error(
        crate::LintCode::E603,
        PASS,
        path,
        format!(
            "Surface module-widget widgetName '{widget_name}' resolves no widget contribution \
             from declared module '{module_id}'"
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

fn walk_screener(doc: &Value, admitted: &HashSet<String>, diagnostics: &mut Vec<LintDiagnostic>) {
    if let Some(strategy) = doc.get("strategy").and_then(Value::as_str) {
        check_x_value_admitted(strategy, "$.strategy", admitted, diagnostics);
    }
}

fn walk_changelog(doc: &Value, admitted: &HashSet<String>, diagnostics: &mut Vec<LintDiagnostic>) {
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

fn walk_mapping(doc: &Value, admitted: &HashSet<String>, diagnostics: &mut Vec<LintDiagnostic>) {
    let Some(rules) = doc.get("rules").and_then(Value::as_array) else {
        return;
    };
    for (i, rule) in rules.iter().enumerate() {
        if let Some(t) = rule.get("transform").and_then(Value::as_str) {
            check_x_value_admitted(t, format!("$.rules[{i}].transform"), admitted, diagnostics);
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
                check_x_value_admitted(k, format!("$.sources[{i}].kind"), admitted, diagnostics);
            }
        }
    }
    if let Some(edges) = doc.get("edges").and_then(Value::as_array) {
        for (i, edge) in edges.iter().enumerate() {
            if let Some(k) = edge.get("kind").and_then(Value::as_str) {
                check_x_value_admitted(k, format!("$.edges[{i}].kind"), admitted, diagnostics);
            }
        }
    }
}

fn walk_surface_module_widget_modules(
    doc: &Value,
    declared: &HashSet<String>,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    let Some(routes) = doc.get("routes").and_then(Value::as_array) else {
        return;
    };
    for (route_idx, route) in routes.iter().enumerate() {
        let Some(slots) = route.get("slots").and_then(Value::as_array) else {
            continue;
        };
        for (slot_idx, slot) in slots.iter().enumerate() {
            if slot.get("slotType").and_then(Value::as_str) != Some("module-widget") {
                continue;
            }
            let Some(module_id) = slot
                .get("binding")
                .and_then(|b| b.get("moduleId"))
                .and_then(Value::as_str)
            else {
                continue;
            };
            if is_x_extension(module_id) && !declared.contains(module_id) {
                emit_e603_module(
                    format!("$.routes[{route_idx}].slots[{slot_idx}].binding.moduleId"),
                    module_id,
                    diagnostics,
                );
            }
        }
    }
}

fn walk_surface_module_widget_names(
    doc: &Value,
    declared: &HashSet<String>,
    contributions: &ModuleContributions,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    let Some(routes) = doc.get("routes").and_then(Value::as_array) else {
        return;
    };
    for (route_idx, route) in routes.iter().enumerate() {
        let Some(slots) = route.get("slots").and_then(Value::as_array) else {
            continue;
        };
        for (slot_idx, slot) in slots.iter().enumerate() {
            if slot.get("slotType").and_then(Value::as_str) != Some("module-widget") {
                continue;
            }
            let Some(binding) = slot.get("binding") else {
                continue;
            };
            let Some(module_id) = binding.get("moduleId").and_then(Value::as_str) else {
                continue;
            };
            if !declared.contains(module_id) {
                continue; // moduleId diagnostic already owns this failure.
            }
            let Some(widget_name) = binding.get("widgetName").and_then(Value::as_str) else {
                continue;
            };
            if contributions
                .widget_entry_for(module_id, widget_name)
                .is_none()
            {
                emit_e603_surface_widget(
                    format!("$.routes[{route_idx}].slots[{slot_idx}].binding.widgetName"),
                    module_id,
                    widget_name,
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
/// are checked too. Surface `module-widget.binding.config` is checked against
/// the module widget's `widgetShape.props`. Other consuming surfaces
/// (Experience unit payloads, validation-mapping-row, token-category) attach
/// as their owning P1+ shapes land.
fn check_e604(
    doc: &Value,
    doc_type_name: &str,
    contributions: &ModuleContributions,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    let declared = declared_modules(doc);
    if declared.is_empty() {
        return;
    }
    let admitted = contributions.admitted_for(&declared);

    if doc_type_name == "surface" {
        check_surface_module_widget_configs(doc, &declared, contributions, diagnostics);
        return;
    }

    if doc_type_name != "theme" {
        return;
    }

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

fn check_surface_module_widget_configs(
    doc: &Value,
    declared: &HashSet<String>,
    contributions: &ModuleContributions,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    let Some(routes) = doc.get("routes").and_then(Value::as_array) else {
        return;
    };
    for (route_idx, route) in routes.iter().enumerate() {
        let Some(slots) = route.get("slots").and_then(Value::as_array) else {
            continue;
        };
        for (slot_idx, slot) in slots.iter().enumerate() {
            if slot.get("slotType").and_then(Value::as_str) != Some("module-widget") {
                continue;
            }
            let Some(binding) = slot.get("binding") else {
                continue;
            };
            let Some(config) = binding.get("config") else {
                continue;
            };
            let Some(module_id) = binding.get("moduleId").and_then(Value::as_str) else {
                continue;
            };
            if !declared.contains(module_id) {
                continue; // E603 owns undeclared moduleId.
            }
            let Some(widget_name) = binding.get("widgetName").and_then(Value::as_str) else {
                continue;
            };
            let Some((contribution_name, entry)) =
                contributions.widget_entry_for(module_id, widget_name)
            else {
                continue;
            };
            let Some(props_schema) = entry.pointer("/widgetShape/props") else {
                continue;
            };
            let Ok(validator) = jsonschema::options().build(props_schema) else {
                continue;
            };

            emit_validation_errors(
                &validator,
                config,
                &format!("$.routes[{route_idx}].slots[{slot_idx}].binding.config"),
                contribution_name,
                contributions,
                diagnostics,
            );
        }
    }
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

// ── E605: COMP-BUNDLE-ID-COLLISION ───────────────────────────────

/// One occurrence of an id in the bundle graph: which document (by index in
/// the caller's Vec) and the JSON-ish nodePath inside that document.
#[derive(Debug, Clone)]
struct IdOccurrence {
    doc_index: usize,
    node_path: String,
}

/// Permissive deep walk — record every `id` string field at any depth.
///
/// Matches `tests/conformance/tools/comp_bundle_id_audit.py::walk_deep()` (v3).
/// The path uses JSON-ish dot/index notation rooted at the caller-supplied
/// `path` argument (`tree`, `root`, or a bare key under the envelope).
fn walk_deep_ids(node: &Value, path: &str, out: &mut Vec<(String, String)>) {
    match node {
        Value::Object(map) => {
            if let Some(id_str) = map.get("id").and_then(Value::as_str) {
                let recorded_path = if path.is_empty() { "<root>" } else { path };
                out.push((recorded_path.to_string(), id_str.to_string()));
            }
            for (k, v) in map {
                let next = if path.is_empty() {
                    k.clone()
                } else {
                    format!("{path}.{k}")
                };
                walk_deep_ids(v, &next, out);
            }
        }
        Value::Array(items) => {
            for (i, item) in items.iter().enumerate() {
                let next = format!("{path}[{i}]");
                walk_deep_ids(item, &next, out);
            }
        }
        _ => {}
    }
}

/// Extract ids from a Component document — walks under `tree`/`root` when
/// present, else under the whole doc minus the envelope keys. Mirrors
/// `extract_ids()` in the Python reference.
fn extract_component_ids(doc: &Value) -> Vec<(String, String)> {
    let mut out = Vec::new();
    if let Some(tree) = doc.get("tree") {
        walk_deep_ids(tree, "tree", &mut out);
    } else if let Some(root) = doc.get("root") {
        walk_deep_ids(root, "root", &mut out);
    } else if let Some(map) = doc.as_object() {
        const ENVELOPE_SKIP: &[&str] = &[
            "$formspecComponent",
            "version",
            "targetDefinition",
            "x-generation",
        ];
        for (k, v) in map {
            if ENVELOPE_SKIP.contains(&k.as_str()) {
                continue;
            }
            walk_deep_ids(v, k, &mut out);
        }
    }
    out
}

/// E605 binding entry: walk every supplied Component document, build an
/// id→occurrences index keyed only on cross-document collisions (intra-doc
/// duplicates are the schema's concern), emit one diagnostic per colliding id.
///
/// Returns no diagnostics when fewer than 2 documents are supplied; a single
/// document's local uniqueness is enforced by the schema pattern and the
/// per-document component walker.
pub fn check_bundle_component_ids(bundle_component_documents: &[Value]) -> Vec<LintDiagnostic> {
    if bundle_component_documents.len() < 2 {
        return Vec::new();
    }

    // id → occurrences across documents.
    let mut by_id: HashMap<String, Vec<IdOccurrence>> = HashMap::new();
    for (doc_index, doc) in bundle_component_documents.iter().enumerate() {
        for (node_path, id_str) in extract_component_ids(doc) {
            by_id.entry(id_str).or_default().push(IdOccurrence {
                doc_index,
                node_path,
            });
        }
    }

    let mut diagnostics = Vec::new();
    // Stable ordering: sort colliding ids alphabetically for deterministic output.
    let mut colliding_ids: Vec<&String> = by_id
        .iter()
        .filter(|(_, occs)| {
            // Cross-document collision = ≥2 distinct doc_index values.
            let mut seen = HashSet::new();
            occs.iter().any(|o| !seen.insert(o.doc_index))
                || occs
                    .iter()
                    .map(|o| o.doc_index)
                    .collect::<HashSet<_>>()
                    .len()
                    >= 2
        })
        .map(|(k, _)| k)
        .collect();
    colliding_ids.sort();

    for id_str in colliding_ids {
        let occs = &by_id[id_str];
        // Only fire on cross-document collision (≥2 distinct docs); intra-doc
        // dup is the schema/tree walker's concern.
        let distinct_docs: HashSet<usize> = occs.iter().map(|o| o.doc_index).collect();
        if distinct_docs.len() < 2 {
            continue;
        }
        // Diagnostic path cites the first occurrence; message enumerates all.
        let primary = &occs[0];
        let occurrences = occs
            .iter()
            .map(|o| format!("doc[{}]::{}", o.doc_index, o.node_path))
            .collect::<Vec<_>>()
            .join(", ");
        diagnostics.push(metadata::with_metadata(LintDiagnostic::error(
            crate::LintCode::E605,
            PASS,
            format!("$.doc[{}].{}", primary.doc_index, primary.node_path),
            format!(
                "Component node id '{id_str}' collides across the bundle graph \
                 ({} occurrences): {occurrences}",
                occs.len()
            ),
        )));
    }
    diagnostics
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
        let mut diagnostics = Vec::new();
        if doc_type_name == "surface" {
            let declared = declared_modules(doc);
            walk_surface_module_widget_modules(doc, &declared, &mut diagnostics);
        }
        return diagnostics;
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
                        "widgetName": "Slider",
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

    #[test]
    fn e603_surface_module_widget_requires_declared_module() {
        let doc = json!({
            "$formspecSurface": "0.1",
            "id": "dashboard",
            "entry": "home",
            "modules": [{ "id": "x-other-mod", "version": "1.0.0" }],
            "routes": [{
                "id": "home",
                "path": "/",
                "slots": [{
                    "id": "viewer",
                    "slotType": "module-widget",
                    "binding": {
                        "moduleId": "x-test-mod",
                        "widgetName": "Slider"
                    }
                }]
            }]
        });
        let reg = widget_registry_with_module();
        let diags = check_module_contributions(&doc, "surface", &[reg]);
        let e603: Vec<_> = diags.iter().filter(|d| d.code == "E603").collect();
        assert_eq!(
            e603.len(),
            1,
            "expected surface module-widget E603, got {diags:?}"
        );
        assert!(e603[0].path.contains("routes[0].slots[0].binding.moduleId"));
    }

    #[test]
    fn e603_surface_module_widget_requires_known_widget_name() {
        let doc = json!({
            "$formspecSurface": "0.1",
            "id": "dashboard",
            "entry": "home",
            "modules": [{ "id": "x-test-mod", "version": "1.0.0" }],
            "routes": [{
                "id": "home",
                "path": "/",
                "slots": [{
                    "id": "viewer",
                    "slotType": "module-widget",
                    "binding": {
                        "moduleId": "x-test-mod",
                        "widgetName": "TypoWidget",
                        "config": { "min": "bad", "max": 10 }
                    }
                }]
            }]
        });
        let reg = widget_registry_with_module();
        let diags = check_module_contributions(&doc, "surface", &[reg]);
        let e603: Vec<_> = diags.iter().filter(|d| d.code == "E603").collect();
        assert_eq!(
            e603.len(),
            1,
            "expected unresolved surface widgetName E603, got {diags:?}"
        );
        assert!(e603[0]
            .path
            .contains("routes[0].slots[0].binding.widgetName"));
        assert!(e603[0].message.contains("TypoWidget"));
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
        assert!(
            !e604.is_empty(),
            "expected E604 at selectors path: {:?}",
            diags
        );
        assert!(e604[0].path.contains("selectors[0].apply.widgetConfig"));
    }

    #[test]
    fn e604_surface_module_widget_config_checked() {
        let doc = json!({
            "$formspecSurface": "0.1",
            "id": "dashboard",
            "entry": "home",
            "modules": [{ "id": "x-test-mod", "version": "1.0.0" }],
            "routes": [{
                "id": "home",
                "path": "/",
                "slots": [{
                    "id": "viewer",
                    "slotType": "module-widget",
                    "binding": {
                        "moduleId": "x-test-mod",
                        "widgetName": "Slider",
                        "config": { "min": "bad", "max": 10 }
                    }
                }]
            }]
        });
        let reg = widget_registry_with_module();
        let diags = check_module_contributions(&doc, "surface", &[reg]);
        let e604: Vec<_> = diags.iter().filter(|d| d.code == "E604").collect();
        assert!(
            !e604.is_empty(),
            "expected surface module-widget E604, got {:?}",
            diags
        );
        assert!(e604[0].path.contains("routes[0].slots[0].binding.config"));
        assert!(e604[0].message.contains("x-test-slider"));
    }

    // ── E605: COMP-BUNDLE-ID-COLLISION (bundle-graph id-uniqueness) ──

    fn component_doc(stem: &str, body: Value) -> Value {
        json!({
            "$formspecComponent": "1.0",
            "version": "1.0.0",
            "targetDefinition": { "url": format!("https://example.com/forms/{stem}") },
            "tree": body
        })
    }

    #[test]
    fn e605_collision_across_two_components_emits_diagnostic() {
        // Two component documents stamp the same id `header` — invariant violated.
        let comp_a = component_doc(
            "a",
            json!({ "component": "Section", "id": "header", "title": "Comp A header" }),
        );
        let comp_b = component_doc(
            "b",
            json!({ "component": "Section", "id": "header", "title": "Comp B header" }),
        );
        let diags = check_bundle_component_ids(&[comp_a, comp_b]);
        let e605: Vec<_> = diags.iter().filter(|d| d.code == "E605").collect();
        assert_eq!(e605.len(), 1, "expected exactly 1 E605, got {:?}", diags);
        assert!(
            e605[0].message.contains("'header'"),
            "diagnostic should cite the colliding id: {}",
            e605[0].message
        );
        // Diagnostic path points at one of the two occurrences (deterministic: first).
        assert!(
            e605[0].path.contains("doc[0]") || e605[0].path.contains("doc[1]"),
            "diagnostic should cite the doc index: {}",
            e605[0].path
        );
    }

    #[test]
    fn e605_no_collision_silent() {
        let comp_a = component_doc(
            "a",
            json!({ "component": "Section", "id": "alpha", "title": "Alpha" }),
        );
        let comp_b = component_doc(
            "b",
            json!({ "component": "Section", "id": "beta", "title": "Beta" }),
        );
        let diags = check_bundle_component_ids(&[comp_a, comp_b]);
        assert!(
            diags.iter().all(|d| d.code != "E605"),
            "expected no E605 in {:?}",
            diags
        );
    }

    #[test]
    fn e605_single_document_silent() {
        // Local within-doc dup is the schema's concern (per-doc pattern + the
        // pre-existing tree walker); E605 fires only when ≥2 documents present.
        let comp_a = component_doc(
            "a",
            json!({
                "component": "Section",
                "id": "header",
                "children": [
                    { "component": "Section", "id": "footer" }
                ]
            }),
        );
        let diags = check_bundle_component_ids(&[comp_a]);
        assert!(diags.iter().all(|d| d.code != "E605"));
    }

    #[test]
    fn e605_empty_input_silent() {
        let diags = check_bundle_component_ids(&[]);
        assert!(diags.is_empty());
    }

    #[test]
    fn e605_collision_deep_in_nested_tree() {
        // Permissive deep walk: every `id` field at any depth, regardless of
        // structural key — matches the Python audit v3 reference semantics.
        let comp_a = component_doc(
            "a",
            json!({
                "component": "Form",
                "id": "rootA",
                "children": [
                    { "component": "Section", "id": "deep_collision", "children": [] }
                ]
            }),
        );
        let comp_b = component_doc(
            "b",
            json!({
                "component": "Form",
                "id": "rootB",
                "children": [
                    {
                        "component": "DataTable",
                        "id": "tableB",
                        "row": {
                            "component": "Section",
                            "id": "deep_collision"
                        }
                    }
                ]
            }),
        );
        let diags = check_bundle_component_ids(&[comp_a, comp_b]);
        let e605: Vec<_> = diags.iter().filter(|d| d.code == "E605").collect();
        assert_eq!(
            e605.len(),
            1,
            "expected E605 from deep-nested collision, got {:?}",
            diags
        );
        assert!(e605[0].message.contains("'deep_collision'"));
    }

    #[test]
    fn e605_three_way_collision_reports_once() {
        // When three docs share an id, emit a single diagnostic that names all
        // occurrences in its message (one E605 per colliding id, not per pair).
        let docs: Vec<Value> = (0..3)
            .map(|i| {
                component_doc(
                    &format!("c{i}"),
                    json!({ "component": "Section", "id": "shared" }),
                )
            })
            .collect();
        let diags = check_bundle_component_ids(&docs);
        let e605: Vec<_> = diags.iter().filter(|d| d.code == "E605").collect();
        assert_eq!(e605.len(), 1, "one E605 per colliding id");
    }

    #[test]
    fn e605_same_doc_dup_does_not_fire() {
        // Within-doc duplicate is the schema's concern; E605 fires only on
        // cross-document collisions per ADR §5.3.
        let comp_a = component_doc(
            "a",
            json!({
                "component": "Form",
                "id": "dup",
                "children": [
                    { "component": "Section", "id": "dup" }
                ]
            }),
        );
        let comp_b = component_doc("b", json!({ "component": "Section", "id": "other" }));
        let diags = check_bundle_component_ids(&[comp_a, comp_b]);
        assert!(
            diags.iter().all(|d| d.code != "E605"),
            "intra-doc dup should not trip E605: {:?}",
            diags
        );
    }
}

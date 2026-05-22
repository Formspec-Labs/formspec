//! Pass 9: Experience document semantic checks.
#![allow(clippy::missing_docs_in_private_items)]

use std::collections::{HashMap, HashSet};

use formspec_core::visit_definition_items_from_document;
use serde_json::Value;

use crate::semantic_helpers::{
    compatible_version_satisfied, definition_url, definition_version, error,
    target_definition_compatible_versions, target_definition_url, warning,
};
use crate::tree;
use crate::types::LintDiagnostic;

pub(crate) const PASS: u8 = 9;

pub(crate) fn lint_experience(doc: &Value, definition: Option<&Value>) -> Vec<LintDiagnostic> {
    let mut analyzer = Analyzer {
        doc,
        definition,
        definition_index: definition.map(tree::build_item_index),
        definition_items: definition.map(definition_items).unwrap_or_default(),
        diagnostics: Vec::new(),
    };
    analyzer.check_target_definition();
    analyzer.check_referential_integrity();
    analyzer.check_item_refs();
    analyzer.check_coverage();
    analyzer.diagnostics
}

struct Analyzer<'a> {
    doc: &'a Value,
    definition: Option<&'a Value>,
    definition_index: Option<tree::ItemTreeIndex>,
    definition_items: HashMap<String, DefinitionItemInfo>,
    diagnostics: Vec<LintDiagnostic>,
}

impl Analyzer<'_> {
    fn check_target_definition(&mut self) {
        let Some(definition) = self.definition else {
            return;
        };
        if let (Some(target_url), Some(def_url)) =
            (target_definition_url(self.doc), definition_url(definition))
            && target_url != def_url
        {
            self.diagnostics.push(error(
                crate::LintCode::E1700,
                PASS,
                "$.targetDefinition.url",
                format!(
                    "Experience targetDefinition.url ({target_url:?}) does not match paired Definition url ({def_url:?})"
                ),
            ));
        }
        if let (Some(range), Some(version)) = (
            target_definition_compatible_versions(self.doc),
            definition_version(definition),
        ) && compatible_version_satisfied(range, version) != Some(true)
        {
            self.diagnostics.push(warning(
                crate::LintCode::W1700,
                PASS,
                "$.targetDefinition.compatibleVersions",
                format!(
                    "Experience compatibleVersions ({range:?}) does not confidently include paired Definition version ({version:?})"
                ),
            ));
        }
    }

    fn check_referential_integrity(&mut self) {
        let actor_ids = collect_ids(self.doc.get("actors").and_then(Value::as_array));
        let task_ids = collect_ids(self.doc.get("tasks").and_then(Value::as_array));

        for (i, actor_ref) in string_array_entries(self.doc.pointer("/applicability/actorRefs")) {
            self.check_id_ref(
                actor_ref,
                &actor_ids,
                "actors",
                format!("$.applicability.actorRefs[{i}]"),
            );
        }

        if let Some(tasks) = self.doc.get("tasks").and_then(Value::as_array) {
            for (task_idx, task) in tasks.iter().enumerate() {
                for (ref_idx, actor_ref) in string_array_entries(task.get("actorRefs")) {
                    self.check_id_ref(
                        actor_ref,
                        &actor_ids,
                        "actors",
                        format!("$.tasks[{task_idx}].actorRefs[{ref_idx}]"),
                    );
                }
            }
        }

        if let Some(units) = self.doc.get("units").and_then(Value::as_array) {
            for (unit_idx, unit) in units.iter().enumerate() {
                if let Some(actor_ref) = unit.get("actorRef").and_then(Value::as_str) {
                    self.check_id_ref(
                        actor_ref,
                        &actor_ids,
                        "actors",
                        format!("$.units[{unit_idx}].actorRef"),
                    );
                }
                for (ref_idx, task_ref) in string_array_entries(unit.get("taskRefs")) {
                    self.check_id_ref(
                        task_ref,
                        &task_ids,
                        "tasks",
                        format!("$.units[{unit_idx}].taskRefs[{ref_idx}]"),
                    );
                }
                for (ref_idx, actor_ref) in
                    string_array_entries(unit.pointer("/applicability/actorRefs"))
                {
                    self.check_id_ref(
                        actor_ref,
                        &actor_ids,
                        "actors",
                        format!("$.units[{unit_idx}].applicability.actorRefs[{ref_idx}]"),
                    );
                }
            }
        }
    }

    fn check_id_ref(&mut self, id_ref: &str, ids: &HashSet<String>, target: &str, path: String) {
        if !ids.contains(id_ref) {
            self.diagnostics.push(warning(
                crate::LintCode::W1701,
                PASS,
                path,
                format!("Experience reference {id_ref:?} does not resolve in {target}"),
            ));
        }
    }

    fn check_item_refs(&mut self) {
        let Some(index) = self.definition_index.as_ref() else {
            return;
        };
        if let Some(units) = self.doc.get("units").and_then(Value::as_array) {
            for (unit_idx, unit) in units.iter().enumerate() {
                let Some(item_refs) = unit.get("itemRefs").and_then(Value::as_array) else {
                    continue;
                };
                for (ref_idx, item_ref) in item_refs.iter().enumerate() {
                    let Some(path) = item_ref.get("path").and_then(Value::as_str) else {
                        continue;
                    };
                    let normalized = normalize_item_path(path);
                    if !index.by_full_path.contains_key(&normalized) {
                        self.diagnostics.push(warning(
                            crate::LintCode::W1702,
                            PASS,
                            format!("$.units[{unit_idx}].itemRefs[{ref_idx}].path"),
                            format!("Experience ItemRef.path {path:?} does not resolve in the paired Definition"),
                        ));
                    }
                }
            }
        }
    }

    fn check_coverage(&mut self) {
        let Some(index) = self.definition_index.as_ref() else {
            return;
        };
        let bind_meta = bind_meta_by_resolved_path(self.definition, index);
        let covered = covered_item_refs(self.doc);

        let mut required = bind_meta
            .iter()
            .filter_map(|(path, meta)| {
                let item = self.definition_items.get(path)?;
                if !item.is_field || item.inside_optional_repeat {
                    return None;
                }
                if trimmed_literal(meta.required.as_deref()) != Some("true") {
                    return None;
                }
                if has_static_false_relevance(path, &bind_meta) {
                    return None;
                }
                Some(item.canonical_path.clone())
            })
            .collect::<Vec<_>>();
        required.sort();
        required.dedup();

        for path in required {
            if !covered.contains(&path) {
                self.diagnostics.push(warning(
                    crate::LintCode::W1703,
                    PASS,
                    "$.units",
                    format!(
                        "Required visible item {path:?} is not referenced by any Experience unit.itemRefs"
                    ),
                ));
            }
        }
    }
}

#[derive(Debug, Clone)]
struct BindMeta {
    required: Option<String>,
    relevant: Option<String>,
}

#[derive(Debug, Clone)]
struct DefinitionItemInfo {
    canonical_path: String,
    is_field: bool,
    inside_optional_repeat: bool,
}

fn collect_ids(values: Option<&Vec<Value>>) -> HashSet<String> {
    values
        .into_iter()
        .flatten()
        .filter_map(|value| value.get("id").and_then(Value::as_str))
        .map(str::to_string)
        .collect()
}

fn string_array_entries(value: Option<&Value>) -> Vec<(usize, &str)> {
    value
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .enumerate()
        .filter_map(|(idx, value)| value.as_str().map(|s| (idx, s)))
        .collect()
}

fn bind_meta_by_resolved_path(
    definition: Option<&Value>,
    index: &tree::ItemTreeIndex,
) -> HashMap<String, BindMeta> {
    let mut out = HashMap::new();
    let Some(definition) = definition else {
        return out;
    };
    let Some(binds) = definition.get("binds").and_then(Value::as_array) else {
        return out;
    };
    for bind in binds {
        let Some(path) = bind.get("path").and_then(Value::as_str) else {
            continue;
        };
        let normalized = normalize_item_path(path);
        let Some(item) = index.by_full_path.get(&normalized) else {
            continue;
        };
        out.insert(
            item.full_path.clone(),
            BindMeta {
                required: bind
                    .get("required")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                relevant: bind
                    .get("relevant")
                    .and_then(Value::as_str)
                    .map(str::to_string),
            },
        );
    }
    out
}

fn has_static_false_relevance(path: &str, bind_meta: &HashMap<String, BindMeta>) -> bool {
    let mut current = String::new();
    for segment in path.split('.') {
        if current.is_empty() {
            current.push_str(segment);
        } else {
            current.push('.');
            current.push_str(segment);
        }
        if trimmed_literal(
            bind_meta
                .get(&current)
                .and_then(|meta| meta.relevant.as_deref()),
        ) == Some("false")
        {
            return true;
        }
    }
    false
}

fn trimmed_literal(value: Option<&str>) -> Option<&str> {
    value.map(str::trim)
}

fn covered_item_refs(experience: &Value) -> HashSet<String> {
    let mut paths = HashSet::new();
    if let Some(units) = experience.get("units").and_then(Value::as_array) {
        for unit in units {
            let Some(item_refs) = unit.get("itemRefs").and_then(Value::as_array) else {
                continue;
            };
            for item_ref in item_refs {
                if let Some(path) = item_ref.get("path").and_then(Value::as_str) {
                    paths.insert(path.to_string());
                }
            }
        }
    }
    paths
}

fn normalize_item_path(path: &str) -> String {
    let mut out = String::with_capacity(path.len());
    let mut in_brackets = false;
    for ch in path.chars() {
        match ch {
            '[' => in_brackets = true,
            ']' => in_brackets = false,
            _ if !in_brackets => out.push(ch),
            _ => {}
        }
    }
    out
}

fn definition_items(definition: &Value) -> HashMap<String, DefinitionItemInfo> {
    let optional_repeat_groups = optional_repeat_groups(definition);
    let repeat_groups = repeat_groups(definition);
    let mut out = HashMap::new();
    visit_definition_items_from_document(definition, &mut |ctx| {
        let inside_optional_repeat = ancestors(&ctx.dotted_path)
            .iter()
            .any(|path| optional_repeat_groups.contains(path));
        out.insert(
            ctx.dotted_path.clone(),
            DefinitionItemInfo {
                canonical_path: canonical_path(&ctx.dotted_path, &repeat_groups),
                is_field: ctx.item.get("type").and_then(Value::as_str) == Some("field"),
                inside_optional_repeat,
            },
        );
    });
    out
}

fn optional_repeat_groups(definition: &Value) -> HashSet<String> {
    let mut out = HashSet::new();
    visit_definition_items_from_document(definition, &mut |ctx| {
        let repeatable = ctx
            .item
            .get("repeatable")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let min_repeat = ctx
            .item
            .get("minRepeat")
            .and_then(Value::as_u64)
            .unwrap_or(0);
        if repeatable && min_repeat == 0 {
            out.insert(ctx.dotted_path.clone());
        }
    });
    out
}

fn repeat_groups(definition: &Value) -> HashSet<String> {
    let mut out = HashSet::new();
    visit_definition_items_from_document(definition, &mut |ctx| {
        let repeatable = ctx
            .item
            .get("repeatable")
            .and_then(Value::as_bool)
            .unwrap_or(false)
            || ctx.item.get("repeat").is_some();
        if repeatable {
            out.insert(ctx.dotted_path.clone());
        }
    });
    out
}

fn ancestors(path: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    for segment in path.split('.') {
        if current.is_empty() {
            current.push_str(segment);
        } else {
            current.push('.');
            current.push_str(segment);
        }
        out.push(current.clone());
    }
    out
}

fn canonical_path(path: &str, repeat_groups: &HashSet<String>) -> String {
    let mut current = String::new();
    let mut out = Vec::new();
    for segment in path.split('.') {
        if current.is_empty() {
            current.push_str(segment);
        } else {
            current.push('.');
            current.push_str(segment);
        }
        if repeat_groups.contains(&current) {
            out.push(format!("{segment}[*]"));
        } else {
            out.push(segment.to_string());
        }
    }
    out.join(".")
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;
    use serde_json::json;

    fn definition() -> Value {
        json!({
            "$formspec": "1.0",
            "url": "https://example.gov/forms/experience",
            "version": "1.0.0",
            "status": "active",
            "title": "Experience parity",
            "items": [
                { "key": "applicantName", "type": "field", "label": "Name", "dataType": "string" },
                {
                    "key": "household",
                    "type": "group",
                    "children": [
                        {
                            "key": "members",
                            "type": "group",
                            "repeatable": true,
                            "minRepeat": 1,
                            "children": [
                                { "key": "firstName", "type": "field", "label": "First", "dataType": "string" }
                            ]
                        }
                    ]
                },
                {
                    "key": "optionalUploads",
                    "type": "group",
                    "repeatable": true,
                    "minRepeat": 0,
                    "children": [
                        { "key": "file", "type": "field", "label": "File", "dataType": "attachment" }
                    ]
                },
                { "key": "hiddenCode", "type": "field", "label": "Hidden", "dataType": "string" }
            ],
            "binds": [
                { "path": "applicantName", "required": "true" },
                { "path": "household.members[*].firstName", "required": "true" },
                { "path": "optionalUploads[*].file", "required": "true" },
                { "path": "hiddenCode", "required": "true", "relevant": "false" }
            ]
        })
    }

    fn clean_experience() -> Value {
        json!({
            "$formspecExperience": "1.0",
            "version": "1.0.0",
            "targetDefinition": {
                "url": "https://example.gov/forms/experience",
                "compatibleVersions": "^1.0.0"
            },
            "actors": [{ "id": "applicant" }],
            "tasks": [{ "id": "identify", "actorRefs": ["applicant"] }],
            "applicability": { "actorRefs": ["applicant"] },
            "units": [
                {
                    "id": "identity",
                    "kind": "data-entry",
                    "actorRef": "applicant",
                    "taskRefs": ["identify"],
                    "itemRefs": [
                        { "path": "applicantName" },
                        { "path": "household.members[*].firstName" }
                    ]
                }
            ]
        })
    }

    #[test]
    fn clean_experience_has_no_semantic_diagnostics() {
        let diagnostics = lint_experience(&clean_experience(), Some(&definition()));
        assert!(diagnostics.is_empty(), "got {diagnostics:?}");
    }

    #[test]
    fn dangling_refs_and_uncovered_required_items_are_reported() {
        let mut experience = clean_experience();
        experience["targetDefinition"]["url"] = json!("https://example.gov/forms/other");
        experience["targetDefinition"]["compatibleVersions"] = json!("^2.0.0");
        experience["applicability"]["actorRefs"] = json!(["ghost"]);
        experience["tasks"][0]["actorRefs"] = json!(["ghost"]);
        experience["units"][0]["actorRef"] = json!("ghost");
        experience["units"][0]["taskRefs"] = json!(["missingTask"]);
        experience["units"][0]["applicability"] = json!({ "actorRefs": ["missingUnitActor"] });
        experience["units"][0]["itemRefs"] = json!([{ "path": "nonexistentField" }]);

        let diagnostics = lint_experience(&experience, Some(&definition()));
        let codes = diagnostics
            .iter()
            .map(|diag| diag.code)
            .collect::<HashSet<_>>();

        assert!(codes.contains(&crate::LintCode::E1700));
        assert!(codes.contains(&crate::LintCode::W1700));
        assert!(codes.contains(&crate::LintCode::W1701));
        assert!(codes.contains(&crate::LintCode::W1702));
        assert!(codes.contains(&crate::LintCode::W1703));
    }

    #[test]
    fn required_repeat_children_use_canonical_wildcard_paths() {
        let diagnostics = lint_experience(&clean_experience(), Some(&definition()));
        assert!(
            !diagnostics.iter().any(|diag| {
                diag.code == crate::LintCode::W1703 && diag.message.contains("household.members")
            }),
            "canonical repeat coverage should be satisfied: {diagnostics:?}"
        );
    }
}

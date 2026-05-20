//! Pass 9: References document semantic checks.
#![allow(clippy::missing_docs_in_private_items)]

use std::collections::{HashMap, HashSet};

use serde_json::Value;

use crate::semantic_helpers::{
    compatible_version_satisfied, definition_url, definition_version, error, json_path_member,
    normalized_segments, parse_form_path, resolve_item_path, target_definition_compatible_versions,
    target_definition_url, warning,
};
use crate::tree;
use crate::types::LintDiagnostic;

pub(crate) const PASS: u8 = 9;

const KNOWN_TYPES: &[&str] = &[
    "documentation",
    "example",
    "regulation",
    "policy",
    "glossary",
    "schema",
    "vector-store",
    "knowledge-base",
    "retrieval",
    "tool",
    "api",
    "context",
];

const KNOWN_RELS: &[&str] = &[
    "authorizes",
    "constrains",
    "defines",
    "exemplifies",
    "supersedes",
    "superseded-by",
    "derived-from",
    "see-also",
];

pub(crate) fn lint_references_doc(doc: &Value, definition: Option<&Value>) -> Vec<LintDiagnostic> {
    let mut analyzer = Analyzer {
        doc,
        definition,
        definition_index: definition.map(tree::build_item_index),
        reference_defs: doc
            .get("referenceDefs")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default(),
        diagnostics: Vec::new(),
    };
    analyzer.check_target_definition();
    analyzer.check_reference_defs();
    analyzer.check_bound_references();
    analyzer.diagnostics
}

struct Analyzer<'a> {
    doc: &'a Value,
    definition: Option<&'a Value>,
    definition_index: Option<tree::ItemTreeIndex>,
    reference_defs: serde_json::Map<String, Value>,
    diagnostics: Vec<LintDiagnostic>,
}

impl<'a> Analyzer<'a> {
    fn check_target_definition(&mut self) {
        let Some(definition) = self.definition else {
            return;
        };
        if let (Some(target_url), Some(def_url)) =
            (target_definition_url(self.doc), definition_url(definition))
            && target_url != def_url
        {
            self.diagnostics.push(error(
                crate::LintCode::E1310,
                PASS,
                "$.targetDefinition.url",
                format!(
                    "References targetDefinition.url ({target_url:?}) does not match paired Definition url ({def_url:?})"
                ),
            ));
        }
        if let (Some(range), Some(version)) = (
            target_definition_compatible_versions(self.doc),
            definition_version(definition),
        ) && compatible_version_satisfied(range, version) != Some(true)
        {
            self.diagnostics.push(warning(
                crate::LintCode::W1310,
                PASS,
                "$.targetDefinition.compatibleVersions",
                format!(
                    "References compatibleVersions ({range:?}) does not confidently include paired Definition version ({version:?})"
                ),
            ));
        }
    }

    fn check_reference_defs(&mut self) {
        let mut ids: HashMap<String, String> = HashMap::new();
        let entries = self
            .reference_defs
            .iter()
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect::<Vec<_>>();
        for (key, reference) in entries {
            let json_path = json_path_member("$.referenceDefs", &key);
            if let Some(id) = reference.get("id").and_then(Value::as_str) {
                if id != key {
                    self.diagnostics.push(error(
                        crate::LintCode::E1301,
                        PASS,
                        json_path_member(&json_path, "id"),
                        format!("referenceDefs key {key:?} has mismatched id {id:?}"),
                    ));
                }
                self.record_id(&mut ids, id, json_path_member(&json_path, "id"));
            }
            self.check_reference_fields(&reference, &json_path);
        }

        let Some(references) = self.doc.get("references").and_then(Value::as_array) else {
            return;
        };
        for (i, reference) in references.iter().enumerate() {
            if let Some(id) = reference.get("id").and_then(Value::as_str) {
                self.record_id(&mut ids, id, format!("$.references[{i}].id"));
            }
        }
    }

    fn record_id(&mut self, seen: &mut HashMap<String, String>, id: &str, path: String) {
        if let Some(first) = seen.insert(id.to_string(), path.clone()) {
            self.diagnostics.push(error(
                crate::LintCode::E1302,
                PASS,
                path,
                format!("Duplicate authored reference id {id:?}; first seen at {first}"),
            ));
        }
    }

    fn check_bound_references(&mut self) {
        let Some(references) = self.doc.get("references").and_then(Value::as_array) else {
            return;
        };
        for (i, bound) in references.iter().enumerate() {
            let base_path = format!("$.references[{i}]");
            if let Some(pointer) = bound.get("$ref").and_then(Value::as_str) {
                self.check_ref_pointer(pointer, &base_path);
            }
            self.check_target(bound, &base_path);
            self.check_reference_fields(bound, &base_path);
        }
    }

    fn check_ref_pointer(&mut self, pointer: &str, base_path: &str) {
        let Some(key) = pointer.strip_prefix("#/referenceDefs/") else {
            self.diagnostics.push(error(
                crate::LintCode::E1300,
                PASS,
                format!("{base_path}.$ref"),
                format!("References $ref {pointer:?} must point into #/referenceDefs"),
            ));
            return;
        };
        let key = key.replace("~1", "/").replace("~0", "~");
        if !self.reference_defs.contains_key(&key) {
            self.diagnostics.push(error(
                crate::LintCode::E1300,
                PASS,
                format!("{base_path}.$ref"),
                format!("References $ref points to missing referenceDefs entry {key:?}"),
            ));
        }
    }

    fn check_target(&mut self, bound: &Value, base_path: &str) {
        let Some(target) = bound.get("target").and_then(Value::as_str) else {
            return;
        };
        match parse_form_path(target, true) {
            Ok(segments) => {
                if let Some(index) = self.definition_index.as_ref() {
                    match resolve_item_path(target, index, true) {
                        Ok(Some(_)) | Ok(None) if target == "#" => {}
                        Ok(None) => self.diagnostics.push(warning(
                            crate::LintCode::W1311,
                            PASS,
                            format!("{base_path}.target"),
                            format!(
                                "References target {target:?} does not resolve to a Definition item path"
                            ),
                        )),
                        Err(err) => self.diagnostics.push(error(
                            crate::LintCode::E1303,
                            PASS,
                            format!("{base_path}.target"),
                            err,
                        )),
                        _ => {}
                    }
                }
                let _normalized = normalized_segments(&segments);
            }
            Err(err) => self.diagnostics.push(error(
                crate::LintCode::E1303,
                PASS,
                format!("{base_path}.target"),
                format!("Invalid References target path syntax: {err}"),
            )),
        }
    }

    fn check_reference_fields(&mut self, reference: &Value, base_path: &str) {
        if let Some(value) = reference.get("type").and_then(Value::as_str)
            && !KNOWN_TYPES.contains(&value)
            && !value.starts_with("x-")
        {
            self.diagnostics.push(warning(
                crate::LintCode::W1300,
                PASS,
                format!("{base_path}.type"),
                format!("References type {value:?} is not known and is not x-prefixed"),
            ));
        }
        if let Some(value) = reference.get("rel").and_then(Value::as_str)
            && !KNOWN_RELS.contains(&value)
            && !value.starts_with("x-")
        {
            self.diagnostics.push(warning(
                crate::LintCode::W1301,
                PASS,
                format!("{base_path}.rel"),
                format!("References rel {value:?} is not known and is not x-prefixed"),
            ));
        }

        let static_fields: HashSet<&str> = [
            "id",
            "type",
            "audience",
            "title",
            "uri",
            "mediaType",
            "language",
            "priority",
            "rel",
            "selector",
        ]
        .into_iter()
        .collect();
        if let Some(map) = reference.as_object() {
            for (key, value) in map {
                if !static_fields.contains(key.as_str()) {
                    continue;
                }
                let Some(text) = value.as_str() else {
                    continue;
                };
                if crate::semantic_helpers::looks_like_fel(text) {
                    self.diagnostics.push(error(
                        crate::LintCode::E1304,
                        PASS,
                        json_path_member(base_path, key),
                        "References static field appears to contain a FEL expression",
                    ));
                }
            }
        }
    }
}

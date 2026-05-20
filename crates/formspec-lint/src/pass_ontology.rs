//! Pass 9: Ontology document semantic checks and static-analysis facts.
#![allow(clippy::missing_docs_in_private_items)]
#![allow(missing_docs)]
#![allow(dead_code)]

use std::collections::HashSet;

use serde_json::Value;

use crate::semantic_helpers::{
    compatible_version_satisfied, definition_url, definition_version, error, json_path_member,
    normalized_segments, option_set_values, parse_form_path, resolve_item_path,
    target_definition_compatible_versions, target_definition_url, warning,
};
use crate::tree;
use crate::types::LintDiagnostic;

pub(crate) const PASS: u8 = 9;

#[derive(Debug, Clone)]
pub struct OntologyPathFact {
    pub path: String,
    pub normalized_segments: Vec<String>,
    pub resolved_item_path: Option<String>,
}

#[derive(Debug, Clone)]
pub struct OntologyVocabularyFact {
    pub option_set: String,
    pub resolved: bool,
    pub resolved_values: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct OntologyConceptSystemFact {
    pub path: String,
    pub declared_system: Option<String>,
    pub effective_system: Option<String>,
    pub uses_default_system: bool,
}

#[derive(Debug, Clone)]
pub struct OntologyStaticAnalysis {
    pub default_system: Option<String>,
    pub concept_paths: Vec<OntologyPathFact>,
    pub alignment_paths: Vec<OntologyPathFact>,
    pub concept_systems: Vec<OntologyConceptSystemFact>,
    pub vocabularies: Vec<OntologyVocabularyFact>,
    pub diagnostics: Vec<LintDiagnostic>,
}

pub fn lint_ontology(ontology: &Value, definition: Option<&Value>) -> Vec<LintDiagnostic> {
    analyze_ontology(ontology, definition).diagnostics
}

pub fn analyze_ontology(ontology: &Value, definition: Option<&Value>) -> OntologyStaticAnalysis {
    let definition_index = definition.map(tree::build_item_index);
    let option_sets = definition.map(option_set_values).unwrap_or_default();
    let mut analyzer = Analyzer {
        ontology,
        definition,
        definition_index,
        option_sets,
        default_system: ontology
            .get("defaultSystem")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        concept_paths: Vec::new(),
        alignment_paths: Vec::new(),
        concept_systems: Vec::new(),
        vocabularies: Vec::new(),
        diagnostics: Vec::new(),
    };
    analyzer.check_target_definition();
    analyzer.check_concepts();
    analyzer.check_vocabularies();
    analyzer.check_alignments();
    analyzer.scan_static_values();

    OntologyStaticAnalysis {
        default_system: analyzer.default_system,
        concept_paths: analyzer.concept_paths,
        alignment_paths: analyzer.alignment_paths,
        concept_systems: analyzer.concept_systems,
        vocabularies: analyzer.vocabularies,
        diagnostics: analyzer.diagnostics,
    }
}

struct Analyzer<'a> {
    ontology: &'a Value,
    definition: Option<&'a Value>,
    definition_index: Option<tree::ItemTreeIndex>,
    option_sets: std::collections::HashMap<String, HashSet<String>>,
    default_system: Option<String>,
    concept_paths: Vec<OntologyPathFact>,
    alignment_paths: Vec<OntologyPathFact>,
    concept_systems: Vec<OntologyConceptSystemFact>,
    vocabularies: Vec<OntologyVocabularyFact>,
    diagnostics: Vec<LintDiagnostic>,
}

impl<'a> Analyzer<'a> {
    fn check_target_definition(&mut self) {
        let Some(definition) = self.definition else {
            return;
        };
        if let (Some(target_url), Some(def_url)) = (
            target_definition_url(self.ontology),
            definition_url(definition),
        ) && target_url != def_url
        {
            self.diagnostics.push(error(
                crate::LintCode::E1201,
                PASS,
                "$.targetDefinition.url",
                format!(
                    "Ontology targetDefinition.url ({target_url:?}) does not match paired Definition url ({def_url:?})"
                ),
            ));
        }
        if let (Some(range), Some(version)) = (
            target_definition_compatible_versions(self.ontology),
            definition_version(definition),
        ) && compatible_version_satisfied(range, version) != Some(true)
        {
            self.diagnostics.push(warning(
                crate::LintCode::W1200,
                PASS,
                "$.targetDefinition.compatibleVersions",
                format!(
                    "Ontology compatibleVersions ({range:?}) does not confidently include paired Definition version ({version:?})"
                ),
            ));
        }
    }

    fn check_concepts(&mut self) {
        let Some(concepts) = self.ontology.get("concepts").and_then(Value::as_object) else {
            return;
        };
        for (path, binding) in concepts {
            let json_path = json_path_member("$.concepts", path);
            let declared_system = binding.get("system").and_then(Value::as_str);
            let effective_system = declared_system
                .or(self.default_system.as_deref())
                .map(ToOwned::to_owned);
            let uses_default_system = declared_system.is_none() && self.default_system.is_some();
            match parse_form_path(path, false) {
                Ok(segments) => {
                    let mut fact = OntologyPathFact {
                        path: path.clone(),
                        normalized_segments: normalized_segments(&segments),
                        resolved_item_path: None,
                    };
                    if let Some(index) = self.definition_index.as_ref() {
                        match resolve_item_path(path, index, false) {
                            Ok(Some(item)) => {
                                fact.resolved_item_path = Some(item.full_path.clone());
                            }
                            Ok(None) => self.diagnostics.push(warning(
                                crate::LintCode::W1201,
                                PASS,
                                json_path.clone(),
                                format!(
                                    "Ontology concepts key {path:?} does not resolve to a Definition item path"
                                ),
                            )),
                            Err(err) => self.diagnostics.push(error(
                                crate::LintCode::E1200,
                                PASS,
                                json_path.clone(),
                                err,
                            )),
                        }
                    }
                    self.concept_paths.push(fact);
                }
                Err(err) => self.diagnostics.push(error(
                    crate::LintCode::E1200,
                    PASS,
                    json_path.clone(),
                    format!("Invalid Ontology concept path syntax: {err}"),
                )),
            }

            self.concept_systems.push(OntologyConceptSystemFact {
                path: path.clone(),
                declared_system: declared_system.map(ToOwned::to_owned),
                effective_system,
                uses_default_system,
            });

            if declared_system.is_none() {
                if self.default_system.is_some() {
                    self.diagnostics.push(warning(
                        crate::LintCode::W1205,
                        PASS,
                        json_path_member(&json_path, "system"),
                        "Ontology concept omits system and will use defaultSystem",
                    ));
                } else {
                    self.diagnostics.push(warning(
                        crate::LintCode::W1206,
                        PASS,
                        json_path_member(&json_path, "system"),
                        "Ontology concept omits system and no defaultSystem is available",
                    ));
                }
            }
        }
    }

    fn check_vocabularies(&mut self) {
        let Some(vocabularies) = self.ontology.get("vocabularies").and_then(Value::as_object)
        else {
            return;
        };
        for (name, binding) in vocabularies {
            let json_path = json_path_member("$.vocabularies", name);
            let resolved_values = self
                .option_sets
                .get(name)
                .map(|values| values.iter().cloned().collect::<Vec<_>>())
                .unwrap_or_default();
            if self.definition.is_some() && !self.option_sets.contains_key(name) {
                self.diagnostics.push(warning(
                    crate::LintCode::W1203,
                    PASS,
                    json_path.clone(),
                    format!("Ontology vocabulary {name:?} does not resolve to a Definition optionSets key"),
                ));
            }
            if let Some(value_map) = binding.get("valueMap").and_then(Value::as_object) {
                for key in value_map.keys() {
                    if let Some(values) = self.option_sets.get(name)
                        && !values.contains(key)
                    {
                        self.diagnostics.push(warning(
                            crate::LintCode::W1204,
                            PASS,
                            json_path_member(&json_path_member(&json_path, "valueMap"), key),
                            format!(
                                "Ontology valueMap key {key:?} does not resolve to an option value in option set {name:?}"
                            ),
                        ));
                    }
                }
            }
            self.vocabularies.push(OntologyVocabularyFact {
                option_set: name.clone(),
                resolved: self.option_sets.contains_key(name),
                resolved_values,
            });
        }
    }

    fn check_alignments(&mut self) {
        let Some(alignments) = self.ontology.get("alignments").and_then(Value::as_array) else {
            return;
        };
        for (i, alignment) in alignments.iter().enumerate() {
            let Some(path) = alignment.get("field").and_then(Value::as_str) else {
                continue;
            };
            let json_path = format!("$.alignments[{i}].field");
            match parse_form_path(path, false) {
                Ok(segments) => {
                    let mut fact = OntologyPathFact {
                        path: path.to_string(),
                        normalized_segments: normalized_segments(&segments),
                        resolved_item_path: None,
                    };
                    if let Some(index) = self.definition_index.as_ref() {
                        match resolve_item_path(path, index, false) {
                            Ok(Some(item)) => {
                                fact.resolved_item_path = Some(item.full_path.clone());
                            }
                            Ok(None) => self.diagnostics.push(warning(
                                crate::LintCode::W1202,
                                PASS,
                                json_path.clone(),
                                format!(
                                    "Ontology alignment field {path:?} does not resolve to a Definition item path"
                                ),
                            )),
                            Err(err) => self.diagnostics.push(error(
                                crate::LintCode::E1200,
                                PASS,
                                json_path.clone(),
                                err,
                            )),
                        }
                    }
                    self.alignment_paths.push(fact);
                }
                Err(err) => self.diagnostics.push(error(
                    crate::LintCode::E1200,
                    PASS,
                    json_path,
                    format!("Invalid Ontology alignment field syntax: {err}"),
                )),
            }
        }
    }

    fn scan_static_values(&mut self) {
        let mut visitor = |path: String, value: &Value| {
            let Some(text) = value.as_str() else {
                return;
            };
            if crate::semantic_helpers::looks_like_fel(text) {
                self.diagnostics.push(error(
                    crate::LintCode::E1202,
                    PASS,
                    path,
                    "Ontology static value appears to contain a FEL expression",
                ));
            }
        };
        visit_static_strings(self.ontology, "$", &mut visitor);
    }
}

fn visit_static_strings<F>(value: &Value, path: &str, visit: &mut F)
where
    F: FnMut(String, &Value),
{
    match value {
        Value::Object(map) => {
            for (key, child) in map {
                if key.starts_with("x-") || key == "description" || key == "notes" {
                    continue;
                }
                if path == "$.context" && key == "@context" {
                    continue;
                }
                visit_static_strings(child, &json_path_member(path, key), visit);
            }
        }
        Value::Array(values) => {
            for (i, child) in values.iter().enumerate() {
                visit_static_strings(child, &format!("{path}[{i}]"), visit);
            }
        }
        Value::String(_) => visit(path.to_string(), value),
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]

    use serde_json::Value;

    use super::*;

    fn fixture_with_definition(fixture: &str) -> (Value, Value) {
        let mut document: Value = serde_json::from_str(fixture).expect("fixture is valid JSON");
        let definition = document
            .as_object_mut()
            .expect("fixture root is an object")
            .remove("_pairedDefinition")
            .expect("fixture carries paired definition");
        (document, definition)
    }

    #[test]
    fn json_ld_context_keywords_do_not_look_like_fel() {
        let (ontology, definition) = fixture_with_definition(include_str!(
            "../../../tests/fixtures/lint/valid-ontology-semantic.json"
        ));

        let analysis = analyze_ontology(&ontology, Some(&definition));

        assert!(
            !analysis
                .diagnostics
                .iter()
                .any(|diag| diag.code == crate::LintCode::E1202),
            "JSON-LD @context keywords should not emit E1202: {:?}",
            analysis.diagnostics
        );
    }

    #[test]
    fn analysis_exposes_effective_concept_systems() {
        let (ontology, definition) = fixture_with_definition(include_str!(
            "../../../tests/fixtures/lint/W1205-ontology-default-system.json"
        ));

        let analysis = analyze_ontology(&ontology, Some(&definition));

        assert_eq!(
            analysis.default_system.as_deref(),
            Some("https://schema.org")
        );
        let name_system = analysis
            .concept_systems
            .iter()
            .find(|fact| fact.path == "name")
            .expect("fixture has name concept");
        assert_eq!(name_system.declared_system, None);
        assert_eq!(
            name_system.effective_system.as_deref(),
            Some("https://schema.org")
        );
        assert!(name_system.uses_default_system);
    }
}

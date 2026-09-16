//! Pass 9: Ontology document semantic checks and static-analysis facts.
#![allow(clippy::missing_docs_in_private_items)]
#![allow(missing_docs)]
#![allow(dead_code)]

use std::collections::{HashMap, HashSet};

use formspec_core::{
    JsonLdDerivation, JsonLdDiagnosticKind, derive_json_ld_context, jsonld_context::XSD_NAMESPACE,
};
use serde_json::{Map, Value};

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
    /// JSON-LD context derived from the bindings (Ontology §6.2); `None` without a paired Definition.
    pub derived_context: Option<JsonLdDerivation>,
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
        derived_context: None,
        diagnostics: Vec::new(),
    };
    analyzer.check_target_definition();
    analyzer.check_concepts();
    analyzer.check_duplicate_concept_keys();
    analyzer.check_vocabularies();
    analyzer.check_alignments();
    analyzer.check_context();
    analyzer.scan_static_values();

    OntologyStaticAnalysis {
        default_system: analyzer.default_system,
        concept_paths: analyzer.concept_paths,
        alignment_paths: analyzer.alignment_paths,
        concept_systems: analyzer.concept_systems,
        vocabularies: analyzer.vocabularies,
        derived_context: analyzer.derived_context,
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
    derived_context: Option<JsonLdDerivation>,
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

    /// W1213: two `concepts` keys resolve to one Definition item (`items.amount` beside
    /// `items[*].amount`). The derivation reads the `[*]` key; the other is dead.
    fn check_duplicate_concept_keys(&mut self) {
        let mut by_item: HashMap<&str, Vec<&str>> = HashMap::new();
        for fact in &self.concept_paths {
            if let Some(item) = fact.resolved_item_path.as_deref() {
                by_item.entry(item).or_default().push(fact.path.as_str());
            }
        }
        let mut duplicates: Vec<(String, String)> = Vec::new();
        for keys in by_item.values() {
            let Some(wildcard) = keys.iter().find(|key| key.contains("[*]")) else {
                continue;
            };
            for key in keys.iter().filter(|key| *key != wildcard) {
                duplicates.push((key.to_string(), wildcard.to_string()));
            }
        }
        duplicates.sort();
        for (key, wildcard) in duplicates {
            self.diagnostics.push(warning(
                crate::LintCode::W1213,
                PASS,
                json_path_member("$.concepts", &key),
                format!(
                    "Ontology concepts key {key:?} binds the same item as {wildcard:?}; the [*] key is used"
                ),
            ));
        }
    }

    /// Ontology §6.2: derive the JSON-LD context, surface what the derivation could not honor,
    /// and diff an authored `context.@context` object against it term by term.
    fn check_context(&mut self) {
        let Some(definition) = self.definition else {
            return;
        };
        let derived = derive_json_ld_context(definition, self.ontology);
        for diagnostic in &derived.diagnostics {
            let (code, message) = match diagnostic.kind {
                JsonLdDiagnosticKind::Collision => (
                    crate::LintCode::W1210,
                    format!(
                        "JSON-LD context: key {:?} at {:?} collides with the term already defined for {} in the same scope; the later term is omitted",
                        diagnostic.key,
                        diagnostic.path,
                        diagnostic
                            .existing_id
                            .as_deref()
                            .unwrap_or("an unbound leaf")
                    ),
                ),
                JsonLdDiagnosticKind::UnboundRepeatable => (
                    crate::LintCode::W1211,
                    format!(
                        "JSON-LD context: binding at {:?} is lost because its enclosing repeatable group has no concept binding",
                        diagnostic.path
                    ),
                ),
                JsonLdDiagnosticKind::UnsupportedType => (
                    crate::LintCode::W1212,
                    format!(
                        "JSON-LD context: binding at {:?} is omitted; attachment values have no JSON-LD representation",
                        diagnostic.path
                    ),
                ),
            };
            let path = self
                .concept_key_for_item(&diagnostic.path)
                .map(|key| json_path_member("$.concepts", &key))
                .unwrap_or_else(|| "$.concepts".to_string());
            self.diagnostics.push(warning(code, PASS, path, message));
        }

        if let Some(authored) = self
            .ontology
            .get("context")
            .and_then(|context| context.get("@context"))
            .and_then(Value::as_object)
            && let Some(derived_terms) = derived.context.as_object()
        {
            let prefixes = context_prefixes(authored);
            let mut diagnostics = Vec::new();
            diff_context_terms(
                derived_terms,
                authored,
                "$.context.@context",
                &prefixes,
                &mut diagnostics,
            );
            self.diagnostics.extend(diagnostics);
        }
        self.derived_context = Some(derived);
    }

    /// The `concepts` key that binds the item at `dotted_path`, preferring the `[*]` key.
    fn concept_key_for_item(&self, dotted_path: &str) -> Option<String> {
        let mut candidates = self
            .concept_paths
            .iter()
            .filter(|fact| fact.resolved_item_path.as_deref() == Some(dotted_path))
            .map(|fact| fact.path.as_str());
        let first = candidates.next()?;
        Some(
            std::iter::once(first)
                .chain(candidates)
                .max_by_key(|key| key.contains("[*]"))
                .unwrap_or(first)
                .to_string(),
        )
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

/// Prefix → IRI map declared by an authored context (`"xsd": "http://…#"`), plus the derived `xsd`.
fn context_prefixes(context: &Map<String, Value>) -> HashMap<String, String> {
    let mut prefixes = HashMap::new();
    prefixes.insert("xsd".to_string(), XSD_NAMESPACE.to_string());
    for (term, value) in context {
        if let Some(iri) = value.as_str()
            && !term.starts_with('@')
            && !iri.starts_with('@')
            && iri.contains(':')
        {
            prefixes.insert(term.clone(), iri.to_string());
        }
    }
    prefixes
}

/// Expand `prefix:suffix` through `prefixes`; anything else is returned unchanged.
fn expand_compact_iri(value: &str, prefixes: &HashMap<String, String>) -> String {
    if let Some((prefix, suffix)) = value.split_once(':')
        && !suffix.starts_with("//")
        && let Some(iri) = prefixes.get(prefix)
    {
        return format!("{iri}{suffix}");
    }
    value.to_string()
}

/// A term definition in comparable form: `"iri"` → `{ "@id": iri }`, compact IRIs expanded,
/// nested `@context` split off so scopes diff term by term.
fn normalize_term(
    term: &Value,
    prefixes: &HashMap<String, String>,
) -> (Value, Option<Map<String, Value>>) {
    match term {
        Value::String(text) if !text.starts_with('@') => {
            let mut object = Map::new();
            object.insert(
                "@id".to_string(),
                Value::String(expand_compact_iri(text, prefixes)),
            );
            (Value::Object(object), None)
        }
        Value::Object(object) => {
            let mut core = Map::new();
            let mut nested = None;
            for (key, value) in object {
                match (key.as_str(), value) {
                    ("@context", Value::Object(scope)) => nested = Some(scope.clone()),
                    ("@id" | "@type", Value::String(text)) => {
                        core.insert(
                            key.clone(),
                            Value::String(expand_compact_iri(text, prefixes)),
                        );
                    }
                    _ => {
                        core.insert(key.clone(), value.clone());
                    }
                }
            }
            (Value::Object(core), nested)
        }
        other => (other.clone(), None),
    }
}

/// W1207 / W1208 / W1209 for one scope; recurses into scoped contexts both sides define.
fn diff_context_terms(
    derived: &Map<String, Value>,
    authored: &Map<String, Value>,
    json_path: &str,
    prefixes: &HashMap<String, String>,
    out: &mut Vec<LintDiagnostic>,
) {
    for (term, derived_term) in derived {
        let term_path = json_path_member(json_path, term);
        let Some(authored_term) = authored.get(term) else {
            out.push(warning(
                crate::LintCode::W1208,
                PASS,
                term_path,
                format!(
                    "Ontology context lacks derived term {term:?}: {}",
                    compact(derived_term)
                ),
            ));
            continue;
        };
        let (derived_core, derived_scope) = normalize_term(derived_term, prefixes);
        let (authored_core, authored_scope) = normalize_term(authored_term, prefixes);
        if derived_core != authored_core {
            out.push(warning(
                crate::LintCode::W1207,
                PASS,
                term_path.clone(),
                format!(
                    "Ontology context term {term:?} differs from the derived term {}",
                    compact(derived_term)
                ),
            ));
        }
        let scope_path = format!("{term_path}.@context");
        match (derived_scope, authored_scope) {
            (Some(derived_scope), Some(authored_scope)) => diff_context_terms(
                &derived_scope,
                &authored_scope,
                &scope_path,
                prefixes,
                out,
            ),
            (Some(derived_scope), None) => out.push(warning(
                crate::LintCode::W1208,
                PASS,
                scope_path,
                format!(
                    "Ontology context term {term:?} lacks the derived scoped context {}",
                    compact(&Value::Object(derived_scope))
                ),
            )),
            (None, Some(_)) => out.push(crate::metadata::with_metadata(LintDiagnostic::info(
                crate::LintCode::W1209,
                PASS,
                scope_path,
                format!("Ontology context term {term:?} carries a scoped context the derivation does not produce"),
            ))),
            (None, None) => {}
        }
    }
    for term in authored.keys() {
        if !derived.contains_key(term) {
            out.push(crate::metadata::with_metadata(LintDiagnostic::info(
                crate::LintCode::W1209,
                PASS,
                json_path_member(json_path, term),
                format!("Ontology context term {term:?} is authored only; the derivation does not produce it"),
            )));
        }
    }
}

/// Single-line JSON for diagnostic messages.
fn compact(value: &Value) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "?".to_string())
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

    use serde_json::{Value, json};

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

    fn codes(diags: &[LintDiagnostic], code: crate::LintCode) -> Vec<&LintDiagnostic> {
        diags.iter().filter(|diag| diag.code == code).collect()
    }

    fn context_fixture() -> (Value, Value) {
        let definition = json!({
            "$formspec": "1.0",
            "url": "https://example.com/forms/ctx",
            "version": "1.0.0",
            "items": [
                { "key": "dob", "type": "field", "dataType": "date" },
                { "key": "name", "type": "field", "dataType": "string" },
                { "key": "jobs", "type": "group", "repeatable": true, "children": [
                    { "key": "employer", "type": "field", "dataType": "string" }
                ]}
            ]
        });
        let ontology = json!({
            "$formspecOntology": "1.0",
            "version": "1.0.0",
            "targetDefinition": { "url": "https://example.com/forms/ctx" },
            "defaultSystem": "urn:c",
            "concepts": {
                "dob": { "concept": "urn:c:dob" },
                "name": { "concept": "urn:c:name" },
                "jobs": { "concept": "urn:c:job" },
                "jobs[*].employer": { "concept": "urn:c:employer" }
            }
        });
        (definition, ontology)
    }

    #[test]
    fn authored_context_is_diffed_against_the_derived_context() {
        let (definition, mut ontology) = context_fixture();
        ontology["context"] = json!({ "@context": {
            "@version": 1.1,
            "xsd": "http://www.w3.org/2001/XMLSchema#",
            "dob": { "@id": "urn:c:dob", "@type": "xsd:string" },
            "name": "urn:c:name",
            "id": "@id"
        }});

        let analysis = analyze_ontology(&ontology, Some(&definition));
        let diags = &analysis.diagnostics;

        let drift = codes(diags, crate::LintCode::W1207);
        assert_eq!(drift.len(), 1, "{diags:?}");
        assert_eq!(drift[0].path, "$.context.@context.dob");
        assert!(
            drift[0].message.contains("xsd:date"),
            "{}",
            drift[0].message
        );

        let missing = codes(diags, crate::LintCode::W1208);
        assert_eq!(missing.len(), 1, "{diags:?}");
        assert_eq!(missing[0].path, "$.context.@context.jobs");

        let extra = codes(diags, crate::LintCode::W1209);
        assert_eq!(extra.len(), 1, "{diags:?}");
        assert_eq!(extra[0].path, "$.context.@context.id");
        assert_eq!(extra[0].severity, crate::types::LintSeverity::Info);
    }

    #[test]
    fn scoped_contexts_are_diffed_term_by_term_and_prefixes_expand() {
        let (definition, mut ontology) = context_fixture();
        ontology["context"] = json!({ "@context": {
            "@version": 1.1,
            "xsd": "http://www.w3.org/2001/XMLSchema#",
            "dob": { "@id": "urn:c:dob", "@type": "http://www.w3.org/2001/XMLSchema#date" },
            "name": { "@id": "urn:c:name" },
            "jobs": { "@id": "urn:c:job", "@container": "@set", "@context": {
                "employer": { "@id": "urn:c:someone-else" }
            }}
        }});

        let analysis = analyze_ontology(&ontology, Some(&definition));
        let diags = &analysis.diagnostics;

        let drift = codes(diags, crate::LintCode::W1207);
        assert_eq!(drift.len(), 1, "{diags:?}");
        assert_eq!(drift[0].path, "$.context.@context.jobs.@context.employer");
        assert!(codes(diags, crate::LintCode::W1208).is_empty(), "{diags:?}");
        assert!(codes(diags, crate::LintCode::W1209).is_empty(), "{diags:?}");
    }

    #[test]
    fn non_object_authored_context_is_not_diffed() {
        let (definition, mut ontology) = context_fixture();
        ontology["context"] = json!({ "@context": "https://example.com/ctx.jsonld" });
        let analysis = analyze_ontology(&ontology, Some(&definition));
        assert!(
            !analysis.diagnostics.iter().any(|diag| matches!(
                diag.code,
                crate::LintCode::W1207 | crate::LintCode::W1208 | crate::LintCode::W1209
            )),
            "{:?}",
            analysis.diagnostics
        );
        assert!(analysis.derived_context.is_some());
    }

    #[test]
    fn derivation_diagnostics_surface_as_lint_warnings() {
        let definition = json!({
            "$formspec": "1.0",
            "url": "https://example.com/forms/derive",
            "version": "1.0.0",
            "items": [
                { "key": "home", "type": "group", "children": [
                    { "key": "city", "type": "field", "dataType": "string" }
                ]},
                { "key": "work", "type": "group", "children": [
                    { "key": "city", "type": "field", "dataType": "string" }
                ]},
                { "key": "jobs", "type": "group", "repeatable": true, "children": [
                    { "key": "employer", "type": "field", "dataType": "string" }
                ]},
                { "key": "scan", "type": "field", "dataType": "attachment" },
                { "key": "items", "type": "group", "repeatable": true, "children": [
                    { "key": "amount", "type": "field", "dataType": "decimal" }
                ]}
            ]
        });
        let ontology = json!({
            "$formspecOntology": "1.0",
            "version": "1.0.0",
            "targetDefinition": { "url": "https://example.com/forms/derive" },
            "defaultSystem": "urn:c",
            "concepts": {
                "home.city": { "concept": "urn:c:home-city" },
                "work.city": { "concept": "urn:c:work-city" },
                "jobs[*].employer": { "concept": "urn:c:employer" },
                "scan": { "concept": "urn:c:scan" },
                "items": { "concept": "urn:c:line" },
                "items.amount": { "concept": "urn:c:amount" },
                "items[*].amount": { "concept": "urn:c:amount" }
            }
        });

        let analysis = analyze_ontology(&ontology, Some(&definition));
        let diags = &analysis.diagnostics;

        let collision = codes(diags, crate::LintCode::W1210);
        assert_eq!(collision.len(), 1, "{diags:?}");
        assert_eq!(collision[0].path, "$.concepts[\"work.city\"]");
        assert!(
            collision[0].message.contains("urn:c:home-city"),
            "{}",
            collision[0].message
        );

        let lost = codes(diags, crate::LintCode::W1211);
        assert_eq!(lost.len(), 1, "{diags:?}");
        assert_eq!(lost[0].path, "$.concepts[\"jobs[*].employer\"]");

        let unsupported = codes(diags, crate::LintCode::W1212);
        assert_eq!(unsupported.len(), 1, "{diags:?}");
        assert_eq!(unsupported[0].path, "$.concepts.scan");

        let duplicate = codes(diags, crate::LintCode::W1213);
        assert_eq!(duplicate.len(), 1, "{diags:?}");
        assert_eq!(duplicate[0].path, "$.concepts[\"items.amount\"]");
        assert!(
            duplicate[0].message.contains("items[*].amount"),
            "{}",
            duplicate[0].message
        );

        let derived = analysis.derived_context.as_ref().expect("derivation ran");
        assert_eq!(derived.context["city"]["@id"], "urn:c:home-city");
        assert_eq!(derived.diagnostics.len(), 3);
    }

    #[test]
    fn without_a_paired_definition_nothing_is_derived() {
        let (_, mut ontology) = context_fixture();
        ontology["context"] = json!({ "@context": { "dob": "urn:c:elsewhere" } });
        let analysis = analyze_ontology(&ontology, None);
        assert!(analysis.derived_context.is_none());
        assert!(
            !analysis.diagnostics.iter().any(|diag| matches!(
                diag.code,
                crate::LintCode::W1207 | crate::LintCode::W1208 | crate::LintCode::W1209
            )),
            "{:?}",
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

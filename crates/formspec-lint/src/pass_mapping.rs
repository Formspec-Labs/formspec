//! Pass 9: Mapping document semantic checks and static-analysis facts.
#![allow(clippy::missing_docs_in_private_items)]
#![allow(missing_docs)]

use std::collections::{HashMap, HashSet};

use serde_json::Value;

use crate::semantic_helpers::{
    StrictPathSegment, error, json_path_member, normalized_segments, parse_form_path,
    parse_mapping_target_path, resolve_item_path, warning,
};
use crate::tree;
use crate::types::LintDiagnostic;

pub(crate) const PASS: u8 = 9;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TransformClass {
    Static,
    StaticWithHint,
    NonStatic,
    Omitted,
}

#[derive(Debug, Clone)]
pub struct MappingRuleAnalysis {
    pub rule_index: usize,
    pub source_path: Option<String>,
    pub normalized_source_segments: Vec<String>,
    pub target_path: Option<String>,
    pub normalized_target_segments: Vec<String>,
    pub resolved_definition_item: Option<String>,
    pub transform_class: TransformClass,
    pub projected_target_type: Option<String>,
    pub projected_target_enum: Vec<String>,
    pub derived_required: Option<bool>,
    pub target_write_footprint: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct MappingStaticAnalysis {
    pub rules: Vec<MappingRuleAnalysis>,
    pub diagnostics: Vec<LintDiagnostic>,
}

pub fn lint_mapping(mapping: &Value, definition: Option<&Value>) -> Vec<LintDiagnostic> {
    analyze_mapping(mapping, definition).diagnostics
}

pub fn analyze_mapping(mapping: &Value, definition: Option<&Value>) -> MappingStaticAnalysis {
    analyze_mapping_with_context(mapping, definition, None)
}

pub(crate) fn analyze_mapping_with_context(
    mapping: &Value,
    definition: Option<&Value>,
    context: Option<&crate::MappingSourceContext>,
) -> MappingStaticAnalysis {
    let external = mapping.get("sourceSchema");
    // External schemas are not Definitions, even when a caller supplies one.
    let definition = if external.is_some() { None } else { definition };
    let mut analyzer = Analyzer {
        mapping,
        source_schema: context
            .map(|context| &context.schema)
            .or_else(|| external.and_then(|source| source.get("schema"))),
        definition_data_path: context.map(|context| context.data_path.as_str()),
        definition_index: definition.map(tree::build_item_index),
        required_paths: definition
            .map(crate::semantic_helpers::required_item_paths)
            .unwrap_or_default(),
        target_format: mapping
            .get("targetSchema")
            .and_then(|schema| schema.get("format"))
            .and_then(Value::as_str)
            .unwrap_or("json")
            .to_string(),
        diagnostics: Vec::new(),
        rules: Vec::new(),
        target_writes: Vec::new(),
    };

    if let Some(context) = context {
        if let Some(definition) = definition {
            if formspec_core::detect_document_type(definition)
                != Some(formspec_core::DocumentType::Definition)
            {
                analyzer.diagnostics.push(error(
                    crate::LintCode::E1100,
                    PASS,
                    "$",
                    "Host source context requires a genuine Formspec Definition document",
                ));
            }
            if mapping["definitionRef"] != definition["url"] || definition["url"].is_null() {
                analyzer.diagnostics.push(error(
                    crate::LintCode::E1100,
                    PASS,
                    "$.definitionRef",
                    "Host source context requires the associated genuine Definition identity",
                ));
            }
            let compatible = mapping["definitionVersion"]
                .as_str()
                .zip(definition["version"].as_str())
                .and_then(|(range, version)| {
                    crate::semantic_helpers::compatible_version_satisfied(range, version)
                });
            if compatible != Some(true) {
                analyzer.diagnostics.push(error(crate::LintCode::E1100, PASS, "$.definitionVersion",
                    "Host source context Definition version does not satisfy the Mapping association"));
            }
        }
        let invalid = if external.is_some() {
            Some("Host source context cannot accompany external sourceSchema".to_string())
        } else if definition.is_none() {
            Some("Host source context requires the associated Definition".to_string())
        } else if context.data_path.is_empty()
            || parse_form_path(&context.data_path, false).is_err()
        {
            Some("Host source context requires a valid Definition data path".to_string())
        } else if let Err(reason) = resolve_schema_path(&context.schema, &context.data_path) {
            Some(format!("Host source context data path: {reason}"))
        } else {
            crate::schema_validation::compile_schema(&context.schema)
                .err()
                .map(|error| error.to_string())
        };
        if let Some(reason) = invalid {
            analyzer
                .diagnostics
                .push(error(crate::LintCode::E1100, PASS, "$", reason));
        }
    }
    if let Some(external) = external {
        if let Err(reason) = crate::validate_mapping_source_association(external) {
            analyzer.diagnostics.push(error(
                crate::LintCode::E1100,
                PASS,
                "$.sourceSchema",
                format!("Invalid external source association: {reason}"),
            ));
        }
        if mapping.get("definitionRef").is_some() || mapping.get("definitionVersion").is_some() {
            analyzer.diagnostics.push(error(
                crate::LintCode::E1100,
                PASS,
                "$.sourceSchema",
                "sourceSchema cannot be combined with Definition association",
            ));
        }
        match external.get("schema") {
            Some(schema) => {
                if let Err(error_message) = crate::schema_validation::compile_schema(schema) {
                    analyzer.diagnostics.push(error(
                        crate::LintCode::E1100,
                        PASS,
                        "$.sourceSchema.schema",
                        format!("Invalid external source schema: {error_message}"),
                    ));
                }
            }
            None => analyzer.diagnostics.push(error(
                crate::LintCode::E1100,
                PASS,
                "$.sourceSchema.schema",
                "External source association requires an inline schema",
            )),
        }
    }
    analyzer.collect_default_writes();
    analyzer.analyze_rules();
    analyzer.check_target_write_conflicts();

    MappingStaticAnalysis {
        rules: analyzer.rules,
        diagnostics: analyzer.diagnostics,
    }
}

struct Analyzer<'a> {
    mapping: &'a Value,
    source_schema: Option<&'a Value>,
    definition_data_path: Option<&'a str>,
    definition_index: Option<tree::ItemTreeIndex>,
    required_paths: HashSet<String>,
    target_format: String,
    diagnostics: Vec<LintDiagnostic>,
    rules: Vec<MappingRuleAnalysis>,
    target_writes: Vec<TargetWrite>,
}

#[derive(Debug, Clone)]
struct TargetWrite {
    path: String,
    json_path: String,
    source: WriteSource,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WriteSource {
    Default,
    Rule,
}

impl<'a> Analyzer<'a> {
    // Metadata uses the host schema; only genuine answer paths use item semantics.
    fn definition_path<'b>(&self, path: &'b str) -> Option<&'b str> {
        match self.definition_data_path {
            None => Some(path),
            Some(prefix) => path
                .strip_prefix(prefix)
                .and_then(|tail| tail.strip_prefix('.')),
        }
    }

    fn collect_default_writes(&mut self) {
        let Some(defaults) = self.mapping.get("defaults").and_then(Value::as_object) else {
            return;
        };
        for path in defaults.keys() {
            let json_path = json_path_member("$.defaults", path);
            match parse_mapping_target_path(path, &self.target_format) {
                Ok(segments) => {
                    self.target_writes.push(TargetWrite {
                        path: normalized_segments(&segments).join("."),
                        json_path,
                        source: WriteSource::Default,
                    });
                }
                Err(err) => self.diagnostics.push(error(
                    crate::LintCode::E1100,
                    PASS,
                    json_path,
                    format!("Invalid default target path: {err}"),
                )),
            }
        }
    }

    fn analyze_rules(&mut self) {
        let Some(rules) = self.mapping.get("rules").and_then(Value::as_array) else {
            return;
        };
        for (i, rule) in rules.iter().enumerate() {
            self.analyze_rule(rule, i, format!("$.rules[{i}]"), None);
        }
    }

    fn analyze_rule(
        &mut self,
        rule: &Value,
        rule_index: usize,
        base_path: String,
        source_scope: Option<&str>,
    ) {
        let transform = rule
            .get("transform")
            .and_then(Value::as_str)
            .unwrap_or("preserve");
        let emit = rule
            .get("projection")
            .and_then(|p| p.get("emit"))
            .and_then(Value::as_bool)
            .unwrap_or(true);

        let mut normalized_source_segments = Vec::new();
        let mut resolved_definition_item = None;
        if let Some(source_path) = rule.get("sourcePath").and_then(Value::as_str) {
            let effective_path = scoped_path(source_scope, source_path);
            match parse_form_path(source_path, false) {
                Ok(segments) => {
                    normalized_source_segments = normalized_segments(&segments);
                    if let Some(schema) = self.source_schema
                        && (self.definition_index.is_none()
                            || self.definition_path(&effective_path).is_none())
                        && let Err(reason) = resolve_schema_path(schema, &effective_path)
                    {
                        self.diagnostics.push(error(
                            if source_scope.is_some() {
                                crate::LintCode::E1111
                            } else {
                                crate::LintCode::E1110
                            },
                            PASS,
                            format!("{base_path}.sourcePath"),
                            format!("Mapping sourcePath {effective_path:?}: {reason}"),
                        ));
                    }
                    if let Some(index) = self.definition_index.as_ref()
                        && let Some(path) = self.definition_path(&effective_path)
                    {
                        match resolve_item_path(path, index, false) {
                            Ok(Some(item)) => {
                                resolved_definition_item = Some(item.full_path.clone());
                            }
                            Ok(None) => {
                                self.diagnostics.push(error(
                                    if source_scope.is_some() {
                                        crate::LintCode::E1111
                                    } else {
                                        crate::LintCode::E1110
                                    },
                                    PASS,
                                    format!("{base_path}.sourcePath"),
                                    format!(
                                        "Mapping sourcePath {source_path:?} does not resolve against the paired Definition"
                                    ),
                                ));
                            }
                            Err(err) => self.diagnostics.push(error(
                                if source_scope.is_some() {
                                    crate::LintCode::E1111
                                } else {
                                    crate::LintCode::E1110
                                },
                                PASS,
                                format!("{base_path}.sourcePath"),
                                err,
                            )),
                        }
                    }
                }
                Err(err) => self.diagnostics.push(error(
                    crate::LintCode::E1100,
                    PASS,
                    format!("{base_path}.sourcePath"),
                    format!("Invalid source path syntax: {err}"),
                )),
            }
        }

        let mut normalized_target_segments = Vec::new();
        let mut target_write_footprint = Vec::new();
        if let Some(target_path) = rule.get("targetPath").and_then(Value::as_str) {
            match parse_mapping_target_path(target_path, &self.target_format) {
                Ok(segments) => {
                    normalized_target_segments = normalized_segments(&segments);
                    let normalized = normalized_target_segments.join(".");
                    target_write_footprint.push(normalized.clone());
                    self.target_writes.push(TargetWrite {
                        path: normalized,
                        json_path: format!("{base_path}.targetPath"),
                        source: WriteSource::Rule,
                    });
                }
                Err(err) => self.diagnostics.push(error(
                    crate::LintCode::E1100,
                    PASS,
                    format!("{base_path}.targetPath"),
                    format!(
                        "Invalid target path for {} target schema: {err}",
                        self.target_format
                    ),
                )),
            }
        }

        self.check_fel(rule, &base_path);
        let derived_required = self.derive_requiredness(rule, transform, source_scope);
        self.check_projection(
            rule,
            &base_path,
            transform,
            emit,
            source_scope,
            &derived_required,
        );
        self.check_reversibility(rule, &base_path, transform);

        let transform_class = classify_transform(rule, transform, emit);
        if transform_class == TransformClass::NonStatic && emit && !has_static_projection_hint(rule)
        {
            self.diagnostics.push(warning(
                crate::LintCode::W1101,
                PASS,
                &base_path,
                format!(
                    "Mapping rule uses non-static transform {transform:?} without projection targetType or targetEnum"
                ),
            ));
        }

        let projected_target_type = rule
            .get("projection")
            .and_then(|p| p.get("targetType"))
            .and_then(Value::as_str)
            .map(ToOwned::to_owned);
        let projected_target_enum = rule
            .get("projection")
            .and_then(|p| p.get("targetEnum"))
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .map(crate::semantic_helpers::value_to_key)
            .collect();

        self.rules.push(MappingRuleAnalysis {
            rule_index,
            source_path: rule
                .get("sourcePath")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
            normalized_source_segments,
            target_path: rule
                .get("targetPath")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
            normalized_target_segments,
            resolved_definition_item,
            transform_class,
            projected_target_type,
            projected_target_enum,
            derived_required: derived_required.value,
            target_write_footprint,
        });

        self.analyze_inner_rules(rule, rule_index, &base_path, source_scope);
    }

    fn analyze_inner_rules(
        &mut self,
        rule: &Value,
        rule_index: usize,
        base_path: &str,
        parent_scope: Option<&str>,
    ) {
        let Some(array) = rule.get("array") else {
            return;
        };
        let source_scope = rule.get("sourcePath").and_then(Value::as_str);
        let Some(inner_rules) = array.get("innerRules").and_then(Value::as_array) else {
            return;
        };
        let source_scope = source_scope.and_then(|source| {
            if self.source_schema.is_some() {
                return Some(format!("{}[*]", scoped_path(parent_scope, source)));
            }
            self.definition_index.as_ref().and_then(|index| {
                resolve_item_path(source, index, false)
                    .ok()
                    .flatten()
                    .map(|item| item.full_path.clone())
            })
        });
        for (i, inner) in inner_rules.iter().enumerate() {
            self.analyze_rule(
                inner,
                rule_index,
                format!("{base_path}.array.innerRules[{i}]"),
                source_scope.as_deref(),
            );
        }
    }

    fn check_fel(&mut self, rule: &Value, base_path: &str) {
        for (field, path) in [
            ("expression", format!("{base_path}.expression")),
            ("condition", format!("{base_path}.condition")),
            (
                "reverse.expression",
                format!("{base_path}.reverse.expression"),
            ),
            (
                "reverse.condition",
                format!("{base_path}.reverse.condition"),
            ),
        ] {
            let value = match field {
                "reverse.expression" => rule
                    .get("reverse")
                    .and_then(|r| r.get("expression"))
                    .and_then(Value::as_str),
                "reverse.condition" => rule
                    .get("reverse")
                    .and_then(|r| r.get("condition"))
                    .and_then(Value::as_str),
                _ => rule.get(field).and_then(Value::as_str),
            };
            if let Some(expr) = value
                && let Err(err) = fel_core::parse(expr)
            {
                self.diagnostics.push(error(
                    crate::LintCode::E1101,
                    PASS,
                    path,
                    format!("Mapping FEL parse error: {err}"),
                ));
            }
        }
    }

    fn check_projection(
        &mut self,
        rule: &Value,
        base_path: &str,
        transform: &str,
        emit: bool,
        source_scope: Option<&str>,
        derived_required: &RequirednessInference,
    ) {
        let Some(projection) = rule.get("projection") else {
            return;
        };
        if let (Some(target_type), Some(values)) = (
            projection.get("targetType").and_then(Value::as_str),
            projection.get("targetEnum").and_then(Value::as_array),
        ) {
            for value in values {
                if !value_matches_target_type(value, target_type) {
                    self.diagnostics.push(error(
                        crate::LintCode::E1103,
                        PASS,
                        format!("{base_path}.projection.targetEnum"),
                        format!(
                            "projection.targetEnum value {} contradicts targetType {target_type:?}",
                            value
                        ),
                    ));
                    break;
                }
            }
        }

        if projection
            .get("required")
            .and_then(Value::as_bool)
            .unwrap_or(false)
            && (transform == "drop" || !emit)
        {
            self.diagnostics.push(error(
                crate::LintCode::E1104,
                PASS,
                format!("{base_path}.projection.required"),
                "projection.required=true contradicts an omitted mapping rule",
            ));
        }

        if let Some(source_paths) = projection.get("sourcePaths").and_then(Value::as_array) {
            for (i, path) in source_paths.iter().enumerate() {
                let Some(path) = path.as_str() else {
                    continue;
                };
                let effective = scoped_path(source_scope, path);
                if let Err(err) = parse_form_path(path, false) {
                    self.diagnostics.push(error(
                        crate::LintCode::E1100,
                        PASS,
                        format!("{base_path}.projection.sourcePaths[{i}]"),
                        format!("Invalid projection source path syntax: {err}"),
                    ));
                    continue;
                }
                if let Some(schema) = self.source_schema
                    && (self.definition_index.is_none()
                        || self.definition_path(&effective).is_none())
                    && let Err(reason) = resolve_schema_path(schema, &effective)
                {
                    self.diagnostics.push(error(
                        crate::LintCode::E1112,
                        PASS,
                        format!("{base_path}.projection.sourcePaths[{i}]"),
                        reason,
                    ));
                }
                if let Some(index) = self.definition_index.as_ref()
                    && let Some(path) = self.definition_path(&effective)
                {
                    match resolve_item_path(path, index, false) {
                        Ok(Some(_)) => {}
                        Ok(None) => self.diagnostics.push(error(
                            crate::LintCode::E1112,
                            PASS,
                            format!("{base_path}.projection.sourcePaths[{i}]"),
                            format!("projection.sourcePaths entry {path:?} does not resolve against the paired Definition"),
                        )),
                        Err(err) => self.diagnostics.push(error(
                            crate::LintCode::E1112,
                            PASS,
                            format!("{base_path}.projection.sourcePaths[{i}]"),
                            err,
                        )),
                    }
                }
            }
        }

        self.check_requiredness(base_path, projection, derived_required);
    }

    fn derive_requiredness(
        &self,
        rule: &Value,
        transform: &str,
        source_scope: Option<&str>,
    ) -> RequirednessInference {
        let Some(index) = self.definition_index.as_ref() else {
            return RequirednessInference::unknown(RequirednessUnknownReason::NoDefinition);
        };
        if rule.get("condition").and_then(Value::as_str).is_some()
            || classify_transform(rule, transform, true) == TransformClass::NonStatic
        {
            return RequirednessInference::unknown(
                RequirednessUnknownReason::ConditionalOrNonStatic,
            );
        }

        let mut paths = Vec::new();
        if let Some(source_path) = rule.get("sourcePath").and_then(Value::as_str) {
            paths.push(scoped_path(source_scope, source_path));
        }
        if let Some(source_paths) = rule
            .get("projection")
            .and_then(|projection| projection.get("sourcePaths"))
            .and_then(Value::as_array)
        {
            paths.extend(
                source_paths
                    .iter()
                    .filter_map(Value::as_str)
                    .map(|path| scoped_path(source_scope, path)),
            );
        }
        if paths.is_empty() {
            return RequirednessInference::unknown(RequirednessUnknownReason::NoSourcePaths);
        }
        let Some(paths): Option<Vec<_>> = paths
            .iter()
            .map(|path| self.definition_path(path))
            .collect()
        else {
            return RequirednessInference::unknown(RequirednessUnknownReason::UnresolvedSourcePath);
        };
        if paths
            .iter()
            .any(|path| !matches!(resolve_item_path(path, index, false), Ok(Some(_))))
        {
            return RequirednessInference::unknown(RequirednessUnknownReason::UnresolvedSourcePath);
        }

        let required_count = paths
            .iter()
            .filter(|path| path_is_required(&self.required_paths, path))
            .count();
        if required_count > 0 && required_count < paths.len() {
            return RequirednessInference::unknown(RequirednessUnknownReason::MixedSourcePaths);
        }

        RequirednessInference::known(required_count == paths.len())
    }

    fn check_requiredness(
        &mut self,
        base_path: &str,
        projection: &Value,
        derived_required: &RequirednessInference,
    ) {
        let Some(projected_required) = projection.get("required").and_then(Value::as_bool) else {
            return;
        };
        match derived_required.reason {
            None => {}
            Some(RequirednessUnknownReason::ConditionalOrNonStatic) => {
                self.diagnostics.push(warning(
                    crate::LintCode::W1110,
                    PASS,
                    format!("{base_path}.projection.required"),
                    "Mapping requiredness cannot be inferred statically for a conditional or non-static rule",
                ));
                return;
            }
            Some(RequirednessUnknownReason::MixedSourcePaths) => {
                self.diagnostics.push(warning(
                    crate::LintCode::W1110,
                    PASS,
                    format!("{base_path}.projection.required"),
                    "Mapping requiredness is ambiguous because required and optional source paths are mixed",
                ));
                return;
            }
            Some(
                RequirednessUnknownReason::NoDefinition
                | RequirednessUnknownReason::NoSourcePaths
                | RequirednessUnknownReason::UnresolvedSourcePath,
            ) => {
                return;
            }
        }

        let Some(derived_required) = derived_required.value else {
            return;
        };
        if projected_required != derived_required {
            self.diagnostics.push(error(
                crate::LintCode::E1113,
                PASS,
                format!("{base_path}.projection.required"),
                format!(
                    "projection.required={projected_required} contradicts Definition-derived requiredness {derived_required}"
                ),
            ));
        }
    }

    fn check_reversibility(&mut self, rule: &Value, base_path: &str, transform: &str) {
        let direction = self
            .mapping
            .get("direction")
            .and_then(Value::as_str)
            .unwrap_or("forward");
        if direction != "both" && direction != "reverse" {
            return;
        }
        let bidirectional = rule
            .get("bidirectional")
            .and_then(Value::as_bool)
            .unwrap_or(true);
        if !bidirectional {
            return;
        }
        let has_reverse = rule.get("reverse").is_some();
        if is_lossy_transform(rule, transform) && !has_reverse {
            self.diagnostics.push(error(
                crate::LintCode::E1105,
                PASS,
                base_path,
                format!(
                    "Bidirectional Mapping rule with lossy transform {transform:?} requires reverse or bidirectional=false"
                ),
            ));
        }

        if transform == "valueMap"
            && value_map_is_non_injective(rule.get("valueMap"))
            && rule
                .get("reverse")
                .and_then(|r| r.get("valueMap"))
                .is_none()
        {
            self.diagnostics.push(error(
                crate::LintCode::E1106,
                PASS,
                format!("{base_path}.valueMap.forward"),
                "Bidirectional non-injective valueMap.forward requires an explicit reverse.valueMap",
            ));
        }
    }

    fn check_target_write_conflicts(&mut self) {
        let mut exact: HashMap<String, Vec<&TargetWrite>> = HashMap::new();
        for write in &self.target_writes {
            exact.entry(write.path.clone()).or_default().push(write);
        }
        for writes in exact.values() {
            if writes.len() > 1 && writes.iter().any(|write| write.source == WriteSource::Rule) {
                let locations = writes
                    .iter()
                    .map(|write| write.json_path.as_str())
                    .collect::<Vec<_>>()
                    .join(", ");
                self.diagnostics.push(warning(
                    crate::LintCode::W1100,
                    PASS,
                    writes[1].json_path.clone(),
                    format!("Multiple Mapping writes target the same path ({locations}); last write wins"),
                ));
            }
        }

        for i in 0..self.target_writes.len() {
            for j in (i + 1)..self.target_writes.len() {
                let a = &self.target_writes[i];
                let b = &self.target_writes[j];
                if a.path == b.path {
                    continue;
                }
                if is_parent_child_path(&a.path, &b.path) {
                    self.diagnostics.push(error(
                        crate::LintCode::E1102,
                        PASS,
                        b.json_path.clone(),
                        format!(
                            "Mapping target write conflict: {} and {} overlap as parent/child paths",
                            a.path, b.path
                        ),
                    ));
                }
            }
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct RequirednessInference {
    value: Option<bool>,
    reason: Option<RequirednessUnknownReason>,
}

impl RequirednessInference {
    fn known(value: bool) -> Self {
        Self {
            value: Some(value),
            reason: None,
        }
    }

    fn unknown(reason: RequirednessUnknownReason) -> Self {
        Self {
            value: None,
            reason: Some(reason),
        }
    }
}

#[derive(Debug, Clone, Copy)]
enum RequirednessUnknownReason {
    NoDefinition,
    NoSourcePaths,
    UnresolvedSourcePath,
    ConditionalOrNonStatic,
    MixedSourcePaths,
}

// Static source-path analysis checks declarations, not requiredness or conditions.
// A union path must resolve within one complete branch; runtime validation still
// determines which branch admits the actual source document.
fn resolve_schema_path(root: &Value, path: &str) -> Result<(), String> {
    let segments = parse_form_path(path, false)?;
    if schema_declares_path(root, root, &segments, &mut HashSet::new())? {
        Ok(())
    } else {
        Err("path is not statically declared in the source schema".into())
    }
}

fn schema_declares_path(
    root: &Value,
    schema: &Value,
    segments: &[StrictPathSegment],
    visiting: &mut HashSet<(usize, usize)>,
) -> Result<bool, String> {
    let schema = resolve_local_schema(root, schema)?;
    if segments.is_empty() {
        return Ok(true);
    }
    // A recursive property consumes a segment and is finite. A union/reference
    // cycle that consumes no segment cannot establish a declaration.
    let key = (std::ptr::from_ref(schema) as usize, segments.len());
    if !visiting.insert(key) {
        return Err("cyclic schema union cannot resolve a static source path".into());
    }
    let result = (|| {
        if ["allOf", "anyOf", "if", "then", "else", "not", "$dynamicRef"]
            .iter()
            .any(|keyword| schema.get(keyword).is_some())
        {
            return Err("schema construct is unsupported by static source-path analysis".into());
        }
        if let Some(branches) = schema.get("oneOf") {
            // Shape siblings intersect with every branch. Supporting those
            // requires intersection analysis rather than union traversal.
            if schema.get("properties").is_some() || schema.get("items").is_some() {
                return Err("schema oneOf with shape siblings is unsupported by static source-path analysis".into());
            }
            let branches = branches
                .as_array()
                .ok_or_else(|| "schema oneOf must be an array".to_string())?;
            let mut declared = false;
            for branch in branches {
                // Visit all alternatives even after a match so unsupported
                // analysis cannot be hidden behind a supported alternative.
                declared |= schema_declares_path(root, branch, segments, visiting)?;
            }
            return Ok(declared);
        }
        let child = match &segments[0] {
            StrictPathSegment::Exact(name) => schema
                .get("properties")
                .and_then(|properties| properties.get(name)),
            StrictPathSegment::Wildcard | StrictPathSegment::Indexed(_) => schema
                .get("items")
                .filter(|items| items.is_object() || items.is_boolean()),
            _ => return Err("unsupported external source path segment".into()),
        };
        match child {
            Some(child) => schema_declares_path(root, child, &segments[1..], visiting),
            None => Ok(false),
        }
    })();
    visiting.remove(&key);
    result
}

fn resolve_local_schema<'a>(root: &'a Value, mut schema: &'a Value) -> Result<&'a Value, String> {
    let mut visited = HashSet::new();
    loop {
        // Nested resources change the base of fragment references. Static
        // analysis supports the root resource only and must not guess.
        if !std::ptr::eq(schema, root) && schema.get("$id").is_some() {
            return Err(
                "nested schema resource identifiers are unsupported by static source-path analysis"
                    .into(),
            );
        }
        let Some(reference) = schema.get("$ref") else {
            return Ok(schema);
        };
        let reference = reference
            .as_str()
            .ok_or_else(|| "schema $ref must be a string".to_string())?;
        if !visited.insert(reference) {
            return Err("cyclic schema reference cannot resolve a static source path".into());
        }
        if schema.get("properties").is_some()
            || schema.get("items").is_some()
            || schema.get("oneOf").is_some()
        {
            return Err(
                "schema $ref with shape siblings is unsupported by static source-path analysis"
                    .into(),
            );
        }
        let pointer = reference
            .strip_prefix('#')
            .ok_or_else(|| "static source paths require local schema references".to_string())?;
        if !pointer.is_empty() && !pointer.starts_with('/') {
            return Err("static source paths require JSON Pointer schema references".into());
        }
        schema = root
            .pointer(pointer)
            .ok_or_else(|| format!("unresolved local schema reference {reference:?}"))?;
    }
}

fn scoped_path(source_scope: Option<&str>, path: &str) -> String {
    if let Some(scope) = source_scope
        && !path.starts_with('#')
    {
        return format!("{scope}.{path}");
    }
    path.to_string()
}

fn path_is_required(required_paths: &HashSet<String>, path: &str) -> bool {
    if required_paths.contains(path) {
        return true;
    }
    let key = requiredness_path_key(path);
    required_paths
        .iter()
        .any(|required| requiredness_path_key(required) == key)
}

fn requiredness_path_key(path: &str) -> String {
    let indexless_path = strip_requiredness_indexes(path);
    parse_form_path(&indexless_path, false)
        .map(|segments| {
            normalized_segments(&segments)
                .into_iter()
                .filter(|segment| !(segment.starts_with('[') && segment.ends_with(']')))
                .collect::<Vec<_>>()
                .join(".")
        })
        .unwrap_or(indexless_path)
}

fn strip_requiredness_indexes(path: &str) -> String {
    let chars = path.chars().collect::<Vec<_>>();
    let mut output = String::new();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '[' {
            let start = i + 1;
            let mut end = start;
            while end < chars.len() && chars[end] != ']' {
                end += 1;
            }
            if end < chars.len() {
                let content = chars[start..end].iter().collect::<String>();
                if content == "*"
                    || (!content.is_empty() && content.chars().all(|ch| ch.is_ascii_digit()))
                {
                    i = end + 1;
                    continue;
                }
            }
        }
        output.push(chars[i]);
        i += 1;
    }
    output
}

fn classify_transform(rule: &Value, transform: &str, emit: bool) -> TransformClass {
    if !emit || transform == "drop" {
        return TransformClass::Omitted;
    }
    if has_static_projection_hint(rule) {
        return TransformClass::StaticWithHint;
    }
    match transform {
        "preserve" | "valueMap" => TransformClass::Static,
        "coerce" if rule.get("coerce").is_some() => TransformClass::Static,
        _ => TransformClass::NonStatic,
    }
}

fn has_static_projection_hint(rule: &Value) -> bool {
    let Some(projection) = rule.get("projection") else {
        return false;
    };
    projection.get("targetType").is_some() || projection.get("targetEnum").is_some()
}

fn value_matches_target_type(value: &Value, target_type: &str) -> bool {
    match target_type {
        "string" | "date" | "datetime" | "money" => value.is_string(),
        "number" => value.as_f64().is_some(),
        "integer" => value.as_i64().is_some() || value.as_u64().is_some(),
        "boolean" => value.is_boolean(),
        "array" => value.is_array(),
        "object" => value.is_object(),
        _ => true,
    }
}

fn is_lossy_transform(rule: &Value, transform: &str) -> bool {
    match transform {
        "drop" | "expression" | "constant" | "concat" | "split" => true,
        "coerce" => lossy_coerce(rule.get("coerce")),
        _ => false,
    }
}

fn lossy_coerce(coerce: Option<&Value>) -> bool {
    let Some(coerce) = coerce else {
        return false;
    };
    let Some(obj) = coerce.as_object() else {
        return false;
    };
    matches!(
        (
            obj.get("from").and_then(Value::as_str),
            obj.get("to").and_then(Value::as_str)
        ),
        (Some("datetime"), Some("date")) | (Some("money"), Some("number"))
    )
}

fn value_map_is_non_injective(value_map: Option<&Value>) -> bool {
    let Some(forward) = value_map
        .and_then(|v| v.get("forward"))
        .and_then(Value::as_object)
    else {
        return false;
    };
    let mut seen = HashSet::new();
    for value in forward.values() {
        let key = crate::semantic_helpers::value_to_key(value);
        if !seen.insert(key) {
            return true;
        }
    }
    false
}

fn is_parent_child_path(a: &str, b: &str) -> bool {
    let a_dot = format!("{a}.");
    let b_dot = format!("{b}.");
    b.starts_with(&a_dot) || a.starts_with(&b_dot)
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
    fn scoped_repeat_required_paths_match_wildcard_binds() {
        let (mapping, definition) = fixture_with_definition(include_str!(
            "../../../tests/fixtures/lint/valid-mapping-semantic.json"
        ));

        let analysis = analyze_mapping(&mapping, Some(&definition));

        assert!(
            !analysis
                .diagnostics
                .iter()
                .any(|diag| diag.code == crate::LintCode::E1113),
            "wildcard repeat requiredness should not emit E1113: {:?}",
            analysis.diagnostics
        );
        let amount_rule = analysis
            .rules
            .iter()
            .find(|rule| rule.source_path.as_deref() == Some("amount"))
            .expect("fixture has an amount inner rule");
        assert_eq!(
            amount_rule.resolved_definition_item.as_deref(),
            Some("items.amount")
        );
        assert_eq!(amount_rule.derived_required, Some(true));
    }

    /// Mapping spec, JSON adapter: paths use dot-notation with bracket indexing (`name[0].given[0]`).
    /// A member after an indexed segment is a path the runtime executes; the lint must not reject it.
    #[test]
    fn an_indexed_segment_may_be_followed_by_a_member() {
        let mapping: Value = serde_json::json!({
            "$formspecMapping": "1.0", "version": "1.0.0",
            "definitionRef": "urn:test", "definitionVersion": ">=1.0.0",
            "targetSchema": { "format": "json" },
            "rules": [
                { "transform": "preserve", "sourcePath": "work.jobs[0].employerName", "targetPath": "EMPLOYER" },
                { "transform": "preserve", "sourcePath": "work.jobs[0].hoursWorked.hours", "targetPath": "rows[0].hours" }
            ]
        });

        let analysis = analyze_mapping(&mapping, None);

        let path_errors: Vec<_> = analysis
            .diagnostics
            .iter()
            .filter(|diag| diag.code == crate::LintCode::E1100)
            .collect();
        assert!(path_errors.is_empty(), "{path_errors:?}");
    }

    #[test]
    fn reverse_condition_is_checked_as_fel() {
        let mapping: Value = serde_json::from_str(include_str!(
            "../../../tests/fixtures/lint/E1101-mapping-reverse-condition-invalid.json"
        ))
        .expect("fixture is valid JSON");

        let analysis = analyze_mapping(&mapping, None);

        assert!(
            analysis.diagnostics.iter().any(|diag| {
                diag.code == crate::LintCode::E1101 && diag.path == "$.rules[0].reverse.condition"
            }),
            "reverse.condition should be parsed as FEL: {:?}",
            analysis.diagnostics
        );
    }
}

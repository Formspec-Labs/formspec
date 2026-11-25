//! Resolve static FEL dependencies in the Definition that owns each expression.

use std::collections::{BTreeSet, HashSet};

use fel_core::{
    Dependencies, Expr, ReadPath, ReadPathSegment, builtin_function_catalog, extract_dependencies,
};
use formspec_core::fel_analysis::RESERVED_CONTEXT_NAMES;
use formspec_core::path_utils::{Path, PathSegment};
use formspec_core::repeat_references::resolve_head;
use serde_json::Value;

use crate::semantic_helpers::{error, warning};
use crate::tree::ItemTreeIndex;
use crate::{LintCode, LintDiagnostic};

/// Declarations visible to static checks across the document.
pub(crate) struct ExpressionSemantics<'a> {
    document: &'a Value,
    items: &'a ItemTreeIndex,
    functions: HashSet<&'a str>,
    variables: HashSet<(&'a str, &'a str)>,
}

impl<'a> ExpressionSemantics<'a> {
    /// Index declarations once, including the registries supplied to this lint call.
    pub(crate) fn new(
        document: &'a Value,
        items: &'a ItemTreeIndex,
        registry_documents: &'a [Value],
    ) -> Self {
        let mut functions: HashSet<_> = builtin_function_catalog().iter().map(|f| f.name).collect();
        functions.extend(
            registry_documents
                .iter()
                .filter_map(|r| r["entries"].as_array())
                .flatten()
                .filter(|entry| entry["category"] == "function")
                .filter_map(|entry| entry["name"].as_str()),
        );
        let variables = document["variables"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|var| Some((var["scope"].as_str().unwrap_or("#"), var["name"].as_str()?)))
            .collect();
        Self {
            document,
            items,
            functions,
            variables,
        }
    }

    /// Report unresolved names at the authored slot. Migrations read historical data.
    pub(crate) fn check(
        &self,
        parsed: &Expr,
        path: &str,
        target: Option<&str>,
        migration: bool,
        diagnostics: &mut Vec<LintDiagnostic>,
    ) {
        diagnostics.extend(
            fel_core::builtin_arity_mismatches(parsed)
                .into_iter()
                .map(|mismatch| error(LintCode::E408, 4, path, mismatch.message)),
        );
        self.check_reads(
            &extract_dependencies(parsed),
            path,
            target,
            migration,
            |_, finding| diagnostics.push(finding),
        );
    }

    fn check_reads(
        &self,
        dependencies: &Dependencies,
        path: &str,
        target: Option<&str>,
        functions_only: bool,
        mut emit: impl FnMut(&str, LintDiagnostic),
    ) {
        for function in dependencies.functions().collect::<BTreeSet<_>>() {
            if !self.functions.contains(function) {
                emit(
                    function,
                    error(
                        LintCode::E401,
                        4,
                        path,
                        format!("Unknown FEL function {function}()"),
                    ),
                );
            }
        }
        if functions_only {
            return;
        }

        let scope = self.scope(target);
        for field in dependencies.fields.iter().collect::<BTreeSet<_>>() {
            if !self.field_exists(scope, field) {
                emit(
                    field,
                    error(
                        LintCode::E402,
                        4,
                        path,
                        format!("Unknown field reference ${field}"),
                    ),
                );
            }
        }
        if !scope.is_empty() {
            for read in &dependencies.self_reads {
                if read.is_empty() {
                    continue;
                }
                if !self.item_members_exist(scope, read.segments(), false) {
                    let rendered = read.to_canonical_string();
                    let separator = if rendered.starts_with('[') { "" } else { "." };
                    emit(
                        &rendered,
                        error(
                            LintCode::E402,
                            4,
                            path,
                            format!("Unknown field reference ${separator}{rendered}"),
                        ),
                    );
                }
            }
        }
        if let Some(row) = self.repeat_scope(scope) {
            for read in &dependencies.current_reads {
                if read.is_empty() {
                    continue;
                }
                if !self.item_members_exist(row, read.segments(), true) {
                    let rendered = read.to_canonical_string();
                    let separator = if rendered.starts_with('[') { "" } else { "." };
                    emit(
                        &rendered,
                        error(
                            LintCode::E402,
                            4,
                            path,
                            format!("Unknown field reference @current{separator}{rendered}"),
                        ),
                    );
                }
            }
        }
        let names: BTreeSet<_> = dependencies
            .context_names()
            .filter(|name| !RESERVED_CONTEXT_NAMES.contains(name))
            .collect();
        for name in names {
            if !self.variable_visible(scope, name) {
                emit(
                    name,
                    error(
                        LintCode::E403,
                        4,
                        path,
                        format!("Variable @{name} is not declared in this scope"),
                    ),
                );
            }
        }
        for (name, reads) in &dependencies.instance_reads {
            if self.document["instances"].get(name).is_none() {
                let empty = ReadPath::default();
                if let Some(finding) = self.instance_read_finding(name, &empty, path, false) {
                    emit(name, finding);
                }
            } else {
                for read in reads {
                    if let Some(finding) = self.instance_read_finding(name, read, path, false) {
                        emit(name, finding);
                    }
                }
            }
        }
    }

    /// Resolve the editor or document target to its declared Item.
    fn scope(&self, target: Option<&str>) -> &'a str {
        let target = target
            .map(formspec_core::normalize_indexed_path)
            .unwrap_or_default();
        self.items
            .by_full_path
            .get(&target)
            .or_else(|| self.items.by_key.get(&target))
            .map_or("", |item| item.full_path.as_str())
    }

    /// Read a field by lexical scope, then follow only declared group members.
    fn field_exists(&self, scope: &str, field: &str) -> bool {
        let segments = parse_path_to_read_segments(field);
        let Some((ReadPathSegment::Key(head), tail)) = segments.split_first() else {
            return false;
        };
        resolve_head(
            &|key| {
                self.items
                    .by_full_path
                    .get(key)
                    .is_some_and(|item| item.is_group || item.data_type.is_some())
            },
            scope,
            head,
        )
        .is_some_and(|item| self.item_members_exist(&item, tail, false))
    }

    /// Follow group children, then inspect the declared field value when reached.
    ///
    /// When `row_selected` is true (reads rooted at `@current`), the starting repeatable group
    /// is already dereferenced to a single row, so an immediate subscript on it is rejected.
    fn item_members_exist(
        &self,
        path: &str,
        members: &[ReadPathSegment],
        mut row_selected: bool,
    ) -> bool {
        let mut path = path.to_owned();
        let mut members = members;
        while let Some((next, tail)) = members.split_first() {
            let Some(item) = self.items.by_full_path.get(&path) else {
                return false;
            };
            if let Some(data_type) = &item.data_type {
                return field_value_contains(data_type, members, false);
            }
            match next {
                ReadPathSegment::Key(key) if item.is_group => {
                    path.push('.');
                    path.push_str(key);
                    row_selected = false;
                }
                ReadPathSegment::Index(_) | ReadPathSegment::Wildcard
                    if item.is_repeatable
                        && !row_selected
                        && !matches!(
                            tail.first(),
                            Some(ReadPathSegment::Index(_) | ReadPathSegment::Wildcard)
                        ) => {}
                _ => return false,
            }
            members = tail;
        }
        self.items
            .by_full_path
            .get(&path)
            .is_some_and(|item| item.is_group || item.data_type.is_some())
    }

    /// The innermost repeating Group supplies `@current`.
    fn repeat_scope(&self, mut scope: &'a str) -> Option<&'a str> {
        while let Some(item) = self.items.by_full_path.get(scope) {
            if item.is_repeatable {
                return Some(scope);
            }
            scope = item.parent_full_path.as_deref()?;
        }
        None
    }

    /// A variable belongs to a scope Item (visible to descendants) or to the form.
    fn variable_visible(&self, mut scope: &'a str, name: &str) -> bool {
        while let Some(item) = self.items.by_full_path.get(scope) {
            if self.variables.contains(&(item.key.as_str(), name)) {
                return true;
            }
            scope = item.parent_full_path.as_deref().unwrap_or("");
        }
        self.variables.contains(&("#", name))
    }

    /// Check an expression or structured read against the instance's delivered value.
    pub(crate) fn check_instance_read(
        &self,
        name: &str,
        read: &ReadPath,
        path: &str,
        diagnostics: &mut Vec<LintDiagnostic>,
    ) {
        diagnostics.extend(self.instance_read_finding(name, read, path, true));
    }

    fn instance_read_finding(
        &self,
        name: &str,
        read: &ReadPath,
        path: &str,
        raw_json: bool,
    ) -> Option<LintDiagnostic> {
        let Some(instance) = self.document["instances"].get(name) else {
            return Some(error(
                LintCode::E404,
                4,
                path,
                format!("Instance {name:?} is not declared"),
            ));
        };
        let Some(schema) = instance["schema"].as_object() else {
            return None;
        };
        // A Mapping changes the shape after projecting input columns. Its output
        // cannot be checked against the upstream schema (Core §4.4.1).
        if read.is_empty() || instance.pointer("/response/mapping").is_some() {
            return None;
        }
        let normalized = normalize_read_segments(read.segments());
        let column = if instance
            .pointer("/response/cardinality")
            .and_then(Value::as_str)
            == Some("latest-per-subject")
        {
            match normalized.split_first() {
                Some((ReadPathSegment::Wildcard, tail)) => Some(tail),
                _ => None,
            }
        } else {
            Some(normalized.as_slice())
        };
        if column.is_some_and(|column| {
            column.is_empty()
                || schema.iter().any(|(declared, data_type)| {
                    let declared_segs = parse_schema_key_segments(declared);
                    declared_segs.starts_with(column)
                        || (column.starts_with(&declared_segs)
                            && data_type.as_str().is_some_and(|kind| {
                                field_value_contains(kind, &column[declared_segs.len()..], raw_json)
                            }))
                })
        }) {
            return None;
        }
        let rendered = read.to_canonical_string();
        let message =
            format!("Path {rendered:?} on instance {name:?} is outside its declared schema");
        Some(if instance.get("response").is_some() {
            error(LintCode::E405, 4, path, message)
        } else {
            warning(LintCode::W405, 4, path, message)
        })
    }
}

/// Core §4.2.3 defines the compound field values. Attachments permit extra host metadata.
pub(crate) fn field_value_contains(
    data_type: &str,
    members: &[ReadPathSegment],
    raw_json: bool,
) -> bool {
    if members.is_empty() {
        return true;
    }
    match (data_type, members) {
        ("money", [ReadPathSegment::Key(key)]) if raw_json => {
            matches!(key.as_str(), "amount" | "currency")
        }
        ("multiChoice", [ReadPathSegment::Index(_) | ReadPathSegment::Wildcard]) => true,
        ("attachment", [ReadPathSegment::Key(key), tail @ ..]) => {
            tail.is_empty() || !matches!(key.as_str(), "contentType" | "url" | "data" | "size")
        }
        _ => false,
    }
}

/// Collapse typed array subscripts to wildcards while keeping literal property keys intact.
fn normalize_read_segments(segments: &[ReadPathSegment]) -> Vec<ReadPathSegment> {
    segments
        .iter()
        .map(|seg| match seg {
            ReadPathSegment::Key(key) => ReadPathSegment::Key(key.clone()),
            ReadPathSegment::Index(_) | ReadPathSegment::Wildcard => ReadPathSegment::Wildcard,
        })
        .collect()
}

/// Parse a dotted or canonical path into typed segments (canonical bracket-quoted keys win).
fn parse_path_to_read_segments(raw: &str) -> Vec<ReadPathSegment> {
    if let Ok(parsed) = ReadPath::parse_canonical(raw) {
        return parsed.into_segments();
    }
    Path::parse(raw)
        .segments
        .into_iter()
        .map(|seg| match seg {
            PathSegment::Exact(key) => ReadPathSegment::Key(key),
            PathSegment::Indexed(i) => ReadPathSegment::Index(i),
            PathSegment::Wildcard => ReadPathSegment::Wildcard,
            PathSegment::Special(s) => ReadPathSegment::Key(format!("[{s}]")),
        })
        .collect()
}

/// Parse an instance `schema` key into wildcard-normalized typed segments.
fn parse_schema_key_segments(declared: &str) -> Vec<ReadPathSegment> {
    normalize_read_segments(&parse_path_to_read_segments(declared))
}

/// Check a draft expression against the same declarations as whole-Definition lint.
///
/// Without a target, only function names are resolved. An empty target selects the root.
pub fn analyze_expression_in_definition(
    document: &Value,
    expression: &str,
    registries: &[Value],
    target: Option<&str>,
    mapping: bool,
) -> Value {
    let items = crate::tree::build_item_index(document);
    let semantics = ExpressionSemantics::new(document, &items, registries);
    let field_types = if target.is_some() {
        items
            .by_full_path
            .values()
            .filter_map(|item| Some((item.full_path.clone(), item.data_type.clone()?)))
            .collect()
    } else {
        Default::default()
    };
    let mut findings = Vec::new();
    let analysis = formspec_core::fel_analysis::analyze_fel_with_dependencies(
        expression,
        &field_types,
        |dependencies| {
            semantics.check_reads(
                dependencies,
                "expression",
                target,
                target.is_none(),
                |name, finding| {
                    // Mapping expressions also bind @source and @target (Mapping §3).
                    if mapping
                        && finding.code == LintCode::E403
                        && matches!(name, "source" | "target")
                    {
                        return;
                    }
                    let variable_hint = finding.code == LintCode::E402
                        && (semantics.variable_visible(semantics.scope(target), name)
                            || mapping && matches!(name, "source" | "target"));
                    findings.push(serde_json::json!({
                        "name": name,
                        "code": finding.code,
                        "severity": finding.severity.as_wire_str(),
                        "message": finding.message,
                        "variableHint": variable_hint,
                    }));
                },
            );
        },
    );
    let mut result = formspec_core::fel_analysis::fel_analysis_to_json_value(&analysis);
    result["findings"] = Value::Array(findings);
    result
}

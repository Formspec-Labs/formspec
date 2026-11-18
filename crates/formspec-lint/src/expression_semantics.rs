//! Resolve static FEL dependencies in the Definition that owns each expression.

use std::collections::{BTreeSet, HashSet};

use fel_core::{Expr, builtin_function_catalog, extract_dependencies};
use formspec_core::fel_analysis::RESERVED_CONTEXT_NAMES;
use formspec_core::path_utils::Path;
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
        let dependencies = extract_dependencies(parsed);
        for function in dependencies.functions().collect::<BTreeSet<_>>() {
            if !self.functions.contains(function) {
                diagnostics.push(error(
                    LintCode::E401,
                    4,
                    path,
                    format!("Unknown FEL function {function}()"),
                ));
            }
        }
        if migration {
            return;
        }

        let target = target
            .map(formspec_core::normalize_indexed_path)
            .unwrap_or_default();
        let scope = self
            .items
            .by_full_path
            .get(&target)
            .or_else(|| self.items.by_key.get(&target))
            .map_or("", |item| item.full_path.as_str());
        for field in dependencies.fields.iter().collect::<BTreeSet<_>>() {
            if !self.field_exists(scope, field) {
                diagnostics.push(error(
                    LintCode::E402,
                    4,
                    path,
                    format!("Unknown field reference ${field}"),
                ));
            }
        }
        let names: BTreeSet<_> = dependencies
            .context_names()
            .filter(|name| !RESERVED_CONTEXT_NAMES.contains(name))
            .collect();
        for name in names {
            if !self.variable_visible(scope, name) {
                diagnostics.push(error(
                    LintCode::E403,
                    4,
                    path,
                    format!("Variable @{name} is not declared in this scope"),
                ));
            }
        }
        for (name, reads) in &dependencies.instance_reads {
            if self.document["instances"].get(name).is_none() {
                self.check_instance_read(name, "", path, diagnostics);
            } else {
                for read in reads {
                    self.check_instance_read(name, read, path, diagnostics);
                }
            }
        }
    }

    /// Read a field by lexical scope, then follow only declared group members.
    fn field_exists(&self, scope: &str, field: &str) -> bool {
        let parts = formspec_core::split_normalized_path(field);
        let Some((head, tail)) = parts.split_first() else {
            return true;
        };
        let Some(mut resolved) = resolve_head(
            &|key| self.items.by_full_path.contains_key(key),
            scope,
            head,
        ) else {
            return false;
        };
        for part in tail {
            // Object-valued fields expose their payload as FEL members.
            if self.items.by_full_path.get(&resolved).is_some_and(|item| {
                matches!(item.data_type.as_deref(), Some("money" | "attachment"))
            }) {
                return true;
            }
            resolved.push('.');
            resolved.push_str(part);
            if !self.items.by_full_path.contains_key(&resolved) {
                return false;
            }
        }
        true
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
        read: &str,
        path: &str,
        diagnostics: &mut Vec<LintDiagnostic>,
    ) {
        let Some(instance) = self.document["instances"].get(name) else {
            diagnostics.push(error(
                LintCode::E404,
                4,
                path,
                format!("Instance {name:?} is not declared"),
            ));
            return;
        };
        let Some(schema) = instance["schema"].as_object() else {
            return;
        };
        // A Mapping changes the shape after projecting input columns. Its output
        // cannot be checked against the upstream schema (Core §4.4.1).
        if read.is_empty() || instance.pointer("/response/mapping").is_some() {
            return;
        }
        let normalized = Path::parse(read).to_wildcard_string();
        let column = if instance
            .pointer("/response/cardinality")
            .and_then(Value::as_str)
            == Some("latest-per-subject")
        {
            normalized
                .strip_prefix("[*]")
                .map(|suffix| suffix.trim_start_matches('.'))
        } else {
            Some(normalized.as_str())
        };
        if column.is_some_and(|column| {
            column.is_empty()
                || schema
                    .keys()
                    .any(|declared| path_prefix(column, declared) || path_prefix(declared, column))
        }) {
            return;
        }
        let message = format!("Path {read:?} on instance {name:?} is outside its declared schema");
        diagnostics.push(if instance.get("response").is_some() {
            error(LintCode::E405, 4, path, message)
        } else {
            warning(LintCode::W405, 4, path, message)
        });
    }
}

/// A declared leaf delivers the entire value. Its enclosing containers are also readable.
fn path_prefix(prefix: &str, path: &str) -> bool {
    path.strip_prefix(prefix)
        .is_some_and(|tail| tail.is_empty() || tail.starts_with(['.', '[']))
}

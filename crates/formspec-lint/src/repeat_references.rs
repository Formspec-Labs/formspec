//! E304 checks subscripts against the Definition at each expression site.

use std::collections::BTreeSet;

use fel_core::ast::{Expr, PathSegment};
use formspec_core::path_utils::{Path, PathSegment as ItemPathSegment};
use serde_json::Value;

use crate::expressions::CompiledExpression;
use crate::tree::ItemTreeIndex;
use crate::{LintCode, LintDiagnostic, metadata};

/// Check parsed Definition expressions and templates outside the dependency census.
pub(crate) fn check_definition(
    document: &Value,
    items: &ItemTreeIndex,
    compiled: &[CompiledExpression],
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    if items.repeatable_groups.is_empty() {
        return;
    }
    for expression in compiled {
        let variable_scope = expression.variable.as_ref().map(|variable| {
            items
                .by_key
                .get(&variable.scope)
                .filter(|item| item.is_repeatable)
                .map_or_else(
                    || variable.scope.clone(),
                    |item| format!("{}[*]", item.full_path),
                )
        });
        let target = expression
            .bind
            .as_ref()
            .map(|bind| bind.path.as_str())
            .or(expression.shape_target.as_deref())
            .or(expression.shape_context_target.as_deref())
            .or(variable_scope.as_deref());
        check_expression(
            items,
            target,
            &expression.expression_path,
            &expression.parsed,
            diagnostics,
        );
    }

    let mut check_template = |text: &Value, target: Option<&str>, path: &str| {
        if let Some(text) = text.as_str() {
            check_interpolations(text, |expression| {
                if let Ok(parsed) = fel_core::parse(expression) {
                    check_expression(items, target, path, &parsed, diagnostics);
                }
            });
        }
    };
    match document.get("binds") {
        Some(Value::Array(binds)) => {
            for (index, bind) in binds.iter().enumerate() {
                if let Some(message) = bind.get("constraintMessage") {
                    let target = bind.get("path").and_then(Value::as_str);
                    check_template(
                        message,
                        target,
                        &format!("$.binds[{index}].constraintMessage"),
                    );
                }
            }
        }
        Some(Value::Object(binds)) => {
            for (target, bind) in binds {
                if let Some(message) = bind.get("constraintMessage") {
                    check_template(
                        message,
                        Some(target),
                        &format!("$.binds.{target}.constraintMessage"),
                    );
                }
            }
        }
        _ => {}
    }
    if let Some(shapes) = document.get("shapes").and_then(Value::as_array) {
        for (index, shape) in shapes.iter().enumerate() {
            if let Some(message) = shape.get("message") {
                let target = shape.get("target").and_then(Value::as_str);
                check_template(message, target, &format!("$.shapes[{index}].message"));
            }
        }
    }
    formspec_core::visit_definition_items_from_document(document, &mut |ctx| {
        let target = Some(ctx.dotted_path.as_str());
        for name in ["label", "description", "hint"] {
            if let Some(text) = ctx.item.get(name) {
                check_template(text, target, &format!("{}.{name}", ctx.json_path));
            }
        }
        if let Some(labels) = ctx.item.get("labels").and_then(Value::as_object) {
            for (name, text) in labels {
                check_template(text, target, &format!("{}.labels.{name}", ctx.json_path));
            }
        }
    });
}

/// Visit each unescaped `{{expression}}` in a text slot (Locale §3.3.1).
fn check_interpolations(mut text: &str, mut check: impl FnMut(&str)) {
    while let Some((_, after_open)) = text.split_once("{{") {
        if let Some(after_escape) = after_open.strip_prefix("{{") {
            text = after_escape;
        } else if let Some((expression, rest)) = after_open.split_once("}}") {
            check(expression);
            text = rest;
        } else {
            break;
        }
    }
}

/// Report each repeatable group traversed without a subscript at this site.
pub(crate) fn check_expression(
    items: &ItemTreeIndex,
    target: Option<&str>,
    expression_path: &str,
    expression: &Expr,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    if items.repeatable_groups.is_empty() {
        return;
    }
    let site_path = target.map(Path::parse).unwrap_or_default();
    let dotted = site_path.strip_indices();
    let site = {
        items
            .by_full_path
            .get(&dotted)
            .or_else(|| items.by_key.get(&dotted))
    };
    let scope = site.map_or("", |item| item.full_path.as_str());
    let is_row = matches!(
        site_path.segments.last(),
        Some(ItemPathSegment::Indexed(_) | ItemPathSegment::Wildcard)
    );
    let current_row = enclosing_repeat(items, scope, is_row);
    let mut offenders = BTreeSet::new();
    visit_field_paths(
        expression,
        &mut Vec::new(),
        &mut Vec::new(),
        &mut |root, tail| {
            let (path, mut subscripted) = match root {
                FieldRoot::Named(head) => (resolve_head(items, scope, head), false),
                FieldRoot::CurrentRow => (current_row.map(str::to_owned), true),
            };
            let Some(mut path) = path else {
                return;
            };
            for segment in tail.iter().rev() {
                match segment {
                    FieldStep::Key(key) => {
                        if !subscripted && items.repeatable_groups.contains(&path) {
                            offenders.insert(path.clone());
                        }
                        path.push('.');
                        path.push_str(key);
                        subscripted = false;
                    }
                    FieldStep::Subscript => subscripted = true,
                }
            }
        },
    );
    diagnostics.extend(offenders.into_iter().map(|path| {
        metadata::with_metadata(LintDiagnostic::error(
            LintCode::E304,
            3,
            expression_path,
            format!("A field path continues through repeatable group '{path}' without a subscript"),
        ))
    }));
}

/// Find the innermost repeat row enclosing the site.
fn enclosing_repeat<'a>(
    items: &ItemTreeIndex,
    mut scope: &'a str,
    is_row: bool,
) -> Option<&'a str> {
    if !is_row {
        scope = scope.rsplit_once('.').map_or("", |(parent, _)| parent);
    }
    while !scope.is_empty() {
        if items.repeatable_groups.contains(scope) {
            return Some(scope);
        }
        scope = scope.rsplit_once('.').map_or("", |(parent, _)| parent);
    }
    None
}

/// Look up the first key from the expression's closest enclosing scope to the root.
fn resolve_head(items: &ItemTreeIndex, mut scope: &str, key: &str) -> Option<String> {
    while !scope.is_empty() {
        let candidate = format!("{scope}.{key}");
        if items.by_full_path.contains_key(&candidate) {
            return Some(candidate);
        }
        scope = scope.rsplit_once('.').map_or("", |(parent, _)| parent);
    }
    items.by_full_path.contains_key(key).then(|| key.to_owned())
}

/// Root of a field path against the Definition's Instance data.
enum FieldRoot<'a> {
    /// A field key resolved lexically from the current site.
    Named(&'a str),
    /// The innermost repeat row (`@current`).
    CurrentRow,
}

/// A field name or explicit row subscript. Index values are immaterial to E304.
enum FieldStep<'a> {
    /// A key after a dot.
    Key(&'a str),
    /// An explicit index or wildcard.
    Subscript,
}

impl<'a> From<&'a PathSegment> for FieldStep<'a> {
    fn from(segment: &'a PathSegment) -> Self {
        match segment {
            PathSegment::Dot(key) => Self::Key(key),
            PathSegment::Index(_) | PathSegment::Wildcard => Self::Subscript,
        }
    }
}

/// Visit authored field paths, including bare names and paths anchored at `@current`.
///
/// The parser makes `rows.amount` and `($rows).amount` postfix nodes. Keep their suffixes
/// until reaching a field reference. A suffix on another expression accesses its result.
fn visit_field_paths<'a>(
    expression: &'a Expr,
    locals: &mut Vec<&'a str>,
    suffix: &mut Vec<FieldStep<'a>>,
    visit: &mut impl FnMut(FieldRoot<'a>, &[FieldStep<'a>]),
) {
    match expression {
        Expr::FieldRef {
            name: Some(name),
            path,
        }
        | Expr::VarRef { name, path } => {
            if !locals.contains(&name.as_str()) {
                let previous = suffix.len();
                suffix.extend(path.iter().rev().map(FieldStep::from));
                visit(FieldRoot::Named(name), suffix);
                suffix.truncate(previous);
            }
            return;
        }
        Expr::ContextRef {
            name,
            called: false,
            tail,
            ..
        } if name == "current" => {
            let previous = suffix.len();
            suffix.extend(tail.iter().rev().map(|key| FieldStep::Key(key)));
            visit(FieldRoot::CurrentRow, suffix);
            suffix.truncate(previous);
            return;
        }
        Expr::PostfixAccess { expr, path } => {
            let previous = suffix.len();
            suffix.extend(path.iter().rev().map(FieldStep::from));
            visit_field_paths(expr, locals, suffix, visit);
            suffix.truncate(previous);
            return;
        }
        Expr::LetBinding { name, value, body } => {
            visit_field_paths(value, locals, &mut Vec::new(), visit);
            locals.push(name);
            visit_field_paths(body, locals, &mut Vec::new(), visit);
            locals.pop();
            return;
        }
        _ => {}
    }

    let mut child = |expr| visit_field_paths(expr, locals, &mut Vec::new(), visit);
    match expression {
        Expr::UnaryOp { operand, .. } => child(operand),
        Expr::BinaryOp { left, right, .. } | Expr::NullCoalesce { left, right } => {
            child(left);
            child(right);
        }
        Expr::Ternary {
            condition,
            then_branch,
            else_branch,
        }
        | Expr::IfThenElse {
            condition,
            then_branch,
            else_branch,
        } => {
            child(condition);
            child(then_branch);
            child(else_branch);
        }
        Expr::Membership {
            value, container, ..
        } => {
            child(value);
            child(container);
        }
        Expr::FunctionCall { args, .. } | Expr::Array(args) => args.iter().for_each(child),
        Expr::Object(entries) => entries.iter().for_each(|(_, value)| child(value)),
        _ => {}
    }
}

//! Detect authored field paths that cross a repeat without a subscript.

use std::collections::BTreeSet;

use fel_core::ast::{Expr, PathSegment};

use crate::path_utils::{Path, PathSegment as ItemPathSegment};

/// Check whether an Item declares a repeatable Group (Core §4.2.4).
///
/// During traversal an omitted Item type is inferred as a Group when
/// `repeatable` is true. Definition validation still requires an explicit type.
pub fn is_repeatable_group(item_type: Option<&str>, repeatable: Option<bool>) -> bool {
    repeatable == Some(true) && item_type.is_none_or(|kind| kind == "group")
}

/// Map a variable's scope Item key to its expression site (Core §4.5.1).
///
/// A variable scoped to a repeatable Group runs at a row site. The form scope
/// (`#`) and unrecognized Item keys have no Item site.
pub fn variable_target<'a>(
    scope: &str,
    path_by_key: impl FnOnce(&str) -> Option<&'a str>,
    is_repeat: impl FnOnce(&str) -> bool,
) -> Option<String> {
    if scope == "#" {
        return None;
    }
    let path = path_by_key(scope)?;
    Some(if is_repeat(path) {
        format!("{path}[*]")
    } else {
        path.to_owned()
    })
}

/// Find repeat groups traversed without a subscript, once per distinct group.
///
/// The caller supplies declared Item paths and repeatability from its Definition index.
/// The site resolver maps authored targets or Item keys to dotted Item paths.
pub fn unsubscripted_repeats(
    target: Option<&str>,
    expression: &Expr,
    resolve_site: impl Fn(&str) -> Option<String>,
    declares: impl Fn(&str) -> bool,
    is_repeat: impl Fn(&str) -> bool,
) -> BTreeSet<String> {
    let site_path = target.map(Path::parse).unwrap_or_default();
    let dotted = site_path.strip_indices();
    let scoped = resolve_site(&dotted).unwrap_or_default();
    let scope = scoped.as_str();
    let is_row = matches!(
        site_path.segments.last(),
        Some(ItemPathSegment::Indexed(_) | ItemPathSegment::Wildcard)
    );
    let current_row = enclosing_repeat(&is_repeat, scope, is_row);
    let mut offenders = BTreeSet::new();
    visit_field_paths(
        expression,
        &mut Vec::new(),
        &mut Vec::new(),
        &mut |root, tail| {
            let (path, mut subscripted) = match root {
                FieldRoot::Named(head) => (resolve_head(&declares, scope, head), false),
                FieldRoot::CurrentRow => (current_row.map(str::to_owned), true),
            };
            let Some(mut path) = path else {
                return;
            };
            for segment in tail.iter().rev() {
                match segment {
                    FieldStep::Key(key) => {
                        if !subscripted && is_repeat(&path) {
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
    offenders
}

/// Describe the invalid step in an authored field path.
pub fn unsubscripted_repeat_message(path: &str) -> String {
    format!("A field path continues through repeatable group '{path}' without a subscript")
}

/// Find the innermost repeat row enclosing the site.
fn enclosing_repeat<'a>(
    is_repeat: &impl Fn(&str) -> bool,
    mut scope: &'a str,
    is_row: bool,
) -> Option<&'a str> {
    if !is_row {
        scope = scope.rsplit_once('.').map_or("", |(parent, _)| parent);
    }
    while !scope.is_empty() {
        if is_repeat(scope) {
            return Some(scope);
        }
        scope = scope.rsplit_once('.').map_or("", |(parent, _)| parent);
    }
    None
}

/// Look up the first key from the expression's closest enclosing scope to the root.
fn resolve_head(declares: &impl Fn(&str) -> bool, mut scope: &str, key: &str) -> Option<String> {
    while !scope.is_empty() {
        let candidate = format!("{scope}.{key}");
        if declares(&candidate) {
            return Some(candidate);
        }
        scope = scope.rsplit_once('.').map_or("", |(parent, _)| parent);
    }
    declares(key).then(|| key.to_owned())
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
/// until reaching a field reference. A suffix after a wildcard projection or another
/// expression accesses its result.
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
                let steps = if path.contains(&PathSegment::Wildcard) {
                    &suffix[previous..]
                } else {
                    suffix.as_slice()
                };
                visit(FieldRoot::Named(name), steps);
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

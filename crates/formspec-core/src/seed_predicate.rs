//! Static checks for a creation-time repeat seed predicate.

use fel_core::Expr;
use fel_core::exact_json::JsonTree;
use fel_core::parser::{SiteKind, parse_with_sites};

/// A Definition error in `seedFrom.where`.
#[derive(Debug)]
pub struct SeedPredicateError {
    /// Machine-readable diagnostic code.
    pub code: &'static str,
    /// Author-facing explanation.
    pub message: String,
}

/// Parse a predicate and check that all of its inputs are available at creation.
///
/// # Errors
/// Returns the first syntax, arity, or scope error in the predicate.
pub fn parse_seed_predicate<V: JsonTree>(
    definition: &V,
    source: &str,
) -> Result<Expr, SeedPredicateError> {
    let (expression, sites) = parse_with_sites(source).map_err(|error| SeedPredicateError {
        code: "SYNTAX_ERROR",
        message: error.to_string(),
    })?;
    if let Some(error) = fel_core::builtin_arity_mismatches(&expression)
        .into_iter()
        .next()
    {
        return Err(SeedPredicateError {
            code: "ARITY_MISMATCH",
            message: error.message,
        });
    }
    for site in sites {
        match site.kind {
            SiteKind::UnboundName { .. } => {
                return Err(scope_error(
                    "Use $.field to read the candidate or let to bind a local name.",
                ));
            }
            SiteKind::Field { path, .. } => {
                return Err(scope_error(format!(
                    "Seed predicate cannot read ${path}; use $.{path} for a candidate field."
                )));
            }
            _ => {}
        }
    }
    check_scope(&expression, definition.get("instances"))?;
    Ok(expression)
}

/// Produce a Definition error for an input outside the selector's scope.
fn scope_error(message: impl Into<String>) -> SeedPredicateError {
    SeedPredicateError {
        code: "SEED_PREDICATE_SCOPE",
        message: message.into(),
    }
}

/// Check references and calls even in branches that will be skipped during evaluation.
fn check_scope<V: JsonTree>(expr: &Expr, instances: Option<&V>) -> Result<(), SeedPredicateError> {
    let declared = |name: &str| {
        instances
            .and_then(|declared| declared.get(name))
            .is_some()
            .then_some(())
            .ok_or_else(|| {
                scope_error(format!(
                    "Seed predicate instance {name:?} must be declared."
                ))
            })
    };
    let check = |child: &Expr| check_scope(child, instances);
    match expr {
        Expr::ContextRef {
            name, called, arg, ..
        } => match (name.as_str(), called, arg) {
            ("instance", true, Some(instance)) => declared(instance)?,
            _ => return Err(scope_error(format!("Seed predicate cannot read @{name}."))),
        },
        Expr::FunctionCall { name, args } => {
            match name.as_str() {
                "instance" => match args.first() {
                    Some(Expr::String(instance)) => declared(instance)?,
                    _ => {
                        return Err(scope_error(
                            "Seed predicate requires a literal instance name.",
                        ));
                    }
                },
                "today" | "now" | "locale" | "runtimeMeta" | "valid" | "relevant" | "readonly"
                | "required" | "prev" | "next" | "parent" => {
                    return Err(scope_error(format!("Seed predicate cannot call {name}().")));
                }
                _ if fel_core::builtin_arity(name).is_none() => {
                    return Err(scope_error(format!("Seed predicate cannot call {name}().")));
                }
                _ => {}
            }
            args.iter().try_for_each(check)?;
        }
        Expr::Array(values) => values.iter().try_for_each(check)?,
        Expr::Object(values) => values.iter().try_for_each(|(_, value)| check(value))?,
        Expr::UnaryOp { operand, .. } | Expr::PostfixAccess { expr: operand, .. } => {
            check(operand)?
        }
        Expr::BinaryOp { left, right, .. }
        | Expr::NullCoalesce { left, right }
        | Expr::Membership {
            value: left,
            container: right,
            ..
        }
        | Expr::LetBinding {
            value: left,
            body: right,
            ..
        }
        | Expr::RowLookup {
            source: left,
            key: right,
            ..
        } => {
            check(left)?;
            check(right)?;
        }
        Expr::IfThenElse {
            condition,
            then_branch,
            else_branch,
        }
        | Expr::Ternary {
            condition,
            then_branch,
            else_branch,
        } => {
            check(condition)?;
            check(then_branch)?;
            check(else_branch)?;
        }
        Expr::Null
        | Expr::Boolean(_)
        | Expr::Number(_)
        | Expr::String(_)
        | Expr::DateLiteral(_)
        | Expr::DateTimeLiteral(_)
        | Expr::FieldRef { .. }
        | Expr::VarRef { .. } => {}
    }
    Ok(())
}

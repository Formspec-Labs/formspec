//! Refuse invalid authored expressions before any expression in the Definition runs (Core §3.10.1).

use std::collections::{HashMap, HashSet};

use fel_core::exact_json::Value;
use formspec_core::definition_expressions::{
    ExpressionSite, visit_expressions, visit_initial_value_expressions, visit_seed_predicates,
    visit_template_expressions,
};
use formspec_core::repeat_references::{
    unsubscripted_repeat_message, unsubscripted_repeats, variable_target,
};

use crate::types::{
    ConstraintKind, ItemInfo, Severity, ValidationCode, ValidationResult, ValidationSource,
};

/// Return one Definition error per syntax error, arity mismatch, or unsubscripted repeat path.
pub(crate) fn check(definition: &Value, items: &[ItemInfo]) -> Vec<ValidationResult> {
    let mut by_path = HashSet::new();
    let mut by_key = HashMap::new();
    let mut repeats = HashSet::new();
    index_items(items, &mut by_path, &mut by_key, &mut repeats);

    let mut errors = Vec::new();
    // `display` marks `{{}}` text: an interpolation that fails to parse or evaluate renders
    // literally (Core §4.2.1, Locale §3.3.1), so only its repeat paths can refuse the Definition.
    let mut check_expression =
        |source: &str, target: Option<&str>, location: &str, display: bool| {
            let mut refuse = |code, message: String| {
                errors.push(ValidationResult {
                    path: location.to_owned(),
                    severity: Severity::Error,
                    constraint_kind: ConstraintKind::Definition,
                    code,
                    message,
                    constraint: Some(source.to_owned()),
                    source: Some(ValidationSource::Definition),
                    shape_id: None,
                    context: None,
                });
            };
            let expression = match fel_core::parse(source) {
                Ok(expression) => expression,
                Err(error) => {
                    if !display {
                        refuse(ValidationCode::SyntaxError, syntax_message(&error, source));
                    }
                    return;
                }
            };
            if !display {
                for mismatch in fel_core::builtin_arity_mismatches(&expression) {
                    refuse(ValidationCode::ArityMismatch, mismatch.message);
                }
            }
            if repeats.is_empty() {
                return;
            }
            let offenders = unsubscripted_repeats(
                target,
                &expression,
                |path| {
                    by_path
                        .get(path)
                        .copied()
                        .or_else(|| by_key.get(path).copied())
                        .map(str::to_owned)
                },
                |path| by_path.contains(path),
                |path| repeats.contains(path),
            );
            if !offenders.is_empty() {
                let messages: Vec<_> = offenders
                    .iter()
                    .map(|path| unsubscripted_repeat_message(path))
                    .collect();
                refuse(
                    ValidationCode::UnsubscriptedRepeatReference,
                    messages.join(". "),
                );
            }
        };
    visit_expressions(definition, |source, location, site| {
        if let ExpressionSite::Variable(Some(_), scope) = site {
            let target = variable_target(
                scope,
                |key| by_key.get(key).copied(),
                |path| repeats.contains(path),
            );
            check_expression(source, target.as_deref(), &location, false);
        } else {
            check_expression(source, site.target(), &location, false);
        }
    });
    if !repeats.is_empty() {
        visit_template_expressions(definition, |source, target, location| {
            check_expression(source, target, location, true);
        });
    }
    visit_initial_value_expressions(definition, |source, target, location| {
        check_expression(source, Some(target), location, false);
    });
    visit_seed_predicates(definition, Value::as_bool, |source, path| {
        if let Err(error) = formspec_core::seed_predicate::parse_seed_predicate(definition, source)
        {
            errors.push(ValidationResult {
                path: path.to_owned(),
                severity: Severity::Error,
                constraint_kind: ConstraintKind::Definition,
                code: ValidationCode::from_wire(error.code),
                message: error.message,
                constraint: Some(source.to_owned()),
                source: Some(ValidationSource::Definition),
                shape_id: None,
                context: None,
            });
        }
    });
    errors
}

/// Core §3.10.1: the message names the expression and the approximate error position.
fn syntax_message(error: &fel_core::Error, source: &str) -> String {
    let fel_core::Error::Parse(error) = error;
    let position = error
        .span
        .as_ref()
        .map(|span| format!(" at position {}", span.start))
        .unwrap_or_default();
    format!(
        "FEL syntax error in {source:?}{position}: {}",
        error.message
    )
}

/// Index declared paths, Item keys, and repeat groups for expression checks.
fn index_items<'a>(
    items: &'a [ItemInfo],
    by_path: &mut HashSet<&'a str>,
    by_key: &mut HashMap<&'a str, &'a str>,
    repeats: &mut HashSet<&'a str>,
) {
    for item in items {
        by_path.insert(&item.path);
        by_key.entry(&item.key).or_insert(&item.path);
        if item.repeatable {
            repeats.insert(&item.path);
        }
        index_items(&item.children, by_path, by_key, repeats);
    }
}

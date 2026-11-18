//! Reject unsubscripted repeat paths before any expression in the Definition runs.

use std::collections::{HashMap, HashSet};

use fel_core::exact_json::Value;
use formspec_core::definition_expressions::{
    ExpressionSite, visit_expressions, visit_initial_value_expressions, visit_template_expressions,
};
use formspec_core::repeat_references::{
    unsubscripted_repeat_message, unsubscripted_repeats, variable_target,
};

use crate::types::{
    ConstraintKind, ItemInfo, Severity, ValidationCode, ValidationResult, ValidationSource,
};

/// Return one definition error for each invalid authored expression.
pub(crate) fn check(definition: &Value, items: &[ItemInfo]) -> Vec<ValidationResult> {
    let mut by_path = HashSet::new();
    let mut by_key = HashMap::new();
    let mut repeats = HashSet::new();
    index_items(items, &mut by_path, &mut by_key, &mut repeats);
    if repeats.is_empty() {
        return Vec::new();
    }

    let mut errors = Vec::new();
    let mut check_expression = |source: &str, target: Option<&str>, location: &str| {
        let Ok(expression) = fel_core::parse(source) else {
            return;
        };
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
            errors.push(ValidationResult {
                path: location.to_owned(),
                severity: Severity::Error,
                constraint_kind: ConstraintKind::Definition,
                code: ValidationCode::UnsubscriptedRepeatReference,
                message: messages.join(". "),
                constraint: Some(source.to_owned()),
                source: Some(ValidationSource::Definition),
                shape_id: None,
                context: None,
            });
        }
    };
    visit_expressions(definition, |source, location, site| {
        if let ExpressionSite::Variable(Some(_), scope) = site {
            let target = variable_target(
                scope,
                |key| by_key.get(key).copied(),
                |path| repeats.contains(path),
            );
            check_expression(source, target.as_deref(), &location);
        } else {
            check_expression(source, site.target(), &location);
        }
    });
    visit_template_expressions(definition, &mut check_expression);
    visit_initial_value_expressions(definition, |source, target, location| {
        check_expression(source, Some(target), location);
    });
    errors
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

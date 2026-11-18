//! E304 checks subscripts against the Definition at each expression site.

use fel_core::ast::Expr;
use formspec_core::definition_expressions::visit_template_expressions;
use formspec_core::repeat_references::{
    unsubscripted_repeat_message, unsubscripted_repeats, variable_target,
};
use serde_json::Value;

use crate::expressions::CompiledExpression;
use crate::tree::ItemTreeIndex;
use crate::{LintCode, LintDiagnostic, metadata};

/// Check parsed Definition expressions and templates outside the dependency census.
///
/// Templates are parsed here only, so their bare names (E406) are reported even when the
/// Definition has no repeatable group.
pub(crate) fn check_definition(
    document: &Value,
    items: &ItemTreeIndex,
    compiled: &[CompiledExpression],
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    visit_template_expressions(document, |source, target, path| {
        if let Ok(parsed) = crate::expressions::parse_fel(source, path, diagnostics) {
            check_expression(items, target, path, &parsed, diagnostics);
        }
    });
    if items.repeatable_groups.is_empty() {
        return;
    }
    for expression in compiled {
        let variable_scope = expression.variable.as_ref().and_then(|variable| {
            variable_target(
                &variable.scope,
                |key| items.by_key.get(key).map(|item| item.full_path.as_str()),
                |path| items.repeatable_groups.contains(path),
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
    let offenders = unsubscripted_repeats(
        target,
        expression,
        |path| {
            items
                .by_full_path
                .get(path)
                .or_else(|| items.by_key.get(path))
                .map(|item| item.full_path.clone())
        },
        |path| items.by_full_path.contains_key(path),
        |path| items.repeatable_groups.contains(path),
    );
    diagnostics.extend(offenders.into_iter().map(|path| {
        metadata::with_metadata(LintDiagnostic::error(
            LintCode::E304,
            3,
            expression_path,
            unsubscripted_repeat_message(&path),
        ))
    }));
}

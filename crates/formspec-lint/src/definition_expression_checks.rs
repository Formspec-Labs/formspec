//! Definition-wide checks for reactive expressions, seeds, text, fees and migrations.

use crate::LintDiagnostic;
use crate::expression_semantics::ExpressionSemantics;
use crate::expressions::CompiledExpression;
use crate::repeat_references::check_expression;
use crate::tree::ItemTreeIndex;
use formspec_core::definition_expressions::{
    AdditionalExpressionSite, visit_additional_expressions,
};
use formspec_core::definition_instance_reads::visit_creation_instance_reads;
use formspec_core::repeat_references::variable_target;
use serde_json::Value;

/// Apply lint rules at every expression site, preserving each site's field scope.
pub(crate) fn check_definition(
    document: &Value,
    items: &ItemTreeIndex,
    compiled: &[CompiledExpression],
    registries: &[Value],
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    let semantics = ExpressionSemantics::new(document, items, registries);
    visit_creation_instance_reads(document, |name, read, path| {
        semantics.check_instance_read(name, read, path, diagnostics);
    });
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
        semantics.check(
            &expression.parsed,
            &expression.expression_path,
            target,
            false,
            diagnostics,
        );
        check_expression(
            items,
            target,
            &expression.expression_path,
            &expression.parsed,
            diagnostics,
        );
    }

    visit_additional_expressions(document, |source, path, site| {
        let target = match site {
            AdditionalExpressionSite::Item(target) => target,
            AdditionalExpressionSite::Fee | AdditionalExpressionSite::Migration => None,
            AdditionalExpressionSite::UnclosedTemplate => {
                diagnostics.push(crate::metadata::with_metadata(LintDiagnostic::error(
                    crate::LintCode::E400,
                    4,
                    &path,
                    "Missing closing delimiter in FEL interpolation",
                )));
                return;
            }
        };
        match crate::expressions::parse_fel(source, &path, diagnostics) {
            Ok(parsed) => {
                // Migration transforms read a different version's Response (Core §6.7.1).
                let migration = site == AdditionalExpressionSite::Migration;
                semantics.check(&parsed, &path, target, migration, diagnostics);
                if !migration {
                    check_expression(items, target, &path, &parsed, diagnostics);
                }
            }
            Err(error) => diagnostics.push(crate::expressions::parse_error(&path, &error)),
        }
    });
}

//! E304 checks subscripts against the Definition at each expression site.

use fel_core::ast::Expr;
use formspec_core::repeat_references::{unsubscripted_repeat_message, unsubscripted_repeats};

use crate::tree::ItemTreeIndex;
use crate::{LintCode, LintDiagnostic, metadata};

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

//! Warning answer modes on Definition Shapes (Core §5.2.1, ADR 0173 §4.1).
//!
//! A warning Shape's effective mode is its own `explanation`, else the Definition's
//! `warningExplanation`, else `none`, read the way `formspec-eval` reads it. Emits:
//! - **E314** (pass 3): an error or info Shape declares a mode other than `none`.
//! - **E317** (pass 1): an acknowledge-mode warning Shape has no nonempty `code`. The Definition
//!   schema decides this for a declared and an inherited mode alike; [`schema_diagnostic`] names
//!   those schema errors so they carry this rule's fix instead of a generic E101. On an error or
//!   info Shape the schema error stays E101 beside E314, whose repair is the one that helps.
//! - **E318** (pass 3): warning Shapes sharing a code disagree on mode while one of them
//!   acknowledges it. A Shape's code is the one its results carry: its `code`, else the reserved
//!   default `SHAPE_FAILED` (Core §2.5.1). Only a code an acknowledge Shape declares is checked;
//!   an acknowledge Shape without a code is already E317, and declaring one is the repair.
// Rust guideline compliant 2026-02-21

use std::collections::BTreeMap;

use formspec_core::json_pointer_to_jsonpath;
use jsonschema::{ValidationError, error::ValidationErrorKind};
use serde_json::Value;

use crate::semantic_helpers::error;
use crate::{LintCode, LintDiagnostic};

/// The code a Shape result carries when the Shape declares none (Core §2.5.1).
///
/// Mirrors `formspec-eval` `revalidate/shapes.rs`; a code-less warning Shape shares this code
/// with any Shape that declares it.
const DEFAULT_SHAPE_CODE: &str = "SHAPE_FAILED";

/// A Shape's severity; `error` when omitted (Core §5.2.1).
fn shape_severity(shape: &Value) -> &str {
    shape
        .get("severity")
        .and_then(Value::as_str)
        .unwrap_or("error")
}

/// A Shape's answer mode: its `explanation`, else the Definition's `warningExplanation`, else `none`.
///
/// Mirrors `formspec-eval` `revalidate/mod.rs`: a present `explanation` of any value stops the
/// fallback.
fn effective_explanation_mode<'a>(shape: &'a Value, definition: &'a Value) -> &'a str {
    shape
        .get("explanation")
        .or_else(|| definition.get("warningExplanation"))
        .and_then(Value::as_str)
        .unwrap_or("none")
}

/// The code a Shape's results carry: its `code`, else [`DEFAULT_SHAPE_CODE`].
fn shape_result_code(shape: &Value) -> &str {
    shape
        .get("code")
        .and_then(Value::as_str)
        .unwrap_or(DEFAULT_SHAPE_CODE)
}

/// Name a schema error that asks an acknowledge-mode warning Shape for its code (E317).
///
/// Recognized by the error, not the schema path: a missing `code` on a Shape, or a too-short
/// `code`, where the Shape is a warning whose effective mode is acknowledge. Returns `None` for
/// every other schema error, which stays E101.
pub(crate) fn schema_diagnostic(doc: &Value, err: &ValidationError<'_>) -> Option<LintDiagnostic> {
    let pointer = err.instance_path().as_str();
    let shape_pointer = match err.kind() {
        ValidationErrorKind::Required { property } if property == "code" => pointer,
        ValidationErrorKind::MinLength { .. } => pointer.strip_suffix("/code")?,
        _ => return None,
    };
    shape_pointer
        .strip_prefix("/shapes/")?
        .parse::<usize>()
        .ok()?;
    let shape = doc.pointer(shape_pointer)?;
    if shape_severity(shape) != "warning" || effective_explanation_mode(shape, doc) != "acknowledge"
    {
        return None;
    }
    let message = if shape.get("explanation").is_some() {
        "An acknowledge Shape must declare a nonempty code"
    } else {
        "This warning Shape inherits acknowledge from warningExplanation and must declare a nonempty code"
    };
    Some(error(
        LintCode::E317,
        LintCode::E317.pass(),
        format!("{}.code", json_pointer_to_jsonpath(shape_pointer)),
        message,
    ))
}

/// Warning Shapes grouped under one result code, for E318.
#[derive(Default)]
struct CodeGroup<'a> {
    /// The first acknowledge Shape that declares the code.
    acknowledged_by: Option<&'a str>,
    /// Shapes with another mode, in document order: index, id, mode.
    others: Vec<(usize, &'a str, &'a str)>,
}

/// Check every Shape's answer mode against its severity and its code's other Shapes.
pub(crate) fn check(document: &Value) -> Vec<LintDiagnostic> {
    let Some(shapes) = document.get("shapes").and_then(Value::as_array) else {
        return Vec::new();
    };
    let mut diagnostics = Vec::new();
    let mut groups = BTreeMap::<&str, CodeGroup<'_>>::new();
    for (i, shape) in shapes.iter().enumerate() {
        let severity = shape_severity(shape);
        if severity != "warning" {
            if matches!(severity, "error" | "info")
                && matches!(
                    shape.get("explanation").and_then(Value::as_str),
                    Some("confirm" | "explain" | "acknowledge")
                )
            {
                diagnostics.push(error(
                    LintCode::E314,
                    LintCode::E314.pass(),
                    format!("$.shapes[{i}].explanation"),
                    "Only a warning Shape can request a respondent explanation",
                ));
            }
            continue;
        }
        let mode = effective_explanation_mode(shape, document);
        let group = groups.entry(shape_result_code(shape)).or_default();
        let id = shape.get("id").and_then(Value::as_str).unwrap_or("?");
        if mode != "acknowledge" {
            group.others.push((i, id, mode));
        } else if shape
            .get("code")
            .and_then(Value::as_str)
            .is_some_and(|c| !c.is_empty())
        {
            group.acknowledged_by.get_or_insert(id);
        }
    }
    for (code, group) in groups {
        let (Some(acknowledged_by), Some(&(first, _, _))) =
            (group.acknowledged_by, group.others.first())
        else {
            continue;
        };
        let others: Vec<_> = group
            .others
            .iter()
            .map(|(_, id, mode)| format!("'{id}' ({mode})"))
            .collect();
        diagnostics.push(error(
            LintCode::E318,
            LintCode::E318.pass(),
            format!("$.shapes[{first}].explanation"),
            format!(
                "Shape '{acknowledged_by}' acknowledges code '{code}', so every warning Shape \
                 with that code must too: {}",
                others.join(", ")
            ),
        ));
    }
    diagnostics
}

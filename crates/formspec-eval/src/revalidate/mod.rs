//! Phase 3: Revalidate — validate all constraints and shapes.
#![allow(clippy::missing_docs_in_private_items)]

mod expr;
mod items;
mod reads;
mod shapes;

use std::collections::{HashMap, HashSet};

use fel_core::exact_json::Value;

use crate::eval_options::EvalOptions;
use crate::fel_eval::Fel;
use crate::types::{EvalDiagnostic, EvalTrigger, ExtensionConstraint, ItemInfo, ValidationResult};

use crate::scope::{AggregateMemo, ScopeData, ScopeIndex, ScopedVariables};

/// Validate all constraints and shapes.
///
/// Shapes and the `$formspec` version come from `definition`; `options` supplies
/// the trigger, registry extension constraints, clock, repeat counts, and instances.
///
/// Returns validation results and, separately, author diagnostics for
/// constraint and shape expressions that hit evaluation errors (Core §3.10.2).
/// Those expressions evaluate to `null` and pass (§3.8.1), so they never
/// appear among the validation results.
pub fn revalidate(
    items: &[ItemInfo],
    values: &HashMap<String, Value>,
    variables: &HashMap<String, fel_core::Value>,
    definition: &Value,
    options: &EvalOptions,
) -> (Vec<ValidationResult>, Vec<EvalDiagnostic>) {
    let index = ScopeIndex::for_flat(items, values.keys());
    let variables = HashMap::from([("#".to_owned(), variables.clone())]);
    revalidate_scoped(
        items,
        &index,
        values,
        &variables,
        definition,
        options,
        &mut AggregateMemo::default(),
    )
}

pub(crate) fn revalidate_scoped(
    items: &[ItemInfo],
    index: &ScopeIndex,
    values: &HashMap<String, Value>,
    variables: &ScopedVariables,
    definition: &Value,
    options: &EvalOptions,
    aggregates: &mut AggregateMemo,
) -> (Vec<ValidationResult>, Vec<EvalDiagnostic>) {
    let mut findings = Findings::default();
    let trigger = options.trigger;

    if trigger == EvalTrigger::Disabled {
        return (findings.results, findings.diagnostics);
    }

    let (mut state, by_path) = validation_state(items, index, values, variables, options);
    state.restore_aggregates(aggregates);

    let shapes = definition
        .get("shapes")
        .and_then(Value::as_array)
        .map(Vec::as_slice);
    let validation = Validation {
        by_path,
        values,
        index,
        state: &state,
        shapes_by_id: shapes
            .unwrap_or(&[])
            .iter()
            .filter_map(|shape| {
                shape
                    .get("id")
                    .and_then(|v| v.as_str())
                    .map(|id| (id.to_string(), shape))
            })
            .collect(),
        ext_by_name: options
            .extension_constraints
            .iter()
            .map(|c| (c.name.as_str(), c))
            .collect(),
        formspec_version: definition
            .get("$formspec")
            .and_then(Value::as_str)
            .unwrap_or("1.0.0"),
        fel: Fel::new(options.extensions),
    };

    // Bind constraints + extension constraints
    validation.validate_items(items, &mut findings);

    // Shape rules are filtered by timing.
    if let Some(shapes) = shapes {
        for shape in shapes {
            let timing = shape
                .get("timing")
                .and_then(|v| v.as_str())
                .unwrap_or("continuous");
            match trigger {
                EvalTrigger::Disabled => unreachable!(),
                EvalTrigger::Continuous => {
                    if timing != "continuous" {
                        continue;
                    }
                }
                EvalTrigger::Submit => {
                    if timing == "demand" {
                        continue;
                    }
                }
                EvalTrigger::Demand => {
                    if timing != "demand" {
                        continue;
                    }
                }
            }
            validation.validate_shape(shape, &mut findings);
        }
    }

    // A shape referenced from a composition is evaluated again there; keep one copy.
    let mut seen = HashSet::new();
    findings.diagnostics.retain(|d| seen.insert(d.clone()));

    state.save_aggregates(aggregates);
    (findings.results, findings.diagnostics)
}

fn validation_state<'a>(
    items: &'a [ItemInfo],
    index: &ScopeIndex,
    values: &HashMap<String, Value>,
    variables: &ScopedVariables,
    options: &EvalOptions,
) -> (ScopeData, HashMap<&'a str, &'a ItemInfo>) {
    let mut state = ScopeData::for_values(index, values, options);
    state.variables.clone_from(variables);

    fn index_items<'a>(
        items: &'a [ItemInfo],
        by_path: &mut HashMap<&'a str, &'a ItemInfo>,
        state: &mut ScopeData,
        invalid_paths: &HashSet<&str>,
    ) {
        for item in items {
            by_path.insert(&item.path, item);
            state.env.set_mip(
                &item.path,
                fel_core::MipState {
                    valid: !invalid_paths.contains(item.path.as_str()),
                    relevant: item.mip.relevant,
                    readonly: item.mip.readonly,
                    required: item.mip.required,
                },
            );
            if !item.mip.relevant
                && item.excluded_value == Some(crate::types::ExcludedValueMode::Null)
            {
                state.set_field(&item.path, fel_core::Value::Null);
            }
            index_items(&item.children, by_path, state, invalid_paths);
        }
    }
    let mut by_path = HashMap::new();
    let invalid_paths = options
        .context
        .previous_validations
        .as_deref()
        .unwrap_or_default()
        .iter()
        .filter(|result| result.severity == crate::types::Severity::Error)
        .map(|result| result.path.as_str())
        .collect();
    index_items(items, &mut by_path, &mut state, &invalid_paths);
    (state, by_path)
}

/// Resolve reads once, after both calculation and ordinary validation have settled.
pub(crate) fn explanation_findings(
    items: &[ItemInfo],
    index: &ScopeIndex,
    values: &HashMap<String, Value>,
    variables: &ScopedVariables,
    definition: &Value,
    options: &EvalOptions,
    findings: &mut Vec<ValidationResult>,
) -> Vec<crate::explanations::ExplanationFinding> {
    use crate::types::{ConstraintKind, Severity};
    let warnings = findings
        .iter()
        .filter(|f| f.constraint_kind == ConstraintKind::Shape && f.severity == Severity::Warning);
    if warnings.clone().next().is_none() {
        return Vec::new();
    }
    let shapes_by_id: HashMap<_, _> = definition["shapes"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|s| Some((s["id"].as_str()?.to_owned(), s)))
        .collect();
    let mut cache = HashMap::new();
    let mut reads_cache = reads::ShapeReadsCache::default();
    let mut failures = Vec::new();
    let mut explained = Vec::new();
    let mut state = None;
    for finding in warnings {
        let Some(id) = &finding.shape_id else {
            continue;
        };
        let Some(shape) = shapes_by_id.get(id) else {
            continue;
        };
        let mode = match shape
            .get("explanation")
            .or_else(|| definition.get("warningExplanation"))
            .and_then(Value::as_str)
        {
            Some("confirm") => crate::explanations::ExplanationMode::Confirm,
            Some("explain") => crate::explanations::ExplanationMode::Explain,
            Some("acknowledge") => crate::explanations::ExplanationMode::Acknowledge,
            _ => continue,
        };
        let state = state
            .get_or_insert_with(|| validation_state(items, index, values, variables, options).0);
        let site = state.site(index, &finding.path);
        match reads::inputs_for_shape(
            shape,
            &shapes_by_id,
            &site,
            Fel::new(options.extensions),
            &mut cache,
            &mut reads_cache,
        ) {
            Ok(inputs) => explained.push(crate::explanations::ExplanationFinding {
                shape_id: id.clone(),
                path: finding.path.clone(),
                code: finding.code.to_string(),
                mode,
                inputs,
            }),
            Err(reason) => {
                let mut error = finding.clone();
                error.severity = crate::types::Severity::Error;
                error.constraint_kind = crate::types::ConstraintKind::Definition;
                error.source = Some(crate::types::ValidationSource::Definition);
                error.code = crate::types::ValidationCode::SyntaxError;
                error.message = format!("Cannot resolve warning explanation inputs: {reason}");
                failures.push(error);
            }
        }
    }
    findings.extend(failures);
    explained
}

/// Read-only inputs shared by bind-constraint and shape validation.
struct Validation<'a> {
    /// Evaluated items by concrete path, for Shape relevance.
    by_path: HashMap<&'a str, &'a ItemInfo>,
    /// Response values after recalculation.
    values: &'a HashMap<String, Value>,
    index: &'a ScopeIndex,
    state: &'a ScopeData,
    /// Shapes by `id`, for composition references.
    shapes_by_id: HashMap<String, &'a Value>,
    /// Registry extension constraints by extension name.
    ext_by_name: HashMap<&'a str, &'a ExtensionConstraint>,
    /// Definition `$formspec` version, for extension compatibility ranges.
    formspec_version: &'a str,
    /// FEL evaluation seam.
    fel: Fel<'a>,
}

/// Validation output: results for respondents, diagnostics for authors.
#[derive(Default)]
struct Findings {
    /// Validation results.
    results: Vec<ValidationResult>,
    /// Author-facing evaluation errors (Core §3.10.2).
    diagnostics: Vec<EvalDiagnostic>,
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;
    use crate::types::MipState;
    use fel_core::exact_json::native_json as json;

    #[test]
    fn revalidate_with_hand_built_items() {
        let items = vec![ItemInfo {
            key: "email".to_string(),
            path: "email".to_string(),
            data_type: Some("string".to_string()),
            constraint: Some("contains($email, \"@\")".to_string()),
            mip: MipState {
                required: true,
                ..Default::default()
            },
            ..Default::default()
        }];

        let values: HashMap<String, Value> = HashMap::new();
        let (results, _) = revalidate(
            &items,
            &values,
            &HashMap::new(),
            &json!({}),
            &EvalOptions::default(),
        );
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].path, "email");
        assert_eq!(results[0].constraint_kind, "required");
        assert!(results[0].message.contains("Required"));
    }

    #[test]
    fn revalidate_skips_non_relevant() {
        let items = vec![ItemInfo {
            key: "hidden".to_string(),
            path: "hidden".to_string(),
            data_type: Some("string".to_string()),
            constraint: Some("false".to_string()),
            mip: MipState {
                relevant: false,
                required: true,
                ..Default::default()
            },
            ..Default::default()
        }];

        let values: HashMap<String, Value> = HashMap::new();
        let (results, _) = revalidate(
            &items,
            &values,
            &HashMap::new(),
            &json!({}),
            &EvalOptions::default(),
        );
        assert!(
            results.is_empty(),
            "non-relevant items should be skipped entirely"
        );
    }

    #[test]
    fn revalidate_constraint_passes() {
        let items = vec![ItemInfo {
            key: "age".to_string(),
            path: "age".to_string(),
            data_type: Some("integer".to_string()),
            value: json!(25),
            constraint: Some("$age >= 18".to_string()),
            ..Default::default()
        }];

        let mut values = HashMap::new();
        values.insert("age".to_string(), json!(25));

        let (results, _) = revalidate(
            &items,
            &values,
            &HashMap::new(),
            &json!({}),
            &EvalOptions::default(),
        );
        assert!(
            results.is_empty(),
            "constraint $age >= 18 should pass for 25"
        );
    }

    /// Spec: §3.8.1 — Bind constraint skipped when value is empty.
    /// "A constraint that cannot be evaluated due to null inputs is not considered
    /// violated."  Empty string, null, and empty array should all skip constraint.
    #[test]
    fn constraint_skipped_on_empty_string() {
        let items = vec![ItemInfo {
            key: "email".to_string(),
            path: "email".to_string(),
            data_type: Some("string".to_string()),
            constraint: Some("matches($, '.*@.*')".to_string()),
            ..Default::default()
        }];

        // Empty string value — constraint must not fire
        let mut values: HashMap<String, Value> = HashMap::new();
        values.insert("email".to_string(), json!(""));
        let (results, _) = revalidate(
            &items,
            &values,
            &HashMap::new(),
            &json!({}),
            &EvalOptions::default(),
        );
        let constraint_errors: Vec<_> = results
            .iter()
            .filter(|r| r.code == "CONSTRAINT_FAILED")
            .collect();
        assert!(
            constraint_errors.is_empty(),
            "constraint must not fire on empty string, got: {constraint_errors:?}"
        );
    }

    #[test]
    fn constraint_skipped_on_null() {
        let items = vec![ItemInfo {
            key: "email".to_string(),
            path: "email".to_string(),
            data_type: Some("string".to_string()),
            constraint: Some("matches($, '.*@.*')".to_string()),
            ..Default::default()
        }];

        let values: HashMap<String, Value> = HashMap::new();
        let (results, _) = revalidate(
            &items,
            &values,
            &HashMap::new(),
            &json!({}),
            &EvalOptions::default(),
        );
        let constraint_errors: Vec<_> = results
            .iter()
            .filter(|r| r.code == "CONSTRAINT_FAILED")
            .collect();
        assert!(
            constraint_errors.is_empty(),
            "constraint must not fire on null value, got: {constraint_errors:?}"
        );
    }

    #[test]
    fn constraint_skipped_on_empty_array() {
        let items = vec![ItemInfo {
            key: "tags".to_string(),
            path: "tags".to_string(),
            data_type: Some("multiChoice".to_string()),
            constraint: Some("count($tags) > 0".to_string()),
            ..Default::default()
        }];

        let mut values: HashMap<String, Value> = HashMap::new();
        values.insert("tags".to_string(), json!([]));
        let (results, _) = revalidate(
            &items,
            &values,
            &HashMap::new(),
            &json!({}),
            &EvalOptions::default(),
        );
        let constraint_errors: Vec<_> = results
            .iter()
            .filter(|r| r.code == "CONSTRAINT_FAILED")
            .collect();
        assert!(
            constraint_errors.is_empty(),
            "constraint must not fire on empty array, got: {constraint_errors:?}"
        );
    }

    /// BUG-3: an undefined function is a definition error (Core §3.10.1), so the
    /// constraint fails like a syntax error; authors also get the diagnostic.
    #[test]
    fn constraint_with_undefined_function_fails_with_diagnostic() {
        let items = vec![ItemInfo {
            key: "amount".to_string(),
            path: "amount".to_string(),
            data_type: Some("number".to_string()),
            value: json!(100),
            constraint: Some("bogusFunc($amount) > 0".to_string()),
            constraint_message: Some("Custom message".to_string()),
            ..Default::default()
        }];

        let mut values = HashMap::new();
        values.insert("amount".to_string(), json!(100));

        let (results, diagnostics) = revalidate(
            &items,
            &values,
            &HashMap::new(),
            &json!({}),
            &EvalOptions::default(),
        );
        assert_eq!(results.len(), 1, "got {results:?}");
        // Direct revalidation of a manual Item tree lacks authored JSONPaths.
        assert_eq!(results[0].code, "UNDEFINED_FUNCTION");
        assert_eq!(
            results[0].constraint_kind,
            crate::types::ConstraintKind::Definition
        );
        assert_eq!(
            results[0].message,
            "Constraint expression error: undefined function: bogusFunc"
        );
        assert_eq!(diagnostics.len(), 1, "{diagnostics:?}");
        assert_eq!(diagnostics[0].path, "amount");
        assert_eq!(diagnostics[0].message, "undefined function: bogusFunc");
    }

    /// A Bind's `constraintMessage` resolves its `{{expression}}` sequences against the field, as a Shape
    /// `message` does — a surfaced ValidationResult message never carries an unresolved template (Core §5).
    #[test]
    fn constraint_message_interpolates_against_the_field() {
        let items = vec![ItemInfo {
            key: "amount".to_string(),
            path: "amount".to_string(),
            data_type: Some("number".to_string()),
            value: json!(100),
            constraint: Some("$ < 50".to_string()),
            constraint_message: Some("Amount {{$}} must be under {{25 * 2}}.".to_string()),
            ..Default::default()
        }];

        let mut values = HashMap::new();
        values.insert("amount".to_string(), json!(100));

        let (results, _) = revalidate(
            &items,
            &values,
            &HashMap::new(),
            &json!({}),
            &EvalOptions::default(),
        );
        assert_eq!(results.len(), 1, "got {results:?}");
        assert_eq!(results[0].code, "CONSTRAINT_FAILED");
        assert_eq!(results[0].message, "Amount 100 must be under 50.");
    }

    /// BUG-3 for shapes: fail (Core §3.10.1), plus a diagnostic naming the expression.
    #[test]
    fn shape_with_undefined_function_fails_with_diagnostic() {
        let items = vec![ItemInfo {
            key: "amount".to_string(),
            path: "amount".to_string(),
            data_type: Some("number".to_string()),
            value: json!(100),
            ..Default::default()
        }];

        let mut values = HashMap::new();
        values.insert("amount".to_string(), json!(100));

        let shapes = vec![json!({
            "target": "amount",
            "constraint": "bogusFunc($amount) > 0",
            "message": "Amount must pass bogus check",
            "severity": "error"
        })];

        let (results, diagnostics) = revalidate(
            &items,
            &values,
            &HashMap::new(),
            &json!({ "shapes": shapes }),
            &EvalOptions::default(),
        );
        assert_eq!(results.len(), 1, "got {results:?}");
        assert_eq!(results[0].message, "Amount must pass bogus check");
        assert_eq!(diagnostics.len(), 1, "{diagnostics:?}");
        assert_eq!(diagnostics[0].expression, "bogusFunc($amount) > 0");
    }
}

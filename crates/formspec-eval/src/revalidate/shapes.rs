//! Shape rules: single targets, wildcard expansion, composition (and/or/not/xone), context.
#![allow(clippy::missing_docs_in_private_items)]

use std::collections::{HashMap, HashSet};

use fel_core::{FormspecEnvironment, Value, fel_to_json};
use serde_json::Value as JsonValue;

use crate::fel_eval::Fel;
use crate::fel_json::json_to_runtime_fel_typed;
use crate::interpolation::interpolate_fel;
use crate::rebuild::{
    expand_wildcard_path, instantiate_wildcard_expr, is_wildcard_bind, wildcard_base,
};
use crate::types::{
    ConstraintKind, EvalDiagnostic, Severity, ValidationCode, ValidationResult, ValidationSource,
    find_item_by_path,
};

use super::env::{RowContext, restore_sibling_aliases};
use super::expr::{ConstraintSite, constraint_passes};
use super::{Findings, Validation};

impl Validation<'_> {
    /// Evaluates `shape` at its target, or per concrete row for a wildcard target.
    pub(super) fn validate_shape(
        &self,
        shape: &JsonValue,
        env: &mut FormspecEnvironment,
        findings: &mut Findings,
    ) {
        let (values, siblings, items, fel) = (self.values, &self.siblings, self.items, self.fel);
        let target = shape.get("target").and_then(|v| v.as_str()).unwrap_or("");

        // Wildcard shape target: expand and evaluate per-instance
        if is_wildcard_bind(target) {
            self.validate_wildcard_shape(shape, env, findings);
            return;
        }

        // §5.6 rule 1: non-relevant targets suppress shape evaluation
        if target != "#"
            && !target.is_empty()
            && let Some(item) = find_item_by_path(items, target)
            && !item.relevant
        {
            return;
        }
        let severity = shape
            .get("severity")
            .and_then(|v| v.as_str())
            .unwrap_or("error");
        let message = shape
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("Shape constraint failed");

        // Check activeWhen
        let saved_aliases = if target.is_empty() || target == "#" {
            HashMap::new()
        } else {
            siblings.bind(env, target)
        };
        if let Some(active_when) = shape.get("activeWhen").and_then(|v| v.as_str())
            && !fel.eval_bool(active_when, env, true)
        {
            restore_sibling_aliases(env, saved_aliases);
            return;
        }

        // Bind bare $ to target field value for shape constraint evaluation
        let prev_dollar = env.data.remove("");
        if !target.is_empty()
            && let Some(target_val) = values.get(target)
        {
            env.data.insert(
                String::new(),
                json_to_runtime_fel_typed(target_val, siblings.data_type(target)),
            );
        }

        let sid = shape.get("id").and_then(|v| v.as_str()).map(str::to_string);
        let scode = shape
            .get("code")
            .and_then(|v| v.as_str())
            .unwrap_or("SHAPE_FAILED");

        let passes = Composition {
            shapes_by_id: &self.shapes_by_id,
            env,
            visiting: HashSet::new(),
            diagnostics: &mut findings.diagnostics,
            fel,
        }
        .passes(shape, target);
        if !passes {
            findings.results.push(ValidationResult {
                path: target.to_string(),
                severity: Severity::parse_wire(severity).unwrap_or(Severity::Error),
                constraint_kind: ConstraintKind::Shape,
                code: ValidationCode::from_wire(scode),
                message: interpolate_fel(message, env, fel, str::to_string).text,
                constraint: shape
                    .get("constraint")
                    .and_then(|v| v.as_str())
                    .map(str::to_string),
                source: ValidationSource::Shape,
                shape_id: sid.clone(),
                context: evaluate_shape_context(shape, env, None, fel),
            });
        }

        restore_sibling_aliases(env, saved_aliases);
        // Restore previous bare $ binding
        env.data.remove("");
        if let Some(prev) = prev_dollar {
            env.data.insert(String::new(), prev);
        }
    }

    /// Validate a shape with a wildcard target, evaluating per concrete instance.
    fn validate_wildcard_shape(
        &self,
        shape: &JsonValue,
        env: &mut FormspecEnvironment,
        findings: &mut Findings,
    ) {
        let (values, siblings, items, fel) = (self.values, &self.siblings, self.items, self.fel);
        let target = shape.get("target").and_then(|v| v.as_str()).unwrap_or("");
        let severity = shape
            .get("severity")
            .and_then(|v| v.as_str())
            .unwrap_or("error");
        let message = shape
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("Shape constraint failed");

        let base = match wildcard_base(target) {
            Some(b) => b.to_string(),
            None => return,
        };

        let concrete_paths = expand_wildcard_path(target, values);
        let mut row = RowContext::new();

        for concrete_path in &concrete_paths {
            // §5.6 rule 1: skip non-relevant targets
            if let Some(item) = find_item_by_path(items, concrete_path)
                && !item.relevant
            {
                continue;
            }

            // Extract the index from the concrete path to instantiate the constraint
            let index = match concrete_path.find('[') {
                Some(pos) => {
                    let rest = &concrete_path[pos + 1..];
                    rest.split(']')
                        .next()
                        .and_then(|s| s.parse::<usize>().ok())
                        .unwrap_or(0)
                }
                None => continue,
            };

            let saved_aliases = siblings.bind(env, concrete_path);
            row.enter(concrete_path, env, values, self.index);

            // Build a row-scoped environment: instantiate [*] references in the constraint
            let prev_dollar = env.data.remove("");
            if let Some(val) = values.get(concrete_path.as_str()) {
                env.data.insert(
                    String::new(),
                    json_to_runtime_fel_typed(val, siblings.data_type(concrete_path)),
                );
            }

            let active = shape
                .get("activeWhen")
                .and_then(|v| v.as_str())
                .map(|expr| instantiate_wildcard_expr(expr, &base, index))
                .map(|expr| fel.eval_bool(&expr, env, true))
                .unwrap_or(true);
            if !active {
                restore_sibling_aliases(env, saved_aliases);
                env.data.remove("");
                if let Some(prev) = prev_dollar {
                    env.data.insert(String::new(), prev);
                }
                continue;
            }

            // Create an instantiated shape for this row
            let constraint_expr = shape
                .get("constraint")
                .and_then(|v| v.as_str())
                .map(|expr| instantiate_wildcard_expr(expr, &base, index));

            let sid = shape.get("id").and_then(|v| v.as_str()).map(str::to_string);
            let passes = constraint_expr.as_deref().is_none_or(|expr| {
                ConstraintSite {
                    path: concrete_path,
                    shape_id: sid.as_deref(),
                    fel,
                }
                .evaluate(expr, env, &mut findings.diagnostics)
                .is_some_and(|value| constraint_passes(&value))
            });

            let scode = shape
                .get("code")
                .and_then(|v| v.as_str())
                .unwrap_or("SHAPE_FAILED");

            if !passes {
                findings.results.push(ValidationResult {
                    path: concrete_path.clone(),
                    severity: Severity::parse_wire(severity).unwrap_or(Severity::Error),
                    constraint_kind: ConstraintKind::Shape,
                    code: ValidationCode::from_wire(scode),
                    message: interpolate_fel(message, env, fel, str::to_string).text,
                    constraint: constraint_expr.clone(),
                    source: ValidationSource::Shape,
                    shape_id: sid.clone(),
                    context: evaluate_shape_context(shape, env, Some((&base, index)), fel),
                });
            }

            // Restore bare $
            restore_sibling_aliases(env, saved_aliases);
            env.data.remove("");
            if let Some(prev) = prev_dollar {
                env.data.insert(String::new(), prev);
            }
        }
        row.finish(env);
    }
}

fn evaluate_shape_context(
    shape: &JsonValue,
    env: &FormspecEnvironment,
    wildcard: Option<(&str, usize)>,
    fel: Fel<'_>,
) -> Option<HashMap<String, JsonValue>> {
    let context = shape.get("context")?.as_object()?;
    let mut evaluated = HashMap::new();

    for (key, raw_expr) in context {
        let value = match raw_expr.as_str() {
            Some(expr) => {
                let expression = wildcard
                    .map(|(base, index)| instantiate_wildcard_expr(expr, base, index))
                    .unwrap_or_else(|| expr.to_string());
                fel_to_json(&fel.evaluate_source(&expression, env).value)
            }
            None => raw_expr.clone(),
        };
        evaluated.insert(key.clone(), value);
    }

    Some(evaluated)
}

/// Kleene truth of a shape or composition element (Core §3.8.1: `null` is unknown).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Truth {
    True,
    False,
    Unknown,
}

impl Truth {
    /// `null` is unknown; any other value by truthiness.
    fn of(value: &Value) -> Self {
        match value {
            Value::Null => Self::Unknown,
            value if value.is_truthy() => Self::True,
            _ => Self::False,
        }
    }

    fn not(self) -> Self {
        match self {
            Self::True => Self::False,
            Self::False => Self::True,
            Self::Unknown => Self::Unknown,
        }
    }

    /// Kleene conjunction: false dominates, then unknown. Empty is true.
    fn all(truths: &[Self]) -> Self {
        if truths.contains(&Self::False) {
            Self::False
        } else if truths.contains(&Self::Unknown) {
            Self::Unknown
        } else {
            Self::True
        }
    }

    /// Kleene disjunction: true dominates, then unknown. Empty is false.
    fn any(truths: &[Self]) -> Self {
        if truths.contains(&Self::True) {
            Self::True
        } else if truths.contains(&Self::Unknown) {
            Self::Unknown
        } else {
            Self::False
        }
    }

    /// Exactly one true: false once two are true, else unknown if any is unknown.
    fn exactly_one(truths: &[Self]) -> Self {
        let true_count = truths.iter().filter(|t| **t == Self::True).count();
        if true_count >= 2 {
            Self::False
        } else if truths.contains(&Self::Unknown) {
            Self::Unknown
        } else if true_count == 1 {
            Self::True
        } else {
            Self::False
        }
    }
}

/// Kleene evaluation of one top-level shape and the shapes it references.
struct Composition<'a> {
    shapes_by_id: &'a HashMap<String, &'a JsonValue>,
    env: &'a FormspecEnvironment,
    /// Shape IDs on the current reference path, for cycle detection.
    visiting: HashSet<String>,
    diagnostics: &'a mut Vec<EvalDiagnostic>,
    /// FEL evaluation seam.
    fel: Fel<'a>,
}

impl Composition<'_> {
    /// Whether `shape` passes at `target`: unknown passes, false and definition errors fail.
    fn passes(&mut self, shape: &JsonValue, target: &str) -> bool {
        self.shape_truth(shape, target)
            .is_some_and(|truth| truth != Truth::False)
    }

    /// Kleene truth of `shape` at `target`; `None` for a definition error (§3.10.1).
    ///
    /// Evaluation errors are `null`, so unknown; they land in `diagnostics`.
    fn shape_truth(&mut self, shape: &JsonValue, target: &str) -> Option<Truth> {
        let shape_id = shape.get("id").and_then(|v| v.as_str()).map(str::to_string);

        // A reference cycle passes rather than recursing forever.
        if let Some(ref id) = shape_id
            && !self.visiting.insert(id.clone())
        {
            return Some(Truth::True);
        }

        // activeWhen follows the existing batch evaluator contract: null defaults to active.
        let inactive = shape
            .get("activeWhen")
            .and_then(|v| v.as_str())
            .is_some_and(|active_when| !self.fel.eval_bool(active_when, self.env, true));
        let truth = if inactive {
            Some(Truth::True)
        } else {
            let site = ConstraintSite {
                path: target,
                shape_id: shape_id.as_deref(),
                fel: self.fel,
            };
            self.operators_truth(shape, &site)
        };

        if let Some(id) = shape_id {
            self.visiting.remove(&id);
        }
        truth
    }

    /// Conjoin the shape's present operators; absent operators contribute nothing.
    fn operators_truth(&mut self, shape: &JsonValue, site: &ConstraintSite<'_>) -> Option<Truth> {
        let elements = |key: &str| -> Option<Vec<&str>> {
            shape
                .get(key)
                .and_then(|v| v.as_array())
                .map(|exprs| exprs.iter().filter_map(|e| e.as_str()).collect())
        };
        let mut clauses = Vec::new();

        if let Some(expr) = shape.get("constraint").and_then(|v| v.as_str()) {
            let value = site.evaluate(expr, self.env, self.diagnostics)?;
            clauses.push(Truth::of(&value));
        }
        if let Some(exprs) = elements("and") {
            clauses.push(Truth::all(&self.elements_truths(&exprs, site)?));
        }
        if let Some(exprs) = elements("or") {
            clauses.push(Truth::any(&self.elements_truths(&exprs, site)?));
        }
        if let Some(expr) = shape.get("not").and_then(|v| v.as_str()) {
            clauses.push(self.element_truth(expr, site)?.not());
        }
        if let Some(exprs) = elements("xone") {
            clauses.push(Truth::exactly_one(&self.elements_truths(&exprs, site)?));
        }

        Some(Truth::all(&clauses))
    }

    /// Truth of every element, all evaluated; `None` if any is a definition error.
    fn elements_truths(&mut self, exprs: &[&str], site: &ConstraintSite<'_>) -> Option<Vec<Truth>> {
        let truths: Vec<Option<Truth>> = exprs
            .iter()
            .map(|expr| self.element_truth(expr, site))
            .collect();
        truths.into_iter().collect()
    }

    /// Truth of one composition element: a referenced shape, or an inline expression.
    fn element_truth(&mut self, expr: &str, site: &ConstraintSite<'_>) -> Option<Truth> {
        match self.shapes_by_id.get(expr) {
            Some(shape) => self.shape_truth(shape, site.path),
            None => site
                .evaluate(expr, self.env, self.diagnostics)
                .map(|value| Truth::of(&value)),
        }
    }
}

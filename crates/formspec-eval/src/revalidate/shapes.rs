//! Shape rules: single targets, wildcard expansion, composition (and/or/not/xone), context.
#![allow(clippy::missing_docs_in_private_items)]

use std::collections::{HashMap, HashSet};

use fel_core::exact_json::Value as JsonValue;
use fel_core::{Environment, Value};

use crate::fel_eval::Fel;
use crate::interpolation::interpolate_fel;
use crate::types::{
    ConstraintKind, EvalDiagnostic, Severity, ValidationCode, ValidationResult, ValidationSource,
};

use super::expr::ConstraintSite;
use super::{Findings, Validation};

impl Validation<'_> {
    /// Evaluate each concrete Shape target in its own lexical scope.
    pub(super) fn validate_shape(&self, shape: &JsonValue, findings: &mut Findings) {
        let target = shape.get("target").and_then(|v| v.as_str()).unwrap_or("");
        for path in self.index.targets(target) {
            let item_path = if path.ends_with(']') {
                path.rsplit_once('[')
                    .map_or(path.as_str(), |(group, _)| group)
            } else {
                &path
            };
            if self
                .by_path
                .get(item_path)
                .is_some_and(|item| !item.mip.relevant)
            {
                continue;
            }
            let env = self.state.site(self.index, &path);
            let passes = Composition {
                shapes_by_id: &self.shapes_by_id,
                env: &env,
                visiting: HashSet::new(),
                diagnostics: &mut findings.diagnostics,
                fel: self.fel,
            }
            .passes(shape, &path);
            if !passes {
                let severity = shape
                    .get("severity")
                    .and_then(|v| v.as_str())
                    .unwrap_or("error");
                let code = shape
                    .get("code")
                    .and_then(|v| v.as_str())
                    .unwrap_or("SHAPE_FAILED");
                let message = shape
                    .get("message")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Shape constraint failed");
                findings.results.push(ValidationResult {
                    path: path.clone(),
                    severity: Severity::parse_wire(severity).unwrap_or(Severity::Error),
                    constraint_kind: ConstraintKind::Shape,
                    code: ValidationCode::from_wire(code),
                    message: interpolate_fel(message, &env, self.fel).text,
                    constraint: shape
                        .get("constraint")
                        .and_then(|v| v.as_str())
                        .map(str::to_owned),
                    source: Some(ValidationSource::Shape),
                    shape_id: shape.get("id").and_then(|v| v.as_str()).map(str::to_owned),
                    context: evaluate_shape_context(shape, &env, self.fel),
                });
            }
        }
    }
}

fn evaluate_shape_context(
    shape: &JsonValue,
    env: &dyn Environment,
    fel: Fel<'_>,
) -> Option<HashMap<String, JsonValue>> {
    let context = shape.get("context")?.as_object()?;
    Some(
        context
            .iter()
            .map(|(key, raw)| {
                let value = raw.as_str().map_or_else(
                    || raw.clone(),
                    |expr| fel_core::exact_json::from_fel(&fel.evaluate_source(expr, env).value),
                );
                (key.clone(), value)
            })
            .collect(),
    )
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
    env: &'a dyn Environment,
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

        let inactive = shape
            .get("activeWhen")
            .and_then(|v| v.as_str())
            .is_some_and(|active_when| !self.fel.eval_bool(active_when, self.env, false));
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

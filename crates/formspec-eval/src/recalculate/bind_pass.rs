//! Per-item input normalization and evaluation of relevance, readonly, required, and defaults.

use std::collections::{HashMap, HashSet};

use fel_core::exact_json::Value as JsonValue;
use fel_core::{MipState, Value, parse};

use super::calculate_pass::evaluate_calculate;
use super::json_fel::{coerce_calculated_value, json_to_runtime_fel_typed};
use super::walk::{Visit, Walk};
use crate::fel_eval::Fel;
use crate::fel_json::{fel_to_runtime_json, is_date_data_type};
use crate::scope::{ScopeData, ScopeIndex};
use crate::types::{ItemInfo, WhitespaceMode};

/// Normalize inbound text before building the scope used by expressions and validation.
pub(crate) fn normalize_input_text(
    items: &mut [ItemInfo],
    values: &mut HashMap<String, JsonValue>,
) {
    for item in items.iter_mut() {
        let whitespace = item
            .whitespace
            .filter(|mode| *mode != WhitespaceMode::Preserve);
        if (whitespace.is_some() || item.letter_case.is_some())
            && let Some(JsonValue::String(text)) = values.get_mut(&item.path)
        {
            if let Some(mode) = whitespace {
                *text = mode.apply(text);
            }
            if let Some(mode) = item.letter_case {
                *text = mode.apply(text);
            }
            item.value = JsonValue::String(text.clone());
        }
        normalize_input_text(&mut item.children, values);
    }
}

/// Relevance and readonly an item hands to its children (AND and OR inheritance).
#[derive(Clone, Copy)]
pub(super) struct Parent {
    /// Whether every ancestor is relevant.
    pub(super) relevant: bool,
    /// Whether any ancestor is readonly.
    pub(super) readonly: bool,
}

impl Parent {
    /// A top-level item's parent: the relevant, writable form.
    pub(super) const ROOT: Self = Self {
        relevant: true,
        readonly: false,
    };
}

/// Bind pass: relevance, defaults, readonly, required, and calculate per item.
pub(super) struct BindPass<'a> {
    /// Paths with error-severity results in the prior cycle (`valid()` MIP state).
    pub(super) invalid_paths: &'a HashSet<String>,
    /// Run calculates here when other binds can observe their document-order writes.
    pub(super) early_writers: &'a HashSet<String>,
}

impl Visit for BindPass<'_> {
    type Inherited = Parent;

    fn item(
        &mut self,
        walk: &Walk<'_>,
        item: &mut ItemInfo,
        state: &mut ScopeData,
        values: &mut HashMap<String, JsonValue>,
        parent: Parent,
    ) -> Parent {
        let fel = walk.fel;

        let was_relevant = item.mip.prev_relevant;

        let own_relevant = if let Some(ref expr) = item.relevance {
            fel.eval_bool(expr, &state.site(walk.index, &item.path), true)
        } else {
            true
        };
        item.mip.relevant = own_relevant && parent.relevant;

        if item.mip.relevant && !was_relevant {
            let current = values.get(&item.path);
            let is_empty = match current {
                None | Some(JsonValue::Null) => true,
                Some(JsonValue::String(s)) => s.is_empty(),
                _ => false,
            };
            if is_empty {
                if let Some(ref expr) = item.default_expression {
                    if let Ok(parsed) = parse(expr) {
                        let result = fel.evaluate(&parsed, &state.site(walk.index, &item.path));
                        let coerced = coerce_calculated_value(item, result.value);
                        let json_val = fel_to_runtime_json(&coerced);
                        values.insert(item.path.clone(), json_val.clone());
                        state.set_field(&item.path, coerced);
                    }
                } else if let Some(ref default_val) = item.default_value {
                    let data_type = item.data_type.as_deref();
                    let coerced = coerce_calculated_value(
                        item,
                        json_to_runtime_fel_typed(default_val, data_type),
                    );
                    let json_val = if is_date_data_type(data_type) {
                        default_val.clone()
                    } else {
                        fel_to_runtime_json(&coerced)
                    };
                    values.insert(item.path.clone(), json_val);
                    state.set_field(&item.path, coerced);
                }
            }
        }

        if !item.mip.relevant && item.excluded_value == Some(crate::types::ExcludedValueMode::Null)
        {
            state.set_field(&item.path, Value::Null);
        }

        // Core §4.3.1: a `calculate` Bind is implicitly readonly unless `readonly` is set explicitly.
        let own_readonly = if let Some(ref expr) = item.readonly_expr {
            fel.eval_bool(expr, &state.site(walk.index, &item.path), false)
        } else {
            item.calculate.is_some()
        };
        item.mip.readonly = own_readonly || item.pre_populate_locked || parent.readonly;

        if item.mip.relevant {
            if let Some(ref expr) = item.required_expr {
                item.mip.required = fel.eval_bool(expr, &state.site(walk.index, &item.path), false);
            }
        } else {
            item.mip.required = false;
        }

        if let Some(val) = values.get(&item.path) {
            item.value = val.clone();
        }

        if self.early_writers.contains(&item.path)
            && let Some(expr) = &item.calculate
            && let Ok(parsed) = parse(expr)
        {
            // The settling passes that follow report this calculate's errors.
            evaluate_calculate(item, &parsed, state, values, walk, &mut Vec::new());
            item.value.clone_from(&values[&item.path]);
        }

        state.env.set_mip(
            &item.path,
            MipState {
                valid: !self.invalid_paths.contains(&item.path),
                relevant: item.mip.relevant,
                readonly: item.mip.readonly,
                required: item.mip.required,
            },
        );

        Parent {
            relevant: item.mip.relevant,
            readonly: item.mip.readonly,
        }
    }
}

// ── Post-calculate required refresh ────────────────────────────────────────

/// Re-evaluate required expressions after calculated values have settled.
///
/// The initial bind pass evaluates required before calculate for each item.
/// When a required condition depends on a calculated field that appears later
/// in the tree, the required state may be stale. This function re-evaluates
/// only required expressions using the current environment (which now has
/// settled calculated values) and updates MIP state.
pub(crate) fn refresh_required_state(
    items: &mut [ItemInfo],
    state: &mut ScopeData,
    invalid_paths: &HashSet<String>,
    index: &ScopeIndex,
    fel: Fel<'_>,
) {
    for item in items.iter_mut() {
        if item.mip.relevant {
            if let Some(ref expr) = item.required_expr {
                item.mip.required = fel.eval_bool(expr, &state.site(index, &item.path), false);
            }
        } else {
            item.mip.required = false;
        }

        state.env.set_mip(
            &item.path,
            MipState {
                valid: !invalid_paths.contains(&item.path),
                relevant: item.mip.relevant,
                readonly: item.mip.readonly,
                required: item.mip.required,
            },
        );

        refresh_required_state(&mut item.children, state, invalid_paths, index, fel);
    }
}

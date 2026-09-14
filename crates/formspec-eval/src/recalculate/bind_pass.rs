//! Per-item bind evaluation: relevance, readonly, required, defaults, whitespace, repeat aliases.

use std::collections::{HashMap, HashSet};

use fel_core::{FormspecEnvironment, MipState, Value, fel_to_ui_json, parse};
use serde_json::Value as JsonValue;

use super::json_fel::{coerce_calculated_value, json_to_runtime_fel_typed};
use super::walk::{Visit, Walk};
use crate::fel_eval::Fel;
use crate::fel_json::is_date_data_type;
use crate::types::{ItemInfo, WhitespaceMode, resolve_qualified_repeat_refs};

/// Apply whitespace normalization to all items that have a whitespace bind.
pub(crate) fn apply_whitespace_to_items(
    items: &mut [ItemInfo],
    values: &mut HashMap<String, JsonValue>,
) {
    for item in items.iter_mut() {
        if let Some(mode) = item.whitespace {
            if mode != WhitespaceMode::Preserve
                && let Some(JsonValue::String(s)) = values.get(&item.path)
            {
                let transformed = mode.apply(s);
                values.insert(item.path.clone(), JsonValue::String(transformed.clone()));
                item.value = JsonValue::String(transformed);
            }
        }
        apply_whitespace_to_items(&mut item.children, values);
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
}

impl Visit for BindPass<'_> {
    type Inherited = Parent;

    fn item(
        &mut self,
        walk: &Walk<'_>,
        item: &mut ItemInfo,
        env: &mut FormspecEnvironment,
        values: &mut HashMap<String, JsonValue>,
        parent: Parent,
    ) -> Parent {
        let fel = walk.fel;
        let normalize_expr = |expr: &str| resolve_qualified_repeat_refs(expr, &item.path);

        let was_relevant = item.prev_relevant;

        let own_relevant = if let Some(ref expr) = item.relevance {
            let normalized_expr = normalize_expr(expr);
            fel.eval_bool(&normalized_expr, env, true)
        } else {
            true
        };
        item.relevant = own_relevant && parent.relevant;

        if item.relevant && !was_relevant {
            let current = values.get(&item.path);
            let is_empty = match current {
                None | Some(JsonValue::Null) => true,
                Some(JsonValue::String(s)) => s.is_empty(),
                _ => false,
            };
            if is_empty {
                if let Some(ref expr) = item.default_expression {
                    let normalized_expr = normalize_expr(expr);
                    if let Ok(parsed) = parse(&normalized_expr) {
                        let result = fel.evaluate(&parsed, env);
                        let coerced = coerce_calculated_value(item, result.value);
                        let json_val = fel_to_ui_json(&coerced);
                        values.insert(item.path.clone(), json_val.clone());
                        env.set_field(&item.path, coerced);
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
                        fel_to_ui_json(&coerced)
                    };
                    values.insert(item.path.clone(), json_val);
                    env.set_field(&item.path, coerced);
                }
            }
        }

        if !item.relevant && item.excluded_value == Some(crate::types::ExcludedValueMode::Null) {
            env.set_field(&item.path, Value::Null);
        }

        // Core §4.3.1: a `calculate` Bind is implicitly readonly unless `readonly` is set explicitly.
        let own_readonly = if let Some(ref expr) = item.readonly_expr {
            let normalized_expr = normalize_expr(expr);
            fel.eval_bool(&normalized_expr, env, false)
        } else {
            item.calculate.is_some()
        };
        item.readonly = own_readonly || parent.readonly;

        if item.relevant {
            if let Some(ref expr) = item.required_expr {
                let normalized_expr = normalize_expr(expr);
                item.required = fel.eval_bool(&normalized_expr, env, false);
            }
        } else {
            item.required = false;
        }

        if let Some(val) = values.get(&item.path) {
            item.value = val.clone();
        }

        if let Some(ref expr) = item.calculate {
            let normalized_expr = normalize_expr(expr);
            if let Ok(parsed) = parse(&normalized_expr) {
                let result = fel.evaluate(&parsed, env);
                let coerced = coerce_calculated_value(item, result.value);
                let json_val = fel_to_ui_json(&coerced);
                values.insert(item.path.clone(), json_val.clone());
                item.value = json_val.clone();
                env.set_field(&item.path, coerced);
            }
        }

        env.set_mip(
            &item.path,
            MipState {
                valid: !self.invalid_paths.contains(&item.path),
                relevant: item.relevant,
                readonly: item.readonly,
                required: item.required,
            },
        );

        Parent {
            relevant: item.relevant,
            readonly: item.readonly,
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
    env: &mut FormspecEnvironment,
    invalid_paths: &HashSet<String>,
    fel: Fel<'_>,
) {
    for item in items.iter_mut() {
        if item.relevant {
            if let Some(ref expr) = item.required_expr {
                let normalized_expr = resolve_qualified_repeat_refs(expr, &item.path);
                item.required = fel.eval_bool(&normalized_expr, env, false);
            }
        } else {
            item.required = false;
        }

        env.set_mip(
            &item.path,
            MipState {
                valid: !invalid_paths.contains(&item.path),
                relevant: item.relevant,
                readonly: item.readonly,
                required: item.required,
            },
        );

        refresh_required_state(&mut item.children, env, invalid_paths, fel);
    }
}

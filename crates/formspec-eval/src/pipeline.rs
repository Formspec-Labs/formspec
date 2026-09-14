//! Top-level evaluate orchestration (rebuild → recalculate → revalidate → NRB).

use crate::eval_options::EvalOptions;
use crate::fel_eval::Fel;
use crate::nrb::apply_nrb;
use crate::rebuild;
use crate::recalculate::recalculate;
use crate::revalidate::revalidate;
use crate::runtime_seed::{apply_previous_non_relevant, seed_prepopulate_tree};
use crate::types::{self, EvaluationResult, ValidationResult};
use crate::{expand_repeat_instances, rebuild_item_tree};
use serde_json::Value;
use std::collections::HashMap;

/// Evaluate a definition through the full four-phase pipeline.
pub fn evaluate(
    definition: &Value,
    data: &HashMap<String, Value>,
    options: &EvalOptions,
) -> EvaluationResult {
    let context = &options.context;
    let flat_data = rebuild::augment_nested_data(data);

    let mut items = rebuild_item_tree(definition);

    let mut seeded_data = flat_data;
    seed_prepopulate_tree(&items, &mut seeded_data, &options.instances);

    rebuild::seed_initial_values(
        &items,
        &mut seeded_data,
        context.now_iso.as_deref(),
        Fel::new(options.extensions),
    );

    expand_repeat_instances(&mut items, &seeded_data);

    let binds = definition.get("binds");
    rebuild::apply_wildcard_binds(&mut items, binds);

    if let Some(ref prev_nr) = context.previous_non_relevant {
        apply_previous_non_relevant(&mut items, prev_nr);
    }

    let (mut values, mut var_values, cycle_err) = recalculate(
        &mut items,
        &seeded_data,
        definition,
        context.previous_validations.as_deref(),
        options,
    );

    let (mut validations, mut diagnostics) =
        revalidate(&items, &values, &var_values, definition, options);

    let (next_values, next_var_values, _) = recalculate(
        &mut items,
        &seeded_data,
        definition,
        Some(&validations),
        options,
    );
    if next_values != values || next_var_values != var_values {
        values = next_values;
        var_values = next_var_values;
        (validations, diagnostics) = revalidate(&items, &values, &var_values, definition, options);
    }

    if let Some(cycle_msg) = cycle_err {
        validations.push(ValidationResult {
            path: String::new(),
            severity: types::Severity::Error,
            constraint_kind: types::ConstraintKind::Definition,
            code: types::ValidationCode::CircularDependency,
            message: cycle_msg,
            constraint: None,
            source: types::ValidationSource::Definition,
            shape_id: None,
            context: None,
        });
    }

    let mut non_relevant = Vec::new();
    types::collect_non_relevant(&items, &mut non_relevant);

    let mut required = HashMap::new();
    let mut readonly = HashMap::new();
    types::collect_mip_state(&items, &mut required, &mut readonly);

    let default_nrb = definition
        .get("nonRelevantBehavior")
        .and_then(|v| v.as_str())
        .unwrap_or("remove");
    apply_nrb(&mut values, &items, default_nrb);

    let variables = var_values
        .iter()
        .map(|(name, value)| (name.clone(), fel_core::fel_to_json(value)))
        .collect();

    EvaluationResult {
        values,
        validations,
        diagnostics,
        non_relevant,
        variables,
        required,
        readonly,
    }
}

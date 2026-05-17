//! Top-level evaluate orchestration (rebuild → recalculate → revalidate → NRB).

use crate::eval_options::EvalOptions;
use crate::nrb::apply_nrb;
use crate::rebuild;
use crate::recalculate::recalculate;
use crate::revalidate::revalidate;
use crate::runtime_seed::{apply_previous_non_relevant, seed_prepopulate_tree};
use crate::types::{
    self, EvalContext, EvalTrigger, EvaluationResult, ExtensionConstraint, ValidationResult,
};
use crate::{expand_repeat_instances, rebuild_item_tree};
use serde_json::Value;
use std::collections::HashMap;

/// Evaluate a definition through the full four-phase pipeline.
pub fn evaluate(
    definition: &Value,
    data: &HashMap<String, Value>,
    options: &EvalOptions,
) -> EvaluationResult {
    evaluate_inner(
        definition,
        data,
        options.trigger,
        &options.extension_constraints,
        &options.instances,
        &options.context,
    )
}

fn evaluate_inner(
    definition: &Value,
    data: &HashMap<String, Value>,
    trigger: EvalTrigger,
    extension_constraints: &[ExtensionConstraint],
    instances: &HashMap<String, Value>,
    context: &EvalContext,
) -> EvaluationResult {
    let flat_data = rebuild::augment_nested_data(data);

    let mut items = rebuild_item_tree(definition);

    let mut seeded_data = flat_data;
    seed_prepopulate_tree(&items, &mut seeded_data, instances);

    rebuild::seed_initial_values(&items, &mut seeded_data, context.now_iso.as_deref());

    expand_repeat_instances(&mut items, &seeded_data);

    let binds = definition.get("binds");
    rebuild::apply_wildcard_binds(&mut items, binds, &seeded_data);

    if let Some(ref prev_nr) = context.previous_non_relevant {
        apply_previous_non_relevant(&mut items, prev_nr);
    }

    let (mut values, mut var_values, cycle_err) = recalculate(
        &mut items,
        &seeded_data,
        definition,
        context.now_iso.as_deref(),
        context.previous_validations.as_deref(),
        instances,
    );

    let shapes = definition.get("shapes").and_then(|v| v.as_array());
    let formspec_version = definition
        .get("$formspec")
        .and_then(|v| v.as_str())
        .unwrap_or("1.0.0");
    let mut validations = revalidate(
        &items,
        &values,
        &var_values,
        shapes.map(|v| v.as_slice()),
        trigger,
        extension_constraints,
        formspec_version,
        context.now_iso.as_deref(),
        context.repeat_counts.as_ref(),
        instances,
    );

    let (next_values, next_var_values, _) = recalculate(
        &mut items,
        &seeded_data,
        definition,
        context.now_iso.as_deref(),
        Some(&validations),
        instances,
    );
    if next_values != values || next_var_values != var_values {
        values = next_values;
        var_values = next_var_values;
        validations = revalidate(
            &items,
            &values,
            &var_values,
            shapes.map(|v| v.as_slice()),
            trigger,
            extension_constraints,
            formspec_version,
            context.now_iso.as_deref(),
            context.repeat_counts.as_ref(),
            instances,
        );
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

    let variables = var_values;

    EvaluationResult {
        values,
        validations,
        non_relevant,
        variables,
        required,
        readonly,
    }
}

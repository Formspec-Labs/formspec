//! Top-level evaluate orchestration (rebuild → recalculate → revalidate → NRB).

use crate::eval_options::EvalOptions;
use crate::fel_eval::Fel;
use crate::nrb::apply_nrb;
use crate::output_data::build_output_data;
use crate::rebuild;
use crate::recalculate::recalculate_phase;
use crate::revalidate::revalidate;
use crate::runtime_seed::{
    apply_previous_non_relevant, hydrate_inline_instances, seed_prepopulate_tree,
    seed_repeat_from_instances,
};
use crate::types::{self, EvaluationResult, ValidationResult};
use crate::rebuild_item_tree;
use serde_json::Value;
use std::collections::HashMap;

/// Evaluate a definition through the full four-phase pipeline.
pub fn evaluate(
    definition: &Value,
    data: &HashMap<String, Value>,
    options: &EvalOptions,
) -> EvaluationResult {
    let mut options = options.clone();
    hydrate_inline_instances(definition, &mut options.instances);
    let mut items = rebuild_item_tree(definition);
    let flat = match rebuild::flatten_response_data(&items, data) {
        Ok(flat) => flat,
        Err(conflicts) => return refuse_ambiguous_input(&conflicts),
    };
    // Row counts the host sent beside the data win over the ones read from the rows.
    let mut counts = flat.repeat_counts;
    if let Some(host) = &options.context.repeat_counts {
        counts.extend(host.iter().map(|(path, n)| (path.clone(), *n)));
    }
    options.context.repeat_counts = Some(counts.clone());
    let options = &options;
    let context = &options.context;

    let mut seeded_data = flat.values;
    if options.apply_creation_seeds {
        seed_repeat_from_instances(definition, &mut seeded_data, &options.instances, &counts);
    }
    seed_prepopulate_tree(&items, &mut seeded_data, &options.instances);

    rebuild::seed_initial_values(
        &items,
        &mut seeded_data,
        context.now_iso.as_deref(),
        Fel::new(options.extensions),
    );

    rebuild::expand_repeat_instances_counted(&mut items, &seeded_data, &counts);

    let binds = definition.get("binds");
    rebuild::apply_wildcard_binds(&mut items, binds);

    if let Some(ref prev_nr) = context.previous_non_relevant {
        apply_previous_non_relevant(&mut items, prev_nr);
    }

    let first = recalculate_phase(
        &mut items,
        &seeded_data,
        definition,
        context.previous_validations.as_deref(),
        options,
        false,
    );
    let (mut values, mut var_values, cycle_err) =
        (first.values, first.variables, first.cycle_error);

    let (mut validations, mut diagnostics) =
        revalidate(&items, &values, &var_values, definition, options);

    // Item text resolves in this pass: it sees `valid()` from the validations above.
    let next = recalculate_phase(
        &mut items,
        &seeded_data,
        definition,
        Some(&validations),
        options,
        true,
    );
    let item_text = next.item_text;
    if next.values != values || next.variables != var_values {
        values = next.values;
        var_values = next.variables;
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

    let data = build_output_data(&items, &values, default_nrb);

    let variables = var_values
        .iter()
        .map(|(name, value)| (name.clone(), fel_core::fel_to_json(value)))
        .collect();

    EvaluationResult {
        values,
        data,
        validations,
        diagnostics,
        non_relevant,
        variables,
        required,
        readonly,
        item_text,
    }
}

/// The input gave a field twice (flat and nested). Nothing is evaluated: a Type error per path, no values.
fn refuse_ambiguous_input(paths: &[String]) -> EvaluationResult {
    EvaluationResult {
        values: HashMap::new(),
        data: Value::Object(Default::default()),
        validations: paths
            .iter()
            .map(|path| ValidationResult {
                path: path.clone(),
                severity: types::Severity::Error,
                constraint_kind: types::ConstraintKind::Type,
                code: types::ValidationCode::TypeMismatch,
                message: format!(
                    "`{path}` is supplied both as a flat dotted key and inside its group object; supply it once"
                ),
                constraint: None,
                source: types::ValidationSource::Bind,
                shape_id: None,
                context: None,
            })
            .collect(),
        diagnostics: Vec::new(),
        non_relevant: Vec::new(),
        variables: HashMap::new(),
        required: HashMap::new(),
        readonly: HashMap::new(),
        item_text: None,
    }
}

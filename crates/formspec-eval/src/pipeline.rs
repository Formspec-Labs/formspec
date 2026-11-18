//! Top-level evaluate orchestration (rebuild → recalculate → revalidate → NRB).

use crate::eval_options::EvalOptions;
use crate::fel_eval::Fel;

use crate::nrb::apply_nrb;
use crate::output_data::build_output_data;
use crate::rebuild;
use crate::rebuild_item_tree;
use crate::recalculate::recalculate_phase;
use crate::revalidate::revalidate;
use crate::runtime_seed::{
    apply_previous_non_relevant, hydrate_inline_instances, seed_prepopulate_tree,
    seed_repeat_from_instances,
};
use crate::types::{self, EvalSubject, EvaluationResult, ValidationResult};
use fel_core::Value as FelValue;
use fel_core::exact_json::Value;
use formspec_core::subject_key::SubjectKey;
use std::collections::{BTreeSet, HashMap};

/// Evaluate a definition through the full four-phase pipeline.
pub fn evaluate(
    definition: &Value,
    data: &HashMap<String, Value>,
    options: &EvalOptions,
) -> EvaluationResult {
    if let Some(subject) = &options.context.subject
        && let Err(refusal) = check_subject(definition, subject)
    {
        return refuse_input(vec![refusal]);
    }
    let mut options = options.clone();
    hydrate_inline_instances(definition, &mut options.instances);
    for (path, value) in std::iter::once(("#definition", definition))
        .chain(data.iter().map(|(path, value)| (path.as_str(), value)))
        .chain(
            options
                .instances
                .iter()
                .map(|(path, value)| (path.as_str(), value)),
        )
    {
        if let Err(message) = fel_core::exact_json::check_decimal_range(value) {
            return refuse_input(vec![type_error(path, message)]);
        }
    }
    let mut items = {
        let mut resolved = definition.clone();
        formspec_core::resolve_option_sets_on_definition(&mut resolved);
        rebuild_item_tree(&resolved)
    };
    let definition_errors = rebuild::check_repeat_references(definition, &items);
    if !definition_errors.is_empty() {
        return refuse_input(definition_errors);
    }
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
        context,
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
            source: Some(types::ValidationSource::Definition),
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
        .map(|(name, value)| (name.clone(), fel_core::exact_json::from_fel(value)))
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

/// Check a supplied subject against Core §2.1.6 before any FEL expression runs.
fn check_subject(definition: &Value, subject: &EvalSubject) -> Result<(), ValidationResult> {
    let declared_keys = if let Some(declaration) = definition.get("subject") {
        let declared_type = declaration
            .get("type")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                type_error(
                    "#subjectType",
                    "Definition subject must declare a type".into(),
                )
            })?;
        if subject.subject_type.as_deref() != Some(declared_type) {
            return Err(type_error(
                "#subjectType",
                format!("Subject type must match the Definition's declaration ({declared_type})"),
            ));
        }
        let declared_keys = declaration
            .get("keys")
            .and_then(Value::as_object)
            .ok_or_else(|| {
                type_error(
                    "#subjectKeys",
                    "Definition subject must declare a keys object".into(),
                )
            })?;
        if subject.keys.is_none() {
            return Err(type_error(
                "#subjectKeys",
                "Subject must supply a keys object".into(),
            ));
        }
        Some(declared_keys)
    } else {
        None
    };

    let supplied_keys = subject.keys.as_ref();
    let names: BTreeSet<_> = declared_keys
        .into_iter()
        .flat_map(|keys| keys.keys())
        .chain(supplied_keys.into_iter().flat_map(|keys| keys.keys()))
        .collect();
    for name in names {
        let error = |message: &str| type_error(&format!("#subjectKeys.{name}"), message.into());
        // Match the key-name pattern in the Definition and Response schemas.
        if !name.as_bytes().split_first().is_some_and(|(first, rest)| {
            first.is_ascii_alphabetic()
                && rest.iter().all(|c| c.is_ascii_alphanumeric() || *c == b'_')
        }) {
            return Err(error("Invalid subject key name"));
        }
        let declaration = declared_keys
            .and_then(|keys| keys.get(name))
            .ok_or_else(|| error("Subject key is not declared by the Definition"))?;
        let value = supplied_keys
            .and_then(|keys| keys.get(name))
            .ok_or_else(|| error("Declared subject key is missing"))?;
        match (declaration.get("dataType").and_then(Value::as_str), value) {
            (Some("string"), FelValue::String(_)) => (),
            (Some("integer"), FelValue::Number(number)) if number.is_integer() => {
                if !SubjectKey::is_integer_in_range(number) {
                    return Err(error("Integer subject key must be in the I-JSON range"));
                }
            }
            (Some("string"), _) => return Err(error("Subject key must be a string")),
            (Some("integer"), _) => return Err(error("Subject key must be an integer")),
            _ => {
                return Err(error(
                    "Definition subject key must declare string or integer dataType",
                ));
            }
        }
    }
    Ok(())
}

fn type_error(path: &str, message: String) -> ValidationResult {
    ValidationResult {
        path: path.to_string(),
        severity: types::Severity::Error,
        constraint_kind: types::ConstraintKind::Type,
        code: types::ValidationCode::TypeMismatch,
        message,
        constraint: None,
        source: Some(types::ValidationSource::Bind),
        shape_id: None,
        context: None,
    }
}

/// Refuse ambiguous flat and nested input before any evaluation takes place.
fn refuse_ambiguous_input(paths: &[String]) -> EvaluationResult {
    refuse_input(paths.iter().map(|path| type_error(path, format!(
        "`{path}` is supplied both as a flat dotted key and inside its group object; supply it once"
    ))).collect())
}

fn refuse_input(validations: Vec<ValidationResult>) -> EvaluationResult {
    EvaluationResult {
        values: HashMap::new(),
        data: Value::Object(Default::default()),
        validations,
        diagnostics: Vec::new(),
        non_relevant: Vec::new(),
        variables: HashMap::new(),
        required: HashMap::new(),
        readonly: HashMap::new(),
        item_text: None,
    }
}

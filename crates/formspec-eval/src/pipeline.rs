//! Top-level evaluate orchestration (rebuild → recalculate → revalidate → NRB).

use crate::eval_options::EvalOptions;

use crate::nrb::apply_nrb;
use crate::output_data::build_output_data;
use crate::rebuild;
use crate::rebuild_item_tree;
use crate::recalculate::recalculate_phase;
use crate::revalidate::revalidate_scoped;
use crate::runtime_context::{apply_previous_non_relevant, hydrate_inline_instances};
use crate::scope::{AggregateMemo, ScopeIndex};
use crate::types::{self, EvalSubject, EvaluationResult, ValidationResult};
use fel_core::Value as FelValue;
use fel_core::exact_json::Value;
use formspec_core::subject_key::SubjectKey;
use std::cell::RefCell;
use std::collections::{BTreeSet, HashMap, VecDeque};
use std::rc::Rc;

/// Definition work shared across evaluations of different Response data.
#[derive(Debug)]
pub struct PreparedDefinition {
    definition: Value,
    items: Vec<types::ItemInfo>,
    definition_errors: Vec<ValidationResult>,
}

impl PreparedDefinition {
    /// Resolve authored items and check repeat references once.
    pub fn new(definition: Value) -> Self {
        let mut resolved = definition.clone();
        formspec_core::resolve_option_sets_on_definition(&mut resolved);
        let items = rebuild_item_tree(&resolved);
        let definition_errors = rebuild::check_repeat_references(&definition, &items);
        Self {
            definition,
            items,
            definition_errors,
        }
    }

    /// Evaluate Response data against this prepared Definition.
    pub fn evaluate(
        &self,
        data: &HashMap<String, Value>,
        options: &EvalOptions<'_>,
    ) -> EvaluationResult {
        evaluate_prepared(self, data, options).unwrap_or_else(refuse_input)
    }
}

thread_local! {
    // Stateless WASM and native callers often resubmit the same authored JSON.
    // Keep a small working set by content. Callers with longer lifetimes can
    // own a PreparedDefinition directly.
    static DEFINITIONS: RefCell<VecDeque<Rc<PreparedDefinition>>> = const {
        RefCell::new(VecDeque::new())
    };
}

fn same_definition(left: &Value, right: &Value) -> bool {
    match (left, right) {
        (Value::Object(left), Value::Object(right)) => {
            // Object-style binds are applied in document order.
            left.len() == right.len()
                && left.iter().zip(right).all(|((key, value), (other, next))| {
                    key == other && same_definition(value, next)
                })
        }
        (Value::Array(left), Value::Array(right)) => {
            left.len() == right.len()
                && left
                    .iter()
                    .zip(right)
                    .all(|(value, next)| same_definition(value, next))
        }
        (Value::Number(left), Value::Number(right)) => left.as_str() == right.as_str(),
        _ => left == right,
    }
}

fn prepared_definition(definition: &Value) -> Rc<PreparedDefinition> {
    DEFINITIONS.with_borrow_mut(|cache| {
        const RECENT_DEFINITIONS: usize = 4;
        let prepared = cache
            .iter()
            .position(|entry| same_definition(&entry.definition, definition))
            .and_then(|position| cache.remove(position))
            .unwrap_or_else(|| Rc::new(PreparedDefinition::new(definition.clone())));
        cache.push_front(Rc::clone(&prepared));
        cache.truncate(RECENT_DEFINITIONS);
        prepared
    })
}

/// Evaluate a definition through the full four-phase pipeline.
pub fn evaluate(
    definition: &Value,
    data: &HashMap<String, Value>,
    options: &EvalOptions,
) -> EvaluationResult {
    prepared_definition(definition).evaluate(data, options)
}

/// Submission data kept changing during evaluation.
#[derive(Debug)]
pub struct EvaluateFiledError;

impl std::fmt::Display for EvaluateFiledError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Submit evaluation did not converge on stable Response data")
    }
}

impl std::error::Error for EvaluateFiledError {}

/// Prepare the data and verdict for filing a Response.
///
/// Runs in submit mode and uses the supplied clock throughout. Editing state
/// can affect the initial pass only. The returned successful evaluation runs
/// on its own output data with no editing state. An input refusal retains its
/// findings and empty data.
///
/// # Errors
///
/// Returns [`EvaluateFiledError`] if the data do not settle within the pass limit.
pub fn evaluate_filed(
    definition: &Value,
    data: &HashMap<String, Value>,
    options: &EvalOptions<'_>,
) -> Result<EvaluationResult, EvaluateFiledError> {
    let prepared = prepared_definition(definition);
    let mut options = options.clone();
    options.trigger = types::EvalTrigger::Submit;
    let mut result = match evaluate_prepared(&prepared, data, &options) {
        Ok(result) => result,
        Err(findings) => return Ok(refuse_input(findings)),
    };
    let previous_validations = options.context.previous_validations.take();
    let previous_non_relevant = options.context.previous_non_relevant.take();
    if previous_validations.is_none_or(|findings| findings.is_empty())
        && previous_non_relevant.is_none_or(|paths| paths.is_empty())
        && filed_data_is_stable(data, &result.data)
    {
        return Ok(result);
    }
    // Allow one pass per concrete item for cascaded pruning, plus recalculation and verification.
    let max_passes = result.required.len() + 2;
    for _ in 0..max_passes {
        let Value::Object(output) = result.data else {
            unreachable!("evaluation always produces a Response data object");
        };
        let input = output.into_iter().collect();
        result = match evaluate_prepared(&prepared, &input, &options) {
            Ok(result) => result,
            Err(findings) => return Ok(refuse_input(findings)),
        };
        if filed_data_is_stable(&input, &result.data) {
            return Ok(result);
        }
    }
    Err(EvaluateFiledError)
}

fn filed_data_is_stable(input: &HashMap<String, Value>, output: &Value) -> bool {
    output.as_object().is_some_and(|output| {
        input.len() == output.len()
            && input
                .iter()
                .all(|(key, value)| output.get(key) == Some(value))
    })
}

fn evaluate_prepared(
    prepared: &PreparedDefinition,
    data: &HashMap<String, Value>,
    options: &EvalOptions,
) -> Result<EvaluationResult, Vec<ValidationResult>> {
    let definition = &prepared.definition;
    if let Some(subject) = &options.context.subject
        && let Err(refusal) = check_subject(definition, subject)
    {
        return Err(vec![refusal]);
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
            return Err(vec![type_error(path, message)]);
        }
    }
    if !prepared.definition_errors.is_empty() {
        return Err(prepared.definition_errors.clone());
    }
    let mut items = prepared.items.clone();
    let flat = match rebuild::flatten_response_data(&items, data) {
        Ok(flat) => flat,
        Err(conflicts) => {
            return Err(conflicts.iter().map(|path| type_error(path, format!(
                "`{path}` is supplied both as a flat dotted key and inside its group object; supply it once"
            ))).collect());
        }
    };
    let mut counts = flat.repeat_counts;
    rebuild::expand_repeat_instances_counted(&mut items, &mut counts);
    let mut index = ScopeIndex::new(&items, counts);
    for path in flat.values.keys() {
        index.add_value_path(path);
    }
    let options = &options;
    let context = &options.context;

    if let Some(ref prev_nr) = context.previous_non_relevant {
        apply_previous_non_relevant(&mut items, prev_nr);
    }

    let mut aggregates = AggregateMemo::default();
    let first = recalculate_phase(
        &mut items,
        &index,
        &flat.values,
        definition,
        context.previous_validations.as_deref(),
        options,
        &mut aggregates,
        false,
    );
    let (mut values, mut var_values, cycle_err) =
        (first.values, first.variables, first.cycle_error);

    let mut scoped_variables = first.scoped_variables;
    let (mut validations, mut diagnostics) = revalidate_scoped(
        &items,
        &index,
        &values,
        &scoped_variables,
        definition,
        options,
        &mut aggregates,
    );

    // Item text resolves in this pass: it sees `valid()` from the validations above.
    let next = recalculate_phase(
        &mut items,
        &index,
        &flat.values,
        definition,
        Some(&validations),
        options,
        &mut aggregates,
        true,
    );
    let item_text = next.item_text;
    if next.values != values || next.scoped_variables != scoped_variables {
        values = next.values;
        var_values = next.variables;
        scoped_variables = next.scoped_variables;
        (validations, diagnostics) = revalidate_scoped(
            &items,
            &index,
            &values,
            &scoped_variables,
            definition,
            options,
            &mut aggregates,
        );
    }

    drop(aggregates);

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
    let host_values = values.clone();
    apply_nrb(&mut values, &items, default_nrb);

    let data = build_output_data(&items, &index.counts, &values, default_nrb);

    let variables = var_values
        .iter()
        .map(|(name, value)| (name.clone(), fel_core::exact_json::from_fel(value)))
        .collect();

    Ok(EvaluationResult {
        values,
        host_values,
        data,
        validations,
        diagnostics,
        non_relevant,
        variables,
        scoped_variables,
        row_counts: index.counts,
        required,
        readonly,
        item_text,
    })
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

fn refuse_input(validations: Vec<ValidationResult>) -> EvaluationResult {
    EvaluationResult {
        values: HashMap::new(),
        host_values: HashMap::new(),
        data: Value::Object(Default::default()),
        validations,
        diagnostics: Vec::new(),
        non_relevant: Vec::new(),
        variables: HashMap::new(),
        scoped_variables: HashMap::new(),
        row_counts: HashMap::new(),
        required: HashMap::new(),
        readonly: HashMap::new(),
        item_text: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use fel_core::exact_json::native_json as json;

    #[test]
    fn definition_cache_reuses_content_and_rechecks_authored_edits() {
        let mut definition = json!({
            "items": [
                {"key": "rows", "type": "group", "repeatable": true, "children": [
                    {"key": "name", "dataType": "string"}
                ]},
                {"key": "copy", "dataType": "string"}
            ],
            "binds": [{"path": "copy", "calculate": "$rows.name"}]
        });
        let refused = prepared_definition(&definition);
        assert_eq!(refused.definition_errors.len(), 1);
        assert!(Rc::ptr_eq(
            &refused,
            &prepared_definition(&definition.clone())
        ));

        definition["binds"][0]["calculate"] = json!("$rows[1].name");
        assert!(
            prepared_definition(&definition)
                .definition_errors
                .is_empty()
        );
        assert!(Rc::ptr_eq(
            &refused,
            &prepared_definition(&refused.definition)
        ));
    }
    #[test]
    fn definition_cache_preserves_ordered_bind_precedence() {
        let first = json!({
            "items": [{"key": "rows", "type": "group", "repeatable": true, "children": [
                {"key": "amount", "dataType": "integer"}
            ]}],
            "binds": {
                "rows.amount": {"calculate": "1"},
                "rows[*].amount": {"calculate": "2"}
            }
        });
        let mut second = first.clone();
        second["binds"].as_object_mut().unwrap().reverse();
        let input = HashMap::from([("rows".to_owned(), json!([{}]))]);
        let options = EvalOptions::default();
        assert_eq!(
            evaluate(&first, &input, &options).values["rows[0].amount"],
            json!(2)
        );
        assert_eq!(
            evaluate(&second, &input, &options).values["rows[0].amount"],
            json!(1)
        );
    }
}

//! Top-level evaluate orchestration (rebuild → recalculate → revalidate → NRB).

use crate::eval_options::EvalOptions;

use crate::nrb::apply_nrb;
use crate::output_data::build_output_data;
use crate::rebuild;
use crate::rebuild_item_tree;
use crate::recalculate::{CalculateOrder, Recalculated, recalculate_phase};
use crate::revalidate::revalidate_scoped;
use crate::runtime_context::{apply_previous_non_relevant, hydrate_inline_instances};
use crate::scope::{AggregateMemo, ScopeIndex};
use crate::types::{
    self, ConstraintKind, EvalSubject, EvaluationResult, Severity, ValidationCode,
    ValidationResult, ValidationSource,
};
use fel_core::Value as FelValue;
use fel_core::exact_json::Value;
use formspec_core::BindTargets;
use formspec_core::assembler::unassembled_definition_references;
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
    extension_calls: rebuild::ExtensionCalls,
}

impl PreparedDefinition {
    /// Resolve authored items and check Definition references and authored expressions once.
    pub fn new(definition: Value) -> Self {
        let definition_errors: Vec<_> = unassembled_definition_references(&definition)
            .into_iter()
            .map(|(path, message)| ValidationResult {
                path,
                message,
                severity: Severity::Error,
                constraint_kind: ConstraintKind::Definition,
                code: ValidationCode::UnassembledDefinitionReference,
                source: Some(ValidationSource::Definition),
                constraint: None,
                shape_id: None,
                context: None,
            })
            .collect();
        if !definition_errors.is_empty() {
            return Self {
                definition,
                items: Vec::new(),
                definition_errors,
                extension_calls: rebuild::ExtensionCalls::default(),
            };
        }
        let items = rebuild_item_tree(&definition);
        let (mut definition_errors, extension_calls) =
            rebuild::check_expressions(&definition, &items);
        let binds = BindTargets::new(definition.get("binds"));
        check_calculate_conflicts(&items, &binds, &mut definition_errors);
        if definition_errors.is_empty()
            && let Err(message) = CalculateOrder::check_definition(
                &items,
                &rebuild::parse_variables(&definition),
                &definition,
            )
        {
            definition_errors.push(circular_dependency(message));
        }
        Self {
            definition,
            items,
            definition_errors,
            extension_calls,
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

#[cfg(feature = "create")]
pub(crate) fn creation_refusal(
    definition: &Value,
    data: &Value,
    options: &EvalOptions<'_>,
) -> Option<ValidationResult> {
    let prepared = prepared_definition(definition);
    let fields = formspec_core::json_object_to_string_map(data);
    precheck_inputs(definition, &fields, options)
        .err()
        .or_else(|| {
            prepared
                .definition_errors
                .iter()
                .find(|error| {
                    matches!(
                        error.code,
                        ValidationCode::CircularDependency
                            | ValidationCode::CalculateTargetConflict
                    )
                })
                .cloned()
        })
        .or_else(|| {
            prepared
                .extension_calls
                .check(options.extensions)
                .into_iter()
                .next()
        })
        .or_else(|| {
            flatten_input(&prepared.items, &fields)
                .err()?
                .into_iter()
                .next()
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
    let mut options = options.clone();
    hydrate_inline_instances(definition, &mut options.instances);
    precheck_inputs(definition, data, &options).map_err(|finding| vec![finding])?;
    if !prepared.definition_errors.is_empty() {
        return Err(prepared.definition_errors.clone());
    }
    let call_errors = prepared.extension_calls.check(options.extensions);
    if !call_errors.is_empty() {
        return Err(call_errors);
    }
    let mut items = prepared.items.clone();
    let flat = flatten_input(&items, data)?;
    let mut counts = flat.repeat_counts;
    rebuild::expand_repeat_instances_counted(&mut items, &mut counts);
    let binds = BindTargets::new(definition.get("binds"));
    let mut indexed_binds = fel_core::exact_json::Map::new();
    if binds.has_indexed() {
        rebuild::apply_indexed_binds(&mut items, &binds, &mut indexed_binds);
    }
    let mut index = ScopeIndex::new(&items, counts);
    index.add_template_repeats(&prepared.items);
    for path in flat.values.keys() {
        index.add_value_path(path);
    }
    let order = CalculateOrder::new(
        &items,
        &index,
        &rebuild::parse_variables(definition),
        definition,
    )
    .map_err(|message| vec![circular_dependency(message)])?;
    let options = &options;
    let context = &options.context;

    if let Some(ref prev_nr) = context.previous_non_relevant {
        apply_previous_non_relevant(&mut items, prev_nr);
    }

    let mut aggregates = AggregateMemo::default();
    // Every `valid()` in a pass reads the previous pass's error paths: the caller's
    // previous evaluation for the first pass, then this evaluation's findings.
    let mut reads = types::error_paths(context.previous_validations.as_deref().unwrap_or_default());
    let mut pass = recalculate_phase(
        &mut items,
        &index,
        &flat.values,
        definition,
        &reads,
        options,
        &order,
        &mut aggregates,
        false,
    );
    let cycle_err = pass.cycle_error.take();
    let (mut validations, mut diagnostics) = revalidate_scoped(
        &items,
        &index,
        &pass.values,
        &pass.scoped_variables,
        &reads,
        definition,
        options,
        &mut aggregates,
    );

    // Rebuild refuses every cycle through `valid()` (Core §3.6.2), so each pass
    // settles one more step of the longest `valid()` chain, which is no longer
    // than the item count. A pass whose findings match its reads is final; its
    // findings come from its own relevance, so no hidden field keeps one. The
    // second pass always runs, because it resolves Item text.
    let max_passes = pass.mip_states.len() + 1;
    let mut found = types::error_paths(&validations);
    for _ in 0..max_passes {
        let next = recalculate_phase(
            &mut items,
            &index,
            &flat.values,
            definition,
            &found,
            options,
            &order,
            &mut aggregates,
            true,
        );
        // Shapes and constraints can read MIPs even when two passes produce the same values.
        let mips_changed = pass.mip_states.iter().any(|(path, before)| {
            next.mip_states.get(path).is_some_and(|after| {
                before.relevant != after.relevant
                    || before.required != after.required
                    || before.readonly != after.readonly
            })
        });
        let changed = (order.reads_validity() && found != reads)
            || next.values != pass.values
            || next.scoped_variables != pass.scoped_variables
            || mips_changed;
        (pass, reads) = (next, found);
        if !changed {
            break;
        }
        (validations, diagnostics) = revalidate_scoped(
            &items,
            &index,
            &pass.values,
            &pass.scoped_variables,
            &reads,
            definition,
            options,
            &mut aggregates,
        );
        found = types::error_paths(&validations);
        if !order.reads_validity() || found == reads {
            break;
        }
    }
    let Recalculated {
        mut values,
        variables: var_values,
        scoped_variables,
        item_text,
        diagnostics: recalculate_diagnostics,
        ..
    } = pass;

    drop(aggregates);

    if let Some(cycle_msg) = cycle_err {
        validations.push(circular_dependency(cycle_msg));
    }

    let mut non_relevant = Vec::new();
    types::collect_non_relevant(&items, &mut non_relevant);

    let mut explanation_actions = Vec::new();
    let mut candidate_explanations = None;
    if options.trigger == types::EvalTrigger::Submit {
        let explanation_findings = crate::revalidate::explanation_findings(
            &items,
            &index,
            &values,
            &scoped_variables,
            &reads,
            definition,
            options,
            &mut validations,
        );
        match crate::explanations::action_rows(&explanation_findings) {
            Ok(actions) => explanation_actions = actions,
            Err(message) => validations.push(type_error("#", message)),
        }
        match crate::explanations::compare(
            &explanation_findings,
            &context.explanations,
            &non_relevant,
        ) {
            Ok(results) => {
                validations.extend(results);
                candidate_explanations = Some(crate::explanations::candidate_entries(
                    &context.explanations,
                    &explanation_findings,
                ));
            }
            Err(message) => validations.push(type_error("#", message)),
        }
    }

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
    let calculated_paths = order.writer_paths(&items);

    let variables = var_values
        .iter()
        .map(|(name, value)| (name.clone(), fel_core::exact_json::from_fel(value)))
        .collect();

    Ok(EvaluationResult {
        refused: false,
        explanation_actions,
        candidate_explanations,
        values,
        host_values,
        calculated_paths,
        indexed_binds,
        data,
        validations,
        diagnostics: recalculate_diagnostics
            .into_iter()
            .chain(diagnostics)
            .collect(),
        non_relevant,
        variables,
        scoped_variables,
        row_counts: index.counts,
        required,
        readonly,
        item_text,
    })
}

/// Refuse inputs before creation or recalculation can evaluate expressions.
fn precheck_inputs(
    definition: &Value,
    data: &HashMap<String, Value>,
    options: &EvalOptions<'_>,
) -> Result<(), ValidationResult> {
    if let Some(subject) = &options.context.subject
        && let Err(refusal) = check_subject(definition, subject)
    {
        return Err(refusal);
    }
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
            return Err(type_error(path, message));
        }
    }
    Ok(())
}

fn flatten_input(
    items: &[types::ItemInfo],
    data: &HashMap<String, Value>,
) -> Result<rebuild::FlatInput, Vec<ValidationResult>> {
    rebuild::flatten_response_data(items, data).map_err(|conflicts| {
        conflicts.iter().map(|path| type_error(path, format!(
            "`{path}` is supplied both as a flat dotted key and inside its group object; supply it once"
        ))).collect()
    })
}

/// Check a supplied subject against Core §2.1.6.
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

fn circular_dependency(message: String) -> ValidationResult {
    definition_error(String::new(), ValidationCode::CircularDependency, message)
}

fn check_calculate_conflicts(
    items: &[types::ItemInfo],
    binds: &BindTargets<'_, Value>,
    errors: &mut Vec<ValidationResult>,
) {
    for item in items {
        if binds.has_calculate_conflict(&item.path)
            || binds.entries(&item.path).is_empty() && binds.has_calculate_conflict(&item.key)
        {
            errors.push(definition_error(
                item.path.clone(),
                ValidationCode::CalculateTargetConflict,
                format!("Multiple calculate Binds target `{}`", item.path),
            ));
        }
        check_calculate_conflicts(&item.children, binds, errors);
    }
}

fn definition_error(path: String, code: ValidationCode, message: String) -> ValidationResult {
    ValidationResult {
        path,
        severity: Severity::Error,
        constraint_kind: ConstraintKind::Definition,
        code,
        message,
        constraint: None,
        source: Some(ValidationSource::Definition),
        shape_id: None,
        context: None,
    }
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
        refused: true,
        explanation_actions: Vec::new(),
        candidate_explanations: None,
        values: HashMap::new(),
        host_values: HashMap::new(),
        calculated_paths: Vec::new(),
        indexed_binds: Default::default(),
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
        // Competing calculate Binds now refuse under Core §3.10.1.
        // Required still tests property replacement and the order-sensitive cache key.
        let first = json!({
            "items": [{"key": "rows", "type": "group", "repeatable": true, "children": [
                {"key": "amount", "dataType": "integer"}
            ]}],
            "binds": {
                "rows.amount": {"required": "false"},
                "rows[*].amount": {"required": "true"}
            }
        });
        let mut second = first.clone();
        second["binds"].as_object_mut().unwrap().reverse();
        let input = HashMap::from([("rows".to_owned(), json!([{}]))]);
        let options = EvalOptions::default();
        assert!(evaluate(&first, &input, &options).required["rows[0].amount"]);
        assert!(!evaluate(&second, &input, &options).required["rows[0].amount"]);
    }

    #[test]
    fn prepared_calculates_follow_nested_sites_across_repeat_sizes() {
        let definition = json!({"items": [
            {"key": "groups", "type": "group", "repeatable": true, "children": [
                {"key": "rows", "type": "group", "repeatable": true, "children": [
                    {"key": "share", "dataType": "decimal"},
                    {"key": "amt", "dataType": "integer"},
                    {"key": "input", "dataType": "integer"}
                ]}
            ]}
        ],
            "binds": [
                {"path": "groups[*].rows[*].share", "calculate":
                        "@current.amt / sum($rows[*].amt)"},
                {"path": "groups[*].rows[*].amt", "calculate": "$input * 2"},
            ]});
        let prepared = prepared_definition(&definition);
        let options = EvalOptions::default();

        let empty = prepared.evaluate(&HashMap::new(), &options);
        assert_eq!(empty.data["groups"], json!([]));

        let input = HashMap::from([(
            "groups".to_owned(),
            json!([{"rows": [{"input": 1}, {"input": 3}]}, {"rows": [{"input": 7}]}]),
        )]);
        let filled = prepared.evaluate(&input, &options);
        assert_eq!(filled.values["groups[0].rows[0].share"], json!(0.25));
        assert_eq!(filled.values["groups[0].rows[1].share"], json!(0.75));
        assert_eq!(filled.values["groups[1].rows[0].share"], json!(1));
        assert!(Rc::ptr_eq(&prepared, &prepared_definition(&definition)));
    }
}

//! Phase 2: Recalculate — evaluate computed values and bind expressions.
//!
//! Submodules follow data flow: `json_fel` (coercion) → `variables` / `repeats` →
//! `bind_pass` (input normalization, relevance, required, readonly) → ordered calculates.
#![allow(clippy::missing_docs_in_private_items)]

mod bind_pass;
mod calculate_order;
mod calculate_pass;
pub(crate) mod json_fel;
mod text_pass;
pub(crate) mod variables;
mod walk;

use std::collections::{HashMap, HashSet};

use fel_core::Value as FelValue;
use fel_core::exact_json::Value;

use crate::eval_options::EvalOptions;
use crate::fel_eval::Fel;
use crate::rebuild::parse_variables;
use crate::scope::{AggregateMemo, ScopeData, ScopeIndex, ScopedVariables};
use crate::types::{EvalDiagnostic, ItemInfo, ItemText, ValidationResult};

use bind_pass::{BindPass, Parent};
pub(crate) use calculate_order::CalculateOrder;
use walk::Walk;

/// Recalculate all computed values with full processing model.
///
/// `previous_validations` feed the `valid()` MIP state; `options` supplies the
/// clock (`context.now_iso`) and named instances.
///
/// Returns response values, variable values, and a variable cycle error. Variables
/// stay FEL values so a `date`-valued variable reads as a date downstream (Core §4.5).
pub fn recalculate(
    items: &mut [ItemInfo],
    data: &HashMap<String, Value>,
    definition: &Value,
    previous_validations: Option<&[ValidationResult]>,
    options: &EvalOptions,
) -> (
    HashMap<String, Value>,
    HashMap<String, FelValue>,
    Option<String>,
) {
    let index = ScopeIndex::for_flat(items, data.keys());
    let order = match CalculateOrder::new(items, &index, &parse_variables(definition), definition) {
        Ok(order) => order,
        Err(message) => return (HashMap::new(), HashMap::new(), Some(message)),
    };
    let recalculated = recalculate_phase(
        items,
        &index,
        data,
        definition,
        previous_validations,
        options,
        &order,
        &mut AggregateMemo::default(),
        false,
    );
    (
        recalculated.values,
        recalculated.variables,
        recalculated.cycle_error,
    )
}

/// Output of one recalculate phase.
pub(crate) struct Recalculated {
    /// Evaluation errors from the calculates that produced `values`.
    pub(crate) diagnostics: Vec<EvalDiagnostic>,
    /// Response values.
    pub(crate) values: HashMap<String, Value>,
    /// Variable values as FEL values.
    pub(crate) variables: HashMap<String, FelValue>,
    pub(crate) scoped_variables: ScopedVariables,
    /// Variable dependency cycle, if any.
    pub(crate) cycle_error: Option<String>,
    /// Item text by instance path, when requested and `options.item_text` is set.
    pub(crate) item_text: Option<HashMap<String, ItemText>>,
}

/// [`recalculate`], plus Item text from the settled scope when `resolve_text` and `options.item_text`.
pub(crate) fn recalculate_phase(
    items: &mut [ItemInfo],
    index: &ScopeIndex,
    data: &HashMap<String, Value>,
    definition: &Value,
    previous_validations: Option<&[ValidationResult]>,
    options: &EvalOptions,
    order: &CalculateOrder,
    aggregates: &mut AggregateMemo,
    resolve_text: bool,
) -> Recalculated {
    let fel = Fel::new(options.extensions);
    let mut values = data.clone();
    bind_pass::normalize_input_text(items, &mut values);

    let mut state = ScopeData::for_values(index, &values, options);
    let var_defs = parse_variables(definition);
    let expressions: Vec<_> = var_defs
        .iter()
        .map(|def| fel_core::parse(&def.expression).ok())
        .collect();
    let variables = variables::Variables::new(&var_defs, index, &expressions);
    // Seed values only where early reads cannot see them. Unchanged writes preserve the memo.
    order.seed_previous_values(items, &mut state, aggregates);
    state.restore_aggregates(aggregates);
    let (_, cycle_err) = variables.evaluate(&mut state, index, fel);
    let invalid_paths: HashSet<String> = previous_validations
        .unwrap_or(&[])
        .iter()
        .filter(|result| {
            result.severity == crate::types::Severity::Error && !result.path.is_empty()
        })
        .map(|result| result.path.clone())
        .collect();
    for path in &invalid_paths {
        state.env.mip_states.entry(path.clone()).or_default().valid = false;
    }

    let walk = Walk { index, fel };
    order.evaluate_early(items, &mut state, &mut values, &walk);
    walk.items(
        items,
        &mut state,
        &mut values,
        &mut BindPass {
            invalid_paths: &invalid_paths,
            early_writers: order.early_writers(),
        },
        Parent::ROOT,
    );

    let mut diagnostics = order.evaluate(items, &mut state, &mut values, &walk);
    if !var_defs.is_empty() {
        bind_pass::refresh_required_state(items, &mut state, &invalid_paths, index, fel);
        variables.evaluate(&mut state, index, fel);
        diagnostics = order.evaluate(items, &mut state, &mut values, &walk);
        bind_pass::refresh_required_state(items, &mut state, &invalid_paths, index, fel);
    }
    let (final_var_values, _) = variables.evaluate(&mut state, index, fel);

    // Required expressions may read calculates that appeared later in document order.
    bind_pass::refresh_required_state(items, &mut state, &invalid_paths, index, fel);

    let item_text = options
        .item_text
        .as_ref()
        .filter(|_| resolve_text)
        .map(|request| {
            let mut pass = text_pass::TextPass::new(definition, request);
            walk.items(items, &mut state, &mut values, &mut pass, ());
            pass.text
        });

    let scoped_variables = std::mem::take(&mut state.variables);
    state.save_aggregates(aggregates);
    Recalculated {
        diagnostics,
        values,
        variables: final_var_values,
        scoped_variables,
        cycle_error: cycle_err,
        item_text,
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;
    use crate::rebuild::rebuild_item_tree;
    use crate::types::find_item_by_path;
    use fel_core::exact_json::native_json as json;

    #[test]
    fn calculated_column_is_complete_before_the_first_aggregate_scan() {
        assert_calculated_column_scans_once(&EvalOptions::default(), "@current.amt", false);
    }

    #[test]
    fn calculated_column_scans_once_with_an_empty_extension_host() {
        let extensions = fel_core::ExtensionRegistry::default();
        assert_calculated_column_scans_once(
            &EvalOptions {
                extensions: Some(&extensions),
                ..EvalOptions::default()
            },
            "@current.amt",
            false,
        );
    }

    #[test]
    fn calculated_column_scans_once_when_required_reads_a_calculate() {
        assert_calculated_column_scans_once(&EvalOptions::default(), "@current.amt", true);
    }

    #[test]
    fn calculated_column_scans_once_with_called_current() {
        assert_calculated_column_scans_once(&EvalOptions::default(), "@current().amt", false);
    }

    #[test]
    fn calculated_column_and_predicate_scan_once_in_a_mixed_form() {
        let def = json!({"items": [
            {"key": "ready", "dataType": "boolean", "calculate": "true"},
            {"key": "checked", "dataType": "string", "required": "$ready"},
            {"key": "visible", "dataType": "string", "relevant": "required($checked)"},
            {"key": "rows", "type": "group", "repeatable": true, "children": [
                {"key": "positive", "dataType": "integer", "calculate": "countWhere($rows[*].amt, $ > 0)"},
                {"key": "share", "dataType": "decimal", "calculate": "$amt / sum($rows[*].amt)"},
                {"key": "amt", "dataType": "integer", "calculate": "$input * 2"},
                {"key": "input", "dataType": "integer"}
            ]}
        ]});
        let (first, second, scans, items) =
            evaluate_twice(&def, HashMap::new(), &EvalOptions::default());
        assert!(find_item_by_path(&items, "visible").unwrap().mip.relevant);
        for result in [first, second] {
            assert_eq!(result.values["rows[0].positive"], json!(2));
            assert_eq!(result.values["rows[1].share"], json!(0.75));
        }
        assert_eq!(scans, 2, "one scan per aggregate across both phases");
    }

    #[test]
    fn early_readonly_reads_the_completed_column_and_bare_repeat_predicate() {
        assert_early_readonly_reads_completed_column("$input * 2");
    }

    #[test]
    fn early_readonly_batches_a_column_that_reads_prior_validity() {
        assert_early_readonly_reads_completed_column("if(valid($input), $input * 2, 0)");
    }

    fn assert_early_readonly_reads_completed_column(amount: &str) {
        let def = json!({"items": [
            {"key": "rows", "type": "group", "repeatable": true, "children": [
                {"key": "early", "dataType": "integer", "readonly": "$share > 0"},
                {"key": "share", "dataType": "decimal", "calculate": "$amt / sum($rows[*].amt)"},
                {"key": "positive", "dataType": "integer", "calculate": "countWhere($rows, $.amt > 0)"},
                {"key": "amt", "dataType": "integer", "calculate": amount},
                {"key": "input", "dataType": "integer", "constraint": "$ >= 0"}
            ]}
        ]});
        let (first, second, scans, items) =
            evaluate_twice(&def, HashMap::new(), &EvalOptions::default());
        assert!(
            find_item_by_path(&items, "rows[0].early")
                .unwrap()
                .mip
                .readonly
        );
        assert_eq!(first.values["rows[0].positive"], json!(2));
        assert_eq!(second.values["rows[1].share"], json!(0.75));
        assert_eq!(scans, 2, "one scan per aggregate across both phases");
    }

    #[test]
    fn calculated_column_scans_once_with_a_current_argument() {
        assert_calculated_column_scans_once(
            &EvalOptions::default(),
            "@current('ignored)argument').amt",
            false,
        );
    }

    fn assert_calculated_column_scans_once(
        options: &EvalOptions,
        numerator: &str,
        required_reads_calculate: bool,
    ) {
        let def = json!({
            "variables": [{"name": "multiplier", "expression": "2"}],
            "items": [{ "key": "rows", "type": "group", "repeatable": true, "children": [
                { "key": "share", "dataType": "decimal", "calculate": format!("{numerator} / sum($rows[*].amt)") },
                { "key": "amt", "dataType": "integer", "calculate": "$input * @multiplier" },
                { "key": "input", "dataType": "integer", "required":
                    if required_reads_calculate { "$share > 0.5" } else { "false" } }
            ] }]
        });
        let (first, second, scans, items) = evaluate_twice(&def, HashMap::new(), options);
        for result in [first, second] {
            assert_eq!(result.values["rows[0].share"], json!(0.25));
            assert_eq!(result.values["rows[1].share"], json!(0.75));
        }
        if required_reads_calculate {
            assert!(
                !find_item_by_path(&items, "rows[0].input")
                    .unwrap()
                    .mip
                    .required
            );
            assert!(
                find_item_by_path(&items, "rows[1].input")
                    .unwrap()
                    .mip
                    .required
            );
        }
        assert_eq!(scans, 1, "scan the settled column once across both phases");
    }

    #[test]
    fn validation_feedback_rescans_a_changed_calculated_column() {
        let def = json!({
            "items": [
                { "key": "sentinel", "dataType": "string", "required": true },
                { "key": "gate", "dataType": "integer", "relevant": "valid($sentinel)", "excludedValue": "null" },
                { "key": "rows", "type": "group", "repeatable": true, "children": [
                    { "key": "share", "dataType": "decimal", "calculate": "$amt / sum($rows[*].amt)" },
                    { "key": "amt", "dataType": "integer", "calculate": "$input + coalesce($gate, 0)" },
                    { "key": "input", "dataType": "integer" }
                ] }
            ]
        });
        let (first, second, scans, _) = evaluate_twice(
            &def,
            HashMap::from([("gate".into(), json!(2))]),
            &EvalOptions::default(),
        );
        assert_eq!(first.values["rows[0].share"], json!(0.375));
        assert_eq!(second.values["rows[0].share"], json!(0.25));
        assert_eq!(scans, 2, "scan each settled version of the column once");
    }

    #[test]
    fn relevance_observes_required_during_the_bind_walk() {
        let def = json!({"items": [
            {"key": "ready", "dataType": "boolean", "calculate": "true"},
            {"key": "checked", "dataType": "string", "required": "$ready"},
            {"key": "visible", "dataType": "string", "relevant": "required($checked)"},
            {"key": "rows", "type": "group", "repeatable": true, "children": [
                {"key": "share", "dataType": "decimal", "calculate": "$amt / sum($rows[*].amt)"},
                {"key": "amt", "dataType": "integer", "calculate": "$input * 2"},
                {"key": "input", "dataType": "integer"}
            ]}
        ]});
        let (_, _, _, items) = evaluate_twice(&def, HashMap::new(), &EvalOptions::default());
        assert!(find_item_by_path(&items, "visible").unwrap().mip.relevant);
    }

    #[test]
    fn variable_reads_calculated_required_state_with_zero_repeat_rows() {
        let def = json!({
            "variables": [{"name": "v", "expression": "required($x)"}],
            "items": [
                {"key": "t", "dataType": "integer"},
                {"key": "c", "dataType": "integer", "calculate": "$t * 2"},
                {"key": "x", "dataType": "string", "required": "$c > 5"},
                {"key": "vc", "dataType": "integer", "calculate": "if(@v, 1, 0)"},
                {"key": "rows", "type": "group", "repeatable": true, "children": [
                    {"key": "share", "dataType": "decimal", "calculate": "$amt / sum($rows[*].amt)"},
                    {"key": "amt", "dataType": "integer", "calculate": "$input * 2"},
                    {"key": "input", "dataType": "integer"}
                ]}
            ]
        });
        let data = HashMap::from([("t".into(), json!(4))]);
        let result = crate::evaluate(&def, &data, &EvalOptions::default());
        assert_eq!(result.values["vc"], json!(1));
    }

    #[test]
    fn variable_reads_required_when_its_calculation_comes_later() {
        let def = json!({
            "variables": [{"name": "v", "expression": "required($x)"}],
            "items": [
                {"key": "x", "dataType": "string", "required": "$c > 5"},
                {"key": "c", "dataType": "integer", "calculate": "$t * 2"},
                {"key": "t", "dataType": "integer"},
                {"key": "vc", "dataType": "integer", "calculate": "if(@v, 1, 0)"}
            ]
        });
        let result = crate::evaluate(
            &def,
            &HashMap::from([("t".into(), json!(4))]),
            &EvalOptions::default(),
        );
        assert!(result.required["x"]);
        assert_eq!(result.values["vc"], json!(1));
    }

    #[test]
    fn keyed_row_lookup_reads_completed_calculated_columns() {
        let def = json!({"items": [
            {"key": "selected", "dataType": "integer", "calculate": "$rows[id = 6].amt"},
            {"key": "rows", "type": "group", "repeatable": true, "children": [
                {"key": "id", "dataType": "integer", "calculate": "$input * 2"},
                {"key": "amt", "dataType": "integer", "calculate": "$input * 4"},
                {"key": "input", "dataType": "integer"}
            ]}
        ]});
        let (first, second, _, _) = evaluate_twice(&def, HashMap::new(), &EvalOptions::default());
        for result in [first, second] {
            assert_eq!(result.values["selected"], json!(12));
        }
    }

    fn evaluate_twice(
        def: &Value,
        mut data: HashMap<String, Value>,
        options: &EvalOptions,
    ) -> (Recalculated, Recalculated, usize, Vec<ItemInfo>) {
        data.extend([
            ("rows[0].input".into(), json!(1)),
            ("rows[1].input".into(), json!(3)),
        ]);
        let mut items = rebuild_item_tree(def);
        crate::rebuild::expand_repeat_instances(&mut items, &data);
        let index = ScopeIndex::for_flat(&items, data.keys());
        let order = CalculateOrder::new(&items, &index, &parse_variables(def), def).unwrap();
        let mut memo = AggregateMemo::default();
        let first = recalculate_phase(
            &mut items, &index, &data, def, None, options, &order, &mut memo, false,
        );
        let (validations, _) = crate::revalidate::revalidate_scoped(
            &items,
            &index,
            &first.values,
            &first.scoped_variables,
            def,
            options,
            &mut memo,
        );
        let second = recalculate_phase(
            &mut items,
            &index,
            &data,
            def,
            Some(&validations),
            options,
            &order,
            &mut memo,
            false,
        );
        (first, second, memo.scans, items)
    }

    #[test]
    fn calculation_dependencies_refuse_a_postfix_self_read() {
        let def = json!({
            "items": [
                { "key": "counter", "dataType": "object", "calculate":
                    "{amount: coalesce(($).amount, 0) + 1}" },
                { "key": "rows", "type": "group", "repeatable": true, "children": [
                    { "key": "amt", "dataType": "integer", "calculate": "$input * 2" },
                    { "key": "share", "dataType": "decimal", "calculate": "$amt / sum($rows[*].amt)" },
                    { "key": "input", "dataType": "integer" }
                ] }
            ]
        });
        let data = HashMap::from([("rows[0].input".into(), json!(1))]);
        // Core §3.6.2 requires refusal of the Definition. The old assertion
        // treated the value produced by the 100-pass cap as a valid answer.
        let result = crate::evaluate(&def, &data, &EvalOptions::default());
        assert_eq!(result.validations[0].code, "CIRCULAR_DEPENDENCY");
        assert_eq!(result.data, json!({}));
    }

    #[test]
    fn relevance_default_preserves_the_calculated_type() {
        assert_late_default_settles_calculated_type(false);
    }

    #[test]
    fn early_readonly_calculate_is_resettled_when_only_its_type_changes() {
        assert_late_default_settles_calculated_type(true);
    }

    fn assert_late_default_settles_calculated_type(readonly_reads_calculate: bool) {
        let mut def = json!({
            "items": [
                { "key": "reader", "dataType": "string", "calculate": "if(isNull($p), 'string', typeOf($p))" },
                { "key": "p", "dataType": "date", "calculate": "if(coalesce($gate, false), date('2026-11-18'), '2026-11-18')" },
                { "key": "gate", "dataType": "boolean", "default": true },
                { "key": "rows", "type": "group", "repeatable": true, "children": [
                    { "key": "amt", "dataType": "integer", "calculate": "$input * 2" },
                    { "key": "share", "dataType": "decimal", "calculate": "$amt / sum($rows[*].amt)" },
                    { "key": "input", "dataType": "integer" }
                ] }
            ]
        });
        if readonly_reads_calculate {
            // Readonly can observe the earlier write before the default is applied.
            def["items"][2]["readonly"] = json!("present($p)");
        }
        let data = HashMap::from([("rows[0].input".into(), json!(1))]);
        let mut items = rebuild_item_tree(&def);
        items[2].mip.prev_relevant = false;
        crate::rebuild::expand_repeat_instances(&mut items, &data);
        let (values, _, _) = recalculate(&mut items, &data, &def, None, &EvalOptions::default());
        // Core calculates observe the FEL type even when the two values have the same JSON.
        assert_eq!(values["reader"], json!("date"));
        assert_eq!(values["gate"], json!(true));
        assert_eq!(values["rows[0].share"], json!(1));
    }

    #[test]
    fn test_relevance_and_inheritance() {
        let def = json!({
            "items": [
                {
                    "key": "parent",
                    "children": [
                        { "key": "child", "dataType": "string" }
                    ]
                }
            ],
            "binds": {
                "parent": { "relevant": "false" },
                "parent.child": { "required": "true" }
            }
        });

        let data = HashMap::new();
        let mut items = rebuild_item_tree(&def);
        let _ = recalculate(&mut items, &data, &def, None, &EvalOptions::default());

        let parent = find_item_by_path(&items, "parent").unwrap();
        assert!(!parent.mip.relevant, "parent should be non-relevant");
        let child = find_item_by_path(&items, "parent.child").unwrap();
        assert!(
            !child.mip.relevant,
            "child should be non-relevant due to parent"
        );
    }

    #[test]
    fn test_relevance_child_irrelevant_parent_relevant() {
        let def = json!({
            "items": [
                {
                    "key": "parent",
                    "children": [
                        { "key": "child", "dataType": "string" }
                    ]
                }
            ],
            "binds": {
                "parent.child": { "relevant": "false" }
            }
        });

        let data = HashMap::new();
        let mut items = rebuild_item_tree(&def);
        let _ = recalculate(&mut items, &data, &def, None, &EvalOptions::default());

        let parent = find_item_by_path(&items, "parent").unwrap();
        assert!(parent.mip.relevant, "parent should be relevant");
        let child = find_item_by_path(&items, "parent.child").unwrap();
        assert!(
            !child.mip.relevant,
            "child should be non-relevant from own bind"
        );
    }

    #[test]
    fn test_readonly_or_inheritance() {
        let def = json!({
            "items": [
                {
                    "key": "section",
                    "children": [
                        { "key": "field", "dataType": "string" }
                    ]
                }
            ],
            "binds": {
                "section": { "readonly": "true" }
            }
        });

        let mut data = HashMap::new();
        data.insert("section.field".to_string(), json!("test"));

        let mut items = rebuild_item_tree(&def);
        let (values, _, _) = recalculate(&mut items, &data, &def, None, &EvalOptions::default());

        let child = find_item_by_path(&items, "section.field").unwrap();
        assert!(
            child.mip.readonly,
            "child should be readonly due to OR inheritance from parent"
        );

        let parent = find_item_by_path(&items, "section").unwrap();
        assert!(parent.mip.readonly, "parent should be explicitly readonly");

        let _ = values;
    }

    #[test]
    fn test_readonly_child_not_inherited_when_parent_not_readonly() {
        let def = json!({
            "items": [
                {
                    "key": "section",
                    "children": [
                        { "key": "field", "dataType": "string" }
                    ]
                }
            ],
            "binds": {
                "section.field": { "readonly": "true" }
            }
        });

        let mut data = HashMap::new();
        data.insert("section.field".to_string(), json!("test"));

        let mut items = rebuild_item_tree(&def);
        let _ = recalculate(&mut items, &data, &def, None, &EvalOptions::default());

        let parent = find_item_by_path(&items, "section").unwrap();
        assert!(
            !parent.mip.readonly,
            "parent should not inherit readonly from child"
        );

        let child = find_item_by_path(&items, "section.field").unwrap();
        assert!(child.mip.readonly, "child should be explicitly readonly");
    }

    #[test]
    fn recalculate_returns_values_and_variables() {
        let def = json!({
            "items": [
                { "key": "price", "dataType": "number" },
                { "key": "qty", "dataType": "integer" },
                { "key": "total", "dataType": "number" }
            ],
            "binds": {
                "total": { "calculate": "$price * $qty" }
            },
            "variables": [
                { "name": "taxRate", "expression": "0.1" }
            ]
        });

        let mut data = HashMap::new();
        data.insert("price".to_string(), json!(25));
        data.insert("qty".to_string(), json!(4));

        let mut items = rebuild_item_tree(&def);
        let (values, var_values, _) =
            recalculate(&mut items, &data, &def, None, &EvalOptions::default());

        assert_eq!(values.get("total"), Some(&json!(100)));
        assert!(
            var_values.contains_key("taxRate"),
            "variable should be evaluated"
        );
    }

    #[test]
    fn recalculate_sets_item_state() {
        let def = json!({
            "items": [
                { "key": "toggle", "dataType": "boolean" },
                { "key": "field", "dataType": "string" }
            ],
            "binds": {
                "field": { "relevant": "$toggle", "readonly": "true", "required": "true" }
            }
        });

        let mut data = HashMap::new();
        data.insert("toggle".to_string(), json!(false));

        let mut items = rebuild_item_tree(&def);
        let _ = recalculate(&mut items, &data, &def, None, &EvalOptions::default());

        let field = find_item_by_path(&items, "field").unwrap();
        assert!(
            !field.mip.relevant,
            "field should be non-relevant when toggle is false"
        );
        assert!(field.mip.readonly, "field should be readonly");
        assert!(!field.mip.required, "required suppressed when non-relevant");
    }

    #[test]
    fn relevant_and_inheritance_three_levels() {
        let def = json!({
            "items": [{
                "key": "grandparent",
                "children": [{
                    "key": "parent",
                    "children": [
                        { "key": "child", "dataType": "string" }
                    ]
                }]
            }],
            "binds": {
                "grandparent": { "relevant": "false" }
            }
        });

        let data = HashMap::new();
        let mut items = rebuild_item_tree(&def);
        let _ = recalculate(&mut items, &data, &def, None, &EvalOptions::default());

        assert!(
            !find_item_by_path(&items, "grandparent")
                .unwrap()
                .mip
                .relevant
        );
        assert!(
            !find_item_by_path(&items, "grandparent.parent")
                .unwrap()
                .mip
                .relevant
        );
        assert!(
            !find_item_by_path(&items, "grandparent.parent.child")
                .unwrap()
                .mip
                .relevant,
            "grandchild should be non-relevant via AND inheritance from grandparent"
        );
    }

    #[test]
    fn readonly_or_inheritance_three_levels() {
        let def = json!({
            "items": [{
                "key": "grandparent",
                "children": [{
                    "key": "parent",
                    "children": [
                        { "key": "child", "dataType": "string" }
                    ]
                }]
            }],
            "binds": {
                "grandparent": { "readonly": "true" }
            }
        });

        let mut data = HashMap::new();
        data.insert("grandparent.parent.child".to_string(), json!("val"));

        let mut items = rebuild_item_tree(&def);
        let _ = recalculate(&mut items, &data, &def, None, &EvalOptions::default());

        let child = find_item_by_path(&items, "grandparent.parent.child").unwrap();
        assert!(
            child.mip.readonly,
            "grandchild should be readonly via OR inheritance from grandparent"
        );

        let parent = find_item_by_path(&items, "grandparent.parent").unwrap();
        assert!(
            parent.mip.readonly,
            "parent should be readonly via OR inheritance from grandparent"
        );
    }

    #[test]
    fn required_not_inherited_three_levels() {
        let def = json!({
            "items": [{
                "key": "grandparent",
                "children": [{
                    "key": "parent",
                    "children": [
                        { "key": "child", "dataType": "string" }
                    ]
                }]
            }],
            "binds": {
                "grandparent": { "required": "true" }
            }
        });

        let data = HashMap::new();
        let mut items = rebuild_item_tree(&def);
        let _ = recalculate(&mut items, &data, &def, None, &EvalOptions::default());

        let grandparent = find_item_by_path(&items, "grandparent").unwrap();
        assert!(
            grandparent.mip.required,
            "grandparent has explicit required bind"
        );

        let parent = find_item_by_path(&items, "grandparent.parent").unwrap();
        assert!(!parent.mip.required, "parent should NOT inherit required");

        let child = find_item_by_path(&items, "grandparent.parent.child").unwrap();
        assert!(
            !child.mip.required,
            "grandchild should NOT inherit required"
        );
    }

    #[test]
    fn calculate_not_inherited() {
        let def = json!({
            "items": [{
                "key": "parent",
                "children": [
                    { "key": "child", "dataType": "integer" }
                ]
            }],
            "binds": {
                "parent": { "calculate": "42" }
            }
        });

        let data = HashMap::new();
        let mut items = rebuild_item_tree(&def);
        let (values, _, _) = recalculate(&mut items, &data, &def, None, &EvalOptions::default());

        assert_eq!(values.get("parent"), Some(&json!(42)));
        assert_eq!(values.get("parent.child"), None);
    }
}

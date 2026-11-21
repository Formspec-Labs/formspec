//! Host-resident FEL context for ad-hoc reads: `compileExpression`, Locale `{{}}`, derivation traces.
//!
//! The host loads one snapshot after evaluation and reuses it for reads at any Item.

use std::collections::{HashMap, HashSet};

use fel_core::exact_json::{Map, Value as JsonValue};
use fel_core::{
    EvalResult, EvaluatorOptions, ExtensionFunctions, Trace, Value, evaluate_with, parse,
};
use formspec_core::subject_key::SubjectKey;

use crate::fel_eval::Fel;
use crate::fel_json::{json_to_runtime_fel, json_to_runtime_fel_typed};
use crate::interpolation::{Interpolated, interpolate_fel};
use crate::scope::{ScopeData, ScopeIndex, Site, count_flat_rows};
use crate::types::strip_indices;
use crate::{EvalOptions, EvaluationResult};

/// Form-scope FEL state a host loads once per evaluation and reads many times.
#[derive(Default)]
pub struct HostFelContext {
    data_types: HashMap<String, String>,
    excluded_null: HashSet<String>,
    declarations: HashSet<String>,
    index: ScopeIndex,
    state: ScopeData,
}

impl std::fmt::Debug for HostFelContext {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("HostFelContext")
            .field("index", &self.index)
            .finish_non_exhaustive()
    }
}

impl HostFelContext {
    /// Context for a Definition: leaf typing and `excludedValue: "null"` binds, both by un-indexed path.
    pub fn new(data_types: HashMap<String, String>, excluded_null: HashSet<String>) -> Self {
        Self {
            data_types,
            excluded_null,
            ..Self::default()
        }
    }

    /// [`HostFelContext::new`] from `{ dataTypes: { path: dataType }, excludedValueNull: [path] }`.
    pub fn from_schema_json(schema: &Map<String, JsonValue>) -> Self {
        let data_types = schema
            .get("dataTypes")
            .and_then(JsonValue::as_object)
            .into_iter()
            .flatten()
            .filter_map(|(path, data_type)| Some((path.clone(), data_type.as_str()?.to_string())))
            .collect();
        let excluded_null = string_list(schema.get("excludedValueNull"));
        Self {
            declarations: string_list(schema.get("itemPaths")).into_iter().collect(),
            ..Self::new(data_types, excluded_null.into_iter().collect())
        }
    }

    /// Replaces the form-scope state from one evaluation.
    ///
    /// `snapshot` keys: `values` (instance path → value; repeat group arrays are skipped, rows
    /// come from their flat paths), `mips` (`{ invalid, nonRelevant, readonly, required }`
    /// path lists; unlisted paths are default), `repeatCounts`, `variables` (scope → name →
    /// value), `locale`, `meta`, `subjectKeys`, and `instances`, which is replaced only when present.
    pub fn load(&mut self, snapshot: &Map<String, JsonValue>) -> Result<(), String> {
        for (name, value) in snapshot {
            if name != "subjectKeys" {
                fel_core::exact_json::check_decimal_range(value)?;
            }
        }
        let subject_keys =
            crate::eval_json::subject_keys_from_json_object(snapshot)?.unwrap_or_default();
        if let Some((key, requirement)) = subject_keys
            .iter()
            .filter_map(|(key, value)| {
                let requirement = match value {
                    Value::String(_) => return None,
                    Value::Number(number) if number.is_integer() => {
                        if SubjectKey::is_integer_in_range(number) {
                            return None;
                        }
                        "an integer in the I-JSON range"
                    }
                    _ => "a string or integer",
                };
                Some((key, requirement))
            })
            .min()
        {
            return Err(format!("subjectKeys.{key} must be {requirement}"));
        }
        let supplied = snapshot
            .get("values")
            .map(|values| values.as_object().ok_or("values must be a JSON object"))
            .transpose()?;
        let mut counts = snapshot
            .get("repeatCounts")
            .and_then(JsonValue::as_object)
            .into_iter()
            .flatten()
            .filter_map(|(path, count)| Some((path.clone(), count.as_u64()?)))
            .collect();
        count_flat_rows(
            supplied.into_iter().flat_map(|values| values.keys()),
            &mut counts,
        );
        let mips = snapshot
            .get("mips")
            .map(|mips| mips.as_object().ok_or("mips must be a JSON object"))
            .transpose()?;

        let mut state = ScopeData::default();
        for (name, field) in [
            ("invalid", 0),
            ("nonRelevant", 1),
            ("readonly", 2),
            ("required", 3),
        ] {
            for path in string_list(mips.and_then(|mips| mips.get(name))) {
                let mip = state.env.mip_states.entry(path).or_default();
                match field {
                    0 => mip.valid = false,
                    1 => mip.relevant = false,
                    2 => mip.readonly = true,
                    _ => mip.required = true,
                }
            }
        }
        state.env.data = supplied
            .into_iter()
            .flatten()
            .filter(|(path, _)| !counts.contains_key(*path))
            .map(|(path, value)| {
                let template = strip_indices(path);
                let non_relevant = state
                    .env
                    .mip_states
                    .get(path)
                    .is_some_and(|mip| !mip.relevant);
                let value = if non_relevant && self.excluded_null.contains(&template) {
                    Value::Null
                } else {
                    json_to_runtime_fel_typed(
                        value,
                        self.data_types.get(&template).map(String::as_str),
                    )
                };
                (path.clone(), value)
            })
            .collect();
        state.variables = snapshot
            .get("variables")
            .and_then(JsonValue::as_object)
            .into_iter()
            .flatten()
            .map(|(scope, names)| {
                let names = names
                    .as_object()
                    .into_iter()
                    .flatten()
                    .map(|(key, value)| (key.clone(), crate::fel_json::variable_from_wire(value)))
                    .collect();
                (scope.clone(), names)
            })
            .collect();
        state.env.instances = snapshot.get("instances").map_or_else(
            || std::mem::take(&mut self.state.env.instances),
            |instances| fel_map(instances.as_object()),
        );
        state.env.locale = snapshot
            .get("locale")
            .and_then(JsonValue::as_str)
            .map(str::to_owned);
        state.env.date_formats = snapshot
            .get("dateFormats")
            .and_then(JsonValue::as_object)
            .into_iter()
            .flatten()
            .filter_map(|(style, pattern)| Some((style.clone(), pattern.as_str()?.to_owned())))
            .collect();
        state.env.meta = fel_map(snapshot.get("meta").and_then(JsonValue::as_object));
        state.env.subject_keys = subject_keys;
        self.index = ScopeIndex::snapshot(
            counts,
            &self.data_types,
            self.declarations.iter().cloned(),
            state.env.data.keys().cloned(),
        );
        self.state = state;
        Ok(())
    }

    /// Build an ad-hoc context from a native Definition evaluation.
    pub fn from_evaluation(
        definition: &JsonValue,
        result: &EvaluationResult,
        options: &EvalOptions<'_>,
    ) -> Self {
        let items = crate::rebuild_item_tree(definition);
        let data_types = crate::types::collect_data_types(&items);
        fn declarations(items: &[crate::ItemInfo], paths: &mut HashSet<String>) {
            for item in items {
                paths.insert(item.path.clone());
                declarations(&item.children, paths);
            }
        }
        let mut item_paths = HashSet::new();
        declarations(&items, &mut item_paths);
        let index = ScopeIndex::snapshot(
            result.row_counts.clone(),
            &data_types,
            item_paths.iter().cloned(),
            result.host_values.keys().cloned(),
        );
        let mut options = options.clone();
        crate::runtime_context::hydrate_inline_instances(definition, &mut options.instances);
        let mut state = ScopeData::for_values(&index, &result.host_values, &options);
        state.variables.clone_from(&result.scoped_variables);
        for path in crate::types::error_paths(&result.validations) {
            state.env.mip_states.entry(path).or_default().valid = false;
        }
        for path in &result.non_relevant {
            state
                .env
                .mip_states
                .entry(path.clone())
                .or_default()
                .relevant = false;
        }
        for (path, &required) in &result.required {
            state
                .env
                .mip_states
                .entry(path.clone())
                .or_default()
                .required = required;
        }
        for (path, &readonly) in &result.readonly {
            state
                .env
                .mip_states
                .entry(path.clone())
                .or_default()
                .readonly = readonly;
        }
        fn collect_excluded(items: &[crate::ItemInfo], paths: &mut HashSet<String>) {
            for item in items {
                if item.excluded_value == Some(crate::types::ExcludedValueMode::Null) {
                    paths.insert(item.path.clone());
                }
                collect_excluded(&item.children, paths);
            }
        }
        let mut excluded_null = HashSet::new();
        collect_excluded(&items, &mut excluded_null);
        for path in &result.non_relevant {
            if excluded_null.contains(&strip_indices(path)) {
                state.set_field(path, Value::Null);
            }
        }
        Self {
            data_types,
            excluded_null,
            declarations: item_paths,
            index,
            state,
        }
    }

    fn site<'a>(&'a self, path: &'a str, bind_self: bool, now_iso: Option<&str>) -> Site<'a> {
        let mut site = self.state.site(&self.index, path);
        site.bind_self = bind_self;
        if let Some(now_iso) = now_iso {
            site.set_now(now_iso);
        }
        site
    }

    /// Evaluates `expression` in the binding scope of `current_item_path`.
    ///
    /// `now_iso` backs `now()` / `today()` for this call. Errors are parse errors; evaluation
    /// problems are diagnostics on the result.
    pub fn evaluate(
        &self,
        expression: &str,
        current_item_path: &str,
        replace_self_ref: bool,
        now_iso: Option<&str>,
        extensions: Option<&dyn ExtensionFunctions>,
    ) -> Result<EvalResult, String> {
        let expr = parse(expression).map_err(|e| e.to_string())?;
        let env = self.site(current_item_path, replace_self_ref, now_iso);
        Ok(Fel::new(extensions).evaluate(&expr, &env))
    }

    /// [`HostFelContext::evaluate`] recording every evaluation step.
    pub fn evaluate_traced(
        &self,
        expression: &str,
        current_item_path: &str,
        replace_self_ref: bool,
        now_iso: Option<&str>,
        extensions: Option<&dyn ExtensionFunctions>,
    ) -> Result<(EvalResult, Trace), String> {
        let expr = parse(expression).map_err(|e| e.to_string())?;
        let env = self.site(current_item_path, replace_self_ref, now_iso);
        let mut trace = Trace::new();
        let result = evaluate_with(
            &expr,
            &env,
            EvaluatorOptions {
                trace: Some(&mut trace),
                extensions,
                ..EvaluatorOptions::default()
            },
        );
        Ok((result, trace))
    }

    /// Resolves every `{{expression}}` in `template` in the scope of `current_item_path` (Locale §3.3.1).
    ///
    /// `replace_self_ref` binds bare `$` to the item, as in its Bind: a validation message says `{{$}}` for
    /// the value that failed (Core Bind `constraintMessage`), as [`HostFelContext::evaluate`] does.
    pub fn interpolate(
        &self,
        template: &str,
        current_item_path: &str,
        replace_self_ref: bool,
        now_iso: Option<&str>,
        extensions: Option<&dyn ExtensionFunctions>,
    ) -> Interpolated {
        let env = self.site(current_item_path, replace_self_ref, now_iso);
        interpolate_fel(template, &env, Fel::new(extensions))
    }
}

/// `Value`s from a JSON object, money-normalized like every other runtime input.
fn fel_map(object: Option<&Map<String, JsonValue>>) -> HashMap<String, Value> {
    object
        .into_iter()
        .flatten()
        .map(|(key, value)| (key.clone(), json_to_runtime_fel(value)))
        .collect()
}

/// The string entries of a JSON array, ignoring anything else.
fn string_list(value: Option<&JsonValue>) -> Vec<String> {
    value
        .and_then(JsonValue::as_array)
        .into_iter()
        .flatten()
        .filter_map(|entry| entry.as_str().map(str::to_string))
        .collect()
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;
    use fel_core::exact_json::from_fel as fel_to_ui_json;
    use fel_core::exact_json::native_json as json;

    fn context() -> HostFelContext {
        let schema = json!({
            "dataTypes": {
                "name": "string",
                "rows.name": "string",
                "rows.qty": "integer",
                "rows.due": "date",
                "rows.address.city": "string",
                "rows.tasks.mins": "integer",
                "secret": "string",
                "section.title": "string",
                "section.jobs.employer": "string"
            },
            "excludedValueNull": ["secret"]
        });
        let mut ctx = HostFelContext::from_schema_json(schema.as_object().unwrap());
        let snapshot = json!({
            "values": {
                "name": "Form",
                "secret": "hidden",
                "rows[0].name": "Alpha",
                "rows[0].qty": 2,
                "rows[0].due": "2025-03-01",
                "rows[0].address.city": "Oslo",
                "rows[0].tasks[0].mins": 5,
                "rows[0].tasks[1].mins": 7,
                "rows[1].name": "Beta",
                "rows[1].qty": 3,
                "rows[1].address.city": "Rome",
                "section.title": "Work",
                "section.jobs[0].employer": "Acme",
                "rows": [{ "name": "stale" }]
            },
            "mips": {
                "invalid": ["rows[1].qty"],
                "nonRelevant": ["secret", "rows[0].name"],
                "readonly": ["name"],
                "required": ["rows[0].qty"]
            },
            "repeatCounts": { "rows": 2, "rows[0].tasks": 2, "section.jobs": 1 },
            "variables": { "#": { "limit": 10 }, "rows[0]": { "limit": 99 } },
            "instances": { "config": { "max": 3 } },
            "locale": "fr-CA",
            "meta": { "channel": "kiosk" }
        });
        ctx.load(snapshot.as_object().unwrap()).unwrap();
        ctx
    }

    fn eval(ctx: &HostFelContext, expression: &str, path: &str) -> JsonValue {
        let result = ctx
            .evaluate(expression, path, false, Some("2026-01-02T03:04:05Z"), None)
            .unwrap();
        assert!(
            !fel_core::has_error_diagnostics(&result.diagnostics),
            "{expression} @ {path:?}: {:?}",
            result.diagnostics
        );
        fel_to_ui_json(&result.value)
    }

    #[test]
    fn resident_context_reads_exact_subject_keys() {
        let mut ctx = context();
        // ADR 0172 caps integer subject keys at the I-JSON limit.
        let snapshot = json!({
            "subjectKeys": {"uei": "00123", "serial": 9_007_199_254_740_991_i64},
            "meta": {"uei": "metadata"}
        });
        ctx.load(snapshot.as_object().unwrap()).unwrap();
        assert_eq!(eval(&ctx, "subject('uei')", ""), json!("00123"));
        assert_eq!(
            eval(&ctx, "subject('serial')", ""),
            json!(9_007_199_254_740_991_i64)
        );
        assert_eq!(eval(&ctx, "subject('missing')", ""), json!(null));
        ctx.load(json!({}).as_object().unwrap()).unwrap();
        assert_eq!(eval(&ctx, "subject('uei')", ""), json!(null));
    }

    #[test]
    fn resident_context_refuses_out_of_range_subject_keys() {
        let mut ctx = context();
        for serial in [9_007_199_254_740_993_i64, -9_007_199_254_740_992_i64] {
            let snapshot = json!({"subjectKeys": {"serial": serial}});
            assert_eq!(
                ctx.load(snapshot.as_object().unwrap()),
                Err("subjectKeys.serial must be an integer in the I-JSON range".into())
            );
        }
    }

    #[test]
    fn row_scope_shadows_form_scope_and_types_leaves() {
        let ctx = context();
        assert_eq!(eval(&ctx, "$name", ""), json!("Form"));
        assert_eq!(eval(&ctx, "$name", "rows[1]"), json!("Beta"));
        assert_eq!(eval(&ctx, "$name", "rows[1].qty"), json!("Beta"));
        assert_eq!(eval(&ctx, "$qty * 2", "rows[1].name"), json!(6));
        assert_eq!(eval(&ctx, "year($due)", "rows[0]"), json!(2025));
        assert_eq!(eval(&ctx, "$address.city", "rows[0]"), json!("Oslo"));
        assert_eq!(eval(&ctx, "$city", "rows[1].address"), json!("Rome"));
    }

    #[test]
    fn group_arrays_come_from_flat_rows_with_fel_indexes() {
        let ctx = context();
        assert_eq!(eval(&ctx, "$rows[2].name", ""), json!("Beta"));
        assert_eq!(eval(&ctx, "count($rows)", ""), json!(2));
        assert_eq!(eval(&ctx, "sum($rows[*].qty)", ""), json!(5));
        assert_eq!(eval(&ctx, "$tasks[2].mins", "rows[0]"), json!(7));
        assert_eq!(eval(&ctx, "$qty", "rows[1].name"), json!(3));
        assert_eq!(eval(&ctx, "$qty", "rows[0].tasks[1].mins"), json!(2));
        assert_eq!(eval(&ctx, "$section.title", ""), json!("Work"));
    }

    #[test]
    fn repeat_context_navigation() {
        let ctx = context();
        assert_eq!(eval(&ctx, "@index", "rows[1].name"), json!(2));
        assert_eq!(eval(&ctx, "@count", "rows[1].name"), json!(2));
        assert_eq!(eval(&ctx, "@current.name", "rows[1].name"), json!("Beta"));
        assert_eq!(eval(&ctx, "prev().name", "rows[1].name"), json!("Alpha"));
        assert_eq!(eval(&ctx, "next().name", "rows[0].name"), json!("Beta"));
        assert_eq!(eval(&ctx, "next()", "rows[1].name"), json!(null));
        assert_eq!(eval(&ctx, "@index", "rows[0].tasks[1].mins"), json!(2));
        assert_eq!(
            eval(&ctx, "parent().name", "rows[0].tasks[1].mins"),
            json!("Alpha")
        );
        assert_eq!(
            eval(&ctx, "parent().title", "section.jobs[0].employer"),
            json!("Work")
        );
        assert_eq!(eval(&ctx, "@index", "name"), json!(null));
    }

    #[test]
    fn mip_queries_use_fel_indexes_and_scope() {
        let ctx = context();
        assert_eq!(eval(&ctx, "valid($rows[2].qty)", ""), json!(false));
        assert_eq!(eval(&ctx, "valid($rows[1].qty)", ""), json!(true));
        assert_eq!(eval(&ctx, "valid($qty)", "rows[1].name"), json!(false));
        assert_eq!(eval(&ctx, "required($qty)", "rows[0].name"), json!(true));
        assert_eq!(eval(&ctx, "readonly($name)", ""), json!(true));
        assert_eq!(eval(&ctx, "relevant($name)", "rows[0].qty"), json!(false));
        assert_eq!(eval(&ctx, "relevant($name)", ""), json!(true));
    }

    #[test]
    fn mip_queries_require_a_single_valid_repeat_row() {
        let ctx = context();
        assert_eq!(
            eval(&ctx, "valid($rows[2].qty)", "rows[0].qty"),
            json!(false)
        );
        let results = [
            "valid($rows[*].qty)",
            "valid($rows[0].qty)",
            "valid($rows[3].qty)",
        ]
        .map(|expression| eval(&ctx, expression, "rows[0].qty"));
        assert_eq!(results, [json!(null), json!(null), json!(null)]);
    }

    #[test]
    fn excluded_value_null_applies_to_non_relevant_full_path_reads() {
        let ctx = context();
        assert_eq!(eval(&ctx, "$secret", ""), json!(null));
        assert_eq!(eval(&ctx, "$name", "rows[0]"), json!("Alpha"));
    }

    #[test]
    fn variables_instances_locale_meta_and_clock() {
        let ctx = context();
        assert_eq!(eval(&ctx, "@limit", ""), json!(10));
        assert_eq!(eval(&ctx, "@limit", "rows[0].qty"), json!(99));
        assert_eq!(eval(&ctx, "@instance('config').max", ""), json!(3));
        assert_eq!(eval(&ctx, "locale()", ""), json!("fr-CA"));
        assert_eq!(eval(&ctx, "runtimeMeta('channel')", ""), json!("kiosk"));
        assert_eq!(eval(&ctx, "year(today())", ""), json!(2026));
        let unset = ctx.evaluate("today()", "", false, None, None).unwrap();
        assert!(fel_core::has_error_diagnostics(&unset.diagnostics));
    }

    #[test]
    fn self_reference_and_unsubscripted_repeat_refusal() {
        let ctx = context();
        let result = ctx
            .evaluate("$ * 10", "rows[1].qty", true, None, None)
            .unwrap();
        assert_eq!(fel_to_ui_json(&result.value), json!(30));
        // Core §3.2.2 requires a subscript on repeat paths that continue to a field.
        let result = ctx
            .evaluate("$rows.name", "rows[0].qty", false, None, None)
            .unwrap();
        assert!(fel_core::has_error_diagnostics(&result.diagnostics));
        assert!(result.value.is_null());
    }

    #[test]
    fn interpolation_resolves_in_item_scope() {
        let ctx = context();
        let out = ctx.interpolate(
            "Row {{@index}} of {{@count}}: {{$name}}",
            "rows[1].name",
            false,
            None,
            None,
        );
        assert_eq!(out.text, "Row 2 of 2: Beta");
        assert!(out.warnings.is_empty());
        let message = ctx.interpolate(
            "Qty {{$}} in row {{@index}}",
            "rows[1].qty",
            true,
            None,
            None,
        );
        assert_eq!(message.text, "Qty 3 in row 2");
        let failed = ctx.interpolate("{{nope(}} {{$name}}", "", false, None, None);
        assert_eq!(failed.text, "{{nope(}} Form");
        assert_eq!(failed.warnings.len(), 1);
    }

    #[test]
    fn trace_records_field_resolution() {
        let ctx = context();
        let (result, trace) = ctx
            .evaluate_traced("$qty + 1", "rows[0].name", false, None, None)
            .unwrap();
        assert_eq!(fel_to_ui_json(&result.value), json!(3));
        assert!(!trace.steps.is_empty());
    }

    #[test]
    fn reload_replaces_values_and_keeps_instances_unless_given() {
        let mut ctx = context();
        ctx.load(
            json!({ "values": { "name": "Next" }, "repeatCounts": {} })
                .as_object()
                .unwrap(),
        )
        .unwrap();
        assert_eq!(eval(&ctx, "$name", ""), json!("Next"));
        assert_eq!(eval(&ctx, "$rows", ""), json!(null));
        assert_eq!(eval(&ctx, "@instance('config').max", ""), json!(3));
        assert_eq!(eval(&ctx, "locale()", ""), json!(null));
        assert!(
            ctx.load(json!({ "values": 1 }).as_object().unwrap())
                .is_err()
        );
    }
}

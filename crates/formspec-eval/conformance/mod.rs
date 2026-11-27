//! Shared-suite parity guard, native adapter: runs conformance cases through
//! `formspec_eval::evaluate` / `evaluate_filed` / `create_response` without Node.
//!
//! Used by both `tests/integration/shared_suite.rs` (standalone Rust guard) and
//! `examples/conformance-case.rs` (native binary invoked by `formspec-conformance --native`).

#![allow(dead_code)]

use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::str::FromStr;

use fel_core::exact_json::{Map, Value};
use formspec_core::instance_resolution::DeliveredSelection;
use formspec_core::json_object_to_string_map;
use formspec_core::subject_key::subject_id_json;
use formspec_eval::{
    CreateOptions, EvalContext, EvalOptions, EvalTrigger, EvaluationResult, HostFelContext,
    ItemTextRequest, ResolvedOptionLists, assemble_candidate, create_response,
    eval_context_from_json_object, evaluate, evaluate_filed, evaluation_result_to_json_value,
    extension_constraints_from_registry_documents, filed_response_data_matches,
    recheck_eval_options,
};
use integrity_canonical::canonical_json_from_bytes;
use rust_decimal::Decimal;

/// Default evaluation clock when a case omits `now`.
pub(super) const DEFAULT_NOW: &str = "2026-11-17T12:00:00Z";

/// Failing legs of one case: leg name to the problems found (empty means the leg passes).
pub(super) type Legs = BTreeMap<String, Vec<String>>;

pub(super) fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

pub(super) fn read_json(root: &Path, relative: &str) -> Value {
    let path = root.join(relative);
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{}: {e}", path.display()))
}

pub(super) fn parse(text: &str) -> Value {
    serde_json::from_str(text).expect("valid JSON literal")
}

/// Merge a suite's `defaults` object into a raw case entry.
fn merge_case_defaults(defaults: Option<&Map<String, Value>>, raw_case: &Value) -> Value {
    let Some(defaults) = defaults else {
        return raw_case.clone();
    };
    let Some(case_obj) = raw_case.as_object() else {
        return raw_case.clone();
    };
    let mut merged = defaults.clone();
    for (k, v) in case_obj {
        if (k == "instances" || k == "resolvedInstances")
            && let (Some(def_inst), Some(case_inst)) =
                (merged.get(k).and_then(Value::as_object), v.as_object())
        {
            let mut combined = def_inst.clone();
            for (ik, iv) in case_inst {
                combined.insert(ik.clone(), iv.clone());
            }
            merged.insert(k.clone(), Value::Object(combined));
        } else if k == "resolvedOptions"
            && let (Some(def_opts), Some(case_opts)) = (
                merged.get("resolvedOptions").and_then(Value::as_object),
                v.as_object(),
            )
        {
            let mut combined = def_opts.clone();
            for (sub, sub_val) in case_opts {
                if (sub == "optionSets" || sub == "uris")
                    && let (Some(def_sub), Some(case_sub)) = (
                        combined.get(sub).and_then(Value::as_object),
                        sub_val.as_object(),
                    )
                {
                    let mut sub_map = def_sub.clone();
                    for (sk, sv) in case_sub {
                        sub_map.insert(sk.clone(), sv.clone());
                    }
                    combined.insert(sub.clone(), Value::Object(sub_map));
                } else {
                    combined.insert(sub.clone(), sub_val.clone());
                }
            }
            merged.insert(k.clone(), Value::Object(combined));
        } else {
            merged.insert(k.clone(), v.clone());
        }
    }
    if case_obj.contains_key("inputData") && !case_obj.contains_key("payloadPath") {
        merged.shift_remove("payloadPath");
    }
    if case_obj.contains_key("payloadPath") && !case_obj.contains_key("inputData") {
        merged.shift_remove("inputData");
    }
    Value::Object(merged)
}

/// Expand either a single case document or a `{ defaults?, cases: [...] }` suite document.
pub(super) fn expand_suite_document(label: &str, doc: Value) -> Vec<(String, Value)> {
    if let Some(cases) = doc.get("cases").and_then(Value::as_array) {
        let defaults = doc.get("defaults").and_then(Value::as_object);
        return cases
            .iter()
            .enumerate()
            .map(|(i, raw)| {
                let expanded = merge_case_defaults(defaults, raw);
                let id = expanded
                    .get("id")
                    .and_then(Value::as_str)
                    .map_or_else(|| i.to_string(), str::to_owned);
                (format!("{label}#{id}"), expanded)
            })
            .collect();
    }
    vec![(label.to_owned(), doc)]
}

/// Load a directory of case/suite files or a single case/suite file, standalone without Node.
pub(super) fn load_suite(suite_path: &Path) -> Vec<(String, Value)> {
    if suite_path.is_dir() {
        let mut files: Vec<String> = std::fs::read_dir(suite_path)
            .expect("suite directory")
            .filter_map(|entry| entry.ok()?.file_name().into_string().ok())
            .filter(|name| name.ends_with(".json") && name != "real-examples.manifest.json")
            .collect();
        files.sort();
        let mut out = Vec::new();
        for file in files {
            let text = std::fs::read_to_string(suite_path.join(&file))
                .unwrap_or_else(|e| panic!("{file}: {e}"));
            let doc: Value = serde_json::from_str(&text).unwrap_or_else(|e| panic!("{file}: {e}"));
            out.extend(expand_suite_document(&file, doc));
        }
        return out;
    }
    let name = suite_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("suite.json");
    let text = std::fs::read_to_string(suite_path)
        .unwrap_or_else(|e| panic!("{}: {e}", suite_path.display()));
    let doc: Value =
        serde_json::from_str(&text).unwrap_or_else(|e| panic!("{}: {e}", suite_path.display()));
    expand_suite_document(name, doc)
}

fn text(value: &Value) -> String {
    value.to_string()
}

/// Structural equality with numbers compared as exact decimals (`3` equals `3.0`).
pub(super) fn same(a: &Value, b: &Value) -> bool {
    if let (Some(x), Some(y)) = (a.as_decimal(), b.as_decimal())
        && a.is_number()
        && b.is_number()
    {
        return x == y;
    }
    match (a, b) {
        (Value::Array(x), Value::Array(y)) => {
            x.len() == y.len() && x.iter().zip(y).all(|(p, q)| same(p, q))
        }
        (Value::Object(x), Value::Object(y)) => {
            x.len() == y.len() && x.iter().all(|(k, v)| y.get(k).is_some_and(|w| same(v, w)))
        }
        _ => a == b,
    }
}

fn parse_decimal_value(value: &Value, allow_string: bool) -> Option<Decimal> {
    if value.is_number() {
        return value.as_decimal();
    }
    if allow_string && let Some(s) = value.as_str() {
        let trimmed = s.trim();
        return Decimal::from_str(trimmed)
            .or_else(|_| Decimal::from_scientific(trimmed))
            .ok();
    }
    None
}

fn compare_value(
    actual: &Value,
    expected: &Value,
    comparator: &str,
    epsilon: Option<&Value>,
) -> bool {
    match comparator {
        "exact" | "normalized" => same(actual, expected),
        "exact-decimal" => matches!(
            (
                parse_decimal_value(actual, true),
                parse_decimal_value(expected, true)
            ),
            (Some(a), Some(e)) if a == e
        ),
        "tolerance" | "tolerant-decimal" => {
            let eps = match epsilon {
                Some(v) => parse_decimal_value(v, true),
                None => Some(rust_decimal_epsilon()),
            };
            match (
                parse_decimal_value(actual, true),
                parse_decimal_value(expected, true),
                eps,
            ) {
                (Some(a), Some(e), Some(eps)) if eps >= Decimal::ZERO => (a - e).abs() <= eps,
                _ if comparator == "tolerant-decimal" => same(actual, expected),
                _ => false,
            }
        }
        other => panic!("unsupported comparator {other:?}"),
    }
}

// --- Outcomes --------------------------------------------------------------------------------

/// What a leg produced: sorted results without envelope markers, Response data, and MIP states.
pub(super) struct Outcome {
    pub(super) results: Vec<Value>,
    pub(super) diagnostics: Vec<Value>,
    pub(super) refused: bool,
    pub(super) data: Value,
    pub(super) undeclared: Option<Value>,
    pub(super) non_relevant: Vec<String>,
    pub(super) required: HashMap<String, bool>,
    pub(super) readonly: HashMap<String, bool>,
}

impl Outcome {
    pub(super) fn from_evaluation(result: &EvaluationResult) -> Self {
        let json = evaluation_result_to_json_value(result);
        Self {
            refused: result.refused,
            diagnostics: json["diagnostics"].as_array().cloned().unwrap_or_default(),
            results: sorted_results(json["validations"].as_array().map_or(&[], Vec::as_slice)),
            data: json["data"].clone(),
            undeclared: json.get("undeclaredDataPaths").cloned(),
            non_relevant: result.non_relevant.clone(),
            required: result.required.clone(),
            readonly: result.readonly.clone(),
        }
    }

    fn count(&self, severity: &str) -> u64 {
        self.results
            .iter()
            .filter(|r| r["severity"].as_str() == Some(severity))
            .count() as u64
    }

    fn state_of(&self, path: &str) -> Option<(bool, bool, bool)> {
        let known = self.required.contains_key(path)
            || self.readonly.contains_key(path)
            || self.non_relevant.iter().any(|p| p == path);
        if !known {
            return None;
        }
        let relevant = !self.non_relevant.iter().any(|p| p == path);
        let required = self.required.get(path).copied().unwrap_or(false);
        let readonly = self.readonly.get(path).copied().unwrap_or(false);
        Some((relevant, required, readonly))
    }
}

fn result_key(r: &Value) -> String {
    ["path", "code", "constraintKind", "severity", "shapeId"]
        .iter()
        .map(|k| r.get(k).and_then(Value::as_str).unwrap_or_default())
        .collect::<Vec<_>>()
        .join("|")
}

/// A ValidationResult without envelope markers or null optional fields, keys sorted at every depth.
fn clean_result(r: &Value) -> Value {
    let map = r
        .as_object()
        .expect("a result object")
        .iter()
        .filter(|(k, v)| !k.starts_with("$formspec") && !v.is_null())
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    canonical(&Value::Object(map))
}

/// `value` with object keys in sorted order at every depth.
fn canonical(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut entries: Vec<(&String, &Value)> = map.iter().collect();
            entries.sort_by(|a, b| a.0.cmp(b.0));
            Value::Object(
                entries
                    .into_iter()
                    .map(|(k, v)| (k.clone(), canonical(v)))
                    .collect(),
            )
        }
        Value::Array(items) => Value::Array(items.iter().map(canonical).collect()),
        other => other.clone(),
    }
}

fn sorted_results(results: &[Value]) -> Vec<Value> {
    let mut out: Vec<Value> = results.iter().map(clean_result).collect();
    out.sort_by_key(result_key);
    out
}

/// Which caller's options a leg evaluates with.
#[derive(Clone, Copy)]
pub(super) enum Caller {
    /// The session (legs P): the case's registries and subject, as the browser loads them.
    Session,
    /// A server recheck (legs S and the fixpoint). Registry documents and subject are omitted
    /// until fs-20e3 and fs-hrx7 reach the deployed adapters.
    Server,
}

/// Evaluates `data` with one caller's options and records any invention.
pub(super) struct Evaluator<'a> {
    pub(super) definition: &'a Value,
    pub(super) registries: Vec<Value>,
    pub(super) context: EvalContext,
    pub(super) raw_subject: Option<Value>,
    pub(super) instances: HashMap<String, Value>,
    pub(super) server_instances: HashMap<String, Value>,
    pub(super) resolved_instances: BTreeMap<String, DeliveredSelection>,
    pub(super) resolved_options: ResolvedOptionLists,
    pub(super) supply_server_registries: bool,
    pub(super) supply_server_resolved_options: bool,
    pub(super) inventions: Vec<String>,
}

fn format_authored_iso(now: &str) -> String {
    chrono::DateTime::parse_from_rfc3339(now)
        .map(|dt| {
            dt.with_timezone(&chrono::Utc)
                .to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
        })
        .unwrap_or_else(|_| now.to_owned())
}

fn candidate_problems(label: &str, actual: &Value, expected: &Value) -> Vec<String> {
    let actual_bytes = canonical_json_from_bytes(actual.to_string().as_bytes())
        .expect("canonical actual candidate");
    let expected_bytes = canonical_json_from_bytes(expected.to_string().as_bytes())
        .expect("canonical expected candidate");
    if actual_bytes == expected_bytes {
        return Vec::new();
    }
    let mut keys: Vec<String> = Vec::new();
    if let (Some(a), Some(e)) = (actual.as_object(), expected.as_object()) {
        for k in a.keys().chain(e.keys()) {
            if !keys.contains(k) {
                keys.push(k.clone());
            }
        }
        keys.sort();
        keys.retain(|k| match (a.get(k), e.get(k)) {
            (Some(av), Some(ev)) => {
                canonical_json_from_bytes(av.to_string().as_bytes()).ok()
                    != canonical_json_from_bytes(ev.to_string().as_bytes()).ok()
            }
            _ => true,
        });
    }
    if keys.is_empty() {
        vec![label.to_string()]
    } else {
        vec![format!("{label} (fields: {})", keys.join(", "))]
    }
}

fn is_stamped_explanation(entry: &Value) -> bool {
    entry.get("author").is_some_and(|v| !v.is_null())
        && entry.get("recorded").is_some_and(|v| !v.is_null())
}

impl Evaluator<'_> {
    fn options(&self, trigger: EvalTrigger, caller: Caller) -> EvalOptions<'static> {
        if matches!(caller, Caller::Session) {
            EvalOptions::default()
                .trigger(trigger)
                .instances(self.instances.clone())
                .context(self.context.clone())
                .extension_constraints(extension_constraints_from_registry_documents(
                    &self.registries,
                ))
                .resolved_option_lists(self.resolved_options.clone())
        } else {
            let regs = if self.supply_server_registries {
                self.registries.as_slice()
            } else {
                &[]
            };
            let resolved_options = if self.supply_server_resolved_options {
                self.resolved_options.clone()
            } else {
                ResolvedOptionLists::default()
            };
            recheck_eval_options(
                trigger,
                self.context.now_iso.clone(),
                self.server_instances.clone(),
                regs,
                resolved_options,
            )
            .expect("valid suite registry documents")
        }
    }

    fn has_session_only_inputs(&self, expected_candidate: Option<&Value>) -> bool {
        self.context.subject.is_some()
            || !self.context.explanations.is_empty()
            || !self.resolved_instances.is_empty()
            || !self.resolved_options.is_empty()
            || expected_candidate.is_some()
    }

    fn assemble_response_candidate(
        &self,
        result: &EvaluationResult,
        caller: Caller,
    ) -> Result<Value, String> {
        let eval_json = evaluation_result_to_json_value(result);
        let has_errors = result
            .validations
            .iter()
            .any(|v| v.severity.as_wire_str() == "error");
        let status = if has_errors {
            "in-progress"
        } else {
            "completed"
        };
        let definition_url = self.definition["url"]
            .as_str()
            .unwrap_or("http://example.org/form");
        let definition_version = self.definition["version"].as_str().unwrap_or("1.0.0");
        let authored = format_authored_iso(self.context.now_iso.as_deref().unwrap_or(DEFAULT_NOW));
        let validation_results: Vec<Value> = eval_json["validations"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|entry| {
                let mut obj = entry.as_object().expect("validation result object").clone();
                obj.insert(
                    "$formspecValidationResult".into(),
                    Value::String("1.0".into()),
                );
                Value::Object(obj)
            })
            .collect();

        let mut response_map = Map::new();
        response_map.insert("$formspecResponse".into(), Value::String("1.0".into()));
        response_map.insert("definitionUrl".into(), Value::String(definition_url.into()));
        response_map.insert(
            "definitionVersion".into(),
            Value::String(definition_version.into()),
        );
        response_map.insert("status".into(), Value::String(status.into()));
        response_map.insert("data".into(), result.data.clone());
        response_map.insert("authored".into(), Value::String(authored));
        response_map.insert("validationResults".into(), Value::Array(validation_results));

        if matches!(caller, Caller::Session)
            && let Some(raw_subject) = &self.raw_subject
        {
            let mut subject_val = raw_subject.clone();
            if self.definition.get("subject").is_some()
                && !result.refused
                && let Some(subj_obj) = subject_val.as_object_mut()
                && let (Some(stype), Some(keys)) = (
                    subj_obj
                        .get("type")
                        .and_then(Value::as_str)
                        .map(str::to_owned),
                    subj_obj.get("keys"),
                )
            {
                let derived = subject_id_json(&stype, &keys.to_string())?;
                subj_obj.insert("id".into(), Value::String(derived));
            }
            response_map.insert("subject".into(), subject_val);
        }

        let mut response = Value::Object(response_map);
        let has_response_instances = self.definition["instances"]
            .as_object()
            .is_some_and(|map| map.values().any(|inst| inst["response"].is_object()));
        let draft_explanations: &[Value] = if matches!(caller, Caller::Session) {
            &self.context.explanations
        } else {
            &[]
        };
        let resolutions: BTreeMap<String, DeliveredSelection> = if matches!(caller, Caller::Session)
        {
            self.resolved_instances.clone()
        } else {
            BTreeMap::new()
        };

        if status == "completed" {
            if has_response_instances || !draft_explanations.is_empty() {
                let eval_for_assembly = if !draft_explanations.is_empty() {
                    let entries = eval_json
                        .get("candidateExplanations")
                        .and_then(Value::as_array)
                        .ok_or("Submit evaluation did not assemble the warning explanations")?;
                    let saved: Vec<Value> = entries
                        .iter()
                        .filter(|e| is_stamped_explanation(e))
                        .cloned()
                        .collect();
                    if saved.len() != entries.len() {
                        return Err(
                            "Save pending warning answers and load their server stamps before emitting this Response"
                                .into(),
                        );
                    }
                    if let Some(obj) = response.as_object_mut() {
                        obj.insert(
                            "explanations".into(),
                            Value::Array(draft_explanations.to_vec()),
                        );
                    }
                    let mut assembled_eval = Map::new();
                    assembled_eval.insert("candidateExplanations".into(), Value::Array(saved));
                    Value::Object(assembled_eval)
                } else {
                    Value::Null
                };
                response =
                    assemble_candidate(self.definition, response, &eval_for_assembly, &resolutions)
                        .map_err(|error| error.to_string())?;
            }
        } else if !draft_explanations.is_empty() {
            let saved: Vec<Value> = draft_explanations
                .iter()
                .filter(|e| is_stamped_explanation(e))
                .cloned()
                .collect();
            if !saved.is_empty()
                && let Some(obj) = response.as_object_mut()
            {
                obj.insert("explanations".into(), Value::Array(saved));
            }
        }
        Ok(response)
    }

    fn check_filed(
        &mut self,
        data: &Value,
        expected: &Value,
        expected_candidate: Option<&Value>,
        caller: Caller,
    ) -> Vec<String> {
        let options = self.options(EvalTrigger::Submit, caller);
        let result = evaluate_filed(self.definition, &json_object_to_string_map(data), &options)
            .expect("suite filing should settle");
        let verdict = Outcome::from_evaluation(&result);
        let fixpoint_label = if matches!(caller, Caller::Server) {
            "S(fixpoint)"
        } else {
            "P(fixpoint)"
        };
        let (again_raw, again) =
            self.run_raw(fixpoint_label, &verdict.data, EvalTrigger::Submit, caller);
        let mut problems = against_expected(&verdict, expected);
        problems.extend(between_legs("fixpoint", &again, &verdict));
        if let Some(want_candidate) = expected_candidate {
            match self.assemble_response_candidate(&result, caller) {
                Ok(got_candidate) => {
                    problems.extend(candidate_problems(
                        "complete filed Response differs from the fixture",
                        &got_candidate,
                        want_candidate,
                    ));
                    match self.assemble_response_candidate(&again_raw, caller) {
                        Ok(fix_candidate) => {
                            problems.extend(candidate_problems(
                                "fixpoint complete filed Response differs from settled candidate",
                                &fix_candidate,
                                &got_candidate,
                            ));
                        }
                        Err(err) => {
                            problems.push(format!("fixpoint candidate assembly failed: {err}"));
                        }
                    }
                }
                Err(err) => {
                    problems.push(format!("candidate assembly failed: {err}"));
                }
            }
        }
        problems
    }

    fn check_submit_legs(
        &mut self,
        legs: &mut Legs,
        data: &Value,
        expected: &Value,
        expected_candidate: Option<&Value>,
    ) {
        if self.has_session_only_inputs(expected_candidate) {
            legs.insert(
                "P".to_string(),
                self.check_filed(data, expected, expected_candidate, Caller::Session),
            );
        }
        legs.insert(
            "S".to_string(),
            self.check_filed(data, expected, expected_candidate, Caller::Server),
        );
    }

    fn run_raw(
        &mut self,
        label: &str,
        data: &Value,
        trigger: EvalTrigger,
        caller: Caller,
    ) -> (EvaluationResult, Outcome) {
        let fields = json_object_to_string_map(data);
        let options = self.options(trigger, caller);
        let raw = evaluate(self.definition, &fields, &options);
        let outcome = Outcome::from_evaluation(&raw);
        let problems = inventions(self.definition, data, &outcome);
        if !problems.is_empty() && filed_response_data_matches(self.definition, data, &outcome.data)
        {
            self.inventions.push(format!(
                "{label}: filed_response_data_matches accepted data with inventions"
            ));
        }
        for problem in problems {
            self.inventions.push(format!("{label}: {problem}"));
        }
        (raw, outcome)
    }

    pub(super) fn run(
        &mut self,
        label: &str,
        data: &Value,
        trigger: EvalTrigger,
        caller: Caller,
    ) -> Outcome {
        self.run_raw(label, data, trigger, caller).1
    }
}

fn matches_path_prefix(actual_path: &str, prefix: &str) -> bool {
    if prefix.ends_with('.') || prefix.ends_with('[') {
        actual_path.starts_with(prefix)
    } else {
        actual_path == prefix
            || actual_path.starts_with(&format!("{prefix}."))
            || actual_path.starts_with(&format!("{prefix}["))
    }
}

fn matches_result_filter(result: &Value, filter: &Map<String, Value>) -> bool {
    for (key, wanted) in filter {
        if key == "count" {
            continue;
        }
        if key == "pathPrefix" {
            let Some(prefix) = wanted.as_str() else {
                return false;
            };
            let Some(actual_path) = result.get("path").and_then(Value::as_str) else {
                return false;
            };
            if !matches_path_prefix(actual_path, prefix) {
                return false;
            }
        } else {
            let Some(got) = result.get(key) else {
                return false;
            };
            if !same(got, wanted) {
                return false;
            }
        }
    }
    true
}

fn filter_without_count(matcher: &Map<String, Value>) -> Value {
    let mut out = Map::new();
    for (k, v) in matcher {
        if k != "count" {
            out.insert(k.clone(), v.clone());
        }
    }
    canonical(&Value::Object(out))
}

fn parse_concrete_path(path_expr: &str) -> Vec<Seg> {
    let bytes = path_expr.as_bytes();
    let mut segs = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'.' {
            i += 1;
            continue;
        }
        if bytes[i] == b'[' {
            let close = path_expr[i + 1..]
                .find(']')
                .map(|off| i + 1 + off)
                .unwrap_or_else(|| panic!("malformed dataAt path: {path_expr}"));
            let idx: usize = path_expr[i + 1..close].parse().unwrap_or_else(|_| {
                panic!("expected non-negative integer index in path: {path_expr}")
            });
            segs.push(Seg::Index(idx));
            i = close + 1;
            continue;
        }
        let start = i;
        while i < bytes.len() && bytes[i] != b'.' && bytes[i] != b'[' {
            i += 1;
        }
        segs.push(Seg::Key(path_expr[start..i].to_owned()));
    }
    segs
}

fn resolve_data_path<'a>(data: &'a Value, path_expr: &str) -> Option<&'a Value> {
    let mut node = data;
    for seg in parse_concrete_path(path_expr) {
        node = match seg {
            Seg::Index(idx) => node.as_array()?.get(idx)?,
            Seg::Key(key) => node.as_object()?.get(&key)?,
        };
    }
    Some(node)
}

/// Mismatches between `actual` and `expected`, supporting both full and partial expectations.
pub(super) fn against_expected(actual: &Outcome, expected: &Value) -> Vec<String> {
    let mut problems = Vec::new();
    let errors = actual.count("error");
    if let Some(valid) = expected.get("valid").and_then(Value::as_bool)
        && (errors == 0) != valid
    {
        problems.push(format!("valid {}, expected {valid}", errors == 0));
    }
    if let Some(expected_diags) = expected.get("diagnostics").and_then(Value::as_array) {
        let diagnostic_keys = ["path", "expression", "code", "shapeId"];
        let clean = |diagnostics: &[Value]| {
            let mut result: Vec<_> = diagnostics
                .iter()
                .map(|diagnostic| {
                    let fields = diagnostic_keys.iter().filter_map(|key| {
                        diagnostic
                            .get(key)
                            .map(|value| ((*key).to_owned(), value.clone()))
                    });
                    canonical(&Value::Object(fields.collect())).to_string()
                })
                .collect();
            result.sort();
            result
        };
        let actual_diags = clean(&actual.diagnostics);
        let expected_diags = clean(expected_diags);
        if actual_diags != expected_diags {
            problems.push(format!(
                "diagnostics {actual_diags:?}, expected {expected_diags:?}"
            ));
        }
    }
    if let Some(counts) = expected.get("counts") {
        for severity in ["error", "warning", "info"] {
            let got = actual.count(severity);
            if counts[severity].as_u64() != Some(got) {
                problems.push(format!(
                    "{severity} count {got}, expected {}",
                    counts[severity]
                ));
            }
        }
    }
    if let Some(wanted) = expected.get("results").and_then(Value::as_array) {
        let mut unmatched: Vec<&Value> = actual.results.iter().collect();
        for w in sorted_results(wanted) {
            let fits = |g: &&Value| {
                w.as_object()
                    .expect("an expected result object")
                    .iter()
                    .all(|(k, v)| g.get(k).is_some_and(|x| same(x, v)))
            };
            match unmatched.iter().position(fits) {
                Some(i) => {
                    unmatched.remove(i);
                }
                None => problems.push(format!("expected result missing {}", text(&w))),
            }
        }
        problems.extend(
            unmatched
                .iter()
                .map(|g| format!("unexpected result {}", text(g))),
        );
    }
    if let Some(data) = expected.get("data") {
        problems.extend(
            data_diff(&actual.data, data)
                .into_iter()
                .map(|d| format!("data {d} (actual vs expected)")),
        );
    }
    if let Some(paths) = expected.get("undeclaredDataPaths") {
        let sorted = |v: Option<&Value>| {
            let mut s: Vec<String> = v
                .and_then(Value::as_array)
                .map(|a| a.iter().map(text).collect())
                .unwrap_or_default();
            s.sort();
            s
        };
        if sorted(actual.undeclared.as_ref()) != sorted(Some(paths)) {
            problems.push(format!(
                "undeclaredDataPaths {:?}, expected {}",
                actual.undeclared.as_ref().map(text),
                text(paths)
            ));
        }
    }
    if let Some(present) = expected.get("present").and_then(Value::as_array) {
        for entry in present {
            let matcher = entry.as_object().expect("present matcher object");
            let matched = actual
                .results
                .iter()
                .filter(|r| matches_result_filter(r, matcher))
                .count() as u64;
            let shown = filter_without_count(matcher);
            if let Some(expected_count) = matcher.get("count").and_then(Value::as_u64) {
                if matched != expected_count {
                    problems.push(format!(
                        "present {}: count {matched}, expected {expected_count}",
                        text(&shown)
                    ));
                }
            } else if matched == 0 {
                problems.push(format!("present {}: missing", text(&shown)));
            }
        }
    }
    if let Some(absent) = expected.get("absent").and_then(Value::as_array) {
        for entry in absent {
            let filter = entry.as_object().expect("absent filter object");
            let matched = actual
                .results
                .iter()
                .filter(|r| matches_result_filter(r, filter))
                .count();
            if matched > 0 {
                problems.push(format!(
                    "absent {}: found {matched}",
                    text(&canonical(entry))
                ));
            }
        }
    }
    if let Some(data_at) = expected.get("dataAt").and_then(Value::as_array) {
        for check in data_at {
            let path = check["path"].as_str().expect("dataAt path");
            let resolved = resolve_data_path(&actual.data, path);
            if check.get("absent").and_then(Value::as_bool) == Some(true) {
                if let Some(got) = resolved {
                    problems.push(format!(
                        "dataAt {path}: {}, expected absent",
                        text(&canonical(got))
                    ));
                }
                continue;
            }
            let wanted = &check["value"];
            let Some(got) = resolved else {
                problems.push(format!(
                    "dataAt {path}: absent, expected {}",
                    text(&canonical(wanted))
                ));
                continue;
            };
            let comparator = check
                .get("comparator")
                .and_then(Value::as_str)
                .unwrap_or("exact");
            let epsilon = check.get("epsilon");
            if !compare_value(got, wanted, comparator, epsilon) {
                let suffix = if comparator != "exact" {
                    match epsilon {
                        Some(eps) => format!(" ({comparator} epsilon={})", eps_display(eps)),
                        None => format!(" ({comparator})"),
                    }
                } else {
                    String::new()
                };
                problems.push(format!(
                    "dataAt {path}: {}, expected {}{suffix}",
                    text(&canonical(got)),
                    text(&canonical(wanted))
                ));
            }
        }
    }
    if let Some(states) = expected.get("states").and_then(Value::as_object) {
        for (item_path, wanted) in states {
            let Some((relevant, required, readonly)) = actual.state_of(item_path) else {
                problems.push(format!("state {item_path}: absent"));
                continue;
            };
            for (prop, got) in [
                ("relevant", relevant),
                ("required", required),
                ("readonly", readonly),
            ] {
                if let Some(expected_flag) = wanted.get(prop).and_then(Value::as_bool)
                    && got != expected_flag
                {
                    problems.push(format!(
                        "state {item_path}.{prop} {got}, expected {expected_flag}"
                    ));
                }
            }
        }
    }
    problems
}

fn eps_display(value: &Value) -> String {
    value
        .as_str()
        .map_or_else(|| value.to_string(), str::to_owned)
}

/// Mismatches between two legs: full results and data.
fn between_legs(label: &str, actual: &Outcome, reference: &Outcome) -> Vec<String> {
    let shown = |o: &Outcome| o.results.iter().map(text).collect::<Vec<_>>();
    let (a, b) = (shown(actual), shown(reference));
    let mut problems: Vec<String> = a
        .iter()
        .filter(|r| !b.contains(r))
        .map(|r| format!("{label} results only here {r}"))
        .chain(
            b.iter()
                .filter(|r| !a.contains(r))
                .map(|r| format!("{label} results only there {r}")),
        )
        .collect();
    problems.extend(
        data_diff(&actual.data, &reference.data)
            .into_iter()
            .map(|d| format!("{label} data {d}")),
    );
    problems
}

// --- Leaves and invention --------------------------------------------------------------------

/// One step into a data tree.
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord)]
enum Seg {
    Key(String),
    Index(usize),
}

/// Leaf values by path; empty containers are leaves, the empty root is not.
fn leaves(value: &Value) -> BTreeMap<Vec<Seg>, Value> {
    fn walk(value: &Value, segs: &mut Vec<Seg>, out: &mut BTreeMap<Vec<Seg>, Value>) {
        match value {
            Value::Array(a) if !a.is_empty() => {
                for (i, v) in a.iter().enumerate() {
                    segs.push(Seg::Index(i));
                    walk(v, segs, out);
                    segs.pop();
                }
            }
            Value::Object(m) if !m.is_empty() => {
                for (k, v) in m {
                    segs.push(Seg::Key(k.clone()));
                    walk(v, segs, out);
                    segs.pop();
                }
            }
            _ if segs.is_empty() && is_empty_container(value) => {}
            _ => {
                out.insert(segs.clone(), value.clone());
            }
        }
    }
    let mut out = BTreeMap::new();
    walk(value, &mut Vec::new(), &mut out);
    out
}

fn is_empty_container(value: &Value) -> bool {
    matches!(value, Value::Array(a) if a.is_empty())
        || matches!(value, Value::Object(m) if m.is_empty())
}

/// `rows[0].name`; a key that itself contains `.` or `[` (a flat key, not a path) is quoted.
fn concrete(segs: &[Seg]) -> String {
    let mut out = String::new();
    for seg in segs {
        match seg {
            Seg::Index(i) => out.push_str(&format!("[{i}]")),
            Seg::Key(k) => {
                if !out.is_empty() {
                    out.push('.');
                }
                if k.contains(['.', '[', ']']) {
                    out.push_str(&format!("{k:?}"));
                } else {
                    out.push_str(k);
                }
            }
        }
    }
    if out.is_empty() {
        "(root)".to_string()
    } else {
        out
    }
}

fn template(segs: &[Seg]) -> String {
    segs.iter()
        .filter_map(|s| match s {
            Seg::Key(k) => Some(k.as_str()),
            Seg::Index(_) => None,
        })
        .collect::<Vec<_>>()
        .join(".")
}

fn data_diff(actual: &Value, reference: &Value) -> Vec<String> {
    let (a, b) = (leaves(actual), leaves(reference));
    let mut keys: Vec<&Vec<Seg>> = a.keys().chain(b.keys()).collect();
    keys.sort();
    keys.dedup();
    keys.into_iter()
        .filter_map(|k| match (a.get(k), b.get(k)) {
            (Some(x), Some(y)) if same(x, y) => None,
            (x, y) => Some(format!(
                "{}: {} vs {}",
                concrete(k),
                x.map_or("absent".to_string(), text),
                y.map_or("absent".to_string(), text)
            )),
        })
        .collect()
}

/// Item kinds by template path, and the template paths of calculated fields.
struct ItemIndex {
    fields: Vec<String>,
    repeats: Vec<String>,
    calculated: Vec<String>,
}

fn item_index(definition: &Value) -> ItemIndex {
    fn walk(items: Option<&Value>, prefix: &str, index: &mut ItemIndex) {
        for item in items.and_then(Value::as_array).into_iter().flatten() {
            let key = item["key"].as_str().unwrap_or_default();
            let path = if prefix.is_empty() {
                key.to_string()
            } else {
                format!("{prefix}.{key}")
            };
            let child_scope = match item["type"].as_str() {
                Some("group") => {
                    if item["repeatable"].as_bool() == Some(true) {
                        index.repeats.push(path.clone());
                    }
                    path.as_str()
                }
                Some("field") => {
                    index.fields.push(path);
                    prefix
                }
                _ => continue,
            };
            walk(item.get("children"), child_scope, index);
        }
    }
    let mut index = ItemIndex {
        fields: Vec::new(),
        repeats: Vec::new(),
        calculated: Vec::new(),
    };
    walk(definition.get("items"), "", &mut index);
    let strip = |p: &str| {
        let mut out = String::new();
        let mut depth = 0;
        for ch in p.chars() {
            match ch {
                '[' => depth += 1,
                ']' => depth -= 1,
                _ if depth == 0 => out.push(ch),
                _ => {}
            }
        }
        out
    };
    match definition.get("binds") {
        Some(Value::Array(binds)) => {
            for bind in binds.iter().filter(|b| b.get("calculate").is_some()) {
                index
                    .calculated
                    .push(strip(bind["path"].as_str().unwrap_or_default()));
            }
        }
        Some(Value::Object(binds)) => {
            for (path, _) in binds.iter().filter(|(_, b)| b.get("calculate").is_some()) {
                index.calculated.push(strip(path));
            }
        }
        _ => {}
    }
    index
}

/// Ways `evaluate` changed `input` that the processing cycle does not permit.
pub(super) fn inventions(definition: &Value, input: &Value, output: &Outcome) -> Vec<String> {
    if output.refused {
        return if same(&output.data, &parse("{}")) {
            Vec::new()
        } else {
            vec![format!("refusal data {}, expected {{}}", output.data)]
        };
    }
    let index = item_index(definition);
    let owning_field = |segs: &[Seg]| {
        (1..=segs.len())
            .rev()
            .map(|i| template(&segs[..i]))
            .find(|t| index.fields.contains(t))
    };
    let under_non_relevant = |segs: &[Seg]| {
        (1..=segs.len()).any(|i| output.non_relevant.contains(&concrete(&segs[..i])))
    };
    let before = leaves(input);
    let after = leaves(&output.data);
    let under = |map: &BTreeMap<Vec<Seg>, Value>, segs: &[Seg]| {
        map.keys()
            .any(|k| k.len() > segs.len() && k.starts_with(segs))
    };
    let in_existing_rows = |segs: &[Seg]| {
        segs.iter().enumerate().all(|(i, seg)| {
            !matches!(seg, Seg::Index(_)) || before.keys().any(|k| k.starts_with(&segs[..=i]))
        })
    };
    let calculated_in_existing_rows = |segs: &[Seg]| {
        owning_field(segs).is_some_and(|f| index.calculated.contains(&f)) && in_existing_rows(segs)
    };
    let mut problems = Vec::new();
    for (segs, value) in &after {
        let prior = before.get(segs);
        if prior.is_some_and(|p| same(p, value)) || calculated_in_existing_rows(segs) {
            continue;
        }
        if under_non_relevant(segs) && value.is_null() {
            continue;
        }
        let projected_repeat = prior.is_none()
            && matches!(value, Value::Array(a) if a.is_empty())
            && index.repeats.contains(&template(segs))
            && in_existing_rows(segs);
        let emptied = prior.is_none() && is_empty_container(value) && under(&before, segs);
        if projected_repeat || emptied {
            continue;
        }
        problems.push(match prior {
            Some(p) => format!("changed {}: {} -> {}", concrete(segs), text(p), text(value)),
            None => format!("added {} = {}", concrete(segs), text(value)),
        });
    }
    for (segs, value) in &before {
        if after.contains_key(segs) || calculated_in_existing_rows(segs) || under_non_relevant(segs)
        {
            continue;
        }
        if is_empty_container(value) && under(&after, segs) {
            continue;
        }
        problems.push(format!("removed {} = {}", concrete(segs), text(value)));
    }
    problems
}

// --- Runs ------------------------------------------------------------------------------------

fn case_now(case: &Value) -> &str {
    case.get("now")
        .and_then(Value::as_str)
        .unwrap_or(DEFAULT_NOW)
}

fn case_context(case: &Value) -> EvalContext {
    let mut host = Map::new();
    host.insert("nowIso".into(), Value::String(case_now(case).into()));
    if let Some(subject) = case.get("subject") {
        host.insert("subjectType".into(), subject["type"].clone());
        if let Some(keys) = subject.get("keys") {
            host.insert("subjectKeys".into(), keys.clone());
        }
    }
    if let Some(explanations) = case.get("explanations") {
        host.insert("explanations".into(), explanations.clone());
    }
    eval_context_from_json_object(&host).expect("suite context")
}

fn case_resolved_instances(case: &Value) -> BTreeMap<String, DeliveredSelection> {
    let Some(map) = case.get("resolvedInstances").and_then(Value::as_object) else {
        return BTreeMap::new();
    };
    map.iter()
        .map(|(name, raw)| {
            let delivery: DeliveredSelection = serde_json::from_str(&raw.to_string())
                .unwrap_or_else(|e| panic!("invalid resolvedInstances.{name}: {e}"));
            (name.clone(), delivery)
        })
        .collect()
}

fn case_resolved_options(case: &Value) -> ResolvedOptionLists {
    let Some(raw) = case.get("resolvedOptions") else {
        return ResolvedOptionLists::default();
    };
    ResolvedOptionLists::from_json_value(raw).expect("valid suite resolvedOptions")
}

fn case_instances(case: &Value) -> HashMap<String, Value> {
    let mut map = case
        .get("instances")
        .map(json_object_to_string_map)
        .unwrap_or_default();
    if let Some(ops) = case.get("operations").and_then(Value::as_array) {
        for op in ops {
            if op["op"].as_str() == Some("deliverInstance") {
                let name = op["name"].as_str().expect("deliverInstance name");
                map.insert(name.to_owned(), op["value"].clone());
            }
        }
    }
    map
}

fn case_session_instances(
    case: &Value,
    resolved_instances: &BTreeMap<String, DeliveredSelection>,
) -> HashMap<String, Value> {
    let mut map = case
        .get("instances")
        .map(json_object_to_string_map)
        .unwrap_or_default();
    for (name, delivery) in resolved_instances {
        let value = fel_core::exact_json::from_str(delivery.value.get())
            .unwrap_or_else(|e| panic!("invalid resolvedInstances.{name}.value: {e}"));
        map.insert(name.clone(), value);
    }
    if let Some(ops) = case.get("operations").and_then(Value::as_array) {
        for op in ops {
            if op["op"].as_str() == Some("deliverInstance") {
                let name = op["name"].as_str().expect("deliverInstance name");
                map.insert(name.to_owned(), op["value"].clone());
            }
        }
    }
    map
}

fn load_definition(root: &Path, case: &Value, definition_override: Option<&Value>) -> Value {
    match definition_override {
        Some(def) => def.clone(),
        None => read_json(
            root,
            case["definitionPath"].as_str().expect("definitionPath"),
        ),
    }
}

/// `evaluate(expected.data)` must reproduce `expected.data` (continuous cases; submit has the fixpoint).
fn round_trip(evaluator: &mut Evaluator<'_>, data: &Value) -> Vec<String> {
    let again = evaluator.run(
        "P(round trip)",
        data,
        EvalTrigger::Continuous,
        Caller::Session,
    );
    data_diff(&again.data, data)
        .into_iter()
        .map(|d| format!("round trip of expected.data {d}"))
        .collect()
}

fn input_payload(root: &Path, case: &Value) -> Value {
    let payload = match case.get("payloadPath").and_then(Value::as_str) {
        Some(path) => read_json(root, path),
        None => case.get("inputData").cloned().unwrap_or(Value::Null),
    };
    let is_response = ["definitionUrl", "validationResults", "status"]
        .iter()
        .any(|k| payload.get(k).is_some());
    match payload.get("data") {
        Some(data) if is_response => data.clone(),
        _ if payload.as_object().is_some() => payload,
        _ => parse("{}"),
    }
}

fn run_processing(
    root: &Path,
    case: &Value,
    filed_data: Option<&Value>,
    definition_override: Option<&Value>,
    supply_server_registries: bool,
    supply_server_resolved_options: bool,
    legs: &mut Legs,
) {
    let definition = load_definition(root, case, definition_override);
    let registries = case
        .get("registryPaths")
        .and_then(Value::as_array)
        .map(|paths| {
            paths
                .iter()
                .map(|p| read_json(root, p.as_str().expect("registry path")))
                .collect()
        })
        .unwrap_or_default();
    let resolved_instances = case_resolved_instances(case);
    let session_instances = case_session_instances(case, &resolved_instances);
    let server_instances = case_instances(case);
    let mut evaluator = Evaluator {
        definition: &definition,
        context: case_context(case),
        raw_subject: case.get("subject").cloned(),
        instances: session_instances,
        server_instances,
        resolved_instances,
        resolved_options: case_resolved_options(case),
        supply_server_registries,
        supply_server_resolved_options,
        registries,
        inventions: Vec::new(),
    };
    let expected = if case["kind"] == "RESPONSE_VALIDATION" {
        let mut report = case["expected"]["report"].clone();
        if case.get("compareResponseData").and_then(Value::as_bool) == Some(true)
            && let Value::Object(map) = &mut report
        {
            map.insert(
                "data".to_string(),
                case["expected"]["response"]["data"].clone(),
            );
        }
        report
    } else {
        case["expected"].clone()
    };
    let expected_candidate = case.get("expectedCandidate");
    let submit = case["mode"].as_str() == Some("submit");
    let mode = if submit {
        EvalTrigger::Submit
    } else {
        EvalTrigger::Continuous
    };

    if case.get("operations").is_some() {
        // Use browser-handed filed data when invoked via CLI `--native`, otherwise `expected.data`.
        let fallback_payload;
        let target_data = if let Some(handed) = filed_data {
            handed
        } else if let Some(exp_data) = expected.get("data").filter(|v| v.is_object()) {
            exp_data
        } else {
            fallback_payload = input_payload(root, case);
            &fallback_payload
        };
        if submit {
            evaluator.check_submit_legs(legs, target_data, &expected, expected_candidate);
        } else {
            let recheck = evaluator.run("P(expected.data)", target_data, mode, Caller::Session);
            let mut problems = against_expected(&recheck, &expected);
            if let Some(exp_data) = expected.get("data") {
                problems.extend(round_trip(&mut evaluator, exp_data));
            }
            legs.insert("P".to_string(), problems);
        }
    } else {
        let mut payload = input_payload(root, case);
        if case["origin"] == "new" {
            payload = create_response(
                &definition,
                payload,
                &CreateOptions {
                    now_iso: evaluator.context.now_iso.clone(),
                    subject: evaluator.context.subject.clone(),
                    instances: evaluator.instances.clone(),
                    ..CreateOptions::default()
                },
            )
            .data;
        }
        let live = evaluator.run(
            "P(continuous)",
            &payload,
            EvalTrigger::Continuous,
            Caller::Session,
        );
        if submit {
            let in_session =
                evaluator.run("P(submit)", &payload, EvalTrigger::Submit, Caller::Session);
            evaluator.check_submit_legs(legs, &in_session.data, &expected, expected_candidate);
        } else {
            let mut problems = against_expected(&live, &expected);
            if let Some(data) = expected.get("data") {
                problems.extend(round_trip(&mut evaluator, data));
            }
            legs.insert("P".to_string(), problems);
        }
    }
    legs.insert("noInvention".to_string(), evaluator.inventions);
}

/// Core §4.2.1 Item text, resolved by the evaluator's text pass, compared exactly per path.
fn run_item_text(root: &Path, case: &Value, definition_override: Option<&Value>, legs: &mut Legs) {
    let definition = load_definition(root, case, definition_override);
    let locale_strings = case
        .get("localePath")
        .and_then(Value::as_str)
        .map(|path| {
            read_json(root, path)["strings"]
                .as_object()
                .expect("Locale strings object")
                .iter()
                .map(|(k, v)| (k.clone(), v.as_str().expect("string").to_string()))
                .collect()
        })
        .unwrap_or_default();
    let data: HashMap<String, Value> = input_payload(root, case)
        .as_object()
        .map(|m| m.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
        .unwrap_or_default();
    let options = EvalOptions::default()
        .context(case_context(case))
        .instances(case_instances(case))
        .item_text(ItemTextRequest { locale_strings });
    let result = evaluation_result_to_json_value(&evaluate(&definition, &data, &options));
    let problems = case["expected"]
        .as_object()
        .expect("expected object")
        .iter()
        .filter(|(path, wanted)| !same(&result["itemText"][path.as_str()], wanted))
        .map(|(path, wanted)| {
            format!(
                "{path}: {} vs {}",
                text(&result["itemText"][path.as_str()]),
                text(wanted)
            )
        })
        .collect();
    legs.insert("text".to_string(), problems);
}

/// Evaluate FEL at its authored site, or as a calculate in a synthetic Definition.
fn run_fel(root: &Path, case: &Value, definition_override: Option<&Value>, legs: &mut Legs) {
    let now = case_now(case);
    if let Some(site) = case.get("site").and_then(Value::as_str) {
        let definition = load_definition(root, case, definition_override);
        let mut payload = input_payload(root, case);
        let context = case_context(case);
        let instances = case_instances(case);
        if case["origin"] == "new" {
            payload = create_response(
                &definition,
                payload,
                &CreateOptions {
                    now_iso: context.now_iso.clone(),
                    subject: context.subject.clone(),
                    instances: instances.clone(),
                    ..CreateOptions::default()
                },
            )
            .data;
        }
        let data = payload
            .as_object()
            .expect("input data object")
            .clone()
            .into_iter()
            .collect();
        let options = EvalOptions::default().context(context).instances(instances);
        let evaluated = evaluate(&definition, &data, &options);
        let host_ctx = HostFelContext::from_evaluation(&definition, &evaluated, &options);
        let result = host_ctx
            .evaluate(
                case["expression"].as_str().expect("FEL expression"),
                site,
                true,
                Some(now),
                None,
            )
            .expect("site expression parses");
        let actual = fel_core::exact_json::from_fel(&result.value);
        record_fel_value(case, legs, actual);
        return;
    }
    let fields = case
        .get("fields")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut items: Vec<String> = fields
        .iter()
        .map(|f| {
            format!(
                r#"{{"key":{},"type":"field","dataType":{},"label":"f"}}"#,
                f["key"],
                f.get("dataType")
                    .cloned()
                    .unwrap_or_else(|| parse(r#""string""#))
            )
        })
        .collect();
    items.push(r#"{"key":"suiteValue","type":"field","label":"value"}"#.to_string());
    let definition = parse(&format!(
        r#"{{"$formspec":"1.0","url":"urn:test:shared-suite:fel","version":"1.0.0","status":"active","title":"FEL","items":[{}],"binds":[{{"path":"suiteValue","calculate":{}}}]}}"#,
        items.join(","),
        case["expression"]
    ));
    let data: HashMap<String, Value> = fields
        .iter()
        .map(|f| {
            (
                f["key"].as_str().expect("field key").to_string(),
                f.get("value").cloned().unwrap_or(Value::Null),
            )
        })
        .collect();
    let options = EvalOptions::default()
        .context(case_context(case))
        .instances(case_instances(case));
    let result = evaluation_result_to_json_value(&evaluate(&definition, &data, &options));
    record_fel_value(case, legs, result["values"]["suiteValue"].clone());
}

fn record_fel_value(case: &Value, legs: &mut Legs, actual: Value) {
    let wanted = &case["expected"]["value"];
    let comparator = case["comparator"].as_str().unwrap_or("exact");
    let ok = compare_value(&actual, wanted, comparator, None);
    let problems = if ok {
        Vec::new()
    } else {
        vec![format!(
            "value {}, expected {} ({})",
            text(&actual),
            text(wanted),
            case["comparator"]
        )]
    };
    legs.insert("value".to_string(), problems);
}

/// The tolerance of the `tolerant-decimal` comparator, `1e-9`, matching the TypeScript runner.
fn rust_decimal_epsilon() -> Decimal {
    Decimal::new(1, 9)
}

pub(super) fn run_case(root: &Path, case: &Value) -> Legs {
    run_case_with_overrides(root, case, None, None)
}

pub(super) fn run_case_with_server_registries(root: &Path, case: &Value) -> Legs {
    let mut legs = Legs::new();
    match case["kind"].as_str() {
        Some("ENGINE_PROCESSING" | "VALIDATION_REPORT" | "RESPONSE_VALIDATION") => {
            run_processing(root, case, None, None, true, false, &mut legs);
        }
        _ => return run_case(root, case),
    }
    legs
}

pub(super) fn run_case_with_server_pins(root: &Path, case: &Value) -> Legs {
    let mut legs = Legs::new();
    match case["kind"].as_str() {
        Some("ENGINE_PROCESSING" | "VALIDATION_REPORT" | "RESPONSE_VALIDATION") => {
            run_processing(root, case, None, None, true, true, &mut legs);
        }
        _ => return run_case(root, case),
    }
    legs
}

pub(super) fn run_case_with_overrides(
    root: &Path,
    case: &Value,
    filed_data: Option<&Value>,
    definition_override: Option<&Value>,
) -> Legs {
    let mut legs = Legs::new();
    match case["kind"].as_str() {
        Some("FEL_EVALUATION") => run_fel(root, case, definition_override, &mut legs),
        Some("ITEM_TEXT") => run_item_text(root, case, definition_override, &mut legs),
        Some("ENGINE_PROCESSING" | "VALIDATION_REPORT" | "RESPONSE_VALIDATION") => {
            run_processing(
                root,
                case,
                filed_data,
                definition_override,
                false,
                false,
                &mut legs,
            );
        }
        other => panic!("unsupported case kind {other:?}"),
    }
    legs
}

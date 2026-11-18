//! Shared-suite parity guard, native runner: every case in `tests/conformance/suite/` through
//! `formspec_eval::evaluate` with the options a server recheck builds.
//!
//! The TypeScript runner (`packages/formspec-engine/tests/shared-suite.test.mjs`) runs the same
//! cases through FormEngine and the WASM build. This runner covers the legs that need no browser
//! engine (`formspec/thoughts/plans/evaluator-parity.md` §2.7):
//!
//! - `P`: evaluate the created data for a new Response, or the payload for a saved Response; for continuous cases it equals `expected`.
//! - `S`: `evaluate_filed(def, P.data)`, the settled submit verdict; for submit cases it
//!   equals `expected` and is a fixpoint.
//! - `noInvention`: no evaluate call adds a key or changes a value, except calculated fields, the
//!   `nonRelevantBehavior` projection of non-relevant fields, and declared repeats absent from the
//!   input projected as `[]` (with the group objects enclosing them).
//! - `text` (ITEM_TEXT) and `value` (FEL_EVALUATION).
//!
//! Known divergences are listed per case and leg in `tests/conformance/parity-ledger.json`: a
//! listed leg must fail and an unlisted leg must pass.

// Rust guideline compliant 2026-02-21

use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};

use fel_core::exact_json::Value;
use formspec_core::json_object_to_string_map;
use formspec_eval::{
    CreateOptions, EvalContext, EvalOptions, EvalTrigger, EvaluationResult, HostFelContext,
    ItemTextRequest, create_response, eval_context_from_json_object, evaluate, evaluate_filed,
    evaluation_result_to_json_value, extension_constraints_from_registry_documents,
    filed_response_data_matches,
};

/// The runner's name in the ledger.
const RUNNER: &str = "rust";

/// The clock every leg evaluates at.
///
/// Pinned so `today()`/`now()` agree across legs and runs; the TypeScript runner pins the same
/// instant (`NOW` in `shared-suite.test.mjs`). Changing one without the other breaks parity.
const NOW: &str = "2026-11-17T12:00:00Z";

/// Failing legs of one case: leg name to the problems found (empty means the leg passes).
type Legs = BTreeMap<String, Vec<String>>;

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn read_json(relative: &str) -> Value {
    let path = repo_root().join(relative);
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{}: {e}", path.display()))
}

fn parse(text: &str) -> Value {
    serde_json::from_str(text).expect("valid JSON literal")
}

/// Every suite case file, sorted by name, with its parsed document.
fn suite_cases() -> Vec<(String, Value)> {
    let dir = repo_root().join("tests/conformance/suite");
    let mut files: Vec<String> = std::fs::read_dir(&dir)
        .expect("suite directory")
        .filter_map(|entry| entry.ok()?.file_name().into_string().ok())
        .filter(|name| name.ends_with(".json") && name != "real-examples.manifest.json")
        .collect();
    files.sort();
    files
        .into_iter()
        .map(|file| {
            let doc = read_json(&format!("tests/conformance/suite/{file}"));
            (file, doc)
        })
        .collect()
}

fn text(value: &Value) -> String {
    value.to_string()
}

/// Structural equality with numbers compared as decimals (`3` equals `3.0`).
fn same(a: &Value, b: &Value) -> bool {
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

// --- Outcomes --------------------------------------------------------------------------------

/// What a leg produced: sorted results without envelope markers, and the Response data.
struct Outcome {
    results: Vec<Value>,
    data: Value,
    undeclared: Option<Value>,
    non_relevant: Vec<String>,
}

impl Outcome {
    fn from_evaluation(result: &EvaluationResult) -> Self {
        let json = evaluation_result_to_json_value(result);
        Self {
            results: sorted_results(json["validations"].as_array().map_or(&[], Vec::as_slice)),
            data: json["data"].clone(),
            undeclared: json.get("undeclaredDataPaths").cloned(),
            non_relevant: result.non_relevant.clone(),
        }
    }

    fn count(&self, severity: &str) -> u64 {
        self.results
            .iter()
            .filter(|r| r["severity"].as_str() == Some(severity))
            .count() as u64
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
///
/// Sorting matters for shape `context`, which the evaluator builds from a `HashMap`
/// (`types/evaluation.rs`): without it a recorded problem line could change between runs.
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
enum Caller {
    /// The session (legs P): the case's registries, as the browser loads them.
    Session,
    /// A server recheck (legs S and the fixpoint). Registry documents and subject are omitted
    /// until fs-20e3 and fs-hrx7 reach the deployed adapters.
    Server,
}

/// Evaluates `data` with one caller's options and records any invention.
struct Evaluator<'a> {
    definition: &'a Value,
    registries: Vec<Value>,
    context: EvalContext,
    inventions: Vec<String>,
}

impl Evaluator<'_> {
    fn options(&self, trigger: EvalTrigger, caller: Caller) -> EvalOptions<'static> {
        let mut options = EvalOptions::default().trigger(trigger);
        if matches!(caller, Caller::Session) {
            options = options.context(self.context.clone()).extension_constraints(
                extension_constraints_from_registry_documents(&self.registries),
            );
        } else {
            options.context.now_iso = self.context.now_iso.clone();
        }
        options
    }

    fn check_filed(&mut self, data: &Value, expected: &Value, caller: Caller) -> Vec<String> {
        let options = self.options(EvalTrigger::Submit, caller);
        let result = evaluate_filed(self.definition, &json_object_to_string_map(data), &options)
            .expect("suite filing should settle");
        let verdict = Outcome::from_evaluation(&result);
        let again = self.run("S(fixpoint)", &verdict.data, EvalTrigger::Submit, caller);
        let mut problems = against_expected(&verdict, expected);
        problems.extend(between_legs("fixpoint", &again, &verdict));
        problems
    }

    fn check_submit_legs(&mut self, legs: &mut Legs, data: &Value, expected: &Value) {
        if self.context.subject.is_some() {
            legs.insert(
                "P".to_string(),
                self.check_filed(data, expected, Caller::Session),
            );
        }
        legs.insert(
            "S".to_string(),
            self.check_filed(data, expected, Caller::Server),
        );
    }

    fn run(&mut self, label: &str, data: &Value, trigger: EvalTrigger, caller: Caller) -> Outcome {
        let fields = json_object_to_string_map(data);
        let options = self.options(trigger, caller);
        let outcome = Outcome::from_evaluation(&evaluate(self.definition, &fields, &options));
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
        outcome
    }
}

/// Mismatches between `actual` and `expected`, each result compared on the fields `expected` lists.
fn against_expected(actual: &Outcome, expected: &Value) -> Vec<String> {
    let mut problems = Vec::new();
    let errors = actual.count("error");
    if let Some(valid) = expected.get("valid").and_then(Value::as_bool)
        && (errors == 0) != valid
    {
        problems.push(format!("valid {}, expected {valid}", errors == 0));
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
    problems
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
                    // Dependent questions share the field's enclosing Response object.
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
    // `rows[*].x` and `rows[0].x` both name the template `rows.x`.
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
fn inventions(definition: &Value, input: &Value, output: &Outcome) -> Vec<String> {
    // An authored-slot refusal stops in Rebuild. A cycle finding can accompany evaluated data.
    if output.results.iter().any(|result| {
        result["constraintKind"] == "definition"
            && result["path"]
                .as_str()
                .is_some_and(|path| path.starts_with("$."))
    }) {
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
    // Calculations and empty repeat projections can only add data within existing rows.
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
        // Under a non-relevant node only the nonRelevantBehavior projection is permitted: null or removal.
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

#[test]
fn no_invention_allows_empty_repeat_under_a_field() {
    let definition = parse(
        r#"{"items":[{"key":"control","type":"field","dataType":"string","children":[
            {"key":"rows","type":"group","repeatable":true,"children":[
                {"key":"answer","type":"field","dataType":"string"}
            ]}
        ]}]}"#,
    );
    let mut evaluator = Evaluator {
        definition: &definition,
        registries: Vec::new(),
        context: EvalContext::default(),
        inventions: Vec::new(),
    };
    for (filed, expected) in [
        (r#"{"control":"a"}"#, r#"{"control":"a","rows":[]}"#),
        ("{}", r#"{"rows":[]}"#),
    ] {
        let input = parse(filed);
        let outcome = evaluator.run(filed, &input, EvalTrigger::Submit, Caller::Server);
        assert_eq!(outcome.data, parse(expected));
        assert!(filed_response_data_matches(
            &definition,
            &input,
            &outcome.data
        ));
    }
    assert!(
        evaluator.inventions.is_empty(),
        "{:?}",
        evaluator.inventions
    );
}

#[test]
fn no_invention_refuses_a_new_row_with_only_an_empty_repeat() {
    let definition = parse(
        r#"{"items":[{"key":"rows","type":"group","repeatable":true,"minRepeat":1,"children":[
            {"key":"nested","type":"group","repeatable":true,"children":[
                {"key":"answer","type":"field","dataType":"string"}
            ]}
        ]}]}"#,
    );
    // Pin the padded output so the oracle is still tested when evaluation stops padding (fs-i731).
    let outcome = Outcome {
        results: Vec::new(),
        data: parse(r#"{"rows":[{"nested":[]}]}"#),
        undeclared: None,
        non_relevant: Vec::new(),
    };
    let observed: Vec<_> = ["{}", r#"{"rows":[]}"#, r#"{"rows":[{}]}"#]
        .into_iter()
        .map(|filed| {
            let input = parse(filed);
            (
                filed_response_data_matches(&definition, &input, &outcome.data),
                inventions(&definition, &input, &outcome),
            )
        })
        .collect();
    assert_eq!(
        observed,
        [
            (false, vec!["added rows[0].nested = []".to_string()]),
            (false, vec!["added rows[0].nested = []".to_string()]),
            (true, Vec::new()),
        ]
    );
}

// --- Runs ------------------------------------------------------------------------------------

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

fn input_payload(case: &Value) -> Value {
    let payload = match case.get("payloadPath").and_then(Value::as_str) {
        Some(path) => read_json(path),
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

fn run_processing(case: &Value, legs: &mut Legs) {
    let definition = read_json(case["definitionPath"].as_str().expect("definitionPath"));
    let registries = case
        .get("registryPaths")
        .and_then(Value::as_array)
        .map(|paths| {
            paths
                .iter()
                .map(|p| read_json(p.as_str().expect("registry path")))
                .collect()
        })
        .unwrap_or_default();
    let mut host = fel_core::exact_json::Map::new();
    host.insert("nowIso".into(), Value::String(NOW.into()));
    if let Some(subject) = case.get("subject") {
        host.insert("subjectType".into(), subject["type"].clone());
        if let Some(keys) = subject.get("keys") {
            host.insert("subjectKeys".into(), keys.clone());
        }
    }
    let mut evaluator = Evaluator {
        definition: &definition,
        context: eval_context_from_json_object(&host).expect("suite context"),
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
    let submit = case["mode"].as_str() == Some("submit");
    let mode = if submit {
        EvalTrigger::Submit
    } else {
        EvalTrigger::Continuous
    };

    if case.get("operations").is_some() {
        // The filed record is `expected.data`; the session that produced it runs in TypeScript.
        if submit {
            evaluator.check_submit_legs(legs, &expected["data"], &expected);
        } else {
            let recheck =
                evaluator.run("P(expected.data)", &expected["data"], mode, Caller::Session);
            let mut problems = against_expected(&recheck, &expected);
            problems.extend(round_trip(&mut evaluator, &expected["data"]));
            legs.insert("P".to_string(), problems);
        }
    } else {
        let mut payload = input_payload(case);
        if case["origin"] == "new" {
            // Fixture URL sources fail, so use their authored fallback on the session leg.
            payload = create_response(
                &definition,
                payload,
                &CreateOptions {
                    now_iso: Some(NOW.to_owned()),
                    subject: evaluator.context.subject.clone(),
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
            evaluator.check_submit_legs(legs, &in_session.data, &expected);
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
fn run_item_text(case: &Value, legs: &mut Legs) {
    let definition = read_json(case["definitionPath"].as_str().expect("definitionPath"));
    let locale_strings = case
        .get("localePath")
        .and_then(Value::as_str)
        .map(|path| {
            read_json(path)["strings"]
                .as_object()
                .expect("Locale strings object")
                .iter()
                .map(|(k, v)| (k.clone(), v.as_str().expect("string").to_string()))
                .collect()
        })
        .unwrap_or_default();
    let data: HashMap<String, Value> = input_payload(case)
        .as_object()
        .map(|m| m.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
        .unwrap_or_default();
    let mut options = EvalOptions::default().item_text(ItemTextRequest { locale_strings });
    options.context.now_iso = Some(NOW.to_string());
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
fn run_fel(case: &Value, legs: &mut Legs) {
    if let Some(site) = case.get("site").and_then(Value::as_str) {
        let definition = read_json(case["definitionPath"].as_str().expect("definitionPath"));
        let data = input_payload(case)
            .as_object()
            .expect("input data object")
            .clone()
            .into_iter()
            .collect();
        let mut options = EvalOptions::default();
        options.context.now_iso = Some(NOW.to_string());
        let evaluated = evaluate(&definition, &data, &options);
        let context = HostFelContext::from_evaluation(&definition, &evaluated, &options);
        let result = context
            .evaluate(
                case["expression"].as_str().expect("FEL expression"),
                site,
                true,
                Some(NOW),
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
    let mut options = EvalOptions::default();
    options.context.now_iso = Some(NOW.to_string());
    let result = evaluation_result_to_json_value(&evaluate(&definition, &data, &options));
    record_fel_value(case, legs, result["values"]["suiteValue"].clone());
}

fn record_fel_value(case: &Value, legs: &mut Legs, actual: Value) {
    let wanted = &case["expected"]["value"];
    let ok = match (
        case["comparator"].as_str(),
        actual.as_decimal(),
        wanted.as_decimal(),
    ) {
        (Some("tolerant-decimal"), Some(a), Some(w)) => (a - w).abs() <= rust_decimal_epsilon(),
        _ => same(&actual, wanted),
    };
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
fn rust_decimal_epsilon() -> rust_decimal::Decimal {
    rust_decimal::Decimal::new(1, 9)
}

fn run_case(case: &Value) -> Legs {
    let mut legs = Legs::new();
    match case["kind"].as_str() {
        Some("FEL_EVALUATION") => run_fel(case, &mut legs),
        Some("ITEM_TEXT") => run_item_text(case, &mut legs),
        Some("ENGINE_PROCESSING" | "VALIDATION_REPORT" | "RESPONSE_VALIDATION") => {
            run_processing(case, &mut legs);
        }
        other => panic!("unsupported case kind {other:?}"),
    }
    legs
}

/// Every case through every leg, judged against `tests/conformance/parity-ledger.json`.
#[test]
fn shared_suite_parity_guard() {
    let ledger = read_json("tests/conformance/parity-ledger.json");
    let cases = suite_cases();
    let mut violations = Vec::new();
    let mut observed = Vec::new();
    for (file, case) in &cases {
        let id = case["id"].as_str().expect("case id");
        let legs = run_case(case);
        let listed = ledger["entries"][id][RUNNER]
            .as_object()
            .cloned()
            .unwrap_or_default();
        for leg in listed.keys().filter(|leg| !legs.contains_key(leg.as_str())) {
            violations.push(format!("{file}: parity-ledger.json lists {RUNNER} leg {leg}, which this runner does not run"));
        }
        for (leg, problems) in &legs {
            if !problems.is_empty() {
                observed.push(format!(
                    "{}: {}",
                    serde_json::to_string(&[id, leg.as_str()]).expect("strings"),
                    serde_json::to_string(problems).expect("strings")
                ));
            }
            match (listed.get(leg), problems.is_empty()) {
                (Some(entry), true) => violations.push(format!(
                    "{file}: {RUNNER} leg {leg} now passes; delete its parity-ledger.json entry ({})",
                    entry["ticket"]
                )),
                // A listed leg must fail with exactly its recorded problems: any new difference fails CI.
                (Some(entry), false) => {
                    let mut recorded: Vec<String> = entry["problems"]
                        .as_array()
                        .map(|a| a.iter().filter_map(|p| p.as_str().map(str::to_string)).collect())
                        .unwrap_or_default();
                    let mut got = problems.clone();
                    recorded.sort();
                    got.sort();
                    if recorded != got {
                        let new: Vec<&String> = got.iter().filter(|p| !recorded.contains(p)).collect();
                        let gone: Vec<&String> = recorded.iter().filter(|p| !got.contains(p)).collect();
                        violations.push(format!(
                            "{file}: {RUNNER} leg {leg} fails differently from its parity-ledger.json entry ({}):\n    new: {new:?}\n    gone: {gone:?}",
                            entry["ticket"]
                        ));
                    }
                }
                (None, false) => {
                    violations.push(format!("{file}: {RUNNER} leg {leg} fails:\n    {}", problems.join("\n    ")));
                }
                (None, true) => {}
            }
        }
    }
    // PARITY_LEDGER_OBSERVED=<file> records every failing leg's exact problem lines (one JSON pair per
    // line), for writing ledger entries from a real run. It never changes the verdict.
    if let Ok(path) = std::env::var("PARITY_LEDGER_OBSERVED") {
        std::fs::write(&path, observed.join("\n")).expect("observed ledger file");
    }
    let ids: Vec<&str> = cases.iter().filter_map(|(_, c)| c["id"].as_str()).collect();
    for case_id in ledger["entries"]
        .as_object()
        .expect("ledger entries")
        .keys()
    {
        if !ids.contains(&case_id.as_str()) {
            violations.push(format!("parity-ledger.json lists unknown case {case_id}"));
        }
    }
    assert!(
        violations.is_empty(),
        "{} parity violation(s):\n{}",
        violations.len(),
        violations.join("\n")
    );
}

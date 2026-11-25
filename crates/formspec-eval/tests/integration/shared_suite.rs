//! Shared-suite parity guard, native runner: runs `tests/conformance/suite/` standalone in Rust
//! through the shared `crates/formspec-eval/conformance/mod.rs` adapter.

// Rust guideline compliant 2026-02-21

#[path = "../../conformance/mod.rs"]
mod conformance;

use std::collections::HashMap;

use conformance::{
    Caller, Evaluator, Outcome, inventions, load_suite, parse, read_json, repo_root, run_case,
};
use formspec_eval::{EvalContext, EvalTrigger, filed_response_data_matches};

/// The runner's name in the ledger.
const RUNNER: &str = "rust";

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
        instances: HashMap::new(),
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
        refused: false,
        diagnostics: Vec::new(),
        results: Vec::new(),
        data: parse(r#"{"rows":[{"nested":[]}]}"#),
        undeclared: None,
        non_relevant: Vec::new(),
        required: HashMap::new(),
        readonly: HashMap::new(),
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

/// Every case through every leg, judged against `tests/conformance/parity-ledger.json`.
#[test]
fn shared_suite_parity_guard() {
    let root = repo_root();
    let ledger = read_json(&root, "tests/conformance/parity-ledger.json");
    let cases = load_suite(&root.join("tests/conformance/suite"));
    let mut violations = Vec::new();
    let mut observed = Vec::new();
    for (file, case) in &cases {
        let id = case["id"].as_str().expect("case id");
        let legs = run_case(&root, case);
        let listed = ledger["entries"][id][RUNNER]
            .as_object()
            .cloned()
            .unwrap_or_default();
        for leg in listed.keys().filter(|leg| !legs.contains_key(leg.as_str())) {
            violations.push(format!(
                "{file}: parity-ledger.json lists {RUNNER} leg {leg}, which this runner does not run"
            ));
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
                        .map(|a| {
                            a.iter()
                                .filter_map(|p| p.as_str().map(str::to_string))
                                .collect()
                        })
                        .unwrap_or_default();
                    let mut got = problems.clone();
                    recorded.sort();
                    got.sort();
                    if recorded != got {
                        let new: Vec<&String> =
                            got.iter().filter(|p| !recorded.contains(p)).collect();
                        let gone: Vec<&String> =
                            recorded.iter().filter(|p| !got.contains(p)).collect();
                        violations.push(format!(
                            "{file}: {RUNNER} leg {leg} fails differently from its parity-ledger.json entry ({}):\n    new: {new:?}\n    gone: {gone:?}",
                            entry["ticket"]
                        ));
                    }
                }
                (None, false) => {
                    violations.push(format!(
                        "{file}: {RUNNER} leg {leg} fails:\n    {}",
                        problems.join("\n    ")
                    ));
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

#[test]
fn native_adapter_supports_partial_expectations_wrapped_decimals_states_and_suite_defaults() {
    let dir = std::env::temp_dir().join(format!(
        "formspec-native-conformance-{}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("temp dir");

    let definition = r#"{
        "$formspec": "1.0",
        "url": "urn:example:native-partial",
        "version": "1.0.0",
        "status": "active",
        "title": "Native Partial",
        "instances": { "cfg": { "data": { "scale": 1 } } },
        "items": [
            { "key": "asOf", "type": "field", "dataType": "date", "label": "As Of" },
            { "key": "rate", "type": "field", "dataType": "decimal", "label": "Rate" },
            { "key": "note", "type": "field", "dataType": "string", "label": "Note" }
        ],
        "binds": [
            { "path": "asOf", "calculate": "today()" },
            { "path": "note", "required": "$rate > 0", "readonly": "@instance('cfg').scale > 1" }
        ]
    }"#;
    std::fs::write(dir.join("form.json"), definition).expect("write def");

    let suite = r#"{
        "defaults": {
            "kind": "ENGINE_PROCESSING",
            "definitionPath": "form.json",
            "origin": "saved",
            "mode": "continuous",
            "now": "2026-08-01T00:00:00Z",
            "instances": { "cfg": { "scale": 2 } },
            "specRefs": ["Core §4.3", "Core §4.4"]
        },
        "cases": [
            {
                "id": "exact-28-digits-and-states",
                "inputData": { "rate": 0.1234567890123456789012345678 },
                "expected": {
                    "present": [{ "path": "note", "code": "REQUIRED", "count": 1 }],
                    "absent": [{ "path": "rate", "code": "REQUIRED" }],
                    "dataAt": [
                        { "path": "asOf", "value": "2026-08-01" },
                        { "path": "rate", "value": 0.1234567890123456789012345678, "comparator": "exact" },
                        { "path": "rate", "value": 0.1234567890123456789012345679, "comparator": "tolerance", "epsilon": "1e-28" }
                    ],
                    "states": {
                        "note": { "relevant": true, "required": true, "readonly": true }
                    }
                }
            },
            {
                "id": "catches-digit-28-mismatch",
                "inputData": { "rate": 0.1234567890123456789012345678 },
                "expected": {
                    "dataAt": [
                        { "path": "rate", "value": 0.1234567890123456789012345679, "comparator": "exact" }
                    ]
                }
            }
        ]
    }"#;
    std::fs::write(dir.join("suite.json"), suite).expect("write suite");

    let cases = load_suite(&dir.join("suite.json"));
    assert_eq!(cases.len(), 2);

    let pass_legs = run_case(&dir, &cases[0].1);
    assert_eq!(pass_legs["P"], Vec::<String>::new());
    assert_eq!(pass_legs["noInvention"], Vec::<String>::new());

    let fail_legs = run_case(&dir, &cases[1].1);
    assert_eq!(fail_legs["P"].len(), 1);
    assert!(fail_legs["P"][0].contains("dataAt rate:"));

    let _ = std::fs::remove_dir_all(&dir);
}

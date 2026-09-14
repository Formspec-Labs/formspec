//! Shared cross-runtime conformance cases (`tests/conformance/suite/`) run through the batch evaluator.
//!
//! The TypeScript engine runs every case in `shared-suite.test.mjs`. This runner covers
//! the listed `VALIDATION_REPORT` cases and compares what both runtimes must agree on:
//! validity, severity counts, and each result's path, code, severity, and constraint kind.

use formspec_eval::{
    EvalOptions, EvalTrigger, evaluate, extension_constraints_from_registry_documents,
};
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn read_json(relative: &str) -> Value {
    let path = repo_root().join(relative);
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{}: {e}", path.display()))
}

/// `(path, code, severity, constraintKind)`, sorted: the result fields runtimes share.
fn result_keys(
    results: impl IntoIterator<Item = (String, String, String, String)>,
) -> Vec<(String, String, String, String)> {
    let mut keys: Vec<_> = results.into_iter().collect();
    keys.sort();
    keys
}

fn run_validation_report_case(case_file: &str) {
    let case = read_json(&format!("tests/conformance/suite/{case_file}"));
    assert_eq!(case["kind"], "VALIDATION_REPORT", "{case_file}");
    let definition = read_json(case["definitionPath"].as_str().expect("definitionPath"));
    let registries: Vec<Value> = case["registryPaths"]
        .as_array()
        .map(|paths| {
            paths
                .iter()
                .map(|p| read_json(p.as_str().expect("registry path")))
                .collect()
        })
        .unwrap_or_default();
    let data: HashMap<String, Value> = case["inputData"]
        .as_object()
        .expect("inline inputData object")
        .iter()
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect();
    let trigger = match case["mode"].as_str() {
        Some("continuous") => EvalTrigger::Continuous,
        _ => EvalTrigger::Submit,
    };
    let options = EvalOptions::default()
        .trigger(trigger)
        .extension_constraints(extension_constraints_from_registry_documents(&registries));

    let result = evaluate(&definition, &data, &options);

    let expected = &case["expected"];
    let count = |severity: &str| {
        result
            .validations
            .iter()
            .filter(|v| v.severity == *severity)
            .count() as u64
    };
    for severity in ["error", "warning", "info"] {
        assert_eq!(
            Some(count(severity)),
            expected["counts"][severity].as_u64(),
            "{case_file}: {severity} count; results {:?}",
            result.validations
        );
    }
    assert_eq!(
        Some(count("error") == 0),
        expected["valid"].as_bool(),
        "{case_file}: valid"
    );

    let actual = result_keys(result.validations.iter().map(|v| {
        (
            v.path.clone(),
            v.code.to_string(),
            v.severity.as_wire_str().to_string(),
            v.constraint_kind.as_wire_str().to_string(),
        )
    }));
    let text = |value: &Value, key: &str| value[key].as_str().unwrap_or_default().to_string();
    let wanted = result_keys(
        expected["results"]
            .as_array()
            .expect("expected.results")
            .iter()
            .map(|r| {
                (
                    text(r, "path"),
                    text(r, "code"),
                    text(r, "severity"),
                    text(r, "constraintKind"),
                )
            }),
    );
    assert_eq!(actual, wanted, "{case_file}");
}

/// Core §4.3.1 / §4.3.3: Binds spelled `jobs[*].x` and `jobs.x` merge in document order.
#[test]
fn bind_merge_document_order() {
    run_validation_report_case("bind-merge-document-order.json");
}

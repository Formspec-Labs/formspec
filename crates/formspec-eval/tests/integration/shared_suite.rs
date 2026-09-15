//! Shared cross-runtime conformance cases (`tests/conformance/suite/`) run through the batch evaluator.
//!
//! The TypeScript engine runs every case in `shared-suite.test.mjs`. This runner covers
//! the listed `VALIDATION_REPORT` cases, comparing what both runtimes must agree on
//! (validity, severity counts, and each result's path, code, severity, and constraint
//! kind), and the listed `ITEM_TEXT` cases, comparing resolved Item text exactly.

use formspec_eval::{
    EvalOptions, EvalTrigger, ItemTextRequest, evaluate, evaluation_result_to_json_value,
    extension_constraints_from_registry_documents,
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
    let data = input_data(&case);
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

/// Core §4.3 / FEL repeat context: a Bind constraint and its message inside a row see that row's
/// `@index` and `@count`, as its calculate does.
#[test]
fn repeat_row_validation_context() {
    run_validation_report_case("repeat-row-validation-context.json");
}

fn input_data(case: &Value) -> HashMap<String, Value> {
    case["inputData"]
        .as_object()
        .expect("inline inputData object")
        .iter()
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect()
}

fn run_item_text_case(case_file: &str) {
    let case = read_json(&format!("tests/conformance/suite/{case_file}"));
    assert_eq!(case["kind"], "ITEM_TEXT", "{case_file}");
    let definition = read_json(case["definitionPath"].as_str().expect("definitionPath"));
    let locale_strings = case["localePath"]
        .as_str()
        .map(|path| {
            read_json(path)["strings"]
                .as_object()
                .expect("Locale strings object")
                .iter()
                .map(|(key, value)| (key.clone(), value.as_str().expect("string").to_string()))
                .collect()
        })
        .unwrap_or_default();
    let options = EvalOptions::default().item_text(ItemTextRequest { locale_strings });

    let result =
        evaluation_result_to_json_value(&evaluate(&definition, &input_data(&case), &options));

    for (path, expected) in case["expected"].as_object().expect("expected object") {
        assert_eq!(
            &result["itemText"][path], expected,
            "{case_file}: {path}; itemText {}",
            result["itemText"]
        );
    }
}

/// Core §4.2.1: `{{}}` in label, labels, hint, and description resolves inline.
#[test]
fn item_text_inline_interpolation() {
    run_item_text_case("item-text-inline-interpolation.json");
}

/// Core §4.2.1 / Locale §3.3.2: repeat children interpolate in their instance scope.
#[test]
fn item_text_repeat_row_scope() {
    run_item_text_case("item-text-repeat-row-scope.json");
}

/// Locale §3.3.1 rule 1: `{{{{` renders a literal `{{`.
#[test]
fn item_text_escape() {
    run_item_text_case("item-text-escape.json");
}

/// Locale §3.3.1 rules 2 and 3a: a failed expression stays literal; the rest of the text resolves.
#[test]
fn item_text_failed_expression_literal() {
    run_item_text_case("item-text-failed-expression-literal.json");
}

/// Locale §3.1.1–§3.1.2: Locale strings replace inline text and interpolate in the same scope.
#[test]
fn item_text_locale_over_inline() {
    run_item_text_case("item-text-locale-over-inline.json");
}

/// Locale §3.1.2 / Core §4.2.1: `@context` applies to `hint` and `description`, not just `label`.
#[test]
fn item_text_locale_context() {
    run_item_text_case("item-text-locale-context.json");
}

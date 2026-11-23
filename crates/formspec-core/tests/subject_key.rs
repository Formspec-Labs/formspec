//! Subject key rules and identity available to the evaluator without Response selection.

use formspec_core::subject_key::{SubjectKey, subject_id_json};
use rust_decimal::Decimal;
use serde_json::Value;

const SUBJECT_IDS: &str =
    include_str!("../../../tests/conformance/fixtures/subject-id/vectors.json");

#[test]
fn subject_key_integer_bounds_agree_for_i64_and_decimal() {
    for (value, expected) in [
        (-9_007_199_254_740_992_i64, false),
        (-9_007_199_254_740_991, true),
        (0, true),
        (9_007_199_254_740_991, true),
        (9_007_199_254_740_992, false),
    ] {
        assert_eq!(SubjectKey::is_integer_in_range(&value), expected);
        assert_eq!(
            SubjectKey::is_integer_in_range(&Decimal::from(value)),
            expected
        );
    }
}

#[test]
fn subject_id_vectors() {
    let suite: Value = serde_json::from_str(SUBJECT_IDS).unwrap();
    for vector in suite["vectors"].as_array().unwrap() {
        assert_eq!(
            subject_id_json(
                vector["type"].as_str().unwrap(),
                &vector["keys"].to_string()
            )
            .unwrap(),
            vector["id"].as_str().unwrap(),
            "{}",
            vector["name"],
        );
    }
}

#[test]
fn subject_id_refuses_unsafe_integers() {
    let suite: Value = serde_json::from_str(SUBJECT_IDS).unwrap();
    for vector in suite["refusals"].as_array().unwrap() {
        let error = subject_id_json(
            vector["type"].as_str().unwrap(),
            &vector["keys"].to_string(),
        )
        .expect_err(vector["name"].as_str().unwrap());
        assert!(
            error.contains(vector["expectedError"].as_str().unwrap()),
            "{error}"
        );
    }
}

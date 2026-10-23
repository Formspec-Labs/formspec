//! Tests for parser_recovery module in formspec-core.

use formspec_core::parser_recovery::parse_json_with_recovery;
use serde_json::json;

#[test]
fn test_valid_json_parses_without_recovery() {
    let input = r#"{"name": "Alice", "age": 30, "active": true}"#;
    let res = parse_json_with_recovery(input).expect("should parse valid json");
    assert!(!res.recovered);
    assert!(res.diagnostics.is_empty());
    assert_eq!(res.value["name"], "Alice");
    assert_eq!(res.value["age"], 30);
}

#[test]
fn test_recovers_from_trailing_commas() {
    let input = r#"{
        "items": [1, 2, 3,],
        "meta": { "version": "1.0", },
    }"#;
    let res = parse_json_with_recovery(input).expect("should recover from trailing commas");
    assert!(res.recovered);
    assert!(!res.diagnostics.is_empty());
    assert_eq!(res.value["items"], json!([1, 2, 3]));
    assert_eq!(res.value["meta"]["version"], "1.0");
}

#[test]
fn test_recovers_from_comments() {
    let input = r#"{
        // This is a line comment
        "title": "Grant Application", /* block comment */
        "amount": 50000
    }"#;
    let res = parse_json_with_recovery(input).expect("should strip comments");
    assert!(res.recovered);
    assert_eq!(res.value["title"], "Grant Application");
    assert_eq!(res.value["amount"], 50000);
}

#[test]
fn test_recovers_from_single_quotes() {
    let input = "{ 'mode': 'auto', 'role': 'admin' }";
    let res = parse_json_with_recovery(input).expect("should convert single quotes");
    assert!(res.recovered);
    assert_eq!(res.value["mode"], "auto");
    assert_eq!(res.value["role"], "admin");
}

#[test]
fn test_recovers_from_unclosed_delimiters() {
    let input = r#"{"level1": {"level2": [10, 20"#;
    let res = parse_json_with_recovery(input).expect("should balance unclosed delimiters");
    assert!(res.recovered);
    assert_eq!(res.value["level1"]["level2"], json!([10, 20]));
}

#[test]
fn test_unrecoverable_garbage_returns_error() {
    let input = "not a json at all ::: @@ 123";
    let err = parse_json_with_recovery(input).unwrap_err();
    assert!(err.to_string().contains("JSON parse error"));
}

//! Comprehensive tests for dataType type-mismatch validation (TYPE_MISMATCH).
//!
//! Covers all 13 spec dataTypes: string, text, integer, decimal, boolean,
//! date, dateTime, time, uri, attachment, choice, multiChoice, money.
//!
//! Each dataType has:
//! - Valid values that must NOT produce TYPE_MISMATCH
//! - Invalid values that MUST produce TYPE_MISMATCH
//! - Edge cases at type boundaries

use formspec_eval::{evaluate, EvalOptions, EvalTrigger, ExtensionConstraint};
use serde_json::{Value, json};
use std::collections::HashMap;

/// Helper: build a minimal definition with one field of the given dataType.
fn def_with_field(key: &str, data_type: &str) -> Value {
    json!({
        "$formspec": "1.0",
        "url": "test://type-validation",
        "version": "1.0.0",
        "title": "Type Validation Test",
        "items": [
            { "key": key, "type": "field", "dataType": data_type, "label": key }
        ]
    })
}

/// Helper: evaluate a definition with a single field value and return TYPE_MISMATCH results.
fn type_mismatches(data_type: &str, value: Value) -> Vec<String> {
    let def = def_with_field("field", data_type);
    let mut data = HashMap::new();
    if !value.is_null() {
        data.insert("field".to_string(), value);
    }
    let result = evaluate(&def, &data, &EvalOptions::default());
    result
        .validations
        .iter()
        .filter(|r| r.code == "TYPE_MISMATCH")
        .map(|r| r.message.clone())
        .collect()
}

/// Assert the value produces NO TYPE_MISMATCH for the given dataType.
fn assert_valid(data_type: &str, value: Value) {
    let mismatches = type_mismatches(data_type, value.clone());
    assert!(
        mismatches.is_empty(),
        "{data_type}: expected {value} to be valid, got TYPE_MISMATCH: {mismatches:?}"
    );
}

/// Assert the value DOES produce TYPE_MISMATCH for the given dataType.
fn assert_invalid(data_type: &str, value: Value) {
    let mismatches = type_mismatches(data_type, value.clone());
    assert!(
        !mismatches.is_empty(),
        "{data_type}: expected {value} to be invalid (TYPE_MISMATCH), but it passed"
    );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// string
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#[test]
fn string_accepts_any_string() {
    assert_valid("string", json!("hello"));
    assert_valid("string", json!(""));
    assert_valid("string", json!("  with  spaces  "));
    assert_valid("string", json!("multi\nline"));
    assert_valid("string", json!("unicode: 日本語 🎉"));
}

#[test]
fn string_rejects_non_strings() {
    assert_invalid("string", json!(42));
    assert_invalid("string", json!(3.14));
    assert_invalid("string", json!(true));
    assert_invalid("string", json!(false));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// text (identical to string at data level)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#[test]
fn text_accepts_any_string() {
    assert_valid("text", json!("short"));
    assert_valid("text", json!("multi\nline\ntext"));
    assert_valid("text", json!(""));
    assert_valid(
        "text",
        json!("A very long paragraph that spans multiple sentences. It has depth and nuance."),
    );
}

#[test]
fn text_rejects_non_strings() {
    assert_invalid("text", json!(42));
    assert_invalid("text", json!(true));
    assert_invalid("text", json!(3.14));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// integer
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#[test]
fn integer_accepts_whole_numbers() {
    assert_valid("integer", json!(0));
    assert_valid("integer", json!(42));
    assert_valid("integer", json!(-100));
    assert_valid("integer", json!(999999));
    assert_valid("integer", json!(1_000_000_000));
}

#[test]
fn integer_rejects_fractional_numbers() {
    assert_invalid("integer", json!(3.14));
    assert_invalid("integer", json!(-0.5));
    assert_invalid("integer", json!(1.1));
}

#[test]
fn integer_rejects_non_numbers() {
    assert_invalid("integer", json!("42"));
    assert_invalid("integer", json!(true));
    assert_invalid("integer", json!("not a number"));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// decimal
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#[test]
fn decimal_accepts_any_number() {
    assert_valid("decimal", json!(0));
    assert_valid("decimal", json!(3.14));
    assert_valid("decimal", json!(-999.99));
    assert_valid("decimal", json!(42));
}

#[test]
fn decimal_rejects_non_numbers() {
    assert_invalid("decimal", json!("3.14"));
    assert_invalid("decimal", json!(true));
    assert_invalid("decimal", json!("not a number"));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// boolean
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#[test]
fn boolean_accepts_true_false() {
    assert_valid("boolean", json!(true));
    assert_valid("boolean", json!(false));
}

#[test]
fn boolean_rejects_non_booleans() {
    assert_invalid("boolean", json!(0));
    assert_invalid("boolean", json!(1));
    assert_invalid("boolean", json!("true"));
    assert_invalid("boolean", json!("false"));
    assert_invalid("boolean", json!("yes"));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// date — ISO 8601 YYYY-MM-DD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#[test]
fn date_accepts_valid_iso_dates() {
    assert_valid("date", json!("2025-03-31"));
    assert_valid("date", json!("1990-01-01"));
    assert_valid("date", json!("2000-12-31"));
    assert_valid("date", json!("2025-02-28"));
}

#[test]
fn date_rejects_non_strings() {
    assert_invalid("date", json!(20250331));
    assert_invalid("date", json!(true));
}

#[test]
fn date_rejects_invalid_date_strings() {
    assert_invalid("date", json!("not-a-date"));
    assert_invalid("date", json!("2025-13-01")); // month 13
    assert_invalid("date", json!("2025-00-15")); // month 0
    assert_invalid("date", json!("2025-02-30")); // Feb 30
    assert_invalid("date", json!("03-31-2025")); // US format
    assert_invalid("date", json!("2025/03/31")); // slashes
    assert_invalid("date", json!("31-03-2025")); // day first
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// dateTime — ISO 8601 date-time
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#[test]
fn datetime_accepts_valid_iso_datetimes() {
    assert_valid("dateTime", json!("2025-03-31T09:00:00Z"));
    assert_valid("dateTime", json!("2025-01-15T10:30:00+05:00"));
    assert_valid("dateTime", json!("2025-12-31T23:59:59Z"));
    assert_valid("dateTime", json!("2025-03-31T00:00:00Z"));
    assert_valid("dateTime", json!("2025-03-31T14:30:00-04:00"));
}

#[test]
fn datetime_rejects_non_strings() {
    assert_invalid("dateTime", json!(1711843200));
    assert_invalid("dateTime", json!(true));
}

#[test]
fn datetime_rejects_invalid_datetime_strings() {
    assert_invalid("dateTime", json!("not-a-datetime"));
    assert_invalid("dateTime", json!("2025-03-31")); // date only, no time
    assert_invalid("dateTime", json!("09:00:00")); // time only
    assert_invalid("dateTime", json!("2025-13-31T09:00:00Z")); // month 13
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// time — HH:MM:SS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#[test]
fn time_accepts_valid_times() {
    assert_valid("time", json!("09:00:00"));
    assert_valid("time", json!("00:00:00"));
    assert_valid("time", json!("23:59:59"));
    assert_valid("time", json!("14:30:00"));
    // HH:MM without seconds is also valid
    assert_valid("time", json!("09:00"));
    assert_valid("time", json!("14:30"));
}

#[test]
fn time_rejects_non_strings() {
    assert_invalid("time", json!(90000));
    assert_invalid("time", json!(true));
}

#[test]
fn time_rejects_invalid_time_strings() {
    assert_invalid("time", json!("not-a-time"));
    assert_invalid("time", json!("24:00:00")); // hour 24
    assert_invalid("time", json!("12:60:00")); // minute 60
    assert_invalid("time", json!("9:00:00")); // single digit hour
    assert_invalid("time", json!("9:00")); // single digit hour in HH:MM
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// uri — RFC 3986
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#[test]
fn uri_accepts_valid_uris() {
    assert_valid("uri", json!("https://example.com"));
    assert_valid("uri", json!("http://example.com/path?q=1#frag"));
    assert_valid("uri", json!("ftp://files.example.com/doc.pdf"));
    assert_valid("uri", json!("mailto:user@example.com"));
    assert_valid("uri", json!("urn:isbn:0451450523"));
}

#[test]
fn uri_rejects_non_strings() {
    assert_invalid("uri", json!(42));
    assert_invalid("uri", json!(true));
}

#[test]
fn uri_rejects_invalid_uris() {
    assert_invalid("uri", json!("not a uri"));
    assert_invalid("uri", json!("://missing-scheme"));
    // Empty string skips type validation (same as null — no value provided).
    // Required check handles emptiness; type check handles format.
    assert_valid("uri", json!(""));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// choice — must be a string
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#[test]
fn choice_accepts_strings() {
    assert_valid("choice", json!("option_a"));
    assert_valid("choice", json!(""));
    assert_valid("choice", json!("any_string_value"));
}

#[test]
fn choice_rejects_non_strings() {
    assert_invalid("choice", json!(1));
    assert_invalid("choice", json!(true));
    assert_invalid("choice", json!(["option_a"]));
}

#[test]
fn choice_validates_against_options_list() {
    let def = json!({
        "$formspec": "1.0",
        "url": "test://choice-validation",
        "version": "1.0.0",
        "title": "Choice Test",
        "items": [{
            "key": "color",
            "type": "field",
            "dataType": "choice",
            "label": "Color",
            "options": [
                { "value": "red", "label": "Red" },
                { "value": "blue", "label": "Blue" },
                { "value": "green", "label": "Green" }
            ]
        }]
    });

    // Valid option
    let mut data = HashMap::new();
    data.insert("color".to_string(), json!("red"));
    let result = evaluate(&def, &data, &EvalOptions::default());
    let mismatches: Vec<_> = result
        .validations
        .iter()
        .filter(|r| r.code == "TYPE_MISMATCH")
        .collect();
    assert!(
        mismatches.is_empty(),
        "valid option 'red' should not produce TYPE_MISMATCH"
    );

    // Invalid option
    data.insert("color".to_string(), json!("purple"));
    let result = evaluate(&def, &data, &EvalOptions::default());
    let mismatches: Vec<_> = result
        .validations
        .iter()
        .filter(|r| r.code == "TYPE_MISMATCH")
        .collect();
    assert!(
        !mismatches.is_empty(),
        "invalid option 'purple' should produce TYPE_MISMATCH"
    );
}

#[test]
fn multichoice_validates_against_options_list() {
    let def = json!({
        "$formspec": "1.0",
        "url": "test://multichoice-validation",
        "version": "1.0.0",
        "title": "MultiChoice Test",
        "items": [{
            "key": "colors",
            "type": "field",
            "dataType": "multiChoice",
            "label": "Colors",
            "options": [
                { "value": "red", "label": "Red" },
                { "value": "blue", "label": "Blue" }
            ]
        }]
    });

    // Valid options
    let mut data = HashMap::new();
    data.insert("colors".to_string(), json!(["red", "blue"]));
    let result = evaluate(&def, &data, &EvalOptions::default());
    let mismatches: Vec<_> = result
        .validations
        .iter()
        .filter(|r| r.code == "TYPE_MISMATCH")
        .collect();
    assert!(
        mismatches.is_empty(),
        "valid options should not produce TYPE_MISMATCH"
    );

    // One invalid option
    data.insert("colors".to_string(), json!(["red", "purple"]));
    let result = evaluate(&def, &data, &EvalOptions::default());
    let mismatches: Vec<_> = result
        .validations
        .iter()
        .filter(|r| r.code == "TYPE_MISMATCH")
        .collect();
    assert!(
        !mismatches.is_empty(),
        "invalid option 'purple' in array should produce TYPE_MISMATCH"
    );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// multiChoice — array of strings
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#[test]
fn multichoice_accepts_string_arrays() {
    assert_valid("multiChoice", json!(["a", "b", "c"]));
    assert_valid("multiChoice", json!(["single"]));
    assert_valid("multiChoice", json!([]));
}

#[test]
fn multichoice_rejects_non_arrays() {
    assert_invalid("multiChoice", json!("option_a"));
    assert_invalid("multiChoice", json!(42));
    assert_invalid("multiChoice", json!(true));
}

#[test]
fn multichoice_rejects_arrays_with_non_strings() {
    assert_invalid("multiChoice", json!([1, 2, 3]));
    assert_invalid("multiChoice", json!(["a", 1, "b"]));
    assert_invalid("multiChoice", json!([true, false]));
    assert_invalid("multiChoice", json!([null]));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// money — { amount: string, currency: string }
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#[test]
fn money_accepts_valid_money_objects() {
    assert_valid("money", json!({"amount": "50000.00", "currency": "USD"}));
    assert_valid("money", json!({"amount": "0.01", "currency": "EUR"}));
    assert_valid("money", json!({"amount": "999999.99", "currency": "GBP"}));
}

#[test]
fn money_rejects_non_objects() {
    assert_invalid("money", json!(1250.00));
    assert_invalid("money", json!("1250.00"));
    assert_invalid("money", json!(true));
}

#[test]
fn money_rejects_missing_fields() {
    assert_invalid("money", json!({"amount": "100.00"})); // missing currency
    assert_invalid("money", json!({"currency": "USD"})); // missing amount
    assert_invalid("money", json!({})); // empty object
}

#[test]
fn money_rejects_wrong_field_types() {
    // Numeric amount is accepted (Postel's Law) — only non-numeric/non-string fails
    assert_invalid("money", json!({"amount": true, "currency": "USD"})); // amount is boolean
    assert_invalid("money", json!({"amount": "100.00", "currency": 840})); // currency is number
}

#[test]
fn money_rejects_non_decimal_amount() {
    assert_invalid("money", json!({"amount": "abc", "currency": "USD"}));
    assert_invalid("money", json!({"amount": "", "currency": "USD"}));
    assert_invalid("money", json!({"amount": "twelve", "currency": "USD"}));
    assert_invalid("money", json!({"amount": "1e10", "currency": "USD"})); // scientific notation
    assert_invalid("money", json!({"amount": "Infinity", "currency": "USD"}));
}

#[test]
fn money_rejects_invalid_currency_format() {
    assert_invalid("money", json!({"amount": "100.00", "currency": "usd"})); // lowercase
    assert_invalid("money", json!({"amount": "100.00", "currency": "US"})); // too short
    assert_invalid("money", json!({"amount": "100.00", "currency": "USDX"})); // too long
    assert_invalid("money", json!({"amount": "100.00", "currency": "U$D"})); // non-alpha
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// attachment — { contentType: string, url|data: string }
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#[test]
fn attachment_accepts_valid_attachments() {
    assert_valid(
        "attachment",
        json!({"contentType": "application/pdf", "url": "https://example.com/doc.pdf"}),
    );
    assert_valid(
        "attachment",
        json!({"contentType": "image/png", "data": "iVBORw0KGgo="}),
    );
    assert_valid(
        "attachment",
        json!({"contentType": "text/plain", "url": "https://example.com/file.txt", "size": 1024}),
    );
}

#[test]
fn attachment_rejects_non_objects() {
    assert_invalid("attachment", json!("file.pdf"));
    assert_invalid("attachment", json!(42));
    assert_invalid("attachment", json!(true));
}

#[test]
fn attachment_rejects_missing_content_type() {
    assert_invalid("attachment", json!({"url": "https://example.com/doc.pdf"}));
}

#[test]
fn attachment_accepts_content_type_only() {
    // url/data completeness is a submission-level check, not a type check
    assert_valid("attachment", json!({"contentType": "application/pdf"}));
}

#[test]
fn attachment_validates_accept_mime_types() {
    let def = json!({
        "$formspec": "1.0",
        "url": "test://attachment-accept",
        "version": "1.0.0",
        "title": "Attachment Test",
        "items": [{
            "key": "photo",
            "type": "field",
            "dataType": "attachment",
            "label": "Photo",
            "accept": ["image/png", "image/jpeg"]
        }]
    });

    // Accepted type
    let mut data = HashMap::new();
    data.insert(
        "photo".to_string(),
        json!({"contentType": "image/png", "url": "https://example.com/photo.png"}),
    );
    let result = evaluate(&def, &data, &EvalOptions::default());
    let mismatches: Vec<_> = result
        .validations
        .iter()
        .filter(|r| r.code == "TYPE_MISMATCH")
        .collect();
    assert!(mismatches.is_empty(), "image/png should be accepted");

    // Rejected type
    data.insert(
        "photo".to_string(),
        json!({"contentType": "application/pdf", "url": "https://example.com/doc.pdf"}),
    );
    let result = evaluate(&def, &data, &EvalOptions::default());
    let mismatches: Vec<_> = result
        .validations
        .iter()
        .filter(|r| r.code == "TYPE_MISMATCH")
        .collect();
    assert!(
        !mismatches.is_empty(),
        "application/pdf should be rejected when only image types accepted"
    );
}

#[test]
fn attachment_accept_wildcard() {
    let def = json!({
        "$formspec": "1.0",
        "url": "test://attachment-wildcard",
        "version": "1.0.0",
        "title": "Attachment Wildcard Test",
        "items": [{
            "key": "file",
            "type": "field",
            "dataType": "attachment",
            "label": "File",
            "accept": ["image/*", "application/pdf"]
        }]
    });

    let mut data = HashMap::new();

    // Wildcard match
    data.insert(
        "file".to_string(),
        json!({"contentType": "image/webp", "url": "https://example.com/photo.webp"}),
    );
    let result = evaluate(&def, &data, &EvalOptions::default());
    let mismatches: Vec<_> = result
        .validations
        .iter()
        .filter(|r| r.code == "TYPE_MISMATCH")
        .collect();
    assert!(mismatches.is_empty(), "image/webp should match image/*");

    // Exact match
    data.insert(
        "file".to_string(),
        json!({"contentType": "application/pdf", "url": "https://example.com/doc.pdf"}),
    );
    let result = evaluate(&def, &data, &EvalOptions::default());
    let mismatches: Vec<_> = result
        .validations
        .iter()
        .filter(|r| r.code == "TYPE_MISMATCH")
        .collect();
    assert!(
        mismatches.is_empty(),
        "application/pdf should match exactly"
    );

    // No match
    data.insert(
        "file".to_string(),
        json!({"contentType": "text/plain", "url": "https://example.com/file.txt"}),
    );
    let result = evaluate(&def, &data, &EvalOptions::default());
    let mismatches: Vec<_> = result
        .validations
        .iter()
        .filter(|r| r.code == "TYPE_MISMATCH")
        .collect();
    assert!(
        !mismatches.is_empty(),
        "text/plain should not match image/* or application/pdf"
    );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Null values — never produce TYPE_MISMATCH (required check handles nulls)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#[test]
fn null_never_type_mismatches() {
    for dt in &[
        "string",
        "text",
        "integer",
        "decimal",
        "boolean",
        "date",
        "dateTime",
        "time",
        "uri",
        "choice",
        "multiChoice",
        "money",
        "attachment",
    ] {
        assert_valid(dt, json!(null));
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cross-type: every non-null wrong-type value should be caught
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/// For each dataType, verify that a representative set of wrong-type values
/// all produce TYPE_MISMATCH. This catches regressions where a new dataType
/// accidentally accepts values from another type family.
#[test]
fn cross_type_wrong_family_detection() {
    // Number given to string-family types
    for dt in &[
        "string", "text", "choice", "date", "dateTime", "time", "uri",
    ] {
        assert_invalid(dt, json!(42));
    }
    // String given to number-family types
    for dt in &["integer", "decimal"] {
        assert_invalid(dt, json!("hello"));
    }
    // Boolean given to everything except boolean
    for dt in &[
        "string", "text", "integer", "decimal", "date", "dateTime", "time", "uri", "choice",
    ] {
        assert_invalid(dt, json!(true));
    }
    // String given to composite types
    assert_invalid("multiChoice", json!("a"));
    assert_invalid("money", json!("100.00"));
    assert_invalid("attachment", json!("file.pdf"));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// optionSet — inline options validated via optionSet resolution
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#[test]
fn choice_with_option_set_validates_against_resolved_options() {
    // After optionSet resolution (done upstream), options are inlined on the field.
    // The evaluator validates against those inline options.
    let def = json!({
        "$formspec": "1.0",
        "url": "test://option-set",
        "version": "1.0.0",
        "title": "OptionSet Test",
        "items": [{
            "key": "country",
            "type": "field",
            "dataType": "choice",
            "label": "Country",
            "options": [
                { "value": "us", "label": "United States" },
                { "value": "gb", "label": "United Kingdom" },
                { "value": "ca", "label": "Canada" }
            ]
        }]
    });

    // Valid: value in options
    let mut data = HashMap::new();
    data.insert("country".to_string(), json!("us"));
    let result = evaluate(&def, &data, &EvalOptions::default());
    let mismatches: Vec<_> = result
        .validations
        .iter()
        .filter(|r| r.code == "TYPE_MISMATCH")
        .collect();
    assert!(
        mismatches.is_empty(),
        "valid option 'us' should not produce TYPE_MISMATCH"
    );

    // Invalid: value not in options
    data.insert("country".to_string(), json!("de"));
    let result = evaluate(&def, &data, &EvalOptions::default());
    let mismatches: Vec<_> = result
        .validations
        .iter()
        .filter(|r| r.code == "TYPE_MISMATCH")
        .collect();
    assert!(
        !mismatches.is_empty(),
        "invalid option 'de' should produce TYPE_MISMATCH"
    );
}

#[test]
fn choice_without_options_accepts_any_string() {
    // No options defined — accept any string (graceful degradation for unresolved optionSets)
    let def = def_with_field("country", "choice");
    let mut data = HashMap::new();
    data.insert("country".to_string(), json!("anything_goes"));
    let result = evaluate(&def, &data, &EvalOptions::default());
    let mismatches: Vec<_> = result
        .validations
        .iter()
        .filter(|r| r.code == "TYPE_MISMATCH")
        .collect();
    assert!(mismatches.is_empty(), "no options = accept any string");
}

#[test]
fn multichoice_with_options_validates_array_elements() {
    let def = json!({
        "$formspec": "1.0",
        "url": "test://multichoice-options",
        "version": "1.0.0",
        "title": "MultiChoice Options Test",
        "items": [{
            "key": "countries",
            "type": "field",
            "dataType": "multiChoice",
            "label": "Countries",
            "options": [
                { "value": "us", "label": "United States" },
                { "value": "gb", "label": "United Kingdom" }
            ]
        }]
    });

    // Valid: all values in options
    let mut data = HashMap::new();
    data.insert("countries".to_string(), json!(["us", "gb"]));
    let result = evaluate(&def, &data, &EvalOptions::default());
    let mismatches: Vec<_> = result
        .validations
        .iter()
        .filter(|r| r.code == "TYPE_MISMATCH")
        .collect();
    assert!(
        mismatches.is_empty(),
        "valid multiChoice should not produce TYPE_MISMATCH"
    );

    // Invalid: one value not in options
    data.insert("countries".to_string(), json!(["us", "de"]));
    let result = evaluate(&def, &data, &EvalOptions::default());
    let mismatches: Vec<_> = result
        .validations
        .iter()
        .filter(|r| r.code == "TYPE_MISMATCH")
        .collect();
    assert!(
        !mismatches.is_empty(),
        "multiChoice with invalid option 'de' should produce TYPE_MISMATCH"
    );
}

#[test]
fn choice_null_value_skips_validation() {
    let def = json!({
        "$formspec": "1.0",
        "url": "test://choice-null",
        "version": "1.0.0",
        "title": "Choice Null Test",
        "items": [{
            "key": "color",
            "type": "field",
            "dataType": "choice",
            "label": "Color",
            "options": [{ "value": "red", "label": "Red" }]
        }]
    });

    let data = HashMap::new(); // no value = null
    let result = evaluate(&def, &data, &EvalOptions::default());
    let mismatches: Vec<_> = result
        .validations
        .iter()
        .filter(|r| r.code == "TYPE_MISMATCH")
        .collect();
    assert!(
        mismatches.is_empty(),
        "null should never produce TYPE_MISMATCH"
    );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Bug fix tests — these should FAIL before fixes, PASS after
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Fix #2: dateTime must accept fractional seconds without timezone
#[test]
fn datetime_accepts_fractional_seconds_without_timezone() {
    assert_valid("dateTime", json!("2025-01-15T10:30:00.123"));
    assert_valid("dateTime", json!("2025-03-31T09:00:00.999999"));
}

// Fix #4: empty string on optional choice should NOT produce TYPE_MISMATCH
#[test]
fn choice_empty_string_skips_type_validation() {
    // An optional choice field with "" should not trigger TYPE_MISMATCH.
    // Empty string means "no selection" — same as null for type checking purposes.
    let def = json!({
        "$formspec": "1.0",
        "url": "test://choice-empty",
        "version": "1.0.0",
        "title": "Choice Empty String Test",
        "items": [{
            "key": "status",
            "type": "field",
            "dataType": "choice",
            "label": "Status",
            "options": [
                { "value": "active", "label": "Active" },
                { "value": "inactive", "label": "Inactive" }
            ]
        }]
    });

    let mut data = HashMap::new();
    data.insert("status".to_string(), json!(""));
    let result = evaluate(&def, &data, &EvalOptions::default());
    let mismatches: Vec<_> = result
        .validations
        .iter()
        .filter(|r| r.code == "TYPE_MISMATCH")
        .collect();
    assert!(
        mismatches.is_empty(),
        "empty string on optional choice should not produce TYPE_MISMATCH"
    );
}

#[test]
fn multichoice_empty_array_skips_type_validation() {
    // Empty array = no selections — should not produce TYPE_MISMATCH
    let def = json!({
        "$formspec": "1.0",
        "url": "test://multichoice-empty",
        "version": "1.0.0",
        "title": "MultiChoice Empty Array Test",
        "items": [{
            "key": "tags",
            "type": "field",
            "dataType": "multiChoice",
            "label": "Tags",
            "options": [
                { "value": "a", "label": "A" },
                { "value": "b", "label": "B" }
            ]
        }]
    });

    let mut data = HashMap::new();
    data.insert("tags".to_string(), json!([]));
    let result = evaluate(&def, &data, &EvalOptions::default());
    let mismatches: Vec<_> = result
        .validations
        .iter()
        .filter(|r| r.code == "TYPE_MISMATCH")
        .collect();
    assert!(
        mismatches.is_empty(),
        "empty array on multiChoice should not produce TYPE_MISMATCH"
    );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fix #1: maxLength must count characters, not bytes
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#[test]
fn extension_max_length_counts_characters_not_bytes() {
    // "你好世界" is 4 characters but 12 bytes in UTF-8.
    // maxLength: 10 should accept it (4 chars < 10).
    let def = json!({
        "$formspec": "1.0",
        "url": "test://maxlength-unicode",
        "version": "1.0.0",
        "title": "MaxLength Unicode Test",
        "items": [{
            "key": "name",
            "type": "field",
            "dataType": "string",
            "label": "Name",
            "extensions": { "x-test-maxlen": true }
        }]
    });

    let ext = vec![ExtensionConstraint {
        name: "x-test-maxlen".to_string(),
        display_name: Some("Name".to_string()),
        status: "stable".to_string(),
        pattern: None,
        max_length: Some(10),
        minimum: None,
        maximum: None,
        base_type: None,
        compatibility_version: None,
        deprecation_notice: None,
    }];

    let mut data = HashMap::new();
    data.insert("name".to_string(), json!("你好世界")); // 4 chars, 12 bytes
    let result = evaluate(&def, &data, &EvalOptions::default().trigger(EvalTrigger::Continuous).extension_constraints(ext.to_vec()));
    let max_len_errors: Vec<_> = result
        .validations
        .iter()
        .filter(|r| r.code == "MAX_LENGTH_EXCEEDED")
        .collect();
    assert!(
        max_len_errors.is_empty(),
        "4-character CJK string should pass maxLength: 10 (currently counts bytes: 12 > 10)"
    );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fix #3: extension validation results must use spec-valid enum values
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#[test]
fn extension_results_use_spec_valid_constraint_kind_and_source() {
    // Extension constraint results must use constraintKind from the spec enum
    // (required|type|cardinality|constraint|shape|external) and source from
    // (bind|shape|external). NOT "extension" for either.
    let def = json!({
        "$formspec": "1.0",
        "url": "test://ext-enum",
        "version": "1.0.0",
        "title": "Extension Enum Test",
        "items": [{
            "key": "email",
            "type": "field",
            "dataType": "string",
            "label": "Email",
            "extensions": { "x-test-pattern": true }
        }]
    });

    let ext = vec![ExtensionConstraint {
        name: "x-test-pattern".to_string(),
        display_name: Some("Email".to_string()),
        status: "stable".to_string(),
        pattern: Some(r"^[^@]+@[^@]+$".to_string()),
        max_length: None,
        minimum: None,
        maximum: None,
        base_type: None,
        compatibility_version: None,
        deprecation_notice: None,
    }];

    let mut data = HashMap::new();
    data.insert("email".to_string(), json!("not-an-email"));
    let result = evaluate(&def, &data, &EvalOptions::default().trigger(EvalTrigger::Continuous).extension_constraints(ext.to_vec()));
    let ext_results: Vec<_> = result
        .validations
        .iter()
        .filter(|r| r.code == "PATTERN_MISMATCH")
        .collect();
    assert!(!ext_results.is_empty(), "should produce PATTERN_MISMATCH");

    for r in &ext_results {
        assert_ne!(
            r.constraint_kind, "extension",
            "constraintKind must NOT be 'extension' — use a spec-valid enum value"
        );
        assert_ne!(
            r.source, "extension",
            "source must NOT be 'extension' — use a spec-valid enum value"
        );
        assert_eq!(
            r.constraint_kind, "constraint",
            "extension field constraints should use constraintKind 'constraint'"
        );
        assert_eq!(
            r.source, "external",
            "extension constraints should use source 'external'"
        );
    }
}

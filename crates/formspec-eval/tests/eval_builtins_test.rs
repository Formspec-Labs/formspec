//! Comprehensive tests for expression evaluator builtins in formspec-eval.

use std::collections::{HashMap, HashSet};
use fel_core::Value;
use formspec_eval::HostFelContext;
use rust_decimal::Decimal;
use serde_json::json;

fn make_eval_context(values_json: serde_json::Value) -> HostFelContext {
    let mut ctx = HostFelContext::new(HashMap::new(), HashSet::new());
    let snapshot = json!({
        "values": values_json,
        "mips": {},
        "repeatCounts": {},
        "variables": {
            "#": {
                "taxRate": 0.08,
                "baseFee": 50
            }
        },
        "locale": "en-US",
        "dateFormats": {
            "short": "yyyy-MM-dd"
        }
    });
    ctx.load(snapshot.as_object().unwrap()).unwrap();
    ctx
}

#[test]
fn test_math_builtins() {
    let ctx = make_eval_context(json!({
        "cost": -125.75,
        "quantity": 4,
        "ratio": 3.14159
    }));

    // abs
    let res = ctx.evaluate("abs($cost)", "cost", false, None, None).unwrap();
    assert_eq!(res.value, Value::Number(Decimal::new(12575, 2)));

    // round
    let res = ctx.evaluate("round($ratio, 2)", "ratio", false, None, None).unwrap();
    assert_eq!(res.value, Value::Number(Decimal::new(314, 2)));

    // ceil & floor
    let res = ctx.evaluate("ceil(3.2)", "", false, None, None).unwrap();
    assert_eq!(res.value, Value::Number(Decimal::from(4)));
    let res = ctx.evaluate("floor(3.8)", "", false, None, None).unwrap();
    assert_eq!(res.value, Value::Number(Decimal::from(3)));

    // min & max
    let res = ctx.evaluate("min(10, 20, 5, 30)", "", false, None, None).unwrap();
    assert_eq!(res.value, Value::Number(Decimal::from(5)));
    let res = ctx.evaluate("max(10, 20, 5, 30)", "", false, None, None).unwrap();
    assert_eq!(res.value, Value::Number(Decimal::from(30)));
}

#[test]
fn test_string_builtins() {
    let ctx = make_eval_context(json!({
        "firstName": "  Grace  ",
        "lastName": "Hopper",
        "code": "US-Gov-42"
    }));

    // trim
    let res = ctx.evaluate("trim($firstName)", "firstName", false, None, None).unwrap();
    assert_eq!(res.value, Value::String("Grace".to_string()));

    // length
    let res = ctx.evaluate("length(trim($firstName))", "firstName", false, None, None).unwrap();
    assert_eq!(res.value, Value::Number(Decimal::from(5)));

    // lower & upper
    let res = ctx.evaluate("lower($lastName)", "lastName", false, None, None).unwrap();
    assert_eq!(res.value, Value::String("hopper".to_string()));
    let res = ctx.evaluate("upper($lastName)", "lastName", false, None, None).unwrap();
    assert_eq!(res.value, Value::String("HOPPER".to_string()));

    // string concatenation via & operator
    let res = ctx.evaluate("trim($firstName) & ' ' & $lastName", "", false, None, None).unwrap();
    assert_eq!(res.value, Value::String("Grace Hopper".to_string()));

    // contains, startsWith, endsWith
    let res = ctx.evaluate("contains($code, 'Gov')", "code", false, None, None).unwrap();
    assert_eq!(res.value, Value::Boolean(true));
    let res = ctx.evaluate("startsWith($code, 'US')", "code", false, None, None).unwrap();
    assert_eq!(res.value, Value::Boolean(true));
    let res = ctx.evaluate("endsWith($code, '42')", "code", false, None, None).unwrap();
    assert_eq!(res.value, Value::Boolean(true));
}

#[test]
fn test_logic_and_conditional_builtins() {
    let ctx = make_eval_context(json!({
        "score": 85,
        "optIn": true,
        "middleName": null
    }));

    // if / conditional
    let res = ctx.evaluate("if($score >= 70, 'Pass', 'Fail')", "score", false, None, None).unwrap();
    assert_eq!(res.value, Value::String("Pass".to_string()));

    // boolean operators
    let res = ctx.evaluate("$score > 50 and $optIn", "", false, None, None).unwrap();
    assert_eq!(res.value, Value::Boolean(true));
    let res = ctx.evaluate("not $optIn or $score < 90", "", false, None, None).unwrap();
    assert_eq!(res.value, Value::Boolean(true));

    // coalesce
    let res = ctx.evaluate("coalesce($middleName, 'N/A')", "middleName", false, None, None).unwrap();
    assert_eq!(res.value, Value::String("N/A".to_string()));
}

#[test]
fn test_date_and_time_builtins() {
    let ctx = make_eval_context(json!({
        "birthDate": "1990-05-15"
    }));

    let fixed_now = "2026-10-23T04:30:00Z";
    let res = ctx.evaluate("year(date('1990-05-15'))", "", false, Some(fixed_now), None).unwrap();
    assert_eq!(res.value, Value::Number(Decimal::from(1990)));

    let res = ctx.evaluate("month(date('1990-05-15'))", "", false, Some(fixed_now), None).unwrap();
    assert_eq!(res.value, Value::Number(Decimal::from(5)));

    let res = ctx.evaluate("day(date('1990-05-15'))", "", false, Some(fixed_now), None).unwrap();
    assert_eq!(res.value, Value::Number(Decimal::from(15)));
}

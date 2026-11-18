//! Filed Response comparison against evaluator output and the shared parity fixture.

use formspec_eval::exact_json::Value;
use formspec_eval::{EvalOptions, evaluate, filed_response_data_matches};

fn parse(json: &str) -> Value {
    serde_json::from_str(json).unwrap()
}

#[test]
fn filed_response_data_agrees_with_shared_empty_repeat_fixture() {
    // shared_suite_parity_guard independently checks noInvention for this same case.
    let case = parse(include_str!(
        "../../../tests/conformance/suite/response-data-empty-repeats.json"
    ));
    let definition = parse(include_str!(
        "../../../tests/conformance/suite/fixtures/response-data.definition.json"
    ));
    let filed = &case["inputData"];
    let fields = filed.as_object().unwrap().clone().into_iter().collect();
    let result = evaluate(&definition, &fields, &EvalOptions::default());
    assert_eq!(result.data, case["expected"]["data"]);
    assert!(filed_response_data_matches(
        &definition,
        filed,
        &result.data
    ));
}

#[test]
fn filed_response_data_allows_empty_repeats_in_existing_rows() {
    let definition = parse(
        r#"{"items":[{"key":"outer","type":"group","repeatable":true,"children":[
            {"key":"group","type":"group","children":[
                {"key":"inner","type":"group","repeatable":true,"children":[
                    {"key":"answer","type":"field","dataType":"string"}
                ]}
            ]}
        ]}]}"#,
    );
    let filed = parse(r#"{"outer":[{}, {"group":{"inner":[{"answer":"filed"}]}}]}"#);
    let fields = filed.as_object().unwrap().clone().into_iter().collect();
    let result = evaluate(&definition, &fields, &EvalOptions::default());
    assert_eq!(
        result.data,
        parse(r#"{"outer":[{"group":{"inner":[]}}, {"group":{"inner":[{"answer":"filed"}]}}]}"#)
    );
    assert!(filed_response_data_matches(
        &definition,
        &filed,
        &result.data
    ));
}

#[test]
fn filed_response_data_follows_dependent_fields_at_the_enclosing_object() {
    let definition = parse(
        r#"{"items":[{"key":"control","type":"field","dataType":"integer","children":[
            {"key":"rows","type":"group","repeatable":true,"children":[
                {"key":"answer","type":"field","dataType":"string"}
            ]}
        ]}]}"#,
    );
    let filed = parse(r#"{"control":4}"#);
    let fields = filed.as_object().unwrap().clone().into_iter().collect();
    let result = evaluate(&definition, &fields, &EvalOptions::default());
    assert_eq!(result.data, parse(r#"{"control":4,"rows":[]}"#));
    assert!(filed_response_data_matches(
        &definition,
        &filed,
        &result.data
    ));
}

#[test]
fn filed_response_data_requires_the_filed_calculated_value() {
    let definition = parse(
        r#"{"items":[{"key":"g","type":"group","children":[
            {"key":"amount","type":"field","dataType":"integer"},
            {"key":"rows","type":"group","repeatable":true,"children":[]}
        ]}],"binds":[{"path":"g.amount","calculate":"42"}]}"#,
    );
    let filed = parse("{}");
    let result = evaluate(&definition, &Default::default(), &EvalOptions::default());
    assert_eq!(result.data, parse(r#"{"g":{"amount":42,"rows":[]}}"#));
    assert!(!filed_response_data_matches(
        &definition,
        &filed,
        &result.data
    ));
    for computed in [42, 41] {
        let filed = parse(&format!(r#"{{"g":{{"amount":{computed}}}}}"#));
        assert_eq!(
            filed_response_data_matches(&definition, &filed, &result.data),
            computed == 42
        );
    }
}

#[test]
fn filed_response_data_refuses_other_structural_differences() {
    let definition = parse(
        r#"{"items":[{"key":"g","type":"group","children":[
            {"key":"amount","type":"field","dataType":"integer"},
            {"key":"rows","type":"group","repeatable":true,"children":[
                {"key":"nested","type":"group","repeatable":true,"children":[
                    {"key":"answer","type":"field","dataType":"string"}
                ]}
            ]}
        ]}]}"#,
    );
    for (filed, projected) in [
        (r#"{"g":{"amount":42}}"#, r#"{"g":{"rows":[]}}"#),
        (r#"{}"#, r#"{"g":{}}"#),
        (r#"{}"#, r#"{"g":{"extra":[],"rows":[]}}"#),
        (r#"{}"#, r#"{"g":{"amount":[]}}"#),
        (r#"{}"#, r#"{"g":{"rows":[{}]}}"#),
        (r#"{}"#, r#"{"g":{"rows":[{"nested":[]}]}}"#),
        (r#"{"g":{"rows":[]}}"#, r#"{"g":{"rows":[{}]}}"#),
        (
            r#"{"g":{"rows":[{}]}}"#,
            r#"{"g":{"rows":[{"nested":[]},{}]}}"#,
        ),
        (r#"{"g":{"rows":[{}]}}"#, r#"{"g":{"rows":[]}}"#),
        (r#"{"g":{"rows":null}}"#, r#"{"g":{"rows":[]}}"#),
        (r#"{"g":null}"#, r#"{"g":{"rows":[]}}"#),
    ] {
        assert!(
            !filed_response_data_matches(&definition, &parse(filed), &parse(projected)),
            "filed {filed}, projected {projected}"
        );
    }
}

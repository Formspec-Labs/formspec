//! Public native entry points preserve exact values or refuse unsupported arithmetic.
use fel_core::exact_json::{self, native_json as json};
use formspec_eval::{
    AnswerInput, AnswerState, EvalOptions, HostFelContext, evaluate, evaluate_screener_document,
    extension_constraints_from_registry_documents,
};
use std::collections::HashMap;

#[test]
fn native_context_and_screener_refuse_unsupported_numbers() {
    let value = exact_json::from_str("1e-100").unwrap();
    let mut context = HostFelContext::new(Default::default(), Default::default());
    let snapshot = exact_json::from_str(r#"{"values":{"x":1e-100}}"#).unwrap();
    assert!(
        context
            .load(snapshot.as_object().unwrap())
            .unwrap_err()
            .contains("precision or range")
    );
    let answers = HashMap::from([(
        "x".to_owned(),
        AnswerInput {
            value,
            state: AnswerState::Answered,
        },
    )]);
    assert!(
        evaluate_screener_document(&json!({}), &answers, None, None)
            .unwrap_err()
            .contains("precision or range")
    );
}

#[test]
fn registry_limit_compares_adjacent_exact_decimals() {
    let definition = json!({"items":[{"key":"x","type":"field","dataType":"decimal","extensions":{"x-limit":true}}]});
    let registry = exact_json::from_str(r#"{"entries":[{"name":"x-limit","baseType":"decimal","constraints":{"minimum":0.3333333333333333333333333334}}]}"#).unwrap();
    let data = HashMap::from([(
        "x".to_owned(),
        exact_json::from_str("0.3333333333333333333333333333").unwrap(),
    )]);
    let options = EvalOptions::default()
        .extension_constraints(extension_constraints_from_registry_documents(&[registry]));
    let result = evaluate(&definition, &data, &options);
    assert_eq!(result.validations.len(), 1);
    assert_eq!(result.validations[0].code, "RANGE_UNDERFLOW");
    assert_eq!(
        result.data.to_string(),
        r#"{"x":0.3333333333333333333333333333}"#
    );
}

#[test]
fn dependent_fields_round_trip_next_to_their_scalar_parent() {
    let definition = json!({"items":[{"key":"g","type":"group","children":[
        {"key":"kind","type":"field","dataType":"string","children":[
            {"key":"amount","type":"field","dataType":"decimal"}
        ]}
    ]}]});
    let data = HashMap::from([
        ("g.kind".to_owned(), json!("example")),
        (
            "g.kind.amount".to_owned(),
            exact_json::from_str("0.3333333333333333333333333333").unwrap(),
        ),
    ]);
    let result = evaluate(&definition, &data, &EvalOptions::default());
    assert_eq!(
        result.data.to_string(),
        r#"{"g":{"kind":"example","amount":0.3333333333333333333333333333}}"#
    );
    let reloaded = result
        .data
        .as_object()
        .unwrap()
        .iter()
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    let next = evaluate(&definition, &reloaded, &EvalOptions::default());
    assert_eq!(next.data, result.data);
    assert!(next.validations.is_empty());
}

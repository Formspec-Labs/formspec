//! Verify the evaluator's basis functions against Core's pinned byte vectors.

use std::collections::{BTreeMap, HashMap};

use formspec_eval::exact_json::Value;
use formspec_eval::explanations::{
    ExplanationFinding, ExplanationMode, group_basis, instance_basis, reference_digest,
};
use formspec_eval::{EvalOptions, EvalTrigger, evaluate};

#[test]
fn exact_resolved_references_produce_both_wire_bases() {
    let vectors: serde_json::Value = serde_json::from_str(include_str!(
        "../../../tests/conformance/fixtures/explanations/basis-vectors.json"
    ))
    .unwrap();
    let mut digests = BTreeMap::new();
    for (key, vector) in vectors["refDigests"].as_object().unwrap() {
        let value: Value = serde_json::from_str(vector["json"].as_str().unwrap()).unwrap();
        let digest = reference_digest(&value).unwrap();
        assert_eq!(digest, vector["digest"]);
        digests.insert(key.as_str(), digest);
    }
    let inputs = |pairs: &serde_json::Value| -> BTreeMap<String, String> {
        pairs
            .as_array()
            .unwrap()
            .iter()
            .rev()
            .map(|pair| {
                let key = pair[0].as_str().unwrap();
                (key.to_owned(), digests[key].clone())
            })
            .collect()
    };
    let instance = &vectors["instance"]["input"];
    assert_eq!(
        instance_basis(
            instance["shapeId"].as_str().unwrap(),
            instance["path"].as_str().unwrap(),
            &inputs(&instance["inputs"])
        )
        .unwrap(),
        vectors["instance"]["digest"]
    );

    let group = &vectors["group"]["input"];
    let code = group["code"].as_str().unwrap();
    let firings = group["firings"]
        .as_array()
        .unwrap()
        .iter()
        .rev()
        .map(|row| ExplanationFinding {
            code: code.to_owned(),
            mode: ExplanationMode::Acknowledge,
            shape_id: row[0].as_str().unwrap().to_owned(),
            path: row[1].as_str().unwrap().to_owned(),
            inputs: inputs(&row[2]),
        })
        .collect::<Vec<_>>();
    assert_eq!(
        group_basis(code, firings.iter()).unwrap(),
        vectors["group"]["digest"]
    );

    for case in vectors["evaluatedCases"].as_array().unwrap() {
        let name = case["name"].as_str().unwrap();
        let definition: Value = serde_json::from_str(&case["definition"].to_string()).unwrap();
        let data: HashMap<String, Value> = serde_json::from_str(&case["data"].to_string()).unwrap();
        let report = evaluate(
            &definition,
            &data,
            &EvalOptions::new().trigger(EvalTrigger::Submit),
        );
        assert_eq!(
            report.explanation_actions.len(),
            1,
            "case {name}: actions={:?}, validations={:?}",
            report.explanation_actions,
            report.validations
        );
        let action = &report.explanation_actions[0];
        let expected = &case["expectedInstance"];
        assert_eq!(
            action["shapeId"].as_str(),
            expected["input"]["shapeId"].as_str(),
            "case {name}"
        );
        assert_eq!(
            action["path"].as_str(),
            expected["input"]["path"].as_str(),
            "case {name}"
        );
        assert_eq!(
            action["basis"].as_str(),
            expected["digest"].as_str(),
            "case {name}"
        );
        let expected_inputs: BTreeMap<String, String> = expected["input"]["inputs"]
            .as_array()
            .unwrap()
            .iter()
            .map(|pair| {
                (
                    pair[0].as_str().unwrap().to_owned(),
                    pair[1].as_str().unwrap().to_owned(),
                )
            })
            .collect();
        let actual_inputs: BTreeMap<String, String> = action["inputs"]
            .as_object()
            .unwrap()
            .iter()
            .map(|(k, v)| (k.clone(), v.as_str().unwrap().to_owned()))
            .collect();
        assert_eq!(actual_inputs, expected_inputs, "case {name}");
    }
    let shifted_before = vectors["evaluatedCases"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["name"] == "shiftedRepeatRowBefore")
        .unwrap()["expectedInstance"]["digest"]
        .as_str()
        .unwrap();
    let shifted_after = vectors["evaluatedCases"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["name"] == "shiftedRepeatRowAfter")
        .unwrap()["expectedInstance"]["digest"]
        .as_str()
        .unwrap();
    assert_ne!(shifted_before, shifted_after);
}

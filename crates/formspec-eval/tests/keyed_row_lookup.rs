use std::collections::HashMap;

use fel_core::exact_json::{self, Value, native_json as json};
use formspec_eval::{EvalOptions, eval_context_from_json_object, evaluate};

#[test]
fn keyed_row_lookup_calculates_from_the_current_subject() {
    let definition = exact_json::from_str(include_str!(
        "../../../tests/conformance/suite/fixtures/fel-keyed-row-subject.definition.json"
    ))
    .unwrap();
    let wire = json!({"subjectType": "urn:example:agency", "subjectKeys": {"id": "A"}});
    let context = eval_context_from_json_object(wire.as_object().unwrap()).unwrap();
    for source in [
        include_str!("../../../tests/conformance/suite/fel-keyed-row-unique.json"),
        include_str!("../../../tests/conformance/suite/fel-keyed-row-missing.json"),
        include_str!("../../../tests/conformance/suite/fel-keyed-row-duplicate.json"),
        include_str!("../../../tests/conformance/suite/fel-keyed-row-unavailable.json"),
    ] {
        let case: Value = exact_json::from_str(source).unwrap();
        let instance = case["inputData"]
            .get("rows")
            .map_or(Value::Null, |rows| json!({ "rows": rows }));
        let options = EvalOptions::new()
            .context(context.clone())
            .instances(HashMap::from([("agencies".into(), instance)]));
        let result = evaluate(&definition, &HashMap::new(), &options);
        assert_eq!(
            result.values.get("name").unwrap_or(&Value::Null),
            &case["expected"]["value"],
            "{}",
            case["id"]
        );
    }
}

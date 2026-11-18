//! Whole-Definition FEL syntax checks include text, seeds, fees, and migrations.

use formspec_lint::{LintCode, lint};
use serde_json::json;
use std::collections::BTreeSet;

#[test]
fn each_authored_expression_is_checked_at_its_own_path() {
    let definition = json!({
        "$formspec": "1.0", "url": "urn:test:fel-sites", "version": "2.0.0",
        "status": "draft", "title": "FEL sites",
        "items": [{"key":"x", "type":"field", "dataType":"string", "initialValue":"=1 +",
                   "label":"Escaped {{{{literal}} and {{1 +}}", "hint":"Unclosed {{1",
                   "description":"Literal {{{{1 +" }],
        "binds": [{"path":"x", "constraint":"true", "constraintMessage":"{{}}"}],
        "shapes": [{"id":"s", "target":"x", "constraint":"true", "message":"{{1 +}}"}],
        "fees":{"lineItems":[{"id":"fee", "label":"Fee", "calculate":"1 +"}]},
        "migrations":{"from":{"1.0.0":{"fieldMap":[
            {"source":"old", "target":"x", "transform":"expression", "expression":"1 +"}
        ]}}}
    });
    let result = lint(&definition);
    let paths: BTreeSet<_> = result
        .diagnostics
        .iter()
        .filter(|finding| finding.code == LintCode::E400)
        .map(|finding| finding.path.as_str())
        .collect();
    assert_eq!(
        paths,
        BTreeSet::from([
            "$.binds[0].constraintMessage",
            "$.fees.lineItems[0].calculate",
            "$.items[0].hint",
            "$.items[0].initialValue",
            "$.items[0].label",
            "$.shapes[0].message",
            r#"$.migrations.from["1.0.0"].fieldMap[0].expression"#,
        ]),
        "{:#?}",
        result.diagnostics
    );
}

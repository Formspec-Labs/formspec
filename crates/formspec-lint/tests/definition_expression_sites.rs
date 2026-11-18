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

#[test]
fn draft_resolution_uses_definition_scope_and_mapping_bindings() {
    let definition = json!({"items":[{
        "key":"rows","type":"group","repeatable":true,"children":[
            {"key":"cost","type":"field","dataType":"decimal"}
        ]
    }]});
    let inspect = |source: &str, target: Option<&str>, mapping| {
        formspec_lint::analyze_expression_in_definition(&definition, source, &[], target, mapping)
    };
    let source = "$cost + @source + custom(1)";
    let issues = |analysis: serde_json::Value| -> Vec<(String, String)> {
        analysis["findings"]
            .as_array()
            .unwrap()
            .iter()
            .map(|f| {
                (
                    f["code"].as_str().unwrap().to_owned(),
                    f["name"].as_str().unwrap().to_owned(),
                )
            })
            .collect()
    };
    assert_eq!(
        issues(inspect(source, Some("rows[0].cost"), true)),
        [("E401".to_owned(), "custom".to_owned()),]
    );
    assert_eq!(
        issues(inspect(source, Some(""), false)),
        [
            ("E401".to_owned(), "custom".to_owned()),
            ("E402".to_owned(), "cost".to_owned()),
            ("E403".to_owned(), "source".to_owned()),
        ]
    );
    assert_eq!(issues(inspect(source, None, false)).len(), 1);
    let malformed = inspect("1 +", None, false);
    assert_eq!(malformed["valid"], false);
    assert!(malformed["errors"][0]["message"].is_string());
}

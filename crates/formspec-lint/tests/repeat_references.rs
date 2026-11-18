//! E304 coverage for Definition expressions and Component guards.

use formspec_lint::{LintCode, LintDiagnostic, LintOptions, lint, lint_with_options};
use serde_json::{Value, json};

fn definition() -> Value {
    json!({
        "$formspec": "1.0",
        "url": "urn:test:repeat-references",
        "version": "1.0.0",
        "status": "draft",
        "title": "Repeat reference checks",
        "items": [
            { "key": "name", "type": "field", "dataType": "string", "label": "Name" },
            { "key": "applicant", "type": "group", "label": "Applicant",
              "children": [{ "key": "first", "type": "field", "dataType": "string", "label": "First" }] },
            { "key": "rows", "type": "group", "label": "Rows", "repeatable": true,
              "children": [{ "key": "amount", "type": "field", "dataType": "decimal", "label": "Amount" }] }
        ]
    })
}

fn component(children: Value) -> Value {
    json!({
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "urn:test:repeat-references" },
        "tree": { "component": "Stack", "children": children }
    })
}

fn with_definition() -> LintOptions {
    LintOptions {
        definition_document: Some(definition()),
        ..Default::default()
    }
}

fn coded(diagnostics: &[LintDiagnostic], code: LintCode) -> Vec<String> {
    diagnostics
        .iter()
        .filter(|diagnostic| diagnostic.code == code)
        .map(|diagnostic| diagnostic.path.clone())
        .collect()
}

#[test]
fn unsubscripted_repeat_paths_are_e304_in_definition_expressions() {
    let mut document = definition();
    document["items"][0]["initialValue"] = json!("=sum(rows.amount)");
    document["items"][0]["label"] = json!("Total {{sum($rows.amount)}}");
    document["items"][1]["children"].as_array_mut().unwrap().push(json!({
        "key": "accounts", "type": "group", "label": "Accounts", "repeatable": true,
        "children": [{ "key": "balance", "type": "field", "dataType": "decimal", "label": "Balance" }]
    }));
    document["items"][2]["children"]
        .as_array_mut()
        .unwrap()
        .push(json!({
            "key": "detail", "type": "group", "label": "Details", "repeatable": true,
            "children": [{ "key": "cost", "type": "field", "dataType": "decimal", "label": "Cost" }]
        }));
    document["binds"] = json!([
        { "path": "name", "calculate": "sum($applicant.accounts.balance)",
          "constraintMessage": "Limit {{sum($rows[*].detail.cost)}}" },
        { "path": "rows[*].amount", "constraint": "$ >= sum(detail.cost)" }
    ]);
    document["shapes"] = json!([{
        "id": "limit", "target": "rows[*].amount", "constraint": "$ > 0",
        "activeWhen": "count($rows.amount) > 0", "message": "Limit {{sum($rows.amount)}}",
        "context": { "limit": "sum($detail.cost)" }
    }]);
    document["variables"] = json!([
        { "name": "rowTotal", "scope": "rows", "expression": "sum(detail.cost)" }
    ]);
    let mut found = coded(&lint(&document).diagnostics, LintCode::E304);
    found.sort();
    assert_eq!(
        found,
        [
            "$.binds[0].calculate",
            "$.binds[0].constraintMessage",
            "$.binds[1].constraint",
            "$.items[0].initialValue",
            "$.items[0].label",
            "$.shapes[0].activeWhen",
            "$.shapes[0].context.limit",
            "$.shapes[0].message",
            "$.variables[0].expression",
        ]
    );
}

#[test]
fn valid_repeat_reference_spellings_are_clean() {
    let mut document = definition();
    document["items"][0]["label"] = json!("Literal {{{{ $rows.amount }}");
    document["binds"] = json!([
        { "path": "rows[*].amount", "constraint": "$amount = @current.amount" },
        { "path": "name", "calculate": "sum($rows[*].amount) + $rows[1].amount + count($rows) + $rows[0].amount" }
    ]);
    document["variables"] = json!([
        { "name": "first", "expression": "$applicant.first" },
        { "name": "local", "expression": "let rows = {amount: 1} in rows.amount" },
        { "name": "literal", "expression": "'$rows.amount'" }
    ]);
    assert!(coded(&lint(&document).diagnostics, LintCode::E304).is_empty());
}

#[test]
fn unsubscripted_repeat_paths_are_e304_in_component_guards() {
    let mut document = component(json!([
        { "component": "Text", "text": "Shown", "when": "rows.amount > 0" },
        { "component": "Text", "text": "Valid", "when": "$rows[1].amount > 0" }
    ]));
    document["components"] = json!({
        "Notice": { "tree": { "component": "Stack", "when": "$rows.amount > 0", "children": [] } }
    });
    let mut found = coded(
        &lint_with_options(&document, &with_definition()).diagnostics,
        LintCode::E304,
    );
    found.sort();
    assert_eq!(
        found,
        ["$.components.Notice.tree.when", "$.tree.children[0].when"]
    );
    assert!(coded(&lint(&document).diagnostics, LintCode::E304).is_empty());
}

#[test]
fn repeat_guard_uses_the_incoming_group_and_the_template_call_site() {
    let mut options = with_definition();
    options.definition_document.as_mut().unwrap()["items"][2]["children"]
        .as_array_mut()
        .unwrap()
        .push(json!({
            "key": "detail", "type": "group", "label": "Detail", "repeatable": true,
            "children": [{ "key": "cost", "type": "field", "dataType": "decimal", "label": "Cost" }]
        }));
    let mut document = component(json!([
        { "component": "Accordion", "bind": "rows", "when": "$detail.cost > 0", "children": [
            { "component": "Text", "text": "Local", "when": "$detail.cost > 0" },
            { "component": "Text", "text": "Current", "when": "@current.detail.cost > 0" },
            { "component": "Notice" }, { "component": "Notice" }
        ] },
        { "component": "Text", "text": "Root", "when": "$detail.cost > 0" }
    ]));
    document["components"] = json!({ "Notice": { "tree": {
        "component": "Stack", "when": "$detail.cost > 0", "children": []
    } } });

    let mut found = coded(
        &lint_with_options(&document, &options).diagnostics,
        LintCode::E304,
    );
    found.sort();
    assert_eq!(
        found,
        [
            "$.components.Notice.tree.when",
            "$.tree.children[0].children[0].when",
            "$.tree.children[0].children[1].when",
        ]
    );
}

#[test]
fn repeat_guard_ignores_invalid_group_bindings() {
    let mut options = with_definition();
    let definition = options.definition_document.as_mut().unwrap();
    for (index, key, field) in [(1, "accounts", "balance"), (2, "detail", "cost")] {
        definition["items"][index]["children"].as_array_mut().unwrap().push(json!({
            "key": key, "type": "group", "label": key, "repeatable": true,
            "children": [{ "key": field, "type": "field", "dataType": "decimal", "label": field }]
        }));
    }
    let document = component(json!([
        { "component": "Stack", "bind": "rows", "children": [
            { "component": "Text", "text": "Layout", "when": "$detail.cost > 0" }
        ] },
        { "component": "Accordion", "bind": "applicant", "children": [
            { "component": "Text", "text": "Ordinary group", "when": "$accounts.balance > 0" },
            { "component": "Text", "text": "Root reference", "when": "$rows.amount > 0" }
        ] }
    ]));

    let diagnostics = lint_with_options(&document, &options).diagnostics;
    assert_eq!(coded(&diagnostics, LintCode::W801), ["$.tree.children[0]"]);
    assert_eq!(coded(&diagnostics, LintCode::W800), ["$.tree.children[1]"]);
    assert_eq!(
        coded(&diagnostics, LintCode::E304),
        ["$.tree.children[1].children[1].when"]
    );
}

#[test]
fn repeat_reference_anchored_at_current_row_requires_a_subscript() {
    let mut document = definition();
    document["items"][2]["children"]
        .as_array_mut()
        .unwrap()
        .push(json!({
            "key": "detail", "type": "group", "label": "Details", "repeatable": true,
            "children": [{ "key": "cost", "type": "field", "dataType": "decimal", "label": "Cost" }]
        }));
    document["binds"] = json!([
        { "path": "rows[*].amount", "constraint": "sum(@current.detail.cost) > 0" },
        { "path": "rows[*].amount", "readonly": "sum(@current.detail[*].cost) > 0" }
    ]);
    assert_eq!(
        coded(&lint(&document).diagnostics, LintCode::E304),
        ["$.binds[0].constraint"]
    );
}

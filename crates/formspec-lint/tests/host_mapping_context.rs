//! Host input representation preserves genuine Definition path semantics.
use formspec_lint::{LintOptions, MappingSourceContext, lint_with_options};
use serde_json::{Value, json};

fn definition() -> Value {
    json!({"$formspec":"1.0","url":"urn:test:definition","version":"1.0.0","status":"draft","title":"Genuine input","binds":[{"path":"name","required":"true"}],
        "items":[{"key":"name","type":"field","dataType":"string","label":"Name"},
            {"key":"people","type":"group","label":"People","repeatable":true,"children":[{"key":"age","type":"field","dataType":"integer","label":"Age"}]}]})
}
fn mapping(path: &str) -> Value {
    json!({"$formspecMapping":"1.0","version":"1.0.0","definitionRef":"urn:test:definition","definitionVersion":"1.0.0",
        "targetSchema":{"format":"json"},"rules":[{"sourcePath":path,"targetPath":"result","transform":"preserve"}]})
}
fn options() -> LintOptions {
    LintOptions {
        definition_document: Some(definition()),
        mapping_source_context: Some(MappingSourceContext {
            schema: json!({"type":"object","properties":{"response":{"type":"object","properties":{"data":{"type":"object"}}},"host":{"type":"object","properties":{"reference":{"type":"string"}}}}}),
            data_path: "response.data".into(),
        }),
        ..Default::default()
    }
}
#[test]
fn host_metadata_and_genuine_definition_paths_use_their_own_owners() {
    let options = options();
    for path in [
        "host.reference",
        "response.data",
        "response.data.name",
        "response.data.people[0].age",
        "response.data.people[*].age",
        "response.data.people.age",
    ] {
        let report = lint_with_options(&mapping(path), &options);
        assert!(report.valid, "{path}: {report:?}");
    }
    for path in [
        "host.missing",
        "response.data.missing",
        "response.data.people[*].missing",
        "response.database.name",
    ] {
        let report = lint_with_options(&mapping(path), &options);
        assert!(!report.valid, "{path}");
        assert!(
            report
                .diagnostics
                .iter()
                .any(|d| d.path == "$.rules[0].sourcePath"),
            "{report:?}"
        );
    }
    let mut nested = mapping("response.data.people");
    nested["rules"][0]["array"] = json!({"mode":"each","innerRules":[{"sourcePath":"age","targetPath":"age","transform":"preserve"}]});
    let report = lint_with_options(&nested, &options);
    assert!(report.valid, "{report:?}");
    nested["rules"][0]["array"]["innerRules"][0]["sourcePath"] = json!("missing");
    let report = lint_with_options(&nested, &options);
    assert!(
        report
            .diagnostics
            .iter()
            .any(|d| d.path == "$.rules[0].array.innerRules[0].sourcePath"),
        "{report:?}"
    );
    let mut projection = mapping("response.data.name");
    projection["rules"][0]["projection"] =
        json!({"required":true,"sourcePaths":["response.data.name"]});
    let report = lint_with_options(&projection, &options);
    assert!(report.valid, "{report:?}");
    projection["rules"][0]["projection"]["required"] = json!(false);
    let report = lint_with_options(&projection, &options);
    assert!(
        report
            .diagnostics
            .iter()
            .any(|d| format!("{:?}", d.code) == "E1113"
                && d.path == "$.rules[0].projection.required"),
        "{report:?}"
    );
    projection["rules"][0]["projection"]["required"] = json!(true);
    projection["rules"][0]["projection"]["sourcePaths"] = json!(["host.missing"]);
    assert!(!lint_with_options(&projection, &options).valid);
}
#[test]
fn absent_definition_invalid_context_and_external_association_refuse_qualification() {
    let mut options = options();
    options.definition_document = None;
    assert!(!lint_with_options(&mapping("host.reference"), &options).valid);
    options.definition_document = Some(definition());
    for (field, value) in [
        ("definitionRef", "urn:foreign"),
        ("definitionVersion", "2.0.0"),
    ] {
        let mut foreign = mapping("host.reference");
        foreign[field] = json!(value);
        let report = lint_with_options(&foreign, &options);
        assert!(
            report
                .diagnostics
                .iter()
                .any(|d| d.path == format!("$.{field}")),
            "{report:?}"
        );
    }
    options.mapping_source_context.as_mut().unwrap().data_path = "missing.data".into();
    assert!(!lint_with_options(&mapping("host.reference"), &options).valid);
    let mut external = mapping("host.reference");
    external.as_object_mut().unwrap().remove("definitionRef");
    external
        .as_object_mut()
        .unwrap()
        .remove("definitionVersion");
    external["sourceSchema"] = json!({"url":"urn:external","version":"1.0.0","schema":{"type":"object","properties":{"host":{"type":"object","properties":{"reference":{"type":"string"}}}}}});
    assert!(!lint_with_options(&external, &options).valid);
    let normal = LintOptions {
        definition_document: Some(definition()),
        ..Default::default()
    };
    assert!(lint_with_options(&mapping("name"), &normal).valid);
    assert!(!lint_with_options(&mapping("host.reference"), &normal).valid);
}

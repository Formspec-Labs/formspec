//! Definition expression findings through the public lint entry point.

use formspec_lint::{LintMode, LintOptions, lint, lint_with_options};
use serde_json::{Value, json};

#[test]
fn expression_diagnostics_name_the_authored_slot_in_every_mode() {
    let cases = [
        (
            "E401",
            include_str!("../../../tests/fixtures/lint/E401-unknown-function.json"),
        ),
        (
            "E402",
            include_str!("../../../tests/fixtures/lint/E402-undefined-field.json"),
        ),
        (
            "E403",
            include_str!("../../../tests/fixtures/lint/E403-undefined-variable.json"),
        ),
        (
            "E404",
            include_str!("../../../tests/fixtures/lint/E404-undefined-instance.json"),
        ),
        (
            "E405",
            include_str!("../../../tests/fixtures/lint/E405-unprojected-path.json"),
        ),
        (
            "W405",
            include_str!("../../../tests/fixtures/lint/W405-informative-instance-path.json"),
        ),
    ];
    for (code, fixture) in cases {
        let doc: Value = serde_json::from_str(fixture).unwrap();
        for mode in [LintMode::Runtime, LintMode::Authoring, LintMode::Strict] {
            let result = lint_with_options(
                &doc,
                &LintOptions {
                    mode,
                    ..Default::default()
                },
            );
            let findings: Vec<_> = result
                .diagnostics
                .iter()
                .filter(|d| d.code == code)
                .collect();
            assert_eq!(
                findings.len(),
                1,
                "{mode:?} {code}: {:?}",
                result.diagnostics
            );
            assert_eq!(findings[0].path, "$.items[0].initialValue");
        }
    }
}

#[test]
fn field_and_variable_references_require_a_visible_declaration() {
    let doc = json!({
        "$formspec":"1.0", "url":"urn:test:scopes", "version":"1.0.0", "status":"draft",
        "title":"Scoped expressions",
        "items":[{"type":"group","key":"g","label":"Group","children":[
            {"type":"field","dataType":"integer","key":"value","label":"Value"},
            {"type":"field","dataType":"integer","key":"inside","label":"Inside",
             "initialValue":"=$value + @local"}]},
            {"type":"field","dataType":"integer","key":"outside","label":"Outside",
             "initialValue":"=$value + @local + $g.value"}],
        "variables":[{"name":"local","scope":"g","expression":"$value"}]
    });
    let result = lint(&doc);
    for code in ["E402", "E403"] {
        let findings: Vec<_> = result
            .diagnostics
            .iter()
            .filter(|d| d.code == code)
            .collect();
        assert_eq!(findings.len(), 1, "{:?}", result.diagnostics);
        assert_eq!(findings[0].path, "$.items[1].initialValue");
    }
}

#[test]
fn projected_paths_allow_containers_and_use_the_delivered_shape() {
    let mut doc: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/lint/E405-unprojected-path.json"
    ))
    .unwrap();
    doc["instances"]["prior"]["schema"] =
        json!({"rows[*].code":"string","fee":"money","tags":"multiChoice","file":"attachment"});
    for (cardinality, expression, expected) in [
        ("latest", "count(@instance('prior').rows)", false),
        (
            "latest",
            "some(@instance('prior').rows, $.code.missing = 'A')",
            true,
        ),
        ("latest", "@instance('prior').fee.amount", false),
        ("latest", "@instance('prior').fee.missing", true),
        (
            "latest",
            "@instance('prior').file.customMetadata.page",
            false,
        ),
        ("latest", "@instance('prior').tags[1]", false),
        ("latest", "@instance('prior').tags[1].missing", true),
        (
            "latest",
            "some(@instance('prior').rows, $.code = 'A')",
            false,
        ),
        (
            "latest",
            "some(@instance('prior').rows, $.missing = 'A')",
            true,
        ),
        (
            "latest-per-subject",
            "some(@instance('prior'), $.missing = 'A')",
            true,
        ),
    ] {
        doc["instances"]["prior"]["response"]["cardinality"] = json!(cardinality);
        doc["items"][0]["initialValue"] = json!(format!("={expression}"));
        let diagnostics = lint(&doc).diagnostics;
        assert_eq!(
            diagnostics.iter().any(|d| d.code == "E405"),
            expected,
            "{diagnostics:?}"
        );
    }
    doc["instances"]["prior"]["response"]["mapping"] = json!("urn:test:reshape");
    assert!(!lint(&doc).diagnostics.iter().any(|d| d.code == "E405"));
}

#[test]
fn self_relative_fields_are_checked_at_the_target_instead_of_its_parent() {
    let doc = json!({
        "$formspec":"1.0","url":"urn:test:self","version":"1.0.0","status":"draft","title":"Check self",
        "items":[{"key":"outer","type":"field","dataType":"integer","label":"Outer"},
            {"key":"group","type":"group","label":"Group","children":[
                {"key":"value","type":"field","dataType":"integer","label":"Value"}]}],
        "shapes":[{"id":"members","target":"group","severity":"error","message":"Members",
            "constraint":"$.value > 0 and $.outer > 0"}]
    });
    let diagnostics = lint(&doc).diagnostics;
    let failures: Vec<_> = diagnostics.iter().filter(|d| d.code == "E402").collect();
    assert_eq!(failures.len(), 1, "{diagnostics:?}");
    assert!(failures[0].message.contains("$.outer"));
}

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
            "E408",
            include_str!("../../../tests/fixtures/lint/E408-builtin-arity-mismatch.json"),
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
        // A declared money field reaches FEL as a Money value. Structured seeds read raw JSON.
        ("latest", "@instance('prior').fee.amount", true),
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

    let response = doc["instances"]["prior"]["response"]
        .as_object_mut()
        .unwrap();
    response.remove("mapping");
    response.insert("cardinality".to_owned(), json!("latest"));
    let item = doc["items"][0].as_object_mut().unwrap();
    item.remove("initialValue");
    item.insert(
        "prePopulate".to_owned(),
        json!({"instance":"prior","path":"fee.amount"}),
    );
    let diagnostics = lint(&doc).diagnostics;
    assert!(
        !diagnostics
            .iter()
            .any(|d| d.code == "E405" || d.code == "E101"),
        "{diagnostics:?}"
    );
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

#[test]
fn field_reads_require_data_items_and_subscripts_require_repeatable_groups() {
    let document = json!({
        "$formspec":"1.0","url":"urn:test:data-items","version":"1.0.0","status":"draft",
        "title":"Data-bearing Items",
        "items":[
            {"key":"heading","type":"display","label":"Heading"},
            {"key":"info","type":"group","label":"Info","children":[
                {"key":"code","type":"field","dataType":"string","label":"Code"}]},
            {"key":"answer","type":"field","dataType":"string","label":"Answer",
             "initialValue":"=$heading + $info[*].code"}
        ]
    });
    let findings: Vec<_> = lint(&document)
        .diagnostics
        .into_iter()
        .filter(|d| d.code == "E402")
        .collect();
    assert_eq!(findings.len(), 2, "{findings:?}");
    assert!(findings.iter().any(|d| d.message.contains("$heading")));
    assert!(findings.iter().any(|d| d.message.contains("$info[*].code")));
}

#[test]
fn repeat_paths_check_the_current_row_and_disallow_double_subscripts() {
    let document = json!({
        "$formspec":"1.0","url":"urn:test:current-row","version":"1.0.0","status":"draft",
        "title":"Current row",
        "items":[{"key":"rows","type":"group","repeatable":true,"label":"Rows","children":[
            {"key":"known","type":"field","dataType":"integer","label":"Known"},
            {"key":"total","type":"field","dataType":"integer","label":"Total",
             "initialValue":"=@current.known + @current.missing + $rows[1][1].known"}]}]
    });
    let findings: Vec<_> = lint(&document)
        .diagnostics
        .into_iter()
        .filter(|d| d.code == "E402")
        .collect();
    assert_eq!(findings.len(), 2, "{findings:?}");
    assert!(
        findings
            .iter()
            .any(|d| d.message.contains("@current.missing"))
    );
    assert!(
        findings
            .iter()
            .any(|d| d.message.contains("$rows[1][1].known"))
    );
}

#[test]
fn literal_instance_key_cannot_alias_an_array_subscript_in_schema_lint() {
    let mut doc: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/lint/E405-unprojected-path.json"
    ))
    .unwrap();
    doc["instances"]["prior"]["schema"] = json!({"rows[*].code": "string"});

    // Array subscript matches `rows[*].code`.
    doc["items"][0]["initialValue"] = json!("=@instance('prior').rows[1].code");
    assert!(
        !lint(&doc).diagnostics.iter().any(|d| d.code == "E405"),
        "{:?}",
        lint(&doc).diagnostics
    );

    // `instance('prior', 'rows[1].code')` reads literal object key "rows[1]", NOT array `rows`.
    doc["items"][0]["initialValue"] = json!("=instance('prior', 'rows[1].code')");
    let findings: Vec<_> = lint(&doc)
        .diagnostics
        .into_iter()
        .filter(|d| d.code == "E405")
        .collect();
    assert_eq!(findings.len(), 1, "{findings:?}");
    assert_eq!(
        findings[0].message,
        format!(
            "Path {:?} on instance \"prior\" is outside its declared schema",
            "[\"rows[1]\"].code"
        )
    );

    // Declaring the escaped literal key matches the literal read and rejects the array subscript.
    doc["instances"]["prior"]["schema"] = json!({"[\"rows[1]\"].code": "string"});
    assert!(
        !lint(&doc).diagnostics.iter().any(|d| d.code == "E405"),
        "{:?}",
        lint(&doc).diagnostics
    );
    doc["items"][0]["initialValue"] = json!("=@instance('prior').rows[1].code");
    assert!(lint(&doc).diagnostics.iter().any(|d| d.code == "E405"));
}

#[test]
fn indexed_current_row_reads_retain_their_suffixes() {
    let document = json!({
        "$formspec":"1.0","url":"urn:test:current-indexed","version":"1.0.0","status":"draft",
        "title":"Indexed current row",
        "items":[{
            "key":"rows","type":"group","repeatable":true,"label":"Rows",
            "children":[
                {"key":"nested","type":"group","repeatable":true,"label":"Nested","children":[
                    {"key":"code","type":"field","dataType":"string","label":"Code"}
                ]},
                {"key":"check","type":"field","dataType":"string","label":"Check",
                 "initialValue":"=@current.nested[1].code + @current.nested[1].missing + @current[1].nested"}
            ]
        }]
    });
    let findings: Vec<_> = lint(&document)
        .diagnostics
        .into_iter()
        .filter(|d| d.code == "E402")
        .collect();
    assert_eq!(findings.len(), 2, "{findings:?}");
    assert!(
        findings
            .iter()
            .any(|d| d.message.contains("@current.nested[1].missing")),
        "{findings:?}"
    );
    assert!(
        findings
            .iter()
            .any(|d| d.message.contains("@current[1].nested")),
        "{findings:?}"
    );
}

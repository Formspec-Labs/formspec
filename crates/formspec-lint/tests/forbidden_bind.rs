//! Component-specific bind prohibitions and the optional-bind W800 boundary.

use formspec_lint::{LintCode, LintDiagnostic, LintOptions, lint_with_options};
use serde_json::{Value, json};

fn fixture(source: &str) -> (Value, LintOptions) {
    let mut document: Value = serde_json::from_str(source).expect("component fixture");
    let definition = document
        .as_object_mut()
        .unwrap()
        .remove("_pairedDefinition");
    let options = LintOptions {
        definition_document: definition,
        ..Default::default()
    };
    (document, options)
}

fn bind_findings(document: &Value, options: &LintOptions) -> Vec<LintDiagnostic> {
    lint_with_options(document, options)
        .diagnostics
        .into_iter()
        .filter(|diagnostic| matches!(diagnostic.code, LintCode::W800 | LintCode::W801))
        .collect()
}

macro_rules! forbidden_fixture {
    ($test:ident, $file:literal) => {
        #[test]
        fn $test() {
            let (document, options) = fixture(include_str!(concat!(
                "../../../tests/fixtures/lint/",
                $file
            )));
            // A forbidden bind needs no paired Definition to establish the defect.
            for context in [options, LintOptions::default()] {
                let findings = bind_findings(&document, &context);
                assert_eq!(findings.len(), 1, "{findings:?}");
                assert_eq!(findings[0].code, LintCode::W801);
                assert_eq!(findings[0].path, "$.tree.children[0]");
                assert!(
                    findings[0].message.contains(
                        document["tree"]["children"][0]["component"]
                            .as_str()
                            .unwrap()
                    )
                );
            }
        }
    };
}

// The individual Bind clauses override the Display category's optional default (§4.2).
forbidden_fixture!(heading_bind_is_w801, "W801-heading-has-bind.json"); // §5.13
forbidden_fixture!(divider_bind_is_w801, "W801-divider-has-bind.json"); // §5.15
forbidden_fixture!(
    action_button_bind_is_w801,
    "W801-action-button-has-bind.json"
); // §5.19
forbidden_fixture!(alert_bind_is_w801, "W801-alert-has-bind.json"); // §6.9
forbidden_fixture!(badge_bind_is_w801, "W801-badge-has-bind.json"); // §6.10
forbidden_fixture!(summary_bind_is_w801, "W801-summary-has-bind.json"); // §6.12
forbidden_fixture!(
    validation_summary_bind_is_w801,
    "W801-validation-summary-has-bind.json"
); // §6.13

#[test]
fn forbidden_bind_to_missing_item_is_only_w801() {
    let (mut document, options) = fixture(include_str!(
        "../../../tests/fixtures/lint/W801-heading-has-bind.json"
    ));
    for component in [
        "Heading",
        "Divider",
        "ActionButton",
        "Alert",
        "Badge",
        "Summary",
        "ValidationSummary",
    ] {
        document["tree"]["children"][0]["component"] = json!(component);
        document["tree"]["children"][0]["bind"] = json!("missing");
        let findings = bind_findings(&document, &options);
        assert_eq!(findings.len(), 1, "{component}: {findings:?}");
        assert_eq!(findings[0].code, LintCode::W801, "{component}");
    }
}

#[test]
fn optional_display_binds_still_use_w800() {
    let (mut document, mut options) = fixture(include_str!(
        "../../../tests/fixtures/lint/W801-heading-has-bind.json"
    ));
    options.definition_document.as_mut().unwrap()["items"]
        .as_array_mut()
        .unwrap()
        .extend([
            json!({ "key": "notice", "type": "display", "label": "Notice" }),
            json!({ "key": "group", "type": "group", "label": "Group", "children": [] }),
        ]);
    for component in ["Text", "ProgressBar"] {
        for (bind, expected) in [
            ("name", None),
            ("notice", None),
            ("missing", Some(LintCode::W800)),
            ("group", Some(LintCode::W800)),
        ] {
            document["tree"]["children"][0] = json!({ "component": component, "bind": bind });
            let findings = bind_findings(&document, &options);
            assert_eq!(
                findings
                    .iter()
                    .map(|finding| finding.code)
                    .collect::<Vec<_>>(),
                expected.into_iter().collect::<Vec<_>>(),
                "{component} -> {bind}: {findings:?}"
            );
        }
    }
}

#[test]
fn unbound_displays_and_summary_item_binds_are_clean() {
    for source in [
        include_str!("../../../tests/fixtures/lint/W801-heading-has-bind.json"),
        include_str!("../../../tests/fixtures/lint/W801-divider-has-bind.json"),
        include_str!("../../../tests/fixtures/lint/W801-action-button-has-bind.json"),
        include_str!("../../../tests/fixtures/lint/W801-alert-has-bind.json"),
        include_str!("../../../tests/fixtures/lint/W801-badge-has-bind.json"),
        include_str!("../../../tests/fixtures/lint/W801-summary-has-bind.json"),
        include_str!("../../../tests/fixtures/lint/W801-validation-summary-has-bind.json"),
    ] {
        let (mut document, options) = fixture(source);
        document["tree"]["children"][0]
            .as_object_mut()
            .unwrap()
            .remove("bind");
        assert!(bind_findings(&document, &options).is_empty(), "{document}");
    }
}

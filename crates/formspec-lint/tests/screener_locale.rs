//! Native Locale 2.1 schema and paired Screener semantic qualification.
use formspec_lint::{LintCode, LintOptions, lint_with_options};
use serde_json::{Value, json};

fn locale() -> Value {
    json!({"$formspecLocale": "2.1", "version": "1.0.0", "locale": "es-US",
        "target": {"kind": "screener", "url": "urn:test:gate", "compatibleVersions": "1.0.0"},
        "strings": {"$form.title": "Elegibilidad", "eligible.label": "Elegible", "$ui.screener.yes": "Sí"}})
}
fn options() -> LintOptions {
    LintOptions {
        screener_document: Some(
            json!({"$formspecScreener": "1.0", "url": "urn:test:gate", "version": "1.0.0",
        "items": [{"type": "field", "key": "eligible", "dataType": "boolean", "label": "Eligible"}]}),
        ),
        ..Default::default()
    }
}
#[test]
fn paired_screener_locale_is_valid_and_older_dialect_refuses_new_target() {
    let mut document = locale();
    assert!(lint_with_options(&document, &options()).valid);
    document["$formspecLocale"] = json!("2.0");
    let result = lint_with_options(&document, &options());
    assert!(!result.valid);
    assert!(
        result
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == LintCode::E101)
    );
}
#[test]
fn paired_screener_url_version_and_item_are_checked() {
    let mut document = locale();
    document["target"]["url"] = json!("urn:test:other");
    assert!(
        lint_with_options(&document, &options())
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == LintCode::E1400)
    );
    document = locale();
    document["target"]["compatibleVersions"] = json!("2.0.0");
    assert!(
        lint_with_options(&document, &options())
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == LintCode::E1400)
    );
    document = locale();
    document["strings"]["missing.label"] = json!("Missing");
    assert!(
        lint_with_options(&document, &options())
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == LintCode::E1402)
    );
}

#[test]
fn native_screener_semver_matches_node_zero_major_and_prerelease_ranges() {
    for (range, version, expected) in [
        ("^0.3.0", "0.4.0", false),
        ("^0.3.0", "0.3.7", true),
        ("^0.0.3", "0.0.4", false),
        ("1.0.0", "1.0.1", false),
        (">=0.3.0 <0.4.0", "0.3.1-beta.1", true),
        ("invalid", "1.0.0", false),
    ] {
        let mut document = locale();
        document["target"]["compatibleVersions"] = json!(range);
        let mut paired = options();
        paired.screener_document.as_mut().unwrap()["version"] = json!(version);
        assert_eq!(
            lint_with_options(&document, &paired).valid,
            expected,
            "{range} versus {version}"
        );
    }
}

#[test]
fn definition_cannot_be_supplied_as_the_paired_screener_context() {
    let paired = LintOptions {
        screener_document: Some(
            json!({"$formspec": "1.0", "url": "urn:test:gate", "version": "1.0.0",
        "items": [{"type": "field", "key": "eligible", "dataType": "boolean"}]}),
        ),
        ..Default::default()
    };
    let result = lint_with_options(&locale(), &paired);
    assert!(!result.valid);
    assert!(
        result
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == LintCode::E1400)
    );
}

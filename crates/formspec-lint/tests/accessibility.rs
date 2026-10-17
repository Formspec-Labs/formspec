//! Accessibility document rules (ADR 0166 §3): one test per rule, each showing a failing and a passing form.
//! The rules run over a form version's pinned Definition, Theme and Locale documents via `check_accessibility`.

use formspec_lint::{
    AccessibilityChecks, AccessibilityOutcome, LintCode, check_accessibility, wcag_criteria,
};
use serde_json::{Value, json};

fn definition(items: Value) -> Value {
    json!({
        "$formspec": "1.0",
        "url": "https://example.com/forms/a11y",
        "version": "1.0.0",
        "status": "draft",
        "title": "Accessibility fixture",
        "items": items
    })
}

fn field(key: &str, label: &str) -> Value {
    json!({ "key": key, "type": "field", "dataType": "string", "label": label })
}

fn choice(key: &str, label: &str, options: &[(&str, &str)]) -> Value {
    json!({
        "key": key, "type": "field", "dataType": "choice", "label": label,
        "options": options.iter().map(|(v, l)| json!({ "value": v, "label": l })).collect::<Vec<_>>()
    })
}

fn locale(tag: &str, strings: Value) -> Value {
    json!({
        "$formspecLocale": "2.0",
        "version": "1.0.0",
        "locale": tag,
        "target": { "kind": "definition", "url": "https://example.com/forms/a11y" },
        "strings": strings
    })
}

fn theme(tokens: Value) -> Value {
    json!({ "$formspecTheme": "1.0", "url": "https://example.com/themes/a11y", "version": "1.0.0", "tokens": tokens })
}

fn check(def: &Value, theme: Option<&Value>, locales: &[Value]) -> AccessibilityChecks {
    check_accessibility(def, theme, locales)
}

fn failed(checks: &AccessibilityChecks, rule: LintCode) -> bool {
    checks
        .results
        .iter()
        .find(|r| r.rule == rule)
        .unwrap_or_else(|| panic!("{rule} is not an accessibility rule"))
        .outcome
        == AccessibilityOutcome::Failed
}

#[test]
fn field_without_a_label_fails_and_a_labelled_field_passes() {
    let bad = check(&definition(json!([field("name", "   ")])), None, &[]);
    assert!(failed(&bad, LintCode::E1900));
    assert!(bad.blocks_publish());
    let good = check(&definition(json!([field("name", "Full name")])), None, &[]);
    assert!(!failed(&good, LintCode::E1900));
    assert!(!good.blocks_publish());
}

#[test]
fn group_without_a_label_fails_as_its_own_rule_with_one_criterion() {
    let def = definition(
        json!([{ "key": "contact", "type": "group", "label": "", "children": [field("name", "Name")] }]),
    );
    let checks = check(&def, None, &[]);
    assert!(failed(&checks, LintCode::E1904));
    assert!(!failed(&checks, LintCode::E1900));
    assert_eq!(wcag_criteria(LintCode::E1904), ["1.3.1"]);
}

#[test]
fn display_item_without_a_label_is_not_an_input_and_passes() {
    let def = definition(
        json!([{ "key": "intro", "type": "display", "label": "" }, field("name", "Name")]),
    );
    assert!(!failed(&check(&def, None, &[]), LintCode::E1900));
}

#[test]
fn locale_that_blanks_a_label_fails_and_one_that_translates_it_passes() {
    let def = definition(json!([field("name", "Name")]));
    let bad = check(&def, None, &[locale("fr", json!({ "name.label": " " }))]);
    assert!(failed(&bad, LintCode::E1901));
    assert!(bad.blocks_publish());
    let good = check(&def, None, &[locale("fr", json!({ "name.label": "Nom" }))]);
    assert!(!failed(&good, LintCode::E1901));
}

#[test]
fn locale_context_label_is_judged_too() {
    let def = definition(json!([field("name", "Name")]));
    let bad = check(
        &def,
        None,
        &[locale(
            "fr",
            json!({ "name.label": "Nom", "name.label@short": "" }),
        )],
    );
    assert!(failed(&bad, LintCode::E1901));
}

#[test]
fn option_without_a_label_fails_in_the_definition_and_in_a_locale() {
    let bad_def = definition(json!([choice(
        "size",
        "Size",
        &[("s", "Small"), ("m", "")]
    )]));
    assert!(failed(&check(&bad_def, None, &[]), LintCode::E1902));

    let def = definition(json!([choice(
        "size",
        "Size",
        &[("s", "Small"), ("m", "Medium")]
    )]));
    let bad_locale = locale("fr", json!({ "size.options.m.label": "" }));
    assert!(failed(&check(&def, None, &[bad_locale]), LintCode::E1902));

    let good_locale = locale("fr", json!({ "size.options.m.label": "Moyen" }));
    assert!(!failed(&check(&def, None, &[good_locale]), LintCode::E1902));
}

#[test]
fn option_set_without_a_label_fails() {
    let mut def = definition(json!([field("size", "Size")]));
    def["optionSets"] = json!({ "sizes": { "options": [{ "value": "s", "label": "" }] } });
    assert!(failed(&check(&def, None, &[]), LintCode::E1902));
}

#[test]
fn theme_text_below_aa_contrast_fails_and_dark_text_passes() {
    let def = definition(json!([field("name", "Name")]));
    let bad = theme(json!({ "color.foreground": "#bbbbbb" }));
    let checks = check(&def, Some(&bad), &[]);
    assert!(failed(&checks, LintCode::E1903));
    assert!(checks.blocks_publish());
    let good = theme(json!({ "color.foreground": "#111111" }));
    assert!(!failed(&check(&def, Some(&good), &[]), LintCode::E1903));
}

#[test]
fn theme_pair_between_aa_and_its_own_stricter_minimum_warns_without_blocking() {
    let def = definition(json!([field("name", "Name")]));
    let stricter = json!({
        "tokens": { "x-agency.text": "#595959", "x-agency.surface": "#ffffff" },
        "contrastPairs": [{
            "id": "copy", "foregroundToken": "x-agency.text", "backgroundToken": "x-agency.surface",
            "usage": "normalText", "minimumRatio": 9
        }]
    });
    let mut t = theme(json!({}));
    t["tokens"] = stricter["tokens"].clone();
    t["contrastPairs"] = stricter["contrastPairs"].clone();
    let checks = check(&def, Some(&t), &[]);
    assert!(!failed(&checks, LintCode::E1903));
    assert!(
        checks.findings.is_empty(),
        "a Theme's own stricter bar is not an accessibility finding"
    );
    assert!(!checks.blocks_publish());
}

#[test]
fn contrast_pair_that_cannot_be_evaluated_is_needs_review_not_passed() {
    let def = definition(json!([field("name", "Name")]));
    let mut t =
        theme(json!({ "x-agency.text": "rgba(0, 0, 0, 0.5)", "x-agency.surface": "#ffffff" }));
    t["contrastPairs"] = json!([{ "id": "copy", "foregroundToken": "x-agency.text", "backgroundToken": "x-agency.surface", "usage": "normalText" }]);
    let checks = check(&def, Some(&t), &[]);
    let e1903 = checks
        .results
        .iter()
        .find(|r| r.rule == LintCode::E1903)
        .unwrap();
    assert_eq!(e1903.outcome, AccessibilityOutcome::NeedsReview);
    assert!(failed(&checks, LintCode::W1905));
    assert!(!checks.blocks_publish());
    assert_eq!(
        checks.to_json_value()["results"]
            .as_array()
            .unwrap()
            .iter()
            .find(|r| r["rule"] == "E1903")
            .unwrap()["outcome"],
        "needs-review"
    );

    let missing = theme(json!({}));
    let mut missing = missing;
    missing["contrastPairs"] = json!([{ "id": "copy", "foregroundToken": "x-no.text", "backgroundToken": "x-no.surface", "usage": "normalText" }]);
    let checks = check(&def, Some(&missing), &[]);
    assert!(failed(&checks, LintCode::W1905));
}

#[test]
fn locale_missing_label_names_the_item_it_is_missing_for() {
    let def = definition(json!([
        field("first", "First name"),
        field("last", "Last name")
    ]));
    let checks = check(
        &def,
        None,
        &[locale("fr", json!({ "first.label": "Prénom" }))],
    );
    let w = checks
        .results
        .iter()
        .find(|r| r.rule == LintCode::W1900)
        .unwrap();
    assert_eq!(w.paths, ["locale:fr#$.items[1]"]);
}

#[test]
fn locale_that_translates_some_labels_but_not_all_warns_and_a_complete_one_passes() {
    let def = definition(json!([
        field("first", "First name"),
        field("last", "Last name")
    ]));
    let partial = check(
        &def,
        None,
        &[locale("fr", json!({ "first.label": "Prénom" }))],
    );
    assert!(failed(&partial, LintCode::W1900));
    assert!(!partial.blocks_publish());
    let complete = check(
        &def,
        None,
        &[locale(
            "fr",
            json!({ "first.label": "Prénom", "last.label": "Nom" }),
        )],
    );
    assert!(!failed(&complete, LintCode::W1900));
}

#[test]
fn locale_label_may_come_from_its_fallback_locale() {
    let def = definition(json!([
        field("first", "First name"),
        field("last", "Last name")
    ]));
    let mut ca = locale("fr-CA", json!({ "first.label": "Prénom" }));
    ca["fallback"] = json!("fr");
    let fr = locale(
        "fr",
        json!({ "first.label": "Prénom", "last.label": "Nom" }),
    );
    assert!(!failed(&check(&def, None, &[ca, fr]), LintCode::W1900));
}

#[test]
fn locale_that_writes_no_item_labels_is_not_judged_for_missing_labels() {
    let def = definition(json!([field("first", "First name")]));
    let only_chrome = locale("fr", json!({ "$form.title": "Formulaire" }));
    assert!(!failed(&check(&def, None, &[only_chrome]), LintCode::W1900));
}

#[test]
fn two_options_with_the_same_label_warn_and_distinct_ones_pass() {
    let bad = definition(json!([choice(
        "size",
        "Size",
        &[("s", "Small"), ("m", " small ")]
    )]));
    assert!(failed(&check(&bad, None, &[]), LintCode::W1901));
    let good = definition(json!([choice(
        "size",
        "Size",
        &[("s", "Small"), ("m", "Medium")]
    )]));
    assert!(!failed(&check(&good, None, &[]), LintCode::W1901));
}

#[test]
fn two_sibling_fields_with_the_same_label_warn_and_distinct_ones_pass() {
    let bad = definition(json!([field("home", "Phone"), field("work", "phone")]));
    assert!(failed(&check(&bad, None, &[]), LintCode::W1902));
    let good = definition(json!([
        field("home", "Home phone"),
        field("work", "Work phone")
    ]));
    assert!(!failed(&check(&good, None, &[]), LintCode::W1902));
}

#[test]
fn same_label_under_different_groups_is_not_a_sibling_clash() {
    let def = definition(json!([
        { "key": "a", "type": "group", "label": "Applicant", "children": [field("aname", "Name")] },
        { "key": "b", "type": "group", "label": "Spouse", "children": [field("bname", "Name")] }
    ]));
    assert!(!failed(&check(&def, None, &[]), LintCode::W1902));
}

#[test]
fn instruction_by_colour_warns_and_the_same_instruction_in_words_passes() {
    let mut bad_field = field("name", "Name");
    bad_field["hint"] = json!("Fields marked in red are required");
    assert!(failed(
        &check(&definition(json!([bad_field])), None, &[]),
        LintCode::W1903
    ));

    let mut also_bad = field("name", "Name");
    also_bad["description"] = json!("Press the green button to continue");
    assert!(failed(
        &check(&definition(json!([also_bad])), None, &[]),
        LintCode::W1903
    ));

    let mut good = field("name", "Name");
    good["hint"] = json!("Fields marked with an asterisk (*) are required");
    assert!(!failed(
        &check(&definition(json!([good])), None, &[]),
        LintCode::W1903
    ));

    let mut not_an_instruction = field("org", "Organization");
    not_an_instruction["hint"] = json!("For example the Red Cross");
    assert!(!failed(
        &check(&definition(json!([not_an_instruction])), None, &[]),
        LintCode::W1903
    ));
}

#[test]
fn instruction_by_colour_in_a_locale_is_found_too() {
    let def = definition(json!([field("name", "Name")]));
    let bad = locale(
        "en-GB",
        json!({ "name.hint": "Boxes highlighted in red need attention" }),
    );
    assert!(failed(&check(&def, None, &[bad]), LintCode::W1903));
}

#[test]
fn markdown_image_syntax_warns_and_a_plain_link_passes() {
    let mut bad = field("name", "Name");
    bad["hint"] = json!("See ![layout](https://example.com/a.png)");
    assert!(failed(
        &check(&definition(json!([bad])), None, &[]),
        LintCode::W1904
    ));
    let mut good = field("name", "Name");
    good["hint"] = json!("See [the layout](https://example.com/a)");
    assert!(!failed(
        &check(&definition(json!([good])), None, &[]),
        LintCode::W1904
    ));
}

#[test]
fn a_clean_form_has_no_findings_and_does_not_block() {
    let def = definition(json!([
        field("name", "Full name"),
        choice("size", "Size", &[("s", "Small"), ("m", "Medium")])
    ]));
    let t = theme(json!({ "color.foreground": "#111111" }));
    let checks = check(
        &def,
        Some(&t),
        &[locale(
            "fr",
            json!({ "name.label": "Nom complet", "size.label": "Taille" }),
        )],
    );
    assert!(checks.findings.is_empty(), "{:?}", checks.findings);
    assert!(!checks.blocks_publish());
    assert!(
        checks
            .results
            .iter()
            .all(|r| r.outcome == AccessibilityOutcome::Passed)
    );
}

#[test]
fn every_rule_reports_its_wcag_criteria_and_registry_severity_in_the_json_report() {
    let checks = check(&definition(json!([field("name", "")])), None, &[]);
    let report = checks.to_json_value();
    assert_eq!(report["linterVersion"], env!("CARGO_PKG_VERSION"));
    let results = report["results"].as_array().expect("results");
    assert!(results.len() >= 10);
    for result in results {
        let wcag = result["wcag"].as_array().expect("wcag");
        assert!(!wcag.is_empty(), "{result}");
        assert!(["passed", "failed"].contains(&result["outcome"].as_str().unwrap()));
    }
    let e1900 = results.iter().find(|r| r["rule"] == "E1900").unwrap();
    assert_eq!(e1900["outcome"], "failed");
    assert_eq!(e1900["severity"], "error");
    assert_eq!(e1900["wcag"], json!(["1.3.1", "3.3.2", "4.1.2"]));
    assert_eq!(e1900["paths"], json!(["definition#$.items[0].label"]));
    assert_eq!(wcag_criteria(LintCode::E1900), ["1.3.1", "3.3.2", "4.1.2"]);
    assert!(
        report.get("passed").is_none(),
        "the report has no `passed` field"
    );
}

#[test]
fn findings_carry_the_severity_the_registry_gives_the_rule() {
    let def = definition(json!([
        field("name", ""),
        choice("size", "Size", &[("a", "X"), ("b", "X")])
    ]));
    let checks = check(&def, None, &[]);
    for finding in &checks.findings {
        let rule = checks
            .results
            .iter()
            .find(|r| r.rule == finding.diagnostic.code)
            .unwrap();
        assert_eq!(finding.diagnostic.severity, rule.severity);
    }
    assert!(
        checks
            .findings
            .iter()
            .any(|f| f.diagnostic.code == LintCode::E1900)
    );
    assert!(
        checks
            .findings
            .iter()
            .any(|f| f.diagnostic.code == LintCode::W1901)
    );
}

/// The registry's fixtures are what the authoring loop and the Python registry test replay; each must
/// trigger its rule through the plain per-document `lint` path, with its paired documents.
#[test]
fn every_accessibility_fixture_in_the_registry_triggers_its_rule() {
    use formspec_lint::{LintOptions, lint_with_options};
    use std::path::Path;

    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let registry: Value =
        serde_json::from_str(&std::fs::read_to_string(root.join("specs/lint-codes.json")).unwrap())
            .unwrap();
    let mut seen = 0;
    for rule in registry["rules"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|r| r.get("wcag").is_some())
    {
        let code = rule["code"].as_str().unwrap();
        for fixture in rule["fixtures"].as_array().unwrap() {
            let mut doc: Value = serde_json::from_str(
                &std::fs::read_to_string(root.join(fixture.as_str().unwrap())).unwrap(),
            )
            .unwrap();
            let options = LintOptions {
                definition_document: doc.as_object_mut().unwrap().remove("_pairedDefinition"),
                ..LintOptions::default()
            };
            let result = lint_with_options(&doc, &options);
            let hit = result
                .diagnostics
                .iter()
                .find(|d| d.code.as_wire_str() == code);
            let hit = hit.unwrap_or_else(|| {
                panic!(
                    "{fixture} did not emit {code}: {:?}",
                    result
                        .diagnostics
                        .iter()
                        .map(|d| d.code.as_wire_str())
                        .collect::<Vec<_>>()
                )
            });
            assert_eq!(
                hit.severity.as_wire_str(),
                rule["severity"].as_str().unwrap(),
                "{code} severity"
            );
            seen += 1;
        }
    }
    assert!(seen >= 10, "only {seen} accessibility fixtures found");
}

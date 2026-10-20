//! Core §3.10.3 advisory behavior at the public lint boundary.

use formspec_lint::{LintMode, LintOptions, LintResult, LintSeverity, lint_with_options};
use serde_json::{Value, json};

fn definition(binds: Value) -> Value {
    json!({
        "$formspec": "1.0", "url": "https://example.org/advisories", "version": "1.0.0",
        "title": "Advisory controls", "status": "draft",
        "items": [
            {"key": "value", "type": "field", "label": "Value", "dataType": "string"},
            {"key": "enabled", "type": "field", "label": "Enabled", "dataType": "boolean"}
        ],
        "binds": binds
    })
}

fn lint(doc: &Value, mode: LintMode) -> LintResult {
    lint_with_options(
        doc,
        &LintOptions {
            mode,
            ..LintOptions::default()
        },
    )
}

fn codes(result: &LintResult) -> Vec<&str> {
    result
        .diagnostics
        .iter()
        .map(|d| d.code.as_wire_str())
        .filter(|code| matches!(*code, "W900" | "W901" | "W902"))
        .collect()
}

#[test]
fn missing_declared_source_warns_without_invalidating_any_mode() {
    let doc = definition(json!([{"path":"value", "required":"true", "readonly":"true"}]));
    for mode in [LintMode::Runtime, LintMode::Authoring, LintMode::Strict] {
        let result = lint(&doc, mode);
        assert!(result.valid, "{:#?}", result.diagnostics);
        assert_eq!(codes(&result), ["W900"]);
        let diagnostic = result
            .diagnostics
            .iter()
            .find(|d| d.code.as_wire_str() == "W900")
            .unwrap();
        assert_eq!(diagnostic.severity, LintSeverity::Warning);
        assert_eq!(diagnostic.path, "value");
        assert_eq!(diagnostic.pass, 10);
        assert!(
            diagnostic
                .spec_ref
                .as_deref()
                .unwrap()
                .contains("definition-advisories")
        );
    }
}

#[test]
fn default_is_not_a_creation_source_but_any_declared_initial_value_is() {
    let mut doc = definition(
        json!([{"path":"value", "required":"true", "readonly":"true", "default":"seed"}]),
    );
    assert_eq!(codes(&lint(&doc, LintMode::Runtime)), ["W900"]);
    for initial in [Value::Null, json!(""), json!(0), json!(false)] {
        doc["items"][0]["initialValue"] = initial;
        assert!(codes(&lint(&doc, LintMode::Runtime)).is_empty());
    }
}

#[test]
fn calculate_suppresses_missing_source_and_implicit_readonly_produces_info() {
    let mut doc = definition(json!([{"path":"value", "required":"true", "calculate":"null"}]));
    let result = lint(&doc, LintMode::Strict);
    assert!(result.valid, "{:#?}", result.diagnostics);
    assert_eq!(codes(&result), ["W902"]);
    assert_eq!(
        result
            .diagnostics
            .iter()
            .find(|d| d.code.as_wire_str() == "W902")
            .unwrap()
            .severity,
        LintSeverity::Info
    );
    for readonly in ["false", "$enabled"] {
        doc["binds"][0]["readonly"] = json!(readonly);
        assert!(codes(&lint(&doc, LintMode::Runtime)).is_empty());
    }
}

#[test]
fn prepopulation_is_a_source_and_calculation_overwrite_ignores_editable() {
    let mut doc = definition(json!([{"path":"value", "required":"true", "readonly":"true"}]));
    doc["instances"] = json!({"profile":{"data":{"seed":"value"}}});
    doc["items"][0]["prePopulate"] = json!({"instance":"profile", "path":"seed", "editable":true});
    assert!(codes(&lint(&doc, LintMode::Runtime)).is_empty());
    doc["binds"][0]["calculate"] = json!("'calculated'");
    for editable in [true, false] {
        doc["items"][0]["prePopulate"]["editable"] = json!(editable);
        assert_eq!(codes(&lint(&doc, LintMode::Runtime)), ["W901", "W902"]);
    }
}

#[test]
fn merged_binds_replace_properties_and_keep_omitted_sources() {
    let doc = definition(json!([
        {"path":"value", "required":"true", "readonly":"true"},
        {"path":"value", "readonly":"false"}
    ]));
    assert!(codes(&lint(&doc, LintMode::Runtime)).is_empty());
    let doc = definition(json!([
        {"path":"value", "calculate":"null"},
        {"path":"value", "required":"true", "readonly":"true"}
    ]));
    assert_eq!(codes(&lint(&doc, LintMode::Runtime)), ["W902"]);
}

#[test]
fn dynamic_required_and_readonly_do_not_assert_static_certainty() {
    for (required, readonly) in [("$enabled", "true"), ("true", "$enabled")] {
        let doc = definition(json!([{"path":"value", "required":required, "readonly":readonly}]));
        assert!(codes(&lint(&doc, LintMode::Runtime)).is_empty());
    }
}

fn nested(binds: Value) -> Value {
    let mut doc = definition(binds);
    doc["items"][0] = json!({"key":"jobs", "type":"group", "label":"Jobs", "repeatable":true,
        "children":[{"key":"value", "type":"field", "label":"Value", "dataType":"string"}]});
    doc
}

#[test]
fn inherited_readonly_wins_over_child_false_and_preserves_wildcard_target() {
    let doc = nested(json!([
        {"path":"jobs", "readonly":"true"},
        {"path":"jobs[*].value", "required":"true", "readonly":"false"}
    ]));
    let result = lint(&doc, LintMode::Runtime);
    assert!(result.valid, "{:#?}", result.diagnostics);
    assert_eq!(codes(&result), ["W900"]);
    assert_eq!(
        result
            .diagnostics
            .iter()
            .find(|d| d.code.as_wire_str() == "W900")
            .unwrap()
            .path,
        "jobs[*].value"
    );
}

#[test]
fn required_and_calculate_do_not_inherit_and_dynamic_parent_is_unknown() {
    for parent in [
        json!({"path":"jobs", "required":"true"}),
        json!({"path":"jobs", "readonly":"$enabled"}),
    ] {
        let doc = nested(json!([parent, {"path":"jobs[*].value", "required":"true"}]));
        assert!(codes(&lint(&doc, LintMode::Runtime)).is_empty());
    }
    let doc = nested(json!([
        {"path":"jobs", "readonly":"true", "required":"true"},
        {"path":"jobs[*].value", "calculate":"null", "readonly":"false", "required":"true"}
    ]));
    assert_eq!(codes(&lint(&doc, LintMode::Runtime)), ["W902"]);
}

#[test]
fn shape_targeted_nested_fields_use_bind_semantics_not_shape_constraints() {
    let mut doc = nested(json!([{"path":"jobs[*].value", "required":"true", "readonly":"true"}]));
    doc["shapes"] =
        json!([{"id":"check", "target":"jobs[*].value", "constraint":"true", "message":"Check"}]);
    assert_eq!(codes(&lint(&doc, LintMode::Runtime)), ["W900"]);
    doc["binds"] = json!([]);
    assert!(codes(&lint(&doc, LintMode::Runtime)).is_empty());
}

#[test]
fn standalone_screener_uses_its_own_items_and_binds() {
    let mut doc = definition(json!([{"path":"value", "required":"true", "readonly":"true"}]));
    doc.as_object_mut().unwrap().remove("$formspec");
    doc.as_object_mut().unwrap().remove("status");
    doc["$formspecScreener"] = json!("1.0");
    doc["evaluation"] = json!([{
        "id":"phase", "strategy":"first-match",
        "routes":[{"target":"outcome:done", "condition":"true"}]
    }]);
    let result = lint(&doc, LintMode::Runtime);
    assert!(result.valid, "{:#?}", result.diagnostics);
    assert_eq!(codes(&result), ["W900"]);
}

#[test]
fn schema_only_skips_advisories_and_no_fel_keeps_literal_analysis() {
    let doc = definition(json!([{"path":"value", "required":"true", "readonly":"true"}]));
    let schema = lint_with_options(
        &doc,
        &LintOptions {
            schema_only: true,
            ..LintOptions::default()
        },
    );
    assert!(codes(&schema).is_empty());
    let no_fel = lint_with_options(
        &doc,
        &LintOptions {
            no_fel: true,
            ..LintOptions::default()
        },
    );
    assert_eq!(codes(&no_fel), ["W900"]);
}

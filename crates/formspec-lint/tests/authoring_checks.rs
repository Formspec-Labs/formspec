//! Checks Studio's TS `diagnose()` ran that the linter lacked, and theme-token rules that
//! disagreed with the spec. Once the linter owns them, authoring validate can be lint alone.
//!
//! - E400 covers an Item `initialValue` written `=expr` (Core §4.2.3) and a Component `when`
//!   (Component §8), in the tree and in custom component templates.
//! - W800 checks each bound component against its category (Component §4.2): Input binds a
//!   field; Display binds a field, a display item, or nothing; DataTable and Accordion bind
//!   a repeatable group.
//! - W708 reports only tokens under a category prefix the Token Registry owns (Theme §3.2,
//!   token-registry-spec §5); W709 lists every undeclared platform token in one finding.
use formspec_lint::{LintCode, LintDiagnostic, LintOptions, lint, lint_with_options};
use serde_json::{Value, json};

fn definition() -> Value {
    json!({
        "$formspec": "1.0",
        "url": "urn:test:authoring",
        "version": "1.0.0",
        "status": "draft",
        "title": "Authoring checks",
        "items": [
            { "key": "name", "type": "field", "dataType": "string", "label": "Name" },
            { "key": "notice", "type": "display", "label": "Read carefully" },
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
        "targetDefinition": { "url": "urn:test:authoring" },
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

fn w800(children: Value) -> Vec<String> {
    coded(
        &lint_with_options(&component(children), &with_definition()).diagnostics,
        LintCode::W800,
    )
}

// ── E400: initialValue and Component `when` ──────────────────────

#[test]
fn malformed_initial_value_expression_is_e400() {
    let mut document = definition();
    document["items"][0]["initialValue"] = json!("=1 + + 2");
    assert_eq!(
        coded(&lint(&document).diagnostics, LintCode::E400),
        vec!["$.items[0].initialValue".to_string()]
    );
}

#[test]
fn literal_and_well_formed_initial_values_are_clean() {
    let mut document = definition();
    document["items"][0]["initialValue"] = json!("1 + + 2 is just text");
    document["items"][2]["children"][0]["initialValue"] = json!("=today()");
    assert_eq!(
        coded(&lint(&document).diagnostics, LintCode::E400),
        Vec::<String>::new()
    );
}

#[test]
fn malformed_when_is_e400_in_the_tree_and_in_templates() {
    let mut document = component(json!([
        { "component": "Text", "text": "Shown", "when": "$name = = 1" }
    ]));
    document["components"] = json!({
        "Notice": { "tree": { "component": "Stack", "when": "1 +", "children": [] } }
    });
    let mut found = coded(
        &lint_with_options(&document, &with_definition()).diagnostics,
        LintCode::E400,
    );
    found.sort();
    assert_eq!(
        found,
        vec![
            "$.components.Notice.tree.when".to_string(),
            "$.tree.children[0].when".to_string()
        ]
    );
}

// ── W800: bind resolution by component category ─────────────────

#[test]
fn input_bound_to_a_group_or_display_item_is_w800() {
    assert_eq!(
        w800(json!([{ "component": "TextInput", "bind": "applicant" }])),
        vec!["$.tree.children[0]".to_string()]
    );
    assert_eq!(
        w800(json!([{ "component": "TextInput", "bind": "notice" }])),
        vec!["$.tree.children[0]".to_string()]
    );
}

#[test]
fn display_bound_to_a_missing_item_is_w800() {
    assert_eq!(
        w800(json!([{ "component": "Text", "bind": "ghost" }])),
        vec!["$.tree.children[0]".to_string()]
    );
}

#[test]
fn data_table_bound_to_a_non_repeatable_group_is_w800() {
    assert_eq!(
        w800(json!([{
            "component": "DataTable", "bind": "applicant",
            "columns": [{ "header": "First", "bind": "first" }]
        }])),
        vec!["$.tree.children[0]".to_string()]
    );
}

#[test]
fn binds_each_category_accepts_are_clean() {
    let clean = [
        json!({ "component": "Text", "bind": "name" }),
        json!({ "component": "Text", "bind": "notice" }),
        json!({ "component": "Text", "text": "Static" }),
        json!({ "component": "Accordion", "bind": "rows",
                "children": [{ "component": "NumberInput", "bind": "amount" }] }),
        json!({ "component": "DataTable", "bind": "rows",
                "columns": [{ "header": "Amount", "bind": "amount" }] }),
    ];
    for node in clean {
        assert_eq!(w800(json!([node.clone()])), Vec::<String>::new(), "{node}");
    }
}

// ── W708 / W709: theme tokens against the Token Registry ─────────

fn theme(tokens: Value) -> Value {
    json!({ "$formspecTheme": "1.0", "version": "1.0.0", "tokens": tokens })
}

#[test]
fn unregistered_and_uncategorized_tokens_have_one_code_each() {
    let diagnostics = lint(&theme(json!({
        "typography.body": "16px",
        "elevation.card": "0 1px 2px #000",
        "border.subtle": "1px solid #ccc",
        "madeUpCategory.weird": "value",
        "color.accent": "#ff0000",
        "x-brand": "red"
    })))
    .diagnostics;
    let token_findings: Vec<(String, &str, &str)> = diagnostics
        .iter()
        .map(|diagnostic| (diagnostic.code.to_string(), diagnostic))
        .filter(|(code, _)| code == "W708" || code == "W710")
        .map(|(code, diagnostic)| (code, diagnostic.path.as_str(), diagnostic.message.as_str()))
        .collect();
    let codes: Vec<(&str, &str)> = token_findings
        .iter()
        .map(|(code, path, _)| (code.as_str(), *path))
        .collect();
    // W708: token-registry §5.3 (THEME-TOKEN-UNREGISTERED); W710: Theme §3.2's SHOULD.
    assert_eq!(
        codes,
        vec![
            ("W708", "$.tokens.color.accent"),
            ("W710", "$.tokens.madeUpCategory.weird")
        ]
    );
    assert!(
        token_findings[0].2.contains("brand token"),
        "{}",
        token_findings[0].2
    );
}

#[test]
fn w709_lists_every_undeclared_platform_token_in_one_finding() {
    let diagnostics = lint(&theme(json!({ "color.primary": "#0050b3" }))).diagnostics;
    let w709: Vec<&LintDiagnostic> = diagnostics
        .iter()
        .filter(|diagnostic| diagnostic.code == LintCode::W709)
        .collect();
    assert_eq!(w709.len(), 1, "{w709:?}");
    assert_eq!(w709[0].path, "$.tokens");
    let listed: Vec<&str> = w709[0]
        .message
        .split(|c: char| c == ',' || c.is_whitespace())
        .filter(|word| word.contains('.'))
        .collect();
    assert!(listed.contains(&"spacing.md"), "{listed:?}");
    assert!(!listed.contains(&"color.primary"), "{listed:?}");
}

// Component §4.4 item 2: inside a repeat template, a child bind is the Item's path relative
// to the repeatable group — a dotted path through nested non-repeatable groups included.
#[test]
fn relative_paths_inside_a_repeat_template_resolve_against_the_group() {
    let definition = json!({
        "$formspec": "1.0", "url": "urn:test:employers", "version": "1.0.0",
        "status": "draft", "title": "Employers",
        "items": [{
            "key": "employers", "type": "group", "label": "Employers", "repeatable": true,
            "children": [
                { "key": "payerName", "type": "field", "dataType": "string", "label": "Payer" },
                { "key": "contact", "type": "group", "label": "Contact",
                  "children": [{ "key": "phone", "type": "field", "dataType": "string", "label": "Phone" }] }
            ]
        }]
    });
    let options = LintOptions {
        definition_document: Some(definition),
        ..Default::default()
    };
    let document = json!({
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "urn:test:employers" },
        "tree": { "component": "Stack", "children": [
            { "component": "Accordion", "bind": "employers", "children": [
                { "component": "TextInput", "bind": "payerName" },
                { "component": "TextInput", "bind": "contact.phone" },
                { "component": "Text", "bind": "contact.phone" }
            ] },
            { "component": "Text", "bind": "contact.phone" }
        ] }
    });
    assert_eq!(
        coded(
            &lint_with_options(&document, &options).diagnostics,
            LintCode::W800
        ),
        vec!["$.tree.children[1]".to_string()]
    );
}

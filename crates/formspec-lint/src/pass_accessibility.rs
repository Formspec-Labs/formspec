//! Pass 10: accessibility document rules (ADR 0166 §3, step 1).
//!
//! Rules a person could check by reading the Definition, Theme and Locale documents alone, each tagged
//! with the WCAG 2.2 success criteria it serves (`wcag` in `specs/lint-codes.json`). The rules'
//! severities come from that registry too, so the registry alone decides what blocks a publish.
//! Anything that needs a rendered page, a human's judgement or a language the heuristics do not read
//! belongs to the reference-renderer check or the manual-review list (`specs/accessibility/document-checks.md`).
//!
//! Cost: one walk of the item tree plus one pass over each Locale's strings, so O(items + strings)
//! per document and O(items x locales) for a publish.
#![allow(clippy::missing_docs_in_private_items)]

use std::collections::{HashMap, HashSet};

use serde_json::{Value, json};

use crate::generated::LintCode;
use crate::metadata;
use crate::pass_locale::split_locale_key;
use crate::pass_theme;
use crate::semantic_helpers::json_path_member;
use crate::types::{LintDiagnostic, LintSeverity};

pub(crate) const PASS: u8 = 10;

/// An accessibility diagnostic whose severity is the registry's.
pub(crate) fn diagnostic(
    code: LintCode,
    path: impl Into<String>,
    message: impl Into<String>,
) -> LintDiagnostic {
    metadata::with_metadata(LintDiagnostic {
        code,
        pass: PASS,
        severity: metadata::registry_severity(code),
        path: path.into(),
        message: message.into(),
        suggested_fix: None,
        spec_ref: None,
    })
}

// ── text heuristics ─────────────────────────────────────────────

fn is_blank(text: &str) -> bool {
    text.trim().is_empty()
}

/// Lowercased, whitespace-collapsed; `None` for text that cannot be compared (blank, or computed by `{{ }}`).
fn comparable(text: &str) -> Option<String> {
    if is_blank(text) || text.contains("{{") {
        return None;
    }
    Some(
        text.split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .to_lowercase(),
    )
}

const COLOURS: &[&str] = &[
    "red", "green", "blue", "yellow", "orange", "purple", "pink", "grey", "gray",
];
/// A colour word right before one of these names the thing by its colour ("the red button").
const COLOURED_THINGS: &[&str] = &[
    "field",
    "fields",
    "box",
    "boxes",
    "button",
    "buttons",
    "text",
    "border",
    "borders",
    "item",
    "items",
    "section",
    "sections",
    "outline",
    "asterisk",
    "asterisks",
    "star",
    "label",
    "labels",
    "icon",
    "icons",
    "line",
    "lines",
    "arrow",
    "bar",
    "banner",
    "message",
    "messages",
];
/// A colour word within three words after one of these says the colour carries the meaning ("marked in red").
const COLOUR_CUES: &[&str] = &[
    "marked",
    "highlighted",
    "shown",
    "indicated",
    "coloured",
    "colored",
    "outlined",
    "flagged",
    "underlined",
    "shaded",
    "displayed",
];

/// The phrase in `text` that makes a colour carry an instruction (WCAG 1.4.1, 1.3.3), if any.
/// English wording only; other languages go to manual review.
fn colour_as_instruction(text: &str) -> Option<String> {
    let lowered = text.to_lowercase();
    let words: Vec<&str> = lowered
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .collect();
    for (i, word) in words.iter().enumerate() {
        let coded = matches!(*word, "color" | "colour")
            && words
                .get(i + 1)
                .is_some_and(|n| matches!(*n, "coded" | "code"));
        let coloured_thing = COLOURS.contains(word)
            && words
                .get(i + 1)
                .is_some_and(|n| COLOURED_THINGS.contains(n));
        let cued = COLOURS.contains(word)
            && words[i.saturating_sub(3)..i]
                .iter()
                .any(|w| COLOUR_CUES.contains(w));
        if coded || coloured_thing || cued {
            let from = i.saturating_sub(3);
            let to = (i + 2).min(words.len());
            return Some(words[from..to].join(" "));
        }
    }
    None
}

/// Whether `text` holds Markdown image syntax, which the closed rich-text subset does not render.
fn has_image_syntax(text: &str) -> bool {
    text.find("![").is_some_and(|at| text[at..].contains("]("))
}

// ── Definition ──────────────────────────────────────────────────

/// One item in the tree with where it sits.
struct Node<'a> {
    item: &'a Value,
    path: String,
}

fn nodes<'a>(items: &'a [Value], base: &str, out: &mut Vec<Node<'a>>) {
    for (i, item) in items.iter().enumerate() {
        let path = format!("{base}[{i}]");
        out.push(Node {
            item,
            path: path.clone(),
        });
        if let Some(children) = item.get("children").and_then(Value::as_array) {
            nodes(children, &format!("{path}.children"), out);
        }
    }
}

fn item_nodes(def: &Value) -> Vec<Node<'_>> {
    let mut out = Vec::new();
    if let Some(items) = def.get("items").and_then(Value::as_array) {
        nodes(items, "$.items", &mut out);
    }
    out
}

fn is_input_or_group(item: &Value) -> bool {
    matches!(
        item.get("type").and_then(Value::as_str),
        Some("field" | "group")
    )
}

/// The author-visible text properties of an item that instructions live in.
fn item_texts<'a>(node: &'a Node<'_>) -> Vec<(String, &'a str)> {
    let mut texts = Vec::new();
    for prop in ["label", "hint", "description"] {
        if let Some(text) = node.item.get(prop).and_then(Value::as_str) {
            texts.push((format!("{}.{prop}", node.path), text));
        }
    }
    if let Some(labels) = node.item.get("labels").and_then(Value::as_object) {
        for (context, text) in labels {
            if let Some(text) = text.as_str() {
                texts.push((
                    json_path_member(&format!("{}.labels", node.path), context),
                    text,
                ));
            }
        }
    }
    texts
}

fn check_options(options: &[Value], base: &str, out: &mut Vec<LintDiagnostic>) {
    let mut seen: HashMap<String, usize> = HashMap::new();
    for (i, option) in options.iter().enumerate() {
        let path = format!("{base}[{i}].label");
        let label = option.get("label").and_then(Value::as_str).unwrap_or("");
        if is_blank(label) {
            out.push(diagnostic(
                LintCode::E1902,
                path,
                "Option has an empty label, so a screen reader announces nothing for it",
            ));
        } else if let Some(norm) = comparable(label)
            && let Some(first) = seen.insert(norm, i)
        {
            out.push(diagnostic(
                LintCode::W1901,
                path,
                format!("Option label {label:?} repeats the label of option {first}; the two cannot be told apart"),
            ));
        }
    }
}

fn check_sibling_labels(items: &[Value], base: &str, out: &mut Vec<LintDiagnostic>) {
    let mut seen: HashMap<String, usize> = HashMap::new();
    for (i, item) in items.iter().enumerate() {
        if is_input_or_group(item)
            && let Some(label) = item.get("label").and_then(Value::as_str)
            && let Some(norm) = comparable(label)
            && let Some(first) = seen.insert(norm, i)
        {
            out.push(diagnostic(
                LintCode::W1902,
                format!("{base}[{i}].label"),
                format!("Label {label:?} repeats the label of {base}[{first}] in the same group"),
            ));
        }
        if let Some(children) = item.get("children").and_then(Value::as_array) {
            check_sibling_labels(children, &format!("{base}[{i}].children"), out);
        }
    }
}

/// Accessibility rules that read only the Definition.
pub(crate) fn lint_definition(def: &Value) -> Vec<LintDiagnostic> {
    let mut out = Vec::new();
    let nodes = item_nodes(def);
    for node in &nodes {
        if is_input_or_group(node.item) {
            let label = node.item.get("label").and_then(Value::as_str).unwrap_or("");
            if is_blank(label) {
                out.push(diagnostic(
                    LintCode::E1900,
                    format!("{}.label", node.path),
                    "Field or group has an empty label, so it has no accessible name",
                ));
            }
        }
        if let Some(options) = node.item.get("options").and_then(Value::as_array) {
            check_options(options, &format!("{}.options", node.path), &mut out);
        }
        for (path, text) in item_texts(node) {
            check_text(text, &path, &mut out);
        }
    }
    if let Some(sets) = def.get("optionSets").and_then(Value::as_object) {
        for (name, set) in sets {
            if let Some(options) = set.get("options").and_then(Value::as_array) {
                check_options(
                    options,
                    &format!("{}.options", json_path_member("$.optionSets", name)),
                    &mut out,
                );
            }
        }
    }
    if let Some(items) = def.get("items").and_then(Value::as_array) {
        check_sibling_labels(items, "$.items", &mut out);
    }
    out
}

/// Rules over a piece of author-visible text, wherever it lives.
fn check_text(text: &str, path: &str, out: &mut Vec<LintDiagnostic>) {
    if let Some(phrase) = colour_as_instruction(text) {
        out.push(diagnostic(
            LintCode::W1903,
            path,
            format!("Text appears to point at something by its colour alone ({phrase:?}); say it in words or with a shape too"),
        ));
    }
    if has_image_syntax(text) {
        out.push(diagnostic(
            LintCode::W1904,
            path,
            "Text uses Markdown image syntax, which the rich-text subset does not render; it would be read aloud as punctuation",
        ));
    }
}

// ── Locale ──────────────────────────────────────────────────────

/// A string key split into the item key, its property terminal and the option value when it is an option label.
enum Addressed<'a> {
    ItemProperty { property: &'a str },
    OptionLabel,
}

fn address(parts: &[String]) -> Option<Addressed<'_>> {
    match parts {
        [_, property] => Some(Addressed::ItemProperty { property }),
        [_, options, .., label] if options == "options" && label == "label" && parts.len() >= 4 => {
            Some(Addressed::OptionLabel)
        }
        _ => None,
    }
}

/// The text of `key.label` (with or without an `@context`) in `locale`, following its `fallback` chain
/// through `peers`; `None` when no Locale in the chain writes one.
fn label_in_chain<'a>(
    locale: &'a Value,
    key: &str,
    peers: &'a [Value],
    seen: &mut HashSet<String>,
) -> Option<&'a str> {
    let strings = locale.get("strings").and_then(Value::as_object)?;
    let prefix = format!("{key}.label");
    for (k, v) in strings {
        if (k == &prefix || k.starts_with(&format!("{prefix}@"))) && v.as_str().is_some() {
            return v.as_str();
        }
    }
    let fallback = locale.get("fallback").and_then(Value::as_str)?;
    if !seen.insert(fallback.to_lowercase()) {
        return None;
    }
    let next = peers.iter().find(|p| {
        p.get("locale")
            .and_then(Value::as_str)
            .is_some_and(|l| l.eq_ignore_ascii_case(fallback))
    })?;
    label_in_chain(next, key, peers, seen)
}

/// Accessibility rules for one Locale. `definition` and `peers` (the other pinned Locales, for the
/// `fallback` chain) are optional; without a Definition only the rules that read the Locale alone run.
pub(crate) fn lint_locale(
    locale: &Value,
    definition: Option<&Value>,
    peers: &[Value],
) -> Vec<LintDiagnostic> {
    let mut out = Vec::new();
    let Some(strings) = locale.get("strings").and_then(Value::as_object) else {
        return out;
    };
    let mut writes_item_labels = false;
    for (key, value) in strings {
        let Some(text) = value.as_str() else { continue };
        if key.starts_with('$') {
            continue;
        }
        let path = json_path_member("$.strings", key);
        let bare = key.split('@').next().unwrap_or(key);
        let parts = split_locale_key(bare);
        match address(&parts) {
            Some(Addressed::ItemProperty { property: "label", .. }) => {
                writes_item_labels = true;
                if is_blank(text) {
                    out.push(diagnostic(
                        LintCode::E1901,
                        &path,
                        "Locale writes an empty label, so the item has no accessible name in this language",
                    ));
                }
                check_text(text, &path, &mut out);
            }
            Some(Addressed::ItemProperty { property: "hint" | "description", .. }) => {
                check_text(text, &path, &mut out);
            }
            Some(Addressed::OptionLabel) if is_blank(text) => out.push(diagnostic(
                LintCode::E1902,
                &path,
                "Locale writes an empty option label, so the option has no accessible name in this language",
            )),
            _ => {}
        }
    }

    // A Locale that translates some labels but not all leaves the rest in the Definition's wording.
    let for_definition = locale["target"]["kind"].as_str() == Some("definition");
    if let Some(def) = definition.filter(|_| writes_item_labels && for_definition) {
        for node in item_nodes(def).iter().filter(|n| is_input_or_group(n.item)) {
            let Some(key) = node.item.get("key").and_then(Value::as_str) else {
                continue;
            };
            let mut seen = HashSet::new();
            if label_in_chain(locale, key, peers, &mut seen).is_none() {
                out.push(diagnostic(
                    LintCode::W1900,
                    "$.strings",
                    format!("Locale has no label for {key:?}; it falls back to the Definition's wording, which may be in another language"),
                ));
            }
        }
    }
    out
}

// ── The publish-time check ──────────────────────────────────────

/// One diagnostic and the pinned document it came from (`definition`, `theme` or `locale:<tag>`).
#[derive(Debug, Clone)]
pub struct AccessibilityFinding {
    /// Which pinned document the finding is in.
    pub document: String,
    /// The lint diagnostic; its severity is the registry's.
    pub diagnostic: LintDiagnostic,
}

/// One accessibility rule's outcome across the pinned documents.
#[derive(Debug, Clone)]
pub struct AccessibilityRuleResult {
    /// The rule.
    pub rule: LintCode,
    /// The registry severity.
    pub severity: LintSeverity,
    /// WCAG success criteria the rule is tagged with.
    pub wcag: Vec<String>,
    /// `false` when the rule found something.
    pub passed: bool,
    /// `<document>#<path>` of every finding.
    pub paths: Vec<String>,
}

/// The document half of the accessibility report (ADR 0166 §3 `documentChecks`).
#[derive(Debug, Clone)]
pub struct AccessibilityChecks {
    /// Version of this linter; changes when a rule is added or changed.
    pub linter_version: &'static str,
    /// Every accessibility rule, passed or not, in registry order.
    pub results: Vec<AccessibilityRuleResult>,
    /// Every finding.
    pub findings: Vec<AccessibilityFinding>,
}

impl AccessibilityChecks {
    /// Whether any finding is an error; errors block publish, warnings are only reported.
    pub fn blocks_publish(&self) -> bool {
        self.findings
            .iter()
            .any(|f| f.diagnostic.severity == LintSeverity::Error)
    }

    /// The `documentChecks` object of the accessibility report.
    pub fn to_json_value(&self) -> Value {
        json!({
            "linterVersion": self.linter_version,
            "results": self.results.iter().map(|r| json!({
                "rule": r.rule.as_wire_str(),
                "severity": r.severity.as_wire_str(),
                "wcag": r.wcag,
                "outcome": if r.passed { "passed" } else { "failed" },
                "paths": r.paths,
            })).collect::<Vec<_>>(),
        })
    }
}

/// Run every accessibility document rule over a form version's pinned documents.
///
/// `theme` is the pinned Theme, if the version has one; `locales` are its pinned Locales. Pure and
/// in-process; O(items x locales).
pub fn check_accessibility(
    definition: &Value,
    theme: Option<&Value>,
    locales: &[Value],
) -> AccessibilityChecks {
    let mut findings = Vec::new();
    let mut add = |document: &str, diagnostics: Vec<LintDiagnostic>| {
        findings.extend(
            diagnostics
                .into_iter()
                .map(|diagnostic| AccessibilityFinding {
                    document: document.to_owned(),
                    diagnostic,
                }),
        );
    };
    add("definition", lint_definition(definition));
    if let Some(theme) = theme {
        add("theme", pass_theme::lint_contrast(theme));
    }
    for locale in locales {
        let tag = locale.get("locale").and_then(Value::as_str).unwrap_or("?");
        add(
            &format!("locale:{tag}"),
            lint_locale(locale, Some(definition), locales),
        );
    }

    let results = metadata::accessibility_codes()
        .map(|rule| {
            let paths: Vec<String> = findings
                .iter()
                .filter(|f| f.diagnostic.code == rule)
                .map(|f| format!("{}#{}", f.document, f.diagnostic.path))
                .collect();
            AccessibilityRuleResult {
                rule,
                severity: metadata::registry_severity(rule),
                wcag: metadata::wcag_criteria(rule).to_vec(),
                passed: paths.is_empty(),
                paths,
            }
        })
        .collect();
    AccessibilityChecks {
        linter_version: env!("CARGO_PKG_VERSION"),
        results,
        findings,
    }
}

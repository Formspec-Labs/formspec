//! Pass 9: Locale document semantic checks.
#![allow(clippy::missing_docs_in_private_items)]

use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

use formspec_core::visit_component_subtree;
use serde_json::Value;

use crate::semantic_helpers::{
    compatible_version_satisfied, component_node_ids, definition_shape_ids, definition_url,
    definition_version, error, item_option_values, json_path_member, option_set_values,
    scan_interpolations, theme_page_ids, warning,
};
use crate::tree;
use crate::types::{LintDiagnostic, LintOptions};

pub(crate) const PASS: u8 = 9;

const FORM_TERMINALS: &[&str] = &["title", "description"];
/// Locale §3.1.1 Item properties; each also takes an `@context` suffix.
const ITEM_CONTEXT_TERMINALS: &[&str] = &["label", "description", "hint"];
/// Locale §3.1.4 per-Bind message keys; no `@context` suffix.
const ITEM_MESSAGE_TERMINALS: &[&str] = &["constraintMessage", "requiredMessage"];
const DATA_TERMINALS: &[&str] = &[
    "type",
    "dataType",
    "required",
    "readonly",
    "relevant",
    "calculate",
    "constraint",
    "default",
    "value",
    "bind",
    "path",
];
/// Locale §3.1.9 `SurfaceStringKey` suffixes, read from the embedded Locale
/// schema enum so the lint never carries a second copy of the closed set.
fn surface_shell_string_keys() -> &'static HashSet<String> {
    const SHELL_PREFIX: &str = "$module.x-formspec-surface.shell.";
    static KEYS: OnceLock<HashSet<String>> = OnceLock::new();
    KEYS.get_or_init(|| {
        let schema: Value = serde_json::from_str(include_str!("../schemas/locale.schema.json"))
            .expect("embedded Locale schema is valid JSON");
        schema["$defs"]["SurfaceShellStringKey"]["enum"]
            .as_array()
            .expect("Locale schema declares the SurfaceShellStringKey enum")
            .iter()
            .filter_map(|key| key.as_str()?.strip_prefix(SHELL_PREFIX))
            .map(str::to_owned)
            .collect()
    })
}

pub(crate) fn lint_locale(locale: &Value, options: &LintOptions) -> Vec<LintDiagnostic> {
    let mut analyzer = Analyzer {
        locale,
        options,
        definition_index: options
            .definition_document
            .as_ref()
            .map(tree::build_item_index),
        option_sets: options
            .definition_document
            .as_ref()
            .map(option_set_values)
            .unwrap_or_default(),
        item_values: options
            .definition_document
            .as_ref()
            .map(item_option_values)
            .unwrap_or_default(),
        shape_ids: options
            .definition_document
            .as_ref()
            .map(definition_shape_ids)
            .unwrap_or_default(),
        page_ids: options
            .theme_document
            .as_ref()
            .map(theme_page_ids)
            .unwrap_or_default(),
        component_node_ids: component_node_ids(&options.component_documents),
        component_nodes: component_nodes_by_id(&options.component_documents),
        diagnostics: Vec::new(),
    };
    analyzer.check_definition_target();
    analyzer.check_strings();
    analyzer.check_fallbacks();
    analyzer.diagnostics
}

struct Analyzer<'a> {
    locale: &'a Value,
    options: &'a LintOptions,
    definition_index: Option<tree::ItemTreeIndex>,
    option_sets: HashMap<String, HashSet<String>>,
    item_values: HashMap<String, HashSet<String>>,
    shape_ids: HashSet<String>,
    page_ids: HashSet<String>,
    component_node_ids: HashSet<String>,
    component_nodes: HashMap<String, String>,
    diagnostics: Vec<LintDiagnostic>,
}

impl<'a> Analyzer<'a> {
    fn check_definition_target(&mut self) {
        let Some(target) = self.locale.get("target") else {
            return;
        };
        if target.get("kind").and_then(Value::as_str) != Some("definition") {
            return;
        }
        let Some(definition) = self.options.definition_document.as_ref() else {
            return;
        };
        if let (Some(target_url), Some(def_url)) = (
            target.get("url").and_then(Value::as_str),
            definition_url(definition),
        ) && target_url != def_url
        {
            self.diagnostics.push(error(
                crate::LintCode::E1400,
                PASS,
                "$.target.url",
                format!(
                    "Locale target.url ({target_url:?}) does not match paired Definition url ({def_url:?})"
                ),
            ));
        }
        if let (Some(range), Some(version)) = (
            target.get("compatibleVersions").and_then(Value::as_str),
            definition_version(definition),
        ) && compatible_version_satisfied(range, version) != Some(true)
        {
            self.diagnostics.push(warning(
                crate::LintCode::W1400,
                PASS,
                "$.target.compatibleVersions",
                format!(
                    "Locale compatibleVersions ({range:?}) does not confidently include paired Definition version ({version:?})"
                ),
            ));
        }
    }

    fn check_strings(&mut self) {
        let Some(strings) = self.locale.get("strings").and_then(Value::as_object) else {
            return;
        };
        for (key, value) in strings {
            let json_path = json_path_member("$.strings", key);
            if !self.options.no_fel
                && let Some(text) = value.as_str()
            {
                scan_interpolations(
                    text,
                    &json_path,
                    crate::LintCode::E1405,
                    PASS,
                    "Locale string",
                    &mut self.diagnostics,
                );
            }
            self.check_string_key(key, &json_path);
        }
    }

    fn check_string_key(&mut self, key: &str, json_path: &str) {
        if let Some(namespace) = key.strip_prefix('$') {
            self.check_reserved_key(namespace, json_path);
        } else {
            self.check_item_key(key, json_path);
        }
    }

    fn check_reserved_key(&mut self, key_without_dollar: &str, json_path: &str) {
        let parts = split_locale_key(key_without_dollar);
        let Some(namespace) = parts.first().map(String::as_str) else {
            self.diagnostics.push(error(
                crate::LintCode::E1401,
                PASS,
                json_path,
                "Locale string key uses an empty reserved namespace",
            ));
            return;
        };
        match namespace {
            "form" => self.check_form_key(&parts[1..], json_path),
            "shape" => self.check_shape_key(&parts[1..], json_path),
            "optionSet" => self.check_option_set_key(&parts[1..], json_path),
            "page" => self.check_page_key(&parts[1..], json_path),
            "component" => self.check_component_key(&parts[1..], json_path),
            "module" => self.check_module_key(&parts[1..], json_path),
            other => self.diagnostics.push(error(
                crate::LintCode::E1401,
                PASS,
                json_path,
                format!("Locale string key uses unknown reserved namespace ${other}"),
            )),
        }
    }

    fn check_module_key(&mut self, parts: &[String], json_path: &str) {
        if parts.len() != 3 || parts.iter().any(String::is_empty) {
            self.diagnostics.push(error(
                crate::LintCode::E1401,
                PASS,
                json_path,
                "Locale $module key must use $module.<modId>.<nodeId>.<property>",
            ));
            return;
        }

        if parts[0] == "x-formspec-surface"
            && parts[1] == "shell"
            && !surface_shell_string_keys().contains(strip_context(&parts[2]))
        {
            self.diagnostics.push(error(
                crate::LintCode::E1401,
                PASS,
                json_path,
                format!(
                    "Locale Surface shell key references unknown SurfaceStringKey {:?}",
                    strip_context(&parts[2])
                ),
            ));
        }
    }

    fn check_form_key(&mut self, parts: &[String], json_path: &str) {
        if parts.len() != 1 || !FORM_TERMINALS.contains(&strip_context(&parts[0])) {
            self.diagnostics.push(error(
                crate::LintCode::E1401,
                PASS,
                json_path,
                "Locale $form key must target title or description",
            ));
        }
    }

    fn check_shape_key(&mut self, parts: &[String], json_path: &str) {
        if parts.len() != 2 || strip_context(&parts[1]) != "message" {
            self.diagnostics.push(error(
                crate::LintCode::E1401,
                PASS,
                json_path,
                "Locale $shape key must use $shape.<shapeId>.message",
            ));
            return;
        }
        if self.options.definition_document.is_some() && !self.shape_ids.contains(&parts[0]) {
            self.diagnostics.push(error(
                crate::LintCode::E1404,
                PASS,
                json_path,
                format!(
                    "Locale shape key references unknown shape id {:?}",
                    parts[0]
                ),
            ));
        }
    }

    fn check_option_set_key(&mut self, parts: &[String], json_path: &str) {
        if parts.len() != 3 || parts[2] != "label" {
            self.diagnostics.push(error(
                crate::LintCode::E1401,
                PASS,
                json_path,
                "Locale $optionSet key must use $optionSet.<setName>.<value>.label, with no @context suffix",
            ));
            return;
        }
        if self.options.definition_document.is_none() {
            return;
        }
        let Some(values) = self.option_sets.get(&parts[0]) else {
            self.diagnostics.push(error(
                crate::LintCode::E1403,
                PASS,
                json_path,
                format!(
                    "Locale optionSet key references unknown option set {:?}",
                    parts[0]
                ),
            ));
            return;
        };
        if !values.contains(&parts[1]) {
            self.diagnostics.push(error(
                crate::LintCode::E1403,
                PASS,
                json_path,
                format!(
                    "Locale optionSet key references unknown option value {:?} in option set {:?}",
                    parts[1], parts[0]
                ),
            ));
        }
    }

    fn check_page_key(&mut self, parts: &[String], json_path: &str) {
        if parts.len() != 2 || !FORM_TERMINALS.contains(&strip_context(&parts[1])) {
            self.diagnostics.push(error(
                crate::LintCode::E1401,
                PASS,
                json_path,
                "Locale $page key must use $page.<pageId>.title or $page.<pageId>.description",
            ));
            return;
        }
        if self.options.theme_document.is_some() && !self.page_ids.contains(&parts[0]) {
            self.diagnostics.push(error(
                crate::LintCode::E1410,
                PASS,
                json_path,
                format!(
                    "Locale page key references unknown Theme page id {:?}",
                    parts[0]
                ),
            ));
        }
    }

    fn check_component_key(&mut self, parts: &[String], json_path: &str) {
        if parts.len() < 2 {
            self.diagnostics.push(error(
                crate::LintCode::E1401,
                PASS,
                json_path,
                "Locale $component key must use $component.<nodeId>.<property>",
            ));
            return;
        }
        if self.options.component_documents.is_empty() {
            return;
        }

        if !self.component_node_ids.contains(&parts[0]) {
            self.diagnostics.push(error(
                crate::LintCode::E1411,
                PASS,
                json_path,
                format!(
                    "Locale component key references unknown Component node id {:?}",
                    parts[0]
                ),
            ));
            return;
        }
        let Some(component) = self.component_nodes.get(&parts[0]) else {
            return;
        };
        if !component_property_is_localizable(component, &parts[1..]) {
            self.diagnostics.push(error(
                crate::LintCode::E1401,
                PASS,
                json_path,
                format!(
                    "Locale component key targets unsupported localizable property on {component}"
                ),
            ));
        }
    }

    /// Checks an `<itemKey>.<property>` string key (Locale §3.1).
    ///
    /// The first key segment is always the bare Item `key`, resolved anywhere in
    /// the item tree; everything after it is the property. Dotted template paths
    /// and indexed keys never name an Item, so they are E1402 even without a
    /// paired Definition. A malformed property on a real Item is E1401.
    fn check_item_key(&mut self, key: &str, json_path: &str) {
        let parts = split_locale_key(key);
        let Some((item_key, property)) = parts.split_first().filter(|(_, p)| !p.is_empty()) else {
            self.diagnostics.push(error(
                crate::LintCode::E1401,
                PASS,
                json_path,
                "Locale item key must use <itemKey>.<property>",
            ));
            return;
        };
        let kind = classify_item_property(property);

        if let Some(depth) = self.dotted_template_path_depth(property, &kind) {
            let path = parts[..=depth].join(".");
            let bare = format!(
                "{}.{}",
                strip_indices(&parts[depth]),
                parts[depth + 1..].join(".")
            );
            self.diagnostics.push(error(
                crate::LintCode::E1402,
                PASS,
                json_path,
                format!(
                    "Locale item key uses dotted template path {path:?}; address the Item by its bare key, e.g. {bare:?}"
                ),
            ));
            return;
        }

        let mut item_path = None;
        if !is_bare_item_key(item_key) {
            self.diagnostics.push(error(
                crate::LintCode::E1402,
                PASS,
                json_path,
                format!(
                    "Locale item key {item_key:?} is not a bare Item key; drop repeat indices, e.g. {:?}",
                    strip_indices(item_key)
                ),
            ));
        } else if self.options.definition_document.is_some()
            && let Some(index) = self.definition_index.as_ref()
        {
            match index.by_key.get(item_key) {
                // Core §4.2.1 E200: a duplicated key names no single Item.
                Some(_) if index.ambiguous_keys.contains(item_key) => {
                    self.diagnostics.push(error(
                        crate::LintCode::E1402,
                        PASS,
                        json_path,
                        format!(
                            "Locale item key {item_key:?} matches more than one Definition Item (duplicate key, E200)"
                        ),
                    ));
                }
                Some(item_ref) => item_path = Some(item_ref.full_path.as_str()),
                None => self.diagnostics.push(error(
                    crate::LintCode::E1402,
                    PASS,
                    json_path,
                    format!("Locale item key references unknown Definition Item key {item_key:?}"),
                )),
            }
        }

        match kind {
            ItemProperty::Presentation | ItemProperty::Errors => {}
            ItemProperty::Option(value) => {
                let Some(item_path) = item_path else {
                    return;
                };
                match self.item_values.get(item_path) {
                    Some(values) if values.contains(value) => {}
                    Some(_) => self.diagnostics.push(error(
                        crate::LintCode::E1403,
                        PASS,
                        json_path,
                        format!(
                            "Locale option key references unknown option value {value:?} on item {item_key:?}"
                        ),
                    )),
                    None => self.diagnostics.push(error(
                        crate::LintCode::E1403,
                        PASS,
                        json_path,
                        format!(
                            "Locale option key references option value {value:?} on item {item_key:?}, but the item has no option values"
                        ),
                    )),
                }
            }
            ItemProperty::Data(terminal) => self.diagnostics.push(error(
                crate::LintCode::E1407,
                PASS,
                json_path,
                format!("Locale key targets non-presentation property {terminal:?}"),
            )),
            ItemProperty::Unsupported(head) => {
                let message = match head {
                    "options" => "Locale option key must use <itemKey>.options.<value>.label, with no @context suffix".to_owned(),
                    "errors" => "Locale error key must use <itemKey>.errors.<code>, with one code segment".to_owned(),
                    _ => format!(
                        "Locale key property {:?} is not a localizable Item property",
                        property.join(".")
                    ),
                };
                self.diagnostics
                    .push(error(crate::LintCode::E1401, PASS, json_path, message));
            }
        }
    }

    /// Index into `property` of the last item segment of a dotted template path.
    ///
    /// `address.city.label` has property `[city, label]`; that is not a known
    /// property shape, but `city` is an item segment and `[label]` is, so the key
    /// is the dotted template path `address.city` and this returns `1`. Returns
    /// `None` for well-formed keys and for malformed properties (E1401/E1407).
    ///
    /// With a paired Definition, item segments must be Definition Item keys, so
    /// `city.foo.label` is a typo (E1401). Without one, any key-shaped segment
    /// other than the `options` / `errors` property heads counts.
    fn dotted_template_path_depth(
        &self,
        property: &[String],
        kind: &ItemProperty<'_>,
    ) -> Option<usize> {
        if kind.is_known() {
            return None;
        }
        (1..property.len()).find(|&split| {
            property[..split]
                .iter()
                .all(|segment| self.is_item_path_segment(segment))
                && classify_item_property(&property[split..]).is_known()
        })
    }

    /// Whether `segment` can name an Item inside a dotted template path.
    fn is_item_path_segment(&self, segment: &str) -> bool {
        let bare = strip_indices(segment);
        if !is_bare_item_key(&bare) {
            return false;
        }
        match self.definition_index.as_ref() {
            Some(index) => index.by_key.contains_key(&bare),
            None => !matches!(bare.as_str(), "options" | "errors"),
        }
    }

    fn check_fallbacks(&mut self) {
        let Some(identity) = locale_identity(self.locale) else {
            return;
        };
        let mut fallback_by_identity = HashMap::new();
        add_locale_fallback(self.locale, &mut fallback_by_identity);
        for peer in &self.options.locale_documents {
            add_locale_fallback(peer, &mut fallback_by_identity);
        }

        if let Some(Some(fallback)) = fallback_by_identity.get(&identity)
            && !fallback_by_identity.contains_key(&identity.with_locale(fallback))
        {
            self.diagnostics.push(warning(
                crate::LintCode::W1401,
                PASS,
                "$.fallback",
                format!("Locale fallback target {fallback:?} was not supplied in lint context"),
            ));
        }

        let mut seen = HashSet::new();
        let mut stack = HashSet::new();
        if has_fallback_cycle(&identity, &fallback_by_identity, &mut seen, &mut stack) {
            self.diagnostics.push(error(
                crate::LintCode::E1406,
                PASS,
                "$.fallback",
                "Locale fallback chain contains a cycle",
            ));
        }
    }
}

fn component_nodes_by_id(documents: &[Value]) -> HashMap<String, String> {
    let mut nodes = HashMap::new();
    for document in documents {
        if let Some(tree) = document.get("tree") {
            collect_component_nodes_from_tree(tree, &mut nodes);
        }
        if let Some(components) = document.get("components").and_then(Value::as_object) {
            for definition in components.values() {
                if let Some(tree) = definition.get("tree") {
                    collect_component_nodes_from_tree(tree, &mut nodes);
                }
            }
        }
    }
    nodes
}

fn collect_component_nodes_from_tree(tree: &Value, nodes: &mut HashMap<String, String>) {
    let child_seg = |parent: &str, i: usize| format!("{parent}.children[{i}]");
    visit_component_subtree(tree, "$", &child_seg, &mut |node, _path| {
        let Some(id) = node.get("id").and_then(Value::as_str) else {
            return;
        };
        let Some(component) = node.get("component").and_then(Value::as_str) else {
            return;
        };
        nodes.insert(id.to_string(), component.to_string());
    });
}

fn component_property_is_localizable(component: &str, parts: &[String]) -> bool {
    match component {
        "Section" => is_one_part(parts, &["title", "description"]),
        "Heading" | "Text" | "Alert" | "Badge" => is_one_part(parts, &["text"]),
        "Divider" | "ProgressBar" => is_one_part(parts, &["label"]),
        "Card" => is_one_part(parts, &["title", "subtitle"]),
        "Collapsible" | "Panel" => is_one_part(parts, &["title"]),
        "ConditionalGroup" => is_one_part(parts, &["fallback"]),
        "Tabs" => is_indexed_part(parts, "tabLabels"),
        "Accordion" => is_indexed_part(parts, "labels"),
        "ActionButton" => is_one_part(parts, &["label", "pendingLabel"]),
        "DataTable" => is_indexed_child_part(parts, "columns", "header"),
        "Modal" => is_one_part(parts, &["title", "triggerLabel"]),
        "Popover" => is_one_part(parts, &["triggerLabel"]),
        "Summary" => is_indexed_child_part(parts, "items", "label"),
        "Select" | "NumberInput" | "DatePicker" | "MoneyInput" => {
            is_one_part(parts, &["placeholder"])
        }
        "TextInput" => is_one_part(parts, &["placeholder", "prefix", "suffix"]),
        _ => false,
    }
}

fn is_one_part(parts: &[String], allowed: &[&str]) -> bool {
    parts.len() == 1 && allowed.contains(&strip_context(&parts[0]))
}

fn is_indexed_part(parts: &[String], property: &str) -> bool {
    parts.len() == 1 && indexed_property_name(&parts[0]) == Some(property)
}

fn is_indexed_child_part(parts: &[String], property: &str, child_property: &str) -> bool {
    parts.len() == 2
        && indexed_property_name(&parts[0]) == Some(property)
        && strip_context(&parts[1]) == child_property
}

fn indexed_property_name(part: &str) -> Option<&str> {
    let part = strip_context(part);
    let (name, index) = part.split_once('[')?;
    let index = index.strip_suffix(']')?;
    if name.is_empty() || index.is_empty() || !index.chars().all(|ch| ch.is_ascii_digit()) {
        return None;
    }
    Some(name)
}

/// The property half of an `<itemKey>.<property>` Locale key.
#[derive(Debug, PartialEq, Eq)]
enum ItemProperty<'a> {
    /// `label` / `description` / `hint` (optional `@context`), or
    /// `constraintMessage` / `requiredMessage`.
    Presentation,
    /// `errors.<CODE>`.
    Errors,
    /// `options.<value>.label` (no `@context`), carrying the option value.
    Option(&'a str),
    /// A data or behavior property Locale must not target (E1407).
    Data(&'a str),
    /// Anything else (E1401), carrying the property's first segment.
    Unsupported(&'a str),
}

impl ItemProperty<'_> {
    /// Whether the property has a shape Locale defines, localizable or not.
    fn is_known(&self) -> bool {
        !matches!(self, Self::Unsupported(_))
    }
}

/// Classifies an Item property exactly as processors read it (Locale §3.1.1–§3.1.4).
fn classify_item_property(property: &[String]) -> ItemProperty<'_> {
    let Some(first) = property.first() else {
        return ItemProperty::Unsupported("");
    };
    let terminal = strip_context(first);
    match (terminal, property) {
        (t, [_]) if ITEM_CONTEXT_TERMINALS.contains(&t) => ItemProperty::Presentation,
        (t, [only]) if ITEM_MESSAGE_TERMINALS.contains(&t) && only == t => {
            ItemProperty::Presentation
        }
        ("errors", [errors, _]) if errors == "errors" => ItemProperty::Errors,
        ("options", [options, value, label]) if options == "options" && label == "label" => {
            ItemProperty::Option(value)
        }
        (t, _) if DATA_TERMINALS.contains(&t) => ItemProperty::Data(t),
        (t, _) => ItemProperty::Unsupported(t),
    }
}

/// Core §4.2.1: an Item `key` matches `[a-zA-Z][a-zA-Z0-9_]*`.
fn is_bare_item_key(segment: &str) -> bool {
    let mut chars = segment.chars();
    chars.next().is_some_and(|ch| ch.is_ascii_alphabetic())
        && chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
}

/// Drops `[...]` repeat index or wildcard groups from a key segment.
fn strip_indices(segment: &str) -> String {
    let mut out = String::with_capacity(segment.len());
    let mut depth = 0_usize;
    for ch in segment.chars() {
        match ch {
            '[' => depth += 1,
            ']' => depth = depth.saturating_sub(1),
            _ if depth == 0 => out.push(ch),
            _ => {}
        }
    }
    out
}

fn strip_context(part: &str) -> &str {
    part.split_once('@').map_or(part, |(base, _)| base)
}

fn split_locale_key(key: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut escaped = false;
    for ch in key.chars() {
        if escaped {
            current.push(ch);
            escaped = false;
        } else if ch == '\\' {
            escaped = true;
        } else if ch == '.' {
            parts.push(std::mem::take(&mut current));
        } else {
            current.push(ch);
        }
    }
    parts.push(current);
    parts
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct LocaleIdentity {
    target_kind: String,
    target_url: String,
    locale: String,
}

impl LocaleIdentity {
    fn with_locale(&self, locale: &str) -> Self {
        Self {
            target_kind: self.target_kind.clone(),
            target_url: self.target_url.clone(),
            locale: normalize_locale(locale),
        }
    }
}

fn locale_identity(doc: &Value) -> Option<LocaleIdentity> {
    let target = doc.get("target")?;
    Some(LocaleIdentity {
        target_kind: target.get("kind")?.as_str()?.to_string(),
        target_url: target.get("url")?.as_str()?.to_string(),
        locale: normalize_locale(doc.get("locale")?.as_str()?),
    })
}

fn normalize_locale(locale: &str) -> String {
    locale.to_ascii_lowercase()
}

fn add_locale_fallback(
    doc: &Value,
    fallback_by_identity: &mut HashMap<LocaleIdentity, Option<String>>,
) {
    let Some(identity) = locale_identity(doc) else {
        return;
    };
    let fallback = doc
        .get("fallback")
        .and_then(Value::as_str)
        .map(normalize_locale);
    fallback_by_identity.insert(identity, fallback);
}

fn has_fallback_cycle(
    identity: &LocaleIdentity,
    fallback_by_identity: &HashMap<LocaleIdentity, Option<String>>,
    seen: &mut HashSet<LocaleIdentity>,
    stack: &mut HashSet<LocaleIdentity>,
) -> bool {
    if !stack.insert(identity.clone()) {
        return true;
    }
    if !seen.insert(identity.clone()) {
        stack.remove(identity);
        return false;
    }
    if let Some(Some(next_locale)) = fallback_by_identity.get(identity) {
        let next = identity.with_locale(next_locale);
        if fallback_by_identity.contains_key(&next)
            && has_fallback_cycle(&next, fallback_by_identity, seen, stack)
        {
            return true;
        }
    }
    stack.remove(identity);
    false
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]

    use serde_json::json;

    use super::*;
    use crate::types::LintOptions;

    #[test]
    fn reserved_page_component_and_option_terminals_are_validated() {
        let definition = json!({
            "$formspec": "1.0",
            "url": "https://example.com/forms/locale",
            "version": "1.0.0",
            "status": "draft",
            "title": "Locale test",
            "items": [
                { "key": "name", "type": "field", "label": "Name", "dataType": "string" },
                { "key": "choice", "type": "field", "label": "Choice", "dataType": "string", "options": [
                    { "value": "yes", "label": "Yes" }
                ] }
            ]
        });
        let theme = json!({
            "$formspecTheme": "1.0",
            "version": "1.0.0",
            "targetDefinition": { "url": "https://example.com/forms/locale" },
            "pages": [{ "id": "intro", "title": "Intro" }]
        });
        let component = json!({
            "$formspecComponent": "1.0",
            "version": "1.0.0",
            "targetDefinition": { "url": "https://example.com/forms/locale" },
            "tree": {
                "component": "Stack",
                "id": "main",
                "children": [
                    { "component": "Text", "id": "body", "text": "Body" }
                ]
            }
        });
        let locale = json!({
            "$formspecLocale": "2.0",
            "version": "1.0.0",
            "locale": "fr-CA",
            "target": {
                "kind": "definition",
                "url": "https://example.com/forms/locale"
            },
            "strings": {
                "$page.intro.subtitle": "Subtitle",
                "$component.main.label": "Main",
                "$component.body.text": "Body",
                "name.options.yes.label": "Name option",
                "choice.options.yes.label": "Yes"
            }
        });

        let diagnostics = lint_locale(
            &locale,
            &LintOptions {
                definition_document: Some(definition),
                theme_document: Some(theme),
                component_documents: vec![component],
                no_fel: true,
                ..Default::default()
            },
        );

        assert!(diagnostics.iter().any(|diag| {
            diag.code == crate::LintCode::E1401 && diag.path.contains("$page.intro.subtitle")
        }));
        assert!(diagnostics.iter().any(|diag| {
            diag.code == crate::LintCode::E1401 && diag.path.contains("$component.main.label")
        }));
        assert!(diagnostics.iter().any(|diag| {
            diag.code == crate::LintCode::E1403 && diag.path.contains("name.options.yes.label")
        }));
        assert!(!diagnostics.iter().any(|diag| {
            diag.path.contains("$component.body.text")
                || diag.path.contains("choice.options.yes.label")
        }));
    }

    #[test]
    fn definition_target_is_checked_but_app_target_is_not_compared_to_definition() {
        let definition = json!({
            "$formspec": "1.0",
            "url": "https://example.com/forms/expected",
            "version": "1.0.0",
            "status": "draft",
            "title": "Locale test",
            "items": []
        });
        let definition_locale =
            locale_document("definition", "https://example.com/forms/other", "en", None);
        let app_locale = locale_document("app", "https://example.com/apps/intake", "en", None);
        let options = LintOptions {
            definition_document: Some(definition),
            no_fel: true,
            ..Default::default()
        };

        let definition_diagnostics = lint_locale(&definition_locale, &options);
        let app_diagnostics = lint_locale(&app_locale, &options);

        assert!(
            definition_diagnostics
                .iter()
                .any(|diag| { diag.code == crate::LintCode::E1400 && diag.path == "$.target.url" })
        );
        assert!(
            !app_diagnostics
                .iter()
                .any(|diag| diag.code == crate::LintCode::E1400)
        );
    }

    #[test]
    fn module_keys_admit_generic_addresses_and_only_known_surface_shell_keys() {
        let mut locale = locale_document("app", "https://example.com/apps/intake", "en", None);
        locale["strings"] = json!({
            "$module.x-reviewer.case.heading": "Review",
            "$module.x-formspec-surface.shell.navigationLabel": "Pages",
            "$module.x-formspec-surface.shell.slotUnavailableWidgetIncompatible": "Mismatch",
            "$module.x-formspec-surface.shell.notAKey": "Unknown"
        });

        let diagnostics = lint_locale(
            &locale,
            &LintOptions {
                no_fel: true,
                ..Default::default()
            },
        );

        assert!(
            diagnostics.iter().any(|diag| {
                diag.code == crate::LintCode::E1401 && diag.path.contains("notAKey")
            })
        );
        assert!(
            !diagnostics.iter().any(|diag| {
                diag.path.contains("x-reviewer")
                    || diag.path.contains("navigationLabel")
                    || diag.path.contains("slotUnavailableWidgetIncompatible")
            }),
            "{diagnostics:?}"
        );
    }

    #[test]
    fn fallback_lookup_is_case_insensitive_and_bounded_to_target_identity() {
        let current = locale_document(
            "definition",
            "https://example.com/forms/a",
            "fr-CA",
            Some("FR"),
        );
        let same_target = locale_document("definition", "https://example.com/forms/a", "fr", None);
        let other_target = locale_document("definition", "https://example.com/forms/b", "fr", None);

        let resolved = lint_locale(
            &current,
            &LintOptions {
                locale_documents: vec![same_target],
                no_fel: true,
                ..Default::default()
            },
        );
        let isolated = lint_locale(
            &current,
            &LintOptions {
                locale_documents: vec![other_target],
                no_fel: true,
                ..Default::default()
            },
        );

        assert!(
            !resolved
                .iter()
                .any(|diag| diag.code == crate::LintCode::W1401)
        );
        assert!(
            isolated
                .iter()
                .any(|diag| diag.code == crate::LintCode::W1401)
        );
    }

    #[test]
    fn fallback_cycle_detection_never_crosses_target_identity() {
        let current = locale_document(
            "definition",
            "https://example.com/forms/a",
            "fr-CA",
            Some("fr"),
        );
        let same_target = locale_document(
            "definition",
            "https://example.com/forms/a",
            "fr",
            Some("fr-CA"),
        );
        let other_target = locale_document(
            "definition",
            "https://example.com/forms/b",
            "fr",
            Some("fr-CA"),
        );

        let cycle = lint_locale(
            &current,
            &LintOptions {
                locale_documents: vec![same_target],
                no_fel: true,
                ..Default::default()
            },
        );
        let isolated = lint_locale(
            &current,
            &LintOptions {
                locale_documents: vec![other_target],
                no_fel: true,
                ..Default::default()
            },
        );

        assert!(cycle.iter().any(|diag| diag.code == crate::LintCode::E1406));
        assert!(
            !isolated
                .iter()
                .any(|diag| diag.code == crate::LintCode::E1406)
        );
    }

    /// Definition with a top-level field, a group child, and repeat children.
    ///
    /// `description` doubles as a presentation terminal name, so it pins that
    /// the item segment is always the first key segment.
    fn nested_definition() -> Value {
        json!({
            "$formspec": "1.0",
            "url": "https://example.com/forms/nested",
            "version": "1.0.0",
            "status": "draft",
            "title": "Nested locale test",
            "items": [
                { "key": "name", "type": "field", "label": "Name", "dataType": "string" },
                { "key": "address", "type": "group", "label": "Address", "children": [
                    { "key": "city", "type": "field", "label": "City", "dataType": "string", "options": [
                        { "value": "ottawa", "label": "Ottawa" }
                    ] }
                ] },
                { "key": "lineItems", "type": "group", "label": "Line items", "repeatable": true, "children": [
                    { "key": "amount", "type": "field", "label": "Amount", "dataType": "decimal" },
                    { "key": "description", "type": "field", "label": "Description", "dataType": "string" }
                ] }
            ]
        })
    }

    fn lint_strings(strings: &Value, definition: Option<Value>) -> Vec<LintDiagnostic> {
        let mut locale =
            locale_document("definition", "https://example.com/forms/nested", "fr", None);
        locale["strings"] = strings.clone();
        lint_locale(
            &locale,
            &LintOptions {
                definition_document: definition,
                no_fel: true,
                ..Default::default()
            },
        )
    }

    fn codes_at(diagnostics: &[LintDiagnostic], key: &str) -> Vec<crate::LintCode> {
        let json_path = json_path_member("$.strings", key);
        diagnostics
            .iter()
            .filter(|diag| diag.path == json_path)
            .map(|diag| diag.code)
            .collect()
    }

    #[test]
    fn item_keys_resolve_by_bare_key_at_any_depth() {
        let strings = json!({
            "name.label": "Nom",
            "address.label": "Adresse",
            "city.label": "Ville",
            "city.label@short": "Ville",
            "city.hint": "Ville de résidence",
            "city.options.ottawa.label": "Ottawa",
            "city.errors.REQUIRED": "La ville est obligatoire",
            "lineItems.label": "Poste {{@index}}",
            "amount.label": "Montant",
            "amount.constraintMessage": "Montant invalide",
            "description.label": "Description du poste"
        });

        let diagnostics = lint_strings(&strings, Some(nested_definition()));

        assert!(
            diagnostics.is_empty(),
            "bare Item keys must resolve at any depth: {diagnostics:?}"
        );
    }

    #[test]
    fn dotted_template_paths_are_rejected_as_item_keys() {
        let dotted = [
            "address.city.label",
            "address.city.options.ottawa.label",
            "address.city.errors.REQUIRED",
            "lineItems.amount.label",
            "lineItems.description.label",
            "lineItems[*].amount.label",
            "amount[0].label",
            "address.city.dataType",
        ];
        let strings = Value::Object(
            dotted
                .iter()
                .map(|key| ((*key).to_owned(), json!("x")))
                .collect(),
        );

        for definition in [Some(nested_definition()), None] {
            let with_definition = definition.is_some();
            let diagnostics = lint_strings(&strings, definition);
            for key in dotted {
                assert_eq!(
                    codes_at(&diagnostics, key),
                    vec![crate::LintCode::E1402],
                    "{key} (definition supplied: {with_definition}) must be rejected once as E1402: {diagnostics:?}"
                );
            }
        }
    }

    #[test]
    fn nested_item_option_and_unknown_keys_still_report() {
        let strings = json!({
            "city.options.toronto.label": "Toronto",
            "amount.options.one.label": "Un",
            "ghost.label": "Fantôme",
            "amount.dataType": "decimal"
        });

        let diagnostics = lint_strings(&strings, Some(nested_definition()));

        assert_eq!(
            codes_at(&diagnostics, "city.options.toronto.label"),
            vec![crate::LintCode::E1403]
        );
        assert_eq!(
            codes_at(&diagnostics, "amount.options.one.label"),
            vec![crate::LintCode::E1403]
        );
        assert_eq!(
            codes_at(&diagnostics, "ghost.label"),
            vec![crate::LintCode::E1402]
        );
        assert_eq!(
            codes_at(&diagnostics, "amount.dataType"),
            vec![crate::LintCode::E1407]
        );
    }

    #[test]
    fn malformed_properties_on_a_known_item_are_e1401_not_dotted_paths() {
        let strings = json!({
            "city.options.label": "Option sans valeur",
            "city.foo.label": "Coquille",
            "city.errors.REQUIRED.extra": "Code en deux segments",
            "city.options.ottawa.label@short": "Ottawa"
        });

        let diagnostics = lint_strings(&strings, Some(nested_definition()));

        for key in [
            "city.options.label",
            "city.foo.label",
            "city.errors.REQUIRED.extra",
            "city.options.ottawa.label@short",
        ] {
            assert_eq!(
                codes_at(&diagnostics, key),
                vec![crate::LintCode::E1401],
                "{key}: {diagnostics:?}"
            );
        }
    }

    /// Locale §3.1.1 / §3.1.4 define the only Item terminals processors read;
    /// `@context` applies to the §3.1.1 properties alone.
    #[test]
    fn item_terminals_outside_locale_3_1_are_e1401() {
        let unread = [
            "city.placeholder",
            "city.helpText",
            "city.shortLabel",
            "city.constraintMessage@short",
            "city.requiredMessage@accessibility",
        ];
        let strings = Value::Object(
            unread
                .iter()
                .chain(&["city.hint@accessibility", "city.description@pdf"])
                .map(|key| ((*key).to_owned(), json!("x")))
                .collect(),
        );

        for definition in [Some(nested_definition()), None] {
            let diagnostics = lint_strings(&strings, definition);
            for key in unread {
                assert_eq!(
                    codes_at(&diagnostics, key),
                    vec![crate::LintCode::E1401],
                    "{key}: {diagnostics:?}"
                );
            }
            for key in ["city.hint@accessibility", "city.description@pdf"] {
                assert!(
                    codes_at(&diagnostics, key).is_empty(),
                    "{key}: {diagnostics:?}"
                );
            }
        }
    }

    #[test]
    fn option_and_error_shapes_are_e1401_without_a_definition() {
        let strings = json!({
            "city.options.label": "Option sans valeur",
            "city.errors.REQUIRED.extra": "Code en deux segments",
            "city.options.ottawa.label@short": "Ottawa",
            "$optionSet.cities.ottawa.label@short": "Ottawa"
        });

        let diagnostics = lint_strings(&strings, None);

        for key in [
            "city.options.label",
            "city.errors.REQUIRED.extra",
            "city.options.ottawa.label@short",
            "$optionSet.cities.ottawa.label@short",
        ] {
            assert_eq!(
                codes_at(&diagnostics, key),
                vec![crate::LintCode::E1401],
                "{key}: {diagnostics:?}"
            );
        }
    }

    #[test]
    fn duplicate_definition_item_keys_are_ambiguous_locale_keys() {
        let definition = json!({
            "$formspec": "1.0",
            "url": "https://example.com/forms/nested",
            "version": "1.0.0",
            "status": "draft",
            "title": "Duplicate key locale test",
            "items": [
                { "key": "home", "type": "group", "label": "Home", "children": [
                    { "key": "city", "type": "field", "label": "City", "dataType": "string" }
                ] },
                { "key": "work", "type": "group", "label": "Work", "children": [
                    { "key": "city", "type": "field", "label": "City", "dataType": "string" }
                ] }
            ]
        });

        let diagnostics = lint_strings(&json!({ "city.label": "Ville" }), Some(definition));

        assert_eq!(
            codes_at(&diagnostics, "city.label"),
            vec![crate::LintCode::E1402],
            "{diagnostics:?}"
        );
    }

    /// Lints a fixture carrying `_pairedDefinition` / `_themeDocument` /
    /// `_componentDocuments` lint context beside the Locale document.
    fn lint_fixture(fixture: &str) -> Vec<LintDiagnostic> {
        let mut locale: Value = serde_json::from_str(fixture).expect("fixture is valid JSON");
        let root = locale.as_object_mut().expect("fixture root is an object");
        let definition = root.remove("_pairedDefinition");
        let theme = root.remove("_themeDocument");
        let components = root
            .remove("_componentDocuments")
            .and_then(|docs| docs.as_array().cloned())
            .unwrap_or_default();
        lint_locale(
            &locale,
            &LintOptions {
                definition_document: definition,
                theme_document: theme,
                component_documents: components,
                ..Default::default()
            },
        )
    }

    #[test]
    fn valid_semantic_fixture_is_clean() {
        let diagnostics = lint_fixture(include_str!(
            "../../../tests/fixtures/lint/valid-locale-semantic.json"
        ));

        assert!(diagnostics.is_empty(), "{diagnostics:?}");
    }

    #[test]
    fn invalid_semantic_fixture_rejects_dotted_item_path() {
        let diagnostics = lint_fixture(include_str!(
            "../../../tests/fixtures/lint/E1400-locale-semantic-invalid.json"
        ));

        assert_eq!(
            codes_at(&diagnostics, "contact.phone.label"),
            vec![crate::LintCode::E1402]
        );
    }

    fn locale_document(
        target_kind: &str,
        target_url: &str,
        locale: &str,
        fallback: Option<&str>,
    ) -> Value {
        let mut document = json!({
            "$formspecLocale": "2.0",
            "version": "1.0.0",
            "locale": locale,
            "target": {
                "kind": target_kind,
                "url": target_url
            },
            "strings": {
                "$form.title": "Example"
            }
        });
        if let Some(fallback) = fallback {
            document["fallback"] = json!(fallback);
        }
        document
    }
}

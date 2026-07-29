//! Pass 9: Locale document semantic checks.
#![allow(clippy::missing_docs_in_private_items)]

use std::collections::{HashMap, HashSet};

use formspec_core::visit_component_subtree;
use serde_json::Value;

use crate::semantic_helpers::{
    compatible_version_satisfied, component_node_ids, definition_shape_ids, definition_url,
    definition_version, error, item_option_values, json_path_member, option_set_values,
    resolve_item_path, scan_interpolations, theme_page_ids, warning,
};
use crate::tree;
use crate::types::{LintDiagnostic, LintOptions};

pub(crate) const PASS: u8 = 9;

const FORM_TERMINALS: &[&str] = &["title", "description"];
const ITEM_PRESENTATION_TERMINALS: &[&str] = &[
    "label",
    "description",
    "hint",
    "placeholder",
    "helpText",
    "shortLabel",
    "constraintMessage",
    "requiredMessage",
];
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
const SURFACE_SHELL_STRING_KEYS: &[&str] = &[
    "slotUnavailableDefinitionForm",
    "slotUnavailableExperienceUnit",
    "slotUnavailableWidgetUnimplemented",
    "slotUnavailableWidgetUndeclared",
    "slotUnavailableWidgetData",
    "slotUnavailableStaticContent",
    "slotUnavailableEmbedUnresolved",
    "slotUnavailableEmbedCycle",
    "widgetEmpty",
    "notFoundTitle",
    "notFoundBody",
    "navigationLabel",
    "transitionContinue",
    "transitionPending",
    "transitionFailed",
    "transitionTargetUnresolved",
    "transitionTargetCollision",
    "transitionNoResponseActions",
    "transitionTriggerUnresolved",
    "transitionTriggerAmbiguous",
    "transitionNoExecutor",
    "transitionSuppliedBySlot",
    "transitionFireable",
];

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
            && !SURFACE_SHELL_STRING_KEYS.contains(&strip_context(&parts[2]))
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
        if parts.len() != 3 || strip_context(&parts[2]) != "label" {
            self.diagnostics.push(error(
                crate::LintCode::E1401,
                PASS,
                json_path,
                "Locale $optionSet key must use $optionSet.<setName>.<value>.label",
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

    fn check_item_key(&mut self, key: &str, json_path: &str) {
        let parts = split_locale_key(key);
        let Some((item_path_parts, terminal_parts)) = split_item_key_parts(&parts) else {
            self.diagnostics.push(error(
                crate::LintCode::E1401,
                PASS,
                json_path,
                "Locale item key must target a supported presentation property",
            ));
            return;
        };
        let item_path = item_path_parts.join(".");
        let mut item_known = false;
        if self.options.definition_document.is_some()
            && let Some(index) = self.definition_index.as_ref()
        {
            match resolve_item_path(&item_path, index, false) {
                Ok(Some(_)) => item_known = true,
                Ok(None) => self.diagnostics.push(error(
                    crate::LintCode::E1402,
                    PASS,
                    json_path,
                    format!(
                        "Locale item key references unknown Definition item path {item_path:?}"
                    ),
                )),
                Err(err) => {
                    self.diagnostics
                        .push(error(crate::LintCode::E1402, PASS, json_path, err))
                }
            }
        }

        self.check_item_terminal(&item_path, terminal_parts, json_path, item_known);
    }

    fn check_item_terminal(
        &mut self,
        item_path: &str,
        terminal_parts: &[String],
        json_path: &str,
        item_known: bool,
    ) {
        let terminal = terminal_parts
            .first()
            .map(|part| strip_context(part))
            .unwrap_or("");
        if ITEM_PRESENTATION_TERMINALS.contains(&terminal) {
            if terminal_parts.len() == 1 {
                return;
            }
        } else if terminal == "errors" {
            if terminal_parts.len() >= 2 {
                return;
            }
        } else if terminal == "options" {
            if terminal_parts.len() == 3 && strip_context(&terminal_parts[2]) == "label" {
                if self.options.definition_document.is_some() && item_known {
                    match self.item_values.get(item_path) {
                        Some(values) if values.contains(&terminal_parts[1]) => {}
                        Some(_) => self.diagnostics.push(error(
                            crate::LintCode::E1403,
                            PASS,
                            json_path,
                            format!(
                                "Locale option key references unknown option value {:?} on item {item_path:?}",
                                terminal_parts[1]
                            ),
                        )),
                        None => self.diagnostics.push(error(
                            crate::LintCode::E1403,
                            PASS,
                            json_path,
                            format!(
                                "Locale option key references option value {:?} on item {item_path:?}, but the item has no option values",
                                terminal_parts[1]
                            ),
                        )),
                    }
                }
                return;
            }
        } else if DATA_TERMINALS.contains(&terminal) {
            self.diagnostics.push(error(
                crate::LintCode::E1407,
                PASS,
                json_path,
                format!("Locale key targets non-presentation property {terminal:?}"),
            ));
            return;
        }

        self.diagnostics.push(error(
            crate::LintCode::E1401,
            PASS,
            json_path,
            format!("Locale key has unsupported terminal property {terminal:?}"),
        ));
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

fn split_item_key_parts(parts: &[String]) -> Option<(&[String], &[String])> {
    for (i, part) in parts.iter().enumerate() {
        let terminal = strip_context(part);
        if ITEM_PRESENTATION_TERMINALS.contains(&terminal)
            || DATA_TERMINALS.contains(&terminal)
            || terminal == "errors"
            || terminal == "options"
        {
            if i == 0 {
                return None;
            }
            return Some((&parts[..i], &parts[i..]));
        }
    }
    None
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
        assert!(!diagnostics.iter().any(|diag| {
            diag.path.contains("x-reviewer") || diag.path.contains("navigationLabel")
        }));
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

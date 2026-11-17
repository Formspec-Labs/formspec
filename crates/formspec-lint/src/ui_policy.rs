//! Shared UI authoring policy loaded from `specs/ui-policy.json` (the crate ships a mirror; `make sync-lint-schemas` refreshes it, a test keeps it byte-identical).

#![allow(clippy::missing_docs_in_private_items)]

use std::collections::{BTreeMap, BTreeSet};
use std::sync::OnceLock;

use serde::Deserialize;

const POLICY_JSON: &str = include_str!("../specs/ui-policy.json");

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UiPolicy {
    pub components: Vec<ComponentPolicy>,
    pub input_components: BTreeMap<String, InputComponentPolicy>,
    pub responsive: ResponsivePolicy,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ComponentPolicy {
    pub name: String,
    /// Component spec category: `layout`, `input`, `display` or `container`.
    pub category: String,
    /// The component's own Bind clause, which can narrow its category's default.
    pub bind: BindPolicy,
}

#[derive(Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum BindPolicy {
    Forbidden,
    Optional,
    Required,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InputComponentPolicy {
    pub strict_data_types: BTreeSet<String>,
    pub authoring_data_types: BTreeSet<String>,
    pub requires_options: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ResponsivePolicy {
    pub forbidden_keys: BTreeSet<String>,
    pub base_allowed_props: BTreeSet<String>,
    pub allowed_props_by_component: BTreeMap<String, BTreeSet<String>>,
}

pub(crate) fn ui_policy() -> &'static UiPolicy {
    static POLICY: OnceLock<UiPolicy> = OnceLock::new();
    POLICY.get_or_init(|| {
        serde_json::from_str(POLICY_JSON)
            .expect("specs/ui-policy.json must be valid UI policy JSON")
    })
}

pub(crate) fn input_component_policy(component: &str) -> Option<&'static InputComponentPolicy> {
    ui_policy().input_components.get(component)
}

/// The Component spec category the shared UI policy assigns to a built-in component.
pub(crate) fn component_category(component: &str) -> Option<&'static str> {
    ui_policy()
        .components
        .iter()
        .find(|policy| policy.name == component)
        .map(|policy| policy.category.as_str())
}

/// Whether the built-in component's own Bind clause forbids the property.
pub(crate) fn component_forbids_bind(component: &str) -> bool {
    ui_policy()
        .components
        .iter()
        .any(|policy| policy.name == component && policy.bind == BindPolicy::Forbidden)
}

#[allow(dead_code)]
pub(crate) fn known_component_names() -> BTreeSet<&'static str> {
    ui_policy()
        .components
        .iter()
        .map(|component| component.name.as_str())
        .collect()
}

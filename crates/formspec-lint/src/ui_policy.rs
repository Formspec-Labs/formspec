//! Shared UI authoring policy loaded from `specs/ui-policy.json`.

#![allow(clippy::missing_docs_in_private_items)]

use std::collections::{BTreeMap, BTreeSet};
use std::sync::OnceLock;

use serde::Deserialize;

const POLICY_JSON: &str = include_str!("../../../specs/ui-policy.json");

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UiPolicy {
    #[allow(dead_code)]
    pub components: Vec<ComponentPolicy>,
    pub input_components: BTreeMap<String, InputComponentPolicy>,
    pub responsive: ResponsivePolicy,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ComponentPolicy {
    #[allow(dead_code)]
    pub name: String,
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

#[allow(dead_code)]
pub(crate) fn known_component_names() -> BTreeSet<&'static str> {
    ui_policy()
        .components
        .iter()
        .map(|component| component.name.as_str())
        .collect()
}

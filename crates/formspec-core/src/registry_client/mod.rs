//! Registry client — parses registry documents, resolves extensions, validates lifecycle.

mod name;
mod parse;
mod registry;
mod types;
mod version;
mod wire_json;

#[cfg(test)]
mod tests;

pub use types::{
    ContactPoint, ExtensionCategory, Parameter, Publisher, Registry, RegistryEntry, RegistryError,
    RegistryWarning,
};
pub use version::version_satisfies;
pub use wire_json::{
    registry_entry_count_from_raw, registry_entry_to_json_value,
    registry_parse_summary_to_json_value, version_constraint_option,
};

use crate::extension_analysis::RegistryEntryStatus;

/// Parse registry entry status strings (`draft`, `stable`, `active`, …).
pub fn parse_registry_entry_status(s: &str) -> Option<RegistryEntryStatus> {
    parse::parse_status(s)
}

/// Serialize status for JSON / FFI consumers (`active` → `"stable"`).
pub fn registry_entry_status_to_wire(status: RegistryEntryStatus) -> &'static str {
    match status {
        RegistryEntryStatus::Draft => "draft",
        RegistryEntryStatus::Active => "stable",
        RegistryEntryStatus::Deprecated => "deprecated",
        RegistryEntryStatus::Retired => "retired",
    }
}

/// Serialize extension category for JSON / FFI consumers.
pub fn extension_category_to_wire(category: ExtensionCategory) -> &'static str {
    match category {
        ExtensionCategory::DataType => "dataType",
        ExtensionCategory::Function => "function",
        ExtensionCategory::Constraint => "constraint",
        ExtensionCategory::Property => "property",
        ExtensionCategory::Module => "module",
    }
}

/// Check whether a lifecycle transition is valid per the spec.
///
/// ```text
/// draft      → {draft, stable}
/// stable     → {stable, deprecated}
/// deprecated → {deprecated, retired, stable}  // un-deprecation allowed
/// retired    → {}  // terminal
/// ```
pub fn validate_lifecycle_transition(from: RegistryEntryStatus, to: RegistryEntryStatus) -> bool {
    use RegistryEntryStatus::*;
    matches!(
        (from, to),
        (Draft, Draft)
            | (Draft, Active)
            | (Active, Active)
            | (Active, Deprecated)
            | (Deprecated, Deprecated)
            | (Deprecated, Retired)
            | (Deprecated, Active) // un-deprecation
    )
}

/// Construct the well-known registry URL for a base URL.
pub fn well_known_url(base_url: &str) -> String {
    let base = base_url.trim_end_matches('/');
    format!("{base}/.well-known/formspec-extensions.json")
}

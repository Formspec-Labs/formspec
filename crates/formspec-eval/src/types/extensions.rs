//! Extension constraint payloads from registry entries.

/// Pre-parsed extension constraint data from a registry entry.
/// Passed into the evaluator from the PyO3 layer — no registry parsing here.
#[derive(Debug, Clone)]
pub struct ExtensionConstraint {
    /// Extension name (e.g. "x-formspec-email").
    pub name: String,
    /// Display name for human-readable messages (e.g. "Email address").
    pub display_name: Option<String>,
    /// Regex pattern constraint (anchored).
    pub pattern: Option<String>,
    /// Maximum string length.
    pub max_length: Option<u64>,
    /// Minimum numeric value.
    pub minimum: Option<rust_decimal::Decimal>,
    /// Maximum numeric value.
    pub maximum: Option<rust_decimal::Decimal>,
    /// Base data type this extension expects (e.g. "string", "decimal").
    pub base_type: Option<String>,
    /// Lifecycle status: "stable", "deprecated", "retired", "draft".
    pub status: String,
    /// Deprecation notice text (when status is "deprecated").
    pub deprecation_notice: Option<String>,
    /// Formspec version compatibility range (e.g. ">=1.0.0 <2.0.0").
    pub compatibility_version: Option<String>,
}

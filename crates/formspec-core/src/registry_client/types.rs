//! Registry document types and parse errors.

use crate::extension_analysis::RegistryEntryStatus;
use serde_json::Value;

/// Extension mechanism category.
///
/// Per ADR 0150 §4.1/§4.2: `Namespace` was renamed to `Module` (greenfield,
/// no alias) and six new contribution categories were added. The Rust parser
/// surface tracks all categories the schema admits — the originals
/// (`DataType` / `Function` / `Constraint` / `Property`), the rename target
/// (`Module`), the two schema-first-class categories that pre-dated the
/// substrate refactor but weren't yet surfaced (`Concept` / `Vocabulary`),
/// and the six new contribution categories the substrate refactor added
/// (`UnitKind` / `Widget` / `ActionIntent` / `SlotType` /
/// `ValidationMappingRow` / `TokenCategory`). Adding parser surface for the
/// six is required by P1 because P1 republishes core vocabularies as
/// modules and the first published contribution category (`UnitKind` from
/// `x-formspec-core-task`) would otherwise parse-reject.
#[allow(missing_docs)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExtensionCategory {
    DataType,
    Function,
    Constraint,
    Property,
    Module,
    Concept,
    Vocabulary,
    UnitKind,
    Widget,
    ActionIntent,
    SlotType,
    ValidationMappingRow,
    TokenCategory,
}

/// Organization publishing a registry document.
#[allow(missing_docs)]
#[derive(Debug, Clone)]
pub struct Publisher {
    pub name: Value,
    pub identifier: Option<String>,
    pub homepage: Option<String>,
    pub contact_points: Vec<ContactPoint>,
    pub legacy_url: Option<String>,
    pub legacy_contact: Option<String>,
}

/// Structured publisher contact information.
#[allow(missing_docs)]
#[derive(Debug, Clone)]
pub struct ContactPoint {
    pub contact_type: Option<String>,
    pub email: Option<String>,
    pub telephone: Option<String>,
    pub url: Option<String>,
    pub available_language: Vec<String>,
}

/// Non-fatal registry parse warning.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RegistryWarning {
    /// A deprecated field was present.
    DeprecatedField {
        /// Deprecated field path.
        field: String,
        /// Preferred replacement field path.
        replacement: String,
    },
}

/// A single extension record with full metadata.
#[allow(missing_docs)]
#[derive(Debug, Clone)]
pub struct RegistryEntry {
    pub name: String,
    pub category: ExtensionCategory,
    pub version: String,
    pub status: RegistryEntryStatus,
    pub description: String,
    pub deprecation_notice: Option<String>,
    pub base_type: Option<String>,
    pub parameters: Option<Vec<Parameter>>,
    pub returns: Option<String>,
}

/// Function/constraint parameter declaration.
#[allow(missing_docs)]
#[derive(Debug, Clone)]
pub struct Parameter {
    pub name: String,
    pub param_type: String,
    pub description: Option<String>,
}

/// Errors from registry parsing and validation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RegistryError {
    /// Missing required top-level field.
    MissingField(String),
    /// Field has wrong type.
    InvalidField(String),
    /// Entry-level parse error (index, message).
    InvalidEntry(usize, String),
}

impl std::fmt::Display for RegistryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RegistryError::MissingField(field) => write!(f, "missing required field: {field}"),
            RegistryError::InvalidField(msg) => write!(f, "invalid field: {msg}"),
            RegistryError::InvalidEntry(idx, msg) => write!(f, "entry[{idx}]: {msg}"),
        }
    }
}

impl std::error::Error for RegistryError {}

/// A parsed registry document with indexed entries.
#[allow(missing_docs, clippy::missing_docs_in_private_items)]
#[derive(Debug)]
pub struct Registry {
    pub publisher: Publisher,
    pub published: String,
    pub warnings: Vec<RegistryWarning>,
    pub(super) entries: Vec<RegistryEntry>,
    pub(super) by_name: std::collections::HashMap<String, Vec<usize>>,
}

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
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExtensionCategory {
    /// Data type extension defining value shape and validation rules.
    DataType,
    /// Custom evaluation function callable in FEL expressions.
    Function,
    /// Custom constraint validator for field validation.
    Constraint,
    /// Schema property extension for custom field/item properties.
    Property,
    /// Module bundling a collection of related extensions.
    Module,
    /// Semantic concept binding identifying cross-form field concepts.
    Concept,
    /// Domain-specific vocabulary definition.
    Vocabulary,
    /// Unit of measure kind specification (ADR 0150 §4.1).
    UnitKind,
    /// Visual widget descriptor for custom renderers.
    Widget,
    /// Action intent definition for button and workflow triggers.
    ActionIntent,
    /// Layout slot type descriptor for layout planners.
    SlotType,
    /// Validation mapping row descriptor for schema translations.
    ValidationMappingRow,
    /// Token category specification for design tokens.
    TokenCategory,
}

/// Organization publishing a registry document.
#[derive(Debug, Clone)]
pub struct Publisher {
    /// Organization or publisher name (string or localized object).
    pub name: Value,
    /// Unique publisher identifier (e.g. URN or domain).
    pub identifier: Option<String>,
    /// Organization homepage URL.
    pub homepage: Option<String>,
    /// Contact points for support or governance inquiries.
    pub contact_points: Vec<ContactPoint>,
    /// Legacy URL field for backward compatibility.
    pub legacy_url: Option<String>,
    /// Legacy contact field for backward compatibility.
    pub legacy_contact: Option<String>,
}

/// Structured publisher contact information.
#[derive(Debug, Clone)]
pub struct ContactPoint {
    /// Type of contact (e.g. "technical", "customer-service").
    pub contact_type: Option<String>,
    /// Support or contact email address.
    pub email: Option<String>,
    /// Telephone contact number.
    pub telephone: Option<String>,
    /// Web contact or support form URL.
    pub url: Option<String>,
    /// Languages supported by this contact point.
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
///
/// Carries the registry-shape payloads for ADR 0150 §4.1/§4.2 module
/// aggregator + contribution categories: `contributes[]` for module entries,
/// and the typed payload slots for `unit-kind` (`semantics`), `widget`
/// (`widget_shape`), `action-intent` (`validation`), `validation-mapping-row`
/// (`row`), `slot-type` (`slot_shape`), and `token-category`
/// (`category_shape`). The `extensions` slot holds `^x-` keys (the
/// substrate uses `x-formspec-kind-value` here for `property` contributions
/// that republish closed-core enum values without a typed payload — see
/// `specs/registry/extension-registry.md` §4.1 Rule 1 dotted-translation
/// convention).
///
/// Payload fields are typed as `serde_json::Value` at the parse boundary;
/// callers that need typed access ship their own typed-shape deserializers
/// (parity with how JSON Schema treats these fields per `registry.schema.json`).
#[derive(Debug, Clone)]
pub struct RegistryEntry {
    /// Unique extension entry name (e.g. `currencyCode`, `x-formspec-core-task`).
    pub name: String,
    /// Category of this extension.
    pub category: ExtensionCategory,
    /// Version string of this extension definition.
    pub version: String,
    /// Lifecycle status (`draft`, `stable`, `deprecated`, `retired`).
    pub status: RegistryEntryStatus,
    /// Human-readable summary of the extension purpose.
    pub description: String,
    /// Guidance for migration when deprecated or retired.
    pub deprecation_notice: Option<String>,
    /// Underlying primitive data type for `dataType` extensions.
    pub base_type: Option<String>,
    /// Declared parameters for `function` and `constraint` extensions.
    pub parameters: Option<Vec<Parameter>>,
    /// Return data type for `function` extensions.
    pub returns: Option<String>,

    /// `module` aggregator: names of Registry entries this module bundles.
    /// REQUIRED on `module` entries per `registry.schema.json` `category`
    /// allOf gate; absent on all other categories.
    pub contributes: Option<Vec<String>>,

    /// Top-level `extensions` slot (admits `^x-` keys per `registry.schema.json`).
    /// The substrate uses `x-formspec-kind-value` on `property` contributions
    /// to carry the original closed-core enum value (e.g. `session.started`)
    /// when the Registry name has had to translate it (e.g.
    /// `x-formspec-core-ledger-event-type-session-started`). Plain
    /// `serde_json::Value` payload — typed deserializers live in consumers.
    pub extensions: Option<serde_json::Value>,

    /// `unit-kind` contribution payload: REQUIRED on `unit-kind` entries.
    pub semantics: Option<serde_json::Value>,

    /// `widget` contribution payload: REQUIRED on `widget` entries.
    pub widget_shape: Option<serde_json::Value>,

    /// `action-intent` contribution payload: REQUIRED on `action-intent` entries.
    pub validation: Option<serde_json::Value>,

    /// `slot-type` contribution payload: REQUIRED on `slot-type` entries.
    pub slot_shape: Option<serde_json::Value>,

    /// `validation-mapping-row` contribution payload: REQUIRED on
    /// `validation-mapping-row` entries.
    pub row: Option<serde_json::Value>,

    /// `token-category` contribution payload: REQUIRED on `token-category` entries.
    pub category_shape: Option<serde_json::Value>,
}

/// Function/constraint parameter declaration.
#[derive(Debug, Clone)]
pub struct Parameter {
    /// Parameter identifier name.
    pub name: String,
    /// Declared data type of the parameter.
    pub param_type: String,
    /// Optional human-readable description of the parameter.
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
#[derive(Debug)]
pub struct Registry {
    /// Publishing authority or organization.
    pub publisher: Publisher,
    /// Publication timestamp or date string.
    pub published: String,
    /// Non-fatal warnings encountered during registry parsing.
    pub warnings: Vec<RegistryWarning>,
    pub(super) entries: Vec<RegistryEntry>,
    pub(super) by_name: std::collections::HashMap<String, Vec<usize>>,
}

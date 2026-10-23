//! Substrate-aware op shapes and artifact types per ADR 0151 §4.1 and §4.4.

use serde::{Deserialize, Serialize};

/// Substrate artifact classification mapped to distinct Automerge documents.
///
/// Per ADR 0151 §4.1 table:
/// - App Manifest (`Doc<AppManifest>`)
/// - Definition (`Doc<FormDefinition>`)
/// - Experience (`Doc<ExperienceDocument>`)
/// - Response Actions (`Doc<ResponseActionsDocument>`)
/// - Component (`Doc<ComponentDocument>`)
/// - Surface (`Doc<SurfaceDocument>`)
/// - Theme (`Doc<ThemeDocument>`)
/// - Locale (`Doc<LocaleDocument>`)
/// - Mapping (`Doc<MappingDocument>`)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SubstrateArtifactType {
    /// App manifest root document.
    AppManifest,
    /// Form definition document (per view).
    Definition,
    /// Multi-view navigation experience document.
    Experience,
    /// Response actions orchestration document.
    ResponseActions,
    /// Component tree document (per route).
    Component,
    /// Surface and slot document.
    Surface,
    /// Theme token document.
    Theme,
    /// Locale string dictionary document.
    Locale,
    /// Schema mapping document.
    Mapping,
}

impl std::fmt::Display for SubstrateArtifactType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::AppManifest => write!(f, "AppManifest"),
            Self::Definition => write!(f, "Definition"),
            Self::Experience => write!(f, "Experience"),
            Self::ResponseActions => write!(f, "ResponseActions"),
            Self::Component => write!(f, "Component"),
            Self::Surface => write!(f, "Surface"),
            Self::Theme => write!(f, "Theme"),
            Self::Locale => write!(f, "Locale"),
            Self::Mapping => write!(f, "Mapping"),
        }
    }
}

/// Cross-component node provenance reference for `movedFrom` / `copiedFrom`.
///
/// Corresponds to `CrossComponentRef` / `ComponentNodeIdentityRef` in `common.schema.json`
/// and ADR 0150 §5.3 / ADR 0151 §4.4:
/// `movedFrom?: { route: string, nodePath: string }`
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrossNodeProvenance {
    /// Surface route identifier where node originated (if route-scoped).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route: Option<String>,
    /// Path or ID of node in origin document.
    pub node_path: String,
    /// Origin document URL or identifier.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub document_id: Option<String>,
}

impl CrossNodeProvenance {
    /// Creates a new `CrossNodeProvenance`.
    #[must_use]
    pub fn new(route: Option<String>, node_path: impl Into<String>) -> Self {
        Self {
            route,
            node_path: node_path.into(),
            document_id: None,
        }
    }

    /// Builder method to attach document identifier.
    #[must_use]
    pub fn with_document_id(mut self, doc_id: impl Into<String>) -> Self {
        self.document_id = Some(doc_id.into());
        self
    }
}

/// Generation provenance carrier adhering to ADR 0150 §5.3/§5.4 and ADR 0151 §4.4.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Generation {
    /// Provenance when node is moved from another component/location (`Generation.movedFrom`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub moved_from: Option<CrossNodeProvenance>,
    /// Provenance when node is copied from another component/location (`Generation.copiedFrom`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub copied_from: Option<CrossNodeProvenance>,
    /// Generator source label.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    /// Generator strategy identifier.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub strategy: Option<String>,
    /// Generation timestamp (ISO/RFC 3339).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub generated_at: Option<String>,
    /// Actor attribution (URN or Actor ID).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub generated_by: Option<String>,
    /// Template module identifier.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_module: Option<String>,
    /// Source anchors.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub anchors: Vec<String>,
}

/// Substrate-aware operations translating typed mutations to Automerge operations.
///
/// Conforms to ADR 0151 §4.4 operation shape mapping table.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload", rename_all = "camelCase")]
pub enum SubstrateOp {
    /// Set a property on an item or field (`doc.items[path][property] = value`).
    #[serde(rename_all = "camelCase")]
    SetItemProperty {
        /// Item or field path identifier.
        path: String,
        /// Property name.
        property: String,
        /// Value to assign.
        value: serde_json::Value,
    },
    /// Structural assignment under binds (`doc.items[path].binds = properties`).
    #[serde(rename_all = "camelCase")]
    SetBind {
        /// Target item or field path.
        path: String,
        /// Binds definition payload.
        properties: serde_json::Value,
    },
    /// Add a component node (`doc.components[parentRef].children.push(node)`).
    #[serde(rename_all = "camelCase")]
    AddComponentNode {
        /// Parent node reference, or None for root level.
        parent_ref: Option<String>,
        /// Bundle-unique node identifier.
        node_id: String,
        /// Full node definition.
        node: serde_json::Value,
    },
    /// Move a component node within the document.
    #[serde(rename_all = "camelCase")]
    MoveComponentNode {
        /// Unique node identifier being moved.
        node_id: String,
        /// New parent node reference, or None for root level.
        new_parent_ref: Option<String>,
        /// New insertion index within parent children.
        new_index: usize,
        /// Optional explicit moved-from provenance.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        moved_from: Option<CrossNodeProvenance>,
    },
    /// Copy a component node to a new location with a fresh authored node ID.
    #[serde(rename_all = "camelCase")]
    CopyComponentNode {
        /// Original source node identifier.
        original_node_id: String,
        /// Newly authored unique node identifier.
        new_node_id: String,
        /// Target parent node reference, or None for root level.
        new_parent_ref: Option<String>,
        /// Target insertion index within parent children.
        new_index: usize,
        /// Optional explicit copied-from provenance.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        copied_from: Option<CrossNodeProvenance>,
    },
    /// Cross-document move operation per ADR 0150 §5.3 and ADR 0151 §4.1.
    #[serde(rename_all = "camelCase")]
    CrossDocumentMove {
        /// Bundle-unique node identifier being moved across documents.
        node_id: String,
        /// Target parent node reference, or None for root level.
        target_parent_ref: Option<String>,
        /// Target insertion index within parent children.
        target_index: usize,
        /// Provenance tracking origin route and document.
        moved_from: CrossNodeProvenance,
    },
    /// Delete a node from the document.
    #[serde(rename_all = "camelCase")]
    DeleteNode {
        /// Target node identifier to delete.
        node_id: String,
    },
    /// Generic patch against an arbitrary document path.
    #[serde(rename_all = "camelCase")]
    RawPatch {
        /// Segments path into document hierarchy.
        path: Vec<String>,
        /// Value to write at path.
        value: serde_json::Value,
    },
}

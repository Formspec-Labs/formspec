//! Escape-hatch APIs for `KernelObjectRef` resolution and history-walking per ADR 0151 §13.6.
//!
//! # Architecture Seam (ADR 0151 §13.6)
//!
//! The public surface of `formspec-document-kernel` provides substrate-aware typed op shapes.
//! Backend object handles are internal abstractions wrapped by `KernelObjectRef`.
//!
//! When callers (such as diagnostic inspectors, migration tooling, or governance auditors)
//! need to introspect backend object mappings or walk causal change history, these escape-hatch
//! APIs provide stable access without leaking Automerge-specific internal object ID types:
//! - [`DocumentEscapeHatch::resolve_object_ref`]: Maps a substrate `node.id` URN to opaque [`KernelObjectRef`].
//! - [`DocumentEscapeHatch::resolve_node_id`]: Maps an opaque [`KernelObjectRef`] back to substrate `node.id`.
//! - [`DocumentEscapeHatch::walk_history`]: Traverses the causal history of changes authored into the document.
//! - [`DocumentEscapeHatch::raw_crdt_doc`] / [`DocumentEscapeHatch::raw_crdt_doc_mut`]: Direct access to underlying CRDT for migration/audit.

use serde::{Deserialize, Serialize};

use crate::document::KernelDocument;
use crate::kernel_ref::KernelObjectRef;

/// A historical entry representing an authored change in the document's causal DAG.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HistoryEntry {
    /// Actor identifier who committed this change.
    pub actor_id: String,
    /// Unique hash identifying this change.
    pub hash: String,
    /// Optional commit message associated with the change.
    pub message: Option<String>,
    /// Commit timestamp (seconds since UNIX epoch).
    pub timestamp: i64,
    /// Direct dependencies (parent change hashes) of this change.
    pub deps: Vec<String>,
}

/// Escape-hatch view offering low-level introspection into a [`KernelDocument`].
pub struct DocumentEscapeHatch<'a> {
    doc: &'a mut KernelDocument,
}

impl<'a> DocumentEscapeHatch<'a> {
    /// Creates a new escape hatch view for the given document.
    #[must_use]
    pub fn new(doc: &'a mut KernelDocument) -> Self {
        Self { doc }
    }

    /// Resolves a substrate `node.id` to its backend `KernelObjectRef`.
    ///
    /// Checks both active mappings and archived mappings (e.g. for deleted nodes
    /// whose history is being audited per ADR 0151 §4.1).
    #[must_use]
    pub fn resolve_object_ref(&self, node_id: &str) -> Option<KernelObjectRef> {
        self.doc
            .registry()
            .get_object_ref(node_id)
            .or_else(|| self.doc.registry().get_archived(node_id))
    }

    /// Resolves a backend `KernelObjectRef` to its substrate `node.id`.
    #[must_use]
    pub fn resolve_node_id(&self, object_ref: &KernelObjectRef) -> Option<&str> {
        self.doc.registry().get_node_id(object_ref)
    }

    /// Traverses the causal change history of the document.
    ///
    /// Returns entries in topological causal order.
    #[must_use]
    pub fn walk_history(&mut self) -> Vec<HistoryEntry> {
        let raw = self.doc.raw_crdt_doc_mut();
        let changes = raw.get_changes(&[]);
        changes
            .into_iter()
            .map(|change| HistoryEntry {
                actor_id: change.actor_id().to_string(),
                hash: change.hash().to_string(),
                message: change.message().map(ToString::to_string),
                timestamp: change.timestamp(),
                deps: change.deps().iter().map(ToString::to_string).collect(),
            })
            .collect()
    }

    /// Provides direct immutable access to the underlying Automerge `AutoCommit` CRDT.
    #[must_use]
    pub fn raw_crdt_doc(&self) -> &automerge::AutoCommit {
        self.doc.raw_crdt_doc()
    }

    /// Provides direct mutable access to the underlying Automerge `AutoCommit` CRDT.
    pub fn raw_crdt_doc_mut(&mut self) -> &mut automerge::AutoCommit {
        self.doc.raw_crdt_doc_mut()
    }
}

impl KernelDocument {
    /// Access the escape-hatch view for this document.
    pub fn escape_hatch(&mut self) -> DocumentEscapeHatch<'_> {
        DocumentEscapeHatch::new(self)
    }

    /// Resolves a substrate `node.id` to its backend `KernelObjectRef`.
    #[must_use]
    pub fn resolve_object_ref(&self, node_id: &str) -> Option<KernelObjectRef> {
        self.registry()
            .get_object_ref(node_id)
            .or_else(|| self.registry().get_archived(node_id))
    }

    /// Resolves a backend `KernelObjectRef` to its substrate `node.id`.
    #[must_use]
    pub fn resolve_node_id(&self, object_ref: &KernelObjectRef) -> Option<&str> {
        self.registry().get_node_id(object_ref)
    }

    /// Walks the causal change history of this document.
    pub fn walk_history(&mut self) -> Vec<HistoryEntry> {
        self.escape_hatch().walk_history()
    }
}

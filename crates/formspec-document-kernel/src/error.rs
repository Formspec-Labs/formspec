//! Error types for `formspec-document-kernel`.

use thiserror::Error;

/// Kernel error enumeration.
#[derive(Debug, Error)]
pub enum KernelError {
    /// Automerge CRDT error.
    #[error("automerge error: {0}")]
    Automerge(#[from] automerge::AutomergeError),

    /// Node not found in substrate registry or document tree.
    #[error("node not found: {0}")]
    NodeNotFound(String),

    /// Invalid operation requested against the document.
    #[error("invalid operation: {0}")]
    InvalidOperation(String),

    /// JSON serialization or deserialization error.
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    /// Bundle ID collision violating ADR 0150 §5.3 / ADR 0151 §4.1 bundle uniqueness.
    #[error("bundle id collision: node '{0}' already exists in target document")]
    BundleIdCollision(String),

    /// Internal serialization or format failure.
    #[error("serialization error: {0}")]
    Serialization(String),
}

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

    /// Actor admission denied by posture (ADR 0150 §5.4, ADR 0151 §8 #5).
    #[error("actor admission denied for '{actor}': {reason}")]
    ActorAdmissionDenied {
        /// Actor ID that was denied admission.
        actor: String,
        /// Denial rationale.
        reason: String,
    },

    /// Changeset branch was rejected and rolled back due to schema convergence violations.
    #[error("convergence rollback for '{actor}': {reason}")]
    ConvergenceRollback {
        /// Actor whose ops were rolled back.
        actor: String,
        /// Reason for rollback.
        reason: String,
    },

    /// Changeset branch not found.
    #[error("changeset branch not found: {0}")]
    BranchNotFound(String),

    /// Changeset branch already closed (accepted or rejected).
    #[error("changeset branch already closed: {0}")]
    BranchAlreadyClosed(String),

    /// Schema-aware convergence violation.
    #[error("schema violation: {0}")]
    SchemaViolation(String),
}

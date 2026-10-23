//! `formspec-document-kernel` — Rust document kernel wrapping Automerge 2.0 (ADR 0151).

pub mod bindings;
pub mod branch_manager;
pub mod document;
pub mod error;
pub mod escape_hatch;
pub mod kernel_ref;
pub mod op;
pub mod schema_convergence;

pub use branch_manager::{
    studio_ledger_idempotency_key, studio_ledger_idempotency_material, BranchState, BranchStatus,
    ChangesetBranchManager, ChangesetPreview, SessionOpBatch, TrellisEventPayload,
};
pub use document::KernelDocument;
pub use error::KernelError;
pub use escape_hatch::{DocumentEscapeHatch, HistoryEntry};
pub use kernel_ref::{KernelObjectRef, SubstrateIdRegistry};
pub use op::{CrossNodeProvenance, Generation, SubstrateArtifactType, SubstrateOp};
pub use schema_convergence::{
    extract_fel_from_json, extract_fel_references, extract_semantic_references,
    resolve_precedence_mode, validate_convergence, ActorClass, ConvergenceDiagnostic,
    ConvergenceMode, ConvergenceOutcome, DiagnosticSeverity, OpsReanchored, OpsRolledBack,
    SchemaAwareViolation, ShadowGateReport,
};

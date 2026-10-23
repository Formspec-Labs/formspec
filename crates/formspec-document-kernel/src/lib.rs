//! `formspec-document-kernel` — Rust document kernel wrapping Automerge 2.0 (ADR 0151).

pub mod bindings;
pub mod document;
pub mod error;
pub mod escape_hatch;
pub mod kernel_ref;
pub mod op;

pub use document::KernelDocument;
pub use error::KernelError;
pub use escape_hatch::{DocumentEscapeHatch, HistoryEntry};
pub use kernel_ref::{KernelObjectRef, SubstrateIdRegistry};
pub use op::{CrossNodeProvenance, Generation, SubstrateArtifactType, SubstrateOp};

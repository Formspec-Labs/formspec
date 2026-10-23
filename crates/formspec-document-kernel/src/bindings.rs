//! JS WASM and Python PyO3 binding shells per ADR 0151 §4.3 and §14 (P0).
//!
//! # Cross-Runtime Architecture
//!
//! The Rust document kernel is the byte authority (ADR 0151 §4.3).
//! - **JS / TypeScript**: Wasm-backed binding routed through `formspec-engine`
//!   and consumed by `formspec-studio-core`.
//! - **Python**: Native PyO3 bindings for product MCPs (Forms-MCP, Wireframes-MCP).
//!
//! These shells define the typed serialization contracts, function signatures,
//! and conversion entrypoints for both runtimes.

use serde::{Deserialize, Serialize};

use crate::document::KernelDocument;
use crate::error::KernelError;
use crate::kernel_ref::KernelObjectRef;
use crate::op::{SubstrateArtifactType, SubstrateOp};

/// JS/WASM binding shell definitions.
///
/// Models the contract exposed over the WebAssembly boundary to `formspec-engine`.
pub mod js_wasm {
    use super::*;

    /// Result wrapper for WASM invocations returning binary or JSON payloads.
    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub struct WasmInvocationResult<T> {
        /// Success payload if operation succeeded.
        pub data: Option<T>,
        /// Error message if operation failed.
        pub error: Option<String>,
    }

    /// Shell function: Initialize a new kernel document for the given artifact type.
    pub fn create_document(artifact_type_str: &str) -> Result<Vec<u8>, KernelError> {
        let artifact_type: SubstrateArtifactType = serde_json::from_str(artifact_type_str)?;
        let mut doc = KernelDocument::new(artifact_type);
        Ok(doc.save())
    }

    /// Shell function: Apply a serialized `SubstrateOp` to a document byte-buffer.
    pub fn apply_op(
        artifact_type_str: &str,
        doc_bytes: &[u8],
        op_json: &str,
    ) -> Result<Vec<u8>, KernelError> {
        let artifact_type: SubstrateArtifactType = serde_json::from_str(artifact_type_str)?;
        let mut doc = KernelDocument::load(artifact_type, doc_bytes)?;
        let op: SubstrateOp = serde_json::from_str(op_json)?;
        doc.apply_op(&op)?;
        Ok(doc.save())
    }

    /// Shell function: Fork a document byte-buffer into an independent branch.
    pub fn fork_document(
        artifact_type_str: &str,
        doc_bytes: &[u8],
    ) -> Result<Vec<u8>, KernelError> {
        let artifact_type: SubstrateArtifactType = serde_json::from_str(artifact_type_str)?;
        let mut doc = KernelDocument::load(artifact_type, doc_bytes)?;
        let mut forked = doc.fork();
        Ok(forked.save())
    }

    /// Shell function: Merge an incoming remote branch into local document bytes.
    pub fn merge_documents(
        artifact_type_str: &str,
        local_bytes: &[u8],
        remote_bytes: &[u8],
    ) -> Result<Vec<u8>, KernelError> {
        let artifact_type: SubstrateArtifactType = serde_json::from_str(artifact_type_str)?;
        let mut local = KernelDocument::load(artifact_type, local_bytes)?;
        let mut remote = KernelDocument::load(artifact_type, remote_bytes)?;
        local.merge(&mut remote)?;
        Ok(local.save())
    }

    /// Shell function: Resolve `KernelObjectRef` string by substrate `node.id`.
    pub fn resolve_object_ref(
        artifact_type_str: &str,
        doc_bytes: &[u8],
        node_id: &str,
    ) -> Result<Option<String>, KernelError> {
        let artifact_type: SubstrateArtifactType = serde_json::from_str(artifact_type_str)?;
        let doc = KernelDocument::load(artifact_type, doc_bytes)?;
        Ok(doc.resolve_object_ref(node_id).map(|k| k.to_string()))
    }

    /// Shell function: Resolve substrate `node.id` by `KernelObjectRef` string.
    pub fn resolve_node_id(
        artifact_type_str: &str,
        doc_bytes: &[u8],
        kor_str: &str,
    ) -> Result<Option<String>, KernelError> {
        let artifact_type: SubstrateArtifactType = serde_json::from_str(artifact_type_str)?;
        let doc = KernelDocument::load(artifact_type, doc_bytes)?;
        let kor = KernelObjectRef::new(kor_str);
        Ok(doc.resolve_node_id(&kor).map(ToString::to_string))
    }
}

/// Python / PyO3 binding shell definitions.
///
/// Models the native interface exposed via `formspec-py` to Python product MCPs.
pub mod python {
    use super::*;

    /// Shell representation of the PyO3 class wrapper.
    pub struct PyKernelDocumentShell {
        inner: KernelDocument,
    }

    impl PyKernelDocumentShell {
        /// Creates a new Python kernel document wrapper.
        pub fn new(artifact_type_name: &str) -> Result<Self, KernelError> {
            let artifact_type: SubstrateArtifactType = serde_json::from_str(artifact_type_name)?;
            Ok(Self {
                inner: KernelDocument::new(artifact_type),
            })
        }

        /// Applies a serialized JSON substrate op.
        pub fn apply_op_json(&mut self, op_json: &str) -> Result<(), KernelError> {
            let op: SubstrateOp = serde_json::from_str(op_json)?;
            self.inner.apply_op(&op)
        }

        /// Merges another Python kernel document wrapper.
        pub fn merge(&mut self, other: &mut Self) -> Result<Vec<String>, KernelError> {
            let hashes = self.inner.merge(&mut other.inner)?;
            Ok(hashes.into_iter().map(|h| h.to_string()).collect())
        }

        /// Exports bytes for transfer or persistence.
        pub fn save_bytes(&mut self) -> Vec<u8> {
            self.inner.save()
        }

        /// Loads bytes into Python kernel document wrapper.
        pub fn load_bytes(artifact_type_name: &str, bytes: &[u8]) -> Result<Self, KernelError> {
            let artifact_type: SubstrateArtifactType = serde_json::from_str(artifact_type_name)?;
            let inner = KernelDocument::load(artifact_type, bytes)?;
            Ok(Self { inner })
        }

        /// Resolves `KernelObjectRef` string by substrate `node.id`.
        pub fn resolve_object_ref(&self, node_id: &str) -> Option<String> {
            self.inner.resolve_object_ref(node_id).map(|k| k.to_string())
        }

        /// Resolves substrate `node.id` by `KernelObjectRef` string.
        pub fn resolve_node_id(&self, kor_str: &str) -> Option<String> {
            let kor = KernelObjectRef::new(kor_str);
            self.inner.resolve_node_id(&kor).map(ToString::to_string)
        }
    }
}

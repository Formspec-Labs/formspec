//! Object reference and bidirectional substrate ID registry per ADR 0151 §4.1.

use std::collections::HashMap;
use serde::{Deserialize, Serialize};

/// Opaque object reference identity used by the document kernel backend.
///
/// Bridges the substrate's bundle-unique `node.id` URNs and Automerge internal object IDs
/// without leaking CRDT internals to substrate callers.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct KernelObjectRef(String);

impl KernelObjectRef {
    /// Creates a new `KernelObjectRef` from an explicit string identifier.
    #[must_use]
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    /// Generates a unique `KernelObjectRef`.
    #[must_use]
    pub fn random() -> Self {
        use std::sync::atomic::{AtomicU64, Ordering};
        static COUNTER: AtomicU64 = AtomicU64::new(1);
        let id = COUNTER.fetch_add(1, Ordering::Relaxed);
        Self(format!("kor_{id:016x}"))
    }

    /// Returns the string representation of the object reference.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for KernelObjectRef {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

use crate::op::{CrossNodeProvenance, Generation};

/// Bidirectional identity mapping between substrate `node.id` and backend `KernelObjectRef`.
///
/// Per ADR 0151 §4.1:
/// ```text
/// SubstrateIdRegistry {
///   byNodeId: Map<node.id (URN), KernelObjectRef>
///   byObjectRef: Map<KernelObjectRef, node.id>
/// }
/// ```
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct SubstrateIdRegistry {
    by_node_id: HashMap<String, KernelObjectRef>,
    by_object_ref: HashMap<KernelObjectRef, String>,
    archived: HashMap<String, KernelObjectRef>,
    generations: HashMap<String, Generation>,
}

impl SubstrateIdRegistry {
    /// Creates an empty `SubstrateIdRegistry`.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Look up backend `KernelObjectRef` by substrate `node.id`.
    #[must_use]
    pub fn get_object_ref(&self, node_id: &str) -> Option<KernelObjectRef> {
        self.by_node_id.get(node_id).cloned()
    }

    /// Look up substrate `node.id` by backend `KernelObjectRef`.
    #[must_use]
    pub fn get_node_id(&self, object_ref: &KernelObjectRef) -> Option<&str> {
        self.by_object_ref.get(object_ref).map(String::as_str)
    }

    /// Look up an archived `KernelObjectRef` for a deleted or moved node.
    #[must_use]
    pub fn get_archived(&self, node_id: &str) -> Option<KernelObjectRef> {
        self.archived.get(node_id).cloned()
    }

    /// Look up `Generation` provenance metadata for a node.
    #[must_use]
    pub fn get_generation(&self, node_id: &str) -> Option<&Generation> {
        self.generations.get(node_id)
    }

    /// Set or update `Generation` provenance metadata for a node.
    pub fn set_generation(&mut self, node_id: impl Into<String>, generation: Generation) {
        self.generations.insert(node_id.into(), generation);
    }

    /// Number of active registered entries.
    #[must_use]
    pub fn len(&self) -> usize {
        self.by_node_id.len()
    }

    /// Whether the registry has zero active entries.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.by_node_id.is_empty()
    }

    /// Check if an active mapping exists for `node_id`.
    #[must_use]
    pub fn contains_node_id(&self, node_id: &str) -> bool {
        self.by_node_id.contains_key(node_id)
    }

    /// Check if a mapping exists for `object_ref`.
    #[must_use]
    pub fn contains_object_ref(&self, object_ref: &KernelObjectRef) -> bool {
        self.by_object_ref.contains_key(object_ref)
    }

    /// Iterate over registered (node_id, KernelObjectRef) pairs.
    pub fn iter(&self) -> impl Iterator<Item = (&String, &KernelObjectRef)> {
        self.by_node_id.iter()
    }

    /// Register a direct mapping between a `node_id` and a `KernelObjectRef`.
    pub fn register(&mut self, node_id: impl Into<String>, object_ref: KernelObjectRef) {
        let nid = node_id.into();
        self.by_object_ref.insert(object_ref.clone(), nid.clone());
        self.by_node_id.insert(nid, object_ref);
    }

    /// Lifecycle: create operation. Author supplies bundle-unique `node.id`, backend assigns `KernelObjectRef`.
    pub fn on_create(&mut self, node_id: String, object_ref: KernelObjectRef) {
        self.register(node_id, object_ref);
    }

    /// Lifecycle: move operation (across positions in same doc). `KernelObjectRef` and `node.id` are preserved.
    /// Emits `Generation.movedFrom` provenance.
    pub fn on_move(&mut self, node_id: &str, moved_from: Option<CrossNodeProvenance>) {
        debug_assert!(
            self.by_node_id.contains_key(node_id),
            "move target node_id must exist in registry"
        );
        if let Some(prov) = moved_from {
            let generation = self.generations.entry(node_id.to_string()).or_default();
            generation.moved_from = Some(prov);
        }
    }

    /// Lifecycle: copy operation (duplicate to new location).
    /// Original `KernelObjectRef` + `node.id` retained; new `KernelObjectRef` allocated; new `node.id` must be authored.
    /// Emits `Generation.copiedFrom` provenance.
    pub fn on_copy(
        &mut self,
        original_node_id: &str,
        new_node_id: String,
        new_object_ref: KernelObjectRef,
        copied_from: Option<CrossNodeProvenance>,
    ) {
        let prov = copied_from.unwrap_or_else(|| CrossNodeProvenance::new(None, original_node_id));
        let mut generation = self.generations.get(original_node_id).cloned().unwrap_or_default();
        generation.copied_from = Some(prov);
        self.generations.insert(new_node_id.clone(), generation);
        self.register(new_node_id, new_object_ref);
    }

    /// Lifecycle: delete operation. Entries are archived, not erased, so history walk can resolve them.
    pub fn on_delete(&mut self, node_id: &str) -> Option<KernelObjectRef> {
        if let Some(obj_ref) = self.by_node_id.remove(node_id) {
            self.by_object_ref.remove(&obj_ref);
            self.archived.insert(node_id.to_string(), obj_ref.clone());
            Some(obj_ref)
        } else {
            None
        }
    }

    /// Lifecycle: cross-document move (source document).
    /// Archives the mapping in source registry so historical resolution remains intact.
    pub fn on_cross_doc_move_source(&mut self, node_id: &str) -> Option<KernelObjectRef> {
        self.on_delete(node_id)
    }

    /// Lifecycle: cross-document move (target document).
    /// Registers bundle-unique `node.id` with new `KernelObjectRef` and records `Generation.movedFrom` provenance.
    pub fn on_cross_doc_move_target(
        &mut self,
        node_id: String,
        new_object_ref: KernelObjectRef,
        moved_from: CrossNodeProvenance,
    ) {
        let generation = self.generations.entry(node_id.clone()).or_default();
        generation.moved_from = Some(moved_from);
        self.register(node_id, new_object_ref);
    }

    /// Merges another registry into this one (used during branch merge).
    pub fn merge_registry(&mut self, other: &Self) {
        for (node_id, kor) in &other.by_node_id {
            if !self.by_node_id.contains_key(node_id) {
                self.register(node_id.clone(), kor.clone());
            }
        }
        for (node_id, kor) in &other.archived {
            if !self.by_node_id.contains_key(node_id) {
                self.archived.entry(node_id.clone()).or_insert_with(|| kor.clone());
            }
        }
        for (node_id, gen_val) in &other.generations {
            self.generations.entry(node_id.clone()).or_insert_with(|| gen_val.clone());
        }
    }
}

//! ChangesetBranchManager managing Automerge branches per (sessionId, actor) (ADR 0151 §6, §14 P3).
//!
//! Replaces legacy `ProposalManager` snapshot-and-replay architecture with native
//! Automerge CRDT branch lifecycle.
//!
//! # Architecture Rules (ADR 0151 §4.2, §4.6, §6, §14 P3)
//! - Per-actor changesets are short-lived Automerge branches in working memory.
//! - App Manifest durable session index (`sessions[]`) is updated before branch ops.
//! - The App Manifest carries **NO** `streams[]` field and no transient per-actor sub-documents.
//! - Multiple actors hold open branches concurrently without coordination.
//! - Branch close verifies post-convergence schema validation, merges into canonical docs,
//!   and emits a `SessionOpBatch` bound to Trellis ledger idempotency contracts.

use std::collections::HashMap;

use automerge::transaction::Transactable;
use automerge::{ActorId, ChangeHash, ReadDoc};
use serde::{Deserialize, Serialize};

use crate::document::KernelDocument;
use crate::error::KernelError;
use crate::op::{SubstrateArtifactType, SubstrateOp};
use crate::schema_convergence::{
    validate_convergence, ActorClass, ConvergenceMode, ConvergenceOutcome, OpsRolledBack,
};

/// Lifecycle status of a changeset branch.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BranchStatus {
    /// Active branch open for op dispatch.
    Open,
    /// Accepted and merged into canonical documents.
    Accepted,
    /// Discarded and rolled back.
    Rejected,
}

/// Active branch state held in working memory.
pub struct BranchState {
    /// Branch identifier (e.g. `branch-{session_id}-{actor}`).
    pub branch_id: String,
    /// Authoring session reference URN.
    pub session_id: String,
    /// Author actor identifier URN.
    pub actor: String,
    /// Actor classification.
    pub actor_class: ActorClass,
    /// Convergence mode requested.
    pub mode: ConvergenceMode,
    /// Forked working documents for each substrate artifact.
    pub docs: HashMap<SubstrateArtifactType, KernelDocument>,
    /// Initial heads of documents when branch was forked.
    pub initial_heads: HashMap<SubstrateArtifactType, Vec<ChangeHash>>,
    /// Chronological log of operations applied on this branch.
    pub dispatched_ops: Vec<(SubstrateArtifactType, SubstrateOp)>,
    /// Current lifecycle status.
    pub status: BranchStatus,
}

/// Preview of changeset impact diffing branch vs canonical state (ADR 0151 §6).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangesetPreview {
    /// Branch identifier.
    pub branch_id: String,
    /// Session URN.
    pub session_id: String,
    /// Author actor identifier.
    pub actor: String,
    /// Total operations count.
    pub op_count: usize,
    /// Substrate artifact types touched by this changeset.
    pub affected_artifacts: Vec<SubstrateArtifactType>,
    /// Unique item and component paths modified.
    pub affected_paths: Vec<String>,
}

/// Durable operation batch emitted on branch close (ADR 0151 §4.6, §13.1).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionOpBatch {
    /// Batch schema version (e.g. "1.0").
    pub version: String,
    /// Durable session URN.
    pub session_ref: String,
    /// Closed branch identifier.
    pub branch_id: String,
    /// Author actor identifier.
    pub actor: String,
    /// Artifact references touched.
    pub artifact_refs: Vec<String>,
    /// Document heads prior to merge.
    pub previous_heads: Vec<String>,
    /// Document heads after merge.
    pub new_heads: Vec<String>,
    /// Semantic operations applied.
    pub semantic_ops: Vec<SubstrateOp>,
    /// Automerge change hashes.
    pub change_hashes: Vec<String>,
    /// Optional raw Automerge binary change blobs.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub change_blobs: Option<Vec<Vec<u8>>>,
}

/// Trellis canonical event payload for ledger anchoring (ADR 0151 §13.1).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrellisEventPayload {
    /// Session scope derived from `SessionRef.id`.
    pub ledger_scope: String,
    /// Previous Trellis event hash in chain.
    pub prev_hash: String,
    /// Deterministic idempotency key matching cross-language parity contract.
    pub idempotency_key: String,
    /// Trellis admitted event type literal.
    pub event_type: String,
    /// Embedded session operation batch.
    pub batch: SessionOpBatch,
    /// Canonical batch hash.
    pub batch_hash: String,
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

/// Computes length-prefixed material string for idempotency key per
/// `formspec/tests/conformance/fixtures/studio-ledger-idempotency/cross-language-parity.case.json`.
#[must_use]
pub fn studio_ledger_idempotency_material(
    ledger_scope: &str,
    branch_id: &str,
    op_batch_hash: &str,
) -> String {
    [ledger_scope, branch_id, op_batch_hash]
        .map(|part| format!("{}:{part}", part.encode_utf16().count()))
        .join("|")
}

/// Computes the SHA-256 idempotency key matching cross-language parity contract.
#[must_use]
pub fn studio_ledger_idempotency_key(
    ledger_scope: &str,
    branch_id: &str,
    op_batch_hash: &str,
) -> String {
    let material = studio_ledger_idempotency_material(ledger_scope, branch_id, op_batch_hash);
    let digest = ring::digest::digest(&ring::digest::SHA256, material.as_bytes());
    format!("sha256:{}", hex_encode(digest.as_ref()))
}

impl SessionOpBatch {
    /// Computes canonical hash of the op batch.
    #[must_use]
    pub fn compute_batch_hash(&self) -> String {
        let serialized_ops = serde_json::to_string(&self.semantic_ops).unwrap_or_default();
        let payload = format!("{}:{}:{}", self.session_ref, self.branch_id, serialized_ops);
        let digest = ring::digest::digest(&ring::digest::SHA256, payload.as_bytes());
        format!("sha256:{}", hex_encode(digest.as_ref()))
    }

    /// Serializes batch into a Trellis canonical event payload (ADR 0151 §4.6, §13.1).
    #[must_use]
    pub fn to_trellis_event_payload(&self, prev_hash: &str) -> TrellisEventPayload {
        let batch_hash = self.compute_batch_hash();
        let idempotency_key =
            studio_ledger_idempotency_key(&self.session_ref, &self.branch_id, &batch_hash);
        TrellisEventPayload {
            ledger_scope: self.session_ref.clone(),
            prev_hash: prev_hash.to_string(),
            idempotency_key,
            event_type: "substrate.append.response_action_session_op_batch".to_string(),
            batch: self.clone(),
            batch_hash,
        }
    }
}

/// Branch lifecycle manager keyed by `(sessionId, actor)` per ADR 0151 §6.
#[derive(Default)]
pub struct ChangesetBranchManager {
    branches: HashMap<String, BranchState>,
}

impl ChangesetBranchManager {
    /// Creates a new `ChangesetBranchManager`.
    #[must_use]
    pub fn new() -> Self {
        Self {
            branches: HashMap::new(),
        }
    }

    /// Opens a new changeset branch for `(session_id, actor)`.
    ///
    /// Per ADR 0151 §4.6 and §6:
    /// 1. Validates actor against `allowed_actors` if posture specified.
    /// 2. Ensures the session URN is recorded in App Manifest `sessions[]` before branch ops.
    ///    Never introduces `streams[]` into the App Manifest.
    /// 3. Forks Automerge branches of the App Manifest + relevant artifact documents.
    #[allow(clippy::too_many_arguments)]
    pub fn open_changeset(
        &mut self,
        manifest_doc: &mut KernelDocument,
        session_id: &str,
        actor: &str,
        actor_class: ActorClass,
        mode: Option<ConvergenceMode>,
        allowed_actors: Option<&[String]>,
        artifact_docs: &mut HashMap<SubstrateArtifactType, KernelDocument>,
    ) -> Result<String, KernelError> {
        // 1. Posture Admission Enforcement (ADR 0150 §5.4, ADR 0151 §8 #5)
        if let Some(allowed) = allowed_actors
            && !allowed.iter().any(|a| a == actor)
        {
            return Err(KernelError::ActorAdmissionDenied {
                actor: actor.to_string(),
                reason: "Actor not permitted by posture allowedActors".to_string(),
            });
        }

        // 2. App Manifest session index durable write (ADR 0151 §4.6)
        if manifest_doc.artifact_type() == SubstrateArtifactType::AppManifest {
            let sessions_id = match manifest_doc
                .raw_crdt_doc_mut()
                .get(automerge::ROOT, "sessions")?
            {
                Some((automerge::Value::Object(automerge::ObjType::List), id)) => id,
                _ => manifest_doc.raw_crdt_doc_mut().put_object(
                    automerge::ROOT,
                    "sessions",
                    automerge::ObjType::List,
                )?,
            };

            let len = manifest_doc.raw_crdt_doc().length(&sessions_id);
            let mut found = false;
            for i in 0..len {
                if let Ok(Some((automerge::Value::Scalar(s), _))) =
                    manifest_doc.raw_crdt_doc().get(&sessions_id, i)
                    && s.to_string().contains(session_id)
                {
                    found = true;
                    break;
                }
            }

            if !found {
                let session_record = serde_json::json!({
                    "id": session_id,
                    "openedBy": actor,
                    "actorClass": actor_class.to_string(),
                });
                manifest_doc.raw_crdt_doc_mut().insert(
                    &sessions_id,
                    len,
                    session_record.to_string(),
                )?;
            }
        }

        let branch_id = format!("branch-{}-{}", session_id, actor);

        // 3. Fork working branches for all artifacts
        let mut docs = HashMap::new();
        let mut initial_heads = HashMap::new();

        // Include manifest doc in branch
        let mut manifest_fork = manifest_doc.fork();
        initial_heads.insert(
            SubstrateArtifactType::AppManifest,
            manifest_fork.get_heads(),
        );
        docs.insert(SubstrateArtifactType::AppManifest, manifest_fork);

        for (&art_type, art_doc) in artifact_docs.iter_mut() {
            let mut forked = art_doc.fork();
            initial_heads.insert(art_type, forked.get_heads());
            docs.insert(art_type, forked);
        }

        let branch_state = BranchState {
            branch_id: branch_id.clone(),
            session_id: session_id.to_string(),
            actor: actor.to_string(),
            actor_class,
            mode: mode.unwrap_or(ConvergenceMode::RejectAndRollback),
            docs,
            initial_heads,
            dispatched_ops: Vec::new(),
            status: BranchStatus::Open,
        };

        self.branches.insert(branch_id.clone(), branch_state);
        Ok(branch_id)
    }

    /// Dispatches an operation to an active branch in working memory (ADR 0151 §6).
    pub fn dispatch_op(
        &mut self,
        branch_id: &str,
        artifact_type: SubstrateArtifactType,
        op: SubstrateOp,
        actor_id: Option<ActorId>,
    ) -> Result<(), KernelError> {
        let branch = self
            .branches
            .get_mut(branch_id)
            .ok_or_else(|| KernelError::BranchNotFound(branch_id.to_string()))?;

        if branch.status != BranchStatus::Open {
            return Err(KernelError::BranchAlreadyClosed(branch_id.to_string()));
        }

        let doc = branch
            .docs
            .get_mut(&artifact_type)
            .ok_or_else(|| KernelError::NodeNotFound(artifact_type.to_string()))?;

        if let Some(aid) = actor_id {
            doc.set_actor_id(aid);
        }

        doc.apply_op(&op)?;
        branch.dispatched_ops.push((artifact_type, op));
        Ok(())
    }

    /// Previews changeset impact diffing branch vs canonical state (ADR 0151 §6).
    pub fn preview_impact(
        &self,
        branch_id: &str,
        _canonical_docs: &HashMap<SubstrateArtifactType, KernelDocument>,
    ) -> Result<ChangesetPreview, KernelError> {
        let branch = self
            .branches
            .get(branch_id)
            .ok_or_else(|| KernelError::BranchNotFound(branch_id.to_string()))?;

        let mut affected_artifacts = Vec::new();
        let mut affected_paths = Vec::new();

        for (art_type, op) in &branch.dispatched_ops {
            if !affected_artifacts.contains(art_type) {
                affected_artifacts.push(*art_type);
            }
            match op {
                SubstrateOp::SetItemProperty { path, .. } | SubstrateOp::SetBind { path, .. } => {
                    if !affected_paths.contains(path) {
                        affected_paths.push(path.clone());
                    }
                }
                SubstrateOp::AddComponentNode { node_id, .. }
                | SubstrateOp::MoveComponentNode { node_id, .. }
                | SubstrateOp::CrossDocumentMove { node_id, .. }
                | SubstrateOp::DeleteNode { node_id } => {
                    if !affected_paths.contains(node_id) {
                        affected_paths.push(node_id.clone());
                    }
                }
                SubstrateOp::CopyComponentNode { new_node_id, .. } => {
                    if !affected_paths.contains(new_node_id) {
                        affected_paths.push(new_node_id.clone());
                    }
                }
                SubstrateOp::RawPatch { path, .. } => {
                    let p = path.join(".");
                    if !affected_paths.contains(&p) {
                        affected_paths.push(p);
                    }
                }
            }
        }

        Ok(ChangesetPreview {
            branch_id: branch.branch_id.clone(),
            session_id: branch.session_id.clone(),
            actor: branch.actor.clone(),
            op_count: branch.dispatched_ops.len(),
            affected_artifacts,
            affected_paths,
        })
    }

    /// Accepts and merges an open changeset branch into canonical documents (ADR 0151 §6).
    ///
    /// Executes post-convergence schema validation (§5) prior to final acceptance.
    /// If rejected, rolls back and leaves canonical state intact.
    /// Discards branch handle from working memory upon completion.
    pub fn accept_changeset(
        &mut self,
        branch_id: &str,
        canonical_docs: &mut HashMap<SubstrateArtifactType, KernelDocument>,
        known_renames: &HashMap<String, String>,
    ) -> Result<SessionOpBatch, KernelError> {
        let branch = self
            .branches
            .get_mut(branch_id)
            .ok_or_else(|| KernelError::BranchNotFound(branch_id.to_string()))?;

        if branch.status != BranchStatus::Open {
            return Err(KernelError::BranchAlreadyClosed(branch_id.to_string()));
        }

        let mut previous_heads = Vec::new();
        let mut new_heads = Vec::new();
        let mut change_hashes = Vec::new();
        let mut semantic_ops = Vec::new();
        let mut artifact_refs = Vec::new();

        // 1. Run schema-aware convergence validation on each modified artifact
        for (art_type, branch_doc) in &branch.docs {
            let art_ops: Vec<SubstrateOp> = branch
                .dispatched_ops
                .iter()
                .filter(|(t, _)| t == art_type)
                .map(|(_, o)| o.clone())
                .collect();

            if art_ops.is_empty() {
                continue;
            }

            let report = validate_convergence(
                branch_doc,
                &art_ops,
                &branch.actor,
                branch.actor_class,
                Some(branch.mode),
                known_renames,
            );

            match report.outcome {
                ConvergenceOutcome::RolledBack(rb) => {
                    branch.status = BranchStatus::Rejected;
                    return Err(KernelError::ConvergenceRollback {
                        actor: rb.actor,
                        reason: rb.reason,
                    });
                }
                ConvergenceOutcome::Valid
                | ConvergenceOutcome::Repaired(_)
                | ConvergenceOutcome::Quarantined(_) => {
                    // Admitted
                }
            }
        }

        // 2. Convergence passed: merge branch docs into canonical docs
        for (art_type, branch_doc) in &mut branch.docs {
            if let Some(canonical_doc) = canonical_docs.get_mut(art_type) {
                let prev_h = canonical_doc.get_heads();
                for h in prev_h {
                    previous_heads.push(h.to_string());
                }

                let hashes = canonical_doc.merge(branch_doc)?;
                for h in hashes {
                    change_hashes.push(h.to_string());
                }

                let post_h = canonical_doc.get_heads();
                for h in post_h {
                    new_heads.push(h.to_string());
                }

                artifact_refs.push(art_type.to_string());
            }
        }

        for (_, op) in &branch.dispatched_ops {
            semantic_ops.push(op.clone());
        }

        let batch = SessionOpBatch {
            version: "1.0".to_string(),
            session_ref: branch.session_id.clone(),
            branch_id: branch.branch_id.clone(),
            actor: branch.actor.clone(),
            artifact_refs,
            previous_heads,
            new_heads,
            semantic_ops,
            change_hashes,
            change_blobs: None,
        };

        branch.status = BranchStatus::Accepted;
        // Branch lives only while open; discard after merge (ADR 0151 §4.2, §6)
        self.branches.remove(branch_id);

        Ok(batch)
    }

    /// Rejects and discards a branch without modifying canonical documents (ADR 0151 §6).
    pub fn reject_changeset(&mut self, branch_id: &str) -> Result<OpsRolledBack, KernelError> {
        let branch = self
            .branches
            .remove(branch_id)
            .ok_or_else(|| KernelError::BranchNotFound(branch_id.to_string()))?;

        let ops: Vec<SubstrateOp> = branch.dispatched_ops.into_iter().map(|(_, o)| o).collect();
        Ok(OpsRolledBack {
            actor: branch.actor,
            ops,
            reason: "Changeset discarded by actor or policy".to_string(),
            suggested_repair: None,
        })
    }

    /// Checks if a branch is currently open.
    #[must_use]
    pub fn is_branch_open(&self, branch_id: &str) -> bool {
        self.branches
            .get(branch_id)
            .map(|b| b.status == BranchStatus::Open)
            .unwrap_or(false)
    }
}

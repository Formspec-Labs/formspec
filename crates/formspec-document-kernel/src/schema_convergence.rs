//! Post-convergence schema-aware validation and reference lens shadow gate (ADR 0151 §5, §13.7, §14 P2).
//!
//! Automerge provides strong eventual consistency at byte level, but does not know what makes
//! a Formspec document valid. This module implements the post-convergence schema validation
//! and reference lens that runs deterministically after convergence points, emitting
//! `OpsRolledBack`, `OpsReanchored`, and quarantine diagnostics (`ConvergenceDiagnostic`).

use std::collections::{HashMap, HashSet};

use automerge::ReadDoc;
use serde::{Deserialize, Serialize};

use crate::document::KernelDocument;
use crate::op::{SubstrateArtifactType, SubstrateOp};

/// Convergence mode determining how violations are handled per ADR 0151 §5.3.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ConvergenceMode {
    /// Document is reverted to last validating state; rejected ops returned as anchor failures.
    RejectAndRollback,
    /// Document remains in invalid state with violation surfaced as a Diagnostic.
    QuarantineAndSurface,
    /// Deterministic rewrite executed (e.g. FEL rename reanchored) and both edits kept.
    DeterministicRepair,
}

impl std::fmt::Display for ConvergenceMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::RejectAndRollback => write!(f, "reject-and-rollback"),
            Self::QuarantineAndSurface => write!(f, "quarantine-and-surface"),
            Self::DeterministicRepair => write!(f, "deterministic-repair"),
        }
    }
}

/// Actor classification per ADR 0150 §5.4 and ADR 0151 §7, §13.7.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ActorClass {
    /// Human author editing interactively.
    Human,
    /// Automated product MCP (e.g. Forms-MCP, Wireframes-MCP).
    Mcp,
    /// Backend service or ingest worker.
    Service,
    /// AI agent authoring independently.
    Agent,
}

impl std::fmt::Display for ActorClass {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Human => write!(f, "human"),
            Self::Mcp => write!(f, "mcp"),
            Self::Service => write!(f, "service"),
            Self::Agent => write!(f, "agent"),
        }
    }
}

/// Diagnostic severity classification.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DiagnosticSeverity {
    /// Fatal schema or reference violation blocking production export.
    Error,
    /// Non-fatal advisory or deprecation notice.
    Warning,
    /// Informational lint or telemetry note.
    Info,
}

/// Structured violation record per ADR 0151 §5.1 step 5.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaAwareViolation {
    /// Target artifact identifier or class.
    pub artifact_ref: String,
    /// Identifiers or summaries of ops causing the violation.
    pub op_refs: Vec<String>,
    /// Identifiers or paths of dependent nodes/fields referenced.
    pub dependency_refs: Vec<String>,
    /// Severity of the violation.
    pub severity: DiagnosticSeverity,
    /// Explanatory diagnostic message.
    pub reason: String,
    /// Optional machine-applicable repair suggestion.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggested_repair: Option<String>,
}

/// Quarantine diagnostic surfaced when candidate remains in quarantine mode (ADR 0151 §5.3, §13.7).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvergenceDiagnostic {
    /// Target artifact identifier.
    pub artifact_ref: String,
    /// Ops involved in the diagnostic.
    pub ops: Vec<SubstrateOp>,
    /// Explanatory reason.
    pub reason: String,
    /// Severity level.
    pub severity: DiagnosticSeverity,
}

/// Signal emitted when ops are rolled back (ADR 0151 §5, §5.3).
///
/// Under `reject-and-rollback`, an MCP or actor whose ops are reverted receives
/// this signal so product MCPs can translate it into tool-response failure contracts.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpsRolledBack {
    /// Actor identifier whose ops were reverted.
    pub actor: String,
    /// Rejected operations.
    pub ops: Vec<SubstrateOp>,
    /// Failure reason.
    pub reason: String,
    /// Optional repair guidance or suggested alternative path.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggested_repair: Option<String>,
}

/// Signal emitted when ops are deterministically reanchored (ADR 0151 §5.1, §5.2).
///
/// Recorded when unambiguous field identity mappings allow rewriting a dangling
/// reference (such as `$.email` -> `$.contactEmail`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpsReanchored {
    /// Actor identifier whose op was rewritten.
    pub actor: String,
    /// Reanchored operations.
    pub ops: Vec<SubstrateOp>,
    /// Description of the rewrite performed (e.g. `$.email -> $.contactEmail`).
    pub rewrite: String,
}

/// Outcome of schema-aware convergence validation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ConvergenceOutcome {
    /// Merged state is valid and admitted cleanly.
    Valid,
    /// Merged state had resolvable semantic references and was repaired deterministically.
    Repaired(Vec<OpsReanchored>),
    /// Merged state violated invariants and was rolled back.
    RolledBack(OpsRolledBack),
    /// Merged state violated invariants and was quarantined with diagnostics surfaced.
    Quarantined(Vec<ConvergenceDiagnostic>),
}

/// Shadow gate report recording results of shadow validation against CRDT convergence.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShadowGateReport {
    /// Chosen convergence outcome.
    pub outcome: ConvergenceOutcome,
    /// All classified violations.
    pub violations: Vec<SchemaAwareViolation>,
    /// Any deterministic reanchors executed.
    pub reanchored: Vec<OpsReanchored>,
    /// Any rollback emitted.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rolled_back: Option<OpsRolledBack>,
    /// Any quarantine diagnostics emitted.
    pub diagnostics: Vec<ConvergenceDiagnostic>,
    /// Whether shadow gate differed from naive CRDT convergence (i.e. flagged errors or repairs).
    pub shadow_discrepancy: bool,
}

/// Resolves default convergence mode from ADR 0151 §13.7 Precedence Table.
#[must_use]
pub fn resolve_precedence_mode(
    artifact: SubstrateArtifactType,
    actor_class: ActorClass,
    has_repair: bool,
) -> ConvergenceMode {
    match artifact {
        SubstrateArtifactType::AppManifest => ConvergenceMode::RejectAndRollback,
        SubstrateArtifactType::Definition => match actor_class {
            ActorClass::Human => {
                if has_repair {
                    ConvergenceMode::DeterministicRepair
                } else {
                    ConvergenceMode::QuarantineAndSurface
                }
            }
            ActorClass::Mcp | ActorClass::Service | ActorClass::Agent => {
                if has_repair {
                    ConvergenceMode::DeterministicRepair
                } else {
                    ConvergenceMode::RejectAndRollback
                }
            }
        },
        SubstrateArtifactType::Experience => match actor_class {
            ActorClass::Human => {
                if has_repair {
                    ConvergenceMode::DeterministicRepair
                } else {
                    ConvergenceMode::QuarantineAndSurface
                }
            }
            ActorClass::Mcp | ActorClass::Service | ActorClass::Agent => {
                if has_repair {
                    ConvergenceMode::DeterministicRepair
                } else {
                    ConvergenceMode::RejectAndRollback
                }
            }
        },
        SubstrateArtifactType::ResponseActions => match actor_class {
            ActorClass::Human => {
                if has_repair {
                    ConvergenceMode::DeterministicRepair
                } else {
                    ConvergenceMode::QuarantineAndSurface
                }
            }
            ActorClass::Mcp | ActorClass::Service | ActorClass::Agent => {
                if has_repair {
                    ConvergenceMode::DeterministicRepair
                } else {
                    ConvergenceMode::RejectAndRollback
                }
            }
        },
        SubstrateArtifactType::Component
        | SubstrateArtifactType::Surface
        | SubstrateArtifactType::Theme
        | SubstrateArtifactType::Locale => {
            if has_repair {
                ConvergenceMode::DeterministicRepair
            } else {
                ConvergenceMode::QuarantineAndSurface
            }
        }
        SubstrateArtifactType::Mapping => ConvergenceMode::RejectAndRollback,
    }
}

/// Semantic reference graph extracted from operations and candidate document (ADR 0151 §5.1 step 4).
#[derive(Debug, Clone, Default)]
pub struct SemanticReferenceGraph {
    /// Field and item paths defined in candidate document.
    pub known_fields: HashSet<String>,
    /// Field rename map: old_path -> new_path.
    pub renames: HashMap<String, String>,
    /// Explicit deleted fields: set of deleted field paths.
    pub deleted_fields: HashSet<String>,
    /// Extracted FEL references: (op_index, op, referenced_path).
    pub fel_references: Vec<(usize, SubstrateOp, String)>,
}

/// Extracts FEL references matching `$.<identifier>` or `item.<identifier>` from a string.
pub fn extract_fel_references(expr: &str) -> Vec<String> {
    let mut refs = Vec::new();
    let mut chars = expr.char_indices().peekable();

    while let Some((i, c)) = chars.next() {
        if c == '$' && chars.peek().map(|(_, next_c)| *next_c == '.').unwrap_or(false) {
            chars.next(); // consume '.'
            let start = i + 2;
            let mut end = start;
            while let Some(&(j, ch)) = chars.peek() {
                if ch.is_alphanumeric() || ch == '_' {
                    chars.next();
                    end = j + ch.len_utf8();
                } else {
                    break;
                }
            }
            if end > start {
                refs.push(expr[start..end].to_string());
            }
        }
    }
    refs
}

/// Recursively inspects a JSON value for string-encoded FEL references.
pub fn extract_fel_from_json(val: &serde_json::Value) -> Vec<String> {
    let mut refs = Vec::new();
    match val {
        serde_json::Value::String(s) => {
            refs.extend(extract_fel_references(s));
        }
        serde_json::Value::Array(arr) => {
            for item in arr {
                refs.extend(extract_fel_from_json(item));
            }
        }
        serde_json::Value::Object(map) => {
            for v in map.values() {
                refs.extend(extract_fel_from_json(v));
            }
        }
        _ => {}
    }
    refs
}

/// Builds the semantic reference graph from candidate document and incoming op set.
pub fn extract_semantic_references(
    doc: &KernelDocument,
    ops: &[SubstrateOp],
    known_renames: &HashMap<String, String>,
) -> SemanticReferenceGraph {
    let mut graph = SemanticReferenceGraph {
        renames: known_renames.clone(),
        ..Default::default()
    };

    // 1. Inspect existing items in candidate document
    if let Ok(Some((automerge::Value::Object(automerge::ObjType::Map), items_id))) =
        doc.raw_crdt_doc().get(automerge::ROOT, "items")
    {
        for key in doc.raw_crdt_doc().keys(&items_id) {
            graph.known_fields.insert(key);
        }
    }

    // 2. Inspect components in candidate document
    if let Ok(Some((automerge::Value::Object(automerge::ObjType::Map), comps_id))) =
        doc.raw_crdt_doc().get(automerge::ROOT, "components")
    {
        for key in doc.raw_crdt_doc().keys(&comps_id) {
            graph.known_fields.insert(key);
        }
    }

    // 3. Inspect incoming ops for modifications, renames, and FEL expressions
    for (idx, op) in ops.iter().enumerate() {
        match op {
            SubstrateOp::SetItemProperty {
                path,
                property,
                value,
            } => {
                graph.known_fields.insert(path.clone());
                // If setting property 'renamedFrom', record rename
                if property == "renamedFrom"
                    && let serde_json::Value::String(old_name) = value
                {
                    graph.renames.insert(old_name.clone(), path.clone());
                }
                let refs = extract_fel_from_json(value);
                for r in refs {
                    graph.fel_references.push((idx, op.clone(), r));
                }
            }
            SubstrateOp::SetBind { path, properties } => {
                graph.known_fields.insert(path.clone());
                let refs = extract_fel_from_json(properties);
                for r in refs {
                    graph.fel_references.push((idx, op.clone(), r));
                }
            }
            SubstrateOp::DeleteNode { node_id } => {
                graph.deleted_fields.insert(node_id.clone());
                graph.known_fields.remove(node_id);
            }
            SubstrateOp::AddComponentNode { node_id, node, .. } => {
                graph.known_fields.insert(node_id.clone());
                let refs = extract_fel_from_json(node);
                for r in refs {
                    graph.fel_references.push((idx, op.clone(), r));
                }
            }
            SubstrateOp::CopyComponentNode { new_node_id, .. } => {
                graph.known_fields.insert(new_node_id.clone());
            }
            SubstrateOp::CrossDocumentMove { node_id, .. } => {
                graph.known_fields.insert(node_id.clone());
            }
            _ => {}
        }
    }

    // 4. Any old field that was renamed is no longer a valid active field
    for old_field in graph.renames.keys() {
        graph.known_fields.remove(old_field);
    }

    graph
}

/// Runs post-convergence schema-aware validation on candidate document and incoming ops.
///
/// Implements the 7-step algorithm from ADR 0151 §5.1, including structural validation,
/// semantic reference lens, FEL rename reanchoring worked example (§5.2), and
/// precedence table enforcement (§13.7).
pub fn validate_convergence(
    candidate: &KernelDocument,
    ops: &[SubstrateOp],
    actor: &str,
    actor_class: ActorClass,
    explicit_mode: Option<ConvergenceMode>,
    known_renames: &HashMap<String, String>,
) -> ShadowGateReport {
    let mut violations = Vec::new();
    let mut reanchors = Vec::new();
    let mut diagnostics = Vec::new();

    // ── Step 2: Structural Validation ───────────────────────────────────────
    // AppManifest must NOT contain transient streams[] field (ADR 0151 §4.2)
    if candidate.artifact_type() == SubstrateArtifactType::AppManifest
        && candidate.has_root_key("streams")
    {
        violations.push(SchemaAwareViolation {
            artifact_ref: candidate.artifact_type().to_string(),
            op_refs: vec!["appManifest.streams".to_string()],
            dependency_refs: vec!["streams".to_string()],
            severity: DiagnosticSeverity::Error,
            reason: "ADR 0151 invariant violation: App Manifest carries no streams[] field"
                .to_string(),
            suggested_repair: Some("Remove streams collection; use short-lived branches".to_string()),
        });
    }

    // ── Step 3 & 4: Extract Semantic References & Build Dependency Lens ─────
    let ref_graph = extract_semantic_references(candidate, ops, known_renames);

    // ── Step 5: Classify Reference Violations & Worked Example (§5.2) ──────
    for (op_idx, op, referenced_field) in &ref_graph.fel_references {
        let is_known = ref_graph.known_fields.contains(referenced_field);
        let is_deleted = ref_graph.deleted_fields.contains(referenced_field);

        if !is_known || is_deleted {
            // Dangling FEL reference detected!
            if let Some(target_field) = ref_graph.renames.get(referenced_field) {
                // Unambiguous identity preserved rename detected (§5.2 worked example)
                let old_ref = format!("$.{}", referenced_field);
                let new_ref = format!("$.{}", target_field);
                let rewrite_str = format!("{} -> {}", old_ref, new_ref);

                // Perform deterministic rewrite on the op payload
                let repaired_op = rewrite_op_fel_reference(op, &old_ref, &new_ref);
                reanchors.push(OpsReanchored {
                    actor: actor.to_string(),
                    ops: vec![repaired_op],
                    rewrite: rewrite_str,
                });
            } else {
                // Dangling ref cannot be reanchored (deleted or unmapped)
                let reason = format!(
                    "Dangling FEL reference '$.{}' touched by op #{}",
                    referenced_field, op_idx
                );
                violations.push(SchemaAwareViolation {
                    artifact_ref: candidate.artifact_type().to_string(),
                    op_refs: vec![format!("op[{}]", op_idx)],
                    dependency_refs: vec![referenced_field.clone()],
                    severity: DiagnosticSeverity::Error,
                    reason: reason.clone(),
                    suggested_repair: Some(format!(
                        "Restore field '{}' or update binding expression",
                        referenced_field
                    )),
                });
                diagnostics.push(ConvergenceDiagnostic {
                    artifact_ref: candidate.artifact_type().to_string(),
                    ops: vec![op.clone()],
                    reason,
                    severity: DiagnosticSeverity::Error,
                });
            }
        }
    }

    // ── Step 6 & 7: Apply Precedence Table & Emit Signals ──────────────────
    let has_unresolved_violations = !violations.is_empty();
    let has_repairs = !reanchors.is_empty();

    let effective_mode = explicit_mode.unwrap_or_else(|| {
        resolve_precedence_mode(candidate.artifact_type(), actor_class, has_repairs)
    });

    let (outcome, rolled_back, shadow_discrepancy) = if has_unresolved_violations {
        match effective_mode {
            ConvergenceMode::RejectAndRollback => {
                let rollback = OpsRolledBack {
                    actor: actor.to_string(),
                    ops: ops.to_vec(),
                    reason: violations[0].reason.clone(),
                    suggested_repair: violations[0].suggested_repair.clone(),
                };
                (
                    ConvergenceOutcome::RolledBack(rollback.clone()),
                    Some(rollback),
                    true,
                )
            }
            ConvergenceMode::QuarantineAndSurface | ConvergenceMode::DeterministicRepair => (
                ConvergenceOutcome::Quarantined(diagnostics.clone()),
                None,
                true,
            ),
        }
    } else if has_repairs {
        (
            ConvergenceOutcome::Repaired(reanchors.clone()),
            None,
            true, // shadow discrepancy: deterministic repair rewritten
        )
    } else {
        (ConvergenceOutcome::Valid, None, false)
    };

    ShadowGateReport {
        outcome,
        violations,
        reanchored: reanchors,
        rolled_back,
        diagnostics,
        shadow_discrepancy,
    }
}

/// Rewrites occurrences of `old_ref` with `new_ref` in a `SubstrateOp`.
fn rewrite_op_fel_reference(op: &SubstrateOp, old_ref: &str, new_ref: &str) -> SubstrateOp {
    match op {
        SubstrateOp::SetBind { path, properties } => {
            let mut val_str = properties.to_string();
            val_str = val_str.replace(old_ref, new_ref);
            let rewritten_props = serde_json::from_str(&val_str).unwrap_or_else(|_| properties.clone());
            SubstrateOp::SetBind {
                path: path.clone(),
                properties: rewritten_props,
            }
        }
        SubstrateOp::SetItemProperty {
            path,
            property,
            value,
        } => {
            let mut val_str = value.to_string();
            val_str = val_str.replace(old_ref, new_ref);
            let rewritten_val = serde_json::from_str(&val_str).unwrap_or_else(|_| value.clone());
            SubstrateOp::SetItemProperty {
                path: path.clone(),
                property: property.clone(),
                value: rewritten_val,
            }
        }
        _ => op.clone(),
    }
}

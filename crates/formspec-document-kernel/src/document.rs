use automerge::transaction::Transactable;
use automerge::{ActorId, AutoCommit, ChangeHash, ObjType, ReadDoc, ROOT};
use serde_json::Value;

use crate::error::KernelError;
use crate::kernel_ref::{KernelObjectRef, SubstrateIdRegistry};
use crate::op::{CrossNodeProvenance, Generation, SubstrateArtifactType, SubstrateOp};

/// Substrate-aware document wrapping Automerge 2.0 (`AutoCommit`).
///
/// Encapsulates:
/// - Strong eventual consistency across multi-actor authoring sessions (ADR 0151 §3)
/// - One Automerge `Doc` shape per substrate artifact (ADR 0151 §4.1)
/// - Substrate ID bidirectional registry bridging `node.id` and `KernelObjectRef` (ADR 0151 §4.1)
/// - Typed substrate op translation into Automerge CRDT mutations (ADR 0151 §4.4)
/// - `Generation.movedFrom` and `Generation.copiedFrom` provenance emission (ADR 0150 §5.3 / ADR 0151 §4.4)
/// - Branching, forking, and merging per-actor changesets (ADR 0151 §4.2, §6)
pub struct KernelDocument {
    artifact_type: SubstrateArtifactType,
    doc: AutoCommit,
    registry: SubstrateIdRegistry,
    actor_id: Option<ActorId>,
}

fn initialize_artifact_schema(
    doc: &mut AutoCommit,
    artifact_type: SubstrateArtifactType,
) -> Result<(), automerge::AutomergeError> {
    doc.put(ROOT, "artifactType", artifact_type.to_string())?;
    let _ = doc.put_object(ROOT, "meta", ObjType::Map)?;
    let _ = doc.put_object(ROOT, "metadata", ObjType::Map)?; // backward-compatibility alias

    match artifact_type {
        SubstrateArtifactType::AppManifest => {
            doc.put(ROOT, "version", "2.0")?;
            let _ = doc.put_object(ROOT, "actors", ObjType::List)?;
            let _ = doc.put_object(ROOT, "sessions", ObjType::List)?;
            let _ = doc.put_object(ROOT, "definitions", ObjType::List)?;
            let _ = doc.put_object(ROOT, "surfaces", ObjType::List)?;
            let _ = doc.put_object(ROOT, "registries", ObjType::List)?;
            let _ = doc.put_object(ROOT, "components", ObjType::List)?;
            let _ = doc.put_object(ROOT, "modules", ObjType::List)?;
            let _ = doc.put_object(ROOT, "items", ObjType::Map)?;
        }
        SubstrateArtifactType::Definition => {
            doc.put(ROOT, "version", "1.0")?;
            let _ = doc.put_object(ROOT, "items", ObjType::Map)?;
            let _ = doc.put_object(ROOT, "binds", ObjType::Map)?;
            let _ = doc.put_object(ROOT, "validations", ObjType::Map)?;
            let _ = doc.put_object(ROOT, "computations", ObjType::Map)?;
            let _ = doc.put_object(ROOT, "components", ObjType::Map)?;
        }
        SubstrateArtifactType::Experience => {
            doc.put(ROOT, "version", "1.0")?;
            let _ = doc.put_object(ROOT, "screens", ObjType::List)?;
            let _ = doc.put_object(ROOT, "navigation", ObjType::Map)?;
            let _ = doc.put_object(ROOT, "layouts", ObjType::Map)?;
            let _ = doc.put_object(ROOT, "units", ObjType::Map)?;
            let _ = doc.put_object(ROOT, "actors", ObjType::List)?;
            let _ = doc.put_object(ROOT, "tasks", ObjType::List)?;
            let _ = doc.put_object(ROOT, "items", ObjType::Map)?;
            let _ = doc.put_object(ROOT, "components", ObjType::Map)?;
        }
        SubstrateArtifactType::ResponseActions => {
            doc.put(ROOT, "version", "1.0")?;
            let _ = doc.put_object(ROOT, "actions", ObjType::Map)?;
            let _ = doc.put_object(ROOT, "rules", ObjType::Map)?;
            let _ = doc.put_object(ROOT, "hooks", ObjType::List)?;
            let _ = doc.put_object(ROOT, "items", ObjType::Map)?;
            let _ = doc.put_object(ROOT, "components", ObjType::Map)?;
        }
        SubstrateArtifactType::Component => {
            doc.put(ROOT, "version", "1.0")?;
            let _ = doc.put_object(ROOT, "rootNode", ObjType::Map)?;
            let _ = doc.put_object(ROOT, "nodes", ObjType::Map)?;
            let _ = doc.put_object(ROOT, "components", ObjType::Map)?;
            let _ = doc.put_object(ROOT, "slots", ObjType::Map)?;
            let _ = doc.put_object(ROOT, "items", ObjType::Map)?;
        }
        SubstrateArtifactType::Surface => {
            doc.put(ROOT, "version", "0.3")?;
            let _ = doc.put_object(ROOT, "canvas", ObjType::Map)?;
            let _ = doc.put_object(ROOT, "regions", ObjType::Map)?;
            let _ = doc.put_object(ROOT, "containers", ObjType::Map)?;
            let _ = doc.put_object(ROOT, "routes", ObjType::List)?;
            let _ = doc.put_object(ROOT, "components", ObjType::Map)?;
            let _ = doc.put_object(ROOT, "items", ObjType::Map)?;
        }
        SubstrateArtifactType::Theme => {
            doc.put(ROOT, "version", "1.0")?;
            let _ = doc.put_object(ROOT, "tokens", ObjType::Map)?;
            let _ = doc.put_object(ROOT, "styles", ObjType::Map)?;
            let _ = doc.put_object(ROOT, "components", ObjType::Map)?;
            let _ = doc.put_object(ROOT, "items", ObjType::Map)?;
        }
        SubstrateArtifactType::Locale => {
            doc.put(ROOT, "version", "1.0")?;
            let _ = doc.put_object(ROOT, "strings", ObjType::Map)?;
            let _ = doc.put_object(ROOT, "locales", ObjType::List)?;
            let _ = doc.put_object(ROOT, "components", ObjType::Map)?;
            let _ = doc.put_object(ROOT, "items", ObjType::Map)?;
        }
        SubstrateArtifactType::Mapping => {
            doc.put(ROOT, "version", "1.0")?;
            let _ = doc.put_object(ROOT, "mappings", ObjType::Map)?;
            let _ = doc.put_object(ROOT, "transforms", ObjType::List)?;
            let _ = doc.put_object(ROOT, "components", ObjType::Map)?;
            let _ = doc.put_object(ROOT, "items", ObjType::Map)?;
        }
    }
    Ok(())
}

impl KernelDocument {
    /// Creates a new `KernelDocument` for the given substrate artifact type.
    #[must_use]
    pub fn new(artifact_type: SubstrateArtifactType) -> Self {
        Self::with_actor(artifact_type, ActorId::random())
    }

    /// Creates a new `KernelDocument` with a specific actor identifier.
    #[must_use]
    pub fn with_actor(artifact_type: SubstrateArtifactType, actor_id: ActorId) -> Self {
        let mut doc = AutoCommit::new();
        doc.set_actor(actor_id.clone());
        let _ = initialize_artifact_schema(&mut doc, artifact_type);

        Self {
            artifact_type,
            doc,
            registry: SubstrateIdRegistry::new(),
            actor_id: Some(actor_id),
        }
    }

    /// Returns the substrate artifact type of this document.
    #[must_use]
    pub const fn artifact_type(&self) -> SubstrateArtifactType {
        self.artifact_type
    }

    /// Returns a reference to the substrate ID registry.
    #[must_use]
    pub const fn registry(&self) -> &SubstrateIdRegistry {
        &self.registry
    }

    /// Returns a mutable reference to the substrate ID registry.
    pub fn registry_mut(&mut self) -> &mut SubstrateIdRegistry {
        &mut self.registry
    }

    /// Returns the current actor ID if assigned.
    #[must_use]
    pub const fn actor_id(&self) -> Option<&ActorId> {
        self.actor_id.as_ref()
    }

    /// Sets the actor ID on the underlying Automerge document.
    pub fn set_actor_id(&mut self, actor_id: ActorId) {
        self.doc.set_actor(actor_id.clone());
        self.actor_id = Some(actor_id);
    }

    /// Returns current heads (change hashes) of the document.
    pub fn get_heads(&mut self) -> Vec<ChangeHash> {
        self.doc.get_heads()
    }

    /// Returns all top-level keys present in the Automerge document root.
    #[must_use]
    pub fn root_keys(&self) -> Vec<String> {
        self.doc.keys(ROOT).collect()
    }

    /// Checks whether a key is present at the document root.
    #[must_use]
    pub fn has_root_key(&self, key: &str) -> bool {
        self.doc.get(ROOT, key).map(|v| v.is_some()).unwrap_or(false)
    }

    /// Look up `Generation` provenance metadata for a registered node.
    #[must_use]
    pub fn get_generation(&self, node_id: &str) -> Option<&Generation> {
        self.registry.get_generation(node_id)
    }

    /// Applies a substrate-aware operation to the document and updates the registry.
    pub fn apply_op(&mut self, op: &SubstrateOp) -> Result<(), KernelError> {
        match op {
            SubstrateOp::SetItemProperty {
                path,
                property,
                value,
            } => {
                // Ensure items map exists
                let items_id = self
                    .doc
                    .get(ROOT, "items")?
                    .and_then(|(v, id)| match v {
                        automerge::Value::Object(ObjType::Map) => Some(id),
                        _ => None,
                    })
                    .unwrap_or(ROOT);

                // Ensure item map at path exists
                let item_obj = match self.doc.get(&items_id, path)? {
                    Some((automerge::Value::Object(ObjType::Map), id)) => id,
                    _ => self.doc.put_object(&items_id, path, ObjType::Map)?,
                };

                // Put serialized value
                let val_str = serde_json::to_string(value)?;
                self.doc.put(&item_obj, property, val_str)?;
            }
            SubstrateOp::SetBind { path, properties } => {
                let items_id = match self.doc.get(ROOT, "items")? {
                    Some((automerge::Value::Object(ObjType::Map), id)) => id,
                    _ => self.doc.put_object(ROOT, "items", ObjType::Map)?,
                };

                let item_obj = match self.doc.get(&items_id, path)? {
                    Some((automerge::Value::Object(ObjType::Map), id)) => id,
                    _ => self.doc.put_object(&items_id, path, ObjType::Map)?,
                };

                let props_str = serde_json::to_string(properties)?;
                self.doc.put(&item_obj, "binds", props_str)?;
            }
            SubstrateOp::AddComponentNode {
                parent_ref,
                node_id,
                node,
            } => {
                // Register in SubstrateIdRegistry
                let kor = KernelObjectRef::random();
                self.registry.on_create(node_id.clone(), kor.clone());

                let components_id = match self.doc.get(ROOT, "components")? {
                    Some((automerge::Value::Object(ObjType::Map), id)) => id,
                    _ => self.doc.put_object(ROOT, "components", ObjType::Map)?,
                };

                let comp_obj = self.doc.put_object(&components_id, node_id, ObjType::Map)?;
                self.doc.put(&comp_obj, "id", node_id.as_str())?;
                self.doc.put(&comp_obj, "kor", kor.as_str())?;
                if let Some(parent) = parent_ref {
                    self.doc.put(&comp_obj, "parentRef", parent.as_str())?;
                }
                let node_data = serde_json::to_string(node)?;
                self.doc.put(&comp_obj, "data", node_data)?;
            }
            SubstrateOp::MoveComponentNode {
                node_id,
                new_parent_ref,
                new_index,
                moved_from,
            } => {
                let prov = moved_from.clone().unwrap_or_else(|| {
                    CrossNodeProvenance::new(None, format!("/{}", node_id))
                });
                self.registry.on_move(node_id, Some(prov.clone()));

                let components_id = match self.doc.get(ROOT, "components")? {
                    Some((automerge::Value::Object(ObjType::Map), id)) => id,
                    _ => return Err(KernelError::NodeNotFound(node_id.clone())),
                };

                let comp_obj = match self.doc.get(&components_id, node_id)? {
                    Some((automerge::Value::Object(ObjType::Map), id)) => id,
                    _ => return Err(KernelError::NodeNotFound(node_id.clone())),
                };

                if let Some(parent) = new_parent_ref {
                    self.doc.put(&comp_obj, "parentRef", parent.as_str())?;
                } else {
                    let _ = self.doc.delete(&comp_obj, "parentRef");
                }
                self.doc.put(&comp_obj, "index", *new_index as i64)?;

                // Emit Generation.movedFrom in document per ADR 0150 §5.3 / ADR 0151 §4.4
                let gen_obj = match self.doc.get(&comp_obj, "x-generation")? {
                    Some((automerge::Value::Object(ObjType::Map), id)) => id,
                    _ => self.doc.put_object(&comp_obj, "x-generation", ObjType::Map)?,
                };
                let prov_str = serde_json::to_string(&prov)?;
                self.doc.put(&gen_obj, "movedFrom", prov_str.as_str())?;
                self.doc.put(&comp_obj, "movedFrom", prov_str)?;
            }
            SubstrateOp::CopyComponentNode {
                original_node_id,
                new_node_id,
                new_parent_ref,
                new_index,
                copied_from,
            } => {
                let new_kor = KernelObjectRef::random();
                let prov = copied_from.clone().unwrap_or_else(|| {
                    CrossNodeProvenance::new(None, format!("/{}", original_node_id))
                });
                self.registry.on_copy(
                    original_node_id,
                    new_node_id.clone(),
                    new_kor.clone(),
                    Some(prov.clone()),
                );

                let components_id = match self.doc.get(ROOT, "components")? {
                    Some((automerge::Value::Object(ObjType::Map), id)) => id,
                    _ => return Err(KernelError::NodeNotFound(original_node_id.clone())),
                };

                // Read original data if present
                let original_data: Option<String> = match self.doc.get(&components_id, original_node_id)? {
                    Some((automerge::Value::Object(ObjType::Map), id)) => {
                        self.doc.get(&id, "data")?.and_then(|(v, _)| match v {
                            automerge::Value::Scalar(s) => match s.as_ref() {
                                automerge::ScalarValue::Str(s) => Some(s.to_string()),
                                _ => None,
                            },
                            _ => None,
                        })
                    }
                    _ => None,
                };

                let comp_obj = self.doc.put_object(&components_id, new_node_id, ObjType::Map)?;
                self.doc.put(&comp_obj, "id", new_node_id.as_str())?;
                self.doc.put(&comp_obj, "kor", new_kor.as_str())?;
                if let Some(parent) = new_parent_ref {
                    self.doc.put(&comp_obj, "parentRef", parent.as_str())?;
                }
                self.doc.put(&comp_obj, "index", *new_index as i64)?;
                if let Some(data) = original_data {
                    self.doc.put(&comp_obj, "data", data)?;
                }

                // Emit Generation.copiedFrom in document per ADR 0150 §5.3 / ADR 0151 §4.4
                let gen_obj = match self.doc.get(&comp_obj, "x-generation")? {
                    Some((automerge::Value::Object(ObjType::Map), id)) => id,
                    _ => self.doc.put_object(&comp_obj, "x-generation", ObjType::Map)?,
                };
                let prov_str = serde_json::to_string(&prov)?;
                self.doc.put(&gen_obj, "copiedFrom", prov_str.as_str())?;
                self.doc.put(&comp_obj, "copiedFrom", prov_str)?;
            }
            SubstrateOp::CrossDocumentMove {
                node_id,
                target_parent_ref,
                target_index,
                moved_from,
            } => {
                let new_kor = KernelObjectRef::random();
                self.registry.on_cross_doc_move_target(
                    node_id.clone(),
                    new_kor.clone(),
                    moved_from.clone(),
                );

                let components_id = match self.doc.get(ROOT, "components")? {
                    Some((automerge::Value::Object(ObjType::Map), id)) => id,
                    _ => self.doc.put_object(ROOT, "components", ObjType::Map)?,
                };

                let comp_obj = self.doc.put_object(&components_id, node_id, ObjType::Map)?;
                self.doc.put(&comp_obj, "id", node_id.as_str())?;
                self.doc.put(&comp_obj, "kor", new_kor.as_str())?;
                if let Some(parent) = target_parent_ref {
                    self.doc.put(&comp_obj, "parentRef", parent.as_str())?;
                }
                self.doc.put(&comp_obj, "index", *target_index as i64)?;

                let gen_obj = match self.doc.get(&comp_obj, "x-generation")? {
                    Some((automerge::Value::Object(ObjType::Map), id)) => id,
                    _ => self.doc.put_object(&comp_obj, "x-generation", ObjType::Map)?,
                };
                let prov_str = serde_json::to_string(moved_from)?;
                self.doc.put(&gen_obj, "movedFrom", prov_str.as_str())?;
                self.doc.put(&comp_obj, "movedFrom", prov_str)?;
            }
            SubstrateOp::DeleteNode { node_id } => {
                self.registry.on_delete(node_id);

                if let Some((automerge::Value::Object(ObjType::Map), id)) =
                    self.doc.get(ROOT, "components")?
                {
                    let _ = self.doc.delete(&id, node_id);
                }
            }
            SubstrateOp::RawPatch { path, value } => {
                let mut current_obj = ROOT;
                for segment in path.iter().take(path.len().saturating_sub(1)) {
                    current_obj = match self.doc.get(&current_obj, segment)? {
                        Some((automerge::Value::Object(ObjType::Map), id)) => id,
                        _ => self.doc.put_object(&current_obj, segment, ObjType::Map)?,
                    };
                }
                if let Some(last) = path.last() {
                    let val_str = serde_json::to_string(value)?;
                    self.doc.put(&current_obj, last, val_str)?;
                }
            }
        }
        Ok(())
    }

    /// Executes a cross-document move between two `KernelDocument` instances.
    ///
    /// Per ADR 0150 §5.3 and ADR 0151 §4.1:
    /// - `node.id` is preserved (bundle-unique invariant carries it across).
    /// - If `target` already contains `node_id`, returns `KernelError::BundleIdCollision`.
    /// - Source document mapping retains the historical entry (archived for causal walk).
    /// - Target document allocates a new `KernelObjectRef` and registers the mapping.
    /// - `Generation.movedFrom` provenance is emitted on the moved node.
    pub fn cross_document_move(
        source: &mut Self,
        target: &mut Self,
        node_id: &str,
        target_parent_ref: Option<String>,
        target_index: usize,
        source_route: Option<String>,
    ) -> Result<KernelObjectRef, KernelError> {
        // Invariant 1: Source document must contain the node
        let _ = source
            .resolve_object_ref(node_id)
            .ok_or_else(|| KernelError::NodeNotFound(node_id.to_string()))?;

        // Invariant 2: Bundle-unique ID check (ADR 0150 §5.3 / ADR 0151 §4.1)
        if target.resolve_object_ref(node_id).is_some() {
            return Err(KernelError::BundleIdCollision(node_id.to_string()));
        }

        // Read source node payload if present
        let mut source_data = None;
        if let Some((automerge::Value::Object(ObjType::Map), comps_id)) =
            source.doc.get(ROOT, "components")?
        {
            if let Some((automerge::Value::Object(ObjType::Map), comp_id)) =
                source.doc.get(&comps_id, node_id)?
                && let Some((automerge::Value::Scalar(s), _)) = source.doc.get(&comp_id, "data")?
                    && let automerge::ScalarValue::Str(d) = s.as_ref() {
                        source_data = Some(d.to_string());
                    }
            // Delete from source document
            let _ = source.doc.delete(&comps_id, node_id);
        }

        // Archive in source registry
        source.registry.on_cross_doc_move_source(node_id);

        // Build provenance
        let provenance = CrossNodeProvenance {
            route: source_route,
            node_path: format!("/{}", node_id),
            document_id: Some(source.artifact_type().to_string()),
        };

        // Allocate new KernelObjectRef and register in target
        let new_kor = KernelObjectRef::random();
        target.registry.on_cross_doc_move_target(
            node_id.to_string(),
            new_kor.clone(),
            provenance.clone(),
        );

        let components_id = match target.doc.get(ROOT, "components")? {
            Some((automerge::Value::Object(ObjType::Map), id)) => id,
            _ => target.doc.put_object(ROOT, "components", ObjType::Map)?,
        };

        let comp_obj = target.doc.put_object(&components_id, node_id, ObjType::Map)?;
        target.doc.put(&comp_obj, "id", node_id)?;
        target.doc.put(&comp_obj, "kor", new_kor.as_str())?;
        if let Some(parent) = target_parent_ref {
            target.doc.put(&comp_obj, "parentRef", parent.as_str())?;
        }
        target.doc.put(&comp_obj, "index", target_index as i64)?;
        if let Some(data) = source_data {
            target.doc.put(&comp_obj, "data", data)?;
        }

        let gen_obj = target.doc.put_object(&comp_obj, "x-generation", ObjType::Map)?;
        let prov_str = serde_json::to_string(&provenance)?;
        target.doc.put(&gen_obj, "movedFrom", prov_str.as_str())?;
        target.doc.put(&comp_obj, "movedFrom", prov_str)?;

        Ok(new_kor)
    }

    /// Forks this document into an independent branch with matching registry state.
    ///
    /// Per ADR 0151 §4.2:
    /// "When an actor opens a changeset, the kernel forks an Automerge branch...
    /// ops accumulate on the branch in working memory; the branch is not visible
    /// to other actors until merge."
    pub fn fork(&mut self) -> Self {
        Self {
            artifact_type: self.artifact_type,
            doc: self.doc.fork(),
            registry: self.registry.clone(),
            actor_id: self.actor_id.clone(),
        }
    }

    /// Merges an incoming document branch into this document.
    ///
    /// Automerge provides strong eventual consistency (ADR 0151 §3).
    /// Merges the substrate ID registries and applies all CRDT changes.
    pub fn merge(&mut self, other: &mut Self) -> Result<Vec<ChangeHash>, KernelError> {
        let hashes = self.doc.merge(&mut other.doc)?;
        self.registry.merge_registry(&other.registry);
        Ok(hashes)
    }

    /// Serializes the document into Automerge binary byte stream.
    #[must_use]
    pub fn save(&mut self) -> Vec<u8> {
        self.doc.save()
    }

    /// Loads a document from Automerge binary byte stream.
    pub fn load(artifact_type: SubstrateArtifactType, bytes: &[u8]) -> Result<Self, KernelError> {
        let doc = AutoCommit::load(bytes)?;
        let mut kdoc = Self {
            artifact_type,
            doc,
            registry: SubstrateIdRegistry::new(),
            actor_id: None,
        };
        kdoc.rebuild_registry_from_doc()?;
        Ok(kdoc)
    }

    /// Rebuilds substrate registry mappings and Generation provenance from document.
    fn rebuild_registry_from_doc(&mut self) -> Result<(), KernelError> {
        if let Some((automerge::Value::Object(ObjType::Map), comps_id)) =
            self.doc.get(ROOT, "components")?
        {
            for key in self.doc.keys(&comps_id) {
                if let Some((automerge::Value::Object(ObjType::Map), comp_id)) =
                    self.doc.get(&comps_id, &key)?
                {
                    if let Some((automerge::Value::Scalar(s), _)) = self.doc.get(&comp_id, "kor")?
                        && let automerge::ScalarValue::Str(kor_str) = s.as_ref() {
                            self.registry.register(key.clone(), KernelObjectRef::new(kor_str.as_str()));
                        }

                    // Rebuild Generation metadata if present
                    let mut generation = Generation::default();
                    let mut has_gen = false;

                    if let Some((automerge::Value::Object(ObjType::Map), gen_id)) =
                        self.doc.get(&comp_id, "x-generation")?
                    {
                        if let Some(mf) = extract_provenance(&self.doc, &gen_id, "movedFrom") {
                            generation.moved_from = Some(mf);
                            has_gen = true;
                        }
                        if let Some(cf) = extract_provenance(&self.doc, &gen_id, "copiedFrom") {
                            generation.copied_from = Some(cf);
                            has_gen = true;
                        }
                    } else {
                        if let Some(mf) = extract_provenance(&self.doc, &comp_id, "movedFrom") {
                            generation.moved_from = Some(mf);
                            has_gen = true;
                        }
                        if let Some(cf) = extract_provenance(&self.doc, &comp_id, "copiedFrom") {
                            generation.copied_from = Some(cf);
                            has_gen = true;
                        }
                    }

                    if has_gen {
                        self.registry.set_generation(key.clone(), generation);
                    }
                }
            }
        }
        Ok(())
    }

    /// Returns a direct reference to the underlying Automerge `AutoCommit` CRDT.
    #[must_use]
    pub const fn raw_crdt_doc(&self) -> &AutoCommit {
        &self.doc
    }

    /// Returns a mutable reference to the underlying Automerge `AutoCommit` CRDT.
    pub fn raw_crdt_doc_mut(&mut self) -> &mut AutoCommit {
        &mut self.doc
    }

    /// Reads raw string value at item path and property if present.
    pub fn get_item_property(&self, path: &str, property: &str) -> Result<Option<Value>, KernelError> {
        let items_id = match self.doc.get(ROOT, "items")? {
            Some((automerge::Value::Object(ObjType::Map), id)) => id,
            _ => return Ok(None),
        };
        let item_id = match self.doc.get(&items_id, path)? {
            Some((automerge::Value::Object(ObjType::Map), id)) => id,
            _ => return Ok(None),
        };
        if let Some((automerge::Value::Scalar(s), _)) = self.doc.get(&item_id, property)?
            && let automerge::ScalarValue::Str(val_str) = s.as_ref() {
                let parsed: Value = serde_json::from_str(val_str)?;
                return Ok(Some(parsed));
            }
        Ok(None)
    }
}

fn extract_provenance(
    doc: &AutoCommit,
    obj_id: &automerge::ObjId,
    field: &str,
) -> Option<CrossNodeProvenance> {
    if let Ok(Some((automerge::Value::Scalar(s), _))) = doc.get(obj_id, field)
        && let automerge::ScalarValue::Str(val) = s.as_ref() {
            return serde_json::from_str::<CrossNodeProvenance>(val).ok();
        }
    None
}


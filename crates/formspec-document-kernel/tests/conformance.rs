use std::collections::HashMap;

use automerge::{ActorId, ReadDoc};
use formspec_document_kernel::bindings::{js_wasm, python};
use formspec_document_kernel::{
    studio_ledger_idempotency_key, studio_ledger_idempotency_material, validate_convergence,
    ActorClass, ChangesetBranchManager, ConvergenceMode, ConvergenceOutcome, KernelDocument,
    KernelError, SessionOpBatch, SubstrateArtifactType, SubstrateOp,
};
use serde_json::json;

#[test]
fn test_replica_convergence() {
    let mut root = KernelDocument::new(SubstrateArtifactType::Definition);

    // Fork Actor A and Actor B from root
    let mut actor_a = root.fork();
    actor_a.set_actor_id(ActorId::from("actor-a".as_bytes()));

    let mut actor_b = root.fork();
    actor_b.set_actor_id(ActorId::from("actor-b".as_bytes()));

    // Actor A sets an item property
    actor_a
        .apply_op(&SubstrateOp::SetItemProperty {
            path: "contact.email".to_string(),
            property: "label".to_string(),
            value: json!("Email Address"),
        })
        .expect("actor_a apply_op should succeed");

    // Actor B adds a component node
    actor_b
        .apply_op(&SubstrateOp::AddComponentNode {
            parent_ref: None,
            node_id: "urn:formspec:node:submit-button".to_string(),
            node: json!({
                "type": "Button",
                "label": "Submit Form"
            }),
        })
        .expect("actor_b apply_op should succeed");

    // Merge A into B, and B into A
    let _ = actor_a.merge(&mut actor_b).expect("merge into A succeeds");
    let _ = actor_b.merge(&mut actor_a).expect("merge into B succeeds");

    // Strong eventual consistency: both replicas converge to identical heads
    assert_eq!(actor_a.get_heads(), actor_b.get_heads());

    // Both documents observe both operations
    let val_a = actor_a
        .get_item_property("contact.email", "label")
        .expect("lookup on A succeeds");
    let val_b = actor_b
        .get_item_property("contact.email", "label")
        .expect("lookup on B succeeds");
    assert_eq!(val_a, Some(json!("Email Address")));
    assert_eq!(val_b, Some(json!("Email Address")));

    // Both registries contain the newly added component node
    assert!(actor_a
        .registry()
        .get_object_ref("urn:formspec:node:submit-button")
        .is_some());
    assert!(actor_b
        .registry()
        .get_object_ref("urn:formspec:node:submit-button")
        .is_some());
}

#[test]
fn test_registry_lifecycle_and_stability() {
    let mut doc = KernelDocument::new(SubstrateArtifactType::Component);

    // 1. Create operation
    let node_1 = "urn:formspec:node:field-1";
    doc.apply_op(&SubstrateOp::AddComponentNode {
        parent_ref: None,
        node_id: node_1.to_string(),
        node: json!({ "kind": "TextField" }),
    })
    .expect("add component node");

    let kor_1 = doc
        .resolve_object_ref(node_1)
        .expect("node_1 must have KernelObjectRef");
    assert_eq!(doc.resolve_node_id(&kor_1), Some(node_1));

    // 2. Move operation (preserves both node_id and KernelObjectRef)
    doc.apply_op(&SubstrateOp::MoveComponentNode {
        node_id: node_1.to_string(),
        new_parent_ref: Some("urn:formspec:node:container".to_string()),
        new_index: 2,
        moved_from: None,
    })
    .expect("move component node");

    let kor_after_move = doc
        .resolve_object_ref(node_1)
        .expect("node_1 must retain KernelObjectRef after move");
    assert_eq!(kor_1, kor_after_move);

    // 3. Copy operation (allocates new KernelObjectRef for new node_id)
    let node_2 = "urn:formspec:node:field-2";
    doc.apply_op(&SubstrateOp::CopyComponentNode {
        original_node_id: node_1.to_string(),
        new_node_id: node_2.to_string(),
        new_parent_ref: None,
        new_index: 0,
        copied_from: None,
    })
    .expect("copy component node");

    let kor_2 = doc
        .resolve_object_ref(node_2)
        .expect("node_2 must have distinct KernelObjectRef");
    assert_ne!(kor_1, kor_2);
    assert_eq!(doc.resolve_node_id(&kor_2), Some(node_2));

    // 4. Delete operation (archives mapping for history inspection)
    doc.apply_op(&SubstrateOp::DeleteNode {
        node_id: node_1.to_string(),
    })
    .expect("delete component node");

    // Active lookup is removed, but escape-hatch resolution resolves archived entry
    assert!(doc.registry().get_object_ref(node_1).is_none());
    assert_eq!(doc.resolve_object_ref(node_1), Some(kor_1));
}

#[test]
fn test_escape_hatch_and_history_walk() {
    let actor_id = ActorId::from("author-inspector".as_bytes());
    let mut doc = KernelDocument::with_actor(
        SubstrateArtifactType::AppManifest,
        actor_id.clone(),
    );

    doc.apply_op(&SubstrateOp::SetItemProperty {
        path: "session.current".to_string(),
        property: "status".to_string(),
        value: json!("active"),
    })
    .expect("apply op 1");

    doc.apply_op(&SubstrateOp::SetItemProperty {
        path: "session.current".to_string(),
        property: "status".to_string(),
        value: json!("committed"),
    })
    .expect("apply op 2");

    let history = doc.walk_history();
    assert!(!history.is_empty(), "history entries must be recorded");

    for entry in &history {
        assert!(!entry.hash.is_empty());
        assert_eq!(entry.actor_id, actor_id.to_string());
    }
}

#[test]
fn test_byte_parity_roundtrip() {
    let mut doc = KernelDocument::new(SubstrateArtifactType::Definition);
    doc.apply_op(&SubstrateOp::AddComponentNode {
        parent_ref: None,
        node_id: "urn:formspec:node:persisted".to_string(),
        node: json!({ "title": "Persisted Node" }),
    })
    .expect("add node");

    let bytes = doc.save();
    assert!(!bytes.is_empty());

    let mut reloaded = KernelDocument::load(SubstrateArtifactType::Definition, &bytes)
        .expect("load from bytes succeeds");

    // Registry mapping must be faithfully recovered
    assert!(reloaded
        .resolve_object_ref("urn:formspec:node:persisted")
        .is_some());

    // Resaved bytes must match
    let resaved = reloaded.save();
    assert_eq!(bytes, resaved, "byte parity must hold across save/load");
}

#[test]
fn test_binding_shells() {
    // JS/WASM binding shell
    let doc_bytes = js_wasm::create_document("\"definition\"").expect("create_document");
    assert!(!doc_bytes.is_empty());

    let op_json = serde_json::to_string(&SubstrateOp::SetItemProperty {
        path: "summary".to_string(),
        property: "text".to_string(),
        value: json!("Hello Wasm"),
    })
    .expect("serialize op");

    let mutated_bytes =
        js_wasm::apply_op("\"definition\"", &doc_bytes, &op_json).expect("apply_op");
    let forked_bytes = js_wasm::fork_document("\"definition\"", &mutated_bytes).expect("fork");
    let merged_bytes =
        js_wasm::merge_documents("\"definition\"", &mutated_bytes, &forked_bytes).expect("merge");
    assert!(!merged_bytes.is_empty());

    // Python binding shell
    let mut py_shell =
        python::PyKernelDocumentShell::new("\"component\"").expect("PyKernelDocumentShell::new");
    let add_node_json = serde_json::to_string(&SubstrateOp::AddComponentNode {
        parent_ref: None,
        node_id: "urn:formspec:node:py".to_string(),
        node: json!({ "py": true }),
    })
    .expect("serialize py op");

    py_shell
        .apply_op_json(&add_node_json)
        .expect("apply_op_json");
    let kor = py_shell.resolve_object_ref("urn:formspec:node:py");
    assert!(kor.is_some());
    let py_bytes = py_shell.save_bytes();
    assert!(!py_bytes.is_empty());
}

#[test]
fn test_fixture_corpus_byte_parity() {
    let fixture_path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../tests/conformance/multi-actor/byte-parity.case.json"
    );
    let fixture_content =
        std::fs::read_to_string(fixture_path).expect("read multi-actor fixture");
    let json: serde_json::Value =
        serde_json::from_str(&fixture_content).expect("parse fixture json");

    let vectors = json["vectors"].as_array().expect("vectors array");
    assert!(!vectors.is_empty(), "must have at least one test vector");

    for vec in vectors {
        let artifact_type_str = vec["artifactType"].as_str().expect("artifactType");
        let artifact_type: SubstrateArtifactType =
            serde_json::from_value(serde_json::Value::String(artifact_type_str.to_string()))
                .expect("parse artifact type");

        let mut doc = KernelDocument::new(artifact_type);

        let ops = vec["ops"].as_array().expect("ops array");
        for op_val in ops {
            let op: SubstrateOp =
                serde_json::from_value(op_val.clone()).expect("parse SubstrateOp");
            doc.apply_op(&op).expect("apply fixture op");
        }

        let saved = doc.save();
        assert!(!saved.is_empty());

        let mut reloaded =
            KernelDocument::load(artifact_type, &saved).expect("reload fixture doc");
        let resaved = reloaded.save();
        assert_eq!(
            saved, resaved,
            "byte parity failed for fixture case: {:?}",
            vec["case"]
        );
    }
}

#[test]
fn test_substrate_artifact_automerge_doc_shapes() {
    // 1. App Manifest (ADR 0151 §4.1 Doc<AppManifest>)
    let app_manifest = KernelDocument::new(SubstrateArtifactType::AppManifest);
    assert!(app_manifest.has_root_key("artifactType"));
    assert!(app_manifest.has_root_key("version"));
    assert!(app_manifest.has_root_key("actors"));
    assert!(app_manifest.has_root_key("sessions"));
    assert!(app_manifest.has_root_key("definitions"));
    assert!(app_manifest.has_root_key("surfaces"));
    assert!(app_manifest.has_root_key("registries"));
    assert!(app_manifest.has_root_key("components"));
    assert!(app_manifest.has_root_key("modules"));

    // 2. Definition (Doc<FormDefinition>)
    let definition = KernelDocument::new(SubstrateArtifactType::Definition);
    assert!(definition.has_root_key("items"));
    assert!(definition.has_root_key("binds"));
    assert!(definition.has_root_key("validations"));
    assert!(definition.has_root_key("computations"));

    // 3. Experience (Doc<ExperienceDocument>)
    let experience = KernelDocument::new(SubstrateArtifactType::Experience);
    assert!(experience.has_root_key("screens"));
    assert!(experience.has_root_key("navigation"));
    assert!(experience.has_root_key("layouts"));
    assert!(experience.has_root_key("units"));
    assert!(experience.has_root_key("actors"));
    assert!(experience.has_root_key("tasks"));

    // 4. Response Actions (Doc<ResponseActionsDocument>)
    let response_actions = KernelDocument::new(SubstrateArtifactType::ResponseActions);
    assert!(response_actions.has_root_key("actions"));
    assert!(response_actions.has_root_key("rules"));
    assert!(response_actions.has_root_key("hooks"));

    // 5. Component (Doc<ComponentDocument>)
    let component = KernelDocument::new(SubstrateArtifactType::Component);
    assert!(component.has_root_key("rootNode"));
    assert!(component.has_root_key("nodes"));
    assert!(component.has_root_key("components"));
    assert!(component.has_root_key("slots"));

    // 6. Surface (Doc<SurfaceDocument>)
    let surface = KernelDocument::new(SubstrateArtifactType::Surface);
    assert!(surface.has_root_key("canvas"));
    assert!(surface.has_root_key("regions"));
    assert!(surface.has_root_key("containers"));
    assert!(surface.has_root_key("routes"));

    // 7. Theme, Locale, Mapping
    let theme = KernelDocument::new(SubstrateArtifactType::Theme);
    assert!(theme.has_root_key("tokens"));
    assert!(theme.has_root_key("styles"));

    let locale = KernelDocument::new(SubstrateArtifactType::Locale);
    assert!(locale.has_root_key("strings"));
    assert!(locale.has_root_key("locales"));

    let mapping = KernelDocument::new(SubstrateArtifactType::Mapping);
    assert!(mapping.has_root_key("mappings"));
    assert!(mapping.has_root_key("transforms"));
}

#[test]
fn test_generation_provenance_emission() {
    use formspec_document_kernel::CrossNodeProvenance;

    let mut doc = KernelDocument::new(SubstrateArtifactType::Component);

    // 1. Add node
    let node_id = "urn:formspec:node:prov-test";
    doc.apply_op(&SubstrateOp::AddComponentNode {
        parent_ref: None,
        node_id: node_id.to_string(),
        node: json!({ "kind": "TextField", "label": "Full Name" }),
    })
    .expect("add node");

    // 2. Move with movedFrom provenance
    let moved_prov = CrossNodeProvenance::new(
        Some("route-overview".to_string()),
        "/overview/prov-test",
    );
    doc.apply_op(&SubstrateOp::MoveComponentNode {
        node_id: node_id.to_string(),
        new_parent_ref: Some("urn:formspec:node:prov-container".to_string()),
        new_index: 3,
        moved_from: Some(moved_prov.clone()),
    })
    .expect("move node with provenance");

    let gen_meta = doc.get_generation(node_id).expect("must have generation metadata");
    assert_eq!(gen_meta.moved_from.as_ref(), Some(&moved_prov));

    // 3. Copy with copiedFrom provenance
    let copy_id = "urn:formspec:node:prov-copy";
    let copied_prov = CrossNodeProvenance::new(
        Some("route-overview".to_string()),
        node_id,
    );
    doc.apply_op(&SubstrateOp::CopyComponentNode {
        original_node_id: node_id.to_string(),
        new_node_id: copy_id.to_string(),
        new_parent_ref: None,
        new_index: 0,
        copied_from: Some(copied_prov.clone()),
    })
    .expect("copy node with provenance");

    let copy_gen = doc.get_generation(copy_id).expect("copy must have generation metadata");
    assert_eq!(copy_gen.copied_from.as_ref(), Some(&copied_prov));

    // Verify Automerge doc persistence and reload preserves generation
    let bytes = doc.save();
    let reloaded = KernelDocument::load(SubstrateArtifactType::Component, &bytes)
        .expect("load doc");
    let reloaded_gen = reloaded.get_generation(copy_id).expect("reloaded generation metadata");
    assert_eq!(reloaded_gen.copied_from.as_ref(), Some(&copied_prov));
}

#[test]
fn test_cross_document_move_and_bundle_id_collision() {
    let mut doc_a = KernelDocument::new(SubstrateArtifactType::Component);
    let mut doc_b = KernelDocument::new(SubstrateArtifactType::Component);

    let node_id = "urn:formspec:node:shared-field";
    doc_a
        .apply_op(&SubstrateOp::AddComponentNode {
            parent_ref: None,
            node_id: node_id.to_string(),
            node: json!({ "kind": "NumberInput", "value": 42 }),
        })
        .expect("add to doc_a");

    let kor_a = doc_a.resolve_object_ref(node_id).expect("kor in doc_a");

    // Perform cross-document move from doc_a to doc_b
    let kor_b = KernelDocument::cross_document_move(
        &mut doc_a,
        &mut doc_b,
        node_id,
        Some("urn:formspec:node:b-parent".to_string()),
        1,
        Some("route-step-1".to_string()),
    )
    .expect("cross_document_move succeeds");

    // node.id is preserved (ADR 0150 §5.3 bundle-unique invariant)
    assert_eq!(doc_b.resolve_node_id(&kor_b), Some(node_id));
    // New KernelObjectRef is allocated in target doc
    assert_ne!(kor_a, kor_b);

    // Source doc archives historical entry
    assert!(doc_a.registry().get_object_ref(node_id).is_none());
    assert_eq!(doc_a.resolve_object_ref(node_id), Some(kor_a));

    // Target doc gains Generation.movedFrom
    let b_gen = doc_b.get_generation(node_id).expect("must have generation in doc_b");
    let moved_from = b_gen.moved_from.as_ref().expect("must have moved_from");
    assert_eq!(moved_from.route.as_deref(), Some("route-step-1"));
    assert_eq!(moved_from.document_id.as_deref(), Some("Component"));

    // Collision rejection: Attempting to move into doc_b when node_id already exists fails with BundleIdCollision
    let mut doc_c = KernelDocument::new(SubstrateArtifactType::Component);
    doc_c
        .apply_op(&SubstrateOp::AddComponentNode {
            parent_ref: None,
            node_id: node_id.to_string(),
            node: json!({ "kind": "NumberInput", "value": 99 }),
        })
        .expect("add to doc_c");

    let collision_err = KernelDocument::cross_document_move(
        &mut doc_c,
        &mut doc_b,
        node_id,
        None,
        0,
        None,
    );
    match collision_err {
        Err(formspec_document_kernel::KernelError::BundleIdCollision(id)) => {
            assert_eq!(id, node_id);
        }
        other => panic!("expected BundleIdCollision error, got: {:?}", other),
    }
}

#[test]
fn test_fixture_corpus_node_id_kernel_ref_stability() {
    let fixture_path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../tests/conformance/multi-actor/node-id-kernel-ref-stability.case.json"
    );
    let fixture_content =
        std::fs::read_to_string(fixture_path).expect("read node-id-kernel-ref-stability fixture");
    let json: serde_json::Value =
        serde_json::from_str(&fixture_content).expect("parse fixture json");

    let vectors = json["vectors"].as_array().expect("vectors array");
    assert!(!vectors.is_empty(), "must have at least one test vector");

    for vec in vectors {
        let case_name = vec["case"].as_str().expect("case");

        match case_name {
            "replay-stability" => {
                let mut doc = KernelDocument::new(SubstrateArtifactType::Component);
                let ops = vec["initialOps"].as_array().expect("initialOps");
                for op_val in ops {
                    let op: SubstrateOp =
                        serde_json::from_value(op_val.clone()).expect("parse op");
                    doc.apply_op(&op).expect("apply op");
                }

                // Verify replay against a fresh doc yields identical state & mappings
                let mut replay_doc = KernelDocument::new(SubstrateArtifactType::Component);
                for op_val in ops {
                    let op: SubstrateOp =
                        serde_json::from_value(op_val.clone()).expect("parse op");
                    replay_doc.apply_op(&op).expect("apply replay op");
                }

                let nodes = vec["assertions"]["nodesPreserved"].as_array().expect("nodes");
                for n in nodes {
                    let nid = n.as_str().expect("nid");
                    assert!(doc.resolve_object_ref(nid).is_some());
                    assert!(replay_doc.resolve_object_ref(nid).is_some());
                }

                // Verify expected provenance
                let exp_prov = &vec["assertions"]["expectedProvenance"];
                if let Some(mf) = exp_prov["urn:formspec:node:replay-field-1"]["movedFrom"].as_object() {
                    let gen_meta = doc.get_generation("urn:formspec:node:replay-field-1").expect("gen");
                    let prov = gen_meta.moved_from.as_ref().expect("moved_from");
                    assert_eq!(prov.node_path, mf["nodePath"].as_str().unwrap());
                }
                if let Some(cf) = exp_prov["urn:formspec:node:replay-field-2"]["copiedFrom"].as_object() {
                    let gen_meta = doc.get_generation("urn:formspec:node:replay-field-2").expect("gen");
                    let prov = gen_meta.copied_from.as_ref().expect("copied_from");
                    assert_eq!(prov.node_path, cf["nodePath"].as_str().unwrap());
                }
            }
            "merge-stability" => {
                let mut base = KernelDocument::new(SubstrateArtifactType::Component);
                for op_val in vec["baseOps"].as_array().expect("baseOps") {
                    let op: SubstrateOp = serde_json::from_value(op_val.clone()).expect("parse");
                    base.apply_op(&op).expect("base op");
                }

                let mut branch_a = base.fork();
                branch_a.set_actor_id(automerge::ActorId::from("actor-branch-a".as_bytes()));
                for op_val in vec["branchAOps"].as_array().expect("branchAOps") {
                    let op: SubstrateOp = serde_json::from_value(op_val.clone()).expect("parse");
                    branch_a.apply_op(&op).expect("branch A op");
                }

                let mut branch_b = base.fork();
                branch_b.set_actor_id(automerge::ActorId::from("actor-branch-b".as_bytes()));
                for op_val in vec["branchBOps"].as_array().expect("branchBOps") {
                    let op: SubstrateOp = serde_json::from_value(op_val.clone()).expect("parse");
                    branch_b.apply_op(&op).expect("branch B op");
                }

                // Merge B into A
                branch_a.merge(&mut branch_b).expect("merge branches");

                let exp_nodes = vec["assertions"]["expectedNodes"].as_array().expect("exp_nodes");
                for n in exp_nodes {
                    let nid = n.as_str().expect("nid");
                    assert!(
                        branch_a.resolve_object_ref(nid).is_some(),
                        "merged document must contain node: {nid}"
                    );
                }

                let gen_meta = branch_a
                    .get_generation("urn:formspec:node:base-input")
                    .expect("gen for base-input");
                assert!(gen_meta.moved_from.is_some());
            }
            "export-import-stability" => {
                let mut doc = KernelDocument::new(SubstrateArtifactType::Component);
                for op_val in vec["ops"].as_array().expect("ops") {
                    let op: SubstrateOp = serde_json::from_value(op_val.clone()).expect("parse");
                    doc.apply_op(&op).expect("apply op");
                }

                let bytes = doc.save();
                let reloaded = KernelDocument::load(SubstrateArtifactType::Component, &bytes)
                    .expect("reload");

                let exp_nodes = vec["assertions"]["nodesPreserved"].as_array().expect("exp");
                for n in exp_nodes {
                    let nid = n.as_str().expect("nid");
                    let kor = doc.resolve_object_ref(nid).expect("orig kor");
                    let reloaded_kor = reloaded.resolve_object_ref(nid).expect("reloaded kor");
                    assert_eq!(kor, reloaded_kor, "KernelObjectRef must be stable across reload");
                }

                let reloaded_gen = reloaded
                    .get_generation("urn:formspec:node:persisted-copy")
                    .expect("reloaded gen");
                assert!(reloaded_gen.copied_from.is_some());
            }
            "cross-document-move-stability" => {
                let mut source = KernelDocument::new(SubstrateArtifactType::Component);
                let mut target = KernelDocument::new(SubstrateArtifactType::Component);

                for op_val in vec["sourceOps"].as_array().expect("sourceOps") {
                    let op: SubstrateOp = serde_json::from_value(op_val.clone()).expect("parse");
                    source.apply_op(&op).expect("source op");
                }

                let move_spec = &vec["moveOperation"];
                let node_id = move_spec["nodeId"].as_str().expect("nodeId");
                let target_parent = move_spec["targetParentRef"]
                    .as_str()
                    .map(ToString::to_string);
                let target_idx = move_spec["targetIndex"].as_u64().unwrap_or(0) as usize;
                let src_route = move_spec["sourceRoute"]
                    .as_str()
                    .map(ToString::to_string);

                let orig_kor = source.resolve_object_ref(node_id).expect("source kor");

                let new_kor = KernelDocument::cross_document_move(
                    &mut source,
                    &mut target,
                    node_id,
                    target_parent,
                    target_idx,
                    src_route,
                )
                .expect("cross_document_move");

                assert_ne!(orig_kor, new_kor);
                assert_eq!(target.resolve_node_id(&new_kor), Some(node_id));
                assert_eq!(source.resolve_object_ref(node_id), Some(orig_kor));
                assert!(source.registry().get_object_ref(node_id).is_none());

                let gen_meta = target.get_generation(node_id).expect("target gen");
                let mf = gen_meta.moved_from.as_ref().expect("moved_from in target");
                assert_eq!(mf.route.as_deref(), Some("step-1"));
            }
            "bundle-id-collision-rejection" => {
                let mut source = KernelDocument::new(SubstrateArtifactType::Component);
                let mut target = KernelDocument::new(SubstrateArtifactType::Component);

                for op_val in vec["sourceOps"].as_array().expect("sourceOps") {
                    let op: SubstrateOp = serde_json::from_value(op_val.clone()).expect("parse");
                    source.apply_op(&op).expect("source op");
                }
                for op_val in vec["targetOps"].as_array().expect("targetOps") {
                    let op: SubstrateOp = serde_json::from_value(op_val.clone()).expect("parse");
                    target.apply_op(&op).expect("target op");
                }

                let attempt = &vec["attemptedMove"];
                let colliding_id = attempt["nodeId"].as_str().expect("nodeId");

                let result = KernelDocument::cross_document_move(
                    &mut source,
                    &mut target,
                    colliding_id,
                    None,
                    0,
                    None,
                );

                match result {
                    Err(formspec_document_kernel::KernelError::BundleIdCollision(id)) => {
                        assert_eq!(id, colliding_id);
                    }
                    other => panic!("expected BundleIdCollision, got {:?}", other),
                }
            }
            other => panic!("unknown case: {other}"),
        }
    }
}

#[test]
fn test_schema_aware_convergence_shadow_gate_fel_rename() {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let fixture_path = format!("{}/../../tests/conformance/multi-actor/fel-rename-worked-example.case.json", manifest_dir);
    let content = std::fs::read_to_string(&fixture_path).expect("read fel-rename fixture");
    let fixture: serde_json::Value = serde_json::from_str(&content).expect("parse fel-rename fixture");

    let cases = fixture["cases"].as_array().expect("cases array");
    for case in cases {
        let name = case["name"].as_str().expect("case name");
        match name {
            "fel-rename-deterministic-repair" => {
                let mut doc = KernelDocument::new(SubstrateArtifactType::Definition);
                // Initial state has field 'email'
                doc.apply_op(&SubstrateOp::SetItemProperty {
                    path: "email".to_string(),
                    property: "label".to_string(),
                    value: json!("Email"),
                }).expect("init email field");

                let mut known_renames = HashMap::new();
                known_renames.insert("email".to_string(), "contactEmail".to_string());

                // Actor A renames email to contactEmail
                let mut ops = Vec::new();
                for op_val in case["actorA"]["ops"].as_array().expect("actorA ops") {
                    let op: SubstrateOp = serde_json::from_value(op_val.clone()).expect("parse op");
                    doc.apply_op(&op).expect("apply actorA op");
                    ops.push(op);
                }

                // Actor B binds $.email
                for op_val in case["actorB"]["ops"].as_array().expect("actorB ops") {
                    let op: SubstrateOp = serde_json::from_value(op_val.clone()).expect("parse op");
                    doc.apply_op(&op).expect("apply actorB op");
                    ops.push(op);
                }

                let report = validate_convergence(
                    &doc,
                    &ops,
                    case["actorB"]["id"].as_str().expect("actorB id"),
                    ActorClass::Mcp,
                    Some(ConvergenceMode::DeterministicRepair),
                    &known_renames,
                );

                match report.outcome {
                    ConvergenceOutcome::Repaired(reanchors) => {
                        assert!(!reanchors.is_empty(), "must record reanchors");
                        assert_eq!(
                            reanchors[0].rewrite,
                            case["expectedReanchoredRewrite"].as_str().expect("expectedReanchoredRewrite")
                        );
                    }
                    other => panic!("expected Repaired outcome, got {:?}", other),
                }
            }
            "fel-rename-deleted-mcp-rollback" => {
                let mut doc = KernelDocument::new(SubstrateArtifactType::Definition);
                let known_renames = HashMap::new(); // No rename mapping

                let mut ops = Vec::new();
                for op_val in case["actorA"]["ops"].as_array().expect("actorA ops") {
                    let op: SubstrateOp = serde_json::from_value(op_val.clone()).expect("parse op");
                    doc.apply_op(&op).expect("apply actorA op");
                    ops.push(op);
                }
                for op_val in case["actorB"]["ops"].as_array().expect("actorB ops") {
                    let op: SubstrateOp = serde_json::from_value(op_val.clone()).expect("parse op");
                    doc.apply_op(&op).expect("apply actorB op");
                    ops.push(op);
                }

                let report = validate_convergence(
                    &doc,
                    &ops,
                    case["actorB"]["id"].as_str().expect("actorB id"),
                    ActorClass::Mcp,
                    Some(ConvergenceMode::RejectAndRollback),
                    &known_renames,
                );

                match report.outcome {
                    ConvergenceOutcome::RolledBack(rb) => {
                        let expected_frag = case["expectedRollbackReasonContains"].as_str().expect("frag");
                        assert!(
                            rb.reason.contains(expected_frag),
                            "reason '{}' must contain '{}'",
                            rb.reason,
                            expected_frag
                        );
                    }
                    other => panic!("expected RolledBack outcome, got {:?}", other),
                }
            }
            "fel-rename-deleted-human-quarantine" => {
                let mut doc = KernelDocument::new(SubstrateArtifactType::Definition);
                let known_renames = HashMap::new();

                let mut ops = Vec::new();
                for op_val in case["actorA"]["ops"].as_array().expect("actorA ops") {
                    let op: SubstrateOp = serde_json::from_value(op_val.clone()).expect("parse op");
                    doc.apply_op(&op).expect("apply actorA op");
                    ops.push(op);
                }
                for op_val in case["actorB"]["ops"].as_array().expect("actorB ops") {
                    let op: SubstrateOp = serde_json::from_value(op_val.clone()).expect("parse op");
                    doc.apply_op(&op).expect("apply actorB op");
                    ops.push(op);
                }

                let report = validate_convergence(
                    &doc,
                    &ops,
                    case["actorB"]["id"].as_str().expect("actorB id"),
                    ActorClass::Human,
                    Some(ConvergenceMode::QuarantineAndSurface),
                    &known_renames,
                );

                match report.outcome {
                    ConvergenceOutcome::Quarantined(diags) => {
                        assert!(!diags.is_empty(), "must emit quarantine diagnostics");
                        let expected_frag = case["expectedDiagnosticReasonContains"].as_str().expect("frag");
                        assert!(
                            diags[0].reason.contains(expected_frag),
                            "diag '{}' must contain '{}'",
                            diags[0].reason,
                            expected_frag
                        );
                    }
                    other => panic!("expected Quarantined outcome, got {:?}", other),
                }
            }
            other => panic!("unknown case: {other}"),
        }
    }
}

#[test]
fn test_changeset_branch_manager_lifecycle() {
    let mut manager = ChangesetBranchManager::new();
    let mut manifest_doc = KernelDocument::new(SubstrateArtifactType::AppManifest);
    let mut def_doc = KernelDocument::new(SubstrateArtifactType::Definition);

    let session_urn = "urn:formspec:session:manifest-scope-1:ulid-99";
    let allowed_actor = "urn:formspec:actor:mcp:forms:session-01";
    let unauthorized_actor = "urn:formspec:actor:malicious:hacker";

    let mut artifact_docs = HashMap::new();
    artifact_docs.insert(SubstrateArtifactType::Definition, def_doc.fork());

    // 1. Posture admission rejection
    let denied = manager.open_changeset(
        &mut manifest_doc,
        session_urn,
        unauthorized_actor,
        ActorClass::Mcp,
        Some(ConvergenceMode::RejectAndRollback),
        Some(&[allowed_actor.to_string()]),
        &mut artifact_docs,
    );
    match denied {
        Err(KernelError::ActorAdmissionDenied { actor, .. }) => {
            assert_eq!(actor, unauthorized_actor);
        }
        other => panic!("expected ActorAdmissionDenied, got {:?}", other),
    }

    // 2. Successful branch open
    let branch_id = manager
        .open_changeset(
            &mut manifest_doc,
            session_urn,
            allowed_actor,
            ActorClass::Mcp,
            Some(ConvergenceMode::RejectAndRollback),
            Some(&[allowed_actor.to_string()]),
            &mut artifact_docs,
        )
        .expect("open_changeset should succeed");

    assert!(manager.is_branch_open(&branch_id));

    // Invariant check: App Manifest carries session URN in sessions[] before branch ops
    assert!(
        manifest_doc
            .raw_crdt_doc()
            .get(automerge::ROOT, "sessions")
            .unwrap()
            .is_some(),
        "manifest sessions[] list must exist"
    );

    // Invariant check: App Manifest carries NO streams[] field (ADR 0151 §4.2)
    assert!(
        !manifest_doc.has_root_key("streams"),
        "ADR 0151 invariant violation: App Manifest carries no streams[] field"
    );

    // 3. Dispatch op to branch
    manager
        .dispatch_op(
            &branch_id,
            SubstrateArtifactType::Definition,
            SubstrateOp::SetItemProperty {
                path: "customer.email".to_string(),
                property: "label".to_string(),
                value: json!("Email Address"),
            },
            Some(ActorId::from("actor-forms-mcp".as_bytes())),
        )
        .expect("dispatch_op should succeed");

    // 4. Preview impact
    let mut canonical_map = HashMap::new();
    canonical_map.insert(SubstrateArtifactType::Definition, def_doc.fork());
    let preview = manager
        .preview_impact(&branch_id, &canonical_map)
        .expect("preview_impact");

    assert_eq!(preview.op_count, 1);
    assert_eq!(preview.affected_artifacts, vec![SubstrateArtifactType::Definition]);
    assert_eq!(preview.affected_paths, vec!["customer.email".to_string()]);

    // 5. Accept changeset
    let mut canonical_docs = HashMap::new();
    canonical_docs.insert(SubstrateArtifactType::Definition, def_doc);
    let known_renames = HashMap::new();

    let batch = manager
        .accept_changeset(&branch_id, &mut canonical_docs, &known_renames)
        .expect("accept_changeset should succeed");

    assert_eq!(batch.session_ref, session_urn);
    assert_eq!(batch.actor, allowed_actor);
    assert_eq!(batch.semantic_ops.len(), 1);
    assert!(!batch.new_heads.is_empty());

    // Verify canonical definition doc received the edit
    let canonical_def = canonical_docs.get(&SubstrateArtifactType::Definition).unwrap();
    let prop = canonical_def
        .get_item_property("customer.email", "label")
        .expect("lookup");
    assert_eq!(prop, Some(json!("Email Address")));

    // Verify branch was discarded from memory
    assert!(!manager.is_branch_open(&branch_id));

    // 6. Test reject branch
    let mut second_docs = HashMap::new();
    let mut fresh_def = KernelDocument::new(SubstrateArtifactType::Definition);
    second_docs.insert(SubstrateArtifactType::Definition, fresh_def.fork());

    let branch_2 = manager
        .open_changeset(
            &mut manifest_doc,
            session_urn,
            allowed_actor,
            ActorClass::Mcp,
            Some(ConvergenceMode::RejectAndRollback),
            None,
            &mut second_docs,
        )
        .expect("open second branch");

    manager
        .dispatch_op(
            &branch_2,
            SubstrateArtifactType::Definition,
            SubstrateOp::SetItemProperty {
                path: "discarded.field".to_string(),
                property: "label".to_string(),
                value: json!("Discard Me"),
            },
            None,
        )
        .expect("dispatch to branch 2");

    let rollback = manager.reject_changeset(&branch_2).expect("reject_changeset");
    assert_eq!(rollback.actor, allowed_actor);
    assert_eq!(rollback.ops.len(), 1);
    assert!(!manager.is_branch_open(&branch_2));
}

#[test]
fn test_cross_mcp_coordination_and_conflict_gate() {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let fixture_path = format!("{}/../../tests/conformance/multi-actor/cross-mcp-conflicts.case.json", manifest_dir);
    let content = std::fs::read_to_string(&fixture_path).expect("read cross-mcp fixture");
    let fixture: serde_json::Value = serde_json::from_str(&content).expect("parse cross-mcp fixture");

    let scenarios = fixture["scenarios"].as_array().expect("scenarios");
    for sc in scenarios {
        let name = sc["name"].as_str().expect("scenario name");
        match name {
            "cross-mcp-concurrent-nonconflicting-edits" => {
                let mut manager = ChangesetBranchManager::new();
                let mut manifest = KernelDocument::new(SubstrateArtifactType::AppManifest);
                let mut def = KernelDocument::new(SubstrateArtifactType::Definition);
                let mut comp = KernelDocument::new(SubstrateArtifactType::Component);

                let session_id = "urn:formspec:session:manifest-scope-77:ulid-89";
                let forms_actor = sc["mcpForms"]["actorUrn"].as_str().unwrap();
                let wireframes_actor = sc["mcpWireframes"]["actorUrn"].as_str().unwrap();

                let mut forms_artifacts = HashMap::new();
                forms_artifacts.insert(SubstrateArtifactType::Definition, def.fork());
                forms_artifacts.insert(SubstrateArtifactType::Component, comp.fork());

                let mut wireframes_artifacts = HashMap::new();
                wireframes_artifacts.insert(SubstrateArtifactType::Definition, def.fork());
                wireframes_artifacts.insert(SubstrateArtifactType::Component, comp.fork());

                // Open Forms-MCP branch
                let forms_branch = manager
                    .open_changeset(
                        &mut manifest,
                        session_id,
                        forms_actor,
                        ActorClass::Mcp,
                        Some(ConvergenceMode::RejectAndRollback),
                        None,
                        &mut forms_artifacts,
                    )
                    .expect("open forms branch");

                // Open Wireframes-MCP branch
                let wireframes_branch = manager
                    .open_changeset(
                        &mut manifest,
                        session_id,
                        wireframes_actor,
                        ActorClass::Mcp,
                        Some(ConvergenceMode::RejectAndRollback),
                        None,
                        &mut wireframes_artifacts,
                    )
                    .expect("open wireframes branch");

                // Forms-MCP dispatches ops
                for op_val in sc["mcpForms"]["ops"].as_array().unwrap() {
                    let op: SubstrateOp = serde_json::from_value(op_val.clone()).unwrap();
                    manager
                        .dispatch_op(&forms_branch, SubstrateArtifactType::Definition, op, None)
                        .expect("forms op");
                }

                // Wireframes-MCP dispatches ops
                for op_val in sc["mcpWireframes"]["ops"].as_array().unwrap() {
                    let op: SubstrateOp = serde_json::from_value(op_val.clone()).unwrap();
                    manager
                        .dispatch_op(&wireframes_branch, SubstrateArtifactType::Component, op, None)
                        .expect("wireframes op");
                }

                // Merge both into canonical docs
                let mut canonical = HashMap::new();
                canonical.insert(SubstrateArtifactType::Definition, def);
                canonical.insert(SubstrateArtifactType::Component, comp);

                let known_renames = HashMap::new();
                let batch_1 = manager
                    .accept_changeset(&forms_branch, &mut canonical, &known_renames)
                    .expect("accept forms branch");
                let batch_2 = manager
                    .accept_changeset(&wireframes_branch, &mut canonical, &known_renames)
                    .expect("accept wireframes branch");

                assert_eq!(batch_1.actor, forms_actor);
                assert_eq!(batch_2.actor, wireframes_actor);

                // Both artifacts received the independent changes
                let merged_def = canonical.get(&SubstrateArtifactType::Definition).unwrap();
                let merged_comp = canonical.get(&SubstrateArtifactType::Component).unwrap();

                assert_eq!(
                    merged_def.get_item_property("householdSize", "type").unwrap(),
                    Some(json!("integer"))
                );
                assert!(merged_comp.registry().get_object_ref("urn:formspec:node:household-card").is_some());
            }
            "cross-mcp-bundle-id-collision" => {
                let colliding_id = sc["mcpForms"]["nodeId"].as_str().unwrap();
                let mut source = KernelDocument::new(SubstrateArtifactType::Component);
                let mut target = KernelDocument::new(SubstrateArtifactType::Component);

                source.apply_op(&SubstrateOp::AddComponentNode {
                    parent_ref: None,
                    node_id: colliding_id.to_string(),
                    node: json!({ "type": "Banner" }),
                }).expect("source banner");

                target.apply_op(&SubstrateOp::AddComponentNode {
                    parent_ref: None,
                    node_id: colliding_id.to_string(),
                    node: json!({ "type": "Banner" }),
                }).expect("target banner");

                let collision_res = KernelDocument::cross_document_move(
                    &mut source,
                    &mut target,
                    colliding_id,
                    None,
                    0,
                    None,
                );

                match collision_res {
                    Err(KernelError::BundleIdCollision(id)) => {
                        assert_eq!(id, colliding_id);
                    }
                    other => panic!("expected BundleIdCollision, got {:?}", other),
                }
            }
            other => panic!("unknown scenario: {other}"),
        }
    }
}

#[test]
fn test_trellis_binding_and_idempotency_parity() {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let parity_fixture_path = format!(
        "{}/../../tests/conformance/fixtures/studio-ledger-idempotency/cross-language-parity.case.json",
        manifest_dir
    );
    let content = std::fs::read_to_string(&parity_fixture_path).expect("read parity fixture");
    let fixture: serde_json::Value = serde_json::from_str(&content).expect("parse parity fixture");

    // 1. Verify byte parity for all test vectors in cross-language-parity.case.json
    for vec in fixture["vectors"].as_array().expect("vectors") {
        let case_name = vec["case"].as_str().unwrap();
        let ledger_scope = vec["ledgerScope"].as_str().unwrap();
        let branch_id = vec["branchId"].as_str().unwrap();
        let op_batch_hash = vec["opBatchHash"].as_str().unwrap();
        let expected_material = vec["expectedMaterial"].as_str().unwrap();
        let expected_key = vec["expectedIdempotencyKey"].as_str().unwrap();

        let actual_material = studio_ledger_idempotency_material(ledger_scope, branch_id, op_batch_hash);
        assert_eq!(
            actual_material, expected_material,
            "case '{}' material mismatch",
            case_name
        );

        let actual_key = studio_ledger_idempotency_key(ledger_scope, branch_id, op_batch_hash);
        assert_eq!(
            actual_key, expected_key,
            "case '{}' key mismatch",
            case_name
        );
    }

    // 2. Verify SessionOpBatch serialization to TrellisEventPayload
    let trellis_fixture_path = format!(
        "{}/../../tests/conformance/multi-actor/trellis-binding.case.json",
        manifest_dir
    );
    let trellis_content = std::fs::read_to_string(&trellis_fixture_path).expect("read trellis fixture");
    let trellis_fixture: serde_json::Value = serde_json::from_str(&trellis_content).expect("parse trellis fixture");

    let fix = &trellis_fixture["fixtures"][0];
    let session_ref = fix["sessionRef"].as_str().unwrap();
    let branch_id = fix["branchId"].as_str().unwrap();
    let actor = fix["actor"].as_str().unwrap();
    let prev_hash = fix["prevHash"].as_str().unwrap();

    let batch = SessionOpBatch {
        version: "1.0".to_string(),
        session_ref: session_ref.to_string(),
        branch_id: branch_id.to_string(),
        actor: actor.to_string(),
        artifact_refs: vec!["Definition".to_string()],
        previous_heads: vec!["hash1".to_string()],
        new_heads: vec!["hash2".to_string()],
        semantic_ops: vec![SubstrateOp::SetItemProperty {
            path: "income.annual".to_string(),
            property: "type".to_string(),
            value: json!("number"),
        }],
        change_hashes: vec!["change1".to_string()],
        change_blobs: None,
    };

    let payload = batch.to_trellis_event_payload(prev_hash);
    assert_eq!(payload.ledger_scope, session_ref);
    assert_eq!(payload.prev_hash, prev_hash);
    assert_eq!(payload.event_type, fix["expectedEventType"].as_str().unwrap());
    assert!(payload.idempotency_key.starts_with("sha256:"));
    assert_eq!(payload.idempotency_key.len(), 71); // "sha256:" + 64 hex
}


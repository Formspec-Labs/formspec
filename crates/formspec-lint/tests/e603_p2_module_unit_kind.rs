//! Integration test: an Experience document using a P2 module-contributed
//! UnitKind (e.g. `x-formspec-presentation-gallery`) is admitted by E603
//! when the document declares the contributing module.
//!
//! This is the end-to-end regression guard for the P2 boundary review's
//! BLOCKER B-1 finding: Registry entry names for module-contributed
//! ^x- doc-level values MUST EQUAL the doc-level value, no `-kind-` infix.

use serde_json::{Value, json};

#[test]
fn p2_presentation_gallery_kind_resolves_via_e603() {
    // Build a synthetic registry containing only the x-formspec-presentation
    // module + the gallery unit-kind contribution. Pin the entry name as
    // x-formspec-presentation-gallery (NOT x-formspec-presentation-kind-gallery)
    // so the admission set matches the doc-level value.
    let registry = json!({
        "$formspecRegistry": "1.0",
        "$schema": "https://formspec.org/schemas/registry/v1.0/registry.json",
        "publisher": { "name": "Test", "url": "https://test.org" },
        "published": "2026-05-24T00:00:00Z",
        "entries": [
            {
                "name": "x-formspec-presentation",
                "category": "module",
                "version": "0.1.0",
                "status": "stable",
                "description": "Test presentation module.",
                "compatibility": { "formspecVersion": ">=1.0.0 <2.0.0" },
                "contributes": ["x-formspec-presentation-gallery"]
            },
            {
                "name": "x-formspec-presentation-gallery",
                "category": "unit-kind",
                "version": "0.1.0",
                "status": "stable",
                "description": "Gallery non-form Experience UnitKind.",
                "compatibility": { "formspecVersion": ">=1.0.0 <2.0.0" },
                "semantics": { "kindValue": "gallery", "summary": "Gallery." }
            }
        ]
    });

    let experience: Value = json!({
        "$formspecExperience": "1.0",
        "version": "1.0.0",
        "targetDefinition": {
            "url": "https://example.org/forms/x.definition.json",
            "compatibleVersions": ">=1.0.0 <2.0.0"
        },
        "modules": [
            { "id": "x-formspec-presentation", "version": "^0.1.0" }
        ],
        "actors": [{ "id": "primary" }],
        "tasks":  [{ "id": "task1" }],
        "units":  [{
            "id": "u1",
            "kind": "x-formspec-presentation-gallery",
            "actorRef": "primary",
            "taskRefs": ["task1"]
        }]
    });

    let mut options = formspec_lint::LintOptions::default();
    options.registry_documents.push(registry);

    let result = formspec_lint::lint_with_options(&experience, &options);
    let e603s: Vec<_> = result
        .diagnostics
        .iter()
        .filter(|d| d.code.as_wire_str() == "E603")
        .collect();
    assert!(
        e603s.is_empty(),
        "P2 unit-kind value should resolve cleanly via E603; \
         got unexpected E603s: {e603s:?}\nfull diagnostics: {:?}",
        result.diagnostics
    );
}

#[test]
fn p2_presentation_gallery_kind_fails_e603_when_wrong_module_declared() {
    // Same registry, but the Experience document declares a DIFFERENT module
    // that doesn't contribute the gallery value. E603 SHOULD fire — the
    // declared module's `contributes[]` doesn't admit the doc-level value.
    //
    // (A document with no modules[] declaration at all is a separate edge
    // case — pass_modules currently short-circuits without admitting/
    // rejecting ^x- values; that's tracked as an independent finding, not
    // the BLOCKER B-1 scope.)
    let registry = json!({
        "$formspecRegistry": "1.0",
        "$schema": "https://formspec.org/schemas/registry/v1.0/registry.json",
        "publisher": { "name": "Test", "url": "https://test.org" },
        "published": "2026-05-24T00:00:00Z",
        "entries": [
            {
                "name": "x-formspec-presentation",
                "category": "module",
                "version": "0.1.0",
                "status": "stable",
                "description": "Test presentation module.",
                "compatibility": { "formspecVersion": ">=1.0.0 <2.0.0" },
                "contributes": ["x-formspec-presentation-gallery"]
            },
            {
                "name": "x-formspec-presentation-gallery",
                "category": "unit-kind",
                "version": "0.1.0",
                "status": "stable",
                "description": "Gallery non-form Experience UnitKind.",
                "compatibility": { "formspecVersion": ">=1.0.0 <2.0.0" },
                "semantics": { "kindValue": "gallery", "summary": "Gallery." }
            },
            {
                "name": "x-formspec-other",
                "category": "module",
                "version": "0.1.0",
                "status": "stable",
                "description": "Different module that does NOT contribute gallery.",
                "compatibility": { "formspecVersion": ">=1.0.0 <2.0.0" },
                "contributes": []
            }
        ]
    });

    let experience: Value = json!({
        "$formspecExperience": "1.0",
        "version": "1.0.0",
        "targetDefinition": {
            "url": "https://example.org/forms/x.definition.json",
            "compatibleVersions": ">=1.0.0 <2.0.0"
        },
        "modules": [
            { "id": "x-formspec-other", "version": "^0.1.0" }
        ],
        "actors": [{ "id": "primary" }],
        "tasks":  [{ "id": "task1" }],
        "units":  [{
            "id": "u1",
            "kind": "x-formspec-presentation-gallery",
            "actorRef": "primary",
            "taskRefs": ["task1"]
        }]
    });

    let mut options = formspec_lint::LintOptions::default();
    options.registry_documents.push(registry);

    let result = formspec_lint::lint_with_options(&experience, &options);
    let e603s: Vec<_> = result
        .diagnostics
        .iter()
        .filter(|d| d.code.as_wire_str() == "E603")
        .collect();
    assert!(
        !e603s.is_empty(),
        "Expected E603 when ^x- unit.kind is used but the declared module doesn't contribute it; \
         got no E603 in: {:?}",
        result.diagnostics
    );
}

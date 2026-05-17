//! Formspec Linter — 8-pass static analysis and validation pipeline.
//!
//! Pass 1 (E100): Document type detection
//! Pass 1b (E101): JSON Schema validation against embedded schemas
//! Pass 2 (E200/E201): Tree indexing, duplicate key/path detection
//! Pass 3 (E300/E301/E302/W300): Reference validation — bind paths, shape targets, optionSets
//! Pass 3b (E600/E601/E602): Extension resolution against registry documents
//! Pass 4 (E400): FEL expression compilation
//! Pass 5 (E500): Dependency cycle detection
//! Pass 6 (W700-W711/E710): Theme — token validation, reference integrity, page semantics
//! Pass 7 (E800-E807/W800-W804): Components — tree validation, type compatibility, bind resolution
//! Pass 8 (E900-E902): Response — cross-field signed-payload pin invariants
//!
//! ## Documentation
//!
//! - Human overview: crate `README.md` (pass map, options, module layout).
//! - API reference: `cargo doc -p formspec-lint --no-deps --open`.
//! - Markdown API export: `docs/rustdoc-md/API.md` (see README; regenerate with `npm run docs:formspec-lint`).
#![warn(missing_docs)]
#![warn(clippy::missing_docs_in_private_items)]

mod lint_json;
mod metadata;
mod schema_validation;
mod types;

pub mod component_matrix;
pub mod dependencies;
pub mod expressions;
pub mod extensions;
pub mod pass_component;
pub mod pass_response;
pub mod pass_theme;
pub mod references;
pub mod tree;

use serde_json::Value;

use formspec_core::{DocumentType, detect_document_type};

// Re-export public types
pub use lint_json::lint_result_to_json_value;
pub use types::{
    LintDiagnostic, LintMode, LintOptions, LintResult, LintSeverity, sort_diagnostics,
};

// ── Lint pipeline ───────────────────────────────────────────────

/// Run the full lint pipeline on a Formspec document with default options.
pub fn lint(doc: &Value) -> LintResult {
    lint_with_options(doc, &LintOptions::default())
}

/// Run the full lint pipeline with explicit options.
pub fn lint_with_options(doc: &Value, options: &LintOptions) -> LintResult {
    let mut diagnostics = Vec::new();

    // ── Pass 1: Document type detection ─────────────────────────
    let doc_type = detect_document_type(doc);

    if doc_type.is_none() {
        diagnostics.push(crate::metadata::with_metadata(LintDiagnostic::error(
            "E100",
            1,
            "$",
            "Cannot determine document type",
        )));
        return LintResult {
            document_type: None,
            diagnostics,
            valid: false,
        };
    }

    let doc_type = doc_type.unwrap();

    // ── Pass 1b: Schema validation (E101) ────────────────────────
    diagnostics.extend(schema_validation::validate_schema(doc, doc_type));

    // ── schema_only: return after pass 1 + 1b ───────────────────
    if options.schema_only {
        sort_diagnostics(&mut diagnostics);
        diagnostics.retain(|d| !d.suppressed_in(options.mode));
        let valid = diagnostics
            .iter()
            .all(|d| d.severity != LintSeverity::Error);
        return LintResult {
            document_type: Some(doc_type),
            diagnostics,
            valid,
        };
    }

    // ── Definition passes (2–5) ─────────────────────────────────
    if doc_type == DocumentType::Definition {
        // Pass 2: Tree indexing (E200/E201)
        let mut tree_index = tree::build_item_index(doc);
        diagnostics.append(&mut tree_index.diagnostics);

        // Pass gating: stop if structural errors exist from pass 2
        // (skip E101 schema errors from pass 1b — they don't indicate broken structure)
        if diagnostics
            .iter()
            .any(|d| d.severity == LintSeverity::Error && d.pass >= 2)
        {
            sort_diagnostics(&mut diagnostics);
            diagnostics.retain(|d| !d.suppressed_in(options.mode));
            return LintResult {
                document_type: Some(doc_type),
                diagnostics,
                valid: false,
            };
        }

        // Pass 3: Reference validation (E300/E301/E302/W300)
        diagnostics.extend(references::check_references(doc, &tree_index));

        // Pass 3b: Extension resolution (E600/E601/E602)
        diagnostics.extend(extensions::check_extensions(
            doc,
            &options.registry_documents,
        ));

        // Pass 4: Expression compilation (E400)
        // Pass 5: Dependency cycle detection (E500)
        if !options.no_fel {
            let compilation = expressions::compile_expressions(doc);
            diagnostics.extend(compilation.diagnostics);
            diagnostics.extend(dependencies::analyze_dependencies(&compilation.compiled));
        }
    }

    // ── Screener passes ────────────────────────────────────────
    if doc_type == DocumentType::Screener && !options.no_fel {
        let compilation = expressions::compile_screener_expressions(doc);
        diagnostics.extend(compilation.diagnostics);
        diagnostics.extend(dependencies::analyze_dependencies(&compilation.compiled));
    }

    // ── Theme pass (6) ──────────────────────────────────────────
    if doc_type == DocumentType::Theme {
        diagnostics.extend(pass_theme::lint_theme(
            doc,
            options.definition_document.as_ref(),
        ));
    }

    // ── Component pass (7) ──────────────────────────────────────
    if doc_type == DocumentType::Component {
        diagnostics.extend(pass_component::lint_component(
            doc,
            options.definition_document.as_ref(),
        ));
    }

    // ── Response pass (8) ───────────────────────────────────────
    if doc_type == DocumentType::Response {
        diagnostics.extend(pass_response::lint_response(doc));
    }

    // Sort and filter
    sort_diagnostics(&mut diagnostics);

    // Strict mode: promote component compatibility warnings to errors
    if options.mode == LintMode::Strict {
        for d in &mut diagnostics {
            if matches!(d.code.as_str(), "W800" | "W802" | "W803" | "W804") {
                d.severity = LintSeverity::Error;
            }
        }
    }

    diagnostics.retain(|d| !d.suppressed_in(options.mode));

    let valid = diagnostics
        .iter()
        .all(|d| d.severity != LintSeverity::Error);
    LintResult {
        document_type: Some(doc_type),
        diagnostics,
        valid,
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;
    use serde_json::json;

    // ── Integration tests ──────────────────────────────────────────
    //
    // These tests exercise the full `lint()` / `lint_with_options()` pipeline.
    // Each one verifies cross-pass behaviour that module-level unit tests
    // cannot: document-type routing, pass gating, diagnostic sorting/filtering,
    // lint-mode suppression, and multi-pass diagnostic merging.
    //
    // Single-pass behaviour (E302, W300, E301, wildcard binds, extension
    // details) is tested exhaustively in the per-module tests. Duplicating
    // those here would add maintenance cost without additional confidence.
    //
    // All definition fixtures use schema-valid format: binds as array with
    // `path`, items with `type`+`label`, shapes with `id`+`message`.

    // Shared schema-required fields for definition fixtures.
    const DEF_URL: &str = "https://example.com/forms/test";
    const DEF_VER: &str = "1.0.0";

    /// Spec: spec.md §2.1 — "$formspec" key identifies a valid definition document
    #[test]
    fn valid_definition_passes_all_passes() {
        let def = json!({
            "$formspec": "1.0",
            "url": DEF_URL, "version": DEF_VER, "status": "draft", "title": "T",
            "items": [{ "key": "name", "type": "field", "label": "Name", "dataType": "string" }],
            "binds": [{ "path": "name", "required": "true" }]
        });
        let result = lint(&def);
        assert!(
            result.valid,
            "got: {:?}",
            result
                .diagnostics
                .iter()
                .map(|d| (&d.code, &d.message))
                .collect::<Vec<_>>()
        );
        assert_eq!(result.document_type, Some(DocumentType::Definition));
    }

    /// Spec: spec.md §2.1 — unrecognized document types emit E100 and halt
    #[test]
    fn unknown_document_emits_e100_and_halts() {
        let doc = json!({ "random": "data" });
        let result = lint(&doc);
        assert!(!result.valid);
        assert!(result.diagnostics.iter().any(|d| d.code == "E100"));
        assert_eq!(result.diagnostics.len(), 1, "Should halt after E100");
    }

    /// Spec: spec.md §7.2 — structural errors in pass 2 prevent passes 3-5
    #[test]
    fn pass_gating_stops_on_structural_errors() {
        let def = json!({
            "$formspec": "1.0",
            "url": DEF_URL, "version": DEF_VER, "status": "draft", "title": "T",
            "items": [
                { "key": "name", "type": "field", "label": "N" },
                { "key": "name", "type": "field", "label": "N" }
            ],
            "binds": [
                { "path": "nonexistent", "required": "true" },
                { "path": "name", "calculate": "invalid ++" }
            ]
        });
        let result = lint(&def);
        assert!(result.diagnostics.iter().any(|d| d.code == "E201"));
        assert_eq!(
            result.diagnostics.iter().filter(|d| d.pass >= 3).count(),
            0,
            "No diagnostics from pass 3+ when pass 2 has structural errors"
        );
    }

    /// Spec: spec.md §7 — diagnostics sorted by (pass, severity, path)
    #[test]
    fn diagnostic_sorting_uses_lexicographic_tuple() {
        let def = json!({
            "$formspec": "1.0",
            "url": DEF_URL, "version": DEF_VER, "status": "draft", "title": "T",
            "items": [
                { "key": "name", "type": "field", "label": "N", "dataType": "string" },
                { "key": "color", "type": "field", "label": "C", "dataType": "boolean", "optionSet": "missing_set" }
            ],
            "binds": [{ "path": "name", "calculate": "invalid ++" }]
        });
        let result = lint(&def);
        assert!(result.diagnostics.len() >= 2);
        for window in result.diagnostics.windows(2) {
            let (a, b) = (&window[0], &window[1]);
            assert!(
                (a.pass, a.severity, &a.path) <= (b.pass, b.severity, &b.path),
                "Diagnostics not sorted: ({}, {:?}, {}) should come before ({}, {:?}, {})",
                a.pass,
                a.severity,
                a.path,
                b.pass,
                b.severity,
                b.path,
            );
        }
    }

    /// Spec: spec.md §7 — LintMode::Authoring suppresses W300 and W802
    #[test]
    fn lint_mode_authoring_suppresses_w300() {
        let def = json!({
            "$formspec": "1.0",
            "url": DEF_URL, "version": DEF_VER, "status": "draft", "title": "T",
            "items": [{ "key": "f", "type": "field", "label": "F", "dataType": "boolean", "optionSet": "opts" }],
            "optionSets": { "opts": { "options": [{ "value": "yes" }] } }
        });
        let rt = lint_with_options(
            &def,
            &LintOptions {
                mode: LintMode::Runtime,
                ..Default::default()
            },
        );
        assert_eq!(
            rt.diagnostics.iter().filter(|d| d.code == "W300").count(),
            1
        );
        let auth = lint_with_options(
            &def,
            &LintOptions {
                mode: LintMode::Authoring,
                ..Default::default()
            },
        );
        assert_eq!(
            auth.diagnostics.iter().filter(|d| d.code == "W300").count(),
            0
        );
    }

    /// Spec: spec.md §9 — screener integration spans passes 3+4
    #[test]
    fn screener_integration_spans_passes() {
        let def = json!({
            "$formspec": "1.0",
            "url": DEF_URL, "version": DEF_VER, "status": "draft", "title": "T",
            "items": [{ "key": "age", "type": "field", "label": "Age", "dataType": "integer" }],
            "screener": {
                "items": [{ "key": "age", "type": "field", "label": "Age", "dataType": "integer" }],
                "routes": [
                    { "condition": "$age >= 18", "target": "adult" },
                    { "condition": "invalid ++ expr", "target": "error" }
                ]
            }
        });
        let result = lint(&def);
        let e400 = result
            .diagnostics
            .iter()
            .filter(|d| d.code == "E400" && d.path.contains("screener"))
            .collect::<Vec<_>>();
        assert_eq!(e400.len(), 1);
        assert!(e400[0].path.contains("routes[1]"));
    }

    /// Spec: extension-registry.md §3 — extension resolution via registry documents
    #[test]
    fn extension_resolution_cross_pass_integration() {
        let def = json!({
            "$formspec": "1.0",
            "url": DEF_URL, "version": DEF_VER, "status": "draft", "title": "T",
            "items": [
                { "key": "age", "type": "field", "label": "Age", "dataType": "integer" }
            ],
            "screener": {
                "items": [{ "key": "screening_age", "type": "field", "label": "Age", "dataType": "integer" }],
                "routes": [
                    { "condition": "$age >= 18", "target": "adult" }
                ]
            }
        });
        let result = lint(&def);
        let screener_errors = result
            .diagnostics
            .iter()
            .filter(|d| d.path.contains("screener") && d.code != "E101")
            .count();
        assert_eq!(
            screener_errors, 0,
            "Valid screener expressions should not produce errors"
        );
    }

    #[test]
    fn test_diagnostic_sorting() {
        let def = json!({
            "$formspec": "1.0",
            "url": DEF_URL, "version": DEF_VER, "status": "draft", "title": "T",
            "items": [
                { "key": "name", "type": "field", "label": "N", "dataType": "string" },
                { "key": "color", "type": "field", "label": "C", "dataType": "boolean", "optionSet": "missing_set" }
            ],
            "binds": [{ "path": "name", "calculate": "invalid ++" }]
        });
        let result = lint(&def);
        assert!(
            result.diagnostics.len() >= 2,
            "Should have multiple diagnostics"
        );

        for window in result.diagnostics.windows(2) {
            let a = &window[0];
            let b = &window[1];
            assert!(
                a.pass < b.pass
                    || (a.pass == b.pass && a.severity <= b.severity)
                    || (a.pass == b.pass && a.severity == b.severity && a.path <= b.path),
                "Diagnostics not sorted: ({}, {:?}, {}) should come before ({}, {:?}, {})",
                a.pass,
                a.severity,
                a.path,
                b.pass,
                b.severity,
                b.path,
            );
        }
    }

    #[test]
    fn test_pass_gating_on_structural_errors() {
        let def = json!({
            "$formspec": "1.0",
            "url": DEF_URL, "version": DEF_VER, "status": "draft", "title": "T",
            "items": [
                { "key": "name", "type": "field", "label": "N" },
                { "key": "name", "type": "field", "label": "N" }
            ],
            "binds": [
                { "path": "nonexistent", "required": "true" },
                { "path": "name", "calculate": "invalid ++" }
            ]
        });
        let result = lint(&def);

        assert!(
            result.diagnostics.iter().any(|d| d.code == "E201"),
            "E201 should be present"
        );
        assert!(
            !result.valid,
            "Document with structural errors should be invalid"
        );

        let pass3_plus = result.diagnostics.iter().filter(|d| d.pass >= 3).count();
        assert_eq!(
            pass3_plus, 0,
            "No diagnostics from pass 3+ should exist when pass 2 has structural errors"
        );
    }

    #[test]
    fn test_lint_mode_authoring_suppresses_w300() {
        let def = json!({
            "$formspec": "1.0",
            "url": DEF_URL, "version": DEF_VER, "status": "draft", "title": "T",
            "items": [
                { "key": "field1", "type": "field", "label": "F1", "dataType": "boolean", "optionSet": "opts" }
            ],
            "optionSets": {
                "opts": { "options": [{ "value": "yes" }] }
            }
        });

        let runtime_result = lint_with_options(
            &def,
            &LintOptions {
                mode: LintMode::Runtime,
                ..Default::default()
            },
        );
        let w300_runtime = runtime_result
            .diagnostics
            .iter()
            .filter(|d| d.code == "W300")
            .count();
        assert_eq!(w300_runtime, 1, "Runtime mode should emit W300");

        let authoring_result = lint_with_options(
            &def,
            &LintOptions {
                mode: LintMode::Authoring,
                ..Default::default()
            },
        );
        let w300_authoring = authoring_result
            .diagnostics
            .iter()
            .filter(|d| d.code == "W300")
            .count();
        assert_eq!(w300_authoring, 0, "Authoring mode should suppress W300");
    }

    #[test]
    fn test_e600_extension_resolution() {
        let def = json!({
            "$formspec": "1.0",
            "url": DEF_URL, "version": DEF_VER, "status": "draft", "title": "T",
            "items": [
                {
                    "key": "email", "type": "field", "label": "Email",
                    "dataType": "string",
                    "extensions": {
                        "x-formspec-url": true,
                        "x-unknown-ext": true
                    }
                }
            ]
        });
        let registry = json!({ "entries": [{ "name": "x-formspec-url", "status": "active" }] });
        let result = lint_with_options(
            &def,
            &LintOptions {
                registry_documents: vec![registry],
                ..Default::default()
            },
        );
        let e600 = result
            .diagnostics
            .iter()
            .filter(|d| d.code == "E600")
            .collect::<Vec<_>>();
        assert_eq!(e600.len(), 1);
        assert!(e600[0].message.contains("x-unknown-ext"));
    }

    /// No registries → every enabled extension emits E600.
    #[test]
    fn no_registries_emits_e600() {
        let def = json!({
            "$formspec": "1.0",
            "url": DEF_URL, "version": DEF_VER, "status": "draft", "title": "T",
            "items": [{ "key": "e", "type": "field", "label": "E", "extensions": { "x-formspec-url": true } }]
        });
        let result = lint(&def);
        assert_eq!(
            result
                .diagnostics
                .iter()
                .filter(|d| d.code == "E600")
                .count(),
            1,
            "Should emit E600 for enabled extension with no registries"
        );
    }

    /// Spec: theme-spec.md §1 — "$formspecTheme" routes to pass 6
    #[test]
    fn theme_document_routes_to_pass_6() {
        let theme = json!({
            "$formspecTheme": "1.0",
            "version": "1.0.0",
            "targetDefinition": { "url": DEF_URL },
            "tokens": { "color.primary": "#000" },
            "selectors": [{
                "match": "*",
                "properties": { "color": "$token.color.primary", "bg": "$token.missing" }
            }]
        });
        let result = lint(&theme);
        assert_eq!(result.document_type, Some(DocumentType::Theme));
        assert!(result.diagnostics.iter().any(|d| d.code == "W704"));
        // Expect W704 (missing token ref), W708/W709 (registry checks), plus E101 from schema
        // Filter to only W704 — the core check this test validates
        let w704_count = result
            .diagnostics
            .iter()
            .filter(|d| d.code == "W704")
            .count();
        assert_eq!(
            w704_count,
            1,
            "Exactly one W704 expected, got: {:?}",
            result
                .diagnostics
                .iter()
                .filter(|d| d.code == "W704")
                .map(|d| (&d.code, &d.message))
                .collect::<Vec<_>>()
        );
    }

    /// Spec: component-spec.md §4.6 — W802 (compatible-with-warning) is suppressed
    /// in Authoring mode but present in Runtime mode.
    #[test]
    fn test_w802_authoring_mode_suppression() {
        let comp = json!({
            "$formspecComponent": "1.0",
            "version": "1.0.0",
            "targetDefinition": { "url": DEF_URL },
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "TextInput", "bind": "age" }
                ]
            }
        });
        let def = json!({
            "$formspec": "1.0",
            "url": DEF_URL, "version": DEF_VER, "status": "draft", "title": "T",
            "items": [{ "key": "age", "type": "field", "label": "Age", "dataType": "integer" }]
        });

        let runtime_result = lint_with_options(
            &comp,
            &LintOptions {
                mode: LintMode::Runtime,
                definition_document: Some(def.clone()),
                ..Default::default()
            },
        );
        assert_eq!(
            runtime_result
                .diagnostics
                .iter()
                .filter(|d| d.code == "W802")
                .count(),
            1,
            "Runtime mode should emit W802"
        );

        let authoring_result = lint_with_options(
            &comp,
            &LintOptions {
                mode: LintMode::Authoring,
                definition_document: Some(def),
                ..Default::default()
            },
        );
        assert_eq!(
            authoring_result
                .diagnostics
                .iter()
                .filter(|d| d.code == "W802")
                .count(),
            0,
            "Authoring mode should suppress W802"
        );
    }

    #[test]
    fn component_document_routes_to_pass_7() {
        let comp = json!({
            "$formspecComponent": "1.0",
            "version": "1.0.0",
            "targetDefinition": { "url": DEF_URL },
            "tree": { "children": [] }
        });
        let result = lint(&comp);
        assert_eq!(result.document_type, Some(DocumentType::Component));
        assert!(result.diagnostics.iter().any(|d| d.code == "E800"));
    }

    /// Cross-pass integration: definition with errors across passes 3, 4, and 5.
    #[test]
    fn multi_pass_definition_collects_all_diagnostics() {
        let def = json!({
            "$formspec": "1.0",
            "url": DEF_URL, "version": DEF_VER, "status": "draft", "title": "T",
            "items": [
                { "key": "a", "type": "field", "label": "A" },
                { "key": "b", "type": "field", "label": "B" }
            ],
            "binds": [
                { "path": "ghost", "required": "true" },
                { "path": "a", "calculate": "$b + 1" },
                { "path": "b", "calculate": "$a + 1" }
            ],
            "shapes": [{ "id": "s1", "target": "phantom", "message": "bad", "constraint": "true" }]
        });
        let result = lint(&def);
        assert!(
            result.diagnostics.iter().any(|d| d.code == "E300"),
            "Should have E300"
        );
        assert!(
            result.diagnostics.iter().any(|d| d.code == "E301"),
            "Should have E301"
        );
        assert!(
            result.diagnostics.iter().any(|d| d.code == "E500"),
            "Should have E500"
        );
        let passes: Vec<u8> = result.diagnostics.iter().map(|d| d.pass).collect();
        for w in passes.windows(2) {
            assert!(w[0] <= w[1], "Passes should be non-decreasing");
        }
    }

    // ── schema_only: returns after pass 1 + 1b ──────────────────

    /// schema_only returns document type and schema diagnostics only.
    #[test]
    fn schema_only_skips_all_semantic_passes() {
        let def = json!({
            "$formspec": "1.0",
            "url": DEF_URL, "version": DEF_VER, "status": "draft", "title": "T",
            "items": [
                { "key": "a", "type": "field", "label": "A", "dataType": "string" },
                { "key": "b", "type": "field", "label": "B", "dataType": "string" }
            ],
            "binds": [
                { "path": "ghost", "required": "true" },
                { "path": "a", "calculate": "invalid ++" }
            ]
        });
        let result = lint_with_options(
            &def,
            &LintOptions {
                schema_only: true,
                ..Default::default()
            },
        );
        assert_eq!(result.document_type, Some(DocumentType::Definition));
        assert!(
            result.diagnostics.is_empty(),
            "schema_only should produce no diagnostics for a schema-valid document, got: {:?}",
            result
                .diagnostics
                .iter()
                .map(|d| (&d.code, &d.message))
                .collect::<Vec<_>>()
        );
        assert!(result.valid);
    }

    /// schema_only still reports E100 for unrecognized documents.
    #[test]
    fn schema_only_still_reports_e100() {
        let doc = json!({ "random": "data" });
        let result = lint_with_options(
            &doc,
            &LintOptions {
                schema_only: true,
                ..Default::default()
            },
        );
        assert!(!result.valid);
        assert!(result.diagnostics.iter().any(|d| d.code == "E100"));
    }

    // ── no_fel: skips passes 4 and 5 ────────────────────────────

    /// no_fel skips expression compilation (pass 4) and dependency detection (pass 5).
    #[test]
    fn no_fel_skips_expression_and_dependency_passes() {
        let def = json!({
            "$formspec": "1.0",
            "url": DEF_URL, "version": DEF_VER, "status": "draft", "title": "T",
            "items": [
                { "key": "a", "type": "field", "label": "A" },
                { "key": "b", "type": "field", "label": "B" }
            ],
            "binds": [
                { "path": "a", "calculate": "invalid ++" },
                { "path": "b", "calculate": "$a + 1" }
            ]
        });
        let full_result = lint(&def);
        assert!(
            full_result.diagnostics.iter().any(|d| d.code == "E400"),
            "Full lint should report E400"
        );

        let result = lint_with_options(
            &def,
            &LintOptions {
                no_fel: true,
                ..Default::default()
            },
        );
        assert!(
            !result.diagnostics.iter().any(|d| d.code == "E400"),
            "no_fel should skip E400"
        );
        assert!(
            !result.diagnostics.iter().any(|d| d.code == "E500"),
            "no_fel should skip E500"
        );
    }

    /// no_fel still runs passes 2 and 3 (tree indexing and references).
    #[test]
    fn no_fel_still_runs_reference_checks() {
        let def = json!({
            "$formspec": "1.0",
            "url": DEF_URL, "version": DEF_VER, "status": "draft", "title": "T",
            "items": [{ "key": "name", "type": "field", "label": "N" }],
            "binds": [{ "path": "ghost", "required": "true" }]
        });
        let result = lint_with_options(
            &def,
            &LintOptions {
                no_fel: true,
                ..Default::default()
            },
        );
        assert!(
            result.diagnostics.iter().any(|d| d.code == "E300"),
            "no_fel should still run pass 3 reference checks"
        );
    }

    // ── Strict mode: promotes component warnings to errors ──────

    /// Strict mode promotes W800/W802/W803/W804 to errors.
    #[test]
    fn strict_mode_promotes_component_warnings_to_errors() {
        let comp = json!({
            "$formspecComponent": "1.0",
            "version": "1.0.0",
            "targetDefinition": { "url": DEF_URL },
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "TextInput", "bind": "age" }
                ]
            }
        });
        let def = json!({
            "$formspec": "1.0",
            "url": DEF_URL, "version": DEF_VER, "status": "draft", "title": "T",
            "items": [{ "key": "age", "type": "field", "label": "Age", "dataType": "integer" }]
        });
        let result = lint_with_options(
            &comp,
            &LintOptions {
                mode: LintMode::Strict,
                definition_document: Some(def),
                ..Default::default()
            },
        );
        let w802 = result
            .diagnostics
            .iter()
            .filter(|d| d.code == "W802")
            .collect::<Vec<_>>();
        assert_eq!(w802.len(), 1);
        assert_eq!(
            w802[0].severity,
            LintSeverity::Error,
            "Strict mode should promote W802 to Error"
        );
        assert!(
            !result.valid,
            "Document with promoted error should be invalid"
        );
    }

    // ── E600: no-registry emits E600 for every enabled extension ──

    /// When no registries are loaded, every enabled extension is unresolved.
    #[test]
    fn no_registries_emits_e600_for_all_enabled_extensions() {
        let def = json!({
            "$formspec": "1.0",
            "url": DEF_URL, "version": DEF_VER, "status": "draft", "title": "T",
            "items": [
                { "key": "a", "type": "field", "label": "A", "extensions": { "x-foo": true, "x-bar": false } },
                { "key": "b", "type": "field", "label": "B", "extensions": { "x-baz": { "opt": 1 } } }
            ]
        });
        let result = lint(&def);
        let e600: Vec<_> = result
            .diagnostics
            .iter()
            .filter(|d| d.code == "E600")
            .collect();
        assert_eq!(
            e600.len(),
            2,
            "Should emit E600 for x-foo and x-baz (x-bar is disabled), got: {:?}",
            e600.iter().map(|d| &d.message).collect::<Vec<_>>()
        );
    }

    // ── E101: Schema validation ──────────────────────────────────

    /// Schema validation detects invalid enum values like "blob" for dataType.
    #[test]
    fn schema_validation_detects_invalid_data_type() {
        let def = json!({
            "$formspec": "1.0",
            "url": "https://example.com/forms/x",
            "version": "1.0.0",
            "status": "draft",
            "title": "X",
            "items": [{"key": "f1", "type": "field", "label": "F1", "dataType": "blob"}]
        });
        let result = lint(&def);
        assert!(
            result.diagnostics.iter().any(|d| d.code == "E101"),
            "Should emit E101 for invalid dataType 'blob', got: {:?}",
            result
                .diagnostics
                .iter()
                .map(|d| (&d.code, &d.message))
                .collect::<Vec<_>>()
        );
    }

    /// A fully valid definition should not produce E101 diagnostics.
    #[test]
    fn schema_validation_passes_valid_definition() {
        let def = json!({
            "$formspec": "1.0",
            "url": "https://example.com/forms/x",
            "version": "1.0.0",
            "status": "draft",
            "title": "X",
            "items": [{"key": "f1", "type": "field", "label": "F1", "dataType": "string"}]
        });
        let result = lint(&def);
        assert!(
            !result.diagnostics.iter().any(|d| d.code == "E101"),
            "Valid definition should not produce E101, got: {:?}",
            result
                .diagnostics
                .iter()
                .map(|d| (&d.code, &d.message))
                .collect::<Vec<_>>()
        );
    }

    // ── Response pass (8): signed-payload pin invariants ────────

    /// Spec: core/spec.md §2.1.6 — `signedPayload.responseId` MUST equal top-level `id`.
    /// `lint(resp)` must reject the pin-mismatch case so Rust + Python verifier agree.
    #[test]
    fn response_pin_mismatch_emits_e900() {
        let resp = json!({
            "$formspecResponse": "1.0",
            "definitionUrl": "https://example.org/forms/x",
            "definitionVersion": "1.0.0",
            "id": "resp-1",
            "status": "completed",
            "data": {},
            "authored": "2026-04-22T12:00:00Z",
            "authoredSignatures": [{
                "signatureId": "sig-1",
                "documentId": "d",
                "signingIntent": "urn:x:y:z",
                "signatureValue": "AA==",
                "signedPayload": {
                    "canonicalization": "formspec-response-signing-v1",
                    "digestAlgorithm": "sha-256",
                    "digest": "0".repeat(64),
                    "responseId": "resp-OTHER",
                    "definitionUrl": "https://example.org/forms/x",
                    "definitionVersion": "1.0.0",
                    "signedAt": "2026-04-22T12:00:00Z",
                    "signingIntent": "urn:x:y:z",
                }
            }]
        });
        let result = lint(&resp);
        assert_eq!(result.document_type, Some(DocumentType::Response));
        assert!(
            result.diagnostics.iter().any(|d| d.code == "E900"),
            "lint MUST reject pin-mismatch — got codes: {:?}",
            result
                .diagnostics
                .iter()
                .map(|d| &d.code)
                .collect::<Vec<_>>()
        );
        assert!(!result.valid);
    }

    /// E101 path should point to the specific location of the error.
    #[test]
    fn schema_validation_reports_correct_path() {
        let def = json!({
            "$formspec": "1.0",
            "url": "https://example.com/forms/x",
            "version": "1.0.0",
            "status": "draft",
            "title": "X",
            "items": [{"key": "f1", "type": "field", "label": "F1", "dataType": "blob"}]
        });
        let result = lint(&def);
        let e101: Vec<_> = result
            .diagnostics
            .iter()
            .filter(|d| d.code == "E101")
            .collect();
        assert!(!e101.is_empty());
        // The path should reference items[0].dataType
        assert!(
            e101.iter()
                .any(|d| d.path.contains("items") && d.path.contains("dataType")),
            "E101 path should reference the dataType location, got paths: {:?}",
            e101.iter().map(|d| &d.path).collect::<Vec<_>>()
        );
    }
}

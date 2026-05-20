# formspec-lint

Rust **static analysis** for Formspec JSON documents — a nine-pass pipeline over `serde_json::Value` that mirrors the conceptual checks described in repo `specs/` and `schemas/`. Built on [`formspec-core`](../formspec-core/) (document detection, item walks, registry types) and [`fel-core`](../fel-core/) (FEL parsing/dependencies).

## Scope

| Pass | Codes (examples) | Module | Role |
|------|------------------|--------|------|
| 1 | E100 | `lib` | Document type detection (`formspec_core::detect_document_type`). |
| 1b | E101 | `schema_validation` | JSON Schema validation (embedded `schemas/*.schema.json`; component trees validated per-node). |
| 2 | E200, E201 | `tree` | Item tree index: duplicate keys/paths, repeatables. |
| 3 | E300–E302, W300 | `references` | Binds, shape targets, option sets vs. item index. |
| 3b | E600–E602 | `extensions` | Extension keys vs. registry JSON documents. |
| 4 | E400 | `expressions` | Parse every FEL slot (binds, shapes, variables, screener). |
| 5 | E500 | `dependencies` | Bind-key dependency graph and cycles (`fel_core` / core FEL deps). |
| 6 | W700–W711, E710 | `pass_theme` | Theme tokens, refs, pages, cross-definition checks when paired. |
| 7 | E800–E807, W800–W804 | `pass_component` | Component tree, builtins, binds, compatibility matrix. |
| 8 | E900–E902 | `pass_response` | Response signed-payload pin invariants. |
| 9 | E1100–E1507, W1100–W1500 | `pass_mapping`, `pass_ontology`, `pass_references_doc`, `pass_locale`, `pass_screener` | Companion document semantic lint for Mapping, Ontology, References, Locale, Screener, and Determination Record consistency. |

Supporting modules: **`types`** (diagnostics, options, result), **`lint_json`** (wire JSON for hosts), **`semantic_helpers`** (strict paths, Definition context, interpolation helpers), **`component_matrix`** (built-in input vs. `dataType` rules).

## Architecture

**Authoritative API** is `cargo doc -p formspec-lint --no-deps`. A **single-file Markdown mirror** is [`docs/rustdoc-md/API.md`](docs/rustdoc-md/API.md), produced by [cargo-doc-md](https://github.com/Crazytieguy/cargo-doc-md) and `scripts/bundle-rustdoc-md.mjs`.

### Pipeline (definitions)

```text
JSON Value
  → detect type (E100) + schema validate (E101)
  → build_item_index (E200/E201); gate if structural errors
  → check_references (E300…), check_extensions (E600…)
  → compile_expressions (E400) + analyze_dependencies (E500)  [unless no_fel]
  → sort, filter by LintMode, Strict promotes selected W8xx → Error
```

Theme and component documents skip definition passes 2–5 and run pass 6 or 7 only (after 1 + 1b).

Companion authoring documents run pass 9 after schema validation. Mapping exposes `MappingStaticAnalysis` for projector input facts; Ontology exposes `OntologyStaticAnalysis` for path, vocabulary, and effective concept-system facts. Locale can use `definition_document`, `theme_document`, `component_documents`, and `locale_documents` context, but lint remains static and does not alter runtime string lookup.

### Source layout (`src/`)

| File | Responsibility |
|------|----------------|
| `lib.rs` | `lint` / `lint_with_options`, orchestration, integration tests. |
| `types.rs` | `LintDiagnostic`, `LintResult`, `LintOptions`, `LintMode`, sorting. |
| `schema_validation.rs` | Embedded schemas, E101. |
| `semantic_helpers.rs` | Shared strict-path, Definition, interpolation, and context helpers for companion passes. |
| `tree.rs` | `ItemTreeIndex`, `build_item_index`. |
| `references.rs` | `check_references`. |
| `extensions.rs` | `check_extensions`. |
| `expressions.rs` | `compile_expressions`, `CompiledExpression`. |
| `dependencies.rs` | `analyze_dependencies`. |
| `pass_theme.rs` | `lint_theme`. |
| `pass_component.rs` | `lint_component`. |
| `pass_response.rs` | `lint_response`. |
| `pass_mapping.rs` | Mapping semantic lint and static analysis facts. |
| `pass_ontology.rs` | Ontology semantic lint and static analysis facts. |
| `pass_references_doc.rs` | References document semantic lint. |
| `pass_locale.rs` | Locale document semantic lint. |
| `pass_screener.rs` | Screener semantic hardening and Determination Record consistency. |
| `component_matrix.rs` | `classify_compatibility`, `INPUT_COMPONENTS`. |
| `lint_json.rs` | `lint_result_to_json_value`. |

### Monorepo consumers

- **`formspec-wasm`** / **Python** / batch tools that need the same lint semantics as documented in the spec suite.

## For LLM assistants

1. Read this README (**Scope** and **Architecture**).
2. Read [`docs/rustdoc-md/API.md`](docs/rustdoc-md/API.md) end-to-end (bundled public rustdoc).

## Quick start

```rust
use formspec_lint::{lint, LintOptions, LintMode};
use serde_json::json;

let doc = json!({
    "$formspec": "1.0",
    "url": "https://example.com/f",
    "version": "1.0.0",
    "status": "draft",
    "title": "T",
    "items": [{ "key": "n", "type": "field", "label": "N", "dataType": "string" }]
});
let r = lint(&doc);
assert!(r.valid, "{:?}", r.diagnostics);
```

## API documentation

```bash
cargo doc -p formspec-lint --no-deps --open
```

CI-style strict **public** docs:

```bash
RUSTDOCFLAGS='-D missing_docs' cargo doc -p formspec-lint --no-deps
```

### Markdown export

```bash
cargo install cargo-doc-md
npm run docs:formspec-lint
```

This writes `target/doc-md-formspec-lint/`, bundles to `docs/rustdoc-md/API.md`, then runs `cargo doc -p formspec-lint --no-deps`.

## Internal (private) documentation

`src/lib.rs` enables **`missing_docs`** and **`clippy::missing_docs_in_private_items`**. Large implementation modules (`schema_validation`, `references`, `extensions`, `expressions`, `dependencies`, `pass_theme`, `pass_component`, `component_matrix`) use module-level `//!` notes and `#![allow(clippy::missing_docs_in_private_items)]` so internal helpers are not each annotated. Test modules use the same allow inside `#[cfg(test)] mod tests`.

Strict check (this crate only):

```bash
cargo clippy -p formspec-lint --no-deps -- -D clippy::missing_docs_in_private_items
```

## Tests

```bash
cargo nextest run -p formspec-lint
```

## License

Apache-2.0 — see [LICENSE](../../LICENSE) and [LICENSING.md](../../LICENSING.md).

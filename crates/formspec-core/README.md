# formspec-core

Rust **Formspec processing** layer built on [`fel-core`](../fel-core/) — FEL analysis and rewriting, definition item walking, `$ref` assembly, extension/registry validation, JSON Schema dispatch planning, changelog diffing, and **runtime mapping** execution (forward/reverse).

Normative behavior lives in the repo under `specs/` and `schemas/`; this crate mirrors the non-reactive pieces of the TypeScript engine for WASM, Python, and batch tooling.

## Scope

| Module | Role |
|--------|------|
| **`assembler`** | Resolve `$ref`, merge fragments, rewrite FEL after merge. |
| **`fel_analysis` / `fel_rewrite_exact`** | Static FEL analysis, AST rewrite, span-preserving source rewrite. |
| **`definition_items`** | Depth-first / shallow walks over definition `items` / `children` with key policy. |
| **`extension_analysis`** | Validate `x-*` extensions against registry metadata. |
| **`registry_client`** | Parse registry JSON, semver constraints, wire helpers. |
| **`schema_validator`** | Document type detection, validation plan, JSON Pointer → JSONPath. |
| **`runtime_mapping`** | Parse mapping docs, execute rules, diagnostics, JSON wire. |
| **`changelog`** | Diff two definition versions into structured changes + semver hint. |
| **`path_utils`** | Path normalization and JSON item-tree navigation. |
| **`component_tree`** | Component subtree visitation for schema planning. |
| **`json_artifacts` / `json_util` / `wire_keys`** | Stable JSON shapes and field names for host bindings. |

## Architecture

**Authoritative API** is `cargo doc -p formspec-core --no-deps`. A **single-file Markdown mirror** is [`docs/rustdoc-md/API.md`](docs/rustdoc-md/API.md), generated with [cargo-doc-md](https://github.com/Crazytieguy/cargo-doc-md) and the shared `fel-core/scripts/bundle-rustdoc-md.mjs` bundler.

### Typical data flow

```text
Definition / mapping / registry JSON
    → parse / detect type / validate plan (schema_validator + component_tree)
    → FEL analysis or rewrite (fel_analysis, fel_rewrite_exact)
    → optional assembly (assembler + RefResolver)
    → optional mapping execute (runtime_mapping)
    → JSON artifacts for hosts (json_artifacts, wire_keys)
```

### Source layout (`src/`)

| Path | Responsibility |
|------|----------------|
| `lib.rs` | Crate root, `#![warn(missing_docs)]`, re-exports. |
| `assembler.rs` | `$ref` resolution, provenance, host JSON. |
| `fel_analysis.rs` | Parse FEL, collect refs, rewrite AST. |
| `fel_rewrite_exact.rs` | Lexer-driven source rewrite + message templates. |
| `definition_items.rs` | Item tree visitors and key policies. |
| `extension_analysis.rs` | Extension vs registry lifecycle checks. |
| `registry_client/` | Registry parse, types, version predicates, wire JSON. |
| `schema_validator.rs` | Markers, `JsonSchemaValidator` trait, plans. |
| `runtime_mapping/` | Types, parse, engine, document execute, wire JSON. |
| `changelog.rs` | Definition diff → `Changelog`. |
| `path_utils.rs` | Dotted paths, `TreeItem`, JSON item lookup. |
| `component_tree.rs` | Component tree walk for validation targets. |
| `json_artifacts.rs` | Wire helpers for diagnostics, changelog, etc. |
| `json_util.rs` | Small JSON helpers. |
| `wire_keys.rs` | Centralized host key names per `JsonWireStyle`. |

### Monorepo consumers

- **`formspec-eval`** — Batch definition evaluation and item-tree rebuild.
- **`formspec-wasm`** — Thin FFI over core operations.
- **`formspec-py`** — PyO3 bindings over the same surfaces.

## For LLM assistants

1. Read this README (**Scope** and **Architecture**).
2. Read [`docs/rustdoc-md/API.md`](docs/rustdoc-md/API.md) end-to end (bundled public rustdoc).

## Quick start

```rust
use formspec_core::analyze_fel;

let a = analyze_fel("$firstName + ' ' + $lastName");
assert!(a.valid);
assert!(a.references.contains("firstName"));
```

## API documentation

```bash
cargo doc -p formspec-core --no-deps --open
```

CI-style strict public docs:

```bash
RUSTDOCFLAGS='-D missing_docs' cargo doc -p formspec-core --no-deps
```

### Markdown export

```bash
cargo install cargo-doc-md
npm run docs:formspec-core
```

This writes `target/doc-md-formspec-core/`, bundles to `docs/rustdoc-md/API.md`, then runs `cargo doc`.

## Internal (private) documentation

`src/lib.rs` enables **`clippy::missing_docs_in_private_items`** so private helpers are covered in CI-style `cargo clippy`.

- **Narrative + allow** — Large internal pipelines (`assembler`, `fel_analysis`, `fel_rewrite_exact`, `changelog`, `extension_analysis`, `json_artifacts`, registry/mapping `parse` modules, `runtime_mapping` helpers) extend the module `//!` with a short “internal helpers” overview and use `#![allow(clippy::missing_docs_in_private_items)]` so dozens of `$ref`/parser/mapping steps are not each annotated with `///`.
- **Spot docs** — Smaller surfaces use real `///` (e.g. `path_utils::json_item_path_segments`, `definition_items::definition_item_visit_ctx_at`, `build_mapping_env`, schema plan walkers, `MapResolver::fragments`).

Strict check (lint only this crate; avoids flagging `fel-core`):

```bash
cargo clippy -p formspec-core --no-deps -- -D clippy::missing_docs_in_private_items
```

## Tests

```bash
cargo nextest run -p formspec-core
```

## License

Apache-2.0 — see [LICENSE](../../LICENSE) and [LICENSING.md](../../LICENSING.md).

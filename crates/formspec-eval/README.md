# formspec-eval

Rust **batch evaluator** for Formspec definitions: given a JSON definition and flat response data, produce computed values, relevance / required / readonly state, variables, and a structured validation report. Implements the same **processing-model phases** as the TypeScript `formspec-engine` reference (rebuild → recalculate → revalidate → NRB), using [`fel-core`](../fel-core/) for FEL parse/eval and [`formspec-core`](../formspec-core/) for definition walks and registry helpers.

## When to use this crate

- Server-side or CLI evaluation where you already have `serde_json::Value` maps.
- WASM / Python bindings that need parity with the engine’s batch semantics.
- Unit or integration tests that exercise the full pipeline without a browser.

For interactive, signal-driven UI state, use the TypeScript engine instead.

## Scope

| Phase | Module(s) | Role |
|-------|-----------|------|
| 1 | `rebuild` | Parse `items` / `binds`, seed `initialValue`, expand repeats, wildcard binds. |
| 2 | `recalculate` | Relevance, required, readonly, whitespace, variables, calculated fields (fixpoint). |
| 3 | `revalidate` | Required / type / bind constraints, registry extension checks, shape rules. |
| 4 | `nrb` | Non-relevant behavior on output values (remove / empty / keep). |

Cross-cutting:

- **`convert`** — Resolve values by dotted paths (flat map + nested objects).
- **Private `fel_json`** — Money-shaped JSON normalization before `json_to_fel`.
- **Private `runtime_seed`** — `prePopulate` and previous non-relevant hints from `EvalContext`.
- **`screener`** — Optional; evaluates `screener.routes` in an isolated FEL environment.

## Architecture

**Authoritative API** is `cargo doc -p formspec-eval --no-deps`. A **single-file Markdown mirror** is [`docs/rustdoc-md/API.md`](docs/rustdoc-md/API.md), produced by [cargo-doc-md](https://github.com/Crazytieguy/cargo-doc-md) and `scripts/bundle-rustdoc-md.mjs`.

### Primary entry points

The main orchestrator is [`pipeline::evaluate`](src/pipeline.rs) with [`EvalOptions`](src/eval_options.rs).

### Source layout (`src/`)

| Path | Responsibility |
|------|----------------|
| `lib.rs` | Crate docs, re-exports, `#![warn(missing_docs)]` + private clippy doc lint. |
| `pipeline.rs` | `evaluate_*` orchestration (rebuild → recalculate → revalidate → NRB). |
| `rebuild/` | Item tree, initial values, repeat expansion, wildcard binds. |
| `recalculate/` | Environment-backed recalculation; `recalculate()`, `topo_sort_variables`. |
| `revalidate/` | Validation env, bind/item checks, shape composition. |
| `nrb.rs` | `resolve_nrb`, `apply_nrb`. |
| `convert.rs` | `resolve_value_by_path`. |
| `screener.rs` | `evaluate_screener`, `ScreenerRouteResult`. |
| `types/` | `EvaluationResult`, `ItemInfo`, `EvalContext`, path helpers (`pub(crate)`). |
| `eval_json.rs` | WASM-shaped JSON: `evaluation_result_to_json_value`, `eval_host_context_from_json_map`. |
| `registry_constraints.rs` | `extension_constraints_from_registry_documents`. |
| `fel_json.rs`, `value_predicate.rs`, `runtime_seed.rs` | Internal shared helpers. |

### Monorepo consumers

- **`formspec-wasm`** and **PyO3** layers that call the same batch contract as the engine.

## For LLM assistants

1. Read this README (**Scope** and **Architecture**).
2. Read [`docs/rustdoc-md/API.md`](docs/rustdoc-md/API.md) in full (bundled public rustdoc).

## Quick start

```rust
use formspec_eval::{evaluate, EvalContext, EvalOptions};
use serde_json::json;
use std::collections::HashMap;

let def = json!({
    "$formspec": "1.0",
    "url": "https://example.com/f",
    "version": "1.0.0",
    "status": "draft",
    "title": "T",
    "items": [{ "key": "n", "type": "field", "label": "N", "dataType": "string" }]
});
let mut data = HashMap::new();
data.insert("n".into(), json!("hello"));
let r = evaluate(&def, &data, &EvalOptions::default());
assert!(r.values.get("n").is_some());
```

## API documentation

```bash
cargo doc -p formspec-eval --no-deps --open
```

CI-style strict **public** docs:

```bash
RUSTDOCFLAGS='-D missing_docs' cargo doc -p formspec-eval --no-deps
```

### Markdown export

```bash
cargo install cargo-doc-md
npm run docs:formspec-eval
```

This writes `target/doc-md-formspec-eval/`, bundles to `docs/rustdoc-md/API.md`, then runs `cargo doc -p formspec-eval --no-deps`.

## Internal (private) documentation

`src/lib.rs` enables **`missing_docs`** and **`clippy::missing_docs_in_private_items`**. Large implementation areas (`rebuild/*`, `revalidate/*`, `fel_json`, `nrb`, `runtime_seed`, `types/paths`, `recalculate` internals) use module-level `#![allow(clippy::missing_docs_in_private_items)]` and `//!` overviews instead of per-helper `///` noise. `eval_json` documents the public `EvalHostContextBundle` and allows private parsers.

Strict check (this crate only):

```bash
cargo clippy -p formspec-eval --no-deps -- -D clippy::missing_docs_in_private_items
```

## Tests

```bash
cargo nextest run -p formspec-eval
```

- **Library tests** — Under `src/**` (including `rebuild::tests`, `recalculate`, `revalidate`, …).
- **Integration tests** — `tests/integration/` (`[[test]]` name `integration` in `Cargo.toml`).

## Dependencies

- **`fel-core`** — FEL and `FormspecEnvironment`.
- **`formspec-core`** — Definition walks, registry version checks, wire keys.
- **`serde_json`**, **`rust_decimal`**, **`fancy-regex`**.

`fel-core` is also a **dev-dependency** so integration tests can assert `json_to_fel` / `fel_to_json` round-trips.

## See also

- **`packages/formspec-engine`** — Client-side reactive engine (conceptual twin).
- Repository **`CLAUDE.md`** / **`AGENTS.md`** — Monorepo conventions and spec locations.

## License

Apache-2.0 — see [LICENSE](../../LICENSE) and [LICENSING.md](../../LICENSING.md).

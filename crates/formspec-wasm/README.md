# formspec-wasm

`wasm-bindgen` crate exposing the Rust Formspec stack to TypeScript and browsers. Public API is `#[wasm_bindgen]` functions on the crate root modules (`evalFEL`, `lintDocument`, `evaluateDefinition`, …); inputs and outputs are mostly JSON strings.

## Cargo features

| Feature | Default | Effect |
|---------|---------|--------|
| **`full-wasm`** | **yes** | Meta-feature: enables every optional `wasm_bindgen` surface below (tools artifact). |
| `lint` | **yes** (via `full-wasm`) | `formspec-lint` + `lintDocument` (implies `document-api`). |
| `document-api` | **yes** | `detectDocumentType`, `jsonPointerToJsonPath`, `planSchemaValidation`. |
| `definition-assembly` | **yes** | `assembleDefinition` (`$ref` / fragments). |
| `mapping-api` | **yes** | `executeMappingRules`, `executeMappingDocument`. |
| `registry-api` | **yes** | Registry parse/lookup/lifecycle + `validateExtensionUsage`. |
| `changelog-api` | **yes** | `generateChangelog`. |
| `fel-authoring` | **yes** | `parseFEL`, `tokenizeFEL`, `printFEL`, `tryLiftConditionGroup`, `extractDependencies`, FEL rewrites, `rewriteFelForAssembly`, `listBuiltinFunctions`. |

**Runtime WASM** (`npm run build:wasm:runtime`): `wasm-pack … -- --no-default-features` — **none** of the above; only **eval / screener / coerce / migrations / option sets / core FEL** (`evalFEL*`, `prepareFelExpression`, `getFELDependencies`, `analyzeFEL`, path helpers) + **split ABI** string.

**Tools WASM**: default features = `full-wasm` (all rows). TypeScript loads runtime first, tools lazily (**ADR 0050**).

Sibling binding: **[`formspec-py`](../formspec-py/)** (`formspec_rust`) targets the same stack for Python. Mapping JSON parsing (e.g. `parse_coerce_type`, including `array` coercion) is kept aligned with that crate where practical.

## Layout

| Module | Role |
|--------|------|
| `fel` | Always: eval, `prepareFelExpression`, `getFELDependencies`, `analyzeFEL`, path helpers. `fel-authoring`: tokenize/parse/print/rewrites/catalog. |
| `evaluate` | `evaluateDefinition`, `evaluateScreenerDocument`, context/trigger parsing |
| `definition` | Always: option sets + migrations. `definition-assembly`: `assembleDefinition`. |
| `value_coerce` | `coerceFieldValue` (item/bind/definition/value JSON strings) |
| `changeset` | Changeset dependency analysis (key extraction, connected components) |
| `document` | `document-api`: detect/plan/jsonPointer. `lint`: `lintDocument*`. |
| `mapping` | `mapping-api`: `executeMappingRules` (rules array) + `executeMappingDocument` (mapping document) |
| `registry` | `registry-api`: parse/find/lifecycle/well-known + `validateExtensionUsage` |
| `changelog` | `changelog-api`: `generateChangelog` |
| `split_abi` | `formspecWasmSplitAbiVersion` — lockstep marker between paired runtime/tools artifacts |
| `json_host` | Internal: shared JSON parse/stringify helpers for the wasm_bindgen surface |
| `lib.rs` | Crate docs and `mod` wiring only |
| `wasm_tests` | Native `cargo nextest run` for string-JSON helpers (`#[cfg(test)]` only) |

## Development

```bash
cargo nextest run -p formspec-wasm
cargo nextest run -p formspec-wasm --no-default-features   # minimal wasm_bindgen surface (42 tests; skips tools-only cases)
# Runtime WASM (minimal features — see table above):
wasm-pack build crates/formspec-wasm --target web --no-opt -- --no-default-features
# Full / tools WASM:
wasm-pack build crates/formspec-wasm --target web --no-opt
```

Release profile disables `wasm-opt` in `Cargo.toml` metadata (see `package.metadata.wasm-pack`).

## `cargo bloat` (native proxy)

`cargo-bloat` cannot read `wasm32` binaries. This crate includes **`formspec-wasm-bloat-runtime`** and **`formspec-wasm-bloat-tools`** — small host executables that pull the same dependency graph as runtime vs tools WASM so `cargo bloat --crates` has a Mach-O/ELF binary to analyze. See [wasm-split-baseline.md](../../thoughts/reviews/2026-03-23-wasm-split-baseline.md) for commands and caveats.

## `twiggy` (shipped WASM)

**`twiggy`** profiles the **actual** `wasm-opt`’d `.wasm` files under `packages/formspec-engine/wasm-pkg-{runtime,tools}/`. Use it **together with** `cargo bloat`: bloat → **which crates**; twiggy → **what landed in wasm**, **`twiggy diff`** runtime→tools → **largest deltas** on the artifact.

```bash
# After: cd packages/formspec-engine && npm run build:wasm
bash scripts/twiggy-wasm.sh              # repo root — full report
npm run profile:twiggy --workspace=formspec-engine   # same script
```

Requires `twiggy` on PATH (`cargo install twiggy`). From monorepo root you can also run **`npm run wasm:twiggy`**. Details: [wasm-split-baseline.md](../../thoughts/reviews/2026-03-23-wasm-split-baseline.md) § *cargo bloat + twiggy*.

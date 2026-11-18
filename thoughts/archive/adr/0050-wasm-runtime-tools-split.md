# ADR 0050: Split WASM into Runtime and Tools Modules

**Status:** Accepted
**Date:** 2026-03-23

## Context

The current `formspec-wasm` artifact is a single module that includes both:

1. **Runtime-critical execution paths** used in form rendering/evaluation loops, and
2. **Authoring/tooling paths** used for linting, schema validation, changelog generation, registry parsing, and mapping utilities.

Observed consequences:

- Initial WASM payload for runtime consumers is larger than needed for first-use evaluation.
- Heavy transitive dependencies for tooling (notably `formspec-lint` -> `jsonschema`) are pulled into all runtime contexts today.
- Build and loader code currently assume a single generated JS/WASM artifact, so any split must include explicit bridge, packaging, and fence-check updates.
- Exact size and timing deltas have not yet been recorded. The implementation must capture a before/after baseline rather than assume the win.

At the same time, runtime evaluation still needs limited registry-derived capability for extension checks and evaluation behavior. The render path used by `formspec-webcomponent` depends on engine initialization, FEL/evaluation helpers, signals, repeats, option resolution, coercion, migrations, and screener evaluation. It does not depend on schema linting, registry-document helpers, changelog generation, or mapping execution.

## Decision

Split the monolithic `formspec-wasm` surface into two separately built and loaded WASM modules:

### A) Runtime module (`formspec-wasm-runtime`)

Contains only the exports required for interactive form execution and the default `formspec-engine` runtime path.

**Included capability families:**

- Engine initialization path used by `initFormspecEngine()` / `createFormEngine()`
- FEL execution, compilation, and dependency helpers used in engine loops
- Definition/screener evaluation
- Runtime path helpers needed by engine internals
- Field value coercion
- Response migration transforms
- Option-set resolution needed in runtime setup
- Runtime extension validation/evaluation using registry-derived entry data

**Explicitly excluded:**

- JSON Schema validation and lint pipeline
- Registry document parsing, discovery, lifecycle transition checks
- Changelog generation
- Mapping execution APIs that are not required for first interactive runtime
- Authoring-only assembly helpers unless a runtime call site proves they are needed

### B) Tools module (`formspec-wasm-tools`)

Contains authoring, diagnostics, and utility exports that are not required for first interactive runtime.

**Included capability families:**

- Schema planning and linting
- Registry document parse/find/lifecycle/well-known URL helpers
- Changelog generation
- Mapping execution
- Definition assembly helpers used by authoring/build workflows

### Loading strategy

- Runtime module remains the default initialization path.
- Tools module is loaded lazily via dynamic import only when a tools API is called.
- Public TypeScript APIs stay stable where possible; internals route calls to runtime or tools bridge.
- Public APIs that are not render-critical may remain exported from `formspec-engine` while lazily loading the tools module on first use.
- **`initFormspecEngine()`** (in `init-formspec-engine.ts`) imports only the runtime bridge and uses **`import('./wasm-bridge-tools.js')`** when **`initFormspecEngineTools()`** runs, so the **init subpath** does not statically reference tools WASM paths. The package root still re-exports **`fel-api`**, which pulls tools JS glue — embedders use **`formspec-engine/init-formspec-engine`** for init-only, and **`formspec-engine/render`** for **`FormEngine`** / **`createFormEngine`** without the FEL tooling facade (`formspec-webcomponent` does both; see engine README).

## Public API Boundary

This ADR changes **module ownership**, not necessarily top-level TypeScript import paths.

Therefore:

- `formspec-engine` should keep stable top-level exports where practical.
- Non-render-critical public APIs such as mapping execution may stay publicly exported while moving behind the lazy tools bridge.
- Runtime-first consumers should be able to initialize and render forms without downloading or initializing the tools artifact.

## Runtime Registry Boundary

Runtime **does** need registry-derived data for extension validation and evaluation behavior. Runtime does **not** need registry document tooling.

Therefore:

- Keep runtime support for the current evaluation contract that accepts `registryDocuments` shaped like `[{ entries: [...] }]`.
- Allow equivalent pre-resolved entry collections if the runtime bridge chooses to normalize internally.
- Move full registry document operations (`parseRegistry`, `findRegistryEntry`, `validateLifecycleTransition`, `wellKnownRegistryUrl`) to tools module.

This preserves runtime correctness, avoids a forced API break at the engine boundary, and still removes registry-processing helpers from the initial payload.

## Consequences

### Positive

- Smaller initial runtime WASM payload for web/app consumers.
- Tooling-heavy dependencies no longer penalize first-load runtime.
- Cleaner separation of concerns: execution kernel vs authoring utilities.
- Enables independent optimization and release cadence for runtime vs tools.

### Negative

- Additional build/output complexity (two WASM packages).
- Bridge layer becomes more complex (`initWasm()` + `initWasmTools()`).
- Potential short-term migration churn in TypeScript wrappers and tests.
- Requires strict API ownership discipline to avoid runtime/tools boundary drift.

## Alternatives Considered

### 1) Keep single module and tune optimizations only

Rejected. Dependency-surface reduction targets a larger lever than `wasm-opt` tuning alone, but the implementation must confirm the actual win with recorded baselines.

### 2) Replace heavy dependencies first (e.g., schema validator swap)

Deferred. Potentially large effort/risk for semantic parity. Splitting modules gives immediate structural win and does not block future dependency reductions.

### 3) Feature-gate one crate and build multiple artifacts from same crate

Viable and still compatible with this ADR. Implementation may choose:

- two crates (`formspec-wasm-runtime`, `formspec-wasm-tools`), or
- one crate with strict Cargo features and two build targets.

The decision is about module boundaries and loading behavior, not crate-count preference.

## Implementation Plan

1. **Define export ownership matrix**
   - Mark each current `wasm-bridge` wrapper as runtime or tools.
   - Mark public-but-lazy APIs explicitly (`createMappingEngine()` / mapping, lint/schema, registry helpers, changelog, assembly).
2. **Create runtime/tools WASM build outputs**
   - Produce separate generated JS/WASM artifacts.
3. **Split bridge layer**
   - `wasm-bridge-runtime` (eager/default), `wasm-bridge-tools` (lazy).
   - Keep a top-level compatibility barrel so callers do not need widespread import rewrites.
4. **Preserve API compatibility**
   - Keep top-level exports stable; route internally by module ownership.
   - Keep public mapping APIs stable even if they move behind lazy tools loading.
5. **Update build and packaging**
   - Update `wasm-pack` outputs, browser/Node loader paths, and package metadata for two generated artifacts.
   - Update dependency-fence checks and docs that currently hardcode `formspec-wasm` / `formspec_wasm`.
6. **Migrate tests**
   - Ensure runtime tests and `formspec-webcomponent` render flows do not import or initialize tools paths.
   - Add tests for lazy tools initialization, lazy mapping execution, and error surfaces.
   - Preserve current `registryDocuments` evaluation behavior.
7. **Measure and gate**
   - Record the current monolith raw/gzip/brotli size and initialization/first-eval timings before the split.
   - Record runtime-module size and timing after the split.
   - Confirm runtime-first flows do not fetch or initialize tools artifacts.

## Acceptance Criteria

- `initFormspecEngine()` / `createFormEngine()` runtime-first flows initialize without loading tools WASM artifacts.
- `formspec-webcomponent` render flows work without importing or initializing tools artifacts.
- `formspec-layout` remains pure and does not gain any tools dependency.
- All existing behavior tests pass with no semantic regressions.
- Recorded baseline measurements show a clear runtime size reduction versus the current monolith.
- Tooling flows (lint/schema/registry/changelog/mapping) still behave identically once tools module is loaded.
- Registry-backed runtime extension checks continue to work with the current `registryDocuments` contract and any internal normalization layer.

## Paired artifact versions

Version `2` returns structured FEL dependencies from both modules. The runtime
`getFelDependencies` export now returns an object containing `fields` and
`instanceReads`. The tools `extractDependencies` export returns that same
shape. Rebuild and distribute the pair together (fs-xe4t).

## Follow-up Work (Non-blocking)

- ~~Replace `fancy-regex` with `regex` crate~~ — tried; no material size reduction.
- Reduce regex dependency in path-normalization code where hand parsing is simpler.
- Revisit schema-validator dependency strategy after split lands and baseline size is re-measured.

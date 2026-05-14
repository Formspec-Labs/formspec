# ADR 0062: Post-Split Follow-Ups — Unresolved ADR 0001 Items

## Status

Proposed

## Date

2026-03-15

## Context

[ADR 0061](./0061-current-state-authoring-runtime.md) proposed ten changes to tighten `formspec-studio-core` as a headless authoring runtime. The [package split](../archive/specs/2026-03-15-formspec-core-studio-split-design.md) into `formspec-core` and `formspec-studio-core` addressed the layering problem (primitives vs. helpers) but was orthogonal to the runtime architecture concerns in ADR 0061.

This document maps the remaining ADR 0061 items to their post-split locations and updates the [implementation sidecar](./0061-current-state-authoring-runtime-tasks.md) accordingly.

## What the Split Resolved

- **Separation of concerns**: primitives (`RawProject`, handlers, types) in `formspec-core`; semantic helpers (`Project`, field aliases, evaluation) in `formspec-studio-core`.
- **Dependency inversion**: `Project` composes `IProjectCore` instead of inheriting `RawProject`.
- **Clean seam**: `IProjectCore` interface as the contract between packages.

These are structural wins but do not touch the runtime architecture issues ADR 0001 identified.

## What Remains — Mapped to Post-Split Packages

### 1. Global Handler Registry → Explicit Command Table (ADR 0001 §6)

**Package:** `formspec-core`

The global `registerHandler`/`getHandler` pattern moved to `formspec-core` unchanged. Import-time self-registration via `handlers.ts` still drives all command wiring.

**Why it matters now:** `formspec-core` is the foundation package — CLI tools, agents, and tests will depend on it directly. A global mutable registry in the foundation is worse than a global registry in a leaf package.

**Post-split files:**
- `formspec-core/src/handler-registry.ts` — global map
- `formspec-core/src/handlers.ts` — side-effect import aggregate
- `formspec-core/src/handlers/*` — 17 handler modules with `registerHandler()` calls
- `formspec-core/src/raw-project.ts` — calls `getHandler()` at dispatch time

**Sidecar:** Slice 1 applies here, retargeted at `formspec-core`.

### 2. JSON-Native Public State (ADR 0001 §5)

**Package:** `formspec-core` (owns `ProjectState` and `types.ts`)

Scope is narrow but real: `ResolvedCatalog.entries` (`types.ts:104`) is a `Map<string, unknown>` — the only non-JSON-serializable structure in `ProjectState`. Built at `handlers/project.ts:129` via `new Map()`. `structuredClone` handles Maps, but `JSON.stringify` does not, and the shape leaks runtime indexing into durable state.

The raw registry `document` stored alongside it is plain JSON, suggesting the catalog map is a runtime index that should be private.

**Post-split files:**
- `formspec-core/src/types.ts` — `ResolvedCatalog`, `LoadedRegistry`, `ExtensionsState`
- `formspec-core/src/handlers/project.ts` — `loadRegistry` handler builds the Map
- `formspec-core/src/raw-project.ts` — state management

**Sidecar:** Slice 2 applies here, retargeted at `formspec-core`.

### 3. Internal Subsystem Decomposition (ADR 0001 §7)

**Package:** `formspec-core` (`RawProject`) and `formspec-studio-core` (`Project`)

The split separated the two layers, but neither class is internally decomposed:
- `RawProject` — 2,346 lines. Owns dispatch pipeline (4 paths), history, normalization, tree rebuild, queries, diagnostics, versioning/changelog diff all inline.
- `Project` — 2,142 lines. 51 helper methods plus query delegation in one class.

**Post-split files:**
- `formspec-core/src/raw-project.ts` — command execution, history, clone-dispatch-notify pipeline
- `formspec-studio-core/src/project.ts` — 51 helper methods in one class

**Sidecar:** Slice 3 applies to both packages. `RawProject` decomposition is the higher-value target since it owns the runtime pipeline.

### 4. Batch and Middleware Semantics (ADR 0001 §8)

**Package:** `formspec-core`

Four command execution paths now exist with three different middleware behaviors:

| Path | Middleware behavior | Location |
|------|-------------------|----------|
| `dispatch(single)` | Full wrapping — middleware can transform/reject | `_dispatchSingle` (line ~2146) |
| `dispatch(array)` | Post-hoc notification — handlers execute first, middleware runs after with a no-op inner chain | `_dispatchArray` (line ~2187) |
| `batch()` | None | line ~2296 |
| `batchWithRebuild()` | None (documented: "Middleware is not run") | line ~2236 |

The `_dispatchArray` approach is arguably worse than no middleware: it gives middleware the illusion of participation after execution has already happened and state has already changed. Middleware cannot reject or transform in this path.

**Post-split files:**
- `formspec-core/src/raw-project.ts` — all four paths

**Sidecar:** Slice 4 applies here, retargeted at `formspec-core`. The four-path inconsistency makes this more urgent than the ADR originally estimated.

### 5. Registry Loading Seam (ADR 0001 §9)

**Package:** `formspec-core`

Two registry loading paths exist with different behavior:

- **Command path** (`project.loadRegistry` handler) — builds the `Map` catalog, pushes into `state.extensions.registries`. This is the only path that produces indexed registries.
- **Seed path** (`ProjectOptions.seed.extensions`) — consumers must pre-build `LoadedRegistry` objects including the `Map` catalog themselves. No indexing happens at construction time.

This means seeded registries and command-loaded registries have different construction ergonomics and the seed path is fragile (requires knowing the internal `ResolvedCatalog` shape).

**Post-split files:**
- `formspec-core/src/raw-project.ts` — `createDefaultState` (seed path)
- `formspec-core/src/handlers/project.ts` — `loadRegistry` handler (command path)
- `formspec-core/src/types.ts` — `LoadedRegistry`, `ResolvedCatalog`

**Sidecar:** Slice 5 applies here, retargeted at `formspec-core`.

## Updated Sidecar Ownership

| Sidecar Slice | ADR §  | Pre-Split Package       | Post-Split Package |
|---------------|--------|-------------------------|--------------------|
| Slice 1       | §6     | formspec-studio-core    | **formspec-core**  |
| Slice 2       | §5     | formspec-studio-core    | **formspec-core**  |
| Slice 3       | §7     | formspec-studio-core    | **both**           |
| Slice 4       | §8     | formspec-studio-core    | **formspec-core**  |
| Slice 5       | §9     | formspec-studio-core    | **both**           |
| Slice 6       | docs   | formspec-studio-core    | **both**           |

The center of gravity shifted: most runtime architecture work now targets `formspec-core`, not `formspec-studio-core`.

## Suggested Priority

1. **Slice 1 (explicit handler wiring)** — highest leverage, affects every dispatch path, blocks clean instance isolation. Do this before `formspec-core` gains more consumers.
2. **Slice 4 (batch/middleware semantics)** — closely related to Slice 1; easier to define once handler wiring is explicit.
3. **Slice 2 (JSON-native state)** — requires design decisions about registry durable shape; benefits from Slice 5 context.
4. **Slice 5 (registry loading)** — natural companion to Slice 2.
5. **Slice 3 (internal decomposition)** — most valuable after handler wiring and state boundaries are settled.
6. **Slice 6 (docs/types)** — continuous, final pass after other slices land.

## Items from ADR 0001 That Are Resolved

| ADR § | Item | Status |
|-------|------|--------|
| §1 | Keep `Project` as public boundary | Preserved in both packages |
| §2 | Commands as primary mutation contract | Unchanged |
| §3 | Lifecycle ownership in core | `RawProject` owns the pipeline |
| §4 | Consumer UI state out of core | Still excluded |
| §10 | Diagnostics and queries on-demand | Unchanged |

## Review Trigger

Revisit this document when:
- Slice 1 lands and file paths change
- `formspec-core` gains its first non-studio consumer (CLI, agent, MCP)
- Any slice reveals that the pre/post-split boundary needs adjustment

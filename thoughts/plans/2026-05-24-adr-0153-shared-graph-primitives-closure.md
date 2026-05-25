# ADR 0153 Shared Graph Primitives Closure Plan

**ADR:** stack-root `thoughts/adr/0153-formspec-app-graph-production-boundary.md`
**Row:** Shared graph primitives
**Status:** Partial. Lint report consumption landed; production graph-loading consumers remain open.
**Owner:** Formspec app-graph follow-on lane

## Scope

Advance shared graph primitive consumption without porting the TypeScript
`@formspec-org/app-graph` kernels into Rust. The slice lets
`formspec-lint` consume a completed `AppGraphValidationReport`, validate it
against the report schema, preserve AppGraph diagnostic identity, and surface
the report to FFI hosts.

Not in this slice: Rust artifact loading, Node execution from Rust, a Rust port
of `resolveArtifacts` / `resolveModules` / `validateAppGraph`, Studio / MCP /
runtime / projection wiring, App Manifest policy slots, TraceIndex, or ADR 0152
fine-grained authorization.

## Evidence Before Work

- `formspec/packages/formspec-app-graph/` owns the shared TypeScript
  ArtifactResolver, ModuleResolver, and AppGraphValidator kernels.
- `formspec/crates/formspec-lint` is a Rust crate with no Node or TypeScript
  runtime boundary.
- `formspec-lint` `LintCode` is a closed legacy enum; AppGraph diagnostics use
  stable string codes plus origin, phase, and source pointers.
- `formspec/crates/formspec-lint/schemas/component.schema.json` and
  `response.schema.json` had drifted from canonical schemas, which made the
  full lint test suite fail before the AppGraph bridge could be trusted.

## Review Checkpoints

- 2026-05-25 architecture checkpoint `019e60b4-c5d2-7ed1-8a70-01cad7cf8059`
  returned PROCEED-WITH-CONDITIONS: use a lint-side report bridge over a
  completed `AppGraphValidationReport`; do not run the TypeScript kernels from
  Rust; do not flatten AppGraph codes into E603/E604/E101; keep resolver output
  identity, origin, phase, and source fields intact.

## Work Phases

### Phase 1 - Lint Report Bridge

- [x] Add `formspec-lint::app_graph_report`.
- [x] Validate the completed report against
  `crates/formspec-lint/schemas/app-graph-validation-report.schema.json`.
- [x] Run the bridge before document-type dispatch so App Manifest / graph-root
  calls still preserve completed reports even though App Manifest is not a
  `formspec-lint` primary `DocumentType`.
- [x] Preserve `code`, `severity`, `phase`, `origin`, `message`,
  `primarySource`, `relatedSources`, and `details`.
- [x] Reject invalid report shapes as E101 without synthesizing AppGraph
  diagnostics.

### Phase 2 - Host Wire Surfaces

- [x] Add `LintOptions.app_graph_validation_report`.
- [x] Add `LintResult.app_graph_report`.
- [x] Emit `appGraphReport` for JS/WASM and `app_graph_report` for Python
  snake-case lint JSON.
- [x] Accept `appGraphValidationReport` / `app_graph_validation_report` in WASM
  and Python result-shaped options.
- [x] Add Python `lint_report()` for callers that need `valid` and
  `app_graph_report`; keep `lint()` as a legacy diagnostic-list helper.

### Phase 3 - Schema Mirrors

- [x] Add the app-graph validation report schema to the lint mirror set.
- [x] Sync stale Component and Response schema mirrors with canonical schemas.
- [x] Add mirror parity coverage for the app-graph validation report schema.

### Phase 4 - Status Updates

- [x] Update ADR 0153 gate 3c from held to partial lint report consumption.
- [x] Update the stack rollup Shared graph primitives evidence.
- [x] Keep Shared graph primitives, Conformance, and Production wiring open.

## Deviations

- 2026-05-25: The first implementation used a direct out-of-crate
  `include_str!("../../../schemas/app-graph-validation-report.schema.json")`.
  That was replaced with the existing lint mirror pattern so `formspec-lint`
  remains package-buildable without the repository root.
- 2026-05-25: `scripts/sync-lint-schemas.mjs` also updated stale Component and
  Response mirrors. This was kept because `cargo nextest run -p formspec-lint`
  proves those mirrors are part of the lint crate's active invariant set.
- 2026-05-25: The bridge does not close production wiring. Lint can consume a
  completed report, but no production host is yet required to create or supply
  that report.
- 2026-05-25: The code landed in the same child commit as a posture-admission
  slice. Do not read that commit boundary as row closure; this plan records only
  the AppGraph report-bridge portion, which remains partial.

## Closure Evidence

Partial evidence landed:

- Code: `crates/formspec-lint/src/app_graph_report.rs`,
  `crates/formspec-lint/src/lib.rs`, `crates/formspec-lint/src/lint_json.rs`,
  and `crates/formspec-lint/src/types.rs`.
- Schema mirror:
  `crates/formspec-lint/schemas/app-graph-validation-report.schema.json`.
- Host options: `crates/formspec-wasm/src/document.rs`,
  `crates/formspec-py/src/document.rs`,
  `packages/formspec-engine/src/wasm-bridge-tools.ts`, and
  `src/formspec/_rust.py` (`lint_report()`).
- Verification: `cargo nextest run -p formspec-lint` passed 434/434 tests after
  schema mirror sync.

Still open:

- Studio, MCP, runtime, and projection consumers do not yet consume the shared
  validator report.
- Lint does not load an App Manifest graph or run `@formspec-org/app-graph`.
- Broader conformance corpus promotion and production wiring remain separate
  rows.

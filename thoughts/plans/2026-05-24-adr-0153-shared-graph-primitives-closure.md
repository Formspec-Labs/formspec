# ADR 0153 Shared Graph Primitives Closure Plan

**ADR:** stack-root `thoughts/adr/0153-formspec-app-graph-production-boundary.md`
**Row:** Shared graph primitives
**Status:** Partial. Lint and server report consumption landed; reusable TS
producer helper landed; MCP product-host producer landed; trusted
server-publish caller wiring remains open.
**Owner:** Formspec app-graph follow-on lane

## Scope

Advance shared graph primitive consumption without porting the TypeScript
`@formspec-org/app-graph` kernels into Rust. The first slice lets
`formspec-lint` consume a completed `AppGraphValidationReport`, validate it
against the report schema, preserve AppGraph diagnostic identity, and surface
the report to FFI hosts. The server-consumption slice lets `formspec-server`
publish accept a completed report, reject invalid/error reports, and preserve
AppGraph diagnostic identity without becoming the graph-loading authority.
The producer-helper slice makes the exact TypeScript graph-loading sequence a
public `@formspec-org/app-graph` API so hosts do not hand-compose resolver
outputs before publish.

Not in this slice: Rust artifact loading, Node execution from Rust, a Rust port
of `resolveArtifacts` / `resolveModules` / `validateAppGraph`, a production
host/BFF adoption that calls server publish with the generated report, broader
Studio/MCP publish wiring, runtime/projection wiring, App Manifest policy slots,
TraceIndex, or ADR 0152 fine-grained authorization.

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
- 2026-05-26 Hegel checkpoint `019e62be-0f7a-75d0-96da-4f24ebbd19c0`
  returned PROCEED for the helper/API slice only: the helper is legitimate
  production-callable API evidence, but not trusted production TS/BFF producer
  closure. Existing Studio and MCP publish paths still export bundles instead
  of calling `formspec-server` publish with an AppGraph report.
- 2026-05-26 Hegel checkpoint `019e62be-0f7a-75d0-96da-4f24ebbd19c0`
  returned APPROVE for the MCP product-host producer seam only: it may read the
  kernel App Manifest, auto-load kernel-owned Surfaces, delegate remaining
  siblings to a host loader, and call the shared producer helper, but it must not
  widen `formspec_publish`, become publish authority, or close server-publish
  caller wiring.
- 2026-05-26 Goodall review `019e632a-93a9-7c00-863c-20cc135b5a72`
  found no BLOCKER/HIGH/MEDIUM issues. Its LOW findings were resolved by
  removing generated `studio-core/dist` build churn from the slice and narrowing
  this plan's out-of-scope wording to distinguish the landed MCP producer seam
  from broader MCP publish wiring.

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
- [x] Keep Shared graph primitives and Conformance open.

### Phase 5 - Server Publish Report Consumption

- [x] Add optional `PublishFormVersionCommand.app_graph_validation_report`.
- [x] Reject schema-invalid reports through the lint-side AppGraph report
  bridge.
- [x] Reject `ok: false` or error-bearing AppGraph reports while preserving
  `code`, `origin`, `phase`, and source identity in the denial payload.
- [x] Keep `formspec-server` a report consumer only: it does not run Node,
  port TypeScript kernels, load graph artifacts, or infer AppGraph semantics.
- [x] Add publish-route integration coverage for error-bearing report denial.

### Phase 6 - Reusable TS Producer Helper

- [x] Add `produceAppGraphValidationReport()` to `@formspec-org/app-graph`.
- [x] Compose `resolveArtifacts -> artifactResolutionGraphInput ->
  moduleResolverInputFromAppGraph -> resolveModules -> validateAppGraph` inside
  one production-callable helper.
- [x] Keep loaders, schema validators, host evidence, ModuleResolver support,
  and cross-artifact validators caller-supplied.
- [x] Return the artifact-resolution report, module-resolution report, and final
  `AppGraphValidationReport` so trusted hosts can persist or forward the exact
  evidence they supplied to publish.
- [x] Add producer coverage over the graph-pipeline handoff fixture.

### Phase 7 - Explicit MCP Product-Host Producer

- [x] Add `FormsMcp.produceAppGraphValidationReport()` in `@formspec-org/mcp`.
- [x] Read the kernel App Manifest through `StudioCoreKernel.readAppManifest()`.
- [x] Auto-load kernel-owned Surface documents through
  `exportSurfaceDocument()` and attach the manifest `SiblingRef` identity
  instead of deriving identity from filenames or Surface document fields.
- [x] Require the caller-supplied loader for Definition, Component, Registry,
  Locale, and other non-Surface siblings.
- [x] Call the shared `@formspec-org/app-graph`
  `produceAppGraphValidationReport()` helper; do not widen `formspec_publish`
  or reconstruct graph evidence from `ProjectBundle`.
- [x] Add product-verb coverage proving Surface loading stays inside the kernel
  seam while Definition loading goes through the host loader.

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
- 2026-05-26: Architecture scout returned REVISE for server-side graph loading:
  Rust must not port or invoke the TypeScript kernels. The valid slice is server
  consumption of a trusted completed report. Full Shared graph closure still
  requires a production TS/BFF caller that runs `@formspec-org/app-graph`
  `resolveArtifacts -> graph adapter -> resolveModules -> validateAppGraph` and
  supplies the report to publish.
- 2026-05-26: The producer helper reduces host-side hand composition, but does
  not close the row by itself. Closure still requires a trusted production host
  or BFF to call the helper and pass the returned `report` to
  `formspec-server` publish.
- 2026-05-26: Architecture pre-review rejected widening MCP `formspec_publish`
  or reconstructing graph evidence from `ProjectBundle`. The accepted shape is
  an explicit product-host report producer: kernel App Manifest + kernel Surface
  export + host loaders for remaining siblings + shared producer helper. This
  advances MCP/product-host adoption only; server-publish submission remains
  open.

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
- Server consumer: `formspec-server/crates/formspec-server/src/services/forms.rs`
  accepts optional `app_graph_validation_report` on publish and
  `formspec-server/crates/formspec-server/src/services/posture_bundle_admission.rs`
  rejects invalid/error reports through the lint bridge.
- TS producer helper: `packages/formspec-app-graph/src/producer.ts` exports
  `produceAppGraphValidationReport()` and `packages/formspec-app-graph/src/index.ts`
  makes it public.
- MCP product-host producer:
  `formspec-studio/packages/formspec-mcp/src/product-verbs.ts`
  adds `FormsMcp.produceAppGraphValidationReport()` over the kernel App
  Manifest, kernel Surface export, caller-supplied sibling loader, and shared
  producer helper.
- Producer coverage:
  `packages/formspec-app-graph/tests/producer.test.ts` runs the same loaded-graph
  fixture through the producer helper and asserts completed artifact-resolution,
  module-resolution, schema, and cross-artifact phases for the passing case.
- MCP coverage:
  `formspec-studio/packages/formspec-mcp/tests/product-verbs.test.ts` proves the
  product-host seam auto-loads a publishable kernel Surface, delegates the
  Definition sibling to the host loader, and returns a completed AppGraph report.
- Verification: `cargo nextest run -p formspec-lint` passed 434/434 tests after
  schema mirror sync.
- Verification: `cargo nextest run -p formspec-server app_graph_report_admission`;
  `cargo nextest run -p formspec-server --test posture_bundle_admission`;
  `cargo nextest run -p formspec-server --test openapi_contract`;
  `cargo nextest run -p formspec-server --test in_process_trellis_receipt_projection`;
  `cargo nextest run -p formspec-server --test receipt_materialization`.
- Verification:
  `npm run test --workspace @formspec-org/app-graph -- producer.test.ts artifact-resolution-graph-handoff.test.ts`;
  `npx tsc --noEmit -p packages/formspec-app-graph/tsconfig.json`.
- Verification:
  `npm run test --workspace @formspec-org/mcp -- product-verbs.test.ts`;
  `npm run build --workspace @formspec-org/mcp`.

Still open:

- A trusted server-publish/BFF caller does not yet supply the completed report
  to `formspec-server` publish.
- Studio, MCP, runtime, and projection consumers do not yet consume the shared
  validator report where applicable outside the product-host producer seam.
- Lint does not load an App Manifest graph or run `@formspec-org/app-graph`.
- Broader conformance corpus promotion and production wiring remain separate
  rows.

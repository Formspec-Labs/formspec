# ADR 0153 ModuleResolver Interface Partial Plan

**ADR:** stack-root `thoughts/adr/0153-formspec-app-graph-production-boundary.md`
**Row:** ModuleResolver
**Status:** Partial; prose/interface boundary, report schema/type, shared kernel, and executable fixture conformance defined; consumer wiring remains open
**Owner:** Formspec app-graph follow-on lane

## Scope

Advance ADR 0153 gate 4 without claiming resolver extraction closure. This
slice defines the `ModuleResolver` input-evidence/output-report boundary,
Registry index input, app and sibling `modules[]` evidence, default module set
semantics, coarse admission evidence, version/dependency checks, contribution
ownership, payload-schema hook boundary, module-resolution diagnostics in
prose, the output report schema/type contract, and source-oriented
fixture/report-shape evidence for required diagnostic families.

Not in this slice: Rust lint changes, resolver request JSON Schema, production
consumers, ArtifactResolver loading behavior, AppGraphValidator cross-artifact
checks, runtime execution, renderer fallback, E605 Component id collision
ownership, v4 Posture sidecar promotion, or ADR 0152 fine-grained
authorization.

## Review Checkpoints

- 2026-05-25 architecture scout: APPROVE with guards. Required cautions: keep
  gate 4 Partial; treat current Rust lint as a behavioral seed rather than the
  final API; exclude E605 Component id collision ownership; define optional
  host-supplied coarse admission evidence without requiring the v4 Posture
  sidecar.
- 2026-05-25 architecture checkpoint (Planck): APPROVE a docs/status-only
  self-authoring hygiene slice before schema work. Required cautions: keep the
  spec contract direct; allow ADRs as provenance only; do not add schemas,
  generated types, fixtures, lint codes, resolver extraction, AppGraphValidator
  behavior, production consumers, runtime/projection wiring, or fine-grained
  authorization semantics.
- 2026-05-25 external review (Dalton): REVISE for one remaining normative ADR
  dependency in the Component bundle id collision note, then APPROVE after the
  note was rewritten as a direct bundle-graph ownership statement.
- 2026-05-25 architecture checkpoint (Carson): APPROVE a fixture corpus /
  report-shape evidence slice before resolver implementation. Required
  cautions: no `resolveModules`, no simulated resolver logic, full
  `expectedReport` per case, recursive leakage guards, explicit required-family
  coverage, and gate 4 remains Partial.
- 2026-05-25 architecture checkpoint (Cicero): APPROVE a narrow shared
  `@formspec-org/app-graph` ModuleResolver kernel plus executable fixture
  conformance. Required cautions: no request JSON Schema, no lint/runtime/Studio
  consumer wiring, explicit fixture-adapter source evidence, no extraction of
  Rust lint first-owner assumptions, coarse module-scoped admission only, and
  payload validation through a hook boundary.
- 2026-05-25 code review (Copernicus): REVISE for admitted-owner conflict
  semantics, id-only sibling coherence, fabricated source-pointer fallbacks,
  first-validator payload hook selection, and stale spec wording; APPROVE after
  fixes and added coverage.
- 2026-05-25 architecture checkpoints (Cicero and Pasteur): APPROVE WITH
  CHANGES for typed `ModuleResolutionReport` handoff into `AppGraphValidator`.
  Required changes: sanitize resolver source pointers before importing
  diagnostics into `AppGraphValidationReport`, derive the AppGraph
  `module-resolution` phase status from `ModuleResolutionReport.phase`, pass the
  full report through `AppGraphContext`, import only top-level resolver
  diagnostics, preserve the original resolver report unmodified, and defer
  Locale-owner module-id and Theme token-slot diagnostics.
- 2026-05-25 code review checkpoints (Copernicus and Carson): APPROVE with no
  open findings for the typed handoff diff. Copernicus noted one low residual
  risk around nested `modules[].diagnostics`; a follow-up unit test now pins that
  nested diagnostics are not imported into the AppGraph report.

## Work Completed

- [x] Add `specs/app-graph/module-resolver-spec.md` as the prose-only
  interface contract.
- [x] Define input-evidence/output-report concepts and the Registry index boundary.
- [x] Define App Manifest `modules[]`, sibling `modules[]`, and default module
  set semantics.
- [x] Define optional host coarse admission evidence without binding to a
  Posture sidecar.
- [x] Assign version, dependency, contribution ownership, category, and payload
  schema checks to `ModuleResolver`.
- [x] Keep E605 Component bundle id collision out of `ModuleResolver`.
- [x] Define module-resolution diagnostics and imported-origin rules for
  AppGraph reports.
- [x] Clarify that the spec is self-authoring: ADRs record provenance, while
  the spec states the `ModuleResolver` contract directly.
- [x] Add `schemas/module-resolution-report.schema.json` as the resolver output
  report contract.
- [x] Publish generated `ModuleResolutionReport` types from
  `@formspec-org/types`.
- [x] Add focused schema acceptance tests for report shape, resolver-only
  origin/phase, closed `ModuleRef`, and fixture/path-identity rejection.
- [x] Add source-oriented fixture cases for valid graph, unresolved app module,
  module version mismatch, dependency unresolved, sibling undeclared, host
  admission denied, contribution missing/category/unowned/conflict/unadmitted,
  and payload mismatch families.
- [x] Add fixture integrity tests that validate expected reports against
  `module-resolution-report.schema.json`, enforce resolver-owned diagnostics,
  and reject fixture/path identity or fine-grained authorization leakage.
- [x] Add `packages/formspec-app-graph/src/module-resolver.ts` as the shared
  pure ModuleResolver kernel for module admission, dependency checks,
  contribution ownership/category checks, and payload-schema hook diagnostics.
- [x] Export `resolveModules` and its TypeScript input/helper interfaces from
  `@formspec-org/app-graph` without adding a resolver request JSON Schema.
- [x] Add executable fixture conformance in
  `packages/formspec-app-graph/tests/module-resolver-conformance.test.ts` so
  the source fixture corpus runs through the shared resolver and compares exact
  `ModuleResolutionReport` output.
- [x] Make app module, default module, sibling document module, Registry,
  contribution-site, and payload source evidence explicit in fixture data. The
  conformance adapter only injects the executable payload validator function;
  it no longer derives report identity from file paths, case ids, URL suffixes,
  document kind defaults, or payload-presence heuristics.
- [x] Type `AppGraphValidationRequest.moduleResolution` and
  `AppGraphContext.moduleResolution` as the generated `ModuleResolutionReport`.
- [x] Import top-level ModuleResolver diagnostics into
  `AppGraphValidationReport` through a sanitizer that preserves
  `module-resolver` / `module-resolution` ownership while dropping
  resolver-only `source.module` evidence from AppGraph report pointers.
- [x] Reflect `ModuleResolutionReport.phase.status` / `reason` in the
  AppGraph report phase table instead of treating request presence as
  completion.

## Still Open for Gate 4 Closure

- [ ] Wire lint, Studio, MCPs, runtime, and projection consumers to the shared
  resolver output.
- [ ] Use typed module evidence for module-consuming graph semantics such as
  UI Graph Policy Locale-owner module-id resolution and Theme token-slot
  validation without duplicating ModuleResolver findings as native module checks.

## Deviations

- 2026-05-25: Gate 4 remains Partial, not Closed. The prose/interface contract
  is an ordered prerequisite, but it does not extract shared resolver code or
  rewire module-consuming graph consumers.
- 2026-05-25: The current Rust `pass_modules` implementation is treated as
  evidence for E603/E604 semantics only. E605 stays outside this resolver
  contract.
- 2026-05-25: Host-supplied admission evidence replaces any dependency on the
  v4 spike Posture sidecar. Fine-grained authorization remains a separate
  authorization-contract concern.
- 2026-05-25: The report schema/type slice keeps gate 4 Partial. It freezes the
  resolver output envelope, not resolver execution, source fixture conformance,
  or production consumer wiring.
- 2026-05-25: The source fixture slice keeps gate 4 Partial. It pins the
  required diagnostic families and expected report shapes, but no production
  ModuleResolver executes the corpus yet.
- 2026-05-25: The shared-kernel slice keeps gate 4 Partial. It executes the
  fixture corpus through `resolveModules`, but does not wire lint, Studio, MCPs,
  runtime/projection, or `AppGraphValidator` consumers.
- 2026-05-25: The implementation uses a TypeScript input interface with
  explicit source pointers in fixture input data. No resolver request JSON
  Schema or generated request type was added.
- 2026-05-25: Payload validation remains a host-supplied hook boundary. The
  conformance runner supplies a minimal `widgetShape.props` validator for the
  committed fixture; the kernel does not become a general source-schema
  validator or renderer fallback engine.
- 2026-05-25: The AppGraphValidator handoff imports only top-level resolver
  diagnostics and sanitizes AppGraph report pointers by dropping resolver-only
  `source.module` evidence. The full `ModuleResolutionReport` remains available
  on validator context for later policy semantics; the AppGraph report schema is
  not widened.
- 2026-05-25: Module evidence availability does not yet emit new Locale-owner
  module-id or Theme token-slot diagnostics. Those remain separate UI Graph
  Policy gates after this typed handoff.

## Partial Evidence

- Spec: `specs/app-graph/module-resolver-spec.md`.
- Schema: `schemas/module-resolution-report.schema.json`.
- Generated type: `packages/formspec-types/src/generated/module-resolution-report.ts`.
- Tests: `tests/conformance/schemas/test_module_resolution_report_schema.py`;
  `packages/formspec-types/tests/schema-sync.test.ts`;
  `tests/conformance/test_module_resolver_fixture_corpus.py`;
  `packages/formspec-app-graph/tests/module-resolver-conformance.test.ts`.
- Shared package: `packages/formspec-app-graph/src/module-resolver.ts`;
  `packages/formspec-app-graph/src/index.ts`;
  `packages/formspec-app-graph/src/types.ts`;
  `packages/formspec-app-graph/src/validator.ts`.
- AppGraph handoff tests:
  `packages/formspec-app-graph/tests/app-graph-validator.test.ts`;
  `tests/conformance/schemas/test_app_graph_validation_report_schema.py`.
- Fixtures: `tests/conformance/fixtures/module-resolver/*.case.json`.
- Parent ADR gate update: stack-root
  `thoughts/adr/0153-formspec-app-graph-production-boundary.md`.
- Rollup update: stack-root
  `thoughts/2026-05-24-adr-0150-followons-and-gating.md`.
- Verification: `npm run --workspace @formspec-org/app-graph test`;
  `npm run --workspace @formspec-org/app-graph build`;
  `npx tsc -p packages/formspec-app-graph/tsconfig.json --noEmit`;
  `npm run --workspace @formspec-org/types test -- tests/schema-sync.test.ts`;
  `python -m pytest tests/conformance/test_module_resolver_fixture_corpus.py -q`;
  `python -m pytest tests/conformance/schemas/test_app_graph_validation_report_schema.py tests/conformance/test_module_resolver_fixture_corpus.py tests/conformance/schemas/test_module_resolution_report_schema.py -q`;
  `npm run docs:filemap:check`; `npm run docs:check`;
  `git -C formspec diff --check`; stack-root `git diff --check`.

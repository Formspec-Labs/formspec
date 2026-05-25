# ADR 0153 ModuleResolver Interface Partial Plan

**ADR:** stack-root `thoughts/adr/0153-formspec-app-graph-production-boundary.md`
**Row:** ModuleResolver
**Status:** Partial; prose/interface boundary, report schema/type, and static source fixtures defined; shared extraction remains open
**Owner:** Formspec app-graph follow-on lane

## Scope

Advance ADR 0153 gate 4 without claiming resolver extraction closure. This
slice defines the `ModuleResolver` input-evidence/output-report boundary,
Registry index input, app and sibling `modules[]` evidence, default module set
semantics, coarse admission evidence, version/dependency checks, contribution
ownership, payload-schema hook boundary, module-resolution diagnostics in
prose, the output report schema/type contract, and source-oriented
fixture/report-shape evidence for required diagnostic families.

Not in this slice: Rust lint changes, shared resolver package code,
resolver request JSON Schema, executable conformance over a production
resolver, production consumers, ArtifactResolver loading behavior,
AppGraphValidator cross-artifact checks, runtime execution, renderer fallback,
E605 Component id collision ownership, v4 Posture sidecar promotion, or ADR
0152 fine-grained authorization.

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

## Still Open for Gate 4 Closure

- [ ] Extract a shared resolver package or app-graph package module from the
  Rust lint and spike-local seeds without copying spike-only assumptions.
- [ ] Execute the fixture corpus through the shared resolver as conformance,
  rather than validating static expected reports only.
- [ ] Wire lint, Studio, MCPs, runtime, and projection consumers to the shared
  resolver output.
- [ ] Integrate `ModuleResolver` diagnostics into `AppGraphValidator` without
  duplicating module findings as native cross-artifact checks.

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

## Partial Evidence

- Spec: `specs/app-graph/module-resolver-spec.md`.
- Schema: `schemas/module-resolution-report.schema.json`.
- Generated type: `packages/formspec-types/src/generated/module-resolution-report.ts`.
- Tests: `tests/conformance/schemas/test_module_resolution_report_schema.py`;
  `packages/formspec-types/tests/schema-sync.test.ts`;
  `tests/conformance/test_module_resolver_fixture_corpus.py`.
- Fixtures: `tests/conformance/fixtures/module-resolver/*.case.json`.
- Parent ADR gate update: stack-root
  `thoughts/adr/0153-formspec-app-graph-production-boundary.md`.
- Rollup update: stack-root
  `thoughts/2026-05-24-adr-0150-followons-and-gating.md`.
- Verification: `npm run docs:filemap:check`; `npm run docs:check`;
  `git -C formspec diff --check`; stack-root `git diff --check`.

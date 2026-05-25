# ADR 0153 AppGraphValidator Extraction Partial Plan

**ADR:** stack-root `thoughts/adr/0153-formspec-app-graph-production-boundary.md`
**Row:** AppGraphValidator extraction
**Status:** Partial; shared report kernel extracted, validator-owned cross-artifact checks remain
**Owner:** Formspec app-graph follow-on lane

## Scope

Advance ADR 0153 gate 3b without claiming full extraction closure. This slice
creates a shared `@formspec-org/app-graph` package for the
`AppGraphValidator` request/report kernel, diagnostic normalization, phase
status derivation, imported diagnostic preservation, schema hook execution, and
cross-artifact hook gating.

Not in this slice: report JSON Schema, generated types, concrete production
cross-artifact invariant implementations, ArtifactResolver extraction,
ModuleResolver extraction, lint/Studio/MCP/runtime/projection consumers, or
fine-grained authorization.

## Review Checkpoints

- 2026-05-24 architecture scout: APPROVE with Partial status. Required
  cautions: do not mark 3b Closed for a report-kernel-only package; keep report
  JSON Schema out of this slice; preserve imported diagnostic origins; do not
  port v4 coherence wholesale; root workspace build/test wiring must exercise
  the package.

## Work Completed

- [x] Add `packages/formspec-app-graph` as `@formspec-org/app-graph`.
- [x] Export shared request, artifact handle, diagnostic, phase, schema result,
  and report interfaces.
- [x] Implement deterministic diagnostic normalization and report summary
  derivation.
- [x] Implement `validateAppGraph(request)` as a pure report kernel:
  - imports ArtifactResolver, ModuleResolver, Surface-local, and handle-level
    diagnostics with origin preserved;
  - runs injected schema validators for loaded artifacts;
  - records missing schema validators as `not-run` schema results;
  - skips cross-artifact hooks when any handle is unresolved, any loaded
    artifact has schema errors, or any loaded artifact has no schema-validation
    result;
  - runs injected cross-artifact hooks only after loaded schema-valid inputs.
- [x] Add tests for diagnostic determinism, imported-origin preservation,
  unresolved-handle skipping, schema-failure skipping, missing-schema-validator
  skipping, cross-artifact hook gating, and avoiding local fixture/source-path
  identity authority.
- [x] Wire the package into root `build` and `test:unit` scripts.
- [x] Add the package to the dependency-fence layer map so future imports stay
  below runtime, renderer, and core layers.

## Still Open for Gate 3b Closure

- [ ] Promote the report JSON Schema or explicitly ratify a no-schema report
  contract in the ordered ADR 0153 schema step.
- [ ] Add real validator-owned cross-artifact checks, starting with
  spec-stable loaded-reference checks such as Surface slots to loaded
  Definitions, Experience units, Response Actions, and Data Sources.
- [ ] Represent ArtifactResolver and ModuleResolver outputs as concrete package
  inputs without duplicating their resolver logic.
- [ ] Add fixture-backed conformance after the implementation surface is stable.
- [ ] Wire at least one production consumer only after the shared validator
  output is sufficient and gate 3c is opened.

## Deviations

- 2026-05-24: Gate 3b is marked Partial, not Closed. The package is real shared
  extraction, but it is still a report kernel and hook boundary; it does not yet
  consolidate concrete cross-artifact invariant implementations from lint,
  studio-core, and v4.
- 2026-05-24: No report schema or generated types were added. That keeps this
  slice aligned with ADR 0153 ordering and the gate 3a prose contract.

## Partial Evidence

- Package: `packages/formspec-app-graph`.
- Public exports: `packages/formspec-app-graph/src/index.ts`.
- Report helpers: `packages/formspec-app-graph/src/report.ts`.
- Validator kernel: `packages/formspec-app-graph/src/validator.ts`.
- Tests: `packages/formspec-app-graph/tests/app-graph-validator.test.ts`.
- Workspace wiring: root `package.json` `build` and `test:unit`.
- Dependency fence wiring: `scripts/check-dep-fences.mjs`.
- Verification: `npm run --workspace @formspec-org/app-graph build`;
  `npm run --workspace @formspec-org/app-graph test`; `npm run check:deps`;
  `npm run test:unit`; `npm run docs:filemap:check`; `npm run docs:check`.

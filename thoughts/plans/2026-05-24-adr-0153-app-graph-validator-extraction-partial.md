# ADR 0153 AppGraphValidator Extraction Partial Plan

**ADR:** stack-root `thoughts/adr/0153-formspec-app-graph-production-boundary.md`
**Row:** AppGraphValidator extraction
**Status:** Partial; shared report kernel, report schema, generated report type, and first Component route-target checks extracted; broader validator-owned cross-artifact checks remain
**Owner:** Formspec app-graph follow-on lane

## Scope

Advance ADR 0153 gate 3b without claiming full extraction closure. This slice
creates a shared `@formspec-org/app-graph` package for the
`AppGraphValidator` request/report kernel, diagnostic normalization, phase
status derivation, imported diagnostic preservation, schema hook execution, and
cross-artifact hook gating.

Original kernel slice exclusions: report JSON Schema, generated types, concrete
production cross-artifact invariant implementations, ArtifactResolver
extraction, ModuleResolver extraction, lint/Studio/MCP/runtime/projection
consumers, or fine-grained authorization.

## Review Checkpoints

- 2026-05-24 architecture scout: APPROVE with Partial status. Required
  cautions: do not mark 3b Closed for a report-kernel-only package; keep report
  JSON Schema out of this slice; preserve imported diagnostic origins; do not
  port v4 coherence wholesale; root workspace build/test wiring must exercise
  the package.
- 2026-05-25 architecture scouts: REVISE to a built-in Component route-target
  validator only. Required cautions: keep ADR 0154 gate 5 Partial; limit fake
  `targetDefinition` rejection to objective graph evidence; keep Surface version
  checks exact-only unless a shared range policy lands; do not infer identity
  from source paths, filenames, URL suffixes, Surface ids, or route names; do not
  wire lint, Studio, MCP, runtime, projection, ArtifactResolver, or
  ModuleResolver consumers.
- 2026-05-25 architecture scout: APPROVE report schema as a narrow schema-step
  slice. Required cautions: schema only the `AppGraphValidationReport` output
  and nested report shapes; add no report timestamp/run id/discriminator,
  payload snapshots, rendered output, credentials, or cache contents; preserve
  imported diagnostic origins; keep `source` diagnostic-only; leave request,
  resolver, UI graph policy, runtime/projection, production consumers, and ADR
  0152 authorization out of scope; keep gate 3b Partial.

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
- [x] Add built-in Component route-target checks that run after loaded inputs
  pass schema validation:
  - resolve `targetSurfaceRoutes[].surface.url` against App Manifest
    `surfaces[]` and loaded Surface handles;
  - resolve route ids against matched Surface `routes[].id`;
  - resolve optional slot ids against matched route `slots[].id`;
  - detect duplicate `(surface, route, slot, role)` claims across Component
    membership handles, including singular `component` as `default`;
  - reject ref-less Component handles rather than guessing from source path,
    filename, document URL, or route names;
  - compare Surface versions only when both sides are exact SemVer pins;
  - reject fake `targetDefinition` only when the graph proves a non-form
    `definitions: []` app or an unmanifested/unloaded target Definition.
- [x] Export graph-wide Component node identity types and a deterministic
  `componentNodeIdentityKey()` helper without wiring Studio/kernel/provenance
  consumers.
- [x] Add focused package tests for positive route targets, unresolved routes,
  unresolved slots, duplicate claims, singular/default normalization, ref-less
  Component handles, limited fake `targetDefinition`, mixed route/form
  acceptance, exact-only version mismatch, range deferral, and node identity key
  scope.
- [x] Add `schemas/app-graph-validation-report.schema.json` for the existing
  `AppGraphValidationReport` output contract only.
- [x] Generate `@formspec-org/types` TypeScript for
  `AppGraphValidationReport`.
- [x] Add schema conformance tests for required report fields, diagnostic
  origins including imported and `x-*`, phase/status enums, and closed
  diagnostic source-pointer shape.
- [x] Update `specs/app-graph/app-graph-validator-spec.md` so it no longer says
  the report schema/generated type are absent.

## Still Open for Gate 3b Closure

- [ ] Broaden validator-owned cross-artifact checks beyond the initial
  Component route-target family, including Surface slots to loaded Definitions,
  Experience units, Response Actions, Data Sources, and UI graph policy.
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
- 2026-05-24: The initial report-kernel slice added no report schema or
  generated types. That kept the first extraction slice aligned with ADR 0153
  ordering and the gate 3a prose contract.
- 2026-05-25: ADR 0154 gate 5 remains Partial, not Closed. The shared validator
  now owns route-target checks, but full graph-wide node identity
  disambiguation, Studio/kernel identity, provenance, and source conformance
  fixtures remain outside this slice.
- 2026-05-25: Surface version compatibility is exact-only in this package until
  a shared SemVer/range policy lands. Range expressions are not false-rejected.
- 2026-05-25: The report schema slice does not add `$formspec...` marker,
  timestamp, run id, request shape, or consumer wiring. It schemas the current
  output contract only and keeps `source` as diagnostic evidence, not identity.

## Partial Evidence

- Package: `packages/formspec-app-graph`.
- Public exports: `packages/formspec-app-graph/src/index.ts`.
- Report helpers: `packages/formspec-app-graph/src/report.ts`.
- Validator kernel: `packages/formspec-app-graph/src/validator.ts`.
- Component route validator: `packages/formspec-app-graph/src/component-routes.ts`.
- Component node identity helper: `packages/formspec-app-graph/src/component-identity.ts`.
- Report schema: `schemas/app-graph-validation-report.schema.json`.
- Generated report type:
  `packages/formspec-types/src/generated/app-graph-validation-report.ts`.
- Report schema tests:
  `tests/conformance/schemas/test_app_graph_validation_report_schema.py`.
- Tests: `packages/formspec-app-graph/tests/app-graph-validator.test.ts`.
- Component route tests:
  `packages/formspec-app-graph/tests/component-route-validator.test.ts`.
- Workspace wiring: root `package.json` `build` and `test:unit`.
- Dependency fence wiring: `scripts/check-dep-fences.mjs`.
- Verification: `npm run --workspace @formspec-org/app-graph build`;
  `npm run --workspace @formspec-org/app-graph test`; `npm run check:deps`;
  `npm run test:unit`; `npm run docs:filemap:check`; `npm run docs:check`.

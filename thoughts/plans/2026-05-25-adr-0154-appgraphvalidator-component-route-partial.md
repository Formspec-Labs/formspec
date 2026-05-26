# ADR 0154 AppGraphValidator Component Route Partial

**Date:** 2026-05-25
**Status:** Partial
**Gate:** ADR 0154 gate 5; ADR 0153 gates 3b and 8 partial
**Owner:** Formspec app-graph rollout

## Scope

This slice adds the first built-in Component route-target checks to
`@formspec-org/app-graph`. It is an extraction slice only: it validates already
loaded, schema-valid handles and does not fetch artifacts, extract
`ArtifactResolver`, extract `ModuleResolver`, or wire lint, Studio, MCP,
runtime, or projection consumers.

## Review Checkpoint

Two architecture reviews returned REVISE with the same boundary:

- implement built-in Component route-target checks in the shared validator, not
  only another injected hook;
- keep ADR 0154 gate 5 Partial because full node identity disambiguation,
  Studio/kernel identity, provenance, and source conformance remain open;
- limit fake `targetDefinition` rejection to objective graph evidence;
- compare Surface versions only for exact SemVer pins until a shared range
  policy exists;
- build identity from App Manifest refs and loaded handles, never source paths,
  filenames, URL suffixes, Surface ids, or route names.

A source-conformance phase-boundary review approved adding fixture evidence for
the existing validator behavior only. Required constraints: model already
loaded, schema-valid graph inputs; keep membership authority in App Manifest
`component` / `components[]` refs plus loaded handle `ref`; omit loaded handles
for unloaded Surface/Definition cases so cross-artifact validation still runs;
assert diagnostics, source pointers, related sources, details, summary counts,
and completed cross-artifact phase status; keep `componentNodeIdentityKey()` as
helper-unit coverage, not report conformance.

A follow-on architecture checkpoint approved ADR 0154 rule 9 as the next strict
slice and rejected graph-wide node identity as premature executable validation.
Boundary: detect authored `bind` fields in `document.tree` only; require
`targetDefinition` for route-bound Components with bound controls; require each
resolved target route to contain a URL-matching `definition-form` slot; skip
cascade diagnostics when the target Definition or route is unresolved; defer
explicit graph binding, Definition id aliases, bind-key validation, TraceIndex,
runtime, Studio/kernel identity, and provenance.

A later semi-formal architecture checkpoint approved the narrowed graph-wide
node identity slice once route-target and route-bound Definition-context checks
had landed. Boundary: keep the work validator-owned; derive route-scoped
`nodePath` from loaded, schema-valid Component trees using `nodeId`, then
`bind`, then `id`; use JSON Pointers only as diagnostic sources; emit missing
segment, ambiguous sibling segment, and duplicate constructed graph-wide
identity diagnostics; keep Studio/kernel graph identity, provenance, runtime,
and consumer wiring out of scope.

## Completed

- `validateAppGraph()` now always runs the built-in Component route-target
  checker after loaded inputs pass schema validation.
- Component route targets resolve `surface.url` against App Manifest
  `surfaces[]` and loaded Surface handles.
- Route targets resolve `route` against the matched Surface `routes[].id`.
- Slot targets resolve optional `slot` against the matched route `slots[].id`.
- Duplicate `(surface, route, slot, role)` claims are rejected across Component
  membership handles, including singular `component` normalized as `default`.
- Loaded Component handles without App Manifest `ref.url` are rejected instead
  of inferred from document URL, local source, filename, or route names.
- Surface version mismatch is diagnosed only when both target and candidate pins
  are exact SemVer values.
- Fake `targetDefinition` rejection is limited to non-form graph evidence,
  unmanifested target Definitions, or unloaded target Definitions.
- Route-bound Components with bound controls now require `targetDefinition`, and
  resolved target routes must carry a `definition-form` slot whose
  `binding.definitionRef` exactly matches `targetDefinition.url`.
- Component node identity diagnostics now require stable route-scoped nodePath
  segments (`nodeId`, then `bind`, then `id`), reject ambiguous sibling
  segments, and reject duplicate constructed graph-wide identity keys across
  resolved route targets.
- `componentNodeIdentityKey()` and graph-wide node identity types are exported
  and used by the validator-owned duplicate identity check.
- Source conformance fixtures now exercise the existing Component route-target
  validator, URL-based route-bound-control Definition context, and Component
  node identity diagnostics against already-loaded, schema-valid graph handles.

## Still Open

- Studio/kernel operations using graph-wide identity for multi-Surface and
  multi-Component apps.
- `x-generation.copiedFrom` / `movedFrom` provenance using graph-wide node
  identity.
- Graph-wide copy provenance fixtures.
- Consumer wiring for lint, Studio, MCPs, runtime, and projection.

## Deviations

- ADR 0154 remains Partial even though the shared validator now covers
  route-target, route-bound Definition-context, and node-identity diagnostics.
  Studio/kernel graph-wide operations and provenance remain separate open gates.
- No SemVer range evaluator was introduced. Exact SemVer mismatches fail closed;
  range compatibility remains deferred rather than guessed.
- No resolver extraction was introduced. Tests pass explicit
  `ResolvedArtifactHandle` inputs that model the resolver output needed by this
  validator slice.
- Source conformance fixtures cover route-target resolution and the URL-based
  route-bound-control Definition-context rule only. They do not claim
  Studio/kernel identity, provenance, production consumers, or ADR 0154 gate
  closure.
- Explicit graph binding remains deferred. In-bundle Definition id/name alias
  matching was rejected in the parent closure plan; this slice compares
  route-local `definition-form.binding.definitionRef` against
  `targetDefinition.url` only.

## Closure Evidence

- Package code:
  `packages/formspec-app-graph/src/component-routes.ts`,
  `packages/formspec-app-graph/src/component-identity.ts`, and
  `packages/formspec-app-graph/src/validator.ts`.
- Public exports: `packages/formspec-app-graph/src/index.ts`.
- Tests:
  `packages/formspec-app-graph/tests/component-route-validator.test.ts` and
  `packages/formspec-app-graph/tests/component-route-conformance.test.ts`.
- Fixtures:
  `tests/conformance/fixtures/app-graph-validator/component-route-targets.case.json`.
- Fixture integrity:
  `tests/conformance/test_app_graph_component_route_fixture_corpus.py`.
- Specs:
  `specs/component/component-spec.md` and
  `specs/app-graph/app-graph-validator-spec.md`.

## Verification

- `npm run --workspace @formspec-org/app-graph build`
- `npm run --workspace @formspec-org/app-graph test -- component-route-validator.test.ts component-route-conformance.test.ts`
- `npm run --workspace @formspec-org/app-graph test`
- `python -m pytest tests/conformance/test_app_graph_component_route_fixture_corpus.py tests/conformance/schemas/test_app_graph_validation_report_schema.py tests/unit/test_contract_surface_coverage.py -q`
- `node scripts/generate-spec-artifacts.mjs --check`
- `npm run docs:check`
- `git diff --check`

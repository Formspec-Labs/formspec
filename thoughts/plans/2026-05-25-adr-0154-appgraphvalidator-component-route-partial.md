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
- `componentNodeIdentityKey()` and graph-wide node identity types are exported
  as preparatory API only.

## Still Open

- Full graph-wide Component node identity disambiguation.
- Studio/kernel operations using graph-wide identity for multi-Surface and
  multi-Component apps.
- `x-generation.copiedFrom` / `movedFrom` provenance using graph-wide node
  identity.
- Source conformance fixtures for positive route Components, unresolved route,
  unresolved slot, duplicate route claim, fake targetDefinition shim, and
  graph-wide copy provenance.
- Consumer wiring for lint, Studio, MCPs, runtime, and projection.

## Deviations

- Gate 5 is Partial, not Closed. This slice closes the route-target core but not
  full node identity disambiguation.
- No SemVer range evaluator was introduced. Exact SemVer mismatches fail closed;
  range compatibility remains deferred rather than guessed.
- No resolver extraction was introduced. Tests pass explicit
  `ResolvedArtifactHandle` inputs that model the resolver output needed by this
  validator slice.

## Closure Evidence

- Package code:
  `packages/formspec-app-graph/src/component-routes.ts`,
  `packages/formspec-app-graph/src/component-identity.ts`, and
  `packages/formspec-app-graph/src/validator.ts`.
- Public exports: `packages/formspec-app-graph/src/index.ts`.
- Tests:
  `packages/formspec-app-graph/tests/component-route-validator.test.ts`.

## Verification

- `npm run --workspace @formspec-org/app-graph test`
- `npm run --workspace @formspec-org/app-graph build`

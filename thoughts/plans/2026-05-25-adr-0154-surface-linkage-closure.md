# ADR 0154 Surface Linkage Closure

**Date:** 2026-05-25
**Status:** Closed
**Gate:** ADR 0154 gate 4; ADR 0153 gate 8 partial
**Owner:** Formspec app-graph rollout

## Scope

This slice links Surface prose to Component 1.2 route targeting. It closes only
the Surface linkage gate.

It does not add Surface `componentRefs`, Surface-owned Component mount tables,
Surface schema fields, AppGraphValidator enforcement, Studio/kernel identity,
provenance, runtime/projection wiring, or ADR 0152 authorization semantics.

## Review Checkpoint

Leibniz approved a Surface-spec prose linkage slice after App Manifest v2.2
Component membership closure. The review boundary was:

- update Surface prose directly, not by making the spec depend on ADR text;
- state that Component `targetSurfaceRoutes[]` may target Surface routes and
  optional slot ids;
- keep Surface source truth limited to route ids, paths, slot bindings,
  embed-route edges, and transitions;
- leave Component membership to App Manifest `components[]`;
- leave route resolution, duplicate route-claim checks, fake Definition
  rejection, and graph-wide node identity to AppGraphValidator;
- avoid any Surface schema change unless an actual contradiction is found.

## Completed

- Surface BLUF now states that Component 1.2 `targetSurfaceRoutes[]` may point at
  Surface routes and optional slot ids.
- Surface spec now says Surface provides only the route/slot namespace for those
  external Component claims.
- Surface spec now rejects Surface-owned Component membership or selection
  decisions.
- Surface conformance now keeps Component target resolution in app-graph
  validation rather than Surface-local validation.
- A focused conformance test pins the prose boundary.

## Still Open

- AppGraphValidator target resolution, duplicate route-claim diagnostics, fake
  Definition rejection, and node identity disambiguation.
- Studio/kernel graph identity for multi-Surface and multi-Component editing.
- Graph-wide provenance for cross-route and cross-Component copy/move.
- ADR 0154 conformance corpus closure.

## Deviations

- No Surface schema change was made. The existing schema already owns only
  Surface routes/slots/transitions and has no Component membership field to
  revise.
- Specs define the rule directly. ADR references remain in this plan and the
  parent rollup as rollout/deviation evidence, not as normative spec
  dependencies.

## Closure Evidence

- Spec: `specs/surface/surface-spec.md` defines Component route targeting as an
  external claim over Surface route/slot ids.
- Generated docs: Surface BLUF and LLM artifacts carry the same boundary.
- Tests: `tests/conformance/spec/test_surface_contract.py` pins the
  Surface-linkage prose and the no-ownership boundary.

## Verification

- `python -m pytest tests/conformance/spec/test_surface_contract.py`
- `npm run docs:generate`
- `npm run docs:check`
- `git diff --check`

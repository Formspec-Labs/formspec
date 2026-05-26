# ADR 0153 Runtime Ownership Closure Plan

**Date:** 2026-05-26
**Row:** ADR 0153 gate 7 Runtime ownership
**Status:** Partial; prose ownership contract and source conformance pins landed,
production runtime consumers remain open
**Authority:** stack rollup
[`2026-05-24-adr-0150-followons-and-gating.md`](../../../thoughts/2026-05-24-adr-0150-followons-and-gating.md),
ADR 0153 §§5, 7, 9, Surface spec, Core Response spec, Response Actions spec,
and AppGraphValidator spec

## Goal

Close the ambiguity that v4 spike F6 exposed without promoting the spike
Runtime Plan schema or moving runtime behavior into AppGraphValidator. The
production contract separates four owners:

1. Surface route state: active Surface route, route params, and navigation
   transitions.
2. Session state: actor/session authentication and respondent/collaborator
   context.
3. Response instance state: Response data, status, validation snapshot, and
   pinned Definition tuple.
4. Response Actions invocation state: action id, invocation id, validation
   tuple, effect trace, idempotency/replay, and terminal outcome.

## Ordered Work

### Phase 1 - Prose Ownership Contract

- [x] Add Surface runtime route-state ownership language.
- [x] Add Core Response instance ownership language.
- [x] Add Response Actions invocation/effect ownership language.
- [x] Add App Manifest session-index language that keeps session identity
  separate from route, Response, and invocation state.
- [x] Add AppGraphValidator negative boundary language forbidding Runtime Plan
  synthesis, route selection, session creation, Response creation, action
  execution, and hidden-state runtime inference.

### Phase 2 - Source Conformance Pins

- [x] Add focused source conformance checks that pin the four owner boundaries.
- [x] Keep the checks prose-backed. Do not add a Runtime Plan schema, fixture
  discriminator, or executable runtime planner.

### Phase 3 - Production Runtime Consumer Wiring

- [ ] Wire a production runtime host that carries explicit route/session/
  Response/action invocation bindings through draft creation, action invocation,
  and route transition.
- [ ] Add runtime integration tests for ambiguous multi-form routes, route-param
  selected Response instances, and hidden Definition draft/action rejection only
  after the production runtime consumes schema-valid UI Graph Policy evidence.

## Deviations

- 2026-05-26: This slice intentionally stops at prose and source conformance
  pins. The v4 spike Runtime Plan remains evidence only; no `runtimePlan`
  artifact, schema slot, AppGraphValidator phase, or server route was promoted.
- 2026-05-26: Hidden Definition runtime behavior remains a production runtime
  gate. UI Graph Policy and AppGraphValidator hidden-Definition checks prove
  graph policy only, not draft/action rejection.
- 2026-05-26: Hegel approved this as a source-contract/conformance slice, not
  production runtime wiring, and required session state to stay out of Surface
  navigation ownership. The slice added an App Manifest session-index anchor
  rather than making AppGraphValidator or Surface own session identity.

## Closure Evidence

Partial evidence landed:

- Surface route owner:
  `specs/surface/surface-spec.md` §5.1.
- Response instance owner:
  `specs/core/spec.md` §2.1.6 Response Instance Ownership.
- Response Actions invocation owner:
  `specs/response-actions/response-actions-spec.md` §7.1.
- Session identity anchor:
  `specs/bundle/app-manifest-spec.md` §5.5.
- AppGraphValidator negative boundary:
  `specs/app-graph/app-graph-validator-spec.md` §6.
- Source conformance pin:
  `tests/conformance/spec/test_runtime_ownership_contract.py`.

Still open:

- Production runtime host wiring with explicit route/session/Response/action
  bindings.
- Runtime hidden-state behavior for hidden route-local Definition slots.
- Any conformance that depends on a real runtime consumer rather than source
  specs.

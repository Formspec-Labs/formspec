# ADR 0153 Runtime Ownership Closure Plan

**Date:** 2026-05-26
**Row:** ADR 0153 gate 7 Runtime ownership
**Status:** Partial; prose ownership contract, source conformance pins, and a
browser/live production-consumer checkpoint landed; route-param, ambiguous-route,
and route-transition coverage remain open
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

- [x] Add a browser/live `formspec-web` checkpoint that carries explicit
  Surface route metadata, anonymous session identity, Response draft/submit
  state, and Response Action invocation into live server/Trellis append evidence.
- [x] Prove hidden route-local Definition rejection in that same browser/live
  consumer after it consumes completed UI Graph Policy and Component graph host
  evidence, before draft, submit, capability, or append work.
- [ ] Add route-transition coverage for the production runtime host.
- [ ] Add runtime integration tests for ambiguous multi-form routes and
  route-param selected Response instances.

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
- 2026-05-26: The browser/live checkpoint uses `formspec-web` production
  composition plus Playwright-routed managed-scope and trusted/BFF capability
  boundaries. That is valid evidence for the runtime consumer path, but it is
  not a deployable host/BFF capability provider and does not add ADR 0152
  authorization semantics.

## Closing Observation

The first production-consumer observation is landed: `formspec-web` publishes a
runtime payload with Component graph and UI Graph Policy host evidence, renders
route metadata in the real browser runtime, carries one anonymous session
identity through draft/submit/capability/append, appends to the live
server/Trellis substrate, and rejects a hidden active Definition before draft or
Response Action work. The row remains Partial until route transitions,
route-param selected Response instances, and ambiguous multi-form routes are
covered.

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
- Browser/live production-consumer pin:
  `../formspec-web/tests/e2e/response-action-ledger-live.spec.ts`.
- Verification:
  `cd ../formspec-web && npm run typecheck`;
  `cd ../formspec-web && npx eslint tests/e2e/response-action-ledger-live.spec.ts`;
  `cd ../formspec-web && npx playwright test tests/e2e/response-action-ledger-live.spec.ts`;
  `cd ../formspec-web && FORMSPEC_WEB_LIVE_FORMSPEC_SERVER_URL=http://127.0.0.1:8080 npx playwright test tests/e2e/response-action-ledger-live.spec.ts`.

Still open:

- Route-transition coverage in the production runtime host.
- Ambiguous multi-form route coverage.
- Route-param selected Response instance coverage.
- Deployable host/BFF capability provider if this evidence is used to close the
  Response Actions deployable production wiring remainder.

# ADR 0153 Response Actions Runtime Closure Plan

**Date:** 2026-05-24
**Row:** Response Actions executor / runtime
**Status:** Partial; invocation engine, Studio Ledger bridge, server capability mint,
public web respondent-host factory, and live server/Trellis respondent-invoker
checkpoint landed; the browser ActionButton live proof landed through a
test-routed trusted/BFF capability boundary; deployable host/BFF wiring and the
remaining route-transition / route-param selected Response runtime ownership
coverage remain open
**Authority:** stack rollup
[`2026-05-24-adr-0150-followons-and-gating.md`](../../../thoughts/2026-05-24-adr-0150-followons-and-gating.md),
ADR 0153 §§4, 6, 7, 9, Response Actions spec §§7, 11-12,
studio-core kernel API and Ledger boundary notes

## Goal

Close ADR 0153 gate 6b without moving action execution into Surface,
Component, AppGraphValidator, or ADR 0152 authorization. The runtime closure
path is:

1. Use the existing engine `invokeResponseAction` helper as the only executor.
2. Record action lifecycle, terminal state, and durable effect observations as
   host-owned semantic ops.
3. Aggregate those observations into a `SessionOpBatch`.
4. Append the batch through the existing `appendSessionOpBatch` /
   host-injected `LedgerPort` boundary.
5. Keep route state, session state, Response instance state, and Response
   Action invocation state testably separate before claiming ADR 0153 gate 7.

## Current Evidence

- `packages/formspec-engine/src/response-actions.ts` already owns action
  resolution, validation tuple selection, precondition handling, blocking,
  durable idempotency, replay, retry, terminal states, and action lifecycle
  callbacks.
- `tests/conformance/spec/test_response_actions_runtime.py` already exercises
  the source fixture corpus for the Response Actions runtime contract.
- `../formspec-studio/packages/formspec-studio-core/src/kernel/StudioCoreKernel.ts`
  defines `SessionOpBatch`, `LedgerAppendInput`, `LedgerPortAppendInput`, and
  `LedgerPort`.
- `../formspec-studio/packages/formspec-studio-core/src/kernel/ProposalManagerFacade.ts`
  validates session membership, context actor/session binding, branch binding,
  op-batch hash presence, host `LedgerPort` receipts, idempotent retry, and
  offline-unanchored diagnostics.
- `../formspec-studio/packages/formspec-studio-core/src/response-action-ledger.ts`
  now provides the host-owned bridge from engine invocation observations to
  `SessionOpBatch` append.
- `../formspec-server/tests/e2e-http/response-action-ledger.spec.ts` and
  `../formspec-server/tests/e2e-http/support/response-action-respondent.ts`
  now prove a managed-single-cell live checkpoint: the sibling `formspec-web`
  HTTP respondent invoker posts to actual server mint/append routes, receives a
  Trellis-shaped anchored receipt, replays the exact same command through
  StudioCore's HTTP `LedgerPort`, and observes the same anchored ledger subset
  through `readLedgerStatus`.
- `../formspec-web/tests/e2e/response-action-ledger-live.spec.ts` now proves a
  browser managed-single-cell live checkpoint: the public `RespondentRuntime`
  loads production runtime config, injects the React submit `ActionButton`,
  obtains a per-command capability through a test-routed trusted/BFF boundary,
  posts the append command to actual `formspec-server` mint/append routes, and
  asserts Trellis-shaped receipt evidence plus one anonymous session identity
  and `ledgerScope` binding across session creation, drafts, submit, capability
  mint, and ledger append. The same browser/live proof now carries
  host-supplied Component graph and UI Graph Policy evidence, renders active
  route metadata, and rejects hidden active Definition evidence before draft,
  submit, capability, or append work.

## Review Checkpoints

- 2026-05-25 pre-implementation architecture review: APPROVE option A with a
  wording correction. Findings: do not claim the runtime invocation engine is
  missing; it exists in `invokeResponseAction`. The real open gap was the
  Studio/product ownership bridge that records lifecycle/durable-effect
  observations into `SessionOpBatch` and calls the host LedgerPort boundary.
  Keep AppGraphValidator and ADR 0152 out of this row. Keep ADR 0153 gate 7
  separate until runtime ownership boundaries are specified and tested.
- 2026-05-26 plan-alignment architecture review: APPROVE updating this plan to
  record the managed-single-cell live server/Trellis respondent-invoker
  checkpoint. Findings: keep ADR 0153 gate 6b Partial; call the proof
  exact-command replay through live routes; do not claim a single
  product/browser ActionButton runtime path, passive Studio polling, or ADR 0153
  gate 7 closure.
- 2026-05-26 browser-live checkpoint reviews: no residual BLOCKER/HIGH/MED
  findings after absorption. Findings addressed before commit: add exact
  request-count assertions, compare minted capability to append header, assert
  browser-originated requests do not carry mint-authority HMAC, and align the
  rollup table with the bounded deployable-BFF/runtime-ownership remainder.
- 2026-05-26 runtime-ownership browser/live scout: `formspec-web` is the
  smallest valid real-consumer target; hidden-state rejection can be proven in
  the same consumer without promoting Runtime Plan, URL-convention action
  lookup, Surface/Component action inference, or ADR 0152 authorization.

## Ordered Work

### Phase 1 — Status Correction

- [x] Correct the stale "runtime invocation engine remains" wording in the
  ADR 0153 gate and stack rollup.
- [x] Record that `invokeResponseAction` plus conformance fixtures are current
  executor evidence.
- [x] Keep the row Partial until production consumers and Trellis-backed
  LedgerPort injection are wired.

### Phase 2 — Host-Owned Ledger Bridge

- [x] Add a Studio bridge that wraps `invokeResponseAction`.
- [x] Fan out `recordActionLifecycle` so hosts can still observe lifecycle
  callbacks while the bridge records semantic ops.
- [x] Exclude transient `hostEvent` effects from durable effect semantic ops.
- [x] Record durable effect outcomes with effect type, status, idempotency key,
  outcome reference, replay token, and reason when present.
- [x] Record the terminal invocation state separately from durable effect
  outcomes so blocked, deferred, and failed paths do not collapse together.
- [x] Build a `SessionOpBatch`, compute a canonical JCS SHA-256 batch hash, and
  call `appendSessionOpBatch`.

### Phase 3 — Focused Tests

- [x] Prove a completed transient host event appends lifecycle/result semantic
  ops but no durable `hostEvent` effect op.
- [x] Prove replay lifecycle and durable effect idempotency keys are preserved.
- [x] Prove blocked, deferred, and failed terminal ownership states remain
  distinct in the semantic ops and still append through the Ledger boundary.
- [x] Re-run studio-core build and focused tests.

### Phase 4 — Production Consumer Wiring

- [x] Add a public async `<formspec-render>.responseActionInvoker` hook so
  product hosts can route `ActionButton` clicks through the bridge without
  coupling the public web component to studio-core.
- [x] Add React `FormspecProvider.responseActionInvoker` parity so React hosts
  can route `ActionButton` clicks through the same host-owned invoker seam as
  the web component.
- [x] Sync the loaded Response Actions document into Studio Preview's
  `<formspec-render>` host.
- [x] Add a renderer-level seam test that injects a fake host `LedgerPort`,
  records a session, routes an `ActionButton` click through
  `invokeResponseActionWithLedger`, and observes an anchored receipt.
- [x] Add a host-owned HTTP `LedgerPort` adapter that posts StudioCore
  `LedgerPortAppendInput` to the `formspec-server`
  `/runtime/response-actions/ledger/session-op-batches` route with a
  server-minted per-command capability header.
- [x] Let Studio Preview receive a host-owned `responseActionInvoker` and prove
  an `ActionButton` click can flow through `invokeResponseActionWithLedger` to
  the route-backed HTTP `LedgerPort` adapter and back into `readLedgerStatus`.
- [x] Add a `formspec-server` runtime capability mint route that authenticates
  the anonymous respondent session, requires trusted host/BFF mint-authority
  HMAC proof, validates the append command, binds `ledgerScope` to
  `urn:formspec:session:<session_id>`, and returns the server-minted append
  capability.
- [x] Add a `formspec-web` respondent-runtime host factory that wraps the real
  React ActionButton path, builds the Response Actions `SessionOpBatch`,
  derives the server-validated op-batch hash and idempotency key, obtains a
  per-command capability through a trusted/BFF provider, and posts the same
  command to the append route shape without exposing mint HMAC material to the
  browser runtime.
- [x] Add a managed-single-cell live proof that composes the sibling
  `formspec-web` HTTP respondent invoker with actual server mint/append routes,
  verifies Trellis-shaped receipt evidence, replays the exact web-produced
  command through StudioCore's HTTP `LedgerPort`, and proves
  `readLedgerStatus` records the same anchored ledger subset.
- [x] Add a browser managed-single-cell live proof that drives the public
  `RespondentRuntime` React submit `ActionButton` through production runtime
  config, a trusted/BFF capability provider, actual server-side capability
  minting, actual server/Trellis append, and Trellis-shaped receipt assertions.
- [x] Extend that browser/live proof with host-supplied Component graph and
  UI Graph Policy evidence so the real runtime emits active route metadata and
  rejects hidden active Definition evidence before draft, submit, capability, or
  append work.
- [ ] Replace the Playwright-routed trusted/BFF and managed-scope harness with
  a deployable host/BFF capability provider.
- [ ] Keep ADR 0153 gate 7 open until route-transition and route-param
  selected Response coverage lands.

## Deviations

- 2026-05-25: The rollup/ADR wording treated "runtime invocation engine" as
  open. Live code shows the engine helper is already present, so this slice
  corrected status and landed the missing Ledger bridge instead.
- 2026-05-25: The bridge lives in studio-core, not formspec-engine, because
  the engine owns execution semantics while Studio owns the host Ledger append
  boundary. This preserves the dependency direction.
- 2026-05-25: No AppGraphValidator hook was added. Validation reports may name
  Response Actions references, but invocation, replay, effects, and Ledger
  append remain runtime/Ledger responsibilities.
- 2026-05-25: The public renderer seam is a host invoker hook, not a
  studio-core dependency. Studio/product hosts own Ledger authority; the
  webcomponent remains the renderer/runtime adapter.
- 2026-05-25: A test colocated with Studio Preview uses a raw
  `<formspec-render>` plus fake host `LedgerPort` to prove the renderer seam.
  It is anchored-mode proof for the bridge hook, not evidence that Studio
  Preview installs an invoker or that a production Trellis-backed port exists.
- 2026-05-26: The first route-backed Preview slice uses a host-supplied
  capability provider. Browser-side capability minting remains forbidden; the
  production respondent host still needs a server-side mint/proxy boundary that
  authenticates the runtime session before appending.
- 2026-05-26: `formspec-server` now owns the server-side mint route. The route
  authenticates the anonymous runtime session, requires trusted host/BFF
  mint-authority HMAC proof, and binds the requested `ledgerScope` to the
  verified session before returning a capability. This does not close production
  runtime wiring because the respondent host still must call the mint route and
  inject the route-backed Trellis `LedgerPort` into the real invoker path.
- 2026-05-26: `formspec-web` now owns a public respondent-runtime host factory
  and React `responseActionInvoker` injection path. This proves the real React
  `RespondentRuntime` ActionButton path can call a trusted/BFF capability
  provider and append route, but the test uses a mocked route transport. It does not
  prove actual `formspec-server`/Trellis append or Studio `readLedgerStatus`
  observation on that same respondent path.
- 2026-05-26: The managed-single-cell live proof uses exact-command replay: the
  sibling `formspec-web` HTTP respondent invoker produces the append command
  against actual `formspec-server` mint/append routes, then StudioCore replays
  that same command through its HTTP `LedgerPort`. This proves live
  server/Trellis append plus Studio `readLedgerStatus` observation of the same
  anchored ledger subset. It is not passive Studio polling, and it is not yet a
  single browser ActionButton runtime path.
- 2026-05-26: The browser managed-single-cell proof now drives the real public
  `RespondentRuntime` React submit `ActionButton` against the live server mint
  and append routes. It keeps mint HMAC material inside a Playwright-routed
  trusted/BFF handler, asserts that browser-originated requests do not carry the
  mint-authority header, and checks Trellis-shaped receipt evidence. This lands
  the browser ActionButton live checkpoint, but it is not a deployable BFF.
- 2026-05-26: The browser/live proof now also lands the first ADR 0153 gate 7
  production-consumer checkpoint. It uses host-supplied Component graph and UI
  Graph Policy evidence to render active route metadata and reject hidden active
  Definition evidence before draft or Response Action work. Gate 7 remains
  Partial because route-transition and route-param selected Response coverage
  remain open. The follow-on runtime-ownership slice landed ambiguous
  multi-form-route rejection as selected Definition binding evidence, not
  selected Response closure.
- 2026-05-25: No ADR 0152 authorization fields were added or inferred.

## Closure Evidence

Partial for ADR 0153 gate 6b.

- Runtime executor: `packages/formspec-engine/src/response-actions.ts`
  `invokeResponseAction`.
- Studio bridge:
  `../formspec-studio/packages/formspec-studio-core/src/response-action-ledger.ts`.
- Canonical digest helper:
  `../formspec-studio/packages/formspec-studio-core/src/canonical-digest.ts`.
- Tests:
  `../formspec-studio/packages/formspec-studio-core/tests/response-action-ledger.test.ts`.
- Package surface: `@formspec-org/studio-core@0.8.0` exports
  `invokeResponseActionWithLedger` and response-action semantic-op types.
- Public renderer seam:
  `packages/formspec-webcomponent/src/action-invocation.ts`,
  `packages/formspec-webcomponent/src/element.ts`, and
  `packages/formspec-webcomponent/tests/components/interactive-plugins.test.ts`.
- React renderer seam:
  `packages/formspec-react/src/context.tsx`,
  `packages/formspec-react/src/node-renderer.tsx`, and
  `packages/formspec-react/tests/renderer.test.tsx`.
- Studio Preview document sync and renderer seam proof:
  `../formspec-studio/packages/formspec-studio/src/workspaces/preview/FormspecPreviewHost.tsx`
  and
  `../formspec-studio/packages/formspec-studio/tests/workspaces/preview/preview-tab.test.tsx`.
- Route-backed host adapter:
  `../formspec-studio/packages/formspec-studio-core/src/response-action-ledger-http-port.ts`.
- Server-side capability mint and append authority:
  `../formspec-server/crates/formspec-server/src/services/action_ledger.rs`,
  `../formspec-server/crates/formspec-server/src/services/responses.rs`,
  `../formspec-server/crates/formspec-server/src/routes.rs`, and
  `../formspec-server/crates/formspec-server/src/api/openapi_registry.rs`.
- Preview host injection:
  `../formspec-studio/packages/formspec-studio/src/workspaces/preview/FormspecPreviewHost.tsx`
  and
  `../formspec-studio/packages/formspec-studio/src/workspaces/preview/PreviewTab.tsx`.
- Server mint tests:
  `../formspec-server/crates/formspec-server/tests/in_process_trellis_action_ledger.rs`
  and
  `../formspec-server/crates/formspec-server/tests/openapi_contract.rs`.
- Public web respondent host factory and runtime injection:
  `../formspec-web/src/adapters/http/response-action-ledger.ts`,
  `../formspec-web/src/ports/response-action-ledger.ts`,
  `../formspec-web/src/app/RespondentRuntime.tsx`, and
  `../formspec-web/tests/app/respondent-runtime.test.tsx`.
- Managed-single-cell live respondent-invoker proof:
  `../formspec-server/tests/e2e-http/response-action-ledger.spec.ts` and
  `../formspec-server/tests/e2e-http/support/response-action-respondent.ts`.
- Browser managed-single-cell live ActionButton proof:
  `../formspec-web/tests/e2e/response-action-ledger-live.spec.ts`.
- Verification:
  `npm run --workspace @formspec-org/studio-core build`;
  `npm run --workspace @formspec-org/studio-core test -- tests/response-action-ledger.test.ts`;
  `npm run --workspace @formspec-org/studio-core test -- tests/response-action-ledger-http-port.test.ts`;
  `npm run --workspace @formspec-org/webcomponent build`;
  `npm run --workspace @formspec-org/webcomponent test -- tests/components/interactive-plugins.test.ts`;
  `npm run --workspace @formspec-org/studio test -- tests/workspaces/preview/preview-tab.test.tsx`;
  `npm run --workspace @formspec-org/studio build`;
  `cargo nextest run -p formspec-server --test openapi_contract`;
  `cargo nextest run -p formspec-server --test in_process_trellis_action_ledger`.
- Verification: `npm --prefix ../formspec-web run typecheck`;
  `npm --prefix ../formspec-web test -- tests/app/respondent-runtime.test.tsx`;
  `npm --prefix ../formspec-web run build`;
  `npm --prefix . run build --workspace @formspec-org/react`;
  `npm --prefix . run test --workspace @formspec-org/react`.
- Verification:
  `npm run test:e2e:live -- tests/e2e-http/response-action-ledger.spec.ts`;
  `npm run test:e2e -- tests/e2e-http/response-action-ledger.spec.ts`.
- Verification:
  `npm --prefix ../formspec-web run typecheck`;
  `cd ../formspec-web && npx eslint tests/e2e/response-action-ledger-live.spec.ts`;
  `cd ../formspec-web && npx playwright test tests/e2e/response-action-ledger-live.spec.ts`;
  `cd ../formspec-web && FORMSPEC_WEB_LIVE_FORMSPEC_SERVER_URL=http://127.0.0.1:8080 npx playwright test tests/e2e/response-action-ledger-live.spec.ts`.

Not closed yet: the browser proof still uses Playwright route interception as
the trusted/BFF capability provider and managed-scope injector. Closure requires
a deployable host/BFF capability provider. ADR 0153 gate 7 remains Partial until
route-transition and route-param selected Response coverage lands.

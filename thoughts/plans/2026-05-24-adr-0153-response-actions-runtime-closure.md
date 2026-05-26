# ADR 0153 Response Actions Runtime Closure Plan

**Date:** 2026-05-24
**Row:** Response Actions executor / runtime
**Status:** Partial; invocation engine and Studio Ledger bridge landed, production runtime consumers remain
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

## Review Checkpoints

- 2026-05-25 pre-implementation architecture review: APPROVE option A with a
  wording correction. Findings: do not claim the runtime invocation engine is
  missing; it exists in `invokeResponseAction`. The real open gap was the
  Studio/product ownership bridge that records lifecycle/durable-effect
  observations into `SessionOpBatch` and calls the host LedgerPort boundary.
  Keep AppGraphValidator and ADR 0152 out of this row. Keep ADR 0153 gate 7
  separate until runtime ownership boundaries are specified and tested.

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
- [ ] Wire production host/runtime configuration to supply the real
  Trellis-backed `LedgerPort`, server-side capability mint/proxy, and
  bridge-backed invoker.
- [ ] Keep ADR 0153 gate 7 open until route state, session state, Response
  instance state, and invocation state are separately specified and tested.

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
- Studio Preview document sync and renderer seam proof:
  `../formspec-studio/packages/formspec-studio/src/workspaces/preview/FormspecPreviewHost.tsx`
  and
  `../formspec-studio/packages/formspec-studio/tests/workspaces/preview/preview-tab.test.tsx`.
- Route-backed host adapter:
  `../formspec-studio/packages/formspec-studio-core/src/response-action-ledger-http-port.ts`.
- Preview host injection:
  `../formspec-studio/packages/formspec-studio/src/workspaces/preview/FormspecPreviewHost.tsx`
  and
  `../formspec-studio/packages/formspec-studio/src/workspaces/preview/PreviewTab.tsx`.
- Verification:
  `npm run --workspace @formspec-org/studio-core build`;
  `npm run --workspace @formspec-org/studio-core test -- tests/response-action-ledger.test.ts`;
  `npm run --workspace @formspec-org/studio-core test -- tests/response-action-ledger-http-port.test.ts`;
  `npm run --workspace @formspec-org/webcomponent build`;
  `npm run --workspace @formspec-org/webcomponent test -- tests/components/interactive-plugins.test.ts`;
  `npm run --workspace @formspec-org/studio test -- tests/workspaces/preview/preview-tab.test.tsx`;
  `npm run --workspace @formspec-org/studio build`.

Not closed yet: respondent-facing production runtime/product consumer wiring,
server-side runtime capability mint/proxy, and ADR 0153 gate 7 runtime
ownership spec/test closure.

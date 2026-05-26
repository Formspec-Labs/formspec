# ADR 0153 Response Actions Executor Closure Plan

**Date:** 2026-05-26
**Row:** Response Actions executor
**Status:** Closed
**Authority:** Stack rollup `thoughts/2026-05-24-adr-0150-followons-and-gating.md`, ADR 0153 gates 6b/7, Response Actions spec, StudioCore LedgerPort boundary

## Scope

Close the Response Actions executor row only when a production respondent/runtime host or BFF authenticates the runtime session, mints or proxies a per-command Ledger capability server-side, injects the route-backed Trellis `LedgerPort` into the real ActionButton invoker path, and proves the anchored append is visible through Studio `readLedgerStatus`.

This row must not promote Surface or Component action inference, product URL-convention action lookup, Runtime Plan, fine-grained authorization fields, or any ADR 0153 Section 6 spike mechanism.

## Current Slice

The 2026-05-26 slice lands the server-side mint/proxy prerequisite:

- `formspec-server` verifies the anonymous runtime session for `/runtime/forms/{form_id}/response-actions/ledger/capability`.
- The mint route requires trusted host/BFF `x-formspec-runtime-ledger-mint-authority` HMAC proof before returning a capability.
- The mint route validates the append command before minting.
- The route binds `ledgerScope` to the verified anonymous session URN.
- The existing append route still verifies the HMAC capability, recomputes `opBatchHash`, preserves the StudioCore idempotency key, and appends through Trellis.
- Trellis' HTTP schema drift checker now treats the Response Actions session-op-batch Formspec literal as an admitted append literal.

The follow-on HTTP E2E slice adds a Playwright host process that computes the
same trusted mint-authority proof, authenticates an anonymous runtime session,
calls the server-side capability mint route, and appends with the returned
route-backed capability over HTTP.

The Studio Preview consumer-evidence slice changes the existing route-backed
invoker test so the ActionButton path obtains its capability through a simulated
host mint route before appending. It asserts the mint `appendCommand` is the
same command later posted to the append route, then observes the anchored
receipt through Studio `readLedgerStatus`.

This is necessary evidence, not row closure. Studio Preview now proves
ActionButton/host adapter -> trusted-host mint route shape -> append -> `readLedgerStatus`,
and `formspec-server` proves the HTTP mint -> append authority path against the
server/Trellis route. The public web follow-on adds React ActionButton invoker
parity plus a `formspec-web` respondent-runtime host factory that builds the
same append command shape, obtains a per-command capability through a
trusted/BFF provider, and posts the same command to the append route shape from
the real `RespondentRuntime` path.

The browser managed-single-cell follow-on drove the real public
`RespondentRuntime` submit ActionButton through production runtime config,
actual `formspec-server` capability/append routes, and Trellis-shaped receipt
checks. It proves one anonymous session token across session creation, drafts,
submit, capability mint, and ledger append, and it proves browser-originated
requests do not carry the mint-authority HMAC header. The runtime-ownership
extension to that proof now adds host-supplied Component graph and UI Graph
Policy evidence, asserts route metadata in the browser-rendered runtime, and
proves hidden active Definition rejection before draft, submit, capability, or
append work. The row is now closed because `formspec-server` exposes the
deployable browser-safe `/runtime/response-actions/ledger/capability` route,
`formspec-web` can point runtime config at that route directly, and the
remaining Playwright routing in the browser proof is only managed-scope
forwarding/capture, not mint authority or BFF behavior.

## Ordered Work

1. Keep the Response Actions spec and StudioCore bridge as the execution authority.
2. Keep trusted-host server capability minting behind runtime session verification and trusted host/BFF mint-authority proof.
3. Prove trusted-host mint -> append with an in-process `formspec-server` test.
4. Prove trusted host/BFF mint -> append over the HTTP routes.
5. Prove the Studio Preview ActionButton/host adapter path obtains a route-backed capability through the trusted-host mint route shape before append.
6. Prove the public web React RespondentRuntime ActionButton path accepts a trusted host/BFF invoker factory and posts the same route-shaped append command without exposing mint HMAC material to browser runtime code.
7. Prove the public web React RespondentRuntime ActionButton path against actual `formspec-server`/Trellis mint+append routes, with the trusted/BFF authority confined to test-side routing.
8. Replace the Playwright-routed BFF/scope harness with a deployable host/BFF capability provider.
9. Update rollup evidence and close the row.

## Deviations

- The trusted-host mint route landed before the full production caller
  integration because the existing worktree already contained the server-side
  prerequisite. The later deployable BFF route closes that caller boundary for
  the Response Actions executor row.
- The trusted-host mint route authenticates an anonymous runtime session, requires trusted host/BFF mint-authority HMAC proof, and binds `ledgerScope` to that session. It does not add per-actor, per-route, per-widget-class, or other ADR 0152 authorization semantics.
- The route accepts a complete append command for minting because the capability is per-command. It does not mint broad bearer authority for arbitrary future appends.
- The browser live proof deliberately uses Playwright route interception for
  managed-scope injection and request/response capture. It no longer acts as the
  mint authority or BFF; capability minting crosses the deployable server route.
- Review absorption: external reviewers found no residual BLOCKER/HIGH/MED
  issues after the browser proof added exact request-count assertions,
  minted-capability-to-append-header equality, and negative browser-originated
  mint-authority-header checks.
- Runtime-ownership extension: the browser/live proof now also carries
  host-supplied Component graph and UI Graph Policy evidence through the real
  `RespondentRuntime`, emits route metadata, and proves hidden active Definition
  rejection before draft or Response Action work. This advances ADR 0153 gate 7,
  while the remaining Playwright routing is only managed-scope forwarding and
  capture.
- Runtime-ownership route guard extension: the same browser/live proof now
  verifies completed and denied Response Action ledger work leaves the selected
  route URL unchanged after append completion or capability denial. This is a
  gate 7 guard, not deployable BFF closure and not selected Response coverage.
- Runtime-ownership explicit transition extension: the browser/live proof now
  verifies an explicit Surface router transition driven by declared
  `surfaceTriggerAction` plus matching Component graph evidence. It preserves
  the route-param Response id into submit. Gate 7 is closed by the separate
  runtime ownership plan; this row cites that evidence only to keep executor and
  runtime-ownership boundaries distinct.
- Deployable BFF closure: `formspec-server` now exposes
  `/runtime/response-actions/ledger/capability`, a browser-safe capability
  endpoint that accepts the existing `formspec-web` capability-provider body,
  verifies the anonymous runtime session, validates and session-binds the
  append command, and returns only the per-command append capability. The
  trusted-host mint-authority route remains for server-side callers; browser
  runtime config must use the deployable route.

## Closing Observation

The browser ActionButton live checkpoint is observed: the public
`RespondentRuntime` submit ActionButton drives actual server-side capability
minting, actual server/Trellis append, and Trellis-shaped receipt checks through
a deployable server BFF route. The row is closed. Route-param selected Response
instance coverage belongs to ADR 0153 gate 7 / Runtime ownership, not to the
Response Actions executor row, and is closed separately by the runtime ownership
plan.

## Closure Evidence

Closure evidence after this slice:

- `formspec-server/crates/formspec-server/src/routes.rs` exposes `/runtime/forms/{form_id}/response-actions/ledger/capability`.
- `formspec-server/crates/formspec-server/src/routes.rs` also exposes
  `/runtime/response-actions/ledger/capability`, the deployable browser-safe
  BFF route for `formspec-web` capability-provider requests.
- `formspec-server/crates/formspec-server/src/services/responses.rs` verifies anonymous sessions before minting.
- `formspec-server/crates/formspec-server/src/services/action_ledger.rs` binds minting to `ledgerScope == urn:formspec:session:{session_id}` and mints per-command HMAC append capabilities. The trusted-host route verifies mint-authority HMAC proof; the browser-safe BFF route relies on anonymous-session verification plus the same session-scope binding.
- `formspec-server/crates/formspec-server/tests/in_process_trellis_action_ledger.rs` proves trusted-host mint -> append success, missing mint-authority rejection, mismatched scope rejection, tampered token rejection, missing token rejection, and route-minted Trellis-backed anchored append behavior.
- `formspec-server/crates/formspec-server/tests/in_process_trellis_action_ledger.rs` proves the browser-safe BFF route mints without a mint-authority header and the returned capability authorizes the append.
- `formspec-server/crates/formspec-server/tests/openapi_contract.rs` pins the trusted-host mint route, browser-safe BFF route, and named request/response schemas in OpenAPI.
- `formspec-server/tests/e2e-http/response-action-ledger.spec.ts` proves a trusted HTTP host/BFF can compute mint-authority proof, call the trusted-host mint route for the authenticated anonymous runtime session, and append through the route-backed capability.
- `formspec-server/tests/e2e-http/response-action-ledger.spec.ts` also proves the deployable BFF route accepts the browser-shaped body without mint-authority proof and appends through the returned capability.
- `formspec-server/tests/e2e-http/support/action-ledger.ts` mirrors the HMAC, canonical JSON hash, and StudioCore idempotency-key material used by the server and StudioCore bridge.
- `formspec-server/TRACEABILITY.md` maps the E2E scenario to `RSP-001`, `INT-001`, `mint_response_action_ledger_capability`, and `append_response_action_session_op_batch`.
- `formspec-studio/packages/formspec-studio/tests/workspaces/preview/preview-tab.test.tsx` proves Studio Preview ActionButton -> host invoker -> `invokeResponseActionWithLedger` -> HTTP `LedgerPort` obtains a per-command capability through the trusted-host mint route shape, appends the same command, and observes the anchored receipt through `readLedgerStatus`.
- `formspec/packages/formspec-react/src/context.tsx`, `formspec/packages/formspec-react/src/node-renderer.tsx`, and `formspec/packages/formspec-react/tests/renderer.test.tsx` add React `responseActionInvoker` parity with the web component path.
- `formspec-web/src/adapters/http/response-action-ledger.ts`, `formspec-web/src/ports/response-action-ledger.ts`, `formspec-web/src/app/RespondentRuntime.tsx`, and `formspec-web/tests/app/respondent-runtime.test.tsx` prove the public web RespondentRuntime ActionButton path can be wrapped by a trusted/BFF host factory that builds the server-validated append command, obtains a per-command capability from an opaque trusted provider, and posts the same command to the append route shape without storing mint HMAC material in browser runtime code.
- `formspec-web/tests/e2e/response-action-ledger-live.spec.ts` proves the
  public browser RespondentRuntime submit ActionButton path against live
  `formspec-server` BFF/append routes and Trellis-backed receipts, with
  single-session-owner assertions, exact capability header matching, and
  negative browser-originated mint-authority-header checks. It now also proves
  the broader runtime-ownership browser/live checkpoint: host-supplied Component
  graph and UI Graph Policy evidence render active route metadata, hidden
  active Definition evidence rejects before draft, submit, capability, or append
  work, and the follow-on runtime-ownership slice rejects ambiguous multi-form
  routes before server runtime state. The route guard also proves completed and
  denied Response Action ledger work does not mutate the selected route URL.
  The explicit Surface router transition follow-on proves a declared
  `surfaceTriggerAction` advances the route, clears one-shot transition state,
  and preserves route-param Response id submit binding. Full selected Response
  instance coverage is closed by the separate runtime ownership plan.
- `trellis/scripts/check-http-api-schema.py` checks both admitted Formspec append literals from `trellis-service-client`.
- Verification: `cargo check -p formspec-server --tests`;
  `cargo nextest run -p formspec-server --test in_process_trellis_action_ledger --test openapi_contract`;
  `npm --prefix ../formspec-server run test:e2e -- response-action-ledger.spec.ts`;
  `python3.12 -m pytest scripts/test_check_http_api_schema.py -q`.
- Verification: `npm run test:e2e -- response-action-ledger.spec.ts registry-coverage.spec.ts traceability-coverage.spec.ts journeys-coverage.spec.ts openapi.spec.ts`.
- Verification: `npm run test --workspace @formspec-org/studio -- preview-tab.test.tsx`.
- Verification: `npm --prefix formspec/packages/formspec-react run build`; `npm --prefix formspec/packages/formspec-react test`; `npm --prefix formspec-web run typecheck`; `npm --prefix formspec-web test -- tests/app/respondent-runtime.test.tsx`; `npm --prefix formspec-web run build`.
- Verification: `cd ../formspec-web && npm run typecheck`;
  `cd ../formspec-web && npx eslint tests/e2e/response-action-ledger-live.spec.ts`;
  `cd ../formspec-web && npx playwright test tests/e2e/response-action-ledger-live.spec.ts`;
  `cd ../formspec-web && FORMSPEC_WEB_LIVE_FORMSPEC_SERVER_URL=http://127.0.0.1:8080 npx playwright test tests/e2e/response-action-ledger-live.spec.ts`.

Still open outside this row:

- ADR 0153 gate 7 runtime ownership evidence remains owned by
  `thoughts/plans/2026-05-26-adr-0153-runtime-ownership-closure.md`; this row
  only closes the Response Actions executor/BFF boundary.

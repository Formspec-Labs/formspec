# ADR 0153 Response Actions Executor Closure Plan

**Date:** 2026-05-26
**Row:** Response Actions executor
**Status:** Partial
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

This is necessary evidence, not row closure. Studio Preview already proves a host-injected HTTP `LedgerPort` shape, but the production caller path still has to connect ActionButton/host adapter -> server mint -> append -> Studio `readLedgerStatus`.

## Ordered Work

1. Keep the Response Actions spec and StudioCore bridge as the execution authority.
2. Keep server capability minting behind runtime session verification and trusted host/BFF mint-authority proof.
3. Prove mint -> append with an in-process `formspec-server` test.
4. Update rollup evidence without changing the row to Closed.
5. Next slice: wire a production caller/runtime host through the mint route and anchored append path.

## Deviations

- The mint route lands before the full production caller integration because the existing worktree already contained the server-side prerequisite. The row remains Partial so the rollup does not claim ActionButton production wiring that is not yet present.
- The mint route authenticates an anonymous runtime session, requires trusted host/BFF mint-authority HMAC proof, and binds `ledgerScope` to that session. It does not add per-actor, per-route, per-widget-class, or other ADR 0152 authorization semantics.
- The route accepts a complete append command for minting because the capability is per-command. It does not mint broad bearer authority for arbitrary future appends.

## Closing Observation

Not observed yet. The closing observation will be the first production caller integration test proving ActionButton/host adapter -> server mint with host proof -> `formspec-server` append -> Trellis append -> Studio `readLedgerStatus` anchored receipt.

## Closure Evidence

Partial evidence after this slice:

- `formspec-server/crates/formspec-server/src/routes.rs` exposes `/runtime/forms/{form_id}/response-actions/ledger/capability`.
- `formspec-server/crates/formspec-server/src/services/responses.rs` verifies anonymous sessions before minting.
- `formspec-server/crates/formspec-server/src/services/action_ledger.rs` binds minting to `ledgerScope == urn:formspec:session:{session_id}`, verifies trusted host/BFF mint-authority HMAC proof, and mints per-command HMAC append capabilities.
- `formspec-server/crates/formspec-server/tests/in_process_trellis_action_ledger.rs` proves mint -> append success, missing mint-authority rejection, mismatched scope rejection, tampered token rejection, missing token rejection, and route-minted Trellis-backed anchored append behavior.
- `formspec-server/crates/formspec-server/tests/openapi_contract.rs` pins the mint route and named request/response schemas in OpenAPI.
- `trellis/scripts/check-http-api-schema.py` checks both admitted Formspec append literals from `trellis-service-client`.
- Verification: `cargo nextest run -p formspec-server --test in_process_trellis_action_ledger`; `cargo nextest run -p formspec-server --test openapi_contract`; `python3.12 -m pytest scripts/test_check_http_api_schema.py -q`.

Still open:

- Production caller/runtime host integration.
- Studio `readLedgerStatus` proof on the production caller path.
- ADR 0153 gate 7 runtime ownership closure.

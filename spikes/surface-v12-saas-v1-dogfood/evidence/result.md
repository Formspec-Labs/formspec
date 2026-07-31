# Surface v12 SaaS V1 corrected assessment

**Current result: the data-only framework proof and all four required technical
outcome cases pass; the aggregate demo claim remains held for explicit human
adequacy approval.**

The SaaS and independent community-room bundles run through the same fixed
generic host. Product routes, navigation, fields, actions, content, help, state
views, resource destinations, fixtures, and outcome procedures come from
structured data. Generic framework code supplies rendering, validation,
responsive layout, accessible defaults, state storage, semantic controls and
outputs, and evidence collection without product-specific branches.

Reviewed input digest: `sha256:fb30fb637a26ed7153289b0c539991234f0feef560e527c0d746f3bb73fc317a`

## Structured artifact and reasoning result

The current SaaS bundle contains 15 routes, 15 authored navigation entries,
eight visible workspace links, 34 Response Actions, two Definitions with seven
items and seven Binds, 15 mounted Experience units, two References Documents,
two Ontology Documents, and 10 adopted Needs.

The reasoning review records 391 rendered trace records for the SaaS bundle.
All 391 resolved to current adopted Needs and valid Experience actor, task,
unit, item, action, and declared source-outcome relations. The independent
control records 12 of 12 rendered traces. Both bundles complete all seven
AppGraph phases with no unresolved rendered pointer.

## Outcome result

The take-two audit invalidated the earlier “fully demoable” conclusion by
finding false-success behavior. That finding now has durable, repeatable
coverage:

- empty organization setup is blocked: 4/4 expectations passed;
- completed organization values remain visible after navigation: 8/8 passed;
- invalid public input cannot produce a receipt: 6/6 passed; and
- the unrelated control renders through the same generic host: 2/2 passed.

The cases and reports are schema-validated structured documents. The runner
mounts the committed React renderer, interacts through generic semantic
controls, observes renderer and route state through generic semantic outputs,
and writes append-only custody phases. Reports pin the case, artifacts, runtime,
renderer, runner, schema validator, rule index, and execution target.

Each of the three claim-required SaaS cases supports its declared outcome. The
aggregate `demo` claim is still held only by
`HUMAN_ADEQUACY_NOT_APPROVED`. Technical success therefore cannot silently
become product approval.

## Browser result

Playwright rendered all 15 routes and followed all 34 authored action paths
through their resolved controls and native action seams. It completed 30
route-and-width checks and 75 profile-and-route checks across `loaded`, `empty`,
`unavailable`, `error`, and `longContent`. The final browser pass also verified
the repaired organization and public-response flows, the unrelated control,
and the shared mobile toggle layout. It recorded no horizontal overflow,
browser warning, or browser error.

The detailed review and pinned captures are in
[`playwright-review.md`](./playwright-review.md) and
[`outcome-verification-review.md`](./outcome-verification-review.md).

## What changed after the initial audit

- Definition submit actions now validate, persist, and expose results through
  generic Response, Response Actions, semantic-control, and semantic-output
  seams.
- `OutcomeVerificationCase` and `OutcomeVerificationReport` provide separate
  structured inputs and immutable results for behavioral claims.
- Every rendered product claim and control traces directly to a current adopted
  Need and a valid Experience path. Traceability remains distinct from outcome
  proof.
- Lint and conformance checks cover inconsistent schemas, missing trace
  relations, capability mismatches, unverified claims, and known evidence
  edge cases.
- The zero-Theme renderer supplies responsive shell, navigation, table, form,
  action, target-size, focus, contrast, and toggle-field layout defaults.
- Human References render as contextual help. Ontology remains semantic
  metadata and raw authoring reasoning remains outside the customer interface.

## Historical failed evidence: attempt 7

Attempt 7 remains checked in as failure evidence. Its public replay produced
artifacts, but it did not qualify: the old demo contained product-specific
TypeScript and CSS, Experience references were incomplete, no Needs Document
or direct traces existed, graph phases were missing, and the host changed one
Definition's field membership. The unchanged calls, results, and notes keep
that failed path inspectable.

## Limits

This is an artifact, local preview-host, and declared-outcome assessment. It
does not establish production persistence, tenant isolation, authentication or
recovery, entitlement enforcement, billing execution, webhook or email
delivery, signature or receipt services, release admission, publishing,
deployment, or support operations.

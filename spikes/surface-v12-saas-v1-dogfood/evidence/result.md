# Surface v12 SaaS V1 corrected assessment

**Current result: passed as a local data-only wireframe framework proof.** The
SaaS and independent community room bundles run through the same fixed generic
host. Product routes, navigation, fields, actions, content, help, state views,
resource destinations, and fixtures come from structured data. Generic
framework code supplies rendering, validation, responsive layout, accessible
defaults, and browser adapters without product-specific branches.

Reviewed input digest: `sha256:307627996ceb2c852a7133c69c106c1eeb1d18c4c3071d28d0ebaee0ea62d62b`

The current SaaS bundle contains 15 routes, 15 authored navigation entries,
eight visible workspace links, 34 Response Actions, two Definitions with seven
items and seven Binds, 15 mounted Experience units, two References Documents,
two Ontology Documents, and 10 adopted Needs.

The reasoning review records 386 rendered trace records for the SaaS bundle.
All 386 resolved to current adopted Needs and valid Experience actor, task,
unit, item, and action relations. The independent control records 12 of 12
rendered traces. Both bundles complete all seven AppGraph phases with no
unresolved rendered pointer.

Playwright rendered all 15 routes and followed all 34 authored action paths
through their resolved controls and native action seams. It completed 30
route-and-width checks and 75 profile-and-route checks across `loaded`, `empty`,
`unavailable`, `error`, and `longContent`. The browser also verified loading,
downloads, parameterized detail navigation, external resources, public form
submission and receipt, References help, responsive tables, compact navigation,
200% zoom, and the unrelated control bundle. The final passes recorded no
console warning or error.

The detailed review and captures are in
[`playwright-review.md`](./playwright-review.md).

## What changed after the initial audit

- Experience and Need reasoning remain metadata and no longer render in the
  customer interface by default.
- Every rendered product claim and control traces directly to a Need, and an
  opt-in usable-outcome validator rejects actionable Needs represented only by
  prose.
- `StructuredPanel` now renders structured row actions, action inputs,
  lifecycle feedback, and authored loading, empty, unavailable, and error
  states.
- Response review, exports, support, trust, receipt, and navigation resources
  are real structured actions.
- The zero-Theme renderer supplies responsive shell, navigation, table, form,
  action, target-size, focus, and contrast defaults.
- Human References render as contextual help; Ontology remains semantic
  metadata. Browser links fail closed to HTTPS and same-app relative Reference
  URIs unless a host explicitly translates another scheme. Bundle and manifest
  handling supports the plural native sidecars.
- Duplicate visible titles, unusable outcomes, Theme contrast regressions, and
  delivered-widget Registry mismatches now fail automated gates.

## Historical failed evidence: attempt 7

Attempt 7 remains checked in as failure evidence. Its public replay produced
artifacts, but it did not qualify: the old demo contained product-specific
TypeScript and CSS, Experience references were incomplete, no Needs Document
or direct traces existed, graph phases were missing, and the host changed one
Definition's field membership. The calls, results, and notes remain unchanged
so that failed path stays inspectable.

## Limits

This is an artifact and local preview-host assessment. It does not establish
runtime persistence, tenant isolation, authentication or recovery, entitlement
enforcement, billing execution, webhook or email delivery, signature or receipt
generation, production verification services, release admission, publishing,
deployment, or support operations.

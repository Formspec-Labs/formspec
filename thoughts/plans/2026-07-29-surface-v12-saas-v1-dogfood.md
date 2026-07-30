---
name: Surface v12 SAAS-V1 wireframe dogfood
date: 2026-07-29
status: completed
input: formspec-server/SAAS-V1.md
decision: can the generic Wireframes MCP represent the planned Formspec Cloud SaaS as a coherent structured wireframe
---

# Surface v12 SAAS-V1 wireframe dogfood

## Corrected result

**Passed after framework correction and a structured reconstruction.**

The corrected v12 bundle and an unrelated control bundle render through one
fixed host. The host imports only a structured preview set and contains no
SaaS-specific route, field, action, sample-data, or layout branches. Replacing
the selected structured documents produces a different application.

The SaaS artifact has 14 routes, 22 Response Actions, two Definitions, 14
mounted Experience units, and 10 adopted Needs. Its reasoning review resolves
all 256 rendered and behavior nodes to current adopted Needs and mounted
Experience paths; the control resolves 12 of 12.
The verifier passed both bundles and all seven graph phases for each.
Playwright rendered all 14 routes, followed all 22 actions, exercised loaded,
empty, loading, and unavailable data states, completed the public form at
mobile width, and rendered the control bundle without a console warning or
error.

The corrected artifacts are a structured reconstruction after the framework
changes, not a fresh blind public-builder replay. The unchanged attempt-7
call/results transcript remains useful failure evidence. The closure is
governed by
[`2026-07-30-wireframes-data-only-reasoning-closure.md`](./2026-07-30-wireframes-data-only-reasoning-closure.md).

## Original result, retained for comparison

**Original assessment: blind Level 4 as a structured wireframe proof.**

The builder used
[`formspec-server/SAAS-V1.md`](../../../formspec-server/SAAS-V1.md) as the
product input.

The final public replay used 92 calls and produced:

- 13 connected routes, including `/app/forms/{formId}`, public completion, and
  receipt views;
- one seven-field Definition mounted on onboarding and public completion;
- 11 Actions and 21 unambiguous transitions;
- one reusable Registry-backed route widget mounted on all routes;
- one multi-step Experience unit;
- three typed Data Sources bound to responses, billing, and support/trust; and
- a six-document export.

Validation loaded all seven artifacts and reported zero schema failures, graph
errors, errors, warnings, informational diagnostics, unresolved references, or
skipped phases. The `surface-local`, `authorization-boundary`, and
`unsupported` phases remained `not-run`; this wireframe score does not treat
them as runtime evidence.

The blind score and exact evidence are in:

- [`result.md`](../../spikes/surface-v12-saas-v1-dogfood/evidence/result.md)
- [`scorecard.json`](../../spikes/surface-v12-saas-v1-dogfood/evidence/scorecard.json)
- [`run-manifest.json`](../../spikes/surface-v12-saas-v1-dogfood/evidence/run-manifest.json)

## What the test changed

The first valid replay scored Level 2 because it reduced `SAAS-V1.md` to 13
static text regions. That was a sitemap and copy deck, not a useful structured
wireframe. The recovery required public structured resources instead of
accepting that shortcut.

Dogfooding those resources exposed seven public catalog or boundary defects:

- Definition authoring could not reliably address more than one bundle-local
  Definition;
- an advertised widget hint was rejected by StudioCore;
- Data Source ids and availability references were underspecified;
- module-widget `sourceRef` did not expose its canonical pattern;
- Registry token slots used the wrong public shape;
- Experience identifiers and kinds were looser than the canonical schema; and
- local Experience binding did not explain when to omit `experienceRef`.

Those defects are fixed with focused MCP/catalog regressions. Public authoring
now supports multiple bundle-local Definitions. Builder mistakes
around unreachable routes, ambiguous Action selection, and unused Action
bindings were recovered through public diagnostics. The detailed separation is
recorded in
[`catalog-and-authoring-findings.md`](../../spikes/surface-v12-saas-v1-dogfood/evidence/catalog-and-authoring-findings.md).

## Corrected decision

The corrected local result establishes that the Wireframes framework can render
the SaaS V1 wireframe and an independent control from structured data alone,
with direct current-Need reasoning for every inventoried rendered node.
Attempt 7 remains the failed historical run that exposed the missing authoring,
validation, rendering, and reasoning support.

This is not runtime qualification. It does not prove persistence, tenant
isolation, authentication, entitlement enforcement, billing, webhook or email
delivery, signing, receipt verification, cross-browser compatibility, or
production operations. It is a local Chromium framework and browser-wireframe
proof; no release or deployment was performed.

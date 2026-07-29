---
name: Surface v12 SAAS-V1 wireframe dogfood
date: 2026-07-29
status: completed
input: formspec-server/SAAS-V1.md
decision: can the generic Wireframes MCP represent the planned Formspec Cloud SaaS as a coherent structured wireframe
---

# Surface v12 SAAS-V1 wireframe dogfood

## Result

**Pass: blind Level 4 as a structured wireframe proof.**

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

- a second Definition appeared editable even though the session supports only
  one editable bundle-local Definition;
- an advertised widget hint was rejected by StudioCore;
- Data Source ids and availability references were underspecified;
- module-widget `sourceRef` did not expose its canonical pattern;
- Registry token slots used the wrong public shape;
- Experience identifiers and kinds were looser than the canonical schema; and
- local Experience binding did not explain when to omit `experienceRef`.

Those defects are fixed with focused MCP/catalog regressions. Builder mistakes
around unreachable routes, ambiguous Action selection, and unused Action
bindings were recovered through public diagnostics. The detailed separation is
recorded in
[`catalog-and-authoring-findings.md`](../../spikes/surface-v12-saas-v1-dogfood/evidence/catalog-and-authoring-findings.md).

## Decision

The generic Wireframes MCP is flexible enough to represent the SaaS V1 product
surface without making the framework respondent-specific. Public respondent
completion is one route family inside a broader customer, administrator,
integration, billing, support, and trust product.

This is not runtime qualification. It does not prove persistence, tenant
isolation, authentication, entitlement enforcement, billing, webhook or email
delivery, signing, receipt verification, browser behavior, or production
operations. The single editable Definition also means this proof groups
onboarding and public-response fields instead of demonstrating independent
production form schemas.

# Surface v12 SaaS V1 corrected assessment

**Current result: passed as a local data-only wireframe framework proof.** The
SaaS and control bundles both run through the same fixed generic host. Product
routes, navigation, fields, actions, content, and source fixtures come from the
selected structured preview entry. The framework supplies the same generic
renderer and styling to both products; the host contains no SaaS-specific
executable code or CSS.

Reviewed input digest: `sha256:0f3ff91772515e1635723741803421b666ac3411a52047e189703d7e20dcf398`

The current SaaS bundle contains 14 routes and 14 authored navigation entries.
Nine entries are visible in the `workspace` scope; hidden workspace and public
route entries remain authored and checked because their labels and scopes still
affect shell behavior. The bundle also contains:

- 22 Response Actions;
- two Definitions with seven total items and seven total Binds;
- 14 mounted Experience units;
- 10 adopted Needs; and
- 256 rendered trace records, all 256 resolved to current adopted Needs and
  valid Experience actor, task, unit, and item references.

The independent control bundle records 12 of 12 rendered traces and proves that
the same compiled host accepts a second product description. All exact internal
artifact, route, action, Definition, Experience, module, source, scenario, and
Need references in the checked-in reconstruction resolve. The artifact
verifier passed both bundles and all seven required AppGraph phases for each.

This is a **structured reconstruction**, not a fresh blind replay through the
public builder. It was assembled after attempt 7 exposed gaps in the authoring
surface, validation, reasoning trace, and generic-host boundary.

Playwright rendered all 14 routes and followed all 22 authored action
destinations, including the parameterized form-detail route and a completed
public response. Responses, billing, and support/trust showed distinct loaded,
empty, loading, and unavailable behavior. Workspace navigation stayed out of
the public response and receipt routes, the mobile form remained usable at
390 x 844, the independent control rendered in the same session, and the final
passes recorded no console warning or error. The detailed review and captures
are in [`playwright-review.md`](./playwright-review.md).

## Historical failed evidence: attempt 7

Attempt 7 remains checked in as failure evidence. Its 92-call public replay
produced 13 routes, 29 slot bindings, 21 transitions, 11 actions, one
seven-field Definition, one Experience unit, a Registry widget, and three Data
Sources. The export succeeded, but it did not qualify:

- the old demo contained SaaS-specific TypeScript and CSS;
- the Experience unit cited an actor and four tasks that did not exist;
- the replay authored no Needs Document or direct rendered-Need traces;
- three required graph phases did not run; and
- the host split one Definition into different forms outside the Definition.

The old zero-finding report and prior 4/4 score are withdrawn. The attempt-7
calls, results, and notes remain unchanged so the failed path can be inspected
without confusing it with the current reconstruction.

## What the current artifacts establish

At the artifact level, the reconstruction represents account access,
onboarding, environment and team setup; forms, publishing, preview, and public
completion; responses and export; signatures, receipts, and verification;
administration and branding; API and webhook work; billing and entitlements;
and status, support, and trust. The parameterized
`/app/forms/{formId}` route declares a concrete `formId` example and its
transitions provide that parameter.

Feature posture remains explicit: `LIVE`, `ASSISTED`, `PREVIEW`, and `DISABLED`
labels distinguish available work from assisted, experimental, and unavailable
capabilities.

The correction work is tracked in
[`2026-07-30-wireframes-data-only-reasoning-closure.md`](../../../thoughts/plans/2026-07-30-wireframes-data-only-reasoning-closure.md).

## Limits

This is an artifact and local preview-host assessment. It does not qualify
runtime persistence, tenant isolation, authentication or recovery, entitlement
enforcement, billing execution, webhook or email delivery, signature or receipt
generation, production verification services, release admission, publishing,
deployment, or support operations. The corrected result proves the framework
boundary and the represented browser journeys, not those backend capabilities.

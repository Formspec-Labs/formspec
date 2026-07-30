# v12 Playwright review

Date: 2026-07-30

Reviewed input digest: `sha256:0f3ff91772515e1635723741803421b666ac3411a52047e189703d7e20dcf398`

## Result

The corrected v12 preview is demoable as a framework wireframe. One fixed host
renders both the SaaS bundle and an unrelated control bundle. The browser
review found no missing route, broken rendered action, leaking workspace
navigation on the public flow, empty Need identity, or console warning/error.

This is a wireframe result, not a claim that the SaaS product is production
ready. Its visual language is intentionally sparse and generic. The strongest
part of the demo is that the product changes when the structured input changes;
the host does not contain SaaS route, field, action, sample-data, or layout
branches.

## Browser checks

- All 14 SaaS routes rendered their authored `h1` and at least one non-empty
  `data-need-ids` identity.
- All 22 rendered action controls navigated to their authored destination.
  This included the parameterized form-detail route and a completed public
  response form. All 22 controls also exposed a non-empty direct Need identity
  from their Response Action and local widget configuration.
- Workspace routes showed the nine visible `workspace` navigation links.
  Public response and receipt routes showed no workspace navigation. The
  control bundle showed its single `control` navigation link.
- Responses, billing, and support/trust rendered distinct loaded, empty, and
  unavailable profiles. Unavailable data produced an explicit failure message
  instead of silently looking empty.
- The asynchronous data path exposed its loading state before the response
  table settled.
- The same browser session rendered the independent control bundle at `/` with
  ten non-empty Need identities.
- The final route, state, and action passes observed no browser console warning
  or error.

## Visual review

The desktop workspace is readable and consistent: direct navigation, a clear
route heading, task and rationale sections, one structured detail panel, and
plain primary/secondary actions. The response table remains legible at desktop
width. The public form fits a 390 x 844 viewport, uses the full Definition
without host-side filtering, and presents one unambiguous submit action.

The result still looks like a framework wireframe rather than a branded SaaS
application. It has limited hierarchy, no dense application shell, and large
unused areas on simple routes. Those are acceptable for this iteration because
adding product-specific host code would invalidate the test. A future design
iteration should express stronger visual hierarchy through structured Theme and
Surface data and render it through the same generic host.

## Captures

- [Dashboard, loaded](screenshots/dashboard-loaded.png)
- [Responses, loaded](screenshots/responses-loaded.png)
- [Public response, mobile](screenshots/public-response-mobile.png)
- [Independent control bundle](screenshots/control.png)

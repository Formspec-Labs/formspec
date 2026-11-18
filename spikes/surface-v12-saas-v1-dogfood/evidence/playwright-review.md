# v12 Playwright review

Reviewed input digest: `sha256:767fa3e3dad5337db78726ae69d89fa0c259c67e9d090996d7895c851fc99163`

## November 18, 2026 filing-store review

Chromium checked 75 route and profile combinations and 30 route and viewport
combinations with one main heading per view and no horizontal overflow.
It found 33 action identifiers and separately activated the authored recovery
button on the empty Responses view. The run reported zero browser warnings
and errors.

Blank onboarding marked three required fields. The finished setup reached the
dashboard, and Administration read the organization, workspace, and
environment from the local filing. Its unavailable and error profiles showed
the data-unavailable message. Invalid public input stayed on the form.
Corrected input reached the verified receipt and downloaded it. The same
host rendered the independent community-room bundle. The linked screenshots
show this run.

## November 18, 2026 projection check

Chromium rendered 15 routes across five profiles and tested the loaded views at desktop and mobile widths. Blank onboarding stayed on the form. A valid submission reached the dashboard, and Administration read all three saved values through the filed Response catalog. Invalid public input stayed on the form, valid input reached the receipt, and the same host rendered the independent bundle.

## November 18, 2026 subject handoff

Chromium repeated the route, profile, viewport, and outcome checks after Surface began passing filing-unit subjects to its engine. Administration showed the saved onboarding values with the preview helper removed. The receipt download completed without action failure feedback.

## November 17, 2026 recapture

The production preview build rendered 15 routes at desktop and mobile widths
and completed 75 route and profile combinations. Each view had one page heading
and fit its viewport. The browser reported zero warnings and errors. All 34
authored action controls exposed a direct Need identity in their applicable states.

Empty organization setup stayed on the form and flagged three fields. After a
valid submission, Administration showed the recorded organization, workspace,
and environment through the WASM-backed catalog read. Invalid public input
stayed on the form. Valid input reached the verified receipt. The same host
rendered the independent community-room bundle. The captures below are from
this recapture.

## July 31, 2026 review

## Result

The corrected v12 preview passes its four required technical outcome cases as a
data-driven framework wireframe. One fixed host renders the SaaS bundle and an
unrelated community-room bundle. Product routes, fields, content, states,
actions, resources, sample values, and test procedures come from structured
Formspec data. The host contains no SaaS-specific route, field, action, copy,
layout, or styling branch.

The aggregate `demo` claim remains held for explicit human adequacy approval.
This is a framework proof, not a claim that the represented SaaS is ready for
production. Persistence, authentication, billing, delivery, and other backend
behavior remain outside this browser assessment.

## Browser coverage

- All 15 SaaS routes passed at 1440 x 1000 and 390 x 844. A consolidated pass
  completed 30 route-and-width checks with one `h1`, no duplicate visible
  headings, no horizontal overflow, accessible control names, and direct Need
  identity for every visible interactive element.
- All five profiles (`loaded`, `empty`, `unavailable`, `error`, and
  `longContent`) passed on all routes, for 75 profile-and-route checks. The 25
  authored source outcomes rendered distinct loaded, empty, and unavailable
  profiles, plus explicit error and long-content behavior.
- All 34 rendered action controls resolved through structured action data: 32
  widget controls exposed `data-action-ref`, the empty response state exposed
  `openPublicFormFromResponses`, and the Definition supplied the single
  `submitPublicResponse` action. All 34 controls also exposed a non-empty direct
  Need identity.
- The asynchronous source path visibly exposed its loading state before the
  loaded panel settled.
- The same browser session rendered the unrelated community room bundle through
  the same compiled host. Its widget Registry matched the delivered renderer,
  and it showed no renderer or authoring terminology.
- The final route, state, action, and control passes recorded no browser console
  warning or error.

Additional responsive checks passed at 320, 768, and 1440 px, including the
`longContent` profile and 200% CSS zoom. The compact mobile menu has a 44 px
toggle and 44 px links, preserves `aria-current="page"`, and keeps every link
Need-traced. Responsive tables stack with authored labels and do not overflow.

## Interaction checks

- Empty organization setup remained on `/app/get-started` and exposed three
  required-field errors. A valid submission retained `New Organization`,
  `New Workspace`, and `sandbox` on the administration route.
- Invalid public input remained on `/respond`, exposed the email and required
  consent errors, and created no receipt. Valid input navigated to `/receipt`
  and displayed the authored verified receipt.
- A form row opened the matching form detail. A response row opened the
  matching response detail and displayed `Response 1042` while retaining the
  internal identifier only for routing and exports.
- CSV, collection JSON, individual response JSON, and receipt downloads used
  their authored filenames and content.
- Service status, support email, and trust resources opened their authored
  browser destinations.
- Empty responses offered the authored “Open hosted form” recovery. Unavailable
  and error states preserved page context and exposed retry without rendering
  technical failure details.
- Human References appeared as field help. Agent-only References and raw
  Ontology identifiers did not enter the customer DOM. The default renderer
  links only HTTPS and same-app relative Reference URIs; other schemes remain
  readable text unless an explicit host policy translates them.

## Visual review

The zero-Theme path now supplies a coherent default product shell: centered
content, responsive gutters, a wide-screen sidebar, compact mobile navigation,
consistent action and field sizing, visible focus, resilient tables, and
standard loading/empty/unavailable/error states.

This pass found and fixed one shared-skin defect at 390 px. The consent label,
help disclosure, switch, and error had collapsed into competing columns.
Toggle fields now keep the label and 44 x 44 switch on the first row while
description, help, and error content use full-width rows. React and Web
Component rendering share the correction; the demo has no local CSS rescue.

The visual result remains intentionally neutral. Brand expression can be added
through Theme and Surface data; basic usability no longer depends on it.

## Captures

- [Dashboard, loaded](screenshots/dashboard-loaded.png)
- [Responses, loaded](screenshots/responses-loaded.png)
- [Public response, mobile](screenshots/public-response-mobile.png)
- [Independent community room bundle](screenshots/control.png)
- [Outcome flows and mobile toggle correction](outcome-verification-review.md)

# Surface v12 outcome-verification review

Date: 2026-07-31
Target: the data-only SaaS V1 dogfood preview and its unrelated control bundle
Browser: Chromium through Playwright
Decision: the implementation cases pass; the formal demo claim remains held for
human approval

## Result

The take-two audit found two false-success flows. Both are now implemented
through generic Formspec runtime seams and pass repeatable outcome cases:

| Case | Result | Verified outcome |
| --- | --- | --- |
| Empty organization setup | 4/4 passed | Required fields block navigation and expose field errors. |
| Completed organization setup | 8/8 passed | Submitted organization, workspace, and environment values remain visible after navigation. |
| Invalid public response | 6/6 passed | Invalid email and missing required consent block receipt creation and expose errors. |
| Unrelated control | 2/2 passed | The same generic host renders a non-SaaS community-room schedule. |

The case reports use the committed React renderer, runtime state, generic
semantic controls and outputs, append-only evidence custody, and pinned target
identity. The three SaaS reports independently support the tested outcomes.
The aggregate `demo` claim intentionally remains held by
`HUMAN_ADEQUACY_NOT_APPROVED`; passing technical cases does not appoint the test
runner as the human product approver.

## Browser coverage

- All 15 routes passed at 1440 and 390 pixels: 30 route/width checks.
- All 15 routes passed for `loaded`, `empty`, `unavailable`, `error`, and
  `longContent`: 75 route/profile checks.
- Every check had one visible `h1`, no document-level horizontal overflow, and
  no browser warning or error.
- The organization setup flow rejected an empty submission, then retained
  `New Organization`, `New Workspace`, and `sandbox` after a valid submission.
- The public response flow rejected malformed email and missing consent, then
  produced a verified receipt after valid input.
- The unrelated control displayed a community-room schedule without SaaS copy
  or authoring-model terminology.

## UI correction found during this pass

At 390 pixels, the consent label, help disclosure, switch, and error originally
collapsed into four cramped columns. The shared default skin now gives toggle
fields a two-column first row and full-width supporting rows. The change applies
to React and Web Component rendering; it is not SaaS-specific CSS.

The final [mobile public-response capture](screenshots/public-response-mobile.png)
preserves the 44-pixel switch target, keeps the error next to the field, and
introduces no horizontal overflow.

## Captures

- [Empty organization setup blocked](screenshots/outcome-onboarding-empty-blocked.png)
- [Organization values retained](screenshots/outcome-onboarding-values-persisted.png)
- [Invalid public response blocked](screenshots/outcome-public-invalid-blocked.png)
- [Valid public response receipt](screenshots/outcome-public-valid-receipt.png)
- [Unrelated community-room control](screenshots/outcome-unrelated-control.png)

## Scope

This proves a local, data-only wireframe and the four declared outcomes. It does
not prove production persistence, authentication, tenant isolation, billing,
external delivery, release, or deployment. Product-specific routes, fields,
copy, layout, and behavior remain structured inputs; the host and outcome
runner stay generic.

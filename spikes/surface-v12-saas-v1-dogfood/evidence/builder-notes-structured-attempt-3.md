# Structured builder replay plan — attempt 3

## Result

This is an unexecuted 87-call replay plan. It preserves all 13 routes, 13 explanatory content slots, four actions, and 21 transitions from fast attempt 2. It adds structured resources through the public builder tools while keeping the final `read_summary`, `preview`, `validate`, and `export` calls last.

## Call count

| Public tool | Calls |
|---|---:|
| `formspec_wireframes_start_app` | 1 |
| `formspec_wireframes_add_route` | 13 |
| `formspec_wireframes_edit_definition` | 10 |
| `formspec_wireframes_add_action` | 4 |
| `formspec_wireframes_edit_registry` | 3 |
| `formspec_wireframes_materialize_data_sources` | 1 |
| `formspec_wireframes_add_experience_unit` | 1 |
| `formspec_wireframes_bind_slot` | 29 |
| `formspec_wireframes_add_transition` | 21 |
| `formspec_wireframes_read_summary` | 1 |
| `formspec_wireframes_preview` | 1 |
| `formspec_wireframes_validate` | 1 |
| `formspec_wireframes_export` | 1 |
| **Total** | **87** |

The 29 slot calls comprise 13 preserved static-content slots, 13 shared module-widget slots, two Definition form slots, and one Experience unit slot.

## Structured additions

- The bundle-local Registry declares `x-saas-shell` and its reusable `SaaSRoutePanel` widget.
- The widget declares exactly four action outputs: `review`, `saveDraft`, `submit`, and `evidence`.
- Every route mounts the widget and binds all four outputs to the four existing Response Actions. This is intended to eliminate `E611` unbound widget-action diagnostics.
- `organization-onboarding` defines organization, workspace, and environment fields and is mounted as a `definition-form` slot on `onboarding`.
- `public-response` defines name, email, response, and notice-consent fields and is mounted as a `definition-form` slot on `publicRespond`.
- One Data Sources catalog declares `responsesData`, `billingData`, and `supportTrustData`. The corresponding route widgets bind their optional `primaryData` input to those sources.
- `respondJourney` models the public multi-step journey from entering details through receipt delivery. It is mounted as an `experience-unit` slot on `publicRespond`.

## Ordering

The plan declares routes before route-bound resources, Definitions before actions and Definition slots, Registry entries before module-widget slots, the data catalog before data bindings, and the Experience unit before its slot. Transitions follow all route content. Summary, preview, validation, and export remain the final four calls in that order.

## Assumptions

- `formspec_version: "2.4"` matches the bundle format exposed by the fast-attempt export and is accepted as the Registry module's version range string.
- A single reusable widget may be mounted more than once, including once on every route.
- `actionBindings` keys must exactly match the widget's declared `actionOutputs`, while each `actionRef` must match an already-declared Response Action id.
- The widget's `primaryData` input is optional because only the responses, billing, and support/trust routes need live data.
- Route-level Data Sources may use `scope: "route"` with matching route-level availability.
- `query-result`, `host-state`, and `document-resource` describe the three selected host-owned sources without implying adapters beyond the SaaS V1 plan.
- The Experience tool accepts `kind: "multi-step-journey"` and task references as stable descriptive identifiers; the public schema constrains them only as non-empty strings.
- The existing duplicate uses of `navReview` and `navSubmit` as transition triggers are intentionally preserved from fast attempt 2.
- This file is a replay plan only. No builder calls were run, so `E611 == 0`, schema validity, AppGraph validity, and export publishability remain hypotheses to check during replay.

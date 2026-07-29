# Structured builder replay plan — attempt 6

## Result

This is an unexecuted 92-call recovery replay. Attempt 5 validation isolated three graph errors: two dashboard widget actions each selected multiple transitions, and the bundle-local Experience unit carried an unresolved external `experienceRef`. Attempt 6 removes those ambiguities while preserving the structured app.

## Call count

| Public tool | Calls |
|---|---:|
| `formspec_wireframes_start_app` | 1 |
| `formspec_wireframes_add_route` | 13 |
| `formspec_wireframes_edit_definition` | 8 |
| `formspec_wireframes_add_action` | 11 |
| `formspec_wireframes_edit_registry` | 3 |
| `formspec_wireframes_materialize_data_sources` | 1 |
| `formspec_wireframes_add_experience_unit` | 1 |
| `formspec_wireframes_bind_slot` | 29 |
| `formspec_wireframes_add_transition` | 21 |
| `formspec_wireframes_read_summary` | 1 |
| `formspec_wireframes_preview` | 1 |
| `formspec_wireframes_validate` | 1 |
| `formspec_wireframes_export` | 1 |
| **Total** | **92** |

## Unambiguous action routing

The four reusable actions remain available:

- `navReview`
- `navSaveDraft`
- `navSubmit`
- `navEvidence`

Outside the dashboard, each reusable action selects no more than one transition on any source route. The dashboard's seven destinations now use seven distinct actions and matching widget outputs:

| Dashboard destination | Action id | Widget output |
|---|---|---|
| Forms | `dashboardOpenForms` | `openForms` |
| Onboarding | `dashboardStartOnboarding` | `startOnboarding` |
| Responses | `dashboardOpenResponses` | `openResponses` |
| Integrations | `dashboardOpenIntegrations` | `openIntegrations` |
| Administration | `dashboardOpenAdmin` | `openAdmin` |
| Billing | `dashboardOpenBilling` | `openBilling` |
| Public form | `dashboardOpenPublicRespond` | `openPublicRespond` |

The shared `SaaSRoutePanel` declares all eleven outputs. Every route widget binds all eleven outputs to their declared actions, preserving complete action-output coverage. Each of the 21 transitions has an action mapped by the widget on its source route. Dashboard transitions use the seven destination-specific actions; all other transition triggers remain unchanged.

## Bundle-local Experience binding

The corrected catalog says `experienceRef` identifies an external Experience document and must be omitted for a bundle-local unit. The `respondJourneySteps` slot now binds only:

```json
{"unitRef": "respondJourney"}
```

The Experience unit, its title and tasks, and the slot location on `publicRespond` remain unchanged.

## Preserved structure

Apart from seven added actions and outputs, the seven dashboard trigger substitutions, expanded widget action bindings, and removal of the external Experience reference, attempt 6 preserves attempt 5:

- all 13 routes and explanatory content;
- the single editable Definition, seven fields, and two Definition form slots;
- the Registry module and shared widget;
- all three canonical Data Sources and data-bound regions;
- the bundle-local Experience unit and bound slot;
- all 21 source-to-destination route connections;
- the final `read_summary`, `preview`, `validate`, and `export` calls.

## Assumptions

- A completed widget action may be bound on a route with no transition for that action; attempt 5 already used this pattern without a graph error.
- Binding every declared output on every shared widget instance preserves the prior zero-unbound-output posture.
- Closed-core intents remain appropriate because these added actions perform local navigation through host events.
- Dashboard action ids are unique within the Response Actions document and select exactly one transition on the dashboard.
- Omitting `experienceRef` selects the bundle-local Experience document created in the same session, as directed by the corrected catalog.
- This file is a replay plan only. No builder calls were run.

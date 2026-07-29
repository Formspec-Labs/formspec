# Structured builder replay plan — attempt 4

## Result

This is an unexecuted 85-call recovery replay. It preserves the 13 routes, 13 explanatory content slots, four actions, 21 transitions, shared Registry module and widget, three data regions, two Definition form slots, and the multi-step Experience unit from attempt 3. It changes only the inputs identified by attempt 3 diagnostics and the corrected public tool catalog.

## Call count

| Public tool | Calls |
|---|---:|
| `formspec_wireframes_start_app` | 1 |
| `formspec_wireframes_add_route` | 13 |
| `formspec_wireframes_edit_definition` | 8 |
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
| **Total** | **85** |

The eight Definition calls are one declaration followed by seven field additions. The 29 slot calls remain 13 static-content slots, 13 shared module-widget slots, two Definition form slots, and one Experience unit slot.

## Diagnostic-driven corrections

- Attempt 3 showed that the public facade keeps one editable Definition active. Attempt 4 declares only `https://formspec.cloud/definitions/saas-v1-workflows`, adds all onboarding and public-response fields to it, and points both Definition form slots to that exact URL.
- Attempt 3 rejected `TextArea`. The corrected catalog says to use `TextInput` for both short and multi-line text, so the response text field now uses `TextInput`.
- The three Data Source ids now follow their kind-specific canonical patterns: `query:responses`, `host:billing`, and `resource:support-trust`.
- Each route-level Data Source availability block now includes both required references: `surfaceRef: "https://formspec.cloud/app"` and its existing `routeRef`.
- The response, billing, and support/trust widget slots bind the exact canonical source ids above.
- `tokenSlots` is optional. Attempt 4 omits it instead of emitting the string array rejected during attempt 3 export.

## Preserved structure

- All 13 route declarations are unchanged.
- All 13 explanatory static-content slots are unchanged.
- All four Response Actions are unchanged.
- The Registry still declares `x-saas-shell` and `SaaSRoutePanel`, with the same four action outputs.
- Every route still mounts the shared widget and binds all four outputs.
- The three requested data-bound route regions remain responses, billing, and support/trust.
- Both Definition form slots remain on onboarding and public response.
- `respondJourney` and its bound public-response Experience slot are unchanged.
- All 21 transitions are unchanged.
- Summary, preview, validation, and export remain the final four calls in that order.

## Assumptions

- A single Definition containing both field groups is the intended public-facade workaround. The two route slots use different `presentation` labels but share the same Definition URL.
- `https://formspec.cloud/app` is the canonical Surface reference because it is the replay's declared `surface_url`.
- The corrected public catalog is authoritative for accepted widget hints, kind-prefixed Data Source ids, route-level availability references, and Registry token-slot shape.
- Omitting optional `tokenSlots` preserves the widget while avoiding unsupported token metadata.
- This file is a replay plan only. No builder calls were run, so runtime diagnostics, AppGraph validity, and export publishability remain to be checked during replay.

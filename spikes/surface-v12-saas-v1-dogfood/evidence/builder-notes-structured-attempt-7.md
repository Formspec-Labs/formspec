# Structured builder replay plan — attempt 7

## Result

This is an unexecuted 92-call cleanup replay. Attempt 6 validation succeeded with zero errors and zero warnings. Its 122 informational diagnostics each identified a shared-widget action mapping with no transition on that route. Attempt 7 removes exactly those 122 no-op mappings and preserves the complete structured app.

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

## Action-binding cleanup

The Registry widget still declares all 11 reusable outputs. Each route instance now binds only the outputs whose action ids appear as transition triggers on that source route.

| Route | Retained mapped outputs |
|---|---|
| `dashboard` | `openForms`, `startOnboarding`, `openResponses`, `openIntegrations`, `openAdmin`, `openBilling`, `openPublicRespond` |
| `onboarding` | `submit` |
| `forms` | `review` |
| `formDetail` | `saveDraft`, `submit` |
| `formPreview` | `review` |
| `responses` | `review`, `evidence` |
| `signatures` | `review` |
| `integrations` | `review` |
| `admin` | `review` |
| `billing` | `review` |
| `supportTrust` | `review` |
| `publicRespond` | `review` |
| `publicReceipt` | `evidence` |

Attempt 6 had 143 action mappings: 11 outputs on each of 13 route widgets. Attempt 7 retains 21 mappings, one for each transition, and removes the 122 mappings that produced the informational diagnostics.

## Preserved structure

The cleanup changes only the contents of each module widget's `actionBindings` object. It preserves:

- all 13 routes and all 21 transitions;
- all 11 Response Actions;
- all Definition, Registry, Data Sources, Experience, and Surface resources;
- the Registry widget's 11 declared action outputs;
- every module widget, static-content slot, Definition form slot, and Experience slot;
- the response, billing, and support/trust `dataBindings`;
- all route configuration and content;
- the final `read_summary`, `preview`, `validate`, and `export` calls.

## Assumptions

- The corrected public catalog permits route widget instances to bind a subset of the Registry widget's declared outputs.
- An output should be mapped on a route only when its action selects a declared transition on that route.
- One retained mapped output per transition removes all 122 `APP-GRAPH-WIDGET-ACTION-TRANSITION` no-op diagnostics without changing navigation.
- Attempt 6's successful validation is the baseline; no other resource needs correction.
- This file is a replay plan only. No builder calls were run.

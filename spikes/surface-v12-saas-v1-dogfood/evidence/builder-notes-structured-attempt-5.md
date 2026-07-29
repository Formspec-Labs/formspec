# Structured builder replay plan — attempt 5

## Result

This is an unexecuted 85-call recovery replay. Attempt 4's public calls and export succeeded, and validation isolated the remaining errors to three fields in the Experience unit. Attempt 5 changes only those fields. Every other call remains unchanged.

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

## Experience correction

Attempt 4 validation reported that:

- `multi-step-journey` is not an admitted Experience unit kind;
- `public-respondent` does not match the required identifier pattern;
- each hyphenated task reference does not match the required identifier pattern.

Attempt 5 changes the unit to:

- `kind: "data-entry"`, the catalog-admitted core kind that best describes public form completion;
- `actor_ref: "publicRespondent"`;
- `task_refs: ["enterDetails", "reviewResponse", "submitResponse", "receiveReceipt"]`.

The title remains `Complete, review, and submit a response`, the four task references still describe the multi-step journey, and the existing `publicRespond` Experience slot remains bound to `respondJourney`.

## Preserved structure

Everything outside the three corrected Experience fields is unchanged from attempt 4, including:

- all 13 routes and their explanatory content;
- the single editable Definition, seven fields, and two Definition form slots;
- all four Response Actions;
- the shared Registry module and widget, including four action bindings on every route;
- all three canonical Data Sources and bound data regions;
- the Experience unit id, title, and bound slot;
- all 21 transitions;
- the final `read_summary`, `preview`, `validate`, and `export` calls.

## Assumptions

- `data-entry` accurately represents the unit's primary purpose while the title and ordered task references express its multi-step nature.
- Camel-case actor and task ids preserve their meanings while satisfying `^[A-Za-z][A-Za-z0-9_]*$`.
- The corrected public catalog and attempt 4 validation diagnostics are authoritative.
- This file is a replay plan only. No builder calls were run.

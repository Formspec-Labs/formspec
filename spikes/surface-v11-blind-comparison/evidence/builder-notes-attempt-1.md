# Builder notes — attempt 1

- The public catalog does not expose properties for `formspec_wireframes_bind_slot`. This plan assumes a static slot accepts `route_id`, `slot_id`, `kind: "static-content"`, `title`, and string `content`.
- I used one dense static slot per route. Each repeats the shared navigation, current-night state, and Local/UTC control so those controls remain explicit throughout.
- I represented desktop and narrow-screen layout intent, populated and alternate states, and all requested view details in static content because the catalog exposes no typed layout or visual-component authoring schema.
- I represented the three target commands and Download handoff as labeled self-transitions. I omitted `formspec_wireframes_add_action` because its catalog says a Definition must exist, while this mission is explicitly an operational console rather than a form workflow.
- I omitted Registry and Data Sources authoring to stay within the reduced call budget. The static route descriptions identify reusable and data-backed regions conceptually, but they do not create explicit reusable widget or source records.
- The navigation graph is connected through Night as the hub; Target detail is reached through Targets and has a visible back transition.

# Builder notes — attempt 2

## Assumptions

- The plan uses 28 public calls and adds exactly the six mission routes.
- `/night` acts as the shared-navigation hub. Every primary route can return to it, and the target queue reaches the parameterized detail route. The detail route has both a breadcrumb back to `/targets` and a navigation path back to `/night`.
- Each route gets one dense static-content slot. The slot content repeats the shared navigation, current-night state, and UTC/local toggle so the intended persistent context is explicit in the structured model.
- Responsive layout intent and representative populated, empty, loading, warning, and offline states are recorded inside the static content.
- The public catalog exposes `formspec_wireframes_bind_slot` as an object schema with no named properties and no `additionalProperties: false`. Because it does not publish the binding argument vocabulary, this plan uses the conventional keys `route_id`, `slot_id`, `slot_type`, and `content`. Those keys conform to the published open object schema, but the catalog alone cannot confirm that an executor will interpret them.

## Omissions

- The plan does not add Definitions, Experience units, Registry entries, data sources, or executable app actions. Static content represents the requested controls and actions because the mission prioritizes a complete wireframe and the catalog does not document the slot-binding fields.
- The shared navigation is modeled as a compact hub-and-spoke transition graph rather than every menu link from every route. All routes remain reachable, including the detail route and its required queue back path.
- No calls were run. Summary, preview, validation, and export appear only as the final planned calls, so this attempt records no tool results or validation claims.

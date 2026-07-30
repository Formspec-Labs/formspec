# v12 catalog and authoring findings

The SaaS dogfood moved beyond static content and exercised public Definition,
Registry, Data Sources, Experience, slot, Action, and transition authoring
together. Attempt 7 exposed catalog and authoring defects that the Northstar
v11 prompt did not reach. The current artifact set is a structured
reconstruction after those defects were addressed; it is not a new blind
public-builder replay.

## Public boundary defects fixed

1. `edit_definition` previously treated the session as if it could expose only
   one editable bundle-local Definition. Public authoring now supports multiple
   Definitions with distinct URLs, while repeating the same declaration remains
   idempotent. The corrected SaaS bundle uses separate organization-setup and
   public-response Definitions.
2. The catalog advertised `TextArea`, but StudioCore rejected it. The public
   widget-hint list now contains only accepted names and explains how to model
   multi-line text.
3. Data Source ids lacked their required kind prefixes, and route/slot
   availability omitted required `surfaceRef` fields. The catalog now exposes
   six kind-specific source variants and six level-specific availability
   variants.
4. Module-widget `sourceRef` accepted any non-empty string. It now publishes
   the canonical Data Sources id pattern.
5. Registry `tokenSlots` were advertised as strings while the canonical schema
   requires objects. The public shape now exposes the required object fields.
6. Experience `kind`, `unit_id`, `actor_ref`, and `task_refs` were looser than
   the canonical Experience schema. The public schema now exposes the closed
   kinds, `x-*` extension form, and identifier patterns.
7. A bundle-local Experience binding did not explain that `experienceRef`
   should be omitted. The catalog now distinguishes an external document URL
   from a local `unitRef`.

Focused catalog and Model Context Protocol (MCP) regressions cover these public
shapes. Final repository-wide test status is recorded separately.

## Historical attempt-7 builder defects

Attempt 7 recovered three builder-model defects through public diagnostics:

- Six routes were initially unreachable from the entry route.
- Reusing one Action for several dashboard destinations made two widget outputs
  ambiguous.
- Mapping every widget output on every route was valid but produced 122 no-op
  informational diagnostics.

The retained attempt-7 replay later reached zero tool-reported errors, schema
failures, graph errors, warnings, and informational diagnostics, but that report
was incomplete. It missed dangling Experience references, omitted required
graph phases, carried no adopted Needs trace, and used a product-specific host.
Its zero-finding result is historical failed evidence, not the current verdict.

## Current reconstruction

The corrected SaaS artifact has 14 routes, 14 authored navigation entries, 22
Response Actions, two Definitions with seven items and seven Binds, 14 mounted
Experience units, and 10 adopted Needs. Its reasoning review records 256 of 256
resolved rendered and behavior traces. The control records 12 of 12 and uses the same fixed
generic host. All exact internal references resolve in the checked-in
reconstruction.

The root verifier passed both bundles and all seven AppGraph phases for each.
Playwright rendered all 14 routes, followed all 22 actions, exercised the
loaded, empty, loading, and unavailable data paths, and rendered the control
bundle through the same host without a console warning or error. The affected
Formspec unit suites and the StudioCore and Wireframes MCP suites pass.

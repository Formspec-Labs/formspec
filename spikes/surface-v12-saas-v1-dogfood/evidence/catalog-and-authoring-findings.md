# v12 catalog and authoring findings

The SaaS dogfood moved beyond the static-content shortcut and exercised the
public Definition, Registry, Data Sources, Experience, slot, Action, and
transition tools together. That exposed public catalog defects which the
Northstar v11 prompt did not reach.

## Public boundary defects fixed

1. `edit_definition` allowed a second Definition declaration even though
   StudioCore intentionally exposes only the first as the session's editable
   bundle-local Definition. The server now makes repeat declaration
   idempotent and refuses a different URL immediately with a
   `single-editable-definition` explanation.
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

Focused catalog and MCP regressions cover these shapes. The public Definition
test also covers the single-editable boundary and same-declaration idempotency.

## Builder-model defects recovered through public validation

- Six routes were initially unreachable from the entry route.
- Reusing one Action for several dashboard destinations made two widget
  outputs ambiguous.
- Mapping every widget output on every route was valid but produced 122
  no-op informational diagnostics.

The final replay uses one Action mapping per declared transition on each source
route. It finishes with zero tool errors, schema failures, graph errors,
validation errors, warnings, or informational diagnostics.

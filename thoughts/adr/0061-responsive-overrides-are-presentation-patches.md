# ADR 0061: Responsive Overrides Are Presentation Patches

**Status:** Proposed
**Date:** 2026-05-21

## Context

Component Documents support `responsive` overrides so authors can adapt a
component tree to named breakpoints. Those overrides are useful for layout,
density, visual treatment, and input affordances. They are unsafe when they
change the identity or lifecycle semantics of the component itself.

The risky case is state initialization. Props such as `defaultOpen` and
`defaultTab` define the component's initial state. They are read when a component
is created, then user interaction takes over. If those props vary by breakpoint,
the runtime must choose between two bad interpretations:

- reapply the default on viewport changes, which can erase user state; or
- apply the default only at first mount, which makes later breakpoint overrides
  inert and misleading.

Neither behavior is portable. The same concern applies to props that change
stored value shape, child topology, binding identity, submit/event behavior, or
control ownership.

## Decision

### D-1. Responsive overrides are shallow patches

`responsive.<breakpoint>` entries remain shallow patches over the component's
base props. They are not alternate component definitions, child trees, binds, or
state machines.

### D-2. Responsive overrides are presentation and affordance only

A responsive override MAY change layout, visual styling, localized visible text,
and interaction affordances when the component keeps the same data binding and
stored value shape.

A responsive override MUST NOT change:

- component type;
- `bind`;
- `when`;
- child topology or child order;
- nested `responsive` declarations;
- stored value cardinality or primitive type;
- submit, event, or side-effect semantics;
- single-shot initial state.

### D-3. Initial-state props are not responsive-safe

Props that establish initial UI state MUST NOT appear in responsive overrides.
This includes `defaultOpen` on `Collapsible`, `defaultOpen` on `Accordion`, and
`defaultTab` on `Tabs`.

These props remain valid as base component props. They are excluded only from
breakpoint-local patches because viewport changes do not have portable reset
semantics.

### D-4. Cardinality and ownership props are not responsive-safe

Props that change value shape or ownership MUST NOT appear in responsive
overrides. Examples include:

- `multiple` on `Select` and `FileUpload`, because it changes single-value vs.
  array-shaped interaction;
- `allowMultiple` on `Accordion`, because it changes expansion-state ownership
  and mutual-exclusion semantics;
- trigger or event-routing props such as `emitEvent`, `mode`, `trigger`, and
  `triggerBind`.

### D-5. `hidden` is data-preserving

`hidden` is allowed as a responsive override. Hiding a component does not unbind
the field, clear its value, change validation, or remove the node from the
component tree. It only changes presentation for the active breakpoint.

### D-6. Validation is policy-driven

JSON Schema should continue to reject the universally forbidden structural keys:
`component`, `bind`, `when`, `children`, and recursive `responsive`.

Per-component responsive safety is enforced by the shared UI policy artifact and
the Component lint pass. The lint rule reports unsupported responsive props with
W806. This keeps the schema small while letting the component policy evolve in
one machine-readable place.

### D-7. Breakpoints use a shared namespace

Theme and Component breakpoints share one namespace. Theme defines canonical
values for shared names, and Component Documents may add names. If a Component
Document repeats a Theme breakpoint name with a different value, lint reports
the mismatch.

## Consequences

### Positive

- Responsive behavior stays portable across renderers.
- User-expanded or user-selected state is not reset by viewport changes.
- Breakpoint patches cannot silently change submitted value shape.
- The authoring surface can explain unsupported responsive props through W806
  instead of relying on large per-component JSON Schema branches.

### Negative

- Authors cannot express "open this panel by default on desktop, collapsed on
  mobile" with `responsive.defaultOpen`.
- Authors who want viewport-dependent expansion need a future explicit state
  model, not breakpoint-local defaults.

## Rollout

1. Keep base component props such as `defaultOpen` and `defaultTab` valid.
2. Remove initial-state, cardinality, and event/ownership props from the
   responsive allowlist in `specs/ui-policy.json`.
3. Regenerate TypeScript policy bindings from `specs/ui-policy.json`.
4. Enforce unsupported responsive props with W806 in `formspec-lint`.
5. Keep schema-level forbidden-key validation for structural keys.

## Related ADRs

- ADR 0052: Remove Theme Page Layout.
- ADR 0055: Single Ownership Per Concern / Role Purity.
- ADR 0056: Closed-by-Default JSON Schemas with the Extension Registry as the
  Sole Named Open Seam.

# ADR 0062: Fallback Transformation Is a Render-Time Projection

**Status:** Partial
**Date:** 2026-05-21

## Context

Formspec has progressive UI components that improve authoring and rendering
quality when a processor supports them. Examples include `MoneyInput`, `Slider`,
`Rating`, `Signature`, `Alert`, `Badge`, `ProgressBar`, `Summary`,
`ValidationSummary`, `DataTable`, `Panel`, `Modal`, `Popover`, `Tabs`, and
`Accordion`.

The UI cleanup introduced a structured fallback policy in
`specs/ui-policy.json`. That policy records a target fallback component plus
`carry`, `drop`, and `translate` behavior for component-specific props. The
policy exists, but the runtime fallback transformation is not implemented yet.

Fallback behavior is user-visible. If one renderer supports `Signature` and
another only supports `FileUpload`, both renderers must preserve the same data
contract and explain what presentation was lost. This cannot be left to ad hoc
renderer guesses.

## Decision

### D-1. Fallback transformation produces a projection

Fallback transformation MUST produce a render-time projection of the Component
tree. It MUST NOT mutate the authored Component Document, Theme Document,
Definition, project state, or exported source artifact.

The authored document remains the source of truth. The projection is a runtime
view for a specific renderer capability set.

### D-2. `specs/ui-policy.json` owns fallback policy data

The fallback transformer MUST read fallback policy from `specs/ui-policy.json`
or generated bindings derived from it. It MUST NOT re-encode fallback tables in
renderer-local code.

Each progressive component policy may define:

- `fallback`: the component to use when the preferred component is unsupported;
- `carry`: component-specific props copied unchanged;
- `drop`: component-specific props intentionally discarded;
- `translate`: component-specific props converted into fallback-compatible
  props or fallback-compatible content.

The default preservation set is also policy data. It currently includes `bind`,
`when`, `responsive`, `style`, `cssClass`, and `accessibility`.

### D-3. Data semantics are preserved

Fallback projection MUST preserve binding identity and stored value shape unless
the policy explicitly states that the fallback is impossible.

The transformer MUST preserve:

- `bind`;
- `when`;
- data-compatible `responsive` patches;
- accessibility metadata;
- visual surface props that the fallback component accepts;
- compatible children when the fallback component accepts children.

If the policy cannot preserve data semantics, the transformer MUST emit a
diagnostic instead of silently changing behavior.

### D-4. Unsupported component-specific props are explicit

The transformer MUST classify every component-specific prop as carried, dropped,
or translated. Unknown component-specific props MUST drop with a warning unless
the fallback policy names them.

This rule applies to built-in components first. Custom `x-*` components that
require fallback behavior MUST declare fallback policy through a governed
extension before portable fallback is expected.

### D-5. Fallback diagnostics are first-class

Fallback projection MUST return diagnostics alongside the projected tree. A
renderer may surface them in authoring tools, logs, or validation reports.

Diagnostics should distinguish:

- unsupported component;
- dropped prop;
- translated prop;
- impossible fallback;
- fallback chain cycle;
- missing custom fallback declaration.

The existing policy may name warnings before the diagnostic code registry is
expanded. Once implemented in lint/runtime, these diagnostics should receive
stable lint or runtime-warning codes.

### D-6. Runtime placement

The fallback transformer belongs in the runtime planning layer, not in JSON
Schema. The recommended home is a shared runtime helper consumed by
`formspec-layout`, web component rendering, React rendering, and authoring tools.

The transform runs after document loading and before renderer-specific component
instantiation. It should run after the renderer capability set is known. It
should run before a renderer attempts to instantiate unsupported components.

## Consequences

### Positive

- Unsupported progressive components degrade predictably.
- Renderers share one fallback policy.
- Source documents remain stable across renderer capability differences.
- Authoring tools can explain exactly what was dropped or translated.

### Negative

- Runtime planning gains another projection step.
- Renderers need to pass a capability set or support profile.
- Custom fallback behavior needs an extension story before it can be portable.

## Rollout

1. Keep `specs/ui-policy.json` as the fallback policy source.
2. Add a generated TypeScript fallback helper that reads `UI_POLICY`.
3. Add a Rust policy reader if lint starts validating fallback declarations.
4. Define a renderer capability input shape.
5. Implement projection tests for each built-in fallback policy.
6. Add diagnostics for dropped, translated, and impossible fallbacks.
7. Wire web component, React, and layout planning to the same projection helper.

## Related ADRs

- [ADR 0055](0055-single-ownership-per-concern-role-purity.md): Single Ownership Per Concern / Role Purity.
- [ADR 0061](0061-responsive-overrides-are-presentation-patches.md): Responsive Overrides Are Presentation Patches.
- [ADR 0064](0064-shared-ui-policy-artifact.md): Shared UI Policy Artifact.

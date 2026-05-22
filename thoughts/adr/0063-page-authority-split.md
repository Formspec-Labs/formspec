# ADR 0063: Page Authority Split

**Status:** Proposed
**Date:** 2026-05-21
**Updates:** [ADR 0052](0052-remove-theme-page-layout.md) by superseding its Theme page-layout removal path for v1.

## Context

The UI-schema review revisited [ADR 0052](0052-remove-theme-page-layout.md)'s
removal path for Theme page layout. This ADR supersedes that removal path for
v1. The accepted v1 direction keeps `theme.pages` while making page authority
explicit.

Formspec now has three page-related surfaces:

- `definition.formPresentation.pageMode` chooses the navigation mode;
- direct-root Component `Section` nodes express authored page units;
- `theme.pages` gives compact JSON authors a page-level grid surface.

There is also a generated fallback path for Definitions that do not carry
authored page structure. That fallback is useful for assistive tools, page
sequence APIs, and renderers that need a predictable sequence.

These surfaces serve different users. The architectural risk is implicit merge
behavior. If Theme pages and Component sections both assign the same field to
different pages, the runtime must not silently blend the two stories.

## Decision

### D-1. Navigation mode is separate from page authority

`definition.formPresentation.pageMode` owns navigation mode. It decides whether
the active page structure renders as single page, wizard, tabs, or an equivalent
navigation pattern.

`pageMode` does not choose the page source by itself. It applies to the active
page source selected by the precedence rules below.

### D-2. Direct-root Component `Section` nodes win

When a Component Document has direct-root `Section` children, those Sections are
the authoritative page units. They define page sequence and page membership for
the authored Component tree.

Only direct-root `Section` nodes have this page-authority role. Nested `Section`
nodes are ordinary structural groups.

### D-3. `theme.pages` remains the compact page-grid surface

When a Component Document has no direct-root `Section` page units, `theme.pages`
may define page layout. This is not legacy behavior. It is the compact authoring
surface for authors and importers who need page regions without writing a full
Component tree.

`theme.pages` may still work with a partial Component tree that has no
direct-root page Sections. In that case, the Component tree supplies authored
structure, and Theme pages supply the page-level grid.

### D-4. Definition fallback is generated last

If neither direct-root Component Sections nor `theme.pages` define page units,
the runtime may generate a Definition-derived fallback sequence. The fallback is
a runtime planning convenience, not an authored page source.

Definition fallback MUST NOT be written back into the Definition, Theme, or
Component source documents.

### D-5. Competing page structures are not merged

Runtime precedence is:

```text
direct-root Component Sections > theme.pages > generated Definition fallback
```

The runtime MUST NOT implicitly merge competing Component and Theme page
structures. If direct-root Component Sections exist, Theme pages are shadowed.

Lint should warn when Theme pages are shadowed by Component page units. Lint
should error when the same bound field is assigned to incompatible page locations
across active Theme and Component structures.

### D-6. Runtime ownership is split deliberately

`formspec-core` owns state/query page resolution for authoring surfaces.
It resolves direct-root Component Sections ahead of Theme pages.

`formspec-layout` owns render/planner page sequencing. It materializes the same
precedence and adds generated Definition fallback when no authored page source
exists.

`formspec-lint` owns cross-artifact page-governance diagnostics, including
shadowed Theme pages and incompatible Theme/Component page assignments.

`specs/ui-policy.json` may mirror the precedence order for lint and tools, but
it is not the runtime owner.

## Consequences

### Positive

- Compact JSON authors keep `theme.pages`.
- Component authors get explicit structural ownership.
- `pageMode` remains a navigation switch instead of a layout source.
- Conflicts become lint findings instead of runtime surprises.

### Negative

- Page behavior has split owners: core state/query resolution, layout
  sequencing, and lint diagnostics.
- Consumers must understand that nested `Section` is not a page unit.
- `theme.pages` and Component Sections need paired lint to prevent drift.

## Rollout

1. Keep `theme.pages`, `PageLayout`, and `Region` in v1.
2. Keep Component `Section` as the authored structural primitive.
3. Treat direct-root `Section` nodes as page units under page navigation modes.
4. Keep nested `Section` nodes as ordinary structure.
5. Emit W805 when Theme pages are shadowed by Component page units.
6. Emit E805 when Theme and Component assign the same field to incompatible
   active page locations.
7. Keep Definition fallback generated and non-authoritative.

## Related ADRs

- [ADR 0052](0052-remove-theme-page-layout.md): Remove Theme Page Layout, superseded for v1 by this ADR.
- [ADR 0055](0055-single-ownership-per-concern-role-purity.md): Single Ownership Per Concern / Role Purity.
- [ADR 0062](0062-fallback-transformation-is-a-render-time-projection.md): Fallback Transformation Is a Render-Time Projection.
- [ADR 0064](0064-shared-ui-policy-artifact.md): Shared UI Policy Artifact.

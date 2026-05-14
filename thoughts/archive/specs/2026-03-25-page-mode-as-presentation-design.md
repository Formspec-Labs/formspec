# Page Mode as Presentation: Deprecate Wizard, Unify Page Authoring

**Date:** 2026-03-25
**Status:** Draft
**Supersedes:** ADR-0052 (proposed, not accepted)
**Relates to:** ADR-0039 (Seamless Page Management), Unified Authoring Architecture (2026-03-24)
**Prior art:** `thoughts/archive/studio/2026-03-17-pages-tab-redesign.md` (validated "mode is a rendering toggle" principle, UX patterns for accordion page cards, inline title editing, region grids, `buildLabelMap` utility, bootstrap auto-sync). `thoughts/archive/studio/2026-03-17-nested-wizard-fix.md` (planner `applyThemePages` guard — preserve during Phase 5). `thoughts/reviews/2026-03-24-planner-spec-divergences.md` (known TS planner divergences — avoid introducing new ones).

---

## Problem

Studio's page authoring has three problems:

1. **Two layout systems that never compose.** Theme `pages[]` and Component tree `Page`/`Wizard`/`Tabs` nodes both declare page structure. When a Component Document exists, it replaces Theme pages entirely (Component spec §11.3). The two systems never cooperate — one always discards the other.

2. **Mode is encoded as structure.** Switching from wizard to tabs requires restructuring the component tree root from `Wizard > Page*` to `Tabs > Page*`. This conflates a rendering instruction (how to navigate between pages) with tree structure (what pages contain).

3. **Single mode is unusable.** Pages become "dormant" in single mode — no reordering, no field assignment, no layout editing. The user sees faded, disabled cards with no editing surface.

## Decision

**Mode is presentation, not structure.** The component tree always uses `Stack > Page*` regardless of mode. `definition.formPresentation.pageMode` tells the renderer how to present page boundaries. The `Wizard` component type is deprecated.

**Studio has one real layout authoring surface.** Studio writes page/layout state to the Component tree only. `theme.pages` and Tier 1 `presentation.layout.page` remain compatibility inputs, not active Studio authoring state.

**`formspec-studio-core` owns the behavior.** `formspec-studio` is a UI library over `Project` helpers, queries, catalogs, page planning, and migration logic that live in `formspec-studio-core` or lower layers. No page-layout business rules should remain in the React package.

### The Model

The component tree structure is the same for all three modes:

```
Stack (root)
  ├─ Page (nodeId: "page-1", title: "Contact Info")
  │   ├─ Stack (direction: horizontal)
  │   │   ├─ [bound: firstName]
  │   │   └─ [bound: lastName]
  │   └─ [bound: email]
  └─ Page (nodeId: "page-2", title: "Address")
      ├─ [bound: street]
      └─ [bound: city]
```

For simple forms with no pages:

```
Stack (root)
  ├─ [bound: firstName]
  ├─ [bound: lastName]
  └─ [bound: email]
```

`formPresentation.pageMode` controls how the renderer presents `Page` children of the root `Stack`:

| Mode | Behavior |
|------|----------|
| `single` | Render all pages inline. No navigation chrome. All content visible on one scrollable surface. |
| `wizard` | Render one page at a time. Back/Next navigation. Validate current page before forward navigation unless `allowSkip` is true. |
| `tabs` | Render a tab bar with page titles. Show selected page. All pages stay mounted; switching tabs changes visibility, not lifecycle. |

Switching modes changes one property. The tree stays unchanged.

### What Changes

**Deprecate the `Wizard` component type.** `Wizard` is a navigation mode, not a structural container. Everything it provides maps to `formPresentation` properties:

| Wizard prop | New location | Notes |
|-------------|-------------|-------|
| `showProgress` | `formPresentation.showProgress` | Boolean, default true |
| `allowSkip` | `formPresentation.allowSkip` | Boolean, default false |
| children (Page nodes) | Direct children of root Stack | Tree structure, not a wrapper |

The normative validation gate ("MUST validate current Page's bound items before forward navigation") becomes a `pageMode: "wizard"` processing requirement: renderers in wizard mode MUST validate the current page's bound items before forward navigation unless `allowSkip` is true.

**Keep `Tabs` as a Progressive layout component.** `Tabs` remains available for within-page tabbed subsections (e.g., a tabbed panel inside a Card). It is no longer used as a root-level page-navigation wrapper. Page-level tab navigation is handled by `pageMode: "tabs"`. Its page-navigation props move to `formPresentation`:

| Tabs prop (page-level) | New location |
|------------------------|-------------|
| `defaultTab` | `formPresentation.defaultTab` |
| `position` | `formPresentation.tabPosition` |

`Tabs` retains all its props for within-page use. The `tabLabels` prop and `position` prop still work on `Tabs` component nodes embedded inside pages.

**Keep `Page` as a component type.** `Page` earns its existence as a semantic section boundary — a named container with `title`, `description`, and arbitrary layout children (Stack, Grid, Card, Tabs, etc.). A Stack cannot serve this role because a page may contain multiple layout children with different directions.

**Page handlers write directly to the component tree.** Studio stops writing to `theme.pages`. Page commands create and manipulate `Page` nodes under the root `Stack`. Page resolution reads the component tree instead of `theme.pages`.

**`theme.pages` is not deleted from the spec.** Non-Studio consumers (hand-authored forms, simpler tooling) can still use Theme pages for flat grid layout. The layout planner continues to consume `theme.pages` when no Component Document exists. Studio ignores `theme.pages` for layout purposes.

### Studio Authoring Contract

Studio treats page-related data sources as follows:

| Source | Studio role |
|--------|-------------|
| Component tree `Stack > Page*` | Canonical authored page structure |
| `definition.formPresentation.pageMode` + related mode props | Canonical navigation/render behavior |
| `presentation.layout.page` on groups | Import/bootstrap hint only; shown as advisory metadata in Editor, not edited as active layout state |
| `theme.pages` | Compatibility/import input only; not written by Studio page commands |

The practical result is simple: Studio users author pages in one place, the Component tree. Other sources may seed or migrate that tree, but they do not compete with it after load.

### Load-Time Normalization

When Studio loads a project, it resolves page authority once:

1. If an authored Component tree already contains `Page` nodes under the root `Stack`, that tree wins. `theme.pages` and Tier 1 page hints are ignored for page authoring purposes.
2. If the Component tree has no pages but `theme.pages` exists, Studio may offer a one-time migration that materializes `theme.pages` into real `Page` nodes. After migration, Studio stops writing back to `theme.pages`.
3. If neither exists but Tier 1 `presentation.layout.page` hints exist, `pages.autoGenerate` may scaffold `Page` nodes from those hints.
4. Once a Component-backed page structure exists, Studio treats it as authoritative and does not attempt to keep `theme.pages` synchronized.

This removes the current dual-source ambiguity where `theme.pages` and the Component tree can both look authoritative.

### Coverage and Fallback

Implicit hybrid fallback is not the Studio default.

- Authored component documents are treated as **full coverage** by default.
- Unplaced definition items are surfaced in the Layout workspace as explicit unassigned items that must be placed, deleted from the definition, or intentionally handled by a future fallback zone mechanism.
- Studio must not silently append unbound items after the authored tree as normal behavior.

The broader public spec may continue to define fallback rendering for non-Studio consumers, but Studio authoring should make coverage explicit rather than accidental.

### Spec Changes

#### Component Spec (`specs/component/component-spec.md`)

| Section | Change |
|---------|--------|
| §3.4 Nesting Constraints | Remove rule 3 ("Wizard children MUST all be Page"). Remove Wizard from the Layout category table. |
| §5.1 Page | Update rendering requirements that reference Wizard: "When used inside a Wizard, the Page MUST be shown/hidden..." becomes "When `formPresentation.pageMode` is `wizard`, the Page MUST be shown/hidden according to the current step navigation state." Remove "When used as children of a Wizard (S5.4), Pages define the wizard steps." |
| §5.4 Wizard | Remove entire section. Add deprecation note redirecting to `formPresentation.pageMode: "wizard"`. |
| §6.2 Tabs | Update: Tabs is no longer used as a page-navigation wrapper. Page-level tab navigation uses `formPresentation.pageMode: "tabs"`. Tabs remains available as a Progressive layout component for within-page tabbed subsections. Remove "children SHOULD be Page components" guidance for root-level use. |
| §12.1 Conformance check #7 | Remove "Wizard children: All children of a Wizard are Page components." |
| §12.4 Conformance levels | Core Conformant: 18 → 17 components (remove Wizard). Schema `AnyComponent.oneOf`: 36 → 35 entries. Appendix B: 34 → 33 built-in components. Progressive count unchanged (Tabs stays). |
| §3.6 Localizable Strings | No change — Tabs `tabLabels[N]` stays for within-page use. |
| Appendix A | Rewrite Budget Wizard example: `Stack > Page*` with `formPresentation: { pageMode: "wizard" }`. |
| Appendix B Quick Reference | Remove Wizard row. |

#### Core Spec (`specs/core/spec.md`)

| Section | Change |
|---------|--------|
| §4.1.1 `formPresentation` | Add four properties with prose descriptions. Note: `formPresentation.direction` (`ltr`/`rtl`/`auto`) already exists in the schema but is missing from spec prose — address as part of this update. |
| §4.1.2 (new) Page Mode Processing Requirements | New section for normative MUST-level page mode behaviors. These requirements cannot live in §4.1.1 because that section explicitly says "All properties within `formPresentation` are OPTIONAL and advisory. A conforming processor MAY ignore any or all of these properties." The processing requirements are normative renderer obligations, not advisory hints. |

New `formPresentation` properties (§4.1.1):

```
showProgress  boolean   default: true    Wizard mode: display a progress indicator.
allowSkip     boolean   default: false   Wizard mode: allow skipping pages without validation.
defaultTab    integer   default: 0       Tabs mode: zero-based index of the initially selected tab (minimum: 0).
tabPosition   enum      default: "top"   Tabs mode: tab bar position ("top", "bottom", "left", "right").
```

New processing requirements (§4.1.2):

> When a renderer supports page mode and `pageMode` is `"wizard"`, it MUST validate the current page's bound items before allowing forward navigation unless `allowSkip` is `true`. When `pageMode` is `"tabs"`, a supporting renderer MUST keep all pages mounted; switching tabs changes visibility, not lifecycle. Renderers that do not support the declared mode SHOULD fall back to `"single"`.

This section should also make explicit that `formPresentation.pageMode` controls rendering behavior only. It MUST NOT require structural rewrites of the Component tree.

#### Component Schema (`schemas/component.schema.json`)

| Location | Change |
|----------|--------|
| `$defs/Wizard` | Remove entire definition. |
| `AnyComponent.oneOf` | Remove Wizard entry. |
| `CustomComponentRef` "not" enum | Remove "Wizard" from exclusion list. |

#### Definition Schema (`schemas/definition.schema.json`)

| Location | Change |
|----------|--------|
| `formPresentation` | Add `showProgress` (boolean), `allowSkip` (boolean), `defaultTab` (integer, minimum 0), `tabPosition` (enum: top/bottom/left/right). |

### Implementation Changes

#### Phase 0: Spec and Schema

Update spec prose, schemas, and regenerate all artifacts (`npm run docs:generate`).

#### Phase 1: Types and Linter

- Regenerate TypeScript types from schemas.
- Rust linter (`crates/formspec-lint/src/pass_component.rs`): remove Wizard from known types, delete E805 rule.
- `formspec-types`: remove Wizard from `KNOWN_COMPONENT_TYPES`.

#### Phase 2: Core Backend (Root Domino)

Rewrite page handlers (`handlers/pages.ts`) to write component tree nodes instead of `theme.pages`:

| Current handler | New behavior |
|----------------|-------------|
| `pages.addPage` | `component.addNode` — create `Page` under root Stack |
| `pages.deletePage` | `component.deleteNode` — remove Page node |
| `pages.setMode` | `definition.setFormPresentation({ property: 'pageMode', value })` |
| `pages.assignItem` | `component.moveNode` — move bound node into Page |
| `pages.unassignItem` | `component.moveNode` — move bound node out of Page to root |
| `pages.reorderPages` | `component.reorderNode` on Page node |
| `pages.movePageToIndex` | `component.moveNode` with target index |
| `pages.setPageProperty` | `component.setNodeProperty` on Page node |
| `pages.reorderRegion` | `component.reorderNode` on item within Page |
| `pages.setRegionProperty` | `component.setNodeProperty` / `component.setResponsiveOverride` |
| `pages.autoGenerate` | Create Page nodes from definition group hints |
| `pages.setPages` | Bulk replace Page nodes in tree |
| `pages.renamePage` | `component.setNodeProperty({ ref, property: 'title', value })` — renames the user-visible title, not the structural `nodeId`. Changing `nodeId` would break undo history references, `findNode` lookups, and `component.moveNode` targets. |

Delete `component.setWizardProperty` handler.

Reuse the existing `definition.setFormPresentation` handler (`definition-pages.ts:33-47`), which accepts `{ property, value }` and writes to `state.definition.formPresentation[property]`. It already supports null-deletion semantics and returns `{ rebuildComponentTree: false }`. The schema must be updated (Phase 0) to add the new properties before they can pass schema validation.

Page handlers return `{ rebuildComponentTree: false }` — they manipulate the tree directly. Exception: `pages.autoGenerate` performs a bulk tree rewrite (clearing all Page children and recreating from definition hints). It mutates the tree directly in a single transaction rather than dispatching individual `component.*` commands, avoiding problematic intermediate states.

#### Phase 3: Core Resolution

Rewrite `page-resolution.ts` to inspect the component tree for `Page` children of the root Stack:

- Walk root Stack's direct children.
- Each `Page` node → `ResolvedPage` with id, title, description.
- Bound items within each Page → regions.
- Items not inside any Page → unassigned.
- Root node type no longer determines mode — read `formPresentation.pageMode` instead.

`resolvePageView()` follows automatically since it delegates to `resolvePageStructure()`.

#### Phase 4: Core Reconciler

Update `tree-reconciler.ts`:

- Remove the `if (pageMode === 'wizard')` / `else` branch that creates `Wizard` or `Tabs` root nodes. Root is always `Stack`.
- Mark `Page` nodes with `_layout: true` so the reconciler preserves page structure when reconciling definition item changes. This extends the existing `_layout` snapshot/restore mechanism to a new case: Page nodes are the first `_layout` nodes that contain bound children. The existing `updateWrapperChildren` logic handles deletion correctly — when a definition item is deleted, its bound node is omitted from the restored Page, effectively removing it. No special deletion logic needed.
- The reconciler still handles bound-node creation from definition items, but page distribution (which items go in which Page) is handled by page handlers, not the reconciler.
- Remove `Wizard` from `CONTAINER_COMPONENTS`. Keep `Tabs` in `CONTAINER_COMPONENTS` — it remains a valid layout component for within-page tabbed subsections.

#### Phase 5: Layout Planner

Update `packages/formspec-layout/src/planner.ts`:

- Refactor `applyDefinitionPageMode` and `applyGeneratedPageMode` to stop creating Wizard/Tabs LayoutNodes — pages stay as `Stack > Page*`, the renderer applies navigation behavior based on `pageMode`. Then delete the now-unused `wrapPageModePages()`.
- Remove Wizard from `INTERACTIVE_COMPONENTS`.

#### Phase 6: Webcomponent

The wizard rendering behavior moves from component-level dispatch to form-level presentation:

- Delete `WizardPlugin` from component registry.
- Move `useWizard` behavior hook to a form-level handler: when the root Stack has Page children and `formPresentation.pageMode === 'wizard'`, apply wizard navigation behavior.
- Keep `TabsPlugin` for within-page tabbed subsections.
- The root-level renderer checks `formPresentation.pageMode` and applies wizard/tabs behavior to the root Stack's Page children.
- Wizard CSS rules stay, triggered by `pageMode` class rather than component type.
- `goToWizardStep` public API method stays, triggered by `pageMode`.

#### Phase 7: Studio-Core

Update `Project` helpers:

- `setFlow()`: dispatch `definition.setFormPresentation` for `pageMode`, `showProgress`, `allowSkip`, `defaultTab`, `tabPosition`.
- `_PRESENTATION_KEYS` routing set (`project.ts`): add `showProgress`, `allowSkip`, `defaultTab`, `tabPosition` so `setMetadata` routes them correctly (this is a second code path that writes to `formPresentation`).
- `listPages()`: walk component tree for Page nodes instead of reading `theme.pages`.
- `addField`/`addGroup`/`addContent`: validate `props.page` against component tree Page nodes instead of `theme.pages`.
- `_resolvePageGroup()`: find Page node, inspect first bound child.
- Region helpers (`setItemWidth`, `setItemOffset`, etc.): read from component tree.
- `evaluation-helpers.ts`: read page structure from component tree for per-page validation counts.
- Move any remaining page/layout business logic out of `formspec-studio` into `formspec-studio-core`:
  - page migration and normalization
  - page lookup / list / assignment queries
  - unassigned-item detection
  - page delete rehoming policy
  - mode-specific capability checks

`formspec-studio` should remain a UI layer that renders core-provided state and dispatches core-owned commands.

#### Phase 8: Studio UI — Visual Overhaul

Split `PagesTab` into three mode-specific renderers:

**Single mode — Open Canvas:**
- No page cards. The entire content area becomes a full-width `GridCanvas`.
- All items are direct children of the root Stack — the canvas is the editing surface.
- Compact horizontal field palette at the bottom for adding items.
- If Page nodes exist in the tree while in single mode, show a slim amber bar: "N pages preserved. Switch to Wizard or Tabs to restore them." The bar includes a dismiss button (hides until next mode switch) and a "Flatten" action (unwraps all Page nodes, promoting their children to the root Stack, and deletes the empty Pages). New items added in single mode go directly into the root Stack, outside any preserved Page.

**Wizard mode — Connected Path:**
- Vertical stack of page cards connected by step connectors (vertical line + downward chevron between cards).
- Prominent circular step numbers: `w-7 h-7 rounded-full bg-ink text-white text-[12px] font-semibold`.
- Dashed "add step" terminus card after the last step.
- Drag-to-reorder pages vertically.
- Unassigned items tray below the card stack.

**Tabs mode — Tab Bar:**
- Horizontal tab bar at the top showing page titles. Selected tab: `border-b-2 border-b-accent text-ink font-semibold`. Unselected: `text-muted`.
- Selected tab's content shown below in a panel attached to the tab bar (`rounded-b-2xl rounded-t-none`).
- One page visible at a time. Double-click tab label to rename.
- `+` button at end of tab row to add pages.
- Drag tabs horizontally to reorder.
- Unassigned items tray below the panel.

**Component hierarchy:**

```
PagesTab
  ModeSelector (shared)
  mode === 'single'  → SingleModeCanvas
                          GridCanvas (full-width, no card wrapper)
                          CompactFieldPalette (horizontal, bottom)
                          DormantPagesNotice (conditional)
  mode === 'wizard'  → WizardModeFlow
                          DragDropProvider (vertical)
                          WizardStepConnector (between cards)
                          SortablePageCard (with step number circle)
                          WizardAddStep (dashed terminus)
                          UnassignedItemsTray
  mode === 'tabs'    → TabsModeEditor
                          TabBar (horizontal, draggable tabs)
                          TabPanel (selected page content)
                          UnassignedItemsTray
```

**Mode transitions:** Fast crossfade (150ms, ease-out). No spring physics. Speed communicates lightweight configuration change.

**Accessibility:**
- Tabs mode tab bar: `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, `aria-controls`, arrow-key navigation.
- Wizard steps: `aria-label="Step {n}: {title}"`. Connectors are `aria-hidden="true"`.
- Mode switch: `aria-live="polite"` region announces the change.

#### Phase 9: Fixtures and Tests

- Rewrite 5 example `component.json` files: `Wizard` root → `Stack > Page*`.
- Update `formPresentation` in corresponding `definition.json` files.
- ~130 test assertions across 9 core/studio-core test files: assert against component tree, not `theme.pages`.
- Webcomponent tests: wizard behavior triggered by `pageMode`, not `Wizard` component type.
- E2E tests: update fixtures, verify all three modes render correctly.

### Blast Radius

| Category | Estimated files |
|----------|----------------|
| Spec prose | 2 (component-spec, core spec) |
| Schemas | 2 (component, definition) |
| Generated artifacts | All `.llm.md`, types |
| Core source | ~8 (handlers, reconciler, resolution, diagnostics, tree-utils, properties) |
| Layout planner | 2 (planner, types) |
| Studio-core | 3 (project, helper-types, evaluation-helpers) |
| Webcomponent | ~10 (behaviors, plugins, adapters, navigation, element, CSS) |
| Adapters | 3 (tailwind wizard, uswds wizard — kept for backwards compat but deprecated) |
| Studio UI | ~6 (PagesTab split + new components) |
| Rust linter | 1 |
| MCP | 2 (flow, query) |
| Fixtures | 5 |
| Tests | ~56 (13-15 with significant changes, remainder minor) |
| **Total** | **~100** |

### Design Decisions

1. **`pages.*` command vocabulary preserved.** Handlers internally dispatch `component.*` ops, but command names stay stable for undo history compatibility.

2. **`theme.pages` ignored, not cleared.** Studio stops writing to it. The layout planner still reads it for the non-Studio "Definition + Theme only" rendering path.

3. **Reconciler protects Page nodes with `_layout: true`.** Definition item changes still trigger reconciliation, but the reconciler preserves existing Page structure and only adds/updates/removes bound nodes within Pages.

4. **`formPresentation` is the home for navigation config.** These are form-wide advisory hints, consistent with the existing `pageMode`, `labelPosition`, and `density` properties.

5. **Tabs stays as a layout component.** Within-page tabbed subsections are a useful pattern that `pageMode` cannot express. Only root-level tab navigation moves to `pageMode: "tabs"`.

6. **Tier 1 page hints are compatibility-only in Studio.** `presentation.layout.page` may seed `pages.autoGenerate`, but once pages exist in the Component tree, Studio does not treat those hints as a competing authoring source.

7. **Page deletion is presentation-only.** Deleting a page never deletes Definition items. Child components are rehomed into the unassigned tray in the same undoable operation, then the empty `Page` node is removed.

### Risks

**Reconciler must preserve page structure.** After the refactor, definition item changes (addItem, removeItem) still trigger `rebuildComponentTree`. The reconciler must add/update/remove bound nodes without destroying Page boundaries. The `_layout: true` flag mechanism handles this, but needs testing for edge cases: what happens when a bound item inside a Page is deleted from the definition?

**Webcomponent render dispatch changes.** The webcomponent currently dispatches on `comp.component` type. Without a `Wizard` component, the root-level renderer must check `formPresentation.pageMode` and apply wizard behavior to the root Stack's Page children. This is a meaningful refactor of the render path.

**Existing wizard adapter code survives but is triggered differently.** The `useWizard` hook, wizard CSS, and wizard adapters (default, tailwind, uswds) contain real rendering logic. They move from component-level dispatch to form-level dispatch. The code is reused, not deleted.

**`pages.addPage` auto-promotion.** The current handler auto-promotes `pageMode` from `single` to `wizard` when the first page is created. The new `pages.addPage` handler must preserve this convenience by dispatching both a component tree change and a `definition.setFormPresentation` change as a side effect.

**`group.presentation.page` definition property.** The definition schema supports a `page` property on group presentation (Tier 1 hint for page membership). This property is read by `pages.autoGenerate` to create initial page structure. After this refactor, auto-generate reads these hints and creates component tree Page nodes. Forms that declare pages via this definition property but have no Component Document still work through the layout planner's existing fallback path, which reads `formPresentation.pageMode` and group `page` hints.

**Fallback contract needs an explicit Studio rule.** The current public specs still describe unbound-item fallback. Studio must not inherit that as silent authoring behavior or the “components are authoritative” model collapses back into an accidental hybrid.

**`formPresentation` property precedence.** When a within-page `Tabs` component has its own `defaultTab` or `position` props, those component-level props take precedence over the form-level `formPresentation.defaultTab` / `formPresentation.tabPosition`. The form-level props apply only to page-level tab navigation controlled by `pageMode: "tabs"`.

### Migration

Existing Component Documents with `Wizard` root nodes must be migrated on project load. The migration is automatic, lossless, and one-way:

1. **Detection:** On project load, if the component tree root has `component: "Wizard"`, trigger migration.
2. **Tree rewrite:** Replace the `Wizard` root with a `Stack` root. All `Page` children become direct children of the new `Stack`. Non-Page children (if any) are also promoted.
3. **Property migration:** Read `showProgress` and `allowSkip` from the old Wizard node's props. Write them to `definition.formPresentation`.
4. **Mode sync:** Set `definition.formPresentation.pageMode` to `"wizard"` (since the old tree expressed wizard mode structurally).
5. **Tabs root migration:** If the root is `Tabs` (used as page navigation), apply the same rewrite: `Tabs` root → `Stack`, move `defaultTab` to `formPresentation.defaultTab`, move `position` to `formPresentation.tabPosition` (note the property rename: `position` → `tabPosition`), set `pageMode: "tabs"`. Only root-level `Tabs` nodes are migrated. Within-page `Tabs` nodes are untouched.
6. **Location:** Migration runs in `formspec-core`'s project initialization path, before the first render. It is a one-time transform applied to the component state.
7. **Lossless:** Every Wizard/Tabs prop has a `formPresentation` equivalent. No information is lost.
8. **One-way:** Migrated projects cannot be read by older versions that expect a `Wizard` root. Since the project is unreleased with zero users, this is acceptable.

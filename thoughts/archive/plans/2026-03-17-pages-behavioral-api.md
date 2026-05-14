# Pages Behavioral API — v2

**Date:** 2026-03-17
**Status:** Draft
**Scope:** formspec-core, formspec-studio-core, formspec-studio PagesTab
**Research:** `thoughts/research/2026-03-17-component-bind-path-model.md`

---

## 1. Why This Matters

Formspec is a three-tier specification. Tier 1 (Core) defines data and logic.
Tier 2 (Theme) defines presentation and layout. Tier 3 (Components) defines
interaction. The central architectural promise is that each tier can change
independently -- a theme can be swapped without touching the definition, and
the component tree can be regenerated from the theme without the UI knowing
how either is structured.

Studio's PagesTab violates this boundary. It imports `useTheme()` to read
breakpoint definitions, `useDefinition()` to filter items by type, casts raw
region objects to schema-typed shapes, and addresses regions by positional
index with raw property names like `span` and `start`. The tab has direct
knowledge of:

- Theme document structure (pages array, region objects, breakpoints map)
- Definition document structure (items array, type discriminator, formPresentation)
- Region schema vocabulary (span, start, responsive, exists)
- Positional addressing (region index as callback parameter)

This is the same category of problem identified in the component bind-path
research doc: internal data shapes leak through abstraction boundaries into
consuming code. When the theme schema changes (region properties rename,
breakpoint format evolves, page structure reorganizes), PagesTab breaks --
not because its behavior changed, but because it's coupled to representation.

The fix is a behavioral API layer: types and functions that describe what
Studio can *do* with pages, not how pages are *stored*. The UI says "set this
item's width to 6" rather than "update region index 3's span property to 6."
The UI receives items with `status: 'valid' | 'broken'` rather than reading
`r.exists === false`. The UI gets `breakpointNames: string[]` rather than
deriving them from `theme.breakpoints`.

This is not about adding abstraction for its own sake. It is about honoring
the tier boundary that the specification defines, so that schema evolution
does not cascade into UI breakage.

---

## 2. Two Responsive Systems

The specification defines two completely separate responsive mechanisms.
Understanding them is essential because they share the name "responsive"
but have different shapes, different scopes, and different purposes.

### Region responsive (Tier 2 -- theme-spec SS6.4, lines 755-797)

Controls **grid position** on the page layout. Defined on theme `Region`
objects. Tightly typed:

```
Record<string, { span?: number; start?: number; hidden?: boolean }>
```

This tells the renderer "at the `sm` breakpoint, make this region 12 columns
wide and hide it." The breakpoint names come from the theme's top-level
`breakpoints` object (theme-spec SS6.4, line 757; `theme.schema.json` line 236).

### Component responsive (Tier 3 -- component-spec SS9.2, lines 2593-2617)

Controls **component props** on individual component nodes. Defined on
`ComponentBase`. Generic shape:

```
Record<string, Record<string, unknown>>
```

This tells the renderer "at the `sm` breakpoint, override Grid's `columns`
to 1." Any component-specific prop can be overridden (except `component`,
`bind`, and `when` per component-spec SS9.2 line 2612-2617).

### Breakpoint precedence

Both systems reference the same breakpoint names. Breakpoints can be declared
in either the theme document (theme-spec SS6.4) or the component document
(component-spec SS9.1, line 2589-2591). When both declare breakpoints, the
component document's breakpoints take precedence.

In Studio's authoring context, the component tree is auto-generated from the
theme, so `theme.breakpoints` is the authoritative source. The behavioral
API reads breakpoints from the theme and documents this assumption.

---

## 3. Behavioral Types (Decided)

These types live in `formspec-core` and replace `ResolvedPage`,
`ResolvedRegion`, and `ResolvedPageStructure` as the public API for page
data. The existing types remain as internal implementation detail.

**Why in formspec-core, not formspec-studio-core:** The resolution logic
depends on `resolvePageStructure` which already lives in formspec-core.
The types describe the output of a core resolution function, not a studio
authoring operation. studio-core re-exports them.

**Why in `queries/`, not a standalone module:** formspec-core already has
a `queries/` directory of pure read functions following the convention
`(state: ProjectState, ...) => result`. `resolvePageView` is the same
pattern -- a cross-document query that reads theme pages + definition items
and returns a resolved view. Placing it alongside `effectivePresentation`,
`diagnose`, and `statistics` is consistent and discoverable. The barrel
`queries/index.ts` re-exports it.

```ts
/** What PagesTab sees -- no schema vocabulary. */
export interface PageView {
  id: string;
  title: string;
  description?: string;
  items: PageItemView[];
}

export interface PageItemView {
  key: string;
  label: string;
  status: 'valid' | 'broken';
  width: number;             // 1-12, from Region.span
  offset?: number;           // from Region.start
  responsive: Record<string, {
    width?: number;
    offset?: number;
    hidden?: boolean;
  }>;
}

export interface PlaceableItem {
  key: string;
  label: string;
}

export interface PageStructureView {
  mode: 'single' | 'wizard' | 'tabs';
  pages: PageView[];
  unassigned: PlaceableItem[];
  breakpointNames: string[];
  diagnostics: Array<{ severity: 'warning' | 'error'; message: string }>;
}
```

Key vocabulary translations:

| Schema term | Behavioral term | Why |
|---|---|---|
| `span` | `width` | What it means, not what the grid calls it |
| `start` | `offset` | Ditto |
| `exists: boolean` | `status: 'valid' \| 'broken'` | Extensible enum, clear semantics |
| `regions` | `items` | What the user placed on the page |
| `unassignedItems: string[]` | `unassigned: PlaceableItem[]` | Labels resolved, ready for display |

---

## 4. Behavioral Project Methods (Decided)

Replace region-index-based methods with item-key-based methods:

| Current (structure-driven) | New (behavior-driven) |
|---|---|
| `updateRegion(pageId, ri, 'span', val)` | `setItemWidth(pageId, itemKey, width)` |
| `updateRegion(pageId, ri, 'start', val)` | `setItemOffset(pageId, itemKey, offset)` |
| `updateRegion(pageId, ri, 'responsive', val)` | `setItemResponsive(pageId, itemKey, bp, overrides)` |
| `addRegion(pageId, 12)` | Remove -- use `placeOnPage` directly |
| `deleteRegion(pageId, ri)` | `removeItemFromPage(pageId, itemKey)` |
| `reorderRegion(pageId, ri, dir)` | `reorderItem(pageId, itemKey, dir)` |

**Why old methods stay:** The studio-core helpers spec (`docs/superpowers/specs/2026-03-14-formspec-studio-core-helpers.md`)
references `updateRegion`, `deleteRegion`, and `reorderRegion` by name. MCP
tools may also use them. Deprecate, don't delete. PagesTab stops using them.

**addPage return shape change:** Current returns `{ createdId, affectedPaths: [groupKey] }`.
New adds explicit `groupKey` property so PagesTab does not have to guess from
`affectedPaths[0]` (line 882 of current PagesTab).

Each new method is a thin wrapper: finds the region index internally via
`_regionKeyAt`-style lookup, then delegates to the existing handler dispatch.

---

## 5. Open Design Questions

### 5a. Nested field extraction in page regions

The theme spec (SS6.3, lines 730-753) describes region keys referencing groups
and the behavior when a group key is used. It is silent on whether a region
MAY reference a *child* field directly (e.g., `key: "city"` where `city` is
a child of group `address`).

The reconciler (`tree-reconciler.ts` lines 196-253) currently indexes only
top-level built nodes by key (`nodeByKey` on line 197-201). It does not
search the full tree for nested keys. If a region references a nested key,
the region would show as unassigned/broken.

**Decision needed:** Should the spec explicitly allow nested region keys?
If yes, both `resolvePageStructure` and the reconciler need updates. This
is tracked as Phase 4 and is independent of the behavioral API work.

### 5b. Diagnostic code enum

Current `ResolvedPageStructure` uses typed diagnostic codes (`'UNKNOWN_REGION_KEY' | 'PAGEMODE_MISMATCH'`).
The behavioral `PageStructureView` uses `{ severity, message }` without codes.

**Decision needed:** Should behavioral diagnostics include codes for
programmatic consumption, or is severity + message sufficient for UI display?
Current implementation uses codes internally; the behavioral layer strips them.

### 5c. Tier 3 override interaction

Component-spec SS11.3 (line 2840) states: "Tier 3 component tree completely
replaces Tier 2 page layout for bound items." `resolvePageView` operates on
theme pages only. In Studio, this is correct because the component tree is
auto-generated from the theme. If Studio ever supports independent Tier 3
tree editing, `resolvePageView` would need to exclude items bound in the
Tier 3 tree from the `unassigned` list.

**Decision needed:** Nothing now. Document the assumption and move on.

---

## 5d. Evaluated and Rejected: Intermediate Combined Data Model

**Question:** Should there be a persistent combined data representation
between formspec-core and formspec-studio-core — a unified "project state
view" that merges definition + theme + component into a single read model?

**Answer:** No. The existing architecture already solves this correctly
with **on-demand resolution functions** rather than a persistent combined
model. Five cross-document resolution patterns already exist in formspec-core:

| Function | Reads From | Returns |
|----------|-----------|---------|
| `resolvePageStructure` | theme.pages + definition.items | `ResolvedPageStructure` |
| `resolveThemeCascade` | theme defaults + selectors + items | `Record<string, ResolvedProperty>` |
| `effectivePresentation` | theme + definition + component | merged properties |
| `reconcileComponentTree` | definition + tree + theme | rebuilt `TreeNode` tree |
| `getCurrentComponentDocument` | authored + generated component | merged `ComponentDocument` |

None use a persistent combined model. They are pure query functions called
on demand, and React hooks with `useMemo` handle when to recompute.

A persistent combined model would introduce three problems:
1. **Invalidation complexity** — every command touches one document; a
   combined model must know which parts to recompute after each mutation.
2. **Tier boundary erosion** — the three tiers are intentionally separate;
   a combined model blurs which tier owns which property.
3. **Unnecessary caching** — adds a sync layer between mutations and reads
   that the current on-demand pattern avoids entirely.

The correct approach is what this plan proposes: a targeted resolution
function (`resolvePageView`) in the `queries/` directory, following the
same `(state: ProjectState) => View` convention as existing queries. The
UI hook calls it on render; no persistent cache to manage.

---

## 6. Phase 0 -- Spec Alignment (Prerequisite, Separate PR)

These are spec authoring errors identified during research. They are
prerequisites because accurate spec prose is needed to validate the behavioral
API design.

### 6.1 Component bind model (component-spec SS4.1, lines 480-483)

**Error:** SS4.1 says bind is a "flat key" matching an item's `key` exactly.
The authoritative example (`examples/grant-application/component.json`) uses
dotted paths (`applicantInfo.orgName`). All implementation code (`findItemAtPath`,
`cleanTreeForExport`, planner) treats `bind` as a dotted path.

**Note:** This is distinct from core spec Bind `path` (SS4.3), which is
correctly specified as a dotted qualified path. Component `bind` and core
`path` are different properties in different specs.

**Fix:** Replace SS4.1 prose to state that bind accepts either a flat key
(for top-level items) or a dotted qualified path (for nested items within
groups). Not a FEL expression or JSON Pointer.

### 6.2 Accordion bind exception (component-spec SS4.2, line 507; SS6.3, line 1568)

**Error:** SS4.2 says container bind is forbidden except DataTable. SS6.3
says `Bind: Forbidden`. The schema (`component.schema.json` lines 968-971)
defines `bind` on Accordion with description "Optional bind path to a
repeating group." The schema `x-lm` annotation (line 962) says `"bind": "forbidden"`.
The authoritative example uses `"bind": "projectPhases"` on Accordion.
The reconciler maps repeatable groups to Accordion (`tree-reconciler.ts` line 45).

**Fix:** Three changes:
1. SS4.2 -- add Accordion to the container bind exception list alongside DataTable
2. SS6.3 -- change `Bind: Forbidden` to `Bind: Optional (repeatable group key)`
3. `component.schema.json` -- change `x-lm.bind` from `"forbidden"` to `"optional"`

### 6.3 Accordion `labels` prop gap (component-spec SS6.3, lines 1580-1583)

**Error:** The schema (`component.schema.json` lines 981-984) defines
`labels: string[]` for section header text. The spec's SS6.3 props table
(lines 1580-1583) lists only `allowMultiple` and `defaultOpen`, omitting
`labels` entirely.

**Fix:** Add `labels` row to the SS6.3 props table:
`| labels | string[] | — | No | Section header labels. labels[i] is the summary text for children[i]. Falls back to 'Section {i+1}' when absent. |`

### 6.4 Nested region keys (theme-spec SS6.3, lines 730-753)

**Gap:** The spec describes group keys and unknown keys but is silent on
whether a region MAY reference a nested child item directly.

**Fix:** Add normative language: a region MAY reference any item key in the
Definition, including nested items. When a nested item is referenced, it is
rendered standalone at the grid position, independent of its parent group's
layout. When a group is referenced, the entire subtree renders within the
region.

### 6.5 Post-fix validation

After all spec/schema changes: `npm run docs:generate && npm run docs:check`

---

## 7. Phase 1 -- Behavioral Types and Resolution (formspec-core)

### TDD

**RED:** Write `page-view-resolution.test.ts`:
- `resolvePageView` returns `PageStructureView` from valid state
- Items have resolved labels, not raw keys
- Items have `status: 'valid'` or `status: 'broken'`
- `breakpointNames` from `theme.breakpoints`; defaults when absent
- Responsive always `Record<string, ...>`, never undefined
- Unassigned items have labels
- Diagnostics are `{ severity, message }` (no code enum)

**GREEN:** Implement `resolvePageView` in `queries/page-view-resolution.ts`.
Follows the standard query convention: pure function, `ProjectState` as
first parameter, no side effects. Wraps `resolvePageStructure` internally.
Adds label resolution (walks item tree), breakpoint name extraction, status
mapping, responsive normalization.

```ts
export function resolvePageView(
  state: ProjectState,
): PageStructureView
```

Note: takes full `ProjectState` (not sliced inputs) to match the query
convention used by `effectivePresentation`, `diagnose`, etc. Internally
reads `state.theme.pages`, `state.theme.breakpoints`, `state.definition`,
and `state.definition.formPresentation`.

**EXPAND:** Edge cases:
- Empty pages (no regions)
- All items unassigned
- Mixed valid/broken regions
- No `theme.breakpoints` -> default names
- Page mode `'single'` with dormant pages

**VERIFY:** Full `formspec-core` test suite passes.

**Files:**
- New: `packages/formspec-core/src/queries/page-view-resolution.ts`
- New: `packages/formspec-core/tests/page-view-resolution.test.ts`
- Edit: `packages/formspec-core/src/queries/index.ts` (add re-export)
- Edit: `packages/formspec-core/src/index.ts` (export new types)

---

## 8. Phase 2 -- Behavioral Project Methods (formspec-studio-core)

### TDD

**RED:** Add tests to `project-methods.test.ts`:
- `setItemWidth(pageId, itemKey, width)` updates correct region's span
- `setItemOffset(pageId, itemKey, offset)` updates region start
- `setItemResponsive(pageId, itemKey, bp, overrides)` updates responsive
- `removeItemFromPage(pageId, itemKey)` removes the region
- `reorderItem(pageId, itemKey, 'up')` swaps with previous
- `addPage` return has explicit `groupKey`
- Error: unknown pageId, unknown itemKey on page

**GREEN:** Implement in `project.ts`. Each method finds region index by key
lookup, delegates to existing handler dispatch.

**EXPAND:** Edge cases:
- Item on page but with broken status (key not in definition)
- Reorder first item up (no-op or error?)
- `setItemResponsive` with empty overrides (clears breakpoint)

**VERIFY:** Full `formspec-studio-core` test suite passes.

**Files:**
- Edit: `packages/formspec-studio-core/src/project.ts` (new methods)
- Edit: `packages/formspec-studio-core/tests/project-methods.test.ts`
- Edit: `packages/formspec-studio-core/src/index.ts` (re-export new types from core)

---

## 9. Phase 3 -- PagesTab Refactoring (formspec-studio)

Pure refactor -- behavior unchanged, different wiring.

### Steps

1. **BASELINE** -- Run existing `pages-tab.test.tsx` and `pages-workspace.spec.ts`. All green.

2. **Refactor `usePageStructure`** -- Replace internals:
   - Remove `buildLabelMap` (label resolution now in `resolvePageView`)
   - Call `resolvePageView` instead of `resolvePageStructure`
   - Return `PageStructureView` instead of `{ structure, labelMap }`

3. **Refactor `PagesTab`** -- Remove all schema imports:
   - Remove `useTheme`, `useDefinition` imports
   - Remove `BreakpointOverride`, `ResponsiveOverrides` local types
   - Remove `DEFAULT_BREAKPOINTS` constant
   - Remove `groupKeyForPage` helper
   - Remove `import type { ResolvedPage }`
   - Replace `r.exists === false` with `item.status === 'broken'`
   - Replace `project.updateRegion(...)` calls with `project.setItemWidth(...)` etc.
   - Replace `project.deleteRegion(...)` with `project.removeItemFromPage(...)`
   - Replace `project.reorderRegion(...)` with `project.reorderItem(...)`
   - Replace `project.addRegion(pageId, 12)` -- remove or replace with `placeOnPage`
   - Get breakpointNames from `structure.breakpointNames`
   - Get labels from `page.items[].label` instead of `labelMap.get(r.key)`

4. **Refactor `PageCard` props** -- Takes `PageView` instead of `ResolvedPage`:
   - `page.items` instead of `page.regions`
   - Callbacks take `itemKey: string` instead of `regionIndex: number`
   - No raw responsive type -- use behavioral shape

5. **VERIFY** -- All existing tests still green. Update test helpers that
   construct `ResolvedPage` objects directly.

**Files:**
- Edit: `packages/formspec-studio/src/workspaces/pages/usePageStructure.ts`
- Edit: `packages/formspec-studio/src/workspaces/pages/PagesTab.tsx`
- Edit: `packages/formspec-studio/tests/workspaces/pages/use-page-structure.test.ts`
- Edit: `packages/formspec-studio/tests/workspaces/pages/pages-tab.test.tsx`

---

## 10. Phase 4 -- Reconciler Enhancement (Optional, Separate)

Only needed if we decide to support nested field extraction in page regions
(open question 5a). Depends on Phase 0 spec language (SS6.4).

### 4a. Nested field extraction

**RED:** Region with `key: 'city'` where `city` is a child of group `address`.
Reconciler should extract `city` and place it on the page.

**GREEN:** Change `reconcileComponentTree` node lookup from root-only
(`builtNodes` iteration, lines 197-201) to recursive tree traversal indexing
all nodes by key.

**Handle extraction:** When a nested node is matched, splice it out of its
parent and place on the page. Parent group has one fewer child.

### 4b. Tabs vs Wizard mode constraints

The reconciler currently handles wizard and tabs identically (lines 196-253).
Their spec constraints differ:

| Constraint | Wizard | Tabs |
|---|---|---|
| Children | MUST be Page (component-spec SS5.4) | SHOULD be Page (any allowed) |
| Navigation validation | MUST validate before forward | No validation required |
| Child lifecycle | One visible at a time | All mounted simultaneously |
| Spec level | Core | Progressive (fallback: Stack + Heading) |

For now the shared path works because Studio always generates Page children
for both modes. If constraints diverge in practice, mode-specific logic
would be needed.

**Files:**
- Edit: `packages/formspec-core/src/tree-reconciler.ts`
- Edit: `packages/formspec-core/tests/page-aware-rebuild.test.ts`

---

## 11. Key Architectural Decisions

### Types live in formspec-core, not formspec-studio-core

The behavioral types (`PageView`, `PageItemView`, `PageStructureView`) are
the output of a resolution function that wraps `resolvePageStructure`, which
already lives in formspec-core. They describe resolved page structure, not
authoring operations. studio-core re-exports them for convenience.

### resolvePageView lives in queries/, not as a standalone module

formspec-core's `queries/` directory contains all pure cross-document read
functions (`effectivePresentation`, `diagnose`, `statistics`, etc.) following
the convention `(state: ProjectState, ...) => result`. `resolvePageView` is
the same pattern — a cross-document query combining theme pages with
definition items. Placing it in `queries/page-view-resolution.ts` is
consistent and avoids proliferating standalone resolution modules. The
`queries/index.ts` barrel re-exports it. See §5d for why a persistent
combined data model was evaluated and rejected in favor of this approach.

### Old region-index methods stay

`updateRegion`, `deleteRegion`, `reorderRegion`, and `addRegion` remain on
Project. The studio-core helpers spec references them. MCP tools may use them.
The new behavioral methods are *additions*, not replacements. PagesTab migrates
to the new methods; other callers migrate at their own pace.

### Theme breakpoints, not component breakpoints

The behavioral API reads breakpoints from `theme.breakpoints`, not from
the component document. Per component-spec SS9.1 (lines 2589-2591), when both
documents declare breakpoints, the component document takes precedence. But
in Studio's authoring context, the component tree is auto-generated from the
theme -- there is no independently authored component document. The theme is
the authoritative source. If Studio ever supports independent Tier 3 editing,
this assumption would need revisiting.

### Diagnostics have no code enum

The behavioral `PageStructureView.diagnostics` uses `{ severity, message }`
without typed codes. The internal `PageDiagnostic` retains its code enum
(`UNKNOWN_REGION_KEY`, `PAGEMODE_MISMATCH`). The behavioral layer is for UI
display; codes are for programmatic handling in the resolution layer. If
PagesTab needs to handle specific diagnostic types, the decision can be
revisited (see open question 5b).

### resolvePageView assumes Studio authoring context

Per component-spec SS11.3 (lines 2840-2841): "Tier 3 component tree
completely replaces Tier 2 page layout for bound items." `resolvePageView`
operates on theme pages only. This is correct for Studio where the component
tree is a derived artifact. An independently authored Tier 3 tree would
require `resolvePageView` to exclude Tier-3-bound items from `unassigned`.
This is documented, not handled.

---

## 12. Success Criteria (Litmus Test)

After all phases, the following imports MUST NOT exist in `PagesTab.tsx`:
- `useTheme`
- `useDefinition`
- `ResolvedPage`
- `ResolvedRegion`
- Any type with `span`, `start`, `exists`, or `responsive` from formspec-core internal types

The following patterns MUST NOT exist in `PagesTab.tsx`:
- `theme.breakpoints`
- `definition.items`
- `r.exists === false`
- `project.updateRegion`
- `project.deleteRegion`
- `project.reorderRegion`
- `project.addRegion`
- Region index (`ri`) as a callback parameter

The following patterns MUST exist:
- `item.status === 'broken'` (not `r.exists === false`)
- `item.width` (not `r.span`)
- `structure.breakpointNames` (not `theme.breakpoints` derivation)
- `project.setItemWidth(pageId, item.key, ...)` (not `project.updateRegion(pageId, ri, ...)`)
- `page.items` (not `page.regions`)

---

## 13. Not in Scope

- Changes to auto-generator (`pages.autoGenerate`) -- separate follow-up
- Changes to webcomponent rendering -- out of scope
- Changes to MCP page tools -- follow-up after API stabilizes
- Removal of old region-index methods from Project -- deprecate, don't delete
- **SubmitButton / ValidationSummary page placement** -- these are schema-only
  components (not in the spec's 34-component catalog) and are unbound display
  nodes. They cannot be placed via theme page regions (which reference definition
  item keys). They live in the component tree, not the page layout system.
- **Independent Tier 3 component tree editing** -- `resolvePageView` assumes
  the authoring context. Supporting user-authored component trees is a future
  concern (see decision in SS11).

---

## Appendix A: Exhaustive Schema Leaks in PagesTab

| Line(s) | Leak | What it should be |
|----------|------|-------------------|
| 9 | `import { useTheme }` | Breakpoint names from page structure |
| 11 | `import { useDefinition }` | Not needed at all |
| 13 | `import type { ResolvedPage }` | Behavioral `PageView` type |
| 15-22 | `BreakpointOverride` / `ResponsiveOverrides` types | Behavioral responsive type from studio-core |
| 25 | `DEFAULT_BREAKPOINTS` hardcoded | studio-core provides defaults |
| 28-33 | `groupKeyForPage()` -- knows pages are backed by groups | studio-core resolves page-to-group mapping |
| 270, 285 | `r.exists === false` | `item.status: 'valid' \| 'broken'` |
| 398 | `r.responsive as ResponsiveOverrides` | Already typed in behavioral shape |
| 741-744 | `theme.breakpoints` derivation | `structure.breakpointNames` |
| 751-754 | `definition.items.filter(type==='group')` | Not needed -- studio-core knows |
| 862 | `project.addRegion(page.id, 12)` -- magic 12 | `project.placeOnPage(pageId)` or remove |
| 864-866 | `project.updateRegion(pageId, ri, prop, val)` | `project.setItemWidth(pageId, key, w)` etc. |
| 882 | `result.affectedPaths[0]` as group key | `result.groupKey` explicit in return |

## Appendix B: Spec Section References

| Citation | Location |
|---|---|
| Theme SS6.1 (Pages Array) | `specs/theme/theme-spec.md` lines 673-704 |
| Theme SS6.2 (12-Column Grid) | `specs/theme/theme-spec.md` lines 706-728 |
| Theme SS6.3 (Regions and Item Keys) | `specs/theme/theme-spec.md` lines 730-753 |
| Theme SS6.4 (Responsive Breakpoints) | `specs/theme/theme-spec.md` lines 755-797 |
| Theme schema Region | `schemas/theme.schema.json` lines 564-653 |
| Theme schema breakpoints | `schemas/theme.schema.json` line 236 |
| Component SS4.1 (bind property) | `specs/component/component-spec.md` lines 478-497 |
| Component SS4.2 (bind resolution) | `specs/component/component-spec.md` lines 498-523 |
| Component SS6.3 (Accordion) | `specs/component/component-spec.md` lines 1563-1612 |
| Component SS9.1 (breakpoints) | `specs/component/component-spec.md` lines 2568-2591 |
| Component SS9.2 (responsive) | `specs/component/component-spec.md` lines 2593-2617 |
| Component SS11.3 (tier precedence) | `specs/component/component-spec.md` lines 2824-2846 |
| Accordion schema | `schemas/component.schema.json` lines 955-998 |
| Core formPresentation.pageMode | `specs/core/spec.md` line 1878; `schemas/definition.schema.json` line 335 |
| Definition item key pattern | `schemas/definition.schema.json` lines 393-396 |

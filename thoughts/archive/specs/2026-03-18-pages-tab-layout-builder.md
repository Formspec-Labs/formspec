# Pages Tab Layout Builder — Design Spec

**Date:** 2026-03-18
**Status:** Draft
**Scope:** formspec-studio PagesTab, formspec-studio-core (one new method), formspec-core (minor type additions)
**Prerequisite:** Pages Behavioral API (Phases 0–3 complete)

## Implementation Phases

This spec is broken into three sequential phases, each with its own file:

| Phase | File | Scope | Depends On |
|-------|------|-------|------------|
| 1 | [`pages-layout-phase1-core.md`](2026-03-18-pages-layout-phase1-core.md) | `PageItemView` extensions, `breakpointValues`, `moveItemOnPageToIndex` | Behavioral API complete |
| 2 | [`pages-layout-phase2-overview.md`](2026-03-18-pages-layout-phase2-overview.md) | Overview Mode refinements, empty state, removePage confirmation, Focus Mode scaffold | Phase 1 |
| 3 | [`pages-layout-phase3-focus.md`](2026-03-18-pages-layout-phase3-focus.md) | GridCanvas, FieldPalette, BreakpointBar, SelectionToolbar | Phase 1, Phase 2 |

The remainder of this document is the consolidated design reference.
Phase files contain implementation details, TDD plans, and success
criteria for each phase.

---

## 1. Problem

Studio's Pages tab currently shows one full-width block per page — each
block is a top-level group at span 12. The tab is technically correct but
visually uninteresting and functionally limited. Users cannot arrange
individual fields on the page grid, compare layouts across breakpoints,
or understand what each page contains without expanding every card.

The theme spec (SS6.3) envisions fine-grained page layout: regions
referencing individual fields, groups, or display items arranged on a
12-column grid with responsive breakpoints. The current UI delivers
a coarse group-per-page organizer instead of a layout builder.

### User feedback (persona testing)

Three user personas were consulted:

- **Forms designer (Maria):** Wants focused per-page editing with
  maximum grid space. Needs the field palette from day one, prominent
  page descriptions, and responsive as a viewport-level toggle.
- **Developer integrator (James):** Warns against shipping a flat
  palette that allows placing items the reconciler cannot resolve.
  Flags reconciler nested-field indexing as the real blocker.
- **Non-technical admin (Denise):** Needs to see all pages at a glance
  for completeness checking. Wants plain-English width labels, hidden
  responsive controls by default, and strong undo/confirmation safety.

Key tension: Denise needs an overview of all pages; Maria and James need
focused editing space. The design resolves this with two modes.

---

## 2. Two-Mode Architecture

The Pages tab operates in two modes that the user flows between.

### 2.1 Overview Mode (default)

A vertical list of page cards — an evolution of the current PagesTab.

Each card shows:
- Page number badge, editable title, item count
- Mini 12-column grid preview (colored blocks showing layout proportions)
- Expand/collapse for quick detail inspection
- Description field (always visible when set; "+ Add description" when absent)

Page-level controls:
- Mode selector at the top (Single / Wizard / Tabs)
- Drag handle on each card for page reordering
- Add Page button
- Unassigned items section at the bottom

**Entry to Focus Mode:** Clicking a page card's grid preview, or a
dedicated "Edit Layout" button visible on hover/expand, enters Focus
Mode for that page.

### 2.2 Focus Mode (drill-in)

A full-width layout editor for a single page.

**Top bar:**
- Back arrow (returns to Overview Mode; also Escape key)
- Page title (editable inline)
- Page navigation: prev/next arrows or dropdown to jump between pages

**Breakpoint bar:**
- Horizontal toggle below the top bar
- Shows "Base" plus named breakpoints from `structure.breakpointNames`
- Active breakpoint highlighted; clicking switches the grid context
- Visible but non-demanding — Base is always the default

**Grid canvas (main area):**
- 12-column grid with subtle column guide lines
- Items render as labeled blocks on the grid
- Direct manipulation: drag to resize, reorder, and place
- See Section 3 for full interaction spec

**Field palette (collapsible right panel):**
- Unplaced items grouped by definition parent
- Already-placed items greyed out
- Drag from palette to grid, or quick-add button
- See Section 4 for full spec

---

## 3. Grid Canvas

### 3.1 Item Blocks

Each item on the grid renders as a block showing:
- Field label (truncated if needed)
- Type indicator (icon or subtle text: text, date, choice, group, display)
- Width badge (e.g., "6/12")
- Status coloring: valid = accent, broken = amber
- Groups show a child-count indicator (e.g., "5 fields")
- Repeatable groups show a repeat icon alongside the child count

**Broken items:** A broken item (key not found in definition) renders in
amber with a "Remove" action. Resize and reorder are disabled — the item
has no meaningful layout to edit. Clicking a broken block selects it and
shows only the Remove option in the toolbar.

**Required type additions to `PageItemView`:**
- `itemType: 'field' | 'group' | 'display'` — enables type indicator
- `childCount?: number` — enables "5 fields" indicator on groups
- `repeatable?: boolean` — enables repeat indicator on groups

These are small additions to `resolvePageView` in formspec-core. The
function already walks the definition tree for label resolution; adding
type, child count, and repeatable lookups is a minor extension.

### 3.2 Interactions

| Action | Mechanism |
|--------|-----------|
| Resize | Drag right edge of block. Snaps to column boundaries (1–12). Column guides highlight during drag. |
| Reorder | Drag block vertically. Items reflow. Drop indicator shows landing position. |
| Place | Drag from palette onto grid. Drop indicator shows where item will land. |
| Remove | Hover shows ×. Click × or select + Delete/Backspace. Item returns to palette. |
| Select | Click block. Selection toolbar appears (see 3.3). |

### 3.3 Selection Toolbar

Appears above or below the selected block:
- **Width presets:** Full (12) · Half (6) · Third (4) · Quarter (3)
- **Custom width:** Number input (1–12)
- **Offset input:** Number input for grid start column (advanced, collapsed by default)

The presets use plain-English labels. The number input is always available
for power users.

### 3.4 Row Wrapping

Items flow left-to-right, wrapping to new rows when cumulative span
exceeds 12 — matching CSS Grid behavior. Each visual row in the canvas
is separated by a subtle divider. Row wrapping is automatic and
non-configurable; it mirrors what the rendered form will produce.

Example: Three items at span 6 render as two rows — [6, 6] and [6].

### 3.5 Breakpoint Context

When a non-base breakpoint is active in the breakpoint bar:
- Block widths/offsets reflect that breakpoint's overrides
- Unset overrides show the inherited base value in muted style
- A "hidden" toggle appears per block (hide item at this breakpoint)
- Resize/reorder operations write to the active breakpoint's overrides,
  not the base values

The grid canvas does NOT attempt to visually resize to simulate viewport
width. It always renders at full available width with the column count
and values reflecting the active breakpoint.

---

## 4. Field Palette

### 4.1 Structure

A collapsible right panel in Focus Mode. Contains all definition items
that can be placed on pages.

Items are organized by definition parent group (collapsible sections):
- Section header: group label + placed/total count
- Each item: label + type icon
- Already-placed items: greyed out with checkmark, non-draggable
- Unplaced items: draggable, with a "+" quick-add button

Quick-add places the item at the end of the grid at span 12.

### 4.2 Scope Constraint

The palette shows only items the reconciler can resolve. Currently,
the reconciler indexes top-level nodes only (`tree-reconciler.ts`
lines 212–216). Until reconciler Phase 4 (nested field extraction)
ships, the palette is restricted to:

- Top-level groups
- Top-level fields
- Top-level display items

Nested fields within groups are NOT shown in the palette and cannot
be placed individually. When the reconciler is updated to support
nested key resolution, the palette expands to show nested items
with an "extract from group" affordance.

This constraint prevents the UI from allowing actions the engine
cannot handle.

### 4.3 Residual Groups

When individual fields are extracted from a group (post-Phase 4),
the group remains on the page containing its non-extracted children.
The palette shows extracted fields as independently placed; the
group's palette entry shows its reduced child count.

---

## 5. Breakpoint Switcher

### 5.1 Layout

A horizontal bar below the page title in Focus Mode. Contains:
- "Base" toggle (always present, always first)
- Named breakpoint toggles from `structure.breakpointNames`
  (typically `sm`, `md`, `lg`)

Active breakpoint is visually highlighted. Only one active at a time.
Each breakpoint toggle shows a tooltip with the pixel value (e.g.,
"sm (576px)") so authors understand what the breakpoint means.

### 5.2 Behavior

Switching breakpoints changes:
- Which width/offset values the grid canvas displays
- Which values resize/reorder operations write to
- Whether "hidden" toggles are shown per item
- The selection toolbar's width presets write to the active breakpoint

It does NOT change:
- The physical width of the grid canvas
- Which items are on the page (hiding is per-breakpoint, not removal)
- The palette contents
- The selected item (selection is preserved across breakpoint switches)

### 5.2.1 Phantom Breakpoints

When the theme has no explicit `breakpoints` object, `resolvePageView`
returns default names (`sm`, `md`, `lg`) but no pixel values exist in the
theme. If the user edits a responsive override for the first time, the
system auto-creates the `breakpoints` object with sensible defaults:
`{ sm: 576, md: 768, lg: 1024 }`. This ensures responsive overrides are
never structurally orphaned (keys without definitions).

### 5.3 Override Indicators

When viewing a non-base breakpoint:
- Items with explicit overrides show their override values normally
- Items without overrides show the inherited base value in muted/italic
  style, indicating "this is inherited, not explicitly set"
- Editing an inherited value promotes it to an explicit override

---

## 6. Data Flow

### 6.1 Read Path

```
project.state (theme + definition)
  → resolvePageView(state)
  → PageStructureView { pages, unassigned, breakpointNames, diagnostics }
  → usePageStructure() hook (memoized)
  → Overview Mode: page cards with mini grid previews
  → Focus Mode: grid canvas + palette + breakpoint bar
```

`resolvePageView` provides the core data. Minor additions to `PageItemView`
are needed (see Section 3.1): `itemType`, `childCount`, `repeatable`.
These extend the existing resolution function, not a new query.

`PageStructureView.breakpointNames` needs a companion field
`breakpointValues?: Record<string, number>` to support tooltips showing
pixel widths (Section 5.1).

### 6.2 Write Path

Mutations use behavioral project methods. Most are existing; one new
method is required.

| User action | Method | Status |
|-------------|--------|--------|
| Resize item | `project.setItemWidth(pageId, itemKey, width)` | Existing |
| Set offset | `project.setItemOffset(pageId, itemKey, offset)` | Existing |
| Reorder item (up/down) | `project.reorderItemOnPage(pageId, itemKey, direction)` | Existing |
| **Move item to position** | **`project.moveItemOnPageToIndex(pageId, itemKey, targetIndex)`** | **New** |
| Place item | `project.placeOnPage(target, pageId, { span })` | Existing |
| Remove item | `project.removeItemFromPage(pageId, itemKey)` | Existing |
| Set responsive | `project.setItemResponsive(pageId, itemKey, breakpoint, overrides)` | Existing |
| Add page | `project.addPage(title)` | Existing |
| Delete page | `project.removePage(pageId)` | Existing |
| Reorder page | `project.reorderPage(pageId, direction)` or `project.movePageToIndex(pageId, index)` | Existing |
| Update title | `project.updatePage(pageId, { title })` | Existing |
| Update desc | `project.updatePage(pageId, { description })` | Existing |
| Set mode | `project.setFlow(mode)` | Existing |

#### 6.2.1 New Method: `moveItemOnPageToIndex`

```ts
moveItemOnPageToIndex(pageId: string, itemKey: string, targetIndex: number): void
```

Required because `reorderItemOnPage` only supports `direction: 'up' | 'down'`
(one position at a time). Drag-to-reorder and drag-from-palette both need
arbitrary-position placement. The underlying handler (`pages.reorderRegion`)
already accepts `targetIndex` — this method is a thin behavioral wrapper,
following the same pattern as the existing Phase 2 methods.

#### 6.2.2 `addPage` Behavior Note

`addPage(title)` creates a paired definition group alongside the theme
page. This is intentional — in Studio, every page is backed by a
definition group that serves as the logical container for items on that
page. The layout builder's palette then lets the user populate the page
by placing items from the flat palette. The group is the structural
anchor; the page regions define the visual layout.

#### 6.2.3 `removePage` Safety

`removePage(pageId)` cascades into definition deletion when a page's
regions reference root-level groups. The layout builder must show a
confirmation dialog before deleting a page that has placed items:
"Deleting this page will also remove its associated group and N fields
from the form definition. This cannot be undone."

### 6.3 Palette Query

The palette needs to know which items are placed and which are not.
`PageStructureView.unassigned` already provides unplaced items.
For placed-but-greyed-out display, the palette walks `pages[].items[]`
to collect placed keys. This is a UI-local derivation, not a new query.

---

## 7. Component Architecture

### 7.1 New Components

| Component | Purpose |
|-----------|---------|
| `PagesFocusView` | Focus Mode container: top bar + breakpoint bar + grid canvas + palette |
| `GridCanvas` | 12-column grid with item blocks, drag/resize/reorder |
| `GridItemBlock` | Single item on the grid canvas |
| `SelectionToolbar` | Width presets + custom input, shown for selected item |
| `FieldPalette` | Collapsible right panel with grouped unplaced items |
| `BreakpointBar` | Horizontal breakpoint switcher |

### 7.2 Modified Components

| Component | Change |
|-----------|--------|
| `PagesTab` | Add mode state (overview/focus). Render `PagesFocusView` when in focus mode. Add "Edit Layout" entry point to PageCard. |
| `PageCard` | Add click handler on grid preview to enter focus mode. Make description always visible when set. |

### 7.3 State Management

- `focusedPageId: string | null` — which page is in focus mode (null = overview)
- `activeBreakpoint: string` — which breakpoint is active in focus mode ("base" default)
- `selectedItemKey: string | null` — which item is selected on the grid canvas
- `isPaletteOpen: boolean` — palette panel visibility

All state is local to PagesTab. No new context providers needed.

---

## 8. Interaction Details

### 8.1 Entering Focus Mode

- Click grid preview in a PageCard → focus on that page
- Click "Edit Layout" button (visible on card hover/expand) → focus
- Keyboard: select a card, press Enter → focus

### 8.2 Exiting Focus Mode

- Click back arrow in top bar
- Press Escape (when no item is selected)
- Both return to Overview Mode, scrolled to the previously-focused card

**Escape key priority:** If an item is selected, the first Escape
deselects it. A second Escape (with nothing selected) exits Focus Mode.
This prevents accidental exits during editing.

### 8.3 Page Navigation in Focus Mode

- Prev/Next arrows step through pages in order
- Dropdown allows jumping to any page
- Navigating preserves focus mode (no return to overview)

### 8.4 Drag-to-Resize Details

- Drag starts on right edge of a block (cursor changes to `col-resize`)
- During drag: column guides highlight, showing snap targets
- Minimum span: 1. Maximum span: 12.
- Snap threshold: nearest column boundary
- On drop: `project.setItemWidth()` is called with the new span
- If active breakpoint is not "base": `project.setItemResponsive()` is called instead

### 8.5 Drag-to-Reorder Details

- Drag starts on the block body (not the right edge)
- During drag: other items shift to show the drop position
- Uses existing `@dnd-kit/react` already in the project
- On drop: `project.moveItemOnPageToIndex(pageId, itemKey, targetIndex)`
  is called — a single atomic operation (one undo step)

### 8.6 Drag-from-Palette Details

- Drag starts on an unplaced item in the palette
- Grid canvas shows drop indicators between existing items
- On drop: `project.placeOnPage(target, pageId, { span: 12 })` is called
  (where `target` is the item key; dotted paths accepted for nested items),
  then `project.moveItemOnPageToIndex()` to position it at the drop index
- These are two operations; undo reverses both (place + position)

### 8.7 Dormant Pages (Single Mode)

When `pageMode` is `single`, pages are preserved as dormant data.
In Overview Mode, dormant page cards are shown with reduced opacity
and a "dormant" badge. In Focus Mode, dormant pages are fully editable
— the user can pre-arrange layouts before switching to wizard/tabs.
This is useful for preparing page layouts without activating navigation.

### 8.8 Focus Mode Defensive Guards

**Focused page deleted:** If the focused page disappears (via undo,
`removePage`, or external mutation), Focus Mode falls back to Overview
Mode automatically. The component checks that `focusedPageId` still
exists in the resolved pages on each render.

**Adding a page while in Focus Mode:** The "Add Page" action is
available only in Overview Mode. The user must exit Focus Mode first.
Page navigation (prev/next/dropdown) in Focus Mode cycles only through
existing pages.

### 8.9 Empty Theme Pages

When `formPresentation.pageMode` is `wizard` or `tabs` but `theme.pages`
is empty (no pages exist), the Pages tab shows a prompt: "Create pages
to organize your form into steps." with an "Auto-generate from groups"
button that calls `autoGeneratePages()`. This handles the case where a
definition uses Tier 1 pagination hints (`presentation.layout.page` on
groups) but has no Tier 2 theme pages — the user is guided to bridge the
gap rather than seeing an empty tab.

---

## 9. Scope Boundaries

### In Scope

- Two-mode architecture (Overview + Focus)
- Grid canvas with drag-to-resize, reorder, place, remove
- Field palette (top-level items only)
- Breakpoint switcher with pixel value tooltips
- Width presets (Full/Half/Third/Quarter + custom)
- Page description as first-class field
- One new behavioral method: `moveItemOnPageToIndex`
- Minor type additions to `PageItemView` (itemType, childCount, repeatable)
- `breakpointValues` addition to `PageStructureView`
- `removePage` confirmation dialog
- Empty theme pages prompt with auto-generate button
- Dormant page editing in Focus Mode

### Out of Scope (Future Work)

- **Nested field extraction** — Depends on reconciler Phase 4.
  When it ships, the palette expands to show nested fields, and
  residual group behavior activates. Phase 4 must also address:
  whether extracted fields render inside their parent group (duplicate),
  re-absorption of extracted fields back into groups, cross-page
  extraction semantics, and FEL expressions using relative sibling
  references that would break when a field is lifted out of its group.
- **Cross-page item move** — Dragging an item directly from one page
  to another. Currently requires remove + navigate + place (3 steps).
  Natural extension of the drag infrastructure.
- **Bulk operations** — Multi-select in palette for batch placement,
  or multi-select on grid for batch width changes.
- **Group internal layout editing** — Groups appear as opaque blocks
  on the grid canvas. Configuring a group's internal layout (`flow`,
  `columns`) requires the Editor tab. A drill-in that expands a group
  to show its children with internal layout controls is a natural
  extension but out of scope for v1.
- **Conditional pages / page branching** — Requires new spec work
  for page-level relevance expressions.
- **Page-level validation gating** — Wizard forward-navigation
  validation is a component-tier concern, not a theme-tier one.
- **Live rendered preview** — Showing actual rendered fields instead
  of abstract blocks. Separate feature.
- **Page templates** — Pre-built page patterns for common use cases.
- **Sidebar/pages source reconciliation** — Aligning the sidebar's
  page-derived section list with the Pages tab. Related but separate.
- **Keyboard accessibility for grid canvas** — Arrow keys for item
  movement, keyboard shortcuts for width presets. Important for
  accessibility but separate from the core layout builder.

---

## 10. Success Criteria

After implementation:

1. User can see all pages at a glance in Overview Mode with item counts
   and mini grid previews.
2. User can click into any page to enter Focus Mode with a full-width
   grid canvas.
3. User can drag the right edge of a field block to resize its column
   span, with visual column guides.
4. User can drag fields from the palette onto the grid to place them
   at a specific position.
5. User can remove fields from the grid (they return to the palette).
6. User can switch breakpoints and see/edit per-breakpoint overrides.
7. User can use named width presets (Full/Half/Third/Quarter) instead
   of remembering column numbers.
8. Escape deselects first, then exits Focus Mode on second press.
9. One new method added: `moveItemOnPageToIndex`. All other mutations
   use existing behavioral API methods.
10. The palette does not show items the reconciler cannot resolve.
11. Deleting a page with placed items shows a confirmation dialog.
12. Item blocks show type indicators and group child counts.
13. Breakpoint tooltips show pixel values.

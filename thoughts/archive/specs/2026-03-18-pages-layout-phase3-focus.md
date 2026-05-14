# Pages Layout Builder — Phase 3: Focus Mode

**Date:** 2026-03-18
**Status:** Draft
**Scope:** formspec-studio (new components: PagesFocusView, GridCanvas, FieldPalette, BreakpointBar)
**Prerequisite:** Phase 1 (core prerequisites), Phase 2 (overview mode + focus scaffold)

---

## 1. Context

Focus Mode is the core of the layout builder — a full-width editor for
a single page's 12-column grid layout. Phase 2 added the scaffold
(state variable, conditional render, entry point). This phase implements
the actual editor.

All data comes from `resolvePageView` (no new queries). All mutations
use existing behavioral API methods plus `moveItemOnPageToIndex` from
Phase 1.

---

## 2. PagesFocusView

Container component that replaces the Overview Mode render when
`focusedPageId` is set.

### 2.1 Layout

```
┌─────────────────────────────────────────────────┐
│ ← Back   Page Title (editable)    ◀ 2/5 ▶  ▼  │  ← Top bar
├─────────────────────────────────────────────────┤
│  Base  │  sm  │  md  │  lg                      │  ← Breakpoint bar
├──────────────────────────────────┬──────────────┤
│                                  │              │
│         Grid Canvas              │    Field     │
│                                  │   Palette    │
│   (12-column grid with          │              │
│    draggable item blocks)        │  (collapsible│
│                                  │   right      │
│                                  │   panel)     │
│                                  │              │
└──────────────────────────────────┴──────────────┘
```

### 2.2 Props

```ts
interface PagesFocusViewProps {
  pageId: string;
  onBack: () => void;
  onNavigate: (pageId: string) => void;
}
```

### 2.3 State

```ts
const [activeBreakpoint, setActiveBreakpoint] = useState('base');
const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
const [isPaletteOpen, setIsPaletteOpen] = useState(true);
```

### 2.4 Top Bar

- **Back arrow:** Calls `onBack()`. Keyboard: Escape (when no item
  selected).
- **Page title:** Editable inline. On blur/Enter: calls
  `project.updatePage(pageId, { title })`.
- **Page navigation:** Shows current position (e.g., "2/5"). Prev/Next
  arrows call `onNavigate()` with the adjacent page ID. Dropdown lists
  all pages for quick jump.
- **Escape priority:** If `selectedItemKey` is set, first Escape
  deselects. Second Escape (nothing selected) exits Focus Mode.

---

## 3. BreakpointBar

### 3.1 Rendering

Horizontal bar of toggle buttons. "Base" is always first. Named
breakpoints come from `structure.breakpointNames`. Active breakpoint
is visually highlighted.

Each breakpoint toggle shows a tooltip with the pixel value from
`structure.breakpointValues` (e.g., "sm (576px)"). When
`breakpointValues` is undefined (no theme breakpoints configured),
tooltips show the name only.

### 3.2 Phantom Breakpoint Handling

When the user first edits a responsive override and the theme has no
`breakpoints` object, auto-create it with sensible defaults before
writing the override:

```ts
if (!project.state.theme.breakpoints) {
  project.dispatch('theme.setBreakpoints', {
    breakpoints: { sm: 576, md: 768, lg: 1024 }
  });
}
```

If a `theme.setBreakpoints` handler does not exist, this can be done
via direct state mutation before the responsive override dispatch.

---

## 4. GridCanvas

### 4.1 Structure

A `div` with `display: grid; grid-template-columns: repeat(12, 1fr)`.
Subtle vertical column guide lines (1px, low-opacity border on each
column). Items render as `GridItemBlock` children.

### 4.2 GridItemBlock

Each block spans its `width` (or breakpoint override) columns via
`gridColumn: span N`.

**Content:**
- Field label (truncated)
- Type indicator icon (`itemType` from Phase 1)
- Width badge ("6/12")
- For groups: child count ("5 fields") and repeatable indicator
- Status coloring: valid = accent, broken = amber

**Interactions:**
- **Click:** Selects the block. Shows `SelectionToolbar`.
- **Drag right edge:** Resize. Cursor `col-resize` on the right 8px.
  During drag, column guides highlight snap targets. On drop:
  - Base breakpoint: `project.setItemWidth(pageId, key, newWidth)`
  - Other breakpoint: `project.setItemResponsive(pageId, key, bp, { width: newWidth })`
- **Drag body:** Reorder. Other blocks shift to show drop position.
  On drop: `project.moveItemOnPageToIndex(pageId, key, targetIndex)`.
- **Hover ×:** Remove button. Calls
  `project.removeItemFromPage(pageId, key)`.

**Broken items:** Amber coloring. Resize and reorder disabled. Click
shows only "Remove" in the toolbar.

### 4.3 SelectionToolbar

Appears above or below the selected block (positioned to avoid overflow).

**Controls:**
- Width presets: **Full** (12) · **Half** (6) · **Third** (4) · **Quarter** (3)
- Custom width input (1–12)
- Offset input (collapsed by default, expandable via "Offset" toggle)

All controls are breakpoint-aware: when a non-base breakpoint is active,
writes go to `project.setItemResponsive()` instead of
`project.setItemWidth()` / `project.setItemOffset()`.

Click outside the selected block or press Escape to deselect.

### 4.4 Row Wrapping

Items flow left-to-right, wrapping when cumulative span exceeds 12.
Each visual row is separated by a subtle divider. This matches CSS Grid
behavior in the rendered form.

### 4.5 Breakpoint Context

When a non-base breakpoint is active:
- Block widths reflect that breakpoint's overrides
- Unset overrides show inherited base value in muted/italic style
- A "hidden" toggle appears on each block (eye icon)
- Resize writes to the active breakpoint's responsive overrides

The grid canvas does NOT simulate viewport width. It always renders at
full available width.

### 4.6 Drop Zone

When dragging from the palette, the grid canvas shows drop indicators
(horizontal lines between existing items) at valid drop positions.
Dropping calls `project.placeOnPage(target, pageId, { span: 12 })`,
then `project.moveItemOnPageToIndex(pageId, key, targetIndex)`.

### 4.7 Empty Grid

When a page has no items, the grid canvas shows a centered message:
"Drag fields from the palette to build this page's layout."

---

## 5. FieldPalette

### 5.1 Structure

Collapsible right panel. Default open. Toggle button on the panel edge
or in the top bar.

**Organization:** Items grouped by definition parent:
- **Root items** (no parent group): listed at the top
- **Per-group sections:** Collapsible, header shows group label +
  placed/total count (e.g., "Applicant Info · 3/5 placed")

**Each item row:**
- Type icon + label
- If placed on ANY page: greyed out, checkmark, non-draggable
- If unplaced: full color, draggable, "+" quick-add button

### 5.2 Scope Constraint

Only top-level items are shown. Nested fields within groups are not
visible in the palette. This matches the reconciler's current capability
(top-level node indexing only). When Phase 4 (nested field extraction)
ships, the palette expands.

### 5.3 Quick-Add

Clicking "+" on an unplaced item calls:
```ts
project.placeOnPage(itemKey, pageId, { span: 12 });
```
The item appears at the end of the grid at full width.

### 5.4 Drag-from-Palette

Dragging an unplaced item from the palette onto the grid canvas:
1. Grid shows drop indicators between existing items
2. On drop: `placeOnPage` + `moveItemOnPageToIndex` (see Section 4.6)
3. Item transitions to greyed-out in the palette on next render

### 5.5 Placed Items Display

Items already placed on the CURRENT page show greyed with a checkmark.
Items placed on OTHER pages also show greyed (an item can only be on one
page). The palette effectively shows "what's left to place anywhere" vs
"what's already placed somewhere."

---

## 6. Dormant Pages (Single Mode)

When `pageMode` is `single`, Focus Mode is still accessible. The top bar
shows a "dormant" badge next to the page title. All editing operations
work normally — the user is pre-arranging a layout that will take effect
when mode switches to wizard/tabs.

---

## 7. Component Summary

| Component | New/Modified | Purpose |
|-----------|-------------|---------|
| `PagesFocusView` | New | Focus Mode container |
| `GridCanvas` | New | 12-column interactive grid |
| `GridItemBlock` | New | Single item block on grid |
| `SelectionToolbar` | New | Width presets + inputs for selected item |
| `FieldPalette` | New | Collapsible right panel with item list |
| `BreakpointBar` | New | Horizontal breakpoint toggle bar |
| `PagesTab` | Modified | Replace Phase 2 stub with real `PagesFocusView` |

---

## 8. Drag-and-Drop Architecture

The project already uses `@dnd-kit/react`. Focus Mode introduces a
second drag context (the grid canvas) that coexists with the Overview
Mode's page-reorder drag context. Since only one mode is active at a
time, these do not conflict.

Within Focus Mode, two drag sources exist:
1. **Grid blocks** — drag to reorder (body) or resize (right edge)
2. **Palette items** — drag to place on grid

Both share the same `DragDropProvider` within `PagesFocusView`.

**Resize vs reorder disambiguation:** Drag starting within 8px of the
right edge of a block triggers resize mode (cursor: `col-resize`).
Drag starting elsewhere on the block triggers reorder mode (cursor:
`grab`).

---

## 9. TDD

### GridCanvas Tests

- Test: renders item blocks with correct grid column spans
- Test: selecting a block shows the selection toolbar
- Test: width preset buttons call `setItemWidth` / `setItemResponsive`
- Test: drag-to-reorder calls `moveItemOnPageToIndex`
- Test: removing an item calls `removeItemFromPage`
- Test: broken items render in amber with only Remove action
- Test: empty grid shows placeholder message
- Test: row wrapping occurs when spans exceed 12

### FieldPalette Tests

- Test: shows unplaced items as draggable
- Test: shows placed items as greyed out
- Test: quick-add button calls `placeOnPage`
- Test: only top-level items are shown (no nested fields)
- Test: items grouped by parent with section headers

### BreakpointBar Tests

- Test: renders "Base" plus named breakpoints
- Test: switching breakpoint updates active state
- Test: tooltip shows pixel value when available

### PagesFocusView Tests

- Test: back button calls `onBack`
- Test: Escape deselects item first, then exits
- Test: page navigation calls `onNavigate` with correct page ID
- Test: page title is editable

### Integration Tests

- Test: drag from palette to grid places item
- Test: resize in non-base breakpoint writes to responsive overrides
- Test: phantom breakpoint auto-creates breakpoints object

---

## 10. Success Criteria

1. User can enter Focus Mode from Overview (Phase 2 entry point)
2. Grid canvas renders items as labeled blocks on a 12-column grid
3. Drag right edge to resize — snaps to columns, writes width
4. Drag body to reorder — items reflow, writes to target index
5. Drag from palette to grid — places item at drop position
6. Remove item (× or Delete) — returns to palette
7. Selection toolbar shows width presets (Full/Half/Third/Quarter)
8. Breakpoint bar switches grid context between base and named breakpoints
9. Responsive overrides shown in muted style when inherited
10. Palette shows unplaced items grouped by parent, placed items greyed
11. Escape deselects first, then exits Focus Mode
12. Back arrow returns to Overview Mode
13. Dormant pages editable in Focus Mode with badge

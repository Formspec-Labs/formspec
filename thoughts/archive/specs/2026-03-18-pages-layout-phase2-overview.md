# Pages Layout Builder — Phase 2: Overview Mode

**Date:** 2026-03-18
**Status:** Draft
**Scope:** formspec-studio PagesTab (Overview Mode enhancements)
**Prerequisite:** Phase 1 (core prerequisites)
**Blocks:** Phase 3 (Focus Mode entry point lives here)

---

## 1. Context

Overview Mode is the default view of the Pages tab — a vertical list of
page cards showing all pages at a glance. Most of this already exists in
the current `PagesTab.tsx`. This phase refines it and adds the entry
point into Focus Mode (Phase 3).

The current PagesTab already has: page cards with titles, item counts,
mini grid previews, expand/collapse, drag-to-reorder pages, mode
selector, and an unassigned items section. This phase adds what's
missing and adjusts what needs refinement.

---

## 2. Changes to Existing PageCard

### 2.1 Description Prominence

**Current:** Description is hidden behind a "+ Add description" button
that only appears in expanded state.

**New:** When a description is set, it is always visible below the title
in both collapsed and expanded states (one line, truncated). The
"+ Add description" affordance remains in expanded state when no
description is set.

### 2.2 Type Indicators in Mini Grid Preview

**Current:** Colored blocks in the mini grid preview are plain rectangles
with no content.

**New:** Each block in the mini grid preview shows a truncated label
(requires sufficient height — expand the mini preview height from 16px
to 24px). Item type coloring: groups get a slightly different shade to
distinguish them from fields.

### 2.3 "Edit Layout" Entry Point

**New:** Each PageCard gets an "Edit Layout" button:
- In collapsed state: visible on card hover, positioned near the
  expand/collapse toggle
- In expanded state: always visible in the card's action row
- Clicking it enters Focus Mode for that page (Phase 3)
- The mini grid preview itself is also clickable as an entry point

Until Phase 3 is implemented, these entry points are non-functional
(the `focusedPageId` state and `PagesFocusView` component don't exist
yet). Phase 2 adds the state variable and conditional render scaffold
so Phase 3 can plug in.

### 2.4 Item Block Details in Expanded View

**Current:** Expanded item list shows label, width input, offset toggle,
responsive overrides, and reorder buttons.

**New:** Add type indicator icon next to each item label. For groups,
show child count in muted text (e.g., "Applicant Information · group ·
5 fields"). For repeatable groups, add a repeat icon. These use the
new `itemType`, `childCount`, and `repeatable` fields from Phase 1.

---

## 3. Empty State and Prompts

### 3.1 Empty Theme Pages

When `formPresentation.pageMode` is `wizard` or `tabs` but `theme.pages`
is empty, show a centered prompt:

> **No pages yet**
> Create pages to organize your form into steps.
> [Auto-generate from groups] [+ Add Page]

"Auto-generate from groups" calls `project.autoGeneratePages()`.
"+ Add Page" calls `project.addPage('Page 1')`.

This replaces the current behavior of showing an empty list.

### 3.2 Single Mode Message

When `pageMode` is `single`, show the existing message: "Switch to
Wizard or Tabs to organize your form into pages." Dormant pages (if
any) are shown below with reduced opacity and a "dormant" badge but
remain expandable for inspection.

---

## 4. removePage Confirmation

### 4.1 Problem

`removePage` cascades into definition deletion when regions reference
root-level groups. A misclick could destroy form structure.

### 4.2 Behavior

Before calling `project.removePage(pageId)`, show a confirmation dialog:
- If the page has placed items: "Deleting this page will also remove its
  associated group and N fields from the form definition. Continue?"
  with [Cancel] [Delete] buttons.
- If the page is empty (no regions): delete immediately without
  confirmation.

---

## 5. Focus Mode Scaffold

### 5.1 State

Add to PagesTab local state:

```ts
const [focusedPageId, setFocusedPageId] = useState<string | null>(null);
```

### 5.2 Conditional Render

```tsx
if (focusedPageId) {
  // Phase 3 plugs in here
  return <PagesFocusView pageId={focusedPageId} onBack={() => setFocusedPageId(null)} />;
}
// ... existing Overview Mode render
```

Until Phase 3 implements `PagesFocusView`, this branch renders a
placeholder: "Focus Mode — coming soon" with a back button.

### 5.3 Defensive Guard

On each render, check that `focusedPageId` still exists in the resolved
pages. If the focused page was deleted (via undo or external mutation),
reset to Overview Mode:

```ts
useEffect(() => {
  if (focusedPageId && !structure.pages.some(p => p.id === focusedPageId)) {
    setFocusedPageId(null);
  }
}, [focusedPageId, structure.pages]);
```

---

## 6. Component Changes

| Component | Change |
|-----------|--------|
| `PagesTab` | Add `focusedPageId` state. Conditional render for focus/overview. Add empty state prompt. Add removePage confirmation. |
| `PageCard` | Show description in collapsed state. Add "Edit Layout" button. Add type indicators to expanded item list. Increase mini grid preview height. |

No new components in this phase. `PagesFocusView` is a stub.

---

## 7. TDD

### Tests to Add

**PageCard enhancements:**
- Test: description visible in collapsed state when set
- Test: "Edit Layout" button calls `onEditLayout` callback
- Test: expanded items show type indicator text
- Test: expanded items show child count for groups

**Empty state:**
- Test: empty pages prompt shown when pageMode is wizard and no pages
- Test: "Auto-generate from groups" button calls `autoGeneratePages`
- Test: single mode shows dormant message

**removePage confirmation:**
- Test: deleting a page with items shows confirmation dialog
- Test: deleting an empty page skips confirmation
- Test: confirming deletion calls `removePage`
- Test: canceling confirmation does not call `removePage`

**Focus mode scaffold:**
- Test: clicking "Edit Layout" sets `focusedPageId`
- Test: focused page disappearing resets to overview

### Existing Tests

All existing `pages-tab.test.tsx` tests must continue to pass. The
expanded item list tests may need minor updates if the rendered output
changes (type indicator text added).

---

## 8. Success Criteria

1. Page descriptions visible in collapsed state when set
2. Type indicators and child counts shown in expanded item list
3. Empty pages prompt with auto-generate button shown when appropriate
4. removePage shows confirmation dialog for pages with items
5. "Edit Layout" button exists and sets `focusedPageId` state
6. Focused page deletion gracefully returns to overview
7. All existing PagesTab tests pass

# Editor Canvas Audit & Refactor

## Context

The "Component Tree as Canvas Overlay" feature was implemented across 18 TDD steps. It works, tests pass (67 unit + 30 E2E), but the code grew organically with bug-fix patches (bindKeyMap fallback, display node ID fix, dual-dispatch routing). The result: duplicated types, split code paths, a 722-line EditorCanvas, an 848-line ItemProperties, and inconsistent patterns across block components.

**Goal**: Top-down cleanup — DRY, KISS, and boy-scout. Each pass is independently shippable and leaves all tests green.

## Audit Scope

All paths relative to `packages/formspec-studio/` unless noted.

### Source files (2,077 lines total)

| File | Lines | Health | Key Issues |
|------|-------|--------|------------|
| `src/workspaces/editor/EditorCanvas.tsx` | 722 | Red | 11-param renderTreeNodes, mixed concerns (rendering + context menu + operations + DnD wiring) |
| `src/workspaces/editor/ItemProperties.tsx` | 848 | Red | 9 internal sub-components, file too large to scan |
| `src/workspaces/editor/dnd/compute-drop-target.ts` | 304 | Red | Two drop-target functions with incompatible interfaces, duplicated helpers |
| `src/workspaces/editor/dnd/use-canvas-dnd.ts` | 220 | Yellow | Runtime type reconstruction (lines 130-139), layout branching |
| `src/lib/tree-helpers.ts` | 207 | Yellow | bindKeyMap fallback applied inconsistently vs EditorCanvas |
| `src/lib/field-helpers.ts` | 253 | Yellow | `flatItems()` duplicates `buildDefLookup()` walk |
| `src/workspaces/editor/FieldBlock.tsx` | 140 | Green | Tab navigation coupled to DOM; indent guide only here |
| `src/workspaces/editor/GroupBlock.tsx` | 86 | Green | Indent 20px |
| `src/workspaces/editor/LayoutBlock.tsx` | 57 | Green | Indent 20px |
| `src/workspaces/editor/DisplayBlock.tsx` | 55 | Green | Indent **24px** (inconsistent) |

### Test files (3,024 lines, ~182 cases)

| File | Tests | Issue |
|------|-------|-------|
| `tests/workspaces/editor/editor-canvas.test.tsx` | 30 | `renderCanvas()` duplicated 3x across files |
| `tests/workspaces/editor/item-properties.test.tsx` | 52 | 1 pre-existing failure (RadioGroup/Select mismatch) |
| `tests/workspaces/editor/dnd/compute-drop-target.test.ts` | 37 | Tests both functions separately |
| `tests/lib/tree-helpers.test.ts` | 20 | Good |
| `tests/workspaces/editor/dnd/canvas-dnd.test.tsx` | 10 | `renderCanvas()` dup |
| `tests/workspaces/editor/context-menu.test.tsx` | 5 | `renderCanvas()` dup |
| Other test files | 28 | No issues |

---

## Pass 1: Unify flat-entry types and drop-target functions

**Problem**: Two parallel type hierarchies (`FlatEntry` vs `TreeFlatEntry`) and two drop-target functions (`computeDropTarget` vs `computeTreeDropTarget`). `use-canvas-dnd.ts` reconstructs one from the other at runtime with unsafe casts.

**Fix**:

1. **Single `FlatEntry` type** in `tree-helpers.ts` replacing both:
   ```typescript
   export interface FlatEntry {
     id: string;           // defPath for bound, '__node:<nodeId>' for layout
     category: 'field' | 'group' | 'display' | 'layout';
     depth: number;
     hasChildren: boolean;
     defPath: string | null;
     nodeId?: string;
     bind?: string;
   }
   ```
   Delete `TreeFlatEntry`. Update `flattenComponentTree` to return `FlatEntry[]`.

2. **Single `computeDropTarget()`** in `compute-drop-target.ts` that handles all cases:
   - Replaces both existing functions
   - Returns `DropAction[]` (component.moveNode and/or definition.moveItem)
   - Layout-transparent logic built in, not branched externally
   - Reuse: existing helper functions (`isDescendantOf`, `siblingIndex`, etc.) stay

3. **Simplify `use-canvas-dnd.ts`**: Remove `involvesLayout` branching. Remove runtime type reconstruction (lines 130-139). Single call to unified `computeDropTarget`.

**Files**: `tree-helpers.ts`, `compute-drop-target.ts`, `use-canvas-dnd.ts`, `EditorCanvas.tsx` (update imports/types)
**Tests**: Update `compute-drop-target.test.ts` (merge test suites), update `canvas-dnd.test.tsx`

---

## Pass 2: Extract shared block utilities

**Problem**: All 4 block components duplicate selection styling, indent computation, and target registration. DisplayBlock uses 24px indent vs 20px everywhere else.

**Fix**:

1. **New file `src/workspaces/editor/block-utils.ts`**:
   ```typescript
   // Shared props interface
   export interface BlockBaseProps {
     itemKey: string;
     itemPath: string;
     registerTarget: (path: string, element: HTMLElement | null) => void;
     depth: number;
     selected: boolean;
     isInSelection?: boolean;
     onSelect: (e: React.MouseEvent) => void;
   }

   // Consistent indent (20px for all)
   export function blockIndent(depth: number): number { return depth * 20; }

   // Target registration ref callback
   export function blockRef(path: string, register: RegisterFn) {
     return (el: HTMLElement | null) => register(path, el);
   }
   ```

2. **Fix DisplayBlock indent**: 24 → 20.

3. **Update block components** to use `BlockBaseProps & { ...specific }` and shared utilities.

**Files**: New `block-utils.ts`, `FieldBlock.tsx`, `GroupBlock.tsx`, `DisplayBlock.tsx`, `LayoutBlock.tsx`
**Tests**: Existing block tests should still pass. Add `block-utils.test.ts` if any logic beyond trivial.

---

## Pass 3: Simplify renderTreeNodes

**Problem**: 11 parameters, duplicated defPath resolution logic across 3 branches, duplicated selection state computation.

**Fix**:

1. **Bundle parameters into a context object**:
   ```typescript
   interface RenderContext {
     defLookup: Map<string, DefLookupEntry>;
     bindKeyMap: Map<string, string>;
     allBinds?: Record<string, Record<string, string>>;
     primaryKey: string | null;
     selectedKeys: Set<string>;
     handleItemClick: (e: React.MouseEvent, path: string, type: string) => void;
     registerTarget: (path: string, element: HTMLElement | null) => void;
     flatIndexMap: Map<string, number>;
   }
   ```
   Signature becomes: `renderTreeNodes(nodes, ctx, depth, defPathPrefix)` — 4 params.

2. **Extract shared helpers** within the function:
   - `resolveDefPath(key, prefix, defLookup, bindKeyMap)` — single defPath resolution with fallback
   - `selectionProps(id, primaryKey, selectedKeys, flatIndexMap)` — returns `{ isPrimary, inSelection, flatIdx }`

3. **Consider extracting to its own file** (`src/workspaces/editor/render-tree-nodes.tsx`) if EditorCanvas is still too large after this pass.

**Files**: `EditorCanvas.tsx`
**Tests**: `editor-canvas.test.tsx`, `canvas-dnd.test.tsx` — no changes needed (behavior unchanged)

---

## Pass 4: Decompose ItemProperties

**Problem**: 848 lines, 9 internal sub-components. Hard to navigate, test, or modify in isolation.

**Fix**: Extract to a folder structure:

```
src/workspaces/editor/properties/
  ItemProperties.tsx          — Router: selects which panel to show
  LayoutProperties.tsx        — Layout node panel (currently internal)
  DefinitionProperties.tsx    — Form-level metadata
  MultiSelectSummary.tsx      — Multi-select info
  FieldConfigSection.tsx      — Required, readonly, calculate config
  GroupConfigSection.tsx      — Repeat min/max config
  OptionsSection.tsx          — Inline options editor
  PropInput.tsx               — Reusable labeled input
```

Current `ItemProperties.tsx` becomes a thin router (~100 lines) that checks selection type and delegates.

**Files**: New folder, split from `ItemProperties.tsx`
**Tests**: `item-properties.test.tsx` should still pass (same public API). Fix the pre-existing RadioGroup/Select test failure while here.

---

## Pass 5: Extract EditorCanvas operations

**Problem**: `handleContextAction` is 130 lines of switch/case logic for delete, duplicate, wrap, unwrap, move, wrapInGroup. `contextMenuItems` builder is another 30 lines. These are interleaved with rendering.

**Fix**:

1. **New file `src/workspaces/editor/canvas-operations.ts`**:
   - `executeContextAction(action, path, selectionState, dispatch, batch)` — pure logic
   - `buildContextMenuItems(contextMenu, selectionCount)` — pure function

2. **EditorCanvas** calls these instead of inlining the logic.

**Files**: New `canvas-operations.ts`, `EditorCanvas.tsx`
**Tests**: `context-menu.test.tsx` still passes. Add unit tests for `canvas-operations.ts`.

---

## Pass 6: Test infrastructure cleanup

**Problem**: `renderCanvas()` duplicated 3x. No shared fixtures. Provider wrapping repeated everywhere.

**Fix**:

1. **New file `tests/workspaces/editor/test-utils.tsx`**:
   ```typescript
   export function renderCanvas(def?: any) { ... }  // shared setup
   export const fixtures = {
     simple: { ... },     // fieldA, groupX, fieldB
     withBinds: { ... },  // name, contact, notice + binds
     wizard: { ... },     // paged mode
   };
   ```

2. **Update test files** to import from shared utils.

**Files**: New `test-utils.tsx`, update 3 test files
**Tests**: All existing tests pass with shared setup.

---

## Pass 7: Remove dead weight

**Problem**: `flatItems()` in `field-helpers.ts` duplicates `buildDefLookup()` walk. Widget mappings (~76 lines) are only used by palette/inspector, not canvas.

**Fix**:

1. **Audit `flatItems()` usage**: If only used in `OptionSets.tsx` and `EditorCanvas.tsx`, replace with `buildDefLookup` where possible. If the output shape is genuinely different and both are needed, leave it.
2. **Move widget mappings** to a dedicated file (`src/lib/widget-catalog.ts`) if field-helpers is getting confusing. Low priority — only if it helps readability.

**Files**: `field-helpers.ts`, `EditorCanvas.tsx`, `OptionSets.tsx`
**Tests**: Existing tests pass.

---

## Pass Ordering & Dependencies

```
Pass 1 (types + drop targets)  ← foundational, everything depends on this
  ↓
Pass 2 (block utils)           ← independent of Pass 1
  ↓
Pass 3 (renderTreeNodes)       ← benefits from Pass 1's unified FlatEntry
  ↓
Pass 4 (ItemProperties split)  ← independent
  ↓
Pass 5 (canvas operations)     ← depends on Pass 3 (smaller EditorCanvas)
  ↓
Pass 6 (test infrastructure)   ← can happen anytime
  ↓
Pass 7 (dead weight)           ← cleanup, last
```

Passes 2, 4, and 6 are independent and can be done in any order. Pass 1 should be first since it changes the core types everything else depends on. Pass 3 should follow Pass 1. Pass 5 follows Pass 3.

## TDD Alignment

This is a **refactor** — the "R" in red/green/refactor. But refactors that change public interfaces must still go through red/green. The workflow per pass:

1. **Find relevant tests, run them** — identify the tests that cover the code you're about to change. Run them. They must be GREEN. This is your baseline.
2. **Make your structural changes** — refactor the implementation (new types, merged functions, moved code). The tests should now go RED. If they don't break, the tests aren't actually covering what you changed — stop and write tests that do before proceeding.
3. **Update the tests** — adjust tests to match the new interface/structure. They go GREEN again.
4. **Run full suite** — confirm zero regressions across everything.

**If a refactor never goes red, it has no safety net.** Either the tests aren't exercising the code path, or they're testing through too many layers of indirection. Fix the tests before moving on.

No `as any` casts or type assertions to paper over problems. If types don't line up, fix the types.

## Verification

After each pass:
1. `npx vitest run` — all unit/integration tests green
2. `npx playwright test tests/e2e/playwright/layout-components.spec.ts tests/e2e/playwright/layout-wizard-mode.spec.ts` — all 30 E2E tests green
3. Manual smoke: open studio, add fields, add Card, drag into Card, wrap/unwrap, wizard mode page switch

## Not in Scope

- New features (no new layout components, no new DnD behaviors)
- Fixing the bindKeyMap collision risk (documented in TODO.md — that's a separate design task)
- Refactoring `_rebuildComponentTree` in studio-core (separate package, separate concern)
- Visual redesign of any block component

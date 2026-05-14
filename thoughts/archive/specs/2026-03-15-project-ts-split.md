# Split `project.ts` into Domain Modules

**Date:** 2026-03-15
**Package:** `formspec-studio-core`
**File:** `packages/formspec-studio-core/src/project.ts` (2503 lines → ~150-line facade)

## Problem

`project.ts` contains the entire `Project` class: 51+ methods spanning behavior-driven authoring helpers and thin CRUD wrappers in a single 2500-line file. Two distinct audiences share one class:

- **MCP/API consumers** use behavior-driven helpers that abstract intent into multi-command orchestration (e.g., `addField`, `branch`, `removeItem`).
- **Studio UI panels** use thin CRUD wrappers that dispatch a single command and return `HelperResult` (e.g., `addThemePage`, `setToken`, `deleteRegion`).

## Design

### Module Structure

```
src/
  project.ts              # Thin facade — class shell, delegates to helper functions
  helpers/
    items.ts              # Behavior-driven definition item CRUD
    logic.ts              # FEL-driven bind/branch/validation/variable helpers
    presentation.ts       # Behavior-driven theme/layout/page/flow helpers
    crud.ts               # Thin Studio wrappers (single-dispatch, no behavior logic)
    utils.ts              # Shared private helpers
```

### Pattern: Standalone Functions

Each helper module exports **standalone functions** that take `IProjectCore` as their first argument. The `Project` class delegates to them. This avoids mixin/prototype pollution and makes functions independently testable.

```ts
// helpers/logic.ts
export function showWhen(core: IProjectCore, target: string, condition: string): HelperResult {
  validateFEL(core, condition);
  core.dispatch({ type: 'definition.setBind', payload: { path: target, properties: { relevant: condition } } });
  return { summary: `Set '${target}' visible when: ${condition}`, ... };
}

// project.ts
export class Project {
  showWhen(target: string, condition: string) { return showWhen(this.core, target, condition); }
}
```

### Module Assignments

**`helpers/items.ts`** — Behavior-driven definition item lifecycle. Every method here does at least one of: alias resolution, multi-command orchestration, pre-validation with HelperError, batchWithRebuild, or reference cleanup.

- `addField` — type/widget alias resolution, batchWithRebuild, page assignment
- `addGroup` — batchWithRebuild for display mode
- `addContent` — kind→widgetHint mapping
- `removeItem` — dependency cascade cleanup (binds, shapes, variables, mappingRules, screenerRoutes)
- `copyItem` — deep copy with FEL reference rewriting
- `updateItem` — property routing across 4 command types, static routing sets
- `moveItem`, `renameItem`, `reorderItem` — path recomputation
- `moveItems` — batch-move multiple items atomically
- `wrapItemsInGroup` — descendant dedup, position computation, batchWithRebuild
- `wrapInLayoutComponent` — bind-key extraction, path validation
- `batchDeleteItems`, `batchDuplicateItems` — descendant dedup, depth-first sort
- `makeRepeatable` — type validation, multi-command with component sync
- `setMetadata` — key validation, routing to different command types

Private members and statics that move here:
- `_VALID_UPDATE_KEYS`, `_ITEM_PROPERTY_KEYS`, `_BIND_KEYS` — routing sets for `updateItem`
- `_VALID_METADATA_KEYS`, `_PRESENTATION_KEYS` — routing sets for `setMetadata`

These become module-level `const` Sets. `_PRESENTATION_BLOCK_KEYS` moves to `utils.ts` (shared with `presentation.ts`).

**`helpers/logic.ts`** — FEL-driven logic layer. All methods validate FEL expressions before dispatch.

- `showWhen`, `readonlyWhen`, `require`, `calculate` — single bind dispatch with FEL validation
- `branch` — multi-arm condition generation, multiChoice auto-detection, otherwise negation
- `addValidation`, `removeValidation`, `updateValidation` — shape CRUD with FEL validation
- `addVariable`, `updateVariable`, `removeVariable`, `renameVariable` — variable lifecycle, dangling reference scanning
- `removeInstance` — dangling reference scanning (see Borderline Decisions)

Private members that move here:
- `_branchExpr` — FEL expression builder for branch arms

**`helpers/presentation.ts`** — Behavior-driven presentation helpers that abstract over component/theme/page commands.

- `applyLayout` — arrangement→component mapping, two-phase dispatch
- `applyStyle` — CSS vs presentation-block routing, ambiguous key warning
- `applyStyleAll` — form-level vs selector routing, CSS nesting
- `addPage`, `addWizardPage` — page creation with ID readback, pageMode auto-set
- `removePage`, `reorderPage`, `updatePage` — page lifecycle (these dispatch `pages.*` commands)
- `placeOnPage`, `unplaceFromPage` — leaf-key extraction
- `setFlow` — multi-command wizard property dispatch
- `addSubmitButton` — component tree + optional page assignment
- `defineChoices` — option set creation
- `mapField`, `unmapField` — mapping rule CRUD with path validation

Private members that move here:
- `_LAYOUT_MAP` — arrangement→component mapping table

**`helpers/crud.ts`** — Thin Studio UI wrappers. Each method dispatches a single command and returns `HelperResult`. No pre-validation, no multi-command orchestration, no alias resolution.

Theme CRUD:
- `setToken`, `setThemeDefault`, `setBreakpoint`
- `addThemeSelector`, `updateThemeSelector`, `deleteThemeSelector`, `reorderThemeSelector`
- `setItemOverride`, `clearItemOverrides`
- `addThemePage`, `updateThemePage`, `deleteThemePage`, `reorderThemePage`, `renameThemePage`
- `addRegion`, `updateRegion`, `deleteRegion`, `reorderRegion`, `setRegionKey`

Component tree CRUD:
- `addLayoutNode`, `unwrapLayoutNode`, `deleteLayoutNode`
- `moveLayoutNode`

Definition CRUD:
- `updateOptionSet`, `deleteOptionSet`
- `setMappingProperty`
- `autoGeneratePages`
- `addInstance`, `updateInstance`, `renameInstance`
- `setScreener`, `addScreenField`, `removeScreenField`
- `addScreenRoute`, `updateScreenRoute`, `reorderScreenRoute`, `removeScreenRoute`

**`helpers/utils.ts`** — Shared utilities used across multiple modules.

- `throwPathNotFound(core, path)` — fuzzy path matching + HelperError
- `validateFEL(core, expression)` — parse and throw INVALID_FEL
- `editDistance(a, b)` — Levenshtein for fuzzy matching
- `findSimilarPaths(core, path, maxDistance?)` — collects all known paths and ranks by edit distance
- `validateInstanceExists(core, name)` — shared by crud.ts (`updateInstance`, `renameInstance`) and logic.ts (`removeInstance`)
- `validateRouteIndex(core, routeIndex)` — shared by crud.ts screener methods
- `PRESENTATION_BLOCK_KEYS` — shared by items.ts (`updateItem`) and presentation.ts (`applyStyle`, `applyStyleAll`)

**`project.ts`** — Facade class (~150 lines).

- Constructor, `core` field
- Read-only getters (state, definition, component, theme, mapping, effectiveComponent) — inline one-liners
- Query passthrough methods (fieldPaths, itemAt, bindFor, etc.) — inline one-liners
- History methods (undo, redo, canUndo, canRedo, onChange) — inline one-liners
- `loadBundle` — inline (single dispatch + resetHistory)
- `createProject` factory function
- One-line delegation to each helper function

### What Does NOT Change

- **Public API surface**: `Project` class, all method signatures, `HelperResult`, `HelperError`, all types in `helper-types.ts`.
- **`index.ts` exports**: No changes.
- **Tests**: All existing tests call `Project` methods, so they continue to work without modification.
- **`formspec-core`**: No changes to `IProjectCore` or `RawProject`.

### Borderline Decisions

Some methods straddle the behavior/CRUD line:

| Method | Decision | Reason |
|--------|----------|--------|
| `addInstance` | crud.ts | Single dispatch, no validation |
| `updateInstance` | crud.ts | Property fan-out but no validation |
| `renameInstance` | crud.ts | Single dispatch with existence check only |
| `removeInstance` | logic.ts | Dangling reference scanning = behavior logic |
| `addScreenField` | crud.ts | Only adds `resolveFieldType` — minimal behavior |
| `addScreenRoute` | crud.ts | FEL validation only — import `validateFEL` from utils |
| `removePage` / `reorderPage` | presentation.ts | These use `pages.*` commands, not `theme.*` |

Note: CRUD methods that call `validateFEL` or `_validateRouteIndex` import those from `utils.ts`. The validation still happens; it just isn't the method's primary value-add.

## Non-Goals

- No refactoring of method implementations. Code moves verbatim.
- No changes to Studio UI imports (Studio imports `Project` from `formspec-studio-core`).
- No splitting of `helper-types.ts` (it's 158 lines, fine as-is).
- No moving thin CRUD wrappers to `IProjectCore` (future consideration, not this change).

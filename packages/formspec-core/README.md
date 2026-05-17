# formspec-core

Raw project state management for Formspec. Command dispatch, handler pipeline, undo/redo, cross-artifact invariants, and diagnostics.

This package owns the `RawProject` class (implementing `IProjectCore`) and the full handler table — 130 commands across definition, component, theme, mapping, pages, and project areas. It is the foundation that `formspec-studio-core` composes over.

It manages four editable artifacts:

- `definition` — form structure and behavior (items, binds, shapes, variables)
- `component` — UI tree and widget configuration
- `theme` — presentation tokens and cascade rules
- `mapping` — bidirectional data transforms

These artifacts are layered, not mutually exclusive:

- `definition` is always sufficient on its own
- `theme` is optional and remains a valid hand-authored presentation layer
- `component` is optional and has highest precedence when present

`formspec-core` preserves that model. It does not assume Studio-style authoring,
and it does not require every project to have a component document.

## Install

```bash
npm install @formspec-org/core
```

Runtime dependencies: `formspec-engine`, `formspec-types`, `ajv`

## Quick Start

```ts
import { createRawProject } from 'formspec-core';

const project = createRawProject();

project.dispatch({
  type: 'definition.setFormTitle',
  payload: { title: 'Eligibility Intake' },
});

project.batch([
  {
    type: 'definition.addItem',
    payload: { type: 'field', key: 'fullName', label: 'Full name', dataType: 'string' },
  },
  {
    type: 'definition.setBind',
    payload: { path: 'fullName', properties: { required: true } },
  },
]);

console.log(project.fieldPaths());    // ['fullName']
console.log(project.bindFor('fullName'));

const bundle = project.export();
```

## Architecture

`RawProject` is a thin orchestration facade (~380 lines) that delegates to focused subsystems:

```
RawProject (facade)
 ├── CommandPipeline     — phase-aware dispatch with middleware
 ├── HistoryManager      — undo/redo stacks and command log
 ├── handlers/           — 17 handler modules aggregated into builtinHandlers
 ├── queries/            — 7 pure-function query modules
 ├── tree-reconciler     — definition → component tree reconciliation
 └── state-normalizer    — cross-artifact invariant enforcement
```

### Subsystems

| Module | Responsibility |
|--------|---------------|
| `pipeline.ts` | `CommandPipeline`: clones state, runs commands across phases, calls reconcile between phases when signaled, wraps execution with middleware |
| `history.ts` | `HistoryManager<T>`: generic undo/redo stacks with depth cap, command log, push/pop/clear operations |
| `tree-reconciler.ts` | `reconcileComponentTree()`: pure function — takes definition + existing tree + theme, returns a new component tree preserving bound node properties |
| `state-normalizer.ts` | `normalizeState()`: pure function enforcing cross-artifact invariants (URL sync, breakpoint sort, breakpoint inheritance) |
| `definition` payloads | Must already match the canonical Formspec definition shape (object `instances`, array `binds`, `formPresentation`); core does not rewrite alternate serializations. |
| `theme-cascade.ts` | `resolveThemeCascade()`: resolves effective presentation properties for an item across defaults → selectors → item-overrides |
| `page-resolution.ts` | `resolvePageStructure()`: resolves component-tree pages into enriched `ResolvedPageStructure` with diagnostics |
| `component-documents.ts` | Helpers for component document detection, normalization, and artifact envelopes |
| `handlers/index.ts` | Aggregates 17 handler modules into a frozen `builtinHandlers` table. Each module exports a `Record<string, CommandHandler>` |
| `queries/*.ts` | 7 modules of pure query functions: `(ProjectState, ...) => result`. Field queries, expression index, dependency graph, statistics, diagnostics, versioning, registry queries |

### Design Principles

- **No global mutable state.** Each `RawProject` instance receives its own frozen handler table at construction. Custom handlers can be injected via `options.handlers`.
- **JSON-native state.** `ProjectState` is fully JSON-serializable — no Maps or class instances. `JSON.stringify(project.state)` works.
- **Pure functions over methods.** Subsystems are pure functions that take state as an argument. This makes them independently testable without instantiating `RawProject`.
- **Single dispatch pipeline.** `dispatch()`, `batch()`, and `batchWithRebuild()` all delegate to a single `_execute(phases)` method backed by `CommandPipeline`. Middleware wraps all paths uniformly.

## IProjectCore

`IProjectCore` is the seam between this package and `formspec-studio-core`. It defines the full public API surface.

**Command dispatch:**
`dispatch(command)`, `batch(commands)`, `batchWithRebuild(phase1, phase2)`

**State getters:**
`state`, `definition`, `component`, `theme`, `mapping`

**History:**
`undo()`, `redo()`, `canUndo`, `canRedo`, `log`, `resetHistory()`

**Queries:**
`fieldPaths()`, `itemAt(path)`, `searchItems(filter)`, `statistics()`, `bindFor(path)`, `componentFor(key)`, `effectivePresentation(key)`, `unboundItems()`, `resolveToken(key)`, `resolveExtension(name)`, `allDataTypes()`, `instanceNames()`, `variableNames()`, `optionSetUsage(name)`, `listRegistries()`, `browseExtensions(filter?)`, `responseSchemaRows()`

**FEL & expressions:**
`parseFEL(expression, context?)`, `felFunctionCatalog()`, `availableReferences(context?)`, `allExpressions()`, `expressionDependencies(expression)`, `fieldDependents(fieldPath)`, `variableDependents(variableName)`, `dependencyGraph()`

**Diagnostics & versioning:**
`diagnose()`, `diffFromBaseline(fromVersion?)`, `previewChangelog()`, `export()`

## Command Dispatch Flow

Every `dispatch()` follows the same pipeline via `_execute(phases)`:

1. Clone state snapshot for undo
2. `CommandPipeline.execute()`:
   - Clone state
   - Run middleware chain (may transform or reject)
   - Execute commands per phase on the clone
   - Reconcile component tree between phases when signaled
3. `normalizeState()` — cross-artifact invariants
4. `HistoryManager.push()` — snapshot for undo
5. Swap to new state
6. Notify subscribers

`batch()` groups commands into one phase. `batchWithRebuild()` uses two phases with inter-phase tree reconciliation.

## Command Catalog

Core commands across 16 handler modules:

| Area | Commands | Description |
|------|----------|-------------|
| `definition.*` | 46 | Items, binds, shapes, variables, option sets, instances, form presentation, screener, migrations, metadata |
| `component.*` | 25 | Component tree structure, node properties, custom components, responsive overrides |
| `theme.*` | 28 | Tokens, defaults, selectors, item overrides, breakpoints, stylesheets |
| `mapping.*` | 16 | Rules, inner rules, adapter config, preview, extensions |
| `project.*` | 5 | Import, subform import, registry loading, publishing |

## Extensibility

Custom handlers can be injected at construction:

```ts
const project = createRawProject({
  handlers: {
    'custom.myCommand': (state, payload) => {
      // mutate state clone
      return { rebuildComponentTree: false };
    },
  },
});
```

Custom handlers merge with builtins. Keys override builtins.

Middleware wraps the full dispatch pipeline:

```ts
const project = createRawProject({
  middleware: [
    (state, commands, next) => {
      console.log('before:', commands);
      const result = next(commands);
      console.log('after');
      return result;
    },
  ],
});
```

## ProjectOptions

| Option | Type | Description |
|--------|------|-------------|
| `seed` | `Partial<ProjectState>` | Initial state. Omitted fields get defaults (empty definition, blank artifacts). |
| `maxHistoryDepth` | `number` | Maximum undo snapshots (default: 50). |
| `middleware` | `Middleware[]` | Pipeline wrappers applied to every dispatch. |
| `handlers` | `Record<string, CommandHandler>` | Custom handlers merged over builtins. |
| `schemaValidator` | `SchemaValidator` | When set, `diagnose()` runs structural validation. Omit in environments without bundled schemas. |

## Standalone Utilities

These functions are exported for use outside `RawProject`:

| Export | Description |
|--------|-------------|
| `resolveThemeCascade(theme, key, type, dataType?)` | Resolves effective presentation properties for one item via the three-level cascade. |
| `resolvePageStructure(state, itemKeys)` | Resolves page structure from the component tree with region existence checks. |
| `resolveItemLocation(state, path)` | Resolves a dot-path to the item and its parent in the definition tree. |

## Development

```bash
npm run build        # tsc
npm run test         # vitest run (481 tests)
npm run test:watch   # vitest
```

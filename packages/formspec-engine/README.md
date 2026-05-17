# formspec-engine

Core form state engine for Formspec. Manages field values, relevance, required state, readonly state, validation results, and repeat group counts via a reactive signal graph.

**Where spec logic runs:** **Normative** FEL (parse, dependency lists, analysis, prepare, eval), validation, coercion, migrations, batch definition eval, etc. is implemented in **Rust** and exposed through **WASM** (`wasm-pkg-runtime` / `wasm-pkg-tools`). TypeScript is **orchestration**: Preact signals, `FormEngine`, and **thin** `src/fel/` modules (`fel-api-runtime.ts`, `fel-api-tools.ts`) that call the bridges — not a second in-tree FEL parser. See **`CLAUDE.md`** / **`AGENTS.md`** → **Architecture** → **Logic ownership (Rust / WASM first)**.

**Runtime dependencies:** `@preact/signals-core ^1.6.0`, `formspec-types` (workspace)
**Module format:** ESM (`dist/index.js`)
**Build:** `npm run build` (two `wasm-pack` outputs under `wasm-pkg-runtime/` / `wasm-pkg-tools/`, then `tsc` → `dist/`)

---

## Install

This package lives in the monorepo. Reference it from a sibling package:

```json
"dependencies": {
  "formspec-engine": "*"
}
```

Build before use:

```bash
npm run build
```

---

## Quick Usage

```typescript
import { FormEngine } from 'formspec-engine';

const engine = new FormEngine({
  url: 'my-form',
  version: '1.0',
  items: [
    { key: 'name',  type: 'field', dataType: 'string', label: 'Name' },
    { key: 'age',   type: 'field', dataType: 'integer', label: 'Age' },
    { key: 'total', type: 'field', dataType: 'decimal', label: 'Total',
      calculate: '$price * $qty' }
  ]
});

// Write values
engine.setValue('name', 'Alice');
engine.setValue('age', 30);

// Read current value
console.log(engine.signals['name'].value);   // 'Alice'

// Check validation
const report = engine.getValidationReport({ mode: 'submit' });
console.log(report.valid, report.counts);

// Collect response
const response = engine.getResponse();
console.log(response.data);
```

---

## API Surface

### `FormEngine`

```typescript
new FormEngine(
  definition: FormspecDefinition,
  options?: FormEngineOptions
)

// FormEngineOptions: { runtimeContext?, registryEntries?, reactiveRuntime? }
```

#### Reactive Signal Properties

All signals are `@preact/signals-core` primitives. Read `.value` directly, or read inside `computed()` / `effect()` to subscribe reactively.

| Property | Type | Description |
|---|---|---|
| `signals` | `Record<string, Signal<any>>` | Field values. Keys are dotted paths with 0-based brackets (`group[0].field`). Writable signals for plain fields; read-only computed signals for `calculate` binds. |
| `relevantSignals` | `Record<string, Signal<boolean>>` | Visibility per path. `true` by default; computed when a `relevant` FEL expression is set. |
| `requiredSignals` | `Record<string, Signal<boolean>>` | Required state per path. |
| `readonlySignals` | `Record<string, Signal<boolean>>` | Readonly state per path. |
| `errorSignals` | `Record<string, Signal<string\|null>>` | First error message (or `null`) per field. Derived from `validationResults`. |
| `validationResults` | `Record<string, Signal<ValidationResult[]>>` | Full bind-level results per path. |
| `shapeResults` | `Record<string, Signal<ValidationResult[]>>` | Results per shape ID for `continuous`-timing shapes. |
| `repeats` | `Record<string, Signal<number>>` | Instance count per repeatable group path. |
| `optionSignals` | `Record<string, Signal<FormspecOption[]>>` | Options per field (inline, optionSets, or remote). |
| `optionStateSignals` | `Record<string, Signal<RemoteOptionsState>>` | `{ loading, error }` for remote options. |
| `variableSignals` | `Record<string, Signal<any>>` | Computed variables keyed as `"scope:name"` (e.g. `"#:globalRate"`). |
| `dependencies` | `Record<string, string[]>` | Dependency graph: path → paths it reads. |
| `structureVersion` | `Signal<number>` | Increments on structural changes (add/remove repeat). FEL closures read this to re-evaluate after structure changes. |

#### Methods

**Value management**

```typescript
setValue(path: string, value: any): void
// Normalizes whitespace (trim/normalize/remove), coerces strings to numbers for
// numeric dataTypes, and applies precision rounding — per bind config.
```

**Response and validation**

```typescript
getResponse(meta?: { id?, author?, subject?, mode? }): object
// Returns { definitionUrl, definitionVersion, status, data, validationResults, authored }.
// status: 'completed' if valid, 'in-progress' otherwise.
// Non-relevant fields handled per nonRelevantBehavior: remove (default) | empty | keep.

getValidationReport(options?: { mode?: 'continuous' | 'submit' }): ValidationReport
// Collects bind-level results (filtered by relevance), continuous shape results,
// and — if mode='submit' — evaluates submit-timing shapes.
// valid = true iff counts.error === 0.

evaluateShape(shapeId: string): ValidationResult[]
// Evaluates a single shape by ID (for demand-timing shapes).
```

**Repeat groups**

```typescript
addRepeatInstance(itemName: string): number | undefined
// Returns the new 0-based index. Initializes all child signals.

removeRepeatInstance(itemName: string, index: number): void
// Snapshots values, splices the index, rebuilds signals, restores values.
```

**FEL compilation**

```typescript
compileExpression(expression: string, currentItemName?: string): () => any
// Returns a reactive closure. Call inside computed() to auto-subscribe
// to all referenced field signals.
```

**Variables**

```typescript
getVariableValue(name: string, scopePath: string): any
// Walks from scopePath upward to global scope ('#'), returns first match.
```

**Screener**

```typescript
evaluateScreener(): { target: string; label?: string } | null
// Evaluates definition.screener.routes in order.
// Returns the first route with a truthy condition, or null.
```

**Diagnostics and replay**

```typescript
getDiagnosticsSnapshot(options?: { mode? }): FormEngineDiagnosticsSnapshot
// Full snapshot: all values, MIP states, dependencies, validation, runtime context.

applyReplayEvent(event: EngineReplayEvent): EngineReplayApplyResult
replay(events: EngineReplayEvent[], options?: { stopOnError? }): EngineReplayResult
```

**Runtime context**

```typescript
setRuntimeContext(context: FormEngineRuntimeContext): void
// context: { now?, locale?, timeZone?, seed? }
```

**Migration**

```typescript
migrateResponse(responseData: Record<string, any>, fromVersion: string): Record<string, any>
// Applies definition.migrations filtered by fromVersion, sorted ascending.
// Change types: rename, remove, add, transform (FEL expression).
```

**i18n**

```typescript
setLabelContext(context: string | null): void   // e.g. 'es', 'fr'
getLabel(item: FormspecItem): string             // Returns locale label or item.label
```

---

### Other Exports

**Definition assembly** — resolves `$ref` inclusions into a self-contained definition:

```typescript
import { assembleDefinition, assembleDefinitionSync } from 'formspec-engine';

const result = await assembleDefinition(definition, resolver);
// result: { definition: FormspecDefinition, assembledFrom: AssemblyProvenance[] }
```

The assembler prefixes keys, rewrites bind paths, rewrites shape targets, rewrites FEL expressions, imports variables, detects key/variable/shape-ID collisions, and records provenance.

**FEL analysis** — static analysis without a running engine:

```typescript
import { analyzeFEL, getFELDependencies, rewriteFELReferences } from 'formspec-engine';
```

**Extension validation** — checks `extensions` fields against loaded registry entries:

```typescript
import { validateExtensionUsage } from 'formspec-engine';
```

**Runtime mapping** — bidirectional data mapping independent of FormEngine:

```typescript
import { RuntimeMappingEngine } from 'formspec-engine';

const mapper = new RuntimeMappingEngine(mappingDocument);
const forward = mapper.forward(source);
const reverse = mapper.reverse(source);
```

**Schema validation** — validates Formspec documents against JSON schemas:

```typescript
import { createSchemaValidator } from 'formspec-engine';
```

**Path utilities:**

```typescript
import { itemAtPath, normalizeIndexedPath, splitNormalizedPath } from 'formspec-engine';
```

**FEL function catalog** — for editor tooling and docs generation:

```typescript
import { getBuiltinFELFunctionCatalog } from 'formspec-engine';
```

---

## Key Types

```typescript
interface FormspecDefinition {
  url: string;
  version: string;
  title?: string;
  items: FormspecItem[];
  binds?: FormspecBind[];
  shapes?: FormspecShape[];
  variables?: FormspecVariable[];
  instances?: FormspecInstance[];
  optionSets?: Record<string, FormspecOption[]>;
  migrations?: Migration[];
  screener?: Screener;
  formPresentation?: any;
}

interface FormspecItem {
  key: string;
  type: 'field' | 'group' | 'section' | string;
  dataType?: string;
  label?: string;
  options?: FormspecOption[];
  optionSet?: string;
  repeatable?: boolean;
  minRepeat?: number;
  maxRepeat?: number;
  pattern?: string;
  // Inline bind shorthand (merged with definition.binds):
  relevant?: string;
  required?: string | boolean;
  calculate?: string;
  readonly?: string | boolean;
  constraint?: string;
  constraintMessage?: string;
  default?: any;
  nonRelevantBehavior?: 'remove' | 'empty' | 'keep';
}

interface FormspecBind {
  path: string;           // supports [*] wildcards
  relevant?: string;
  required?: string | boolean;
  calculate?: string;
  readonly?: string | boolean;
  constraint?: string;
  constraintMessage?: string;
  default?: any;
  nonRelevantBehavior?: 'remove' | 'empty' | 'keep';
  remoteOptions?: string;
  whitespace?: 'trim' | 'normalize' | 'remove';
  precision?: number;
}

interface ValidationReport {
  valid: boolean;
  results: ValidationResult[];
  counts: { error: number; warning: number; info: number };
  timestamp: string;  // ISO 8601
}

interface ValidationResult {
  path: string;              // 1-based external path
  message: string;
  severity: 'error' | 'warning' | 'info';
  constraintKind: 'type' | 'required' | 'constraint' | 'minRepeat' | 'maxRepeat';
  code: string;              // TYPE_MISMATCH | REQUIRED | CONSTRAINT_FAILED | PATTERN_MISMATCH | MIN_REPEAT | MAX_REPEAT
  context?: Record<string, any>;
  constraintMessage?: string;
}

interface FormEngineRuntimeContext {
  now?: Date | string | number | (() => Date | string | number);
  locale?: string;
  timeZone?: string;
  seed?: string | number;
}
```

---

## Architecture

### Signal graph

The engine builds a reactive signal graph on construction. Three `@preact/signals-core` primitives:

- **`signal(value)`** — writable. Used for: plain field values, static MIP states, repeat counts, option lists, `structureVersion`.
- **`computed(fn)`** — read-only derived. Used for: `calculate` field values, FEL-based MIP states, validation results, error signals, variable signals.
- **`effect(fn)`** — side effect. Used for: applying `bind.default` values on relevance transitions.

Reactive FEL uses **`compileExpression()`** closures: each closure reads `structureVersion`, instance/evaluation version signals, and calls **`wasmEvalFELWithContext`** with a JSON context built from engine state. Preact captures signal reads when the closure runs inside a `computed`. **Dependency lists** for binds (e.g. `calculate`) come from **`wasmGetFELDependencies`** during definition setup — same Rust parser as eval, not a TypeScript CST walk.

### FEL surface in this package (`src/fel/`)

- **`fel-api-runtime.ts`** — WASM **runtime** only: `analyzeFEL`, `getFELDependencies`, `evaluateDefinition`, path helpers (`normalizeIndexedPath` → `wasmNormalizeIndexedPath`; `splitNormalizedPath` defers to WASM then splits). **`itemLocationAtPath`** walks the in-memory definition tree by key (host navigation). **`normalizePathSegment`** is a small exported string helper; full paths should use **`normalizeIndexedPath`** / **`splitNormalizedPath`** for Rust-aligned behavior.
- **`fel-api-tools.ts`** — lazy **tools** WASM: tokenize/print/catalog, **`tryLiftConditionGroup`** (FEL → Studio condition-group JSON), rewrites, lint-adjacent FEL helpers, etc.
- **`fel-api.ts`** — re-exports both for `import 'formspec-engine'`.

Grammar, stdlib, and evaluation semantics live in **`fel-core`** / **`formspec-core`** (Rust); see **`crates/fel-core`** and **`crates/formspec-wasm`**.

### Standard library (44+ functions)

| Category | Functions |
|---|---|
| Aggregates | `sum`, `count`, `avg`, `min`, `max`, `countWhere` |
| String | `upper`, `lower`, `trim`, `length`, `contains`, `startsWith`, `endsWith`, `substring`, `replace`, `matches`, `format` |
| Math | `abs`, `power`, `round`, `floor`, `ceil` |
| Date/time | `today`, `now`, `year`, `month`, `day`, `hours`, `minutes`, `seconds`, `dateAdd`, `dateDiff`, `time`, `timeDiff` |
| Logical | `coalesce`, `isNull`, `present`, `empty`, `if` |
| Type check | `isNumber`, `isString`, `isDate`, `typeOf` |
| Cast | `string`, `number`, `boolean`, `date` |
| Choice | `selected` |
| Money | `money`, `moneyAmount`, `moneyCurrency`, `moneyAdd`, `moneySum` |
| Navigation | `prev`, `next`, `parent` |
| MIP query | `valid`, `relevant`, `readonly`, `required` |
| Instance | `instance` |

### Validation

**Bind-level** — each field's `validationResults` signal evaluates in order: type check → required → constraint expression → pattern. Cardinality checks on repeatable groups produce `MIN_REPEAT` / `MAX_REPEAT` results.

**Shape rules** — cross-field constraints in `definition.shapes`. Each shape has a `target` path, `severity`, `timing` (`continuous` | `submit` | `demand`), optional `activeWhen` guard, and a composition operator: `constraint`, `and`, `or`, `not`, or `xone`. Continuous shapes run as computed signals; submit shapes run at report time; demand shapes run via `evaluateShape(id)`.

### Path resolution

- Simple: `fieldName`
- Dotted: `group.child.field`
- Indexed (internal): `group[0].field` (0-based)
- Indexed (external, in `ValidationResult`): `group[1].field` (1-based)
- Wildcard (binds/shapes): `items[*].field` — expanded via `resolveWildcardPath` using current repeat counts

### Definition assembly

`assembleDefinition` resolves `$ref` group items into a self-contained definition. For each `$ref` the assembler: fetches the referenced definition, selects the fragment, applies `keyPrefix`, rewrites bind paths and shape targets into the host scope, rewrites all `$`-prefixed FEL references, imports variables, detects collisions, records provenance, and recurses into nested `$ref` items.

### Rust / WASM (split artifacts)

`npm run build` compiles `crates/formspec-wasm` twice via `wasm-pack` and runs the same `wasm-opt` pass as before. The **runtime** build passes **`--no-default-features`**, which disables the **`full-wasm`** meta-feature: no **`formspec-lint`**, and no optional `wasm_bindgen` modules (document/plan, assembly, mapping, registry, changelog, FEL authoring helpers). Those exports exist only in the **tools** artifact. See **`crates/formspec-wasm` README** → Cargo features.

| Output directory | Glue module prefix | Used for |
|------------------|-------------------|----------|
| `wasm-pkg-runtime/` | `formspec_wasm_runtime*` | Default **`initFormspecEngine()`** path: `FormEngine`, batch eval, FEL eval, coercion, migrations, option-set inlining, path helpers |
| `wasm-pkg-tools/` | `formspec_wasm_tools*` | Lint (7-pass) + schema planning, registry document helpers, mapping execution, definition assembly in WASM, FEL authoring helpers (tokenize, print, **`tryLiftConditionGroup`**, rewrites, …) |

- Call **`await initFormspecEngine()`** before `FormEngine` or runtime WASM helpers.
- Call **`await initFormspecEngineTools()`** before sync tooling APIs (`lintDocument`, `tokenizeFEL`, `assembleDefinitionSync`, `RuntimeMappingEngine`, …). **`await assembleDefinition()`** loads tools lazily on first use.
- Paired artifacts expose **`formspecWasmSplitAbiVersion()`**; the JS bridge rejects mismatched runtime/tools builds.

**Runtime-only startup (smaller static graph):** `init-formspec-engine.ts` imports only `wasm-bridge-runtime` and uses `import('./wasm-bridge-tools.js')` when tools init runs. The **`FormEngine`** implementation imports **runtime bridge only** (not the compatibility barrel). The package root (`import 'formspec-engine'`) still **re-exports `fel-api`**, which composes **`fel-runtime`** + **`fel-tools`** (both bridges), so a full **`index`** load still parses tools glue. Use **`formspec-engine/fel-runtime`** (and **`/fel-tools`** only where needed) to avoid that — e.g. **`formspec-core`** does. For embedders that only need startup + runtime WASM, import the subpath:

```ts
import { initFormspecEngine, isFormspecEngineInitialized } from 'formspec-engine/init-formspec-engine';
```

**Render / `<formspec-render>` surface:** import **`formspec-engine/render`** for **`createFormEngine`**, **`FormEngine`**, **`IFormEngine`**, response helpers, and inits — same runtime WASM path as above, **without** the FEL tooling facade (`fel-api`) or static tools bridge. `formspec-webcomponent` uses this subpath.

(`package.json` **`exports`** exposes `./init-formspec-engine`, `./render`, **`./fel-runtime`** (path + `analyzeFEL` / `evaluateDefinition` / runtime WASM only), and **`./fel-tools`** (lint, registry, tokenize, rewrites, etc.). **`formspec-core`** imports **`fel-runtime`** / **`fel-tools`** so handlers that only need path helpers do not pull tools glue through the main package entry.)

Run `npm run build` in this package (or the monorepo root) to produce `wasm-pkg-runtime/` and `wasm-pkg-tools/`.

**Size profiling:** After `npm run build:wasm`, run **`npm run profile:twiggy`** for **`twiggy`** on both `.wasm` files (`top`, `--retained`, **`diff`** runtime→tools, `monos`, `garbage`). Complements **`cargo bloat`** on `formspec-wasm` proxy bins (crate names on host vs real wasm mass). Monorepo root: **`npm run wasm:twiggy`**. See **`thoughts/reviews/2026-03-23-wasm-split-baseline.md`**.

**Git / npm publish:** these directories are **not** root-gitignored (so `npm pack` / `npm publish` can include them per `package.json` `files`). `wasm-pack` writes a pkg-local `.gitignore` containing `*`; the build scripts **delete** that file so npm does not skip the WASM tree. **Do not commit** `wasm-pkg-runtime/` or `wasm-pkg-tools/` — keep them untracked build outputs. `prepack` runs `npm run build` before pack.

---

## Tests

Run with Node.js built-in test runner:

```bash
npm test          # build + init-entry grep gate + unit tests + runtime/tools isolation checks
npm run test:unit # test only (requires prior build; initializes runtime + tools WASM)
npm run test:init-entry-runtime-only # grep dist/init-formspec-engine.js (no tools wasm path)
npm run test:render-entry-runtime-only # grep dist/engine-render-entry.js (no fel facade / tools bridge)
npm run test:fel-runtime-entry-only # grep dist/fel/fel-api-runtime.js (no tools bridge)
npm run test:wasm-runtime-isolation # runtime-only init (no global setup)
```

20 test files in `tests/` covering: bind behaviors, bind defaults and expression context, definition assembly (sync/async), FEL path rewriting, shape composition and timing, repeat lifecycle, response pruning, remote options, runtime diagnostics, replay, and runtime mapping.

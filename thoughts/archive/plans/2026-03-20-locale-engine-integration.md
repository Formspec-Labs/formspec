# Plan: FieldViewModel + Locale Integration

**Date:** 2026-03-20 (revised 2026-03-24)
**Status:** Proposed
**Branch:** `claude/add-i18n-support-tpQ9A`
**Prerequisites:** Locale Specification (specs/locale/locale-spec.md), JSON Schema (schemas/locale.schema.json), ADR 0048
**Design doc:** thoughts/specs/2026-03-21-presentation-locale-and-fieldvm-design.md
**Review:** 2026-03-24 — 11-issue review with spec-expert/scout validation (see Revision History)

---

## Revision History

### v3 (2026-03-24) — Post-Review Corrections

An 11-issue review validated the design against specs and schemas. Key changes from v2:

| # | Issue | Resolution |
|---|-------|------------|
| 1 | Locale spec §3.1.4 used `constraintKind` but showed `code` examples | Use `code` exclusively with synthesis from `constraintKind` when absent. Fixed `CONSTRAINT` → `CONSTRAINT_FAILED`. |
| 2 | No `$optionSet.` key prefix — forced duplication of shared translations | Added `$optionSet.<setName>.<value>.label` with field-level override cascade. |
| 3 | `$page.` keys create cross-tier coupling (locale → Theme) | Accepted with §1.2 scope amendment and mandatory validator warnings for orphaned keys. |
| 4 | Interpolation context undefined for `$page.`/`$component.` keys | Added explicit context table (§3.3.2) — global for non-item keys, repeat-instance scope for `$component.` inside templates. |
| 5 | `FormViewModel.pageTitle()` leaks computed signals | Requires `computed<T>()` added to `EngineReactiveRuntime`, then memoized Map cache. |
| 6 | `interpolateMessage()` architecture | Split: Shape `{{expr}}` → Rust (missing spec logic in `formspec-eval`); locale `{{expr}}` → TS (presentation glue calling WASM for FEL eval). |
| 7 | `$node:` IDs in repeat templates undefined | Template-scope uniqueness — `id` unique within document, all instances share locale key, `@index`/`@count` available. |
| 8 | Component `id` collision severity | Error at validation/lint, warning at runtime with first-wins resolution (matches editable binding precedent §4.3). |
| 9 | `$node:` colon has zero precedent in formspec | Renamed to `$component.<id>.<prop>` — dot delimiter, consistent with `$form.`, `$shape.`, `$page.`. |
| 10 | `@context` restricted to labels only | Expanded to all localizable properties (`hint@context`, `description@context`) with shorter cascade (no Definition-side fallback). |
| 11 | `[]` regex contradiction between design doc and plan | Brackets allowed in schema regex for `$component.` array properties; `§7.2` warns if brackets appear in item-level keys. |

**Spec/schema changes implemented** in worktree branches (pending merge to main):
- `worktree-agent-afccba3e` — locale spec prose (§1.2, §3.1.2-§3.1.8, §3.3.2, §7.2, §8.2, Appendix A)
- `worktree-agent-a02700c2` — locale schema + component schema (`propertyNames` regex, `id` on ComponentBase)
- `worktree-agent-a9e375ff` — component spec prose (node IDs, localizable props table)

**Pre-existing bug found:** `propertyNames` regex was missing hyphen — `$shape.budget-balance.message` (its own example) would fail validation. Fixed in schema worktree.

**Pre-existing Rust gap found:** `formspec-eval` does NOT resolve `{{expression}}` in Shape messages during Revalidate, violating core spec §5.3 ("All `{{expression}}` interpolation sequences MUST be resolved before this value is surfaced"). Added as prerequisite step 0.

### v4 (2026-03-24) — Future-Proofing for Deferred i18n Gaps

Completeness review identified gaps correctly deferred to host/tooling/future spec revisions. For each, identified zero-cost structural seams to plant now so the deferred features are drop-in additions later, not rework.

| Deferred gap | Setup action | Where |
|---|---|---|
| RTL/BiDi layout | Add `direction` to `formPresentation` schema; auto-derive from locale code in LocaleStore | Definition schema + engine |
| Gender agreement | Add `meta` bag to `FormEngineRuntimeContext` + `runtimeMeta()` FEL function | Engine interface + FEL |
| Locale negotiation | Add `getAvailableLocales()` to `IFormEngine` | Engine interface |
| Complex plurals (Arabic/Polish) | Ship `x-formspec-plural-category` via registry + `Intl.PluralRules` implementation | Registry + engine FEL |
| Screen reader `lang` attribute | Set `lang` on shadow host in `set locale()` | Webcomponent element.ts |
| Translation debug/coverage | Add `lookupKeyWithMeta()` to LocaleStore returning resolution source | Engine locale.ts |
| Bound-component string props | Add `<key>.placeholder`, `<key>.prefix`, `<key>.suffix` to locale spec §3.1.1 | Locale spec + engine resolver |
| Screener route strings | Add `$route.` key prefix for route `label`/`message` | Locale spec + schema regex |

---

## Context

The Locale Specification, schema, and ADR are complete on branch `claude/add-i18n-support-tpQ9A`. This plan covers how to integrate locale resolution into the implementation packages so that localized strings reach the DOM.

The original plan (v1) proposed adding `resolveString()` calls to every behavior hook — touching ~18 files across 3 packages. This revision takes a different approach: introduce a **FieldViewModel** abstraction that collapses all per-field reactive state into a single object, making locale integration a natural part of the rendering model rather than a bolt-on.

## Architecture Decision: FieldViewModel

### Why not resolveString() in every behavior?

The engine currently exposes ~12 separate signal maps (`signals`, `requiredSignals`, `relevantSignals`, `readonlySignals`, `errorSignals`, `validationResults`, `optionSignals`, etc.). Every behavior hook manually wires 5-8 of these. Adding locale means adding 3 more signal reads per behavior — making the scatter worse.

Worse, locale strings with FEL interpolation (e.g., `"Total: {{$itemCount}}"`) must update reactively when field values change. Labels are currently captured once during behavior construction and never re-read. Making them reactive requires either:
- Per-string signals (explosion of signals), or
- Computed signals in an organized abstraction

The FieldViewModel is that abstraction. It unifies all per-field state into one reactive object, making locale one of several inputs rather than a cross-cutting concern threaded through 15 files.

### What is a FieldViewModel?

```ts
interface FieldViewModel {
  // ── Identity ──
  readonly templatePath: string;    // for locale key lookup (indices stripped)
  readonly instancePath: string;    // for FEL interpolation context, value access
  readonly id: string;
  readonly itemKey: string;
  readonly dataType: string;

  // ── Presentation (locale-resolved, FEL-interpolated, reactive) ──
  readonly label: ReadonlySignal<string>;
  readonly hint: ReadonlySignal<string | null>;
  readonly description: ReadonlySignal<string | null>;

  // ── State ──
  readonly value: ReadonlySignal<any>;
  readonly required: ReadonlySignal<boolean>;
  readonly visible: ReadonlySignal<boolean>;
  readonly readonly: ReadonlySignal<boolean>;
  readonly disabledDisplay: 'hidden' | 'protected';  // static, from bind config

  // ── Validation ──
  readonly errors: ReadonlySignal<ValidationResult[]>;
  readonly firstError: ReadonlySignal<string | null>;

  // ── Options (choice fields) ──
  readonly options: ReadonlySignal<OptionEntry[]>;
  readonly optionsState: ReadonlySignal<RemoteOptionsState>;

  // ── Write ──
  setValue(value: any): void;
}
```

Created during `initItem()` in FormEngine. Each VM wraps the existing signal maps — it doesn't replace them. `getResponse()`, `getValidationReport()`, and FEL evaluation still read the raw signal maps internally.

### FormViewModel (form-level counterpart)

```ts
interface FormViewModel {
  readonly title: ReadonlySignal<string>;
  readonly description: ReadonlySignal<string>;
  pageTitle(pageId: string): ReadonlySignal<string>;
  pageDescription(pageId: string): ReadonlySignal<string>;
  readonly isValid: ReadonlySignal<boolean>;
  readonly validationSummary: ReadonlySignal<{ errors: number; warnings: number; infos: number }>;
}
```

Handles `$form.title`, `$form.description`, `$page.<id>.title`, `$page.<id>.description`, and form-level validation state.

**`pageTitle()`/`pageDescription()` MUST use a lazy-memoized Map cache** to return stable signal identities per pageId. Without memoization, every call creates a new computed signal (leak):

```ts
private _pageTitleCache = new Map<string, ReadonlySignal<string>>();

pageTitle(pageId: string): ReadonlySignal<string> {
  let sig = this._pageTitleCache.get(pageId);
  if (!sig) {
    sig = this._rx.computed(() => { /* resolution logic */ });
    this._pageTitleCache.set(pageId, sig);
  }
  return sig;
}
```

## Locale Resolution

### LocaleStore

**New file: `packages/formspec-engine/src/locale.ts`**

```ts
class LocaleStore {
  readonly activeLocale: Signal<string>;           // "" = no locale
  readonly direction: Signal<'ltr' | 'rtl'>;      // derived from locale code or formPresentation
  readonly version: Signal<number>;                // bumps on load/setLocale
  private documents: Map<string, LocaleDocument>;  // keyed by BCP 47 code

  loadLocale(doc: LocaleDocument): void;
  setLocale(code: string): void;
  getAvailableLocales(): string[];                 // codes of all loaded documents
  lookupKey(key: string): string | null;           // walks cascade, returns raw string
  lookupKeyWithMeta(key: string): LookupResult;    // with resolution source metadata
}

interface LookupResult {
  value: string | null;
  source: 'regional' | 'fallback' | 'implicit' | null;  // null = not found (use inline)
  localeCode?: string;  // which locale document provided the value
}
```

- `lookupKey()` walks the cascade: regional → explicit fallback → implicit language → returns null.
- `lookupKeyWithMeta()` wraps the same cascade with metadata tracking — used by debug mode and translation coverage tooling.
- Circular fallback detection via visited set per lookup.
- BCP 47 case-insensitive comparison, normalized to lowercase-language + titlecase-region.
- `loadLocale()` for the currently-active locale bumps `version` to trigger re-resolution.
- `direction` is derived from the locale code when `formPresentation.direction = "auto"`. RTL languages (`ar`, `he`, `fa`, `ur`, `ps`, `sd`, `yi`) set `direction` to `"rtl"`; all others default to `"ltr"`. Explicit `formPresentation.direction` overrides.

### String Resolution Cascade

#### Label with context (6-step)

When a label context is active (e.g., "short"):

1. `fr-CA` strings for `key.label@short`
2. `fr` strings for `key.label@short` (via fallback)
3. `fr-CA` strings for `key.label`
4. `fr` strings for `key.label` (via fallback)
5. Definition `labels["short"]`
6. Definition `label`

Each "locale lookup" step walks the full locale cascade internally.

#### Context on non-label properties

The `@context` suffix is supported on any localizable property (`hint@context`, `description@context`), not only labels. For properties without a Definition-side context object, the cascade omits the inline context step:

| Step | `label@context` | `hint@context` / `description@context` |
|------|----------------|---------------------------------------|
| 1 | Locale `key.label@context` | Locale `key.hint@context` |
| 2 | Locale `key.label` | Locale `key.hint` |
| 3 | Definition `labels[context]` | *(no equivalent — skip)* |
| 4 | Definition `label` | Definition `hint` |

#### Hint, description (2-step, no context)

1. Locale lookup for `key.hint` / `key.description`
2. Inline `item.hint` / `item.description`

#### Option labels (3-step)

1. Field-level Locale key: `templatePath.options.<escapedValue>.label`
2. OptionSet-level Locale key: `$optionSet.<setName>.<escapedValue>.label`
3. Inline option `label` from the Definition

Dots and backslashes in option values are escaped per §3.1.3. For the OptionSet step, the resolver must check whether the item references an `optionSet` and look up the set name.

#### Validation messages (4-step)

1. Per-code key: `templatePath.errors.<code>` (e.g., `email.errors.REQUIRED`)
2. Per-bind key: `templatePath.requiredMessage` or `templatePath.constraintMessage`
3. Inline bind `constraintMessage`
4. Processor default `ValidationResult.message`

**Code synthesis:** When a `ValidationResult` lacks an explicit `code`, synthesize it from `constraintKind`:

| `constraintKind` | Synthesized `code` |
|---|---|
| `required` | `REQUIRED` |
| `type` | `TYPE_MISMATCH` |
| `cardinality` | `MIN_REPEAT` or `MAX_REPEAT` (based on violation) |
| `constraint` | `CONSTRAINT_FAILED` |
| `shape` | `SHAPE_FAILED` |
| `external` | `EXTERNAL_FAILED` |

Shape messages: `$shape.<id>.message` → inline shape `message`.

ValidationResult objects are NOT mutated — the VM produces new objects with localized messages (presentation overlay per §8.2).

#### Presentation-tier strings

- `$form.title`, `$form.description` — on FormViewModel
- `$page.<pageId>.title`, `$page.<pageId>.description` — on FormViewModel
- `$component.<nodeId>.<property>` — resolved by webcomponent during component rendering

#### Interpolation binding context (§3.3.2)

The FEL evaluation context for `{{expression}}` sequences depends on the string key's prefix:

| Key prefix | Binding context | `@index`/`@count` | Available references |
|---|---|---|---|
| `<itemKey>.*` | Item's binding scope | Yes, if item is inside repeat group | `$fieldRef` relative to scope |
| `$form.*` | Global form context | No | All top-level `$fieldRef` |
| `$shape.<id>.*` | Shape's target scope | Depends on shape target | Per shape definition |
| `$page.<id>.*` | Global form context | No | All top-level `$fieldRef` |
| `$optionSet.*` | Global form context | No | All top-level `$fieldRef` |
| `$component.<id>.*` (outside repeat) | Global form context | No | All top-level `$fieldRef` |
| `$component.<id>.*` (inside repeat template) | Repeat instance scope | Yes | `$fieldRef` within repeat scope + parent scopes |

### FEL Interpolation in Strings

**Two separate interpolation concerns:**

#### 1. Shape message `{{expr}}` resolution — Rust (PREREQUISITE)

`formspec-eval` currently does NOT resolve `{{expression}}` in Shape messages during Revalidate, violating core spec §5.3. This must be fixed in Rust (`crates/formspec-eval/src/revalidate/shapes.rs`) before locale work begins. Shape message interpolation is spec business logic in the core processing cycle — it belongs in Rust.

#### 2. Locale string `{{expr}}` interpolation — TypeScript

`interpolateMessage()` is a **new TS function** for locale string interpolation at presentation time. This is presentation-tier orchestration glue, not spec business logic. The actual FEL evaluation goes through WASM (`wasmEvalFELWithContext`); TS handles the trivial template scanning:

1. Handles `{{{{` escape → literal `{{` (replace before regex, §3.3.1 rule 1)
2. Matches `{{expr}}` via regex, calls WASM FEL eval for each expression
3. Coerces results: `null`/`undefined` → `""`, booleans → `"true"`/`"false"`, numbers → default string (§3.3.1 rule 3)
4. **Error recovery (MUST, §3.3.1 rule 2):** failed parse/eval produces literal `{{original expression}}` + warning, not a crash
5. Non-recursive: replacement text is not re-scanned for `{{` (§3.3.1 rule 5)

### FEL Functions

#### Locale-tier functions (locale spec §5)

| Function | Pattern | Reactive? |
|----------|---------|-----------|
| `locale()` | `localeProvider` callback (like `now()`) reads `activeLocale.value` | Yes — via signal |
| `plural(count, singular, plural)` | Pure function, null-propagating | No |
| `formatNumber(value, locale?)` | Delegates to `Intl.NumberFormat` | Only if `locale?` omitted |
| `formatDate(value, pattern?, locale?)` | Delegates to `Intl.DateTimeFormat` | Only if `locale?` omitted |

`locale()` and `formatNumber/Date` (without explicit locale) are non-deterministic — dependency visitor flags them like `now()`.

#### Future-proofing functions (registered alongside locale functions)

| Function | Pattern | Reactive? | Purpose |
|----------|---------|-----------|---------|
| `runtimeMeta(key)` | Reads from `runtimeContext.meta[key]` | No (stable between `setRuntimeContext` calls) | Gender agreement, user-role text, arbitrary runtime metadata |
| `pluralCategory(count, locale?)` | Delegates to `Intl.PluralRules` | Only if `locale?` omitted | CLDR plural categories (`zero`/`one`/`two`/`few`/`many`/`other`) for Arabic, Polish, etc. |

`runtimeMeta()` is pure (reads a static bag set by the host). `pluralCategory()` with explicit `locale` is pure; without, it reads `activeLocale` (non-deterministic like `locale()`).

`pluralCategory()` is also registered as a **registry extension** (`x-formspec-plural-category` in `formspec-common.registry.json`) so definitions can declare their dependency on it.

## Integration by Package

### 0. Prerequisites — Reactive Runtime + Rust Shape Interpolation

#### Add `computed` to `EngineReactiveRuntime`

The entire FieldViewModel/FormViewModel design depends on `computed()` signals, but `EngineReactiveRuntime` (`packages/formspec-engine/src/reactivity/types.ts`) only exposes `signal<T>()` and `batch<T>()`. Without `computed`, the VM layer would hardcode a Preact dependency, violating the abstraction boundary.

**Changes:**

- `src/reactivity/types.ts`: Add `computed<T>(fn: () => T): ReadonlySignal<T>` to `EngineReactiveRuntime`
- `src/reactivity/preact-runtime.ts`: Implement using `@preact/signals-core`'s `computed`

#### Fix Shape message `{{expr}}` resolution in Rust

`crates/formspec-eval/src/revalidate/shapes.rs` must resolve `{{expression}}` interpolation sequences in Shape `message` values during the Revalidate phase, per core spec §5.3. Currently, `message.to_string()` is stored verbatim without interpolation.

### 1. formspec-engine — LocaleStore + FieldViewModel + FormViewModel

**New files:**

| File | Contents |
|------|----------|
| `src/locale.ts` | `LocaleStore` class |
| `src/field-view-model.ts` | `FieldViewModel` interface + factory |
| `src/form-view-model.ts` | `FormViewModel` interface + factory (with memoized `pageTitle`/`pageDescription`) |

**Changes to FormEngine (`src/index.ts`):**

- Add `localeStore: LocaleStore` (created in constructor)
- Add `fieldViewModels: Record<string, FieldViewModel>` map
- Add `formViewModel: FormViewModel` instance
- `initItem()` creates a FieldViewModel per field alongside existing signals
- VM wraps existing signals: `vm.value` = `this.signals[path]`, `vm.required` = `this.requiredSignals[path]`, etc.
- VM `label`/`hint`/`description` are computed signals that call `resolveString()` → `localeStore.lookupKey()` → `interpolateMessage()`
- VM `options` computed maps raw options through `resolveOptionLabel()` (3-step cascade: field → optionSet → inline)
- VM `errors` computed maps raw `ValidationResult[]` through `resolveValidationMessage()` (uses `code` with synthesis)
- Public methods: `loadLocale()`, `setLocale()`, `getActiveLocale()`, `getFieldVM(path)`, `getFormVM()`
- `labelContext` becomes a `Signal<string | null>` (currently a plain string) so VM label signals react to context changes
- `setRuntimeContext({ locale })` delegates to `setLocale()` if locale store exists
- `getLabel()`/`setLabelContext()` remain for backwards compat but are internally wired through the VM/signal

**Changes to IFormEngine (`src/interfaces.ts`):**

```ts
// New methods — locale
loadLocale(document: LocaleDocument): void;
setLocale(code: string): void;
getActiveLocale(): string;
getAvailableLocales(): string[];  // codes of all loaded locale documents (negotiation seam)
getFieldVM(path: string): FieldViewModel | undefined;
getFormVM(): FormViewModel;
```

**Changes to `FormEngineRuntimeContext` (`src/interfaces.ts`):**

```ts
interface FormEngineRuntimeContext {
  now?: (() => EngineNowInput) | EngineNowInput;
  locale?: string;
  timeZone?: string;
  seed?: string | number;
  // NEW — extensible metadata bag for gender agreement, user-role text, etc.
  meta?: Record<string, string | number | boolean>;
}
```

The `meta` bag is read by a new `runtimeMeta(key)` FEL function. This enables gender agreement (`runtimeMeta('gender') = 'feminine' ? 'inscrite' : 'inscrit'`), user-role-based text, and any future "runtime context" need without further interface changes.

Add `'locale'` to `DocumentType` enum (currently lists definition, response, validationReport, mapping, theme, component, registry). Required for schema validation to recognize locale documents. Also update the Rust `schema_validator.rs` accordingly.

**New `interpolateMessage()` function** (see "FEL Interpolation in Strings" section above).

**`loadLocale()` version compatibility:** On load, check `doc.targetDefinition.url` against `this.definition.url`. If `doc.targetDefinition.compatibleVersions` is present and the definition version falls outside the range, emit a warning (§2.2 SHOULD). Do not reject — fall back to inline strings for that locale.

**Register FEL functions** in constructor after FEL runtime is ready:

- `locale()` with `localeProvider` closure over `localeStore.activeLocale`
- `plural()`, `formatNumber()`, `formatDate()`
- `runtimeMeta(key)` reading from `runtimeContext.meta` (future-proofing for gender agreement)
- `pluralCategory(count, locale?)` using `Intl.PluralRules` (future-proofing for complex plural languages)

### 2. formspec-webcomponent — Simplified behaviors via VM

**Changes to `<formspec-render>` (`src/element.ts`):**

```ts
set localeDocuments(docs: LocaleDocument | LocaleDocument[]) {
  const arr = Array.isArray(docs) ? docs : [docs];
  for (const doc of arr) this.engine?.loadLocale(doc);
}

set locale(code: string) {
  this.engine?.setLocale(code);
  this._locale = code;
  // Accessibility: set lang for screen readers
  this.setAttribute('lang', code);
}
```

Property order: `registryDocuments` → `definition` → `localeDocuments` → `locale`.

No `scheduleRender()` needed — locale change propagates through computed signals.

**Changes to BehaviorContext (`src/behaviors/types.ts`):**

```ts
interface BehaviorContext {
  // ... existing ...
  getFieldVM(comp: any): FieldViewModel;  // NEW — resolves path, returns VM
}
```

**Behavior hook simplification (all 13 field behaviors):**

Before (~90 lines each):
```ts
export function useTextInput(ctx: BehaviorContext, comp: any): TextInputBehavior {
  const fieldPath = resolveFieldPath(comp.bind, ctx.prefix);
  const id = comp.id || toFieldId(fieldPath);
  const item = ctx.findItemByKey(comp.bind);
  const labelText = comp.labelOverride || item?.label || item?.key || comp.bind;
  // ... 20 more lines of extraction ...
  return {
    fieldPath, id, label: labelText,
    hint: comp.hintOverride || item?.hint || null,
    description: item?.description || null,
    // ... bind() with 5-8 manual signal subscriptions ...
  };
}
```

After (~40 lines each):
```ts
export function useTextInput(ctx: BehaviorContext, comp: any): TextInputBehavior {
  const vm = ctx.getFieldVM(comp);
  const presentation = ctx.resolvePresentation(comp, vm);
  return {
    vm,
    presentation,
    placeholder: comp.placeholder,
    inputMode: comp.inputMode,
    // ... only component-specific props ...
    bind(refs: FieldRefs): () => void {
      const disposers = bindSharedFieldEffects(ctx, vm, refs);
      // ... only component-specific value sync ...
      return () => disposers.forEach(d => d());
    }
  };
}
```

**`bindSharedFieldEffects` refactor (`src/behaviors/shared.ts`):**

Takes `vm: FieldViewModel` instead of `(ctx, fieldPath, labelText, refs)`:

```ts
export function bindSharedFieldEffects(
  ctx: BehaviorContext,
  vm: FieldViewModel,
  refs: FieldRefs
): Array<() => void> {
  const disposers: Array<() => void> = [];

  // Required indicator — now reactive to locale changes
  disposers.push(effect(() => {
    const isRequired = vm.required.value;
    refs.label.textContent = vm.label.value;  // reactive!
    if (isRequired) {
      const indicator = document.createElement('span');
      indicator.className = 'formspec-required';
      indicator.textContent = ' *';
      refs.label.appendChild(indicator);
    }
  }));

  // Validation — uses localized messages
  disposers.push(effect(() => {
    ctx.touchedVersion.value;
    const error = vm.firstError.value;
    // ... same touched logic, but error is already localized ...
  }));

  // Readonly, relevance — same pattern but reads vm.readonly, vm.visible
  // ...
  return disposers;
}
```

**Adapter adjustments (`src/adapters/default/*.ts`):**

Behavior contract shape changes: adapters read `behavior.vm.label.value` instead of `behavior.label`. Since `vm.label` is a signal, adapters that need reactive labels read it inside effects (which `bindSharedFieldEffects` already handles).

**Component-tier locale (`$component.` keys):**

For non-field components (Heading, Text, Alert, Card, etc.), the component render function resolves locale strings using the component's `id`:

```ts
// In heading component render
const nodeId = comp.id;
const text = nodeId
  ? engine.localeStore.lookupKey(`$component.${nodeId}.text`) ?? comp.text
  : comp.text;
```

This is localized on render and re-renders when locale changes (via `structureVersion` or a locale-aware render trigger).

### 3. Schema changes — DONE (pending merge)

**`locale.schema.json`:**

Updated `propertyNames` pattern:
```
^(\$form\.|\$shape\.|\$page\.|\$optionSet\.|\$component\.|[a-zA-Z])[a-zA-Z0-9_@.\\\[\]\-]*$
```

Adds `$page.`, `$optionSet.`, `$component.` prefixes. Adds `[]` for component array property indexing. Adds `-` (hyphen bug fix — pre-existing). Updated descriptions and examples including `CONSTRAINT_FAILED` fix.

**`component.schema.json`:**

Added optional `id` to `ComponentBase`:
```json
{
  "id": {
    "type": "string",
    "pattern": "^[a-zA-Z][a-zA-Z0-9_\\-]*$",
    "description": "Optional unique identifier for locale addressing ($component.<id>.prop), test selectors, and accessibility anchoring. MUST be unique across the component tree document."
  }
}
```

### 4. Spec prose changes — DONE (pending merge)

**Locale spec:**
- §1.2: Replaced presentation-tier exclusion with scoped inclusion
- §3.1.2: Expanded `@context` to all localizable properties
- §3.1.3: Added `$optionSet.<setName>.<value>.label` prefix with cascade
- §3.1.4: Fixed `constraintKind` → `code`, corrected examples, added synthesis table
- §3.1.7: Added `$page.<pageId>` keys for theme page layout strings
- §3.1.8: Added `$component.<nodeId>` keys for component node strings (with repeat template semantics)
- §3.3.2: Added interpolation binding context table
- §7.2: Added orphaned key validation checks (`$page`, `$component`, `$optionSet`, brackets-in-item-key)
- §8.2: Fixed `constraintKind` references to `code`
- Appendix A: Added representative keys for new prefixes

**Component spec:**
- §3.1: Added `id` property documentation (optional, pattern, uniqueness)
- §3.1: Documented collision severity (error at lint, warning at runtime, first-wins)
- §3.1: Documented repeat template node semantics
- §3.6: Added localizable string properties table (20 components)

### 5. formspec-core — Locale state & authoring handlers

**Changes to `ProjectState` (`src/types.ts`):**

```ts
interface ProjectState {
  // ... existing fields ...
  locales: Record<string, LocaleState>;   // keyed by locale code
  selectedLocaleId?: string;              // which locale is active in the editor
}

interface LocaleState {
  locale: string;        // BCP 47 code
  version: string;
  fallback?: string;
  targetDefinition: { url: string; compatibleVersions?: string };
  strings: Record<string, string>;
  // metadata: name, title, description, url
  name?: string;
  title?: string;
  description?: string;
  url?: string;
}
```

**New handler module: `src/handlers/locale.ts`**

Follows the mapping handler pattern (multi-instance collection with selection state):

```ts
function getLocale(state: ProjectState, localeId?: string): LocaleState {
  const id = localeId || state.selectedLocaleId;
  if (!id || !state.locales[id]) throw new Error(`Locale not found: ${id}`);
  return state.locales[id];
}
```

Handlers (null = delete, one-command-per-mutation):

| Command | Payload | Effect |
|---------|---------|--------|
| `locale.load` | `{ document: LocaleDocument }` | Parse + store in `state.locales[doc.locale]` |
| `locale.remove` | `{ localeId: string }` | Delete from `state.locales` |
| `locale.select` | `{ localeId: string }` | Set `state.selectedLocaleId` |
| `locale.setString` | `{ localeId?, key, value }` | Set/delete a single string key |
| `locale.setStrings` | `{ localeId?, strings: Record<string, string> }` | Batch set string keys |
| `locale.removeString` | `{ localeId?, key }` | Delete a string key |
| `locale.setMetadata` | `{ localeId?, property, value }` | Set name/title/description/version |
| `locale.setFallback` | `{ localeId?, fallback: string \| null }` | Set/clear fallback locale |

All return `{ rebuildComponentTree: false }`.

**Handler registry (`src/handlers/index.ts`):**

```ts
import { localeHandlers } from './locale.js';
// Add to builtinHandlers spread
```

**State normalizer (`src/state-normalizer.ts`):**

Sync `targetDefinition.url` on all locales when definition URL changes:

```ts
for (const locale of Object.values(state.locales ?? {})) {
  if (locale.targetDefinition) {
    locale.targetDefinition.url = url;
  }
}
```

**Import handler (`src/handlers/project.ts`):**

Handle locale documents in the import bundle:

```ts
if (p.locales) {
  state.locales = p.locales;
} else if (p.locale) {
  // Single locale import
  const doc = p.locale;
  state.locales[doc.locale] = splitLocaleState(doc);
}
```

Sync `targetDefinition.url` on imported locales.

**IProjectCore (`src/project-core.ts`):**

Add query methods:

```ts
// State getter
readonly locales: Readonly<Record<string, LocaleState>>;

// Query methods
localeAt(code: string): LocaleState | undefined;
activeLocaleCode(): string | undefined;
```

**State initializer (`src/raw-project.ts`):**

`createDefaultState()` must initialize `locales: {}` and `selectedLocaleId: undefined`. Without this, existing callers of `createRawProject()` get a state without `locales`, crashing locale handlers.

**Project bundle export:**

Update `ProjectBundle` type and `export()` method to include locale documents. When exporting, reconstitute `LocaleState` objects back to `LocaleDocument` format (add `$formspecLocale: "1.0"` envelope). Import path already handled above.

## Key Files to Modify

| Package | File | Change |
|---------|------|--------|
| formspec-engine | `src/reactivity/types.ts` | **PREREQUISITE** — Add `computed<T>()` to `EngineReactiveRuntime` |
| formspec-engine | `src/reactivity/preact-runtime.ts` | **PREREQUISITE** — Implement `computed` using Preact |
| formspec-engine | `src/locale.ts` | **NEW** — LocaleStore class |
| formspec-engine | `src/field-view-model.ts` | **NEW** — FieldViewModel interface + factory |
| formspec-engine | `src/form-view-model.ts` | **NEW** — FormViewModel interface + factory (memoized page signals) |
| formspec-engine | `src/index.ts` | Create VMs in initItem(), locale methods, interpolateMessage() |
| formspec-engine | `src/interfaces.ts` | Add VM + locale methods to IFormEngine, `getAvailableLocales()`, `meta` on RuntimeContext, add `'locale'` to DocumentType |
| formspec-eval (Rust) | `src/revalidate/shapes.rs` | **PREREQUISITE** — Resolve `{{expr}}` in Shape messages |
| schemas | `definition.schema.json` | Add `direction` enum (`ltr`/`rtl`/`auto`) to `formPresentation` |
| registries | `formspec-common.registry.json` | Add `x-formspec-plural-category` function entry |
| formspec-webcomponent | `src/element.ts` | Add `localeDocuments` + `locale` setters |
| formspec-webcomponent | `src/behaviors/types.ts` | Add `getFieldVM()` to BehaviorContext, update behavior type contracts |
| formspec-webcomponent | `src/behaviors/shared.ts` | Refactor bindSharedFieldEffects to take VM |
| formspec-webcomponent | `src/behaviors/*.ts` | Simplify all 13 field behaviors to use VM |
| formspec-webcomponent | `src/adapters/default/*.ts` | Read from `behavior.vm.*` |
| formspec-webcomponent | `src/components/*.ts` | Non-field components: resolve `$component.` locale keys |
| formspec-core | `src/types.ts` | Add `LocaleState`, `locales` + `selectedLocaleId` to ProjectState |
| formspec-core | `src/handlers/locale.ts` | **NEW** — locale handlers (load, remove, select, setString, etc.) |
| formspec-core | `src/handlers/index.ts` | Register locale handlers |
| formspec-core | `src/state-normalizer.ts` | Sync locale `targetDefinition.url` |
| formspec-core | `src/handlers/project.ts` | Handle locale documents in import bundle |
| formspec-core | `src/project-core.ts` | Add `locales`, `localeAt()`, `activeLocaleCode()` to IProjectCore |
| formspec-core | `src/raw-project.ts` | Initialize `locales: {}` in `createDefaultState()`, update `ProjectBundle` export |
| schemas | `locale.schema.json` | **DONE** — Extended for `$page.`, `$optionSet.`, `$component.`, `[]`, `-` |
| schemas | `component.schema.json` | **DONE** — Added optional `id` to ComponentBase |
| specs | `locale/locale-spec.md` | **DONE** — All prose changes (§1.2 through Appendix A) |
| specs | `component/component-spec.md` | **DONE** — Node IDs + localizable props table |

## What NOT to Do

- **No formspec-layout changes** — pure theme resolution, orthogonal to locale.
- **No per-string signals** — VM computed signals read `activeLocale.value` internally, making them reactive without an explosion of individual string signals.
- **No breaking changes to existing API** — `getLabel()` still works, raw signal maps still exist. VM is additive.
- **No mutation of ValidationResult** — localized messages are a presentation overlay in the VM, not mutations of the engine's validation output.
- **No `interpolateMessage()` in Rust** — locale string interpolation is TS presentation glue. Only Shape message resolution belongs in Rust.

## Build Sequence

0. **PREREQUISITE: `EngineReactiveRuntime.computed`** — add `computed<T>()` to reactive runtime interface + Preact implementation
0b. **PREREQUISITE: Rust Shape `{{expr}}` resolution** — fix `formspec-eval` to resolve `{{expression}}` in Shape messages during Revalidate (core spec §5.3 violation)
0c. **PREREQUISITE: `direction` on `formPresentation`** — add `direction` enum (`"ltr"` / `"rtl"` / `"auto"`, default `"ltr"`) to definition schema's `formPresentation`. One property, zero logic — plants the RTL seam.
1. **Merge spec/schema worktrees** — merge `worktree-agent-afccba3e`, `worktree-agent-a02700c2`, `worktree-agent-a9e375ff` into main
2. **Create `interpolateMessage()`** — new TS runtime string interpolator with `{{{{` escape, null coercion, error recovery (§3.3.1)
3. **`LocaleStore`** — new file, no existing code changes
   - 3a. Include `lookupKeyWithMeta()` returning `LookupResult` with `source` and `localeCode` — wraps the same cascade with metadata tracking for debug/coverage tooling
   - 3b. Include `direction: Signal<'ltr' | 'rtl'>` — derived from active locale code when `formPresentation.direction = "auto"`, overridden by explicit `direction` value. RTL language set: `ar`, `he`, `fa`, `ur`, `ps`, `sd`, `yi`.
   - 3c. Include `getAvailableLocales(): string[]` — returns keys of loaded documents (host negotiation seam)
4. **`FieldViewModel` + `FormViewModel`** — new files, interface definitions, using `_rx.computed()`
5. **Engine: create VMs in `initItem()`** — wraps existing signals, adds locale resolution
6. **Engine: expose public API** — `getFieldVM()`, `getFormVM()`, `loadLocale()`, `setLocale()`, `getAvailableLocales()`
   - 6a. Add `meta?: Record<string, string | number | boolean>` to `FormEngineRuntimeContext` — extensible metadata bag read by `runtimeMeta()` FEL function. Enables gender agreement, user-role text, etc. without future interface changes.
7. **Engine: register FEL functions** — `locale()`, `plural()`, `formatNumber()`, `formatDate()`
   - 7a. Register `runtimeMeta(key)` — reads `runtimeContext.meta[key]`, returns `string | number | boolean | null`. Pure function (stable between `setRuntimeContext` calls).
   - 7b. Register `pluralCategory(count, locale?)` — returns CLDR plural category string (`"zero"` / `"one"` / `"two"` / `"few"` / `"many"` / `"other"`) using `Intl.PluralRules`. ~10 lines. With explicit `locale` parameter: pure. Without: reads `activeLocale` (non-deterministic).
   - 7c. Add `x-formspec-plural-category` entry to `registries/formspec-common.registry.json` — function registry entry so definitions can declare the dependency.
8. **formspec-core: types + state init** — `LocaleState`, `ProjectState.locales`, `selectedLocaleId`; `createDefaultState()` initializes `locales: {}`
9. **formspec-core: locale handlers** — new handler module + registry registration
10. **formspec-core: state-normalizer** — sync locale `targetDefinition.url`
11. **formspec-core: project.import + export** — handle locale documents in import bundle; update `ProjectBundle` type and `export()` to include locales
12. **formspec-core: IProjectCore** — add `locales`, `localeAt()`, `activeLocaleCode()` queries
13. **Webcomponent: BehaviorContext + shared.ts** — `getFieldVM()`, refactored `bindSharedFieldEffects`
14. **Webcomponent: behavior hooks** — simplify all 13 to use VM (can be done one at a time)
15. **Webcomponent: adapter adjustments** — read from `behavior.vm.*`
16. **Webcomponent: element.ts** — `localeDocuments` + `locale` setters
   - 16a. Set `lang` attribute on shadow host when locale changes: `this.setAttribute('lang', code)` — screen readers need this for correct pronunciation. One line.
   - 16b. Set `dir` attribute from `localeStore.direction.value` — propagates RTL to the DOM.
17. **Webcomponent: non-field components** — `$component.` locale key resolution

Steps 0-0c are prerequisites. Step 1 is merge. Steps 2-7 are engine-only. Steps 8-12 are formspec-core. Steps 13-17 are webcomponent. Each step is independently testable. Substeps (3a-3c, 6a, 7a-7c, 16a-16b) are future-proofing seams — low-cost additions done during the parent step.

## Verification

### Unit tests (engine)

- **LocaleStore:** Load `fr` + `fr-CA` documents, verify `lookupKey()` cascade. Test circular fallback detection. Test BCP 47 normalization. Test hot-reload (load replacement for active locale).
- **FieldViewModel:** Create VM for a field, verify `label`/`hint`/`description` signals resolve through locale cascade. Test with label context (6-step cascade). Test `hint@accessibility` context variant (shorter cascade). Test FEL interpolation in strings (reactive to value changes). Test template path vs. instance path for repeat groups.
- **Option localization:** Load locale with `field.options.yes.label`, verify VM `options` signal produces localized labels. Test escaped option values (dots, backslashes). Test `$optionSet.setName.yes.label` shared translation with field-level override.
- **Validation message localization:** Load locale with `field.errors.REQUIRED`, verify VM `errors` signal produces localized messages. Test 4-step cascade with `code` property. Test code synthesis from `constraintKind` when `code` absent. Verify original ValidationResult not mutated.
- **FormViewModel:** Verify `title`/`description` signals. Test `pageTitle(id)` with theme page fallback. Verify `pageTitle()` returns same signal instance for same pageId (memoization).
- **FEL functions:** `locale()` returns active locale code, re-evaluates on `setLocale()`. `plural()` null propagation. `formatNumber()` / `formatDate()` with explicit and implicit locale.
- **runtimeMeta:** `runtimeMeta('gender')` returns value set via `setRuntimeContext({ meta: { gender: 'feminine' } })`. Returns `null` for unset keys. Stable between `setRuntimeContext` calls.
- **pluralCategory:** `pluralCategory(1, 'en')` → `"one"`. `pluralCategory(5, 'ar')` → `"few"`. `pluralCategory(0, 'ar')` → `"zero"`. `pluralCategory(2, 'pl')` → `"few"`. Without locale param, uses active locale.
- **interpolateMessage:** `{{{{` → `{{`. `null` → `""`. Non-recursive (output not re-scanned). Error recovery: failed `{{badExpr}}` → literal `{{badExpr}}` + warning, not crash (§3.3.1 rule 2 MUST).
- **LocaleStore.lookupKeyWithMeta:** Returns `{ value, source, localeCode }`. `source` is `'regional'` when found in requested locale, `'fallback'` when found via explicit fallback chain, `'implicit'` when found via language-strip, `null` when not found (inline default).
- **LocaleStore.direction:** Returns `'rtl'` when active locale starts with `ar`/`he`/`fa`/`ur` and `formPresentation.direction` is `"auto"`. Returns `'ltr'` for other locales. Respects explicit `direction` override.
- **getAvailableLocales:** Returns codes of all loaded documents. Empty array when no locales loaded.
- **Edge cases:** `locale()` returns `""` when no locale active. Empty `strings` object is a valid no-op (all strings fall through to inline). `compatibleVersions` mismatch emits warning but still loads. `$form.title` with FEL interpolation evaluates in global context.

### Unit tests (formspec-core)

- **Locale handlers:** `locale.load` stores document, `locale.remove` deletes, `locale.select` sets `selectedLocaleId`. `locale.setString` with value sets key, with null deletes key. `locale.setStrings` batch sets. `locale.setMetadata` sets name/title/description/version. `locale.setFallback` sets/clears fallback.
- **State normalizer:** After dispatch, locale `targetDefinition.url` syncs with definition URL.
- **Import/Export:** `project.import` with `locales` object populates `state.locales`. Single locale import via `locale` key also works. Export reconstitutes `LocaleDocument` format with `$formspecLocale` envelope.
- **IProjectCore queries:** `localeAt(code)` returns correct state. `activeLocaleCode()` returns `selectedLocaleId`.
- **State init:** `createRawProject()` produces state with `locales: {}` and `selectedLocaleId: undefined`.

### Unit tests (Rust — prerequisite)

- **Shape message interpolation:** Shape with `message: "Budget ({{$budget}}) exceeds {{$limit}}"` produces resolved string in ValidationResult after Revalidate.
- **Error recovery:** Shape with `message: "{{badExpr}}"` produces literal `{{badExpr}}` in output, not a crash.
- **Escape:** Shape with `message: "Use {{{{ for templates"` produces `"Use {{ for templates"`.

### E2E tests (Playwright)

- Render form with locale documents, verify labels display in target language.
- Switch locale via `setLocale()`, verify labels update without full re-render.
- FEL interpolation: `"Total: {{$count}}"` updates when count field changes.
- Option labels: select dropdown shows localized options.
- OptionSet shared labels: multiple fields sharing optionSet show same translations.
- Validation messages: required error shows localized message (using `code` lookup).
- Repeat groups: `"Item {{@index + 1}}"` produces correct per-instance labels.
- Page titles: wizard step labels / tab headers show localized text.
- Component-tier: heading, alert, submit button show localized text via `$component.` keys.
- Context labels: switch label context, verify locale-resolved context cascade.
- Non-label context: `hint@accessibility` resolves from locale document.
- `lang` attribute: `<formspec-render>` has `lang="fr"` after `setLocale('fr')`.
- `dir` attribute: `<formspec-render>` has `dir="rtl"` after `setLocale('ar')` with `formPresentation.direction: "auto"`.
- `pluralCategory`: Arabic locale with `{{pluralCategory($count) = 'two' ? 'عنصران' : ...}}` produces correct plural form.

### Schema validation

- Validate test locale documents against updated `locale.schema.json`.
- Verify `$page.`, `$optionSet.`, and `$component.` keys pass the new `propertyNames` pattern.
- Verify keys with hyphens (`$shape.budget-balance.message`) pass the pattern.
- Verify component documents with `id` pass `component.schema.json`.
- Verify `$component.tabs.tabLabels[0]` passes (bracket indexing).
- Verify `$node:heading.text` fails (colon not allowed).

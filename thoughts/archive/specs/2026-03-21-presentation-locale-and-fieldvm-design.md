# Presentation Locale and FieldViewModel Integration Design

**Date:** 2026-03-21
**Status:** Proposed
**Prerequisites:** Locale Spec (specs/locale/locale-spec.md), ADR 0048, Locale Engine Integration Plan

---

## Overview

This document addresses the spec gap and five design gaps identified during a FieldViewModel + Locale integration review. It proposes spec-level solutions that fit the Formspec sidecar composition model.

---

## THE SPEC GAP: Presentation-Tier String Localization

### Problem

The locale spec (section 1.2) explicitly excludes Theme-tier and Component-tier strings:

> "Localization of Theme-tier or Component-tier properties -- presentation-layer strings such as `presentation.accessibility.description` are Theme concerns and are not addressable by Locale Documents."

But real forms have user-visible strings in these tiers that need localization:

**Theme tier:**
- `PageLayout.title` -- wizard step labels, tab headers, section headings
- `PageLayout.description` -- page-level instructions

**Component tier:**
- `Page.title`, `Page.description`
- `Heading.text`
- `Text.text`
- `Alert.text`
- `Divider.label`
- `Card.title`, `Card.subtitle`
- `Collapsible.title`
- `Tabs.tabLabels`
- `Accordion.labels`
- `SubmitButton.label`, `SubmitButton.pendingLabel`
- `DataTable.columns[].header`
- `ConditionalGroup.fallback`
- `Modal.triggerLabel`
- `Panel.title`

The current spec says "use a locale-specific Theme Document" but that forces maintaining full duplicate Theme/Component documents per locale just for a handful of strings, with no cascade or fallback mechanism.

### Analysis of Options

**Option A: Expand Locale Document string key namespace.** Add `$page.<id>.title`, `$component.<path>.text`, etc. as addressable keys in the existing `strings` object. This would mean the Locale Document addresses three different tiers, blurring the architectural boundary between content and presentation.

**Option B: Separate "Presentation Locale" document type.** A new `$formspecPresentationLocale` artifact with its own schema. Conceptually clean separation, but adds a *sixth* sidecar artifact. Authoring overhead for a small number of strings.

**Option C: Allow Locale Documents to have a `presentationStrings` section.** Keeps it one artifact per locale but partitions the namespace structurally.

**Option D: Make the Locale Document address all user-visible strings, regardless of tier, through a unified key namespace.** The current `strings` object already handles `$form.title`, `$shape.<id>.message`, and item-level keys. Extend the same flat namespace with `$page.<id>.title` and `$node.<path-or-id>.prop` patterns.

### Decision: Option D -- Unified String Namespace (Recommended)

The elegant insight is that the Locale Document is already *not* limited to Tier 1 -- it addresses `$form.title` and `$shape.<id>.message`, which are Definition-level concepts that renderers display. The exclusion in section 1.2 was written to prevent Locale Documents from altering *behavioral* properties like CSS or widget configuration. But page titles and component text are *content*, not *configuration* -- they are strings a human reads, exactly like item labels.

The architectural principle should be: **Locale Documents address all human-readable strings across all tiers.** The thing they must NOT do is alter behavior, layout, styling, or widget selection -- those remain Theme/Component concerns.

#### Key Namespace Extensions

Add these reserved prefixes to the locale `strings` namespace:

```
$page.<pageId>.<property>       -- Theme-tier page layout strings
$node:<nodeAddress>.<property>  -- Component-tier node strings
```

**Theme page strings:**

```json
{
  "$page.info.title": "Informations du projet",
  "$page.info.description": "Entrez les details de base du projet",
  "$page.review.title": "Revision et soumission",
  "$page.review.description": "Verifiez votre soumission avant de signer."
}
```

Page IDs are already unique within a theme (PageLayout requires `id` matching `^[a-zA-Z][a-zA-Z0-9_\-]*$`), so `$page.<id>` is unambiguous.

**Component node strings -- the addressing problem:**

Component tree nodes do not have IDs in the current spec. This is the core challenge. Three approaches:

1. **Add optional `id` property to ComponentBase.** Nodes that need localization get an explicit ID. Nodes without IDs are not addressable by locale. This is the cleanest approach and follows the Theme spec's `PageLayout.id` precedent.

2. **Use tree position paths.** E.g., `$node:tree.children[0].children[2].text`. Fragile -- any tree restructuring breaks locale keys.

3. **Use `bind` path as identifier for bound components, `id` for unbound ones.** Bound components (TextInput, Select, etc.) already get their labels from the Definition item, so they don't need component-level localization. The unbound ones (Heading, Text, Alert, Card, Collapsible) are the ones that need it, and those are the ones that would need explicit IDs.

**Recommendation: Approach 1 -- Optional `id` on ComponentBase.**

Add an optional `id` property to the `ComponentBase` schema definition:

```json
{
  "id": {
    "type": "string",
    "pattern": "^[a-zA-Z][a-zA-Z0-9_\\-]*$",
    "description": "Optional unique identifier within the component tree. Used for locale string addressing, testing, and accessibility anchoring. When present, MUST be unique across the entire component tree."
  }
}
```

Then component-tier locale keys use:

```json
{
  "$node:budgetHeading.text": "Details du budget",
  "$node:contactCard.title": "Coordonnees",
  "$node:contactCard.subtitle": "Adresse courriel et telephone",
  "$node:submitBtn.label": "Soumettre la demande",
  "$node:submitBtn.pendingLabel": "Soumission en cours...",
  "$node:advancedOptions.title": "Options avancees",
  "$node:mainTabs.tabLabels[0]": "Personnel",
  "$node:mainTabs.tabLabels[1]": "Emploi",
  "$node:mainTabs.tabLabels[2]": "Revision",
  "$node:lineItemTable.columns[0].header": "Description",
  "$node:lineItemTable.columns[1].header": "Montant",
  "$node:budgetAlert.text": "Le budget depasse la limite du departement."
}
```

The `$node:` prefix (with colon) distinguishes from the dot-only `$page.` and `$form.` prefixes, and from item keys. The colon signals "this addresses a component tree node" -- a different namespace from the dot-delimited item key space.

#### Array-valued properties

Some component props are arrays of strings: `Tabs.tabLabels`, `Accordion.labels`, `DataTable.columns[].header`. The locale key uses bracket indexing:

```
$node:<id>.tabLabels[<index>]
$node:<id>.labels[<index>]
$node:<id>.columns[<index>].header
```

This is positional, which is fragile if columns are reordered. An alternative is to key by column bind value for DataTable: `$node:<id>.columns.<bindKey>.header`. This is more stable but departs from the simple property-path model. Given that reordering columns in a DataTable also changes the column definition, positional indexing is acceptable -- the same locale update would be needed anyway.

#### Resolution cascade for presentation strings

Presentation string resolution follows the same cascade as item strings (locale spec section 4.1):

1. Regional Locale Document (e.g., `fr-CA`)
2. Explicit fallback (e.g., `fr`)
3. Implicit language fallback (strip region)
4. Inline default (the string value in the Theme/Component document)

FEL interpolation is supported in presentation strings, with one constraint: the binding context for a `$node:` key is the **global** form context (all field values accessible, no specific item scope), since component nodes are not bound to a specific item. For `$page.` keys, the binding context is likewise global.

#### Schema changes

**`locale.schema.json` -- update `propertyNames` pattern:**

The current pattern is:
```
^(\$form\.|\$shape\.|[a-zA-Z])[a-zA-Z0-9_@.\\]*$
```

Extend to:
```
^(\$form\.|\$shape\.|\$page\.|\$node:[a-zA-Z][a-zA-Z0-9_\-]*\.|[a-zA-Z])[a-zA-Z0-9_@.\\\[\]]*$
```

This adds `$page.` and `$node:<id>.` as valid key prefixes, and `[]` as valid characters (for array indexing).

**`component.schema.json` -- add `id` to `ComponentBase`:**

```json
{
  "id": {
    "type": "string",
    "pattern": "^[a-zA-Z][a-zA-Z0-9_\\-]*$",
    "description": "Optional unique identifier for this node within the component tree. Used for locale string addressing ($node:<id>.prop), test selectors, and accessibility anchoring. When present, MUST be unique across the entire component tree."
  }
}
```

#### Spec prose changes

**Locale spec section 1.2 -- replace the exclusion with inclusion:**

Replace:
> "Localization of Theme-tier or Component-tier properties -- presentation-layer strings such as `presentation.accessibility.description` are Theme concerns and are not addressable by Locale Documents."

With:
> "Locale Documents address all human-readable strings across all tiers. Theme-tier page layout strings (PageLayout.title, PageLayout.description) are addressable via the `$page.<id>` key prefix. Component-tier text props (Heading.text, Alert.text, Card.title, etc.) are addressable via the `$node:<id>.<prop>` key prefix, where `<id>` is the optional `id` property on the component node. Locale Documents MUST NOT alter non-string properties (layout, styling, widget configuration, behavioral expressions) -- those remain Theme/Component concerns."

**Add new locale spec sections 3.1.7 and 3.1.8:**

Section 3.1.7 -- Page Layout Strings:

```
$page.<pageId>.title
$page.<pageId>.description
```

Where `<pageId>` is the `id` property of a `PageLayout` in the Theme Document.

Section 3.1.8 -- Component Node Strings:

```
$node:<nodeId>.<property>
$node:<nodeId>.<property>[<index>]
$node:<nodeId>.<arrayProp>[<index>].<subProp>
```

Where `<nodeId>` is the `id` property of a component node in the Component Document. Only string-typed props (and string elements of array props) are addressable. The following component properties are localizable:

| Component | Localizable Props |
|-----------|-------------------|
| Page | `title`, `description` |
| Heading | `text` |
| Text | `text` |
| Alert | `text` |
| Divider | `label` |
| Card | `title`, `subtitle` |
| Collapsible | `title` |
| ConditionalGroup | `fallback` |
| Tabs | `tabLabels[N]` |
| Accordion | `labels[N]` |
| SubmitButton | `label`, `pendingLabel` |
| DataTable | `columns[N].header` |
| Panel | `title` |
| Modal | `triggerLabel` |
| Badge | `text` |
| ProgressBar | `label` |
| Summary | `columns[N].label` |
| TextInput | `placeholder`, `prefix`, `suffix` |

**Add component spec section on node IDs** (companion to component section 3.1):

> Components MAY include an `id` property -- a unique string identifier within the component tree. When present, `id` MUST be unique across the entire tree. The `id` enables locale string addressing (`$node:<id>.prop` in Locale Documents), test selectors, and accessibility anchoring. Processors MUST validate uniqueness when both `id` values and the component tree are available. An `id` collision MUST produce a warning (not a fatal error) to allow forward-compatible locale documents.

#### Cross-reference validation

The locale validator (section 7.2) gains two new checks:

| Check | Severity | Description |
|-------|----------|-------------|
| Orphaned page key | Warning | `$page.<id>` references a page ID not present in the Theme Document. |
| Orphaned node key | Warning | `$node:<id>` references a node ID not present in the Component Document. |

#### Why this fits the architecture

1. **Sidecar composition preserved.** The Locale Document remains a standalone sidecar. No changes to Theme or Component document structure beyond the optional `id` on components.

2. **Cascade preserved.** The same four-step cascade (regional, explicit fallback, implicit language, inline) applies to all strings. No new cascade mechanism.

3. **Processing model untouched.** String resolution remains a presentation concern, outside the four-phase core cycle. Page/component string resolution happens alongside item string resolution -- same phase, same mechanism.

4. **Clean architectural boundary.** The Locale Document addresses *content* (human-readable strings). It does not alter *configuration* (widget types, layout, styling, token values). The `$page`/`$node:` keys address the same kind of thing as `$form.title` -- text that a user reads.

---

## DESIGN GAP 1: Context Label Cascade Correction

### Problem

The locale spec section 4.1 defines the context label cascade as:

1. `key.label@context` (locale context-specific)
2. `key.label` (locale general)
3. `labels[context]` (inline context label)
4. `label` (inline default)

The proposed FieldViewModel pseudocode skips step 2, going directly from the locale context-specific key to the inline context label.

### Solution

The `resolve()` method on the FieldViewModel (or the underlying `LocaleStore.resolveString()`) MUST implement the full four-step cascade. Here is the correct algorithm:

```
resolveLabel(itemKey: string, context?: string) -> string:

  IF context is provided:
    // Step 1: locale context-specific
    result = localeStore.lookupKey(itemKey + ".label@" + context)
    if result is not null: return interpolate(result)

    // Step 2: locale general label (THE STEP THAT WAS MISSING)
    result = localeStore.lookupKey(itemKey + ".label")
    if result is not null: return interpolate(result)

    // Step 3: inline context label
    item = definition.findItem(itemKey)
    if item.labels and item.labels[context] exists:
      return item.labels[context]

    // Step 4: inline default
    return item.label

  ELSE (no context):
    // Step 1: locale general label
    result = localeStore.lookupKey(itemKey + ".label")
    if result is not null: return interpolate(result)

    // Step 2: inline default
    return item.label
```

The key insight: step 2 (locale general label) is the **general-purpose translation**. When a translator provides `"projectName.label": "Nom du projet"` but does NOT provide `"projectName.label@short"`, the renderer asking for the `short` context should still get the French translation, not fall all the way back to the English inline `labels.short`. A general translation is better than an untranslated context-specific label.

The `localeStore.lookupKey()` call itself walks the locale cascade (regional, explicit fallback, implicit language) internally. So the full resolution is actually:

1. `fr-CA` strings for `key.label@context`
2. `fr` strings for `key.label@context` (via fallback)
3. `fr-CA` strings for `key.label`
4. `fr` strings for `key.label` (via fallback)
5. Definition `labels[context]`
6. Definition `label`

Each "locale lookup" step tries the full locale cascade before falling through.

### FieldViewModel signal

The VM's `label` signal should be a computed signal that takes the `context` from an engine-level context signal:

```ts
// Inside FieldViewModel constructor
this.label = computed(() => {
  const ctx = engine.labelContext.value; // reactive
  const locale = engine.localeStore.activeLocale.value; // reactive
  return engine.resolveString(this.templatePath, 'label', ctx);
});
```

This ensures the label re-resolves when either the label context or the active locale changes.

---

## DESIGN GAP 2: Option Label Localization

### Problem

The FieldViewModel exposes `options: ReadonlySignal<OptionEntry[]>` but doesn't show how option labels get localized via keys like `fieldKey.options.yes.label`.

### Solution

The VM's `options` signal MUST produce OptionEntry objects with localized labels. The resolution happens inside the computed signal:

```ts
// FieldViewModel
this.options = computed(() => {
  const locale = engine.localeStore.activeLocale.value; // subscribe to locale changes
  const rawOptions = this.getRawOptions(); // from item.options or resolved optionSet

  return rawOptions.map(opt => ({
    value: opt.value,
    label: resolveOptionLabel(this.templatePath, opt.value, opt.label)
  }));
});

function resolveOptionLabel(templatePath: string, optionValue: string, inlineLabel: string): string {
  // Escape dots and backslashes in optionValue per locale spec section 3.1.3
  const escapedValue = optionValue.replace(/\\/g, '\\\\').replace(/\./g, '\\.');
  const key = templatePath + ".options." + escapedValue + ".label";

  const localized = localeStore.lookupKey(key);
  if (localized !== null) return interpolate(localized);
  return inlineLabel;
}
```

Key points:

1. **Escaping** (locale spec section 3.1.3): option values containing dots or backslashes MUST be escaped in the locale key. The `resolveOptionLabel` function handles this.

2. **Template path**: for items inside repeat groups, use the template path (without indices), per locale spec section 8.4. All instances of a repeated option share the same translated label.

3. **Reactivity**: reading `activeLocale.value` inside the computed makes it re-evaluate when locale changes. Reading the raw options from the engine makes it re-evaluate when options change (e.g., dynamic `choicesFrom`).

4. **OptionSet resolution**: the option locale key uses the *field's* key, not the optionSet name. If field `fundingStatus` uses optionSet `yesNoNA`, the locale key is still `fundingStatus.options.yes.label`. This is because the same optionSet may have different labels depending on which field uses it (e.g., "Yes/No" vs "Approve/Reject" for the same underlying value set).

---

## DESIGN GAP 3: Validation Message Localization

### Problem

The VM's `errors`/`firstError` signals need to resolve localized messages. The locale spec (section 8.2) says localized validation messages are resolved at render time, not during Revalidate.

### Solution

The VM's `errors` signal produces already-localized messages:

```ts
// FieldViewModel
this.errors = computed(() => {
  const locale = engine.localeStore.activeLocale.value; // subscribe
  const rawResults: ValidationResult[] = engine.getValidationResults(this.instancePath);

  return rawResults.map(result => ({
    ...result,
    message: resolveValidationMessage(this.templatePath, result)
  }));
});

this.firstError = computed(() => {
  const errs = this.errors.value;
  return errs.find(e => e.severity === 'error')?.message ?? null;
});
```

The `resolveValidationMessage` function implements the cascade from locale spec section 3.1.4:

```
resolveValidationMessage(templatePath: string, result: ValidationResult) -> string:

  // Step 1: per-kind locale key
  kindKey = templatePath + ".errors." + result.constraintKind
  localized = localeStore.lookupKey(kindKey)
  if localized is not null: return interpolate(localized, result)

  // Step 2: per-bind locale key
  if result.constraintKind === "REQUIRED":
    bindKey = templatePath + ".requiredMessage"
  else:
    bindKey = templatePath + ".constraintMessage"
  localized = localeStore.lookupKey(bindKey)
  if localized is not null: return interpolate(localized, result)

  // Step 3: inline constraintMessage from the Bind
  if bind.constraintMessage exists:
    return bind.constraintMessage

  // Step 4: processor-generated default message
  return result.message
```

The interpolation context for validation messages includes the field value and the constraint expression, enabling messages like:

```json
{
  "budget.errors.CONSTRAINT": "Le budget ({{$budget}}) doit etre inferieur a {{$maxBudget}}"
}
```

Key design point: the `ValidationResult` object itself is NOT mutated. The original `result.message` stays intact (it's the inline/default-locale message). The VM produces a *new* object with the localized message. This respects the locale spec's statement that "localized messages are a presentation overlay, not a mutation of the validation result" (section 8.2).

---

## DESIGN GAP 4: Form-Level and Shape-Level Strings

### Problem

`$form.title`, `$form.description`, `$shape.<id>.message` are not per-field. The per-field FieldViewModel doesn't handle them.

### Solution

These belong on a **FormViewModel** -- a form-level counterpart to the per-field FieldViewModel. The FormViewModel is a single reactive object per form, not per field.

```ts
interface FormViewModel {
  // Form-level strings
  title: ReadonlySignal<string>;
  description: ReadonlySignal<string>;

  // Page titles/descriptions (keyed by page ID)
  pageTitle(pageId: string): ReadonlySignal<string>;
  pageDescription(pageId: string): ReadonlySignal<string>;

  // Form-level validation
  isValid: ReadonlySignal<boolean>;
  validationSummary: ReadonlySignal<{ errors: number; warnings: number; infos: number }>;
}
```

Implementation:

```ts
class FormViewModelImpl implements FormViewModel {
  constructor(private engine: FormEngine) {
    this.title = computed(() => {
      engine.localeStore.activeLocale.value; // subscribe
      return engine.resolveString('$form', 'title') || engine.definition.title;
    });

    this.description = computed(() => {
      engine.localeStore.activeLocale.value;
      return engine.resolveString('$form', 'description') || engine.definition.description || '';
    });
  }

  pageTitle(pageId: string): ReadonlySignal<string> {
    // Memoize per pageId
    return computed(() => {
      this.engine.localeStore.activeLocale.value;
      const key = '$page.' + pageId + '.title';
      const localized = this.engine.localeStore.lookupKey(key);
      if (localized) return interpolate(localized);
      // Fall back to theme page title
      return this.engine.getPageTitle(pageId);
    });
  }

  pageDescription(pageId: string): ReadonlySignal<string> {
    return computed(() => {
      this.engine.localeStore.activeLocale.value;
      const key = '$page.' + pageId + '.description';
      const localized = this.engine.localeStore.lookupKey(key);
      if (localized) return interpolate(localized);
      return this.engine.getPageDescription(pageId);
    });
  }
}
```

**Shape messages** are localized at resolve time via the same mechanism as field validation messages. When building the validation report for display, shape-level results use `$shape.<id>.message` for locale lookup. Since shapes already have an `id`, the key is unambiguous. This happens in the `errors` signal of the FieldViewModel (a shape targeting a field produces a ValidationResult with `shapeId`) or in a form-level `validationResults` signal on the FormViewModel.

The shape message resolution cascade:

```
resolveShapeMessage(shapeId: string, result: ValidationResult) -> string:
  key = "$shape." + shapeId + ".message"
  localized = localeStore.lookupKey(key)
  if localized is not null: return interpolate(localized, result)
  return result.message  // inline from shape definition
```

---

## DESIGN GAP 5: `locale()` FEL Function Reactivity

### Problem

FEL functions don't currently have access to engine-level state beyond field values. The `locale()` function must read `LocaleStore.activeLocale.value` to establish a reactive dependency, so that expressions like `locale() = 'en'` in a `relevant` bind re-evaluate when the locale changes.

### Solution

The `locale()` function is registered as a **context-aware FEL function** -- a function that receives the engine's evaluation context, similar to how `now()` receives the time provider.

The FEL interpreter already has a mechanism for non-deterministic functions (`now()`). The `locale()` function uses the same pattern:

```ts
// In FEL function registration
registerFunction('locale', {
  arity: 0,
  evaluate: (args, context) => {
    // context.localeProvider is set by the engine
    return context.localeProvider ? context.localeProvider() : '';
  }
});
```

The `localeProvider` is a function that reads the reactive signal:

```ts
// In FormEngine, when creating FEL evaluation context
const felContext = {
  // ... existing context ...
  localeProvider: () => this.localeStore.activeLocale.value
};
```

When `locale()` is called inside a `computed()` or `effect()` (as happens during bind evaluation in the reactive graph), reading `activeLocale.value` creates a reactive subscription. When `setLocale()` is called, `activeLocale` changes, which marks expressions containing `locale()` as dirty, triggering re-evaluation through the standard Recalculate phase.

This is identical to how `now()` works -- it's a function whose return value can change between evaluations. The dependency tracker must treat `locale()` (like `now()`) as a dependency that can trigger re-evaluation. The difference: `now()` changes on a timer; `locale()` changes on explicit `setLocale()` calls.

**Important:** `locale()` is classified as non-deterministic (locale spec section 5.1). The dependency tracker MUST mark any expression containing `locale()` as potentially dirty when the active locale changes. This means `locale()`-containing expressions participate in Recalculate, but only when `setLocale()` triggers the cycle. Between locale changes, `locale()` returns a stable value and does not cause unnecessary re-evaluation.

Implementation approach:

1. `LocaleStore.activeLocale` is a Preact Signal.
2. `setLocale(code)` writes to this signal.
3. The engine treats `setLocale()` like a value change -- it triggers a full Recalculate/Revalidate/Notify cycle for any expressions that depend on `locale()`.
4. The dependency visitor marks expressions containing `locale()` with a special flag (like it does for `now()`), so the engine knows to include them in the dirty set when the locale changes.

---

## Additional Implementation Details

### `resolve()` API with `context` parameter

The unified resolution function signature:

```ts
resolveString(
  path: string,       // item key, "$form", "$page.<id>", "$node:<id>"
  property: string,   // "label", "hint", "description", "text", "title", etc.
  context?: string    // "@short", "@pdf", "@accessibility", etc.
): string
```

Context applies only to `label` property (per the spec, only labels have context variants). For other properties, the `context` parameter is ignored. If future spec revisions add context variants for other properties, the API is already ready.

### Escaped option values in locale keys

Per locale spec section 3.1.3, dots and backslashes in option values must be escaped:

```
Option value "v1.0" -> locale key: "field.options.v1\.0.label"
Option value "a\b"  -> locale key: "field.options.a\\b.label"
```

The `resolveOptionLabel()` function handles this by escaping before lookup. The locale key parser in the validator must also understand escaping when cross-referencing keys against Definition option values.

### Circular fallback detection

The locale cascade walker (section 4.3) MUST track visited locale codes to detect cycles:

```
walkCascade(key: string, startCode: string) -> string | null:
  visited = Set()
  code = startCode

  while code is not null and code not in visited:
    visited.add(code)
    doc = documents.get(code)
    if doc is null: break
    if key in doc.strings: return doc.strings[key]
    code = doc.fallback

  // Implicit language fallback (strip region from original startCode)
  baseCode = stripRegion(startCode)
  if baseCode is not null and baseCode not in visited:
    doc = documents.get(baseCode)
    if doc is not null and key in doc.strings:
      return doc.strings[key]

  return null  // fall through to inline
```

The `visited` set prevents infinite loops. A circular chain (e.g., `fr-CA -> fr -> fr-CA`) terminates at the first revisit and falls through to inline defaults. A warning is emitted.

### Template path vs. instance path

For locale key lookup, always use the **template path** (indices stripped):

```
Instance path:  "lineItems[2].amount"
Template path:  "lineItems.amount"
Locale key:     "lineItems.amount.label"
```

For FEL interpolation within locale strings, the expression is evaluated in the **instance context** -- `@index` resolves to the actual instance index, `$field` resolves to the instance's value. This enables:

```json
{
  "lineItems.label": "Poste budgetaire {{@index + 1}}"
}
```

which produces "Poste budgetaire 1", "Poste budgetaire 2", etc. per instance.

The FieldViewModel must hold both paths:

```ts
interface FieldViewModel {
  templatePath: string;   // for locale key lookup
  instancePath: string;   // for FEL interpolation context, value access
  // ...
}
```

### Hot-reload on `loadLocale()` for active locale

When `loadLocale(doc)` is called and `doc.locale` matches the currently active locale code (or is in the active cascade), all resolved strings must re-resolve. The implementation:

1. `loadLocale()` replaces the document in the store.
2. If the loaded document's locale is in the current cascade, bump the `version` signal.
3. All computed signals that read `version.value` (through `lookupKey()`) re-evaluate.

Alternatively, `loadLocale()` can always bump a version counter and let the computed signals figure out if anything actually changed. The signal system's equality check prevents unnecessary DOM updates if the resolved string is the same.

---

## Summary of Spec Changes Required

| Document | Section | Change |
|----------|---------|--------|
| Locale spec | 1.2 Scope | Replace exclusion with scoped inclusion of presentation strings |
| Locale spec | 3.1 | Add sections 3.1.7 (Page Layout Strings) and 3.1.8 (Component Node Strings) |
| Locale spec | 3.2 | Update key resolution rules for `$page.` and `$node:` prefixes |
| Locale spec | 7.2 | Add orphaned page key and orphaned node key validation checks |
| Locale spec | Appendix A | Add `$page` and `$node:` examples to the complete example |
| Component spec | 3.1 (or new subsection) | Document optional `id` property on ComponentBase |
| Component spec | Each component section | Note which string props are localizable |
| `locale.schema.json` | `strings.propertyNames.pattern` | Extend regex to allow `$page.` and `$node:` prefixes plus `[]` |
| `component.schema.json` | `ComponentBase` | Add optional `id` property |

## Summary of FieldViewModel / FormViewModel Design

| Signal | Owned by | Source | Locale-aware |
|--------|----------|--------|--------------|
| `label` | FieldViewModel | resolveString(templatePath, 'label', context) | Yes |
| `hint` | FieldViewModel | resolveString(templatePath, 'hint') | Yes |
| `description` | FieldViewModel | resolveString(templatePath, 'description') | Yes |
| `options` | FieldViewModel | rawOptions mapped through resolveOptionLabel() | Yes |
| `errors` | FieldViewModel | rawResults mapped through resolveValidationMessage() | Yes |
| `firstError` | FieldViewModel | derived from errors | Yes (transitively) |
| `value` | FieldViewModel | engine value signal | No |
| `required` | FieldViewModel | engine required signal | No |
| `visible` | FieldViewModel | engine relevant signal | No |
| `readonly` | FieldViewModel | engine readonly signal | No |
| `title` | FormViewModel | resolveString('$form', 'title') | Yes |
| `description` | FormViewModel | resolveString('$form', 'description') | Yes |
| `pageTitle(id)` | FormViewModel | $page.id.title cascade | Yes |
| `pageDescription(id)` | FormViewModel | $page.id.description cascade | Yes |

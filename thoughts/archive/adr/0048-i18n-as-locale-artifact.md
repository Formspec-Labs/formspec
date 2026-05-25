# ADR 0048: Internationalization as a Composable Locale Artifact

**Status:** Accepted
**Date:** 2026-03-20

## Context

Formspec needs internationalization (i18n) support — forms must be presentable in multiple languages. Every string property in a Definition (labels, hints, error messages, option display text) needs locale-variant resolution.

The conventional approach is to embed translations inside the Definition itself — either as parallel `label_en` / `label_fr` properties, a nested `translations` map per item, or an `i18n` block at the root that maps locale codes to string overrides. Every major form library and CMS does some variation of this.

This approach has well-documented problems:

1. **Bloat** — A Definition with 10 locales is 10× larger even though only one locale is active at a time. Every consumer downloads all translations.
2. **Coupling** — Translators must edit the Definition file, which also contains structure, logic, and validation. Merge conflicts between structural changes and translation updates are inevitable.
3. **Inconsistency** — Each property that can be localized needs its own localization mechanism. Labels, hints, error messages, option text, group titles — the same pattern repeated ad nauseam.
4. **No composition** — You can't layer locale-specific overrides (e.g., Canadian French on top of standard French) without the Definition becoming even more complex.
5. **Violates separation of concerns** — The core architectural insight of Formspec is that structure, behavior, presentation, and data transformation are separate artifacts (Definition, Theme, Component, Mapping). Embedding translations in the Definition conflates content with structure.

### The Formspec pattern

Formspec already solved analogous problems:

| Concern | Inline (Tier 1) | Sidecar artifact |
|---------|-----------------|------------------|
| Presentation | `presentation` hints on items | Theme Document |
| Interaction | `widgetHint` on items | Component Document |
| Data transform | `fieldMap` in version migration | Mapping Document |
| **Localization** | Inline string properties | **Locale Document** (this ADR) |

In every case, the pattern is the same: the Definition provides sensible defaults inline; a separate, composable artifact overrides them. The sidecar artifact has its own schema, its own versioning, its own authoring workflow.

### Why "locale as mapping" specifically

The Mapping DSL transforms data between schemas. A Locale Document transforms *strings* between languages. The conceptual parallel:

- **Mapping:** `sourcePath` → transform → `targetPath` (data reshaping)
- **Locale:** `itemPath.property` → resolve → localized string (string resolution)

Both are declarative, path-based, and support FEL expressions for dynamic content. Both compose via cascading. Both are optional sidecar artifacts that don't modify the Definition.

The key difference: Mapping transforms *values* bidirectionally between *schemas*. Locale transforms *presentation strings* unidirectionally from *keys* to *display text*. The Locale Document is simpler than a Mapping Document — it doesn't need reverse transforms, type coercion, or adapter contracts. It's closer in spirit to a Theme Document (a cascade of overrides keyed by path).

---

## Decision

Define internationalization as a **Locale Document** — a standalone JSON artifact with its own schema (`schemas/locale.schema.json`) and specification (`specs/locale/locale-spec.md`).

A Locale Document:

1. **Is a sidecar to a Definition**, like Theme and Mapping Documents. It references a Definition by URL and declares compatible versions.
2. **Maps item paths to localized strings** using a flat `strings` object keyed by `<itemPath>.<property>` (e.g., `q1.label`, `group1.hint`, `budget.errors.REQUIRED`).
3. **Supports FEL interpolation** in string values via `{{expression}}` syntax. Expressions are evaluated in the item's binding context, giving access to field values, functions, and the full FEL stdlib.
4. **Composes via fallback chains** — `fr-CA` falls back to `fr`, which falls back to the Definition's inline strings. Same cascade concept as Theme tokens.
5. **Supports contextual variants** via a `@context` suffix on keys (e.g., `q1.label@short`, `q1.label@accessibility`). Renderers select the appropriate context.
6. **Adds a `locale()` FEL function** that returns the active locale code, enabling locale-aware `calculate` and `relevant` expressions in the Definition itself.
7. **Does NOT require ICU/CLDR in the engine** — pluralization, gender agreement, and number formatting are expressed as FEL expressions authored by the translator. A `plural()` stdlib function covers common cases without bundling CLDR data.

### What the engine does

Minimal new API surface:

- `loadLocale(document)` — registers a Locale Document in the cascade
- `setLocale(code)` — activates a locale, triggering reactive updates
- `resolveString(path, property, context?)` — walks the cascade and returns the resolved string
- String resolution is reactive — changing the active locale propagates through all resolved strings via signals

### What the engine does NOT do

- No built-in plural rules, gender tables, or number format patterns (FEL handles this)
- No locale negotiation or Accept-Language parsing (host application concern)
- No right-to-left layout switching (Theme concern — use a locale-specific Theme)
- No translation memory, machine translation, or translator tooling (external tooling concern)

---

## Consequences

### Positive

- **Zero new concepts** — authors already understand sidecar artifacts, path-based overrides, FEL expressions, and fallback cascading. Locale Documents use all four.
- **Clean separation** — translators work on Locale Documents without touching the Definition. Structural changes to the Definition don't break translations (unless item paths change, which the validator can detect).
- **Composable** — regional variants layer on top of base locales. Organizations can share base translations and override locally.
- **Lightweight engine impact** — string resolution is a hashmap lookup + FEL evaluation. No new reactive primitives. The locale cascade is a `Vec<HashMap>` walked in priority order.
- **Tooling for free** — the Python validator already walks item paths. Cross-referencing Locale Documents for missing translations is a natural extension of existing linting.
- **Schema-validated** — Locale Documents get their own JSON Schema with the same `x-lm.critical` annotations and generated doc infrastructure as every other artifact.

### Negative

- **New artifact to manage** — each locale is a separate file. A form with 10 locales has 10 Locale Documents. This is the same tradeoff as having separate Theme Documents per platform.
- **FEL complexity for plurals** — expressing plural rules as FEL expressions (e.g., `{{count != 1 ? 's' : ''}}`) is more verbose than ICU MessageFormat's `{count, plural, one {# item} other {# items}}`. Mitigated by the `plural()` stdlib function.
- **Path coupling** — renaming an item in the Definition silently breaks Locale Document keys. Mitigated by validator cross-referencing (same problem exists for Theme `items` keys, already handled).

### Neutral

- RTL support is explicitly a Theme concern, not a Locale concern. A locale-specific Theme can set `direction: "rtl"` and adjust layout. This is correct separation — text direction is presentation, not content.
- The Definition's inline strings serve as the default locale. Authors who don't need i18n change nothing.

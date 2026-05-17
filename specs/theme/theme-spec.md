---
title: Formspec Theme Specification
version: 1.0.0-draft.1
date: 2026-04-09
status: draft
---

# Formspec Theme Specification v1.0

## Status of This Document

This document is a **Draft** companion specification to the
[Formspec v1.0 Core Specification](../core/spec.md). It defines the Formspec Theme
Document format — a sidecar JSON document that controls how a Formspec
Definition is rendered.

## Conventions and Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this
document are to be interpreted as described in
[RFC 2119](https://www.ietf.org/rfc/rfc2119.txt).

## 1. Introduction

### 1.1 Purpose and Scope

The Formspec Core Specification defines **what** data to collect
(Items, §4.2) and **how** it behaves (Binds, Shapes). It provides
OPTIONAL, advisory presentation hints (§4.1.1, §4.2.5) that suggest
widgets, layout, and accessibility metadata inline on each Item.

This specification defines a **sidecar theme document** — a separate
JSON file that controls the visual presentation of a Formspec Definition.
A Theme Document:

- References a Definition by URL.
- Overrides inline presentation hints with a selector cascade.
- Assigns widgets with typed configuration and fallback chains.
- Defines page layout with a 12-column grid.
- Provides design tokens for visual consistency.

Multiple Theme Documents MAY target the same Definition. This enables
platform-specific rendering (web, mobile, PDF, kiosk) without modifying
the Definition.

### 1.2 Relationship to Formspec Core

The Formspec Core Specification defines a three-layer architecture:

| Layer | Concern | Defined In |
|-------|---------|------------|
| 1. Structure | What data to collect | Core §4 (Items) |
| 2. Behavior | How data behaves | Core §4.3 (Binds), §5 (Shapes) |
| 3. Presentation | How data is displayed | Core §4.2.5 (Tier 1 hints) + **this spec** (Tier 2 themes) |

Tier 1 (inline hints) and Tier 2 (themes) interact through a
precedence cascade defined in §5 of this document. Tier 1 hints serve
as author-specified defaults; Tier 2 themes override them.

### 1.3 Terminology

| Term | Definition |
|------|------------|
| **Definition** | A Formspec Definition document (core spec §4). |
| **Theme** | A Formspec Theme document conforming to this specification. |
| **Tier 1 hints** | The `formPresentation` and `presentation` properties defined in core spec §4.1.1 and §4.2.5. |
| **Renderer** | Software that presents a Definition to end users. |
| **Token** | A named design value (color, spacing, typography) defined in §3. |
| **Widget** | A UI control type (text input, slider, toggle, etc.). |
| **Cascade** | The precedence system that determines the effective presentation for each item (§5). |

### 1.4 Notational Conventions

JSON examples use `//` comments for annotation; comments are not valid
JSON. Property names in monospace (`widget`) refer to JSON keys.
Section references (§N) refer to this document unless prefixed with
"core" (e.g., "core §4.2.5").

## Bottom Line Up Front

<!-- bluf:start file=theme-spec.bluf.md -->
- This document defines the Tier 2 sidecar theme model for Formspec presentation behavior.
- A valid theme requires `$formspecTheme`, `version`, and `targetDefinition`.
- Effective rendering is resolved through a 3-level cascade: `defaults` -> `selectors` -> `items`.
- This BLUF is governed by `schemas/theme.schema.json`; generated tables should be treated as canonical structural reference.
<!-- bluf:end -->

## 2. Theme Document Structure

A Formspec Theme is a JSON object. Conforming implementations MUST
recognize the following top-level properties and MUST reject any Theme
that omits a REQUIRED property.

```json
{
  "$formspecTheme": "1.0",
  "url": "https://agency.gov/forms/budget/themes/web",
  "version": "1.0.0",
  "name": "Budget-Web",
  "title": "Budget Form — Web Theme",
  "description": "Web-optimized theme for the annual budget form.",
  "targetDefinition": {
    "url": "https://agency.gov/forms/budget",
    "compatibleVersions": ">=1.0.0 <2.0.0"
  },
  "platform": "web",
  "stylesheets": [
    "https://cdn.example.com/design-system/3.0/styles.css"
  ],
  "tokens": {},
  "defaults": {},
  "selectors": [],
  "items": {},
  "pages": [],
  "breakpoints": {},
  "extensions": {}
}
```

### 2.1 Top-Level Properties

<!-- schema-ref:start id=theme-top-level schema=schemas/theme.schema.json pointers=# -->
<!-- generated:schema-ref id=theme-top-level -->
| Pointer | Field | Type | Required | Notes | Description |
|---|---|---|---|---|---|
| `#/properties/$formspecTheme` | `$formspecTheme` | <code>string</code> | yes | const: <code>"1.0"</code>; critical | Theme specification version. MUST be '1.0'. |
| `#/properties/breakpoints` | `breakpoints` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/Breakpoints</code> | Named responsive breakpoints as min-width pixel values. Referenced by regions' 'responsive' objects to override span, start, or visibility at different viewport sizes. Processors that do not support responsive layouts SHOULD use the base span and start values. |
| `#/properties/defaults` | `defaults` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/PresentationBlock</code>; critical | Cascade level 1 (lowest theme specificity): baseline PresentationBlock applied to every item before selectors or per-item overrides. Sets the form-wide visual baseline. Overrides Tier 1 inline presentation hints (level 0) and formPresentation globals (level -1). Overridden by selectors (level 2) and items (level 3). Merge is shallow per-property — nested objects (widgetConfig, style, accessibility) are replaced as a whole, not deep-merged. Exception: cssClass uses union semantics across all levels. |
| `#/properties/description` | `description` | <code>string</code> | no | — | Human-readable description of the theme's purpose and target audience. |
| `#/properties/extensions` | `extensions` | <code>object</code> | no | — | Extension namespace for platform-specific or vendor-specific metadata. All keys MUST be x- prefixed. Processors MUST ignore unrecognized extensions. Extensions MUST NOT alter core presentation semantics. |
| `#/properties/items` | `items` | <code>object</code> | no | critical | Cascade level 3 (highest theme specificity): per-item overrides keyed by the item's 'key' from the Definition. Overrides all lower cascade levels. Item keys that do not correspond to any item in the target Definition SHOULD produce a warning but MUST NOT cause failure. |
| `#/properties/name` | `name` | <code>string</code> | no | — | Machine-friendly short identifier for programmatic use. |
| `#/properties/pages` | `pages` | <code>array</code> | no | — | Page layout — ordered list of pages grouping items into logical sections with a 12-column grid. When absent, the renderer walks the Definition's item tree top-to-bottom without page grouping. Items not referenced by any region on any page SHOULD be rendered after all pages in default order. The cascade (defaults/selectors/items) still applies regardless of page layout. |
| `#/properties/platform` | `platform` | <code>string</code> | no | — | Target rendering platform. Informational — processors that do not recognize a platform value SHOULD apply the theme regardless. Well-known values: 'web' (desktop/mobile browsers), 'mobile' (native apps), 'pdf' (PDF rendering), 'print' (print-optimized), 'kiosk' (public terminals), 'universal' (no platform assumptions, implicit default). |
| `#/properties/selectors` | `selectors` | <code>array</code> | no | critical | Cascade level 2: type/dataType-based presentation overrides. Each selector has a 'match' (criteria) and 'apply' (PresentationBlock). Selectors are evaluated in document order — all matching selectors apply, with later matches overriding earlier ones per-property. Overrides defaults (level 1); overridden by items (level 3). |
| `#/properties/stylesheets` | `stylesheets` | <code>array</code> | no | — | External CSS stylesheet URIs. Web renderers SHOULD load these before rendering the form. Loaded in array order — later sheets take CSS precedence over earlier sheets. Renderers MUST NOT fail if a stylesheet cannot be loaded; they SHOULD warn and continue. Non-web renderers (PDF, native) MAY ignore stylesheets. Subject to host application security policy (CSP, CORS). |
| `#/properties/targetDefinition` | `targetDefinition` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/TargetDefinition</code>; critical | Binding to the target Formspec Definition and compatible version range. The theme will only be applied to Definitions matching this target. If compatibleVersions is present and the Definition version falls outside the range, the processor SHOULD warn and MAY fall back to Tier 1 hints only (null theme). The processor MUST NOT fail on a version mismatch. |
| `#/properties/title` | `title` | <code>string</code> | no | — | Human-readable display name for the theme. |
| `#/properties/tokenMeta` | `tokenMeta` | <code>object</code> | no | — | Metadata for custom tokens introduced by this theme. Follows the Token Registry category schema. Platform tokens MUST NOT be redefined here — the platform registry provides their metadata. See the Token Registry Specification for details. |
| `#/properties/tokens` | `tokens` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/Tokens</code>; critical | Design tokens — named values (colors, spacing, typography, borders) that promote visual consistency. Defined once here, referenced throughout the theme via '$token.<key>' syntax in style and widgetConfig string values. Token keys use dot-delimited category prefixes (e.g., 'color.primary', 'spacing.md'). Values MUST be strings or numbers. Token references MUST NOT be recursive. |
| `#/properties/url` | `url` | <code>string</code> | no | — | Canonical identifier for this theme. Stable across theme versions — the pair (url, version) SHOULD be globally unique. |
| `#/properties/version` | `version` | <code>string</code> | yes | critical | Version of this theme document. SemVer is RECOMMENDED. The pair (url, version) SHOULD be unique across all published theme versions. |
<!-- schema-ref:end -->

The generated table above is the canonical structural contract for top-level properties.

### 2.2 Target Definition Binding

The `targetDefinition` object binds this theme to a specific Definition.

| Property | Type | Cardinality | Description |
|---|---|---|---|
| `url` | string (URI) | **1..1** (REQUIRED) | Canonical URL of the target Definition (`url` property from the Definition). |
| `compatibleVersions` | string | **0..1** (OPTIONAL) | Semver range expression using node/npm-style range syntax (e.g., `">=1.0.0 <2.0.0"`) describing which Definition versions this theme supports. When absent, the theme is assumed compatible with any version. |

When `compatibleVersions` is present, a processor SHOULD verify that the
Definition's `version` satisfies the range before applying the theme.
A processor MUST NOT fail if the range is unsatisfied; it SHOULD warn
and MAY fall back to Tier 1 hints.

### 2.3 Platform Declaration

The `platform` property is an open string indicating the intended
rendering platform. Well-known values:

| Value | Description |
|-------|-------------|
| `"web"` | Desktop and mobile web browsers. |
| `"mobile"` | Native mobile applications. |
| `"pdf"` | PDF or print rendering. |
| `"print"` | Print-optimized layout. |
| `"kiosk"` | Public kiosk or terminal. |
| `"universal"` | No platform-specific assumptions (default). |

Implementors MAY define additional platform values. Processors that do
not recognize a `platform` value SHOULD apply the theme regardless.

### 2.4 Theme Versioning

The `version` property is a free-form string. Semantic versioning
(SemVer) is RECOMMENDED. The pair (`url`, `version`) SHOULD be unique
across all published versions of a theme.

### 2.5 External Stylesheets

The optional `stylesheets` property is an array of URI strings
pointing to external CSS files.

```json
{
  "stylesheets": [
    "https://cdn.example.com/uswds/3.11/uswds.min.css",
    "https://cdn.example.com/custom/form-overrides.css"
  ]
}
```

Normative requirements:

- Web renderers SHOULD load declared stylesheets before rendering the
  form. Stylesheets are loaded in array order; later sheets take CSS
  precedence over earlier sheets.
- Renderers MAY cache stylesheets, load them lazily, or scope them
  to the form container.
- Renderers MUST NOT fail if a stylesheet cannot be loaded; they
  SHOULD warn and continue rendering.
- Non-web renderers (PDF, native) MAY ignore `stylesheets`.
- `stylesheets` URLs are subject to the host application's security
  policy (CSP, CORS, etc.).

## 3. Design Tokens

Design tokens are named values that promote visual consistency across a
themed form. They are defined once and referenced throughout the theme.

### 3.1 Token Structure

The `tokens` object is a flat key-value map. Keys are dot-delimited
names; values are strings or numbers.

```json
{
  "tokens": {
    "color.primary": "#0057B7",
    "color.error": "#D32F2F",
    "color.surface": "#FFFFFF",
    "spacing.sm": "8px",
    "spacing.md": "16px",
    "spacing.lg": "24px",
    "border.radius": "6px",
    "border.width": 1,
    "typography.body.family": "Inter, system-ui, sans-serif",
    "typography.body.size": "1rem",
    "elevation.low": "0 1px 3px rgba(0,0,0,0.12)"
  }
}
```

Token keys MUST be non-empty strings. Token values MUST be strings or
numbers. Tokens MUST NOT contain nested objects, arrays, booleans, or
null.

> **Informative note — DTCG Compatibility:**
>
> This structure is inspired by the
> [Design Tokens Community Group](https://design-tokens.github.io/community-group/format/)
> format. The flat key-value approach is simpler than the DTCG nested
> group structure but can be transformed to/from DTCG format by
> splitting/joining on dots.

### 3.2 Token Categories

Token keys SHOULD use the following category prefixes for
interoperability. These categories are RECOMMENDED, not required.

| Prefix | Purpose | Example keys |
|--------|---------|-------------|
| `color.` | Colors (hex, rgb, hsl, named) | `color.primary`, `color.error`, `color.warning`, `color.success`, `color.info`, `color.surface`, `color.background` |
| `spacing.` | Spacing and padding | `spacing.xs`, `spacing.sm`, `spacing.md`, `spacing.lg`, `spacing.field` |
| `font.` | Font properties | `font.family` |
| `radius.` | Border radii | `radius.sm`, `radius.md` |
| `typography.` | Extended typography (font size, weight, line-height) | `typography.body.family`, `typography.body.size`, `typography.heading.weight` |
| `border.` | Border width, style, color | `border.width`, `border.color` |
| `elevation.` | Shadows and depth | `elevation.low`, `elevation.medium`, `elevation.high` |
| `x-` | Custom/vendor tokens | `x-brand.logo-height`, `x-agency.seal-color` |

> **See also:** The [Token Registry Specification](token-registry-spec.md)
> defines a structured catalog format that adds type, description, and
> default metadata to these token categories. The registry enables
> studio tooling and validation without changing the flat token map
> format.

### 3.3 Token Reference Syntax

Tokens are referenced in `style` objects, `widgetConfig` string
values, and Tier 3 Component Documents using the `$token.` prefix:

```
$token.<key>
```

Examples:
- `$token.color.primary` → resolves to the value of `tokens["color.primary"]`
- `$token.spacing.md` → resolves to the value of `tokens["spacing.md"]`

The reference syntax MUST be `$token.` followed by the exact token key.
Token references are resolved at theme-application time, not at
authoring time.

> **Cross-tier note:** The `$token.` prefix is reserved across all
> Formspec presentation tiers. Future Tier 3 (Component) specifications
> use `{param}` syntax for template interpolation, which does not
> conflict with `$token.` references.

### 3.4 Token Resolution

When a processor encounters a `$token.` reference:

1. Look up the referenced key in the theme's `tokens` object.
2. If found, substitute the token's value.
3. If NOT found, the processor MUST use a platform-appropriate default
   and SHOULD emit a warning.

Token references MUST NOT be recursive (a token value MUST NOT itself
contain a `$token.` reference to another token). Processors MUST treat
recursive references as unresolved.

### 3.5 Custom Token Groups

Token keys prefixed with `x-` are reserved for custom or
vendor-specific tokens. Processors MUST NOT assign semantics to `x-`
prefixed tokens unless they recognize the specific extension.

### 3.6 Color Scheme Variants

Theme documents MAY include dark-mode token overrides using the
`color.dark.*` prefix convention. For every light-mode token
`color.<name>`, the corresponding dark-mode token is
`color.dark.<name>`. Dark tokens follow the same naming rules
as their light counterparts.

Renderers that support color schemes SHOULD emit both `color.*` and
`color.dark.*` tokens as CSS custom properties. Dark-mode stylesheets
reference the `color.dark.*` properties with fallback values:

```css
/* Light mode */
--formspec-default-primary: var(--formspec-color-primary, #1f6a5b);
/* Dark mode */
--formspec-default-primary: var(--formspec-color-dark-primary, #8bb8ac);
```

This convention ensures that:

- Theme authors can customize both color schemes from the token map.
- Renderers that do not support dark mode simply ignore the
  `color.dark.*` tokens — they are emitted as CSS custom properties
  but have no effect unless a dark-mode stylesheet references them.
- The fallback values provide a curated dark palette when no
  `color.dark.*` tokens are present in the theme document.

Renderers MAY activate dark-mode stylesheets via `prefers-color-scheme`
media queries, explicit appearance classes, or other
renderer-specific mechanisms.

## 4. Widget Catalog

### 4.1 Relationship to Tier 1 widgetHint

Theme Documents use the **same widget vocabulary** as the core
specification’s `widgetHint` property (core §4.2.5.1). The `widget`
property in a PresentationBlock (§5) accepts any value that is valid
as a Tier 1 `widgetHint`.

The theme adds two capabilities beyond Tier 1:

1. **Typed `widgetConfig` objects** — per-widget configuration.
2. **`fallback` arrays** — ordered fallback chains when a widget is
   unavailable.

### 4.2 Typed widgetConfig Objects

The `widgetConfig` property is an open object. The following tables
define well-known configuration properties per widget. Renderers
SHOULD support the listed properties and MUST ignore unrecognized keys.

#### Required Widgets

Renderers MUST support these widgets.

**`textInput`** (string, uri)

| Property | Type | Description |
|---|---|---|
| `maxLength` | integer | Maximum character count display. |
| `inputMode` | string | Input hint: `"text"`, `"email"`, `"tel"`, `"url"`. |

**`textarea`** (text)

| Property | Type | Description |
|---|---|---|
| `rows` | integer | Visible text rows. |
| `maxRows` | integer | Maximum rows before scroll. |
| `autoResize` | boolean | Auto-resize to content. |

**`numberInput`** (integer, decimal)

| Property | Type | Description |
|---|---|---|
| `showStepper` | boolean | Show increment/decrement buttons. |
| `locale` | string | Locale for number formatting (e.g., `"en-US"`). |

**`checkbox`** (boolean) — No configuration properties.

**`datePicker`** (date, dateTime, time)

| Property | Type | Description |
|---|---|---|
| `format` | string | Display format (e.g., `"YYYY-MM-DD"`). |
| `minDate` | string | Earliest selectable date (ISO 8601). |
| `maxDate` | string | Latest selectable date (ISO 8601). |

**`dropdown`** (choice)

| Property | Type | Description |
|---|---|---|
| `searchable` | boolean | Enable type-ahead search. |
| `placeholder` | string | Placeholder text when no selection. |

**`checkboxGroup`** (multiChoice)

| Property | Type | Description |
|---|---|---|
| `columns` | integer | Number of columns for layout. |
| `maxVisible` | integer | Max visible items before scroll. |

**`fileUpload`** (attachment)

| Property | Type | Description |
|---|---|---|
| `accept` | string | Accepted file types (MIME types or extensions). |
| `maxSizeMb` | number | Maximum file size in megabytes. |
| `preview` | boolean | Show file preview after selection. |

**`moneyInput`** (money)

| Property | Type | Description |
|---|---|---|
| `showCurrencySymbol` | boolean | Display currency symbol. |
| `locale` | string | Locale for currency formatting. |

#### Progressive Widgets

Renderers SHOULD support these widgets. When unavailable, the renderer
MUST use the specified fallback or the `fallback` array from the theme.

| Widget | Applies to | Config Properties | Default Fallback |
|---|---|---|---|
| `slider` | integer, decimal | `min`, `max`, `step`, `showTicks`, `showValue` | `numberInput` |
| `stepper` | integer | `min`, `max`, `step` | `numberInput` |
| `rating` | integer | `max`, `icon` (`"star"`, `"heart"`) | `numberInput` |
| `toggle` | boolean | `onLabel`, `offLabel` | `checkbox` |
| `yesNo` | boolean | (none) | `checkbox` |
| `radio` | choice | `direction` (`"vertical"`, `"horizontal"`), `columns` | `dropdown` |
| `autocomplete` | choice, multiChoice | `debounceMs`, `minChars` | `dropdown` / `checkboxGroup` |
| `segmented` | choice | (none) | `radio` |
| `likert` | choice | `scaleLabels` (array of strings) | `radio` |
| `multiSelect` | multiChoice | `searchable`, `maxItems` | `checkboxGroup` |
| `richText` | text | `toolbar` (array of tool names) | `textarea` |
| `password` | string | `showToggle` (boolean) | `textInput` |
| `color` | string | `format` (`"hex"`, `"rgb"`) | `textInput` |
| `urlInput` | uri | (none) | `textInput` |
| `dateInput` | date | `format` | `datePicker` |
| `dateTimePicker` | dateTime | `format` | `datePicker` |
| `dateTimeInput` | dateTime | `format` | `textInput` |
| `timePicker` | time | `format`, `step` | `textInput` |
| `timeInput` | time | `format` | `textInput` |
| `camera` | attachment | `facing` (`"user"`, `"environment"`) | `fileUpload` |
| `signature` | attachment | `strokeColor`, `height` (integer, pixels) | `fileUpload` |

Group and Display widgets (`section`, `card`, `accordion`, `tab`,
`heading`, `paragraph`, `divider`, `banner`) have no `widgetConfig`
properties.

### 4.3 Fallback Chains

The `fallback` array in a PresentationBlock lists ordered fallback
widgets. When a renderer does not support the primary `widget`, it
MUST try each fallback in order and use the first it supports.

```json
{
  "widget": "signature",
  "widgetConfig": { "strokeColor": "#000" },
  "fallback": ["camera", "fileUpload"]
}
```

If no widget in the chain is supported, the renderer MUST use its
default widget for the item’s `dataType` as defined in core §4.2.5.1.

Fallback resolution does NOT carry `widgetConfig` forward — each
fallback widget uses its own default configuration unless the theme
provides separate configuration for the fallback widget via the
cascade.

### 4.4 Widget Rendering Requirements

- A renderer MUST support all **required** widgets listed in §4.2.
- A renderer SHOULD support **progressive** widgets and MUST declare
  which progressive widgets it supports.
- A renderer MUST resolve the `fallback` chain when it does not support
  the primary widget.
- A renderer MUST ignore unrecognized `widgetConfig` keys.
- Custom widgets MUST be prefixed with `x-` (e.g., `"x-map-picker"`).
  Renderers MUST NOT fail on unrecognized `x-` widgets; they MUST fall
  back.

## 5. Selector Cascade

### 5.1 Overview

The cascade determines the **effective presentation** for each item in
a Definition. It combines Tier 1 inline hints, theme defaults,
type/dataType selectors, and per-item overrides into a single resolved
PresentationBlock.

The cascade has **three theme levels** plus two Tier 1 baselines:

| Level | Source | Description |
|-------|--------|-------------|
| 3 | Theme `items.{key}` | Per-item override. Highest theme specificity. |
| 2 | Theme `selectors[]` | Type and dataType-based rules. |
| 1 | Theme `defaults` | Baseline for all items. |
| 0 | Tier 1 `presentation` | Inline hints on the item (core §4.2.5). |
| -1 | Tier 1 `formPresentation` | Form-wide defaults (core §4.1.1). |
| -2 | Renderer defaults | Platform and implementation defaults (implicit). |

Higher-numbered levels override lower-numbered levels.

### 5.2 Level 1: Defaults

The `defaults` property is a PresentationBlock applied to every item
before any selectors or per-item overrides. It sets the baseline for
the entire form.

```json
{
  "defaults": {
    "labelPosition": "top",
    "style": {
      "borderRadius": "$token.border.radius"
    }
  }
}
```

### 5.3 Level 2: Selectors

The `selectors` array contains objects with `match` and `apply`
properties. Each selector tests an item against the `match` criteria;
if the item matches, the `apply` PresentationBlock is merged into the
resolved result.

```json
{
  "selectors": [
    {
      "match": { "dataType": "money" },
      "apply": { "widget": "moneyInput", "widgetConfig": { "showCurrencySymbol": true } }
    },
    {
      "match": { "type": "display" },
      "apply": { "widget": "paragraph" }
    }
  ]
}
```

#### Selector Match Criteria

The `match` object supports two criteria with AND semantics:

| Key | Type | Matches |
|-----|------|--------|
| `type` | string | Item’s `type` (`"group"`, `"field"`, `"display"`). |
| `dataType` | string | Item’s `dataType` (field items only; one of the 13 core data types). |

A `match` MUST contain at least one of `type` or `dataType`. When both
are present, an item MUST satisfy both criteria to match.

**All matching selectors apply.** Selectors are evaluated in document
order. When multiple selectors match the same item, each subsequent
match’s `apply` block is merged on top of the previous. Later
selectors override earlier ones per-property.

### 5.4 Level 3: Item Key Overrides

The `items` object maps item keys directly to PresentationBlocks.
This is the highest specificity in the cascade.

```json
{
  "items": {
    "totalBudget": {
      "widget": "slider",
      "widgetConfig": { "min": 0, "max": 1000000, "step": 10000 },
      "style": { "background": "#F0F6FF" }
    }
  }
}
```

Item keys in the theme that do not correspond to any item in the target
Definition SHOULD produce a warning. Processors MUST NOT fail on
unrecognized keys.

### 5.5 Cascade Resolution Algorithm

For each item in the Definition, the resolved PresentationBlock is
computed as follows:

```
function resolve(item, definition, theme):
  resolved = {}
  cssClasses = []    // accumulator for cssClass union

  // Level -1: Tier 1 formPresentation globals
  if definition.formPresentation exists:
    merge(resolved, { labelPosition: definition.formPresentation.labelPosition })

  // Level 0: Tier 1 inline presentation hints
  if item.presentation exists:
    merge(resolved, item.presentation)

  // Level 1: Theme defaults
  if theme.defaults exists:
    merge(resolved, theme.defaults)
    unionAppend(cssClasses, theme.defaults.cssClass)

  // Level 2: Matching selectors (in document order)
  for each selector in theme.selectors:
    if matches(selector.match, item):
      merge(resolved, selector.apply)
      unionAppend(cssClasses, selector.apply.cssClass)

  // Level 3: Item key override
  if theme.items[item.key] exists:
    merge(resolved, theme.items[item.key])
    unionAppend(cssClasses, theme.items[item.key].cssClass)

  // cssClass uses union semantics (not shallow replace)
  if cssClasses is not empty:
    resolved.cssClass = deduplicate(cssClasses)

  return resolved
```

The `merge` operation is **shallow per-property** — each property in the
source replaces the same property in the target. Nested objects
(`widgetConfig`, `style`, `accessibility`) are replaced as a whole,
not deep-merged. This avoids the complexity of recursive merge
semantics.

**Exception — `cssClass` merge semantics:** The `cssClass` property
uses **union** semantics instead of replacement. When multiple cascade
levels specify `cssClass`, the resolved value is the union of all
class names across all matching levels (duplicates removed, order
preserved — defaults first, then selectors in document order, then
item overrides). This differs from all other PresentationBlock
properties because CSS classes are inherently additive — a selector
adding `usa-input` should not remove a default-level `formspec-field`.

Example:

```json
{
  "defaults": { "cssClass": "formspec-field" },
  "selectors": [
    { "match": { "dataType": "money" }, "apply": { "cssClass": ["usa-input", "usa-input--currency"] } }
  ],
  "items": {
    "totalBudget": { "cssClass": "budget-highlight" }
  }
}
```

For item `totalBudget` with `dataType: "money"`, the resolved
`cssClass` is `["formspec-field", "usa-input", "usa-input--currency", "budget-highlight"]`.

### 5.6 Interaction with Tier 1 Hints

Tier 1 inline hints (core §4.2.5) serve as **Level 0** in the cascade.
This means:

- A theme’s `defaults` (Level 1) override Tier 1 hints.
- A theme’s selectors (Level 2) override both defaults and Tier 1.
- A theme’s `items.{key}` (Level 3) overrides everything.

When **no theme** is applied, Tier 1 hints and `formPresentation` are
the only presentation input. This is the "null theme" baseline.

#### Property Suppression

To suppress an inherited value, use the sentinel string `"none"` for
properties that accept it (`widget`, `labelPosition`), or omit the
entire nested object (`style`, `widgetConfig`, `accessibility`):

```json
{
  "items": {
    "fieldWithNoWidget": { "widget": "none" }
  }
}
```

This removes the `widget` from the resolved PresentationBlock for
`fieldWithNoWidget`, regardless of what defaults, selectors, or Tier 1
hints specified. Omitting a property entirely leaves it unset,
inheriting from lower cascade levels.

> **Note:** JSON `null` values MUST NOT be used in PresentationBlock
> properties. Validators SHOULD reject `null` values.

#### Property Name Alignment

Theme PresentationBlock property names align with Tier 1 as follows:

| Theme property | Tier 1 equivalent | Notes |
|---|---|---|
| `widget` | `widgetHint` | Same vocabulary. Theme uses `widget` for brevity. |
| `widgetConfig` | (none) | Theme-only. |
| `labelPosition` | `formPresentation.labelPosition` | Same enum values. |
| `style` | `styleHints` | Theme `style` is richer (arbitrary key-value). |
| `accessibility` | `accessibility` | Same structure. |
| `fallback` | (none) | Theme-only. |

## 6. Page Layout System

### 6.1 Pages Array

The `pages` array defines an ordered list of pages. Each page groups
items into a logical section with a title, optional description, and a
list of regions.

```json
{
  "pages": [
    {
      "id": "info",
      "title": "Project Information",
      "description": "Enter basic project details.",
      "regions": [
        { "key": "projectName", "span": 8 },
        { "key": "projectCode", "span": 4 }
      ]
    }
  ]
}
```

| Property | Type | Cardinality | Description |
|---|---|---|---|
| `id` | string | **1..1** (REQUIRED) | Unique page identifier. MUST match `^[a-zA-Z][a-zA-Z0-9_\-]*$`. |
| `title` | string | **1..1** (REQUIRED) | Page title for navigation. |
| `description` | string | **0..1** (OPTIONAL) | Page description or instructions. |
| `regions` | array | **0..1** (OPTIONAL) | Ordered list of regions. See §6.2. |

When `pages` is absent, the renderer SHOULD walk the Definition’s item
tree top-to-bottom, applying the cascade (§5) to each item without
page-level grouping.

### 6.2 12-Column Grid Model

Regions within a page are laid out on a 12-column grid. Each region
assigns an item to a grid position.

| Property | Type | Cardinality | Description |
|---|---|---|---|
| `key` | string | **1..1** (REQUIRED) | Item key from the Definition. A group key includes its entire subtree. |
| `span` | integer (1–12) | **0..1** (OPTIONAL) | Grid columns this region occupies. Default: `12` (full width). |
| `start` | integer (1–12) | **0..1** (OPTIONAL) | Grid column start position. When absent, the region follows the previous region in flow. |
| `responsive` | object | **0..1** (OPTIONAL) | Breakpoint-keyed overrides. See §6.4. |

Example — two-column layout:

```json
{
  "regions": [
    { "key": "firstName", "span": 6 },
    { "key": "lastName", "span": 6 },
    { "key": "email", "span": 12 }
  ]
}
```

### 6.3 Regions and Item Keys

A region’s `key` references an item from the target Definition by its
`key` property. Special rules:

- **Group key:** When a region references a group item’s key, the
  entire group subtree (including all children and nested groups) is
  rendered within that region. Layout *within* the group is controlled
  by the group’s own Tier 1 `presentation.layout` properties (e.g.,
  `flow`, `columns`), not by the theme’s page grid.

- **Repeatable group key:** A repeatable group in a region renders all
  repeat instances within the region. The theme grid controls the
  region’s position on the page; repeat layout is internal to the
  group.

- **Nested item key:** A region MAY reference any item key in the
  Definition, including nested items within groups. When a nested
  item is referenced directly, it is rendered standalone at the grid
  position, independent of its parent group's layout. When a group
  key is referenced, the entire subtree renders within the region.

- **Unknown key:** A region referencing a key that does not exist in
  the target Definition SHOULD produce a warning. Processors MUST NOT
  fail.

- **Unassigned items:** Items not referenced by any region on any page
  SHOULD be rendered after all pages, using the default top-to-bottom
  order. Alternatively, a renderer MAY hide unassigned items if the
  theme’s pages are treated as exhaustive.

### 6.4 Responsive Breakpoints

The top-level `breakpoints` object defines named breakpoints as
min-width pixel values:

```json
{
  "breakpoints": {
    "sm": 576,
    "md": 768,
    "lg": 1024
  }
}
```

Breakpoint names are free strings. Values MUST be non-negative
integers representing pixels.

Regions may include a `responsive` object keyed by breakpoint name.
Each breakpoint override may set:

| Property | Type | Description |
|---|---|---|
| `span` | integer (1–12) | Override column span at this breakpoint. |
| `start` | integer (1–12) | Override column start at this breakpoint. |
| `hidden` | boolean | Hide this region at this breakpoint. |

Example:

```json
{
  "key": "sidebar",
  "span": 3,
  "responsive": {
    "sm": { "hidden": true },
    "md": { "span": 4 },
    "lg": { "span": 3 }
  }
}
```

Processors that do not support responsive layouts SHOULD use the base
`span` and `start` values.

### 6.5 Default Layout (No Pages)

When the `pages` array is absent or empty, the renderer walks the
Definition’s item tree top-to-bottom. The cascade (§5) is still
applied to determine widgets, styles, and accessibility for each item.
The Tier 1 `formPresentation.pageMode` property (core §4.1.1) guides
how top-level groups are paginated in the absence of theme pages.

## 7. Processing Model

### 7.1 Theme Loading and Validation

A processor loading a Theme Document MUST:

1. Parse the document as JSON.
2. Validate it against the Formspec Theme JSON Schema
   (`theme.schema.json`).
3. Verify that `$formspecTheme` is a supported version.
4. Reject the theme if any REQUIRED property is missing.

### 7.2 Target Definition Compatibility Check

After loading, the processor SHOULD verify that the theme’s
`targetDefinition.url` matches the Definition being rendered. If
`compatibleVersions` is present, the processor SHOULD verify that the
Definition’s `version` satisfies the semver range.

If the compatibility check fails, the processor MUST NOT fail. It
SHOULD warn and MAY fall back to Tier 1 hints only (null theme).

### 7.3 Full Resolution Algorithm

The complete theme resolution proceeds in this order:

1. **Load theme** — parse and validate.
2. **Check compatibility** — verify target Definition match.
3. **Resolve tokens** — collect all `$token.` references in `style`
   and `widgetConfig` values. Substitute each with the corresponding
   token value. Unresolved tokens use platform defaults.
4. **For each item** in the Definition:
   a. Apply the cascade (§5.5) to compute the resolved
      PresentationBlock.
   b. Resolve any `$token.` references in the resolved block.
   c. Validate widget compatibility with the item’s `dataType`. If
      incompatible, apply the `fallback` chain (§4.3).
5. **Compute layout** — if `pages` is present, assign items to pages
   and regions. Apply responsive overrides based on the current
   viewport.
6. **Emit resolved presentation** — the final per-item presentation
   data for the renderer.

### 7.4 Error Handling

| Condition | Behavior |
|-----------|----------|
| Unknown item key in `items` | SHOULD warn, MUST NOT fail. |
| Unknown item key in a region | SHOULD warn, MUST NOT fail. |
| Incompatible widget for dataType | MUST apply `fallback` chain; if no fallback, use default widget. |
| Unresolved `$token.` reference | MUST use platform default, SHOULD warn. |
| Recursive token reference | MUST treat as unresolved. |
| `compatibleVersions` not satisfied | SHOULD warn, MAY fall back to null theme. |
| Unrecognized `$formspecTheme` version | MUST reject the theme. |
| Unrecognized `x-` prefixed widget | MUST apply `fallback` chain. |
| Unrecognized `widgetConfig` key | MUST ignore. |

### 7.5 Null Theme (Default Rendering)

When no Theme Document is applied, the renderer uses:

1. Tier 1 `formPresentation` globals (core §4.1.1).
2. Tier 1 inline `presentation` hints on each item (core §4.2.5).
3. Renderer platform defaults.

This is the "null theme" baseline. A conforming renderer MUST produce
a usable form from Tier 1 hints alone, without requiring a Theme
Document.

## 8. Extensibility

### 8.1 Custom Widgets via x- Prefix

Theme authors MAY use `x-` prefixed widget names for custom widgets:

```json
{
  "items": {
    "location": {
      "widget": "x-map-picker",
      "widgetConfig": { "defaultZoom": 12 },
      "fallback": ["textInput"]
    }
  }
}
```

Renderers that support the custom widget render it; others fall back.
Custom widgets MUST always have a `fallback` chain ending with a
standard widget.

### 8.2 Custom Token Groups

Token keys prefixed with `x-` are reserved for custom tokens:

```json
{
  "tokens": {
    "x-brand.logo-height": "48px",
    "x-agency.seal-color": "#003366"
  }
}
```

### 8.3 Platform-Specific Extensions

The `extensions` object at the theme root accepts `x-` prefixed keys
for platform-specific metadata:

```json
{
  "extensions": {
    "x-analytics": { "trackFields": true, "provider": "formspec-analytics" },
    "x-pdf": { "paperSize": "A4", "orientation": "portrait" }
  }
}
```

Processors MUST ignore unrecognized extensions.

## 9. Security and Accessibility Considerations

This section is **informative**.

### 9.1 Theme URL Resolution Security

Theme Documents MAY reference external resources (e.g., token values
containing URLs, `extends` in future versions). Processors SHOULD:

- Validate all URIs before resolution.
- Restrict URI schemes to `https:` in production.
- Apply Content Security Policy (CSP) rules when rendering on the web.
- Time-out and fail gracefully for unreachable URIs.

### 9.2 Accessibility Guidance

Theme authors SHOULD ensure that their themes do not reduce
accessibility. In particular:

- Color tokens SHOULD provide sufficient contrast ratios per
  [WCAG 2.2](https://www.w3.org/TR/WCAG22/) Level AA (4.5:1 for
  normal text, 3:1 for large text).
- Font size tokens SHOULD not fall below platform-recommended minimums
  (typically 16px for body text on the web).
- `labelPosition: "hidden"` MUST still render labels in accessible
  markup (screen readers); the label is only visually hidden.
- `liveRegion` values SHOULD be used sparingly — `"assertive"` can
  disrupt screen reader users.

This specification does NOT normatively require WCAG conformance.
Renderers are responsible for ensuring accessibility of their output.

### 9.3 RTL / Bidirectional Layout

The `labelPosition` value `"start"` means "leading side" — left in
LTR locales, right in RTL locales. Renderers MUST respect the
document’s text direction when interpreting `"start"`.

The 12-column grid (§6.2) uses logical column positions. Renderers
SHOULD mirror column start positions in RTL layouts.

## Appendix A: Complete Theme Document Example

This appendix is **informative**.

```json
{
  "$formspecTheme": "1.0",
  "url": "https://agency.gov/forms/budget-2025/themes/web",
  "version": "1.0.0",
  "name": "Budget-Form-Web",
  "title": "Budget Form — Web Theme",
  "targetDefinition": {
    "url": "https://agency.gov/forms/budget-2025",
    "compatibleVersions": ">=1.0.0 <2.0.0"
  },
  "platform": "web",
  "breakpoints": {
    "sm": 576,
    "md": 768,
    "lg": 1024
  },
  "tokens": {
    "color.primary": "#0057B7",
    "color.error": "#D32F2F",
    "color.surface": "#FFFFFF",
    "spacing.sm": "8px",
    "spacing.md": "16px",
    "spacing.lg": "24px",
    "border.radius": "6px",
    "typography.body.family": "Inter, system-ui, sans-serif",
    "typography.body.size": "1rem"
  },
  "defaults": {
    "labelPosition": "top",
    "style": {
      "borderRadius": "$token.border.radius",
      "fontFamily": "$token.typography.body.family"
    }
  },
  "selectors": [
    {
      "match": { "dataType": "money" },
      "apply": {
        "widget": "moneyInput",
        "widgetConfig": { "showCurrencySymbol": true, "locale": "en-US" }
      }
    },
    {
      "match": { "dataType": "choice" },
      "apply": {
        "widget": "dropdown",
        "widgetConfig": { "searchable": false }
      }
    },
    {
      "match": { "dataType": "boolean" },
      "apply": {
        "widget": "toggle",
        "widgetConfig": { "onLabel": "Yes", "offLabel": "No" }
      }
    },
    {
      "match": { "type": "display" },
      "apply": { "widget": "paragraph" }
    }
  ],
  "items": {
    "totalBudget": {
      "widget": "moneyInput",
      "widgetConfig": { "showCurrencySymbol": true, "locale": "en-US" },
      "style": {
        "background": "#F0F6FF",
        "borderColor": "$token.color.primary",
        "borderWidth": "2px"
      },
      "accessibility": {
        "liveRegion": "polite",
        "description": "Calculated total of all budget line items"
      }
    },
    "approverSignature": {
      "widget": "signature",
      "widgetConfig": { "strokeColor": "#000", "height": 150 },
      "fallback": ["camera", "fileUpload"]
    },
    "priorityLevel": {
      "widget": "slider",
      "widgetConfig": { "min": 1, "max": 5, "step": 1, "showTicks": true },
      "fallback": ["dropdown"]
    }
  },
  "pages": [
    {
      "id": "info",
      "title": "Project Information",
      "regions": [
        { "key": "projectName", "span": 8 },
        { "key": "projectCode", "span": 4 },
        { "key": "department", "span": 6 },
        { "key": "fiscalYear", "span": 6 },
        { "key": "description", "span": 12 }
      ]
    },
    {
      "id": "budget",
      "title": "Budget Details",
      "regions": [
        { "key": "lineItems", "span": 12 },
        { "key": "totalBudget", "span": 6, "responsive": { "sm": { "span": 12 } } },
        { "key": "contingency", "span": 6, "responsive": { "sm": { "span": 12 } } }
      ]
    },
    {
      "id": "review",
      "title": "Review & Submit",
      "description": "Review your submission before signing.",
      "regions": [
        { "key": "certify", "span": 12 },
        { "key": "approverSignature", "span": 12 }
      ]
    }
  ]
}
```

## Appendix B: Widget–DataType Compatibility Table

This appendix is **normative**.

The following table lists all widgets and their compatible data types.
Widgets marked **Required** MUST be supported by conforming renderers.
Widgets marked **Progressive** SHOULD be supported; the Default
Fallback column shows the required fallback.

| Widget | Level | Compatible dataTypes | Default Fallback |
|---|---|---|---|
| `textInput` | Required | string, uri | — |
| `textarea` | Required | text | — |
| `numberInput` | Required | integer, decimal | — |
| `checkbox` | Required | boolean | — |
| `datePicker` | Required | date, dateTime, time | — |
| `dropdown` | Required | choice | — |
| `checkboxGroup` | Required | multiChoice | — |
| `fileUpload` | Required | attachment | — |
| `moneyInput` | Required | money | — |
| `slider` | Progressive | integer, decimal | `numberInput` |
| `stepper` | Progressive | integer | `numberInput` |
| `rating` | Progressive | integer | `numberInput` |
| `toggle` | Progressive | boolean | `checkbox` |
| `yesNo` | Progressive | boolean | `checkbox` |
| `radio` | Progressive | choice | `dropdown` |
| `autocomplete` | Progressive | choice, multiChoice | `dropdown` / `checkboxGroup` |
| `segmented` | Progressive | choice | `radio` |
| `likert` | Progressive | choice | `radio` |
| `multiSelect` | Progressive | multiChoice | `checkboxGroup` |
| `richText` | Progressive | text | `textarea` |
| `password` | Progressive | string | `textInput` |
| `color` | Progressive | string | `textInput` |
| `urlInput` | Progressive | uri | `textInput` |
| `dateInput` | Progressive | date | `datePicker` |
| `dateTimePicker` | Progressive | dateTime | `datePicker` |
| `dateTimeInput` | Progressive | dateTime | `textInput` |
| `timePicker` | Progressive | time | `textInput` |
| `timeInput` | Progressive | time | `textInput` |
| `camera` | Progressive | attachment | `fileUpload` |
| `signature` | Progressive | attachment | `fileUpload` |
| `section` | — | group | — |
| `card` | — | group | `section` |
| `accordion` | — | group | `section` |
| `tab` | — | group | `section` |
| `heading` | — | display | — |
| `paragraph` | — | display | — |
| `divider` | — | display | — |
| `banner` | — | display | — |

## Appendix C: Token Quick Reference

This appendix is **informative**.

| Token key pattern | Example | Typical value |
|---|---|---|
| `color.*` | `color.primary` | `"#0057B7"` |
| `color.*` (error) | `color.error` | `"#D32F2F"` |
| `color.*` (warning) | `color.warning` | `"#ED6C02"` |
| `color.*` (success) | `color.success` | `"#2E7D32"` |
| `color.*` (info) | `color.info` | `"#0288D1"` |
| `color.*` (surface) | `color.surface` | `"#FFFFFF"` |
| `color.*` (background) | `color.background` | `"#F5F5F5"` |
| `color.*.light` | `color.primary.light` | `"#E0F0FF"` |
| `spacing.*` | `spacing.md` | `"16px"` |
| `spacing.*` (semantic) | `spacing.field` | `"0.75rem"` |
| `typography.*.family` | `typography.body.family` | `"Inter, sans-serif"` |
| `typography.*.size` | `typography.body.size` | `"1rem"` |
| `typography.*.weight` | `typography.heading.weight` | `"700"` |
| `border.radius` | `border.radius` | `"6px"` |
| `border.width` | `border.width` | `1` |
| `elevation.*` | `elevation.low` | `"0 1px 3px rgba(0,0,0,0.12)"` |
| `x-*` | `x-brand.logo-height` | `"48px"` |

Reference syntax: `$token.color.primary` → resolves to the value of
`tokens["color.primary"]`.

---
title: Formspec Token Registry Specification
version: 1.0.0-draft.1
date: 2026-05-04
depends_on:
  - specs/theme/theme-spec.md
---

# Formspec Token Registry Specification v1.0

## Status of This Document

This document is a **Draft** companion specification to the
[Formspec Theme Specification](theme-spec.md). It defines the Token
Registry format — a structured catalog of design tokens with metadata
for tooling, validation, and studio consumption.

## Conventions and Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this
document are to be interpreted as described in
[RFC 2119](https://www.ietf.org/rfc/rfc2119.txt).

## 1. Introduction

### 1.1 Purpose and Scope

The Theme Specification (§3.1) defines tokens as a flat key-value map
with no metadata beyond the key name and value. This is sufficient for
renderers — they iterate tokens and emit CSS custom properties — but
insufficient for tooling that needs to answer:

- What tokens does the platform ship?
- What type is each token (color, dimension, font)?
- What is the default value for each token?
- What is the dark-mode counterpart of a color token?
- What custom tokens has this theme introduced?

This specification defines a **Token Registry** — a JSON document that
catalogs tokens with structured metadata. The registry is a
development and tooling artifact. Renderers MUST NOT require the
registry at runtime; token emission continues to operate on the flat
`tokens` map from the Theme Document.

### 1.2 Relationship to Other Specifications

- **Theme Specification** — the registry describes tokens that the
  Theme Document's `tokens` map contains. The registry adds metadata;
  it does not replace or duplicate the token values.
- **Component Specification** — Component Documents also carry a
  `tokens` map. Component tokens MAY be described in the registry or
  in theme-level `tokenMeta`. Token metadata resolution is independent
  of value resolution: even when a Component Document overrides a
  platform token's value, the platform registry provides the metadata
  for that token key.
- **Core Specification** — not directly related. The registry is a
  Tier 2 (presentation) concern.

### 1.3 Registry Discovery

The mechanism for discovering the platform registry is
implementation-defined. Common patterns include bundling the registry
JSON with the renderer SDK, exporting it from a package, or
referencing it from a project configuration file.

## 2. Registry Format

### 2.1 Top-Level Structure

A Token Registry document is a JSON object with the following
top-level properties:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `$formspecTokenRegistry` | string | REQUIRED | Version identifier. MUST be `"1.0"` for this specification. |
| `description` | string | OPTIONAL | Human-readable description of this registry. |
| `categories` | object | REQUIRED | Token categories keyed by category prefix. |

Processors MUST reject token registry documents with an unrecognized
`$formspecTokenRegistry` version.

Example:

```json
{
  "$formspecTokenRegistry": "1.0",
  "description": "Formspec platform token catalog.",
  "categories": { ... }
}
```

### 2.2 Categories

Each key in `categories` is a category prefix (e.g., `color`,
`spacing`, `font`). The value is a **Category object**:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `description` | string | RECOMMENDED | Human-readable description of the category. |
| `type` | string | REQUIRED | Default token type for entries in this category. See §3. |
| `darkPrefix` | string | OPTIONAL | Prefix for dark-mode counterpart tokens. Only categories whose `type` is `color` SHOULD declare `darkPrefix`. |
| `tokens` | object | REQUIRED | Token entries keyed by their full dot-delimited key. MUST contain at least one entry. |

Example:

```json
"color": {
  "description": "Color palette tokens",
  "type": "color",
  "darkPrefix": "color.dark",
  "tokens": {
    "color.primary": { ... },
    "color.error": { ... }
  }
}
```

**Dark prefix derivation:** When a category declares a `darkPrefix`,
each token entry's `dark` field holds the default dark-mode value. The
corresponding runtime token key is derived by replacing the category
prefix with the dark prefix. Specifically, for a category with prefix
`P` and `darkPrefix` `D`, a token with key `P.<suffix>` produces a
dark key of `D.<suffix>`, where `<suffix>` is the token key with the
category prefix and its trailing dot removed.

For example, with `darkPrefix: "color.dark"`:
- `color.primary` → `color.dark.primary` (suffix: `primary`)
- `color.mutedForeground` → `color.dark.mutedForeground` (suffix: `mutedForeground`)

Dark keys are NOT separate entries in the registry — they are derived
from the `dark` field. However, dark tokens ARE separate keys in the
theme's flat `tokens` map per Theme Specification §3.6. The registry
describes the relationship; the theme document holds the actual values.

Consumers that emit tokens SHOULD emit both the light key and the
derived dark key as CSS custom properties.

> **Relationship to Theme Specification §3.2:** The Theme
> Specification defines RECOMMENDED category prefixes (`color.`,
> `spacing.`, `typography.`, `border.`, `elevation.`, `x-`). The
> platform registry uses the actual prefixes from the shipped theme
> (`color`, `spacing`, `radius`, `font`), which are a subset of the
> RECOMMENDED vocabulary. Registry categories are not required to use
> only the prefixes listed in the Theme Specification.

### 2.3 Token Entries

Each key in a category's `tokens` object is the full dot-delimited
token key (e.g., `color.primary`, `spacing.md`). The value is a
**Token Entry object**:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `description` | string | RECOMMENDED | Human-readable description of the token's purpose. |
| `type` | string | OPTIONAL | Token type, overriding the category default. See §3. |
| `default` | string or number | RECOMMENDED | Default value shipped with the platform theme. |
| `dark` | string or number | OPTIONAL | Default dark-mode value. See §2.2 for derivation. |
| `derivedFrom` | string | OPTIONAL | Another token key this token resolves through when a Theme leaves it unset. See §2.5. |
| `examples` | array of (string or number) | OPTIONAL | Example token values for documentation and tooling hints. |

Example:

```json
"color.primary": {
  "description": "Primary brand/accent color",
  "default": "#27594f",
  "dark": "#8bb8ac"
}
```

**Type inheritance:** If a token entry omits `type`, it inherits the
category's `type`. If a token entry specifies `type`, it overrides the
category default for that entry only.

**Dark field without darkPrefix:** If a token entry includes a `dark`
value but the containing category does not declare `darkPrefix`,
processors MUST ignore the `dark` field and SHOULD emit a warning.

**Token key uniqueness:** A token key MUST NOT appear in more than one
category within the same registry or `tokenMeta` document.

### 2.4 The Brand Token

`color.primary` is **the** platform brand token. It is the single key a
tenant sets to change the colour their form is rendered in, and it is
the key every shipped stylesheet reads (`--formspec-color-primary`).
There is no second brand key: `color.accent`, `color.brand` and
`color.highlight` are NOT declared by this registry, and processors MUST
NOT alias them onto `color.primary`.

A silent alias is worse than no alias. It makes two vocabularies both
appear to work, so an authoring tool that emits the wrong one is never
corrected and a renderer that drops it is never blamed. A theme that
names an undeclared non-`x-` token gets the §5.3 diagnostic instead.

Derived tokens fan out from `color.primary` in the shipped skin rather
than being separate brand inputs. `color.ring` (the focus ring) declares
`derivedFrom: "color.primary"` (§2.5), so setting the brand token alone
changes the focus ring, the section headings, and the primary button. A
theme that wants a focus ring different from its brand colour sets
`color.ring` explicitly.

### 2.5 Derived Tokens

A token entry MAY declare `derivedFrom`, naming another token key it
resolves through when a Theme leaves it unset.

A processor that builds the platform Theme's token map from this registry
MUST NOT emit a derived token into that map. Emitting it would give every
Theme an explicit value for the token, and the derivation could never
fire — a tenant who sets only `color.primary` would keep the platform
focus ring, which is precisely the failure this field exists to prevent.
The derived entry's `default` stays the value of last resort, expressed
by the renderer as the innermost fallback of its resolution chain:

```css
--formspec-default-focus: var(--formspec-color-ring, var(--formspec-color-primary, #27594f));
```

`derivedFrom` MUST name a key declared by the same registry, and
derivation chains MUST NOT be cyclic. A derived token is still a declared
token: a Theme MAY set it, validators MUST NOT report it under §5.3, and
Studio SHOULD present it with its derivation shown rather than as a
free-standing default.

## 3. Token Types

Token types describe the semantic nature of a token value. Tooling
uses types to select appropriate editors and validate values.

### 3.1 Type Vocabulary

| Type | Description | Example values |
|------|-------------|----------------|
| `color` | CSS color value | `#27594f`, `rgb(39,89,79)`, `hsl(166,38%,25%)` |
| `dimension` | CSS length value with unit | `1rem`, `8px`, `0.75em`, `100%` |
| `fontFamily` | CSS font-family value | `"Instrument Sans", sans-serif` |
| `fontWeight` | CSS font-weight value (numeric or keyword) | `400`, `650`, `bold` |
| `duration` | CSS time value | `0.15s`, `200ms` |
| `opacity` | Number between 0 and 1 | `0.85`, `1` |
| `shadow` | CSS box-shadow value | `0 10px 22px rgba(0,0,0,0.05)` |
| `number` | Bare number without unit | `999`, `1.6` |

Token types do not affect CSS custom property emission — the flat
token value is emitted as-is regardless of type. Types are consumed
only by tooling (editors, validators).

### 3.2 Type Validation

Validators SHOULD check that token values conform to their declared
type. For example, a token of type `color` SHOULD contain a valid CSS
color value, and a token of type `dimension` SHOULD contain a numeric
value followed by a CSS unit.

Type validation is RECOMMENDED, not required. Validators MUST NOT
reject a theme document solely because a token value does not conform
to the registry's declared type — the registry is advisory.

## 4. Theme-Level Extension

### 4.1 The `tokenMeta` Property

Theme Documents MAY include a `tokenMeta` property alongside `tokens`
to describe custom tokens introduced by the theme. The `tokenMeta`
object contains a single property `categories` which follows the same
Category schema defined in §2.2 — NOT the full registry document
schema (there is no `$formspecTokenRegistry` version in `tokenMeta`).

> **Schema note:** Adding `tokenMeta` to Theme Documents requires
> updating `schemas/theme.schema.json` to include the property. Until
> the schema is updated, theme documents with `tokenMeta` will not
> pass schema validation.

```json
{
  "$formspecTheme": "1.0",
  "tokens": {
    "color.primary": "#0057B7",
    "x-agency.seal-color": "#002868",
    "x-agency.header-height": "4rem"
  },
  "tokenMeta": {
    "categories": {
      "x-agency": {
        "description": "Agency branding tokens",
        "type": "color",
        "tokens": {
          "x-agency.seal-color": {
            "description": "Official agency seal color",
            "type": "color"
          },
          "x-agency.header-height": {
            "description": "Fixed header height",
            "type": "dimension"
          }
        }
      }
    }
  }
}
```

Custom categories MAY declare `darkPrefix` to support dark-mode
variants for custom tokens:

```json
"tokenMeta": {
  "categories": {
    "x-agency": {
      "description": "Agency branding tokens",
      "type": "color",
      "darkPrefix": "x-agency.dark",
      "tokens": {
        "x-agency.seal-color": {
          "description": "Official agency seal color",
          "default": "#002868",
          "dark": "#6699CC"
        }
      }
    }
  }
}
```

### 4.2 Extension Rules

- Custom tokens SHOULD use the `x-` prefix per Theme Specification
  §3.5.
- `tokenMeta` categories MUST NOT redefine platform registry tokens.
  If a theme overrides `color.primary`, the metadata comes from the
  platform registry — the theme only provides the value.
- `tokenMeta` categories MAY use any prefix, but non-`x-` prefixed
  custom tokens risk collision with future platform tokens.

### 4.3 Resolution Order

When tooling resolves token metadata, it SHOULD merge sources in this
order (later sources do not override earlier for the same token key):

1. **Platform registry** — always loaded, provides metadata for all
   platform tokens.
2. **Theme `tokenMeta`** — provides metadata for custom tokens
   introduced by the theme.
3. **Unregistered tokens** — any token in the `tokens` map without
   metadata from either source is presented as a raw key-value entry
   with no type information.

The merge order ensures graceful behavior even if a theme violates the
MUST NOT in §4.2 — the platform registry's metadata takes precedence.

## 5. Consumption Model

### 5.1 Studio

Studio implementations SHOULD:

- Load the platform registry on startup.
- Merge theme `tokenMeta` when a theme is opened.
- Present tokens grouped by category.
- Use type-appropriate editors (color picker for `color`, slider for
  `dimension`, font selector for `fontFamily`, etc.).
- Show default values and offer reset-to-default for platform tokens.
- Show dark-mode values alongside light-mode values for color tokens.
- Display unregistered tokens in an "Other" group with raw text
  editors.

### 5.2 Renderers

Renderers MUST NOT depend on the token registry at runtime. Token
emission operates on the flat `tokens` map from the Theme Document
and Component Document. The registry exists for tooling only.

### 5.3 Validators

A validator that loads a Theme Document MUST emit a diagnostic for every
token key that sits under a **category prefix the registry declares** and
is not itself declared by the registry. Such a key names nothing: no
stylesheet reads it, no `tokenMeta` describes it, and emitting it
produces a CSS custom property with no consumer. Silence here is the
failure mode — the token travels the whole chain (authoring, validation,
signing, emission, cascade) and changes nothing on screen, with no reader
ever told why. `color.accent` is the worked example: the registry owns
`color.*` and declares no `accent`.

The check is scoped to owned prefixes deliberately. Theme Specification
§3.2 blesses `typography.`, `border.` and `elevation.` as valid Theme
token vocabulary that this registry does not carry, and `x-` is the
extension namespace. Reporting those would turn spec-sanctioned keys into
warnings and train readers to ignore the diagnostic — which is the
failure mode this check exists to prevent.

Validators MAY additionally use the platform registry to:

- Warn on token values that do not match their declared type.
- Report tokens present in the registry but missing from the theme
  (potential incomplete themes).

Validators MUST NOT reject a theme document based on registry
validation. Registry-based checks are advisory diagnostics only: the
required diagnostic above is a warning, not an error, because a theme
carrying an unregistered token is still a renderable theme.

Conforming implementations of the required diagnostic:
`formspec-lint` W708 (`pass_theme`) and `@formspec-org/app-graph`
`THEME-TOKEN-UNREGISTERED` (`validateThemeTokenRegistry`).

## 6. Conformance

### 6.1 Registry Documents

A conformant Token Registry document MUST:

- Include `$formspecTokenRegistry` with value `"1.0"`.
- Include a `categories` object with at least one category.
- Each category MUST include `type` and `tokens`.
- Each category's `tokens` object MUST contain at least one entry.
- Each token entry key MUST start with its category key followed by a
  dot (e.g., for category `color`, token keys must match `color.*`).
- A token key MUST NOT appear in more than one category.

### 6.2 Theme Documents

Theme Documents that include `tokenMeta` MUST:

- Structure `tokenMeta.categories` according to the Category schema
  defined in §2.2.
- Not redefine metadata for tokens already present in the platform
  registry. Validators SHOULD warn on violations but MUST NOT reject
  the document.

Theme Documents without `tokenMeta` are fully conformant — the
property is OPTIONAL.

### 6.3 Registry Consumers

A conformant registry consumer (studio, validator, or other tooling)
MUST:

- Parse the registry format defined in §2.
- Respect type inheritance as defined in §2.3.
- Follow the resolution order defined in §4.3 when merging platform
  registry and theme `tokenMeta`.

## Appendix A. Complete Platform Registry Example

```json
{
  "$formspecTokenRegistry": "1.0",
  "description": "Formspec platform token catalog — tokens consumed by the default CSS skin.",
  "categories": {
    "color": {
      "description": "Color palette tokens for light and dark modes",
      "type": "color",
      "darkPrefix": "color.dark",
      "tokens": {
        "color.primary": {
          "description": "Primary brand/accent color",
          "default": "#27594f",
          "dark": "#8bb8ac"
        },
        "color.primaryForeground": {
          "description": "Text color on primary backgrounds",
          "default": "#ffffff",
          "dark": "#ffffff"
        },
        "color.foreground": {
          "description": "Default text color",
          "default": "#20241f",
          "dark": "#f3ecdf"
        },
        "color.background": {
          "description": "Page/form background color",
          "default": "#f6f0e6",
          "dark": "#161311"
        },
        "color.border": {
          "description": "Default border color",
          "default": "#d1c8ba",
          "dark": "#4f463d"
        },
        "color.card": {
          "description": "Card/panel surface color",
          "default": "#fdfaf4",
          "dark": "#211c19"
        },
        "color.muted": {
          "description": "Muted text color",
          "default": "#686158",
          "dark": "#c4b8a7"
        },
        "color.mutedForeground": {
          "description": "Subtle text color",
          "default": "#736c62",
          "dark": "#ad9f8d"
        },
        "color.error": {
          "description": "Error/danger indicator color",
          "default": "#c1281f",
          "dark": "#ff8b7f"
        },
        "color.warning": {
          "description": "Warning/caution indicator color",
          "default": "#946112",
          "dark": "#e2b35c"
        },
        "color.success": {
          "description": "Success/confirmation indicator color",
          "default": "#2f855a",
          "dark": "#79c89d"
        },
        "color.info": {
          "description": "Informational indicator color",
          "default": "#2b6cb0",
          "dark": "#82b8f8"
        },
        "color.ring": {
          "description": "Focus ring color",
          "default": "#27594f",
          "dark": "#8fc6b7"
        },
        "color.input": {
          "description": "Input border color",
          "default": "#c0b6a8",
          "dark": "#5c5247"
        },
        "color.surface": {
          "description": "Muted surface/panel background",
          "default": "#f2ece2",
          "dark": "#2a241f"
        }
      }
    },
    "spacing": {
      "description": "Layout spacing scale",
      "type": "dimension",
      "tokens": {
        "spacing.xs": {
          "description": "Extra-small spacing",
          "default": "0.25rem"
        },
        "spacing.sm": {
          "description": "Small spacing",
          "default": "0.5rem"
        },
        "spacing.md": {
          "description": "Medium spacing, used for container and grid gaps",
          "default": "1rem"
        },
        "spacing.lg": {
          "description": "Large spacing",
          "default": "1.5rem"
        },
        "spacing.xl": {
          "description": "Extra-large spacing",
          "default": "2rem"
        },
        "spacing.field": {
          "description": "Vertical gap between form fields",
          "default": "0.75rem"
        }
      }
    },
    "radius": {
      "description": "Border radius scale",
      "type": "dimension",
      "tokens": {
        "radius.sm": {
          "description": "Small border radius for inputs and controls",
          "default": "0.9rem"
        },
        "radius.md": {
          "description": "Medium border radius for cards and panels",
          "default": "1.35rem"
        }
      }
    },
    "font": {
      "description": "Typography tokens",
      "type": "fontFamily",
      "tokens": {
        "font.family": {
          "description": "Base font family stack",
          "default": "\"Instrument Sans\", \"Avenir Next\", \"Segoe UI\", sans-serif"
        }
      }
    }
  }
}
```

---
title: Formspec Locale Specification
version: 1.0.0-draft.1
date: 2026-04-09
status: draft
---

# Formspec Locale Specification v1.0

**Version:** 1.0.0-draft.1
**Date:** 2026-03-20
**Editors:** Formspec Working Group
**Companion to:** Formspec v1.0 — A JSON-Native Declarative Form Standard

---

## Status of This Document

This document is a **Draft** companion specification to the
[Formspec v1.0 Core Specification](../core/spec.md). It defines the Formspec
Locale Document format — a sidecar JSON document that provides
internationalized strings for a Formspec Definition.

## Conventions and Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
[BCP 14][rfc2119] [RFC 2119] [RFC 8174] when, and only when, they
appear in ALL CAPITALS, as shown here.

JSON syntax and data types are as defined in [RFC 8259]. URI syntax is
as defined in [RFC 3986].

Terms defined in the Formspec v1.0 core specification — including
*Definition*, *Item*, *Response*, *Bind*, *FEL*, and *conformant
processor* — retain their core-specification meanings throughout this
document unless explicitly redefined.

[rfc2119]: https://www.rfc-editor.org/rfc/rfc2119

---

## Bottom Line Up Front

<!-- bluf:start file=locale-spec.bluf.md -->
- This document defines the Locale Document — a sidecar JSON artifact for internationalizing Formspec Definitions.
- A valid locale requires `$formspecLocale`, `version`, `locale`, `targetDefinition`, and a `strings` object.
- String resolution uses a fallback cascade (regional → base → inline defaults) with FEL interpolation via `{{expression}}` syntax; `null` without `$`/`@` and without a static-literal expression preserves the `{{…}}` text (§3.3.1 rule 3a).
- This BLUF is governed by `schemas/locale.schema.json`; generated schema references are the canonical structural contract.
<!-- bluf:end -->

## 1. Introduction

### 1.1 Purpose

Formspec v1.0 defines form structure, behavior, and validation in a
single Definition document. Every Item has a `label`, optional
`description` and `hint` properties, and choice options with display
text. These inline strings serve as the default presentation language.

Real-world forms must be presented in multiple languages. A federal
grant application may need English, Spanish, and French versions. A
multinational survey may require dozens of locales with regional
variants. Without a standard localization mechanism, implementors must
either embed all translations inside the Definition (bloating it and
coupling translation to structural authoring) or build bespoke
translation infrastructure outside the spec.

This specification defines a **Locale Document** — a standalone JSON
artifact that provides localized strings for a Formspec Definition.
A Locale Document:

- References a Definition by URL and declares compatible versions.
- Maps item paths to localized strings via a flat key-value structure.
- Supports FEL interpolation for dynamic string content.
- Composes via a fallback cascade (regional → base → inline).
- Supports contextual variants (short, accessibility, pdf).

Authors who do not need internationalization change nothing. The
Definition's inline strings serve as the default locale.

### 1.2 Scope

This specification defines:

- The JSON structure for **Locale Documents** — standalone JSON
  documents that provide localized strings for a Formspec Definition.
- The **string key format** for addressing localizable properties of
  Items, choice options, and validation messages.
- The **FEL interpolation** syntax for embedding dynamic values in
  localized strings.
- The **fallback cascade** governing how string resolution walks the
  locale chain from regional to base to inline defaults.
- The **`locale()` FEL function** that exposes the active locale code
  to FEL expressions in the Definition.
- The use of **`pluralCategory()`** (Core §3.5) for expressing
  pluralization patterns using CLDR plural categories.

This specification does NOT define:

- Locale negotiation or `Accept-Language` parsing — this is a host
  application concern.
- Right-to-left layout or text direction — this is a Theme concern.
  Use a locale-specific Theme Document.
- Translation memory, machine translation, or translator tooling —
  these are external tooling concerns.
- Built-in plural tables, gender agreement tables, or number/date
  formatting patterns from CLDR — FEL expressions authored by the
  translator handle these cases.
- Locale Documents address all human-readable strings across all tiers.
  Theme-tier page layout strings (`PageLayout.title`,
  `PageLayout.description`) are addressable via the `$page.<pageId>` key
  prefix (§3.1.7). Component-tier text props (`Heading.text`,
  `Alert.text`, `Card.title`, etc.) are addressable via the
  `$component.<nodeId>.<prop>` key prefix (§3.1.8), where `<nodeId>` is
  the optional `id` property on the component node. OptionSet option
  labels shared across fields are addressable via the
  `$optionSet.<setName>` key prefix (§3.1.3). Locale Documents MUST NOT
  alter non-string properties (layout, styling, widget configuration,
  behavioral expressions) — those remain Theme/Component concerns.

### 1.3 Relationship to Other Specifications

The Formspec architecture defines concerns as composable sidecar
artifacts:

| Concern | Inline (Tier 1) | Sidecar artifact |
|---------|-----------------|------------------|
| Structure & behavior | Items, Binds, Shapes | Core Definition |
| Presentation | `presentation` hints | Theme Document |
| Interaction | `widgetHint` | Component Document |
| Data transform | `fieldMap` | Mapping Document |
| **Localization** | Inline string properties | **Locale Document** (this spec) |

The Locale Document follows the same sidecar pattern: the Definition
provides sensible defaults inline; the Locale Document overrides them
for a specific language. Multiple Locale Documents MAY target the same
Definition.

### 1.4 Terminology

| Term | Definition |
|------|------------|
| **Definition** | A Formspec Definition document (core spec §4). |
| **Locale Document** | A JSON document conforming to this specification. |
| **Locale code** | A BCP 47 language tag (e.g., `en`, `fr-CA`, `zh-Hans`). |
| **String key** | A dot-delimited path identifying a localizable string (§3.1). |
| **Cascade** | The fallback chain that determines the resolved string for a given key (§4). |
| **Interpolation** | Embedding FEL expressions in string values via `{{expression}}` syntax (§3.3). |

### 1.5 Notational Conventions

JSON examples use `//` comments for annotation; comments are not valid
JSON. Property names in monospace (`locale`) refer to JSON keys.
Section references (§N) refer to this document unless prefixed with
"core" (e.g., "core §4.2.5").

## 2. Locale Document Structure

A Formspec Locale Document is a JSON object. Conforming implementations
MUST recognize the following top-level properties and MUST reject any
Locale Document that omits a REQUIRED property.

```json
{
  "$formspecLocale": "1.0",
  "url": "https://agency.gov/forms/budget/locales/fr-CA",
  "version": "1.0.0",
  "name": "budget-fr-CA",
  "title": "Budget Form — Canadian French",
  "description": "French-Canadian localization for the annual budget form.",
  "locale": "fr-CA",
  "fallback": "fr",
  "targetDefinition": {
    "url": "https://agency.gov/forms/budget",
    "compatibleVersions": ">=1.0.0 <2.0.0"
  },
  "strings": {
    "projectName.label": "Nom du projet",
    "projectName.hint": "Entrez le nom officiel du projet",
    "budget.label": "Budget",
    "budget.description": "Section des informations budgétaires"
  }
}
```

### 2.1 Top-Level Properties

<!-- schema-ref:start id=locale-top-level schema=schemas/locale.schema.json pointers=# -->
<!-- generated:schema-ref id=locale-top-level -->
| Pointer | Field | Type | Required | Notes | Description |
|---|---|---|---|---|---|
| `#/properties/$formspecLocale` | `$formspecLocale` | <code>string</code> | yes | const: <code>"1.0"</code>; critical | Locale specification version. MUST be '1.0'. |
| `#/properties/description` | `description` | <code>string</code> | no | — | Human-readable description of the locale's purpose and target audience. |
| `#/properties/extensions` | `extensions` | <code>object</code> | no | — | Extension namespace for vendor-specific or tooling-specific metadata. All keys MUST be x- prefixed. Processors MUST ignore unrecognized extensions. Extensions MUST NOT alter locale resolution semantics. |
| `#/properties/fallback` | `fallback` | <code>string</code> | no | pattern: <code>^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*&#36;</code> | BCP 47 language tag of the locale to consult when a key is not found in this document's strings. Enables explicit fallback chains (e.g., fr-CA → fr). If absent, the cascade proceeds to implicit language fallback (strip region subtag) or inline defaults. Processors MUST detect circular fallback chains and terminate the cascade with a warning. |
| `#/properties/locale` | `locale` | <code>string</code> | yes | pattern: <code>^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*&#36;</code>; critical | BCP 47 language tag identifying the locale this document provides strings for. Processors MUST perform case-insensitive comparison and SHOULD normalize to lowercase language with title-case region (e.g., 'fr-CA'). |
| `#/properties/name` | `name` | <code>string</code> | no | — | Machine-friendly short identifier for programmatic use. |
| `#/properties/strings` | `strings` | <code>object</code> | yes | critical | Map of string keys to localized values. Keys follow the dot-delimited path format defined in the Locale Specification §3.1. Values are strings, optionally containing FEL interpolation via {{expression}} syntax. Keys address item properties (key.label, key.description, key.hint), context labels (key.label@context, key.hint@context), choice options (key.options.value.label), shared option sets ($optionSet.setName.value.label), validation messages (key.errors.CODE, key.constraintMessage, key.requiredMessage), form-level strings ($form.title, $form.description), shape messages ($shape.id.message), theme page strings ($page.pageId.title, $page.pageId.description), and component node strings ($component.nodeId.property). |
| `#/properties/targetDefinition` | `targetDefinition` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>https://formspec.org/schemas/component/1.1#/&#36;defs/TargetDefinition</code>; critical | Binding to the target Formspec Definition and compatible version range. The locale will only be applied to Definitions matching this target. If compatibleVersions is present and the Definition version falls outside the range, the processor SHOULD warn and MAY fall back to inline strings only. The processor MUST NOT fail on a version mismatch. |
| `#/properties/title` | `title` | <code>string</code> | no | — | Human-readable display name for the Locale Document. |
| `#/properties/url` | `url` | <code>string</code> | no | — | Canonical identifier for this Locale Document. Stable across versions — the tuple (url, version) SHOULD be globally unique. |
| `#/properties/version` | `version` | <code>string</code> | yes | critical | Version of this Locale Document. SemVer is RECOMMENDED. The tuple (url, version) SHOULD be unique across all published locale versions. |
<!-- schema-ref:end -->

### 2.2 Target Definition Binding

The `targetDefinition` object binds this Locale Document to a specific
Definition.

| Property | Type | Cardinality | Description |
|---|---|---|---|
| `url` | string (URI) | **1..1** (REQUIRED) | Canonical URL of the target Definition (`url` property from the Definition). |
| `compatibleVersions` | string | **0..1** (OPTIONAL) | Semver range expression (e.g., `">=1.0.0 <2.0.0"`) describing which Definition versions this locale supports. When absent, the locale is assumed compatible with any version. |

When `compatibleVersions` is present, a processor SHOULD verify that
the Definition's `version` satisfies the range before applying the
Locale Document. A processor MUST NOT fail if the range is unsatisfied;
it SHOULD warn and MAY fall back to inline strings.

### 2.3 Locale Code

The `locale` property MUST be a syntactically valid BCP 47 language
tag. Processors SHOULD validate subtags against the IANA Language
Subtag Registry when available, but MUST NOT fail on unrecognized
subtags.

Well-known examples:

| Code | Language |
|------|----------|
| `en` | English |
| `en-US` | American English |
| `fr` | French |
| `fr-CA` | Canadian French |
| `es` | Spanish |
| `zh-Hans` | Simplified Chinese |
| `ar` | Arabic |

Processors MUST perform case-insensitive comparison of locale codes
(BCP 47 tags are case-insensitive). Processors SHOULD normalize
locale codes to lowercase language with title-case region
(e.g., `fr-CA`, not `FR-CA` or `fr-ca`).

## 3. String Keys and Values

### 3.1 String Key Format

String keys use dot-delimited paths that address localizable properties
of Items in the target Definition. The general format is:

```
<itemKey>.<property>
```

Where `<itemKey>` is the `key` of an Item in the Definition, and
`<property>` identifies which string property to localize.

When a Definition uses modular composition via `$ref` with `keyPrefix`
(core spec §6.6), string keys MUST use the **post-assembly** key
(i.e., after the prefix has been prepended). For example, if a
Definition imports items with `keyPrefix: "section1_"`, an imported
item with key `name` becomes `section1_name`, and the Locale Document
must use `section1_name.label`.

#### 3.1.1 Item Properties

The following Item properties are localizable:

| Key pattern | Target property | Description |
|-------------|----------------|-------------|
| `<key>.label` | `Item.label` | Primary display label. |
| `<key>.description` | `Item.description` | Help text / tooltip. |
| `<key>.hint` | `Item.hint` | Instructional text alongside input. |

Examples:

```json
{
  "projectName.label": "Nom du projet",
  "projectName.hint": "Entrez le nom officiel",
  "budgetSection.label": "Section budgétaire",
  "budgetSection.description": "Détails du budget annuel"
}
```

#### 3.1.2 Context Labels

The Definition's `labels` object provides alternative display labels
keyed by context name (e.g., `short`, `pdf`, `accessibility`). Locale
Documents override these with a `@context` suffix:

```
<itemKey>.label@<context>
```

Examples:

```json
{
  "budgetSection.label": "Section budgétaire",
  "budgetSection.label@short": "Budget",
  "budgetSection.label@pdf": "Section III : Informations budgétaires",
  "budgetSection.label@accessibility": "Section du budget annuel détaillé"
}
```

When resolving a context label, the cascade is:

1. Locale Document key `<key>.label@<context>` (if present)
2. Locale Document key `<key>.label` (general label)
3. Definition `labels[context]` (inline context label)
4. Definition `label` (inline default)

##### Context on other properties

The `@context` suffix MAY be used with any localizable property, not
only `label`. For properties without a Definition-side context
equivalent (i.e., properties other than `label`), the cascade omits
the inline context step:

| Step | `label@context` | `hint@context` / `description@context` |
|------|----------------|---------------------------------------|
| 1 | Locale `key.label@context` | Locale `key.hint@context` |
| 2 | Locale `key.label` | Locale `key.hint` |
| 3 | Definition `labels[context]` | *(no equivalent — skip)* |
| 4 | Definition `label` | Definition `hint` |

Example: providing a screen-reader-specific hint:

```json
{
  "email.hint": "Courriel professionnel",
  "email.hint@accessibility": "Saisissez votre adresse courriel professionnelle. Ce champ est obligatoire."
}
```

#### 3.1.3 Choice Option Labels

Fields with `choices` have option display text that must be localized.
Options are addressed by their `value`:

```
<fieldKey>.options.<optionValue>.label
```

Only the `label` property of choice options is localizable. The core
Definition schema defines option objects with `value` and `label`
only; `value` is a data key and is not subject to localization.

Examples:

```json
{
  "fundingStatus.options.yes.label": "Oui",
  "fundingStatus.options.no.label": "Non",
  "fundingStatus.options.na.label": "Sans objet"
}
```

When an option `value` contains characters that are not valid in a
dot-delimited key (`.`, `\`), those characters MUST be escaped with
a backslash: `\.` for a literal dot, `\\` for a literal backslash.

##### OptionSet-Level Keys

When multiple fields share an OptionSet (core §4.6), translators MAY
provide a single set of option translations using the `$optionSet`
prefix:

```
$optionSet.<setName>.<optionValue>.label
```

The resolution cascade for option labels is:

1. Field-level Locale key: `<fieldKey>.options.<value>.label`
2. OptionSet-level Locale key: `$optionSet.<setName>.<value>.label`
3. Inline option `label` from the Definition

Field-level keys override OptionSet-level keys, enabling
context-specific translations when the same value set needs different
display text in different fields (e.g., "Yes/No" vs. "Approved/Rejected"
for the same underlying `yesNoNA` set).

Examples:

```json
{
  "$optionSet.yesNoNA.yes.label": "Oui",
  "$optionSet.yesNoNA.no.label": "Non",
  "$optionSet.yesNoNA.na.label": "Sans objet",
  "approvalStatus.options.yes.label": "Approuvé"
}
```

The `$optionSet` prefix is reserved and cannot collide with item keys
(item keys exclude the `$` character). Escaping rules for option values
containing dots or backslashes (§3.1.3) apply identically to
OptionSet-level keys.

#### 3.1.4 Validation Messages

Validation messages are addressable at two granularities: per
constraint code (coarse) and per Bind (fine-grained).

##### Per constraint code

```
<itemKey>.errors.<code>
```

Where `<code>` matches the `code` property of the ValidationResult.
The `code` property provides machine-readable identifiers designed for
localization key lookups. Seven codes are reserved for built-in
constraints: `REQUIRED`, `TYPE_MISMATCH`, `MIN_REPEAT`, `MAX_REPEAT`,
`CONSTRAINT_FAILED`, `SHAPE_FAILED`, `EXTERNAL_FAILED`. Shape rules
MAY define custom codes (e.g., `BUDGET_SUM_MISMATCH`). This replaces
the message for all validation results with that code targeting the
item.

##### Per Bind (`constraintMessage` and `requiredMessage`)

Individual Binds may define a `constraintMessage` (core spec §4.3.1)
or use the item-level required message. To localize a specific Bind's
constraint message, use:

```
<itemKey>.constraintMessage
```

When a field has a single Bind with `constraint`, this key localizes
that Bind's `constraintMessage`. When a field is targeted by multiple
Binds, the key applies to the first Bind whose `constraint` fires.

To localize the required-field message for an item:

```
<itemKey>.requiredMessage
```

##### Resolution precedence

When resolving a validation message, the cascade is:

1. Per-code Locale key (`<key>.errors.<code>`) — if present, wins.
2. Per-Bind Locale key (`<key>.constraintMessage` or
   `<key>.requiredMessage`) — if present.
3. Inline `constraintMessage` on the Bind (Definition).
4. Processor-generated default message.

Examples:

```json
{
  "email.errors.REQUIRED": "L'adresse courriel est obligatoire",
  "email.errors.CONSTRAINT_FAILED": "Veuillez entrer une adresse courriel valide",
  "ssn.constraintMessage": "Le NAS doit être au format 000-000-000",
  "budget.errors.TYPE_MISMATCH": "Le budget doit être un nombre"
}
```

##### Code synthesis

The `code` property is optional on `ValidationResult`. When a result
lacks an explicit `code`, processors MUST synthesize it from the
`constraintKind` property using the reserved code mapping:

| `constraintKind` | Synthesized `code` |
|---|---|
| `required` | `REQUIRED` |
| `type` | `TYPE_MISMATCH` |
| `cardinality` | `MIN_REPEAT` or `MAX_REPEAT` (based on violation) |
| `constraint` | `CONSTRAINT_FAILED` |
| `shape` | `SHAPE_FAILED` |
| `external` | `EXTERNAL_FAILED` |

This ensures locale keys are always resolvable regardless of whether
the processor explicitly sets the `code` property.

#### 3.1.5 Form-Level Strings

Top-level Definition properties (`title`, `description`) use the
reserved key prefix `$form`:

```json
{
  "$form.title": "Rapport annuel sur les subventions",
  "$form.description": "Formulaire de rapport pour les bénéficiaires"
}
```

The `$form` and `$shape` prefixes are reserved for form-level and
shape-level keys respectively. These prefixes cannot collide with item
keys because the core Definition schema restricts item keys to the
pattern `[a-zA-Z][a-zA-Z0-9_]*`, which excludes the `$` character.

#### 3.1.6 Shape Rule Messages

Shape rules (cross-field validations) are addressed by the shape's
`id`:

```
$shape.<shapeId>.message
```

Example:

```json
{
  "$shape.budget-balance.message": "Le total du budget doit correspondre au financement demandé"
}
```

#### 3.1.7 Page Layout Strings

Theme Documents define pages via `PageLayout` objects with `id`,
`title`, and `description` properties. These user-visible strings are
addressable via the `$page` prefix:

```
$page.<pageId>.title
$page.<pageId>.description
```

Where `<pageId>` is the `id` property of a `PageLayout` in the Theme
Document (theme spec §6.1).

Examples:

```json
{
  "$page.info.title": "Informations du projet",
  "$page.info.description": "Entrez les détails de base du projet",
  "$page.review.title": "Révision et soumission"
}
```

Page IDs are unique within a Theme Document and follow the pattern
`^[a-zA-Z][a-zA-Z0-9_\-]*$`.

> **Note:** `$page.` keys address Theme-tier constructs. A Locale
> Document using `$page.` keys depends on both the target Definition
> and the associated Theme Document. Validators SHOULD warn when a
> `$page.` key references a page ID not present in any loaded Theme
> Document (§7.2).

#### 3.1.8 Component Node Strings

Component tree nodes with an `id` property (component spec §3.1) are
addressable via the `$component` prefix:

```
$component.<nodeId>.<property>
$component.<nodeId>.<property>[<index>]
$component.<nodeId>.<arrayProp>[<index>].<subProp>
```

Where `<nodeId>` is the `id` property of a component node in the
Component Document. Only string-typed props (and string elements of
array props) are addressable. Bracket indexing with numeric indices
is used for array-valued properties.

Examples:

```json
{
  "$component.budgetHeading.text": "Détails du budget",
  "$component.contactCard.title": "Coordonnées",
  "$component.contactCard.subtitle": "Adresse courriel et téléphone",
  "$component.submitBtn.label": "Soumettre la demande",
  "$component.submitBtn.pendingLabel": "Soumission en cours...",
  "$component.mainTabs.tabLabels[0]": "Personnel",
  "$component.mainTabs.tabLabels[1]": "Emploi",
  "$component.lineItemTable.columns[0].header": "Description",
  "$component.lineItemTable.columns[1].header": "Montant"
}
```

The following component properties are localizable:

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
| ActionButton | `label`, `pendingLabel` |
| DataTable | `columns[N].header` |
| Panel | `title` |
| Modal | `title`, `triggerLabel` |
| Popover | `triggerLabel` |
| Badge | `text` |
| ProgressBar | `label` |
| Summary | `items[N].label` |
| Select | `placeholder` |
| TextInput | `placeholder`, `prefix`, `suffix` |
| NumberInput | `placeholder` |
| DatePicker | `placeholder` |
| MoneyInput | `placeholder` |

##### Repeat template nodes

When a component node with `id` appears inside a repeat template
(e.g., as a child of a DataTable or Accordion bound to a repeatable
group), the `id` identifies the **template node**, not individual
rendered instances. All instances share the same locale resolution —
the key `$component.<id>.<prop>` resolves to the same string
template, but `{{expression}}` sequences within that string are
evaluated in each repeat instance's binding scope, giving access
to `@index` and `@count`.

> **Note:** `$component.` keys address Component-tier constructs. A
> Locale Document using `$component.` keys depends on both the target
> Definition and the associated Component Document. Validators SHOULD
> warn when a `$component.` key references a node ID not present in
> any loaded Component Document (§7.2).

### 3.2 Key Resolution Rules

Processors MUST apply the following rules when resolving string keys:

1. Keys are **case-sensitive**. `projectName.label` and
   `ProjectName.label` are different keys.
2. A key that does not correspond to any Item, option, or shape in the
   target Definition SHOULD produce a **warning** but MUST NOT cause
   failure. This allows forward-compatible Locale Documents that
   include keys for items not yet present in older Definition versions.
3. A Locale Document MAY contain keys for a subset of localizable
   strings. Missing keys fall through the cascade (§4).
4. Duplicate keys within a single `strings` object are governed by
   JSON parsing rules (last value wins per RFC 8259 §4). Authoring
   tools SHOULD warn on duplicates.

### 3.3 FEL Interpolation

String values MAY contain FEL expressions delimited by double curly
braces:

```
{{<FEL expression>}}
```

The expression is evaluated in the binding context of the Item
identified by the string key's `<itemKey>` prefix. This gives the
expression access to:

- Field values via `$` references (e.g., `$budget`, `$projectName`)
- All FEL stdlib functions
- The `locale()` function (§5.1)
- The `pluralCategory()` function (core spec §3.5)

Examples:

```json
{
  "itemCount.label": "Nombre d'articles : {{$itemCount}}",
  "budget.hint": "Maximum autorisé : {{formatNumber($maxBudget)}} $",
  "lineItems.label": "{{$count}} {{if(pluralCategory($count) = 'one', 'poste', 'postes')}}"
}
```

#### 3.3.1 Interpolation Processing

Processors MUST apply the following rules:

1. To include a literal `{{` in a string value without triggering
   interpolation, authors MUST double the opening braces: `{{{{`.
   Processors MUST treat `{{{{` as a literal `{{` in the output.
   (In JSON source, this is simply `"{{{{"`.)
2. An expression that fails to parse or evaluate MUST NOT cause the
   entire string resolution to fail. Processors MUST replace the
   failed expression with the literal text `{{<original expression>}}`
   and SHOULD emit a warning. For this purpose, **evaluate** includes
   any outcome where the FEL runtime records **error**-severity
   diagnostics for the expression, even if the coerced value is `null`.
3. Expression results are coerced to strings. `null` becomes the
   empty string `""` **unless** rule 3a applies.
3a. If the expression result is `null` **and** the trimmed source
   contains neither a `$` field reference sigil nor an `@` context
   reference sigil **and** the parsed expression is not an
   **interpolation static literal** (see below), processors MUST treat
   the interpolation as failed and MUST preserve the literal text
   `{{<original expression>}}` (same as rule 2). This distinguishes
   intentional empty output for missing `$field` values from expressions
   that do not reference instance data (e.g. author typos or invalid
   operator sequences) that happen to evaluate to `null`.

   An **interpolation static literal** is any of: the `null`, boolean,
   numeric, string, date, or datetime literals; an array or object
   literal whose elements or property values are themselves
   interpolation static literals; or a unary `not` / `!` or unary `-`
   whose operand is an interpolation static literal.
4. Expression results are coerced to strings (when not preserved by
   rules 2 or 3a). After rule 3a, remaining `null` values become the
   empty string `""`. Booleans become `"true"` or `"false"`. Numbers
   use their default string representation.
5. Expressions MUST NOT have side effects. They are evaluated in the
   same read-only context as `calculate` expressions.
6. Interpolation is **not recursive** — the result of evaluating an
   expression is not scanned for further `{{...}}` sequences.

#### 3.3.2 Interpolation Binding Context

The FEL evaluation context for `{{expression}}` sequences depends on
the string key's prefix:

| Key prefix | Binding context | `@index`/`@count` | Available references |
|---|---|---|---|
| `<itemKey>.*` | Item's binding scope | Yes, if item is inside a repeat group | `$fieldRef` relative to scope |
| `$form.*` | Global form context | No | All top-level `$fieldRef` |
| `$shape.<id>.*` | Shape's target scope | Depends on shape target | Per shape definition |
| `$page.<id>.*` | Global form context | No | All top-level `$fieldRef` |
| `$optionSet.*` | Global form context | No | All top-level `$fieldRef` |
| `$component.<id>.*` (outside repeat) | Global form context | No | All top-level `$fieldRef` |
| `$component.<id>.*` (inside repeat template) | Repeat instance scope | Yes | `$fieldRef` within repeat scope + parent scopes |

For item-level keys inside repeat groups, the locale key uses the
**template path** (indices stripped), but `{{expression}}` is evaluated
in the **instance context** — `@index` resolves to the actual instance
index. This enables per-instance labels:

```json
{
  "lineItems.label": "Poste budgétaire {{@index + 1}}"
}
```

## 4. Fallback Cascade

When the engine resolves a localized string, it walks a fallback
chain from most-specific to least-specific:

### 4.1 Cascade Order

For a requested locale code (e.g., `fr-CA`) and string key
(e.g., `projectName.label`):

1. **Regional Locale Document** — Look up the key in the Locale
   Document whose `locale` matches `fr-CA`.
2. **Explicit fallback** — If not found and the Locale Document
   declares a `fallback` (e.g., `"fr"`), look up the key in the
   Locale Document whose `locale` matches the fallback code.
   If the fallback Locale Document itself declares a `fallback`,
   continue walking the explicit chain (subject to circular detection,
   §4.3).
3. **Implicit language fallback** — If not found after exhausting
   the explicit fallback chain, and the *original* requested locale
   code contains a region subtag, strip the region and look up the
   base language (e.g., `fr` from `fr-CA`). This step is skipped if
   any step in the explicit fallback chain already consulted a Locale
   Document with that base language code.
4. **Inline default** — Use the Definition's inline string property
   (`label`, `description`, `hint`, etc.).

A processor MUST walk the cascade in this order and MUST return the
first non-null result. If all steps produce no result, the processor
MUST return the empty string `""`.

> **Example of explicit fallback to a different language:** If `fr-CA`
> declares `fallback: "pt"`, the cascade is: (1) `fr-CA`, (2) `pt`
> (explicit), (3) `fr` (implicit — strip region from original `fr-CA`),
> (4) inline. Both explicit and implicit fallback steps are consulted
> because `pt` is a different language from the base `fr`.

### 4.2 Cascade Examples

Given these documents:

**Definition** (inline defaults):

```json
{
  "items": [
    { "key": "name", "type": "field", "label": "Name", "hint": "Enter your full name" }
  ]
}
```

**Locale Document (`fr`)**:

```json
{
  "locale": "fr",
  "strings": {
    "name.label": "Nom",
    "name.hint": "Entrez votre nom complet"
  }
}
```

**Locale Document (`fr-CA`)**:

```json
{
  "locale": "fr-CA",
  "fallback": "fr",
  "strings": {
    "name.hint": "Entrez votre nom au complet"
  }
}
```

Resolution for locale `fr-CA`:

| Key | `fr-CA` | `fr` | Inline | **Resolved** |
|-----|---------|------|--------|-------------|
| `name.label` | — | `"Nom"` | `"Name"` | **"Nom"** |
| `name.hint` | `"Entrez votre nom au complet"` | `"Entrez votre nom complet"` | `"Enter your full name"` | **"Entrez votre nom au complet"** |

### 4.3 Circular Fallback Detection

A processor MUST detect circular fallback chains (e.g., `fr-CA` →
`fr` → `fr-CA`) and MUST terminate the cascade, falling through to
inline defaults. Processors SHOULD emit a warning when a circular
fallback is detected.

### 4.4 Multiple Locale Documents

An engine MAY have multiple Locale Documents loaded simultaneously.
The engine maintains a locale cascade — an ordered list of Locale
Documents consulted during string resolution. The `setLocale()` call
(§6.2) determines which cascade is active.

## 5. FEL Functions

This specification introduces three FEL functions. `locale()` is part
of the **Locale Core** conformance level (§10) and MUST be implemented
by all conformant locale processors. `formatNumber()` and `formatDate()`
are part of the **Locale Extended** conformance level and are OPTIONAL.

The core FEL function `pluralCategory()` (core spec §3.5) returns the
CLDR plural category (`zero`, `one`, `two`, `few`, `many`, `other`)
for a given number and is available in all FEL evaluation contexts
including locale string interpolation. It replaces the need for a
locale-specific pluralization function.

These functions are registered as locale-tier extensions to the FEL
stdlib. They MUST NOT collide with core FEL built-in function names.
Processors that do not support locale functionality MUST NOT register
these functions.

### 5.1 `locale()`

Returns the active locale code as a string.

**Signature:** `locale() → string`

Returns the BCP 47 language tag of the currently active locale. If no
locale is active (no Locale Document loaded), returns the empty
string `""`.

Like `now()` (core spec §3.1), `locale()` is **non-deterministic** —
its return value changes when `setLocale()` is called. Processors
SHOULD document their `locale()` resolution behavior, consistent with
the core spec's treatment of `now()`.

This function is available in all FEL evaluation contexts —
`calculate`, `relevant`, `constraint`, and `readonly` expressions.
This enables locale-aware logic in the Definition itself:

```json
{
  "key": "instructions",
  "type": "display",
  "label": "Instructions",
  "bind": {
    "relevant": "locale() = 'en' or locale() = ''"
  }
}
```

### 5.2 Pluralization via `pluralCategory()`

Pluralization in locale strings uses the core FEL function
`pluralCategory(count)` (core spec §3.5), which returns the CLDR
plural category for the active locale. The six possible return values
are: `zero`, `one`, `two`, `few`, `many`, `other`.

Authors combine `pluralCategory()` with `if()` to select the
appropriate word form:

```json
{
  "lineItems.label": "{{$count}} {{if(pluralCategory($count) = 'one', 'ligne', 'lignes')}}"
}
```

For languages with more than two plural forms (e.g., Arabic with six
forms, or Polish with three), authors chain conditions:

```json
{
  "items.label": "{{$count}} {{if(pluralCategory($count) = 'one', 'element', if(pluralCategory($count) = 'few', 'elementy', 'elementów'))}}"
}
```

Because `pluralCategory()` uses CLDR data, it correctly handles all
languages — including those where the `one` category does not
correspond to the number 1 (e.g., French treats 0 as `one`).

### 5.3 `formatNumber(value, locale?)`

Formats a number according to locale conventions.

**Signature:** `formatNumber(value: number, locale?: string) → string`

- If `value` is `null`, returns `null`.
- If `locale` is omitted, uses the active locale.
- Returns a locale-formatted string (e.g., `1234.5` → `"1 234,5"` for `fr`).
- Implementations SHOULD use the host platform's number formatting
  capabilities (e.g., `Intl.NumberFormat` in JavaScript,
  `locale.format_string` in Python).
- If the host platform does not support the requested locale, the
  implementation MUST fall back to the `"en"` format.

### 5.4 `formatDate(value, pattern?, locale?)`

Formats a date string according to locale conventions.

**Signature:** `formatDate(value: string, pattern?: string, locale?: string) → string`

- `value` is an ISO 8601 date string. If `null`, returns `null`.
- `pattern` is one of: `"short"`, `"medium"`, `"long"`, `"full"`.
  Defaults to `"medium"`.
- If `locale` is omitted, uses the active locale.
- Implementations SHOULD use the host platform's date formatting
  capabilities.

## 6. Processor Capabilities

A conformant locale processor MUST provide the following capabilities.
The method names below are illustrative; implementations MAY use
different API shapes provided the semantics are equivalent.

### 6.1 Load a Locale Document

Register a Locale Document in the engine's locale store.

- The input is a parsed Locale Document object conforming to this
  specification.
- Processors MUST validate the `$formspecLocale` version and
  `targetDefinition` binding before accepting the document.
- If a Locale Document with the same `locale` code is already loaded,
  the new document MUST replace it.
- Loading a Locale Document MUST NOT trigger reactive updates until
  the active locale is set.

### 6.2 Set the Active Locale

Activate a locale, triggering reactive string resolution.

- The input is a BCP 47 language tag.
- The engine MUST build the fallback cascade (§4.1) and resolve all
  localized strings.
- If the requested locale code does not match any loaded Locale
  Document, the engine MUST fall back to inline defaults and SHOULD
  emit a warning.
- Changing the active locale MUST trigger reactive updates for all
  resolved strings. Implementations using reactive primitives (e.g.,
  signals) SHOULD propagate locale changes through the same
  notification mechanism as field value changes.

### 6.3 Resolve a Localized String

Resolve a single localized string for a given item, property, and
optional context.

- `path` — the item path (e.g., `"projectName"`, `"budget[0].amount"`).
- `property` — the string property (e.g., `"label"`, `"hint"`,
  `"description"`).
- `context` — optional context name for alternative labels
  (e.g., `"short"`, `"pdf"`).
- Returns the resolved string after cascade lookup and FEL
  interpolation.
- Returns the empty string `""` if no string is found at any cascade
  level.

### 6.4 Query the Active Locale

Return the currently active BCP 47 locale code, or the empty string
`""` if no locale is active.

## 7. Validation and Linting

### 7.1 Schema Validation

Locale Documents MUST validate against `schemas/locale.schema.json`.
The schema enforces:

- Required properties: `$formspecLocale`, `version`, `locale`,
  `targetDefinition`, `strings`.
- `strings` MUST be an object with string values.
- `locale` MUST be a syntactically valid BCP 47 language tag.
- `targetDefinition.url` MUST be a URI.

### 7.2 Cross-Reference Validation

A validator that has access to both a Locale Document and its target
Definition SHOULD perform the following cross-reference checks:

| Check | Severity | Description |
|-------|----------|-------------|
| Orphaned key | Warning | String key references an item key not present in the Definition. |
| Missing translation | Info | A localizable property in the Definition has no corresponding key in the Locale Document. |
| Invalid option reference | Warning | An `options.<value>` key references a choice value not present in the field's `choices`. |
| Invalid shape reference | Warning | A `$shape.<id>` key references a shape ID not present in the Definition. |
| Invalid property | Error | The property segment of a key is not a recognized localizable property. |
| Interpolation parse error | Warning | A `{{...}}` expression fails to parse as valid FEL. |
| Version mismatch | Warning | The Definition's version does not satisfy `compatibleVersions`. |
| Orphaned `$page` key | Warning | `$page.<id>` references a page ID not present in the Theme Document. |
| Orphaned `$component` key | Warning | `$component.<id>` references a node ID not present in the Component Document. |
| Orphaned `$optionSet` key | Warning | `$optionSet.<setName>` references an OptionSet name not declared in the Definition. |
| Brackets in item key | Warning | A non-`$component` key contains `[index]` bracket notation. Item-level keys MUST use template paths. |

### 7.3 Linter Rules

The Rust linter owns the canonical Locale semantic-lint codes:

| Code | Description |
|------|-------------|
| E1400 / W1400 | `targetDefinition.url` mismatch or compatible-version mismatch against a paired Definition. |
| E1401 | Unknown reserved namespace or unsupported terminal property in a string key. |
| E1402 | Item string key does not resolve to a Definition item path. |
| E1403 | Item option or `$optionSet` string key does not resolve to a Definition option value. |
| E1404 | `$shape` string key does not resolve to a Definition shape id. |
| E1405 | `{{ ... }}` interpolation segment is not valid FEL. |
| E1406 | Supplied Locale documents contain an observable fallback cycle. |
| E1407 | String key targets a non-presentation property. |
| E1410 | `$page` string key does not resolve to a page id in the supplied Theme document. |
| E1411 | `$component` string key does not resolve to a node id in supplied Component documents. |
| W1401 | Locale fallback target was not supplied in the lint context. |

### 7.4 Static Semantics and Lint

Locale Documents are first validated against `schemas/locale.schema.json`.
Static semantic lint then checks presentation-key semantics. It parses FEL
inside interpolation segments but does not evaluate localized strings and does
not alter runtime string lookup.

Definition-aware checks run only when lint receives `definition_document`.
Theme-aware `$page.*` checks run only when `theme_document` is supplied.
Component-aware `$component.*` checks run only when `component_documents` are
supplied. Fallback-cycle checks inspect the current Locale plus
`locale_documents` supplied in lint context.

## 8. Processing Model

### 8.1 Integration with the Four-Phase Cycle

Locale string resolution is NOT part of the core four-phase processing
cycle (Rebuild → Recalculate → Revalidate → Notify). String resolution
is a **presentation concern**.

Conceptually, the processing layers are:

1. **Core cycle** — Rebuild, Recalculate, Revalidate, Notify.
2. **String resolution** — For each Item, resolve localized strings
   using the active locale cascade. FEL interpolation expressions
   are evaluated against the current (post-Recalculate) binding
   context.
3. **Theme cascade** — Apply the Theme Document's presentation
   overrides. Theme resolution is independent of string content —
   changing a widget type does not affect resolved strings.
4. **Render** — The renderer uses resolved strings and themed
   presentation to produce the UI.

String resolution and theme cascade are orthogonal presentation
concerns. In practice, both can run in parallel or in either order;
the numbered list above represents conceptual layering, not a
mandatory execution sequence.

### 8.2 Validation Message Localization

Localized validation messages are resolved **at render time**, not
during the Revalidate phase. The core Revalidate phase produces
`ValidationResult` objects with `constraintKind` and the inline
(or processor-default) `message`. The renderer (or a locale-aware
presentation layer) resolves the localized message by:

1. Looking up `<itemKey>.errors.<code>` in the active locale cascade
   (synthesizing `code` from `constraintKind` if absent — see §3.1.4).
2. If not found, looking up `<itemKey>.constraintMessage` or
   `<itemKey>.requiredMessage` as appropriate.
3. If not found, using the `ValidationResult.message` as-is.

This design means `ValidationResult.message` always contains the
inline/default-locale message. Localized messages are a presentation
overlay, not a mutation of the validation result.

### 8.3 Reactivity

String resolution is reactive. When any of the following change, all
affected resolved strings MUST be re-evaluated:

- The active locale (via the "set active locale" capability, §6.2).
- A field value referenced by an interpolation expression.
- The loaded Locale Documents (via the "load" capability, §6.1).

String resolution changes are propagated through the implementation's
reactive notification mechanism (e.g., signals). These notifications
are separate from the core Phase 4 Notify set — locale changes are
presentation-layer events, not core data events.

Implementations using signals SHOULD create a computed signal for each
resolved string that depends on the active locale signal and any field
value signals referenced by interpolation expressions.

### 8.4 Repeat Group Paths

For items inside repeat groups, the string key uses the **template
path** (without instance indices):

```json
{
  "lineItems.amount.label": "Montant",
  "lineItems.description.label": "Description du poste"
}
```

The same localized string applies to all instances of the repeated
item. Per-instance string customization is not supported — use FEL
interpolation with the `@index` repeat context variable (core spec
§3.2.2) if instance-specific text is needed:

```json
{
  "lineItems.label": "Poste {{@index}}"
}
```

The `@index` variable is 1-based, so the above produces "Poste 1",
"Poste 2", etc.

## 9. Security Considerations

### 9.1 Content Injection

Localized strings are rendered as text content. Renderers MUST
sanitize string values before inserting them into HTML or other
markup contexts. FEL interpolation results MUST be treated as
untrusted text, not markup.

### 9.2 Expression Evaluation

FEL expressions in interpolated strings are evaluated in a read-only
context with the same security model as `calculate` expressions.
They MUST NOT have side effects and MUST NOT access host platform
APIs beyond those exposed by the FEL stdlib.

### 9.3 Locale Document Provenance

When loading Locale Documents from external sources, the host
application SHOULD verify document integrity and provenance using
the same mechanisms applied to other sidecar artifacts (Theme,
Mapping, Component Documents).

## 10. Conformance

### 10.1 Conformance Levels

This specification defines two conformance levels:

| Level | Name | Description |
|-------|------|-------------|
| 1 | **Locale Core** | Minimum viable locale support: cascade resolution, interpolation, `locale()`. |
| 2 | **Locale Extended** | Full locale support: adds `formatNumber()`, `formatDate()`, cross-reference validation, reactive resolution. |

### 10.2 Locale Core Conformance

A **Locale Core** conformant processor MUST:

1. Parse and validate Locale Documents against the schema.
2. Implement the fallback cascade as defined in §4.
3. Evaluate FEL interpolation expressions as defined in §3.3.
4. Implement the `locale()` FEL function (§5.1).
5. Provide the capabilities defined in §6 (load, set active locale,
   resolve string, query active locale).

### 10.3 Locale Extended Conformance

A **Locale Extended** conformant processor MUST satisfy all Locale
Core requirements and additionally MUST:

1. Implement `formatNumber()` (§5.3) and `formatDate()` (§5.4).
2. Implement cross-reference validation (§7.2).
3. Provide reactive string resolution (§8.3).

### 10.4 Authoring Conformance

A conformant Locale Document MUST:

1. Include all REQUIRED top-level properties (§2.1).
2. Use syntactically valid BCP 47 locale codes.
3. Use valid string key formats (§3.1).
4. Use valid FEL syntax in interpolation expressions.

## Appendix A: Complete Locale Document Example

The following is a complete Locale Document for a grant report form,
demonstrating all key patterns defined in this specification.

```json
{
  "$formspecLocale": "1.0",
  "url": "https://agency.gov/forms/grant-report/locales/fr-CA",
  "version": "1.0.0",
  "name": "grant-report-fr-CA",
  "title": "Rapport de subvention — Français canadien",
  "description": "Localisation française canadienne du formulaire de rapport de subvention.",
  "locale": "fr-CA",
  "fallback": "fr",
  "targetDefinition": {
    "url": "https://agency.gov/forms/grant-report",
    "compatibleVersions": ">=1.0.0 <2.0.0"
  },
  "strings": {
    // Form-level strings (§3.1.5)
    "$form.title": "Rapport annuel sur les subventions",
    "$form.description": "Formulaire de rapport pour les organismes bénéficiaires",

    // Item labels, descriptions, hints (§3.1.1)
    "projectName.label": "Nom du projet",
    "projectName.hint": "Entrez le nom officiel tel qu'il apparaît dans l'entente",
    "projectName.description": "Le nom complet du projet subventionné",

    // Context labels (§3.1.2)
    "budgetSection.label": "Section budgétaire",
    "budgetSection.label@short": "Budget",
    "budgetSection.label@pdf": "Section III : Informations budgétaires détaillées",

    // Choice option labels (§3.1.3)
    "fundingStatus.options.yes.label": "Oui",
    "fundingStatus.options.no.label": "Non",
    "fundingStatus.options.na.label": "Sans objet",

    // Validation messages — per constraint code (§3.1.4)
    "email.errors.REQUIRED": "L'adresse courriel est obligatoire",
    "email.errors.CONSTRAINT_FAILED": "Veuillez entrer une adresse courriel valide",

    // Validation messages — per Bind (§3.1.4)
    "ssn.constraintMessage": "Le NAS doit être au format 000-000-000",

    // Shape rule messages (§3.1.6)
    "$shape.budget-balance.message": "Le total du budget doit correspondre au financement demandé",

    // FEL interpolation (§3.3)
    "totalItems.label": "Total : {{$itemCount}} {{if(pluralCategory($itemCount) = 'one', 'article', 'articles')}}",
    "budgetRemaining.hint": "Il vous reste {{formatNumber($remaining)}} $",

    // Repeat group with @index (§8.4)
    "lineItems.label": "Poste budgétaire {{@index}}",
    "lineItems.amount.label": "Montant",
    "lineItems.description.label": "Description du poste",

    // Page titles (§3.1.7)
    "$page.info.title": "Informations du projet",
    "$page.review.title": "Révision et soumission",

    // OptionSet labels (§3.1.3)
    "$optionSet.yesNoNA.yes.label": "Oui",
    "$optionSet.yesNoNA.no.label": "Non",

    // Component node strings (§3.1.8)
    "$component.submitBtn.label": "Soumettre la demande",
    "$component.mainTabs.tabLabels[0]": "Personnel"
  }
}
```

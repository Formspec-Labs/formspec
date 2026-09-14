---
title: Formspec Locale Specification
version: 2.0.0-draft.1
date: 2026-07-28
depends_on:
  - specs/bundle/app-manifest-spec.md
---

# Formspec Locale Specification v2.0

**Version:** 2.0.0-draft.1
**Date:** 2026-07-28
**Editors:** Formspec Working Group
**Companion to:** Formspec v1.0 — A JSON-Native Declarative Form Standard

---

## Status of This Document

This document is a **Draft** companion specification to the
[Formspec v1.0 Core Specification](../core/spec.md). It defines the Formspec
Locale Document format — a sidecar JSON document that provides
internationalized strings for one exact Formspec Definition or App Manifest.

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
- This document defines Locale 2.0, a sidecar JSON artifact for internationalizing one exact Formspec Definition or App Manifest target.
- A valid Locale 2.0 document requires `$formspecLocale: "2.0"`, `version`, `locale`, `target`, and a `strings` object. `target` names a `definition` or `app` by canonical URL.
- Loaded Locale identity is `(target kind, target URL, normalized locale)`. Regional-to-base fallback stays within that exact target.
- Item strings use `<itemKey>.<property>` with the bare Item key at any depth (`amount.label` for `lineItems[*].amount`); dotted template paths such as `lineItems.amount.label` are not valid keys.
- App-targeted Locale documents may use the closed `$module.x-formspec-surface.shell.*` key family. Every dynamic string uses FEL `{{expression}}` interpolation; processors do not apply a separate `{name}` parser.
- This BLUF is governed by `schemas/locale.schema.json`; generated references expose the canonical schema-defined structure.
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
artifact that provides localized strings for one exact Definition or App
Manifest target.
A Locale Document:

- References its target by kind and URL and may declare compatible versions.
- Maps Item keys (and reserved `$` prefixes) to localized strings via a
  flat key-value structure.
- Supports FEL interpolation for dynamic string content.
- Composes via a fallback cascade that never crosses target identity.
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

The Locale Document follows the same sidecar pattern: a Definition provides
inline defaults, while a Surface shell provides a closed runtime default set.
A Locale Document overrides those strings for one target and language. Multiple
Locale Documents MAY target the same artifact.

### 1.4 Terminology

| Term | Definition |
|------|------------|
| **Definition** | A Formspec Definition document (core spec §4). |
| **Locale Document** | A JSON document conforming to this specification. |
| **Locale code** | A BCP 47 language tag (e.g., `en`, `fr-CA`, `zh-Hans`). |
| **String key** | A dot-delimited key identifying a localizable string, e.g. `<itemKey>.<property>` (§3.1). |
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
  "$formspecLocale": "2.0",
  "url": "https://agency.gov/forms/budget/locales/fr-CA",
  "version": "1.0.0",
  "name": "budget-fr-CA",
  "title": "Budget Form — Canadian French",
  "description": "French-Canadian localization for the annual budget form.",
  "locale": "fr-CA",
  "fallback": "fr",
  "target": {
    "kind": "definition",
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
| `#/properties/$formspecLocale` | `$formspecLocale` | <code>string</code> | yes | const: <code>"2.0"</code>; critical | Locale specification version. MUST be '2.0'. |
| `#/properties/description` | `description` | <code>string</code> | no | — | Human-readable description of the locale's purpose and target audience. |
| `#/properties/extensions` | `extensions` | <code>object</code> | no | — | Extension namespace for vendor-specific or tooling-specific metadata. All keys MUST be x- prefixed. Processors MUST ignore unrecognized extensions. Extensions MUST NOT alter locale resolution semantics. |
| `#/properties/fallback` | `fallback` | <code>string</code> | no | pattern: <code>^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*&#36;</code> | BCP 47 language tag of the locale to consult when a key is not found in this document's strings. Enables explicit fallback chains (e.g., fr-CA → fr). If absent, the cascade proceeds to implicit language fallback (strip region subtag) or inline defaults. Processors MUST detect circular fallback chains and terminate the cascade with a warning. |
| `#/properties/locale` | `locale` | <code>string</code> | yes | pattern: <code>^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*&#36;</code>; critical | BCP 47 language tag identifying the locale this document provides strings for. Processors MUST perform case-insensitive comparison and SHOULD normalize to lowercase language with title-case region (e.g., 'fr-CA'). |
| `#/properties/modules` | `modules` | <code>array</code> | no | — | OPTIONAL declaration of substrate modules this document depends on. Each entry is a canonical ModuleRef. Module-contributed Locale string keys use $module.<modId>.<nodeId>.<prop>. The x-formspec-surface module reserves the closed $module.x-formspec-surface.shell.<SurfaceStringKey> family for app-targeted shell text. |
| `#/properties/name` | `name` | <code>string</code> | no | — | Machine-friendly short identifier for programmatic use. |
| `#/properties/stringGeneration` | `stringGeneration` | <code>object</code> | no | — | Generation provenance keyed exactly like strings. Strict data-only authoring profiles require every authored localized string to have a same-key direct current adopted Need anchor. |
| `#/properties/strings` | `strings` | <code>object</code> | yes | critical | Map of string keys to localized values. Values are strings and MAY contain FEL interpolation only through {{expression}} syntax. Surface-only {name} placeholders are not a second template language. Shell keys use the read-only shell variable context defined by the Locale specification. |
| `#/properties/target` | `target` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/LocaleTarget</code>; critical | Exact Definition or App Manifest target. Loaded Locale identity is (target.kind, target.url, normalized locale). A processor MUST NOT apply this document to another target or cross target identity during fallback. |
| `#/properties/title` | `title` | <code>string</code> | no | — | Human-readable display name for the Locale Document. |
| `#/properties/url` | `url` | <code>string</code> | no | — | Canonical identifier for this Locale Document. Stable across versions — the tuple (url, version) SHOULD be globally unique. |
| `#/properties/version` | `version` | <code>string</code> | yes | critical | Version of this Locale Document. SemVer is RECOMMENDED. The tuple (url, version) SHOULD be unique across all published locale versions. |
<!-- schema-ref:end -->

### 2.2 Target Binding

The `target` object binds this Locale Document to one exact artifact.

| Property | Type | Cardinality | Description |
|---|---|---|---|
| `kind` | `"definition"` or `"app"` | **1..1** (REQUIRED) | Target artifact kind. No additional value or alias is admitted. |
| `url` | absolute URL string | **1..1** (REQUIRED) | Exact Definition URL or App Manifest `id`, according to `kind`. |
| `compatibleVersions` | string | **0..1** (OPTIONAL) | SemVer range for the exact target version. |

When `compatibleVersions` is present, a processor SHOULD verify that
the loaded target's `version` satisfies the range before applying the Locale
Document. In App Manifest 2.4 association, an unsatisfied range is a resolution
error. The processor MUST NOT retarget the Locale or fall through to another
artifact.

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

String keys are dot-delimited and address localizable properties of
Items in the target Definition. The general format is:

```
<itemKey>.<property>
```

Where `<itemKey>` is the bare `key` of an Item in the Definition (core
spec §4.2.1), and `<property>` identifies which string property to
localize. The first key segment is always the Item key; every segment
after it belongs to the property (e.g., `options.<value>.label`,
`errors.<code>`, `label@<context>`).

Item keys are unique across the entire Definition, so a bare key names
exactly one Item wherever it sits — top level, inside a group, or inside
a repeatable group. A field `city` nested in group `address` uses
`city.label`; a field `amount` in repeatable group `lineItems` uses
`amount.label`. Moving an Item between groups does not change its
string keys. Theme `items` overrides address Items the same way (theme
spec §5.4).

Dotted template paths and indexed paths are **not** valid item-level
keys: `address.city.label`, `lineItems.amount.label`, and
`lineItems[*].amount.label` do not address `city` or `amount`.
Processors MUST NOT resolve item strings by path; validators report
such keys as path-form item keys (§7.2; lint code E1402, §7.3).

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

The `@context` suffix MAY be used with any localizable Item property
(§3.1.1), not only `label`. Choice option label keys (§3.1.3) and
per-Bind message keys (§3.1.4) take no `@context` suffix. For properties without a Definition-side context
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

Only the `label` property of choice options is localizable, and the
key's final segment is exactly `label` — option label keys take no
`@context` suffix. The core Definition schema defines option objects
with `value` and `label` only; `value` is a data key and is not subject
to localization.

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
containing dots or backslashes and the no-`@context` rule (§3.1.3)
apply identically to OptionSet-level keys.

#### 3.1.4 Validation Messages

Validation messages are addressable at two granularities: per
constraint code (coarse) and per Bind (fine-grained).

##### Per constraint code

```
<itemKey>.errors.<code>
```

Where `<code>` matches the `code` property of the ValidationResult and
is exactly one key segment.
The `code` property provides machine-readable identifiers designed for
localization key lookups. Core §2.5.1 reserves codes for built-in
constraints: `REQUIRED`, `TYPE_MISMATCH`, `MIN_REPEAT`, `MAX_REPEAT`,
`CONSTRAINT_FAILED`, `CONSTRAINT_PARSE_ERROR`, `SHAPE_FAILED`,
`EXTERNAL_FAILED`. Shape rules
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

#### 3.1.9 Surface Shell Strings

Locale 2.0 app targets may localize the Surface shell through the canonical
family:

```
$module.x-formspec-surface.shell.<SurfaceStringKey>
```

`<SurfaceStringKey>` is closed. The Locale schema and Surface runtime inventory
MUST contain these exact suffixes one-for-one:

| Key suffix | Shell-specific FEL references |
|---|---|
| `slotUnavailableDefinitionForm` | none |
| `slotUnavailableExperienceUnit` | none |
| `slotUnavailableWidgetUnimplemented` | `$widgetName` |
| `slotUnavailableWidgetIncompatible` | `$widgetName` |
| `slotUnavailableWidgetUndeclared` | `$widgetName` |
| `slotUnavailableWidgetData` | none |
| `slotUnavailableStaticContent` | none |
| `slotUnavailableEmbedUnresolved` | none |
| `slotUnavailableEmbedCycle` | none |
| `widgetEmpty` | `$widgetName` |
| `notFoundTitle` | none |
| `notFoundBody` | none |
| `navigationLabel` | none |
| `transitionContinue` | `$target` |
| `transitionPending` | `$trigger` |
| `transitionFailed` | `$trigger` |
| `transitionTargetUnresolved` | `$to` |
| `transitionTargetCollision` | `$to` |
| `transitionNoResponseActions` | `$trigger` |
| `transitionTriggerUnresolved` | `$trigger` |
| `transitionTriggerAmbiguous` | `$trigger` |
| `transitionNoExecutor` | `$trigger` |
| `transitionSuppliedBySlot` | `$trigger` |
| `transitionFireable` | `$trigger` |

The shell-specific references form a read-only object supplied by the Surface
processor. They carry strings only and expose no route table, navigation
function, action executor, Response, or mutable host state. All ordinary FEL
rules still apply.

These keys are valid only for `target.kind: "app"` and the
`x-formspec-surface` module. A processor MUST reject an unknown shell suffix and
MUST NOT translate a shorter host key or legacy Surface string name into this
family.

### 3.2 Key Resolution Rules

Processors MUST apply the following rules when resolving string keys:

1. Keys are **case-sensitive**. `projectName.label` and
   `ProjectName.label` are different keys.
2. A key that does not correspond to a localizable member in the exact target
   SHOULD produce a warning. Unknown Surface shell suffixes are the exception:
   the closed schema rejects them.
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

This is the only authored template syntax. A single-brace sequence such as
`{name}` is literal text. Processors MUST NOT run the former Surface-only
replacement parser before or after FEL interpolation.

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
| `$module.x-formspec-surface.shell.*` | Read-only shell string context | No | Only the key-specific references in §3.1.9 |

For Items inside repeat groups, the locale key uses the bare Item key
(§3.1) — one key for every instance — but `{{expression}}` is evaluated
in the **instance context**: `@index` resolves to the actual 1-based
instance index. This enables per-instance labels, here on the repeat
child `amount` of `lineItems`:

```json
{
  "amount.label": "Montant du poste {{@index}}"
}
```

## 4. Fallback Cascade

When the engine resolves a localized string, it walks a fallback
chain from most-specific to least-specific. Every lookup is indexed by the
complete target identity:

```
(target.kind, target.url, normalized locale)
```

A fallback step MUST preserve `target.kind` and `target.url`. It MUST NOT move
from an app to a Definition, between two Definitions, or between two apps
because their language tags match.

### 4.1 Cascade Order

For a requested locale code (e.g., `fr-CA`) and string key
(e.g., `projectName.label`):

1. **Regional Locale Document** — Look up the key in the Locale
   Document whose `locale` matches `fr-CA`.
2. **Explicit fallback** — If not found and the Locale Document
   declares a `fallback` (e.g., `"fr"`), look up the key in the
   Locale Document whose target is identical and whose `locale` matches the
   fallback code.
   If the fallback Locale Document itself declares a `fallback`,
   continue walking the explicit chain (subject to circular detection,
   §4.3).
3. **Implicit language fallback** — If not found after exhausting
   the explicit fallback chain, and the *original* requested locale
   code contains a region subtag, strip the region and look up the
   base language (e.g., `fr` from `fr-CA`) for the same exact target. This step is skipped if
   any step in the explicit fallback chain already consulted a Locale
   Document with that base language code.
4. **Target default** — For a Definition target, use the Definition's inline
   property. For an App Manifest Surface-shell key, use the runtime's default
   value for that same closed key.

A processor MUST walk the cascade in this order and MUST return the first
non-null result. It MUST NOT consult a Locale document for another target as an
extra fallback. If all target-local steps produce no result and the target has
no default for the key, the processor MUST return the empty string `""`.

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

A processor MUST detect circular fallback chains for one target (e.g.,
`fr-CA` → `fr` → `fr-CA`) and MUST terminate the cascade, falling through to
that target's default. Processors SHOULD emit a warning.

### 4.4 Multiple Locale Documents

An engine MAY have multiple Locale Documents loaded simultaneously. It indexes
them by the complete target-and-locale tuple. The same normalized locale may
therefore exist for an app and any number of Definitions. Duplicate complete
tuples are invalid; processors MUST NOT choose by load order. `setLocale()`
selects a language within a requested target, not one global cross-target list.

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
  exact `target` binding before accepting the document.
- The store key is `(target.kind, target.url, normalized locale)`. A second
  document with the same complete tuple is a duplicate and MUST be rejected;
  it does not replace the first by load order.
- The same normalized locale MAY be loaded for distinct targets.
- Loading a Locale Document MUST NOT trigger reactive updates until
  the active locale is set.

### 6.2 Set the Active Locale

Activate a locale, triggering reactive string resolution.

- The input identifies an exact target plus a BCP 47 language tag.
- The engine MUST build the fallback cascade (§4.1) and resolve all
  localized strings for that target.
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
  Lookup uses the Item key of the path's last item segment
  (`budget[0].amount` → `amount.<property>`), never the path itself
  (§3.1).
- `property` — the string property (e.g., `"label"`, `"hint"`,
  `"description"`).
- `context` — optional context name for alternative labels
  (e.g., `"short"`, `"pdf"`).
- `target` — exact `{kind, url}` identity whose Locale cascade is consulted.
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
  `target`, `strings`.
- `strings` MUST be an object with string values.
- `locale` MUST be a syntactically valid BCP 47 language tag.
- `target` is closed, `target.kind` is `definition` or `app`, and `target.url`
  is an absolute URI.
- Surface shell keys are limited to the exact §3.1.9 set.

### 7.2 Cross-Reference Validation

A validator that has access to a Locale Document, its exact target, and the
App Manifest association SHOULD perform the following cross-reference checks:

| Check | Severity | Description |
|-------|----------|-------------|
| Orphaned key | Warning | String key references an Item key not present in the Definition. |
| Missing translation | Info | A localizable property in the Definition has no corresponding key in the Locale Document. |
| Invalid option reference | Warning | An `options.<value>` key references a choice value not present in the field's `choices`. |
| Invalid shape reference | Warning | A `$shape.<id>` key references a shape ID not present in the Definition. |
| Invalid property | Error | The property segments of a key are not a recognized localizable property shape (e.g. `city.options.label` with no option value, `city.errors.A.B`, `city.options.yes.label@short`). |
| Interpolation parse error | Warning | A `{{...}}` expression fails to parse as valid FEL. |
| Target mismatch | Error | `target.kind` or `target.url` does not identify the selected loaded Definition or App Manifest. |
| Version mismatch | Error for App Manifest 2.4 association | The target version does not satisfy `compatibleVersions`. |
| Reference locale mismatch | Error | App Manifest `locales[].locale` does not equal the loaded document's normalized `locale`. |
| Duplicate target-locale tuple | Error | Two loaded documents share `(target.kind, target.url, normalized locale)`. |
| Cross-target fallback | Error | An explicit or implicit fallback attempts to consult another target. |
| Invalid shell target | Error | A Surface shell key appears in a Locale whose target kind is not `app` or whose app did not load the Surface module. |
| Orphaned `$page` key | Warning | `$page.<id>` references a page ID not present in the Theme Document. |
| Orphaned `$component` key | Warning | `$component.<id>` references a node ID not present in the Component Document. |
| Orphaned `$optionSet` key | Warning | `$optionSet.<setName>` references an OptionSet name not declared in the Definition. |
| Path-form item key | Error | An item-level key's Item segment is a dotted template path (`address.city.label`) or carries `[index]` / `[*]` bracket notation. Item-level keys MUST use the bare Item key (§3.1). |
| Ambiguous item key | Error | An item-level key names an Item key the Definition declares more than once (core §4.2.1 uniqueness), so it addresses no single Item. |

### 7.3 Linter Rules

The Rust linter owns the canonical Locale semantic-lint codes:

| Code | Description |
|------|-------------|
| E1400 / W1400 | `target.kind` / `target.url` mismatch or compatible-version mismatch against the paired target. |
| E1401 | Unknown reserved namespace or malformed property in a string key: unsupported terminal (any Item terminal outside §3.1.1 and §3.1.4, or `@context` on a §3.1.4 message key), option key without exactly `options.<value>.label`, or error key without exactly one code segment. |
| E1402 | Item string key does not name exactly one Definition Item by bare key: unknown key, duplicated key, dotted template path, or indexed path. Path-form keys are rejected even without a paired Definition; with one, a dotted path is recognized only when its segments are Definition Item keys (otherwise the key is E1401). |
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

Definition-aware checks run only when lint receives `definition_document`;
the path-form item-key check (E1402) is structural and runs without it.
Theme-aware `$page.*` checks run only when `theme_document` is supplied.
Component-aware `$component.*` checks run only when `component_documents` are
supplied. Fallback-cycle checks inspect the current Locale plus
`locale_documents` supplied in lint context. App-target and complete-tuple
checks run only when the App Manifest and referenced Locale documents are
supplied; schema-only lint does not pretend to perform that graph validation.

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

### 8.4 Repeat Group Items

Items inside repeat groups use their bare Item key (§3.1), exactly like
top-level Items. For a repeatable group `lineItems` with children
`amount` and `description` (instance paths `lineItems[0].amount`, …):

```json
{
  "lineItems.label": "Postes budgétaires",
  "amount.label": "Montant",
  "description.label": "Description du poste"
}
```

`lineItems.amount.label` and `lineItems[*].amount.label` are not valid
keys for `amount` (§3.1). A processor resolving a string for instance
path `lineItems[2].amount` looks up `amount.label`.

The same localized string applies to all instances of the repeated
item. Per-instance string customization is not supported — use FEL
interpolation with the `@index` repeat context variable (core spec
§3.2.2) if instance-specific text is needed:

```json
{
  "amount.label": "Montant du poste {{@index}}"
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
2. Index loaded documents by complete target-and-locale tuple and reject
   duplicates.
3. Implement the target-bounded fallback cascade as defined in §4.
4. Evaluate FEL interpolation expressions as defined in §3.3 without a
   single-brace compatibility parser.
5. Implement the `locale()` FEL function (§5.1).
6. Provide the capabilities defined in §6 (load, set active locale,
   resolve string, query active locale).
7. Keep the Surface shell key set one-for-one with §3.1.9 and expose only its
   read-only key-specific FEL references.

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
5. Use an exact `target`; do not author `targetDefinition` in Locale 2.0.
6. Use Surface shell keys only for an app target and only from the closed set.

## Appendix A: Complete Locale Document Example

The following is a complete Locale Document for a grant report form,
demonstrating all key patterns defined in this specification.

```json
{
  "$formspecLocale": "2.0",
  "url": "https://agency.gov/forms/grant-report/locales/fr-CA",
  "version": "1.0.0",
  "name": "grant-report-fr-CA",
  "title": "Rapport de subvention — Français canadien",
  "description": "Localisation française canadienne du formulaire de rapport de subvention.",
  "locale": "fr-CA",
  "fallback": "fr",
  "target": {
    "kind": "definition",
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
    "lineItems.label": "Postes budgétaires",
    "amount.label": "Montant du poste {{@index}}",
    "description.label": "Description du poste",

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

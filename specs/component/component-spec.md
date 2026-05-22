---
title: Formspec Component Specification
version: 1.0.0-draft.1
date: 2026-04-09
status: draft
---

# Formspec Component Specification v1.0

## Status of This Document

This document is a **Draft** companion specification to the
[Formspec v1.0 Core Specification](../core/spec.md). It defines the Formspec Component
Document format — a sidecar JSON document that describes a **parallel
presentation tree** of UI components bound to a Formspec Definition's items.

**Status:** Draft Companion Specification
**Version:** 1.0.0-draft.1
**Date:** 2026-04-09
**Depends on:** Formspec Core Specification v1.0 (../core/spec.md), Formspec Theme
Specification v1.0 (theme-spec.md), Response Actions Specification v1.0
(../response-actions/response-actions-spec.md), FEL Normative Grammar v1.0
(shipped with the `fel-core` crate at `../../../fel-core/specs/fel/fel-grammar.md`)

---

## Conventions and Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this
document are to be interpreted as described in
[RFC 2119](https://www.ietf.org/rfc/rfc2119.txt).

JSON syntax and data types are as defined in [RFC 8259]. JSON Pointer
syntax is as defined in [RFC 6901]. URI syntax is as defined in
[RFC 3986].

JSON examples use `//` comments for annotation; comments are not valid
JSON. Property names in monospace (`component`) refer to JSON keys.
Section references (§N) refer to this document unless prefixed with
"core" (e.g., "core §4.2.5") or "theme" (e.g., "theme §3").

---

## Bottom Line Up Front

<!-- bluf:start file=component-spec.bluf.md -->
- This document defines Tier 3 Component Documents for explicit, tree-based Formspec rendering.
- A valid component document requires `$formspecComponent`, `version`, `targetDefinition`, and `tree`.
- Component trees control layout and widget selection but cannot override core behavioral semantics from the Definition.
- Component nodes may carry additive reference metadata (`unitRef`, `taskRefs`, `conceptRefs`, and `x-generation`) defined by the Component Reference Fields companion; default renderers ignore it.
- This BLUF is governed by `schemas/component.schema.json`; generated schema references are the canonical structural contract.
<!-- bluf:end -->

## Table of Contents

- [Bottom Line Up Front](#bottom-line-up-front)
- [§1 Introduction](#1-introduction)
  - [§1.1 Purpose and Scope](#11-purpose-and-scope)
  - [§1.2 Relationship to Formspec Core, Theme Spec, and FEL](#12-relationship-to-formspec-core-theme-spec-and-fel)
  - [§1.3 Conformance Levels (Core / Complete)](#13-conformance-levels-core--complete)
  - [§1.4 Terminology](#14-terminology)
- [§2 Document Structure](#2-document-structure)
  - [§2.1 Top-Level Properties](#21-top-level-properties)
  - [§2.2 Target Definition Binding](#22-target-definition-binding)
  - [§2.3 MIME Type (.formspec-component.json)](#23-mime-type-formspec-componentjson)
  - [§2.4 Minimal Conforming Document](#24-minimal-conforming-document)
- [§3 Component Model](#3-component-model)
  - [§3.1 Component Object Base Properties](#31-component-object-base-properties)
  - [§3.2 Component Tree Semantics (single root)](#32-component-tree-semantics-single-root)
  - [§3.3 Children Ordering](#33-children-ordering)
  - [§3.4 Nesting Constraints](#34-nesting-constraints)
  - [§3.5 AccessibilityBlock](#35-accessibilityblock)
  - [§3.6 Localizable String Properties](#36-localizable-string-properties)
- [§4 Slot Binding](#4-slot-binding)
  - [§4.1 The bind Property](#41-the-bind-property)
  - [§4.2 Bind Resolution Rules](#42-bind-resolution-rules)
  - [§4.3 Editable Binding Uniqueness](#43-editable-binding-uniqueness)
  - [§4.4 Repeatable Group Binding](#44-repeatable-group-binding)
  - [§4.5 Unbound Required Items](#45-unbound-required-items)
  - [§4.6 Bind/dataType Compatibility Matrix](#46-binddatatype-compatibility-matrix)
- [§5 Built-In Components — Core (17)](#5-built-in-components--core-17)
- [§6 Built-In Components — Progressive (16)](#6-built-in-components--progressive-16)
- [§7 Custom Components](#7-custom-components)
  - [§7.1 The components Registry](#71-the-components-registry)
  - [§7.2 {param} Interpolation Grammar (ABNF)](#72-param-interpolation-grammar-abnf)
  - [§7.3 Instantiation](#73-instantiation)
  - [§7.4 Recursion Prohibition and Cycle Detection](#74-recursion-prohibition-and-cycle-detection)
  - [§7.5 Depth Limits](#75-depth-limits)
- [§8 Conditional Rendering](#8-conditional-rendering)
  - [§8.1 The when Property](#81-the-when-property)
  - [§8.2 Distinction from Bind relevant](#82-distinction-from-bind-relevant)
  - [§8.3 FEL Evaluation Context](#83-fel-evaluation-context)
  - [§8.4 Error Handling](#84-error-handling)
- [§9 Responsive Design](#9-responsive-design)
  - [§9.1 Breakpoints Declaration](#91-breakpoints-declaration)
  - [§9.2 The responsive Property](#92-the-responsive-property)
  - [§9.3 Merge Semantics (mobile-first)](#93-merge-semantics-mobile-first)
  - [§9.4 Structural Constraints](#94-structural-constraints)
- [§10 Theming and Design Tokens](#10-theming-and-design-tokens)
  - [§10.1 The tokens Map](#101-the-tokens-map)
  - [§10.2 $token.path References](#102-tokenpath-references)
  - [§10.3 Cross-Tier Token Cascade](#103-cross-tier-token-cascade)
  - [§10.4 Unresolved Token Handling](#104-unresolved-token-handling)
- [§11 Cross-Tier Interaction](#11-cross-tier-interaction)
  - [§11.1 Tier 1 Fallback for Unbound Items](#111-tier-1-fallback-for-unbound-items)
  - [§11.2 Tier 2 Token Inheritance](#112-tier-2-token-inheritance)
  - [§11.3 Precedence: Tier 3 > Tier 2 > Tier 1](#113-precedence-tier-3--tier-2--tier-1)
  - [§11.4 Partial Component Trees](#114-partial-component-trees)
  - [§11.5 Cross-References to Peer Artifacts](#115-cross-references-to-peer-artifacts)
- [§12 Validation and Conformance](#12-validation-and-conformance)
  - [§12.1 Structural Validation (JSON Schema)](#121-structural-validation-json-schema)
  - [§12.2 Referential Integrity](#122-referential-integrity)
  - [§12.3 Compatibility Validation](#123-compatibility-validation)
  - [§12.4 Conformance Levels: Core / Complete](#124-conformance-levels-core--complete)
- [§13 Complexity Controls](#13-complexity-controls)
  - [§13.1 Excluded Features](#131-excluded-features)
  - [§13.2 Guard Rails](#132-guard-rails)
  - [§13.3 Extension Mechanism](#133-extension-mechanism)
- [Appendix A: Full Example — Budget Form](#appendix-a-full-example--budget-form)
- [Appendix B: Component Quick Reference](#appendix-b-component-quick-reference)
- [Appendix C: DataType ↔ Component Compatibility](#appendix-c-datatype--component-compatibility)

---

## 1. Introduction

### 1.1 Purpose and Scope

The Formspec Core Specification defines **what** data to collect (Items, core
§4.2) and **how** it behaves (Binds, Shapes). The Formspec Theme Specification
(theme-spec.md) defines **Tier 2** presentation: a selector cascade, design
tokens, widget configuration, and page layout that control how a Definition
is rendered.

This specification defines **Tier 3** of the Formspec presentation model: a
**Component Document** that describes a complete, parallel presentation tree
of UI components. Where Tier 2 maps items to widgets one-to-one via selectors,
Tier 3 builds an explicit tree of layout containers, input controls, and
display elements, with each input component **slot-bound** to a Definition
item by key.

A Component Document:

- References a Definition by URL (same binding mechanism as Tier 2 themes).
- Declares a single root component whose subtree defines the full visual
  layout of the form.
- Binds input components to Definition items, inheriting labels, validation
  rules, required state, and relevance from the Definition.
- Uses FEL expressions for conditional rendering (`when` property).
- Supports responsive breakpoint overrides and design tokens.
- Defines a fixed catalog of 33 built-in components (17 Core + 16
  Progressive) plus a custom component registry for reuse.

Multiple Component Documents MAY target the same Definition. This enables
platform-specific presentations (web wizard, mobile single-page, print layout)
without modifying the Definition or its behavioral rules.

### 1.2 Relationship to Formspec Core, Theme Spec, and FEL

The Formspec architecture defines a three-tier presentation model:

| Tier | Concern | Defined In |
|------|---------|------------|
| 1. Structure hints | Advisory widget hints on Items | Core §4.2.5 (`presentation`) |
| 2. Theme | Selector cascade, tokens, layout grid | Theme Spec (theme-spec.md) |
| 3. Component | Explicit component tree with slot binding | **This specification** |

Tier 3 is the most expressive layer. When a Component Document is applied,
it takes precedence over both Tier 2 themes and Tier 1 inline hints for
layout and widget selection. However, the Definition's **behavioral** rules
(required, relevant, readonly, constraint, calculate) always govern data
semantics — Tier 3 cannot override them.

Tier 3 MAY coexist with a Tier 2 theme. When both are present:

- The Component Document controls layout and component selection.
- Theme tokens are available as `$token.` references within the Component
  Document (§10.3).
- Items not explicitly bound in the component tree fall back to Tier 2/Tier 1
  rendering (§11.1).

FEL expressions (fel-core/specs/fel/fel-grammar.md) are used in the `when` property for
conditional rendering (§8). FEL is NOT used for computed props, data
transformation, or any purpose other than boolean visibility conditions
and display text interpolation.

### 1.3 Conformance Levels (Core / Complete)

This specification defines two conformance levels:

| Level | Components | Requirement |
|-------|-----------|-------------|
| **Core Conformant** | Core components (§5) | MUST support all Core components. MUST apply fallback rules (§6.18) when encountering Progressive components. |
| **Complete Conformant** | All 33 components (§5 + §6) | MUST support all Core and Progressive components. |

A processor that claims Core conformance MUST, upon encountering a
Progressive component, substitute the specified Core fallback (§6.18)
and SHOULD emit an informative warning.

A processor that claims Complete conformance MUST render all 33 built-in
components natively.

Both levels MUST support the custom component mechanism (§7).

### 1.4 Terminology

| Term | Definition |
|------|------------|
| **Definition** | A Formspec Definition document (core spec §4). |
| **Component Document** | A Formspec Component document conforming to this specification. |
| **Component** | A node in the component tree. Each component has a type, optional binding, and optional children. |
| **Tier 1 hints** | The `formPresentation` and `presentation` properties defined in core spec §4.1.1 and §4.2.5. |
| **Tier 2 theme** | A Formspec Theme Document conforming to theme-spec.md. |
| **Tier 3 component** | A Component Document conforming to this specification. |
| **Renderer** | Software that presents a Definition to end users using a Component Document. |
| **Token** | A named design value (color, spacing, typography) defined in the `tokens` map. |
| **Slot binding** | The association between a component and a Definition item via the `bind` property. |
| **Core component** | One of the 17 components that all conforming processors MUST support. |
| **Progressive component** | One of the 16 additional components that Complete processors MUST support, with defined fallbacks for Core processors. |
| **Custom component** | A reusable component template defined in the `components` registry. |

---

## 2. Document Structure

A Formspec Component Document is a JSON object. Conforming implementations
MUST recognize the following top-level properties and MUST reject any
Component Document that omits a REQUIRED property.

```json
{
  "$formspecComponent": "1.0",
  "url": "https://agency.gov/forms/budget/components/wizard",
  "version": "1.0.0",
  "targetDefinition": {
    "url": "https://agency.gov/forms/budget",
    "compatibleVersions": ">=1.0.0 <2.0.0"
  },
  "breakpoints": {
    "sm": 576,
    "md": 768,
    "lg": 1024
  },
  "tokens": {},
  "components": {},
  "tree": {}
}
```

### 2.1 Top-Level Properties

<!-- schema-ref:start id=component-top-level schema=schemas/component.schema.json pointers=# -->
<!-- generated:schema-ref id=component-top-level -->
| Pointer | Field | Type | Required | Notes | Description |
|---|---|---|---|---|---|
| `#/properties/$formspecComponent` | `$formspecComponent` | <code>string</code> | yes | enum: <code>"1.0"</code>, <code>"1.1"</code>; critical | Component specification version. MUST be '1.0' or '1.1'. |
| `#/properties/breakpoints` | `breakpoints` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/Breakpoints</code> | Named viewport breakpoints for responsive prop overrides. Keys are breakpoint names; values are minimum viewport widths in pixels. Mobile-first cascade: base props apply to all widths, then overrides merge in ascending order. |
| `#/properties/components` | `components` | <code>object</code> | no | — | Registry of custom component templates. Keys are PascalCase names (MUST NOT collide with built-in names). Each template has params and a tree that is instantiated with {param} interpolation. |
| `#/properties/description` | `description` | <code>string</code> | no | — | Human-readable description. |
| `#/properties/extensions` | `extensions` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/Extensions</code> | Document-level extension properties. All keys MUST be prefixed with 'x-'. |
| `#/properties/name` | `name` | <code>string</code> | no | — | Machine-friendly short identifier. |
| `#/properties/targetDefinition` | `targetDefinition` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/TargetDefinition</code>; critical | Binding to the target Formspec Definition and optional compatibility range. |
| `#/properties/title` | `title` | <code>string</code> | no | — | Human-readable name. |
| `#/properties/tokens` | `tokens` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/Tokens</code> | Flat key-value map of design tokens. Referenced in style objects and token-able props via $token.key syntax. Tier 3 tokens override Tier 2 theme tokens of the same key. |
| `#/properties/tree` | `tree` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/AnyComponent</code>; critical | Root component node of the presentation tree. MUST be a single component object (wrap multiple children in Stack or Section). |
| `#/properties/url` | `url` | <code>string</code> | no | — | Canonical URI identifier for this Component Document. |
| `#/properties/version` | `version` | <code>string</code> | yes | critical | Version of this Component Document. |
<!-- schema-ref:end -->

The generated table above is the canonical structural contract for Component
Document top-level properties.

Processors MUST ignore unrecognized top-level properties whose keys begin
with `x-`. Processors MUST reject unrecognized top-level properties that
do NOT begin with `x-`.

### 2.2 Target Definition Binding

The `targetDefinition` object binds this Component Document to a specific
Definition.

| Property | Type | Cardinality | Description |
|---|---|---|---|
| `url` | string (URI) | **1..1** (REQUIRED) | Canonical URL of the target Definition (`url` property from the Definition). |
| `compatibleVersions` | string | **0..1** (OPTIONAL) | Semver range expression (e.g., `">=1.0.0 <2.0.0"`) describing which Definition versions this Component Document supports. When absent, the document is assumed compatible with any version. |

When `compatibleVersions` is present, a processor SHOULD verify that the
Definition's `version` satisfies the range before applying the component
tree. A processor MUST NOT fail if the range is unsatisfied; it SHOULD
warn and MAY fall back to Tier 2/Tier 1 rendering.

The binding mechanism is identical to the Theme Specification's
`targetDefinition` (theme-spec §2.2). A Component Document and a Theme
Document MAY target the same Definition simultaneously.

### 2.3 MIME Type (.formspec-component.json)

Formspec Component Documents SHOULD use the file extension
`.formspec-component.json`.

When served over HTTP, the content type SHOULD be
`application/json`. Processors MAY recognize the custom media type
`application/formspec-component+json` when registered.

The file extension convention enables tooling to distinguish Component
Documents from Definition documents (`.formspec.json`) and Theme
Documents (`.formspec-theme.json`) by filename alone.

### 2.4 Minimal Conforming Document

The following is the smallest valid Component Document:

```json
{
  "$formspecComponent": "1.0",
  "version": "1.0.0",
  "targetDefinition": {
    "url": "https://example.com/form"
  },
  "tree": {
    "component": "Stack",
    "children": [
      { "component": "TextInput", "bind": "name" }
    ]
  }
}
```

This document:

- Declares `$formspecComponent` version `"1.0"` (REQUIRED).
- Provides a `version` for the document itself (REQUIRED).
- Binds to a target Definition via `targetDefinition` (REQUIRED).
- Defines a root `tree` with a single `Stack` containing one `TextInput`
  bound to the item key `"name"` (REQUIRED).

All other top-level properties (`url`, `name`, `title`, `description`,
`breakpoints`, `tokens`, `components`) are OPTIONAL and default to
empty/absent.

---

## 3. Component Model

A component tree is a hierarchical structure of **component objects**.
Each component object describes a single UI element — a layout container,
an input control, a display element, or a structural grouping.

### 3.1 Component Object Base Properties

Every component object is a JSON object. The following base properties
are recognized on all component objects:

| Property | Type | Cardinality | Description |
|---|---|---|---|
| `component` | string | **1..1** (REQUIRED) | The component type name. MUST be a built-in component name (§5, §6) or a key in the `components` registry (§7). |
| `id` | string | **0..1** (OPTIONAL) | Unique identifier within the component tree document. See below. |
| `bind` | string | **0..1** (varies) | Item key from the Definition. See §4 for rules per component category. |
| `when` | string (FEL) | **0..1** (OPTIONAL) | FEL boolean expression for conditional rendering. See §8. |
| `unitRef` | string | **0..1** (OPTIONAL) | Reference metadata linking the node to an Experience Unit. See [Component Reference Fields §2](component-reference-fields-spec.md#2-unitref). |
| `taskRefs` | array of strings | **0..1** (OPTIONAL) | Advisory reference metadata linking the node to Experience Tasks. See [Component Reference Fields §3](component-reference-fields-spec.md#3-taskrefs). |
| `conceptRefs` | array of ConceptRef objects | **0..1** (OPTIONAL) | Host-policy concept metadata using the Experience `ConceptRef` shape. See [Component Reference Fields §4](component-reference-fields-spec.md#4-conceptrefs). |
| `x-generation` | object | **0..1** (OPTIONAL) | Generation provenance metadata. Renderers MUST ignore it for default runtime output. See [Component Reference Fields §5](component-reference-fields-spec.md#5-x-generation). |
| `responsive` | object | **0..1** (OPTIONAL) | Breakpoint-keyed prop overrides. See §9. |
| `style` | object | **0..1** (OPTIONAL) | Flat style map. Values MAY contain `$token.path` references. See §10.2. |
| `layout` | ComponentLayout | **0..1** (OPTIONAL) | Typed structural placement hints, such as grid placement metadata for documented layout contexts. |
| `cssClass` | string \| array of strings | **0..1** (OPTIONAL) | CSS class name(s) that web renderers SHOULD apply to the component's root element. Additive to renderer-generated classes. Non-web renderers MAY ignore. Values MAY contain `$token.` references. |
| `accessibility` | AccessibilityBlock | **0..1** (OPTIONAL) | Accessibility overrides applied to the component's root element. See §3.5. |
| `children` | array | **0..1** (varies) | Array of child component objects. Only components that accept children (§3.4) MAY include this property. |

##### `id` (Optional)

Components MAY include an `id` property — a unique string identifier
within the component tree document. The `id` MUST match the pattern
`^[a-zA-Z][a-zA-Z0-9_\-]*$` (letters, digits, underscores, hyphens;
must start with a letter).

When present, `id` MUST be unique across the entire component tree
document. The `id` enables:

- **Locale string addressing:** `$component.<id>.<prop>` keys in
  Locale Documents (locale spec §3.1.8).
- **Test selectors:** Stable identifiers for automated testing.
- **Accessibility anchoring:** Stable references for assistive
  technology integration.

Processors MUST validate `id` uniqueness when both `id` values and
the component tree are available:

- At validation/linting time, an `id` collision MUST produce an
  **error**.
- At runtime, an `id` collision SHOULD produce a **warning** and
  the processor MUST bind only the **first occurrence** in document
  order (matching the editable binding uniqueness pattern in §4.3).

##### Repeat template nodes

When a component node with `id` appears inside a repeat template
(as a child of a DataTable bound to a repeatable group per §6.14, or
an Accordion per §6.3), the `id` identifies the **template node**,
not individual rendered instances. All rendered instances of the
template share the same `id`. This is consistent with the
template-instantiation rendering model defined in §4.4 — the
component tree document contains one subtree that the renderer
instantiates N times.

For locale addressing, this means a single locale key
`$component.<id>.<prop>` applies to all repeat instances. If
per-instance text is needed, the locale string value may use FEL
interpolation with `@index` and `@count` (evaluated in each repeat
instance's binding scope).

In addition to these base properties, each component type defines its own
**component-specific props** (documented in §5 and §6). Component-specific
props are siblings of the base properties in the same JSON object.

Example of a fully-specified component object:

```json
{
  "component": "TextInput",
  "bind": "projectName",
  "when": "$hasProject = true",
  "placeholder": "Enter project name",
  "style": {
    "borderColor": "$token.color.primary"
  },
  "responsive": {
    "sm": { "placeholder": "Project" }
  }
}
```

Component objects are closed. Processors MUST reject unrecognized
component-object properties unless a property is explicitly allowed by
that component's schema. Top-level `x-*` document properties remain the
extension lane.

### 3.2 Component Tree Semantics (single root)

The `tree` property MUST contain exactly **one** component object. This
object is the **root** of the component tree.

To present multiple components at the top level, authors MUST wrap them
in a layout component (typically `Stack` or `Section`):

```json
// ✗ INVALID — tree cannot be an array
"tree": [
  { "component": "TextInput", "bind": "name" },
  { "component": "TextInput", "bind": "email" }
]

// ✓ VALID — single root wrapping multiple children
"tree": {
  "component": "Stack",
  "children": [
    { "component": "TextInput", "bind": "name" },
    { "component": "TextInput", "bind": "email" }
  ]
}
```

The root component MAY be any component that accepts children (Layout
or Container). A root that is a leaf component (Input or Display) is
valid but yields a form with a single element.

### 3.3 Children Ordering

The `children` array defines an **ordered** list. Renderers MUST
preserve the array order when rendering:

- The first child in the array MUST be rendered first (topmost in a
  vertical stack, leftmost in a horizontal layout, first column in a
  grid).
- Subsequent children MUST follow in array order.

Renderers MUST NOT reorder children unless explicitly instructed by a
responsive override (§9) that changes layout properties (e.g., switching
a Stack's direction), but even then the logical array order is preserved
within the new layout direction.

### 3.4 Nesting Constraints

Components are classified into four categories. Nesting rules depend on
the category:

| Category | Accepts `children` | Examples |
|----------|-------------------|----------|
| **Layout** | Yes | Section, Stack, Grid, Tabs, Accordion |
| **Container** | Yes | Card, Collapsible, ConditionalGroup, Panel, Modal, Popover |
| **Input** | No | TextInput, NumberInput, Select, Toggle, … |
| **Display** | No | Heading, Text, Divider, Alert, Badge, … |

Rules:

1. **Layout and Container** components MAY contain any component type
   as children (Layout, Container, Input, or Display), unless further
   restricted by the specific component (e.g., Tabs children SHOULD
   be Section components for correct tab rendering).

2. **Input and Display** components MUST NOT have a `children` property.
   If present, processors MUST reject the document or ignore the
   `children` property and emit a warning.

3. Nesting depth SHOULD NOT exceed 20 levels. Processors MAY reject
   documents exceeding this limit.

---

### 3.5 AccessibilityBlock

The optional `accessibility` property on any component object is an
**AccessibilityBlock** — a flat object that lets authors override or
supplement the ARIA attributes applied to the component's root element.

| Property | Type | Description |
|---|---|---|
| `role` | string | ARIA role override (e.g., `"region"`, `"group"`, `"status"`). Replaces any renderer-default role. |
| `description` | string | Accessible description text. Renderers SHOULD wire this to `aria-describedby` (not `aria-description`, which is not a valid ARIA attribute). |
| `liveRegion` | `"off"` \| `"polite"` \| `"assertive"` | Sets `aria-live` on the root element. Renderers MUST NOT apply `role="status"` or any live-region semantics unless this property is explicitly set. |

Renderers MUST apply all present `AccessibilityBlock` properties to the
component's root DOM element. If a property is absent, the renderer's
default behaviour is preserved.

### 3.6 Localizable String Properties

The following table lists component properties that contain
human-readable text addressable by Locale Documents via
`$component.<id>.<prop>` keys. Only components with an `id`
property are addressable.

| Component | Localizable Props |
|-----------|-------------------|
| Section | `title`, `description` |
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

Array-valued properties use bracket indexing with numeric indices
(e.g., `$component.mainTabs.tabLabels[0]`).

---

## 4. Slot Binding

Slot binding is the mechanism by which components in the presentation tree
are associated with items in the Formspec Definition. The `bind` property
on a component object establishes this association.

### 4.1 The bind Property

The `bind` property is a **string** that identifies an item in the
target Definition. It accepts two forms:

1. **Flat key** — a single `key` matching a top-level item
   (e.g., `"projectName"`).
2. **Dotted qualified path** — a dot-delimited path from a group key
   to a nested child key (e.g., `"applicantInfo.orgName"`).

The `bind` value is NOT a JSON Pointer or FEL expression.

```json
// Top-level item — flat key:
{ "component": "TextInput", "bind": "projectName" }

// Nested item — dotted qualified path:
{ "component": "TextInput", "bind": "applicantInfo.orgName" }
```

The `bind` value MUST be a non-empty string. The value MUST correspond
to an item `key` (or a dotted path resolving to a nested item) in the
target Definition. If the key does not resolve to any item in the
Definition, the processor MUST emit a warning and SHOULD hide
the component.

### 4.2 Bind Resolution Rules

The meaning and requirement of `bind` varies by component category:

| Category | `bind` | Behavior |
|----------|--------|----------|
| **Input** | REQUIRED | The component reads and writes the bound item's value. The renderer MUST propagate the item's `required`, `readOnly`, and `relevant` state to the input control. Validation errors for the bound key MUST be displayed adjacent to this component. |
| **Display** | OPTIONAL | When present, the component displays the bound item's current value as read-only content. When absent, the component renders its static `text` prop. |
| **Layout** | FORBIDDEN | Layout components MUST NOT have a `bind` property. If present, processors MUST ignore it and emit a warning. |
| **Container** | FORBIDDEN | Container components MUST NOT have a `bind` property, with the exceptions of **DataTable** (§6.14) and **Accordion** (§6.3), which MAY bind to a repeatable group. |

When an Input component is bound to a field item:

1. **Label:** The renderer MUST display the item's `label`.
2. **Hint:** The renderer SHOULD display the item's `hint` when available.
3. **Required indicator:** The renderer MUST indicate required state when
   the item's Bind `required` expression evaluates to `true`.
4. **Read-only state:** The renderer MUST disable editing when the item's
   Bind `readOnly` expression evaluates to `true` or when the item has
   a `calculate` Bind.
5. **Relevant state:** When the item's Bind `relevant` expression
   evaluates to `false`, the renderer MUST hide the component. This
   operates independently of the component's `when` property (§8.2).
6. **Validation errors:** The renderer MUST display validation results
   (core §5.6) adjacent to the input component that binds the errored key.

### 4.3 Editable Binding Uniqueness

At most **one** editable Input component MAY bind to a given item key.
If two or more editable Input components bind to the same key, the
processor MUST reject the document or emit a warning and bind only the
first occurrence.

Multiple **read-only Display** components MAY bind to the same key.
This is useful for showing a field's value in a summary section while
also rendering an input elsewhere.

Example:

```json
// ✓ VALID — one input + one display for same key
{ "component": "NumberInput", "bind": "totalBudget" }
// ... elsewhere in the tree:
{ "component": "Text", "bind": "totalBudget" }

// ✗ INVALID — two inputs for same key
{ "component": "NumberInput", "bind": "totalBudget" }
{ "component": "Slider", "bind": "totalBudget" }
```

> **Informative note:** This constraint prevents conflicting write
> paths. If a future extension requires multiple input modalities for
> the same field, it should define explicit synchronization semantics.

### 4.4 Repeatable Group Binding

When a component binds to a **repeatable group** item (an item with
`type: "group"` and `minRepeat`/`maxRepeat` in the Definition), the
component acts as a **repeat template**.

The renderer MUST:

1. Render one instance of the component (and its children) for each
   repeat instance in the data.
2. Within each repeat instance, resolve child `bind` values relative
   to the repeat context. Child keys are still flat item keys, but they
   resolve within the current repeat instance.
3. Provide affordances for adding and removing repeat instances, subject
   to `minRepeat` and `maxRepeat` constraints from the Definition.

Repeatable group binding is available on **DataTable** (§6.14), where each
repeat instance becomes a table row, and on **Accordion** (§6.3), where
each repeat instance becomes a collapsible section.

Other layout and container components MUST NOT bind to repeatable groups.
Processors MUST reject such bindings.

### 4.5 Unbound Required Items

A Component Document is NOT required to bind every item in the Definition.
However, the renderer MUST ensure that all **required** items (items
whose Bind `required` evaluates to `true`) are rendered and editable.

For required items that are NOT bound to any Input component in the tree:

1. The renderer MUST render a fallback input for each unbound required
   item.
2. Fallback rendering MUST use Tier 2 theme rules if a Theme Document
   is present, or Tier 1 `presentation` hints otherwise, or renderer
   defaults as a last resort.
3. Fallback inputs MUST be appended **after** the component tree's
   rendered output, in Definition document order.
4. The renderer SHOULD visually distinguish fallback-rendered items
   (e.g., with a "Additional required fields" heading).

For non-required items that are not bound, the renderer MAY omit them
entirely. If the Definition's `relevant` expression for an unbound item
evaluates to `true` and the item is visible, the renderer SHOULD render
it using fallback rules.

### 4.6 Bind/dataType Compatibility Matrix

Each Input component declares which Definition `dataType` values it is
compatible with. Binding a component to an item with an incompatible
`dataType` is a validation error.

| `dataType` | Compatible Input Components |
|---|---|
| `string` | TextInput |
| `decimal` | NumberInput, MoneyInput, Slider, Rating |
| `integer` | NumberInput, MoneyInput, Slider, Rating |
| `boolean` | Toggle |
| `date` | DatePicker |
| `dateTime` | DatePicker |
| `time` | DatePicker |
| `choice` | Select, RadioGroup |
| `multiChoice` | CheckboxGroup, Select |
| `money` | MoneyInput |
| `attachment` | FileUpload, Signature |

Notes:

- **NumberInput** is compatible with `decimal` and `integer` values.
  Authors SHOULD use MoneyInput for Definition items with `money` dataType.
- **Slider** and **Rating** are Progressive components; their fallback
  is NumberInput.
- **RadioGroup** is a Progressive component; its fallback is Select.
- **Select** on a `multiChoice` item MUST set `multiple` to `true` so the
  control stores an array of values (same shape as CheckboxGroup). Using
  Select without `multiple` on `multiChoice` is incompatible with the
  stored value type.
- **Signature** is a Progressive component; its fallback is FileUpload.
- Display components (Text, Heading, etc.) are compatible with any
  `dataType` when used in read-only mode via `bind`.

Processors MUST validate bind/dataType compatibility and MUST reject
or warn on incompatible bindings.

---

## 5. Built-In Components — Core (17)

This section defines the 17 Core components that all conforming
processors MUST support. Components are grouped by category: Layout,
Input, Display, and Container.

For each component, the specification provides:

- **Category** and **Level** classification.
- Whether the component **accepts children**.
- The **bind** requirement (Required, Optional, or Forbidden).
- **Compatible dataTypes** (Input components only).
- A description, props table, rendering requirements, and example.

---

### 5.1 Section

**Category:** Layout
**Level:** Core
**Accepts children:** Yes
**Bind:** Forbidden

#### Description

A top-level page container representing a logical section of a form.
When `formPresentation.pageMode` is `"wizard"` or `"tabs"`, Sections define
the navigation steps or tab panels. Sections MAY also be used standalone
within a Stack for single-page sectioned forms.

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `title` | string | — | No | Section heading displayed at the top of the section. |
| `description` | string | — | No | Subtitle or description text rendered below the title. |
| `padding` | string \| number | — | Yes | Inner spacing for the Section surface. |
| `background` | string \| number | — | Yes | Background token or renderer value. |
| `border` | string \| number | — | Yes | Border token or renderer value. |
| `radius` | string \| number | — | Yes | Corner radius token or renderer value. |
| `elevation` | string \| number | — | Yes | Elevation token or renderer value. |

#### Rendering Requirements

- MUST render as a block-level section element (e.g., `<section>` or
  equivalent).
- When `title` is present, MUST render it as a heading element.
- When `formPresentation.pageMode` is `"wizard"`, the Section MUST be
  shown/hidden according to the current step navigation state.
- MUST render children in array order within the section.

#### Example

```json
{
  "component": "Section",
  "title": "Project Information",
  "description": "Enter basic details about your project.",
  "children": [
    { "component": "TextInput", "bind": "projectName" },
    { "component": "TextInput", "bind": "projectCode" }
  ]
}
```

---

### 5.2 Stack

**Category:** Layout
**Level:** Core
**Accepts children:** Yes
**Bind:** Forbidden

#### Description

A flexbox-style stacking container that arranges its children in a
vertical or horizontal sequence. Stack is the most common layout
primitive and is typically used as the root component.

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `direction` | string | `"vertical"` | No | Stack direction. MUST be one of `"vertical"` or `"horizontal"`. |
| `gap` | string \| number | `0` | Yes | Spacing between children. String values (e.g., `"16px"`, `"$token.spacing.md"`) or numeric pixel values. |
| `align` | string | `"stretch"` | No | Cross-axis alignment. MUST be one of `"start"`, `"center"`, `"end"`, `"stretch"`. |
| `justify` | string | `"start"` | No | Main-axis distribution. MUST be one of `"start"`, `"center"`, `"end"`, `"between"`, `"around"`, or `"evenly"`. Renderers map the distribution tokens to CSS justify-content values such as `space-between`, `space-around`, and `space-evenly`. |
| `wrap` | boolean | `false` | No | Whether children wrap to the next line when `direction` is `"horizontal"`. |
| `padding` | string \| number | — | Yes | Inner spacing for the Stack surface. |
| `background` | string \| number | — | Yes | Background token or renderer value. |
| `border` | string \| number | — | Yes | Border token or renderer value. |
| `radius` | string \| number | — | Yes | Corner radius token or renderer value. |
| `elevation` | string \| number | — | Yes | Elevation token or renderer value. |

#### Rendering Requirements

- MUST render as a flex container with the specified direction.
- MUST apply `gap` between adjacent visible children.
- MUST apply `align` to the cross-axis.
- When `wrap` is `true` and direction is horizontal, children MUST
  wrap to new rows when they exceed container width.

#### Example

```json
{
  "component": "Stack",
  "direction": "vertical",
  "gap": "$token.spacing.md",
  "children": [
    { "component": "TextInput", "bind": "firstName" },
    { "component": "TextInput", "bind": "lastName" }
  ]
}
```

---

### 5.3 Grid

**Category:** Layout
**Level:** Core
**Accepts children:** Yes
**Bind:** Forbidden

#### Description

A multi-column grid layout that distributes children across columns.
Children are placed in source order, wrapping to new rows as needed.

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `columns` | integer \| string \| array | `2` | Yes | Number of columns, a CSS grid-template-columns string, or an array of track values (numeric entries normalize to `fr`). |
| `gap` | string \| number | `0` | Yes | Spacing between grid cells. |
| `rowGap` | string \| number | (inherits `gap`) | Yes | Vertical spacing between rows, if different from `gap`. |
| `padding` | string \| number | — | Yes | Inner spacing for the Grid surface. |
| `background` | string \| number | — | Yes | Background token or renderer value. |
| `border` | string \| number | — | Yes | Border token or renderer value. |
| `radius` | string \| number | — | Yes | Corner radius token or renderer value. |
| `elevation` | string \| number | — | Yes | Elevation token or renderer value. |

#### Rendering Requirements

- MUST render as a grid container with the specified column count
  or template.
- MUST distribute children into cells in source order, left-to-right
  then top-to-bottom (for LTR locales).
- MUST apply gap spacing between cells.

#### Example

```json
{
  "component": "Grid",
  "columns": 3,
  "gap": "$token.spacing.md",
  "children": [
    { "component": "TextInput", "bind": "firstName" },
    { "component": "TextInput", "bind": "middleName" },
    { "component": "TextInput", "bind": "lastName" }
  ]
}
```

---

### 5.4 \[Reserved\]

The Wizard component type was removed in favor of
`formPresentation.pageMode: "wizard"` with a `Stack > Section*` tree
structure. See Core §4.1.2 for normative page mode processing
requirements. Wizard-style navigation is now a presentation mode
applied to a Stack of Sections, not a distinct component type.

---

### 5.5 Spacing Model

Spacing is expressed through layout and surface properties, not an empty
spacing component.

- Sibling spacing belongs on `Stack.gap`, `Grid.gap`, or `Grid.rowGap`.
- Inner spacing belongs on visual surface `padding` for `Section`, `Stack`,
  `Grid`, `Card`, and `Panel`.
- Renderers MUST NOT require authors to insert empty components to create
  visual space.

---

### 5.6 TextInput

**Category:** Input
**Level:** Core
**Accepts children:** No
**Bind:** Required
**Compatible dataTypes:** `string`, `number` (as text), `date` (as text), `time` (as text), `dateTime` (as text)

#### Description

A single-line or multi-line text input field. This is the default
input component for string-type fields. When `maxLines` is greater
than 1, the input renders as a multi-line textarea.

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `placeholder` | string | — | No | Placeholder text displayed when the field is empty. |
| `maxLines` | integer | `1` | No | Maximum visible lines. `1` = single-line input, `>1` = multi-line textarea. MUST be ≥ 1. |
| `inputMode` | string | `"text"` | No | Input mode hint. One of `"text"`, `"email"`, `"tel"`, `"url"`, `"search"`. |
| `prefix` | string | — | No | Static text rendered before the input (e.g., `"https://"`). |
| `suffix` | string | — | No | Static text rendered after the input (e.g., `".com"`). |
| `variant` | string | `"plain"` | No | Content-type variant. `"plain"` accepts unstyled text. `"richtext"` accepts formatted text with runtime-defined serialization. `"markdown"` accepts Markdown source — portable, diffable, and degrades gracefully to plain text. `"latex"` accepts LaTeX source — authoritative for mathematical and scientific notation; degrades to raw source on renderers without a LaTeX renderer. `"richtext"`, `"markdown"`, and `"latex"` all MUST bind to a `string` or `text` field. |

#### Rendering Requirements

- MUST render as a text input element (`<input type="text">` or
  `<textarea>` for multi-line) when `variant` is `"plain"` (default).
- When `variant` is `"richtext"`, MUST render a content-editable
  rich-text surface capable of round-tripping bold, italic, and link
  formatting through the bound field's serialized string value. The
  on-the-wire serialization is runtime-defined; a registry extension
  MAY pin a canonical format.
- When `variant` is `"markdown"`, MUST render a Markdown-aware surface
  (plain-text editor with preview, or a source-of-truth-Markdown WYSIWYG)
  and store the raw Markdown source in the bound string field. Markdown
  is the preferred variant when the document will be diffed, version-
  controlled, or consumed by non-renderer tooling — the source is plain
  text and degrades gracefully.
- When `variant` is `"latex"`, MUST render a LaTeX-aware surface (source
  editor with an optional rendered preview via a LaTeX engine such as
  KaTeX or MathJax) and store the raw LaTeX source in the bound string
  field. LaTeX is the authoritative variant for mathematical, scientific,
  and typeset-document content; a renderer without a LaTeX engine MUST
  display the raw source rather than silently discard formatting.
- For `"richtext"`, `"markdown"`, and `"latex"`, the bound field's
  `dataType` MUST be `string` or `text` — none of these representations
  is encodable in any other primitive. A non-string bind with any of
  these variants MUST produce a lint error (E804).
- MUST propagate the bound item's `required`, `readOnly`, and
  `relevant` state.
- MUST display validation errors from the bound item.
- MUST apply `inputMode` as an input hint for virtual keyboards.
- When the bound item has a `maxLength` constraint, the renderer
  SHOULD indicate the limit.

#### Example

```json
{
  "component": "TextInput",
  "bind": "email",
  "placeholder": "you@example.com",
  "inputMode": "email"
}
```

```json
{
  "component": "TextInput",
  "bind": "notes",
  "variant": "richtext",
  "maxLines": 8
}
```

```json
{
  "component": "TextInput",
  "bind": "description",
  "variant": "markdown",
  "maxLines": 12,
  "placeholder": "# Heading\n\nWrite in Markdown…"
}
```

```json
{
  "component": "TextInput",
  "bind": "abstractEquation",
  "variant": "latex",
  "maxLines": 6,
  "placeholder": "\\int_0^\\infty e^{-x^2}\\,dx"
}
```

---

### 5.7 NumberInput

**Category:** Input
**Level:** Core
**Accepts children:** No
**Bind:** Required
**Compatible dataTypes:** `integer`, `decimal`

#### Description

A numeric input field with optional step controls. Suitable for
integers, decimals, and monetary values (when paired with prefix/suffix).

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `placeholder` | string | — | No | Placeholder text displayed when the field is empty. |
| `step` | number | `1` | No | Increment/decrement step value. |
| `min` | number | — | No | Minimum allowed value. |
| `max` | number | — | No | Maximum allowed value. |
| `showStepper` | boolean | `false` | No | Whether to show increment/decrement buttons. |
| `locale` | string | — | No | Locale for number formatting (e.g., `"en-US"`). |

#### Rendering Requirements

- MUST render as a numeric input element (`<input type="number">` or
  equivalent).
- MUST reject non-numeric input at the UI level.
- MUST propagate `required`, `readOnly`, and `relevant` from the
  bound item.
- MUST display validation errors from the bound item.
- When `min` or `max` is specified, MUST constrain the stepper
  controls accordingly.

#### Example

```json
{
  "component": "NumberInput",
  "bind": "quantity",
  "placeholder": "0",
  "min": 1,
  "max": 100,
  "step": 1,
  "showStepper": true
}
```

---

### 5.8 DatePicker

**Category:** Input
**Level:** Core
**Accepts children:** No
**Bind:** Required
**Compatible dataTypes:** `date`, `dateTime`, `time`

#### Description

A date, datetime, or time picker control. The picker mode is
automatically determined by the bound item's `dataType`.

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `placeholder` | string | — | No | Placeholder text displayed when the field is empty, when the host platform exposes placeholders for date/time controls. |
| `format` | string | — | No | Display format hint (e.g., `"YYYY-MM-DD"`, `"MM/DD/YYYY"`). Does not affect stored value (always ISO 8601). |
| `minDate` | string | — | No | Earliest selectable date (ISO 8601). |
| `maxDate` | string | — | No | Latest selectable date (ISO 8601). |
| `showTime` | boolean | `false` | No | Whether to include time selection (relevant for `dateTime`). |

#### Rendering Requirements

- MUST render an appropriate picker for the bound dataType:
  - `date` → date picker
  - `dateTime` → date + time picker
  - `time` → time picker
- MUST store values in ISO 8601 format regardless of display format.
- MUST propagate `required`, `readOnly`, and `relevant` state.
- MUST display validation errors.
- When `minDate` or `maxDate` is specified, MUST disable dates
  outside the range.

#### Example

```json
{
  "component": "DatePicker",
  "bind": "startDate",
  "placeholder": "YYYY-MM-DD",
  "format": "MM/DD/YYYY",
  "minDate": "2025-01-01"
}
```

---

### 5.9 Select

**Category:** Input
**Level:** Core
**Accepts children:** No
**Bind:** Required
**Compatible dataTypes:** `choice`, `multiChoice`

#### Description

A single- or multi-select control for choice lists. Options are read from
the bound item's `options` array or `optionSet` reference in the
Definition.

By default (when `searchable` and `multiple` are both false or omitted),
processors SHOULD render a native HTML `<select>` (or platform
equivalent) for a compact dropdown.

When `searchable` is `true` and/or `multiple` is `true`, processors MUST
render an accessible **combobox** pattern: a text field (filter and/or
summary), an associated listbox, and keyboard support consistent with
WAI-ARIA combobox/listbox guidance. For `multiple`, the listbox MUST
allow toggling several options (e.g., checkboxes per row) and MUST store
an array of selected option `value`s in the response data.

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `searchable` | boolean | `false` | No | Use a combobox with optional type-ahead filtering of option labels. When `false` and `multiple` is `false`, a native `<select>` is used. |
| `multiple` | boolean | `false` | No | Allow multiple selections; bind to a `multiChoice` item. Implies a combobox list; combine with `searchable` for filtering. |
| `placeholder` | string | `"Select…"` | No | Placeholder text when no option is selected (or when the closed combobox shows an empty state). |
| `clearable` | boolean | `false` | No | Whether the user can clear the selection (`null` for single; empty array for multiple). |

#### Rendering Requirements

- MUST read options from the bound item's `options` or `optionSet`.
- MUST display the option `label` to the user and store the option
  `value` in the data (single scalar for `choice`; array of values for
  `multiChoice` when `multiple` is `true`).
- MUST propagate `required`, `readOnly`, and `relevant` state.
- MUST display validation errors.
- When `searchable` is `false` and `multiple` is `false`, MUST render a
  single-select dropdown (native `<select>` or equivalent).
- When `searchable` is `true` or `multiple` is `true`, MUST expose a
  combobox (`role="combobox"`) and listbox (`role="listbox"`) with
  `aria-expanded`, `aria-controls`, and `aria-activedescendant` (or
  equivalent) as appropriate; when `multiple` is `true`, the listbox
  MUST set `aria-multiselectable="true"`.
- When `searchable` is `true`, MUST filter visible options by the user's
  typed query using a case-insensitive substring match against each option's
  `label`, its stored `value`, and any strings in the definition option's
  optional `keywords` array (for abbreviations and alternate names).

#### Example

```json
{
  "component": "Select",
  "bind": "department",
  "searchable": true,
  "placeholder": "Choose a department"
}
```

Multi-select combobox:

```json
{
  "component": "Select",
  "bind": "tags",
  "multiple": true,
  "searchable": true,
  "placeholder": "Select tags"
}
```

---

### 5.10 CheckboxGroup

**Category:** Input
**Level:** Core
**Accepts children:** No
**Bind:** Required
**Compatible dataTypes:** `multiChoice`

#### Description

A group of checkboxes for multi-select fields. Options are read from
the bound item's `options` or `optionSet`.

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `columns` | integer | `1` | No | Number of columns to arrange checkboxes in. |
| `selectAll` | boolean | `false` | No | Whether to display a "Select All" control. |

#### Rendering Requirements

- MUST render one checkbox per option.
- MUST allow multiple simultaneous selections.
- MUST store the value as an array of selected option values.
- MUST propagate `required`, `readOnly`, and `relevant` state.
- MUST display validation errors.
- When `selectAll` is `true`, MUST provide a master toggle control.

#### Example

```json
{
  "component": "CheckboxGroup",
  "bind": "interests",
  "columns": 2,
  "selectAll": true
}
```

---

### 5.11 Toggle

**Category:** Input
**Level:** Core
**Accepts children:** No
**Bind:** Required
**Compatible dataTypes:** `boolean`

#### Description

A boolean switch/toggle control. Suitable for yes/no, on/off, or
true/false fields.

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `onLabel` | string | `"On"` | No | Label displayed when the toggle is in the `true` state. |
| `offLabel` | string | `"Off"` | No | Label displayed when the toggle is in the `false` state. |

#### Rendering Requirements

- MUST render as a switch/toggle control (not a checkbox).
- MUST store `true` or `false` in the data.
- MUST propagate `required`, `readOnly`, and `relevant` state.
- MUST display validation errors.
- MUST display the appropriate label (`onLabel`/`offLabel`) for the
  current state.

#### Example

```json
{
  "component": "Toggle",
  "bind": "agreeToTerms",
  "onLabel": "I agree",
  "offLabel": "I do not agree"
}
```

---

### 5.12 FileUpload

**Category:** Input
**Level:** Core
**Accepts children:** No
**Bind:** Required
**Compatible dataTypes:** `attachment`

#### Description

A file upload control for attachment-type fields. Supports single or
multiple file selection with optional type and size constraints.

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `accept` | string | `"*/*"` | No | Accepted MIME types (comma-separated, e.g., `"image/*,application/pdf"`). |
| `maxSize` | integer | — | No | Maximum file size in bytes. |
| `multiple` | boolean | `false` | No | Whether multiple files may be uploaded. |
| `dragDrop` | boolean | `true` | No | Whether to display a drag-and-drop zone. |

#### Rendering Requirements

- MUST render a file selection control.
- MUST filter selectable files by `accept` MIME types when the
  platform supports it.
- MUST validate file size against `maxSize` before upload.
- MUST propagate `required`, `readOnly`, and `relevant` state.
- MUST display validation errors.
- When `multiple` is `true`, MUST allow selection of multiple files.
- MUST display the filename(s) of selected files.

#### Example

```json
{
  "component": "FileUpload",
  "bind": "supportingDocuments",
  "accept": "application/pdf,image/*",
  "maxSize": 10485760,
  "multiple": true
}
```

---

### 5.13 Heading

**Category:** Display
**Level:** Core
**Accepts children:** No
**Bind:** Forbidden

#### Description

A section heading element. Used to structure the visual hierarchy of
the form. Heading is purely presentational and does not bind to data.

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `level` | integer | — (REQUIRED) | No | Heading level, 1–6. MUST correspond to HTML heading semantics (`<h1>`–`<h6>`). |
| `text` | string | — (REQUIRED) | No | The heading text content. |

#### Rendering Requirements

- MUST render as a heading element at the specified level.
- MUST render the `text` content.
- MUST NOT accept a `bind` property. If present, processors MUST
  ignore it.

#### Example

```json
{ "component": "Heading", "level": 2, "text": "Budget Details" }
```

---

### 5.14 Text

**Category:** Display
**Level:** Core
**Accepts children:** No
**Bind:** Optional

#### Description

A block of static or data-bound text. When `bind` is present, displays
the bound item's current value as read-only text. When `bind` is
absent, displays the static `text` prop.

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `text` | string | `""` | No | Static text content. Ignored when `bind` is present. |
| `format` | string | `"plain"` | No | Text format. MUST be one of `"plain"` or `"markdown"`. When `"markdown"`, renderers SHOULD render basic Markdown formatting (bold, italic, links, lists). |

#### Rendering Requirements

- MUST render as a paragraph or inline text element.
- When `bind` is present, MUST display the bound item's formatted
  value. The renderer SHOULD apply appropriate formatting based on
  the item's `dataType` (e.g., date formatting, number formatting).
- When `format` is `"markdown"`, MUST render basic Markdown. Renderers
  MUST sanitize Markdown output to prevent script injection.

#### Example

```json
// Static text
{ "component": "Text", "text": "Please review before submitting.", "format": "markdown" }

// Bound text
{ "component": "Text", "bind": "totalBudget" }
```

---

### 5.15 Divider

**Category:** Display
**Level:** Core
**Accepts children:** No
**Bind:** Forbidden

#### Description

A horizontal rule used to visually separate sections of the form.

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `label` | string | — | No | Optional label text centered on the divider line. |

#### Rendering Requirements

- MUST render as a horizontal rule (`<hr>` or equivalent).
- When `label` is present, MUST display the text centered on or
  adjacent to the rule.
- MUST NOT accept a `bind` property.

#### Example

```json
{ "component": "Divider", "label": "Section Break" }
```

---

### 5.16 Card

**Category:** Container
**Level:** Core
**Accepts children:** Yes
**Bind:** Forbidden

#### Description

A bordered surface that visually groups related content. Cards provide
a visual boundary with optional title and subtitle.

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `title` | string | — | No | Card header title. |
| `subtitle` | string | — | No | Card header subtitle, rendered below the title. |
| `elevation` | string \| number | — | Yes | Elevation token or renderer value. |
| `padding` | string \| number | — | Yes | Inner spacing for the Card surface. |
| `background` | string \| number | — | Yes | Background token or renderer value. |
| `border` | string \| number | — | Yes | Border token or renderer value. |
| `radius` | string \| number | — | Yes | Corner radius token or renderer value. |

#### Rendering Requirements

- MUST render as a visually distinct surface with a border or
  shadow.
- When `title` is present, MUST render a card header.
- MUST render children in array order within the card body.

#### Example

```json
{
  "component": "Card",
  "title": "Contact Information",
  "children": [
    { "component": "TextInput", "bind": "email" },
    { "component": "TextInput", "bind": "phone" }
  ]
}
```

---

### 5.17 Collapsible

**Category:** Container
**Level:** Core
**Accepts children:** Yes
**Bind:** Forbidden

#### Description

An expandable/collapsible section. The user can toggle visibility of
the children. Useful for optional sections or advanced options.

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `title` | string | — (REQUIRED) | No | The collapsible section header. MUST be visible regardless of open/closed state. |
| `defaultOpen` | boolean | `false` | No | Whether the section is initially expanded. |

#### Rendering Requirements

- MUST render a clickable header that toggles child visibility.
- MUST display the `title` in the header.
- When collapsed, children MUST be hidden but MUST remain in the
  DOM/component tree (their bound data is preserved).
- Collapsed children's `relevant` and `when` state MUST still be
  evaluated.
- MUST apply appropriate ARIA attributes (`aria-expanded`, etc.).

#### Example

```json
{
  "component": "Collapsible",
  "title": "Advanced Options",
  "defaultOpen": false,
  "children": [
    { "component": "Toggle", "bind": "enableNotifications" },
    { "component": "Select", "bind": "notificationFrequency" }
  ]
}
```

---

### 5.18 ConditionalGroup

**Category:** Container
**Level:** Core
**Accepts children:** Yes
**Bind:** Forbidden

#### Description

A container whose visibility is controlled by a **required** `when`
expression. Unlike the optional `when` property available on all
components (§8), ConditionalGroup makes the condition its primary
purpose — it exists solely to conditionally show/hide a group of
children.

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `when` | string (FEL) | — (REQUIRED) | No | FEL boolean expression. When `false` or `null`, the group and all children are hidden. **REQUIRED** on ConditionalGroup (unlike optional `when` on other components). |
| `fallback` | string | — | No | Optional text to display when the condition is `false`. |

#### Rendering Requirements

- MUST evaluate the `when` expression against the data tree.
- When the expression evaluates to `true`, MUST render all children.
- When the expression evaluates to `false` or `null`, MUST hide all
  children. If `fallback` text is present, MUST display it in place
  of the hidden children.
- Data-bound children within a hidden ConditionalGroup retain their
  data values (unlike Bind `relevant`, which may clear data).
- A ConditionalGroup without a `when` expression is invalid.
  Processors MUST reject such documents.

#### Example

```json
{
  "component": "ConditionalGroup",
  "when": "$hasEmployer = true",
  "fallback": "Employer details are not required for this application type.",
  "children": [
    { "component": "TextInput", "bind": "employerName" },
    { "component": "TextInput", "bind": "employerAddress" }
  ]
}
```

### 5.19 ActionButton

**Category:** Display
**Level:** Core
**Accepts children:** No
**Bind:** Forbidden

#### Description

An `ActionButton` is a button widget that invokes a named Action on
click. It is the canonical action-trigger widget; there is no
widget-specific notion of "submit". The button's semantics derive
entirely from the resolved Action in the loaded Response Actions
document.

Every `ActionButton` MUST declare `actionRef`. The value MUST be the
`id` of an Action in the Response Actions document loaded for the form.
If no Response Actions document is loaded, or if `actionRef` does not
match any `actions[*].id`, the renderer MUST treat the button as inert
and MUST emit a `COMP-REFERENTIAL-INTEGRITY` finding with severity
`error`, kind `"actionRef"`, the offending node id when available, and
the missing action id. The renderer MUST NOT silently invoke a different
Action or fall through to an implicit default.

`actionRef` is trigger-bound. It MUST appear only on `ActionButton`.
The schema enforces this by declaring `actionRef` only on `ActionButton`
and closing other component definitions. Future trigger widgets MAY
adopt `actionRef` only through a named spec amendment that cites this
resolver contract and extends the schema for that widget.

`ActionButton` has no `bind` relationship. It has no `mode` prop; the
validation profile flows from the resolved Action's `validation` block,
which inherits the Validation Mapping §6 master row for the Action's
intent or explicitly overrides it under the Validation Mapping tuple
predicate. It has no `emitEvent` prop; a renderer dispatches a host
event iff the resolved Action's effect chain declares a `hostEvent`
effect. The widget does not carry validation or event-dispatch policy.

#### Props

| Prop | Type | Default | Required | Description |
|---|---|---|---|---|
| `actionRef` | string | — | Yes | Id of the Action this button invokes. |
| `label` | Locale ref or literal | — | No | Button text. |
| `pendingLabel` | Locale ref or literal | — | No | Label shown while the invocation is in flight. |
| `disableWhenPending` | boolean | `true` | No | When true, button disables during in-flight invocation. |

#### Rendering Requirements

- MUST render as a native button element or equivalent accessible
  interactive control.
- MUST NOT accept a `bind` property.
- On click, MUST resolve `actionRef` to exactly one Response Action and
  invoke it through the Response Actions invocation state machine.
- While the invocation is non-terminal (`created`, `preconditions`,
  `validation`, `blocking-gate`, or `effects-running`; see
  [Response Actions §7](../response-actions/response-actions-spec.md) for
  the invocation state vocabulary):
  - If `disableWhenPending` is `true`, MUST render the button as
    disabled/inert.
  - MUST display `pendingLabel` when present.
- On terminal states (`completed`, `failed`, `blocked`, or `deferred`),
  MUST re-enable the button unless some other host state disables it.
- Repeated clicks are governed by the Response Actions idempotency
  contract; the widget itself does not define duplicate-effect policy.

#### Example

```json
{
  "component": "ActionButton",
  "actionRef": "submit-application",
  "label": { "literal": "Submit Application" },
  "pendingLabel": { "literal": "Submitting…" }
}
```

The referenced Action lives in the Response Actions document:

```json
{
  "id": "submit-application",
  "intent": "submit",
  "effects": [
    { "type": "hostEvent", "eventName": "formspec-submit", "detailRef": "@validation.lastReport" }
  ]
}
```

The `formspec-submit` CustomEvent is dispatched because the Action
declares the `hostEvent` effect; the widget does not need a separate
event flag.

#### Resolver Invariants

The `actionRef` resolver MUST be deterministic, MUST NOT mutate the
Component or Response Actions documents, MUST NOT silently fall back to
another Action, and MUST be one-directional: Component reads Response
Actions, but widget interaction does not modify the Action document.

`COMP-REFERENTIAL-INTEGRITY` is the finding code for `actionRef`
resolution failures. An unresolved `actionRef` with a Response Actions
document present is an `error` finding of kind `"actionRef"` naming the
missing Action id. An `actionRef` with no Response Actions document
loaded is also an `error` finding of kind `"actionRef"` with
`reason: "no-response-actions-document"`. Hosts MUST NOT downgrade
these findings.

---

## 6. Built-In Components — Progressive (16)

This section defines the 16 Progressive components. A **Complete
Conformant** processor MUST support all 16. A **Core Conformant**
processor MUST substitute the specified Core fallback for each
Progressive component and SHOULD emit an informative warning.

Each Progressive component entry includes a **Fallback** line
identifying the Core component that replaces it in Core-level
processors. §6.18 provides a consolidated fallback table.

---

### 6.1 [Reserved]

The former Columns primitive is not part of the canonical v1 vocabulary.
Use `Grid.columns` with an integer, track array, or CSS grid-template
string instead.

---

### 6.2 Tabs

**Category:** Layout
**Level:** Progressive
**Accepts children:** Yes
**Bind:** Forbidden
**Fallback:** Stack (each child preceded by a Heading)

#### Description

A tabbed navigation container. Each direct child represents the
content of one tab. Tab labels are derived from child Section `title`
props or from the `tabLabels` array.

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `placement` | string | `"top"` | No | Tab bar placement. MUST be one of `"top"`, `"right"`, `"bottom"`, or `"left"`. |
| `tabLabels` | array of strings | — | No | Explicit tab labels. When absent, the renderer reads `title` from each child (children SHOULD be Section components). |
| `defaultTab` | integer | `0` | No | Zero-based index of the initially active tab. |

#### Rendering Requirements

- MUST render a tab bar with one tab per direct child.
- MUST show exactly one child's content at a time.
- MUST allow the user to switch tabs by clicking tab labels.
- All children remain mounted; switching tabs changes visibility,
  not lifecycle. Bound data is preserved.

#### Fallback Behavior

Core processors MUST replace Tabs with a **Stack** (direction
`"vertical"`). Each child is preceded by a **Heading** (level 3)
whose text is the corresponding tab label. All children are rendered
visibly in sequence.

#### Example

```json
{
  "component": "Tabs",
  "tabLabels": ["Personal", "Employment", "Review"],
  "children": [
    { "component": "Stack", "children": [
      { "component": "TextInput", "bind": "firstName" },
      { "component": "TextInput", "bind": "lastName" }
    ]},
    { "component": "Stack", "children": [
      { "component": "TextInput", "bind": "employer" }
    ]},
    { "component": "Stack", "children": [
      { "component": "Text", "text": "Please review your information." }
    ]}
  ]
}
```

---

### 6.3 Accordion

**Category:** Layout
**Level:** Progressive
**Accepts children:** Yes
**Bind:** Optional (repeatable group key)
**Fallback:** Stack with Collapsible children

#### Description

A vertical list of collapsible sections where, by default, only one
section is expanded at a time. Each child SHOULD be a component with
a `title` prop (e.g., Section, Card, Collapsible) to serve as the
section header.

When `bind` is provided, it MUST reference a repeatable group item.
Each repeat instance becomes one accordion section. Child `bind`
values resolve relative to the repeat context.

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `allowMultiple` | boolean | `false` | No | Whether multiple sections may be expanded simultaneously. When `false`, expanding one section collapses the others. |
| `defaultOpen` | integer | `0` | No | Zero-based index of the initially expanded section. |
| `labels` | string[] | — | No | Section header labels. `labels[i]` is the summary text for `children[i]`. Falls back to `"Section {i+1}"` when absent. |

#### Rendering Requirements

- MUST render each child as a collapsible panel with a clickable
  header.
- When `allowMultiple` is `false`, MUST enforce mutual exclusion
  (only one open at a time).
- MUST apply appropriate ARIA roles (`role="region"`,
  `aria-expanded`, etc.).

#### Fallback Behavior

Core processors MUST replace Accordion with a **Stack** where each
child is wrapped in a **Collapsible**. The first child's Collapsible
has `defaultOpen: true`; the rest have `defaultOpen: false`.

#### Example

```json
{
  "component": "Accordion",
  "allowMultiple": false,
  "children": [
    { "component": "Section", "title": "Section A", "children": [
      { "component": "TextInput", "bind": "fieldA" }
    ]},
    { "component": "Section", "title": "Section B", "children": [
      { "component": "TextInput", "bind": "fieldB" }
    ]}
  ]
}
```

---

### 6.4 RadioGroup

**Category:** Input
**Level:** Progressive
**Accepts children:** No
**Bind:** Required
**Compatible dataTypes:** `choice`
**Fallback:** Select

#### Description

A group of radio buttons for single-select choice fields. All options
are visible simultaneously, making RadioGroup suitable for short
option lists (typically ≤ 7 items).

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `columns` | integer | `1` | No | Number of columns to arrange radio buttons in. |
| `orientation` | string | `"vertical"` | No | Layout direction. MUST be `"vertical"` or `"horizontal"`. |

#### Rendering Requirements

- MUST render one radio button per option from the bound item's
  `options` or `optionSet`.
- MUST enforce single selection (selecting one deselects others).
- MUST propagate `required`, `readOnly`, and `relevant` state.
- MUST display validation errors.

#### Fallback Behavior

Core processors MUST replace RadioGroup with **Select**. The
`searchable` prop defaults to `false`. The `columns` prop is
discarded.

#### Example

```json
{
  "component": "RadioGroup",
  "bind": "priority",
  "columns": 3,
  "orientation": "horizontal"
}
```

---

### 6.5 MoneyInput

**Category:** Input
**Level:** Progressive
**Accepts children:** No
**Bind:** Required
**Compatible dataTypes:** `integer`, `decimal`, `money`
**Fallback:** NumberInput

#### Description

A currency-aware numeric input that displays a currency symbol and
formatted number. Stores the raw numeric value without currency
formatting.

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `placeholder` | string | — | No | Placeholder text displayed in the amount input when the field is empty. |
| `currency` | string | `"USD"` | No | ISO 4217 currency code (e.g., `"USD"`, `"EUR"`, `"GBP"`). |
| `showCurrency` | boolean | `true` | No | Whether to display the currency symbol. |
| `locale` | string | — | No | Locale for number/currency formatting (e.g., `"en-US"`). |

#### Rendering Requirements

- MUST render a numeric input with the currency symbol.
- MUST format the displayed value according to the locale's
  currency conventions.
- MUST store the raw numeric value (without formatting characters)
  in the data.
- MUST propagate `required`, `readOnly`, and `relevant` state.
- MUST display validation errors.

#### Fallback Behavior

Core processors MUST replace MoneyInput with **NumberInput**. The
currency symbol SHOULD be rendered as a prefix label adjacent to
the input if the bound item has a `prefix` presentation hint.

#### Example

```json
{
  "component": "MoneyInput",
  "bind": "totalBudget",
  "currency": "USD",
  "showCurrency": true,
  "placeholder": "0.00"
}
```

---

### 6.6 Slider

**Category:** Input
**Level:** Progressive
**Accepts children:** No
**Bind:** Required
**Compatible dataTypes:** `integer`, `decimal`
**Fallback:** NumberInput

#### Description

A range slider control for selecting a numeric value within a
continuous range.

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `min` | number | `0` | No | Minimum value. |
| `max` | number | `100` | No | Maximum value. |
| `step` | number | `1` | No | Step increment. |
| `showValue` | boolean | `true` | No | Whether to display the current numeric value adjacent to the slider. |
| `showTicks` | boolean | `false` | No | Whether to display tick marks at step intervals. |

#### Rendering Requirements

- MUST render as a range slider control.
- MUST constrain the value to the `min`–`max` range.
- MUST snap to `step` increments.
- When `showValue` is `true`, MUST display the current value.
- MUST propagate `required`, `readOnly`, and `relevant` state.
- MUST display validation errors.

#### Fallback Behavior

Core processors MUST replace Slider with **NumberInput**. The `min`,
`max`, and `step` props are preserved on the NumberInput.

#### Example

```json
{
  "component": "Slider",
  "bind": "satisfaction",
  "min": 1,
  "max": 10,
  "step": 1,
  "showValue": true
}
```

---

### 6.7 Rating

**Category:** Input
**Level:** Progressive
**Accepts children:** No
**Bind:** Required
**Compatible dataTypes:** `integer`, `decimal`
**Fallback:** NumberInput

#### Description

A star (or icon) rating control for selecting a numeric rating value
within a small range (typically 1–5 or 1–10).

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `max` | integer | `5` | No | Maximum rating value (number of stars/icons). |
| `icon` | string | `"star"` | No | Icon type. Well-known values: `"star"`, `"heart"`, `"circle"`. Renderers MAY support additional icons. |
| `allowHalf` | boolean | `false` | No | Whether half-star values are allowed (stored as decimal, e.g., `3.5`). |

#### Rendering Requirements

- MUST render `max` icon elements.
- MUST allow the user to select a rating by clicking/tapping.
- MUST store the selected integer (or half-integer if `allowHalf`)
  in the data.
- MUST propagate `required`, `readOnly`, and `relevant` state.
- MUST display validation errors.

#### Fallback Behavior

Core processors MUST replace Rating with **NumberInput** with
`min: 1`, `max` preserved, and `step: 1`.

#### Example

```json
{
  "component": "Rating",
  "bind": "serviceRating",
  "max": 5,
  "icon": "star"
}
```

---

### 6.8 Signature

**Category:** Input
**Level:** Progressive
**Accepts children:** No
**Bind:** Required
**Compatible dataTypes:** `attachment`
**Fallback:** FileUpload

#### Description

A signature capture pad that records a drawn signature as an image
attachment.

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `strokeColor` | string | `"#000000"` | Yes | Stroke color for the signature pen. |
| `height` | integer | `150` | No | Height of the signature pad in pixels. |
| `penWidth` | number | `2` | No | Stroke width in pixels. |
| `clearable` | boolean | `true` | No | Whether to show a clear/reset control. |

#### Rendering Requirements

- MUST render a drawable canvas area.
- MUST capture the drawn signature and store it as an attachment
  (image data URL or uploaded file reference).
- MUST provide a "Clear" control to reset the signature.
- MUST propagate `required`, `readOnly`, and `relevant` state.
- MUST display validation errors.

#### Fallback Behavior

Core processors MUST replace Signature with **FileUpload** with
`accept: "image/*"`.

#### Example

```json
{
  "component": "Signature",
  "bind": "approverSignature",
  "strokeColor": "#000",
  "height": 200
}
```

---

### 6.9 Alert

**Category:** Display
**Level:** Progressive
**Accepts children:** No
**Bind:** Forbidden
**Fallback:** Text (with severity prefix)

#### Description

A status message block used for informational banners, warnings,
error summaries, or success messages.

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `severity` | string | — (REQUIRED) | No | Alert severity level. MUST be one of `"info"`, `"success"`, `"warning"`, `"error"`. |
| `text` | string | — (REQUIRED) | No | Alert message text. |
| `dismissible` | boolean | `false` | No | Whether the user can dismiss the alert. |

#### Rendering Requirements

- MUST render with visual styling appropriate to the severity
  (color, icon).
- MUST use an appropriate ARIA role (`role="alert"` for error/warning,
  `role="status"` for info/success).
- MUST display the `text` content.

#### Fallback Behavior

Core processors MUST replace Alert with **Text**. The `text` prop
is prefixed with the severity in brackets: e.g., `"[Warning] "`
- original text.

#### Example

```json
{
  "component": "Alert",
  "severity": "warning",
  "text": "Budget exceeds department limit. Approval required."
}
```

---

### 6.10 Badge

**Category:** Display
**Level:** Progressive
**Accepts children:** No
**Bind:** Forbidden
**Fallback:** Text

#### Description

A small label badge for status indicators, counts, or tags.

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `text` | string | — (REQUIRED) | No | Badge label text. |
| `variant` | string | `"default"` | No | Visual variant. Well-known values: `"default"`, `"primary"`, `"success"`, `"warning"`, `"error"`. |

#### Rendering Requirements

- MUST render as a compact inline label element.
- MUST apply visual styling appropriate to the `variant`.

#### Fallback Behavior

Core processors MUST replace Badge with **Text** using the
same `text` prop.

#### Example

```json
{ "component": "Badge", "text": "Draft", "variant": "warning" }
```

---

### 6.11 ProgressBar

**Category:** Display
**Level:** Progressive
**Accepts children:** No
**Bind:** Optional
**Fallback:** Text (showing "X / Y")

#### Description

A visual progress indicator. When bound, reads the current value
from the data. When unbound, uses the static `value` prop.

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `value` | number | `0` | No | Current progress value. Ignored when `bind` is present. |
| `max` | number | `100` | No | Maximum value (100% completion). |
| `label` | string | — | No | Accessible label for the progress bar. |
| `showPercent` | boolean | `true` | No | Whether to display the percentage text. |

#### Rendering Requirements

- MUST render as a progress bar element (`<progress>` or equivalent).
- MUST compute the fill percentage as `value / max * 100`.
- MUST apply `aria-valuenow`, `aria-valuemin`, and `aria-valuemax`.

#### Fallback Behavior

Core processors MUST replace ProgressBar with **Text** displaying
the progress as text, e.g., `"75 / 100 (75%)"`.

#### Example

```json
{
  "component": "ProgressBar",
  "bind": "completionScore",
  "max": 100,
  "label": "Form completion"
}
```

---

### 6.12 Summary

**Category:** Display
**Level:** Progressive
**Accepts children:** No
**Bind:** Forbidden
**Fallback:** Stack of Text components

#### Description

A key-value summary display that shows multiple field labels and
their current values in a structured list. Useful for review pages.

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `items` | array | — (REQUIRED) | No | Array of summary items. Each element is an object with `label` (string, REQUIRED), `bind` (string, REQUIRED — item key), and optional `optionSet` (string). |

Each item object in the `items` array supports:

| Item Field | Type | Required | Description |
|------------|------|----------|-------------|
| `label` | string | Yes | Display label shown next to the value. |
| `bind` | string | Yes | Path to the field whose value to display. |
| `optionSet` | string | No | Name of an option set defined in the form definition. When present, the raw bound value is resolved to its display label via the named option set. Use for `choice` and `multiChoice` fields. |

#### Rendering Requirements

- MUST render as a definition list, table, or equivalent key-value
  layout.
- For each entry in `items`, MUST display the `label` and the
  current value of the bound item.
- Values MUST be formatted according to the item's `dataType`.
- When `optionSet` is set on an item, renderers MUST look up the
  bound value in the named option set and display the matching
  `label`. If no match is found, the raw value SHOULD be displayed.

#### Fallback Behavior

Core processors MUST replace Summary with a **Stack** containing
one **Text** component per item, with `text` set to
`"<label>: <value>"`.

#### Example

```json
{
  "component": "Summary",
  "items": [
    { "label": "Project Name", "bind": "projectName" },
    { "label": "Total Budget", "bind": "totalBudget" },
    { "label": "Organization Type", "bind": "orgType", "optionSet": "orgTypes" }
  ]
}
```

---

### 6.13 ValidationSummary

**Category:** Display
**Level:** Progressive
**Accepts children:** No
**Bind:** Forbidden
**Fallback:** Alert (severity + message rows shown as warning/error alerts)

#### Description

A validation message panel that surfaces the current form validation
state. Can operate in `"live"` mode (reading continuous engine
state) or `"submit"` mode (reading the latest `formspec-submit`
event detail). Optionally renders jump links that invoke
`focusField(path)` on affected input fields.

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `source` | string | `"live"` | No | Validation source. `"live"` reads continuous engine state; `"submit"` reads the latest `formspec-submit` event detail. |
| `mode` | string | `"continuous"` | No | Validation mode used when `source` is `"live"`. MUST be one of `"continuous"` or `"submit"`. |
| `showFieldErrors` | boolean | `false` | No | Whether to include bind-level field errors in addition to shape-level findings. |
| `jumpLinks` | boolean | `false` | No | Whether to render clickable links or buttons that call `focusField(path)` for jumpable targets. |
| `dedupe` | boolean | `true` | No | Whether duplicate messages (same severity, path, and message) are collapsed into a single row. |

#### Rendering Requirements

- MUST render as a list or panel of validation messages.
- MUST display each finding's severity (error, warning, info) and
  message text.
- When `jumpLinks` is `true` and the finding has a `path`, MUST
  render a clickable control that calls `focusField(path)`.
- When `dedupe` is `true`, MUST collapse duplicate findings before
  rendering.
- When no findings are present, the component SHOULD render nothing
  (empty state) or a brief "No issues" indicator.

**Source: "submit" requires a hostEvent declaration.**
ValidationSummary with `source: "submit"` reads the most recent
`formspec-submit` CustomEvent detail. After Component Action References,
that event is dispatched by an `ActionButton`'s resolved Action via a
`hostEvent` effect; widgets do not dispatch on their own. To receive
submit-event updates, the submit Action MUST declare
`{ "type": "hostEvent", "eventName": "formspec-submit", ... }` in its
effect chain.

#### Fallback Behavior

Core processors MUST replace ValidationSummary with one or more
**Alert** components — one per validation finding, using the
finding's severity as the Alert `variant`.

#### Example

```json
{ "component": "ValidationSummary", "source": "submit", "jumpLinks": true, "showFieldErrors": true }
```

#### Cross-Reference

`ValidationSummary.source` and `mode` map to [Validation Mapping §3 profiles](../core/validation-mapping.md#3-validation-profile): `source: "live"` + `mode: "continuous"` corresponds to profile `live`; `source: "live"` + `mode: "submit"` corresponds to profile `on-submit`; `source: "submit"` is a passive reader of the latest `formspec-submit` event detail. ValidationSummary is a Display component and MUST NOT trigger Action Intents or dispatch host events.

---

### 6.14 DataTable

**Category:** Display
**Level:** Progressive
**Accepts children:** No
**Bind:** Optional (binds to a repeatable group)
**Fallback:** Stack of bound items

#### Description

A tabular display of repeatable group data. Each repeat instance
becomes a row; each column displays a field within the repeat.
DataTable is one of the few non-Layout/Container components that
MAY use `bind` to reference a repeatable group.

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `columns` | array | — (REQUIRED) | No | Array of column definitions. Each element is an object with `header` (string, REQUIRED) and `bind` (string, REQUIRED — item key within the repeat group). |
| `showRowNumbers` | boolean | `false` | No | Whether to display row numbers. |
| `allowAdd` | boolean | `true` | No | Whether to show an "Add row" control. |
| `allowRemove` | boolean | `true` | No | Whether to show per-row "Remove" controls. |

#### Rendering Requirements

- MUST render as an HTML table or equivalent tabular layout.
- MUST create one row per repeat instance.
- MUST render one cell per column definition, displaying the
  value of the bound field within that repeat instance.
- When `allowAdd` is `true`, MUST provide an "Add" affordance,
  subject to `maxRepeat` constraints.
- When `allowRemove` is `true`, MUST provide per-row "Remove"
  affordances, subject to `minRepeat` constraints.

#### Fallback Behavior

Core processors MUST replace DataTable with a **Stack** that repeats
a **Card** for each repeat instance. Within each Card, bound fields
are rendered as TextInput or appropriate Core components.

#### Example

```json
{
  "component": "DataTable",
  "bind": "lineItems",
  "columns": [
    { "header": "Description", "bind": "description" },
    { "header": "Amount", "bind": "amount" },
    { "header": "Category", "bind": "category" }
  ]
}
```

---

### 6.15 Panel

**Category:** Container
**Level:** Progressive
**Accepts children:** Yes
**Bind:** Forbidden
**Fallback:** Card

#### Description

A side panel used for supplementary content, help text,
or contextual actions. Panels may be positioned alongside the main
content.

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `placement` | string | `"left"` | No | Panel placement. MUST be one of `"left"` or `"right"`. |
| `title` | string | — | No | Panel header title. |
| `width` | string | `"300px"` | Yes | Panel width. |
| `padding` | string \| number | — | Yes | Inner spacing for the Panel surface. |
| `background` | string \| number | — | Yes | Background token or renderer value. |
| `border` | string \| number | — | Yes | Border token or renderer value. |
| `radius` | string \| number | — | Yes | Corner radius token or renderer value. |
| `elevation` | string \| number | — | Yes | Elevation token or renderer value. |

#### Rendering Requirements

- MUST render the panel alongside (not within) the main content flow,
  placed according to the `placement` property.
- MUST render children within the panel body.

#### Fallback Behavior

Core processors MUST replace Panel with **Card**. The `title` prop
is preserved. The `placement` and `width` props are discarded.

#### Example

```json
{
  "component": "Panel",
  "placement": "left",
  "title": "Help",
  "width": "280px",
  "children": [
    { "component": "Text", "text": "Need help? Contact support." }
  ]
}
```

---

### 6.16 Modal

**Category:** Container
**Level:** Progressive
**Accepts children:** Yes
**Bind:** Forbidden
**Fallback:** Collapsible

#### Description

A dialog overlay that displays content in a modal window above the
main form. Modals require explicit user action to open and close.

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `title` | string | — (REQUIRED) | No | Modal dialog title. |
| `size` | string | `"md"` | No | Modal size. MUST be one of `"sm"`, `"md"`, `"lg"`, `"xl"`, or `"full"`. |
| `trigger` | string | `"button"` | No | How the modal is triggered. MUST be `"button"` (a dedicated open button) or `"auto"` (opens automatically based on `when`). |
| `triggerLabel` | string | `"Open"` | No | Label for the trigger button when `trigger` is `"button"`. |
| `closable` | boolean | `true` | No | Whether the modal can be dismissed by the user. |

#### Rendering Requirements

- MUST render as a modal dialog with backdrop overlay.
- MUST trap focus within the modal while open.
- MUST provide a close affordance (button, Escape key) when
  `closable` is `true`.
- MUST apply `role="dialog"` and `aria-modal="true"`.
- Content within the modal MUST be interactive (input components
  receive focus and accept input).

#### Fallback Behavior

Core processors MUST replace Modal with **Collapsible**. The `title`
prop is preserved. The modal's content is rendered as the
collapsible body, initially collapsed (`defaultOpen: false`).

#### Example

```json
{
  "component": "Modal",
  "title": "Terms and Conditions",
  "trigger": "button",
  "triggerLabel": "View Terms",
  "children": [
    { "component": "Text", "text": "By submitting this form, you agree to...", "format": "markdown" }
  ]
}
```

---

### 6.17 Popover

**Category:** Container
**Level:** Progressive
**Accepts children:** Yes
**Bind:** Forbidden
**Fallback:** Collapsible

#### Description

A lightweight anchored overlay that shows contextual content when the
trigger is activated.

#### Props

| Prop | Type | Default | Token-able | Description |
|------|------|---------|------------|-------------|
| `triggerBind` | string | — | No | Optional bind key whose current value is shown as the trigger label. |
| `triggerLabel` | string | `"Open"` | No | Fallback trigger label when `triggerBind` has no value. |
| `placement` | string | `"bottom"` | No | Preferred popover placement. MUST be one of `"top"`, `"right"`, `"bottom"`, or `"left"`. |

#### Rendering Requirements

- MUST render a trigger control and a content surface.
- MUST render `children` inside the content surface.
- SHOULD use native popover behavior when available.
- MUST provide a usable toggle fallback when native popover behavior is
  unavailable.

#### Fallback Behavior

Core processors MUST replace Popover with **Collapsible**. The
`triggerLabel` value SHOULD map to Collapsible `title`. The `placement`
property is discarded.

#### Example

```json
{
  "component": "Popover",
  "triggerBind": "projectName",
  "triggerLabel": "Show details",
  "placement": "right",
  "children": [
    { "component": "Text", "text": "Additional context for this field." }
  ]
}
```

---

### 6.18 Fallback Requirements

The normative fallback policy lives in [`specs/ui-policy.json`](../ui-policy.json).
That policy defines each Progressive component's Core fallback plus
component-specific `carry`, `drop`, and `translate` behavior. A Core Conformant
processor MUST apply that policy when it encounters a Progressive component.

Fallback substitution MUST preserve the policy's default preservation set and
MUST apply each component-specific policy entry from the shared artifact.
Those entries define the fallback component, carried props, dropped props, and
translated props. Child components are preserved separately when the fallback
component accepts children, and are recursively processed through the same
fallback policy.

Fallback substitution MUST discard props that have no equivalent on the Core
fallback component. Processors SHOULD emit a warning listing discarded props.
This section intentionally does not restate the per-component table; the shared
policy artifact is the single source of truth.

---

## 7. Custom Components

The custom component mechanism allows authors to define reusable
component subtrees with parameterized interpolation. Custom components
promote consistency and reduce duplication in large component trees.

### 7.1 The components Registry

The top-level `components` property is an object whose keys are custom
component names and whose values are **component template** objects.

Each template object has the following properties:

| Property | Type | Cardinality | Description |
|---|---|---|---|
| `params` | array of strings | **0..1** (OPTIONAL) | Parameter names accepted by this template. Each name MUST match `[a-zA-Z][a-zA-Z0-9_]*`. |
| `tree` | object | **1..1** (REQUIRED) | The component subtree that is instantiated when this custom component is used. |

Custom component names MUST match `[A-Z][a-zA-Z0-9]*` (PascalCase,
starting with uppercase). Names MUST NOT collide with built-in
component names (§5, §6) or reserved Formspec component identifiers
(`Page`, `Columns`, `Spacer`). Reserved identifiers are invalid in v1
and are not aliases for built-in behavior. Names beginning with `x-`
are reserved for custom widget and metadata extensions, not custom
components (§13.3).

Example registry:

```json
{
  "components": {
    "LabeledField": {
      "params": ["field", "label"],
      "tree": {
        "component": "Stack",
        "gap": "$token.spacing.sm",
        "children": [
          { "component": "Heading", "level": 4, "text": "{label}" },
          { "component": "TextInput", "bind": "{field}" }
        ]
      }
    },
    "AddressBlock": {
      "params": ["prefix"],
      "tree": {
        "component": "Card",
        "title": "Address",
        "children": [
          { "component": "TextInput", "bind": "{prefix}Street" },
          { "component": "TextInput", "bind": "{prefix}City" },
          { "component": "TextInput", "bind": "{prefix}State" },
          { "component": "TextInput", "bind": "{prefix}Zip" }
        ]
      }
    }
  }
}
```

### 7.2 {param} Interpolation Grammar (ABNF)

Parameter interpolation uses `{paramName}` syntax within string-valued
props. The following ABNF grammar defines the interpolation syntax:

```abnf
interpolated-string = *( literal-segment / param-ref / escaped-brace )
literal-segment     = 1*( %x00-7A / %x7C-7C / %x7E-10FFFF )  ; any char except { }
param-ref           = "{" param-name "}"
param-name          = ALPHA *( ALPHA / DIGIT / "_" )
escaped-brace       = "{{" / "}}"
```

Rules:

1. `{paramName}` is replaced with the corresponding parameter value
   from the instantiation's `params` object.
2. `{{` produces a literal `{` in the output.
3. `}}` produces a literal `}` in the output.
4. Nesting is NOT allowed: `{outer_{inner}}` is invalid.
5. An unrecognized `{name}` (where `name` is not in the template's
   `params` array) MUST cause a validation error.

Interpolation is permitted in the following prop types ONLY:

| Allowed | Examples |
|---------|----------|
| `bind` | `"bind": "{prefix}Street"` |
| `when` | `"when": "${field} != null"` |
| `text` (on Text, Heading, Alert, Badge) | `"text": "Address for {label}"` |
| `title` (on Section, Card, Collapsible, etc.) | `"title": "{sectionTitle}"` |
| `placeholder` | `"placeholder": "Enter {label}"` |
| `label` (on Divider) | `"label": "{section}"` |
| `fallback` (on ConditionalGroup) | `"fallback": "No {item} available"` |

Interpolation is FORBIDDEN in:

| Forbidden | Reason |
|-----------|--------|
| `component` | Component type switching creates ambiguous trees. |
| `$token.*` references | Token resolution is a separate phase. |
| Numeric props (`min`, `max`, `step`, `columns`, etc.) | Type safety. |
| Boolean props (`searchable`, `showProgress`, etc.) | Type safety. |
| `style` keys or values | Style resolution is a separate phase. |

### 7.3 Instantiation

A custom component is instantiated by using its registry name as the
`component` value and providing parameter values in a `params` object:

```json
{
  "component": "AddressBlock",
  "params": { "prefix": "home" }
}
```

The processor MUST:

1. Look up the component name in the `components` registry.
2. Verify that all declared params have corresponding values in the
   instantiation's `params` object. Missing params MUST cause a
   validation error.
3. Deep-clone the template's `tree`.
4. Replace all `{paramName}` occurrences in allowed string props
   with the corresponding values from `params`.
5. Insert the resolved subtree in place of the custom component
   reference.

Extra params (keys in the instantiation's `params` that are not
declared in the template's `params` array) MUST be ignored. Processors
SHOULD emit a warning.

The instantiation MAY also include `when`, `style`, and `responsive`
props. These are applied to the **root** of the resolved subtree
(merged on top of whatever the template already defines).

### 7.4 Recursion Prohibition and Cycle Detection

Custom component templates MUST NOT reference themselves, directly or
indirectly. A cycle occurs when template A's tree instantiates
template B, and template B's tree instantiates template A (or any
longer chain that forms a loop).

Processors MUST perform static cycle detection at validation time by
building a directed graph of template references and checking for
cycles. Cycle detection MUST be performed regardless of parameter
values — the analysis is structural, not data-dependent.

Documents containing recursive custom components MUST be rejected.

### 7.5 Depth Limits

Custom component nesting (template A instantiates template B which
instantiates template C) SHOULD NOT exceed **3 levels** of custom
component expansion.

The total tree depth (including both built-in and expanded custom
components) SHOULD NOT exceed **20 levels**.

Processors MAY enforce stricter limits. Processors MUST NOT enforce
limits lower than 3 levels of custom nesting or 10 levels of total
tree depth.

---

## 8. Conditional Rendering

The `when` property enables components to be conditionally shown or
hidden based on the current data state, without affecting the data
model.

### 8.1 The when Property

The `when` property is a **FEL boolean expression** (fel-core/specs/fel/fel-grammar.md).
When present on a component:

1. The processor MUST evaluate the expression against the current
   data tree.
2. If the expression evaluates to `true`, the component (and all
   its children) MUST be rendered.
3. If the expression evaluates to `false`, `null`, or any non-boolean
   value, the component (and all its children) MUST be hidden.

The `when` property is OPTIONAL on all components except
**ConditionalGroup** (§5.18), where it is REQUIRED.

Multiple `when` conditions do NOT chain — each component has at most
one `when` expression. To express compound conditions, use FEL
logical operators within the expression:

```json
{ "component": "TextInput", "bind": "spouseName",
  "when": "$maritalStatus = 'married' and $age >= 18" }
```

### 8.2 Distinction from Bind relevant

The `when` property and the Definition Bind's `relevant` expression
serve **different purposes**:

| Aspect | `when` (Component) | `relevant` (Bind) |
|--------|---------------------|--------------------|
| **Scope** | Visual presentation only | Data model inclusion |
| **Data effect** | None — hidden component's bound data is preserved | Non-relevant data MAY be removed from the Instance (per `nonRelevantBehavior`) |
| **Defined in** | Component Document (Tier 3) | Definition (Tier 1, Binds) |
| **Evaluation** | FEL against data tree | FEL against data tree |
| **Override** | Cannot override `relevant` | Cannot be overridden by `when` |

When BOTH `when` and `relevant` apply to the same bound item:

- If `relevant` is `false`, the component is hidden **regardless**
  of `when`. The Bind `relevant` takes precedence.
- If `relevant` is `true` and `when` is `false`, the component is
  hidden but the data remains in the Instance.
- If both are `true`, the component is visible.

### 8.3 FEL Evaluation Context

FEL expressions in `when` ALWAYS resolve against the **data tree**
(the Formspec Instance):

- `$fieldKey` resolves to the current value of the field with that
  key.
- `@index` resolves to the 1-based repeat index when inside a
  repeatable group context.
- `@count` resolves to the total number of repeat instances when
  inside a repeatable group context.
- Standard FEL functions and operators are available.

FEL expressions MUST NOT reference component props, component state,
or presentation-layer values. The evaluation context is strictly the
data model.

### 8.4 Error Handling

When a `when` expression is **malformed** (syntax error, unresolved
function, type error):

1. The processor MUST hide the component (treat as `false`).
2. The processor MUST emit a warning identifying the component and
   the expression error.
3. The processor MUST NOT halt form rendering due to a `when`
   evaluation error.

When a `when` expression references an item key that does not exist
in the Definition:

1. The missing reference evaluates to `null` per FEL semantics.
2. The component is hidden (null → falsy).
3. The processor SHOULD emit a warning.

---

## 9. Responsive Design

The responsive system allows component props to vary by viewport
width, enabling adaptive layouts from a single Component Document.

### 9.1 Breakpoints Declaration

Breakpoints are declared in the top-level `breakpoints` object. Each
key is a breakpoint name; each value is the minimum viewport width in
pixels at which that breakpoint activates.

```json
{
  "breakpoints": {
    "sm": 576,
    "md": 768,
    "lg": 1024,
    "xl": 1280
  }
}
```

Breakpoint names MUST be non-empty strings. Values MUST be
non-negative integers. The same breakpoint format is used in the
Theme Specification (theme-spec §6.4).

When a Component Document and a Theme Document both declare
`breakpoints` for the same Definition, they share a single breakpoint
namespace. Theme breakpoints define the canonical values for shared
names; Component breakpoints MAY add names. Same-name Component and
Theme breakpoints MUST use the same value.

### 9.2 The responsive Property

The `responsive` property on a component object is a JSON object
whose keys are breakpoint names and whose values are **prop override
objects**:

```json
{
  "component": "Grid",
  "columns": 3,
  "gap": "$token.spacing.md",
  "responsive": {
    "sm": { "columns": 1, "gap": "$token.spacing.sm" },
    "md": { "columns": 2 }
  }
}
```

Override objects contain shallow props allowed by the shared responsive policy
in [`specs/ui-policy.json`](../ui-policy.json). The policy defines shared
allowed props, component-specific allowed props, and universal forbidden keys.
The following structural properties MUST NOT appear in responsive overrides:

- `component` — type switching is forbidden (§9.4).
- `bind` — data binding is viewport-independent.
- `when` — conditions are viewport-independent.
- `children` — tree structure is viewport-independent.
- `responsive` — recursive responsive is forbidden.

Allowed responsive props include shared presentation props such as `style`,
`cssClass`, `accessibility`, `layout`, and `hidden`, plus component-specific
props listed in the policy artifact.

### 9.3 Merge Semantics (mobile-first)

Responsive overrides follow a **mobile-first cascade**:

1. **Base props** apply to all viewport widths (including the
   smallest).
2. At each breakpoint (in ascending min-width order), the
   corresponding override object is **shallow-merged** on top of
   the base props.
3. Each override replaces individual props; it does not deep-merge
   nested objects. A `style` override replaces the entire `style`
   object for that breakpoint.

Resolution algorithm:

```
function resolveProps(component, viewportWidth, breakpoints):
  resolved = copy(component.baseProps)

  // Sort breakpoints by minWidth ascending
  sorted = sortByValue(breakpoints)

  for each (name, minWidth) in sorted:
    if viewportWidth >= minWidth:
      if component.responsive[name] exists:
        shallowMerge(resolved, component.responsive[name])

  return resolved
```

Example: with breakpoints `{"sm": 576, "md": 768}` and the Grid
example above, at viewport width 700px:

- Base: `columns: 3, gap: "$token.spacing.md"`
- After `sm` (576 ≤ 700): `columns: 1, gap: "$token.spacing.sm"`
- `md` does not apply (768 > 700)
- Result: `columns: 1, gap: "$token.spacing.sm"`

### 9.4 Structural Constraints

Responsive overrides MUST NOT alter the structural identity of a
component:

1. The `component` type MUST NOT change per breakpoint.
2. The `children` array MUST NOT change per breakpoint (no adding,
   removing, or reordering children).
3. The `bind` property MUST NOT change per breakpoint.

These constraints ensure that the component tree is structurally
stable across all viewport widths. Only **presentational props**
(layout, spacing, visibility hints) may vary.

---

## 10. Theming and Design Tokens

Component Documents support design tokens for visual consistency.
Tokens defined in a Component Document follow the same format as
Tokens in the Theme Specification (theme-spec §3).

### 10.1 The tokens Map

The `tokens` object is a flat key-value map. Keys are dot-delimited
names; values are strings or numbers.

```json
{
  "tokens": {
    "color.primary": "#0057B7",
    "color.error": "#D32F2F",
    "spacing.sm": "8px",
    "spacing.md": "16px",
    "spacing.lg": "24px",
    "border.radius": "6px"
  }
}
```

Token keys MUST be non-empty strings. Token values MUST be strings
or numbers. Tokens MUST NOT contain nested objects, arrays, booleans,
or null.

The token format is identical to theme-spec §3.1. The RECOMMENDED
category prefixes (`color.`, `spacing.`, `typography.`, `border.`,
`elevation.`, `x-`) from theme-spec §3.2 apply here as well.

### 10.2 $token.path References

Tokens are referenced in `style` objects and token-able props using
the `$token.` prefix:

```
$token.<key>
```

Examples:

- `"gap": "$token.spacing.md"` resolves to `"16px"`.
- `"style": { "borderRadius": "$token.border.radius" }` resolves to
  `"6px"`.

The reference syntax is identical to theme-spec §3.3. Token
references MUST NOT be recursive (a token value MUST NOT itself
contain a `$token.` reference).

### 10.3 Cross-Tier Token Cascade

When both a Component Document and a Theme Document define tokens
for the same Definition, the following cascade applies:

| Priority | Source | Description |
|----------|--------|-------------|
| 1 (highest) | Component Document `tokens` | Tier 3 tokens. |
| 2 | Theme Document `tokens` | Tier 2 tokens. |
| 3 (lowest) | Renderer defaults | Platform/implementation defaults. |

Resolution:

1. When a `$token.key` reference is encountered in the Component
   Document, look up `key` in the Component Document's `tokens`.
2. If NOT found, look up `key` in the Theme Document's `tokens`.
3. If NOT found, use the renderer's default value.

This cascade allows Component Documents to override specific theme
tokens while inheriting the rest.

### 10.4 Unresolved Token Handling

When a `$token.` reference cannot be resolved through the cascade
(not found in Component tokens, Theme tokens, or renderer defaults):

1. The processor MUST use a reasonable platform-appropriate default.
2. The processor SHOULD emit a warning identifying the unresolved
   token reference.
3. The processor MUST NOT fail or halt rendering.

### 10.5 CSS Custom Property Emission (Web Renderers)

Web renderers SHOULD emit resolved theme tokens as CSS custom properties
on the form's root container element. The recommended naming convention
is:

```
--formspec-{token-key-with-dots-replaced-by-hyphens}
```

For example, a theme token `color.primary` with value `#005ea2` SHOULD
be emitted as:

```css
--formspec-color-primary: #005ea2;
```

This enables external CSS — including design-system bridge stylesheets
and author-defined overrides — to reference theme tokens without
JavaScript coupling. Bridge CSS can use `var(--formspec-color-primary)`
to stay in sync with the active theme.

Renderers that emit CSS custom properties SHOULD update them when the
theme document changes. When updating properties after a theme change,
renderers SHOULD remove properties from the previous theme that are not
present in the new theme, to prevent stale values from affecting
styling. Renderers MAY also emit tokens from the Component Document's
`tokens` map, with component tokens taking precedence over theme tokens
for identically named properties.

Non-web renderers (PDF, native) MAY ignore this convention entirely.

---

## 11. Cross-Tier Interaction

This section defines how Tier 3 (Component Documents) interacts with
Tier 2 (Themes) and Tier 1 (Definition presentation hints) in a
multi-tier presentation stack.

### 11.1 Tier 1 Fallback for Unbound Items

When an item in the Definition is NOT bound to any component in the
tree, the renderer falls back to lower tiers:

1. **Tier 2 (Theme):** If a Theme Document is present and defines
   a widget/layout for the unbound item (via selectors or per-item
   overrides), use the theme's configuration.
2. **Tier 1 (Definition hints):** If no Theme applies, use the
   item's `presentation` hints (core §4.2.5) to select a widget
   and configure rendering.
3. **Renderer defaults:** If no hints are available, use the
   renderer's default widget for the item's `dataType`.

Fallback rendering for unbound items follows the rules in §4.5.

### 11.2 Tier 2 Token Inheritance

Component Documents inherit tokens from an associated Theme Document.
When a Component Document references `$token.color.primary` and does
NOT define that token in its own `tokens` map, the resolution falls
through to the Theme's `tokens` map (§10.3).

This enables a common pattern: the Theme defines the design system
tokens (colors, spacing, typography), and the Component Document
references them without redeclaring.

A Component Document MAY override specific tokens to customize the
appearance without diverging from the theme entirely.

### 11.3 Precedence: Tier 3 > Tier 2 > Tier 1

The general precedence rule for all presentation decisions:

| Priority | Tier | Effect |
|----------|------|--------|
| 1 (highest) | **Tier 3 — Component Document** | Component tree layout, component selection, style, and tokens override everything below. |
| 2 | **Tier 2 — Theme Document** | Widget configuration, selector cascade, tokens, and page layout apply when not shadowed by Tier 3. Tier 2 tokens are inherited by Tier 3 (§10.3). |
| 3 (lowest) | **Tier 1 — Definition hints** | Inline `presentation` and `formPresentation` hints serve as baseline defaults. |

Specific interactions:

- **Widget selection:** Tier 3 component type overrides Tier 2 widget
  assignment, which overrides Tier 1 `widgetHint`.
- **Label display:** Tier 1 item `label` is the source of truth.
  Context-specific labels use the `labels` map on the Definition item.
- **Layout:** Tier 3 component tree controls the explicit structure it defines.
  Active page source is resolved separately: direct-root Component `Section`
  page units win; otherwise Theme `pages` may provide page layout; otherwise
  renderers generate a Definition-order fallback page.
- **Tokens:** Tier 3 tokens override Tier 2 tokens of the same key;
  unoverridden tokens cascade from Tier 2.
- **Behavioral rules:** `required`, `readOnly`, `relevant`,
  `constraint`, and `calculate` from the Definition are **never**
  overridden by any presentation tier. They always apply.

### 11.4 Partial Component Trees

A Component Document is NOT required to bind every item in the
Definition. A **partial tree** binds only a subset of items. The
remaining items are rendered via the active page source and Tier 2/Tier 1
fallback (§11.1, §4.5).

This enables incremental adoption: an author can create a Component
Document that controls the layout of key sections while allowing
simpler fields to render automatically.

The renderer MUST:

1. Render the component tree's output first.
2. Identify all Definition items not bound in the tree.
3. Resolve active page source as direct-root Component `Section` page units,
   then Theme `pages`, then generated Definition-order fallback.
4. Render unbound visible items using the active page source and fallback rules.
5. Ensure all required items are editable, regardless of whether
   they appear in the tree.

### 11.5 Cross-References to Peer Artifacts

Component nodes MAY carry `unitRef`, `taskRefs`, `conceptRefs`, and
`x-generation` as additive reference metadata. The
[Component Reference Fields](component-reference-fields-spec.md) companion owns
their shapes, resolver algorithm, finding severities, and renderer-ignore
conformance.

These fields read peer artifacts only for authoring, diagnostics, provenance,
and generation metadata. They MUST NOT change Tier 3 precedence, fallback,
layout, widget selection, slot binding, validation, Mapping, Response status,
or action invocation. Default renderers MUST ignore them for runtime output.

---

## 12. Validation and Conformance

This section defines the validation requirements for Component
Documents and the conformance criteria for processors.

### 12.1 Structural Validation (JSON Schema)

A conforming processor MUST validate a Component Document against
the structural rules defined in this specification. These rules MAY
be expressed as a JSON Schema (`component.schema.json`) for tooling
purposes.

Structural validation MUST verify:

1. **Required properties:** `$formspecComponent`, `version`,
   `targetDefinition`, and `tree` are present.
2. **Type correctness:** Each property has the correct JSON type
   (string, object, array, integer, boolean) as specified.
3. **Enum constraints:** Properties with enumerated values
   (`direction`, `align`, `severity`, `placement`, etc.) contain
   valid values.
4. **Component names:** Every `component` value is either a built-in
   name (§5, §6) or a key in the `components` registry.
5. **Children constraints:** Components that do not accept children
   (§3.4) do not have a `children` property.
6. **ConditionalGroup `when`:** ConditionalGroup components include
   a `when` property.
7. **Heading props:** `level` is 1–6 and `text` is present.

Structural validation MUST be performed before referential integrity
checks (§12.2).

### 12.2 Referential Integrity

After structural validation passes, processors MUST verify referential
integrity:

1. **Bind keys:** Every `bind` value MUST correspond to an item `key`
   in the target Definition. Unknown bind keys MUST produce a warning.
   Processors SHOULD reject documents with bind keys that reference
   non-existent items, or MAY treat them as non-fatal warnings.

2. **Token references:** Every `$token.key` reference SHOULD resolve
   to a token in the Component Document's `tokens` map, the Theme
   Document's `tokens` map, or be a well-known renderer default.
   Unresolvable token references MUST produce a warning (§10.4).

3. **Custom component references:** Every `component` value that is
   not a built-in name MUST exist as a key in the `components`
   registry. References to undefined custom components MUST be
   rejected.

4. **Custom component params:** When instantiating a custom component,
   every param declared in the template's `params` array MUST have
   a corresponding entry in the instantiation's `params` object.
   Missing params MUST be rejected.

5. **Summary and DataTable bind refs:** The `bind` values within
   Summary `items` and DataTable `columns` MUST reference valid
   item keys.

6. **Cycle-free custom components:** The custom component dependency
   graph MUST be acyclic (§7.4).

### 12.3 Compatibility Validation

Processors MUST verify that each Input component's bound item has a
compatible `dataType`, per the matrix in §4.6:

1. Look up the bound item's `dataType` in the Definition.
2. Check the component's compatible dataTypes list.
3. If the dataType is NOT in the list, emit a validation error.

Incompatible bindings SHOULD be treated as errors. Processors MAY
continue rendering with a warning, using the component as-is and
relying on the renderer's type coercion, but this behavior is NOT
RECOMMENDED.

### 12.4 Conformance Levels: Core / Complete

A processor declares conformance at one of two levels:

**Core Conformant:**

- MUST parse and validate all Component Document properties defined
  in this specification.
- MUST render all 17 Core components (§5) with full prop support.
- MUST apply fallback substitution (§6.18) for all 16 Progressive
  components.
- MUST support custom component expansion (§7).
- MUST evaluate `when` expressions (§8).
- MUST support `responsive` prop overrides (§9).
- MUST resolve `$token.` references (§10).
- MUST implement bind resolution rules (§4).

**Complete Conformant:**

- MUST satisfy all Core Conformant requirements.
- MUST additionally render all 16 Progressive components (§6)
  natively, without fallback substitution.

Processors SHOULD declare their conformance level in their
documentation.

---

## 13. Complexity Controls

Formspec Component Documents are intentionally constrained to maintain
predictability, portability, and ease of implementation. This section
catalogues excluded features and the guard rails that keep Component
Documents declarative.

### 13.1 Excluded Features

The following features are **explicitly excluded** from this
specification. They MUST NOT be implemented as normative behavior by
conforming processors.

| Excluded Feature | Rationale |
|---|---|
| **Imperative event handlers / scripting** | Component Documents are declarative data, not programs. No `onClick`, `onChange`, or embedded JavaScript/FEL imperative code. |
| **Conditional component type switching** | The `component` prop MUST NOT vary by condition, breakpoint, or parameter. Structural ambiguity prevents static analysis. |
| **Recursive custom components** | Self-referencing templates produce unbounded trees. Prohibited and statically detected (§7.4). |
| **Computed props via FEL** | FEL is used ONLY in `when` conditions and display `text` interpolation. Props like `columns`, `min`, `max` MUST NOT be FEL expressions. |
| **Arbitrary slot projection / transclusion** | Components do not have named slots or content projection beyond `children`. This avoids the complexity of Angular/Vue-style slot APIs. |
| **Animation specifications** | Transitions, keyframes, and timing functions are out of scope. Renderers MAY animate independently. |
| **Server-side data fetching** | Component Documents MUST NOT trigger HTTP requests, API calls, or data loading. All data is provided by the Formspec Instance. |
| **Component inheritance** | No `extends` or prototype-chain mechanism for component types. Use custom components (§7) for reuse. |
| **Dynamic component registration** | The `components` registry is static. Components MUST NOT be added or removed at runtime. |
| **Deep responsive (children swap)** | Responsive overrides MUST NOT alter `children`, `bind`, or `component` type (§9.4). Only presentational props may vary. |

### 13.2 Guard Rails

The following limits protect processors and authors from excessive
complexity:

| Guard Rail | Limit | Enforcement |
|---|---|---|
| **Total tree depth** | SHOULD NOT exceed 20 levels. | Processors MAY reject deeper trees. MUST NOT enforce limits below 10. |
| **Custom component nesting** | SHOULD NOT exceed 3 levels of expansion. | Processors MAY reject deeper nesting. |
| **Single `when` per component** | Each component has at most one `when` expression. | Use FEL `and`/`or` for compound conditions. |
| **String-only params** | Custom component `params` values MUST be strings. | No objects, arrays, numbers, or booleans as param values. |
| **No param interpolation in type names** | `{param}` MUST NOT appear in the `component` property. | Prevents dynamic dispatch. |
| **Flat token map** | Tokens are a single-level key-value map. | No nested token groups or computed tokens. |
| **Editable uniqueness** | At most one editable Input per item key (§4.3). | Prevents conflicting write paths. |
| **Static tree** | The component tree structure is fixed at authoring time. | `when` hides/shows but does not add/remove nodes. |

### 13.3 Extension Mechanism

Vendor-specific or experimental metadata MAY be introduced using the
`x-` prefix convention:

1. **Extension properties:** Top-level properties starting with `x-`
   are reserved for extensions. Processors MUST ignore unrecognized
   `x-` properties.

2. **Custom style keys:** Style object keys starting with `x-` are
   vendor-specific. Processors MUST ignore unrecognized `x-` style
   keys.

4. **Custom token prefixes:** Token keys starting with `x-` follow
   the same convention as theme-spec §3.5.

Extension features MUST NOT be required for correct rendering of
Core or Progressive components. An `x-` feature that is absent or
unsupported MUST NOT cause a processing failure.

---

## Appendix A: Full Example — Budget Form

This appendix is **informative**.

The following Component Document defines a multi-page layout for a
budget submission form. It targets a Definition with items for project
information, budget line items, and approval. Wizard-style navigation
is controlled by `formPresentation.pageMode` in the Definition, not
by the component tree structure.

```json
{
  "$formspecComponent": "1.0",
  "url": "https://agency.gov/forms/budget-2025/components/wizard",
  "version": "1.0.0",
  "name": "budget-wizard",
  "title": "Budget Form — Multi-Section Layout",
  "description": "A three-step wizard-style layout for the annual budget submission form.",
  "targetDefinition": {
    "url": "https://agency.gov/forms/budget-2025",
    "compatibleVersions": ">=1.0.0 <2.0.0"
  },
  "breakpoints": {
    "sm": 576,
    "md": 768,
    "lg": 1024
  },
  "tokens": {
    "color.primary": "#0057B7",
    "color.error": "#D32F2F",
    "color.surface": "#FFFFFF",
    "color.success": "#2E7D32",
    "spacing.sm": "8px",
    "spacing.md": "16px",
    "spacing.lg": "24px",
    "border.radius": "6px",
    "typography.body.family": "Inter, system-ui, sans-serif"
  },
  "components": {
    "AddressBlock": {
      "params": ["prefix", "title"],
      "tree": {
        "component": "Card",
        "title": "{title}",
        "children": [
          { "component": "TextInput", "bind": "{prefix}Street",
            "placeholder": "Street address" },
          {
            "component": "Grid",
            "columns": 3,
            "gap": "$token.spacing.md",
            "responsive": {
              "sm": { "columns": 1 }
            },
            "children": [
              { "component": "TextInput", "bind": "{prefix}City" },
              { "component": "TextInput", "bind": "{prefix}State" },
              { "component": "TextInput", "bind": "{prefix}Zip" }
            ]
          }
        ]
      }
    }
  },
  "tree": {
    "component": "Stack",
    "children": [
      {
        "component": "Section",
        "title": "Project Information",
        "description": "Enter basic details about your project.",
        "children": [
          {
            "component": "Grid",
            "columns": 2,
            "gap": "$token.spacing.md",
            "responsive": {
              "sm": { "columns": 1 }
            },
            "children": [
              { "component": "TextInput", "bind": "projectName" },
              { "component": "TextInput", "bind": "projectCode" }
            ]
          },
          {
            "component": "Grid",
            "columns": 2,
            "gap": "$token.spacing.md",
            "responsive": {
              "sm": { "columns": 1 }
            },
            "children": [
              { "component": "Select", "bind": "department",
                "searchable": true },
              { "component": "Select", "bind": "fiscalYear" }
            ]
          },
          { "component": "TextInput", "bind": "description",
            "maxLines": 4, "placeholder": "Describe the project scope" },
          {
            "component": "AddressBlock",
            "params": { "prefix": "project", "title": "Project Location" }
          }
        ]
      },
      {
        "component": "Section",
        "title": "Budget Details",
        "description": "Add line items and set the total budget.",
        "children": [
          {
            "component": "DataTable",
            "bind": "lineItems",
            "columns": [
              { "header": "Description", "bind": "itemDescription" },
              { "header": "Category", "bind": "itemCategory" },
              { "header": "Amount", "bind": "itemAmount" }
            ]
          },
          { "component": "Divider" },
          {
            "component": "Grid",
            "columns": 2,
            "gap": "$token.spacing.md",
            "responsive": {
              "sm": { "columns": 1 }
            },
            "children": [
              {
                "component": "MoneyInput",
                "bind": "totalBudget",
                "currency": "USD",
                "style": {
                  "background": "#F0F6FF",
                  "borderColor": "$token.color.primary",
                  "borderWidth": "2px"
                }
              },
              {
                "component": "MoneyInput",
                "bind": "contingency",
                "currency": "USD"
              }
            ]
          },
          {
            "component": "Alert",
            "severity": "info",
            "text": "Total budget is automatically calculated from line items.",
            "when": "$totalBudget > 0"
          }
        ]
      },
      {
        "component": "Section",
        "title": "Review & Submit",
        "description": "Review your submission before signing.",
        "children": [
          {
            "component": "Summary",
            "items": [
              { "label": "Project Name", "bind": "projectName" },
              { "label": "Department", "bind": "department" },
              { "label": "Fiscal Year", "bind": "fiscalYear" },
              { "label": "Total Budget", "bind": "totalBudget" },
              { "label": "Contingency", "bind": "contingency" }
            ]
          },
          { "component": "Divider", "label": "Certification" },
          {
            "component": "Toggle",
            "bind": "certify",
            "onLabel": "I certify this information is correct",
            "offLabel": "Not yet certified"
          },
          {
            "component": "ConditionalGroup",
            "when": "$certify = true",
            "fallback": "Please certify the information above to proceed.",
            "children": [
              {
                "component": "Signature",
                "bind": "approverSignature",
                "strokeColor": "#000",
                "height": 150
              }
            ]
          }
        ]
      }
    ]
  }
}
```

This example demonstrates:

- **Stack with three Sections** for multi-page layout (wizard behavior via `formPresentation.pageMode`).
- **Custom component** (`AddressBlock`) for reusable address entry.
- **Responsive Grid** that collapses to single-column on small screens.
- **DataTable** bound to a repeatable group (`lineItems`).
- **Progressive components** (MoneyInput, DataTable, Summary, Alert,
  Signature) with defined Core fallbacks.
- **Conditional rendering** (`when` on Alert and ConditionalGroup).
- **Design tokens** referenced in gap and style properties.
- **Cross-tier token cascade** (component tokens override theme tokens).

---

## Appendix B: Component Quick Reference

This appendix is **normative**.

The following table lists all 33 built-in components with their
classification and key characteristics.

| # | Component | Category | Level | Children | Bind | Description |
|---|-----------|----------|-------|----------|------|-------------|
| 1 | Section | Layout | Core | Yes | Forbidden | Top-level page/section container. |
| 2 | Stack | Layout | Core | Yes | Forbidden | Flexbox vertical/horizontal stacking. |
| 3 | Grid | Layout | Core | Yes | Forbidden | Multi-column grid layout. |
| 4 | TextInput | Input | Core | No | Required | Single/multi-line text input. |
| 5 | NumberInput | Input | Core | No | Required | Numeric input with stepper. |
| 6 | DatePicker | Input | Core | No | Required | Date/time/datetime picker. |
| 7 | Select | Input | Core | No | Required | Native dropdown or combobox; optional multi-select (`multiple`). |
| 8 | CheckboxGroup | Input | Core | No | Required | Multi-select checkboxes. |
| 9 | Toggle | Input | Core | No | Required | Boolean switch. |
| 10 | FileUpload | Input | Core | No | Required | File attachment upload. |
| 11 | Heading | Display | Core | No | Forbidden | Section heading (h1–h6). |
| 12 | Text | Display | Core | No | Optional | Static or data-bound text. |
| 13 | Divider | Display | Core | No | Forbidden | Horizontal rule separator. |
| 14 | ActionButton | Display | Core | No | Forbidden | Action trigger button. |
| 15 | Card | Container | Core | Yes | Forbidden | Bordered surface grouping. |
| 16 | Collapsible | Container | Core | Yes | Forbidden | Expandable/collapsible section. |
| 17 | ConditionalGroup | Container | Core | Yes | Forbidden | Condition-based visibility group. |
| 18 | Tabs | Layout | Progressive | Yes | Forbidden | Tabbed navigation container. |
| 19 | Accordion | Layout | Progressive | Yes | Optional¹ | Collapsible section list. |
| 20 | RadioGroup | Input | Progressive | No | Required | Radio button single-select. |
| 21 | MoneyInput | Input | Progressive | No | Required | Currency-aware numeric input. |
| 22 | Slider | Input | Progressive | No | Required | Range slider control. |
| 23 | Rating | Input | Progressive | No | Required | Star/icon rating control. |
| 24 | Signature | Input | Progressive | No | Required | Drawn signature capture. |
| 25 | Alert | Display | Progressive | No | Forbidden | Status message banner. |
| 26 | Badge | Display | Progressive | No | Forbidden | Compact label badge. |
| 27 | ProgressBar | Display | Progressive | No | Optional | Visual progress indicator. |
| 28 | Summary | Display | Progressive | No | Forbidden | Key-value summary display. |
| 29 | ValidationSummary | Display | Progressive | No | Forbidden | Live or submit validation message panel. |
| 30 | DataTable | Display | Progressive | No | Optional² | Tabular repeatable data. |
| 31 | Panel | Container | Progressive | Yes | Forbidden | Side panel. |
| 32 | Modal | Container | Progressive | Yes | Forbidden | Dialog overlay. |
| 33 | Popover | Container | Progressive | Yes | Forbidden | Anchored contextual overlay. |

¹ Accordion `bind` is optional; when provided it MUST reference a repeatable group key (see §6.3).
² DataTable binds to a repeatable group key, not a field key.

---

## Appendix C: DataType ↔ Component Compatibility

This appendix is **normative**.

The following matrix shows which Input components are compatible with
each Definition `dataType`. A ✓ indicates compatibility. Components
marked (P) are Progressive; all others are Core.

| dataType | TextInput | NumberInput | DatePicker | Select | CheckboxGroup | Toggle | FileUpload | RadioGroup (P) | MoneyInput (P) | Slider (P) | Rating (P) | Signature (P) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `string` | ✓ | | | | | | | | | | | |
| `decimal` | | ✓ | | | | | | | ✓ | ✓ | ✓ | |
| `integer` | | ✓ | | | | | | | ✓ | ✓ | ✓ | |
| `boolean` | | | | | | ✓ | | | | | | |
| `date` | | | ✓ | | | | | | | | | |
| `dateTime` | | | ✓ | | | | | | | | | |
| `time` | | | ✓ | | | | | | | | | |
| `choice` | | | | ✓ | | | | ✓ | | | | |
| `multiChoice` | | | | ✓ | ✓ | | | | | | | |
| `money` | | | | | | | | | ✓ | | | |
| `attachment` | | | | | | | ✓ | | | | | ✓ |

Notes:

- **Display components** (Text, Heading, Summary, etc.) are compatible
  with ALL dataTypes when used in read-only `bind` mode. They are
  omitted from this matrix because they do not perform data editing.
- **MoneyInput** is compatible with `money`, `decimal`, and `integer`.
  Authors SHOULD use MoneyInput when the Definition item models a
  currency amount.
- **TextInput** MAY be used as a universal fallback for any dataType
  in exceptional cases, but processors SHOULD warn about the type
  mismatch.
- **Select** on `multiChoice` MUST use `multiple` so the value is an array;
  otherwise the binding does not match the item's data type.

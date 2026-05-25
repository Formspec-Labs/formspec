---
title: Formspec UI Graph Policy Interface Specification
version: 0.1.0-draft.3
date: 2026-05-25
status: draft
---

# Formspec UI Graph Policy Interface Specification v0.1

**Version:** 0.1.0-draft.3
**Date:** 2026-05-25
**Editors:** Formspec Working Group
**Companion to:** App Manifest, Surface, Locale, Theme, Registry, Module
Resolver, and AppGraphValidator
**Schema:** `schemas/ui-graph-policy.schema.json` (`https://formspec.org/schemas/uiGraphPolicy/0.1`)

---

## Status of This Document

This document is the interface contract for the app-graph UI policy families.
It defines the app-graph policy boundary for Locale ownership, route
accessibility, responsive collapse, and module widget Theme token slots.

The structural source contract is governed by
`schemas/ui-graph-policy.schema.json`
(`https://formspec.org/schemas/uiGraphPolicy/0.1`). This document intentionally
does not define an App Manifest slot, runtime responsive behavior, renderer
behavior, Studio wiring, ModuleResolver token-slot enforcement, or production
`AppGraphValidator` implementation. Generated TypeScript types are published by
`@formspec-org/types` for the structural source contract only. Runtime and
validator behavior land in later implementation gates after the source shape is
stable.

## Bottom Line Up Front

<!-- bluf:start file=ui-graph-policy-spec.bluf.md -->
- UI Graph Policy is a host-loaded app-graph policy artifact for already resolved Surface routes and sibling graph evidence.
- The structural source contract is `schemas/ui-graph-policy.schema.json` with `$formspecUiGraphPolicy="0.1"`.
- This slice does not add an App Manifest slot, ArtifactResolver group, AppGraphValidator enforcement, ModuleResolver token-slot enforcement, renderer behavior, or runtime hidden-state behavior.
- Policy identity comes from the loaded policy handle and `targetSurface`, never from fixture paths, filenames, URL suffixes, route names, or `$wireframeUiPolicy` spike documents.
- The policy boundary covers module Locale key ownership, route-scoped accessibility policy, responsive collapse order over route slots, optional hidden Definition references, and Theme token assignments to module widget token slots.
- Fine-grained actor, route, widget, field, source, operation, and artifact authorization remain outside this contract until a dedicated authorization specification supplies those semantics.
<!-- bluf:end -->

## 1. Purpose and Scope

The v4 spike proved that renderer convention is not enough for route-level UI
invariants. Module-composed app UIs need graph-visible policy for:

- which module owns `$module.*` Locale key prefixes,
- which routes have accessibility/navigation obligations,
- how route slots collapse responsively,
- whether route-local Definition form slots are hidden by policy, and
- whether Theme token assignments target token slots declared by module widgets.

In scope:

- the conceptual UI Graph Policy input boundary,
- target Surface resolution,
- module Locale key ownership,
- route accessibility policy,
- responsive collapse order over Surface route slots,
- optional hidden Definition references for route-local form slots,
- Theme token assignments to module widget token slots,
- imported diagnostic identity for `AppGraphValidator`, and
- explicit separation from `specs/ui-policy.json` and fine-grained
  authorization.

Out of scope:

- adding an App Manifest `uiPolicy` / `uiGraphPolicy` sibling slot,
- promoting `$wireframeUiPolicy` or the spike schema as production API,
- component/widget compatibility and responsive prop allowlists,
- renderer layout algorithms or keyboard implementation details,
- module admission and contribution ownership internals,
- Theme token value cascade,
- Locale fallback and interpolation,
- runtime hidden-state enforcement,
- fine-grained authorization, and
- production consumers or semantic/runtime fixtures.

## 2. Relationship to Existing UI Policy

`specs/ui-policy.json` is the shared machine-readable UI authoring policy
artifact. It owns component and widget vocabulary,
retired names, input compatibility, fallback carry/drop/translate policy,
responsive forbidden and allowed props, breakpoint namespace policy, page
precedence mirror data, attention routing, extension discovery, and token
warning hooks.

UI Graph Policy is separate. It does not replace, fork, or extend
`specs/ui-policy.json`. A future graph validator may use both artifacts in one
report, but they answer different questions:

| Question | Owner |
|---|---|
| Is this Component prop allowed at a breakpoint? | `specs/ui-policy.json` |
| Is this widget name part of the built-in vocabulary? | `specs/ui-policy.json` |
| Does this Surface route have route-level accessibility policy? | UI Graph Policy |
| Does this responsive collapse entry name a real Surface route slot? | UI Graph Policy |
| Does this module Locale key have exactly one module owner? | UI Graph Policy |
| Does this Theme token assignment target a module widget token slot? | UI Graph Policy plus ModuleResolver/Registry evidence |

## 3. Source Shape and Loading

The UI Graph Policy source document is a host-supplied app-graph artifact with
`$formspecUiGraphPolicy: "0.1"`. Its schema is a structural contract only. It
does not prove that referenced routes, slots, Definitions, Locale keys, Theme
tokens, modules, widgets, or token slots exist; those are graph semantics owned
by later AppGraphValidator and ModuleResolver gates.

This v0.1 slice does not add an App Manifest sibling slot or standardize a
report artifact kind. A host MAY provide a loaded policy document as explicit
evidence to a future UI Graph Policy evaluator. Until a future App Manifest
version explicitly names a `uiGraphPolicy` sibling slot, `ArtifactResolver` MUST
NOT discover UI Graph Policy documents from filenames, source paths, URL
suffixes, Surface ids, route names, or the presence of `$wireframeUiPolicy`
spike artifacts.

The schema is closed by default. It intentionally has no authorization fields
and no path-identity fields. Fine-grained actor, route, widget, field, source,
operation, and artifact authorization remain outside this contract until a
dedicated authorization specification supplies those semantics.

### 3.1 Schema Reference

<!-- schema-ref:start id=ui-graph-policy-top-level schema=schemas/ui-graph-policy.schema.json pointers=# -->
<!-- generated:schema-ref id=ui-graph-policy-top-level -->
| Pointer | Field | Type | Required | Notes | Description |
|---|---|---|---|---|---|
| `#/properties/$formspecUiGraphPolicy` | `$formspecUiGraphPolicy` | <code>string</code> | yes | const: <code>"0.1"</code>; critical | UI Graph Policy document version. MUST be '0.1'. |
| `#/properties/description` | `description` | <code>string</code> | no | — | — |
| `#/properties/localeKeyOwners` | `localeKeyOwners` | <code>array</code> | no | — | Module ownership declarations for $module.* Locale key prefixes. Prefix collisions, prefix-to-moduleId matching, and unresolved module ids are semantic app-graph checks, not structural schema checks. |
| `#/properties/routePolicies` | `routePolicies` | <code>array</code> | yes | critical | Route-scoped policy entries keyed by Surface routes[].id. Full route coverage and duplicate route policy checks are semantic app-graph checks. |
| `#/properties/targetSurface` | `targetSurface` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/SurfaceRef</code>; critical | Canonical Surface identity this UI Graph Policy document constrains. |
| `#/properties/theme` | `theme` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/ThemePolicy</code> | — |
| `#/properties/title` | `title` | <code>string</code> | no | — | — |
| `#/properties/version` | `version` | <code>string</code> | yes | pattern: <code>^(0&#124;[1-9][0-9]*)\.(0&#124;[1-9][0-9]*)\.(0&#124;[1-9][0-9]*)(?:-((?:0&#124;[1-9][0-9]*&#124;[0-9]*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0&#124;[1-9][0-9]*&#124;[0-9]*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?&#36;</code> | Version of this UI Graph Policy document. MUST be a strict SemVer 2.0.0 string. |
<!-- schema-ref:end -->

## 4. Conceptual Request

A future UI Graph Policy evaluator consumes already resolved graph evidence. The
minimum conceptual request has these fields:

| Field | Required | Description |
|---|---|---|
| `surface` | yes | Loaded Surface artifact handle. Surface remains source truth for routes and slots. |
| `policy` | yes | Loaded UI Graph Policy document supplied by host evidence. This v0.1 slice does not define an App Manifest loading slot. |
| `locales` | no | Loaded Locale artifact handles whose `strings` maps may contain `$module.*` keys. |
| `theme` | no | Loaded Theme artifact handle whose token assignments or future graph-facing token references are checked. |
| `registry` | no | Registry/module evidence used to resolve module widgets and token-slot declarations. |
| `moduleResolution` | no | `ModuleResolver` result for admitted modules and contribution ownership. |
| `definitions` | no | Loaded Definitions used only for hidden Definition route-policy checks. |
| `support` | yes | Supported policy version, route policy vocabulary, token-slot evidence shape, and diagnostic profile. |

The evaluator MUST NOT fetch artifacts, infer policy from local filenames, or
discover siblings outside host-supplied loaded graph evidence.

## 5. Conceptual Policy Shape

This document names the conceptual fields the structural schema covers. The
names are a stable source target, not a promoted copy of the v4 spike schema.

| Field | Description |
|---|---|
| `targetSurface` | Surface identity the policy applies to. |
| `localeKeyOwners[]` | Module ownership declarations for `$module.*` Locale key prefixes. |
| `routePolicies[]` | One route-scoped policy entry per targeted Surface route. |
| `theme.assignments[]` | Theme token assignments to module widget token slots. |

### 5.1 Target Surface

`targetSurface.url` identifies the Surface document to which the policy applies.
`targetSurface.version`, when present, must be compatible with the loaded
Surface sibling ref.

A policy whose target Surface does not match the loaded Surface is invalid. A
policy MUST NOT define routes or slots. It constrains routes and slots already
declared by Surface.

### 5.2 Locale Key Ownership

Module-contributed Locale string keys use the Locale spec's `$module.<moduleId>.`
prefix family. UI Graph Policy assigns those prefixes to modules:

| Field | Description |
|---|---|
| `keyPrefix` | Prefix beginning with `$module.<moduleId>.` or a stricter subtree under that module prefix. |
| `moduleId` | `x-*` module id that owns the prefix. |

The structural schema enforces the `$module.<x-module>.` prefix family and
`moduleId` shape independently. The cross-field rule that the module segment in
`keyPrefix` matches `moduleId` is an app-graph semantic check.

Rules:

1. Each `keyPrefix` MUST have exactly one owner.
2. A prefix collision across different owners is invalid.
3. The module segment in `keyPrefix` MUST match `moduleId`.
4. `moduleId` MUST resolve through `ModuleResolver` when module evidence is
   supplied.
5. Every loaded Locale string key that starts with `$module.` MUST match one
   declared owner prefix.
6. Locale keys outside `$module.` remain governed by the Locale specification.

UI Graph Policy does not define translation text, fallback cascade,
interpolation, pluralization, or active-locale negotiation.

### 5.3 Route Accessibility Policy

Each target Surface route must have a route policy entry. The accessibility
portion declares graph-visible obligations such as route landmark role and
keyboard navigation requirement. The initial conceptual fields are:

| Field | Description |
|---|---|
| `routeId` | Surface `routes[].id`. |
| `a11y.landmark` | Route-level landmark category, such as `main`, `navigation`, `complementary`, or `region`. |
| `a11y.keyboardNavigation` | Whether route-level keyboard navigation is required by the policy profile. |

Rules:

1. `routeId` MUST resolve to exactly one route in the target Surface.
2. Duplicate route policy entries for the same route are invalid.
3. A support profile MAY require policy coverage for every route in the target
   Surface. The production support profile requires full route coverage.
4. Component-level and widget-level accessibility props remain Component/Theme
   concerns. UI Graph Policy only states route-level graph obligations.

This spec does not define keyboard event handling, focus movement algorithms,
ARIA markup, or renderer implementation.

### 5.4 Responsive Route Policy

Responsive route policy describes collapse order over route slots. The initial
conceptual fields are:

| Field | Description |
|---|---|
| `responsive.minColumns` | Minimum number of route columns or panes the policy profile expects. |
| `responsive.collapseOrder[]` | Ordered Surface slot keys used by the route's responsive collapse policy. |

Rules:

1. Every `collapseOrder[]` entry MUST resolve to a slot key on the named route.
2. Duplicate slot keys in one collapse order are invalid.
3. The order is graph policy, not renderer implementation. It tells validators
   which slot identities matter at responsive boundaries.
4. UI Graph Policy MUST NOT mutate Component `responsive` props, Theme region
   breakpoints, or `specs/ui-policy.json` responsive allowlists.

### 5.5 Hidden Definition References

Route policy may optionally declare Definition refs hidden on a route:

| Field | Description |
|---|---|
| `definitionVisibility.hiddenDefinitionRefs[]` | Definition refs hidden by route policy. |

Rules:

1. Each hidden Definition ref MUST resolve to a loaded Definition.
2. The target route MUST contain a `definition-form` slot for that Definition.
3. Hiding a Definition ref that is not route-local is invalid.
4. Runtime rejection of draft or action state for a hidden Definition slot is a
   later runtime gate. This spec only defines the graph policy invariant.

Hidden Definition refs are not authorization. They describe route visibility and
state availability, not actor permission.

### 5.6 Theme Token Slot Assignments

Theme token slot assignments connect Theme tokens to token slots declared by
module-contributed widgets:

| Field | Description |
|---|---|
| `widgetRef` | Module-contributed widget name resolved through `ModuleResolver` and Registry evidence. |
| `slot` | Token slot declared by that widget's token-slot evidence. |
| `token` | Theme token name or token-category-compatible token reference. |

Rules:

1. `widgetRef` MUST resolve to exactly one admitted module widget contribution.
2. `slot` MUST resolve against the widget's declared token-slot evidence.
3. `token` MUST resolve against the loaded Theme tokens or an admitted
   token-category contribution accepted by the support profile.
4. Assignments to undeclared widget slots are invalid.
5. UI Graph Policy does not define Theme token values, token cascade, or widget
   rendering. Theme and renderer support remain separate.

The exact Registry field for widget token-slot declarations is a support-profile
choice until the Registry schema formally names it. The v4 spike's
`semantics.themeTokenSlots` field is evidence, not production API.

## 6. Diagnostic Import

Future executable `AppGraphValidator` integrations may include UI Graph Policy
diagnostics as cross-artifact diagnostics. The validator report origin profile
admits `ui-graph-policy`, but this document does not require any current
validator to emit these diagnostics:

| Field | Value |
|---|---|
| `origin` | `ui-graph-policy` |
| `phase` | `cross-artifact` |
| policy artifact identity | Future host-loading/source-pointer work; not standardized by this slice. |

Initial diagnostic codes:

| Code | Severity | Meaning |
|---|---|---|
| `UI-POLICY-SURFACE-TARGET` | error | Policy targets a different Surface than the loaded graph. |
| `LOCALE-KEY-OWNER` | error | A `$module.*` Locale key has no declared owner. |
| `LOCALE-KEY-OWNER-COLLISION` | error | One Locale key prefix is claimed by different modules. |
| `UI-POLICY-ROUTE-MISSING` | error | Required route policy coverage is missing for a Surface route. |
| `UI-POLICY-ROUTE-COLLISION` | error | More than one policy entry targets the same route. |
| `UI-POLICY-ROUTE-REF` | error | A route policy references a route absent from the target Surface. |
| `UI-POLICY-RESPONSIVE-SLOT` | error | A responsive collapse entry references a slot absent from the route. |
| `UI-POLICY-HIDDEN-DEFINITION-REF` | error | A hidden Definition ref is not a loaded Definition or is not present as a route-local form slot. |
| `THEME-TOKEN-WIDGET` | error | A Theme token assignment references an unresolved or unadmitted module widget. |
| `THEME-TOKEN-SLOT` | error | A Theme token assignment targets a token slot not declared by the widget. |

Diagnostics MUST preserve the policy source pointer and any related Surface,
Locale, Theme, Registry, or ModuleResolver pointers needed for deterministic
authoring feedback. This v0.1 report-origin slice admits the diagnostic origin
only; it does not add policy loading, executable validator emission, or full
`AppGraphValidationReport` conformance for the semantic fixture corpus.

## 7. Non-Goals and Boundaries

UI Graph Policy MUST NOT:

1. add a production App Manifest slot in this source-shape slice;
2. promote the v4 `$wireframeUiPolicy` discriminator, schema, or fixture files
   as production contract;
3. infer graph policy from local fixture paths, filenames, URL suffixes, or
   route naming conventions;
4. define Surface routes or slots;
5. define Component responsive props or widget compatibility;
6. define Theme token values or renderer cascade behavior;
7. execute Response Actions or mutate runtime state;
8. decide actor, route, widget, field, source, operation, or artifact
   authorization; or
9. replace `ModuleResolver` for module admission or contribution ownership.

Fine-grained authorization remains outside this specification. UI Graph Policy
may later provide route or widget identities as inputs to an authorization
policy, but it does not supply permission semantics.

## 8. Closure Requirements

This v0.1 draft defines the prose interface contract and structural source
schema for the UI graph policy families. Production closure still requires:

1. an App Manifest loading slot or an accepted production host-loading rule,
2. `AppGraphValidator` integration,
3. executable validator conformance over the semantic fixture families,
4. ModuleResolver/Registry token-slot evidence integration,
5. Studio/authoring feedback, and
6. runtime enforcement for hidden Definition state where applicable.

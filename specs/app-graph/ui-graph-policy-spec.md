---
title: Formspec UI Graph Policy
version: 1.0.0-draft.1
date: 2026-05-26
depends_on:
  - specs/app-graph/app-graph-validator-spec.md
  - specs/app-graph/module-resolver-spec.md
  - specs/locale/locale-spec.md
  - specs/bundle/app-manifest-spec.md
  - specs/registry/extension-registry.md
---

# Formspec UI Graph Policy Interface Specification v0.1

**Version:** 0.1.0-draft.4
**Date:** 2026-05-26
**Editors:** Formspec Working Group
**Companion to:** App Manifest, Surface, Locale, Theme, Registry, Module
Resolver, and AppGraphValidator
**Schema:** `schemas/ui-graph-policy.schema.json` (`https://formspec.org/schemas/uiGraphPolicy/0.1`)

---

## Status of This Document

This document is the interface contract for the app-graph UI policy families.
It defines the app-graph policy boundary for Locale ownership, route
accessibility, responsive collapse, and module widget Theme token assignments.

The structural source contract is governed by
`schemas/ui-graph-policy.schema.json`
(`https://formspec.org/schemas/uiGraphPolicy/0.1`). This document intentionally
does not define an App Manifest slot, runtime responsive behavior, Studio
wiring, hidden Definition runtime behavior, or general renderer behavior beyond
the optional web-renderer route-landmark profile in §5.3.1. The shared AppGraphValidator kernel validates
host-supplied UI Graph Policy evidence structurally and reports
`evidenceResults[]`; it also emits the Surface/route, Locale-owner,
Locale-owner ModuleResolver evidence, hidden Definition reference, Theme
widgetRef ModuleResolver evidence, Theme token-slot, loaded Theme
token-reference/category, and custom token-category evidence diagnostics named
in this document.

## Bottom Line Up Front

<!-- bluf:start file=ui-graph-policy-spec.bluf.md -->
- UI Graph Policy is host-supplied app-graph evidence for already resolved Surface routes and sibling graph evidence.
- The structural source contract is `schemas/ui-graph-policy.schema.json` with `$formspecUiGraphPolicy="0.1"`.
- This slice adds host-evidence schema result reporting plus Surface/route, Locale-owner, Locale-owner ModuleResolver evidence, hidden Definition, Theme widgetRef AppGraphValidator enforcement, ModuleResolver token-slot evidence, ModuleResolver token-category evidence, executable Theme token-slot/reference/category/category-evidence checks, and an optional web-renderer route-landmark consumer profile; runtime hidden-state, keyboard behavior, responsive behavior, and broader consumer checks remain later gates.
- Policy identity comes from `document.targetSurface`, never from request handles, fixture paths, filenames, URL suffixes, route names, or `$wireframeUiPolicy` spike documents.
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
- renderer layout algorithms, keyboard implementation details, or ARIA synthesis
  beyond the optional route-root landmark profile in §5.3.1,
- module admission and contribution ownership internals,
- Theme token value cascade,
- Locale fallback and interpolation,
- runtime hidden-state enforcement,
- fine-grained authorization, and
- production consumers or semantic/runtime fixtures beyond the §5.3.1
  route-landmark profile.

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
by AppGraphValidator and later ModuleResolver gates.

This v0.1 slice does not add an App Manifest sibling slot or standardize a
report artifact kind. It defines an accepted host-supplied evidence boundary for
future UI Graph Policy evaluation. Until a future App Manifest version
explicitly names a `uiGraphPolicy` sibling slot, `ArtifactResolver` MUST NOT
discover UI Graph Policy documents from filenames, source paths, URL suffixes,
Surface ids, route names, or the presence of `$wireframeUiPolicy` spike
artifacts.

The schema is closed by default. It intentionally has no authorization fields
and no path-identity fields. Fine-grained actor, route, widget, field, source,
operation, and artifact authorization remain outside this contract until a
dedicated authorization specification supplies those semantics.

### 3.1 Host-Supplied Evidence

Hosts may provide UI Graph Policy documents to future validators as explicit
request evidence:

```json
{
  "hostEvidence": {
    "uiGraphPolicies": [
      {
        "schemaId": "https://formspec.org/schemas/uiGraphPolicy/0.1",
        "source": "host://policy/respondent-ui-policy",
        "document": {
          "$formspecUiGraphPolicy": "0.1"
        }
      }
    ]
  }
}
```

`hostEvidence.uiGraphPolicies[]` is a request evidence collection, not an App
Manifest sibling slot. `schemaId`, `source`, and `document` are required.
`schemaId` MUST be `https://formspec.org/schemas/uiGraphPolicy/0.1`. `source`
is opaque diagnostic evidence; it is not identity authority. Policy identity
comes from `document.targetSurface`, which future validation compares to loaded
Surface evidence.

Host evidence MUST NOT carry `artifactKind`, `ref`, `identity`, `slot`,
path-derived identity fields, App Manifest `uiPolicy` / `uiGraphPolicy` slots,
the `$wireframeUiPolicy` spike discriminator, or ADR 0152 authorization fields.
The shared AppGraphValidator kernel may validate this evidence structurally
through explicit `evidenceSchemaValidators`. Schema diagnostics for this
evidence may point at `artifactSlot: "hostEvidence.uiGraphPolicies[N]"`,
`source`, and an evidence-entry or document-relative `jsonPointer`, but MUST
NOT invent a policy artifact kind. Artifact `schemaValidators` MUST NOT be used
for UI Graph Policy host evidence.

### 3.2 Schema Reference

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

The shared semantic UI Graph Policy checks consume already resolved graph
evidence after host-evidence schema validation succeeds. The minimum conceptual
request has these fields:

| Field | Required | Description |
|---|---|---|
| `surface` | yes | Loaded Surface artifact handle. Surface remains source truth for routes and slots. |
| `policy` | yes | Loaded UI Graph Policy document supplied through `hostEvidence.uiGraphPolicies[]`. This v0.1 slice does not define an App Manifest loading slot. |
| `locales` | no | Loaded Locale artifact handles whose `strings` maps may contain `$module.*` keys. |
| `theme` | no | Loaded Theme artifact handle whose token assignments or graph-facing token references are checked when the policy declares Theme assignments. |
| `registry` | no | Registry/module evidence used by `ModuleResolver` for widget token-slot declarations. |
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
| `a11y.landmarkLabel` | Non-empty accessible name required when `a11y.landmark` is `region`. |
| `a11y.keyboardNavigation` | Graph-visible keyboard-navigation obligation (metadata only for renderers). |

Rules:

1. `routeId` MUST resolve to exactly one route in the target Surface.
2. Duplicate route policy entries for the same route are invalid.
3. A support profile MAY require policy coverage for every route in the target
   Surface. The production support profile requires full route coverage.
4. Component-level and widget-level accessibility props remain Component/Theme
   concerns. UI Graph Policy only states route-level graph obligations.

### 5.3.1 Optional Web-Renderer Route-Landmark Profile

A web renderer MAY actively consume a validated projected route policy by
mapping `a11y.landmark` values `main`, `navigation`, or `complementary` to the
route-root layout container's `role` attribute when the container can carry a
landmark without conflicting with intrinsic widget or dialog semantics. This
profile is intentionally narrow:

1. The renderer MUST consume only a `LayoutNode.uiGraphRoutePolicy` projection
   produced from completed, matching AppGraphValidator evidence.
2. The renderer MUST apply the role only to the route-root layout container
   carrying that projection.
3. The renderer MUST NOT derive route-root roles from raw host evidence,
   filenames, request paths, Surface route names, or unvalidated policy JSON.
4. The renderer MUST NOT infer keyboard behavior, focus movement, responsive
   layout behavior, hidden Definition runtime behavior, authorization, widget
   ARIA, or Component-level accessibility from this profile.
5. Non-layout roots and modal/dialog roots remain metadata-only; the renderer
   MUST NOT add wrappers or override intrinsic widget/dialog roles to satisfy
   this profile.
6. `region` maps only under the named-region profile in §5.3.3.
7. The host/renderer composition MUST avoid duplicate or nested host landmarks;
   if the outer host shell already owns the page `main`, route policy evidence
   can still be exposed as inert metadata or use a non-conflicting landmark.

This profile promotes active consumption of route-level landmark obligations
only. It does not define keyboard event handling, focus movement algorithms,
accessible-name synthesis, general ARIA markup synthesis, or renderer layout
implementation.

### 5.3.2 Keyboard-Navigation Metadata Profile

`a11y.keyboardNavigation: true` is a graph-visible obligation only.

1. Renderers MAY expose the validated projection as inert metadata (for example
   `data-formspec-ui-policy-keyboard-navigation`).
2. Renderers MUST NOT implement focus movement, tabindex inference, or keyboard
   event handling from this field.
3. AppGraphValidator does not prove runtime keyboard behavior; it only validates
   policy shape and host-evidence consistency.

### 5.3.3 Named-Region Profile

When `a11y.landmark` is `region`, `a11y.landmarkLabel` MUST be a non-empty
string. AppGraphValidator emits `UI-POLICY-REGION-LABEL` when the label is
missing or empty.

A web renderer MAY map a validated projection to `role="region"` and
`aria-label` from `landmarkLabel` on the route-root layout container under the
same constraints as §5.3.1:

1. Consume only `LayoutNode.uiGraphRoutePolicy` from completed validation.
2. Apply only on the route-root layout container.
3. Do not derive roles from raw host evidence or unvalidated policy JSON.
4. Non-layout and modal/dialog route roots remain metadata-only even when this
   profile is satisfied.

### 5.3.4 Host-Landmark Scope Profile

Hosts MAY supply reserved page landmarks alongside UI Graph Policy evidence:

```json
{
  "hostEvidence": {
    "hostLandmarks": {
      "reserved": ["main"]
    },
    "uiGraphPolicies": []
  }
}
```

`hostEvidence.hostLandmarks.reserved[]` entries MUST be one of `main`,
`navigation`, or `complementary`.

When the host reserves a landmark, route policy MUST NOT actively map the same
landmark to `role` on the route-root layout container. Projection MAY include
`a11y.landmarkSuppressed: true` so consumers do not re-derive host evidence.

AppGraphValidator emits `UI-POLICY-HOST-LANDMARK-CONFLICT` when a route policy
`a11y.landmark` is in the host reserved set. The diagnostic is cross-artifact,
`origin: ui-graph-policy`, severity `error`, and MUST set report `ok` to false.

`a11y.landmarkSuppressed` on `LayoutNode.uiGraphRoutePolicy` is projection-only
consumer metadata. Planners set it when the same reserved-landmark rule would
apply so renderers avoid duplicate active roles without re-reading host evidence.
It does not override validator authority: publish and other fail-closed paths
MUST gate on completed `AppGraphValidationReport` evidence and treat
`UI-POLICY-HOST-LANDMARK-CONFLICT` as blocking.

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
| `token` | Raw Theme token key, such as `color.accent`; this field does not use `$token.<key>` reference syntax. |

Rules:

1. `widgetRef` MUST resolve to an admitted module widget contribution owned by
   the referenced `moduleId`.
2. `slot` MUST resolve against the widget's declared token-slot evidence.
3. `token` MUST resolve as a raw key in exactly one loaded Theme artifact's
   `tokens` map when token reference checks are executable. Because App
   Manifest `theme` is single-cardinality, zero or multiple loaded Theme handles
   fail closed for assignments that need Theme token evidence.
4. Assignments to undeclared widget slots are invalid.
5. The resolved Theme token's category prefix MUST be accepted by the declared
   widget token slot when token-category checks are executable. A category
   prefix match is exact against each accepted prefix plus a dot: accepted
   category `color` matches token key `color.accent`, and accepted category
   `x-agency` matches `x-agency.seal-color`. `acceptedTokenCategories[]` values
   are category prefixes, not Registry entry names.
6. Built-in platform prefixes are the current Token Registry category set:
   `color`, `font`, `radius`, and `spacing`. Platform prefixes are accepted
   without Registry module contribution evidence.
7. Custom `x-*` category prefixes MUST have exactly one admitted
   `ModuleResolutionReport.tokenCategories[]` entry with the same prefix and
   `status: "admitted"`. Missing, ambiguous, conflicting, or shape-mismatched
   custom category evidence is invalid for graph-visible Theme assignments.
8. Non-platform, non-`x-*` prefixes such as `typography`, `border`, and
   `elevation` remain Theme token-map vocabulary, but they are not valid
   graph-visible widget token-slot prefixes for this UI Graph Policy
   compatibility gate.
9. UI Graph Policy does not define Theme token values, token cascade, or widget
   rendering. Theme and renderer support remain separate.

The Registry field for widget token-slot declarations is
`widgetShape.tokenSlots[]`. `ModuleResolutionReport` may expose normalized
`widgetTokenSlots[]` on resolved widget contributions, with source pointers to
the Registry slot declarations. Processors MUST NOT read the v4 spike
`semantics.themeTokenSlots` field as production authority or report evidence.

The current executable `AppGraphValidator` slice enforces the loaded-evidence
parts of rules 1 through 5. For widget and token-slot evidence, it uses a
completed `ModuleResolutionReport` contribution at consuming site
`ui-graph-policy.theme.assignments.widgetRef` with `expectedCategory: "widget"`
as evidence for the policy `widgetRef`, then checks the assignment `slot`
against the resolved contribution's completed `widgetTokenSlots[]` evidence. If
ModuleResolver is absent, not run, or skipped, the Theme widget and token-slot
checks emit no diagnostic. Theme token-reference checks are Theme-evidence
checks, not ModuleResolver checks: when the policy declares
`theme.assignments[]`, the executable validator requires exactly one loaded
Theme handle and a matching key in that Theme's `tokens` map. It emits
`THEME-TOKEN-REF` when loaded Theme evidence is missing, ambiguous, or missing
the raw token key. It emits `THEME-TOKEN-CATEGORY` only after token reference
resolution, resolved same-module widget evidence, and declared token-slot
evidence; the category check compares the raw token key against the widget slot
`acceptedTokenCategories[]` prefixes using exact `prefix + "."` matching.
If the matching accepted prefix is a platform prefix, the check is complete. If
the matching accepted prefix is a custom `x-*` prefix, the validator then checks
completed `ModuleResolutionReport.tokenCategories[]` evidence for exactly one
admitted matching prefix. It emits `THEME-TOKEN-CATEGORY-REF` when custom
prefix evidence is missing, ambiguous, or not admitted. Optional
`theme.tokenMeta` categories remain metadata and are not authority for this
gate.

### 5.7 Theme Authority by Route Class

Rules 1 through 9 in §5.6 ask whether a Theme token assignment *resolves*. They
never ask who is entitled to repaint what. This section adds that question.

A UI Graph Policy is host evidence. In a white-label deployment the host is the
tenant, so a constraint on tenant theming cannot live in this document — the
constrained party would be able to edit it. The authority lives on the Surface,
which the platform ships and the tenant consumes:
[`surface-spec.md`](../surface/surface-spec.md) §3 Route Class.

**Rule.** A `theme.assignments[]` entry whose `widgetRef` matches a
`module-widget` slot binding on a target-Surface route with `routeClass` in
`{proof, ceremony, verification}` is invalid, and MUST be reported as
`THEME-ROUTE-CLASS`.

The three refusing classes are exactly the surfaces whose rendered appearance a
third party relies on: an issued artifact, the act of signing one, and the
independent check of one. `intake` admits tenant chrome theming; `operation`
carries no substrate trust claim; an unclassified route has stated nothing, so
no rule keyed on a class can fire against it.

**Grain, and a deliberate over-approximation.** `ThemeTokenAssignment` is
`{widgetRef, slot, token}` — it is scoped to a *widget*, not to a route, so it
applies wherever that widget appears. The check is therefore "is this widget
bound on any protected route", not "is this assignment on a protected route". A
widget bound on both an `intake` route and a `proof` route makes the assignment
invalid. That is the safe direction and it is intended: the assignment would in
fact repaint the widget on the proof route. An author who needs the widget
themed in one place and fixed in another declares two widget contributions.
Narrowing this requires route-scoped assignments, which is a UI Graph Policy
schema revision, not a validator change.

**Independence from §5.6.** This check reads only the loaded Surface document
and the policy's assignments. It does not require `ModuleResolutionReport`,
loaded Theme token evidence, or a resolved widget contribution, and it is
emitted independently of `THEME-TOKEN-*`: an assignment that repaints a proof
surface is refused whether or not its token resolves. One assignment may
therefore carry both a `THEME-TOKEN-*` diagnostic and `THEME-ROUTE-CLASS`.

Diagnostic shape: `primarySource` is the policy's
`/theme/assignments/{index}/widgetRef`; `relatedSources` names every protected
Surface slot binding that put the widget there. `details` carries `moduleId`,
`widgetName`, `slot`, `token`, `routeId`, `routeClass`, and
`reason: "tenant-theming-refused-by-route-class"`.

## 6. Diagnostic Import

The shared `AppGraphValidator` emits UI Graph Policy Surface/route,
Locale-owner, Locale-owner ModuleResolver evidence, hidden Definition reference,
and Theme widgetRef ModuleResolver evidence diagnostics as cross-artifact
diagnostics after policy host evidence and loaded artifacts pass source schema
validation. ModuleResolver may now carry Registry token-slot evidence, and the
shared validator emits Theme token-slot diagnostics from that evidence.
ModuleResolver may also carry report-level Registry token-category evidence,
and the shared validator emits assignment-scoped custom category evidence
diagnostics from that evidence. Runtime hidden-state, Studio, MCP, projection,
and consumer diagnostics remain later gates.

| Field | Value |
|---|---|
| `origin` | `ui-graph-policy` |
| `phase` | `cross-artifact` |
| policy artifact identity | Evidence-only source pointer from `hostEvidence.uiGraphPolicies[N]`; never an App Manifest artifact kind, ref, or path-derived identity. |

Initial diagnostic codes:

| Code | Severity | Meaning |
|---|---|---|
| `UI-POLICY-SURFACE-TARGET` | error | Policy targets a different Surface than the loaded graph. |
| `LOCALE-KEY-OWNER` | error | A `$module.*` Locale key has no declared owner. |
| `LOCALE-KEY-OWNER-COLLISION` | error | One Locale key prefix is claimed by different modules. |
| `LOCALE-KEY-OWNER-MODULE-MISMATCH` | error | A Locale key owner `moduleId` does not match its `$module.*` key prefix segment. |
| `LOCALE-KEY-OWNER-MODULE-REF` | error | A Locale key owner `moduleId` does not resolve to an admitted module in supplied ModuleResolver evidence. |
| `UI-POLICY-ROUTE-MISSING` | error | Required route policy coverage is missing for a Surface route. |
| `UI-POLICY-ROUTE-COLLISION` | error | More than one policy entry targets the same route. |
| `UI-POLICY-ROUTE-REF` | error | A route policy references a route absent from the target Surface. |
| `UI-POLICY-RESPONSIVE-SLOT` | error | A responsive collapse entry references a slot absent from the route. |
| `UI-POLICY-HIDDEN-DEFINITION-REF` | error | A hidden Definition ref is not a loaded Definition or is not present as a route-local form slot. |
| `THEME-TOKEN-WIDGET` | error | A Theme token assignment references an unresolved or unadmitted module widget. |
| `THEME-TOKEN-SLOT` | error | A Theme token assignment targets a token slot not declared by the widget. |
| `THEME-TOKEN-REF` | error | A Theme token assignment references a token absent from loaded Theme token evidence. |
| `THEME-TOKEN-CATEGORY` | error | A Theme token assignment uses a token category not accepted by the declared widget token slot. |
| `THEME-TOKEN-CATEGORY-REF` | error | A Theme token assignment uses an accepted custom `x-*` category prefix without exactly one admitted ModuleResolver token-category evidence entry. |
| `THEME-ROUTE-CLASS` | error | A Theme token assignment targets a widget bound on a Surface route whose `routeClass` refuses tenant theming. |

Current executable diagnostics cover `UI-POLICY-SURFACE-TARGET`,
`UI-POLICY-ROUTE-MISSING`, `UI-POLICY-ROUTE-COLLISION`,
`UI-POLICY-ROUTE-REF`, `UI-POLICY-RESPONSIVE-SLOT`,
`UI-POLICY-HIDDEN-DEFINITION-REF`, `LOCALE-KEY-OWNER`,
`LOCALE-KEY-OWNER-COLLISION`, `LOCALE-KEY-OWNER-MODULE-MISMATCH`,
`LOCALE-KEY-OWNER-MODULE-REF`, `THEME-TOKEN-WIDGET`, and
`THEME-TOKEN-SLOT`, `THEME-TOKEN-REF`, `THEME-TOKEN-CATEGORY`,
`THEME-TOKEN-CATEGORY-REF`, and `THEME-ROUTE-CLASS`. Policy source
pointers MUST use `artifactSlot: "hostEvidence.uiGraphPolicies[N]"`, opaque
`source`, and `jsonPointer` only. Surface and Locale related sources may use
normal resolved artifact handle pointers. ModuleResolver related sources may
use sanitized module-resolution source pointers that omit resolver-only
`source.module` evidence. The current Locale-owner executable slice checks
loaded Locale `strings` keys with `$module.` prefixes for declared owner prefix
coverage,
checks policy-local owner prefix overlap across different `moduleId` values,
checks that a policy owner `moduleId` matches the module segment in its
`keyPrefix`, and, when a completed `ModuleResolutionReport` is supplied, checks
that each policy owner `moduleId` resolves to an admitted module. The current
Theme executable slice checks `theme.assignments[].widgetRef` against completed
ModuleResolver widget contribution evidence and checks `theme.assignments[].slot`
against that resolved contribution's `widgetTokenSlots[]` evidence. It emits
`THEME-TOKEN-WIDGET` for missing, unadmitted, or wrong-owner widget evidence and
`THEME-TOKEN-SLOT` for slots not declared by the resolved same-module widget
contribution. It does not read Registry directly or consume v4
`semantics.themeTokenSlots`. It emits `THEME-TOKEN-REF` for missing, ambiguous,
or unresolved loaded Theme token evidence and `THEME-TOKEN-CATEGORY` for loaded
Theme token keys that do not match the declared widget token slot's accepted
category prefixes. It emits `THEME-TOKEN-CATEGORY-REF` for accepted custom
`x-*` prefixes when completed ModuleResolver `tokenCategories[]` evidence is
missing, ambiguous, conflicting, or shape-mismatched. It emits
`THEME-ROUTE-CLASS` per §5.7 from the loaded Surface document alone, without
ModuleResolver or Theme token evidence. Runtime hidden-state and authorization
diagnostics are not emitted by this slice.

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
schema for the UI graph policy families. Current `AppGraphValidator` integration
covers host-supplied policy evidence, Surface/route diagnostics, Locale-owner
diagnostics including completed ModuleResolver evidence, hidden Definition
reference diagnostics, Theme widgetRef checks against completed ModuleResolver
contribution evidence, Theme token-slot checks against completed ModuleResolver
`widgetTokenSlots[]` evidence, Studio feedback diagnostics, formspec-web hidden
Definition runtime rejection, the optional web-renderer route-landmark profile
for validated `main`, `navigation`, and `complementary` route-root layout
containers, and the gate 9b profiles in §5.3.2–§5.3.4 (keyboard-navigation
metadata, named `region`, host-landmark scope).

ADR 0153 gates **9a**, **9c**, and **9d** closed at ratification (2026-05-26) with
Wireframes-MCP + conformance corpora (`ui-graph-policy-surface-routes`,
`ui-graph-policy-a11y-profiles`, locale/theme/hidden-definition families). Remaining
work outside this v0.1 contract:

1. focus movement, tabindex inference, and general ARIA synthesis beyond the
   narrow route-root landmark profiles in §5.3.1–§5.3.4,
2. an optional future App Manifest loading slot if the app package contract
   later chooses one (host-evidence model remains default).

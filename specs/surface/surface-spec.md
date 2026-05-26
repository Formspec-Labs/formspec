---
title: Formspec Surface Specification
version: 0.1.0-draft.1
date: 2026-05-24
status: draft
---

# Formspec Surface Specification v0.1

**Version:** 0.1.0-draft.1
**Date:** 2026-05-24
**Editors:** Formspec Working Group
**Companion to:** Formspec v1.0 -- A JSON-Native Declarative Form Standard

---

## Status of This Document

This document is a draft specification for the ADR 0150 Surface composition
primitive. It defines the semantic rules that are not expressible in
`schemas/surface.schema.json`.

## 1. Introduction

A Surface document names routes inside an app and binds slots on those routes.
Slots compose Definition forms, Experience units, module widgets, static
content, and nested route references. Surface is inward composition: it
describes what can be rendered within an app after the app has been selected.

## 2. Surface Document and Authoring Draft

### Published Surface Document

A published Surface document is the schema-valid artifact with
`$formspecSurface`, `id`, `entry`, and `routes[]`. It is source truth for route
ids, URL-style route paths, slot bindings, embed-route edges, and transition
declarations. It is not source truth for Definition validation, Response Actions
execution, Data Sources, Component tree identity, or fine-grained
authorization.

App Manifest `surfaces[]` entries name published Surface documents by sibling
reference. A Surface document MUST NOT use local fixture paths, filenames, URL
suffix conventions, or implicit sibling discovery as identity.

Component 1.2 documents MAY declare `targetSurfaceRoutes[]` entries that point
at a Surface by URL/version, a route by `routes[].id`, and optionally a slot by
the slot's `id` within that route. Surface provides the route and slot namespace
those external Component claims resolve against. Surface does not list mounted
Components, does not own Component membership, and does not make Component
selection decisions. App Manifest `components[]` names Component documents, and
AppGraphValidator resolves Component route targets, duplicate route claims, and
graph-wide node identity.

### Authoring Surface Draft

A Surface draft is authoring state. It MAY be incomplete while an author adds
routes, slots, and transitions. Draft readers MAY expose route-less,
slot-less, unreachable, or otherwise non-publishable state when they also expose
diagnostics.

`readSurfaceDraft` returns an authoring projection plus `publishable` and
diagnostics. Consumers MUST NOT treat a `readSurfaceDraft` value as a published
Surface document unless `publishable` is true or `exportSurfaceDocument`
succeeds.

`exportSurfaceDocument` is the publication gate. It MUST fail closed while the
draft violates the Surface schema shape or Surface-local publishability rules:
missing entry route, empty route set, duplicate route ids, routes without slots,
duplicate slot ids, unresolved embed-route targets, or unreachable routes. The
exported value is a Surface document; the draft store is not bundled into the
App Manifest and does not become artifact identity.

Cross-artifact checks stay outside this local export gate. Definition,
Experience, Response Actions, module contribution, Component, Data Sources, and
authorization resolution are owned by App Manifest resolution and app-graph
validation.

## 3. Route Graph

### Route Graph Reachability

Every route declared in `routes[]` MUST be reachable from the document's
`entry` route. Processors determine reachability by walking:

- each reachable route's `transitions[].to` target, when the target names a
  route in the same Surface, and
- each reachable `embed-route` slot's `binding.routeRef`, when the target names
  a route in the same Surface.

A route that is not reached by this walk is invalid and MUST be reported as
`E606` (`SURFACE-ROUTE-UNREACHABLE`). Producers SHOULD either add a transition
from a reachable route, embed the route via an `embed-route` slot, or remove the
unreachable route.

### Route Parameters

A route MAY declare required route parameters in `routes[].params[]`. These
parameters describe values needed to enter the route, not form fields,
authorization rules, or Data Sources payloads.

Each `routes[].params[]` entry has:

| Field | Required | Description |
|---|---|---|
| `name` | yes | Route parameter name. |
| `type` | yes | Closed v0.1 value type. Only `string` is admitted. |
| `description` | no | Human-readable explanation. |
| `example` | no | Example string value. |

When `params[]` is present, `path` MUST contain a simple URI Template marker for
each parameter using `{name}` syntax. Every `{name}` marker in `path` MUST have
a matching `params[]` declaration. Surface v0.1 uses only simple
single-variable markers; it does not admit URI Template operators, exploded
values, matrix parameters, query parameters, optional segments, regex captures,
or colon-prefixed framework syntax as normative parameter syntax. A `path` with
no `{name}` markers and no `params[]` remains an opaque non-empty route path.

Every Surface-local edge into a parameterized route MUST supply all target route
parameters:

- `transitions[].params` supplies parameters for `transitions[].to`;
- `embed-route.binding.params` supplies parameters for `binding.routeRef`.

Parameter-map keys name the target route's declared parameters. Values are
binding names supplied by the host/runtime context after the transition trigger
or embed decision has been admitted. Surface defines the required key
completeness; it does not define how hosts materialize those values, fetch Data
Sources payloads, or authorize access. Missing target parameters are invalid and
MUST be reported as `E610` (`SURFACE-ROUTE-PARAM-MISSING`).

Data Sources `route-params` sources may expose resolved route parameters to
consumers. They do not declare required route parameters and do not satisfy
Surface edge completeness.

## 4. Slot Bindings

### Slot Binding Validity

An `embed-route` slot's `binding.routeRef` MUST name a route declared in the
same Surface document's `routes[]` array. A missing route target is invalid and
MUST be reported as `E607` (`SURFACE-SLOT-BINDING-UNRESOLVED`).
If the target route declares `params[]`, `binding.params` MUST supply every
declared target parameter per §3 Route Parameters.

Component `targetSurfaceRoutes[].slot`, when present, names a slot `id` on the
target route. That external target does not change the slot's `slotType`, typed
`binding`, renderer hint, or Surface-local E607 behavior.

Cross-document slot bindings, such as `definition-form.binding.definitionRef`
and `experience-unit.binding.unitRef`, are resolved by the app/bundle graph and
are outside this Surface-local rule.

### Module-contributed Slot bindings (E603 admission rule)

When a slot binds via `slotType: "module-widget"`, the binding's `moduleId`
MUST appear in the enclosing document's `modules[]` declaration. Lint code
E603 (`MODULE-ENUM-UNRESOLVED`) walks the substrate for `^x-`-prefixed
values that resolve against module `contributes[]`.

The same rule applies to Experience documents using module-contributed
UnitKind values (e.g. `unit.kind: "x-formspec-presentation-gallery"`): the
declared module's `contributes[]` array MUST include the doc-level value
verbatim. **Convention:** module-contributed Registry entry names for
`^x-` doc-level values are EQUAL TO the doc-level value (no bucket infixes
like `-kind-`); this is the structural-correctness requirement for E603
admission. Bucket infixes (e.g. `-slot-type-`, `-widget-`) are only used
for Registry entry names that are NOT consumed as `^x-` doc-level values
(`slot-type` contributions are looked up by `slotShape.kindValue` not
entry-name; `widget` contributions are looked up by `widgetShape.widgetName`).

### Transition trigger semantics

Per `schemas/surface.schema.json:$defs.Transition.trigger`, a transition's
`trigger` is either: (1) a Response Actions action ID resolved against the
bundle's response-actions document, or (2) a closed-core Response Actions intent
value (`submit`, `save-draft`, `autosave`, `review`, `request-evidence` per
`x-formspec-core-actions`).

Surface only declares the navigation trigger. Response Actions remains the sole
executor for preconditions, validation tuple selection, effects, idempotency,
replay, retry, blocking, and terminal state. A router MAY advance a Surface
transition only after the referenced action or closed-core intent has completed
successfully under Response Actions authority.

If `when` is present, it is an FEL boolean expression evaluated against current
bundle state. The transition fires only when `when` evaluates true. Producers
and authoring facades MAY reject `when` until they can validate the expression
against bundle-state bindings instead of guessing at renderer-local state.

If the target route declares `params[]`, `transitions[].params` MUST supply every
declared target parameter per §3 Route Parameters. Surface does not execute the
trigger or resolve the parameter values; Response Actions remains the trigger's
executor when the trigger references an action or closed-core intent.

## 5. Closed slot-type taxonomy (v0.1)

[ADR 0150 §6.2](../../../thoughts/adr/0150-formspec-as-layered-ui-substrate.md#62-closed-slot-type-taxonomy)
closes the v0.1 slot-type list at five values:

| slotType | Binding shape | Renders |
|---|---|---|
| `definition-form` | `{ definitionRef: string, presentation?: string }` | The bound Definition form. |
| `experience-unit` | `{ experienceRef?: string, unitRef: string }` | A specific Experience unit. |
| `module-widget`   | `{ moduleId: string, widgetName: string, config?: object }` | A widget supplied by a declared module. |
| `static-content`  | `{ kind: heading\|text\|image\|divider, content: string, level?: 1..6 }` | Inline literal content. |
| `embed-route`     | `{ routeRef: string, mode?: string, params?: RouteParamMap }` | Another route from this Surface (modal/panel/dialog). |

`definition-form.binding.definitionRef` is URL-based in v0.1. In bundled
app-graph validation it resolves against App Manifest `definitions[].url` and
the loaded Definition `url`; it is not a Definition `name`, local handle, file
stem, or `identity.id` alias. Any future alias or explicit graph-binding
contract requires a Surface spec/schema revision.

Each binding shape is enforced by `schemas/surface.schema.json` via an
`allOf [if/then]` gate discriminating on `slotType`. The taxonomy is closed at
v0.1; future revisions admit new slot types via the Registry `slot-type`
contribution category per ADR §4.2.

### 5.1 Runtime Route State Ownership

Surface owns the route graph contract: Surface URL/version, route ids, route
paths, required route params, slot ids, transition declarations, and embed-route
edges. A runtime router owns the current route state for a respondent session:
the active Surface route, resolved route params, and any host-local navigation
history. That runtime route state MUST be keyed by Surface identity plus
`routes[].id`; it MUST NOT be keyed only by Definition URL, Component handle, or
renderer-local DOM state.

Surface route state is separate from session, Response, and Response Actions
state. A Surface route may contain zero, one, or more `definition-form` slots,
but each live form instance is still a Response instance owned by the Core
Response contract. A Surface transition may name a Response Action trigger, but
the transition does not execute that action or own its invocation state. A
router MAY advance after the referenced action completes successfully under
Response Actions authority; it MUST NOT infer success from a click, a rendered
button, or a validation summary.

When a route contains multiple `definition-form` slots or a parameterized
route-specific form instance, production hosts MUST keep the route binding,
session actor state, Response instance, and action invocation state explicit.
Until a host can make those bindings explicit, ambiguous submit/navigation
behavior is invalid rather than resolved by Definition-url convention.

## 6. The `surface:<route-id>` URI scheme

[ADR 0150 §7](../../../thoughts/adr/0150-formspec-as-layered-ui-substrate.md#7-surface-and-screener-are-orthogonal)
registers a URI scheme so a Screener terminal-hop target can land inside
Surface composition without merging Surface and Screener identities.

```
surface:<route-id>
```

Where `<route-id>` matches the Surface route id regex
(`^[a-zA-Z][a-zA-Z0-9_-]*$`) and resolves to a `routes[].id` in the bundle's
Surface document. `screener.schema.json:Route.target` documents this scheme as
the fourth target category alongside Definition references (`url|version`),
external URIs (`https://...`), and named outcomes (`outcome:name`).

If the bundle includes multiple Surfaces (`bundle-manifest.surfaces[]`
plural), v0.1 admits the scheme as a bare `surface:<route-id>` — the consumer
resolves the route across all bundled Surfaces; ambiguity (same route-id in
two Surfaces) is a future-revision concern.

The Screener spec retains its freestanding posture per
[`screener-spec.md`](../screener/screener-spec.md) §2.3: no target binding
inside the Screener document itself; the Screener emits a destination URI
string. Surface picks the URI up by scheme inspection at the renderer or
gateway layer.

AppGraphValidator resolution of Screener `surface:<route-id>` targets applies
only when a Screener is explicitly associated with the app graph by an explicit
association contract, such as an App Manifest slot, project binding, or
host-evidence contract defined by its owning spec. Processors MUST NOT infer
that association from filenames, loaded Definitions, TraceIndex, Runtime Plan,
embedded Definition screeners, or ad hoc `hostEvidence`.

## 7. Conformance

A Surface document is conformance-coherent when:

1. Schema validation against `schemas/surface.schema.json` passes.
2. Local publish/export diagnostics report no draft-only conditions such as
   missing entry route, empty route set, duplicate route ids, routes without
   slots, or duplicate slot ids.
3. E606 reports no unreachable routes (every `routes[].id` reachable from
   `entry` via transitions and embed-route bindings).
4. E607 reports no unresolved embed-route bindings (every
   `binding.routeRef` resolves to a `routes[].id` in this Surface).
5. Cross-bundle bindings resolve via the existing bundle-graph passes —
   `definition-form.definitionRef` and `experience-unit.unitRef` /
   `experienceRef` against the bundle manifest;
   `module-widget.moduleId` against the document's `modules[]`
   declaration (E603); `module-widget.config` against the contributing
   module's `widgetShape.props` (E604).
6. Component `targetSurfaceRoutes[]` claims resolve against Surface route and
   slot ids in app-graph validation. Surface-local conformance does not require
   or synthesize Component membership.

A non-form app (a bundle with `definitions: []` and a `surfaces: [...]`
declaring routes with `experience-unit` / `module-widget` /
`static-content` slots) is a valid Formspec app — Surface is the
substrate-identity proof case per ADR §11.1.

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

## 2. Route Graph

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

## 3. Slot Bindings

### Slot Binding Validity

An `embed-route` slot's `binding.routeRef` MUST name a route declared in the
same Surface document's `routes[]` array. A missing route target is invalid and
MUST be reported as `E607` (`SURFACE-SLOT-BINDING-UNRESOLVED`).

Cross-document slot bindings, such as `definition-form.binding.definitionRef`
and `experience-unit.binding.unitRef`, are resolved by the app/bundle graph and
are outside this Surface-local rule.

## 4. Closed slot-type taxonomy (v0.1)

[ADR 0150 §6.2](../../../thoughts/adr/0150-formspec-as-layered-ui-substrate.md#62-closed-slot-type-taxonomy)
closes the v0.1 slot-type list at five values:

| slotType | Binding shape | Renders |
|---|---|---|
| `definition-form` | `{ definitionRef: string, presentation?: string }` | The bound Definition form. |
| `experience-unit` | `{ experienceRef?: string, unitRef: string }` | A specific Experience unit. |
| `module-widget`   | `{ moduleId: string, widgetName: string, config?: object }` | A widget supplied by a declared module. |
| `static-content`  | `{ kind: heading\|text\|image\|divider, content: string, level?: 1..6 }` | Inline literal content. |
| `embed-route`     | `{ routeRef: string, mode?: string }` | Another route from this Surface (modal/panel/dialog). |

Each binding shape is enforced by `schemas/surface.schema.json` via an
`allOf [if/then]` gate discriminating on `slotType`. The taxonomy is closed at
v0.1; future revisions admit new slot types via the Registry `slot-type`
contribution category per ADR §4.2.

## 5. The `surface:<route-id>` URI scheme

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

## 6. Conformance

A Surface document is conformance-coherent when:

1. Schema validation against `schemas/surface.schema.json` passes.
2. E606 reports no unreachable routes (every `routes[].id` reachable from
   `entry` via transitions and embed-route bindings).
3. E607 reports no unresolved embed-route bindings (every
   `binding.routeRef` resolves to a `routes[].id` in this Surface).
4. Cross-bundle bindings resolve via the existing bundle-graph passes —
   `definition-form.definitionRef` and `experience-unit.unitRef` /
   `experienceRef` against the bundle manifest;
   `module-widget.moduleId` against the document's `modules[]`
   declaration (E603); `module-widget.config` against the contributing
   module's `widgetShape.props` (E604).

A non-form app (a bundle with `definitions: []` and a `surfaces: [...]`
declaring routes with `experience-unit` / `module-widget` /
`static-content` slots) is a valid Formspec app — Surface is the
substrate-identity proof case per ADR §11.1.

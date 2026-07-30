---
title: Formspec Surface Specification
version: 0.2.0-draft.1
date: 2026-07-30
depends_on:
  - specs/core/spec.md
  - specs/experience/experience-spec.md
  - specs/component/component-spec.md
  - specs/response-actions/response-actions-spec.md
  - specs/data-sources/data-sources-spec.md
  - specs/registry/extension-registry.md
---

# Formspec Surface Specification v0.2

**Version:** 0.2.0-draft.1
**Date:** 2026-07-30
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
The companion [Surface Shell Specification](surface-shell-spec.md) defines how
a runtime composes, resolves, renders, and diagnoses published Surface
documents.

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
| `type` | yes | Closed v0.2 value type. Only `string` is admitted. |
| `description` | no | Human-readable explanation. |
| `example` | no | Example string value. |

When `params[]` is present, `path` MUST contain a simple URI Template marker for
each parameter using `{name}` syntax. Every `{name}` marker in `path` MUST have
a matching `params[]` declaration. Surface v0.2 uses only simple
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

### Route Class

A route MAY declare `routeClass`, a closed vocabulary naming **what the route
presents**. It is the Surface's answer to a question the route graph could not
previously express: a certificate route and a form route are otherwise
structurally identical documents.

| `routeClass` | The route presents | Distinguishing rule — why the value exists | Tenant chrome theming |
|---|---|---|---|
| `intake` | A Definition-backed capture from a respondent. | The only value that admits tenant chrome theming: admitted here and only here. That sentence is now true of the whole vocabulary — before `operation` flipped to refusing, this spec said it while the enforced rule contradicted it. | **admits** |
| `proof` | An artifact the platform issued that a third party relies on as evidence — receipt, certificate, disclosure. | The artifact is issued by a substrate port and relied on off-platform; its rendered form is part of what is relied on. | refuses |
| `ceremony` | The act of signing or attesting, as it happens. | The signer's preimage **is** the thing signed: the rendering is the evidence, not a view of it. | refuses |
| `verification` | Independent checking of an artifact the platform issued. | Credibility depends on the surface being neither the issuer's nor the tenant's voice. | refuses |
| `attestation` | A claim the platform publishes about itself that a third party relies on — trust center, capability matrix, subprocessor list, data-flow disclosure, status. | The accountable party is the **publisher**, not a port. No port issues the artifact, which is exactly why `proof` cannot absorb it. | refuses |
| `authentication` | A credential exchange binding an actor to an external identity. | The chrome **is** the anti-phishing signal: the appearance is the security control, not a view of one. | refuses |
| `operation` | Operator-facing product UI — dashboards, admin, developer, authoring. | The only value that discharges a classification gate while attaching no claim — a **negative declaration**, "someone looked and found nothing to declare", which is different information from absence, "no one looked". | refuses |

**The vocabulary is closed and non-extensible, and exactly one value admits.**
Values are admitted only if they carry a rule no other value shares;
descriptive convenience is not admission, and this is not a taxonomy of product
areas. There is deliberately no Registry extension seam
([`extension-registry.md`](../registry/extension-registry.md)) on `routeClass`:
rules keyed on these values are stated by the platform, and in a white-label
deployment the host is the tenant — a constraint the constrained party can edit
is not a constraint. Where each value's refusal is pinned, and which pins are
still outstanding, is the pin register in
[ADR 0161](../../../thoughts/adr/0161-route-class-and-rendering-ring-boundary.md)
§5, whose §6.1 carries the closure evidence that corrected `operation` from
admitting to refusing and added `attestation` and `authentication`.

`routeClass` names the route's kind, not a permission. Permissions and other
rules **derive** from it; they are not restated on the route. A Surface author
knows what they just built; they cannot be assumed to know every policy keyed
off it, and a policy that changes must not require editing every document that
predates the change.

`routeClass` is deliberately orthogonal to two other route axes and MUST NOT
absorb them:

- **Access posture** — who may reach the route without authenticating. A `proof`
  route may be bearer-reachable while an `operation` route requires a session
  and a step-up; both are the same `routeClass` value in the other direction.
  Access is a floor, not a partition of routes.
- **Route lifecycle** — preview / stable / deprecated. Any `routeClass` may sit
  at any lifecycle stage.

**Unclassified routes.** `routeClass` is OPTIONAL and has **no default**. An
absent `routeClass` means *unclassified* — nobody has stated what this route is.
Unclassified is a distinct state from `operation`, which is a stated
classification: someone looked at the route and declared it operator-facing
product UI. Processors MUST NOT treat an absent `routeClass` as `operation`.

The two states have opposite **authoring-time refusal postures**, which is the
sharpest reason not to collapse them: `operation` fires `THEME-ROUTE-CLASS`
against a tenant Theme assignment, while an unclassified route cannot fire a
rule keyed on a class it does not state. The document therefore remains valid
and publishable. At runtime, the shell separately refuses tenant theming on an
unclassified route because silence does not grant theme authority
([surface-shell-spec](surface-shell-spec.md) §4.3). The distinction is also
load-bearing forward — because *stated* and *unstated* stay distinguishable, a
future conformance level, publication gate, or host policy can require
classification without a schema change. A schema `default` would have collapsed
the two states permanently.

A Surface whose routes are unclassified is publishable and conformance-coherent.
It is not *trust-classified*: a host that relies on a `routeClass`-keyed
guarantee SHOULD require the routes it depends on to state a class, because a
guarantee cannot be derived from silence.

**Rules keyed on route class are cross-artifact, and they live on the consuming
artifact's spec, not here.** Surface states what a route is; it does not carry
the rules. The first is theme authority — a tenant Theme token assignment MUST
NOT land on a widget bound to a route whose class is anything other than
`intake` ([`ui-graph-policy-spec.md`](../app-graph/ui-graph-policy-spec.md)
§5.7, `THEME-ROUTE-CLASS`). `routeClass` sits on Surface, which the platform
ships, rather than on UI Graph Policy, which in a white-label deployment the
tenant authors: a constraint the constrained party can edit is not a constraint.

### Route Navigation

A route MAY declare `navigation` to state whether and how it appears in shell
navigation. Navigation does not change addressability, route matching,
reachability, transitions, authorization, or entry selection.

- `visible: false` omits the route from navigation. The route remains
  addressable and may remain a transition target.
- `scope` names the route's navigation context. A binding shows only visible
  entries whose scope equals the matched active route's scope. Omitting
  `scope` assigns the semantic scope `default`; processors do not need to
  materialize that value in the document.
- `label` supplies the person-facing navigation label. When absent, a binding
  uses `route.title`, then `route.id`.
- `order` sorts visible routes within one Surface. Lower values appear first.
  Equal or absent values preserve route declaration order; routes with an
  explicit order precede routes without one.
- Omitting `navigation` preserves the v0.2 default: the route appears using its
  title or id in the `default` scope.

A binding MUST preserve Surface grouping and per-Surface route order after it
filters entries by the active scope. If that scope has no visible entries, the
binding MUST render no route-navigation landmark. When route resolution yields
no active route, the binding retains the legacy `default` navigation scope.

A binding MUST evaluate parameter completeness and collision refusal only for
routes it will expose in navigation. A hidden parameterized route with no
current parameter values is not a broken navigation item because no navigation
item exists.

### Strict rendered-Need trace profile

Surface's baseline schema permits generation metadata without requiring a
Needs document. A processor that activates the strict rendered-Need trace
profile MUST pair one or more Needs 1.0 documents and MUST reject every normal
product-rendering node without its own canonical
`x-generation.anchors[]` value in the form `need:<id>@<revision>`.

For Surface, the checked nodes are each route, authored `navigation` object,
slot, `static-content` binding, transition, named `dataBindings` entry, and
named `actionBindings` entry. The binding trace explains the literal heading,
text, image, alternative text, divider, runtime-data choice, or action mapping
independently of the slot container and title. A standard structured widget
additionally checks its panel root, every block, every authored field or table
column, and every action presentation. Every loaded Data Sources `sources[]`
entry is also one checked node. Parent, slot, catalog, source, widget-config,
and Response Action metadata do not authorize a related untraced node.

Preview scenarios remain outside `AppGraphContext` because they are not App
Manifest members. When a caller pairs one with this strict profile, the
scenario root `x-generation` directly explains `initialPath` and
`defaultProfile`. If `routeParams` exists, the sibling
`routeParamsGeneration` directly explains the parameter map as one structured
node, not one node per key. Every profile source outcome and every default or
action-specific outcome is one separately checked node with its own
`x-generation` Need anchor. A source outcome is the semantic unit; validators
MUST NOT create additional trace nodes for rows, cells, or nested members of
its `value`.

Each anchor MUST resolve unambiguously to a Need whose status is `adopted`, and
MUST pin that Need's current revision. Missing, unresolved, non-adopted, and
stale links are separate blocking findings.

Bindings SHOULD expose the validated anchors as inert DOM review metadata on
the element that renders the node. DOM metadata is evidence for inspection; it
does not replace graph validation and MUST NOT grant authorization.

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

### Static-content image alternative text

A `static-content` binding with `kind: "image"` MUST carry `alt`. The value is
authored alternative text. An empty string explicitly marks the image as
decorative. Every other static-content kind MUST omit `alt`.

Processors MUST preserve `alt` exactly when they pass it to a rendering binding.
They MUST NOT replace or supplement it with `slot.title`, `binding.content`, a
URL segment, a filename, or host copy. Malformed runtime input that reaches a
processor without the required image `alt` makes the slot unavailable and
produces a diagnostic; it does not activate a fallback naming rule.

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

### Module-widget configuration, data, and actions

A module widget has three separate authored channels:

| Channel | Registry declaration | Surface binding | Purpose |
|---|---|---|---|
| Configuration | `widgetShape.props` | `binding.config` | Static authored configuration. |
| Runtime data | `widgetShape.dataInputs[]` | `binding.dataBindings` | Authorized values loaded through Data Sources 1.0. |
| Action events | `widgetShape.actionOutputs[]` | `binding.actionBindings` | Named events delegated to Response Actions. |

Processors MUST NOT treat `config` as runtime data. A widget-name switch, inline
payload, query text, filename discovery, or catalog-order fallback is not a
conforming data binding.

Each `dataBindings` property name MUST exactly match one
`widgetShape.dataInputs[].name` on the resolved widget contribution. Its
`catalogRef` MUST exactly match one App Manifest `dataSources[].url`, and its
`sourceRef` MUST exactly match one `sources[].id` in that catalog. The source
identity is the pair `(catalogRef, sourceRef)`; processors MUST NOT perform
unqualified source lookup.

App-graph validation MUST prove that the input is declared, the catalog is
manifested, the source exists, and the source's availability covers the exact
use. An availability selector at app, exact Surface, exact route, exact slot, or
matching module level may cover the widget. Definition-only availability does
not cover a module widget. Data Sources 1.0 remains authoritative for payload
schema, runtime authorization, delivery, failure, cache, stale-data, and
provenance rules.

At runtime, the widget receives one read-only object keyed by declared input
name. An unbound optional input is absent. A required input that is unbound,
unauthorized, unavailable, failed, or payload-invalid makes the widget
unavailable and produces a diagnostic. The host MUST NOT synthesize a value.

Each `actionBindings` property name MUST exactly match one
`widgetShape.actionOutputs[].name` on the resolved widget contribution. Its
`actionRef` MUST exactly match one loaded Response Actions `actions[].id`. An
output name is an event the widget may emit; it is not an action id, route id,
Response Actions intent, or generic host command. App-graph validation MUST
reject an undeclared output, unresolved action, duplicate mapping, or ambiguous
transition target.

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

App-graph validation MUST reject a transition trigger that is neither a loaded
Response Actions `actions[*].id` nor a closed-core Response Actions intent
declared by exactly one loaded Response Actions action. Direct `x-` extension
intent triggers are invalid unless they are also action ids; extension intent
semantics stay inside the Response Actions document. This is a
source-conformance check over the loaded graph; it does not introduce or require
a Runtime Plan artifact, schema, or validator phase.

If `when` is present, it is an FEL boolean expression evaluated against current
bundle state. The transition fires only when `when` evaluates true. Producers
and authoring facades MAY reject `when` until they can validate the expression
against bundle-state bindings instead of guessing at renderer-local state.

If the target route declares `params[]`, `transitions[].params` MUST supply every
declared target parameter per §3 Route Parameters. Surface does not execute the
trigger or resolve the parameter values; Response Actions remains the trigger's
executor when the trigger references an action or closed-core intent.

### Widget action invocation and retry

A widget receives only `emitAction(outputName, input?)` for action delivery.
`input`, when present, is a detached frozen finite-JSON object and participates
in invocation and replay identity. The shell rejects unsafe or non-JSON input
before execution. The widget receives neither a route table nor a navigation
function and MUST NOT navigate directly. For each user emission, the host MUST:

1. allocate one stable invocation id;
2. coalesce duplicate in-flight delivery for the same route/session generation,
   slot, output, deterministic structured input, and invocation id;
3. resolve the output through its exact `actionBindings[outputName].actionRef`;
4. delegate preconditions, effects, `retry-once`, frozen idempotency keys, and
   durable replay to Response Actions;
5. ignore completion from an obsolete route or session generation; and
6. after a successful current-generation terminal result, follow at most one
   eligible Surface transition and follow it only once.

Retry preserves the invocation id and immutable Response snapshot. It does not
emit a second logical action. A previously recorded durable outcome is replayed
instead of repeated. Zero eligible transitions leaves the current route in
place and reports the action result. More than one eligible transition is an
authoring or app-graph validation failure; runtime MUST NOT choose by declaration
order. Surface remains the transition planner, and Response Actions remains the
action executor.

## 5. Closed slot-type taxonomy (v0.2)

[ADR 0150 §6.2](../../../thoughts/adr/0150-formspec-as-layered-ui-substrate.md#62-closed-slot-type-taxonomy)
closes the v0.2 slot-type list at five values:

| slotType | Binding shape | Renders |
|---|---|---|
| `definition-form` | `{ definitionRef: string, presentation?: string }` | The bound Definition form. |
| `experience-unit` | `{ experienceRef?: string, unitRef: string }` | Review-only Experience reasoning. Customer renderers emit no slot DOM or copy; explicit authoring/debug mode may show the resolved title and Needs. |
| `module-widget`   | `{ moduleId: string, widgetName: string, config?: object, dataBindings?: Record<inputName, {catalogRef, sourceRef}>, actionBindings?: Record<outputName, {actionRef}> }` | A widget supplied by a declared module. |
| `static-content`  | `{ kind: heading\|text\|image\|divider, content: string, alt?: string, level?: 1..6 }`, with `alt` required exactly for `image` | Inline literal content or an authored image reference. |
| `embed-route`     | `{ routeRef: string, mode?: string, params?: RouteParamMap }` | Another route from this Surface (modal/panel/dialog). |

`definition-form.binding.definitionRef` is URL-based in v0.2. In bundled
app-graph validation it resolves against App Manifest `definitions[].url` and
the loaded Definition `url`; it is not a Definition `name`, local handle, file
stem, or `identity.id` alias. Any future alias or explicit graph-binding
contract requires a Surface spec/schema revision.

Each binding shape is enforced by `schemas/surface.schema.json` via an
`allOf [if/then]` gate discriminating on `slotType`. The taxonomy is closed at
v0.2; future revisions admit new slot types via the Registry `slot-type`
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

For App Manifest v2.3 graphs, the scheme is resolved only for Screeners
explicitly associated by `screeners[]`. AppGraphValidator resolves the bare
`surface:<route-id>` across the loaded Surface documents in that app graph.
The target MUST resolve to exactly one loaded Surface `routes[].id`; missing or
ambiguous matches are cross-artifact validation errors. This exact-one rule is
the v0.2/v2.3 conformance boundary for Screener terminal hops; production
runtime routing remains outside Surface-local conformance.

The Screener spec retains its freestanding posture per
[`screener-spec.md`](../screener/screener-spec.md) §2.3: no target binding
inside the Screener document itself; the Screener emits a destination URI
string. Surface picks the URI up by scheme inspection at the renderer or
gateway layer.

AppGraphValidator resolution of Screener `surface:<route-id>` targets applies
only when a Screener is explicitly associated with the app graph by App
Manifest v2.3 `screeners[]`. Processors MUST NOT infer that association from
filenames, loaded Definitions, TraceIndex, Runtime Plan, embedded Definition
screeners, Surface route names, or ad hoc `hostEvidence`.

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
   module's `widgetShape.props` (E604); every `module-widget.dataBindings`
   input through its exact `(catalogRef, sourceRef)` and allowed availability;
   and every `module-widget.actionBindings` output through its exact loaded
   Response Actions action id.
6. Component `targetSurfaceRoutes[]` claims resolve against Surface route and
   slot ids in app-graph validation. Surface-local conformance does not require
   or synthesize Component membership.
7. Every image carries an authored `alt`, every non-image omits `alt`, and
   processors preserve meaningful and empty values without synthesis.
8. Widget input and output names resolve against Registry 1.1; required-input
   failure makes the widget unavailable; action invocation uses one stable id,
   Response Actions retry/replay semantics, obsolete-completion refusal, and
   at-most-once transition navigation.

A non-form app (a bundle with `definitions: []` and a `surfaces: [...]`
declaring routes with `experience-unit` / `module-widget` /
`static-content` slots) is a valid Formspec app — Surface is the
substrate-identity proof case per ADR §11.1.

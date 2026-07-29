---
title: Formspec Surface Shell Specification
version: 0.2.0-draft.1
date: 2026-07-28
depends_on:
  - specs/surface/surface-spec.md
  - specs/app-graph/ui-graph-policy-spec.md
  - specs/response-actions/response-actions-spec.md
  - specs/theme/theme-spec.md
  - specs/theme/token-registry-spec.md
  - specs/bundle/app-manifest-spec.md
  - specs/experience/experience-spec.md
  - specs/data-sources/data-sources-spec.md
  - specs/registry/extension-registry.md
  - specs/locale/locale-spec.md
---

# Formspec Surface Shell Specification v0.2

**Version:** 0.2.0-draft.1
**Date:** 2026-07-28
**Editors:** Formspec Working Group
**Companion to:** [Formspec Surface Specification](surface-spec.md)

---

## Status of This Document

This document is a **draft specification**. It is the runtime companion to the
[Surface Specification](surface-spec.md): Surface defines the
authored document, this defines what a processor does when it renders one.

**This spec was written after its implementation, and that order is a defect
this document corrects.** `@formspec-org/surface` and
`@formspec-org/surface-react` were promoted into the npm layer from the
[surface-render-v10 spike](../../thoughts/spikes/2026-07-27-surface-render-v10.md) without a
written, reviewed contract. The stack's rule is that a new named seam gets one
([`../../../CLAUDE.md`](../../../CLAUDE.md) §Review discipline: *new or moved
named seam (trait, port, adapter, wire shape, CDDL, schema)* is an architecture-
review trigger). The Surface Shell is a named seam — it is the only place in the
stack where a `slotType` value becomes a rendered thing, and the only place
`routeClass` becomes a theme grant — and it acquired an implementation first.

Two consequences follow, and both are deliberate:

1. **The reference implementation is evidence, not definition.** Where it made a
   call this spec should own, this spec decides on the merits and states its
   reasoning. Several decisions here match the implementation because the
   implementation reasoned correctly; several do not.
2. **Divergences are catalogued, not smoothed.** Appendix B records the known
   places found by this review where the shipped packages contradicted this
   document. A divergence
   register on a spec written after its code is the honest shape; an empty one
   would mean the spec had been reverse-engineered rather than decided.

The document also closes the question ADR 0161 §6 left open — what a processor
does with a route that states no `routeClass` — and defines one new
validation-time lint code (§5.4). Neither is inherited; both are marked as this
specification's own decisions.

**This document sits in the normative spec tree and remains a draft after its
2026-07-28 architecture review.** It is here rather than in
`thoughts/` because behavioural semantics a schema cannot encode are normative in
`specs/**/*.md`, as the repository's
[`CLAUDE.md`](../../CLAUDE.md#spec-authoring-contract) §Spec authoring contract
states, and a citable rule cannot live behind a date-stamped proposal filename.
That placement is a statement about *where the rule belongs*, not a claim that
it has been ratified. Read the version: `0.2.0-draft.1`.

Implementors are encouraged to experiment and provide feedback, but MUST NOT
treat this document as stable for production use until a 1.0.0 release is
published.

## Conventions and Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD",
"SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this
document are to be interpreted as described in [BCP 14][rfc2119] [RFC 2119]
[RFC 8174] when, and only when, they appear in ALL CAPITALS, as shown here.

JSON syntax and data types are as defined in [RFC 8259]. URI syntax is as
defined in [RFC 3986]. URI Template syntax is as defined in [RFC 6570]; Surface
v0.2 admits only its simple single-variable expansion form
([surface-spec](surface-spec.md) §3 Route Parameters).

Terms defined in the [Surface Specification](surface-spec.md)
— *Surface document*, *route*, *route path*, *route parameter*, *route class*,
*slot*, *slot type*, *slot binding*, *transition*, *embed-route* — retain their
Surface meanings throughout. Terms defined in the Formspec core specification —
*Definition*, *Response*, *conformant processor* — retain their core meanings.

Additional terms:

- **Surface Shell** — a processor that reads one or more published Surface
  documents plus the artifacts they bind, and produces a navigable application.
- **Shell core** — the renderer-independent half of a Surface Shell. It resolves,
  plans, and reports. It draws nothing.
- **Binding** — the renderer-specific half. It turns a plan into one medium's
  primitives (React elements, custom elements, PDF boxes, terminal cells).
- **Host application** — the program that embeds a Surface Shell. It owns the
  incoming path, the bundle bytes, navigation, and everything the substrate
  declines to describe.
- **Route plan** — the shell core's output for one matched route: the resolved
  slots in order, the theme grant, the transition plan, and the diagnostics.
- **Theme grant** — the decision, per route, of whether tenant Theme tokens reach
  that route's subtree. Derived structurally from route class (§4).
- **Trigger source** — a rendered control that can cause a Response Actions
  invocation, and therefore can cause a Surface transition to advance (§5.2).

[rfc2119]: https://www.rfc-editor.org/rfc/rfc2119
[RFC 3986]: https://www.rfc-editor.org/rfc/rfc3986
[RFC 6570]: https://www.rfc-editor.org/rfc/rfc6570
[RFC 8174]: https://www.rfc-editor.org/rfc/rfc8174
[RFC 8259]: https://www.rfc-editor.org/rfc/rfc8259

---

## Bottom Line Up Front

- A **Surface Shell** turns a described app into a running one: it composes the
  bundle's Surface documents into one route table, matches an incoming path,
  dispatches each slot on the matched route, resolves that route's theme grant,
  and plans — never fires — its transitions.
- The shell is **renderer-independent core plus thin bindings**. The core owns
  every decision the substrate determines; a binding owns only how those
  decisions become pixels, and MUST NOT re-derive any of them.
- **Theme authority is structural, not restated.** The shell reads the shipped
  `routeClass` → authority map; a refusing class MUST NOT receive tenant tokens,
  and the invariant is stated so a conformance test can assert it by reading the
  emitted token set rather than by inspecting code paths (§4.2).
- **An absent `routeClass` refuses tenant tokens** and reports that it did.
  ADR 0161 §6 makes absence a distinct state and stops there; this spec closes it
  fail-closed, because a permission cannot be derived from silence and the
  alternative is the exact fail-open shape ADR 0161 §6.1 already corrected once
  (§4.3).
- **Tokens are emitted onto an element the shell owns, with cleanup, never onto
  the document root** (§4.5). This is the runtime half of the ADR 0161
  theme-authority promise; the motivating defect was a provider that wrote tenant
  tokens to `<html>` and left them there across navigation.
- **The shell supplies no default trigger affordance.** A form control or a
  Registry 1.1 widget output mapped by Surface 0.2 declares the trigger source.
  Otherwise the transition does not fire and app-graph validation reports `E611`
  (`SURFACE-TRANSITION-UNFIREABLE`) (§5).
- **A host handed a signed bundle export MUST verify before passing any
  bundle-derived input to shell core or a binding, and MUST refuse, not warn, on
  failure** (§6).
- The shell introduces **no new document type.** Surface 0.2, Registry 1.1,
  App Manifest 2.4, and Locale 2.0 close the image, widget data/action, entry
  Surface, and shell-string gaps without compatibility aliases (Appendix B).

---

## 1. Introduction

### 1.1 Purpose and Scope

Surface is an authored artifact that names routes and binds slots. Until a
processor reads it at render time, every guarantee keyed on it — the closed slot
taxonomy, the closed route-class vocabulary, the route graph, the transition
triggers — is authored, validated, and consumed by nothing. The
[surface-render-v10 spike](../../thoughts/spikes/2026-07-27-surface-render-v10.md) confirmed
exactly that as its stated hypothesis.

This specification defines the processor that closes the gap. In scope:

- Composing one or more published Surface documents into a single navigable app
  (§2).
- Matching an incoming path to a route, including route parameters, and behaving
  predictably when nothing matches (§2).
- Dispatching each slot type to a rendering obligation, including what a slot
  does when the artifact it names is absent (§3).
- Deriving theme authority from route class, and scoping token emission so the
  derivation cannot be undone downstream (§4).
- Planning transitions without firing them (§5).
- Verifying a signed bundle export before rendering it (§6).
- The diagnostics a shell reports about all of the above (§7).

Out of scope, and owned elsewhere:

| Concern | Owner |
|---|---|
| What a Surface document may say | [surface-spec](surface-spec.md), `schemas/surface.schema.json` |
| Whether an authored Surface is valid | `formspec-lint`, AppGraphValidator ([app-graph-validator-spec](../app-graph/app-graph-validator-spec.md)) |
| Which tenant Theme assignments are refused at authoring time | [ui-graph-policy-spec](../app-graph/ui-graph-policy-spec.md) §5.7 |
| Where each route class's refusal comes from | [ADR 0161](../../../thoughts/adr/0161-route-class-and-rendering-ring-boundary.md) §5 pin register |
| Action preconditions, validation, effects, idempotency, replay, terminal state | [response-actions-spec](../response-actions/response-actions-spec.md) |
| Field rendering, widget selection inside a form, the cascade | [theme-spec](../theme/theme-spec.md), [component-spec](../component/component-spec.md) |
| Session identity, authorization, actor scope | out of Surface entirely ([ADR 0152](../../../thoughts/adr/0152-multi-actor-authorization-scope.md)) |
| Case lifecycle, governed workflow | WOS |

This specification does **not** define a new document type, a new schema, a new
`$formspec*` discriminator, or a runtime plan artifact. A Surface Shell reads
artifacts that already exist and emits diagnostics; it authors nothing.

### 1.2 The Layering

The shell is **renderer-independent core plus thin bindings**. This is a
normative division, not a packaging convenience: it is what makes the same route
resolution, the same slot dispatch, and — critically — the same theme grant
reproducible across React, a web component, a PDF writer, or a terminal.

| Layer | Owns | MUST NOT |
|---|---|---|
| **Shell core** | Composing the route table; path matching and specificity; entry-route selection; slot dispatch and target resolution; theme grant per route; heading-level assignment; transition planning; the diagnostic set. | Emit markup, touch a DOM, assume a medium, own navigation history, or fetch anything. |
| **Binding** | Turning a route plan into one medium's primitives; element choice; focus order; the presentation of unavailable, empty, and unfireable states. | Re-derive anything the core decided — a binding that recomputes a route match, a theme grant, a slot dispatch, or a heading level has forked the contract. |
| **Host application** | Supplying the incoming path and route-parameter values; supplying bundle bytes and signature; verification (§6); the widget registry; the Response Actions executor; navigation and history; the data a module widget displays; presenting unmatched paths. | Reach past the shell to write theme tokens; infer transition success from a click; substitute an artifact the bundle did not name. |
| **Validation-time tooling** | Everything decidable without a person: `E603`, `E604`, `E606`, `E607`, `E610`, `E611` (§5.4), `THEME-ROUTE-CLASS`, `THEME-TOKEN-UNREGISTERED`. | Nothing here is the shell's to re-implement. |

**The shell trusts validation and still fails closed.** A conformant shell MAY
assume a published bundle passed validation, and MUST NOT duplicate the
validator's work at render time. When it nonetheless *observes* a violation —
because the bundle was not validated, or was validated by an older tool — it MUST
take the fail-closed branch and report, never the permissive branch. §4.3, §5.3,
and §3.1 each state that branch for their concern.

**Navigation is a port, not a shell concern.** A shell that owns browser history
cannot embed in a host that already routes. The shell receives a path and emits
navigation intents; the host performs them.

### 1.3 Design Principles

1. **Report, never fail quietly.** The sharpest finding in the spike that
   produced this seam was not a missing feature — it was silence: a tenant's
   brand colour was accepted by authoring, passed validation, signed into the
   release, emitted by the renderer, resolved in the cascade, and painted
   nothing, with no diagnostic anywhere in the chain. Every place this spec
   requires a shell to make a call the substrate does not state, it also
   requires the shell to say what it did (§7).
2. **Invent no content.** A shell renders what the bundle carries. It MUST NOT
   supply copy, labels, alternative text, data, or affordances the artifacts do
   not declare. Where a bundle supplies nothing, the honest render is an empty
   state that says so — not a plausible-looking substitute.
3. **A permission is not derivable from silence.** Where an artifact declines to
   state something a trust rule keys on, the shell takes the refusing branch and
   reports. This is the principle §4.3 applies to an absent route class and §5
   applies to an undeclarable trigger source.
4. **Review guidance — one decision, one site.** Keep each rule in one shared
   function and make direct and embedded paths call it. Conformance relies on
   the observable parity and static boundary in §8.3, not on this design
   preference by itself.
5. **The shell is the last enforcement point, never the source of truth.** Theme
   authority is read from the shipped map, not restated (§4.1). Route-class
   values, slot-type values, and static-content kinds are read from the schema
   and the specs that own them, never re-enumerated in shell source.

### 1.4 Conformance Levels

This specification defines three conformance classes and one obligations
checklist, all specified in §8: **Surface Shell Core**, **Surface Shell
Binding**, **Verifying Surface Shell**, and **Host Obligations**.

---

## 2. Route Resolution

### 2.1 The Composed Route Table

An App Manifest MAY name more than one Surface
([app-manifest-spec](../bundle/app-manifest-spec.md) §`surfaces[]`:
*"Multi-element supports respondent + reviewer surfaces"*). A shell handed such a
manifest MUST present them as **one application with one URL space**.

A conformant shell builds a **composed route table** by walking `surfaces[]` in
App Manifest declaration order and appending every route of each Surface in its
own `routes[]` order. The table is flat: there is no per-Surface path prefix, no
mount point, and no namespacing of paths. Surface documents already carry
URL-style absolute paths; prefixing them would make the same route resolve at
different URLs depending on manifest position, which is not a property an author
can reason about.

*This specification's own decision.* Nothing in Surface, App Manifest, or ADR
0150 states a composition rule; the manifest is the only ordered, authored signal
available, so it is the one used.

### 2.2 Global Route Identity

A route's identity in the composed table is the pair **(Surface identity,
`routes[].id`)**. This is not new: [surface-spec](surface-spec.md)
§5.1 already requires runtime route state to be *"keyed by Surface identity plus
`routes[].id`"* and forbids keying it by Definition URL, Component handle, or
renderer-local DOM state. This section states the composition consequence:

- Two Surfaces MAY declare the same `routes[].id`. That is not a collision —
  `routes[].id` is unique *within* a Surface by schema, and the pair
  disambiguates.
- The composed table MUST contain at most one route for each (Surface identity,
  `routes[].id`) pair. If malformed runtime input produces more than one, the
  shell MUST report `ROUTE-HANDLE-AMBIGUOUS`, omit every duplicate from
  unqualified and qualified handle lookup, and resolve no affected app entry.
  It MUST NOT choose by declaration order.
- A route path is **not** an identity. It is the host-facing address of one
  route, and §2.4 governs what happens when two routes claim the same one.
- The `surface:<route-id>` URI scheme
  ([surface-spec](surface-spec.md) §6) is a Screener/AppGraph destination URI,
  not a runtime route identity or a general shell handle. AppGraph validation
  resolves it across loaded Surfaces and requires exactly one match. Runtime
  route state uses the qualified pair; URL matching is a separate host or
  binding concern.

### 2.3 Path Grammar and Matching

Route paths are matched segment-wise against the incoming path after splitting
both on `/`. A candidate route matches when it has the same segment count and
every segment matches: a **literal segment** matches by exact string comparison
after percent-decoding; a **parameter segment** — a segment that is exactly a
simple URI Template marker `{name}` — matches any single non-empty segment and
binds its percent-decoded value to `name`.

Three constraints follow from
[surface-spec](surface-spec.md) §3 Route Parameters and are
restated here only as processor obligations:

1. **`{name}` is the only parameter grammar.** Surface v0.2 *"does not admit URI
   Template operators, exploded values, matrix parameters, query parameters,
   optional segments, regex captures, or colon-prefixed framework syntax as
   normative parameter syntax."* A shell MUST NOT treat a `:name` segment, a
   `*` segment, or a regex as a parameter. Such a segment is a literal.
2. **Every marker needs a declaration and every declaration needs a marker.** A
   `{name}` marker with no `params[]` entry, or a `params[]` entry with no
   marker, is an authored defect; `E610` owns it at validation time and the shell
   reports `ROUTE-PARAM-UNDECLARED` / `ROUTE-PARAM-NO-MARKER` at runtime.
3. **Parameter values are host input.** The shell binds values out of the matched
   path or receives them from the host; it does not fetch, coerce beyond
   percent-decoding, or authorize them. `type` is `string` and only `string` at
   v0.2.

**A path that uses an unpinned parameter grammar is matched as literal text, and
the shell MUST report `ROUTE-PARAM-GRAMMAR`.** *This specification's own
decision,* and it is deliberately strict. The reasoning is the one
[token-registry-spec](../theme/token-registry-spec.md) §2.4 states for
brand tokens: *"A silent alias is worse than no alias. It makes two vocabularies
both appear to work, so an authoring tool that emits the wrong one is never
corrected and a renderer that drops it is never blamed."* Accepting `:name`
alongside `{name}` is that alias in the route grammar. Two shells would disagree
about what a signed URL means — one deep-links, one returns nothing — with the
bundle valid under both readings. The qualified route record remains in the
composed model, but its malformed URL address degrades loudly. Person-facing
reachability then depends on valid entry paths the host actually provides; the
shell does not invent a fallback address.

Matching is otherwise conventional and stated here so bindings do not each pick:
a trailing slash on a non-root path is ignored; matching is case-sensitive on
literal segments; query strings and fragments are not part of the path and MUST
NOT participate in matching.

### 2.4 Specificity and Collisions

Two routes may both match an incoming path when one uses a literal segment where
the other uses a parameter — `/receipt/new` and `/receipt/{caseRef}`.

**Specificity rule.** Compare candidates segment by segment from the left. At the
first index where they differ in kind, the candidate with the literal segment
wins. If no index differs in kind, the candidates are **colliding**.

**Collision rule.** Colliding paths MUST NOT be resolved by declaration order,
Surface order, or any other tie-break. The shell MUST report
`ROUTE-PATH-COLLISION` naming every colliding route, and MUST NOT resolve that
path to any of them. Both qualified route records remain in the table. Their
presence does not guarantee that a person can reach either one.

**Collision navigation rule.** A binding MUST NOT expose an interactive
navigation control for any claimant of a refused address. This includes both a
navigation-list item and a transition control whose successful action would
navigate to the claimant. The transition MUST remain unavailable; a successful
action from a slot already on the page MUST NOT advance to the refused address,
and the binding MUST check the refusal again before emitting any navigation
intent. A binding MAY render each claimant as an unavailable item. When it does,
the item MUST expose its unavailable link state to assistive technology without
an `href`, activation handler, or tab stop. It MAY omit claimants only when the
host still receives the complete `ROUTE-PATH-COLLISION` diagnostic, including
every qualified claimant. A binding MUST NOT turn declaration order into a
hidden navigation tie-break.

**Collision is tested over matching behaviour, not over authored strings.** Two
paths collide when they match the same set of incoming paths — same segment
count, same kind at every index, same literal text at every literal index. Two
routes whose `path` strings differ character-for-character can still collide
(`/m/{a}` and `/m/{b}` are the same address), and two identical-looking paths can
fail to collide once §2.3's literal rule is applied. A shell that compares
authored `path` strings will miss real collisions and report false ones.

*This specification's own decision.* Picking a winner by order is the fail-open
shape: one signed, authored, validated route silently becomes unreachable, and
nothing on screen says so. Refusing the address and reporting keeps the defect
visible and keeps the rest of the app running — which is more surgical than
refusing to compose the app at all, and equally fail-closed on the ambiguity.

### 2.5 Entry Route

Each Surface declares its own `entry`, and that value keeps its Surface-local
meaning: it is the root of the `E606` reachability walk and the Surface's own
starting route. Composition does not demote it.

App Manifest 2.4 selects the **entry Surface**:

1. With no `surfaces[]`, the app has no Surface entry.
2. With one `surfaces[]` entry and no `entrySurface`, that one Surface is the
   implicit selection.
3. With two or more `surfaces[]` entries, `entrySurface` is REQUIRED.
4. When present, `entrySurface` MUST exactly match one `surfaces[].url`.

Manifest order, a Surface `id`, a filename, and a route id are not aliases for
`entrySurface`. A missing selector with two or more Surfaces produces
`APP-ENTRY-AMBIGUOUS`. A selector that does not match exactly one loaded Surface
URL produces `APP-ENTRY-SURFACE-UNRESOLVED`. In either case, the app has no
entry route. The shell MUST NOT choose the first Surface.

After the app selects one Surface, that Surface's own `entry` selects the route.
`entrySurface` cannot override the route, and a local Surface `id` or route id
cannot override the selected Surface. This preserves one source of truth for
each decision: App Manifest selects the Surface; Surface selects its route.

An `entry` that names no route in its own Surface is an authored defect; the
shell MUST report `SURFACE-ENTRY-UNRESOLVED` and MUST NOT substitute a route for
it — not the Surface's first route, and **not another Surface's entry**. When the
selected Surface's `entry` is unresolved, the app has no entry route and the shell
reports rather than searches. Falling through to a later Surface's entry lands a
respondent on a caseworker screen because someone mistyped a route id, and the
diagnostic that would have explained it is the one nobody reads because the app
appeared to work.

### 2.6 Unmatched Paths

When no route matches the incoming path, a conformant shell MUST:

1. Render no route's content.
2. Report `ROUTE-UNMATCHED` with the attempted path.
3. Surface the unmatched state to the host so the host can present it.

A shell MUST NOT redirect an unmatched path to the app entry route, to the
nearest route, or to any route at all. *This specification's own decision.*
Silently landing a broken deep link on the entry route makes a broken link look
like a working app; the person believes they arrived somewhere and the operator
never learns the link was wrong. The host owns what a person sees for an
unmatched path — the shell owns knowing that nothing matched.

### 2.7 Route Parameters at Entry

A shell MUST NOT enter a parameterized route without a value for every declared
parameter. When a value is missing, the shell MUST report
`ROUTE-PARAM-UNSUPPLIED` and MUST NOT substitute the parameter's name, its
`example` value, or an empty string into the path.

Substituting the name produces a URL that looks like a working link and is not —
`/receipt/caseRef` resolves, renders, and shows the wrong thing. Substituting
`example` puts documentation into a live address. Both are the invent-no-content
prohibition (§1.3 principle 2) in the address bar.

A binding MUST NOT emit an interactive link whose destination still contains an
unresolved `{name}` marker. It renders the navigation item as unavailable and
delivers `ROUTE-PARAM-UNSUPPLIED` to the host diagnostic channel. A marker-
bearing URL is not a disabled link; it is an address no host supplied.

---

## 3. Slot Dispatch

A route's `slots[]` is an ordered list, and the shell dispatches each entry on
its `slotType`. The taxonomy is closed at v0.2 by
[ADR 0150 §6.2](../../../thoughts/adr/0150-formspec-as-layered-ui-substrate.md#62-closed-slot-type-taxonomy)
and enumerated with its binding shapes in
[surface-spec](surface-spec.md) §5; it is not restated here.
This section states the **rendering obligation** each value carries.

Dispatch MUST be exhaustive over the closed taxonomy, with no default branch. A
shell that falls through to a generic renderer for an unrecognised `slotType`
has admitted a value the schema does not, which is the extension seam ADR 0150
§4.2 reserves for a Registry `slot-type` contribution — not a runtime fallback.
If malformed runtime input reaches the shell despite schema validation, an
unrecognised `slotType` MUST produce an unavailable slot plan and
`SLOT-TYPE-UNKNOWN`. It MUST NOT throw or invoke a generic renderer.

### 3.0 General Obligations

**Order is authored.** Slots render in `slots[]` order. `position` is an
OPTIONAL renderer hint with no normative vocabulary at v0.2
([`surface.schema.json#/$defs/Slot/properties/position`](../../schemas/surface.schema.json#/$defs/Slot/properties/position));
a binding MAY consume it, and MUST fall back to document order for any slot
that declares none.

**Two absent states, and they are different.** A conformant shell distinguishes:

| State | Meaning | Obligation |
|---|---|---|
| **Empty** | The slot's target resolved. It has nothing to show right now — an empty queue, an unsubmitted receipt. | Render a perceivable empty state derived from the resolved artifact. No diagnostic. This is not a defect. |
| **Unavailable** | The slot's target did not resolve — the Definition, Experience unit, widget, or route the binding names is absent or unusable. | Render a perceivable unavailable placeholder. Report the matching diagnostic (§7). Never silently omit the slot. |

**A slot whose target artifact is absent MUST NOT be dropped.** *This
specification's own decision.* Omitting the slot produces a page that is missing
something with no indication anything is missing — a partial app that looks
complete. The placeholder MUST NOT describe or approximate the missing content;
it states that something the bundle named is not here, which is all the shell
knows.

**Shell-authored strings use one closed Locale key family.** Locale 2.0 app
targets MAY override the shell's person-facing text through
`$module.x-formspec-surface.shell.<SurfaceStringKey>`. The allowed suffixes are
exactly:

`slotUnavailableDefinitionForm`, `slotUnavailableExperienceUnit`,
`slotUnavailableWidgetUnimplemented`, `slotUnavailableWidgetUndeclared`,
`slotUnavailableWidgetData`, `slotUnavailableStaticContent`,
`slotUnavailableEmbedUnresolved`,
`slotUnavailableEmbedCycle`, `widgetEmpty`, `notFoundTitle`, `notFoundBody`,
`navigationLabel`, `transitionContinue`, `transitionPending`,
`transitionFailed`, `transitionTargetUnresolved`,
`transitionTargetCollision`, `transitionNoResponseActions`,
`transitionTriggerUnresolved`, `transitionTriggerAmbiguous`,
`transitionNoExecutor`, `transitionSuppliedBySlot`, and `transitionFireable`.

The Locale schema and the runtime string inventory MUST contain the same set,
one-for-one. No processor may add a free-form shell key or accept a compatibility
alias. Shell strings use Locale's FEL `{{expression}}` interpolation only. The
legacy Surface-only `{name}` replacement is not a template language and MUST
remain literal text.

The shell exposes a read-only FEL context for these strings. It contains
`$widgetName` for widget-unavailable keys, `$target` for
`transitionContinue`, `$to` for transition-target keys, and `$trigger` for
transition trigger/executor/status keys. Keys not named here receive no
shell-specific variable. Missing variables follow Locale's ordinary FEL
interpolation behavior; the shell MUST NOT run a second interpolation pass.

Fallback remains target-bounded. An app-targeted shell string may fall back only
through Locale documents for that same App Manifest target, never to a
Definition-targeted Locale or another app.

**Nothing renders from a missing document.** Where the absent artifact is a whole
document the manifest named — a Definition, an Experience, a Registry — the
failure is at bundle dereference, before any route renders, and the shell MUST
report `BUNDLE-DOCUMENT-MISSING` (or `BUNDLE-DOCUMENT-SHAPE` when the URL
resolves to something that is not the artifact it claims) and MUST expose a
single renderability verdict the host can gate on. Reporting every absence at
once is the requirement; throwing on the first tells a host about one absence and
gives it nothing to show a person.

### 3.1 `definition-form`

The slot renders the bound Definition as a live form.

- **Resolution.** `binding.definitionRef` is a URL and resolves against App
  Manifest `definitions[].url` and the loaded Definition's `url` **by exact
  match**. It is not a Definition `name`, local handle, file stem, or
  `identity.id` alias ([surface-spec](surface-spec.md) §5). A
  shell MUST NOT fall back to any of those on a miss.
- **Rendering.** The binding renders the Definition through the medium's
  Formspec renderer, handing it the resolved Theme document for this route (§4)
  and the bundle's flattened Registry entries. `binding.presentation` is a
  renderer-defined hint at v0.2 and carries no normative vocabulary.
- **Response identity.** A route MAY carry more than one `definition-form` slot.
  Each live form instance is a separate Response instance owned by the Core
  Response contract ([surface-spec](surface-spec.md) §5.1). A
  shell MUST keep those instances distinct and MUST NOT infer which Response an
  action targets from the Definition URL alone, from the current route alone, or
  from where a control sits in the rendered tree
  ([response-actions-spec](../response-actions/response-actions-spec.md)
  §7.1).
- **Absent target.** Unavailable placeholder plus `BUNDLE-DOCUMENT-MISSING` at
  dereference. A shell MUST NOT render an empty form, a form built from a
  different Definition, or a form built from the Experience document's
  `itemRefs`.

### 3.2 `experience-unit`

The slot renders the authored, human-facing content of one Experience unit — the
*why this screen exists* copy.

- **Resolution.** `binding.unitRef` resolves to a `units[].id` in the resolved
  Experience document; `binding.experienceRef` disambiguates when the bundle
  carries more than one Experience.
- **Rendering obligation, and a hard boundary.** A shell MUST render only the
  unit's authored human-facing strings — `title` and `description`. It **MUST
  NOT** derive fields, controls, widgets, ordering, or page structure from
  `itemRefs`, `conceptRefs`, or `actionRefs`.
  [experience-spec](../experience/experience-spec.md) §1.4.1 prohibition
  2 forbids treating Experience as authoritative for *"layout, widget selection,
  or page composition"*, and §5.2 closes `unit.kind` precisely so *"units do not
  become layout containers."* A shell that renders a unit's `itemRefs` as inputs
  has made Experience a layout container at runtime, which is the failure mode
  the closure was written to prevent.
- **`needRefs` are not respondent-facing.** A Unit MAY carry `needRefs`
  ([needs-spec](../needs/needs-spec.md) §7). A need's `description` is
  design rationale *about* the person, not copy *for* them. A shell MUST NOT
  render need descriptions on a respondent-facing route by default; exposing them
  is a reviewer-tooling posture the host opts into explicitly.
- **Absent target.** Unavailable placeholder plus `EXPERIENCE-UNIT-UNRESOLVED`.
  A shell MUST NOT fall back to another unit, to the document `title`, or to the
  slot's own `title`.

### 3.3 `module-widget`

The slot renders a widget a declared module supplies. This is the substrate's
only runtime extension point inside a route.

- **Resolution.** `{moduleId, widgetName}` resolves through Registry identity:
  the module named by `moduleId` MUST appear in the enclosing document's
  `modules[]` (lint `E603` owns this at authoring time), and `widgetName` matches
  the `widget` contribution's **`widgetShape.widgetName`** — not the
  `RegistryEntry.name` ([ADR 0160](../../../thoughts/adr/0160-mcp-materialisation-verbs.md)
  §2.4, §8.1). Three fields in the graph are called some variant of *widget
  name*; a shell that keys on the wrong one silently mis-resolves the day two
  vocabularies collide.
- **Three resolution outcomes, and they are different diagnostics.**

  | Outcome | Meaning | Diagnostic |
  |---|---|---|
  | resolved | A Registry in the bundle declares the widget **and** a registered module implements it. | — |
  | undeclared | No Registry in the bundle declares this widget. | `WIDGET-UNDECLARED` |
  | unimplemented | A Registry declares it; nothing the host registered implements it. | `WIDGET-UNIMPLEMENTED` |

  Collapsing the last two loses the only information that says who fixes it —
  *undeclared* is an authoring defect, *unimplemented* is a deployment defect.

  **`WIDGET-UNDECLARED` reports declaration, not delivery, and MUST fire even
  when the host has a component for the widget.** A host that registers a
  component the bundle never declared is rendering something outside the signed
  graph. Suppressing the diagnostic because the pixels happened to work makes
  host-supplied content indistinguishable from bundle-declared content, which is
  the one distinction a signed bundle exists to make. A shell MAY render it; it
  MUST say it did.
- **Configuration.** `binding.config` is validated against the contributing
  module's `widgetShape.props` at authoring time by lint `E604`. A shell MUST NOT
  re-derive that validation and MUST NOT drop keys it does not recognise.
  Configuration is static authored input. It is not runtime data.
- **Data.** Registry 1.1 declares each input as
  `{name, required, description?}` in `widgetShape.dataInputs[]`. Surface 0.2
  binds that exact name through
  `binding.dataBindings[inputName] = {catalogRef, sourceRef}`. `catalogRef` MUST
  exactly match one App Manifest `dataSources[].url`; `sourceRef` MUST exactly
  match one source published by that loaded Data Sources 1.0 catalog. A shell
  MUST NOT derive a source from the widget name, `config`, a query string, file
  order, or a filename.

  Resolution occurs in the loaded App Manifest at the exact Surface, route,
  slot, and matching module widget. A source availability selector may cover
  that widget at the app, exact Surface, exact route, exact slot, or matching
  module level. Definition-only availability does not cover a module widget.
  The catalog must also be manifested and loaded, and the qualified source must
  resolve.

  Data Sources 1.0 remains authoritative for source schemas, authorization,
  delivery, failure, caching, staleness, and provenance. The shell supplies the
  widget one read-only object keyed by declared input name. An absent optional
  input is absent from that object. A missing, failed, unauthorized, stale when
  disallowed, or schema-invalid required input makes the widget unavailable and
  reports `WIDGET-DATA-REQUIRED-UNAVAILABLE`. The shell MUST NOT substitute
  `null`, `{}`, a sample, `config`, or another source. Data Sources stays at
  version 1.0; this channel does not create a Data Sources 1.1 alias.
- **Actions.** Registry 1.1 declares each output as
  `{name, description?}` in `widgetShape.actionOutputs[]`. Surface 0.2 binds
  that exact name through
  `binding.actionBindings[outputName] = {actionRef}`. The resolved Registry
  output, Surface binding, and Response Actions action are all REQUIRED before
  the output can fire. Validation rejects undeclared outputs, unmapped outputs
  used as trigger sources, unresolved actions, and a widget output that would
  select more than one transition.

  The widget receives one capability: `emitAction(outputName)`. It receives no
  route table, navigation function, Response Actions executor, or raw
  `actionRef`. It cannot name an action or destination outside the authored
  output map. The shell maps the output to `actionRef`, starts the Response
  Actions invocation, and applies §5.3.

### 3.4 `static-content`

The slot renders inline literal content. The `kind` vocabulary is closed at v0.2
in `schemas/surface.schema.json` and
[surface-spec](surface-spec.md) §5 and is not restated here.
A shell MUST dispatch exhaustively over it; an unrecognised `kind` is a schema
violation, not a rendering decision. If malformed runtime input nevertheless
contains one, the shell MUST produce an unavailable slot plan, report
`STATIC-CONTENT-KIND-UNKNOWN`, and render no content for that slot.

**Content is literal text.** For every kind, `binding.content` MUST be rendered
as text. A shell MUST NOT interpret it as HTML, Markdown, or any markup, and MUST
NOT resolve `$token.` or FEL syntax inside it. `static-content` is the one slot
type whose payload comes straight out of the document; treating it as markup
turns a signed bundle into an injection vector.

#### 3.4.1 The heading-level contract

**`level` is a rank within the route, not a document heading level.** The shell
owns the document outline; the author owns relative emphasis. A conformant shell
computes:

```
rank      = level when level is a finite number, rounded and clamped to 1..6
          = 1 otherwise (absent, null, non-numeric, non-finite)
effective = clamp(1, 6, headingBaseLevel + rank - 1)
```

where `headingBaseLevel` is the level at which the enclosing route's own content
begins. `headingBaseLevel` is `2` for a top-level route — the route's own title,
when the binding renders one, is the single `h1` — and increments by one, clamped
at 6, for each `embed-route` nesting level (§3.5).

The `- 1` is what makes `level` a rank rather than an offset: the lowest authored
rank sits *at* the baseline, so an authored `level: 1` on a top-level route
renders `h2` and an unlevelled heading renders at the same place. A shell MUST
NOT read `level` as an absolute HTML heading level. The schema defines a rank
from 1 through 6; treating that rank as an absolute document level does not
compose and can put a second `h1` on a route.

Three obligations follow, and they are the accessibility contract:

1. **At most one `h1` per rendered document.** Whatever occupies level 1 —
   normally the route title the binding renders, or host chrome when the host
   moves the baseline — occupies it alone. When the shell renders the route
   title, `headingBaseLevel` is 2 and a `static-content` heading slot therefore
   cannot produce an `h1`; a host that renders its own page heading and passes
   `headingBaseLevel: 1` has taken that responsibility on, and the shell honours
   the baseline it was given.
2. **Nesting steps down, never up.** Content inside an `embed-route` renders at a
   strictly deeper level than the route embedding it, because it visually sits
   inside it.
3. **The host MAY move the baseline.** A shell embedded inside host chrome that
   already owns the page's `h1` MUST accept a host-supplied `headingBaseLevel` and
   offset from it. A shell that hard-codes the outline cannot be embedded.

A shell SHOULD NOT skip levels. Where authored ranks would skip — a route whose
only heading is `level: 3` — a shell MAY normalize a route's authored ranks to a
gapless ascending sequence that preserves their relative order, and MUST NOT
reorder them.

#### 3.4.2 The image accessible-name contract

`kind: image` carries `content` (a URL or asset ref) and the REQUIRED `alt`
string. A shell therefore:

- **MUST** preserve `binding.alt` exactly as authored.
- **MUST** treat `alt: ""` as an explicit decorative declaration and remove the
  image from the accessibility tree.
- **MUST NOT** synthesize or replace alternative text from `slot.title`,
  `binding.content`, a URL, a filename, Registry metadata, or any other field.
- **MUST** treat malformed runtime input that omits `alt` as unavailable and
  report `STATIC-IMAGE-NO-ALT`. A schema-valid Surface 0.2 image cannot take
  this branch.
- **MUST NOT** hand `binding.content` directly to a binding for dereferencing.
  The host supplies a synchronous static-asset resolver that receives the
  authored source and the slot's document-vocabulary site. The resolver returns
  either an admitted runtime source or a refusal. With no resolver, a refusal,
  or an empty admitted source, the core produces an unavailable slot plan and
  reports `STATIC-IMAGE-SOURCE-REFUSED`. The resolver is where a host applies
  its origin allowlist and maps private asset references; the shell does not
  invent either policy.

Surface 0.2 also forbids `alt` on non-image static content. This keeps the field
conditional rather than turning it into a generic slot label. Surface 0.1
documents do not gain an `alt` alias; authors migrate the document to 0.2.

`kind: divider` MUST be presentational only: no accessible name, not focusable,
and `content` MUST NOT be rendered as text even when non-empty.

### 3.5 `embed-route`

The slot renders another route of the **same** Surface inside the host route.

- **Resolution.** `binding.routeRef` MUST name a route in the same Surface
  document. `E607` owns this at validation time; the shell reports
  `EMBED-ROUTE-UNRESOLVED` and renders an unavailable placeholder. A shell MUST
  NOT resolve `routeRef` across Surfaces — cross-Surface composition is outside
  Surface v0.2 and outside what either document records
  ([ui-graph-policy-spec](../app-graph/ui-graph-policy-spec.md) §5.7,
  *Where the check still under-approximates*, item 1).
- **Parameters.** When the target declares `params[]`, `binding.params` MUST
  supply every one ([surface-spec](surface-spec.md) §3;
  `E610`). Missing values at runtime are `ROUTE-PARAM-UNSUPPLIED`.
- **Cycles.** `routeRef` is constrained to a route id, not to an acyclic graph,
  so cycles are authorable. A shell MUST traverse with a visited set, MUST
  terminate, and MUST report `EMBED-ROUTE-CYCLE` naming the chain. Cycle
  termination is a requirement of this dispatch, not an optimisation — the same
  posture `THEME-ROUTE-CLASS` takes on the same edges.
- **The embedded route renders under the host route's theme grant, never its
  own.** This is §4.4 and it is the load-bearing property of this slot type.
- **Heading levels step down** by one per nesting level (§3.4.1).
- **The embedded route's transitions belong to the embedded route.** A transition
  declared on an embedded route targets a route of that Surface and, when fired,
  navigates the whole app — an embed is a rendering composition, not a nested
  navigation context.

---

## 4. The Theme Boundary

This is the section the seam exists for. `THEME-ROUTE-CLASS`
([ui-graph-policy-spec](../app-graph/ui-graph-policy-spec.md) §5.7)
refuses a tenant Theme assignment at authoring time. Until a shell existed,
nothing enforced the same refusal at render time, and the spike measured a
renderer actively undoing it. This section is that runtime half.

### 4.1 Authority Is Derived Structurally, Never Restated

A conformant shell MUST derive each route's theme grant by **looking the route's
`routeClass` up in the shipped route-class → theme-authority map**, exported for
this purpose from the app-graph package as `ROUTE_CLASS_THEME_AUTHORITY`.

A shell MUST NOT:

- enumerate route-class values in its own source;
- enumerate the refusing set (it is derived from the map, and the derived set is
  exported as `TENANT_THEMING_REFUSING_ROUTE_CLASSES`);
- test for `intake` by string comparison;
- carry a `default` branch over the vocabulary.

The map is built with no default arm, so a new member fails compilation at the
decision site ([ADR 0161](../../../thoughts/adr/0161-route-class-and-rendering-ring-boundary.md)
§1 Validation record). A shell that restates the vocabulary discards that
property: the vocabulary was already falsified once by its own closure test and
corrected (ADR 0161 §6.1), and a restating shell would have kept enforcing the
falsified partition after the correction shipped.

**Which values admit and which refuse is not this document's to say, and is not
repeated here.** The vocabulary and its per-value reasoning live in
[surface-spec](surface-spec.md) §3 Route Class; where each
refusal's authority comes from — including the two rows ADR 0161 §5.1 records as
enforced on authority no port holds — lives in the ADR 0161 §5 pin register.

### 4.2 The Refusal Invariant

> **Invariant TB-1.** For any route whose class the shipped authority map
> resolves to `refuses`, and for any route with no declared class (§4.3), no
> value originating in the tenant Theme document appears in any Theme document,
> token map, style declaration, or custom property that the shell hands to, or
> emits for, that route's subtree.

TB-1 is stated over **observable output**, deliberately. A conformance suite
asserts it by rendering the route and reading the emitted token set — not by
inspecting the shell's code paths, and not by checking that a particular
variable was `null`. An implementation may reach the invariant any way it likes;
what it may not do is satisfy a structural proxy while a tenant value reaches
the screen.

Two consequences a conformance test can assert directly:

1. **Structural, not cosmetic.** The bar is not *"the route looks unbranded."* It
   is that no code path exists which could put a tenant token there. The tenant
   Theme document SHOULD have exactly one reader in a shell — the theme-grant
   resolver — called once per route at the route boundary, with only the resolved
   grant crossing into rendering. A grep that finds a second reader is a finding.
2. **A refusing route still receives a Theme document.** It is built from the
   platform token vocabulary and never read the tenant Theme. Handing a refusing
   route *nothing* is the wrong mechanism even though it satisfies TB-1: a
   renderer handed no theme falls back to its own bundled default, which moves
   the choice of platform styling from the shell's boundary into the renderer,
   and it creates a null branch that a later prop can fill in with the tenant
   theme. Every route receives the same type; only the contents differ.

**On an admitting route, the platform theme layers *under* the tenant theme.** A
tenant Theme that sets one token MUST NOT drop the platform's spacing, radii, and
remaining colours. The tenant's tokens override the platform's key by key; the
platform's remainder survives.

**Derived tokens are not emitted into the platform token map.** A token entry
that declares `derivedFrom` resolves through its source when a Theme leaves it
unset ([token-registry-spec](../theme/token-registry-spec.md) §2.5).
Emitting it explicitly would give every Theme a value for it and the derivation
could never fire — a tenant who sets only the brand token would keep the platform
focus ring, which is the exact failure that field exists to prevent.

**An undeclared non-`x-` tenant token is never aliased.** The platform token
registry is the closed vocabulary and the brand key is `color.primary`; there
is no second brand key and processors MUST NOT alias one onto it
([token-registry-spec](../theme/token-registry-spec.md) §2.4). Registry-aware
validation reports undeclared keys as `THEME-TOKEN-UNREGISTERED`. Runtime
rendering MUST NOT depend on the Registry being loaded and does not mint a
second diagnostic for the same authoring defect.

### 4.3 An Absent Route Class Refuses

> **Decision.** A route that declares no `routeClass` MUST NOT receive tenant
> Theme tokens, and the shell MUST report `THEME-UNCLASSIFIED-REFUSED` naming the
> route. Absence MUST NOT be collapsed into any declared class, and in particular
> MUST NOT be reported or handled as `operation`.

*This is this specification's own decision.* ADR 0161 §6 establishes that absence
is a distinct state — `routeClass` is OPTIONAL with no default, and *"processors
MUST NOT read absence as `operation`"* — and then says nothing about what a
renderer does with it. The spike's ledger recorded the question verbatim:
*"Reading absence as 'refuse' is as much an invention as reading it as 'admit';
the shell had to pick one and the spec should."* This is the spec picking.

**The reasoning.**

1. **The authoring rule and the runtime rule are different questions, and the
   authoring answer does not settle the runtime one.** `THEME-ROUTE-CLASS` is a
   *refusal* rule: it invalidates an authored assignment. A refusal keyed on a
   class cannot fire against a route that states none, so an unclassified route
   correctly produces no diagnostic and old documents keep passing validation. A
   shell asks a different question — *does this route get tenant tokens?* — and
   that question is total. It has no "no answer" branch. **The absence of a
   refusal is not the presence of a grant.**
2. **A guarantee cannot be derived from silence, and Surface already says so.**
   [surface-spec](surface-spec.md) §3 Route Class: a Surface
   whose routes are unclassified *"is not trust-classified: a host that relies on
   a `routeClass`-keyed guarantee SHOULD require the routes it depends on to
   state a class, because a guarantee cannot be derived from silence."* Granting
   tenant theming on an unclassified route derives exactly such a permission from
   exactly such a silence.
3. **The fail-open alternative is the shape ADR 0161 already corrected once.**
   §6.1's closure test found the shipped vocabulary fail-open precisely because
   its residual bucket admitted: *"A closed taxonomy whose residual bucket admits
   is fail-open."* An unclassified route is the residual of the residual. Granting
   it would reintroduce the corrected defect one level up, and would do so on
   every route authored before anyone thought about classification — which is the
   population most likely to contain an unexamined credential page or an
   unexamined receipt.
4. **The two failure modes are not comparable in cost.** Failing closed withholds
   a tenant's brand on a route the tenant can fix with one authored field
   (`routeClass: intake`), and the shell says so. Loud, cheap, and the repair
   raises classification coverage — which is what ADR 0161 §9 item 3 asks for
   anyway. Failing open repaints a certificate, a ceremony, or a credential page
   in a tenant's brand and nothing anywhere says a word. Loud-and-cheap beats
   silent-and-severe.
5. **The cost is bounded and it is not a broken page.** A refusing route still
   receives a full platform Theme document (§4.2). The route renders; it renders
   in platform chrome. The tenant loses brand, not function.

**The companion specifications state the two decisions separately.**
[surface-spec](surface-spec.md) §3 says an absent class cannot fire an
authoring-time refusal and the document remains publishable. This section
answers the separate runtime question: absence grants no tenant theme authority,
so the shell uses platform theming and reports the withheld grant.

**What this does not change.** Unclassified remains a distinct state everywhere
else: it produces no `THEME-ROUTE-CLASS` diagnostic, it is not reported as
`operation`, its own diagnostic code is distinct from every class-keyed refusal,
and a Surface whose routes are unclassified remains publishable and
conformance-coherent.

**A shell MUST carry a three-valued posture — admits, refuses, unclassified — and
MUST NOT reduce it to a boolean.** A boolean cannot distinguish *a class was
stated and it refuses* from *no class was stated*, which is the distinction ADR
0161 §6 spends a section establishing and the one §7.3's fire table keys on.

### 4.3.1 Exposing the Posture Without Authoring Chrome

A shell MUST expose each route's posture and the reason for it to the host —
programmatically, and in a form a host can log, alarm on, and display.

**Presenting that reason to the person MUST NOT be on by default.** *This
specification's own decision.* On an admitting route it carries no information;
on any route it is chrome the bundle did not author, appearing on a respondent's
screen above content that was signed. §1.3 principle 2 forbids the shell
supplying copy the artifacts do not declare, and a theme-posture paragraph is
copy. A host that wants the refusal visible — and there is a real trust argument
for showing it on `proof` and `ceremony` routes — opts in.

Where a shell ships default wording for the posture, that wording is product
copy, not authority: it MUST be keyed by the vocabulary so it cannot drift out of
sync (a total map over the route classes, checked at build time), and it MUST NOT
be the place any rule is decided (§4.1).

### 4.4 Composition: The Host Route's Grant Reaches the Embed

An `embed-route` slot renders another route inside the host route, so the
embedded route's slots paint on the host's surface. **The theme grant that
applies to every slot rendered inside an embed is the *host* route's grant,
transitively, at any depth.**

This mirrors [ui-graph-policy-spec](../app-graph/ui-graph-policy-spec.md)
§5.7 *Composition* exactly, and the three consequences it states hold at runtime
unchanged:

- An embedded route's own class is a **floor on its protection, never a ceiling
  on its host's**. Declaring `intake` one hop below a `proof` route does not buy
  the repaint back. Protection is a property of the rendering context, not a
  permission the embedded document can waive.
- Protection does **not** flow upward. A `proof` route embedded inside an
  unclassified operator screen does not make the surrounding chrome
  proof-bearing.
- Reading only the host route's own `slots[]` would let one schema-valid hop
  restore the entire violation.

A shell that resolved the grant per slot from the slot's owning route, rather
than per rendered subtree from the route that composed it, has the composition
inverted.

### 4.5 Token Emission Scoping

[theme-spec](../theme/theme-spec.md) §3.7 owns the cross-renderer token-layering
and emission rules. This section applies them to the Surface Shell boundary.

> **Invariant TB-2.** A conformant shell emits Theme tokens only onto an element
> it owns and controls the lifetime of, removes them when that element unmounts
> or its theme changes, and never writes them to the document root, the document
> body, or any node supplied by the host.

**This is the runtime half of the ADR 0161 promise, and it exists because the
promise was broken in shipped code.** The motivating defect: `FormspecProvider`
called the token emitter with no target, which defaulted to
`document.documentElement`, and never cleaned up. Measured against the running
app: zero Formspec custom properties on `<html>` at a fresh load, forty-six after
an `intake` route rendered once, and still forty-six — tenant brand among them —
after client-side navigation to a `proof` route. The tokens survived unmount,
survived navigation to a refusing class, and reached everything outside a form
container: host chrome, a second embedded renderer, any skin that paints the
brand token. Evidence:
[`spikes/surface-render-v10/evidence/r3-document-root-leak.json`](../../spikes/surface-render-v10/evidence/r3-document-root-leak.json).
Fixed in [`packages/formspec-react/src/context.tsx`](../../packages/formspec-react/src/context.tsx),
which now renders a provider-owned scope element and emits onto it with unmount
cleanup; the permanent test is
[`packages/formspec-react/tests/theme-token-scope.test.tsx`](../../packages/formspec-react/tests/theme-token-scope.test.tsx).

Three requirements follow, each fixing one half of that defect:

1. **Ownership.** The emitting element MUST be created and destroyed by the
   emitting component. A host node the shell did not create has a lifetime the
   shell cannot reason about.
2. **Cleanup.** Tokens MUST be removed on unmount and on theme change. Without
   cleanup, TB-1 holds for the route being rendered and fails for the route
   rendered after it, which is the harder failure to notice.
3. **No global write, ever.** A host composing a leaking provider **can clean up
   after a global write but can never prevent one**. That asymmetry is why this
   is a MUST on the emitter rather than a recommendation to hosts: a workaround
   that scrubs `<html>` on every refusing route is a host doing the renderer's
   job, and it fails the moment a host forgets.

**A shell MUST NOT implement TB-1 by scrubbing.** If a shell finds tenant
properties on the document root, the correct response is to report them, not to
remove them: a shell that manufactures the property it reports is not measuring
anything, and the leak it silently repairs stays broken for every consumer that
is not this shell.

Two properties make the scope element safe to require in a DOM medium and are
stated so bindings do not each rediscover them: the element must generate no box
of its own (`display: contents`, set inline so it holds even when no stylesheet
is loaded), and custom properties inherit through it regardless of display, so
the tokens reach exactly the owned subtree and nothing above it.

In a non-DOM medium the invariant is unchanged and the mechanism differs: tokens
scope to the rendered subtree the shell owns, and no global or ambient style
state outlives it.

---

## 5. Transition Triggers

A Surface transition is `{trigger, to}` with optional `when` and `params`.
Surface declares the navigation edge; Response Actions executes the trigger. The
spike hit the case the two specs together do not resolve: **a route declaring a
transition that nothing on that route can fire.** The signed rent-assistance
bundle contains one — `/certify` declares `{trigger: "submit", to: "receipt"}`,
carries no form and no action-bearing slot, and is therefore authored,
schema-valid, signed, and dead.

### 5.1 The Rule

> **Decision.** The bundle MUST declare the trigger source. A shell MUST NOT
> supply a default affordance for a declared transition — no synthesized
> Continue, Next, or Submit control, under any label, on any route.

*This is a decision the existing specs already determine; it is stated here
because it had never been written at the layer that has to obey it.* Two
independent statements settle it:

- [surface-spec](surface-spec.md) §5.1: a router *"MAY
  advance after the referenced action completes successfully under Response
  Actions authority; it MUST NOT infer success from a click, a rendered button,
  or a validation summary."* A shell-supplied Continue button is that inference
  wearing a label. Shipping one as a default would put a spec violation in every
  host by construction.
- [response-actions-spec](../response-actions/response-actions-spec.md)
  §10: *"There is no implicit default Action, no free-string fallback, and no
  legacy SubmitButton behavior."* Layout processors *"MUST NOT execute actions,
  infer validation behavior, or invent an implicit Response Action."* A shell is
  further from the action than a layout processor, not closer.

### 5.2 What Counts as a Trigger Source

A route **can fire** a transition `T` when it renders a control bound to an
action that resolves `T.trigger`. `ActionButton.actionRef` is the canonical
widget binding to a Response Action
([response-actions-spec](../response-actions/response-actions-spec.md)
§10), so the question reduces to: which slot types can put one on a route?

| Slot type | Can be a trigger source | Why |
|---|---|---|
| `definition-form` | **yes** | The Formspec renderer materializes action controls for the loaded Response Actions document against the rendered Definition. This is the only slot that reaches a Component action binding. |
| `embed-route` | **yes, transitively** | The embedded route's slots render on the host route's surface, so a control it renders is a control the host route renders — the same transitivity §4.4 applies to the theme grant. |
| `experience-unit` | no | A Unit's `actionRefs` *name* actions; they do not place controls. Experience is not authoritative for widget selection ([experience-spec](../experience/experience-spec.md) §1.4.1 prohibition 2), so a shell that drew a button from an `actionRef` would be deriving layout from Experience. |
| `module-widget` | **yes, when declared and mapped** | Registry 1.1 declares the output name, Surface 0.2 maps it to one exact Response Actions action ID, and the transition resolves that completed action. Private widget behavior and unmapped output names do not count. |
| `static-content` | no | Literal content. |

The `module-widget` rule is exact. Merely placing a widget on a route proves
nothing. A validator credits the widget only when all three names resolve:
Registry `actionOutputs[].name`, Surface `actionBindings[outputName].actionRef`,
and the Response Actions `actions[].id`. It MUST NOT interpret an output name as
an action id, route id, or generic intent.

`T.trigger` itself resolves per
[surface-spec](surface-spec.md) §4: a Response Actions
`actions[*].id`, or a closed-core intent declared by exactly one loaded action.
A trigger that resolves to neither is already a cross-artifact validation error
and is not this section's concern — one defect, one code.

### 5.3 Runtime Posture

For each transition on the matched route a shell resolves one of five states,
and MUST expose which:

| State | Condition | Shell behaviour |
|---|---|---|
| `supplied-by-slot` | A slot on the route (transitively through `embed-route`) resolves the matching action **and the selected binding actually renders or publishes that control**. | Render nothing additional. The authored control is the affordance. |
| `fireable` | The trigger resolves against a loaded Response Actions document **and** the host has supplied an executor for it. | Expose the transition as fireable. A binding MAY render a control for it — **supplying the executor is the host asking**, which is what makes this not a default affordance: with no executor there is no control, under any label. |
| `unfireable` | Neither of the above. | Render no control. Report `TRANSITION-UNFIREABLE`, naming which half is missing. |
| `condition-false` | `when` evaluates to `false` against validated bundle-state bindings. | Keep the transition dormant. Render no control and emit no diagnostic. |
| `condition-unevaluable` | `when` cannot be evaluated against validated bundle-state bindings, including an evaluator failure. | Keep the transition dormant and report `TRANSITION-CONDITION-UNEVALUABLE`. |

The public transition plan MUST keep state separate from refusal cause. When
`status` is `unfireable`, it MUST also carry `unfireableReason` with exactly one
of these values:

| `unfireableReason` | Meaning |
|---|---|
| `no-response-actions-document` | No loaded Response Actions document can resolve a trigger. |
| `trigger-unresolved` | Loaded Response Actions documents do not publish the trigger unambiguously. |
| `no-executor` | The trigger resolves, but the host supplied no executor. |
| `target-unresolved` | `to` names no route in the same Surface. |
| `target-path-collision` | `to` resolves to a retained qualified route record, but its person-facing URL is collision-refused (§2.4). |

No refusal cause is a sixth state. A binding MUST switch on the five-state
`status` vocabulary above and MAY use `unfireableReason` to present or log the
specific refusal.

**Resolving `supplied-by-slot` is a walk, not a lookup.** The scan for a trigger
source MUST descend `embed-route` slots transitively (§5.2), and MUST resolve the
trigger through the loaded Response Actions document — matching an action `id`,
or an intent published by exactly one action — rather than testing for a
particular intent string. Resolution alone is insufficient: the binding must
materialize the matching control. For example, a form renderer that places only
its `submit` action may credit that action, but MUST NOT claim every other action
targeting the same Definition. A shell that scans only a route's own `slots[]`,
hardcodes one intent, or treats form presence as proof of every action substitutes
a shortcut for the resolution rule Surface §4 and the binding's actual output.

On `unfireable` a shell **MUST NOT** render an interactive control, MUST report
the diagnostic, and SHOULD make the state perceivable to the person rather than
leaving a dead end with no explanation. The wording of any such notice is the
binding's. `E611` warns about validator-visible cases before runtime, but a host
executor or private widget behaviour may still affect the runtime posture.

A shell MUST NOT advance a transition on its own initiative. It advances only
after the host reports a Response Action terminal result with
`status: "completed"`, a resolved action identity, and a validation report whose
`valid` field is `true`. Failed, deferred, blocked, unresolved, or invalid
results do not advance, including a nonblocking invalid result. The shell MUST
NOT infer success from a click, a rendered control, a validation summary alone,
or the absence of an error.

For each widget emission, the host:

1. allocates one stable invocation ID;
2. coalesces duplicate in-flight delivery for the same route/session generation,
   slot, output, and invocation ID;
3. maps the declared output to its exact `actionRef`;
4. delegates preconditions, effects, `retry-once`, frozen idempotency keys, and
   durable replay to Response Actions;
5. ignores a completion from an obsolete route or session generation; and
6. after a successful current-generation terminal result, follows exactly one
   eligible Surface transition at most once.

A Response Actions retry preserves the invocation ID and Response snapshot. It
does not emit a second logical action. A durable prior outcome is replayed
instead of executing the effects again. Zero eligible transitions leaves the
current route unchanged and reports the result. More than one eligible
transition is an authoring or validation failure; runtime MUST NOT choose by
document order. Surface remains the transition planner and Response Actions
remains the action executor.

`when`, where present, is an FEL boolean over bundle state. A shell MUST NOT
evaluate it against renderer-local state. False is the expected dormant
`condition-false` state. Missing bindings, unsupported expressions, or evaluator
failure are `condition-unevaluable`; the shell reports the diagnostic and does
not fire.

### 5.4 `E611` — Catching It Before Publication

The runtime posture above is the last line. The defect belongs upstream: `E606`
walks the route graph for **reachability** and never asks whether an edge can be
**traversed**, and the cross-artifact trigger check asks only whether a trigger
resolves against a loaded Response Actions document — so it fires on a trigger the
document contradicts and stays silent on a route with no way to raise the trigger
at all. The missing rule is per-route, not per-document.

> **Lint code.** `E611` — `SURFACE-TRANSITION-UNFIREABLE`, severity `warning`,
> pass: cross-artifact / app-graph. It is registered in
> `specs/lint-codes.json` in the Surface band alongside `E606`, `E607`, and
> `E610`.

**Inventory ownership.** `specs/lint-codes.json` is the sole normative lint-code
inventory. The lists in §1.2 and §8.2 are explanatory ownership boundaries, not
copies of the registry; Appendix C is a locator. Generated code and guidance
derive from the registry.

**Rule.** For every route `R` and every transition `T` in `R.transitions[]` whose
`trigger` resolves, `R` MUST contain — directly or transitively through
`embed-route` — at least one slot of a type §5.2 admits as a trigger source, whose
resolved artifact can produce `T.trigger`. For a `definition-form` slot, "can
produce" means the loaded Response Actions document publishes an action whose
`id` equals `T.trigger`, or whose `intent` equals `T.trigger` and is declared by
exactly one loaded action, targeting the Definition that slot binds.
For a `module-widget` slot, it means Registry 1.1 declares the output, Surface
0.2 maps that output to the exact action id, and that completed action selects
`T` without ambiguity.

**Suggested fix (authoring-loop hint).** *"Add a `definition-form` slot whose
Definition publishes this trigger, map a declared widget output to the action,
embed a route that has one of those sources, or remove the transition."*

**Fire / does-not-fire.**

- *Fires when:* a route declares a transition whose trigger resolves against the
  loaded Response Actions document, and no slot on that route — directly or
  through any `embed-route` chain — is a trigger source per §5.2 that can produce
  it.
- *Does not fire when:* the trigger does not resolve at all (the cross-artifact
  trigger check owns that defect — one defect, one code); the route has a
  `definition-form` slot whose Definition's Response Actions publish the trigger;
  the route has a Registry-declared widget output mapped to the trigger's action;
  an `embed-route` chain reaches such a route; the route declares no
  `transitions[]`; or no Response Actions document is loaded, which collapses to
  the first case.

**What `E611` deliberately does not check.** Whether the person can *reach* the
control — relevance, authorization, precondition, or `when` — is runtime state.
`E611` asks only whether a control that could produce the trigger is declared to
exist on that route. A statically declared control that a precondition always
blocks is a Response Actions concern, not a Surface one.

`E611` is a warning because authoring-time validation cannot see a
host-supplied executor. Registry 1.1 and Surface 0.2 provide validator-readable
widget action evidence; private host behavior still does not. A host MAY elevate
the diagnostic.

---

## 6. Verification Before Render

### 6.1 The Rule

> **Decision.** A **Verifying Surface Shell deployment** MUST have its host
> verify a signed bundle export and produce one canonical verdict —
> `verified`, `failed`, or `unverified` — before the core or binding receives
> any bundle-derived input. Only `verified` admits a signed export. The
> deployment MUST NOT render with a warning, render optimistically while
> verifying, render bundle-derived chrome before the verdict, or render a
> partial view of a bundle that did not earn admission.

The stack's claim about this artifact is *the bundle a person signed is the app
people see*. A renderer that paints an unverified or failed bundle and attaches a
warning has already broken that claim: whatever the person saw, they saw it.
Verification is a gate, not an annotation.

Demonstrated end to end in the spike, and falsified on purpose: altering one
character of one Theme token in a signed export flips the verdict to `failed`,
and the app refuses — *"Nothing from the bundle reaches the screen — the person
sees a refusal, not an app with a warning on it."* Evidence:
[`spikes/surface-render-v10/evidence/signature-verification.json`](../../spikes/surface-render-v10/evidence/signature-verification.json).

### 6.2 What "Before First Paint" Means

- **Nothing from the bundle reaches any output before the verdict.** Not a route,
  not a slot, not a title, not chrome. In a browser medium the document title
  MUST NOT be taken from the bundle before verification either — an unverified
  bundle does not get to name the tab.
- **Refusal is total.** On `failed`, the shell renders no route and exposes the
  verdict to the host. What a refusal looks like is the host's, per §1.2.
- **The verdict is durable and available to the host on every route**, because a
  verdict nobody can see is not a trust affordance.

### 6.3 Provenance of the Verification Method

The signature method identifier MUST be read from the signature envelope's
protected header, never from a JSON record beside it. A record claiming a method
the envelope does not carry MUST NOT verify. This is a small rule with a large
failure mode: an attacker who can edit the sidecar record but not the envelope
gets to choose the verification algorithm otherwise.

### 6.4 Unsigned and Unverifiable Inputs

A host MAY receive an unsigned bundle — that is the normal case in authoring and
preview. The render gate is explicit:

| Input | Deployment | Canonical verdict | Bundle-derived output |
|---|---|---|---|
| Signed; verification succeeds | Verifying Surface Shell | `verified` | MAY render. |
| Signed; verification fails | Verifying Surface Shell | `failed` | MUST NOT render. |
| Signed; method or primitive is unsupported | Verifying Surface Shell | `unverified` | MUST NOT render. |
| Unsigned | Explicit authoring preview | `unverified` | MAY render as an unverified preview. |
| Unsigned | Verifying Surface Shell | `unverified` | MUST NOT render. |

The host MUST NOT present an unsigned bundle as verified. An adapter result such
as `unsupported` maps to the canonical `unverified` verdict and remains
available separately as provenance; it does not create a fourth verdict.

The shell core and bindings MUST NOT synthesize or default a verdict — because
no signature was supplied, because the method is unknown, or because the
platform lacks the primitive. Unknown is unknown. A structural helper such as
`bundleIsRenderable` answers only whether required documents are present and
have the expected shape. It neither verifies authenticity nor supplies a
default verdict.

### 6.5 Where Verification Lives

Verification is a **host obligation discharged before the shell is invoked**, not
a shell capability. A shell core takes an already-dereferenced, already-adjudicated
bundle; the host decides whether the bundle earned the right to render. This
keeps the shell free of a cryptographic dependency and free of a key-trust policy
it has no basis to hold, and it is why §6 is stated as the **Verifying Surface
Shell** conformance class (§8.4) — a composition of host and shell — rather than
as a requirement on the shell core.

A host that skips verification on a signed export does not produce a
non-conforming shell; it produces a non-conforming *deployment*, and §8.4 is what
names it.

---

## 7. Diagnostics Registry

### 7.1 Scope and Shape

These are **runtime-composition diagnostics**, distinct from authoring-time
`AppGraphDiagnostic` findings and from `formspec-lint` codes. A shell sees things
neither can: which route the browser is actually on, whether a host supplied an
executor, whether two Surfaces collided in one URL space, whether a token reached
the document root.

The code set is **closed**. An open set is a set nothing can exhaustively handle,
and a host that wants to escalate some codes and ignore others needs the whole
list.

Every diagnostic MUST carry:

| Field | Required | Description |
|---|---|---|
| `code` | yes | A member of the closed set in §7.2. |
| `severity` | yes | `error`, `warning`, or `info`. Fixed per code by §7.2; hosts MAY elevate, MUST NOT demote. |
| `message` | yes | One sentence, addressed to whoever can fix it. |
| `site` | yes | Where it happened, in document vocabulary: `surfaceId`, `routeId`, `slotId`, `source` (manifest slot or document URL). Never a component-tree path — a host reporting this to an author must be able to point at the artifact. |
| `details` | no | Code-specific structured payload. |

A shell MUST NOT throw in place of reporting. Throwing tells a host about one
defect at a time and gives it nothing to show a person.

**Every diagnostic the shell produces MUST reach the host's diagnostic channel,
whatever stage produced it** — bundle dereference, composition, registry
flattening, theme resolution, route planning, slot planning, transition planning.
A diagnostic computed during route planning and surfaced only as on-screen copy
has not been reported: it cannot be logged, alarmed on, counted, or fed back to
an author, and it disappears the moment the route unmounts. Per-route stages
produce most of the codes in §7.2, so a shell that delivers only its
app-construction diagnostics delivers the minority of them.

### 7.2 The Codes

| Code | Severity | Fires |
|---|---|---|
| `BUNDLE-DOCUMENT-MISSING` | `error` | A manifest slot names a URL absent from the export's documents. |
| `BUNDLE-DOCUMENT-SHAPE` | `error` | A manifest slot resolved to something that is not the artifact it claims. |
| `APP-ENTRY-AMBIGUOUS` | `error` | An App Manifest 2.4 app has two or more Surfaces and no `entrySurface` (§2.5). |
| `APP-ENTRY-SURFACE-UNRESOLVED` | `error` | `entrySurface` does not exactly match one loaded `surfaces[].url` (§2.5). |
| `SURFACE-ENTRY-UNRESOLVED` | `error` | A Surface's `entry` names no route in that Surface. |
| `ROUTE-HANDLE-AMBIGUOUS` | `error` | More than one composed route has the same (Surface identity, route id) handle, so handle lookup resolves none (§2.2). |
| `ROUTE-PATH-COLLISION` | `error` | Two or more composed routes produce the same URL path (§2.4). |
| `ROUTE-PARAM-GRAMMAR` | `error` | A route path uses a parameter grammar Surface v0.2 does not pin (§2.3). |
| `ROUTE-PARAM-UNDECLARED` | `error` | A `{name}` marker in `path` has no matching `params[]` entry. |
| `ROUTE-PARAM-NO-MARKER` | `error` | A `params[]` entry has no matching marker in `path`. |
| `ROUTE-PARAM-UNSUPPLIED` | `error` | Entering a parameterized route with no value for a declared parameter (§2.7). |
| `ROUTE-UNMATCHED` | `warning` | No composed route matched the incoming path (§2.6). |
| `EMBED-ROUTE-UNRESOLVED` | `error` | An `embed-route` binding names no route in the same Surface. |
| `EMBED-ROUTE-CYCLE` | `error` | An `embed-route` chain revisited a route already on the chain. |
| `SLOT-TYPE-UNKNOWN` | `error` | Malformed runtime input contains a `slotType` outside the closed Surface vocabulary. |
| `SLOT-BINDING-INCOMPLETE` | `error` | A slot binding lacks a field its `slotType` requires. |
| `EXPERIENCE-UNIT-UNRESOLVED` | `error` | An `experience-unit` binding names no unit in the resolved Experience. |
| `WIDGET-UNDECLARED` | `error` | A `module-widget` binding names a widget no Registry in the bundle declares. |
| `WIDGET-UNIMPLEMENTED` | `error` | The Registry declares the widget; nothing the host registered implements it. |
| `WIDGET-DATA-REQUIRED-UNAVAILABLE` | `error` | A required Registry 1.1 input is unbound or its exact Data Sources value is unavailable (§3.3). |
| `WIDGET-ACTION-OUTPUT-UNDECLARED` | `error` | A widget emits an output its Registry 1.1 shape does not declare (§3.3). |
| `WIDGET-ACTION-OUTPUT-UNMAPPED` | `error` | A declared widget output has no Surface 0.2 `actionBindings` entry (§3.3). |
| `WIDGET-ACTION-REF-UNRESOLVED` | `error` | A widget output mapping names no loaded Response Actions action (§3.3). |
| `WIDGET-ACTION-TRANSITION-AMBIGUOUS` | `error` | A completed widget action selects more than one eligible transition (§5.3). |
| `REGISTRY-ENTRY-NAME-COLLISION` | `warning` | Two Registry documents in one bundle declare the same entry `name`. |
| `STATIC-CONTENT-KIND-UNKNOWN` | `error` | Malformed runtime input contains a static-content `kind` outside the closed vocabulary. |
| `STATIC-IMAGE-NO-ALT` | `error` | Malformed runtime input contains a `kind: image` binding without required `alt`; the slot is unavailable (§3.4.2). |
| `STATIC-IMAGE-SOURCE-REFUSED` | `error` | The host did not admit an authored image source for runtime dereferencing, so the slot is unavailable (§3.4.2). |
| `THEME-UNCLASSIFIED-REFUSED` | `info` | Tenant theming was withheld from a route because it declares no `routeClass` (§4.3). |
| `THEME-DOCUMENT-ROOT-CONTAMINATED` | `error` | The shell observed Formspec custom properties on the document root, which no conforming emitter writes (§4.5). |
| `TRANSITION-UNFIREABLE` | `warning` | A declared transition on the matched route has no trigger source and no host executor (§5.3). |
| `TRANSITION-CONDITION-UNEVALUABLE` | `warning` | A transition's `when` expression cannot be evaluated against validated bundle-state bindings (§5.3). |

Severity reflects the operator response, not whether the shell failed closed.
`THEME-UNCLASSIFIED-REFUSED` is `info` because the shell safely withheld optional
tenant presentation and still rendered platform chrome. `STATIC-IMAGE-NO-ALT`
is an `error` because Surface 0.2 has no valid fallback and the slot is
unavailable.
`TRANSITION-UNFIREABLE` is a `warning` because an authored workflow edge cannot
be traversed, while authoring validation cannot see every host executor.
`STATIC-IMAGE-SOURCE-REFUSED` is an `error` because requested content is
unavailable until the host policy or authored source changes.

### 7.3 Fire / Does-Not-Fire Conditions

Stated for the codes whose boundaries are contested. The remainder fire exactly
as their table row reads.

**`ROUTE-HANDLE-AMBIGUOUS`** — duplicate composed identity. Severity `error`.
Surface Shell Core class.

- *Fires when:* two or more composed routes have the same Surface identity and
  `routes[].id`. Fires once per duplicate group, naming every member.
- *Does not fire when:* two different Surfaces reuse a route id; two routes have
  different ids but the same path (`ROUTE-PATH-COLLISION` owns that); one
  well-formed Surface contains one route with the handle.

**`ROUTE-PARAM-GRAMMAR`** — unpinned route-parameter grammar. Severity `error`.
Surface Shell Core class.
- *Fires when:* a composed route's `path` contains a segment that reads as a
  parameter in a grammar Surface v0.2 does not pin — `:name`, `*`, a regex
  capture, a matrix or query parameter, or a URI Template operator.
- *Does not fire when:* the path uses only `{name}` markers; the path contains no
  markers at all and declares no `params[]` (an opaque path is valid); a literal
  segment merely contains a colon that is not in leading position.

**`ROUTE-PATH-COLLISION`** — two routes, one address. Severity `error`. Surface
Shell Core class.
- *Fires when:* two or more composed routes produce identical segment patterns —
  same segment count, same kind at every index, same literal text at every literal
  index. Paths that differ only by a trailing slash on a non-root path normalize
  to the same address and therefore fire. The diagnostic fires once per
  colliding group, naming every member.
- *Does not fire when:* the routes differ by specificity and §2.4's rule picks one
  (`/receipt/new` vs `/receipt/{caseRef}`); two Surfaces share a `routes[].id` but
  not a path (identity is the pair, §2.2); normalized literal segments differ.

**`ROUTE-UNMATCHED`** — nothing matched. Severity `warning`. Surface Shell Core
class.
- *Fires when:* the incoming path matches no composed route after specificity
  resolution.
- *Does not fire when:* the path matched and was then refused for collision
  (`ROUTE-PATH-COLLISION` owns that); the path is empty or `/` and resolved to the
  app entry route (§2.5); the route matched and a slot inside it failed to
  resolve (§3.0 owns that).

**`STATIC-IMAGE-NO-ALT`** — malformed image input. Severity `error`.
Surface Shell Core class.
- *Fires when:* malformed runtime input reaches planning with `kind: image` and
  no `binding.alt`. The image plan is unavailable.
- *Does not fire when:* a schema-valid Surface 0.2 image carries any string,
  including `""`; `kind` is another value. `slot.title`, URL text, and filenames
  never affect this decision.

**`STATIC-IMAGE-SOURCE-REFUSED`** — no host-admitted runtime source. Severity
`error`. Surface Shell Core class.

- *Fires when:* an image slot reaches planning with no host static-asset
  resolver; the resolver refuses the authored source; the resolver fails; or it
  returns an empty admitted source. The image plan is unavailable in every
  branch.
- *Does not fire when:* the resolver admits a non-empty runtime source. The
  binding receives that admitted source and never the authored source directly.

**`THEME-UNCLASSIFIED-REFUSED`** — theming withheld for want of a class. Severity
`info`. Surface Shell Core class.
- *Fires when:* the shell resolves a theme grant for a route that declares no
  `routeClass`, and a tenant Theme document is present in the bundle.
- *Does not fire when:* the route declares any value in the closed vocabulary,
  including `operation` — absence and a declared class are distinct states and
  this code is only about absence; no tenant Theme is present, so nothing was
  withheld; the route is rendered inside an `embed-route` under a host route that
  declares a class, because §4.4 makes the host's grant the operative one and the
  embedded route's own absence is not what decided anything.

**`TRANSITION-UNFIREABLE`** — a declared edge with nothing to traverse it.
Severity `warning`. Surface Shell Core class.
- *Fires when:* the matched route declares a transition and the shell resolves
  neither `supplied-by-slot` nor `fireable` for it, or the target route's URL is
  collision-refused (§2.4, §5.3).
- *Does not fire when:* a slot on the route or reachable through `embed-route`
  renders the control (`supplied-by-slot`) and the destination is usable; the
  host supplied an executor (`fireable`) and the destination is usable — even if
  the person has not fired it; the transition's `when` currently evaluates
  false, which is a runtime condition and not an absence of machinery; the
  route declares no transitions.

**`TRANSITION-CONDITION-UNEVALUABLE`** — a condition has no trustworthy result.
Severity `warning`. Surface Shell Core class.

- *Fires when:* a transition declares `when` and no evaluator is available; its
  required bundle-state bindings are missing; the expression is unsupported; or
  the evaluator throws or returns no boolean.
- *Does not fire when:* `when` is absent; it evaluates `true`; or it evaluates
  `false`, which is the ordinary diagnostic-free `condition-false` state.

**`THEME-DOCUMENT-ROOT-CONTAMINATED`** — a global write happened. Severity
`error`. Surface Shell Core class.
- *Fires when:* the shell observes Formspec-namespaced custom properties on the
  document root in a DOM medium.
- *Does not fire when:* the shell is running in a non-DOM medium; the properties
  are on an element the shell owns (that is the conforming path, §4.5); a host has
  deliberately set platform-level defaults on the root under its own namespace.
  **The shell reports and MUST NOT scrub** (§4.5).

### 7.4 Codes This Specification Does Not Mint

Recorded so a later slice does not mint them incompatibly:

| Not minted | Because |
|---|---|
| A route-class-refusal code per class | `THEME-ROUTE-CLASS` already exists at authoring time and the runtime refusal is structural, not diagnosable — TB-1 is asserted by reading output, not by counting refusals (§4.2). |
| An unclassified-route *authoring* diagnostic | ADR 0161 §9 item 4 is deliberately silent on `SURFACE-ROUTE-UNCLASSIFIED`. Absence is a distinct state by design, so making it an authoring diagnostic is a decision this spec does not have standing to take. §4.3's `info` is a report of what the shell did, not a judgement on the document. |
| A slot-order or `position` diagnostic | `position` carries no normative vocabulary at v0.2; a shell has nothing to be wrong about. |

---

## 8. Conformance

### 8.1 Classes

| Class | Definition |
|---|---|
| **Surface Shell Core** | A renderer-independent processor that composes, matches, dispatches, resolves theme grants, plans transitions, and reports. |
| **Surface Shell Binding** | A medium-specific renderer of a Surface Shell Core's route plan. Conformance is defined relative to a conformant core. |
| **Verifying Surface Shell** | A deployment — host plus core plus binding — that satisfies §6 on signed bundle exports. |
| **Host Obligations** | Not a conformance class. The checklist a host satisfies for the classes above to mean anything (§8.5). |

### 8.2 Surface Shell Core

A conformant **Surface Shell Core** MUST:

1. Compose every Surface named by App Manifest `surfaces[]` into one flat route
   table in manifest order, with no path prefixing (§2.1).
2. Key every route by (Surface identity, `routes[].id`), require exactly one
   route per handle, and report `ROUTE-HANDLE-AMBIGUOUS` and resolve none when a
   malformed input duplicates one; never key by path, Definition URL, or
   renderer-local state (§2.2).
3. Match paths using `{name}` markers as the only parameter grammar, report
   `ROUTE-PARAM-GRAMMAR` for any other, and treat the offending segment as
   literal (§2.3).
4. Resolve overlapping candidates by the left-to-right literal-beats-parameter
   specificity rule; refuse — never tie-break — a genuine collision; and
   classify a transition to any collision claimant as unavailable before it can
   become `fireable` or `supplied-by-slot` (§2.4).
5. Apply the App Manifest 2.4 zero/one/many rules to select an entry Surface by
   exact URL, never manifest order or local id; then use only that Surface's
   `entry` to select the route (§2.5).
6. Render nothing and report `ROUTE-UNMATCHED` when no route matches; never
   redirect to the entry route (§2.6).
7. Refuse to enter a parameterized route without every declared value, and never
   substitute the parameter name or its `example`; return
   `ROUTE-PARAM-UNSUPPLIED` so a binding can withhold a live link (§2.7).
8. Dispatch schema-valid input exhaustively over the closed slot-type taxonomy
   with no default branch; convert a malformed unknown value to an unavailable
   plan plus `SLOT-TYPE-UNKNOWN` rather than throwing (§3).
9. Distinguish *empty* from *unavailable*, render a placeholder for unavailable
   rather than omitting the slot, and report the matching diagnostic (§3.0).
10. Resolve `definitionRef` by exact URL match with no alias fallback (§3.1).
11. Render only `title` and `description` from an Experience unit, and derive no
    layout, controls, or ordering from its typed references (§3.2).
12. Resolve `module-widget` bindings on `widgetShape.widgetName`, distinguish
    *undeclared* from *unimplemented*, report `WIDGET-UNDECLARED` even when a host
    component exists for it, supply only Registry-declared Surface-bound data
    inputs, and expose only `emitAction(outputName)` for declared and mapped
    action outputs (§3.3).
13. Render known `static-content` payloads as literal text, never as markup, and
    convert a malformed unknown kind to an unavailable plan plus
    `STATIC-CONTENT-KIND-UNKNOWN` (§3.4).
14. Compute heading levels from composition — at most one `h1`, step down inside
    an embed, accept a host-supplied baseline (§3.4.1).
15. Preserve image `alt` exactly, treat `""` as decorative, synthesize no
    fallback, make malformed missing-`alt` input unavailable with
    `STATIC-IMAGE-NO-ALT`, and give a binding an image source only after the host
    resolver admits it (§3.4.2).
16. Traverse `embed-route` with a visited set and terminate on cycles (§3.5).
17. Derive theme authority by lookup in the shipped authority map, restating no
    part of the vocabulary and carrying no default branch (§4.1).
18. Satisfy invariant **TB-1**: no tenant-origin value in any output for a
    refusing or unclassified route (§4.2, §4.3).
19. Hand every route a Theme document of the same type, platform-built on
    refusing routes, platform-layered-under-tenant on admitting ones (§4.2).
20. Refuse tenant theming on an absent `routeClass`, report
    `THEME-UNCLASSIFIED-REFUSED`, carry a three-valued posture that never collapses
    absence into `operation` or into a boolean, and expose that posture and its
    reason to the host (§4.3, §4.3.1).
21. Apply the host route's theme grant transitively to every embedded subtree,
    and never let an embedded route's own class raise its host's grant (§4.4).
22. Satisfy invariant **TB-2**: let the composition layer emit the effective
    token map once onto an owned element, disable duplicate nested-renderer
    emission, clean up on unmount and theme change, never write the document
    root, and report rather than scrub a contaminated root (§4.5).
23. Never emit a derived token into a platform token map (§4.2).
24. Never alias an undeclared tenant token onto a declared one, never require a
    Token Registry to render, and leave `THEME-TOKEN-UNREGISTERED` reporting to
    registry-aware validation (§4.2).
25. Supply no default transition affordance, under any label (§5.1).
26. Classify every transition on the matched route as `supplied-by-slot`,
    `fireable`, `unfireable`, `condition-false`, or
    `condition-unevaluable`; put the closed refusal cause in
    `unfireableReason` rather than adding states; credit `supplied-by-slot` only
    when the selected binding actually publishes the matching control, resolve
    sources transitively through `embed-route`, and report the matching
    diagnostics (§5.2, §5.3).
27. Advance a transition only on a host report with `status: "completed"`, a
    resolved action identity, and `validationReport.valid: true`; never advance
    on a click, rendered control, failed/deferred/blocked/unresolved result, or
    invalid nonblocking result (§5.3).
28. Give each widget emission one stable invocation identity, coalesce duplicate
    in-flight delivery, preserve identity and Response snapshot across
    `retry-once`, replay durable outcomes, ignore obsolete-generation completion,
    and navigate at most once after exactly one eligible transition (§5.3).
29. Emit only codes from the closed set in §7.2, each carrying `code`,
    `severity`, `message`, and a document-vocabulary `site` (§7).
30. Report rather than throw for every condition in §7.2, and deliver every
    diagnostic to the host regardless of which stage produced it (§7.1).
31. Keep its person-facing strings one-for-one with Locale 2.0's closed Surface
    key set, evaluate only FEL `{{...}}`, and keep fallback within the same app
    target (§3.0).

A conformant Surface Shell Core MUST NOT:

1. Emit markup, touch a document, or assume a rendering medium.
2. Own navigation history.
3. Author, mutate, or persist any Formspec artifact.
4. Execute a Response Action, evaluate its preconditions, or classify its
   terminal state.
5. Re-implement `E603`, `E604`, `E606`, `E607`, `E610`, `E611`, or
   `THEME-ROUTE-CLASS` as a render-time gate — while still taking the fail-closed
   branch on any violation it observes (§1.2).
6. Invent content, copy, labels, alternative text, data, or affordances the
   bundle does not carry.

### 8.3 Surface Shell Binding

A conformant **Surface Shell Binding** MUST:

1. At its render boundary, consume the route match, theme grant, slot dispatch,
   heading level, and transition state from a conformant route plan. If a
   package also computes those values, that code is part of its core and MUST be
   tested against the core class; the binding's rendering path MUST NOT contain
   a second calculation.
2. Emit the effective Theme-token map once onto an element the composition
   binding creates and destroys, disable duplicate emission in nested renderers,
   and clean up on unmount and on theme change (§4.5).
3. Render every slot the plan carries, in plan order, including unavailable
   placeholders and empty states.
4. Emit heading elements at the levels the plan assigns.
5. Give `kind: image` slots the exact authored `alt` value and mark them
   decorative only when that value is `""` (§3.4.2).
6. Render `kind: divider` as presentational only.
7. Render no control for an `unfireable` transition, and expose no affordance
   for one (§5.3).
8. Surface every diagnostic in the plan to the host without filtering by severity
   or by producing stage (§7.1).
9. Clean up any document-level state it sets — including the document title —
   when it unmounts. A binding that scopes its tokens and then writes an
   uncleaned global elsewhere has applied the rule to one channel and not the
   principle (§4.5).
10. Use the same slot-frame, title, and heading-level functions for direct and
    embedded slots. A parity test MUST render the same slot directly and through
    `embed-route` and compare those decisions.
11. Render parameterized navigation without an interactive link until every
    marker has a host-supplied value, and deliver the diagnostic to the host
    (§2.7).
12. Render no interactive navigation control for a collision claimant,
    including a transition control. An unavailable item must expose disabled
    link semantics without an `href`, activation handler, or tab stop. Recheck
    the refusal before emitting navigation; a completed slot action never
    advances to the refused address (§2.4).

A conformant Surface Shell Binding MUST NOT:

1. Write theme tokens to the document root, body, or any node it did not create.
2. Synthesize a transition control, a navigation control bound to a declared
   transition, or a submit control, except that it MAY render a transition the
   core classifies as `fireable` after the host explicitly supplies its Response
   Actions executor ([response-actions-spec](../response-actions/response-actions-spec.md)
   §10).
3. Substitute its own copy for content the bundle declined to carry — including
   route titles, group labels, and empty-state text with claims in it. A group
   label is the Surface's `title` or, absent that, its `id`.
4. Interpret `static-content` payloads as markup.
5. Present the theme posture or its reason to the person by default (§4.3.1).

### 8.4 Verifying Surface Shell

A conformant **Verifying Surface Shell** MUST satisfy §8.2 and §8.3 and
additionally:

1. Have the host verify a signed bundle export and supply its canonical verdict
   before any bundle-derived output reaches any medium (§6.1, §6.2).
2. Apply the §6.4 matrix: admit a signed export only on `verified`; refuse
   `failed` and signed-`unverified`; admit an unsigned `unverified` input only in
   an explicit authoring preview.
3. Read the signature method identifier from the signature envelope's protected
   header, never from a sibling record (§6.3).
4. Expose three distinct states — `verified`, `failed`, `unverified` — and never
   present `unverified` as `verified` (§6.4).
5. Make the verdict available on every route (§6.2).

### 8.5 Host Obligations

Not a conformance class; the checklist a deployment satisfies for the classes
above to mean anything. A host MUST:

1. Supply the incoming path and any route-parameter values the path does not
   carry (§2.3, §2.7).
2. Dereference the bundle export into typed artifacts and keep structural
   readiness separate from the canonical verification verdict (§3.0, §6.4).
3. Verify signed exports, map adapter results to
   `verified | failed | unverified`, and apply the §6.4 render matrix before
   invoking the shell in a Verifying Surface Shell deployment (§6.5).
4. Supply the widget registry — the module implementations that satisfy
   `module-widget` bindings (§3.3).
5. Resolve each Surface-declared widget input through its exact Data Sources
   catalog and source, apply Data Sources 1.0 authorization and payload rules,
   and expose the resulting named object as read-only (§3.3).
6. Supply the Response Actions executor; preserve stable invocation,
   idempotency, retry, and durable replay semantics; and report completion to the
   shell only on a successful current-generation terminal (§5.3).
7. Own navigation and history, performing the navigation intents the shell emits.
8. Present unmatched paths, unavailable slots, and refusal states (§2.6, §3.0,
   §6.1).
9. Never write Formspec theme tokens to the document root or reach past the shell
   to style a refusing route (§4.5).
10. Supply a synchronous static-asset resolver that admits only approved image
    origins and returns the runtime source; never let a binding dereference an
    authored source directly (§3.4.2).
11. Keep the runtime shell string set one-for-one with Locale 2.0 and supply
    app-targeted overrides when deployment language or wording differs (§3.0).

---

## 9. Worked Example — Rent Assistance

The signed rent-assistance bundle
([`spikes/lifecycle-demo-v10/evidence/stage-4-signoff.bundle-export.json`](../../spikes/lifecycle-demo-v10/evidence/stage-4-signoff.bundle-export.json))
is historical spike evidence. The example below applies the 0.2 path after
migration: its App Manifest is 2.4 and names the respondent Surface URL in
`entrySurface`; its Surface, Registry, and Locale documents are 0.2, 1.1, and
2.0. The App Manifest names two Surfaces — `respondent` and `staff` — carrying
four routes between them.

In plain terms: **a person applies for help with their rent, signs a declaration,
and gets a receipt. A caseworker sees the applications waiting for a decision.**
Those are four screens; the bundle describes all four, and this section walks
what a conforming shell does with each.

### 9.1 The Composed Route Table

The manifest lists `respondent` first, then `staff`, so the composed table is:

| # | Surface | Route id | Path | `routeClass` |
|---|---|---|---|---|
| 1 | `respondent` | `apply` | `/apply` | `intake` |
| 2 | `respondent` | `certify` | `/certify` | `ceremony` |
| 3 | `respondent` | `receipt` | `/receipt/{caseRef}` | `proof` |
| 4 | `staff` | `queue` | `/queue` | `operation` |

**Composition (§2.1).** One flat URL space in manifest order. No prefixing: the
caseworker's queue lives at `/queue`, not `/staff/queue`, because that is the
path the Surface authored.

**App entry (§2.5).** App Manifest `entrySurface` exactly matches the respondent
Surface URL. That Surface's `entry` is `apply`, so the app entry route is
`apply`. The `staff` Surface keeps its own `entry` — `queue` — as its
Surface-local root; composition does not demote it. Reordering `surfaces[]`
would change table order but not app entry.

**Identity (§2.2).** Both Surfaces could have declared a route id `home` without
colliding; identity is the pair. No two composed paths collide here, so §2.4's
refusal never engages.

**The F8 correction the table shows (§2.3).** Route 3 now authors the pinned
`/receipt/{caseRef}` grammar and declares `caseRef` in `params[]`; the
`certify` transition supplies the corresponding parameter map. `Route.path`
schema validation and Studio authoring both reject `/receipt/:caseRef` before
export. With the host value `RA-2026-0412`, a conforming shell matches
`/receipt/RA-2026-0412`, binds `caseRef`, and reports no
`ROUTE-PARAM-GRAMMAR`. The strict runtime remains necessary for older invalid
documents; it does not add a colon alias.

### 9.2 Slot Dispatch, Route by Route

**`/apply` — intake.** Four slots, in authored order:

| Slot | Type | What a conforming shell does |
|---|---|---|
| `applyJourney` | `experience-unit` | Renders the unit's `title` and `description` only. Its `itemRefs` name Definition paths; the shell draws no fields from them (§3.2) — the form below is where fields come from. |
| `applyChrome` | `module-widget` | Resolves `x-formspec-tenant-chrome` / `x-intake-banner` on `widgetShape.widgetName`. Configured with nothing, the widget renders an honest empty state; it does not invent reassurance copy about a draft store the bundle does not describe (§1.3 principle 2). |
| `applyReassurance` | `static-content` (`text`) | Renders the authored sentence as literal text: *"You can apply even if you have already received help this year."* No markup interpretation. |
| `applyForm` | `definition-form` | Resolves the Definition by exact URL and renders it through the medium's Formspec renderer, handing it this route's Theme document. |

**`/certify` — ceremony.** A heading and the ceremony frame. The authored heading
carries `level: 1`; at `headingBaseLevel` 2 it renders `h2`, not a second `h1`
(§3.4.1). The ceremony widget renders the declaration text it is configured with
and draws no control that looks like signing — the act of signing is not
something a shell manufactures.

**`/receipt/{caseRef}` — proof.** A heading and the receipt panel. Every fact the
panel shows comes from the host data resolver, except the case reference, which
comes from the route parameter: a route addressed *by* the reference makes the
URL a fact, not an invention. Handed nothing, the panel says there is no receipt
to show.

**`/queue` — operation.** A heading and the queue table. The bundle supplies no
rows through its optional bound input, so the table renders an empty state and no
table markup. It receives no invented sample rows. If the same input were
declared `required`, absence would make the widget unavailable instead (§3.3).

### 9.3 The Theme Grant per Route

The bundle's Theme document sets one token: the brand colour `#7A1F3D`.

| Route | `routeClass` | Grant | What the route's subtree receives |
|---|---|---|---|
| `/apply` | `intake` | **admits** | Platform tokens layered under the tenant's; the brand resolves and paints — the submit control's background and the focus ring, which derives from the brand token. |
| `/certify` | `ceremony` | refuses | A platform-built Theme document. No tenant-origin value anywhere in the subtree. |
| `/receipt` | `proof` | refuses | Same. |
| `/queue` | `operation` | refuses | Same. |

Every grant here is a **lookup**, not a decision: the shell reads the shipped
authority map (§4.1). Nothing in a conforming shell's source names `ceremony`,
`proof`, or `operation` in connection with theming.

Measured against the running app, walking all four routes by client-side
navigation: tenant-brand custom properties inside the route subtree on `/apply`
and zero on each refusing route, with zero Formspec properties on the document
root at every step and no scrubbing workaround running
([`evidence/r3-theme-boundary-probe.json`](../../spikes/surface-render-v10/evidence/r3-theme-boundary-probe.json)).
That measurement is what invariant TB-1 plus TB-2 look like when asserted from
output rather than from code.

**Had any of these four routes declared no `routeClass`,** it would receive the
platform Theme document and a `THEME-UNCLASSIFIED-REFUSED` report (§4.3) — not
the tenant's brand, and not an `operation` label it never claimed.

### 9.4 Transitions

Two are authored:

| From | Transition | State | Why |
|---|---|---|---|
| `apply` | `{trigger: "submit", to: "certify"}` | `supplied-by-slot` | The `definition-form` slot renders the form, its selected renderer places the matching submit control, and the bundle's Response Actions document publishes that action against the Definition. The person presses the form's own control; the host reports a completed, resolved, valid result; the shell advances. |
| `certify` | `{trigger: "submit", to: "receipt"}` | **`unfireable`** | The route's slots are one heading and one module widget. Neither is a trigger source (§5.2). Nothing on the page can produce a `submit`. |

The `certify` transition is authored, schema-valid, **signed**, and dead. `E606`
passed it — `receipt` is reachable — because reachability is not traversability.
A conforming shell renders no control, reports `TRANSITION-UNFIREABLE`, and the
person on `/certify` cannot proceed.

**This is exactly what `E611` (§5.4) exists to report before signing.** The
warning names the route, trigger, and repair — add a `definition-form` slot whose
Definition publishes the trigger through a rendered control, embed a route that
has one, supply a host executor, or remove the transition.

### 9.5 What the Example Demonstrates

Reading the four routes as one artifact: a signed bundle can describe an app that
composes cleanly, themes correctly, refuses correctly on three of four routes —
and **cannot be walked from beginning to end**, because one authored edge has
nothing to traverse it. The signed exemplar now uses the pinned
`/receipt/{caseRef}` grammar, declares `caseRef`, and supplies the edge map, so
route grammar no longer blocks the walk. The remaining dead edge is invisible
to schema validation and the route reachability walk; `E611` and the runtime
`TRANSITION-UNFIREABLE` report it before and during use.

---

## 10. Security and Accessibility Considerations

**Untrusted bundle content.** Everything a shell renders comes out of documents
that may not be trusted. `static-content` payloads MUST be rendered as text, never
as markup (§3.4) — this is the shortest path from a bundle to script execution.
`kind: image` `content` is a URL and MUST NOT be dereferenced from an
unconstrained origin. The host MUST enforce its image-origin allowlist through
the static-asset resolver in §3.4.2 and §8.5; this is a Surface Shell host rule,
not a Theme rule.

**Verification is a gate, not a label.** §6. A rendered unverified bundle has
already been seen.

**Theme tokens are a cross-route channel.** A global custom-property write is an
information and presentation channel between routes that are meant to be
isolated. §4.5 is a security requirement as much as a correctness one: the
document-root leak meant a tenant-controlled value reached a ceremony surface
whose whole guarantee is that its appearance is not the tenant's.

**Anti-phishing chrome is a route-class concern.** The `authentication` class
refuses tenant theming because the chrome *is* the security control. A shell that
got §4.1 wrong on that value would produce a phishing surface. Deriving from the
shipped map rather than restating the vocabulary is what keeps that from being a
per-implementation risk.

**Accessibility obligations are normative here, not advisory.** The heading
outline (§3.4.1), the image accessible name (§3.4.2), the presentational divider
(§3.4), and the requirement that unavailable and empty states be *perceivable*
rather than merely visually apparent (§3.0) are all MUSTs. A slot silently
omitted is invisible to everyone, but a slot rendered with no accessible name is
invisible only to some, which is worse.

**A shell reports; it does not repair.** §4.5's no-scrubbing rule generalizes: a
shell that quietly fixes a defect it observes removes the only signal anyone had.

---

## Appendix A: Gap-Ledger Coverage Map

The [surface-render-v10 spike](../../thoughts/spikes/2026-07-27-surface-render-v10.md)
recorded the pieces of the running app that review identified as not supplied by
the platform in a gap
ledger ([`spikes/surface-render-v10/src/gaps.ts`](../../spikes/surface-render-v10/src/gaps.ts),
emitted to [`evidence/gap-ledger.json`](../../spikes/surface-render-v10/evidence/gap-ledger.json)).
This appendix maps those reviewed entries to the section that specifies each one,
or records why it is deliberately unspecified. It does not certify that the
ledger or this specification found every possible gap.

*Ledger disposition* is the ledger's own `open`, `implemented`, `corrected`, or
`split` value. It is independent of whether this document specifies the
behavior. A `split` parent preserves history and points to leaf rows; it does
not claim that any child shipped.

| Ledger id | Ledger disposition | Specified in | Note |
|---|---|---|---|
| `bundle-manifest-dereference` | `implemented` | §3.0, §8.5 obligation 2 | Surface performs typed inline dereference; AppGraph performs validating exact-own-key resolution first. |
| `surface-shell` | `implemented` | §1.2, §8 | The framework-neutral core plans; the React binding renders. Navigation remains a host port. |
| `route-matching` | `implemented` | §2.3, §2.7 | Unsupplied markers fail and malformed escapes cannot escape a render. |
| `route-path-grammar-mismatch` | `implemented` | §2.3, §7.3 | Schema and Studio admit only `{name}` markers; runtime keeps no legacy alias. |
| `slot-dispatch` | `implemented` | §3, §3.5 | Dispatch is exhaustive; embedded routes preserve grants, headings, and cycle termination. |
| `module-widget-runtime` | `implemented` | §3.3 | Registry identity yields exact `resolved`, `unimplemented`, or `undeclared` posture. |
| `widget-x-intake-banner` | `implemented` | §1.3 principle 2, §3.3 | The starter widget renders authored configuration or an explicit empty state. |
| `widget-x-ceremony-frame` | `implemented` | §4.2, §4.4 | Token scoping makes the frame unbranded; the widget invents no signing control. |
| `widget-x-receipt-panel` | `implemented` | §3.3, §9.2 | The starter widget renders admitted receipt input and may use the addressed route reference as fact. |
| `widget-x-queue-panel` | `implemented` | §3.0, §9.2 | The starter widget distinguishes rows, empty state, and unavailable state without sample data. |
| `widget-data-binding` | `implemented` | §3.3 | Surface 0.2 and Registry 1.1 bind qualified Data Sources; one authorized loader delivers frozen named values. |
| `registry-entries-wiring` | `implemented` | §7.2 (`REGISTRY-ENTRY-NAME-COLLISION`), [Registry §2.2](../registry/extension-registry.md) | Cross-document collisions resolve to no entry; order never selects a winner. |
| `transition-has-no-trigger-source` | `implemented` | §5.1, §5.2, §5.3 | The selected form publishes the declared control; the shell infers no substitute. |
| `no-runtime-state` | `split` | §8.5 obligations 1, 5, 6 | Leaf rows separately own respondent, operator, and public-signer state. This parent never implies that a child shipped. |
| `respondent-runtime-state` | `implemented` | §8.5 obligations 1, 5, 6 | `formspec-web` reuses its production identity, draft, action-ledger, submit, and status boundaries; tracker `fs-q1ex` records the verified fill-through-refresh browser evidence. |
| `operator-runtime-state` | `open` | §8.5 obligations 1, 5, 6 | `case-portal` tracker `fs-3b30` owns authorized staff queue and case state. |
| `public-signer-ceremony` | `open` | §5, §8.5 obligations 1, 5, 6 | `formspec-web` tracker `fs-5g59` owns the separate consent, signing, and receipt ceremony. |
| `experience-unit-rendering` | `implemented` | §3.2 | Respondent rendering withholds design-rationale need descriptions unless a host requests them. |
| `static-content-rendering` | `implemented` | §3.4, §3.4.1 | The existing closed kind vocabulary renders with composable heading ranks. |
| `theme-authority-unexported` | `implemented` | §4.1 | Runtime imports the same closed route-class authority map as validation. |
| `theme-refusal-copy` | `implemented` | §4.3, §4.3.1 | Refusal posture is exhaustive; person-facing copy remains a keyed product choice. |
| `theme-token-vocabulary-bridge` | `corrected` | §4.2 | The proposed alias was wrong; authoring and validation now use the canonical token. |
| `renderer-emits-tenant-tokens-to-document-root` | `implemented` | §4.5 (TB-2), §7.3 | The provider emits into its owned scope and cleans up; it does not mutate the document root. |
| `tenant-brand-paints-nothing` | `implemented` | §4.2 | Canonical brand and derived tokens reach the skin, while the action control remains authored. |
| `response-actions-type-mismatch` | `implemented` | — | The generated document is the engine input shape and reaches React without a cast. |
| `platform-theme-merge` | `implemented` | §4.2 | One layout helper layers platform values beneath tenant values in React, web component, and Surface consumers. |
| `browser-bundle-verification` | `implemented` | §6 | `formspec-web` acquires, verifies and preflights release policy, validates actor and entry, dereferences and proves renderability, atomically commits the release, and only then admits and renders. |
| `verified-state-chrome` | `implemented` | §6.2 | Persistent host chrome separates authenticated release facts from local check metadata. |
| `cross-surface-navigation` | `implemented` | §2.1, §2.2, §2.4, §2.5 | Composition has one address space and uses only authored Surface titles or ids. |
| `shell-visual-design` | `corrected` | — | Structural product states and layout shipped; only diagnostic spike furniture remains spike-only. |
| `static-content-image-has-no-alt-channel` | `implemented` | §3.4.2 | Surface 0.2 requires exact authored meaningful or empty `alt`; runtime synthesizes none. |
| `transition-edge-traversability-unchecked` | `implemented` | §5.4, **`E611`** | AppGraph warns before signing when a resolved transition has no validator-readable control source. |
| `app-entry-surface-undeclared` | `implemented` | §2.5 | App Manifest 2.4 selects one exact entry Surface and fails on ambiguity or a missing target. |
| `widget-action-output-undeclared` | `implemented` | §5.2, §5.3 | Registry declares output names, Surface maps exact action ids, and runtime preserves one invocation identity. |
| `locale-app-integration` | `implemented` | §8.3, Locale 2.0 | Exact app and Definition Locale documents feed separate consumers; the verified respondent root proves live switching without target leakage. |
| `bundle-publishing-trust-and-rollback` | `implemented` | §6 | The signing profile binds independent publisher/app authority and rejects disallowed or stale releases. |

**Coverage summary.** Each ledger entry reviewed here is either specified by a
numbered section above or deliberately unspecified with the reason stated. The deliberate
exclusions fall into three groups, and each group has a principle behind it:

1. **Implemented schema decisions** — widget inputs and outputs, image
   alternatives, route grammar, and app entry now have exact authored forms
   with no runtime aliases.
2. **Separately owned product work** — the `no-runtime-state` parent points to
   respondent, operator, and public-signer leaves because those actors do not
   share one host or authorization boundary.
3. **Corrected findings** — the proposed Theme alias and the original
   all-or-nothing shell-design claim were too broad; their rows preserve the
   measured correction.

**One gap the ledger did not record, found by writing this document:** the
shell's own person-facing vocabulary had no route into the Locale tier
(finding F7). Locale 2.0 now supplies the closed app-targeted key family and FEL
context. The respondent-host adapter and live switching evidence now close that
implementation gate; the `locale-app-integration` row above records the current
disposition.

---

## Appendix B: Divergence Register and Findings

### B.1 Divergences — where the reference implementation contradicts this document

The shipped packages are `@formspec-org/surface` (core) and
`@formspec-org/surface-react` (React binding), plus the theme-scoping fix in
`@formspec-org/react`. Where this document decides differently, the divergence is
listed. **A divergence is a decision to reconcile, not an accusation** — several
of these are places the implementation had to pick with no contract to read.
The table records findings at review time; Appendix D records the reconciliation
state. It is a reviewed inventory, not a completeness claim.

Severity below is the spec's judgement of the gap, not a diagnostic severity:
**fail-open** = the divergence lets a defect through silently; **fail-loud** =
the divergence is visible when it bites; **naming** = the spec supplies a name
for behaviour that is already correct.

| # | Section | This spec requires | Reference implementation | Disposition |
|---|---|---|---|---|
| **D1** | §2.3 | A `:name` segment is a **literal**; the shell reports `ROUTE-PARAM-GRAMMAR` and the path does not deep-link. | The marker regex accepts `{name}` **and** `:name` in one pass, matches both as parameters, and reports `ROUTE-PARAM-GRAMMAR` — deliberately, so a signed bundle does not 404. | **fail-open — implementation changes.** Accepting both is the silent-alias shape token-registry-spec §2.4 forbids by analogy: two grammars both appear to work, the authoring tools are never corrected, and a second conforming renderer 404s the same signed bundle. The ledger says it in its own words — *"silence was the symptom, not the defect."* The counter-argument (don't break a signed bundle) is real and is why the repair is a `pattern` on `path` plus authoring-tool emission, not a renderer that keeps reading both. |
| **D2** | §2.4 | A colliding path resolves to **no** route, and collision is tested over matching behaviour. | Both routes stay in the table and `ROUTE-PATH-COLLISION` fires, with the message *"The first in manifest order answers the URL; this one is unreachable"* — a first-match scan resolves to one. **And** the collision test compares raw authored `path` strings, so `/m/{id}` vs `/m/:id` never reports while the second is genuinely unreachable. | **fail-open — implementation changes.** Keeping both handles in the table is right; answering the URL with one is the fail-open half. The string comparison also contradicts the file's own prose, which says *pattern*. |
| **D3** | §7.1 | Every diagnostic carries a `severity`, fixed per code, hosts MAY elevate and MUST NOT demote. | `SurfaceDiagnostic` is `{code, message, site, details?}` — **no `severity` field**; every code is the same weight. | **fail-loud — implementation changes.** The closed-set comment says the closure exists so *"a host that wants to escalate some codes and ignore others needs to know the whole list."* Without severity the list is knowable and not actionable. |
| **D4** | §7.1, §8.2 item 29 | Every diagnostic reaches the host whatever stage produced it. | The React binding aggregates **only** bundle, composition, registry, and theme diagnostics. `planRoute` and `planTransitions` diagnostics are computed per route and **discarded** — `SLOT-BINDING-INCOMPLETE`, `STATIC-IMAGE-NO-ALT`, `EMBED-ROUTE-*`, `WIDGET-UNIMPLEMENTED`/`UNDECLARED`, per-slot `BUNDLE-DOCUMENT-MISSING`, and every `TRANSITION-UNFIREABLE` surface only as on-page copy. | **fail-open — implementation changes. The most consequential divergence in this table.** It drops the majority of the code set from the only channel a host can log or alarm on, and it does so against the package's own stated thesis (*"renders what it can AND says what it did"*). |
| **D5** | §7.2 | `ROUTE-UNMATCHED` is in the closed code set. | No such code. An unmatched path renders a not-found element and reports nothing. | **fail-open — implementation changes.** A state with no code is a state a host cannot act on; a broken deep link becomes invisible to operations. |
| **D6** | §7.2, §4.3 | `THEME-UNCLASSIFIED-REFUSED` reports a withheld grant. | The refusal is correct and structural, and carries person-facing wording, but emits no diagnostic. | **fail-loud — implementation changes.** §1.3 principle 1: the shell says what it did *in the diagnostic channel*, not only on screen. |
| **D7** | §7.2 | `THEME-DOCUMENT-ROOT-CONTAMINATED` is a reportable code. | The read-don't-scrub posture is implemented and tested; no code in the closed set covers a contaminated root. | **fail-loud — implementation changes.** The posture is right and is now normative; it needs a code so a production host can alarm rather than a test asserting cleanliness in CI. |
| **D8** | §3.4.2, §7.3 | Surface 0.2 carries `alt`; the binding preserves it exactly, treats `""` as decorative, and makes malformed missing-`alt` input unavailable. | The reviewed implementation derived `alt = slotTitle ?? ''` and therefore synthesized a name outside the image binding. | **fail-open — implementation changes.** `slot.title`, URLs, and filenames are not compatibility aliases for the required field. |
| **D9** | §3.3 | `WIDGET-UNDECLARED` reports declaration and MUST fire even when a host component exists. | Resolution is two-axis: *no Registry entry + host component present* returns `resolved` with **no diagnostic** — a widget the bundle never declared renders silently. | **fail-open — implementation changes.** It makes host-supplied content indistinguishable from bundle-declared content, which is the one distinction a signed bundle exists to make. |
| **D10** | §2.5 | App Manifest 2.4 selects the entry Surface by exact URL, and its `entry` selects the route; neither decision falls back by order. | The reviewed implementation used `routes.find(isSurfaceEntry) ?? routes[0]`, which silently fell through to a later Surface's entry and then the first route. | **fail-open — implementation changes.** A missing or invalid selector must refuse with the specified diagnostic. |
| **D11** | §2.3 | Literal segments match by exact string; regex metacharacters are inert. | The pattern builder escapes every metacharacter **except** `{` and `}` (the marker grammar owns them), so an authored literal `/a{2}` compiles to `^/a{2}/?$` and matches `/aa`. Untested. | **fail-open — implementation changes.** A brace that is not a valid marker becomes a quantifier. Narrow, but it is a signed path matching an address nobody authored. |
| **D12** | §2.3, §7.2 | Every `{name}` marker needs a `params[]` entry; `ROUTE-PARAM-UNDECLARED` reports the miss. | The undeclared-marker check runs **only when `params[]` is non-empty**, so a path with markers and no `params[]` at all — the common authoring shape — reports nothing. | **fail-open — implementation changes.** It exempts exactly the case most likely to occur. |
| **D13** | §5.2, §5.3 | Trigger-source resolution walks `embed-route` transitively, resolves the exact Response Actions document targeting the bound Definition, and credits only controls the selected renderer actually publishes. | The React binding inferred `supplied-by-slot` from a hardcoded literal intent and top-level `definition-form` presence, without proving that the rendered form placed that action control. | **fail-open — implementation changes.** An inferred status renders no fallback control and emits no diagnostic, so overclaiming produces a silent dead edge. |
| **D14** | §3.4.1, §8.3 items 1 and 10 | One rule per question; the plan's assigned heading level is the level rendered; `headingBaseLevel` is host-overridable end to end. | Three separate defects in one area. (a) Two divergent title-suppression rules — the top-level path suppresses only for `kind: heading`, the embed path suppresses for **all** `static-content` kinds, reintroducing one nesting level down the exact bug the top-level path was fixed to remove. (b) The embed path renders a title at the **host slot's** base rather than the child's, so an embedded title sits at the same rank as its host's while its content sits one deeper. (c) The core accepts `headingBaseLevel` and the React binding **never passes it**, so the baseline is always 2 in the shipped path and the override obligation is unreachable; top-level slot titles are additionally rendered at a hardcoded level rather than the plan's, which is correct only while the baseline never moves. | **fail-loud — implementation changes.** (c) is the one that blocks embedding the shell in host chrome that owns the page heading. |
| **D15** | §4.3.1 | Presenting the theme posture to the person MUST NOT be on by default. | The route view renders a theme-posture paragraph by default on **every** route, including admitting ones. | **fail-loud — implementation changes.** On an admitting route it carries no information; on any route it is unsigned chrome above signed content. Keep the copy; flip the default. |
| **D16** | §4.5, §8.3 item 9 | A binding cleans up any document-level state it sets. | Sets `document.title` from the bundle by default with **no cleanup on unmount** — an uncleaned global write in the package whose central thesis is that uncleaned global writes are the defect. | **fail-loud — implementation changes.** The token rule was applied to one channel rather than as a principle. |
| **D17** | §3.0, §8.2 item 31 | Shell-authored strings use Locale 2.0's closed app-targeted key set and FEL context. | The reviewed implementation hard-coded English and used a Surface-only `{name}` replacement. | **fail-loud — implementation changes.** The runtime must match the closed Locale set one-for-one and remove the second parser. |
| **D18** | §6.5, §8.4 | Verification is a **Verifying Surface Shell** class binding host and shell. | The shell core deliberately grows no verifier and never gates on `bundleIsRenderable` — which is exported but not called by the binding. No class names the composition. | **naming — spec adds; the boundary is right.** The implementation's refusal to own verification is correct (§6.5). What was missing was the name for host-plus-shell, which §8.4 supplies. A deployment that renders an unverified export is a non-conforming *deployment*. |
| **D19** | §4.1 | A shell restates no part of the route-class vocabulary. | Carries a per-class refusal-*wording* map, `as const satisfies Record<RouteClass, string>`, plus a separate unclassified reason, pinned by a test that compares its keys to the authority map's. | **No change — compliant, and worth stating why.** It is keyed *by* the vocabulary and fails compilation if the vocabulary changes; it carries copy, not authority. §4.1 forbids restating the *partition*, not attaching per-value strings to it. |
| **D20** | §7.2 | `EXPERIENCE-UNIT-UNRESOLVED` is its own code. | An unresolved unit reuses `BUNDLE-DOCUMENT-MISSING` — a bundle-level code for an intra-document miss. | **fail-loud — implementation changes.** One defect, one code; a host cannot distinguish an absent Experience document from a present one missing a unit. |
| **D21** | §3, §7.1, §8.2 items 8 and 29 | Malformed unknown slot types produce an unavailable plan and `SLOT-TYPE-UNKNOWN`; dispatch reports rather than throws. | The supposedly exhaustive runtime dispatch threw on its default branch. | **fail-loud — implementation changes.** One malformed slot prevented the host from receiving the remaining diagnostics or rendering available content. |
| **D22** | §2.7, §8.3 | Navigation to a parameterized route is unavailable until every marker has a value; a binding emits no live marker-bearing URL. | The navigation binding rendered an anchor whose `href` still contained an unsubstituted `{name}` marker. | **fail-open — implementation changes.** A broken address looked actionable and could enter browser history. |
| **D23** | §5.3, §8.2 item 27 | A completed, resolved, valid Response Action result advances the matching transition; all other terminal and nonterminal results do not. | The form binding accepted an `onSubmit` callback but discarded the executor's terminal result, so successful submit could never advance. | **fail-loud — implementation changes.** The action completed while the route stayed put. |

**Documentation divergence, recorded separately because it is not a behaviour.**
The React package's README documents a `scrubDocumentRoot` prop *"(default on)"*
that no longer exists anywhere in the repository — it was removed when the
provider write was scoped (§4.5) and the README was not updated. A reader who
trusts it will believe a defence is running that is not.

### B.2 Where the implementation was right and an existing spec was wrong

| # | Finding |
|---|---|
| **R1** | **The renderer's refusal to inject a submit control was correct, and the spike initially blamed it.** The `tenant-brand-paints-nothing` ledger entry attributed the missing submit button to the renderer; response-actions-spec §10 forbids inventing an implicit Action, so the renderer was right and the defect was upstream in the authoring path, which was not writing the Response Actions document into the manifest. Corrected in the ledger, and §5.1 now states the rule at the layer that has to obey it. |
| **R2** | **`static-content`'s `kind` vocabulary was already closed and the spike reported it as unwritten.** The ledger retracts its own claim in place. The lesson is procedural and worth carrying: the schema was the answer and prose was consulted instead. Implementing the fourth kind then surfaced finding F1, which was genuinely absent. |
| **R3** | **The mid-build claim that a `definition-form` slot on a `proof` route would render the receipt in the tenant's brand was falsified by the running app.** The slot receives the *refusing route's* grant, so the provider re-emits platform tokens over the leaked ones. The real exposure was the unscoped global write, not slot placement — which is why §4.5 is an invariant on the emitter and §4.2 is stated over output rather than over slot topology. |
| **R4** | **Theme-spec originally said nothing about where tokens were emitted, and that silence permitted the leak.** The implementation's fixed behaviour — an owned scope with cleanup and one composition owner — is now stated in [theme-spec](../theme/theme-spec.md) §3.7 and applied to this shell in §4.5. |
| **R5** | **`ROUTE_CLASS_THEME_AUTHORITY` being unreachable from outside the validator package was a real defect and is fixed.** ADR 0161 records the map as shipped and enforced; it was not on the package export surface, so the only consumer that could read it was a validator. A rule that only its own enforcer can reach has no runtime half by construction — which is precisely what ADR 0161's promise needed. |

### B.3 Findings and Owning Specifications

The reconciliation applied every finding to its owning specification or
package. Product runtime work remains tracked separately in Appendix A.

| # | Finding | Change required | Owner |
|---|---|---|---|
| **F1** | The 0.1 image binding had no alternative-text channel. | **Applied:** Surface 0.2 requires `alt` exactly for images and admits `""` as decorative. | Surface |
| **F2** | The 0.1 widget binding had no runtime data channel separate from configuration. | **Applied:** Registry 1.1 declares named inputs and Surface 0.2 binds them to qualified Data Sources 1.0 sources. | Surface + Registry + Data Sources |
| **F3** | App Manifest 2.3 had no explicit entry Surface selector. | **Applied:** App Manifest 2.4 adds canonical `entrySurface` and fail-closed zero/one/many rules. | App Manifest |
| **F4** | Registry 1.0 had no validator-readable widget action declaration. | **Applied:** Registry 1.1 declares outputs and Surface 0.2 maps them to exact action IDs. | Registry + Surface + Response Actions |
| **F5** | Two Registry documents in one bundle may declare the same entry `name`. | **Applied:** [Registry §2.2](../registry/extension-registry.md) now makes unqualified lookup exactly-one and fail-closed; the shell omits all colliding entries. | Registry |
| **F6** | The generated Response Actions document type and the renderer's input type were mutually unassignable, forcing a cast at every host. Not a contract question — a packaging one. | **Applied:** the engine input derives from the generated document shape; Surface React passes it without a cast. No spec change. | `formspec-types` / `formspec-engine` |
| **F7** | The 0.1 shell strings had no Locale channel and used a separate `{name}` parser. | **Applied:** Locale 2.0 defines the closed app-targeted `$module.x-formspec-surface.shell.*` set and FEL-only interpolation context. | Locale + Surface Shell |
| **F8** | `path` in `surface.schema.json` was constrained only to a non-empty string, so both the pinned `{name}` grammar and the unpinned `:name` grammar were schema-valid and authoring tools emitted the wrong one. This was the root cause of D1. | **Applied:** `Route.path` admits only opaque segments and exact `{name}` markers; Studio validates and preserves route declarations plus edge maps; the signed exemplar and browser evidence use the pinned grammar. The renderer remains strict for invalid legacy documents. | Surface |
| **F9** | Theme defined token maps but did not define platform-under-tenant layering, emission ownership, cleanup, or output scope. | **Applied:** [Theme §3.7](../theme/theme-spec.md) now owns the cross-renderer rule; this document retains the Surface-specific application in §4.5. | Theme |
| **F10** | The Surface schema described `static-content.binding.level` as an absolute heading level while this document requires a composition-relative rank. | **Applied:** `schemas/surface.schema.json` now describes rank, host baseline, and embed depth. | Surface |

**No new document type and no new schema is needed for the Surface Shell
itself.** The shell reads Surface, App Manifest, Definition, Experience, Response
Actions, Theme, and Registry, and writes diagnostics. Every finding above amends
an existing schema or an existing spec; none introduces a `$formspec*`
discriminator, and the diagnostic set in §7 is a processor output, not an
artifact.

---

## Appendix C: References

| Tag | Reference |
|---|---|
| Surface | [Formspec Surface Specification](surface-spec.md), `schemas/surface.schema.json` |
| UI Graph Policy | [Formspec UI Graph Policy](../app-graph/ui-graph-policy-spec.md) §5.7 Theme Authority by Route Class |
| Response Actions | [Formspec Response Actions](../response-actions/response-actions-spec.md) §7.1, §10 |
| Experience | [Formspec Experience Specification](../experience/experience-spec.md) §1.4.1, §5.2, §6.3 |
| Theme | [Formspec Theme Specification](../theme/theme-spec.md), [Token Registry Specification](../theme/token-registry-spec.md) §2.4, §2.5, §5.3 |
| App Manifest | [Formspec App Manifest](../bundle/app-manifest-spec.md) |
| Needs | [Formspec Needs Specification](../needs/needs-spec.md) §7 |
| ADR 0150 | [Formspec as a Layered UI Substrate](../../../thoughts/adr/0150-formspec-as-layered-ui-substrate.md) §4.2, §6 |
| ADR 0152 | [Multi-actor authorization scope](../../../thoughts/adr/0152-multi-actor-authorization-scope.md) |
| ADR 0160 | [Materialisation verbs for the Wireframes / Forms MCP family](../../../thoughts/adr/0160-mcp-materialisation-verbs.md) §2.4, §8.1 |
| ADR 0161 | [Route class and the Rendering-ring boundary](../../../thoughts/adr/0161-route-class-and-rendering-ring-boundary.md) §5, §6, §9 |
| Spike | [Surface render v10 — the signed bundle as a running app](../../thoughts/spikes/2026-07-27-surface-render-v10.md) and `spikes/surface-render-v10/evidence/` |
| Lint codes | `specs/lint-codes.json` — the normative registry |
| [rfc2119] | Bradner, S., "Key words for use in RFCs to Indicate Requirement Levels", BCP 14, RFC 2119, March 1997. |
| [RFC 6570] | Gregorio, J., et al., "URI Template", RFC 6570, March 2012. |
| [RFC 8174] | Leiba, B., "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words", BCP 14, RFC 8174, May 2017. |
| [RFC 8259] | Bray, T., Ed., "The JavaScript Object Notation (JSON) Data Interchange Format", STD 90, RFC 8259, December 2017. |

## Appendix D — Review Reconciliation (2026-07-28)

The independent architecture and implementation reviews returned
**RECONSIDER**. This revision keeps the core decisions and reconciles the
findings through their owning specifications, runtime packages, tests, and
generated guidance.

| Review area | Reconciliation |
|---|---|
| Runtime Token Registry conflict | §4.2 and §8.2 leave `THEME-TOKEN-UNREGISTERED` to registry-aware validation. The renderer does not load the Registry and creates no alias. |
| Unclassified routes | [Surface §3](surface-spec.md) now states the authoring-time posture; §4.3 separately states the fail-closed runtime theme decision. |
| Fireable controls and `E611` | §8.3 permits a host-requested `fireable` control. `E611` is a warning because validation cannot see a host executor or private widget behaviour. |
| Runtime fail-closed branches | §2, §3, §5, and §7 define dedicated diagnostics for ambiguous route handles, unknown slot types, unknown static-content kinds, and unevaluable conditions. |
| Registry collisions | [Registry §2.2](../registry/extension-registry.md) requires exactly-one unqualified lookup and omits every colliding declaration. |
| Trigger-source and terminal-result handling | §5.3 verifies the control a binding actually publishes, carries route and link diagnostics to the host, and advances only on a completed, resolved, valid Response Action result. |
| Theme ownership and heading rank | [Theme §3.7](../theme/theme-spec.md) owns layering and single emission; `schemas/surface.schema.json` defines `level` as a composition-relative rank. |
| Implementation divergences | Appendix B includes throwing dispatch, marker-bearing navigation, and discarded submit results. The package tests cover the fail-closed and transition-result branches. |
| Human and generated guidance | This specification participates in the artifact pipeline, links from Surface, and is indexed by the Formspec specification lookup map. Stale spike claims and evidence references were reconciled with the shipped bundle and current tests. |

*End of Formspec Surface Shell Specification.*

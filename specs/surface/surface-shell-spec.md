---
title: Formspec Surface Shell Specification
version: 0.1.0-draft.1
date: 2026-07-28
depends_on:
  - specs/surface/surface-spec.md
  - specs/app-graph/ui-graph-policy-spec.md
  - specs/response-actions/response-actions-spec.md
  - specs/theme/theme-spec.md
  - specs/theme/token-registry-spec.md
  - specs/bundle/app-manifest-spec.md
  - specs/experience/experience-spec.md
---

# Formspec Surface Shell Specification v0.1

**Version:** 0.1.0-draft.1
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
2. **Divergences are catalogued, not smoothed.** Appendix B is the register of
   every place the shipped packages contradict this document. A divergence
   register on a spec written after its code is the honest shape; an empty one
   would mean the spec had been reverse-engineered rather than decided.

The document also closes the question ADR 0161 §6 left open — what a processor
does with a route that states no `routeClass` — and proposes one new
validation-time lint code (§5.4). Neither is inherited; both are marked as this
specification's own decisions.

**This document sits in the normative spec tree and has not yet had the
architecture review its own seam triggers.** It is here rather than in
`thoughts/` because behavioural semantics a schema cannot encode are normative in
`specs/**/*.md` — the source-of-truth split ADR 0161 §4 pin-test condition 1 keys
on — and a citable rule cannot live behind a date-stamped proposal filename. That
placement is a statement about *where the rule belongs*, not a claim that it has
been ratified. Read the version: `0.1.0-draft.1`.

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
v0.1 admits only its simple single-variable expansion form
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
- **The shell supplies no default trigger affordance.** The bundle declares the
  trigger source or the transition does not fire, and an unfireable transition is
  caught before publication by a new lint code, `E611`
  (`SURFACE-TRANSITION-UNFIREABLE`) (§5).
- **A shell handed a signed bundle export MUST verify before first paint and MUST
  refuse, not warn, on failure** (§6).
- The shell introduces **no new document type and no new schema.** Every gap it
  hits amends an existing schema or an existing spec, and each is named rather
  than invented around — an image with no alternative-text channel, a widget with
  no data channel, a route path whose grammar the schema does not pin (Appendix B,
  findings F1–F8).

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
| **Validation-time tooling** | Everything decidable without a person: `E603`, `E604`, `E606`, `E607`, `E610`, the proposed `E611` (§5.4), `THEME-ROUTE-CLASS`, `THEME-TOKEN-UNREGISTERED`. | Nothing here is the shell's to re-implement. |

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
4. **One decision, one site.** Every rule this document states is decided in the
   shell core, once, and consumed by bindings. A rule that a binding can
   re-decide is not a rule.
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
- A route path is **not** an identity. It is the host-facing address of one
  route, and §2.4 governs what happens when two routes claim the same one.
- The `surface:<route-id>` URI scheme
  ([surface-spec](surface-spec.md) §6) resolves across the
  loaded Surfaces and MUST resolve to exactly one route. When two Surfaces
  declare the same id, a bare `surface:<route-id>` is ambiguous and the resolution
  is a cross-artifact validation error, not a shell tie-break.

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

1. **`{name}` is the only parameter grammar.** Surface v0.1 *"does not admit URI
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
   v0.1.

**A path that uses an unpinned parameter grammar is matched as literal text, and
the shell MUST report `ROUTE-PARAM-GRAMMAR`.** *This specification's own
decision,* and it is deliberately strict. The reasoning is the one
[token-registry-spec](../theme/token-registry-spec.md) §2.4 states for
brand tokens: *"A silent alias is worse than no alias. It makes two vocabularies
both appear to work, so an authoring tool that emits the wrong one is never
corrected and a renderer that drops it is never blamed."* Accepting `:name`
alongside `{name}` is that alias in the route grammar. Two shells would disagree
about what a signed URL means — one deep-links, one returns nothing — with the
bundle valid under both readings. The route stays reachable by route handle
(`surface:<route-id>`, a transition, an `embed-route`); only its URL address
degrades, and it degrades loudly.

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
path to any of them. Both routes remain in the table and remain reachable by
route handle.

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

The **app entry route** — the route a shell resolves when the incoming path is
empty or `/` and no route declares the path `/` — is the `entry` route of the
**first Surface in App Manifest `surfaces[]` order**.

*This specification's own decision, and a finding.* App Manifest v2.3 carries no
`entrySurface` or `entryRoute` field, so manifest order is the only authored
signal. That makes app entry an implicit consequence of list position, which is
fragile authorial intent: reordering `surfaces[]` for readability silently
changes which screen a person lands on. Recorded as **finding F3** (Appendix B);
closing it is an optional field on an existing schema, not a new document type.

An `entry` that names no route in its own Surface is an authored defect; the
shell MUST report `SURFACE-ENTRY-UNRESOLVED` and MUST NOT substitute a route for
it — not the Surface's first route, and **not another Surface's entry**. When the
first Surface's `entry` is unresolved, the app has no entry route and the shell
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

---

## 3. Slot Dispatch

A route's `slots[]` is an ordered list, and the shell dispatches each entry on
its `slotType`. The taxonomy is closed at v0.1 by
[ADR 0150 §6.2](../../../thoughts/adr/0150-formspec-as-layered-ui-substrate.md#62-closed-slot-type-taxonomy)
and enumerated with its binding shapes in
[surface-spec](surface-spec.md) §5; it is not restated here.
This section states the **rendering obligation** each value carries.

Dispatch MUST be exhaustive over the closed taxonomy, with no default branch. A
shell that falls through to a generic renderer for an unrecognised `slotType`
has admitted a value the schema does not, which is the extension seam ADR 0150
§4.2 reserves for a Registry `slot-type` contribution — not a runtime fallback.

### 3.0 General Obligations

**Order is authored.** Slots render in `slots[]` order. `position` is an
OPTIONAL renderer hint with no normative vocabulary at v0.1
([surface-spec](surface-spec.md) §5); a binding MAY consume
it, and MUST fall back to document order for any slot that declares none.

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

**Shell-authored strings are a bounded, localisable set.** A shell necessarily
authors some person-facing text the bundle cannot carry — the unavailable
placeholder, the empty-state fallback, an unfireable-transition notice, an
unmatched-path message. That set MUST be small, MUST be enumerable, and MUST be
overridable by the host, because a shell that hard-codes them in one language
makes every deployment monolingual regardless of what the bundle's Locale
document says. The strings are the shell's; the language is not the shell's to
fix. Recorded as **finding F7** (Appendix B) — the substrate has a Locale tier and
the shell's own vocabulary has no channel into it.

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
  renderer-defined hint at v0.1 and carries no normative vocabulary.
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
- **There is no data channel, and a shell MUST NOT invent one.** `config` is
  configuration, not content: the `module-widget` binding carries no reference to
  a Data Source, no query, and no props channel beyond `config`. A widget that
  needs bundle or session data receives it from a **host-supplied data resolver**,
  named as a host input rather than dressed up as a bundle channel. A shell that
  invented a binding-to-data path would fork the vocabulary before the schema
  settles it. Recorded as **finding F2** (Appendix B).
- **A module widget cannot declare that it fires an action.** This is load-bearing
  for §5.2 and stated here because it is a property of the Registry `widget`
  contribution, not of any one widget.

### 3.4 `static-content`

The slot renders inline literal content. The `kind` vocabulary is closed at v0.1
in `schemas/surface.schema.json` and
[surface-spec](surface-spec.md) §5 and is not restated here.
A shell MUST dispatch exhaustively over it; an unrecognised `kind` is a schema
violation, not a rendering decision.

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
NOT read `level` as an absolute HTML heading level — the schema's absolute 1–6
does not compose, and reading it absolutely is what puts a second `h1` on a
route.

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

`kind: image` carries `content` (a URL or asset ref) and nothing else. **The
binding has no alternative-text channel.** A shell therefore:

- **MUST NOT** synthesize an accessible name from `binding.content`. A URL or
  filename read aloud is worse than silence: it is confidently wrong.
- **MUST** use `slot.title` as the accessible name when present. It is the only
  authored human-readable string attached to the slot, and a name that is
  sometimes a region label beats no name at all.
- **MUST** otherwise render the image as decorative — an empty accessible name,
  removed from the accessibility tree — rather than exposing an unnamed image.
- **MUST** report `STATIC-IMAGE-NO-ALT` in **both** cases. Neither branch has an
  authored alternative text, and the diagnostic is what keeps the gap countable
  rather than papered over by the `slot.title` fallback.

*This specification's own decision, and a finding.* An image with no accessible
name is a WCAG 2.2 SC 1.1.1 failure and a renderer cannot invent one. Closing it
is an `alt` field on the `static-content` binding, REQUIRED when `kind` is
`image`, admitting the empty string as an explicit decorative declaration —
a change to `surface.schema.json`, recorded as **finding F1** (Appendix B). A
renderer picking a default is not a substitute for it.

`kind: divider` MUST be presentational only: no accessible name, not focusable,
and `content` MUST NOT be rendered as text even when non-empty.

### 3.5 `embed-route`

The slot renders another route of the **same** Surface inside the host route.

- **Resolution.** `binding.routeRef` MUST name a route in the same Surface
  document. `E607` owns this at validation time; the shell reports
  `EMBED-ROUTE-UNRESOLVED` and renders an unavailable placeholder. A shell MUST
  NOT resolve `routeRef` across Surfaces — cross-Surface composition is outside
  Surface v0.1 and outside what either document records
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

**An undeclared non-`x-` tenant token is reported, never aliased.** The platform
token registry is the closed vocabulary and the brand key is `color.primary`;
there is no second brand key and processors MUST NOT alias one onto it
([token-registry-spec](../theme/token-registry-spec.md) §2.4). A shell
that encounters a tenant token under a registry-owned prefix that the registry
does not declare MUST report `THEME-TOKEN-UNKNOWN` and MUST NOT bridge it.

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

**The one statement that pulls the other way, and why it does not carry.**
[surface-spec](surface-spec.md) §3 says *"Every Surface
document authored before this vocabulary existed therefore keeps its exact prior
behavior."* That sentence sits inside the paragraph explaining why absence is not
defaulted to `operation`, and its subject is validator behaviour and document
validity: old documents do not start failing. It cannot be a statement about
runtime theming, because at the time it was written no runtime consumer of
`routeClass` existed anywhere in the stack. The Surface Shell is the first, and
this section is where the question gets answered rather than inherited.

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
| `module-widget` | no | The Registry `widget` contribution declares `widgetShape.props`, `childrenPolicy`, `tokenSlots`, and lifecycle. **It has no channel to declare that the widget fires an action.** A widget therefore cannot be a *declared* trigger source at v0.1 — nothing in the substrate lets it declare one. |
| `static-content` | no | Literal content. |

*The `module-widget` row is this specification's own decision and the one that
makes the check sound rather than heuristic.* It would be tempting to exempt any
route carrying a module widget on the grounds that the widget *might* fire the
action. That exemption would silence the check on exactly the case that motivated
it — `/certify`'s only non-static slot is a module widget. The correct reading is
narrower and more honest: a module widget that fires an action would be doing so
through an undeclared channel, and the substrate's standing posture is that
undeclared behaviour is not inferred. Making a module widget a legitimate trigger
source requires the Registry `widget` contribution to gain an action-declaration
channel — recorded as **finding F4** (Appendix B).

`T.trigger` itself resolves per
[surface-spec](surface-spec.md) §4: a Response Actions
`actions[*].id`, or a closed-core intent declared by exactly one loaded action.
A trigger that resolves to neither is already a cross-artifact validation error
and is not this section's concern — one defect, one code.

### 5.3 Runtime Posture

For each transition on the matched route a shell resolves one of three states,
and MUST expose which:

| State | Condition | Shell behaviour |
|---|---|---|
| `supplied-by-slot` | A slot on the route (transitively through `embed-route`) already renders the control bound to the trigger. | Render nothing additional. The authored control is the affordance. |
| `fireable` | The trigger resolves against a loaded Response Actions document **and** the host has supplied an executor for it. | Expose the transition as fireable. A binding MAY render a control for it — **supplying the executor is the host asking**, which is what makes this not a default affordance: with no executor there is no control, under any label. |
| `unfireable` | Neither of the above. | Render no control. Report `TRANSITION-UNFIREABLE`, naming which half is missing. |

**Resolving `supplied-by-slot` is a walk, not a lookup.** The scan for a trigger
source MUST descend `embed-route` slots transitively (§5.2), and MUST resolve the
trigger through the loaded Response Actions document — matching an action `id`,
or an intent published by exactly one action — rather than testing for a
particular intent string. A shell that scans only a route's own `slots[]` reports
a working page as dead; a shell that hardcodes one intent reports every other
intent as dead. Both are the same defect: substituting a shortcut for the
resolution rule surface-spec §4 already states.

On `unfireable` a shell **MUST NOT** render an interactive control, MUST report
the diagnostic, and SHOULD make the state perceivable to the person rather than
leaving a dead end with no explanation. The wording of any such notice is the
binding's, and in a conforming published bundle it is unreachable — §5.4 blocks
publication of the state that produces it.

A shell MUST NOT advance a transition on its own initiative. It advances only
after the host reports that the referenced action completed successfully under
Response Actions authority, and MUST NOT infer that from a click, a rendered
control, a validation summary, or the absence of an error.

`when`, where present, is an FEL boolean over bundle state. A shell MUST NOT
evaluate it against renderer-local state; a shell that cannot evaluate it against
validated bundle-state bindings MUST treat the transition as not firing rather
than guessing.

### 5.4 `E611` — Catching It Before Publication

The runtime posture above is the last line. The defect belongs upstream: `E606`
walks the route graph for **reachability** and never asks whether an edge can be
**traversed**, and the cross-artifact trigger check asks only whether a trigger
resolves against a loaded Response Actions document — so it fires on a trigger the
document contradicts and stays silent on a route with no way to raise the trigger
at all. The missing rule is per-route, not per-document.

> **Proposed new lint code.** `E611` — `SURFACE-TRANSITION-UNFIREABLE`, severity
> `error`, pass: cross-artifact / app-graph. Registered in `specs/lint-codes.json`
> in the Surface band alongside `E606`, `E607`, and `E610`. **This code does not
> exist today**; it is proposed by this specification.

**Rule.** For every route `R` and every transition `T` in `R.transitions[]` whose
`trigger` resolves, `R` MUST contain — directly or transitively through
`embed-route` — at least one slot of a type §5.2 admits as a trigger source, whose
resolved artifact can produce `T.trigger`. For a `definition-form` slot, "can
produce" means the loaded Response Actions document publishes an action whose
`id` equals `T.trigger`, or whose `intent` equals `T.trigger` and is declared by
exactly one loaded action, targeting the Definition that slot binds.

**Suggested fix (authoring-loop hint).** *"Add a `definition-form` slot whose
Definition has a Response Action publishing this trigger, embed a route that has
one, or remove the transition."*

**Fire / does-not-fire.**

- *Fires when:* a route declares a transition whose trigger resolves against the
  loaded Response Actions document, and no slot on that route — directly or
  through any `embed-route` chain — is a trigger source per §5.2 that can produce
  it.
- *Does not fire when:* the trigger does not resolve at all (the cross-artifact
  trigger check owns that defect — one defect, one code); the route has a
  `definition-form` slot whose Definition's Response Actions publish the trigger;
  an `embed-route` chain reaches such a route; the route declares no
  `transitions[]`; or no Response Actions document is loaded, which collapses to
  the first case.

**What `E611` deliberately does not check.** Whether the person can *reach* the
control — relevance, authorization, precondition, or `when` — is runtime state.
`E611` asks only whether a control that could produce the trigger is declared to
exist on that route. A statically declared control that a precondition always
blocks is a Response Actions concern, not a Surface one.

---

## 6. Verification Before Render

### 6.1 The Rule

> **Decision.** A shell that is handed a **signed bundle export** MUST verify the
> signature before first paint, and MUST refuse to render on failure. It MUST NOT
> render with a warning, render optimistically while verifying, render chrome
> before the verdict, or render a partial view of a bundle that failed.

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

A shell MAY be handed an unsigned bundle — that is the normal case in authoring
and preview. Two obligations:

1. **A shell MUST NOT present an unsigned bundle as verified**, and MUST expose
   the unverified state to the host distinctly from `verified` and from `failed`.
   Three states, never two.
2. **A shell MUST NOT synthesize a verdict** for a bundle it cannot verify —
   because no signature was supplied, because the method is unknown, or because
   the platform lacks the primitive. Unknown is unknown.

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
| `SURFACE-ENTRY-UNRESOLVED` | `error` | A Surface's `entry` names no route in that Surface. |
| `ROUTE-PATH-COLLISION` | `error` | Two or more composed routes produce the same URL path (§2.4). |
| `ROUTE-PARAM-GRAMMAR` | `error` | A route path uses a parameter grammar Surface v0.1 does not pin (§2.3). |
| `ROUTE-PARAM-UNDECLARED` | `error` | A `{name}` marker in `path` has no matching `params[]` entry. |
| `ROUTE-PARAM-NO-MARKER` | `error` | A `params[]` entry has no matching marker in `path`. |
| `ROUTE-PARAM-UNSUPPLIED` | `error` | Entering a parameterized route with no value for a declared parameter (§2.7). |
| `ROUTE-UNMATCHED` | `warning` | No composed route matched the incoming path (§2.6). |
| `EMBED-ROUTE-UNRESOLVED` | `error` | An `embed-route` binding names no route in the same Surface. |
| `EMBED-ROUTE-CYCLE` | `error` | An `embed-route` chain revisited a route already on the chain. |
| `SLOT-BINDING-INCOMPLETE` | `error` | A slot binding lacks a field its `slotType` requires. |
| `EXPERIENCE-UNIT-UNRESOLVED` | `error` | An `experience-unit` binding names no unit in the resolved Experience. |
| `WIDGET-UNDECLARED` | `error` | A `module-widget` binding names a widget no Registry in the bundle declares. |
| `WIDGET-UNIMPLEMENTED` | `error` | The Registry declares the widget; nothing the host registered implements it. |
| `REGISTRY-ENTRY-NAME-COLLISION` | `warning` | Two Registry documents in one bundle declare the same entry `name`. |
| `STATIC-IMAGE-NO-ALT` | `warning` | A `static-content` slot with `kind: image` has no authored alternative text (§3.4.2). |
| `THEME-TOKEN-UNKNOWN` | `warning` | A tenant Theme token sits under a registry-owned prefix the registry does not declare (§4.2). |
| `THEME-UNCLASSIFIED-REFUSED` | `info` | Tenant theming was withheld from a route because it declares no `routeClass` (§4.3). |
| `THEME-DOCUMENT-ROOT-CONTAMINATED` | `error` | The shell observed Formspec custom properties on the document root, which no conforming emitter writes (§4.5). |
| `TRANSITION-UNFIREABLE` | `warning` | A declared transition on the matched route has no trigger source and no host executor (§5.3). |

### 7.3 Fire / Does-Not-Fire Conditions

Stated for the codes whose boundaries are contested. The remainder fire exactly
as their table row reads.

**`ROUTE-PARAM-GRAMMAR`** — unpinned route-parameter grammar. Severity `error`.
Surface Shell Core class.
- *Fires when:* a composed route's `path` contains a segment that reads as a
  parameter in a grammar Surface v0.1 does not pin — `:name`, `*`, a regex
  capture, a matrix or query parameter, or a URI Template operator.
- *Does not fire when:* the path uses only `{name}` markers; the path contains no
  markers at all and declares no `params[]` (an opaque path is valid); a literal
  segment merely contains a colon that is not in leading position.

**`ROUTE-PATH-COLLISION`** — two routes, one address. Severity `error`. Surface
Shell Core class.
- *Fires when:* two or more composed routes produce identical segment patterns —
  same segment count, same kind at every index, same literal text at every literal
  index. Fires once per colliding group, naming every member.
- *Does not fire when:* the routes differ by specificity and §2.4's rule picks one
  (`/receipt/new` vs `/receipt/{caseRef}`); two Surfaces share a `routes[].id` but
  not a path (identity is the pair, §2.2); the paths differ only in trailing
  slash on a non-root path — those are the same address, so this **does** fire.

**`ROUTE-UNMATCHED`** — nothing matched. Severity `warning`. Surface Shell Core
class.
- *Fires when:* the incoming path matches no composed route after specificity
  resolution.
- *Does not fire when:* the path matched and was then refused for collision
  (`ROUTE-PATH-COLLISION` owns that); the path is empty or `/` and resolved to the
  app entry route (§2.5); the route matched and a slot inside it failed to
  resolve (§3.0 owns that).

**`STATIC-IMAGE-NO-ALT`** — no authored accessible name. Severity `warning`.
Surface Shell Core class.
- *Fires when:* a `static-content` slot declares `kind: image`. Always — the
  binding carries no alternative-text channel, so no image slot has an authored
  one, and the count of fires is the size of the gap.
- *Does not fire when:* `kind` is any other value. It does **not** stop firing
  because `slot.title` was present and used as the accessible name (§3.4.2) — a
  region label pressed into service is a fallback, not an authored alt, and
  silencing the diagnostic on that branch would hide the schema gap behind a
  workaround.

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
  neither `supplied-by-slot` nor `fireable` for it (§5.3).
- *Does not fire when:* a slot on the route or reachable through `embed-route`
  renders the control (`supplied-by-slot`); the host supplied an executor
  (`fireable`) — even if the person has not fired it; the transition's `when`
  currently evaluates false, which is a runtime condition and not an absence of
  machinery; the route declares no transitions.

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
| A slot-order or `position` diagnostic | `position` carries no normative vocabulary at v0.1; a shell has nothing to be wrong about. |

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
2. Key every route by (Surface identity, `routes[].id`) and never by path,
   Definition URL, or renderer-local state (§2.2).
3. Match paths using `{name}` markers as the only parameter grammar, report
   `ROUTE-PARAM-GRAMMAR` for any other, and treat the offending segment as
   literal (§2.3).
4. Resolve overlapping candidates by the left-to-right literal-beats-parameter
   specificity rule, and refuse — never tie-break — a genuine collision (§2.4).
5. Resolve the empty or `/` path to the first Surface's `entry` route, and never
   substitute a route for an unresolved `entry` — not the Surface's first route,
   not another Surface's entry (§2.5).
6. Render nothing and report `ROUTE-UNMATCHED` when no route matches; never
   redirect to the entry route (§2.6).
7. Refuse to enter a parameterized route without every declared value, and never
   substitute the parameter name or its `example` (§2.7).
8. Dispatch exhaustively over the closed slot-type taxonomy with no default
   branch (§3).
9. Distinguish *empty* from *unavailable*, render a placeholder for unavailable
   rather than omitting the slot, and report the matching diagnostic (§3.0).
10. Resolve `definitionRef` by exact URL match with no alias fallback (§3.1).
11. Render only `title` and `description` from an Experience unit, and derive no
    layout, controls, or ordering from its typed references (§3.2).
12. Resolve `module-widget` bindings on `widgetShape.widgetName`, distinguish
    *undeclared* from *unimplemented*, report `WIDGET-UNDECLARED` even when a host
    component exists for it, and supply no data channel the substrate does not
    declare (§3.3).
13. Render `static-content` payloads as literal text, never as markup (§3.4).
14. Compute heading levels from composition — at most one `h1`, step down inside
    an embed, accept a host-supplied baseline (§3.4.1).
15. Never synthesize image alternative text from a URL, and always report
    `STATIC-IMAGE-NO-ALT` on an image slot (§3.4.2).
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
22. Satisfy invariant **TB-2**: emit tokens only onto an owned element, clean up
    on unmount and theme change, never write the document root, and report rather
    than scrub a contaminated root (§4.5).
23. Never emit a derived token into a platform token map (§4.2).
24. Never alias an undeclared tenant token onto a declared one; report
    `THEME-TOKEN-UNKNOWN` (§4.2).
25. Supply no default transition affordance, under any label (§5.1).
26. Classify every transition on the matched route as `supplied-by-slot`,
    `fireable`, or `unfireable`, resolving trigger sources transitively through
    `embed-route` and through the loaded Response Actions document rather than by
    a hardcoded intent, and report `TRANSITION-UNFIREABLE` for the last (§5.2,
    §5.3).
27. Advance a transition only on a host report of successful Response Actions
    completion, never on a click or a rendered control (§5.3).
28. Emit only codes from the closed set in §7.2, each carrying `code`,
    `severity`, `message`, and a document-vocabulary `site` (§7).
29. Report rather than throw for every condition in §7.2, and deliver every
    diagnostic to the host regardless of which stage produced it (§7.1).
30. Keep its own person-facing strings enumerable and host-overridable (§3.0).

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

1. Render a route plan produced by a conformant core, and re-derive nothing in
   it — not the route match, not the theme grant, not the slot dispatch, not the
   heading level, not the transition state.
2. Emit theme tokens onto an element the binding creates and destroys, with
   cleanup on unmount and on theme change (§4.5).
3. Render every slot the plan carries, in plan order, including unavailable
   placeholders and empty states.
4. Emit heading elements at the levels the plan assigns.
5. Give `kind: image` slots the accessible name the plan assigns, and mark them
   decorative when the plan assigns none (§3.4.2).
6. Render `kind: divider` as presentational only.
7. Render no control for an `unfireable` transition, and expose no affordance
   for one (§5.3).
8. Surface every diagnostic in the plan to the host without filtering by severity
   or by producing stage (§7.1).
9. Clean up any document-level state it sets — including the document title —
   when it unmounts. A binding that scopes its tokens and then writes an
   uncleaned global elsewhere has applied the rule to one channel and not the
   principle (§4.5).
10. Apply one rule per question. Where a decision — whether to render a slot's
    own title, which level a title takes — is made in more than one code path,
    those paths MUST agree; divergent duplicates of the same rule are how a fixed
    defect reappears one nesting level down.

A conformant Surface Shell Binding MUST NOT:

1. Write theme tokens to the document root, body, or any node it did not create.
2. Synthesize a transition control, a navigation control bound to a declared
   transition, or a submit control.
3. Substitute its own copy for content the bundle declined to carry — including
   route titles, group labels, and empty-state text with claims in it. A group
   label is the Surface's `title` or, absent that, its `id`.
4. Interpret `static-content` payloads as markup.
5. Present the theme posture or its reason to the person by default (§4.3.1).

### 8.4 Verifying Surface Shell

A conformant **Verifying Surface Shell** MUST satisfy §8.2 and §8.3 and
additionally:

1. Verify the signature of a signed bundle export before any bundle-derived
   output reaches any medium (§6.1, §6.2).
2. Refuse — render nothing from the bundle — on a failed verdict. Never warn and
   render (§6.1).
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
2. Dereference the bundle export into typed artifacts and gate rendering on a
   single renderability verdict (§3.0).
3. Verify signed exports before invoking the shell, for a Verifying Surface Shell
   deployment (§6.5).
4. Supply the widget registry — the module implementations that satisfy
   `module-widget` bindings (§3.3).
5. Supply the data a module widget displays, through a host resolver, and never
   through a channel the bundle does not declare (§3.3).
6. Supply the Response Actions executor, and report completion to the shell only
   on a successful terminal under Response Actions authority (§5.3).
7. Own navigation and history, performing the navigation intents the shell emits.
8. Present unmatched paths, unavailable slots, and refusal states (§2.6, §3.0,
   §6.1).
9. Never write Formspec theme tokens to the document root or reach past the shell
   to style a refusing route (§4.5).

---

## 9. Worked Example — Rent Assistance

The signed rent-assistance bundle
([`spikes/lifecycle-demo-v10/evidence/stage-4-signoff.bundle-export.json`](../../spikes/lifecycle-demo-v10/evidence/stage-4-signoff.bundle-export.json))
is the smallest artifact that exercises every decision in this document. Its App
Manifest names two Surfaces — `respondent` and `staff` — carrying four routes
between them.

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
| 3 | `respondent` | `receipt` | `/receipt/:caseRef` | `proof` |
| 4 | `staff` | `queue` | `/queue` | `operation` |

**Composition (§2.1).** One flat URL space in manifest order. No prefixing: the
caseworker's queue lives at `/queue`, not `/staff/queue`, because that is the
path the Surface authored.

**App entry (§2.5).** `respondent` is first in `surfaces[]` and its `entry` is
`apply`, so the app entry route is `apply`. The `staff` Surface keeps its own
`entry` — `queue` — as its Surface-local root; composition does not demote it.

**Identity (§2.2).** Both Surfaces could have declared a route id `home` without
colliding; identity is the pair. No two composed paths collide here, so §2.4's
refusal never engages.

**A defect the table shows (§2.3).** Route 3 authors `/receipt/:caseRef` — the
colon-prefixed grammar Surface v0.1 does not pin. Both the path and the missing
`params[]` are schema-valid because `path` is constrained only to a non-empty
string. A conforming shell treats `:caseRef` as a **literal segment**, so
`/receipt/RA-2026-0412` does not match, and reports `ROUTE-PARAM-GRAMMAR`. The
receipt route stays reachable through the `certify` route's transition and
through `surface:receipt`; only its deep-link address degrades — loudly, which is
the point. Repairing the bundle means `path: "/receipt/{caseRef}"` plus a
`params[]` entry naming `caseRef`.

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
rows, so the table renders an empty state — *"Nothing is waiting. When
applications arrive, they appear here."* — and no table markup. This is the
visible cost of the missing widget data channel (§3.3, finding F2), and it is the
honest render: four invented applications with invented rents would be the most
convincing thing on the screen and the least true.

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
| `apply` | `{trigger: "submit", to: "certify"}` | `supplied-by-slot` | The `definition-form` slot renders the form, and the bundle's Response Actions document publishes an action with `submit` intent against that Definition. The person presses the form's own submit control; the host reports the successful terminal; the shell advances. |
| `certify` | `{trigger: "submit", to: "receipt"}` | **`unfireable`** | The route's slots are one heading and one module widget. Neither is a trigger source (§5.2). Nothing on the page can produce a `submit`. |

The `certify` transition is authored, schema-valid, **signed**, and dead. `E606`
passed it — `receipt` is reachable — because reachability is not traversability.
A conforming shell renders no control, reports `TRANSITION-UNFIREABLE`, and the
person on `/certify` cannot proceed.

**This is exactly what `E611` (§5.4) exists to catch, before signing.** Under
`E611` the bundle would fail publication with a message naming the route, the
trigger, and the repair — add a `definition-form` slot whose Definition publishes
the trigger, embed a route that has one, or remove the transition.

### 9.5 What the Example Demonstrates

Reading the four routes as one artifact: a signed bundle can describe an app that
composes cleanly, themes correctly, refuses correctly on three of four routes —
and **cannot be walked from beginning to end**, because one authored edge has
nothing to traverse it and one authored path uses a grammar the spec does not
admit. Both defects are invisible to schema validation, invisible to the route
graph walk, and invisible to the signing ceremony. That is the case this
specification is written against.

---

## 10. Security and Accessibility Considerations

**Untrusted bundle content.** Everything a shell renders comes out of documents
that may not be trusted. `static-content` payloads MUST be rendered as text, never
as markup (§3.4) — this is the shortest path from a bundle to script execution.
`kind: image` `content` is a URL and MUST NOT be dereferenced from an
unconstrained origin; hosts SHOULD maintain an allowlist, as
[theme-spec](../theme/theme-spec.md) §9.1 requires for Theme URLs.

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
recorded every piece of the running app the platform did not supply in a gap
ledger ([`spikes/surface-render-v10/src/gaps.ts`](../../spikes/surface-render-v10/src/gaps.ts),
emitted to [`evidence/gap-ledger.json`](../../spikes/surface-render-v10/evidence/gap-ledger.json)).
This appendix maps every entry to the section that specifies it, or records why it
is deliberately unspecified. **This map is how a reader knows the spec is complete
relative to what the build discovered.**

*Ledger status* is the ledger's own `open` / `resolved` flag — whether the code
gap was closed — which is independent of whether this document specifies the
behaviour.

| Ledger id | Ledger status | Specified in | Note |
|---|---|---|---|
| `bundle-manifest-dereference` | resolved | §3.0, §8.5 obligation 2 | Spec states the obligation (report all absences, single renderability verdict) and assigns it to the host, not the shell core. |
| `surface-shell` | resolved | §1.2, §8 | The seam this document is the contract for. Layering is now normative, including navigation-as-port, which the build discovered rather than predicted. |
| `route-matching` | resolved | §2.3, §2.7 | Includes the build's two corrections: an unsupplied marker is refused rather than name-substituted, and a malformed escape does not escape a render. |
| `route-path-grammar-mismatch` | **open** | §2.3, §7.3 | **Specified against the implementation.** The spec pins `{name}` as the only grammar and makes an unpinned one a literal plus `ROUTE-PARAM-GRAMMAR`; the shipped shell matches both. Divergence D1; root cause is finding F8. |
| `slot-dispatch` | resolved | §3, §3.5 | Exhaustive dispatch with no default arm; `embed-route` recursion, host-grant inheritance, heading step-down, and cycle termination all normative. |
| `module-widget-runtime` | resolved | §3.3 | Resolution keyed on `widgetShape.widgetName`; the three-outcome split (`resolved` / `unimplemented` / `undeclared`) is normative because it names who fixes it. |
| `widget-x-intake-banner` | resolved | §1.3 principle 2, §3.3 | Not a spec object. The rule it produced — a widget configured with nothing says so rather than inventing copy — is normative. |
| `widget-x-ceremony-frame` | resolved | §4.2, §4.4 | The "widget that must render unbranded" shape needs no Registry expression: TB-1 plus token scoping deliver it structurally. Deliberately **not** specified as a widget-level declaration. |
| `widget-x-receipt-panel` | resolved | §3.3, §9.2 | The route-parameter-as-fact rule (a route addressed by a reference may display it) is stated in the worked example. |
| `widget-x-queue-panel` | resolved | §3.0, §9.2 | Empty vs unavailable is the normative half; the widget itself is not a spec object. |
| `widget-data-binding` | **open** | §3.3 (bounded), **finding F2** | **Deliberately unspecified.** The fork — a props channel on the slot binding versus widgets binding to Data Sources — is a schema decision, not a renderer decision. The spec bounds it: `config` is configuration, data comes from a host resolver, and a shell MUST NOT invent a bundle channel. |
| `registry-entries-wiring` | resolved | §7.2 (`REGISTRY-ENTRY-NAME-COLLISION`) | **Precedence deliberately unspecified.** Nothing in Surface, Registry, or the validator states a precedence rule for same-named entries across Registry documents. The spec requires the collision be reported; naming a winner belongs to the Registry spec. The implementation additionally picks first-declaration-wins — which this spec neither requires nor forbids, and which the Registry spec should ratify or override rather than leave as a renderer's choice. Finding F5. |
| `transition-has-no-trigger-source` | **open** (partial) | §5.1, §5.2, §5.3 | The affordance question is answered against the shell: the bundle declares the trigger, the shell supplies none. |
| `no-runtime-state` | **open** | §8.5 obligations 1, 5, 6 | **Deliberately unspecified as substrate.** Submitted responses, case references, and issued receipts are host and WOS concerns. The spec specifies only the *ports* — route params, data resolver, action executor — not their contents. |
| `experience-unit-rendering` | resolved | §3.2 | Includes the build's call, now normative: need descriptions are design rationale about the person, not copy for them. |
| `static-content-rendering` | resolved | §3.4, §3.4.1 | The ledger entry's original claim that the `kind` vocabulary was unwritten is retracted in the ledger itself; the vocabulary was already closed. The heading-level contract is the substantive specification. |
| `theme-authority-unexported` | resolved | §4.1 | The spec requires structural derivation from the shipped map. **Where the map lives is deliberately unspecified** — the ledger's deeper question (validator package versus a shared vocabulary package) is a packaging decision with no measured benefit either way. |
| `theme-refusal-copy` | resolved | §4.3, §4.3.1 | **The half the ledger said belonged in the spec is now in it.** The *posture* for an absent class is §4.3 — the entry's explicit request. Refusal *copy* stays product, with two constraints the spec does add: it must be keyed by the vocabulary so it cannot drift, and presenting it to the person is opt-in (§4.3.1, divergence D15). |
| `theme-token-vocabulary-bridge` | resolved | §4.2 | No aliasing; report `THEME-TOKEN-UNKNOWN`. The token vocabulary itself is owned by token-registry-spec §2.4 and not restated. |
| `renderer-emits-tenant-tokens-to-document-root` | resolved | §4.5 (TB-2), §7.3 | The motivating defect. Specified as an invariant on the emitter, with the explicit no-scrubbing rule the build's own workaround-deletion produced. |
| `tenant-brand-paints-nothing` | resolved | §4.2 | Two of the three compounding causes are specified here (platform layering, derived tokens not emitted). The third — the renderer's refusal to invent a submit control — is **correct** and is §5.1. |
| `response-actions-type-mismatch` | **open** | — | **Deliberately unspecified.** A TypeScript type-assignability defect between two packages. No cross-language contract question; nothing for a spec to say. Finding F6. |
| `platform-theme-merge` | resolved | §4.2 | Layering is normative for a shell. The ledger's residual — the underlying renderer prop still replaces rather than layers for non-shell consumers — is outside this spec's scope and stays open in the ledger. |
| `browser-bundle-verification` | **open** | §6 | Specified in full as a conformance class. The ledger entry stays open because the *caller* has no shipped home; the *contract* is now written. |
| `verified-state-chrome` | **open** | §6.2 | The obligation (verdict available on every route) is normative; the component is a host concern (§8.5 obligation 8). |
| `cross-surface-navigation` | resolved | §2.1, §2.2, §2.4, §2.5 | Composition rule, identity rule, collision rule, and entry rule all normative. Group labelling — `title` else `id`, never invented — is §8.3 prohibition 3. |
| `shell-visual-design` | **open** | — | **Deliberately unspecified.** Spike scaffolding by the ledger's own classification: boot copy, a gap drawer, a probe. Nothing here is a substrate contract. |
| `static-content-image-has-no-alt-channel` | **open** | §3.4.2, **finding F1** | Specified as far as a renderer can go — no synthesis from the URL, `slot.title` fallback, decorative otherwise, always report. Closing it is a schema field this document does not write. |
| `transition-edge-traversability-unchecked` | **open** | §5.4, **`E611`** | The proposed lint code. The spec names the rule, the fire table, the severity, and the band; minting it is a `specs/lint-codes.json` change plus a validator pass. |

**Coverage summary.** Every ledger entry is either specified by a numbered
section above or deliberately unspecified with the reason stated. The deliberate
exclusions fall into three groups, and each group has a principle behind it:

1. **Schema decisions a renderer must not pre-empt** — `widget-data-binding`,
   `static-content-image-has-no-alt-channel`, the route-path grammar's schema
   half, and the Registry-entry precedence half of `registry-entries-wiring`. A
   shell that picked would fork the vocabulary before the schema settled it.
   Findings F1, F2, F5, F8.
2. **Host and product concerns** — `no-runtime-state`, `verified-state-chrome`
   (the component), `theme-refusal-copy` (the wording), `shell-visual-design`.
   The spec specifies the port, not what flows through it.
3. **Implementation defects with no contract question** —
   `response-actions-type-mismatch`, the packaging half of
   `theme-authority-unexported`. Finding F6.

**One gap the ledger did not record, found by writing this document:** the
shell's own person-facing vocabulary has no route into the Locale tier
(finding F7). The ledger could not have found it — the spike was monolingual by
construction, and the strings only become a contract once a shell ships as a
package other products consume.

---

## Appendix B: Divergence Register and Findings

### B.1 Divergences — where the reference implementation contradicts this document

The shipped packages are `@formspec-org/surface` (core) and
`@formspec-org/surface-react` (React binding), plus the theme-scoping fix in
`@formspec-org/react`. Where this document decides differently, the divergence is
listed. **A divergence is a decision to reconcile, not an accusation** — several
of these are places the implementation had to pick with no contract to read.

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
| **D8** | §3.4.2, §7.3 | `STATIC-IMAGE-NO-ALT` fires on **every** `kind: image` slot, including when `slot.title` supplies the name. | Fires only when no name is available (`alt = slotTitle ?? ''`; diagnostic on the empty branch). | **fail-open — implementation changes.** Silencing on the `slot.title` branch hides the schema gap behind the workaround and makes the fire count useless as a measure of finding F1's size. |
| **D9** | §3.3 | `WIDGET-UNDECLARED` reports declaration and MUST fire even when a host component exists. | Resolution is two-axis: *no Registry entry + host component present* returns `resolved` with **no diagnostic** — a widget the bundle never declared renders silently. | **fail-open — implementation changes.** It makes host-supplied content indistinguishable from bundle-declared content, which is the one distinction a signed bundle exists to make. |
| **D10** | §2.5 | An unresolved `entry` yields no app entry; never substitute another Surface's entry. | `routes.find(isSurfaceEntry) ?? routes[0]` — a dangling first-Surface `entry` silently falls through to a **later Surface's** entry, then to the first route. `SURFACE-ENTRY-UNRESOLVED` does fire. | **fail-open — implementation changes.** A mistyped route id lands a respondent on a caseworker screen, and the app appears to work. |
| **D11** | §2.3 | Literal segments match by exact string; regex metacharacters are inert. | The pattern builder escapes every metacharacter **except** `{` and `}` (the marker grammar owns them), so an authored literal `/a{2}` compiles to `^/a{2}/?$` and matches `/aa`. Untested. | **fail-open — implementation changes.** A brace that is not a valid marker becomes a quantifier. Narrow, but it is a signed path matching an address nobody authored. |
| **D12** | §2.3, §7.2 | Every `{name}` marker needs a `params[]` entry; `ROUTE-PARAM-UNDECLARED` reports the miss. | The undeclared-marker check runs **only when `params[]` is non-empty**, so a path with markers and no `params[]` at all — the common authoring shape — reports nothing. | **fail-open — implementation changes.** It exempts exactly the case most likely to occur. |
| **D13** | §5.2, §5.3 | Trigger-source resolution walks `embed-route` transitively and resolves through the loaded Response Actions document. | The React binding derives supplied triggers with a hardcoded literal intent and a scan of **top-level** `definition-form` slots only; a form inside an `embed-route` is not counted, and no other intent is ever supplied-by-slot. | **fail-loud — implementation changes.** A working page is reported dead, and every non-`submit` intent is unreachable through this path. |
| **D14** | §3.4.1, §8.3 items 1 and 10 | One rule per question; the plan's assigned heading level is the level rendered; `headingBaseLevel` is host-overridable end to end. | Three separate defects in one area. (a) Two divergent title-suppression rules — the top-level path suppresses only for `kind: heading`, the embed path suppresses for **all** `static-content` kinds, reintroducing one nesting level down the exact bug the top-level path was fixed to remove. (b) The embed path renders a title at the **host slot's** base rather than the child's, so an embedded title sits at the same rank as its host's while its content sits one deeper. (c) The core accepts `headingBaseLevel` and the React binding **never passes it**, so the baseline is always 2 in the shipped path and the override obligation is unreachable; top-level slot titles are additionally rendered at a hardcoded level rather than the plan's, which is correct only while the baseline never moves. | **fail-loud — implementation changes.** (c) is the one that blocks embedding the shell in host chrome that owns the page heading. |
| **D15** | §4.3.1 | Presenting the theme posture to the person MUST NOT be on by default. | The route view renders a theme-posture paragraph by default on **every** route, including admitting ones. | **fail-loud — implementation changes.** On an admitting route it carries no information; on any route it is unsigned chrome above signed content. Keep the copy; flip the default. |
| **D16** | §4.5, §8.3 item 9 | A binding cleans up any document-level state it sets. | Sets `document.title` from the bundle by default with **no cleanup on unmount** — an uncleaned global write in the package whose central thesis is that uncleaned global writes are the defect. | **fail-loud — implementation changes.** The token rule was applied to one channel rather than as a principle. |
| **D17** | §3.0, §8.2 item 30 | Shell-authored strings are enumerable and host-overridable. | Every unavailable, empty-state, refusal, not-found, pending, and navigation-label string is hard-coded English with no override channel. | **fail-loud — implementation changes.** Finding F7. Makes every deployment monolingual regardless of the bundle's Locale document. |
| **D18** | §6.5, §8.4 | Verification is a **Verifying Surface Shell** class binding host and shell. | The shell core deliberately grows no verifier and never gates on `bundleIsRenderable` — which is exported but not called by the binding. No class names the composition. | **naming — spec adds; the boundary is right.** The implementation's refusal to own verification is correct (§6.5). What was missing was the name for host-plus-shell, which §8.4 supplies. A deployment that renders an unverified export is a non-conforming *deployment*. |
| **D19** | §4.1 | A shell restates no part of the route-class vocabulary. | Carries a per-class refusal-*wording* map, `as const satisfies Record<RouteClass, string>`, plus a separate unclassified reason, pinned by a test that compares its keys to the authority map's. | **No change — compliant, and worth stating why.** It is keyed *by* the vocabulary and fails compilation if the vocabulary changes; it carries copy, not authority. §4.1 forbids restating the *partition*, not attaching per-value strings to it. |
| **D20** | §7.2 | `EXPERIENCE-UNIT-UNRESOLVED` is its own code. | An unresolved unit reuses `BUNDLE-DOCUMENT-MISSING` — a bundle-level code for an intra-document miss. | **fail-loud — implementation changes.** One defect, one code; a host cannot distinguish an absent Experience document from a present one missing a unit. |

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
| **R4** | **Theme-spec says nothing about where tokens are emitted, and that silence is what permitted the leak.** [theme-spec](../theme/theme-spec.md) §3 defines the token map and §3.6 mentions custom properties in passing; [token-registry-spec](../theme/token-registry-spec.md) §5.2 says only that renderers operate on the flat map. No spec said *onto what*. The implementation's fixed behaviour — a provider-owned scope element with cleanup — is now §4.5, and it is a gap in the Theme tier that the shell had to close. |
| **R5** | **`ROUTE_CLASS_THEME_AUTHORITY` being unreachable from outside the validator package was a real defect and is fixed.** ADR 0161 records the map as shipped and enforced; it was not on the package export surface, so the only consumer that could read it was a validator. A rule that only its own enforcer can reach has no runtime half by construction — which is precisely what ADR 0161's promise needed. |

### B.3 Findings requiring changes this document does not make

Per the rule that a spec reports a needed schema rather than writing one:

| # | Finding | Change required | Owner |
|---|---|---|---|
| **F1** | `static-content` with `kind: image` has no alternative-text channel. Every such slot is a WCAG 2.2 SC 1.1.1 exposure a renderer cannot close. | `alt` on the `static-content` binding in `surface.schema.json`, REQUIRED when `kind` is `image`, admitting `""` as an explicit decorative declaration. Plus surface-spec §5. | Surface |
| **F2** | A `module-widget` slot has no channel to supply the widget the data its own `widgetShape.props` describes. Admission is complete; delivery does not exist. | One of two, and it is a fork: a props/data-ref channel on the slot binding, or widgets binding to Data Sources. A schema decision, not a renderer decision. | Surface + Registry, or Data Sources |
| **F3** | App Manifest has no way to name the app's entry Surface or entry route; §2.5 derives it from `surfaces[]` order. Reordering the list for readability silently changes where people land. | An OPTIONAL entry designator on the App Manifest. Existing schema, new optional field. | App Manifest |
| **F4** | The Registry `widget` contribution cannot declare that a widget fires an action, which is why §5.2 excludes `module-widget` as a trigger source. | An action-declaration channel on `widgetShape`, so `E611` can admit a widget as a source. | Registry |
| **F5** | Two Registry documents in one bundle may declare the same entry `name`, and no spec, schema, or validator states a precedence rule. | A precedence rule in the Registry spec. The shell reports the collision; naming a winner is not the shell's. | Registry |
| **F6** | The generated Response Actions document type and the renderer's input type are mutually unassignable, forcing a cast at every host. Not a contract question — a packaging one. | One package narrows or re-exports. No spec change. | `formspec-types` / `formspec-engine` |
| **F7** | The shell's own person-facing strings — unavailable, empty state, transition refusal, not-found, pending — have no channel into the substrate's Locale tier, so a shell is monolingual regardless of the bundle's Locale document. | Either a host override map for the shell's enumerated string set, or `$module.*` Locale keys owned by the shell's module (Locale spec, and ADR 0150 §4.10 module-aware addressing). The set is small and closed, which is what makes it tractable. | Locale + this spec's next revision |
| **F8** | `path` in `surface.schema.json` is constrained only to a non-empty string, so both the pinned `{name}` grammar and the unpinned `:name` grammar are schema-valid and authoring tools emit the wrong one. This is the root cause of D1. | A `pattern` on `Route.path` admitting only the pinned grammar, plus authoring-tool emission. Making the renderer strict (§2.3) is necessary and not sufficient — the authored bundle is where the two grammars meet. | Surface |

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
| Lint codes | `specs/lint-codes.json` — Surface band `E606`, `E607`, `E610`; `E611` proposed by §5.4 |
| [rfc2119] | Bradner, S., "Key words for use in RFCs to Indicate Requirement Levels", BCP 14, RFC 2119, March 1997. |
| [RFC 6570] | Gregorio, J., et al., "URI Template", RFC 6570, March 2012. |
| [RFC 8174] | Leiba, B., "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words", BCP 14, RFC 8174, May 2017. |
| [RFC 8259] | Bray, T., Ed., "The JavaScript Object Notation (JSON) Data Interchange Format", STD 90, RFC 8259, December 2017. |

*End of Formspec Surface Shell Specification.*

---

## Appendix C — Open review findings (2026-07-28)

An independent architecture review returned **RECONSIDER** on this document. The decisions
survive; the defects below are recorded here rather than in a separate file so the next reader
of the spec sees them without a second lookup. Version stays `0.1.0-draft.1` until items 1–4
close.

**1. BLOCKER — two MUSTs point opposite ways.** §4.2/§7.2/§8.2 item 24 make reading the platform
token registry at render time a core conformance requirement. [`token-registry-spec.md`](../theme/token-registry-spec.md)
§5.2 states renderers MUST NOT depend on the registry at runtime — "the registry exists for
tooling only" — and this document never engages that sentence. Preferred resolution: move the
check to the validator, where §5.3's `THEME-TOKEN-UNREGISTERED` already owns the same predicate
at the same severity, and drop `THEME-TOKEN-UNKNOWN` from §7.2.

**2. The stronger contrary sentence is unrebutted.** §4.3 rebuts one statement and misses
[`surface-spec.md`](surface-spec.md) §3's headline — *"the two states have opposite theme
postures … an unclassified route refuses nothing"* — which this document reverses at runtime.
The decision is right; the rebuttal must quote that sentence and file an amendment narrowing it
to authoring-time posture.

**3. Internal contradiction.** §5.3 permits a binding to render a control for a `fireable`
transition; §8.3 prohibition 2 forbids synthesizing a navigation control bound to a declared
transition, with no exception. Amend the prohibition to except a transition §5.3 resolves as
`fireable` — the host's supply of an executor is the request. [`response-actions-spec.md`](../response-actions/response-actions-spec.md)
§10 already blesses that shape and should be cited in §5.3.

**4. `E611` is too strict to ship at `error`.** Authoring time cannot see a host-supplied
executor, so the gate blocks publication of exactly the route shape §5.3 blesses. Mint at
`warning`, escalating to `error` when F4 lands. §5.2's module-widget row should read "cannot
declare a trigger *legibly to a validator*" — the weaker, truer claim.

**5–8, pre-1.0 not pre-commit.** File the Theme-tier finding for TB-2 and the platform-under-
tenant layering rule (both originate here on a Rendering-ring artifact — ADR 0161 §4 condition
4); file the schema finding for `level`'s rank semantics, which [`surface.schema.json`](../../schemas/surface.schema.json)
still documents as an absolute heading level; mint or explicitly decline the four fail-closed
branches that have no diagnostic code (unrecognised `slotType`, unrecognised `static-content`
kind, ambiguous route handle, unevaluable `when`); apply §2.4's own refusal posture to colliding
Registry entry names; add the three divergences the register missed (a throwing slot dispatch, a
nav link emitting an unsubstituted marker, a submit result discarded before advancing) and soften
Appendix B's "every place" claim — a register cannot self-certify completeness.

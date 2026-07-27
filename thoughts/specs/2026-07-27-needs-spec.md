---
title: Formspec Needs Specification
version: 1.0.0-draft.1
date: 2026-07-27
depends_on:
  - specs/core/spec.md
  - specs/experience/experience-spec.md
---

# Formspec Needs Specification v1.0

**Version:** 1.0.0-draft.1
**Date:** 2026-07-27
**Editors:** Formspec Working Group
**Companion to:** Formspec v1.0 -- A JSON-Native Declarative Form Standard

---

## Status of This Document

This document is a **draft specification**. It is a companion to the [Formspec v1.0 core specification](../../specs/core/spec.md) and does not modify or extend the core processing model. Implementors are encouraged to experiment with this specification and provide feedback, but MUST NOT treat it as stable for production use until a 1.0.0 release is published.

This spec was promoted from the design exploration [`thoughts/2026-07-27-needs-layer-exploration.md`](../../../thoughts/2026-07-27-needs-layer-exploration.md) (stack root). It lives in `thoughts/specs/` and moves verbatim to `specs/needs/needs-spec.md` when `schemas/needs.schema.json` lands with implementation — `specs/` is gate-wired (`npm run docs:generate` / `docs:check`), and the generated BLUF and schema-ref blocks are added at that promotion, not hand-written here.

**What this specification deliberately does NOT decide:**

- **The PURPOSE port mint.** Whether the Need concern becomes a substrate concern port is [ADR 0159](../../../thoughts/adr/0159-product-substrate-recognition.md)'s call, via an amendment running Amendment A2's exhibit-scoring bar. This spec defines the artifact either way.
- **Regeneration semantics beyond anchor pinning.** This spec defines the `need:` anchor grammar and its revision pin (S8). Three-way merge, edit preservation, orphan queues, and review flows are the GENERATION discipline's (ADR 0159 §cross-cutting ports), unmodified by this spec.
- **The `needs.adoption` authority handle.** Reserved as a future [ADR 0152](../../../thoughts/adr/0152-multi-actor-authorization-scope.md) §4.2 registry row (S10.2) — reserved, not minted. Minting it is a 0152 table amendment.
- **Deferred surface** (recorded in the exploration §12): structured Given/When/Then `criteria[]`; Observation→Rulespec-assertion promotion tooling; route-level and Definition-level citations; richer edge roles on `needRefs`; a ReqIF export projector; the JOURNEYS.md projection generator; PLANNING-row citation conventions; INTEGRITY attestation of adopted Needs; automated analytics ingestion. Reserved diagnostic codes for the deferred checks are registered in S9.5 so they are not re-minted incompatibly.

## Conventions and Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [BCP 14][rfc2119] [RFC 2119] [RFC 8174] when, and only when, they appear in ALL CAPITALS, as shown here.

JSON syntax and data types are as defined in [RFC 8259]. URI syntax is as defined in [RFC 3986].

Terms defined in the Formspec v1.0 core specification and the [Experience specification](../../specs/experience/experience-spec.md) — including *Definition*, *Item*, *Response*, *Experience Document*, *Unit*, and *conformant processor* — retain their meanings throughout this document unless explicitly redefined.

Additional terms:

- **Needs Document** -- A JSON document conforming to this specification, identified by `$formspecNeeds: "1.0"`.
- **Need** -- One record in a Needs Document: an evidence-grounded, plain-language statement of why a piece of interactive software should exist, with an observable satisfaction criterion.
- **Statement** -- The Need's Who / What / Why / Done block (S4.1).
- **Grounding** -- A citation binding a Need to its evidence: either an **Assertion Grounding** (an IRI into a Rulespec corpus — the normative channel) or an **Observation Grounding** (a product-local research record — the empirical channel) (S5).
- **Journey** -- A persona-level grouping key for Needs (S3). Distinct from Experience task/journey grouping of Units.
- **Adopted / Proposed / Superseded / Withdrawn** -- Need lifecycle statuses (S4.3).
- **Coverage** -- A static predicate over a (Needs Document, bundle) pair asserting which adopted Needs are served by at least one citing artifact, and which Units cite at least one Need (S9).
- **Needs Coverage checker** -- A processor that, in addition to document validation, computes and reports the coverage predicate.
- **Need anchor** -- A GENERATION source anchor of the form `need:<id>@<revision>` (S8).

**Naming note (supersedes the exploration's vocabulary).** The exploration named the empirical grounding record *finding*. This spec renames it **Observation**: *finding* already names processor diagnostics throughout the Formspec spec family, and one word with two referents — one of them a schema token — is the exact defect the route-class closure test caught in the word *attestation* (ADR 0159, A1 corrections). No other exploration vocabulary changes.

[rfc2119]: https://www.rfc-editor.org/rfc/rfc2119
[RFC 3986]: https://www.rfc-editor.org/rfc/rfc3986
[RFC 8174]: https://www.rfc-editor.org/rfc/rfc8174
[RFC 8259]: https://www.rfc-editor.org/rfc/rfc8259

---

## Bottom Line Up Front

<!-- Generated bluf/schema-ref blocks are added when this spec promotes to specs/needs/; this section is authored prose until then. -->

- This document defines the Needs Document -- an authored artifact that records why software should exist: plain-language Need records (Who / What / Why / Done), each grounded in evidence from the normative channel (Rulespec assertion IRIs) or the empirical channel (Observation research records), or carrying a declared `ungroundedReason` — never silently ungrounded.
- A Need is born `proposed` or `adopted`, is superseded rather than erased, and carries an integer `revision` over its statement and grounding. An AI may file a `proposed` Need; only a human may carry one to `adopted`.
- Experience Units cite Needs through `needRefs[]` (deliberately unpinned); GENERATION anchors cite them as `need:<id>@<revision>` (deliberately pinned). Human intent tracks the Need; machine provenance tracks the revision.
- A Needs Coverage checker computes which adopted Needs no artifact serves (`NEED-COVERAGE-001`) and which Units serve no Need (`NEED-COVERAGE-002`). Coverage is reportable, never blocking.
- Needs MUST NOT affect data capture, validation, or the processing model. The Needs Document is upstream of every other Formspec artifact and is cited by them, never the reverse.

---

## 1. Introduction

### 1.1 Purpose and Scope

The Formspec Needs Specification defines an authored document that records **requirements and discovery as data**: what real people need, stated the way they would say it, grounded in the evidence that says so, and traceable to the artifacts built in response.

The Needs Document exists so that authors, generators, reviewers, and checkers can:

1. Keep the requirements→structure decomposition on disk instead of losing it in an authoring session's context.
2. Answer "this screen exists because of this need" in both directions, by reference.
3. Compute "which needs does this release serve; which have nothing built" as a query.
4. Trigger regeneration when a need changes, through the existing GENERATION anchor discipline.
5. Distinguish a legally mandated need from a research-observed one from a declared hypothesis — through one citation discipline.

This specification does NOT define:

- What to build in response to a need. Solution shape belongs to **Definition**, **Experience**, **Surface**, and the Rendering ring.
- Assertion semantics — warrant chains, authority derivation, usage eligibility, confidence. Those belong to **Rulespec** ([`PKAF/spec/rkaf-core.md`](../../../PKAF/spec/rkaf-core.md)) and are cited by IRI, never restated.
- Acceptance tests. Validation rules belong to Definition (core S4); conformance fixtures to the test corpus.
- Work sequencing. Backlog rows, priority, and scheduling belong to the stack's planning artifacts. A Needs Document is not a backlog.
- Regeneration merge behavior (see Status).
- Sign-off and release gating. Adoption of a Need (S4.3) is not approval of a release.

### 1.2 Relationship to the Formspec Layers

| Layer | Concern | Defined In |
|-------|---------|------------|
| **Why the software exists** | Evidence-grounded needs | **this spec** |
| Task intent | What the user is trying to do | Experience |
| Structure | What data to collect | Core S4 (Items) |
| Behavior | How data behaves | Core S4.3 (Binds), S5 (Shapes) |
| Presentation | How data is displayed | Theme / Component / Surface |
| Contextual resources | Help, regulations, agent context on items | References |
| Evidence semantics | Assertions, warrants, authority | Rulespec (external, cited by IRI) |

The citation direction is **inverted** relative to every other companion document: Theme, Component, Locale, References, and Experience each target a Definition; the Needs Document targets nothing downstream. Downstream artifacts cite Needs (`needRefs`, `need:` anchors); the Needs Document cites only upstream evidence (S5). It therefore carries no `targetDefinition`.

**Boundary with References.** A References entry attaches a regulation to a Definition item as context, with no semantic force (References spec). A Grounding cites a source as justification for a Need's existence. The same regulation may legitimately appear in both — different facts, different owners.

**Boundary with Experience.** Experience owns actors, tasks, and units — what a person does *inside* the product. The Needs Document owns why the product should exist at all: its `who` is a population in plain language, not an `actors[]` runtime role, and a Need MUST be expressible with no Experience, no Definition, and no bundle in existence.

### 1.3 Design Principles

1. **Additive, not invasive.** Needs MUST NOT affect data capture, validation, or the processing model. A Core processor that ignores Needs produces identical Responses.
2. **Plain language is normative.** The Statement is written for a non-technical reader (S4.1). A Need a policy officer cannot read on first contact is defective as authored.
3. **Evidence or declared absence — never silence.** Every Need carries at least one Grounding or an explicit `ungroundedReason` (S5.4). "We haven't validated this" is a recorded state, not an omission.
4. **Cite, never compile.** Normative evidence stays in Rulespec and enters by IRI. This spec restates no assertion semantics.
5. **Supersession, never erasure.** A replaced Need remains in the document with `status: superseded`; a wrong Need is `withdrawn`, and that is itself evidence.
6. **Solutions are refused.** A Statement names lacks and outcomes, not routes, fields, or widgets. The moment a Need names a widget it has become a decision and belongs to the layer that owns it.
7. **Cited by reference, both directions distinct.** Authored citations (`needRefs`) are unpinned; generated anchors (`need:...@rev`) are pinned (S7, S8).

### 1.4 Conformance Classes

This specification defines the following conformance classes (detailed in S11):

| Class | Applies to | Summary |
|-------|-----------|---------|
| **Needs Document** | the JSON document | Schema-valid (S12) plus the document-integrity rules of S6. |
| **Needs Core processor** | software loading the document | Validate, verify internal integrity, resolve `needRefs` against a paired Needs Document. |
| **Needs Coverage checker** | analysis tooling | All of Core, plus compute and report the coverage predicate (S9). |

A conformant Core (Formspec) processor MAY ignore Needs Documents entirely.

## 2. Document Structure

A Needs Document is a JSON object at the top level with the following properties. (Generated schema reference tables replace this prose table on promotion; the prose form here is normative until then.)

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `$formspecNeeds` | string (`const: "1.0"`) | REQUIRED | Document type marker; pins to spec major version. |
| `version` | string (semver) | REQUIRED | Version of this Needs Document. |
| `url` | string (URI) | OPTIONAL | Canonical URI identifier for this document. RECOMMENDED when any external system cites its Needs. |
| `name` | string | OPTIONAL | Machine-readable short name. |
| `title` | string | OPTIONAL | Human-readable display name. |
| `description` | string | OPTIONAL | Free-form description of scope and provenance. |
| `journeys` | array of `Journey` (S3) | OPTIONAL | Persona groupings referenced by `need.journey`. |
| `needs` | array of `Need` (S4) | REQUIRED | The substantive payload. MAY be empty only in a newly initialized document. |
| `extensions` | object | OPTIONAL | Extension data; keys MUST be prefixed `x-` (S13). |

**Inline example:**

```json
{
  "$formspecNeeds": "1.0",
  "version": "1.0.0",
  "url": "https://benefits.example.gov/apps/assistance/needs",
  "title": "Benefits assistance -- who this is for and why",
  "journeys": [{ "id": "applicant", "title": "The Applicant" }],
  "needs": [
    {
      "id": "proof-of-filing",
      "journey": "applicant",
      "statement": {
        "who": "anyone submitting this application under a deadline",
        "want": "a receipt I can save and show someone later",
        "why": "if the agency loses my submission, I lose rights I actually had",
        "done": "after I submit, I hold a receipt that proves what I filed and when -- even if the agency's system is gone"
      },
      "grounding": [
        {
          "kind": "assertion",
          "ref": "urn:rkaf:workspace:benefits/assertions/esign-retention-obligation",
          "role": "constrains"
        }
      ],
      "origin": "human-asserted",
      "status": "adopted",
      "adoptedBy": { "kind": "human", "actChannel": "human", "id": "urn:formspec:actor:human:pm:demo" },
      "revision": 2
    }
  ]
}
```

### 2.1 Document Scope and Pairing

A Needs Document declares no `targetDefinition` and no bundle binding — scope is established by the **caller**, who pairs a Needs Document with an app bundle for resolution and coverage (the same caller-pairs posture as the Experience bundle-scope rule, experience-spec S10.1). This spec calls that the **paired bundle**.

When no Needs Document is paired, every processing step that reads one — `needRefs` resolution and all of coverage — is **inapplicable, not failing**: it emits no finding of any kind. A processor MUST NOT infer a pairing from co-location, file naming, or any other convention.

## 3. Journeys

A **Journey** is a persona-level grouping key: the kind of person a set of Needs belongs to, in the reading order a human would want.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string (unique within `journeys[]`) | REQUIRED | Stable identifier. Referenced by `need.journey`. |
| `title` | string | OPTIONAL | Human-readable label ("The Applicant"). |
| `description` | string | OPTIONAL | One-paragraph persona description, plain language. |
| `extensions` | object | OPTIONAL | `x-`-prefixed extension data. |

A processor MUST report a `NEED-DOC-001` finding (S9.4) for any `need.journey` not present in `journeys[]` when `journeys[]` is declared. A document MAY omit `journeys[]` entirely; `need.journey` values are then free grouping strings.

Journey grouping of **Needs** is this document's; grouping of Experience **Units** under tasks remains the Experience Document's. Same word, two graphs, two owners — recorded here so the seam is not re-litigated.

## 4. The Need

A **Need** is the substantive payload record.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string (pattern `^[a-zA-Z][a-zA-Z0-9_-]*$`, unique within `needs[]`) | REQUIRED | Stable identifier. Referenced by `needRefs[].id` and `need:` anchors. Renaming an id is supersession (S4.3), not an edit. |
| `journey` | string | OPTIONAL (RECOMMENDED) | Grouping key; resolves per S3. |
| `title` | string | OPTIONAL | Short display label. The Statement, not the title, is the content. |
| `statement` | object (S4.1) | REQUIRED | The Who / What / Why / Done block. |
| `grounding` | array of `Grounding` (S5), `minItems: 1` when present | CONDITIONAL | Evidence citations. Exactly one of `grounding` / `ungroundedReason` is present (S5.4). |
| `ungroundedReason` | string (closed enum, S5.4) | CONDITIONAL | Declared absence of evidence. |
| `origin` | string (closed enum, S4.2) | REQUIRED | How this Need entered the document. |
| `proposedBy` | `AuthorActor` (common schema) | CONDITIONAL | REQUIRED when `origin` is `ai-proposed`. |
| `status` | string (closed enum, S4.3) | REQUIRED | Lifecycle status. |
| `adoptedBy` | `AuthorActor` | CONDITIONAL | REQUIRED when `status` is `adopted` (and remains on `superseded` / `withdrawn` records that were once adopted). |
| `revision` | integer (>= 1) | REQUIRED | Content revision of statement + grounding (S4.4). |
| `supersedes` | string | OPTIONAL | The `id` of the Need this record replaces (S4.3). |
| `extensions` | object | OPTIONAL | `x-`-prefixed extension data. |

### 4.1 The Statement

The Statement is the JOURNEYS-shaped block: four short plain-language sentences.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `who` | string | REQUIRED | The kind of person, as they would describe themselves. A population, not a system role. |
| `want` | string | REQUIRED | The need, stated the way that person would say it. |
| `why` | string | REQUIRED | What happens if this is not met — the harm or the loss, concretely. |
| `done` | string | REQUIRED | The outcome the person would observe when the need is met. |

Normative authoring rules:

1. Every Statement field MUST be readable by a non-technical reader on first contact. Spec vocabulary (item paths, schema names, port names) MUST NOT appear in a Statement.
2. `done` MUST describe an outcome **observable by the person named in `who`** — not a system behavior, not an implementation state. "I hold a receipt that proves what I filed" is conformant; "the ledger anchors the submission hash" is not. This is the verifiability bar (ISO/IEC/IEEE 29148 lineage): if no one can observe it, no one can check it.
3. A Statement MUST NOT name a solution: no routes, screens, fields, widgets, or component names. Tooling cannot fully enforce this; reviewers MUST treat a solution-naming Statement as defective as authored.

### 4.2 Origin

`origin` is a **closed enum**. Processors MUST reject values outside this table.

| Value | Meaning | Conditional requirements |
|-------|---------|--------------------------|
| `human-asserted` | A human authored this Need directly (interview synthesis, policy analysis, owner judgment). | — |
| `ai-proposed` | An AI agent filed this Need (from analytics, feedback signals, or brief decomposition). | `proposedBy` REQUIRED; the Need MUST be filed with `status: proposed`. |
| `imported` | Migrated from a pre-existing corpus (e.g., a hand-maintained journeys file). | — |

`origin` is immutable for the life of the record: adoption does not rewrite how a Need entered the world. This mirrors the Rulespec `assertionOrigin` discipline (mapped in Appendix C, proposal RS-P2) without importing its namespace.

### 4.3 Status Lifecycle

`status` is a **closed enum**: `proposed | adopted | superseded | withdrawn`.

| Transition | Meaning | Rules |
|-----------|---------|-------|
| (filed) → `proposed` | Candidate awaiting human judgment. | The only legal filing status when `origin` is `ai-proposed`. |
| (filed) → `adopted` | Filed directly as adopted. | Legal only for `human-asserted` and `imported` origins. |
| `proposed` → `adopted` | A human adopts the Need. | `adoptedBy` REQUIRED. When `origin` is `ai-proposed`, `adoptedBy.kind` MUST be `human` — an AI-filed Need never self-adopts. This is the floor; deployments MAY narrow further via the reserved authority handle (S10.2). |
| `proposed` → `withdrawn` | Rejected without adoption. | — |
| `adopted` → `superseded` | Replaced by a successor Need. | The successor carries `supersedes: <this id>`; both records remain in the document. A record with `status: superseded` MUST be the target of exactly one live record's `supersedes`. |
| `adopted` → `withdrawn` | The need turned out to be wrong. | The record remains; withdrawal is evidence, not deletion. |

There are no other transitions. `superseded` and `withdrawn` are terminal. Deleting a Need record from the document is non-conformant maintenance; the supersession chain is the history.

### 4.4 Revision

`revision` is an integer, starting at `1`, covering the **content** of the Need: `statement` and `grounding` (including `ungroundedReason`). Any change to either MUST increment `revision`. Changes to `status`, `adoptedBy`, `title`, `journey`, or `extensions` MUST NOT increment it.

The boundary is deliberate: Need anchors pin `@revision` (S8) so that regeneration fires on content change; adoption of an unchanged statement is not a content change and MUST NOT invalidate anchors.

## 5. Grounding

A **Grounding** binds a Need to evidence. `grounding[]` entries are a discriminated union on `kind`.

### 5.1 Assertion Grounding — the normative channel

Cites a Rulespec assertion (or any Rulespec-addressable artifact) by IRI. Rulespec owns everything behind the IRI — warrant chain, authority derivation, usage eligibility, confidence. This spec refuses to restate any of it.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `kind` | `const: "assertion"` | REQUIRED | Union discriminant. |
| `ref` | string (URI) | REQUIRED | IRI of the cited assertion or artifact — a Rulespec workspace URN (`urn:rkaf:workspace:<ws>/<localId>`) or any identifier conformant to a Rulespec artifact-identifier scheme. Opaque to Formspec processors: resolution and semantic validation of the target are out of scope for every conformance class in this spec. |
| `role` | string (closed enum, S5.3) | OPTIONAL | Relationship of the evidence to the Need. Default `motivates`. |
| `description` | string | OPTIONAL | Clarifying note for reviewers. |
| `extensions` | object | OPTIONAL | `x-`-prefixed extension data. |

### 5.2 Observation Grounding — the empirical channel

A product-local research record at discovery weight: an interview moment, a usability session, an analytics signal, a support pattern, a field report.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `kind` | `const: "observation"` | REQUIRED | Union discriminant. |
| `method` | string (closed enum) | REQUIRED | `interview`, `usability-session`, `analytics`, `support-signal`, `field-report`. Processors MUST reject other values. |
| `uri` | string (URI) | REQUIRED | Source of the observation (research repository entry, analytics query, ticket). Not required to be content-addressable at this weight; the promotion path (S5.5) is the escalation to that discipline. |
| `excerpt` | object | OPTIONAL | The quoted moment: `exact` (REQUIRED within `excerpt`), `prefix`, `suffix` — the Web Annotation TextQuoteSelector shape (`oa:exact` / `oa:prefix` / `oa:suffix`), borrowed so the quote is re-findable in its source. |
| `observedAt` | string (RFC 3339 date or date-time) | OPTIONAL (RECOMMENDED) | When the observation was made — not when it was recorded here. |
| `observer` | `AuthorActor` | OPTIONAL | Who made the observation. |
| `role` | string (closed enum, S5.3) | OPTIONAL | Default `motivates`. |
| `description` | string | OPTIONAL | Clarifying note. |
| `extensions` | object | OPTIONAL | `x-`-prefixed extension data. |

### 5.3 The `role` Vocabulary

`role` is a **closed enum** shared by both grounding kinds:

| Value | Meaning |
|-------|---------|
| `motivates` | The evidence shows the lack exists (default). |
| `constrains` | The evidence bounds what any satisfying solution must honor. |
| `authorizes` | The evidence establishes that meeting this need is permitted or mandated. |

`constrains` and `authorizes` are drawn from the References `rel` vocabulary so the two citation surfaces stay mutually legible; `motivates` is this spec's addition. Extension roles MUST use `extensions`, not new `role` values.

### 5.4 Declared Absence — `ungroundedReason`

Exactly one of `grounding` (with at least one entry) or `ungroundedReason` MUST be present on every Need. A Need carrying neither, or both, is invalid (`NEED-GROUND-001`, S9.4). The rule is fail-closed by construction: silent ungroundedness is unrepresentable.

`ungroundedReason` is a **closed enum**:

| Value | Meaning | Rulespec correspondence |
|-------|---------|------------------------|
| `hypothesis` | We believe this and intend to validate it. | proposed as `rkaf:declared-hypothesis` (Appendix C, RS-P6) |
| `team-consensus` | The team holds this without a citable source. | `rkaf:consensus-without-citation` |
| `self-evident` | Foundational; evidence would be circular. | `rkaf:axiomatic` |

An `ungroundedReason` on an `adopted` Need is legal — adopting a hypothesis is a legitimate product decision — and is exactly what the reserved coverage query surfaces as discovery debt.

### 5.5 Promotion Path (informative)

When an Observation becomes load-bearing — cited in a procurement claim, contested by a stakeholder, feeding a compliance argument — it SHOULD be re-minted as a Rulespec assertion (empirical-family warrant, `humanAsserted` or AI-ladder origin, evidence binding built from the Observation's `uri` and `excerpt`) and the Grounding upgraded in place from `kind: "observation"` to `kind: "assertion"`. That upgrade is a content change and bumps `revision` (S4.4). The mechanical mapping is proposed as Rulespec-side work in Appendix C (RS-P1); until it lands, promotion is manual.

## 6. Document Integrity Rules

Beyond schema validity (S12), a conformant Needs Document satisfies:

1. **Id uniqueness.** `need.id` values are unique within `needs[]`; `journey.id` values within `journeys[]`.
2. **Supersession integrity.** Every `supersedes` value resolves to a `need.id` in the same document, and its target has `status: superseded`. A `superseded` record is the target of exactly one live record's `supersedes`.
3. **Journey resolution.** When `journeys[]` is declared, every `need.journey` resolves to a `journey.id`.
4. **Origin/status agreement.** An `ai-proposed` record carries `proposedBy`; an `adopted` record carries `adoptedBy`; an `ai-proposed` record with `status` beyond `proposed` carries `adoptedBy` with `kind: "human"` (S4.3).
5. **Grounding exclusivity.** Exactly one of `grounding` / `ungroundedReason` per Need (S5.4).

Violations are reported as `NEED-DOC-001` or `NEED-GROUND-001` findings (S9.4). Rules 4 and 5 are additionally schema-enforced (S12); the findings are registered so non-schema validators name the defects identically.

## 7. Citing Needs from Experience — `needRefs`

*This section specifies an addition to the Experience Unit shape (experience-spec S5.1). It lands in `schemas/experience.schema.json` with implementation; until then it is normative for this spec's conformance classes only.*

An Experience Unit MAY declare:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `needRefs` | array of `NeedRef` | OPTIONAL | The Needs this Unit serves. |

`NeedRef`:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | REQUIRED | A `need.id` in the paired Needs Document (S2.1). |
| `description` | string | OPTIONAL | Clarifying note. |
| `extensions` | object | OPTIONAL | `x-`-prefixed extension data. |

Semantics: a `needRef` is the inverse of the OSLC-RM `satisfiedBy` edge, carried on the satisfying side — the Unit declares what it serves; the Need record is never written by the citing side (S9's authored-state refusal). A `needRef` is **deliberately unpinned**: it does not carry a revision. The Unit serves the Need as currently worded; a copy-edit to a Statement does not invalidate authored intent. Pinning is the anchors' job (S8).

Resolution: when a Needs Document is paired, every `needRefs[].id` MUST resolve to a `need.id` in it; unresolved refs produce `NEED-REF-001`. A ref resolving to a `superseded` or `withdrawn` Need resolves successfully — staleness is the reserved codes' territory (S9.5), and one defect gets one code. When no Needs Document is paired, resolution is inapplicable and emits nothing (S2.1).

Richer edge roles (`elaboratedBy`, `decomposedBy`) are deferred; if added, they come from the OSLC-RM link-type set as a closed enum, not minted fresh.

## 8. Need Anchors — the GENERATION seam

*This section specifies an extension to the Generation anchor grammar (`schemas/common.schema.json` `$defs.Generation.anchors`). It lands with implementation.*

The anchor prefix set gains `need`:

```
^(item|unit|task|action|concept|need):.+$
```

A **need anchor** has the form:

```abnf
need-anchor = "need:" need-id "@" revision
need-id     = ; a need.id per S4 (pattern ^[a-zA-Z][a-zA-Z0-9_-]*$)
revision    = 1*DIGIT
```

Example: `need:proof-of-filing@2`.

Rules:

1. A generator that produces an artifact node in response to a Need MUST stamp a need anchor carrying the Need's `id` and the `revision` current at generation time.
2. Need anchors are **deliberately pinned**: regeneration tooling compares the anchored revision to the paired document's current revision to decide whether the projection is stale. Without the pin, three-way merge has no base.
3. This spec defines the anchor grammar and the staleness *condition* (anchored revision < current revision of the same `id`). What regeneration *does* about staleness — merge, preserve, orphan, queue — is the GENERATION discipline's and is out of scope here (see Status). The corresponding diagnostic codes are reserved, not specified (S9.5).

## 9. Coverage

Coverage is the load-bearing static predicate: it converts "does this release serve the needs we adopted?" from a meeting into a query. This section is normative for Needs Coverage checkers.

### 9.1 Inputs

A coverage run takes a caller-paired (Needs Document, bundle) pair (S2.1). The bundle contributes:

- every Experience Document it lists, and their `units[].needRefs[]`;
- every artifact node carrying Generation metadata, and their `need:` anchors.

### 9.2 The Coverage Predicate

For a Need `n` in the paired Needs Document:

> `n` is **served** iff `n.status` is `adopted` AND there exists at least one Unit `u` in a bundle Experience Document with a `needRefs[]` entry whose `id` equals `n.id`, OR at least one bundle artifact node carrying a need anchor whose `need-id` equals `n.id` (at any revision).

For a Unit `u` in a bundle Experience Document:

> `u` is **justified** iff `u.needRefs[]` is present with at least one entry.

Needs with status `proposed`, `superseded`, or `withdrawn` are outside the served/unserved partition — a candidate is not yet a commitment, and a terminal record is history.

### 9.3 Coverage Diagnostics

| Code | Severity | Fires |
|------|----------|-------|
| `NEED-COVERAGE-001` | `warning` | once per adopted, unserved Need |
| `NEED-COVERAGE-002` | `info` (profile-elevatable) | once per unjustified Unit |

Each finding MUST carry `code`, `severity`, the subject identifier (`needId` or `unitId` with its document), and a human-readable `message`.

Coverage findings are **reportable, not blocking** (design principle 1). They MUST NOT block validation, submission, generation, or any Core operation. Report rows SHOULD be framed assertor / subject / criterion / outcome (the EARL frame) so coverage reads like a conformance audit.

### 9.4 Diagnostic Registry — fire / does-not-fire conditions

**`NEED-GROUND-001`** — undeclared hypothesis. Severity `error`. Document conformance class.
- *Fires when:* a Need carries no `grounding` entry and no `ungroundedReason`; or carries both; or carries an empty `grounding` array.
- *Does not fire when:* exactly one of the two is present; or `ungroundedReason` appears on an `adopted` Need (legal — see S5.4).

**`NEED-DOC-001`** — document integrity violation. Severity `error`. Document conformance class.
- *Fires when:* any S6 rule other than grounding exclusivity is violated — duplicate ids; `supersedes` naming an unknown id; `supersedes` targeting a record whose status is not `superseded`; a `superseded` record with zero or multiple citing `supersedes`; unresolved `journey` when `journeys[]` is declared; missing `proposedBy` / `adoptedBy` under S6 rule 4; an `ai-proposed` record adopted by a non-human actor.
- *Does not fire when:* `journeys[]` is absent (journey values are then free strings); a `withdrawn` record has no successor (withdrawal needs none).

**`NEED-REF-001`** — unresolved need reference. Severity `error`. Needs Core processor class.
- *Fires when:* a `needRefs[].id` in a bundle Experience Document does not resolve to any `need.id` in the paired Needs Document.
- *Does not fire when:* no Needs Document is paired (inapplicable, S2.1); the ref resolves to a Need of any status, including `superseded` and `withdrawn` (that is reserved-code territory).

**`NEED-COVERAGE-001`** — unserved adopted Need. Severity `warning`. Coverage checker class.
- *Fires when:* an `adopted` Need has zero resolving `needRefs` citations and zero need anchors across the paired bundle.
- *Does not fire when:* the Need is `proposed`, `superseded`, or `withdrawn`; any single citation of either kind exists; no Needs Document is paired.

**`NEED-COVERAGE-002`** — unjustified Unit. Severity `info`, profile-elevatable to `warning`. Coverage checker class.
- *Fires when:* a Needs Document is paired and a Unit declares no `needRefs` entry.
- *Does not fire when:* no Needs Document is paired; the Unit carries at least one `needRefs` entry, even one that is unresolved (`NEED-REF-001` owns that defect — one defect, one code).

### 9.5 Reserved Codes

Registered now so deferred checks are not minted incompatibly later. These codes MUST NOT be emitted by v1 processors.

| Code | Reserved for |
|------|--------------|
| `NEED-STALE-001` | An artifact node anchored at `need:<id>@<r>` where `r` is lower than the current revision of `<id>` — the regeneration trigger surface (S8 rule 3). |
| `NEED-ORPHAN-001` | An artifact node anchored to a `withdrawn` or `superseded` Need with no adopted successor covering it. |

## 10. Processing Model

### 10.1 Steps

A **Needs Core processor** MUST:

1. **Load.** Parse the Needs Document as JSON and validate it against the schema in S12.
2. **Verify document integrity.** Apply the S6 rules; emit `NEED-DOC-001` / `NEED-GROUND-001` findings.
3. **Resolve need references.** When paired (S2.1), resolve every bundle `needRefs[].id`; emit `NEED-REF-001` for failures.

A **Needs Coverage checker** MUST additionally:

4. **Compute coverage.** Apply the S9.2 predicate over the pair.
5. **Emit coverage findings.** `NEED-COVERAGE-001` and `NEED-COVERAGE-002` per S9.4.

There is no Needs evaluation pipeline. The document is authored metadata; processors read, validate, resolve, and report. They do not "evaluate" it in the Core sense, and the four-phase Core cycle (Core S2.4) is unaffected.

### 10.2 Write Authority (reserved)

Who may *file* a Need is discriminated in-band by `origin` + `proposedBy` / `adoptedBy`. Who may *adopt* one is an actor-write-authority question in ADR 0152's territory. This spec **reserves** the vocabulary handle:

| Handle | Kind | Protects |
|--------|------|----------|
| `needs.adoption` | operation (reserved — NOT minted by this spec) | writing `status: adopted` — whether by filing directly at `adopted` or by transitioning `proposed → adopted` — and writing `adoptedBy`. |

Minting the row is an ADR 0152 §4.2 table amendment carrying its op mapping, per that ADR's registry discipline. Until minted, the floor rules of S4.3 (human-only adoption of `ai-proposed` Needs) are the only normative constraint, and they hold with or without a postured deployment. A deployment MAY NOT weaken the floor via posture; posture only narrows.

One inherited check is recorded as authoring guidance, not v1 machinery: adopting a Need whose Assertion Grounding cites a Rulespec assertion that Rulespec itself marks ineligible for operational use (`rkaf:usageEligibility`) is authority laundering on the product side. v1 processors do not resolve assertion IRIs (S5.1); postured deployments that do resolve them SHOULD refuse the adoption.

## 11. Conformance

### 11.1 Needs Document conformance

A conformant Needs Document:

1. Validates against the schema in S12.
2. Satisfies every S6 document-integrity rule.
3. Carries Statements meeting the S4.1 authoring rules. (Rules 1 and 3 of S4.1 are review-enforced; rule structure is schema-enforced.)

### 11.2 Needs Core processor conformance

A conformant Needs Core processor MUST:

1. Parse and validate any conformant Needs Document without error, and reject documents violating S12.
2. Apply the S6 integrity rules and emit `NEED-DOC-001` / `NEED-GROUND-001` findings; it MUST NOT silently repair violations.
3. Resolve `needRefs` per S7 when paired, emitting `NEED-REF-001` for failures, and emit nothing when unpaired.
4. Treat `origin`, `status`, `ungroundedReason`, `role`, and `method` as closed enums, rejecting unrecognized values.

### 11.3 Needs Coverage checker conformance

A conformant Needs Coverage checker MUST:

1. Satisfy all Needs Core processor requirements.
2. Compute the S9.2 predicate over every caller-paired (Needs Document, bundle) pair.
3. Emit `NEED-COVERAGE-001` and `NEED-COVERAGE-002` exactly per the S9.4 fire conditions.
4. NOT emit the S9.5 reserved codes.

### 11.4 Conformance Prohibitions

A conformant processor MUST NOT:

1. Use a Needs Document to alter data capture, validation, requiredness, relevance, calculation, or any other Core semantics.
2. Block validation, submission, generation, or any Core operation on the basis of any `NEED-*` finding.
3. Treat the Needs Document as a backlog: it carries no priority, no ordering semantics, and no scheduling meaning, and processors MUST NOT derive any.
4. Write coverage state, served-ness, or any computed judgment into a Needs Document. Coverage output is report-only.
5. Set or transition `status: adopted` on behalf of an `ai-agent` actor for an `ai-proposed` Need (S4.3).
6. Extend any closed enum in this spec. Extension semantics belong in `extensions` (S13).

## 12. Schema

The canonical structural contract. This content becomes `schemas/needs.schema.json` at implementation; it is presented here in full so the draft is complete without landing gate-wired files.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://formspec.org/schemas/needs/1.0",
  "title": "Formspec Needs Document",
  "description": "A Formspec Needs Document per the Needs specification. An authored artifact recording why software should exist: plain-language Need records grounded in normative evidence (Rulespec assertion IRIs) or empirical evidence (Observation research records), with declared-absence fail-closed, an adoption lifecycle, and supersession-never-erasure. The Needs Document targets no Definition; downstream artifacts cite Needs via needRefs and need: generation anchors. Needs MUST NOT alter core behavioral semantics (required, relevant, readonly, calculate, validation).",
  "type": "object",
  "required": ["$formspecNeeds", "version", "needs"],
  "additionalProperties": false,
  "patternProperties": {
    "^x-": {}
  },
  "properties": {
    "$formspecNeeds": {
      "type": "string",
      "const": "1.0",
      "description": "Needs specification version. MUST be '1.0'.",
      "examples": ["1.0"],
      "x-lm": {
        "critical": true,
        "intent": "Version pin for needs document compatibility"
      }
    },
    "version": {
      "type": "string",
      "minLength": 1,
      "description": "Version of this Needs Document. SemVer is RECOMMENDED.",
      "examples": ["1.0.0"],
      "x-lm": {
        "critical": true,
        "intent": "Needs document revision identifier"
      }
    },
    "url": {
      "type": "string",
      "format": "uri",
      "description": "Canonical URI identifier for this Needs Document. RECOMMENDED when external systems cite its Needs."
    },
    "name": {
      "type": "string",
      "pattern": "^[a-zA-Z][a-zA-Z0-9_\\-]*$"
    },
    "title": { "type": "string" },
    "description": { "type": "string" },
    "journeys": {
      "type": "array",
      "items": { "$ref": "#/$defs/Journey" },
      "uniqueItems": true
    },
    "needs": {
      "type": "array",
      "description": "Substantive payload. Each Need is an evidence-grounded plain-language statement of why software should exist, with lifecycle and revision.",
      "items": { "$ref": "#/$defs/Need" },
      "examples": [
        [
          {
            "id": "proof-of-filing",
            "statement": {
              "who": "anyone submitting this application under a deadline",
              "want": "a receipt I can save and show someone later",
              "why": "if the agency loses my submission, I lose rights I actually had",
              "done": "after I submit, I hold a receipt that proves what I filed and when"
            },
            "grounding": [
              {
                "kind": "assertion",
                "ref": "urn:rkaf:workspace:benefits/assertions/esign-retention-obligation",
                "role": "constrains"
              }
            ],
            "origin": "human-asserted",
            "status": "adopted",
            "adoptedBy": { "kind": "human", "actChannel": "human", "id": "urn:formspec:actor:human:pm:demo" },
            "revision": 1
          }
        ]
      ],
      "x-lm": {
        "critical": true,
        "intent": "The Need records; statement plain-language and grounding-or-declared-absence are the load-bearing rules"
      }
    },
    "extensions": {
      "$ref": "https://formspec.org/schemas/common/1.0#/$defs/Extensions"
    }
  },
  "$defs": {
    "Journey": {
      "type": "object",
      "required": ["id"],
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "pattern": "^[a-zA-Z][a-zA-Z0-9_-]*$",
          "description": "Stable identifier for this Journey. Unique within journeys[]. Referenced by need.journey.",
          "examples": ["applicant", "caseworker"]
        },
        "title": { "type": "string" },
        "description": { "type": "string" },
        "extensions": {
          "$ref": "https://formspec.org/schemas/common/1.0#/$defs/Extensions"
        }
      }
    },
    "Need": {
      "type": "object",
      "required": ["id", "statement", "origin", "status", "revision"],
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "pattern": "^[a-zA-Z][a-zA-Z0-9_-]*$",
          "description": "Stable identifier for this Need. Unique within needs[]. Referenced by Experience needRefs[].id and by need:<id>@<revision> generation anchors. Renaming is supersession, not an edit.",
          "examples": ["proof-of-filing"],
          "x-lm": {
            "critical": true,
            "intent": "The citation target for needRefs and need: anchors"
          }
        },
        "journey": {
          "type": "string",
          "description": "Grouping key. When journeys[] is declared, MUST resolve to a journeys[].id."
        },
        "title": { "type": "string" },
        "statement": { "$ref": "#/$defs/Statement" },
        "grounding": {
          "type": "array",
          "minItems": 1,
          "items": { "$ref": "#/$defs/Grounding" },
          "description": "Evidence citations. Exactly one of grounding / ungroundedReason is present (spec S5.4); the oneOf below enforces it."
        },
        "ungroundedReason": {
          "type": "string",
          "enum": ["hypothesis", "team-consensus", "self-evident"],
          "description": "Declared absence of evidence. Closed enum: hypothesis (we intend to validate), team-consensus (held without a citable source), self-evident (evidence would be circular). Mutually exclusive with grounding.",
          "examples": ["hypothesis"],
          "x-lm": {
            "critical": true,
            "intent": "Fail-closed declared-absence; silent ungroundedness is unrepresentable"
          }
        },
        "origin": {
          "type": "string",
          "enum": ["human-asserted", "ai-proposed", "imported"],
          "description": "How this Need entered the document. Closed enum. Immutable for the record's life; adoption does not rewrite entry. ai-proposed requires proposedBy and files at status proposed.",
          "examples": ["human-asserted"],
          "x-lm": {
            "critical": true,
            "intent": "Discriminates human-authored, AI-filed, and migrated needs; drives the adoption floor rules"
          }
        },
        "proposedBy": {
          "$ref": "https://formspec.org/schemas/common/1.0#/$defs/AuthorActor",
          "description": "REQUIRED when origin is ai-proposed. The filing actor."
        },
        "status": {
          "type": "string",
          "enum": ["proposed", "adopted", "superseded", "withdrawn"],
          "description": "Lifecycle status. Closed enum. proposed: candidate awaiting human judgment. adopted: a commitment (requires adoptedBy). superseded: replaced by a successor carrying supersedes (terminal). withdrawn: rejected or found wrong (terminal; the record remains).",
          "examples": ["adopted"],
          "x-lm": {
            "critical": true,
            "intent": "Coverage partitions on adopted; superseded/withdrawn are history, never deleted"
          }
        },
        "adoptedBy": {
          "$ref": "https://formspec.org/schemas/common/1.0#/$defs/AuthorActor",
          "description": "REQUIRED when status is adopted; remains on once-adopted superseded/withdrawn records. MUST be kind human when origin is ai-proposed."
        },
        "revision": {
          "type": "integer",
          "minimum": 1,
          "description": "Content revision covering statement + grounding (incl. ungroundedReason). Bumps on any content change; MUST NOT bump on status/adoptedBy/title/journey changes. Pinned by need:<id>@<revision> anchors.",
          "examples": [1, 2],
          "x-lm": {
            "critical": true,
            "intent": "The regeneration staleness base; anchors pin this value"
          }
        },
        "supersedes": {
          "type": "string",
          "pattern": "^[a-zA-Z][a-zA-Z0-9_-]*$",
          "description": "The need.id this record replaces. MUST resolve within this document to a record with status superseded."
        },
        "extensions": {
          "$ref": "https://formspec.org/schemas/common/1.0#/$defs/Extensions"
        }
      },
      "oneOf": [
        {
          "required": ["grounding"],
          "not": { "required": ["ungroundedReason"] }
        },
        {
          "required": ["ungroundedReason"],
          "not": { "required": ["grounding"] }
        }
      ],
      "allOf": [
        {
          "if": {
            "properties": { "origin": { "const": "ai-proposed" } },
            "required": ["origin"]
          },
          "then": {
            "required": ["proposedBy"]
          }
        },
        {
          "if": {
            "properties": { "status": { "const": "adopted" } },
            "required": ["status"]
          },
          "then": {
            "required": ["adoptedBy"]
          }
        },
        {
          "if": {
            "properties": {
              "origin": { "const": "ai-proposed" },
              "status": { "enum": ["adopted", "superseded", "withdrawn"] }
            },
            "required": ["origin", "status"]
          },
          "then": {
            "properties": {
              "adoptedBy": {
                "type": "object",
                "properties": { "kind": { "const": "human" } },
                "required": ["kind"]
              }
            }
          }
        }
      ]
    },
    "Statement": {
      "type": "object",
      "required": ["who", "want", "why", "done"],
      "additionalProperties": false,
      "description": "The Who / What / Why / Done block. Plain language is normative (spec S4.1): readable by a non-technical reader, no spec vocabulary, no solution names. done MUST describe an outcome observable by the person in who.",
      "properties": {
        "who": {
          "type": "string",
          "minLength": 1,
          "description": "The kind of person, as they would describe themselves. A population, not a system role.",
          "examples": ["anyone submitting this application under a deadline"]
        },
        "want": {
          "type": "string",
          "minLength": 1,
          "description": "The need, stated the way that person would say it.",
          "examples": ["a receipt I can save and show someone later"]
        },
        "why": {
          "type": "string",
          "minLength": 1,
          "description": "What happens if this is not met — the harm or the loss, concretely.",
          "examples": ["if the agency loses my submission, I lose rights I actually had"]
        },
        "done": {
          "type": "string",
          "minLength": 1,
          "description": "The outcome the person in who would observe when the need is met. Not a system behavior.",
          "examples": ["after I submit, I hold a receipt that proves what I filed and when"]
        }
      },
      "x-lm": {
        "critical": true,
        "intent": "Plain-language requirement statement; the verifiability bar lives on done"
      }
    },
    "Grounding": {
      "oneOf": [
        { "$ref": "#/$defs/AssertionGrounding" },
        { "$ref": "#/$defs/ObservationGrounding" }
      ],
      "description": "Discriminated union on kind: assertion (normative channel — Rulespec IRI, cite never compile) or observation (empirical channel — product-local research record)."
    },
    "AssertionGrounding": {
      "type": "object",
      "required": ["kind", "ref"],
      "additionalProperties": false,
      "properties": {
        "kind": { "const": "assertion" },
        "ref": {
          "type": "string",
          "format": "uri",
          "minLength": 1,
          "description": "IRI of the cited Rulespec assertion or artifact (e.g., urn:rkaf:workspace:<ws>/<localId>). Opaque to Formspec processors; Rulespec owns everything behind it.",
          "examples": ["urn:rkaf:workspace:benefits/assertions/esign-retention-obligation"],
          "x-lm": {
            "critical": true,
            "intent": "The typed ref across the Formspec/Rulespec decision boundary"
          }
        },
        "role": { "$ref": "#/$defs/GroundingRole" },
        "description": { "type": "string" },
        "extensions": {
          "$ref": "https://formspec.org/schemas/common/1.0#/$defs/Extensions"
        }
      }
    },
    "ObservationGrounding": {
      "type": "object",
      "required": ["kind", "method", "uri"],
      "additionalProperties": false,
      "properties": {
        "kind": { "const": "observation" },
        "method": {
          "type": "string",
          "enum": ["interview", "usability-session", "analytics", "support-signal", "field-report"],
          "description": "How the observation was made. Closed enum.",
          "examples": ["interview"],
          "x-lm": {
            "critical": true,
            "intent": "Empirical method; closed so coverage queries can partition by it"
          }
        },
        "uri": {
          "type": "string",
          "format": "uri",
          "description": "Source of the observation (research repository entry, analytics query, ticket). Discovery-weight: not required to be content-addressable; promotion to a Rulespec assertion is the escalation.",
          "examples": ["https://benefits.example.gov/research/2026-06-round#p4"]
        },
        "excerpt": { "$ref": "#/$defs/Excerpt" },
        "observedAt": {
          "type": "string",
          "description": "RFC 3339 date or date-time of the observation itself.",
          "examples": ["2026-06-12"]
        },
        "observer": {
          "$ref": "https://formspec.org/schemas/common/1.0#/$defs/AuthorActor"
        },
        "role": { "$ref": "#/$defs/GroundingRole" },
        "description": { "type": "string" },
        "extensions": {
          "$ref": "https://formspec.org/schemas/common/1.0#/$defs/Extensions"
        }
      }
    },
    "Excerpt": {
      "type": "object",
      "required": ["exact"],
      "additionalProperties": false,
      "description": "The quoted moment, Web Annotation TextQuoteSelector-shaped (oa:exact / oa:prefix / oa:suffix) so the quote is re-findable in its source.",
      "properties": {
        "exact": {
          "type": "string",
          "minLength": 1,
          "examples": ["I screenshot every confirmation page because they lost my renewal once."]
        },
        "prefix": { "type": "string" },
        "suffix": { "type": "string" }
      }
    },
    "GroundingRole": {
      "type": "string",
      "enum": ["motivates", "constrains", "authorizes"],
      "default": "motivates",
      "description": "Relationship of the evidence to the Need. motivates: shows the lack exists. constrains: bounds any satisfying solution. authorizes: establishes that meeting the need is permitted or mandated. constrains/authorizes shared with the References rel vocabulary."
    }
  }
}
```

**Companion deltas landing with implementation (fragments, not standalone schemas):**

`schemas/experience.schema.json` — `Unit` gains `needRefs`; new `$defs.NeedRef`:

```json
{
  "NeedRef": {
    "type": "object",
    "required": ["id"],
    "additionalProperties": false,
    "properties": {
      "id": {
        "type": "string",
        "pattern": "^[a-zA-Z][a-zA-Z0-9_-]*$",
        "description": "A need.id in the paired Needs Document. Deliberately unpinned: no revision — the Unit serves the Need as currently worded (needs-spec S7)."
      },
      "description": { "type": "string" },
      "extensions": { "$ref": "#/$defs/Extensions" }
    }
  }
}
```

`schemas/common.schema.json` — `$defs.Generation.anchors.items.pattern` becomes:

```json
{ "pattern": "^(item|unit|task|action|concept|need):.+$" }
```

with the `need:` arm's `need:<id>@<revision>` grammar normative in S8 (the shared regex stays broad by existing convention; per-prefix grammar is spec prose).

## 13. Extension Points

Needs Documents support the standard Formspec extension model: `x-`-prefixed keys at the document level and `extensions` objects on `Journey`, `Need`, and both Grounding shapes.

Extensions MUST NOT:

1. Override or alter any property defined by this specification.
2. Introduce parallel status, origin, role, method, or ungroundedReason taxonomies under different property names.
3. Carry priority, ordering, or scheduling semantics (Conformance Prohibition S11.4.3 applies to extension content equally).

Common extension patterns (informative): `x-research-round` (which discovery cycle produced the grounding), `x-ticket` (tracking-system identifier for the adoption decision), `x-locale` (the language the observation was conducted in).

## 14. Security Considerations

- **Research excerpts are the sensitive surface.** Observation `excerpt.exact` values are verbatim quotes from real research participants and can identify them. Authors SHOULD anonymize excerpts at recording time; a Needs Document MUST be handled at the same sensitivity level as the research corpus it quotes. Field-level visibility scoping is deferred (an `x-` extension until a real consumer motivates a normative shape).
- **Excerpts are data, not instruction.** Generators consuming Needs Documents (brief decomposition, unit seeding) MUST treat Statement and excerpt text as untrusted data, never as instructions — a hostile interview quote must not steer an authoring agent. This mirrors the Rulespec AI-substrate obligation on retrieved source material.
- **Untrusted document loading.** Validate against S12 before any processor consumes the document; impose reasonable size limits on `needs[]` and `grounding[]`.
- **IRI resolution.** `AssertionGrounding.ref` and `ObservationGrounding.uri` MUST NOT be blindly fetched. Maintain an allowlist of evidence sources.
- **Provenance honesty.** `origin` and the adoption floor (S4.3) are integrity claims. A processor that rewrites `ai-proposed` to `human-asserted`, or back-fills `adoptedBy`, is laundering authorship; conformance prohibits it (S11.4.5) and postured deployments enforce it (S10.2).

---

## Appendix A: Full Example — Benefits Assistance Bundle

The example corpus is the lifecycle-demo bundle (`https://benefits.example.gov/apps/assistance`). It demonstrates: both grounding kinds; a declared hypothesis; the AI-filed → human-adopted ladder; supersession; the `needRefs` seam; a need anchor; and which diagnostics fire.

**The Needs Document:**

```json
{
  "$formspecNeeds": "1.0",
  "version": "1.2.0",
  "url": "https://benefits.example.gov/apps/assistance/needs",
  "title": "Benefits assistance -- who this is for and why",
  "journeys": [
    { "id": "applicant", "title": "The Applicant", "description": "The person applying for help, usually on a phone, often under a deadline." }
  ],
  "needs": [
    {
      "id": "proof-of-filing",
      "journey": "applicant",
      "statement": {
        "who": "anyone submitting this application under a deadline",
        "want": "a receipt I can save and show someone later",
        "why": "if the agency loses my submission, I lose rights I actually had",
        "done": "after I submit, I hold a receipt that proves what I filed and when -- even if the agency's system is gone"
      },
      "grounding": [
        {
          "kind": "assertion",
          "ref": "urn:rkaf:workspace:benefits/assertions/esign-retention-obligation",
          "role": "constrains"
        },
        {
          "kind": "observation",
          "method": "interview",
          "uri": "https://benefits.example.gov/research/2026-06-round#p4",
          "excerpt": { "exact": "I screenshot every confirmation page because they lost my renewal once." },
          "observedAt": "2026-06-12",
          "observer": { "kind": "human", "actChannel": "human", "id": "urn:formspec:actor:human:researcher:demo" },
          "role": "motivates"
        }
      ],
      "origin": "human-asserted",
      "status": "adopted",
      "adoptedBy": { "kind": "human", "actChannel": "human", "id": "urn:formspec:actor:human:pm:demo" },
      "revision": 2
    },
    {
      "id": "know-where-i-stand",
      "journey": "applicant",
      "statement": {
        "who": "anyone waiting on a decision about their application",
        "want": "to check what is happening to my case without calling anyone",
        "why": "people give up on help they are entitled to when they cannot tell whether anything is moving",
        "done": "I can look at one place and see where my application is and what happens next"
      },
      "grounding": [
        {
          "kind": "observation",
          "method": "support-signal",
          "uri": "https://benefits.example.gov/support/queues/status-calls-2026Q2",
          "excerpt": { "exact": "Most common call driver: 'did you get my application?'" },
          "observedAt": "2026-07-01",
          "role": "motivates"
        }
      ],
      "origin": "human-asserted",
      "status": "adopted",
      "adoptedBy": { "kind": "human", "actChannel": "human", "id": "urn:formspec:actor:human:pm:demo" },
      "revision": 1
    },
    {
      "id": "finish-on-another-device",
      "journey": "applicant",
      "statement": {
        "who": "anyone filling out this application on a phone",
        "want": "to start on my phone and finish later on a computer",
        "why": "losing twenty minutes of answers means many people never come back",
        "done": "when I come back on any device, my answers are where I left them"
      },
      "grounding": [
        {
          "kind": "observation",
          "method": "analytics",
          "uri": "https://benefits.example.gov/analytics/funnels/abandonment-2026-07",
          "excerpt": { "exact": "Drop-off concentrates at the document-upload step on mobile sessions." },
          "observedAt": "2026-07-20",
          "observer": { "kind": "ai-agent", "actChannel": "agent", "id": "urn:formspec:actor:ai-agent:analytics-review:demo" },
          "role": "motivates"
        }
      ],
      "origin": "ai-proposed",
      "proposedBy": { "kind": "ai-agent", "actChannel": "agent", "id": "urn:formspec:actor:ai-agent:analytics-review:demo" },
      "status": "proposed",
      "revision": 1
    },
    {
      "id": "works-without-good-internet",
      "journey": "applicant",
      "statement": {
        "who": "anyone applying from a place with unreliable internet",
        "want": "the application to keep working when my connection drops",
        "why": "the people who need this help most often have the worst connections",
        "done": "a dropped connection never costs me my answers"
      },
      "ungroundedReason": "hypothesis",
      "origin": "human-asserted",
      "status": "adopted",
      "adoptedBy": { "kind": "human", "actChannel": "human", "id": "urn:formspec:actor:human:pm:demo" },
      "revision": 1
    }
  ]
}
```

**The Experience fragment** (Definition-scoped, in the same bundle):

```json
{
  "units": [
    {
      "id": "receipt",
      "kind": "confirmation",
      "actorRef": "applicant",
      "needRefs": [{ "id": "proof-of-filing" }],
      "itemRefs": [{ "path": "submissionReceipt", "purpose": "display" }]
    },
    {
      "id": "statusCheck",
      "kind": "review",
      "actorRef": "applicant",
      "needRefs": [{ "id": "know-where-i-stand" }],
      "itemRefs": [{ "path": "caseStatus", "purpose": "display" }]
    },
    {
      "id": "householdEntry",
      "kind": "data-entry",
      "actorRef": "applicant",
      "itemRefs": [{ "path": "household.members[*].firstName" }]
    }
  ]
}
```

**A generated node carrying a need anchor** (Component tier, `x-generation` per common schema):

```json
{
  "x-generation": {
    "strategy": "unit-to-card",
    "generatedAt": "2026-07-27T09:00:00Z",
    "anchors": ["unit:receipt", "need:proof-of-filing@2"]
  }
}
```

**Coverage run outcome** for this pair:

| Subject | Diagnostic | Why |
|---------|-----------|-----|
| `works-without-good-internet` | `NEED-COVERAGE-001` (warning) | Adopted, zero citations of either kind. The hypothesis was adopted; nothing built serves it — visible discovery and build debt in one row. |
| `householdEntry` | `NEED-COVERAGE-002` (info) | A paired Needs Document exists and the unit cites nothing. |
| `finish-on-another-device` | — | `proposed` needs are outside the served/unserved partition; no fire. When a human adopts it and nothing cites it, `NEED-COVERAGE-001` starts firing. |
| `proof-of-filing`, `know-where-i-stand` | — | Served (needRefs; `proof-of-filing` additionally anchored at its current revision). |

## Appendix B: References

| Tag | Reference |
|---|---|
| [rfc2119] | Bradner, S., "Key words for use in RFCs to Indicate Requirement Levels", BCP 14, RFC 2119, March 1997. |
| [RFC 8174] | Leiba, B., "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words", BCP 14, RFC 8174, May 2017. |
| [RFC 8259] | Bray, T., Ed., "The JavaScript Object Notation (JSON) Data Interchange Format", STD 90, RFC 8259, December 2017. |
| [RFC 3986] | Berners-Lee, T., Fielding, R., and L. Masinter, "Uniform Resource Identifier (URI): Generic Syntax", STD 66, RFC 3986, January 2005. |
| Exploration | The Needs Layer — requirements and discovery as substrate data, `thoughts/2026-07-27-needs-layer-exploration.md` (stack root). |
| Rulespec | Rulespec Core — Vocabulary v0.2, `PKAF/spec/rkaf-core.md`. |
| Experience | Formspec Experience Specification, `specs/experience/experience-spec.md`. |
| OA | W3C Web Annotation Ontology 1.0 — TextQuoteSelector (`oa:exact` / `oa:prefix` / `oa:suffix`). |
| OSLC-RM | OASIS OSLC Requirements Management — `satisfiedBy` link-type lineage for `needRefs`. |
| 29148 | ISO/IEC/IEEE 29148 — requirement attributes and the verifiability bar on `done`. |
| ADR 0152 | Multi-actor authorization scope, `thoughts/adr/0152-multi-actor-authorization-scope.md` (stack root) — the reserved `needs.adoption` handle's registry. |
| ADR 0159 | Product substrate recognition, `thoughts/adr/0159-product-substrate-recognition.md` (stack root) — port ontology; the PURPOSE mint decision this spec does not make. |

---

## Appendix C: Proposals to Rulespec (own there, not duplicated here)

Each point where this spec chose mirror-not-import or product-local shapes, re-litigated as a proposal to change Rulespec instead. Format per proposal: what changes in Rulespec; what Formspec then deletes or simplifies; the cost to Rulespec's charter; verdict with one-line reason. Written to be filed as tickets in the Rulespec repo as-is.

**The structural fact governing every verdict:** the stack's topological build order places PKAF/Rulespec *downstream* of Formspec (`... → formspec → ... → PKAF`, stack `Makefile`). Formspec schemas and processors therefore cannot consume Rulespec vocabulary, tooling, or validation without inverting the build order. Citation by opaque IRI is dependency-free; anything more is not. Additionally, Rulespec Core §11 supersedes releases **wholesale with no migration shim** (v0.2 parses no v0.1 payloads) — any Formspec schema that embeds `rkaf:` tokens inherits that breakage policy into Formspec document validity.

### RS-P1 — Observation intake profile: a documented Observation→Assertion mapping

- **What changes in Rulespec:** A new informative companion (proposed home: `spec/rkaf-observation-intake.md`) defining the mechanical mapping from a Formspec Observation Grounding to a full Rulespec assertion: `uri` → `rkaf:Artifact` under `rkaf:partner-defined` identifier scheme; `excerpt` → `oa:TextQuoteSelector` on an `rkaf:SourceFragment`; `method` → empirical-family `rkaf:warrantKind` (`interview`/`usability-session`/`field-report` → `rkaf:empirical`; `analytics` → `rkaf:methodological`; `support-signal` → `rkaf:sourceReliability`); `observer` → `prov:wasAttributedTo`; resulting assertion at `rkaf:usageEligibility: rkaf:searchOnly` until independently revalidated. Acceptance: one positive fixture pair (Observation JSON in, conformant assertion JSON-LD out) in `fixtures/`, exercised by the vocab audit.
- **What Formspec deletes/simplifies:** Nothing deleted — S5.5's promotion path stops being manual prose and becomes a cited, testable mapping; future promotion tooling implements the mapping instead of designing one.
- **Cost to Rulespec's charter:** Low. It is a projector-pattern companion (Rulespec Layer 4 posture), adds no vocabulary, and the `searchOnly` landing eligibility preserves the anti-score-theater discipline — a promoted interview quote enters *below* operational validity, exactly as the charter wants.
- **Verdict:** **PROPOSE-TO-RULESPEC** (the mapping) / **KEEP-LOCAL** (the Observation record itself) — discovery-tempo records must not require JSON-LD, workspace URNs, and L2 validation, and stack topology forbids the dependency; the mapping makes escalation mechanical without moving the record.

### RS-P2 — Reference the assertionOrigin ladder by IRI instead of mirroring it

- **What changes in Rulespec:** Nothing — the proposal is that Formspec `origin` values become `rkaf:` IRIs (`rkaf:humanAsserted`, `rkaf:aiSuggested`, ...) validated against Rulespec's enum.
- **What Formspec deletes/simplifies:** The `origin` enum and its mapping note; one vocabulary instead of two.
- **Cost to Rulespec's charter:** None to Rulespec — the cost lands on Formspec: embedding `rkaf:` tokens couples Formspec document validity to Rulespec's wholesale-supersession release policy (Core §11 — the v0.1→v0.2 break would have invalidated every Needs Document), and Formspec's ladder is deliberately smaller (`human-asserted | ai-proposed | imported` — filing-time states only; `aiPromoted`/`humanQualified` are Rulespec consumer-lifecycle refinements a product-discovery record does not need).
- **Verdict:** **KEEP-LOCAL** — a correspondence table (S4.2, S5.4) delivers interop at zero release-coupling; Rulespec's own no-shim supersession policy is the disqualifier for token embedding.
  Correspondence for the record: `human-asserted` ≈ `rkaf:humanAsserted`; `ai-proposed` + human adoption ≈ `rkaf:aiSuggested` → `rkaf:aiPromoted` with `rkaf:AILineage.humanApprover` = `adoptedBy`; `imported` ≈ `rkaf:imported`.

### RS-P3 — Register a `formspec-need` artifact-identifier scheme

- **What changes in Rulespec:** Add `rkaf:formspec-need` to the closed `rkaf:artifactIdentifierScheme` enum (Core §4.1), denoting a Formspec Needs Document `url` + `need.id` pair (`<docUrl>#<needId>`), optionally at `@<revision>`. Per the closed-taxonomy discipline (Core §3) this requires a release with a declared URI. Acceptance: enum value declared; one positive fixture of an assertion citing a product need as evidence subject; one negative fixture (mutable URL without the scheme tag rejected).
- **What Formspec deletes/simplifies:** Nothing structural — it gains the **reverse edge**: a Rulespec assertion (e.g., a compliance finding, an adopted policy position) can cite a product Need first-class, making "the policy corpus knows what the product committed to" expressible without Formspec doing anything.
- **Cost to Rulespec's charter:** Low but real — one closed-enum extension, release-gated, naming a partner format in the universal vocabulary. Precedent exists (`rkaf:eli`, `rkaf:uslm` name external schemes); the alternative (`rkaf:partner-defined`) works today but makes need-citations indistinguishable from arbitrary partner URIs in federation queries.
- **Verdict:** **PROPOSE-TO-RULESPEC** — cheap, precedented, and it is the only way the assertion→need direction becomes queryable; Formspec cannot add it from its side of the boundary.

### RS-P4 — Put Need IDs under the Rulespec workspace URN scheme (one resolver serves both)

- **What changes in Rulespec:** Nothing structural — `urn:rkaf:workspace:<ws>/<localId>` already admits partner-local ids; at most a documented `needs/` local-id convention.
- **What Formspec deletes/simplifies:** The document-`url` identity convention for cross-system citation; one resolver (the workspace federation model) instead of HTTPS-plus-fragment.
- **Cost to Rulespec's charter:** None to Rulespec; the cost is Formspec's — every `needRef` and anchor drags a workspace URN into authoring keystrokes, Needs Document identity moves under Rulespec namespace governance and its no-migration supersession policy, and the "one resolver" already exists: HTTPS. Formspec's own sidecar family (References, Ontology, Experience) is URL-identified; Needs breaking that convention would be the odd one out.
- **Verdict:** **KEEP-LOCAL** — `url` + `id` composes to a resolvable identifier with the resolver the web ships; RS-P3 covers the only cross-system case that needs a registered scheme.

### RS-P5 — One traceability edge owned once (Justification/GeneratedWorkProduct vs needRefs)

- **What changes in Rulespec:** The maximal version: Experience Units citing Needs would be expressed as `rkaf:GeneratedWorkProduct` nodes with `rkaf:Justification` edges (`rkaf:justifiedByAssertion`), making Rulespec the single owner of the traceability edge.
- **What Formspec deletes/simplifies:** `needRefs` and the coverage predicate's citation half — both would become queries over a Rulespec graph.
- **Cost to Rulespec's charter:** High, and the move is wrong on both sides. These are different edges: Grounding is need→assertion (why the need is legitimate); `needRefs` is unit→need (what serves the need). Their *composition* — unit→assertion, "this screen traces to this statutory obligation" — is exactly Justification-shaped, and is derivable, not authored. Owning the unit→need edge in Rulespec drags every Experience author into JSON-LD and inverts stack topology; it also violates Rulespec's own §9.4 discipline in reverse — Formspec owns the product-artifact problem the way ELI owns legal identity.
- **Verdict:** **KEEP-LOCAL** — same edge *family* at two layers by design; the composed unit→assertion trace is future Formspec export tooling emitting Rulespec-conformant `Justification`/`GeneratedWorkProduct` graphs (no Rulespec change required — the shapes are already generic), deferred until a compliance consumer asks.

### RS-P6 — Add `rkaf:declared-hypothesis` to `noEvidenceReason`

- **What changes in Rulespec:** Add `rkaf:declared-hypothesis` to the closed `rkaf:noEvidenceReason` enum (Core §4.3): the assertion is a deliberately held, not-yet-validated belief, distinct from `rkaf:axiomatic` (needs no evidence) and `rkaf:consensus-without-citation` (has social grounding). Constraint: an assertion carrying it SHOULD be capped at `rkaf:usageEligibility: rkaf:searchOnly` or `rkaf:reviewQueueOnly` until an EvidenceBinding-with-fragment replaces the reason. Acceptance: enum value + shape constraint + positive/negative fixtures per the Core §10 validation contract.
- **What Formspec deletes/simplifies:** Nothing now; it completes RS-P1 — without it, a promoted *hypothesis* Need has no honest landing in Rulespec (this spec's `hypothesis` currently maps to nothing, S5.4), so promotion would force either fake evidence or a misleading `consensus-without-citation`.
- **Cost to Rulespec's charter:** Low and charter-aligned — declared absence over silent absence is Rulespec's own move; the eligibility cap keeps hypothesis assertions out of operational use, which is the anti-laundering posture.
- **Verdict:** **PROPOSE-TO-RULESPEC** — closes the only hole in the `ungroundedReason` correspondence table, at the cost of one release-gated enum value.

### RS-P7 — Residual overlaps found while reading PKAF (recorded, not proposed)

- **RetentionPolicy / AccessScope on research excerpts.** Observation excerpts are PII-adjacent (S14); Rulespec ships typed `rkaf:RetentionPolicy` and `rkaf:AccessScope`. **KEEP-LOCAL (defer)** — no consumer yet; when field-level visibility or retention on Needs Documents becomes real, adopt these shapes' *structure* via `x-` extension first, and only propose cross-namespace composition if a federation consumer appears.
- **`rkaf:llmHint` vs `x-lm`.** Independent convergence on the same idea (LM-attention annotations). **KEEP-LOCAL** — both are house conventions on opposite sides of the boundary; unification is churn with no consumer.
- **`rkaf:Finding` vs Formspec diagnostics.** Name collision only (this spec's Observation rename already avoids compounding it). No action on either side.

*End of Formspec Needs Specification.*

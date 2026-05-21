---
title: Formspec Experience Specification
version: 1.0.0-draft.1
date: 2026-05-21
status: draft
---

# Formspec Experience Specification v1.0

**Version:** 1.0.0-draft.1
**Date:** 2026-05-21
**Editors:** Formspec Working Group
**Companion to:** Formspec v1.0 -- A JSON-Native Declarative Form Standard

---

## Status of This Document

This document is a **draft specification**. It is a companion to the [Formspec v1.0 core specification](../core/spec.md) and does not modify or extend the core processing model. Implementors are encouraged to experiment with this specification and provide feedback, but MUST NOT treat it as stable for production use until a 1.0.0 release is published.

This spec was promoted from the concept architecture note [`thoughts/specs/2026-05-20-formspec-semantic-layers.md`](../../thoughts/specs/2026-05-20-formspec-semantic-layers.md) (the "Experience" semantic layer). It addresses the **Experience shape** promotion gate from §9 of that note: actors, tasks, units, applicability, typed references, abstract `unit.kind`, coverage expectations, and seed-from-Definition guidance.

## Conventions and Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [BCP 14][rfc2119] [RFC 2119] [RFC 8174] when, and only when, they appear in ALL CAPITALS, as shown here.

JSON syntax and data types are as defined in [RFC 8259]. URI syntax is as defined in [RFC 3986]. JSON Pointer syntax is as defined in [RFC 6901].

Terms defined in the Formspec v1.0 core specification -- including *Definition*, *Item*, *Response*, *Bind*, *FEL*, and *conformant processor* -- retain their core-specification meanings throughout this document unless explicitly redefined.

Additional terms:

- **Experience Document** -- A JSON document conforming to this specification, identified by `$formspecExperience: "1.0"`.
- **Actor** -- A role that interacts with the form (e.g., applicant, reviewer, assister).
- **Task** -- A unit of user-visible work the form supports (e.g., "identify applicant", "submit application").
- **Unit** -- A grouping of typed references to Definition items, concepts, and actions, organized under `unit.kind` and, when applicable, one or more tasks.
- **Coverage** -- A static predicate over a Definition and an Experience asserting that every required, visibly relevant Definition item is referenced by at least one Unit.
- **Coverage-aware processor** -- An Extended processor that, in addition to schema validation, computes and reports coverage findings.

[rfc2119]: https://www.rfc-editor.org/rfc/rfc2119
[RFC 3986]: https://www.rfc-editor.org/rfc/rfc3986
[RFC 6901]: https://www.rfc-editor.org/rfc/rfc6901
[RFC 8174]: https://www.rfc-editor.org/rfc/rfc8174
[RFC 8259]: https://www.rfc-editor.org/rfc/rfc8259

---

## Bottom Line Up Front

<!-- bluf:start file=experience-spec.bluf.md -->
- This document defines the Experience Document -- an authored sidecar JSON artifact that names abstract task intent for a Formspec Definition: actors, tasks, units, applicability, and typed references to items, concepts, and actions.
- A valid Experience Document requires `$formspecExperience`, `version`, and `targetDefinition`; at least one populated `actors`, `tasks`, or `units` array is RECOMMENDED, and `units` carries the substantive coverage payload.
- `unit.kind` is a closed, abstract, task-oriented registry -- `data-entry`, `review`, `confirmation`, `evidence-collection`, `attestation`, `error-resolution`, `assistance` -- chosen so units do not become layout containers.
- Coverage is a static predicate: every Definition item that is required and not statically non-relevant MUST appear in at least one `unit.itemRefs`; Coverage-aware processors MUST report uncovered required items.
- Experience MUST NOT affect data capture, validation, or the processing model; this BLUF is governed by `schemas/experience.schema.json`, the canonical structural contract.
<!-- bluf:end -->

---

## 1. Introduction

### 1.1 Purpose and Scope

The Formspec Experience Specification defines an authored sidecar document that names **abstract task intent** for a Formspec Definition. An Experience Document groups typed references to Definition items, concepts, and actions under named **Units**, each describing what a user is trying to do -- not how a renderer should draw it.

Experience exists so that generators, reviewers, and tools can:

1. Derive Component drafts from semantic source (Definition + Experience + Response Actions).
2. Detect required, visibly relevant Definition items that no Unit covers.
3. Reason about audience, applicability, and accessibility intent without consulting Component layout.
4. Index relationships for review and regeneration tooling (Trace).

This specification does NOT define:

- Concrete layout, widget choice, page composition, or visual presentation. Those belong to **Component** and **Theme**.
- Validation rules, calculation rules, requiredness, or relevance. Those belong to **Definition** (core S4).
- Submission payloads or transformation rules. Those belong to **Mapping**.
- Form-scoped action orchestration. That belongs to **Response Actions** (forthcoming companion spec).
- Durable workflow events or governed case lifecycle. Those belong to **WOS** and **Respondent Ledger**.

### 1.2 Relationship to Formspec Core

| Layer | Concern | Defined In |
|-------|---------|------------|
| Structure | What data to collect | Core S4 (Items) |
| Behavior | How data behaves | Core S4.3 (Binds), S5 (Shapes) |
| Task intent | What the user is trying to do | **this spec** |
| Presentation | How data is displayed | Core S4.2.5 (Tier 1) + Theme (Tier 2) + Component (Tier 3) |
| Localization | Display strings | Locale |
| Boundary translation | External payload | Mapping |

Experience is **authored source**. It does not derive from Definition; tools MAY *seed* an Experience from a Definition (see S9), but the Experience-Definition relationship is not one-to-one.

### 1.3 Design Principles

1. **Additive, not invasive.** Experience MUST NOT affect data capture, validation, or the processing model. A Core processor that ignores Experience produces identical Responses.
2. **Task intent, not layout.** Units describe what the user is doing, not what the renderer draws. `unit.kind` is closed, abstract, and task-oriented (S5.2).
3. **Reference, never own.** Experience references Items by Definition path; it does not redefine Items, redefine binds, or override Component / Theme decisions.
4. **Coverage is detectable.** A static predicate (S8) MUST be expressible over (Definition, Experience) such that uncovered required visible items are identifiable without runtime evaluation.
5. **Honest provenance.** Experience documents that are seeded or regenerated MUST be authored-or-generated-or-edited; this spec does not introduce generation metadata (that lives in Component additions, concept §10.5).

### 1.4 Conformance Levels

This specification defines two conformance levels:

| Level | Requirements |
|-------|--------------|
| **Experience Core** | MUST schema-validate; MUST resolve `targetDefinition` against a loaded Definition. |
| **Experience Coverage-Aware** | All of Core, plus MUST compute and report the coverage predicate (S8) on every loaded (Definition, Experience) pair. |

A conformant Core processor MAY ignore Experience entirely. A conformant Extended processor that loads Experience MUST validate it against the schema in S11 and MUST verify `targetDefinition.url` matches the loaded Definition's `url`.

#### 1.4.1 Conformance Prohibitions

A conformant processor MUST NOT:

1. Use Experience to alter data capture, validation, requiredness, relevance, calculation, or any other Core semantics.
2. Treat Experience as authoritative for layout, widget selection, or page composition.
3. Substitute Experience for a missing Definition; an Experience without a resolvable target is invalid (S2).
4. Add `unit.kind` values outside the registry (S5.2). Custom semantics belong in `extensions`; they MUST NOT extend or override the closed `kind` registry.

## 2. Document Structure

An Experience Document is a JSON object at the top level with the following properties. (Generated schema reference tables replace this prose table in S11 once the schema lands; the prose form here is normative until then.)

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `$formspecExperience` | string (`const: "1.0"`) | REQUIRED | Document type marker; pins to spec major version. |
| `version` | string (semver) | REQUIRED | Version of this Experience Document. |
| `targetDefinition` | object | REQUIRED | `{ url, compatibleVersions }` binding to a Definition (same shape as Theme / Component / Locale). |
| `name` | string | OPTIONAL | Machine-readable short name. |
| `title` | string | OPTIONAL | Human-readable display name. |
| `description` | string | OPTIONAL | Free-form description of audience and purpose. |
| `applicability` | object | OPTIONAL | Document-level applicability (S7). May be overridden per-Unit. |
| `actors` | array of `Actor` | OPTIONAL | Actor identities used by Units and Tasks (S3). |
| `tasks` | array of `Task` | OPTIONAL | Task identities used by Units (S4). |
| `units` | array of `Unit` | RECOMMENDED | The substantive payload (S5). An Experience with zero Units is structurally valid but trivially uncoverable (S8). |
| `extensions` | object | OPTIONAL | Extension data; keys MUST be prefixed `x-` (S12). |

At least one of `actors`, `tasks`, or `units` SHOULD be populated; a document with none of these is permitted by the schema but carries no semantic payload.

**Inline example:**

```json
{
  "$formspecExperience": "1.0",
  "version": "1.0.0",
  "targetDefinition": {
    "url": "https://example.gov/forms/intake",
    "compatibleVersions": ">=1.0.0 <2.0.0"
  },
  "title": "Intake -- applicant experience",
  "actors": [{ "id": "applicant", "title": "Applicant" }],
  "tasks": [{ "id": "identifyApplicant", "title": "Identify the applicant" }],
  "units": [
    {
      "id": "identity",
      "kind": "data-entry",
      "taskRefs": ["identifyApplicant"],
      "actorRef": "applicant",
      "itemRefs": [
        { "path": "applicantName" },
        { "path": "dateOfBirth" }
      ]
    }
  ]
}
```

## 3. Actors

An **Actor** is a named role that interacts with the form. Actors are declarative identifiers -- Experience does NOT define authorization, authentication, or access control. Those are out of scope.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string (camelCase, unique within `actors[]`) | REQUIRED | Stable identifier. Referenced by `unit.actorRef`. |
| `title` | string | OPTIONAL | Human-readable label. |
| `description` | string | OPTIONAL | Free-form role description. |
| `extensions` | object | OPTIONAL | `x-`-prefixed extension data. |

**Common actors** (informative): `applicant`, `respondent`, `reviewer`, `approver`, `assister`, `agent`, `caseworker`. These are not enumerated by this spec; authors choose identifiers that fit their domain.

Actors are referenced by:

- `unit.actorRef` (S5.1) -- the actor for whom the unit's task is intended.
- `task.actorRefs[]` (S4) -- the actors who participate in a task.
- `applicability.actorRefs[]` (S7) -- actor predicates for applicability resolution.

A processor MUST report an `EXP-REFERENTIAL-INTEGRITY` finding for any `actorRef` not present in `actors[]`. (Schema enforces shape; this rule is referential and enforced by Experience Core processors and validators.)

## 4. Tasks

A **Task** is a named unit of user-visible work that the form supports. Tasks are abstract; they describe what the user is doing, not the steps a Component takes to render that work.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string (camelCase, unique within `tasks[]`) | REQUIRED | Stable identifier. Referenced by `unit.taskRefs[]`. |
| `title` | string | OPTIONAL | Human-readable label. |
| `description` | string | OPTIONAL | Free-form description. |
| `actorRefs` | array of string | OPTIONAL | Actors participating in this task. Each entry MUST resolve to an `actor.id`. |
| `extensions` | object | OPTIONAL | `x-`-prefixed extension data. |

Tasks SHOULD be named in user-domain language (e.g., `identifyHousehold`, `reviewEligibility`, `attestAccuracy`), not in renderer-domain language (`fillFormPage1`, `showSummaryCard`).

A Unit MAY reference zero, one, or many tasks via `unit.taskRefs[]` (S5.1). A Task without any referring Unit is permitted but is informationally inert -- it signals planned work not yet bound to data collection.

A processor MUST report an `EXP-REFERENTIAL-INTEGRITY` finding for any `unit.taskRefs[]` entry not present in `tasks[]`.

## 5. Units

A **Unit** is the substantive payload of an Experience Document. Each Unit groups typed references to Definition items, concepts, and actions under a `kind` and, when applicable, one or more tasks.

### 5.1 Unit Shape

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string (camelCase, unique within `units[]`) | REQUIRED | Stable identifier. Referenced by Component nodes via `unitRef` (forthcoming, concept §10.4). |
| `kind` | string (registry, S5.2) | REQUIRED | Abstract task-oriented classification. |
| `title` | string | OPTIONAL | Human-readable label. |
| `description` | string | OPTIONAL | Free-form description of what the user is doing in this unit. |
| `actorRef` | string | OPTIONAL | The actor this unit is intended for. MUST resolve to an `actor.id`. |
| `taskRefs` | array of string | OPTIONAL | Tasks this unit advances. Each entry MUST resolve to a `task.id`. |
| `itemRefs` | array of `ItemRef` (S6.1) | OPTIONAL | Definition items collected, displayed, or attested in this unit. |
| `conceptRefs` | array of `ConceptRef` (S6.2) | OPTIONAL | Registry / Ontology concepts represented in this unit. |
| `actionRefs` | array of `ActionRef` (S6.3) | OPTIONAL | Response Actions invoked from this unit (forthcoming companion spec). |
| `applicability` | object | OPTIONAL | Per-Unit applicability override (S7). |
| `accessibility` | object | OPTIONAL | Accessibility intent (S5.3). |
| `extensions` | object | OPTIONAL | `x-`-prefixed extension data. |

A Unit with zero `itemRefs`, zero `conceptRefs`, and zero `actionRefs` is permitted but contributes nothing to coverage (S8). Such units are intended for placeholder or planning purposes.

### 5.2 The `unit.kind` Registry

`unit.kind` is a **closed, abstract, task-oriented enum**. The closure is deliberate: per concept note §6.2, units must not become layout containers, and per §9 the spec stops if "units become layout containers or required fields can disappear from generated experiences without detection."

| Value | Meaning |
|-------|---------|
| `data-entry` | The user provides or revises data. |
| `review` | The user reviews previously captured data, typically read-only. |
| `confirmation` | The user affirms accuracy or intent prior to a state transition. |
| `evidence-collection` | The user provides evidence (attachments, attestations, signatures, citations). |
| `attestation` | The user certifies a statement under accountability (signing, oath, affirmation). |
| `error-resolution` | The user resolves a validation finding or correction request. |
| `assistance` | The user receives help or works with an assister or agent. |

These values describe **task intent**. They do not bind the unit to any specific Component layout -- a `data-entry` unit MAY be rendered as a card, a page, a step, a panel, a CLI prompt, or any other Component-domain pattern (concept §7.1).

**Extension:** processors MUST reject `kind` values not in this table. To carry custom semantics, authors MUST use the `extensions` property with an `x-` prefix (S12); they MUST NOT introduce new top-level `kind` values.

### 5.3 Accessibility Intent

A Unit MAY declare accessibility intent that informs (not dictates) generator and renderer choices:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `accessibility.assistive` | boolean | OPTIONAL | Whether the unit is intended to be operable with assistive technology (default: `true`). |
| `accessibility.complexity` | string (`low`, `moderate`, `high`) | OPTIONAL | Estimated cognitive complexity. Informative; processors MAY use this to bias toward simpler widgets or to surface help references. |
| `accessibility.requiresLiteracy` | boolean | OPTIONAL | Whether the unit presumes reading fluency. Informative. |

Accessibility intent does NOT define WCAG conformance, ARIA roles, or any concrete accessibility implementation. Those live in Component / Theme renderer profiles.

## 6. Typed References

Typed references bind a Unit to specific Definition / Registry / Action identities. All references are **by identifier**; Experience does NOT inline the referenced content.

### 6.1 ItemRef

References a Definition item by canonical path.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | string | REQUIRED | Canonical Definition item path using Core FieldRef syntax. For repeat-group children, use the `[*]` wildcard path (e.g., `household.members[*].firstName`). |
| `purpose` | string (`collect`, `display`, `attest`, `cite`) | OPTIONAL | The user-facing purpose for this reference within the unit. Default: `collect` for `data-entry` and `evidence-collection`; `display` for `review` and `confirmation`. |
| `description` | string | OPTIONAL | Optional clarifying note for generators and reviewers. |

The `path` MUST resolve in the loaded Definition using Core Bind path syntax. Resolution semantics for repeat-group items: an `itemRef.path` of `household.members[*].firstName` covers every concrete instance path such as `household.members[0].firstName`. A processor MUST treat that ItemRef as covering all current and future instances of `firstName` within `household.members`.

A processor MUST report a finding for any `ItemRef.path` that does not resolve in the target Definition.

### 6.2 ConceptRef

References a Registry / Ontology concept identifier.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | REQUIRED | Concept identifier (e.g., Registry concept id, ontology IRI). |
| `source` | string (`registry`, `ontology`, `external`) | OPTIONAL | Origin of the concept identifier. Default: `registry`. |
| `description` | string | OPTIONAL | Optional clarifying note. |

ConceptRefs are informative for processors that do not load a Registry or Ontology Document. A Coverage-aware processor that loads a Registry / Ontology MUST report a finding for unresolved `ConceptRef.id`.

### 6.3 ActionRef

References a Response Action identifier (forthcoming companion spec, concept §10.2).

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | REQUIRED | Response Action identifier. |
| `role` | string (`primary`, `secondary`, `escape`) | OPTIONAL | The action's role in this unit. Default: `primary`. |
| `description` | string | OPTIONAL | Optional clarifying note. |

Until the Response Actions companion spec lands, `ActionRef.id` is a free string. Processors MUST NOT reject an Experience because `ActionRef.id` does not resolve -- resolution depends on a sibling spec that does not yet exist. Coverage-aware processors MAY emit an informative finding ("ActionRef target spec not present").

## 7. Applicability

**Applicability** declares the contexts in which an Experience Document or a Unit is intended to apply. It is metadata that informs generation and selection -- it does NOT alter Core processing.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `actorRefs` | array of string | OPTIONAL | Restrict applicability to these actors. Empty / omitted -> all actors. |
| `platforms` | array of string | OPTIONAL | Target platforms (e.g., `web`, `mobile`, `pdf`, `cli`, `voice`, `agent`). Open string set; not normatively enumerated. |
| `locales` | array of string (BCP 47) | OPTIONAL | Locale tags this applies to. |
| `posture` | string | OPTIONAL | Renderer or session posture (e.g., `kiosk`, `assisted`, `respondent-self-serve`). Informative; not enumerated. |
| `channels` | array of string | OPTIONAL | Channels (e.g., `in-person`, `remote`, `phone`, `paper`). |
| `extensions` | object | OPTIONAL | `x-`-prefixed extension data. |

Applicability resolution is **last-write-wins, document-then-unit**: a Unit's `applicability` overrides the document-level `applicability` for that Unit. There is no merge semantics.

A processor selecting an Experience for a given context (actor, platform, locale, posture, channel) SHOULD prefer documents and units whose applicability matches. This spec does NOT define a tie-break algorithm -- that belongs to a profile or selector spec.

Applicability is INFORMATIVE for Core conformance and NORMATIVE for selectors that consume it (out of scope for this document).

## 8. Coverage Expectations

Coverage is the **load-bearing static predicate** that protects against the §9 stop condition of the concept note: *"required fields can disappear from generated experiences without detection."* This section is normative for Coverage-aware processors (S1.4).

### 8.1 The Coverage Predicate

Given a Definition `D` and an Experience `E` whose `targetDefinition.url` matches `D.url`:

Derive the set of target paths from `D.binds`, not from properties embedded on Items. For every top-level Bind `b` in `D.binds` and the Definition field Item `i` resolved by `b.path`, where:

1. `b.required` is the literal FEL expression `true` after trimming whitespace, AND
2. neither `b` nor any Bind that targets an ancestor path of `i` has `relevant` equal to the literal FEL expression `false` after trimming whitespace (a missing `relevant`, the literal `true`, or any non-literal FEL expression all satisfy this), AND
3. `i` is not transitively inside a repeatable group whose `minRepeat` is `0` (such items are *conditionally present* and excluded from static coverage),

there MUST exist at least one `Unit u` in `E.units` and at least one `ItemRef r` in `u.itemRefs` such that `r.path` equals the canonical FieldRef path for `i` under the repeat-group rule in S6.1.

If no such Unit exists, the item is **uncovered**.

### 8.2 Coverage Findings

A Coverage-aware processor MUST emit a finding for every uncovered required visible item. Each finding MUST carry:

| Field | Type | Description |
|-------|------|-------------|
| `code` | string | `EXP-COVERAGE-UNCOVERED-REQUIRED-ITEM` |
| `severity` | string | `warning` for `Experience Coverage-Aware`; processors MAY elevate to `error` per profile. |
| `path` | string | The uncovered Definition item path. |
| `experienceId` | string | The Experience's `name` or document URI for source attribution. |
| `message` | string | Human-readable explanation. |

Coverage findings are **reportable**, not blocking. The additive invariant (S1.3) forbids this spec from blocking validation, submission, or processing of the underlying Response. Coverage findings inform generators and reviewers; they do not invalidate a Response.

### 8.3 What Coverage Does NOT Check

The static predicate is intentionally narrow. It does NOT check:

- Items whose `required` Bind is absent or is any FEL expression other than the literal `true` (conditional requiredness). These are *best-effort* -- processors MAY surface an informative finding but MUST NOT treat them as uncovered.
- Items whose own or ancestor `relevant` Bind is an FEL expression that is not the literal `false`. These are conservatively treated as potentially visible (i.e., they are subject to the predicate when their own `required` Bind is literal `true`).
- Whether the user can actually reach the unit at runtime (that is a renderer / Component / Response Actions concern).
- Whether the unit is well-formed for the user -- `unit.kind`, `taskRefs`, `actorRef`, and accessibility intent are not part of coverage.

Future revisions MAY add a *dynamic coverage* predicate that exercises FEL evaluation against representative posture / Response snapshots. This spec defers that to a profile or a Trace-driven check (concept §10.6).

## 9. Seeding an Experience from a Definition

*This section is informative, not normative.*

Tools MAY seed an Experience Document from a Definition. A reasonable seed strategy:

1. For each top-level Definition item or group, create a `Unit` with `kind: "data-entry"`.
2. For repeat groups, create one Unit per group whose `itemRefs[]` covers the group's children.
3. Place a single `Unit` with `kind: "confirmation"` and zero `itemRefs` at the end (the seeded experience can subsequently be edited to populate confirmation references).
4. Populate `actors` with a single `applicant` actor; assign every Unit `actorRef: "applicant"`.

This is a starting point, not a recommendation. Experience and Definition are **different concepts** (concept §6.2): a Definition group describes data structure (`household.members[*]`); an Experience Unit describes task intent (`identify applicant`). Seeded Experiences SHOULD be edited to reflect actual task structure, not left as 1:1 mirrors of Definition shape.

A seeded Experience that has been edited by a human or generator MUST satisfy the same schema and coverage rules as a hand-authored Experience. Seeding does not create a privileged document class.

## 10. Processing Model

Experience has a minimal processing model. The four-phase Core cycle (Core S2.4) is unaffected.

An **Experience Core** processor MUST:

1. **Load.** Parse the Experience Document as JSON and validate it against the schema in S11.
2. **Resolve target.** Read `targetDefinition.url` and verify it matches the loaded Definition's `url`. If `compatibleVersions` is present, the loaded Definition's `version` MUST satisfy the semver range.
3. **Verify referential integrity.** Every `actorRef`, `task.actorRefs[]`, `applicability.actorRefs[]`, `unit.actorRef`, and `unit.taskRefs[]` MUST resolve within the document. Unresolvable references MUST produce an `EXP-REFERENTIAL-INTEGRITY` finding.
4. **Verify item-ref resolvability.** Every `ItemRef.path` MUST resolve to an Item in the loaded Definition using Core FieldRef path syntax. Unresolvable paths MUST produce an `EXP-ITEM-REF-UNRESOLVED` finding.

An **Experience Coverage-Aware** processor MUST additionally:

5. **Compute coverage.** Apply the predicate in S8.1 over the loaded Definition's top-level `binds[]` and the Experience's `units[].itemRefs[]`.
6. **Emit coverage findings.** For every uncovered required visible item, emit an `EXP-COVERAGE-UNCOVERED-REQUIRED-ITEM` finding (S8.2).

There is no Experience evaluation pipeline. The document is metadata; processors read it, validate it, and consult it for generation, review, and coverage. They do not "evaluate" it in the Core sense.

## 11. Conformance

### 11.1 Conformance Levels

This specification defines two conformance levels as a strict superset:

| Level | Requirements |
|-------|--------------|
| **Experience Core** | Schema-validate, resolve target, verify referential integrity, verify item-ref resolvability. |
| **Experience Coverage-Aware** | All of Core, plus compute and report the coverage predicate (S8). |

#### 11.1.1 Experience Core

A conformant **Experience Core** processor MUST:

1. Parse and validate any Experience Document that conforms to the schema in S11.2 without error.
2. Resolve `targetDefinition.url` against a loaded Definition and verify the URL match.
3. Verify that the loaded Definition's `version` satisfies `targetDefinition.compatibleVersions` if present.
4. Resolve every `actorRef`, `task.actorRefs[]`, `applicability.actorRefs[]`, `unit.actorRef`, and `unit.taskRefs[]` within the document.
5. Resolve every `ItemRef.path` against the loaded Definition using Core FieldRef path syntax.
6. Emit findings (`EXP-REFERENTIAL-INTEGRITY`, `EXP-ITEM-REF-UNRESOLVED`) for unresolved references; processors MUST NOT silently drop unresolved references.

#### 11.1.2 Experience Coverage-Aware

A conformant **Experience Coverage-Aware** processor MUST:

1. Satisfy all Experience Core requirements.
2. Compute the coverage predicate of S8.1 for every loaded (Definition, Experience) pair.
3. Emit an `EXP-COVERAGE-UNCOVERED-REQUIRED-ITEM` finding for every uncovered required visible item.
4. NOT block validation, submission, or any Core operation on the basis of coverage findings. Coverage is reportable, not blocking.

### 11.2 Schema

<!-- schema-ref:start id=experience-top-level schema=schemas/experience.schema.json pointers=# -->
<!-- generated:schema-ref id=experience-top-level -->
| Pointer | Field | Type | Required | Notes | Description |
|---|---|---|---|---|---|
| `#/properties/$formspecExperience` | `$formspecExperience` | <code>string</code> | yes | const: <code>"1.0"</code>; critical | Experience specification version. MUST be '1.0'. |
| `#/properties/actors` | `actors` | <code>array</code> | no | — | — |
| `#/properties/applicability` | `applicability` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/Applicability</code> | — |
| `#/properties/description` | `description` | <code>string</code> | no | — | — |
| `#/properties/extensions` | `extensions` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/Extensions</code> | — |
| `#/properties/name` | `name` | <code>string</code> | no | pattern: <code>^[a-zA-Z][a-zA-Z0-9_\-]*&#36;</code> | — |
| `#/properties/targetDefinition` | `targetDefinition` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/TargetDefinition</code>; critical | Binding to the target Definition document. Same shape as Theme / Component / Locale. |
| `#/properties/tasks` | `tasks` | <code>array</code> | no | — | — |
| `#/properties/title` | `title` | <code>string</code> | no | — | — |
| `#/properties/units` | `units` | <code>array</code> | no | critical | Substantive Experience payload. Each Unit organizes typed item, concept, and action references under abstract task intent. |
| `#/properties/version` | `version` | <code>string</code> | yes | critical | Version of this Experience Document. SemVer is RECOMMENDED. |
<!-- schema-ref:end -->

### 11.3 `$defs` Reference

<!-- schema-ref:start id=experience-defs schema=schemas/experience.schema.json pointers=#/$defs/Actor,#/$defs/Task,#/$defs/Unit,#/$defs/UnitKind,#/$defs/ItemRef,#/$defs/ConceptRef,#/$defs/ActionRef,#/$defs/Applicability,#/$defs/Accessibility,#/$defs/TargetDefinition -->
<!-- generated:schema-ref id=experience-defs -->
| Pointer | Field | Type | Required | Notes | Description |
|---|---|---|---|---|---|
| `#/$defs/Actor/properties/description` | `description` | <code>string</code> | no | — | — |
| `#/$defs/Actor/properties/extensions` | `extensions` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/Extensions</code> | — |
| `#/$defs/Actor/properties/id` | `id` | <code>string</code> | yes | pattern: <code>^[a-zA-Z][a-zA-Z0-9_]*&#36;</code> | Stable identifier for this Actor. Unique within actors[]. |
| `#/$defs/Actor/properties/title` | `title` | <code>string</code> | no | — | — |
| `#/$defs/Task/properties/actorRefs` | `actorRefs` | <code>array</code> | no | — | — |
| `#/$defs/Task/properties/description` | `description` | <code>string</code> | no | — | — |
| `#/$defs/Task/properties/extensions` | `extensions` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/Extensions</code> | — |
| `#/$defs/Task/properties/id` | `id` | <code>string</code> | yes | pattern: <code>^[a-zA-Z][a-zA-Z0-9_]*&#36;</code> | Stable identifier for this Task. Unique within tasks[]. |
| `#/$defs/Task/properties/title` | `title` | <code>string</code> | no | — | — |
| `#/$defs/Unit/properties/accessibility` | `accessibility` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/Accessibility</code> | — |
| `#/$defs/Unit/properties/actionRefs` | `actionRefs` | <code>array</code> | no | — | — |
| `#/$defs/Unit/properties/actorRef` | `actorRef` | <code>string</code> | no | pattern: <code>^[a-zA-Z][a-zA-Z0-9_]*&#36;</code> | Actor this unit is intended for. MUST resolve to actors[].id. |
| `#/$defs/Unit/properties/applicability` | `applicability` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/Applicability</code> | — |
| `#/$defs/Unit/properties/conceptRefs` | `conceptRefs` | <code>array</code> | no | — | — |
| `#/$defs/Unit/properties/description` | `description` | <code>string</code> | no | — | — |
| `#/$defs/Unit/properties/extensions` | `extensions` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/Extensions</code> | — |
| `#/$defs/Unit/properties/id` | `id` | <code>string</code> | yes | pattern: <code>^[a-zA-Z][a-zA-Z0-9_]*&#36;</code> | Stable identifier for this Unit. Unique within units[]. Referenced by Component nodes via unitRef (forthcoming). |
| `#/$defs/Unit/properties/itemRefs` | `itemRefs` | <code>array</code> | no | — | — |
| `#/$defs/Unit/properties/kind` | `kind` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/UnitKind</code> | — |
| `#/$defs/Unit/properties/taskRefs` | `taskRefs` | <code>array</code> | no | — | Tasks this unit advances. Each MUST resolve to tasks[].id. |
| `#/$defs/Unit/properties/title` | `title` | <code>string</code> | no | — | — |
| `#/$defs/UnitKind` | `(self)` | <code>string</code> | — | enum: <code>"data-entry"</code>, <code>"review"</code>, <code>"confirmation"</code>, <code>"evidence-collection"</code>, <code>"attestation"</code>, <code>"error-resolution"</code>, <code>"assistance"</code>; critical | Closed, abstract, task-oriented unit kind. data-entry: user provides or revises data. review: read-only display of captured data. confirmation: user affirms accuracy before a transition. evidence-collection: user supplies evidence (attachments, attestations). attestation: user certifies a statement under accountability. error-resolution: user resolves a validation finding. assistance: user receives help. |
| `#/$defs/ItemRef/properties/description` | `description` | <code>string</code> | no | — | — |
| `#/$defs/ItemRef/properties/extensions` | `extensions` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/Extensions</code> | — |
| `#/$defs/ItemRef/properties/path` | `path` | <code>string</code> | yes | — | Canonical Definition item path using Core FieldRef syntax. For repeat-group children use the [*] wildcard path (e.g., household.members[*].firstName). |
| `#/$defs/ItemRef/properties/purpose` | `purpose` | <code>string</code> | no | enum: <code>"collect"</code>, <code>"display"</code>, <code>"attest"</code>, <code>"cite"</code> | User-facing purpose. Default depends on enclosing unit.kind (S6.1). |
| `#/$defs/ConceptRef/properties/description` | `description` | <code>string</code> | no | — | — |
| `#/$defs/ConceptRef/properties/extensions` | `extensions` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/Extensions</code> | — |
| `#/$defs/ConceptRef/properties/id` | `id` | <code>string</code> | yes | — | Registry / Ontology concept identifier. |
| `#/$defs/ConceptRef/properties/source` | `source` | <code>string</code> | no | enum: <code>"registry"</code>, <code>"ontology"</code>, <code>"external"</code>; default: <code>"registry"</code> | — |
| `#/$defs/ActionRef/properties/description` | `description` | <code>string</code> | no | — | — |
| `#/$defs/ActionRef/properties/extensions` | `extensions` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/Extensions</code> | — |
| `#/$defs/ActionRef/properties/id` | `id` | <code>string</code> | yes | — | Response Action identifier (forthcoming companion spec). |
| `#/$defs/ActionRef/properties/role` | `role` | <code>string</code> | no | enum: <code>"primary"</code>, <code>"secondary"</code>, <code>"escape"</code>; default: <code>"primary"</code> | — |
| `#/$defs/Applicability/properties/actorRefs` | `actorRefs` | <code>array</code> | no | — | — |
| `#/$defs/Applicability/properties/channels` | `channels` | <code>array</code> | no | — | — |
| `#/$defs/Applicability/properties/extensions` | `extensions` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/Extensions</code> | — |
| `#/$defs/Applicability/properties/locales` | `locales` | <code>array</code> | no | — | BCP 47 locale tags. |
| `#/$defs/Applicability/properties/platforms` | `platforms` | <code>array</code> | no | — | Open enum. Common values: web, mobile, pdf, cli, voice, agent. |
| `#/$defs/Applicability/properties/posture` | `posture` | <code>string</code> | no | — | — |
| `#/$defs/Accessibility/properties/assistive` | `assistive` | <code>boolean</code> | no | default: <code>true</code> | — |
| `#/$defs/Accessibility/properties/complexity` | `complexity` | <code>string</code> | no | enum: <code>"low"</code>, <code>"moderate"</code>, <code>"high"</code> | — |
| `#/$defs/Accessibility/properties/extensions` | `extensions` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/Extensions</code> | — |
| `#/$defs/Accessibility/properties/requiresLiteracy` | `requiresLiteracy` | <code>boolean</code> | no | — | — |
| `#/$defs/TargetDefinition` | `(self)` | <code>&#36;ref</code> | — | <code>&#36;ref</code>: <code>https://formspec.org/schemas/common/1.0#/&#36;defs/TargetDefinition</code> | — |
<!-- schema-ref:end -->

### 11.4 Conformance Prohibitions

A conformant processor MUST NOT:

1. Use Experience to alter Core data capture, validation, requiredness, relevance, calculation, or any other Core semantics.
2. Substitute Experience for missing Definition behavior -- Experience is metadata, not a fallback.
3. Block Response submission, draft persistence, or any Core operation on the basis of an Experience finding.
4. Add `unit.kind` values outside the registry in S5.2. Custom semantics belong in `extensions`; they MUST NOT extend or override the closed `kind` registry.

## 12. Extension Points

Experience supports the standard Formspec extension model. Authors MAY add custom data via `x-`-prefixed properties at the document level (`extensions`), and within `Actor`, `Task`, `Unit`, `ItemRef`, `ConceptRef`, `ActionRef`, and `Applicability` objects.

Extensions MUST NOT:

1. Override or alter any property defined by this specification.
2. Introduce a parallel `kind` taxonomy under a different property name.
3. Carry behavior that would block Core operations.

Common extension patterns (informative):

- `x-figmaNode` -- a link to a Figma frame anchoring the unit's design.
- `x-jiraIssue` -- a tracking-system identifier for the work that produced this unit.
- `x-author` -- a structured author identifier for editorial provenance.

## 13. Security Considerations

Experience Documents carry no respondent data, no PII, and no credentials. The primary security considerations are:

- **Untrusted document loading.** Experience Documents loaded from external sources MUST be validated against the schema before any processor consumes them. A maliciously crafted Experience cannot affect Core processing (additive invariant), but it MAY exhaust resources via large `units[]` or `itemRefs[]` arrays. Processors SHOULD impose reasonable size limits.
- **URI resolution.** `targetDefinition.url` and any `conceptRef.id` containing a URL MUST NOT be blindly fetched. Maintain an allowlist of Definition / Registry / Ontology sources.
- **Information disclosure.** Experience metadata MAY reveal data model structure to an attacker (Definition paths, concept identifiers, action identifiers). Treat Experience Documents as sensitive at the same level as the underlying Definition.
- **Extension content.** `x-`-prefixed extension data is untrusted; processors that render extension content (e.g., for review tooling) MUST sanitize it.

There is no prompt-injection surface in this spec -- Experience does not interact with Assist providers directly. Where downstream tools (Trace, Studio regeneration review) consume Experience for LLM-mediated review, those tools own their prompt-injection mitigations.

---

## Appendix A: Full Example -- Grant Application

*Populated in Task 20.*

---

## Appendix B: References

| Tag | Reference |
|---|---|
| [rfc2119] | Bradner, S., "Key words for use in RFCs to Indicate Requirement Levels", BCP 14, RFC 2119, March 1997. |
| [RFC 8174] | Leiba, B., "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words", BCP 14, RFC 8174, May 2017. |
| [RFC 8259] | Bray, T., Ed., "The JavaScript Object Notation (JSON) Data Interchange Format", STD 90, RFC 8259, December 2017. |
| [RFC 3986] | Berners-Lee, T., Fielding, R., and L. Masinter, "Uniform Resource Identifier (URI): Generic Syntax", STD 66, RFC 3986, January 2005. |
| [RFC 6901] | Bryan, P., Ed., Zyp, K., and M. Nottingham, Ed., "JavaScript Object Notation (JSON) Pointer", RFC 6901, April 2013. |
| Concept | Formspec Semantic Layers (Experience / Response Actions / Trace), thoughts/specs/2026-05-20-formspec-semantic-layers.md. |

*End of Formspec Experience Specification.*

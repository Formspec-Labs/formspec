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
- **Unit** -- A grouping of typed references to Definition items, concepts, and actions, organized under a single task and `unit.kind`.
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
4. Add `unit.kind` values outside the registry (S5.2) without using the `x-` extension mechanism (S12).

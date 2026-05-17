---
title: Formspec Screener Specification
version: 1.0.0-draft.1
date: 2026-04-09
status: draft
---

# Formspec Screener Specification v1.0

**Version:** 1.0.0-draft.1
**Date:** 2026-03-31
**Editors:** Formspec Working Group
**Companion to:** Formspec v1.0 — A JSON-Native Declarative Form Standard

---

## Abstract

The Formspec Screener Specification is a companion specification to Formspec v1.0
that defines a standalone JSON document for respondent screening and routing.
A Screener Document — itself a JSON document — declares a set of screening
items, evaluation phases, and routing rules that classify respondents and
direct them to the appropriate target Definitions, external URIs, or
rejection/closure outcomes. The Screener uses FEL (Formspec Expression
Language) for all conditions, score computations, and calculated values.

Unlike other Formspec sidecar documents (Theme, Component, Mapping), a Screener
Document does not bind to a single target Definition. It is a **freestanding
routing instrument** whose relationship to Definitions is expressed entirely
through its route targets. A Screener points outward to its destinations; it
does not belong to any single form.

## Status of This Document

This document is a **draft specification**. It is a companion to the Formspec
v1.0 core specification and does not modify or extend that specification.
Implementors are encouraged to experiment with this specification and provide
feedback, but MUST NOT treat it as stable for production use until a 1.0.0
release is published.

## Conventions and Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD",
"SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this
document are to be interpreted as described in [BCP 14][rfc2119] [RFC 2119]
[RFC 8174] when, and only when, they appear in ALL CAPITALS, as shown here.

JSON syntax and data types are as defined in [RFC 8259]. URI syntax is as
defined in [RFC 3986]. Duration syntax uses the [ISO 8601][iso8601] duration
format.

Terms defined in the Formspec v1.0 core specification — including *Definition*,
*Item*, *Bind*, *FEL*, and *conformant processor* — retain their
core-specification meanings throughout this document unless explicitly redefined.

[rfc2119]: https://www.rfc-editor.org/rfc/rfc2119
[RFC 3986]: https://www.rfc-editor.org/rfc/rfc3986
[RFC 8174]: https://www.rfc-editor.org/rfc/rfc8174
[RFC 8259]: https://www.rfc-editor.org/rfc/rfc8259
[iso8601]: https://www.iso.org/iso-8601-date-and-time-format.html

---

## Bottom Line Up Front

<!-- bluf:start file=screener-spec.bluf.md -->
- This document defines a standalone Screener Document for respondent classification and routing.
- A valid screener requires `$formspecScreener`, `url`, `version`, `title`, `items`, and `evaluation`.
- Screeners are **freestanding** — they do not bind to a target Definition. Route targets express all relationships.
- Evaluation uses an ordered **phase pipeline**. Each phase declares a strategy (`first-match`, `fan-out`, `score-threshold`, or an extension strategy).
- **Override routes** fire unconditionally across all phases — they are a safety mechanism, not a strategy.
- The screener produces a **Determination Record** — a structured output capturing matched routes, eliminated routes, scores, inputs, and evaluation rationale.
- Lifecycle primitives: `availability` (calendar window), `resultValidity` (duration), `evaluationBinding` (version pinning).
- Items and binds use the same schemas as Definition items/binds but are evaluated in an isolated scope.
- Screener items are NOT part of any form's instance data — they exist only for routing purposes.
- **Answer states**: each item response is one of `answered`, `declined`, or `not-presented`. These are preserved in the Determination Record.
<!-- bluf:end -->

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Screener Document Structure](#2-screener-document-structure)
3. [Items and Binds](#3-items-and-binds)
4. [Evaluation Pipeline](#4-evaluation-pipeline)
5. [Normative Strategies](#5-normative-strategies)
6. [Override Routes](#6-override-routes)
7. [Route Targets](#7-route-targets)
8. [Determination Record](#8-determination-record)
9. [Lifecycle](#9-lifecycle)
10. [Processing Model](#10-processing-model)
11. [Conformance](#11-conformance)
12. [Extension Points](#12-extension-points)
13. [Examples](#13-examples)
14. [Security Considerations](#14-security-considerations)

---

## 1. Introduction

### 1.1 Purpose and Scope

The Formspec Core Specification defines **what** data to collect (Items, §4.2),
**how** it behaves (Binds, §4.3), and the **validation** constraints that
govern it (Shapes, §5). It includes a minimal screening mechanism (§4.7) that
supports first-match routing from a `screener` property embedded in a
Definition.

This specification replaces that embedded mechanism with a **standalone Screener
Document** — a separate JSON file that defines respondent classification and
routing as an independent concern. A Screener Document:

- Is a freestanding document with its own URL and version.
- Contains items and binds evaluated in an isolated scope.
- Defines an ordered evaluation pipeline with pluggable strategies.
- Supports first-match, fan-out, and score-threshold routing as normative strategies.
- Supports unconditional override routes for safety-critical classifications.
- Produces a structured Determination Record as its primary output.
- Declares lifecycle properties: availability windows, result validity, and version pinning.

Multiple Screener Documents MAY route to the same Definition. A single Screener
Document MAY route to multiple Definitions. This enables reusable screening
instruments that are decoupled from any individual form.

### 1.2 Scope

This specification defines:

- The JSON schema for **Screener Documents** — standalone JSON documents that
  declare screening items, evaluation phases, and routing rules.
- **Evaluation strategies** — normative algorithms for processing routes
  (first-match, fan-out, score-threshold) and the extension point for
  custom strategies.
- **Override routes** — safety-critical routes that fire unconditionally
  regardless of evaluation strategy.
- **The Determination Record** — the structured output artifact produced by
  screener evaluation.
- **Lifecycle primitives** — availability windows, result validity durations,
  and evaluation version binding.
- **Answer states** — the three-state model for item responses (`answered`,
  `declined`, `not-presented`).

This specification does **not** define:

- Transport protocols, authentication, or access control.
- Session management, save-and-resume, or cross-channel recovery.
- Identity matching, deduplication, or re-screening linkage.
- Rendering, layout, or visual presentation of screener items.
- The Formspec core specification itself (form structure, validation,
  processing model, FEL grammar). Those are defined in Formspec v1.0 and
  incorporated by reference.
- Execution scheduling, workflow orchestration, or multi-actor handoff.

### 1.3 Relationship to Formspec Core

The Formspec Screener Specification is a **companion specification** to
Formspec v1.0. It is neither an extension nor a superseding revision. The two
specifications are independent in the following sense:

- A conformant Formspec Core processor is **NOT REQUIRED** to implement the
  Screener Specification. A Core or Extended processor that does not support
  this specification remains fully conformant with Formspec v1.0.
- A conformant Screener processor **MUST** understand the Formspec Item schema
  (§4.2 of the core specification), the Formspec Bind schema (§4.3 of the
  core specification), and **MUST** implement the Formspec Expression Language
  (§3 of the core specification), since FEL is the computation substrate for
  all conditions, score expressions, and calculated values in a Screener.

The relationship to §4.7 of the core specification is one of replacement. The
embedded `screener` property defined in §4.7 is a single-strategy
(first-match) routing mechanism scoped to a single Definition. This
specification generalizes that mechanism into a standalone document with
multiple evaluation strategies, lifecycle management, and structured output.
In formal terms:

> Every valid §4.7 `screener` object is expressible as a Screener Document
> with a single evaluation phase using the `first-match` strategy. A
> conformant Screener processor SHOULD be able to interpret a §4.7 `screener`
> as a degenerate Screener Document without modification.

### 1.4 Terminology

The following terms are defined for use throughout this specification:

- **Screener Document** — A JSON document conforming to this specification
  that declares screening items, evaluation phases, and routing rules. A
  Screener Document is the primary artifact defined by this specification.

- **Evaluation Phase** — A single stage in the evaluation pipeline, consisting
  of a strategy and a set of routes. Phases execute in declaration order.

- **Strategy** — An algorithm that determines how routes within a phase are
  evaluated. Normative strategies are `first-match`, `fan-out`, and
  `score-threshold`. Extension strategies use the `x-` prefix.

- **Route** — A single routing rule within a phase, consisting of a condition
  (or score expression), a target, and metadata. Routes are the atomic unit
  of the evaluation pipeline.

- **Override Route** — A route marked with `"override": true` that fires
  unconditionally when its condition is met, regardless of the phase's
  strategy. Override routes are evaluated before all phases.

- **Determination Record** — The structured output artifact produced by
  evaluating a Screener Document against a set of respondent inputs. Contains
  matched routes, eliminated routes, scores, inputs, answer states, and
  evaluation metadata.

- **Answer State** — The disposition of a screener item response: `answered`
  (a value was provided), `declined` (the respondent was presented with the
  item and explicitly declined to answer), or `not-presented` (the item was
  not shown, e.g., due to relevance logic).

- **Result Validity** — The duration for which a Determination Record remains
  valid before re-screening is required.

- **Availability Window** — The calendar period during which the Screener
  accepts new respondents.

### 1.5 Notational Conventions

JSON examples use `//` comments for annotation; comments are not valid JSON.
Property names in monospace (`strategy`) refer to JSON keys. Section
references (§N) refer to this document unless prefixed with "core" (e.g.,
"core §4.2").

---

## 2. Screener Document Structure

A Formspec Screener is a JSON object.

**Conformance Rule (SC-13):** Conforming implementations MUST recognize the
following top-level properties and MUST reject any Screener that omits a
REQUIRED property.

```json
{
  "$formspecScreener": "1.0",
  "url": "urn:example:grants-eligibility-screener",
  "version": "2.1.0",
  "title": "Federal Grants Eligibility Screener",
  "description": "Determines applicant eligibility and routes to the appropriate grant form.",
  "availability": {
    "from": "2026-10-01",
    "until": "2026-12-31"
  },
  "resultValidity": "P90D",
  "evaluationBinding": "submission",
  "items": [],
  "binds": [],
  "evaluation": [],
  "extensions": {}
}
```

### 2.1 Top-Level Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `$formspecScreener` | string | **Yes** | Screener specification version. MUST be `"1.0"`. |
| `url` | string (URI) | **Yes** | Canonical, stable URI identifying this screener. MUST be globally unique. Used for linking, versioning, and referencing. |
| `version` | string (semver) | **Yes** | Semantic version of this Screener Document, following [semver 2.0.0][semver]. Independent of any Definition version. |
| `title` | string | **Yes** | Human-readable name for the screener. |
| `description` | string | No | Purpose description for the screener. |
| `availability` | object | No | Calendar window during which the screener accepts respondents. See §9.1. |
| `resultValidity` | string (ISO 8601 duration) | No | How long a completed Determination Record remains valid. Omit for no expiration. See §9.2. |
| `evaluationBinding` | string | No | `"submission"` (default) or `"completion"`. Determines whether the evaluation rules at the time the screening session began or at the time of final completion govern. See §9.3. |
| `items` | array of Item | **Yes** | Screening items. Uses the standard Formspec Item schema (core §4.2). MAY be empty during authoring. |
| `binds` | array of Bind | No | Bind declarations scoped to screener items. Uses the standard Bind schema (core §4.3). Paths reference screener item keys. |
| `evaluation` | array of Phase | **Yes** | Ordered evaluation pipeline. See §4. MAY be empty during authoring. |
| `extensions` | object | No | Extension declarations. Uses the same extension mechanism as Definition (core §4.6). |

[semver]: https://semver.org/spec/v2.0.0.html

### 2.2 Identification

A Screener Document is uniquely identified by the combination of `url` and
`version`. Two Screener Documents with the same `url` and different `version`
values represent different versions of the same screening instrument.

The `url` property serves the same role as `url` on a Definition: it is a
stable, opaque identifier. It does not need to be a resolvable HTTP URL; URN
syntax (e.g., `urn:example:grants-screener`) is acceptable.

### 2.3 No Target Binding

Unlike Theme, Component, and Mapping documents, a Screener Document does **not**
have a `targetDefinition` or `definitionRef` property. The Screener's
relationship to Definitions is expressed entirely through route targets (§7).

This design reflects the Screener's architectural role: it is a **gateway to**
Definitions, not a **projection of** a Definition. A Theme cannot exist
meaningfully without its host Definition. A Screener exists independently and
routes outward — potentially to multiple Definitions, external URIs, or
non-Formspec destinations.

The association between a Screener and the form(s) it gates is a **project-level
concern**, not a document-level one. Authoring tools manage which Screener is
loaded with which Definitions in their project model.

---

## 3. Items and Binds

### 3.1 Screener Items

Screener items use the same Item schema defined in Formspec Core §4.2. All
item types (`field`, `group`, `content`) are valid in a Screener. All data
types are valid. Repeatable groups are supported.

**Screener items are NOT part of any form's instance data.** They exist solely
for routing classification. A respondent's answers to screener items feed
into evaluation phase conditions and score expressions but are never included
in a Definition's Response.

**Conformance Rule (SC-14):** Screener item keys MUST be unique within the
Screener Document. They occupy their own key namespace — a screener item key
MAY collide with a Definition item key without conflict, because they are
evaluated in separate scopes.

### 3.2 Screener Binds

Screener binds use the same Bind schema defined in Formspec Core §4.3. All
bind properties are supported: `required`, `relevant`, `readonly`,
`constraint`, `constraintMessage`, and `calculate`.

Screener binds are evaluated in the **screener's own scope**. They reference
screener item keys, not Definition item keys. Screener binds do NOT interact
with any Definition's binds. This isolation is absolute — a screener bind
expression cannot reference a Definition item, and a Definition bind
expression cannot reference a screener item.

### 3.3 Answer States

Each screener item response has an **answer state** that processors MUST track:

| State | Meaning |
|-------|---------|
| `answered` | The respondent provided a value for this item. The value MAY be any valid value for the item's data type, including empty string. |
| `declined` | The item was presented to the respondent and the respondent explicitly declined to answer. This is semantically distinct from a null value. |
| `not-presented` | The item was not shown to the respondent, typically because a `relevant` bind evaluated to `false`. |

**Conformance Rule (SC-01):** Processors MUST preserve answer states in the
Determination Record (§8). The three states MUST be distinguishable. A
`declined` state MUST NOT be treated as equivalent to a null value or an
`answered` state with a null value.

**Conformance Rule (SC-02):** Conditions and score expressions that reference
a `declined` item MUST evaluate the item's value as `null`. The scoring or
routing implication of a declined answer is the responsibility of the
expression author, not the processor. The `declined` state is a metadata
annotation preserved for audit purposes; it does not alter FEL evaluation
semantics.

**Conformance Rule (SC-03):** Conditions and score expressions that reference
a `not-presented` item MUST evaluate the item's value as `null`.

### 3.4 FEL in Screener Context

FEL expressions in screener binds, route conditions, and score expressions
have access to:

- Screener item values via `$key` path references (same syntax as core §3).
- Screener bind calculated values.
- All standard FEL functions and operators.

FEL expressions in a Screener do NOT have access to:

- Definition item values.
- Definition bind values.
- Definition shape results.
- Any external state not explicitly provided through the screener's own items.

### 3.5 Null Propagation in Conditions and Scores

FEL null propagation (core §3.4) means that expressions referencing
`declined` or `not-presented` items — whose values are `null` per SC-02
and SC-03 — may evaluate to `null` rather than a boolean or numeric result.

**Conformance Rule (SC-11):** A route `condition` that evaluates to `null`
MUST be treated as `false`. The route does not match and is added to the
eliminated set.

**Conformance Rule (SC-12):** A route `score` expression that evaluates to
`null` MUST be treated as negative infinity — the route is eliminated with
reason `"null-score"`. A null score can never meet any finite threshold.

---

## 4. Evaluation Pipeline

The evaluation pipeline is an ordered array of **phases**. Each phase
declares an evaluation strategy and a set of routes. The pipeline executes
as follows:

1. **Override routes** (§6) are evaluated first, before any phase. If any
   override route's condition evaluates to `true`, the route is added to
   the Determination Record's matched set. Override evaluation does not
   short-circuit — all override routes are checked, and all that match are
   included. Override matches do not prevent phase evaluation from
   proceeding, unless the override route's `terminal` flag is `true` (§6.2).
2. **Phases** execute in declaration order. Each phase evaluates its routes
   according to its declared strategy.
3. The results from all phases (and any override matches) are aggregated into
   the Determination Record.

### 4.1 Phase Structure

```json
{
  "evaluation": [
    {
      "id": "eligibility",
      "label": "Eligibility Check",
      "strategy": "fan-out",
      "routes": [
        {
          "condition": "$org_type = 'nonprofit'",
          "target": "urn:grants:nonprofit-track",
          "label": "Nonprofit Track"
        },
        {
          "condition": "$annual_revenue < 5000000",
          "target": "urn:grants:small-org-track",
          "label": "Small Organization Track"
        }
      ]
    },
    {
      "id": "form-selection",
      "label": "Form Selection",
      "strategy": "score-threshold",
      "routes": [
        {
          "score": "moneyAmount($award_amount) / 1000000",
          "threshold": 0,
          "target": "https://grants.gov/forms/sf-425-short|1.0.0",
          "label": "SF-425 Short Form"
        },
        {
          "score": "moneyAmount($award_amount) / 1000000",
          "threshold": 0.25,
          "target": "https://grants.gov/forms/sf-425|2.1.0",
          "label": "SF-425 Full Form"
        }
      ]
    }
  ]
}
```

### 4.2 Phase Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | **Yes** | Unique identifier for this phase within the Screener. **SC-15:** MUST match `[a-zA-Z][a-zA-Z0-9_-]*`. |
| `label` | string | No | Human-readable name for this phase. |
| `description` | string | No | Description of this phase's purpose. |
| `strategy` | string | **Yes** | Evaluation strategy. Normative values: `"first-match"`, `"fan-out"`, `"score-threshold"`. **SC-16:** Extension strategies MUST use the `x-` prefix (e.g., `"x-constraint-satisfaction"`). |
| `routes` | array of Route | **Yes** | Routes to evaluate using this phase's strategy. |
| `activeWhen` | string (FEL -> boolean) | No | When present, the phase is evaluated only when this expression evaluates to `true`. When absent, the phase always evaluates. |
| `config` | object | No | Strategy-specific configuration. See §5 for normative strategy configuration. Extension strategies define their own `config` schemas. |

### 4.3 Route Properties (Common)

All routes, regardless of strategy, share these common properties:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `condition` | string (FEL -> boolean) | Conditional | Boolean FEL expression. Required for `first-match` and `fan-out` strategies. Not used by `score-threshold`. |
| `score` | string (FEL -> number) | Conditional | Numeric FEL expression. Required for `score-threshold` strategy. Not used by `first-match` or `fan-out`. |
| `target` | string (URI) | **Yes** | Route destination. See §7. |
| `label` | string | No | Human-readable route description. |
| `message` | string | No | Human-readable message to display to the respondent when this route matches. MAY contain `{{expression}}` interpolation sequences where `expression` is a FEL expression evaluated against screener item values. Literal `{{` is escaped as `\{{`. **SC-17:** Processors that do not support interpolation MUST display the raw string. |
| `metadata` | object | No | Arbitrary key-value metadata attached to the route. Preserved in the Determination Record. Useful for classification codes, severity levels, or domain-specific annotations. |
| `override` | boolean | No | When `true`, this route is an override route (§6). Override routes are hoisted out of their phase and evaluated before all phases. Default: `false`. |

### 4.4 Phase Execution Semantics

When a phase is evaluated:

1. If `activeWhen` is present and evaluates to `false`, the phase is skipped
   entirely. No routes are evaluated. The phase appears in the Determination
   Record with status `skipped`.
2. Otherwise, the phase's `strategy` determines how routes are evaluated.
   See §5 for the semantics of each normative strategy.
3. The phase's results (matched routes, eliminated routes, scores) are added
   to the Determination Record.

Phases are independent. A matched route in phase 1 does not prevent phase 2
from executing, and a phase that produces no matches does not halt the
pipeline. The Determination Record aggregates results from all phases.

**Exception:** A `terminal` override route (§6.2) halts the entire pipeline
when it matches.

---

## 5. Normative Strategies

### 5.1 `first-match`

The `first-match` strategy evaluates routes in declaration order and selects
the **first** route whose `condition` evaluates to `true`. Evaluation stops
after the first match.

**Conformance Rule (SC-08):** Each route in a `first-match` phase MUST have
a `condition` property. Processors MUST reject a Screener Document where a
`first-match` route lacks `condition`.

**Behavior:**

1. For each route in declaration order:
   a. Evaluate `condition` against the current screener item values.
   b. If `true`, add this route to the phase's matched set and stop.
   c. If `false`, continue to the next route.
2. If no route matches, the phase produces an empty matched set.

**Use cases:** Simple routing decisions, fallback chains, gate/pass
decisions. A route with `"condition": "true"` at the end of the list acts
as a default/fallback.

**Configuration:** No additional `config` properties.

This strategy is equivalent to the routing semantics defined in Formspec Core
§4.7.

### 5.2 `fan-out`

The `fan-out` strategy evaluates **all** routes and returns **every** route
whose `condition` evaluates to `true`. Evaluation does not stop at the first
match.

**Conformance Rule (SC-09):** Each route in a `fan-out` phase MUST have a
`condition` property. Processors MUST reject a Screener Document where a
`fan-out` route lacks `condition`.

**Behavior:**

1. For each route in declaration order:
   a. Evaluate `condition` against the current screener item values.
   b. If `true`, add this route to the phase's matched set.
   c. If `false`, add this route to the phase's eliminated set with reason
      `"condition-false"`.
2. All routes are evaluated regardless of prior matches.

**Use cases:** Benefit eligibility mapping (show all programs a respondent
qualifies for), multi-product pre-qualification, multi-track routing where
a respondent may match several concurrent destinations.

**Configuration:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `config.minMatches` | integer | 0 | Minimum number of routes that must match for the phase to be considered successful. If fewer routes match, the phase produces a `"below-minimum"` warning in the Determination Record. |
| `config.maxMatches` | integer | (unlimited) | Maximum number of matched routes to include. If more routes match, only the first N (in declaration order) are included; the rest are added to the eliminated set with reason `"max-exceeded"`. |

### 5.3 `score-threshold`

The `score-threshold` strategy evaluates a numeric score expression on each
route, compares it against a threshold, and returns routes that meet their
thresholds, ranked by score.

**Conformance Rule (SC-10):** Each route in a `score-threshold` phase MUST
have a `score` property and a `threshold` property. Processors MUST reject a
Screener Document where a `score-threshold` route lacks either.

**Additional route properties for `score-threshold`:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `score` | string (FEL -> number) | **Yes** | Numeric FEL expression evaluated against screener item values. |
| `threshold` | number | **Yes** | Minimum score required for this route to match. The route matches if `score >= threshold`. |

**Behavior:**

1. For each route in declaration order:
   a. Evaluate `score` against the current screener item values.
   b. If the computed score >= `threshold`, add this route to the phase's
      matched set with the computed score.
   c. If the computed score < `threshold`, add this route to the phase's
      eliminated set with reason `"below-threshold"` and the computed score.
2. All routes are evaluated regardless of prior matches.
3. The matched set is sorted by score descending. Ties are broken by
   declaration order.

**Use cases:** Vulnerability indices, placement scoring, risk assessment,
loan pre-qualification, weighted eligibility ranking.

**Configuration:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `config.topN` | integer | (unlimited) | Return only the top N scoring routes. |
| `config.normalize` | boolean | `false` | When `true`, scores are normalized to a 0.0–1.0 range (dividing each score by the maximum score across all routes in the phase) before threshold comparison and ranking. When the maximum score is zero, all normalized scores are zero. |

---

## 6. Override Routes

### 6.1 Purpose

Override routes exist for **safety-critical** classifications that must fire
regardless of which evaluation phase is executing or what strategy is in use.
They are the "crisis triage" / "hard exclusion" / "sanctions list" mechanism.

Any route in any phase MAY be marked with `"override": true`. When the
Screener Document is loaded, all override routes are **hoisted** out of their
declared phases and collected into a virtual override set.

### 6.2 Override Evaluation

**Conformance Rule (SC-18):** Override routes are evaluated **before** the phase pipeline begins. Override routes MUST be evaluated in the order they appear across all phases, and all override routes MUST be checked regardless of prior matches:

1. For each override route (in the order they appear across all phases):
   a. Evaluate `condition` against the current screener item values.
   b. If `true`, add this route to the Determination Record's override
      matched set.
2. All override routes are checked regardless of prior matches.

**The `terminal` flag:** An override route MAY include `"terminal": true`.
Terminal semantics operate in two stages:

1. **All override routes are evaluated first.** There is no short-circuit
   within override evaluation — every override route is checked regardless
   of whether earlier overrides matched or were terminal. Multiple terminal
   overrides MAY match simultaneously.
2. **After all overrides have been evaluated**, if ANY matched override has
   `terminal: true`, the phase pipeline is halted — no phases execute. The
   Determination Record's `overrides.halted` property is `true`, and the
   `phases` array is empty. The Determination Record contains all matched
   override routes (both terminal and non-terminal).

This two-stage design ensures that all safety-critical classifications are
captured even when multiple exclusion criteria apply. It is appropriate for
hard stops: sanctions screening, immediate safety diversions, absolute
disqualifications.

Non-terminal overrides are informational — they are included in the
Determination Record alongside phase results but do not prevent phase
evaluation.

### 6.3 Override Route Properties

**Conformance Rule (SC-25):** Override routes MUST have a `condition`
property. Processors MUST reject a Screener Document where an override
route lacks `condition`.

Override routes use the same properties as regular routes (§4.3), plus:

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `override` | boolean | `false` | MUST be `true` for override routes. |
| `terminal` | boolean | `false` | When `true`, matching this override halts all further evaluation. Ignored when `override` is `false`. |

---

## 7. Route Targets

### 7.1 Target Syntax

The `target` property on a route is a URI string. Targets fall into three
categories:

| Category | Format | Example | Description |
|----------|--------|---------|-------------|
| **Formspec Definition** | `url\|version` | `"https://grants.gov/forms/sf-425\|2.1.0"` | Routes to a specific version of a Formspec Definition. Uses the same canonical reference syntax as core §4.7. |
| **External URI** | Any valid URI | `"https://agency.gov/applications-closed"` | Routes to an external resource. The Screener does not interpret the URI; it is passed through to the consuming application. |
| **Named outcome** | `outcome:name` | `"outcome:ineligible"` | Routes to a named outcome defined by the consuming application. See §7.2. |

### 7.2 Named Outcomes

Named outcomes use the `outcome:` URI scheme to reference application-defined
dispositions that are not Formspec Definitions. Common named outcomes:

| Outcome | Meaning |
|---------|---------|
| `outcome:ineligible` | The respondent is not eligible. The application SHOULD display a rejection message. |
| `outcome:closed` | The screener is closed (outside availability window). The application SHOULD display a closure message. |
| `outcome:review` | The respondent requires manual review before proceeding. |
| `outcome:referral` | The respondent should be referred to an external resource. |

Named outcomes are **not an enumeration** — applications MAY define custom
outcome names. The `outcome:` prefix is a convention that signals "this is
not a Definition URI." **Conformance Rule (SC-19):** Conforming processors
MUST pass named outcomes through to the consuming application without
interpretation.

### 7.3 Formspec Definition References

When a route target uses the `url|version` syntax, the consuming application
is responsible for resolving the referenced Definition. The Screener
processor produces the reference; it does not load or validate the target
Definition.

A route MAY use a bare URL without a version (e.g., `"https://grants.gov/forms/sf-425"`),
in which case the consuming application SHOULD resolve to the latest
compatible version.

---

## 8. Determination Record

The Determination Record is the primary output artifact of screener evaluation.
It is a structured JSON object that captures the complete evaluation result.

> **Schema note:** The Determination Record has its own standalone schema file
> (`schemas/determination.schema.json`, `$id`:
> `https://formspec.org/schemas/determination/1.0`). The Screener Document
> schema (`schemas/screener.schema.json`) defines the screener input document;
> the Determination schema defines the evaluation output document. They are
> separate artifacts validated independently.

### 8.1 Structure

```json
{
  "$formspecDetermination": "1.0",
  "screener": {
    "url": "urn:example:grants-eligibility-screener",
    "version": "2.1.0"
  },
  "timestamp": "2026-10-15T14:30:00Z",
  "evaluationVersion": "2.1.0",
  "status": "completed",
  "overrides": {
    "matched": [],
    "halted": false
  },
  "phases": [
    {
      "id": "eligibility",
      "status": "evaluated",
      "strategy": "fan-out",
      "matched": [
        {
          "target": "urn:grants:nonprofit-track",
          "label": "Nonprofit Track",
          "metadata": {}
        }
      ],
      "eliminated": [
        {
          "target": "urn:grants:small-org-track",
          "label": "Small Organization Track",
          "reason": "condition-false"
        }
      ]
    },
    {
      "id": "form-selection",
      "status": "evaluated",
      "strategy": "score-threshold",
      "matched": [
        {
          "target": "https://grants.gov/forms/sf-425-short|1.0.0",
          "label": "SF-425 Short Form",
          "score": 0.15,
          "message": "Based on your award amount, the short form is appropriate."
        }
      ],
      "eliminated": [
        {
          "target": "https://grants.gov/forms/sf-425|2.1.0",
          "label": "SF-425 Full Form",
          "score": 0.15,
          "reason": "below-threshold"
        }
      ]
    }
  ],
  "inputs": {
    "org_type": { "value": "nonprofit", "state": "answered" },
    "annual_revenue": { "value": 3200000, "state": "answered" },
    "award_amount": { "value": 150000, "state": "answered" },
    "prior_grants": { "value": null, "state": "declined" },
    "officers[0].name": { "value": "Jane Smith", "state": "answered" },
    "officers[0].title": { "value": "CEO", "state": "answered" },
    "officers[1].name": { "value": "John Doe", "state": "answered" },
    "officers[1].title": { "value": null, "state": "not-presented" }
  },
  "validity": {
    "validUntil": "2027-01-13T14:30:00Z",
    "resultValidity": "P90D"
  }
}
```

### 8.2 Determination Record Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `$formspecDetermination` | string | **Yes** | Record marker. MUST be `"1.0"`. |
| `screener` | object | **Yes** | Reference to the screener that produced this record: `{ url, version }`. |
| `timestamp` | string (ISO 8601 datetime) | **Yes** | When the evaluation completed. |
| `evaluationVersion` | string (semver) | **Yes** | The version of the Screener Document's evaluation logic that was applied. This MAY differ from `screener.version` when `evaluationBinding` is `"submission"` and the screener was updated between submission and completion. |
| `status` | string | **Yes** | `"completed"` (all items answered, evaluation finished), `"partial"` (not all items answered), `"expired"` (result validity exceeded post-evaluation), or `"unavailable"` (screener was outside its availability window, no evaluation performed). |
| `overrides` | object | **Yes** | Override evaluation results. |
| `overrides.matched` | array of RouteResult | **Yes** | Override routes that fired. |
| `overrides.halted` | boolean | **Yes** | `true` if a terminal override halted the pipeline. |
| `phases` | array of PhaseResult | **Yes** | Per-phase evaluation results. Empty array if overrides halted the pipeline. |
| `inputs` | object | **Yes** | Map of item path to `{ value, state }` for every screener item. Keys use the same path syntax as core §4.3.3, including indexed repeat paths (e.g., `group[0].field`). For non-repeating items, the key is the item's `key`. For items inside repeatable groups, the key is the full indexed path. `state` is one of `"answered"`, `"declined"`, `"not-presented"`. |
| `validity` | object | No | Present when `resultValidity` is declared on the Screener. Contains `validUntil` (ISO 8601 datetime) and `resultValidity` (the original duration). |

### 8.3 Phase Result Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Phase identifier (matches `evaluation[].id`). |
| `status` | string | `"evaluated"`, `"skipped"` (when `activeWhen` was false), or `"unsupported-strategy"` (processor does not support the phase's strategy, see §11.2). |
| `strategy` | string | The strategy used. |
| `matched` | array of RouteResult | Routes that matched. |
| `eliminated` | array of RouteResult | Routes that did not match, with `reason`. |
| `warnings` | array of string | Phase-level warnings (e.g., `"below-minimum"` when fan-out matches fewer than `config.minMatches`). Empty array when no warnings. |

### 8.4 Route Result Properties

| Property | Type | Description |
|----------|------|-------------|
| `target` | string (URI) | The route's target. |
| `label` | string | The route's label (if declared). |
| `message` | string | The route's respondent-facing message (if declared). Preserved so consuming applications can display it without re-reading the Screener Document. |
| `score` | number | The computed score (for `score-threshold` routes only). |
| `reason` | string | Why the route was eliminated: `"condition-false"`, `"below-threshold"`, `"max-exceeded"`, `"null-score"`. Present only in eliminated routes. `"null-score"` indicates the score expression evaluated to `null` (§3.5, SC-12). |
| `metadata` | object | The route's metadata (if declared). |

### 8.5 Determination Record as Extension Point

The Determination Record defined in §8.1–8.4 is the **normative minimum**.
Extensions MAY add additional properties to the Determination Record for
domain-specific needs:

- Operator identity and credentials.
- Digital signatures or attestation.
- Per-field audit timestamps.
- Intermediate calculation breakdowns.
- Linked prior determination references (`supersedes`).
- Consent records.

**Conformance Rule (SC-20):** Extensions MUST use the `extensions` property
on the Determination Record (following the same pattern as Definition
extensions) and MUST NOT modify the normative properties defined above.

---

## 9. Lifecycle

### 9.1 Availability Window

The `availability` property declares the calendar period during which the
screener accepts new respondents.

```json
{
  "availability": {
    "from": "2026-10-01",
    "until": "2026-12-31"
  }
}
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `availability.from` | string (ISO 8601 date) | No | The earliest date (inclusive) on which the screener accepts respondents. If omitted, the screener has no start constraint. |
| `availability.until` | string (ISO 8601 date) | No | The latest date (inclusive) on which the screener accepts respondents. If omitted, the screener has no end constraint. |

**Conformance Rule (SC-04):** When an availability window is declared,
processors MUST NOT begin a new screening session outside the window.
Processors SHOULD route respondents who arrive outside the window to the
`outcome:closed` named outcome.

When `availability` is declared, the evaluation timestamp passed to the
processor MUST be a valid ISO 8601 date or RFC 3339 datetime. If the timestamp
is missing or not parseable, the processor MUST NOT evaluate routes and SHOULD
produce a Determination Record with status `"unavailable"` (same as an
out-of-window arrival).

When the evaluation timestamp is a full RFC 3339 datetime, processors MUST
compare availability using the **calendar date in that timestamp's stated
offset** (the date component before the offset), not the UTC calendar date of
the same instant.

**Conformance Rule (SC-05):** A screening session that was started within
the availability window MUST be allowed to complete even if the window closes
during the session. The `evaluationBinding` property (§9.3) determines which
version of the evaluation rules governs.

### 9.2 Result Validity

The `resultValidity` property declares how long a completed Determination
Record remains valid.

```json
{
  "resultValidity": "P90D"
}
```

The value is an [ISO 8601 duration][iso8601]. Common values:

| Duration | Meaning |
|----------|---------|
| `P14D` | 14 days (e.g., clinical lab windows) |
| `P90D` | 90 days (e.g., loan pre-qualification) |
| `P1Y` | 1 year (e.g., annual compliance re-screening) |

**Conformance Rule (SC-21):** When `resultValidity` is declared, the
Determination Record MUST include a `validity` object with a computed
`validUntil` timestamp (§8.2).

**Conformance Rule (SC-06):** Processors MUST NOT treat an expired
Determination Record as valid. A consuming application that encounters an
expired record SHOULD prompt for re-screening.

When `resultValidity` is omitted, the Determination Record has no expiration
and remains valid indefinitely.

### 9.3 Evaluation Binding

The `evaluationBinding` property determines which version of the screener's
evaluation logic governs when the screener is updated between the start and
completion of a session.

| Value | Behavior |
|-------|----------|
| `"submission"` (default) | The evaluation rules in effect when the respondent first began the screening session govern. If the screener is updated mid-session, the respondent completes under the original rules. |
| `"completion"` | The evaluation rules in effect when the respondent completes the screening govern. If the screener is updated mid-session, the respondent is evaluated under the new rules. |

**Conformance Rule (SC-07):** The Determination Record's `evaluationVersion`
property MUST reflect the actual version of the evaluation rules that were
applied, regardless of the `evaluationBinding` setting.

For stateless processors that evaluate all item values in a single request
without managing a multi-step session, `evaluationBinding` is not applicable.
Such processors SHOULD use the Screener Document version available at
evaluation time and record that version in the Determination Record's
`evaluationVersion` property.

---

## 10. Processing Model

### 10.1 Evaluation Order

A conforming processor evaluates a Screener Document as follows:

1. **Availability check.** If the screener declares an `availability` window
   and the evaluation timestamp is missing, not parseable, or its calendar date
   is outside that window, the processor MUST NOT begin evaluation (per SC-04).
   The processor SHOULD produce a Determination Record with status `"unavailable"`.
   (A single override match targeting `outcome:closed` is optional for hosts that
   surface closure UX from overrides.)

2. **Item collection.** The processor presents screener items to the
   respondent and collects values. Binds are evaluated in the screener's
   isolated scope (§3.2). Items may be presented in any order; the
   specification does not prescribe presentation sequence.

3. **Answer state recording.** For each item, the processor records the
   answer state: `answered`, `declined`, or `not-presented` (§3.3).

4. **Override evaluation.** All override routes (§6) are evaluated against
   the collected values. If any terminal override matches, the pipeline
   halts.

5. **Phase evaluation.** If the pipeline was not halted, each phase is
   evaluated in declaration order according to its strategy (§5). Phases
   with an `activeWhen` expression that evaluates to `false` are skipped.

6. **Determination Record assembly.** The processor assembles the
   Determination Record (§8) from override results, phase results, inputs
   with answer states, and validity information.

### 10.2 Partial Evaluation

A processor MAY produce a Determination Record with status `"partial"` when
not all screener items have been answered. Partial records:

- Include whatever override and phase results can be computed from the
  available data.
- Mark unanswered items as `not-presented` in the inputs section.
- **SC-22:** MUST NOT be treated as definitive routing decisions by consuming
  applications.

Partial evaluation enables save-and-resume workflows and progressive
disclosure screeners where later items depend on earlier answers.

### 10.3 Re-screening

The specification does not define re-screening mechanics (identity matching,
session linkage, or deduplication). However, Determination Records MAY be
linked via the `extensions` mechanism:

```json
{
  "extensions": {
    "x-rescreening": {
      "supersedes": "urn:determination:abc-123",
      "reason": "updated-income"
    }
  }
}
```

The semantics of linked records are defined by the extension, not by this
specification.

---

## 11. Conformance

### 11.1 Conformance Levels

This specification defines two conformance levels:

| Level | Requirements |
|-------|-------------|
| **Core** | MUST support `first-match` strategy. MUST produce a valid Determination Record. MUST respect availability windows and result validity. MUST track answer states. |
| **Complete** | MUST support all normative strategies (`first-match`, `fan-out`, `score-threshold`). MUST support override routes including `terminal` semantics. MUST support `activeWhen` on phases. MUST support all Determination Record properties. |

A processor at the **Core** level MAY reject Screener Documents that use
`fan-out` or `score-threshold` strategies. It MUST clearly report the
rejection rather than silently degrading behavior.

### 11.2 Extension Conformance

**Conformance Rule (SC-23):** A processor that encounters an extension
strategy (prefixed with `x-`) it does not support MUST skip the phase and
record it in the Determination Record with status `"unsupported-strategy"`.
It MUST NOT fail the entire evaluation.

---

## 12. Extension Points

### 12.1 Custom Strategies

Extension strategies use the `x-` prefix convention:

```json
{
  "strategy": "x-constraint-satisfaction",
  "config": {
    "dimensions": ["level-of-care", "payer", "program"],
    "intersectionMode": "all-dimensions"
  },
  "routes": [ ... ]
}
```

The `config` object on the phase carries strategy-specific configuration.
Normative strategies define their own `config` schemas (§5). Extension
strategies define their own.

**Conformance Rule (SC-24):** Extension strategies MUST follow the same
route evaluation contract as normative strategies: they receive routes, they
produce matched/eliminated sets with optional scores and reasons, and those
results are recorded in the Determination Record.

### 12.2 Document Extensions

The top-level `extensions` property follows the same mechanism as Definition
extensions (core §4.6). Extensions MAY add domain-specific metadata,
additional lifecycle properties, or screener-level configuration.

### 12.3 Route Extensions

Individual routes MAY carry extensions in their `metadata` property.
The `metadata` object is opaque to the processor — it is preserved in the
Determination Record without interpretation.

Screener routes use `metadata` rather than the `extensions` mechanism used
by Definition routes. Route metadata is opaque operational data —
classification codes, severity tags, domain annotations — preserved in the
Determination Record without interpretation. It does not follow the `x-`
prefix convention because it serves a different purpose: output annotation
rather than behavioral extension. Applications that need route-level
behavioral extensions SHOULD use the phase or document `extensions` property
instead.

### 12.4 Determination Record Extensions

The Determination Record MAY include an `extensions` property for
domain-specific output data (§8.5).

---

## 13. Examples

### 13.1 Simple Grant Eligibility (first-match)

A direct translation of Formspec Core §4.7's embedded screener into the
standalone document format:

```json
{
  "$formspecScreener": "1.0",
  "url": "urn:grants:sf-425-screener",
  "version": "1.0.0",
  "title": "SF-425 Form Selection Screener",
  "items": [
    {
      "key": "award_amount",
      "type": "field",
      "dataType": "money",
      "label": "Total federal award amount"
    }
  ],
  "binds": [
    { "path": "award_amount", "required": "true" }
  ],
  "evaluation": [
    {
      "id": "form-selection",
      "strategy": "first-match",
      "routes": [
        {
          "condition": "moneyAmount($award_amount) < 250000",
          "target": "https://grants.gov/forms/sf-425-short|1.0.0",
          "label": "SF-425 Short Form"
        },
        {
          "condition": "true",
          "target": "https://grants.gov/forms/sf-425|2.1.0",
          "label": "SF-425 Full Form"
        }
      ]
    }
  ]
}
```

### 13.2 Multi-Benefit Eligibility (fan-out)

A benefit navigator screener that evaluates all programs simultaneously.
Note: `fpl()` is a domain-specific FEL extension function (not part of
standard FEL) that computes the Federal Poverty Level threshold for a
given percentage and household size.

```json
{
  "$formspecScreener": "1.0",
  "url": "urn:caa:benefit-eligibility-screener",
  "version": "3.0.0",
  "title": "Benefits Eligibility Screener",
  "description": "Evaluates household eligibility across all assistance programs.",
  "resultValidity": "P90D",
  "items": [
    {
      "key": "household_size",
      "type": "field",
      "dataType": "integer",
      "label": "Total household size"
    },
    {
      "key": "annual_income",
      "type": "field",
      "dataType": "money",
      "label": "Total annual household income"
    },
    {
      "key": "has_children_under_5",
      "type": "field",
      "dataType": "boolean",
      "label": "Does your household include children under age 5?"
    },
    {
      "key": "pays_utilities",
      "type": "field",
      "dataType": "boolean",
      "label": "Are you directly responsible for home energy costs?"
    }
  ],
  "binds": [
    { "path": "household_size", "required": "true" },
    { "path": "annual_income", "required": "true" }
  ],
  "evaluation": [
    {
      "id": "program-eligibility",
      "strategy": "fan-out",
      "routes": [
        {
          "condition": "moneyAmount($annual_income) < fpl(130, $household_size)",
          "target": "urn:benefits:snap-application",
          "label": "SNAP (Food Stamps)",
          "message": "Your household likely qualifies for SNAP benefits."
        },
        {
          "condition": "moneyAmount($annual_income) < fpl(150, $household_size) and $pays_utilities",
          "target": "urn:benefits:liheap-application",
          "label": "LIHEAP (Energy Assistance)",
          "message": "You may qualify for energy assistance."
        },
        {
          "condition": "moneyAmount($annual_income) < fpl(185, $household_size) and $has_children_under_5",
          "target": "urn:benefits:wic-application",
          "label": "WIC",
          "message": "Your household may qualify for WIC benefits."
        }
      ]
    }
  ]
}
```

### 13.3 Clinical Trial with Overrides and Scoring

A clinical trial pre-screening with hard exclusions (overrides) and a
tiered eligibility score:

```json
{
  "$formspecScreener": "1.0",
  "url": "urn:trials:breast-cancer-phase3-screener",
  "version": "2.0.0",
  "title": "Phase III Breast Cancer Trial Pre-Screening",
  "resultValidity": "P28D",
  "evaluationBinding": "submission",
  "items": [
    {
      "key": "cancer_stage",
      "type": "field",
      "dataType": "string",
      "label": "Cancer stage at diagnosis"
    },
    {
      "key": "pregnant",
      "type": "field",
      "dataType": "boolean",
      "label": "Currently pregnant?"
    },
    {
      "key": "neutrophil_count",
      "type": "field",
      "dataType": "decimal",
      "label": "Absolute neutrophil count (10^9/L)"
    },
    {
      "key": "ecog_status",
      "type": "field",
      "dataType": "integer",
      "label": "ECOG performance status (0-5)"
    },
    {
      "key": "prior_treatments",
      "type": "field",
      "dataType": "integer",
      "label": "Number of prior treatment lines"
    }
  ],
  "binds": [
    { "path": "cancer_stage", "required": "true" },
    { "path": "pregnant", "required": "true" },
    { "path": "neutrophil_count", "required": "true" },
    { "path": "ecog_status", "required": "true", "constraint": "$ecog_status >= 0 and $ecog_status <= 5" }
  ],
  "evaluation": [
    {
      "id": "hard-exclusions",
      "strategy": "fan-out",
      "routes": [
        {
          "override": true,
          "terminal": true,
          "condition": "$pregnant",
          "target": "outcome:ineligible",
          "label": "Excluded: Pregnancy",
          "message": "Pregnant individuals are not eligible for this trial."
        },
        {
          "override": true,
          "terminal": true,
          "condition": "$cancer_stage = 'IV'",
          "target": "outcome:ineligible",
          "label": "Excluded: Stage IV",
          "message": "Stage IV cancer is excluded from this trial protocol."
        }
      ]
    },
    {
      "id": "eligibility-scoring",
      "strategy": "score-threshold",
      "routes": [
        {
          "score": "if($neutrophil_count >= 2.5, 3, if($neutrophil_count >= 2.0, 1, 0)) + if($ecog_status <= 1, 3, if($ecog_status <= 2, 1, 0)) + if($prior_treatments <= 2, 2, 0)",
          "threshold": 6,
          "target": "urn:trials:bct-phase3-enrollment|2.0.0",
          "label": "Eligible — Proceed to Enrollment"
        },
        {
          "score": "if($neutrophil_count >= 2.5, 3, if($neutrophil_count >= 2.0, 1, 0)) + if($ecog_status <= 1, 3, if($ecog_status <= 2, 1, 0)) + if($prior_treatments <= 2, 2, 0)",
          "threshold": 3,
          "target": "outcome:review",
          "label": "Borderline — PI Review Required",
          "message": "Some criteria are borderline. A principal investigator will review your eligibility."
        },
        {
          "score": "if($neutrophil_count >= 2.5, 3, if($neutrophil_count >= 2.0, 1, 0)) + if($ecog_status <= 1, 3, if($ecog_status <= 2, 1, 0)) + if($prior_treatments <= 2, 2, 0)",
          "threshold": 0,
          "target": "outcome:ineligible",
          "label": "Not Eligible",
          "message": "Based on your responses, you do not meet the eligibility criteria for this trial."
        }
      ]
    }
  ]
}
```

### 13.4 Multi-Phase Behavioral Health Intake

A behavioral health screener with crisis override, level-of-care scoring,
and program matching:

```json
{
  "$formspecScreener": "1.0",
  "url": "urn:cmhc:behavioral-health-intake",
  "version": "4.1.0",
  "title": "Behavioral Health Intake Screener",
  "description": "Crisis triage, level of care determination, and program matching.",
  "items": [
    {
      "key": "suicidal_ideation",
      "type": "field",
      "dataType": "string",
      "label": "In the past month, have you had thoughts of killing yourself?"
    },
    {
      "key": "si_plan",
      "type": "field",
      "dataType": "boolean",
      "label": "Do you have a plan?"
    },
    {
      "key": "locus_score",
      "type": "field",
      "dataType": "integer",
      "label": "LOCUS composite score"
    },
    {
      "key": "primary_concern",
      "type": "field",
      "dataType": "string",
      "label": "Primary presenting concern"
    },
    {
      "key": "payer_type",
      "type": "field",
      "dataType": "string",
      "label": "Insurance/payer type"
    },
    {
      "key": "age",
      "type": "field",
      "dataType": "integer",
      "label": "Age"
    }
  ],
  "evaluation": [
    {
      "id": "crisis-triage",
      "strategy": "first-match",
      "routes": [
        {
          "override": true,
          "terminal": true,
          "condition": "$suicidal_ideation = 'active' and $si_plan",
          "target": "outcome:crisis-protocol",
          "label": "CRISIS: Active SI with Plan",
          "message": "Immediate crisis intervention required."
        }
      ]
    },
    {
      "id": "level-of-care",
      "strategy": "score-threshold",
      "routes": [
        {
          "score": "$locus_score",
          "threshold": 20,
          "target": "urn:cmhc:residential",
          "label": "Residential Treatment"
        },
        {
          "score": "$locus_score",
          "threshold": 15,
          "target": "urn:cmhc:php",
          "label": "Partial Hospitalization"
        },
        {
          "score": "$locus_score",
          "threshold": 10,
          "target": "urn:cmhc:iop",
          "label": "Intensive Outpatient"
        },
        {
          "score": "$locus_score",
          "threshold": 0,
          "target": "urn:cmhc:outpatient",
          "label": "Standard Outpatient"
        }
      ]
    },
    {
      "id": "program-matching",
      "strategy": "fan-out",
      "routes": [
        {
          "condition": "$primary_concern = 'substance-use' or $primary_concern = 'co-occurring'",
          "target": "urn:cmhc:substance-use-program",
          "label": "Substance Use Program"
        },
        {
          "condition": "$primary_concern = 'co-occurring'",
          "target": "urn:cmhc:co-occurring-program",
          "label": "Co-Occurring Disorders Program"
        },
        {
          "condition": "$primary_concern = 'first-episode-psychosis' and $age >= 18 and $age <= 25",
          "target": "urn:cmhc:fep-program",
          "label": "First Episode Psychosis Program"
        },
        {
          "condition": "$primary_concern = 'trauma'",
          "target": "urn:cmhc:trauma-program",
          "label": "Trauma-Focused Program"
        },
        {
          "condition": "$age < 18",
          "target": "urn:cmhc:child-adolescent-program",
          "label": "Child & Adolescent Program"
        }
      ]
    }
  ]
}
```

This screener demonstrates three phases working together: a terminal crisis
override, a LOCUS-based level-of-care score, and a fan-out program match.
The Determination Record would contain results from all three, enabling the
intake specialist to see the full clinical picture.

---

## 14. Security Considerations

### 14.1 Sensitive Data

Screener items frequently collect sensitive personal information (health
status, income, immigration status, criminal history). Implementations
SHOULD:

- Encrypt screener responses and Determination Records at rest and in
  transit.
- Apply access controls appropriate to the sensitivity of the screening
  domain.
- Support data retention policies that comply with applicable regulations
  (HIPAA, FERPA, GDPR, etc.).
- Ensure that `declined` answer states are stored securely and cannot be
  inferred from surrounding data.

### 14.2 Evaluation Logic Confidentiality

Some screening domains require that the evaluation logic itself be
confidential (e.g., clinical trial blinding, fraud detection thresholds,
sanctions screening criteria). Implementations MAY support:

- Server-side-only evaluation where the respondent never receives the
  Screener Document.
- Redacted Determination Records where score computations and elimination
  reasons are omitted from respondent-facing copies.
- Separation of the evaluation pipeline from the item presentation,
  allowing a "headless" API mode where an external system submits values
  and receives a Determination Record without access to the screener
  structure.

### 14.3 Override Route Safety

Override routes with `"terminal": true` are safety-critical. Implementations
SHOULD:

- Audit all changes to terminal override routes.
- Prevent accidental deletion or reordering of terminal overrides.
- Ensure terminal overrides cannot be bypassed by client-side manipulation
  when evaluation is performed server-side.

---

## Appendix A: Migration from Core §4.7

Implementations that currently support the embedded `screener` property
defined in Formspec Core §4.7 can migrate to standalone Screener Documents
mechanically:

1. Extract the `screener` object from the Definition.
2. Create a new Screener Document with `$formspecScreener`, `url`, `version`,
   and `title`.
3. Move `screener.items` to the document's `items`.
4. Move `screener.binds` to the document's `binds`.
5. Wrap `screener.routes` in a single evaluation phase with
   `"strategy": "first-match"`.
6. Remove the `screener` property from the Definition.

The resulting Screener Document is semantically equivalent to the original
embedded screener.

Implementations SHOULD update their core spec §4.7 references to point to
this companion specification. The embedded `definition.screener` mechanism
is deprecated in favor of standalone Screener Documents.

## Appendix B: Relationship to Sidecar Documents

| Document | Binding | Direction | Role |
|----------|---------|-----------|------|
| Theme | `targetDefinition` | Inward (presents a Definition) | Projection |
| Component | `targetDefinition` | Inward (renders a Definition) | Projection |
| Mapping | `definitionRef` | Inward (transforms a Definition's data) | Projection |
| **Screener** | **(none)** | **Outward (routes to Definitions)** | **Gateway** |

The Screener is the only sidecar document that does not bind to a host
Definition. This reflects its fundamentally different architectural role:
it is a gateway, not a projection.

## Appendix C: Implementation Migration Inventory

This appendix catalogs every file, type, handler, test, schema, and code path
in the Formspec repository that references or implements the embedded
`definition.screener` mechanism (Core §4.7). Each entry specifies the file,
what it currently does, and what must change to support the standalone Screener
Document model defined by this specification.

### C.1 Schema Changes

**C.1.1 `schemas/definition.schema.json` — Remove embedded screener**

Three `$defs` must be removed or deprecated, and one root property deleted:

| Location | What exists | Action |
|----------|-------------|--------|
| Root `properties.screener` | `"$ref": "#/$defs/Screener"` property on the Definition root | **Remove** the `screener` property entirely. |
| `$defs/Screener` | Object type with `items`, `routes`, `binds`, `extensions`. Required: `items`, `routes`. | **Remove** this `$def`. |
| `$defs/Route` | Object type with `condition`, `target`, `label`, `message`. Required: `condition`, `target`. | **Remove** this `$def`. Superseded by the Route definition in `schemas/screener.schema.json` which adds `score`, `threshold`, `override`, `terminal`, and `metadata`. |

After removal, run `npm run docs:generate` and `npm run docs:check` to
cascade the schema change through BLUF injections, `*.llm.md` files, and
cross-spec contract checks.

**C.1.2 `crates/formspec-lint/schemas/definition.schema.json` — Synced copy**

The linter crate embeds a copy of the definition schema. This MUST be updated
in lockstep with the canonical schema.

**C.1.3 New schemas (already created)**

- `schemas/screener.schema.json` — Screener Document input schema (`$formspecScreener`).
- `schemas/determination.schema.json` — Determination Record output schema (`$formspecDetermination`).

These need to be:

1. Copied into `crates/formspec-lint/schemas/` for Rust-side validation.
2. Registered in `crates/formspec-lint/src/schema_validation.rs` for document type
   detection (`DocumentType` enum, `MARKER_FIELDS` constant).
3. Registered in `crates/formspec-core/src/schema_validator.rs` for the WASM
   document validator (`DocumentType` enum needs `Screener` and `Determination`
   variants).
4. Added to `formspec-types` codegen for screener and determination TypeScript
   interfaces.
5. `CROSS_REF_SCHEMAS` in `schema_validation.rs` must include
   `definition.schema.json` because `screener.schema.json` uses absolute URI
   `$ref` to borrow `Item`, `Bind`, and `FELExpression` from the definition
   schema.

**C.1.4 `schemas/core-commands.schema.json` — Screener command shapes**

Defines command schemas for `definition.addRoute`, `definition.setRouteProperty`,
`definition.deleteRoute`, `definition.reorderRoute`, and other screener
handlers. These command definitions must be updated or replaced with new
`screener.*` command schemas.

**C.1.5 `packages/formspec-types/src/generated/index.ts` — Barrel re-export**

Line 10 explicitly re-exports `Screener` and `Route` by name from
`./definition.js`. Must be updated when those types are removed from the
generated definition types.

---

### C.2 Core Spec Changes

**`specs/core/spec.md` — §4.7**

Replace normative content with a deprecation forward-reference:

> **§4.7 Screener (Deprecated)**
>
> The `screener` property on a Definition is deprecated. New implementations
> SHOULD use the standalone Screener Document defined in the Formspec Screener
> Specification (companion document). The embedded `screener` property was a
> single-strategy (first-match) routing mechanism scoped to a single
> Definition. The Screener Specification generalizes it into a standalone
> document with multiple evaluation strategies, lifecycle management, override
> routes, and structured Determination Records as output.
>
> Conforming processors MAY continue to accept Definitions containing a
> `screener` property for backwards compatibility. When encountered, the
> embedded screener SHOULD be treated as equivalent to a standalone Screener
> Document with a single `first-match` evaluation phase. See Screener
> Specification Appendix A for the mechanical migration.

---

### C.3 TypeScript Engine Changes

**C.3.1 `packages/formspec-engine/src/interfaces.ts`**

`IFormEngine.evaluateScreener(answers)` evaluates the embedded
`definition.screener.routes` using first-match semantics and returns
`{ target, label, extensions } | null`.

Action: Deprecate. Add a new method or standalone function for evaluating a
Screener Document that returns a `DeterminationRecord`.

**C.3.2 `packages/formspec-engine/src/engine/FormEngine.ts`**

`evaluateScreener()` calls `wasmEvaluateScreener(this.definition, answers)`.

Action: Deprecate. A standalone screener does not belong to any single engine
instance. Note: the `IFormEngine` return type is missing `message?: string`
that `wasmEvaluateScreener` actually returns — a pre-existing type gap to fix
during migration.

**C.3.3 `packages/formspec-engine/src/wasm-bridge-runtime.ts`**

`wasmEvaluateScreener(definition, answers)` serializes definition + answers,
calls WASM `evaluateScreener`, deserializes the route result.

Action: Add `wasmEvaluateScreenerDocument(screenerDoc, answers)` returning a
full `DeterminationRecord`. Keep existing function for backwards compatibility.

**C.3.4 `packages/formspec-types/src/generated/definition.ts`**

Auto-generated types: `FormDefinition.screener?: Screener`, `interface Screener`,
`interface Route`.

Action: Re-run codegen after schema changes. These types will be removed. New
types for `ScreenerDocument`, `EvaluationPhase`, `ScreenerRoute`, and
`DeterminationRecord` will be generated from the new schemas.

**C.3.5 `packages/formspec-types/src/index.ts`**

Hand-written augmentations: `FormScreener` (relaxes route tuples for authoring),
`FormDefinition` override with `screener: FormScreener`.

Action: Remove `FormScreener` and `screener` from `FormDefinition` augmentation.
Add `FormScreenerDocument` with authoring-friendly relaxations.

---

### C.4 TypeScript Core/Handler Changes

**C.4.1 `packages/formspec-core/src/handlers/definition-screener.ts` (entire file)**

Contains 10 command handlers for the embedded screener: `definition.setScreener`,
`definition.addScreenerItem`, `definition.deleteScreenerItem`,
`definition.setScreenerBind`, `definition.addRoute`,
`definition.setRouteProperty`, `definition.deleteRoute`,
`definition.setScreenerItemProperty`, `definition.reorderScreenerItem`,
`definition.reorderRoute`.

Action: All 10 handlers need new equivalents operating on a standalone Screener
Document in project state. Command prefix changes from `definition.*` to
`screener.*`. New handlers needed for: phase CRUD, phase strategy configuration,
override/terminal management, route score/threshold/metadata, lifecycle
properties, and document-level properties.

**C.4.2 `packages/formspec-core/src/handlers/index.ts`**

Imports and spreads `definitionScreenerHandlers` into the handler registry.

Action: Replace with new `screenerHandlers` import from a new `screener.ts`
handler file.

**C.4.3 `packages/formspec-core/src/queries/statistics.ts`**

Reads `def.screener` to compute `screenerFieldCount` and `screenerRouteCount`.

Action: Read from the project's standalone screener document (`state.screener`).
Extend statistics to include phase count, override route count, and strategy types.

**C.4.4 `packages/formspec-core/src/queries/dependency-graph.ts`**

`fieldDependents` scans `def.screener?.routes` for FEL references and populates
`result.screenerRoutes` with indices.

Action: Scan standalone screener document evaluation phases. Return type changes
to `Array<{ phaseId: string; routeIndex: number }>` since routes are now nested
inside phases.

**C.4.5 `packages/formspec-core/src/handlers/definition-items.ts`**

`rewriteAllPathReferences` rewrites FEL references in `state.definition.screener?.routes`
when an item path changes.

Action: Since the screener is a separate document with its own item scope, this
coupling should be removed. Screener route conditions reference screener item
paths, not definition field paths.

**C.4.6 `packages/formspec-core/src/handlers/definition-instances.ts`**

Similar path rewriting for screener routes during instance rename.

Action: Remove this coupling for the same reason as C.4.5.

**C.4.7 `packages/formspec-core/src/types.ts`**

- `ProjectStatistics`: `screenerFieldCount`, `screenerRouteCount`
- `FieldDependents`: `screenerRoutes: number[]`
- `Change.target`: includes `'screener'`

Action: Retain but source from standalone screener. Add `screenerPhaseCount`.
Update `FieldDependents.screenerRoutes` type. `Change.target: 'screener'`
remains valid.

---

### C.5 TypeScript Studio-Core Changes

**C.5.1 `packages/formspec-studio-core/src/project.ts` — Screener helpers**

The `Project` class contains 9 public screener helpers and 2 private validators:
`setScreener`, `addScreenField`, `removeScreenField`, `updateScreenField`,
`reorderScreenField`, `addScreenRoute`, `updateScreenRoute`,
`reorderScreenRoute`, `removeScreenRoute`, `_validateScreenerItemKey`,
`_validateRouteIndex`.

Action: Rewrite all helpers to dispatch to new `screener.*` handlers. Additional
helpers needed: `createScreenerDocument` / `deleteScreenerDocument`,
`addEvaluationPhase` / `removeEvaluationPhase` / `reorderPhase`,
`setPhaseStrategy`, `addPhaseRoute` / `removePhaseRoute`, `setRouteOverride`,
`setScreenerLifecycle`.

**C.5.2 `packages/formspec-studio-core/src/project.ts` — removeItem cleanup**

`removeItem` deletes screener routes referencing a removed field via
`depSet.screenerRoutes`.

Action: Remove this cleanup block. Definition fields and screener items are
separate scopes — definition field deletion should NOT cascade to screener
route deletion.

---

### C.6 TypeScript Studio UI Changes

**C.6.1 Screener authoring components (`packages/formspec-studio/src/workspaces/editor/screener/`)**

| File | Action |
|------|--------|
| `types.ts` | Rewrite: Route gains `score`, `threshold`, `override`, `terminal`, `metadata`. Add `EvaluationPhase` type. |
| `ScreenerRoutes.tsx` | Major rewrite: routes nested inside phases. Phase-level organizer with per-phase route lists. Fallback relevant only for first-match. |
| `RouteCard.tsx` | Extend: add `score`, `threshold`, `override`, `terminal`, `metadata` fields. |
| `QuestionCard.tsx` | Minor: reads from standalone screener state. |
| `FallbackRoute.tsx` | Scope to first-match phases only. |
| `ScreenerQuestions.tsx` | Moderate rewrite: reads from standalone screener state. |
| `ScreenerToggle.tsx` | Rewrite: creates/destroys standalone screener document instead of toggling `definition.screener`. |

**C.6.2 Orchestrator and host components**

- `ScreenerAuthoring.tsx` — rewrite to read from standalone screener document.
  Add phase management section.
- `ManageView.tsx` — update import. Consider whether screener belongs in definition
  editor or a separate workspace.
- `ScreenerSummary.tsx` — read from standalone screener. Show phase count and strategies.
- `Shell.tsx` — update sidebar badge count to read from standalone screener.
- `Blueprint.tsx` — `SECTIONS` array (line 35) counts `definition.screener`
  items + routes. Update to read from standalone screener document.
- Any studio preview surface that still reads `definition.screener` inline —
  update to the standalone screener document.

**C.6.3 Preview**

`FormspecPreviewHost.tsx` — listens to `formspec-screener-route` and
`formspec-screener-state-change` custom events (observer-only, no authoring
logic). Needs to understand standalone screener documents. May need a separate
screener preview mode that shows the Determination Record.

---

### C.7 Rust Crate Changes

**C.7.1 `crates/formspec-eval/src/screener.rs` (entire file)**

Contains `ScreenerRouteResult` struct and `evaluate_screener(definition, answers)`
which reads `definition["screener"]["routes"]` and evaluates first-match.

Action: **Major rewrite.** New types: `ScreenerDocument`, `EvaluationPhase`,
`ScreenerRoute`, `DeterminationRecord`, `PhaseResult`, `RouteResult`. New
evaluation function: `evaluate_screener_document(doc, answers)` implementing
the full pipeline (override hoisting → override evaluation → per-phase strategy
dispatch). Strategy implementations: `evaluate_first_match`, `evaluate_fan_out`,
`evaluate_score_threshold`. Keep existing function for backwards compatibility.

**C.7.2 `crates/formspec-eval/src/eval_json.rs`**

`screener_route_to_json_value` serializes a single route match.

Action: Add `determination_record_to_json_value` for the full record.

**C.7.3 `crates/formspec-wasm/src/evaluate.rs`**

WASM binding: `evaluateScreener(definition_json, answers_json)`.

Action: Add `evaluateScreenerDocument(screener_json, answers_json)` returning
DeterminationRecord JSON.

**C.7.4 `crates/formspec-py/src/document.rs`**

Python binding: `evaluate_screener_py(definition, answers)`.

Action: Add `evaluate_screener_document_py(screener_doc, answers)`. Deprecate
existing function.

**C.7.6 `crates/formspec-lint/src/expressions.rs`**

`walk_screener` (private fn) parses FEL expressions in
`document["screener"]["routes"][].condition` and `document["screener"]["binds"]`.
Four screener-specific test functions at lines 470, 494, 732, and 807.

Action: Add `walk_screener_document` for standalone format. Expression paths
change from `$.screener.routes[N].condition` to
`$.evaluation[N].routes[M].condition` plus phase-level `activeWhen` and
route `score` expressions.

**C.7.6a `crates/formspec-lint/src/lib.rs`**

Two integration-level lint tests: `screener_integration_spans_passes` and
`extension_resolution_cross_pass_integration` (uses screener fixture data).
Must be updated for standalone screener document format.

**C.7.6b `crates/formspec-core/src/changelog.rs`**

`ChangeTarget::Screener` variant and `diff_screener` function.

Action: Handle two cases: (1) embedded `screener` removal as a breaking
Definition change, (2) new `diff_screener_document` for standalone documents.

**C.7.7 `crates/formspec-core/src/json_artifacts.rs`**

`change_target_str` match arm serializes `ChangeTarget::Screener => "screener"`.
Must be updated if the target is renamed or restructured.

**C.7.8 `crates/formspec-core/tests/changelog_test.rs`**

Three integration tests: `screener_add_is_compatible`, `screener_remove_is_breaking`,
`screener_modified_is_compatible`. Must be updated to test standalone document
changelog diffing.

**C.7.9 `crates/formspec-wasm/src/wasm_tests.rs`**

Native WASM test validates `"screener"` as a valid changelog target string.
Must be updated if `ChangeTarget::Screener` is renamed.

---

### C.8 Python Changes

**C.8.1 `src/formspec/_rust.py`**

Wraps `evaluate_screener_py` as `evaluate_screener(definition, answers)`.

Action: Add `evaluate_screener_document(screener_doc, answers)`. Deprecate
existing function.

**C.8.2 `tests/unit/test_screener_routing.py`**

2 tests for embedded screener evaluation through the Python bridge
(`test_evaluate_screener_returns_first_matching_route_in_declaration_order`,
`test_screener_answers_are_not_written_into_main_form_data`).

Action: Retain as backwards-compatibility tests. Add new test file
`tests/unit/test_screener_document.py` covering: single first-match phase,
multi-phase evaluation, score-threshold, override routes, activeWhen,
DeterminationRecord structure, answer states.

**C.8.3 `tests/conformance/`**

- `test_cross_spec_contracts.py` — class `TestDefinitionScreener` (line 473):
  remove `'screener'` from Definition optional fields and expected property
  keys. Add standalone screener schema validation tests.
- `test_definition_schema.py` — class `TestScreener` (line 420, not
  `TestDefinitionScreener`): remove. Add `TestScreenerDocumentSchema`.

**C.8.4 Additional Python test files with screener references**

| File | What it does | Action |
|------|-------------|--------|
| `tests/unit/test_changelog.py` | `TestScreenerMigration` class with `test_screener_added` and `test_screener_removed_is_breaking` | Update for standalone document changelog |
| `tests/unit/test_rust_bridge.py` | Asserts `evaluate_screener_py` in Rust bridge symbol list | Add new symbol; retain old |
| `tests/integration/fixtures/test_core_fixtures.py` | `"screener"` in allowed definition property list | Remove from list |
| `tests/e2e/headless/test_edge_case_payloads.py` | Loads `fixture-microgrant-screener.json` | Update fixture to standalone |
| `tests/conformance/fuzzing/test_property_based.py` | `gen_screener` Hypothesis strategy | Remove screener from definition generators |

---

### C.9 Webcomponent and React Changes

**C.9.1 `packages/formspec-webcomponent/src/rendering/screener.ts` (entire file)**

Contains `renderScreener`, `hasActiveScreener`, `extractScreenerSeedFromData`,
`omitScreenerKeysFromData`, and helpers. All read from `definition.screener`.

Action: Accept standalone Screener Document. Consider whether a separate
`<formspec-screener>` custom element is more appropriate given the gateway
architecture. At minimum, `renderScreener` reads items, binds, and evaluation
config from the standalone document and calls `evaluateScreenerDocument`.

**C.9.2 `packages/formspec-webcomponent/src/element.ts`**

Deep screener integration: `_screenerCompleted`, `_screenerRoute`,
`classifyScreenerRoute`, `getScreenerState`, `skipScreener`, `restartScreener`,
render logic switching between screener UI and main form.

Action: Support a `screenerDocument` property. Render flow: if standalone
screener is set and not completed, render screener UI. DeterminationRecord
replaces the simple `{ target, label }` result.

**C.9.3 `packages/formspec-webcomponent/src/hydrate-response-data.ts`**

Screener-aware skip logic: silently skips paths with no writable signal (i.e.,
screener field keys in response data). Comment at line 6 documents this
behavior. May become unnecessary if screener data no longer mixes with
definition response data.

**C.9.4 `packages/formspec-webcomponent/src/index.ts`**

Public API barrel re-exports 5 screener utility functions
(`screenerAnswersSatisfyRequired`, `buildInitialScreenerAnswers`,
`extractScreenerSeedFromData`, `omitScreenerKeysFromData`,
`normalizeScreenerSeedForItem`) and the `ScreenerStateSnapshot` type. This is
the public API surface that external consumers depend on.

**C.9.5 `packages/formspec-react/src/screener/` (4 files)**

`useScreener` hook, `FormspecScreener` component, types, barrel index.

Action: Rewrite hook to accept standalone screener document and return
DeterminationRecord. Rewrite component for standalone document.

Note: React `ScreenerStateSnapshot` has an `answers` field and nullable
`routeType` — structurally divergent from the webcomponent version.

**C.9.6 `packages/formspec-react/src/renderer.tsx`**

`FormspecForm` component checks `hasActiveScreenerDef()` and renders a
`ScreenerGate` subcomponent that wraps `FormspecScreener`. This is the React
equivalent of the webcomponent's screener gate rendering.

Action: Update to check for standalone screener document instead of
`definition.screener`.

---

### C.10 MCP Tool Changes

**`packages/formspec-mcp/src/tools/screener.ts`**

7 actions: `enable`, `add_field`, `remove_field`, `add_route`, `update_route`,
`reorder_route`, `remove_route`.

Action: Rewrite for standalone documents. New actions: `create_document`,
`delete_document`, `add_item`, `remove_item`, `update_item`, `add_phase`,
`remove_phase`, `set_phase_strategy`, `add_route` (phase-scoped),
`remove_route`, `update_route`, `set_override`, `set_lifecycle`.

---

### C.11 Test Migration

**~40 test files across all layers require changes:**

| Layer | Key test files | Action |
|-------|---------------|--------|
| Core handlers | `formspec-core/tests/definition-screener.test.ts` | Rewrite for `screener.*` handlers |
| Core queries | `formspec-core/tests/queries.test.ts` (5 screener stats tests) | Update to read from standalone |
| Studio-core | `formspec-studio-core/tests/project-methods.test.ts` | Rewrite screener helper tests; remove `removeItem` screener cleanup test |
| MCP | `formspec-mcp/tests/screener.test.ts` | Rewrite for new actions |
| Studio UI | `formspec-studio/tests/workspaces/editor/screener-authoring.test.tsx` | Rewrite for standalone UI |
| Studio UI | `formspec-studio/tests/components/blueprint/screener-summary.test.tsx` | Update to standalone |
| Engine | `formspec-engine/tests/screener-routing.test.mjs` (8 tests) | Rewrite for standalone evaluation |
| Engine | `formspec-engine/tests/extended-engine-features.test.mjs` (2 screener tests) | Update |
| Engine | `formspec-engine/tests/kitchen-sink-runtime-rehomed.test.mjs` | Update `evaluateScreener` call |
| Engine | `formspec-engine/tests/edge-case-fixtures-conformance.test.mjs` | Update fixture loading |
| Engine | `formspec-engine/tests/shared-suite.test.mjs` | Update `skipScreener` handling |
| Engine | `formspec-engine/tests/definition-schema-acceptance.test.mjs` | Update fixture list |
| Webcomponent | `formspec-webcomponent/tests/screener-seed.test.ts` | Rewrite for standalone document |
| React | `formspec-react/tests/use-screener.test.tsx` | Rewrite hook tests |
| React | `formspec-react/tests/field-spacing-parity.test.ts` | Update `.formspec-screener` CSS assertions |
| Rust (eval) | `crates/formspec-eval/src/screener.rs` inline tests | Add standalone tests, retain embedded |
| Rust (eval) | `crates/formspec-eval/tests/integration/evaluate_pipeline.rs` | Add standalone integration test |
| Rust (lint) | `crates/formspec-lint/src/expressions.rs` inline tests (4 functions) | Add standalone linting tests |
| Rust (lint) | `crates/formspec-lint/src/lib.rs` inline tests (2 functions) | Update for standalone format |
| Rust (changelog) | `crates/formspec-core/tests/changelog_test.rs` (3 screener tests) | Update for standalone diffs |
| Rust (WASM) | `crates/formspec-wasm/src/wasm_tests.rs` | Update changelog target validation |
| Python | `tests/unit/test_screener_routing.py` | Retain; add new standalone test file |
| Python | `tests/unit/test_changelog.py` (`TestScreenerMigration`) | Update for standalone |
| Python | `tests/unit/test_rust_bridge.py` | Add new symbol check |
| Python | `tests/conformance/fuzzing/test_property_based.py` | Remove `gen_screener` from definition generators |
| Python conformance | `tests/conformance/schemas/test_definition_schema.py` (`TestScreener`) | Remove; add standalone |
| Python conformance | `tests/conformance/spec/test_cross_spec_contracts.py` | Remove `'screener'` from Definition properties |
| E2E | `tests/e2e/browser/screener/screener-routing.spec.ts` | Major rewrite for standalone |
| E2E | `tests/e2e/headless/test_edge_case_payloads.py` | Update fixture loading |
| Conformance suite | `tests/conformance/suite/clinical-intake-submit-valid.json` | Update `payloadPath` |
| Fixtures | See C.11.1 below | Extract embedded screeners |

**C.11.1 Fixture and example files with embedded screener**

| File | Action |
|------|--------|
| `examples/grant-application/definition.json` | Extract screener to `examples/grant-application/screener.json` |
| `examples/clinical-intake/intake.definition.json` | Extract screener to `examples/clinical-intake/screener.json` |
| `examples/clinical-intake/fixtures/screener-emergency.response.json` | Retain as response fixture for standalone screener |
| `examples/clinical-intake/fixtures/screener-routine.response.json` | Retain as response fixture for standalone screener |
| `tests/fixtures/fixture-microgrant-screener.json` | Convert to standalone screener document format |
| `tests/e2e/fixtures/kitchen-sink-holistic/definition.v1.json` | Remove embedded screener; create standalone screener fixture |
| `tests/e2e/fixtures/kitchen-sink-holistic/definition.v2.json` | Same |
| `packages/formspec-engine/tests/fixtures/grant-app-definition.json` | Extract embedded screener to standalone fixture |

---

### C.12 Migration Phasing

The migration MUST proceed bottom-up. Each phase produces a working system
with backwards compatibility.

| Phase | Scope | Prerequisite |
|-------|-------|-------------|
| **0** | Schemas, codegen, Core §4.7 deprecation | None |
| **1** | Rust evaluator: new types, three strategies, override logic, DeterminationRecord | Phase 0 |
| **2** | WASM + Python bindings, TS bridge functions | Phase 1 |
| **3** | TypeScript core handlers (`screener.*`), queries, project state | Phase 0 (types), Phase 2 (eval) |
| **4** | Studio-core helpers, MCP tools | Phase 3 |
| **5** | Studio UI, webcomponent, React screener | Phase 4 |
| **6** | Fixtures, examples, E2E tests | Phase 5 |
| **7** | Cleanup: remove deprecated embedded-screener code paths | All above |

**Estimated file impact: ~95 files across 14 packages and 5 crates.**

---

### C.13 Existing Plans

`thoughts/archive/studio/2026-03-30-screener-authoring-plan.md` was written for the
embedded screener model and is now outdated. A new implementation plan should
be written that accounts for the standalone document model, phase-based UI,
and the gateway architecture.

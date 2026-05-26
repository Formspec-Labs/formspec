---
title: Formspec Trace
version: 1.0.0-draft.1
date: 2026-05-25
depends_on:
  - specs/component/component-spec.md
  - specs/component/component-reference-fields-spec.md
  - specs/experience/experience-spec.md
  - specs/response-actions/response-actions-spec.md
  - specs/ontology/ontology-spec.md
---

# Formspec Trace Specification

## Status of This Document

Draft. This specification is the canonical contract for the Formspec Trace artifact described in concept architecture note §6.12 and §10.6. Behavior described here is normative under BCP 14 keywords. The concept note remains design intent only; Trace conformance comes from this specification, `schemas/trace-index.schema.json`, and the conformance fixtures under `tests/conformance/fixtures/trace/`.

## Conventions and Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 (RFC 2119, RFC 8174) when, and only when, they appear in all capitals.

JSON syntax is as defined in RFC 8259. JSON Pointer syntax is as defined in RFC 6901.

## Bottom Line Up Front

<!-- bluf:start file=trace-spec.bluf.md -->
- TraceIndex is a generated cache over Definition, Experience, Response Actions, Component, and optional Ontology sources; it is never authored production truth.
- Every source inspected by the builder appears in `sources[]` with a closed identity tuple and `sha256:<lowercase-hex>` digest; stale predicate execution raises an error before returning any result.
- Trace v1.0 has a closed set of eleven edge kinds and typed endpoint prefixes for items, units, tasks, actors, actions, effects, preconditions, concepts, and Component node paths.
- Predicates are deterministic pure functions over the edge list, including the `whatDependsOn(itemPath)` impact report for refactor-with-confidence analysis.
- Trace carries relationship edges only; regeneration-review findings, Component reference-resolution findings, and Experience coverage findings remain owned by their source streams and compose at the Studio review surface.
<!-- bluf:end -->

## Table of Contents

1. [Introduction](#1-introduction)
2. [The TraceIndex Document](#2-the-traceindex-document)
3. [Source Set and Identity](#3-source-set-and-identity)
4. [Canonical Digests](#4-canonical-digests)
5. [Edges](#5-edges)
6. [Predicates](#6-predicates)
7. [Stale-Cache Rejection](#7-stale-cache-rejection)
8. [Composition Contract](#8-composition-contract)
9. [Schema](#9-schema)
10. [Conformance](#10-conformance)
11. [Open Questions](#11-open-questions)

## 1. Introduction

### 1.1 Purpose

Trace is a generated relationship index over the v1 source set: Definition, Experience, Response Actions, Component, and, when supplied, Ontology. A `TraceIndex` document carries the source set that produced it, identified by source identity plus canonical content digest, and typed edges extracted from those sources.

Predicates over the index answer v1 consumer questions across five families:

1. Component rendering: which Component node renders which Definition item.
2. Experience hierarchy: which Unit, Task, and Actor relate to which items and work.
3. Action/trigger: which ActionButton invokes which Action, and which effects or preconditions that Action carries.
4. FEL dependency: which item bind expressions depend on which other items.
5. Concepts: which Ontology concepts bind which items or Component nodes.

Trace exists to make generated UI explainable, reviewable, and refactorable. Its seed consumers are Studio authoring of complex grant applications and Studio regeneration review. The key authoring question is refactor-with-confidence: given "rename `householdIncome`", `whatDependsOn` returns the dependent FEL expressions, rendering nodes, collecting units, visibility dependencies, and concept bindings before the author makes the change.

### 1.2 Scope

This specification defines:

1. The `TraceIndex` document shape.
2. The source-set declaration and per-artifact identity tuple.
3. The canonical digest model.
4. The closed v1 set of eleven edge kinds and endpoint identity vocabulary.
5. Predicate semantics for the sixteen simple v1 predicates plus the `whatDependsOn(itemPath) -> ImpactReport` join predicate.
6. The stale-cache rejection invariant.
7. The composition contract with regeneration-review records, Component reference-resolution findings, and Experience coverage findings.
8. The JSON Schema.
9. Conformance levels.

### 1.3 Out of Scope

- Query language. Predicates v1.0 are typed function signatures over the edge list. No query DSL ships in v1.0.
- Cross-projection verification. Concept §6.12 explicitly defers verification semantics until a formal predicate set, query model, source set, and named consumer exist. No verifier predicate ships in v1.0.
- Materialization storage. Hosts MAY store TraceIndex inline, as a sibling file, as a database row, or otherwise. This specification defines only the document shape and the rules a stored TraceIndex must satisfy.
- Builder performance, caching, or incremental update. Builders MUST be deterministic; everything else is host policy.
- Runtime engine implementations. This specification and its conformance fixtures define the contract. TypeScript, Rust, Python, and host implementations consume it in separate plans.

### 1.4 Cache Posture

A materialized `TraceIndex` document is a CACHE, not authored truth. Implementations MUST NOT treat a TraceIndex as authority unless predicate execution first verifies the index is fresh against the supplied source artifacts. Hand-authored TraceIndex documents are non-conforming for production use; they are permitted only for fixtures and tests.

### 1.5 Relationship to Other Specifications

| Artifact | Relationship |
|---|---|
| Definition | Source artifact. Definition owns item identity and bind semantics. Trace extracts `item-depends-on-item` edges from bind dependency analysis. |
| Experience | Source artifact. Experience owns Actor, Task, Unit, and coverage semantics. Trace extracts hierarchy and `unit-collects-item` edges but does not own coverage findings. |
| Response Actions | Source artifact. Response Actions owns Action identity, effects, preconditions, invocation, and validation tuple behavior. Trace extracts action/effect/precondition relationship edges but does not invent submission edges. |
| Component | Source artifact. Component owns UI tree, `bind`, `when`, `conceptRefs`, and `ActionButton.actionRef`. Trace extracts rendering, visibility, concept, and trigger edges. |
| Component Reference Fields | Source for reusable anchor-prefix vocabulary. Resolver findings remain owned by Component Reference Fields and are not duplicated in Trace. |
| Ontology | Optional source artifact. Trace extracts `concept-refs-item` edges from the Ontology concepts map when Ontology is supplied. |
| Regeneration-review route | Separate review stream. Trace is static relationship context; route-owned records carry orphan, survival, conflict, and pending-review status. |
| Semantic-layers concept note | Design motivation only. It is not a conformance source for Trace wire shape. |

## 2. The TraceIndex Document

### 2.1 Marker and Top-Level Shape

A TraceIndex document is a JSON object with exactly these top-level members:

| Field | Type | Required | Description |
|---|---|---|---|
| `$formspecTrace` | string const `"1.0"` | REQUIRED | TraceIndex document marker and major-version pin. |
| `sources` | array of SourceEntry | REQUIRED | Source artifacts inspected by the builder. |
| `edges` | array of EdgeEntry | REQUIRED | Deterministic relationship edges extracted from the source set. |

No additional top-level members are permitted. TraceIndex does not carry findings, severities, resolver results, coverage status, merge records, or runtime execution state.

### 2.2 Sources

`sources[]` records every source artifact that the builder inspected. A source artifact that contributes zero edges MUST still appear when it was inspected, because stale rejection depends on complete source-set declaration.

`sources[]` order is deterministic: ascending by `(kind, canonical-json(identity))`.

### 2.3 Edges

`edges[]` records typed relationships. Each edge has a closed `kind` and exactly two typed string endpoints. Edge order is deterministic: ascending by `(kind, canonical-json(endpoints))`. Builders MUST deduplicate byte-equal edges.

### 2.4 Immutability

Builders MUST emit a finished TraceIndex as an immutable JSON value. Predicate execution, composition, and consumers MUST NOT mutate it in place. If the sources change, the TraceIndex MUST be rebuilt.

## 3. Source Set and Identity

### 3.1 Source Kinds

The v1 source-kind enum is closed:

- `definition`
- `experience`
- `responseActions`
- `component`
- `ontology`

Mapping, References, Respondent Ledger, Intake Handoff, Theme, Locale, and submission artifacts are not v1 source kinds.

### 3.2 Source Entry Shape

Each `sources[]` entry is a JSON object with exactly:

| Field | Type | Description |
|---|---|---|
| `kind` | string | One of the v1 source kinds. |
| `identity` | object | Closed identity tuple for the source kind. |
| `digest` | string | Canonical content digest per §4. |

No additional members are permitted.

### 3.3 Identity Tuples

| Source kind | Identity tuple | Notes |
|---|---|---|
| `definition` | `{ url: string, version: string }` | Definition declares its own identity. |
| `experience` | `{ sourceRef: string, targetDefinitionUrl: string, version: string }` | Experience has no top-level document id; `sourceRef` is the builder or host locator. |
| `responseActions` | `{ sourceRef: string, targetDefinitionUrl: string, version: string }` | Response Actions has no top-level document id; `sourceRef` is the builder or host locator. |
| `component` | `{ sourceRef: string, targetDefinitionUrl: string, version: string, url?: string }` | Component may declare `url`; `sourceRef` remains the concrete locator. |
| `ontology` | `{ sourceRef: string, targetDefinitionUrl: string, version: string }` | Required when `concept-refs-item` edges are emitted. |

Identity tuples are closed per kind. Trace MUST NOT accept a sidecar `"id"` as a substitute for `sourceRef`.

### 3.4 Source-Set Completeness

A Trace builder MUST declare every source artifact it inspected. A source listed with zero contributing edges is allowed and still required if inspected. A source not listed whose contents could have changed an emitted edge is a builder bug; the index cannot prove that omission after the fact.

## 4. Canonical Digests

### 4.1 Digest Form

`digest` is a string in the form:

```text
sha256:<64 lowercase hexadecimal characters>
```

Uppercase hexadecimal, missing algorithm prefixes, alternative algorithms, truncated hashes, and base64 encodings are non-conforming.

### 4.2 Canonical Bytes

Trace v1.0 defines the digest profile for source artifacts as SHA-256 over canonical JSON bytes for the entire source artifact. Canonical JSON means RFC 8785 JSON Canonicalization Scheme (JCS) unless the source specification defines a stronger whole-artifact canonical byte profile. The digest covers the entire source artifact, not only the portions Trace extracts.

Fixture-only builder hints such as `_bind_dependencies` and `_when_dependencies` are not production source fields, but when they appear in a conformance fixture they are part of that fixture's source artifact and MUST be included in the fixture digest. Production builders MUST digest the real source artifact they inspected.

### 4.3 Stale Safety Property

Any change to a source artifact's canonical bytes invalidates the digest and prevents reuse of indices built before that change. This rule is intentionally stronger than "only changes to extracted relationships matter"; it prevents consumers from silently accepting a TraceIndex built against a different source set.

## 5. Edges

### 5.1 Closed v1 Edge Set

v1.0 ships eleven edge kinds, each grounded in a current sibling spec:

| Edge kind | Question | Source artifact(s) | Endpoint identity |
|---|---|---|---|
| `component-renders-item` | Which Component node renders which item? | Component `bind` | `componentNodePath:`, `item:` |
| `unit-collects-item` | Which Experience unit collects which item? | Experience `unit.itemRefs[]` | `unit:`, `item:` |
| `trigger-invokes-action` | Which ActionButton invokes which Response Action? | Component `ActionButton.actionRef` plus Response Actions identity | `componentNodePath:`, `action:` |
| `item-depends-on-item` | Which item's FEL bind expressions reference which other item? | Definition binds | `item:`, `item:` |
| `unit-serves-task` | Which Experience unit advances which task? | Experience `unit.taskRefs[]` | `unit:`, `task:` |
| `task-involves-actor` | Which task involves which actor? | Experience `task.actorRefs[]` | `task:`, `actor:` |
| `action-emits-effect` | Which Response Action emits which effect? | Response Actions `action.effects[]` | `action:`, `effect:` |
| `action-has-precondition` | Which Response Action is guarded by which precondition? | Response Actions `action.preconditions[]` | `action:`, `precondition:` |
| `concept-refs-item` | Which ontology concept binds which Definition item? | Ontology `concepts` map | `concept:`, `item:` |
| `concept-refs-component-node` | Which ontology concept is referenced by which Component node? | Component `conceptRefs[]` | `concept:`, `componentNodePath:` |
| `node-visibility-references-item` | Which Component node's `when` expression depends on which item? | Component `when` FEL | `componentNodePath:`, `item:` |

Builders MUST emit edges of every kind for which at least one matching relationship exists in the inspected sources. Builders MUST NOT emit edge kinds outside this closed set.

`node-visibility-references-item` is admitted in v1.0. Builders that do not yet run a FEL dependency pass over Component `when` expressions MAY emit zero such edges, but they MUST still declare inspected Component sources.

### 5.2 Endpoint Identity Vocabulary

Endpoints are typed strings. The v1 endpoint-prefix vocabulary is closed:

| Prefix | Meaning |
|---|---|
| `item:<path>` | Definition item path. |
| `unit:<id>` | Experience Unit id. |
| `task:<id>` | Experience Task id. |
| `actor:<id>` | Experience Actor id. |
| `action:<id>` | Response Action id. |
| `effect:<actionId>:<index>` | Response Action effect at 0-based `effects[]` index. |
| `precondition:<actionId>:<preconditionId>` | Response Action precondition id scoped by Action id. |
| `concept:<id>` | Ontology concept IRI or ConceptRef id. |
| `componentNodePath:<jsonPointer>` | RFC 6901 JSON Pointer to a Component node. |

`item:`, `unit:`, `task:`, `action:`, and `concept:` reuse Component Reference Fields anchor vocabulary. `actor:`, `precondition:`, `effect:`, and `componentNodePath:` are Trace-introduced endpoint prefixes.

### 5.3 Edge Entry Shape

Each `edges[]` entry is a JSON object with exactly:

| Field | Type | Description |
|---|---|---|
| `kind` | string | One v1 edge kind. |
| `endpoints` | array | Exactly two typed endpoint strings in the order specified by §5.1. |

No additional members are permitted. In particular, `severity`, `code`, `reason`, resolver outputs, merge state, and coverage state MUST NOT appear in Trace edges.

### 5.4 Effect and Precondition Identity

Effects do not have their own ids. Trace identifies effects as `effect:<actionId>:<0-based-index>`. Index stability is digest-coupled: if `effects[]` reorders between builds, the source digest changes and stale rejection fires.

Preconditions carry ids in Response Actions. Trace identifies them as `precondition:<actionId>:<preconditionId>`.

### 5.5 Edge Determinism

Builders MUST produce byte-identical edge lists for byte-identical source artifacts. Builders MUST sort edges by kind and endpoints, and MUST remove duplicate byte-equal edges.

## 6. Predicates

### 6.1 Predicate Set

Sixteen simple predicates ship in v1.0:

| Predicate | Returns |
|---|---|
| `componentNodesForItem(itemPath)` | `componentNodePath:` endpoint strings for nodes rendering the item. |
| `itemsForComponent(componentNodePath)` | item paths rendered by the node. |
| `unitsForItem(itemPath)` | unit ids collecting the item. |
| `itemsForUnit(unitId)` | item paths collected by the unit. |
| `tasksForUnit(unitId)` | task ids served by the unit. |
| `unitsForTask(taskId)` | unit ids serving the task. |
| `actorsForTask(taskId)` | actor ids involved in the task. |
| `tasksForActor(actorId)` | task ids involving the actor. |
| `actionForTrigger(componentNodePath)` | action id or null for the ActionButton node. |
| `triggersForAction(actionId)` | `componentNodePath:` endpoint strings invoking the action. |
| `itemsForAction(actionId)` | item paths rendered by nodes that trigger the action. |
| `dependenciesOf(itemPath)` | item paths the subject item depends on. |
| `dependentsOn(itemPath)` | item paths whose bind expressions depend on the subject. |
| `conceptsForItem(itemPath)` | concept ids bound to the item. |
| `itemsForConcept(conceptId)` | item paths bound to the concept. |
| `conceptsForNode(componentNodePath)` | concept ids referenced by the Component node. |

Predicates return sorted, deduplicated outputs. Predicates MUST NOT mutate the TraceIndex or supplied sources.

### 6.2 Impact Report

`whatDependsOn(itemPath) -> ImpactReport` is the seventeenth callable predicate and the v1 join predicate for refactor-with-confidence analysis. It returns a JSON object with these members:

| Field | Source |
|---|---|
| `subjectItem` | Subject item endpoint string (`item:<path>`). |
| `directDependentItems` | Direct `item-depends-on-item` reverse edges. |
| `transitiveDependentItems` | Breadth-first transitive closure over reverse item dependencies, excluding the subject. |
| `renderingNodes` | `component-renders-item` edges for the subject. |
| `collectingUnits` | `unit-collects-item` edges for the subject. |
| `visibilityNodes` | `node-visibility-references-item` edges for the subject. |
| `actionPreconditions` | Reserved; always empty in v1.0. |
| `conceptBindings` | `concept-refs-item` edges for the subject. |

The transitive closure algorithm MUST be cycle-safe. It tracks visited item paths and stops a branch when it reaches a previously visited item. Output ordering is deterministic.

### 6.3 Stale-First Execution

Every predicate execution MUST verify the TraceIndex is fresh before returning. A stale TraceIndex MUST cause predicate execution to fail with the stale error defined in §7.2. Predicates MUST NOT return partial results for stale indices.

Hosts that independently verify freshness MAY pass a proof of freshness to predicate implementations, but that proof MUST be structurally tied to the same `sources[]` digests carried by the TraceIndex. A global "skip freshness" switch is non-conforming.

## 7. Stale-Cache Rejection

### 7.1 Freshness Check

Before returning any predicate result, an implementation MUST compare the TraceIndex `sources[]` entries with the supplied source artifacts. The comparison uses source kind, identity tuple, and canonical digest.

### 7.2 Stale Error

On stale, predicate execution MUST raise an error and MUST NOT return a best-effort or partial value. The error MUST identify at least one stale reason:

| Reason | Meaning |
|---|---|
| `digest-mismatch` | A supplied artifact identity matches an index source entry, but its digest differs. |
| `source-missing` | The index lists a source for which no artifact was supplied. |
| `extra-source-present` | The caller supplied an artifact that has no corresponding source entry in the index. |
| `duplicate-source-entry` | The index repeats the same `(kind, identity)` source key, making freshness ambiguous. |
| `identity-mismatch` | Source kind and location suggest the same source, but the declared identity tuple differs. |
| `unsupported-digest` | A source digest is not supported by the implementation. |

The severity of stale rejection is error. There is no warning-level stale TraceIndex.

### 7.3 Repair

A stale TraceIndex MUST NOT be repaired by predicate execution. Repair is the builder's job. Consumers respond to stale rejection by rebuilding the index from the supplied source artifacts.

## 8. Composition Contract

### 8.1 First Consumer

Studio regeneration review is the first composition consumer. A Studio review surface needs:

1. route-owned review records for regenerated, surviving, orphaned, conflict, or pending-review Component subjects;
2. Component reference-resolution findings owned by Component Reference Fields;
3. Experience coverage findings owned by the Experience coverage resolver; and
4. Trace relationship edges as context.

### 8.2 Ownership Boundaries

Trace owns only the typed edge list and predicates over that edge list. Trace MUST NOT own or emit:

- regeneration merge findings;
- orphan findings;
- Component reference-resolution findings;
- Experience coverage findings;
- validation findings;
- Response Actions invocation results; or
- resolver repair actions.

### 8.3 Join Handles

Studio review composition requires stable handles. The route-owned regeneration-review stream MUST expose a stable Component subject handle, such as a Component node JSON Pointer, or an explicit item-path handle for coverage joins.

The Experience coverage join is:

```text
coverage finding path -> item:<path> -> unit-collects-item / component-renders-item edges
```

The Component subject join is:

```text
review subject component node -> componentNodePath:<pointer> -> Trace edges touching that endpoint
```

If a chosen regeneration-review route exposes neither Component node handles nor item-path handles, Studio composition conformance cannot be claimed.

### 8.4 No Double Counting

A composition surface MUST NOT count the same finding twice. Every finding or review record has exactly one originating stream. Trace edges are reference data used to display that finding contextually; Trace is not a finding stream.

## 9. Schema

`schemas/trace-index.schema.json` is the normative structural schema for TraceIndex documents. It enforces:

- `$formspecTrace: "1.0"`;
- the closed source-kind enum;
- the closed edge-kind enum;
- closed identity tuples per source kind;
- exactly two endpoints per edge;
- per-kind endpoint prefix order;
- the lowercase SHA-256 digest pattern; and
- no extra TraceIndex, SourceEntry, or EdgeEntry members.

Schema validity is necessary but not sufficient for Trace conformance. Predicate behavior and stale rejection remain behavioral requirements.

## 10. Conformance

### 10.1 Levels

| Level | Requirement |
|---|---|
| Level 1 - Builder determinism | A builder emits the exact TraceIndex predicted by the conformance fixtures for the supplied source artifacts. |
| Level 2 - Schema validity | Emitted TraceIndex documents validate against `schemas/trace-index.schema.json`. |
| Level 3 - Predicate behavior and stale rejection | Predicates return fixture-defined values and reject stale indices with an error before returning any partial result. |
| Level 4 - Composition | Studio-grade review surfaces compose route-owned review records, CRF findings, EXP-COVERAGE findings, and Trace edges without double counting and without moving findings into Trace. |

A conforming runtime MUST satisfy Levels 1-3. Level 4 applies to composition surfaces that claim Studio regeneration-review conformance.

### 10.2 Prohibitions

A conforming implementation MUST NOT:

- emit edge kinds outside the v1.0 closed set of eleven;
- emit endpoint prefixes outside the v1.0 typed-string vocabulary;
- treat hand-authored TraceIndex documents as production-conforming;
- return partial predicate results for stale indices;
- mutate inputs during predicate execution;
- carry regeneration-review findings, coverage findings, or reference-resolution findings inside TraceIndex;
- emit `concept-refs-item` edges without declaring the `ontology` source in `sources[]`; or
- emit `item-depends-on-item` edges whose item paths are outside the Definition item space.

## 11. Open Questions

1. Cross-projection verification. Deferred until a named verifier consumer defines the predicate set and source set needed for consistency checking.
2. `precondition-references-item`. Deferred until Studio or lint consumers need to answer which items guard action preconditions.
3. Required Component `when` FEL dependency extraction. v1.0 admits the edge kind but permits builders to emit zero visibility edges when they do not run that pass.
4. TraceIndex self-digest. Hosts that need an addressable handle compute it externally for v1.0.
5. Builder caching and incremental update. Builders are deterministic; incremental construction is host policy.
6. Mapping, References, Respondent Ledger, Intake Handoff, and submission edge families. Deferred until their owning specs expose stable identity and relationship semantics.
7. Cycle reporting in `whatDependsOn`. v1.0 is cycle-safe but does not add a `cycles[]` field.
8. Multi-document source sets. v1.0 assumes one document per source kind for predicate fixture behavior.
9. Trace-derived findings. Deferred to avoid colliding with Experience coverage and Component reference-resolution ownership.

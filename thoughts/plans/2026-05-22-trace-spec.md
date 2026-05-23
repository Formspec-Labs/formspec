---
title: Trace Spec — relationship index for Studio regeneration review
date: 2026-05-22
status: draft
owner: spec-author
related:
  - thoughts/specs/2026-05-20-formspec-semantic-layers.md
  - thoughts/plans/2026-05-22-regeneration-merge.md
  - specs/component/component-spec.md
  - specs/component/component-reference-fields-spec.md
  - specs/experience/experience-spec.md
  - specs/response-actions/response-actions-spec.md
  - specs/core/validation-mapping.md
---

# Trace Spec — Follow-Up to Component Reference Fields

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development.

**Goal:** Author the canonical Trace spec at `specs/trace/trace-spec.md`. Define a `TraceIndex` document — a generated, normalized relationship graph over the v1 source set (Definition, Experience, Response Actions, Component) — plus predicate semantics, source-set rules, canonical input-digest model, and stale-cache rejection invariant. Pin only the v1 relationship vocabulary that is grounded in current sibling specs: `component-renders-item`, `unit-collects-item`, and `trigger-invokes-action`. Mapping, References, Respondent Ledger, submission, and reverse-query edges remain future work until their owning specs provide stable relationship and identity surfaces. Cross-projection verification semantics are deferred (concept §6.12 line "Trace does not yet verify cross-projection consistency by itself").

**Architecture:** TraceIndex is a normalized, deterministic, append-built JSON document. Each inspected source artifact contributes a `sources[]` entry carrying `(kind, identity, digest)`. Edge extraction is declarative: walking Component yields `component-renders-item` edges (one per `bind`) and `trigger-invokes-action` edges (one per `ActionButton.actionRef`); walking Experience yields `unit-collects-item` edges (one per `Unit.itemRefs[]` entry). Definition and Response Actions are still v1 source artifacts when supplied: Definition provides the item identity space, and Response Actions provides the action identity space for freshness and resolver composition, but Trace does not invent a Response Actions submission edge. The index is produced by a builder that consumes source artifacts and emits a TraceIndex; predicates are deterministic queries over the edge list. Stale rejection: the builder records canonical digests of every inspected source artifact at build time; predicate execution MUST first re-verify all source digests against the supplied artifacts and reject the index when any digest mismatches. Composition with regeneration review: Trace supplies the static relationship index, the chosen regeneration-review route supplies per-cycle review records, and the Experience coverage resolver supplies uncovered-required-item findings. **Trace itself owns no merge findings, no coverage findings, no resolver findings — only the relationship edges.**

**Tech Stack:** JSON Schema 2020-12, Markdown (BCP-14), pytest under `formspec/tests/conformance/spec/`, Python builder + predicate harness lives inline in the pytest (the spec is the contract; runtime implementations land in separate engine plans).

**Sequencing:** Spec prose §1–§11 → TraceIndex schema → fixtures (one per first-consumer predicate plus stale-rejection cases) → schema-shape pytest → predicate pytest → stale-rejection invariant pytest → composition pytest (Trace + abstract review-record stream + EXP-COVERAGE for Studio review) → upstream cross-reference note → doc pipeline registration.

**Citations:** "CRF §" = `specs/component/component-reference-fields-spec.md`. "COMP §" = `specs/component/component-spec.md`. "EXP §" = `specs/experience/experience-spec.md`. "RA §" = `specs/response-actions/response-actions-spec.md`. "Concept §" = `thoughts/specs/2026-05-20-formspec-semantic-layers.md` (design intent, not a conformance source). "RegenMerge §" = `specs/component/regeneration-merge-spec.md` (paused-after-task-16; may relocate to MCP/ProposalManager route).

---

## Preconditions

This plan MUST NOT execute until:

1. **Component Reference Fields** has landed (verifying CRF anchor taxonomy `item:` / `unit:` / `task:` / `action:` / `concept:` and CRF §6 resolver exist).
2. **Experience spec** has landed (verifying `EXP-COVERAGE-UNCOVERED-REQUIRED-ITEM` and §8.1 coverage predicate exist).
3. **Response Actions spec** has landed (verifying `Action.id`, `ActionButton.actionRef` resolution, and Response Actions document structure exist).
4. **Concept §6.12 / §10.6 still describe Trace** as a generated cache / relationship index. If the concept note changed, re-anchor the motivation before authoring. Do not treat the concept note as the normative source for Trace wire shape.

This plan does NOT require the standalone regeneration-merge algorithm to land first. Trace's schema and predicates are independent of the merge algorithm. The composition test, however, MUST be written against an abstract review-record stream with a stable Component-subject handle. If the chosen regeneration-review route cannot emit a stable Component node handle (or an explicit item-path handle for coverage joins), stop before Task 17 and re-open §8.

Verify before Task 1:

```bash
cd /Users/mikewolfd/Work/formspec-stack/formspec
grep -q 'EXP-COVERAGE-UNCOVERED-REQUIRED-ITEM' specs/experience/experience-spec.md && echo "EXP coverage finding: OK"
grep -q '"x-generation"' schemas/component.schema.json && echo "x-generation schema: OK"
grep -q 'actionRef' specs/component/component-spec.md && echo "ActionButton.actionRef: OK"
grep -q 'actions\\[\\*\\]\\.id\\|Action.id' specs/response-actions/response-actions-spec.md && echo "Response Actions identity: OK"
grep -q 'COMP-REFERENTIAL-INTEGRITY' specs/component/component-reference-fields-spec.md && echo "CRF resolver finding family: OK"
test ! -d specs/trace && echo "Trace dir not yet created: OK (or rerun with --force if iterating)"
```

If any check fails, stop and surface to the user.

---

## Design Decisions (load-bearing)

| Decision | Choice | Confidence | Rationale |
|---|---|---|---|
| Trace document name | `TraceIndex`, document marker `$formspecTrace` | HIGH | Concept §6.12 calls the artifact "Trace"; suffix `Index` disambiguates from "trace" as a verb in logging/observability vocabulary and pins it as a noun-shaped data document. |
| Trace artifact status | Generated, not authored. Materialized output is a CACHE per concept §5.4 ("A materialized Trace is a cache, not a source of truth") | HIGH | The spec MUST forbid hand-authoring TraceIndex as the system of record. Hand-authored TraceIndex is acceptable only for fixtures and tests. |
| Source-set declaration | TraceIndex MUST declare every source artifact it inspected in `sources[]` with source identity + canonical digest | HIGH | Concept §6.12: "A materialized Trace must carry input digests and must be rejected as stale when any input digest changes." Source set is the ledger of what produced the index. |
| Source identity | Definition uses declared `{ url, version }`. Sidecar sources use a Trace `sourceRef` supplied by the builder / host plus declared source fields (`version`, `targetDefinition.url`, and `url` when the source has one). | HIGH | Experience and Response Actions do not define top-level document ids. Trace MUST NOT pretend those ids exist; it must distinguish source-location identity from source-declared semantic identity. |
| Canonical digest | SHA-256 over canonical bytes, encoded as `sha256:<lowercase-hex>` | HIGH | Response has a signed-payload canonical profile, but Definition / Experience / Response Actions / Component do not define per-artifact canonical bytes. Trace v1.0 therefore defines its own source-digest profile: whole JSON artifact serialized with RFC 8785 JCS unless the source spec explicitly defines a stronger canonical form. |
| Edge kinds — closed set v1.0 | Three kinds: `component-renders-item`, `unit-collects-item`, and `trigger-invokes-action` | HIGH | These are the relationship surfaces grounded in current Component, CRF, Experience, and Response Actions specs. Mapping, References, Respondent Ledger, and submission edges are not admitted until their owning specs expose stable identity and relationship semantics. |
| Edge identity | Each edge carries `(kind, endpoints[])` where endpoints are typed source references. v1.0 endpoint prefixes are `componentNodePath:`, `item:`, `unit:`, and `action:`. | HIGH | `item:`, `unit:`, and `action:` reuse CRF anchor prefixes. `componentNodePath:` is Trace-owned because Component node identity is path-based when `id` is optional. |
| Predicates v1.0 | Three: `componentNodesForItem(itemPath) -> nodePath[]`, `unitsForItem(itemPath) -> unitId[]`, `actionForTrigger(componentNodePath) -> actionId \| null`. These are the first-consumer (Studio regeneration review) needs | HIGH | Concept §11.4: "Predicate names, query language, source-set rules, and verification semantics are deferred until the named consumer needs them." Three is what Studio needs; no other edge kinds ship in v1.0. |
| Stale rejection invariant | Predicate execution MUST verify every `sources[]` digest before any predicate runs. Any mismatch → REJECT (raise a defined error; predicate MUST NOT return partial results) | HIGH | Concept §6.12: "must be rejected as stale when any input digest changes." Non-negotiable. |
| Stale rejection severity | `error` — there is no warning-level stale | HIGH | A stale Trace is structurally untrustworthy; serving it would silently corrupt Studio review. |
| Source-set completeness rule | TraceIndex MUST declare every source artifact the builder inspected. A source listed in `sources[]` with zero contributing edges is allowed and still required if inspected. A source NOT listed whose digest would have changed an edge is a builder bug; the spec MAY NOT detect this from the index alone | MEDIUM | Builder responsibility, not index validation responsibility. Conformance fixtures pin a few cases. |
| Cross-projection verification | DEFERRED to v1.1 with a named verifier consumer | HIGH | Concept §6.12: "Trace does not yet verify cross-projection consistency by itself. Verification requires a formal predicate set, query model, source set, and named consumer." No verifier consumer has emerged; do not invent one. |
| Orphan composition contract | Trace does NOT own orphan findings. The chosen regeneration-review route owns per-cycle orphan / survived / conflict records; CRF owns reference-resolution findings. Studio review composes those records with Trace via stable Component-subject handles. | MEDIUM | This keeps Trace independent of any standalone merge-report shape while still requiring a concrete join handle before composition conformance can land. |
| Coverage composition contract | Trace does NOT own coverage findings. `EXP-COVERAGE-UNCOVERED-REQUIRED-ITEM` (EXP §8.2) is the coverage source; Studio review composes via `unit-collects-item` edges | HIGH | Same delegation precedent. |
| Hand-authoring fixtures | Fixtures MAY hand-author a TraceIndex; production hosts MUST generate. The spec marks hand-authored TraceIndex as non-conforming for production use via §5 builder-required language | HIGH | Test ergonomics vs production guarantee. |
| Materialization storage | Out of scope. Hosts MAY store TraceIndex inline, as a sibling file, as a database row, etc. The spec defines only the document shape and the validation rules a stored TraceIndex must satisfy | HIGH | Storage is host policy. |

Decisions marked HIGH should not change without owner pushback.

---

## File Structure

### Created

| Path | Responsibility |
|---|---|
| `specs/trace/trace-spec.md` | Canonical prose for the Trace contract — TraceIndex shape, v1 source set, v1 edge kinds, predicates, digest model, stale rejection, composition contract. |
| `specs/trace/trace-spec.bluf.md` | BLUF source. |
| `specs/trace/trace-spec.llm.md` | Generated LLM artifact (do NOT hand-edit). |
| `schemas/trace-index.schema.json` | Structured shape of TraceIndex: `version`, `sources[]`, `edges[]`. Source entry: `kind`, identity tuple, `digest`. Edge entry: `kind`, `endpoints[]`. |
| `tests/conformance/spec/test_trace_index_schema.py` | Schema-shape pytest for `trace-index.schema.json`. Asserts every fixture under `tests/conformance/fixtures/trace/` validates; asserts invalid fixtures fail; asserts the closed edge-kind enum. |
| `tests/conformance/spec/test_trace_predicates.py` | Predicate pytest. Inline reference builder + predicate harness. Drives every fixture pair through builder → predicate; asserts predicate outputs are deterministic, sorted, and match expected. |
| `tests/conformance/spec/test_trace_stale_rejection.py` | Stale-rejection invariant pytest. Asserts predicate execution against a TraceIndex whose `sources[]` digest does not match the supplied artifacts raises `TraceStaleError`. Asserts the rejection is unconditional (no partial results). |
| `tests/conformance/spec/test_trace_studio_review_composition.py` | Cross-spec composition pytest. Asserts that Trace edges + a synthetic abstract review-record stream + EXP-COVERAGE findings compose into a Studio-review-shaped output without information loss and without double-counting findings. |
| `tests/conformance/fixtures/trace/` | Per-case fixture directory. Each case is a directory containing the v1 source artifacts (`definition.json`, `experience.json`, `response-actions.json`, `component.json`), an `expected-index.json` (the TraceIndex the builder should produce), and `expected-predicates.json` (predicate name → expected return value). |

### Modified

| Path | Why |
|---|---|
| `thoughts/specs/2026-05-20-formspec-semantic-layers.md` | Add a non-normative cross-reference note only if the owner wants the concept note to point to the new spec. Do not mark concept §11.4 "resolved" from this plan alone. |
| `scripts/spec-artifacts.config.json` | Register new spec + BLUF + LLM + schema entries with behaviorEssentials / conformanceEssentials. |
| `tests/contracts/surface-coverage.json` | Add `trace` contract row pointing at the four pytests + fixture dir. |
| `filemap.json` | Regenerated via `npm run docs:filemap`. |

### Explicitly NOT in scope

- **Regeneration merge dependency.** Trace is a sibling artifact, not a downstream consumer of any regeneration-merge report. The composition contract describes how Studio review composes Trace with whichever review-record stream the chosen regeneration route emits. Trace's schema and predicates do NOT reference RegenMerge constructs. If RegenMerge relocates to MCP/ProposalManager, Task 17 must use the route's stable Component-subject handle rather than a route-specific node-path field.
- **Cross-projection verification.** Concept §6.12 explicitly defers this. No verifier predicate ships in v1.0. A future verifier-consumer plan re-opens this.
- **Deferred edge families.** Mapping, References, Respondent Ledger, submission, task, and concept relationship edges do NOT ship in v1.0. A later plan adds them only after their owning specs expose stable identity and relationship semantics.
- **Runtime engine implementations.** This is a spec + conformance plan. TypeScript engine, Rust crate, Python tooling builders land in their own plans that consume this spec.
- **Studio review screen design.** Visual design and full Studio UX are product surface; only the composition contract lives here.
- **Query language.** Concept §11.4: "query language ... deferred." Predicates v1.0 are typed Python (or equivalent) functions on the edge list — not a query DSL.
- **TraceIndex versioning policy beyond `$formspecTrace: "1.0"`.** Semver for the schema lives with the schema; document-version migration semantics deferred until v1.1.
- **Builder performance, caching, or incremental update semantics.** Builder is deterministic; everything else is host policy.

---

## Self-Review Note

- **TraceIndex is a cache, not source of truth.** This must be stated in §1 prose AND in the JSON Schema `description` field. Hand-authoring is allowed only for fixtures and tests.
- **Stale rejection is invariant-level, not advisory.** Predicate execution against a stale index MUST raise an error. The pytest pins this without exceptions.
- **Source identity does not invent ids.** Experience and Response Actions lack top-level document ids. Trace uses `sourceRef` for source-file / host identity and records source-declared fields separately.
- **Canonical bytes are Trace-owned for source digests.** Unless a source spec defines canonical bytes for the whole artifact, Trace v1.0 uses RFC 8785 JCS over the full JSON artifact.
- **Edge endpoint identity uses current CRF anchor prefixes.** `item:applicantName`, `unit:identity`, and `action:submitApplication` reuse existing anchor vocabulary. `componentNodePath:` is Trace-owned.
- **Predicate set is minimal by design.** Concept §11.4 explicitly defers query-surface detail. Shipping three predicates that Studio review needs is honest scoping; shipping six predicates would require a non-existent consumer to justify the other three.
- **Composition contract is the load-bearing seam.** Studio review's success criterion is that Trace + the chosen review-record stream + EXP-COVERAGE compose without double-counting and without loss. The composition pytest must not pin a standalone merge-report shape.
- **Cold-read test:** a future agent reading this plan alone produces a conforming spec without referring to the concept note. Concept §6.12 predicate list is quoted verbatim in Task 6's spec-prose section; concept §5.4 cache disclaimer is quoted in Task 2.

---

## Task 1: Scaffold spec files

**Files:**
- Create: `specs/trace/trace-spec.md`
- Create: `specs/trace/trace-spec.bluf.md`

- [ ] **Step 1: Create spec directory and frontmatter scaffolds**

```bash
mkdir -p /Users/mikewolfd/Work/formspec-stack/formspec/specs/trace
```

Write `specs/trace/trace-spec.md` with this frontmatter and empty section headers (mirror `component-reference-fields-spec.md` style):

```markdown
---
title: Formspec Trace
version: 1.0.0-draft.1
date: 2026-05-22
status: draft
depends_on:
  - specs/component/component-spec.md
  - specs/component/component-reference-fields-spec.md
  - specs/experience/experience-spec.md
  - specs/response-actions/response-actions-spec.md
  - thoughts/specs/2026-05-20-formspec-semantic-layers.md
---

# Formspec Trace Specification

<!-- bluf:start -->
<!-- bluf:end -->

## Status of This Document

Draft. This specification is the canonical contract for the Formspec Trace artifact described in concept architecture note §6.12 / §10.6. Behavior described here is normative under BCP-14 keywords.

## Conventions and Terminology

The key words MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT, RECOMMENDED, MAY, and OPTIONAL in this document are to be interpreted as described in BCP-14 (RFC 2119, RFC 8174) when, and only when, they appear in all capitals, as shown here.

## Table of Contents

1. Introduction
2. The TraceIndex Document
3. Source Set and Identity
4. Canonical Digests
5. Edges
6. Predicates
7. Stale-Cache Rejection
8. Composition Contract
9. Schema
10. Conformance
11. Open Questions
```

Write `specs/trace/trace-spec.bluf.md` with placeholder BLUF stub (filled by Task 13's BLUF authoring step):

```markdown
- (BLUF — populated when §1–§10 prose lands.)
```

- [ ] **Step 2: Verify files exist**

```bash
ls /Users/mikewolfd/Work/formspec-stack/formspec/specs/trace/
```

Expected output (no `trace-spec.llm.md` yet — that is generated):

```
trace-spec.bluf.md
trace-spec.md
```

- [ ] **Step 3: Commit**

```bash
git -C /Users/mikewolfd/Work/formspec-stack/formspec commit specs/trace/trace-spec.md specs/trace/trace-spec.bluf.md -m "spec(trace): scaffold spec files (draft)"
```

Note: `scripts/spec-artifacts.config.json` and `tests/contracts/surface-coverage.json` registration deferred to Task 18, AFTER fixtures and pytests exist. This mirrors the regen-merge plan's repo-gate constraint — every configured spec/schema pair must have an enforced contract row pointing at existing proof surfaces.

---

## Task 2: Spec prose — §1 Introduction

**Files:**
- Modify: `specs/trace/trace-spec.md`

- [ ] **Step 1: Draft §1 prose**

Append §1 body covering purpose, scope, relationship, conformance posture, BCP-14 usage. Required content:

```markdown
## 1. Introduction

### 1.1 Purpose

Trace is a generated relationship index over the v1 source set: Definition, Experience, Response Actions, and Component. A `TraceIndex` document carries (a) the source set that produced it, identified by source identity plus canonical content digest, and (b) typed edges extracted from those sources. Predicates over the index answer the v1 first-consumer questions: which Component node renders which Definition item, which Experience unit collects which item, and which ActionButton invokes which Response Action.

Trace exists to make generated UI explainable, reviewable, and (in a future verifier consumer) verifiable. Its seed consumer is Studio regeneration review (concept §10.6): after Definition, Experience, or Response Actions changes, Studio composes Trace edges with per-cycle review records and Experience coverage findings to answer "what changed, what survived, what is now orphaned, what is uncovered."

### 1.2 Scope

This specification defines:

1. The `TraceIndex` document shape (§2).
2. The source-set declaration and per-artifact identity tuple (§3).
3. The canonical digest model (§4).
4. The closed v1 set of edge kinds and endpoint identity vocabulary (§5).
5. Predicate semantics for the first-consumer questions (§6).
6. The stale-cache rejection invariant (§7).
7. The composition contract with regeneration-review records, Component reference-resolution findings, and Experience coverage findings (§8).
8. The JSON Schema (§9).
9. Conformance levels (§10).

### 1.3 Out of Scope

- Query language. Predicates v1.0 are typed function signatures over the edge list (§6). Concept §11.4 defers query-language detail until a richer consumer emerges.
- Cross-projection verification. Concept §6.12 explicitly defers verification semantics until a formal predicate set, query model, source set, and named consumer exist. No verifier predicate ships in v1.0.
- Materialization storage. Hosts MAY store TraceIndex inline, as a sibling file, as a database row, or otherwise. The spec defines only the document shape and the rules a stored TraceIndex must satisfy.
- Builder performance, caching, or incremental update. Builders MUST be deterministic; everything else is host policy.
- Runtime engine implementations. Spec + conformance only; engines land in their own plans.

### 1.4 Trace Is a Cache, Not a Source of Truth

A materialized `TraceIndex` document is a CACHE, not authored truth. Concept §5.4: "A materialized Trace is a cache, not a source of truth." Implementations MUST NOT treat a TraceIndex as authority — every predicate execution MUST verify the index is fresh against the supplied source artifacts (§7). Hand-authored TraceIndex documents are non-conforming for production use; they are permitted only for fixtures and tests.

### 1.5 Relationship to Other Specifications

| Spec | Relationship |
|---|---|
| Definition (`core/spec.md`) | Source artifact. Definition owns the item identity space behind `item:` endpoints. |
| Experience (`experience/experience-spec.md`) | Source artifact. Trace extracts `unit-collects-item` edges. Coverage findings are NOT owned by Trace — they remain owned by the Experience coverage resolver (EXP §10), composed at the Studio review surface (§8). |
| Response Actions (`response-actions/response-actions-spec.md`) | Source artifact when supplied. Response Actions owns the action identity space behind `action:` endpoints; Trace does not invent a submission edge. |
| Component (`component/component-spec.md`) | Source artifact. Trace extracts `component-renders-item` edges from `bind` and `trigger-invokes-action` edges from `ActionButton.actionRef`. Regeneration provenance remains owned by the regeneration-review route. |
| Component Reference Fields (`component/component-reference-fields-spec.md`) | Anchor-prefix vocabulary (`item:`, `unit:`, `task:`, `action:`, `concept:`) is reused by Trace endpoints (§5.2). Resolver findings (`COMP-REFERENTIAL-INTEGRITY`) are NOT duplicated in Trace; Studio composes them (§8). |
| Regeneration Merge (`component/regeneration-merge-spec.md` — when landed) | Orthogonal. Trace is the static relationship index; the chosen regeneration-review route supplies per-cycle review records. Studio composes both (§8). Trace's schema and predicates do NOT reference RegenMerge constructs. |
| Concept architecture note (`thoughts/specs/2026-05-20-formspec-semantic-layers.md`) | Design motivation only. §6.12 sketches predicate questions; §10.6 names Studio regeneration review as the seed consumer; §11.4 defers query-surface detail. Trace conformance comes from this spec, its schema, and its fixtures. |

### 1.6 Conformance Posture

Three conformance levels are defined in §10. A conforming runtime MUST satisfy all three levels. Schema-validity of TraceIndex documents (Level 2) is necessary but not sufficient — predicate behavior (Level 1) and the stale-rejection invariant (Level 3) MUST also hold.
```

- [ ] **Step 2: Commit**

```bash
git -C /Users/mikewolfd/Work/formspec-stack/formspec commit specs/trace/trace-spec.md -m "spec(trace): §1 introduction"
```

---

## Task 3: Spec prose — §2 The TraceIndex Document

**Files:**
- Modify: `specs/trace/trace-spec.md`

- [ ] **Step 1: Draft §2 prose**

Append:

```markdown
## 2. The TraceIndex Document

### 2.1 Document Shape

A TraceIndex document is a JSON object with three required top-level members:

```json
{
  "$formspecTrace": "1.0",
  "sources": [ ... ],
  "edges": [ ... ]
}
```

`$formspecTrace` is a closed-version marker. v1.0 is the only conforming value for this specification. Future minor versions MAY add optional members; major versions MAY change the closed set of edge kinds.

### 2.2 Generated, Not Authored

The TraceIndex is a generated artifact. A conforming builder consumes a defined source set (§3) and emits the TraceIndex deterministically (§5.3). Hand-authoring a TraceIndex is permitted ONLY for fixtures and tests; hand-authored TraceIndex documents stored as production data are non-conforming.

A TraceIndex document carries no authorial intent that cannot be recovered from its sources. If the sources change, the TraceIndex MUST be rebuilt; the stale-rejection invariant (§7) prevents reuse.

### 2.3 No Member Outside the Defined Shape

A conforming TraceIndex MUST NOT contain top-level members other than `$formspecTrace`, `sources`, `edges`. A conforming `sources[]` entry MUST NOT contain members outside §3.2. A conforming `edges[]` entry MUST NOT contain members outside §5.4. (Strict additivity preserves the closed-set invariant; future versions opt new members in by version bump.)

### 2.4 No Mutation After Build

Builders MUST emit a finished TraceIndex as an immutable JSON value. Once written, a TraceIndex MUST NOT be mutated in place by predicate execution, composition, or any consumer. Predicates are pure functions over the index (§6.3).
```

- [ ] **Step 2: Commit**

```bash
git -C /Users/mikewolfd/Work/formspec-stack/formspec commit specs/trace/trace-spec.md -m "spec(trace): §2 document shape"
```

---

## Task 4: Spec prose — §3 Source Set and Identity

**Files:**
- Modify: `specs/trace/trace-spec.md`

- [ ] **Step 1: Draft §3 prose**

Append:

```markdown
## 3. Source Set and Identity

### 3.1 Required Declaration

A TraceIndex MUST declare every source artifact that the builder inspected in `sources[]`. Inspection means: the builder read the artifact and walked it for edge extraction (§5). A source artifact that the builder inspected but extracted zero edges from MUST still appear in `sources[]` — the declaration records that the source was considered, which is meaningful for stale rejection (§7).

A source artifact that the builder did NOT inspect MUST NOT appear in `sources[]`. (Listing an uninspected source would falsely tie the index to that artifact's digest.)

### 3.2 Source Entry Shape

Each entry in `sources[]` is a JSON object with these required members:

```json
{
  "kind": "<source kind>",
  "identity": { ... },
  "digest": "sha256:<lowercase-hex>"
}
```

| Field | Type | Description |
|---|---|---|
| `kind` | string, closed enum | One of `definition`, `experience`, `responseActions`, `component`. |
| `identity` | object | Identity tuple per §3.3. Shape varies by `kind`. |
| `digest` | string | Canonical content digest per §4. |

No other members are permitted.

### 3.3 Identity Tuple by Kind

| Kind | Identity members | Source |
|---|---|---|
| `definition` | `{ url: string, version: string }` | Core spec declares Definition identity as `(url, version)`. |
| `experience` | `{ sourceRef: string, targetDefinitionUrl: string, version: string }` | Experience declares `targetDefinition.url` and `version`; `sourceRef` is the builder/host locator for the concrete sidecar document. |
| `responseActions` | `{ sourceRef: string, targetDefinitionUrl: string, version: string }` | Response Actions declares `targetDefinition.url` and `version`; `sourceRef` is the builder/host locator for the concrete sidecar document. |
| `component` | `{ sourceRef: string, targetDefinitionUrl: string, version: string, url?: string }` | Component declares `version`, `targetDefinition.url`, and optional `url`; `sourceRef` identifies the concrete Component document when `url` is absent or not unique enough for the host. |

Identity tuples are closed per kind. A field not listed for that kind is non-conforming; in particular, Trace MUST NOT accept a sidecar `"id"` as a substitute for `sourceRef`.

`sourceRef` is not a semantic id inside the source artifact. It is the stable locator the builder used to load the artifact, such as a project-relative path, content-store handle, database row id, or host URI. Trace records it because several current sidecar specs do not define top-level document ids.

### 3.4 Duplicate Sources Forbidden

A TraceIndex MUST NOT contain two `sources[]` entries with the same `(kind, identity)` pair. If a builder needs to record a multi-document source (e.g., several Experience or Component documents), it emits one entry per document. Duplicate `(kind, identity)` is a builder bug; consumers MAY reject such indices.

### 3.5 Source Ordering

`sources[]` entries MUST appear in deterministic order. The required order is the lexicographic sort of `(kind, identity-canonical-json)` ascending. This makes byte-equality of two same-input TraceIndex documents possible.
```

- [ ] **Step 2: Commit**

```bash
git -C /Users/mikewolfd/Work/formspec-stack/formspec commit specs/trace/trace-spec.md -m "spec(trace): §3 source set + identity"
```

---

## Task 5: Spec prose — §4 Canonical Digests

**Files:**
- Modify: `specs/trace/trace-spec.md`

- [ ] **Step 1: Draft §4 prose**

Append:

```markdown
## 4. Canonical Digests

### 4.1 Hash Function

Source digests in `sources[*].digest` MUST be computed with SHA-256. The encoded form is `sha256:<lowercase-hex>` where `<lowercase-hex>` is the 64-character lowercase hexadecimal encoding of the 32-byte SHA-256 output. Uppercase hex, base64, or multibase encodings are non-conforming for the wire form (implementations MAY use alternative encodings internally).

### 4.2 Canonical Bytes

The bytes hashed for `digest` MUST be the canonical serialization of the whole source artifact. Definition, Experience, Response Actions, and Component do not currently define per-artifact canonical bytes for this purpose. Trace v1.0 therefore defines the source-digest canonicalization profile for those artifacts.

For source kinds without an authoritative canonical form, the canonical bytes are the artifact's JSON document serialized via JSON Canonicalization Scheme (RFC 8785). Implementations MUST NOT introduce alternative canonicalizations (sorted-keys variants, whitespace-stripping ad-hoc rules) for v1.0. If a source spec later defines canonical bytes for the whole artifact, a future Trace version may adopt that source-owned profile explicitly.

### 4.3 Digest Includes the Whole Artifact

The digest covers the entire source artifact, not just the portions Trace extracted edges from. This is what gives stale rejection (§7) its safety property: any change to any byte of a source artifact invalidates the digest and prevents reuse of indices built before the change.

### 4.4 No Digest of TraceIndex Itself

A conforming TraceIndex document does NOT carry a self-digest. Self-digests are out of scope for v1.0; if hosts need an addressable TraceIndex handle, they compute it outside the document. (Self-digesting introduces serialization-order dependencies that the spec is not yet ready to commit to.)
```

- [ ] **Step 2: Commit**

```bash
git -C /Users/mikewolfd/Work/formspec-stack/formspec commit specs/trace/trace-spec.md -m "spec(trace): §4 canonical digests"
```

---

## Task 6: Spec prose — §5 Edges

**Files:**
- Modify: `specs/trace/trace-spec.md`

- [ ] **Step 1: Draft §5 prose with the three v1 edge kinds**

Append:

```markdown
## 5. Edges

### 5.1 Closed v1 Edge Set

Concept §6.12 sketches six possible questions. v1.0 ships only the edge kinds grounded in current sibling specs:

| Edge kind | Question | Source artifact | Endpoint identity |
|---|---|---|---|
| `component-renders-item` | Which Component node renders which item? | Component | `componentNodePath` (RFC 6901 JSON Pointer into the Component tree), `item:<itemPath>` |
| `unit-collects-item` | Which Experience unit collects which item? | Experience | `unit:<unitId>`, `item:<itemPath>` |
| `trigger-invokes-action` | Which ActionButton invokes which Response Action? | Component (ActionButton), with Response Actions as the action identity owner when supplied | `componentNodePath` (the ActionButton node), `action:<actionId>` |

Builders MUST emit edges of every kind for which at least one matching relationship exists in the inspected sources. Builders MUST NOT emit edges of other kinds; the enum is CLOSED.

### 5.2 Endpoint Identity Vocabulary

Endpoints use typed string prefixes:

| Prefix | Meaning |
|---|---|
| `item:<path>` | Definition item, identified by its dotted path (Core item path syntax). |
| `unit:<id>` | Experience unit, identified by its `id`. |
| `action:<id>` | Response Action, identified by its `id`. |
| `componentNodePath:<jsonPointer>` | Component tree node, identified by RFC 6901 JSON Pointer. |

Anchor prefixes `item:`, `unit:`, and `action:` are CRF §5.2 reuses, NOT redefinitions. `componentNodePath:` is Trace-introduced typed-string vocabulary because Component node `id` is optional.

### 5.3 Edge Determinism

Edge extraction MUST be deterministic. For a given source set, two conforming builders MUST produce the same `edges[]` (modulo ordering, which is fixed in §5.5).

For ambiguous source data (e.g., a Component with two `ActionButton`s bound to the same `actionRef`), the builder MUST emit one edge per matching relationship — duplicates are permitted if and only if both endpoints differ at least in one position. Two `edges[]` entries with byte-equal JSON serialization are forbidden (deduplicate before emission).

### 5.4 Edge Entry Shape

Each entry in `edges[]` is a JSON object with these required members:

```json
{
  "kind": "<edge kind>",
  "endpoints": [ "<typed-string>", "<typed-string>", ... ]
}
```

| Field | Type | Description |
|---|---|---|
| `kind` | string, closed enum | One of the three kinds in §5.1. |
| `endpoints` | array of typed strings | At least two endpoints. Per-kind endpoint count and ordering pinned in §5.6. |

No other members are permitted.

### 5.5 Edge Ordering

`edges[]` entries MUST appear in deterministic order. The required order is:

1. Ascending lexicographic by `kind`.
2. Within the same `kind`, ascending lexicographic by the canonical-JSON serialization of `endpoints[]`.

This makes byte-equality of two same-input TraceIndex documents possible.

### 5.6 Per-Kind Endpoint Schema

For each edge kind, `endpoints[]` MUST contain exactly the typed-string positions listed below, in the order listed:

| Edge kind | endpoints[] (ordered) |
|---|---|
| `component-renders-item` | `[componentNodePath:<jsonPointer>, item:<itemPath>]` |
| `unit-collects-item` | `[unit:<unitId>, item:<itemPath>]` |
| `trigger-invokes-action` | `[componentNodePath:<jsonPointer>, action:<actionId>]` |

A conforming builder MUST emit edges in exactly this endpoint shape and order. Validators MAY reject edges whose endpoint ordering or typed-string prefix does not match the declared kind.
```

- [ ] **Step 2: Commit**

```bash
git -C /Users/mikewolfd/Work/formspec-stack/formspec commit specs/trace/trace-spec.md -m "spec(trace): §5 edges + endpoint vocabulary"
```

---

## Task 7: Spec prose — §6 Predicates

**Files:**
- Modify: `specs/trace/trace-spec.md`

- [ ] **Step 1: Draft §6 prose with the three v1.0 predicates**

Append:

```markdown
## 6. Predicates

### 6.1 v1.0 Predicate Set

Three predicates ship in v1.0, sized to the first-consumer (Studio regeneration review) needs. Reverse queries and any future predicates over Mapping, References, Respondent Ledger, submission, task, or concept edges are DEFERRED to a future minor version per concept §11.4 ("predicate names ... deferred until the named consumer needs them").

| Predicate | Signature | Returns |
|---|---|---|
| `componentNodesForItem` | `(traceIndex, itemPath: string) -> componentNodePath[]` | All `componentNodePath` endpoints from `component-renders-item` edges whose `item:` endpoint equals `item:<itemPath>`. Sorted ascending lexicographically. Empty array if no match. |
| `unitsForItem` | `(traceIndex, itemPath: string) -> unitId[]` | All `unit:` endpoint suffixes (`<unitId>` portion only) from `unit-collects-item` edges whose `item:` endpoint equals `item:<itemPath>`. Sorted ascending lexicographically. Empty array if no match. Deduplicate. |
| `actionForTrigger` | `(traceIndex, componentNodePath: string) -> actionId \| null` | The `action:` endpoint suffix (`<actionId>` portion only) from the unique `trigger-invokes-action` edge whose `componentNodePath:` endpoint equals `componentNodePath:<jsonPointer>`. `null` if no match. If more than one matching edge exists, the TraceIndex is malformed (§5.3 forbids it); predicates MAY raise an error or return `null` — implementations MUST be consistent. |

### 6.2 Pure Functions

Predicates are pure functions over the (TraceIndex, args) input pair. They MUST NOT mutate the TraceIndex; they MUST NOT cache results across calls in a way that prevents re-execution from producing identical outputs.

### 6.3 Determinism

For the same `(TraceIndex, predicate, args)`, every conforming implementation MUST return byte-identical output (modulo equivalent JSON representations). Sort order is fixed; deduplication is fixed (§6.1).

### 6.4 Stale-First Execution

Every predicate execution MUST verify the TraceIndex is fresh (§7) BEFORE returning. A stale TraceIndex MUST cause the predicate to fail with the defined stale error (§7.2). Predicates MUST NOT return partial results for stale indices.

A host that has independently verified freshness MAY skip the per-call check ONLY if the verification result is structurally tied to the same `sources[]` digests the TraceIndex carries; implementations SHOULD provide an explicit `predicate(traceIndex, args, freshness=Fresh)` overload rather than a global toggle.

### 6.5 v1.1 Predicate Reservations

A future minor version MAY add the following predicates (non-exhaustive list, recorded here so consumers know what is on deck):

- `itemsForUnit(traceIndex, unitId) -> itemPath[]` (reverse of `unitsForItem`)
- `triggersForAction(traceIndex, actionId) -> componentNodePath[]` (reverse of `actionForTrigger`)
- `itemsForAction(traceIndex, actionId) -> itemPath[]`
- future Mapping / References / Respondent Ledger predicates only after those edge families are admitted

These predicates are NOT part of v1.0 conformance. Implementations MAY ship them; they MUST NOT be called "Trace v1.0 conformant" predicates.
```

- [ ] **Step 2: Commit**

```bash
git -C /Users/mikewolfd/Work/formspec-stack/formspec commit specs/trace/trace-spec.md -m "spec(trace): §6 predicates"
```

---

## Task 8: Spec prose — §7 Stale-Cache Rejection

**Files:**
- Modify: `specs/trace/trace-spec.md`

- [ ] **Step 1: Draft §7 prose**

Append:

```markdown
## 7. Stale-Cache Rejection

### 7.1 The Invariant

A TraceIndex is FRESH against a set of source artifacts iff:

1. Every entry in `traceIndex.sources[]` corresponds to a supplied source artifact matching on `(kind, identity)`.
2. For each such correspondence, the supplied artifact's canonical digest (computed per §4) equals `traceIndex.sources[i].digest`.

Otherwise the TraceIndex is STALE.

### 7.2 The Rejection Rule

Predicate execution MUST verify freshness BEFORE returning any result. On stale, the predicate MUST raise an error rather than return partial or best-effort results. The error MUST carry enough information for the consumer to diagnose which source(s) caused the staleness:

```
TraceStaleError {
  reason: "source-missing" | "digest-mismatch" | "extra-source-present",
  source: { kind: string, identity: object }
}
```

| Reason | Meaning |
|---|---|
| `source-missing` | `traceIndex.sources[i]` has no matching supplied artifact (the source was removed or not provided). |
| `digest-mismatch` | A supplied artifact's digest differs from the TraceIndex's recorded digest (the source changed since the index was built). |
| `extra-source-present` | A supplied artifact has no corresponding `traceIndex.sources[]` entry. This is staleness because Trace was built against a different source set; the index does not reflect what the caller intends to query. |

Hosts MAY downgrade `extra-source-present` to a warning if they want Trace queries to operate over a strict subset of the supplied sources; doing so is NON-CONFORMING with the v1.0 strict-equality rule. A non-conforming relaxation MUST be documented and MUST NOT be presented as a conforming Trace implementation.

### 7.3 No Repair Path

A stale TraceIndex MUST NOT be repaired by predicate execution (e.g., by re-fetching a source). Repair is the builder's job. Predicates that detect staleness fail; the consumer responds by rebuilding the index.

### 7.4 Why Rejection, Not Best-Effort

Concept §6.12: "A materialized Trace must carry input digests and must be rejected as stale when any input digest changes."

The rejection rule exists because Trace's value is its trustworthiness as a relationship index. A best-effort Trace (return what we can, warn about the rest) silently leaks stale relationships into Studio review, producing wrong "what changed" diffs. Rejection forces a rebuild; rebuild is cheap (sources are local).
```

- [ ] **Step 2: Commit**

```bash
git -C /Users/mikewolfd/Work/formspec-stack/formspec commit specs/trace/trace-spec.md -m "spec(trace): §7 stale-cache rejection"
```

---

## Task 9: Spec prose — §8 Composition Contract

**Files:**
- Modify: `specs/trace/trace-spec.md`

- [ ] **Step 1: Draft §8 prose**

Append:

```markdown
## 8. Composition Contract

### 8.1 Studio Regeneration Review Is the First Consumer

Concept §6.12 / §10.6 names Studio regeneration review as the first consumer. Studio review needs to display, for a regeneration cycle:

1. Which Component nodes changed, and which designer edits survived.
2. Which Component nodes became orphaned.
3. Which required items lack Experience coverage.
4. For every visible node, what source artifact relationships explain its presence (which item it binds, which unit it serves, which action it invokes).

Items 1–2 come from the chosen regeneration-review route. That route may be the standalone RegenMerge surface or an MCP/ProposalManager command-stream review surface, but it MUST expose a stable review subject handle before this composition contract can claim conformance. Item 3 comes from the Experience coverage resolver (`EXP-COVERAGE-UNCOVERED-REQUIRED-ITEM` per EXP §8.2). Item 4 is Trace.

### 8.2 Trace Owns Only the Relationship Index

Trace owns NO findings:

- NO regeneration-review findings — those live with the chosen regeneration-review surface.
- NO coverage findings — those live with the Experience resolver.
- NO reference-resolution findings — those live with the CRF §6 cross-document resolver.

Trace owns the typed edge list and the predicates over it. When Studio displays an orphan, it composes the route-owned orphan finding WITH the Trace edges that point to or from that node. The finding says "this review subject is orphaned"; Trace edges say "this node renders item:applicantName, was collected by unit:identity, was invoked by trigger /tree/children/3."

### 8.3 The Composition Rule

A Studio review surface MUST compose:

| Stream | Source | Joined to Trace by |
|---|---|---|
| Regeneration-review records | Route-owned records from the selected regeneration-review route | `subject.componentNodePath` ↔ Trace `componentNodePath` endpoints |
| Reference-resolution findings | CRF §6 resolver `findings[]` | finding's affected Component node path ↔ Trace `componentNodePath` endpoints |
| Coverage findings | EXP coverage resolver `findings[]` of code `EXP-COVERAGE-UNCOVERED-REQUIRED-ITEM` | finding's `path` (Definition item path) ↔ Trace `item:<path>` endpoints, then to `componentNodePath` via `component-renders-item` edges |

The two-hop EXP composition is item-path -> `item:` endpoint -> `componentNodePath` endpoint. If the chosen regeneration-review route records item anchors but not Component node handles, it MAY use this two-hop join for coverage context. If the route records neither Component node handles nor item anchors, §8 composition conformance cannot land.

### 8.4 No Double-Counting

A composition surface MUST NOT count the same finding twice. The composition rule is data-driven: each finding or review record has exactly one originating stream; Trace edges are reference data for displaying that finding contextually, not a finding stream themselves.

### 8.5 Robust to Merge-Route Change

Trace's composition contract is written in terms of "the route-owned regeneration-review record," not in terms of any specific merge-report shape. If regeneration-merge relocates from a standalone three-way merge to an MCP/ProposalManager command-stream review, the join rule binds to that route's review subject handle. The Trace schema and predicates do NOT change, but §8 conformance remains blocked until the route exposes a stable Component node handle or explicit item-path handle.
```

- [ ] **Step 2: Commit**

```bash
git -C /Users/mikewolfd/Work/formspec-stack/formspec commit specs/trace/trace-spec.md -m "spec(trace): §8 composition contract"
```

---

## Task 10: Spec prose — §9 Schema + §10 Conformance + §11 Open Questions

**Files:**
- Modify: `specs/trace/trace-spec.md`

- [ ] **Step 1: Draft §9 + §10 + §11 prose**

Append:

```markdown
## 9. Schema

The canonical JSON Schema for TraceIndex is `schemas/trace-index.schema.json`. The schema enforces:

- `$formspecTrace` const `"1.0"`.
- `sources[]` ordering, identity-tuple shape per kind, digest pattern.
- `edges[]` ordering, closed v1 kind enum, per-kind endpoint count and prefix.
- No additional top-level, sources-entry, or edges-entry members.

Schema-validity is necessary but not sufficient for conformance — predicate behavior (§6) and the stale-rejection invariant (§7) are also load-bearing.

## 10. Conformance

### 10.1 Conformance Levels

A conforming Trace implementation MUST satisfy all three levels.

**Level 1 — Builder determinism.** For the same source set (same canonical bytes of every source artifact), every conforming builder produces a byte-identical TraceIndex document.

**Level 2 — Index validity.** Every produced TraceIndex validates against `trace-index.schema.json`.

**Level 3 — Predicate behavior + stale rejection.** Predicates §6.1 return the values specified for every fixture in `tests/conformance/fixtures/trace/`. Predicate execution against a stale index raises the §7.2 `TraceStaleError` with the correct reason; partial results are forbidden.

### 10.2 Conformance Prohibitions

A conforming implementation MUST NOT:

- Emit edge kinds outside the v1.0 closed set (§5.1).
- Emit endpoints outside the v1.0 typed-string vocabulary (§5.2).
- Treat hand-authored TraceIndex documents as production-conforming (§1.4).
- Return partial predicate results for stale indices (§7.2).
- Mutate inputs (§2.4).
- Carry regeneration-review findings, coverage findings, or reference-resolution findings inside TraceIndex (§8.2).

### 10.3 Conformance Composition With Other Specs

A Studio-grade review surface that composes Trace with other streams MUST follow the join rules in §8.3 and the no-double-count rule in §8.4. These are conformance requirements ON THE COMPOSING SURFACE, not on Trace itself; Trace's conformance ends at producing the index and running predicates.

## 11. Open Questions

- **Cross-projection verification.** Concept §6.12 defers; no verifier consumer has emerged. When one does, this section opens.
- **Predicate reverse queries** (`itemsForUnit`, `triggersForAction`, etc.) wait on a consumer that drives detail. Studio review v1.0 needs only the §6.1 set.
- **TraceIndex self-digest.** Hosts that need an addressable handle compute it externally for v1.0. Adding a self-digest to TraceIndex is a v1.1 candidate if storage/distribution patterns demand it.
- **Builder caching / incremental update.** Out of scope. Builders are deterministic; incremental construction is a host concern.
- **Deferred edge families.** Mapping, References, Respondent Ledger, submission, task, and concept relationship edges wait until their owning specs publish stable identity and relationship semantics.
- **Predicates returning Trace-derived findings** (e.g., "Component nodes whose items are not in any unit"). These are so close to coverage findings that they will collide if introduced — wait until coverage's surface is fully mature before opening this.
```

- [ ] **Step 2: Commit**

```bash
git -C /Users/mikewolfd/Work/formspec-stack/formspec commit specs/trace/trace-spec.md -m "spec(trace): §9–§11 schema/conformance/open questions"
```

---

## Task 11: Author TraceIndex schema

**Files:**
- Create: `schemas/trace-index.schema.json`

- [ ] **Step 1: Write schema**

Write `schemas/trace-index.schema.json`:

```json
{
  "$id": "https://formspec.org/schemas/trace-index/1.0",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Formspec TraceIndex",
  "description": "Generated relationship index over Formspec source artifacts. A TraceIndex is a CACHE per concept §5.4 — predicate execution MUST verify input digests against the supplied sources and reject stale indices (§7). Hand-authored TraceIndex documents are non-conforming for production use; they are permitted only for fixtures and tests.",
  "type": "object",
  "required": ["$formspecTrace", "sources", "edges"],
  "additionalProperties": false,
  "properties": {
    "$formspecTrace": { "const": "1.0" },
    "sources": {
      "type": "array",
      "items": { "$ref": "#/$defs/SourceEntry" },
      "description": "Source artifacts the builder inspected. Ordered ascending by (kind, identity-canonical-json). Duplicate (kind, identity) forbidden (§3.4)."
    },
    "edges": {
      "type": "array",
      "items": { "$ref": "#/$defs/EdgeEntry" },
      "description": "Typed relationship edges. Ordered ascending by (kind, endpoints-canonical-json). Byte-equal entries forbidden (§5.3)."
    }
  },
  "$defs": {
    "Sha256Digest": {
      "type": "string",
      "pattern": "^sha256:[0-9a-f]{64}$"
    },
    "DefinitionIdentity": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "url": { "type": "string", "format": "uri" },
        "version": { "type": "string", "minLength": 1 }
      },
      "required": ["url", "version"],
      "description": "Definition source identity per §3.3."
    },
    "SidecarSourceIdentity": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "sourceRef": { "type": "string", "minLength": 1 },
        "targetDefinitionUrl": { "type": "string", "format": "uri" },
        "version": { "type": "string", "minLength": 1 }
      },
      "required": ["sourceRef", "targetDefinitionUrl", "version"],
      "description": "Experience and Response Actions source identity per §3.3."
    },
    "ComponentSourceIdentity": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "sourceRef": { "type": "string", "minLength": 1 },
        "targetDefinitionUrl": { "type": "string", "format": "uri" },
        "version": { "type": "string", "minLength": 1 },
        "url": { "type": "string", "format": "uri" }
      },
      "required": ["sourceRef", "targetDefinitionUrl", "version"],
      "description": "Component source identity per §3.3."
    },
    "SourceEntry": {
      "type": "object",
      "required": ["kind", "identity", "digest"],
      "additionalProperties": false,
      "properties": {
        "kind": {
          "enum": ["definition", "experience", "responseActions", "component"]
        },
        "identity": { "type": "object" },
        "digest": { "$ref": "#/$defs/Sha256Digest" }
      },
      "allOf": [
        {
          "if": { "properties": { "kind": { "const": "definition" } }, "required": ["kind"] },
          "then": {
            "properties": {
              "identity": { "$ref": "#/$defs/DefinitionIdentity" }
            }
          }
        },
        {
          "if": { "properties": { "kind": { "const": "experience" } }, "required": ["kind"] },
          "then": {
            "properties": {
              "identity": { "$ref": "#/$defs/SidecarSourceIdentity" }
            }
          }
        },
        {
          "if": { "properties": { "kind": { "const": "responseActions" } }, "required": ["kind"] },
          "then": {
            "properties": {
              "identity": { "$ref": "#/$defs/SidecarSourceIdentity" }
            }
          }
        },
        {
          "if": { "properties": { "kind": { "const": "component" } }, "required": ["kind"] },
          "then": {
            "properties": {
              "identity": { "$ref": "#/$defs/ComponentSourceIdentity" }
            }
          }
        }
      ]
    },
    "EdgeEntry": {
      "type": "object",
      "required": ["kind", "endpoints"],
      "additionalProperties": false,
      "properties": {
        "kind": {
          "enum": [
            "component-renders-item",
            "unit-collects-item",
            "trigger-invokes-action"
          ]
        },
        "endpoints": {
          "type": "array",
          "minItems": 2,
          "maxItems": 2,
          "items": { "$ref": "#/$defs/TypedEndpoint" }
        }
      },
      "allOf": [
        {
          "if": { "properties": { "kind": { "const": "component-renders-item" } }, "required": ["kind"] },
          "then": {
            "properties": {
              "endpoints": {
                "prefixItems": [
                  { "pattern": "^componentNodePath:/" },
                  { "pattern": "^item:" }
                ]
              }
            }
          }
        },
        {
          "if": { "properties": { "kind": { "const": "unit-collects-item" } }, "required": ["kind"] },
          "then": {
            "properties": {
              "endpoints": {
                "prefixItems": [
                  { "pattern": "^unit:" },
                  { "pattern": "^item:" }
                ]
              }
            }
          }
        },
        {
          "if": { "properties": { "kind": { "const": "trigger-invokes-action" } }, "required": ["kind"] },
          "then": {
            "properties": {
              "endpoints": {
                "prefixItems": [
                  { "pattern": "^componentNodePath:/" },
                  { "pattern": "^action:" }
                ]
              }
            }
          }
        }
      ]
    },
    "TypedEndpoint": {
      "type": "string",
      "pattern": "^(item|unit|action|componentNodePath):.+$"
    }
  }
}
```

- [ ] **Step 2: Validate JSON syntax**

```bash
cd /Users/mikewolfd/Work/formspec-stack/formspec
node -e 'JSON.parse(require("fs").readFileSync("schemas/trace-index.schema.json", "utf8")); console.log("schema parses OK")'
```

Expected: `schema parses OK`

- [ ] **Step 3: Commit**

```bash
git -C /Users/mikewolfd/Work/formspec-stack/formspec commit schemas/trace-index.schema.json -m "schema(trace): trace-index.schema.json v1.0"
```

---

## Task 12: Author base fixture — `grant-application-identity`

**Files:**
- Create: `tests/conformance/fixtures/trace/grant-application-identity/definition.json`
- Create: `tests/conformance/fixtures/trace/grant-application-identity/experience.json`
- Create: `tests/conformance/fixtures/trace/grant-application-identity/response-actions.json`
- Create: `tests/conformance/fixtures/trace/grant-application-identity/component.json`
- Create: `tests/conformance/fixtures/trace/grant-application-identity/expected-index.json`
- Create: `tests/conformance/fixtures/trace/grant-application-identity/expected-predicates.json`

This is the canonical happy-path fixture exercising all three v1.0 predicates with a minimal but realistic source set.

- [ ] **Step 1: Create fixture directory**

```bash
mkdir -p /Users/mikewolfd/Work/formspec-stack/formspec/tests/conformance/fixtures/trace/grant-application-identity
```

- [ ] **Step 2: Write `definition.json`**

```json
{
  "$formspec": "1.0",
  "url": "https://example.gov/forms/intake",
  "version": "1.0.0",
  "status": "draft",
  "title": "Intake",
  "items": [
    { "key": "applicantName", "type": "field", "dataType": "string", "label": "Applicant name" },
    { "key": "dateOfBirth", "type": "field", "dataType": "date", "label": "Date of birth" }
  ],
  "binds": [
    { "path": "applicantName", "required": "true" },
    { "path": "dateOfBirth", "required": "true" }
  ]
}
```

- [ ] **Step 3: Write `experience.json`**

```json
{
  "$formspecExperience": "1.0",
  "name": "intake",
  "version": "1.0.0",
  "targetDefinition": { "url": "https://example.gov/forms/intake", "compatibleVersions": ">=1.0.0 <2.0.0" },
  "tasks": [ { "id": "identifyApplicant" } ],
  "units": [
    {
      "id": "identity",
      "kind": "data-entry",
      "taskRefs": ["identifyApplicant"],
      "itemRefs": [ { "path": "applicantName" }, { "path": "dateOfBirth" } ]
    }
  ]
}
```

- [ ] **Step 4: Write `response-actions.json`**

```json
{
  "$formspecResponseActions": "1.0",
  "version": "1.0.0",
  "targetDefinition": { "url": "https://example.gov/forms/intake", "compatibleVersions": ">=1.0.0 <2.0.0" },
  "actions": [
    {
      "id": "submitApplication",
      "intent": "submit",
      "effects": [
        { "type": "hostEvent", "eventName": "submitApplication" }
      ]
    }
  ]
}
```

- [ ] **Step 5: Write `component.json`**

```json
{
  "$formspecComponent": "1.1",
  "url": "https://example.gov/forms/intake/components/main",
  "version": "1.0.0",
  "targetDefinition": { "url": "https://example.gov/forms/intake", "compatibleVersions": ">=1.0.0 <2.0.0" },
  "tree": {
    "id": "root",
    "component": "Section",
    "unitRef": "identity",
    "children": [
      { "id": "nameInput", "component": "TextInput", "bind": "applicantName", "unitRef": "identity" },
      { "id": "dobInput", "component": "DatePicker", "bind": "dateOfBirth", "unitRef": "identity" },
      { "id": "submitBtn", "component": "ActionButton", "actionRef": "submitApplication" }
    ]
  }
}
```

- [ ] **Step 6: Write `expected-index.json`**

Digests are deterministic from canonical bytes; the Task 14 builder pytest computes them at runtime, so the fixture stores `"digest": "<computed>"` placeholders that the pytest substitutes before comparison. (Per RegenMerge precedent — fixtures store the structural shape; the harness fills runtime-determined values.)

```json
{
  "$formspecTrace": "1.0",
  "sources": [
    { "kind": "component",       "identity": { "sourceRef": "component.json", "targetDefinitionUrl": "https://example.gov/forms/intake", "version": "1.0.0", "url": "https://example.gov/forms/intake/components/main" }, "digest": "<computed>" },
    { "kind": "definition",      "identity": { "url": "https://example.gov/forms/intake", "version": "1.0.0" }, "digest": "<computed>" },
    { "kind": "experience",      "identity": { "sourceRef": "experience.json", "targetDefinitionUrl": "https://example.gov/forms/intake", "version": "1.0.0" }, "digest": "<computed>" },
    { "kind": "responseActions", "identity": { "sourceRef": "response-actions.json", "targetDefinitionUrl": "https://example.gov/forms/intake", "version": "1.0.0" }, "digest": "<computed>" }
  ],
  "edges": [
    { "kind": "component-renders-item",   "endpoints": ["componentNodePath:/tree/children/0", "item:applicantName"] },
    { "kind": "component-renders-item",   "endpoints": ["componentNodePath:/tree/children/1", "item:dateOfBirth"] },
    { "kind": "trigger-invokes-action",   "endpoints": ["componentNodePath:/tree/children/2", "action:submitApplication"] },
    { "kind": "unit-collects-item",       "endpoints": ["unit:identity", "item:applicantName"] },
    { "kind": "unit-collects-item",       "endpoints": ["unit:identity", "item:dateOfBirth"] }
  ]
}
```

- [ ] **Step 7: Write `expected-predicates.json`**

```json
{
  "componentNodesForItem": {
    "applicantName": ["componentNodePath:/tree/children/0"],
    "dateOfBirth":   ["componentNodePath:/tree/children/1"],
    "nonexistent":   []
  },
  "unitsForItem": {
    "applicantName": ["identity"],
    "dateOfBirth":   ["identity"],
    "nonexistent":   []
  },
  "actionForTrigger": {
    "/tree/children/2": "submitApplication",
    "/tree/children/0": null
  }
}
```

- [ ] **Step 8: Commit**

```bash
git -C /Users/mikewolfd/Work/formspec-stack/formspec add tests/conformance/fixtures/trace/grant-application-identity/
git -C /Users/mikewolfd/Work/formspec-stack/formspec commit -m "test(trace): grant-application-identity fixture"
```

---

## Task 13: Author secondary fixture — multi-unit

**Files:**
- Create: `tests/conformance/fixtures/trace/multi-unit/*` (Component with two units, two ActionButtons)

- [ ] **Step 1: Create `multi-unit` fixture**

This fixture proves predicate determinism with duplicate-source-item across units and proves `actionForTrigger` returns the expected action when multiple ActionButtons exist.

```bash
mkdir -p /Users/mikewolfd/Work/formspec-stack/formspec/tests/conformance/fixtures/trace/multi-unit
```

Write all six files (`definition.json`, `experience.json`, `response-actions.json`, `component.json`, `expected-index.json`, `expected-predicates.json`) following the same source-identity shape as `grant-application-identity` but with:

- Two units: `identity` and `consent`
- Two items each
- Two actions: `submitApplication`, `saveDraft`
- Component tree with both ActionButtons present
- No top-level `id` on Experience, Response Actions, or Component. Use `sourceRef` in the Trace source identity.

Use this Component shape (other source files follow same pattern):

```json
{
  "$formspecComponent": "1.1",
  "url": "https://example.gov/forms/intake/components/multi",
  "version": "1.0.0",
  "targetDefinition": { "url": "https://example.gov/forms/intake", "compatibleVersions": ">=1.0.0 <2.0.0" },
  "tree": {
    "id": "root",
    "component": "Section",
    "children": [
      { "id": "identitySection", "component": "Section", "unitRef": "identity", "children": [
        { "id": "n", "component": "TextInput", "bind": "applicantName", "unitRef": "identity" },
        { "id": "d", "component": "DatePicker", "bind": "dateOfBirth", "unitRef": "identity" }
      ]},
      { "id": "consentSection", "component": "Section", "unitRef": "consent", "children": [
        { "id": "c", "component": "Checkbox", "bind": "consentToTerms", "unitRef": "consent" }
      ]},
      { "id": "save", "component": "ActionButton", "actionRef": "saveDraft" },
      { "id": "submit", "component": "ActionButton", "actionRef": "submitApplication" }
    ]
  }
}
```

`expected-predicates.json` for `multi-unit`:

```json
{
  "componentNodesForItem": {
    "applicantName":  ["componentNodePath:/tree/children/0/children/0"],
    "dateOfBirth":    ["componentNodePath:/tree/children/0/children/1"],
    "consentToTerms": ["componentNodePath:/tree/children/1/children/0"]
  },
  "unitsForItem": {
    "applicantName":  ["identity"],
    "dateOfBirth":    ["identity"],
    "consentToTerms": ["consent"]
  },
  "actionForTrigger": {
    "/tree/children/2": "saveDraft",
    "/tree/children/3": "submitApplication"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git -C /Users/mikewolfd/Work/formspec-stack/formspec add tests/conformance/fixtures/trace/multi-unit/
git -C /Users/mikewolfd/Work/formspec-stack/formspec commit -m "test(trace): multi-unit fixture"
```

---

## Task 14: Write schema-shape pytest

**Files:**
- Create: `tests/conformance/spec/test_trace_index_schema.py`

- [ ] **Step 1: Write the failing test (red)**

```python
"""Schema-shape conformance for trace-index.schema.json."""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

REPO = Path(__file__).resolve().parents[3]
SCHEMA = REPO / "schemas" / "trace-index.schema.json"
FIXTURE_ROOT = REPO / "tests" / "conformance" / "fixtures" / "trace"


def _load(p: Path) -> dict:
    return json.loads(p.read_text())


@pytest.fixture(scope="module")
def validator() -> Draft202012Validator:
    schema = _load(SCHEMA)
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def _trace_fixture_dirs() -> list[Path]:
    return sorted(p for p in FIXTURE_ROOT.iterdir() if p.is_dir())


@pytest.mark.parametrize("fixture_dir", _trace_fixture_dirs(), ids=lambda p: p.name)
def test_expected_index_is_schema_valid(validator: Draft202012Validator, fixture_dir: Path) -> None:
    expected = _load(fixture_dir / "expected-index.json")
    # Fixture-stored digests use the "<computed>" placeholder; substitute a valid-shaped
    # digest before schema validation so the regex check passes.
    for src in expected["sources"]:
        if src["digest"] == "<computed>":
            src["digest"] = "sha256:" + ("0" * 64)
    errors = list(validator.iter_errors(expected))
    assert errors == [], f"{fixture_dir.name}: {[e.message for e in errors]}"


def test_extra_top_level_property_rejected(validator: Draft202012Validator) -> None:
    doc = {
        "$formspecTrace": "1.0",
        "sources": [],
        "edges": [],
        "extra": "rejected",
    }
    assert not validator.is_valid(doc)


def test_unknown_edge_kind_rejected(validator: Draft202012Validator) -> None:
    doc = {
        "$formspecTrace": "1.0",
        "sources": [],
        "edges": [{"kind": "unknown-kind", "endpoints": ["item:x", "unit:y"]}],
    }
    assert not validator.is_valid(doc)


def test_component_renders_item_endpoint_prefixes_enforced(validator: Draft202012Validator) -> None:
    doc = {
        "$formspecTrace": "1.0",
        "sources": [],
        "edges": [
            {"kind": "component-renders-item", "endpoints": ["item:applicantName", "componentNodePath:/tree"]}
        ],
    }
    assert not validator.is_valid(doc), "endpoints must be (componentNodePath, item) in that order"


def test_digest_pattern_enforced(validator: Draft202012Validator) -> None:
    doc = {
        "$formspecTrace": "1.0",
        "sources": [
            {"kind": "definition", "identity": {"url": "https://x", "version": "1.0.0"}, "digest": "md5:abc"}
        ],
        "edges": [],
    }
    assert not validator.is_valid(doc)


def test_sidecar_identity_rejects_fake_id(validator: Draft202012Validator) -> None:
    doc = {
        "$formspecTrace": "1.0",
        "sources": [{
            "kind": "responseActions",
            "identity": {"id": "actions", "version": "1.0.0"},
            "digest": "sha256:" + ("0" * 64),
        }],
        "edges": [],
    }
    assert not validator.is_valid(doc), "sidecar source identity must use sourceRef, not fake id"


def test_definition_identity_rejects_source_ref(validator: Draft202012Validator) -> None:
    doc = {
        "$formspecTrace": "1.0",
        "sources": [{
            "kind": "definition",
            "identity": {"url": "https://x", "version": "1.0.0", "sourceRef": "definition.json"},
            "digest": "sha256:" + ("0" * 64),
        }],
        "edges": [],
    }
    assert not validator.is_valid(doc), "definition identity is exactly url+version"


def test_version_marker_locked_to_1_0(validator: Draft202012Validator) -> None:
    doc = {"$formspecTrace": "0.9", "sources": [], "edges": []}
    assert not validator.is_valid(doc)
```

- [ ] **Step 2: Run pytest, expect PASS (the schema and fixtures are already in place from Tasks 11–13)**

```bash
cd /Users/mikewolfd/Work/formspec-stack/formspec
python3 -m pytest tests/conformance/spec/test_trace_index_schema.py -v
```

Expected: all tests pass.

If any test fails, the schema or fixtures are wrong — fix the schema (Task 11) or fixture (Task 12/13) before continuing.

- [ ] **Step 3: Commit**

```bash
git -C /Users/mikewolfd/Work/formspec-stack/formspec commit tests/conformance/spec/test_trace_index_schema.py -m "test(trace): schema-shape pytest"
```

---

## Task 15: Write predicate pytest

**Files:**
- Create: `tests/conformance/spec/test_trace_predicates.py`

- [ ] **Step 1: Write the inline reference builder + predicate harness + pytest**

```python
"""Trace predicate conformance.

Inline reference builder + predicate harness. The spec contract is what these
tests pin; engine implementations (Rust, TypeScript, Python tooling) consume
the same fixture set in their own pytest under their package directories.
"""

import hashlib
import json
from pathlib import Path
from typing import Optional

import pytest

REPO = Path(__file__).resolve().parents[3]
FIXTURE_ROOT = REPO / "tests" / "conformance" / "fixtures" / "trace"


def _load(p: Path) -> dict:
    return json.loads(p.read_text())


def _canonical_bytes(doc: dict) -> bytes:
    """Minimum RFC 8785-style canonicalization: sort keys, no whitespace, UTF-8."""
    return json.dumps(doc, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _digest(doc: dict) -> str:
    return "sha256:" + hashlib.sha256(_canonical_bytes(doc)).hexdigest()


# ---------------------------------------------------------------------------
# Reference builder (extracts edges per §5)
# ---------------------------------------------------------------------------

def _walk_component(node: dict, path: str, edges: list[dict]) -> None:
    if "bind" in node:
        edges.append({
            "kind": "component-renders-item",
            "endpoints": [f"componentNodePath:{path}", f"item:{node['bind']}"],
        })
    if node.get("component") == "ActionButton" and "actionRef" in node:
        edges.append({
            "kind": "trigger-invokes-action",
            "endpoints": [f"componentNodePath:{path}", f"action:{node['actionRef']}"],
        })
    for i, child in enumerate(node.get("children", []) or []):
        _walk_component(child, f"{path}/children/{i}", edges)


def _build_edges(srcs: dict[str, dict]) -> list[dict]:
    edges: list[dict] = []

    if "component" in srcs:
        _walk_component(srcs["component"]["tree"], "/tree", edges)

    if "experience" in srcs:
        for unit in srcs["experience"].get("units", []) or []:
            for item_ref in unit.get("itemRefs", []) or []:
                edges.append({
                    "kind": "unit-collects-item",
                    "endpoints": [f"unit:{unit['id']}", f"item:{item_ref['path']}"],
                })

    edges.sort(key=lambda e: (e["kind"], json.dumps(e["endpoints"], sort_keys=True)))
    return edges


def _source_kind_map() -> dict[str, str]:
    return {
        "definition.json": "definition",
        "experience.json": "experience",
        "response-actions.json": "responseActions",
        "component.json": "component",
    }


def _source_ref_for_kind(kind: str) -> str:
    for fname, mapped_kind in _source_kind_map().items():
        if mapped_kind == kind:
            return fname
    raise KeyError(kind)


def _identity(kind: str, doc: dict, source_ref: str | None = None) -> dict:
    if kind == "definition":
        return {"url": doc["url"], "version": doc["version"]}
    source_ref = source_ref or _source_ref_for_kind(kind)
    ident = {
        "sourceRef": source_ref,
        "targetDefinitionUrl": doc["targetDefinition"]["url"],
        "version": doc["version"],
    }
    if kind == "component" and "url" in doc:
        ident["url"] = doc["url"]
    return ident


def _build_index(fixture_dir: Path) -> tuple[dict, dict[str, dict]]:
    srcs: dict[str, dict] = {}
    sources_meta: list[dict] = []
    for fname, kind in _source_kind_map().items():
        path = fixture_dir / fname
        if not path.exists():
            continue
        doc = _load(path)
        srcs[kind] = doc
        sources_meta.append({
            "kind": kind,
            "identity": _identity(kind, doc, fname),
            "digest": _digest(doc),
        })

    sources_meta.sort(key=lambda s: (s["kind"], json.dumps(s["identity"], sort_keys=True)))
    edges = _build_edges(srcs)
    index = {"$formspecTrace": "1.0", "sources": sources_meta, "edges": edges}
    return index, srcs


# ---------------------------------------------------------------------------
# Predicates (§6.1)
# ---------------------------------------------------------------------------

class TraceStaleError(RuntimeError):
    def __init__(self, reason: str, source: dict):
        super().__init__(f"trace stale: {reason} for {source}")
        self.reason = reason
        self.source = source


def _verify_fresh(index: dict, srcs: dict[str, dict]) -> None:
    by_key = {(s["kind"], json.dumps(s["identity"], sort_keys=True)): s for s in index["sources"]}
    expected_keys = set()
    for kind, doc in srcs.items():
        ident = _identity(kind, doc)
        key = (kind, json.dumps(ident, sort_keys=True))
        expected_keys.add(key)
        if key not in by_key:
            raise TraceStaleError("extra-source-present", {"kind": kind, "identity": ident})
        if by_key[key]["digest"] != _digest(doc):
            raise TraceStaleError("digest-mismatch", {"kind": kind, "identity": ident})
    for key, entry in by_key.items():
        if key not in expected_keys:
            raise TraceStaleError("source-missing", {"kind": entry["kind"], "identity": entry["identity"]})


def component_nodes_for_item(index: dict, srcs: dict[str, dict], item_path: str) -> list[str]:
    _verify_fresh(index, srcs)
    out = []
    for e in index["edges"]:
        if e["kind"] != "component-renders-item":
            continue
        if e["endpoints"][1] == f"item:{item_path}":
            out.append(e["endpoints"][0])
    out.sort()
    return out


def units_for_item(index: dict, srcs: dict[str, dict], item_path: str) -> list[str]:
    _verify_fresh(index, srcs)
    out = set()
    for e in index["edges"]:
        if e["kind"] != "unit-collects-item":
            continue
        if e["endpoints"][1] == f"item:{item_path}":
            out.add(e["endpoints"][0].removeprefix("unit:"))
    return sorted(out)


def action_for_trigger(index: dict, srcs: dict[str, dict], component_node_path: str) -> Optional[str]:
    _verify_fresh(index, srcs)
    matches = [
        e["endpoints"][1].removeprefix("action:")
        for e in index["edges"]
        if e["kind"] == "trigger-invokes-action"
        and e["endpoints"][0] == f"componentNodePath:{component_node_path}"
    ]
    if not matches:
        return None
    if len(matches) > 1:
        raise ValueError("malformed TraceIndex: multiple trigger-invokes-action edges for one trigger")
    return matches[0]


# ---------------------------------------------------------------------------
# Fixture-driven conformance
# ---------------------------------------------------------------------------

def _fixture_dirs() -> list[Path]:
    return sorted(p for p in FIXTURE_ROOT.iterdir() if p.is_dir())


def _substitute_computed_digests(expected_index: dict, srcs: dict[str, dict]) -> dict:
    sub = json.loads(json.dumps(expected_index))
    for entry in sub["sources"]:
        if entry["digest"] == "<computed>":
            kind = entry["kind"]
            if kind in srcs:
                entry["digest"] = _digest(srcs[kind])
    return sub


@pytest.mark.parametrize("fixture_dir", _fixture_dirs(), ids=lambda p: p.name)
def test_builder_matches_expected_index(fixture_dir: Path) -> None:
    index, srcs = _build_index(fixture_dir)
    expected_raw = _load(fixture_dir / "expected-index.json")
    expected = _substitute_computed_digests(expected_raw, srcs)
    assert index == expected, f"{fixture_dir.name}: builder output diverges from expected"


@pytest.mark.parametrize("fixture_dir", _fixture_dirs(), ids=lambda p: p.name)
def test_predicates_match_expected(fixture_dir: Path) -> None:
    index, srcs = _build_index(fixture_dir)
    expected = _load(fixture_dir / "expected-predicates.json")

    for item_path, expected_nodes in expected["componentNodesForItem"].items():
        assert component_nodes_for_item(index, srcs, item_path) == expected_nodes, \
            f"{fixture_dir.name}: componentNodesForItem({item_path})"

    for item_path, expected_units in expected["unitsForItem"].items():
        assert units_for_item(index, srcs, item_path) == expected_units, \
            f"{fixture_dir.name}: unitsForItem({item_path})"

    for node_path, expected_action in expected["actionForTrigger"].items():
        assert action_for_trigger(index, srcs, node_path) == expected_action, \
            f"{fixture_dir.name}: actionForTrigger({node_path})"


@pytest.mark.parametrize("fixture_dir", _fixture_dirs(), ids=lambda p: p.name)
def test_builder_is_deterministic(fixture_dir: Path) -> None:
    a, _ = _build_index(fixture_dir)
    b, _ = _build_index(fixture_dir)
    assert _canonical_bytes(a) == _canonical_bytes(b), \
        f"{fixture_dir.name}: builder output not byte-deterministic"
```

- [ ] **Step 2: Run pytest, expect PASS**

```bash
cd /Users/mikewolfd/Work/formspec-stack/formspec
python3 -m pytest tests/conformance/spec/test_trace_predicates.py -v
```

Expected: every fixture passes builder match, predicate match, and determinism.

If any fixture mismatches, the fixture's `expected-index.json` or `expected-predicates.json` is wrong; correct the fixture (the reference builder is the contract).

- [ ] **Step 3: Commit**

```bash
git -C /Users/mikewolfd/Work/formspec-stack/formspec commit tests/conformance/spec/test_trace_predicates.py -m "test(trace): predicate + builder-determinism pytest"
```

---

## Task 16: Write stale-rejection pytest

**Files:**
- Create: `tests/conformance/spec/test_trace_stale_rejection.py`

- [ ] **Step 1: Write the failing test (red)**

```python
"""Stale-rejection invariant for Trace predicates (§7).

Pins: any digest mismatch, missing source, or extra source MUST cause predicate
execution to raise TraceStaleError. No partial results.
"""

import pytest

from .test_trace_predicates import (
    FIXTURE_ROOT,
    TraceStaleError,
    _build_index,
    action_for_trigger,
    component_nodes_for_item,
    units_for_item,
)


FIXTURE = FIXTURE_ROOT / "grant-application-identity"


def _index_and_srcs():
    return _build_index(FIXTURE)


def test_digest_mismatch_rejected() -> None:
    index, srcs = _index_and_srcs()
    # Mutate a source artifact (in memory) so its digest no longer matches the index.
    srcs["definition"]["items"].append({"id": "extra", "type": "string", "required": False})
    with pytest.raises(TraceStaleError) as exc:
        component_nodes_for_item(index, srcs, "applicantName")
    assert exc.value.reason == "digest-mismatch"


def test_missing_source_rejected() -> None:
    index, srcs = _index_and_srcs()
    del srcs["responseActions"]
    with pytest.raises(TraceStaleError) as exc:
        action_for_trigger(index, srcs, "/tree/children/2")
    assert exc.value.reason == "source-missing"


def test_extra_source_rejected() -> None:
    index, srcs = _index_and_srcs()
    index["sources"] = [s for s in index["sources"] if s["kind"] != "component"]
    with pytest.raises(TraceStaleError) as exc:
        units_for_item(index, srcs, "applicantName")
    assert exc.value.reason == "extra-source-present"


def test_no_partial_results_on_stale() -> None:
    """A stale TraceIndex MUST raise — predicate MUST NOT return a best-effort partial."""
    index, srcs = _index_and_srcs()
    srcs["component"]["tree"]["children"].pop()  # mutate component (digest now wrong)
    for call in [
        lambda: component_nodes_for_item(index, srcs, "applicantName"),
        lambda: units_for_item(index, srcs, "applicantName"),
        lambda: action_for_trigger(index, srcs, "/tree/children/2"),
    ]:
        with pytest.raises(TraceStaleError):
            call()


def test_fresh_index_does_not_raise() -> None:
    """Sanity: an unmodified index/srcs pair must not raise."""
    index, srcs = _index_and_srcs()
    # All three predicates should run cleanly.
    component_nodes_for_item(index, srcs, "applicantName")
    units_for_item(index, srcs, "applicantName")
    action_for_trigger(index, srcs, "/tree/children/2")
```

- [ ] **Step 2: Run pytest, expect PASS**

```bash
cd /Users/mikewolfd/Work/formspec-stack/formspec
python3 -m pytest tests/conformance/spec/test_trace_stale_rejection.py -v
```

Expected: all 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git -C /Users/mikewolfd/Work/formspec-stack/formspec commit tests/conformance/spec/test_trace_stale_rejection.py -m "test(trace): stale-rejection invariant pytest"
```

---

## Task 17: Write Studio review composition pytest

**Files:**
- Create: `tests/conformance/spec/test_trace_studio_review_composition.py`

- [ ] **Step 1: Write the failing test**

This test pins §8 — Trace + synthetic route-owned review records + synthetic EXP-COVERAGE compose into a Studio-review-shaped output via the documented join. No double-counting; full information preservation.

```python
"""Composition contract pytest (§8).

Trace owns the relationship index. The selected regeneration-review route owns
the per-cycle review records. EXP-COVERAGE (EXP §8.2) owns coverage findings.
Studio review composes the three streams via documented joins. This pytest pins
the join contract without pinning any route-specific merge-report shape.
"""

from .test_trace_predicates import (
    FIXTURE_ROOT,
    _build_index,
    component_nodes_for_item,
)


FIXTURE = FIXTURE_ROOT / "grant-application-identity"


def _synthetic_review_records() -> list[dict]:
    """Route-owned review records with the stable subject handle required by §8."""
    return [
        {
            "id": "review-regenerated-applicant-name",
            "subject": {"componentNodePath": "/tree/children/0"},
            "anchors": ["item:applicantName"],
            "code": "COMP-REGENERATION-REGENERATED",
            "severity": "info",
            "reason": "Node regenerated from new-generated; no surviving designer delta.",
        },
        {
            "id": "review-pending-date-of-birth",
            "subject": {"componentNodePath": "/tree/children/1"},
            "anchors": ["item:dateOfBirth"],
            "code": "COMP-REGENERATION-PENDING-REVIEW",
            "severity": "info",
            "reason": "Newly generated node not present in old or designer.",
        },
    ]


def _synthetic_coverage_findings() -> list[dict]:
    """Stand-in EXP-COVERAGE findings."""
    return [
        {
            "code": "EXP-COVERAGE-UNCOVERED-REQUIRED-ITEM",
            "severity": "warning",
            "path": "missingItem",
            "reason": "Required item has no unit collecting it.",
        }
    ]


def _node_bucket(review: dict, component_node_path: str) -> dict:
    return review["nodes"].setdefault(
        component_node_path,
        {"reviewRecords": [], "edges": [], "coverageFindings": []},
    )


def _compose_review(index, srcs, review_records, coverage_findings):
    """Reference composition for Studio review (§8.3)."""
    review = {"nodes": {}, "uncoveredItems": []}

    # Stream 1: route-owned review records, joined by subject.componentNodePath.
    for record in review_records:
        node = _node_bucket(review, record["subject"]["componentNodePath"])
        node["reviewRecords"].append(record)

    # Stream 2: Trace edges keyed by componentNodePath endpoint
    for edge in index["edges"]:
        for endpoint in edge["endpoints"]:
            if endpoint.startswith("componentNodePath:"):
                node_path = endpoint.removeprefix("componentNodePath:")
                node = _node_bucket(review, node_path)
                node["edges"].append(edge)

    # Stream 3: coverage findings, two-hop join (path → item: → componentNodePath)
    for finding in coverage_findings:
        nodes = component_nodes_for_item(index, srcs, finding["path"])
        if not nodes:
            review["uncoveredItems"].append(finding)
            continue
        for ep in nodes:
            node_path = ep.removeprefix("componentNodePath:")
            node = _node_bucket(review, node_path)
            node["coverageFindings"].append(finding)

    return review


def test_no_double_counting() -> None:
    index, srcs = _build_index(FIXTURE)
    records = _synthetic_review_records()
    review = _compose_review(index, srcs, records, [])

    seen = []
    for node in review["nodes"].values():
        seen.extend(r["id"] for r in node["reviewRecords"])
    assert len(seen) == len(set(seen)), f"double-counted review records: {seen}"


def test_composition_preserves_information() -> None:
    index, srcs = _build_index(FIXTURE)
    records = _synthetic_review_records()
    coverage = _synthetic_coverage_findings()
    review = _compose_review(index, srcs, records, coverage)

    composed_records = sum(len(n["reviewRecords"]) for n in review["nodes"].values())
    assert composed_records == len(records), "review records lost in composition"

    # Coverage findings with no covering node fall to uncoveredItems
    composed_coverage = sum(len(n["coverageFindings"]) for n in review["nodes"].values()) + len(review["uncoveredItems"])
    assert composed_coverage == len(coverage)


def test_uncovered_item_with_no_node_routes_to_uncovered_bucket() -> None:
    index, srcs = _build_index(FIXTURE)
    review = _compose_review(index, srcs, _synthetic_review_records(), _synthetic_coverage_findings())
    assert len(review["uncoveredItems"]) == 1
    assert review["uncoveredItems"][0]["path"] == "missingItem"


def test_covered_item_with_node_routes_to_node() -> None:
    """A coverage finding whose path matches a Trace edge attaches to that node."""
    index, srcs = _build_index(FIXTURE)
    coverage = [{
        "code": "EXP-COVERAGE-UNCOVERED-REQUIRED-ITEM",
        "severity": "warning",
        "path": "applicantName",
        "reason": "stand-in",
    }]
    review = _compose_review(index, srcs, _synthetic_review_records(), coverage)
    assert review["uncoveredItems"] == []
    assert any(
        n["coverageFindings"] and n["coverageFindings"][0]["path"] == "applicantName"
        for n in review["nodes"].values()
    )


def test_trace_carries_no_findings_of_its_own() -> None:
    """Trace owns the index, not the findings. The TraceIndex MUST NOT include findings."""
    index, _ = _build_index(FIXTURE)
    assert set(index.keys()) == {"$formspecTrace", "sources", "edges"}
    # Edges are typed string pairs; no edge shape carries a 'severity' or 'code' member.
    for edge in index["edges"]:
        assert set(edge.keys()) == {"kind", "endpoints"}
        assert "severity" not in edge
        assert "code" not in edge
```

- [ ] **Step 2: Run pytest, expect PASS**

```bash
cd /Users/mikewolfd/Work/formspec-stack/formspec
python3 -m pytest tests/conformance/spec/test_trace_studio_review_composition.py -v
```

Expected: all 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git -C /Users/mikewolfd/Work/formspec-stack/formspec commit tests/conformance/spec/test_trace_studio_review_composition.py -m "test(trace): Studio review composition pytest"
```

---

## Task 18: Register in spec-artifacts.config.json and surface-coverage.json

**Files:**
- Modify: `scripts/spec-artifacts.config.json`
- Modify: `tests/contracts/surface-coverage.json`

Repo gate: registration was deferred until proof surfaces existed. Tasks 14–17 now exist; register.

- [ ] **Step 1: Add Trace entry to `scripts/spec-artifacts.config.json`**

Insert a new `specs[]` entry alphabetically (between `theme` and others; preserve existing order conventions):

```json
{
  "spec": "specs/trace/trace-spec.md",
  "schema": "schemas/trace-index.schema.json",
  "bluf": "specs/trace/trace-spec.bluf.md",
  "llm": "specs/trace/trace-spec.llm.md",
  "behaviorEssentials": [
    "TraceIndex is a generated cache, not authored truth — every predicate execution must verify input digests against supplied sources and reject stale indices.",
    "Source-set declaration is exhaustive: every inspected source artifact appears in sources[] with identity tuple and SHA-256 canonical digest.",
    "Edge kinds are a closed set of three; each edge has typed-string endpoints whose prefixes and ordering are pinned per kind.",
    "Predicates v1.0 are pure deterministic functions over the edge list: componentNodesForItem, unitsForItem, actionForTrigger.",
    "Trace carries no findings; it composes with route-owned regeneration-review records, CRF resolver findings, and EXP-COVERAGE findings at the Studio review surface."
  ],
  "conformanceEssentials": [
    "A conforming TraceIndex must include $formspecTrace=1.0, sources[], and edges[]; no additional top-level members.",
    "Builders must be deterministic: same canonical source bytes produce byte-identical TraceIndex documents.",
    "Predicate execution against a stale index must raise TraceStaleError; partial results are forbidden.",
    "Hand-authored TraceIndex documents are non-conforming for production use; they are permitted only for fixtures and tests."
  ]
}
```

- [ ] **Step 2: Add Trace contract row to `tests/contracts/surface-coverage.json`**

Insert a new `contracts.trace` entry:

```json
"trace": {
  "status": "enforced",
  "spec": "specs/trace/trace-spec.md",
  "schema": "schemas/trace-index.schema.json",
  "conformance": [
    "tests/conformance/spec/test_trace_index_schema.py",
    "tests/conformance/spec/test_trace_predicates.py",
    "tests/conformance/spec/test_trace_stale_rejection.py",
    "tests/conformance/spec/test_trace_studio_review_composition.py"
  ],
  "fixtures": [
    "tests/conformance/fixtures/trace/grant-application-identity/",
    "tests/conformance/fixtures/trace/multi-unit/"
  ],
  "crates": [],
  "packages": {}
}
```

(Crates and packages remain empty for v1.0 — engine implementations land in their own plans that will add their proof surfaces here.)

- [ ] **Step 3: Run docs generation**

```bash
cd /Users/mikewolfd/Work/formspec-stack/formspec
npm run docs:generate
```

Expected: emits `specs/trace/trace-spec.llm.md` and populates the BLUF marker block in `trace-spec.md`.

- [ ] **Step 4: Run docs:check**

```bash
cd /Users/mikewolfd/Work/formspec-stack/formspec
npm run docs:check
```

Expected: passes. If it fails, the surface-coverage row or spec-artifacts entry is malformed.

- [ ] **Step 5: Commit**

```bash
git -C /Users/mikewolfd/Work/formspec-stack/formspec add scripts/spec-artifacts.config.json tests/contracts/surface-coverage.json specs/trace/trace-spec.llm.md specs/trace/trace-spec.md specs/trace/trace-spec.bluf.md
git -C /Users/mikewolfd/Work/formspec-stack/formspec commit -m "docs(trace): register spec artifacts + surface coverage"
```

---

## Task 19: Optional upstream cross-reference note

**Files:**
- Modify: `thoughts/specs/2026-05-20-formspec-semantic-layers.md`

- [ ] **Step 1: Add a draft cross-reference without closing concept status**

Edit `thoughts/specs/2026-05-20-formspec-semantic-layers.md`:

In §10, update item 6 from:

```
6. **Trace query/cache spec.** Use Studio regeneration review as the first consumer unless a stronger consumer appears. Define predicates, source sets, input digests, stale-cache rejection, orphan status, coverage checks, and future verification semantics.
```

to:

```
6. **Trace query/cache spec.** Use Studio regeneration review as the first consumer unless a stronger consumer appears. Define predicates, source sets, input digests, stale-cache rejection, orphan status, coverage checks, and future verification semantics. **Draft planned:** [`specs/trace/trace-spec.md`](../../specs/trace/trace-spec.md) will define the v1 source set, identity tuples, digest model, three seed predicates, and Studio-review composition preconditions.
```

In §11.4, leave the committed/deferred posture intact and append a note under the opening paragraph:

```
### 11.4 Trace Predicate Set

Trace posture is committed. Predicate names, query language, source-set rules, and verification semantics are deferred until the named consumer needs them. Studio regeneration review is the proposed first consumer.
```

```
Drafting note: the Trace v1 plan narrows the seed surface to Definition, Experience, Response Actions, and Component sources; three relationship edges; three predicates; stale-cache rejection; and a composition precondition that the chosen regeneration-review route expose a stable Component-subject handle. Do not mark this section resolved until the spec, schema, fixtures, and composition proof land.
```

- [ ] **Step 2: Commit**

```bash
git -C /Users/mikewolfd/Work/formspec-stack/formspec commit thoughts/specs/2026-05-20-formspec-semantic-layers.md -m "docs(concept): add Trace draft cross-reference"
```

---

## Task 20: Run full test suite + final commit gate

- [ ] **Step 1: Run the four Trace pytests together**

```bash
cd /Users/mikewolfd/Work/formspec-stack/formspec
python3 -m pytest tests/conformance/spec/test_trace_index_schema.py tests/conformance/spec/test_trace_predicates.py tests/conformance/spec/test_trace_stale_rejection.py tests/conformance/spec/test_trace_studio_review_composition.py -v
```

Expected: all pass.

- [ ] **Step 2: Run docs:check + filemap freshness**

```bash
cd /Users/mikewolfd/Work/formspec-stack/formspec
npm run docs:check
npm run docs:filemap:check
```

Expected: both pass. If filemap is stale, run `npm run docs:filemap` and commit the regenerated `filemap.json`.

- [ ] **Step 3: Optional broader sanity — Python conformance suite**

```bash
cd /Users/mikewolfd/Work/formspec-stack/formspec
python3 -m pytest tests/ -q
```

Expected: zero regressions. New Trace tests pass; pre-existing suite unchanged.

- [ ] **Step 4: Dispatch semi-formal-code-review subagent**

Per stack-level review discipline (`formspec-stack/CLAUDE.md` §HIGH PRIORITY — Review discipline), dispatch `formspec-specs:semi-formal-code-review` over the full Trace landing as a single review pass. BLOCKER findings go to a fresh craftsman; the implementer does not self-remediate.

```
Subagent: formspec-specs:formspec-scout (or general-purpose invoking semi-formal-code-review skill)
Scope: specs/trace/, schemas/trace-index.schema.json, tests/conformance/spec/test_trace_*.py,
       tests/conformance/fixtures/trace/, scripts/spec-artifacts.config.json (trace entry),
       tests/contracts/surface-coverage.json (trace entry),
       thoughts/specs/2026-05-20-formspec-semantic-layers.md (optional Trace draft cross-reference)
Run in background.
```

- [ ] **Step 5: Final commit if filemap regenerated**

```bash
git -C /Users/mikewolfd/Work/formspec-stack/formspec status
# If filemap.json shows modified:
git -C /Users/mikewolfd/Work/formspec-stack/formspec commit filemap.json -m "docs(filemap): regenerate after trace spec landing"
```

---

## Promotion gates (from concept §9)

| Gate | Status after this plan |
|---|---|
| **Trace consumer** — named first consumer, minimal predicates, input digest model, stale rejection, orphan status, required-item coverage checks | STRUCTURALLY ADDRESSED, NOT CLOSED — this plan narrows v1 to the seed consumer, three predicates, source identity, canonical digests, stale rejection, and composition preconditions. The gate closes only after the Trace spec/schema/fixtures/tests land and the chosen regeneration-review route exposes a stable review subject handle. |

All other concept §9 gates are unaffected by this plan.

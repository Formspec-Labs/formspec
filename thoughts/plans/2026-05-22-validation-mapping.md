# Validation Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land a normative **Validation Mapping** companion under `specs/core/` — prose, schema, fixtures, pytest — that reconciles Core validation modes, per-shape timing, Component `SubmitButton.mode`, Component `ValidationSummary.source` and `mode`, ValidationReport severity, and Response status transitions. Closes the §9 row-3 promotion gate and resolves §11.2 of [`../specs/2026-05-20-formspec-semantic-layers.md`](../specs/2026-05-20-formspec-semantic-layers.md). Required to land *before* any Response Actions schema (§10.2 / §10.3 order).

**Architecture:** New normative document at `specs/core/validation-mapping.md`, a companion under Core (the mapping primarily reconciles Core vocabulary; placing it next to Core's S5 Validation keeps the cross-spec mapping easy to cite without bloating core/spec.md). New schema at `schemas/validation-mapping.schema.json` defining four closed enums — `ActionIntent`, `ValidationProfile`, `BlockingPolicy`, `PersistencePolicy` — plus a `MappingEntry` $def and a `MasterTable` const that pins the §9 reconciliation. Strictly additive: no Core / Component / Definition / Response / ValidationReport / ValidationResult schema changes. ValidationReport `valid = (counts.error === 0)` (Core §5.4), VE-05 "saving data MUST never be blocked by validation" (Core §5.5), SubmitButton `mode ∈ {continuous, submit}` (Component §5.19), ValidationSummary `source ∈ {live, submit}` (Component §6.13), Response `status ∈ {in-progress, completed, amended, stopped}` (Response schema) are all PRESERVED. The mapping names higher-level intents and named profiles that pin existing terms to a single identifier; Response Actions overrides per-action via its own schema later.

**Tech Stack:** Markdown (W3C-style), JSON Schema 2020-12, `npm run docs:generate` / `docs:check` pipeline (`generate-spec-artifacts.mjs`), Python pytest under `tests/conformance/`.

**Sequencing:** prose contract first → schema encodes the four enums and master table → fixtures exercise the mapping over existing Core+Component behavior → pytest pins the table. Per [concept §10 closing line](../specs/2026-05-20-formspec-semantic-layers.md), the schema MUST NOT hide unresolved prose decisions.

**Citations** in this plan refer to the concept note (`thoughts/specs/2026-05-20-formspec-semantic-layers.md`) unless prefixed with another spec name.

---

## File Structure

### Created

| Path | Responsibility |
|---|---|
| `specs/core/validation-mapping.md` | Canonical prose. W3C-style, BCP-14 normative language. |
| `specs/core/validation-mapping.bluf.md` | BLUF source (3–5 falsifiable bullets). |
| `specs/core/validation-mapping.llm.md` | Generated LLM artifact. **Never hand-edited.** |
| `schemas/validation-mapping.schema.json` | Four closed enums + `MappingEntry` + `MasterTable`. `$id`: `https://formspec.org/schemas/validationMapping/1.0`. |
| `tests/conformance/schemas/test_validation_mapping_schema.py` | Schema-shape pytest. Pins `$defs`, enum closure, and `MappingEntry` extension behavior. |
| `tests/conformance/spec/test_validation_mapping_table.py` | Master-table pin plus fixture semantic audit: schema `MasterTable` const matches §6 prose row-by-row; fixture actions conform to `MappingEntry`; fixture Definition/Response/ValidationReport payloads conform to live schemas; reference evaluator proves profile filtering, counts, status transitions, and VE-05 outcomes. |
| `tests/conformance/fixtures/validation-mapping/definition-base.json` | Shared Definition. One required item; one warning shape (continuous timing); one error shape (continuous timing); one submit-timing error shape; one demand-timing error shape. |
| `tests/conformance/fixtures/validation-mapping/intent-save-draft.json` | Response with invalid data. Expects: persistence `draft-checkpoint`, status `in-progress`, profile `off` → no ValidationReport produced. |
| `tests/conformance/fixtures/validation-mapping/intent-submit-blocked.json` | Same invalid Response, intent `submit`. Expects: status remains `in-progress`, ValidationReport `valid: false`, completed-response transition not applied, current data preserved/checkpointable per VE-05. |
| `tests/conformance/fixtures/validation-mapping/intent-submit-warning-only.json` | Response failing only the warning shape. Expects: status `completed`, ValidationReport `valid: true`, `counts.warning >= 1`. |
| `tests/conformance/fixtures/validation-mapping/intent-request-evidence.json` | Valid field data, intent `request-evidence`. Expects: profile `on-demand` — only demand-timing shape fires and can fail; non-blocking draft checkpoint still succeeds. |
| `tests/conformance/fixtures/validation-mapping/intent-autosave-disabled.json` | Same invalid Response, intent `autosave`. Expects: profile `off`, persistence `draft-checkpoint`, no ValidationReport. |
| `tests/conformance/fixtures/validation-mapping/master-table.json` | Canonical mapping trace: machine-readable form of §6 master table. Single source of truth for tests. |

### Modified

| Path | Why |
|---|---|
| `specs/core/spec.md` | Append S5.5.1 forward-link to `validation-mapping.md`. **One-paragraph append.** Does not modify the existing S5.5 Validation Modes table. |
| `specs/component/component-spec.md` | Append a "Cross-reference" note to S5.19 SubmitButton and S6.13 ValidationSummary. **Two-paragraph appends.** Existing prop tables unchanged. |
| `thoughts/specs/2026-05-20-formspec-semantic-layers.md` | Mark §10.3 landed; mark §11.2 resolved (with link). **Two-line edits.** |
| `scripts/spec-artifacts.config.json` | Add the Validation Mapping spec/schema/BLUF/LLM row so `npm run docs:generate` materializes `validation-mapping.llm.md`. |
| `filemap.json` | Regenerated by `npm run docs:filemap`. **Generated — never hand-edit.** |

### Explicitly NOT in scope

- Response Actions companion spec — concept §10.2, separate plan.
- Component `actionRef` field or any Component reference additions — concept §10.4, separate plan.
- Action invocation execution semantics, idempotency, retry, failure, deferred outcomes — concept §6.4, Response Actions plan.
- Trace — concept §10.6, separate plan.
- Intake Handoff — already specified elsewhere; not modified.
- New runtime behavior in Core engines or Component renderers. The mapping is a vocabulary reconciliation; existing engines that implement Core §5.5 already satisfy the four-axis semantics. Engine work to *consume* the mapping (e.g., a runtime `applyMapping(intent)` API) is Response Actions territory, not this plan.
- Modifications to existing schemas (`core-commands.schema.json`, `definition.schema.json`, `component.schema.json`, `response.schema.json`, `validation-report.schema.json`, `validation-result.schema.json`). Additive invariant per concept §5.1.

---

## Self-Review Note

Concept-note coverage: §3 anchors (ValidationReport `valid`, severity, Core global modes, per-shape timing, Response status, SubmitButton current behavior, ValidationSummary current behavior) — preserved. §5.5 (validation terminology axes) — encoded as four named axes in S2. §6.5 (the four-axis table) — encoded as S2–S5 + master table in S6. §6.6 (SubmitButton compatibility, default-submit-action rule) — S7. §9 row 3 (promotion gate: one reconciliation table) — S6 + `MasterTable` schema const + master-table pytest. §11.2 (validation profile names — open question) — RESOLVED via the closed `ValidationProfile` enum in S3. Response Actions ownership boundaries (§6.3): this spec does NOT define action identity, FEL preconditions, ordered effects, idempotency posture, failure/deferred outcomes — only the (profile, blocking, persistence) triple keyed by abstract action intent.

Out-of-scope confirmation: no schema changes to existing files; no engine API changes; no Component widget changes; no Response lifecycle additions (`amended` and `stopped` are reconciled but not driven by this spec's actions).

---

## Task 1: Scaffold spec directory and empty files

**Files:**
- Create: `specs/core/validation-mapping.md`
- Create: `specs/core/validation-mapping.bluf.md`

- [ ] **Step 1: Create stub files**

```bash
cd formspec && touch specs/core/validation-mapping.md specs/core/validation-mapping.bluf.md
```

- [ ] **Step 2: Verify pattern parity with Experience**

Run: `ls formspec/specs/core/ formspec/specs/experience/`
Expected: `validation-mapping.md` and `validation-mapping.bluf.md` exist under `core/`; mirror pattern present under `experience/` (`experience-spec.md` + `experience-spec.bluf.md`). `validation-mapping.llm.md` does NOT exist yet — generated by docs:generate.

- [ ] **Step 3: Commit scaffold**

```bash
cd formspec && git add specs/core/validation-mapping.md specs/core/validation-mapping.bluf.md
git commit -m "feat(validation-mapping): scaffold companion spec

Third follow-on from thoughts/specs/2026-05-20-formspec-semantic-layers.md §10.3.
Gates Response Actions schema landing (§9 row 3, §11.2). Empty files; content
lands in subsequent commits."
```

---

## Task 2: Write spec preamble, BCP-14, BLUF marker

**Files:**
- Modify: `specs/core/validation-mapping.md`
- Modify: `specs/core/validation-mapping.bluf.md`

- [ ] **Step 1: Write the preamble through BLUF marker**

Replace the empty `specs/core/validation-mapping.md` with:

```markdown
---
title: Formspec Validation Mapping
version: 1.0.0-draft.1
date: 2026-05-22
status: draft
---

# Formspec Validation Mapping v1.0

**Version:** 1.0.0-draft.1
**Date:** 2026-05-22
**Editors:** Formspec Working Group
**Companion to:** Formspec v1.0 — A JSON-Native Declarative Form Standard

---

## Status of This Document

This document is a **draft normative companion** to [Formspec v1.0 core specification](spec.md). It reconciles validation-related vocabulary across Core §5 (Validation), Component §5.19 (SubmitButton), Component §6.13 (ValidationSummary), and the Response status lifecycle so that future Response Actions documents have a single mapping to cite.

This spec was promoted from the concept architecture note [`thoughts/specs/2026-05-20-formspec-semantic-layers.md`](../../thoughts/specs/2026-05-20-formspec-semantic-layers.md). It addresses the **§9 row 3** promotion gate (one reconciliation table over action intent, Core global modes, per-shape timing, `SubmitButton.mode`, `ValidationSummary.source`, severity, and Response status transitions) and the **§11.2** open question (validation profile names).

This document **MUST land before any Response Actions schema** (concept §10 order).

## Conventions and Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [BCP 14][rfc2119] [RFC 2119] [RFC 8174] when, and only when, they appear in ALL CAPITALS, as shown here.

JSON syntax and data types are as defined in [RFC 8259].

Terms defined in the Formspec v1.0 core specification — including *Definition*, *Response*, *ValidationReport*, *ValidationResult*, *Bind*, *Shape*, *validation mode*, *per-shape timing*, and *conformant processor* — retain their core-specification meanings throughout this document unless explicitly redefined.

Additional terms:

- **Action Intent** — A closed, abstract identifier naming what a form caller is trying to do (e.g., save a draft, submit, request evidence). See §2.
- **Validation Profile** — A closed, named profile that pins a (Core global mode, per-shape timing filter) pair under a single identifier. See §3.
- **Blocking Policy** — A closed enum naming whether validation findings of `error` severity stop the surrounding intent. See §4.
- **Persistence Policy** — A closed enum naming the Response lifecycle effect produced by the intent. See §5.
- **Master Mapping Table** — The default (Action Intent → Validation Profile, Blocking Policy, Persistence Policy) tuple per Action Intent. See §6.

[rfc2119]: https://www.rfc-editor.org/rfc/rfc2119
[RFC 8174]: https://www.rfc-editor.org/rfc/rfc8174
[RFC 8259]: https://www.rfc-editor.org/rfc/rfc8259

---

## Bottom Line Up Front

<!-- bluf:start file=validation-mapping.bluf.md -->
<!-- bluf:end -->

---
```

- [ ] **Step 2: Write the BLUF source**

Replace `specs/core/validation-mapping.bluf.md` with:

```markdown
- This document defines four closed vocabularies — `ActionIntent`, `ValidationProfile`, `BlockingPolicy`, `PersistencePolicy` — and a Master Mapping Table that names default tuples per intent. Future Response Actions documents MUST cite this table; they MUST NOT invent a parallel validation vocabulary.
- Validation Profile names (`live`, `on-submit`, `on-demand`, `off`) pin existing Core terms: global mode (`continuous` / `deferred` / `disabled`) plus per-shape timing filter (`continuous` / `submit` / `demand`). No new runtime behavior is introduced.
- The mapping preserves Core §5.5 VE-05 ("saving data MUST never be blocked by validation"). Persistence Policy `draft-checkpoint` is non-blocking regardless of validation findings; only `complete-response` requires `valid = true`.
- A `SubmitButton` without an `actionRef` MUST be treated as invoking the implementation's default submit action (Master Mapping Table row for `submit`): profile `on-submit`, blocking `block-on-error`, persistence `complete-response`. Component §5.19 `mode` ∈ {`continuous`, `submit`} maps to profile `live` / `on-submit` for emitted-report production; Response status `completed` still requires the `on-submit` completion gate.
- This BLUF is governed by `schemas/validation-mapping.schema.json` (the four enums + `MappingEntry` + `MasterTable` const). The schema is the canonical structural contract; prose is normative.
```

- [ ] **Step 3: Commit**

```bash
cd formspec && git add specs/core/validation-mapping.md specs/core/validation-mapping.bluf.md
git commit -m "feat(validation-mapping): preamble + BLUF

Frontmatter, BCP-14 boilerplate, terminology inheritance, BLUF source. Pins
that this spec lands before Response Actions schema (§9 row 3, §10 order)."
```

---

## Task 3: Write S1 Introduction

**Files:**
- Modify: `specs/core/validation-mapping.md`

- [ ] **Step 1: Append S1**

```markdown
## 1. Introduction

### 1.1 Purpose and Scope

This specification names abstract action intents and the validation, blocking, and persistence behavior they imply. It exists so that:

1. Authors of Response Actions documents (forthcoming, concept §10.2) have a single reconciliation table to cite instead of inventing a parallel validation vocabulary.
2. Component `SubmitButton` (Component §5.19) continues to behave per its existing prop table while gaining a documented forward-compatible link to the eventual `actionRef` field.
3. Processors that encounter intents other than `submit` (e.g., autosave, request-evidence) have a single normative source for how to translate the intent into Core validation behavior and Response lifecycle effects.

This specification does NOT define:

- Action identity, FEL preconditions, effect ordering, idempotency, retry, failure, or deferred outcomes — those belong to **Response Actions** (forthcoming).
- New runtime APIs, engine behavior, or Component widgets. Existing Core processors that implement §5.5 already satisfy the four-axis semantics named here.
- The shape of a Response Action document or its schema.
- Workflow host events, governed case lifecycle, or Intake Handoff acceptance — those belong to **WOS** and **Intake Handoff**.

### 1.2 Relationship to Existing Specifications

| Existing concept | Existing definition | This document |
|---|---|---|
| Core global mode (`continuous` / `deferred` / `disabled`) | Core §5.5 | Pinned by `ValidationProfile` (§3) |
| Per-shape `timing` (`continuous` / `submit` / `demand`) | Core §5.2.1, §5.5 | Pinned by `ValidationProfile` (§3) |
| ValidationResult `severity` (`error` / `warning` / `info`) | Core §5.3.1 | Drives `BlockingPolicy` (§4) |
| ValidationReport `valid` (`= counts.error === 0`) | Core §5.4 / `validation-report.schema.json` | Sole criterion for `block-on-error` (§4) |
| Response `status` (`in-progress` / `completed` / `amended` / `stopped`) | `response.schema.json` | Pinned by `PersistencePolicy` (§5) |
| `SubmitButton.mode` (`continuous` / `submit`) | Component §5.19 | Mapped to `ValidationProfile` (§7) |
| `ValidationSummary.source` (`live` / `submit`) | Component §6.13 | Mapped to `ValidationProfile` (§8) |
| VE-05 ("saving data MUST never be blocked by validation") | Core §5.5 | Preserved by `non-blocking` policies (§4) |

### 1.3 Design Principles

1. **Additive, not invasive.** This spec introduces no new schemas for existing artifacts, no new runtime behavior, and no new Component fields. Engines that implement Core §5.5 already satisfy the four axes.
2. **Closed vocabularies.** `ValidationProfile`, `BlockingPolicy`, and `PersistencePolicy` are closed. `ActionIntent` has a closed standard set plus publisher-defined `x-` extension intents (§10), each still bound to the closed profile/policy tuple space.
3. **Existing terms anchor.** Validation Profile names pin existing Core terms; they do not introduce a parallel set of mode names. `live` pins Core `continuous` mode + per-shape `continuous` timing; `on-submit` pins Core `continuous` mode + per-shape `submit` timing (filter); `on-demand` pins Core `deferred` mode + per-shape `demand` timing (filter); `off` pins Core `disabled` mode.
4. **One table, one truth.** §6 is the master table. The schema's `MasterTable` const MUST equal §6 row for row. Pytest pins it (Tasks 24, 25).
5. **Non-overriding defaults.** Master-table tuples are defaults. A Response Actions document MAY override (profile, blocking, persistence) per action; it MUST NOT introduce a new `ActionIntent` outside this spec's closed enum without an `x-` extension.

### 1.4 Conformance Levels

This specification defines one conformance level for documents and a separate level for *processors that consume the mapping*:

| Level | Requirements |
|-------|--------------|
| **Mapping-Aware Document** | Any document with an explicit intent identifier whose value is a member of the closed `ActionIntent` enum (§2) or an `x-` extension intent (§10). |
| **Mapping-Aware Processor** | A processor that, given a Mapping-Aware Document with intent `I`, MUST apply the Master Mapping Table tuple `(profile, blocking, persistence)` keyed by `I` unless the document explicitly overrides one or more axes. The same processor MUST also apply the §7 default-submit-action fallback for legacy `SubmitButton` nodes without `actionRef`. |

A `SubmitButton` without `actionRef` is not a Mapping-Aware Document because current Component §5.19 does not carry an intent identifier. Its default submit semantics are a processor fallback defined in §7.1, not a document-conformance claim.

A conformant Core processor that is NOT Mapping-Aware MAY ignore this specification entirely. Existing engines that only support `SubmitButton.mode` continue to satisfy Core §5.5 and Component §5.19 without consulting this mapping; the §7 default-submit-action rule (concept §6.6) takes effect only when an engine is Mapping-Aware.

#### 1.4.1 Conformance Prohibitions

A conformant processor MUST NOT:

1. Introduce additional `ValidationProfile`, `BlockingPolicy`, or `PersistencePolicy` values outside the closed enums in §§3–5, or introduce additional standard `ActionIntent` values outside §2 except through the `x-` extension mechanism (§10).
2. Apply a Master Mapping Table tuple that contradicts §6.
3. Cause persistence to be blocked by validation findings under any `PersistencePolicy` other than `complete-response`, in violation of Core §5.5 VE-05.
4. Treat `block-on-error` as blocking persistence below the `complete-response` policy.
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add specs/core/validation-mapping.md
git commit -m "feat(validation-mapping): S1 Introduction

Purpose, relationship table to existing specs, design principles
(additive, closed vocabularies, existing terms anchor, one table one truth,
non-overriding defaults), two conformance levels (document / processor)."
```

---

## Task 4: Write S2 Action Intent

**Files:**
- Modify: `specs/core/validation-mapping.md`

- [ ] **Step 1: Append S2**

```markdown
## 2. Action Intent

`ActionIntent` is a **closed, abstract enum** naming what a form caller is trying to do. Authors and processors MUST use these identifiers verbatim; they MUST NOT introduce parallel intent names (e.g., `quickSave`, `validateOnly`) outside the `x-` extension mechanism (§10).

| Value | Meaning |
|-------|---------|
| `save-draft` | The caller is persisting the current Response as a draft. Validation findings, if any, do not affect the outcome. Maps to Response `status: in-progress`. |
| `autosave` | A background or periodic save. Identical to `save-draft` in mapping; named separately so callers, telemetry, and audit logs can distinguish user-initiated from system-initiated drafts. |
| `review` | The caller is invoking a read-only validation pass for review (e.g., a pre-flight before submission). Validation runs; no persistence transition occurs. |
| `submit` | The caller is attempting to transition the Response to `completed`. Validation runs; error-severity findings block the transition. |
| `request-evidence` | The caller is invoking a demand-timing shape (Core §5.2.1) — typically a server-side or external check requested by the user before final submission. Validation runs in `on-demand` profile (only demand-timing shapes fire). Non-blocking. |

These five values are the closed initial set. Future revisions of this spec MAY add additional intents; processors MUST reject documents using intent values outside the current spec's enum unless prefixed `x-`.

**`x-` extensions.** An author MAY introduce custom intents under the `x-` prefix (e.g., `x-acme-bulk-import`). Such intents MUST carry an explicit `(profile, blocking, persistence)` triple in the Response Actions document; Mapping-Aware processors that do not recognize an `x-` intent MUST use the document-supplied triple verbatim. Mapping-Aware processors that *do* recognize an `x-` intent MAY honor a publisher-supplied default.

Intent names are descriptive of caller goal, not implementation: `save-draft` does not specify whether the persistence target is local storage, server, or any other medium — that belongs to Response Actions effect requests (concept §6.3). Likewise `submit` does not specify whether the host accepts, defers, or rejects — that belongs to Intake Handoff (concept §6.9).
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add specs/core/validation-mapping.md
git commit -m "feat(validation-mapping): S2 Action Intent (closed enum)

Five-value enum (save-draft, autosave, review, submit, request-evidence).
Closure enforces §6.5 stop condition: no parallel validation vocabulary.
x- extension model documented."
```

---

## Task 5: Write S3 Validation Profile

**Files:**
- Modify: `specs/core/validation-mapping.md`

- [ ] **Step 1: Append S3**

```markdown
## 3. Validation Profile

`ValidationProfile` is a **closed, named enum** that pins (Core global validation mode, per-shape timing filter) under a single identifier. Profile names MUST be used in place of inline mode+timing tuples in Mapping-Aware documents.

This section resolves the concept-note §11.2 open question (validation profile names).

| Profile | Core global mode (§5.5) | Per-shape timing filter (§5.2.1) | Meaning |
|---------|-------------------------|----------------------------------|---------|
| `live` | `continuous` | continuous-timing shapes fire during normal revalidation; submit and demand shapes wait for their explicit triggers | Validation evaluates on every value change; matches current Core default and `SubmitButton.mode: continuous` report production. |
| `on-submit` | `continuous` | continuous and submit-timing shapes fire; demand shapes do NOT fire | Validation evaluates the completion-eligible shape set once; matches `SubmitButton.mode: submit` report production without redefining demand timing. |
| `on-demand` | `deferred` | only shapes with `timing: demand` fire | Used by `request-evidence` intent. Continuous and submit shapes are deferred per Core §5.5 deferred-mode override. |
| `off` | `disabled` | no shapes fire | Used by `save-draft` and `autosave`. ValidationReport is NOT produced. |

### 3.1 Profile Resolution

A Mapping-Aware processor applies a profile by:

1. Setting the engine's global validation mode to the profile's Core mode column.
2. Applying the per-shape timing filter:
   - `continuous trigger` — shapes whose declared `timing` is `continuous` fire during normal revalidation; `submit` and `demand` shapes wait for their explicit triggers.
   - `submit trigger` — shapes whose declared `timing` is `continuous` or `submit` fire for the submit pass; `demand` shapes remain deferred until explicitly requested by the consuming application.
   - `only demand` — only shapes whose declared `timing` is `demand` evaluate; all others are deferred.
   - `no shapes` — every shape is suppressed; no ValidationResults are produced (Core §5.5 disabled-mode).

### 3.2 What Profile Does NOT Affect

Profile does NOT change:

- ValidationResult schema (Core §5.3.1). All findings keep their existing shape.
- Non-relevant field suppression (Core §5.6). Profiles MUST honor §5.6 rule 1 — non-relevant fields produce no results regardless of profile.
- External validation injection (Core §5.7). Externally injected results are merged into ValidationReport under any profile that produces a report. Under `off`, no report is produced and external results are discarded for that intent.
- Profile-to-profile state. Profiles are stateless; switching profile mid-session has no memory.

### 3.3 Profile Closure

Profile names are closed. Authors MUST NOT introduce additional profile names (e.g., `partial`, `silent`, `batch`), including `x-`-prefixed profile names. Publisher-specific behavior MUST use an `x-` ActionIntent paired with one of this section's four profiles. The four named profiles cover the existing Core terms that interact with action intent; additional profiles would re-open the §9 row-3 stop condition.
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add specs/core/validation-mapping.md
git commit -m "feat(validation-mapping): S3 Validation Profile (closed enum)

Four named profiles (live, on-submit, on-demand, off) pinning Core mode +
per-shape timing filter. Resolves concept-note §11.2. Section 3.2 explicitly
defends what profile does NOT affect (preserves Core §5.6, §5.7)."
```

---

## Task 6: Write S4 Blocking Policy

**Files:**
- Modify: `specs/core/validation-mapping.md`

- [ ] **Step 1: Append S4**

```markdown
## 4. Blocking Policy

`BlockingPolicy` is a **closed, two-value enum** naming whether error-severity findings prevent the surrounding intent from completing.

| Value | Behavior |
|-------|----------|
| `non-blocking` | Findings of any severity (including `error`) do not stop the intent. The intent completes regardless of `ValidationReport.valid`. The report MAY still be produced and surfaced to the user. |
| `block-on-error` | The intent MUST NOT complete when `ValidationReport.valid` is `false` (equivalently, when `counts.error > 0`). The intent halts before any persistence-policy effect higher than `draft-checkpoint` is applied. |

### 4.1 Blocking Reconciliation with Core §5.5 VE-05

Core §5.5 critical rule VE-05 states: *"Saving data MUST never be blocked by validation."* This document preserves VE-05.

- `non-blocking` is consistent with VE-05 by definition.
- `block-on-error` is consistent with VE-05 because it blocks **the transition** to a higher persistence policy (typically `complete-response`), not the underlying Response data persistence. A `block-on-error` intent that fails validation under `complete-response` persistence MUST leave the Response in `status: in-progress` with its data preserved (matching VE-05).

A processor MUST NOT discard Response data on a blocked submission. The Response remains saveable as a draft (intent `save-draft` would succeed against the same data).

### 4.2 Blocking and Warning/Info Severity

`block-on-error` is keyed off `error` severity only. Findings of `warning` or `info` severity NEVER block, regardless of policy. This aligns with Core §5.3.1 ("only error blocks completion") and the `validation-report.schema.json` invariant `valid = (counts.error === 0)`.

Blocking Policy values are closed. A Response Actions document MUST NOT add author-specific Blocking Policy values (e.g., `x-acme-block-on-warning`). Publisher-specific behavior MUST use an `x-` ActionIntent paired with one of this section's two blocking policies, or wait for a future revision of this spec.
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add specs/core/validation-mapping.md
git commit -m "feat(validation-mapping): S4 Blocking Policy (closed enum)

Two-value enum (non-blocking, block-on-error). VE-05 reconciliation:
block-on-error halts the transition, not the underlying data persistence."
```

---

## Task 7: Write S5 Persistence Policy

**Files:**
- Modify: `specs/core/validation-mapping.md`

- [ ] **Step 1: Append S5**

```markdown
## 5. Persistence Policy

`PersistencePolicy` is a **closed, three-value enum** naming the Response lifecycle effect of the intent.

| Value | Response status effect | When required |
|-------|------------------------|---------------|
| `none` | No status change. The Response is not persisted by this intent. The engine MAY still produce a ValidationReport and surface it to the user. | Used by `review` intent (validation-only). |
| `draft-checkpoint` | Persist current Response state. Status remains `in-progress`. Permitted under any validation outcome (VE-05). | Used by `save-draft`, `autosave`, `request-evidence`. |
| `complete-response` | Persist current Response state AND transition status to `completed`. REQUIRES `ValidationReport.valid === true` (equivalently `counts.error === 0`). | Used by `submit` intent. |

### 5.1 Persistence Reconciliation with Response Status

The Response schema (`response.schema.json`, §4) defines four statuses: `in-progress`, `completed`, `amended`, `stopped`. This spec reconciles the first two; `amended` and `stopped` are out of scope:

- `amended` re-opens a previously `completed` Response. A future Response Actions intent (e.g., `x-amend-response`) would map to `complete-response` from `amended` once validation passes.
- `stopped` is an abandonment, not a save. No `ActionIntent` in this spec produces `stopped`.

### 5.2 Persistence and `block-on-error`

When `BlockingPolicy` is `block-on-error` and validation fails:

- If the matching `PersistencePolicy` is `complete-response`, the processor MUST NOT transition status. It MUST preserve the Response data in `status: in-progress` (per VE-05). The blocked intent has the same data-preservation/checkpointability effect as `save-draft`; it does not apply the `complete-response` persistence effect.
- If the matching `PersistencePolicy` is `draft-checkpoint` or `none`, blocking does not affect persistence (the policy was already non-transitioning). The intent completes its persistence effect and surfaces the report.

### 5.3 Persistence Without Validation

Under `ValidationProfile: off`, no ValidationReport is produced. The persistence effect proceeds regardless. This applies to `save-draft` and `autosave` and is consistent with VE-05.

A processor that wishes to produce a ValidationReport during a draft save (for telemetry, audit, or UI display) MUST use a different intent (`review` runs validation without persisting) or a Response Actions `x-` ActionIntent whose explicit mapping uses one of this spec's closed profiles.
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add specs/core/validation-mapping.md
git commit -m "feat(validation-mapping): S5 Persistence Policy (closed enum)

Three-value enum (none, draft-checkpoint, complete-response). Reconciliation
to Response status; amended/stopped explicitly out of scope. block-on-error
+ complete-response failure mode preserves data per VE-05."
```

---

## Task 8: Write S6 Master Mapping Table (§9 row 3 promotion gate)

**Files:**
- Modify: `specs/core/validation-mapping.md`

- [ ] **Step 1: Append S6**

```markdown
## 6. The Master Mapping Table

This section is the **load-bearing reconciliation** required by concept §9 row 3 ("one table that reconciles action intent, Core global modes, per-shape timing, Component `SubmitButton.mode`, `ValidationSummary.source`, severity, and Response status transitions"). The table below is normative. The schema's `MasterTable` const (§9 / `schemas/validation-mapping.schema.json`) MUST equal this table row-for-row; the pytest in `tests/conformance/spec/test_validation_mapping_table.py` MUST pin it.

| Action Intent | Validation Profile | Blocking Policy | Persistence Policy |
|---------------|--------------------|-----------------|--------------------|
| `save-draft`  | `off`              | `non-blocking`  | `draft-checkpoint` |
| `autosave`    | `off`              | `non-blocking`  | `draft-checkpoint` |
| `review`      | `on-submit`        | `non-blocking`  | `none`             |
| `submit`      | `on-submit`        | `block-on-error`| `complete-response`|
| `request-evidence` | `on-demand`   | `non-blocking`  | `draft-checkpoint` |

### 6.1 Overriding the Defaults

A Response Actions document MAY override one, two, or three of (profile, blocking, persistence) per action while retaining a master-table intent. Overrides are explicit and MUST appear in the Response Actions document; processors MUST NOT silently substitute non-default tuples.

A Response Actions document that overrides all three axes is equivalent to using an `x-`-extension intent — the processor MUST treat it as a publisher-defined intent and MUST NOT consult the master table for that action.

### 6.2 What Overrides Cannot Do

Overrides MUST NOT:

1. Reintroduce a blocked persistence below `complete-response` (would violate VE-05).
2. Pair `complete-response` persistence with any Blocking Policy other than `block-on-error` (would allow Responses with error-severity findings to reach `completed`, violating Core §5.4 invariant `valid = (counts.error === 0)`).
3. Pair `complete-response` persistence with any Validation Profile other than `on-submit` (would allow completion from a partial report that did not include the complete completion-eligible shape set).
4. Pair `off` profile with `block-on-error` policy (no ValidationReport is produced under `off`, so `block-on-error` has no input).

A processor that encounters any of these prohibited combinations MUST reject the document with a structural finding (`VMAP-INVALID-OVERRIDE`).

### 6.3 Validity Predicate

The set of permitted (profile, blocking, persistence) tuples is governed by §6.1 + §6.2. Expressed as a single rule:

```
permitted(profile, blocking, persistence) :=
    NOT (persistence = complete-response AND blocking != block-on-error)
  AND NOT (persistence = complete-response AND profile != on-submit)
  AND NOT (profile = off AND blocking = block-on-error)
```

The five master-table rows satisfy this predicate. Implementations MUST validate any override against it.
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add specs/core/validation-mapping.md
git commit -m "feat(validation-mapping): S6 Master Mapping Table (§9 row 3 gate)

Five-row reconciliation: save-draft, autosave, review, submit,
request-evidence -> (profile, blocking, persistence). §6.2 overrides bounded
by the permitted-tuple predicate (prevents VE-05 and §5.4 invariant
violations). Schema MasterTable const + pytest pin this table."
```

---

## Task 9: Write S7 SubmitButton Compatibility (concept §6.6)

**Files:**
- Modify: `specs/core/validation-mapping.md`

- [ ] **Step 1: Append S7**

```markdown
## 7. SubmitButton Compatibility

Component §5.19 defines `SubmitButton` with the following load-bearing existing behavior (PRESERVED by this spec):

- `bind` is forbidden.
- `mode` ∈ {`continuous`, `submit`}, default `submit`. Controls which validation pass produces the report emitted on click.
- `emitEvent` defaults to `false`; when `true`, click dispatches `formspec-submit` CustomEvent.
- `pendingLabel` and `disableWhenPending` handle in-flight submission state.

### 7.1 The Default Submit Action Rule

Per concept §6.6: *"A SubmitButton without `actionRef` invokes the implementation's default submit action."*

A Mapping-Aware processor that encounters a legacy `SubmitButton` without `actionRef` MUST treat it as invoking an action with intent `submit`, profile `on-submit`, blocking `block-on-error`, persistence `complete-response` — the master-table row for `submit` (§6).

Concretely, this means:

1. When the button is clicked, the processor runs the `on-submit` validation profile for completion gating (Core `continuous` mode + continuous and submit-timing shapes; demand shapes remain deferred).
2. If the resulting ValidationReport's `valid` is `false`, the processor MUST NOT transition Response `status` to `completed`. It MUST preserve the Response in `status: in-progress` with full data (VE-05).
3. If `valid` is `true`, the processor MUST transition `status` to `completed`.
4. The processor's existing emit/event behavior (`formspec-submit` CustomEvent or host renderer submit API call, per Component §5.19) continues unchanged.

### 7.2 `SubmitButton.mode` Reconciliation

`SubmitButton.mode` controls the validation pass that produces the report carried on the `formspec-submit` event detail. It maps to `ValidationProfile`:

| `SubmitButton.mode` | `ValidationProfile` |
|---------------------|---------------------|
| `"continuous"`      | `live`              |
| `"submit"`          | `on-submit`         |

Authors who set `mode: "continuous"` are opting into the `live` profile for the report emitted with the event. A Mapping-Aware processor MUST honor the prop for report production, but `complete-response` persistence still requires the `on-submit` completion gate from §6.3 before Response status can become `completed`.

`SubmitButton.mode` does NOT affect Blocking Policy or Persistence Policy — those remain master-table defaults (`block-on-error`, `complete-response`). To override those, an author MUST move to a future Response Actions document with an explicit `actionRef`.

### 7.3 Future `actionRef` Compatibility

Component reference additions (concept §10.4) MAY add `actionRef` to `SubmitButton` and other trigger nodes. That future spec, not this document, will define the lookup and precedence rules for resolved Response Action documents. The only compatibility rule defined here is the fallback path for existing `SubmitButton` documents without `actionRef` (§7.1).

Until concept §10.4 lands, `actionRef` is future shape. Existing `SubmitButton` documents without `actionRef` continue to behave per §7.1.

### 7.4 Migration

There is no migration. Existing Component documents continue to work unchanged. Mapping-Aware processors gain the §7.1 interpretation; non-Mapping-Aware processors continue to follow Component §5.19 directly (which produces equivalent observable behavior for the default submit case).
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add specs/core/validation-mapping.md
git commit -m "feat(validation-mapping): S7 SubmitButton Compatibility

Concept §6.6 default-submit-action rule formalized. SubmitButton.mode
reconciliation to ValidationProfile. Future actionRef compatibility path.
No migration; existing Component docs untouched."
```

---

## Task 10: Write S8 ValidationSummary Compatibility

**Files:**
- Modify: `specs/core/validation-mapping.md`

- [ ] **Step 1: Append S8**

```markdown
## 8. ValidationSummary Compatibility

Component §6.13 `ValidationSummary` has two existing props that intersect this mapping:

- `source` ∈ {`live`, `submit`}, default `live`.
- `mode` ∈ {`continuous`, `submit`} when `source` is `live`, default `continuous`.

These are PRESERVED.

### 8.1 `source` Reconciliation

`source` selects which validation state the summary displays:

| `ValidationSummary.source` | Data displayed |
|----------------------------|----------------|
| `"live"`                   | Continuous engine state. Re-renders as Bind constraints and Shape constraints (matching `mode`) re-evaluate. |
| `"submit"`                 | The latest `formspec-submit` event detail (ValidationReport from the last submit pass). Static between submits. |

A Mapping-Aware processor MUST treat:

- `source: live` + `mode: continuous` as a passive reader of the current `live` profile state.
- `source: live` + `mode: submit` as a passive reader of the latest submit-profile state when another trigger has produced one.
- `source: submit` as a passive reader of the latest `formspec-submit` event detail. The report itself was produced by the submit action that emitted that event.

`ValidationSummary` never starts a profile run. It only reads state already produced by the engine or by a prior submit/action trigger.

### 8.2 `ValidationSummary` Has No Persistence Effect

`ValidationSummary` is a Display component. It MUST NOT trigger any Action Intent, MUST NOT mutate Response data, and MUST NOT transition Response status. This spec adds no behavior; the reconciliation here exists solely so that ValidationSummary's `source` and `mode` props have a single normative term to be expressed in.

### 8.3 Future Reference Additions Out of Scope

`ValidationSummary` is not a trigger. This document defines only its passive-reader reconciliation to existing Component §6.13 props. Future Component reference additions (concept §10.4), if any, own their own field shape and precedence rules.
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add specs/core/validation-mapping.md
git commit -m "feat(validation-mapping): S8 ValidationSummary Compatibility

source/mode props reconciled to ValidationProfile. ValidationSummary is a
Display component with no persistence effect; future actionRef out of scope."
```

---

## Task 11: Write S9 Conformance + S10 Extension + S11 Security

**Files:**
- Modify: `specs/core/validation-mapping.md`

- [ ] **Step 1: Append S9, S10, S11**

```markdown
## 9. Conformance

### 9.1 Conformance Levels

This specification defines two conformance levels (§1.4):

| Level | Requirements |
|-------|--------------|
| **Mapping-Aware Document** | Explicit intent identifier ∈ closed `ActionIntent` enum (§2) or `x-` extension intent (§10). Any override tuple satisfies the §6.3 permitted-tuple predicate. |
| **Mapping-Aware Processor** | Applies §6 master-table tuple unless the document explicitly overrides. Rejects prohibited override combinations with `VMAP-INVALID-OVERRIDE`. Honors §7.1 default-submit-action rule for SubmitButton-without-actionRef. Preserves VE-05 under all blocked-completion scenarios. |

#### 9.1.1 Mapping-Aware Document

A conformant **Mapping-Aware Document** MUST:

1. Use only `ActionIntent` values from §2 (or `x-`-prefixed extensions).
2. If overriding the master-table defaults, supply a permitted (profile, blocking, persistence) tuple per §6.3.
3. Not redefine the four enum members of any axis.

#### 9.1.2 Mapping-Aware Processor

A conformant **Mapping-Aware Processor** MUST:

1. Resolve any master-table intent to its §6 default tuple in the absence of an explicit document override.
2. Apply explicit overrides verbatim when present.
3. Reject prohibited tuples (§6.3 predicate failures) with a `VMAP-INVALID-OVERRIDE` finding.
4. Honor §7.1 default-submit-action rule for any `SubmitButton` without `actionRef`.
5. Preserve Core §5.5 VE-05 under all blocked-completion scenarios (Response data MUST remain saveable in `status: in-progress`).
6. Honor Core §5.5 disabled-mode under `ValidationProfile: off` (no ValidationReport produced).

### 9.2 Schema

<!-- schema-ref:start id=validation-mapping-top-level schema=schemas/validation-mapping.schema.json pointers=# -->
<!-- schema-ref:end -->

### 9.3 `$defs` Reference

<!-- schema-ref:start id=validation-mapping-defs schema=schemas/validation-mapping.schema.json pointers=#/$defs/ActionIntent,#/$defs/ValidationProfile,#/$defs/BlockingPolicy,#/$defs/PersistencePolicy,#/$defs/MappingEntry,#/$defs/MasterTable -->
<!-- schema-ref:end -->

### 9.4 Conformance Prohibitions

A conformant processor MUST NOT:

1. Apply a master-table tuple that contradicts §6.
2. Introduce standard `ActionIntent` values outside §2 unless the value is an `x-` extension intent, or introduce any `ValidationProfile`, `BlockingPolicy`, or `PersistencePolicy` value outside this spec's closed enums.
3. Cause persistence to be blocked by validation findings under any policy other than `complete-response` (VE-05).
4. Produce a `completed`-status Response when ValidationReport `valid` is `false` (Core §5.4 invariant).
5. Discard Response data on a blocked submission.

## 10. Extension Points

Authors MAY introduce custom `ActionIntent` values under the `x-` prefix (e.g., `x-acme-bulk-import`). Each `x-` intent MUST carry a complete (profile, blocking, persistence) triple in the Response Actions document referencing it. Mapping-Aware processors that do not recognize the intent MUST honor the document-supplied triple verbatim.

Extensions MUST NOT:

1. Override or shadow a master-table intent name.
2. Introduce parallel `ValidationProfile`, `BlockingPolicy`, or `PersistencePolicy` enum values. Profiles and policies are closed; richer behavior MUST be expressed by an `x-` intent paired with an existing-enum triple.
3. Bypass the §6.3 permitted-tuple predicate.

## 11. Security Considerations

The Validation Mapping is metadata over existing Core and Component behavior. It introduces no new attack surface, no new credential handling, and no new persistence pathway. Security considerations are:

- **Override misuse.** An override that pairs `complete-response` with `non-blocking` or any profile other than `on-submit` would allow invalid or incompletely validated Responses to reach `completed`. The §6.3 permitted-tuple predicate MUST be enforced; processors that skip the predicate check create a compliance regression.
- **Profile substitution attacks.** A malicious or buggy document that substitutes `off`, `live`, or `on-demand` for `on-submit` in a completion action would silently bypass part or all of validation. The §6.3 predicate blocks this case; processors MUST reject it.
- **Information disclosure.** ValidationReport content under `live` and `on-submit` profiles may include error messages with respondent values. Renderers that display the report MUST follow Core §5.7 sanitization guidance.
- **VE-05 preservation under failure.** A blocked-submission scenario MUST preserve Response data. A processor that discards data on submission failure violates VE-05 and creates data-loss potential.

There is no prompt-injection surface in this spec; the mapping does not interact with AI providers.

---

## Appendix A: References

| Tag | Reference |
|---|---|
| [rfc2119] | Bradner, S., "Key words for use in RFCs to Indicate Requirement Levels", BCP 14, RFC 2119, March 1997. |
| [RFC 8174] | Leiba, B., "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words", BCP 14, RFC 8174, May 2017. |
| [RFC 8259] | Bray, T., Ed., "The JavaScript Object Notation (JSON) Data Interchange Format", STD 90, RFC 8259, December 2017. |
| Concept | Formspec Semantic Layers (Experience / Response Actions / Trace), thoughts/specs/2026-05-20-formspec-semantic-layers.md. |
| Core | Formspec v1.0 — A JSON-Native Declarative Form Standard, specs/core/spec.md. |
| Component | Formspec Component Specification v1.0, specs/component/component-spec.md. |
| Response | response.schema.json. |
| ValidationReport | validation-report.schema.json. |
| ValidationResult | validation-result.schema.json. |

*End of Formspec Validation Mapping.*
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add specs/core/validation-mapping.md
git commit -m "feat(validation-mapping): S9 Conformance + S10 Extensions + S11 Security

Two conformance levels, schema-ref markers awaiting schema, extension model
(closed enums except ActionIntent which permits x- intents), security
considerations centered on override misuse + VE-05 preservation."
```

---

## Task 12: Schema envelope + failing schema-acceptance test (TDD red)

**Files:**
- Create: `tests/conformance/schemas/test_validation_mapping_schema.py`
- Create: `schemas/validation-mapping.schema.json` (envelope only)

- [ ] **Step 1: Write the failing schema-acceptance test FIRST**

Create `tests/conformance/schemas/test_validation_mapping_schema.py`:

```python
"""Schema acceptance tests for the Validation Mapping companion spec.

Loads schemas/validation-mapping.schema.json and pins its expected `$defs`.
Fixture shape validation lives in tests/conformance/spec/test_validation_mapping_table.py.
"""
import json
from pathlib import Path

import jsonschema
import pytest

SCHEMA_PATH = Path(__file__).resolve().parents[3] / "schemas" / "validation-mapping.schema.json"
FIXTURES_DIR = Path(__file__).resolve().parents[2] / "conformance" / "fixtures" / "validation-mapping"


@pytest.fixture(scope="module")
def schema():
    with SCHEMA_PATH.open() as f:
        return json.load(f)


@pytest.fixture(scope="module")
def validator(schema):
    return jsonschema.Draft202012Validator(schema)


def _load(name: str) -> dict:
    with (FIXTURES_DIR / name).open() as f:
        return json.load(f)


class TestValidationMappingSchemaShape:
    def test_schema_has_expected_defs(self, schema):
        defs = schema.get("$defs", {})
        for name in ("ActionIntent", "ValidationProfile", "BlockingPolicy", "PersistencePolicy", "MappingEntry", "MasterTable"):
            assert name in defs, f"Missing $def: {name}"

    def test_action_intent_enum_is_closed(self, schema):
        ai = schema["$defs"]["ActionIntent"]
        assert ai.get("enum") == [
            "save-draft",
            "autosave",
            "review",
            "submit",
            "request-evidence",
        ]

    def test_profile_enum_is_closed(self, schema):
        vp = schema["$defs"]["ValidationProfile"]
        assert vp.get("enum") == ["live", "on-submit", "on-demand", "off"]

    def test_blocking_enum_is_closed(self, schema):
        bp = schema["$defs"]["BlockingPolicy"]
        assert bp.get("enum") == ["non-blocking", "block-on-error"]

    def test_persistence_enum_is_closed(self, schema):
        pp = schema["$defs"]["PersistencePolicy"]
        assert pp.get("enum") == ["none", "draft-checkpoint", "complete-response"]

    def test_mapping_entry_allows_x_intent_extension(self, schema):
        entry_schema = {
            "$schema": schema["$schema"],
            "$defs": schema["$defs"],
            "$ref": "#/$defs/MappingEntry",
        }
        jsonschema.Draft202012Validator(entry_schema).validate({
            "intent": "x-acme-bulk-import",
            "profile": "on-submit",
            "blocking": "block-on-error",
            "persistence": "complete-response",
        })

    def test_mapping_entry_rejects_unprefixed_unknown_intent(self, schema):
        entry_schema = {
            "$schema": schema["$schema"],
            "$defs": schema["$defs"],
            "$ref": "#/$defs/MappingEntry",
        }
        validator = jsonschema.Draft202012Validator(entry_schema)
        errors = list(validator.iter_errors({
            "intent": "quickSave",
            "profile": "off",
            "blocking": "non-blocking",
            "persistence": "draft-checkpoint",
        }))
        assert errors, "Unprefixed non-enum intents MUST be rejected"

    @pytest.mark.parametrize("bad_entry", [
        {
            "intent": "submit",
            "profile": "live",
            "blocking": "block-on-error",
            "persistence": "complete-response",
        },
        {
            "intent": "submit",
            "profile": "on-demand",
            "blocking": "block-on-error",
            "persistence": "complete-response",
        },
        {
            "intent": "submit",
            "profile": "on-submit",
            "blocking": "non-blocking",
            "persistence": "complete-response",
        },
        {
            "intent": "save-draft",
            "profile": "off",
            "blocking": "block-on-error",
            "persistence": "draft-checkpoint",
        },
    ])
    def test_mapping_entry_schema_rejects_prohibited_tuples(self, schema, bad_entry):
        entry_schema = {
            "$schema": schema["$schema"],
            "$defs": schema["$defs"],
            "$ref": "#/$defs/MappingEntry",
        }
        validator = jsonschema.Draft202012Validator(entry_schema)
        assert list(validator.iter_errors(bad_entry)), bad_entry
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd formspec && python3 -m pytest tests/conformance/schemas/test_validation_mapping_schema.py -v`
Expected: All tests FAIL with `FileNotFoundError` — the schema file does not exist yet. This is the red state.

- [ ] **Step 3: Write the schema envelope**

Create `schemas/validation-mapping.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://formspec.org/schemas/validationMapping/1.0",
  "title": "Formspec Validation Mapping",
  "description": "Closed vocabularies and the master mapping table that reconciles Action Intent, Validation Profile, Blocking Policy, and Persistence Policy across Formspec Core §5 (Validation), Component §5.19 (SubmitButton), Component §6.13 (ValidationSummary), and the Response status lifecycle. See specs/core/validation-mapping.md for the normative prose. This schema's MasterTable const MUST equal the prose §6 row-for-row; conformance is pinned by tests/conformance/spec/test_validation_mapping_table.py.",
  "type": "object",
  "required": ["$formspecValidationMapping", "version"],
  "additionalProperties": false,
  "properties": {
    "$formspecValidationMapping": {
      "type": "string",
      "const": "1.0",
      "description": "Validation Mapping specification version. MUST be '1.0'.",
      "examples": ["1.0"],
      "x-lm": { "critical": true, "intent": "Version pin for validation-mapping document compatibility" }
    },
    "version": {
      "type": "string",
      "minLength": 1,
      "description": "Version of this Validation Mapping Document. SemVer RECOMMENDED.",
      "examples": ["1.0.0"]
    }
  },
  "$defs": {}
}
```

- [ ] **Step 4: Run tests; expect all schema-shape tests to FAIL on the `$defs` checks**

Run: `cd formspec && python3 -m pytest tests/conformance/schemas/test_validation_mapping_schema.py -v`
Expected: `test_schema_has_expected_defs` FAILS (empty `$defs`); the enum-closure and `MappingEntry` tests also FAIL with `KeyError`. This is the red state for Tasks 13–16.

- [ ] **Step 5: Commit**

```bash
cd formspec && git add schemas/validation-mapping.schema.json tests/conformance/schemas/test_validation_mapping_schema.py
git commit -m "feat(validation-mapping): schema envelope + failing schema test (TDD red)

Schema envelope with empty \$defs. Test asserts six expected \$defs, closure
of four enums, and MappingEntry x-intent behavior. Assertions currently FAIL —
populated in Tasks 13-16."
```

---

## Task 13: Schema $defs — ActionIntent (TDD green for 2 tests)

**Files:**
- Modify: `schemas/validation-mapping.schema.json`

- [ ] **Step 1: Add `ActionIntent` to `$defs`**

Edit `schemas/validation-mapping.schema.json`, replacing `"$defs": {}` with:

```json
"$defs": {
  "ActionIntent": {
    "type": "string",
    "enum": [
      "save-draft",
      "autosave",
      "review",
      "submit",
      "request-evidence"
    ],
    "description": "Closed, abstract enum naming what a form caller is trying to do. save-draft: persist current Response as a draft, validation findings ignored. autosave: background or periodic save, identical mapping to save-draft. review: read-only validation pass; no persistence transition. submit: attempt transition to Response status 'completed'. request-evidence: invoke demand-timing shapes (Core §5.2.1) only. See specs/core/validation-mapping.md §2.",
    "examples": ["save-draft", "submit", "request-evidence"],
    "x-lm": {
      "critical": true,
      "intent": "Closed action-intent vocabulary; x- prefix permitted for publisher extensions"
    }
  }
}
```

- [ ] **Step 2: Run tests; expect `test_schema_has_expected_defs` still failing, `test_action_intent_enum_is_closed` PASSING**

Run: `cd formspec && python3 -m pytest tests/conformance/schemas/test_validation_mapping_schema.py::TestValidationMappingSchemaShape -v`
Expected: `test_action_intent_enum_is_closed` PASSES; the other six FAIL (defs incomplete).

- [ ] **Step 3: Commit**

```bash
cd formspec && git add schemas/validation-mapping.schema.json
git commit -m "feat(validation-mapping): schema \$defs ActionIntent (closed enum)"
```

---

## Task 14: Schema $defs — ValidationProfile

**Files:**
- Modify: `schemas/validation-mapping.schema.json`

- [ ] **Step 1: Append `ValidationProfile` inside `$defs`**

Append after `ActionIntent`:

```json
"ValidationProfile": {
  "type": "string",
  "enum": ["live", "on-submit", "on-demand", "off"],
  "description": "Closed named profile pinning a (Core global mode, per-shape timing filter) pair under a single identifier. live: Core 'continuous' + continuous-timing shapes during normal revalidation. on-submit: Core 'continuous' + continuous and submit-timing shapes; demand shapes excluded. on-demand: Core 'deferred' + only demand-timing shapes fire. off: Core 'disabled' + no shapes fire (no ValidationReport produced). See specs/core/validation-mapping.md §3.",
  "examples": ["live", "on-submit", "off"],
  "x-lm": {
    "critical": true,
    "intent": "Closed validation-profile vocabulary; resolves concept-note §11.2 open question"
  }
}
```

- [ ] **Step 2: Run tests**

Run: `cd formspec && python3 -m pytest tests/conformance/schemas/test_validation_mapping_schema.py::TestValidationMappingSchemaShape::test_profile_enum_is_closed -v`
Expected: PASSES.

- [ ] **Step 3: Commit**

```bash
cd formspec && git add schemas/validation-mapping.schema.json
git commit -m "feat(validation-mapping): schema \$defs ValidationProfile (closed enum)"
```

---

## Task 15: Schema $defs — BlockingPolicy + PersistencePolicy

**Files:**
- Modify: `schemas/validation-mapping.schema.json`

- [ ] **Step 1: Append `BlockingPolicy` and `PersistencePolicy` inside `$defs`**

Append after `ValidationProfile`:

```json
"BlockingPolicy": {
  "type": "string",
  "enum": ["non-blocking", "block-on-error"],
  "description": "Closed two-value enum naming whether error-severity findings stop the surrounding intent. non-blocking: findings never stop the intent. block-on-error: intent halts before higher-persistence transitions when ValidationReport.valid is false (counts.error > 0). Preserves Core §5.5 VE-05 by blocking the transition, not the underlying data persistence. See specs/core/validation-mapping.md §4.",
  "examples": ["non-blocking", "block-on-error"]
},
"PersistencePolicy": {
  "type": "string",
  "enum": ["none", "draft-checkpoint", "complete-response"],
  "description": "Closed three-value enum naming the Response lifecycle effect of the intent. none: no status change, no persistence. draft-checkpoint: persist current Response state, status remains 'in-progress' (permitted under any validation outcome, VE-05). complete-response: persist AND transition status to 'completed' (requires ValidationReport.valid === true, Core §5.4 invariant). See specs/core/validation-mapping.md §5.",
  "examples": ["draft-checkpoint", "complete-response"]
}
```

- [ ] **Step 2: Run tests**

Run: `cd formspec && python3 -m pytest tests/conformance/schemas/test_validation_mapping_schema.py::TestValidationMappingSchemaShape -v`
Expected: `test_blocking_enum_is_closed` and `test_persistence_enum_is_closed` PASS. `test_schema_has_expected_defs` and the `MappingEntry` extension tests still FAIL (missing MappingEntry, MasterTable).

- [ ] **Step 3: Commit**

```bash
cd formspec && git add schemas/validation-mapping.schema.json
git commit -m "feat(validation-mapping): schema \$defs BlockingPolicy + PersistencePolicy"
```

---

## Task 16: Schema $defs — MappingEntry + MasterTable const (TDD green for remaining tests)

**Files:**
- Modify: `schemas/validation-mapping.schema.json`

- [ ] **Step 1: Append `MappingEntry` and `MasterTable` inside `$defs`**

Append after `PersistencePolicy`:

```json
"MappingEntry": {
  "type": "object",
  "required": ["intent", "profile", "blocking", "persistence"],
  "additionalProperties": false,
  "properties": {
    "intent": {
      "anyOf": [
        { "$ref": "#/$defs/ActionIntent" },
        {
          "type": "string",
          "pattern": "^x-",
          "description": "Publisher-defined action intent extension. MUST carry an explicit mapping tuple and MUST NOT shadow a master-table intent."
        }
      ]
    },
    "profile": { "$ref": "#/$defs/ValidationProfile" },
    "blocking": { "$ref": "#/$defs/BlockingPolicy" },
    "persistence": { "$ref": "#/$defs/PersistencePolicy" }
  },
  "allOf": [
    {
      "if": {
        "properties": { "persistence": { "const": "complete-response" } },
        "required": ["persistence"]
      },
      "then": {
        "properties": {
          "profile": { "const": "on-submit" },
          "blocking": { "const": "block-on-error" }
        }
      }
    },
    {
      "not": {
        "properties": {
          "profile": { "const": "off" },
          "blocking": { "const": "block-on-error" }
        },
        "required": ["profile", "blocking"]
      }
    }
  ],
  "description": "A single row of the master mapping table or a Response Actions override. Permitted (profile, blocking, persistence) tuples are governed by the §6.3 predicate; processors MUST reject overrides that violate it.",
  "examples": [
    { "intent": "submit", "profile": "on-submit", "blocking": "block-on-error", "persistence": "complete-response" },
    { "intent": "x-acme-bulk-import", "profile": "on-submit", "blocking": "block-on-error", "persistence": "complete-response" }
  ],
  "x-lm": {
    "critical": true,
    "intent": "Single mapping row referenced by Response Actions schema (forthcoming, concept §10.2)"
  }
},
"MasterTable": {
  "type": "array",
  "minItems": 5,
  "maxItems": 5,
  "uniqueItems": true,
  "items": { "$ref": "#/$defs/MappingEntry" },
  "const": [
    { "intent": "save-draft",       "profile": "off",       "blocking": "non-blocking",  "persistence": "draft-checkpoint" },
    { "intent": "autosave",         "profile": "off",       "blocking": "non-blocking",  "persistence": "draft-checkpoint" },
    { "intent": "review",           "profile": "on-submit", "blocking": "non-blocking",  "persistence": "none" },
    { "intent": "submit",           "profile": "on-submit", "blocking": "block-on-error","persistence": "complete-response" },
    { "intent": "request-evidence", "profile": "on-demand", "blocking": "non-blocking",  "persistence": "draft-checkpoint" }
  ],
  "description": "Frozen master mapping table. MUST equal specs/core/validation-mapping.md §6 row-for-row. The const constrains any document carrying this property to the canonical table; documents that override individual entries do so per Action, not by replacing the master table."
}
```

- [ ] **Step 2: Run all schema-shape tests; all should PASS**

Run: `cd formspec && python3 -m pytest tests/conformance/schemas/test_validation_mapping_schema.py -v`
Expected: All schema-shape tests PASS. TDD green for enum closure, `x-` intent extension handling, and schema-enforced prohibited tuples.

- [ ] **Step 3: Commit**

```bash
cd formspec && git add schemas/validation-mapping.schema.json
git commit -m "feat(validation-mapping): schema \$defs MappingEntry + MasterTable const

MasterTable is a const-fixed array of 5 MappingEntries matching §6 prose row
for row. Schema acceptance test now fully green."
```

---

## Task 17: Fixture — shared Definition base

**Files:**
- Create: `tests/conformance/fixtures/validation-mapping/definition-base.json`

- [ ] **Step 1: Create the shared Definition**

Create `tests/conformance/fixtures/validation-mapping/definition-base.json`:

```json
{
  "$formspec": "1.0",
  "version": "1.0.0",
  "url": "https://example.gov/forms/validation-mapping-base",
  "status": "active",
  "title": "Validation Mapping Base",
  "items": [
    {
      "key": "applicantName",
      "type": "field",
      "dataType": "string",
      "label": "Applicant name"
    },
    {
      "key": "phone",
      "type": "field",
      "dataType": "string",
      "label": "Phone"
    }
  ],
  "binds": [
    {
      "path": "applicantName",
      "required": "true"
    }
  ],
  "shapes": [
    {
      "id": "phone-format-warning",
      "severity": "warning",
      "timing": "continuous",
      "target": "phone",
      "constraint": "$ = null or matches($, '^\\\\+?[0-9 ()-]{7,}$')",
      "message": "Phone number format looks unusual; please confirm."
    },
    {
      "id": "applicantName-min-length",
      "severity": "error",
      "timing": "continuous",
      "target": "applicantName",
      "constraint": "$ = null or length($) >= 2",
      "message": "Applicant name must be at least 2 characters."
    },
    {
      "id": "submit-review-check",
      "severity": "error",
      "timing": "submit",
      "target": "applicantName",
      "constraint": "$ != 'A'",
      "message": "Applicant name must pass the submit-time review check."
    },
    {
      "id": "duplicate-applicant-check",
      "severity": "error",
      "timing": "demand",
      "target": "applicantName",
      "constraint": "false",
      "message": "Server-side duplicate-applicant check failed (demand-timing placeholder)."
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add tests/conformance/fixtures/validation-mapping/definition-base.json
git commit -m "feat(validation-mapping): shared Definition fixture

One required item (applicantName), one continuous-warning shape (phone format),
one continuous-error shape (name min length), one submit-timing error shape,
and one intentionally failing demand-timing error shape. Exercises every axis
the mapping touches, including proof that submit includes submit-timing shapes
and excludes demand shapes."
```

---

## Task 18: Fixture — intent-save-draft (invalid draft allowed)

**Files:**
- Create: `tests/conformance/fixtures/validation-mapping/intent-save-draft.json`

- [ ] **Step 1: Create the fixture**

Create `tests/conformance/fixtures/validation-mapping/intent-save-draft.json`:

```json
{
  "fixture": "intent-save-draft",
  "description": "Invalid Response saved as draft. Profile 'off' produces no ValidationReport. Persistence 'draft-checkpoint' succeeds despite invalid applicantName and phone values. VE-05 preserved.",
  "definition": "definition-base.json",
  "action": {
    "intent": "save-draft",
    "profile": "off",
    "blocking": "non-blocking",
    "persistence": "draft-checkpoint"
  },
  "responseBefore": {
    "$formspecResponse": "1.0",
    "id": "rsp-save-draft-0001",
    "definitionUrl": "https://example.gov/forms/validation-mapping-base",
    "definitionVersion": "1.0.0",
    "status": "in-progress",
    "data": { "applicantName": "A", "phone": "not-a-phone" },
    "authored": "2026-05-22T10:00:00Z"
  },
  "expected": {
    "statusAfter": "in-progress",
    "persisted": true,
    "validationReportProduced": false
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add tests/conformance/fixtures/validation-mapping/intent-save-draft.json
git commit -m "feat(validation-mapping): fixture intent-save-draft

Invalid Response saved as draft. Profile off -> no ValidationReport. VE-05
preserved (persisted=true regardless of validation state)."
```

---

## Task 19: Fixture — intent-submit-blocked

**Files:**
- Create: `tests/conformance/fixtures/validation-mapping/intent-submit-blocked.json`

- [ ] **Step 1: Create the fixture**

Create `tests/conformance/fixtures/validation-mapping/intent-submit-blocked.json`:

```json
{
  "fixture": "intent-submit-blocked",
  "description": "Invalid Response submit attempt. Profile 'on-submit' evaluates continuous and submit-timing shapes; demand shapes remain deferred. Error-severity findings present. Blocking 'block-on-error' halts completion. Persistence 'complete-response' NOT reached; Response remains in-progress with full data (VE-05).",
  "definition": "definition-base.json",
  "action": {
    "intent": "submit",
    "profile": "on-submit",
    "blocking": "block-on-error",
    "persistence": "complete-response"
  },
  "responseBefore": {
    "$formspecResponse": "1.0",
    "id": "rsp-submit-blocked-0001",
    "definitionUrl": "https://example.gov/forms/validation-mapping-base",
    "definitionVersion": "1.0.0",
    "status": "in-progress",
    "data": { "applicantName": "A", "phone": "not-a-phone" },
    "authored": "2026-05-22T10:00:00Z"
  },
  "expected": {
    "statusAfter": "in-progress",
    "responseAfter": {
      "$formspecResponse": "1.0",
      "id": "rsp-submit-blocked-0001",
      "definitionUrl": "https://example.gov/forms/validation-mapping-base",
      "definitionVersion": "1.0.0",
      "status": "in-progress",
      "data": { "applicantName": "A", "phone": "not-a-phone" },
      "authored": "2026-05-22T10:00:00Z"
    },
    "checkpointPersisted": true,
    "completedPersisted": false,
    "validationReportProduced": true,
    "validationReport": {
      "$formspecValidationReport": "1.0",
      "valid": false,
      "results": [
        {
          "$formspecValidationResult": "1.0",
          "path": "phone",
          "severity": "warning",
          "constraintKind": "shape",
          "shapeId": "phone-format-warning",
          "message": "Phone number format looks unusual; please confirm."
        },
        {
          "$formspecValidationResult": "1.0",
          "path": "applicantName",
          "severity": "error",
          "constraintKind": "shape",
          "shapeId": "applicantName-min-length",
          "message": "Applicant name must be at least 2 characters."
        },
        {
          "$formspecValidationResult": "1.0",
          "path": "applicantName",
          "severity": "error",
          "constraintKind": "shape",
          "shapeId": "submit-review-check",
          "message": "Applicant name must pass the submit-time review check."
        }
      ],
      "counts": { "error": 2, "warning": 1, "info": 0 },
      "timestamp": "2026-05-22T10:00:00Z"
    },
    "shapesFired": ["phone-format-warning", "applicantName-min-length", "submit-review-check"],
    "shapesDeferred": ["duplicate-applicant-check"],
    "transitionBlocked": true,
    "blockReason": "block-on-error: counts.error > 0"
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add tests/conformance/fixtures/validation-mapping/intent-submit-blocked.json
git commit -m "feat(validation-mapping): fixture intent-submit-blocked

Invalid Response submit. Profile on-submit fires continuous/submit shapes only;
demand shape stays deferred. Transition blocked; data preserved (VE-05)."
```

---

## Task 20: Fixture — intent-submit-warning-only

**Files:**
- Create: `tests/conformance/fixtures/validation-mapping/intent-submit-warning-only.json`

- [ ] **Step 1: Create the fixture**

Create `tests/conformance/fixtures/validation-mapping/intent-submit-warning-only.json`:

```json
{
  "fixture": "intent-submit-warning-only",
  "description": "Response with only warning findings is submittable. Profile 'on-submit' produces report with counts.error === 0; ValidationReport.valid === true (Core §5.4 invariant). Blocking 'block-on-error' does not engage. Persistence 'complete-response' transitions status to 'completed'.",
  "definition": "definition-base.json",
  "action": {
    "intent": "submit",
    "profile": "on-submit",
    "blocking": "block-on-error",
    "persistence": "complete-response"
  },
  "responseBefore": {
    "$formspecResponse": "1.0",
    "id": "rsp-submit-warning-0001",
    "definitionUrl": "https://example.gov/forms/validation-mapping-base",
    "definitionVersion": "1.0.0",
    "status": "in-progress",
    "data": { "applicantName": "Alex", "phone": "not-a-phone" },
    "authored": "2026-05-22T10:00:00Z"
  },
  "expected": {
    "statusAfter": "completed",
    "persisted": true,
    "validationReportProduced": true,
    "validationReport": {
      "$formspecValidationReport": "1.0",
      "valid": true,
      "results": [
        {
          "$formspecValidationResult": "1.0",
          "path": "phone",
          "severity": "warning",
          "constraintKind": "shape",
          "shapeId": "phone-format-warning",
          "message": "Phone number format looks unusual; please confirm."
        }
      ],
      "counts": { "error": 0, "warning": 1, "info": 0 },
      "timestamp": "2026-05-22T10:00:00Z"
    },
    "shapesFired": ["phone-format-warning", "applicantName-min-length", "submit-review-check"],
    "shapesDeferred": ["duplicate-applicant-check"],
    "transitionBlocked": false
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add tests/conformance/fixtures/validation-mapping/intent-submit-warning-only.json
git commit -m "feat(validation-mapping): fixture intent-submit-warning-only

Warning-only submission completes successfully. Confirms only error severity
blocks completion (Core §5.4 invariant valid = counts.error === 0)."
```

---

## Task 21: Fixture — intent-request-evidence (demand-timing)

**Files:**
- Create: `tests/conformance/fixtures/validation-mapping/intent-request-evidence.json`

- [ ] **Step 1: Create the fixture**

Create `tests/conformance/fixtures/validation-mapping/intent-request-evidence.json`:

```json
{
  "fixture": "intent-request-evidence",
  "description": "Demand-timing shape invocation. Profile 'on-demand' fires ONLY shapes whose declared timing is 'demand'; continuous and submit-timing shapes are deferred. duplicate-applicant-check evaluates and fails; phone-format-warning, applicantName-min-length, and submit-review-check do NOT fire. Non-blocking; persistence 'draft-checkpoint'.",
  "definition": "definition-base.json",
  "action": {
    "intent": "request-evidence",
    "profile": "on-demand",
    "blocking": "non-blocking",
    "persistence": "draft-checkpoint"
  },
  "responseBefore": {
    "$formspecResponse": "1.0",
    "id": "rsp-evidence-0001",
    "definitionUrl": "https://example.gov/forms/validation-mapping-base",
    "definitionVersion": "1.0.0",
    "status": "in-progress",
    "data": { "applicantName": "Alex Quill", "phone": "+1 555 0100" },
    "authored": "2026-05-22T10:00:00Z"
  },
  "expected": {
    "statusAfter": "in-progress",
    "persisted": true,
    "validationReportProduced": true,
    "validationReport": {
      "$formspecValidationReport": "1.0",
      "valid": false,
      "results": [
        {
          "$formspecValidationResult": "1.0",
          "path": "applicantName",
          "severity": "error",
          "constraintKind": "shape",
          "shapeId": "duplicate-applicant-check",
          "message": "Server-side duplicate-applicant check failed (demand-timing placeholder)."
        }
      ],
      "counts": { "error": 1, "warning": 0, "info": 0 },
      "timestamp": "2026-05-22T10:00:00Z"
    },
    "shapesFired": ["duplicate-applicant-check"],
    "shapesDeferred": ["phone-format-warning", "applicantName-min-length", "submit-review-check"]
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add tests/conformance/fixtures/validation-mapping/intent-request-evidence.json
git commit -m "feat(validation-mapping): fixture intent-request-evidence

Demand-timing invocation. Only timing:demand shape fires and fails; continuous
and submit-timing shapes stay deferred. Non-blocking draft checkpoint succeeds."
```

---

## Task 22: Fixture — intent-autosave-disabled (profile off)

**Files:**
- Create: `tests/conformance/fixtures/validation-mapping/intent-autosave-disabled.json`

- [ ] **Step 1: Create the fixture**

Create `tests/conformance/fixtures/validation-mapping/intent-autosave-disabled.json`:

```json
{
  "fixture": "intent-autosave-disabled",
  "description": "Background autosave of invalid Response. Profile 'off' produces NO ValidationReport; profile 'off' identical to save-draft mapping but named separately for audit/telemetry distinction (§2). Persistence 'draft-checkpoint' succeeds.",
  "definition": "definition-base.json",
  "action": {
    "intent": "autosave",
    "profile": "off",
    "blocking": "non-blocking",
    "persistence": "draft-checkpoint"
  },
  "responseBefore": {
    "$formspecResponse": "1.0",
    "id": "rsp-autosave-0001",
    "definitionUrl": "https://example.gov/forms/validation-mapping-base",
    "definitionVersion": "1.0.0",
    "status": "in-progress",
    "data": { "applicantName": "", "phone": null },
    "authored": "2026-05-22T10:00:00Z"
  },
  "expected": {
    "statusAfter": "in-progress",
    "persisted": true,
    "validationReportProduced": false
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add tests/conformance/fixtures/validation-mapping/intent-autosave-disabled.json
git commit -m "feat(validation-mapping): fixture intent-autosave-disabled

Autosave with profile off. Confirms save-draft and autosave share the same
mapping tuple; distinct names exist only for audit/telemetry."
```

---

## Task 23: Fixture — master-table.json (machine-readable trace)

**Files:**
- Create: `tests/conformance/fixtures/validation-mapping/master-table.json`

- [ ] **Step 1: Create the fixture**

Create `tests/conformance/fixtures/validation-mapping/master-table.json`:

```json
{
  "fixture": "master-table",
  "description": "Machine-readable form of the §6 Master Mapping Table. Single source of truth for tests/conformance/spec/test_validation_mapping_table.py. MUST equal schema MasterTable const row-for-row.",
  "table": [
    { "intent": "save-draft",       "profile": "off",       "blocking": "non-blocking",   "persistence": "draft-checkpoint" },
    { "intent": "autosave",         "profile": "off",       "blocking": "non-blocking",   "persistence": "draft-checkpoint" },
    { "intent": "review",           "profile": "on-submit", "blocking": "non-blocking",   "persistence": "none" },
    { "intent": "submit",           "profile": "on-submit", "blocking": "block-on-error", "persistence": "complete-response" },
    { "intent": "request-evidence", "profile": "on-demand", "blocking": "non-blocking",   "persistence": "draft-checkpoint" }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add tests/conformance/fixtures/validation-mapping/master-table.json
git commit -m "feat(validation-mapping): master-table fixture

Machine-readable form of §6 prose table. test_validation_mapping_table.py
pins this against the schema MasterTable const."
```

---

## Task 24: Pytest — master-table pin

**Files:**
- Create: `tests/conformance/spec/test_validation_mapping_table.py`

- [ ] **Step 1: Write the master-table pin test**

Create `tests/conformance/spec/test_validation_mapping_table.py`:

```python
"""Master mapping table pin.

Pins the machine-readable table and fixture semantics against the prose:

  schemas/validation-mapping.schema.json  ($defs.MasterTable.const)
  tests/conformance/fixtures/validation-mapping/master-table.json  (table)
  Permitted-tuple predicate from §6.3.
  Validation Mapping fixture outcomes (profile filtering, reports, status transitions).

If any drifts, the test fails — the §9 row-3 promotion gate has been broken.
"""
import json
import re
from copy import deepcopy
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from tests.unit.support.schema_fixtures import build_schema_registry, load_schema

ROOT = Path(__file__).resolve().parents[3]
SCHEMA_PATH = ROOT / "schemas" / "validation-mapping.schema.json"
MASTER_FIXTURE = ROOT / "tests" / "conformance" / "fixtures" / "validation-mapping" / "master-table.json"
FIXTURES_DIR = ROOT / "tests" / "conformance" / "fixtures" / "validation-mapping"
INTENT_FIXTURES = [
    "intent-save-draft.json",
    "intent-submit-blocked.json",
    "intent-submit-warning-only.json",
    "intent-request-evidence.json",
    "intent-autosave-disabled.json",
]

EXPECTED_TABLE = [
    {"intent": "save-draft",       "profile": "off",       "blocking": "non-blocking",   "persistence": "draft-checkpoint"},
    {"intent": "autosave",         "profile": "off",       "blocking": "non-blocking",   "persistence": "draft-checkpoint"},
    {"intent": "review",           "profile": "on-submit", "blocking": "non-blocking",   "persistence": "none"},
    {"intent": "submit",           "profile": "on-submit", "blocking": "block-on-error", "persistence": "complete-response"},
    {"intent": "request-evidence", "profile": "on-demand", "blocking": "non-blocking",   "persistence": "draft-checkpoint"},
]


@pytest.fixture(scope="module")
def schema():
    with SCHEMA_PATH.open() as f:
        return json.load(f)


@pytest.fixture(scope="module")
def master_fixture():
    with MASTER_FIXTURE.open() as f:
        return json.load(f)


def _load_fixture(name: str) -> dict:
    with (FIXTURES_DIR / name).open() as f:
        return json.load(f)


@pytest.fixture(scope="module")
def definition_validator():
    definition_schema = load_schema("definition.schema.json")
    common_schema = load_schema("common.schema.json")
    return Draft202012Validator(
        definition_schema,
        registry=build_schema_registry(common_schema, definition_schema),
    )


@pytest.fixture(scope="module")
def response_validator():
    response_schema = load_schema("response.schema.json")
    validation_result_schema = load_schema("validation-result.schema.json")
    return Draft202012Validator(
        response_schema,
        registry=build_schema_registry(response_schema, validation_result_schema),
    )


@pytest.fixture(scope="module")
def validation_report_validator():
    validation_report_schema = load_schema("validation-report.schema.json")
    validation_result_schema = load_schema("validation-result.schema.json")
    return Draft202012Validator(
        validation_report_schema,
        registry=build_schema_registry(validation_report_schema, validation_result_schema),
    )


@pytest.fixture(scope="module")
def mapping_entry_validator(schema):
    entry_schema = {
        "$schema": schema["$schema"],
        "$defs": schema["$defs"],
        "$ref": "#/$defs/MappingEntry",
    }
    return Draft202012Validator(entry_schema)


def _shape_timings_for_profile(profile: str) -> set[str]:
    if profile == "off":
        return set()
    if profile == "live":
        return {"continuous"}
    if profile == "on-submit":
        return {"continuous", "submit"}
    if profile == "on-demand":
        return {"demand"}
    raise AssertionError(f"Unexpected profile: {profile}")


def _shape_fails(shape: dict, data: dict) -> bool:
    """Reference evaluator for this fixture corpus, not a general FEL evaluator."""
    shape_id = shape["id"]
    if shape_id == "phone-format-warning":
        value = data.get("phone")
        return not (value is None or re.fullmatch(r"\+?[0-9 ()-]{7,}", value or ""))
    if shape_id == "applicantName-min-length":
        value = data.get("applicantName")
        return not (value is None or len(value) >= 2)
    if shape_id == "submit-review-check":
        return data.get("applicantName") == "A"
    if shape_id == "duplicate-applicant-check":
        return True
    raise AssertionError(f"Unexpected shape: {shape_id}")


def _result_for(shape: dict) -> dict:
    return {
        "$formspecValidationResult": "1.0",
        "path": shape["target"],
        "severity": shape.get("severity", "error"),
        "constraintKind": "shape",
        "shapeId": shape["id"],
        "message": shape["message"],
    }


def _report_for(definition: dict, response: dict, profile: str) -> tuple[dict | None, list[str], list[str]]:
    fired_timings = _shape_timings_for_profile(profile)
    if not fired_timings:
        return None, [], [shape["id"] for shape in definition.get("shapes", [])]

    fired = []
    deferred = []
    results = []
    for shape in definition.get("shapes", []):
        if shape.get("timing", "continuous") not in fired_timings:
            deferred.append(shape["id"])
            continue
        fired.append(shape["id"])
        if _shape_fails(shape, response["data"]):
            results.append(_result_for(shape))

    counts = {
        "error": sum(1 for result in results if result["severity"] == "error"),
        "warning": sum(1 for result in results if result["severity"] == "warning"),
        "info": sum(1 for result in results if result["severity"] == "info"),
    }
    return {
        "$formspecValidationReport": "1.0",
        "valid": counts["error"] == 0,
        "results": results,
        "counts": counts,
        "timestamp": response["authored"],
    }, fired, deferred


def _evaluate_fixture(definition: dict, fixture: dict) -> dict:
    response = fixture["responseBefore"]
    action = fixture["action"]
    report, shapes_fired, shapes_deferred = _report_for(definition, response, action["profile"])
    outcome = {
        "statusAfter": response["status"],
        "validationReportProduced": report is not None,
    }
    if report is not None:
        outcome["validationReport"] = report
        outcome["shapesFired"] = shapes_fired
        outcome["shapesDeferred"] = shapes_deferred

    if action["persistence"] == "draft-checkpoint":
        outcome["persisted"] = True
        outcome["statusAfter"] = "in-progress"
    elif action["persistence"] == "complete-response":
        blocked = action["blocking"] == "block-on-error" and report is not None and not report["valid"]
        outcome["transitionBlocked"] = blocked
        if blocked:
            outcome["statusAfter"] = "in-progress"
            outcome["responseAfter"] = deepcopy(response)
            outcome["responseAfter"]["status"] = "in-progress"
            outcome["checkpointPersisted"] = True
            outcome["completedPersisted"] = False
            outcome["blockReason"] = "block-on-error: counts.error > 0"
        else:
            outcome["statusAfter"] = "completed"
            outcome["persisted"] = True
    return outcome


class TestMasterTablePin:
    def test_schema_const_matches_expected(self, schema):
        const = schema["$defs"]["MasterTable"].get("const")
        assert const == EXPECTED_TABLE, "Schema MasterTable.const has drifted from §6 prose."

    def test_fixture_matches_expected(self, master_fixture):
        assert master_fixture["table"] == EXPECTED_TABLE, "Fixture master-table.json drifted from §6 prose."

    def test_schema_and_fixture_agree(self, schema, master_fixture):
        assert schema["$defs"]["MasterTable"]["const"] == master_fixture["table"], (
            "Schema MasterTable.const and master-table.json fixture disagree."
        )


class TestPermittedTuplePredicate:
    """§6.3 predicate:
       permitted(profile, blocking, persistence) :=
           NOT (persistence == complete-response AND blocking != block-on-error)
         AND NOT (persistence == complete-response AND profile != on-submit)
         AND NOT (profile == off AND blocking == block-on-error)
    """

    @staticmethod
    def permitted(profile, blocking, persistence):
        if persistence == "complete-response" and blocking != "block-on-error":
            return False
        if persistence == "complete-response" and profile != "on-submit":
            return False
        if profile == "off" and blocking == "block-on-error":
            return False
        return True

    def test_master_table_rows_all_permitted(self):
        for row in EXPECTED_TABLE:
            assert self.permitted(row["profile"], row["blocking"], row["persistence"]), (
                f"Master-table row violates §6.3 predicate: {row}"
            )

    def test_prohibited_override_examples_rejected(self):
        # complete-response + non-blocking: would allow invalid Responses to reach completed
        assert not self.permitted("on-submit", "non-blocking", "complete-response")
        # complete-response + live: would complete from a partial live report
        assert not self.permitted("live", "block-on-error", "complete-response")
        # complete-response + on-demand: would complete from a demand-only report
        assert not self.permitted("on-demand", "block-on-error", "complete-response")
        # off + block-on-error + complete-response: no report produced, so blocking has no input
        assert not self.permitted("off", "block-on-error", "complete-response")


class TestValidationMappingFixtureShape:
    def test_definition_base_is_schema_valid(self, definition_validator):
        errors = list(definition_validator.iter_errors(_load_fixture("definition-base.json")))
        assert errors == [], [error.message for error in errors]

    @pytest.mark.parametrize("fixture_name", INTENT_FIXTURES)
    def test_response_before_is_schema_valid(self, response_validator, fixture_name):
        fixture = _load_fixture(fixture_name)
        errors = list(response_validator.iter_errors(fixture["responseBefore"]))
        assert errors == [], [error.message for error in errors]

    @pytest.mark.parametrize("fixture_name", INTENT_FIXTURES)
    def test_action_tuple_matches_mapping_entry_schema(self, mapping_entry_validator, fixture_name):
        fixture = _load_fixture(fixture_name)
        errors = list(mapping_entry_validator.iter_errors(fixture["action"]))
        assert errors == [], [error.message for error in errors]

    def test_blocked_submit_fixture_distinguishes_checkpoint_from_completion(self):
        fixture = _load_fixture("intent-submit-blocked.json")
        expected = fixture["expected"]
        assert expected["responseAfter"]["data"] == fixture["responseBefore"]["data"]
        assert expected["responseAfter"]["status"] == "in-progress"
        assert expected["checkpointPersisted"] is True
        assert expected["completedPersisted"] is False

    def test_blocked_submit_response_after_is_schema_valid_and_preserves_data(self, response_validator):
        fixture = _load_fixture("intent-submit-blocked.json")
        response_after = fixture["expected"]["responseAfter"]
        errors = list(response_validator.iter_errors(response_after))
        assert errors == [], [error.message for error in errors]
        assert response_after["data"] == fixture["responseBefore"]["data"]

    @pytest.mark.parametrize("fixture_name", [
        "intent-submit-blocked.json",
        "intent-submit-warning-only.json",
        "intent-request-evidence.json",
    ])
    def test_expected_validation_report_is_schema_valid(self, validation_report_validator, fixture_name):
        fixture = _load_fixture(fixture_name)
        errors = list(validation_report_validator.iter_errors(fixture["expected"]["validationReport"]))
        assert errors == [], [error.message for error in errors]


class TestValidationMappingFixtureSemantics:
    @pytest.fixture(scope="class")
    def definition_base(self):
        return _load_fixture("definition-base.json")

    @pytest.mark.parametrize("fixture_name", INTENT_FIXTURES)
    def test_fixture_expected_outcome_matches_reference_evaluator(self, definition_base, fixture_name):
        fixture = _load_fixture(fixture_name)
        actual = _evaluate_fixture(definition_base, fixture)
        assert actual == fixture["expected"]
```

- [ ] **Step 2: Run; expect all PASS**

Run: `cd formspec && python3 -m pytest tests/conformance/spec/test_validation_mapping_table.py -v`
Expected: All master-table, predicate, action-tuple, Definition-schema, Response-schema, ValidationReport-schema, blocked-submit response-after data preservation, and reference-evaluator semantic tests PASS.

- [ ] **Step 3: Commit**

```bash
cd formspec && git add tests/conformance/spec/test_validation_mapping_table.py
git commit -m "feat(validation-mapping): pytest pinning §6 master table

Pins schema MasterTable.const, master-table.json fixture, §6.3 predicate,
fixture action tuples, fixture Definition/Response/ValidationReport validity,
blocked-submit response-after data preservation, and reference-evaluated fixture
outcomes. Any drift between prose/table/schema/fixtures triggers a fail."
```

---

## Task 25: Forward-links from Core S5.5, Component S5.19, Component S6.13

**Files:**
- Modify: `specs/core/spec.md` (append paragraph at end of S5.5)
- Modify: `specs/component/component-spec.md` (append note to S5.19 and S6.13)

- [ ] **Step 1: Append forward-link paragraph to Core S5.5**

Locate `specs/core/spec.md:3390` (the last line of S5.5, ending the per-shape timing interaction note). Append a new subsection immediately before `### 5.6 Non-Relevant Field Handling`:

```markdown

#### 5.5.1 Action Intent Mapping (informative pointer)

Per-shape `timing` and global mode together compose four named **Validation Profiles** (`live`, `on-submit`, `on-demand`, `off`) defined in the companion [Validation Mapping specification](validation-mapping.md). The mapping document is the normative reconciliation between this section, Component `SubmitButton.mode` (Component §5.19), Component `ValidationSummary.source` (Component §6.13), ValidationReport severity, and Response status transitions. Mapping-Aware processors consult that document for the master table of action intents; non-Mapping-Aware processors implement Core §5.5 as written, which already produces equivalent observable behavior for the default submit case.

```

- [ ] **Step 2: Append cross-reference note to Component S5.19 SubmitButton**

Locate `specs/component/component-spec.md:1626` (the closing example of SubmitButton). Append immediately before the `---` separator:

```markdown

#### Cross-Reference

A `SubmitButton` without an `actionRef` MUST be treated as invoking the implementation's default submit action, per [Validation Mapping §7.1](../core/validation-mapping.md#71-the-default-submit-action-rule). `mode: "continuous"` maps to Validation Mapping profile `live` for report production; `mode: "submit"` maps to profile `on-submit`. Response status `completed` still requires the `on-submit` completion gate. Future Component reference additions (concept §10.4) MAY add `actionRef`; until then, the default-submit-action rule applies.

```

- [ ] **Step 3: Append cross-reference note to Component S6.13 ValidationSummary**

Locate `specs/component/component-spec.md:2264` (the closing example of ValidationSummary). Append immediately before the `---` separator:

```markdown

#### Cross-Reference

`ValidationSummary.source` and `mode` map to [Validation Mapping §3 profiles](../core/validation-mapping.md#3-validation-profile): `source: "live"` + `mode: "continuous"` corresponds to profile `live`; `source: "live"` + `mode: "submit"` corresponds to profile `on-submit`; `source: "submit"` is a passive reader of the latest `formspec-submit` event detail. ValidationSummary is a Display component and MUST NOT trigger Action Intents.

```

- [ ] **Step 4: Verify Core/Component files still parse**

Run: `cd formspec && npm run docs:check 2>&1 | tail -20`
Expected: docs:check passes; the new schema-ref markers in `validation-mapping.md` are picked up; the appended cross-reference paragraphs in core/spec.md and component-spec.md do not break section anchors.

If `docs:check` is not yet wired to scan `specs/core/validation-mapping.md`, also run:
Run: `cd formspec && npm run docs:generate`
Expected: `specs/core/validation-mapping.llm.md` is created with BLUF + schema-ref content materialized.

- [ ] **Step 5: Commit**

```bash
cd formspec && git add specs/core/spec.md specs/component/component-spec.md
git commit -m "feat(validation-mapping): forward-links from Core S5.5 + Component S5.19, S6.13

One-paragraph appends each. Existing Core S5.5 table and Component prop tables
unchanged. SubmitButton cross-reference pins §7.1 default-submit-action rule.
ValidationSummary cross-reference pins §3 profile mapping for source/mode."
```

---

## Task 26: Mark concept-note §10.3 landed, §11.2 resolved

**Files:**
- Modify: `thoughts/specs/2026-05-20-formspec-semantic-layers.md`

- [ ] **Step 1: Mark §10.3 landed**

Edit `thoughts/specs/2026-05-20-formspec-semantic-layers.md` line ~510 (the §10 list, item 3). Find:

```markdown
3. **Validation mapping appendix or shared section.** Reconcile Core global modes, per-shape timing, Component `SubmitButton.mode`, `ValidationSummary.source`, ValidationReport severity, and Response status transitions before Response Actions schema lands.
```

Replace with:

```markdown
3. **Validation mapping appendix or shared section.** Reconcile Core global modes, per-shape timing, Component `SubmitButton.mode`, `ValidationSummary.source`, ValidationReport severity, and Response status transitions before Response Actions schema lands. **Landed:** [`specs/core/validation-mapping.md`](../../specs/core/validation-mapping.md) (draft, 2026-05-22).
```

- [ ] **Step 2: Mark §11.2 resolved**

Find §11.2:

```markdown
### 11.2 Validation Profile Names

The formal specs need a stable way to name validation profiles without colliding with Core global modes, per-shape timing, or Component `SubmitButton.mode`.
```

Replace with:

```markdown
### 11.2 Validation Profile Names

The formal specs need a stable way to name validation profiles without colliding with Core global modes, per-shape timing, or Component `SubmitButton.mode`. **Resolved:** [`specs/core/validation-mapping.md`](../../specs/core/validation-mapping.md) §3 defines the closed enum `live` / `on-submit` / `on-demand` / `off`.
```

- [ ] **Step 3: Commit**

```bash
cd formspec && git add thoughts/specs/2026-05-20-formspec-semantic-layers.md
git commit -m "docs(concept-note): mark §10.3 landed, §11.2 resolved

Validation Mapping spec landed at specs/core/validation-mapping.md.
Concept-note open questions §11.2 (profile naming) now closed."
```

---

## Task 27: Regenerate filemap + LLM artifact + docs:check final

**Files:**
- Modify: `scripts/spec-artifacts.config.json`
- Modify: `filemap.json` (regenerated)
- Create: `specs/core/validation-mapping.llm.md` (regenerated)

- [ ] **Step 1: Register Validation Mapping for artifact generation**

Add this row to `scripts/spec-artifacts.config.json` near the other Core spec rows:

```json
{
  "spec": "specs/core/validation-mapping.md",
  "schema": "schemas/validation-mapping.schema.json",
  "bluf": "specs/core/validation-mapping.bluf.md",
  "llm": "specs/core/validation-mapping.llm.md",
  "behaviorEssentials": [
    "ActionIntent maps to exactly one default ValidationProfile, BlockingPolicy, and PersistencePolicy tuple in the Master Mapping Table.",
    "ValidationProfile names pin existing Core global modes and per-shape timing filters; they do not introduce new runtime behavior.",
    "BlockingPolicy block-on-error depends only on ValidationReport.valid, which is false exactly when error-count findings are present.",
    "PersistencePolicy draft-checkpoint preserves Core VE-05: saving current response data is never blocked by validation findings.",
    "SubmitButton without actionRef invokes the default submit mapping; report production may use live/on-submit, but completed status requires the on-submit completion gate."
  ],
  "conformanceEssentials": [
    "A conforming validation-mapping document must expose the closed standard enums and a MasterTable const equal to the prose master table.",
    "Processors must not introduce ValidationProfile, BlockingPolicy, or PersistencePolicy values outside the closed enums.",
    "Publisher-defined x-prefixed ActionIntent values may exist only in intent position and must still bind to the closed profile, blocking, and persistence tuple space.",
    "MappingEntry must reject complete-response tuples unless profile is on-submit and blocking is block-on-error.",
    "ValidationSummary is passive display and must not trigger ActionIntent execution."
  ]
}
```

- [ ] **Step 2: Regenerate the filemap**

Run: `cd formspec && npm run docs:filemap`
Expected: `filemap.json` is updated to include the new spec, schema, and fixtures.

- [ ] **Step 3: Regenerate docs (LLM artifact, schema-ref expansions)**

Run: `cd formspec && npm run docs:generate`
Expected: `specs/core/validation-mapping.llm.md` is created. BLUF marker is filled from `validation-mapping.bluf.md`. Schema-ref markers in §9.2 and §9.3 are filled from `schemas/validation-mapping.schema.json`.

- [ ] **Step 4: Final verification — schema, prose, fixture all in agreement**

Run all three test surfaces in parallel:

```bash
cd formspec && python3 -m pytest tests/conformance/schemas/test_validation_mapping_schema.py tests/conformance/spec/test_validation_mapping_table.py -v
```

Expected: All tests PASS.

Run docs check:

```bash
cd formspec && npm run docs:check 2>&1 | tail -30
```

Expected: docs:check completes without errors related to `validation-mapping`.

- [ ] **Step 5: Sanity check — full test suite for regressions**

Run: `cd formspec && python3 -m pytest tests/conformance/ -q 2>&1 | tail -20`
Expected: existing conformance tests still PASS; no regressions caused by the new files. (The mapping adds files; it does not modify existing schemas or specs in behavior-affecting ways. Existing tests should be untouched.)

- [ ] **Step 6: Commit generated artifacts**

```bash
cd formspec && git add scripts/spec-artifacts.config.json filemap.json specs/core/validation-mapping.llm.md
git commit -m "chore(validation-mapping): regenerate filemap + LLM artifact

Artifact config registers Validation Mapping for generation. filemap.json indexes
new spec + schema + fixtures. validation-mapping.llm.md materializes BLUF and
schema-ref markers."
```

---

## Task 28: Final review — self-review checklist

**Files:** none modified

This is a verification-only task. Walk the checklist; if any item fails, file a follow-up fix as a new task before declaring the plan complete.

- [ ] **Step 1: Concept-note coverage**

Verify each of these is addressed:

- [ ] §3 anchors preserved (ValidationReport `valid`, severity, Core modes, per-shape timing, Response status, SubmitButton existing behavior, ValidationSummary existing behavior) — confirm in §1.2 relationship table and §7/§8 reconciliation.
- [ ] §5.5 (validation terminology axes) — encoded as four axes (S2–S5).
- [ ] §6.5 (four-axis table) — encoded as §6 master table.
- [ ] §6.6 (SubmitButton default-submit-action rule) — encoded as §7.1.
- [ ] §9 row 3 promotion gate (one reconciliation table) — encoded as §6 + schema `MasterTable` const + pytest pin.
- [ ] §11.2 (validation profile names — open question) — RESOLVED via §3 closed enum.

- [ ] **Step 2: Placeholder scan**

Grep the spec and plan for red-flag patterns:

```bash
cd formspec && grep -nE 'TBD|TODO|implement later|fill in|appropriate (error|validation)' specs/core/validation-mapping.md specs/core/validation-mapping.bluf.md schemas/validation-mapping.schema.json tests/conformance/spec/test_validation_mapping_table.py tests/conformance/schemas/test_validation_mapping_schema.py
```

Expected: zero matches.

- [ ] **Step 3: Type consistency**

Verify:

- [ ] All four enum names spelled identically in prose, schema, fixtures, and pytest: `ActionIntent`, `ValidationProfile`, `BlockingPolicy`, `PersistencePolicy`.
- [ ] `ActionIntent` enum members: `save-draft`, `autosave`, `review`, `submit`, `request-evidence` — same order in §2, schema `$defs.ActionIntent.enum`, schema `MasterTable.const[*].intent`, fixture `master-table.json`, pytest `EXPECTED_TABLE`.
- [ ] `ValidationProfile` enum members: `live`, `on-submit`, `on-demand`, `off` — same order in §3, schema, fixtures (where used).
- [ ] §6 master table tuples match schema `MasterTable.const` match fixture `master-table.json` match `EXPECTED_TABLE` in pytest.

- [ ] **Step 4: VE-05 invariant**

Verify VE-05 ("saving data MUST never be blocked by validation") is preserved by:

- [ ] `save-draft` and `autosave` use `non-blocking` and `draft-checkpoint`.
- [ ] `submit` blocking failure preserves data per §5.2; fixture `intent-submit-blocked.json` carries a schema-valid `responseAfter` whose `data` equals `responseBefore.data` and whose status remains `in-progress`.
- [ ] Fixture `intent-autosave-disabled.json` has `persisted: true` under profile `off`.
- [ ] §6.3 predicate rejects `non-blocking + complete-response`, `live + complete-response`, `on-demand + complete-response`, and `off + block-on-error` combinations (prevents invalid or incompletely validated Responses reaching `completed`).

- [ ] **Step 5: No out-of-scope drift**

Verify the plan and spec do NOT:

- [ ] Define `actionRef` shape (concept §10.4 territory).
- [ ] Define action execution semantics (concept §10.2 / §6.4 territory).
- [ ] Modify Definition / Response / ValidationReport / ValidationResult / Component schemas.
- [ ] Add new ValidationResult severities or constraint kinds.
- [ ] Define Intake Handoff acceptance behavior.

- [ ] **Step 6: Sign off**

If all checks pass, the plan is complete. Final state: validation-mapping companion is landed (draft 1.0.0-draft.1), schema $defs available to be referenced by future Response Actions schema, fixtures and pytest pin the §6 master table, concept-note §10.3 marked landed and §11.2 resolved.

```bash
cd formspec && git log --oneline -28 | head -28
```

Expected: 28 commits (one per task) authored against this plan. Verify each commit message names what landed.

If any check failed, file a fix task and execute before considering the plan done.

---

## Execution Notes

**Branching:** This plan touches only files inside the `formspec/` submodule. Per [`/Users/mikewolfd/Work/formspec-stack/CLAUDE.md`](/Users/mikewolfd/Work/formspec-stack/CLAUDE.md) submodule discipline, do the work on a branch inside `formspec/`, push, and bump the parent's submodule pointer in a separate commit at the stack root.

**Review discipline:** Per CLAUDE.md §Review discipline, after this plan executes, dispatch a `formspec-specs:formspec-scout` or `formspec-specs:spec-expert` semi-formal-code-review subagent against the diff. The §6 master table, §6.3 predicate, and §7.1 default-submit-action rule are the load-bearing claims; reviewer should pressure-test them against Core §5.5, Core §5.4 invariant, and Component §5.19 / §6.13 prop semantics. Also dispatch a semi-formal-architecture-review since this touches a cross-spec seam (Core ↔ Component ↔ future Response Actions).

**Plan order interlock:** This plan MUST execute before the Response Actions plan (concept §10.2). The Response Actions schema will `$ref` `validation-mapping.schema.json#/$defs/{ActionIntent,ValidationProfile,BlockingPolicy,PersistencePolicy,MappingEntry}`; without those defs, Response Actions schema cannot land.

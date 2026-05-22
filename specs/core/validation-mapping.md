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

This document is a **draft normative companion** to [Formspec v1.0 core specification](spec.md). It reconciles validation-related vocabulary across Core §5 (Validation), Component §5.19 (ActionButton), Component §6.13 (ValidationSummary), and the Response status lifecycle so that [Response Actions](../response-actions/response-actions-spec.md) documents have a single mapping to cite.

This spec was promoted from the concept architecture note [`thoughts/specs/2026-05-20-formspec-semantic-layers.md`](../../thoughts/specs/2026-05-20-formspec-semantic-layers.md). It addresses the **§9 row 3** promotion gate (one reconciliation table over action intent, Core global modes, per-shape timing, `ValidationSummary.source`, severity, and Response status transitions) and the **§11.2** open question (validation profile names).

This document landed before the Response Actions schema (concept §10 order) and remains the normative source for Response Actions validation tuples.

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
- This document defines four closed vocabularies — `ActionIntent`, `ValidationProfile`, `BlockingPolicy`, `PersistencePolicy` — and a Master Mapping Table that names default tuples per intent. Future Response Actions documents MUST cite this table; they MUST NOT invent a parallel validation vocabulary.
- Validation Profile names (`live`, `on-submit`, `on-demand`, `off`) pin existing Core terms: global mode (`continuous` / `deferred` / `disabled`) plus per-shape timing filter (`continuous` / `submit` / `demand`). No new runtime behavior is introduced.
- The mapping preserves Core §5.5 VE-05 ("saving data MUST never be blocked by validation"). Persistence Policy `draft-checkpoint` is non-blocking regardless of validation findings; only `complete-response` requires `valid = true`.
- This BLUF is governed by `schemas/validation-mapping.schema.json` (the four enums, `ValidationTuplePredicate`, closed `ValidationTuple`, `MappingEntry`, and `MasterTable` const). The schema is the canonical structural contract; prose is normative.
<!-- bluf:end -->

---

## 1. Introduction

### 1.1 Purpose and Scope

This specification names abstract action intents and the validation, blocking, and persistence behavior they imply. It exists so that:

1. Authors of Response Actions documents have a single reconciliation table to cite instead of inventing a parallel validation vocabulary.
2. Component `ActionButton` (Component §5.19) invokes a named Response Action by `actionRef`; this document defines the validation, blocking, and persistence tuple that the resolved Action inherits or explicitly overrides.
3. Processors that encounter intents other than `submit` (e.g., autosave, request-evidence) have a single normative source for how to translate the intent into Core validation behavior and Response lifecycle effects.

This specification does NOT define:

- Action identity, FEL preconditions, effect ordering, idempotency, retry, failure, or deferred outcomes — those belong to **Response Actions**.
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
| `ActionButton.actionRef` | Component §5.19 | Resolves to a Response Action whose intent maps through §6 |
| `ValidationSummary.source` (`live` / `submit`) | Component §6.13 | Mapped to `ValidationProfile` (§7) |
| VE-05 ("saving data MUST never be blocked by validation") | Core §5.5 | Preserved by `non-blocking` policies (§4) |

### 1.3 Design Principles

1. **Additive, not invasive.** This spec introduces no new schemas for existing artifacts, no new runtime behavior, and no new Component fields. Engines that implement Core §5.5 already satisfy the four axes.
2. **Closed vocabularies.** `ValidationProfile`, `BlockingPolicy`, and `PersistencePolicy` are closed. `ActionIntent` has a closed standard set plus publisher-defined `x-` extension intents (§9), each still bound to the closed profile/policy tuple space.
3. **Existing terms anchor.** Validation Profile names pin existing Core terms; they do not introduce a parallel set of mode names. `live` pins Core `continuous` mode + per-shape `continuous` timing; `on-submit` pins Core `continuous` mode + per-shape `submit` timing (filter); `on-demand` pins Core `deferred` mode + per-shape `demand` timing (filter); `off` pins Core `disabled` mode.
4. **One table, one truth.** §6 is the master table. The schema's `MasterTable` const MUST equal §6 row for row. Pytest pins it (Tasks 24, 25).
5. **Non-overriding defaults.** Master-table tuples are defaults. A Response Actions document MAY override (profile, blocking, persistence) per action; it MUST NOT introduce a new `ActionIntent` outside this spec's closed enum without an `x-` extension.

### 1.4 Conformance Levels

This specification defines one conformance level for documents and a separate level for *processors that consume the mapping*:

| Level | Requirements |
|-------|--------------|
| **Mapping-Aware Document** | Any document with an explicit intent identifier whose value is a member of the closed `ActionIntent` enum (§2) or an `x-` extension intent (§9). |
| **Mapping-Aware Processor** | A processor that, given a Mapping-Aware Document with intent `I`, MUST apply the Master Mapping Table tuple `(profile, blocking, persistence)` keyed by `I` unless the document explicitly overrides one or more axes. |

A conformant Core processor that is NOT Mapping-Aware MAY ignore this specification entirely. Existing engines that only implement Core §5.5 continue to satisfy Core without consulting this mapping. A processor becomes Mapping-Aware only when it consumes an explicit intent-bearing document such as Response Actions.

#### 1.4.1 Conformance Prohibitions

A conformant processor MUST NOT:

1. Introduce additional `ValidationProfile`, `BlockingPolicy`, or `PersistencePolicy` values outside the closed enums in §§3–5, or introduce additional standard `ActionIntent` values outside §2 except through the `x-` extension mechanism (§9).
2. Apply a Master Mapping Table tuple that contradicts §6.
3. Cause persistence to be blocked by validation findings under any `PersistencePolicy` other than `complete-response`, in violation of Core §5.5 VE-05.
4. Treat `block-on-error` as blocking persistence below the `complete-response` policy.

## 2. Action Intent

`ActionIntent` is a **closed, abstract enum** naming what a form caller is trying to do. Authors and processors MUST use these identifiers verbatim; they MUST NOT introduce parallel intent names (e.g., `quickSave`, `validateOnly`) outside the `x-` extension mechanism (§9).

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

## 3. Validation Profile

`ValidationProfile` is a **closed, named enum** that pins (Core global validation mode, per-shape timing filter) under a single identifier. Profile names MUST be used in place of inline mode+timing tuples in Mapping-Aware documents.

This section resolves the concept-note §11.2 open question (validation profile names).

| Profile | Core global mode (§5.5) | Per-shape timing filter (§5.2.1) | Meaning |
|---------|-------------------------|----------------------------------|---------|
| `live` | `continuous` | continuous-timing shapes fire during normal revalidation; submit and demand shapes wait for their explicit triggers | Validation evaluates on every value change; matches current Core default live validation. |
| `on-submit` | `continuous` | continuous and submit-timing shapes fire; demand shapes do NOT fire | Validation evaluates the completion-eligible shape set once without redefining demand timing. |
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

## 6. The Master Mapping Table

This section is the **load-bearing reconciliation** required by concept §9 row 3 ("one table that reconciles action intent, Core global modes, per-shape timing, `ValidationSummary.source`, severity, and Response status transitions"). The table below is normative. The schema's `MasterTable` const (§8 / `schemas/validation-mapping.schema.json`) MUST equal this table row-for-row; the pytest in `tests/conformance/spec/test_validation_mapping_table.py` MUST pin it.

| Action Intent | Validation Profile | Blocking Policy | Persistence Policy |
|---------------|--------------------|-----------------|--------------------|
| `save-draft`  | `off`              | `non-blocking`  | `draft-checkpoint` |
| `autosave`    | `off`              | `non-blocking`  | `draft-checkpoint` |
| `review`      | `on-submit`        | `non-blocking`  | `none`             |
| `submit`      | `on-submit`        | `block-on-error`| `complete-response`|
| `request-evidence` | `on-demand`   | `non-blocking`  | `draft-checkpoint` |

### 6.1 Overriding the Defaults

A Response Actions document MAY override the master-table tuple per action, but the override MUST replace the full `(profile, blocking, persistence)` tuple using `ValidationTuple`. Partial-axis overrides are forbidden. Processors MUST NOT silently substitute non-default tuples.

For standard intents, a full-tuple override retains the declared standard `ActionIntent`; processors still use the action's declared intent for reporting and policy classification. For `x-` extension intents, processors MUST NOT consult the master table and MUST use the document-supplied full tuple verbatim.

### 6.2 What Overrides Cannot Do

Overrides MUST NOT:

1. Reintroduce a blocked persistence below `complete-response` (would violate VE-05).
2. Pair `complete-response` persistence with any Blocking Policy other than `block-on-error` (would allow Responses with error-severity findings to reach `completed`, violating Core §5.4 invariant `valid = (counts.error === 0)`).
3. Pair `complete-response` persistence with any Validation Profile other than `on-submit` (would allow completion from a partial report that did not include the complete completion-eligible shape set).
4. Pair `off` profile with `block-on-error` policy (no ValidationReport is produced under `off`, so `block-on-error` has no input).
5. Pair `block-on-error` with any Persistence Policy other than `complete-response` (blocked draft checkpoints or no-persistence reviews would violate VE-05 and create incoherent blocked terminal semantics).

A processor that encounters any of these prohibited combinations MUST reject the document with a structural finding (`VMAP-INVALID-OVERRIDE`).

### 6.3 Validity Predicate

The set of permitted (profile, blocking, persistence) tuples is governed by §6.1 + §6.2. Expressed as a single rule:

```
permitted(profile, blocking, persistence) :=
    NOT (persistence = complete-response AND blocking != block-on-error)
  AND NOT (persistence = complete-response AND profile != on-submit)
  AND NOT (blocking = block-on-error AND persistence != complete-response)
  AND NOT (profile = off AND blocking = block-on-error)
```

The five master-table rows satisfy this predicate. Implementations MUST validate any override against it.

## 7. ValidationSummary Compatibility

Component §6.13 `ValidationSummary` has two existing props that intersect this mapping:

- `source` ∈ {`live`, `submit`}, default `live`.
- `mode` ∈ {`continuous`, `submit`} when `source` is `live`, default `continuous`.

These are PRESERVED.

### 7.1 `source` Reconciliation

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

After Component Action References lands, `formspec-submit` CustomEvent is dispatched by Action `hostEvent` effects rather than by the widget itself. Authors who want a ValidationSummary with `source: "submit"` to receive updates MUST declare a `hostEvent` effect on the submit Action's effect chain. ValidationSummary does not drive event dispatch; it only reads the most recent event detail from the host.

### 7.2 `ValidationSummary` Has No Persistence Effect

`ValidationSummary` is a Display component. It MUST NOT trigger any Action Intent, MUST NOT mutate Response data, and MUST NOT transition Response status. This spec adds no behavior; the reconciliation here exists solely so that ValidationSummary's `source` and `mode` props have a single normative term to be expressed in.

### 7.3 Future Reference Additions Out of Scope

`ValidationSummary` is not a trigger. This document defines only its passive-reader reconciliation to existing Component §6.13 props. Future Component reference additions (concept §10.4), if any, own their own field shape and precedence rules.

## 8. Conformance

### 8.1 Conformance Levels

This specification defines two conformance levels (§1.4):

| Level | Requirements |
|-------|--------------|
| **Mapping-Aware Document** | Explicit intent identifier ∈ closed `ActionIntent` enum (§2) or `x-` extension intent (§9). Any override tuple satisfies the §6.3 permitted-tuple predicate. |
| **Mapping-Aware Processor** | Applies §6 master-table tuple unless the document explicitly overrides. Rejects prohibited override combinations with `VMAP-INVALID-OVERRIDE`. Preserves VE-05 under all blocked-completion scenarios. |

#### 8.1.1 Mapping-Aware Document

A conformant **Mapping-Aware Document** MUST:

1. Use only `ActionIntent` values from §2 (or `x-`-prefixed extensions).
2. If overriding the master-table defaults, supply a permitted (profile, blocking, persistence) tuple per §6.3.
3. Not redefine the four enum members of any axis.

#### 8.1.2 Mapping-Aware Processor

A conformant **Mapping-Aware Processor** MUST:

1. Resolve any master-table intent to its §6 default tuple in the absence of an explicit document override.
2. Apply explicit overrides verbatim when present.
3. Reject prohibited tuples (§6.3 predicate failures) with a `VMAP-INVALID-OVERRIDE` finding.
4. Preserve Core §5.5 VE-05 under all blocked-completion scenarios (Response data MUST remain saveable in `status: in-progress`).
5. Honor Core §5.5 disabled-mode under `ValidationProfile: off` (no ValidationReport produced).

### 8.2 Schema

<!-- schema-ref:start id=validation-mapping-top-level schema=schemas/validation-mapping.schema.json pointers=# -->
<!-- generated:schema-ref id=validation-mapping-top-level -->
| Pointer | Field | Type | Required | Notes | Description |
|---|---|---|---|---|---|
| `#/properties/$formspecValidationMapping` | `$formspecValidationMapping` | <code>string</code> | yes | const: <code>"1.0"</code>; critical | Validation Mapping specification version. MUST be '1.0'. |
| `#/properties/version` | `version` | <code>string</code> | yes | — | Version of this Validation Mapping Document. SemVer RECOMMENDED. |
<!-- schema-ref:end -->

### 8.3 `$defs` Reference

<!-- schema-ref:start id=validation-mapping-defs schema=schemas/validation-mapping.schema.json pointers=#/$defs/ActionIntent,#/$defs/ValidationProfile,#/$defs/BlockingPolicy,#/$defs/PersistencePolicy,#/$defs/ValidationTuplePredicate,#/$defs/ValidationTuple,#/$defs/MappingEntry,#/$defs/MasterTable -->
<!-- generated:schema-ref id=validation-mapping-defs -->
| Pointer | Field | Type | Required | Notes | Description |
|---|---|---|---|---|---|
| `#/$defs/ActionIntent` | `(self)` | <code>string</code> | — | enum: <code>"save-draft"</code>, <code>"autosave"</code>, <code>"review"</code>, <code>"submit"</code>, <code>"request-evidence"</code>; critical | Closed, abstract enum naming what a form caller is trying to do. save-draft: persist current Response as a draft, validation findings ignored. autosave: background or periodic save, identical mapping to save-draft. review: read-only validation pass; no persistence transition. submit: attempt transition to Response status 'completed'. request-evidence: invoke demand-timing shapes (Core §5.2.1) only. See specs/core/validation-mapping.md §2. |
| `#/$defs/ValidationProfile` | `(self)` | <code>string</code> | — | enum: <code>"live"</code>, <code>"on-submit"</code>, <code>"on-demand"</code>, <code>"off"</code>; critical | Closed named profile pinning a (Core global mode, per-shape timing filter) pair under a single identifier. live: Core 'continuous' + continuous-timing shapes during normal revalidation. on-submit: Core 'continuous' + continuous and submit-timing shapes; demand shapes excluded. on-demand: Core 'deferred' + only demand-timing shapes fire. off: Core 'disabled' + no shapes fire (no ValidationReport produced). See specs/core/validation-mapping.md §3. |
| `#/$defs/BlockingPolicy` | `(self)` | <code>string</code> | — | enum: <code>"non-blocking"</code>, <code>"block-on-error"</code>; critical | Closed two-value enum naming whether error-severity findings stop the surrounding intent. non-blocking: findings never stop the intent. block-on-error: intent halts before higher-persistence transitions when ValidationReport.valid is false (counts.error > 0). Preserves Core §5.5 VE-05 by blocking the transition, not the underlying data persistence. See specs/core/validation-mapping.md §4. |
| `#/$defs/PersistencePolicy` | `(self)` | <code>string</code> | — | enum: <code>"none"</code>, <code>"draft-checkpoint"</code>, <code>"complete-response"</code>; critical | Closed three-value enum naming the Response lifecycle effect of the intent. none: no status change, no persistence. draft-checkpoint: persist current Response state, status remains 'in-progress' (permitted under any validation outcome, VE-05). complete-response: persist AND transition status to 'completed' (requires ValidationReport.valid === true, Core §5.4 invariant). See specs/core/validation-mapping.md §5. |
| `#/$defs/ValidationTuplePredicate/properties/blocking` | `blocking` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/BlockingPolicy</code> | — |
| `#/$defs/ValidationTuplePredicate/properties/persistence` | `persistence` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/PersistencePolicy</code> | — |
| `#/$defs/ValidationTuplePredicate/properties/profile` | `profile` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/ValidationProfile</code> | — |
| `#/$defs/ValidationTuple/properties/blocking` | `blocking` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/BlockingPolicy</code> | — |
| `#/$defs/ValidationTuple/properties/persistence` | `persistence` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/PersistencePolicy</code> | — |
| `#/$defs/ValidationTuple/properties/profile` | `profile` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/ValidationProfile</code> | — |
| `#/$defs/MappingEntry/properties/blocking` | `blocking` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/BlockingPolicy</code> | — |
| `#/$defs/MappingEntry/properties/intent` | `intent` | <code>composite</code> | yes | — | — |
| `#/$defs/MappingEntry/properties/persistence` | `persistence` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/PersistencePolicy</code> | — |
| `#/$defs/MappingEntry/properties/profile` | `profile` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/ValidationProfile</code> | — |
| `#/$defs/MasterTable` | `(self)` | <code>array</code> | — | const: <code>[{"intent":"save-draft","profile":"off","blocking":"non-blocking","persistence":"draft-checkpoint"},{"intent":"autosave","profile":"off","blocking":"non-blocking","persistence":"draft-checkpoint"},{"intent":"review","profile":"on-submit","blocking":"non-blocking","persistence":"none"},{"intent":"submit","profile":"on-submit","blocking":"block-on-error","persistence":"complete-response"},{"intent":"request-evidence","profile":"on-demand","blocking":"non-blocking","persistence":"draft-checkpoint"}]</code>; critical | Frozen master mapping table. MUST equal specs/core/validation-mapping.md §6 row-for-row. The const constrains any document carrying this property to the canonical table; documents that override individual entries do so per Action, not by replacing the master table. |
<!-- schema-ref:end -->

### 8.4 Conformance Prohibitions

A conformant processor MUST NOT:

1. Apply a master-table tuple that contradicts §6.
2. Introduce standard `ActionIntent` values outside §2 unless the value is an `x-` extension intent, or introduce any `ValidationProfile`, `BlockingPolicy`, or `PersistencePolicy` value outside this spec's closed enums.
3. Cause persistence to be blocked by validation findings under any policy other than `complete-response` (VE-05).
4. Produce a `completed`-status Response when ValidationReport `valid` is `false` (Core §5.4 invariant).
5. Discard Response data on a blocked submission.

## 9. Extension Points

Authors MAY introduce custom `ActionIntent` values under the `x-` prefix (e.g., `x-acme-bulk-import`). Each `x-` intent MUST carry a complete (profile, blocking, persistence) triple in the Response Actions document referencing it. Mapping-Aware processors that do not recognize the intent MUST honor the document-supplied triple verbatim.

Extensions MUST NOT:

1. Override or shadow a master-table intent name.
2. Introduce parallel `ValidationProfile`, `BlockingPolicy`, or `PersistencePolicy` enum values. Profiles and policies are closed; richer behavior MUST be expressed by an `x-` intent paired with an existing-enum triple.
3. Bypass the §6.3 permitted-tuple predicate.

## 10. Security Considerations

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

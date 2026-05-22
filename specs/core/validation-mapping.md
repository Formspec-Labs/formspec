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

## 7. SubmitButton Compatibility

Component §5.19 defines `SubmitButton` with the following load-bearing existing behavior (PRESERVED by this spec):

- `bind` is forbidden.
- `mode` ∈ {`continuous`, `submit`}, default `submit`. Controls which validation pass produces the report emitted on click.
- `emitEvent` defaults to `false`; when `true`, click dispatches `formspec-submit` CustomEvent.
- `pendingLabel` and `disableWhenPending` handle in-flight submission state.

### 7.1 The Default Submit Action Rule

Per concept §6.6: *"A SubmitButton without `actionRef` invokes the implementation's default submit action."*

A Mapping-Aware processor that encounters a `SubmitButton` MUST treat it as invoking an action with intent `submit`, profile `on-submit`, blocking `block-on-error`, persistence `complete-response` — the master-table row for `submit` (§6).

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

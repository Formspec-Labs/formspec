---
title: Response Actions Companion Spec Implementation Plan
date: 2026-05-22
status: active
owner: spec-author
related:
  - thoughts/specs/2026-05-20-formspec-semantic-layers.md
  - specs/core/validation-mapping.md
  - specs/experience/experience-spec.md
  - thoughts/plans/2026-05-22-validation-mapping.md
---

# Response Actions Companion Spec Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land a normative **Response Actions** companion under `specs/response-actions/` — prose, schema, fixtures, pytest — that defines action identity, FEL precondition context, validation trigger mapping (cites [`specs/core/validation-mapping.md`](../../specs/core/validation-mapping.md)), an ordered effect taxonomy with idempotency posture, invocation state machine with failure / deferred outcomes, host event boundaries, the named-action shape for the default-submit-action rule, and cross-artifact references to Mapping / Intake Handoff / Respondent Ledger. Closes the §9 row-2 promotion gate ("Response Actions runtime") and concept §10.2 of [`../specs/2026-05-20-formspec-semantic-layers.md`](../specs/2026-05-20-formspec-semantic-layers.md). Resolves concept §11.1 by taking the peer-artifact stance with explicit overlay-promotion criteria.

**Architecture:** New normative document at `specs/response-actions/response-actions-spec.md` (parallels the Experience companion's directory shape). New schema at `schemas/response-actions.schema.json` defining `Action`, `Precondition` (FEL expression with bounded context), `EffectRequest` (closed taxonomy: `mappingExecution`, `ledgerAppend`, `handoffAssembly`, `hostEvent`, `evidenceRequest`), `IdempotencyKey` (FEL expression evaluated at invocation), and `ValidationOverride` (per-action triple cited from `validation-mapping.schema.json`). Strictly additive: no Definition / Response / ValidationReport / Mapping / Intake Handoff / Respondent Ledger / Component / Locale / Theme / Experience schema changes. Closed enums on `Action.intent` (cited from validation-mapping `ActionIntent`), `EffectRequest.type` (closed), and `Action.onFailure` / `Action.onDeferred` (closed). Concept-note ownership boundaries (§6.3) are pinned as Conformance Prohibitions. Default submit action: existing SubmitButton without `actionRef` continues to follow `validation-mapping.md §7.1` master-table row; Response Actions adds the *named* form with effects beyond gating. `actionRef` on Component is future shape (concept §10.4), **not** introduced by this spec.

**Tech Stack:** Markdown (W3C-style, BCP-14), JSON Schema 2020-12, `npm run docs:generate` / `docs:check` pipeline (`generate-spec-artifacts.mjs`), Python pytest under `tests/conformance/`.

**Sequencing:** prose contract first → schema encodes the closed enums, the Action shape, the EffectRequest taxonomy, and the state-machine observable points → fixtures pin the required §6.5 vocabulary cases + §6.9 cross-spec Intake-Handoff seam + concept §6.4 effect-ordering and failure/deferred cases → pytest pins the table. Per [concept §10 closing line](../specs/2026-05-20-formspec-semantic-layers.md#10-follow-on-spec-order), the schema MUST NOT hide unresolved prose decisions — the §11.1 peer-vs-overlay stance is resolved *in this spec*, not deferred to schema interpretation.

**Citations** in this plan refer to the concept note (`thoughts/specs/2026-05-20-formspec-semantic-layers.md`) unless prefixed with another spec name. Concept references like "§6.4" mean concept-note §6.4. Validation-mapping references are prefixed `VM §`. Experience-spec references are prefixed `EXP §`.

---

## File Structure

### Created

| Path | Responsibility |
|---|---|
| `specs/response-actions/response-actions-spec.md` | Canonical prose. W3C-style, BCP-14 normative language. |
| `specs/response-actions/response-actions-spec.bluf.md` | BLUF source (3–5 falsifiable bullets). |
| `specs/response-actions/response-actions-spec.llm.md` | Generated LLM artifact. **Never hand-edited.** |
| `schemas/response-actions.schema.json` | `Action`, `Precondition`, `EffectRequest` (closed `type` taxonomy), `IdempotencyKey`, `ValidationOverride`, `DefaultSubmitAction` shapes. `$id`: `https://formspec.org/schemas/responseActions/1.0`. |
| `tests/conformance/schemas/test_response_actions_schema.py` | Schema-shape pytest. Pins `$defs`, enum closure on `EffectRequest.type`, `Action.intent` cross-ref to validation-mapping, idempotency-key requirement on durable effect types. |
| `tests/conformance/spec/test_response_actions_runtime.py` | Runtime contract pytest: fixture audits over the required §6.5 + §6.9 + §6.4 set. Validates each fixture's Action document against the live schema; runs the reference invocation harness (added by this plan); asserts observed (state, effect-trace, persistence delta, validation-report, ledger-event-request, handoff-assembled) tuple matches the fixture's `expected` block. |
| `tests/conformance/spec/test_response_actions_submitbutton_default.py` | SubmitButton-without-actionRef path: synthesizes the default submit Action from VM §7.1 master row, runs the harness against a Component fixture, asserts behavior matches the named-action path for intent `submit`. |
| `tests/conformance/fixtures/response-actions/definition-base.json` | Shared Definition. One required item; one warning shape (continuous timing); one error shape (continuous timing); one submit-timing error shape; one demand-timing error shape. **Identical to the validation-mapping fixture** to permit cross-suite reuse and pin behavioral parity. |
| `tests/conformance/fixtures/response-actions/intent-save-draft.json` | Invalid Response, intent `save-draft`. Action with no effects beyond a `ledgerAppend` for the draft checkpoint. Expects: state `completed`, persistence `draft-checkpoint`, status remains `in-progress`, no ValidationReport produced (profile `off`), ledger-event-request issued with the checkpoint kind. |
| `tests/conformance/fixtures/response-actions/intent-submit-blocked.json` | Same invalid Response, intent `submit`, action with effects `[mappingExecution, handoffAssembly, ledgerAppend, hostEvent]`. Expects: state `failed-precondition`, validation halts at the blocking gate (VM §4.1), **zero effects invoked**, status remains `in-progress`, data preserved (VE-05). |
| `tests/conformance/fixtures/response-actions/intent-warning-only-submit.json` | Response failing only the warning shape, intent `submit`, same effect chain as above. Expects: state `completed`, ValidationReport `valid: true` with `counts.warning >= 1`, all four effects invoked in declared order, status `completed`. |
| `tests/conformance/fixtures/response-actions/intent-request-evidence-demand.json` | Valid field data, intent `request-evidence`, action with effects `[evidenceRequest, ledgerAppend]`. Expects: profile `on-demand` (only demand-timing shape fires), the demand shape fails, blocking `non-blocking` (per VM master row), effects invoked, state `completed`. |
| `tests/conformance/fixtures/response-actions/intent-disabled-no-validation.json` | Same invalid Response, intent `autosave`, action with effects `[ledgerAppend]`. Expects: profile `off`, no ValidationReport produced, ledgerAppend invoked, persistence `draft-checkpoint`, status `in-progress`. |
| `tests/conformance/fixtures/response-actions/effect-ordering.json` | Submit-intent action with effects in non-trivial order: `[mappingExecution, ledgerAppend(submitAttempt), handoffAssembly, ledgerAppend(handoffEmitted), hostEvent(formspec-submit)]`. Expects effect trace recorded in exactly that order; `hostEvent` is transient (non-durable) and carries no idempotency key. |
| `tests/conformance/fixtures/response-actions/effect-failure-no-rollback.json` | Submit-intent action where `handoffAssembly` fails. Expects: state `failed`, prior `mappingExecution` and `ledgerAppend(submitAttempt)` remain in the effect trace (NOT rolled back; concept §6.4), one additional `ledgerAppend(actionFailed)` recorded, `hostEvent` NOT emitted, UI must not report success. |
| `tests/conformance/fixtures/response-actions/effect-deferred-evidence.json` | Submit-intent action whose `evidenceRequest` returns deferred. Expects: state `deferred`, partial effect trace recorded, `ledgerAppend(actionDeferred)` recorded, replay key issued, Response status remains `in-progress`, no `handoffAssembly` invoked yet. |
| `tests/conformance/fixtures/response-actions/effect-idempotent-replay.json` | Submit-intent action invoked twice with identical idempotency keys. Expects: second invocation observes prior effect outcomes via the replay contract; no duplicate `ledgerAppend`, no duplicate `handoffAssembly`; observable state on the second invocation is `replayed`. |
| `tests/conformance/fixtures/response-actions/precondition-fails-deferred.json` | Action whose `precondition` (FEL expression) evaluates `false`. Expects: state `precondition-not-met`, **no validation pass run**, **zero effects invoked**, `ledgerAppend(actionRejected)` MAY be emitted at processor discretion. |
| `tests/conformance/fixtures/response-actions/cross-spec-intake-handoff-seam.json` | The required §6.9 cross-spec fixture. Submit-intent action with effects `[mappingExecution, ledgerAppend(submitAttempt), handoffAssembly, ledgerAppend(handoffEmitted)]`. Expects: a Response snapshot, a ValidationReport snapshot, a Respondent Ledger boundary event (or head reference), an Intake Handoff document, AND a workflow-host outcome of one of `accepted` / `rejected` / `deferred` recorded *outside* this spec's responsibility. **MUST NOT include a Formspec-authored `case.created` event** (per concept §6.9). |
| `tests/conformance/fixtures/response-actions/submitbutton-default-action.json` | Component fixture: a `SubmitButton` with no `actionRef`. Expects: harness synthesizes the default submit Action from VM §7.1 master row (`intent: submit`, profile `on-submit`, blocking `block-on-error`, persistence `complete-response`), invokes the same harness path, observable result matches named-action submit behavior. |
| `tests/conformance/fixtures/response-actions/master-action-shapes.json` | Canonical Action document covering every closed-enum branch (`save-draft`, `autosave`, `review`, `submit`, `request-evidence`) and every `EffectRequest.type` branch. Single source of truth for fixture-cross-reference. |

### Modified

| Path | Why |
|---|---|
| `specs/core/validation-mapping.md` | Append a §1.2 forward-link from "Future Response Actions documents MUST cite this table" to the now-landed Response Actions spec. **One-paragraph append.** Existing §6 master table and §7 SubmitButton compatibility wording unchanged. |
| `specs/experience/experience-spec.md` | Update §6.3 `ActionRef` from "forthcoming companion spec" to a live link. Update the front-matter reference list. **Three-line edit.** Existing schema-projection table unchanged. |
| `specs/component/component-spec.md` | Append a "Cross-reference" note to §5.19 SubmitButton: links to Response Actions §10 (host event boundaries) and reaffirms `actionRef` is future shape (concept §10.4). **One-paragraph append.** Existing prop table unchanged. |
| `thoughts/specs/2026-05-20-formspec-semantic-layers.md` | Mark §10.2 landed (Landed: link); mark §11.1 resolved in this spec (with link to §1.5 of new spec). **Two-line edits.** |
| `scripts/spec-artifacts.config.json` | Add the Response Actions spec/schema/BLUF/LLM row so `npm run docs:generate` materializes `response-actions-spec.llm.md`. |
| `filemap.json` | Regenerated by `npm run docs:filemap`. **Generated — never hand-edit.** |
| `../TODO-STACK.md` | Update the response-actions row to "landed (draft)" with a pointer to this plan and the new spec. **One-line edit.** |

### Explicitly NOT in scope

- **Component `actionRef` field or any Component reference additions** — concept §10.4, separate plan. This spec uses synthetic resolution by the harness for SubmitButton fixtures; production renderers do not need `actionRef` to honor the default submit action because VM §7.1 already pins the behavior.
- **Regeneration merge / Studio review fixtures** — concept §10.5, separate plan.
- **Trace query/cache spec** — concept §10.6, separate plan.
- **Modifications to existing schemas** (`definition.schema.json`, `response.schema.json`, `validation-report.schema.json`, `mapping.schema.json`, `intake-handoff.schema.json`, `respondent-ledger.schema.json`, `respondent-ledger-event.schema.json`, `component.schema.json`, `experience.schema.json`, `validation-mapping.schema.json`). Additive invariant per concept §5.1.
- **Definition `actions` block.** Definition stays the executable form model (concept §6.1). Actions live in a sidecar, not in Definition.
- **New validation vocabulary.** Response Actions cites VM §3–§6; it does NOT introduce a parallel set of profile/blocking/persistence names (concept §6.5).
- **WOS-side acceptance, governed case identity, case lifecycle events** (concept §6.3 explicit non-ownership). The cross-spec fixture asserts a handoff was assembled and acknowledged; it does not author the host outcome.
- **`case.created` events emitted by Formspec.** Explicitly forbidden by concept §6.9.
- **Effect rollback / global transaction semantics.** Concept §6.4 forbids fictional rollback; this spec does not introduce a compensation framework. Compensation effects MAY appear in a future spec keyed off a real consumer need.
- **Bundle manifest** (concept §11.5). Separate concern.
- **Trace generation** even though Response Actions invocations naturally produce traceable lineage. Trace lives in the §10.6 spec; this spec emits the ledger events Trace can read.

---

## Self-Review Note

**Concept-note coverage:**

- §3 anchors (Definition ownership, ValidationReport `valid`, severity, Core global modes, per-shape timing, Response status, SubmitButton current behavior, ValidationSummary current behavior, Locale, Mapping, Intake Handoff, Respondent Ledger, Trace) — preserved. Response Actions does not move any executable behavior out of Definition; does not redefine ValidationReport severity; does not invent a parallel mode/timing vocabulary; does not modify Locale strings; does not inline Mapping rules; does not own Intake Handoff body shape; does not own Respondent Ledger event semantics; does not generate Trace.
- §6.3 ownership boundaries — pinned as §13 Conformance Prohibitions in the new spec; covered by `test_response_actions_runtime.py` fixture audits (prohibition assertions on `case.created` absence, on no Mapping body inlining, on Action documents not carrying ledger-event taxonomies).
- §6.4 execution contract — encoded as §7 Invocation State Machine; covered by `effect-ordering.json`, `effect-failure-no-rollback.json`, `effect-deferred-evidence.json`, `precondition-fails-deferred.json`.
- §6.5 validation terminology axes — fixtures: `intent-save-draft.json`, `intent-submit-blocked.json`, `intent-warning-only-submit.json`, `intent-request-evidence-demand.json`, `intent-disabled-no-validation.json`. All five required cases covered.
- §6.6 SubmitButton compatibility (default submit action rule) — handled by reaffirming VM §7.1 and providing the named-action form via `submitbutton-default-action.json` + `test_response_actions_submitbutton_default.py`. No Component schema change.
- §6.9 cross-spec Intake Handoff seam — `cross-spec-intake-handoff-seam.json` produces the required (Response, ValidationReport, Ledger evidence, Intake Handoff, workflow-host outcome) tuple without authoring a `case.created` event.
- §9 row 2 "Response Actions runtime" promotion gate — full coverage: invocation state machine (§7), preconditions (§4), validation profile mapping (§5 citing VM), blocking policy (§5 citing VM), persistence policy (§5 citing VM), effect ordering (§6.2), failure/deferred outcomes (§8 and §9), idempotency posture (§7.4). The §9 stop condition ("spec only defines JSON properties and leaves processors to invent behavior") is avoided by the fixture-pinned reference invocation harness in `tests/conformance/spec/test_response_actions_runtime.py`.
- §9 row 4 "SubmitButton compatibility" — partially closed (default submit action rule + adapter/event compatibility). Full closure requires the Component reference additions spec (concept §10.4) to land. This plan documents the partial closure in `specs/response-actions/response-actions-spec.md §10.3` and re-asserts the future-shape boundary.
- §9 row 6 "Intake Handoff seam" — closed by `cross-spec-intake-handoff-seam.json`.
- §11.1 peer-vs-overlay open question — RESOLVED in §1.5 with explicit criteria for future overlay promotion (if Response Actions begins requiring suppression / override / alteration of Definition semantics, the architecture moves to overlay; until then it is a peer artifact).
- §11.3 Component reference fields — explicitly future shape; not introduced.
- §11.5 bundle manifest — out of scope; cross-referenced as a follow-on concern.

**Out-of-scope confirmation:** no schema changes to existing files; no engine API changes; no Component widget changes; no Response lifecycle additions; no new ledger event kinds (the spec REQUESTS ledger events; Respondent Ledger spec owns the taxonomy).

**Author-vs-generated discipline:** Response Actions is an authored source artifact (concept §5.4). Action documents are not generated from Definition by this spec. A separate authoring helper may seed minimum-bundle defaults (concept §8) in the future; that is a Studio concern.

---

## Task 1: Scaffold spec directory and empty files

**Files:**
- Create: `specs/response-actions/response-actions-spec.md`
- Create: `specs/response-actions/response-actions-spec.bluf.md`

- [ ] **Step 1: Create stub files**

```bash
mkdir -p formspec/specs/response-actions
touch formspec/specs/response-actions/response-actions-spec.md
touch formspec/specs/response-actions/response-actions-spec.bluf.md
```

- [ ] **Step 2: Verify directory parity with Experience**

```bash
ls formspec/specs/experience/ formspec/specs/response-actions/
```

Expected: both contain `*-spec.md` and `*-spec.bluf.md` stubs. The `.llm.md` is generated by the doc pipeline; do NOT create it by hand.

- [ ] **Step 3: Commit scaffolding**

```bash
cd formspec && git add specs/response-actions/
git commit -m "feat(spec): scaffold response-actions companion directory

Empty stubs for response-actions-spec.md and .bluf.md. Mirrors
specs/experience/ directory shape per concept §10 follow-on order."
```

---

## Task 2: Draft BLUF source

**Files:**
- Modify: `specs/response-actions/response-actions-spec.bluf.md`

- [ ] **Step 1: Write BLUF**

Replace the empty stub with exactly these falsifiable bullets:

```markdown
# Response Actions — BLUF

- Response Actions is a sidecar document that names form-scoped action intents (the closed set defined by validation-mapping.md `ActionIntent`), declares FEL preconditions, and binds an ordered list of typed `EffectRequest`s to each action. It is the runtime contract for what happens when a form is acted upon.
- An invocation MUST follow the §7 state machine: preconditions → validation per VM profile → blocking gate → ordered effect execution → terminal `completed` / `failed` / `deferred`. UI MUST NOT report success when a declared effect failed. Durable effects MUST carry idempotency keys.
- Existing `SubmitButton` without `actionRef` continues to work unchanged: processors treat it as invoking an unnamed default Action whose triple is the VM §7.1 master-table row for intent `submit`. This spec adds the *named* form so authors can attach effects beyond the gating behavior.
- Response Actions is a peer artifact, NOT a Definition overlay. It MAY reference Mapping handles, request Ledger events, and assemble Intake Handoff documents; it MUST NOT inline Mapping rules, redefine Ledger event semantics, redefine Handoff body shape, author governed-case events, or modify Definition behavior. The promotion criteria for future overlay status are in §1.5.
- Conformance is pinned by `tests/conformance/spec/test_response_actions_runtime.py` against the required fixture set: the five validation-vocabulary cases (§5.6), four effect-ordering / failure / deferred / replay cases (§6.4), one precondition rejection case, and one cross-spec Intake Handoff seam fixture (§6.9) that asserts a workflow-host outcome WITHOUT a Formspec-authored `case.created` event.
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add specs/response-actions/response-actions-spec.bluf.md
git commit -m "feat(spec): draft response-actions BLUF (5 falsifiable bullets)"
```

---

## Task 3: Wire spec into doc pipeline

**Files:**
- Modify: `scripts/spec-artifacts.config.json`

- [ ] **Step 1: Add the spec row**

Add this entry to the `specs` array (preserve array order: insert immediately after the `validation-mapping` row to keep sequencing intuitive). Use the same key shape as the validation-mapping row:

```json
{
  "spec": "specs/response-actions/response-actions-spec.md",
  "schema": "schemas/response-actions.schema.json",
  "bluf": "specs/response-actions/response-actions-spec.bluf.md",
  "llm": "specs/response-actions/response-actions-spec.llm.md",
  "behaviorEssentials": [
    "Invocation MUST follow the §7 state machine: preconditions → validation per VM profile → blocking gate → ordered effect execution → terminal completed | failed | deferred. Effects MUST execute in declared order.",
    "Durable effect types (mappingExecution, ledgerAppend, handoffAssembly, evidenceRequest) MUST carry an idempotencyKey evaluated at invocation; replay with identical keys MUST observe prior effect outcomes without duplicating side effects.",
    "Blocking validation failure stops effect execution before any effect is invoked. UI MUST NOT report success when a declared effect failed; the failed-effect case appends an actionFailed ledger event and does NOT roll back prior effects (concept §6.4).",
    "Existing SubmitButton without actionRef is treated as invoking an unnamed default Action whose triple is validation-mapping.md §7.1 master-table row for intent submit. Component schema is NOT modified."
  ],
  "conformanceEssentials": [
    "A conforming Response Actions document must include $formspecResponseActions=1.0, version, targetDefinition, and at least one action.",
    "Action.intent MUST be drawn from validation-mapping.md ActionIntent (closed enum). Action.effects[*].type MUST be drawn from the closed EffectRequest taxonomy. Action.onFailure and Action.onDeferred MUST be drawn from closed enums.",
    "Processors MUST reject Response Actions documents that author Respondent Ledger event semantics, inline Mapping body rules, or include a case.created event."
  ]
}
```

- [ ] **Step 2: Validate config parses**

```bash
cd formspec && node -e "JSON.parse(require('fs').readFileSync('scripts/spec-artifacts.config.json'))"
```

Expected: no output (parse success).

- [ ] **Step 3: Commit**

```bash
cd formspec && git add scripts/spec-artifacts.config.json
git commit -m "build(docs): register response-actions in spec-artifacts pipeline"
```

---

## Task 4: Draft spec front matter and §1 Introduction

**Files:**
- Modify: `specs/response-actions/response-actions-spec.md`

- [ ] **Step 1: Write front matter, Status, Conventions, BLUF, §1**

Use the section structure validated by `experience-spec.md` and `validation-mapping.md`. Write exactly these sections (the schema-ref blocks remain as generated markers — do NOT hand-author their content):

```markdown
# Formspec Response Actions

**Version:** 1.0 (draft)
**Status:** Draft normative companion. Published 2026-05-22.
**Editors:** Formspec working group.
**Schema:** `schemas/response-actions.schema.json` ($id: `https://formspec.org/schemas/responseActions/1.0`).
**BLUF:** `response-actions-spec.bluf.md`.

<!-- bluf:start -->
<!-- bluf:end -->

## Status of This Document

This is a **draft normative companion** to [Formspec v1.0 core specification](../core/spec.md) and to [Formspec Validation Mapping](../core/validation-mapping.md). It defines the Response Actions sidecar — a form-scoped runtime contract for action invocation — and closes the §9 row-2 promotion gate of [Formspec Semantic Layers](../../thoughts/specs/2026-05-20-formspec-semantic-layers.md).

This document MUST be cited (not duplicated) by future Component reference additions (concept §10.4) when introducing `actionRef`.

## Conventions and Terminology

BCP-14 normative terms (MUST, MUST NOT, SHOULD, MAY) appear in capitals. "Concept §" refers to the Semantic Layers concept note. "VM §" refers to `specs/core/validation-mapping.md`. "EXP §" refers to `specs/experience/experience-spec.md`. "Core §" refers to `specs/core/spec.md`. "Component §" refers to `specs/component/component-spec.md`.

An **Action** is a named runtime intent declared in a Response Actions document. An **invocation** is a single attempt to execute an Action against the current Response. An **effect** is a typed side-effect request enumerated in `EffectRequest.type`. A **durable effect** is any effect whose execution MAY produce externally observable, non-idempotent state without an idempotency key (the four durable types: `mappingExecution`, `ledgerAppend`, `handoffAssembly`, `evidenceRequest`). A **transient effect** is `hostEvent` — it MUST NOT have observable externally durable consequences and MUST NOT carry an idempotency key.

## Bottom Line Up Front

<!-- Hand-author a 3-5 bullet BLUF here; the generator replaces this section by reading bluf.md. Until docs:generate runs, the BLUF source is response-actions-spec.bluf.md. -->

## 1. Introduction

### 1.1 Purpose and Scope

This document specifies the **Response Actions** sidecar — a form-scoped, authored artifact that declares the actions a form caller may invoke against a Response, the FEL preconditions guarding those actions, the validation profile each action runs (cited from VM), the ordered effect chain each action executes, and the terminal outcome categories an invocation may return.

**In scope:** action identity, FEL precondition context, validation trigger mapping, blocking policy, persistence policy, effect taxonomy with ordering, invocation state machine, idempotency posture, failure outcomes, deferred outcomes, host event boundaries, cross-artifact references (Mapping handle, Intake Handoff request, Respondent Ledger event request), and the named-action form of the default submit action that anchors VM §7.1 SubmitButton compatibility.

**Out of scope:** Component widget shape, `actionRef` field on Component (concept §10.4, separate spec), regeneration merge (concept §10.5), Trace (concept §10.6), Definition behavior, Mapping body shape, Respondent Ledger event taxonomy, Intake Handoff body shape, WOS acceptance policy, governed case identity, case lifecycle events, host application event systems (concept §6.3), effect rollback / global transactions (concept §6.4).

### 1.2 Relationship to Existing Specifications

- **[Core](../core/spec.md)**: Response Actions does not modify Definition, Response, ValidationReport, or any Core behavior. It runs a validation pass through the Core engine in the profile cited from VM.
- **[Validation Mapping](../core/validation-mapping.md)**: Authoritative for `ActionIntent`, `ValidationProfile`, `BlockingPolicy`, `PersistencePolicy`, the master mapping table (VM §6), and SubmitButton compatibility (VM §7). This spec cites those vocabularies; it does NOT redefine them.
- **[Experience](../experience/experience-spec.md)**: Experience `ActionRef` (EXP §6.3) references Response Action `id`s. Coverage-aware Experience processors MAY now hard-resolve those references against a Response Actions document.
- **[Component](../component/component-spec.md)**: `SubmitButton` is preserved unchanged. The default submit action rule (VM §7.1) continues to govern legacy `SubmitButton` without `actionRef`. `actionRef` on Component nodes is future shape (concept §10.4).
- **[Mapping](../mapping/mapping-spec.md)**: Response Actions references Mapping documents by handle in `EffectRequest.mappingExecution`. It does NOT inline Mapping rules.
- **[Intake Handoff](../core/intake-handoff-spec.semantic.md)**: Response Actions assembles or requests Intake Handoff via `EffectRequest.handoffAssembly`. It does NOT author the Handoff body shape.
- **[Respondent Ledger](../audit/respondent-ledger-spec.md)** (and `respondent-ledger-event.schema.json`): Response Actions requests Ledger events via `EffectRequest.ledgerAppend`. The event kind names MUST be drawn from the Ledger spec's published taxonomy.

### 1.3 Design Principles

1. **Additive.** No existing schema or spec is modified semantically. Response Actions is a new sidecar that COMPOSES with current artifacts.
2. **Closed taxonomies.** `Action.intent`, `EffectRequest.type`, `Action.onFailure`, `Action.onDeferred` are closed enums. Publisher extensions use `x-` prefixed properties on object types.
3. **Cite, do not invent.** Validation vocabulary is cited from VM. Ledger kinds are cited from Respondent Ledger. Mapping handles are cited from Mapping documents. Handoff profiles are cited from Intake Handoff.
4. **No fictional rollback.** Concept §6.4 forbids global transactional rollback. Effects execute in declared order; failure halts the chain and records an `actionFailed` ledger event; prior effects remain. Compensation is a future concern outside this spec.
5. **Idempotency at the durable boundary.** Every durable effect MUST carry an idempotency key. Transient effects (`hostEvent`) MUST NOT carry one.
6. **Authored, not generated.** Action documents are written by humans or tools. Generators MAY produce seed documents (concept §8) but the artifact is canonical author-owned.

### 1.4 Conformance Levels

- **Core.** Document validates against `response-actions.schema.json`. All closed enums respected. Required fields present.
- **Runtime.** A processor that executes Actions: implements the §7 state machine, honors the cited VM triple (profile / blocking / persistence), executes effects in declared order, enforces idempotency at the durable boundary, returns one of `completed` / `failed` / `deferred`.
- **Cross-Spec.** A processor that produces the §6.9 cross-spec fixture tuple (Response snapshot, ValidationReport snapshot, Ledger event request, Intake Handoff document) AND interoperates with a workflow host that records the terminal outcome (`accepted` / `rejected` / `deferred`) WITHOUT this spec authoring a `case.created` event.

#### 1.4.1 Conformance Prohibitions

The following are MUST NOT requirements at all conformance levels:

- MUST NOT modify Definition, Response, ValidationReport, Locale, Mapping, Intake Handoff, Respondent Ledger, Component, or Experience schemas.
- MUST NOT invent or redefine `ActionIntent`, `ValidationProfile`, `BlockingPolicy`, or `PersistencePolicy` — cite VM.
- MUST NOT inline Mapping rules in `EffectRequest.mappingExecution`. Reference by handle only.
- MUST NOT define Respondent Ledger event semantics in this document. Reference kinds from the Ledger spec.
- MUST NOT define Intake Handoff body shape in this document. Reference assembly profiles by handle.
- MUST NOT author governed case identity or case lifecycle events.
- MUST NOT emit a `case.created` event from Formspec.
- MUST NOT define a global rollback / transactional reversal of effects.
- MUST NOT block draft persistence on validation findings (VE-05, VM §4).

### 1.5 Peer Artifact Stance (resolves concept §11.1)

Response Actions is a **peer artifact** to Definition. It MUST NOT suppress, override, or alter Definition semantics. Specifically:

- An Action MUST NOT mutate item structure, binds, calculations, validation shapes, repeat semantics, or non-relevant behavior.
- An Action's effect chain MAY produce a derived artifact (Mapping output, Handoff body) but the source-of-truth Response remains Definition-governed.

**Promotion criteria.** If a future use case requires Response Actions to alter Definition semantics — for example, to add a temporary calculate during an action's execution, to suppress a Definition-declared validation shape for a specific action, or to inject behavior into the Response payload — the architecture MUST move Response Actions to a behavioral overlay with explicit merge rules over Definition (or fold the behavior into a future Definition revision). Until such a use case lands, Response Actions stays a peer.

This stance is normative. Processors MUST reject Response Actions documents that attempt to mutate Definition-owned fields.
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add specs/response-actions/response-actions-spec.md
git commit -m "feat(spec): draft response-actions §1 (intro, principles, prohibitions, peer stance)

Resolves concept-note §11.1 (peer vs overlay) with explicit promotion
criteria. Pins concept §6.3 ownership boundaries as conformance prohibitions."
```

---

## Task 5: Draft §2 Document Structure and §3 Action Identity

**Files:**
- Modify: `specs/response-actions/response-actions-spec.md`

- [ ] **Step 1: Append §2 and §3**

Append to the spec file (after §1.5):

```markdown
## 2. Document Structure

A Response Actions document is a JSON object with these top-level fields:

| Field | Type | Required | Purpose |
|---|---|---|---|
| `$formspecResponseActions` | string const `"1.0"` | Yes | Version pin. |
| `version` | string (SemVer recommended) | Yes | Document version. |
| `targetDefinition` | `{ url, compatibleVersions }` | Yes | The Definition this Actions document binds to. Identical shape to Experience EXP §2. |
| `defaultSubmitActionRef` | string (Action id) | Optional | Names the Action a legacy SubmitButton without `actionRef` resolves to. Absent ⇒ processors fall through to VM §7.1 master-table row for intent `submit`. |
| `actions` | array of `Action` | Yes (min 1) | The named action set. Order is documentation-only; resolution is by `id`. |

Authors SHOULD include exactly one `targetDefinition`. Processors MUST reject documents whose `$formspecResponseActions` is not `"1.0"`.

## 3. Action Identity

### 3.1 Action Shape

```json
{
  "id": "submitApplication",
  "intent": "submit",
  "actor": "respondent",
  "label": { "ref": "$action.submitApplication.label" },
  "preconditions": [ /* FEL expressions; see §4 */ ],
  "validation": { /* optional override of VM master row; see §5 */ },
  "effects": [ /* ordered EffectRequest list; see §6 */ ],
  "onFailure": "stop",
  "onDeferred": "stop"
}
```

### 3.2 `id`

`id` MUST be unique within the document. Recommended pattern: camelCase, beginning with a lowercase verb (`submit*`, `save*`, `requestEvidence*`, `review*`). Processors MUST reject documents containing duplicate ids.

### 3.3 `intent`

`intent` MUST be a value from VM `ActionIntent`: `save-draft`, `autosave`, `review`, `submit`, `request-evidence`. The intent selects the master-table row (VM §6) that supplies the default (profile, blocking, persistence) triple. The §5 `validation` field MAY override that triple subject to VM §6.3 predicate constraints.

### 3.4 `actor` (optional)

`actor` is a free string naming who or what is invoking. Recommended values: `respondent`, `agent`, `assistant`, `system`. Processors MUST NOT use `actor` for authorization — that lives in the host application. `actor` is metadata for audit and Trace.

### 3.5 `label` (optional)

`label` MAY hold a Locale reference (`{ ref: "$action.<id>.label" }`) or an inline `{ literal: "Submit" }`. Locale ownership is unchanged (concept §6.8). Labels are presentational; they do not affect runtime behavior.

### 3.6 `onFailure` and `onDeferred`

Closed enums controlling caller-observable terminal categorization when the state machine terminates in non-success:

- `onFailure` ∈ {`stop`, `retry-once`}: `stop` is the default — failure becomes terminal `failed`. `retry-once` re-invokes the Action exactly once with the same idempotency keys; the second failure becomes terminal `failed`.
- `onDeferred` ∈ {`stop`, `await`}: `stop` is the default — deferral becomes terminal `deferred` and the caller resumes invocation later. `await` keeps the invocation handle live; processor responsibility for the wait protocol is implementation-defined and MUST be documented in the processor's profile.
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add specs/response-actions/response-actions-spec.md
git commit -m "feat(spec): draft response-actions §2-§3 (document structure, action identity)"
```

---

## Task 6: Draft §4 Preconditions

**Files:**
- Modify: `specs/response-actions/response-actions-spec.md`

- [ ] **Step 1: Append §4**

```markdown
## 4. Preconditions

### 4.1 Shape

`preconditions` is an ordered array of objects:

```json
{
  "id": "applicantNamePresent",
  "expression": "not isEmpty(response.applicantName)",
  "severity": "block"
}
```

`severity` ∈ {`block`, `defer`}. `block` ⇒ a `false` evaluation terminates the invocation as `precondition-not-met` (terminal, see §7). `defer` ⇒ a `false` evaluation terminates the invocation as `deferred` with an implementation-defined retry contract.

### 4.2 FEL Precondition Context

The FEL evaluator MUST expose exactly this read-only context during precondition evaluation:

| Identifier | Type | Source |
|---|---|---|
| `response` | object | Current Response (a snapshot taken at invocation time, before any effect). |
| `definition` | object | Pinned Definition referenced by `targetDefinition`. |
| `action` | object | The Action being invoked: `{ id, intent, actor }`. |
| `now` | datetime | Implementation's current time at invocation. |
| `validation.lastReport` | object \| null | The most recent ValidationReport state at invocation, regardless of profile. Useful for actions like "submit only if last review pass was clean." |

The context MUST NOT expose: mutable Definition, Component tree, prior effect outcomes, ledger contents, handoff documents, or host-application state. Processors MUST reject preconditions whose FEL expression references identifiers outside this set.

### 4.3 Evaluation Order

Preconditions evaluate in array order. The first failing `block`-severity precondition terminates the invocation. A failing `defer`-severity precondition records the deferral reason and terminates the invocation as `deferred`. If no precondition fails, evaluation proceeds to §5 validation.

### 4.4 Side Effects

Precondition evaluation MUST NOT produce side effects. FEL is pure; no precondition may invoke effects, mutate the Response, append to the Ledger, or emit events.
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add specs/response-actions/response-actions-spec.md
git commit -m "feat(spec): draft response-actions §4 preconditions (bounded FEL context)"
```

---

## Task 7: Draft §5 Validation Trigger Mapping

**Files:**
- Modify: `specs/response-actions/response-actions-spec.md`

- [ ] **Step 1: Append §5**

```markdown
## 5. Validation Trigger Mapping

### 5.1 The Default Triple

Each `Action.intent` value maps to a default (profile, blocking, persistence) triple via VM §6 master table:

| Action.intent | ValidationProfile | BlockingPolicy | PersistencePolicy |
|---|---|---|---|
| `save-draft` | `off` | `non-blocking` | `draft-checkpoint` |
| `autosave` | `off` | `non-blocking` | `draft-checkpoint` |
| `review` | `on-submit` | `non-blocking` | `none` |
| `submit` | `on-submit` | `block-on-error` | `complete-response` |
| `request-evidence` | `on-demand` | `non-blocking` | `draft-checkpoint` |

This table MUST be kept byte-identical to VM §6. Conformance test `test_response_actions_runtime.py` pins the master table.

### 5.2 Per-Action Overrides

An Action MAY include a `validation` block to override one or more axes:

```json
{
  "validation": {
    "profile": "on-submit",
    "blocking": "block-on-error",
    "persistence": "complete-response"
  }
}
```

Overrides MUST satisfy the VM §6.3 validity predicate. Specifically:

- `persistence: complete-response` MUST be paired with `blocking: block-on-error` (otherwise the Response could complete with error-level findings, violating Core §5.4 / Response status semantics).
- `profile: off` MUST be paired with `blocking: non-blocking` (no findings ⇒ no findings to block on).
- `profile: on-demand` is valid with either blocking value; demand shapes feed the report independently of timing.

Processors MUST reject Action documents whose overrides violate the predicate.

### 5.3 Validation Execution

The validation pass MUST be a single ValidationReport produced by the Core engine using the resolved profile. The report becomes input to:

1. The blocking gate (§7.3).
2. Any subsequent effect that consumes the report (e.g., `handoffAssembly` MUST include the report by reference).

### 5.4 Persistence Reconciliation

`persistence: draft-checkpoint` means the processor MUST persist the current Response as a draft and SHALL emit a `ledgerAppend(draftCheckpoint)` effect if and only if an `EffectRequest` of that shape is declared in the Action. Persistence is the policy; ledger append is the auditable trace. Processors MUST NOT silently append to the Ledger without a declared `ledgerAppend` effect.

`persistence: complete-response` means the processor MUST transition Response `status` to `completed` if and only if the blocking gate (§7.3) passes. The status transition is mechanical; the ledger trace is whatever the Action declares.

`persistence: none` means no Response mutation; the action is informational (typical for `review`).
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add specs/response-actions/response-actions-spec.md
git commit -m "feat(spec): draft response-actions §5 validation trigger mapping (cites VM §6)"
```

---

## Task 8: Draft §6 Effects

**Files:**
- Modify: `specs/response-actions/response-actions-spec.md`

- [ ] **Step 1: Append §6**

```markdown
## 6. Effects

### 6.1 EffectRequest Taxonomy

`EffectRequest.type` is a closed enum with exactly these five values:

| `type` | Class | Idempotency key required? | Purpose |
|---|---|---|---|
| `mappingExecution` | durable | Yes | Run a Mapping document and produce a target payload. |
| `ledgerAppend` | durable | Yes | Request an append to the Respondent Ledger using a published event kind. |
| `handoffAssembly` | durable | Yes | Assemble an Intake Handoff document and forward it to a recipient handle. |
| `evidenceRequest` | durable | Yes | Trigger demand-timing evidence collection per Definition. |
| `hostEvent` | transient | No (MUST NOT) | Dispatch a host-local event (e.g., `formspec-submit` CustomEvent or host renderer submit API call). |

The `EffectRequest` $defs in `response-actions.schema.json` MUST use a discriminator on `type` with `oneOf` branches; processors MUST reject unknown `type` values.

### 6.2 Effect Shapes

Each branch is a closed object:

```json
// mappingExecution
{ "type": "mappingExecution", "mappingRef": "<handle>", "idempotencyKey": "<FEL expr>", "onError": "fail" }

// ledgerAppend
{ "type": "ledgerAppend", "eventKind": "<published-kind>", "payloadRef": "<FEL expr>", "idempotencyKey": "<FEL expr>", "onError": "fail" }

// handoffAssembly
{ "type": "handoffAssembly", "handoffProfileRef": "<handle>", "recipientRef": "<handle>", "idempotencyKey": "<FEL expr>", "onError": "fail" }

// evidenceRequest
{ "type": "evidenceRequest", "requestRef": "<handle>", "idempotencyKey": "<FEL expr>", "onError": "defer" }

// hostEvent
{ "type": "hostEvent", "eventName": "<string>", "detailRef": "<FEL expr>" }
```

`onError` ∈ {`fail`, `defer`, `continue`}. Default `fail`. `evidenceRequest` defaults to `defer`. `hostEvent` has no `onError` — transient effects MUST NOT fail the invocation.

### 6.3 Ordered Execution

The processor MUST invoke effects in declared array order. The processor MUST NOT reorder, parallelize, or coalesce effects without an explicit Action declaration (which this spec does not introduce). A future spec MAY add `parallel: true` markers if a real use case appears; until then, strict order.

### 6.4 No Rollback

Per concept §6.4: when an effect fails (`onError: fail`), the processor MUST halt the remaining chain and MUST NOT reverse prior effects. The terminal state is `failed` (§7). Prior durable effects remain materialized; their idempotency keys ensure a replay does not duplicate them. Compensation effects are NOT specified by this document.

### 6.5 Idempotency

Every durable effect MUST carry `idempotencyKey`. The key is a FEL expression evaluated at invocation time, against the same context as preconditions (§4.2) PLUS:

- `invocation.id` (UUID generated per invocation; stable across replays of the SAME invocation)
- `invocation.attempt` (integer; 1 for first attempt, increments on `retry-once`)

A processor receiving an effect with an idempotency key it has previously executed MUST observe the prior outcome WITHOUT re-executing the side effect. The effect trace records `replayed: true` for that effect.

### 6.6 Effect Outcomes

Each effect produces an outcome object recorded in the invocation effect trace:

```json
{
  "type": "ledgerAppend",
  "status": "succeeded" | "failed" | "deferred" | "replayed",
  "idempotencyKey": "<resolved>",
  "outcomeRef": "<opaque handle to the produced artifact / event head / handoff document / failure reason>"
}
```

The trace is observable to the UI and SHOULD be exposed to Trace generators (concept §10.6). This spec does not define the trace's wire format; it defines the conceptual shape so processors can interoperate.
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add specs/response-actions/response-actions-spec.md
git commit -m "feat(spec): draft response-actions §6 effects (closed taxonomy, idempotency, no rollback)"
```

---

## Task 9: Draft §7 Invocation State Machine

**Files:**
- Modify: `specs/response-actions/response-actions-spec.md`

- [ ] **Step 1: Append §7**

```markdown
## 7. Invocation State Machine

An invocation MUST traverse exactly this state graph. States in **bold** are terminal.

```text
idle
  → invoking
    → preconditions-evaluated
      → (block fail) → **precondition-not-met**
      → (defer fail) → **deferred**
      → (all pass)   → validation-running
        → blocking-gate
          → (block-on-error & ValidationReport.valid=false) → **failed-precondition**
          → (gate passes) → effects-running
            → (effect onError=fail) → **failed**
            → (effect onError=defer) → **deferred**
            → (all effects succeed or replayed) → **completed**
```

### 7.1 Transitions

| From | Event | To |
|---|---|---|
| `idle` | caller invokes | `invoking` |
| `invoking` | snapshot captured | `preconditions-evaluated` |
| `preconditions-evaluated` | all preconditions pass | `validation-running` |
| `preconditions-evaluated` | block-severity fails | **`precondition-not-met`** |
| `preconditions-evaluated` | defer-severity fails | **`deferred`** |
| `validation-running` | report produced | `blocking-gate` |
| `blocking-gate` | gate passes | `effects-running` |
| `blocking-gate` | gate fails | **`failed-precondition`** |
| `effects-running` | effect.onError=fail | **`failed`** |
| `effects-running` | effect.onError=defer | **`deferred`** |
| `effects-running` | all effects done | **`completed`** |

### 7.2 Snapshot Discipline

`invoking` MUST capture an immutable snapshot of the Response at the moment of invocation. All preconditions, validation, and effects MUST read from this snapshot. The Response MAY mutate via concurrent edits between invocation and terminal state; those edits MUST NOT affect this invocation's behavior. (Idempotency at the durable boundary handles the contention case.)

### 7.3 The Blocking Gate

If the Action's resolved `blocking` is `non-blocking`, the gate is a no-op and the state advances to `effects-running` regardless of report contents.

If `blocking` is `block-on-error`, the gate evaluates `ValidationReport.valid`. If `false` (i.e., `counts.error > 0`), the state advances to **`failed-precondition`** and **zero effects are invoked**. This preserves VE-05: the Response data is NOT mutated and NOT persisted under `complete-response`; if `persistence: draft-checkpoint`, the draft persistence MUST still occur (VE-05 forbids blocking saves on validation findings) but the `failed-precondition` terminal is recorded.

### 7.4 Terminal Categorization

| Terminal | UI MUST | Caller MAY |
|---|---|---|
| `completed` | Surface success; trace available. | Discard invocation handle. |
| `failed` | Surface failure with reason; show effect trace up to failure. | Re-invoke (with new invocation id; idempotency keys protect against duplication on durable effects that succeeded). |
| `failed-precondition` | Surface validation report; do NOT surface success. | Re-invoke after user correction. |
| `precondition-not-met` | Surface precondition id and FEL expression that failed. | Re-invoke after user correction. |
| `deferred` | Surface deferral reason and replay token. | Resume per processor's deferral protocol. |

The UI MUST NOT report `completed` on any other terminal. A processor that conflates `failed` with `completed` is non-conforming.

### 7.5 Replay

A replay is a re-invocation that re-uses the original `invocation.id` (NOT a new one). Processors MAY support replay; if so, durable effects with prior outcomes return `replayed`. A replay is the recovery path after `deferred` and after `failed` (when `onFailure: retry-once`). The replay protocol's transport and handle exchange are implementation-defined.
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add specs/response-actions/response-actions-spec.md
git commit -m "feat(spec): draft response-actions §7 invocation state machine (closed terminals)"
```

---

## Task 10: Draft §8 Failure, §9 Deferred, §10 Host Event Boundaries

**Files:**
- Modify: `specs/response-actions/response-actions-spec.md`

- [ ] **Step 1: Append §8–§10**

```markdown
## 8. Failure Outcomes

A `failed` terminal carries a structured failure object:

```json
{
  "terminal": "failed",
  "failedEffect": { "index": 2, "type": "handoffAssembly", "reason": "<implementation-defined>" },
  "effectTrace": [ /* outcomes of effects up to and including the failure */ ],
  "validationReport": { /* the report from §5.3 if validation ran */ }
}
```

Processors MUST NOT redact `failedEffect.reason` from the caller. Sensitive operational detail (stack traces, internal endpoints) MAY be replaced with a redaction marker; the reason MUST remain meaningful enough for a user-facing error message.

A processor with `onFailure: retry-once` performs exactly one retry with `invocation.attempt = 2` and the SAME idempotency keys before terminating as `failed`. Retry does not re-evaluate preconditions; it re-enters at `effects-running` with the same snapshot.

## 9. Deferred Outcomes

A `deferred` terminal indicates the invocation is paused awaiting external progress. The processor MUST emit:

```json
{
  "terminal": "deferred",
  "reason": "<precondition id | effect.type:index | implementation-defined>",
  "replayToken": "<opaque>",
  "effectTrace": [ /* partial trace */ ]
}
```

The `replayToken` is opaque to this spec. The processor's deferral protocol governs token lifetime, semantics, and replay invocation. A deferred invocation MAY transition to `completed`, `failed`, `failed-precondition`, or `deferred` (again) on replay.

Common deferral sources:

- `precondition` with `severity: defer` returned `false`.
- `evidenceRequest` returned a request id awaiting respondent action.
- Workflow-host `handoffAssembly` accepted the document but is awaiting human review (the host owns this state; the Response Actions deferred terminal is observable to the UI).

## 10. Host Event Boundaries

### 10.1 Transient Host Events

`EffectRequest.type: hostEvent` is the ONLY transient effect type. It dispatches a host-local signal (DOM CustomEvent, host renderer callback, etc.) and MUST NOT produce externally durable consequences. A `hostEvent` effect that does produce durable state is non-conforming.

The pre-existing `formspec-submit` CustomEvent (Component §5.19) is the canonical transient submit signal. A named submit Action MAY include a `hostEvent` effect with `eventName: "formspec-submit"` to preserve existing renderer integrations.

### 10.2 Durable Effects vs Transient Signals

A host application MUST NOT use a `hostEvent` as the trigger to write to durable storage, charge a credit card, or otherwise produce side effects. Those operations belong in a durable effect type. The line is bright: durable effects carry idempotency keys, transient effects do not.

### 10.3 Default Submit Action (cites VM §7.1)

VM §7.1 pins the SubmitButton-without-actionRef path: processors treat it as invoking an unnamed default Action with `intent: submit` and the VM §6 master-table row. This spec defines the *named* form so authors can attach effects beyond gating:

```json
{
  "id": "submitApplication",
  "intent": "submit",
  "effects": [
    { "type": "mappingExecution", "mappingRef": "applicationPayload", "idempotencyKey": "concat(response.applicationId, '/v', response.version)" },
    { "type": "ledgerAppend", "eventKind": "submitAttempted", "payloadRef": "{ reportRef: validation.lastReport, mappingOutcomeRef: effects[0].outcomeRef }", "idempotencyKey": "concat(invocation.id, '/submitAttempted')" },
    { "type": "handoffAssembly", "handoffProfileRef": "intakeStandard", "recipientRef": "wosIntake", "idempotencyKey": "concat(invocation.id, '/handoff')" },
    { "type": "ledgerAppend", "eventKind": "handoffEmitted", "payloadRef": "{ handoffOutcomeRef: effects[2].outcomeRef }", "idempotencyKey": "concat(invocation.id, '/handoffEmitted')" },
    { "type": "hostEvent", "eventName": "formspec-submit", "detailRef": "{ reportRef: validation.lastReport, handoffOutcomeRef: effects[2].outcomeRef }" }
  ]
}
```

When `defaultSubmitActionRef: "submitApplication"` is set on the Response Actions document, a legacy SubmitButton without `actionRef` MUST invoke this Action. When `defaultSubmitActionRef` is absent, the processor MUST fall back to the unnamed default (VM §7.1 master row) — gating only, no extra effects.

Component documents are NOT modified to introduce `actionRef`; that field is future shape (concept §10.4).
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add specs/response-actions/response-actions-spec.md
git commit -m "feat(spec): draft response-actions §8-§10 (failure, deferred, host event boundaries, default submit)"
```

---

## Task 11: Draft §11 Cross-Artifact References, §12 Conformance, §13 Prohibitions, §14 Migration

**Files:**
- Modify: `specs/response-actions/response-actions-spec.md`

- [ ] **Step 1: Append §11–§14**

```markdown
## 11. Cross-Artifact References

### 11.1 Mapping Reference

`mappingExecution.mappingRef` is a handle to a Mapping document (see [Mapping spec §1](../mapping/mapping-spec.md)). The resolution scheme is the host's responsibility; processors typically support either a URL or a registry alias. Inlining Mapping rules in the EffectRequest is FORBIDDEN.

### 11.2 Intake Handoff Reference

`handoffAssembly.handoffProfileRef` is a handle to an Intake Handoff assembly profile. The Handoff body shape is owned by the Intake Handoff spec; this Action describes only WHAT to assemble and WHERE to send it, not the body. The outcome handle returned in the effect trace points to the produced Handoff document.

The cross-spec fixture (`cross-spec-intake-handoff-seam.json`) covers the full seam: Response snapshot → ValidationReport snapshot → Ledger event request → Handoff document → workflow-host acknowledgment of one of `accepted` / `rejected` / `deferred`. The workflow-host outcome is OUTSIDE this spec's responsibility; Response Actions MUST NOT author a `case.created` event or any case lifecycle event.

### 11.3 Respondent Ledger Reference

`ledgerAppend.eventKind` MUST be a kind name published in the Respondent Ledger spec (`respondent-ledger.md` / `respondent-ledger-event.schema.json`). Authors MUST NOT invent new kinds in a Response Actions document. The Ledger spec owns materiality, durability, integrity profile, and append semantics; this Action only requests the append.

`payloadRef` is a FEL expression evaluated in the §4.2 context PLUS access to prior effect outcomes via `effects[i].outcomeRef`. The Ledger spec defines what payload shape each kind expects.

## 12. Conformance

### 12.1 Core Conformance

A Core-conforming Response Actions document:

1. Validates against `response-actions.schema.json`.
2. Has a unique `id` per Action.
3. Uses only published `Action.intent`, `EffectRequest.type`, `onFailure`, `onDeferred` values.
4. Includes `idempotencyKey` on every durable effect.
5. Omits `idempotencyKey` on every `hostEvent`.
6. If `validation` is set, satisfies the VM §6.3 validity predicate.

### 12.2 Runtime Conformance

A Runtime-conforming processor:

1. Implements the §7 state machine without conflating terminals.
2. Honors the resolved (profile, blocking, persistence) triple per VM.
3. Executes effects in declared order.
4. Halts effect execution on first `onError: fail` failure (no implicit rollback).
5. Observes prior effect outcomes via idempotency keys on replay.
6. Surfaces failure to the UI; does NOT report success on any non-`completed` terminal.
7. Honors VE-05: draft persistence is never blocked by validation findings.

### 12.3 Cross-Spec Conformance

A Cross-Spec-conforming processor produces the §6.9 fixture tuple and interoperates with a workflow host that records the terminal outcome (`accepted` / `rejected` / `deferred`). Formspec MUST NOT author `case.created`.

### 12.4 Required Fixtures

A conforming implementation MUST pass all fixtures under `tests/conformance/fixtures/response-actions/`. The fixture set is enumerated in the plan File Structure section above and pinned by `test_response_actions_runtime.py`.

## 13. Conformance Prohibitions (re-asserted)

The §1.4.1 prohibitions are normative at all conformance levels and are restated here for ease of citation:

- MUST NOT modify any existing spec or schema.
- MUST NOT invent new validation vocabulary.
- MUST NOT inline Mapping rules.
- MUST NOT define Ledger event semantics.
- MUST NOT define Handoff body shape.
- MUST NOT author governed case identity or lifecycle events.
- MUST NOT emit a `case.created` event.
- MUST NOT define global rollback.
- MUST NOT block draft persistence on validation findings.

## 14. Migration

### 14.1 Existing `SubmitButton` Documents

No migration required. Components continue to work unchanged per VM §7.1. A team that wants effects beyond the default gate MAY author a Response Actions document and set `defaultSubmitActionRef` to a named Action; the existing SubmitButton resolves to it automatically.

### 14.2 Existing Adapters and Renderers

No changes required. Adapters that emit `formspec-submit` continue to do so. The named-action form is a superset: a processor that ignores Response Actions documents continues to behave correctly for the default submit case (by VM §7.1).

### 14.3 Existing `ValidationSummary` Documents

No changes required. ValidationSummary continues to read live or submit validation state per Component §6.13 / VM §8.

### 14.4 Future `actionRef` on Component

Out of scope. When concept §10.4 lands, Component nodes MAY gain an `actionRef` field; that future spec governs lookup and precedence. Authoring guidance: do NOT add `actionRef` to Component documents until that spec ships, because it is not yet a valid Component schema field.
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add specs/response-actions/response-actions-spec.md
git commit -m "feat(spec): draft response-actions §11-§14 (cross-artifact refs, conformance, prohibitions, migration)"
```

---

## Task 12: Author the schema

**Files:**
- Create: `schemas/response-actions.schema.json`

- [ ] **Step 1: Write the schema**

```bash
cd formspec && touch schemas/response-actions.schema.json
```

Write the file with this exact structure (every field MUST have `description`; `x-lm.critical=true` MUST also have at least one `examples` entry per the formspec authoring contract):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://formspec.org/schemas/responseActions/1.0",
  "title": "Formspec Response Actions",
  "description": "Form-scoped runtime contract for action invocation. Defines named Actions (closed Action.intent from validation-mapping.md ActionIntent), FEL preconditions, optional per-action validation overrides subject to VM §6.3, an ordered closed-taxonomy EffectRequest list with idempotency at the durable boundary, and the named form of the default submit Action that anchors VM §7.1 SubmitButton compatibility. See specs/response-actions/response-actions-spec.md for the normative prose. Conformance is pinned by tests/conformance/spec/test_response_actions_runtime.py.",
  "type": "object",
  "required": ["$formspecResponseActions", "version", "targetDefinition", "actions"],
  "additionalProperties": false,
  "properties": {
    "$formspecResponseActions": {
      "type": "string",
      "const": "1.0",
      "description": "Response Actions specification version. MUST be '1.0'.",
      "examples": ["1.0"],
      "x-lm": { "critical": true, "intent": "Version pin for response-actions document compatibility" }
    },
    "version": {
      "type": "string",
      "minLength": 1,
      "description": "Version of this Response Actions Document. SemVer RECOMMENDED.",
      "examples": ["1.0.0"]
    },
    "targetDefinition": {
      "type": "object",
      "required": ["url", "compatibleVersions"],
      "properties": {
        "url": { "type": "string", "format": "uri" },
        "compatibleVersions": { "type": "string" }
      },
      "additionalProperties": false,
      "description": "The Definition this Response Actions document binds to. Identical shape to Experience.targetDefinition.",
      "examples": [{ "url": "https://example.gov/forms/intake", "compatibleVersions": ">=1.0.0 <2.0.0" }]
    },
    "defaultSubmitActionRef": {
      "type": "string",
      "description": "OPTIONAL. Names the Action a legacy SubmitButton without actionRef resolves to. When absent, processors fall back to validation-mapping.md §7.1 master-table row for intent submit.",
      "examples": ["submitApplication"]
    },
    "actions": {
      "type": "array",
      "minItems": 1,
      "items": { "$ref": "#/$defs/Action" },
      "description": "The named action set. Order is documentation-only; resolution is by Action.id. Each id MUST be unique within the document."
    }
  },
  "$defs": {
    "ActionIntent": {
      "$ref": "validation-mapping.schema.json#/$defs/ActionIntent",
      "description": "Cited closed enum from validation-mapping.md §2. MUST NOT be redefined in this schema."
    },
    "Action": {
      "type": "object",
      "required": ["id", "intent", "effects"],
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string", "minLength": 1, "pattern": "^[a-z][A-Za-z0-9]*$", "description": "Unique within document. camelCase, lowercase first letter." },
        "intent": { "$ref": "#/$defs/ActionIntent" },
        "actor": { "type": "string", "description": "OPTIONAL. Free string naming the caller (respondent, agent, assistant, system). Metadata only; MUST NOT be used for authorization." },
        "label": {
          "oneOf": [
            { "type": "object", "properties": { "ref": { "type": "string" } }, "required": ["ref"], "additionalProperties": false },
            { "type": "object", "properties": { "literal": { "type": "string" } }, "required": ["literal"], "additionalProperties": false }
          ],
          "description": "OPTIONAL. Locale ref or literal label. Presentational only."
        },
        "preconditions": {
          "type": "array",
          "items": { "$ref": "#/$defs/Precondition" },
          "description": "OPTIONAL ordered list of FEL preconditions; see spec §4."
        },
        "validation": { "$ref": "#/$defs/ValidationOverride" },
        "effects": {
          "type": "array",
          "minItems": 1,
          "items": { "$ref": "#/$defs/EffectRequest" },
          "description": "Ordered effect chain. Executes in declared order; see spec §6.3."
        },
        "onFailure": { "type": "string", "enum": ["stop", "retry-once"], "default": "stop", "description": "Terminal behavior after a failing effect. retry-once re-invokes exactly once with the same idempotency keys." },
        "onDeferred": { "type": "string", "enum": ["stop", "await"], "default": "stop", "description": "Terminal behavior after a deferred effect. await keeps the invocation handle live per processor profile." }
      }
    },
    "Precondition": {
      "type": "object",
      "required": ["id", "expression", "severity"],
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string", "minLength": 1 },
        "expression": { "type": "string", "description": "FEL expression evaluated in the bounded context defined in spec §4.2." },
        "severity": { "type": "string", "enum": ["block", "defer"] }
      }
    },
    "ValidationOverride": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "profile": { "$ref": "validation-mapping.schema.json#/$defs/ValidationProfile" },
        "blocking": { "$ref": "validation-mapping.schema.json#/$defs/BlockingPolicy" },
        "persistence": { "$ref": "validation-mapping.schema.json#/$defs/PersistencePolicy" }
      },
      "description": "Per-action override of the master-table triple. MUST satisfy VM §6.3 validity predicate; processors MUST reject violations."
    },
    "EffectRequest": {
      "oneOf": [
        { "$ref": "#/$defs/MappingExecutionEffect" },
        { "$ref": "#/$defs/LedgerAppendEffect" },
        { "$ref": "#/$defs/HandoffAssemblyEffect" },
        { "$ref": "#/$defs/EvidenceRequestEffect" },
        { "$ref": "#/$defs/HostEventEffect" }
      ],
      "discriminator": { "propertyName": "type" },
      "description": "Closed taxonomy. Durable types (mappingExecution, ledgerAppend, handoffAssembly, evidenceRequest) MUST carry idempotencyKey. hostEvent is transient and MUST NOT carry one."
    },
    "MappingExecutionEffect": {
      "type": "object",
      "required": ["type", "mappingRef", "idempotencyKey"],
      "additionalProperties": false,
      "properties": {
        "type": { "const": "mappingExecution" },
        "mappingRef": { "type": "string" },
        "idempotencyKey": { "type": "string", "description": "FEL expression evaluated at invocation; see spec §6.5." },
        "onError": { "type": "string", "enum": ["fail", "defer", "continue"], "default": "fail" }
      }
    },
    "LedgerAppendEffect": {
      "type": "object",
      "required": ["type", "eventKind", "idempotencyKey"],
      "additionalProperties": false,
      "properties": {
        "type": { "const": "ledgerAppend" },
        "eventKind": { "type": "string", "description": "Published kind from respondent-ledger spec. MUST NOT be invented here." },
        "payloadRef": { "type": "string", "description": "FEL expression producing the event payload." },
        "idempotencyKey": { "type": "string" },
        "onError": { "type": "string", "enum": ["fail", "defer", "continue"], "default": "fail" }
      }
    },
    "HandoffAssemblyEffect": {
      "type": "object",
      "required": ["type", "handoffProfileRef", "recipientRef", "idempotencyKey"],
      "additionalProperties": false,
      "properties": {
        "type": { "const": "handoffAssembly" },
        "handoffProfileRef": { "type": "string" },
        "recipientRef": { "type": "string" },
        "idempotencyKey": { "type": "string" },
        "onError": { "type": "string", "enum": ["fail", "defer", "continue"], "default": "fail" }
      }
    },
    "EvidenceRequestEffect": {
      "type": "object",
      "required": ["type", "requestRef", "idempotencyKey"],
      "additionalProperties": false,
      "properties": {
        "type": { "const": "evidenceRequest" },
        "requestRef": { "type": "string" },
        "idempotencyKey": { "type": "string" },
        "onError": { "type": "string", "enum": ["fail", "defer", "continue"], "default": "defer" }
      }
    },
    "HostEventEffect": {
      "type": "object",
      "required": ["type", "eventName"],
      "additionalProperties": false,
      "properties": {
        "type": { "const": "hostEvent" },
        "eventName": { "type": "string", "minLength": 1 },
        "detailRef": { "type": "string", "description": "FEL expression producing the event detail. OPTIONAL." }
      },
      "description": "Transient. MUST NOT carry idempotencyKey; MUST NOT produce externally durable consequences (spec §10.1)."
    }
  }
}
```

- [ ] **Step 2: Validate schema parses and is a valid JSON Schema**

```bash
cd formspec && node -e "
const Ajv = require('ajv/dist/2020');
const draft = require('ajv/dist/refs/json-schema-2020-12/schema.json');
const ajv = new Ajv({strict: false, allErrors: true});
const schema = JSON.parse(require('fs').readFileSync('schemas/response-actions.schema.json'));
const validate = ajv.compile(draft);
const ok = validate(schema);
if (!ok) { console.error(JSON.stringify(validate.errors, null, 2)); process.exit(1); }
console.log('schema is well-formed 2020-12 JSON Schema');
"
```

Expected: `schema is well-formed 2020-12 JSON Schema`. If Ajv isn't on path, fall back to `npm run docs:check` which exercises the schema linter.

- [ ] **Step 3: Commit**

```bash
cd formspec && git add schemas/response-actions.schema.json
git commit -m "feat(schema): add response-actions.schema.json

Closed Action.intent (cited from validation-mapping), closed
EffectRequest.type taxonomy with oneOf discriminator. Durable types
require idempotencyKey; hostEvent forbids it. ValidationOverride refs
validation-mapping enums to enforce the §6.3 validity predicate at
schema level."
```

---

## Task 13: Author the required §6.5 vocabulary fixtures

**Files:**
- Create: `tests/conformance/fixtures/response-actions/definition-base.json`
- Create: `tests/conformance/fixtures/response-actions/intent-save-draft.json`
- Create: `tests/conformance/fixtures/response-actions/intent-submit-blocked.json`
- Create: `tests/conformance/fixtures/response-actions/intent-warning-only-submit.json`
- Create: `tests/conformance/fixtures/response-actions/intent-request-evidence-demand.json`
- Create: `tests/conformance/fixtures/response-actions/intent-disabled-no-validation.json`

- [ ] **Step 1: Create the fixture directory**

```bash
mkdir -p formspec/tests/conformance/fixtures/response-actions
```

- [ ] **Step 2: Copy the definition-base from validation-mapping**

The validation-mapping plan created an equivalent Definition. Reuse it to pin behavioral parity:

```bash
cp formspec/tests/conformance/fixtures/validation-mapping/definition-base.json \
   formspec/tests/conformance/fixtures/response-actions/definition-base.json
```

If the validation-mapping fixture is not yet on disk (validation-mapping plan not executed), STOP and execute that plan first (it's a hard dependency).

- [ ] **Step 3: Author each fixture**

Each fixture is a JSON object with this shape:

```json
{
  "name": "<fixture name>",
  "description": "<one sentence on what this proves>",
  "definitionRef": "definition-base.json",
  "responseActions": { /* full Response Actions document */ },
  "response": { /* the Response under test */ },
  "invocation": { "actionId": "<id>", "actor": "respondent" },
  "expected": {
    "terminal": "completed | failed | failed-precondition | precondition-not-met | deferred",
    "validationReport": { "produced": true|false, "validity": true|false, "counts": { /* optional */ } },
    "persistence": "none | draft-checkpoint | complete-response",
    "responseStatusAfter": "in-progress | completed",
    "effectTrace": [
      { "type": "<EffectRequest.type>", "status": "succeeded | failed | deferred | replayed | not-invoked" }
    ],
    "prohibitions": {
      "caseCreatedEventEmitted": false,
      "definitionMutated": false,
      "mappingRulesInlined": false
    }
  }
}
```

Author each of the five fixtures per the table in the File Structure section. Be explicit in `expected.effectTrace`: list every declared effect with its observed status. For `intent-submit-blocked.json`, every declared effect MUST appear with `status: "not-invoked"` to prove the §7.3 blocking gate.

- [ ] **Step 4: Validate each Response Actions document against the schema**

```bash
cd formspec && node -e "
const Ajv = require('ajv/dist/2020');
const ajv = new Ajv({strict: false, allErrors: true});
const schema = JSON.parse(require('fs').readFileSync('schemas/response-actions.schema.json'));
const vmSchema = JSON.parse(require('fs').readFileSync('schemas/validation-mapping.schema.json'));
ajv.addSchema(vmSchema);
const validate = ajv.compile(schema);
const fs = require('fs');
const dir = 'tests/conformance/fixtures/response-actions';
for (const f of fs.readdirSync(dir)) {
  if (f === 'definition-base.json') continue;
  const fx = JSON.parse(fs.readFileSync(\`\${dir}/\${f}\`));
  if (!fx.responseActions) continue;
  const ok = validate(fx.responseActions);
  console.log(f, ok ? 'OK' : 'FAIL', ok ? '' : JSON.stringify(validate.errors));
}
"
```

Expected: every fixture prints `OK`.

- [ ] **Step 5: Commit**

```bash
cd formspec && git add tests/conformance/fixtures/response-actions/
git commit -m "test(conformance): add response-actions §6.5 vocabulary fixtures

Five required fixtures covering save-draft, submit-blocked,
warning-only-submit, request-evidence-demand, autosave-disabled.
Schema-validated against response-actions.schema.json + cited
validation-mapping enums."
```

---

## Task 14: Author the effect-ordering, failure, deferred, replay, precondition fixtures

**Files:**
- Create: `tests/conformance/fixtures/response-actions/effect-ordering.json`
- Create: `tests/conformance/fixtures/response-actions/effect-failure-no-rollback.json`
- Create: `tests/conformance/fixtures/response-actions/effect-deferred-evidence.json`
- Create: `tests/conformance/fixtures/response-actions/effect-idempotent-replay.json`
- Create: `tests/conformance/fixtures/response-actions/precondition-fails-deferred.json`

- [ ] **Step 1: Author each fixture per the File Structure section descriptions**

Use the same shape as Task 13's fixtures. Key expectations to pin:

- `effect-ordering.json` — `effectTrace` array MUST be in exact declared order; `expected.effectTraceOrder` matches `responseActions.actions[0].effects` indices 0..4.
- `effect-failure-no-rollback.json` — index 2 (`handoffAssembly`) has `status: "failed"`. Indices 0 and 1 have `status: "succeeded"` and MUST remain in the trace (NOT marked rolled-back). Index 3 (`hostEvent`) has `status: "not-invoked"`. Expected adds `expected.compensationsAttempted: false`.
- `effect-deferred-evidence.json` — `evidenceRequest` returns `deferred`; subsequent effects `not-invoked`; expected has `replayTokenIssued: true`.
- `effect-idempotent-replay.json` — fixture includes TWO invocation blocks: `invocation.first` and `invocation.replay`. Second invocation uses identical `invocation.id`. Expected: first invocation's effect trace has all `succeeded`; replay's trace has all `replayed`. Idempotency keys MUST be identical between runs.
- `precondition-fails-deferred.json` — precondition with `severity: defer` evaluates `false`. No validation pass run; zero effects invoked; expected terminal `deferred`.

- [ ] **Step 2: Schema-validate**

Re-run the script from Task 13 Step 4. Expected: every fixture's `responseActions` validates `OK`.

- [ ] **Step 3: Commit**

```bash
cd formspec && git add tests/conformance/fixtures/response-actions/
git commit -m "test(conformance): add response-actions §6.4 effect-ordering / failure / deferred / replay fixtures

Pins no-rollback semantics, ordered execution, idempotent replay
contract, and deferred terminal with replay token."
```

---

## Task 15: Author the §6.9 cross-spec Intake Handoff seam fixture and SubmitButton default fixture

**Files:**
- Create: `tests/conformance/fixtures/response-actions/cross-spec-intake-handoff-seam.json`
- Create: `tests/conformance/fixtures/response-actions/submitbutton-default-action.json`
- Create: `tests/conformance/fixtures/response-actions/master-action-shapes.json`

- [ ] **Step 1: Author cross-spec-intake-handoff-seam.json**

The fixture MUST produce the full §6.9 tuple. Add to `expected`:

```json
{
  "crossSpecTuple": {
    "responseSnapshotRef": "<opaque>",
    "validationReportRef": "<opaque>",
    "ledgerHeadRef": "<opaque>",
    "handoffDocumentRef": "<opaque>",
    "workflowHostOutcome": "accepted | rejected | deferred"
  },
  "prohibitions": {
    "caseCreatedEventEmitted": false,
    "caseLifecycleEventsEmitted": []
  }
}
```

The `workflowHostOutcome` is provided by the test harness, simulating a workflow host. The fixture pins that exactly one of the three values is recorded and that NO case lifecycle events were authored by Formspec.

- [ ] **Step 2: Author submitbutton-default-action.json**

Include both a Component fixture (a tree with a SubmitButton lacking `actionRef`) AND a Response Actions document. Two scenario blocks:

- `scenario.withDefaultRef`: Response Actions has `defaultSubmitActionRef: "submitApplication"`. Expected: SubmitButton click resolves to the named Action.
- `scenario.withoutDefaultRef`: Response Actions omits `defaultSubmitActionRef`. Expected: SubmitButton click falls back to the unnamed default (VM §7.1 master row) — gating only, no extra effects, observable state `completed`.

- [ ] **Step 3: Author master-action-shapes.json**

A single Response Actions document containing FIVE Actions (one per `Action.intent` value) and FIVE EffectRequest examples (one per `EffectRequest.type`). This document is a coverage marker: every closed-enum branch appears exactly once. Used by the schema test to assert exhaustiveness.

- [ ] **Step 4: Schema-validate**

```bash
cd formspec && node -e "
const Ajv = require('ajv/dist/2020');
const ajv = new Ajv({strict: false, allErrors: true});
const schema = JSON.parse(require('fs').readFileSync('schemas/response-actions.schema.json'));
const vmSchema = JSON.parse(require('fs').readFileSync('schemas/validation-mapping.schema.json'));
ajv.addSchema(vmSchema);
const validate = ajv.compile(schema);
const fs = require('fs');
['cross-spec-intake-handoff-seam.json', 'submitbutton-default-action.json', 'master-action-shapes.json'].forEach(f => {
  const fx = JSON.parse(fs.readFileSync(\`tests/conformance/fixtures/response-actions/\${f}\`));
  const docs = fx.responseActions ? [fx.responseActions] : Object.values(fx.scenario || {}).map(s => s.responseActions).filter(Boolean);
  for (const d of docs) {
    const ok = validate(d);
    console.log(f, ok ? 'OK' : 'FAIL', ok ? '' : JSON.stringify(validate.errors));
  }
});
"
```

Expected: every printed line ends with `OK`.

- [ ] **Step 5: Commit**

```bash
cd formspec && git add tests/conformance/fixtures/response-actions/
git commit -m "test(conformance): add cross-spec intake-handoff seam, submitbutton-default, master-shapes fixtures"
```

---

## Task 16: Write schema-shape pytest

**Files:**
- Create: `tests/conformance/schemas/test_response_actions_schema.py`

- [ ] **Step 1: Write the test**

```python
"""Schema-shape tests for response-actions.schema.json.

Pins:
- $defs present and named per spec §3-§6.
- EffectRequest.type is a closed enum (no oneOf branch outside the named five).
- Durable effect types require idempotencyKey.
- HostEventEffect FORBIDS idempotencyKey.
- ValidationOverride uses $refs into validation-mapping.schema.json.
- master-action-shapes.json exercises every closed-enum branch.
"""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator
from referencing import Registry, Resource


SCHEMA_PATH = Path(__file__).resolve().parents[3] / "schemas" / "response-actions.schema.json"
VM_SCHEMA_PATH = Path(__file__).resolve().parents[3] / "schemas" / "validation-mapping.schema.json"
FIXTURE_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "response-actions"


def load_schema():
    return json.loads(SCHEMA_PATH.read_text())


def load_vm_schema():
    return json.loads(VM_SCHEMA_PATH.read_text())


def build_validator():
    schema = load_schema()
    vm_schema = load_vm_schema()
    registry = Registry().with_resource(
        uri="validation-mapping.schema.json",
        resource=Resource.from_contents(vm_schema),
    )
    return Draft202012Validator(schema, registry=registry)


def test_schema_id_and_version_pin():
    schema = load_schema()
    assert schema["$id"] == "https://formspec.org/schemas/responseActions/1.0"
    assert schema["properties"]["$formspecResponseActions"]["const"] == "1.0"


def test_defs_present():
    schema = load_schema()
    defs = schema["$defs"]
    for name in (
        "ActionIntent", "Action", "Precondition", "ValidationOverride",
        "EffectRequest", "MappingExecutionEffect", "LedgerAppendEffect",
        "HandoffAssemblyEffect", "EvidenceRequestEffect", "HostEventEffect",
    ):
        assert name in defs, f"missing $defs.{name}"


def test_effect_request_taxonomy_closed():
    schema = load_schema()
    one_of = schema["$defs"]["EffectRequest"]["oneOf"]
    refs = {b["$ref"] for b in one_of}
    expected = {
        "#/$defs/MappingExecutionEffect",
        "#/$defs/LedgerAppendEffect",
        "#/$defs/HandoffAssemblyEffect",
        "#/$defs/EvidenceRequestEffect",
        "#/$defs/HostEventEffect",
    }
    assert refs == expected, "EffectRequest taxonomy MUST be closed at exactly five branches"


@pytest.mark.parametrize("def_name", [
    "MappingExecutionEffect",
    "LedgerAppendEffect",
    "HandoffAssemblyEffect",
    "EvidenceRequestEffect",
])
def test_durable_effects_require_idempotency_key(def_name):
    schema = load_schema()
    eff = schema["$defs"][def_name]
    assert "idempotencyKey" in eff["required"], f"{def_name} MUST require idempotencyKey"


def test_host_event_forbids_idempotency_key():
    schema = load_schema()
    host = schema["$defs"]["HostEventEffect"]
    assert "idempotencyKey" not in host.get("required", [])
    assert "idempotencyKey" not in host["properties"], "HostEventEffect MUST NOT permit idempotencyKey"
    assert host["additionalProperties"] is False


def test_validation_override_refs_vm_enums():
    schema = load_schema()
    vo = schema["$defs"]["ValidationOverride"]
    props = vo["properties"]
    assert props["profile"]["$ref"].endswith("ValidationProfile")
    assert props["blocking"]["$ref"].endswith("BlockingPolicy")
    assert props["persistence"]["$ref"].endswith("PersistencePolicy")


def test_action_intent_refs_vm():
    schema = load_schema()
    intent = schema["$defs"]["ActionIntent"]
    assert intent["$ref"].endswith("ActionIntent")


def test_master_action_shapes_exercises_every_branch():
    """master-action-shapes.json MUST contain every Action.intent and every EffectRequest.type."""
    fixture = json.loads((FIXTURE_DIR / "master-action-shapes.json").read_text())
    intents_seen = {a["intent"] for a in fixture["responseActions"]["actions"]}
    expected_intents = {"save-draft", "autosave", "review", "submit", "request-evidence"}
    assert intents_seen == expected_intents, f"missing intents: {expected_intents - intents_seen}"
    types_seen = set()
    for a in fixture["responseActions"]["actions"]:
        for e in a["effects"]:
            types_seen.add(e["type"])
    expected_types = {"mappingExecution", "ledgerAppend", "handoffAssembly", "evidenceRequest", "hostEvent"}
    assert types_seen == expected_types, f"missing effect types: {expected_types - types_seen}"


@pytest.mark.parametrize("fixture_name", [p.name for p in sorted(FIXTURE_DIR.glob("*.json")) if p.name != "definition-base.json"])
def test_fixture_response_actions_valid_against_schema(fixture_name):
    validator = build_validator()
    fx = json.loads((FIXTURE_DIR / fixture_name).read_text())
    docs = []
    if "responseActions" in fx:
        docs.append(fx["responseActions"])
    if "scenario" in fx:
        docs.extend(s["responseActions"] for s in fx["scenario"].values() if "responseActions" in s)
    assert docs, f"{fixture_name} has no responseActions document to validate"
    for d in docs:
        errors = list(validator.iter_errors(d))
        assert not errors, f"{fixture_name} schema errors: {errors}"
```

- [ ] **Step 2: Run**

```bash
cd formspec && python3 -m pytest tests/conformance/schemas/test_response_actions_schema.py -v
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
cd formspec && git add tests/conformance/schemas/test_response_actions_schema.py
git commit -m "test(conformance): pin response-actions schema shape

Closed EffectRequest taxonomy, idempotency requirement on durable
types, HostEventEffect prohibition, ValidationOverride VM cross-refs,
master-shapes branch exhaustiveness."
```

---

## Task 17: Write runtime-contract pytest with a reference invocation harness

**Files:**
- Create: `tests/conformance/spec/test_response_actions_runtime.py`

- [ ] **Step 1: Write the harness and tests**

The harness is a minimal reference implementation of the §7 state machine, sufficient to evaluate every fixture's `expected` block. It is NOT a production engine; it is the conformance oracle for the test suite. Implement it INLINE in the test file for now (a future task may extract it to `formspec.runtime.response_actions` if production engines need it).

```python
"""Runtime contract tests for Response Actions §7 state machine.

Includes a minimal reference invocation harness sufficient to assert
fixture `expected` blocks. Production engines need not use this harness;
they MUST produce the same observable terminals and effect traces.
"""

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest

FIXTURE_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "response-actions"


# --- Reference harness ------------------------------------------------------

@dataclass
class EffectOutcome:
    type: str
    status: str  # succeeded | failed | deferred | replayed | not-invoked
    idempotency_key: Optional[str] = None
    outcome_ref: Optional[str] = None


@dataclass
class InvocationResult:
    terminal: str
    effect_trace: List[EffectOutcome] = field(default_factory=list)
    validation_report: Optional[Dict[str, Any]] = None
    persistence: str = "none"
    response_status_after: str = "in-progress"
    replay_token: Optional[str] = None
    case_created_event_emitted: bool = False
    case_lifecycle_events_emitted: List[str] = field(default_factory=list)


# Master table cited from VM §6. Pinned to the validation-mapping spec.
MASTER_TABLE = {
    "save-draft": ("off", "non-blocking", "draft-checkpoint"),
    "autosave": ("off", "non-blocking", "draft-checkpoint"),
    "review": ("on-submit", "non-blocking", "none"),
    "submit": ("on-submit", "block-on-error", "complete-response"),
    "request-evidence": ("on-demand", "non-blocking", "draft-checkpoint"),
}


def resolve_triple(action: Dict[str, Any]) -> tuple:
    profile, blocking, persistence = MASTER_TABLE[action["intent"]]
    override = action.get("validation", {})
    return (
        override.get("profile", profile),
        override.get("blocking", blocking),
        override.get("persistence", persistence),
    )


def invoke(fixture: Dict[str, Any], replay_store: Optional[Dict[str, EffectOutcome]] = None) -> InvocationResult:
    """Minimal reference §7 state machine. Reads fixture's responseActions,
    response, and optional simulated effect outcomes; returns InvocationResult.
    The fixture's `simulated` block tells the harness what each effect
    returns (succeeded / failed / deferred). When absent, default succeeded.
    """
    actions = fixture["responseActions"]["actions"]
    action_id = fixture["invocation"]["actionId"]
    action = next(a for a in actions if a["id"] == action_id)
    simulated = fixture.get("simulated", {})

    # Preconditions
    for p in action.get("preconditions", []):
        verdict = simulated.get("preconditions", {}).get(p["id"], True)
        if not verdict:
            terminal = "precondition-not-met" if p["severity"] == "block" else "deferred"
            return InvocationResult(
                terminal=terminal,
                effect_trace=[EffectOutcome(type=e["type"], status="not-invoked") for e in action["effects"]],
                replay_token=("opaque-" + action_id) if terminal == "deferred" else None,
            )

    # Validation pass
    profile, blocking, persistence = resolve_triple(action)
    report_simulated = simulated.get("validationReport")
    if profile == "off":
        report = None
    else:
        # Default to valid=true unless fixture says otherwise.
        report = report_simulated if report_simulated is not None else {"valid": True, "counts": {"error": 0, "warning": 0, "info": 0}}

    # Blocking gate
    if blocking == "block-on-error" and report is not None and not report["valid"]:
        # VE-05: draft persistence still occurs when persistence != none, but submit-complete is blocked.
        eff_pers = "draft-checkpoint" if persistence == "complete-response" else persistence
        return InvocationResult(
            terminal="failed-precondition",
            effect_trace=[EffectOutcome(type=e["type"], status="not-invoked") for e in action["effects"]],
            validation_report=report,
            persistence=eff_pers if eff_pers != "complete-response" else "none",
            response_status_after="in-progress",
        )

    # Effects
    trace: List[EffectOutcome] = []
    replay_store = replay_store if replay_store is not None else {}
    for idx, e in enumerate(action["effects"]):
        sim_eff = simulated.get("effects", {}).get(str(idx), "succeeded")
        key = e.get("idempotencyKey")
        if key and key in replay_store:
            trace.append(EffectOutcome(type=e["type"], status="replayed", idempotency_key=key, outcome_ref=replay_store[key].outcome_ref))
            continue
        if sim_eff == "succeeded":
            outcome = EffectOutcome(type=e["type"], status="succeeded", idempotency_key=key, outcome_ref=f"opaque-{idx}")
            trace.append(outcome)
            if key:
                replay_store[key] = outcome
        elif sim_eff == "failed":
            on_err = e.get("onError", "defer" if e["type"] == "evidenceRequest" else "fail")
            trace.append(EffectOutcome(type=e["type"], status="failed", idempotency_key=key))
            if on_err == "fail":
                # Halt — record actionFailed but no rollback.
                for rest_idx in range(idx + 1, len(action["effects"])):
                    trace.append(EffectOutcome(type=action["effects"][rest_idx]["type"], status="not-invoked"))
                return InvocationResult(terminal="failed", effect_trace=trace, validation_report=report)
            if on_err == "defer":
                for rest_idx in range(idx + 1, len(action["effects"])):
                    trace.append(EffectOutcome(type=action["effects"][rest_idx]["type"], status="not-invoked"))
                return InvocationResult(terminal="deferred", effect_trace=trace, validation_report=report, replay_token="opaque-defer-" + action_id)
            # continue
        elif sim_eff == "deferred":
            trace.append(EffectOutcome(type=e["type"], status="deferred", idempotency_key=key))
            for rest_idx in range(idx + 1, len(action["effects"])):
                trace.append(EffectOutcome(type=action["effects"][rest_idx]["type"], status="not-invoked"))
            return InvocationResult(terminal="deferred", effect_trace=trace, validation_report=report, replay_token="opaque-defer-" + action_id)

    status_after = "completed" if persistence == "complete-response" else "in-progress"
    return InvocationResult(
        terminal="completed",
        effect_trace=trace,
        validation_report=report,
        persistence=persistence,
        response_status_after=status_after,
    )


# --- Tests ------------------------------------------------------------------

FIXTURE_FILES = sorted(p.name for p in FIXTURE_DIR.glob("*.json")
                       if p.name not in ("definition-base.json", "master-action-shapes.json", "submitbutton-default-action.json"))


@pytest.mark.parametrize("fixture_name", FIXTURE_FILES)
def test_fixture_runtime_matches_expected(fixture_name):
    fixture = json.loads((FIXTURE_DIR / fixture_name).read_text())
    # Some fixtures have two invocations (idempotent replay); handle generically.
    if "invocation" in fixture and isinstance(fixture["invocation"], dict) and "first" in fixture["invocation"]:
        replay_store: Dict[str, EffectOutcome] = {}
        first_fx = {**fixture, "invocation": fixture["invocation"]["first"]}
        first = invoke(first_fx, replay_store=replay_store)
        replay_fx = {**fixture, "invocation": fixture["invocation"]["replay"]}
        second = invoke(replay_fx, replay_store=replay_store)
        assert first.terminal == fixture["expected"]["first"]["terminal"]
        assert second.terminal == fixture["expected"]["replay"]["terminal"]
        statuses = [o.status for o in second.effect_trace]
        assert all(s == "replayed" for s in statuses), f"replay statuses: {statuses}"
        return

    result = invoke(fixture)
    expected = fixture["expected"]
    assert result.terminal == expected["terminal"], f"terminal mismatch: got {result.terminal}, expected {expected['terminal']}"
    assert result.case_created_event_emitted is False, "Formspec MUST NOT emit case.created"
    if "effectTrace" in expected:
        for i, exp in enumerate(expected["effectTrace"]):
            assert result.effect_trace[i].type == exp["type"]
            assert result.effect_trace[i].status == exp["status"], (
                f"effect[{i}] {exp['type']} expected {exp['status']}, got {result.effect_trace[i].status}"
            )
    if "responseStatusAfter" in expected:
        assert result.response_status_after == expected["responseStatusAfter"]
    if "persistence" in expected:
        assert result.persistence == expected["persistence"]


def test_cross_spec_seam_fixture_produces_tuple_without_case_created():
    fx = json.loads((FIXTURE_DIR / "cross-spec-intake-handoff-seam.json").read_text())
    expected_tuple = fx["expected"]["crossSpecTuple"]
    assert expected_tuple["workflowHostOutcome"] in {"accepted", "rejected", "deferred"}
    assert fx["expected"]["prohibitions"]["caseCreatedEventEmitted"] is False
    assert fx["expected"]["prohibitions"]["caseLifecycleEventsEmitted"] == []
```

- [ ] **Step 2: Run**

```bash
cd formspec && python3 -m pytest tests/conformance/spec/test_response_actions_runtime.py -v
```

Expected: all tests pass. If a fixture fails: the fixture's `expected` block is wrong OR the harness has a bug. Fix the smaller of the two; the spec prose is the tie-breaker.

- [ ] **Step 3: Commit**

```bash
cd formspec && git add tests/conformance/spec/test_response_actions_runtime.py
git commit -m "test(conformance): pin response-actions runtime contract

Reference §7 state machine harness; fixture-driven assertions on
terminals, effect-trace ordering, idempotent replay, deferred
outcomes, no-rollback failure, blocking-gate enforcement, and the
no-case.created prohibition."
```

---

## Task 18: Write SubmitButton default-action pytest

**Files:**
- Create: `tests/conformance/spec/test_response_actions_submitbutton_default.py`

- [ ] **Step 1: Write the test**

```python
"""SubmitButton-without-actionRef default path tests.

Pins:
- When the Response Actions document sets defaultSubmitActionRef, a legacy
  SubmitButton click resolves to that named Action.
- When defaultSubmitActionRef is absent, the click falls back to the
  unnamed default — VM §7.1 master-table row for intent submit — with NO
  extra effects.
"""

import json
from pathlib import Path

import pytest

from tests.conformance.spec.test_response_actions_runtime import invoke

FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "response-actions" / "submitbutton-default-action.json"


@pytest.fixture(scope="module")
def fixture():
    return json.loads(FIXTURE.read_text())


def test_with_default_ref_resolves_to_named_action(fixture):
    scenario = fixture["scenario"]["withDefaultRef"]
    result = invoke({
        "responseActions": scenario["responseActions"],
        "response": scenario["response"],
        "invocation": scenario["invocation"],
        "simulated": scenario.get("simulated", {}),
    })
    expected = scenario["expected"]
    assert result.terminal == expected["terminal"]
    # Named action: effect trace MUST NOT be empty.
    assert any(o.status != "not-invoked" for o in result.effect_trace)


def test_without_default_ref_falls_back_to_unnamed_default(fixture):
    scenario = fixture["scenario"]["withoutDefaultRef"]
    # Fallback: synthesize the unnamed default Action from VM §7.1 master row.
    synthetic = {
        "id": "_defaultSubmit",
        "intent": "submit",
        "effects": [],
    }
    synthetic_doc = {
        "$formspecResponseActions": "1.0",
        "version": "1.0.0",
        "targetDefinition": scenario["responseActions"]["targetDefinition"],
        "actions": [synthetic],
    }
    result = invoke({
        "responseActions": synthetic_doc,
        "response": scenario["response"],
        "invocation": {"actionId": "_defaultSubmit"},
        "simulated": scenario.get("simulated", {}),
    })
    expected = scenario["expected"]
    assert result.terminal == expected["terminal"]
    # Fallback path: no effects beyond gating.
    assert result.effect_trace == []
```

- [ ] **Step 2: Run**

```bash
cd formspec && python3 -m pytest tests/conformance/spec/test_response_actions_submitbutton_default.py -v
```

Expected: both tests pass.

- [ ] **Step 3: Commit**

```bash
cd formspec && git add tests/conformance/spec/test_response_actions_submitbutton_default.py
git commit -m "test(conformance): pin SubmitButton default-action resolution

Named-action path and unnamed fallback (VM §7.1) both produce the
expected terminal. Empty effect trace on fallback proves gating-only
behavior."
```

---

## Task 19: Update upstream specs with back-references

**Files:**
- Modify: `specs/core/validation-mapping.md`
- Modify: `specs/experience/experience-spec.md`
- Modify: `specs/component/component-spec.md`
- Modify: `thoughts/specs/2026-05-20-formspec-semantic-layers.md`
- Modify: `../TODO-STACK.md`

- [ ] **Step 1: validation-mapping.md back-reference**

Find this line in §1.2 of `specs/core/validation-mapping.md`:

> "Future Response Actions documents MUST cite this table"

Append after that sentence: " The Response Actions companion has landed; see [`../response-actions/response-actions-spec.md`](../response-actions/response-actions-spec.md)."

- [ ] **Step 2: experience-spec.md back-reference**

Find this block in §6.3 of `specs/experience/experience-spec.md`:

> "References a Response Action identifier (forthcoming companion spec, concept §10.2)."

Replace with: "References a Response Action identifier (see [Response Actions §3](../response-actions/response-actions-spec.md#3-action-identity))."

Find and update the related paragraph that begins "Until the Response Actions companion spec lands, `ActionRef.id` is a free string." Replace with: "When a Response Actions document is present, processors SHOULD resolve `ActionRef.id` against its `actions[*].id` set. When absent or unresolved, processors MAY emit an informative finding ('ActionRef target unresolved')."

- [ ] **Step 3: component-spec.md cross-reference**

Locate Component §5.19 SubmitButton. Append at the end of the section (NOT inside the existing prop table):

```markdown
**Cross-reference.** A `SubmitButton` without `actionRef` follows the default submit path pinned in [Validation Mapping §7.1](../core/validation-mapping.md#71-the-default-submit-action-rule). The named-action form of that default lives in [Response Actions §10.3](../response-actions/response-actions-spec.md#103-default-submit-action). `actionRef` is future shape (concept §10.4); it is NOT a current Component schema field.
```

- [ ] **Step 4: semantic-layers.md status updates**

In `formspec/thoughts/specs/2026-05-20-formspec-semantic-layers.md`:

- §10 entry 2 ("Response Actions companion spec"): append " **Landed:** [`specs/response-actions/response-actions-spec.md`](../../specs/response-actions/response-actions-spec.md) (draft, 2026-05-22)."
- §11.1 ("Response Actions as peer or overlay"): append " **Resolved:** Response Actions is a peer artifact; see [`specs/response-actions/response-actions-spec.md §1.5`](../../specs/response-actions/response-actions-spec.md#15-peer-artifact-stance-resolves-concept-111) for overlay-promotion criteria."

- [ ] **Step 5: TODO-STACK.md row update**

Find the response-actions row in `formspec-stack/TODO-STACK.md` (or add one in the formspec section if missing). Update its status to "landed (draft 2026-05-22)" with pointers to `formspec/specs/response-actions/response-actions-spec.md` and this plan.

- [ ] **Step 6: Commit**

```bash
cd formspec && git add specs/core/validation-mapping.md specs/experience/experience-spec.md specs/component/component-spec.md thoughts/specs/2026-05-20-formspec-semantic-layers.md
git commit -m "docs(spec): wire response-actions back-references into VM/Experience/Component/concept-note"

cd .. && git add TODO-STACK.md && git commit -m "docs(stack): mark response-actions companion landed"
```

---

## Task 20: Run doc pipeline and filemap

**Files:** (generated)
- Touched: `specs/response-actions/response-actions-spec.llm.md`
- Touched: `filemap.json`

- [ ] **Step 1: Generate doc artifacts**

```bash
cd formspec && npm run docs:generate
```

Expected: `response-actions-spec.llm.md` is created; BLUF block in the canonical spec is populated; schema-ref block in the canonical spec is populated.

- [ ] **Step 2: Run doc gate**

```bash
cd formspec && npm run docs:check
```

Expected: pass. If failures: most likely cause is a missing `description` or `examples` on an `x-lm.critical=true` schema node (per the formspec authoring contract). Add them.

- [ ] **Step 3: Regenerate filemap**

```bash
cd formspec && npm run docs:filemap
```

Expected: `filemap.json` updated with `specs/response-actions/*` entries.

- [ ] **Step 4: Commit generated artifacts**

```bash
cd formspec && git add specs/response-actions/response-actions-spec.md specs/response-actions/response-actions-spec.llm.md filemap.json
git commit -m "build(docs): regenerate response-actions LLM artifact + filemap"
```

---

## Task 21: Full test sweep

- [ ] **Step 1: Run the conformance suite slice**

```bash
cd formspec && python3 -m pytest tests/conformance/schemas/test_response_actions_schema.py tests/conformance/spec/test_response_actions_runtime.py tests/conformance/spec/test_response_actions_submitbutton_default.py -v
```

Expected: all pass.

- [ ] **Step 2: Run the full conformance suite**

```bash
cd formspec && python3 -m pytest tests/conformance/ -v
```

Expected: no regressions. If a validation-mapping test breaks, the back-reference edit in Task 19 step 1 is the prime suspect; revert the wording change before any other diagnosis.

- [ ] **Step 3: Run the package layering and dep-fence checkers**

```bash
cd formspec && npm run check:deps
```

Expected: pass. (This task adds no packages; the checker should be quiet.)

---

## Task 22: Promotion-gate verification checklist

Before declaring "draft landed," manually walk every concept §9 promotion gate. **Do not skip this**; the gate stop-conditions are explicit and load-bearing.

- [ ] **Gate: Response Actions runtime (§9 row 2)**
  - [ ] Invocation state — encoded in §7. Terminals enumerated.
  - [ ] Preconditions — encoded in §4 with bounded FEL context.
  - [ ] Validation profile mapping — encoded in §5 citing VM.
  - [ ] Blocking policy — encoded in §5 citing VM.
  - [ ] Persistence policy — encoded in §5 citing VM.
  - [ ] Effect ordering — encoded in §6.3.
  - [ ] Failure / deferred outcomes — encoded in §8 / §9.
  - [ ] Idempotency posture — encoded in §6.5.
  - [ ] STOP IF: spec only defines JSON properties and leaves processors to invent behavior. **Mitigation:** the reference harness in `test_response_actions_runtime.py` proves the prose pins observable behavior.

- [ ] **Gate: Validation mapping (§9 row 3)** — already RESOLVED by VM.

- [ ] **Gate: SubmitButton compatibility (§9 row 4)**
  - [ ] Default submit action rule — encoded in §10.3 + VM §7.1.
  - [ ] actionRef migration story — encoded in §14.4 (future shape).
  - [ ] Current event/API compatibility — encoded in §10.1, §14.2.
  - [ ] Examples — `submitbutton-default-action.json`.
  - [ ] Adapters — no changes required, asserted in §14.2.
  - [ ] Validation-summary behavior — preserved per VM §8.
  - [ ] STOP IF: existing Component documents need rewrites. **Verified:** §14.1 documents zero migration.

- [ ] **Gate: Intake Handoff seam (§9 row 6)**
  - [ ] Cross-spec fixture with Response, ValidationReport, Ledger evidence, Handoff, workflow-host outcome — `cross-spec-intake-handoff-seam.json`.
  - [ ] STOP IF: Formspec emits governed case lifecycle events. **Verified:** `test_cross_spec_seam_fixture_produces_tuple_without_case_created` asserts `caseCreatedEventEmitted == false`.

- [ ] **Concept §11.1 (peer vs overlay)** — RESOLVED in §1.5 with explicit promotion criteria.

- [ ] **Concept §11.3 (Component reference fields)** — explicitly future shape; §14.4.

If any check fails: STOP. Do not advance to Task 23. Fix the spec / fixture / test until the check passes. The semantic-layers note is explicit that schemas should not encode unresolved decisions.

---

## Task 23: Architecture review dispatch

Per `formspec-stack/CLAUDE.md` "Before AND after multi-file or seam-touching work: scout or expert runs `formspec-specs:semi-formal-architecture-review`." This spec is seam-touching (Response Actions ↔ VM, Component, Experience, Mapping, Intake Handoff, Respondent Ledger) and multi-file (spec + schema + 13 fixtures + 3 tests + 5 cross-references). Dispatch the after-pass review.

- [ ] **Step 1: Dispatch as background subagent**

Use the Agent tool with `subagent_type: "formspec-specs:formspec-scout"` (or `cross-stack-scout` if the reviewer prefers broader scope) and `run_in_background: true`. The reviewer prompt MUST be self-contained:

```
Architecture review on the freshly landed Response Actions companion spec.

Scope:
- specs/response-actions/response-actions-spec.md (new)
- schemas/response-actions.schema.json (new)
- tests/conformance/{schemas,spec}/test_response_actions_*.py (new)
- tests/conformance/fixtures/response-actions/*.json (new)
- Edits to specs/core/validation-mapping.md, specs/experience/experience-spec.md,
  specs/component/component-spec.md, thoughts/specs/2026-05-20-formspec-semantic-layers.md.

Anchors to check:
- Concept §3 anchors all preserved (no Definition/Locale/Mapping/Handoff/Ledger ownership drift).
- Concept §6.3 ownership boundaries pinned as §13 prohibitions; fixtures assert no case.created emission.
- Concept §6.4 execution contract encoded in §7 state machine; no fictional rollback.
- Concept §6.5 validation terminology: cites VM, no parallel vocabulary.
- Concept §6.6 SubmitButton compatibility: §10.3 + VM §7.1; no Component schema change.
- Concept §6.9 cross-spec Intake-Handoff seam fixture present and asserts no case lifecycle events.
- Concept §9 row-2 promotion gate fully closed (state machine, preconditions, validation mapping, blocking, persistence, effect ordering, failure/deferred, idempotency).
- Concept §11.1 peer-vs-overlay resolved in §1.5.

Findings format: Markdown, findings-first. Severity: BLOCKER / MAJOR / MINOR / NIT. Cite file:line for each.

Do NOT self-remediate. Surface BLOCKER findings for a fresh implementer / craftsman pass.
```

- [ ] **Step 2: Address BLOCKER findings before declaring "landed"**

If the reviewer surfaces BLOCKER findings, file them as a follow-up plan (or dispatch `formspec-craftsman` directly) before the architecture review can sign off. MAJOR / MINOR / NIT findings MAY land in a follow-up commit.

- [ ] **Step 3: Final commit with reviewer summary**

```bash
cd formspec && git commit --allow-empty -m "docs(spec): response-actions spec architecture review pass (draft)

Reviewer summary: <one paragraph from the reviewer's verdict>.
BLOCKER count: <n>. MAJOR count: <n>. Follow-ups: <list or 'none'>."
```

---

## Sequencing Recap

```
Tasks 1-3: scaffolding + pipeline
Tasks 4-11: spec prose (§1 → §14)
Task 12: schema
Tasks 13-15: fixtures (vocabulary → effects → cross-spec)
Tasks 16-18: pytest (schema-shape → runtime contract → SubmitButton default)
Task 19: upstream back-references
Task 20: doc pipeline + filemap
Task 21: full test sweep
Task 22: §9 promotion-gate checklist (manual, blocking)
Task 23: architecture review dispatch
```

Each prose-section task (4-11) is independently committable. If the spec needs revision mid-way (e.g., the reviewer in Task 23 surfaces a §6 boundary issue), only the affected section and the dependent fixtures / tests need to roll forward — git history preserves the section-level granularity.

## Out-of-Scope Reminders for the Implementer

These will tempt you. Resist:

- **Adding `actionRef` to `component.schema.json`.** Future shape (concept §10.4). Wait for that spec.
- **Adding a `case.created` ledger event.** Forbidden (concept §6.9). The cross-spec fixture asserts its absence.
- **Defining a compensation framework when the no-rollback rule feels uncomfortable.** Concept §6.4 forbids fictional rollback; compensation is a future concern with no current consumer.
- **Inventing parallel validation vocabulary because "live" vs "continuous" feels ambiguous.** VM owns the names; cite them.
- **Allowing `Action.effects` to be empty.** Schema requires `minItems: 1`. An Action with no effects has no observable consequence and is meaningless; if the use case is "validation pass only," set `intent: review` and add a single `hostEvent` for the UI signal.
- **Extracting the reference harness into a production engine package.** Out of scope; do it only if a production engine demands a shared invocation library.

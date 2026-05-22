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
  - thoughts/plans/2026-05-22-respondent-ledger-action-events.md
  - thoughts/plans/2026-05-22-formengine-validation-profile-adapter.md
  - thoughts/plans/2026-05-22-validation-mapping-schema-predicate.md
  - thoughts/plans/2026-05-22-component-action-references.md
  - ../../fel-core/thoughts/plans/2026-05-22-fel-host-context-bindings.md
---

# Response Actions Companion Spec Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Plan-E landed verification

To verify Plan E has landed, downstream plans (Response Actions consumer, Component Reference Fields follow-up) MUST use this grep template in their Task 0 precondition check:

```bash
cd <formspec-stack>/formspec && \
  grep -q '"ActionButton"' schemas/component.schema.json && \
  ! grep -q "## 7\. SubmitButton Compatibility" specs/core/validation-mapping.md && \
  ! grep -qE "SubmitButton.*mode|emitEvent" schemas/component.schema.json && \
  echo "Plan E: OK"
```

The grep checks three landed signals: (1) ActionButton renamed in schema, (2) VM §7 SubmitButton Compatibility section deleted, (3) legacy `mode`/`emitEvent` props removed from the schema.

## Precondition plans (MUST land before Task 1 here)

Five preconditions. Each is small, lives in the correct owner spec, and delivers cross-spec value beyond Response Actions:

1. **[Ledger action events](2026-05-22-respondent-ledger-action-events.md)** — publishes optional `action.invoked` / `action.failed` / `action.deferred` / `action.replayed` event kinds in Respondent Ledger §8.5. Without this, Response Actions fixtures would invent ledger taxonomy in violation of the §13 prohibitions.
2. **[FEL host-context bindings](../../fel-core/thoughts/plans/2026-05-22-fel-host-context-bindings.md)** — adds FEL §6.3 protocol for host specs to declare `@name` context variables. Response Actions §4.2 cites this protocol; FEL evaluator gains a `ContextBindingCatalog` DI port.
3. **[FormEngine ValidationProfile refactor](2026-05-22-formengine-validation-profile-adapter.md)** — replaces `getValidationReport({ mode })` with `getValidationReport({ profile })`. Breaking change, no backwards-compat shim. Response Actions §5.3 cites the resulting API.
4. **[VM schema predicate refactor](2026-05-22-validation-mapping-schema-predicate.md)** — extracts the §6.3 validity predicate into `$defs/ValidationTuple` so Response Actions `ValidationOverride` `$ref`s it and inherits the predicate at schema-validate time.
5. **[Component Action References](2026-05-22-component-action-references.md)** — pulls concept §10.4 forward. Renames `SubmitButton` → `ActionButton`; `actionRef` required; drops legacy `mode` and `emitEvent` props; deletes VM §7 (SubmitButton Compatibility) entirely. After this lands, every action-triggering widget MUST point at a named Action — no implicit defaults, no legacy carve-outs.

Implementer MUST verify all five are merged on the parent before executing Task 1.

**Goal:** Land a normative **Response Actions** companion under `specs/response-actions/` — prose, schema, fixtures, pytest — that defines action identity, FEL precondition context (citing FEL §6.3), validation trigger mapping (cites [`specs/core/validation-mapping.md`](../../specs/core/validation-mapping.md)), an ordered effect taxonomy with idempotency posture, invocation state machine with terminal `blocked` / `failed` / `deferred` / `completed`, host event boundaries, and cross-artifact references to Mapping / Intake Handoff / Respondent Ledger. Closes the §9 row-2 promotion gate ("Response Actions runtime") and concept §10.2 of [`../specs/2026-05-20-formspec-semantic-layers.md`](../specs/2026-05-20-formspec-semantic-layers.md). Resolves concept §11.1 by taking the peer-artifact stance with explicit overlay-promotion criteria. Composes with the [Component Action References plan](2026-05-22-component-action-references.md) — every action-triggering widget points at a named Action via `actionRef`; no legacy SubmitButton fallthrough exists.

**Architecture:** New normative document at `specs/response-actions/response-actions-spec.md` (parallels the Experience companion's directory shape). New schema at `schemas/response-actions.schema.json` defining `Action`, `Precondition` (FEL expression with host-binding catalog declared per FEL §6.3), `EffectRequest` (closed `type` taxonomy via `const`-on-`type` + `oneOf`: `mappingExecution`, `ledgerAppend`, `handoffAssembly`, `evidenceRequest`, `hostEvent`), `IdempotencyKey` (FEL expression evaluated once at first attempt, frozen for retries), and a `ValidationOverride` shape that `$ref`s `https://formspec.org/schemas/validationMapping/1.0#/$defs/ValidationTuple` (predicate inherited from VM). Additive to specs that own their own structural truth (Definition, Response, ValidationReport, Mapping, Intake Handoff, Locale, Theme). Composes with structural changes landing in precondition plans: Ledger gains `action.*` event kinds (Plan A); Component gains `ActionButton` with required `actionRef` (Plan E, deleting legacy `SubmitButton.mode` / `emitEvent` and VM §7). `Action.intent` allows both the closed VM `ActionIntent` enum AND `x-` extension intents per VM §6.1. `Action.onFailure` / `Action.onDeferred` are closed. Concept-note ownership boundaries (§6.3) are pinned as Conformance Prohibitions. Action invocation is triggered by an `ActionButton` widget (Component §5.19) or by a host application binding; the legacy "SubmitButton fallthrough" rule no longer exists.

**Tech Stack:** Markdown (W3C-style, BCP-14), JSON Schema 2020-12, `npm run docs:generate` / `docs:check` pipeline (`generate-spec-artifacts.mjs`), Python pytest under `tests/conformance/`.

**Sequencing:** prose contract first → schema encodes the closed taxonomies, the Action shape, the EffectRequest discriminated union, and the state-machine observable points (predicate inherited from VM via `$ref`) → fixtures pin the required §6.5 vocabulary cases + §6.9 cross-spec Intake-Handoff seam + concept §6.4 effect-ordering and failure/deferred cases (event kinds from the Ledger taxonomy) → pytest pins the table. Per [concept §10 closing line](../specs/2026-05-20-formspec-semantic-layers.md#10-follow-on-spec-order), the schema MUST NOT hide unresolved prose decisions — the §11.1 peer-vs-overlay stance is resolved *in this spec*, not deferred to schema interpretation.

**Citations** in this plan refer to the concept note (`thoughts/specs/2026-05-20-formspec-semantic-layers.md`) unless prefixed with another spec name. Concept references like "§6.4" mean concept-note §6.4. Validation-mapping references are prefixed `VM §`. Experience-spec references are prefixed `EXP §`. FEL grammar references are prefixed `FEL §`. Ledger references are prefixed `Ledger §`.

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
| `tests/conformance/fixtures/response-actions/definition-base.json` | Shared Definition. One required item; one warning shape (continuous timing); one error shape (continuous timing); one submit-timing error shape; one demand-timing error shape. **Identical to the validation-mapping fixture** to permit cross-suite reuse and pin behavioral parity. |
| `tests/conformance/fixtures/response-actions/intent-save-draft.json` | Invalid Response, intent `save-draft`. Action with effects `[ledgerAppend(draft.saved), ledgerAppend(action.invoked)]` — two separate `ledgerAppend` effects with different eventKinds. Expects: terminal `completed`, persistence `draft-checkpoint`, status remains `in-progress`, no ValidationReport produced (profile `off`), ledger-event-requests issued with the named kinds. |
| `tests/conformance/fixtures/response-actions/intent-submit-blocked.json` | Same invalid Response, intent `submit`, action with effects `[mappingExecution, handoffAssembly, ledgerAppend(response.submit-attempted), hostEvent]`. Expects: terminal `blocked` with `cause: "validation"`, validation halts at the blocking gate (VM §4.1), **zero effects invoked**, status remains `in-progress`, persistence `none` (Response data unchanged; existing draft state untouched). |
| `tests/conformance/fixtures/response-actions/intent-warning-only-submit.json` | Response failing only the warning shape, intent `submit`, same effect chain as above. Expects: terminal `completed`, ValidationReport `valid: true` with `counts.warning >= 1`, all four effects invoked in declared order, status `completed`. |
| `tests/conformance/fixtures/response-actions/intent-request-evidence-demand.json` | Valid field data, intent `request-evidence`, action with effects `[evidenceRequest, ledgerAppend(draft.saved)]`. Expects: profile `on-demand` (only demand-timing shape fires), the demand shape fails, blocking `non-blocking` (per VM master row), effects invoked, terminal `completed`. |
| `tests/conformance/fixtures/response-actions/intent-disabled-no-validation.json` | Same invalid Response, intent `autosave`, action with effects `[ledgerAppend(draft.saved)]`. Expects: profile `off`, no ValidationReport produced, ledgerAppend invoked, persistence `draft-checkpoint`, status `in-progress`. |
| `tests/conformance/fixtures/response-actions/effect-ordering.json` | Submit-intent action with effects in non-trivial order: `[mappingExecution, ledgerAppend(response.submit-attempted), handoffAssembly, ledgerAppend(response.completed), hostEvent(formspec-submit)]`. Expects effect trace recorded in exactly that order; `hostEvent` is transient (non-durable) and carries no idempotency key. |
| `tests/conformance/fixtures/response-actions/effect-failure-no-rollback.json` | Submit-intent action where `handoffAssembly` fails. Expects: terminal `failed`, prior `mappingExecution` and `ledgerAppend(response.submit-attempted)` remain in the effect trace (NOT rolled back; concept §6.4), trailing effects `not-invoked`, `hostEvent` NOT emitted, UI must not report success. Per Ledger §8.5, an `action.failed` event MAY be emitted by the processor at its discretion — the fixture does NOT pin that observable because it is processor-policy, not protocol behavior. |
| `tests/conformance/fixtures/response-actions/effect-deferred-evidence.json` | Submit-intent action whose `evidenceRequest` returns deferred. Expects: terminal `deferred`, partial effect trace recorded, `ledgerAppend(action.deferred)` recorded, replay key issued, Response status remains `in-progress`, no `handoffAssembly` invoked yet. |
| `tests/conformance/fixtures/response-actions/effect-idempotent-replay.json` | Submit-intent action invoked twice with identical `invocation.id`. Expects: second invocation observes prior effect outcomes via the replay contract; no duplicate `ledgerAppend`, no duplicate `handoffAssembly`; observable terminal on the second invocation is `completed` with all effects marked `replayed`. Fixture's `responseActions` MUST declare a `ledgerAppend(action.replayed)` effect in the Action's effect chain — Ledger events are caller-declared, never harness-implicit (Ledger §8.5). |
| `tests/conformance/fixtures/response-actions/precondition-fails-blocked.json` | Action whose `precondition` (FEL expression) evaluates `false` with `severity: block`. Expects: terminal `blocked` with `cause: "precondition"`, **no validation pass run**, **zero effects invoked**, `ledgerAppend(action.failed)` MAY be emitted at processor discretion. |
| `tests/conformance/fixtures/response-actions/cross-spec-intake-handoff-seam.json` | The required §6.9 cross-spec fixture. Submit-intent action with effects `[mappingExecution, ledgerAppend(response.submit-attempted), handoffAssembly, ledgerAppend(response.completed)]`. Expects: a Response snapshot, a ValidationReport snapshot, a Respondent Ledger boundary event (or head reference), an Intake Handoff document (content-addressable outcome handle), AND a workflow-host outcome of one of `accepted` / `rejected` / `deferred` recorded *outside* this spec's responsibility. **MUST NOT include a Formspec-authored `case.created` event** (per concept §6.9). |
| `tests/conformance/fixtures/response-actions/master-action-shapes.json` | Canonical Action document covering every `Action.intent` value (`save-draft`, `autosave`, `review`, `submit`, `request-evidence`) and every `EffectRequest.type` branch (`mappingExecution`, `ledgerAppend`, `handoffAssembly`, `evidenceRequest`, `hostEvent`). Single source of truth for fixture-cross-reference. |

### Modified

| Path | Why |
|---|---|
| `specs/core/validation-mapping.md` | Append a §1.2 forward-link from "Future Response Actions documents MUST cite this table" to the now-landed Response Actions spec. **One-paragraph append.** Existing §6 master table unchanged. (VM §7 is deleted by Plan E; not by this plan.) |
| `specs/experience/experience-spec.md` | Update EXP §6.3 `ActionRef` to drop the "forthcoming companion spec" carve-out. Resolution contract is added by Plan E (mandatory resolution against Response Actions document; no free-string fallback); this plan's only EXP edit is the front-matter reference list addition. |
| `specs/component/component-spec.md` | No edit by this plan. Component §5.19 is rewritten as `ActionButton` by Plan E (precondition); this plan consumes that result and does NOT add further cross-references — `ActionButton` already documents its `actionRef` resolution against this spec. |
| `thoughts/specs/2026-05-20-formspec-semantic-layers.md` | Mark §10.2 landed (Landed: link); mark §11.1 resolved in this spec (with link to §1.5 of new spec). **Two-line edits.** |
| `scripts/spec-artifacts.config.json` | Add the Response Actions spec/schema/BLUF/LLM row so `npm run docs:generate` materializes `response-actions-spec.llm.md`. |
| `filemap.json` | Regenerated by `npm run docs:filemap`. **Generated — never hand-edit.** |
| `../TODO-STACK.md` | Update the response-actions row to "landed (draft)" with a pointer to this plan and the new spec. **One-line edit.** |

### Explicitly NOT in scope

- **Component schema changes.** Plan E (precondition) rewrites Component §5.19 as `ActionButton` with required `actionRef`. This plan does not modify Component beyond that.
- **`defaultSubmitActionRef` on the Response Actions document.** Considered and rejected. Action invocation is bound exclusively via `ActionButton.actionRef`; no document-level default field exists.
- **Regeneration merge / Studio review fixtures** — concept §10.5, separate plan.
- **Trace query/cache spec** — concept §10.6, separate plan.
- **Modifications to existing schemas beyond the preconditioned-plan changes** (`definition.schema.json`, `response.schema.json`, `validation-report.schema.json`, `mapping.schema.json`, `intake-handoff.schema.json`, `respondent-ledger.schema.json`, `component.schema.json`, `experience.schema.json`). `respondent-ledger-event.schema.json` and `validation-mapping.schema.json` are modified by precondition plans A and D respectively; this plan consumes their outputs. Additive invariant per concept §5.1.
- **Definition `actions` block.** Definition stays the executable form model (concept §6.1). Actions live in a sidecar, not in Definition.
- **New validation vocabulary.** Response Actions cites VM §3–§6; it does NOT introduce a parallel set of profile/blocking/persistence names (concept §6.5).
- **New ledger event kinds invented in this spec.** All `eventKind` values cited in fixtures come from the Ledger taxonomy (Ledger spec §8 + the §8.5 action kinds added by precondition plan A).
- **New top-level FEL identifiers.** Host context bindings flow through FEL §6.3 `ContextBindingCatalog` using existing `@name` grammar; this spec declares its catalog and cites FEL §6.3.
- **WOS-side acceptance, governed case identity, case lifecycle events** (concept §6.3 explicit non-ownership). The cross-spec fixture asserts a handoff was assembled and acknowledged; it does not author the host outcome.
- **`case.created` events emitted by Formspec.** Explicitly forbidden by concept §6.9.
- **Effect rollback / global transaction semantics.** Concept §6.4 forbids fictional rollback; this spec does not introduce a compensation framework. Compensation effects MAY appear in a future spec keyed off a real consumer need.
- **Cross-processor replay-token interop.** `replayTokenRef` is opaque per Ledger §8.5; the wire contract is processor-defined. If cross-processor interop becomes a real need, file a follow-up.
- **Bundle manifest** (concept §11.5). Separate concern.
- **Trace generation** even though Response Actions invocations naturally produce traceable lineage. Trace lives in the §10.6 spec; this spec emits the ledger events Trace can read.

---

## Self-Review Note

**Concept-note coverage:**

- §3 anchors (Definition ownership, ValidationReport `valid`, severity, Core global modes, per-shape timing, Response status, ActionButton binding via `actionRef`, ValidationSummary current behavior, Locale, Mapping, Intake Handoff, Respondent Ledger, Trace) — preserved. Response Actions does not move any executable behavior out of Definition; does not redefine ValidationReport severity; does not invent a parallel mode/timing vocabulary; does not modify Locale strings; does not inline Mapping rules; does not own Intake Handoff body shape; does not own Respondent Ledger event semantics; does not generate Trace. ActionButton is owned by Component (post-Plan-E); this spec describes what an Action does when invoked, not how the widget renders.
- §6.3 ownership boundaries — pinned as §13 Conformance Prohibitions in the new spec; covered by `test_response_actions_runtime.py` fixture audits (prohibition assertions on `case.created` absence, on no Mapping body inlining, on every fixture `eventKind` belonging to the Ledger schema enum).
- §6.4 execution contract — encoded as §7 Invocation State Machine; covered by `effect-ordering.json`, `effect-failure-no-rollback.json`, `effect-deferred-evidence.json`, `precondition-fails-blocked.json`.
- §6.5 validation terminology axes — fixtures: `intent-save-draft.json`, `intent-submit-blocked.json`, `intent-warning-only-submit.json`, `intent-request-evidence-demand.json`, `intent-disabled-no-validation.json`. All five required cases covered.
- §6.6 SubmitButton compatibility — N/A post-refactor. The Component Action References precondition plan replaces `SubmitButton` with `ActionButton` (required `actionRef`); VM §7 (SubmitButton Compatibility) is deleted. There is no legacy fallthrough path to verify — every action-triggering widget MUST resolve through Response Actions.
- §6.9 cross-spec Intake Handoff seam — `cross-spec-intake-handoff-seam.json` produces the required (Response, ValidationReport, Ledger evidence, Intake Handoff, workflow-host outcome) tuple without authoring a `case.created` event. Outcome handles are content-addressable per §11.2.
- §9 row 2 "Response Actions runtime" promotion gate — full coverage: invocation state machine (§7) with terminals `completed` / `failed` / `deferred` / `blocked` (single blocked state with `cause` discriminator), preconditions (§4) with bindings declared per FEL §6.3, validation profile mapping (§5 citing VM), blocking policy (§5 citing VM), persistence policy (§5 citing VM §5.2), effect ordering (§6.2), failure/deferred outcomes (§8 and §9), idempotency posture (§6.5) with key frozen at first attempt. The §9 stop condition ("spec only defines JSON properties and leaves processors to invent behavior") is avoided by the fixture-pinned reference invocation harness in `tests/conformance/spec/test_response_actions_runtime.py`.
- §9 row 4 "SubmitButton compatibility" — **closed via Plan E**. Component §5.19 is rewritten as `ActionButton` with required `actionRef`; VM §7 is deleted. There is no longer a SubmitButton compatibility surface; every action-triggering widget binds to a named Action.
- §9 row 6 "Intake Handoff seam" — closed by `cross-spec-intake-handoff-seam.json`.
- §11.1 peer-vs-overlay open question — RESOLVED in §1.5 with explicit criteria for future overlay promotion (if Response Actions begins requiring suppression / override / alteration of Definition semantics, the architecture moves to overlay; until then it is a peer artifact).
- §11.3 Component reference fields — explicitly future shape; not introduced.
- §11.5 bundle manifest — out of scope; cross-referenced as a follow-on concern.

**Out-of-scope confirmation:** no schema changes to existing files; no engine API changes; no Component widget changes; no Response lifecycle additions; no new ledger event kinds (the spec REQUESTS ledger events; Respondent Ledger spec owns the taxonomy).

**Author-vs-generated discipline:** Response Actions is an authored source artifact (concept §5.4). Action documents are not generated from Definition by this spec. A separate authoring helper may seed minimum-bundle defaults (concept §8) in the future; that is a Studio concern.

---

## Task 0: Verify precondition plans have landed + pre-implementation architecture review

Per `formspec-stack/CLAUDE.md` "Before AND after multi-file or seam-touching work: scout or expert runs `formspec-specs:semi-formal-architecture-review`." This plan touches multiple seams (Response Actions ↔ VM, Component, Experience, Mapping, Intake Handoff, Respondent Ledger, FEL, FormEngine). The "after" pass lives in Task 23; this Task 0 is the "before" pass.

- [ ] **Step 1: Verify precondition plans have landed**

The five coupled plans listed at the top of this document MUST be merged before Task 1 begins. Verify by spot-checking key surface area (the Plan E check uses the canonical three-signal template from §"Plan-E landed verification" above):

```bash
cd formspec && grep -q "action.invoked" schemas/respondent-ledger-event.schema.json && echo "Plan A: OK"
cd ../fel-core && grep -q "Host-Supplied Context Bindings" specs/fel/fel-grammar.md && echo "Plan B: OK"
cd ../formspec && grep -q "ValidationProfileResolver" packages/formspec-engine/src/validation/profile-resolver.ts && echo "Plan C: OK"
cd formspec && grep -q "ValidationTuple" schemas/validation-mapping.schema.json && echo "Plan D: OK"
cd ../formspec && \
  grep -q '"ActionButton"' schemas/component.schema.json && \
  ! grep -q "## 7\. SubmitButton Compatibility" specs/core/validation-mapping.md && \
  ! grep -qE "SubmitButton.*mode|emitEvent" schemas/component.schema.json && \
  echo "Plan E: OK"
cd ../formspec && grep -q "NOT (blocking = block-on-error AND persistence != complete-response)" specs/core/validation-mapping.md && echo "VM §6.3 fourth clause: OK"
```

Expected: five `OK` lines plus the VM §6.3 fourth clause check. If any are missing, STOP — that precondition plan needs to land first.

- [ ] **Step 2: Pre-implementation review dispatch**

Use the Agent tool with `subagent_type: "formspec-specs:formspec-scout"` (or `cross-stack-scout` for broader scope) and `run_in_background: true`. Prompt MUST be self-contained:

```
Pre-implementation architecture review on this Response Actions spec plan
(formspec/thoughts/plans/2026-05-22-response-actions-spec.md). The four
coupled-plan preconditions are landed; this review is the "before pass"
per formspec-stack/CLAUDE.md.

Check:
- Inverted framing — does any section silently re-open a doc the prohibitions close?
- Sibling spec conflicts — does the spec text agree with VM, EXP, Component, Mapping, Intake Handoff, Ledger as they exist post-precondition-plans?
- Authority ladder inversions — does anything assert behavior the spec doesn't own?
- Cold-read test — would a future agent reading this plan alone produce a conformant Response Actions implementation?

Findings format: BLOCKER / MAJOR / MINOR / NIT with file:line citations.
Do NOT self-remediate; surface findings only.
```

- [ ] **Step 3: Address BLOCKER findings before proceeding to Task 1**

If the reviewer surfaces BLOCKER findings, treat them as plan-revision work. Update this plan; re-run Step 2. Loop until zero BLOCKERs. MAJOR/MINOR/NIT findings MAY be addressed during Task 1+ execution or in the Task 23 after-pass.

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

- Sidecar document binding ordered, typed effects to named action intents (VM `ActionIntent` plus `x-` extensions); FEL preconditions guard each action.
- Invocation traverses §7 state machine: preconditions → validation per VM profile → blocking gate → ordered effects → terminal `completed` / `failed` / `deferred` / `blocked`.
- Durable effects MUST carry an idempotency key frozen at first attempt; the key MUST NOT read prior effect outcomes. Replays observe outcomes without duplicating side effects.
- Peer artifact, not overlay: MUST NOT modify Definition, inline Mapping, redefine Ledger event semantics, or author `case.created`. Overlay-promotion criteria in §1.5.
- Action invocation is bound by `ActionButton.actionRef` (Component §5.19, post-Plan-E). No legacy SubmitButton path; no `defaultSubmitActionRef` field.
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add specs/response-actions/response-actions-spec.bluf.md
git commit -m "feat(spec): draft response-actions BLUF (5 falsifiable bullets)"
```

---

## Task 3: Wire spec into doc pipeline + contract surface coverage

> **Sequencing note:** This task modifies `scripts/spec-artifacts.config.json` to reference `schemas/response-actions.schema.json`, which Task 12 creates. The config row is harmless as long as `npm run docs:generate` is NOT invoked between Task 3 and Task 12. The first generate happens in Task 20. Implementers MAY defer this task to immediately before Task 20 if they prefer never to have a config row pointing at a missing artifact mid-rebase; the order shown here keeps related pipeline changes adjacent for git-history clarity.

**Files (also modified in this task):**
- Modify: `tests/contracts/surface-coverage.json`

A test under `tests/unit/test_contract_surface_coverage.py` enforces that **every** spec/schema pair configured in `scripts/spec-artifacts.config.json` has a corresponding row in `tests/contracts/surface-coverage.json`. Without the row, `pytest tests/unit/test_contract_surface_coverage.py` fails — and that test runs as part of `npm run docs:check`. **Both files must be updated in the same commit.**

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
    "Invocation MUST follow the §7 state machine: preconditions → validation per VM profile → blocking gate → ordered effect execution → terminal completed | failed | deferred | blocked (with blockedCause discriminator per §7.1). Effects MUST execute in declared order.",
    "Durable effect types (mappingExecution, ledgerAppend, handoffAssembly, evidenceRequest) MUST carry an idempotencyKey evaluated at invocation; replay with identical keys MUST observe prior effect outcomes without duplicating side effects.",
    "Blocking validation failure stops effect execution before any effect is invoked. UI MUST NOT report success when a declared effect failed; the failed-effect case MAY append an `action.failed` ledger event (caller-declared via a `ledgerAppend` effect per Ledger §8.5; processor-discretionary) and does NOT roll back prior effects (concept §6.4).",
    "Action invocation is bound by ActionButton.actionRef (Component §5.19, owned by Plan E). The Action's resolved (profile, blocking, persistence) triple comes from VM §6 master row for the Action's intent, with optional ValidationOverride per VM §6.3."
  ],
  "conformanceEssentials": [
    "A conforming Response Actions document must include $formspecResponseActions=1.0, version, targetDefinition, and at least one action.",
    "Action.intent values are drawn from the closed VM ActionIntent enum OR an x-prefixed publisher extension per VM §6.1. Action.effects[*].type MUST be drawn from the closed EffectRequest taxonomy. Action.onFailure and Action.onDeferred MUST be drawn from closed enums.",
    "Processors MUST reject Response Actions documents that author Respondent Ledger event semantics, inline Mapping body rules, or include a case.created event."
  ]
}
```

- [ ] **Step 2: Add the contract surface coverage row**

Add an entry to `tests/contracts/surface-coverage.json` under `contracts.responseActions` (match the shape of existing rows like `mapping` or `validationMapping`):

```json
"responseActions": {
  "status": "enforced",
  "spec": "specs/response-actions/response-actions-spec.md",
  "schema": "schemas/response-actions.schema.json",
  "conformance": [
    "tests/conformance/schemas/test_response_actions_schema.py",
    "tests/conformance/spec/test_response_actions_runtime.py",
  ],
  "crates": [],
  "packages": {},
  "checks": [
    "Schema shape pinned (closed EffectRequest taxonomy, idempotency on durable effects, ValidationOverride $refs ValidationTuple)",
    "Runtime contract pinned via reference §7 state-machine harness (terminals, ordering, idempotent replay, no-rollback, blocking gate)",
    "ActionButton.actionRef resolves against actions[*].id; unresolved refs produce inert widget + informative finding (Component §5.19 + Plan E)",
    "Cross-spec Intake Handoff seam produces the required tuple without a Formspec-authored case.created event"
  ]
}
```

`crates` is `[]` because this spec ships no Rust crate (the §5 validation pipeline runs through the existing engine via the FormEngine ValidationProfile adapter port; no new crate). `packages` is `{}` for the same reason; the engine, webcomponent, etc., do not gain Response-Actions-specific code yet — that lands when a renderer consumes Actions (concept §10.4 and beyond).

- [ ] **Step 3: Validate both configs parse + contract pytest passes**

```bash
cd formspec && \
  node -e "JSON.parse(require('fs').readFileSync('scripts/spec-artifacts.config.json'))" && \
  node -e "JSON.parse(require('fs').readFileSync('tests/contracts/surface-coverage.json'))" && \
  python3 -m pytest tests/unit/test_contract_surface_coverage.py -v
```

Expected: pytest passes (no spec-artifacts row lacks a surface-coverage row).

- [ ] **Step 4: Commit**

```bash
cd formspec && git add scripts/spec-artifacts.config.json tests/contracts/surface-coverage.json
git commit -m "build(docs): register response-actions in spec-artifacts pipeline + contract surface coverage

Adds the spec/schema row to spec-artifacts.config.json and the matching
contract row to surface-coverage.json so test_contract_surface_coverage
finds the response-actions inventory."
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

**In scope:** action identity, FEL precondition context, validation trigger mapping, blocking policy, persistence policy, effect taxonomy with ordering, invocation state machine, idempotency posture, failure outcomes, deferred outcomes, host event boundaries, and cross-artifact references (Mapping handle, Intake Handoff request, Respondent Ledger event request). Action invocation is bound to widgets via `ActionButton.actionRef` (Component §5.19, owned by Plan E); this spec does not describe widget rendering.

**Out of scope:** Component widget shape, `actionRef` field on Component (concept §10.4, separate spec), regeneration merge (concept §10.5), Trace (concept §10.6), Definition behavior, Mapping body shape, Respondent Ledger event taxonomy, Intake Handoff body shape, WOS acceptance policy, governed case identity, case lifecycle events, host application event systems (concept §6.3), effect rollback / global transactions (concept §6.4).

### 1.2 Relationship to Existing Specifications

- **[Core](../core/spec.md)**: Response Actions does not modify Definition, Response, ValidationReport, or any Core behavior. It runs a validation pass through the Core engine in the profile cited from VM, via the `getValidationReport({ profile })` API surface (FormEngine).
- **[Validation Mapping](../core/validation-mapping.md)**: Authoritative for `ActionIntent`, `ValidationProfile`, `BlockingPolicy`, `PersistencePolicy`, the master mapping table (VM §6), and the §6.3 validity predicate (carried in schema as `$defs/ValidationTuple`). VM §7 (the legacy SubmitButton Compatibility scaffolding) is deleted by the Component Action References precondition plan. This spec cites VM's vocabularies; it does NOT redefine them. Per VM §6.1, `Action.intent` MAY also be an `x-` extension intent carrying its own explicit tuple.
- **[Experience](../experience/experience-spec.md)**: Experience `ActionRef` (EXP §6.3) references Response Action `id`s. Processors MUST resolve `ActionRef.id` against `actions[*].id`. Unresolved refs MUST produce a `COMP-REFERENTIAL-INTEGRITY` finding (severity `error`) and MUST treat the widget as inert. There is no free-string fallback. The EXP §6.3 resolution contract is added by this plan's modification to `experience-spec.md` (Task 19); it does NOT pre-exist.
- **[Component](../component/component-spec.md)**: `ActionButton` (Component §5.19, refactored by the Component Action References precondition plan) is the canonical action-trigger widget. Every `ActionButton` carries a required `actionRef` resolving against this document's `actions[*].id`. The widget does not carry validation policy or event-dispatch policy — those flow from the resolved Action. There is no legacy SubmitButton fallthrough; VM §7 has been deleted as part of the precondition refactor.
- **[FEL grammar](../../../fel-core/specs/fel/fel-grammar.md)**: Response Actions declares its FEL host bindings per FEL §6.3 "Host-Supplied Context Bindings". `@response`, `@definition`, `@action`, `@now`, `@validation`, `@invocation` are catalog entries; the FEL evaluator MUST reject any other `@name` reference as unbound.
- **[Mapping](../mapping/mapping-spec.md)**: Response Actions references Mapping documents by handle in `EffectRequest.mappingExecution`. It does NOT inline Mapping rules.
- **[Intake Handoff](../core/intake-handoff-spec.semantic.md)**: Response Actions assembles or requests Intake Handoff via `EffectRequest.handoffAssembly`. It does NOT author the Handoff body shape.
- **[Respondent Ledger](../audit/respondent-ledger-spec.md)** (and `respondent-ledger-event.schema.json`): Response Actions requests Ledger events via `EffectRequest.ledgerAppend`. The event kind names MUST be drawn from the Ledger spec's published taxonomy (§8), including the optional `action.*` kinds added in Ledger §8.5.

### 1.3 Design Principles

1. **Additive.** No existing schema or spec is modified semantically. Response Actions is a new sidecar that COMPOSES with current artifacts.
2. **Closed taxonomies.** `Action.intent` values are drawn from the closed VM `ActionIntent` enum OR an `x-`-prefixed publisher extension per VM §6.1. `EffectRequest.type`, `Action.onFailure`, and `Action.onDeferred` are closed enums with no extension carve-out. Publisher extensions use `x-` prefixed properties on object types.
3. **Cite, do not invent.** Validation vocabulary is cited from VM. Ledger kinds are cited from Respondent Ledger. Mapping handles are cited from Mapping documents. Handoff profiles are cited from Intake Handoff.
4. **No fictional rollback.** Concept §6.4 forbids global transactional rollback. Effects execute in declared order; failure halts the chain and MAY append an `action.failed` ledger event (caller-declared via a `ledgerAppend` effect per Ledger §8.5; processor-discretionary); prior effects remain. Compensation is a future concern outside this spec.
5. **Idempotency at the durable boundary.** Every durable effect MUST carry an idempotency key. Transient effects (`hostEvent`) MUST NOT carry one.
6. **Authored, not generated.** Action documents are written by humans or tools. Generators MAY produce seed documents (concept §8) but the artifact is canonical author-owned.

### 1.4 Conformance Levels

- **Core.** Document validates against `response-actions.schema.json`. All closed enums respected. Required fields present.
- **Runtime.** A processor that executes Actions: implements the §7 state machine, honors the cited VM triple (profile / blocking / persistence), executes effects in declared order, enforces idempotency at the durable boundary, returns one of `completed` / `failed` / `deferred` / `blocked` (with `blockedCause` discriminator per §7.1).
- **Cross-Spec.** A processor that produces the §6.9 cross-spec fixture tuple (Response snapshot, ValidationReport snapshot, Ledger event request, Intake Handoff document) AND interoperates with a workflow host that records the terminal outcome (`accepted` / `rejected` / `deferred`) WITHOUT this spec authoring a `case.created` event.

#### 1.4.1 Conformance Prohibitions

The following are MUST NOT requirements at all conformance levels:

- MUST NOT modify Definition, Response, ValidationReport, Locale, Mapping, Intake Handoff, Respondent Ledger, Component, or Experience structural schemas. (Precondition plans add to `respondent-ledger-event.schema.json` and `validation-mapping.schema.json` before this spec lands; those changes are not made *by* this spec.)
- MUST NOT invent or redefine `ActionIntent`, `ValidationProfile`, `BlockingPolicy`, or `PersistencePolicy` — cite VM.
- MUST NOT inline Mapping rules in `EffectRequest.mappingExecution`. Reference by handle only.
- MUST NOT define Respondent Ledger event semantics in this document. Reference kinds from the Ledger spec, including the `action.*` kinds in Ledger §8.5.
- MUST NOT define Intake Handoff body shape in this document. Reference assembly profiles by handle.
- MUST NOT author governed case identity or case lifecycle events.
- MUST NOT emit a `case.created` event or `wos.kernel.case_created` event (or any other case-lifecycle event under any naming convention) from Formspec.
- MUST NOT define a global rollback / transactional reversal of effects.
- MUST NOT introduce a `defaultSubmitActionRef` field on the Response Actions document. Named-action attachment is now via `ActionButton.actionRef` (Plan E).

VE-05 (Core §5.5, reconciled in VM §4.1) ("draft persistence is never blocked by validation findings") is owned by Core §5.5; VM §4.1 reconciles it. This spec inherits the constraint via the §5 mapping but does NOT restate it as its own conformance rule. Cite VM, do not paraphrase.

### 1.5 Peer Artifact Stance (resolves concept §11.1)

> **Note:** This section expands the terse concept §11.1 prose ("If it repeatedly needs to suppress, override, or alter Definition semantics, it must become an explicit behavioral overlay with merge rules or move into a future Definition model") with actionable promotion criteria. This expansion is intentional — the Response Actions spec amends §11.1 in the same commit per the back-reference task (Task 19 Step 4).

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
| `actions` | array of `Action` | Yes (min 1) | The named action set. Order is documentation-only; resolution is by `id`. |

Authors SHOULD include exactly one `targetDefinition`. Processors MUST reject documents whose `$formspecResponseActions` is not `"1.0"`.

This spec does NOT define a top-level default-action field. Action invocation is bound exclusively via `ActionButton.actionRef` (Component §5.19, post-Plan-E). A renderer encountering an `ActionButton` with an unresolved `actionRef` MUST treat it as inert per Component §5.19.1; there is no document-level fallback.

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

`id` MUST be unique within the document. Recommended pattern: identifier starting with a letter, followed by letters / digits / hyphens (regex `^[A-Za-z][A-Za-z0-9-]*$`). Both camelCase (`submitApplication`) and kebab-case (`submit-application`) are acceptable; consistency within a document is RECOMMENDED. Processors MUST reject documents containing duplicate ids.

### 3.3 `intent`

`intent` MUST be a value from VM `ActionIntent` (`save-draft`, `autosave`, `review`, `submit`, `request-evidence`) OR an `x-`-prefixed publisher extension intent per VM §6.1. A master-table intent selects the master-table row (VM §6) that supplies the default (profile, blocking, persistence) triple. An `x-` extension intent MUST carry an explicit `validation` block specifying the full triple per VM §6.1; processors MUST NOT consult the master table for `x-` intents. The §5 `validation` override is subject to the VM §6.3 predicate (encoded in `https://formspec.org/schemas/validationMapping/1.0#/$defs/ValidationTuple` — `ValidationOverride` `$ref`s it and inherits the predicate at schema-validate time).

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
  "expression": "not isEmpty(@response.applicantName)",
  "severity": "block"
}
```

`severity` ∈ {`block`, `defer`}. `block` ⇒ a `false` evaluation terminates the invocation as `blocked` with `cause: "precondition"` (terminal, see §7). `defer` ⇒ a `false` evaluation terminates the invocation as `deferred` with an implementation-defined retry contract.

### 4.2 FEL Host-Binding Catalog (cites FEL §6.3)

Per [FEL §6.3](../../../fel-core/specs/fel/fel-grammar.md#63-host-supplied-context-bindings), this spec declares the following closed catalog of `@name` context bindings for precondition expressions. A conformant FEL evaluator MUST reject any `@name` reference outside this catalog (combined with the grammar-reserved context names `@current`, `@index`, `@count`, `@instance`, `@source`, `@target` — note: `@source` and `@target` are Mapping-DSL grammar-built-ins per FEL §6.1, NOT host-supplied bindings).

| name | kind | type | purity | evaluationTiming |
|---|---|---|---|---|
| `response` | object | Current Response (immutable snapshot taken at §7.2 invocation time, before any effect). | pure | eager |
| `definition` | object | Pinned Definition referenced by `targetDefinition`. | pure | eager |
| `action` | object | The Action being invoked: `{ id, intent, actor }`. | pure | eager |
| `now` | function | `() -> datetime` returning implementation's current time. | impure | lazy |
| `validation` | object | `{ lastReport: ValidationReport \| null }` — the most recent ValidationReport state at invocation, regardless of profile. | pure | eager |
| `invocation` | object | `{ id: string, attempt: integer }`. `id` is stable across replays of the same invocation; `attempt` is 1 on first attempt, 2 on `retry-once`. | pure | eager |

Example precondition expressions: `not isEmpty(@response.applicantName)`; `@validation.lastReport != null and @validation.lastReport.valid`; `@now() > @response.openedAt`; `@action.intent = 'submit' and @invocation.attempt = 1`.

The catalog MUST NOT expose: mutable Definition, Component tree, prior effect outcomes (see §6.5 for the separate effect-time tier), ledger contents, handoff documents, or host-application state. Processors enforce closure via the FEL §6.3.2 evaluator obligation; an evaluator that auto-binds an undeclared `@name` is non-conforming.

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

| Action Intent | Validation Profile | Blocking Policy | Persistence Policy |
|---------------|--------------------|-----------------|--------------------|
| `save-draft`  | `off`              | `non-blocking`  | `draft-checkpoint` |
| `autosave`    | `off`              | `non-blocking`  | `draft-checkpoint` |
| `review`      | `on-submit`        | `non-blocking`  | `none`             |
| `submit`      | `on-submit`        | `block-on-error`| `complete-response`|
| `request-evidence` | `on-demand`   | `non-blocking`  | `draft-checkpoint` |

This table MUST equal VM §6 row-for-row structurally. Conformance test `test_response_actions_runtime.py` pins the table; VM `MasterTable.const` (in `validation-mapping.schema.json`) pins the structural truth.

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

Overrides MUST satisfy the VM §6.3 validity predicate (tightened by the [VM Schema Predicate plan](2026-05-22-validation-mapping-schema-predicate.md) to four clauses):

```
permitted(profile, blocking, persistence) :=
    NOT (persistence = complete-response AND blocking != block-on-error)
  AND NOT (persistence = complete-response AND profile != on-submit)
  AND NOT (profile = off AND blocking = block-on-error)
  AND NOT (blocking = block-on-error AND persistence != complete-response)
```

Four clauses. Clauses 1 and 4 together make `block-on-error` and `complete-response` co-required — every blocking action MUST be a completion-transition action; every completion-transition action MUST be gated by `block-on-error`. Clause 2 forbids reaching `completed` from a partial validation pass (`on-demand` or `live` profiles do not include the full completion-eligible shape set). Clause 3 (`NOT (profile = off AND blocking = block-on-error)`) forbids the combination directly — under `off` no validation pass runs, so a `block-on-error` gate has nothing to gate on.

Schema-level enforcement: `ValidationOverride` `$ref`s `https://formspec.org/schemas/validationMapping/1.0#/$defs/ValidationTuple`, which carries the predicate as `allOf` clauses. Invalid override combinations are caught at schema-validate time, not just at runtime. Processors MUST reject Action documents whose overrides violate the predicate (and a conformant validator already does so when consuming this spec's schema).

### 5.3 Validation Execution

The validation pass MUST be a single ValidationReport produced by the Core engine using the resolved profile. Reference implementations use `FormEngine.getValidationReport({ profile })` (per [the FormEngine ValidationProfile Adapter plan](2026-05-22-formengine-validation-profile-adapter.md)), which accepts the VM vocabulary directly via the `ValidationProfileResolver` DI port. The report becomes input to:

1. The blocking gate (§7.3).
2. Any subsequent effect that consumes the report (e.g., `handoffAssembly` MUST include the report by reference).

For `profile: off`, the engine returns `null` (no ValidationReport produced) per VM §3 / §9.1.2. Plan C's `getValidationReport({ profile: 'off' })` returns null; this spec matches that contract.

### 5.4 Persistence Reconciliation

Persistence policy is the action's declared intent for what happens to Response data when the invocation reaches a terminal state. The exact mechanics per VM §5.2:

- `persistence: draft-checkpoint` — the processor MUST persist the current Response as a draft when the invocation reaches `completed` or `deferred`. The processor SHALL emit a `ledgerAppend` with `eventKind: "draft.saved"` if and only if such an `EffectRequest` is declared in the Action. Persistence is the policy; ledger append is the declared auditable trace. Processors MUST NOT silently append to the Ledger without a declared `ledgerAppend` effect.
- `persistence: complete-response` — the processor MUST transition Response `status` to `completed` if and only if the blocking gate (§7.3) passes. The status transition is mechanical; the ledger trace is whatever the Action declares (typically `response.completed`).
- `persistence: none` — no Response mutation; the action is informational (typical for `review`).

On a blocked or failed terminal: per VM §5.2 + the tightened §6.3 predicate (fourth clause), a `blocked` terminal only fires for `complete-response` actions (since `block-on-error` and `complete-response` are co-required). On blocked: Response remains `in-progress`, data preserved, persistence `none`. Other terminal-with-non-complete-response combinations (e.g., `draft-checkpoint` reaching `failed` from an effect failure) honor VM §5.2: the action's declared persistence is still attempted — the failure halted the effect chain, not the response-level persistence policy.
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

The `EffectRequest` $defs in `response-actions.schema.json` use `const`-on-`type` per branch composed via `oneOf`; processors MUST reject unknown `type` values. (Earlier drafts used the OpenAPI `discriminator` keyword; that keyword has no effect under JSON Schema 2020-12. The `const`-on-`type` + `oneOf` construction provides the discriminated-union behavior schema-side.)

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

`onError` ∈ {`fail`, `defer`}. Default `fail`. `evidenceRequest` defaults to `defer` (evidence collection is inherently async; deferral is the natural failure mode). `hostEvent` has no `onError` — transient effects MUST NOT fail the invocation.

Earlier drafts of this spec included `onError: continue`. Dropped: `continue` would let an invocation reach terminal `completed` while the effect trace carries one or more `status: "failed"` entries, contradicting the §6.4 / §7.4 rule that the UI MUST NOT report success when a declared effect failed. Authors who want "execute effect B even if effect A failed" semantics MUST express that as two separate Actions — one for the success path, one for the fallback path — composed by the host application. This keeps terminal categorization unambiguous.

### 6.3 Ordered Execution

The processor MUST invoke effects in declared array order. The processor MUST NOT reorder, parallelize, or coalesce effects without an explicit Action declaration (which this spec does not introduce). A future spec MAY add `parallel: true` markers if a real use case appears; until then, strict order.

### 6.4 No Rollback

Per concept §6.4: when an effect fails (`onError: fail`), the processor MUST halt the remaining chain and MUST NOT reverse prior effects. The terminal state is `failed` (§7). Prior durable effects remain materialized; their idempotency keys ensure a replay does not duplicate them. Compensation effects are NOT specified by this document.

### 6.5 Idempotency

Every durable effect MUST carry `idempotencyKey`. The key is a FEL expression. **Evaluation timing — load-bearing**:

1. **Frozen at first attempt.** The processor evaluates the key once when the effect is first about to execute (i.e., when traversal reaches that effect in the §7 `effects-running` state) and MUST cache the resolved string for the lifetime of the invocation. On `retry-once` (§8) or any replay, the cached key is reused. This guarantees a `retry-once` retry hits the same idempotency record.
2. **Catalog at idempotency-key evaluation time.** The FEL evaluator uses the §4.2 catalog PLUS `@invocation.id` (UUID, stable across replays). `@invocation.attempt` is NOT available at idempotency-key evaluation time — including it would defeat dedup by producing different keys per attempt.
3. **`@effects[*]` is NOT in the idempotency-key catalog.** The key MUST NOT depend on prior effect outcomes. A processor MUST reject an `idempotencyKey` FEL expression that references `@effects` (FEL §6.3 evaluator obligation — unbound name during idempotency-key evaluation).

A processor receiving an effect with an idempotency key it has previously executed MUST observe the prior outcome WITHOUT re-executing the side effect. The effect trace records `status: "replayed"` for that effect.

### 6.5.1 Effect-Time FEL Catalog Extension

For FEL expressions OTHER than `idempotencyKey` (`payloadRef`, `detailRef`), the catalog at evaluation time extends the §4.2 catalog with:

| name | kind | type | purity | evaluationTiming |
|---|---|---|---|---|
| `effects` | object | Array-indexed `{ [i]: { type, status, outcomeRef } }` of prior effect outcomes in this invocation. Index `i` is the zero-based declared position. | pure | lazy |
| `invocation.attempt` | (extends `@invocation`) | Integer ≥ 1 | pure | eager |

`payloadRef` example: `{ reportRef: @validation.lastReport, mappingOutcomeRef: @effects[0].outcomeRef }`. Accessing `@effects[i]` where `i` ≥ the current effect's index is an evaluation error (no forward references).

### 6.6 Effect Outcomes

Each effect produces an outcome object recorded in the invocation effect trace:

```json
{
  "type": "ledgerAppend",
  "status": "succeeded" | "failed" | "deferred" | "replayed",
  "idempotencyKey": "<resolved>",
  "outcomeRef": "sha256:<lower-hex>"
}
```

`outcomeRef` MUST be a content-addressable handle of the form `sha256:<lower-hex>` — a literal `sha256:` prefix followed by a 64-character lowercase hexadecimal SHA-256 digest. The digest is computed over:

- For successful durable effects: the canonical byte encoding of the produced artifact (Mapping output bytes, Handoff document bytes, Ledger event canonical encoding per Ledger §14, evidence-request bytes).
- For failed effects: the canonical byte encoding of the failure structure (`{ type, reason, attempt, timestamp }` serialized via the host's canonical JSON or CBOR convention).
- For deferred effects: the canonical byte encoding of the deferral record (`{ type, reason, replayTokenRef, attempt, timestamp }`).
- For replayed effects: the digest from the prior invocation's outcome, unchanged.

`outcomeRef` is a Formspec-internal content-addressable format defined by this spec. The chosen `sha256:<lower-hex>` shape happens to be Trellis-compatible (matching conventions used elsewhere in the stack, including Trellis envelope binding per ADR 0004), but this spec owns the format definition; no dependency on Trellis is implied. Trellis envelope verifiers that consume Formspec ledger event payloads will observe these handles and can verify them independently.

A future spec MAY introduce a multihash variant (`<algorithm>:<hex>`) when an algorithm beyond SHA-256 becomes necessary; that future spec governs interoperability and migration. For 1.0, only `sha256:` is conformant.

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

An invocation MUST traverse exactly this state graph. States in **bold** are terminal. Four terminals — `completed`, `failed`, `deferred`, `blocked` — with `blocked` carrying a `cause` discriminator (`"precondition"` or `"validation"`) to disambiguate the failure boundary without doubling the terminal count.

```text
idle
  → invoking
    → preconditions-evaluated
      → (block fail) → **blocked** {cause: "precondition"}
      → (defer fail) → **deferred**
      → (all pass)   → validation-running
        → blocking-gate
          → (block-on-error & ValidationReport.valid=false) → **blocked** {cause: "validation"}
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
| `preconditions-evaluated` | block-severity fails | **`blocked`** with `cause: "precondition"` |
| `preconditions-evaluated` | defer-severity fails | **`deferred`** |
| `validation-running` | report produced | `blocking-gate` |
| `blocking-gate` | gate passes | `effects-running` |
| `blocking-gate` | gate fails | **`blocked`** with `cause: "validation"` |
| `effects-running` | effect.onError=fail | **`failed`** |
| `effects-running` | effect.onError=defer | **`deferred`** |
| `effects-running` | all effects done | **`completed`** |

### 7.2 Snapshot Discipline

`invoking` MUST capture an immutable snapshot of the Response at the moment of invocation. All preconditions, validation, and effects MUST read from this snapshot. The Response MAY mutate via concurrent edits between invocation and terminal state; those edits MUST NOT affect this invocation's behavior. (Idempotency at the durable boundary handles the contention case.)

### 7.3 The Blocking Gate

If the Action's resolved `blocking` is `non-blocking`, the gate is a no-op and the state advances to `effects-running` regardless of report contents.

If `blocking` is `block-on-error`, the gate evaluates `ValidationReport.valid`. If `false` (i.e., `counts.error > 0`), the state advances to **`blocked`** with `cause: "validation"` and **zero effects are invoked**. Per VM §5.2: when the gate fails for an action whose resolved persistence is `complete-response`, the processor MUST NOT transition Response `status` to `completed` and MUST NOT mutate Response data — `persistence: none` applies for this invocation, the Response remains `in-progress` with full data preserved. Any pre-existing draft state is untouched (this invocation did not request a draft persistence). VE-05 (Core §5.5, reconciled in VM §4.1) governs the user's right to save under separate save mechanisms; it is not invoked by this gate, and this spec does NOT re-state VE-05 as its own rule.

### 7.4 Terminal Categorization

| Terminal | UI MUST | Caller MAY |
|---|---|---|
| `completed` | Surface success; trace available. | Discard invocation handle. |
| `failed` | Surface failure with reason; show effect trace up to failure. | Re-invoke (with new invocation id; idempotency keys protect against duplication on durable effects that succeeded). |
| `blocked` (cause: "validation") | Surface validation report; do NOT surface success. | Re-invoke after user correction. |
| `blocked` (cause: "precondition") | Surface precondition id and FEL expression that failed. | Re-invoke after user correction. |
| `deferred` | Surface deferral reason and replay token. | Resume per processor's deferral protocol. |

The UI MUST NOT report `completed` on any other terminal. A processor that conflates `failed` with `completed` is non-conforming. The `cause` discriminator on `blocked` is observable in the effect-trace structure (§6.6) and the optional `action.failed` ledger event (Ledger §8.5 payload `terminal` and the implementation-defined `causeRef`).

### 7.5 Replay

A replay is a re-invocation that re-uses the original `invocation.id` (NOT a new one). Processors MAY support replay; if so, durable effects with prior outcomes return `replayed`. A replay is the recovery path after `deferred` and after `failed` (when `onFailure: retry-once`). The replay protocol's transport and handle exchange are processor-defined and NOT spec-pinned by this document; if cross-processor replay interop becomes a real need, file a follow-up.
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

A processor with `onFailure: retry-once` performs exactly one retry before terminating as `failed`. Retry semantics:

- `@invocation.attempt` increments from 1 to 2. The attempt counter is observable to ledger events and effect-time FEL expressions (§6.5.1) but is NOT in the idempotency-key catalog (§6.5).
- Idempotency keys are **frozen at first attempt** per §6.5 and reused verbatim on retry. A retried `mappingExecution` with prior outcome MUST observe the prior outcome via the replay contract; a retried effect that had no prior outcome MUST re-execute.
- Retry re-enters at `effects-running` with the same `invocation.id` and the same Response snapshot. Preconditions and validation are NOT re-evaluated.

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

The `replayToken` is opaque to this spec. The processor's deferral protocol governs token lifetime, semantics, and replay invocation. A deferred invocation MAY transition to `completed`, `failed`, `blocked` (with either cause), or `deferred` (again) on replay.

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

### 10.3 ActionButton Binding (cites Component §5.19, Plan E)

An `ActionButton` widget (Component §5.19, post-Plan-E) carries a required `actionRef: string` resolving against `actions[*].id` in the loaded Response Actions document. On click, the renderer invokes the resolved Action through the §7 state machine. The widget carries no validation policy and no event-dispatch policy — those flow from the resolved Action's `validation` block and effect chain respectively.

Example named submit Action bound by an `ActionButton`:

```json
{
  "id": "submit-application",
  "intent": "submit",
  "effects": [
    { "type": "mappingExecution", "mappingRef": "applicationPayload", "idempotencyKey": "@response.applicationId & '/v' & @response.version" },
    { "type": "ledgerAppend", "eventKind": "response.submit-attempted", "payloadRef": "{ reportRef: @validation.lastReport, mappingOutcomeRef: @effects[0].outcomeRef }", "idempotencyKey": "@invocation.id & '/submit-attempted'" },
    { "type": "handoffAssembly", "handoffProfileRef": "intakeStandard", "recipientRef": "wosIntake", "idempotencyKey": "@invocation.id & '/handoff'" },
    { "type": "ledgerAppend", "eventKind": "response.completed", "payloadRef": "{ handoffOutcomeRef: @effects[2].outcomeRef }", "idempotencyKey": "@invocation.id & '/completed'" },
    { "type": "hostEvent", "eventName": "formspec-submit", "detailRef": "{ reportRef: @validation.lastReport, handoffOutcomeRef: @effects[2].outcomeRef }" }
  ]
}
```

The Component side declares:

```json
{ "component": "ActionButton", "actionRef": "submit-application", "label": { "literal": "Submit" } }
```

Event-kind notes: `response.submit-attempted` and `response.completed` are Ledger §8 published kinds, NOT spec-invented synonyms. The optional `action.invoked` / `action.failed` / `action.deferred` / `action.replayed` kinds from Ledger §8.5 are processor-discretionary — an Action MAY declare them as additional `ledgerAppend` effects.

Unresolved `actionRef` (no matching Action in the loaded document, OR no document loaded) MUST produce an inert widget + informative finding per Component §5.19. There is no implicit fallthrough, no default-Action lookup, no legacy SubmitButton behavior.
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add specs/response-actions/response-actions-spec.md
git commit -m "feat(spec): draft response-actions §8-§10 (failure, deferred, host event boundaries, default submit)"
```

---

## Task 11: Draft §11 Cross-Artifact References, §12 Conformance, §13 Prohibitions

**Files:**
- Modify: `specs/response-actions/response-actions-spec.md`

- [ ] **Step 1: Append §11–§13**

```markdown
## 11. Cross-Artifact References

### 11.1 Mapping Reference

`mappingExecution.mappingRef` is a handle to a Mapping document (see [Mapping spec §1](../mapping/mapping-spec.md)). The resolution scheme is the host's responsibility; processors typically support either a URL or a registry alias. Inlining Mapping rules in the EffectRequest is FORBIDDEN.

### 11.2 Intake Handoff Reference

`handoffAssembly.handoffProfileRef` is a handle to an Intake Handoff assembly profile. The Handoff body shape is owned by the Intake Handoff spec; this Action describes only WHAT to assemble and WHERE to send it, not the body. The outcome handle returned in the effect trace points to the produced Handoff document and MUST be content-addressable per §6.6 — the handle is derived from a cryptographic hash of the Handoff bytes, enabling Trellis envelope binding without trusting an opaque key.

The cross-spec fixture (`cross-spec-intake-handoff-seam.json`) covers the full seam: Response snapshot → ValidationReport snapshot → Ledger event request → Handoff document (content-addressable) → workflow-host acknowledgment of one of `accepted` / `rejected` / `deferred`. The workflow-host outcome is OUTSIDE this spec's responsibility; Response Actions MUST NOT author a `case.created` event or any case lifecycle event.

### 11.3 Respondent Ledger Reference

`ledgerAppend.eventKind` MUST be a kind name published in the Respondent Ledger spec (`respondent-ledger.md` / `respondent-ledger-event.schema.json`). Authors MUST NOT invent new kinds in a Response Actions document. The Ledger spec owns materiality, durability, integrity profile, and append semantics; this Action only requests the append.

The four optional `action.*` kinds (`action.invoked`, `action.failed`, `action.deferred`, `action.replayed`) added in [Ledger §8.5](../audit/respondent-ledger-spec.md#85-action-lifecycle-events) carry the `actionEvent` payload shape (`{ actionId, invocationId, attempt, terminal, effectIndex?, causeRef?, replayTokenRef?, priorInvocationRef? }`). An Action MAY emit any subset of the lifecycle moments via declared `ledgerAppend` effects.

**Terminal vocabulary mapping.** This spec defines four terminals (`completed`, `failed`, `deferred`, `blocked`). The Ledger §8.5 `actionEvent.terminal` enum is restricted to `{failed, deferred, replayed}` — only the values the four published kinds emit. The mapping:

| Response Actions terminal | Ledger event kind | `actionEvent.terminal` | Recommended causeRef |
|---|---|---|---|
| `completed` | `response.completed` (existing kind) — NOT `action.*` | n/a | n/a |
| `failed` | `action.failed` (optional) | `"failed"` | — |
| `deferred` | `action.deferred` (optional) | `"deferred"` | — |
| `blocked` (cause: validation) | `action.failed` (optional) | `"failed"` | `"blocked:validation"` |
| `blocked` (cause: precondition) | `action.failed` (optional) | `"failed"` | `"blocked:precondition"` |
| replay event | `action.replayed` (optional) — NOT a terminal of this invocation; a separate ledger entry on the replay | `"replayed"` | n/a |

The `causeRef` values shown are RECOMMENDED conventions for the `blocked` terminals; processors MAY use other opaque values per Ledger §8.5's opacity rule. The values MUST satisfy the schema's ASCII-printable + maxLength constraints.

The `completed` terminal is covered by the existing `response.completed` kind (which an Action declares via `ledgerAppend(response.completed)` per §10.3). The Ledger does not publish an `action.completed` kind — `response.completed` carries the lifecycle moment.

`payloadRef` is a FEL expression evaluated in the §6.5.1 effect-time catalog (§4.2 catalog + `@effects[i].outcomeRef` + `@invocation.attempt`). The Ledger spec defines what payload shape each kind expects.

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

1. Implements the §7 state machine with the four terminals (`completed`, `failed`, `deferred`, `blocked` with `cause` discriminator) and does NOT conflate them.
2. Honors the resolved (profile, blocking, persistence) triple per VM, including the §5.2 mechanics for `blocked` terminals.
3. Executes effects in declared order.
4. Halts effect execution on first `onError: fail` failure (no implicit rollback).
5. Freezes `idempotencyKey` evaluation at first attempt per §6.5; observes prior effect outcomes via idempotency keys on replay.
6. Surfaces failure to the UI; does NOT report success on any non-`completed` terminal.
7. Produces content-addressable `outcomeRef` handles per §6.6.

### 12.3 Cross-Spec Conformance

A Cross-Spec-conforming processor produces the §6.9 fixture tuple and interoperates with a workflow host that records the terminal outcome (`accepted` / `rejected` / `deferred`). Formspec MUST NOT author `case.created`.

### 12.4 Required Fixtures

A conforming implementation MUST pass all fixtures under `tests/conformance/fixtures/response-actions/`. The fixture set is enumerated in the plan File Structure section above and pinned by `test_response_actions_runtime.py`.

## 13. Conformance Prohibitions (re-asserted)

The §1.4.1 prohibitions are normative at all conformance levels and are restated here for ease of citation:

- MUST NOT modify Definition, Response, ValidationReport, Locale, Mapping, Intake Handoff, Respondent Ledger, Component, or Experience structural schemas (the precondition plans modify several of these BEFORE this spec lands; those changes are not made *by* this spec).
- MUST NOT invent new validation vocabulary.
- MUST NOT inline Mapping rules.
- MUST NOT define Ledger event semantics.
- MUST NOT define Handoff body shape.
- MUST NOT author governed case identity or lifecycle events.
- MUST NOT emit a `case.created` event or `wos.kernel.case_created` event (or any other case-lifecycle event under any naming convention).
- MUST NOT define global rollback.
- MUST NOT introduce a document-level default-action field (e.g., `defaultSubmitActionRef`). Action binding is exclusively via `ActionButton.actionRef`.

VE-05 (Core §5.5, reconciled in VM §4.1) applies universally; this spec inherits its constraints via §5 but does NOT restate it.
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add specs/response-actions/response-actions-spec.md
git commit -m "feat(spec): draft response-actions §11-§13 (cross-artifact refs, conformance, prohibitions)"
```

> **§14 Migration is omitted** — greenfield refactor (Plan E renames `SubmitButton` → `ActionButton` and deletes VM §7); no legacy documents exist to migrate. ValidationSummary continues to work via the Action's `hostEvent` effect dispatch per Plan E Task 5 prose update.

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
  "description": "Form-scoped runtime contract for action invocation. Defines named Actions (Action.intent drawn from VM ActionIntent plus x- extension intents per VM §6.1), FEL preconditions, optional per-action validation overrides inheriting the VM §6.3 predicate via $ref to ValidationTuple, and an ordered closed-taxonomy EffectRequest list with idempotency frozen at first attempt. Action invocation is bound to widgets via ActionButton.actionRef (Component §5.19, post-Plan-E). See specs/response-actions/response-actions-spec.md for the normative prose. Conformance is pinned by tests/conformance/spec/test_response_actions_runtime.py.",
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
        "url": { "type": "string", "format": "uri", "description": "Canonical URL of the Definition this Response Actions document binds to." },
        "compatibleVersions": { "type": "string", "description": "SemVer range expressing which Definition versions this document supports (e.g., '>=1.0.0 <2.0.0')." }
      },
      "additionalProperties": false,
      "description": "The Definition this Response Actions document binds to. Identical shape to Experience.targetDefinition.",
      "examples": [{ "url": "https://example.gov/forms/intake", "compatibleVersions": ">=1.0.0 <2.0.0" }]
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
      "oneOf": [
        { "$ref": "https://formspec.org/schemas/validationMapping/1.0#/$defs/ActionIntent" },
        {
          "type": "string",
          "pattern": "^x-",
          "description": "Publisher-defined action intent extension per VM §6.1. MUST be paired with an explicit `validation` block on the Action; processors MUST NOT consult the master table for x- intents."
        }
      ],
      "description": "Closed VM ActionIntent enum OR an x-prefixed publisher extension intent. Matches the schema-side surface of VM MappingEntry.intent."
    },
    "Action": {
      "type": "object",
      "required": ["id", "intent", "effects"],
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string", "minLength": 1, "pattern": "^[A-Za-z][A-Za-z0-9-]*$", "description": "Unique within document. Starts with a letter; allows letters, digits, hyphens (camelCase and kebab-case both acceptable)." },
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
        "id": { "type": "string", "minLength": 1, "description": "Stable identifier for this precondition. Surfaced in the blocked-cause discriminator when severity=block; surfaced in the deferred reason when severity=defer." },
        "expression": { "type": "string", "description": "FEL expression evaluated in the §4.2 host-binding catalog. MUST evaluate to a boolean; non-boolean results are an evaluation error." },
        "severity": { "type": "string", "enum": ["block", "defer"], "description": "block ⇒ a false evaluation terminates the invocation as blocked with cause=precondition. defer ⇒ a false evaluation terminates the invocation as deferred with an implementation-defined retry contract." }
      },
      "description": "A FEL-guarded precondition. Evaluated in array order; first failing precondition terminates the invocation per §4.3."
    },
    "ValidationOverride": {
      "$ref": "https://formspec.org/schemas/validationMapping/1.0#/$defs/ValidationTuple",
      "description": "Per-action override of the master-table triple. Predicate inherited via $ref to VM ValidationTuple — invalid (profile, blocking, persistence) combinations are rejected at schema-validate time per VM §6.3."
    },
    "EffectRequest": {
      "oneOf": [
        { "$ref": "#/$defs/MappingExecutionEffect" },
        { "$ref": "#/$defs/LedgerAppendEffect" },
        { "$ref": "#/$defs/HandoffAssemblyEffect" },
        { "$ref": "#/$defs/EvidenceRequestEffect" },
        { "$ref": "#/$defs/HostEventEffect" }
      ],
      "description": "Closed taxonomy via const-on-type + oneOf composition. Durable types (mappingExecution, ledgerAppend, handoffAssembly, evidenceRequest) MUST carry idempotencyKey. hostEvent is transient and MUST NOT carry one. JSON Schema 2020-12 enforces the discriminated union via const + oneOf — the OpenAPI `discriminator` keyword has no effect here and is omitted."
    },
    "MappingExecutionEffect": {
      "type": "object",
      "required": ["type", "mappingRef", "idempotencyKey"],
      "additionalProperties": false,
      "properties": {
        "type": { "const": "mappingExecution", "description": "Closed branch discriminator." },
        "mappingRef": { "type": "string", "minLength": 1, "description": "Opaque handle to a Mapping document (see mapping-spec §1). Inlining Mapping rules in this Effect is FORBIDDEN — reference only." },
        "idempotencyKey": { "type": "string", "minLength": 1, "description": "FEL expression evaluated once at first attempt and frozen for retries; see spec §6.5. MUST NOT reference @effects." },
        "onError": { "type": "string", "enum": ["fail", "defer"], "default": "fail", "description": "On effect failure: fail ⇒ terminal failed (halt chain, no rollback); defer ⇒ terminal deferred." }
      },
      "description": "Durable effect: invokes a Mapping document and produces a target payload. Outcome handle in the effect trace is sha256:<hex> per §6.6."
    },
    "LedgerAppendEffect": {
      "type": "object",
      "required": ["type", "eventKind", "idempotencyKey"],
      "additionalProperties": false,
      "properties": {
        "type": { "const": "ledgerAppend", "description": "Closed branch discriminator." },
        "eventKind": { "type": "string", "minLength": 1, "description": "Published Ledger event kind from respondent-ledger spec §8 / §8.5. MUST NOT be invented here. Validators MAY cross-check against the Ledger EventType enum at conformance time." },
        "payloadRef": { "type": "string", "description": "Optional FEL expression producing the event payload. Evaluated in the §6.5.1 effect-time catalog (precondition catalog + @effects[i].outcomeRef + @invocation.attempt). The Ledger spec defines the payload shape per kind." },
        "idempotencyKey": { "type": "string", "minLength": 1, "description": "FEL expression evaluated once at first attempt and frozen for retries." },
        "onError": { "type": "string", "enum": ["fail", "defer"], "default": "fail", "description": "On effect failure: fail ⇒ terminal failed; defer ⇒ terminal deferred." }
      },
      "description": "Durable effect: appends a Ledger event using a published kind. Outcome handle is sha256:<hex> over the canonical event encoding."
    },
    "HandoffAssemblyEffect": {
      "type": "object",
      "required": ["type", "handoffProfileRef", "recipientRef", "idempotencyKey"],
      "additionalProperties": false,
      "properties": {
        "type": { "const": "handoffAssembly", "description": "Closed branch discriminator." },
        "handoffProfileRef": { "type": "string", "minLength": 1, "description": "Handle to an Intake Handoff assembly profile. The Handoff spec owns the body shape; this Action describes only what to assemble." },
        "recipientRef": { "type": "string", "minLength": 1, "description": "Handle identifying the recipient (e.g., a WOS intake endpoint registered with the host)." },
        "idempotencyKey": { "type": "string", "minLength": 1, "description": "FEL expression evaluated once at first attempt and frozen for retries." },
        "onError": { "type": "string", "enum": ["fail", "defer"], "default": "fail", "description": "On effect failure: fail ⇒ terminal failed; defer ⇒ terminal deferred." }
      },
      "description": "Durable effect: assembles an Intake Handoff and forwards it to a recipient. Outcome handle is sha256:<hex> over the produced Handoff bytes."
    },
    "EvidenceRequestEffect": {
      "type": "object",
      "required": ["type", "requestRef", "idempotencyKey"],
      "additionalProperties": false,
      "properties": {
        "type": { "const": "evidenceRequest", "description": "Closed branch discriminator." },
        "requestRef": { "type": "string", "minLength": 1, "description": "Handle identifying the evidence-collection request (e.g., the demand-timing shape this effect satisfies)." },
        "idempotencyKey": { "type": "string", "minLength": 1, "description": "FEL expression evaluated once at first attempt and frozen for retries." },
        "onError": { "type": "string", "enum": ["fail", "defer"], "default": "defer", "description": "Default defer: evidence collection is inherently async; deferral is the natural failure mode. fail is also valid for actions that prefer to surface evidence-collection failure directly." }
      },
      "description": "Durable effect: triggers demand-timing evidence collection per Definition. Outcome handle is sha256:<hex>."
    },
    "HostEventEffect": {
      "type": "object",
      "required": ["type", "eventName"],
      "additionalProperties": false,
      "properties": {
        "type": { "const": "hostEvent", "description": "Closed branch discriminator." },
        "eventName": { "type": "string", "minLength": 1, "description": "DOM CustomEvent name dispatched on the host element when this effect executes (e.g., 'formspec-submit'). Renderer-defined dispatch target." },
        "detailRef": { "type": "string", "description": "OPTIONAL FEL expression producing the CustomEvent's detail object. Evaluated in the §6.5.1 effect-time catalog." }
      },
      "description": "Transient effect: dispatches a host-local signal. MUST NOT carry idempotencyKey (transient effects MUST NOT have externally durable consequences); MUST NOT fail the invocation."
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
    "terminal": "completed | failed | deferred | blocked",
    "blockedCause": "precondition | validation",
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
- Create: `tests/conformance/fixtures/response-actions/precondition-fails-blocked.json`
- Create: `tests/conformance/fixtures/response-actions/precondition-fails-deferred.json`

- [ ] **Step 1: Author each fixture per the File Structure section descriptions**

Use the same shape as Task 13's fixtures. Key expectations to pin:

- `effect-ordering.json` — `effectTrace` array MUST be in exact declared order; `expected.effectTraceOrder` matches `responseActions.actions[0].effects` indices 0..4.
- `effect-failure-no-rollback.json` — index 2 (`handoffAssembly`) has `status: "failed"`. Indices 0 and 1 have `status: "succeeded"` and MUST remain in the trace (NOT marked rolled-back). Index 3 (`hostEvent`) has `status: "not-invoked"`. Expected adds `expected.compensationsAttempted: false`. **Do NOT expect an automatic `action.failed` ledger event** — Ledger §8.5 lifecycle events are processor-discretionary and NOT pinned by this harness. Authors who want the lifecycle event MUST declare it as a `ledgerAppend` effect.
- `effect-deferred-evidence.json` — `evidenceRequest` returns `deferred`; subsequent effects `not-invoked`; expected has `replayTokenIssued: true`.
- `effect-idempotent-replay.json` — fixture includes TWO invocation blocks: `invocation.first` and `invocation.replay`. Second invocation uses identical `invocation.id`. Expected: first invocation's effect trace has all `succeeded`; replay's trace has all `replayed`. Idempotency keys MUST be identical between runs.
- `precondition-fails-blocked.json` — precondition with `severity: block` evaluates `false`. No validation pass run; zero effects invoked; expected terminal `blocked` with `blockedCause: "precondition"`.
- `precondition-fails-deferred.json` — precondition with `severity: defer` evaluates `false`. No validation pass run; zero effects invoked; expected terminal `deferred` (NOT `blocked` — defer-severity routes around the blocked terminal entirely).

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

## Task 15: Author the §6.9 cross-spec Intake Handoff seam fixture + master shapes

**Files:**
- Create: `tests/conformance/fixtures/response-actions/cross-spec-intake-handoff-seam.json`
- Create: `tests/conformance/fixtures/response-actions/master-action-shapes.json`

- [ ] **Step 1: Author cross-spec-intake-handoff-seam.json**

The fixture MUST produce the full §6.9 tuple. Add to `expected`:

```json
{
  "crossSpecTuple": {
    "responseSnapshotRef": "sha256:<hex>",
    "validationReportRef": "sha256:<hex>",
    "ledgerHeadRef": "sha256:<hex>",
    "handoffDocumentRef": "sha256:<hex>",
    "workflowHostOutcome": "accepted | rejected | deferred"
  },
  "prohibitions": {
    "caseCreatedEventEmitted": false,
    "caseLifecycleEventsEmitted": []
  }
}
```

The `workflowHostOutcome` is provided by the test harness, simulating a workflow host. The fixture pins that exactly one of the three values is recorded and that NO case lifecycle events were authored by Formspec. All `*Ref` handles in the tuple are content-addressable per §6.6 (`sha256:<hex>`).

- [ ] **Step 2: Author master-action-shapes.json**

A single Response Actions document containing FIVE Actions (one per `Action.intent` value) and FIVE EffectRequest examples (one per `EffectRequest.type`). This document is a coverage marker: every closed-enum branch appears exactly once. Used by the schema test to assert exhaustiveness.

- [ ] **Step 3: Schema-validate**

```bash
cd formspec && node -e "
const Ajv = require('ajv/dist/2020');
const ajv = new Ajv({strict: false, allErrors: true});
const schema = JSON.parse(require('fs').readFileSync('schemas/response-actions.schema.json'));
const vmSchema = JSON.parse(require('fs').readFileSync('schemas/validation-mapping.schema.json'));
ajv.addSchema(vmSchema);
const validate = ajv.compile(schema);
const fs = require('fs');
['cross-spec-intake-handoff-seam.json', 'master-action-shapes.json'].forEach(f => {
  const fx = JSON.parse(fs.readFileSync(\`tests/conformance/fixtures/response-actions/\${f}\`));
  const docs = fx.responseActions ? [fx.responseActions] : [];
  for (const d of docs) {
    const ok = validate(d);
    console.log(f, ok ? 'OK' : 'FAIL', ok ? '' : JSON.stringify(validate.errors));
  }
});
"
```

Expected: every printed line ends with `OK`.

- [ ] **Step 4: Commit**

```bash
cd formspec && git add tests/conformance/fixtures/response-actions/
git commit -m "test(conformance): add cross-spec intake-handoff seam + master-shapes fixtures"
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

# Reuse the project-wide schema-registry helper. Registers by $id, which
# is what the canonical $ref form in this schema expects.
# Source: tests/unit/support/schema_fixtures.py:build_schema_registry.
from tests.unit.support.schema_fixtures import build_schema_registry


SCHEMA_PATH = Path(__file__).resolve().parents[3] / "schemas" / "response-actions.schema.json"
VM_SCHEMA_PATH = Path(__file__).resolve().parents[3] / "schemas" / "validation-mapping.schema.json"
FIXTURE_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "response-actions"


def load_schema():
    return json.loads(SCHEMA_PATH.read_text())


def load_vm_schema():
    return json.loads(VM_SCHEMA_PATH.read_text())


def build_validator():
    """Build a validator for the response-actions schema with the VM
    schema available via $id for cross-schema $ref resolution
    (ValidationTuple and ActionIntent live in VM)."""
    schema = load_schema()
    vm_schema = load_vm_schema()
    return Draft202012Validator(schema, registry=build_schema_registry(schema, vm_schema))


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


def test_validation_override_refs_validation_tuple():
    """ValidationOverride is a single $ref to VM ValidationTuple.

    The predicate (VM §6.3) is enforced via the $ref — invalid override
    combinations are rejected at schema-validate time. This replaces the
    old shape where ValidationOverride enumerated three independent
    enums and the predicate was only documented in prose.
    """
    schema = load_schema()
    vo = schema["$defs"]["ValidationOverride"]
    assert "$ref" in vo, "ValidationOverride MUST be a single $ref"
    assert vo["$ref"].endswith("ValidationTuple"), (
        f"ValidationOverride MUST $ref ValidationTuple to inherit the §6.3 "
        f"predicate; got {vo['$ref']}"
    )


def test_validation_override_rejects_prohibited_tuple():
    """Smoke: feeding a §6.3-prohibited combination to the response-actions
    schema via ValidationOverride MUST be rejected at schema-validate time.

    Catches regressions where someone replaces the $ref with an inlined
    properties block that loses the predicate.
    """
    validator = build_validator()
    doc = {
        "$formspecResponseActions": "1.0",
        "version": "1.0.0",
        "targetDefinition": {"url": "https://example.gov/x", "compatibleVersions": ">=1.0.0"},
        "actions": [{
            "id": "submitX",
            "intent": "submit",
            "validation": {
                # Prohibited by VM §6.3: complete-response requires on-submit.
                "profile": "on-demand",
                "blocking": "block-on-error",
                "persistence": "complete-response",
            },
            "effects": [{"type": "hostEvent", "eventName": "x"}],
        }],
    }
    errors = list(validator.iter_errors(doc))
    assert errors, "schema MUST reject §6.3-prohibited ValidationOverride combinations"


def test_action_intent_allows_vm_enum_and_x_extension():
    """Action.intent oneOf [VM ActionIntent, ^x-pattern] per VM §6.1."""
    schema = load_schema()
    intent = schema["$defs"]["ActionIntent"]
    assert "oneOf" in intent, "ActionIntent MUST allow VM enum OR x- extension"
    has_vm_ref = any(b.get("$ref", "").endswith("ActionIntent") for b in intent["oneOf"])
    has_x_pattern = any(b.get("pattern") == "^x-" for b in intent["oneOf"])
    assert has_vm_ref, "ActionIntent oneOf MUST include $ref to VM ActionIntent"
    assert has_x_pattern, "ActionIntent oneOf MUST include ^x- extension pattern"


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
    terminal: str  # completed | failed | deferred | blocked
    effect_trace: List[EffectOutcome] = field(default_factory=list)
    validation_report: Optional[Dict[str, Any]] = None
    persistence: str = "none"
    response_status_after: str = "in-progress"
    replay_token: Optional[str] = None
    blocked_cause: Optional[str] = None  # "precondition" | "validation" when terminal == "blocked"
    blocked_precondition_id: Optional[str] = None
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
            if p["severity"] == "block":
                return InvocationResult(
                    terminal="blocked",
                    effect_trace=[EffectOutcome(type=e["type"], status="not-invoked") for e in action["effects"]],
                    blocked_cause="precondition",
                    blocked_precondition_id=p["id"],
                )
            return InvocationResult(
                terminal="deferred",
                effect_trace=[EffectOutcome(type=e["type"], status="not-invoked") for e in action["effects"]],
                replay_token="opaque-" + action_id,
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
        # Per VM §5.2: blocked complete-response action terminates with persistence "none";
        # Response data unchanged, status remains in-progress, zero effects invoked.
        # No auto-demote to draft-checkpoint — the §6.3 predicate forbids the
        # combination block-on-error + draft-checkpoint, so this branch only fires
        # for complete-response actions.
        return InvocationResult(
            terminal="blocked",
            effect_trace=[EffectOutcome(type=e["type"], status="not-invoked") for e in action["effects"]],
            validation_report=report,
            persistence="none",
            response_status_after="in-progress",
            blocked_cause="validation",
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
            # Harness produces a deterministic sha256:<hex> handle per §6.6 by
            # hashing a canonical byte encoding of (action_id, idx, e["type"]).
            # Production runtimes hash the actual artifact bytes.
            import hashlib
            digest = hashlib.sha256(f"{action_id}/{idx}/{e['type']}".encode("utf-8")).hexdigest()
            outcome = EffectOutcome(type=e["type"], status="succeeded", idempotency_key=key, outcome_ref=f"sha256:{digest}")
            trace.append(outcome)
            if key:
                replay_store[key] = outcome
        elif sim_eff == "failed":
            on_err = e.get("onError", "defer" if e["type"] == "evidenceRequest" else "fail")
            trace.append(EffectOutcome(type=e["type"], status="failed", idempotency_key=key))
            for rest_idx in range(idx + 1, len(action["effects"])):
                trace.append(EffectOutcome(type=action["effects"][rest_idx]["type"], status="not-invoked"))
            if on_err == "fail":
                # Halt — record action.failed but no rollback.
                return InvocationResult(terminal="failed", effect_trace=trace, validation_report=report)
            if on_err == "defer":
                return InvocationResult(terminal="deferred", effect_trace=trace, validation_report=report, replay_token="opaque-defer-" + action_id)
            # No `continue` branch — schema enum is {fail, defer} only (§6.2).
            raise AssertionError(f"unreachable onError value: {on_err}")
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
                       if p.name not in ("definition-base.json", "master-action-shapes.json"))


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
    """Cross-spec Intake Handoff seam (§6.9) — actually invoke the harness
    against the fixture and assert the produced tuple matches expectations.

    Earlier drafts of this test only read the expected block from the
    fixture; that was self-certification (the fixture asserted itself).
    This version runs invoke() against the responseActions document and
    verifies the harness produces:
      - a non-empty effect trace (mapping + ledger + handoff effects ran)
      - the declared ledger event kinds (response.submit-attempted,
        response.completed) and only those — no case.* family
      - a content-addressable outcomeRef per §6.6 for the handoff
        assembly effect
      - terminal `completed`
    The workflow-host outcome (accepted/rejected/deferred) lives in the
    expected block because the harness does not simulate the WOS host;
    Cross-Spec conformance per §1.4 names that as the seam externalized
    via the workflow host, not produced by the Formspec runtime.
    """
    fx = json.loads((FIXTURE_DIR / "cross-spec-intake-handoff-seam.json").read_text())
    result = invoke(fx)
    expected_tuple = fx["expected"]["crossSpecTuple"]

    # Terminal: cross-spec fixture asserts the success path.
    assert result.terminal == "completed", f"got terminal {result.terminal}"

    # Effect trace is non-empty and orderly per declared array.
    declared_types = [e["type"] for e in fx["responseActions"]["actions"][0]["effects"]]
    observed_types = [o.type for o in result.effect_trace]
    assert observed_types == declared_types, (
        f"effect trace order diverges: declared={declared_types}, "
        f"observed={observed_types}"
    )
    assert all(o.status in {"succeeded", "replayed"} for o in result.effect_trace), (
        f"non-success status in cross-spec fixture: "
        f"{[(o.type, o.status) for o in result.effect_trace]}"
    )

    # Ledger event kinds: only published Ledger §8 / §8.5 kinds appear.
    ledger_kinds = [
        e["eventKind"]
        for e in fx["responseActions"]["actions"][0]["effects"]
        if e["type"] == "ledgerAppend"
    ]
    forbidden_kinds = {k for k in ledger_kinds if k.startswith("case.")}
    assert not forbidden_kinds, f"case.* family forbidden: {forbidden_kinds}"

    # outcomeRef on handoffAssembly is sha256-shaped per §6.6.
    handoff_outcomes = [o for o in result.effect_trace if o.type == "handoffAssembly"]
    assert handoff_outcomes, "fixture MUST include a handoffAssembly effect"
    for o in handoff_outcomes:
        assert o.outcome_ref is not None and o.outcome_ref.startswith("sha256:"), (
            f"handoffAssembly outcomeRef MUST be sha256:<hex>; got {o.outcome_ref}"
        )
        assert len(o.outcome_ref) == len("sha256:") + 64, (
            f"sha256 hex MUST be 64 chars; got len={len(o.outcome_ref)}"
        )

    # Workflow-host outcome lives in expected (externalized).
    assert expected_tuple["workflowHostOutcome"] in {"accepted", "rejected", "deferred"}

    # Prohibitions: zero case.* events emitted by Formspec.
    assert result.case_created_event_emitted is False
    assert result.case_lifecycle_events_emitted == []
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

## Task 18: (removed)

The SubmitButton default-action pytest is no longer needed. The Component Action References precondition plan renames `SubmitButton` → `ActionButton` and makes `actionRef` required; the legacy VM §7.1 fallthrough path no longer exists. ActionButton's binding contract is pinned by `tests/conformance/spec/test_actionbutton_binding.py` (created by [the Component Action References plan](2026-05-22-component-action-references.md) Task 8). No equivalent test belongs in this plan.

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

- [ ] **Step 2: experience-spec.md §6.3 — defer to Plan E**

Plan E (Component Action References) rewrites EXP §6.3 to make `ActionRef` resolution mandatory (no free-string fallback; loading a Response Actions document is required whenever Experience contains any `ActionRef`). This plan does NOT modify EXP §6.3 further.

Update the EXP front-matter reference list to include `specs/response-actions/response-actions-spec.md` (the only EXP edit by this plan).

- [ ] **Step 3: component-spec.md cross-reference**

**No edit by this plan.** Plan E (Component Action References) rewrites Component §5.19 as `ActionButton` with required `actionRef` and already documents the resolution path against this Response Actions spec. This plan does not add further cross-references — the ActionButton spec text Plan E lands is sufficient.

Skip this step.

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
cd formspec && python3 -m pytest tests/conformance/schemas/test_response_actions_schema.py tests/conformance/spec/test_response_actions_runtime.py -v
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
  - [ ] Invocation state — encoded in §7. Four terminals enumerated (`completed`, `failed`, `deferred`, `blocked` with `cause` discriminator).
  - [ ] Preconditions — encoded in §4 with FEL host-binding catalog declared per FEL §6.3.
  - [ ] Validation profile mapping — encoded in §5 citing VM; the resolved profile flows through the `ValidationProfileResolver` port to the engine (no spec dependency on engine internals).
  - [ ] Blocking policy — encoded in §5 citing VM.
  - [ ] Persistence policy — encoded in §5 citing VM §5.2.
  - [ ] Effect ordering — encoded in §6.3.
  - [ ] Failure / deferred outcomes — encoded in §8 / §9.
  - [ ] Idempotency posture — encoded in §6.5 (key frozen at first attempt; `@effects[*]` not in the idempotency-key catalog).
  - [ ] Outcome handle contract — encoded in §6.6 (`sha256:<lower-hex>`). Spec describes the abstract handle shape; concrete digest production is the runtime's responsibility behind that port. Trellis consumers verify against this contract without the spec depending on Trellis internals.
  - [ ] STOP IF: spec only defines JSON properties and leaves processors to invent behavior. **Mitigation:** the reference harness in `test_response_actions_runtime.py` proves the prose pins observable behavior.

- [ ] **Gate: Validation mapping (§9 row 3)** — already RESOLVED by VM.

- [ ] **Gate: Action-trigger binding (§9 row 4, post-Plan-E)**
  - [ ] `ActionButton.actionRef` resolution — encoded in §10.3 + Component §5.19 (owned by Plan E).
  - [ ] Unresolved `actionRef` produces inert widget + finding — pinned by `test_actionbutton_binding.py` (Plan E Task 8).
  - [ ] No document-level default-action field — §13 prohibition + schema closure.
  - [ ] Host event dispatch via Action `hostEvent` effect — §10.1, exercised by `effect-ordering.json` and `submit-application` example in §10.3.
  - [ ] Validation-summary behavior — preserved per Component §6.13 / VM §8 + Plan E Task 5 prose note (source: "submit" requires Action hostEvent declaration).
  - [ ] STOP IF: any legacy SubmitButton path survives. **Verified:** VM §7 deleted by Plan E; harness has no fallback function.

- [ ] **Gate: Intake Handoff seam (§9 row 6)**
  - [ ] Cross-spec fixture with Response, ValidationReport, Ledger evidence, Handoff, workflow-host outcome — `cross-spec-intake-handoff-seam.json`.
  - [ ] STOP IF: Formspec emits governed case lifecycle events. **Verified:** `test_cross_spec_seam_fixture_produces_tuple_without_case_created` asserts `caseCreatedEventEmitted == false`.

- [ ] **Concept §11.1 (peer vs overlay)** — RESOLVED in §1.5 with explicit promotion criteria.

- [ ] **Concept §11.3 (Component reference fields)** — RESOLVED via Plan E (ActionButton with required `actionRef`).

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
- Concept §6.6 SubmitButton compatibility: closed by Plan E (rename to ActionButton + actionRef required + VM §7 deleted); §10.3 describes the post-Plan-E binding contract.
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
Tasks 4-11: spec prose (§1 → §13)
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

- **Adding `defaultSubmitActionRef` to the Response Actions document.** Dropped from this plan (split-brain risk across renderers). Named-action attachment is now via `ActionButton.actionRef` (Plan E).
- **Adding a `case.created` ledger event.** Forbidden (concept §6.9). The cross-spec fixture asserts its absence.
- **Inventing ledger event kinds.** All `eventKind` values come from the Respondent Ledger taxonomy (Ledger §8 published kinds + §8.5 action lifecycle kinds). If a new kind feels needed, file a Ledger spec amendment plan; do not invent kinds here.
- **Inventing FEL host bindings.** All `@name` context references come from §4.2's catalog. If a new binding feels needed, add it to the catalog in §4.2 and verify it doesn't collide with FEL §6.1 grammar-built-ins.
- **Reaching into Core engine internals from the spec.** §5.3 cites the `getValidationReport({ profile })` port; the spec does NOT describe trigger names, internal `_produceReport`, or Rust-side eval details. Engine internals are the engine's concern; the spec depends only on the port shape.
- **Reaching into Trellis internals from the spec.** §6.6's `sha256:<lower-hex>` handle shape is content-addressable in the abstract; Trellis envelope binding is one consumer pattern, not a dependency. A non-Trellis consumer reads the same handle the same way.
- **Defining a compensation framework when the no-rollback rule feels uncomfortable.** Concept §6.4 forbids fictional rollback; compensation is a future concern with no current consumer.
- **Inventing parallel validation vocabulary because "live" vs "continuous" feels ambiguous.** VM owns the profile names; the engine owns the trigger names. The `ValidationProfileResolver` port is the bridge; do not collapse the vocabularies.
- **Allowing `Action.effects` to be empty.** Schema requires `minItems: 1`. An Action with no effects has no observable consequence and is meaningless; if the use case is "validation pass only," set `intent: review` and add a single `hostEvent` for the UI signal.
- **Including `@effects[*]` in `idempotencyKey` FEL expressions.** Forbidden per §6.5: keys MUST be deterministic from the invocation snapshot, not from prior outcomes. The FEL §6.3 evaluator rejects the unbound `@effects` reference at idempotency-key evaluation time.
- **Specifying a replay-token wire contract.** §9 is explicit out-of-scope; processor-defined.
- **Extracting the reference harness into a production engine package.** Out of scope; do it only if a production engine demands a shared invocation library.

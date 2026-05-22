---
title: SubmitButton Compatibility + Component Reference Additions Spec Implementation Plan
date: 2026-05-22
status: superseded
superseded-by: thoughts/plans/2026-05-22-component-action-references.md
owner: spec-author
related:
  - thoughts/specs/2026-05-20-formspec-semantic-layers.md
  - specs/component/component-spec.md
  - specs/experience/experience-spec.md
  - specs/response-actions/response-actions-spec.md
  - specs/core/validation-mapping.md
  - thoughts/plans/2026-05-22-response-actions-spec.md
  - thoughts/plans/2026-05-22-component-action-references.md
---

> **SUPERSEDED 2026-05-22.** This plan's load-bearing rule — the three-way SubmitButton precedence (`actionRef` > `defaultSubmitActionRef` > VM §7.1 unnamed default) — depended on `defaultSubmitActionRef`, which was dropped during the Response Actions reshape (split-brain risk across renderers). The replacement plan, **[Component Action References (Plan E)](2026-05-22-component-action-references.md)**, takes a more aggressive refactor: rename `SubmitButton` → `ActionButton`, make `actionRef` required, delete VM §7 entirely. No precedence resolution needed — every action-triggering widget has exactly one `actionRef`.
>
> What carries forward into [Plan E](2026-05-22-component-action-references.md):
> - The intent of closing §9 row-4 and concept §10.4.
> - The cross-document resolution pattern (ActionRef → Action by id).
> - The `COMP-REFERENTIAL-INTEGRITY` finding code (carried into Plan E §5.19.4.2).
> - Resolver invariants — deterministic, no-mutation, no silent fallback, one-directional (Plan E §5.19.4.1).
> - Named-amendment extension pattern for future trigger widgets (Plan E §5.19.1.1).
> - Schema-level enforcement that `actionRef` is trigger-bound (Plan E pytest covers this).
>
> What carries forward into the [Component Reference Fields follow-up](2026-05-22-component-reference-fields.md):
> - `unitRef` / `taskRefs` / `conceptRefs` / `x-generation` field definitions + shapes.
> - Full cross-document resolver algorithm (`ResolutionContext`, `ResolutionReport`, annotation map).
> - `COMP-REFERENTIAL-INTEGRITY` severity ladder for unitRef/taskRefs/conceptRefs/x-generation kinds.
> - `x-generation.anchors` shape as regeneration-merge seed.
> - Additive schema-versioning pattern (`$formspecComponent` const → enum broadening).
> - No-rewrite regression test (every pre-existing Component fixture against the amended schema).
> - Concept §11.3 full resolution.
>
> What is dropped from this plan entirely:
> - The three-way SubmitButton precedence rule (collapsed to one-way: `actionRef` required, no fallback — see Plan E §5.19.1).
> - The "zero migration cost" framing for SubmitButton (Plan E renames SubmitButton → ActionButton, breaking compat by design).
> - VM §7 cross-references (VM §7 is deleted by Plan E).
> - `defaultSubmitActionRef` (dropped during Response Actions reshape; split-brain risk).
>
> Do NOT execute this plan. Execute Plan E first; then the follow-up.

---

# SubmitButton Compatibility + Component Reference Additions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land a normative **Component References** companion under `specs/component/` — prose, schema delta to `component.schema.json`, fixtures, pytest — that adds five reference fields (`unitRef`, `taskRefs`, `actionRef`, `conceptRefs`, `x-generation`) to the Component schema, defines cross-document resolution semantics against Experience and Response Actions, pins the SubmitButton resolution precedence rule (per-node `actionRef` > `defaultSubmitActionRef` > VM §7.1 unnamed default), and proves zero migration cost for existing Component documents. Closes the §9 row-4 promotion gate ("SubmitButton compatibility") fully and concept §10.4. Resolves concept §11.3 by promoting the named reference fields from "future shape" to current Component schema.

**Architecture:** New normative document at `specs/component/component-references-spec.md` (sibling to `component-spec.md`). **First non-additive schema change** in the semantic-layers family — `schemas/component.schema.json` gains four ref fields on `ComponentBase` (so every component inherits them via the existing `$ref` chain) plus `actionRef` on `SubmitButton` only (trigger-bound per concept §6.7). All additions are OPTIONAL; backward compatibility is preserved by JSON Schema construction (no required fields added; no enum closures tightened; `unevaluatedProperties: false` on concrete types continues to evaluate the new fields through the `$ref`+`allOf` chain). New shape `$defs.ResolvedReference` documents the cross-document resolution algorithm. Reuses `ItemRef` and `ConceptRef` shapes from `experience.schema.json` via cross-schema `$ref` (same pattern Response Actions uses to cite `validation-mapping.schema.json`). `x-generation` is metadata-only; runtime processors MUST ignore it (same posture as Mapping projection hints). The SubmitButton resolution precedence pins the §9 row-4 stop condition ("existing Component documents need rewrites") — every fixture proves no-rewrite compatibility.

**Tech Stack:** Markdown (W3C-style, BCP-14), JSON Schema 2020-12, `npm run docs:generate` / `docs:check` pipeline (`generate-spec-artifacts.mjs`), Python pytest under `tests/conformance/`.

**Sequencing:** prose contract first → schema delta to ComponentBase + SubmitButton → fixtures pin (a) every new field's resolution path, (b) the SubmitButton three-way precedence, (c) the no-rewrite regression claim across every existing component fixture → pytest pins the cross-doc resolver and the regression. Per [concept §10 closing line](../specs/2026-05-20-formspec-semantic-layers.md#10-follow-on-spec-order), schemas MUST NOT hide unresolved decisions — the §6.7 ownership boundary ("references do not let Component override Definition / Experience / Response Actions") is enforced by the resolver semantics, not by hopeful prose.

**Citations** in this plan refer to the concept note (`thoughts/specs/2026-05-20-formspec-semantic-layers.md`) unless prefixed. `VM §` = `specs/core/validation-mapping.md`. `RA §` = `specs/response-actions/response-actions-spec.md`. `EXP §` = `specs/experience/experience-spec.md`. `COMP §` = `specs/component/component-spec.md`.

**Hard precondition.** This plan REQUIRES the Response Actions companion spec to have landed (see [`thoughts/plans/2026-05-22-response-actions-spec.md`](2026-05-22-response-actions-spec.md)). Specifically:

- `schemas/response-actions.schema.json` MUST exist — the Component References fixtures validate `response-actions-base.json` against it.
- `specs/response-actions/response-actions-spec.md` MUST be landed — this plan cites RA §3 (Action Identity), §7 (Invocation State Machine), §10.3 (Default Submit Action), §14.4 (Future actionRef on Component) and edits some of those sections.
- `defaultSubmitActionRef` MUST be defined in the Response Actions schema — the SubmitButton precedence rule §9.1 cites it.

If the Response Actions plan has not executed: STOP and execute it first. Plan tasks here will fail at fixture validation (Task 12) and reference editing (Task 21).

---

## File Structure

### Created

| Path | Responsibility |
|---|---|
| `specs/component/component-references-spec.md` | Canonical prose. W3C-style, BCP-14 normative language. |
| `specs/component/component-references-spec.bluf.md` | BLUF source (3–5 falsifiable bullets). |
| `specs/component/component-references-spec.llm.md` | Generated LLM artifact. **Never hand-edited.** |
| `tests/conformance/schemas/test_component_references_schema.py` | Schema-shape pytest. Pins `ComponentBase` field shape, `SubmitButton.actionRef` trigger-binding, OPTIONAL-everywhere invariant, no-tightening invariant on existing enums and required arrays, cross-schema `$ref` validity to `experience.schema.json`. |
| `tests/conformance/spec/test_component_reference_resolution.py` | Cross-document resolver pytest. Validates fixture Component+Experience+ResponseActions tuples; asserts each unresolved reference produces `COMP-REFERENTIAL-INTEGRITY` finding at the right severity; asserts coverage queries (which units render which items) work end-to-end. |
| `tests/conformance/spec/test_component_submitbutton_precedence.py` | SubmitButton three-way precedence pytest. Three scenarios: (a) node-level `actionRef` wins; (b) no node-level, document-level `defaultSubmitActionRef` wins; (c) neither set, falls back to VM §7.1 unnamed default. Includes mixed-button fixture (two SubmitButtons in one tree, only one with `actionRef`). |
| `tests/conformance/spec/test_component_no_rewrite_regression.py` | The "zero migration" claim. Loads every pre-existing Component fixture in the repo (`tests/conformance/fixtures/component/**/*.json` plus any in `tests/e2e/fixtures/`), validates each against the **new** schema. Every fixture MUST pass without modification. One failure = the additive invariant is broken. |
| `tests/conformance/fixtures/component-references/definition-base.json` | Shared Definition. Same shape family as `response-actions/definition-base.json` to enable cross-fixture composition. |
| `tests/conformance/fixtures/component-references/experience-base.json` | Shared Experience document. One actor, two tasks, three units. Units include taskRefs and itemRefs so cross-resolution has real targets. |
| `tests/conformance/fixtures/component-references/response-actions-base.json` | Shared Response Actions document. Two actions (`submitApplication`, `saveProgress`); `defaultSubmitActionRef: "submitApplication"`. |
| `tests/conformance/fixtures/component-references/component-no-refs.json` | A Component document using ZERO new fields. The negative case for the additive invariant — validation MUST succeed against the new schema. |
| `tests/conformance/fixtures/component-references/component-all-refs-resolved.json` | Component with `unitRef`, `taskRefs`, `actionRef`, `conceptRefs`, `x-generation` on appropriate nodes. All references resolve against the base Experience and Response Actions. Expected: zero findings. |
| `tests/conformance/fixtures/component-references/component-unit-ref-unresolved.json` | Component with `unitRef: "nonexistentUnit"`. Expected: one `COMP-REFERENTIAL-INTEGRITY` finding (severity `error`) naming the missing unit. |
| `tests/conformance/fixtures/component-references/component-action-ref-unresolved.json` | SubmitButton with `actionRef: "nonexistentAction"`. Expected: one `COMP-REFERENTIAL-INTEGRITY` finding (severity `error`) naming the missing action. Per §9 of the new spec, an unresolved `actionRef` MUST NOT silently fall back to the default. |
| `tests/conformance/fixtures/component-references/component-task-refs-unresolved.json` | Component with `taskRefs: ["nonexistentTask"]`. Expected: one finding (severity `warning` — task references are advisory; coverage failures are warnings, not errors). |
| `tests/conformance/fixtures/component-references/component-concept-refs-unresolved.json` | Component with `conceptRefs` pointing at a Registry concept not in the document's registry view. Expected: one finding (severity `info` — concept references are informational unless the host enables strict mode). |
| `tests/conformance/fixtures/component-references/submitbutton-precedence-node-action-wins.json` | SubmitButton with `actionRef: "submitApplication"`. Document-level `defaultSubmitActionRef: "saveProgress"`. Expected: clicking the button invokes `submitApplication` (the node-level ref wins per §9.1 precedence). |
| `tests/conformance/fixtures/component-references/submitbutton-precedence-default-ref-wins.json` | SubmitButton with NO `actionRef`. Document-level `defaultSubmitActionRef: "submitApplication"`. Expected: clicking invokes `submitApplication`. |
| `tests/conformance/fixtures/component-references/submitbutton-precedence-unnamed-fallback.json` | SubmitButton with NO `actionRef`. Response Actions document absent (or present without `defaultSubmitActionRef`). Expected: clicking invokes the unnamed VM §7.1 default — gating only, no extra effects. |
| `tests/conformance/fixtures/component-references/submitbutton-mixed-buttons.json` | Component tree with TWO SubmitButtons: one with `actionRef: "submitApplication"`, one without. Document has `defaultSubmitActionRef: "saveProgress"`. Expected: first button → `submitApplication`; second button → `saveProgress`. Proves disambiguation under mixed authoring. |
| `tests/conformance/fixtures/component-references/x-generation-anchors-coverage.json` | Component with `x-generation.anchors` listing item/unit/action handles. Expected: every anchor resolves against the base artifacts; coverage query returns 100%. This fixture seeds the regeneration merge spec (concept §10.5) without specifying merge behavior. |

### Modified

| Path | Why |
|---|---|
| `schemas/component.schema.json` | **First load-bearing schema modification in the semantic-layers family.** Add four OPTIONAL fields to `ComponentBase`: `unitRef`, `taskRefs`, `conceptRefs`, `x-generation`. Add OPTIONAL `actionRef` to `SubmitButton.properties` only. No existing field changes; no required additions; no enum closures tightened. Schema `$id` version bumped to `1.1` (additive minor). |
| `specs/component/component-spec.md` | Append §11 "Cross-References" section that points to the new spec, plus a footer note on §5.19 SubmitButton describing the resolution precedence. **Append-only.** Existing component prop tables unchanged. |
| `specs/component/component-spec.bluf.md` | Add one bullet to the BLUF describing the new reference fields and the no-migration claim. |
| `specs/core/validation-mapping.md` | Update §7.3 ("Future `actionRef` Compatibility") to point to the now-landed Component References spec. **One-paragraph append.** Master table and §7.1 default rule unchanged. |
| `specs/response-actions/response-actions-spec.md` | Update §14.4 ("Future `actionRef` on Component") to point to the now-landed spec and remove the "future shape" caveat. Update §10.3 with a back-reference to the new spec's precedence section. |
| `specs/experience/experience-spec.md` | Update §6.3 `ActionRef` and the description on `Unit.id` to remove the "forthcoming" wording about Component-side resolution. **Two-line edits.** |
| `thoughts/specs/2026-05-20-formspec-semantic-layers.md` | Mark §10.4 landed (with link); update §5.5 ("Mark Future Shape Clearly") to note the four fields have promoted; mark §11.3 resolved (with link). **Three-block edits.** |
| `scripts/spec-artifacts.config.json` | Add the Component References spec/schema/BLUF/LLM row so `npm run docs:generate` materializes `component-references-spec.llm.md`. The schema for this row is `component.schema.json` (the spec amends an existing schema). |
| `filemap.json` | Regenerated by `npm run docs:filemap`. **Generated — never hand-edit.** |
| `../TODO-STACK.md` | Update the row for §10.4 to "landed (draft)" with pointer to this plan and the new spec. **One-line edit.** |

### Explicitly NOT in scope

- **Regeneration merge semantics** — concept §10.5, separate plan. This spec defines `x-generation.anchors` *shape* so that future spec has a target; it does NOT define how merges resolve conflicts, which edits survive, which nodes orphan, or how Studio displays diffs.
- **Trace** — concept §10.6, separate plan. `x-generation.anchors` is structurally similar to what Trace will consume but is NOT a Trace artifact.
- **New trigger components beyond `SubmitButton`**. A future spec MAY add `actionRef` to a generic `Button` component or a custom trigger; this plan adds it only to `SubmitButton` because that is the only current trigger node. The extension pattern is documented in the new spec §11.
- **Cross-schema validation of registry concepts**. `conceptRefs` references the Registry/Ontology by handle; deep validation against actual registry content is host policy, not Component spec behavior. The fixture for unresolved conceptRefs emits `info`, not `error`, to preserve this.
- **Definition / Response / ValidationReport / Mapping / Intake Handoff / Respondent Ledger schema changes**. None.
- **Removal of the existing `formspec-submit` event behavior, `mode` prop on SubmitButton, or any current Component prop**. Backward compatibility is the closure condition for §9 row 4.

---

## Self-Review Note

**Concept-note coverage:**

- §3 anchors (Component `SubmitButton`, Component `ValidationSummary`, Locale ownership) — preserved. SubmitButton continues to honor `mode`, `emitEvent`, `pendingLabel`, `disableWhenPending`. ValidationSummary unchanged. Locale ownership unchanged; the new spec defines no string fields.
- §5.5 ("Mark Future Shape Clearly") — addressed by updating the concept-note caveat to record the promotion of these four fields.
- §6.6 (SubmitButton compatibility, default submit action rule) — fully closed. §9.1 of the new spec pins the three-way precedence; `test_component_submitbutton_precedence.py` proves it; `submitbutton-precedence-*.json` fixtures cover every branch.
- §6.7 (Component owns the concrete UI tree; future reference additions; references do NOT let Component override Definition / Experience / Response Actions) — pinned. The resolver semantics in §8 of the new spec enforce that resolution is one-directional: Component reads from Experience and Response Actions; it cannot mutate them.
- §7.3 (future-shape example) — the example becomes a valid current-schema example after this spec lands. The new spec's §3–§7 inline a current-compatible version of the example.
- §9 row 4 ("SubmitButton compatibility") promotion gate — fully closed: default submit action rule (§9.1), `actionRef` migration story (§10 zero-migration), current event/API compatibility (§9 + §10.1), examples (all fixtures), adapters (§10.2 — no adapter changes), validation-summary behavior (§10.3 — preserved). Stop condition ("existing Component documents need rewrites") is verified by `test_component_no_rewrite_regression.py` loading every pre-existing fixture and validating it against the new schema unchanged.
- §11.3 (Component reference fields) — RESOLVED in §1.5 by promoting the fields from "future" to "current" Component schema.
- §11.5 (bundle manifest) — explicitly out of scope; cross-referenced as a follow-on concern.

**Out-of-scope confirmation:** no Definition / Response / ValidationReport / Mapping / Intake Handoff / Respondent Ledger / Experience / Response Actions / Locale schema changes. The only schema change is to `component.schema.json`, and that change is additive and OPTIONAL across the board. Trace and regeneration merge are explicitly deferred.

**Additivity invariant — how it is enforced, not just claimed:**

1. Every new field on `ComponentBase` is OPTIONAL (not in `required`).
2. `SubmitButton.actionRef` is OPTIONAL.
3. No existing field's type, required-set, enum, or pattern is modified.
4. `ComponentBase` has no `unevaluatedProperties: false` (only concrete types do); the new fields propagate through the `$ref`+`allOf` chain to every component, and concrete-type `unevaluatedProperties: false` continues to permit them because they are now schema-known.
5. `test_component_no_rewrite_regression.py` validates every existing fixture against the new schema. The test passes IFF the invariant holds.

**Cross-document resolution boundary:**

The resolver reads three documents (Component + optional Experience + optional Response Actions) and emits findings. It does NOT:

- mutate any input document,
- write to Definition, Response, ValidationReport, or any other spec's artifact,
- author Ledger events,
- emit `case.created` (this spec does not deal with handoff or cases),
- override Definition behavior or Experience coverage.

---

## Task 1: Scaffold spec files

**Files:**
- Create: `specs/component/component-references-spec.md`
- Create: `specs/component/component-references-spec.bluf.md`

- [ ] **Step 1: Create stub files**

```bash
cd formspec && touch specs/component/component-references-spec.md specs/component/component-references-spec.bluf.md
```

- [ ] **Step 2: Verify sibling parity with existing component spec**

```bash
ls formspec/specs/component/
```

Expected: `component-spec.{md,bluf.md,llm.md,semantic.md}` and new `component-references-spec.{md,bluf.md}`.

- [ ] **Step 3: Commit scaffolding**

```bash
cd formspec && git add specs/component/component-references-spec.md specs/component/component-references-spec.bluf.md
git commit -m "feat(spec): scaffold component-references companion spec"
```

---

## Task 2: Draft BLUF source

**Files:**
- Modify: `specs/component/component-references-spec.bluf.md`

- [ ] **Step 1: Write BLUF**

Replace the empty stub with:

```markdown
# Component References — BLUF

- Five OPTIONAL reference fields land on the Component schema: `unitRef` and `taskRefs` (resolve against Experience); `actionRef` on SubmitButton (resolves against Response Actions); `conceptRefs` (resolve against Registry / Ontology); `x-generation` (metadata-only generation provenance, runtime processors MUST ignore).
- SubmitButton resolution precedence is pinned: node-level `actionRef` > Response Actions document `defaultSubmitActionRef` > VM §7.1 unnamed default. An unresolved `actionRef` MUST emit `COMP-REFERENTIAL-INTEGRITY` (severity `error`) and MUST NOT silently fall back.
- Zero migration. Every pre-existing Component document validates unchanged against the new schema. The additivity invariant is enforced by `test_component_no_rewrite_regression.py` over every fixture in the repository.
- Cross-document resolution is one-directional. Component nodes READ from Experience and Response Actions; they MUST NOT mutate either artifact, override Definition behavior, or break the §6.7 ownership boundary.
- `x-generation.anchors` is the structural seed for the regeneration merge spec (concept §10.5). This spec defines its shape; it does NOT define merge semantics, conflict resolution, or orphan handling.
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add specs/component/component-references-spec.bluf.md
git commit -m "feat(spec): draft component-references BLUF (5 falsifiable bullets)"
```

---

## Task 3: Wire spec into doc pipeline

**Files:**
- Modify: `scripts/spec-artifacts.config.json`

- [ ] **Step 1: Add the spec row**

Insert this entry into the `specs` array, immediately after the response-actions row:

```json
{
  "spec": "specs/component/component-references-spec.md",
  "schema": "schemas/component.schema.json",
  "bluf": "specs/component/component-references-spec.bluf.md",
  "llm": "specs/component/component-references-spec.llm.md",
  "behaviorEssentials": [
    "Component nodes MAY carry OPTIONAL reference fields (unitRef, taskRefs, conceptRefs, x-generation) and SubmitButton MAY carry OPTIONAL actionRef. All references are advisory; runtime renderers SHOULD continue to render regardless of resolution status.",
    "SubmitButton click resolution follows a strict three-way precedence: node-level actionRef > Response Actions document defaultSubmitActionRef > VM §7.1 unnamed default. Unresolved actionRef MUST emit COMP-REFERENTIAL-INTEGRITY (error) and MUST NOT silently fall back.",
    "Cross-document resolution is one-directional. The resolver reads Component + optional Experience + optional Response Actions and emits findings; it MUST NOT mutate any input artifact.",
    "x-generation is runtime-ignored metadata. Renderers MUST NOT change rendering based on its content; static analysis tools and the future regeneration merge spec consume it."
  ],
  "conformanceEssentials": [
    "Every pre-existing Component document MUST validate unchanged against the amended schema; the additive invariant is the gate for landing.",
    "Resolvers MUST emit COMP-REFERENTIAL-INTEGRITY (error) for unresolved unitRef and actionRef; (warning) for unresolved taskRefs; (info) for unresolved conceptRefs.",
    "actionRef MUST appear only on SubmitButton (and future trigger nodes added by named spec amendments). Processors MUST reject Component documents that place actionRef on non-trigger nodes."
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
git commit -m "build(docs): register component-references in spec-artifacts pipeline"
```

---

## Task 4: Draft spec front matter, §1 Introduction, §1.5 promotion resolution

**Files:**
- Modify: `specs/component/component-references-spec.md`

- [ ] **Step 1: Write front matter and §1**

Write the file (replace stub contents):

```markdown
# Formspec Component References

**Version:** 1.0 (draft)
**Status:** Draft normative companion. Published 2026-05-22.
**Editors:** Formspec working group.
**Schema:** `schemas/component.schema.json` ($id: `https://formspec.org/schemas/component/1.1`) — additive minor version bump.
**BLUF:** `component-references-spec.bluf.md`.

<!-- bluf:start -->
<!-- bluf:end -->

## Status of This Document

This is a **draft normative companion** to [Formspec Component](component-spec.md) that adds five OPTIONAL reference fields and pins SubmitButton resolution precedence. It closes the §9 row-4 promotion gate ("SubmitButton compatibility") of [Formspec Semantic Layers](../../thoughts/specs/2026-05-20-formspec-semantic-layers.md) and resolves concept §11.3 by promoting the named reference fields from "future shape" to current Component schema.

This document MUST NOT introduce behavior into Component beyond reference recording and resolution. Runtime rendering rules remain owned by [Component](component-spec.md). Validation owned by [Core](../core/spec.md). Action semantics owned by [Response Actions](../response-actions/response-actions-spec.md).

## Conventions and Terminology

BCP-14 normative terms (MUST, MUST NOT, SHOULD, MAY) appear in capitals. "Concept §" refers to the Semantic Layers concept note. "VM §" refers to `specs/core/validation-mapping.md`. "RA §" refers to `specs/response-actions/response-actions-spec.md`. "EXP §" refers to `specs/experience/experience-spec.md`. "COMP §" refers to `specs/component/component-spec.md`.

A **reference field** is one of the five new fields defined here. A **resolution context** is a tuple of three documents — the Component document under inspection, an optional Experience document, and an optional Response Actions document — supplied to the resolver in §8. A **finding** is a `COMP-REFERENTIAL-INTEGRITY` record emitted by the resolver, with severity `error` / `warning` / `info` per §8.4.

## Bottom Line Up Front

<!-- Hand-author a 3-5 bullet BLUF here; the generator replaces this section from bluf.md. -->

## 1. Introduction

### 1.1 Purpose and Scope

This document amends `schemas/component.schema.json` to add OPTIONAL reference fields to Component nodes and pins the SubmitButton resolution precedence rule that has been in concept-only form since [VM §7.3](../core/validation-mapping.md#73-future-actionref-compatibility) and [RA §14.4](../response-actions/response-actions-spec.md#144-future-actionref-on-component) landed.

**In scope:**

1. Adding four OPTIONAL fields to `ComponentBase` (so they propagate to every component): `unitRef`, `taskRefs`, `conceptRefs`, `x-generation`.
2. Adding OPTIONAL `actionRef` to `SubmitButton` (trigger-bound).
3. The cross-document reference resolution algorithm.
4. The SubmitButton three-way precedence rule.
5. The `COMP-REFERENTIAL-INTEGRITY` finding kind with closed severity mapping.
6. The zero-migration claim and its enforcement test.

**Out of scope:** regeneration merge semantics (concept §10.5, separate spec); Trace (concept §10.6, separate spec); new trigger components beyond `SubmitButton`; deep validation of Registry/Ontology concept content; any modification to Definition, Response, ValidationReport, Mapping, Intake Handoff, Respondent Ledger, Experience, Response Actions, or Locale schemas.

### 1.2 Relationship to Existing Specifications

- **[Component](component-spec.md)**: this spec amends Component's JSON Schema additively. Component prose remains the source of truth for widget shape, layout, and runtime rendering rules.
- **[Experience](../experience/experience-spec.md)**: `unitRef` resolves against `experience.units[*].id`; `taskRefs` resolves against `experience.tasks[*].id`. The new spec reuses `ItemRef` and `ConceptRef` $defs from `experience.schema.json` via cross-schema `$ref`.
- **[Response Actions](../response-actions/response-actions-spec.md)**: `actionRef` resolves against `responseActions.actions[*].id`. The three-way SubmitButton precedence cites `defaultSubmitActionRef` from RA §2.
- **[Validation Mapping](../core/validation-mapping.md)**: VM §7.1 owns the unnamed-default behavior at the bottom of the SubmitButton precedence ladder. This spec does NOT redefine that behavior; it pins the ladder above it.
- **[Definition](../core/spec.md)**: Definition is unchanged. The resolver does not read Definition; it reads only the three reference contexts above.

### 1.3 Design Principles

1. **Additive.** Every new field is OPTIONAL. Every existing fixture validates unchanged.
2. **Closed taxonomies.** `COMP-REFERENTIAL-INTEGRITY` severity is a closed enum (`error` / `warning` / `info`).
3. **Cross-document, one-directional.** The resolver reads three documents; it never mutates any of them.
4. **Cite, do not invent.** `ItemRef` / `ConceptRef` shapes cited from Experience. `defaultSubmitActionRef` cited from Response Actions. VM §7.1 cited for the unnamed default.
5. **Trigger-bound action references.** `actionRef` MUST appear only on `SubmitButton`. Future trigger nodes MUST be added by named amendments to this spec.
6. **Metadata-only x-generation.** Runtime processors MUST ignore `x-generation`. It exists for static-analysis tools and the future regeneration merge spec.

### 1.4 Conformance Levels

- **Core.** Document validates against the amended `component.schema.json`. New fields, when present, conform to their declared shapes.
- **Resolver.** A processor that reads the three-document context: implements §8 resolution; emits `COMP-REFERENTIAL-INTEGRITY` at the correct severity; respects the §9 SubmitButton precedence.
- **No-Rewrite.** Every pre-existing Component document validates unchanged. (Conformance is the regression test in §12.4.)

#### 1.4.1 Conformance Prohibitions

The following are MUST NOT requirements at all conformance levels:

- MUST NOT make any new field REQUIRED.
- MUST NOT modify any existing field's type, required-set, enum, or pattern in `component.schema.json`.
- MUST NOT cause any pre-existing Component fixture to fail validation against the amended schema.
- MUST NOT permit `actionRef` on non-trigger components.
- MUST NOT mutate the Experience or Response Actions documents during resolution.
- MUST NOT silently fall back from an unresolved `actionRef` to `defaultSubmitActionRef` or to the unnamed default. Unresolved `actionRef` is an `error`-severity finding.
- MUST NOT cause runtime renderers to change behavior based on `x-generation` content.

### 1.5 Promotion of Reference Fields (resolves concept §11.3)

Concept §11.3 said: "`unitRef`, `taskRefs`, `actionRef`, `conceptRefs`, and generation metadata should land only after Experience and Response Action identities are stable."

Both prerequisites have landed:

- Experience identities are stable per [EXP §3 / §4 / §5](../experience/experience-spec.md).
- Response Action identities are stable per [RA §3](../response-actions/response-actions-spec.md#3-action-identity).

This spec therefore promotes the five field names from "future shape" (concept §5.5) to current Component schema. Concept §5.5 will be updated to record the promotion; the listed fields are no longer future.
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add specs/component/component-references-spec.md
git commit -m "feat(spec): draft component-references §1 (intro, conformance, promotion of §11.3)"
```

---

## Task 5: Draft §2 unitRef, §3 taskRefs, §4 conceptRefs

**Files:**
- Modify: `specs/component/component-references-spec.md`

- [ ] **Step 1: Append §2–§4**

Append to the spec file:

```markdown
## 2. unitRef

### 2.1 Shape

`unitRef` is an OPTIONAL string property on any Component node. When present, it MUST be a value matching the Experience `Unit.id` pattern (camelCase, starting with a letter).

```json
{ "id": "identitySection", "component": "Section", "unitRef": "identity", "children": [ ... ] }
```

### 2.2 Resolution

When a resolution context includes an Experience document:

- The resolver MUST attempt to match `unitRef` against `experience.units[*].id`.
- If matched: the Component node is annotated `unit-resolved: true` in the resolver output.
- If not matched: the resolver MUST emit `COMP-REFERENTIAL-INTEGRITY` with severity `error`, `kind: "unitRef"`, and a payload identifying the offending node and the missing unit id.

When the resolution context does NOT include an Experience document: the resolver MUST emit `COMP-REFERENTIAL-INTEGRITY` with severity `info`, `kind: "unitRef"`, `reason: "no-experience-document"`. The presence of `unitRef` is not an error; it is informational data for a future resolution pass.

### 2.3 What unitRef Does NOT Do

- It MUST NOT affect rendering. A node with `unitRef: "foo"` renders identically to a node without it.
- It MUST NOT change Component validation, layout, or widget selection.
- It MUST NOT affect coverage from Experience's perspective. EXP §8 owns coverage; this spec only records the back-reference.

## 3. taskRefs

### 3.1 Shape

`taskRefs` is an OPTIONAL array of strings on any Component node. Each entry MUST match the Experience `Task.id` pattern (camelCase). The array MAY be empty (the array itself MAY be omitted; an explicit empty array is permitted but discouraged).

```json
{ "id": "identitySection", "component": "Section", "taskRefs": ["identifyApplicant", "verifyEligibility"] }
```

### 3.2 Resolution

For each entry in `taskRefs`:

- If a resolution context Experience document is present: resolver MUST attempt to match against `experience.tasks[*].id`. Unresolved entries emit `COMP-REFERENTIAL-INTEGRITY` (severity `warning`, `kind: "taskRefs"`). Task references are advisory; their failure does not block rendering, unlike `actionRef` which is load-bearing for SubmitButton click handling.
- If no Experience document is present: resolver MUST emit one `info` finding (`reason: "no-experience-document"`) per node carrying `taskRefs`. Do NOT emit one finding per entry; one per node.

### 3.3 What taskRefs Does NOT Do

Same constraints as §2.3 — record-only, no rendering effect, no Experience-side coverage mutation.

## 4. conceptRefs

### 4.1 Shape

`conceptRefs` is an OPTIONAL array of `ConceptRef` objects (cited from `experience.schema.json#/$defs/ConceptRef`). The shape is reused exactly — no local redefinition.

```json
{
  "id": "incomeQuestion",
  "component": "MoneyInput",
  "bind": "income.amount",
  "conceptRefs": [
    { "id": "uei:annualIncome", "system": "registry:income-2024" }
  ]
}
```

### 4.2 Resolution

`conceptRefs` resolution is host-policy. Hosts MAY:

- treat concept references as opaque metadata (no resolution attempted); or
- maintain a registry/ontology view and validate concepts against it; or
- emit `info` findings for unresolved concepts in strict mode.

The resolver in this spec MUST NOT attempt deep validation against arbitrary Registry/Ontology content. The default severity for unresolved `conceptRefs` is `info`. A host MAY configure a stricter severity via implementation profile; that configuration is host-defined and OUT OF SCOPE for this spec.

### 4.3 What conceptRefs Does NOT Do

- MUST NOT affect rendering, validation, or data shape.
- MUST NOT replace Item-level `bind` values. Component data binding is owned by Component / Definition; concept references are semantic metadata.
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add specs/component/component-references-spec.md
git commit -m "feat(spec): draft component-references §2-§4 (unitRef, taskRefs, conceptRefs)"
```

---

## Task 6: Draft §5 actionRef, §6 x-generation

**Files:**
- Modify: `specs/component/component-references-spec.md`

- [ ] **Step 1: Append §5–§6**

```markdown
## 5. actionRef

### 5.1 Shape and Placement

`actionRef` is an OPTIONAL string on **SubmitButton only**. When present, it MUST match the Response Actions `Action.id` pattern (camelCase, starting with a lowercase letter).

```json
{ "id": "submitApplication", "component": "SubmitButton", "label": "Submit", "actionRef": "submitApplication" }
```

The schema enforces placement: `actionRef` is declared only inside `SubmitButton.properties`. Adding `actionRef` to any other component is a schema-level violation (caught by `unevaluatedProperties: false` on each concrete type). Future trigger components MAY be added by named amendments to this spec; until such an amendment lands, `actionRef` is SubmitButton-only.

### 5.2 Resolution

When a resolution context includes a Response Actions document:

- The resolver MUST attempt to match `actionRef` against `responseActions.actions[*].id`.
- If matched: the SubmitButton is annotated `action-resolved: true` and click behavior MUST invoke the matched Action per RA §7.
- If not matched: the resolver MUST emit `COMP-REFERENTIAL-INTEGRITY` with severity `error`, `kind: "actionRef"`. The processor MUST NOT silently fall back to `defaultSubmitActionRef` or the unnamed default. Unresolved `actionRef` is a programming error — silent fallback would mask author intent.

When the resolution context does NOT include a Response Actions document but a SubmitButton carries `actionRef`: the resolver MUST emit `error` (`reason: "no-response-actions-document"`). The author declared an action reference; the absence of the Response Actions document is a configuration error, not a permissive informational case.

### 5.3 What actionRef Does NOT Do

- MUST NOT affect SubmitButton appearance (`label`, `pendingLabel`, `disableWhenPending`) or `mode`. Those props remain owned by Component §5.19.
- MUST NOT bypass VM §7.1 when `actionRef` is absent. The fallback is the three-way precedence in §9.

## 6. x-generation

### 6.1 Shape

`x-generation` is an OPTIONAL object on any Component node. Its shape:

```json
{
  "x-generation": {
    "source": "experience:identity",
    "strategy": "unit-to-section",
    "generatedBy": "formspec-wireframe-generator@0.1.0",
    "anchors": ["item:applicantName", "item:dateOfBirth", "unit:identity"],
    "generatedAt": "2026-05-22T18:30:00Z"
  }
}
```

| Field | Type | Required | Purpose |
|---|---|---|---|
| `source` | string | No | Free string naming the conceptual source (`experience:identity`, `definition:repeat`, etc.). |
| `strategy` | string | No | Free string naming the generator strategy. |
| `generatedBy` | string | No | Generator id + version. |
| `anchors` | array of string | No | List of handle strings pointing at source artifacts. Handle prefixes: `item:` (Definition item id), `unit:` (Experience unit id), `task:` (Experience task id), `action:` (Response Action id), `concept:` (concept ref). |
| `generatedAt` | string (RFC 3339 datetime) | No | When the generation happened. |

All fields are OPTIONAL; the object itself is OPTIONAL. The shape is open (`additionalProperties: true`) — generators MAY add their own fields under `x-` prefixes per the formspec extension convention.

### 6.2 Runtime Posture

Runtime renderers MUST ignore `x-generation`. Two consequences:

1. Identical Component nodes with different `x-generation` MUST render identically.
2. Removing `x-generation` from any node MUST NOT change rendering.

Static-analysis tools and the future regeneration merge spec (concept §10.5) consume `x-generation`. This spec defines the shape only; it does NOT define how anchors are used during merge.

### 6.3 What x-generation Does NOT Do

- MUST NOT affect rendering, validation, layout, or data binding.
- MUST NOT carry generated content (markup, derived values). It carries provenance metadata; the actual generated content is the surrounding Component subtree.
- MUST NOT be used to assert authority. A node with `x-generation` is no more or less authoritative than a hand-authored node; both are author-owned at the moment of save.
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add specs/component/component-references-spec.md
git commit -m "feat(spec): draft component-references §5-§6 (actionRef + x-generation)"
```

---

## Task 7: Draft §7 Cross-Document Resolution and §8 Findings

**Files:**
- Modify: `specs/component/component-references-spec.md`

- [ ] **Step 1: Append §7–§8**

```markdown
## 7. Cross-Document Resolution Algorithm

### 7.1 Resolution Context

A resolution context is a tuple:

```text
ResolutionContext = (Component, Experience?, ResponseActions?, Registry?)
```

- `Component`: REQUIRED. The Component document under inspection.
- `Experience`: OPTIONAL. When absent, all `unitRef` and `taskRefs` references emit informational findings (`no-experience-document`).
- `ResponseActions`: OPTIONAL. When absent and any SubmitButton carries `actionRef`, emit `error` findings. When absent and no SubmitButton carries `actionRef`, no findings.
- `Registry`: OPTIONAL host-policy artifact for concept resolution. See §4.2.

### 7.2 Resolution Order

Resolve in this order. Order matters because earlier findings can inform later ones (e.g., a missing Experience is reported once at the top, not once per node).

1. **Document presence findings.** Walk the Component tree to determine if any node carries `unitRef`, `taskRefs`, `actionRef`, or `conceptRefs`. If the corresponding context document is absent, emit the missing-document findings (see severity table in §8.3).
2. **`unitRef` resolution.** For every node with `unitRef`, attempt to match against `experience.units[*].id`. Emit `error` for misses when Experience is present.
3. **`taskRefs` resolution.** For every node with `taskRefs`, resolve each entry against `experience.tasks[*].id`. Emit `warning` per node with at least one miss.
4. **`actionRef` resolution.** For every SubmitButton with `actionRef`, match against `responseActions.actions[*].id`. Emit `error` for misses.
5. **`conceptRefs` resolution.** For every node with `conceptRefs`, apply host-policy. Default `info` for unresolved.
6. **`x-generation.anchors` resolution.** For every node with `x-generation.anchors`, resolve each anchor against the appropriate source by prefix. Findings here are `info` only; this is provenance metadata.

### 7.3 Output

The resolver output is a `ResolutionReport`:

```json
{
  "componentDocumentRef": "<opaque>",
  "experienceDocumentRef": "<opaque or null>",
  "responseActionsDocumentRef": "<opaque or null>",
  "findings": [
    { "code": "COMP-REFERENTIAL-INTEGRITY", "severity": "error", "kind": "actionRef", "nodeId": "submitApplication", "target": "nonexistentAction", "message": "actionRef 'nonexistentAction' did not resolve in Response Actions document" }
  ],
  "annotations": {
    "<nodeId>": { "unit-resolved": true, "action-resolved": true, "tasks-resolved": ["identifyApplicant"], "tasks-unresolved": [] }
  }
}
```

The resolver MUST be deterministic. Identical inputs MUST produce identical reports (modulo opaque refs).

## 8. Findings

### 8.1 Finding Code

A single code is defined: `COMP-REFERENTIAL-INTEGRITY`.

### 8.2 Severity Enum

Closed enum: `error` / `warning` / `info`.

### 8.3 Severity Mapping

| `kind` | Condition | Severity |
|---|---|---|
| `unitRef` | Reference unresolved, Experience present | `error` |
| `unitRef` | Node carries `unitRef`, Experience absent | `info` (one per node) |
| `taskRefs` | One or more entries unresolved, Experience present | `warning` (one per node) |
| `taskRefs` | Node carries `taskRefs`, Experience absent | `info` (one per node) |
| `actionRef` | Reference unresolved, Response Actions present | `error` |
| `actionRef` | Node carries `actionRef`, Response Actions absent | `error` (per node) |
| `conceptRefs` | Reference unresolved under default host policy | `info` |
| `x-generation.anchors` | Anchor unresolved | `info` |

### 8.4 Severity Implications

- `error`: blocks "no-warnings" reviewer gates; processors MAY refuse to honor the affected behavior (e.g., refuse to wire a click handler for an unresolved `actionRef`).
- `warning`: surfaces in editor / linter UI; does not block rendering or processing.
- `info`: surfaces only in verbose reports; does not block anything.

### 8.5 No Severity Override

Hosts MUST NOT downgrade `error` to `warning` or `info`. Hosts MAY upgrade `info` to `warning` or `error` via strict-mode configuration (host-defined; out of scope for this spec).
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add specs/component/component-references-spec.md
git commit -m "feat(spec): draft component-references §7-§8 (resolution algorithm + findings)"
```

---

## Task 8: Draft §9 SubmitButton Precedence, §10 Backward Compatibility

**Files:**
- Modify: `specs/component/component-references-spec.md`

- [ ] **Step 1: Append §9–§10**

```markdown
## 9. SubmitButton Resolution Precedence

This is the §9 row-4 promotion gate closure. The rule is a three-way precedence ladder.

### 9.1 The Precedence Rule

When a SubmitButton click is processed:

1. **Node-level `actionRef` (highest precedence).** If the SubmitButton node carries `actionRef`, the processor MUST invoke the matched Response Action. If the reference is unresolved, the processor MUST emit `COMP-REFERENTIAL-INTEGRITY` (severity `error`, kind `actionRef`) and MUST NOT fall through to lower precedence levels. Silent fallback would mask author intent.
2. **Document-level `defaultSubmitActionRef` (middle precedence).** If the SubmitButton has no `actionRef` and the Response Actions document carries `defaultSubmitActionRef`, the processor MUST invoke that named Action (per RA §10.3).
3. **Unnamed default (lowest precedence).** If neither `actionRef` nor `defaultSubmitActionRef` is set (or no Response Actions document is in scope), the processor MUST invoke the VM §7.1 unnamed default — gating only, no extra effects.

### 9.2 Disambiguation Example

A Component tree with two SubmitButtons:

```json
{
  "tree": {
    "component": "Section",
    "children": [
      { "id": "submitFinal", "component": "SubmitButton", "label": "Submit", "actionRef": "submitApplication" },
      { "id": "saveDraft", "component": "SubmitButton", "label": "Save" }
    ]
  }
}
```

With a Response Actions document setting `defaultSubmitActionRef: "saveProgress"`:

- Clicking `submitFinal` invokes `submitApplication` (rule 1 wins).
- Clicking `saveDraft` invokes `saveProgress` (rule 1 doesn't apply; rule 2 wins).

This is the canonical disambiguation pattern: name the action you care about explicitly; let the default cover the rest.

### 9.3 Compatibility With Existing `SubmitButton.mode` and `emitEvent`

The precedence rule selects WHICH Action is invoked. It does NOT alter:

- `SubmitButton.mode` (which validation profile produces the emitted report, per VM §7.2);
- `SubmitButton.emitEvent` (whether `formspec-submit` CustomEvent is dispatched);
- `SubmitButton.pendingLabel` / `disableWhenPending` (in-flight UI state).

A named Action MAY include a `hostEvent` effect that dispatches `formspec-submit` (RA §10.1). When the named Action does so, the SubmitButton's `emitEvent: true` MUST be honored by the surrounding renderer (the renderer dispatches the event; the Action's `hostEvent` effect is the runtime payload). The two pathways MUST NOT produce duplicate events; processors that wire both MUST coalesce.

## 10. Backward Compatibility (zero migration)

### 10.1 Existing SubmitButton Documents

A SubmitButton with no `actionRef` continues to work exactly as before. Resolution falls through to step 2 or 3 of §9.1. No author action is required.

### 10.2 Existing Adapters and Renderers

No adapter or renderer changes are required. Adapters that read `SubmitButton.mode` and `emitEvent` continue. The new fields are OPTIONAL; absent-field behavior is unchanged.

### 10.3 Existing ValidationSummary Documents

ValidationSummary is unmodified by this spec. The VM §8 reconciliation of `ValidationSummary.source` / `mode` remains the authority.

### 10.4 The "No-Rewrite" Regression Test

`tests/conformance/spec/test_component_no_rewrite_regression.py` loads every pre-existing Component fixture in the repository and validates each against the amended schema. Every fixture MUST pass without modification. One failure = the additivity invariant in §1.4.1 is broken; this spec MUST NOT land.

### 10.5 Migration Guidance for Greenfield Authoring

For new Component documents, authors SHOULD use `actionRef` when the form has more than one SubmitButton OR when the default action chain needs to differ from VM §7.1 (e.g., to attach effects beyond the gating behavior). Single-submit forms with only the default behavior MAY omit `actionRef` entirely.
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add specs/component/component-references-spec.md
git commit -m "feat(spec): draft component-references §9-§10 (SubmitButton precedence + zero migration)"
```

---

## Task 9: Draft §11 Extending to Future Trigger Components, §12 Conformance

**Files:**
- Modify: `specs/component/component-references-spec.md`

- [ ] **Step 1: Append §11–§12**

```markdown
## 11. Extending `actionRef` to Future Trigger Components

This spec adds `actionRef` to `SubmitButton` only. Future Component types that act as triggers (e.g., a generic `Button` component, a `Menu.Item` action item, a CLI `prompt-action`) MAY adopt `actionRef` via named amendments.

The amendment pattern:

1. A separate spec — for example, "Component Button" — defines the new trigger component.
2. That spec includes a section "actionRef adoption" that explicitly references this spec's §5 shape and §9 precedence rule.
3. The schema for that component declares `actionRef` in its `properties` block, mirroring SubmitButton.
4. The resolver in §7.2 step 4 extends to scan the new component type. (The resolver implementation SHOULD walk all known trigger types from a registry rather than hard-coding SubmitButton.)

Until such an amendment lands, `actionRef` on any non-SubmitButton component is a schema violation. Resolvers MUST reject Component documents that place `actionRef` on a non-trigger component.

## 12. Conformance

### 12.1 Core Conformance

A Core-conforming Component document:

1. Validates against `schemas/component.schema.json` v1.1.
2. Uses `actionRef` only on `SubmitButton` (or future trigger components added by named amendments).
3. Conforms to the shape of each new field per §2–§6.

### 12.2 Resolver Conformance

A Resolver-conforming processor:

1. Implements the §7.2 resolution algorithm.
2. Emits `COMP-REFERENTIAL-INTEGRITY` findings at the correct severity per §8.3.
3. Does not mutate any input document.
4. Honors the §9.1 three-way SubmitButton precedence.
5. Does not silently fall back from unresolved `actionRef`.

### 12.3 No-Rewrite Conformance

Every pre-existing Component document — anywhere in the repository, in conformance fixtures, in e2e fixtures, in docs examples — validates unchanged against the amended schema. The test in §10.4 is the gate.

### 12.4 Required Fixtures

A conforming implementation MUST pass all fixtures under `tests/conformance/fixtures/component-references/`. The fixture set is enumerated in the plan's File Structure section.

## 13. Conformance Prohibitions (re-asserted)

- MUST NOT make any new field REQUIRED.
- MUST NOT modify any existing field's type, required-set, enum, or pattern.
- MUST NOT cause any pre-existing Component fixture to fail validation.
- MUST NOT permit `actionRef` on non-trigger components.
- MUST NOT mutate Experience or Response Actions documents during resolution.
- MUST NOT silently fall back from an unresolved `actionRef`.
- MUST NOT change rendering based on `x-generation` content.

## 14. Migration (formal — same content as §10, restated for ease of citation)

There is no migration. Existing Component documents continue to work unchanged. Greenfield documents SHOULD use `actionRef` to disambiguate when multiple SubmitButtons appear. No adapter, renderer, or validation-summary code requires updates.
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add specs/component/component-references-spec.md
git commit -m "feat(spec): draft component-references §11-§14 (extension pattern + conformance + migration)"
```

---

## Task 10: Schema delta — ComponentBase additions

**Files:**
- Modify: `schemas/component.schema.json`

- [ ] **Step 1: Bump schema version (backward-compatible)**

Open `schemas/component.schema.json`. Find the `$id` field at the top of the file. Update its version segment from `/1.0` (or `/1`) to `/1.1`. This pins the schema document identity at the new minor version.

For `$formspecComponent`: **DO NOT change the existing `"const": "1.0"` to `"const": "1.1"`** — that would break every pre-existing Component document and defeat the additivity invariant. Instead, **broaden the constraint from const to enum**:

```json
"$formspecComponent": {
  "type": "string",
  "enum": ["1.0", "1.1"],
  "description": "Component specification version. Documents authored against schema v1.0 declare \"1.0\"; documents using v1.1 reference fields (unitRef, taskRefs, conceptRefs, actionRef, x-generation) declare \"1.1\". Both validate against v1.1 schema.",
  "examples": ["1.0", "1.1"],
  "x-lm": { "critical": true, "intent": "Version pin; enum accepts prior and current minor versions" }
}
```

This is strictly additive at the schema level: the enum accepts every value the prior const accepted, plus the new value. Confirm by running `git diff schemas/component.schema.json` after the edit; only `$id` and `$formspecComponent` should be touched.

- [ ] **Step 2: Add reference fields to `ComponentBase.properties`**

Locate the `ComponentBase` $def (around line 195). Inside `properties`, add the following four entries (placement: anywhere within `properties`, but keep alphabetical order if the file uses it):

```json
"unitRef": {
  "type": "string",
  "pattern": "^[a-zA-Z][a-zA-Z0-9_]*$",
  "description": "OPTIONAL. References an Experience Unit by id (see specs/component/component-references-spec.md §2). Advisory; absent or unresolved references do not affect rendering. When an Experience document is in the resolution context, an unresolved unitRef emits COMP-REFERENTIAL-INTEGRITY (error).",
  "examples": ["identity", "householdMembers"]
},
"taskRefs": {
  "type": "array",
  "items": {
    "type": "string",
    "pattern": "^[a-zA-Z][a-zA-Z0-9_]*$"
  },
  "description": "OPTIONAL. References Experience Tasks by id (see component-references-spec.md §3). Unresolved entries emit COMP-REFERENTIAL-INTEGRITY (warning).",
  "examples": [["identifyApplicant", "verifyEligibility"]]
},
"conceptRefs": {
  "type": "array",
  "items": { "$ref": "experience.schema.json#/$defs/ConceptRef" },
  "description": "OPTIONAL. References Registry / Ontology concepts. Reuses the ConceptRef shape from experience.schema.json. Unresolved entries emit COMP-REFERENTIAL-INTEGRITY (info) under default host policy.",
  "examples": [[{ "id": "uei:annualIncome", "system": "registry:income-2024" }]]
},
"x-generation": {
  "type": "object",
  "additionalProperties": true,
  "description": "OPTIONAL. Provenance metadata for generated nodes. Runtime processors MUST ignore this field. Consumed by static-analysis tools and the future regeneration merge spec (concept §10.5).",
  "properties": {
    "source": { "type": "string" },
    "strategy": { "type": "string" },
    "generatedBy": { "type": "string" },
    "anchors": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Handle strings. Prefixes: item: (Definition item id), unit: (Experience unit id), task: (Experience task id), action: (Response Action id), concept: (concept ref)."
    },
    "generatedAt": { "type": "string", "format": "date-time" }
  }
}
```

- [ ] **Step 3: Verify ComponentBase has no `unevaluatedProperties: false`**

```bash
cd formspec && grep -A 60 '"ComponentBase":' schemas/component.schema.json | grep -E "unevaluatedProperties|additionalProperties"
```

Expected: no match (ComponentBase is intentionally permissive; concrete types close the shape). If `unevaluatedProperties: false` exists on ComponentBase, the schema design has shifted; STOP and re-plan — adding fields to base while concrete types use `unevaluatedProperties: false` requires the new fields to live on the base and be inherited correctly. The current schema (verified during planning) does NOT close ComponentBase, so this should pass.

- [ ] **Step 4: Schema syntax check**

```bash
cd formspec && node -e "
const Ajv = require('ajv/dist/2020');
const draft = require('ajv/dist/refs/json-schema-2020-12/schema.json');
const ajv = new Ajv({strict: false, allErrors: true});
const schema = JSON.parse(require('fs').readFileSync('schemas/component.schema.json'));
const validate = ajv.compile(draft);
const ok = validate(schema);
if (!ok) { console.error(JSON.stringify(validate.errors, null, 2)); process.exit(1); }
console.log('component.schema.json is well-formed 2020-12 JSON Schema');
"
```

Expected: well-formed.

- [ ] **Step 5: Commit**

```bash
cd formspec && git add schemas/component.schema.json
git commit -m "feat(schema): add unitRef/taskRefs/conceptRefs/x-generation to ComponentBase

Additive minor version bump (1.1). All four fields OPTIONAL. Cross-schema
\$ref to experience.schema.json#/\$defs/ConceptRef. No existing field
modifications."
```

---

## Task 11: Schema delta — SubmitButton actionRef

**Files:**
- Modify: `schemas/component.schema.json`

- [ ] **Step 1: Add `actionRef` to `SubmitButton.properties`**

Locate `SubmitButton` $def (around line 845). Inside `properties`, append:

```json
"actionRef": {
  "type": "string",
  "pattern": "^[a-z][A-Za-z0-9]*$",
  "description": "OPTIONAL. References a Response Action by id (see specs/component/component-references-spec.md §5). When set, click invocation routes to the named Action per §9.1 precedence rule. Unresolved actionRef emits COMP-REFERENTIAL-INTEGRITY (error) and MUST NOT silently fall back.",
  "examples": ["submitApplication"]
}
```

- [ ] **Step 2: Verify `SubmitButton.unevaluatedProperties` is still `false`**

```bash
cd formspec && grep -A 50 '"SubmitButton":' schemas/component.schema.json | grep "unevaluatedProperties"
```

Expected: `"unevaluatedProperties": false`. With `actionRef` now declared in `SubmitButton.properties`, the `unevaluatedProperties: false` rule WILL evaluate it correctly. Other components do not declare `actionRef`, so their `unevaluatedProperties: false` WILL reject `actionRef` if anyone tries to use it on a non-trigger component (which is the intended schema-level enforcement of §11).

- [ ] **Step 3: Update SubmitButton examples to include both with-actionRef and without-actionRef cases**

In the `SubmitButton.examples` array (around line 880), the existing single example without `actionRef` MUST remain (proves backward compatibility). Append one with `actionRef`:

```json
{ "component": "SubmitButton", "label": "Submit Application", "mode": "submit", "emitEvent": true, "actionRef": "submitApplication" }
```

- [ ] **Step 4: Re-run schema syntax check**

```bash
cd formspec && node -e "
const Ajv = require('ajv/dist/2020');
const draft = require('ajv/dist/refs/json-schema-2020-12/schema.json');
const ajv = new Ajv({strict: false, allErrors: true});
const schema = JSON.parse(require('fs').readFileSync('schemas/component.schema.json'));
const validate = ajv.compile(draft);
const ok = validate(schema);
if (!ok) { console.error(JSON.stringify(validate.errors, null, 2)); process.exit(1); }
console.log('component.schema.json is well-formed');
"
```

Expected: well-formed.

- [ ] **Step 5: Commit**

```bash
cd formspec && git add schemas/component.schema.json
git commit -m "feat(schema): add OPTIONAL actionRef to SubmitButton

Trigger-bound per concept §6.7. SubmitButton.unevaluatedProperties=false
continues to enforce the trigger-only placement: actionRef is declared
only inside SubmitButton.properties, so other components reject it."
```

---

## Task 12: Author shared fixture base documents

**Files:**
- Create: `tests/conformance/fixtures/component-references/definition-base.json`
- Create: `tests/conformance/fixtures/component-references/experience-base.json`
- Create: `tests/conformance/fixtures/component-references/response-actions-base.json`

- [ ] **Step 1: Create the fixture directory**

```bash
mkdir -p formspec/tests/conformance/fixtures/component-references
```

- [ ] **Step 2: Author `definition-base.json`**

A Definition with at least: one required item (`applicantName`), one optional item (`dateOfBirth`), one income item with optional decimal precision (`income.amount`). Use the same shape family as `tests/conformance/fixtures/response-actions/definition-base.json` (which itself derives from `validation-mapping/definition-base.json`). This enables cross-suite composition.

Validate the document against `schemas/definition.schema.json` before committing.

- [ ] **Step 3: Author `experience-base.json`**

An Experience document with one actor (`respondent`), two tasks (`identifyApplicant`, `verifyEligibility`), and three units:

- `identity` (kind `data-entry`, itemRefs `[applicantName, dateOfBirth]`, taskRefs `[identifyApplicant]`)
- `income` (kind `data-entry`, itemRefs `[income.amount]`, taskRefs `[verifyEligibility]`)
- `reviewAndSubmit` (kind `confirmation`, actionRefs `[{ id: submitApplication, role: primary }]`)

Validate against `schemas/experience.schema.json`.

- [ ] **Step 4: Author `response-actions-base.json`**

A Response Actions document with:

- `targetDefinition` matching `definition-base.json`
- `defaultSubmitActionRef: "submitApplication"`
- Two actions: `submitApplication` (intent submit, one ledgerAppend effect) and `saveProgress` (intent save-draft, one ledgerAppend effect).

Validate against `schemas/response-actions.schema.json`.

- [ ] **Step 5: Commit**

```bash
cd formspec && git add tests/conformance/fixtures/component-references/{definition-base,experience-base,response-actions-base}.json
git commit -m "test(conformance): add shared base fixtures for component-references suite"
```

---

## Task 13: Author additivity + resolution-success fixtures

**Files:**
- Create: `tests/conformance/fixtures/component-references/component-no-refs.json`
- Create: `tests/conformance/fixtures/component-references/component-all-refs-resolved.json`

- [ ] **Step 1: Author `component-no-refs.json`**

A Component document using zero new fields. Wrap in the standard fixture envelope:

```json
{
  "name": "component-no-refs",
  "description": "Backward-compat baseline: Component with no new reference fields. Validates against the amended schema.",
  "definitionRef": "definition-base.json",
  "component": { /* Component document with Section + TextInput + SubmitButton, no unitRef/taskRefs/actionRef/conceptRefs/x-generation */ },
  "expected": {
    "schemaValidation": "pass",
    "findings": [],
    "annotations": {}
  }
}
```

- [ ] **Step 2: Author `component-all-refs-resolved.json`**

A Component document using EVERY new field, with all references resolving against the base Experience and Response Actions:

```json
{
  "name": "component-all-refs-resolved",
  "description": "Happy path: every new reference field present and resolving.",
  "definitionRef": "definition-base.json",
  "experienceRef": "experience-base.json",
  "responseActionsRef": "response-actions-base.json",
  "component": {
    "$formspecComponent": "1.1",
    "version": "1.0.0",
    "targetDefinition": { "url": "https://example.gov/forms/intake", "compatibleVersions": ">=1.0.0 <2.0.0" },
    "tree": {
      "id": "identitySection",
      "component": "Section",
      "unitRef": "identity",
      "taskRefs": ["identifyApplicant"],
      "x-generation": {
        "source": "experience:identity",
        "strategy": "unit-to-section",
        "generatedBy": "formspec-wireframe-generator@0.1.0",
        "anchors": ["item:applicantName", "item:dateOfBirth", "unit:identity"]
      },
      "children": [
        { "id": "applicantNameInput", "component": "TextInput", "bind": "applicantName", "unitRef": "identity" },
        { "id": "dateOfBirthInput", "component": "DatePicker", "bind": "dateOfBirth", "unitRef": "identity" },
        { "id": "incomeInput", "component": "MoneyInput", "bind": "income.amount", "unitRef": "income", "conceptRefs": [{ "id": "uei:annualIncome", "system": "registry:income-2024" }] },
        { "id": "submitFinal", "component": "SubmitButton", "label": "Submit Application", "actionRef": "submitApplication" }
      ]
    }
  },
  "expected": {
    "schemaValidation": "pass",
    "findings": [],
    "annotations": {
      "identitySection": { "unit-resolved": true, "tasks-resolved": ["identifyApplicant"] },
      "applicantNameInput": { "unit-resolved": true },
      "submitFinal": { "action-resolved": true }
    }
  }
}
```

- [ ] **Step 3: Schema-validate the embedded component documents**

```bash
cd formspec && node -e "
const Ajv = require('ajv/dist/2020');
const ajv = new Ajv({strict: false, allErrors: true});
const compSchema = JSON.parse(require('fs').readFileSync('schemas/component.schema.json'));
const expSchema = JSON.parse(require('fs').readFileSync('schemas/experience.schema.json'));
ajv.addSchema(expSchema);
const validate = ajv.compile(compSchema);
['component-no-refs.json', 'component-all-refs-resolved.json'].forEach(f => {
  const fx = JSON.parse(require('fs').readFileSync(\`tests/conformance/fixtures/component-references/\${f}\`));
  const ok = validate(fx.component);
  console.log(f, ok ? 'OK' : 'FAIL', ok ? '' : JSON.stringify(validate.errors));
});
"
```

Expected: both `OK`.

- [ ] **Step 4: Commit**

```bash
cd formspec && git add tests/conformance/fixtures/component-references/component-{no-refs,all-refs-resolved}.json
git commit -m "test(conformance): component-references additivity + resolution-success fixtures"
```

---

## Task 14: Author unresolved-reference fixtures

**Files:**
- Create: `tests/conformance/fixtures/component-references/component-unit-ref-unresolved.json`
- Create: `tests/conformance/fixtures/component-references/component-action-ref-unresolved.json`
- Create: `tests/conformance/fixtures/component-references/component-task-refs-unresolved.json`
- Create: `tests/conformance/fixtures/component-references/component-concept-refs-unresolved.json`

- [ ] **Step 1: Author each fixture**

Use the same envelope shape as Task 13. Each fixture introduces ONE deliberate unresolved reference and asserts the expected finding kind / severity:

- `component-unit-ref-unresolved.json`: a Section with `unitRef: "nonexistentUnit"`. Expected: one finding `{ code: "COMP-REFERENTIAL-INTEGRITY", severity: "error", kind: "unitRef", target: "nonexistentUnit" }`.
- `component-action-ref-unresolved.json`: a SubmitButton with `actionRef: "nonexistentAction"`. Expected: one finding `{ severity: "error", kind: "actionRef", target: "nonexistentAction" }`. **Critical:** also assert `annotations[<submitId>]["action-resolved"] === false` and that the processor MUST NOT auto-fallback (no `fallbackAction` field in the annotations).
- `component-task-refs-unresolved.json`: a Section with `taskRefs: ["identifyApplicant", "nonexistentTask"]`. Expected: one finding `{ severity: "warning", kind: "taskRefs" }` (one per node, not one per entry). Annotations should show `tasks-resolved: ["identifyApplicant"]` and `tasks-unresolved: ["nonexistentTask"]`.
- `component-concept-refs-unresolved.json`: a MoneyInput with `conceptRefs: [{ id: "uei:notARealConcept", system: "registry:income-2024" }]`. Expected: one finding `{ severity: "info", kind: "conceptRefs" }` under default host policy.

- [ ] **Step 2: Schema-validate (every fixture's embedded Component MUST validate; the unresolved-reference cases are RESOLVER findings, not schema violations)**

Re-run the script from Task 13 Step 3 over the new fixtures. Expected: every fixture validates OK at the schema level.

- [ ] **Step 3: Commit**

```bash
cd formspec && git add tests/conformance/fixtures/component-references/component-{unit-ref,action-ref,task-refs,concept-refs}-unresolved.json
git commit -m "test(conformance): unresolved-reference fixtures (error/warning/info severity ladder)"
```

---

## Task 15: Author SubmitButton precedence fixtures

**Files:**
- Create: `tests/conformance/fixtures/component-references/submitbutton-precedence-node-action-wins.json`
- Create: `tests/conformance/fixtures/component-references/submitbutton-precedence-default-ref-wins.json`
- Create: `tests/conformance/fixtures/component-references/submitbutton-precedence-unnamed-fallback.json`
- Create: `tests/conformance/fixtures/component-references/submitbutton-mixed-buttons.json`

- [ ] **Step 1: Author the three precedence-ladder fixtures**

Each fixture envelope includes a `click` block declaring which SubmitButton id is "clicked" and an `expected.invokedActionId` plus `expected.invocationPath` (one of `node-actionRef` / `default-submit-action-ref` / `vm-7.1-unnamed-default`).

- `submitbutton-precedence-node-action-wins.json`: SubmitButton has `actionRef: "submitApplication"`. Response Actions has `defaultSubmitActionRef: "saveProgress"`. Click that button. Expected: `invokedActionId: "submitApplication"`, `invocationPath: "node-actionRef"`.
- `submitbutton-precedence-default-ref-wins.json`: SubmitButton has no `actionRef`. Response Actions has `defaultSubmitActionRef: "submitApplication"`. Click. Expected: `invokedActionId: "submitApplication"`, `invocationPath: "default-submit-action-ref"`.
- `submitbutton-precedence-unnamed-fallback.json`: SubmitButton has no `actionRef`. Response Actions document is absent (or present without `defaultSubmitActionRef`). Click. Expected: `invokedActionId: null` (unnamed), `invocationPath: "vm-7.1-unnamed-default"`, `vmMasterRow: { intent: "submit", profile: "on-submit", blocking: "block-on-error", persistence: "complete-response" }`.

- [ ] **Step 2: Author `submitbutton-mixed-buttons.json`**

Component tree with two SubmitButtons: `submitFinal` has `actionRef: "submitApplication"`; `saveDraft` has no `actionRef`. Response Actions has `defaultSubmitActionRef: "saveProgress"`. Two click scenarios in `clickSequence`:

```json
{
  "clickSequence": [
    { "buttonId": "submitFinal", "expected": { "invokedActionId": "submitApplication", "invocationPath": "node-actionRef" } },
    { "buttonId": "saveDraft", "expected": { "invokedActionId": "saveProgress", "invocationPath": "default-submit-action-ref" } }
  ]
}
```

- [ ] **Step 3: Schema-validate**

Re-run Task 13 Step 3 over these fixtures. Expected: all OK.

- [ ] **Step 4: Commit**

```bash
cd formspec && git add tests/conformance/fixtures/component-references/submitbutton-*.json
git commit -m "test(conformance): SubmitButton three-way precedence + mixed-button disambiguation fixtures"
```

---

## Task 16: Author x-generation anchors fixture

**Files:**
- Create: `tests/conformance/fixtures/component-references/x-generation-anchors-coverage.json`

- [ ] **Step 1: Author the fixture**

A Component tree where every node carries `x-generation` with anchors pointing into the base Definition, Experience, and Response Actions. The fixture's `expected` block asserts:

- Every `item:*` anchor resolves against `definitionRef`.
- Every `unit:*` anchor resolves against `experienceRef`.
- Every `action:*` anchor resolves against `responseActionsRef`.
- Coverage report: `100% anchored`.
- `runtimeIgnoreCheck`: removing `x-generation` from any node and re-running yields identical rendering output (this is a *claim* the resolver records; the actual rendering identity check is left to a renderer test, not this fixture).

- [ ] **Step 2: Schema-validate**

Re-run Task 13 Step 3. Expected: OK.

- [ ] **Step 3: Commit**

```bash
cd formspec && git add tests/conformance/fixtures/component-references/x-generation-anchors-coverage.json
git commit -m "test(conformance): x-generation anchors coverage fixture (seeds regeneration merge spec)"
```

---

## Task 17: Write schema-shape pytest

**Files:**
- Create: `tests/conformance/schemas/test_component_references_schema.py`

- [ ] **Step 1: Write the test**

```python
"""Schema-shape tests for component-references additions to component.schema.json.

Pins:
- $formspecComponent version bumped to 1.1 / $id ends with /1.1.
- ComponentBase carries unitRef, taskRefs, conceptRefs, x-generation as OPTIONAL.
- SubmitButton.properties carries actionRef as OPTIONAL.
- ComponentBase has no unevaluatedProperties: false (intentional).
- No existing required-set additions; no existing enum closures tightened.
- conceptRefs items use cross-schema $ref to experience.schema.json.
- Every fixture's embedded Component validates against the amended schema.
- No pre-existing Component fixture in the repo regresses.
"""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator
from referencing import Registry, Resource


REPO_ROOT = Path(__file__).resolve().parents[3]
SCHEMA_PATH = REPO_ROOT / "schemas" / "component.schema.json"
EXP_SCHEMA_PATH = REPO_ROOT / "schemas" / "experience.schema.json"
FIXTURE_DIR = REPO_ROOT / "tests" / "conformance" / "fixtures" / "component-references"


def load_schema():
    return json.loads(SCHEMA_PATH.read_text())


def build_validator():
    schema = load_schema()
    exp_schema = json.loads(EXP_SCHEMA_PATH.read_text())
    registry = Registry().with_resource(
        uri="experience.schema.json",
        resource=Resource.from_contents(exp_schema),
    )
    return Draft202012Validator(schema, registry=registry)


def test_schema_version_bumped_to_1_1():
    schema = load_schema()
    assert "/1.1" in schema["$id"], f"$id should target /1.1, got {schema['$id']}"
    # $formspecComponent broadens from const to enum to preserve backward compatibility.
    enum = schema["properties"]["$formspecComponent"]["enum"]
    assert "1.0" in enum, "v1.0 documents MUST still validate"
    assert "1.1" in enum, "v1.1 must be a valid value"


def test_component_base_carries_new_optional_fields():
    schema = load_schema()
    cb_props = schema["$defs"]["ComponentBase"]["properties"]
    for field in ("unitRef", "taskRefs", "conceptRefs", "x-generation"):
        assert field in cb_props, f"ComponentBase MUST declare {field}"
    required = schema["$defs"]["ComponentBase"].get("required", [])
    for field in ("unitRef", "taskRefs", "conceptRefs", "x-generation"):
        assert field not in required, f"{field} MUST be OPTIONAL"


def test_submitbutton_carries_action_ref_optional():
    schema = load_schema()
    sb_props = schema["$defs"]["SubmitButton"]["properties"]
    assert "actionRef" in sb_props
    required = schema["$defs"]["SubmitButton"].get("required", [])
    assert "actionRef" not in required


def test_component_base_has_no_unevaluated_properties_false():
    """If this fails, the schema design has shifted; new fields would be rejected on concrete types."""
    schema = load_schema()
    cb = schema["$defs"]["ComponentBase"]
    assert cb.get("unevaluatedProperties") is not False, "ComponentBase must remain open"


def test_conceptrefs_uses_cross_schema_ref():
    schema = load_schema()
    items = schema["$defs"]["ComponentBase"]["properties"]["conceptRefs"]["items"]
    assert items.get("$ref", "").endswith("ConceptRef"), \
        "conceptRefs items MUST cite experience.schema.json ConceptRef shape"


@pytest.mark.parametrize("fixture_name", sorted(p.name for p in FIXTURE_DIR.glob("*.json")
                                                if p.name.startswith("component-") or p.name.startswith("submitbutton-") or p.name.startswith("x-generation-")))
def test_fixture_component_validates_against_amended_schema(fixture_name):
    validator = build_validator()
    fx = json.loads((FIXTURE_DIR / fixture_name).read_text())
    component_docs = []
    if "component" in fx:
        component_docs.append(fx["component"])
    if "scenarios" in fx:
        component_docs.extend(s["component"] for s in fx["scenarios"].values() if "component" in s)
    assert component_docs, f"{fixture_name} has no component document"
    for d in component_docs:
        errors = list(validator.iter_errors(d))
        assert not errors, f"{fixture_name} schema errors: {errors}"
```

- [ ] **Step 2: Run**

```bash
cd formspec && python3 -m pytest tests/conformance/schemas/test_component_references_schema.py -v
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
cd formspec && git add tests/conformance/schemas/test_component_references_schema.py
git commit -m "test(conformance): pin component-references schema shape (additivity invariant)"
```

---

## Task 18: Write the no-rewrite regression pytest

**Files:**
- Create: `tests/conformance/spec/test_component_no_rewrite_regression.py`

- [ ] **Step 1: Write the test**

This is the LOAD-BEARING test for §9 row 4 closure. Every pre-existing Component fixture in the repo MUST validate unchanged against the amended schema.

```python
"""No-rewrite regression: every pre-existing Component fixture validates
unchanged against the amended component.schema.json (v1.1).

If any fixture fails, the additivity invariant in component-references-spec.md
§1.4.1 is broken and this spec MUST NOT land.
"""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator
from referencing import Registry, Resource


REPO_ROOT = Path(__file__).resolve().parents[3]
SCHEMA_PATH = REPO_ROOT / "schemas" / "component.schema.json"
EXP_SCHEMA_PATH = REPO_ROOT / "schemas" / "experience.schema.json"


def discover_component_fixtures():
    """Return every JSON file that looks like a Component document.

    A Component document is identified by having either:
      - top-level "$formspecComponent" key, OR
      - a "component" key whose value has "$formspecComponent", OR
      - a "tree" key (Component documents wrap the node tree in `tree`).

    Search roots: tests/conformance/fixtures/, tests/e2e/fixtures/, examples/, docs/.
    EXCLUDES tests/conformance/fixtures/component-references/ (those are the
    new fixtures authored under this plan; their pre-existence is meaningless).
    """
    candidates = []
    for root in ("tests/conformance/fixtures", "tests/e2e/fixtures", "examples", "docs"):
        root_path = REPO_ROOT / root
        if not root_path.exists():
            continue
        for p in root_path.rglob("*.json"):
            if "component-references" in str(p):
                continue
            try:
                doc = json.loads(p.read_text())
            except Exception:
                continue
            if isinstance(doc, dict):
                if "$formspecComponent" in doc or "tree" in doc:
                    candidates.append((p, doc))
                elif isinstance(doc.get("component"), dict) and "$formspecComponent" in doc["component"]:
                    candidates.append((p, doc["component"]))
    return candidates


def build_validator():
    schema = json.loads(SCHEMA_PATH.read_text())
    exp_schema = json.loads(EXP_SCHEMA_PATH.read_text())
    registry = Registry().with_resource(
        uri="experience.schema.json",
        resource=Resource.from_contents(exp_schema),
    )
    return Draft202012Validator(schema, registry=registry)


FIXTURES = discover_component_fixtures()


@pytest.mark.parametrize("path,doc", FIXTURES, ids=[str(p[0].relative_to(REPO_ROOT)) for p in FIXTURES])
def test_pre_existing_component_fixture_validates_unchanged(path, doc):
    """Each pre-existing Component fixture validates against the amended schema."""
    validator = build_validator()
    errors = list(validator.iter_errors(doc))
    assert not errors, (
        f"REGRESSION: pre-existing fixture {path} no longer validates against amended "
        f"component.schema.json. The additivity invariant is broken. Errors: {errors}"
    )


def test_at_least_one_fixture_was_discovered():
    """Sanity check: if the discovery returns zero fixtures, the test is meaningless."""
    assert FIXTURES, (
        "discover_component_fixtures returned no candidates. Either the repo has no "
        "Component fixtures (unlikely) or the discovery heuristic is wrong (check the "
        "$formspecComponent / tree / component sniff in this file)."
    )
```

- [ ] **Step 2: Run**

```bash
cd formspec && python3 -m pytest tests/conformance/spec/test_component_no_rewrite_regression.py -v
```

Expected: all parametrized tests pass; `test_at_least_one_fixture_was_discovered` passes. If ANY parametrized test fails: STOP. The additivity invariant is broken. Diagnose the failure — most likely cause is a schema field that was inadvertently tightened. Revert the offending schema change before continuing.

- [ ] **Step 3: Commit**

```bash
cd formspec && git add tests/conformance/spec/test_component_no_rewrite_regression.py
git commit -m "test(conformance): no-rewrite regression for component schema v1.1

Loads every pre-existing Component fixture in the repo and validates
against the amended schema. Single failure breaks the additivity
invariant and blocks the spec from landing."
```

---

## Task 19: Write the cross-document resolver pytest

**Files:**
- Create: `tests/conformance/spec/test_component_reference_resolution.py`

- [ ] **Step 1: Write the resolver harness + tests**

The resolver harness implements §7.2. Like the Response Actions runtime harness, it ships inline with the test file as the conformance oracle.

```python
"""Cross-document resolution tests for component-references-spec.md §7-§8.

Includes a reference resolver implementing §7.2. Production processors
need not use this resolver; they MUST produce the same findings and
annotations for the same inputs.
"""

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURE_DIR = REPO_ROOT / "tests" / "conformance" / "fixtures" / "component-references"


@dataclass
class Finding:
    code: str
    severity: str  # error | warning | info
    kind: str      # unitRef | taskRefs | actionRef | conceptRefs | x-generation.anchors
    node_id: Optional[str] = None
    target: Optional[str] = None
    reason: Optional[str] = None


@dataclass
class ResolutionReport:
    findings: List[Finding] = field(default_factory=list)
    annotations: Dict[str, Dict[str, Any]] = field(default_factory=dict)


def walk_tree(node: Dict[str, Any]):
    """Pre-order traversal yielding every node in the Component tree."""
    yield node
    for child in node.get("children", []) or []:
        yield from walk_tree(child)


def resolve(component: Dict[str, Any], experience: Optional[Dict[str, Any]] = None,
            response_actions: Optional[Dict[str, Any]] = None) -> ResolutionReport:
    report = ResolutionReport()
    root = component.get("tree", {})

    has_unit_or_task_refs = any(("unitRef" in n) or ("taskRefs" in n) for n in walk_tree(root))
    has_action_ref = any(n.get("component") == "SubmitButton" and "actionRef" in n for n in walk_tree(root))

    # Step 1: document-presence findings.
    if has_unit_or_task_refs and experience is None:
        for n in walk_tree(root):
            if "unitRef" in n or "taskRefs" in n:
                report.findings.append(Finding(
                    code="COMP-REFERENTIAL-INTEGRITY", severity="info",
                    kind="unitRef" if "unitRef" in n else "taskRefs",
                    node_id=n.get("id"), reason="no-experience-document"
                ))
    if has_action_ref and response_actions is None:
        for n in walk_tree(root):
            if n.get("component") == "SubmitButton" and "actionRef" in n:
                report.findings.append(Finding(
                    code="COMP-REFERENTIAL-INTEGRITY", severity="error",
                    kind="actionRef", node_id=n.get("id"),
                    target=n["actionRef"], reason="no-response-actions-document"
                ))

    # Build resolution sets.
    unit_ids = {u["id"] for u in (experience.get("units", []) if experience else [])}
    task_ids = {t["id"] for t in (experience.get("tasks", []) if experience else [])}
    action_ids = {a["id"] for a in (response_actions.get("actions", []) if response_actions else [])}

    for n in walk_tree(root):
        node_id = n.get("id")
        ann: Dict[str, Any] = {}

        # Step 2: unitRef.
        if "unitRef" in n and experience is not None:
            if n["unitRef"] in unit_ids:
                ann["unit-resolved"] = True
            else:
                ann["unit-resolved"] = False
                report.findings.append(Finding(
                    code="COMP-REFERENTIAL-INTEGRITY", severity="error",
                    kind="unitRef", node_id=node_id, target=n["unitRef"]
                ))

        # Step 3: taskRefs.
        if "taskRefs" in n and experience is not None:
            resolved = [t for t in n["taskRefs"] if t in task_ids]
            unresolved = [t for t in n["taskRefs"] if t not in task_ids]
            ann["tasks-resolved"] = resolved
            ann["tasks-unresolved"] = unresolved
            if unresolved:
                report.findings.append(Finding(
                    code="COMP-REFERENTIAL-INTEGRITY", severity="warning",
                    kind="taskRefs", node_id=node_id, target=",".join(unresolved)
                ))

        # Step 4: actionRef (SubmitButton only).
        if n.get("component") == "SubmitButton" and "actionRef" in n and response_actions is not None:
            if n["actionRef"] in action_ids:
                ann["action-resolved"] = True
            else:
                ann["action-resolved"] = False
                report.findings.append(Finding(
                    code="COMP-REFERENTIAL-INTEGRITY", severity="error",
                    kind="actionRef", node_id=node_id, target=n["actionRef"]
                ))

        # Step 5: conceptRefs (default host policy: unresolved = info).
        # For this reference harness, we have no registry; every conceptRefs entry is unresolved → info.
        # Real hosts may resolve via a registry view.
        if "conceptRefs" in n and n["conceptRefs"]:
            report.findings.append(Finding(
                code="COMP-REFERENTIAL-INTEGRITY", severity="info",
                kind="conceptRefs", node_id=node_id,
                reason="no-registry-context"
            ))

        if ann:
            report.annotations[node_id or "<unnamed>"] = ann

    return report


def load_fixture(name: str) -> Dict[str, Any]:
    return json.loads((FIXTURE_DIR / name).read_text())


def load_context_for_fixture(fx: Dict[str, Any]):
    experience = load_fixture(fx["experienceRef"]) if "experienceRef" in fx else None
    response_actions = load_fixture(fx["responseActionsRef"]) if "responseActionsRef" in fx else None
    return experience, response_actions


# --- Tests ------------------------------------------------------------------

FIXTURE_NAMES = [
    "component-no-refs.json",
    "component-all-refs-resolved.json",
    "component-unit-ref-unresolved.json",
    "component-action-ref-unresolved.json",
    "component-task-refs-unresolved.json",
    "component-concept-refs-unresolved.json",
]


@pytest.mark.parametrize("fixture_name", FIXTURE_NAMES)
def test_resolver_findings_match_expected(fixture_name):
    fx = load_fixture(fixture_name)
    experience, response_actions = load_context_for_fixture(fx)
    report = resolve(fx["component"], experience=experience, response_actions=response_actions)

    expected_findings = fx["expected"]["findings"]
    # Compare by (severity, kind, target) tuple; node-id where pinned.
    got_keys = sorted((f.severity, f.kind, f.target or "") for f in report.findings)
    want_keys = sorted((f["severity"], f["kind"], f.get("target", "")) for f in expected_findings)
    assert got_keys == want_keys, f"{fixture_name} findings mismatch:\ngot:  {got_keys}\nwant: {want_keys}"


def test_unresolved_action_ref_does_not_silently_fallback():
    """The §9.1 precedence rule MUST NOT silently fall through on unresolved actionRef."""
    fx = load_fixture("component-action-ref-unresolved.json")
    experience, response_actions = load_context_for_fixture(fx)
    report = resolve(fx["component"], experience=experience, response_actions=response_actions)
    # The SubmitButton MUST be annotated action-resolved=false, NOT have a fallback action.
    submit_nodes = [n for n in walk_tree(fx["component"]["tree"]) if n.get("component") == "SubmitButton"]
    assert submit_nodes, "fixture must contain a SubmitButton"
    sb_id = submit_nodes[0]["id"]
    assert report.annotations[sb_id]["action-resolved"] is False
    assert "fallbackAction" not in report.annotations[sb_id], "MUST NOT auto-fallback per §9.1"


def test_resolver_is_deterministic():
    fx = load_fixture("component-all-refs-resolved.json")
    experience, response_actions = load_context_for_fixture(fx)
    a = resolve(fx["component"], experience=experience, response_actions=response_actions)
    b = resolve(fx["component"], experience=experience, response_actions=response_actions)
    assert [(f.severity, f.kind, f.target) for f in a.findings] == [(f.severity, f.kind, f.target) for f in b.findings]
    assert a.annotations == b.annotations


def test_resolver_does_not_mutate_inputs():
    fx = load_fixture("component-all-refs-resolved.json")
    experience, response_actions = load_context_for_fixture(fx)
    comp_before = json.dumps(fx["component"], sort_keys=True)
    exp_before = json.dumps(experience, sort_keys=True)
    ra_before = json.dumps(response_actions, sort_keys=True)
    resolve(fx["component"], experience=experience, response_actions=response_actions)
    assert json.dumps(fx["component"], sort_keys=True) == comp_before
    assert json.dumps(experience, sort_keys=True) == exp_before
    assert json.dumps(response_actions, sort_keys=True) == ra_before
```

- [ ] **Step 2: Run**

```bash
cd formspec && python3 -m pytest tests/conformance/spec/test_component_reference_resolution.py -v
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
cd formspec && git add tests/conformance/spec/test_component_reference_resolution.py
git commit -m "test(conformance): pin §7-§8 cross-document resolver

Reference §7.2 resolver; fixture-driven assertions on findings,
severity ladder, determinism, no-mutation invariant, and the
no-silent-fallback rule for unresolved actionRef."
```

---

## Task 20: Write SubmitButton precedence pytest

**Files:**
- Create: `tests/conformance/spec/test_component_submitbutton_precedence.py`

- [ ] **Step 1: Write the test**

```python
"""SubmitButton three-way precedence tests for component-references-spec.md §9.

Pins the precedence ladder:
  1. Node-level actionRef
  2. Document-level defaultSubmitActionRef
  3. VM §7.1 unnamed default
"""

import json
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURE_DIR = REPO_ROOT / "tests" / "conformance" / "fixtures" / "component-references"

VM_MASTER_SUBMIT_ROW = {
    "intent": "submit", "profile": "on-submit",
    "blocking": "block-on-error", "persistence": "complete-response",
}


def resolve_submitbutton_click(button_id: str, component: Dict[str, Any],
                                response_actions: Optional[Dict[str, Any]] = None) -> Tuple[Optional[str], str]:
    """Return (invokedActionId, invocationPath).

    invocationPath ∈ {node-actionRef, default-submit-action-ref, vm-7.1-unnamed-default}.
    """
    def find_button(node):
        if node.get("id") == button_id and node.get("component") == "SubmitButton":
            return node
        for c in node.get("children", []) or []:
            r = find_button(c)
            if r is not None:
                return r
        return None

    button = find_button(component["tree"])
    if button is None:
        raise ValueError(f"button {button_id} not found")

    # Rule 1: node-level actionRef.
    if "actionRef" in button:
        if response_actions and any(a["id"] == button["actionRef"] for a in response_actions.get("actions", [])):
            return (button["actionRef"], "node-actionRef")
        else:
            # Unresolved actionRef MUST NOT fall through per §9.1.
            raise ValueError(f"actionRef {button['actionRef']} unresolved; MUST NOT silently fall back")

    # Rule 2: document-level defaultSubmitActionRef.
    if response_actions and "defaultSubmitActionRef" in response_actions:
        default_id = response_actions["defaultSubmitActionRef"]
        if any(a["id"] == default_id for a in response_actions.get("actions", [])):
            return (default_id, "default-submit-action-ref")
        else:
            raise ValueError(f"defaultSubmitActionRef {default_id} unresolved in actions[]")

    # Rule 3: VM §7.1 unnamed default.
    return (None, "vm-7.1-unnamed-default")


def load_fixture(name: str) -> Dict[str, Any]:
    return json.loads((FIXTURE_DIR / name).read_text())


def test_node_action_ref_wins_over_default():
    fx = load_fixture("submitbutton-precedence-node-action-wins.json")
    ra = load_fixture(fx["responseActionsRef"])
    invoked, path = resolve_submitbutton_click(fx["click"]["buttonId"], fx["component"], response_actions=ra)
    assert invoked == fx["expected"]["invokedActionId"]
    assert path == "node-actionRef"


def test_default_ref_wins_when_no_node_action_ref():
    fx = load_fixture("submitbutton-precedence-default-ref-wins.json")
    ra = load_fixture(fx["responseActionsRef"])
    invoked, path = resolve_submitbutton_click(fx["click"]["buttonId"], fx["component"], response_actions=ra)
    assert invoked == fx["expected"]["invokedActionId"]
    assert path == "default-submit-action-ref"


def test_unnamed_default_when_no_response_actions():
    fx = load_fixture("submitbutton-precedence-unnamed-fallback.json")
    ra = load_fixture(fx["responseActionsRef"]) if "responseActionsRef" in fx else None
    invoked, path = resolve_submitbutton_click(fx["click"]["buttonId"], fx["component"], response_actions=ra)
    assert invoked is None
    assert path == "vm-7.1-unnamed-default"


def test_mixed_buttons_disambiguate_correctly():
    fx = load_fixture("submitbutton-mixed-buttons.json")
    ra = load_fixture(fx["responseActionsRef"])
    for step in fx["clickSequence"]:
        invoked, path = resolve_submitbutton_click(step["buttonId"], fx["component"], response_actions=ra)
        assert invoked == step["expected"]["invokedActionId"], f"click {step['buttonId']}: got {invoked}"
        assert path == step["expected"]["invocationPath"]


def test_unresolved_action_ref_raises_does_not_silently_fall_back():
    """If actionRef is set but doesn't resolve, the resolver MUST NOT auto-fall-through."""
    component = {
        "tree": {
            "id": "submitFinal", "component": "SubmitButton",
            "label": "Submit", "actionRef": "nonexistent"
        }
    }
    ra = {"actions": [{"id": "submitApplication"}], "defaultSubmitActionRef": "submitApplication"}
    with pytest.raises(ValueError, match="MUST NOT silently fall back"):
        resolve_submitbutton_click("submitFinal", component, response_actions=ra)
```

- [ ] **Step 2: Run**

```bash
cd formspec && python3 -m pytest tests/conformance/spec/test_component_submitbutton_precedence.py -v
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
cd formspec && git add tests/conformance/spec/test_component_submitbutton_precedence.py
git commit -m "test(conformance): pin SubmitButton three-way precedence

Covers all three rungs of §9.1 plus mixed-buttons disambiguation and
the no-silent-fallback invariant on unresolved actionRef."
```

---

## Task 21: Update upstream specs with back-references

**Files:**
- Modify: `specs/component/component-spec.md`
- Modify: `specs/component/component-spec.bluf.md`
- Modify: `specs/core/validation-mapping.md`
- Modify: `specs/response-actions/response-actions-spec.md`
- Modify: `specs/experience/experience-spec.md`
- Modify: `thoughts/specs/2026-05-20-formspec-semantic-layers.md`
- Modify: `../TODO-STACK.md`

- [ ] **Step 1: component-spec.md cross-reference**

Append a new section "§11 Cross-References" at the end of `specs/component/component-spec.md`:

```markdown
## 11. Cross-References

Component nodes MAY carry OPTIONAL reference fields defined in [Component References §2–§6](component-references-spec.md):

- `unitRef` / `taskRefs` resolve against [Experience](../experience/experience-spec.md).
- `actionRef` (on `SubmitButton` only) resolves against [Response Actions](../response-actions/response-actions-spec.md).
- `conceptRefs` reference Registry / Ontology concepts.
- `x-generation` is metadata-only provenance.

The Component References spec amends `component.schema.json` to v1.1 additively. Every pre-existing Component document validates unchanged. See [Component References §10](component-references-spec.md#10-backward-compatibility-zero-migration) for the zero-migration claim.
```

Also append a one-line note inside §5.19 SubmitButton (find the section, append after the existing prop table):

```markdown
**SubmitButton click resolution** follows the three-way precedence rule in [Component References §9.1](component-references-spec.md#91-the-precedence-rule): node-level `actionRef` > Response Actions `defaultSubmitActionRef` > VM §7.1 unnamed default.
```

- [ ] **Step 2: component-spec.bluf.md**

Append one bullet:

```markdown
- Component nodes MAY carry OPTIONAL reference fields (`unitRef`, `taskRefs`, `actionRef`, `conceptRefs`, `x-generation`) defined in [Component References](component-references-spec.md). Schema v1.1 is additive; every pre-existing Component document validates unchanged.
```

- [ ] **Step 3: validation-mapping.md §7.3 update**

In `specs/core/validation-mapping.md`, find §7.3 ("Future `actionRef` Compatibility"). Update the body to:

```markdown
### 7.3 `actionRef` Compatibility

[Component References §5](../component/component-references-spec.md#5-actionref) defines `actionRef` on SubmitButton. The three-way precedence in [Component References §9.1](../component/component-references-spec.md#91-the-precedence-rule) governs lookup: node-level `actionRef` > Response Actions `defaultSubmitActionRef` > the §7.1 unnamed default from this document.

Existing `SubmitButton` documents without `actionRef` continue to behave per §7.1.
```

- [ ] **Step 4: response-actions-spec.md updates**

In `specs/response-actions/response-actions-spec.md`:

- §10.3 (default submit action) — append at the end: " See [Component References §9.1](../component/component-references-spec.md#91-the-precedence-rule) for the three-way precedence rule and [§5](../component/component-references-spec.md#5-actionref) for `actionRef` resolution semantics."
- §14.4 ("Future `actionRef` on Component") — replace body with: "Landed in [Component References §5](../component/component-references-spec.md#5-actionref). Component nodes MAY now carry `actionRef`; the three-way precedence pin is in [Component References §9.1](../component/component-references-spec.md#91-the-precedence-rule)."

- [ ] **Step 5: experience-spec.md updates**

In `specs/experience/experience-spec.md`:

- §6.3 `ActionRef` — replace "(forthcoming companion spec, concept §10.2)" with "(see [Response Actions §3](../response-actions/response-actions-spec.md#3-action-identity); Component-side resolution per [Component References §5](../component/component-references-spec.md#5-actionref))".
- `Unit.id` description (S5.1 prop table) — replace "Referenced by Component nodes via `unitRef` (forthcoming, concept §10.4)" with "Referenced by Component nodes via `unitRef` (see [Component References §2](../component/component-references-spec.md#2-unitref))".
- Schema description block: the equivalent line in `experience.schema.json` at line 138 should be updated to match. **Two-line edit, no schema shape change.**

- [ ] **Step 6: semantic-layers.md updates**

In `thoughts/specs/2026-05-20-formspec-semantic-layers.md`:

- §5.5 — append: " The named reference fields (`unitRef`, `taskRefs`, `actionRef`, `conceptRefs`, `x-generation`) have promoted from future to current Component schema; see [`specs/component/component-references-spec.md §1.5`](../../specs/component/component-references-spec.md#15-promotion-of-reference-fields-resolves-concept-113)."
- §10 entry 4 — append: " **Landed:** [`specs/component/component-references-spec.md`](../../specs/component/component-references-spec.md) (draft, 2026-05-22)."
- §11.3 — append: " **Resolved:** [`specs/component/component-references-spec.md §1.5`](../../specs/component/component-references-spec.md#15-promotion-of-reference-fields-resolves-concept-113) — fields promoted to current Component schema; both prerequisites (Experience and Response Action identities) have landed."

- [ ] **Step 7: TODO-STACK.md update**

Update the row tracking §10 #4 in `formspec-stack/TODO-STACK.md` to "landed (draft 2026-05-22)" with pointers to this plan and the new spec. **One-line edit.**

- [ ] **Step 8: Commit**

```bash
cd formspec && git add specs/component/component-spec.md specs/component/component-spec.bluf.md specs/core/validation-mapping.md specs/response-actions/response-actions-spec.md specs/experience/experience-spec.md schemas/experience.schema.json thoughts/specs/2026-05-20-formspec-semantic-layers.md
git commit -m "docs(spec): wire component-references back-references into Component/VM/RA/Experience/concept-note"

cd .. && git add TODO-STACK.md && git commit -m "docs(stack): mark component-references companion landed"
```

---

## Task 22: Run doc pipeline, filemap, full test sweep

**Files:** (generated)
- Touched: `specs/component/component-references-spec.llm.md`
- Touched: `filemap.json`

- [ ] **Step 1: Generate doc artifacts**

```bash
cd formspec && npm run docs:generate
```

Expected: `component-references-spec.llm.md` created; BLUF / schema-ref blocks populated in the canonical spec.

- [ ] **Step 2: Run doc gate**

```bash
cd formspec && npm run docs:check
```

Expected: pass. Most likely failure: an `x-lm.critical=true` schema node added without `examples`. The new ComponentBase fields include examples; double-check on regeneration. Add examples if the gate complains.

- [ ] **Step 3: Regenerate filemap**

```bash
cd formspec && npm run docs:filemap
```

Expected: `filemap.json` updated with `specs/component/component-references-spec*` entries.

- [ ] **Step 4: Full conformance suite**

```bash
cd formspec && python3 -m pytest tests/conformance/ -v
```

Expected: all pass. **Watch closely** — schema changes ripple. Likely failures:

- Validation-mapping suite regression: the §7.3 wording change shouldn't affect any test, but verify.
- Response Actions suite regression: §14.4 wording change shouldn't affect any test.
- The `test_component_no_rewrite_regression.py` is the canary; if it fails, the additive invariant broke.

- [ ] **Step 5: TypeScript / Rust check**

```bash
cd formspec && npm run check:deps && npm run build && cargo nextest run -p formspec-core 2>/dev/null || echo "rust check skipped or n/a"
```

Expected: passes or n/a if the change doesn't touch generated types. If TypeScript types are generated from `component.schema.json`, regenerate them as part of `docs:generate` (the doc pipeline should handle this).

- [ ] **Step 6: Commit generated artifacts**

```bash
cd formspec && git add specs/component/component-references-spec.md specs/component/component-references-spec.llm.md filemap.json
git commit -m "build(docs): regenerate component-references LLM artifact + filemap"
```

---

## Task 23: Promotion-gate verification checklist

Walk every concept §9 promotion gate. Do not skip.

- [ ] **Gate: SubmitButton compatibility (§9 row 4) — FULL CLOSURE**
  - [ ] Default submit action rule — §9.1 (this spec) + VM §7.1.
  - [ ] `actionRef` migration story — §10 zero migration.
  - [ ] Current event/API compatibility — §9.3 + §10.2.
  - [ ] Examples — every fixture in `tests/conformance/fixtures/component-references/`.
  - [ ] Adapters — §10.2 zero-change claim.
  - [ ] Validation-summary behavior — §10.3 preserved.
  - [ ] STOP IF: existing Component documents need rewrites. **Verified:** `test_component_no_rewrite_regression.py` passes over every pre-existing Component fixture.

- [ ] **Additivity invariant** — every new field OPTIONAL; no existing required-set additions; no enum closures tightened. Verified by `test_component_references_schema.py`.

- [ ] **Concept §11.3 (Component reference fields)** — RESOLVED in §1.5 with explicit promotion text and prerequisite verification.

- [ ] **Out-of-scope discipline** — verified by spec §1.1 scope statement and the omission of regeneration / Trace / multi-trigger work.

If any check fails: STOP. Do not advance to Task 24. Fix the spec / fixture / test until the check passes.

---

## Task 24: Architecture review dispatch

Per `formspec-stack/CLAUDE.md`: "Before AND after multi-file or seam-touching work" — this is seam-touching (Component ↔ Experience ↔ Response Actions ↔ VM) and the first non-additive schema change in the family. Dispatch the after-pass review.

- [ ] **Step 1: Dispatch as background subagent**

Use the Agent tool with `subagent_type: "formspec-specs:formspec-scout"` and `run_in_background: true`. Reviewer prompt:

```
Architecture review on the freshly landed Component References spec.

Scope:
- specs/component/component-references-spec.md (new)
- schemas/component.schema.json (modified: v1.1 additive)
- tests/conformance/{schemas,spec}/test_component_*.py (new)
- tests/conformance/fixtures/component-references/*.json (new)
- Edits to specs/component/component-spec.{md,bluf.md}, specs/core/validation-mapping.md,
  specs/response-actions/response-actions-spec.md, specs/experience/experience-spec.md,
  schemas/experience.schema.json, thoughts/specs/2026-05-20-formspec-semantic-layers.md.

Anchors to check:
- Concept §3 anchors preserved (SubmitButton compat, ValidationSummary compat, Locale ownership).
- Concept §5.5 (future-shape) updated to reflect promotion.
- Concept §6.6 (SubmitButton compatibility) fully closed; existing Component documents work unchanged.
- Concept §6.7 (Component owns concrete UI tree; references do NOT override Definition/Experience/Response Actions) — pinned in spec §7.3 (resolver no-mutation) and §1.4.1 (prohibitions).
- Concept §7.3 (future-shape example) — now valid current-schema example.
- Concept §9 row 4 promotion gate (SubmitButton compatibility) fully closed: default submit action rule, actionRef migration story, current event/API compatibility, examples, adapters, validation-summary behavior. Stop condition (existing Component docs need rewrites) verified by no-rewrite regression test.
- Concept §11.3 resolved in §1.5.
- Additivity invariant enforced by schema construction AND by no-rewrite test.

Specific concerns to probe:
1. Did the ComponentBase additions accidentally affect concrete-type unevaluatedProperties: false behavior? Spot-check 2-3 concrete types in fixtures.
2. Does the SubmitButton precedence rule cleanly handle the edge case where actionRef points at an Action whose intent is NOT submit (e.g., actionRef: "saveProgress" with intent: "save-draft")? Spec §9.1 says "the matched Action" — verify the test fixture covers this.
3. Does the resolver correctly handle Component documents with NO id on a node carrying unitRef? §7.3 output shape uses node id as the annotation key.
4. Is the cross-schema $ref to experience.schema.json portable? Different JSON Schema validators handle $ref resolution differently.
5. Does x-generation pollute serialization round-trips? If a renderer reads a document, normalizes, and writes back, does x-generation survive?

Findings format: Markdown, findings-first. Severity: BLOCKER / MAJOR / MINOR / NIT. Cite file:line for each.

Do NOT self-remediate. Surface BLOCKER findings for a fresh implementer / craftsman pass.
```

- [ ] **Step 2: Address BLOCKER findings**

If the reviewer surfaces BLOCKERs, file them as a follow-up plan (or dispatch `formspec-craftsman`) before the architecture review can sign off. MAJOR / MINOR / NIT findings may land in a follow-up commit.

- [ ] **Step 3: Final commit with reviewer summary**

```bash
cd formspec && git commit --allow-empty -m "docs(spec): component-references spec architecture review pass (draft)

Reviewer summary: <one paragraph from the reviewer's verdict>.
BLOCKER count: <n>. MAJOR count: <n>. Follow-ups: <list or 'none'>."
```

---

## Sequencing Recap

```
Tasks 1-3:   scaffolding + pipeline
Tasks 4-9:   spec prose (§1 → §14)
Tasks 10-11: schema delta (ComponentBase + SubmitButton)
Tasks 12-16: fixtures (base docs → additivity → resolution → precedence → x-generation)
Tasks 17-20: pytest (schema-shape → no-rewrite regression → resolver → precedence)
Task 21:     upstream back-references (Component, VM, RA, Experience, concept note, TODO-STACK)
Task 22:     doc pipeline + filemap + full test sweep
Task 23:     §9 promotion-gate checklist (manual, blocking)
Task 24:     architecture review dispatch
```

The no-rewrite regression test (Task 18) is the **load-bearing gate**: if it fails after the schema changes, the whole plan stops until the schema change is reduced or the offending pre-existing fixture is examined and intentionally updated (with reviewer approval).

## Out-of-Scope Reminders for the Implementer

These will tempt you. Resist:

- **Adding `actionRef` to a generic `Button` component or any component other than `SubmitButton`.** The extension pattern lives in §11; a new trigger component requires a named amendment, not a schema sneak-in.
- **Defining regeneration merge semantics because `x-generation.anchors` is there.** Concept §10.5, separate plan. This spec defines the anchor SHAPE only.
- **Adding "auto-fallback on unresolved `actionRef`" because it feels safer.** §9.1 explicitly forbids it; silent fallback masks author intent. The test enforces this.
- **Modifying existing component prop tables to mention new fields when the new fields apply to all components via ComponentBase.** The Component References spec is the source for the new fields; don't duplicate per-component.
- **Inventing new finding kinds beyond `COMP-REFERENTIAL-INTEGRITY`.** The single code keeps the lint surface simple; the `kind` discriminator covers the variation.
- **Trying to deep-validate `conceptRefs` against arbitrary Registry content.** Host policy. The resolver's default-info posture is intentional.

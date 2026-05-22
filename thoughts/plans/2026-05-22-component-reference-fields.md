---
title: Component Reference Fields — unitRef / taskRefs / conceptRefs / x-generation
date: 2026-05-22
status: draft
owner: spec-author
related:
  - thoughts/archive/plans/2026-05-22-component-action-references.md
  - thoughts/archive/plans/2026-05-22-component-references-spec.md
  - thoughts/specs/2026-05-20-formspec-semantic-layers.md
  - specs/component/component-spec.md
  - specs/experience/experience-spec.md
  - schemas/component.schema.json
  - schemas/experience.schema.json
---

# Component Reference Fields — Follow-Up to Plan E

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development.

**Status:** draft. This plan executes AFTER Plan E (Component Action References) and the Response Actions plan have landed. It carries forward the reference-field family from the superseded [Component References Spec plan](../archive/plans/2026-05-22-component-references-spec.md) — minus the dropped `defaultSubmitActionRef`-dependent precedence rule, since `actionRef` already landed via Plan E as required-not-optional.

**Goal:** Add four OPTIONAL reference fields to `ComponentBase` so every Component widget can carry them: `unitRef` (resolves against Experience), `taskRefs` (resolves against Experience), `conceptRefs` (resolves against Registry/Ontology), `x-generation` (provenance metadata, runtime-ignored). Define the cross-document resolver algorithm covering all reference fields. Pin a `COMP-REFERENTIAL-INTEGRITY` severity ladder. Prove zero migration of existing Component documents via a regression test loading every pre-existing fixture and benchmark reference against the amended schema.

**Architecture:** **Additive** schema evolution — current upstream still has `schemas/component.schema.json` at `$id` `/component/1.0` and `$formspecComponent: const "1.0"` after Plan E. This plan is therefore the first Component schema-version bump after ActionButton: `$id` moves from `/component/1.0` to `/component/1.1`, and `$formspecComponent` broadens from `const "1.0"` to `enum ["1.0", "1.1"]`. Do not invent a retroactive `1.2` baseline unless a separate version-ratification change lands first. New fields land on `ComponentBase` so every concrete widget inherits them via the existing `$ref`+`allOf` chain. Concrete widgets keep `unevaluatedProperties: false`; the new fields propagate because they are declared on the base. `conceptRefs.items` is a cross-schema `$ref` to `experience.schema.json#/$defs/ConceptRef`; `ActionButton.actionRef` remains an inline string property owned by Component §5.19, not a cross-schema `$ref`. `x-generation.anchors` is the structural seed for the future regeneration merge spec (concept §10.5); this plan defines shape only, not merge semantics.

**Tech Stack:** JSON Schema 2020-12, Markdown (BCP-14), pytest under `formspec/tests/conformance/`, schema_fixtures helper for cross-schema $ref tests.

**Sequencing:** Spec prose for the four field families → schema additions → resolver algorithm prose → fixtures (additivity, all-resolved happy path, each unresolved case at the right severity) → schema-shape pytest → no-rewrite regression pytest → resolver pytest → upstream back-references → doc pipeline.

**Citations:** "EXP §" = `specs/experience/experience-spec.md`. "RA §" = `specs/response-actions/response-actions-spec.md`. "COMP §" = `specs/component/component-spec.md` (post-Plan-E). "Plan E §" = `thoughts/archive/plans/2026-05-22-component-action-references.md` and the spec sections it lands.

---

## Preconditions

This plan MUST NOT execute until:

1. **Plan E** has landed: Component §5.19 is `ActionButton`, `actionRef` is required, VM §7 is deleted, `COMP-REFERENTIAL-INTEGRITY` finding code is established. This plan extends the finding code's severity ladder; it does not redefine it.
2. **Response Actions plan** has landed: `actions[*].id` is the resolution target for any future ActionButton work but is not directly required here.
3. **EXP §6.3 resolution contract** is in place (Plan E updates this). `Unit.id`, `Task.id`, and `ConceptRef` shapes are stable.

Verify before Task 1:

```bash
cd formspec && grep -q "ActionButton" schemas/component.schema.json && echo "Plan E: OK"
cd formspec && grep -q "COMP-REFERENTIAL-INTEGRITY" specs/component/component-spec.md && echo "Finding code: OK"
```

---

## File Structure

### Created

| Path | Responsibility |
|---|---|
| `specs/component/component-reference-fields-spec.md` | Canonical prose for the four field families + the full cross-document resolver. |
| `specs/component/component-reference-fields-spec.bluf.md` | BLUF source. |
| `specs/component/component-reference-fields-spec.llm.md` | Generated LLM artifact. |
| `tests/conformance/schemas/test_component_reference_fields_schema.py` | Schema-shape pytest. Pins additive evolution, OPTIONAL invariant, cross-schema `$ref` to Experience. |
| `tests/conformance/spec/test_component_no_rewrite_regression.py` | Loads every pre-existing Component fixture/reference under `tests/`, `examples/`, `benchmarks/tasks/**/reference/`, and generated-doc fixture surfaces, validates against amended schema. One failure breaks the additivity invariant. |
| `tests/conformance/spec/test_component_reference_resolution.py` | Cross-document resolver pytest. Pins severity-by-kind table, determinism, no-mutation. |
| `tests/conformance/fixtures/component-reference-fields/` (directory) | Per-field fixtures: happy path + each unresolved case at the right severity. |

### Modified

| Path | Why |
|---|---|
| `schemas/component.schema.json` | `$id` → `/1.1`; `$formspecComponent` enum extended to `["1.0", "1.1"]`; four OPTIONAL fields on `ComponentBase`. No existing field modifications. |
| `specs/component/component-spec.md` | Append §11 "Cross-References" pointing at the new spec. Append BLUF bullet. |
| `specs/core/validation-mapping.md` | No edit. (VM §7 was deleted by Plan E.) |
| `specs/experience/experience-spec.md` | Update `Unit.id` / `Task.id` prop descriptions to point at the now-landed `unitRef` / `taskRefs` semantics. |
| `thoughts/specs/2026-05-20-formspec-semantic-layers.md` | Mark §10.4 fully landed; mark §11.3 fully resolved. |
| `tests/contracts/surface-coverage.json` | Add `componentReferenceFields` contract row. |
| `scripts/spec-artifacts.config.json` | Register new spec. |
| `crates/formspec-lint/schemas/component.schema.json` | Re-sync via `make sync-lint-schemas` (target from Plan E). |
| `filemap.json` | Regenerated. |

### Explicitly NOT in scope

- **Regeneration merge semantics.** `x-generation.anchors` shape only; how merges resolve conflicts is concept §10.5, separate plan.
- **Trace.** Concept §10.6, separate plan.
- **Deep validation of conceptRefs against Registry/Ontology content.** Default `info` severity; host policy MAY upgrade.
- **Adding actionRef to other Component widgets.** Plan E §5.19.1.1's named-amendment pattern governs that.
- **Schema `$id` break.** Schema evolution is additive from the current upstream baseline: v1.0/v1.1 documents validate against the v1.1 schema. This does not restore the retired `SubmitButton` path; Plan E's non-additive ActionButton refactor is already current repo truth.

---

## Self-Review Note

- **Additivity invariant** enforced two ways: (a) schema construction — every new field OPTIONAL, no existing field modified; (b) the no-rewrite regression test — every pre-existing Component fixture and benchmark reference validates unchanged. This is the load-bearing gate.
- **Severity ladder reuses Plan E's finding code.** No new finding-code family invented; `COMP-REFERENTIAL-INTEGRITY` with `kind` discriminator covers every reference type.
- **`x-generation` is metadata-only.** Runtime renderers MUST ignore it. The plan flags this as an enforceable invariant via a fixture pair: two Component documents identical except for `x-generation` MUST render identically (asserted by an E2E test that mounts both and diffs the DOM).
- **Cross-schema `$ref` portability.** `conceptRefs.items` $refs Experience's `ConceptRef` $def. Different JSON Schema validators handle $ref resolution differently; the test uses `build_schema_registry` (the project helper) so the resolution path matches production. Do not model `actionRef` the same way; current Component schema owns that string shape inline.
- **Cold-read test:** a future agent reading this plan alone produces a conforming implementation without referring to the superseded plan or Plan E (the preconditions list anchors the dependencies).

---

## Task 1: Scaffold spec files

- [x] Task 1A: Create `specs/component/component-reference-fields-spec.{md,bluf.md}` scaffold.
- [ ] Task 1B: Register in `spec-artifacts.config.json` with generated `.llm.md` once proof-surface files exist.
- [ ] Task 1C: Add `tests/contracts/surface-coverage.json` row in the same proof-surface slice as Task 1B.

Architecture review found that Task 1B and Task 1C cannot be scaffold-only in the current repo gates: every configured spec/schema pair must have a local enforced contract row, and every enforced row must point at existing proof surfaces. Deferring both avoids either a failing metadata gate or a false proof claim.

## Task 2: Spec prose — §1 Introduction + §1.5 promotion resolution

- [x] Draft §1 Introduction and §1.5 promotion resolution.

Draft §1 (purpose, relationship to existing specs, design principles, conformance levels, prohibitions) and §1.5 explaining that concept §11.3 promotes the four field names from "future" to current Component schema. Cite Plan E's `actionRef` as the precedent.

## Task 3: §2 unitRef

- [x] Draft §2 `unitRef` shape, resolution, findings, and runtime semantics.

Shape (string matching `Unit.id` pattern), resolution (against `experience.units[*].id`), severity (`error` for unresolved when Experience present; `info` per-node when Experience absent). Reference-only — no rendering effect, no Experience coverage mutation.

## Task 4: §3 taskRefs

Shape (array of strings matching `Task.id` pattern), resolution (against `experience.tasks[*].id`), severity (`warning` per node with at least one miss; `info` per node when Experience absent). Advisory — task references do not block rendering.

## Task 5: §4 conceptRefs

Shape (array of `ConceptRef` objects, $ref to `experience.schema.json#/$defs/ConceptRef`), resolution (host-policy), default severity `info`. Hosts MAY upgrade via strict mode.

## Task 6: §5 x-generation

Shape (`{ source, strategy, generatedBy, anchors, generatedAt }`, all OPTIONAL, `additionalProperties: true` for generator extensions). Runtime posture: MUST be ignored by renderers. Anchors prefix taxonomy: `item:` / `unit:` / `task:` / `action:` / `concept:`.

## Task 7: §6 Cross-Document Resolution Algorithm

Define `ResolutionContext = (Component, Experience?, ResponseActions?, Registry?)`. Define `ResolutionReport` shape: findings list + per-node annotation map. Annotation keys MUST use `node.id` when present and a stable JSON Pointer / tree path when `id` is absent, because `ComponentBase.id` is optional. Pin resolver invariants: deterministic, no-mutation, one-directional (Component reads from Experience/Response Actions/Registry but never writes). Algorithm walks the Component tree, resolves each reference field, emits findings per the severity table. Same code (`COMP-REFERENTIAL-INTEGRITY`) used by Plan E's ActionButton resolver; this plan adds the kind discriminators.

## Task 8: §7 Findings — severity-by-kind table

| `kind` | Condition | Severity |
|---|---|---|
| `actionRef` | (from Plan E §5.19.4.2 — not redefined here) | (Plan E owns) |
| `unitRef` | Reference unresolved, Experience present | `error` |
| `unitRef` | Node carries `unitRef`, Experience absent | `info` |
| `taskRefs` | One or more entries unresolved, Experience present | `warning` (per node) |
| `taskRefs` | Node carries `taskRefs`, Experience absent | `info` (per node) |
| `conceptRefs` | Unresolved under default host policy | `info` |
| `x-generation.anchors` | Anchor unresolved | `info` |

Closure: hosts MUST NOT downgrade `error`; MAY upgrade lower severities under strict mode (host-defined).

## Task 9: §8 Conformance — additivity, resolver, no-rewrite

Three conformance levels:

1. **Schema additivity.** Every new field OPTIONAL. No existing field type/required-set/enum/pattern modified.
2. **Resolver.** Implements §6 algorithm; emits findings per §7; respects invariants (determinism, no-mutation, one-directional).
3. **No-rewrite.** Every pre-existing Component fixture and benchmark reference validates unchanged.

## Task 10: Schema delta — ComponentBase additions

Add four properties to `$defs/ComponentBase.properties`. Bump `$id` to `/1.1`. Broaden `$formspecComponent` enum to `["1.0", "1.1"]`. Cross-schema `$ref` for `conceptRefs.items`. Schema syntax + well-formedness checks via Ajv 2020-12.

## Task 11: Author shared base fixtures

Definition / Experience / Response Actions base documents — same shape family as Plan E's fixtures so cross-fixture composition works.

## Task 12: Author additivity + happy-path fixtures

- `component-no-refs.json`: zero new fields. Backward-compat baseline.
- `component-all-refs-resolved.json`: every new field present, all resolving. Expected: zero findings, full annotation map.

## Task 13: Author per-kind unresolved fixtures

- `component-unit-ref-unresolved.json` → expects severity `error`, kind `unitRef`.
- `component-task-refs-unresolved.json` → expects severity `warning`, kind `taskRefs` (one finding per node, not per entry).
- `component-concept-refs-unresolved.json` → expects severity `info`, kind `conceptRefs`.
- `component-no-experience-document.json` → tree carries `unitRef`/`taskRefs` but no Experience loaded → `info` findings per node.

## Task 14: Author x-generation fixture

- `x-generation-anchors-coverage.json`: every anchor resolves; coverage report 100%; runtime-ignore invariant claim recorded (actual DOM-identity check is a renderer test, not this fixture).

## Task 15: Schema-shape pytest

```python
from tests.unit.support.schema_fixtures import build_schema_registry
# ... pin: $id /1.1, $formspecComponent enum extended, four new properties on
# ComponentBase, OPTIONAL invariant, conceptRefs $ref to Experience ConceptRef,
# ComponentBase has no unevaluatedProperties: false (intentional — base must remain
# open so new fields propagate through the $ref+allOf chain), no existing field
# modifications.
```

## Task 16: No-rewrite regression pytest

```python
# Discover every JSON file under tests/conformance/fixtures/, tests/e2e/fixtures/,
# tests/fixtures/, examples/, benchmarks/tasks/**/reference/, and docs/ that looks
# like a Component document. Exclude the new directory
# tests/conformance/fixtures/component-reference-fields/. Validate each against the
# amended schema. ONE failure breaks the additivity invariant and the spec MUST NOT
# land. Do not use the looser benchmark score gate here; this test validates only
# Component documents that advertise $formspecComponent.
```

## Task 17: Resolver pytest

Inline reference resolver implementing §6. Fixture-driven assertions on findings per the §7 severity table. Plus invariants: determinism (run twice, identical output), no-mutation (deep-copy comparison), one-directional (Experience/Response Actions documents unchanged after resolution), and stable annotation identity for nodes without `id`.

## Task 18: Renderer-ignore invariant E2E

Two Component documents identical except for `x-generation`. Mount both via Playwright. DOM snapshot diff MUST be empty. Pins the §5 runtime-ignore claim in the new reference-fields spec.

## Task 19: Upstream back-references

Component §11 Cross-References + BLUF bullet. Experience prop descriptions updated. Concept-note §10.4 / §11.3 marked fully landed. TODO-STACK row updated. Sync lint crate schemas via `make sync-lint-schemas` (target from Plan E).

## Task 20: Doc pipeline + filemap + full sweep

`npm run docs:generate`, `npm run docs:check`, `npm run docs:filemap`. Full conformance suite. Layering check. Cargo nextest for any crate that consumes `component.schema.json`.

## Task 21: Promotion-gate verification + architecture review dispatch

Walk concept §9 promotion gates touching Component references. Dispatch a background scout review on the additive change set.

---

## Sequencing Recap

```
Task 1:        scaffold + register
Tasks 2-9:     spec prose
Task 10:       schema delta
Tasks 11-14:   fixtures
Tasks 15-18:   pytest + E2E
Task 19:       upstream back-references + lint-crate sync
Task 20:       doc pipeline + sweeps
Task 21:       promotion-gate + architecture review
```

## Out-of-scope reminders

- **Do not break Plan E's `COMP-REFERENTIAL-INTEGRITY` model.** Extend its `kind` discriminator; do not invent a new code family.
- **Do not change Plan E's actionRef severity rules.** Plan E owns `actionRef` kind; this plan is silent on it.
- **Do not define merge semantics for x-generation.** Anchor shape only; concept §10.5 owns merge behavior.
- **Do not deep-validate conceptRefs.** Host policy.
- **Do not tighten any existing field.** The no-rewrite regression test catches it.

## Deviations

- 2026-05-22: Before Task 1, external review found Response Actions validation-tuple hardening gaps in the dirty precondition slice. Remediated those HIGH/WARNING findings first so the Response Actions precondition remains audit-ready before component reference fields land; also fixed the related dist-backed warning-test isolation and archived thought-plan links needed by the gate.
- 2026-05-22: Architecture review blocked scaffold-only `spec-artifacts.config.json` and `surface-coverage.json` edits. Repo gates require every configured spec/schema pair to have an enforced, path-backed contract row; adding either now would fail metadata checks or overclaim proof. Task 1 was split into Task 1A now, with Task 1B/1C deferred to the proof-surface slice.

---
title: Regeneration Merge — three-way Component merge driven by x-generation.anchors
date: 2026-05-22
status: draft
owner: spec-author
related:
  - thoughts/specs/2026-05-20-formspec-semantic-layers.md
  - thoughts/plans/2026-05-22-component-reference-fields.md
  - specs/component/component-spec.md
  - specs/component/component-reference-fields-spec.md
  - specs/experience/experience-spec.md
  - specs/response-actions/response-actions-spec.md
---

# Regeneration Merge — Follow-Up to Component Reference Fields

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development.

**Status:** draft. This plan executes AFTER the [Component Reference Fields plan](2026-05-22-component-reference-fields.md) lands (`x-generation` shape stable, anchor taxonomy pinned). It implements [follow-on spec #5 of the semantic-layers concept note](../specs/2026-05-20-formspec-semantic-layers.md) — the "small generation companion" branch of concept §10.5. Concept §10.5 names the artifact and concept §7.2 enumerates its contents; this plan turns both into a canonical spec, fixtures, and a deterministic algorithm pytest.

**Goal:** Author the canonical regeneration merge spec at `specs/component/regeneration-merge-spec.md`. Define a deterministic three-way merge (`old-generated` ⊕ `designer-edited` ⊕ `new-generated` → `merged + merge-report`) keyed by `x-generation.anchors`. Pin source-anchor identity, generated-node detection, designer-edit preservation rules, conflict severities, orphan handling, rename/migration handling, and Studio review UX expectations. Prove the algorithm is deterministic, no-mutation on inputs, and identical-output across implementations via fixture-driven pytest.

**Architecture:** Three-way merge keyed by `x-generation.anchors`. A node is identified across the three input trees by its anchor set (not by tree position or `id`), because designers may reorder and `id` is OPTIONAL on `ComponentBase`. The merge walks `new-generated` (the structural authority for what SHOULD exist), then for each node looks up the matching `old-generated` node (was it always there?) and the `designer-edited` node (did a designer touch it?). Three-way diff against `old-generated` as the common ancestor decides: keep designer edit, regenerate, or surface a conflict. Orphans (in `designer-edited` but not `new-generated`) are preserved but marked `orphan` in the report — concept §7.2 "Never silently delete designer-authored layout." Output: `merged` Component document (schema-valid) + `MergeReport` (structured surviving / regenerated / orphaned / pending-review / conflict lists). The `MergeReport` is the structural seed for the future Trace impact map (concept §10.6); this plan defines its shape, not Trace's query surface.

**Tech Stack:** JSON Schema 2020-12, Markdown (BCP-14), pytest under `formspec/tests/conformance/`, Python merge harness lives inline in the pytest (the spec is the contract; runtime implementations land in separate engine plans).

**Sequencing:** Spec prose §1–§11 → MergeReport schema → fixtures (each merge case in concept §7.2 plus orphan/rename) → algorithm pytest → invariant pytest (determinism, no-mutation, idempotency) → Studio E2E (gated — defer if Studio isn't ready) → upstream back-references → doc pipeline.

**Citations:** "CRF §" = `specs/component/component-reference-fields-spec.md`. "COMP §" = `specs/component/component-spec.md`. "EXP §" = `specs/experience/experience-spec.md`. "RA §" = `specs/response-actions/response-actions-spec.md`. "Concept §" = `thoughts/specs/2026-05-20-formspec-semantic-layers.md`.

---

## Preconditions

This plan MUST NOT execute until:

1. **Component Reference Fields plan** has landed completely (all 21 tasks): `x-generation` shape stable in `schemas/component.schema.json` v1.1, `x-generation.anchors` taxonomy pinned (`item:` / `unit:` / `task:` / `action:` / `concept:`), `COMP-REFERENTIAL-INTEGRITY` kind `"x-generation.anchors"` finding code in place.
2. **Concept §10.5 / §7.2 still describe regeneration merge** the way this plan derives from. If the concept note changed, re-anchor before authoring.

Verify before Task 1:

```bash
cd formspec && grep -q '"x-generation"' schemas/component.schema.json && echo "x-generation schema: OK"
cd formspec && grep -q '"$id".*"/component/1.1"' schemas/component.schema.json && echo "Component v1.1: OK"
cd formspec && grep -q 'x-generation.anchors' specs/component/component-reference-fields-spec.md && echo "Anchor taxonomy: OK"
cd formspec && grep -q 'COMP-REFERENTIAL-INTEGRITY' specs/component/component-reference-fields-spec.md && echo "Finding code: OK"
```

If any check fails, stop and surface to the user — the Component Reference Fields plan is the blocker.

---

## Design Decisions (load-bearing)

Flagged here so an architecture-review pass can pressure-test them before prose lands.

| Decision | Choice | HIGH/MED/LOW confidence | Rationale |
|---|---|---|---|
| Merge identity key | `x-generation.anchors` set, not `id` or tree position | HIGH | `ComponentBase.id` is OPTIONAL; tree position is unstable across designer reordering and regeneration; anchors are the only semantic identity carried into the merge. |
| Merge model | Three-way (`old-generated` ⊕ `designer-edited` ⊕ `new-generated`) | HIGH | Concept §7.2 enumerates exactly these three inputs. Two-way merge cannot distinguish "designer changed this" from "regenerator changed this." |
| Required input | `old-generated` snapshot MUST be persisted between generations | HIGH | Without the common ancestor, three-way merge collapses to two-way and loses the ability to detect designer intent. The spec MUST require hosts to persist it; the storage mechanism is host-defined. |
| Anchor mismatch policy | Multi-anchor nodes match by anchor-set equality (not subset) | MEDIUM | Subset-match would let a refactor that drops an anchor silently merge into the wrong target. Equality + an explicit `rename` migration concept is cleaner. |
| Finding code family | New `COMP-REGENERATION-*` codes, NOT extending `COMP-REFERENTIAL-INTEGRITY` | HIGH | Reference-integrity findings are static (read-time); regeneration findings are merge-time conflicts. Conflating them collapses two distinct surfaces in tooling. |
| MergeReport schema | Yes — new `regeneration-merge-report.schema.json` | MEDIUM | Schematizing the report enables cross-runtime conformance and gives Trace (concept §10.6) a concrete structural seed. Alternative: prose-only seed with no schema until Trace lands. Recommend schema. |
| Rename handling | Honor `migration` markers in `x-generation`; otherwise warn | HIGH | Concept §7.2 explicit: "If no migration explains the rename, the generator should warn instead of guessing." Pin in spec. |
| Studio E2E scope | Optional in v1.0 of this spec; pending-review-marker DOM assertion only | MEDIUM | Full Studio review UX is product surface; pinning DOM-level review-marker behavior is the minimum conformance lever. |

Decisions marked HIGH should not change without owner pushback. MEDIUM decisions are open to architecture-review feedback.

---

## File Structure

### Created

| Path | Responsibility |
|---|---|
| `specs/component/regeneration-merge-spec.md` | Canonical prose for the merge contract — algorithm, severities, orphan handling, rename handling, review UX. |
| `specs/component/regeneration-merge-spec.bluf.md` | BLUF source. |
| `specs/component/regeneration-merge-spec.llm.md` | Generated LLM artifact (do not hand-edit). |
| `schemas/regeneration-merge-report.schema.json` | Structured shape of the `MergeReport`: `surviving[]`, `regenerated[]`, `orphaned[]`, `pendingReview[]`, `conflicts[]`, each entry carrying `anchors`, `nodePath`, `reason`, `severity`. |
| `tests/conformance/spec/test_regeneration_merge_algorithm.py` | Algorithm pytest. Drives every fixture pair through an inline reference merger; asserts merged document + MergeReport shape against expected output. |
| `tests/conformance/spec/test_regeneration_merge_invariants.py` | Invariant pytest: determinism (two runs identical), no-mutation (inputs unchanged after merge), idempotency (merging twice with no source change yields identical output). |
| `tests/conformance/spec/test_regeneration_merge_report_schema.py` | Schema-shape pytest for `regeneration-merge-report.schema.json`. |
| `tests/conformance/fixtures/regeneration-merge/` | Per-case fixture directory. Each case is a directory with `old-generated.json`, `designer-edited.json`, `new-generated.json`, `expected-merged.json`, `expected-report.json`. |

### Modified

| Path | Why |
|---|---|
| `specs/component/component-spec.md` | Append §11 cross-reference to regeneration merge spec. |
| `specs/component/component-reference-fields-spec.md` | Replace the §5 "regeneration merge behavior is explicitly out of scope" disclaimer with a forward-pointer to the new spec. |
| `thoughts/specs/2026-05-20-formspec-semantic-layers.md` | Mark §10.5 landed (link). Update concept §7.2 status note. |
| `scripts/spec-artifacts.config.json` | Register new spec + BLUF + LLM + schema entries. |
| `tests/contracts/surface-coverage.json` | Add `regenerationMerge` contract row pointing at the three pytests + fixture dir. |
| `crates/formspec-lint/schemas/regeneration-merge-report.schema.json` | Mirror via `make sync-lint-schemas` so lint surface stays current. |
| `filemap.json` | Regenerated. |

### Explicitly NOT in scope

- **Trace query/cache spec.** The MergeReport is the structural seed for Trace's first consumer (concept §10.6), but the Trace query surface, predicate set, and cache discipline are concept §10.6 — separate plan.
- **Runtime merger implementation.** This is a spec + conformance plan. Engine implementations (Rust crate, TypeScript engine, Python tooling) land in their own plans that consume this spec.
- **Studio review screen design.** Visual design and full Studio UX are product surface; only the DOM-level pending-review-marker conformance contract lives here.
- **Host-defined merge policy hooks.** Concept §7.2 baseline rules only; host overrides are a v1.1 extension.
- **Migrations spec.** Rename handling honors `migration` markers; the migration document format itself is owned by an existing spec — this plan only references it.

---

## Self-Review Note

- **Three-way merge identity** keyed on anchor-set equality is the load-bearing design. Tests MUST cover: anchor-set match, anchor-set mismatch (orphan in designer-edited, new node in new-generated), partial anchor overlap (treated as mismatch + warn).
- **`old-generated` persistence** is a host requirement, not a spec data shape. Surface it explicitly in §2 — implementations that drop the common ancestor cannot pass conformance.
- **Finding-code separation** (`COMP-REGENERATION-*` vs `COMP-REFERENTIAL-INTEGRITY`) keeps merge-time conflicts and static reference-integrity findings distinct in tooling. Do not collapse.
- **Idempotency** is the strongest correctness check: re-running merge with identical inputs MUST yield byte-identical output. Pinned by `test_regeneration_merge_invariants.py`.
- **Cold-read test:** a future agent reading this plan alone produces a conforming spec without referring to the concept note. Concept §7.2 baseline rules are quoted verbatim in Task 7's spec-prose section.

---

## Task 1: Scaffold spec files

- [ ] Task 1A: Create `specs/component/regeneration-merge-spec.{md,bluf.md}` scaffold with frontmatter, status block, BLUF marker block, TOC, and §1–§11 headers (empty bodies).

```bash
# Spec file frontmatter (mirror component-reference-fields-spec.md)
title: Formspec Regeneration Merge
version: 1.0.0-draft.1
date: 2026-05-22
status: draft
depends_on:
  - specs/component/component-spec.md
  - specs/component/component-reference-fields-spec.md
  - specs/experience/experience-spec.md
  - specs/response-actions/response-actions-spec.md
  - thoughts/specs/2026-05-20-formspec-semantic-layers.md
```

- [ ] Task 1B: Register in `scripts/spec-artifacts.config.json` AFTER Tasks 12–17 fixtures/pytests exist (deferred — same repo-gate constraint that forced the active plan's 1B/1C split).
- [ ] Task 1C: Add `tests/contracts/surface-coverage.json` row AFTER Task 17 lands the resolver pytest (deferred for the same reason).

Reasoning for the split: the active Component Reference Fields plan documents this exact constraint in its Task 1 note. Every configured spec/schema pair must have an enforced contract row pointing at existing proof surfaces; scaffold-only registration fails the metadata gate.

- [ ] Task 1D: Commit.

```bash
git commit specs/component/regeneration-merge-spec.md specs/component/regeneration-merge-spec.bluf.md -m "spec(regeneration-merge): scaffold spec files (draft)"
```

## Task 2: Spec prose — §1 Introduction + scope + relationship

- [ ] Draft §1 covering: purpose (concept §7.2 + §10.5), scope (three-way Component merge only), out-of-scope (Trace, runtime engines, Studio UX, migration document format), relationship to Component Reference Fields (consumes `x-generation`), conformance posture, BCP-14 keyword usage.

The §1 prose MUST state the `old-generated` persistence requirement explicitly. A host that does not persist `old-generated` cannot perform three-way merge and therefore cannot conform.

- [ ] Commit.

## Task 3: Spec prose — §2 Inputs and outputs

- [ ] Draft §2 defining the three inputs (`old-generated`, `designer-edited`, `new-generated`) and two outputs (`merged`, `MergeReport`). Pin each input/output to the Component schema (`$formspecComponent` v1.1) and the MergeReport schema (Task 11).

Inputs in pseudo-form:

```
merge(
  old_generated: Component v1.1,
  designer_edited: Component v1.1,
  new_generated: Component v1.1,
  context: { definition?, experience?, response_actions?, registry?, ontology?, migrations? }
) -> { merged: Component v1.1, report: MergeReport }
```

§2 MUST clarify that `context` is the same `ResolutionContext` as CRF §6 — the merge consumes the same cross-document context as the resolver.

- [ ] Commit.

## Task 4: Spec prose — §3 Source anchor identity

- [ ] Draft §3 defining how nodes are matched across the three input trees.

Rule: a node N_old in `old-generated` matches a node N_new in `new-generated` iff `N_old.x-generation.anchors` equals `N_new.x-generation.anchors` as a set (order-independent, duplicate-free). Same rule applies to matching `designer-edited` nodes against `new-generated`.

§3 MUST address: nodes without `x-generation` (treated as designer-authored from inception; matched by `id` if present, otherwise by stable tree-path); nodes with empty `anchors` (treated same as no `x-generation`); anchors taxonomy reuse (`item:`, `unit:`, `task:`, `action:`, `concept:` — already pinned by CRF §5).

- [ ] Commit.

## Task 5: Spec prose — §4 Generated-node markers

- [ ] Draft §4 defining when a node is considered "generated" for merge purposes.

Rule: presence of `x-generation` with at least one of `source`, `strategy`, `generatedBy`, or non-empty `anchors`. Nodes without `x-generation` are designer-authored from inception and are preserved as-is across regeneration (they cannot be regenerated because they have no source linkage).

§4 MUST address: how a designer "adopts" a generated node by editing it (the node retains `x-generation`; designer edits are tracked via the three-way diff against `old-generated`).

- [ ] Commit.

## Task 6: Spec prose — §5 Designer-edit detection

- [ ] Draft §5 defining how the merge detects that a designer edited a generated node.

Algorithm: for each node N_designer in `designer-edited` with matching N_old in `old-generated`, compare every property and subtree. Any difference is a designer edit. Differences are categorized:

| Diff class | Example | Default treatment |
|---|---|---|
| Property override | designer changed `props.label` from "Name" to "Full Name" | Preserve if N_new's same property equals N_old's (designer-only); conflict if N_new also changed it. |
| Children reorder | designer reordered two children | Preserve designer order; regenerate child content if N_new changed it. |
| Children add | designer inserted a child not present in old or new | Preserve and mark `designer-inserted`. |
| Children remove | designer deleted a child present in old; new still has it | Conflict — designer intent vs source authority. |
| Widget swap | designer changed `component: TextInput` → `TextArea` | Preserve (designer intent dominates widget choice); flag `pending-review`. |

§5 MUST emphasize: the algorithm operates on JSON values, not on visual semantics. Renderers are free to surface diffs visually; the spec defines structural rules only.

- [ ] Commit.

## Task 7: Spec prose — §6 Merge algorithm

- [ ] Draft §6 enumerating the baseline merge rules from concept §7.2 verbatim, then expanding each with full preconditions and outputs.

```text
Preserve designer edits when their source anchors still resolve.
Regenerate nodes whose itemRef, actionRef, or unitRef changed.
Mark orphaned nodes when their bind, actionRef, or unitRef no longer resolves.
Add newly generated fields and actions as pending review.
Never silently delete designer-authored layout.
```

§6 MUST present the algorithm as a deterministic node-by-node walk:

```text
for each N_new in new_generated (depth-first, document order):
  N_old = match_in(old_generated, N_new.anchors)
  N_designer = match_in(designer_edited, N_new.anchors)

  if N_old is None and N_designer is None:
    emit N_new to merged; report.pendingReview += N_new

  elif N_old is None and N_designer is not None:
    # Designer authored independently; new-generation reaches into this anchor.
    emit N_designer to merged; report.conflicts += { kind: "designer-precedes-generation", ... }

  elif N_old is not None and N_designer is None:
    # Designer removed the generated node; treat as designer-removal conflict.
    emit nothing to merged; report.conflicts += { kind: "designer-removed", ... }

  elif structurally_equal(N_old, N_designer):
    # Designer untouched; regenerate from N_new.
    emit N_new to merged; report.regenerated += N_new

  else:
    # Three-way diff.
    merged_node = three_way_merge_node(N_old, N_designer, N_new)
    emit merged_node to merged
    if had_conflicts(merged_node):
      report.conflicts += { ... }
    else:
      report.surviving += merged_node

# Orphan pass:
for each N_designer in designer_edited with no matching N_new:
  emit N_designer to merged (preserve); report.orphaned += N_designer
```

§6 MUST also pin: traversal order is depth-first document order (deterministic); a node's children are merged before the node itself is emitted (so subtree conflicts surface inline).

- [ ] Commit.

## Task 8: Spec prose — §7 Conflict severities + finding codes

- [ ] Draft §7 introducing the `COMP-REGENERATION-*` finding family and pinning the severity table.

| Code | Condition | Severity |
|---|---|---|
| `COMP-REGENERATION-DESIGNER-PRECEDES` | Designer-authored node at an anchor that new-generation also produced | `warning` |
| `COMP-REGENERATION-DESIGNER-REMOVED` | Designer deleted a generated node; new-generation still produces it | `warning` |
| `COMP-REGENERATION-PROPERTY-CONFLICT` | Both designer and new-generation changed the same property | `warning` |
| `COMP-REGENERATION-WIDGET-SWAP` | Designer swapped widget; new-generation changed widget | `warning` (pending-review) |
| `COMP-REGENERATION-ORPHAN-BINDING` | Designer node's `bind` / `actionRef` / `unitRef` no longer resolves | `error` |
| `COMP-REGENERATION-ORPHAN-NODE` | Designer-edited subtree has no matching anchor in new-generation and no resolvable references | `warning` |
| `COMP-REGENERATION-RENAME-UNDOCUMENTED` | Anchor set differs between old and new in a pattern consistent with a rename, no `migration` marker present | `warning` |
| `COMP-REGENERATION-RENAME-MIGRATED` | Anchor set differs between old and new, `migration` marker explains the rename | `info` |
| `COMP-REGENERATION-PENDING-REVIEW` | Newly generated node not present in old or designer | `info` |

§7 MUST state: hosts MUST NOT downgrade `error`. Hosts MAY upgrade lower severities under a host-defined strict mode.

- [ ] Commit.

## Task 9: Spec prose — §8 Orphan handling

- [ ] Draft §8 defining orphan handling end-to-end.

Rules:

1. A designer-edited node with no anchor match in new-generation is preserved in `merged` (concept §7.2: "Never silently delete designer-authored layout").
2. If the orphan's `bind` / `actionRef` / `unitRef` reference still resolves in the current cross-document context, severity is `warning` (`COMP-REGENERATION-ORPHAN-NODE`).
3. If the orphan's references no longer resolve, severity escalates to `error` (`COMP-REGENERATION-ORPHAN-BINDING`).
4. Orphans appear in `MergeReport.orphaned[]` with their full anchor set and resolution status.

§8 MUST address rendering: orphan nodes render normally (the designer authored them, they should display). Tooling MAY visually mark them; the spec does not mandate.

- [ ] Commit.

## Task 10: Spec prose — §9 Rename and migration handling

- [ ] Draft §9 defining rename detection and migration honoring.

Rule: if a node N_new has anchors that differ from candidate N_old by a pattern consistent with a rename (e.g., `item:dateOfBirth` → `item:birthDate`), the merge consults the loaded migration document (if any). If a migration entry maps the old anchor → new anchor, the merge:

1. Treats N_old and N_new as matched.
2. Applies the new anchor and binding.
3. Preserves designer presentation choices (label, widget, layout).
4. Emits `COMP-REGENERATION-RENAME-MIGRATED` finding at `info` severity.

If no migration explains the rename, the merge:

1. Does NOT match N_old to N_new (anchor-set equality rule remains primary).
2. Marks N_old as orphan; N_new as pending-review.
3. Emits `COMP-REGENERATION-RENAME-UNDOCUMENTED` at `warning` severity (per concept §7.2: "the generator should warn instead of guessing").

§9 MUST point at the existing migration document format; this spec does not redefine it.

- [ ] Commit.

## Task 11: Spec prose — §10 Studio review UX expectations

- [ ] Draft §10 defining the minimum review-surface contract.

A Studio-grade review surface MUST:

1. Render every entry in `MergeReport.conflicts[]` with its anchor set, severity, finding code, and human-readable reason.
2. Provide per-conflict resolution affordance (accept designer / accept regenerated / manual edit) — affordance is host-defined; the spec only mandates that conflicts surface.
3. Render every entry in `MergeReport.pendingReview[]` with a `pending-review` marker on the affected node in the rendered Component preview. DOM-level: the rendered node MUST carry `data-merge-status="pending-review"` (the only DOM-level conformance lever in this spec).
4. Render every entry in `MergeReport.orphaned[]` with an `orphan` marker; DOM-level: `data-merge-status="orphan"`.

§10 MUST clarify: these are minimum conformance levers. Full Studio review UX (visual design, interaction model, keyboard flows, undo/redo) is product surface, not spec.

- [ ] Commit.

## Task 12: Spec prose — §11 Conformance

- [ ] Draft §11 pinning three conformance levels:

1. **Algorithm.** Implements §6 algorithm; emits findings per §7; honors §8/§9 orphan and rename rules.
2. **Report shape.** `MergeReport` validates against `regeneration-merge-report.schema.json`.
3. **Invariants.** Determinism (two identical inputs → identical merged + report); no-mutation (inputs deep-equal before and after merge); idempotency (re-merging with identical sources yields identical output).

§11 MUST state: a runtime that fails any one level does not conform. Schema-validity of the merged Component document is implicit (the output is a Component v1.1 document).

- [ ] Commit.

## Task 13: Author MergeReport schema

- [ ] Create `schemas/regeneration-merge-report.schema.json`. JSON Schema 2020-12.

Shape:

```json
{
  "$id": "https://formspec.org/schemas/regeneration-merge-report/1.0",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["version", "surviving", "regenerated", "orphaned", "pendingReview", "conflicts"],
  "properties": {
    "version": { "const": "1.0" },
    "surviving":    { "type": "array", "items": { "$ref": "#/$defs/Entry" } },
    "regenerated":  { "type": "array", "items": { "$ref": "#/$defs/Entry" } },
    "orphaned":     { "type": "array", "items": { "$ref": "#/$defs/Entry" } },
    "pendingReview":{ "type": "array", "items": { "$ref": "#/$defs/Entry" } },
    "conflicts":    { "type": "array", "items": { "$ref": "#/$defs/ConflictEntry" } }
  },
  "$defs": {
    "Entry": {
      "type": "object",
      "required": ["anchors", "nodePath"],
      "properties": {
        "anchors":  { "type": "array", "items": { "type": "string" }, "uniqueItems": true },
        "nodePath": { "type": "string", "description": "Stable path in the merged document tree." },
        "reason":   { "type": "string" }
      }
    },
    "ConflictEntry": {
      "allOf": [
        { "$ref": "#/$defs/Entry" },
        {
          "type": "object",
          "required": ["code", "severity"],
          "properties": {
            "code":     { "type": "string", "pattern": "^COMP-REGENERATION-[A-Z-]+$" },
            "severity": { "enum": ["error", "warning", "info"] }
          }
        }
      ]
    }
  }
}
```

- [ ] Validate via Ajv 2020-12 standalone:

```bash
cd formspec && npx ajv compile -c ajv-formats --spec=draft2020 -s schemas/regeneration-merge-report.schema.json
```

Expected: clean compile, no errors.

- [ ] Commit.

## Task 14: Schema-shape pytest

- [ ] Create `tests/conformance/spec/test_regeneration_merge_report_schema.py`.

```python
"""Pin the regeneration-merge-report schema shape."""
import json
from pathlib import Path

import pytest

SCHEMA_PATH = Path(__file__).resolve().parents[3] / "schemas" / "regeneration-merge-report.schema.json"

@pytest.fixture(scope="module")
def schema() -> dict:
    return json.loads(SCHEMA_PATH.read_text())

def test_id_and_version(schema):
    assert schema["$id"].endswith("/regeneration-merge-report/1.0")
    assert schema["properties"]["version"]["const"] == "1.0"

def test_required_top_level_arrays(schema):
    required = set(schema["required"])
    assert required == {"version", "surviving", "regenerated", "orphaned", "pendingReview", "conflicts"}

def test_entry_requires_anchors_and_path(schema):
    entry = schema["$defs"]["Entry"]
    assert set(entry["required"]) == {"anchors", "nodePath"}
    assert entry["properties"]["anchors"]["uniqueItems"] is True

def test_conflict_code_pattern(schema):
    conflict_props = schema["$defs"]["ConflictEntry"]["allOf"][1]["properties"]
    assert conflict_props["code"]["pattern"] == "^COMP-REGENERATION-[A-Z-]+$"
    assert set(conflict_props["severity"]["enum"]) == {"error", "warning", "info"}
```

- [ ] Run, expect PASS.

```bash
cd formspec && python -m pytest tests/conformance/spec/test_regeneration_merge_report_schema.py -v
```

- [ ] Commit.

## Task 15: Author shared base fixtures

- [ ] Create `tests/conformance/fixtures/regeneration-merge/_base/` with: minimal Definition, minimal Experience (one unit `identity`, one task `identifyApplicant`), minimal Response Actions (one action `submitApplication`). Same shape family as the Component Reference Fields fixtures.

- [ ] Commit.

## Task 16: Author per-case fixtures

Each case is a directory with five files: `old-generated.json`, `designer-edited.json`, `new-generated.json`, `expected-merged.json`, `expected-report.json`.

- [ ] **Case `unchanged`** — designer-edited equals old-generated; new-generated equals old-generated. Expected: every node in `regenerated`, zero conflicts.

- [ ] **Case `designer-only-property`** — designer changed one `props.label`; new-generated equals old. Expected: surviving entry for the edited node; merged carries the designer's label.

- [ ] **Case `regenerator-only-property`** — designer-edited equals old; new-generated added a new prop. Expected: regenerated entry; merged carries new prop.

- [ ] **Case `property-conflict`** — both designer and new-generated changed the same `props.label`. Expected: `COMP-REGENERATION-PROPERTY-CONFLICT` finding, severity `warning`.

- [ ] **Case `widget-swap`** — designer changed `TextInput` → `TextArea`. Expected: merged preserves `TextArea`, `COMP-REGENERATION-WIDGET-SWAP` at `warning` (pending-review).

- [ ] **Case `pending-review-new-node`** — new-generated added a node not in old or designer. Expected: `pendingReview` entry, `COMP-REGENERATION-PENDING-REVIEW` at `info`.

- [ ] **Case `orphan-node-resolved-refs`** — designer-edited has a node with anchors not in new-generated; the node's `bind` still resolves. Expected: `orphaned` entry, `COMP-REGENERATION-ORPHAN-NODE` at `warning`.

- [ ] **Case `orphan-broken-binding`** — same as above but `bind` no longer resolves. Expected: `COMP-REGENERATION-ORPHAN-BINDING` at `error`.

- [ ] **Case `designer-removed`** — old has a generated node; designer deleted it; new-generated still produces it. Expected: `COMP-REGENERATION-DESIGNER-REMOVED` at `warning`.

- [ ] **Case `designer-precedes`** — designer authored a node at an anchor that new-generation now also produces (old does not have it). Expected: `COMP-REGENERATION-DESIGNER-PRECEDES` at `warning`.

- [ ] **Case `rename-migrated`** — anchors changed `item:dateOfBirth` → `item:birthDate`; migration document present. Expected: matched, presentation preserved, `COMP-REGENERATION-RENAME-MIGRATED` at `info`.

- [ ] **Case `rename-undocumented`** — anchors changed without migration. Expected: orphan + pending-review pair, `COMP-REGENERATION-RENAME-UNDOCUMENTED` at `warning`.

- [ ] Commit fixtures.

## Task 17: Algorithm pytest

- [ ] Create `tests/conformance/spec/test_regeneration_merge_algorithm.py`.

```python
"""Drive every fixture pair through an inline reference merger.

The inline merger here is a CONFORMANCE ORACLE for the spec — runtime
implementations (Rust, TS, Python) MUST agree with it on every fixture.
"""
import json
from pathlib import Path

import pytest

FIXTURES = Path(__file__).resolve().parents[2] / "conformance" / "fixtures" / "regeneration-merge"

def _load(case_dir: Path, name: str) -> dict:
    return json.loads((case_dir / f"{name}.json").read_text())

def _merge(old: dict, designer: dict, new: dict, context: dict) -> tuple[dict, dict]:
    """Reference implementation of §6 algorithm. Lives here so the spec
    has an executable conformance oracle. Production engines re-implement
    against this fixture corpus."""
    # ... (full implementation in this file; ~200 LOC)
    raise NotImplementedError("Implement in Step 2 of this task.")

@pytest.mark.parametrize("case_dir", sorted(p for p in FIXTURES.iterdir() if p.is_dir() and not p.name.startswith("_")))
def test_merge_case(case_dir: Path) -> None:
    old      = _load(case_dir, "old-generated")
    designer = _load(case_dir, "designer-edited")
    new      = _load(case_dir, "new-generated")
    expected_merged = _load(case_dir, "expected-merged")
    expected_report = _load(case_dir, "expected-report")

    merged, report = _merge(old, designer, new, context={})

    assert merged == expected_merged, f"merged mismatch in {case_dir.name}"
    assert report == expected_report, f"report mismatch in {case_dir.name}"
```

- [ ] Step 1: Write the test with `_merge` raising NotImplementedError. Run, expect FAIL on every case with NotImplementedError. Commit ("test(regeneration-merge): red — algorithm not implemented").

- [ ] Step 2: Implement `_merge` per §6 algorithm prose. Iterate until every fixture passes. The order to implement: anchor matching → three-way property diff → child merge → orphan pass → finding emission. Commit each green slice.

- [ ] Step 3: Final run, expect ALL PASS.

```bash
cd formspec && python -m pytest tests/conformance/spec/test_regeneration_merge_algorithm.py -v
```

- [ ] Commit final ("test(regeneration-merge): green — all 12 cases pass").

## Task 18: Invariant pytest

- [ ] Create `tests/conformance/spec/test_regeneration_merge_invariants.py`.

```python
"""Pin determinism, no-mutation, idempotency."""
import copy
import json
from pathlib import Path

import pytest

from tests.conformance.spec.test_regeneration_merge_algorithm import _merge, FIXTURES, _load

CASES = sorted(p for p in FIXTURES.iterdir() if p.is_dir() and not p.name.startswith("_"))

@pytest.mark.parametrize("case_dir", CASES)
def test_determinism(case_dir):
    old, designer, new = _load(case_dir, "old-generated"), _load(case_dir, "designer-edited"), _load(case_dir, "new-generated")
    a_merged, a_report = _merge(copy.deepcopy(old), copy.deepcopy(designer), copy.deepcopy(new), {})
    b_merged, b_report = _merge(copy.deepcopy(old), copy.deepcopy(designer), copy.deepcopy(new), {})
    assert a_merged == b_merged
    assert a_report == b_report

@pytest.mark.parametrize("case_dir", CASES)
def test_no_mutation(case_dir):
    old, designer, new = _load(case_dir, "old-generated"), _load(case_dir, "designer-edited"), _load(case_dir, "new-generated")
    old_snap, designer_snap, new_snap = copy.deepcopy(old), copy.deepcopy(designer), copy.deepcopy(new)
    _merge(old, designer, new, {})
    assert old == old_snap, "merge mutated old-generated"
    assert designer == designer_snap, "merge mutated designer-edited"
    assert new == new_snap, "merge mutated new-generated"

@pytest.mark.parametrize("case_dir", CASES)
def test_idempotency(case_dir):
    """Re-running merge with no source change yields identical output.

    Sequence: merge(old, designer, new) -> merged1.
    Then treating merged1 as the new designer-edited and re-running
    with the same new-generated should yield merged1 again.
    """
    old, designer, new = _load(case_dir, "old-generated"), _load(case_dir, "designer-edited"), _load(case_dir, "new-generated")
    merged1, _ = _merge(old, designer, new, {})
    merged2, _ = _merge(copy.deepcopy(new), copy.deepcopy(merged1), copy.deepcopy(new), {})
    assert merged1 == merged2, "merge is not idempotent"
```

- [ ] Run, expect ALL PASS.

```bash
cd formspec && python -m pytest tests/conformance/spec/test_regeneration_merge_invariants.py -v
```

- [ ] Commit.

## Task 19: Studio E2E (gated)

- [ ] Check whether `packages/formspec-studio/tests/e2e/playwright/` is set up to drive a regeneration review surface today.

```bash
ls /Users/mikewolfd/Work/formspec-stack/formspec/packages/formspec-studio/tests/e2e/playwright/ 2>&1 | grep -i regen
```

- [ ] **If Studio review surface exists:** create `packages/formspec-studio/tests/e2e/playwright/regeneration-merge.spec.ts`. Mount Studio with a `pending-review` MergeReport entry; assert `[data-merge-status="pending-review"]` exists on the affected node. Mount with an `orphan` entry; assert `[data-merge-status="orphan"]`. Commit.

- [ ] **If Studio review surface does NOT exist:** add a TODO row in `formspec/TODO.md` pointing at this E2E gap and at the spec's §10 DOM-level conformance lever. Do NOT block this plan on Studio readiness; the algorithm pytest is the load-bearing conformance gate.

- [ ] Commit (either the spec or the TODO row).

## Task 20: Upstream back-references

- [ ] Append §11 cross-reference block to `specs/component/component-spec.md`:

```markdown
### Regeneration Merge

Component documents that carry `x-generation` (CRF §5) are eligible for
three-way regeneration merge. See
[Regeneration Merge Specification](regeneration-merge-spec.md).
```

- [ ] Update `specs/component/component-reference-fields-spec.md` §5: replace the "regeneration merge behavior is explicitly out of scope" disclaimer with a forward-pointer to `regeneration-merge-spec.md`.

- [ ] Update `thoughts/specs/2026-05-20-formspec-semantic-layers.md`:
  - §10.5 — change "(may live with...)" to "**Landed:** [`specs/component/regeneration-merge-spec.md`](../../specs/component/regeneration-merge-spec.md) (draft, 2026-05-22)."
  - §7.2 — append landed marker pointing at the new spec.

- [ ] Update `TODO-STACK.md` (formspec-stack root) if a row points at this slice.

- [ ] Commit ("docs(regeneration-merge): wire upstream cross-references").

## Task 21: Register in artifact pipelines

- [ ] Register in `scripts/spec-artifacts.config.json`:

```json
{
  "id": "regeneration-merge",
  "spec": "specs/component/regeneration-merge-spec.md",
  "bluf": "specs/component/regeneration-merge-spec.bluf.md",
  "llm": "specs/component/regeneration-merge-spec.llm.md",
  "schemas": ["schemas/regeneration-merge-report.schema.json"]
}
```

- [ ] Add row to `tests/contracts/surface-coverage.json`:

```json
{
  "id": "regenerationMerge",
  "spec": "specs/component/regeneration-merge-spec.md",
  "schemas": ["schemas/regeneration-merge-report.schema.json"],
  "tests": [
    "tests/conformance/spec/test_regeneration_merge_report_schema.py",
    "tests/conformance/spec/test_regeneration_merge_algorithm.py",
    "tests/conformance/spec/test_regeneration_merge_invariants.py"
  ],
  "fixtures": "tests/conformance/fixtures/regeneration-merge/"
}
```

- [ ] Sync lint-crate mirror:

```bash
cd /Users/mikewolfd/Work/formspec-stack/formspec && make sync-lint-schemas
```

- [ ] Run gates:

```bash
cd /Users/mikewolfd/Work/formspec-stack/formspec && npm run docs:generate && npm run docs:check
```

Expected: clean. If `docs:check` reports missing `.llm.md`, regenerate via `docs:generate` and re-run.

- [ ] Commit.

## Task 22: Doc pipeline + filemap + full sweep

- [ ] Regenerate filemap:

```bash
cd /Users/mikewolfd/Work/formspec-stack/formspec && npm run docs:filemap
```

- [ ] Verify filemap freshness:

```bash
cd /Users/mikewolfd/Work/formspec-stack/formspec && npm run docs:filemap:check
```

- [ ] Run full conformance:

```bash
cd /Users/mikewolfd/Work/formspec-stack/formspec && python3 -m pytest tests/conformance/spec/test_regeneration_merge_algorithm.py tests/conformance/spec/test_regeneration_merge_invariants.py tests/conformance/spec/test_regeneration_merge_report_schema.py -v
```

Expected: ALL PASS.

- [ ] Run layering check:

```bash
cd /Users/mikewolfd/Work/formspec-stack/formspec && npm run check:deps
```

- [ ] Commit ("chore(regeneration-merge): regenerate doc artifacts and filemap").

## Task 23: Promotion-gate verification + architecture review dispatch

- [ ] Walk concept §9 promotion gates relevant to regeneration:

| Gate | Pass criterion | Verified by |
|---|---|---|
| Regeneration merge | Source anchors, generated markers, designer-edit preservation, conflict severities, orphan statuses, rename handling, review UX expectations | §3–§10 of new spec; fixtures + algorithm pytest |

- [ ] Dispatch background scout review on the new spec + fixtures + pytest:

```
Agent({
  description: "Regeneration merge spec review",
  subagent_type: "formspec-specs:formspec-scout",
  prompt: "Review specs/component/regeneration-merge-spec.md (just-landed draft) plus tests/conformance/spec/test_regeneration_merge_*.py and tests/conformance/fixtures/regeneration-merge/. Pressure-test: (1) three-way merge identity keyed on anchor-set equality — does it hold for every fixture? (2) finding-code family separation from COMP-REFERENTIAL-INTEGRITY — is the boundary sharp? (3) idempotency invariant — does the fixture corpus actually exercise it? (4) rename handling — is the migration-document seam underspecified? Report findings under 500 words.",
  run_in_background: true
})
```

- [ ] Wait for scout review; remediate BLOCKER findings; commit.

---

## Sequencing Recap

```
Task 1:        scaffold + frontmatter
Tasks 2-12:    spec prose §1-§11
Task 13:       MergeReport schema
Task 14:       schema-shape pytest
Task 15:       shared base fixtures
Task 16:       12 per-case fixtures
Task 17:       algorithm pytest (TDD: red → green)
Task 18:       invariant pytest (determinism, no-mutation, idempotency)
Task 19:       Studio E2E (gated; deferred to TODO if Studio not ready)
Task 20:       upstream cross-references
Task 21:       artifact pipeline registration
Task 22:       doc pipeline + filemap + full sweep
Task 23:       promotion-gate + architecture review
```

## Out-of-scope reminders

- **Do not redefine `COMP-REFERENTIAL-INTEGRITY`.** The new `COMP-REGENERATION-*` family is separate.
- **Do not define Trace.** The MergeReport is Trace's structural seed (concept §10.6); the Trace query/cache spec is a separate plan.
- **Do not implement runtime mergers.** Rust/TS/Python engine implementations land in their own plans against this spec's fixture corpus.
- **Do not define the migration document format.** Spec only references it; the migration format is owned elsewhere.
- **Do not design Studio review UX.** §10 pins DOM-level markers only; visual/interaction design is product surface.

## Deviations

(Recorded here as deviations occur during execution.)

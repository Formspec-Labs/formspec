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

Pressure-tested by 2026-05-22 architecture-review scout. Findings folded in below.

| Decision | Choice | Confidence | Rationale |
|---|---|---|---|
| Merge identity key | `x-generation.anchors` set, **with sibling tree-path tiebreaker** when two nodes share an anchor set | HIGH | `ComponentBase.id` is OPTIONAL; tree position alone is unstable; anchor-set alone collides when a `Section` and a `Label` inside it both carry `["unit:identity"]` (B1 fix). Anchor set is primary; when the input tree contains multiple nodes with identical anchor sets, the tiebreaker is the ordinal sibling index under each node's parent (parent identity itself recurses via the same rule). |
| Merge model | Three-way (`old-generated` ⊕ `designer-edited` ⊕ `new-generated`) | HIGH | Concept §7.2 enumerates exactly these three inputs. |
| Required input | `old-generated` snapshot MUST be persisted between generations | HIGH | Without the common ancestor, three-way merge collapses to two-way and silently loses the ability to detect designer intent. **No two-way fallback exists.** A host that cannot supply `old-generated` MUST treat the operation as fresh generation — designer edits are lost — and surface a host-level warning (M1 fix). |
| Finding code family | New `COMP-REGENERATION-*` for **merge-context-only findings**; **reference-resolution failures route through existing `COMP-REFERENTIAL-INTEGRITY`** (or Component-resolver bind findings) **plus a merge-context annotation** | HIGH | Reviewer's H4: the "static vs merge-time" framing was wrong because CRF resolvers can run at any time. The real boundary is "findings that only exist because a merge happened" vs "findings about reference integrity that exist independent of merge." Bind/actionRef/unitRef failures from an orphaned node MUST be emitted by the existing CRF/Component resolver, not duplicated in the regeneration family. |
| MergeReport schema | New `regeneration-merge-report.schema.json` | HIGH | Cross-runtime conformance + concrete structural seed for Trace (concept §10.6). |
| Coverage findings | **Delegated to Experience resolver** (`EXP-COVERAGE-UNCOVERED-REQUIRED-ITEM`, EXP §S8). MergeReport does NOT carry coverage gaps | HIGH | H2 fix: concept §10.6 lists four things Studio review needs; the fourth ("required items lack coverage") is already owned by EXP-COVERAGE. Studio composes the MergeReport AND the Experience resolver findings; duplicating coverage in MergeReport would re-create dual-ownership. |
| Rename handling | **Migration document is the primary signal — no heuristic detection.** A rename is detected ONLY when a migration entry maps `old_anchor → new_anchor` such that substituting the mapping in N_old's anchor set yields exactly N_new's anchor set | HIGH | H3 fix: "pattern consistent with a rename" cannot be defined without picking arbitrary set-distance thresholds. Migration-as-substitution gives a deterministic, two-implementation-agreement rule. |
| Migration document format | **Defined inline by this spec** as a minimum shape: `{ migrations: [{ from: "<anchor>", to: "<anchor>" }] }`. Anchor-pair only; richer migration semantics deferred | MEDIUM | L3 fix: no `migration-spec.md` exists in `formspec/specs/`. Defining a minimum here unblocks rename handling without forcing a separate migration plan. If a richer migration spec lands later, this minimum is a forward-compatible subset. |
| Convergence (not idempotency) | Re-running merge after no source change yields zero conflicts and zero pendingReview | HIGH | H1 fix: original "idempotency" definition (`merge(new, merged1, new) == merged1`) requires undefined `x-generation` carry-forward semantics for pendingReview nodes and would fail/pass for wrong reasons. Pure determinism is covered by `test_determinism`; the meaningful steady-state invariant is convergence. |
| Studio DOM contract | `data-merge-status` AND `data-merge-anchors` on every report-affected node | MEDIUM | M2 fix: `data-merge-status` alone could pass with a single root marker; pairing with `data-merge-anchors` (sorted, comma-joined) ties the DOM assertion to a specific MergeReport entry. |

Decisions marked HIGH should not change without owner pushback. MEDIUM decisions remain open.

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

§2 MUST also pin the **`old-generated` persistence requirement** as load-bearing (M1 fix):

> Hosts that perform regeneration MUST persist the `old-generated` Component document produced by each generation cycle. The storage mechanism is host-defined (project file, cache, database column, etc.).
>
> A host that cannot supply `old-generated` MUST NOT attempt three-way merge. The operation degrades to fresh generation: the new-generated document REPLACES the designer-edited document, all designer edits are lost, and the host MUST surface a `COMP-REGENERATION-NO-COMMON-ANCESTOR` finding at `error` severity (added to §7) explaining that merge was skipped. No two-way fallback exists.

- [ ] Commit.

## Task 4: Spec prose — §3 Source anchor identity

- [ ] Draft §3 defining how nodes are matched across the three input trees.

**Primary rule:** a node N_old in `old-generated` matches a node N_new in `new-generated` iff `N_old.x-generation.anchors` equals `N_new.x-generation.anchors` as a set (order-independent, duplicate-free). Same rule applies to matching `designer-edited` nodes against `new-generated`.

**Tiebreaker for duplicated anchor sets (B1 fix):** anchor uniqueness is NOT enforced by CRF — a `Section` and a `Label` inside it can both carry `["unit:identity"]`. When multiple candidate nodes within the SAME tree share an identical anchor set, the matching key extends to `(anchor_set, parent_match_key, ordinal_sibling_index_among_anchor_set_peers)`. Parent identity recurses via the same rule; the ordinal sibling index counts only siblings that share the anchor set (so unrelated siblings don't shift the index).

**Nodes without `x-generation`:** treated as designer-authored from inception. Matched across `old-generated` ↔ `designer-edited` by `id` if present, otherwise by full tree-path (`/tree/children[2]/children[0]`). Never matched against `new-generated` (the generator did not produce them).

**Nodes with empty `anchors`:** treated identically to nodes without `x-generation`.

**Anchor taxonomy:** reuses CRF §5 prefixes (`item:`, `unit:`, `task:`, `action:`, `concept:`). This spec does not introduce new prefixes.

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
match_key(N) = (N.anchors_set, parent_match_key(N), ordinal_sibling_index_among_anchor_set_peers(N))

for each N_new in new_generated (depth-first, document order):
  key      = match_key(N_new)
  N_old      = match_in(old_generated,   key)
  N_designer = match_in(designer_edited, key)

  if N_old is None and N_designer is None:
    emit N_new to merged; report.pendingReview += N_new

  elif N_old is None and N_designer is not None:
    # Designer authored independently; new-generation reaches into this anchor.
    emit N_designer to merged; report.conflicts += { code: "COMP-REGENERATION-DESIGNER-PRECEDES", ... }

  elif N_old is not None and N_designer is None:
    # Designer removed the generated node; treat as designer-removal conflict.
    emit nothing to merged; report.conflicts += { code: "COMP-REGENERATION-DESIGNER-REMOVED", ... }

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

# Orphan pass — B2 fix: reattachment is explicit.
for each N_designer in designer_edited with no matching N_new (in document order):
  parent_in_merged = locate_merged_parent(N_designer)
  if parent_in_merged is not None:
    # Designer-authored subtree whose parent regenerated cleanly.
    append N_designer as a child of parent_in_merged (after the last regenerated child)
    report.orphaned += { ..., reattachedTo: parent_in_merged.nodePath }
  else:
    # Parent itself was orphaned or removed; cascade attempts to grandparent, etc.
    nearest = locate_nearest_ancestor_in_merged(N_designer)
    if nearest is not None:
      append N_designer as a child of nearest with surviving-subtree marker
      report.orphaned += { ..., reattachedTo: nearest.nodePath, cascaded: true }
    else:
      # No ancestor survives — designer subtree becomes a top-level orphan.
      append N_designer to merged.tree at root (after last sibling)
      report.orphaned += { ..., reattachedTo: "/tree", detached: true }

locate_merged_parent(N): walk N's parent chain in designer-edited; for each
  ancestor A, compute match_key(A); if A's key resolves to a node in merged,
  return that node; else continue up. Returns None if no ancestor matches.
```

§6 MUST also pin: traversal order is depth-first document order (deterministic); a node's children are merged before the node itself is emitted (so subtree conflicts surface inline); orphan reattachment runs as a single pass after the main walk, in designer-edited document order, so reattachment ordering is deterministic.

- [ ] Commit.

## Task 8: Spec prose — §7 Conflict severities + finding codes

- [ ] Draft §7 introducing the `COMP-REGENERATION-*` finding family for **merge-context-only findings**.

**Family scope (H4 fix).** `COMP-REGENERATION-*` covers findings that exist BECAUSE a merge happened — merge-decision conflicts, orphan reattachment, rename detection, missing-common-ancestor. Reference-resolution failures (bind no longer resolves, actionRef unresolvable, unitRef points at a removed unit) are NOT in this family — they route through the existing `COMP-REFERENTIAL-INTEGRITY` (CRF §7) or Component-resolver findings, with the MergeReport surfacing them by composition (see §11). The merge MUST run the cross-document resolver against the merged document and forward those findings into the review surface alongside `COMP-REGENERATION-*` entries.

| Code | Condition | Severity |
|---|---|---|
| `COMP-REGENERATION-NO-COMMON-ANCESTOR` | Host invoked merge without supplying `old-generated`; operation degraded to fresh generation | `error` |
| `COMP-REGENERATION-DESIGNER-PRECEDES` | Designer-authored node at an anchor that new-generation also produced (no N_old) | `warning` |
| `COMP-REGENERATION-DESIGNER-REMOVED` | Designer deleted a generated node; new-generation still produces it | `warning` |
| `COMP-REGENERATION-PROPERTY-CONFLICT` | Both designer and new-generation changed the same property to different values | `warning` |
| `COMP-REGENERATION-WIDGET-SWAP` | Designer swapped widget; new-generation changed the same widget differently | `warning` (pending-review) |
| `COMP-REGENERATION-ORPHAN-NODE` | Designer subtree has no matching anchor set in new-generation. Default `warning`. Escalates to `error` ONLY if accompanied by an unresolved CRF/bind finding emitted by the resolver for the same node. | `warning` (→ `error` via composition) |
| `COMP-REGENERATION-ORPHAN-REATTACHED-CASCADE` | Designer subtree reattached above its original parent because the parent chain orphaned | `info` |
| `COMP-REGENERATION-ORPHAN-DETACHED` | Designer subtree reattached at root because no ancestor matches in merged | `warning` |
| `COMP-REGENERATION-RENAME-MIGRATED` | Anchor sets differ between old and new but migration document substitution makes them equal | `info` |
| `COMP-REGENERATION-PENDING-REVIEW` | Newly generated node not present in old or designer | `info` |

§7 MUST state:

- Hosts MUST NOT downgrade `error`. Hosts MAY upgrade lower severities under a host-defined strict mode.
- The merge MUST NOT emit `COMP-REGENERATION-ORPHAN-BINDING` or any other reference-resolution finding under the regeneration family. Bind/reference failures are emitted by the resolver and composed into the review surface as separate findings against the same node.
- **No heuristic rename detection** (H3 fix). A `COMP-REGENERATION-RENAME-UNDOCUMENTED` finding does not exist; if anchor sets differ and no migration substitution makes them equal, the nodes simply do not match (the N_old becomes an `ORPHAN-NODE`, N_new becomes `PENDING-REVIEW`). Authors who want rename support author a migration entry.

- [ ] Commit.

## Task 9: Spec prose — §8 Orphan handling

- [ ] Draft §8 defining orphan handling end-to-end. Reflects H4 (finding-family separation) and B2 (reattachment is explicit).

Rules:

1. A designer-edited node with no anchor-set match in `new-generated` is preserved in `merged` (concept §7.2: "Never silently delete designer-authored layout"). Reattachment rule lives in §6 (Task 7).
2. Every orphan emits `COMP-REGENERATION-ORPHAN-NODE` at `warning` severity by default.
3. After the merge completes, the spec REQUIRES the merge runtime to invoke the CRF §6 cross-document resolver against the merged document. Any resolver findings for orphan nodes (unresolved `bind`, `actionRef`, `unitRef`) appear as separate findings in the review surface, composed alongside the `COMP-REGENERATION-ORPHAN-NODE` entry. The review surface elevates the orphan to "error severity in context" when either:
   - The orphan carries an `error`-severity CRF finding (e.g., `unitRef` unresolved with Experience loaded), or
   - The Component-resolver emits an error-level bind-resolution finding against the orphan.
4. Cascade and detachment cases (§6 algorithm) emit `COMP-REGENERATION-ORPHAN-REATTACHED-CASCADE` (`info`) and `COMP-REGENERATION-ORPHAN-DETACHED` (`warning`) respectively, in ADDITION to the base `ORPHAN-NODE` entry.
5. Orphans appear in `MergeReport.orphaned[]` with full anchor set, `nodePath` in merged (the reattached path), `reattachedTo`, and `cascaded`/`detached` flags. The resolver-emitted reference findings are NOT duplicated in `MergeReport`; they live in their own resolver report and the review surface joins them by `nodePath`.

§8 MUST address rendering: orphan nodes render normally (the designer authored them, they should display). Tooling MAY visually mark them via the §10 `data-merge-status` attribute; the spec does not mandate visual treatment.

- [ ] Commit.

## Task 10: Spec prose — §9 Rename and migration handling

- [ ] Draft §9 defining rename detection via migration substitution. **H3 fix: no heuristic detection — migration document is the only signal.**

**Migration document shape (L3 fix).** No `migration-spec.md` exists in `formspec/specs/` as of this writing. This spec defines the minimum migration document shape consumed by the merge:

```json
{
  "$formspecMigration": "1.0",
  "migrations": [
    { "from": "item:dateOfBirth", "to": "item:birthDate" },
    { "from": "unit:legacyIdentity", "to": "unit:identity" }
  ]
}
```

Each entry maps a single old anchor (`from`) to a single new anchor (`to`). Entries are unordered and processed as a set. A richer migration spec MAY land later (semantic versioning, conditional migrations, value transforms); the minimum shape above is its forward-compatible subset.

**Match-via-migration rule.** Let `substitute(anchors, M)` apply every applicable migration entry in `M` to the anchor set `anchors`. A node N_old matches N_new via migration iff:

```text
substitute(N_old.anchors, M) == N_new.anchors
```

— that is, applying the migration to N_old's anchor set yields EXACTLY N_new's anchor set. Set equality, not subset. If the substitution does not produce equality, no match is declared.

**When a migration match succeeds, the merge:**

1. Treats N_old and N_new as matched (in the same pass as the primary anchor-equality check).
2. Applies N_new's anchor set to the merged node.
3. Preserves designer presentation choices via the standard three-way merge (§6).
4. Emits `COMP-REGENERATION-RENAME-MIGRATED` at `info` severity.

**When no migration match succeeds and anchor-set equality also fails,** the nodes simply do not match. N_old becomes `COMP-REGENERATION-ORPHAN-NODE`; N_new becomes `COMP-REGENERATION-PENDING-REVIEW`. No `RENAME-UNDOCUMENTED` finding exists — the orphan + pending-review pair is the signal.

§9 MUST NOT define heuristic rename detection (set-distance, edit-distance, prefix-family matching). Authors who want rename support author migration entries.

- [ ] Commit.

## Task 11: Spec prose — §10 Studio review UX expectations

- [ ] Draft §10 defining the minimum review-surface contract. M2 fix: DOM contract pairs status with anchors so assertions identify a specific report entry.

A Studio-grade review surface MUST:

1. Render every entry in `MergeReport.conflicts[]` with its anchor set, severity, finding code, and human-readable reason.
2. Provide per-conflict resolution affordance (accept designer / accept regenerated / manual edit) — affordance is host-defined; the spec only mandates that conflicts surface.
3. Render every entry in `MergeReport.pendingReview[]` with a `pending-review` marker on the affected node in the rendered Component preview. **DOM-level:** the rendered node MUST carry BOTH:
   - `data-merge-status="pending-review"`
   - `data-merge-anchors="<sorted-comma-joined anchor set>"` (e.g., `"item:applicantName,unit:identity"`)
4. Render every entry in `MergeReport.orphaned[]` with an `orphan` marker; DOM-level: `data-merge-status="orphan"` AND `data-merge-anchors="..."`. Cascade-reattached and detached orphans use the same `data-merge-status="orphan"`; the `cascaded` / `detached` flags from `MergeReport.orphaned[]` are surfaced via host-defined visual treatment, NOT additional DOM attributes (spec-minimum stays narrow).
5. Render coverage findings — `EXP-COVERAGE-UNCOVERED-REQUIRED-ITEM` from the Experience resolver (H2 delegation) — alongside the MergeReport entries. The composition rule lives in §11.

§10 MUST clarify: these are minimum conformance levers. Full Studio review UX (visual design, interaction model, keyboard flows, undo/redo) is product surface, not spec.

- [ ] Commit.

## Task 12: Spec prose — §11 Conformance

- [ ] Draft §11 pinning four conformance levels:

1. **Algorithm.** Implements §6 algorithm; emits findings per §7; honors §8 orphan rules and §9 rename rules.
2. **Report shape.** `MergeReport` validates against `regeneration-merge-report.schema.json`.
3. **Invariants.** Determinism (two identical inputs → identical merged + report); no-mutation (inputs deep-equal before and after merge); **convergence** (H1 fix: re-running the merge after no source change yields zero conflicts and zero pendingReview — formal statement below).
4. **Composition with resolvers.** After producing `merged`, a conforming runtime MUST invoke the CRF §6 cross-document resolver AND the Experience coverage resolver (`EXP-COVERAGE-UNCOVERED-REQUIRED-ITEM` per EXP §S8) against the merged document, joining their findings to MergeReport entries by `nodePath`. The merge does NOT duplicate those findings; the review surface composes them.

**Convergence (H1).** Given `(merged, report) = merge(old, designer, new, ctx)`, the operation `merge(old', merged, new, ctx)` — where `old' = old-generated produced ALONGSIDE the same `new` (so `old'` is the same input that produced `new` and contains the same node identities as `new` minus the designer's pending-review acceptances) — MUST produce a `report'` with empty `conflicts` and empty `pendingReview`, and a `merged'` structurally equal to `merged`. Convergence is a host-cycle invariant: once a designer reviews and accepts pending nodes, the next regeneration MUST be a no-op until a source artifact changes.

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
    "orphaned":     { "type": "array", "items": { "$ref": "#/$defs/OrphanEntry" } },
    "pendingReview":{ "type": "array", "items": { "$ref": "#/$defs/Entry" } },
    "conflicts":    { "type": "array", "items": { "$ref": "#/$defs/ConflictEntry" } }
  },
  "description": "Coverage-against-Experience findings are NOT included here. They are emitted by the Experience resolver as EXP-COVERAGE-UNCOVERED-REQUIRED-ITEM and composed into the review surface alongside this report by joining on nodePath. Same for CRF/Component bind/reference-resolution failures.",
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
    "OrphanEntry": {
      "allOf": [
        { "$ref": "#/$defs/Entry" },
        {
          "type": "object",
          "properties": {
            "reattachedTo": { "type": "string", "description": "nodePath of the merged-tree node the orphan was reattached under." },
            "cascaded":     { "type": "boolean", "description": "True when reattachment had to walk above the original parent." },
            "detached":     { "type": "boolean", "description": "True when no surviving ancestor existed and the orphan reattached at /tree." }
          }
        }
      ]
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

def test_orphan_entry_has_reattachment_fields(schema):
    orphan_props = schema["$defs"]["OrphanEntry"]["allOf"][1]["properties"]
    assert {"reattachedTo", "cascaded", "detached"} <= set(orphan_props)

def test_coverage_delegation_documented(schema):
    """H2: schema MUST document that EXP-COVERAGE findings live elsewhere."""
    assert "EXP-COVERAGE" in schema["description"]
    assert "joining on nodePath" in schema["description"] or "compose" in schema["description"].lower()
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

Each case is a directory with five files: `old-generated.json`, `designer-edited.json`, `new-generated.json`, `expected-merged.json`, `expected-report.json`. L1 fix: degenerate `unchanged` case removed; subtree add/reorder cases added.

- [ ] **Case `designer-only-property`** — designer changed one `props.label`; new-generated equals old. Expected: surviving entry for the edited node; merged carries the designer's label.

- [ ] **Case `regenerator-only-property`** — designer-edited equals old; new-generated added a new prop. Expected: regenerated entry; merged carries new prop.

- [ ] **Case `property-conflict`** — both designer and new-generated changed the same `props.label`. Expected: `COMP-REGENERATION-PROPERTY-CONFLICT` finding, severity `warning`.

- [ ] **Case `widget-swap`** — designer changed `TextInput` → `TextArea`. Expected: merged preserves `TextArea`, `COMP-REGENERATION-WIDGET-SWAP` at `warning` (pending-review).

- [ ] **Case `pending-review-new-node`** — new-generated added a node not in old or designer. Expected: `pendingReview` entry, `COMP-REGENERATION-PENDING-REVIEW` at `info`.

- [ ] **Case `orphan-node-resolved-refs`** — designer-edited has a node with anchors not in new-generated; the node's `bind` still resolves. Expected: `orphaned` entry, `COMP-REGENERATION-ORPHAN-NODE` at `warning`; reattached at original parent.

- [ ] **Case `orphan-broken-binding`** — same as above but `bind` no longer resolves. Expected: `COMP-REGENERATION-ORPHAN-NODE` at `warning` in MergeReport PLUS a separate Component-resolver bind-failure finding at `error` (composed in the review surface, NOT duplicated in MergeReport per H4).

- [ ] **Case `orphan-cascade`** — designer subtree's parent is itself orphaned; reattaches to grandparent. Expected: `COMP-REGENERATION-ORPHAN-REATTACHED-CASCADE` at `info` plus base `ORPHAN-NODE`.

- [ ] **Case `orphan-detached`** — designer subtree has no surviving ancestor in merged; reattaches at root. Expected: `COMP-REGENERATION-ORPHAN-DETACHED` at `warning`.

- [ ] **Case `designer-removed`** — old has a generated node; designer deleted it; new-generated still produces it. Expected: `COMP-REGENERATION-DESIGNER-REMOVED` at `warning`.

- [ ] **Case `designer-precedes`** — designer authored a node at an anchor that new-generation now also produces (old does not have it). Expected: `COMP-REGENERATION-DESIGNER-PRECEDES` at `warning`.

- [ ] **Case `rename-migrated`** — anchors changed `item:dateOfBirth` → `item:birthDate`; migration document maps the substitution. Expected: matched, presentation preserved, `COMP-REGENERATION-RENAME-MIGRATED` at `info`.

- [ ] **Case `rename-no-migration`** — anchors changed without migration entry. Expected: NOT matched; N_old becomes `ORPHAN-NODE`, N_new becomes `PENDING-REVIEW` (H3 fix: no heuristic, no `RENAME-UNDOCUMENTED` finding).

- [ ] **Case `subtree-children-add`** — designer added a child node under a regenerated `Section`. Expected: regenerated `Section` in merged; designer's child appended; orphan/pending-review entry for the child.

- [ ] **Case `subtree-children-reorder`** — designer reordered two children under a regenerated `Section`; new-generation kept the original order. Expected: designer order preserved in merged; reorder surfaced as `surviving` entry on the Section (designer-only change).

- [ ] **Case `duplicate-anchor-set`** — `Section` and `Label` inside it both carry `["unit:identity"]`. Designer edits the `Label`'s text. Expected: tiebreaker by sibling-ordinal correctly matches the `Label` (not the `Section`); `Label` survives with designer text; `Section` regenerates cleanly.

- [ ] **Case `no-common-ancestor`** — `old-generated` is absent (caller passes `None` or empty). Expected: fresh generation; merged equals new-generated; `MergeReport.conflicts` contains `COMP-REGENERATION-NO-COMMON-ANCESTOR` at `error`.

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

- [ ] Create `tests/conformance/spec/test_regeneration_merge_invariants.py`. H1 fix: replaces idempotency with convergence.

```python
"""Pin determinism, no-mutation, convergence."""
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
def test_convergence(case_dir):
    """Host-cycle invariant (spec §11 convergence clause).

    Given (merged, report) = merge(old, designer, new):
      after the designer reviews and accepts pending nodes, the NEXT
      generation cycle starts with old' = new (the new-generation that
      just landed) and designer' = merged (the accepted state). The
      same new is fed in again because no source artifact has changed.

      Expected: report' has empty conflicts AND empty pendingReview;
      merged' equals merged.
    """
    old, designer, new = _load(case_dir, "old-generated"), _load(case_dir, "designer-edited"), _load(case_dir, "new-generated")
    merged, report = _merge(old, designer, new, {})

    # Designer accepts the merged state; the next regeneration cycle begins
    # with no source change (same `new` document).
    merged2, report2 = _merge(copy.deepcopy(new), copy.deepcopy(merged), copy.deepcopy(new), {})

    assert merged2 == merged, "merge did not converge: merged drifted on re-run"
    assert report2["conflicts"] == [], "merge did not converge: conflicts persisted"
    assert report2["pendingReview"] == [], "merge did not converge: pendingReview persisted"
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

- [ ] Update `specs/component/component-reference-fields-spec.md` §5: replace the "regeneration merge behavior is explicitly out of scope" disclaimer with a forward-pointer to `regeneration-merge-spec.md`. **Also update the matching BLUF bullet** (M3 fix — currently at `component-reference-fields-spec.md:33`) so it doesn't drift from §5.

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

- 2026-05-22: Pre-execution architecture-review scout (verdict REVISE) surfaced 2 BLOCKER + 4 HIGH + 3 MEDIUM findings. Remediated inline before commit:
  - **B1 (anchor-set duplicates):** §3/Task 4 — added sibling-ordinal tiebreaker when multiple nodes share an anchor set; algorithm pseudocode uses `match_key` recursively.
  - **B2 (orphan reattachment):** §6/Task 7 — explicit `locate_merged_parent` rule; orphans reattach to nearest surviving ancestor or cascade to root with `detached` flag.
  - **H1 (idempotency → convergence):** §11/Task 18 — replaced idempotency claim with convergence (re-running after no source change yields zero conflicts + zero pendingReview).
  - **H2 (coverage findings):** §11/Task 12/13 — delegated coverage to Experience resolver (`EXP-COVERAGE-UNCOVERED-REQUIRED-ITEM`); MergeReport schema description documents the join-by-`nodePath` composition rule.
  - **H3 (rename algorithm):** §9/Task 10 — pinned migration-substitution rule (`substitute(N_old.anchors, M) == N_new.anchors`), removed heuristic and `RENAME-UNDOCUMENTED` code.
  - **H4 (finding family boundary):** §7/Task 8 — restated as merge-context-only; dropped `COMP-REGENERATION-ORPHAN-BINDING`; orphan severity composes with CRF/Component resolver findings.
  - **L3 (migration document):** §9/Task 10 — defined minimum migration shape inline since no `migration-spec.md` exists.
  - **M1 (old-generated requirement):** §2/Task 3 — added `COMP-REGENERATION-NO-COMMON-ANCESTOR` and pinned no-two-way-fallback degradation.
  - **M2 (DOM contract):** §10/Task 11 — paired `data-merge-status` with `data-merge-anchors` for specificity.
  - **M3 (CRF BLUF):** Task 20 — extended CRF update to include matching BLUF bullet.
  - **L1 (subtree/duplicate-anchor coverage):** Task 16 — dropped degenerate `unchanged` case; added `orphan-cascade`, `orphan-detached`, `subtree-children-add`, `subtree-children-reorder`, `duplicate-anchor-set`, `no-common-ancestor`, `rename-no-migration` cases.

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

**Goal:** Author the canonical regeneration merge spec at `specs/component/regeneration-merge-spec.md`. Define a deterministic three-way merge (`old-generated` ⊕ `designer-edited` ⊕ `new-generated` → `merged + merge-report`) keyed by `x-generation.anchors`. Pin source-anchor identity, generated-node detection, designer-edit preservation rules, conflict severities, orphan handling, anchor-mapped rename handling, and Studio review UX expectations. Prove the algorithm is deterministic, no-mutation on inputs, and identical-output across implementations via fixture-driven pytest.

**Architecture:** Three-way merge keyed by `x-generation.anchors`. A node is identified across the three input trees by its anchor set (not by tree position or `id`), because designers may reorder and `id` is OPTIONAL on `ComponentBase`. The merge walks `new-generated` (the structural authority for what SHOULD exist), then for each node looks up the matching `old-generated` node (was it always there?) and the `designer-edited` node (did a designer touch it?). Three-way diff against `old-generated` as the common ancestor decides: keep designer edit, regenerate, or surface a conflict. Orphans (in `designer-edited` but not `new-generated`) are preserved but marked `orphan` in the report — concept §7.2 "Never silently delete designer-authored layout." Output: `merged` Component document (schema-valid) + `MergeReport` (structured surviving / regenerated / orphaned / pending-review / conflict lists). The `MergeReport` is the structural seed for the future Trace impact map (concept §10.6); this plan defines its shape, not Trace's query surface.

**Tech Stack:** JSON Schema 2020-12, Markdown (BCP-14), pytest under `formspec/tests/conformance/`, Python merge harness lives inline in the pytest (the spec is the contract; runtime implementations land in separate engine plans).

**Sequencing:** Spec prose §1–§11 → MergeReport schema → fixtures (each merge case in concept §7.2 plus orphan/rename) → algorithm pytest → invariant pytest (determinism, no-mutation, convergence) → Studio E2E (gated — defer if Studio isn't ready) → upstream back-references → doc pipeline.

**Citations:** "CRF §" = `specs/component/component-reference-fields-spec.md`. "COMP §" = `specs/component/component-spec.md`. "EXP §" = `specs/experience/experience-spec.md`. "RA §" = `specs/response-actions/response-actions-spec.md`. "Concept §" = `thoughts/specs/2026-05-20-formspec-semantic-layers.md`.

---

## Preconditions

This plan MUST NOT execute until:

1. **Component Reference Fields plan** has landed completely (all 21 tasks): `x-generation` shape stable in `schemas/component.schema.json` v1.1, `x-generation.anchors` taxonomy pinned (`item:` / `unit:` / `task:` / `action:` / `concept:`), `COMP-REFERENTIAL-INTEGRITY` kind `"x-generation.anchors"` finding code in place.
2. **Concept §10.5 / §7.2 still describe regeneration merge** the way this plan derives from. If the concept note changed, re-anchor before authoring.

Verify before Task 1:

```bash
cd /Users/mikewolfd/Work/formspec-stack/formspec
grep -q '"x-generation"' schemas/component.schema.json && echo "x-generation schema: OK"
node -e 'const s=require("./schemas/component.schema.json"); if (s["$id"] !== "https://formspec.org/schemas/component/1.1") process.exit(1); console.log("Component v1.1: OK")'
grep -q 'x-generation.anchors' specs/component/component-reference-fields-spec.md && echo "Anchor taxonomy: OK"
grep -q 'COMP-REFERENTIAL-INTEGRITY' specs/component/component-reference-fields-spec.md && echo "Finding code: OK"
```

If any check fails, stop and surface to the user — the Component Reference Fields plan is the blocker.

---

## Design Decisions (load-bearing)

Pressure-tested by 2026-05-22 architecture-review scout. Findings folded in below.

| Decision | Choice | Confidence | Rationale |
|---|---|---|---|
| Merge identity key | `x-generation.anchors` set, with recursive parent match key plus stable local discriminator for same-parent duplicate anchor sets | HIGH | `ComponentBase.id` is OPTIONAL; tree position alone is unstable; anchor-set alone collides when a `Section` and a `Label` inside it both carry `["unit:identity"]` (B1 fix). Anchor set is primary; when the input tree contains multiple nodes with identical anchor sets, the first tiebreaker is `(anchor_set, parent_match_key)`. Same-parent duplicates may use a stable local discriminator such as non-empty `id`, `bind`, or `ActionButton.actionRef`; component type, path, sibling position, and ordinal are not identity. If no stable discriminator resolves exactly one candidate, the duplicate is ambiguous. |
| Merge model | Three-way (`old-generated` ⊕ `designer-edited` ⊕ `new-generated`) | HIGH | Concept §7.2 enumerates exactly these three inputs. |
| Required input | `old-generated` snapshot MUST be persisted between generations | HIGH | Without the common ancestor, three-way merge collapses to two-way and silently loses the ability to detect designer intent. **No two-way fallback exists.** A host that cannot supply `old-generated` MUST treat the operation as fresh generation — designer edits are lost — and `report.conflicts[]` MUST contain `COMP-REGENERATION-NO-COMMON-ANCESTOR` at `error` severity (M1 fix). |
| Finding code family | New `COMP-REGENERATION-*` for **merge-context-only findings**; **reference-resolution failures route through existing `COMP-REFERENTIAL-INTEGRITY`** (or Component-resolver bind findings) **plus a merge-context annotation** | HIGH | Reviewer's H4: the "static vs merge-time" framing was wrong because CRF resolvers can run at any time. The real boundary is "findings that only exist because a merge happened" vs "findings about reference integrity that exist independent of merge." Bind/actionRef/unitRef failures from an orphaned node MUST be emitted by the existing CRF/Component resolver, not duplicated in the regeneration family. |
| MergeReport schema | New `regeneration-merge-report.schema.json` | HIGH | Cross-runtime conformance + concrete structural seed for Trace (concept §10.6). |
| Coverage findings | **Delegated to Experience resolver** (`EXP-COVERAGE-UNCOVERED-REQUIRED-ITEM`, EXP §S8). MergeReport does NOT carry coverage gaps | HIGH | H2 fix: concept §10.6 lists four things Studio review needs; the fourth ("required items lack coverage") is already owned by EXP-COVERAGE. Studio composes the MergeReport AND the Experience resolver findings; duplicating coverage in MergeReport would re-create dual-ownership. |
| Rename handling | **Anchor-mappings document is the primary signal — no heuristic detection.** A rename is detected ONLY when an anchor-mapping entry maps `old_anchor → new_anchor` such that substituting the mapping in N_old's anchor set yields exactly N_new's anchor set | HIGH | H3 fix: "pattern consistent with a rename" cannot be defined without picking arbitrary set-distance thresholds. Anchor-mapping substitution gives a deterministic, two-implementation-agreement rule. |
| Anchor-mappings document format | **Defined inline by this spec** as a minimum shape: `{ "$formspecAnchorMappings": "1.0", "anchorMappings": [{ "from": "<anchor>", "to": "<anchor>" }] }`. Anchor-pair only; named `anchorMappings` to avoid collision with Core §6.7 `migrations` (which transforms Response data, a different domain) | MEDIUM | L3 + F6 fix: no `migration-spec.md` exists in `formspec/specs/`; the term "migration" is already taken by Core §6.7. Defining a minimum here unblocks rename handling under a non-colliding name. If a richer anchor-mappings spec lands later, this minimum is a forward-compatible subset. |
| Convergence (not idempotency) | Re-running merge after no source change yields zero conflicts and zero pendingReview | HIGH | H1 fix: original "idempotency" definition (`merge(new, merged1, new) == merged1`) requires undefined `x-generation` carry-forward semantics for pendingReview nodes and would fail/pass for wrong reasons. Pure determinism is covered by `test_determinism`; the meaningful steady-state invariant is convergence. |
| Studio DOM contract | `data-merge-status` AND `data-merge-anchors` on every spec-mandated pending-review/orphan preview marker | MEDIUM | M2 fix: `data-merge-status` alone could pass with a single root marker; pairing with `data-merge-anchors` (sorted, comma-joined) ties the DOM assertion to a specific MergeReport entry. |

Decisions marked HIGH should not change without owner pushback. MEDIUM decisions remain open.

---

## File Structure

### Created

| Path | Responsibility |
|---|---|
| `specs/component/regeneration-merge-spec.md` | Canonical prose for the merge contract — algorithm, severities, orphan handling, rename handling, review UX. |
| `specs/component/regeneration-merge-spec.bluf.md` | BLUF source. |
| `specs/component/regeneration-merge-spec.llm.md` | Generated LLM artifact (do not hand-edit). |
| `schemas/regeneration-merge-report.schema.json` | Structured shape of the `MergeReport`: `surviving[]`, `regenerated[]`, `orphaned[]`, `pendingReview[]`, `conflicts[]`, each entry carrying `anchors`, `nodePath`, `code`, `reason`, `severity`. |
| `tests/conformance/spec/test_regeneration_merge_algorithm.py` | Algorithm pytest. Drives every fixture pair through an inline reference merger; asserts merged document + MergeReport shape against expected output. |
| `tests/conformance/spec/test_regeneration_merge_invariants.py` | Invariant pytest: determinism (two runs identical), no-mutation (inputs unchanged after merge), convergence (clean cycle re-run yields identical output with zero conflicts and zero pendingReview). |
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
- **Studio review screen design.** Visual design and full Studio UX are product surface; only the DOM-level pending-review/orphan marker conformance contract lives here.
- **Host-defined merge policy hooks.** Concept §7.2 baseline rules only; host overrides are a v1.1 extension.
- **Broad migration/changelog spec.** Rename handling consumes only the minimum `$formspecAnchorMappings.anchorMappings[]` shape defined in Task 10. Response-data migrations, semantic changelogs, versioning policy, and richer migration document formats remain outside this plan.

---

## Self-Review Note

- **Three-way merge identity** keyed on anchor-set equality is the load-bearing design. Tests MUST cover: anchor-set match, anchor-set mismatch (orphan in designer-edited, new node in new-generated), partial anchor overlap (treated as mismatch + warn).
- **`old-generated` persistence** is a host requirement, not a spec data shape. Surface it explicitly in §2 — implementations that drop the common ancestor cannot pass conformance.
- **Finding-code separation** (`COMP-REGENERATION-*` vs `COMP-REFERENTIAL-INTEGRITY`) keeps merge-time conflicts and static reference-integrity findings distinct in tooling. Do not collapse.
- **Convergence** is the strongest steady-state correctness check: after a clean first merge with zero conflicts and zero pendingReview, re-running with no source change MUST yield byte-identical output with zero conflicts and zero pendingReview. Pinned by `test_regeneration_merge_invariants.py`.
- **Cold-read test:** a future agent reading this plan alone produces a conforming spec without referring to the concept note. Concept §7.2 baseline rules are quoted verbatim in Task 7's spec-prose section.

---

## Task 1: Scaffold spec files

- [x] Task 1A: Create `specs/component/regeneration-merge-spec.{md,bluf.md}` scaffold with frontmatter, status block, BLUF marker block, TOC, and §1–§11 headers (empty bodies).

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

- [x] Task 1D: Commit.

```bash
git commit specs/component/regeneration-merge-spec.md specs/component/regeneration-merge-spec.bluf.md -m "spec(regeneration-merge): scaffold spec files (draft)"
```

## Task 2: Spec prose — §1 Introduction + scope + relationship

- [x] Draft §1 covering: purpose (concept §7.2 + §10.5), scope (three-way Component merge only), out-of-scope (Trace, runtime engines, Studio UX, broad migration/changelog format beyond the Task 10 anchor-mappings minimum), relationship to Component Reference Fields (consumes `x-generation`), conformance posture, BCP-14 keyword usage.

The §1 prose MUST state the `old-generated` persistence requirement explicitly. A host that does not persist `old-generated` cannot perform three-way merge and therefore cannot conform.

- [x] Commit.

## Task 3: Spec prose — §2 Inputs and outputs

- [x] Draft §2 defining the three inputs (`old-generated`, `designer-edited`, `new-generated`) and two outputs (`merged`, `MergeReport`). Pin each input/output to the Component schema (`$formspecComponent` v1.1) and the MergeReport schema (Task 13).

Inputs in pseudo-form:

```
merge(
  old_generated: Component v1.1,
  designer_edited: Component v1.1,
  new_generated: Component v1.1,
  context: { definition?, experience?, responseActions?, registry?, ontology?, hostPolicy?, anchorMappings? }
) -> { merged: Component v1.1, report: MergeReport }

freshGenerationWithoutCommonAncestor(
  old_generated: null,
  designer_edited: Component v1.1,
  new_generated: Component v1.1,
  context: { definition?, experience?, responseActions?, registry?, ontology?, hostPolicy?, anchorMappings? }
) -> { merged: Component v1.1, report: MergeReport }
```

§2 MUST clarify that `context` reuses the peer-document fields from CRF §6's `ResolutionContext` (`definition`, `experience`, `responseActions`, `registry`, `ontology`, `hostPolicy`) and extends that context with optional `anchorMappings`. The three Component documents are merge inputs, not the CRF resolver's single `component` slot.

§2 MUST also pin the **`old-generated` persistence requirement** as load-bearing (M1 fix):

> Hosts that perform regeneration MUST persist the `old-generated` Component document produced by each generation cycle. The storage mechanism is host-defined (project file, cache, database column, etc.).
>
> A host that cannot supply `old-generated` MUST NOT attempt conforming three-way merge. The operation degrades to fresh generation: `merged` equals `new-generated`, designer edits are not preserved, and `report.conflicts[]` MUST contain a `COMP-REGENERATION-NO-COMMON-ANCESTOR` entry at `error` severity explaining that merge was skipped. No two-way fallback exists.

- [x] Commit.

## Task 4: Spec prose — §3 Source anchor identity

- [x] Draft §3 defining how nodes are matched across the three input trees.

**Normative set-equality (F1 fix).** CRF §5.1 declares `x-generation.anchors` as "array of string" without ordering semantics. This spec defines a stronger normative rule applicable only to regeneration merge: for merge-identity purposes, anchor arrays are compared as **order-normalized, duplicate-stripped sets**. Two anchor arrays match iff their string-sorted, deduplicated forms are byte-identical. This rule lives in regeneration-merge-spec §3 and is NOT a CRF claim.

**Primary rule:** the order-normalized set rule is the equality comparator. A node N_old in `old-generated` matches a node N_new in `new-generated` when their normalized anchor sets compare equal. Same rule applies to matching `designer-edited` nodes against `new-generated`. Task 10's anchor-mapping substitution may transform the old anchor set before this same equality comparator is applied; raw equality is the normal path, not the only possible pre-mapping path.

**Tiebreaker for duplicated anchor sets (B1 fix).** Anchor uniqueness is NOT enforced by CRF — a `Section` and a `Label` inside it can both carry `["unit:identity"]`. When multiple candidate nodes within the SAME tree share an identical anchor set, the matching key first extends to `(anchor_set, parent_match_key)`. Parent identity recurses via the same rule. If same-parent duplicates remain, the processor MAY use a stable local discriminator present in both compared nodes and independent of sibling order, such as non-empty `id`, `bind`, or `ActionButton.actionRef`. Component type, tree path, sibling position, and ordinal are NOT identity. If no stable discriminator resolves exactly one candidate, the duplicate is ambiguous and MUST NOT be matched against `new-generated`; the later algorithm surfaces it through orphan/pending-review/conflict handling instead of choosing arbitrarily.

**Nodes without `x-generation`:** treated as designer-authored from inception for merge-identity purposes. Matched across `old-generated` ↔ `designer-edited` by `id` if present, otherwise by RFC 6901 JSON Pointer node path (`/tree/children/2/children/0`). Never matched against `new-generated` (the generator did not produce them).

**Nodes with missing or empty `x-generation.anchors`:** treated identically to nodes without `x-generation` for merge identity, even if other provenance members (`source`, `strategy`, `generatedBy`, `generatedAt`) are present. Task 5 may classify those nodes as generated for preservation/reporting purposes, but §3 anchor identity cannot match them against `new-generated` without a non-empty anchor set.

**Anchor taxonomy:** reuses CRF §5 prefixes (`item:`, `unit:`, `task:`, `action:`, `concept:`). This spec does not introduce new prefixes, rewrite suffixes, or claim CRF-level ordering, uniqueness, or global anchor identity.

- [x] Commit.

## Task 5: Spec prose — §4 Generated-node markers

- [x] Draft §4 defining when a node is considered "generated" for merge purposes.

Rule: define `hasGenerationMarker` as presence of `x-generation` with at least one of `source`, `strategy`, `generatedBy`, or non-empty `anchors`; `generatedAt` alone does not make a node generated for merge purposes. Define `hasMatchableGenerationAnchors` separately, using §3's non-empty computed anchor set. Nodes without `x-generation` are treated as designer-authored for regeneration-merge classification and are preserved as-is across regeneration (they cannot be regenerated because they have no source linkage).

§4 MUST address: how a designer "adopts" a generated node by editing it (the node retains `x-generation`; designer edits are tracked via the three-way diff against `old-generated`).

- [x] Commit.

## Task 6: Spec prose — §5 Designer-edit detection

- [x] Draft §5 defining how the merge detects that a designer edited a generated node.

§5 is a structural-delta classifier, not the merge algorithm. For each node N_designer in `designer-edited` with matching N_old in `old-generated`, compare parsed JSON values using N_old as the common ancestor. Object member order is insignificant; array order is significant except where another section explicitly overrides it (for example §3 anchor-set equality). Compare child arrays by matched child identities so descendant edits do not bubble into parent deltas.

Any difference is a designer edit. Differences are categorized for §6/§7 consumption:

| Delta class | Example | §5 output |
|---|---|---|
| Property override | designer changed `props.label` from "Name" to "Full Name" | Property delta. §6 preserves if N_new's same property equals N_old's; §6/§7 reports conflict if N_new also changed it differently. |
| Children reorder | designer reordered two children | Child-order delta on the parent. §6 may preserve ordering while child content remains classified at each child node. |
| Children add | designer inserted a child not present in old or new | Child-add delta. §6/§8 maps the child into existing orphaned handling; `pendingReview` is reserved for newly generated nodes. No `designer-inserted` report bucket exists. |
| Children remove | designer deleted a child present in old; new still has it | Child-remove delta. §6/§7 decides whether this becomes `COMP-REGENERATION-DESIGNER-REMOVED`. |
| Widget swap | designer changed `component: TextInput` → `TextArea` | Widget-swap delta. §6 preserves the designer widget for review when appropriate; §7 reports `COMP-REGENERATION-WIDGET-SWAP` as a warning conflict unless N_new independently made the same widget choice. |

§5 MUST state that non-matchable generated markers and designer-authored nodes can participate in old/designer preservation deltas only; they do not create old/new regeneration matches or source-authority conflicts.

§5 MUST emphasize: the algorithm operates on JSON values, not on visual semantics. Authoring or review surfaces MAY visualize structural deltas; runtime renderers remain out of scope. All "mark" or "flag" language writes to returned report output only and MUST NOT mutate inputs (§2.5).

- [x] Commit.

## Task 7: Spec prose — §6 Merge algorithm

- [x] Draft §6 enumerating the baseline merge rules from concept §7.2 verbatim, then expanding each with full preconditions and outputs.

```text
Preserve designer edits when their source anchors still resolve.
Regenerate nodes whose itemRef, actionRef, or unitRef changed.
Mark orphaned nodes when their bind, actionRef, or unitRef no longer resolves.
Add newly generated fields and actions as pending review.
Never silently delete designer-authored layout.
```

The quoted baseline uses `itemRef` as concept shorthand. The normative expansion MUST use Component's actual Definition item surface: `bind` and `item:` generation anchors.

§6 MUST present the algorithm as deterministic recursive assembly with explicit indexes:

```text
if old_generated is null:
  merged = deep_copy(new_generated)
  report.conflicts += {
    code: "COMP-REGENERATION-NO-COMMON-ANCESTOR",
    severity: "error",
    nodePath: "/tree",
    anchors: []
  }
  return { merged, report }

match_key(N, anchorMappings=None):
  if N does not have matchable anchors (§3/§4): return UNMATCHABLE
  anchor_set = compute_anchor_set(N)
  if anchorMappings is not None:
    anchor_set = substitute(anchor_set, anchorMappings)
  return disambiguate(anchor_set, parent_match_key, stable_local_discriminator)

build_index(tree, anchorMappings=None):
  index = {}
  ambiguous = set()
  for each node N in tree pre-order document order:
    key = match_key(N, anchorMappings)
    if key is UNMATCHABLE: continue
    if key is AMBIGUOUS:
      ambiguous.add(compute_anchor_set(N, anchorMappings)); continue
    if index already has key:
      remove key from index; ambiguous.add(key)
    else:
      index[key] = N
  # ambiguous contains unresolved mapped anchor sets and duplicate resolved keys;
  # lookup treats either state as no deterministic match.
  return { index, ambiguous }

new_index      = build_index(new_generated)
old_index      = build_index(old_generated, anchorMappings)
designer_index = build_index(designer_edited, anchorMappings)
represented_designer_nodes = set()

merge_generated_node(N_new):
  key = match_key(N_new)
  N_old = None
  N_designer = None

  if key is UNMATCHABLE:
    # Unmatchable generated containers still recurse into children; only the
    # unmatchable shell itself is copied from new-generation.
    merged_node = shallow_copy_without_children(N_new)

  elif key is AMBIGUOUS or key in new_index.ambiguous:
    merged_node = shallow_copy_without_children(N_new)
    report.pendingReview += entry(N_new, code: "COMP-REGENERATION-PENDING-REVIEW")

  else:
    N_old      = lookup(old_index, key)      # returns None for missing or ambiguous keys
    N_designer = lookup(designer_index, key) # returns None for missing or ambiguous keys
    if N_designer is not None:
      represented_designer_nodes.add(N_designer)

    if N_old is None and N_designer is None:
      merged_node = shallow_copy_without_children(N_new)
      report.pendingReview += entry(N_new, code: "COMP-REGENERATION-PENDING-REVIEW")

    elif N_old is None and N_designer is not None:
      merged_node = copy_designer_shell_without_children(N_designer)
      report.conflicts += entry(merged_node, code: "COMP-REGENERATION-DESIGNER-PRECEDES")

    elif N_old is not None and N_designer is None:
      merged_node = None
      report.conflicts += entry(N_new, code: "COMP-REGENERATION-DESIGNER-REMOVED")

    elif structurally_equal(N_old, N_designer):
      merged_node = shallow_copy_without_children(N_new)
      if match_depended_on_anchor_mapping(N_old, N_new, ctx.anchorMappings):
        report.surviving += entry(merged_node, code: "COMP-REGENERATION-RENAME-MIGRATED")
      generated_deltas = generated_only_non_anchor_property_deltas(N_old, N_new)
      if generated_deltas:
        report.regenerated += entry(merged_node, code: "COMP-REGENERATION-REGENERATED", propertyDeltas: generated_deltas)
      elif not match_depended_on_anchor_mapping(N_old, N_new, ctx.anchorMappings):
        report.regenerated += entry(merged_node, code: "COMP-REGENERATION-REGENERATED")

    else:
      deltas = classify_designer_deltas(N_old, N_designer)
      # Base is N_new without children. Apply surviving designer deltas as
      # overlays; unrelated generator-only changes remain from N_new.
      merged_node, conflict_entries, surviving_deltas, generated_deltas, rename_migrated = apply_three_way_node_merge(N_old, N_designer, N_new, deltas)
      # Report entries are code-scoped. The same node may emit both
      # PROPERTY-CONFLICT and WIDGET-SWAP conflict entries, and may also emit a
      # DESIGNER-SURVIVED, REGENERATED, or RENAME-MIGRATED entry for unrelated
      # non-conflicting deltas.
      report.conflicts += conflict_entries
      if rename_migrated:
        report.surviving += entry(merged_node, code: "COMP-REGENERATION-RENAME-MIGRATED")
      if surviving_deltas:
        report.surviving += entry(merged_node, code: "COMP-REGENERATION-DESIGNER-SURVIVED", propertyDeltas: surviving_deltas)
      if generated_deltas:
        report.regenerated += entry(merged_node, code: "COMP-REGENERATION-REGENERATED", propertyDeltas: generated_deltas)
      if not conflict_entries and not surviving_deltas and not generated_deltas and not rename_migrated:
        report.regenerated += entry(merged_node, code: "COMP-REGENERATION-REGENERATED")

  # Children are assembled recursively in new_generated child order before this
  # function returns merged_node to its parent. This is recursive assembly, not
  # a separate child-before-parent traversal contract.
  if merged_node is not None:
    merged_node.children = merge_children(N_new, N_old, N_designer, merged_node)
  return merged_node

merge_children(N_new, N_old, N_designer, merged_node):
  children = [merge_generated_node(C_new) for each C_new in N_new.children]
  remove None entries from children

  if N_old and N_designer have a designer childReorder delta:
    old_order = matched child keys in N_old.children
    new_order = matched child keys in N_new.children
    designer_order = matched child keys in N_designer.children

    if new_order == old_order:
      reorder the matched entries in children to designer_order
      leave newly generated children in their N_new relative positions
      report.surviving += entry(merged_node,
        code: "COMP-REGENERATION-DESIGNER-SURVIVED",
        propertyDeltas: ["/children"])
    elif new_order != designer_order:
      keep N_new order for matched generated children
      report.conflicts += entry(merged_node,
        code: "COMP-REGENERATION-PROPERTY-CONFLICT",
        propertyDeltas: ["/children"])

  return children

merged.tree = merge_generated_node(new_generated.tree)

# Orphan pass — B2 fix: reattachment is explicit and roots are maximal.
is_uncovered_orphan_candidate(N_designer):
  key = match_key(N_designer, anchorMappings)
  return N_designer not in represented_designer_nodes
    and no descendant of N_designer is in represented_designer_nodes
    and (
      key is UNMATCHABLE
      or key is AMBIGUOUS
      or key in designer_index.ambiguous
      or key in new_index.ambiguous
      or key does not resolve in new_index.index
    )

orphan_roots = maximal designer_edited nodes satisfying
  is_uncovered_orphan_candidate(N_designer)
  and no ancestor already selected as an orphan root

for each orphan_root in orphan_roots sorted by designer_edited pre-order document order:
  direct_parent = locate_direct_parent_in_merged(orphan_root)
  if direct_parent is not None:
    append orphan_root subtree once as a child of direct_parent
    report.orphaned += entry(orphan_root,
      code: "COMP-REGENERATION-ORPHAN-NODE",
      reattachedTo: direct_parent.nodePath,
      cascaded: false,
      detached: false)
  else:
    nearest = locate_nearest_higher_ancestor_in_merged(orphan_root)
    if nearest is not None:
      append orphan_root subtree once as a child of nearest
      report.orphaned += entry(orphan_root,
        code: "COMP-REGENERATION-ORPHAN-NODE",
        reattachedTo: nearest.nodePath,
        cascaded: true,
        detached: false)
      report.orphaned += entry(orphan_root,
        code: "COMP-REGENERATION-ORPHAN-REATTACHED-CASCADE",
        reattachedTo: nearest.nodePath,
        cascaded: true,
        detached: false)
    else:
      append orphan_root subtree once under /tree after the last root child
      report.orphaned += entry(orphan_root,
        code: "COMP-REGENERATION-ORPHAN-NODE",
        reattachedTo: "/tree",
        cascaded: false,
        detached: true)
      report.orphaned += entry(orphan_root,
        code: "COMP-REGENERATION-ORPHAN-DETACHED",
        reattachedTo: "/tree",
        cascaded: false,
        detached: true)

locate_direct_parent_in_merged(N): inspect only N's immediate parent in
  designer-edited; compute mapped match_key(parent); if the key resolves to a
  node in merged and is not ambiguous, return that node; else return None.

locate_nearest_higher_ancestor_in_merged(N): walk ancestors above N's immediate
  parent in designer-edited; for each ancestor A, compute mapped match_key(A);
  if A's key resolves to a node in merged and is not ambiguous, return that
  node; else continue up.
```

§6 MUST also pin: index construction and orphan-root selection use pre-order document order; recursive generated-node assembly starts from `new_generated` child order, then preserves designer-only child reorders when the generator did not also reorder that matched child set; child arrays are finalized before each merged node returns to its parent; orphan reattachment runs as a single pass after generated-node assembly, in designer-edited document order over maximal uncovered orphan roots, so reattachment ordering is deterministic and orphan descendants are not duplicated. Non-matchable old/designer nodes are never overlaid onto `new_generated` shells by path or `id`; they are only preserved through uncovered orphan subtree reattachment when doing so will not duplicate a descendant already represented by generated-node assembly.

- [x] Commit.

## Task 8: Spec prose — §7 Conflict severities + finding codes

- [x] Draft §7 introducing the `COMP-REGENERATION-*` finding family for **merge-context-only findings**.

**Family scope (H4 fix).** `COMP-REGENERATION-*` covers findings that exist BECAUSE a merge happened — merge-decision conflicts, orphan reattachment, rename detection, missing-common-ancestor. Reference-resolution failures (bind no longer resolves, actionRef unresolvable, unitRef points at a removed unit) are NOT in this family — they route through the existing `COMP-REFERENTIAL-INTEGRITY` (CRF §7) or Component-resolver findings, with the review surface composing them alongside the MergeReport (see §11). The merge MUST run the cross-document resolver against the merged document and forward those findings into the review surface alongside `COMP-REGENERATION-*` entries.

| Code | Condition | Severity |
|---|---|---|
| `COMP-REGENERATION-NO-COMMON-ANCESTOR` | Host invoked merge without supplying `old-generated`; operation degraded to fresh generation | `error` |
| `COMP-REGENERATION-DESIGNER-PRECEDES` | Designer-authored node at an anchor that new-generation also produced (no N_old) | `warning` |
| `COMP-REGENERATION-DESIGNER-REMOVED` | Designer deleted a generated node; new-generation still produces it | `warning` |
| `COMP-REGENERATION-PROPERTY-CONFLICT` | Both designer and new-generation changed the same property to different values | `warning` |
| `COMP-REGENERATION-WIDGET-SWAP` | Designer changed a node's `component` type from old-generated and the change requires human review; emitted as a conflict unless new-generation independently made the same widget choice | `warning` |
| `COMP-REGENERATION-DESIGNER-SURVIVED` | One or more non-conflicting designer deltas survived in the merged node | `info` |
| `COMP-REGENERATION-REGENERATED` | Node regenerated from `new-generated` with no surviving designer delta and no conflict, or one or more generated-only non-anchor property deltas remained on a mixed-outcome node. Not emitted solely for the anchor-set update already represented by `COMP-REGENERATION-RENAME-MIGRATED` | `info` |
| `COMP-REGENERATION-ORPHAN-NODE` | Designer subtree has no matching anchor set in new-generation. Remains `warning` in `MergeReport`; review surfaces MAY show an error-level effective severity when a separate resolver error composes against the same node. | `warning` |
| `COMP-REGENERATION-ORPHAN-REATTACHED-CASCADE` | Designer subtree reattached above its original parent because the parent chain orphaned | `info` |
| `COMP-REGENERATION-ORPHAN-DETACHED` | Designer subtree reattached at root because no ancestor matches in merged | `warning` |
| `COMP-REGENERATION-RENAME-MIGRATED` | Anchor sets differ between old and new but anchor-mapping substitution makes them equal and preserves presentation continuity | `info` |
| `COMP-REGENERATION-PENDING-REVIEW` | Newly generated node not present in old or designer | `info` |

§7 MUST state:

- Hosts MUST NOT downgrade `error`. Hosts MAY upgrade lower severities under a host-defined strict mode.
- The merge MUST NOT emit `COMP-REGENERATION-ORPHAN-BINDING` or any other reference-resolution finding under the regeneration family. Bind/reference failures are emitted by the resolver and composed into the review surface as separate findings against the same node; they are not duplicated in `MergeReport`.
- **No heuristic rename detection** (H3 fix). A `COMP-REGENERATION-RENAME-UNDOCUMENTED` finding does not exist; if anchor sets differ and no anchor-mapping substitution makes them equal, the nodes simply do not match (any corresponding `designer_edited` subtree that remains uncovered becomes `ORPHAN-NODE`; N_new becomes `PENDING-REVIEW`). Authors who want rename support author an anchor-mapping entry.

- [x] Commit.

## Task 9: Spec prose — §8 Orphan handling

- [x] Draft §8 defining orphan handling end-to-end. Reflects H4 (finding-family separation) and B2 (reattachment is explicit).

Rules:

1. A designer-edited node with no anchor-set match in `new-generated` is preserved in `merged` (concept §7.2: "Never silently delete designer-authored layout"). Reattachment rule lives in §6 (Task 7).
2. Every orphan emits `COMP-REGENERATION-ORPHAN-NODE` at `warning` severity by default.
3. After the merge completes, the spec REQUIRES the merge runtime to invoke the CRF §6 cross-document resolver against the merged document. Any resolver findings for orphan nodes (unresolved `bind`, `actionRef`, `unitRef`) appear as separate findings in the review surface, composed alongside the `COMP-REGENERATION-ORPHAN-NODE` entry. The review surface MAY show an error-level effective severity when either:
   - The orphan carries an `error`-severity CRF finding (e.g., `unitRef` unresolved with Experience loaded), or
   - The Component-resolver emits an error-level bind-resolution finding against the orphan.
4. Cascade and detachment cases (§6 algorithm) emit `COMP-REGENERATION-ORPHAN-REATTACHED-CASCADE` (`info`) and `COMP-REGENERATION-ORPHAN-DETACHED` (`warning`) respectively, in ADDITION to the base `ORPHAN-NODE` entry.
5. Orphans appear in `MergeReport.orphaned[]` with full anchor set, `nodePath` in merged (the reattached path), `reattachedTo`, and explicit boolean `cascaded`/`detached` flags. The resolver-emitted reference findings are NOT duplicated in `MergeReport`; they live in their own resolver report and the review surface composes them to orphan entries by the resolver's affected Component node key/path when available.

§8 MUST address rendering: orphan nodes render normally (the designer authored them, they should display). Tooling MAY visually mark them via the §10 `data-merge-status` attribute; the spec does not mandate visual treatment.

- [x] Commit.

## Task 10: Spec prose — §9 Rename and anchor-mapping handling

- [x] Draft §9 defining rename detection via anchor-mapping substitution. **H3 fix: no heuristic detection — the anchor-mappings document is the only signal.**

**Anchor-mappings document shape (L3 + F6 fix).** No `migration-spec.md` exists in `formspec/specs/` as of this writing. This spec defines the minimum **anchor-mappings document** shape consumed by the merge. The artifact is named `anchorMappings`, NOT `migrations`, to avoid conceptual collision with Core §6.7 (which uses `migrations` for Response-data field transformations within a Definition document — a different concept).

```json
{
  "$formspecAnchorMappings": "1.0",
  "anchorMappings": [
    { "from": "item:dateOfBirth", "to": "item:birthDate" },
    { "from": "unit:legacyIdentity", "to": "unit:identity" }
  ]
}
```

Each entry maps a single old anchor (`from`) to a single new anchor (`to`). Entries are unordered and processed as a set. A richer anchor-mappings spec MAY land later (semantic versioning, conditional mappings, value-transform links); the minimum shape above is its forward-compatible subset.

**Match-via-substitution rule.** Let `substitute(anchors, M)` apply every applicable mapping entry in `M` to the anchor set `anchors`. A node N_old matches N_new via substitution iff:

```text
substitute(N_old.anchors, M) == N_new.anchors
```

— that is, applying the mappings to N_old's anchor set yields EXACTLY N_new's anchor set under the §3 order-normalized set rule. If substitution does not produce equality, no match is declared.

**When an anchor-mapping match succeeds, the merge:**

1. Treats N_old and N_new as matched (in the same pass as the primary anchor-equality check).
2. Applies N_new's anchor set to the merged node.
3. Preserves designer presentation choices via the standard three-way merge (§6).
4. Emits `COMP-REGENERATION-RENAME-MIGRATED` at `info` severity.

**When no anchor-mapping match succeeds and anchor-set equality also fails,** the nodes simply do not match. Any corresponding `designer_edited` subtree that remains uncovered becomes `COMP-REGENERATION-ORPHAN-NODE`; N_new becomes `COMP-REGENERATION-PENDING-REVIEW`. No `RENAME-UNDOCUMENTED` finding exists — the orphan + pending-review pair is the signal.

§9 MUST NOT define heuristic rename detection (set-distance, edit-distance, prefix-family matching). Authors who want rename support author anchor-mapping entries.

- [x] Commit.

## Task 11: Spec prose — §10 Studio review UX expectations

- [x] Draft §10 defining the minimum review-surface contract. M2 fix: DOM contract pairs status with anchors so assertions identify a specific report entry.

A Studio-grade review surface MUST:

1. Render every entry in `MergeReport.conflicts[]` with its anchor set, severity, finding code, and human-readable reason.
2. Provide per-conflict resolution affordance (accept designer / accept regenerated / manual edit) — affordance is host-defined; the spec only mandates that conflicts surface.
3. Render every entry in `MergeReport.pendingReview[]` with a `pending-review` marker on the affected node in the rendered Component preview. **DOM-level:** the rendered node MUST carry BOTH:
   - `data-merge-status="pending-review"`
   - `data-merge-anchors="<sorted-comma-joined anchor set>"` (e.g., `"item:applicantName,unit:identity"`)
4. Render every base `COMP-REGENERATION-ORPHAN-NODE` entry in `MergeReport.orphaned[]` with an `orphan` marker; DOM-level: `data-merge-status="orphan"` AND `data-merge-anchors="..."`. Cascade-reattached and detached orphan entries use the same base `data-merge-status="orphan"` marker for that orphan root; the `cascaded` / `detached` flags from `MergeReport.orphaned[]` are surfaced via host-defined visual treatment or report rows, NOT additional DOM attributes (spec-minimum stays narrow).
5. Render coverage findings — `EXP-COVERAGE-UNCOVERED-REQUIRED-ITEM` from the Experience resolver (H2 delegation) — alongside the MergeReport entries. The composition rule lives in §11.

§10 MUST clarify: these are minimum conformance levers. Full Studio review UX (visual design, interaction model, keyboard flows, undo/redo) is product surface, not spec.

- [x] Commit.

## Task 12: Spec prose — §11 Conformance

- [x] Draft §11 pinning four conformance levels.

**Level 1 — Algorithm.** Implements §6 algorithm; emits findings per §7; honors §8 orphan rules and §9 substitution rules.

**Level 2 — Report shape.** `MergeReport` validates against `regeneration-merge-report.schema.json`.

**Level 3 — Invariants.** Determinism, no-mutation, and convergence-under-no-source-change (definition below).

**Level 4 — Composition with resolvers.** After producing `merged`, a conforming runtime MUST run the CRF §6 cross-document resolver on the merged document AND MUST run the Experience coverage resolver per EXP §10 on the loaded `(Definition, Experience)` pair. Findings from both resolvers compose into the review surface alongside MergeReport entries.

**F2 grounding for invoking CRF §6 on a synthesized document.** CRF §6.3 limits resolver traversal to the "authored Component document, not an implementation-specific rendered DOM or host widget tree." A merged Component document is structurally a Component document, not a DOM, and is NOT an expansion of custom component instances (CRF §6.3 line 519 forbids pre-expansion). CRF §6.1 takes a `component` document as input without an authorship constraint, and CRF §6.4 establishes the resolver as deterministic, no-mutation, one-directional, and report-only. Regeneration-merge §11 MUST cite CRF §6.1 + §6.4 (NOT §6.3's "authored" word) as the basis for invoking the resolver on the merged document. The merged document satisfies the structural requirement of §6.1; the side-effect-free guarantee of §6.4 makes the invocation safe.

**F3 EXP coverage composition.** EXP §8.1 (`experience-spec.md` line 327) defines coverage as a predicate over `(Definition, Experience)` — NOT over a Component document. EXP coverage findings carry the field `path` (Definition item path, e.g., `applicantName`), NOT `nodePath` (Component tree path). Therefore the merge runtime MUST NOT attempt to feed the merged Component document into the Experience resolver. Instead:

1. The merge runtime invokes the Experience coverage resolver on the loaded `(Definition, Experience)` pair independently of merge inputs.
2. The resolver emits zero or more `EXP-COVERAGE-UNCOVERED-REQUIRED-ITEM` findings, each carrying `path` (Definition item path).
3. The review surface composes each EXP finding to MergeReport entries via a **two-hop join**: EXP `path` → anchor string `"item:<path>"` → MergeReport entry whose `anchors` contains that string → MergeReport entry's `nodePath`. The first hop is the canonical anchor-prefix rule (CRF §5.2 `item:` prefix); the second is the standard MergeReport indexing.
4. EXP findings for items that no MergeReport entry covers (no anchor `item:<path>` exists in the merged document) surface as uncovered-and-unanchored — Studio displays them in the coverage panel without a node link.

MergeReport itself does NOT carry coverage findings. The merge schema description (Task 13) documents the two-hop join explicitly.

**F4 Convergence — narrowed.** Convergence guarantees apply only after the designer's review-and-resolve cycle completes. Formally:

> Given `(merged, report) = merge(old, designer, new, ctx)`, if `report.conflicts == [] AND report.pendingReview == []`, then `merge(new, merged, new, ctx)` MUST produce a `report'` with empty `conflicts` and empty `pendingReview`, and `merged'` structurally equal to `merged`.

If cycle 1's report has non-empty `conflicts` or `pendingReview`, the convergence guarantee does NOT apply until the designer resolves those entries (semantics of "resolve" — accept-regenerated, accept-designer-with-tombstone, manual edit — are host-defined). Without conflict resolution, cycle 2 may legitimately re-raise the same findings (e.g., the `DESIGNER-REMOVED` case: if the designer does not reverse the removal or supply a tombstone, the source still mandates the node and the conflict persists on every cycle until resolved). This is correct behavior, not a convergence failure.

§11 MUST state: a runtime that fails any one level does not conform. Schema-validity of the merged Component document is implicit (the output is a Component v1.1 document).

- [x] Commit.

## Task 13: Author MergeReport schema

- [x] Create `schemas/regeneration-merge-report.schema.json`. JSON Schema 2020-12.

Shape (F5 + F7 fixes: every entry carries `code`/`severity`/`reason`; `propertyDeltas[]` added so Studio can identify which properties survived/changed without re-diffing inputs; implementation also pins array-specific code placement and code-specific severity to the §7 table):

```json
{
  "$id": "https://formspec.org/schemas/regeneration-merge-report/1.0",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["version", "surviving", "regenerated", "orphaned", "pendingReview", "conflicts"],
  "properties": {
    "version": { "const": "1.0" },
    "surviving":    { "type": "array", "items": { "$ref": "#/$defs/SurvivingEntry" } },
    "regenerated":  { "type": "array", "items": { "$ref": "#/$defs/RegeneratedEntry" } },
    "orphaned":     { "type": "array", "items": { "$ref": "#/$defs/OrphanEntry" } },
    "pendingReview":{ "type": "array", "items": { "$ref": "#/$defs/PendingReviewEntry" } },
    "conflicts":    { "type": "array", "items": { "$ref": "#/$defs/ConflictEntry" } }
  },
  "description": "Coverage findings are NOT included here. They are emitted by the Experience coverage resolver (EXP §10) as EXP-COVERAGE-UNCOVERED-REQUIRED-ITEM, carry the field `path` (Definition item path, NOT `nodePath`), and compose into the review surface via a two-hop join: EXP `path` -> anchor string `item:<path>` -> MergeReport entry whose `anchors` includes that string -> MergeReport entry's `nodePath`. CRF and Component bind/reference-resolution failures are also NOT included here; when those resolver findings identify an affected Component node by node key/path, review surfaces compose them to MergeReport entries for that same merged node without duplicating resolver findings inside MergeReport.",
  "$defs": {
    "Entry": {
      "type": "object",
      "required": ["anchors", "nodePath", "code", "severity", "reason"],
      "properties": {
        "anchors":  { "type": "array", "items": { "type": "string" }, "uniqueItems": true, "description": "Anchor set compared under §3 order-normalized set-equality (NOT a CRF semantic; regeneration-merge-spec only)." },
        "nodePath": { "type": "string", "description": "Stable path in the merged document tree (e.g., /tree/children/0)." },
        "code": { "$ref": "#/$defs/Code" },
        "severity": { "enum": ["error", "warning", "info"] },
        "reason":   { "type": "string", "minLength": 1 },
        "propertyDeltas": {
          "type": "array",
          "description": "JSON Pointer strings for properties on this node that differ between old, designer, and new. Studio uses these as the diff key set; actual property values are read from the three input documents the merge consumed. OPTIONAL: empty array allowed when no property-level change applies (e.g., orphans, pending-review nodes).",
          "items": { "type": "string", "pattern": "^/" },
          "uniqueItems": true
        }
      },
      "allOf": [
        {
          "if": { "properties": { "code": { "const": "COMP-REGENERATION-NO-COMMON-ANCESTOR" } }, "required": ["code"] },
          "then": { "properties": { "severity": { "const": "error" } } }
        },
        {
          "if": { "properties": { "code": { "const": "COMP-REGENERATION-DESIGNER-PRECEDES" } }, "required": ["code"] },
          "then": { "properties": { "severity": { "const": "warning" } } }
        },
        {
          "if": { "properties": { "code": { "const": "COMP-REGENERATION-DESIGNER-REMOVED" } }, "required": ["code"] },
          "then": { "properties": { "severity": { "const": "warning" } } }
        },
        {
          "if": { "properties": { "code": { "const": "COMP-REGENERATION-PROPERTY-CONFLICT" } }, "required": ["code"] },
          "then": { "properties": { "severity": { "const": "warning" } } }
        },
        {
          "if": { "properties": { "code": { "const": "COMP-REGENERATION-WIDGET-SWAP" } }, "required": ["code"] },
          "then": { "properties": { "severity": { "const": "warning" } } }
        },
        {
          "if": { "properties": { "code": { "const": "COMP-REGENERATION-DESIGNER-SURVIVED" } }, "required": ["code"] },
          "then": { "properties": { "severity": { "const": "info" } } }
        },
        {
          "if": { "properties": { "code": { "const": "COMP-REGENERATION-REGENERATED" } }, "required": ["code"] },
          "then": { "properties": { "severity": { "const": "info" } } }
        },
        {
          "if": { "properties": { "code": { "const": "COMP-REGENERATION-ORPHAN-NODE" } }, "required": ["code"] },
          "then": { "properties": { "severity": { "const": "warning" } } }
        },
        {
          "if": { "properties": { "code": { "const": "COMP-REGENERATION-ORPHAN-REATTACHED-CASCADE" } }, "required": ["code"] },
          "then": { "properties": { "severity": { "const": "info" } } }
        },
        {
          "if": { "properties": { "code": { "const": "COMP-REGENERATION-ORPHAN-DETACHED" } }, "required": ["code"] },
          "then": { "properties": { "severity": { "const": "warning" } } }
        },
        {
          "if": { "properties": { "code": { "const": "COMP-REGENERATION-RENAME-MIGRATED" } }, "required": ["code"] },
          "then": { "properties": { "severity": { "const": "info" } } }
        },
        {
          "if": { "properties": { "code": { "const": "COMP-REGENERATION-PENDING-REVIEW" } }, "required": ["code"] },
          "then": { "properties": { "severity": { "const": "info" } } }
        }
      ]
    },
    "SurvivingEntry": {
      "type": "object",
      "allOf": [
        { "$ref": "#/$defs/Entry" },
        { "type": "object", "properties": { "code": { "enum": ["COMP-REGENERATION-DESIGNER-SURVIVED", "COMP-REGENERATION-RENAME-MIGRATED"] } } }
      ],
      "unevaluatedProperties": false
    },
    "RegeneratedEntry": {
      "type": "object",
      "allOf": [
        { "$ref": "#/$defs/Entry" },
        { "type": "object", "properties": { "code": { "const": "COMP-REGENERATION-REGENERATED" } } }
      ],
      "unevaluatedProperties": false
    },
    "OrphanEntry": {
      "type": "object",
      "allOf": [
        { "$ref": "#/$defs/Entry" },
        {
          "type": "object",
          "required": ["reattachedTo", "cascaded", "detached"],
          "properties": {
            "code": { "enum": ["COMP-REGENERATION-ORPHAN-NODE", "COMP-REGENERATION-ORPHAN-REATTACHED-CASCADE", "COMP-REGENERATION-ORPHAN-DETACHED"] },
            "reattachedTo": { "type": "string", "description": "nodePath of the merged-tree node the orphan was reattached under." },
            "cascaded":     { "type": "boolean", "description": "True when reattachment had to walk above the original parent." },
            "detached":     { "type": "boolean", "description": "True when no surviving ancestor existed and the orphan reattached at /tree." }
          }
        }
      ],
      "unevaluatedProperties": false
    },
    "PendingReviewEntry": {
      "type": "object",
      "allOf": [
        { "$ref": "#/$defs/Entry" },
        { "type": "object", "properties": { "code": { "const": "COMP-REGENERATION-PENDING-REVIEW" } } }
      ],
      "unevaluatedProperties": false
    },
    "ConflictEntry": {
      "type": "object",
      "allOf": [
        { "$ref": "#/$defs/Entry" },
        { "type": "object", "properties": { "code": { "enum": ["COMP-REGENERATION-NO-COMMON-ANCESTOR", "COMP-REGENERATION-DESIGNER-PRECEDES", "COMP-REGENERATION-DESIGNER-REMOVED", "COMP-REGENERATION-PROPERTY-CONFLICT", "COMP-REGENERATION-WIDGET-SWAP"] } } }
      ],
      "unevaluatedProperties": false
    },
    "Code": {
      "enum": [
        "COMP-REGENERATION-NO-COMMON-ANCESTOR",
        "COMP-REGENERATION-DESIGNER-PRECEDES",
        "COMP-REGENERATION-DESIGNER-REMOVED",
        "COMP-REGENERATION-PROPERTY-CONFLICT",
        "COMP-REGENERATION-WIDGET-SWAP",
        "COMP-REGENERATION-DESIGNER-SURVIVED",
        "COMP-REGENERATION-REGENERATED",
        "COMP-REGENERATION-ORPHAN-NODE",
        "COMP-REGENERATION-ORPHAN-REATTACHED-CASCADE",
        "COMP-REGENERATION-ORPHAN-DETACHED",
        "COMP-REGENERATION-RENAME-MIGRATED",
        "COMP-REGENERATION-PENDING-REVIEW"
      ]
    }
  }
}
```

- [x] Validate via Ajv 2020-12 standalone:

```bash
node --input-type=module <<'EOF'
import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import standaloneCode from 'ajv/dist/standalone/index.js';
import addFormats from 'ajv-formats';

const schema = JSON.parse(fs.readFileSync('schemas/regeneration-merge-report.schema.json', 'utf8'));
const ajv = new Ajv2020({ strict: true, allErrors: true, code: { source: true } });
addFormats(ajv);
const validate = ajv.compile(schema);
standaloneCode(ajv, validate);
console.log('ajv standalone ok');
EOF
```

Expected: `ajv standalone ok`.

- [x] Commit.

## Task 14: Schema-shape pytest

- [x] Create `tests/conformance/spec/test_regeneration_merge_report_schema.py`.

```python
"""Pin the regeneration-merge-report schema shape."""
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

SCHEMA_PATH = Path(__file__).resolve().parents[3] / "schemas" / "regeneration-merge-report.schema.json"

@pytest.fixture(scope="module")
def schema() -> dict:
    return json.loads(SCHEMA_PATH.read_text())

@pytest.fixture(scope="module")
def validator(schema) -> Draft202012Validator:
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)

def _entry(code: str, severity: str, **extra) -> dict:
    return {
        "anchors": ["item:/applicant/name"],
        "nodePath": "/tree/children/0",
        "code": code,
        "severity": severity,
        "reason": "sample",
        **extra,
    }

def _report(**overrides) -> dict:
    report = {
        "version": "1.0",
        "surviving": [_entry("COMP-REGENERATION-DESIGNER-SURVIVED", "info")],
        "regenerated": [_entry("COMP-REGENERATION-REGENERATED", "info")],
        "orphaned": [
            _entry(
                "COMP-REGENERATION-ORPHAN-NODE",
                "warning",
                reattachedTo="/tree",
                cascaded=False,
                detached=False,
            )
        ],
        "pendingReview": [_entry("COMP-REGENERATION-PENDING-REVIEW", "info")],
        "conflicts": [_entry("COMP-REGENERATION-PROPERTY-CONFLICT", "warning")],
    }
    report.update(overrides)
    return report

def test_id_and_version(schema):
    assert schema["$id"].endswith("/regeneration-merge-report/1.0")
    assert schema["properties"]["version"]["const"] == "1.0"

def test_required_top_level_arrays(schema):
    required = set(schema["required"])
    assert required == {"version", "surviving", "regenerated", "orphaned", "pendingReview", "conflicts"}

def test_entry_required_fields(schema):
    """F7 + Task 11: code/severity/reason live on base Entry."""
    entry = schema["$defs"]["Entry"]
    assert set(entry["required"]) == {"anchors", "nodePath", "code", "severity", "reason"}
    assert entry["properties"]["anchors"]["uniqueItems"] is True
    assert entry["properties"]["code"]["$ref"] == "#/$defs/Code"
    assert entry["properties"]["reason"]["minLength"] == 1

def test_entry_code_enum(schema):
    codes = set(schema["$defs"]["Code"]["enum"])
    assert codes == {
        "COMP-REGENERATION-NO-COMMON-ANCESTOR",
        "COMP-REGENERATION-DESIGNER-PRECEDES",
        "COMP-REGENERATION-DESIGNER-REMOVED",
        "COMP-REGENERATION-PROPERTY-CONFLICT",
        "COMP-REGENERATION-WIDGET-SWAP",
        "COMP-REGENERATION-DESIGNER-SURVIVED",
        "COMP-REGENERATION-REGENERATED",
        "COMP-REGENERATION-ORPHAN-NODE",
        "COMP-REGENERATION-ORPHAN-REATTACHED-CASCADE",
        "COMP-REGENERATION-ORPHAN-DETACHED",
        "COMP-REGENERATION-RENAME-MIGRATED",
        "COMP-REGENERATION-PENDING-REVIEW",
    }
    assert "COMP-REGENERATION-ORPHAN-BINDING" not in codes
    assert "COMP-REGENERATION-RENAME-UNDOCUMENTED" not in codes
    assert "COMP-REGENERATION-DESIGNER-INSERTED" not in codes
    assert set(schema["$defs"]["Entry"]["properties"]["severity"]["enum"]) == {
        "error",
        "warning",
        "info",
    }

def test_code_severity_constraints(schema):
    """§7: each finding code pins its canonical severity."""
    entry = schema["$defs"]["Entry"]
    severities = {
        rule["if"]["properties"]["code"]["const"]: rule["then"]["properties"]["severity"]["const"]
        for rule in entry["allOf"]
    }
    assert severities == {
        "COMP-REGENERATION-NO-COMMON-ANCESTOR": "error",
        "COMP-REGENERATION-DESIGNER-PRECEDES": "warning",
        "COMP-REGENERATION-DESIGNER-REMOVED": "warning",
        "COMP-REGENERATION-PROPERTY-CONFLICT": "warning",
        "COMP-REGENERATION-WIDGET-SWAP": "warning",
        "COMP-REGENERATION-DESIGNER-SURVIVED": "info",
        "COMP-REGENERATION-REGENERATED": "info",
        "COMP-REGENERATION-ORPHAN-NODE": "warning",
        "COMP-REGENERATION-ORPHAN-REATTACHED-CASCADE": "info",
        "COMP-REGENERATION-ORPHAN-DETACHED": "warning",
        "COMP-REGENERATION-RENAME-MIGRATED": "info",
        "COMP-REGENERATION-PENDING-REVIEW": "info",
    }

def test_entry_has_property_deltas(schema):
    """F5: Studio needs property-level diff visibility."""
    entry_props = schema["$defs"]["Entry"]["properties"]
    assert "propertyDeltas" in entry_props
    assert entry_props["propertyDeltas"]["items"]["pattern"] == "^/"
    assert entry_props["propertyDeltas"]["uniqueItems"] is True

def test_report_arrays_use_role_specific_entries(schema):
    props = schema["properties"]
    assert props["surviving"]["items"]["$ref"] == "#/$defs/SurvivingEntry"
    assert props["regenerated"]["items"]["$ref"] == "#/$defs/RegeneratedEntry"
    assert props["orphaned"]["items"]["$ref"] == "#/$defs/OrphanEntry"
    assert props["pendingReview"]["items"]["$ref"] == "#/$defs/PendingReviewEntry"
    assert props["conflicts"]["items"]["$ref"] == "#/$defs/ConflictEntry"

def test_role_specific_code_placement(schema):
    surviving_code = schema["$defs"]["SurvivingEntry"]["allOf"][1]["properties"]["code"]
    assert set(surviving_code["enum"]) == {
        "COMP-REGENERATION-DESIGNER-SURVIVED",
        "COMP-REGENERATION-RENAME-MIGRATED",
    }
    assert schema["$defs"]["RegeneratedEntry"]["allOf"][1]["properties"]["code"]["const"] == (
        "COMP-REGENERATION-REGENERATED"
    )
    assert schema["$defs"]["PendingReviewEntry"]["allOf"][1]["properties"]["code"]["const"] == (
        "COMP-REGENERATION-PENDING-REVIEW"
    )

def test_orphan_entry_has_reattachment_fields(schema):
    """§8: base orphan entries always carry reattachment metadata."""
    orphan_props = schema["$defs"]["OrphanEntry"]["allOf"][1]["properties"]
    assert {"reattachedTo", "cascaded", "detached"} <= set(orphan_props)
    assert set(orphan_props["code"]["enum"]) == {
        "COMP-REGENERATION-ORPHAN-NODE",
        "COMP-REGENERATION-ORPHAN-REATTACHED-CASCADE",
        "COMP-REGENERATION-ORPHAN-DETACHED",
    }
    assert set(schema["$defs"]["OrphanEntry"]["allOf"][1]["required"]) == {
        "reattachedTo",
        "cascaded",
        "detached",
    }

def test_conflict_entry_is_role_specific(schema):
    """Conflicts share base Entry fields but only allow conflict finding codes."""
    conflict = schema["$defs"]["ConflictEntry"]
    assert conflict["allOf"][0]["$ref"] == "#/$defs/Entry"
    assert set(conflict["allOf"][1]["properties"]["code"]["enum"]) == {
        "COMP-REGENERATION-NO-COMMON-ANCESTOR",
        "COMP-REGENERATION-DESIGNER-PRECEDES",
        "COMP-REGENERATION-DESIGNER-REMOVED",
        "COMP-REGENERATION-PROPERTY-CONFLICT",
        "COMP-REGENERATION-WIDGET-SWAP",
    }
    assert conflict["unevaluatedProperties"] is False

def test_valid_report_instance(validator):
    validator.validate(_report())

def test_role_specific_codes_are_rejected(validator):
    bad = _report(conflicts=[_entry("COMP-REGENERATION-REGENERATED", "info")])
    with pytest.raises(ValidationError):
        validator.validate(bad)

def test_wrong_code_severity_is_rejected(validator):
    bad = _report(
        conflicts=[
            _entry("COMP-REGENERATION-NO-COMMON-ANCESTOR", "warning")
        ]
    )
    with pytest.raises(ValidationError):
        validator.validate(bad)

def test_orphan_metadata_is_required(validator):
    bad = _report(
        orphaned=[
            _entry(
                "COMP-REGENERATION-ORPHAN-NODE",
                "warning",
                reattachedTo="/tree",
                cascaded=False,
            )
        ]
    )
    with pytest.raises(ValidationError):
        validator.validate(bad)

def test_exp_two_hop_join_documented(schema):
    """F3: schema MUST document the EXP path -> item:<path> -> anchors join,
    NOT a direct join-by-nodePath claim."""
    desc = schema["description"]
    assert "EXP-COVERAGE-UNCOVERED-REQUIRED-ITEM" in desc
    assert "two-hop join" in desc
    assert "item:<path>" in desc
```

- [x] Run, expect PASS.

```bash
cd formspec && python -m pytest tests/conformance/spec/test_regeneration_merge_report_schema.py -v
```

- [x] Commit.

## Task 15: Author shared base fixtures

- [x] Create `tests/conformance/fixtures/regeneration-merge/_base/` with: minimal Definition, minimal Experience (one unit `identity`, one task `identifyApplicant`), minimal Response Actions (one action `submitApplication`). Same shape family as the Component Reference Fields fixtures.

- [x] Commit.

## Task 16: Author per-case fixtures

Each case is a directory with five required files: `old-generated.json`, `designer-edited.json`, `new-generated.json`, `expected-merged.json`, `expected-report.json`. A case MAY also include `context.json` for optional merge context such as `anchorMappings`. L1 fix: degenerate `unchanged` case removed; subtree add/reorder cases added.

- [ ] **Case `designer-only-property`** — designer changed one `props.label`; new-generated equals old. Expected: surviving entry for the edited node; merged carries the designer's label.

- [ ] **Case `regenerator-only-property`** — designer-edited equals old; new-generated added a new prop. Expected: regenerated entry; merged carries new prop.

- [ ] **Case `property-conflict`** — both designer and new-generated changed the same `props.label`. Expected: `COMP-REGENERATION-PROPERTY-CONFLICT` finding, severity `warning`.

- [ ] **Case `widget-swap`** — designer changed `TextInput` → `TextArea`; new-generated kept `TextInput`. Expected: merged preserves `TextArea`, `conflicts[]` contains `COMP-REGENERATION-WIDGET-SWAP` at `warning` for review.

- [ ] **Case `pending-review-new-node`** — new-generated added a node not in old or designer. Expected: `pendingReview` entry, `COMP-REGENERATION-PENDING-REVIEW` at `info`.

- [ ] **Case `orphan-node-resolved-refs`** — designer-edited has a node with anchors not in new-generated; the node's `bind` still resolves. Expected: `orphaned` entry, `COMP-REGENERATION-ORPHAN-NODE` at `warning`; reattached at original parent.

- [ ] **Case `orphan-broken-binding`** — same as above but `bind` no longer resolves. Expected: `COMP-REGENERATION-ORPHAN-NODE` at `warning` in MergeReport PLUS a separate Component-resolver bind-failure finding at `error` (composed in the review surface, NOT duplicated in MergeReport per H4).

- [ ] **Case `orphan-cascade`** — designer subtree's parent is itself orphaned; reattaches to grandparent. Expected: `COMP-REGENERATION-ORPHAN-REATTACHED-CASCADE` at `info` plus base `ORPHAN-NODE`.

- [ ] **Case `orphan-detached`** — designer subtree has no surviving ancestor in merged; reattaches at root. Expected: `COMP-REGENERATION-ORPHAN-DETACHED` at `warning`.

- [ ] **Case `designer-removed`** — old has a generated node; designer deleted it; new-generated still produces it. Expected: `COMP-REGENERATION-DESIGNER-REMOVED` at `warning`.

- [ ] **Case `designer-precedes`** — designer authored a node at an anchor that new-generation now also produces (old does not have it). Expected: `COMP-REGENERATION-DESIGNER-PRECEDES` at `warning`.

- [ ] **Case `rename-migrated`** — anchors changed `item:dateOfBirth` → `item:birthDate`; an anchor-mapping document maps the substitution. Expected: matched, presentation preserved, `COMP-REGENERATION-RENAME-MIGRATED` at `info`.

- [ ] **Case `rename-no-anchor-mapping`** — anchors changed without an anchor-mapping entry. Expected: NOT matched; any corresponding designer subtree becomes `ORPHAN-NODE` only if it remains uncovered; N_new becomes `PENDING-REVIEW` (H3 fix: no heuristic, no `RENAME-UNDOCUMENTED` finding).

- [ ] **Case `subtree-children-add`** — designer added a child node under a regenerated `Section`. Expected: regenerated `Section` in merged; designer's child appended; `orphaned[]` entry for the child. `pendingReview[]` is reserved for newly generated nodes.

- [ ] **Case `subtree-children-reorder`** — designer reordered two children under a regenerated `Section`; new-generation kept the original order. Expected: designer order preserved in merged; reorder surfaced as `surviving` entry on the Section (designer-only change).

- [ ] **Case `duplicate-anchor-set`** — `Section` and `Label` inside it both carry `["unit:identity"]`. Designer edits the `Label`'s text. Expected: recursive parent match key plus stable local discriminator correctly matches the `Label` (not the `Section`); `Label` survives with designer text; `Section` regenerates cleanly.

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

def _load_optional(case_dir: Path, name: str) -> dict:
    path = case_dir / f"{name}.json"
    return json.loads(path.read_text()) if path.exists() else {}

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
    context  = _load_optional(case_dir, "context")
    expected_merged = _load(case_dir, "expected-merged")
    expected_report = _load(case_dir, "expected-report")

    merged, report = _merge(old, designer, new, context=context)

    assert merged == expected_merged, f"merged mismatch in {case_dir.name}"
    assert report == expected_report, f"report mismatch in {case_dir.name}"
```

- [ ] Step 1: Write the test with `_merge` raising NotImplementedError. Run, expect FAIL on every case with NotImplementedError. Commit ("test(regeneration-merge): red — algorithm not implemented").

- [ ] Step 2: Implement `_merge` per §6 algorithm prose. Iterate until every fixture passes. The order to implement: anchor matching → three-way property diff → child merge → orphan pass → finding emission. Commit each green slice.

- [ ] Step 3: Final run, expect ALL PASS.

```bash
cd formspec && python -m pytest tests/conformance/spec/test_regeneration_merge_algorithm.py -v
```

- [ ] Commit final ("test(regeneration-merge): green — all 17 cases pass").

## Task 18: Invariant pytest

- [ ] Create `tests/conformance/spec/test_regeneration_merge_invariants.py`. H1 fix: replaces idempotency with convergence.

```python
"""Pin determinism, no-mutation, convergence."""
import copy
import json
from pathlib import Path

import pytest

from tests.conformance.spec.test_regeneration_merge_algorithm import _merge, FIXTURES, _load, _load_optional

CASES = sorted(p for p in FIXTURES.iterdir() if p.is_dir() and not p.name.startswith("_"))

@pytest.mark.parametrize("case_dir", CASES)
def test_determinism(case_dir):
    old, designer, new = _load(case_dir, "old-generated"), _load(case_dir, "designer-edited"), _load(case_dir, "new-generated")
    context = _load_optional(case_dir, "context")
    a_merged, a_report = _merge(copy.deepcopy(old), copy.deepcopy(designer), copy.deepcopy(new), copy.deepcopy(context))
    b_merged, b_report = _merge(copy.deepcopy(old), copy.deepcopy(designer), copy.deepcopy(new), copy.deepcopy(context))
    assert a_merged == b_merged
    assert a_report == b_report

@pytest.mark.parametrize("case_dir", CASES)
def test_no_mutation(case_dir):
    old, designer, new = _load(case_dir, "old-generated"), _load(case_dir, "designer-edited"), _load(case_dir, "new-generated")
    context = _load_optional(case_dir, "context")
    old_snap, designer_snap, new_snap, context_snap = copy.deepcopy(old), copy.deepcopy(designer), copy.deepcopy(new), copy.deepcopy(context)
    _merge(old, designer, new, context)
    assert old == old_snap, "merge mutated old-generated"
    assert designer == designer_snap, "merge mutated designer-edited"
    assert new == new_snap, "merge mutated new-generated"
    assert context == context_snap, "merge mutated context"

@pytest.mark.parametrize("case_dir", CASES)
def test_convergence(case_dir):
    """Host-cycle invariant (spec §11 convergence clause, F4-narrowed).

    Convergence applies ONLY when cycle 1's report has empty conflicts AND
    empty pendingReview. Fixtures whose cycle 1 produces conflicts or
    pendingReview require designer resolution before convergence applies;
    semantics of resolution are host-defined and out of scope for the
    algorithm contract. Skip such fixtures.

    For fixtures with clean cycle 1: feed merged back as designer' with
    old' = new; cycle 2 must produce zero conflicts, zero pendingReview,
    and merged' structurally equal to merged.
    """
    old, designer, new = _load(case_dir, "old-generated"), _load(case_dir, "designer-edited"), _load(case_dir, "new-generated")
    context = _load_optional(case_dir, "context")
    merged, report = _merge(old, designer, new, context)

    if report["conflicts"] or report["pendingReview"]:
        pytest.skip(f"{case_dir.name}: cycle 1 has conflicts/pendingReview — convergence requires resolution first (F4 narrowing)")

    merged2, report2 = _merge(copy.deepcopy(new), copy.deepcopy(merged), copy.deepcopy(new), copy.deepcopy(context))

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

- [ ] **If Studio review surface exists:** create `packages/formspec-studio/tests/e2e/playwright/regeneration-merge.spec.ts`. Mount Studio with a `pending-review` MergeReport entry; assert `[data-merge-status="pending-review"][data-merge-anchors="..."]` exists on the affected node. Mount with an `orphan` entry; assert `[data-merge-status="orphan"][data-merge-anchors="..."]`. Commit.

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
  prompt: "Review specs/component/regeneration-merge-spec.md (just-landed draft) plus tests/conformance/spec/test_regeneration_merge_*.py and tests/conformance/fixtures/regeneration-merge/. Pressure-test: (1) three-way merge identity keyed on anchor-set equality — does it hold for every fixture? (2) finding-code family separation from COMP-REFERENTIAL-INTEGRITY — is the boundary sharp? (3) convergence invariant — does the fixture corpus actually exercise the narrowed steady-state contract? (4) rename handling — is the anchor-mappings seam underspecified? Report findings under 500 words.",
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
Task 18:       invariant pytest (determinism, no-mutation, convergence)
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
- **Do not define broad migration/changelog semantics.** Task 10 defines only the minimum `$formspecAnchorMappings.anchorMappings[]` input shape needed for deterministic rename matching; richer migration/changelog formats remain outside this plan.
- **Do not design Studio review UX.** §10 pins DOM-level markers only; visual/interaction design is product surface.

## Deviations

- 2026-05-22: Pre-execution architecture-review scout (verdict REVISE) surfaced 2 BLOCKER + 4 HIGH + 3 MEDIUM findings. Remediated inline before commit:
  - **B1 (anchor-set duplicates):** §3/Task 4 — added recursive parent match key plus stable local discriminator handling when multiple nodes share an anchor set; ambiguous duplicates do not match by path/type/position/ordinal.
  - **B2 (orphan reattachment):** §6/Task 7 — explicit `locate_merged_parent` rule; orphans reattach to nearest surviving ancestor or cascade to root with `detached` flag.
  - **H1 (idempotency → convergence):** §11/Task 18 — replaced idempotency claim with convergence (re-running after no source change yields zero conflicts + zero pendingReview).
  - **H2 (coverage findings):** §11/Task 12/13 — delegated coverage to Experience resolver (`EXP-COVERAGE-UNCOVERED-REQUIRED-ITEM`); MergeReport composition uses EXP `path` → anchor string `item:<path>` → MergeReport entry whose `anchors` includes that string → the entry's `nodePath`.
  - **H3 (rename algorithm):** §9/Task 10 — pinned anchor-mapping substitution rule (`substitute(N_old.anchors, M) == N_new.anchors`), removed heuristic and `RENAME-UNDOCUMENTED` code.
  - **H4 (finding family boundary):** §7/Task 8 — restated as merge-context-only; dropped `COMP-REGENERATION-ORPHAN-BINDING`; orphan canonical severity remains stable while review surfaces may compute effective severity from CRF/Component resolver findings.
  - **L3 (anchor-mappings document):** §9/Task 10 — defined minimum anchor-mappings shape inline since no `migration-spec.md` exists.
  - **M1 (old-generated requirement):** §2/Task 3 — added `COMP-REGENERATION-NO-COMMON-ANCESTOR` and pinned no-two-way-fallback degradation.
  - **M2 (DOM contract):** §10/Task 11 — paired `data-merge-status` with `data-merge-anchors` for specificity.
  - **M3 (CRF BLUF):** Task 20 — extended CRF update to include matching BLUF bullet.
  - **L1 (subtree/duplicate-anchor coverage):** Task 16 — dropped degenerate `unchanged` case; added `orphan-cascade`, `orphan-detached`, `subtree-children-add`, `subtree-children-reorder`, `duplicate-anchor-set`, `no-common-ancestor`, `rename-no-anchor-mapping` cases.
- 2026-05-22: Pre-execution architecture-review pass #2 by `formspec-specs:spec-expert` (verdict REVISE) surfaced normative gaps the scout could not see. Remediated inline:
  - **F1 (anchor set-equality not in CRF):** §3/Task 4 — added explicit normative statement that order-normalized set-equality is a regeneration-merge-only rule, NOT a CRF §5 claim.
  - **F2 (CRF §6.3 "authored" interpretive gap):** §11/Task 12 — cited CRF §6.1 (input) + §6.4 (report-only, no-mutation) as the grounding for invoking the resolver on the merged document; clarified that merged ≠ DOM expansion.
  - **F3 (EXP composition was mechanically wrong):** §11 conformance level 4 + Task 13 schema description rewritten — EXP §S8 takes `(Definition, Experience)` not Component, and EXP findings carry `path` not `nodePath`. Composition uses a two-hop join (EXP `path` → anchor `item:<path>` → MergeReport `nodePath`). MergeReport itself does NOT duplicate EXP findings.
  - **F4 (convergence over-claimed):** §11/Task 18 — narrowed convergence guarantee to "applies only when cycle 1's report has empty conflicts AND empty pendingReview"; `test_convergence` skips fixtures that produced cycle-1 findings (resolution semantics are host-defined).
  - **F5 (property-level diff missing):** Task 13 schema — added OPTIONAL `propertyDeltas[]` (JSON Pointer strings) to base `Entry`. Studio uses the pointer set to drive its diff view; values are read from input documents the merge consumed.
  - **F6 (migration name collision):** §9/Task 10 — renamed document type from `$formspecMigration.migrations` to `$formspecAnchorMappings.anchorMappings`. Avoids Core §6.7 `migrations` (Response-data transforms) collision. Updated context tuple, Design Decisions row, and §9 prose.
  - **F7 (schema-prose code inconsistency):** Task 13 schema — hoisted `code` and `severity` from `ConflictEntry` to base `Entry` so every report entry carries them. The concrete schema now also defines role-specific entry defs (`SurvivingEntry`, `RegeneratedEntry`, `OrphanEntry`, `PendingReviewEntry`, `ConflictEntry`) so array placement and code enum agree structurally, while base `Entry` pins code-specific severities to the §7 table. Task 14 tests updated.
- 2026-05-22: Pre-Task-1 architecture-review pass #3 by `formspec-specs:spec-expert` (verdict NO-GO until plan remediation) found the Component Reference Fields prerequisite architecturally sufficient but blocked execution on plan defects. Remediated inline before Task 1:
  - **P3-BLOCKER (false-negative preflight):** replaced the brittle `$id` grep with a JSON-value check for `https://formspec.org/schemas/component/1.1` and made the multi-line preflight block use one absolute `cd`.
  - **P3-HIGH (rename seam contradiction):** made §9 and out-of-scope reminders consistently define only the minimum `$formspecAnchorMappings.anchorMappings[]` input shape; broad migration/changelog semantics remain out of scope.
  - **P3-WARNING (invariant vocabulary drift):** replaced stale idempotency references in file-structure, self-review, review prompt, and sequencing recap with the narrowed convergence invariant.
- 2026-05-22: Pre-Task-2 architecture review by `formspec-specs:spec-expert` (verdict GO with guardrails) steered §1 wording before commit:
  - Kept the semantic-layers note as normative intent only, not a conformance source.
  - Made `old-generated` a mandatory common ancestor for conforming three-way merge.
  - Preserved the CRF boundary, Trace exclusion, runtime/Studio out-of-scope limits, and narrowed anchor-mappings rename scope in §1.
- 2026-05-22: Pre-Task-3 architecture review by `formspec-specs:spec-expert` (verdict GO with required fixes) steered §2 wording before commit:
  - Pinned all Component inputs and `merged` to explicit `$formspecComponent: "1.1"` instead of mere validation against the backward-compatible v1.1 schema.
  - Made absent `old-generated` degrade to `merged == new_generated` plus `report.conflicts[]` entry `COMP-REGENERATION-NO-COMMON-ANCESTOR` at `error`; removed the weaker host-warning language.
  - Added no-mutation requirements for all three Component inputs and the peer-document context, and clarified the CRF context reuse plus optional `anchorMappings` extension.
  - Post-draft review requested one fix before commit: §2 now treats `MergeReport` as a named output until the Task 13 schema lands, avoiding a false normative pointer to still-empty §7/§11 sections.
- 2026-05-22: Four-commit cadence review by `formspec-specs:formspec-scout` (verdict REQUEST-CHANGES) blocked Task 4 until four fixes landed:
  - Split §2 operation shapes into normal three-way merge (`old_generated: Component v1.1`) and absent-common-ancestor degradation (`old_generated: null`) so callers can receive `COMP-REGENERATION-NO-COMMON-ANCESTOR` instead of being rejected before report emission.
  - Reworded the BLUF proof posture from already-proven to future fixture-driven proof before promotion.
  - Corrected Task 17's final commit-message text from "all 12 cases pass" to "all 17 cases pass."
  - Updated the spec status paragraph to acknowledge that §2 has landed.
- 2026-05-22: Pre-Task-4 architecture review by `formspec-specs:spec-expert` (verdict NO-GO until plan tightening) found §3 source-anchor instructions conflicted with later rename/marker rules. Remediated the plan before drafting §3:
  - Rephrased raw anchor equality as the equality comparator so Task 10 anchor-mapping substitution can transform anchors before comparison.
  - Made missing/empty `x-generation.anchors` non-matchable against `new-generated` for merge identity, even if other provenance members exist.
  - Added deterministic duplicate-anchor ambiguity handling when recursive parent identity reaches a missing/empty-anchor parent.
  - Replaced bracket fallback paths with RFC 6901 JSON Pointer paths and restated that prefix/suffix semantics remain CRF-owned.
- 2026-05-22: Post-Task-4 review by `formspec-specs:spec-expert` (verdict APPROVE) found one nit: the load-bearing design table still used stale "sibling tree-path tiebreaker" shorthand. Cleaned before commit.
- 2026-05-22: Pre-Task-5 architecture review by `formspec-specs:spec-expert` (verdict GO with constraints) steered §4 before drafting:
  - Split generation classification into `hasGenerationMarker` and `hasMatchableGenerationAnchors` so provenance-only nodes do not become matchable against `new-generated`.
  - Clarified that absence of `x-generation` is a regeneration-merge classification, not a claim about the node's unknowable history.
  - Excluded `generatedAt`-only metadata from generated-marker classification and left invalid `x-generation` shapes to Component schema validation.
- 2026-05-22: Pre-Task-6 architecture review by `formspec-specs:spec-expert` (verdict NO-GO until plan correction) found §5 designer-edit detection was mixing classifier and merge/report outcomes. Remediated the plan before drafting §5:
  - Made §5 a structural-delta classifier; §6 consumes deltas for preserve/regenerate/conflict decisions and §7 owns finding codes.
  - Resolved widget-swap handling as a warning conflict entry (`conflicts[]`) requiring review, while the merge can preserve the designer widget when appropriate.
  - Removed the undefined `designer-inserted` bucket; designer child additions map through existing orphaned handling while `pendingReview` stays reserved for newly generated nodes.
  - Defined JSON structural comparison, old/designer-only preservation for non-matchable nodes, and no-mutation/report-output-only wording.
- 2026-05-22: Pre-Task-7 architecture review and cadence review (both verdict REQUEST-CHANGES/NO-GO) blocked §6 until the algorithm plan was rewritten:
  - Split traversal/index construction from recursive output assembly to remove the pre-order vs child-before-parent contradiction.
  - Added early no-common-ancestor exit matching §2: `merged == new_generated` plus `COMP-REGENERATION-NO-COMMON-ANCESTOR`.
  - Gated match keys to nodes with matchable anchors, threaded `anchorMappings` into old/designer indexes, and made mapping collisions ambiguous.
  - Replaced all-designer-node orphan pass with maximal orphan roots to prevent duplicate orphan descendants.
  - Clarified report-array ownership for mixed deltas and made designer-added children orphaned, not pendingReview.
  - Added optional `context.json` fixture loading so `rename-migrated` can supply `anchorMappings`.
- 2026-05-22: Follow-up cadence re-review found one remaining Task 7 blocker and two warnings. Remediated before drafting §6:
  - Unmatchable or ambiguous `new_generated` nodes now copy only their shell and still recurse into children, so anchored descendants are not skipped.
  - `merge_children` now defines designer-only child reorder preservation and generator-vs-designer reorder conflict handling.
  - Invariant tests now import `_load_optional`, pass per-case `context.json`, and assert merge does not mutate context.
- 2026-05-22: Follow-up architecture re-review found that the unmatchable-container recursion fix could still duplicate anchored descendants in the orphan pass. Remediated before drafting §6:
  - Added a represented-designer-node set during generated-node assembly.
  - Constrained orphan roots to uncovered designer subtrees whose descendants are not already represented, so reattachment cannot append a designer ancestor containing already-merged descendants.
  - Restated that non-matchable old/designer nodes are not overlaid onto `new_generated` shells by path or `id`; they survive only as uncovered orphan subtrees.
- 2026-05-22: Post-Task-7 architecture review found two §6 ambiguities. Remediated before commit:
  - Split direct-parent orphan reattachment from higher-ancestor cascade reattachment so `COMP-REGENERATION-ORPHAN-REATTACHED-CASCADE` is reachable.
  - Pinned three-way node merge base to `N_new` without children, with surviving designer deltas overlaid, so mixed designer-only and generator-only changes produce one deterministic merged node.
- 2026-05-22: Post-Task-8 cadence review found report-code/schema and composition drift. Remediated before Task 9:
  - Made report entries code-scoped: nodes with multiple applicable findings emit one entry per code rather than packing multiple codes into one entry.
  - Added `COMP-REGENERATION-DESIGNER-SURVIVED` and `COMP-REGENERATION-REGENERATED` so `surviving[]` and `regenerated[]` entries satisfy the required `code`/`severity` schema contract.
  - Replaced the planned broad code regex with an exact enum and tests that reserved non-codes stay invalid.
  - Split CRF/Component resolver composition by affected Component node key/path from EXP coverage's two-hop Definition-path-to-anchor composition.
- 2026-05-22: Pre-Task-10 architecture/cadence reviews found no blockers but steered §9 drafting:
  - Corrected no-mapping wording so `old_generated` is not itself reported as orphaned; only still-present uncovered `designer_edited` subtrees go through §6.7 orphaning, while unmatched `new_generated` nodes become `pendingReview[]`.
  - Renamed planned `rename-no-migration` fixture to `rename-no-anchor-mapping` to avoid reviving Core migration vocabulary in fixture names.
  - Drafted §9 with one-pass, non-transitive substitution; ambiguous mapping entries and post-substitution collisions remain ambiguous, not heuristic rename evidence.
  - Cross-referenced §6/§7 so a rename-migrated node is not also reported as plain `COMP-REGENERATION-REGENERATED` solely for the same anchor-set update.
- 2026-05-22: Post-Task-10 architecture review approved with one LOW cleanup before commit:
  - Tightened §6.5's fallback regenerated-entry rule with the same `no §9 anchor-mapping substitution` exception used by §7/§9, preventing accidental double-reporting of the rename anchor update path.
- 2026-05-22: Focused Task 10 re-review found the first cleanup over-excluded legitimate regenerated-only delta entries on rename-migrated nodes:
  - Narrowed §6.5/§7 wording so `COMP-REGENERATION-REGENERATED` is excluded only for the anchor-set update already represented by `COMP-REGENERATION-RENAME-MIGRATED`, while real regenerated-only property deltas may still produce their own code-scoped entries.
- 2026-05-22: Focused Task 10 re-review pass #2 found the §6.5 wording still grammatically ambiguous for rename plus real generated delta:
  - Rephrased §6.5 to require a generated-only non-anchor property delta after excluding the rename anchor-set update, matching the intended §7/§9 behavior.
- 2026-05-22: Task 11 §10 drafting tightened the DOM-marker scope:
  - Aligned the design-decision row with the planned §10/Task 19 minimum: mandatory DOM attributes apply to pending-review and orphan preview markers, while conflict/surviving/regenerated/resolver/coverage markers may be host-defined unless a later spec version standardizes them.
  - Updated the planned orphan DOM marker rule to key on the base `COMP-REGENERATION-ORPHAN-NODE` entry so cascade/detached code-scoped entries do not require duplicate DOM markers.
  - Updated the future Studio E2E task to assert both `data-merge-status` and `data-merge-anchors`, matching the M2 specificity requirement.
- 2026-05-22: Post-§8-§10 phase architecture/cadence reviews blocked §11 until cross-section drift was remediated:
  - Reconciled `COMP-REGENERATION-REGENERATED` with `COMP-REGENERATION-RENAME-MIGRATED`: generated-only non-anchor property deltas now emit their own code-scoped `regenerated[]` entry even on rename-migrated or otherwise mixed-outcome nodes, while the rename anchor-set update itself does not double-report as regenerated.
  - Updated the §6 plan pseudocode to emit `RENAME-MIGRATED`, `DESIGNER-SURVIVED`, and `REGENERATED` as independent code-scoped entries instead of using a single all-or-nothing fallback.
  - Tightened the planned Task 13 schema and Task 14 tests so base entries require `reason`, matching §10 conflict-review requirements and the file inventory claim that every entry carries a reason.
  - Tightened the planned Task 13 schema and Task 14 tests so `OrphanEntry` requires `reattachedTo`, `cascaded`, and `detached`, matching §8 orphan report requirements.
- 2026-05-22: Task 12 §11 drafting tightened Level 4 scope:
  - Required resolver composition for resolver inputs supplied to the merge context, so unavailable peer documents do not become impossible conformance obligations.
  - Kept Trace out of Level 4 resolver-family examples; Trace remains an out-of-scope downstream consumer.
- 2026-05-22: Task 13 schema implementation tightened the planned schema beyond the earlier alias sketch:
  - Added role-specific entry defs for every report array so non-conflict codes cannot validate under `conflicts[]`, orphan-only codes cannot validate outside `orphaned[]`, and surviving/regenerated/pending-review arrays only accept their owned codes.
  - Encoded the §7 code-to-severity table with conditional schema constraints so a report entry cannot pair a valid code with the wrong canonical severity.
  - Replaced the unavailable root `npx ajv ...` CLI command with a repo-local Node validation command that imports installed `ajv/dist/2020.js`, runs strict Ajv 2020-12 compilation, and generates standalone validator code.
- 2026-05-22: Post-Task-13 cadence review found stale orphan pseudocode after `OrphanEntry` became strict:
  - Updated §6.7 task pseudocode so every orphan entry includes explicit `reattachedTo`, `cascaded`, and `detached` fields, including false values when cascade/detachment does not apply.
  - Tightened the committed §8 orphan report prose to describe `cascaded` and `detached` as required booleans rather than true-only optional flags, aligning it with §11 Level 2 and the schema.
  - Expanded the planned Task 14 tests with instance-validation cases for valid reports, wrong role placement, wrong code severity, and missing orphan metadata.

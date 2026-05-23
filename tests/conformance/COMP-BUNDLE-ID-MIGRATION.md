# COMP-BUNDLE-ID-COLLISION fixture-audit report

**Gate:** ADR 0150 §5.3 fixture-audit checklist (P0 precondition; gates Task 4 + Task 8 BREAKING commits per `thoughts/plans/2026-05-23-adr-0150-p0-implementation.md`).

**Closed:** 2026-05-23T23:48:39Z

**Auditor:** formspec-scout (Task 0 dispatch).

**Outcome:** Zero residual cross-document `id` collisions across all in-scope Component fixtures. No fixture files modified.

---

## 1. Scope

Per ADR 0150 §5.3 step 2: every Component document under

- `tests/fixtures/`
- `tests/conformance/`
- `tests/e2e/fixtures/`
- `examples/`
- `reconstructed-examples/`
- `thoughts/chaos-test/`

(The plan also names `packages/formspec-studio/tests/e2e/fixtures/` if present — confirmed absent at audit time; `packages/formspec-studio/` is not a subdirectory of `formspec/`. The visual designer lives in the sibling `formspec-studio/` submodule. Out of scope for this Formspec-repo audit per ADR §5.3 phrasing "in-repo example bundles".)

**Component-document detection rule:** any `.json` file under the scope dirs where the top-level object contains `"$formspecComponent"` OR whose filename equals `component.json` or ends with `.component.json`. Filename-matched files lacking `$formspecComponent` and lacking `tree` / `root` were skipped as non-Component (3 files, listed in §6).

**Bundle-scoping rule:** if the Component document's parent dir (or grandparent dir) contains an explicit `bundle-manifest.json` / `bundle.json` / `manifest.json` / `app-manifest.json`, that dir is the bundle scope. Otherwise the Component's immediate parent dir is the bundle scope (one-directory = one-bundle fallback). In the audited tree, only `tests/e2e/fixtures/kitchen-sink-holistic/bundle.json` was an explicit manifest; every other bundle resolved via the parent-dir fallback.

**Exclusion:** the entire `tests/conformance/fixtures/regeneration-merge/` tree (67 files) was excluded from collision scope. Each scenario directory under that tree contains four versions of ONE Component (`old-generated.json`, `new-generated.json`, `designer-edited.json`, `expected-merged.json`) plus an `expected-report.json` / `_base/*` non-Component sidecar. The four `.json` files within a scenario are revisions of the same `$formspecComponent` identity (same `targetDefinition.url`, same root-node `id`); cross-revision `id` reuse is the correctness condition for three-way merge — *not* a §5.3 bundle violation. ADR §242 explicitly names the paused regeneration-merge plan (`thoughts/plans/2026-05-22-regeneration-merge.md`, `paused-after-task-16`) as a consumer of the bundle-unique invariant — when that plan resumes, each scenario directory should grow an explicit `manifest.json` declaring "these are revisions, not siblings", but the bundle-unique-when-present invariant is unaffected by it today. **Rationale recorded so this exclusion is auditable and revisitable.**

**Counts:**

| Slice | Count |
|---|---|
| Candidate files (marker OR filename match) | 123 |
| True Component documents in scope | 53 |
| Excluded (regeneration-merge revision sets) | 67 |
| Unparseable | 0 |
| Filename-matched but non-Component shape (skipped) | 3 |
| In-scope bundles | 29 |
| In-scope multi-doc bundles (only place a collision is possible) | 3 |

In-scope Component documents by directory:

| Directory | Component-doc count |
|---|---|
| `examples/` | 5 |
| `reconstructed-examples/` | 8 |
| `tests/conformance/fixtures/component-reference-fields/` | 7 |
| `tests/conformance/fixtures/trace/` | 3 |
| `tests/e2e/fixtures/kitchen-sink-holistic/` | 1 |
| `tests/fixtures/lint/` | 18 |
| `thoughts/chaos-test/2026-04-07/` | 5 |
| `thoughts/chaos-test/2026-04-07-v1/` | 6 |
| **Total in scope** | **53** |

## 2. Methodology

The audit is run by `tests/conformance/tools/comp_bundle_id_audit.py` (also vendored from this commit; re-runnable by any future agent). One-liner reproduction:

```bash
cd /Users/mikewolfd/Work/formspec-stack/formspec
python3 tests/conformance/tools/comp_bundle_id_audit.py --json-out /tmp/comp_audit.json
```

The script:

1. **Enumerates** every `.json` file under the six scope dirs, harvesting any whose top-2KB head contains `"$formspecComponent"` OR whose filename matches the Component-doc pattern.
2. **Parses** every candidate; records unparseable cases (zero observed).
3. **Filters** to true Component documents (`$formspecComponent` marker required), skipping filename-matched docs that have neither `tree` nor `root`.
4. **Excludes** the regeneration-merge subtree per the documented rationale above.
5. **Walks** each Component's tree under `tree` (or `root` if present), recursively visiting every dict/list value at any depth — **permissive deep walk** so hand-authored fixtures whose nodes nest under arbitrary keys (`actions`, `branches`, etc.) are not silently missed. Emits `(nodePath, id)` tuples for every dict carrying a string `id`.
6. **Indexes** per bundle scope: `id → [(doc_relpath, nodePath), …]`.
7. **Reports a collision** when an `id` appears in two or more distinct docs within the same bundle scope. (Same-doc duplicates — within-tree id reuse — are out of scope here; §5.3 lifts the constraint from per-tree to bundle-unique-when-present, leaving the per-tree invariant for the schema layer.)

**Walker robustness note:** an earlier draft (`v2`) used a narrower recursion that only recursed under known structural keys (`items` / `children` / `slots`). That walker false-negatived on a handful of nodes nested under non-standard keys. The current `v3` walker recurses through every dict/list value indiscriminately, which is the conservative posture for an audit gate. Independent spot-check on `tests/conformance/fixtures/component-reference-fields/*.json` confirmed the v3 walker matches a hand-written walker exactly.

## 3. Findings

**Collision count: 0.**

The only three multi-doc bundles in scope (single-doc bundles cannot produce cross-doc collisions by construction):

| Bundle | Docs | Per-doc id counts | Cross-doc collisions |
|---|---|---|---|
| `examples/grant-report/` | `tribal-long.component.json`, `tribal-short.component.json` | 0, 0 | 0 (no `id` fields stamped; graceful-degradation case per ADR §5.3 prose "hand-edited JSON without IDs accepts graceful degradation") |
| `tests/conformance/fixtures/component-reference-fields/` | 7 fixtures | 11 / 4 / 2 / 0 / 2 / 2 / 2 | 0 (each scenario uses a distinct prefix — `applicant*`, `missingConcepts*`, `missingTasks*`, `missingUnit*`, `noExperience*`, `generationCoverage*` — disjoint by design) |
| `tests/fixtures/lint/` | 18 fixtures | mostly 0; `E805-theme-component-page-conflict.json` has `id: "component-lines"`, `W805-theme-pages-shadowed-by-component-sections.json` has `id: "info"` | 0 (the two stamped IDs are distinct) |

No collision rows to migrate. **Findings table is therefore empty:**

| bundle scope | doc | nodePath | old id | new id |
|---|---|---|---|---|
| *(none — zero collisions)* | | | | |

## 4. Migration log

No fixture files were modified. The §5.3 step-3 mechanical migration (`<componentDocStem>.<oldId>` prefix) was prepared but not exercised because zero collision sites exist.

## 5. Residual statement

**Zero residual collisions; gate closed at 2026-05-23T23:48:39Z.**

Task 4 (App Manifest BREAKING) and Task 8 (`ComponentBase.id` uplift BREAKING + `COMP-BUNDLE-ID-COLLISION` lint binding) per `thoughts/plans/2026-05-23-adr-0150-p0-implementation.md` are unblocked from the §5.3 gate.

## 6. Re-runnability

Future agents (regression check after fixture additions, or post-Task-8 verification once the lint binding lands) re-run the audit:

```bash
cd /Users/mikewolfd/Work/formspec-stack/formspec
python3 tests/conformance/tools/comp_bundle_id_audit.py --json-out /tmp/comp_audit.json
# Pass criterion: the "Cross-document collisions: N" line reads 0.
# If N > 0, apply the §5.3 mechanical migration at every reported site
# (prefix old id with <componentDocStem>.) and re-run.
```

The script returns exit 0 unconditionally — collision count is parsed from stdout. A future enhancement (Task 8 lint binding) folds this check into `formspec-lint` proper.

**Files skipped as non-Component (filename match but no `$formspecComponent` marker AND no `tree`/`root`):**

- `tests/fixtures/lint/E1400-locale-semantic-invalid.json` (locale fixture)
- `tests/fixtures/lint/E1800-response-actions-semantic-invalid.json` (response-actions fixture)
- `tests/fixtures/lint/valid-locale-semantic.json` (locale fixture)

These are not Component documents and are correctly outside the §5.3 scope.

**Files in the regeneration-merge tree excluded with rationale** (67 total — see §1 Exclusion above). Sidecar JSON at `/tmp/comp_audit.json` from any audit run enumerates each excluded path.

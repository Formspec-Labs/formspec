# ADR 0150 §14 P1–P4 Implementation Plan — Modules, Surface, Product MCPs, AI Runtime

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax. The normative target is [ADR 0150](../../../thoughts/adr/0150-formspec-as-layered-ui-substrate.md) — this plan is the execution layout, not a re-derivation. The ADR is NOT amended mid-execution; deviations land below.

**Goal.** Land ADR 0150 §14 phases P1 → P4 end-to-end against the ratified substrate (P0 closed, commits `2a178047..9c8f7381`). P1 republishes the five core vocabularies as Registry `module` entries; P2 ships four non-core modules including Surface (the substrate-identity proof case); P3 stands up the studio-core kernel API surface + two product MCPs (Wireframes-MCP, Forms-MCP) as thin facades, **scoped to API design + facade scaffolding because [ADR 0151 §16](../../../thoughts/adr/0151-multi-actor-editing-automerge.md#16-phase-1-hold-2026-05-23) holds Phase 1 open** — the Automerge-shaped kernel rewrite is deferred to a follow-on plan that lands when ADR 0151 Phase 1 closes; P4 ships the `x-formspec-ai-runtime` module + the nine baseline `ai.*` events (ADR §8) across the substrate carry-points P0 already delivered.

**Architecture posture.** Greenfield-prescriptive ([`formspec/CLAUDE.md`](../../CLAUDE.md) §"The spec is the source of truth"). No backwards-compat shims, no aliasing — refactor existing artifacts to the new contract per stack feedback ([memory entry](../../../../.claude/projects/-Users-mikewolfd-Work-formspec-stack/memory/feedback_no_shims_refactor.md)). Module documents are pure carriers of vocabulary the substrate already supports; the closed-core enum lanes (`oneOf [closed-core, x-pattern]` per ADR §4.5) admit the existing unprefixed values unchanged.

**Tech stack.** JSON Schema 2020-12 (schemas), Markdown (specs), Rust (`formspec-lint`, `fel-core`, `formspec-eval`), TypeScript (`formspec-engine`, `formspec-core`, `formspec-studio-core`, `formspec-mcp`), Python (validator + conformance). Build gate per [`formspec/CLAUDE.md`](../../CLAUDE.md) §"Build & commands": `npm run docs:generate` → `docs:check` → `check:deps` → `cargo nextest run --workspace` → `python3 -m pytest tests/ -v` → `make test` umbrella.

---

## Revision history

- **2026-05-23 r0** — initial plan, post-P0 closure (`9c8f7381`). Drafted from ratified ADR 0150 §14 P1–P4 prose + ADR 0151 §16 hold-list + live codebase probe (formspec-mcp tool surface = 32 tool files in `formspec-studio/packages/formspec-mcp/src/tools/`; `formspec/registries/formspec-common.registry.json` = 18 entries pre-republishing; `formspec/specs/ui-policy.json` = ~25 closed-core widget defs ready for absorption per ADR §14 P1).

---

## Decision-record reference

The ADR is the best-current-thinking record of architectural commitments — not infallible authority. **Cite §x.y on every commit** so reviewers can trace intent. When a finding (or execution discovery) conflicts with the ADR, evaluate on merit: does the cited approach serve reason and user value better than the alternative? If yes, deviate and document; the ratified-ADR text remains a snapshot, the Deviations log captures the live reasoning. The ADR itself is not edited mid-execution; deviations land here.

## Commit discipline

- **P1 / P2:** one module per commit (5 P1 modules, 4 P2 modules → 9 commits floor).
- **P3:** one MCP per commit (kernel API-surface design lands as its own preceding commit; then Wireframes-MCP commit; then Forms-MCP tool-collapse commit).
- **P4:** one `ai.*` event family per commit (9 baseline events grouped into families: `command` (3 events: issued/completed/failed), `suggestion` (3: offered/accepted/rejected), `proposal` (3: opened/closed/accepted)) → 3 commits floor + the runtime-module commit = 4 P4 commits floor.
- Never `--amend`. Pre-commit-hook failures: fix, re-stage, new commit.
- Specify paths to `git commit <paths> -m` (parallel-craftsmen safety per stack feedback `feedback_parallel_craftsmen_commit_safety`).
- Commit msg shape: `feat(adr-0150): <one-line>` / `refactor(adr-0150): <one-line>` / `test(adr-0150): <one-line>` — always cite the ADR §.
- Cross-stack work (formspec-studio P3 tasks) committed inside the formspec-studio submodule with its own `feat(adr-0150)` line + the parent-stack submodule-pointer bump as its own parent commit per [`../../../CLAUDE.md`](../../../CLAUDE.md) §"Submodule discipline".

## Review rhythm

Per the /goal directive's floor (every 3–5 commits code-review; at every phase boundary + before each load-bearing change architecture-review):

- **Inline after every commit** when ≤2 files touched and surface area is mechanical (e.g. registry entry additions); fresh scout/expert running `formspec-specs:semi-formal-code-review` runs in-band.
- **Background subagent (run_in_background: true)** when ≥3 files changed OR the commit touches a load-bearing seam (new module schema, MCP kernel facade, ai.* event vocabulary).
- **Architecture review BEFORE** each load-bearing change:
  - First module per phase (sets the shape pattern for siblings).
  - Surface module's slot-type taxonomy (ADR §6.2 — closed at v0.1).
  - Studio-core kernel API surface (P3 — the single most load-bearing P3 commit).
  - formspec-mcp tool-surface collapse (P3 — the 32→15-20 verb compression).
  - `ai.*` event vocabulary commit (P4 — establishes naming convention + payload shape for every product MCP).
  - Any cross-stack seam touch back to [ADR 0106](../../../thoughts/adr/0106-wos-server-governance-overlay.md) / [ADR 0151](../../../thoughts/adr/0151-multi-actor-editing-automerge.md) / [ADR 0152](../../../thoughts/adr/0152-multi-actor-authorization-scope.md).
- **Architecture review AFTER** at each P1→P2→P3→P4 phase boundary (catches drift between intent + shape per stack `CLAUDE.md` §"Review discipline").
- **Pace down when reviews converge clean.** If three consecutive reviews return NITs-only on a phase, compress to single-reviewer for the rest of that phase.
- **Reviewer never self-remediates.** Findings go to a fresh `formspec-craftsman` or back to the implementer. Findings disagreed-with after merit-evaluation land in Deviations with the rejection reasoning ([memory entry](../../../../.claude/projects/-Users-mikewolfd-Work-formspec-stack/memory/feedback_reason_user_value_over_authority.md)).

## Verification

Per [`formspec/CLAUDE.md`](../../CLAUDE.md) §"Build & commands":

1. `npm run docs:generate` — regen BLUF, schema-ref, filemap, `*.llm.md`, lint-codes Rust gen.
2. `npm run docs:check` — doc-gate (frozen-generated, archive-path, embed freshness).
3. `npm run check:deps` — package-layer fence.
4. `cargo nextest run --workspace` — full Rust workspace (never bare `cargo test`).
5. `python3 -m pytest tests/ -v` — Python conformance.
6. `make test` — umbrella incl. Playwright E2E + `sync-lint-schemas` pre-step.
7. **Stack-level filemap regen** — `node /Users/mikewolfd/Work/formspec-stack/scripts/generate-filemap.mjs` after any new file lands.
8. **Plugin reference-map regen** — `formspec-specs:update-spec-nav` once per phase boundary (regenerates `.claude-plugin/skills/formspec-specs/references/schemas/*.md`).

Run 1–6 after every commit touching schemas/specs/source. Run 7+8 at each phase boundary (or after the last commit of the phase).

**Cascade verification rule** ([memory entry](../../../../.claude/projects/-Users-mikewolfd-Work-formspec-stack/memory/feedback_full_cascade_verification.md)): after a rename or shape change crossing language boundaries, run ALL test commands (cargo, pytest, npm) AND grep the old name across the ENTIRE submodule before claiming done.

---

# Phase P1 — Republish 5 core vocabularies as modules

**ADR refs:** §4.9 (republish-as-modules with no semantic change), §4.2 (contribution category payloads), §4.5 (closed-core enum lanes preserved), §11.1 ("default module set rule means today's documents validate identically").

**Why this lands first:** P2 modules cite `x-formspec-core-task` (Experience UnitKind closed-core) and `x-formspec-core-actions` (Response Actions intent closed-core) as `dependencies[]`. Surface specifically depends on `x-formspec-core-task` per ADR §6.1. Without P1 republishing those modules, P2's `dependencies[]` declarations would dangle.

**Naming convention discovery (execution TBD — flag at first commit):** The Registry `name` pattern (`^x-[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$`, per `registry.schema.json` line 246 area) requires `x-`-prefixed names. The closed-core enum values like `data-entry` are *unprefixed*. A module `contributes[]` array lists **registry entry names** (per ADR §4.1: "Names of registry entries this module bundles"), so the contribution entries for the closed-core members are named `x-formspec-core-task-data-entry`, `x-formspec-core-task-review`, etc. The closed-core enum lane in `oneOf` continues to admit the unprefixed value — the registry entry is metadata describing the closed-core value, NOT a rename of it. ADR §4.9 "no semantic change" remains true: documents continue to write `unit.kind: 'data-entry'` and the closed-core lane validates without consulting the Registry. Pin this convention in Task 1.1 prose; reuse across all P1 modules.

## Task 1.1 — `x-formspec-core-task` module (first commit, sets the shape pattern)

**ADR refs:** §4.9 (republish), §4.2 (`unit-kind` contribution shape requires `semantics`), §10 (refactor row 1).

**Files:**
- Modify: `formspec/registries/formspec-common.registry.json` — add module entry `x-formspec-core-task` + 7 `unit-kind` contribution entries (`x-formspec-core-task-data-entry` through `x-formspec-core-task-assistance`).
- Modify: `formspec/specs/registry/extension-registry.md` — naming-convention pin (closed-core register-entry naming).
- Create: `formspec/tests/conformance/fixtures/modules/x-formspec-core-task/` — module-loading fixture (Experience doc declaring `modules: [{id: 'x-formspec-core-task', version: '1.0.0'}]` and using `unit.kind: 'data-entry'` — validates identically to a doc without the modules[] declaration).
- Create: `formspec/tests/test_p1_module_x_formspec_core_task.py` — module-loading + default-set-equivalence + contribution-payload validation.

- [ ] **Step 1: Architecture review BEFORE** — `formspec-specs:spec-expert` running `semi-formal-architecture-review`. Cross-checks: (a) the closed-core register-entry naming convention; (b) the `semantics` payload shape per ADR §4.2 (object describing processor/renderer obligations); (c) that the default-module-set rule (§4.9) holds — existing form-only fixtures validate identically with OR without the modules[] declaration.

- [ ] **Step 2: Write failing fixtures.**
  - Module-loading fixture: Experience doc with `modules: [{id: 'x-formspec-core-task', version: '1.0.0'}]` AND `unit.kind: 'data-entry'` → validates.
  - Default-set-equivalence fixture: Experience doc WITHOUT `modules[]` AND `unit.kind: 'data-entry'` → also validates (the §4.9 default rule).
  - Module entry shape: `x-formspec-core-task` registry entry with `category: 'module'`, `contributes: ['x-formspec-core-task-data-entry', ...]` → validates against Registry shape.
  - Contribution payload shape: each `x-formspec-core-task-<kind>` entry with `category: 'unit-kind'` and a `semantics` payload → validates.

- [ ] **Step 3: Verify fixtures fail** — `python3 -m pytest tests/test_p1_module_x_formspec_core_task.py -v` (module entries don't exist yet).

- [ ] **Step 4: Author registry entries** in `formspec/registries/formspec-common.registry.json`. Module entry shape:

```jsonc
{
  "name": "x-formspec-core-task",
  "category": "module",
  "version": "1.0.0",
  "status": "stable",
  "description": "Closed-core Experience UnitKind vocabulary republished as a Registry module per ADR 0150 §4.9. Documents using the closed-core values (data-entry, review, confirmation, evidence-collection, attestation, error-resolution, assistance) validate identically with or without declaring this module; declaration makes the module dependency explicit for posture admission and AI tooling.",
  "compatibility": { "formspecVersion": ">=1.0.0 <2.0.0" },
  "license": "Apache-2.0",
  "contributes": [
    "x-formspec-core-task-data-entry",
    "x-formspec-core-task-review",
    "x-formspec-core-task-confirmation",
    "x-formspec-core-task-evidence-collection",
    "x-formspec-core-task-attestation",
    "x-formspec-core-task-error-resolution",
    "x-formspec-core-task-assistance"
  ]
}
```

Each `unit-kind` contribution entry shape (one per closed-core value):

```jsonc
{
  "name": "x-formspec-core-task-data-entry",
  "category": "unit-kind",
  "version": "1.0.0",
  "status": "stable",
  "description": "User provides or revises data. Closed-core Experience UnitKind value per Experience spec §UnitKind (line 175 area, schemas/experience.schema.json). Republished as Registry contribution per ADR 0150 §4.9.",
  "compatibility": { "formspecVersion": ">=1.0.0 <2.0.0" },
  "semantics": {
    "kindValue": "data-entry",
    "processor": "value-binding",
    "renderer": "form-input",
    "summary": "User provides or revises data."
  }
}
```

Where `semantics` is the closed shape ADR §4.2 calls for ("object describing processor/renderer obligations"). The `kindValue` field carries the unprefixed closed-core value so consuming tools resolve `unit.kind: 'data-entry'` to this contribution entry.

- [ ] **Step 5: Pin naming convention in spec prose** — `formspec/specs/registry/extension-registry.md` gains a paragraph: "Closed-core values that pre-date the Registry rev (e.g. Experience UnitKind `data-entry`, `review`, ...) are republished as contribution entries whose Registry `name` carries the `x-formspec-core-<module>-<value>` prefix per the Registry naming regex (§4.8). The closed-core enum lane in `oneOf [closed-core, x-pattern]` continues to admit the unprefixed value — the contribution entry is metadata describing the value, not a rename of it."

- [ ] **Step 6: Verify fixtures pass** — `python3 -m pytest tests/test_p1_module_x_formspec_core_task.py -v` (green; default-set-equivalence + module-loaded both pass).

- [ ] **Step 7: Regenerate docs** — `npm run docs:generate && npm run docs:check`.

- [ ] **Step 8: Commit.**

```bash
git commit \
  formspec/registries/formspec-common.registry.json \
  formspec/specs/registry/extension-registry.md \
  formspec/tests/conformance/fixtures/modules/x-formspec-core-task/ \
  formspec/tests/test_p1_module_x_formspec_core_task.py \
  $(git diff --name-only formspec/specs formspec/filemap.json) \
  -m "feat(adr-0150): publish x-formspec-core-task module (Experience UnitKind closed-core) (§4.9/§4.2/§10)"
```

- [ ] **Step 9: Architecture review AFTER** — first P1 commit sets the shape pattern for the remaining 4 P1 modules; load-bearing.

## Task 1.2 — `x-formspec-core-actions` module

**ADR refs:** §4.9, §4.2 (`action-intent` + `validation-mapping-row` contributions), §10 (refactor rows 5, 6).

**Why coupled.** Per ADR §4.9: "x-formspec-core-actions — Response Actions intent closed-core + the closed-core MasterTable rows." One module entry bundles both contribution sets: 5 `action-intent` contributions + 5 `validation-mapping-row` contributions. The closed-core MasterTable's JCS byte-equality invariant (set up in P0 Task 9) remains authoritative — the `row` payloads here MUST reproduce the canonical rows byte-for-byte under JCS (RFC 8785).

**Files:**
- Modify: `formspec/registries/formspec-common.registry.json` — add `x-formspec-core-actions` module entry + 5 `action-intent` + 5 `validation-mapping-row` contribution entries.
- Create: `formspec/tests/conformance/fixtures/modules/x-formspec-core-actions/` — module-loading fixture + JCS byte-equality fixture.
- Create: `formspec/tests/test_p1_module_x_formspec_core_actions.py`.

- [ ] **Step 1: Failing fixtures.**
  - Module entry validates with both contribution category lists.
  - Each `action-intent` entry validates with its `validation` payload (full ValidationTuple per VM §6.1).
  - Each `validation-mapping-row` entry's `row` field, when JCS-canonicalized, matches byte-for-byte against the canonical 5-row fixture from P0 Task 9 (`formspec/tests/conformance/fixtures/validation-mapping/closed-core-5-rows-jcs.json`).

- [ ] **Step 2: Run** — fail.

- [ ] **Step 3: Author module + 10 contribution entries.** Closed-core intents per `validation-mapping.schema.json` ActionIntent (5 values: `save-draft`, `autosave`, `review`, `submit`, `request-evidence`). MasterTable rows from `validation-mapping.schema.json` MasterTable inline.

- [ ] **Step 4: Run** — green; JCS byte-equality fixture confirms re-canonicalizing the contribution `row` payloads equals the P0 canonical fixture exactly.

- [ ] **Step 5: Regen docs.**

- [ ] **Step 6: Commit.**

```bash
git commit \
  formspec/registries/formspec-common.registry.json \
  formspec/tests/conformance/fixtures/modules/x-formspec-core-actions/ \
  formspec/tests/test_p1_module_x_formspec_core_actions.py \
  $(git diff --name-only formspec/specs formspec/filemap.json) \
  -m "feat(adr-0150): publish x-formspec-core-actions module (ActionIntent + MasterTable rows) (§4.9/§4.2)"
```

- [ ] **Step 7: Code review** — inline; this is the second P1 module, pattern should hold.

## Task 1.3 — `x-formspec-core-component` module (absorbs `specs/ui-policy.json`)

**ADR refs:** §4.9, §4.2 (`widget` contribution requires `widgetShape`), §14 P1 ("absorbs `specs/ui-policy.json` content as `contributes[]` payload"), §10 (refactor row 4).

**Why standalone.** `formspec/specs/ui-policy.json` is the existing closed-core widget catalog (~25 entries: Section, Stack, Grid, TextInput, NumberInput, DatePicker, Select, CheckboxGroup, Toggle, FileUpload, Heading, Text, Divider, Card, Collapsible, ConditionalGroup, Tabs, ActionButton, Accordion, RadioGroup, MoneyInput, Slider, Rating, Signature, Alert, ...). Per ADR §14 P1, this content absorbs into the module as `widget` contribution entries. The `ui-policy.json` file's role becomes: source-of-truth for the closed-core *list*; Registry contributions carry the per-widget `widgetShape` schemas. Two paths considered: (a) retire `ui-policy.json` and read widgets from Registry; (b) keep `ui-policy.json` as authoring index, generate Registry contributions from it. **Recommendation: (b)** — `ui-policy.json` is consumed by schema-adjacent tooling, Rust lint, TS runtime helpers, authoring tools (per its own `description`). Retiring it would cascade into all consumers (cf. token-registry retirement in P0 Task 12 — significant work). For P1, `ui-policy.json` stays as the index; Registry contributions are authored alongside (manually for v1; a generator script can land in P2 if churn warrants).

**Open question** for execution: does `Component.component` get the `oneOf [closed-core, x-pattern]` enum convention now (deferred from P0 Task 5 per its Deviation), OR does this P1 commit just publish the module and leave the schema as today? **Plan recommendation:** publish the module here; the `Component.component` schema convention is a separate Task 1.3b that DOES NOT need to land for P2/P3/P4 to proceed. Defer 1.3b to be picked up alongside P2 Surface module work if natural; otherwise file to a follow-on. Per ADR §4.5 the schema convention is the contract; the lint binding (E604) is what enforces "unknown widget value resolves against a declared module's widget contribution." E604 ships in P0 Task 8 — the lint is ready; only the schema-side enum wrap is deferred.

**Files:**
- Modify: `formspec/registries/formspec-common.registry.json` — add `x-formspec-core-component` module + N `widget` contribution entries (N = current `ui-policy.json` widget count; ~25–32).
- Modify: `formspec/specs/registry/extension-registry.md` — note the `ui-policy.json`/Registry coupling.
- Create: `formspec/tests/conformance/fixtures/modules/x-formspec-core-component/` — fixtures.
- Create: `formspec/tests/test_p1_module_x_formspec_core_component.py`.

- [ ] **Step 1: Architecture review BEFORE** — `formspec-specs:spec-expert` cross-checks: (a) the `widgetShape.props` field on each contribution validates Theme's `widgetConfig` payloads per ADR §4.2 lines on Theme; (b) the fallback chain per Component §progressive-to-core is captured per widget; (c) the ui-policy.json/Registry coupling choice doesn't break existing consumers (the 5 consumers Pass B R3 grep-verified in P0 Task 12 Deviations — `sync-lint-schemas.mjs`, `copy-layout-css-assets.mjs`, `formspec-layout/package.json`, `platform-defaults.ts`, `default-theme.json` — those consume `token-registry.json`, not `ui-policy.json`, but `ui-policy.json` has its own consumer set worth enumerating before the commit).

- [ ] **Step 2: Enumerate `ui-policy.json` consumers** — `grep -rn 'ui-policy\.json\|ui-policy"' formspec/ formspec-studio/` to catalog. Likely consumers: schema validators, the formspec-lint widget-catalog pass, the formspec-engine widget registry. Verify NONE break under the Registry-coupled posture.

- [ ] **Step 3: Failing fixtures.**
  - Module entry with N `widget` contribution names → validates.
  - Per-widget contribution validates with `widgetShape.props` (closed schema for that widget's props) + `widgetShape.children` (children policy) + `widgetShape.fallback` (per Component §progressive-to-core).
  - Theme document configuring a module-supplied widget via `widgetConfig: { ... }` → validates against the contributing module's `widgetShape.props`. Note: this exercises the E604 (MODULE-PAYLOAD-SCHEMA-MISMATCH) lint pass landed in P0 Task 8.

- [ ] **Step 4: Run** — fail.

- [ ] **Step 5: Author module + contribution entries** for every widget in `ui-policy.json`. Reuse the `category` field already in `ui-policy.json` (layout/input/display/container) as part of `widgetShape.props` or as a top-level Registry-entry `tag`.

- [ ] **Step 6: Run** — green.

- [ ] **Step 7: Regen docs.**

- [ ] **Step 8: Commit.**

```bash
git commit \
  formspec/registries/formspec-common.registry.json \
  formspec/specs/registry/extension-registry.md \
  formspec/tests/conformance/fixtures/modules/x-formspec-core-component/ \
  formspec/tests/test_p1_module_x_formspec_core_component.py \
  $(git diff --name-only formspec/specs formspec/filemap.json) \
  -m "feat(adr-0150): publish x-formspec-core-component module (Component built-in widget catalog absorbs ui-policy.json) (§4.9/§14-P1)"
```

- [ ] **Step 9: Code review** — load-bearing (touches Theme widgetConfig validation through E604); background subagent.

## Task 1.4 — `x-formspec-core-trace` module

**ADR refs:** §4.9, §4.5 (Trace closed-cores: Source.kind, EdgeEntry.kind, TypedEndpoint), §10 (refactor row 7).

**Closed-cores to republish** (verified against `trace-index.schema.json` from P0 Task 5 — uniform `oneOf [closed-core, x-pattern]` already in place):
- `Source.kind` closed-core
- `EdgeEntry.kind` closed-core
- `TypedEndpoint` kinds (the `^x-` lane already admits extensions)

**Contribution category:** No matching category exists today for "trace kinds." Three options:
1. Use the `property` category (no payload required, simplest).
2. Introduce a new contribution category `trace-kind` with a `kindShape` payload (consistent with sister patterns like `unit-kind`).
3. Use `concept` (already first-class) with a freeform `description`.

**Plan recommendation: option 1 (`property`)** for the lowest-friction shipping — these are enum members, not nodes that need processor/renderer obligations. The ADR's contribution-category list (§4.2) is targeted at enums where consuming documents need typed payload validation (widget props, slot bindings, etc.). Trace edge-kinds are enum values consumed by audit tooling; the contribution metadata is descriptive, not validating. Document the choice in spec prose; pin in Deviations if reviewer pushes back.

**Files:**
- Modify: `formspec/registries/formspec-common.registry.json` — module + property contributions per Trace closed-core enum.
- Create: `formspec/tests/conformance/fixtures/modules/x-formspec-core-trace/`.
- Create: `formspec/tests/test_p1_module_x_formspec_core_trace.py`.

- [ ] **Step 1: Failing fixtures + run + author + run-green + regen + commit + code review** (compressed checklist; pattern established by Tasks 1.1–1.3).

```bash
git commit \
  formspec/registries/formspec-common.registry.json \
  formspec/tests/conformance/fixtures/modules/x-formspec-core-trace/ \
  formspec/tests/test_p1_module_x_formspec_core_trace.py \
  $(git diff --name-only formspec/specs formspec/filemap.json) \
  -m "feat(adr-0150): publish x-formspec-core-trace module (Trace edge/source/endpoint closed-cores) (§4.9)"
```

## Task 1.5 — `x-formspec-core-ledger` module

**ADR refs:** §4.9, §4.5 (Ledger closed-cores: EventType + ChangeSetEntry.valueClass), §8 (carry-points), §10 (refactor row 8).

**Closed-cores to republish** (verified post-P0 Task 5 — uniform convention applied; post-Task 6 — EventType has third lane `^(ai|user)\.` per Deviations log):
- `EventType` closed-core (the pre-existing values, excluding the `^x-` and `^(ai|user)\.` extension lanes which P4 fills).
- `ChangeSetEntry.valueClass` closed-core.

**Why this is the last P1 module.** The P4 `x-formspec-ai-runtime` module depends on the ledger carry-points (event payloads carry `authoredBy: AuthorActor` per §5.4; EventType admits `ai.*` lane per Deviations). Publishing `x-formspec-core-ledger` first makes the dependency explicit when P4 declares `dependencies: [{id: 'x-formspec-core-ledger', ...}]`.

**Files (same shape as 1.4):**
- Modify: `formspec/registries/formspec-common.registry.json` — module + property contributions per Ledger closed-core enum values.
- Create: `formspec/tests/conformance/fixtures/modules/x-formspec-core-ledger/`.
- Create: `formspec/tests/test_p1_module_x_formspec_core_ledger.py`.

- [ ] **Step 1: Failing + author + run + regen + commit + code review** (pattern established).

```bash
git commit \
  formspec/registries/formspec-common.registry.json \
  formspec/tests/conformance/fixtures/modules/x-formspec-core-ledger/ \
  formspec/tests/test_p1_module_x_formspec_core_ledger.py \
  $(git diff --name-only formspec/specs formspec/filemap.json) \
  -m "feat(adr-0150): publish x-formspec-core-ledger module (EventType + valueClass closed-cores) (§4.9/§8)"
```

## P1 → P2 phase boundary

- [ ] **Architecture review AFTER** — `formspec-specs:spec-expert` running `semi-formal-architecture-review` reads all 5 P1 modules + cross-checks: (a) all five `dependencies[]` graphs are intra-substrate-only (no module depends on a non-existent module); (b) default-set-equivalence holds across the Experience / Component / Response Actions / Trace / Ledger sample fixtures; (c) the naming convention from Task 1.1 holds uniformly.
- [ ] Run full verification suite (1–6).
- [ ] Plugin reference-map regen.

---

# Phase P2 — Ship 4 non-core modules v0.1

**ADR refs:** §14 P2 (`x-formspec-surface` v0.1, `x-formspec-presentation` v0.1, `x-formspec-conversation` v0.1, `x-formspec-document-viewer` v0.1), §6 (Surface as composition primitive), §6.2 (closed slot-type taxonomy v0.1), §7 (Surface ↔ Screener orthogonality).

## Task 2.1 — `x-formspec-surface` module v0.1 (substrate-identity proof case)

**ADR refs:** §6 (Surface as composition primitive), §6.2 (closed slot-type taxonomy: `definition-form`, `experience-unit`, `module-widget`, `static-content`, `embed-route`), §7 (Surface ↔ Screener orthogonality + `surface:<route-id>` URI scheme), §14 P2 (first non-core module).

**Why this is the load-bearing P2 commit.** Surface is the proof case — it proves the substrate is a UI substrate, not a form-only substrate. Surface depends on `x-formspec-core-task` and `x-formspec-core-actions` per ADR §6.1; both land in P1.

**Files:**
- Create: `formspec/schemas/surface.schema.json` — full Surface document shape (routes, slots, transitions). Includes top-level `modules: ModuleRef[]` per ADR §4.3.
- Create: `formspec/specs/surface/surface-spec.md` + companion BLUF/llm artifacts (regen via `npm run docs:generate`).
- Modify: `formspec/registries/formspec-common.registry.json` — add `x-formspec-surface` module + 5 `slot-type` contributions (one per closed-core slot type).
- Modify: `formspec/schemas/bundle-manifest.schema.json` — already has `surface: SiblingRef` / `surfaces: SiblingRef[]` from P0 Task 7; verify the SiblingRef target resolves correctly to the new Surface schema URL.
- Modify: `formspec/schemas/screener.schema.json` — register the `surface:<route-id>` URI scheme as a valid terminal-hop destination per ADR §7.
- Create: `formspec/crates/formspec-lint/src/pass_surface/` — lint pass for Surface coherence (route graph connected from entry, every slot binds via exactly one closed-core slot-type).
- Create: `formspec/tests/conformance/fixtures/modules/x-formspec-surface/` — multi-route App Manifest + Surface document fixture (the Harvey-AI-style legal workspace shape from the wireframe-generator spike is the natural validation target).

- [ ] **Step 1: Architecture review BEFORE** — load-bearing. `formspec-specs:spec-expert` + `formspec-specs:formspec-scout` cross-check: (a) the 5 slot-types are sufficient for v0.1 (closed at v0.1 per ADR §6.2); (b) Surface ↔ Screener orthogonality holds (no merged identity); (c) the `surface:<route-id>` URI scheme integrates cleanly into Screener's terminal-hop binding without breaking the freestanding Screener posture (§7); (d) Surface depends on `x-formspec-core-task` + `x-formspec-core-actions` and NOT on `x-formspec-core-component` (Component is the renderer's output, not Surface's input — §6.1).

- [ ] **Step 2: Failing fixtures.**
  - Surface document with 3 routes, each binding 2-3 slots → validates against new schema.
  - Surface using all 5 slot-types → validates.
  - Surface using an undefined slot type → fails.
  - Multi-route App Manifest (Bundle) declaring `surface: SiblingRef` → validates; lint pass confirms route graph is connected.
  - Screener with terminal-hop destination `surface:home-new` → validates.
  - Negative: Surface route graph with disconnected route → lint emits new code (`SURFACE-ROUTE-UNREACHABLE` or similar; define in this commit).

- [ ] **Step 3: Run** — fail.

- [ ] **Step 4: Author Surface schema, spec, lint, registry contributions.** Closed slot-type taxonomy per ADR §6.2 table. Document the route-graph-connectedness rule in spec prose; lint enforces.

- [ ] **Step 5: Register new lint code** for Surface coherence — extend `formspec/specs/lint-codes.json` following the same shape as E603/E604/E605 added in P0 Task 8. Pass: choose based on family (likely `pass: 8` for new bundle-graph-walk family or extend `pass: 7` component pass).

- [ ] **Step 6: Run** — green.

- [ ] **Step 7: Regen docs + sync lint mirror.**

- [ ] **Step 8: Commit.**

```bash
git commit \
  formspec/schemas/surface.schema.json \
  formspec/specs/surface/ \
  formspec/registries/formspec-common.registry.json \
  formspec/schemas/screener.schema.json \
  formspec/specs/lint-codes.json \
  formspec/crates/formspec-lint/ \
  formspec/tests/conformance/fixtures/modules/x-formspec-surface/ \
  $(git diff --name-only formspec/specs formspec/filemap.json) \
  -m "feat(adr-0150): ship x-formspec-surface v0.1 module (substrate-identity proof; §6/§6.2/§7/§14-P2)"
```

- [ ] **Step 9: Architecture review AFTER** — BREAKING-class equivalent (new spec, new schema, new lint family); background subagent.

## Task 2.2 — `x-formspec-presentation` module v0.1

**ADR refs:** §14 P2 ("non-form kinds + widgets"), §4.2 (`unit-kind` + `widget` contributions).

**What it ships.** Non-form Experience UnitKind values for views the wireframe-generator spike surfaced as gaps (gallery, viewer, dashboard, chat, etc. — F1–F8 from the spike). Each is a new `unit-kind` contribution. Plus presentation widgets (matter-shell, sidebar, breadcrumb, etc.) as `widget` contributions.

**Concrete v0.1 contribution slate** (probe the spike to confirm; pin in execution-time arch review):
- Unit kinds: `gallery` (collection display), `dashboard` (multi-widget overview), `viewer` (single-asset display), `chat-shell` (conversation container).
- Widgets: `Shell` (app frame), `Sidebar`, `Breadcrumb`, `RouteList`, `Chip`.

**Files:**
- Modify: `formspec/registries/formspec-common.registry.json` — module entry + contributions.
- Create: `formspec/tests/conformance/fixtures/modules/x-formspec-presentation/`.
- Create: `formspec/tests/test_p2_module_x_formspec_presentation.py`.

- [ ] **Step 1: Architecture review BEFORE** — `formspec-specs:spec-expert` cross-checks the v0.1 slate against the wireframe-generator spike's gap list.

- [ ] **Step 2–8: Standard module-commit cycle** (TDD + arch + commit).

```bash
git commit \
  formspec/registries/formspec-common.registry.json \
  formspec/tests/conformance/fixtures/modules/x-formspec-presentation/ \
  formspec/tests/test_p2_module_x_formspec_presentation.py \
  $(git diff --name-only formspec/specs formspec/filemap.json) \
  -m "feat(adr-0150): ship x-formspec-presentation v0.1 module (non-form unit kinds + widgets) (§14-P2)"
```

## Task 2.3 — `x-formspec-conversation` module v0.1

**ADR refs:** §14 P2.

**What it ships.** Chat-app widgets: `ChatThread`, `MessageList`, `MessageComposer`. Plus a `chat-thread` unit-kind for Experience composition.

**Files (same pattern as 2.2):**
- Modify: `formspec/registries/formspec-common.registry.json`.
- Create: fixtures + test.

```bash
git commit \
  formspec/registries/formspec-common.registry.json \
  formspec/tests/conformance/fixtures/modules/x-formspec-conversation/ \
  formspec/tests/test_p2_module_x_formspec_conversation.py \
  $(git diff --name-only formspec/specs formspec/filemap.json) \
  -m "feat(adr-0150): ship x-formspec-conversation v0.1 module (chat widgets) (§14-P2)"
```

## Task 2.4 — `x-formspec-document-viewer` module v0.1

**ADR refs:** §14 P2.

**What it ships.** Document-display widgets: `DocumentViewer`, `PDFPane`, `Annotations`, `MetadataPanel`. Plus a `document-review` unit-kind.

**Files (same pattern):**
- Modify: `formspec/registries/formspec-common.registry.json`.
- Create: fixtures + test.

```bash
git commit \
  formspec/registries/formspec-common.registry.json \
  formspec/tests/conformance/fixtures/modules/x-formspec-document-viewer/ \
  formspec/tests/test_p2_module_x_formspec_document_viewer.py \
  $(git diff --name-only formspec/specs formspec/filemap.json) \
  -m "feat(adr-0150): ship x-formspec-document-viewer v0.1 module (viewer widgets) (§14-P2)"
```

## P2 → P3 phase boundary

- [ ] **Architecture review AFTER** — all 4 P2 modules read together; verify `dependencies[]` graphs resolve.
- [ ] Full verification suite.
- [ ] Plugin reference-map regen.
- [ ] **Re-verify ADR 0151 §16 hold-list status** — if Phase 1 has closed between P0 and P2 (unlikely given calendar pressure, but check), P3 scope expands. If still HELD (default expectation), proceed with the constrained P3 scope below.

---

# Phase P3 — Product MCPs over studio-core kernel (CONSTRAINED)

**ADR refs:** §14 P3 ("Product MCPs over the studio-core kernel"), §11.1 ("substrate is AI-substrate-supported from day one").

**Cross-stack:** [ADR 0106](../../../thoughts/adr/0106-wos-server-governance-overlay.md) (WOS governance overlay), [ADR 0151](../../../thoughts/adr/0151-multi-actor-editing-automerge.md) (multi-actor editing — Phase 1 HELD), [ADR 0152](../../../thoughts/adr/0152-multi-actor-authorization-scope.md) (per-actor / per-class authorization-scope — deferred).

## P3 SCOPE NOTE — Constrained by ADR 0151 §16 Phase 1 hold

ADR 0151 Phase 1 is HELD (10 review items, 9 rows) per [ADR 0151 §16](../../../thoughts/adr/0151-multi-actor-editing-automerge.md#16-phase-1-hold-2026-05-23). The Automerge-shaped kernel rewrite is NOT normative until Phase 1 closes. Per the /goal directive's P3-specific caveat AND [ADR 0151 §16](../../../thoughts/adr/0151-multi-actor-editing-automerge.md) explicit guidance ("product MCPs building against substrate seams MAY proceed without waiting for this ADR's promotion, on the understanding that the editing-semantics layer this ADR commits is not normative until Phase 1 closes and that current studio-core ProposalManager remains the operational shape for now"):

**Constrained P3 scope (this plan):**
1. **Kernel API-surface design** — author the canonical method surface studio-core will expose (one method per substrate operation per §14 P3). Land as a typed TS interface (`StudioCoreKernel`) + spec doc; thin facade implementation wraps the existing `ProposalManager`. CRDT-agnostic by construction so future Automerge rewrite can replace the facade without API churn.
2. **Wireframes-MCP** — new product MCP at `formspec-studio/packages/formspec-mcp-wireframes/` (sibling to existing `formspec-mcp`). Thin facade over the `StudioCoreKernel` API. Ships product verbs for multi-route topology authoring per ADR §14 P3 substrate-touched table (App Manifest, Surface, Experience units, Definition stubs, Component, Trace).
3. **Forms-MCP collapse** — the existing `formspec-studio/packages/formspec-mcp` is reframed as the product MCP for form authoring. Tool-surface collapses from 32 tool files (substrate-fragment) to 15–20 product verbs (each composing kernel primitives into a journey-shaped verb). Business logic migrates into the new studio-core kernel API.

**Deferred to follow-on plan (P3-Automerge, post-ADR-0151-Phase-1-closure):**
- Automerge-shaped kernel rewrite (the underlying state machine, change-blob handling, schema-aware-convergence).
- CRDT-attribution of authoring ops per multi-actor session.
- ActorStream / ChangesetBranchManager full implementation per ADR 0151 §4.2/§6 (whichever lands after Phase 1 SA-1/B-1 close).

**Why this is the right cut.** Substrate seams the kernel API needs are stable (ADR 0150 §5.4 + §5.5 carry-points are CRDT-agnostic by construction). Product MCPs can author over the substrate today through the thin facade; the editing-semantics layer they depend on is the ProposalManager (existing) until Phase 1 closes. The API contract is forward-compatible: the same `StudioCoreKernel` surface holds when the implementation swaps from ProposalManager to Automerge.

## Task 3.1 — Studio-core kernel API-surface design (CONSTRAINED FACADE)

**ADR refs:** §14 P3, [ADR 0151 §16](../../../thoughts/adr/0151-multi-actor-editing-automerge.md#16-phase-1-hold-2026-05-23) hold-list, [ADR 0152](../../../thoughts/adr/0152-multi-actor-authorization-scope.md) authorization-scope deferral.

**Why this is the load-bearing P3 commit.** It defines the API contract every product MCP commits against. The API must be CRDT-agnostic so the future Automerge rewrite doesn't break MCPs.

**Files (in `formspec-studio/` submodule):**
- Create: `formspec-studio/packages/formspec-studio-core/src/kernel/StudioCoreKernel.ts` — typed TS interface declaring the kernel API.
- Create: `formspec-studio/packages/formspec-studio-core/src/kernel/ProposalManagerFacade.ts` — thin implementation wrapping existing `ProposalManager`.
- Modify: `formspec-studio/packages/formspec-studio-core/src/index.ts` — export `StudioCoreKernel` type + `ProposalManagerFacade` impl.
- Create: `formspec-studio/thoughts/specs/2026-05-23-studio-core-kernel-api.md` — kernel API spec doc.
- Create: `formspec-studio/packages/formspec-studio-core/tests/kernel/` — TDD fixtures.

**API surface (initial cut — refine in arch review).** One method per substrate operation per ADR §14 P3:
- App Manifest: `createBundle`, `addDefinition`, `addSurface`, `declareModule`, `recordSession`.
- Surface: `addRoute`, `bindSlot`, `removeSlot`, `transition`.
- Experience: `addUnit`, `bindActor`, `bindTask`.
- Definition: `addItem`, `setCalculate`, `setConstraint`, `setRelevant`.
- Component: `addNode`, `moveNode` (cross-Component → carries `Generation.movedFrom`), `copyNode` (cross-Component → carries `Generation.copiedFrom`), `setProps`.
- Response Actions: `addAction`, `setEffect`.
- Mapping: `defineTransform`.
- Theme: `setWidgetConfig`, `setToken`.
- Locale: `setKey`, `setFallback`.
- Trace: `recordEdge`, `recordEndpoint`.
- Ledger: `appendEvent`, `appendChangeSet`, `openSession`, `closeSession`.

Each method takes a typed argument set; returns a Promise<Result> with structured error union. AuthorActor and SessionRef passed as call-context (not threaded through every arg) so multi-actor concurrent calls thread the right identity.

- [ ] **Step 1: Architecture review BEFORE** — load-bearing. `formspec-specs:spec-expert` + `solutions-architect-validator` cross-check: (a) the API surface covers every substrate operation per §14 P3; (b) the API is CRDT-agnostic (no method signature depends on Automerge semantics); (c) the API doesn't pre-empt ADR 0151 Phase 1 decisions (SA-1 schema-aware-convergence, SA-2 two-store consistency, SA-5 Automerge↔Trellis canonical-encoding); (d) authorization-scope hooks (per [ADR 0152](../../../thoughts/adr/0152-multi-actor-authorization-scope.md)) are slot-able when the spec lands.

- [ ] **Step 2: TDD fixtures.** Each method gets a failing fixture exercising the substrate operation. The facade impl delegates to `ProposalManager` until Automerge lands.

- [ ] **Step 3: Author `StudioCoreKernel` interface + `ProposalManagerFacade` impl.** No business logic migration in this commit — that follows in Tasks 3.2/3.3.

- [ ] **Step 4: Run** — green.

- [ ] **Step 5: Commit** (formspec-studio submodule).

```bash
# Inside formspec-studio/
git commit \
  packages/formspec-studio-core/src/kernel/ \
  packages/formspec-studio-core/src/index.ts \
  packages/formspec-studio-core/tests/kernel/ \
  thoughts/specs/2026-05-23-studio-core-kernel-api.md \
  -m "feat(adr-0150): studio-core kernel API-surface design + ProposalManagerFacade (§14-P3 facade-scoped per ADR-0151-§16-hold)"
```

- [ ] **Step 6: Architecture review AFTER** — load-bearing; both reviewers must converge.

## Task 3.2 — Wireframes-MCP (new product MCP)

**ADR refs:** §14 P3 (initial slate row 1), §6 (Surface composition), §14 P3 substrate-touched: App Manifest, Surface, Experience units, Definition stubs (form slots), Component, Trace.

**Files (in `formspec-studio/` submodule):**
- Create: `formspec-studio/packages/formspec-mcp-wireframes/` — new MCP package mirroring the `formspec-mcp` package layout (`src/`, `tests/`, `package.json`, `tsconfig.json`).
- The product verbs are journey-shaped: `wireframeFromBrief` (one-shot multi-route generation), `addRoute`, `bindSlot`, `addExperienceUnit`, `addDefinitionStub` (form slot scaffold), `setComponentLayout`, `renderPreview`. ~7-10 verbs total — each composes 3-8 kernel primitives.
- Each verb is a thin facade over `StudioCoreKernel` calls from Task 3.1.

- [ ] **Step 1: Architecture review BEFORE** — `formspec-specs:spec-expert` + `frontend-artisan` cross-check the product-verb shape: each verb is a coherent user journey (designer says "wireframe this brief"), not a substrate-fragment (designer says "now also add the Trace edge").

- [ ] **Step 2: TDD fixtures.** A `wireframeFromBrief("legal workspace with 6 routes...")` fixture produces a multi-route App Manifest matching the wireframe-generator spike's output shape.

- [ ] **Step 3–6: Author + run + regen + commit.**

```bash
# Inside formspec-studio/
git commit \
  packages/formspec-mcp-wireframes/ \
  -m "feat(adr-0150): ship formspec-mcp-wireframes product MCP (multi-route UI authoring via kernel facade) (§14-P3)"
```

## Task 3.3 — Forms-MCP collapse (existing formspec-mcp reframe)

**ADR refs:** §14 P3 (initial slate row 2 — "the reframing of today's `formspec-mcp` into a product MCP over the new kernel — its tool surface collapses from ~49 substrate-fragment tools into ~15–20 product verbs").

**Why this is the last P3 commit before P4.** Forms-MCP is the existing formspec-mcp restructured. Pre-collapse state: 32 tool files in `formspec-studio/packages/formspec-mcp/src/tools/` (each file likely defines 1-2 tools; ADR's "~49" is a reasonable upper bound on tool count). Post-collapse target: 15–20 product verbs.

**Files (in `formspec-studio/` submodule):**
- Modify: `formspec-studio/packages/formspec-mcp/src/tools/` — collapse the 32-tool surface.
- Modify: `formspec-studio/packages/formspec-mcp/src/registry.ts` and related — point tool implementations at `StudioCoreKernel` calls.
- Modify: `formspec-studio/packages/formspec-mcp/lib/` — re-stamp the MCP manifest if version-bumped.
- Update: `formspec-studio/packages/formspec-mcp/tests/` — every collapsed verb gets a coverage test for the journey it composes.

**Suggested 15–20 product verb slate** (refine in arch review):
1. `bootstrapForm` (currently `bootstrap.ts` + `experience.ts` + `definition.ts` fragments).
2. `addFormField` (currently `structure.ts` + `structure-batch.ts` + `component.ts` fragments).
3. `setFieldBehavior` (currently `behavior.ts` + `behavior-expanded.ts` + `fel.ts` fragments).
4. `addAction` (currently `actions.ts`).
5. `bindResponseMapping` (currently `mapping-expanded.ts`).
6. `setLocale` (currently `locale.ts`).
7. `setTheme` (currently `style.ts` + `theme.ts`).
8. `previewForm` (currently `preview-documents.ts`).
9. `validateForm` (currently `audit.ts` + `dispatch-validation.ts`).
10. `publishForm` (currently `publish.ts`).
11. `composeMultiViewBundle` (currently `composition.ts`).
12. `addChangelogEntry` (currently `changelog.ts`).
13. `addOntologyLink` (currently `ontology.ts`).
14. `queryDocument` (currently `query.ts`).
15. `migrateDocument` (currently `migration.ts`).
16. `manageLifecycle` (currently `lifecycle.ts` + `lifecycle-memory.ts`).
17. `manageReferences` (currently `reference.ts` + `anchor-mappings.ts`).
18. `traceRecord` (currently `trace.ts`).

Total: 18 product verbs. Within ADR target of 15-20. Existing files `flow.ts` (workflow shape), `widget.ts` (widget-specific), `data.ts` (data-binding), `response.ts` (response-shape), `guide.ts` (guidance) collapse INTO the above journey-verbs (most likely `bootstrapForm` and `addFormField` absorb them). Pin in execution-time arch review.

- [ ] **Step 1: Architecture review BEFORE** — load-bearing. `formspec-specs:spec-expert` + `solutions-architect-validator` cross-check the 32→15-20 collapse: (a) each product verb is a coherent user journey, not a substrate-fragment; (b) no substrate operation is unreachable through the verb set (verifiable against the `StudioCoreKernel` API from Task 3.1); (c) the verb set is forward-compatible with multi-actor editing (each verb is `AuthorActor`-context-aware per ADR §5.4).

- [ ] **Step 2: TDD fixtures.** Each product verb gets at least one coverage fixture exercising its journey.

- [ ] **Step 3: Refactor the 32 tool files into 15-20 product verbs.** Old tool files are deleted; their logic migrates into the new verb files OR into the studio-core kernel impl. Per stack feedback [memory entry](../../../../.claude/projects/-Users-mikewolfd-Work-formspec-stack/memory/feedback_no_shims_refactor.md): NO backwards-compat shims — old tool names are gone, callers (MCP host integrations, AI agents) update to new verb names.

- [ ] **Step 4: Run** — full formspec-mcp test suite + integration against new kernel.

- [ ] **Step 5: Regen MCP manifest** (bundle the `.mcpb` if applicable).

- [ ] **Step 6: Commit** (formspec-studio submodule).

```bash
# Inside formspec-studio/
git commit \
  packages/formspec-mcp/src/ \
  packages/formspec-mcp/lib/ \
  packages/formspec-mcp/tests/ \
  packages/formspec-mcp/manifest.json \
  packages/formspec-mcp/package.json \
  -m "$(cat <<'EOF'
refactor(adr-0150): collapse formspec-mcp tool surface 32 → 18 product verbs (Forms-MCP reframe) (§14-P3)

BREAKING: formspec-mcp tool names change from substrate-fragment names (32 tools)
to journey-shaped product verbs (18 verbs). Business logic migrates from MCP
tool layer into studio-core kernel (Task 3.1 facade). MCP host integrations
and AI agents updating to the new verb set get a forward-compatible API that
remains stable through the future Automerge-shaped kernel rewrite.
EOF
)"
```

- [ ] **Step 7: Architecture review AFTER** — BREAKING + load-bearing.

## P3 → P4 phase boundary

- [ ] **Architecture review AFTER** — entire P3 work-set read together; verify the kernel API + the two product MCPs hold the substrate-identity claim ("Wireframes-MCP is the substrate-identity proof case", ADR §14 P3).
- [ ] Full verification suite.
- [ ] Plugin reference-map regen.

---

# Phase P4 — AI-runtime module + `ai.*` event vocabulary

**ADR refs:** §14 P4 (`x-formspec-ai-runtime` module defines runtime contract over substrate carry-points shipped in P0), §8 (carry-points list + 9 baseline `ai.*` events), §5.4 (`AuthorActor` on every authoring event payload).

**What it ships.** A new `x-formspec-ai-runtime` Registry module that:
- Publishes the 9 baseline `ai.*` event values as `property` (or new `event-type`) contributions.
- Pins the contract: each `ai.*` event payload carries `authoredBy: AuthorActor` per ADR §5.4 (substrate carry-point already exists post-P0 Task 6).
- Defines when AI fires, prompt-lineage ownership, regen-merge participation, Response inclusion (ADR §8 prose).
- Each product MCP (Wireframes-MCP, Forms-MCP from P3) emits its own product-specific `ai.*` extension events through the substrate's `^x-` lane (e.g., `ai.wireframe-rendered`, `ai.field-added`).

## Task 4.1 — `x-formspec-ai-runtime` module + `command` family (3 events)

**ADR refs:** §14 P4, §8 (closed-core baseline).

**The `command` family** per ADR §8: `ai.command-issued`, `ai.command-completed`, `ai.command-failed`. Semantics: an AI agent invokes a kernel operation (issued); the operation succeeds (completed) or fails (failed). Each event payload carries `authoredBy: { kind: 'ai-agent', actChannel: 'mcp', ... }`.

**Files:**
- Modify: `formspec/registries/formspec-common.registry.json` — add `x-formspec-ai-runtime` module entry + 3 contributions.
- Create: `formspec/specs/ai-runtime/ai-runtime-spec.md` — spec doc + BLUF/llm artifacts (regen).
- Create: `formspec/tests/conformance/fixtures/modules/x-formspec-ai-runtime/command/`.
- Create: `formspec/tests/test_p4_ai_runtime_command.py`.

- [ ] **Step 1: Architecture review BEFORE** — load-bearing. `formspec-specs:spec-expert` + `cross-stack-scout` cross-check: (a) the 3 command events compose cleanly with the EventType `^(ai|user)\.` lane added in P0 Task 6 Deviations; (b) the `authoredBy` field on the envelope is consumed by the ledger schema (P0 Task 6 commit `c7c9ad90`) — verify the if/then trigger `eventType ~ ^(ai\.|user\.)` actually requires `authoredBy` per the failing-fixture matrix.

- [ ] **Step 2: Failing fixtures.**
  - Ledger event with `eventType: 'ai.command-issued'` AND `authoredBy: { id: 'urn:formspec:actor:ai-agent:wireframes-mcp', kind: 'ai-agent', actChannel: 'mcp' }` → validates.
  - Same event WITHOUT `authoredBy` → fails (per P0 Task 6 if/then conditional).
  - `ai.command-completed` event refs the issued event via a `replyToEventId` field (or whatever carry-point is most natural — verify against existing event schema).
  - `ai.command-failed` event carries error structure (define payload-shape in spec doc).

- [ ] **Step 3: Run** — fail.

- [ ] **Step 4: Author module + 3 contributions + spec doc.** The 3 events become `property` (or `event-type`) Registry contributions.

- [ ] **Step 5: Run** — green.

- [ ] **Step 6: Regen docs + sync mirrors.**

- [ ] **Step 7: Commit.**

```bash
git commit \
  formspec/registries/formspec-common.registry.json \
  formspec/specs/ai-runtime/ \
  formspec/tests/conformance/fixtures/modules/x-formspec-ai-runtime/command/ \
  formspec/tests/test_p4_ai_runtime_command.py \
  $(git diff --name-only formspec/specs formspec/filemap.json) \
  -m "feat(adr-0150): publish x-formspec-ai-runtime + command family (3 ai.command-* events) (§14-P4/§8)"
```

- [ ] **Step 8: Architecture review AFTER** — first P4 commit sets the shape pattern.

## Task 4.2 — `suggestion` family (3 events)

**ADR refs:** §14 P4, §8.

**The `suggestion` family**: `ai.suggestion-offered`, `ai.suggestion-accepted`, `ai.suggestion-rejected`. Semantics: AI proposes a change (offered); user accepts (accepted) or rejects (rejected). Drives regen-merge participation per §8 prose.

**Files:**
- Modify: `formspec/registries/formspec-common.registry.json` — extend module's `contributes[]` + add 3 contributions.
- Create: fixtures + test.

- [ ] **Step 1–7: Standard family-commit cycle.**

```bash
git commit \
  formspec/registries/formspec-common.registry.json \
  formspec/specs/ai-runtime/ \
  formspec/tests/conformance/fixtures/modules/x-formspec-ai-runtime/suggestion/ \
  formspec/tests/test_p4_ai_runtime_suggestion.py \
  $(git diff --name-only formspec/specs formspec/filemap.json) \
  -m "feat(adr-0150): x-formspec-ai-runtime — suggestion family (3 ai.suggestion-* events) (§14-P4/§8)"
```

## Task 4.3 — `proposal` family (3 events)

**ADR refs:** §14 P4, §8.

**The `proposal` family**: `ai.proposal-opened`, `ai.proposal-closed`, `ai.proposal-accepted`. Semantics: AI opens a multi-suggestion proposal (opened); user closes the proposal without accepting (closed) or accepts (accepted). Drives session-bounded multi-change AI flows.

**Files:** Same pattern as 4.2.

```bash
git commit \
  formspec/registries/formspec-common.registry.json \
  formspec/specs/ai-runtime/ \
  formspec/tests/conformance/fixtures/modules/x-formspec-ai-runtime/proposal/ \
  formspec/tests/test_p4_ai_runtime_proposal.py \
  $(git diff --name-only formspec/specs formspec/filemap.json) \
  -m "feat(adr-0150): x-formspec-ai-runtime — proposal family (3 ai.proposal-* events) (§14-P4/§8)"
```

## Task 4.4 — Wire P3 product MCPs to emit `ai.*` events (closes the loop)

**ADR refs:** §14 P4 ("Each product MCP emits its own `ai.*` events ... through the substrate's `EventType` carry-point").

**What it does.** Wires Wireframes-MCP and Forms-MCP (from P3) to emit ledger events as they invoke kernel operations. Each product MCP emits:
- Closed-core `ai.command-issued` / `ai.command-completed` / `ai.command-failed` per kernel operation (covers the universal authoring baseline).
- Product-specific `^x-` extensions where journey-specific events matter (e.g. `ai.wireframe-rendered` for Wireframes-MCP, `ai.field-added` for Forms-MCP). These are per-MCP module contributions; ship as `x-formspec-mcp-wireframes` / `x-formspec-mcp-forms` modules with their own ai.* contributions. Each MCP module declares `dependencies: [{id: 'x-formspec-ai-runtime', ...}, ...]`.

**Files (in `formspec-studio/` submodule):**
- Modify: `formspec-studio/packages/formspec-mcp-wireframes/src/` — every verb emits ledger events through `StudioCoreKernel.appendEvent(...)`.
- Modify: `formspec-studio/packages/formspec-mcp/src/` — same.
- Modify: `formspec/registries/formspec-common.registry.json` — add per-MCP modules + their product-specific `ai.*` contributions.
- Create: end-to-end fixtures (formspec-studio side + formspec-side) proving an MCP-driven kernel operation produces a substrate-validated ledger event.

- [ ] **Step 1: Architecture review BEFORE** — load-bearing. `cross-stack-scout` cross-checks that the closed-core 9 events are emitted by both MCPs uniformly AND that product-specific extensions follow the `ai.<product>-<event>` naming pin from ADR §8.

- [ ] **Step 2–7: Standard cycle.**

```bash
# inside formspec-studio/
git commit \
  packages/formspec-mcp-wireframes/src/ \
  packages/formspec-mcp/src/ \
  -m "feat(adr-0150): wire Wireframes-MCP + Forms-MCP to emit ai.* events through kernel (§14-P4)"
```

```bash
# inside formspec/
git commit \
  formspec/registries/formspec-common.registry.json \
  formspec/tests/conformance/fixtures/modules/x-formspec-mcp-wireframes/ \
  formspec/tests/conformance/fixtures/modules/x-formspec-mcp-forms/ \
  $(git diff --name-only formspec/specs formspec/filemap.json) \
  -m "feat(adr-0150): x-formspec-mcp-wireframes + x-formspec-mcp-forms modules (product ai.* extensions) (§14-P4)"
```

## P4 closure + final verification gate

- [ ] **Architecture review AFTER** — entire P4 work-set + entire P1→P4 work-set read together. `cross-stack-scout` (or `formspec-specs:spec-expert` + `formspec-specs:formspec-scout` in parallel) verifies:
  - Every module's `dependencies[]` resolves.
  - Closed-core enum lanes (§4.5) admit every published value across all 5 P1 modules.
  - Surface ↔ Screener orthogonality holds.
  - The studio-core kernel API surface is CRDT-agnostic (re-verifiable against ADR 0151 §16 hold-list items that haven't closed — none of those items must depend on this work's shape).
  - The 9 baseline `ai.*` events are emitted by both product MCPs.
  - No backwards-compat shim, alias, or deprecated path is introduced anywhere.

- [ ] Run full verification suite (1–6 plus 7, 8).

- [ ] Both reviewers return zero open findings on the entire P1→P4 work-set.

- [ ] Plugin reference-map regen — final pass per [`formspec-specs:update-spec-nav`](../../../.claude-plugin/skills/formspec-specs/SKILL.md). Affected maps include `common.md`, `registry.md`, `bundle-manifest.md` (or `app-manifest.md`), `experience.md`, `response-actions.md`, `component.md`, `trace-index.md`, `respondent-ledger-event.md`, `surface.md` (NEW), `ai-runtime.md` (NEW), `studio-core-kernel-api.md` (NEW — in `formspec-studio` ref maps if/when the skill covers it).

- [ ] **Submodule pointer ready for owner-approved push.** Per [`../../../CLAUDE.md`](../../../CLAUDE.md) §Submodule discipline: do NOT auto-bump the parent-stack submodule pointers. After P4 closure:
  - `formspec/` submodule pointer ready for explicit owner push.
  - `formspec-studio/` submodule pointer ready for explicit owner push.
  - Parent commit message references both submodule heads + cites ADR 0150 §14 P1–P4 closure.

---

## Deviations

(Append-only. Reviewer findings + steering changes land here, not in the ratified ADR.)

### r0 (2026-05-23) — Initial drafting

**Closed-core register-entry naming.** Pinned in Task 1.1 prose: the Registry `name` pattern (`^x-...`) requires `x-`-prefixed names, but closed-core enum values are unprefixed (`data-entry`). Resolution: closed-core contribution entries are named `x-formspec-core-<module>-<value>`; their `semantics`/`row`/`widgetShape` payload carries the unprefixed `kindValue` (or equivalent) so consuming tools resolve `unit.kind: 'data-entry'` to the right entry. ADR §4.9 "no semantic change" remains true — the schema's `oneOf [closed-core, x-pattern]` lane still admits the unprefixed value without consulting Registry.

**`Component.component` schema convention deferred.** P0 Task 5 Deviation already documented that `Component.component` doesn't get the mechanical `oneOf [closed-core, x-pattern]` wrap because the AnyComponent dispatcher constraint is structurally richer. P1 Task 1.3 publishes the `x-formspec-core-component` module (the data); the schema-side enum convention can land as a follow-on task when the AnyComponent refactor scope is well-bounded. This plan does NOT promise the schema convention as part of P1.

**Trace contribution category choice.** Task 1.4 uses `property` category (no payload required) instead of introducing a new `trace-kind` contribution category. Rationale: trace enum values are descriptive, not validating — the ADR's named contribution categories (§4.2) target enums whose values carry typed payloads (widget props, slot bindings, semantics). If a reviewer pushes for `trace-kind`, the ADR's contribution-category list expands — that's not a breaking change, but it widens the spec rev's surface. Plan recommends the lower-friction shipping shape; revisit in arch review.

**`ui-policy.json` retention strategy.** Task 1.3 keeps `formspec/specs/ui-policy.json` as the authoring index for built-in widgets; Registry contributions are authored alongside. The alternative (retiring `ui-policy.json` like P0 retired `token-registry.schema.json`) requires cascading the 5+ consumers ([formspec-layout, formspec-webcomponent, formspec-engine, formspec-lint, formspec-studio]). For P1, the lighter touch wins; retire `ui-policy.json` as a P2+ task IF a generator script eliminates the dual-maintenance cost.

**P3 scope constraint pinned to ADR 0151 §16.** Per /goal directive: if ADR 0151 Phase 1 is not closed when P3 starts, P3 scopes to kernel API-surface design + thin-facade scaffolding over ProposalManager. As of plan-write time (2026-05-23), Phase 1 is HELD per [ADR 0151 §16](../../../thoughts/adr/0151-multi-actor-editing-automerge.md#16-phase-1-hold-2026-05-23). Plan reflects the constraint. If Phase 1 closes mid-P3, the Automerge-shaped kernel work folds back in via a Deviations entry; do not silently expand scope.

**Forms-MCP product-verb slate is recommended, not pinned.** Task 3.3 lists 18 candidate product verbs derived from the existing 32-tool file layout. Final verb set is decided in Task 3.3 Step 1 (arch review BEFORE) — the slate may compress further or rebalance based on user-journey coherence per `feedback_conceptual_nugget`.

**Cross-stack obligations (post-P4).** Studio-side P3 commits land in the `formspec-studio` submodule. Per [`../../../CLAUDE.md`](../../../CLAUDE.md) §Submodule discipline, a change crossing N submodules takes N+1 commits. P3 produces 1 formspec-side commit (P4 Task 4.4 second commit — `x-formspec-mcp-*` module Registry entries) + 3 formspec-studio commits (Tasks 3.1, 3.2, 3.3) + 1 formspec-studio commit (Task 4.4 first commit). After P4 closure, the parent-stack commit bumps both submodule pointers — owner-approved push.

### r0 follow-ups (open)

- Reviewer-converged Deviations append here as P1→P4 execution surfaces them.

---

## Out of scope (lives in P5+ or post-ADR-0151-Phase-1-closure)

- Automerge-shaped kernel rewrite (kernel-impl swap from ProposalManager facade to Automerge). **Trigger:** ADR 0151 Phase 1 closure.
- ActorStream / ChangesetBranchManager full implementation (ADR 0151 §4.2/§6). **Trigger:** ADR 0151 Phase 1 SA-1 + B-1 closure.
- Schema-aware-convergence algorithm authoring (ADR 0151 §5 hold-list SA-1). **Trigger:** ADR 0151 Phase 1.
- Two-store consistency contract (App Manifest `sessions[]` ↔ ledger `sessionRefs[]`, ADR 0151 hold-list SA-2). **Trigger:** ADR 0151 Phase 1.
- Per-class governance for module widgets ([ADR 0152](../../../thoughts/adr/0152-multi-actor-authorization-scope.md)). **Trigger:** ADR 0152 ratification.
- Future product MCPs: `formspec-mcp-playbooks`, `formspec-mcp-chat-apps`, `formspec-mcp-documents`, `formspec-mcp-reviews` per ADR §14 P3. **Trigger:** their underlying modules + kernel support maturity.
- `formspec-studio` UI cascade (project.ts, preview-documents.ts, export-zip.ts wrapper realignment to App Manifest plural-`definitions[]` shape — already flagged in P0 plan Deviations §Cross-stack coordination).
- `formspec-web` verification (cross-stack consumer of ledger event types — already flagged in P0 plan Deviations §Cross-stack coordination).
- `formspec-studio/packages/formspec-mcp/lib/schemas/token-registry.schema.json` retirement (vendored stale schema flagged in P0 plan Deviations).

# ADR 0150 §14 P0 Implementation Plan — Formspec as Layered UI Substrate

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax. The normative target is [ADR 0150](../../../thoughts/adr/0150-formspec-as-layered-ui-substrate.md) — this plan is the execution layout, not a re-derivation.

**Goal:** Land the eight §14 P0 substrate refactors against the ratified ADR 0150 — module-aware Registry, per-view Definition grain plumbing, App Manifest reframe, common-schema multi-actor + provenance + module $defs, posture admission, MasterTable demotion, Token Registry retirement, and bundle-unique `id` invariant with `COMP-BUNDLE-ID-COLLISION` lint — so the substrate matches the architectural commitments before P1 republishes core vocabularies as modules.

**Architecture:** Greenfield-prescriptive refactor (formspec/CLAUDE.md §"The spec is the source of truth"). The ADR ships shapes; we conform existing artifacts to them. No backwards-compat shims, no aliasing — refactor existing code to the new contract per stack feedback policy. Coordinate the four `common.schema.json` $defs as one pass to avoid mid-stack contract churn; everything else commits per logical work-item.

**Tech stack:** JSON Schema 2020-12 (schemas), Markdown (specs), Rust (formspec-lint, formspec-py, formspec-eval, fel-core), TypeScript (formspec-engine, formspec-core, formspec-studio-core), Python (formspec validator + conformance). Build gate: `npm run docs:generate` → `npm run docs:check` → `npm run check:deps` → `make test` → `cargo nextest run --workspace` → `python3 -m pytest tests/ -v`.

---

## Normative pin

The ADR is authority. **Cite §x.y on every commit** so reviewers can verify intent without re-reading the ADR. If the ADR is ambiguous on a point, write the chosen interpretation here in Deviations and proceed; do **not** edit the ratified ADR.

## Commit discipline

- One P0 work-item per commit; tight schema clusters (e.g. all four `common.schema.json` $defs) compose where ADR §10 says they coordinate.
- Never `--amend`. Pre-commit-hook failures: fix, re-stage, new commit.
- Specify paths to `git commit <paths> -m` (parallel-craftsmen safety per stack feedback).
- Commit msg shape: `feat(adr-0150): <one-line>` / `refactor(adr-0150): <one-line>` / `test(adr-0150): <one-line>` — always cite the ADR §.
- BREAKING commits MUST use the `BREAKING:` body marker AND the precondition gate (Task 0) MUST be closed first.

## Review rhythm

- **Inline** after every commit: implementer-agent never self-reviews; spawn a fresh scout/expert running `formspec-specs:semi-formal-code-review` (background subagent when ≥3 files changed).
- **Architecture review** before AND after every load-bearing commit (the three BREAKINGs per ADR §11.2 + auth-shape `posture.allowedModules: ModuleRef[]` + coordinated `common.schema.json` 4-def pass per ADR §10 + `token-registry.schema.json` retirement + each new lint code per §4.2/§4.3/§5.3) via `formspec-specs:semi-formal-architecture-review`.
- **Cadence floor:** at least one code-review subagent per 3–5 commits regardless of size class.
- **Every BLOCKER/HIGH fixed; warnings + nits resolved or justified inline.** Reviewer never self-remediates — findings go to a fresh craftsman.

## Verification (per CLAUDE.md §"Build & commands")

`make test` is the umbrella but takes minutes. The discrete green-bar set:

1. `npm run docs:generate` — regen BLUF blocks, schema-ref blocks, filemap, `*.llm.md`.
2. `npm run docs:check` — doc-gate (frozen-generated, archive-path, embed freshness).
3. `npm run check:deps` — package-layer fence.
4. `cargo nextest run --workspace` — Rust workspace (formspec-lint, formspec-eval, formspec-py, fel-core, etc.).
5. `python3 -m pytest tests/ -v` — Python conformance.
6. `make test` — full umbrella incl. Playwright E2E.

Run 1–3 after every commit touching schemas or specs. Run 4–5 after Rust/Python source changes. Run 6 before declaring P0 done.

---

## Task 0 — COMP-BUNDLE-ID fixture audit (PRECONDITION; gates Task 8 + Task 4)

**ADR ref:** §5.3 fixture-audit checklist.

**Why:** `ComponentBase.id` uplift from per-tree-unique to bundle-unique is BREAKING (§11.2). The ADR pins this audit as a §14 P0 gate — no BREAKING ships before it closes. Also load-bearing for ADR 0151's CRDT bidirectional map.

**Files:**
- Create: `formspec/tests/conformance/COMP-BUNDLE-ID-MIGRATION.md` (audit report + migration log)
- Possibly modify: any fixture under `formspec/tests/fixtures/`, `formspec/tests/conformance/`, `formspec/tests/e2e/fixtures/`, `formspec/reconstructed-examples/`, `formspec/examples/`, `formspec/thoughts/chaos-test/` that reuses `id` across Component documents.

- [ ] **Step 1: Enumerate Component documents in scope.** Grep `'"$formspecComponent"'` across the formspec submodule, exclude `node_modules` / `crates/formspec-lint/schemas/` (that's a schema copy, not a fixture). Build the candidate list.

- [ ] **Step 2: Extract every Component node `id` per document.** For each document in the candidate list, parse the JSON, walk the tree, collect `(documentPath, nodePath, id)` triples for every node carrying an `id`.

- [ ] **Step 3: Detect cross-document collisions inside the same bundle context.** Two Component documents bundled together (referenced by the same App Manifest, or co-located in the same example dir) must have disjoint `id` sets. Build a (bundleScope, id) → [(doc, nodePath)] index; collisions = entries with >1 row.

- [ ] **Step 4: Mechanical migration at every collision site.** Suggested rewrite: prefix existing `id` with `<componentDocStem>.` (e.g. `headerLogo` in `dashboard.component.json` → `dashboard.headerLogo`). Apply rewrite + record before/after in the audit report.

- [ ] **Step 5: Write the audit report.** `formspec/tests/conformance/COMP-BUNDLE-ID-MIGRATION.md` contains: scope, methodology, collision count, per-collision migration row (`bundle | doc | old-id | new-id`), zero-collision residual statement. The report is the close-gate artifact.

- [ ] **Step 6: Commit.**

```bash
git commit \
  formspec/tests/conformance/COMP-BUNDLE-ID-MIGRATION.md \
  $(git diff --name-only formspec/tests formspec/examples formspec/reconstructed-examples formspec/thoughts/chaos-test) \
  -m "test(adr-0150): close COMP-BUNDLE-ID-COLLISION fixture-audit gate (§5.3)"
```

- [ ] **Step 7: Review.** Dispatch `formspec-specs:formspec-scout` with `semi-formal-code-review` to validate the audit's collision-detection logic and migration completeness.

---

## Task 1 — Coordinated `common.schema.json` 4-def pass

**ADR refs:** §4.4 (ModuleRef), §5.3 (Generation), §5.4 (AuthorActor), §5.5 (SessionRef), §10 (refactor table — "single coordinated refactor pass").

**Why ship as one commit:** Every downstream task (registry rev, posture, ledger, bundle-manifest, surfaces, component, experience) `$ref`s these defs. A staggered roll-out forces downstream specs to invent placeholder shapes mid-week.

**Files:**
- Modify: `formspec/schemas/common.schema.json`
- Modify: `formspec/crates/formspec-lint/schemas/common.schema.json` (if it exists as duplicate; check first — may be a generated copy)
- Create: `formspec/tests/conformance/common-schema-defs/` fixtures for each new $def (valid + invalid examples)
- Modify: `formspec/specs/common/` prose if it exists (else create section in adjacent canonical spec)

- [ ] **Step 1: Architecture-review BEFORE landing the def shapes.** Dispatch `formspec-specs:spec-expert` to cross-check the ADR's §10 shapes against current `common.schema.json` $defs and surface any conflicts before authoring. Pause on findings, integrate, then proceed.

- [ ] **Step 2: Write failing fixtures.** For each of `Generation`, `AuthorActor`, `SessionRef`, `ModuleRef`, create one valid example + ≥2 invalid examples that exercise the closed-enum invariants (e.g. `AuthorActor.kind` outside `{human, ai-agent, service}`, `AuthorActor.actChannel` outside `{human, mcp, agent, service}`, `ModuleRef` missing `id`/`version`, `SessionRef.actors` non-URN). Wire into the Python conformance suite under `tests/test_common_schema_defs.py` (or equivalent).

- [ ] **Step 3: Verify fixtures fail.** `python3 -m pytest tests/test_common_schema_defs.py -v` — expect failures (the $defs don't exist yet).

- [ ] **Step 4: Author the four $defs.** Per ADR §10 row-by-row:

```jsonc
// common.schema.json $defs additions

"ModuleRef": {
  "type": "object",
  "required": ["id", "version"],
  "additionalProperties": false,
  "properties": {
    "id":        { "type": "string", "pattern": "^x-[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$",
                   "description": "Module URN (Registry naming pattern, §4.8)." },
    "version":   { "type": "string", "minLength": 1,
                   "description": "Strict SemVer or range expression." },
    "publisher": { "type": "string", "format": "uri",
                   "description": "OPTIONAL provenance assertion." },
    "lockHash":  { "type": "string", "pattern": "^[a-z0-9]+:[A-Za-z0-9+/=]+$",
                   "description": "OPTIONAL digest pin (e.g. 'sha256:...')." },
    "extensions": { "$ref": "#/$defs/Extensions" }
  },
  "description": "Canonical module reference; see ADR 0150 §4.4."
},

"AuthorActor": {
  "type": "object",
  "required": ["id", "kind", "actChannel"],
  "additionalProperties": false,
  "properties": {
    "id":         { "type": "string", "pattern": "^urn:formspec:actor:.+",
                    "description": "Stable actor URN." },
    "kind":       { "type": "string", "enum": ["human", "ai-agent", "service"],
                    "description": "Terminal-closed; product nuance rides URN, §5.4." },
    "actChannel": { "type": "string", "enum": ["human", "mcp", "agent", "service"],
                    "description": "Terminal-closed; orthogonal to kind, §5.4." },
    "display":    { "type": "string" },
    "extensions": { "$ref": "#/$defs/Extensions" }
  },
  "description": "Authoring identity; distinct from respondent-ledger-event.Actor (respondent-identity) and experience.Actor (workflow-role). See ADR 0150 §5.4."
},

"SessionRef": {
  "type": "object",
  "required": ["id", "openedAt", "actors"],
  "additionalProperties": false,
  "properties": {
    "id":       { "type": "string", "pattern": "^urn:formspec:session:.+" },
    "openedAt": { "type": "string", "format": "date-time" },
    "closedAt": { "type": "string", "format": "date-time",
                  "description": "Absent = currently open." },
    "actors":   { "type": "array", "minItems": 1,
                  "items": { "type": "string", "pattern": "^urn:formspec:actor:.+" } },
    "extensions": { "$ref": "#/$defs/Extensions" }
  },
  "description": "App Manifest session index entry; see ADR 0150 §5.5."
},

"Generation": {
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "generatedBy": {
      "oneOf": [
        { "type": "string" },
        { "$ref": "#/$defs/AuthorActor" }
      ],
      "description": "Actor attribution; URN string OR inline AuthorActor, §5.4."
    },
    "sourceModule": {
      "$ref": "#/$defs/ModuleRef",
      "description": "Module/template provenance; orthogonal to generatedBy, §5.3."
    },
    "movedFrom":  { "$ref": "#/$defs/CrossComponentRef",
                    "description": "Set by tooling on cross-Component move, §5.3." },
    "copiedFrom": { "$ref": "#/$defs/CrossComponentRef",
                    "description": "Set by tooling on cross-Component copy, §5.3." },
    "extensions": { "$ref": "#/$defs/Extensions" }
  },
  "description": "Generalized x-generation provenance; see ADR 0150 §5.3 / §5.4."
},

"CrossComponentRef": {
  "type": "object",
  "required": ["route", "nodePath"],
  "additionalProperties": false,
  "properties": {
    "route":    { "type": "string" },
    "nodePath": { "type": "string" }
  },
  "description": "Surface-route + intra-document node path."
}
```

- [ ] **Step 5: Verify fixtures pass.** `python3 -m pytest tests/test_common_schema_defs.py -v` — expect green.

- [ ] **Step 6: Regenerate docs.** `npm run docs:generate && npm run docs:check`.

- [ ] **Step 7: Commit.**

```bash
git commit \
  formspec/schemas/common.schema.json \
  formspec/crates/formspec-lint/schemas/common.schema.json \
  formspec/tests/conformance/common-schema-defs/ \
  formspec/tests/test_common_schema_defs.py \
  $(npm run docs:generate -- --list-touched 2>/dev/null || git diff --name-only formspec/specs formspec/filemap.json) \
  -m "feat(adr-0150): add common.schema $defs ModuleRef/AuthorActor/SessionRef/Generation (§4.4/§5.3/§5.4/§5.5)"
```

- [ ] **Step 8: Architecture review AFTER.** Background `formspec-specs:spec-expert` running `semi-formal-architecture-review` to catch drift between intent and shape (common-schema is load-bearing for every downstream task).

---

## Task 2 — Registry rev: `namespace`→`module` + six contribution categories + `oneOf` uniform

**ADR refs:** §4.1, §4.2, §4.5, §4.6 (conflict), §10 (refactor table).

**Files:**
- Modify: `formspec/schemas/registry.schema.json` (rename `namespace`→`module`; add `contributes`/`dependencies`; add six contribution categories: `unit-kind`, `widget`, `action-intent`, `slot-type`, `validation-mapping-row`, `token-category`; add `allOf` gates).
- Modify: `formspec/specs/registry/extension-registry.md` (canonical spec prose; module aggregator section, contribution payload conformance, lint code naming).
- Modify: any reference using `category: 'namespace'` or `members[]` in fixtures/specs (full rename, no alias per stack feedback).
- Modify: `formspec/crates/formspec-lint/schemas/registry.schema.json` (mirror).

- [ ] **Step 1: Architecture review BEFORE** — `formspec-specs:spec-expert` cross-checks the six contribution categories against §4.2's payload-shape pins and ADR §9 conformance-partitioning. Verify the `allOf` gate names line up with existing `concept`/`vocabulary` precedent.

- [ ] **Step 2: Write failing fixtures.** New test set `tests/test_registry_module_categories.py`:
  - Valid module entry with `contributes[]` referencing entries in the same registry.
  - Invalid: `category: 'namespace'` should now fail (rename complete).
  - Valid `widget` contribution with `widgetShape.props` JSON Schema fragment.
  - Invalid `widget` missing `widgetShape`.
  - Same for `unit-kind`, `action-intent`, `slot-type`, `validation-mapping-row`, `token-category`.
  - Cross-module conflict fixture: two declared modules contributing same enum value → document fails validation (§4.6).

- [ ] **Step 3: Run** — expect failures.

- [ ] **Step 4: Implement schema rename.** In `registry.schema.json`:
  - `enum: [..., 'namespace', ...]` → `enum: [..., 'module', 'unit-kind', 'widget', 'action-intent', 'slot-type', 'validation-mapping-row', 'token-category', ...]` (drop `namespace`; greenfield, no alias).
  - Replace `namespace.members[]` allOf with `module` allOf gating `contributes` (REQUIRED `string[]`) + `dependencies` (OPTIONAL `ModuleRef[]` via `$ref: common.schema.json#/$defs/ModuleRef`).
  - Add six new `allOf` blocks following the existing `concept`/`vocabulary` gate pattern; each pins one category-specific required payload (`semantics` / `widgetShape` / `validation` / `slotShape` / `row` / `categoryShape`). Inline-author the payload sub-schemas or `$ref` to dedicated files under `schemas/registry-payloads/` (whichever the existing spec prose dictates; default inline).
  - Strip `members[]` references.

- [ ] **Step 5: Update extension-registry.md prose.** Section per §4.1 + §4.2; cite `MODULE-PAYLOAD-SCHEMA-MISMATCH` lint code (Task 5b) and the four-constraint MasterTable demotion (Task 4); section on `oneOf [closed-core, x-pattern]` convention (§4.5) cross-referencing each consuming schema's table row.

- [ ] **Step 6: Rename all `namespace`/`members` fixture data to `module`/`contributes`.** Grep + targeted edits; greenfield posture, no shim.

- [ ] **Step 7: Run** — expect green.

- [ ] **Step 8: Regenerate docs** — `npm run docs:generate && npm run docs:check`.

- [ ] **Step 9: Commit.**

```bash
git commit \
  formspec/schemas/registry.schema.json \
  formspec/crates/formspec-lint/schemas/registry.schema.json \
  formspec/specs/registry/extension-registry.md \
  formspec/tests/test_registry_module_categories.py \
  formspec/tests/fixtures/registry/ \
  $(git diff --name-only formspec/specs formspec/filemap.json) \
  -m "feat(adr-0150): rename namespace→module + add 6 contribution categories (§4.1/§4.2/§4.5/§4.6)"
```

- [ ] **Step 10: Architecture review AFTER** — load-bearing per the goal preamble.

---

## Task 3 — `ComponentBase.extensions` slot

**ADR ref:** §4.7.

**Files:**
- Modify: `formspec/schemas/component.schema.json` (`ComponentBase` ~§195 — add `extensions: { propertyNames: { pattern: "^x-" } }`).
- Modify: `formspec/crates/formspec-lint/schemas/component.schema.json` mirror.
- Update spec prose: `formspec/specs/component/` per existing structure.

- [ ] **Step 1: Failing fixture.** `tests/test_component_extensions.py` — `componentBase` with `x-generation` payload should now validate (spike F2 finding).

- [ ] **Step 2: Run** — expect failure.

- [ ] **Step 3: Add `extensions: { $ref: 'common.schema.json#/$defs/Extensions' }` to `ComponentBase`.** Verify no inadvertent loosening of `additionalProperties`.

- [ ] **Step 4: Run** — expect green.

- [ ] **Step 5: Regenerate docs.**

- [ ] **Step 6: Commit.**

```bash
git commit \
  formspec/schemas/component.schema.json \
  formspec/crates/formspec-lint/schemas/component.schema.json \
  formspec/specs/component/ \
  formspec/tests/test_component_extensions.py \
  formspec/tests/fixtures/component/ \
  $(git diff --name-only formspec/specs formspec/filemap.json) \
  -m "feat(adr-0150): ComponentBase gets extensions slot for ^x-* payloads (§4.7)"
```

- [ ] **Step 7: Code review** — inline `formspec-specs:formspec-scout`.

---

## Task 4 — Bundle Manifest → App Manifest reframe (BREAKING — gate Task 0)

**ADR refs:** §5.2, §5.3 (bundle-unique id), §10 (refactor row 2), §11.2 (BREAKING).

**Precondition:** Task 0 (COMP-BUNDLE-ID-MIGRATION.md) MUST be closed.

**Files:**
- Modify: `formspec/schemas/bundle-manifest.schema.json` — singular `definition`→`definitions: SiblingRef[]` (MAY be empty), singular `registry`→`registries: SiblingRef[]`, add `surface` / `surfaces: SiblingRef[]`, add `modules: ModuleRef[]`, add `sessions: SessionRef[]`. Reframe title as "App Manifest". `$formspecBundle` stays `"1.0"` per ADR §5.2 (the const stays since it's greenfield refactor; if the audit wants a hard pin, this plan upgrades to `"2.0"` and notes in Deviations).
- Modify: `formspec/specs/bundle/bundle-manifest-spec.md` — full reframe; rename file to `formspec/specs/bundle/app-manifest-spec.md` (the spec name changes; the schema `$id` stays for now to avoid URL churn — `app-manifest` slot opens at P1). Note in Deviations if rename is held.
- Modify: every consumer of `definition: { url, version }` (Rust crates, Python validator, TS engine, fixtures, examples) — refactor to `definitions[]` enumerable; no alias.

- [ ] **Step 1: Architecture review BEFORE** — `formspec-specs:formspec-scout` walks every consumer (`grep -r "bundle.definition\b"`, `BundleManifest::definition`, `manifest['definition']`) and reports the consumer surface.

- [ ] **Step 2: Failing fixtures.** Multi-definition bundle (N=2) example + non-form bundle (N=0 definitions) example. Bundle with one Component-`id` collision across the two definitions' Components → expect `COMP-BUNDLE-ID-COLLISION` (test stub now, lint binds in Task 8).

- [ ] **Step 3: Run** — expect failures.

- [ ] **Step 4: Schema refactor.** Apply the §10 row-2 transformations. Use `SiblingRef[]` shape; reuse `MappingRef`/`LocaleRef` patterns. Add `modules: { type: 'array', items: { $ref: 'common.schema.json#/$defs/ModuleRef' } }`. Add `sessions: { type: 'array', items: { $ref: 'common.schema.json#/$defs/SessionRef' } }`. Update `title` and root `description`.

- [ ] **Step 5: Refactor consumers.** Walk the consumer list from Step 1 — Rust crates first (`crates/formspec-changeset`, `crates/formspec-core`, anywhere parsing the manifest), then TS engine, then Python validator, then examples + fixtures. Greenfield: no alias. Update commit msg trail to call out the BREAKING per §11.2.

- [ ] **Step 6: Run** — expect green.

- [ ] **Step 7: Regenerate docs.**

- [ ] **Step 8: Commit (BREAKING).**

```bash
git commit \
  formspec/schemas/bundle-manifest.schema.json \
  formspec/specs/bundle/ \
  $(grep -rl "definition: SiblingRef" formspec/crates formspec/packages formspec/src/formspec) \
  formspec/tests/fixtures/bundle/ formspec/examples \
  $(git diff --name-only formspec/specs formspec/filemap.json) \
  -m "$(cat <<'EOF'
refactor(adr-0150): bundle-manifest → App Manifest (definitions[], registries[], surfaces, modules, sessions) (§5.2/§10)

BREAKING: bundle-manifest schema reframes singular `definition` as `definitions[]`,
singular `registry` as `registries[]`. Adds `surface[s]`, `modules: ModuleRef[]`,
`sessions: SessionRef[]`. Title/prose reframe as App Manifest. Greenfield-prescriptive
per ADR 0150 ratification posture (formspec/CLAUDE.md §"The spec is the source of truth").

Precondition (ADR §5.3 fixture-audit gate) closed in prior commit; report at
formspec/tests/conformance/COMP-BUNDLE-ID-MIGRATION.md.
EOF
)"
```

- [ ] **Step 9: Architecture review AFTER** — BREAKING-class.

---

## Task 5 — `validation-mapping.MasterTable` four-constraint demotion + token-registry retirement + new lint codes

**ADR refs:** §4.2 (MasterTable + payload-validation lint), §4.3 (new lint E603), §5.3 (`COMP-BUNDLE-ID-COLLISION`), §10 (refactor rows 6 + 9).

**Why two tasks bundled:** All three touch the same payload-validation conformance phase and the new lint codes are file-cousins in `specs/lint-codes.json` + `crates/formspec-lint/src/generated/lint_code.rs`.

**Files:**
- Modify: `formspec/schemas/validation-mapping.schema.json` — remove all four `MasterTable` constraints (`const`, `minItems: 5`, `maxItems: 5`, `uniqueItems: true` per ADR §4.2 lines 180–207); keep `items: { $ref: MappingEntry }`.
- Modify: `formspec/specs/lint-codes.json` — add `MODULE-PAYLOAD-SCHEMA-MISMATCH`, `COMP-BUNDLE-ID-COLLISION`, `E603` (module-enum-value unresolved).
- Modify: `formspec/crates/formspec-lint/src/generated/lint_code.rs` — regenerate from `lint-codes.json` (or hand-add following existing pattern).
- Delete: `formspec/schemas/token-registry.schema.json` AND `formspec/schemas/token-registry.json` (the latter looks like a separate registry document, confirm before delete; if it's a fixture, move into `tests/fixtures/legacy-token-registry/` with a NOTE.md).
- Modify: any consumer of token-registry schema (rust, python, ts) — re-route to Registry's `token-category` contributions.

- [ ] **Step 1: Architecture review BEFORE** — `formspec-specs:spec-expert` cross-checks the `MasterTable` four-constraint pin and the canonical 5 rows that re-publish as `x-formspec-core-actions` `validation-mapping-row` contributions (P1 territory, but the closed-core rows themselves must remain authoritative even as a fixture).

- [ ] **Step 2: Failing fixtures.** (a) `MasterTable` with 6 rows now validates structurally. (b) `MasterTable` with 6 rows where the 6th references an undeclared module → `MODULE-PAYLOAD-SCHEMA-MISMATCH`. (c) Component with id collision across bundle → `COMP-BUNDLE-ID-COLLISION` (lint-only; schema-level Task 8 lands the bundle-graph). (d) Document `modules[]` entry resolves no closed-core OR module value → `E603`. (e) Token registry fixture using deleted schema → fixture fails to validate (proves retirement).

- [ ] **Step 3: Run** — expect failures.

- [ ] **Step 4a: Schema demotion.** Remove the four `MasterTable` constraints; keep items-ref.

- [ ] **Step 4b: Lint codes.** Add new entries to `specs/lint-codes.json` with severity, payload shape, fixture refs. Regenerate `lint_code.rs` (per existing build invocation — likely `cargo xtask generate-lint-codes` or equivalent; if no generator, hand-add following the file's pattern + commit a note).

- [ ] **Step 4c: Token-registry retirement.** Delete `schemas/token-registry.schema.json`; reroute consumers to `RegistryEntry` filtered by `category: 'token-category'`. Decide `schemas/token-registry.json` (looks like a separate document file — preserve under `tests/fixtures/legacy-token-registry/` if it's a fixture).

- [ ] **Step 5: Lint implementation.** Implement the three new lint checks in `formspec/crates/formspec-lint/src/` — each follows the existing E60x patterns. Path-target the lint to its source field (e.g. `COMP-BUNDLE-ID-COLLISION` targets `Component.<doc>.<nodePath>.id`).

- [ ] **Step 6: Run** — expect green.

- [ ] **Step 7: Regenerate docs.**

- [ ] **Step 8: Commit (BREAKING — token-registry retirement, MasterTable demotion).**

```bash
git commit \
  formspec/schemas/validation-mapping.schema.json \
  formspec/specs/lint-codes.json \
  formspec/crates/formspec-lint/ \
  formspec/tests/fixtures/lint/ \
  formspec/tests/fixtures/validation-mapping/ \
  $(git ls-files formspec/schemas/token-registry*) \
  $(git diff --name-only formspec/specs formspec/filemap.json) \
  -m "$(cat <<'EOF'
refactor(adr-0150): demote MasterTable 4 constraints, retire token-registry schema, add 3 lint codes (§4.2/§4.3/§5.3/§10)

BREAKING (token-registry retirement): standalone token-registry.schema.json removed; tokens
re-route through Registry's new `token-category` contribution category. Greenfield-prescriptive
per ADR 0150.

BREAKING (MasterTable demotion): const + minItems/maxItems/uniqueItems constraints removed;
table cardinality is now open at the schema layer, closed-per-module-contribution at the
conformance layer. The closed-core 5 rows re-publish as `x-formspec-core-actions`
`validation-mapping-row` contributions in P1; meanwhile they remain the authoritative
canonical fixture under JCS (RFC 8785) byte-equality.

New lint codes:
- MODULE-PAYLOAD-SCHEMA-MISMATCH (§4.2 — contribution-payload validation phase)
- COMP-BUNDLE-ID-COLLISION (§5.3 — bundle-unique node-id invariant; binds in Task 8)
- E603 (§4.3 — module-extensible enum value resolves no closed-core OR module member)
EOF
)"
```

- [ ] **Step 9: Architecture review AFTER** — load-bearing (two BREAKINGs + three new lints).

---

## Task 6 — `posture-declaration` gets `allowedModules` + `allowedActors`

**ADR refs:** §4.4 (admission), §5.4 (actor admission), §10 (refactor row 11).

**Files:**
- Modify: `formspec/schemas/posture-declaration.schema.json` — add `allowedModules: ModuleRef[]` (canonical $def per Task 1) and `allowedActors: string[]` (URN list).
- Modify: `formspec/crates/formspec-lint/schemas/posture-declaration.schema.json` mirror.
- Modify: posture spec prose if it exists.
- Update existing posture-declaration fixtures.

- [ ] **Step 1: Architecture review BEFORE** — pin admission semantics: every field present on the posture entry MUST equal the document entry; absent fields admit any value (§4.4). Verify reviewer agrees this is the cleanest hostile-substitution closure.

- [ ] **Step 2: Failing fixtures.** Posture with `allowedModules: [{ id, version }]` admits document `modules[{ id, version, publisher, lockHash }]` (any publisher/lockHash). Posture with `{ id, version, lockHash }` rejects mismatched-lockHash document entry. `allowedActors` URN absence rejects authoring event from un-listed actor.

- [ ] **Step 3: Run** — expect failures.

- [ ] **Step 4: Schema additions.** Add the two arrays with `$ref` to `common.schema.json#/$defs/ModuleRef` and a URN-pattern string respectively. Document admission semantics in `description`.

- [ ] **Step 5: Admission-rule implementation.** If the lint surface already evaluates posture admission, extend it; if not, the schema-side check is sufficient for now (cite `MODULE-PAYLOAD-SCHEMA-MISMATCH`-cousin lint code if needed, or open a P1 TODO at `formspec/TODO.md` for runtime admission).

- [ ] **Step 6: Run** — expect green.

- [ ] **Step 7: Regenerate docs.**

- [ ] **Step 8: Commit.**

```bash
git commit \
  formspec/schemas/posture-declaration.schema.json \
  formspec/crates/formspec-lint/schemas/posture-declaration.schema.json \
  formspec/specs/ \
  formspec/tests/fixtures/posture/ \
  $(git diff --name-only formspec/specs formspec/filemap.json) \
  -m "feat(adr-0150): posture.allowedModules + allowedActors with field-equality admission (§4.4/§5.4)"
```

- [ ] **Step 9: Architecture review AFTER** — load-bearing (auth-shape).

---

## Task 7 — Uniform `oneOf [closed-core, x-pattern]` enum-extensibility convention

**ADR refs:** §4.5 (enum table), §10 (refactor rows 3/4/5/7/8).

**Why standalone:** §4.5 applies the convention to 9 enums across 5 schemas (Experience.UnitKind, Component.component, Response Actions.intent [already pattern], Trace edge/source/typed-endpoint, RespondentLedger.EventType + ChangeSetEntry.valueClass, MappingTransform / ScreenerStrategy / Changelog.target). Each refactor is mechanical-identical but spans the substrate. Single commit makes the convention reviewable as a unit.

**Files:**
- Modify: `formspec/schemas/experience.schema.json` (UnitKind).
- Modify: `formspec/schemas/component.schema.json` (`component` enum).
- Modify: `formspec/schemas/trace-index.schema.json` (Source.kind, EdgeEntry.kind, TypedEndpoint regex).
- Modify: `formspec/schemas/respondent-ledger-event.schema.json` (EventType, ChangeSetEntry.valueClass).
- Modify: `formspec/schemas/mapping.schema.json` (MappingTransform).
- Modify: `formspec/schemas/screener.schema.json` (ScreenerStrategy).
- Modify: `formspec/schemas/changelog.schema.json` (Changelog.target).
- Modify: `formspec/schemas/response-actions.schema.json` — root-level drift fix: add `patternProperties: {"^x-": {}}` to match peer schemas per ADR §10 row 5.
- Mirror to `crates/formspec-lint/schemas/` for each.
- Add top-level `modules: ModuleRef[]` to each substrate-consuming document schema (Definition, Experience, Response Actions, Component, Surface [P2], Theme, Locale, Mapping) per ADR §4.3.

- [ ] **Step 1: Architecture review BEFORE** — `formspec-specs:spec-expert` verifies the 9-enum scope is complete and the pattern follows Response Actions §53–62 exactly. Also verify the `^x-` regex parity across all 9 sites (no regex drift).

- [ ] **Step 2: Failing fixtures.** Per-enum: closed-core value validates; `x-foo-bar` validates; bare `unknown` rejects.

- [ ] **Step 3: Run** — expect failures.

- [ ] **Step 4: Mechanical refactor.** Use a templated edit pattern — for each enum, wrap in `oneOf: [{ enum: [...closed-core...] }, { type: 'string', pattern: '^x-[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$' }]`. Update spec prose snippets where the enum is documented.

- [ ] **Step 5: Top-level `modules[]`.** For each consuming schema, add a top-level `modules: { type: 'array', items: { $ref: 'common.schema.json#/$defs/ModuleRef' } }` property. NOT required (default-module-set behavior per §4.9 keeps form-only docs validating identically).

- [ ] **Step 6: Response Actions root drift fix.** Add `patternProperties: {"^x-": {}}` per §10 row 5.

- [ ] **Step 7: Run** — expect green; existing form-only fixtures continue to pass (this is the default-module-set proof — no semantic change for them).

- [ ] **Step 8: Regenerate docs.**

- [ ] **Step 9: Commit.**

```bash
git commit \
  formspec/schemas/experience.schema.json formspec/schemas/component.schema.json \
  formspec/schemas/trace-index.schema.json formspec/schemas/respondent-ledger-event.schema.json \
  formspec/schemas/mapping.schema.json formspec/schemas/screener.schema.json \
  formspec/schemas/changelog.schema.json formspec/schemas/response-actions.schema.json \
  formspec/schemas/definition.schema.json formspec/schemas/theme.schema.json \
  formspec/schemas/locale.schema.json \
  formspec/crates/formspec-lint/schemas/ \
  formspec/specs/ \
  formspec/tests/ \
  $(git diff --name-only formspec/specs formspec/filemap.json) \
  -m "feat(adr-0150): uniform oneOf [closed-core, x-pattern] + top-level modules[] across substrate consumers (§4.3/§4.5/§10)"
```

- [ ] **Step 10: Code review** — `formspec-specs:formspec-scout` runs `semi-formal-code-review` since this commit touches 8+ schemas.

---

## Task 8 — Bundle-unique `id` invariant + `COMP-BUNDLE-ID-COLLISION` lint binding (BREAKING — gate Task 0)

**ADR refs:** §5.3, §10 (refactor row 2 — lint binding), §11.2 (BREAKING).

**Precondition:** Task 0 closed.

**Files:**
- Modify: `formspec/schemas/component.schema.json` — `ComponentBase.id` description from per-tree-unique to bundle-unique-when-present; semantic statement (schema can't enforce graph-level uniqueness, the lint does).
- Modify: `formspec/crates/formspec-lint/` — bind the `COMP-BUNDLE-ID-COLLISION` lint added in Task 5 to walk every Component document referenced from a bundle, collect node `id`s, hard-fail on duplicates.
- Modify: `formspec/schemas/bundle-manifest.schema.json` — embed a `$comment` describing the bundle-graph rule (already noted in Task 4 prose; this commit binds the lint pass).
- Author migration tests on the data corrected in Task 0.

- [ ] **Step 1: Architecture review BEFORE** — verify Task 0's migration completely closed collisions, and that the lint binding's "scope" matches §5.3 (bundle-graph reachable from a single App Manifest).

- [ ] **Step 2: Failing fixtures.** Two-component-doc bundle where IDs collide → `COMP-BUNDLE-ID-COLLISION`. Bundle without collisions → green.

- [ ] **Step 3: Run** — expect lint failure (lint binding not yet plumbed).

- [ ] **Step 4: Implement lint binding.** Bundle-graph walk in `formspec-lint`: load App Manifest, resolve every `SiblingRef` to a Component document, parse nodes, build `(id → [doc, nodePath])` index, emit `COMP-BUNDLE-ID-COLLISION` per duplicate.

- [ ] **Step 5: Update component.schema.json `ComponentBase.id` description** — per §5.3, the schema can't enforce graph uniqueness; the documented invariant + lint do.

- [ ] **Step 6: Run** — expect green.

- [ ] **Step 7: Regenerate docs.**

- [ ] **Step 8: Commit (BREAKING — invariant uplift).**

```bash
git commit \
  formspec/schemas/component.schema.json \
  formspec/schemas/bundle-manifest.schema.json \
  formspec/crates/formspec-lint/ \
  formspec/tests/fixtures/lint/COMP-BUNDLE-ID-COLLISION/ \
  $(git diff --name-only formspec/specs formspec/filemap.json) \
  -m "$(cat <<'EOF'
feat(adr-0150): ComponentBase.id uplift per-tree→bundle-unique with COMP-BUNDLE-ID-COLLISION lint (§5.3/§11.2)

BREAKING: Component.id uniqueness scope uplifts from per-tree to bundle-unique-when-present.
Load-bearing for ADR 0151 cross-document move (CRDT bidirectional map relies on no-collision
invariant in the target doc). Precondition fixture-audit gate (§5.3) closed at
formspec/tests/conformance/COMP-BUNDLE-ID-MIGRATION.md.
EOF
)"
```

- [ ] **Step 9: Architecture review AFTER** — BREAKING + invariant-uplift load-bearing for ADR 0151.

---

## Cross-cutting items (folded into the tasks above)

These ADR refactors are touched across the eight tasks rather than getting standalone commits — the task that owns the schema also owns the cross-cut:

| Item | Owned by |
|---|---|
| Document-level `modules: ModuleRef[]` on every consuming schema (§4.3) | Task 7 |
| New lint codes `MODULE-PAYLOAD-SCHEMA-MISMATCH` / `COMP-BUNDLE-ID-COLLISION` / `E603` (§4.2/§4.3/§5.3) | Task 5 (definition) + Task 8 (COMP binding) |
| Locale `$module.<modId>.<nodeId>.<prop>` prefix (§4.10) | Task 7 (Locale schema) |
| Ledger event payload `actor: AuthorActor` (§5.4 / §8) | Task 7 (respondent-ledger-event.schema.json) |
| `respondent-ledger.sessionRefs[]` URN formalization (§5.5 / §10 row 13) | Task 7 (or break out P0.5 if reviewer flags) |
| Response Actions root drift fix — `patternProperties ^x-` (§10 row 5) | Task 7 |
| AI-runtime closed-core 9 `ai.*` event values (§8) | P1 (carry-point only is P0; ai-runtime module ships P4) |

If a reviewer flags the cross-cut as belonging in its own commit, escalate to Deviations and break out before Task 7 lands.

---

## Verification gate (run before P0 done)

- [ ] `npm run docs:generate` — clean.
- [ ] `npm run docs:check` — green.
- [ ] `npm run check:deps` — green.
- [ ] `cargo nextest run --workspace` (from `formspec/`) — green.
- [ ] `python3 -m pytest tests/ -v` — green.
- [ ] `make test` — green (umbrella incl. Playwright E2E).
- [ ] Two scout/expert reviewers (cross-stack-scout + spec-expert, OR formspec-scout + spec-expert) both return zero open findings.
- [ ] Submodule pointer in parent ready for owner-approved push.
- [ ] `formspec/TODO.md` updated with P1 carry-over (republish core vocabularies as modules; AI-runtime module; per-class governance for module widgets [ADR 0152]).

---

## Deviations

(Append-only. Reviewer findings + steering changes land here, not in the ratified ADR.)

- *(empty at plan-write; populate during execution)*

---

## Out of scope for P0 (lives in P1+)

- Republishing core vocabularies as `x-formspec-core-*` modules (§4.9) — P1.
- Surface module (`x-formspec-surface` v0.1) — P2 / ADR §14 P2.
- Non-core modules (`x-formspec-presentation`, `x-formspec-conversation`, `x-formspec-document-viewer`) — P2.
- Studio-core kernel + product MCPs (`formspec-mcp-wireframes`, `formspec-mcp-forms`) — P3.
- `x-formspec-ai-runtime` module behavior — P4 (P0 ships only the carry-points).
- Per-class governance for module widgets — deferred to [ADR 0152](../../../thoughts/adr/0152-multi-actor-authorization-scope.md).

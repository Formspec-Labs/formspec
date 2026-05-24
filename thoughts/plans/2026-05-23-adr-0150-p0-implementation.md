# ADR 0150 §14 P0 Implementation Plan — Formspec as Layered UI Substrate

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax. The normative target is [ADR 0150](../../../thoughts/adr/0150-formspec-as-layered-ui-substrate.md) — this plan is the execution layout, not a re-derivation.

**Goal:** Land the eight §14 P0 substrate refactors against the ratified ADR 0150 — module-aware Registry, per-view Definition grain plumbing, App Manifest reframe, common-schema multi-actor + provenance + module $defs, posture admission, MasterTable demotion, Token Registry schema retirement, and bundle-unique `id` invariant with `COMP-BUNDLE-ID-COLLISION` lint — so the substrate matches the architectural commitments before P1 republishes core vocabularies as modules.

**Architecture:** Greenfield-prescriptive refactor (`formspec/CLAUDE.md` §"The spec is the source of truth"). The ADR ships shapes; we conform existing artifacts to them. No backwards-compat shims, no aliasing — refactor existing code to the new contract per stack feedback policy. Carry-point work (consumers gaining `modules[]`, the uniform `oneOf` enum convention, ledger identity slots) lands BEFORE the BREAKINGs so the BREAKING commits land against a consumer surface that already knows how to declare module intent.

**Tech stack:** JSON Schema 2020-12 (schemas), Markdown (specs), Rust (formspec-lint, formspec-py, formspec-eval, fel-core), TypeScript (formspec-engine, formspec-core, formspec-studio-core), Python (formspec validator + conformance). Build gate: `npm run docs:generate` → `npm run docs:check` → `npm run check:deps` → `cargo nextest run --workspace` → `python3 -m pytest tests/ -v` → `make test` umbrella.

---

## Revision history

- **2026-05-23 r0** — initial plan.
- **2026-05-23 r1** — applied Round-1 remediations from 4 parallel reviews (`spec-expert` normative-fidelity / `formspec-scout` codebase-grounding / `solutions-architect-validator` architecture-sequencing / `cross-stack-scout` cross-stack-seam-impact). Renumbered tasks to put `modules[]` carry-points + uniform `oneOf` enum convention + ledger identity slots BEFORE the bundle-manifest BREAKING; split old Task 5 into MasterTable / token-registry-retirement / lint-code-definitions; fixed `Generation` $def as a superset of existing `x-generation`; corrected `ModuleRef.id` terminology; un-gated old Task 4 from Task 0; expanded token-registry retirement to acknowledge production-runtime consumers; added Deviations for BREAKING-count, cross-stack coordination, formspec-studio cascade, `$formspecBundle` 2.0 bump; added plugin reference-map regen + stack-level filemap regen to the verification gate; added lint-mirror seeding step.
- **2026-05-23 r2** — applied Round-2 remediations. (i) Task 6 authoring-identity field renamed `actor` → `authoredBy: AuthorActor` to avoid name collision with the envelope's existing `actor: Actor` (respondent-identity) — verified against `formspec/schemas/respondent-ledger-event.schema.json` line 65 + existing Trellis fixture `trellis/fixtures/vectors/append/018-attachment-bound/input-formspec-respondent-ledger-event.json`. (ii) Task 8 lint-code shape corrected — `pass` is INT (3 for E603/E604 extension-family, 7 for E605 component-family), `state` is `"tested"` not `"stable"` (verified against `formspec/specs/lint-codes.json` rules[0]). (iii) Task 7 adds explicit step to align `packages/formspec-core/src/project.ts` `export()` return shape with `definitions[]` (Pass 2 silent-divergence finding). (iv) Task 12 token-registry consumer enumeration expanded to include `crates/formspec-lint/src/schema_validation.rs`, `scripts/copy-layout-css-assets.mjs`, `scripts/sync-lint-schemas.mjs`, `packages/formspec-layout/{package.json,src/platform-defaults.ts,src/default-theme.json}`. (v) Task 8 uses `pytest.mark.skip(reason="binding lands in Task 11")` on the E605 fixture so the test suite stays green between Task 8 and Task 11 (Pass 3 finding). (vi) Task 4 Surface-exclusion rationale noted (Surface schema doesn't exist at P0; P2 work). (vii) Task 6 notes locale.schema.json double-touch with Task 4. (viii) BREAKING-count Deviation reframed lead-with-merit. (ix) formspec-studio-mcp vendored `lib/schemas/token-registry.schema.json` enumerated in Deviations §Cross-stack coordination. (x) Generation $def preserves the existing `anchors` pattern enforcement. (xi) formspec/ submodule-pointer held-hostage flag added to Task 13 + formspec/TODO.md (Pass 3 finding). (xii) Verification-gate reference-map list adds `mapping-theme-registry.md` (Pass 4 NIT).

---

## Decision-record reference

The ADR is the best-current-thinking record of the architectural commitments — not infallible authority. **Cite §x.y on every commit** so reviewers can trace intent and verify reasoning without re-reading the ADR. When a finding (or execution discovery) conflicts with the ADR, evaluate on merit: does the cited approach serve reason and user value better than the alternative? If yes, deviate and document; the ratified-ADR text remains a snapshot, the Deviations log captures the live reasoning. The ADR itself is not edited mid-execution; deviations land here.

## Commit discipline

- One P0 work-item per commit; tight schema clusters compose only where ADR §10 says they coordinate (the `common.schema.json` 4-def pass is the only enforced cluster).
- Never `--amend`. Pre-commit-hook failures: fix, re-stage, new commit.
- Specify paths to `git commit <paths> -m` (parallel-craftsmen safety per stack feedback).
- Commit msg shape: `feat(adr-0150): <one-line>` / `refactor(adr-0150): <one-line>` / `test(adr-0150): <one-line>` — always cite the ADR §.
- BREAKING commits MUST use the `BREAKING:` body marker. Task 11 (bundle-unique `id` uplift) gates on Task 0 (closed). Other BREAKINGs (Task 7 bundle-manifest reframe, Task 9 token-registry retirement) DO NOT need Task 0 — that gate binds specifically to the id-uniqueness invariant per ADR §5.3, not to schema reframes.

## Review rhythm

The /goal directive sets the floor — code-review every 3–5 commits, architecture-review at P0 work-item boundaries + before each load-bearing change. Pace based on signal:

- **Inline** after every commit: implementer-agent never self-reviews; spawn a fresh scout/expert running `formspec-specs:semi-formal-code-review` (background subagent when ≥3 files changed).
- **Architecture review** BEFORE every load-bearing commit (three BREAKINGs at Tasks 7/9/11; auth-shape Task 10; coordinated `common.schema.json` 4-def Task 1; token-registry retirement Task 12; each new lint code definition Task 8) via `formspec-specs:semi-formal-architecture-review`. AFTER reviews on BREAKINGs are mandatory; AFTER reviews on non-BREAKING load-bearing changes run when signal warrants (first execution iteration on a novel pattern; not for mechanical repeats).
- **Cadence floor:** at least one code-review subagent per 3–5 commits regardless of size class.
- **Pace down when reviews converge clean.** When a round of plan/code reviews returns only NITs or no findings, compress next round to a single reviewer or skip the AFTER pass for low-risk commits. Don't auto-dispatch on diminishing returns.
- **Every BLOCKER/HIGH fixed; warnings + nits resolved or justified inline.** Reviewer never self-remediates — findings go to a fresh craftsman. Findings the implementer disagrees with after merit-evaluation land in Deviations with the rejection-reasoning.

## Verification (per CLAUDE.md §"Build & commands" + Pass 4 additions)

`make test` is the umbrella but takes minutes. The discrete green-bar set:

1. `npm run docs:generate` — regen BLUF blocks, schema-ref blocks, filemap, `*.llm.md`.
2. `npm run docs:check` — doc-gate (frozen-generated, archive-path, embed freshness).
3. `npm run check:deps` — package-layer fence.
4. `cargo nextest run --workspace` — Rust workspace (formspec-lint, formspec-eval, formspec-py, fel-core, etc.).
5. `python3 -m pytest tests/ -v` — Python conformance.
6. `make test` — full umbrella incl. Playwright E2E and `sync-lint-schemas` pre-step.
7. **Stack-level filemap regen** — `node /Users/mikewolfd/Work/formspec-stack/scripts/generate-filemap.mjs` from stack root, after any new file lands.
8. **Plugin reference-map regen** — `formspec-specs:update-spec-nav` skill (regenerates `.claude-plugin/skills/formspec-specs/references/schemas/*.md`), once after all schema commits land.

Run 1–6 after every commit touching schemas/specs/source. Run 7+8 at end of P0 (or after each schema-altering commit if the implementer prefers).

---

## Task 0 — COMP-BUNDLE-ID fixture audit (DONE, committed `2a178047`)

ADR §5.3 fixture-audit gate. Zero residual collisions across 53 in-scope Component documents in 29 bundles; report at `formspec/tests/conformance/COMP-BUNDLE-ID-MIGRATION.md`. **Gates Task 11 only** (the id-uniqueness BREAKING); does NOT gate Task 7 (bundle-manifest reframe) — that's a structural reframe, not an id-uniqueness uplift.

---

## Task 1 — Coordinated `common.schema.json` 4-def pass

**ADR refs:** §4.4 (ModuleRef), §5.3 (Generation), §5.4 (AuthorActor), §5.5 (SessionRef), §10 (refactor table — "single coordinated refactor pass").

**Why ship as one commit:** Every downstream task (registry rev, posture, ledger, bundle-manifest, surfaces, component, experience) `$ref`s these defs. Stagger forces downstream specs to invent placeholder shapes mid-week.

**Files:**
- Modify: `formspec/schemas/common.schema.json`
- No `crates/formspec-lint/schemas/common.schema.json` mirror exists today (only 25 of ~33 schemas are mirrored; common.schema.json is not among them — confirmed by Pass 2 codebase grounding). Schema-mirror is therefore N/A for this task.
- Create: `formspec/tests/conformance/common-schema-defs/` fixtures (valid + invalid per $def).
- Modify: `formspec/specs/common/` prose if it exists; else inline the BLUF in adjacent canonical spec doc.

- [ ] **Step 1: Architecture review BEFORE.** Dispatch `formspec-specs:spec-expert` running `semi-formal-architecture-review` to cross-check the ADR's §10 shapes against current `common.schema.json` $defs and surface any conflicts before authoring.

- [ ] **Step 2: Enumerate existing `x-generation` field set.** `grep -n '"x-generation"' formspec/schemas/component.schema.json` and read lines 240–282 (the inline shape). Confirmed superset target: `source`, `strategy`, `generatedBy`, `generatedAt`, `anchors`, plus today's `additionalProperties: true`. The new `Generation` $def MUST be a superset of these so existing `x-generation` payloads continue to validate.

- [ ] **Step 3: Write failing fixtures.** For each of `Generation`, `AuthorActor`, `SessionRef`, `ModuleRef`, create one valid example + ≥2 invalid examples that exercise the closed-enum invariants (e.g. `AuthorActor.kind` outside `{human, ai-agent, service}`, `AuthorActor.actChannel` outside `{human, mcp, agent, service}`, `ModuleRef` missing `id`/`version`, `SessionRef.actors` non-URN). Additionally: a fixture stamping existing `x-generation` payload shape (with `source` / `strategy` / `generatedAt` / `anchors`) MUST validate against the new `Generation` $def (superset proof). Wire into the Python conformance suite under `tests/test_common_schema_defs.py`.

- [ ] **Step 4: Verify fixtures fail** — `python3 -m pytest tests/test_common_schema_defs.py -v` (defs don't exist yet).

- [ ] **Step 5: Author the four $defs.** Per ADR §10 row-by-row:

```jsonc
// common.schema.json $defs additions

"ModuleRef": {
  "type": "object",
  "required": ["id", "version"],
  "additionalProperties": false,
  "properties": {
    "id":        { "type": "string", "pattern": "^x-[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$",
                   "description": "Module ID (Registry naming pattern per ADR 0150 §4.8). Despite ADR §4.4 prose calling this a 'URN', the ADR §4.3 examples and §4.8 regex are bare ^x- prefix (e.g. 'x-formspec-core-task'); this pattern matches the canonical regex." },
    "version":   { "type": "string", "minLength": 1,
                   "description": "Strict SemVer or range expression." },
    "publisher": { "type": "string", "format": "uri",
                   "description": "OPTIONAL provenance assertion (the document asserts; posture admission checks)." },
    "lockHash":  { "type": "string", "pattern": "^[a-z0-9]+:[A-Za-z0-9+/=]+$",
                   "description": "OPTIONAL digest pin (e.g. 'sha256:...'). Pins hostile-substitution risk when paired with posture allowedModules[]." },
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
                    "description": "Stable actor URN (urn: scheme; product nuance rides URN-encoded into id, e.g. urn:formspec:actor:mcp:wireframes:...)." },
    "kind":       { "type": "string", "enum": ["human", "ai-agent", "service"],
                    "description": "Terminal-closed per §5.4 (not §4.5-extensible)." },
    "actChannel": { "type": "string", "enum": ["human", "mcp", "agent", "service"],
                    "description": "Terminal-closed per §5.4; orthogonal to kind." },
    "display":    { "type": "string" },
    "extensions": { "$ref": "#/$defs/Extensions" }
  },
  "description": "Authoring identity per ADR 0150 §5.4. Distinct from respondent-ledger-event.Actor (respondent-identity) and experience.Actor (workflow-role) — three Actor $defs by design."
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
  "description": "App Manifest session index entry per ADR 0150 §5.5."
},

"Generation": {
  "type": "object",
  "description": "Generalized x-generation provenance carrier per ADR 0150 §5.3/§5.4. SUPERSET of the existing inline x-generation shape at component.schema.json:240–282 — all pre-existing fields (source/strategy/generatedBy/generatedAt/anchors) remain valid; new fields layered on top.",
  "properties": {
    "source":       { "type": "string", "description": "Existing field: free-form source label (preserved for migration compatibility)." },
    "strategy":     { "type": "string", "description": "Existing field: generation strategy label (preserved)." },
    "generatedAt":  { "type": "string", "format": "date-time", "description": "Existing field: stamping timestamp (preserved)." },
    "anchors":      {
      "type": "object",
      "description": "Existing field: anchor map (see ADR §5.3 anchor-uniqueness invariant). Preserved with original pattern enforcement.",
      "additionalProperties": { "type": "string" },
      "propertyNames": { "pattern": "^(item|unit|task|action|concept):.+$" }
    },
    "generatedBy": {
      "oneOf": [
        { "type": "string" },
        { "$ref": "#/$defs/AuthorActor" }
      ],
      "description": "Actor attribution per §5.4. Migrates the existing free-form string field (component.schema.json:264) to a structured-or-string union; pre-existing string values continue to validate."
    },
    "sourceModule": {
      "$ref": "#/$defs/ModuleRef",
      "description": "Module/template provenance per §5.3 (orthogonal to generatedBy — answers 'which module supplied this template' not 'who authored this op')."
    },
    "movedFrom":  { "$ref": "#/$defs/CrossComponentRef",
                    "description": "Set by tooling on cross-Component move per §5.3." },
    "copiedFrom": { "$ref": "#/$defs/CrossComponentRef",
                    "description": "Set by tooling on cross-Component copy per §5.3." },
    "extensions": { "$ref": "#/$defs/Extensions" }
  }
  // NOTE: NO additionalProperties: false. Existing x-generation has additionalProperties: true.
  // The Extensions $def already constrains the ^x- shape; broader payloads stay open for
  // tool-layer use. If a future P1+ task wants to tighten, it does so as its own ADR-cited
  // refactor, not as a silent side-effect of this $def addition.
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

- [ ] **Step 6: Verify fixtures pass** — `python3 -m pytest tests/test_common_schema_defs.py -v` (green; existing x-generation fixtures continue to validate as the superset proof).

- [ ] **Step 7: Regenerate docs** — `npm run docs:generate && npm run docs:check`.

- [ ] **Step 8: Commit.**

```bash
git commit \
  formspec/schemas/common.schema.json \
  formspec/tests/conformance/common-schema-defs/ \
  formspec/tests/test_common_schema_defs.py \
  $(git diff --name-only formspec/specs formspec/filemap.json) \
  -m "feat(adr-0150): add common.schema $defs ModuleRef/AuthorActor/SessionRef/Generation (§4.4/§5.3/§5.4/§5.5)"
```

- [ ] **Step 9: Architecture review AFTER** — `formspec-specs:spec-expert` running `semi-formal-architecture-review` (load-bearing — every downstream task references these $defs).

---

## Task 2 — Registry rev: `namespace`→`module` + six contribution categories

**ADR refs:** §4.1, §4.2, §4.6, §10 (refactor row 1).

**Files:**
- Modify: `formspec/schemas/registry.schema.json` (rename `namespace`→`module`; add `contributes`/`dependencies`; add six contribution categories with `allOf` gates).
- Modify: `formspec/specs/registry/extension-registry.md`.
- Modify: `formspec/crates/formspec-lint/schemas/registry.schema.json` (mirror is present in current crate; sync via `npm run sync-lint-schemas` after edit).
- Update inline examples in `registry.schema.json` lines 64–127 (the schema's own examples use `category: 'namespace'` / `members: [...]` per Pass 2 codebase finding).
- Sweep live registries: `grep -rln "namespace" formspec/registries/ 2>/dev/null` — every live registry document using the old category needs migration.
- Sweep registry-using fixtures: `grep -rln "\"category\":\\s*\"namespace\"" formspec/tests/` — same rule.

- [ ] **Step 1: Architecture review BEFORE** — `formspec-specs:spec-expert` cross-checks the six contribution categories against §4.2's payload-shape pins and ADR §9 conformance-partitioning. Verify the `allOf` gate names line up with existing `concept`/`vocabulary` precedent.

- [ ] **Step 2: Enumerate existing `members[]` and `namespace` consumers.**
  - Grep: `grep -rn '"namespace"' formspec/schemas/registry.schema.json formspec/registries/ formspec/tests/ formspec/specs/registry/` — confirms scope.
  - Note: registry.schema.json `members` is BOTH a top-level property (lines 445–455 per Pass 2) AND an `allOf` gate. Both must change.

- [ ] **Step 3: Failing fixtures.** `tests/test_registry_module_categories.py`:
  - Valid module entry with `contributes[]` referencing entries in the same registry.
  - Invalid: `category: 'namespace'` now fails (rename complete).
  - Valid `widget` contribution with `widgetShape.props` schema fragment.
  - Invalid `widget` missing `widgetShape`.
  - Same for `unit-kind`, `action-intent`, `slot-type`, `validation-mapping-row`, `token-category`.
  - Cross-module conflict fixture: two declared modules contributing same enum value → document fails validation (§4.6).

- [ ] **Step 4: Run** — expect failures.

- [ ] **Step 5: Implement schema rename + category additions.** In `registry.schema.json`:
  - Drop `'namespace'` from the `category` enum (line 246 area); add `'module'`, `'unit-kind'`, `'widget'`, `'action-intent'`, `'slot-type'`, `'validation-mapping-row'`, `'token-category'`.
  - Delete the top-level `members` property block (lines 445–455).
  - Replace the old `namespace` `allOf` with a new `module` `allOf` gating `contributes` (REQUIRED `string[]`) + `dependencies` (OPTIONAL `array` of `$ref: 'common.schema.json#/$defs/ModuleRef'`).
  - Add six new `allOf` blocks following the existing `concept`/`vocabulary` gate pattern; each pins one category-specific required payload (`semantics` / `widgetShape` / `validation` / `slotShape` / `row` / `categoryShape`). Inline-author the payload sub-schemas (default) unless the existing spec prose specifies otherwise.
  - Update inline examples (lines 64–127) to use `category: 'module'` / `contributes: [...]`.

- [ ] **Step 6: Update extension-registry.md prose.** Section per §4.1 + §4.2; cite `MODULE-PAYLOAD-SCHEMA-MISMATCH` and `E603` lint codes (Task 8); note the four-constraint MasterTable demotion in Task 6.

- [ ] **Step 7: Migrate live registries.** Every `formspec/registries/*.registry.json` consumer of `category: 'namespace'` → migrate to `category: 'module'` with `contributes[]` reshape. Pass 2 noted this dir likely has live docs.

- [ ] **Step 8: Run** — expect green.

- [ ] **Step 9: Regenerate docs + sync lint mirror** — `npm run docs:generate && npm run sync-lint-schemas && npm run docs:check`.

- [ ] **Step 10: Commit.**

```bash
git commit \
  formspec/schemas/registry.schema.json \
  formspec/crates/formspec-lint/schemas/registry.schema.json \
  formspec/specs/registry/extension-registry.md \
  formspec/tests/test_registry_module_categories.py \
  formspec/tests/fixtures/registry/ \
  formspec/registries/ \
  $(git diff --name-only formspec/specs formspec/filemap.json) \
  -m "feat(adr-0150): rename namespace→module + add 6 contribution categories (§4.1/§4.2/§4.6)"
```

- [ ] **Step 11: Architecture review AFTER** — load-bearing.

---

## Task 3 — `ComponentBase.extensions` slot

**ADR ref:** §4.7.

**Files:**
- Modify: `formspec/schemas/component.schema.json` (`ComponentBase` ~§195).
- Modify: `formspec/crates/formspec-lint/schemas/component.schema.json` (mirror present).
- Update spec prose if applicable.

- [ ] **Step 1: Failing fixture** — `tests/test_component_extensions.py`: a `ComponentBase` with `x-formspec-foo: { ... }` payload validates.

- [ ] **Step 2: Run** — fail.

- [ ] **Step 3: Add `extensions: { $ref: 'common.schema.json#/$defs/Extensions' }` to `ComponentBase`.** Verify no inadvertent loosening of `additionalProperties`.

- [ ] **Step 4: Run** — green.

- [ ] **Step 5: Regenerate docs + sync lint mirror.**

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

## Task 4 — Top-level `modules[]` on every substrate-consuming schema (non-breaking carrier-point)

**ADR refs:** §4.3 (document-level modules declaration), §4.9 (default-module-set behavior preserves form-only docs).

**Why this lands BEFORE bundle-manifest reframe (Task 7):** Task 7's App Manifest declares `modules: ModuleRef[]` and asserts coherence: "every declared module resolves" (§5.2). That coherence rule presumes every consuming-document schema can carry its own `modules[]` declaration. Landing Task 7 before this task would force fixtures to declare modules against documents whose schemas can't yet validate the field.

**Files:**
- Modify: `formspec/schemas/definition.schema.json`, `experience.schema.json`, `component.schema.json`, `response-actions.schema.json`, `theme.schema.json`, `locale.schema.json`, `mapping.schema.json` — add top-level `modules: { type: 'array', items: { $ref: 'common.schema.json#/$defs/ModuleRef' } }` property (NOT required).
- Mirror to `formspec/crates/formspec-lint/schemas/` for files that have a mirror; for non-mirrored files, do not invent a mirror (see Deviations §Lint-mirror seeding).
- Update spec prose pointing to the new optional field.

**Surface excluded from this sweep.** ADR §4.3 names Surface among the substrate-consuming documents that gain `modules[]`. `formspec/schemas/surface.schema.json` does not exist at P0 — the Surface module ships at P2 (ADR §14 P2). When Surface lands, the P2 task adds `modules[]` to its schema; not in scope here.

- [ ] **Step 1: Failing fixtures.** Each consuming-doc schema gains a fixture with `modules: [{ id: 'x-formspec-core-task', version: '^1.0.0' }]` that validates; existing form-only fixtures (no `modules`) continue to validate identically (the default-module-set proof per ADR §4.9).

- [ ] **Step 2: Run** — fail.

- [ ] **Step 3: Add top-level `modules[]`** to each schema. Default-not-required behavior preserves backward compat for every existing fixture.

- [ ] **Step 4: Run** — green; existing form-only fixtures pass.

- [ ] **Step 5: Regenerate docs + sync lint mirror.**

- [ ] **Step 6: Commit.**

```bash
git commit \
  formspec/schemas/definition.schema.json formspec/schemas/experience.schema.json \
  formspec/schemas/component.schema.json formspec/schemas/response-actions.schema.json \
  formspec/schemas/theme.schema.json formspec/schemas/locale.schema.json \
  formspec/schemas/mapping.schema.json \
  formspec/crates/formspec-lint/schemas/ \
  formspec/specs/ formspec/tests/ \
  $(git diff --name-only formspec/specs formspec/filemap.json) \
  -m "feat(adr-0150): top-level modules: ModuleRef[] on substrate-consuming schemas (§4.3/§4.9)"
```

- [ ] **Step 7: Code review** — inline.

---

## Task 5 — Uniform `oneOf [closed-core, x-pattern]` enum convention + Response Actions root drift fix

**ADR refs:** §4.5 (enum table — 9 enums), §10 (refactor rows 3/4/5/7/8).

**Why standalone:** §4.5 applies the convention to 9 enums across 7 schemas. Each refactor is mechanical-identical but spans the substrate. Single commit makes the convention reviewable as a unit. Lands BEFORE Task 7 BREAKING because the App Manifest's `surfaces` field references slot types that ride this convention.

**Files (per ADR §4.5 table):**
- `formspec/schemas/experience.schema.json` — `UnitKind` (§175).
- `formspec/schemas/component.schema.json` — `component` enum (§283).
- `formspec/schemas/trace-index.schema.json` — `Source.kind` (§72), `EdgeEntry.kind` (§151), `TypedEndpoint` regex (§136).
- `formspec/schemas/respondent-ledger-event.schema.json` — `EventType` (§295), `ChangeSetEntry.valueClass` (§416).
- `formspec/schemas/mapping.schema.json` — `MappingTransform`.
- `formspec/schemas/screener.schema.json` — `ScreenerStrategy`.
- `formspec/schemas/changelog.schema.json` — `Changelog.target`.
- `formspec/schemas/response-actions.schema.json` — root-level drift fix per ADR §10 row 5: add `patternProperties: {"^x-": {}}` at root.
- Lint mirrors per existing mirror set.

- [ ] **Step 1: Architecture review BEFORE** — `formspec-specs:spec-expert` verifies the 9-enum scope is complete; the pattern follows Response Actions §53–62 exactly; the `^x-` regex parity across all 9 sites (no regex drift).

- [ ] **Step 2: Failing fixtures.** Per-enum: closed-core value validates; `x-foo-bar` validates; bare `unknown` rejects. Plus: Response Actions document with `x-foo` root key validates (drift fix).

- [ ] **Step 3: Run** — fail.

- [ ] **Step 4: Mechanical refactor.** For each enum, wrap in `oneOf: [{ enum: [...closed-core...] }, { type: 'string', pattern: '^x-[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$' }]`. Update spec prose snippets where the enum is documented.

- [ ] **Step 5: Response Actions root drift fix** — add `patternProperties: {"^x-": {}}` at root (§10 row 5).

- [ ] **Step 6: Run** — green; existing form-only fixtures continue to pass.

- [ ] **Step 7: Regenerate docs + sync lint mirror.**

- [ ] **Step 8: Commit.**

```bash
git commit \
  formspec/schemas/experience.schema.json formspec/schemas/component.schema.json \
  formspec/schemas/trace-index.schema.json formspec/schemas/respondent-ledger-event.schema.json \
  formspec/schemas/mapping.schema.json formspec/schemas/screener.schema.json \
  formspec/schemas/changelog.schema.json formspec/schemas/response-actions.schema.json \
  formspec/crates/formspec-lint/schemas/ \
  formspec/specs/ formspec/tests/ \
  $(git diff --name-only formspec/specs formspec/filemap.json) \
  -m "feat(adr-0150): uniform oneOf [closed-core, x-pattern] across 9 substrate enums + RA root drift fix (§4.5/§10)"
```

- [ ] **Step 9: Code review** — `formspec-specs:formspec-scout` runs `semi-formal-code-review` (touches 8+ schemas).

---

## Task 6 — Ledger identity carrier + Locale module addressing

**ADR refs:** §5.4 (ledger event authoring identity), §5.5 (`respondent-ledger.sessionRefs[]` URN formalization), §4.10 (Locale `$module.<modId>.<nodeId>.<prop>` prefix), §8 (AI carry-points).

**Why standalone:** These were "cross-cuts" in r0; reviewers correctly flagged that they need explicit-step coverage, not hand-off to Task 7. Three logically-coupled identity/addressing rewrites in one commit.

**Field-name resolution (r2 — addresses Pass 4 R2 Trellis-fixture concern).** ADR §5.4 prose literally says "Ledger event payloads carry `actor: AuthorActor`," but the envelope's existing top-level `actor: { $ref: Actor }` field (`respondent-ledger-event.schema.json:65`) already holds respondent-identity (`kind: respondent|delegate|system|support-agent|unknown`). The existing Trellis fixture `trellis/fixtures/vectors/append/018-attachment-bound/input-formspec-respondent-ledger-event.json` uses this envelope `actor` with `kind: "respondent"` — naming the new authoring-identity field `actor` too would collide and break the fixture corpus + every Trellis consumer of the schema. Resolving on merit (the ADR's *intent* is "authoring events carry their authoring actor"), this plan adds a new envelope-level top-level field `authoredBy: { $ref: AuthorActor }` rather than overloading `actor`. The existing envelope `actor` (respondent-identity) is unchanged; `authoredBy` is required when `eventType` matches `^(ai\.|user\.)` and optional/absent otherwise. The ADR's prose is interpreted, not edited.

**Files:**
- Modify: `formspec/schemas/respondent-ledger-event.schema.json` — add new envelope-level top-level optional field `authoredBy: { $ref: 'common.schema.json#/$defs/AuthorActor' }`. Add an `if/then` conditional that requires `authoredBy` when `eventType` matches the authoring-event pattern (`^(ai\.|user\.)` or any `^x-` event published as an authoring event by an `^x-`-contributing module). Envelope-level existing `actor: { $ref: Actor }` (respondent-identity per §328) is untouched.
- Modify: `formspec/schemas/respondent-ledger.schema.json` — `sessionRefs[]` formalized from `string[]` to URN references resolving against App Manifest `sessions[]` (§5.5). Update item shape to `{ type: 'string', pattern: '^urn:formspec:session:.+' }` and update field description to pin the cross-ref contract.
- Modify: `formspec/schemas/locale.schema.json` — key-pattern surgery to admit `$module.<modId>.<nodeId>.<prop>` as a sixth prefix alongside the existing five (`$form.` / `$shape.` / `$page.` / `$optionSet.` / `$component.<id>.<prop>` per locale.schema.json:125–128 `propertyNames.pattern` mechanism). **Note: locale.schema.json was also modified in Task 4 (top-level `modules[]` addition); this commit extends it further — work from the Task 4 state.**
- Mirror per existing mirror set.

- [ ] **Step 1: Architecture review BEFORE** — `formspec-specs:spec-expert` verifies the three carrier shapes against §5.4/§5.5/§4.10 AND the `authoredBy` rename rationale; cross-check the Trellis fixture corpus stays valid (envelope `actor` unchanged means `kind: 'respondent'` still validates).

- [ ] **Step 2: Failing fixtures.**
  - Authoring event (`eventType: 'ai.command-issued'`) without `authoredBy` → fails.
  - Authoring event with `authoredBy: { id: 'urn:formspec:actor:ai-agent:wireframes-mcp', kind: 'ai-agent', actChannel: 'mcp' }` → validates.
  - Non-authoring event (`eventType: 'attachment.added'`) without `authoredBy` → validates (field optional).
  - Existing Trellis-shape envelope (`actor.kind: 'respondent'`, no `authoredBy`, `eventType: 'attachment.added'`) → validates (regression-proof against the Trellis fixture corpus).
  - Ledger with `sessionRefs: ['urn:formspec:session:abc']` validates; with `sessionRefs: ['plain-string']` rejects.
  - Locale doc with `'$module.x-formspec-conversation.chatThread.label': 'Threads'` validates; with `'$bogus.foo.bar': 'x'` still rejects.

- [ ] **Step 3: Run** — fail.

- [ ] **Step 4: Implement.**
  - respondent-ledger-event: add envelope-level `authoredBy: { $ref: 'common.schema.json#/$defs/AuthorActor' }`. Add an `if/then` block at root: `if: { properties: { eventType: { pattern: '^(ai\\.|user\\.)' } } }, then: { required: ['authoredBy'] }`. Spec prose distinguishes the two identities: envelope `actor` answers "in what respondent context did this event happen?" (envelope-level Actor, respondent-identity); envelope `authoredBy` answers "who issued the authoring op?" (AuthorActor, authoring-identity).
  - respondent-ledger.sessionRefs: tighten items to URN pattern; update description.
  - locale: extend `propertyNames.pattern` to include the `$module.<modId>.<nodeId>.<prop>` form. modId follows §4.8 `^x-` regex; nodeId and prop are free-form identifiers.

- [ ] **Step 5: Run** — green.

- [ ] **Step 6: Regenerate docs + sync lint mirror.**

- [ ] **Step 7: Commit.**

```bash
git commit \
  formspec/schemas/respondent-ledger-event.schema.json \
  formspec/schemas/respondent-ledger.schema.json \
  formspec/schemas/locale.schema.json \
  formspec/crates/formspec-lint/schemas/ \
  formspec/specs/ formspec/tests/ \
  $(git diff --name-only formspec/specs formspec/filemap.json) \
  -m "feat(adr-0150): ledger event authoredBy: AuthorActor + sessionRefs URN + Locale \$module prefix (§5.4/§5.5/§4.10)"
```

- [ ] **Step 8: Code review** — `formspec-specs:formspec-scout` runs `semi-formal-code-review` (cross-stack-sensitive: ledger schemas are consumed by Trellis fixture corpus + formspec-web; see Deviations §Cross-stack coordination). The `authoredBy` rename keeps the Trellis fixture corpus valid by construction — the schema-conformance test exercises this directly via the regression fixture in Step 2.

---

## Task 7 — BREAKING: Bundle Manifest → App Manifest reframe

**ADR refs:** §5.2, §10 (refactor row 2), §11.2 (BREAKING).

**Precondition:** NONE from Task 0 (Task 0's gate binds Task 11, not this task; Task 4 must have landed so consuming-doc schemas can carry `modules[]` declarations).

**Files:**
- Modify: `formspec/schemas/bundle-manifest.schema.json` — singular `definition`→`definitions: SiblingRef[]` (MAY be empty), singular `registry`→`registries: SiblingRef[]`, add `surface`/`surfaces: SiblingRef[]`, add `modules: ModuleRef[]`, add `sessions: SessionRef[]`. **Bump `$formspecBundle` const to `"2.0"`** (decided in Deviations — BREAKING reframe deserves a hard version pin so strict-validating consumers fail-loud rather than silently mis-parse). Reframe `title` as "App Manifest".
- Modify: `formspec/specs/bundle/bundle-manifest-spec.md` — full reframe; rename file to `formspec/specs/bundle/app-manifest-spec.md` (in-tree). Update doc gate references.
- Per Pass 2 codebase grounding: **no code-level consumer of `bundle-manifest.schema.json` exists today.** The "refactor every consumer" framing in r0 was misleading. Real consumer surface:
  - `formspec/tests/conformance/schemas/test_bundle_manifest_schema.py` (Python schema-conformance test).
  - `formspec/tests/conformance/fixtures/bundle/` (if present) + `tests/e2e/fixtures/kitchen-sink-holistic/bundle.json` (one existing fixture).
  - `formspec/tests/conformance/fixtures/regeneration-merge/` (paused plan, no active dependency).
  - **Parallel `project.export()` shape** at `formspec/packages/formspec-core/src/project.ts` returns `{ definition, component, theme, mappings }` (SINGULAR `definition`) consumed by `packages/formspec-core/tests/queries.test.ts:1442-1456`, `e2e.test.ts:53`, `export-schema-validity.test.ts:26`. This is a TypeScript export shape that mirrors the OLD bundle-manifest design without schema validation — Pass 2 (R2 HIGH-2) flagged this as silent-divergence risk per formspec `CLAUDE.md` §Development Philosophy ("silent disagreement between layers is architectural debt"). Task 7 includes a step to align this return type with the new `definitions[]` shape (see Step 6 below).
  - Studio-side bundle export at `formspec-studio/packages/formspec-studio/src/lib/export-zip.ts` — out of scope per Deviations §formspec-studio cascade.

- [ ] **Step 1: Architecture review BEFORE** — `formspec-specs:formspec-scout` walks the actual consumer surface (grep `BundleManifest`/`bundle.definition`/`manifest.definition` across `formspec/crates`, `formspec/packages`, `formspec/src/formspec`). Confirm scope; surface anything missed.

- [ ] **Step 2: Failing fixtures.** (a) Multi-definition bundle (N=2) example. (b) Non-form bundle (N=0 definitions) example. (c) Bundle declaring `modules: [...]` with a registered ModuleRef. (d) Bundle with `$formspecBundle: "1.0"` now rejects (require `"2.0"`).

- [ ] **Step 3: Run** — fail.

- [ ] **Step 4: Schema refactor.** Apply the §10 row-2 transformations + the 2.0 const-bump. Use `SiblingRef[]` shape; reuse `MappingRef`/`LocaleRef` patterns. Add `modules: { type: 'array', items: { $ref: 'common.schema.json#/$defs/ModuleRef' } }`. Add `sessions: { type: 'array', items: { $ref: 'common.schema.json#/$defs/SessionRef' } }`. Update `title`, root `description`, `$formspecBundle.const` and `$formspecBundle.examples`.

- [ ] **Step 5: Update Python conformance test.** `tests/conformance/schemas/test_bundle_manifest_schema.py` follows the new shape. Migrate existing fixtures to the new shape (or add new ones; existing single-`definition` fixtures need to become `definitions[]: [...]`).

- [ ] **Step 6: Align `project.export()` return type** in `formspec/packages/formspec-core/src/project.ts` from singular `{ definition, component, theme, mappings }` to `{ definitions, component, theme, mappings }`. Update consumer tests at `packages/formspec-core/tests/queries.test.ts:1442-1456`, `e2e.test.ts:53`, `export-schema-validity.test.ts:26` to follow the new shape. This closes the silent-divergence risk Pass 2 (R2 HIGH-2) flagged; the in-memory shape now mirrors the schema's `definitions[]`.

- [ ] **Step 6b: Spec rename.** `mv formspec/specs/bundle/bundle-manifest-spec.md formspec/specs/bundle/app-manifest-spec.md`; update internal references; update doc-generation pointers if any.

- [ ] **Step 7: Run** — green.

- [ ] **Step 8: Regenerate docs + sync lint mirror.** If `bundle-manifest.schema.json` is not currently mirrored under `crates/formspec-lint/schemas/` (Pass 2: it's NOT), do not add a mirror in this commit; mirror seeding is its own action (see Deviations §Lint-mirror seeding).

- [ ] **Step 9: Commit (BREAKING).**

```bash
git commit \
  formspec/schemas/bundle-manifest.schema.json \
  formspec/specs/bundle/ \
  formspec/tests/conformance/schemas/test_bundle_manifest_schema.py \
  formspec/tests/ formspec/examples \
  $(git diff --name-only formspec/specs formspec/filemap.json) \
  -m "$(cat <<'EOF'
refactor(adr-0150): bundle-manifest → App Manifest with $formspecBundle 2.0 bump (§5.2/§10/§11.2)

BREAKING: bundle-manifest schema reframes singular `definition` as `definitions[]`,
singular `registry` as `registries[]`. Adds `surface[s]`, `modules: ModuleRef[]`,
`sessions: SessionRef[]`. Title/prose reframe as App Manifest. $formspecBundle
const bumps "1.0" → "2.0" so strict-validating consumers fail-loud rather than
silently mis-parse a structurally-different document. Greenfield-prescriptive
per ADR 0150 ratification posture.

No code-level consumer of the schema exists today; the migration scope is the
Python schema-conformance test + in-repo fixtures. Studio-side bundle export
(formspec-studio) is post-P0 cascade per Deviations.
EOF
)"
```

- [ ] **Step 10: Architecture review AFTER** — BREAKING-class.

---

## Task 8 — Three new lint codes (definitions only)

**ADR refs:** §4.2 (`MODULE-PAYLOAD-SCHEMA-MISMATCH`), §4.3 (`E603` module-enum-unresolved), §5.3 (`COMP-BUNDLE-ID-COLLISION`).

**Why standalone (split from r0 Task 5):** Pass 2 (codebase grounding) flagged the r0 plan named codes by title rather than `Exxx` numeric ID, and didn't specify the full lint-code shape `{code, pass, severity, title, specRef, suggestedFix, fixtures, state}` per `specs/lint-codes.json:rules[0]`. Defining new codes is its own coherent unit; binding them to passes happens here (for E603 / MODULE-PAYLOAD-SCHEMA-MISMATCH) and in Task 11 (for COMP-BUNDLE-ID-COLLISION).

**Files:**
- Modify: `formspec/specs/lint-codes.json` — three new rules following the existing shape.
- Modify (auto-regenerated): `formspec/crates/formspec-lint/src/generated/lint_code.rs` — regenerated by `scripts/generate-lint-codes.mjs` (wired into `docs:generate` per Pass 2).
- Implement lint passes for `E603` (module-enum value resolution: walk every enum-extensible enum value in a document, verify resolution against closed-core OR a declared module's contributions) and `MODULE-PAYLOAD-SCHEMA-MISMATCH` (cross-validate consuming-document values against the contributing module's payload shape — Theme `widgetConfig` against `widgetShape.props`, Surface slot bindings against `slotShape`, etc.). `COMP-BUNDLE-ID-COLLISION` lint pass binds in Task 11.

**Numeric codes + pass + state (verified against `specs/lint-codes.json` at HEAD — `pass` is INT 1–9; `state` is `"tested"` uniformly; E600–E602 extension-family codes use `pass: 3`).** The three new codes:
- E603 — extension/registry resolution family → `pass: 3` (same family as E600/E601/E602).
- E604 — extension/registry payload validation family → `pass: 3`.
- E605 — bundle-aware component invariant → `pass: 7` (component pass, extended to bundle-graph scope).

```jsonc
// specs/lint-codes.json additions

{
  "code": "E603",
  "pass": 3,
  "severity": "error",
  "title": "Module-extensible enum value resolves no closed-core OR declared-module contribution",
  "specRef": "thoughts/adr/0150-formspec-as-layered-ui-substrate.md#43-document-level-modules-declaration",
  "suggestedFix": "add the contributing module to the document's `modules[]` declaration, or change the value to a closed-core member of the enum",
  "fixtures": ["tests/fixtures/lint/E603-module-enum-unresolved.json"],
  "state": "tested"
},
{
  "code": "E604",
  "pass": 3,
  "severity": "error",
  "title": "Module contribution payload mismatches the contributing module's declared payload schema (MODULE-PAYLOAD-SCHEMA-MISMATCH)",
  "specRef": "thoughts/adr/0150-formspec-as-layered-ui-substrate.md#42-new-contribution-categories",
  "suggestedFix": "align the consuming-document value to the contributing module's payload schema (widget.widgetShape.props, slot-type.slotShape, unit-kind.semantics, validation-mapping-row.row, or token-category.categoryShape)",
  "fixtures": ["tests/fixtures/lint/E604-module-payload-schema-mismatch.json"],
  "state": "tested"
},
{
  "code": "E605",
  "pass": 7,
  "severity": "error",
  "title": "Component node id collides with another node in the bundle (COMP-BUNDLE-ID-COLLISION)",
  "specRef": "thoughts/adr/0150-formspec-as-layered-ui-substrate.md#53-anchor-and-id-uniqueness-under-per-view-grain",
  "suggestedFix": "stamp bundle-unique ids by prefixing colliding ids with the owning Component document's stem (e.g. `headerLogo` in `dashboard.component.json` → `dashboard.headerLogo`)",
  "fixtures": ["tests/fixtures/lint/E605-comp-bundle-id-collision/"],
  "state": "tested"
}
```

Aliases `MODULE-PAYLOAD-SCHEMA-MISMATCH` (E604) and `COMP-BUNDLE-ID-COLLISION` (E605) are retained in titles + spec refs so prose citations resolve unambiguously. The E605 fixture is a directory because bundle-graph collision requires ≥2 Component documents.

- [ ] **Step 1: Architecture review BEFORE** — `formspec-specs:spec-expert` cross-checks lint code numbering + spec-ref pins.

- [ ] **Step 2: Failing fixtures.** One fixture per code:
  - `E603` — document declares `modules: [{id: 'x-formspec-core-task', ...}]` and uses `unit.kind: 'x-foo-bar'` which no declared module contributes.
  - `E604` — Theme document's `widgetConfig` for a module-contributed widget fails to validate against the module's `widgetShape.props`.
  - `E605` — two-Component-document bundle with id collision (fixture lives under `tests/fixtures/lint/E605-comp-bundle-id-collision/`; the bundle-graph walk lands in Task 11).

- [ ] **Step 3: Run** — fail.

- [ ] **Step 4: Implement E603 + E604 lint passes** in `formspec/crates/formspec-lint/src/`. E605 implementation is in Task 11.

- [ ] **Step 4a: Skip the E605 fixture until Task 11 binds the lint.** Mark the E605 fixture test with `@pytest.mark.skip(reason="E605 lint binding lands in Task 11 (bundle-unique id invariant)")` in the Python conformance suite and the Rust equivalent (`#[ignore = "..."]` on the test fn) so the test suite stays green between this commit and Task 11. Task 11 Step 4 removes the skip when the binding lands.

- [ ] **Step 5: Regenerate generated lint code** — `npm run docs:generate` (calls `scripts/generate-lint-codes.mjs` which writes `crates/formspec-lint/src/generated/lint_code.rs`).

- [ ] **Step 6: Run** — green for E603/E604; E605 fixture skipped until Task 11 (test suite stays green).

- [ ] **Step 7: Regenerate docs.**

- [ ] **Step 8: Commit.**

```bash
git commit \
  formspec/specs/lint-codes.json \
  formspec/crates/formspec-lint/ \
  formspec/tests/fixtures/lint/E603-module-enum-unresolved.json \
  formspec/tests/fixtures/lint/E604-module-payload-schema-mismatch.json \
  formspec/tests/fixtures/lint/E605-comp-bundle-id-collision/ \
  $(git diff --name-only formspec/specs formspec/filemap.json) \
  -m "feat(adr-0150): define lint codes E603 (module-enum-unresolved) / E604 (MODULE-PAYLOAD-SCHEMA-MISMATCH) / E605 (COMP-BUNDLE-ID-COLLISION) (§4.2/§4.3/§5.3)"
```

- [ ] **Step 9: Architecture review AFTER** — load-bearing (new lint codes are conformance-shaping).

---

## Task 9 — BREAKING: `validation-mapping.MasterTable` four-constraint demotion

**ADR refs:** §4.2 (MasterTable demotion lines 180–207), §10 (refactor row 6).

**Files:**
- Modify: `formspec/schemas/validation-mapping.schema.json` — remove all four `MasterTable` constraints (`const`, `minItems: 5`, `maxItems: 5`, `uniqueItems: true`); keep `items: { $ref: MappingEntry }`.
- Mirror per existing set.
- Re-publish the closed-core 5 rows as a `x-formspec-core-actions` `validation-mapping-row` fixture in the registry contributions corpus (P1 task — but the canonical 5 rows must remain authoritative under JCS RFC 8785 byte equality at the fixture level per §4.2). For P0: keep the rows present as inline schema examples + a fixture so the conformance suite proves byte-equality.

- [ ] **Step 1: Architecture review BEFORE** — `formspec-specs:spec-expert` cross-checks that demoting all 4 constraints (not just `const`) is correct per §4.2's "removing only `const` would still reject any non-5-row table because minItems/maxItems independently enforce cardinality" pin.

- [ ] **Step 2: Failing fixture.** `MasterTable` with 6 rows now validates structurally; with 4 rows also validates (cardinality opens at schema layer; closed-per-module at conformance layer).

- [ ] **Step 3: Run** — fail.

- [ ] **Step 4: Remove four constraints**; keep items-ref.

- [ ] **Step 5: Add JCS byte-equality fixture** — fixture under `formspec/tests/conformance/fixtures/validation-mapping/closed-core-5-rows-jcs.json` + a Python test that re-canonicalizes the inline 5 rows and asserts byte-for-byte equality against the fixture (RFC 8785).

- [ ] **Step 6: Run** — green.

- [ ] **Step 7: Regenerate docs + sync lint mirror.**

- [ ] **Step 8: Commit (BREAKING — `MasterTable` constraint demotion).**

```bash
git commit \
  formspec/schemas/validation-mapping.schema.json \
  formspec/crates/formspec-lint/schemas/validation-mapping.schema.json \
  formspec/tests/conformance/fixtures/validation-mapping/ \
  formspec/tests/ \
  $(git diff --name-only formspec/specs formspec/filemap.json) \
  -m "$(cat <<'EOF'
refactor(adr-0150): demote MasterTable four constraints (§4.2/§10)

BREAKING (plan-promoted; not explicitly in ADR §11.2 — see Deviations
§BREAKING-count): MasterTable `const` + `minItems: 5` + `maxItems: 5` +
`uniqueItems: true` all removed; table cardinality opens at the schema layer
and stays closed-per-module at the conformance layer via Registry's
`validation-mapping-row` category (Task 2). The closed-core 5 rows remain
authoritative as JCS (RFC 8785) byte-equality fixtures.
EOF
)"
```

- [ ] **Step 9: Architecture review AFTER** — BREAKING-class.

---

## Task 10 — `posture-declaration` gets `allowedModules` + `allowedActors`

**ADR refs:** §4.4, §5.4, §10 (refactor row 11).

**Files:**
- Modify: `formspec/schemas/posture-declaration.schema.json` — add `allowedModules: ModuleRef[]` + `allowedActors: string[]` (URN list).
- Pass 2 noted: posture-declaration.schema.json is NOT currently mirrored under `crates/formspec-lint/schemas/`. Either seed an empty mirror file first (see Deviations §Lint-mirror seeding) OR do not introduce a mirror in this commit.
- Update existing posture-declaration fixtures.

- [ ] **Step 1: Architecture review BEFORE** — pin admission semantics: every field present on the posture entry MUST equal the document entry; absent fields admit any value (§4.4). Verify reviewer agrees this is the cleanest hostile-substitution closure.

- [ ] **Step 2: Failing fixtures.** Posture with `allowedModules: [{ id, version }]` admits document `modules: [{ id, version, publisher, lockHash }]` (any publisher/lockHash). Posture with `{ id, version, lockHash }` rejects mismatched-lockHash document entry. `allowedActors` URN absence rejects authoring event from un-listed actor.

- [ ] **Step 3: Run** — fail.

- [ ] **Step 4: Schema additions.** Add both arrays with appropriate `$ref` / pattern. Document admission semantics in `description`.

- [ ] **Step 5: Admission-rule implementation.** If the lint surface already evaluates posture admission, extend it; if not, the schema-side check is sufficient for now (file a P1 TODO at `formspec/TODO.md` for runtime admission).

- [ ] **Step 6: Run** — green.

- [ ] **Step 7: Regenerate docs.**

- [ ] **Step 8: Commit.**

```bash
git commit \
  formspec/schemas/posture-declaration.schema.json \
  formspec/specs/ \
  formspec/tests/fixtures/posture/ \
  $(git diff --name-only formspec/specs formspec/filemap.json) \
  -m "feat(adr-0150): posture.allowedModules + allowedActors with field-equality admission (§4.4/§5.4)"
```

- [ ] **Step 9: Architecture review AFTER** — load-bearing (auth-shape).

---

## Task 11 — BREAKING: Bundle-unique `id` invariant + `COMP-BUNDLE-ID-COLLISION` (E605) binding

**ADR refs:** §5.3, §10 (refactor row 2 — lint binding), §11.2 (BREAKING).

**Precondition:** Task 0 closed (DONE, committed `2a178047`).

**Files:**
- Modify: `formspec/schemas/component.schema.json` — `ComponentBase.id` description from per-tree-unique to bundle-unique-when-present; semantic statement that schema can't enforce graph-level uniqueness, the lint does.
- Modify: `formspec/crates/formspec-lint/` — bind the E605 lint added in Task 8 to walk every Component document referenced from a bundle, collect node `id`s, hard-fail on duplicates.
- Modify: `formspec/schemas/bundle-manifest.schema.json` — embed a `$comment` describing the bundle-graph rule (already noted in Task 7 prose; this commit binds the lint pass).

- [ ] **Step 1: Architecture review BEFORE** — verify Task 0's migration completely closed collisions, and that the lint binding's "scope" matches §5.3 (bundle-graph reachable from a single App Manifest).

- [ ] **Step 2: Failing fixtures.** Two-component-doc bundle where ids collide → `E605` (COMP-BUNDLE-ID-COLLISION). Bundle without collisions → green.

- [ ] **Step 3: Run** — expect lint failure (binding not yet plumbed).

- [ ] **Step 4: Implement lint binding + un-skip the E605 fixture.** Bundle-graph walk in `formspec-lint`: load App Manifest, resolve every `SiblingRef` to a Component document, parse nodes, build `(id → [doc, nodePath])` index, emit `E605` per duplicate. Re-use the Task 0 vendored script's walker logic as a reference (`tests/conformance/tools/comp_bundle_id_audit.py`) — the lint binding is the Rust analogue. Remove the `pytest.mark.skip` (and Rust `#[ignore]`) on the E605 fixture added in Task 8 Step 4a so the test now actually runs and validates the binding.

- [ ] **Step 5: Update `ComponentBase.id` description** — per §5.3, the schema can't enforce graph uniqueness; the documented invariant + lint do.

- [ ] **Step 6: Run** — green.

- [ ] **Step 7: Regenerate docs.**

- [ ] **Step 8: Commit (BREAKING — invariant uplift).**

```bash
git commit \
  formspec/schemas/component.schema.json \
  formspec/schemas/bundle-manifest.schema.json \
  formspec/crates/formspec-lint/ \
  formspec/tests/fixtures/lint/E605-comp-bundle-id-collision/ \
  $(git diff --name-only formspec/specs formspec/filemap.json) \
  -m "$(cat <<'EOF'
feat(adr-0150): ComponentBase.id uplift per-tree→bundle-unique with E605/COMP-BUNDLE-ID-COLLISION lint binding (§5.3/§11.2)

BREAKING: Component.id uniqueness scope uplifts from per-tree to bundle-unique-when-present.
Load-bearing for ADR 0151 cross-document move (CRDT bidirectional map relies on no-collision
invariant in the target doc). Precondition fixture-audit gate (§5.3) closed at
formspec/tests/conformance/COMP-BUNDLE-ID-MIGRATION.md (zero residual collisions).
EOF
)"
```

- [ ] **Step 9: Architecture review AFTER** — BREAKING + invariant-uplift load-bearing for ADR 0151.

---

## Task 12 — BREAKING: `token-registry.schema.json` retirement WITH production-runtime migration

**ADR refs:** §2.3 ("Token Registry... folds into the unified Registry as a contribution profile"), §4.2 (`token-category` contribution), §10 (refactor row 9).

**Why standalone + late in the order:** Pass 2 codebase grounding revealed `schemas/token-registry.json` is a **production-runtime document**, not a fixture, consumed across the codebase: `scripts/generate-theme-from-registry.mjs` (in `npm run docs:generate`), `packages/formspec-layout/src/token-registry.json` + `dist/`, `packages/formspec-webcomponent/dist/`, `crates/formspec-lint/src/pass_theme/token_registry.rs`. The retirement is the schema's retirement; the runtime canonical document survives at `packages/formspec-layout/src/token-registry.json`.

**Files (expanded per Pass 2 R2 HIGH-3 — earlier list missed 4–6 consumers):**
- Delete: `formspec/schemas/token-registry.schema.json`.
- Delete: `formspec/crates/formspec-lint/schemas/token-registry.schema.json` (mirror).
- Modify: `formspec/scripts/generate-theme-from-registry.mjs` — re-route to unified Registry's `token-category` contribution shape (Task 2). Runtime canonical document at `packages/formspec-layout/src/token-registry.json` continues to be the read source.
- Modify: `formspec/crates/formspec-lint/src/pass_theme/token_registry.rs` — re-route the lint pass to validate against the unified Registry shape.
- Modify (newly enumerated per Pass 2 R2): `formspec/crates/formspec-lint/src/schema_validation.rs` (refs the retired schema), `formspec/scripts/copy-layout-css-assets.mjs` (may ref schema or document — verify which), `formspec/scripts/sync-lint-schemas.mjs` (refs schema in mirror sync list), `formspec/packages/formspec-layout/package.json` (may declare schema-export), `formspec/packages/formspec-layout/src/platform-defaults.ts` (may ref schema for type), `formspec/packages/formspec-layout/src/default-theme.json` (may ref schema for validation hint).
- Modify: any other in-repo reference to `token-registry.schema.json` — final sweep: `grep -rln 'token-registry.schema.json' formspec/` and migrate references to point at the Registry-resolved equivalent.
- Preserve `formspec/schemas/token-registry.json` AS-IS — that's the production-runtime canonical document; it doesn't retire.
- Preserve vendored copies (out of P0 scope, post-P0 cascade per Deviations): `formspec-web/src/theme/upstream/layout/token-registry.json`, `formspec-webcomponent/dist/token-registry.json`, **`formspec-studio/packages/formspec-mcp/lib/schemas/token-registry.schema.json`** (the studio-MCP vendored schema copy flagged by Pass 4 R2 — ships as a stale schema post-P0 until studio cascade lands).

- [ ] **Step 1: Architecture review BEFORE** — `formspec-specs:spec-expert` confirms the migration path: schema retires, document survives, lint pass + theme generator re-target unified Registry. Cross-reference §4.2 prose about "folds into the unified Registry as a contribution profile".

- [ ] **Step 2: Failing fixtures.**
  - Token document that previously validated against `token-registry.schema.json` now validates against the unified Registry's `category: 'token-category'` payload shape.
  - Token document with a value violating the new `categoryShape` fails with `E604` (MODULE-PAYLOAD-SCHEMA-MISMATCH).
  - Theme generator pipeline runs `npm run docs:generate` without referencing the deleted schema.

- [ ] **Step 3: Run** — fail.

- [ ] **Step 4: Migrate the theme generator** — `generate-theme-from-registry.mjs` reads tokens from `packages/formspec-layout/src/token-registry.json` and validates via the unified Registry's `category: 'token-category'` payload shape.

- [ ] **Step 5: Migrate the lint pass** — `crates/formspec-lint/src/pass_theme/token_registry.rs` re-targets the unified Registry shape.

- [ ] **Step 6: Delete the retired schemas** — `git rm formspec/schemas/token-registry.schema.json formspec/crates/formspec-lint/schemas/token-registry.schema.json`.

- [ ] **Step 7: Run** — green.

- [ ] **Step 8: Regenerate docs** — `npm run docs:generate` (theme generation pipeline must still work end-to-end).

- [ ] **Step 9: Commit (BREAKING — schema retirement).**

```bash
git commit \
  formspec/schemas/token-registry.schema.json \
  formspec/crates/formspec-lint/schemas/token-registry.schema.json \
  formspec/scripts/generate-theme-from-registry.mjs \
  formspec/crates/formspec-lint/src/pass_theme/ \
  formspec/specs/ \
  $(git diff --name-only formspec/specs formspec/filemap.json) \
  -m "$(cat <<'EOF'
refactor(adr-0150): retire token-registry.schema.json, re-route to Registry token-category (§2.3/§4.2/§10)

BREAKING (plan-promoted — not in ADR §11.2 enumeration but follows from §10 row 9
deletion; see Deviations §BREAKING-count): standalone token-registry.schema.json
removed. The runtime canonical token document at packages/formspec-layout/src/
token-registry.json survives unchanged; validation re-routes to the unified
Registry's `category: 'token-category'` contribution shape. The theme generator
and the formspec-lint token-registry pass migrate to the new shape.

Vendored copies in formspec-web/src/theme/upstream/layout/token-registry.json and
formspec-webcomponent/dist/token-registry.json are unaffected — those are the
distributed runtime canonical, not schemas. Cross-stack coordination for downstream
consumers of the document shape (formspec-studio, formspec-web theme pipeline) is
post-P0 cascade per Deviations §Cross-stack coordination.
EOF
)"
```

- [ ] **Step 10: Architecture review AFTER** — BREAKING + production-runtime-touching.

---

## Final verification gate (Task 13)

- [ ] `npm run docs:generate` — clean.
- [ ] `npm run docs:check` — green.
- [ ] `npm run check:deps` — green.
- [ ] `cargo nextest run --workspace` — green.
- [ ] `python3 -m pytest tests/ -v` — green.
- [ ] `make test` — green (umbrella incl. Playwright E2E + sync-lint-schemas pre-step).
- [ ] **Stack-level filemap regen** — `node /Users/mikewolfd/Work/formspec-stack/scripts/generate-filemap.mjs` from stack root; commit if it produces changes.
- [ ] **Plugin reference-map regen** — invoke `formspec-specs:update-spec-nav` skill from parent stack to refresh `.claude-plugin/skills/formspec-specs/references/schemas/*.md` and `SKILL.md`. Affected maps: `common.md`, `registry.md`, `component.md`, `experience.md`, `response-actions.md`, `validation-mapping.md`, `trace-index.md`, `respondent-ledger.md`, `respondent-ledger-event.md`, `posture-declaration.md`, `bundle-manifest.md` (→ `app-manifest.md` rename), `locale.md`, **`mapping-theme-registry.md`** (cross-cites token-registry per Pass 4 R2 NIT — verify auto-regen covers cross-citations or update manually). Token-registry map (`references/schemas/token-registry.md`) deletes per Task 12.
- [ ] Two scout/expert reviewers (cross-stack-scout + spec-expert, OR formspec-scout + spec-expert) both return zero open findings on the entire P0 work.
- [ ] **Submodule-pointer held-hostage flag.** Between Task 6 (ledger schema changes) and the post-P0 cross-stack coordination commits (formspec-web, trellis, work-spec, formspec-studio), the parent-stack submodule pointer for `formspec/` cannot be pushed without breaking downstream sibling repos at HEAD. Flag explicitly in `formspec/TODO.md` so a future agent doesn't blind-bump the parent pointer. Per stack `CLAUDE.md` §Submodule discipline, "a change crossing N submodules takes N+1 commits."
- [ ] Submodule pointer in parent ready for **owner-approved** push (NOT auto-bumped — hold per the held-hostage flag above).
- [ ] `formspec/TODO.md` updated with P1 carry-over (republish core vocabularies as modules; AI-runtime module; Surface module v0.1; per-class governance for module widgets [ADR 0152]; cross-stack coordination commits per Deviations; lint-mirror seeding for bundle-manifest/posture-declaration/respondent-ledger-event/trace-index).

---

## Deviations

(Append-only. Reviewer findings + steering changes land here, not in the ratified ADR.)

### r1 (2026-05-23) — Round-1 review remediations

**BREAKING-count clarification.** This plan ships **four** BREAKING-marked commits: bundle-manifest reframe (Task 7), MasterTable four-constraint demotion (Task 9), `ComponentBase.id` uplift (Task 11), token-registry.schema.json retirement (Task 12). Justification on merit: each is a real API contract change for downstream consumers; fail-loud BREAKING markers in the commit log serve the consumer (they signal "re-validate against this version") and serve future code archaeology. Suppressing markers to match a stated count mis-serves the consumer. Confirming data points: ADR §11.2 enumerates two of these four (bundle-manifest reframe + `ComponentBase.id` uplift); the /goal directive states "three BREAKINGs per ADR §11.2." Both are snapshots, neither binding — the consumer-clarity argument decides.

**`$formspecBundle` const bump to "2.0".** ADR §5.2 leaves the bump optional ("appropriate if the audit prefers a hard version pin"). This plan bumps `$formspecBundle` from `"1.0"` → `"2.0"` on the App Manifest reframe (Task 7) because the structural change is non-trivial and a hard version pin is the cheapest way to make strict-validating consumers fail-loud rather than silently mis-parse.

**Task 0 audit report path.** Report committed at `formspec/tests/conformance/COMP-BUNDLE-ID-MIGRATION.md`. Pass 2 codebase-grounding observed `tests/conformance/` is conventionally `.py` + `.json` only; formspec `CLAUDE.md` §Repo layout says plans/research live in `thoughts/`. Both observations are correct as conventions. The merit-based justification for keeping the report at the `tests/conformance/` path: the audit IS a test artifact (zero-collision snapshot with a vendored re-runnable script at `tests/conformance/tools/comp_bundle_id_audit.py`), not a plan or research doc. Co-locating the report with its re-runnable verifier serves the future agent who needs to re-validate post-Task-11 — they find script + report + fixtures in one place. ADR §5.3 happened to pin the same path; that's a confirming voice, not the deciding one.

**`tests/conformance/fixtures/regeneration-merge/` exclusion from Task 0 audit.** The Task 0 audit excluded 67 files in this tree as cross-revision-of-one-component rather than cross-component-in-bundle. Rationale: each scenario dir contains four revisions of ONE Component (`old/new/designer-edited/expected-merged`) — cross-revision `id` reuse is correctness-by-construction for three-way merge. ADR §242 cites the paused regeneration-merge plan as a downstream consumer of the bundle-unique invariant; when that plan resumes, each scenario dir should grow an explicit `manifest.json` declaring "these are revisions, not siblings", but the bundle-unique-when-present invariant is unaffected by it today. Audit rationale is recorded at `formspec/tests/conformance/COMP-BUNDLE-ID-MIGRATION.md` §1 Exclusion so it's revisitable.

**Cross-stack coordination obligations (post-P0).** Pass 4 cross-stack scout enumerated downstream consumers of the ledger schemas + bundle-manifest + token-registry document that DO NOT update inside this P0 scope:
- `formspec-web/src/ports/identity-provider.ts:21` — consumes `respondent-ledger-event.schema.json` enum subset; the `credentialType` enum is not the field this P0 refactors, but Task 5's uniform `oneOf` convention touches `EventType` + `ChangeSetEntry.valueClass`. Post-P0 verification: ensure no formspec-web port consumer reads those refactored fields without the `oneOf` extension.
- `trellis/specs/trellis-core.md:2580` — cites Respondent Ledger §6.2 + §13 by section number. Task 6 prose edits to `respondent-ledger.schema.json` MAY shift section numbering; verify post-P0.
- `work-spec/crates/wos-formspec-binding/src/lib.rs:2641` — emits literal `ledgerHeadRef` URN; URN scheme unchanged by P0; safe.
- `work-spec/CLAUDE.md:117` notes the in-flight Trellis rename `respondent-ledger-spec.md → case-ledger-spec.md`; coordinate post-P0.
- `formspec-studio/packages/formspec-studio-core/` (project.ts, preview-documents.ts, export-zip.ts, token-registry.ts) — every BREAKING in this plan cascades into formspec-studio. ADR 0151 §10 explicitly retires `proposal-manager.ts` as a P1+ formspec-studio refactor. Studio breakage post-P0 is intentional and expected; the parent-stack submodule-pointer bump for formspec-studio is post-P0.
- `formspec-studio/packages/formspec-mcp/lib/schemas/token-registry.schema.json` (vendored schema copy) — Pass 4 R2 flagged: ships as a stale schema copy post-P0 until studio cascade migrates it. Either deletes (preferred) or migrates to the unified Registry shape during the studio cascade. Out of P0 scope.
- `formspec-web/src/theme/upstream/layout/token-registry.json` (vendored copy) — Task 12 doesn't touch the document, only the schema; vendored copy stays valid as runtime canonical.

This Deviation flags the cross-stack work; the actual coordination commits are scheduled post-P0 per stack `CLAUDE.md` §Submodule discipline (one commit per affected submodule + a parent commit bumping pointers).

**Lint-mirror seeding.** Pass 2 codebase-grounding revealed `scripts/sync-lint-schemas.mjs:17` filters `readdirSync(DST)` — only files already present in `crates/formspec-lint/schemas/` get synced. Currently missing from mirror: `bundle-manifest.schema.json`, `posture-declaration.schema.json`, `respondent-ledger-event.schema.json`, `trace-index.schema.json` (Pass 2 list). This plan does NOT introduce new mirrors mid-task; tasks that edit these schemas commit only the canonical `schemas/<name>.schema.json`. A separate plan item (carry to P1 or address before final verification) decides whether to widen the mirror set, modify the sync filter, OR accept the current mirror coverage as canonical. Until then, lint passes referencing the non-mirrored schemas read them by path from `formspec/schemas/`.

**Plugin reference-map regen and stack-level filemap regen** added to the final verification gate (Task 13).

### r1 follow-ups (open)

- *(none at plan-write — populated during execution)*

---

## Out of scope for P0 (lives in P1+)

- Republishing core vocabularies as `x-formspec-core-*` modules (ADR §4.9) — P1.
- Surface module (`x-formspec-surface` v0.1) — P2 / ADR §14 P2.
- Non-core modules (`x-formspec-presentation`, `x-formspec-conversation`, `x-formspec-document-viewer`) — P2.
- Studio-core kernel + product MCPs (`formspec-mcp-wireframes`, `formspec-mcp-forms`) — P3.
- `x-formspec-ai-runtime` module behavior — P4 (P0 ships only the carry-points).
- Per-class governance for module widgets — deferred to [ADR 0152](../../../thoughts/adr/0152-multi-actor-authorization-scope.md).
- Cross-stack coordination commits (formspec-studio cascade, formspec-web verification, Trellis prose section freshness, work-spec/CLAUDE.md naming-fork coordination) — post-P0 per Deviations §Cross-stack coordination.
- Lint-mirror set widening (or filter change) for `bundle-manifest`, `posture-declaration`, `respondent-ledger-event`, `trace-index` — P1.

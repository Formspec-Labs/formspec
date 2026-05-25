# ADR 0153 Surface Contract Closure Plan

**Date:** 2026-05-24
**Row:** Surface contract
**Status:** Closed for ADR 0153 gate 2; shared-validator production wiring remains in later rows
**Authority:** stack rollup
[`2026-05-24-adr-0150-followons-and-gating.md`](../../../thoughts/2026-05-24-adr-0150-followons-and-gating.md),
ADR 0153 §§6-9, ADR 0154 §§6-11

## Goal

Close ADR 0153 gate 2 without promoting spike-local machinery: Surface draft vs
published document semantics, dedicated Surface fixtures, lint/conformance
evidence, and production consumers that treat Surface as source input rather
than generated Component authority.

## Current Evidence

- `specs/surface/surface-spec.md` defines route reachability, slot
  binding validity, module-widget binding semantics, and the closed v0.1 slot
  taxonomy.
- `schemas/surface.schema.json` carries the v0.1 document shape.
- `crates/formspec-lint/src/pass_surface.rs` emits E606/E607 for
  Surface-local route graph failures.
- `crates/formspec-lint/src/pass_modules.rs` applies E603/E604 to
  Surface `module-widget` bindings and configs.
- `../formspec-studio/packages/formspec-studio-core/src/kernel/StudioCoreKernel.ts`
  and
  `../formspec-studio/packages/formspec-studio-core/src/kernel/ProposalManagerFacade.ts`
  expose `readSurfaceDraft` and `exportSurfaceDocument`.

## Review Checkpoints

- 2026-05-24 pre-prose architecture scout: APPROVE. Required cautions: do not
  claim gate closure before dedicated fixtures and contract-surface evidence;
  tighten transition wording so Surface declares triggers while Response
  Actions executes; avoid Component route identity, Data Sources, local fixture
  identity, and fine-grained auth scope creep.
- 2026-05-24 post-prose phase-boundary expert: APPROVE. Required cleanups:
  keep the rollup row Partial while updating stale wording, sync schema
  descriptions without adding fields, and cite ADR 0154 §§6-11 for identity
  non-goals and implementation gates.
- 2026-05-24 Surface contract code review: REQUEST CHANGES. HIGH: new Surface
  pytest and sibling studio-core proof were inventoried but not enforced by
  the contract-surface gate. WARNING: generated `formspec-types` comments were
  stale after schema-description sync. Remediation: wire
  `tests/conformance/spec/test_surface_contract.py` into
  `scripts/run-contract-surface-tests.mjs`, wire the studio-core facade test
  into the full contract-surface gate, and regenerate generated Surface types.

## Ordered Work

### Phase 1 — Prose Contract

- [x] Add Surface draft vs published document semantics.
- [x] Name `readSurfaceDraft` as authoring projection, not publishable
  document authority.
- [x] Name `exportSurfaceDocument` as the fail-closed publication gate.
- [x] Tighten transition authority: Surface declares triggers; Response
  Actions executes.
- [x] State local/non-local validation ownership so Component identity, Data
  Sources, and authorization remain outside this row.

### Phase 2 — Schema Review

- [x] Review whether the current schema needs only description updates or a
  revision for draft/export vocabulary. Do not add schema fields for draft
  state unless the draft becomes a source artifact; ADR 0153 treats drafts as
  authoring state.
- [x] If schema descriptions change, regenerate schema docs and lint mirrors
  through repo-native generation.

### Phase 3 — Dedicated Surface Fixture Corpus

- [x] Add a dedicated `tests/conformance/fixtures/surface/` corpus covering a
  publishable positive Surface, E606 unreachable route, E607 unresolved
  embed-route, module-widget binding/config, and App Manifest URL sibling
  identity.
- [x] Keep fixture identity artifact-relative: App Manifest sibling refs use
  URL/version, never local fixture paths as production identity.

### Phase 4 — Contract Coverage and Lint Proof

- [x] Register Surface in `tests/contracts/surface-coverage.json` with proof
  surfaces for spec, schema, fixtures, lint rules, and current Studio draft
  export behavior.
- [x] Add or extend tests that prove E606/E607 and E603/E604 cover the named
  fixture families.

### Phase 5 — Production Wiring Boundary

- [ ] After shared `ArtifactResolver`, `ModuleResolver`, and
  `AppGraphValidator` extraction lands, wire Surface consumers to shared
  validator output rather than local graph guesses.
- [ ] Keep runtime/projection wiring held until ADR 0153 §7 phases 1-6 close.

## Deviations

- 2026-05-24: Surface prose is allowed to advance before fixture corpus work,
  but the rollup row remains Partial. This is not gate closure; it is the first
  ADR 0153 §7 step for the Surface row.
- 2026-05-24: Transition prose was narrowed from router/action inference to
  declaration-only Surface semantics. Response Actions remains the executor.
- 2026-05-24: Schema Phase 2 is description-only. No fields were added for
  draft state because Surface drafts remain authoring projections, not source
  artifacts.
- 2026-05-24: Surface contract coverage is registered as `enforced` rather
  than `partial` because the local contract ledger requires Formspec-owned
  spec/schema pairs to list concrete conformance, crate, and package proof.

## Closure Evidence

Closed for ADR 0153 gate 2.

- Prose: `specs/surface/surface-spec.md` defines published Surface document vs
  authoring draft authority, `readSurfaceDraft`, `exportSurfaceDocument`, local
  publishability diagnostics, and Response Actions transition execution
  authority.
- Schema: `schemas/surface.schema.json` and the lint mirror carry
  description-only alignment; no draft-state source fields were added.
- Fixtures: `tests/conformance/fixtures/surface/` covers publishable positive
  Surface, App Manifest URL sibling identity, E606, E607, E603, and E604.
- Lint rule: `tests/conformance/spec/test_surface_contract.py` proves E606,
  E607, module-widget E603, and module-widget config E604 against the corpus.
- Contract coverage: `tests/contracts/surface-coverage.json` registers Surface
  as enforced with spec, schema, fixtures, lint crate paths, generated types,
  and studio-core package proof.
- Gate wiring: `scripts/run-contract-surface-tests.mjs` now enforces the
  Surface contract pytest in the contract-surface gate and runs the sibling
  studio-core `proposal-manager-facade.test.ts` in the full gate.
- Generated artifacts: `specs/surface/surface-spec.bluf.md`,
  `specs/surface/surface-spec.llm.md`, `packages/formspec-types/src/generated/surface.ts`,
  and `filemap.json` are regenerated.
- Verification: `npm run docs:check`; `npm run test:contract-surfaces`;
  `.venv/bin/python -m pytest tests/conformance/modules/test_x_formspec_surface.py tests/conformance/spec/test_surface_contract.py tests/unit/test_contract_surface_coverage.py -v`;
  `git diff --check`.
- Reviews: pre-prose architecture scout APPROVE; phase-boundary architecture
  expert APPROVE; code review REQUEST CHANGES then follow-up APPROVE after
  contract-gate and generated-types remediation.

Not part of this row's closure: shared `ArtifactResolver` / `ModuleResolver` /
`AppGraphValidator` extraction and production consumer rewiring. Those remain
tracked by the Shared graph primitives and Production wiring rows in the stack
rollup.

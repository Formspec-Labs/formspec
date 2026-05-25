# ADR 0153 Data Sources Peer Artifact Closure Plan

**ADR:** stack-root `thoughts/adr/0153-formspec-app-graph-production-boundary.md`
**Row:** Data Sources
**Status:** Closed for ADR 0153 gate 5; runtime resolver/validator wiring remains in later rows
**Owner:** Formspec app-graph follow-on lane

## Scope

Close ADR 0153 gate 5 without promoting spike-local machinery: define Data
Sources as a peer app artifact, preserve Definition-local `instances`, add
App Manifest v2.1 sibling identity, and pin schema/fixture/conformance coverage
for source family, cache/staleness, failure, provenance, source-to-slot
availability, and ADR 0152 authorization boundaries.

Not in this row: payload fetching, query execution, cache implementation,
`ArtifactResolver`, `AppGraphValidator`, production consumers, or fine-grained
authorization.

## Evidence Before Work

- Core Definition already owns form-local secondary instances:
  `specs/core/spec.md` §2.1.7/§4.4 and
  `schemas/definition.schema.json#/properties/instances`.
- v4 spike proved useful Data Source candidate fields, but its
  `$wireframeDataSources` schema, fixture paths, and coherence harness are
  spike-local evidence only.
- App Manifest v2.0 is a closed property surface; new sibling slots require a
  minor version bump.

## Review Checkpoints

- 2026-05-24 architecture scout: REQUEST CHANGES. Findings: do not silently add
  `dataSources[]` to App Manifest v2.0; preserve Definition `instances`; include
  Surface identity in route/slot availability.
- 2026-05-24 revised architecture scout: APPROVE. Approved an explicit App
  Manifest v2.1 additive mini-slice, a compatibility section for Definition
  `instances`, `surfaceRef`-required route/slot availability, and
  spec-conformance-only runtime scope.
- 2026-05-24 code review: REQUEST CHANGES. HIGH: surface-level availability
  did not require `surfaceRef`; generated TypeScript Data Sources runtime types
  were widened by a broad string index.
- 2026-05-24 follow-up code review: APPROVE. Confirmed `surfaceRef` is required
  for surface/route/slot availability and generated Data Sources types preserve
  closedness while retaining the `x-*` extension lane.

## Work Phases

### Phase 1 - Prose Contract

- [x] Add `specs/data-sources/data-sources-spec.md`.
- [x] State that Definition-local `instances` remain the `@instance()` authority.
- [x] State that peer Data Sources do not create `@instance()` names by default.
- [x] Pin source families, owner/scope, availability, runtime cache/failure,
  provenance, and coarse authorization boundaries.
- [x] Require `surfaceRef` for route and slot availability selectors.

### Phase 2 - Schema and App Manifest v2.1

- [x] Add `schemas/data-sources.schema.json`.
- [x] Add App Manifest v2.1 gating for `dataSources[]` while preserving v2.0
  manifests that do not use the v2.1-only member.
- [x] Add `dataSources[]` to sibling identity and discriminator prose.
- [x] Update generated TypeScript schema sources for `DataSourcesDocument`.

### Phase 3 - Fixture Corpus and Conformance

- [x] Add positive and negative Data Sources fixtures.
- [x] Add App Manifest v2.1 positive and v2.0 rejection fixtures.
- [x] Add schema and semantic conformance tests for Data Sources.
- [x] Extend App Manifest schema/semantic tests for v2.1.
- [x] Wire Data Sources and App Manifest v2.1 tests into
  `scripts/run-contract-surface-tests.mjs`.

### Phase 4 - Contract Ledger and Generated Artifacts

- [x] Register Data Sources in `scripts/spec-artifacts.config.json`.
- [x] Register Data Sources in `tests/contracts/surface-coverage.json`.
- [x] Generate BLUF/LLM docs and `filemap.json`.
- [x] Generate `packages/formspec-types/src/generated/data-sources.ts`.

### Phase 5 - Deferred Runtime Wiring

- [ ] After shared `ArtifactResolver`, `ModuleResolver`, and
  `AppGraphValidator` extraction lands, wire Data Sources resolution through
  the shared graph validator output.
- [ ] After ADR 0152 lands, replace the coarse authorization boundary with the
  ratified fine-grained policy contract.

## Deviations

- 2026-05-24: The first proposed scope tried to add `dataSources[]` directly to
  App Manifest v2.0. Architecture review rejected that because v2.0 is a closed
  property surface. The implemented scope uses explicit v2.1 gating instead.
- 2026-05-24: Data Sources is registered as `runtimeScope:
  spec-conformance-only`; no crate/package runtime claim is made because source
  loading and cross-artifact resolution belong to later resolver/validator
  rows.
- 2026-05-24: The schema intentionally rejects fine-grained authorization fields.
  `runtime.authorizationBoundary` is only a coarse boundary enum until ADR 0152
  lands.

## Closure Evidence

Closed for ADR 0153 gate 5:

- Prose: `specs/data-sources/data-sources-spec.md` defines the peer artifact,
  Definition `instances` compatibility, App Manifest v2.1 identity, source
  family taxonomy, availability, cache/staleness, failure, provenance, and
  authorization boundary rules.
- Schema: `schemas/data-sources.schema.json` pins `$formspecDataSources`,
  source kind, id-prefix, availability selector, runtime, cache, provenance, and
  coarse authorization shape.
- App Manifest: `schemas/bundle-manifest.schema.json` and
  `specs/bundle/app-manifest-spec.md` admit `dataSources[]` only for
  `$formspecBundle: "2.1"`.
- Fixtures: `tests/conformance/fixtures/data-sources/` covers positive catalog,
  duplicate id, id-prefix mismatch, cache/staleness, live-cache, draft-delivery,
  provenance drift, ambiguous surface/slot availability, and fine-grained
  authorization.
- App Manifest fixtures:
  `tests/conformance/fixtures/bundle/app-with-data-sources-v2-1.json` and
  `tests/conformance/fixtures/bundle/invalid-data-sources-in-2-0.json`.
- Conformance:
  `tests/conformance/schemas/test_data_sources_schema.py`,
  `tests/conformance/spec/test_data_sources_contract.py`,
  `tests/conformance/schemas/test_bundle_manifest_schema.py`, and
  `tests/conformance/spec/test_bundle_manifest_semantics.py`.
- Contract coverage: `tests/contracts/surface-coverage.json` registers Data
  Sources as enforced spec-conformance-only with explicit runtime rationale.
- Gate wiring: `scripts/run-contract-surface-tests.mjs` includes the Data
  Sources and App Manifest v2.1 tests in the contract-surface gate.

Not part of this row's closure: shared `ArtifactResolver` / `ModuleResolver` /
`AppGraphValidator` extraction, source payload loading, production consumer
rewiring, and ADR 0152 fine-grained authorization. Those remain separate ADR
0153/0152 rows.

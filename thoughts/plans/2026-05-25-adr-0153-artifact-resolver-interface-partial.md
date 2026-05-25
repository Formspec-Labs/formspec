# ADR 0153 ArtifactResolver Interface Partial Plan

**ADR:** stack-root `thoughts/adr/0153-formspec-app-graph-production-boundary.md`
**Row:** ArtifactResolver
**Status:** Partial; prose/interface boundary plus output report schema/type
contract defined, extraction remains open
**Owner:** Formspec app-graph follow-on lane

## Scope

Advance ADR 0153 gate 12 without claiming extraction closure. This slice
defines the `ArtifactResolver` request/response boundary, loader port,
manifest slot coverage through App Manifest v2.2, handle metadata, identity
rules, diagnostic vocabulary, and output report schema/type contract.

Not in this slice: resolver package code, resolver request JSON Schema,
fixture-backed resolver conformance, production consumers, AppGraphValidator
cross-artifact checks, ModuleResolver admission/contribution logic, runtime
fetch/cache policy, Data Sources payload loading, or ADR 0152 fine-grained
authorization.

## Review Checkpoints

- 2026-05-25 architecture scout: APPROVE with Partial status. Required
  cautions: do not mark gate 12 Closed; preserve ADR 0153 production order
  (specs before schemas, implementation plan, shared extraction, fixtures/lint,
  then production wiring); keep module coherence/admission outside
  ArtifactResolver authority.
- 2026-05-25 architecture checkpoint (Descartes): APPROVE for a prose/status
  sync only. Required cautions: add App Manifest v2.2 `components[]` loadable
  coverage with `$formspecComponent`; preserve singular `component` as the
  compatibility slot normalized downstream as membership handle `default`;
  treat `ComponentRef.handle` as manifest membership evidence; do not derive
  handle identity from local source, filenames, URL suffixes, Surface ids, or
  route names; do not add schema, generated types, resolver implementation,
  AppGraphValidator code, conformance fixtures, production consumers, UI graph
  policy, runtime/projection behavior, or ADR 0152 authorization semantics.
- 2026-05-25 external review (Beauvoir): APPROVE with no findings. Reviewer
  confirmed spec self-authoring, v2.2 `components[]` coverage, singular
  `component` compatibility, `ComponentRef.handle` as manifest membership
  evidence only, no forbidden promotion, non-Closed gate status, and
  prose-only reservation of `ARTIFACT-COMPONENTS-VERSION-GATE`.
- 2026-05-25 architecture checkpoint (Bernoulli): APPROVE for output-schema
  promotion only. Required cautions: keep the contract as
  `ArtifactResolutionReport`, group artifacts only by App Manifest member
  names, keep `document` opaque JSON, reject spike-only ref fields, lock
  diagnostics to `origin: "artifact-resolver"` and
  `phase: "artifact-resolution"`, avoid resolver implementation/extraction,
  consumers, runtime/projection wiring, and ADR 0152 semantics, and keep gate
  12 Partial.
- 2026-05-25 external review (Erdos): initial REVISE for missing explicit
  tests for root required fields and diagnostic phase const; addressed with
  schema tests. Re-review APPROVE with no findings, confirming output-only
  schema `$id`, manifest-member artifact groups, ref shape, opaque
  `document?: unknown`, `x-*` handle statuses, and non-Closed status docs.

## Work Completed

- [x] Add `specs/app-graph/artifact-resolver-spec.md` as the prose-only
  interface contract.
- [x] Define request/response concepts and the host-supplied loader port.
- [x] Enumerate App Manifest v2.0/v2.1/v2.2 loadable sibling slots and
  expected discriminators.
- [x] Add `components[]` / `ComponentRef.handle` as App Manifest v2.2
  Component membership evidence without promoting route or node identity
  enforcement into ArtifactResolver.
- [x] Separate loadable sibling artifacts from `modules[]` and `sessions[]`
  declarations.
- [x] Align handle concepts with `@formspec-org/app-graph`
  `ResolvedArtifactHandle`.
- [x] Define artifact-resolution diagnostics and imported-origin rules.
- [x] Keep fixture paths, filenames, URL suffixes, and directory scans out of
  identity authority.
- [x] Add `schemas/artifact-resolution-report.schema.json` as the resolver
  output report contract with `$id`
  `https://formspec.org/schemas/artifactResolutionReport/0.1`.
- [x] Generate `@formspec-org/types` `ArtifactResolutionReport` types and keep
  `document` opaque while preserving `x-*`-only extension lanes.
- [x] Add schema/type tests for manifest-member artifact groups,
  resolver-only diagnostic origin, opaque document payloads, and rejection of
  fixture/path-derived identity fields.

## Still Open for Gate 12 Closure

- [ ] Define a resolver request schema/generated type only if future
  implementation inputs need a stable interchange artifact.
- [ ] Extract a shared resolver package or app-graph package module.
- [ ] Add fixture-backed conformance for missing artifacts, unsupported schemes,
  discriminator mismatch, ref/version mismatch, identity mismatch, App
  Manifest v2.1 `dataSources[]` gating, App Manifest v2.2 `components[]`
  gating, and `ComponentRef.handle` preservation.
- [ ] Wire the resolver output into the shared `AppGraphValidator` request.
- [ ] Wire production consumers only after shared resolver and validator
  contracts are stable.

## Deviations

- 2026-05-25: Gate 12 is marked Partial, not Closed. A prose/interface contract
  is the first ordered step, but it does not extract manifest ref loading or
  discriminator/version diagnostics into shared code.
- 2026-05-25: `modules[]` and `sessions[]` remain manifest declarations rather
  than resolver-loaded artifact documents. The resolver may expose them as
  evidence, but ModuleResolver and runtime/session ownership decide their
  semantics.
- 2026-05-25: App Manifest v2.2 `components[]` slot coverage is prose/status
  sync only. It reserves `ARTIFACT-COMPONENTS-VERSION-GATE` as an
  artifact-resolution diagnostic name for later extraction/conformance, but no
  production resolver emission is claimed in this slice.
- 2026-05-25: The output report schema and generated type are promoted before
  resolver extraction because they only pin the resolver output envelope. No
  request schema, source artifact validation, loader implementation,
  conformance fixture corpus, consumer wiring, runtime/projection behavior, or
  ADR 0152 authorization semantics are promoted.

## Partial Evidence

- Spec: `specs/app-graph/artifact-resolver-spec.md`.
- Output schema: `schemas/artifact-resolution-report.schema.json`.
- Generated type:
  `packages/formspec-types/src/generated/artifact-resolution-report.ts`.
- Schema tests:
  `tests/conformance/schemas/test_artifact_resolution_report_schema.py`.
- Type contract tests:
  `packages/formspec-types/tests/schema-sync.test.ts` and
  `packages/formspec-types/src/type-contracts.ts`.
- Parent ADR gate update: stack-root
  `thoughts/adr/0153-formspec-app-graph-production-boundary.md`.
- Rollup update: stack-root
  `thoughts/2026-05-24-adr-0150-followons-and-gating.md`.
- Verification: `python -m pytest
  tests/conformance/schemas/test_artifact_resolution_report_schema.py -q`;
  `python -m pytest tests/conformance/schemas -q`;
  `npm run --workspace @formspec-org/types test`;
  `npm run --workspace @formspec-org/types build`;
  `npm run docs:filemap:check`; `npm run docs:check`;
  `git -C formspec diff --check`; stack-root `git diff --check`.
- Review: external review `019e5e04-93ef-73a3-97ce-5e738f382ffa`
  (Beauvoir), APPROVE with no findings.
- Review: external review `019e5e21-4834-77c2-8cc9-f3062a2b55b9`
  (Erdos), APPROVE with no findings after the root-required and diagnostic
  phase tests were added.

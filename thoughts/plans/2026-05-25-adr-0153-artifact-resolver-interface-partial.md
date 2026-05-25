# ADR 0153 ArtifactResolver Interface Partial Plan

**ADR:** stack-root `thoughts/adr/0153-formspec-app-graph-production-boundary.md`
**Row:** ArtifactResolver
**Status:** Partial; prose/interface boundary, output report schema/type
contract, and shared resolver kernel defined; conformance and consumers remain
open
**Owner:** Formspec app-graph follow-on lane

## Scope

Advance ADR 0153 gate 12 without claiming extraction closure. This slice
defines the `ArtifactResolver` request/response boundary, loader port,
manifest slot coverage through App Manifest v2.2, handle metadata, identity
rules, diagnostic vocabulary, and output report schema/type contract.

Not in this slice: resolver request JSON Schema, fixture-backed source
conformance corpus, production consumers, AppGraphValidator cross-artifact
checks, ModuleResolver admission/contribution logic, runtime fetch/cache
policy, Data Sources payload loading, or ADR 0152 fine-grained authorization.

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
- 2026-05-25 architecture checkpoint (Chandrasekhar): APPROVE for the shared
  resolver extraction slice after this implementation plan update. Constraints:
  return `ArtifactResolutionReport` rather than the wider generic app-graph
  handle/report types; keep diagnostics locked to `origin:
  "artifact-resolver"` and `phase: "artifact-resolution"`; inspect only enough
  App Manifest shape to enumerate refs and protect the loading boundary; do
  not add request JSON Schema, production consumers, AppGraphValidator wiring,
  ModuleResolver logic, UI graph policy, runtime/projection behavior, source
  schema validation, filesystem fixture loading, directory scanning, URL-suffix
  identity, or ADR 0152 semantics.
- 2026-05-25 external review (Lagrange): initial REVISE for a loader-returned
  `invalid-discriminator` path without a default error diagnostic, plus stale
  request/prose and plan text. Fixes added default
  `ARTIFACT-DISCRIMINATOR-MISMATCH`, aligned the spec request table with the
  exported API, removed stale future-only Component version-gate prose, and
  corrected plan deviations. Re-review APPROVE with no findings.

## Extraction Slice Plan

The next Gate 12 slice extracts a shared pure TypeScript resolver kernel into
`packages/formspec-app-graph` without closing the gate.

Planned API:

- `resolveArtifacts(request): Promise<ArtifactResolutionReport>`
- `ArtifactResolverRequest` with parsed `manifest`, host-injected `loader`,
  optional support profile, manifest source label, digest, and schema id.
- `ArtifactLoader`, `ArtifactLoaderInput`, and `ArtifactLoaderOutcome` ports.
  The loader is the only I/O boundary. Tests use in-memory loaders; production
  filesystem, registry, object-store, cache, and network behavior stays out.

Implementation boundaries:

- Enumerate only App Manifest loadable slots covered by the prose contract:
  `definitions`, `experience`, `responseActions`, `component`, `components`,
  `theme`, `references`, `ontology`, `registries`, `surfaces`, `dataSources`,
  `locales`, and `mappings`.
- Preserve `ComponentRef.handle`, `LocaleRef.locale`, `MappingRef.handle`, and
  `x-*` ref evidence; reject or diagnose malformed refs without accepting
  fixture/path-derived identity fields.
- Enforce the App Manifest version gates for `dataSources[]` and
  `components[]` as artifact-resolution diagnostics.
- Produce deterministic `ArtifactResolutionReport` output with artifact groups
  named exactly like App Manifest members, opaque source `document` values,
  summary counts, and phase status.
- Perform discriminator, exact-version, and artifact-owned URL identity checks
  only after the loader returns a document. Full source schema validation and
  cross-artifact graph invariants remain `AppGraphValidator` work.

Required tests before commit:

- happy path with manifest plus multiple sibling groups,
- missing, unsupported, load-failed, and malformed-ref outcomes,
- discriminator mismatch,
- exact version mismatch,
- artifact-owned URL identity mismatch,
- `dataSources[]` v2.0 and `components[]` v2.0/v2.1 gates,
- deterministic output ordering and summary/`ok` derivation,
- `ComponentRef.handle`, `LocaleRef.locale`, and `MappingRef.handle`
  preservation, and
- `modules[]` / `sessions[]` are not loader inputs.

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
- [x] Extract `packages/formspec-app-graph/src/artifact-resolver.ts` as a
  shared pure TypeScript resolver kernel with host-injected loader port.
- [x] Export `resolveArtifacts`, `ArtifactResolverRequest`,
  `ArtifactLoader`, `ArtifactLoaderInput`, and `ArtifactLoaderOutcome` from
  `@formspec-org/app-graph`.
- [x] Add package tests for happy-path loading, malformed refs, missing,
  unsupported, thrown loader failure, discriminator mismatch, exact version
  mismatch, URL identity mismatch, `dataSources[]` / `components[]` version
  gates, support-profile failures, summary/`ok` derivation, ref evidence
  preservation, and no loader calls for `modules[]` / `sessions[]`.

## Still Open for Gate 12 Closure

- [ ] Define a resolver request schema/generated type only if future
  implementation inputs need a stable interchange artifact.
- [ ] Add fixture-backed source conformance for missing artifacts, unsupported schemes,
  discriminator mismatch, ref/version mismatch, identity mismatch, App
  Manifest v2.1 `dataSources[]` gating, App Manifest v2.2 `components[]`
  gating, and `ComponentRef.handle` preservation.
- [ ] Wire the resolver output into the shared `AppGraphValidator` request.
- [ ] Wire production consumers only after shared resolver and validator
  contracts are stable.

## Deviations

- 2026-05-25: Gate 12 is marked Partial, not Closed. The initial
  prose/interface contract was the first ordered step; the later shared kernel
  extracts manifest-ref loading and resolver diagnostic emission, but source
  conformance, AppGraphValidator/ModuleResolver integration, and production
  consumers remain open.
- 2026-05-25: `modules[]` and `sessions[]` remain manifest declarations rather
  than resolver-loaded artifact documents. The shared resolver kernel does not
  pass them to the loader; ModuleResolver and runtime/session ownership decide
  their semantics.
- 2026-05-25: App Manifest v2.2 `components[]` slot coverage started as a
  prose/status sync. The shared resolver kernel now emits
  `ARTIFACT-COMPONENTS-VERSION-GATE`, but source conformance fixtures and
  production consumer evidence for that failure family remain open.
- 2026-05-25: The output report schema and generated type are promoted before
  resolver extraction because they only pin the resolver output envelope. No
  request schema, source artifact validation, host I/O loader implementation,
  conformance fixture corpus, consumer wiring, runtime/projection behavior, or
  ADR 0152 authorization semantics are promoted.
- 2026-05-25: The shared resolver kernel uses in-memory package tests for the
  extraction slice. These tests prove API behavior but do not replace the
  source conformance fixture families required for Gate 12 closure. No lint,
  Studio, MCP, runtime, projection, AppGraphValidator request, or ModuleResolver
  consumer is wired to the kernel in this slice.

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
- Shared resolver kernel:
  `packages/formspec-app-graph/src/artifact-resolver.ts`.
- Shared resolver tests:
  `packages/formspec-app-graph/tests/artifact-resolver.test.ts`.
- Parent ADR gate update: stack-root
  `thoughts/adr/0153-formspec-app-graph-production-boundary.md`.
- Rollup update: stack-root
  `thoughts/2026-05-24-adr-0150-followons-and-gating.md`.
- Verification: `python -m pytest
  tests/conformance/schemas/test_artifact_resolution_report_schema.py -q`;
  `python -m pytest tests/conformance/schemas -q`;
  `npm run --workspace @formspec-org/app-graph test`;
  `npm run --workspace @formspec-org/app-graph build`;
  `npm run --workspace @formspec-org/types test`;
  `npm run --workspace @formspec-org/types build`;
  `npm run docs:filemap:check`; `npm run docs:check`; `npm run check:deps`;
  `git -C formspec diff --check`; stack-root `git diff --check`.
- Review: external review `019e5e04-93ef-73a3-97ce-5e738f382ffa`
  (Beauvoir), APPROVE with no findings.
- Review: external review `019e5e21-4834-77c2-8cc9-f3062a2b55b9`
  (Erdos), APPROVE with no findings after the root-required and diagnostic
  phase tests were added.
- Review: external review `019e5e31-182b-7640-b10d-37a1c5a97c0c`
  (Lagrange), APPROVE with no findings after the invalid-discriminator and
  stale-plan/prose findings were addressed.

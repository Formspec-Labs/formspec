# ADR 0153 ArtifactResolver Interface Partial Plan

**ADR:** stack-root `thoughts/adr/0153-formspec-app-graph-production-boundary.md`
**Row:** ArtifactResolver
**Status:** Partial; prose/interface boundary defined, extraction remains open
**Owner:** Formspec app-graph follow-on lane

## Scope

Advance ADR 0153 gate 12 without claiming extraction closure. This slice
defines the `ArtifactResolver` request/response boundary, loader port,
manifest slot coverage, handle metadata, identity rules, and diagnostic
vocabulary in prose.

Not in this slice: resolver package code, report JSON Schema, generated types,
fixture-backed conformance, production consumers, AppGraphValidator
cross-artifact checks, ModuleResolver admission/contribution logic, runtime
fetch/cache policy, Data Sources payload loading, or ADR 0152 fine-grained
authorization.

## Review Checkpoints

- 2026-05-25 architecture scout: APPROVE with Partial status. Required
  cautions: do not mark gate 12 Closed; preserve ADR 0153 production order
  (specs before schemas, implementation plan, shared extraction, fixtures/lint,
  then production wiring); keep module coherence/admission outside
  ArtifactResolver authority.

## Work Completed

- [x] Add `specs/app-graph/artifact-resolver-spec.md` as the prose-only
  interface contract.
- [x] Define request/response concepts and the host-supplied loader port.
- [x] Enumerate App Manifest v2.0/v2.1 loadable sibling slots and expected
  discriminators.
- [x] Separate loadable sibling artifacts from `modules[]` and `sessions[]`
  declarations.
- [x] Align handle concepts with `@formspec-org/app-graph`
  `ResolvedArtifactHandle`.
- [x] Define artifact-resolution diagnostics and imported-origin rules.
- [x] Keep fixture paths, filenames, URL suffixes, and directory scans out of
  identity authority.

## Still Open for Gate 12 Closure

- [ ] Promote schema/generated type surfaces only after the prose contract is
  stable and an implementation boundary is selected.
- [ ] Extract a shared resolver package or app-graph package module.
- [ ] Add fixture-backed conformance for missing artifacts, unsupported schemes,
  discriminator mismatch, ref/version mismatch, identity mismatch, and App
  Manifest v2.1 `dataSources[]` gating.
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

## Partial Evidence

- Spec: `specs/app-graph/artifact-resolver-spec.md`.
- Parent ADR gate update: stack-root
  `thoughts/adr/0153-formspec-app-graph-production-boundary.md`.
- Rollup update: stack-root
  `thoughts/2026-05-24-adr-0150-followons-and-gating.md`.
- Verification: `npm run docs:filemap:check`; `npm run docs:check`;
  `git -C formspec diff --check`; stack-root `git diff --check`.

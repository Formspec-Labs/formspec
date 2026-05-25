# ADR 0153 ModuleResolver Interface Partial Plan

**ADR:** stack-root `thoughts/adr/0153-formspec-app-graph-production-boundary.md`
**Row:** ModuleResolver
**Status:** Partial; prose/interface boundary defined, shared extraction remains open
**Owner:** Formspec app-graph follow-on lane

## Scope

Advance ADR 0153 gate 4 without claiming resolver extraction closure. This
slice defines the `ModuleResolver` request/response boundary, Registry index
input, app and sibling `modules[]` evidence, default module set semantics,
coarse admission evidence, version/dependency checks, contribution ownership,
payload-schema hook boundary, and module-resolution diagnostics in prose.

Not in this slice: Rust lint changes, shared resolver package code, report JSON
Schema, generated types, fixture-backed conformance, production consumers,
ArtifactResolver loading behavior, AppGraphValidator cross-artifact checks,
runtime execution, renderer fallback, E605 Component id collision ownership, v4
Posture sidecar promotion, or ADR 0152 fine-grained authorization.

## Review Checkpoints

- 2026-05-25 architecture scout: APPROVE with guards. Required cautions: keep
  gate 4 Partial; treat current Rust lint as a behavioral seed rather than the
  final API; exclude E605 Component id collision ownership; define optional
  host-supplied coarse admission evidence without requiring the v4 Posture
  sidecar.

## Work Completed

- [x] Add `specs/app-graph/module-resolver-spec.md` as the prose-only
  interface contract.
- [x] Define request/response concepts and the Registry index boundary.
- [x] Define App Manifest `modules[]`, sibling `modules[]`, and default module
  set semantics.
- [x] Define optional host coarse admission evidence without binding to a
  Posture sidecar.
- [x] Assign version, dependency, contribution ownership, category, and payload
  schema checks to `ModuleResolver`.
- [x] Keep E605 Component bundle id collision out of `ModuleResolver`.
- [x] Define module-resolution diagnostics and imported-origin rules for
  AppGraph reports.

## Still Open for Gate 4 Closure

- [ ] Promote schema/generated type surfaces only after the prose contract is
  stable and an implementation boundary is selected.
- [ ] Extract a shared resolver package or app-graph package module from the
  Rust lint and spike-local seeds without copying spike-only assumptions.
- [ ] Add fixture-backed conformance for admission, dependency, contribution,
  category, conflict, and payload failure families.
- [ ] Wire lint, Studio, MCPs, runtime, and projection consumers to the shared
  resolver output.
- [ ] Integrate `ModuleResolver` diagnostics into `AppGraphValidator` without
  duplicating module findings as native cross-artifact checks.

## Deviations

- 2026-05-25: Gate 4 remains Partial, not Closed. The prose/interface contract
  is an ordered prerequisite, but it does not extract shared resolver code or
  rewire module-consuming graph consumers.
- 2026-05-25: The current Rust `pass_modules` implementation is treated as
  evidence for E603/E604 semantics only. E605 stays outside this resolver
  contract.
- 2026-05-25: Host-supplied admission evidence replaces any dependency on the
  v4 spike Posture sidecar. Fine-grained authorization remains ADR 0152 work.

## Partial Evidence

- Spec: `specs/app-graph/module-resolver-spec.md`.
- Parent ADR gate update: stack-root
  `thoughts/adr/0153-formspec-app-graph-production-boundary.md`.
- Rollup update: stack-root
  `thoughts/2026-05-24-adr-0150-followons-and-gating.md`.
- Verification: `npm run docs:filemap:check`; `npm run docs:check`;
  `git -C formspec diff --check`; stack-root `git diff --check`.

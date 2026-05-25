# ADR 0153 AppGraphValidator Interface Closure Plan

**ADR:** stack-root `thoughts/adr/0153-formspec-app-graph-production-boundary.md`
**Row:** AppGraphValidator interface
**Status:** Closed for ADR 0153 gate 3a; extraction, schemas, conformance, and consumers remain in later rows
**Owner:** Formspec app-graph follow-on lane

## Scope

Close ADR 0153 gate 3a without promoting spike-local machinery: define the
production `AppGraphValidator` interface in prose, including input handles,
report shape, diagnostic envelope, source schema validation boundary, and
cross-artifact invariant ownership.

Not in this row: report JSON Schema, generated types, shared package extraction,
fixtures, conformance corpus expansion, lint/Studio/MCP/runtime/projection
consumer wiring, ArtifactResolver extraction, ModuleResolver extraction, or
fine-grained authorization.

## Evidence Before Work

- `spikes/wireframe-generator-v4/src/app-graph.ts` proves a useful report shape
  but is spike-local and binds to v4 fixture inputs and schema IDs.
- `spikes/wireframe-generator-v4/src/artifact-resolver.ts` is fixture-path based
  and cannot become production identity or fetch policy.
- `spikes/wireframe-generator-v4/src/coherence.ts` proves cross-artifact
  invariant families but mixes module, resolver, UI policy, Data Sources,
  Surface, authorization, and projection concerns.
- `crates/formspec-lint/src/pass_surface.rs` and
  `crates/formspec-lint/src/pass_modules.rs` already own Surface-local and
  module contribution diagnostics for the current lint surface.
- `../formspec-studio/packages/formspec-studio-core/src/kernel/ProposalManagerFacade.ts`
  owns Surface draft/export authoring diagnostics, not published app-graph
  validation.

## Review Checkpoints

- 2026-05-24 architecture scout: APPROVE. Approved a prose-only
  `AppGraphValidator` interface spec for gate 3a. Required cautions: do not add
  a report schema, generated types, fixtures, runtime packages, or consumer
  wiring; keep resolver/module/surface-local diagnostics as imported/pass-through
  phases; define inputs as resolved typed handles rather than fetch capability;
  keep authorization binary/fail-closed until ADR 0152.
- 2026-05-24 prose review: REQUEST CHANGES. Findings: Surface handle identity
  wording incorrectly risked treating Surface-local `id` as canonical sibling
  identity, and Component route identity was described as not validator-owned
  even though ADR 0154 assigns future Component graph checks to
  `AppGraphValidator`.
- 2026-05-25 architecture checkpoint (Planck): APPROVE a docs/status-only
  self-authoring hygiene slice before more schema work. Required cautions:
  include `AppGraphValidator` with ModuleResolver and UI Graph Policy; keep
  specs direct-authority; do not add schemas, generated types, fixtures, lint
  codes, behavior changes, production consumers, runtime/projection wiring, or
  authorization semantics.

## Work Phases

### Phase 1 - Prose Interface Contract

- [x] Add `specs/app-graph/app-graph-validator-spec.md`.
- [x] Define validator request inputs: App Manifest handle, resolved artifact
  handles, schema registry/support profile, ArtifactResolver report,
  ModuleResolver report, and non-fetch options.
- [x] Define validation order from imported resolver diagnostics through schema
  validation, skipped graph phases, cross-artifact invariants, and
  authorization-boundary checks.
- [x] Define report shape: `ok`, summary counts, schema results, diagnostics,
  phases, and optional support profile echo.
- [x] Define diagnostic shape with code, severity, phase, origin, message,
  primary source, related sources, and details.

### Phase 2 - Ownership Boundary

- [x] Assign ArtifactResolver, ModuleResolver, Surface-local lint/export, and
  AppGraphValidator ownership explicitly.
- [x] Keep Surface route graph, module admission, artifact loading, runtime
  execution, Component projection, Data Sources payload fetching, and ADR 0152
  authorization semantics outside this row.
- [x] State that imported diagnostics may appear in the final report only with
  their origin preserved.
- [x] Clarify that the spec is self-authoring: ADRs record provenance, while
  the spec states the `AppGraphValidator` contract directly.

### Phase 3 - Status Updates

- [x] Update stack ADR 0153 gate 3a to Closed with prose-spec evidence.
- [x] Update the stack rollup execution log.
- [x] Leave gates 3b, 3c, 4, 10, 11, and 12 open/held.

## Deviations

- 2026-05-24: This row intentionally does not register a
  `scripts/spec-artifacts.config.json` entry because there is no report schema in
  gate 3a. Registering a spec/schema pair would imply the schema phase has
  started, which belongs to later ADR 0153 gates.
- 2026-05-24: No conformance fixtures were added. Gate 3a closes prose only; the
  conformance corpus remains gate 11.
- 2026-05-24: Surface identity wording was narrowed after review. Surface `id`
  is local route namespace evidence; canonical Surface sibling identity remains
  App Manifest `surfaces[]` URL/version.
- 2026-05-24: Component projection/rendering stays outside the validator, but
  future ADR 0154 Component Surface/route graph identity checks are explicitly
  assigned to `AppGraphValidator` after ADR 0154 gates land.
- 2026-05-25: The self-authoring hygiene pass changed only spec authority
  wording. It did not reopen gate 3a or claim additional extraction,
  conformance, consumer, runtime, projection, or authorization closure.

## Closure Evidence

Closed for ADR 0153 gate 3a:

- Prose: `specs/app-graph/app-graph-validator-spec.md` defines the validator
  request, artifact handle, validation order, report shape, diagnostic shape,
  source schema validation boundary, invariant ownership, and unsupported /
  authorization behavior.
- Boundary: The spec states that `AppGraphValidator` consumes
  `ArtifactResolver` handles and `ModuleResolver` output but does not fetch,
  discover, synthesize, render, execute, or duplicate resolver/module checks.
- Imported diagnostics: Artifact resolution, module resolution, and
  Surface-local diagnostics are reportable only with origin preserved.
- Deferred gates: report JSON Schema, generated types, shared package
  extraction, fixtures, conformance, production consumers, and ADR 0152
  fine-grained authorization remain outside this closure.
- Review: architecture scout APPROVE for prose-only closure.
- Hygiene review: architecture checkpoint `019e5e08-84f0-7100-beaa-fcd50852b3a1`
  (Planck), APPROVE for direct spec authority before the next schema slice.
- Hygiene code review: `019e5e0e-c05d-75c1-8d07-f7d6f98f8931` (Dalton),
  REVISE for one remaining ModuleResolver ADR dependency, then APPROVE after
  the E605 ownership wording became direct spec authority.

Not part of this row's closure: shared `ArtifactResolver` / `ModuleResolver` /
`AppGraphValidator` extraction and production consumer rewiring. Those remain
tracked by ADR 0153 gates 3b, 3c, 4, 11, and 12.

# ADR 0153 UI Graph Policy Interface Partial

**Date:** 2026-05-25
**Status:** Partial
**Gate:** ADR 0153 gates 9a-9d
**Owner:** Formspec app-graph rollout

## Scope

This plan tracks the UI Graph Policy interface contract. It defines the
app-graph policy boundary for module Locale key ownership, route accessibility,
responsive collapse order, hidden Definition refs, and Theme token assignments
to module widget token slots.

The current slices promote the structural source schema, generated TypeScript
type, and host-supplied loading evidence. They do not promote an App Manifest
slot, ArtifactResolver group, `AppGraphValidator` implementation,
ModuleResolver token-slot enforcement, runtime responsive behavior, renderer
behavior, Studio wiring, or ADR 0152 authorization semantics.

## Review Checkpoint

Leibniz approved UI graph policy as the next strict slice after the ADR 0154
Component 1.2 prose partial. The review boundary was:

- place the prose contract at `specs/app-graph/ui-graph-policy-spec.md`;
- define this as app-graph UI policy, not the existing shared UI authoring
  policy;
- keep `specs/ui-policy.json` authoritative for component/widget compatibility,
  fallback policy, responsive prop allowlists, breakpoint namespace, and token
  warning hooks;
- define target Surface, route-scoped accessibility policy, responsive collapse
  order, module Locale key ownership, optional hidden Definition refs, and Theme
  token assignments to module widget token slots;
- define diagnostics as future AppGraphValidator cross-artifact/policy
  diagnostics;
- mark gates 9a-9d Partial, not Closed;
- forbid schema, App Manifest slot, code, generated types, fixtures,
  conformance rows, spike sidecar promotion, runtime responsive behavior,
  per-widget implementation policy, authorization semantics, and Surface
  ownership inversion.

Planck approved a docs/status-only self-authoring hygiene slice before schema
work. The checkpoint required direct spec authority, ADRs as provenance only,
and no schema, generated types, fixtures, lint codes, AppGraphValidator
behavior, App Manifest policy slot, production consumers, runtime/projection
wiring, or authorization semantics.

Dalton approved the hygiene slice after one ModuleResolver wording revision;
there were no UI Graph Policy findings.

Cicero approved a narrow source-shape phase after the Component route-target
conformance slice. Required boundary: add a structural schema/contract and
host-supplied loading rule only; do not add an App Manifest slot, App Manifest
v2.3, ArtifactResolver group/report changes, AppGraphValidator enforcement,
ModuleResolver/Registry token-slot enforcement, runtime hidden-state handling,
Response Actions behavior, or ADR 0152 authorization fields.

Cicero approved a follow-on generated-type slice. Required boundary: add
`UiGraphPolicyDocument` generated TypeScript support only; no App Manifest slot
or v2.3, ArtifactResolver group/report changes, AppGraphValidator enforcement
or origin changes, ModuleResolver token-slot work, runtime hidden-state
behavior, Studio/MCP/projection/renderer/production consumer wiring, ADR 0152
authorization fields, pseudo artifact kind, or document-shape/path-derived
identity.

Cicero approved a static semantic fixture corpus before host-loaded validator
enforcement. Required boundary: fixture/report-shape evidence only, using
`origin: "ui-graph-policy"` as future diagnostic evidence without validating
against the current `AppGraphValidationReport` schema; no App Manifest slot,
ArtifactResolver grouping, AppGraphValidator enforcement/report-origin changes,
ModuleResolver token-slot enforcement, runtime hidden-state behavior,
Studio/MCP/projection/renderer/consumer wiring, ADR 0152 authorization fields,
pseudo artifact kind, or path/document-shape identity.

Cicero approved a report-origin readiness slice after the semantic fixture
corpus. Required boundary: admit `ui-graph-policy` as a known
`AppGraphValidationReport` diagnostic origin and update generated/local types
and tests only; do not add a validator emitter, executable UI Graph Policy
conformance, App Manifest slot, ArtifactResolver grouping, host-loading rule,
ModuleResolver/Registry token-slot work, Studio/runtime/projection consumers, or
ADR 0152 authorization semantics.

Cicero approved a host-supplied evidence boundary before executable validator
integration. Required boundary: define `hostEvidence.uiGraphPolicies[]` as
explicit request evidence with fixed UI Graph Policy schema id, opaque source,
and schema-valid document; do not add an App Manifest slot, ArtifactResolver
grouping, fake policy `artifactKind`, validator emission, request JSON Schema,
ModuleResolver/Registry token-slot work, runtime behavior, Studio/projection
consumers, path/document-shape discovery, or ADR 0152 authorization semantics.

## Completed

- `specs/app-graph/ui-graph-policy-spec.md` defines the UI Graph Policy request
  boundary over already resolved Surface, Locale, Theme, Registry,
  ModuleResolver, and Definition evidence.
- The spec distinguishes UI Graph Policy from `specs/ui-policy.json`.
- The spec defines conceptual policy fields for `targetSurface`,
  `localeKeyOwners[]`, `routePolicies[]`, and `theme.assignments[]`.
- The spec names initial imported diagnostic codes with
  `origin: "ui-graph-policy"` and `phase: "cross-artifact"` as future
  report-profile work.
- The spec is self-authoring: ADRs record provenance, while the spec states the
  UI Graph Policy contract directly.
- ADR 0153 and the stack rollup record gates 9a-9d as Partial.
- `schemas/ui-graph-policy.schema.json` defines the v0.1 structural source
  contract for host-loaded policy evidence.
- `scripts/spec-artifacts.config.json`,
  `specs/app-graph/ui-graph-policy-spec.bluf.md`,
  `specs/app-graph/ui-graph-policy-spec.llm.md`, and
  `tests/contracts/surface-coverage.json` make the source contract first-class
  in the repo's generated spec artifacts and contract-surface ledger.
- Structural schema fixtures and `tests/conformance/schemas/test_ui_graph_policy_schema.py`
  cover positive shape, spike-discriminator rejection, path-identity rejection,
  locale prefix shape, and authorization-field rejection.
- `packages/formspec-types/src/generated/ui-graph-policy.ts` and the generated
  barrel export publish `UiGraphPolicyDocument` for the structural source
  contract only.
- `packages/formspec-types/tests/schema-sync.test.ts` covers
  `UiGraphPolicyDocument` importability.
- `tests/conformance/fixtures/ui-graph-policy/semantic/core-policy-families.case.json`
  captures source-oriented semantic cases for valid policy graph, target Surface
  mismatch, missing route coverage, duplicate route policy, unresolved route,
  unresolved responsive slot, unresolved hidden Definition, non-route-local
  hidden Definition, missing Locale owner, Locale owner collision, unresolved
  or unadmitted widget, and undeclared token slot families.
- `tests/conformance/test_ui_graph_policy_semantic_fixture_corpus.py` validates
  semantic fixture family coverage, local expected diagnostic shape, structural
  validity of each policy document, and no path-derived identity,
  App Manifest slot, spike discriminator, or ADR 0152 authorization leakage.
- `schemas/app-graph-validation-report.schema.json`, generated
  `packages/formspec-types/src/generated/app-graph-validation-report.ts`, and
  `packages/formspec-app-graph/src/types.ts` admit `ui-graph-policy` as a known
  report diagnostic origin while preserving the `x-*` extension lane and
  rejecting arbitrary non-extension origins.
- `specs/app-graph/ui-graph-policy-spec.md`,
  `specs/app-graph/app-graph-validator-spec.md`,
  `tests/conformance/fixtures/ui-graph-policy/host-loaded/valid-host-evidence.case.json`,
  and `tests/conformance/test_ui_graph_policy_host_loaded_fixture_corpus.py`
  define and pin `hostEvidence.uiGraphPolicies[]` as explicit host-supplied
  request evidence, not App Manifest loading, ArtifactResolver grouping,
  path-derived identity, or ADR 0152 authorization policy.

## Still Open For Closure

- Optional future App Manifest loading slot if the package contract later
  chooses one.
- Executable AppGraphValidator integration and diagnostic emission.
- Executable AppGraphValidator conformance over the semantic fixture families.
- ModuleResolver/Registry token-slot evidence integration.
- Studio and authoring feedback.
- Runtime hidden Definition state enforcement where applicable.

## Verification

- `python -m pytest tests/conformance/schemas/test_ui_graph_policy_schema.py -q`
- `python -m pytest tests/conformance/schemas/test_app_graph_validation_report_schema.py -q`
- `python -m pytest tests/conformance/test_ui_graph_policy_host_loaded_fixture_corpus.py -q`
- `python -m pytest tests/conformance/test_ui_graph_policy_semantic_fixture_corpus.py -q`
- `npm run --workspace @formspec-org/types test -- tests/schema-sync.test.ts`
- `npm run --workspace @formspec-org/app-graph test -- app-graph-validator.test.ts`
- `npm run docs:filemap`
- `npm run docs:filemap:check`
- `npm run docs:check`
- `git -C formspec diff --check`
- `git diff --check`

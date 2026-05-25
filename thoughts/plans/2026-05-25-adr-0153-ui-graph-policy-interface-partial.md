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
type, host-supplied loading evidence, executable host-evidence schema result
reporting, Surface/route semantic diagnostics, and policy-local Locale-owner
diagnostics plus Locale-owner ModuleResolver evidence checks and hidden
Definition reference diagnostics in the shared AppGraphValidator kernel. They do
not promote an App Manifest slot, ArtifactResolver group, Theme token-slot
checks, Registry token-slot resolution, runtime hidden-state or responsive
behavior, renderer behavior, Studio wiring, or ADR 0152 authorization semantics.

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

Cicero approved a host-evidence schema result refinement for the executable
AppGraphValidator slice. Required boundary: keep artifact `schemaValidators`
and `schemaResults[]` artifact-only; add explicit `evidenceSchemaValidators`
and `evidenceResults[]` for `hostEvidence.uiGraphPolicies[]`; do not count
host-evidence not-run state under `summary.unvalidatedArtifacts`; keep evidence
diagnostics limited to `artifactSlot`, `source`, and `jsonPointer`; do not add
semantic UI Graph Policy diagnostics.

Cicero approved the first semantic AppGraphValidator slice for Surface/route
families only. Required boundary: emit `UI-POLICY-SURFACE-TARGET`,
`UI-POLICY-ROUTE-COLLISION`, `UI-POLICY-ROUTE-REF`,
`UI-POLICY-ROUTE-MISSING`, and `UI-POLICY-RESPONSIVE-SLOT` over schema-valid
`hostEvidence.uiGraphPolicies[]` and loaded Surface handles; match
`document.targetSurface.url` only against loaded Surface `ref.url`; keep policy
pointers evidence-only; do not emit Locale owner, Theme token-slot, hidden
Definition, ModuleResolver/Registry, runtime, consumer, App Manifest slot, or
ADR 0152 authorization diagnostics.

Pasteur and Cicero approved the follow-on Locale-owner semantic slice. Required
boundary: after schema-valid host evidence and exact target Surface resolution,
emit only `LOCALE-KEY-OWNER` for loaded Locale `$module.*` keys not covered by
declared prefixes and `LOCALE-KEY-OWNER-COLLISION` for exact or proper-prefix
overlap across different `moduleId` values; do not fold keyPrefix/moduleId
module-segment mismatch into `LOCALE-KEY-OWNER`; same-module overlap is valid;
no loaded Locale evidence means no missing-owner diagnostic; keep policy
pointers evidence-only and Locale pointers as normal artifact pointers; do not
emit Theme, hidden Definition, ModuleResolver, runtime, App Manifest slot, or
ADR 0152 authorization diagnostics.

Pasteur and Cicero approved a policy-local Locale-owner module-segment slice
before ModuleResolver integration. Required boundary: emit
`LOCALE-KEY-OWNER-MODULE-MISMATCH` for owner declarations whose `moduleId`
does not match the module segment in `keyPrefix`; primary pointer is policy
evidence `/localeKeyOwners/{i}/moduleId`, related pointer is policy evidence
`/localeKeyOwners/{i}/keyPrefix`; run only after schema-valid host evidence and
exact target Surface resolution; require no loaded Locale handles; do not
consume `ModuleResolutionReport`, widen AppGraph source pointers, emit Theme,
hidden Definition, runtime, App Manifest slot, TraceIndex, or ADR 0152
authorization diagnostics.

Pasteur and Cicero approved an executable hidden Definition reference slice.
Required boundary: emit `UI-POLICY-HIDDEN-DEFINITION-REF` only for schema-valid
host policy evidence after exact target Surface and route resolution; resolve
Definitions by loaded handle `ref.url` plus exact `ref.version` when the policy
declares one; require a route-local `definition-form` slot whose
`binding.definitionRef` matches the hidden Definition URL; skip hidden checks
when the route itself is unresolved or the policy target Surface mismatches; do
not add runtime hidden-state enforcement, Theme token-slot diagnostics,
ModuleResolver/Registry integration, App Manifest slot, ArtifactResolver
changes, TraceIndex, ADR 0152 authorization, source-pointer widening, or
Component identity changes.

Copernicus approved the hidden Definition implementation after resolving stale
spec, generated LLM-reference, and contract-surface coverage wording. There
were no remaining code or contract findings.

Pasteur and Cicero approved the Locale-owner ModuleResolver evidence slice with
changes. Required boundary: emit `LOCALE-KEY-OWNER-MODULE-REF` only when a
completed `ModuleResolutionReport` is supplied and a policy owner `moduleId`
does not resolve to an admitted module; preserve collision and
keyPrefix/moduleId mismatch precedence; keep policy primary pointers
evidence-only; sanitize ModuleResolver related sources so resolver-only
`source.module` evidence does not enter the AppGraph report; do not duplicate
top-level ModuleResolver diagnostics; do not emit Theme token-slot, Registry
token-slot, runtime, TraceIndex, App Manifest slot, ArtifactResolver, or ADR
0152 authorization diagnostics.

Copernicus and Carson approved a narrow Theme widgetRef slice after rejecting
full Theme token-slot execution as not tractable under current contracts.
Required boundary: emit `THEME-TOKEN-WIDGET` only for schema-valid host policy
evidence after exact target Surface resolution and only when a completed
`ModuleResolutionReport` lacks a matching admitted `widget` contribution owned
by the policy `widgetRef.moduleId`; use ModuleResolver contribution evidence
with site `ui-graph-policy.theme.assignments.widgetRef`; skip the check when
ModuleResolver is absent, not-run, or skipped; do not read Registry directly,
parse v4 `semantics.themeTokenSlots`, reimplement ModuleResolver, emit
`THEME-TOKEN-SLOT`, resolve assignment `token`, check token-category
compatibility, add TraceIndex/runtime/auth/App Manifest/ArtifactResolver policy
diagnostics, or leak resolver-only source fields into UI policy diagnostics.

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
- `packages/formspec-app-graph/src/validator.ts`,
  `packages/formspec-app-graph/src/types.ts`,
  `packages/formspec-app-graph/src/report.ts`,
  `schemas/app-graph-validation-report.schema.json`, and generated
  `packages/formspec-types/src/generated/app-graph-validation-report.ts` add
  executable host-evidence schema result reporting through
  `evidenceSchemaValidators` and `evidenceResults[]` while preserving
  artifact-only `schemaValidators`, artifact-only `schemaResults[]`, and
  artifact-only `summary.unvalidatedArtifacts`.
- `packages/formspec-app-graph/src/ui-graph-policy.ts`,
  `packages/formspec-app-graph/tests/ui-graph-policy-conformance.test.ts`, and
  `tests/conformance/fixtures/app-graph-validator/ui-graph-policy-surface-routes.case.json`
  add executable Surface/route diagnostics for target Surface mismatch, route
  policy collision, unresolved route, missing route coverage, and unresolved
  responsive slot references.
- `tests/conformance/test_app_graph_ui_policy_surface_route_fixture_corpus.py`
  pins the executable fixture corpus and verifies that Locale owner, Theme
  token-slot, hidden Definition, path-identity, and ADR 0152 authorization
  families remain out of this slice.
- `packages/formspec-app-graph/src/ui-graph-policy.ts`,
  `packages/formspec-app-graph/tests/ui-graph-policy-locale-conformance.test.ts`,
  and
  `tests/conformance/fixtures/app-graph-validator/ui-graph-policy-locale-owners.case.json`
  add executable Locale-owner diagnostics for missing owner coverage and
  exact/proper-prefix owner collisions over loaded Locale evidence.
- `packages/formspec-app-graph/src/ui-graph-policy.ts`,
  `packages/formspec-app-graph/tests/ui-graph-policy-locale-conformance.test.ts`,
  and
  `tests/conformance/fixtures/app-graph-validator/ui-graph-policy-locale-owners.case.json`
  add executable policy-local Locale-owner module-segment mismatch diagnostics.
- `tests/conformance/test_app_graph_ui_policy_locale_owner_fixture_corpus.py`
  pins the executable Locale-owner fixture corpus, policy evidence-only
  pointers, Locale artifact pointers, zero-loaded-Locale behavior,
  keyPrefix/moduleId mismatch behavior, completed/skipped/not-run ModuleResolver
  evidence behavior, ModuleResolver source sanitization, and no
  TraceIndex/path/auth leakage.
- `packages/formspec-app-graph/src/ui-graph-policy.ts`,
  `packages/formspec-app-graph/src/report.ts`,
  `packages/formspec-app-graph/tests/ui-graph-policy-locale-conformance.test.ts`,
  and
  `tests/conformance/fixtures/app-graph-validator/ui-graph-policy-locale-owners.case.json`
  add executable Locale-owner ModuleResolver evidence diagnostics for missing
  and non-admitted policy owner modules without widening AppGraph report source
  pointers or reimplementing ModuleResolver.
- `packages/formspec-app-graph/src/ui-graph-policy.ts`,
  `packages/formspec-app-graph/tests/ui-graph-policy-hidden-definition-conformance.test.ts`,
  and
  `tests/conformance/fixtures/app-graph-validator/ui-graph-policy-hidden-definitions.case.json`
  add executable hidden Definition reference diagnostics for unresolved loaded
  Definitions, version mismatch, and non-route-local `definition-form` slots.
- `tests/conformance/test_app_graph_ui_policy_hidden_definition_fixture_corpus.py`
  pins hidden Definition evidence-only policy pointers, normal Surface related
  pointers, unresolved-route and target-mismatch cascade guards, version-match
  behavior, and no Theme/TraceIndex/path/auth leakage.
- `packages/formspec-app-graph/src/ui-graph-policy.ts`,
  `packages/formspec-app-graph/src/report.ts`,
  `packages/formspec-app-graph/tests/ui-graph-policy-theme-conformance.test.ts`,
  and
  `tests/conformance/fixtures/app-graph-validator/ui-graph-policy-theme-widgets.case.json`
  add executable `THEME-TOKEN-WIDGET` diagnostics for missing, unadmitted, and
  wrong-owner Theme `widgetRef` contribution evidence using completed
  ModuleResolver reports only, while imported ModuleResolver host-evidence
  pointers are clamped to evidence-only source shape.
- `tests/conformance/test_app_graph_ui_policy_theme_widget_fixture_corpus.py`
  pins Theme widgetRef evidence-only policy pointers, completed/absent/not-run/
  skipped ModuleResolver behavior, target-mismatch cascade guards, absence of
  related resolver sources on `THEME-TOKEN-WIDGET`, imported ModuleResolver
  host-evidence pointer sanitization, and no `THEME-TOKEN-SLOT`,
  TraceIndex/path/auth leakage.

## Still Open For Closure

- Optional future App Manifest loading slot if the package contract later
  chooses one.
- Theme token-slot semantic diagnostics (`THEME-TOKEN-SLOT`).
- Registry token-slot evidence integration and token-category compatibility.
- Studio and authoring feedback.
- Runtime hidden Definition state enforcement where applicable.

## Verification

- `python -m pytest tests/conformance/schemas/test_ui_graph_policy_schema.py -q`
- `python -m pytest tests/conformance/schemas/test_app_graph_validation_report_schema.py -q`
- `python -m pytest tests/conformance/test_ui_graph_policy_host_loaded_fixture_corpus.py -q`
- `python -m pytest tests/conformance/test_app_graph_ui_policy_locale_owner_fixture_corpus.py -q`
- `python -m pytest tests/conformance/test_app_graph_ui_policy_hidden_definition_fixture_corpus.py -q`
- `python -m pytest tests/conformance/test_app_graph_ui_policy_theme_widget_fixture_corpus.py -q`
- `python -m pytest tests/conformance/test_app_graph_ui_policy_surface_route_fixture_corpus.py -q`
- `python -m pytest tests/conformance/test_ui_graph_policy_semantic_fixture_corpus.py -q`
- `npm run --workspace @formspec-org/types test -- tests/schema-sync.test.ts`
- `npm run --workspace @formspec-org/app-graph test -- app-graph-validator.test.ts ui-graph-policy-conformance.test.ts ui-graph-policy-hidden-definition-conformance.test.ts ui-graph-policy-locale-conformance.test.ts ui-graph-policy-theme-conformance.test.ts`
- `npm run docs:filemap`
- `npm run docs:filemap:check`
- `npm run docs:check`
- `git -C formspec diff --check`
- `git diff --check`

## Deviations

- 2026-05-25 Theme widgetRef slice: full `THEME-TOKEN-SLOT` execution is
  deferred because Registry and ModuleResolver reports do not yet expose stable
  widget token-slot evidence. This slice lands only `THEME-TOKEN-WIDGET`
  against completed ModuleResolver widget contribution evidence.
- 2026-05-25 Theme widgetRef slice: `THEME-TOKEN-WIDGET` diagnostics do not
  attach ModuleResolver contribution related sources. The contribution evidence
  is used for matching, while the emitted policy diagnostic remains
  evidence-only at `hostEvidence.uiGraphPolicies[N]`.
- 2026-05-25 Theme widgetRef slice: imported top-level ModuleResolver
  diagnostics may point at host evidence. `AppGraphValidator` now strips
  `artifactKind` and `ref` for imported host-evidence source pointers so
  ModuleResolver evidence cannot promote a pseudo policy artifact identity.

## Closure Evidence

- 2026-05-25 Theme widgetRef executable evidence: targeted Vitest
  `npm run --workspace @formspec-org/app-graph test -- ui-graph-policy-theme-conformance.test.ts app-graph-validator.test.ts`
  passed with 27 tests after adding imported ModuleResolver host-evidence
  pointer sanitization.
- 2026-05-25 Theme widgetRef fixture integrity:
  `python -m pytest tests/conformance/test_app_graph_ui_policy_theme_widget_fixture_corpus.py -q`
  passed with 6 tests.
- 2026-05-25 generated docs gate: `npm run docs:check` passed, including
  generated Theme/spec artifacts, spec contract tests (188 passed), contract
  surface metadata tests (452 passed, 4 upstream jsonschema deprecation
  warnings), relocated-path checks, and changeset tier placement.

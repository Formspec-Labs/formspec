# ADR 0153 UI Graph Policy Closure Plan

**Date:** 2026-05-24
**Status:** Partial
**Gate:** ADR 0153 gates 9a-9d
**Owner:** Formspec app-graph rollout

## Scope

Close UI Graph Policy from host-loaded structural evidence to executable
AppGraphValidator semantics without promoting an App Manifest policy slot,
ArtifactResolver group, ADR 0152 authorization fields, runtime hidden-state
behavior, renderer behavior, Studio wiring, or production consumers before
their gates.

This row spans:

- module Locale key ownership;
- route accessibility policy and route coverage;
- responsive route slot collapse references;
- optional hidden Definition references; and
- Theme token assignments to module widget token slots.

## Current State

- Structural source contract, generated TypeScript type, host-evidence boundary,
  report-origin readiness, and host-evidence schema result reporting are landed.
- Surface/route and Locale-owner executable diagnostics are in progress for
  `UI-POLICY-SURFACE-TARGET`, `UI-POLICY-ROUTE-COLLISION`,
  `UI-POLICY-ROUTE-REF`, `UI-POLICY-ROUTE-MISSING`, and
  `UI-POLICY-RESPONSIVE-SLOT`, plus `LOCALE-KEY-OWNER` and
  `LOCALE-KEY-OWNER-COLLISION`, and
  `LOCALE-KEY-OWNER-MODULE-MISMATCH`.
- Locale owner ModuleResolver-backed module-id resolution, hidden Definition,
  Theme token-slot, ModuleResolver/Registry, runtime, Studio, projection,
  consumer, and optional future App Manifest slot work remains open.

## Phase Order

1. Keep prose/spec authority direct in `specs/app-graph/ui-graph-policy-spec.md`;
   ADRs and this plan remain provenance/status.
2. Preserve the closed structural schema and generated type for host-loaded
   policy documents.
3. Pin source fixtures for every promoted semantic family before production
   consumers.
4. Add shared AppGraphValidator executable diagnostics family by family.
5. Only after semantic families close, wire lint/Studio/MCP/runtime consumers.

## Deviations

- The host-loaded evidence boundary intentionally avoids an App Manifest
  `uiPolicy` / `uiGraphPolicy` slot. That slot remains optional future work.
- `summary.importedDiagnostics` treats `ui-graph-policy` as a native validator
  origin because the shared kernel emits those diagnostics after schema-valid
  host evidence; resolver, module, surface-local, and extension origins remain
  imported.

## Closure Evidence

Current partial evidence:

- `specs/app-graph/ui-graph-policy-spec.md`
- `schemas/ui-graph-policy.schema.json`
- `schemas/app-graph-validation-report.schema.json`
- `packages/formspec-types/src/generated/ui-graph-policy.ts`
- `packages/formspec-app-graph/src/validator.ts`
- `packages/formspec-app-graph/src/ui-graph-policy.ts`
- `tests/conformance/fixtures/ui-graph-policy/`
- `tests/conformance/fixtures/app-graph-validator/ui-graph-policy-locale-owners.case.json`
- `tests/conformance/fixtures/app-graph-validator/ui-graph-policy-surface-routes.case.json`
- `tests/conformance/schemas/test_ui_graph_policy_schema.py`
- `tests/conformance/schemas/test_app_graph_validation_report_schema.py`
- `tests/conformance/test_ui_graph_policy_host_loaded_fixture_corpus.py`
- `tests/conformance/test_ui_graph_policy_semantic_fixture_corpus.py`
- `tests/conformance/test_app_graph_ui_policy_locale_owner_fixture_corpus.py`
- `tests/conformance/test_app_graph_ui_policy_surface_route_fixture_corpus.py`
- `packages/formspec-app-graph/tests/ui-graph-policy-locale-conformance.test.ts`
- `packages/formspec-app-graph/tests/ui-graph-policy-conformance.test.ts`

Closure still requires Locale owner ModuleResolver-backed module-id resolution,
hidden Definition, Theme token-slot, ModuleResolver/Registry token-slot
evidence, consumer wiring, and final rollup gate transition.

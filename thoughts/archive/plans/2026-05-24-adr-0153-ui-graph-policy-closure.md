# ADR 0153 UI Graph Policy Closure Plan

**Date:** 2026-05-24
**Status:** Partial
**Gate:** ADR 0153 gates 9a-9d
**Owner:** Formspec app-graph rollout

## Scope

Close UI Graph Policy from host-loaded structural evidence to executable
AppGraphValidator semantics without promoting an App Manifest policy slot,
ArtifactResolver group, ADR 0152 authorization fields, runtime hidden-state
behavior, Studio wiring, or broad production consumers before their gates.

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
  `LOCALE-KEY-OWNER-MODULE-MISMATCH`, plus
  `UI-POLICY-HIDDEN-DEFINITION-REF`.
- Locale owner ModuleResolver-backed module-id resolution, Theme widgetRef,
  ModuleResolver/Registry token-slot evidence, and executable Theme token-slot
  diagnostics are landed.
- Raw Theme token-key source shape, exactly-one loaded Theme evidence, and
  widget-slot category-prefix evidence are pinned for executable
  token-reference/category diagnostics.
- AppGraphValidator, not layout, owns `targetSurface.version` compatibility
  against the loaded Surface ref using npm `semver` exact/range semantics; the
  Surface-route fixture corpus pins compatible range, incompatible range, and
  malformed range fail-closed cases.
- `@formspec-org/layout` now has the first projection-only non-validator
  consumer: `PlanContext.hostEvidence.uiGraphPolicies[]` accepts generated
  `UiGraphPolicyDocument` host evidence only alongside a completed
  `AppGraphValidationReport`, then emits inert `LayoutNode.uiGraphRoutePolicy`
  metadata for the matching target Surface URL and route id. The projection
  copies route `a11y` and `responsive` metadata only; it does not copy hidden
  Definition policy, validate evidence, check Surface version compatibility,
  fetch policies, discover App Manifest slots, mutate layout order, set ARIA,
  or block drafts/actions.
- `<formspec-render>` now exposes host-supplied `hostEvidence` for the same
  projection boundary and emits `LayoutNode.uiGraphRoutePolicy` as inert
  `data-formspec-ui-policy-*` metadata on rendered route roots. It does not
  validate AppGraph reports, fetch policy documents, apply ARIA/responsive
  behavior, or infer hidden-state rejection.
- `@formspec-org/react` now accepts `FormspecProvider.hostEvidence`, passes the
  same projection-only evidence snapshot into layout planning, and emits inert
  `data-formspec-ui-policy-*` metadata on the validated route root. `formspec-web`
  loads that snapshot through the single optional `DefinitionSource.getLayoutHostEvidence()`
  sidecar and passes it to the React respondent runtime without widening
  `getDefinition()`.
- `formspec-studio` now stores a shared `AppGraphValidationReport` without
  dirtying authored state and Form Health surfaces only completed
  `origin: "ui-graph-policy"` diagnostics while preserving code, severity,
  phase, origin, and source-pointer identity. AppGraphValidator remains the
  diagnostic authority.
- Registry token-category contribution compatibility, runtime hidden-state,
  behavior-level runtime consumers, broader consumer conformance, and optional
  future App Manifest slot work remain open.

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
- 2026-05-25: External architecture reviewers approved a slot-only
  `THEME-TOKEN-SLOT` validator slice over completed ModuleResolver
  `widgetTokenSlots[]` evidence. Token-category compatibility remains open
  because the exact compatibility rule and source evidence are not yet pinned.
- 2026-05-25: External architecture reviewers rejected a broad immediate
  token-category diagnostic. The prerequisite slice pins raw Theme token keys
  and category-prefix evidence while leaving executable `THEME-TOKEN-REF`,
  executable `THEME-TOKEN-CATEGORY`, and Registry `token-category` contribution
  compatibility deferred.
- 2026-05-25: External architecture reviewers approved executable loaded-Theme
  `THEME-TOKEN-REF` and `THEME-TOKEN-CATEGORY` only after pinning
  exactly-one loaded Theme evidence and exact accepted-prefix-plus-dot matching.
  Registry `token-category` contribution compatibility remains deferred until
  ModuleResolver exposes normalized admitted category evidence.
- 2026-05-26: External architecture review narrowed the first consumer slice to
  projection only. Studio editor and renderer targets would cross authoring or
  runtime ownership too early. The accepted slice is a pure
  `@formspec-org/layout` read of validated `hostEvidence.uiGraphPolicies[]`
  evidence plus completed `AppGraphValidationReport` proof that annotates route
  projection output without becoming a validator or runtime gate.
- 2026-05-26: `targetSurface.version` compatibility moved into
  AppGraphValidator instead of the layout projection consumer. The validator
  uses the `semver` package rather than a local range parser; layout matches
  only target Surface URL after completed report proof.
- 2026-05-26: The first renderer consumer is limited to `<formspec-render>`
  inert metadata emission from `LayoutNode.uiGraphRoutePolicy`. This is not
  runtime hidden-state behavior, authoring feedback, ARIA application, or an App
  Manifest policy slot.
- 2026-05-26: The React/formspec-web consumer keeps the host evidence as one
  `LayoutHostEvidence` snapshot (`getLayoutHostEvidence()`), not split
  policy/report hooks. It is still projection-only: no fetching, validator
  execution, ARIA/responsive behavior, route authority, hidden-state rejection,
  or authorization behavior moves into the browser renderer.

## Closure Evidence

Current partial evidence:

- `specs/app-graph/ui-graph-policy-spec.md`
- `schemas/ui-graph-policy.schema.json`
- `schemas/registry.schema.json`
- `schemas/module-resolution-report.schema.json`
- `schemas/app-graph-validation-report.schema.json`
- `packages/formspec-types/src/generated/ui-graph-policy.ts`
- `packages/formspec-app-graph/src/validator.ts`
- `packages/formspec-app-graph/src/ui-graph-policy.ts`
- `packages/formspec-app-graph/package.json`
- `tests/conformance/fixtures/ui-graph-policy/`
- `tests/conformance/fixtures/app-graph-validator/ui-graph-policy-locale-owners.case.json`
- `tests/conformance/fixtures/app-graph-validator/ui-graph-policy-hidden-definitions.case.json`
- `tests/conformance/fixtures/app-graph-validator/ui-graph-policy-theme-widgets.case.json`
- `tests/conformance/fixtures/app-graph-validator/ui-graph-policy-surface-routes.case.json`
- `tests/conformance/schemas/test_ui_graph_policy_schema.py`
- `tests/conformance/schemas/test_app_graph_validation_report_schema.py`
- `tests/conformance/test_ui_graph_policy_host_loaded_fixture_corpus.py`
- `tests/conformance/test_ui_graph_policy_semantic_fixture_corpus.py`
- `tests/conformance/test_app_graph_ui_policy_locale_owner_fixture_corpus.py`
- `tests/conformance/test_app_graph_ui_policy_hidden_definition_fixture_corpus.py`
- `tests/conformance/test_app_graph_ui_policy_theme_widget_fixture_corpus.py`
- `tests/conformance/test_app_graph_ui_policy_surface_route_fixture_corpus.py`
- `packages/formspec-app-graph/tests/ui-graph-policy-locale-conformance.test.ts`
- `packages/formspec-app-graph/tests/ui-graph-policy-hidden-definition-conformance.test.ts`
- `packages/formspec-app-graph/tests/ui-graph-policy-theme-conformance.test.ts`
- `packages/formspec-app-graph/tests/ui-graph-policy-conformance.test.ts`
- `packages/formspec-layout/src/types.ts`
- `packages/formspec-layout/src/planner-component-tree.ts`
- `packages/formspec-layout/tests/planner.test.ts`
- `packages/formspec-webcomponent/src/element.ts`
- `packages/formspec-webcomponent/src/hub-types.ts`
- `packages/formspec-webcomponent/src/rendering/emit-node.ts`
- `packages/formspec-webcomponent/tests/render-lifecycle.test.ts`
- `packages/formspec-react/src/context.tsx`
- `packages/formspec-react/src/projection-metadata.ts`
- `packages/formspec-react/tests/renderer.test.tsx`
- `formspec-web/src/ports/definition-source.ts`
- `formspec-web/src/adapters/http/definition-source.ts`
- `formspec-web/src/app/RespondentRuntime.tsx`
- `formspec-web/tests/adapters/http/definition-source.test.ts`
- `formspec-web/tests/app/respondent-runtime.test.tsx`
- `formspec-studio/packages/formspec-studio-core/src/project.ts`
- `formspec-studio/packages/formspec-studio-core/src/types.ts`
- `formspec-studio/packages/formspec-studio-core/tests/app-graph-validation-report.test.ts`
- `formspec-studio/packages/formspec-studio/src/workspaces/editor/FormHealthPanel.tsx`
- `formspec-studio/packages/formspec-studio/tests/workspaces/editor/FormHealthPanel-semantic.test.tsx`
- `thoughts/archive/plans/2026-05-25-adr-0153-ui-graph-policy-theme-token-diagnostics-partial.md`

Closure still requires Registry token-category contribution compatibility,
runtime hidden-state behavior, behavior-level renderer/runtime consumers beyond
inert metadata surfaces, broader consumer conformance, optional App Manifest
slot decision, and final rollup gate transition.

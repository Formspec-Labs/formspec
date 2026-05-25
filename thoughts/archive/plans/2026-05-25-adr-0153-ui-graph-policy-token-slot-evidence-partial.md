---
status: implemented
---

# ADR 0153 UI Graph Policy Token-Slot Evidence Partial

## Purpose

This plan tracks the narrow evidence slice that unblocks future executable
`THEME-TOKEN-SLOT` checks without emitting that diagnostic yet.

The slice defines production Registry and ModuleResolver evidence for widget
Theme token slots:

- Registry widget entries may declare `widgetShape.tokenSlots[]`.
- `ModuleResolutionReport.contributions[]` may carry normalized
  `widgetTokenSlots[]` evidence for resolved widget contributions.
- `AppGraphValidator` continues to emit only `THEME-TOKEN-WIDGET` for Theme
  assignments in this slice.

## Authority

- ADR 0153 owns UI graph policy and ModuleResolver production boundaries.
- UI Graph Policy owns Theme token-slot assignment semantics.
- ModuleResolver owns module admission, contribution ownership, and normalized
  contribution evidence.
- TraceIndex remains out of scope; it is a generated relationship cache, not
  graph-policy authority.

## Architecture Review

Goodall approved the direction with the constraint that ModuleResolver must
remain the evidence producer and AppGraphValidator must remain the consumer.

Poincare requested a narrower split: first define Registry/report evidence, keep
`THEME-TOKEN-SLOT` deferred, then consume that evidence in a later validator
slice. This plan follows that split.

## Implementation

- Add `widgetShape.tokenSlots[]` to `schemas/registry.schema.json`.
- Add `ModuleResolutionWidgetTokenSlot` and
  `ModuleResolutionContribution.widgetTokenSlots[]` to
  `schemas/module-resolution-report.schema.json`.
- Populate `widgetTokenSlots[]` from resolved widget contributions in
  `packages/formspec-app-graph/src/module-resolver.ts`.
- Add direct unit coverage and source fixture conformance for normalized
  token-slot evidence.
- Update UI Graph Policy prose to record that `widgetTokenSlots[]` exists but
  is not yet consumed for `THEME-TOKEN-SLOT`.

## Out of Scope

- No `THEME-TOKEN-SLOT` diagnostic emission.
- No Theme token existence check.
- No token-category compatibility check.
- No `semantics.themeTokenSlots` production promotion.
- No TraceIndex dependency.
- No runtime hidden-state, renderer fallback, Studio, MCP, projection, App
  Manifest loading slot, or ADR 0152 authorization semantics.

## Deviations

- 2026-05-25: The initial candidate was broader: add token-slot evidence and
  immediately emit `THEME-TOKEN-SLOT`. Architecture review rejected that as too
  wide because the report evidence did not yet exist. The slice was split so
  this plan lands only Registry/ModuleResolver evidence.
- 2026-05-25: Review caught `types:generate` refreshing unrelated generated
  `response.ts` drift. That generated churn was removed from this slice to keep
  the committed API surface limited to token-slot evidence.

## Closure Evidence

- `npm run --workspace @formspec-org/app-graph test -- module-resolver.test.ts module-resolver-conformance.test.ts ui-graph-policy-theme-conformance.test.ts`
- `python -m pytest tests/conformance/schemas/test_module_resolution_report_schema.py tests/conformance/schemas/test_registry_schema.py tests/conformance/test_module_resolver_fixture_corpus.py tests/conformance/test_app_graph_ui_policy_theme_widget_fixture_corpus.py -q`
- `npm run --workspace @formspec-org/types test -- tests/schema-sync.test.ts`
- `npm run build:types`
- `node scripts/generate-spec-artifacts.mjs --check`
- `npm run --workspace @formspec-org/app-graph build`

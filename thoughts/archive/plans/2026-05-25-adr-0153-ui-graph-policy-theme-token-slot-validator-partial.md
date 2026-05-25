---
status: implemented
---

# ADR 0153 UI Graph Policy Theme Token-Slot Validator Partial

## Purpose

This plan tracks the narrow validator slice that consumes completed
ModuleResolver `widgetTokenSlots[]` evidence and emits `THEME-TOKEN-SLOT` for
undeclared Theme token-slot assignments.

## Authority

- ADR 0153 makes UI Graph Policy the owner of Theme token-slot assignment
  validation.
- ModuleResolver remains the producer of module admission, widget contribution,
  and normalized Registry `widgetShape.tokenSlots[]` evidence.
- AppGraphValidator remains the UI Graph Policy diagnostic consumer.
- ADR 0152 authorization, TraceIndex, runtime hidden-state, Studio feedback,
  and App Manifest policy slots remain out of scope.

## Architecture Review

Kant approved the slice with one high-signal constraint: do not merge full
token-category compatibility until prose pins the exact rule and evidence
source.

James independently approved the same boundary: gate `THEME-TOKEN-SLOT` on a
completed ModuleResolver report and a resolved same-module widget contribution,
use the policy assignment slot as primary source, and use sanitized Registry
slot pointers as related sources when declarations exist.

## Implementation

- Update UI Graph Policy prose to say `THEME-TOKEN-SLOT` is executable while
  token-category compatibility remains open.
- Teach `packages/formspec-app-graph/src/ui-graph-policy.ts` to validate
  `theme.assignments[].slot` against the resolved same-module widget
  contribution's `widgetTokenSlots[]`.
- Add fixture cases for undeclared slots and missing graph-visible token-slot
  evidence.
- Preserve existing skip behavior for absent, not-run, or skipped
  ModuleResolver reports.
- Preserve existing widgetRef behavior so missing, unadmitted, or wrong-owner
  widgets emit `THEME-TOKEN-WIDGET` without duplicate token-slot diagnostics.

## Out of Scope

- No token-category compatibility.
- No Theme token existence or value resolution.
- No direct Registry reads from AppGraphValidator.
- No v4 `semantics.themeTokenSlots` promotion.
- No TraceIndex dependency.
- No runtime, Studio, MCP, projection, App Manifest loading slot, or ADR 0152
  authorization semantics.

## Deviations

- 2026-05-25: The initially considered slice included token-category
  compatibility. External review narrowed this to slot membership only because
  compatibility evidence is not yet audit-clean.

## Closure Evidence

- `npm run --workspace @formspec-org/app-graph test -- ui-graph-policy-theme-conformance.test.ts`
- `python -m pytest tests/conformance/test_app_graph_ui_policy_theme_widget_fixture_corpus.py -q`
- `npm run --workspace @formspec-org/app-graph test -- ui-graph-policy-theme-conformance.test.ts ui-graph-policy-conformance.test.ts ui-graph-policy-locale-conformance.test.ts ui-graph-policy-hidden-definition-conformance.test.ts app-graph-validator.test.ts`
- `python -m pytest tests/conformance/test_app_graph_ui_policy_theme_widget_fixture_corpus.py tests/conformance/test_app_graph_ui_policy_surface_route_fixture_corpus.py tests/conformance/test_app_graph_ui_policy_locale_owner_fixture_corpus.py tests/conformance/test_app_graph_ui_policy_hidden_definition_fixture_corpus.py tests/conformance/test_ui_graph_policy_semantic_fixture_corpus.py -q`
- `npm run --workspace @formspec-org/app-graph build`
- `npm run --workspace @formspec-org/app-graph test`
- `node scripts/generate-spec-artifacts.mjs --check`
- `npm run docs:check`

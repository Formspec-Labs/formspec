# ADR 0153 UI Graph Policy Theme Token Diagnostics Partial

## Purpose

This plan tracks the executable Theme token-reference and token-category
diagnostic slice for UI Graph Policy.

The slice implements only loaded-Theme evidence checks for
`theme.assignments[].token`:

- `THEME-TOKEN-REF` fails closed when a policy assignment has no exactly-one
  loaded Theme token source, or the loaded Theme lacks the raw token key.
- `THEME-TOKEN-CATEGORY` fails closed when a resolved assignment token does not
  match the declared widget token slot's accepted category prefixes.
- Registry `token-category` contribution compatibility remains deferred until
  ModuleResolver exposes normalized admitted token-category evidence.

## Authority

- ADR 0153 owns the UI Graph Policy production boundary.
- UI Graph Policy owns Theme token assignments to module widget slots.
- Theme owns the loaded `tokens` map and raw token keys.
- ModuleResolver owns resolved widget contribution and token-slot evidence.
- AppGraphValidator owns cross-artifact UI Graph Policy diagnostics.

## Architecture Review

Carver approved the boundary as long as it remains limited to loaded Theme
evidence plus completed ModuleResolver widget/slot evidence. Carver also
confirmed that missing loaded Theme evidence should fail closed with
`THEME-TOKEN-REF`, not skip like absent ModuleResolver evidence.

Volta required the implementation to pin loaded Theme cardinality before code:
policy assignments require exactly one loaded Theme handle, because the App
Manifest/ArtifactResolver `theme` slot is single-cardinality. Volta also
rejected deriving category authority by taking the substring before the first
dot; category compatibility must compare each accepted prefix by exact
`token.startsWith(prefix + ".")` matching.

## Implementation

- Update UI Graph Policy prose to define exactly-one loaded Theme evidence
  behavior for token diagnostics.
- Extend AppGraphValidator UI Graph Policy checks to load Theme handles.
- Emit `THEME-TOKEN-REF` for missing, ambiguous, or absent loaded Theme token
  evidence.
- Emit `THEME-TOKEN-CATEGORY` only after token ref resolution, resolved
  same-module widget evidence, and declared token-slot evidence.
- Extend executable source fixtures to cover valid Theme token evidence,
  missing Theme evidence, ambiguous Theme evidence, missing token keys, and
  category mismatch.
- Keep direct Registry reads, Registry `token-category` contribution
  compatibility, TraceIndex, runtime hidden-state, Studio/MCP/projection,
  optional App Manifest policy slots, and ADR 0152 authorization out of scope.

## Deviations

- 2026-05-25: Initial candidate category matching derived a prefix from the
  token key. Architecture review rejected that as authority. The implemented
  rule must compare the full raw token key against each accepted category
  prefix plus a dot.

## Closure Evidence

Verified 2026-05-25:

- `specs/app-graph/ui-graph-policy-spec.md`
- `specs/app-graph/app-graph-validator-spec.md`
- `packages/formspec-app-graph/src/ui-graph-policy.ts`
- `tests/conformance/fixtures/app-graph-validator/ui-graph-policy-theme-widgets.case.json`
- `tests/conformance/fixtures/app-graph-validator/ui-graph-policy-surface-routes.case.json`
- `tests/conformance/test_app_graph_ui_policy_theme_widget_fixture_corpus.py`
- `tests/conformance/test_app_graph_ui_policy_surface_route_fixture_corpus.py`
- `tests/contracts/surface-coverage.json`
- `scripts/spec-artifacts.config.json`
- `npm run --workspace @formspec-org/app-graph test -- ui-graph-policy-theme-conformance.test.ts ui-graph-policy-conformance.test.ts ui-graph-policy-locale-conformance.test.ts ui-graph-policy-hidden-definition-conformance.test.ts app-graph-validator.test.ts module-resolver.test.ts module-resolver-conformance.test.ts`
- `python -m pytest tests/conformance/schemas/test_ui_graph_policy_schema.py tests/conformance/schemas/test_registry_schema.py tests/conformance/schemas/test_module_resolution_report_schema.py tests/conformance/test_app_graph_ui_policy_surface_route_fixture_corpus.py tests/conformance/test_app_graph_ui_policy_theme_widget_fixture_corpus.py -q`
- `npm run --workspace @formspec-org/types test -- tests/schema-sync.test.ts`
- `node scripts/generate-spec-artifacts.mjs --check`
- `npm run docs:check`
- `git diff --check`

# ADR 0153 UI Graph Policy Token-Category Evidence Partial

## Purpose

This plan tracks the prerequisite contract slice for future executable
`THEME-TOKEN-REF` and `THEME-TOKEN-CATEGORY` diagnostics.

The slice does not emit token-reference or token-category diagnostics. It pins
the evidence vocabulary needed before those diagnostics can be implemented:

- UI Graph Policy `theme.assignments[].token` is a raw Theme token key.
- `$token.<key>` reference syntax is not valid in UI Graph Policy token
  assignments.
- `widgetTokenSlots[].acceptedTokenCategories[]` values are Theme token category
  prefixes, not Registry entry names.
- Loaded Theme tokens are the future source of token existence evidence.
- Registry `token-category` contribution compatibility remains deferred until
  ModuleResolver exposes normalized admitted category evidence.

## Authority

- ADR 0153 owns the UI Graph Policy production boundary.
- Theme owns token maps, token metadata, and runtime token fallback behavior.
- ModuleResolver owns normalized widget token-slot evidence.
- AppGraphValidator owns future UI Graph Policy token-reference and
  token-category diagnostics.

## Architecture Review

Hypatia and Mill both rejected a broad immediate token-category diagnostic.
Their blocker was that the current contracts did not yet define a
machine-checkable category match or normalized token-category contribution
evidence.

Hypatia identified a tractable later diagnostic boundary: use loaded Theme
`tokens` to prove token existence, optional Theme `tokenMeta.categories` for
metadata, and resolved widget-slot `acceptedTokenCategories[]` as the allow-list.

Mill required this prerequisite split before implementation: define raw token
keys, define accepted categories as prefixes rather than Registry contribution
names, and leave Registry `token-category` contribution evidence deferred until
ModuleResolver normalizes it.

## Implementation

- Add a schema guard rejecting `$token.<key>` syntax in
  `theme.assignments[].token`.
- Update UI Graph Policy prose to define the raw-token-key and category-prefix
  evidence boundary.
- Update Registry and ModuleResolution report schema descriptions so
  `acceptedTokenCategories[]` is unambiguously category prefixes.
- Add schema conformance coverage for raw token keys versus `$token.<key>`
  references.
- Keep executable `THEME-TOKEN-REF` and `THEME-TOKEN-CATEGORY` diagnostics
  deferred.

## Out of Scope

- No executable token-reference diagnostic.
- No executable token-category diagnostic.
- No Theme token value or renderer fallback semantics.
- No direct Registry reads from AppGraphValidator.
- No Registry `token-category` contribution compatibility until ModuleResolver
  exposes normalized category evidence.
- No TraceIndex, runtime, Studio, MCP, projection, App Manifest policy slot, or
  ADR 0152 authorization semantics.

## Deviations

- 2026-05-25: The initial candidate was to implement token-category
  compatibility immediately. Architecture review found that premature. This
  slice lands only the prerequisite evidence contract.

## Closure Evidence

- `python -m pytest tests/conformance/schemas/test_ui_graph_policy_schema.py tests/conformance/schemas/test_registry_schema.py tests/conformance/schemas/test_module_resolution_report_schema.py -q`
  - `120 passed in 0.30s`
- `npm run --workspace @formspec-org/types test -- tests/schema-sync.test.ts`
  - `1 passed; 10 tests passed`
- `node scripts/generate-spec-artifacts.mjs --check`
  - `Spec artifacts are up to date.`
- `git diff --check`
  - no whitespace errors
- `npm run docs:check`
  - `188 passed`, `453 passed`, `check-thoughts-relocated-paths: OK`, `changeset-tier-placement: OK`
- Stale-term sweep:
  - `rg -n 'accepted Theme token category prefixes or Registry token-category contribution names|does not yet emit THEME|future token-category compatibility gate names' specs schemas packages/formspec-types/src/generated tests -S`
  - no matches
- Allowed rejected-syntax sweep:
  - `rg -n '\$token\.<key>|\$token\.color\.accent' specs/app-graph schemas/ui-graph-policy.schema.json packages/formspec-types/src/generated/ui-graph-policy.ts tests/conformance/schemas/test_ui_graph_policy_schema.py -S`
  - matches are limited to UI Graph Policy text that rejects `$token.<key>` syntax and the schema test negative case.

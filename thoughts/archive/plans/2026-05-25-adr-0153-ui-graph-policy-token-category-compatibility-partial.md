---
status: implemented
---

# ADR 0153 UI Graph Policy Token-Category Compatibility Partial

## Purpose

This plan tracks the Registry `token-category` contribution compatibility slice
for UI Graph Policy Theme token assignments.

The slice closes the remaining loaded-Theme category evidence gap without
promoting Registry reads in AppGraphValidator:

- ModuleResolver exposes normalized admitted Registry `token-category`
  contribution evidence at report level.
- UI Graph Policy consumes completed `ModuleResolutionReport.tokenCategories[]`
  evidence when a resolved assignment uses a custom accepted category prefix.
- Built-in platform token prefixes remain platform-token authority and do not
  require module Registry contribution evidence.
- Runtime hidden-state, Studio/MCP/projection, App Manifest policy slots,
  TraceIndex, and ADR 0152 authorization remain out of scope.

## Authority

- ADR 0153 owns the app-graph production boundary and UI Graph Policy gate 9d.
- Registry owns module-contributed `token-category` declarations.
- ModuleResolver owns admitted module contribution evidence and normalized
  report handoff.
- UI Graph Policy owns assignment-scoped diagnostics over completed graph
  evidence.
- `schemas/token-registry.json` owns the current platform token category
  prefix set.

## Architecture Review

Wegener approved the direction only if core platform prefixes do not require
Registry `token-category` admission, because Registry entry names are `x-*`
identifiers while `acceptedTokenCategories[]` values are category prefixes. The
review also rejected Registry entry names as prefix authority and recommended a
report-level normalized evidence list.

Socrates approved the direction after these clarifications:

- platform prefixes are exactly the current `schemas/token-registry.json`
  categories for this slice;
- non-platform graph-visible prefixes must be custom `x-*` prefixes;
- missing admitted evidence for an accepted custom prefix needs an explicit UI
  diagnostic outcome, not an implicit reuse of category-not-accepted;
- ModuleResolver must scan admitted module contributions directly rather than
  relying on the current `entriesByName` map, which collapses duplicate entry
  names; and
- `ModuleResolutionReport.tokenCategories[]` must be first-class schema/type
  surface with source conformance.

## Decisions

1. Registry `token-category.categoryShape` uses an explicit `prefix` field for
   graph-visible category prefix authority. Registry entry `name` is never the
   category prefix.
2. For this slice, the built-in platform prefix set is pinned to
   `schemas/token-registry.json` by contract test and currently contains
   `color`, `font`, `radius`, and `spacing`.
3. UI Graph Policy accepts platform prefixes without Registry contribution
   evidence.
4. UI Graph Policy requires admitted ModuleResolver token-category evidence for
   custom `x-*` prefixes.
5. Non-platform, non-`x-*` prefixes used by graph-visible widget token slots are
   invalid for this compatibility gate.
6. The assignment-scoped diagnostic for accepted custom prefixes without
   admitted category evidence is distinct from category-prefix rejection.
7. `ModuleResolutionReport.tokenCategories[]` is report-level evidence. It
   carries `admitted`, `conflict`, or `shape-mismatch` entries produced from
   admitted modules' direct `contributes[]` lists; the schema leaves room for
   future `missing`, `unowned`, and `unadmitted` statuses when a future
   consuming site needs those report facts.
8. UI Graph Policy emits `THEME-TOKEN-CATEGORY-REF` when an accepted custom
   category prefix is not backed by exactly one admitted token-category
   evidence entry. `THEME-TOKEN-CATEGORY` remains category-not-accepted.

## Implementation

- Extend Registry schema/prose so `token-category.categoryShape.prefix` is the
  required graph-visible category prefix.
- Extend ModuleResolutionReport schema/types with report-level
  `tokenCategories[]` evidence.
- Teach ModuleResolver to normalize admitted `token-category` contributions by
  scanning admitted modules' `contributes[]` lists and category entries
  directly.
- Extend UI Graph Policy diagnostics to check custom accepted prefixes against
  completed `ModuleResolutionReport.tokenCategories[]`.
- Add source fixtures for admitted custom prefix evidence, missing custom prefix
  evidence, conflicting duplicate prefix evidence, shape-mismatched category
  evidence, and unsupported non-platform non-`x-*` prefix evidence.

## Out of Scope

- No direct Registry reads from AppGraphValidator.
- No inference from Registry entry names.
- No TraceIndex dependency.
- No runtime hidden-state enforcement.
- No Studio/MCP/projection/consumer wiring.
- No App Manifest policy slot.
- No ADR 0152 fine-grained authorization semantics.

## Deviations

- 2026-05-25: Architecture review rejected all-prefix Registry compatibility.
  Platform token prefixes remain platform authority; only custom `x-*` prefixes
  require admitted Registry `token-category` evidence.
- 2026-05-25: Architecture review rejected using Registry entry names as
  category-prefix authority. The Registry `categoryShape.prefix` field carries
  that authority.

## Closure Evidence

- `npm run --workspace @formspec-org/app-graph test -- tests/module-resolver.test.ts tests/module-resolver-conformance.test.ts tests/ui-graph-policy-theme-conformance.test.ts`
  passed: 3 files, 43 tests.
- `.venv/bin/python -m pytest tests/conformance/schemas/test_registry_schema.py tests/conformance/schemas/test_module_resolution_report_schema.py tests/conformance/test_module_resolver_fixture_corpus.py tests/conformance/test_app_graph_ui_policy_theme_widget_fixture_corpus.py tests/conformance/test_registry_module_categories.py -q`
  passed: 152 tests.
- `npm run --workspace @formspec-org/types test -- tests/schema-sync.test.ts`
  passed: 1 file, 10 tests.
- `npm run --workspace @formspec-org/types build` refreshed local `dist`
  output so direct app-graph package builds see
  `ModuleResolutionTokenCategoryEvidence`.
- `npm run --workspace @formspec-org/app-graph build` passed.
- `npm run docs:generate` and `npm run docs:check` passed; docs check ran 188
  spec-contract tests and 453 contract-surface metadata tests with 4 existing
  jsonschema deprecation warnings.
- `cargo nextest run -p formspec-lint schema_validation::tests::embedded_registry_schema_matches_canonical_schema`
  passed: 1 test, 418 skipped.
- `git diff --check` passed.
- Pauli re-review approved the refreshed types build surface, negative
  ModuleResolver/UI source fixture coverage, and duplicate Registry-name test
  coverage.
- Godel re-review approved the platform-prefix contract test and
  `THEME-TOKEN-CATEGORY-REF` spec consistency fix.

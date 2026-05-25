# ADR 0154 Component 1.2 Schema Closure

**Date:** 2026-05-25
**Status:** Closed
**Gate:** ADR 0154 gate 2; ADR 0153 gate 8 partial
**Owner:** Formspec app-graph rollout

## Scope

This slice promotes the Component 1.2 identity shape into
`schemas/component.schema.json`. It closes only the schema gate for
`targetSurfaceRoutes[]`.

It does not promote App Manifest `components[]`, Surface schema changes,
AppGraphValidator route resolution, duplicate route-claim enforcement,
Studio/kernel graph identity, provenance rewrites, runtime behavior, fixtures,
or ADR 0152 authorization semantics.

## Review Checkpoint

Leibniz approved Component 1.2 schema promotion as the next strict ADR 0153 §7 slice.
The review boundary was:

- promote Component schema before runtime or Response Actions work;
- preserve existing form-only `targetDefinition` documents;
- add `targetSurfaceRoutes[]` with `surface`, `route`, optional `slot`, and
  `role`;
- require at least one identity binding: `targetDefinition` or
  `targetSurfaceRoutes[]`;
- avoid App Manifest `components[]`, Surface schema changes, AppGraphValidator
  enforcement, Studio/kernel graph identity, provenance, runtime behavior,
  conformance closure, and authorization policy.

A follow-up architecture check approved bumping the schema `$id` to
`https://formspec.org/schemas/component/1.2` instead of hiding Component 1.2 behavior
behind the old `component/1.1` schema identity.

## Completed

- `schemas/component.schema.json` now uses `$id`
  `https://formspec.org/schemas/component/1.2`.
- `$formspecComponent` now admits `"1.2"` while preserving `"1.0"` and `"1.1"`.
- Component v1.2 documents must declare `targetDefinition` or
  `targetSurfaceRoutes[]`.
- Legacy v1.0/v1.1 documents remain form-bound and continue to require
  `targetDefinition`.
- `targetSurfaceRoutes[]` validates the Surface route target shape:
  `surface.url`, optional `surface.version`, `route`, optional `slot`, and
  `role` in `route | slot | app-shell`.
- Locale, Ontology, and References schemas now reference the shared
  `common/1.0#/$defs/TargetDefinition` primitive instead of the Component
  schema's old `$id`.
- Generated docs, generated TypeScript types, and the lint schema copy are
  synced.

## Still Open

- App Manifest schema revision `components[]` with unique `handle` and singular
  `component` import/migration behavior.
- Surface spec linkage without making Surface own Component trees.
- AppGraphValidator target resolution, duplicate route-claim diagnostics, fake
  Definition rejection, and node identity disambiguation.
- Studio/kernel graph identity for multi-Surface and multi-Component editing.
- Graph-wide provenance for cross-route and cross-Component copy/move.
- Positive and negative conformance fixtures for ADR 0154 gate 8.

## Deviations

- The original ADR gate label used "vNext"; this slice makes the concrete
  contract name Component 1.2 and removes "vNext" from Component 1.2
  source/generated spec artifacts.
- The Component spec no longer uses the ADR as a normative reference for route
  identity. ADR references remain in this plan and in the parent rollup because
  those documents track rollout authority and deviations.
- The Rust lint crate check could not run because of the existing sibling
  dependency mismatch recorded below. The lint schema copy and registry URI were
  still updated, and non-Rust schema/type/doc checks passed.

## Closure Evidence

- Schema: `schemas/component.schema.json` and
  `crates/formspec-lint/schemas/component.schema.json` use
  `https://formspec.org/schemas/component/1.2`, admit the `"1.2"` marker, keep
  v1.0/v1.1 form-bound, and validate `targetSurfaceRoutes[]`.
- Shared target primitive: Locale, Ontology, and References schemas now point at
  `common/1.0#/$defs/TargetDefinition`.
- Types: `packages/formspec-types/src/generated/component.ts` emits a
  discriminated `ComponentDocument` union, and `src/type-contracts.ts` covers
  valid route-only/mixed Component 1.2 documents plus invalid legacy and
  missing-identity cases.
- Docs: Component BLUF, LLM reference, semantic capsule, and HTML output use
  the concrete Component 1.2 terminology.
- Tests/checks: focused Python schema tests, `@formspec-org/types` test/build,
  `docs:check`, HTML docs generation, and child/parent `diff --check` passed.

## Verification

- `python -m pytest tests/conformance/schemas/test_component_schema.py tests/conformance/schemas/test_component_reference_fields_schema.py tests/conformance/test_ontology_publisher_migration.py`
- `npm run docs:generate`
- `npm run --workspace @formspec-org/types types:generate`
- `node scripts/sync-lint-schemas.mjs`
- `make -s html-docs`
- `npm run docs:check`
- `npm run --workspace @formspec-org/types test`
- `npm run --workspace @formspec-org/types build`

`cargo test -p formspec-lint schema_validation` could not run because the
workspace currently resolves sibling `fel-core` at `0.2.0` while
`formspec-core` requires `fel-core = "^0.1.0"`.

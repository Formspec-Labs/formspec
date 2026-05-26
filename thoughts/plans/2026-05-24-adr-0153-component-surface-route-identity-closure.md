# ADR 0153 Component Surface Route Identity Closure Plan

**Date:** 2026-05-24
**Row:** Component Surface/route identity
**Status:** Partial. Route identity schema, shared validator checks,
graph-wide provenance schema evidence, Studio/kernel `copyNode` graph identity
stamping, and layout projection identity consumption are landed. Broader
Studio/kernel operations now include explicit Component membership binding.
Production consumers, graph-wide `movedFrom`, and broader consumer-facing
conformance remain open. Definition id/name alias matching is rejected as stale
Surface/registry text; the v1.2 route-bound Definition-context rule remains
URL-only.
**Authority:** stack ADR 0153 gate 8, stack ADR 0154, Component spec, Component
Reference Fields companion

## Scope

Close ADR 0154 in strict slices without moving identity authority into Surface,
TraceIndex, runtime policy, or ADR 0152 authorization. Component remains the
owner of Component document and node identity; App Manifest owns Component
membership handles; Surface owns only route and slot namespaces; AppGraph
validation owns cross-artifact route and node identity checks.

This plan tracks:

1. Component 1.2 identity prose.
2. Component 1.2 structural schema.
3. App Manifest `components[]` membership handles.
4. Surface route/slot namespace linkage.
5. Shared AppGraphValidator route and node identity checks.
6. Studio/kernel graph-wide operation identity.
7. `x-generation.copiedFrom` / `movedFrom` provenance identity.
8. Conformance corpus promotion.

## Review Checkpoints

- 2026-05-25: external architecture reviews approved Component 1.2 prose,
  route-target validation, route-bound Definition context, and validator-owned
  node identity slices with strict exclusions for Studio/kernel identity,
  provenance, runtime behavior, production consumers, TraceIndex, and
  authorization.
- 2026-05-25: Feynman approved the provenance schema/prose/test slice with
  blocking constraints: keep legacy `{ route, nodePath }` valid for
  same-runtime Studio/kernel compatibility; add graph-wide provenance as a
  closed `ComponentNodeIdentityRef`; make Component node `x-generation` use the
  same common `Generation` shape; do not change Studio/kernel writers; do not
  promote TraceIndex, runtime behavior, v4 spike documents, or ADR 0152 fields.
- 2026-05-25: Plato reviewed the remaining Component identity slice and
  directed the next implementation toward writer/projection identity, not
  Surface-mounted ownership, TraceIndex, or full webcomponent runtime. The
  approved narrow slice is StudioCore Component membership + graph node
  identity, reuse of the shared Component node identity tuple, and layout
  projection as the first consumer. The layout package consumes the generated
  `ComponentNodeIdentityRef` type from `@formspec-org/types`, not
  `@formspec-org/app-graph`, to preserve dependency-fence direction.
- 2026-05-26: Mencius reviewed the Definition alias checkpoint and rejected
  implementation. Definition identity is `(url, version)`, `name` is local
  tooling convenience, Component 1.2 already defines route-bound Definition
  context as URL-only, and app-graph already compares `definitionRef` to
  `targetDefinition.url`.

## Ordered Work

### Phase 1 - Component 1.2 Identity Prose

- [x] Define `targetSurfaceRoutes[]` as the non-form route identity binding.
- [x] Preserve `targetDefinition` for form-bound Components.
- [x] Reject fake non-form `targetDefinition` shims as source identity.
- [x] Define graph-wide Component node identity tuple in Component §11.6.

### Phase 2 - Structural Identity Schema

- [x] Admit Component 1.2 route identity in `component.schema.json`.
- [x] Mirror Component schema into `crates/formspec-lint/schemas/`.
- [x] Keep route/slot resolution in AppGraphValidator rather than schema.

### Phase 3 - Manifest And Surface Linkage

- [x] Add App Manifest `components[]` membership handles.
- [x] Preserve singular `component` compatibility as handle `default`.
- [x] Link Component route targets to Surface route/slot namespaces without
  making Surface own Component membership.

### Phase 4 - Shared Validator Identity

- [x] Enforce Surface route/slot target resolution in `@formspec-org/app-graph`.
- [x] Enforce duplicate route claims across Component membership handles.
- [x] Enforce route-bound control Definition context by URL.
- [x] Enforce stable route-scoped nodePath segment availability, sibling
  ambiguity, and duplicate constructed graph-wide node identity.

### Phase 5 - Provenance Shape

- [x] Add `ComponentNodeIdentityRef` to `common.schema.json`.
- [x] Allow `Generation.movedFrom` / `copiedFrom` to carry either graph-wide
  `ComponentNodeIdentityRef` or legacy same-runtime `CrossComponentRef`.
- [x] Change Component node `x-generation` to reference common `Generation`.
- [x] Add schema tests and a Component fixture for graph-wide provenance.
- [x] Preserve legacy `{ route, nodePath }` compatibility.

### Phase 6 - Remaining Closure

- [x] Studio/kernel operations use graph-wide identity when multiple Surfaces
  or Component documents are loaded.
  - [x] `copyNode` requires `source.graphIdentity` once multiple Surfaces are
    declared, stamps graph-wide `copiedFrom`, and returns graph-wide copied
    root/descendant identity; multiple Component memberships require an active
    `bindComponentMembership` handle and reject mismatched graph scopes.
  - [x] `addNode` accepts a target route/graph scope, fail-closes without graph
    scope once multiple Surfaces are loaded, returns the created node's exported
    graph identity, and requires an active Component membership binding once
    multiple Component memberships are loaded.
  - [x] `moveNode` accepts source/target exported identity, validates same-route
    and same-scope graph moves in the single-runtime facade, returns moved
    exported graph identity, and requires the source/target graph scope to match
    the active Component membership binding once multiple Component memberships
    are loaded.
- [ ] Production consumers use the shared identity shape rather than local
  route/path strings.
  - [x] `@formspec-org/layout` projects optional `componentGraphIdentity` from
    supplied Component membership + Surface + route scope.
  - [ ] Runtime hosts / renderers still need route-backed app-graph wiring.
- [x] Definition id alias matching is rejected with evidence.
  - [x] Explicit Studio/kernel graph binding landed as
    `bindComponentMembership`, binding the active singleton Component document to
    one App Manifest `components[]` handle before multi-Component graph edits.
  - [x] Surface schema/spec/registry text now states `definitionRef` resolves by
    Definition URL only in v0.1, the Surface schema requires URI-shaped
    `definitionRef` values, and tests prove local handles plus loaded Definition
    `identity.id` / `identity.name` do not satisfy route-local
    `definition-form` context.
- [ ] Consumer-facing conformance promotes graph-wide copy/move workflows
  beyond schema acceptance.
  - [x] StudioCore `copyNode` and layout projection tests cover graph identity
    writer/consumer shape.
  - [x] Full `copyNode` writer -> AppGraphValidator -> projection proof covers
    a multi-route Component.
  - [x] StudioCore `addNode` / `moveNode` graph identity tests cover
    multi-Surface fail-closed behavior, same-scope exported identity, and
    cross-scope move rejection.
  - [x] StudioCore graph identity tests cover multi-Component binding
    requirements, mismatched-handle rejection, and bound add/move/copy success.
  - [ ] Production copy/move consumers and graph-wide `movedFrom` provenance
    persistence remain open.

## Deviations

- 2026-05-25: The provenance slice did not reject legacy
  `{ route, nodePath }`. Current Studio/kernel writers still emit that shape, so
  removing it would be a compatibility break before the writer migration.
- 2026-05-25: The provenance slice is schema/prose/fixture evidence only. It
  does not add AppGraphValidator diagnostics for provenance reference
  resolution; that would require resolved operation context and is a larger
  Studio/kernel consumer slice.
- 2026-05-25: `nodeId` is accepted inside `ComponentNodeIdentityRef` as
  optional provenance evidence, but this slice does not add `nodeId` as a
  Component node schema property.
- 2026-05-25: No TraceIndex, runtime, v4 spike, or ADR 0152 authorization
  fields were promoted.
- 2026-05-25: StudioCore graph identity is same-scope only. Cross-route,
  cross-Surface, and cross-Component copy remain validation-gated until the
  Automerge/multi-Component storage track lands; this prevents a graph-wide
  stamp from pretending the facade has cross-document storage.
- 2026-05-25: Layout consumes graph identity as projection metadata only.
  Renderers still ignore it for runtime behavior, preserving Component
  Reference Fields §5.6.
- 2026-05-25: Layout suppresses graph identity on expanded custom Component
  templates. AppGraphValidator builds node identity from the source Component
  tree, not from planner-expanded templates, so emitting template-derived
  `nodePath` values would create false comparison evidence.
- 2026-05-25: The writer -> validator -> projection proof validates a
  schema-shaped route Component artifact derived from StudioCore editing state,
  not the raw Studio tree. Studio-only `nodeId` remains optional writer and
  provenance evidence; source Component nodes still use schema-valid `id`
  segments for validator/projection identity until Component source schema
  admits `nodeId` directly.
- 2026-05-25: StudioCore `moveNode` validates and returns graph-wide same-scope
  identity, but does not stamp `x-generation.movedFrom`. The current facade would
  need a separate property write after the core move dispatch; review rejected
  that non-atomic two-write shape for a kernel operation.
- 2026-05-26: StudioCore `bindComponentMembership` now binds the active
  single-runtime Component tree to one App Manifest `components[]` handle before
  multi-Component graph-aware `addNode`, `moveNode`, or `copyNode` operations.
  Cross-Component and cross-route storage still remain gated so the facade does
  not pretend it can write multiple Component documents atomically.
- 2026-05-26: Definition id/name alias matching is rejected, not implemented.
  Surface previously carried stale "in-bundle id" wording, but the Core
  Definition contract has no top-level `id`, `name` is not globally unique, App
  Manifest Definition refs are URL/version, and Component 1.2 already pins
  route-bound Definition context to exact URL matching.

## Closure Evidence

Partial evidence landed:

- Prose: `specs/component/component-spec.md` and
  `specs/component/component-reference-fields-spec.md`; Surface
  `specs/surface/surface-spec.md` now makes `definition-form.definitionRef`
  URL-only in v0.1.
- Schemas: `schemas/component.schema.json`, `schemas/common.schema.json`, and
  lint mirrors under `crates/formspec-lint/schemas/`; `schemas/surface.schema.json`
  and the lint mirror require URI-shaped `definitionRef` values and reject stale
  Definition id/name alias wording.
- Generated types: `packages/formspec-types/src/generated/common.ts`,
  `packages/formspec-types/src/generated/component.ts`, and generated barrel
  export when the overlapping pre-existing generated drift is committed.
- Validator: `packages/formspec-app-graph/src/component-routes.ts` and
  `packages/formspec-app-graph/src/component-identity.ts`.
- Studio/kernel writer: `formspec-studio/packages/formspec-studio-core/src/kernel/StudioCoreKernel.ts`
  and
  `formspec-studio/packages/formspec-studio-core/src/kernel/ProposalManagerFacade.ts`
  (`declareComponent`, `bindComponentMembership`,
  `ComponentNodeExportRef.graphIdentity`, and
  `copyNode` graph-wide provenance stamping; `addNode` / `moveNode` graph-aware
  target/source identity validation and exported identity results).
- Projection consumer: `packages/formspec-layout/src/types.ts` and
  `packages/formspec-layout/src/planner-component-tree.ts`
  (`componentGraphIdentity` projection metadata).
- Fixtures:
  `tests/conformance/fixtures/app-graph-validator/component-route-targets.case.json`
  and
  `tests/conformance/fixtures/component-reference-fields/x-generation-graph-wide-provenance.json`.
- Tests:
  `packages/formspec-app-graph/tests/component-route-validator.test.ts`,
  `packages/formspec-app-graph/tests/component-route-conformance.test.ts`,
  `tests/conformance/test_app_graph_component_route_fixture_corpus.py`,
  `tests/conformance/test_common_schema_defs.py`, and
  `tests/conformance/schemas/test_component_reference_fields_schema.py`;
  `tests/conformance/modules/test_x_formspec_surface.py` for Surface
  `definitionRef` URL shape;
  `formspec-studio/packages/formspec-studio-core/tests/kernel/proposal-manager-facade.test.ts`;
  `packages/formspec-layout/tests/planner.test.ts`.
- Verification:
  `python -m pytest tests/conformance/test_common_schema_defs.py tests/conformance/schemas/test_component_reference_fields_schema.py tests/conformance/spec/test_component_no_rewrite_regression.py -q`;
  `npm run --workspace @formspec-org/types build`;
  `npm run --workspace @formspec-org/types test -- tests/schema-sync.test.ts`;
  `cargo nextest run -p formspec-lint`;
  `node scripts/generate-spec-artifacts.mjs --check`;
  `npm run --workspace @formspec-org/app-graph test -- tests/component-route-validator.test.ts`;
  `npm run --workspace @formspec-org/studio-core test -- tests/kernel/proposal-manager-facade.test.ts`;
  `npm run --workspace @formspec-org/layout test -- tests/planner.test.ts`;
  `npx tsc --noEmit -p packages/formspec-app-graph/tsconfig.json`;
  `cd ../formspec-studio && npx tsc --noEmit -p packages/formspec-studio-core/tsconfig.json`;
  `npx tsc --noEmit -p packages/formspec-layout/tsconfig.json`.

Still open:

- ADR 0154 gate 7 graph-wide `movedFrom` persistence behind an atomic move/stamp
  helper.
- Production consumer wiring.
- Broader consumer-facing copy/move conformance.

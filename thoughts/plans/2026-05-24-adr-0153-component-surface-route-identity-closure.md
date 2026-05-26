# ADR 0153 Component Surface Route Identity Closure Plan

**Date:** 2026-05-24
**Row:** Component Surface/route identity
**Status:** Partial. Route identity schema, shared validator checks,
graph-wide provenance schema evidence, Studio/kernel `copyNode` graph identity
stamping, Studio/kernel `moveNode` `movedFrom` persistence, and layout
projection identity consumption are landed. Broader Studio/kernel operations
now include explicit Component membership binding. The webcomponent renderer,
React renderer, and `formspec-web` respondent runtime now consume
host-supplied Component graph projection context as inert DOM metadata.
AppGraphValidator now defines and checks `hostEvidence.componentGraphContexts[]`
as the proof source for that sidecar. `formspec-web` now requires matching
completed component-graph evidence before trusting runtime `componentGraph`
metadata. Production runtime host graph loading now persists and serves
first-class, validated Component graph proof from the trusted MCP/BFF publish
route. Production copy/move consumers outside StudioCore remain open.
Definition id/name alias matching is rejected as stale
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
- 2026-05-26: Hegel approved the webcomponent renderer-consumer slice with no
  blockers: host-supplied `componentGraph` context is passed into layout
  planning and emitted as inert DOM metadata, while route validation and runtime
  behavior stay outside the renderer.
- 2026-05-26: Kant approved the React / `formspec-web` respondent-runtime
  consumer slice with no blockers or high findings. Constraints: keep
  `DefinitionSource.getDefinition()` definition-only, treat Component graph
  context as a trusted host/BFF sidecar, emit inert `data-*` metadata only, and
  keep the rollup row Partial because the runtime still does not load and
  validate the graph itself.
- 2026-05-26: Kant pre-review `019e639c-5b9f-7631-93b4-977e7c8c46d1`
  rejected a proposed `formspec-web` proof gate for `componentGraph` sidecars
  against the current report shape. `AppGraphValidationReport` has no
  source/evidence pointer that proves a `ComponentGraphProjectionContext` sidecar
  was validated; `hostEvidence` currently has `uiGraphPolicies[]` only. The
  acceptable next contract is an explicit
  `hostEvidence.componentGraphContexts[]`-style source with report evidence
  results and AppGraphValidator checks for Component handle/url/version, Surface
  url/version, and route coverage before any runtime consumer gates or
  suppresses Component graph metadata.
- 2026-05-26: Goodall review
  `019e63ad-1162-7a92-904c-8977d7ad165d` found no BLOCKER/HIGH/MEDIUM/LOW
  findings in the prose-only proof-source diff.
- 2026-05-26: Kant follow-up review found one HIGH constraint before
  implementation: Component graph context proof must also prove the loaded
  Component declares the same Surface/route in `targetSurfaceRoutes[]`.
  Component membership and route existence alone are insufficient proof.
- 2026-05-26: Hegel and Goodall implementation reviews approved a
  `formspec`-only schema/shared-kernel proof slice with constraints: exclude
  `formspec-web` runtime gating, require completed evidence source/schema
  matching before proof checks run, and keep runtime trust behavior open.
- 2026-05-26: Hegel and Goodall reviewed the committed `formspec-web` runtime
  evidence gate. Goodall found no BLOCKER/HIGH code issues and noted that the
  row remains short of production host graph loading. Hegel found one HIGH
  issue: HTTP extraction must not compact malformed `componentGraphContexts[]`
  arrays because that can reindex evidence slots. The remediation rejects the
  malformed list so slot identity remains stable.
- 2026-05-26: Pauli pre-review `019e6440-96ce-7270-b6ec-f4b6e54c1279`
  approved a narrow public-kernel consumer conformance slice. Constraints:
  exercise `StudioCoreKernel` public methods, require
  `bindComponentMembership` before multi-Component graph edits, prove
  same-bound same-route copy/move provenance stamps, fail closed on
  missing/stale/cross-route/cross-Surface/cross-Component identity before
  mutation, and leave production host/BFF graph loading out of scope.
- 2026-05-26: Heisenberg post-review
  `019e644d-d9a3-71f3-9166-49bb875aa6b0` found no actionable
  BLOCKER/HIGH/MEDIUM/LOW issues. The review confirmed the public facade seam,
  missing graph-identity / graph-scope move negatives, pre-mutation rejection
  order, no production/BFF overclaim, and no ADR 0153 §6 prohibited promotion.
- 2026-05-26: Franklin pre-review
  `019e64a7-8538-7623-8d09-1b6354e52272` rejected two shortcuts before the
  runtime-host slice: do not append host evidence after report production, and
  do not persist an arbitrary submitted `app_graph_validation_report` as runtime
  trust. The approved shape is trusted MCP/BFF pre-validation Component graph
  host evidence, server-verified tuple matching, first-class immutable runtime
  proof storage, and top-level runtime payload fields.

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
  - [x] `<formspec-render>` accepts a host-supplied `componentGraph` projection
    context and emits `LayoutNode.componentGraphIdentity` as inert DOM metadata.
  - [x] `@formspec-org/react` accepts the same host-supplied `componentGraph`
    projection context and emits inert `data-formspec-*` identity metadata from
    default layout, field, display, wizard/tab, and ActionButton renderers.
  - [x] `formspec-web` keeps `getDefinition()` definition-only and loads
    Component document / Component graph sidecars through optional
    `DefinitionSource` hooks before passing them into the React respondent
    runtime.
  - [x] `hostEvidence.componentGraphContexts[]` defines explicit
    AppGraphValidator proof for the projection sidecar. The shared validator
    checks Component membership, loaded Component handle, loaded Surface handle,
    loaded Surface route, and the loaded Component `targetSurfaceRoutes[]`
    declaration as a prerequisite for future runtime consumers to treat
    `componentGraph` metadata as validated.
  - [x] Trusted MCP/BFF publish wiring supplies `component_graph` only when the
    same document was present in pre-validation
    `hostEvidence.componentGraphContexts[]`; the helper fails closed unless the
    produced report completes that evidence slot.
  - [x] `formspec-server` verifies `component_graph` +
    `host_evidence.componentGraphContexts[]` +
    `app_graph_validation_report` as a tuple before persistence, normalizes
    `host_evidence.appGraphReport` from the admitted report, stores the proof in
    first-class immutable form-version fields, and serves `component_graph`,
    `host_evidence`, and `app_graph_validation_report` as top-level runtime
    payload fields.
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
  - [x] Studio/kernel `moveNode` persists route-aware `x-generation.movedFrom`
    in the atomic core `component.moveNode` command; graph moves stamp graph-wide
    identity, while single-runtime route-aware moves preserve legacy
    `{ route, nodePath }`.
  - [x] Public `StudioCoreKernel` consumer conformance now drives
    `addSurface`, `addRoute`, `declareComponent`, `bindComponentMembership`,
    `addNode`, `copyNode`, and `moveNode` through the facade, proving bound
    same-route graph-wide copy/move success, missing/stale/cross-route/
    cross-Surface/cross-Component fail-closed behavior before mutation, and
    `x-generation.copiedFrom` / `movedFrom` graph identity stamps.
  - [ ] Production copy/move consumers outside StudioCore remain open.

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
- 2026-05-25: StudioCore `moveNode` initially validated and returned graph-wide
  same-scope identity without stamping `x-generation.movedFrom`; review rejected
  a separate post-move property write as non-atomic for a kernel operation.
- 2026-05-26: StudioCore `moveNode` now routes `movedFrom` through the core
  `component.moveNode` command. NodeId-only internal moves remain unstamped
  because they carry no route identity.
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
- 2026-05-26: `<formspec-render>` consumes a host-provided graph projection
  context only. It does not validate Component `targetSurfaceRoutes[]`, discover
  App Manifest memberships, select routes, enforce authorization, or infer
  runtime behavior from the emitted metadata.
- 2026-05-26: React and `formspec-web` consume the same projection context as a
  host/BFF sidecar only. `DefinitionSource.getDefinition()` remains
  Definition-only; Component document and graph context are optional sidecars.
  The browser does not validate Component route membership, apply route
  behavior, or infer authorization from the emitted metadata.
- 2026-05-26: Do not gate `formspec-web` Component graph sidecars on generic
  `AppGraphValidationReport.ok`. That would be proof by absence. Runtime
  suppression of unproven Component graph metadata needs an explicit
  component-graph host-evidence source first.
- 2026-05-26: The first proof-source slice is prose-only in the
  AppGraphValidator spec. It reserves `hostEvidence.componentGraphContexts[]`
  as host request evidence and leaves schema, fixtures, shared-kernel checks,
  and runtime gating to later ADR 0153 §7 phases.
- 2026-05-26: The implemented Component graph host-evidence source is still
  host-supplied evidence. It proves the sidecar against a loaded graph; it does
  not make the browser load App Manifest, Component, or Surface artifacts, and
  it does not promote Runtime Plan, TraceIndex, route behavior, or ADR 0152
  authorization.
- 2026-05-26: The public-web runtime proof gate is a consumer trust check, not a
  graph validator. It only accepts a `componentGraph` sidecar when the supplied
  `LayoutHostEvidence` has matching completed `hostEvidence.componentGraphContexts[N]`
  proof by slot, schema, source, and document. It suppresses metadata on missing
  or mismatched proof and rejects malformed HTTP evidence lists rather than
  reindexing slots.
- 2026-05-26: The public-kernel copy/move conformance slice adds no new runtime
  behavior. It proves the already-landed `StudioCoreKernel` graph identity seam
  through the public facade only; production host/BFF graph loading,
  cross-document storage, TraceIndex, route behavior, and ADR 0152 authorization
  remain excluded.
- 2026-05-26: The existing writer -> AppGraphValidator -> projection test now
  loads a Response Actions sidecar for the `submit` transition because A8
  Surface trigger validation rejects unresolved action triggers against the
  loaded graph.
- 2026-05-26: Runtime host/BFF proof is first-class runtime evidence, not
  `runtime_config`. The MCP helper strips stale graph-proof keys from
  `runtime_config`, and the server rejects graph-proof keys there. Report-only
  publish admission remains separate from runtime graph proof: the server only
  persists runtime proof when the Component graph, host evidence, and completed
  report evidence slot match.
- 2026-05-26: The normal `formspec-server` publish route verifies the runtime
  proof tuple but does not authenticate that a specific MCP/BFF produced it.
  Producer provenance remains a host/BFF deployment boundary for this slice;
  server-side proof storage is limited to structural tuple verification,
  required completed report phases, and preservation of host-evidence array
  indexes.

## Closing Observation

Partially observed. The proof-source contract, schema, fixture, shared-kernel
checks, and public-web runtime trust gate have landed: `formspec-web` suppresses
Component graph metadata unless the sidecar matches completed
`hostEvidence.componentGraphContexts[]` evidence. Public `StudioCoreKernel`
consumer conformance now proves bound same-scope graph-wide copy/move workflows
and provenance stamps through the public facade. The trusted MCP/BFF publish
route now loads a real App Manifest / Definition / Component / Surface graph,
validates the Component graph context before publish, and `formspec-server`
serves the matching first-class runtime proof to renderers while preserving
`hostEvidence.componentGraphContexts[]` slot indexes and any completed
`uiGraphPolicies[]` evidence. The row remains
Partial until production copy/move consumers outside StudioCore use the shared
graph identity shape.

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
  target/source identity validation, exported identity results, and atomic
  `moveNode` `movedFrom` persistence through the core `component.moveNode`
  command).
- Projection consumer: `packages/formspec-layout/src/types.ts` and
  `packages/formspec-layout/src/planner-component-tree.ts`
  (`componentGraphIdentity` projection metadata).
- Component graph proof-source prose:
  `specs/app-graph/app-graph-validator-spec.md` defines
  `hostEvidence.componentGraphContexts[]` as explicit host request evidence,
  not an App Manifest sibling, ArtifactResolver artifact, runtime behavior
  authority, TraceIndex input, or ADR 0152 authorization source.
- AppGraph proof source:
  `schemas/component-graph-projection-context.schema.json`,
  `schemas/app-graph-validation-report.schema.json`,
  `packages/formspec-app-graph/src/component-graph-context.ts`,
  `packages/formspec-app-graph/src/validator.ts`, and
  `packages/formspec-layout/src/types.ts` define
  `hostEvidence.componentGraphContexts[]`, evidence-result proof slots, and the
  Component membership / loaded Component / loaded Surface / route /
  `targetSurfaceRoutes[]` checks.
- Renderer consumer: `packages/formspec-webcomponent/src/element.ts`,
  `packages/formspec-webcomponent/src/rendering/emit-node.ts`, and
  `packages/formspec-webcomponent/src/hub-types.ts` consume host-supplied
  `componentGraph` projection context and emit inert DOM `data-*` identity
  metadata for rendered Component nodes.
- React / public runtime consumer:
  `packages/formspec-react/src/context.tsx`,
  `packages/formspec-react/src/projection-metadata.ts`,
  `packages/formspec-react/src/defaults/fields/default-field.tsx`,
  `packages/formspec-react/src/defaults/layout/default-layout.tsx`,
  `packages/formspec-react/src/node-renderer.tsx`,
  `packages/formspec-react/src/node-renderer-display.tsx`, and
  `formspec-web/src/app/RespondentRuntime.tsx` consume host-supplied
  Component graph sidecars and emit inert DOM identity metadata; the public-web
  `formspec-web/src/app/attachment-upload-control.tsx` FileUpload override
  uses the same helper on its primary upload control. `formspec-web` now
  suppresses Component graph metadata unless the sidecar matches completed
  `hostEvidence.componentGraphContexts[]` AppGraph proof.
- Public runtime source seam:
  `formspec-web/src/ports/definition-source.ts`,
  `formspec-web/src/adapters/http/definition-source.ts`, and
  `formspec-web/src/adapters/stub/definition-source.ts` keep `getDefinition()`
  Definition-only while adding optional Component sidecar hooks. The HTTP
  adapter accepts `componentGraphContexts[]` host evidence only when every list
  entry is well-formed, preserving evidence-slot index identity.
- Production runtime host/BFF proof:
  `formspec-studio/packages/formspec-mcp/src/app-graph-publish.ts` requires
  `component_graph` to match pre-validation
  `hostEvidence.componentGraphContexts[]`, preserves all host-evidence array
  indexes, strips stale report/graph proof from `runtime_config`, and posts
  first-class `component_graph` / `host_evidence` with the completed report.
  `formspec-server/crates/formspec-server/src/services/forms.rs`,
  `formspec-server/crates/formspec-server-ports/src/lib.rs`,
  `formspec-server/crates/formspec-server/src/composition.rs`,
  `formspec-server/crates/formspec-server-postgres/src/lib.rs`, and
  `formspec-server/crates/formspec-server-postgres/migrations/202605260001_form_version_runtime_graph_proof.sql`
  persist and serve only a server-verified runtime proof tuple with required
  completed report phases, slot-index preservation, and completed UI Graph
  Policy evidence preserved when present.
- Fixtures:
  `tests/conformance/fixtures/app-graph-validator/component-route-targets.case.json`
  and
  `tests/conformance/fixtures/component-graph-projection-context/valid-respondent-context.json`;
  plus
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
- Component graph proof tests:
  `packages/formspec-app-graph/tests/component-graph-context.test.ts` and
  `tests/conformance/schemas/test_component_graph_projection_context_schema.py`.
- Renderer tests:
  `packages/formspec-webcomponent/tests/render-lifecycle.test.ts`.
- React / public runtime tests:
  `packages/formspec-react/tests/renderer.test.tsx`,
  `formspec-web/tests/adapters/http/definition-source.test.ts`, and
  `formspec-web/tests/app/respondent-runtime.test.tsx`;
  `formspec-web/tests/app/attachment-upload-control.test.tsx` covers the
  public-web FileUpload override.
- Verification for proof-source prose checkpoint:
  `git diff --check`;
  `git -C formspec diff --check`;
  `node scripts/generate-spec-artifacts.mjs --check`.
- Verification for component graph proof implementation:
  `npm run --workspace @formspec-org/app-graph test -- component-graph-context`;
  `npm run --workspace @formspec-org/app-graph test`;
  `npm run --workspace @formspec-org/app-graph build`;
  `npm run --workspace @formspec-org/types build`;
  `npm run --workspace @formspec-org/layout build`;
  `uv run pytest tests/conformance/schemas/test_component_graph_projection_context_schema.py tests/conformance/schemas/test_app_graph_validation_report_schema.py`;
  `node scripts/generate-spec-artifacts.mjs --check`;
  `git diff --check`.
- Verification for public-web runtime proof gate:
  `cd ../formspec-web && npm test -- tests/app/respondent-runtime.test.tsx tests/adapters/http/definition-source.test.ts`;
  `cd ../formspec-web && npm run typecheck`;
  `cd ../formspec-web && git diff --check`.
- Verification for public StudioCore copy/move consumer conformance:
  `cd ../formspec-studio && npx tsc --noEmit -p packages/formspec-studio-core/tsconfig.json`;
  `cd ../formspec-studio && npm run --workspace @formspec-org/studio-core test -- tests/kernel/proposal-manager-facade.test.ts`;
  `cd ../formspec-studio && npm run --workspace @formspec-org/studio-core test`;
  `cd ../formspec-studio && git diff --check -- packages/formspec-studio-core/tests/kernel/proposal-manager-facade.test.ts`.
- Verification for production runtime host/BFF proof:
  `cd ../formspec-studio && npm run build --workspace @formspec-org/mcp`;
  `cd ../formspec-studio && npm test --workspace @formspec-org/mcp -- app-graph-publish.test.ts`;
  `cd ../formspec-server && cargo check -p formspec-server --tests`;
  `cd ../formspec-server && cargo test -p formspec-server --test publish_runtime`;
  `cd ../formspec-server && cargo test -p formspec-server --test openapi_contract`;
  `cd ../formspec-server && cargo test -p formspec-server-postgres --test storage_foundation`;
  `cd ../formspec-server && npx playwright test tests/e2e-http/forms.spec.ts --grep "Trusted AppGraph producer publishes through the live server route"`;
  `cd ../formspec-web && FORMSPEC_WEB_LIVE_FORMSPEC_SERVER_URL=http://127.0.0.1:18082 npx playwright test tests/e2e/response-action-ledger-live.spec.ts --grep "public RespondentRuntime submit appends"` reached the migrated top-level publish payload and failed later on local unmanaged test-server brand seeding (`tenant brand not found`), not on runtime graph proof rejection.
- Verification:
  `python -m pytest tests/conformance/test_common_schema_defs.py tests/conformance/schemas/test_component_reference_fields_schema.py tests/conformance/spec/test_component_no_rewrite_regression.py -q`;
  `npm run --workspace @formspec-org/types build`;
  `npm run --workspace @formspec-org/types test -- tests/schema-sync.test.ts`;
  `cargo nextest run -p formspec-lint`;
  `node scripts/generate-spec-artifacts.mjs --check`;
  `npm run --workspace @formspec-org/app-graph test -- tests/component-route-validator.test.ts`;
  `npm run --workspace @formspec-org/studio-core test -- tests/kernel/proposal-manager-facade.test.ts`;
  `npm run --workspace @formspec-org/layout test -- tests/planner.test.ts`;
  `npm run test --workspace @formspec-org/webcomponent -- render-lifecycle.test.ts`;
  `npm run test --workspace @formspec-org/webcomponent`;
  `npx tsc --noEmit -p packages/formspec-webcomponent/tsconfig.json`;
  `npx tsc --noEmit -p packages/formspec-app-graph/tsconfig.json`;
  `cd ../formspec-studio && npx tsc --noEmit -p packages/formspec-studio-core/tsconfig.json`;
  `npx tsc --noEmit -p packages/formspec-layout/tsconfig.json`;
  `npm run --workspace @formspec-org/react build`;
  `npm run --workspace @formspec-org/react test -- tests/renderer.test.tsx`;
  `cd ../formspec-web && npm run typecheck`;
  `cd ../formspec-web && npm test -- tests/app/attachment-upload-control.test.tsx tests/adapters/http/definition-source.test.ts tests/app/respondent-runtime.test.tsx`;
  `cd ../formspec-web && npm run check:vendor-leaks`.

Still open:

- Production copy/move consumers outside StudioCore.

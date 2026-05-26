# Wireframe / Dynamic-UI Generator Spike v5

**Status:** complete - production-surface validation, not a new generator
**Lives at:** `formspec/thoughts/spikes/2026-05-25-wireframe-generator-spike-v5.md`
**Continues:** [`2026-05-24-wireframe-generator-spike-v4.md`](./2026-05-24-wireframe-generator-spike-v4.md)
**Authority:** stack-root [`thoughts/adr/0153-formspec-app-graph-production-boundary.md`](../../../thoughts/adr/0153-formspec-app-graph-production-boundary.md) (**accepted**, ratified 2026-05-26). Current disposition: stack rollup [`2026-05-24-adr-0150-followons-and-gating.md`](../../../thoughts/2026-05-24-adr-0150-followons-and-gating.md) §Spike v5 residual gaps; successor [`2026-05-26-wireframe-generator-spike-v6.md`](./2026-05-26-wireframe-generator-spike-v6.md).

## Verdict

v5 validates that the ADR 0153 production path was materially implemented at
write time; **superseded for current state by v6 + 2026-05-26 ratification** (substrate closed; ADR 0152 authorization still Held).

The repo now has real contracts and shared code for the app graph: App Manifest
v2.0/v2.1/v2.2, Surface, Data Sources, Component 1.2 route targets,
`ArtifactResolver`, `ModuleResolver`, `AppGraphValidator`, and UI Graph Policy
all have spec/schema/test evidence. The focused validation suite is green after
one type-boundary fix in `packages/formspec-app-graph/src/module-resolver.ts`.

The v4 lesson still holds. The production path is contract promotion plus shared
resolver/validator reuse, not promotion of the spike-local generator. Gates that
depend on runtime invocation, consumer wiring, broader cross-artifact
invariants, graph-wide Component identity, and ADR 0152 authorization remain
open or held.

## Scope Boundary

v5 validates implemented production surfaces after the ADR 0153 / ADR 0154
follow-on work. It does not add a `wireframe-generator-v5` package, copy v4
fixtures, or promote any `x-spike-*` mechanism.

In scope:

- current specs, schemas, generated types, source fixtures, and
  `@formspec-org/app-graph` package behavior;
- App Manifest, Surface, Data Sources, Response Actions, Component 1.2,
  ArtifactResolver, ModuleResolver, AppGraphValidator, and UI Graph Policy;
- narrow build repair where validation exposed a type/report-schema mismatch.

Out of scope:

- production Studio, MCP, lint, runtime, or projection consumer wiring;
- Response Actions invocation-engine / LedgerPort production runtime;
- route/session/Response/action runtime ownership implementation;
- ADR 0152 fine-grained authorization;
- any new generated UI or HTML preview.

## Validation Correction

The first `@formspec-org/app-graph` build failed:

```text
src/module-resolver.ts(484,7): error TS2322: Type 'ModuleResolutionSourcePointer'
is not assignable to type 'ModuleResolutionRegistrySourcePointer'.
```

The failure was real. `ModuleResolutionReport.widgetTokenSlots[].source` is
schema-constrained to Registry evidence, but `registrySource()` returned the
generic source-pointer type. v5 fixed the boundary by typing Registry inputs as
Registry artifact evidence and returning `ModuleResolutionRegistrySourcePointer`
with `artifactKind: "registry"`.

No validator semantics changed. The fix makes the TypeScript type contract match
the report schema and the existing fixture corpus.

## Implemented Surface Validation

| Surface | v5 result | What is proven | What stays open |
|---|---|---|---|
| App Manifest v2.x | Pass | v2.0 envelope, v2.1 `dataSources[]`, v2.2 `components[]`, handle uniqueness, version gates, non-form empty `definitions[]` shape | sibling-pin and module coherence still require resolver-backed online checks |
| Surface | Pass | draft/document split, published route/slot contract, local route diagnostics, transition executor boundary, Component 1.2 namespace linkage | cross-artifact graph checks and production consumers stay in resolver/validator gates |
| Data Sources | Pass | peer artifact spec/schema, source families, cache/staleness, provenance, availability shape, coarse fail-closed authorization fields, App Manifest v2.1 sibling identity | payload fetching, source-to-slot runtime loading, and AppGraphValidator integration beyond contract fixtures |
| Response Actions | Pass at spec/reference level | executor authority, validation tuple order, blocking, effects, idempotency, retry/replay/terminal-state contract | production invocation engine, SessionOpBatch aggregation, and LedgerPort wiring |
| Component 1.2 route targets | Pass for current slice | `targetSurfaceRoutes[]`, App Manifest `components[]` handles, route/slot target resolution, duplicate route claims, ref-less handle rejection, fake `targetDefinition` rejection with objective graph evidence, route-bound control Definition context | graph-wide node identity, Studio/kernel identity, provenance, explicit graph binding, Definition id alias matching, production consumers |
| ArtifactResolver | Pass for shared kernel | manifest-ref loading through host loader, discriminator/version/identity diagnostics, Data Sources and Components version gates, no fixture/path-derived ref evidence | AppGraphValidator/ModuleResolver integration and production consumers |
| ModuleResolver | Pass after type fix | module admission, version/dependency checks, sibling coherence, contribution ownership/category/payload checks, default modules, widget token-slot evidence | module-consuming graph semantics and consumer reuse |
| AppGraphValidator | Pass for current built-ins | deterministic report kernel, schema/evidence results, imported diagnostic preservation, phase gating, Component route checks, UI Graph Policy checks | broader validator-owned invariants for Surface slots, Experience units, Response Actions, Data Sources, runtime ownership |
| UI Graph Policy | Pass for current slices | host-loaded structural evidence, report-origin readiness, Surface/route coverage, Locale owner checks, ModuleResolver-backed owner evidence, hidden Definition refs, Theme widgetRef/token-slot/token-reference/token-category checks over loaded evidence | Registry token-category contribution compatibility, runtime hidden-state behavior, Studio feedback, production consumers, optional future App Manifest policy slot |
| Authorization | Held | fine-grained fields remain fail-closed in current schemas/fixtures where covered | ADR 0152 policy model and enforcement |

## v4 Disposition After v5

v4 remains valuable as the proof that the app graph is buildable and as the
source of the F1-F10 promotion list. v5 changes the status of several v4 items:

- F1 App Manifest is no longer spike-local only; v2.x contracts and fixtures are
  real, with `dataSources[]` and `components[]` staged behind version gates.
- F2 through F4 have shared package code now, but only partial graph semantics
  are in the shared validator.
- F5 has a Component 1.2 route-target contract and partial validator checks;
  non-form app identity is still not fully closed.
- F7 Data Sources is a real peer artifact contract, but runtime/source loading
  is still later work.
- F8 Response Actions remains the executor by spec, not by production runtime.
- F9 UI Graph Policy has executable AppGraphValidator slices now; renderer,
  Studio, and runtime consumers remain absent.
- F10 authorization stays out of scope until ADR 0152.

## Residual Gaps

1. **Gate 3b is still partial.** `AppGraphValidator` needs validator-owned
   invariants for Surface slot bindings to loaded Definitions, Experience units,
   Response Actions transition/action refs, Data Sources availability, and
   runtime ownership.
2. **Gate 3c is held.** Lint, Studio, MCPs, runtime, and projection do not yet
   consume shared validator output as the authority.
3. **ArtifactResolver and ModuleResolver are not yet one graph pipeline.** The
   kernels exist, but full AppGraphValidator handoff and consumer reuse remain
   later gates.
4. **Response Actions runtime is still open.** The spec/reference harness is
   green; production invocation, SessionOpBatch aggregation, and LedgerPort
   integration are not closed.
5. **Component identity remains partial under ADR 0154.** Route targets are
   validated, but graph-wide node identity, provenance, Studio/kernel identity,
   and explicit binding are still open.
6. **UI Graph Policy is implemented as host evidence, not a loaded manifest
   sibling.** That is an intentional current boundary, not a hidden App Manifest
   slot.
7. **The v4 acceptance corpus is only slice-promoted.** Current fixtures cover
   major ADR 0153 families, but the full A1-A14 / EC2 / EC5 / EC12 / EC13 /
   EC14 preservation map is not yet a single production conformance suite.

## Verification

Run from `formspec/` on 2026-05-25:

```sh
npm run --workspace @formspec-org/app-graph build
npm run --workspace @formspec-org/app-graph test
uv run python -m pytest \
  tests/conformance/schemas/test_bundle_manifest_schema.py \
  tests/conformance/spec/test_bundle_manifest_semantics.py \
  tests/conformance/spec/test_surface_contract.py \
  tests/conformance/schemas/test_data_sources_schema.py \
  tests/conformance/spec/test_data_sources_contract.py \
  tests/conformance/schemas/test_response_actions_schema.py \
  tests/conformance/spec/test_response_actions_runtime.py \
  tests/conformance/schemas/test_component_schema.py \
  tests/conformance/schemas/test_app_graph_validation_report_schema.py \
  tests/conformance/schemas/test_artifact_resolution_report_schema.py \
  tests/conformance/schemas/test_module_resolution_report_schema.py \
  tests/conformance/schemas/test_ui_graph_policy_schema.py \
  tests/conformance/test_app_graph_component_route_fixture_corpus.py \
  tests/conformance/test_module_resolver_fixture_corpus.py \
  tests/conformance/test_ui_graph_policy_host_loaded_fixture_corpus.py \
  tests/conformance/test_ui_graph_policy_semantic_fixture_corpus.py \
  tests/conformance/test_app_graph_ui_policy_surface_route_fixture_corpus.py \
  tests/conformance/test_app_graph_ui_policy_locale_owner_fixture_corpus.py \
  tests/conformance/test_app_graph_ui_policy_hidden_definition_fixture_corpus.py \
  tests/conformance/test_app_graph_ui_policy_theme_widget_fixture_corpus.py
```

Results:

- `npm run --workspace @formspec-org/app-graph build` passed after the
  Registry-source type fix.
- `npm run --workspace @formspec-org/app-graph test` passed: 11 test files, 133
  tests.
- Focused pytest passed: 374 tests.

`uv run` was used for pytest because the system `python3` in this checkout did
not have `pytest` installed.

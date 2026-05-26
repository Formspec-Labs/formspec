# Wireframe / Dynamic-UI Generator Spike v6

**Status:** complete — production-path revalidation; ADR 0153/0154 ratified 2026-05-26 (gate 9b / `landmarkLabel` drift closed in same cycle)
**Lives at:** `formspec/thoughts/spikes/2026-05-26-wireframe-generator-spike-v6.md`
**Continues:** [`2026-05-25-wireframe-generator-spike-v5.md`](./2026-05-25-wireframe-generator-spike-v5.md)
**Authority:** stack-root [`thoughts/adr/0153-formspec-app-graph-production-boundary.md`](../../../thoughts/adr/0153-formspec-app-graph-production-boundary.md); closure ledger [`2026-05-24-adr-0150-followons-and-gating.md`](../../../thoughts/2026-05-24-adr-0150-followons-and-gating.md) (freshness pass 2026-05-26)

## Verdict

v6 confirms that v5’s “materially implemented, not production-complete” posture is **stale on the upside**. Per the stack-root rollup, the ADR 0153 production path is now **closed at contract + reference implementation + journey-shaped consumer** for every gate v5 still listed as partial or held — except **ADR 0152 fine-grained authorization**, which remains deliberately deferred.

What changed since v5 is not another generator; it is **pipeline closure** (`produceAppGraphValidationReport()` wires ArtifactResolver → ModuleResolver → AppGraphValidator), **eight built-in cross-artifact validators** (up from the partial slice v5 audited), **App Manifest v2.3 `screeners[]`**, and **Wireframes-MCP** as a second production consumer outside StudioCore (`declareComponent`, `bindComponentMembership`, `add`/`move`/`copyComponentNode`, `declareUiGraphPolicy`, `produceAppGraphValidationReport`).

Gate **9b** (`landmarkLabel`, named `region`, host-landmark scope) closed in the same 2026-05-26 cycle ([`../plans/2026-05-26-adr-0153-ui-graph-policy-9b-closure.md`](../plans/2026-05-26-adr-0153-ui-graph-policy-9b-closure.md)); ADR 0153/0154 ratified per stack-root rollup. §Validation Correction below records the transient HEAD drift v6 observed before that slice landed.

The v4 lesson is unchanged: promote contracts and shared validation, not spike-local generators.

## Scope Boundary

v6 revalidates production surfaces after the 2026-05-26 ADR 0153 closure cycle (Wireframes-MCP graph-edit journey, UI Graph Policy MCP consumer, Surface→Definition slot second invariant, production wiring per-consumer test). It does not add a `wireframe-generator-v6` package or promote `x-spike-*` mechanisms.

In scope:

- `@formspec-org/app-graph` kernel, `produceAppGraphValidationReport()`, built-in cross-artifact validators, and current conformance corpora;
- App Manifest through v2.3, Surface, Data Sources, Response Actions, Component 1.2, Screener `surface:<route-id>` hops;
- `formspec-lint` report bridge, `formspec-server` / `formspec-web` / Studio / MCP consumer evidence cited in the rollup;
- Wireframes-MCP journey verbs and integration tests.

Out of scope:

- ADR 0152 policy model and enforcement;
- P3 product MCPs beyond Wireframes-MCP + Forms-MCP;
- full owner chaos-test pipeline (rollup defers to owner checkpoint);
- `landmarkLabel` drift (closed by 9b slice; historical note in §Validation Correction).

## Validation Correction (historical — closed 2026-05-26)

**Superseded by gate 9b closure.** At v6 write time, `npm run --workspace @formspec-org/app-graph build` failed:

```text
src/ui-graph-policy.ts(237,31): error TS2339: Property 'landmarkLabel' does not exist on type 'RouteA11YPolicy'.
```

Root cause: `formspec/schemas/ui-graph-policy.schema.json` defines `landmarkLabel` (required when `landmark` is `region`), and `packages/formspec-app-graph/src/ui-graph-policy.ts` validates `UI-POLICY-REGION-LABEL`, but `packages/formspec-types/src/generated/ui-graph-policy.ts` `RouteA11YPolicy` omits `landmarkLabel`. Downstream renderers (`formspec-react`, `formspec-webcomponent`, `formspec-layout`) already reference the field in source.

Matching pytest failure:

```text
tests/conformance/test_ui_graph_policy_semantic_fixture_corpus.py
  routePolicies[1].a11y: {'landmark': 'region'}  # missing landmarkLabel
```

Fixture: `tests/conformance/fixtures/ui-graph-policy/semantic/core-policy-families.case.json`.

Remediation (landed in 9b slice): regenerate `@formspec-org/types`, align semantic + a11y conformance corpora, dual Vitest corpora in `ui-graph-policy-conformance.test.ts`, projection + react + webcomponent consumers. v5’s Registry-source type fix in `module-resolver.ts` remains landed (`ModuleResolutionRegistrySourcePointer`).

## Implemented Surface Validation

| Surface | v6 result | What is proven since v5 | What stays open |
|---|---|---|---|
| App Manifest v2.x | **Pass** | v2.3 `screeners[]` + existing v2.0–v2.2 gates; schema at `bundle-manifest.schema.json` `$id` …/2.3 | Screener↔Surface association semantics beyond validator-owned `surface:<route-id>` checks |
| Surface | **Pass** | Unchanged contract; slot/transition diagnostics | Additional validator-owned invariants beyond current built-ins |
| Data Sources | **Pass** | Peer artifact + v2.1 sibling refs | Runtime fetch, slot loading, availability validator |
| Response Actions | **Pass (runtime)** | Engine executor + StudioCore ledger bridge + `formspec-server` capability routes + `formspec-web` browser/live E2E (rollup **Closed**; v5 listed runtime as open) | Product callers still must inject host `LedgerPort` for anchored `ai.*` emission |
| Runtime ownership | **Pass** | Four-owner model + `test_runtime_ownership_contract.py` + `formspec-web` live proof (rollup **Closed**) | — |
| Component 1.2 / ADR 0154 | **Pass** | Route targets + graph-wide node identity + provenance + StudioCore `bindComponentMembership` / `moveNode` / `copyNode`; Wireframes-MCP 5-verb journey + `graph-edit-journey.test.ts` (rollup **Closed**) | Definition id alias matching called out in ADR 0154 prose remains a narrow edge slice |
| `produceAppGraphValidationReport()` | **Pass** | Single pipeline: `resolveArtifacts` → `resolveModules` → `validateAppGraph`; used by Forms-MCP, Wireframes-MCP, `formspec-lint` bridge, server publish (rollup **Closed** gate 3c) | — |
| ArtifactResolver | **Pass** | Unchanged kernel; consumed by producer | — |
| ModuleResolver | **Pass** | v5 Registry-source typing fix retained | — |
| AppGraphValidator built-ins | **Pass (8 validators)** | `component-routes`, `component-graph-context`, `experience-action-refs`, `screener-surface-targets`, `surface-definition-slots`, `surface-experience-units`, `surface-response-action-triggers`, `ui-graph-policy` registered in `validator.ts` `runCrossArtifactValidators` | Broader Experience-unit semantics; Data Sources availability; optional future manifest policy slot |
| UI Graph Policy | **Pass** | Host-evidence model; ModuleResolver-backed token categories; route-landmark + gate 9b a11y profiles (`landmarkLabel`, named `region`, host-landmark scope); Wireframes-MCP `declareUiGraphPolicy` + validation journey | Focus/tabindex/ARIA synthesis beyond §5.3.1–§5.3.4 (deferred slice); optional App Manifest policy slot |
| Wireframes-MCP | **Pass** | Product MCP at `formspec-studio/packages/formspec-mcp-wireframes/`; 18 tests green including graph-edit + UI policy validation | Full chaos-test pipeline |
| Conformance / v4 corpus | **Pass (rollup)** | Promoted-family fixture audit closed per [`archive/plans/2026-05-24-adr-0153-conformance-closure.md`](../archive/plans/2026-05-24-adr-0153-conformance-closure.md); v5 gap 7 is stale | Per-family maintenance as specs evolve |
| Authorization | **Held** | Fail-closed coarse fields + posture extension hooks | ADR 0152 |

## v5 Disposition After v6

v5 §"Residual Gaps" listed seven items. The stack rollup (2026-05-26) closes six; v6 agrees except where HEAD drift reopens a hygiene item:

| v5 gap | v6 disposition |
|---|---|
| 1. Gate 3b partial cross-artifact invariants | **Closed.** Two named invariants with paired TS + Python conformance: Experience `actionRefs` → Response Actions (`APP-GRAPH-EXPERIENCE-ACTION-REF`) and Surface `definition-form` slots → manifest `definitions[]` (`APP-GRAPH-SURFACE-DEFINITION-SLOT`). Six additional built-in validators extend coverage (screener hops, experience units, response-action triggers, component graph context, etc.) without re-opening the gate. |
| 2. Gate 3c consumer wiring | **Closed.** `formspec-lint` bridge, server publish, Forms-MCP / Wireframes-MCP producers, Studio Form Health, live HTTP + browser proofs per rollup. |
| 3. Resolver pipeline unity | **Closed.** `produceAppGraphValidationReport()` is the shared handoff; v5’s “kernels exist but not one pipeline” is obsolete. |
| 4. Response Actions runtime | **Closed since v5** (rollup); v5 text was already stale. |
| 5. Component identity (ADR 0154) | **Closed.** Substrate + Wireframes-MCP journey consumer. |
| 6. UI Graph Policy host evidence | **Closed** — authoring/validation consumer + gate 9b a11y profiles (2026-05-26). |
| 7. Full v4 acceptance corpus as one suite | **Closed** per conformance-closure plan; v5 text was already stale. |

v5 §"Implemented Surface Validation" understates Response Actions runtime, production wiring, and MCP consumers — v6 table reflects rollup **Closed** rows.

## F1–F10 Tracker (v4 promotion list, v6 status)

| ID | v6 status |
|---|---|
| F1 App Manifest | **Promoted** — v2.0–v2.3 production schema/spec/fixtures |
| F2 AppGraphValidator | **Promoted** — `@formspec-org/app-graph` + report schema + eight built-in cross-artifact validators |
| F3 Surface | **Promoted** — contract + lint + studio draft/export |
| F4 ModuleResolver | **Promoted** — shared package + graph handoff |
| F5 Non-form Component identity | **Promoted** — Component 1.2 route targets + ADR 0154 closure; no `targetDefinition` shim in production path |
| F6 Runtime ownership | **Promoted** — spec + validator bar + `formspec-web` live proof |
| F7 Data Sources | **Promoted** — peer artifact contract; runtime loading still later |
| F8 Response Actions executor | **Promoted** — spec + production executor paths |
| F9 UI graph policy | **Promoted** — gate 9b closed 2026-05-26 |
| F10 Authorization | **Defer** — ADR 0152 |

## Residual Gaps (v6, post-ratification)

1. **ADR 0152 authorization** — fine-grained per-actor and per-widget-class scope (ADR 0153 gate 10 Held).
2. **UI Graph Policy focus/ARIA synthesis** — beyond narrow route-landmark + 9b profiles (`ui-graph-policy-spec.md` §8 item 1); new slice, not 9b.
3. **Data Sources runtime** — catalog contract closed; fetch, staleness enforcement, and availability cross-artifact checks remain future work.
4. **Optional App Manifest `uiPolicy` / `uiGraphPolicy` slot** — host-evidence model omits manifest sibling by design; product decision.
5. **ADR 0151 P3** — `ChangesetBranchManager`, full-bundle posture CI, schema-aware convergence shadow gate — execution log, not wireframe spike scope.

## Verification

Run from `formspec/` on 2026-05-26:

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
  tests/conformance/test_ui_graph_policy_semantic_fixture_corpus.py \
  tests/conformance/test_app_graph_ui_policy_surface_route_fixture_corpus.py \
  tests/conformance/test_app_graph_ui_policy_locale_owner_fixture_corpus.py \
  tests/conformance/test_app_graph_ui_policy_hidden_definition_fixture_corpus.py \
  tests/conformance/test_app_graph_ui_policy_theme_widget_fixture_corpus.py \
  tests/conformance/test_app_graph_surface_definition_slots_fixture_corpus.py \
  tests/conformance/test_app_graph_experience_action_ref_fixture_corpus.py \
  tests/conformance/test_app_graph_surface_response_action_trigger_fixture_corpus.py \
  tests/conformance/test_app_graph_screener_surface_target_fixture_corpus.py \
  tests/conformance/test_app_graph_surface_experience_unit_fixture_corpus.py \
  tests/conformance/spec/test_runtime_ownership_contract.py
```

From `formspec-studio/packages/formspec-mcp-wireframes/`:

```sh
npm test
```

Results on 2026-05-26:

| Command | Result |
|---|---|
| `@formspec-org/app-graph build` | **Passed** after 9b closure (was failing at v6 write — see §Validation Correction) |
| `@formspec-org/app-graph test` | **Passed** — 22 files, 211+ tests (dual ui-graph-policy conformance corpora) |
| Focused pytest (above) | **Passed** after 9b fixture alignment |
| `formspec-mcp-wireframes` `npm test` | **Passed** — 2 files, 18 tests (includes `graph-edit-journey.test.ts`) |

Control surface for gate status when this spike and v5 disagree: [`thoughts/2026-05-24-adr-0150-followons-and-gating.md`](../../../thoughts/2026-05-24-adr-0150-followons-and-gating.md) §"ADR 0153 / ADR 0154 gating table" and §"Spike v5 residual gaps — current disposition" (references this v6 doc for HEAD drift).

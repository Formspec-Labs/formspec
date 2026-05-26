---
name: ADR 0153 Shared graph primitives — second invariant (Surface→Definition slot resolution)
date: 2026-05-26
status: closed
scope:
  - formspec
parent-plan: thoughts/plans/2026-05-26-adr-0153-shared-graph-primitives-closure.md (first invariant — Experience ActionRef)
parent-rollup: thoughts/2026-05-24-adr-0150-followons-and-gating.md (rollup, gate-table row "Shared graph primitives")
adrs:
  - thoughts/adr/0153-formspec-app-graph-production-boundary.md (gate 3b)
---

# Shared graph primitives — second invariant closure (rollup Partial → Closed)

## Closing observation (named, per rollup §"Partial-row next checkpoints")

A second cross-artifact invariant lands alongside the Experience ActionRef invariant (precedent: commit `802ab9a` Conformance row scope reframe + first plan's named single-invariant landing). With **two** named cross-artifact invariants validator-owned + paired conformance, the row's "single-invariant landing as 'broader'" reservation resolves: "broader" is now plural in evidence, not just in spec text.

The new invariant: **Surface `definition-form` slot bindings MUST reference a Definition URL declared in the App Manifest `definitions[]`** (today: an authored Surface can name a Definition URL absent from the manifest's `definitions[]` and the validator emits no cross-artifact diagnostic). This is a graph-shape invariant — loading of declared Definitions is a separate resolver-phase concern.

## Why this invariant

Per Spike v5 Gap 1 (rollup line 115): "Gate 3b validator-owned invariants — Surface slot bindings to loaded Definitions, Experience units, Response Actions transition/action refs, Data Sources availability, runtime ownership". The first invariant covered Experience ActionRef; this slice covers Surface `definition-form` slot → Definition resolution.

Real user value: catches a class of authoring bugs where a Surface route's form-bearing slot references a Definition URL that wasn't declared in the App Manifest `definitions[]`. Today that error reaches the runtime; with this invariant, it fails at the AppGraphValidator before publish.

ADR 0153 §6 alignment: pure cross-artifact resolution over loaded Definition URLs from the App Manifest. No `x-spike-v*` extensions, no URL conventions, no Component identity shimming, no fine-grained authorization, no Runtime Plan promotion.

## Scope

1. **Validator**: new `formspec/packages/formspec-app-graph/src/surface-definition-slots.ts` — `validateSurfaceDefinitionSlots(context)` emits `APP-GRAPH-SURFACE-DEFINITION-SLOT` with reason `definition-not-declared` when a schema-valid `definition-form` slot's `binding.definitionRef` URL is absent from the manifest's `definitions[].url` declaration set. Missing-URL is owned by schema phase (surface schema requires `definitionRef` when `slotType === 'definition-form'`), not cross-artifact. Resolver-load completeness (declared but not loaded) is a separate phase concern.
2. **Dispatch wiring**: add to `runCrossArtifactValidators` allValidators list in `formspec/packages/formspec-app-graph/src/validator.ts`.
3. **Public re-export**: `formspec/packages/formspec-app-graph/src/index.ts`.
4. **Source-conformance fixture**: `formspec/tests/conformance/fixtures/app-graph-validator/surface-definition-slots.case.json` — App Manifest + Surface + Definition handles + cases:
   - positive: Surface `definition-form` slot binding URL matches `definitions[*].url`.
   - negative: slot URL absent from `definitions[]` → `definition-not-loaded` diagnostic.
   - positive: Surface has no `definition-form` slots → no diagnostic.
   - positive: Surface has `definition-form` slot resolving against one Definition among multiple loaded → no diagnostic.
5. **TS conformance runner**: `formspec/packages/formspec-app-graph/tests/surface-definition-slots-conformance.test.ts`.
6. **Python conformance runner**: `formspec/tests/conformance/test_app_graph_surface_definition_slots_fixture_corpus.py` mirrors TS pattern.

## What MUST NOT be promoted

- No URL-convention matching (per ADR 0153 §6.3).
- No Definition-side reverse-discovery semantics (Surface→Definition only, not Definition→Surface).
- No Component-bind-path-to-Definition-items checking (that's a Component-document-level concern, not a Surface-graph cross-artifact concern).
- No `data-sources` slot resolution (separate residual invariant per Spike v5 Gap 1).

## Production order anchor (ADR 0153 §7)

Phase 6 (conformance fixtures + lint wiring). The shared kernel already emits via `runCrossArtifactValidators`; the new diagnostic surfaces automatically through `formspec-lint` and `formspec-server` publish gate.

## Deviations

- None planned.

## Closure evidence

(populated when the slice lands)

- `formspec/packages/formspec-app-graph/src/surface-definition-slots.ts`
- `formspec/packages/formspec-app-graph/src/validator.ts` (allValidators list extended)
- `formspec/packages/formspec-app-graph/src/index.ts` (re-export)
- `formspec/tests/conformance/fixtures/app-graph-validator/surface-definition-slots.case.json`
- `formspec/packages/formspec-app-graph/tests/surface-definition-slots-conformance.test.ts`
- `formspec/tests/conformance/test_app_graph_surface_definition_slots_fixture_corpus.py`
- Rollup gate-table row Status transitions Partial → Closed (named-observation: "second invariant lands; 'broader' = plural in evidence").

## Blocked-on

- None.

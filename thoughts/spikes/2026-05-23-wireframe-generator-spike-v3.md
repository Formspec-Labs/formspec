# Wireframe / Dynamic-UI Generator Spike v3

**Status:** in progress spike - whole-app graph proof, not production infrastructure  
**Lives at:** `formspec/spikes/wireframe-generator-v3/`  
**Based on:** [`2026-05-23-wireframe-generator-spike-v2.md`](./2026-05-23-wireframe-generator-spike-v2.md), [`2026-05-23-wireframe-generator-spike-v2-gaps.md`](./2026-05-23-wireframe-generator-spike-v2-gaps.md), [`../../../thoughts/adr/0150-formspec-as-layered-ui-substrate.md`](../../../thoughts/adr/0150-formspec-as-layered-ui-substrate.md)  
**Command:** `cd formspec/spikes/wireframe-generator-v3 && npm run spike`

## Verdict

Pending. v3 is the "Next Test" from the v2 gaps note: can Formspec validate and execute an app graph from App Manifest through runtime behavior without product-specific assumptions?

This spike is explicitly non-normative. It does not publish an official Surface schema, conformance suite, module contract, runtime policy, or ADR 0152 authorization shape.

## Next Test Graph

```text
App Manifest
  -> module admission
  -> artifact resolution
  -> Surface route graph
  -> slot payload validation
  -> per-view Definition lifecycle
  -> per-Definition Response Actions
  -> generated Component bundle
  -> route/session/runtime behavior
```

## Current Implementation

Initial v3 implementation adds:

- Spike-local app-coherence validator: `src/coherence.ts`.
- Posture-driven module admission using ADR 0150 field-equality rules.
- Explicit multi-sidecar Response Actions indexing through `x-spike-v3-responseActions`.
- Registry-backed widget payload validation via `widgetShape.props`.
- Spike-local data-source catalog for non-form slots.
- Screener target validation for `surface:<route-id>` terminal hops.
- Bundle-wide generated Component ID collision check.

The first run caught a real graph failure: the `runPlaybook` transition targeted `/playbooks/:playbookId/run` without supplying `playbookId`. v2 schema validation could not see that failure; v3 app coherence did. The fixture now supplies `{ "playbookId": "selectedPlaybookId" }`.

## Missing Pieces Tracker

| ID | Gap | v3 status | Evidence |
|---|---|---|---|
| M1 | App coherence validator | Implemented initial pass | `src/coherence.ts`; `output/coherence-report.json` reports 0 errors. |
| M2 | Official Surface schema sketch | Spike-local only | `fixtures/lexassist.surface.schema.json` is marked non-conformance. Official schema remains unmodified. |
| M3 | Multi-sidecar indexing | Partially implemented | `x-spike-v3-responseActions` indexes five sidecars; official App Manifest still has singular `responseActions`. |
| M4 | Non-form Component identity | Pending | v3 still inherits Component 1.1 `targetDefinition` shim from v2. |
| M5 | Runtime state semantics | Pending | Route graph validation exists; lifecycle/runtime harness not yet added. |
| M6 | Module admission/trust enforcement | Implemented initial pass | Posture `allowedModules`, module dependency closure, Registry contribution ownership. |
| M7 | Data-source model for non-form slots | Implemented initial pass | `fixtures/lexassist.data-sources.json`; payload `dataSourceRefs` checked. |
| M8 | A11y / responsive / Locale | Partial | Locale module keys validate; a11y/responsive route policy not yet modeled. |
| M9 | AI runtime behavior | Pending | AI hints still carry as payload/provenance; no runtime event behavior yet. |
| M10 | Screener + deep-link composition | Partial | `fixtures/lexassist.screener.json` targets `surface:*`; runtime deep-link behavior not yet executed. |

## Edge Case Tracker

| # | Edge case | v3 status |
|---|---|---|
| 1 | Route has two `definition-form` slots | Validator warns; runtime ownership still pending. |
| 2 | One Experience unit reused across routes but points at different Definitions | Pending negative fixture. |
| 3 | Two Response Actions sidecars define same action id | Validator rejects bundle action-id collision. |
| 4 | Module widget needs Definition Response and host state | Positive fixture uses `response:*` + `host:*` data sources. |
| 5 | Non-form app has zero Definitions | Pending positive fixture; Component shim still blocks full proof. |
| 6 | Route transitions fire durable/idempotent/undoable host events | Pending runtime harness. |
| 7 | Module versions conflict across sibling artifacts | Validator rejects sibling/App Manifest version mismatch. |
| 8 | Generated Component IDs collide across routes | Validator rejects generated bundle collisions. |
| 9 | Surface slot payload validates structurally but violates module semantics | Validator compiles `widgetShape.props` and rejects payload mismatch. |
| 10 | Route reachable only through Screener terminal hop | Screener target resolves; reachability semantics pending runtime. |
| 11 | Surface route embeds another route that itself has a form slot | Positive fixture embeds `thread`; runtime implications pending. |
| 12 | Definition slot hidden by route policy while Response is mid-draft | Pending route policy/runtime harness. |
| 13 | Locale strings collide across modules or route instances | Pending negative fixture. |
| 14 | Theme styles widget without declared token slots | Pending Theme fixture. |

## Deviations

- **Spike-local Surface schema.** `lexassist.surface.schema.json` remains under a spike `$id` and explicitly says it is not conformance. This avoids accidentally ratifying M2.
- **First-party module names in a fixture.** The Registry still uses `x-formspec-*` names to mirror ADR 0150 intent. The fixture is not a published module registry.
- **App Manifest sidecar extensions.** `x-spike-v3-responseActions`, `x-spike-v3-dataSources`, `x-spike-v3-posture`, and `x-spike-v3-screeners` exist because the official App Manifest does not yet carry every app-level sidecar index v3 needs.
- **Experience singularity.** The official Experience shape still has one `targetDefinition`; v3 treats Experience as app-level and records the singular-shape gap as an info finding.
- **Component identity shim.** Non-form routes still validate as Component 1.1 by carrying a `targetDefinition` compatibility shim. This remains the M4 gap.

## Findings

1. **The whole-app validator is the correct next proof surface.** It caught a transition-param bug that per-file schema validation missed.
2. **ADR 0150 holds for M1/M3/M6/M7 at spike scope.** App Manifest, Registry, Surface, Experience, Definition, Response Actions, Posture, Data Sources, Screener, and generated Component IDs can be checked as one graph without LexAssist-specific logic in the validator.
3. **Current official schemas still force spike extensions for full app indexing.** The validator can prove the graph, but the graph is not fully expressible through official App Manifest fields yet.

## What This Means For ADR 0150 / 0151 / 0152

- **ADR 0150:** The operating model is strengthened for app coherence, module admission, and contribution payload validation. Surface and App Manifest still need official schema work before this becomes conformance.
- **ADR 0151:** Bundle-unique Component IDs are checkable at generated-bundle time. M4 must close before non-form route Components stop relying on `targetDefinition` shims.
- **ADR 0152:** v3 deliberately does not define fine-grained actor or widget-class policy. It may simulate allow/deny inputs later, but canonical scope semantics remain deferred.

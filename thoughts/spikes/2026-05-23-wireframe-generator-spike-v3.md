# Wireframe / Dynamic-UI Generator Spike v3

**Status:** implemented spike - whole-app graph proof, not production infrastructure
**Lives at:** `formspec/spikes/wireframe-generator-v3/`
**Based on:** [`2026-05-23-wireframe-generator-spike-v2.md`](./2026-05-23-wireframe-generator-spike-v2.md), [`2026-05-23-wireframe-generator-spike-v2-gaps.md`](./2026-05-23-wireframe-generator-spike-v2-gaps.md), [`../../../thoughts/adr/0150-formspec-as-layered-ui-substrate.md`](../../../thoughts/adr/0150-formspec-as-layered-ui-substrate.md)
**Command:** `cd formspec/spikes/wireframe-generator-v3 && npm run test:negative && npm run spike && npx tsc --noEmit`

## Verdict

ADR 0150's operating model holds for this spike's proof scope: the extended legal-workspace fixture validates and executes the Next Test graph from App Manifest through route/session/runtime behavior without product-specific assumptions in the validator or runtime.

This is not a conformance claim. The remaining ADR/spec-level work is explicit:

- **ADR 0150 / Surface:** promote a real Surface schema and app-level sidecar indexes for Response Actions, Data Sources, Posture, Screeners, Runtime Plan, and multi-Experience composition. v3 uses spike-local extension slots until those indexes exist.
- **ADR 0151 / Component identity:** remove the Component 1.1 `targetDefinition` shim for non-form routes and make non-form route Component identity first-class.
- **ADR 0150 / Locale, A11y, Theme:** define app-wide Locale/module-key collision rules, responsive/a11y route policy, and Theme token slot contracts for module widgets.
- **ADR 0152:** keep fine-grained per-actor/per-artifact/per-widget authorization out of this spike. v3 only proves session membership and binary `allowedActors`.

The remaining unproven edge cases are EC2, EC5, EC12, EC13, and EC14. They are tracked below as future proof fixtures, not hidden assumptions.

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
- App Manifest-driven local fixture resolution through explicit `x-spike-v3-fixture` refs.
- Explicit multi-sidecar Response Actions indexing through `x-spike-v3-responseActions`, including target Definition and version checks.
- Registry-backed widget payload validation via `widgetShape.props`.
- Spike-local data-source catalog for non-form slots.
- Screener target validation for `surface:<route-id>` terminal hops.
- Runtime plan execution for route/session behavior, per-Definition in-progress/completed state, transient host events, durable-effect idempotency guards, and product-neutral AI command events.
- Negative self-tests for stale sidecar refs, unadmitted contribution owners, unresolved nav targets, required-field runtime blocking, duplicate durable-effect idempotency keys, unknown runtime commands, route/Definition ownership, and undeclared Screener hops.
- Bundle-wide generated Component ID collision check.

The first run caught a real graph failure: the `runPlaybook` transition targeted `/playbooks/:playbookId/run` without supplying `playbookId`. v2 schema validation could not see that failure; v3 app coherence did. The fixture now supplies `{ "playbookId": "selectedPlaybookId" }`.

An external review then found two proof-boundary weaknesses: Response Actions were still tied to a LexAssist URL convention, and registry contributions could be used without proving their owner module was app/posture-admitted. v3 now resolves sidecars through App Manifest fixture refs, compares indexed sidecar versions to loaded Response Actions, and rejects contributions whose owner module is not admitted.

## Missing Pieces Tracker

| ID | Gap | v3 status | Evidence |
|---|---|---|---|
| M1 | App coherence validator | Implemented initial pass | `src/coherence.ts`; `output/coherence-report.json` reports 0 errors; `npm run test:negative` exercises false-negative guards. |
| M2 | Official Surface schema sketch | Spike-local only | `fixtures/lexassist.surface.schema.json` is marked non-conformance. Official schema remains unmodified. |
| M3 | Multi-sidecar indexing | Implemented at spike scope | `x-spike-v3-responseActions` indexes five sidecars with target Definition refs, versions, and fixture refs; official App Manifest still has singular `responseActions`. |
| M4 | Non-form Component identity | Pending | v3 still inherits Component 1.1 `targetDefinition` shim from v2. |
| M5 | Runtime state semantics | Implemented initial pass | `src/runtime.ts`; `output/runtime-report.json` records one completed response, one in-progress draft checkpoint, route events, and zero runtime errors. |
| M6 | Module admission/trust enforcement | Implemented initial pass | Posture `allowedModules`, module dependency closure, Registry contribution ownership, and owner-module admission checks. |
| M7 | Data-source model for non-form slots | Implemented initial pass | `fixtures/lexassist.data-sources.json`; payload `dataSourceRefs` checked. |
| M8 | A11y / responsive / Locale | Partial | Locale module keys validate; a11y/responsive route policy not yet modeled. |
| M9 | AI runtime behavior | Implemented initial pass | Runtime emits product-neutral `ai.command-issued` and `ai.command-completed` events for `x-formspec-ai-*` intents. |
| M10 | Screener + deep-link composition | Implemented initial pass | Runtime executes a declared `surface:playbook-runner` Screener hop with route params; undeclared hops are rejected by self-test. |

## Edge Case Tracker

| # | Edge case | v3 status |
|---|---|---|
| 1 | Route has two `definition-form` slots | Validator warns; runtime state is keyed by Definition URL, but same-route multi-slot ownership remains a warning. |
| 2 | One Experience unit reused across routes but points at different Definitions | Pending negative fixture. |
| 3 | Two Response Actions sidecars define same action id | Validator rejects bundle action-id collision. |
| 4 | Module widget needs Definition Response and host state | Positive fixture uses `response:*` + `host:*` data sources. |
| 5 | Non-form app has zero Definitions | Pending positive fixture; Component shim still blocks full proof. |
| 6 | Route transitions fire durable/idempotent/undoable host events | Runtime keeps `hostEvent` transient with no idempotency key and rejects duplicate durable-effect idempotency keys; undo remains unmodeled. |
| 7 | Module versions conflict across sibling artifacts | Validator rejects sibling/App Manifest version mismatch. |
| 8 | Generated Component IDs collide across routes | Validator rejects generated bundle collisions. |
| 9 | Surface slot payload validates structurally but violates module semantics | Validator compiles `widgetShape.props` and rejects payload mismatch. |
| 10 | Route reachable only through Screener terminal hop | Runtime executes a declared Screener terminal hop and rejects undeclared targets. |
| 11 | Surface route embeds another route that itself has a form slot | Positive fixture embeds `thread`; runtime implications pending. |
| 12 | Definition slot hidden by route policy while Response is mid-draft | Pending route policy/runtime harness. |
| 13 | Locale strings collide across modules or route instances | Pending negative fixture. |
| 14 | Theme styles widget without declared token slots | Pending Theme fixture. |

## Deviations

- **Spike-local Surface schema.** `lexassist.surface.schema.json` remains under a spike `$id` and explicitly says it is not conformance. This avoids accidentally ratifying M2.
- **First-party module names in a fixture.** The Registry still uses `x-formspec-*` names to mirror ADR 0150 intent. The fixture is not a published module registry.
- **App Manifest sidecar extensions.** `x-spike-v3-responseActions`, `x-spike-v3-dataSources`, `x-spike-v3-posture`, `x-spike-v3-screeners`, `x-spike-v3-runtimePlan`, and local `x-spike-v3-fixture` pointers exist because the official App Manifest does not yet carry every app-level sidecar index v3 needs.
- **Experience singularity.** The official Experience shape still has one `targetDefinition`; v3 treats Experience as app-level and records the singular-shape gap as an info finding.
- **Component identity shim.** Non-form routes still validate as Component 1.1 by carrying a `targetDefinition` compatibility shim. This remains the M4 gap.

## Findings

1. **The whole-app validator is the correct next proof surface.** It caught a transition-param bug that per-file schema validation missed.
2. **App Manifest authority needs explicit sidecar refs.** Deriving Response Actions URLs from Definition URLs was too product-shaped; the spike now requires indexed sidecar refs with target Definition, version, and local fixture identity.
3. **Module trust must follow contribution use, not only document declarations.** Registry contribution owners are now checked against App Manifest modules and Posture `allowedModules`.
4. **Runtime execution is viable at spike scope.** The runtime plan reaches `playbook-runner`, completes the submit action response, leaves the AI draft-checkpoint response in progress, emits transient host events without idempotency keys, and emits AI command issued/completed events with zero runtime errors.
5. **Current official schemas still force spike extensions for full app indexing.** The validator can prove the graph, but the graph is not fully expressible through official App Manifest fields yet.

## What This Means For ADR 0150 / 0151 / 0152

- **ADR 0150:** The operating model is strengthened for app coherence, module admission, contribution payload validation, and route/session runtime execution. Surface, Runtime Plan, Data Sources, and App Manifest sidecar indexes still need official schema work before this becomes conformance.
- **ADR 0151:** Bundle-unique Component IDs are checkable at generated-bundle time. M4 must close before non-form route Components stop relying on `targetDefinition` shims.
- **ADR 0152:** v3 deliberately does not define fine-grained actor or widget-class policy. Runtime checks are limited to session membership and binary `allowedActors`; canonical scope semantics remain deferred.

## Verification

Focused spike gates passed on the committed v3 fixture:

- `cd spikes/wireframe-generator-v3 && jq empty fixtures/lexassist.app-manifest.json fixtures/lexassist.data-sources.json fixtures/lexassist.runtime-plan.json fixtures/lexassist.runtime-plan.schema.json`
- `cd spikes/wireframe-generator-v3 && npx tsc --noEmit`
- `cd spikes/wireframe-generator-v3 && npm run test:negative`
- `cd spikes/wireframe-generator-v3 && npm run spike`

External review gates closed with no open findings:

- Architecture review after the App Manifest/module-admission remediation: **ACCEPT**.
- Code review after the runtime Response Actions remediation: **ACCEPT**.

Repo-wide verification status is separate from the spike proof. `npm run docs:generate`, `npm run docs:check`, `npm run check:deps`, and `cargo nextest run --workspace` passed after the v3 commits. `make test` and `python3 -m pytest tests/ -v` are blocked in the current checkout by non-v3 environment/tooling issues recorded during closeout: the generated-types path still expects the pre-demotion Validation Mapping `MasterTable` const, and the Python environments used by the commands lack required JCS/RFC 8785 test dependencies.

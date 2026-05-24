# Wireframe / Dynamic-UI Generator Spike v4

**Status:** in progress - production-findings prototype, not production infrastructure
**Lives at:** `formspec/spikes/wireframe-generator-v4/`
**Based on:** [`2026-05-23-wireframe-generator-spike-v3-production-findings.md`](./2026-05-23-wireframe-generator-spike-v3-production-findings.md), [`2026-05-23-wireframe-generator-spike-v3.md`](./2026-05-23-wireframe-generator-spike-v3.md), [`2026-05-23-wireframe-generator-spike-v2-gaps.md`](./2026-05-23-wireframe-generator-spike-v2-gaps.md), [`../../../thoughts/adr/0150-formspec-as-layered-ui-substrate.md`](../../../thoughts/adr/0150-formspec-as-layered-ui-substrate.md)

## Verdict

Pending. v4 must classify each F1-F10 production finding as `Promote-to-Spec`, `Defer-to-Production`, or `Reject-with-Reason`.

## Scope Boundary

v4 prototypes the v3 production findings through the first four steps of the suggested implementation order:

1. prose contracts
2. spike-local schemas
3. fixtures
4. shared resolver/validator libraries

v4 stops before production lint wiring, conformance promotion, or production projection/runtime code. It must not promote:

- `x-spike-v3-*` App Manifest extensions
- local fixture refs as production identity
- Response Actions lookup by product URL convention
- first-party module names embedded in product fixtures as registry truth
- non-form Component `targetDefinition` compatibility shims
- per-file schema validation as a substitute for app validation
- widget payloads as an implicit data-source model
- Surface or Component code that infers action behavior outside Response Actions

## F1-F10 Tracker

| ID | Finding | v4 status | Verdict |
|---|---|---|---|
| F1 | App Manifest needs first-class sidecar indexes | Passing spike-local prototype | Pending final |
| F2 | App Graph Validator should be a production primitive | Planned | Pending |
| F3 | Surface should become a normal contract surface | Planned | Pending |
| F4 | Module admission needs one shared resolver | Planned | Pending |
| F5 | Non-form Component identity must stop pretending to be a Definition | Planned | Pending |
| F6 | Runtime state needs explicit ownership | Planned | Pending |
| F7 | Data Sources need a spec, not widget payload folklore | Planned | Pending |
| F8 | Response Actions should remain the only action executor | Planned | Pending |
| F9 | Locale, Theme, a11y, and responsive policy are part of the graph | Planned | Pending |
| F10 | Authorization remains ADR 0152 work | Planned | Pending |

## P0/P1/P2 Tracker

| Tier | Recommendation | v4 status |
|---|---|---|
| P0 | Promote App Manifest to a real app envelope with first-class sidecar indexes | Passing spike-local F1 proof |
| P0 | Promote Surface to official schema/spec/conformance | Planned as spike-local proof only |
| P0 | Build `AppGraphValidator` as a production validation layer | Planned as shared spike library |
| P0 | Build a shared module admission and contribution resolver | Planned as shared spike library |
| P0 | Remove the non-form Component `targetDefinition` shim | Planned as prototype identity only |
| P1 | Define route/session/Response/action state ownership | Planned |
| P1 | Specify multi-form-route behavior | Planned |
| P1 | Define Data Sources as a contract surface | Planned as spike-local contract |
| P1 | Keep Response Actions as the only action executor | Planned |
| P1 | Add fixtures for EC2, EC5, EC12, EC13, EC14 | Planned |
| P2 | Define module-aware Locale ownership and collision behavior | Planned as negative fixture |
| P2 | Define responsive and a11y route policy | Planned as spike-local contract |
| P2 | Define Theme token-slot contracts for module widgets | Planned as negative fixture |
| P2 | Carry ADR 0152 authorization into the graph only after ratification | Planned as boundary check |

## Acceptance Test Tracker

| # | Preserved v3 acceptance test | v4 status |
|---|---|---|
| A1 | stale sidecar ref | Passing |
| A2 | unadmitted contribution owner | Passing |
| A3 | unresolved navigation target | Passing |
| A4 | unresolved Surface route ref | Planned |
| A5 | missing route params | Planned |
| A6 | required-field runtime blocking | Passing |
| A7 | duplicate durable-effect idempotency key | Passing |
| A8 | unknown runtime command | Passing |
| A9 | route/Definition ownership mismatch | Passing |
| A10 | undeclared Screener terminal hop | Passing |
| A11 | duplicate Response Actions action id | Planned |
| A12 | generated Component id collision | Planned |
| A13 | module-widget payload mismatch | Planned |
| A14 | module version conflict across sibling artifacts | Planned |

## Previously Unproven v3 Edge Cases

| EC | Edge case | v4 status |
|---|---|---|
| EC2 | One Experience unit reused across routes but points at different Definitions | Planned |
| EC5 | Non-form app has zero Definitions | Planned |
| EC12 | Definition slot hidden by route policy while Response is mid-draft | Planned |
| EC13 | Locale strings collide across modules or route instances | Planned |
| EC14 | Theme styles widget without declared token slots | Planned |

## Deviations

1. The first v4 commit combined the spike scaffold and tracker document. The requested review preference was doc-first before code. The scaffold did include copied v3 spike code and fixtures; it did not change production or normative surfaces before F1. This commit shape is still a process deviation and should not be repeated.
2. v4 keeps production changes out of `schemas/`, `specs/`, lint, conformance, and runtime packages. The F1 work is limited to spike-local fixtures, schemas, resolver loading, coherence validation, and generated spike output.
3. The copied v3 scaffold initially retained `x-spike-v3-*` authority. F1 removed those from v4 source and fixtures. The only remaining mentions are README/history text and a schema guard that rejects `x-spike-v3-fixture`.

## Findings

### F1 - App Manifest Sidecar Indexes

The F1 candidate shape works as a spike-local App Manifest graph root. `definitions[]`, `experiences[]`, `responseActions[]`, `registries[]`, `surfaces[]`, `dataSources[]`, `posture`, `screeners[]`, `runtimePlan`, `modules[]`, `sessions[]`, and `locales[]` are all first-class manifest fields in `spikes/wireframe-generator-v4/fixtures/lexassist.app-manifest.json`.

The important result is authority placement. The manifest now names the graph; local `fixture` paths only tell the harness where to load files. The resolver records fixture paths in `output/artifact-resolution-report.json`, but the coherence checks validate canonical URLs, versions, and target relationships.

Response Actions lookup no longer depends on product URL convention. Each manifest `responseActions[]` ref carries `targetDefinition.url`, and the validator rejects stale, duplicate, unloaded, and unlisted sidecars by manifest path. Each `experiences[]` ref carries `targetDefinitions[]`, so the graph can validate Experience-to-Definition coverage without relying on the old singular App Manifest `experience` slot.

The candidate App Manifest schema is deliberately spike-local: `fixtures/lexassist.app-manifest.v4.schema.json`. This proves buildability without promoting schema shape before prose contract review. It requires `experiences[].targetDefinitions[]` and rejects any copied `x-spike-v3-*` manifest-ref metadata so old v3 fixture authority cannot silently return.

F1 boundary review found two fail-open validator paths: `runtimePlan` was loaded but not part of coherence validation, and `experiences[].targetDefinitions[]` could be omitted without failing. Both are now closed. `runtimePlan` is part of `GeneratorInputs`, the coherence validator compares the manifest ref against the loaded document URL/version, and the negative harness covers stale runtime-plan refs, missing Experience target indexes, and Definition omissions from the Experience target index. Re-review returned zero open F1 findings.

Verification on 2026-05-24:

- `npx tsc --noEmit`
- `npm run test:negative`
- `npm run spike`

All three passed. The spike run validated the App Manifest, Registry, Surface, Posture, Screener, Locale, Experience, five Definitions, five Response Actions sidecars, Runtime Plan, generated Components for eight routes, app coherence, and runtime behavior with zero schema, coherence, or runtime errors.

### Current Suggestions

1. Promote the first-class App Manifest indexes as a prose contract candidate, not as production schema yet. The production shape should keep canonical artifact identity in `url`, `version`, compatibility fields, and typed targets. It must not include local fixture paths.
2. Split the production implementation into three primitives: `ArtifactResolver` for manifest ref loading, `ModuleResolver` for admission/contribution ownership, and `AppGraphValidator` for cross-document invariants. Generated Components and runtime execution should consume their output, not define graph truth.
3. Keep Surface input-side and Component output-side. Surface should own route graph, slots, navigation, and app shell structure. Component generation should remain a projection and should not define Surface semantics.
4. Treat the non-form Component `targetDefinition` value as an output-only compatibility shim until Component identity is fixed. The v4 generator labels it as `x-spike-v4-output-compatibility`; production should replace the shim with route or Surface identity before serious authoring/regeneration work depends on it.
5. Keep ADR 0152 authorization out of this spike except binary actor admission. v4 can pressure-test `sessions[]` and `posture.allowedActors[]`; it should not invent per-route, per-widget, or per-action policy.
6. Add the missing negative cases before any production wiring: unresolved embedded Surface route, missing transition params, duplicate Response Actions action id, generated Component id collision, module-widget payload mismatch, module version conflict, and EC2/EC5/EC12/EC13/EC14.

## What This Means For ADR 0150 / 0151 / 0152

- ADR 0150: F1 strengthens the app-envelope model. App Manifest should be the graph root, and official prose should describe first-class sidecar indexes before schema work. Surface remains the input contract for routes; Components remain renderer artifacts.
- ADR 0151: no normative change yet. The current Component identity gap remains real; v4 should only preserve an output compatibility marker until route/Surface-targeted Component identity is designed.
- ADR 0152: no scope expansion. Session membership and binary `allowedActors` are enough for this spike. Fine-grained authorization remains deferred to ADR 0152.

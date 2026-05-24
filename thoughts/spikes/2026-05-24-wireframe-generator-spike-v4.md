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
| F2 | App Graph Validator should be a production primitive | Passing spike-local prototype | Pending final |
| F3 | Surface should become a normal contract surface | Passing spike-local prototype | Pending final |
| F4 | Module admission needs one shared resolver | Passing spike-local prototype | Pending final |
| F5 | Non-form Component identity must stop pretending to be a Definition | Passing spike-local prototype | Pending final |
| F6 | Runtime state needs explicit ownership | Passing spike-local prototype | Pending final |
| F7 | Data Sources need a spec, not widget payload folklore | Passing spike-local prototype | Pending final |
| F8 | Response Actions should remain the only action executor | Planned | Pending |
| F9 | Locale, Theme, a11y, and responsive policy are part of the graph | Planned | Pending |
| F10 | Authorization remains ADR 0152 work | Planned | Pending |

## P0/P1/P2 Tracker

| Tier | Recommendation | v4 status |
|---|---|---|
| P0 | Promote App Manifest to a real app envelope with first-class sidecar indexes | Passing spike-local F1 proof |
| P0 | Promote Surface to official schema/spec/conformance | Passing as spike-local proof only |
| P0 | Build `AppGraphValidator` as a production validation layer | Passing spike-local F2 proof |
| P0 | Build a shared module admission and contribution resolver | Passing spike-local F4 proof |
| P0 | Remove the non-form Component `targetDefinition` shim | Quarantined as output-only compatibility |
| P1 | Define route/session/Response/action state ownership | Passing spike-local F6 proof |
| P1 | Specify multi-form-route behavior | Passing spike-local ambiguity checks |
| P1 | Define Data Sources as a contract surface | Passing spike-local F7 proof |
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
| A4 | unresolved Surface route ref | Passing |
| A5 | missing route params | Passing |
| A6 | required-field runtime blocking | Passing |
| A7 | duplicate durable-effect idempotency key | Passing |
| A8 | unknown runtime command | Passing |
| A9 | route/Definition ownership mismatch | Passing |
| A10 | undeclared Screener terminal hop | Passing |
| A11 | duplicate Response Actions action id | Planned |
| A12 | generated Component id collision | Passing |
| A13 | module-widget payload mismatch | Passing |
| A14 | module version conflict across sibling artifacts | Passing |

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

### F2 - AppGraphValidator Boundary

F2 turns the app graph proof into a named spike primitive. `src/artifact-resolver.ts` resolves the manifest's first-class refs into `GeneratorInputs`, `src/schema-loader.ts` builds the schema validator, and `src/app-graph.ts` owns source artifact schema validation plus cross-artifact coherence. Data Sources remain F7 work: F2 loads them and checks graph references, but does not claim a full Data Source schema contract. The CLI now calls those primitives and writes `output/app-graph-report.json`; it no longer performs source artifact validation inline.

This matters because graph truth now has one boundary. `validateAppGraph()` reports per-artifact schema failures and coherence failures in one result, and the negative harness routes app-level assertions through that result. If a source artifact is schema-invalid, the validator returns `APP-GRAPH-SCHEMA`, emits `APP-GRAPH-COHERENCE-SKIPPED`, and does not throw from shape assumptions. The runtime and generated Components remain downstream evidence: they run after the app graph report is built and do not decide whether the graph is valid.

The F2 proof is still fixture-local. It does not promote official schemas, does not add lint or conformance wiring, and does not complete the future production split. `ArtifactResolver`, `ModuleResolver`, and `AppGraphValidator` should still become package-level primitives only after the prose contracts settle.

Verification on 2026-05-24:

- `npx tsc --noEmit`
- `npm run test:negative`
- `npm run spike`

All three passed after the extraction. The spike run now reports zero app graph schema failures, zero app coherence errors, and zero runtime errors. F2 re-review returned zero open findings.

### F3 - Surface Contract Boundary

F3 makes Surface-local route graph validation an explicit spike contract. `src/surface-contract.ts` now owns default-route cardinality, duplicate route ids, nav path resolution, transition targets, transition parameter supply, embedded route targets, payload nav targets, and route reachability. `src/app-graph.ts` runs this Surface contract after schema validation and before cross-artifact coherence, and the CLI reports `surface contract errors` separately from schema and app-coherence errors.

This keeps the boundary cleaner than v3. Surface-local route invariants no longer live inside the App Manifest coherence block. AppGraph still owns cross-artifact checks such as `Surface.targetExperience` matching the manifest Experience ref, Definition slot references, Experience unit references, Screener terminal hops, module-widget admission, and widget payload shape.

The F3 proof remains spike-local. It does not promote `schemas/surface.schema.json`, does not add conformance fixtures, and does not introduce lint codes. It only proves that Surface can be validated as a normal contract surface before projection and runtime execution.

Verification on 2026-05-24:

- `npx tsc --noEmit`
- `npm run test:negative`
- `npm run spike`

The negative harness now covers unresolved embedded Surface route refs, missing transition route params, duplicate route ids, zero or multiple default routes, unreachable routes, and payload nav target failures in addition to the earlier top-level nav-target case. F3 review returned zero open findings; the residual test gaps from that review were then added to the harness.

### F4 - Module Admission Resolver Boundary

F4 extracts module admission and contribution ownership into `src/module-resolver.ts`. The resolver now owns registry indexing, default module inclusion, module version checks, dependency checks, sibling module coherence, posture admission, contribution owner lookup, duplicate contribution detection, and admitted-module checks for contributed values.

`src/coherence.ts` now consumes the resolver instead of duplicating module logic inline. Slot, Experience unit, and module-widget checks ask the resolver whether the contribution exists, has the expected category, has a single owning module, and is owned by an admitted posture-approved module. Payload shape validation still happens in the app validator because it needs the resolved widget entry plus the app data-source set.

The F4 proof is still spike-local. It does not add lint codes, does not wire production lint or conformance, and does not promote resolver APIs into packages. It only proves that module admission can be one shared app-graph primitive.

Verification on 2026-05-24:

- `npx tsc --noEmit`
- `npm run test:negative`
- `npm run spike`

The negative harness now covers unadmitted contribution owners, unresolved app module versions, module version conflicts across sibling artifacts, module dependency failure, registry category/name conflict, unowned contributions, duplicate contribution owners, wrong contribution categories, and posture-denied contributions. F4 review returned zero open findings; the residual module-resolver test gaps from that review were then added to the harness.

### F5 - Non-Form Component Identity

F5 keeps Component generation downstream and makes route identity explicit in generated output. Every generated route Component now carries `extensions.x-formspec-component-identity` with `identityKind: "surface-route"`, `targetSurface`, `targetRoute.id`, `targetRoute.path`, and the route's `definitionRefs`. `extensions.x-formspec-surface` still carries renderer-facing Surface metadata.

The Component 1.1 `targetDefinition` field remains only because the current Component schema requires it. For non-form routes, the generator marks the shim under `x-spike-v4-output-compatibility` with `outputOnly: true` and `mustNotPromote: true`. `validateComponentBundle()` now rejects non-form route Components that do not quarantine the shim, shim markers that disagree with the generated `targetDefinition`, form-capable routes that carry the shim marker, and route Components that omit surface-route or Surface metadata identity.

This is not the production fix. The production fix is still a Component identity contract that can target Surface routes without fake Definition binding. F5 only proves the boundary needed before that promotion: route identity must be first-class in generated output, and the `targetDefinition` compatibility value cannot be treated as source truth.

Verification on 2026-05-24:

- `npx tsc --noEmit`
- `npm run test:negative`
- `npm run spike`
- `npm run docs:check`
- `git diff --check -- spikes/wireframe-generator-v4 thoughts/spikes/2026-05-24-wireframe-generator-spike-v4.md`

The negative harness now covers missing route Component identity, Surface identity mismatch, non-form shim quarantine failure, form-capable shim leakage, non-form shim target mismatch, and generated Component id collision.

### F6 - Runtime State Ownership

F6 makes state ownership visible in the spike runtime instead of leaving it implicit in a Definition-keyed response map. `definition-form` Surface slots now declare a spike-local `responseBinding` with `owner: "response"`, an instance policy, and `actionOwner: "response-actions"`. Session-scoped forms bind to the active session; route-scoped forms bind to a declared route param such as `threadId` or `playbookId`.

`executeRuntimePlan()` now reports separate ownership buckets for route state, session state, Response instances, and Response Action invocations. Route state remains Surface-owned, session state records the session and actor set, Response state is keyed by derived Response instance ids, and action invocation state records the Response Actions owner, validation tuple, effects, actor, and Response instance target.

This is still a spike-local runtime contract. It does not promote a production Runtime Plan schema or ADR 0152 policy model. The production lesson is that route/session/Response/action state must be separate before production runtime code grows retries, replay, collaborative sessions, or multi-form routes.

Verification on 2026-05-24:

- `npx tsc --noEmit`
- `npm run test:negative`
- `npm run spike`

The negative harness now covers missing Response binding, route-param binding to an undeclared route param, runtime missing Response binding, runtime missing Response instance param, and same-Definition multi-slot ambiguity. The positive runtime check also verifies that the report keeps route, session, Response, and Response Actions ownership explicit.

### F7 - Data Source Contract

F7 turns the spike Data Source sidecar into a schema-validated app artifact instead of a set of widget payload strings. `lexassist.data-sources.schema.json` now requires each source to declare a kind, owner, scope, and runtime behavior. Runtime behavior names delivery, cache mode and staleness, authorization boundary, failure mode, and provenance.

The fixture now covers the v3 production source families: `host:*`, `response:*`, `resource:*`, `conversation:*`, and `query:*`. The previous `stream:demand-response-thread` payload ref is now `conversation:demand-response-thread`, and the library view references a query-backed `query:library-search` source. Payloads still reference sources by id, but the app graph validates those ids against a first-class catalog rather than treating payloads as the authority.

`validateAppGraph()` now includes Data Sources in source schema validation. `validateDataSources()` checks duplicate ids, Definition and route references, id prefix to source-kind alignment, live/draft cache behavior, cache staleness rules, and provenance-kind alignment. Widget payload schema mismatches remain module-widget contract failures, not Data Source authority.

This is not a production Data Source spec. The production lesson is that Data Sources need their own prose contract before production schemas or runtime code. That contract must define source family semantics, cache and staleness behavior, failure behavior, provenance, and authorization boundaries without burying them in widget props.

Verification on 2026-05-24:

- `jq empty spikes/wireframe-generator-v4/fixtures/lexassist.data-sources.json spikes/wireframe-generator-v4/fixtures/lexassist.data-sources.schema.json spikes/wireframe-generator-v4/fixtures/lexassist.experience.json`
- `npx tsc --noEmit`
- `npm run test:negative`
- `npm run spike`

The negative harness now covers missing Data Source runtime behavior, source-kind/id-prefix mismatch, invalid live cache behavior, provenance-kind mismatch, unresolved payload source refs from earlier work, and module-widget payload schema mismatch.

### Current Suggestions

1. Promote the first-class App Manifest indexes as a prose contract candidate, not as production schema yet. The production shape should keep canonical artifact identity in `url`, `version`, compatibility fields, and typed targets. It must not include local fixture paths.
2. Split the production implementation into three primitives: `ArtifactResolver` for manifest ref loading, `ModuleResolver` for admission/contribution ownership, and `AppGraphValidator` for cross-document invariants. F2 proves the shape in the spike; production should wait for prose contracts and then promote the split into shared packages. Generated Components and runtime execution should consume their output, not define graph truth.
3. Keep Surface input-side and Component output-side. Surface should own route graph, slots, navigation, and app shell structure. Component generation should remain a projection and should not define Surface semantics.
4. Treat the non-form Component `targetDefinition` value as an output-only compatibility shim until Component identity is fixed. The v4 generator labels it as `x-spike-v4-output-compatibility`; production should replace the shim with route or Surface identity before serious authoring/regeneration work depends on it.
5. Promote runtime state ownership only after the prose contract names the owners. F6 suggests four separate production surfaces: Surface route state, Session actor/navigation state, Response instance state, and Response Actions invocation/effect state. Do not keep production Response state keyed only by Definition URL.
6. Promote Data Sources as their own prose contract before production code. Do not let widget payloads define source semantics. The contract should name source families, cache/staleness rules, failure modes, provenance, and authorization boundary behavior.
7. Keep ADR 0152 authorization out of this spike except binary actor admission. v4 can pressure-test `sessions[]` and `posture.allowedActors[]`; it should not invent per-route, per-widget, or per-action policy.
8. Add the remaining negative cases before any production wiring: duplicate Response Actions action id and EC2/EC5/EC12/EC13/EC14. F3 through F7 already cover embedded Surface route refs, missing transition params, generated Component id collision, module version conflict, ambiguous runtime Response ownership, and module-widget payload mismatch.

## What This Means For ADR 0150 / 0151 / 0152

- ADR 0150: F1 strengthens the app-envelope model. App Manifest should be the graph root, and official prose should describe first-class sidecar indexes before schema work. Surface remains the input contract for routes; Components remain renderer artifacts.
- ADR 0151: no normative change yet. The current Component identity gap remains real; v4 should only preserve an output compatibility marker until route/Surface-targeted Component identity is designed.
- ADR 0152: no scope expansion. Session membership and binary `allowedActors` are enough for this spike. Fine-grained authorization remains deferred to ADR 0152.

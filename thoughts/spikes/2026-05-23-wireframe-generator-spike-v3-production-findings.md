# Wireframe Generator Spike v3 - Production Findings And Recommendations

**Status:** production handoff  
**Related:** [`2026-05-23-wireframe-generator-spike-v3.md`](./2026-05-23-wireframe-generator-spike-v3.md), [`2026-05-23-wireframe-generator-spike-v2-gaps.md`](./2026-05-23-wireframe-generator-spike-v2-gaps.md), [`../../../thoughts/adr/0150-formspec-as-layered-ui-substrate.md`](../../../thoughts/adr/0150-formspec-as-layered-ui-substrate.md)

## Verdict

Spike v3 was the right proof. It should not become the production implementation.

The spike proved that ADR 0150's app model can validate and execute a whole graph: App Manifest, module admission, artifact resolution, Surface routing, slot payload validation, per-view Definitions, per-Definition Response Actions, generated Components, and route/session/runtime behavior. It also proved that per-file schema validation is too weak for production.

Production should preserve the graph boundary and replace the spike machinery with first-class specs, schemas, resolvers, lint passes, fixtures, and runtime contracts.

## What v3 Proved

1. A whole-app validator is the right proof surface. v3 caught route-param and graph-coherence bugs that individual schema validation could not see.
2. App Manifest must be the graph root. Product URL conventions are not a safe way to discover Response Actions, Definitions, Experiences, Data Sources, Posture, Screeners, or Runtime Plan artifacts.
3. Module trust must follow contribution use. A document declaring a module is not enough; the consuming value must resolve to a contribution owned by an admitted module.
4. Contribution payloads need semantic validation. A Surface `module-widget` slot can be structurally valid and still invalid against the contributing widget's `widgetShape.props`.
5. Runtime execution is viable at spike scope. The runtime can move through routes, execute per-Definition Response Actions, maintain draft/completed Response state, emit host events, and reject duplicate durable idempotency keys without product-specific assumptions.
6. The current official schemas cannot express the full graph yet. v3 needed spike-local sidecar indexes and fixture refs because the official App Manifest and Surface surfaces are not complete.

## Production Findings

### F1. App Manifest Needs First-Class Sidecar Indexes

Production must remove the `x-spike-v3-*` indexes and define official App Manifest fields for every app-level artifact family:

- `definitions[]`
- `experiences[]`
- `responseActions[]`
- `surfaces[]`
- `screeners[]`
- `dataSources[]`
- `runtimePlan`
- `posture`
- `registries[]`
- `modules[]`
- `sessions[]`, if durable session identity is part of the app envelope

Each reference should carry enough identity to validate target compatibility and prevent convention-based lookup.

### F2. The App Graph Validator Should Be A Production Primitive

Production needs a named `AppGraphValidator`, separate from per-document schema validation. It should load the manifest, resolve artifacts, and check cross-artifact invariants:

- every artifact validates against its schema
- every manifest reference resolves
- every Definition, Experience, Response Actions, Surface, Screener, Data Source, Registry, Posture, and Runtime Plan reference resolves
- every Response Actions sidecar targets a listed Definition and compatible version
- every Experience targets a listed Definition and compatible version
- every Experience `itemRef` resolves to the target Definition
- every Experience `actionRef` resolves to a loaded Response Actions action
- every Surface `definitionRef`, `unitRef`, `moduleId`, `widgetName`, and `embed-route` ref resolves
- every Screener `surface:<route-id>` target resolves
- every route param used by a transition is supplied or derivable
- generated Component ids are bundle-unique
- Response Actions ids are bundle-unique where app-level routing can trigger by id
- module versions and lock fields are coherent across sibling artifacts

Per-file validation remains necessary, but it should not be treated as an app-level proof.

### F3. Surface Should Become A Normal Contract Surface

Surface should move from spike-local proof to official schema/spec/conformance work:

- `schemas/surface.schema.json`
- `specs/surface/surface-spec.md`
- conformance fixtures for valid and invalid route graphs
- lint rules for unreachable routes, unresolved embedded routes, module-widget admission, and widget config payload mismatch
- generated TypeScript types
- registry/conformance coverage for `x-formspec-surface`

Keep the boundary clean: Surface-local lint owns route reachability and local slot shape. AppGraph validation owns cross-document resolution.

### F4. Module Admission Needs One Shared Resolver

The production code should not duplicate module logic across lint passes. Build a shared module resolver that handles:

- document `modules[]`
- App Manifest `modules[]`
- posture `allowedModules[]`
- dependency closure
- version range checks
- optional publisher and lock-hash equality checks
- conflict rejection when two admitted modules contribute the same value
- contribution owner lookup
- contribution payload schema compilation
- E603/E604-style diagnostics for unresolved values and mismatched payloads

This resolver should serve Surface, Experience, Component, Response Actions, Trace, Ledger, Validation Mapping, and future module-consuming documents.

### F5. Non-Form Component Identity Must Stop Pretending To Be A Definition

The `targetDefinition` shim is the largest production smell. Non-form route Components need first-class identity:

- `targetSurface` or `targetRoute`
- app-context targeting for app chrome
- bundle-unique node ids
- stable route/node identity for Trace and regeneration
- no fake Definition binding for non-form routes

Do this before building serious authoring or regeneration tooling on non-form routes.

### F6. Runtime State Needs Explicit Ownership

Production should model route, session, Response, and action state separately.

- Surface owns current route and transition graph.
- Session owns actor membership, current route, durable navigation state, and host context.
- Definition owns data shape and validation behavior.
- Response owns per-Definition instance state.
- Response Actions owns action invocation, preconditions, validation tuple selection, effects, idempotency, and terminal state.

A `definition-form` slot should bind to a concrete Definition and a concrete Response instance policy. If a route has multiple form slots, ownership must be explicit. A warning is acceptable in a spike; production should either require explicit action ownership or reject ambiguous submit/navigation behavior.

### F7. Data Sources Need A Spec, Not Widget Payload Folklore

Non-form slots need typed data sources with clear runtime behavior:

- `response:*` for data from a Definition Response
- `host:*` for host application state
- `resource:*` for document or media resources
- `query:*` for remote or indexed lookups
- `conversation:*` for chat or AI transcript state, if adopted

Each source type needs a snapshot/live rule, cache rule, staleness rule, authorization boundary, failure mode, and provenance story.

### F8. Response Actions Should Remain The Only Action Executor

Components and Surface transitions may trigger actions. They should not infer action behavior.

Runtime should resolve a trigger to a Response Action, then let the Response Actions engine handle preconditions, validation, blocking, effects, durable idempotency, retry/replay, and terminal state. This keeps execution portable across renderers.

### F9. Locale, Theme, A11y, And Responsive Policy Are Part Of The Graph

V3 proved enough Locale addressing to expose the gap, not to close it.

Production needs:

- module-aware locale key ownership
- collision rules for module-provided strings
- route-level navigation and keyboard requirements
- responsive slot policy
- Theme token slots declared by module widgets
- failure behavior when a Theme targets an undeclared token slot

These are not UI polish. They affect whether generated and module-composed UI can be rendered safely.

### F10. Authorization Remains ADR 0152 Work

V3 only proved session membership and binary `allowedActors`. Production should not smuggle fine-grained authorization into Surface, Component, or Response Actions without ADR 0152.

The unresolved scope includes:

- per-actor artifact access
- per-route access
- per-widget access
- per-action authorization
- host-owned policy inputs
- audit vocabulary for authorization decisions

Keep this seam explicit.

## Production Recommendations

### P0 - Contract And Resolver Foundation

1. Promote App Manifest to a real app envelope with first-class sidecar indexes.
2. Promote Surface to official schema/spec/conformance.
3. Build `AppGraphValidator` as a production validation layer.
4. Build a shared module admission and contribution resolver.
5. Remove the non-form Component `targetDefinition` shim by giving route Components first-class identity.

### P1 - Runtime Model

1. Define route/session/Response/action state ownership.
2. Specify multi-form-route behavior.
3. Define Data Sources as a contract surface.
4. Keep Response Actions as the only action executor.
5. Add fixtures for the unproven v3 edge cases: EC2, EC5, EC12, EC13, and EC14.

### P2 - Rendering And Policy Maturity

1. Define module-aware Locale ownership and collision behavior.
2. Define responsive and a11y route policy.
3. Define Theme token-slot contracts for module widgets.
4. Carry ADR 0152 authorization into the graph only after its scope is ratified.

## Do Not Promote From The Spike

Do not promote these v3 mechanisms directly:

- `x-spike-v3-*` App Manifest extensions
- local fixture refs as production identity
- Response Actions lookup by product URL convention
- first-party module names embedded in product fixtures as registry truth
- non-form Component `targetDefinition` compatibility shims
- per-file schema validation as a substitute for app validation
- widget payloads as an implicit data-source model
- Surface or Component code that infers action behavior outside Response Actions

## Acceptance Tests To Preserve

Production work should preserve v3's failure tests as acceptance cases:

- stale sidecar ref
- unadmitted contribution owner
- unresolved navigation target
- unresolved Surface route ref
- missing route params
- required-field runtime blocking
- duplicate durable-effect idempotency key
- unknown runtime command
- route/Definition ownership mismatch
- undeclared Screener terminal hop
- duplicate Response Actions action id
- generated Component id collision
- module-widget payload mismatch
- module version conflict across sibling artifacts

## Suggested Implementation Order

1. Write the prose contracts first: App Manifest, Surface, module resolver, AppGraph validation, Data Sources, runtime state.
2. Update schemas after the prose contracts settle.
3. Add fixtures before broad runtime changes.
4. Build the resolver and validator as shared libraries.
5. Wire lint passes through the shared resolver.
6. Move the spike's positive and negative fixtures into conformance.
7. Only then build production projection/runtime code on top.

This keeps v3's useful pressure test and avoids turning spike scaffolding into platform architecture.

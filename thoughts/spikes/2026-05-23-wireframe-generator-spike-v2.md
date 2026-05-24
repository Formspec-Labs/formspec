# Wireframe / Dynamic-UI Generator Spike v2

**Status:** implemented spike — ADR-0150 alignment proof, not production infrastructure  
**Lives at:** `formspec/spikes/wireframe-generator-v2/`  
**Based on:** [`2026-05-23-wireframe-generator-spike.md`](./2026-05-23-wireframe-generator-spike.md), [`../../../thoughts/adr/0150-formspec-as-layered-ui-substrate.md`](../../../thoughts/adr/0150-formspec-as-layered-ui-substrate.md)  
**Command:** `cd formspec/spikes/wireframe-generator-v2 && npm run spike`

## Verdict

v1 was implemented and useful: it generated 8 LexAssist route Components and validated them. But under ADR 0150 it is the wrong shape to promote. Its main architectural error is the monolithic product Definition plus `x-spike-kind` payloads tunneled through `x-generation`.

v2 is the better direction. Keep v1 as evidence of the gap; use v2 as the substrate proof case.

## What v2 Implements

The v2 fixture set has:

- 1 App Manifest 2.0 fixture with `definitions[]`, `registries[]`, `surfaces[]`, and `modules[]`.
- 1 module-aware Registry with `module`, `unit-kind`, `widget`, `action-intent`, and `slot-type` entries.
- 1 spike-local Surface schema and 1 Surface route graph using the closed slot taxonomy.
- 5 Definitions, one per form-capable view: `new-matter`, `thread-composer`, `playbook-runner`, `library-settings`, `profile`.
- 5 Response Actions sidecars, each scoped to its target Definition.
- 1 Experience document with app-level actors, tasks, and units, including module-contributed non-form units.
- 8 generated per-route Component documents plus a renderer-neutral IR and HTML preview.

Validation result from the current worktree:

```text
schema validation failures: 0
routes: 8
definitions: 5
response action sidecars: 5
```

`npx tsc --noEmit` also passes.

## How The Layers Work Together

```text
App Manifest
  indexes the app snapshot: Definitions, Registry, Surface, modules, sidecars

Registry
  declares modules and the values they contribute:
  unit kinds, widgets, action intents, slot types

Surface
  owns routes, slots, transitions, and route composition
  consumes Experience units, Definitions, and module widgets
  does not depend on Component

Experience
  owns actors, tasks, units, unit lineage, itemRefs, actionRefs
  can describe both form units and non-form module units

Definition
  owns one form-capturing view only
  non-form routes have zero Definitions

Response Actions
  own action semantics for one Definition submit/effect surface

Component
  is generated output per route
  carries lineage and module payloads for renderers
```

The practical flow is:

1. Surface chooses a route and ordered slots.
2. A `definition-form` slot binds a route region to a per-view Definition plus an Experience data-entry unit.
3. An `experience-unit` slot binds to a non-form Experience unit, such as a result list, gallery, conversation, or document viewer.
4. A `module-widget` slot binds directly to a Registry-declared widget.
5. A `static-content` slot carries literal text.
6. An `embed-route` slot links another Surface route.
7. The generator emits one schema-valid Component document per route.
8. The renderer reads Component `extensions["x-formspec-surface"]`, `extensions["x-formspec-widget"]`, `extensions["x-formspec-field"]`, `extensions["x-formspec-action"]`, and `extensions["x-formspec-ai"]`; `x-generation` is provenance only.

That last point is the main correction from v1.

## Alignment With ADR 0150

| ADR 0150 commitment | v2 alignment | Remaining gap |
|---|---|---|
| Formspec is a layered semantic UI substrate | The app is assembled from App Manifest + Registry + Surface + Experience + Definitions + Response Actions + generated Component. | No official app-coherence resolver yet. |
| Per-view Definition grain | Five small Definitions replace the v1 monolith. Non-form routes `matter`, `doc-viewer`, and `playbooks` use no real form Definition. | Component 1.1 still requires `targetDefinition`, so non-form generated Components carry a documented shim. |
| Module-aware Registry | Registry includes modules and contribution categories for unit kinds, widgets, slot types, and action intent. | Contribution-payload validation is only local/spike-level, not a general conformance phase. |
| Surface as composition primitive | Surface owns routes, slot bindings, and transitions; it consumes Experience and Definitions but does not consume Component. | Official `surface.schema.json` does not exist yet, so v2 ships a spike-local schema. |
| Closed slot-type taxonomy | Surface uses exactly `definition-form`, `experience-unit`, `module-widget`, `static-content`, `embed-route`. | Needs promotion to `x-formspec-surface` conformance fixtures. |
| AI runtime hooks are substrate carry-points | AI hints live in `extensions["x-formspec-ai"]`; behavior is not hard-coded. | No ledger/event runtime behavior is implemented. |
| `x-generation.sourceModule` separates template origin from author | Generated module nodes stamp `sourceModule`; payload does not live under `x-generation.spike`. | Current Component schema allows it only because `x-generation` remains open. |

## Alignment With The Original UI-Schema Review

The v2 spike does not reopen the UI-schema decisions. It follows them:

- It uses PascalCase Component primitives (`Section`, `Stack`, `Grid`, `Card`, field widgets), matching the canonical vocabulary direction.
- It avoids `Columns` and uses `Grid` for three-pane route composition.
- It treats `Component` as the highest concrete UI tier, but generated Component remains output, not the source of route truth.
- It uses `extensions` separately from root `x-*` annotations, matching the review's decision to keep those as separate extension lanes.
- It keeps Definition as business/form logic and puts non-form presentation payload in Experience/Surface/module widget extensions.

The main new point beyond the UI-schema review is scope: ADR 0150 moves the conversation above form UI tiers into an app-level substrate. Theme/Component still matter, but route topology belongs in Surface, not in Theme pages or Component root trees.

## Rulespec-Core Patterns Worth Reusing

The reusable parts are process and conformance architecture, not the domain vocabulary:

- **Authority order.** Rulespec distinguishes shape authority from behavioral authority. Formspec should do the same for substrate modules: schema/sub-schema owns shape; spec prose owns behavior; generated fixtures prove projection.
- **Layered conformance.** Rulespec's L0-L5 model maps cleanly to Formspec's substrate: vocabulary/registry, constraints, projectors/generators, SDK/runtime, conformance corpus.
- **Projector parity.** The v2 generator should grow a harness like Rulespec's Attach/Extract/Validate/RoundTrip/Derive discipline: source artifacts -> Component -> IR -> HTML should be reproducible and checked.
- **Closed-enum lattices with explicit extension lanes.** This matches ADR 0150's `oneOf [closed-core, x-pattern]` posture.
- **Reference maps.** Module registries should ship concise machine-readable and human-readable maps so agents can resolve contribution semantics without loading every spec.

Do not reuse Rulespec's assertion/evidence terms directly for Surface. That would import a governance vocabulary into a UI substrate. Reuse the discipline, not the nouns.

## Good, Bad, Change

Good:

- v2 matches ADR 0150's core reframes.
- The source artifacts and generated Components validate against the current repo schemas where official schemas exist.
- Non-form routes are real app routes, not fake form pages.
- `x-generation` is back to provenance instead of payload transport.

Bad:

- Surface is still spike-local because the official Surface schema has not landed.
- Experience and App Manifest still have singular sidecar slots in current schemas; v2 uses explicit `x-spike-v2-*` notes to mark the gap.
- Non-form Component routes need a temporary `targetDefinition` compatibility shim.
- Cross-artifact coherence is not yet enforced: module resolution, route graph connectivity, actionRef resolution, and contribution-payload validation are generator assumptions.

Change next:

1. Promote the spike-local Surface schema into the `x-formspec-surface` module/conformance suite.
2. Add an app-coherence validator that checks routes, slots, modules, contribution payloads, action refs, and bundle-wide Component IDs.
3. Refactor Experience/App Manifest sidecar indexing so multi-Definition apps do not need `x-spike-v2-*` escape hatches.
4. Add a Rulespec-style generator parity harness for Component and IR output.

## Bottom Line

This is good architecture, with two caveats. The ADR 0150 shape is better than the v1 spike, and the implementation proves it can run against current schemas. But the official schema surface is only halfway there: Surface, multi-sidecar app indexing, and app-level conformance need to land before this becomes production substrate.

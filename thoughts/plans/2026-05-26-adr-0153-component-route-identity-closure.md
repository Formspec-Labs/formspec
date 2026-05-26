---
name: ADR 0153 Component Surface/route identity row closure
date: 2026-05-26
status: in-progress
scope:
  - formspec-studio
  - formspec
parent: thoughts/2026-05-24-adr-0150-followons-and-gating.md (rollup, gate-table row "Component Surface/route identity")
adrs:
  - thoughts/adr/0153-formspec-app-graph-production-boundary.md (gate 8)
  - thoughts/adr/0154-component-surface-route-identity.md (gates 7, 8)
---

# Component Surface/route identity closure (rollup Partial → Closed)

## Closing observation (named, per rollup §"Partial-row next checkpoints")

The Wireframes-MCP graph-edit verb surface exists as journey-shaped, kernel-facing class methods (`declareComponent`, `activateComponent` / `bindComponentMembership`, `addComponentNode`, `moveComponentNode`, `copyComponentNode`) and an integration test exercises them end-to-end against a multi-Component App Manifest. The test proves: graph-wide identity flows through the kernel; bound same-scope add/move/copy succeed; missing/stale/cross-scope identity fails closed before mutation; graph-wide `copiedFrom` / `movedFrom` provenance lands.

That is the journey-shaped consumer ADR 0154 gates 7+8 require ("production consumers outside StudioCore to emit/use graph-wide identity in multi-Surface or multi-Component operations").

## Scope

5 verbs added to `formspec-studio/packages/formspec-mcp-wireframes/src/index.ts`:

1. **`declareComponent({ handle, url, version? })`** — wraps `kernel.declareComponent`; appends to App Manifest `components[]`.
2. **`bindComponentMembership({ componentId, component })`** — wraps `kernel.bindComponentMembership`; activates singleton edit scope. (Verdict B verb name `bindComponentToRoute` reshaped → see Deviations.)
3. **`addComponentNode({ componentId, parentNodeId?, target?, node })`** — wraps `kernel.addNode`; accepts `target.graphScope = { component, surface }`.
4. **`moveComponentNode({ sourceComponentId, sourceNodePath, targetComponentId, source?, target? })`** — wraps `kernel.moveNode`; persists `movedFrom` graph-wide identity.
5. **`copyComponentNode({ source, target, idPolicy?, boundSubtreePolicy? })`** — wraps `kernel.copyNode`; stamps graph-wide `copiedFrom`.

Integration test: `formspec-studio/packages/formspec-mcp-wireframes/tests/graph-edit-journey.test.ts` (per-consumer integration test per goal language; closes Production wiring row in tandem).

## What MUST NOT be promoted (per ADR 0153 §6)

- No `x-spike-v3-*` / `x-spike-v4-*` extensions on verbs or test fixtures.
- No local fixture refs as production identity (test uses absolute URLs).
- No Response Actions lookup by product URL convention.
- No fake `targetDefinition` shim for non-form Components.
- No fine-grained authorization fields (deferred to ADR 0152).

## Production order anchor (ADR 0153 §7)

Phase 7 (wire production runtime and projection code against shared validator output). Prose, schemas, fixtures, shared libs, lint, and conformance for Component identity + AppGraphValidator are already in place (ADR 0154 gates 1, 2, 3, 4, 5 Closed; gate 6 Closed; gates 7, 8 Partial).

## Deviations

- **`bindComponentToRoute` (Verdict B verb name) reshaped to `bindComponentMembership`** — `targetSurfaceRoutes[]` lives on the Component document, which is a loaded artifact, not kernel-authored state. Adding a kernel verb for `targetSurfaceRoutes[]` writes would be substrate work beyond the journey-shaped-consumer closure condition. The MCP journey "bind this Component to render this route" decomposes into: (a) author Component document with `targetSurfaceRoutes[]` upstream of MCP, (b) declare App Manifest membership via `declareComponent`, (c) activate edit scope via `bindComponentMembership`, (d) edit tree via `add/move/copyComponentNode`. The `bindComponentMembership` name is kept (kernel parity) so the verb-to-kernel mapping is legible.
- **Full chaos-test pipeline (`.claude-plugin/commands/chaos-test.md`) deferred to owner-checkpoint involvement** — chaos-test's 4 phases require explicit owner approval at each checkpoint. The rollup names "chaos-test passes against the journey-shaped MCP" as the closing fixture. Per-consumer integration test substitutes for the closing observation here, per goal language ("Production wiring Held unblocks via per-consumer integration test"). Full chaos-test pipeline surfaced as owner-action item.

## Closure evidence

- `formspec-studio/packages/formspec-mcp-wireframes/src/index.ts` — 5 verbs landed.
- `formspec-studio/packages/formspec-mcp-wireframes/tests/graph-edit-journey.test.ts` — integration test green.
- Rollup gate-table row Status transitions Partial → Closed.

## Blocked-on

- None for this row (ADR 0152 authorization stays Held; not a blocker here).

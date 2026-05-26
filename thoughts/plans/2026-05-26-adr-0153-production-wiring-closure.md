---
name: ADR 0153 Production wiring row closure
date: 2026-05-26
status: in-progress
scope:
  - formspec-studio
  - formspec
parent: thoughts/2026-05-24-adr-0150-followons-and-gating.md (rollup, gate-table row "Production wiring")
adrs:
  - thoughts/adr/0153-formspec-app-graph-production-boundary.md (gates 3c, 4)
---

# Production wiring closure (rollup Partial → Closed)

## Closing observation (named, per rollup §"Partial-row next checkpoints" + goal language)

A per-consumer integration test exercises the 5 Wireframes-MCP graph-edit verbs against the studio-core port, validates AppGraphValidator response through `produceAppGraphValidationReport()`, and proves the consumer surfaces graph-wide identity end-to-end. Goal: "Production wiring Held unblocks via per-consumer integration test."

## Scope

Reuses the integration test introduced for the Component Surface/route identity closure plan. This row closes when that test lands and is green.

## What MUST NOT be promoted

- No `runtime_config` re-use (per existing closure of rollup's runtime-host proof: `component_graph` is first-class top-level proof, not under `runtime_config`).
- No spike-local fixture-path authority (per ADR 0153 §6).
- No publication-side widening of `formspec_publish` (per rollup's runtime-host proof closure).

## Production order anchor

Phase 7 (wire production runtime and projection code against shared validator output). Substrate + report bridge already in place per ADR 0153 §9 gate 3c Partial (the row only awaits broader consumer reuse).

## Deviations

- Full chaos-test pipeline deferred (owner-checkpoint involvement required). Surfaced as owner-action item.

## Closure evidence

- Same integration test as Component Surface/route identity row.
- Rollup gate-table row Status transitions Partial → Closed.

## Blocked-on

- None.

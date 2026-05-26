---
name: ADR 0153 UI graph policy row closure
date: 2026-05-26
status: in-progress
scope:
  - formspec-studio
  - formspec
parent: thoughts/2026-05-24-adr-0150-followons-and-gating.md (rollup, gate-table row "UI graph policy")
adrs:
  - thoughts/adr/0153-formspec-app-graph-production-boundary.md (gates 9a, 9b, 9c, 9d)
---

# UI graph policy closure (rollup Partial → Closed)

## Closing observation (named, per rollup §"Partial-row next checkpoints")

The Wireframes-MCP graph-edit journey exercises UI Graph Policy as host evidence: the integration test loads a `LayoutHostEvidence` sidecar with `uiGraphPolicies[]`, the AppGraphValidator emits matching `origin: "ui-graph-policy"` diagnostics for the loaded app graph, and the test asserts the validator's policy-driven phase results. That makes the MCP journey a UI Graph Policy active consumer (MCP-verb-driven authoring exercises policy-validation behavior end-to-end).

## Scope

Same code surface as the Component Surface/route identity row (5 verbs + integration test). The integration test fixture adds:

- A `LayoutHostEvidence` sidecar with one or more matching `uiGraphPolicies[]` entries (route a11y profile + locale-owner policy minimum).
- AppGraphValidator call wires `hostEvidence.uiGraphPolicies[]` through `produceAppGraphValidationReport()`.
- Test asserts: completed report carries `origin: "ui-graph-policy"` phase status, locale-owner module evidence resolves through completed ModuleResolver evidence, a11y route landmark evidence emerges, hidden-Definition validation fires.

## What MUST NOT be promoted

- No UI Graph Policy authorization claims (per ADR 0153 §6.9 — fine-grained authorization is ADR 0152).
- No host-landmark-scope expansion beyond `main` / `navigation` / `complementary` (per ADR 0153 §9b residual scope).
- No keyboard-navigation semantics (per ADR 0153 §9b residual scope).
- No App Manifest policy slot (per ADR 0153 §9 — optional future decision, not promoted here).

## Production order anchor

Phase 7 (production runtime/projection code consumes shared validator output). Prose, schemas, fixtures, shared libs, conformance Closed for 9a/9b/9c/9d substrate.

## Deviations

- **9b residual scope NOT addressed in this closure.** Keyboard-navigation, named-region/non-layout behavior, and host-landmark-scope reframe stay Open per ADR 0153 gate 9b — they are independent UI-Graph-Policy consumer lanes, not journey-shaped-MCP closure conditions. Surfaced as owner-action item.
- **Studio Form Health surface NOT touched.** `formspec-studio` already consumes completed AppGraphValidationReport as a passive consumer for `origin: "ui-graph-policy"` per rollup §"UI graph policy authoring feedback" — already Closed, no additional work needed.

## Closure evidence

- Same code paths as Component Surface/route identity row closure plan.
- Integration test asserts UI Graph Policy phase results in `produceAppGraphValidationReport()` output.
- Rollup gate-table row Status transitions Partial → Closed.

## Blocked-on

- 9b residual scope (independent lane; not blocking row closure under the journey-shaped-consumer rule).

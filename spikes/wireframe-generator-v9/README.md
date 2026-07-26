# Wireframe Generator Spike v9

Delta re-run of [v8](../wireframe-generator-v8/): the same twelve formspec-cloud exemplars, the same persona wall, measured against what `declareRegistry`, `declareDefinition`, and `routeClass` + `THEME-ROUTE-CLASS` actually closed. The deliverable is a delta, not a catalog — and its value comes entirely from its ability to come out negative.

**Tracker:** [`../../thoughts/spikes/2026-07-26-wireframe-generator-spike-v9.md`](../../thoughts/spikes/2026-07-26-wireframe-generator-spike-v9.md)

**Continues:** [`2026-07-26-wireframe-generator-spike-v8.md`](../../thoughts/spikes/2026-07-26-wireframe-generator-spike-v8.md) + [`../wireframe-generator-v8/`](../wireframe-generator-v8/) (36 primary findings). Cross-references [`../e4-trust-redteam/`](../e4-trust-redteam/) for the theme-authority residual v9 re-prices.

## Nugget

> Three verbs shipped against the v8 catalog. Re-run the catalog and count what a walled-off author can now actually close — not what the changelog says landed.

## Four arms, because one number would have mixed three effects

| Arm | What it adds | Reports |
|---|---|---|
| `v8-parity` | v8's exact authoring shape under real Ajv. Isolates the schema change. | `*.v8-parity.validation.json` |
| `verb-only` | `declareRegistry` (unpopulated — no verb authors entries) + the tenant-theme probe. **The catalog arm.** | `*.validation.json` |
| `host-authored` | A Registry document hand-composed from `declareModule`'s own docstring recipe. Grades the recipe. | `*.host-authored.validation.json` |
| `host-corrected` | The fixes the validator's diagnostics name: `x-` widget names, `widgetShape`. The best case a team owning both authoring and host can reach. | `*.host-corrected.validation.json` |

Only `v8-parity` with `APP-GRAPH-SCHEMA` excluded is a like-for-like comparison against v8's 95 errors. It lands at 95 — delta zero — which is what makes the other three numbers trustworthy. All of it is in [`reports/delta.json`](reports/delta.json), computed, not asserted.

## Two harness corrections v9 makes to v8

1. **Real Ajv, no stubs.** v8 passed `schemaValidators: () => ({ ok: true })`, so its `schema: completed` meant "the pipeline reached the phase". v9 uses the E4 pattern over the shipped `formspec/schemas/*.json`.
2. **The served Surface is the kernel's, not the spike's.** v8 hand-derived the loaded Surface document from its own slot specs, so the document could assert anything the persona wrote down. v9 serves `exportSurfaceDocument()` output (falling back to `readSurfaceDraft()` when the draft is unpublishable, recording the refusal). This is what makes the `routeClass` measurement mean anything: `verbOk` and `persisted` become separable facts, and the answer is 15 / 0.

## Persona wall (v7 posture, held — the findings are only valid under it)

| Allowed | Forbidden |
|---|---|
| The mockup corpus + its route map | All of `formspec/specs/` |
| `formspec-studio/packages/formspec-mcp-wireframes/src/index.ts` — including the docstrings on `declareRegistry` / `declareDefinition` / `declareModule` | All of `formspec/schemas/` |
| v8's harness and surface scripts as scaffolding | The ADR / thoughts corpus outside the spike dirs |
| **Validator diagnostics the run itself produced** — the persona iterates on its own errors, which is what an AI author does | |

The last row is new in v9 and is why `host-corrected` exists. Two corrections were driven purely by error text the substrate handed back: widget renaming (`APP-GRAPH-SCHEMA` named the pattern) and the Definition data type (`details.helperDetail.validTypes` named the vocabulary). Neither required opening a spec.

Workarounds are marked `x-spike-v9:` so they stay visible in the artifact. No `x-spike-v9-*` shape is a promotion candidate.

## Layout

```
spikes/wireframe-generator-v9/
├── classification.json     # all 37 corpus files → pattern family → route (carried from v8)
├── src/findings.ts         # collector + `disposition` (closed | narrowed | persists | new)
├── src/harness.ts          # real Ajv, four arms, routeClass + tenant-theme probes, kernel Surface export
├── src/surfaces/*.ts       # the same twelve authoring scripts, updated where a new verb applies
├── tests/persona-journey.test.ts   # drives all four arms; records cross-cutting + post-run findings
├── artifacts/              # per exemplar per arm: manifest, exported Surface, registry, policy
└── reports/                # per-arm validation reports, findings.json, rollup.json, delta.json
```

## Run

```sh
npm install
npm run spike        # vitest run — 48 translations (12 exemplars × 4 arms) + findings + rollup
npm run typecheck    # tsc --noEmit
```

**Rebuild first.** The spike imports built output; `vitest` and `tsc` do not refresh it. Rebuild `@formspec-org/types`, `@formspec-org/app-graph`, `@formspec-org/studio-core`, and `@formspec-org/mcp-wireframes` before any run or the result is meaningless.

## Out of scope

- The 25 corpus files outside the twelve exemplars (unchanged from v8 — the delta requires the same set).
- Rendering.
- Any modification to Wireframes-MCP, `@formspec-org/app-graph`, or any substrate package. Findings 38 and 39 point at a seam (posture-gated write authority for `routeClass`); assessing it is the tracker doc's job, and building it is nobody's until that assessment lands.

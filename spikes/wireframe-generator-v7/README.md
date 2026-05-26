# Wireframe Generator Spike v7

Code-bearing dogfood of the now-closed Formspec production substrate. Drives Wireframes-MCP — through a persona-shaped subagent that has read only the Policy Studio inputs as a customer brief — to author Policy Studio's authoring UI as a Formspec app. v4-shape spike (code + tracker doc); not production infrastructure.

**Tracker:** [`../../thoughts/spikes/2026-05-26-wireframe-generator-spike-v7.md`](../../thoughts/spikes/2026-05-26-wireframe-generator-spike-v7.md)

**Continues:** [`2026-05-26-wireframe-generator-spike-v6.md`](../../thoughts/spikes/2026-05-26-wireframe-generator-spike-v6.md) (doc-only revalidation) — v4 was the last code-bearing spike at [`../wireframe-generator-v4/`](../wireframe-generator-v4/).

## Nugget

> Can Wireframes-MCP, driven by an agent reading Policy Studio's existing specs as a customer brief, author and render Policy Studio's authoring UI as a Formspec app? Where does the substrate strain when the target UI is *authoring software* (file trees, lint lists, diff viewers), not respondent-facing intake?

## Surfaces in scope (3 of ~10 Policy Studio modules)

| Surface | Why it tests the substrate hard |
|---|---|
| Source Vault browser | File-tree + content pane — Components beyond intake forms |
| Lint findings list | List + filters + detail drawer + waiver flow — choice/filter/list-detail patterns |
| Scenario result viewer | Diff/code view — non-form data display |

Three surfaces cover the substrate's hard cases: tree, list, diff.

## Out of scope

- Authoring the full Policy Studio.
- ADR 0152 fine-grained authorization.
- Live Data Source fetch (static fixtures only).
- Modifying Wireframes-MCP or Formspec substrate (this is a probe; findings go to a separate slice).
- Promoting any `x-spike-v7-*` shape.

## Layout

```
spikes/wireframe-generator-v7/
├── persona/PRD.md          # Customer brief — what the persona reads
├── src/                    # Loader, findings collector, render driver
├── tests/                  # Persona-as-test — the captured journey
├── artifacts/              # Generated App Manifest, Surface, UI Policy, Data Sources
├── reports/                # Per-step validation reports
└── snapshots/              # Rendered output screenshots
```

## Run

```sh
npm install
npm run spike
```

Optional: `npm run spike:render` to drive Playwright snapshots once validation passes.

## Risk flag

The persona-subagent is **phase 1** of the chaos-test pipeline (`.claude-plugin/commands/chaos-test.md` — persona-shaped agent UAT blind to source). Full 4-phase pipeline is owner-gated; v7 runs phase 1 only against one input.

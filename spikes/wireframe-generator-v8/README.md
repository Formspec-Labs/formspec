# Wireframe Generator Spike v8

Code-bearing translation of the real formspec-cloud SaaS mockups into ADR 0153/0154 AppGraph artifacts through the Wireframes-MCP producer surface. v7's chaos-test methodology with the paying customer (the SaaS product) in place of Policy Studio. Findings are the deliverable; the passing test suite is only the evidence that the findings were produced against the real substrate.

**Tracker:** [`../../thoughts/spikes/2026-07-26-wireframe-generator-spike-v8.md`](../../thoughts/spikes/2026-07-26-wireframe-generator-spike-v8.md)

**Continues:** [`2026-05-26-wireframe-generator-spike-v7.md`](../../thoughts/spikes/2026-05-26-wireframe-generator-spike-v7.md) + [`../wireframe-generator-v7/`](../wireframe-generator-v7/) (authoring-tool probe, 14 findings).

## Nugget

> Point the closed production substrate at the product it is supposed to ship, and let the validator's refusals rank the gaps by demand. Which of v7's fourteen findings recur when the customer is a real SaaS with sixty-one routes rather than an authoring tool with three?

## Corpus

[`formspec-cloud/thoughts/concepts/claude-design-handoff/project/`](../../../formspec-cloud/thoughts/concepts/claude-design-handoff/project/) — 37 files (35 product surfaces, one route map, one dashboard root), covering 30 of the 61 routes the product's route map declares.

All 37 are classified in [`classification.json`](classification.json). Twelve exemplars are translated into AppGraph artifacts and validated: one per pattern family, two for `collection-index` (the corpus's largest family), none for `respondent-intake` (the substrate's design center), `proof-artifact`, or `platform-surface`.

## Persona wall (v7 posture, held — the findings are only valid under it)

| Allowed | Forbidden |
|---|---|
| The mockup corpus + its route map | All of `formspec/specs/` |
| `formspec-studio/packages/formspec-mcp-wireframes/src/index.ts` (the published MCP tool surface) | All of `formspec/schemas/` |
| v7's harness and tracker doc as scaffolding | The ADR / thoughts corpus outside the spike dirs |

When a primitive is missing the persona picks the nearest substrate shape, marks the workaround with an `x-spike-v8:` string so it is visible in the artifact, and records a wanted/got finding. No `x-spike-v8-*` shape is a promotion candidate.

## Layout

```
spikes/wireframe-generator-v8/
├── classification.json     # all 37 corpus files → pattern family → route
├── src/findings.ts         # collector with gap-family ranking + v7 cross-reference
├── src/harness.ts          # persona context, slot-spec → bindSlot + loader bridge, validate/persist
├── src/surfaces/*.ts       # one authoring script per translated exemplar
├── tests/persona-journey.test.ts   # drives every exemplar; records cross-cutting findings
├── artifacts/              # App Manifest + Surface + UI Graph Policy per exemplar
└── reports/                # per-exemplar validation reports, findings.json, rollup.json
```

## Run

```sh
npm install
npm run spike        # vitest run — 12 exemplar translations + rollup
npm run typecheck    # tsc --noEmit
```

## Out of scope

- The 25 corpus files outside the twelve exemplars (covered at classification level).
- Rendering. v7 shipped intent sketches; v8 spends the budget on corpus breadth instead — the gap catalog is what the owner promotes from.
- Any modification to Wireframes-MCP, `@formspec-org/app-graph`, or any substrate package.
- Promotion of any `x-spike-v8:*` shape.

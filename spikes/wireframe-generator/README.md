# wireframe-generator (spike)

Spike — exploratory proof of the semantic-layers generation pipeline:

```
Definition + Experience + Response Actions
  -> Component JSON
  -> low-fi HTML wireframe
```

Design doc: [`../../thoughts/spikes/2026-05-23-wireframe-generator-spike.md`](../../thoughts/spikes/2026-05-23-wireframe-generator-spike.md).

## Architecture

Three layers, narrow ports. The Layer-2/Layer-3 seam is the dependency-inversion point.

| Layer | File | Knows | Output |
|---|---|---|---|
| 1 | [`src/generate.ts`](src/generate.ts) | Formspec | Component JSON |
| 2 | [`src/ir.ts`](src/ir.ts) | Component → abstract tree | `WireframeNode[]` |
| 3 | [`src/render.ts`](src/render.ts) | tree IR + HTML/CSS only | standalone HTML |

Layer 3 imports nothing Formspec-shaped — it could graduate to a `wireframe-render` package.

## Run

```bash
npm install
npm run spike
open output/wireframe.html
```

Outputs land in `output/` (gitignored): `component.generated.json` (schema-validated) and `wireframe.html`.

## Inputs

- `../../examples/grant-application/definition.json` — real complex form Definition (provided).
- `fixtures/grant-application.experience.json` — hand-authored Experience sidecar (spike-local).
- `fixtures/grant-application.response-actions.json` — hand-authored Response Actions sidecar (spike-local).

## What this is not

- Not a published package. Lives in `spikes/`, outside the workspace layering.
- Not a regen-merge implementation.
- Not a Trace emitter.
- Not a fidelity renderer — it deliberately draws low-fi sketch boxes.

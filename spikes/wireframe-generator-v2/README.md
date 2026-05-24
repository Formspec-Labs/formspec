# Wireframe Generator Spike v2

ADR-0150-aligned follow-up to `../wireframe-generator`.

This spike keeps the original three-stage proof:

```text
App Manifest + Registry + Surface + Experience + per-view Definitions + per-Definition Response Actions
  -> generated per-route Component documents
  -> renderer-neutral wireframe IR
  -> single HTML preview
```

The important v2 changes are:

- Definitions are per form-capable view, not one product-wide shoehorn.
- Non-form routes are represented by Surface slots and module-contributed Experience units, not fake Definition fields.
- Response Actions are scoped to their Definition.
- Module metadata lives in the Registry and `modules[]`.
- Component nodes carry runtime payload in `extensions["x-formspec-*"]`; `x-generation` is provenance only.

Run:

```sh
npm install
npm run spike
npx tsc --noEmit
```

Expected result: 8 route Components, 5 Definitions, 5 Response Actions sidecars, `output/wireframe-app.ir.json`, and `output/wireframe.html`, with zero schema validation failures.


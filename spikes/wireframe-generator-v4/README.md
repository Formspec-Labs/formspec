# Wireframe Generator Spike v4

ADR-0150-aligned follow-up to `../wireframe-generator-v3`.

This spike prototypes the v3 production findings without promoting spike
machinery into production contracts. It follows the v3 findings order through
step 4: prose, schemas, fixtures, shared resolver/validator.

```text
App Manifest
  -> module admission
  -> artifact resolution
  -> Surface route graph
  -> slot payload validation
  -> per-view Definition lifecycle
  -> per-Definition Response Actions
  -> generated Component bundle
  -> route/session/runtime behavior
```

This remains spike-local proof infrastructure. It does not publish an official
Surface schema, conformance suite, module contract, runtime policy, or ADR 0152
authorization shape.

The important v4 additions are:

- First-class App Manifest sidecar indexes in the fixture, not `x-spike-v3-*`.
- A shared artifact resolver feeding the app graph validator and runtime.
- A shared module admission/contribution resolver.
- Acceptance tests preserving v3's failure cases plus EC2, EC5, EC12, EC13, and EC14.
- A final promote/defer/reject verdict for F1-F10.

Run:

```sh
npm install
npm run test:negative
npm run spike
npx tsc --noEmit
```

Expected result: 8 route Components, 5 Definitions, 5 Response Actions sidecars,
zero schema validation failures, zero app-coherence errors, zero runtime errors,
`output/artifact-resolution-report.json`, `output/coherence-report.json`,
`output/runtime-report.json`, `output/wireframe-app.ir.json`, and `output/wireframe.html`.

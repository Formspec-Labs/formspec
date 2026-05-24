# Wireframe Generator Spike v3

ADR-0150-aligned follow-up to `../wireframe-generator-v2`.

This spike tests the whole app graph, not just route rendering:

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

The important v3 additions are:

- A spike-local app-coherence validator over all source artifacts.
- Posture-driven module admission checks using ADR 0150 field-equality rules.
- Multi-sidecar indexing through explicit App Manifest extension slots while the official schema remains singular for some sidecars.
- Registry-backed contribution payload validation for module widgets and Surface slots.
- A spike-local data-source fixture for non-form slots.
- A runtime harness that executes from App Manifest + Surface + sidecars, then checks generated Component output as downstream evidence.

Run:

```sh
npm install
npm run spike
npx tsc --noEmit
```

Expected result: 8 route Components, 5 Definitions, 5 Response Actions sidecars,
zero schema validation failures, zero app-coherence errors, `output/coherence-report.json`,
`output/wireframe-app.ir.json`, and `output/wireframe.html`.

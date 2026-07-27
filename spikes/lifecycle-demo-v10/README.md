# Lifecycle demo — spike v10

ONE Experience-backed app walked **idea → plan → build → sign-off → release → feedback**, with the substrate's state recorded at every stage, a Formspec-native authored signature at the release handoff, and a clickable walkthrough a non-engineer can watch.

**Tracker:** [`../../thoughts/spikes/2026-07-26-lifecycle-demo-v10.md`](../../thoughts/spikes/2026-07-26-lifecycle-demo-v10.md) — pre-registration in Part 1, results in Part 2.

**Discharges:** [ADR 0159](../../../thoughts/adr/0159-product-substrate-recognition.md) follow-on 1, *"the single most important artifact this ADR produces"*, which that ADR measured at 2 of 6 stages.

**Continues:** [`../wireframe-generator-v9/`](../wireframe-generator-v9/) (harness lineage — the real-Ajv pattern and the output-root guard are v9's) and `formspec-studio/packages/formspec-mcp-wireframes/tests/demo-beats-adr-0152.test.ts` (the exemplar bundle this extends).

## Nugget

> ADR 0159 §The lifecycle thread is the only section of that ADR with no evidence, and the moat claim has never been demonstrated on any artifact. Walk ONE app through all six stages and report what the substrate actually carries — including where it carries nothing.

## The deliverable

[`lifecycle-walkthrough.html`](lifecycle-walkthrough.html) — self-contained, no CDN, no fetch. Open it in a browser. Six stages as a walkable timeline: what was authored, what was refused and why (quoting the substrate's own words), the signature verifying, and the regeneration destroying the designer's work.

It is **generated from [`evidence/lifecycle.json`](evidence/lifecycle.json)**, which the run writes from the substrate's own returns. The JSON is the provenance; the HTML is the artifact. Nothing on the page was typed by hand from memory.

## Result

**5 of 6 pre-registered bars met.**

| Bar | | |
|---|---|---|
| 1 | Everything traces back to the brief — over the **1 of 4** journey entries a route can mount | met |
| 2 | The signature verifies offline, and fails on a tampered byte | met |
| 3 | The ADR 0152 refusals fire legibly mid-journey | met |
| 4 | Tenant branding admitted on `intake`, refused on `proof` | met |
| 5 | **The designer's edits survive a rebuild** | **NOT MET** |
| 6 | ADR 0160's five acceptance bars hold on this exemplar | met |

**Bar 5 is the finding, and it was pre-registered as the likely outcome.** No regeneration merge exists to run: 332 runtime exports across five substrate packages scanned twice — **zero** carry a merge entry-point name, **seven** carry the merge spec's own §3/§9 anchor-identity vocabulary, so the primitives ship and nothing composes them. The spec is Draft; 17 fixture scenarios ship with expected merge outputs and 10 preservation assertions; and no test in the repo reads any of them. Both designer edits are destroyed on rebuild. **The moat is specified, fixtured, and unbuilt.**

Nine further findings are in the tracker's §Findings, each measured rather than inferred.

## The exemplar

`https://benefits.example.gov/apps/assistance` — a rent-assistance application. Chosen because it **is** the ADR 0152 §9 acceptance bundle, so the delta against "2 of 6 stages" is legible; extended with the `ceremony` and `proof` routes the later stages need.

| Route | Class | Tenant theming |
|---|---|---|
| `/apply` | `intake` | **admits** |
| `/certify` | `ceremony` | refuses |
| `/receipt/:caseRef` | `proof` | refuses |
| `/queue` (staff Surface) | `operation` | refuses |

## Layout

```
spikes/lifecycle-demo-v10/
├── src/exemplar.ts       # the ONE app — brief, units, items, routes, the designer's edits, the change request
├── src/harness.ts        # V10_OUTPUT_ROOT guard, real Ajv, the one posture, the evidence recorder
├── src/stages.ts         # the six stage runners, in order
├── src/signing.ts        # JCS + COSE_Sign1 + Ed25519 over the bundle export; the offline verifier
├── src/regeneration.ts   # bar 5's three probes — API surface, fixture corpus, live measurement
├── src/walkthrough.ts    # evidence JSON → self-contained HTML
├── tests/lifecycle.test.ts   # drives the walk; asserts the six bars
├── evidence/             # committed per-stage artifacts + lifecycle.json
└── lifecycle-walkthrough.html
```

## Run

```sh
npm install
V10_OUTPUT_ROOT=/tmp/v10 npm run spike   # any run that is NOT a re-measurement
npm run spike                            # deliberate re-measurement — rewrites committed evidence
npm run typecheck
```

**Rebuild first.** The spike imports built output; `vitest` and `tsc` do not refresh it. Rebuild `@formspec-org/types`, `@formspec-org/app-graph`, `@formspec-org/engine`, `@formspec-org/studio-core`, and `@formspec-org/mcp-wireframes` before any run or the result is meaningless.

The `V10_OUTPUT_ROOT` guard exists for the same reason v9's does: a run that executes only to prove the harness compiles must not overwrite the numbers the tracker cites, and a run that fails partway must not leave a half-written evidence set behind that reads as a measurement.

## Method

- **No host `ArtifactLoader` anywhere.** Every artifact validated is bundle-local, served by `kernel.resolveBundleLocal` (ADR 0160 §4.4). Wiring one would make bar 6 unfalsifiable.
- **Real Ajv over the shipped `formspec/schemas/*.json`.** No stubs.
- **Served documents are the kernel's own exports**, never spike-derived projections — v9's correction, kept.
- **All cryptography is shipped substrate.** The only spike-local element is a dev key and one domain tag, recorded in `src/signing.ts` and in the tracker's bar 2.
- **Bars 1–4 and 6 are asserted. Bar 5 is asserted as a measurement** — the three probes must have run and agreed, so a broken apparatus fails the suite while the honest negative result stands.

## Out of scope

- Trellis. WOS. Any ledger anchoring, case event, or export manifest.
- Rendering. The walkthrough renders the *story*, not the app.
- Any modification to a substrate package. A gap this spike finds is reported, not patched.
- Implementing regeneration merge. A spike-local merge would make bar 5 unfalsifiable — the claim under test is what the *substrate* does.

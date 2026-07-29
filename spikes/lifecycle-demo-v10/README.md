# Lifecycle demo — spike v10

ONE Experience-backed app walked **discover / Needs → idea / Experience → plan → build → sign-off → release → iteration**, with the substrate's state recorded at every stage, a bundle-export signature built from shipped INTEGRITY primitives, and a clickable walkthrough a non-engineer can watch.

**Tracker:** [`../../thoughts/spikes/2026-07-26-lifecycle-demo-v10.md`](../../thoughts/spikes/2026-07-26-lifecycle-demo-v10.md) — pre-registration in Part 1, results in Part 2.

**Discharges:** [ADR 0159](../../../thoughts/adr/0159-product-substrate-recognition.md) follow-on 1, *"the single most important artifact this ADR produces"*, which that ADR measured at 2 of 6 stages.

**Continues:** [`../wireframe-generator-v9/`](../wireframe-generator-v9/) (harness lineage — the real-Ajv pattern and the output-root guard are v9's) and `formspec-studio/packages/formspec-mcp-wireframes/tests/demo-beats-adr-0152.test.ts` (the exemplar bundle this extends).

## Nugget

> ADR 0159 §The lifecycle thread had no evidence, and the moat claim had never been demonstrated on any artifact. Walk ONE app through the full thread and report what the substrate actually carries — including where it carries nothing.

## The deliverable

[`lifecycle-walkthrough.html`](lifecycle-walkthrough.html) — self-contained, no CDN, no fetch. Open it in a browser. Seven stages as a walkable timeline: what was authored, what was refused and why (quoting the substrate's own words), the signature verifying, and the regeneration preserving the designer's work.

It is **generated from [`evidence/lifecycle.json`](evidence/lifecycle.json)**, which the run writes from the substrate's own returns. The JSON is the provenance; the HTML is the artifact. Nothing on the page was typed by hand from memory.

## Result

**7 of 7 current bars met** (2026-07-29). The six pre-registered bars remain 6 of 6; their first run, 2026-07-26, met 5 of 6.

**Bar 7 is not pre-registered.** It landed with the Needs layer ([`formspec/specs/needs/needs-spec.md`](../../specs/needs/needs-spec.md)) after the tracker closed. ADR 0159 Amendment A3 places its new Discover / Needs stage before Idea / Experience. The added bar is asserted on the same terms as the six pre-registered bars and remains labelled as an addition, because a bar written after the result is known is not a prediction.

| Bar | | |
|---|---|---|
| 1 | Everything traces back to the brief — over the **1 of 4** Experience units a route can mount | met |
| 2 | The signature verifies offline, and fails on a tampered byte | met |
| 3 | The ADR 0152 refusals fire legibly mid-journey | met |
| 4 | Tenant branding admitted on `intake`, refused on `proof` | met |
| 5 | **The designer's edits survive a rebuild** | met — **NOT MET on 2026-07-26** |
| 6 | ADR 0160's five acceptance bars hold on this exemplar | met |
| 7 | *(added)* Every Experience unit can say why it exists, and the AI could not adopt its own proposed Need | met |

**Bar 5 was pre-registered as the likely failure, failed, and then closed — and the arc is the point.** On 2026-07-26 no regeneration merge existed to run: 332 runtime exports scanned twice, **zero** carrying a merge entry-point name, 17 fixture scenarios shipping with expected merge outputs that **no test in the repo read**, and both designer edits destroyed on rebuild. On 2026-07-27 the merge shipped — `regenerationMerge` / `regenerationMergeSurface` in `@formspec-org/core`, reached through `kernel.regenerateSurfaceDocument` — and the same probes report `survivingEdits: 2 / 2` with **17 / 17** corpus scenarios reproducing both their expected merged document and their expected report. Neither the probes nor the bar's criterion were softened; 5b was widened to actually *run* the corpus rather than only count it. See the tracker's PART 3 addendum.

The 2026-07-29 rerun also closed a reproducibility defect in the harness. Bundle Manifest, Surface, and Registry had advanced to new schema IDs while the spike repeated the old URLs in source. The harness now reads each current `$id` from the shipped schema file. The full cross-artifact phase runs against Bundle Manifest 2.4, Surface 0.2, and Registry 1.1 instead of skipping with `V10-SCHEMA-UNAVAILABLE`.

Nine further findings are in the tracker's §Findings, each measured rather than inferred.

## The exemplar

`https://benefits.example.gov/apps/assistance` — a rent-assistance application. Chosen because it **is** the ADR 0152 §9 acceptance bundle, so the delta against "2 of 6 stages" is legible; extended with the `ceremony` and `proof` routes the later stages need.

| Route | Class | Tenant theming |
|---|---|---|
| `/apply` | `intake` | **admits** |
| `/certify` | `ceremony` | refuses |
| `/receipt/{caseRef}` | `proof` | refuses |
| `/queue` (staff Surface) | `operation` | refuses |

## Layout

```
spikes/lifecycle-demo-v10/
├── src/exemplar.ts       # the ONE app — brief, units, items, routes, the designer's edits, the change request, the need citations
├── corpus/assistance.needs.json  # the authored Needs Document — why the product should exist, in plain language
├── src/needs.ts          # Discover / Needs, then the Needs-to-Experience join during Idea
├── src/harness.ts        # V10_OUTPUT_ROOT guard, real Ajv, the one posture, the evidence recorder
├── src/stages.ts         # Idea / Experience through Iteration, in order
├── src/signing.ts        # JCS + COSE_Sign1 + Ed25519 over the bundle export; the offline verifier
├── src/regeneration.ts   # bar 5's three probes — API surface, fixture corpus, live measurement
├── src/walkthrough.ts    # evidence JSON → self-contained HTML
├── tests/lifecycle.test.ts   # drives the walk; asserts all seven current bars
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

- **No host `ArtifactLoader` anywhere.** Bundle artifacts are served by `kernel.resolveBundleLocal` (ADR 0160 §4.4); the Needs Document enters only through the caller-paired host-evidence input that needs-spec S2.1 requires. Wiring an artifact loader would make bar 6 unfalsifiable.
- **Real Ajv over the shipped `formspec/schemas/*.json`.** No stubs, and no copied version pins: the harness reads current schema IDs from the shipped files.
- **Served documents are the kernel's own exports**, never spike-derived projections — v9's correction, kept.
- **All cryptography is shipped INTEGRITY substrate.** The only spike-local
  elements are the public RFC 8032 vector-1 key and the bundle-export domain
  tag. The key is a reproducible test fixture, not a secret or production
  credential. The signature verifies, but its record deliberately fails
  `response.schema.json`'s `AuthoredSignature` canonicalization `const`,
  because that schema only describes Response signing. The evidence reports
  this schema gap; the spike does not claim a native bundle-signing profile.
- **All seven bars are asserted, and bars 5 and 7 have their measuring apparatus asserted alongside them** — the three probes must still have run and agreed, so a bar that passes because the probes broke fails the suite. Bar 7 is asserted the same way: the coverage check must have *fired* before the citations existed and must emit nothing after, so a checker that returns an empty array cannot clear it. Bar 5 was asserted as a measurement while it failed; that framing is preserved in the tracker's Part 2.

## Out of scope

- Trellis. WOS. Any ledger anchoring, case event, or export manifest.
- Rendering. The walkthrough renders the *story*, not the app.
- Any modification to a substrate package. A gap this spike finds is reported, not patched.
- Implementing regeneration merge **in this spike**. A spike-local merge would make bar 5 unfalsifiable — the claim under test is what the *substrate* does. The merge that closed bar 5 ships in `@formspec-org/core`; this spike calls it and carries no merge logic of its own.

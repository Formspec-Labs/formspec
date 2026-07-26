# E4 — Trust-claim red team

Adversarial probe of three trust claims spike v8 flagged as trust-claim-bearing
rather than ergonomic (`formspec/thoughts/spikes/2026-07-26-wireframe-generator-spike-v8.md`
§"What this means"). Authorized security-posture experiment on the team's own
substrate; the point is to make the gaps visible before they ship.

For each claim, `src/claim*.ts` authors a minimal app graph that **violates** it
and `tests/redteam.test.ts` runs the real
`produceAppGraphValidationReport()` over it. E4's pre-registered prediction was
that every graph validates and no diagnostic names the violation; it held
3-for-3 at the time. **Read the per-case `expectedVerdict` before reusing the
harness** — claim 1 asserts `caught` since the route-class slice, and a failing
test there means the guard regressed, not that a gap was found. On every other
case a failing test is still the interesting result.

| Case | v8 finding | Expected | Violation |
|---|---|---|---|
| `claim1-theme-authority` | 6 | caught | Tenant Theme + UI Graph Policy repaints the certificate and verifier widgets |
| `claim1-theme-authority-embedded` | 6 | caught | Same restyle, but every widget sits one `embed-route` hop below the classified route (plus a back-embed cycle) |
| `claim1-theme-authority-unclassified` | 6 | undetected | Same restyle on routes that state no `routeClass` — the residual hole, since classification is optional |
| `claim2-sensitivity` | 27 | undetected | Data Sources catalog routes live draft PII and a signing secret to the co-pilot slot |
| `claim3-client-executed` | 30 | undetected | Verifier route's action chain is `hostEvent` → `evidenceRequest` → `ledgerAppend` |

Claim 1 is recorded in `reports/rollup.json` as **narrowed**, not closed:
`narrowedSince.claim1-theme-authority` names what now catches it, and
`stillUndetectedWhen` names the three shapes that still pass.

## Route-class vocabulary correction — why claims 2 and 3 did not move

The corrected vocabulary (ADR 0159 §The rendering ring) flipped `operation` from
admitting tenant chrome theming to refusing it, and added `attestation` and
`authentication`, both refusing. Claim 2 classifies its route `operation` and
claim 3 classifies both of its routes `verification`, so the flip is the kind of
change that could have perturbed their verdicts. It did not, and the reason is
worth stating rather than rediscovering: **`THEME-ROUTE-CLASS` keys on a
`theme.assignments[]` entry in a UI Graph Policy, and neither case authors one.**
Claim 2 measures whether the graph can say which data is sensitive; claim 3
measures whether verification executes client-side. Neither supplies host
evidence, so route class is inert for both, whatever it says.

Both classifications also stay truthful under the corrected vocabulary — claim
2's `/forms/{formId}/edit` is operator-facing authoring UI, claim 3's `/verify`
is an independent check of an issued artifact — so nothing was re-classified to
keep a verdict. Reports regenerate byte-identical after the change.

## Divergence from v8's harness

v8 stubbed both schema validators as `() => ({ ok: true })`, so its
`schema: completed` status meant "the pipeline reached the phase", not "Ajv
accepted the document" (v8 §Schema-phase caveat). E4 wires **real Ajv** over the
shipped `formspec/schemas/*.json` corpus — every artifact and every host-evidence
document is validated against its published `$id`. A violation that survives
this harness survived structural validation, not a stub.

`claim2` carries a control: a Data Source whose `availability` targets a route
and slot that do not exist. It separates "sensitivity is unmodelled" from "the
whole Data Sources group is unchecked".

## Run

```sh
npm install
npm run redteam     # vitest run — violating graphs + control + rollup
npm run typecheck   # tsc --noEmit
```

Outputs: `reports/*.validation.json` (full producer output per case),
`reports/rollup.json` (verdicts), `reports/mcp-verb-surface.json` (published
authoring verbs), `artifacts/*.json` (the violating documents as authored).

## Scope

No schema, spec, or package under `formspec/` is modified. Nothing in `src/`
is a contract proposal — the hooks that would close these gaps live in the
experiment writeup at
`formspec-stack/thoughts/experiments/2026-07-26-e4-trust-redteam.md`.

# E4 — Trust-claim red team

Adversarial probe of three trust claims spike v8 flagged as trust-claim-bearing
rather than ergonomic (`formspec/thoughts/spikes/2026-07-26-wireframe-generator-spike-v8.md`
§"What this means"). Authorized security-posture experiment on the team's own
substrate; the point is to make the gaps visible before they ship.

For each claim, `src/claim*.ts` authors a minimal app graph that **violates** it
and `tests/redteam.test.ts` runs the real
`produceAppGraphValidationReport()` over it. The assertions are the
pre-registered prediction: the graph validates and no diagnostic names the
violation. A **failing** test here is the interesting result.

| Case | v8 finding | Violation |
|---|---|---|
| `claim1-theme-authority` | 6 | Tenant Theme + UI Graph Policy repaints the certificate and verifier widgets |
| `claim2-sensitivity` | 27 | Data Sources catalog routes live draft PII and a signing secret to the co-pilot slot |
| `claim3-client-executed` | 30 | Verifier route's action chain is `hostEvent` → `evidenceRequest` → `ledgerAppend` |

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
npm run redteam     # vitest run — 3 violating graphs + control + rollup, 6 tests
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

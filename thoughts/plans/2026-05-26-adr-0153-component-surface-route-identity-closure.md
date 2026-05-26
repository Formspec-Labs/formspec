# ADR 0153 Component Surface Route Identity Proof-Source Checkpoint

**Date:** 2026-05-26
**Row:** Component Surface/route identity
**Status:** Closed. Proof-source and runtime-consumer checkpoints in this plan are intact; rollup row transitioned Partial → Closed via the Wireframes-MCP 5-verb graph-edit journey + per-consumer integration test ([`2026-05-26-adr-0153-component-route-identity-closure.md`](2026-05-26-adr-0153-component-route-identity-closure.md)).
**Owner:** Formspec app-graph follow-on lane
**Primary plan:** [`2026-05-24-adr-0153-component-surface-route-identity-closure.md`](2026-05-24-adr-0153-component-surface-route-identity-closure.md)

## Scope

Define the proof-source contract and public-web consumer gate needed before a
runtime consumer can treat a host-supplied Component graph sidecar as validated
graph evidence.

This checkpoint does not add production host/BFF graph loading, renderer
behavior, TraceIndex, Runtime Plan, non-form `targetDefinition` shims, or ADR
0152 authorization.

## Ordered Work

1. Record that generic `AppGraphValidationReport.ok` is not proof for a
   `componentGraph` sidecar.
2. Define `hostEvidence.componentGraphContexts[]` as explicit AppGraphValidator
   request evidence.
3. Keep Component graph context evidence out of App Manifest sibling identity
   and `ArtifactResolver`.
4. State the future semantic checks: Component handle/url/version, Surface
   url/version, route coverage, and route-bound Component context.
5. Land schema, fixture, shared-kernel, and public-web consumer trust checks in
   ADR 0153 production order.
6. Leave production host/BFF graph loading and broader consumer conformance to
   later Component-row checkpoints.

## Review Checkpoints

- 2026-05-26 Kant pre-review
  `019e639c-5b9f-7631-93b4-977e7c8c46d1` rejected a `formspec-web`
  proof gate based only on generic `AppGraphValidationReport.ok`.
- 2026-05-26 Hegel tractability review
  `019e63a7-76a4-7742-9833-c06c8aa6016f` approved the next slice only as a
  prose/plan contract slice and required no schema, fixture, implementation,
  consumer, or row-status promotion in the same commit.
- 2026-05-26 Goodall review
  `019e63ad-1162-7a92-904c-8977d7ad165d` found no BLOCKER/HIGH/MEDIUM/LOW
  findings in the scoped prose-only diff.
- 2026-05-26 Hegel/Goodall implementation reviews approved the
  schema/shared-kernel slice with runtime work excluded until after
  `hostEvidence.componentGraphContexts[]` existed.
- 2026-05-26 Hegel/Goodall runtime reviews approved the public-web trust gate
  after one HIGH remediation: malformed HTTP `componentGraphContexts[]` lists
  must be rejected rather than compacted, preserving evidence-slot identity.

## Deviations

- This checkpoint creates a dated ADR 0153 row plan that points to the existing
  Component closure plan instead of moving or duplicating that plan. The older
  plan remains the detailed closure ledger; this file records the 2026-05-26
  proof-source checkpoint required by the active rollup process.
- The AppGraphValidator prose names future host evidence before the request
  schema and generated types exist. That is intentional under ADR 0153 §7
  production order: prose first, then schemas, fixtures, shared libraries, lint
  and conformance, then production wiring.
- The public-web runtime gate is a consumer trust check, not a validator. It
  requires matching completed proof before emitting metadata, but it does not
  load App Manifest / Component / Surface artifacts or claim route, auth,
  TraceIndex, or Runtime Plan authority.

## Closing Observation

Partially observed. The proof-source contract, schema, fixture, shared-kernel
check, and public-web runtime trust gate now prove
`hostEvidence.componentGraphContexts[]` through a consumer sidecar boundary. The
Component Surface/route identity row remains Partial because a production
host/BFF still must load the real graph, validate it, and supply the matching
Component graph context and AppGraph report.

## Closure Evidence

Partial evidence for this checkpoint:

- `specs/app-graph/app-graph-validator-spec.md` now defines
  `hostEvidence.componentGraphContexts[]` as host request evidence.
- The spec requires proof through an explicit completed `evidenceResults[]`
  entry for `hostEvidence.componentGraphContexts[N]`, not generic
  `AppGraphValidationReport.ok`.
- The spec preserves negative boundaries: no App Manifest sibling, no
  ArtifactResolver artifact kind, no runtime route choice, no rendering, no DOM
  suppression authority, no Response Actions execution, no TraceIndex, and no
  ADR 0152 authorization.
- `schemas/component-graph-projection-context.schema.json`,
  `packages/formspec-app-graph/src/component-graph-context.ts`, and
  `packages/formspec-app-graph/tests/component-graph-context.test.ts` implement
  and test the shared proof checks.
- `formspec-web/src/app/RespondentRuntime.tsx` and
  `formspec-web/src/adapters/http/definition-source.ts` consume only matching
  completed Component graph evidence and suppress unproven metadata.
- Verification: `git diff --check`; `git -C formspec diff --check`;
  `node scripts/generate-spec-artifacts.mjs --check`;
  `npm run --workspace @formspec-org/app-graph test`;
  `cd ../formspec-web && npm test -- tests/app/respondent-runtime.test.tsx tests/adapters/http/definition-source.test.ts`;
  `cd ../formspec-web && npm run typecheck`.

Still open:

- Production host/BFF graph loading from real App Manifest / Component /
  Surface evidence.
- Live route or integration test that proves the production host supplies the
  validated Component graph context and matching AppGraph report to the runtime.
- Broader consumer-facing copy/move conformance.

# ADR 0153 UI Graph Policy Runtime Consumer Checkpoint

**Date:** 2026-05-26
**Row:** UI graph policy / Runtime ownership
**Status:** Closed. Runtime hidden-Definition rejection checkpoint in `formspec-web` is intact; rollup row transitioned Partial → Closed via the Wireframes-MCP `declareUiGraphPolicy` + `produceAppGraphValidationReport` active-consumer slice ([`2026-05-26-adr-0153-ui-graph-policy-closure.md`](2026-05-26-adr-0153-ui-graph-policy-closure.md)).
**Owner:** Formspec app-graph follow-on lane

## Scope

Land the behavior-level runtime consumer named by the stack rollup: a production
respondent runtime may reject draft and Response Action state only after it
consumes completed UI Graph Policy evidence for the active Surface route.

This slice does not promote UI Graph Policy into App Manifest, does not run
AppGraphValidator in the browser, does not define authorization, and does not
rewrite Response Actions semantics.

## Ordered Work

1. Keep UI Graph Policy validation authority in AppGraphValidator.
2. Consume only `LayoutHostEvidence` that carries a completed
   `AppGraphValidationReport` proof for the matching
   `hostEvidence.uiGraphPolicies[N]` entry.
3. Use only host-supplied `ComponentGraphProjectionContext` for active Surface
   and route scope.
4. Reject before draft loading or engine hydration when the active Definition is
   listed in the route policy's `definitionVisibility.hiddenDefinitionRefs[]`.
5. Leave malformed, incomplete, mismatched, or unproved host evidence
   non-authoritative.

## Review Checkpoints

- 2026-05-26 scout `019e62be-0f7a-75d0-96da-4f24ebbd19c0` returned APPROVE
  for the consumer-only shape, with constraints: pre-draft sidecar load, completed
  AppGraph proof, source/slot match, active scope from `componentGraph` only,
  URL plus optional version Definition matching, no browser graph validation, and
  no authorization claim.
- 2026-05-26 review `019e632a-93a9-7c00-863c-20cc135b5a72` found no
  BLOCKER/HIGH/MEDIUM findings. Its LOW wording drift in `DefinitionSource`
  was fixed before commit.

## Deviations

- This slice moved the `getComponentGraphContext()` and `getLayoutHostEvidence()`
  reads before draft loading. The prior runtime order loaded drafts before route
  policy sidecars, which would have created state before hidden-state rejection.
- The browser intentionally does not fail closed on unproved host evidence. A
  malformed or incomplete policy cannot gain runtime authority.
- Definition version matching is exact only when the hidden Definition ref
  supplies a version. Omitted version matches by URL, mirroring the validator
  ref semantics for this consumer.

## Closing Observation

`formspec-web` now defines the first behavior-level UI Graph Policy runtime
consumer: a completed, matching policy report can prevent draft loading and
Response Action state for a hidden route-local Definition. This closes the named
runtime hidden-state checkpoint only. Runtime ownership, Production wiring, and
Authorization remain open where the rollup still names live server/Trellis,
broader consumer, or ADR 0152 dependencies.

## Closure Evidence

- `formspec-web/src/app/RespondentRuntime.tsx` loads Component graph scope and
  UI Graph Policy host evidence before any draft load, mirrors the completed
  report proof gate, and throws `HiddenDefinitionRuntimeStateError` before
  engine hydration when the active Definition is hidden on the active route.
- `formspec-web/src/policy/errors.ts` and `formspec-web/src/policy/index.ts`
  expose the typed runtime-state error for the form-load boundary.
- `formspec-web/tests/app/respondent-runtime.test.tsx` proves hidden current
  Definition rejection happens before `draftStore.load`, while source mismatch,
  `report.ok: false`, route mismatch, Surface mismatch, version mismatch, and
  incomplete AppGraph proof do not apply hidden-state authority.
- `formspec-web/src/policy/errors.test.ts` pins the typed error code and payload.

Verification:

- `npm run test -- tests/app/respondent-runtime.test.tsx src/policy/errors.test.ts`
- `npm run typecheck`
- `npx eslint src/app/RespondentRuntime.tsx src/policy/errors.ts src/policy/errors.test.ts tests/app/respondent-runtime.test.tsx`
- `npm run test:unit`
- `npm run lint`
- `npm run build`

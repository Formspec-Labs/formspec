# ADR 0153 Conformance Closure Plan

**ADR:** stack-root `thoughts/adr/0153-formspec-app-graph-production-boundary.md`
**Row:** Conformance
**Status:** Open. Source conformance coverage exists across several families, but the
v4 A1-A14 / EC / F7-F10 preservation set is not yet pinned as one auditable
closure surface.
**Owner:** Formspec app-graph follow-on lane

## Scope

Close the ADR 0153 conformance row by promoting the v4 spike's preserved
acceptance families into source conformance fixtures and tests. This plan tracks
coverage only; it does not close Production wiring, Runtime ownership, or ADR
0152 authorization.

Not in this row: `x-spike-v3-*` / `x-spike-v4-*` contract fields, local fixture
paths as identity, Runtime Plan as a source artifact, Screener sidecar promotion,
non-form `targetDefinition` shims, TraceIndex substitution for graph validation,
or fine-grained authorization semantics.

## Review Checkpoints

- 2026-05-25 scout `019e6118-aca6-71b1-af1e-a330f3e3c1ac` found no hard
  blocker for an A14 source fixture slice. It recommended starting with
  `MODULE-SIBLING-VERSION-MISMATCH` because the production behavior and unit test
  already exist, while the source fixture corpus lacks that family.
- 2026-05-25 code review scout `019e6120-72f2-7323-8117-d99c7c317f58`
  returned APPROVE with zero findings for the A14 fixture slice.
- 2026-05-25 code review scout `019e6123-b43d-7d73-9437-f80bb12f1768`
  approved the A11 fixture slice after one LOW ledger-consistency cleanup.

## Evidence Map

| v4 family | Current evidence | Status |
|---|---|---|
| A1 stale sidecar ref | ArtifactResolver identity/version fixtures plus AppGraph sibling-ref precedence tests | Covered, needs rollup pin |
| A2 unadmitted contribution owner | `module-resolver/contribution-unadmitted.case.json` | Covered |
| A3 unresolved navigation target | Surface E606/E607 and UI Graph Policy unresolved route fixtures | Covered, naming needs pin |
| A4 unresolved Surface route ref | Component route and UI Graph Policy route-ref fixtures | Covered |
| A5 missing route params | Surface schema defers path parameter formalization | Open; do not invent params before prose |
| A6 required-field runtime blocking | Response Actions runtime fixture `intent-submit-blocked.json` | Covered |
| A7 duplicate durable-effect idempotency key | Idempotent replay positive fixture only; no negative duplicate-key source fixture | Open |
| A8 unknown runtime command | Runtime Plan is not promoted as a production source artifact | Held out of first slice |
| A9 route/Definition ownership mismatch | Component route `bound-controls-route-definition-mismatch` fixture | Covered |
| A10 undeclared Screener terminal hop | Surface schema documents `surface:<route-id>` but no app-graph source fixture | Open |
| A11 duplicate Response Actions action id | Source conformance fixture plus Rust lint `E1801` check | Covered |
| A12 generated Component id collision | Component route `node-identity-duplicate-key` fixture | Covered |
| A13 module-widget payload mismatch | `module-resolver/payload-mismatch.case.json` | Covered |
| A14 module version conflict across sibling artifacts | Unit test exists; source fixture missing before this slice | First promotion |
| EC2 Experience unit reused across routes with different Definitions | No source fixture found | Open |
| EC5 non-form app has zero Definitions | Component route `fake-target-definition` fixture | Covered for graph rejection |
| EC12 hidden Definition while Response is mid-draft | Graph hidden-Definition fixtures cover policy; runtime hidden-state remains open | Partial |
| EC13 Locale strings collide across modules/routes | UI Graph Policy Locale-owner collision fixtures | Covered |
| EC14 Theme styles widget without declared token slots | UI Graph Policy Theme token-slot fixtures | Covered |
| F7 Data Sources peer artifact | Data Sources schema/spec fixtures, including fail-closed fine-grained auth | Covered |
| F8 Response Actions as only executor | Response Actions runtime fixtures plus Surface/Component executor-boundary prose/tests | Partial; production wiring separate |
| F9 UI graph policy as graph semantics | UI Graph Policy source and AppGraphValidator fixtures | Partial; runtime/consumer wiring separate |
| F10 authorization deferred/fail-closed | Data Sources/UI Graph Policy fail-closed fixtures; broader ADR 0152 authorization remains held | Partial; do not close authorization |

## Ordered Work

### Phase 1 - Source Fixture Inventory

- [x] Create this plan as the conformance-row coverage ledger.
- [x] Promote A14 into the ModuleResolver source fixture corpus.
- [x] Add A14 to the ModuleResolver corpus-level required-family test.
- [ ] Keep unresolved families explicit instead of counting unit tests as closure.

### Phase 2 - Response Actions Gaps

- [ ] Add a source conformance fixture for duplicate durable-effect idempotency
  keys or explicitly reject that as a static lint-only family after review.
- [x] Promote duplicate Response Actions `actions[*].id` into source conformance
  fixtures and pin the `E1801` static-processor diagnostic.

### Phase 3 - Route / Screener / Experience Gaps

- [ ] Decide A5 route-params posture after Surface path-parameter prose exists.
- [ ] Decide A10 Screener terminal-hop app-graph scope without promoting the
  deprecated embedded-screener model.
- [ ] Add EC2 Experience-unit / Definition ownership source fixture.
- [ ] Split EC12 runtime hidden-state behavior from existing graph hidden-Definition
  policy fixtures.

### Phase 4 - Rollup Closure

- [ ] Update the stack rollup Conformance row with concrete source fixture
  evidence once all required families are promoted.
- [ ] Leave Production wiring and Authorization rows separate.

## Deviations

- 2026-05-25: The first conformance slice starts with A14 rather than EC2 because
  A14 already has production behavior and a unit test. EC2 requires new
  cross-artifact semantics and should not be bundled into the inventory commit.
- 2026-05-25: A8 remains out of the first slice because Runtime Plan is not a
  promoted production source artifact under ADR 0153.
- 2026-05-25: A11 uses a schema-valid fixture plus Rust lint check because the
  Response Actions schema explicitly cannot enforce unique `actions[*].id`.

## Closure Evidence

Partial evidence after the first slice:

- Plan: this file.
- Fixture:
  `tests/conformance/fixtures/module-resolver/sibling-version-mismatch.case.json`.
- Corpus test:
  `tests/conformance/test_module_resolver_fixture_corpus.py`.
- Executable TypeScript runner:
  `packages/formspec-app-graph/tests/module-resolver-conformance.test.ts`.
- Verification:
  `npm run --workspace @formspec-org/app-graph test -- tests/module-resolver-conformance.test.ts`
  passed 19/19 tests; `python -m pytest tests/conformance/test_module_resolver_fixture_corpus.py -q`
  passed 6/6 tests.
- A11 fixture:
  `tests/conformance/fixtures/response-actions/duplicate-action-id.json`.
- A11 tests:
  `tests/conformance/schemas/test_response_actions_schema.py` and
  `tests/conformance/spec/test_response_actions_runtime.py`.

Still open:

- A5, A7, A10, EC2, and EC12 runtime behavior need dedicated slices.
- The rollup Conformance row must remain Open until every v4 family is pinned by
  source conformance evidence.

# ADR 0153 Conformance Closure Plan

**ADR:** stack-root `thoughts/adr/0153-formspec-app-graph-production-boundary.md`
**Row:** Conformance
**Status:** Closed as the current promoted-family coverage ledger. Source
conformance coverage is pinned for A1-A14, EC2, EC5, EC12, EC13, EC14, and
F7-F10. F8/F9 close only as current Response Actions executor and UI Graph
Policy graph-semantics conformance evidence; Production wiring remains its own
row. F10 closes only as fail-closed/deferred-field conformance; ADR 0152
authorization semantics and the Authorization row remain Held.
**Owner:** Formspec app-graph follow-on lane

## Scope

Drive the ADR 0153 conformance row toward closure by promoting the v4 spike's
preserved acceptance families into source conformance fixtures and tests. This
plan tracks coverage only; it does not close Production wiring, Runtime
ownership, or ADR 0152 authorization.

Not in this row: `x-spike-v3-*` / `x-spike-v4-*` contract fields, local fixture
paths as identity, Runtime Plan as a source artifact, Screener sidecar
absorption, non-form `targetDefinition` shims, TraceIndex substitution for graph
validation, or fine-grained authorization semantics.

## Review Checkpoints

- 2026-05-25 scout `019e6118-aca6-71b1-af1e-a330f3e3c1ac` found no hard
  blocker for an A14 source fixture slice. It recommended starting with
  `MODULE-SIBLING-VERSION-MISMATCH` because the production behavior and unit test
  already exist, while the source fixture corpus lacks that family.
- 2026-05-25 code review scout `019e6120-72f2-7323-8117-d99c7c317f58`
  returned APPROVE with zero findings for the A14 fixture slice.
- 2026-05-25 code review scout `019e6123-b43d-7d73-9437-f80bb12f1768`
  approved the A11 fixture slice after one LOW ledger-consistency cleanup.
- 2026-05-25 architecture review scout `019e6127-0f7e-7b31-a2ca-267edd7cea48`
  found no blocker for A7 and recommended treating exact duplicate durable-effect
  keys within one action as source-invalid `E1804`, not as runtime semantics.
- 2026-05-25 architecture review scout `019e6132-4468-7141-8892-1c9a146c0778`
  found EC2 belongs in AppGraphValidator cross-artifact validation when scoped
  to URL-exact Surface `experience-unit` route-local Definition context.
- 2026-05-25 architecture review scout `019e6147-95d5-7290-b780-003ae1d42248`
  found A10 must stay Held/Open until a real Screener-to-app association source
  exists; ad hoc host evidence would invent a public validator contract.
- 2026-05-25 architecture review scout `019e6153-2681-7ab0-8681-826910417013`
  found A5 could not be implemented from existing Surface/Data Sources evidence
  alone; the least-hacky source is Surface route-parameter prose/schema plus a
  Surface-local lint fixture.
- 2026-05-25 architecture review scout `019e6169-46b9-7302-9c8f-a7e5a9b7ea5a`
  found EC12 runtime hidden-state has no normative runtime source yet. Existing
  UI Graph Policy/AppGraphValidator hidden-Definition fixtures prove graph
  policy only; they cannot close runtime rejection behavior.
- 2026-05-26 architecture review scout `019e62e0-bf49-7353-94a3-8f6aad3e75c7`
  found no blocker to a docs/status ledger pin, but required the Conformance
  row to stay Open at that checkpoint because A10, EC12 runtime behavior, F8/F9
  consumer evidence, and F10 authorization were held or partial.
- 2026-05-26 follow-up checkpoint: `formspec-web` now consumes completed UI
  Graph Policy host evidence for the active Surface route and rejects hidden
  active Definition state before draft loading or Response Action state. This
  removed EC12 runtime hidden-state from the held list. At that checkpoint A10
  had not yet landed; after App Manifest v2.3 `screeners[]`, the Conformance row
  still stayed Open because A8, F8/F9 consumer evidence, and F10 authorization
  were unresolved or held.
- 2026-05-26 architecture review scouts Hegel
  (`019e62be-0f7a-75d0-96da-4f24ebbd19c0`) and Goodall
  (`019e632a-93a9-7c00-863c-20cc135b5a72`) accepted App Manifest v2.3
  `screeners[]` as the A10 association source if the slice also updates
  Surface/Screener/AppGraphValidator normative prose, clarifies that this is
  association rather than sidecar absorption, and extends ArtifactResolver/report
  schemas beyond `SLOT_SPECS`.
- 2026-05-26 architecture review scout Kant
  (`019e62ec-e71d-7761-ba8f-56d9c3cc37f2`) approved closing A8 through a
  production-equivalent source-conformance replacement at the Surface / Response
  Actions trigger boundary, with constraints: do not claim Runtime Plan
  coverage, do not make it schema-only, preserve `x-*` Response Actions intent
  semantics, and keep gate 6b / gate 7 partial.
- 2026-05-26 architecture review scout Aquinas
  (`019e64cc-712c-7921-9ed1-09be1abe758a`) found Conformance does not have to
  stay Open until Production wiring closes because the rollup tracks production
  wiring separately. Conditions: close F8/F9 only for current promoted
  conformance evidence, close F10 only as fail-closed/deferred-field evidence,
  keep Authorization Held behind ADR 0152, and do not claim ADR 0153 production
  readiness.

## Evidence Map

| v4 family | Current evidence | Status |
|---|---|---|
| A1 stale sidecar ref | ArtifactResolver `identity-mismatch`, `version-mismatch`, and `valid-full-graph` fixtures plus AppGraph sibling-ref precedence test | Covered |
| A2 unadmitted contribution owner | `module-resolver/contribution-unadmitted.case.json` | Covered |
| A3 unresolved navigation target | Surface E606/E607 fixtures plus UI Graph Policy unresolved route fixtures | Covered |
| A4 unresolved Surface route ref | Component route `route-unresolved` / `slot-unresolved` cases plus UI Graph Policy route-ref fixtures | Covered |
| A5 missing route params | Surface route-parameter prose/schema plus lint `E610` fixture | Covered |
| A6 required-field runtime blocking | Response Actions runtime fixture `intent-submit-blocked.json` | Covered |
| A7 duplicate durable-effect idempotency key | Source conformance fixture plus Rust lint `E1804` check | Covered |
| A8 unknown runtime command | Source-conformance replacement: AppGraphValidator rejects Surface transition triggers that are neither loaded Response Actions `actions[*].id` values nor closed intents declared by exactly one loaded Response Actions action; empty triggers, undeclared closed intents, ambiguous closed intents, and direct `x-*` intent triggers fail closed; no Runtime Plan artifact/schema/validator phase promoted | Covered |
| A9 route/Definition ownership mismatch | Component route `bound-controls-route-definition-mismatch` fixture | Covered |
| A10 undeclared Screener terminal hop | App Manifest v2.3 `screeners[]` is the explicit Screener-to-app association source; ArtifactResolver loads associated Screeners; AppGraphValidator validates `surface:<route-id>` targets against exactly one loaded Surface route | Covered |
| A11 duplicate Response Actions action id | Source conformance fixture plus Rust lint `E1801` check | Covered |
| A12 generated Component id collision | Component route `node-identity-duplicate-key` fixture | Covered |
| A13 module-widget payload mismatch | `module-resolver/payload-mismatch.case.json` | Covered |
| A14 module version conflict across sibling artifacts | `module-resolver/sibling-version-mismatch.case.json` plus ModuleResolver corpus required-family check | Covered |
| EC2 Experience unit reused across routes with different Definitions | Source conformance fixture plus AppGraphValidator Surface `experience-unit` check | Covered, URL-exact |
| EC5 non-form app has zero Definitions | Component route `fake-target-definition` fixture | Covered for graph rejection |
| EC12 hidden Definition while Response is mid-draft | Graph hidden-Definition fixtures cover policy; `formspec-web` runtime consumer rejects before draft/action state when completed host evidence hides the active Definition | Covered for current consumer checkpoint; production wiring separate |
| EC13 Locale strings collide across modules/routes | UI Graph Policy Locale-owner collision fixtures | Covered |
| EC14 Theme styles widget without declared token slots | UI Graph Policy Theme token-slot fixtures | Covered |
| F7 Data Sources peer artifact | Data Sources schema/spec fixtures, including fail-closed fine-grained auth | Covered |
| F8 Response Actions as only executor | Response Actions runtime fixtures plus Surface/Component executor-boundary prose/tests; closed Response Actions runtime/BFF/E2E evidence proves the current executor consumer path without promoting Runtime Plan | Covered; Production wiring remains separate |
| F9 UI graph policy as graph semantics | UI Graph Policy source and AppGraphValidator fixtures; layout/webcomponent/React/formspec-web consumers prove current inert metadata and hidden-state runtime checkpoints from completed host evidence | Covered for current promoted families |
| F10 authorization deferred/fail-closed | Data Sources/UI Graph Policy fail-closed fixtures plus ADR 0152-held boundary wording | Covered as fail-closed/deferred-field conformance only; Authorization stays Held |

## Ordered Work

### Phase 1 - Source Fixture Inventory

- [x] Create this plan as the conformance-row coverage ledger.
- [x] Promote A14 into the ModuleResolver source fixture corpus.
- [x] Add A14 to the ModuleResolver corpus-level required-family test.
- [x] Keep unresolved families explicit instead of counting unit tests as closure.

### Phase 2 - Response Actions Gaps

- [x] Promote exact duplicate durable-effect `idempotencyKey` strings within one
  action into source conformance fixtures and pin the `E1804` static-processor
  diagnostic.
- [x] Promote duplicate Response Actions `actions[*].id` into source conformance
  fixtures and pin the `E1801` static-processor diagnostic.

### Phase 3 - Route / Screener / Experience Gaps

- [x] Promote A8 through a source-conformance replacement at the Surface /
  Response Actions trigger seam: unknown transition triggers fail closed against
  loaded Response Actions action ids and closed-core intents declared by exactly
  one loaded action; empty triggers, undeclared closed intents, ambiguous closed
  intents, and direct `x-*` intent triggers also fail closed. Runtime Plan
  remains evidence-only and unpromoted.
- [x] Promote A5 into Surface route-parameter prose/schema and pin the `E610`
  Surface-local lint diagnostic for missing target route params.
- [x] Promote A10 through App Manifest v2.3 `screeners[]`, ArtifactResolver
  `screeners` loading/report evidence, and AppGraphValidator Screener
  `surface:<route-id>` exact-one loaded Surface route validation. Do not close
  via TraceIndex, Runtime Plan, embedded Definition screener, filename
  discovery, or ad hoc hostEvidence.
- [x] Promote EC2 into Surface `experience-unit` source conformance fixtures and
  pin route-local Definition context in AppGraphValidator.
- [x] Split EC12 runtime hidden-state behavior from existing graph hidden-Definition
  policy fixtures. Do not close EC12 via UI Graph Policy/AppGraphValidator
  fixtures, Runtime Plan, TraceIndex, or v4 spike runtime.
- [x] Record the `formspec-web` EC12 runtime consumer checkpoint: completed host
  evidence for the active Surface route can reject before draft loading or
  Response Action state.

### Phase 4 - Rollup Closure

- [x] Initially update the stack rollup Conformance row with concrete source
  fixture evidence and the unresolved/held family list while keeping the row
  Open.
- [x] Leave Production wiring and Authorization rows separate.
- [x] Close the Conformance row as the promoted-family coverage ledger after F8,
  F9, and F10 were explicitly separated from Production wiring and ADR 0152
  authorization closure.

## Deviations

- 2026-05-25: The first conformance slice starts with A14 rather than EC2 because
  A14 already has production behavior and a unit test. EC2 requires new
  cross-artifact semantics and should not be bundled into the inventory commit.
- 2026-05-25: A8 remains out of the first slice because Runtime Plan is not a
  promoted production source artifact under ADR 0153.
- 2026-05-26: A8 moved from Held/Open to covered by replacing the spike Runtime
  Plan command check with a production source-boundary check over
  `Surface.transitions[].trigger` against loaded Response Actions action ids and
  closed-core intents declared by exactly one loaded action. Empty triggers,
  undeclared closed intents, ambiguous closed intents, direct `x-*` intent
  triggers, and unknown trigger strings fail closed. No Runtime Plan source
  artifact, schema, AppGraphValidator phase, TraceIndex substitute, or renderer
  command channel was promoted.
- 2026-05-25: A11 uses a schema-valid fixture plus Rust lint check because the
  Response Actions schema explicitly cannot enforce unique `actions[*].id`.
- 2026-05-25: A7 is intentionally exact-string and single-action scoped. It does
  not attempt FEL expression equivalence, cross-action alias detection, host
  replay-ledger behavior, or Runtime Plan promotion.
- 2026-05-25: EC2 is URL-exact only. It does not claim Definition `id` alias
  closure, TraceIndex behavior, runtime routing, hidden-state handling, submit
  ownership, or authorization semantics.
- 2026-05-25: A10 cannot count as conformance closure from Surface/Screener
  prose alone. Current evidence proves target syntax only, not graph-associated
  Screener route resolution.
- 2026-05-26: A10 moved from Held/Open to covered after App Manifest v2.3 added
  `screeners[]` as the explicit Screener-to-app association source and
  AppGraphValidator gained exact-one loaded Surface route validation for
  associated Screener `surface:<route-id>` targets. This is association, not
  Screener sidecar absorption: no TraceIndex, Runtime Plan, runtime routing,
  embedded Definition screener, filename discovery, or hostEvidence source was
  promoted.
- 2026-05-25: A5 is Surface-local route graph validation, not Data Sources
  runtime behavior. Data Sources `route-params` may expose resolved values to
  consumers, but Surface owns required route parameter declarations and
  Surface-local edge completeness.
- 2026-05-25: EC12 runtime hidden-state remains Held. UI Graph Policy owns only
  the graph invariant that a hidden Definition ref resolves to a loaded,
  route-local `definition-form` slot. Runtime rejection of draft creation or
  Response Action invocation needs a production runtime/consumer seam that
  consumes schema-valid UI Graph Policy evidence. The v4 spike behavior remains
  evidence, not source authority.
- 2026-05-26: EC12 runtime hidden-state moved from Held/Open to covered for the
  current consumer checkpoint after `formspec-web` consumed completed host
  evidence and rejected before draft/action state. This does not close broader
  production wiring, authorization, Runtime Plan, TraceIndex, or non-web
  consumer behavior.
- 2026-05-26: F8/F9/F10 moved from partial/held wording to conformance-covered
  after architecture review confirmed the row is a coverage ledger, not the
  Production wiring row. F8 is current Response Actions executor conformance;
  F9 is current UI Graph Policy graph-semantics conformance; F10 is
  fail-closed/deferred-field conformance only. ADR 0152 semantics and the
  Authorization row remain Held.

## Closure Evidence

Pinned evidence after the ledger slice:

- Plan: this file.
- A1 ArtifactResolver source identity/version evidence:
  `tests/conformance/fixtures/artifact-resolver/identity-mismatch.case.json`,
  `tests/conformance/fixtures/artifact-resolver/version-mismatch.case.json`,
  `tests/conformance/fixtures/artifact-resolver/valid-full-graph.case.json`, and
  `packages/formspec-app-graph/tests/app-graph-validator.test.ts`.
- A2/A13/A14 ModuleResolver evidence:
  `tests/conformance/fixtures/module-resolver/contribution-unadmitted.case.json`,
  `tests/conformance/fixtures/module-resolver/payload-mismatch.case.json`,
  `tests/conformance/fixtures/module-resolver/sibling-version-mismatch.case.json`,
  `tests/conformance/test_module_resolver_fixture_corpus.py`, and
  `packages/formspec-app-graph/tests/module-resolver-conformance.test.ts`.
- A3/A4/A5 Surface and route-ref evidence:
  `tests/conformance/fixtures/surface/route-unreachable.surface.json`,
  `tests/conformance/fixtures/surface/embed-route-unresolved.surface.json`,
  `tests/conformance/fixtures/surface/transition-missing-route-param.surface.json`,
  `tests/conformance/fixtures/surface/embed-route-missing-route-param.surface.json`,
  `tests/conformance/spec/test_surface_contract.py`,
  `tests/conformance/fixtures/app-graph-validator/component-route-targets.case.json`,
  `tests/conformance/test_app_graph_component_route_fixture_corpus.py`,
  `tests/conformance/fixtures/app-graph-validator/ui-graph-policy-surface-routes.case.json`,
  and `tests/conformance/test_app_graph_ui_policy_surface_route_fixture_corpus.py`.
- A6/A7/A11 Response Actions evidence:
  `tests/conformance/fixtures/response-actions/intent-submit-blocked.json`,
  `tests/conformance/fixtures/response-actions/duplicate-durable-idempotency-key.json`,
  `tests/conformance/fixtures/response-actions/duplicate-action-id.json`,
  `tests/conformance/spec/test_response_actions_runtime.py`,
  `tests/conformance/schemas/test_response_actions_schema.py`, and
  `crates/formspec-lint/src/pass_response_actions.rs`.
- A8 Surface / Response Actions trigger evidence:
  `tests/conformance/fixtures/app-graph-validator/surface-response-action-triggers.case.json`,
  `packages/formspec-app-graph/src/surface-response-action-triggers.ts`,
  `packages/formspec-app-graph/tests/surface-response-action-triggers-conformance.test.ts`,
  and
  `tests/conformance/test_app_graph_surface_response_action_trigger_fixture_corpus.py`.
- A9/A12/EC5 Component route evidence:
  `tests/conformance/fixtures/app-graph-validator/component-route-targets.case.json`
  cases `bound-controls-route-definition-mismatch`,
  `node-identity-duplicate-key`, and `fake-target-definition`, plus
  `tests/conformance/test_app_graph_component_route_fixture_corpus.py`.
- A10 Screener surface-target evidence:
  `specs/bundle/app-manifest-spec.md`,
  `specs/surface/surface-spec.md`,
  `specs/screener/screener-spec.md`,
  `schemas/bundle-manifest.schema.json`,
  `schemas/artifact-resolution-report.schema.json`,
  `tests/conformance/fixtures/bundle/app-with-screeners-v2-3.json`,
  `tests/conformance/fixtures/bundle/invalid-screeners-in-2-2.json`,
  `tests/conformance/fixtures/bundle/invalid-duplicate-screener-url.json`,
  `tests/conformance/fixtures/artifact-resolver/screeners-version-gate-2-2.case.json`,
  `tests/conformance/fixtures/app-graph-validator/screener-surface-targets.case.json`,
  `packages/formspec-app-graph/src/screener-surface-targets.ts`,
  `packages/formspec-app-graph/tests/screener-surface-targets-conformance.test.ts`,
  and `tests/conformance/test_app_graph_screener_surface_target_fixture_corpus.py`.
- A11 fixture:
  `tests/conformance/fixtures/response-actions/duplicate-action-id.json`.
- A11 tests:
  `tests/conformance/schemas/test_response_actions_schema.py` and
  `tests/conformance/spec/test_response_actions_runtime.py`.
- A7 fixture:
  `tests/conformance/fixtures/response-actions/duplicate-durable-idempotency-key.json`.
- A7 lint code:
  `specs/lint-codes.json` (`E1804`) and generated Rust `LintCode::E1804`.
- A7 tests:
  `crates/formspec-lint/src/pass_response_actions.rs`,
  `tests/conformance/schemas/test_response_actions_schema.py`, and
  `tests/conformance/spec/test_response_actions_runtime.py`.
- EC2 fixture:
  `tests/conformance/fixtures/app-graph-validator/surface-experience-units.case.json`.
- EC2 AppGraphValidator code:
  `packages/formspec-app-graph/src/surface-experience-units.ts`.
- EC2 tests:
  `packages/formspec-app-graph/tests/surface-experience-units-conformance.test.ts`
  and `tests/conformance/test_app_graph_surface_experience_unit_fixture_corpus.py`.
- A5 fixtures:
  `tests/conformance/fixtures/surface/transition-missing-route-param.surface.json`
  and
  `tests/conformance/fixtures/surface/embed-route-missing-route-param.surface.json`.
- A5 lint code:
  `specs/lint-codes.json` (`E610`) and generated Rust `LintCode::E610`.
- A5 tests:
  `crates/formspec-lint/src/pass_surface.rs` and
  `tests/conformance/spec/test_surface_contract.py`.
- EC12 graph-policy evidence:
  `tests/conformance/fixtures/app-graph-validator/ui-graph-policy-hidden-definitions.case.json`,
  `tests/conformance/test_ui_graph_policy_semantic_fixture_corpus.py`, and
  `packages/formspec-app-graph/src/ui-graph-policy.ts`.
- EC12 runtime consumer evidence:
  `formspec-web/src/app/RespondentRuntime.tsx`,
  `formspec-web/tests/app/respondent-runtime.test.tsx`, and
  `thoughts/plans/2026-05-26-adr-0153-ui-graph-policy-runtime-closure.md`.
- EC13/EC14 UI Graph Policy evidence:
  `tests/conformance/fixtures/app-graph-validator/ui-graph-policy-locale-owners.case.json`,
  `tests/conformance/test_app_graph_ui_policy_locale_owner_fixture_corpus.py`,
  `tests/conformance/fixtures/app-graph-validator/ui-graph-policy-theme-widgets.case.json`,
  and `tests/conformance/test_app_graph_ui_policy_theme_widget_fixture_corpus.py`.
- F7/F8/F9/F10 boundary evidence:
  `tests/conformance/fixtures/data-sources/fine-grained-auth.json`,
  `tests/conformance/spec/test_data_sources_contract.py`,
  `tests/conformance/spec/test_response_actions_runtime.py`,
  `tests/conformance/fixtures/ui-graph-policy/invalid-authorization-field.json`,
  the UI Graph Policy semantic fixture corpus,
  `formspec-server/tests/e2e-http/response-action-ledger.spec.ts`,
  `formspec-web/tests/e2e/response-action-ledger-live.spec.ts`, and
  `formspec-web/tests/app/respondent-runtime.test.tsx`. This evidence proves
  current promoted source and consumer conformance only; it does not close the
  Production wiring row or ADR 0152 authorization.

Separated follow-ons:

- Production wiring remains a separate Partial row.
- Authorization remains Held behind ADR 0152. F10 is closed only for
  fail-closed/deferred-field conformance evidence.
- Future UI Graph Policy or Component consumers may add new conformance
  families; they do not keep the current promoted-family ledger open.

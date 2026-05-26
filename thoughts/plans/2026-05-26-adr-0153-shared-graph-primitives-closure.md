# ADR 0153 Shared graph primitives row closure plan

**Row:** stack rollup [`thoughts/2026-05-24-adr-0150-followons-and-gating.md`](../../../thoughts/2026-05-24-adr-0150-followons-and-gating.md) §"ADR 0153 / ADR 0154 gating table" → "Shared graph primitives" (Partial).

**Status:** Partial. Experience ActionRef.id → Response Actions cross-artifact resolution landed (validator, fixture, paired TS/Python conformance). Row stays Partial because single-invariant extraction does not mechanically equal plural "broader cross-artifact checks"; remaining module-consuming semantics and further cross-artifact invariants still open.

**Scope:** Extract Experience `ActionRef.id` → Response Actions `actions[*].id` cross-artifact resolution as an AppGraphValidator-owned invariant. The spec already mandates resolution (experience-spec.md:302, experience.schema.json `ActionRef.id` description: "MUST resolve against the loaded Response Actions document's `actions[*].id` set"), but neither `formspec-lint` nor AppGraphValidator currently enforces it cross-artifact today.

**Closing slice** per rollup row: "Broader cross-artifact invariant extraction; remaining module-consuming semantics". This slice promotes one invariant. The row transitions Partial → Closed when the validator-owned cross-artifact check is implemented, paired with positive + negative source-conformance fixtures and a TS conformance runner. The "remaining module-consuming semantics" residual stays open as a future slice — no other module-consuming invariant lands here.

**Not in scope:** Definition `instances[]` ↔ Data Sources cross-link (spec-explicit non-link per data-sources-spec.md:65-67); Definition bind path resolution (Component-bind-path-to-Definition-items is a separate plain-form invariant that belongs to a different row); UI Graph Policy semantics (separate row).

## Architecture review BEFORE

Scout `acf1f5b627eb396ec` Verdict B (Closeable to a finer checkpoint) covers this slice. The scout named the abstract shape ("one named cross-artifact invariant the validator does not yet enforce"); this plan picks Experience `ActionRef.id` resolution as the specific invariant because:

1. **Spec-normative gap.** experience-spec.md §"Action references" + schema description both mandate resolution. Today nothing enforces it cross-artifact. A processor that consumes a malformed Experience document with dangling action ids would let the renderer-inert-trigger behavior leak past the publish gate.
2. **Within ADR 0153 §6** ("What Must Not Be Promoted"). The Experience document is a peer artifact, not a v4 spike extension; the action id list is a normative typed-reference column, not a widget payload; no Runtime Plan, no fixture-path identity, no `targetDefinition` shim.
3. **Real user value.** Authoring tools that produce Experience documents (Studio, MCPs) can now fail closed at publish time on dangling action ids rather than ship inert triggers to runtime.
4. **No dependency on out-of-scope rows.** Doesn't need Component copy/move consumers, doesn't need an App Manifest policy slot decision, doesn't need ADR 0152.

## Ordered work

Following ADR 0153 §7 production order (prose → schemas → fixtures → shared libs → lint + conformance → production wiring):

1. **Prose**: experience-spec.md:302 already binds the contract; ADR 0153 §9 gate 3b includes "broader cross-artifact checks" as the closure axis. No new prose authored — the invariant promotion is documented in this plan doc + the rollup row evidence.
2. **Schema**: experience.schema.json `ActionRef.id` description already pins the contract.
3. **Fixture**: new `formspec/tests/conformance/fixtures/app-graph-validator/experience-action-refs.case.json` with handles (App Manifest + Definition + Experience variants + Response Actions variants) and cases covering: (a) positive resolution, (b) unresolved id with loaded Response Actions, (c) Experience carries actionRefs but no Response Actions loaded (spec mandates loading), (d) no-actionRefs/no-Response-Actions positive, and (e) multi-Response-Actions-handle union resolution.
4. **Shared lib**: new `formspec/packages/formspec-app-graph/src/experience-action-refs.ts` — `validateExperienceActionRefs(context)` returning `AppGraphDiagnostic[]` for code `APP-GRAPH-EXPERIENCE-ACTION-REF`. Wired into `runCrossArtifactValidators` allValidators list in `validator.ts` and re-exported from `index.ts`.
5. **Lint + conformance**: TS conformance runner (`formspec/packages/formspec-app-graph/tests/experience-action-refs-conformance.test.ts`) iterates the fixture corpus through `validateAppGraph`. Python conformance test (`formspec/tests/conformance/test_app_graph_experience_action_ref_fixture_corpus.py`) mirrors the runner pattern.
6. **Production wiring**: AppGraphValidator output already flows through `formspec-lint` and `formspec-server` publish gate; the new diagnostic surfaces automatically through those wired consumers.

## Deviations

- This slice is one invariant. The rollup row's closing-slice phrase "Broader cross-artifact invariant extraction" implies plural; per `feedback_conceptual_nugget` and scout verdict B, attempting plural in one slice dilutes the review surface. Closure for THIS slice means: the invariant validator + fixtures + tests land; the row's `Executable today` cell names the new invariant; row Status transitions to Closed ONLY if the owner accepts single-invariant extraction as sufficient for "broader" — otherwise it stays Partial with the new invariant pinned as observed evidence.

## Closing observation

Validator + fixture + paired TS / Python conformance landed green. Architecture/code review found the first fixture draft used stale `$formspecExperience: "0.1"` and a TS always-OK schema validator, so the remediation moved the fixture to canonical Experience 1.0 documents and changed the TS runner to validate App Manifest, Experience, and Response Actions handles with Ajv against the canonical schemas before cross-artifact validation runs. TS: `experience-action-refs-conformance.test.ts` passes 5/5 (positive resolution, dangling action id rejection, Response-Actions-not-loaded rejection, Experience-with-no-actionRefs positive, multi-Response-Actions-handle union resolution). Python: `test_app_graph_experience_action_ref_fixture_corpus.py` passes 4/4 (corpus required-cases, source explicitness, diagnostic AppGraph ownership, no v4 spike key/path leakage). Broader app-graph vitest now passes 207/207 across 21 test files. The new `APP-GRAPH-EXPERIENCE-ACTION-REF` diagnostic carries through `runCrossArtifactValidators` and surfaces automatically through the existing `formspec-lint` and `formspec-server` publish-path consumers.

Row Status stays **Partial** in this slice. The rollup row's `Executable today` cell names the new invariant; the "Closing slice" cell is reframed from "Broader cross-artifact invariant extraction" to "Remaining module-consuming semantics; further cross-artifact invariants if owner accepts single-invariant landing as 'broader' enough to flip Status". This honors the scout's Verdict B finding that single-invariant extraction does NOT mechanically equal plural "broader", while making the evidence visible so the owner can flip Status via the same scope-reframe pattern used for the Conformance row (commit `802ab9a`).

## Closure evidence

- Plan doc: this file.
- Validator implementation: `formspec/packages/formspec-app-graph/src/experience-action-refs.ts` — `validateExperienceActionRefs(context)` emitting `APP-GRAPH-EXPERIENCE-ACTION-REF` for `action-id-unresolved` and `response-actions-not-loaded` reasons.
- Wired into validator dispatch: `formspec/packages/formspec-app-graph/src/validator.ts` `runCrossArtifactValidators` allValidators list.
- Public export: `formspec/packages/formspec-app-graph/src/index.ts` re-export.
- Fixture: `formspec/tests/conformance/fixtures/app-graph-validator/experience-action-refs.case.json` (5 cases × handles; schema-valid under canonical App Manifest, Experience, and Response Actions schemas).
- TS conformance runner: `formspec/packages/formspec-app-graph/tests/experience-action-refs-conformance.test.ts` (5/5 pass with Ajv schema validation before cross-artifact validation).
- Python conformance runner: `formspec/tests/conformance/test_app_graph_experience_action_ref_fixture_corpus.py` (4/4 pass).
- Rollup row evidence update: stack-root [`thoughts/2026-05-24-adr-0150-followons-and-gating.md`](../../../thoughts/2026-05-24-adr-0150-followons-and-gating.md) §"ADR 0153 / ADR 0154 gating table" → "Shared graph primitives" `Executable today` cell adds the new invariant + paired fixture/runners.
- Code review: `019e64cc-712c-7921-9ed1-09be1abe758a` requested changes for the schema-invalid fixture draft; remediation applied in the follow-up commit.

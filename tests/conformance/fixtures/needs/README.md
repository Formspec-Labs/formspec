# Needs conformance fixtures

**Contract:** [`specs/needs/needs-spec.md`](../../../../specs/needs/needs-spec.md) — S6 (document integrity), S7 (`needRefs` resolution), S9 (coverage, with the S9.4 fire / does-not-fire tables and the S9.5 reserved codes), and Appendix A's worked example.

**Runners:**

| Half | Runner | Owns |
|---|---|---|
| Schema | [`tests/conformance/test_needs_schema_fixture_corpus.py`](../../test_needs_schema_fixture_corpus.py) | `expectSchemaValid` against [`schemas/needs.schema.json`](../../../../schemas/needs.schema.json) |
| Checker | [`packages/formspec-app-graph/tests/needs-coverage-corpus.test.ts`](../../../../packages/formspec-app-graph/tests/needs-coverage-corpus.test.ts) | `expectedCodes` against the real `validateNeedsCoverage` |

Each case carries **two** verdicts, so one corpus serves both halves of the spec rather than forking one:

| Field | Owner | Meaning |
|---|---|---|
| `expectSchemaValid` | `needs.schema.json` | Does the Needs Document validate? `null` means the case pairs no document (S2.1 unpaired), so there is nothing to validate. |
| `expectedCodes` | the coverage checker | Exactly the `NEED-*` codes the checker emits, sorted, **with multiplicity** — "once per unserved Need" is pinned by count, not just by presence. |

`specRow` quotes the S9.4 row (or the S2.1 / S4.3 / S9.5 rule) the case pins. `bundle` is the caller-paired bundle half: `bundle.experience` supplies `units[]` with their `needRefs`, `bundle.generatedArtifacts` supplies nodes carrying `x-generation.anchors[]`. Both are optional — a document-integrity case needs neither.

`note` is **REQUIRED** on every case whose two verdicts diverge, and states why. Elsewhere a `note` is **PERMITTED**: use it when a case pins a deliberate design choice a reader would otherwise misread as an oversight (the reserved-code pair, the superseded record outside the coverage partition, the empty-`needRefs` reading). `test_divergent_verdicts_are_documented` enforces the required half; the permitted half is editorial.

## What counts as a divergence

The schema never sees a bundle, so bundle-side codes (`NEED-REF-001`, `NEED-COVERAGE-001`, `NEED-COVERAGE-002`) on a schema-valid document are not a divergence — they are the half the schema cannot have an opinion about. Agreement is judged on the schema-expressible codes alone: `NEED-GROUND-001` (S12's grounding `oneOf`) and `NEED-DOC-001` (S12's origin/status `allOf` conditionals). A schema-invalid document must name at least one of those; a schema-valid document must name none.

## Coverage

| Fixture | Rule | schema | checker codes |
|---|---|---|---|
| `valid-both-grounding-channels` | S9.4 | valid | — |
| `valid-ungrounded-reason-on-adopted-need` | S9.4 | valid | — |
| `invalid-need-without-grounding-or-reason` | S9.4 | **invalid** | `NEED-GROUND-001` |
| `invalid-need-with-both-grounding-and-reason` | S9.4 | **invalid** | `NEED-GROUND-001` |
| `invalid-need-with-empty-grounding-array` | S9.4 | **invalid** | `NEED-GROUND-001` |
| `invalid-ai-proposed-without-proposed-by` | S9.4 / S6.4 | **invalid** | `NEED-DOC-001` |
| `invalid-adopted-without-adopted-by` | S9.4 / S6.4 | **invalid** | `NEED-DOC-001` |
| `invalid-ai-proposed-adopted-by-ai-agent` | S4.3 adoption floor | **invalid** | `NEED-DOC-001` |
| `valid-ai-proposed-adopted-by-human` | S4.3 | valid | — |
| `valid-withdrawn-ai-proposed-never-adopted` | S4.3 | valid | — |
| `invalid-duplicate-need-id` | S6.1 | valid | `NEED-DOC-001` |
| `invalid-duplicate-journey-id` | S6.1 | valid | `NEED-DOC-001` |
| `invalid-supersedes-unknown-id` | S6.2 | valid | `NEED-DOC-001` |
| `invalid-supersedes-target-not-superseded` | S6.2 | valid | `NEED-DOC-001` |
| `invalid-superseded-without-successor` | S6.2 | valid | `NEED-DOC-001` |
| `invalid-superseded-with-multiple-successors` | S6.2 | valid | `NEED-DOC-001` |
| `valid-supersession-chain` | S4.3 / S9.2 | valid | — |
| `invalid-journey-unresolved` | S6.3 | valid | `NEED-DOC-001` |
| `valid-journeys-absent-free-grouping-strings` | S9.4 | valid | — |
| `invalid-unresolved-need-ref` | S9.4 | valid | `NEED-COVERAGE-001`, `NEED-REF-001` |
| `valid-need-ref-to-withdrawn-need` | S9.4 | valid | — |
| `valid-unit-with-unresolved-ref-is-still-justified` | S9.4 | valid | `NEED-REF-001` |
| `warning-adopted-need-unserved` | S9.4 | valid | `NEED-COVERAGE-001`, `NEED-COVERAGE-002` |
| `valid-adopted-need-served-by-anchor-only` | S9.4 | valid | — |
| `valid-proposed-need-outside-partition` | S9.4 | valid | — |
| `info-unit-without-need-refs` | S9.4 | valid | `NEED-COVERAGE-002` |
| `valid-unpaired-emits-nothing` | S2.1 | n/a | — |
| `valid-stale-anchor-does-not-emit-reserved-code` | S9.5 | valid | — |
| `valid-anchor-to-withdrawn-need-does-not-emit-reserved-code` | S9.5 | valid | — |
| `appendix-a-worked-example` | Appendix A | valid | `NEED-COVERAGE-001`, `NEED-COVERAGE-002` |

## Known schema/checker divergences

Every row below is intentional and asserted by `test_divergent_verdicts_are_documented` and `test_document_scope_rules_are_not_schema_expressible`.

- **`invalid-duplicate-need-id`, `invalid-duplicate-journey-id`** — JSON Schema cannot express uniqueness over a keyed field of an array item, so the schema admits what S6.1 refuses. The same gap [`../posture-actor-scope/`](../posture-actor-scope/) records for `duplicate-vocabulary-handles`.
- **`invalid-supersedes-unknown-id`, `invalid-supersedes-target-not-superseded`, `invalid-superseded-without-successor`, `invalid-superseded-with-multiple-successors`** — supersession integrity is a cross-record predicate in both directions. `supersedes` is pattern-checked; whether it resolves, what status its target holds, and how many records cite it are not schema-expressible. The last two pin the S9.4 "zero **or multiple** citing `supersedes`" clause from each end, so neither half of the cardinality rule rests on the checker's implementation alone.
- **`invalid-journey-unresolved`** — cross-array reference resolution, same class of gap.

If a future schema rev closes any of them, `test_document_scope_rules_are_not_schema_expressible` fails and the fixture's `expectSchemaValid` flips with it. The gap never closes silently.

## Reserved codes

`NEED-STALE-001` and `NEED-ORPHAN-001` (S9.5) are registered so the deferred checks are not minted incompatibly later, and v1 processors MUST NOT emit them (S11.3.4). Two fixtures put the substrate in exactly the state each reserved code describes — a stale anchor, an anchor to a withdrawn Need — and assert **silence**. `test_reserved_codes_are_never_expected` refuses any fixture that expects one, so implementing either code is a deliberate act rather than a fixture drifting into it.

**Not covered here:** the plain-language authoring rules of S4.1 (review-enforced, not tooling-enforced — S11.1.3), Rulespec IRI resolution behind an `AssertionGrounding.ref` (out of scope for every conformance class, S5.1), and the `needs.adoption` authority handle (reserved, not minted — S10.2). The adoption floor those rules would narrow *further* is exercised here, because the floor holds with or without a postured deployment.

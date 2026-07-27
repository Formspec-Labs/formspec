# Posture admission conformance fixtures

**Runner:** `formspec/tests/conformance/test_posture_admission_lint_fixture_corpus.py` loads every `*.case.json` here and asserts `expectedCodes` against Rust lint (E608/E609).

Maps each case file to the gate that consumes it. Branch-open admission (studio) is **not** covered here — see `formspec-studio-core/tests/actor-posture-admission.test.ts`.

| Fixture | Gate | Codes |
|---------|------|-------|
| `absent-posture-permissive.case.json` | Lint (permissive) | none |
| `module-admits-extra-provenance.case.json` | Lint E608 | admit |
| `module-lock-hash-mismatch.case.json` | Lint E608 | E608 |
| `module-not-in-allowlist.case.json` | Lint E608; server publish integration | E608 |
| `actor-not-in-allowlist.case.json` | Lint E609 (embedded URNs) | E609 |

**Not in publish HTTP payload:** Experience and App Manifest `modules[]` require full-bundle CI lint. See `formspec-stack/thoughts/deployment-posture-wiring.md`.

**TS matcher corpus (vitest):** `@formspec-org/app-graph` `posture-admission-conformance.test.ts` — module/actor matchers vs `expectedCodes` / `forbiddenCodes` on this directory.

**Studio-only (vitest):** `class-scope-deferred`, `session-not-indexed`, `actor-required` — `assertBranchOpenPostureAdmission` in `@formspec-org/studio-core`.

**Fine-grained actor scope (ADR 0152):** `posture.extensions.x-formspec-actor-scope` declaration validity and the §5.1 fail-closed matrix are the sibling corpus, [`../posture-actor-scope/`](../posture-actor-scope/). It replaces the blanket `actor-scope-deferred` rejection this directory's gate used to carry.

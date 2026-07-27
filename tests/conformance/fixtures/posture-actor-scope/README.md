# Posture actor-scope conformance fixtures

**Contract:** [ADR 0152](../../../../../thoughts/adr/0152-multi-actor-authorization-scope.md) §4 (canonical shape + registry v1) and §5.1 (total fail-closed matrix), for `posture.extensions.x-formspec-actor-scope`.

**Runner:** `formspec/tests/conformance/test_posture_actor_scope_schema_fixture_corpus.py` loads every `*.case.json` here and asserts `expectSchemaValid` against `schemas/posture-declaration.schema.json`.

Each case carries **two** verdicts, so one corpus serves both halves of §5.1:

| Field | Owner | Meaning |
|---|---|---|
| `expectSchemaValid` | this schema | Does the whole posture document validate? |
| `expectedAdmission` | studio-core `parseActorScopeDeclaration` / branch-open | `admit` \| `binary-fallback` \| `posture-config-invalid` \| `class-scope-deferred` |

`adrRow` quotes the §5.1 (or §4.x) row the case pins. `note` is **REQUIRED** on every case whose two verdicts diverge — anything outside the three agreeing pairs `(valid, admit)`, `(valid, binary-fallback)`, `(invalid, posture-config-invalid)` — and states why. Elsewhere a `note` is **PERMITTED**: use it when a case pins a deliberate design choice a reader would otherwise misread as an oversight (e.g. `valid-ids-only-selector` recording that `theme.declaration` is the pending-op row, or the two reserved-namespace rows recording what the gate used to do before it scanned). `test_divergent_verdicts_are_documented` enforces the required half; the permitted half is editorial.

## Coverage

| Fixture | §5.1 row | schema | admission |
|---|---|---|---|
| `valid-minimal-declaration` | valid v1 declaration | valid | admit |
| `valid-empty-protects-noop` | `protects: []` no-op | valid | admit |
| `valid-freeze-empty-writable-by` | empty selector (`{}`) = freeze | valid | admit |
| `valid-freeze-empty-selector-arrays` | empty selector (`{kinds: [], ids: []}`) = same freeze | valid | admit |
| `valid-values-narrowing-route-class` | §4.1 value grain on a closed vocabulary | valid | admit |
| `valid-ids-only-selector` | §4.1 union match; §4.2 pending-op row | valid | admit |
| `valid-non-urn-id-not-schema-pinned` | §4.1 `ids` shape is authoring convention, not a schema pin | valid | admit |
| `valid-null-payload-binary-fallback` | `null` → treated as absent | valid | binary-fallback |
| `valid-absent-hook-binary-fallback` | hook absent | valid | binary-fallback |
| `valid-unknown-extension-key-passthrough` | `^x-` seam stays open outside `x-formspec-` | valid | binary-fallback |
| `valid-class-scope-reserved-hook-still-deferred` | `x-formspec-class-scope` non-empty | valid | class-scope-deferred |
| `valid-class-scope-null-explicit-no-config` | `x-formspec-class-scope: null` ≡ absent (same idiom as actor-scope) | valid | binary-fallback |
| `duplicate-vocabulary-handles` | duplicate handles, no merge semantics | **valid** | posture-config-invalid |
| `invalid-empty-object-payload` | `{}` payload | invalid | posture-config-invalid |
| `invalid-unknown-actor-scope-version` | unknown version | invalid | posture-config-invalid |
| `invalid-absent-protects` | `protects` key absent | invalid | posture-config-invalid |
| `invalid-unknown-vocabulary-handle` | §4.2 closed registry | invalid | posture-config-invalid |
| `invalid-values-on-operation-handle` | `values` on an operation handle | invalid | posture-config-invalid |
| `invalid-unknown-values-key` | value outside the closed vocabulary | invalid | posture-config-invalid |
| `invalid-extra-sibling-keys` | unknown sibling of `$actorScope`/`protects` | invalid | posture-config-invalid |
| `invalid-unknown-writable-by-key` | unknown key inside `writableBy` | invalid | posture-config-invalid |
| `invalid-malformed-selector-not-object` | malformed selector | invalid | posture-config-invalid |
| `invalid-unknown-actor-kind` | `AuthorActor.kind` is terminal-closed | invalid | posture-config-invalid |
| `invalid-missing-writable-by` | entry with no selector | invalid | posture-config-invalid |
| `invalid-whitespace-only-id` | §4.1 `ids` are non-blank (`\S`) | invalid | posture-config-invalid |
| `invalid-scalar-payload` | non-object payload | invalid | posture-config-invalid |
| `invalid-array-payload` | non-object payload | invalid | posture-config-invalid |
| `invalid-non-extension-key` | non-`x-` key on `extensions` | invalid | binary-fallback |
| `invalid-typo-reserved-key` | `x-formspec-` sub-namespace is closed | invalid | posture-config-invalid |
| `invalid-class-scope-empty-object` | `{}` class scope is undeclarable intent | invalid | posture-config-invalid |

## Known schema/evaluation divergences

Every row below is intentional and asserted by `test_divergent_verdicts_are_documented`.

- **`duplicate-vocabulary-handles`** — JSON Schema cannot express uniqueness over a keyed field of an array item, so the schema admits what §5.1 refuses. Evaluation owns the rejection. If a future schema rev closes the gap, `test_duplicate_handle_rejection_is_not_schema_expressible` fails and the fixture flips with it.
- **`valid-class-scope-reserved-hook-still-deferred`** — the schema constrains the reserved hook's *presence*, never its shape (pass 2 owns that), so a non-empty payload validates. The refusal is evaluation's: `class-scope-deferred` at branch-open.
- **`invalid-non-extension-key`** — a malformed posture *document*, not a malformed actor scope. Strict posture handling (§5.3) refuses it at document validation, upstream of branch-open; the branch-open gate reads no actor-scope key at all.

**Two rows left this list.** `invalid-typo-reserved-key` and `invalid-class-scope-empty-object` used to diverge because the gate looked up two exact keys: it could not see a misspelling of a key it never reads, and it counted `{}` as not-configured. §5.1 replaced both reads with an always-on scan of the reserved `x-formspec-` sub-namespace, so the gate now refuses each as `posture-config-invalid` — agreeing with the schema. Their `note` fields stay as design-choice records; they are no longer required by `test_divergent_verdicts_are_documented`.

That leaves **one** defect only the document validator can see (`invalid-non-extension-key`), plus the two rows each layer owns alone. Strict posture handling (§5.3) stays mandatory for any deployment declaring these extensions: the gate now catches the two cheapest mangling defects, but everything deeper — selector shapes, `values` keys, id patterns — is still schema-only.

**Not covered here:** op-admission refusal (§5.2, `vocabulary-protected`) and the branch-open gate itself — those are studio-core's, in `formspec-studio-core/tests/actor-posture-admission.test.ts`, and this corpus's `expectedAdmission` column is replayed against the real gate by `formspec-studio-core/tests/posture-actor-scope-corpus.test.ts`. Binary `allowedModules[]` / `allowedActors[]` lint admission (E608/E609) is the sibling corpus, [`../posture-admission/`](../posture-admission/).

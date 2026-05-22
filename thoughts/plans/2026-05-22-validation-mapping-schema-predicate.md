---
title: Validation-Mapping Schema — Predicate Refactor for Reuse
date: 2026-05-22
status: active
owner: spec-author
related:
  - thoughts/plans/2026-05-22-response-actions-spec.md
  - specs/core/validation-mapping.md
  - schemas/validation-mapping.schema.json
---

# Validation-Mapping Schema — Predicate Refactor for Reuse

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development. Steps use `- [ ]` syntax. Failing tests first per `formspec/CLAUDE.md`.

**Goal:** Extract the VM §6.3 validity predicate (currently embedded in `$defs/MappingEntry`) into a reusable `$defs/ValidationTuple` so any consumer (Response Actions today, future Mapping/Experience overrides tomorrow) can `$ref` it and inherit the predicate at JSON-Schema-validation time. **Also**: tighten the predicate to add a fourth clause that makes `block-on-error` exclusive to `complete-response` — closing the §6.3-vs-§5.2 gap where `block-on-error + draft-checkpoint` is currently permitted by the predicate but is incoherent in Response Actions' `blocked` terminal semantics. Closes Expert BLOCKER 2, Scout M6, and the §6.3 gap finding from the post-refactor architecture review.

**Architecture:** Strictly additive — `MappingEntry` extends a new `$defs/ValidationTuple` that owns the predicate (`allOf` clauses) and the three enum slots (`profile`, `blocking`, `persistence`). `MappingEntry` adds the `intent` slot via JSON-Schema composition. Existing consumers of `MappingEntry` are unaffected: a tuple-conforming entry remains entry-conforming, and the existing `const` block on `MasterTable` continues to constrain the canonical table row-for-row. Response Actions `ValidationOverride` becomes a `$ref` to `ValidationTuple` (the override is exactly the tuple, minus `intent`).

**Tech Stack:** JSON Schema 2020-12, pytest under `formspec/tests/conformance/`, `npm run docs:generate`.

**Sequencing:** Failing schema-shape test first → schema refactor → positive (all 5 master rows pass), negative (each prohibited combo rejected), and cross-consumer `$ref` tests → focused contract-surface gate → conformance sweep → BLUF and spec prose touch-up. Per repo rule: schema is structural truth; canonical prose §6.3 already describes the predicate, no spec rewrite needed.

**Citations:** "VM §" = `specs/core/validation-mapping.md`. "RA-plan" = `formspec/thoughts/plans/2026-05-22-response-actions-spec.md`.

---

## File Structure

### Created

| Path | Responsibility |
|---|---|
| `tests/conformance/schemas/test_validation_mapping_predicate.py` | Positive + negative tests for `$defs/ValidationTuple`, `MappingEntry` composition, and downstream consumer `$ref` inheritance. |

### Modified

| Path | Why |
|---|---|
| `specs/core/validation-mapping.md` | §6.2 add a fifth prohibition entry; §6.3 add the fourth predicate clause. The new clause: `block-on-error` MUST be paired with `complete-response` (the blocking gate halts all effects and prevents the persistence transition; allowing it for `draft-checkpoint` or `none` creates a semantic conflict with VM §5.2's guarantee that non-complete-response persistence is unaffected by blocking). |
| `schemas/validation-mapping.schema.json` | Extract `ValidationTuple` $def carrying the three slots + `allOf` predicate (now with **four** clauses). `MappingEntry` composes via `allOf: [{$ref: ValidationTuple}, {intent-shape}]`. The new fourth clause is enforced as part of the `ValidationTuple.allOf` — every consumer `$ref`ing the tuple inherits it. |
| `tests/conformance/spec/test_validation_mapping_table.py` | Add a new pytest enumerating prohibited tuples (including the new clause's case) and asserting rejection via the schema validator. |
| `tests/contracts/surface-coverage.json` | Add the new predicate test to the Validation Mapping row so the enforced row names the executable proof. |
| `scripts/run-contract-surface-tests.mjs` | Run the Validation Mapping schema/table/predicate tests in the focused contract-surface gate. |
| `filemap.json` | Regenerated. **Generated — never hand-edit.** |

### Explicitly NOT in scope

- **Changing the master table values.** Schema `const` block remains exactly the five canonical rows. (Verified: all five satisfy the tightened predicate. The `submit` row uses `block-on-error + complete-response` — the only master-row use of `block-on-error` — so the new clause does not invalidate any existing row.)
- **Adding x-extension predicate carve-outs.** VM §6.1 already addresses x-intents; tuple-level predicate applies uniformly.
- **Master-table re-numbering or re-ordering.** Out of scope.

---

## Self-Review Note

- The predicate is currently inside `MappingEntry`. Refactoring **does not weaken** the constraint: `MappingEntry` will still satisfy the predicate via composition. Negative tests prove the refactor doesn't introduce regressions.
- Response Actions `ValidationOverride` will be a one-line `$ref` to `ValidationTuple` after this lands. The override implicitly inherits the predicate; no override-side `allOf` duplication.
- Cold-read test: a future agent reading the schema can find the predicate in one place (`ValidationTuple.allOf`), not duplicated across consumers.
- The schema-level enforcement is **additive** to the existing prose §6.2/§6.3 rules. Processors MAY catch violations earlier (at schema-validate time) instead of waiting until runtime evaluation. User value: fewer round-trips for malformed Response Actions documents.

---

## Task 0: Update VM canonical prose (§6.2 + §6.3)

**Files:**
- Modify: `specs/core/validation-mapping.md`

- [ ] **Step 1: Append §6.2 prohibition entry 5**

After the existing §6.2 prohibitions (currently 1-4), append:

```markdown
5. Pair `block-on-error` with any `PersistencePolicy` other than `complete-response` (the blocking gate halts all effects and prevents the persistence transition; allowing it for `draft-checkpoint` or `none` would create a semantic conflict between the blocked terminal and §5.2's guarantee that non-complete-response persistence is unaffected by blocking).
```

- [ ] **Step 2: Update §6.3 validity predicate to four clauses**

Replace the current three-clause predicate with:

```
permitted(profile, blocking, persistence) :=
    NOT (persistence = complete-response AND blocking != block-on-error)
  AND NOT (persistence = complete-response AND profile != on-submit)
  AND NOT (profile = off AND blocking = block-on-error)
  AND NOT (blocking = block-on-error AND persistence != complete-response)
```

Add a sentence after the predicate: "The fourth clause is symmetric with the first — together they make `block-on-error` and `complete-response` co-required. A processor MUST reject any override that pairs `block-on-error` with `none` or `draft-checkpoint` persistence."

The five master-table rows continue to satisfy the predicate (only `submit` uses `block-on-error`, and it pairs with `complete-response`).

- [ ] **Step 3: Commit**

```bash
cd formspec && git add specs/core/validation-mapping.md
git commit -m "feat(spec): tighten VM §6.3 — block-on-error iff complete-response

Adds the fourth predicate clause. Closes the §6.3-vs-§5.2 gap where
block-on-error + draft-checkpoint was permitted by the predicate but
created a semantic conflict with §5.2's persistence-still-occurs rule.
Master-table rows unchanged; override space shrinks but stays coherent."
```

---

## Task 1: Failing tests for the refactor

**Files:**
- Create: `tests/conformance/schemas/test_validation_mapping_predicate.py`

- [ ] **Step 1: Author the test**

```python
"""Predicate refactor tests for validation-mapping.schema.json.

Pins:
- $defs/ValidationTuple exists with the predicate.
- MappingEntry composes ValidationTuple + intent.
- All five master-table rows satisfy the predicate.
- Each prohibited tuple is rejected.
- ValidationOverride consumers (forthcoming response-actions schema)
  inherit the predicate via $ref.
"""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

# Reuse the project-wide schema-registry helper. It expects every schema
# to carry an `$id`, registers by that $id, and returns a Registry.
# Source: tests/unit/support/schema_fixtures.py:build_schema_registry.
from tests.unit.support.schema_fixtures import build_schema_registry

SCHEMA_PATH = Path(__file__).resolve().parents[3] / "schemas" / "validation-mapping.schema.json"


def load_schema():
    return json.loads(SCHEMA_PATH.read_text())


def build_tuple_validator():
    schema = load_schema()
    tup = schema["$defs"]["ValidationTuple"]
    return Draft202012Validator(tup, registry=build_schema_registry(schema))


def build_entry_validator():
    schema = load_schema()
    entry = schema["$defs"]["MappingEntry"]
    return Draft202012Validator(entry, registry=build_schema_registry(schema))


def build_consumer_validator():
    """Simulate a downstream schema that consumes only the tuple $def
    via the canonical VM $id. Mirrors how Response Actions' schema
    $refs into ValidationTuple."""
    schema = load_schema()
    consumer = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://formspec.org/schemas/validationMapping/1.0#/$defs/ValidationTuple",
    }
    return Draft202012Validator(consumer, registry=build_schema_registry(schema))


def test_validation_tuple_def_exists():
    schema = load_schema()
    assert "ValidationTuple" in schema["$defs"], "missing $defs/ValidationTuple"
    vt = schema["$defs"]["ValidationTuple"]
    assert set(vt["properties"]) >= {"profile", "blocking", "persistence"}
    assert "allOf" in vt, "predicate clauses MUST live in ValidationTuple.allOf"


def test_mapping_entry_composes_validation_tuple():
    schema = load_schema()
    entry = schema["$defs"]["MappingEntry"]
    # The entry MUST compose tuple via allOf or by inheriting via reference structure.
    found_tuple_ref = False
    for clause in entry.get("allOf", []):
        if clause.get("$ref", "").endswith("/ValidationTuple"):
            found_tuple_ref = True
    assert found_tuple_ref, "MappingEntry MUST $ref ValidationTuple"


def test_mapping_entry_still_rejects_prohibited_tuples():
    validator = build_entry_validator()
    bad_entry = {
        "intent": "x-acme-bulk-import",
        "profile": "on-submit",
        "blocking": "block-on-error",
        "persistence": "draft-checkpoint",
    }
    errors = list(validator.iter_errors(bad_entry))
    assert errors, "MappingEntry MUST still enforce the ValidationTuple predicate"


@pytest.mark.parametrize("tup", [
    # The five master-table rows.
    {"profile": "off", "blocking": "non-blocking", "persistence": "draft-checkpoint"},
    {"profile": "on-submit", "blocking": "non-blocking", "persistence": "none"},
    {"profile": "on-submit", "blocking": "block-on-error", "persistence": "complete-response"},
    {"profile": "on-demand", "blocking": "non-blocking", "persistence": "draft-checkpoint"},
    {"profile": "live", "blocking": "non-blocking", "persistence": "none"},
])
def test_permitted_tuples_accepted(tup):
    validator = build_tuple_validator()
    errors = list(validator.iter_errors(tup))
    assert not errors, f"permitted tuple {tup} rejected: {errors}"


@pytest.mark.parametrize("tup", [
    # complete-response paired with non-block-on-error blocking
    {"profile": "on-submit", "blocking": "non-blocking", "persistence": "complete-response"},
    # complete-response paired with non-on-submit profile
    {"profile": "on-demand", "blocking": "block-on-error", "persistence": "complete-response"},
    {"profile": "live", "blocking": "block-on-error", "persistence": "complete-response"},
    # off profile paired with block-on-error
    {"profile": "off", "blocking": "block-on-error", "persistence": "draft-checkpoint"},
    # block-on-error paired with non-complete-response persistence (NEW fourth clause)
    {"profile": "on-submit", "blocking": "block-on-error", "persistence": "draft-checkpoint"},
    {"profile": "on-submit", "blocking": "block-on-error", "persistence": "none"},
])
def test_prohibited_tuples_rejected(tup):
    validator = build_tuple_validator()
    errors = list(validator.iter_errors(tup))
    assert errors, f"prohibited tuple {tup} should have been rejected"


def test_consumer_ref_inherits_tuple_predicate():
    """Response Actions-style consumers inherit the predicate via $ref."""
    validator = build_consumer_validator()
    good = {"profile": "on-submit", "blocking": "block-on-error", "persistence": "complete-response"}
    bad = {"profile": "on-submit", "blocking": "block-on-error", "persistence": "draft-checkpoint"}

    assert not list(validator.iter_errors(good))
    assert list(validator.iter_errors(bad)), "predicate MUST flow through $ref consumers"


def test_master_table_const_still_intact():
    schema = load_schema()
    mt = schema["$defs"]["MasterTable"]
    # The const block constrains the table to exactly the five canonical rows.
    assert "const" in mt
    assert len(mt["const"]) == 5
    intents = {row["intent"] for row in mt["const"]}
    assert intents == {"save-draft", "autosave", "review", "submit", "request-evidence"}
```

- [ ] **Step 2: Run — expect failure**

```bash
cd formspec && python3 -m pytest tests/conformance/schemas/test_validation_mapping_predicate.py -v
```

Expected: `test_validation_tuple_def_exists` and `test_mapping_entry_composes_validation_tuple` fail (the $def doesn't exist yet); the permitted/prohibited, mapping-entry, and consumer-ref tests fail with errors about the validator targeting a non-existent $def. That's the red phase.

- [ ] **Step 3: Commit red**

```bash
cd formspec && git add tests/conformance/schemas/test_validation_mapping_predicate.py
git commit -m "test(schema): red — VM ValidationTuple refactor + predicate reuse

Pins the extracted \$def, MappingEntry composition, five permitted rows,
six prohibited rows, and downstream consumer \$ref inheritance."
```

---

## Task 2: Schema refactor

**Files:**
- Modify: `schemas/validation-mapping.schema.json`

- [ ] **Step 1: Extract `ValidationTuple`**

Insert a new $def *before* `MappingEntry` (alphabetical-ish):

```json
"ValidationTuple": {
  "type": "object",
  "required": ["profile", "blocking", "persistence"],
  "properties": {
    "profile": { "$ref": "#/$defs/ValidationProfile" },
    "blocking": { "$ref": "#/$defs/BlockingPolicy" },
    "persistence": { "$ref": "#/$defs/PersistencePolicy" }
  },
  "allOf": [
    {
      "if": {
        "properties": { "persistence": { "const": "complete-response" } },
        "required": ["persistence"]
      },
      "then": {
        "properties": {
          "profile": { "const": "on-submit" },
          "blocking": { "const": "block-on-error" }
        }
      }
    },
    {
      "not": {
        "properties": {
          "profile": { "const": "off" },
          "blocking": { "const": "block-on-error" }
        },
        "required": ["profile", "blocking"]
      }
    },
    {
      "if": {
        "properties": { "blocking": { "const": "block-on-error" } },
        "required": ["blocking"]
      },
      "then": {
        "properties": {
          "persistence": { "const": "complete-response" }
        }
      }
    }
  ],
  "description": "The (profile, blocking, persistence) triple defined by VM §3-§5 with the §6.3 validity predicate enforced as schema-level constraints. The allOf entries enforce the four §6.3 conjuncts — block-on-error and complete-response are co-required; complete-response requires on-submit profile; off profile excludes block-on-error. Consumers MUST $ref this $def whenever a tuple is carried.",
  "examples": [
    { "profile": "on-submit", "blocking": "block-on-error", "persistence": "complete-response" }
  ],
  "x-lm": {
    "critical": true,
    "intent": "Single carrier of the §6.3 validity predicate; every override consumer MUST $ref this $def"
  }
}
```

- [ ] **Step 2: Refactor `MappingEntry` to compose**

Replace the existing `MappingEntry` $def with:

```json
"MappingEntry": {
  "type": "object",
  "required": ["intent", "profile", "blocking", "persistence"],
  "additionalProperties": false,
  "properties": {
    "intent": {
      "anyOf": [
        { "$ref": "#/$defs/ActionIntent" },
        {
          "type": "string",
          "pattern": "^x-",
          "description": "Publisher-defined action intent extension. MUST carry an explicit mapping tuple and MUST NOT shadow a master-table intent."
        }
      ]
    },
    "profile": { "$ref": "#/$defs/ValidationProfile" },
    "blocking": { "$ref": "#/$defs/BlockingPolicy" },
    "persistence": { "$ref": "#/$defs/PersistencePolicy" }
  },
  "allOf": [
    { "$ref": "#/$defs/ValidationTuple" }
  ],
  "description": "A single row of the master mapping table. Composes ValidationTuple (predicate carrier) with the intent slot. Response Actions overrides use ValidationTuple directly (no intent slot at override time).",
  "examples": [
    { "intent": "submit", "profile": "on-submit", "blocking": "block-on-error", "persistence": "complete-response" },
    { "intent": "x-acme-bulk-import", "profile": "on-submit", "blocking": "block-on-error", "persistence": "complete-response" }
  ],
  "x-lm": {
    "critical": true,
    "intent": "Master-table row; composes ValidationTuple + intent. Predicate enforcement delegated to ValidationTuple."
  }
}
```

The duplicate `properties` for `profile`/`blocking`/`persistence` is intentional: `additionalProperties: false` at `MappingEntry` requires every permitted property to be enumerated at the entry level. The `$ref: ValidationTuple` in `allOf` re-enforces the predicate; `ValidationTuple` itself OMITS `additionalProperties: false` so that composition with `MappingEntry` (which adds `intent`) does not reject the additional property at the `ValidationTuple` evaluation site.

JSON Schema 2020-12 evaluates `additionalProperties` relative to each subschema's own `properties` — it does NOT propagate across `allOf` siblings. If `ValidationTuple` carried `additionalProperties: false`, the `$ref` evaluation would see `intent` as an additional property and reject every master-table row. The closure constraint lives on `MappingEntry` instead (the composing schema); `ValidationTuple` is closed by virtue of its `required: [profile, blocking, persistence]` + the enum constraints on each — no extra properties can pass a downstream `additionalProperties: false` if a consumer adds one.

Alternative composition idiom (also valid): drop `additionalProperties: false` from `MappingEntry` and add `unevaluatedProperties: false`. `unevaluatedProperties` DOES propagate across `allOf` and would let `ValidationTuple` keep its closure. Either pattern works; the recommendation here is the former because it minimizes 2020-12 keyword surface for existing schema readers.

- [ ] **Step 3: Schema well-formed**

```bash
cd formspec && node -e "
const Ajv = require('ajv/dist/2020');
const draft = require('ajv/dist/refs/json-schema-2020-12/schema.json');
const ajv = new Ajv({strict: false, allErrors: true});
const schema = JSON.parse(require('fs').readFileSync('schemas/validation-mapping.schema.json'));
const ok = ajv.compile(draft)(schema);
if (!ok) { console.error(JSON.stringify(ajv.errors, null, 2)); process.exit(1); }
console.log('OK');
"
```

Expected: `OK`.

- [ ] **Step 4: Run the red tests — expect green**

```bash
cd formspec && python3 -m pytest tests/conformance/schemas/test_validation_mapping_predicate.py -v
```

Expected: all pass.

- [ ] **Step 5: Run the existing VM table test — expect no regression**

```bash
cd formspec && python3 -m pytest tests/conformance/spec/test_validation_mapping_table.py -v
```

Expected: pass. The master table `const` is unchanged; fixture outcomes should not regress. Override tuple validation is intentionally tighter because of Task 0's fourth predicate clause.

- [ ] **Step 6: Commit**

```bash
cd formspec && git add schemas/validation-mapping.schema.json
git commit -m "refactor(schema): extract VM ValidationTuple \$def; MappingEntry composes

VM §6.3 predicate now lives in one place. Response Actions
ValidationOverride and any future override consumer \$ref the same
\$def and inherit the predicate at schema-validate time. MappingEntry
behavior unchanged via allOf composition."
```

---

## Task 3: Contract-surface test wiring

**Files:**
- Modify: `tests/contracts/surface-coverage.json`
- Modify: `scripts/run-contract-surface-tests.mjs`

- [ ] **Step 1: Add the predicate test to the ledger row**

In `tests/contracts/surface-coverage.json`, update the `validation-mapping.conformance` array to include:

```json
"tests/conformance/schemas/test_validation_mapping_predicate.py"
```

The row is already `status: enforced`; this new path makes the predicate-reuse proof visible in the same inventory as the schema and table tests.

- [ ] **Step 2: Run Validation Mapping conformance in the focused gate**

In `scripts/run-contract-surface-tests.mjs`, add these paths to the first `runPython([...])` block:

```js
'tests/conformance/schemas/test_validation_mapping_schema.py',
'tests/conformance/schemas/test_validation_mapping_predicate.py',
'tests/conformance/spec/test_validation_mapping_table.py',
```

These are Python/schema-only checks, so they belong in both `test:contract-surfaces` and `test:contract-surfaces:metadata`. This prevents the Validation Mapping row from becoming inventory-only again.

- [ ] **Step 3: Run**

```bash
cd formspec && npm run test:contract-surfaces:metadata
cd formspec && npm run test:contract-surfaces
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
cd formspec && git add tests/contracts/surface-coverage.json scripts/run-contract-surface-tests.mjs
git commit -m "test(contracts): run Validation Mapping predicate parity"
```

---

## Task 4: Regenerate docs + full sweep

- [ ] **Step 1: Regenerate**

```bash
cd formspec && npm run docs:generate && npm run docs:filemap && npm run docs:check
```

Expected: pass. If `docs:check` complains about the new $def missing `description` + `examples` (per the `x-lm.critical=true` rule), revisit Task 2 Step 1 — the `ValidationTuple` $def already includes both per the spec.

- [ ] **Step 2: Full conformance sweep**

```bash
cd formspec && python3 -m pytest tests/conformance/ -v
```

Expected: no regressions.

- [ ] **Step 3: Commit generated**

```bash
cd formspec && git add filemap.json specs/
git commit -m "build(docs): regenerate VM artifacts post ValidationTuple refactor"
```

---

## Sequencing Recap

```
Task 1: red tests                    (test)
Task 2: schema refactor              (schema)
Task 3: contract-surface test wiring (test)
Task 4: regenerate + sweep           (build)
```

This plan MUST land before the Response Actions plan's `ValidationOverride` schema (RA-plan Task 12). After this lands, RA-plan §6.2 / Task 12 changes `ValidationOverride` to:

```json
"ValidationOverride": {
  "$ref": "validation-mapping.schema.json#/$defs/ValidationTuple",
  "description": "Per-action override of the master-table triple. Predicate enforced via $ref."
}
```

— a one-line change instead of inlining `allOf` predicate clauses.

## Out-of-scope reminders

- **Do not add any predicate clauses beyond Task 0's four-clause predicate.** The planned tightening is intentional; further tightening needs a separate review.
- **Do not remove `MappingEntry`'s explicit properties block.** `additionalProperties: false` requires it.
- **Do not move `ValidationTuple` to a separate schema file.** Adding cross-file `$ref` complicates consumer wiring; the $def belongs in the schema that owns the predicate.
- **Do not introduce a "lenient" tuple variant** that skips the predicate. Either a tuple is valid (predicate passes) or it is rejected.

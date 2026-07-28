"""Schema conformance corpus for the Needs specification (`specs/needs/needs-spec.md`).

Fixtures live under tests/conformance/fixtures/needs/*.case.json and carry two
independent verdicts per case:

* ``expectSchemaValid`` — owned here. Whether the Needs Document validates
  against ``schemas/needs.schema.json``. ``null`` means the case pairs no
  document at all (S2.1 unpaired), so there is nothing to validate.
* ``expectedCodes`` — owned by ``@formspec-org/app-graph``'s
  ``validateNeedsCoverage``. Carried in the fixture so the checker half of
  S9.4 reads the same corpus rather than forking one; replayed against the
  real function by
  ``packages/formspec-app-graph/tests/needs-coverage-corpus.test.ts``.

The two verdicts diverge on exactly the S6 rules JSON Schema cannot express —
uniqueness over a keyed field, cross-record supersession, cross-array journey
resolution. Those rows carry a ``note`` saying so; see
``test_divergent_verdicts_are_documented``.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012


ROOT = Path(__file__).resolve().parents[2]
FIXTURE_DIR = ROOT / "tests" / "conformance" / "fixtures" / "needs"
SCHEMAS_DIR = ROOT / "schemas"
SPEC_PATH = ROOT / "specs" / "needs" / "needs-spec.md"

COMMON_SCHEMA = json.loads((SCHEMAS_DIR / "common.schema.json").read_text(encoding="utf-8"))
NEEDS_SCHEMA = json.loads((SCHEMAS_DIR / "needs.schema.json").read_text(encoding="utf-8"))
EXPERIENCE_SCHEMA = json.loads((SCHEMAS_DIR / "experience.schema.json").read_text(encoding="utf-8"))

REGISTRY = Registry().with_resources([
    (COMMON_SCHEMA["$id"], Resource.from_contents(COMMON_SCHEMA, default_specification=DRAFT202012)),
    (NEEDS_SCHEMA["$id"], Resource.from_contents(NEEDS_SCHEMA, default_specification=DRAFT202012)),
    (EXPERIENCE_SCHEMA["$id"], Resource.from_contents(EXPERIENCE_SCHEMA, default_specification=DRAFT202012)),
])
VALIDATOR = Draft202012Validator(NEEDS_SCHEMA, registry=REGISTRY)
EXPERIENCE_VALIDATOR = Draft202012Validator(EXPERIENCE_SCHEMA, registry=REGISTRY)

# The live v1 diagnostic set (S9.4). Reserved codes (S9.5) are absent by
# construction: a fixture naming one fails `test_reserved_codes_are_never_expected`.
LIVE_CODES = {
    "NEED-GROUND-001",
    "NEED-DOC-001",
    "NEED-REF-001",
    "NEED-COVERAGE-001",
    "NEED-COVERAGE-002",
}
RESERVED_CODES = {"NEED-STALE-001", "NEED-ORPHAN-001"}

# Codes whose fire condition the schema can also refuse: the grounding `oneOf`
# (S12) and the origin/status `allOf` conditionals. Everything else in S6 is a
# document-scope predicate JSON Schema has no way to state.
SCHEMA_EXPRESSIBLE_CODES = {"NEED-GROUND-001", "NEED-DOC-001"}

# One per S9.4 fire / does-not-fire row, plus the reserved-code pair, the
# unpaired row, and Appendix A run end to end.
REQUIRED_CASES = {
    "valid-both-grounding-channels",
    "valid-ungrounded-reason-on-adopted-need",
    "invalid-need-without-grounding-or-reason",
    "invalid-need-with-both-grounding-and-reason",
    "invalid-need-with-empty-grounding-array",
    "invalid-ai-proposed-without-proposed-by",
    "invalid-adopted-without-adopted-by",
    "invalid-ai-proposed-adopted-by-ai-agent",
    "valid-ai-proposed-adopted-by-human",
    "valid-withdrawn-ai-proposed-never-adopted",
    "invalid-duplicate-need-id",
    "invalid-duplicate-journey-id",
    "invalid-supersedes-unknown-id",
    "invalid-supersedes-target-not-superseded",
    "invalid-superseded-without-successor",
    "invalid-superseded-with-multiple-successors",
    "valid-supersession-chain",
    "invalid-journey-unresolved",
    "valid-journeys-absent-free-grouping-strings",
    "invalid-unresolved-need-ref",
    "valid-need-ref-to-withdrawn-need",
    "valid-unit-with-unresolved-ref-is-still-justified",
    "warning-adopted-need-unserved",
    "valid-adopted-need-served-by-anchor-only",
    "valid-proposed-need-outside-partition",
    "info-unit-without-need-refs",
    "valid-unpaired-emits-nothing",
    "valid-stale-anchor-does-not-emit-reserved-code",
    "valid-anchor-to-withdrawn-need-does-not-emit-reserved-code",
    "appendix-a-worked-example",
}


def _fixture_cases() -> list[tuple[Path, dict[str, Any]]]:
    return [
        (path, json.loads(path.read_text(encoding="utf-8")))
        for path in sorted(FIXTURE_DIR.glob("*.case.json"))
    ]


def test_needs_fixture_corpus_covers_required_cases() -> None:
    present = {case["id"] for _, case in _fixture_cases()}
    missing = REQUIRED_CASES - present
    assert not missing, f"missing needs fixture cases: {sorted(missing)}"


@pytest.mark.parametrize(
    ("path", "case"),
    _fixture_cases(),
    ids=[case["id"] for _, case in _fixture_cases()],
)
def test_needs_schema_fixture_corpus(path: Path, case: dict[str, Any]) -> None:
    assert case["id"] == path.name.removesuffix(".case.json"), (
        f"{path.name}: case id must match the filename stem"
    )
    unknown = set(case["expectedCodes"]) - LIVE_CODES
    assert not unknown, f"{case['id']}: unknown expectedCodes {sorted(unknown)}"

    document = case["needsDocument"]
    if case["expectSchemaValid"] is None:
        assert document is None, (
            f"{case['id']}: expectSchemaValid null means no paired document (S2.1); "
            "a document is present"
        )
        return

    errors = sorted(VALIDATOR.iter_errors(document), key=lambda e: e.json_path)
    if case["expectSchemaValid"]:
        assert not errors, (
            f"{case['id']}: expected schema-valid, got "
            f"{[(e.json_path, e.message) for e in errors]} from {path.name}"
        )
    else:
        assert errors, (
            f"{case['id']}: expected schema-invalid, but the document validated "
            f"({case['specRow']}) from {path.name}"
        )


@pytest.mark.parametrize(
    ("path", "case"),
    [(p, c) for p, c in _fixture_cases() if "experience" in c.get("bundle", {})],
    ids=[c["id"] for _, c in _fixture_cases() if "experience" in c.get("bundle", {})],
)
def test_fixture_experience_fragments_validate_against_experience_units(
    path: Path, case: dict[str, Any]
) -> None:
    """Every fixture's Experience fragment must be a conformant Experience Document.

    `needRefs` is a real `experience.schema.json` addition, not a fixture-local
    convenience: a corpus whose units would be refused by the shipped schema
    would prove the coverage predicate over documents no author can write.
    """
    fragment = {
        "$formspecExperience": "1.0",
        "version": "1.0.0",
        "actors": [{"id": "applicant", "title": "The Applicant"}],
        **case["bundle"]["experience"],
    }
    errors = sorted(EXPERIENCE_VALIDATOR.iter_errors(fragment), key=lambda e: e.json_path)
    assert not errors, (
        f"{case['id']}: Experience fragment is not schema-valid: "
        f"{[(e.json_path, e.message) for e in errors]} from {path.name}"
    )


def test_reserved_codes_are_never_expected() -> None:
    """S9.5 codes are registered, not implemented. No fixture may expect one.

    If a later revision implements NEED-STALE-001 or NEED-ORPHAN-001, this test
    fails and the implementer must move the code out of RESERVED_CODES
    deliberately rather than have a fixture quietly start expecting it.
    """
    for _, case in _fixture_cases():
        overlap = set(case["expectedCodes"]) & RESERVED_CODES
        assert not overlap, (
            f"{case['id']}: expects reserved code(s) {sorted(overlap)}; "
            "needs-spec S11.3.4 forbids v1 processors from emitting them"
        )


# Schema and checker agree when the schema-expressible half of the verdict
# matches: a schema-invalid document names at least one code the schema itself
# refuses, and a schema-valid document names none. Bundle-side codes
# (NEED-REF-001, NEED-COVERAGE-*) never enter the comparison — the schema never
# sees a bundle, so a coverage finding on a valid document is not a divergence.
def _agrees(case: dict[str, Any]) -> bool:
    schema_owned = set(case["expectedCodes"]) & SCHEMA_EXPRESSIBLE_CODES
    if case["expectSchemaValid"] is None:
        return not schema_owned
    return bool(schema_owned) == (not case["expectSchemaValid"])


def test_divergent_verdicts_are_documented() -> None:
    """A schema verdict that disagrees with the checker verdict MUST say why.

    These are the S6 rules assigned to one layer because the other cannot carry
    them: id uniqueness, supersession integrity, and journey resolution are
    document-scope predicates JSON Schema has no keyword for. An undocumented
    divergence is a drift bug, not a design choice.
    """
    for path, case in _fixture_cases():
        if _agrees(case):
            continue
        assert case.get("note"), (
            f"{case['id']}: schema and checker verdicts diverge "
            f"(schemaValid={case['expectSchemaValid']}, codes={case['expectedCodes']}) "
            f"with no `note` explaining why — see {path.name}"
        )


def test_document_scope_rules_are_not_schema_expressible() -> None:
    """Pins the known gap: S6 rules 1–3 refuse documents the schema admits.

    If a future schema rev closes any of them, this test fails and the fixture's
    `expectSchemaValid` flips with it — the gap never closes silently.
    """
    by_id = {case["id"]: case for _, case in _fixture_cases()}
    for case_id in (
        "invalid-duplicate-need-id",
        "invalid-duplicate-journey-id",
        "invalid-supersedes-unknown-id",
        "invalid-supersedes-target-not-superseded",
        "invalid-superseded-without-successor",
        "invalid-superseded-with-multiple-successors",
        "invalid-journey-unresolved",
    ):
        case = by_id[case_id]
        assert case["expectSchemaValid"] is True, f"{case_id}: expected schema-valid"
        assert "NEED-DOC-001" in case["expectedCodes"], f"{case_id}: expected NEED-DOC-001"
        assert not list(VALIDATOR.iter_errors(case["needsDocument"])), (
            f"{case_id}: the schema now refuses this document; move the case's "
            "expectSchemaValid to false and update the divergence note"
        )


def test_spec_section_12_block_matches_the_landed_schema() -> None:
    """S12 reproduces the schema in full. A drifted copy is a lying spec."""
    spec = SPEC_PATH.read_text(encoding="utf-8")
    start = spec.index("## 12. Schema")
    fence = spec.index("```json", start)
    body = spec[fence + len("```json") : spec.index("```", fence + len("```json"))]
    assert json.loads(body) == NEEDS_SCHEMA, (
        "specs/needs/needs-spec.md S12 no longer reproduces schemas/needs.schema.json"
    )

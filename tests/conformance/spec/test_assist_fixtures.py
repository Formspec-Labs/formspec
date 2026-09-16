"""Shape corpus for the Assist conformance fixtures (`specs/assist/assist-spec.md` draft.3).

Fixtures live under `tests/conformance/fixtures/assist/*.json`, one per draft.3 MUST clause (see the
`spec` field of each). This suite cannot execute the TypeScript `AssistProvider` the fixtures are written
against, so it validates the corpus is well-formed: every fixture carries the required `$formspecAssistFixture`
envelope, its `call` names a `formspec.*` tool, its `expect` is exactly a `result` or an `error` (never both),
and every embedded or `definitionRef`'d Formspec document (Definition, References, Ontology, Registry) is
itself schema-valid — a conformant second implementation binds these same files to real Formspec documents,
so a malformed sidecar here would silently test nothing.

`packages/formspec-assist/tests/conformance-fixtures.test.ts` is the counterpart that actually drives the
fixtures through the real provider and checks `expect` against what it returns.

Known schema gap this suite tolerates deliberately (see `_EXCERPT_IS_A_KNOWN_SCHEMA_GAP` below): the Assist
spec's `ReferenceEntry.excerpt` (§5.1) has no authoring path in `schemas/references.schema.json` or
`specs/core/references-spec.md` — the core References schema does not list `excerpt` as a bound-reference
property. The reference `AssistProvider` reads `entry.excerpt` off the raw loaded document regardless (schema
validity is not enforced at that call site), so `excerpt` "works" today, but a References Document authored
with it and run through `formspec.validate` would be rejected. This is a real spec/schema drift, not a
fixture bug; closing it belongs to a references-spec/schema change out of this corpus's scope. Fixtures that
need `excerpt` (§5.1, §5.2) are validated against the schema with exactly this one gap allowed, so any other
schema violation in those documents still fails loudly.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from jsonschema import Draft202012Validator
from jsonschema.exceptions import ValidationError
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

ROOT = Path(__file__).resolve().parents[3]
FIXTURE_DIR = ROOT / "tests" / "conformance" / "fixtures" / "assist"
SCHEMAS_DIR = ROOT / "schemas"
SPEC_PATH = ROOT / "specs" / "assist" / "assist-spec.md"

COMMON_SCHEMA = json.loads((SCHEMAS_DIR / "common.schema.json").read_text(encoding="utf-8"))
DEFINITION_SCHEMA = json.loads((SCHEMAS_DIR / "definition.schema.json").read_text(encoding="utf-8"))
REFERENCES_SCHEMA = json.loads((SCHEMAS_DIR / "references.schema.json").read_text(encoding="utf-8"))
ONTOLOGY_SCHEMA = json.loads((SCHEMAS_DIR / "ontology.schema.json").read_text(encoding="utf-8"))
REGISTRY_SCHEMA = json.loads((SCHEMAS_DIR / "registry.schema.json").read_text(encoding="utf-8"))

_REGISTRY = Registry().with_resources([
    (schema["$id"], Resource.from_contents(schema, default_specification=DRAFT202012))
    for schema in (COMMON_SCHEMA, DEFINITION_SCHEMA, REFERENCES_SCHEMA, ONTOLOGY_SCHEMA, REGISTRY_SCHEMA)
])
DEFINITION_VALIDATOR = Draft202012Validator(DEFINITION_SCHEMA, registry=_REGISTRY)
REFERENCES_VALIDATOR = Draft202012Validator(REFERENCES_SCHEMA, registry=_REGISTRY)
ONTOLOGY_VALIDATOR = Draft202012Validator(ONTOLOGY_SCHEMA, registry=_REGISTRY)
REGISTRY_VALIDATOR = Draft202012Validator(REGISTRY_SCHEMA, registry=_REGISTRY)


def _EXCERPT_IS_A_KNOWN_SCHEMA_GAP(error: ValidationError) -> bool:
    """True for exactly the `excerpt`-is-unexpected `additionalProperties` error described above."""
    return error.validator == "additionalProperties" and "excerpt" in str(error.message)


def _references_errors(document: dict[str, Any]) -> list[ValidationError]:
    errors = sorted(REFERENCES_VALIDATOR.iter_errors(document), key=lambda e: e.json_path)
    return [error for error in errors if not _EXCERPT_IS_A_KNOWN_SCHEMA_GAP(error)]


REQUIRED_CASES = {
    "3.3-option-label-resolves-case-insensitively.json",
    "3.3-option-label-ambiguous-rejected.json",
    "3.5-apply-by-paths-decides-skip-reasons-before-confirmation.json",
    "3.5-apply-by-paths-not-relevant-skip.json",
    "4.2-not-found-error-shape.json",
    "4.3-compare-and-set-refuses-stale-expected.json",
    "4.3-compare-and-set-accepts-matching-expected.json",
    "5.1-help-projects-wire-keys-without-content-by-default.json",
    "5.1-help-includes-content-when-requested.json",
    "5.2-cap-degrades-content-and-excerpt-before-dropping.json",
    "5.2-cap-drops-lowest-tier-tail-of-document-order-first.json",
    "5.3-registry-entry-merge-supplies-definition-and-fallbacks.json",
    "5.3-registry-entry-merge-fails-closed-on-contested-uri.json",
    "6.1-profile-match-exact-concept-wire-shape.json",
    "6.1-profile-match-close-equivalent-wire-shape.json",
}

# One representative fixture per MUST clause the ticket (fs-czl0) named. A clause with no fixture
# citing it here is a coverage gap in the corpus, not just a missing filename.
REQUIRED_SPEC_CITATIONS = {"§3.3", "§3.5", "§4.2", "§4.3 rule 6", "§5.1", "§5.2", "§5.3 step 1", "§6.1"}

VALID_PROFILE_SOURCE_TYPES = {"form-fill", "manual", "import", "extension"}
VALID_WRITE_SOURCES = {"user", "assist"}


def _fixture_files() -> list[Path]:
    return sorted(p for p in FIXTURE_DIR.glob("*.json") if p.parent == FIXTURE_DIR)


def _load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _resolve_definition(fixture: dict[str, Any]) -> dict[str, Any]:
    if "definition" in fixture:
        assert "definitionRef" not in fixture, "a fixture carries either definition or definitionRef, not both"
        return fixture["definition"]
    assert "definitionRef" in fixture, "fixture carries neither definition nor definitionRef"
    ref_path = FIXTURE_DIR / fixture["definitionRef"]
    assert ref_path.is_file(), f"definitionRef does not resolve to a file: {fixture['definitionRef']}"
    return _load(ref_path)


def test_fixture_corpus_covers_required_cases() -> None:
    present = {path.name for path in _fixture_files()}
    missing = REQUIRED_CASES - present
    assert not missing, f"missing assist fixture cases: {sorted(missing)}"


def test_fixture_ids_are_unique() -> None:
    names = [path.name for path in _fixture_files()]
    assert len(names) == len(set(names))


def test_every_required_must_clause_has_a_citing_fixture() -> None:
    cited = {_load(path)["spec"] for path in _fixture_files()}
    missing = REQUIRED_SPEC_CITATIONS - cited
    assert not missing, f"no fixture cites required clause(s): {sorted(missing)}"


@pytest.mark.parametrize("path", _fixture_files(), ids=lambda p: p.name)
def test_fixture_envelope_shape(path: Path) -> None:
    fixture = _load(path)

    assert fixture.get("$formspecAssistFixture") == "1.0", f"{path.name}: missing/wrong $formspecAssistFixture"
    assert isinstance(fixture.get("title"), str) and fixture["title"], f"{path.name}: title must be a non-empty string"
    assert isinstance(fixture.get("spec"), str) and fixture["spec"].startswith("§"), f"{path.name}: spec must cite a §-prefixed clause"
    assert ("definition" in fixture) ^ ("definitionRef" in fixture), f"{path.name}: exactly one of definition/definitionRef"

    call = fixture.get("call")
    assert isinstance(call, dict), f"{path.name}: call must be an object"
    assert isinstance(call.get("tool"), str) and call["tool"].startswith("formspec."), (
        f"{path.name}: call.tool must be a formspec.* tool name"
    )
    assert isinstance(call.get("input"), dict), f"{path.name}: call.input must be an object"

    expect = fixture.get("expect")
    assert isinstance(expect, dict), f"{path.name}: expect must be an object"
    assert ("result" in expect) ^ ("error" in expect), f"{path.name}: expect must carry exactly one of result/error"
    if "error" in expect:
        error = expect["error"]
        assert isinstance(error, dict), f"{path.name}: expect.error must be an object"
        assert isinstance(error.get("code"), str) and error["code"], f"{path.name}: expect.error.code must be a non-empty string"
        assert isinstance(error.get("retryable"), bool), f"{path.name}: expect.error.retryable must be a bool"
        if "path" in error:
            assert isinstance(error["path"], str), f"{path.name}: expect.error.path must be a string"
    else:
        assert isinstance(expect["result"], dict), f"{path.name}: expect.result must be an object"

    setup = fixture.get("setup")
    if setup is not None:
        assert isinstance(setup, dict), f"{path.name}: setup must be an object"
        if "writes" in setup:
            assert isinstance(setup["writes"], list) and setup["writes"], f"{path.name}: setup.writes must be a non-empty array"
            for write in setup["writes"]:
                assert isinstance(write, dict), f"{path.name}: each setup.writes[] entry must be an object"
                assert isinstance(write.get("path"), str) and write["path"], f"{path.name}: setup.writes[].path must be a non-empty string"
                assert "value" in write, f"{path.name}: setup.writes[].value is required (may be null)"
                assert write.get("source") in VALID_WRITE_SOURCES, (
                    f"{path.name}: setup.writes[].source must be one of {sorted(VALID_WRITE_SOURCES)}"
                )
        if "confirm" in setup:
            assert isinstance(setup["confirm"], bool), f"{path.name}: setup.confirm must be a bool"


@pytest.mark.parametrize("path", _fixture_files(), ids=lambda p: p.name)
def test_fixture_definition_is_schema_valid(path: Path) -> None:
    fixture = _load(path)
    definition = _resolve_definition(fixture)
    errors = sorted(DEFINITION_VALIDATOR.iter_errors(definition), key=lambda e: e.json_path)
    assert not errors, f"{path.name}: definition is not schema-valid: {[(e.json_path, e.message) for e in errors]}"


@pytest.mark.parametrize("path", [p for p in _fixture_files() if "references" in _load(p)], ids=lambda p: p.name)
def test_fixture_references_document_is_schema_valid(path: Path) -> None:
    fixture = _load(path)
    errors = _references_errors(fixture["references"])
    assert not errors, f"{path.name}: references document is not schema-valid: {[(e.json_path, e.message) for e in errors]}"


@pytest.mark.parametrize("path", [p for p in _fixture_files() if "ontology" in _load(p)], ids=lambda p: p.name)
def test_fixture_ontology_document_is_schema_valid(path: Path) -> None:
    fixture = _load(path)
    errors = sorted(ONTOLOGY_VALIDATOR.iter_errors(fixture["ontology"]), key=lambda e: e.json_path)
    assert not errors, f"{path.name}: ontology document is not schema-valid: {[(e.json_path, e.message) for e in errors]}"


@pytest.mark.parametrize("path", [p for p in _fixture_files() if "registries" in _load(p)], ids=lambda p: p.name)
def test_fixture_registry_documents_are_schema_valid(path: Path) -> None:
    fixture = _load(path)
    registries = fixture["registries"]
    assert isinstance(registries, list) and registries, f"{path.name}: registries must be a non-empty array"
    for index, registry_document in enumerate(registries):
        errors = sorted(REGISTRY_VALIDATOR.iter_errors(registry_document), key=lambda e: e.json_path)
        assert not errors, f"{path.name}: registries[{index}] is not schema-valid: {[(e.json_path, e.message) for e in errors]}"


@pytest.mark.parametrize("path", [p for p in _fixture_files() if "profile" in _load(p)], ids=lambda p: p.name)
def test_fixture_profile_has_the_assist_spec_shape(path: Path) -> None:
    """`UserProfile` is Assist-owned (§6.1) — no core JSON Schema exists for it (assist-spec.md §1.2 design
    note: Assist defines no single canonical top-level document schema). This checks the §6.1 structural
    contract by hand instead."""
    profile = _load(path)["profile"]
    for key in ("id", "label", "created", "updated", "concepts", "fields"):
        assert key in profile, f"{path.name}: profile missing required key '{key}'"
    assert isinstance(profile["concepts"], dict) and isinstance(profile["fields"], dict)
    for bucket_name in ("concepts", "fields"):
        for key, entry in profile[bucket_name].items():
            assert "value" in entry, f"{path.name}: profile.{bucket_name}['{key}'] missing value"
            assert isinstance(entry.get("confidence"), (int, float)), f"{path.name}: profile.{bucket_name}['{key}'].confidence must be numeric"
            assert isinstance(entry.get("lastUsed"), str), f"{path.name}: profile.{bucket_name}['{key}'].lastUsed must be a string"
            assert isinstance(entry.get("verified"), bool), f"{path.name}: profile.{bucket_name}['{key}'].verified must be a bool"
            source = entry.get("source")
            assert isinstance(source, dict) and source.get("type") in VALID_PROFILE_SOURCE_TYPES, (
                f"{path.name}: profile.{bucket_name}['{key}'].source.type must be one of {sorted(VALID_PROFILE_SOURCE_TYPES)}"
            )


def test_excerpt_gap_is_still_present_in_the_references_schema() -> None:
    """Tripwire: if `schemas/references.schema.json` grows an `excerpt` property, the allowance in
    `_EXCERPT_IS_A_KNOWN_SCHEMA_GAP` becomes dead code hiding a real regression path. This fails loudly the
    day that schema is fixed, so the allowance gets deleted deliberately rather than forgotten."""
    bound_reference = REFERENCES_SCHEMA["$defs"]["BoundReference"]
    assert "excerpt" not in bound_reference.get("properties", {}), (
        "schemas/references.schema.json now defines 'excerpt' — remove _EXCERPT_IS_A_KNOWN_SCHEMA_GAP "
        "from tests/conformance/spec/test_assist_fixtures.py, it is no longer needed"
    )


def test_spec_has_a_conformance_fixtures_subsection_pointing_at_the_corpus() -> None:
    spec = SPEC_PATH.read_text(encoding="utf-8")
    assert "Conformance Fixtures" in spec, "assist-spec.md is missing a 'Conformance Fixtures' subsection"
    assert "tests/conformance/fixtures/assist" in spec, (
        "assist-spec.md's Conformance fixtures subsection must point at tests/conformance/fixtures/assist"
    )

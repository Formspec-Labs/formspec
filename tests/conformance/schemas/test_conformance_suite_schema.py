"""Schema conformance checks for shared cross-runtime suite case files."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

from tests.unit.support.schema_fixtures import load_schema


ROOT_DIR = Path(__file__).resolve().parents[3]
SUITE_DIR = ROOT_DIR / "tests" / "conformance" / "suite"
MANIFEST_PATH = SUITE_DIR / "real-examples.manifest.json"
CORE_SPEC_PATH = ROOT_DIR / "specs" / "core" / "spec.md"


def _core_reserved_codes() -> list[str]:
    """Codes in core spec §2.5.1's RESERVED table, in table order."""
    text = CORE_SPEC_PATH.read_text(encoding="utf-8")
    table = text.split("The following codes are RESERVED.", 1)[1].split("\n\n", 2)[1]
    return re.findall(r"^\| `([A-Z_]+)` \|", table, flags=re.MULTILINE)


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def conformance_suite_schema() -> dict:
    return load_schema("conformance-suite.schema.json")


def test_suite_cases_validate_against_schema(conformance_suite_schema: dict) -> None:
    validator = Draft202012Validator(conformance_suite_schema)
    for case_path in sorted(SUITE_DIR.glob("*.json")):
        if case_path.name == MANIFEST_PATH.name:
            continue
        validator.validate(_load_json(case_path))


def test_manifest_references_real_case_files() -> None:
    manifest = _load_json(MANIFEST_PATH)
    listed = manifest.get("caseFiles", [])
    assert isinstance(listed, list)
    assert listed
    for rel_name in listed:
        assert (SUITE_DIR / rel_name).is_file(), rel_name


def test_non_fel_case_requires_payload_or_input_data(conformance_suite_schema: dict) -> None:
    validator = Draft202012Validator(conformance_suite_schema)
    invalid_case = {
        "id": "invalid.no_payload",
        "kind": "VALIDATION_REPORT",
        "definitionPath": "examples/grant-application/definition.json",
        "expected": {"valid": True, "counts": {"error": 0, "warning": 0, "info": 0}, "results": []},
        "legacyCoverage": [{"path": "tests/example.py", "check": "X"}],
    }
    with pytest.raises(ValidationError):
        validator.validate(invalid_case)


def test_standard_validation_codes_include_core_reserved_codes(conformance_suite_schema: dict) -> None:
    """Core §2.5.1 reserved codes are standard codes both runtimes emit identically."""
    reserved = _core_reserved_codes()
    assert "CONSTRAINT_PARSE_ERROR" in reserved, reserved
    standard = conformance_suite_schema["$defs"]["standardValidationCode"]
    assert standard["enum"][: len(reserved)] == reserved
    assert "seven" not in standard["description"].lower()

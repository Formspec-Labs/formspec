"""Schema acceptance tests for the Experience companion spec.

Loads schemas/experience.schema.json and validates fixtures under
tests/conformance/fixtures/experience/.
"""

import json
from pathlib import Path

import jsonschema
import pytest
from jsonschema import Draft202012Validator

from tests.unit.support.schema_fixtures import build_schema_registry, load_schema


SCHEMA_PATH = Path(__file__).resolve().parents[3] / "schemas" / "experience.schema.json"
FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "experience"


@pytest.fixture(scope="module")
def schema():
    with SCHEMA_PATH.open() as f:
        return json.load(f)


@pytest.fixture(scope="module")
def validator(schema):
    common_schema = load_schema("common.schema.json")
    return Draft202012Validator(
        schema,
        registry=build_schema_registry(common_schema, schema),
    )


def _load(name: str) -> dict:
    with (FIXTURES_DIR / name).open() as f:
        return json.load(f)


class TestExperienceSchemaValid:
    def test_valid_minimal_passes(self, validator):
        doc = _load("valid-minimal.json")
        errors = list(validator.iter_errors(doc))
        assert errors == [], f"Expected no errors, got: {[e.message for e in errors]}"

    def test_valid_grant_application_passes(self, validator):
        doc = _load("valid-grant-application.json")
        errors = list(validator.iter_errors(doc))
        assert errors == [], f"Expected no errors, got: {[e.message for e in errors]}"


class TestExperienceSchemaInvalid:
    def test_missing_target_definition_rejected(self, validator):
        doc = _load("invalid-missing-target.json")
        errors = list(validator.iter_errors(doc))
        assert any("targetDefinition" in e.message for e in errors), errors

    def test_bad_unit_kind_rejected(self, validator):
        doc = _load("invalid-bad-unit-kind.json")
        errors = list(validator.iter_errors(doc))
        assert any(e.validator == "enum" or list(e.path)[-1:] == ["kind"] for e in errors), errors

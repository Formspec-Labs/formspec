"""Schema acceptance tests for the Bundle Manifest companion spec."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

from tests.unit.support.schema_fixtures import load_schema

ROOT = Path(__file__).resolve().parents[3]
FIXTURES_DIR = ROOT / "tests" / "conformance" / "fixtures" / "bundle"
BUNDLE_SCHEMA = load_schema("bundle-manifest.schema.json")


def _validator() -> Draft202012Validator:
    return Draft202012Validator(
        BUNDLE_SCHEMA,
        format_checker=Draft202012Validator.FORMAT_CHECKER,
    )


def _fixture_bundle(name: str) -> dict:
    with (FIXTURES_DIR / name).open(encoding="utf-8") as handle:
        return json.load(handle)["bundle"]


class TestBundleManifestSchemaShape:
    def test_schema_is_well_formed(self) -> None:
        Draft202012Validator.check_schema(BUNDLE_SCHEMA)

    def test_required_top_level_properties(self) -> None:
        assert set(BUNDLE_SCHEMA["required"]) == {
            "$formspecBundle",
            "version",
            "id",
            "definition",
        }

    def test_additional_properties_false(self) -> None:
        assert BUNDLE_SCHEMA["additionalProperties"] is False


class TestBundleManifestPositiveFixtures:
    def test_definition_only_validates(self) -> None:
        _validator().validate(_fixture_bundle("bundle-definition-only.json"))

    def test_full_singles_validates(self) -> None:
        _validator().validate(_fixture_bundle("bundle-full-singles.json"))

    def test_locales_and_mappings_validate(self) -> None:
        _validator().validate(_fixture_bundle("bundle-with-locales-and-mappings.json"))


class TestBundleManifestNegativeFixtures:
    def test_missing_definition_rejected(self) -> None:
        with pytest.raises(ValidationError) as excinfo:
            _validator().validate(_fixture_bundle("invalid-missing-definition.json"))
        assert "definition" in str(excinfo.value)

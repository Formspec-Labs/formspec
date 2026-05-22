"""Conformance tests for Formspec changelog.schema.json."""

from __future__ import annotations

import pytest
from jsonschema import Draft202012Validator, ValidationError

from tests.unit.support.schema_fixtures import load_schema


CHANGELOG_SCHEMA = load_schema("changelog.schema.json")


def _validator() -> Draft202012Validator:
    return Draft202012Validator(
        CHANGELOG_SCHEMA,
        format_checker=Draft202012Validator.FORMAT_CHECKER,
    )


def _validate(instance: dict) -> None:
    _validator().validate(instance)


def _minimal_changelog() -> dict:
    return {
        "$formspecChangelog": "1.0",
        "definitionUrl": "https://example.gov/forms/intake",
        "fromVersion": "1.0.0",
        "toVersion": "1.1.0",
        "semverImpact": "minor",
        "changes": [
            {
                "type": "added",
                "target": "item",
                "path": "applicantName",
                "impact": "compatible",
            }
        ],
    }


class TestChangelogSchema:
    def test_minimal_changelog_is_valid(self) -> None:
        _validate(_minimal_changelog())

    @pytest.mark.parametrize(
        "field",
        ["$formspecChangelog", "definitionUrl", "fromVersion", "toVersion", "semverImpact", "changes"],
    )
    def test_required_fields(self, field: str) -> None:
        doc = _minimal_changelog()
        del doc[field]

        with pytest.raises(ValidationError):
            _validate(doc)

    def test_change_requires_impact(self) -> None:
        doc = _minimal_changelog()
        del doc["changes"][0]["impact"]

        with pytest.raises(ValidationError):
            _validate(doc)

    def test_semver_impact_enum_is_closed(self) -> None:
        doc = _minimal_changelog()
        doc["semverImpact"] = "sideways"

        with pytest.raises(ValidationError):
            _validate(doc)

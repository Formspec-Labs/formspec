"""Schema acceptance tests for Component graph projection context evidence."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

from tests.unit.support.schema_fixtures import load_schema


SCHEMA = load_schema("component-graph-projection-context.schema.json")
FIXTURE_ROOT = Path("tests/conformance/fixtures/component-graph-projection-context")


def _validator() -> Draft202012Validator:
    return Draft202012Validator(SCHEMA)


def _valid_context() -> dict:
    return {
        "component": {
            "handle": "respondent",
            "url": "https://example.gov/apps/intake/components/respondent",
            "version": "1.0.0",
        },
        "surface": {
            "url": "https://example.gov/apps/intake/surfaces/respondent",
            "version": "1.0.0",
        },
        "route": "apply",
    }


def test_schema_is_well_formed() -> None:
    Draft202012Validator.check_schema(SCHEMA)


def test_valid_fixture_passes() -> None:
    document = json.loads((FIXTURE_ROOT / "valid-respondent-context.json").read_text())
    _validator().validate(document)


@pytest.mark.parametrize(
    "mutate",
    [
        lambda document: document.pop("component"),
        lambda document: document["component"].pop("handle"),
        lambda document: document.pop("surface"),
        lambda document: document["surface"].pop("url"),
        lambda document: document.pop("route"),
        lambda document: document.update({"sourcePath": "fixtures/respondent.component.json"}),
    ],
)
def test_required_identity_and_closed_shape(mutate) -> None:
    document = _valid_context()
    mutate(document)
    with pytest.raises(ValidationError):
        _validator().validate(document)

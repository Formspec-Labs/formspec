"""Conformance tests for Formspec references.schema.json."""

from __future__ import annotations

import pytest
from jsonschema import Draft202012Validator, ValidationError

from tests.unit.support.schema_fixtures import build_schema_registry, load_schema


COMMON_SCHEMA = load_schema("common.schema.json")
COMPONENT_SCHEMA = load_schema("component.schema.json")
REFERENCES_SCHEMA = load_schema("references.schema.json")
_REGISTRY = build_schema_registry(COMMON_SCHEMA, COMPONENT_SCHEMA, REFERENCES_SCHEMA)


def _validator() -> Draft202012Validator:
    return Draft202012Validator(
        REFERENCES_SCHEMA,
        registry=_REGISTRY,
        format_checker=Draft202012Validator.FORMAT_CHECKER,
    )


def _validate(instance: dict) -> None:
    _validator().validate(instance)


def _minimal_references() -> dict:
    return {
        "$formspecReferences": "1.0",
        "version": "1.0.0",
        "targetDefinition": {"url": "https://example.gov/forms/intake"},
        "references": [
            {
                "target": "#/items/0",
                "type": "documentation",
                "audience": "human",
                "title": "Filing guide",
                "uri": "https://example.gov/help/intake",
            }
        ],
    }


class TestReferencesSchema:
    def test_minimal_references_is_valid(self) -> None:
        _validate(_minimal_references())

    @pytest.mark.parametrize("field", ["$formspecReferences", "version", "targetDefinition", "references"])
    def test_required_fields(self, field: str) -> None:
        doc = _minimal_references()
        del doc[field]

        with pytest.raises(ValidationError):
            _validate(doc)

    def test_reference_requires_target(self) -> None:
        doc = _minimal_references()
        del doc["references"][0]["target"]

        with pytest.raises(ValidationError):
            _validate(doc)

    def test_non_namespaced_extensions_are_rejected(self) -> None:
        doc = _minimal_references()
        doc["extensions"] = {"custom": True}

        with pytest.raises(ValidationError):
            _validate(doc)


"""Conformance tests for Formspec locale.schema.json."""

from __future__ import annotations

import pytest
from jsonschema import Draft202012Validator, ValidationError

from tests.unit.support.schema_fixtures import build_schema_registry, load_schema


COMMON_SCHEMA = load_schema("common.schema.json")
COMPONENT_SCHEMA = load_schema("component.schema.json")
LOCALE_SCHEMA = load_schema("locale.schema.json")
_REGISTRY = build_schema_registry(COMMON_SCHEMA, COMPONENT_SCHEMA, LOCALE_SCHEMA)


def _validator() -> Draft202012Validator:
    return Draft202012Validator(
        LOCALE_SCHEMA,
        registry=_REGISTRY,
        format_checker=Draft202012Validator.FORMAT_CHECKER,
    )


def _validate(instance: dict) -> None:
    _validator().validate(instance)


def _minimal_locale() -> dict:
    return {
        "$formspecLocale": "1.0",
        "version": "1.0.0",
        "locale": "fr-CA",
        "targetDefinition": {"url": "https://example.gov/forms/intake"},
        "strings": {
            "$form.title": "Demande",
            "applicantName.label": "Nom du demandeur",
        },
    }


class TestLocaleSchema:
    def test_minimal_locale_is_valid(self) -> None:
        _validate(_minimal_locale())

    @pytest.mark.parametrize("field", ["$formspecLocale", "version", "locale", "targetDefinition", "strings"])
    def test_required_fields(self, field: str) -> None:
        doc = _minimal_locale()
        del doc[field]

        with pytest.raises(ValidationError):
            _validate(doc)

    def test_fallback_locale_is_valid(self) -> None:
        doc = _minimal_locale()
        doc["fallback"] = "fr"

        _validate(doc)

    def test_non_namespaced_extensions_are_rejected(self) -> None:
        doc = _minimal_locale()
        doc["extensions"] = {"custom": True}

        with pytest.raises(ValidationError):
            _validate(doc)


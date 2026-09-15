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
        "$formspecLocale": "2.0",
        "version": "1.0.0",
        "locale": "fr-CA",
        "target": {
            "kind": "definition",
            "url": "https://example.gov/forms/intake",
        },
        "strings": {
            "$form.title": "Demande",
            "applicantName.label": "Nom du demandeur",
        },
    }


class TestLocaleSchema:
    def test_minimal_locale_is_valid(self) -> None:
        _validate(_minimal_locale())

    @pytest.mark.parametrize("field", ["$formspecLocale", "version", "locale", "target", "strings"])
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

    def test_app_target_is_valid(self) -> None:
        doc = _minimal_locale()
        doc["target"] = {
            "kind": "app",
            "url": "https://example.gov/apps/intake",
            "compatibleVersions": "^2.4.0",
        }
        doc["strings"] = {
            "$module.x-formspec-surface.shell.notFoundTitle": "Introuvable"
        }

        _validate(doc)

    def test_target_definition_alias_is_rejected(self) -> None:
        doc = _minimal_locale()
        doc["targetDefinition"] = doc.pop("target")

        with pytest.raises(ValidationError):
            _validate(doc)

    @pytest.mark.parametrize("kind", ["surface", "manifest", "definition-app"])
    def test_unknown_target_kind_is_rejected(self, kind: str) -> None:
        doc = _minimal_locale()
        doc["target"]["kind"] = kind

        with pytest.raises(ValidationError):
            _validate(doc)

    def test_unknown_surface_shell_key_is_rejected(self) -> None:
        doc = _minimal_locale()
        doc["target"] = {
            "kind": "app",
            "url": "https://example.gov/apps/intake",
        }
        doc["strings"] = {
            "$module.x-formspec-surface.shell.futureAlias": "Not admitted"
        }

        with pytest.raises(ValidationError):
            _validate(doc)

    def test_surface_shell_key_requires_app_target(self) -> None:
        doc = _minimal_locale()
        doc["strings"] = {
            "$module.x-formspec-surface.shell.notFoundTitle": "Introuvable"
        }

        with pytest.raises(ValidationError):
            _validate(doc)

    def test_every_closed_surface_shell_key_is_schema_valid(self) -> None:
        shell_keys = LOCALE_SCHEMA["$defs"]["SurfaceShellStringKey"]["enum"]
        assert shell_keys and len(shell_keys) == len(set(shell_keys))
        for key in shell_keys:
            doc = _minimal_locale()
            doc["target"] = {
                "kind": "app",
                "url": "https://example.gov/apps/intake",
            }
            doc["strings"] = {key: "Texte {{locale()}}"}
            _validate(doc)


class TestLocaleFormats:
    """Locale §2.4: `formats.date` maps formatDate style names to patterns."""

    def test_date_formats_accept_the_four_style_names(self) -> None:
        doc = _minimal_locale()
        doc["formats"] = {"date": {"short": "d/M/yy", "medium": "MM/dd/yyyy", "long": "d MMMM yyyy", "full": "EEEE, MM/dd/yyyy"}}
        _validate(doc)

    def test_date_formats_reject_an_unknown_style_and_an_empty_pattern(self) -> None:
        doc = _minimal_locale()
        doc["formats"] = {"date": {"iso": "yyyy-MM-dd"}}
        with pytest.raises(ValidationError):
            _validate(doc)
        doc["formats"] = {"date": {"medium": ""}}
        with pytest.raises(ValidationError):
            _validate(doc)

    def test_formats_holds_only_date(self) -> None:
        doc = _minimal_locale()
        doc["formats"] = {"number": {"medium": "#,##0"}}
        with pytest.raises(ValidationError):
            _validate(doc)

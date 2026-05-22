"""Conformance tests for shared Party schema primitives."""

import json
from pathlib import Path

import pytest
from jsonschema import ValidationError, validate

SCHEMA = json.loads(
    (Path(__file__).parents[2] / "schemas" / "common.schema.json").read_text()
)


def _validator_for(def_name: str) -> dict:
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$defs": SCHEMA["$defs"],
        "$ref": f"#/$defs/{def_name}",
    }


def test_party_requires_name():
    with pytest.raises(ValidationError):
        validate({}, _validator_for("Party"))


def test_party_accepts_string_name():
    validate({"name": "Acme"}, _validator_for("Party"))


def test_party_accepts_langmap_name():
    validate({"name": {"en": "Acme", "es": "Acme"}}, _validator_for("Party"))


def test_langmap_rejects_bad_tag():
    with pytest.raises(ValidationError):
        validate({"english": "X"}, _validator_for("LangMap"))


def test_langmap_accepts_bcp47():
    validate(
        {"en": "X", "es-MX": "Y", "zh-Hant-TW": "Z"},
        _validator_for("LangMap"),
    )


def test_contactpoint_email_validates():
    validate(
        {"contactType": "customer support", "email": "x@y.com"},
        _validator_for("ContactPoint"),
    )

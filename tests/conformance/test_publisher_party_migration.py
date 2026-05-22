"""Conformance tests for Publisher migration to the shared Party base."""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, RefResolver

ROOT = Path(__file__).parents[2]
REG = json.loads((ROOT / "schemas" / "registry.schema.json").read_text())
COMMON = json.loads((ROOT / "schemas" / "common.schema.json").read_text())


def _v():
    store = {"https://formspec.org/schemas/common/1.0": COMMON}
    return Draft202012Validator(REG, resolver=RefResolver.from_schema(REG, store=store))


BASE = {
    "$formspecRegistry": "1.0",
    "published": "2026-05-21T00:00:00Z",
    "entries": [],
}


def test_publisher_party_form_with_homepage():
    _v().validate(
        {**BASE, "publisher": {"name": "Acme", "homepage": "https://acme"}}
    )


def test_publisher_legacy_url_still_valid():
    _v().validate(
        {
            **BASE,
            "publisher": {
                "name": "Acme",
                "url": "https://acme",
                "contact": "x@y",
            },
        }
    )


def test_publisher_with_contact_point():
    _v().validate(
        {
            **BASE,
            "publisher": {
                "name": "Acme",
                "homepage": "https://acme",
                "contactPoint": {
                    "contactType": "customer support",
                    "email": "x@y",
                },
            },
        }
    )


def test_publisher_with_langmap_name():
    _v().validate({**BASE, "publisher": {"name": {"en": "Acme", "es": "Acme"}}})


def test_publisher_requires_name():
    with pytest.raises(Exception):
        _v().validate({**BASE, "publisher": {"homepage": "https://acme"}})

"""Conformance tests for Ontology Publisher migration to Party."""

import json
from pathlib import Path

from jsonschema import Draft202012Validator, RefResolver

ROOT = Path(__file__).parents[2]
ONT = json.loads((ROOT / "schemas" / "ontology.schema.json").read_text())
COMMON = json.loads((ROOT / "schemas" / "common.schema.json").read_text())


def _v():
    store = {
        "https://formspec.org/schemas/common/1.0": COMMON,
    }
    return Draft202012Validator(ONT, resolver=RefResolver.from_schema(ONT, store=store))


BASE = {
    "$formspecOntology": "1.0",
    "version": "1.0.0",
    "targetDefinition": {"url": "https://x/forms/f"},
}


def test_publisher_party_form():
    _v().validate(
        {**BASE, "publisher": {"name": "Acme", "homepage": "https://acme"}}
    )


def test_legacy_url_form_still_valid():
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


def test_contact_point_preferred():
    _v().validate(
        {
            **BASE,
            "publisher": {
                "name": "Acme",
                "homepage": "https://acme",
                "contactPoint": [
                    {"contactType": "customer support", "email": "x@y"}
                ],
            },
        }
    )

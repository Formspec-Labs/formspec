"""Conformance tests for Definition issuer bindings."""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, RefResolver

ROOT = Path(__file__).parents[2]
DEF = json.loads((ROOT / "schemas" / "definition.schema.json").read_text())
COMMON = json.loads((ROOT / "schemas" / "common.schema.json").read_text())
ISSUER = json.loads((ROOT / "schemas" / "issuer.schema.json").read_text())


def _v():
    store = {
        "https://formspec.org/schemas/common/1.0": COMMON,
        "https://formspec.org/schemas/issuer/1.0": ISSUER,
    }
    return Draft202012Validator(DEF, resolver=RefResolver.from_schema(DEF, store=store))


MIN_DEF = {
    "$formspec": "1.0",
    "url": "https://x/forms/f",
    "version": "1.0.0",
    "status": "draft",
    "title": "Form",
    "items": [],
}

INLINE = {
    "$formspecIssuer": "1.0",
    "url": "https://x/issuer.json",
    "version": "1.0.0",
    "kind": "individual",
    "name": "Jane Smith",
}


def test_no_issuer_still_valid():
    _v().validate(MIN_DEF)


def test_issuer_inline_branch():
    _v().validate({**MIN_DEF, "issuer": INLINE})


def test_issuer_ref_branch():
    _v().validate({**MIN_DEF, "issuer": {"url": "https://x/issuer.json"}})


def test_issuer_ref_rejects_extra_props():
    with pytest.raises(Exception):
        _v().validate(
            {**MIN_DEF, "issuer": {"url": "https://x/issuer.json", "name": "x"}}
        )


def test_issuer_inline_must_be_full_doc():
    with pytest.raises(Exception):
        _v().validate(
            {
                **MIN_DEF,
                "issuer": {
                    "$formspecIssuer": "1.0",
                    "url": "x",
                    "version": "1.0.0",
                },
            }
        )

"""Conformance tests for the Response displayedIssuer audit pin."""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

ROOT = Path(__file__).parents[2]
RES = json.loads((ROOT / "schemas" / "response.schema.json").read_text())
V = Draft202012Validator(RES)

BASE = {
    "$formspecResponse": "1.0",
    "definitionUrl": "https://x/forms/f",
    "definitionVersion": "1.0.0",
    "status": "in-progress",
    "data": {},
    "authored": "2026-05-21T12:00:00Z",
}

DISPLAYED_ISSUER = {
    "url": "https://x/issuer.json",
    "version": "1.0.0",
}


def _signed_payload_preimage(response: dict) -> dict:
    return {
        key: value
        for key, value in response.items()
        if key != "authoredSignatures"
    }


def test_no_displayed_issuer_still_valid():
    V.validate(BASE)


def test_valid_displayed_issuer():
    V.validate({**BASE, "displayedIssuer": DISPLAYED_ISSUER})


def test_displayed_issuer_requires_url():
    with pytest.raises(Exception):
        V.validate({**BASE, "displayedIssuer": {"version": "1.0.0"}})


def test_displayed_issuer_requires_version():
    with pytest.raises(Exception):
        V.validate({**BASE, "displayedIssuer": {"url": "https://x/issuer.json"}})


def test_displayed_issuer_rejects_extra_props():
    with pytest.raises(Exception):
        V.validate({**BASE, "displayedIssuer": {**DISPLAYED_ISSUER, "name": "x"}})


def test_displayed_issuer_survives_signed_payload_projection():
    response = {
        **BASE,
        "displayedIssuer": DISPLAYED_ISSUER,
        "authoredSignatures": [{"signatureId": "sig-1"}],
    }

    projected = _signed_payload_preimage(response)

    assert projected["displayedIssuer"] == DISPLAYED_ISSUER
    assert "authoredSignatures" not in projected

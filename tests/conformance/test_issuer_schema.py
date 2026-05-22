"""Conformance tests for the Issuer sidecar schema."""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, RefResolver

ROOT = Path(__file__).parents[2]
ISSUER = json.loads((ROOT / "schemas" / "issuer.schema.json").read_text())
COMMON = json.loads((ROOT / "schemas" / "common.schema.json").read_text())


def _validator():
    store = {
        "https://formspec.org/schemas/issuer/1.0": ISSUER,
        "https://formspec.org/schemas/common/1.0": COMMON,
    }
    resolver = RefResolver.from_schema(ISSUER, store=store)
    return Draft202012Validator(ISSUER, resolver=resolver)


MIN = {
    "$formspecIssuer": "1.0",
    "url": "https://example.gov/issuer.json",
    "version": "1.0.0",
    "name": "Example Agency",
    "kind": "organization",
}


def test_minimum_valid_issuer():
    _validator().validate(MIN)


def test_missing_kind_rejected():
    bad = {**MIN}
    bad.pop("kind")
    with pytest.raises(Exception):
        _validator().validate(bad)


def test_unknown_kind_rejected():
    with pytest.raises(Exception):
        _validator().validate({**MIN, "kind": "not-a-kind"})


def test_logo_aspect_ratio_pattern():
    bad = {**MIN, "logo": {"primary": {"url": "x", "aspectRatio": "wide"}}}
    with pytest.raises(Exception):
        _validator().validate(bad)


def test_logo_aspect_ratio_valid():
    _validator().validate(
        {**MIN, "logo": {"primary": {"url": "x", "aspectRatio": "1:1"}}}
    )


def test_jurisdiction_levels():
    for lvl in [
        "federal",
        "state",
        "county",
        "municipal",
        "tribal",
        "international",
        "private",
        "individual",
    ]:
        _validator().validate({**MIN, "jurisdiction": {"level": lvl, "name": "X"}})


def test_extension_keys_must_be_x_prefixed():
    with pytest.raises(Exception):
        _validator().validate({**MIN, "extensions": {"bad": 1}})
    _validator().validate({**MIN, "extensions": {"x-vendor": 1}})


def test_version_plain_semver():
    _validator().validate({**MIN, "version": "1.2.3"})


def test_version_with_content_hash():
    _validator().validate(
        {
            **MIN,
            "version": (
                "1.2.3+sha256-"
                "deadbeef0123456789abcdef0123456789abcdef0123456789abcdef01234567"
            ),
        }
    )

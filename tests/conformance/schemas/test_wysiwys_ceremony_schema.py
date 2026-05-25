"""Schema acceptance tests for the WYSIWYS Ceremony sidecar."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

from tests.unit.support.schema_fixtures import build_schema_registry, load_schema


ROOT = Path(__file__).resolve().parents[3]
FIXTURES_DIR = ROOT / "tests" / "conformance" / "fixtures" / "wysiwys-ceremony"

COMMON_SCHEMA = load_schema("common.schema.json")
WYSIWYS_SCHEMA = load_schema("wysiwys-ceremony.schema.json")


def _validator() -> Draft202012Validator:
    return Draft202012Validator(
        WYSIWYS_SCHEMA,
        registry=build_schema_registry(COMMON_SCHEMA, WYSIWYS_SCHEMA),
        format_checker=Draft202012Validator.FORMAT_CHECKER,
    )


def _fixture_doc(name: str) -> dict:
    with (FIXTURES_DIR / name).open(encoding="utf-8") as handle:
        return json.load(handle)


def test_schema_is_well_formed() -> None:
    Draft202012Validator.check_schema(WYSIWYS_SCHEMA)


def test_schema_is_an_annex_not_a_signature_surface_fork() -> None:
    defs = WYSIWYS_SCHEMA["$defs"]

    assert "SignatureSurfaceAnnex" in defs
    assert "SignatureSurface" not in defs
    assert "Preimage" not in defs
    assert "Digest" not in defs


def test_valid_fixture_passes() -> None:
    _validator().validate(_fixture_doc("valid-single-signer.json"))


@pytest.mark.parametrize(
    "fixture_name",
    [
        "invalid-bulk-apply.json",
        "invalid-local-preimage-fork.json",
        "invalid-preimage-extension-fork.json",
        "invalid-scroll-gate-disabled.json",
    ],
)
def test_invalid_fixtures_fail_schema(fixture_name: str) -> None:
    with pytest.raises(ValidationError):
        _validator().validate(_fixture_doc(fixture_name))

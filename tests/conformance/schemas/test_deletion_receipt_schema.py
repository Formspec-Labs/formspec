"""Schema acceptance tests for the Deletion Receipt sidecar."""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

from tests.unit.support.schema_fixtures import build_schema_registry, load_schema


ROOT = Path(__file__).resolve().parents[3]
FIXTURES_DIR = ROOT / "tests" / "conformance" / "fixtures" / "deletion-receipt"

COMMON_SCHEMA = load_schema("common.schema.json")
DELETION_RECEIPT_SCHEMA = load_schema("deletion-receipt.schema.json")


def _validator() -> Draft202012Validator:
    return Draft202012Validator(
        DELETION_RECEIPT_SCHEMA,
        registry=build_schema_registry(COMMON_SCHEMA, DELETION_RECEIPT_SCHEMA),
        format_checker=Draft202012Validator.FORMAT_CHECKER,
    )


def _fixture_doc(name: str) -> dict:
    with (FIXTURES_DIR / name).open(encoding="utf-8") as handle:
        return json.load(handle)


def test_schema_is_well_formed() -> None:
    Draft202012Validator.check_schema(DELETION_RECEIPT_SCHEMA)


def test_cryptographic_method_requires_signed_receipt_evidence() -> None:
    cryptographic_method = DELETION_RECEIPT_SCHEMA["$defs"]["CryptographicMethod"]

    assert {"required": ["receiptBytes"]} in cryptographic_method["anyOf"]
    assert {"required": ["verificationReceiptRef"]} in cryptographic_method["anyOf"]


def test_valid_fixture_passes() -> None:
    _validator().validate(_fixture_doc("valid-draft-erasure.json"))


def test_verification_receipt_reference_can_carry_signed_evidence() -> None:
    doc = copy.deepcopy(_fixture_doc("valid-draft-erasure.json"))
    method = doc["cryptographicMethod"]
    method.pop("receiptBytes")
    method["verificationReceiptRef"] = "urn:formspec:verification-receipt:deletion:demo:001"

    _validator().validate(doc)


@pytest.mark.parametrize(
    "fixture_name",
    [
        "invalid-raw-erased-value.json",
        "invalid-respondent-signer.json",
        "invalid-unsigned-receipt.json",
    ],
)
def test_invalid_fixtures_fail_schema(fixture_name: str) -> None:
    with pytest.raises(ValidationError):
        _validator().validate(_fixture_doc(fixture_name))

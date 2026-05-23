"""Schema acceptance tests for the Respondent Library companion spec."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

from tests.unit.support.schema_fixtures import build_schema_registry, load_schema

ROOT = Path(__file__).resolve().parents[3]
FIXTURES_DIR = ROOT / "tests" / "conformance" / "fixtures" / "respondent-library"
RESPONDENT_LIBRARY_SCHEMA = load_schema("respondent-library.schema.json")
COMMON_SCHEMA = load_schema("common.schema.json")


def _validator() -> Draft202012Validator:
    return Draft202012Validator(
        RESPONDENT_LIBRARY_SCHEMA,
        registry=build_schema_registry(COMMON_SCHEMA, RESPONDENT_LIBRARY_SCHEMA),
        format_checker=Draft202012Validator.FORMAT_CHECKER,
    )


def _fixture_doc(name: str) -> dict:
    with (FIXTURES_DIR / name).open(encoding="utf-8") as handle:
        return json.load(handle)


def _base_doc() -> dict:
    return _fixture_doc("valid-respondent-place.json")


class TestRespondentLibrarySchemaShape:
    def test_schema_has_expected_defs(self) -> None:
        defs = RESPONDENT_LIBRARY_SCHEMA.get("$defs", {})
        for name in (
            "SubjectBinding",
            "IssuerRef",
            "Obligation",
            "DocumentRecord",
            "SubmissionRecord",
            "ApplicantStatusProjection",
            "PresentationPolicy",
            "TrustModel",
            "EncryptionEnvelope",
            "ExportPackage",
        ):
            assert name in defs, f"Missing $def: {name}"

    @pytest.mark.parametrize(
        "fixture_name",
        [
            "valid-respondent-place.json",
            "valid-selective-presentation.json",
            "valid-export-package.json",
        ],
    )
    def test_valid_fixtures_pass(self, fixture_name: str) -> None:
        _validator().validate(_fixture_doc(fixture_name))


class TestRespondentLibraryConstraints:
    def test_unknown_document_kind_rejected(self) -> None:
        doc = _base_doc()
        doc["documents"][0]["kind"] = "passport"

        with pytest.raises(ValidationError):
            _validator().validate(doc)

    def test_server_aggregation_mode_rejected(self) -> None:
        doc = _base_doc()
        doc["aggregationMode"] = "server-cross-tenant"

        with pytest.raises(ValidationError):
            _validator().validate(doc)

    def test_presentation_policy_requires_document_refs(self) -> None:
        doc = _base_doc()
        doc["presentationPolicies"] = [
            {
                "id": "empty-policy",
                "scope": "selected-documents",
                "allowedPurposes": ["eligibility"],
            }
        ]

        with pytest.raises(ValidationError):
            _validator().validate(doc)

    def test_passkey_hpke_encryption_requires_recipient_key_ref(self) -> None:
        doc = _base_doc()
        doc["encryption"] = {
            "mode": "passkey-hpke",
            "keyDerivation": "passkey-derived",
        }

        with pytest.raises(ValidationError):
            _validator().validate(doc)

    def test_applicant_status_projection_must_name_wos_applicant_schema(self) -> None:
        doc = _base_doc()
        doc["submissions"][0]["applicantStatus"]["sourceSchema"] = "https://example.test/status"

        with pytest.raises(ValidationError):
            _validator().validate(doc)

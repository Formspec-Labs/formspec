"""Conformance tests for Formspec response.schema.json and validation-report.schema.json."""

import json
from copy import deepcopy
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError, validate

from tests.unit.support.schema_fixtures import build_schema_registry, load_schema

# ---------------------------------------------------------------------------
# Schema loading
# ---------------------------------------------------------------------------

RESPONSE_SCHEMA = load_schema("response.schema.json")
VALIDATION_REPORT_SCHEMA = load_schema("validation-report.schema.json")
VALIDATION_RESULT_SCHEMA = load_schema("validation-result.schema.json")
SIGNATURE_FIXTURE_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "signature-responses"

# Build a resolver/registry so schemas can resolve cross-schema $refs.
_REGISTRY = build_schema_registry(RESPONSE_SCHEMA, VALIDATION_REPORT_SCHEMA, VALIDATION_RESULT_SCHEMA)


def _validate_response(instance: dict) -> None:
    v = Draft202012Validator(RESPONSE_SCHEMA, registry=_REGISTRY)
    v.validate(instance)


def _validate_report(instance: dict) -> None:
    v = Draft202012Validator(VALIDATION_REPORT_SCHEMA, registry=_REGISTRY)
    v.validate(instance)


def _load_signature_fixture(name: str) -> dict:
    return json.loads((SIGNATURE_FIXTURE_DIR / name).read_text())


# ---------------------------------------------------------------------------
# Helpers – minimal valid documents
# ---------------------------------------------------------------------------

def _minimal_response() -> dict:
    return {
        "$formspecResponse": "1.0",
        "definitionUrl": "https://example.com/forms/intake",
        "definitionVersion": "1.0.0",
        "status": "in-progress",
        "data": {},
        "authored": "2025-01-15T10:30:00Z",
    }


def _minimal_authored_signature() -> dict:
    return {
        "signatureId": "sig-2026-0001",
        "documentId": "benefitsApplication",
        "signingIntent": "urn:agency.gov:signing-intent:benefits-application-certification:v1",
        "signatureValue": "urn:agency.gov:signature:artifacts:ceremony-2026-0001:primary",
        "signatureMethod": "provider-managed",
        "signerId": "applicant",
        "signerName": "Ada Lovelace",
        "signedAt": "2026-04-22T12:00:00Z",
        "consentAccepted": True,
        "consentTextRef": "urn:agency.gov:consent:esign-benefits:v1",
        "consentVersion": "1.0.0",
        "affirmationText": "I certify under penalty of perjury that this submission is true and complete.",
        "signedPayload": {
            "canonicalization": "formspec-response-signing-v1",
            "digestAlgorithm": "sha-256",
            "digest": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            "responseId": "resp-2026-0001",
            "definitionUrl": "https://example.com/forms/intake",
            "definitionVersion": "1.0.0",
        },
        "documentHash": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        "documentHashAlgorithm": "sha-256",
        "identityProofRef": "urn:agency.gov:identity-proof:case-2026-0042",
        "identityBinding": {
            "method": "email-otp",
            "assuranceLevel": "standard",
            "providerRef": "urn:agency.gov:identity:providers:email-otp",
        },
        "signatureProvider": "urn:agency.gov:signature:providers:formspec",
        "ceremonyId": "ceremony-2026-0001",
    }


def _minimal_validation_result() -> dict:
    return {
        "$formspecValidationResult": "1.0",
        "path": "patient.name",
        "severity": "error",
        "constraintKind": "required",
        "message": "Field is required.",
    }


def _minimal_report() -> dict:
    return {
        "$formspecValidationReport": "1.0",
        "valid": True,
        "results": [],
        "counts": {"error": 0, "warning": 0, "info": 0},
        "timestamp": "2025-01-15T10:30:00Z",
    }


# ===================================================================
# RESPONSE SCHEMA TESTS
# ===================================================================


class TestResponseMinimalValid:
    """Minimal and fully-populated valid Response documents."""

    def test_minimal_response(self):
        _validate_response(_minimal_response())

    def test_response_with_all_optional_fields(self):
        doc = _minimal_response()
        doc["id"] = "550e8400-e29b-41d4-a716-446655440000"
        doc["author"] = {"id": "auth-1", "name": "Dr. Smith"}
        doc["subject"] = {"id": "subj-1", "type": "Patient"}
        doc["validationResults"] = [_minimal_validation_result()]
        doc["extensions"] = {"x-custom": "value"}
        _validate_response(doc)

    def test_response_with_authored_signatures(self):
        doc = _minimal_response()
        doc["id"] = "resp-2026-0001"
        doc["authoredSignatures"] = [_minimal_authored_signature()]
        _validate_response(doc)


class TestResponseEnums:
    """Status enum validation."""

    @pytest.mark.parametrize("status", [
        "in-progress",
        "completed",
        "amended",
        "stopped",
    ])
    def test_valid_status(self, status):
        doc = _minimal_response()
        doc["status"] = status
        _validate_response(doc)

    def test_invalid_status(self):
        doc = _minimal_response()
        doc["status"] = "draft"
        with pytest.raises(ValidationError, match="is not one of"):
            _validate_response(doc)


class TestResponseFormats:
    """Format enforcement for URI and date-time fields."""

    def test_definitionUrl_must_be_uri(self):
        doc = _minimal_response()
        doc["definitionUrl"] = "not a uri"
        with pytest.raises(ValidationError):
            v = Draft202012Validator(RESPONSE_SCHEMA, registry=_REGISTRY, format_checker=Draft202012Validator.FORMAT_CHECKER)
            v.validate(doc)

    def test_authored_must_be_datetime(self):
        doc = _minimal_response()
        doc["authored"] = "not-a-date"
        with pytest.raises(ValidationError):
            v = Draft202012Validator(RESPONSE_SCHEMA, registry=_REGISTRY, format_checker=Draft202012Validator.FORMAT_CHECKER)
            v.validate(doc)


class TestResponseAuthor:
    """Author sub-object validation."""

    def test_valid_author_with_id(self):
        doc = _minimal_response()
        doc["author"] = {"id": "auth-1"}
        _validate_response(doc)

    def test_author_missing_id(self):
        doc = _minimal_response()
        doc["author"] = {"name": "Dr. Smith"}
        with pytest.raises(ValidationError, match="'id' is a required property"):
            _validate_response(doc)

    def test_author_with_all_fields(self):
        doc = _minimal_response()
        doc["author"] = {"id": "auth-1", "name": "Dr. Smith"}
        _validate_response(doc)


class TestResponseSubject:
    """Subject sub-object validation."""

    def test_valid_subject_with_id(self):
        doc = _minimal_response()
        doc["subject"] = {"id": "subj-1"}
        _validate_response(doc)

    def test_subject_missing_id(self):
        doc = _minimal_response()
        doc["subject"] = {"type": "Patient"}
        with pytest.raises(ValidationError, match="'id' is a required property"):
            _validate_response(doc)


class TestResponseValidation:
    """ValidationResult array validation."""

    def test_valid_validation_result(self):
        doc = _minimal_response()
        doc["validationResults"] = [_minimal_validation_result()]
        _validate_response(doc)

    @pytest.mark.parametrize("field", [
        "path",
        "severity",
        "constraintKind",
        "message",
    ])
    def test_validation_result_missing_required_field(self, field):
        result = _minimal_validation_result()
        del result[field]
        doc = _minimal_response()
        doc["validationResults"] = [result]
        with pytest.raises(ValidationError, match=f"'{field}' is a required property"):
            _validate_response(doc)

    def test_invalid_severity_enum(self):
        result = _minimal_validation_result()
        result["severity"] = "critical"
        doc = _minimal_response()
        doc["validationResults"] = [result]
        with pytest.raises(ValidationError, match="is not one of"):
            _validate_response(doc)

    @pytest.mark.parametrize("kind", [
        "required",
        "type",
        "cardinality",
        "constraint",
        "shape",
        "external",
    ])
    def test_valid_constraintKind(self, kind):
        result = _minimal_validation_result()
        result["constraintKind"] = kind
        doc = _minimal_response()
        doc["validationResults"] = [result]
        _validate_response(doc)

    def test_invalid_constraintKind_enum(self):
        result = _minimal_validation_result()
        result["constraintKind"] = "regex"
        doc = _minimal_response()
        doc["validationResults"] = [result]
        with pytest.raises(ValidationError, match="is not one of"):
            _validate_response(doc)

    @pytest.mark.parametrize("source", ["bind", "shape", "external"])
    def test_valid_source_enum(self, source):
        result = _minimal_validation_result()
        result["source"] = source
        doc = _minimal_response()
        doc["validationResults"] = [result]
        _validate_response(doc)

    def test_invalid_source_enum(self):
        result = _minimal_validation_result()
        result["source"] = "custom"
        doc = _minimal_response()
        doc["validationResults"] = [result]
        with pytest.raises(ValidationError, match="is not one of"):
            _validate_response(doc)

    def test_additional_properties_on_validation_result_rejected(self):
        result = _minimal_validation_result()
        result["extra"] = "nope"
        doc = _minimal_response()
        doc["validationResults"] = [result]
        with pytest.raises(ValidationError, match="Additional properties are not allowed"):
            _validate_response(doc)


class TestResponseAuthoredSignatures:
    """Authored signature envelope validation."""

    def test_authored_signatures_require_response_id(self):
        doc = _minimal_response()
        doc["authoredSignatures"] = [_minimal_authored_signature()]
        with pytest.raises(ValidationError, match="'id'"):
            _validate_response(doc)

    @pytest.mark.parametrize("field", [
        "signatureId",
        "documentId",
        "signingIntent",
        "signatureValue",
        "signatureMethod",
        "signerName",
        "signedAt",
        "consentAccepted",
        "consentTextRef",
        "consentVersion",
        "affirmationText",
        "signedPayload",
        "documentHash",
        "documentHashAlgorithm",
        "signatureProvider",
        "ceremonyId",
    ])
    def test_authored_signature_missing_required_field(self, field):
        signature = _minimal_authored_signature()
        del signature[field]
        doc = _minimal_response()
        doc["id"] = "resp-2026-0001"
        doc["authoredSignatures"] = [signature]
        with pytest.raises(ValidationError, match=f"'{field}' is a required property"):
            _validate_response(doc)

    def test_invalid_signature_method_rejected(self):
        signature = _minimal_authored_signature()
        signature["signatureMethod"] = "faxed"
        doc = _minimal_response()
        doc["id"] = "resp-2026-0001"
        doc["authoredSignatures"] = [signature]
        with pytest.raises(ValidationError):
            _validate_response(doc)

    @pytest.mark.parametrize("field", [
        "canonicalization",
        "digestAlgorithm",
        "digest",
        "responseId",
        "definitionUrl",
        "definitionVersion",
    ])
    def test_signed_payload_missing_required_field(self, field):
        signature = _minimal_authored_signature()
        del signature["signedPayload"][field]
        doc = _minimal_response()
        doc["id"] = "resp-2026-0001"
        doc["authoredSignatures"] = [signature]
        with pytest.raises(ValidationError, match=f"'{field}' is a required property"):
            _validate_response(doc)

    def test_invalid_signed_payload_canonicalization_rejected(self):
        signature = _minimal_authored_signature()
        signature["signedPayload"]["canonicalization"] = "other-profile"
        doc = _minimal_response()
        doc["id"] = "resp-2026-0001"
        doc["authoredSignatures"] = [signature]
        with pytest.raises(ValidationError):
            _validate_response(doc)

    def test_invalid_identity_binding_assurance_rejected(self):
        signature = _minimal_authored_signature()
        signature["identityBinding"]["assuranceLevel"] = "critical"
        doc = _minimal_response()
        doc["id"] = "resp-2026-0001"
        doc["authoredSignatures"] = [signature]
        with pytest.raises(ValidationError):
            _validate_response(doc)


class TestResponseSignatureFixtures:
    """Signed-response fixture matrix for the authored-signature contract."""

    @pytest.mark.parametrize("fixture_name", [
        "valid-single.response.json",
        "valid-cosignature.response.json",
        "digest-mismatch.response.json",
    ])
    def test_schema_valid_signature_fixtures(self, fixture_name):
        _validate_response(_load_signature_fixture(fixture_name))

    def test_cosignature_fixture_preserves_prior_signed_payload_digest(self):
        doc = _load_signature_fixture("valid-cosignature.response.json")
        digests = {
            signature["signedPayload"]["digest"]
            for signature in doc["authoredSignatures"]
        }
        assert len(digests) == 1
        assert all(
            signature["signedPayload"]["responseId"] == doc["id"]
            for signature in doc["authoredSignatures"]
        )

    @pytest.mark.parametrize("fixture_name", ["response-pin-mismatch.response.json"])
    def test_signature_fixtures_schema_valid_but_semantically_invalid(self, fixture_name):
        """Schema-only validation passes for these fixtures because the Formspec
        JSON Schema cannot encode the cross-field invariant
        ``authoredSignatures[*].signedPayload.responseId == top-level id``
        (Core spec §2.1.6 — "When `authoredSignatures` is present" MUST list).

        These fixtures exist as a NEGATIVE corpus for the semantic verifier
        that lives downstream of schema validation. Until that verifier is
        wired, the schema test passes; the gap is intentional and tracked
        in formspec/TODO.md (FORMSPEC-SIGN-VERIFY-001).
        """
        fixture = _load_signature_fixture(fixture_name)
        # Schema-level: passes (gap the verifier must close).
        _validate_response(fixture)
        # Semantic invariant the verifier MUST catch:
        assert fixture["id"] != fixture["authoredSignatures"][0]["signedPayload"]["responseId"], (
            "fixture is no longer a pin-mismatch case; please replace with a true mismatch case "
            "or remove this test."
        )

    def test_missing_signing_intent_fixture_is_schema_invalid(self):
        doc = _load_signature_fixture("missing-signing-intent.response.json")
        with pytest.raises(ValidationError, match="'signingIntent' is a required property"):
            _validate_response(doc)

    def test_digest_mismatch_fixture_is_reserved_for_canonical_digest_verifier(self):
        valid = _load_signature_fixture("valid-single.response.json")
        mismatch = _load_signature_fixture("digest-mismatch.response.json")

        _validate_response(mismatch)
        assert mismatch["authoredSignatures"][0]["signedPayload"]["digest"] != (
            valid["authoredSignatures"][0]["signedPayload"]["digest"]
        )


class TestResponseExtensions:
    """Extension property-name validation."""

    def test_valid_x_prefixed_extension(self):
        doc = _minimal_response()
        doc["extensions"] = {"x-myApp": {"foo": 1}}
        _validate_response(doc)

    def test_non_x_prefixed_extension_fails(self):
        doc = _minimal_response()
        doc["extensions"] = {"myApp": {"foo": 1}}
        with pytest.raises(ValidationError, match="does not match"):
            _validate_response(doc)

    def test_extensions_on_validation_result(self):
        result = _minimal_validation_result()
        result["extensions"] = {"x-detail": "extra info"}
        doc = _minimal_response()
        doc["validationResults"] = [result]
        _validate_response(doc)


class TestResponseData:
    """The data field must be an object."""

    def test_data_is_object(self):
        doc = _minimal_response()
        doc["data"] = {"key": "value"}
        _validate_response(doc)

    def test_data_as_string_fails(self):
        doc = _minimal_response()
        doc["data"] = "not an object"
        with pytest.raises(ValidationError, match="is not of type 'object'"):
            _validate_response(doc)

    def test_data_as_array_fails(self):
        doc = _minimal_response()
        doc["data"] = [1, 2, 3]
        with pytest.raises(ValidationError, match="is not of type 'object'"):
            _validate_response(doc)


# ===================================================================
# VALIDATION REPORT SCHEMA TESTS
# ===================================================================


class TestValidationReportMinimalValid:
    """Minimal and fully-populated valid Report documents."""

    def test_minimal_valid_report(self):
        _validate_report(_minimal_report())

    def test_report_with_optional_fields(self):
        doc = _minimal_report()
        doc["definitionUrl"] = "https://example.com/forms/intake"
        doc["definitionVersion"] = "1.0.0"
        doc["extensions"] = {"x-tool": "formspec-validator"}
        _validate_report(doc)


class TestValidationReportCounts:
    """Counts sub-object validation."""

    def test_valid_counts(self):
        doc = _minimal_report()
        doc["counts"] = {"error": 2, "warning": 1, "info": 0}
        _validate_report(doc)

    @pytest.mark.parametrize("field", ["error", "warning", "info"])
    def test_missing_count_field(self, field):
        doc = _minimal_report()
        del doc["counts"][field]
        with pytest.raises(ValidationError, match=f"'{field}' is a required property"):
            _validate_report(doc)

    def test_negative_count_value(self):
        doc = _minimal_report()
        doc["counts"]["error"] = -1
        with pytest.raises(ValidationError, match="-1 is less than the minimum of 0"):
            _validate_report(doc)

    def test_additional_properties_on_counts_rejected(self):
        doc = _minimal_report()
        doc["counts"]["fatal"] = 0
        with pytest.raises(ValidationError, match="Additional properties are not allowed"):
            _validate_report(doc)


class TestValidationReportFormats:
    """Format enforcement for date-time and URI fields."""

    def test_timestamp_must_be_datetime(self):
        doc = _minimal_report()
        doc["timestamp"] = "yesterday"
        with pytest.raises(ValidationError):
            v = Draft202012Validator(VALIDATION_REPORT_SCHEMA, registry=_REGISTRY, format_checker=Draft202012Validator.FORMAT_CHECKER)
            v.validate(doc)

    def test_definitionUrl_must_be_uri(self):
        doc = _minimal_report()
        doc["definitionUrl"] = "not a uri"
        with pytest.raises(ValidationError):
            v = Draft202012Validator(VALIDATION_REPORT_SCHEMA, registry=_REGISTRY, format_checker=Draft202012Validator.FORMAT_CHECKER)
            v.validate(doc)

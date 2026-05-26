"""Schema acceptance tests for ArtifactResolver reports."""

from __future__ import annotations

import copy

import pytest
from jsonschema import Draft202012Validator, ValidationError

from tests.unit.support.schema_fixtures import load_schema


SCHEMA = load_schema("artifact-resolution-report.schema.json")


def _validator() -> Draft202012Validator:
    return Draft202012Validator(SCHEMA)


def _valid_report() -> dict:
    return {
        "ok": True,
        "manifest": {
            "slot": "app",
            "artifactKind": "appManifest",
            "status": "loaded",
            "schemaId": "https://formspec.org/schemas/bundleManifest/2.2",
            "document": {"$formspecApp": "2.2"},
            "source": "memory://app",
            "digest": "sha256:manifest",
        },
        "artifacts": {
            "definitions": [
                {
                    "slot": "definitions[0]",
                    "artifactKind": "definition",
                    "status": "loaded",
                    "ref": {
                        "url": "https://example.gov/forms/intake",
                        "version": "1.0.0",
                    },
                    "schemaId": "https://formspec.org/schemas/definition/1.0",
                    "document": {"$formspec": "1.0"},
                    "identity": {"url": "https://example.gov/forms/intake"},
                    "source": "memory://definition",
                    "digest": "sha256:definition",
                }
            ],
            "components": [
                {
                    "slot": "components[0]",
                    "artifactKind": "component",
                    "status": "loaded",
                    "ref": {
                        "url": "https://example.gov/components/review",
                        "version": "1.0.0",
                        "handle": "review-panel",
                        "x-loader": "memory",
                    },
                    "schemaId": "https://formspec.org/schemas/component/1.2",
                    "document": [
                        "opaque",
                        {"$formspecComponent": "1.2"},
                    ],
                    "source": "memory://component",
                    "digest": "sha256:component",
                }
            ],
            "screeners": [
                {
                    "slot": "screeners[0]",
                    "artifactKind": "screener",
                    "status": "loaded",
                    "ref": {
                        "url": "https://example.gov/screeners/eligibility",
                        "version": "1.0.0",
                    },
                    "schemaId": "https://formspec.org/schemas/screener/1.0",
                    "document": {"$formspecScreener": "1.0"},
                    "identity": {"url": "https://example.gov/screeners/eligibility"},
                    "source": "memory://screener",
                    "digest": "sha256:screener",
                }
            ],
        },
        "diagnostics": [],
        "summary": {
            "declaredRefs": 3,
            "loadedArtifacts": 3,
            "missingArtifacts": 0,
            "unsupportedRefs": 0,
            "discriminatorMismatches": 0,
            "versionMismatches": 0,
            "identityMismatches": 0,
            "errors": 0,
            "warnings": 0,
            "infos": 0,
        },
        "phase": {
            "phase": "artifact-resolution",
            "status": "completed",
        },
    }


def test_schema_is_well_formed() -> None:
    Draft202012Validator.check_schema(SCHEMA)


def test_valid_report_shape_passes() -> None:
    _validator().validate(_valid_report())


@pytest.mark.parametrize(
    "field",
    ["ok", "manifest", "artifacts", "diagnostics", "summary", "phase"],
)
def test_root_required_fields_are_required(field: str) -> None:
    report = _valid_report()
    del report[field]
    with pytest.raises(ValidationError):
        _validator().validate(report)


def test_document_payload_is_opaque_json() -> None:
    report = _valid_report()
    report["manifest"]["document"] = "opaque scalar"
    report["artifacts"]["definitions"][0]["document"] = 42
    report["artifacts"]["components"][0]["document"] = [
        "opaque",
        {"runtimeDefined": True},
    ]
    _validator().validate(report)


def test_unknown_artifact_group_is_rejected() -> None:
    report = _valid_report()
    report["artifacts"]["runtimePlan"] = []
    with pytest.raises(ValidationError):
        _validator().validate(report)


@pytest.mark.parametrize("field", ["fixture", "identityFromPath"])
def test_ref_rejects_fixture_and_path_identity_fields(field: str) -> None:
    report = _valid_report()
    report["artifacts"]["components"][0]["ref"][field] = True
    with pytest.raises(ValidationError):
        _validator().validate(report)


def test_diagnostic_origin_is_resolver_only() -> None:
    report = _valid_report()
    report["diagnostics"].append(
        {
            "code": "ARTIFACT-MISSING",
            "severity": "error",
            "phase": "artifact-resolution",
            "origin": "x-host-validator",
            "message": "host extension origin is not valid here",
        }
    )
    with pytest.raises(ValidationError):
        _validator().validate(report)


def test_invalid_phase_is_rejected() -> None:
    report = _valid_report()
    report["phase"]["phase"] = "schema"
    with pytest.raises(ValidationError):
        _validator().validate(report)


def test_diagnostic_phase_is_artifact_resolution_only() -> None:
    report = _valid_report()
    report["diagnostics"].append(
        {
            "code": "ARTIFACT-MISSING",
            "severity": "error",
            "phase": "schema",
            "origin": "artifact-resolver",
            "message": "diagnostic phase must stay resolver-owned",
        }
    )
    with pytest.raises(ValidationError):
        _validator().validate(report)


def test_source_pointer_rejects_path_identity_flags() -> None:
    report = copy.deepcopy(_valid_report())
    report["diagnostics"].append(
        {
            "code": "ARTIFACT-IDENTITY-MISMATCH",
            "severity": "error",
            "phase": "artifact-resolution",
            "origin": "artifact-resolver",
            "message": "identity mismatch",
            "primarySource": {
                "artifactSlot": "components[0]",
                "artifactKind": "component",
                "source": "memory://component",
                "jsonPointer": "/targetSurfaceRoutes/0",
                "identityFromPath": True,
            },
        }
    )
    with pytest.raises(ValidationError):
        _validator().validate(report)

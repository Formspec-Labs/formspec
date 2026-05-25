"""Schema acceptance tests for AppGraphValidator reports."""

from __future__ import annotations

import copy

import pytest
from jsonschema import Draft202012Validator, ValidationError

from tests.unit.support.schema_fixtures import load_schema


SCHEMA = load_schema("app-graph-validation-report.schema.json")


def _validator() -> Draft202012Validator:
    return Draft202012Validator(SCHEMA)


def _valid_report() -> dict:
    return {
        "ok": False,
        "summary": {
            "artifacts": 2,
            "loadedArtifacts": 2,
            "schemaFailures": 1,
            "unvalidatedArtifacts": 0,
            "graphErrors": 0,
            "errors": 1,
            "warnings": 1,
            "infos": 0,
            "importedDiagnostics": 1,
            "unsupportedFeatures": 0,
            "skippedPhases": 1,
        },
        "schemaResults": [
            {
                "slot": "app",
                "artifactKind": "appManifest",
                "schemaId": "https://formspec.org/schemas/bundleManifest/2.2",
                "status": "completed",
                "ok": False,
                "diagnostics": [
                    {
                        "code": "APP-GRAPH-SCHEMA",
                        "severity": "error",
                        "phase": "schema",
                        "origin": "schema-validator",
                        "message": "definitions is required",
                        "primarySource": {
                            "artifactSlot": "app",
                            "artifactKind": "appManifest",
                            "jsonPointer": "/definitions",
                            "source": "memory://app",
                        },
                    }
                ],
            }
        ],
        "evidenceResults": [],
        "diagnostics": [
            {
                "code": "APP-GRAPH-SCHEMA",
                "severity": "error",
                "phase": "schema",
                "origin": "schema-validator",
                "message": "definitions is required",
                "primarySource": {
                    "artifactSlot": "app",
                    "artifactKind": "appManifest",
                    "jsonPointer": "/definitions",
                    "source": "memory://app",
                },
            },
            {
                "code": "MODULE-CONTRIBUTION-UNOWNED",
                "severity": "warning",
                "phase": "module-resolution",
                "origin": "module-resolver",
                "message": "module contribution has no admitted owner",
                "primarySource": {
                    "artifactSlot": "registries[0]",
                    "artifactKind": "registry",
                    "ref": {
                        "url": "https://example.gov/registry",
                        "version": "1.0.0",
                        "x-loader": "diagnostic-only",
                    },
                },
                "details": {
                    "contribution": "x-example-widget"
                },
            },
            {
                "code": "X-HOST-OBSERVED",
                "severity": "info",
                "phase": "cross-artifact",
                "origin": "x-host-validator",
                "message": "host extension diagnostic",
            },
        ],
        "phases": [
            {"phase": "artifact-resolution", "status": "completed"},
            {"phase": "schema", "status": "completed"},
            {"phase": "cross-artifact", "status": "skipped", "reason": "schema-errors"},
        ],
        "support": {
            "bundleVersions": ["2.2"],
            "artifactKinds": ["appManifest", "registry"],
            "schemaIds": ["https://formspec.org/schemas/bundleManifest/2.2"],
            "featureFlags": ["component-route-targets"],
        },
    }


def test_schema_is_well_formed() -> None:
    Draft202012Validator.check_schema(SCHEMA)


def test_valid_report_shape_passes() -> None:
    _validator().validate(_valid_report())


@pytest.mark.parametrize(
    "origin",
    [
        "app-graph-validator",
        "artifact-resolver",
        "module-resolver",
        "surface-local-lint",
        "schema-validator",
        "ui-graph-policy",
        "x-custom-origin",
    ],
)
def test_known_and_extension_origins_are_allowed(origin: str) -> None:
    report = _valid_report()
    report["diagnostics"][0]["origin"] = origin
    _validator().validate(report)


def test_unknown_non_extension_origin_is_rejected() -> None:
    report = _valid_report()
    report["diagnostics"][0]["origin"] = "host-validator"
    with pytest.raises(ValidationError):
        _validator().validate(report)


def test_report_does_not_require_runtime_metadata() -> None:
    report = _valid_report()
    report["timestamp"] = "2026-05-25T00:00:00Z"
    with pytest.raises(ValidationError):
        _validator().validate(report)


def test_required_report_arrays_are_required() -> None:
    report = _valid_report()
    del report["diagnostics"]
    with pytest.raises(ValidationError):
        _validator().validate(report)


def test_evidence_results_do_not_require_artifact_kind() -> None:
    report = _valid_report()
    report["evidenceResults"] = [
        {
            "evidenceSlot": "hostEvidence.uiGraphPolicies[0]",
            "schemaId": "https://formspec.org/schemas/uiGraphPolicy/0.1",
            "source": "host://policy/respondent-ui-policy",
            "status": "completed",
            "ok": True,
            "diagnostics": [],
        }
    ]
    _validator().validate(report)


def test_evidence_result_diagnostics_use_evidence_source_pointer() -> None:
    report = _valid_report()
    report["evidenceResults"] = [
        {
            "evidenceSlot": "hostEvidence.uiGraphPolicies[0]",
            "schemaId": "https://formspec.org/schemas/uiGraphPolicy/0.1",
            "source": "host://policy/respondent-ui-policy",
            "status": "completed",
            "ok": False,
            "diagnostics": [
                {
                    "code": "APP-GRAPH-SCHEMA",
                    "severity": "error",
                    "phase": "schema",
                    "origin": "schema-validator",
                    "message": "families is required",
                    "primarySource": {
                        "artifactSlot": "hostEvidence.uiGraphPolicies[0]",
                        "source": "host://policy/respondent-ui-policy",
                        "jsonPointer": "/families",
                    },
                }
            ],
        }
    ]
    _validator().validate(report)


@pytest.mark.parametrize(
    ("mutate", "expected_error"),
    [
        (
            lambda diagnostic: diagnostic.update({"phase": "cross-artifact"}),
            "phase",
        ),
        (
            lambda diagnostic: diagnostic.update({"origin": "ui-graph-policy"}),
            "origin",
        ),
        (
            lambda diagnostic: diagnostic["primarySource"].update({"artifactKind": "uiGraphPolicy"}),
            "artifactKind",
        ),
        (
            lambda diagnostic: diagnostic["primarySource"].update({"ref": {"url": "https://example.gov/policy"}}),
            "ref",
        ),
        (
            lambda diagnostic: diagnostic.update({"relatedSources": []}),
            "relatedSources",
        ),
    ],
)
def test_evidence_result_diagnostics_reject_semantic_or_artifact_source_leakage(
    mutate,
    expected_error: str,
) -> None:
    report = _valid_report()
    diagnostic = {
        "code": "APP-GRAPH-SCHEMA",
        "severity": "error",
        "phase": "schema",
        "origin": "schema-validator",
        "message": "families is required",
        "primarySource": {
            "artifactSlot": "hostEvidence.uiGraphPolicies[0]",
            "source": "host://policy/respondent-ui-policy",
            "jsonPointer": "/families",
        },
    }
    mutate(diagnostic)
    report["evidenceResults"] = [
        {
            "evidenceSlot": "hostEvidence.uiGraphPolicies[0]",
            "schemaId": "https://formspec.org/schemas/uiGraphPolicy/0.1",
            "source": "host://policy/respondent-ui-policy",
            "status": "completed",
            "ok": False,
            "diagnostics": [diagnostic],
        }
    ]
    with pytest.raises(ValidationError) as error:
        _validator().validate(report)
    assert expected_error in str(error.value)


@pytest.mark.parametrize(
    ("forbidden_key", "forbidden_value"),
    [
        ("artifactKind", "uiGraphPolicy"),
        ("ref", {"url": "https://example.gov/policy"}),
        ("identity", {"id": "policy-from-path"}),
        ("slot", "uiGraphPolicies[0]"),
    ],
)
def test_evidence_results_reject_artifact_identity_fields(
    forbidden_key: str,
    forbidden_value: object,
) -> None:
    report = _valid_report()
    report["evidenceResults"] = [
        {
            "evidenceSlot": "hostEvidence.uiGraphPolicies[0]",
            "schemaId": "https://formspec.org/schemas/uiGraphPolicy/0.1",
            "source": "host://policy/respondent-ui-policy",
            "status": "completed",
            "ok": True,
            "diagnostics": [],
            forbidden_key: forbidden_value,
        }
    ]
    with pytest.raises(ValidationError):
        _validator().validate(report)


def test_invalid_phase_is_rejected() -> None:
    report = _valid_report()
    report["phases"][0]["phase"] = "runtime"
    with pytest.raises(ValidationError):
        _validator().validate(report)


def test_source_pointer_keeps_source_diagnostic_only() -> None:
    report = copy.deepcopy(_valid_report())
    report["diagnostics"][0]["primarySource"]["identityFromPath"] = True
    with pytest.raises(ValidationError):
        _validator().validate(report)


def test_source_pointer_rejects_module_resolution_module_leakage() -> None:
    report = copy.deepcopy(_valid_report())
    report["diagnostics"][1]["primarySource"]["module"] = {
        "id": "x-denied",
        "version": "1.0.0",
    }
    with pytest.raises(ValidationError):
        _validator().validate(report)

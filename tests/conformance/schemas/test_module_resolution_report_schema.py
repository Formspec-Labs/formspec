"""Schema acceptance tests for ModuleResolver reports."""

from __future__ import annotations

import copy

import pytest
from jsonschema import Draft202012Validator, ValidationError

from tests.unit.support.schema_fixtures import load_schema


SCHEMA = load_schema("module-resolution-report.schema.json")


def _validator() -> Draft202012Validator:
    return Draft202012Validator(SCHEMA)


def _module_ref() -> dict:
    return {
        "id": "x-formspec-presentation",
        "version": "0.1.0",
        "publisher": "https://formspec.org",
        "lockHash": "sha256:module",
    }


def _source(pointer: str = "/modules/0") -> dict:
    return {
        "artifactSlot": "app",
        "artifactKind": "appManifest",
        "source": "memory://app",
        "jsonPointer": pointer,
        "module": _module_ref(),
        "ref": {
            "url": "https://example.gov/apps/intake",
            "version": "1.0.0",
            "x-loader": "memory",
        },
    }


def _diagnostic() -> dict:
    return {
        "code": "MODULE-CONTRIBUTION-UNOWNED",
        "severity": "error",
        "phase": "module-resolution",
        "origin": "module-resolver",
        "message": "contribution has no owning module",
        "primarySource": _source("/registry/entries/3"),
        "details": {
            "contribution": "x-example-widget",
        },
    }


def _valid_report() -> dict:
    module = _module_ref()
    diagnostic = _diagnostic()
    return {
        "ok": False,
        "modules": [
            {
                "ref": module,
                "status": "admitted",
                "source": _source(),
                "registryVersion": "0.1.0",
                "defaulted": False,
            }
        ],
        "documents": [
            {
                "artifactSlot": "surfaces[0]",
                "artifactKind": "surface",
                "status": "coherent",
                "modules": [module],
                "effectiveModules": [module],
                "source": {
                    "artifactSlot": "surfaces[0]",
                    "artifactKind": "surface",
                    "source": "memory://surface",
                    "jsonPointer": "/modules",
                    "ref": {
                        "url": "https://example.gov/apps/intake/surface",
                        "version": "1.0.0",
                    },
                },
            }
        ],
        "contributions": [
            {
                "site": "surface.module-widget.binding.widgetName",
                "name": "x-example-widget",
                "expectedCategory": "widget",
                "registryCategory": "widget",
                "entryVersion": "1.0.0",
                "owningModules": [module],
                "status": "unowned",
                "payloadStatus": "not-run",
                "source": {
                    "artifactSlot": "surfaces[0]",
                    "artifactKind": "surface",
                    "source": "memory://surface",
                    "jsonPointer": "/routes/0/slots/0/binding/widgetName",
                },
                "diagnostics": [diagnostic],
            }
        ],
        "diagnostics": [diagnostic],
        "summary": {
            "modules": 1,
            "admittedModules": 1,
            "deniedModules": 0,
            "documents": 1,
            "contributions": 1,
            "unresolvedDependencies": 0,
            "unresolvedContributions": 1,
            "payloadFailures": 0,
            "errors": 1,
            "warnings": 0,
            "infos": 0,
        },
        "phase": {
            "phase": "module-resolution",
            "status": "completed",
        },
        "support": {
            "defaultModules": [
                {
                    "id": "x-formspec-core-task",
                    "version": "^1.0.0",
                }
            ],
            "moduleCategories": ["module"],
            "contributionCategories": ["widget", "unit-kind"],
            "versionRangeGrammar": "exact-or-caret",
            "payloadSchemaValidators": ["widgetShape.props"],
        },
    }


def test_schema_is_well_formed() -> None:
    Draft202012Validator.check_schema(SCHEMA)


def test_valid_report_shape_passes() -> None:
    _validator().validate(_valid_report())


@pytest.mark.parametrize(
    "field",
    ["ok", "modules", "documents", "contributions", "diagnostics", "summary", "phase"],
)
def test_root_required_fields_are_required(field: str) -> None:
    report = _valid_report()
    del report[field]
    with pytest.raises(ValidationError):
        _validator().validate(report)


def test_module_ref_rejects_posture_and_path_identity_fields() -> None:
    report = _valid_report()
    report["modules"][0]["ref"]["posture"] = "allow"
    with pytest.raises(ValidationError):
        _validator().validate(report)

    report = _valid_report()
    report["modules"][0]["ref"]["identityFromPath"] = True
    with pytest.raises(ValidationError):
        _validator().validate(report)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("id", "x-BAD_UPPER"),
        ("publisher", "not a uri"),
        ("lockHash", "not-a-hash"),
    ],
)
def test_module_ref_mirrors_canonical_constraints(field: str, value: str) -> None:
    report = _valid_report()
    report["modules"][0]["ref"][field] = value
    with pytest.raises(ValidationError):
        _validator().validate(report)


def test_source_pointer_must_identify_source_evidence() -> None:
    report = _valid_report()
    report["modules"][0]["source"] = {}
    with pytest.raises(ValidationError):
        _validator().validate(report)


def test_diagnostic_origin_is_resolver_only() -> None:
    report = _valid_report()
    report["diagnostics"][0]["origin"] = "x-host-validator"
    with pytest.raises(ValidationError):
        _validator().validate(report)


def test_diagnostic_phase_is_module_resolution_only() -> None:
    report = _valid_report()
    report["diagnostics"][0]["phase"] = "cross-artifact"
    with pytest.raises(ValidationError):
        _validator().validate(report)


def test_invalid_phase_status_phase_is_rejected() -> None:
    report = _valid_report()
    report["phase"]["phase"] = "artifact-resolution"
    with pytest.raises(ValidationError):
        _validator().validate(report)


def test_source_pointer_rejects_path_identity_flags() -> None:
    report = copy.deepcopy(_valid_report())
    report["diagnostics"][0]["primarySource"]["identityFromPath"] = True
    with pytest.raises(ValidationError):
        _validator().validate(report)


@pytest.mark.parametrize("field", ["fixture", "identityFromPath", "routePolicy"])
def test_diagnostic_details_reject_forbidden_identity_and_auth_keys(field: str) -> None:
    report = _valid_report()
    report["diagnostics"][0]["details"][field] = True
    with pytest.raises(ValidationError):
        _validator().validate(report)


@pytest.mark.parametrize("field", ["fixture", "localPath", "identityFromPath"])
def test_artifact_ref_rejects_fixture_and_path_identity_fields(field: str) -> None:
    report = _valid_report()
    report["documents"][0]["source"]["ref"][field] = True
    with pytest.raises(ValidationError):
        _validator().validate(report)


def test_fine_grained_authorization_fields_are_not_report_surface() -> None:
    report = _valid_report()
    report["modules"][0]["routePolicy"] = {"route": "dashboard"}
    with pytest.raises(ValidationError):
        _validator().validate(report)

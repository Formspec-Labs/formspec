"""Schema acceptance tests for Outcome Verification cases and reports."""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

from tests.unit.support.schema_fixtures import build_schema_registry, load_schema


ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "tests" / "conformance" / "fixtures" / "outcome-verification"

CASE_SCHEMA = load_schema("outcome-verification-case.schema.json")
REPORT_SCHEMA = load_schema("outcome-verification-report.schema.json")
RESPONSE_SCHEMA = load_schema("response.schema.json")
RESPONSE_ACTIONS_SCHEMA = load_schema("response-actions.schema.json")
DATA_SOURCES_SCHEMA = load_schema("data-sources.schema.json")

REGISTRY = build_schema_registry(
    CASE_SCHEMA,
    REPORT_SCHEMA,
    RESPONSE_SCHEMA,
    RESPONSE_ACTIONS_SCHEMA,
    DATA_SOURCES_SCHEMA,
)

DIGEST = "sha256:" + ("f" * 64)


def _fixture(name: str) -> dict:
    with (FIXTURES / name).open(encoding="utf-8") as handle:
        return json.load(handle)


def _case_validator() -> Draft202012Validator:
    return Draft202012Validator(
        CASE_SCHEMA,
        registry=REGISTRY,
        format_checker=Draft202012Validator.FORMAT_CHECKER,
    )


def _report_validator() -> Draft202012Validator:
    return Draft202012Validator(
        REPORT_SCHEMA,
        registry=REGISTRY,
        format_checker=Draft202012Validator.FORMAT_CHECKER,
    )


def _definition_validator(definition: str) -> Draft202012Validator:
    return Draft202012Validator(
        {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "$ref": (
                "https://formspec.org/schemas/outcomeVerificationReport/0.1"
                f"#/$defs/{definition}"
            ),
        },
        registry=REGISTRY,
        format_checker=Draft202012Validator.FORMAT_CHECKER,
    )


def _expectation(kind: str) -> dict:
    common = {
        "id": f"expected-{kind}",
        "kind": kind,
        "ruleRefs": [
            {
                "kind": "artifact-declaration",
                "subject": {
                    "artifactRef": "https://example.org/artifact",
                    "artifactDigest": DIGEST,
                    "subjectKind": "surface-node",
                    "subjectRef": "node-1",
                },
            }
        ],
        "checkpointRef": "after-open",
    }
    if kind == "app-graph":
        return {
            **common,
            "requiredEvidence": "structural",
            "subject": common["ruleRefs"][0]["subject"],
            "relation": "mounted",
            "state": "present",
        }
    if kind == "validation-report":
        return {
            **common,
            "requiredEvidence": "runtime",
            "stepRef": "open",
            "subject": {
                "artifactRef": "https://example.org/definition",
                "artifactDigest": DIGEST,
                "subjectKind": "definition-bind",
                "subjectRef": "consent",
            },
            "definitionRef": "https://example.org/definition",
            "definitionDigest": DIGEST,
            "valid": False,
            "containsIssues": [
                {"path": "consent", "code": "CONSTRAINT_FAILED"}
            ],
        }
    if kind == "response":
        return {
            **common,
            "requiredEvidence": "runtime",
            "stepRef": "open",
            "subject": {
                "artifactRef": "https://example.org/definition",
                "artifactDigest": DIGEST,
                "subjectKind": "definition-item",
                "subjectRef": "consent",
            },
            "definitionRef": "https://example.org/definition",
            "definitionDigest": DIGEST,
            "status": "in-progress",
            "item": {"path": "consent", "presence": "present", "value": False},
        }
    if kind == "action-invocation":
        return {
            **common,
            "requiredEvidence": "runtime",
            "stepRef": "open",
            "actionsRef": "https://example.org/actions",
            "actionsDigest": DIGEST,
            "actionId": "submit",
            "terminal": "blocked",
            "effects": [
                {"index": 0, "type": "hostEvent", "status": "not-invoked"}
            ],
        }
    if kind == "data-source-result":
        return {
            **common,
            "requiredEvidence": "runtime",
            "stepRef": "open",
            "catalogRef": "https://example.org/data-sources",
            "catalogDigest": DIGEST,
            "sourceId": "query:schedule",
            "state": "loaded",
            "freshness": "fresh",
            "recordId": "schedule/1",
        }
    if kind == "route-state":
        return {
            **common,
            "requiredEvidence": "runtime",
            "stepRef": "open",
            "subject": {
                "artifactRef": "https://example.org/artifact",
                "artifactDigest": DIGEST,
                "subjectKind": "surface-route",
                "subjectRef": "schedule",
            },
            "surfaceRef": "https://example.org/artifact",
            "surfaceDigest": DIGEST,
            "routeId": "schedule",
        }
    if kind == "rendered-output":
        return {
            **common,
            "requiredEvidence": "runtime",
            "stepRef": "open",
            "node": common["ruleRefs"][0]["subject"],
            "rendered": True,
            "operable": True,
            "semanticValue": {"label": "Schedule"},
        }
    raise AssertionError(f"unsupported test kind: {kind}")


def _observation(kind: str) -> dict:
    common = {
        "id": f"observed-{kind}",
        "expectationId": f"expected-{kind}",
        "kind": kind,
        "evidenceClass": "runtime",
        "source": {
            "artifactRef": "https://example.org/artifact",
            "artifactDigest": DIGEST,
        },
        "boundary": {
            "startedAt": "2026-07-31T12:00:00Z",
            "endedAt": "2026-07-31T12:00:01Z",
        },
        "checkpointBindingRef": "binding/after-open",
        "adapter": {
            "id": "example/adapter",
            "version": "0.1.0",
            "digest": DIGEST,
        },
    }
    subject = {
        "artifactRef": "https://example.org/artifact",
        "artifactDigest": DIGEST,
        "subjectKind": "surface-node",
        "subjectRef": "node-1",
    }
    if kind == "app-graph":
        return {
            **common,
            "evidenceClass": "structural",
            "payload": {
                "subject": subject,
                "relation": "mounted",
                "state": "present",
            },
        }

    common["stepBindingRef"] = "binding/open"
    if kind == "validation-report":
        payload = {
            "definitionRef": "https://example.org/definition",
            "definitionDigest": DIGEST,
            "responseId": "response/1",
            "responseRevision": 1,
            "valid": False,
            "issues": [{"path": "consent", "code": "CONSTRAINT_FAILED"}],
        }
    elif kind == "response":
        payload = {
            "definitionRef": "https://example.org/definition",
            "definitionDigest": DIGEST,
            "responseId": "response/1",
            "responseRevision": 1,
            "responseDigest": DIGEST,
            "status": "in-progress",
            "item": {"path": "consent", "presence": "present", "value": False},
        }
    elif kind == "action-invocation":
        payload = {
            "actionsRef": "https://example.org/actions",
            "actionsDigest": DIGEST,
            "actionId": "submit",
            "terminal": "blocked",
            "effects": [
                {"index": 0, "type": "hostEvent", "status": "not-invoked"}
            ],
            "invocationId": "invocation/1",
            "responseId": "response/1",
        }
    elif kind == "data-source-result":
        payload = {
            "catalogRef": "https://example.org/data-sources",
            "catalogDigest": DIGEST,
            "sourceId": "query:schedule",
            "state": "loaded",
            "freshness": "fresh",
            "recordId": "schedule/1",
            "requestId": "request/1",
        }
    elif kind == "route-state":
        payload = {
            "surfaceRef": "https://example.org/artifact",
            "surfaceDigest": DIGEST,
            "routeId": "schedule",
            "routeInstanceId": "route/1",
        }
    elif kind == "rendered-output":
        payload = {
            "node": subject,
            "rendered": True,
            "operable": True,
            "semanticValue": {"label": "Schedule"},
            "renderInstanceId": "render/1",
        }
    else:
        raise AssertionError(f"unsupported test kind: {kind}")
    return {**common, "payload": payload}


def _case_with_expectation(kind: str) -> dict:
    case = _fixture("valid-case.json")
    case["expectedObservations"] = [_expectation(kind)]
    return case


def test_schemas_are_well_formed() -> None:
    Draft202012Validator.check_schema(CASE_SCHEMA)
    Draft202012Validator.check_schema(REPORT_SCHEMA)


def test_valid_fixtures_pass() -> None:
    _case_validator().validate(_fixture("valid-case.json"))
    _report_validator().validate(_fixture("valid-report.json"))


def test_case_requires_exact_experience_pin() -> None:
    case = _fixture("valid-case.json")
    del case["experience"]

    with pytest.raises(ValidationError):
        _case_validator().validate(case)


def test_procedure_controls_require_owner_specific_subject_kinds() -> None:
    case = _fixture("valid-case.json")
    case["procedure"] = [
        case["procedure"][0],
        {
            "id": "set-name",
            "kind": "set-item",
            "renderStepRef": "open",
            "control": {
                "artifactRef": "https://example.org/definition",
                "artifactDigest": DIGEST,
                "subjectKind": "definition-item",
                "subjectRef": "name",
            },
            "definitionRef": "https://example.org/definition",
            "definitionDigest": DIGEST,
            "path": "name",
            "value": "Ada",
        },
        {
            "id": "submit",
            "kind": "activate-control",
            "renderStepRef": "open",
            "control": {
                "artifactRef": "https://example.org/actions",
                "artifactDigest": DIGEST,
                "subjectKind": "response-action",
                "subjectRef": "submit",
            },
            "actionsRef": "https://example.org/actions",
            "actionsDigest": DIGEST,
            "actionId": "submit",
            "responseStepRef": "set-name",
        },
        case["procedure"][1],
    ]
    _case_validator().validate(case)

    invalid_set = copy.deepcopy(case)
    invalid_set["procedure"][1]["control"]["subjectKind"] = "surface-node"
    with pytest.raises(ValidationError):
        _case_validator().validate(invalid_set)

    invalid_action = copy.deepcopy(case)
    invalid_action["procedure"][2]["control"]["subjectKind"] = "surface-node"
    with pytest.raises(ValidationError):
        _case_validator().validate(invalid_action)


@pytest.mark.parametrize(
    "kind",
    [
        "app-graph",
        "validation-report",
        "response",
        "action-invocation",
        "data-source-result",
        "route-state",
        "rendered-output",
    ],
)
def test_each_version_0_1_observation_kind_passes(kind: str) -> None:
    _case_validator().validate(_case_with_expectation(kind))


@pytest.mark.parametrize(
    "kind",
    [
        "app-graph",
        "validation-report",
        "response",
        "action-invocation",
        "data-source-result",
        "route-state",
        "rendered-output",
    ],
)
def test_each_version_0_1_normalized_observation_kind_passes(kind: str) -> None:
    _definition_validator("NormalizedObservation").validate(_observation(kind))


@pytest.mark.parametrize(
    "kind", ["response", "action-invocation", "data-source-result"]
)
def test_durable_external_evidence_is_deferred(kind: str) -> None:
    case = _case_with_expectation(kind)
    case["expectedObservations"][0]["requiredEvidence"] = "durable-external"
    with pytest.raises(ValidationError):
        _case_validator().validate(case)

    observation = _observation(kind)
    observation["evidenceClass"] = "durable-external"
    with pytest.raises(ValidationError):
        _definition_validator("NormalizedObservation").validate(observation)


@pytest.mark.parametrize("kind", ["resource-result", "integrity-result", "x-custom"])
def test_unexercised_or_extension_observation_kinds_are_rejected(kind: str) -> None:
    case = _fixture("valid-case.json")
    case["expectedObservations"][0]["kind"] = kind
    with pytest.raises(ValidationError):
        _case_validator().validate(case)


def test_normalized_observation_union_is_closed() -> None:
    observation = _observation("rendered-output")
    observation["selector"] = "#node"
    with pytest.raises(ValidationError):
        _definition_validator("NormalizedObservation").validate(observation)

    observation = _observation("rendered-output")
    observation["payload"]["providerState"] = "ready"
    with pytest.raises(ValidationError):
        _definition_validator("NormalizedObservation").validate(observation)


def test_validation_observation_accepts_duplicate_issues_for_set_comparison() -> None:
    observation = _observation("validation-report")
    observation["payload"]["issues"].append(
        {"path": "consent", "code": "CONSTRAINT_FAILED"}
    )

    _definition_validator("NormalizedObservation").validate(observation)

def test_validation_issue_expectations_pin_path_and_code() -> None:
    case = _case_with_expectation("validation-report")
    issue = case["expectedObservations"][0]["containsIssues"][0]
    assert issue == {"path": "consent", "code": "CONSTRAINT_FAILED"}

    del issue["path"]
    with pytest.raises(ValidationError):
        _case_validator().validate(case)

def test_validation_subject_is_an_exact_definition_bind() -> None:
    case = _case_with_expectation("validation-report")
    case["expectedObservations"][0]["subject"]["subjectKind"] = (
        "definition-shape"
    )

    with pytest.raises(ValidationError):
        _case_validator().validate(case)


def test_normalized_validation_issues_require_path_and_code() -> None:
    observation = _observation("validation-report")
    observation["payload"]["issues"] = [
        {"path": "acceptNotices", "code": "CONSTRAINT_FAILED"}
    ]
    _definition_validator("NormalizedObservation").validate(observation)

    del observation["payload"]["issues"][0]["code"]
    with pytest.raises(ValidationError):
        _definition_validator("NormalizedObservation").validate(observation)


@pytest.mark.parametrize(
    ("kind", "field"),
    [
        ("validation-report", "responseRevision"),
        ("response", "responseRevision"),
        ("response", "responseDigest"),
    ],
)
def test_response_observations_require_complete_identity(
    kind: str,
    field: str,
) -> None:
    observation = _observation(kind)
    del observation["payload"][field]

    with pytest.raises(ValidationError):
        _definition_validator("NormalizedObservation").validate(observation)


@pytest.mark.parametrize("kind", ["validation-report", "response"])
def test_response_observation_revision_is_non_negative(kind: str) -> None:
    observation = _observation(kind)
    observation["payload"]["responseRevision"] = -1

    with pytest.raises(ValidationError):
        _definition_validator("NormalizedObservation").validate(observation)


@pytest.mark.parametrize("kind", ["validation-report", "response"])
def test_definition_expectations_require_exact_subject(kind: str) -> None:
    case = _case_with_expectation(kind)
    del case["expectedObservations"][0]["subject"]

    with pytest.raises(ValidationError):
        _case_validator().validate(case)

def test_response_expectation_requires_exact_definition_item() -> None:
    case = _case_with_expectation("response")
    expectation = case["expectedObservations"][0]
    del expectation["item"]

    with pytest.raises(ValidationError):
        _case_validator().validate(case)

    expectation["item"] = {
        "path": "consent",
        "presence": "present",
        "value": False,
    }
    expectation["subject"]["subjectKind"] = "definition-shape"
    with pytest.raises(ValidationError):
        _case_validator().validate(case)


def test_closed_expectation_rejects_extra_fields() -> None:
    case = _fixture("valid-case.json")
    case["expectedObservations"][0]["selector"] = "#schedule"
    with pytest.raises(ValidationError):
        _case_validator().validate(case)


def test_data_source_expectation_accepts_response_record_correlation() -> None:
    case = _case_with_expectation("data-source-result")
    case["expectedObservations"][0]["recordStepRef"] = "write-response"
    _case_validator().validate(case)


def test_app_graph_requires_structural_evidence() -> None:
    case = _case_with_expectation("app-graph")
    case["expectedObservations"][0]["requiredEvidence"] = "runtime"
    with pytest.raises(ValidationError):
        _case_validator().validate(case)


def test_present_response_item_requires_value() -> None:
    case = _case_with_expectation("response")
    del case["expectedObservations"][0]["item"]["value"]
    with pytest.raises(ValidationError):
        _case_validator().validate(case)


def test_absent_response_item_forbids_value() -> None:
    case = _case_with_expectation("response")
    case["expectedObservations"][0]["item"]["presence"] = "absent"
    with pytest.raises(ValidationError):
        _case_validator().validate(case)


def test_unavailable_source_forbids_freshness_and_value_identity() -> None:
    case = _case_with_expectation("data-source-result")
    case["expectedObservations"][0]["state"] = "unavailable"
    with pytest.raises(ValidationError):
        _case_validator().validate(case)


def test_rendered_output_requires_current_committed_output() -> None:
    case = _case_with_expectation("rendered-output")
    case["expectedObservations"][0]["rendered"] = False
    with pytest.raises(ValidationError):
        _case_validator().validate(case)

    observation = _observation("rendered-output")
    observation["payload"]["rendered"] = False
    with pytest.raises(ValidationError):
        _definition_validator("NormalizedObservation").validate(observation)


def test_owner_vocabularies_are_referenced_not_copied() -> None:
    response_status = CASE_SCHEMA["$defs"]["ExpectedResponseObservation"]["allOf"][1][
        "properties"
    ]["status"]["$ref"]
    action_terminal = CASE_SCHEMA["$defs"]["ExpectedActionInvocationObservation"][
        "allOf"
    ][1]["properties"]["terminal"]["$ref"]
    data_state = CASE_SCHEMA["$defs"]["ExpectedDataSourceResultObservation"]["allOf"][
        1
    ]["properties"]["state"]["$ref"]

    assert response_status.endswith("response/1.0#/$defs/ResponseStatus")
    assert action_terminal.endswith(
        "responseActions/1.0#/$defs/ActionTerminalStatus"
    )
    assert data_state.endswith("dataSources/1.0#/$defs/DataSourceLoadState")

    assert RESPONSE_SCHEMA["properties"]["status"]["$ref"] == (
        "#/$defs/ResponseStatus"
    )
    assert RESPONSE_ACTIONS_SCHEMA["$defs"]["ActionInvocationStatus"]["enum"] == [
        "unresolved",
        "blocked",
        "failed",
        "deferred",
        "completed",
    ]
    assert DATA_SOURCES_SCHEMA["$defs"]["DataSourceLoadState"]["enum"] == [
        "loaded",
        "unavailable",
    ]

    effect_defs = [
        entry["$ref"].split("/")[-1]
        for entry in RESPONSE_ACTIONS_SCHEMA["$defs"]["EffectRequest"]["oneOf"]
    ]
    declared_effect_types = [
        RESPONSE_ACTIONS_SCHEMA["$defs"][name]["properties"]["type"]["const"]
        for name in effect_defs
    ]
    assert RESPONSE_ACTIONS_SCHEMA["$defs"]["ActionEffectType"]["enum"] == (
        declared_effect_types
    )


def test_report_rejects_need_satisfaction_claim() -> None:
    report = _fixture("valid-report.json")
    report["claimScope"]["needSatisfaction"] = "satisfied"
    with pytest.raises(ValidationError):
        _report_validator().validate(report)


def test_report_is_closed() -> None:
    report = _fixture("valid-report.json")
    report["credentials"] = {"token": "secret"}
    with pytest.raises(ValidationError):
        _report_validator().validate(report)


def test_report_requires_a_closed_execution_receipt() -> None:
    report = _fixture("valid-report.json")
    del report["executionReceipt"]["evidenceDigest"]
    with pytest.raises(ValidationError):
        _report_validator().validate(report)

    report = _fixture("valid-report.json")
    report["executionReceipt"]["token"] = "not-admitted"
    with pytest.raises(ValidationError):
        _report_validator().validate(report)


def test_open_route_binding_accepts_qualified_data_source_requests() -> None:
    report = _fixture("valid-report.json")
    report["bindings"][0]["dataSourceRequestIds"] = ["source-request/1"]
    _report_validator().validate(report)


def test_open_route_binding_rejects_empty_data_source_request_list() -> None:
    report = _fixture("valid-report.json")
    report["bindings"][0]["dataSourceRequestIds"] = []
    with pytest.raises(ValidationError):
        _report_validator().validate(report)


def test_comparator_request_is_closed_and_uses_complete_case() -> None:
    request = {
        "case": _fixture("valid-case.json"),
        "caseDigest": DIGEST,
        "lintClearanceDigest": DIGEST,
        "actionPlanSetDigest": DIGEST,
        "pairedSources": [
            {
                "artifactRef": "https://example.org/apps/control",
                "artifactDigest": DIGEST,
            }
        ],
        "generatedAt": "2026-07-31T12:00:01Z",
        "run": {
            "runId": "run/1",
            "admissionContextDigest": DIGEST,
            "target": {
                "class": "preview",
                "ref": "preview://control",
                "buildRef": "urn:formspec:build:control",
                "buildDigest": DIGEST,
                "implementations": {
                    name: {
                        "id": f"example/{name}",
                        "version": "0.1.0",
                        "digest": DIGEST,
                    }
                    for name in (
                        "host",
                        "renderer",
                        "runner",
                        "runtime",
                        "verifier",
                        "adapter",
                    )
                },
                "implementationSetDigest": DIGEST,
                "targetIdentityDigest": DIGEST,
            },
        },
        "bindings": [],
        "boundary": {
            "startedAt": "2026-07-31T12:00:00Z",
            "endedAt": "2026-07-31T12:00:01Z",
        },
        "observations": [],
    }
    wrapper = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": (
            "https://formspec.org/schemas/outcomeVerificationReport/0.1"
            "#/$defs/ComparatorRequest"
        ),
    }
    validator = Draft202012Validator(
        wrapper,
        registry=REGISTRY,
        format_checker=Draft202012Validator.FORMAT_CHECKER,
    )
    validator.validate(request)

    invalid = copy.deepcopy(request)
    invalid["selector"] = "#app"
    with pytest.raises(ValidationError):
        validator.validate(invalid)

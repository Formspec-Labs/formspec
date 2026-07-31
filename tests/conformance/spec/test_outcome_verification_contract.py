"""Normative contract checks for Outcome Verification v0.1."""

from __future__ import annotations

import json

from tests.unit.support.schema_fixtures import SCHEMA_DIR, SPEC_DIR


CASE_SCHEMA = json.loads(
    (SCHEMA_DIR / "outcome-verification-case.schema.json").read_text(
        encoding="utf-8"
    )
)
REPORT_SCHEMA = json.loads(
    (SCHEMA_DIR / "outcome-verification-report.schema.json").read_text(
        encoding="utf-8"
    )
)
OUTCOME_SPEC = (
    SPEC_DIR / "observability" / "outcome-verification-spec.md"
).read_text(encoding="utf-8")


RULE_CATALOG = (
    (
        "app-graph/app-graph-validator-spec.md",
        "1.0.0-draft.1",
        "rendered-node.direct-need-trace",
    ),
    ("surface/surface-spec.md", "0.2.0-draft.1", "rendering.semantic-output"),
    (
        "surface/surface-spec.md",
        "0.2.0-draft.1",
        "routing.current-route-state",
    ),
    (
        "data-sources/data-sources-spec.md",
        "1.0.0-draft.1",
        "loader.qualified-result",
    ),
    ("core/spec.md", "1.0.0-draft.1", "response.snapshot-status"),
    ("core/spec.md", "1.0.0-draft.1", "validation.constraint-result"),
    (
        "response-actions/response-actions-spec.md",
        "1.0.0-draft.1",
        "invocation.blocking-gate",
    ),
)


def _observation_refs(schema: dict) -> list[str]:
    return [
        entry["$ref"].split("/")[-1]
        for entry in schema["$defs"]["ExpectedObservation"]["oneOf"]
    ]


def test_case_and_report_markers_are_version_0_1() -> None:
    assert (
        CASE_SCHEMA["properties"]["$formspecOutcomeVerificationCase"]["const"]
        == "0.1"
    )
    assert (
        REPORT_SCHEMA["properties"]["$formspecOutcomeVerificationReport"]["const"]
        == "0.1"
    )


def test_version_0_1_has_exactly_seven_observation_kinds() -> None:
    assert _observation_refs(CASE_SCHEMA) == [
        "ExpectedAppGraphObservation",
        "ExpectedValidationReportObservation",
        "ExpectedResponseObservation",
        "ExpectedActionInvocationObservation",
        "ExpectedDataSourceResultObservation",
        "ExpectedRouteStateObservation",
        "ExpectedRenderedOutputObservation",
    ]
    serialized = json.dumps(CASE_SCHEMA)
    assert '"resource-result"' not in serialized
    assert '"integrity-result"' not in serialized

    normalized_refs = [
        entry["$ref"].split("/")[-1]
        for entry in REPORT_SCHEMA["$defs"]["NormalizedObservation"]["oneOf"]
    ]
    assert normalized_refs == [
        "NormalizedAppGraphObservation",
        "NormalizedValidationReportObservation",
        "NormalizedResponseObservation",
        "NormalizedActionInvocationObservation",
        "NormalizedDataSourceResultObservation",
        "NormalizedRouteStateObservation",
        "NormalizedRenderedOutputObservation",
    ]
    assert "durable-external" not in json.dumps(CASE_SCHEMA)
    assert "durable-external" not in json.dumps(REPORT_SCHEMA)
    assert "version 0.1 rejects the run" in OUTCOME_SPEC


def test_cases_and_reports_are_closed() -> None:
    assert CASE_SCHEMA["additionalProperties"] is False
    assert REPORT_SCHEMA["additionalProperties"] is False

    for name in (
        "OpenRouteStep",
        "SetItemStep",
        "ActivateControlStep",
        "CheckpointStep",
        "QualifiedSubjectRef",
        "EffectTraceEntry",
    ):
        assert CASE_SCHEMA["$defs"][name]["additionalProperties"] is False

    for name in (
        "OpenRouteBinding",
        "SetItemBinding",
        "ActivateControlBinding",
        "CheckpointBinding",
        "ExpectationResult",
        "ClaimScope",
        "Diagnostic",
        "ComparatorRequest",
    ):
        assert REPORT_SCHEMA["$defs"][name]["additionalProperties"] is False


def test_report_claim_scope_forbids_need_satisfaction() -> None:
    scope = REPORT_SCHEMA["$defs"]["ClaimScope"]["properties"]
    assert scope["claim"]["const"] == "declared-observations"
    assert scope["needSatisfaction"]["const"] == "not-asserted"
    assert "A processor MUST NOT produce `satisfied`" in OUTCOME_SPEC


def test_rendered_output_is_current_committed_positive_evidence() -> None:
    expected = CASE_SCHEMA["$defs"]["ExpectedRenderedOutputObservation"]["allOf"][
        1
    ]["properties"]["rendered"]
    observed = REPORT_SCHEMA["$defs"]["RenderedOutputObservedPayload"][
        "properties"
    ]["rendered"]

    assert expected == {"const": True}
    assert observed == {"const": True}
    assert "Two live publishers for one exact target are ambiguous." in OUTCOME_SPEC
    assert "MUST NOT convert absence into `rendered: false`" in OUTCOME_SPEC


def test_required_experience_and_caller_claim_gate_boundaries() -> None:
    assert "experience" in CASE_SCHEMA["required"]
    assert "The Experience document and starting Unit MUST resolve exactly" in (
        OUTCOME_SPEC
    )
    assert "Every expectation MUST cite at least one exact" in OUTCOME_SPEC
    assert "A rule reference does not create that mounted relationship." in (
        OUTCOME_SPEC
    )
    assert "does not define a persisted run-set" in OUTCOME_SPEC
    assert "explicit human approval" in OUTCOME_SPEC


def test_procedure_control_kinds_match_renderer_registry_ownership() -> None:
    set_control = CASE_SCHEMA["$defs"]["SetItemStep"]["properties"]["control"]
    activate_control = CASE_SCHEMA["$defs"]["ActivateControlStep"]["properties"][
        "control"
    ]

    assert set_control["$ref"].endswith("#/$defs/DefinitionItemControlRef")
    assert activate_control["$ref"].endswith(
        "#/$defs/ResponseActionControlRef"
    )
    assert (
        CASE_SCHEMA["$defs"]["DefinitionItemControlRef"]["properties"][
            "subjectKind"
        ]["const"]
        == "definition-item"
    )
    assert (
        CASE_SCHEMA["$defs"]["ResponseActionControlRef"]["properties"][
            "subjectKind"
        ]["const"]
        == "response-action"
    )
    assert "MUST mount the actual generic renderer" in OUTCOME_SPEC


def test_renderer_outputs_are_owner_scoped_and_need_traced() -> None:
    assert "exact `routeId/slotId` subject prefix" in OUTCOME_SPEC
    assert "owner-declared direct anchor" in OUTCOME_SPEC
    assert "out-of-scope" in OUTCOME_SPEC


def test_status_vocabularies_resolve_to_owner_schemas() -> None:
    response = CASE_SCHEMA["$defs"]["ExpectedResponseObservation"]["allOf"][1]
    action = CASE_SCHEMA["$defs"]["ExpectedActionInvocationObservation"]["allOf"][1]
    source = CASE_SCHEMA["$defs"]["ExpectedDataSourceResultObservation"]["allOf"][
        1
    ]
    effect = CASE_SCHEMA["$defs"]["EffectTraceEntry"]

    assert response["properties"]["status"]["$ref"].startswith(
        "https://formspec.org/schemas/response/1.0"
    )
    assert action["properties"]["terminal"]["$ref"].startswith(
        "https://formspec.org/schemas/responseActions/1.0"
    )
    assert effect["properties"]["type"]["$ref"].startswith(
        "https://formspec.org/schemas/responseActions/1.0"
    )
    assert effect["properties"]["status"]["$ref"].startswith(
        "https://formspec.org/schemas/responseActions/1.0"
    )
    assert source["properties"]["state"]["$ref"].startswith(
        "https://formspec.org/schemas/dataSources/1.0"
    )
    assert source["properties"]["freshness"]["$ref"].startswith(
        "https://formspec.org/schemas/dataSources/1.0"
    )


def test_response_observations_pin_complete_response_identity() -> None:
    validation = REPORT_SCHEMA["$defs"]["ValidationReportObservedPayload"]
    response = REPORT_SCHEMA["$defs"]["ResponseObservedPayload"]

    assert validation["required"] == [
        "definitionRef",
        "definitionDigest",
        "responseId",
        "responseRevision",
        "valid",
        "issues",
    ]
    assert "codes" not in validation["properties"]
    assert "uniqueItems" not in validation["properties"]["issues"]
    assert validation["properties"]["issues"]["items"]["$ref"] == (
        "#/$defs/ValidationIssueObserved"
    )
    assert validation["properties"]["responseRevision"]["minimum"] == 0

    expected_validation = CASE_SCHEMA["$defs"][
        "ExpectedValidationReportObservation"
    ]["allOf"][1]["properties"]
    assert expected_validation["subject"]["$ref"] == (
        "#/$defs/ValidationSubjectRef"
    )
    assert (
        CASE_SCHEMA["$defs"]["ValidationSubjectRef"]["allOf"][1]["properties"][
            "subjectKind"
        ]["const"]
        == "definition-bind"
    )
    assert expected_validation["containsIssues"]["items"]["$ref"] == (
        "#/$defs/ValidationIssueExpectation"
    )

    expected_response = CASE_SCHEMA["$defs"]["ExpectedResponseObservation"][
        "allOf"
    ][1]
    assert "item" in expected_response["required"]
    assert expected_response["properties"]["subject"]["$ref"] == (
        "#/$defs/ResponseSubjectRef"
    )
    assert (
        CASE_SCHEMA["$defs"]["ResponseSubjectRef"]["allOf"][1]["properties"][
            "subjectKind"
        ]["const"]
        == "definition-item"
    )

    assert response["required"] == [
        "definitionRef",
        "definitionDigest",
        "responseId",
        "responseRevision",
        "responseDigest",
        "status",
    ]
    assert response["properties"]["responseRevision"]["minimum"] == 0
    assert response["properties"]["responseDigest"]["$ref"].endswith(
        "outcomeVerificationCase/0.1#/$defs/Digest"
    )
    assert "canonical complete Response snapshot" in OUTCOME_SPEC


def test_stable_rule_catalog_matches_owner_specs() -> None:
    for relative_path, version, rule_id in RULE_CATALOG:
        owner = (SPEC_DIR / relative_path).read_text(encoding="utf-8")
        assert f"version: {version}" in owner
        assert f"`{rule_id}`" in owner
        assert f"`{version}`" in OUTCOME_SPEC
        assert f"`{rule_id}`" in OUTCOME_SPEC


def test_experience_owns_completion_shape_and_needs_owns_resolution() -> None:
    experience = (SPEC_DIR / "experience" / "experience-spec.md").read_text(
        encoding="utf-8"
    )
    needs = (SPEC_DIR / "needs" / "needs-spec.md").read_text(encoding="utf-8")

    assert "Experience owns this shape and its abstract meaning." in experience
    assert "This section owns how those citations resolve" in needs
    assert "prohibition against computed Need satisfaction" in experience


def test_procedure_has_no_direct_executor_or_script_step() -> None:
    step_refs = [
        entry["$ref"].split("/")[-1]
        for entry in CASE_SCHEMA["$defs"]["ProcedureStep"]["oneOf"]
    ]
    assert step_refs == [
        "OpenRouteStep",
        "SetItemStep",
        "ActivateControlStep",
        "CheckpointStep",
    ]
    assert "direct Action-executor" in OUTCOME_SPEC


def test_comparator_request_is_an_in_memory_definition() -> None:
    assert "ComparatorRequest" in REPORT_SCHEMA["$defs"]
    assert "ComparatorRequest" not in REPORT_SCHEMA["properties"]
    assert "lintClearanceDigest" in REPORT_SCHEMA["required"]
    assert (
        "lintClearanceDigest"
        in REPORT_SCHEMA["$defs"]["ComparatorRequest"]["required"]
    )
    assert "reportId" not in REPORT_SCHEMA["$defs"]["ComparatorRequest"][
        "properties"
    ]
    assert REPORT_SCHEMA["properties"]["id"]["pattern"] == (
        "^urn:formspec:outcome-report:[0-9a-f]{64}$"
    )
    assert "a caller MUST NOT supply the id" in OUTCOME_SPEC
    assert "not a third persisted" in OUTCOME_SPEC


def test_report_carries_the_complete_resolved_target_identity() -> None:
    target = REPORT_SCHEMA["$defs"]["ResolvedTargetIdentity"]
    assert target["required"] == [
        "class",
        "ref",
        "buildRef",
        "buildDigest",
        "implementations",
        "implementationSetDigest",
        "targetIdentityDigest",
    ]
    assert target["properties"]["implementations"]["$ref"] == (
        "#/$defs/ComparatorImplementations"
    )
    assert REPORT_SCHEMA["$defs"]["RunIdentity"]["required"] == [
        "runId",
        "admissionContextDigest",
        "target",
    ]
    assert "implementationSetDigest" not in REPORT_SCHEMA["properties"]
    assert "verifier" not in REPORT_SCHEMA["properties"]
    assert (
        "implementations"
        not in REPORT_SCHEMA["$defs"]["ComparatorRequest"]["properties"]
    )
    assert "targetIdentityDigest" in REPORT_SCHEMA["properties"]["id"][
        "description"
    ]
    assert "actionPlanSetDigest" in REPORT_SCHEMA["required"]
    assert "executionReceipt" in REPORT_SCHEMA["required"]
    assert REPORT_SCHEMA["$defs"]["ExecutionReceiptRef"]["required"] == [
        "ref",
        "evidenceDigest",
    ]


def test_data_source_write_read_correlation_is_explicit() -> None:
    expected = CASE_SCHEMA["$defs"][
        "ExpectedDataSourceResultObservation"
    ]["allOf"][1]["properties"]
    assert expected["recordStepRef"]["type"] == "string"
    assert "response-producing step" in expected["recordStepRef"][
        "description"
    ]


def test_route_state_has_exact_subject_and_distinct_route_instance() -> None:
    expected = CASE_SCHEMA["$defs"]["ExpectedRouteStateObservation"][
        "allOf"
    ][1]
    assert "subject" in expected["required"]
    assert expected["properties"]["subject"]["$ref"] == (
        "#/$defs/RouteSubjectRef"
    )
    assert (
        CASE_SCHEMA["$defs"]["RouteSubjectRef"]["allOf"][1]["properties"][
            "subjectKind"
        ]["const"]
        == "surface-route"
    )
    payload = REPORT_SCHEMA["$defs"]["RouteStateObservedPayload"]
    assert "routeInstanceId" in payload["required"]
    assert "renderInstanceId" not in payload["properties"]

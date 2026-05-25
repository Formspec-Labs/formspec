"""Integrity checks for UI Graph Policy host-loaded evidence fixtures."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from tests.unit.support.schema_fixtures import load_schema


ROOT = Path(__file__).resolve().parents[2]
FIXTURE_DIR = ROOT / "tests" / "conformance" / "fixtures" / "ui-graph-policy" / "host-loaded"
POLICY_SCHEMA_ID = "https://formspec.org/schemas/uiGraphPolicy/0.1"
POLICY_VALIDATOR = Draft202012Validator(
    load_schema("ui-graph-policy.schema.json"),
    format_checker=Draft202012Validator.FORMAT_CHECKER,
)

EXPECTED_CASES = {"valid-host-loaded-ui-graph-policy"}
CASE_KEYS = {"caseId", "hostEvidence", "expectedSourcePointers"}
HOST_EVIDENCE_KEYS = {"uiGraphPolicies"}
POLICY_EVIDENCE_KEYS = {"schemaId", "source", "document"}
SOURCE_POINTER_KEYS = {"artifactSlot", "source", "jsonPointer"}

FORBIDDEN_KEYS = {
    "$wireframeUiPolicy",
    "actor",
    "actors",
    "allowedActors",
    "appManifest",
    "artifactKind",
    "artifacts",
    "authorization",
    "fieldPolicy",
    "filename",
    "identity",
    "identityFromPath",
    "localPath",
    "pathIdentity",
    "permission",
    "permissions",
    "ref",
    "routeAuthorization",
    "slot",
    "sourcePath",
    "uiGraphPolicy",
    "uiPolicy",
    "widgetPolicy",
}

FORBIDDEN_STRING_FRAGMENTS = (
    "/Users/",
    "\\Users\\",
    "tests/conformance",
    ".case.json",
    ".fixture",
)


def _fixture_cases() -> list[tuple[Path, dict[str, Any]]]:
    cases: list[tuple[Path, dict[str, Any]]] = []
    for path in sorted(FIXTURE_DIR.glob("*.case.json")):
        payload = json.loads(path.read_text())
        assert payload["version"] == "0.1"
        assert isinstance(payload.get("cases"), list) and payload["cases"]
        for case in payload["cases"]:
            cases.append((path, case))
    return cases


def _walk(value: Any) -> Any:
    if isinstance(value, dict):
        for key, child in value.items():
            yield key, child
            yield from _walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk(child)


def _resolve_pointer(document: Any, pointer: str) -> Any:
    current = document
    for raw_part in pointer.lstrip("/").split("/"):
        part = raw_part.replace("~1", "/").replace("~0", "~")
        if isinstance(current, list):
            current = current[int(part)]
        else:
            current = current[part]
    return current


def _policy_by_artifact_slot(case: dict[str, Any], artifact_slot: str) -> dict[str, Any]:
    match = re.fullmatch(r"hostEvidence\.uiGraphPolicies\[(\d+)\]", artifact_slot)
    assert match is not None, f"{case['caseId']}: invalid artifactSlot {artifact_slot!r}"
    policies = case["hostEvidence"]["uiGraphPolicies"]
    return policies[int(match.group(1))]


def test_host_loaded_policy_fixtures_cover_required_cases() -> None:
    cases = _fixture_cases()
    assert {case["caseId"] for _, case in cases} == EXPECTED_CASES


def test_host_loaded_policy_evidence_is_explicit_and_schema_valid() -> None:
    for path, case in _fixture_cases():
        assert set(case) == CASE_KEYS, f"{path.name}/{case['caseId']}: unexpected case keys"
        host_evidence = case["hostEvidence"]
        assert set(host_evidence) == HOST_EVIDENCE_KEYS

        policies = host_evidence["uiGraphPolicies"]
        assert isinstance(policies, list) and policies
        for policy in policies:
            assert set(policy) == POLICY_EVIDENCE_KEYS
            assert policy["schemaId"] == POLICY_SCHEMA_ID
            assert isinstance(policy["source"], str) and policy["source"].startswith("host://")
            POLICY_VALIDATOR.validate(policy["document"])


def test_host_loaded_policy_source_pointers_are_diagnostic_only() -> None:
    for _, case in _fixture_cases():
        pointers = case["expectedSourcePointers"]
        assert isinstance(pointers, list) and pointers
        for pointer in pointers:
            assert set(pointer) == SOURCE_POINTER_KEYS
            policy = _policy_by_artifact_slot(case, pointer["artifactSlot"])
            assert pointer["source"] == policy["source"]
            json_pointer = pointer["jsonPointer"]
            assert isinstance(json_pointer, str) and json_pointer.startswith("/")
            assert _resolve_pointer(policy["document"], json_pointer) is not None


def test_host_loaded_policy_fixtures_do_not_promote_resolver_or_auth_boundaries() -> None:
    for path, case in _fixture_cases():
        for key, value in _walk(case):
            assert key not in FORBIDDEN_KEYS, f"{path.name}/{case['caseId']}: forbidden key {key}"
            if isinstance(value, str):
                for fragment in FORBIDDEN_STRING_FRAGMENTS:
                    assert fragment not in value, (
                        f"{path.name}/{case['caseId']}: forbidden string {fragment}"
                    )

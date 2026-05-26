"""Integrity checks for AppGraphValidator Surface Response Actions trigger fixtures."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
FIXTURE_PATH = (
    ROOT
    / "tests"
    / "conformance"
    / "fixtures"
    / "app-graph-validator"
    / "surface-response-action-triggers.case.json"
)

REQUIRED_CASES = {
    "surface-trigger-resolves-action-id",
    "surface-trigger-resolves-closed-intent",
    "surface-trigger-resolves-x-action-id",
    "surface-trigger-rejects-ambiguous-closed-intent",
    "surface-trigger-rejects-direct-x-intent",
    "surface-trigger-rejects-empty-trigger",
    "surface-trigger-rejects-undeclared-closed-intent",
    "surface-trigger-rejects-unknown-runtime-command",
}

EXPECTED_CODES = {
    "surface-trigger-rejects-ambiguous-closed-intent": "APP-GRAPH-SURFACE-RESPONSE-ACTION-TRIGGER",
    "surface-trigger-rejects-direct-x-intent": "APP-GRAPH-SURFACE-RESPONSE-ACTION-TRIGGER",
    "surface-trigger-rejects-empty-trigger": "APP-GRAPH-SURFACE-RESPONSE-ACTION-TRIGGER",
    "surface-trigger-rejects-undeclared-closed-intent": "APP-GRAPH-SURFACE-RESPONSE-ACTION-TRIGGER",
    "surface-trigger-rejects-unknown-runtime-command": "APP-GRAPH-SURFACE-RESPONSE-ACTION-TRIGGER",
}

FORBIDDEN_KEYS = {
    "actor",
    "actors",
    "allowedActors",
    "authorization",
    "fieldPolicy",
    "fixture",
    "filename",
    "hostEvidence",
    "identityFromPath",
    "localPath",
    "pathIdentity",
    "permission",
    "permissions",
    "routeAuthorization",
    "runtimeCommand",
    "runtimePlan",
    "sourcePath",
    "traceIndex",
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

SUMMARY_KEYS = {
    "artifacts",
    "loadedArtifacts",
    "schemaFailures",
    "unvalidatedArtifacts",
    "graphErrors",
    "errors",
    "warnings",
    "infos",
    "importedDiagnostics",
    "unsupportedFeatures",
    "skippedPhases",
}


def _corpus() -> dict[str, Any]:
    return json.loads(FIXTURE_PATH.read_text())


def _walk(value: Any) -> Any:
    if isinstance(value, dict):
        for key, child in value.items():
            yield key, child
            yield from _walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk(child)


def _assert_handle(handle: dict[str, Any]) -> None:
    assert handle["status"] == "loaded"
    assert isinstance(handle.get("slot"), str)
    assert isinstance(handle.get("artifactKind"), str)
    assert isinstance(handle.get("source"), str)
    assert "document" in handle


def test_surface_response_action_trigger_fixture_covers_required_cases() -> None:
    ids = {case["id"] for case in _corpus()["cases"]}
    assert ids == REQUIRED_CASES


def test_surface_response_action_trigger_fixture_sources_are_explicit() -> None:
    corpus = _corpus()
    handles = corpus["handles"]
    for handle in handles.values():
        _assert_handle(handle)

    for case in corpus["cases"]:
        assert case["request"]["manifest"] in handles
        for group_refs in case["request"].get("artifacts", {}).values():
            for handle_ref in group_refs:
                assert handle_ref in handles


def test_surface_response_action_trigger_expected_diagnostics_are_app_graph_owned() -> None:
    for case in _corpus()["cases"]:
        expected = case["expected"]
        assert isinstance(expected["ok"], bool)
        assert isinstance(expected["summary"], dict)
        assert set(expected["summary"]) == SUMMARY_KEYS
        diagnostics = expected["diagnostics"]
        if case["id"] in EXPECTED_CODES:
            assert len(diagnostics) == 1
            assert diagnostics[0]["code"] == EXPECTED_CODES[case["id"]]
        else:
            assert diagnostics == []
        for diagnostic in diagnostics:
            assert diagnostic["code"].startswith("APP-GRAPH-SURFACE-")
            source = diagnostic.get("primarySource")
            assert isinstance(source, dict)
            assert source.get("artifactKind") == "surface"
            assert isinstance(source.get("artifactSlot"), str)
            assert isinstance(source.get("source"), str)
            assert isinstance(source.get("jsonPointer"), str)


def test_surface_response_action_trigger_fixture_keeps_runtime_plan_trace_host_evidence_and_auth_out() -> None:
    for key, value in _walk(_corpus()):
        assert key not in FORBIDDEN_KEYS, f"forbidden key {key}"
        if isinstance(value, str):
            for fragment in FORBIDDEN_STRING_FRAGMENTS:
                assert fragment not in value, f"forbidden string {fragment}"

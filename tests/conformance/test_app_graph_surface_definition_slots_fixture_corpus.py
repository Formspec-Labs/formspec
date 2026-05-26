"""Integrity checks for AppGraphValidator Surface definition-form slot cross-artifact fixtures.

Pins the Surface definition-form slot binding cross-artifact source conformance corpus.
Validates corpus structure, required cases, expected diagnostic code, and
non-promotion of v4 spike contracts (Runtime Plan, fixture paths as identity,
authorization fields, TraceIndex, host evidence).
"""

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
    / "surface-definition-slots.case.json"
)

REQUIRED_CASES = {
    "definition-form-slot-resolves",
    "definition-form-slot-undeclared-fails-closed",
    "surface-without-definition-form-slots-no-diagnostic",
    "definition-form-slot-resolves-among-multiple-definitions",
}

EXPECTED_DIAGNOSTIC_COUNTS = {
    "definition-form-slot-resolves": 0,
    "definition-form-slot-undeclared-fails-closed": 1,
    "surface-without-definition-form-slots-no-diagnostic": 0,
    "definition-form-slot-resolves-among-multiple-definitions": 0,
}

EXPECTED_CODE = "APP-GRAPH-SURFACE-DEFINITION-SLOT"

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


def test_surface_definition_slot_fixture_covers_required_cases() -> None:
    ids = {case["id"] for case in _corpus()["cases"]}
    assert ids == REQUIRED_CASES


def test_surface_definition_slot_fixture_sources_are_explicit() -> None:
    corpus = _corpus()
    handles = corpus["handles"]
    for handle in handles.values():
        _assert_handle(handle)

    for case in corpus["cases"]:
        assert case["request"]["manifest"] in handles
        for group_refs in case["request"].get("artifacts", {}).values():
            for handle_ref in group_refs:
                assert handle_ref in handles


def test_surface_definition_slot_expected_diagnostics_are_app_graph_owned() -> None:
    for case in _corpus()["cases"]:
        expected = case["expected"]
        assert isinstance(expected["ok"], bool)
        assert isinstance(expected["summary"], dict)
        assert set(expected["summary"]) == SUMMARY_KEYS
        diagnostics = expected["diagnostics"]
        assert len(diagnostics) == EXPECTED_DIAGNOSTIC_COUNTS[case["id"]]
        for diagnostic in diagnostics:
            assert diagnostic["code"] == EXPECTED_CODE
            source = diagnostic.get("primarySource")
            assert isinstance(source, dict)
            assert source.get("artifactKind") == "surface"
            assert isinstance(source.get("artifactSlot"), str)
            assert isinstance(source.get("source"), str)
            assert isinstance(source.get("jsonPointer"), str)
            assert diagnostic["details"]["reason"] == "definition-not-declared"


def test_surface_definition_slot_fixture_keeps_runtime_plan_trace_host_evidence_and_auth_out() -> None:
    # Surface schema legitimately carries `slots` (route slot list) — not in FORBIDDEN.
    # Definition schema legitimately carries items[].label, items[].dataType — not in FORBIDDEN.
    for key, value in _walk(_corpus()):
        assert key not in FORBIDDEN_KEYS, f"forbidden key {key}"
        if isinstance(value, str):
            for fragment in FORBIDDEN_STRING_FRAGMENTS:
                assert fragment not in value, f"forbidden string {fragment}"

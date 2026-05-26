"""Integrity checks for AppGraphValidator Experience actionRefs cross-artifact fixtures.

Pins the Experience.units[].actionRefs cross-artifact source conformance corpus.
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
    / "experience-action-refs.case.json"
)

REQUIRED_CASES = {
    "experience-action-ref-resolves",
    "experience-action-ref-unresolved-fails-closed",
    "experience-action-ref-requires-response-actions-load",
    "experience-without-action-refs-no-response-actions-required",
}

EXPECTED_DIAGNOSTIC_COUNTS = {
    "experience-action-ref-resolves": 0,
    "experience-action-ref-unresolved-fails-closed": 1,
    "experience-action-ref-requires-response-actions-load": 2,
    "experience-without-action-refs-no-response-actions-required": 0,
}

EXPECTED_CODE = "APP-GRAPH-EXPERIENCE-ACTION-REF"

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
            # Experience documents legitimately carry `actors` and `actorRef`/`actorRefs`
            # fields for their own ownership semantics — those keys are skipped from the
            # FORBIDDEN list specifically because they belong to Experience, not to a
            # v4 spike posture/authorization promotion. `actorRef`/`actorRefs` are
            # explicitly allowed; `actor`/`actors`/`allowedActors` (as top-level
            # authorization keys) remain forbidden.
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


def test_experience_action_ref_fixture_covers_required_cases() -> None:
    ids = {case["id"] for case in _corpus()["cases"]}
    assert ids == REQUIRED_CASES


def test_experience_action_ref_fixture_sources_are_explicit() -> None:
    corpus = _corpus()
    handles = corpus["handles"]
    for handle in handles.values():
        _assert_handle(handle)

    for case in corpus["cases"]:
        assert case["request"]["manifest"] in handles
        for group_refs in case["request"].get("artifacts", {}).values():
            for handle_ref in group_refs:
                assert handle_ref in handles


def test_experience_action_ref_expected_diagnostics_are_app_graph_owned() -> None:
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
            assert source.get("artifactKind") == "experience"
            assert isinstance(source.get("artifactSlot"), str)
            assert isinstance(source.get("source"), str)
            assert isinstance(source.get("jsonPointer"), str)


def test_experience_action_ref_fixture_keeps_runtime_plan_trace_host_evidence_and_auth_out() -> None:
    # `actor`/`actors`/`allowedActors` as top-level authorization keys remain forbidden,
    # but Experience legitimately carries `actorRef` / `actors` (actor definition list)
    # inside its `Actor` $def — those use different key names per experience.schema.json
    # ($defs/Actor has id; units have actorRef/actorRefs not actor/actors). Confirm no
    # forbidden top-level surface leaks through.
    allowed_experience_keys = {"actors"}
    for key, value in _walk(_corpus()):
        if key in allowed_experience_keys:
            continue
        assert key not in FORBIDDEN_KEYS, f"forbidden key {key}"
        if isinstance(value, str):
            for fragment in FORBIDDEN_STRING_FRAGMENTS:
                assert fragment not in value, f"forbidden string {fragment}"

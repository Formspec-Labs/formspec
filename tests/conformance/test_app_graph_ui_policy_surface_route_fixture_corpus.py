"""Integrity checks for executable UI Graph Policy Surface/route fixtures."""

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
    / "ui-graph-policy-surface-routes.case.json"
)

REQUIRED_CASES = {
    "valid-policy-surface-routes",
    "surface-target-mismatch",
    "duplicate-route-policy",
    "unresolved-route-policy",
    "missing-route-policy",
    "unresolved-responsive-slot",
    "deferred-policy-families-not-emitted",
}

EXPECTED_CODES = {
    "surface-target-mismatch": "UI-POLICY-SURFACE-TARGET",
    "duplicate-route-policy": "UI-POLICY-ROUTE-COLLISION",
    "unresolved-route-policy": "UI-POLICY-ROUTE-REF",
    "missing-route-policy": "UI-POLICY-ROUTE-MISSING",
    "unresolved-responsive-slot": "UI-POLICY-RESPONSIVE-SLOT",
}

FORBIDDEN_KEYS = {
    "actor",
    "actors",
    "allowedActors",
    "authorization",
    "fieldPolicy",
    "fixture",
    "filename",
    "identityFromPath",
    "localPath",
    "pathIdentity",
    "permission",
    "permissions",
    "routeAuthorization",
    "sourcePath",
    "uiGraphPolicy",
    "uiPolicy",
    "widgetPolicy",
    "$wireframeUiPolicy",
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
    if handle["artifactKind"] == "surface":
        for route in handle["document"].get("routes", []):
            assert isinstance(route.get("id"), str)
            assert isinstance(route.get("path"), str)
            assert isinstance(route.get("slots"), list)
            for slot in route["slots"]:
                assert isinstance(slot.get("id"), str)
                assert isinstance(slot.get("slotType"), str)
                assert isinstance(slot.get("binding"), dict)


def _assert_policy_pointer(source: dict[str, Any]) -> None:
    assert source["artifactSlot"].startswith("hostEvidence.uiGraphPolicies[")
    assert set(source).issubset({"artifactSlot", "source", "jsonPointer"})
    assert isinstance(source.get("source"), str)
    assert isinstance(source.get("jsonPointer"), str)


def test_ui_graph_policy_surface_route_fixture_covers_required_cases() -> None:
    ids = {case["id"] for case in _corpus()["cases"]}
    assert ids == REQUIRED_CASES


def test_ui_graph_policy_surface_route_fixture_sources_are_explicit() -> None:
    corpus = _corpus()
    handles = corpus["handles"]
    policies = corpus["policies"]
    for handle in handles.values():
        _assert_handle(handle)
    for policy in policies.values():
        assert policy["schemaId"] == "https://formspec.org/schemas/uiGraphPolicy/0.1"
        assert policy["source"].startswith("host://policy/")
        assert "$formspecUiGraphPolicy" in policy["document"]

    for case in corpus["cases"]:
        assert case["request"]["manifest"] in handles
        for group_refs in case["request"].get("artifacts", {}).values():
            for handle_ref in group_refs:
                assert handle_ref in handles
        for policy_ref in case["request"]["hostEvidence"]["uiGraphPolicies"]:
            assert policy_ref in policies


def test_ui_graph_policy_surface_route_expected_diagnostics_are_policy_owned() -> None:
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
            primary = diagnostic.get("primarySource")
            assert isinstance(primary, dict)
            if primary["artifactSlot"].startswith("hostEvidence."):
                _assert_policy_pointer(primary)
            for related in diagnostic.get("relatedSources", []):
                if related["artifactSlot"].startswith("hostEvidence."):
                    _assert_policy_pointer(related)


def test_ui_graph_policy_surface_route_fixture_keeps_deferred_families_out() -> None:
    emitted_codes = {
        diagnostic["code"]
        for case in _corpus()["cases"]
        for diagnostic in case["expected"]["diagnostics"]
    }
    assert "LOCALE-KEY-OWNER" not in emitted_codes
    assert "LOCALE-KEY-OWNER-COLLISION" not in emitted_codes
    assert "THEME-TOKEN-WIDGET" not in emitted_codes
    assert "THEME-TOKEN-SLOT" not in emitted_codes
    assert "UI-POLICY-HIDDEN-DEFINITION-REF" not in emitted_codes


def test_ui_graph_policy_surface_route_fixtures_do_not_encode_path_identity_or_auth() -> None:
    for key, value in _walk(_corpus()):
        assert key not in FORBIDDEN_KEYS, f"forbidden key {key}"
        if isinstance(value, str):
            for fragment in FORBIDDEN_STRING_FRAGMENTS:
                assert fragment not in value, f"forbidden string {fragment}"

"""Integrity checks for executable UI Graph Policy hidden Definition fixtures."""

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
    / "ui-graph-policy-hidden-definitions.case.json"
)

REQUIRED_CASES = {
    "valid-hidden-definition",
    "unresolved-hidden-definition",
    "hidden-definition-not-route-local",
    "unresolved-route-skips-hidden-definition",
    "target-mismatch-skips-hidden-definition",
    "hidden-definition-version-mismatch",
}

EXPECTED_CODES = {
    "unresolved-hidden-definition": "UI-POLICY-HIDDEN-DEFINITION-REF",
    "hidden-definition-not-route-local": "UI-POLICY-HIDDEN-DEFINITION-REF",
    "unresolved-route-skips-hidden-definition": "UI-POLICY-ROUTE-REF",
    "target-mismatch-skips-hidden-definition": "UI-POLICY-SURFACE-TARGET",
    "hidden-definition-version-mismatch": "UI-POLICY-HIDDEN-DEFINITION-REF",
}

FORBIDDEN_KEYS = {
    "actor",
    "actors",
    "allowedActors",
    "authorization",
    "fieldPolicy",
    "fixture",
    "filename",
    "identity",
    "identityFromPath",
    "localPath",
    "moduleResolution",
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
    if handle["artifactKind"] == "definition":
        assert handle["slot"].startswith("definitions[")
        assert handle.get("ref", {}).get("url") == "https://example.gov/forms/intake"
    if handle["artifactKind"] == "surface":
        for route in handle["document"].get("routes", []):
            assert isinstance(route.get("id"), str)
            assert isinstance(route.get("path"), str)
            assert isinstance(route.get("slots"), list)


def _assert_policy_pointer(source: dict[str, Any]) -> None:
    assert source["artifactSlot"].startswith("hostEvidence.uiGraphPolicies[")
    assert set(source).issubset({"artifactSlot", "source", "jsonPointer"})
    assert isinstance(source.get("source"), str)
    assert isinstance(source.get("jsonPointer"), str)


def test_ui_graph_policy_hidden_definition_fixture_covers_required_cases() -> None:
    ids = {case["id"] for case in _corpus()["cases"]}
    assert ids == REQUIRED_CASES


def test_ui_graph_policy_hidden_definition_fixture_sources_are_explicit() -> None:
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


def test_ui_graph_policy_hidden_definition_expected_diagnostics_are_policy_owned() -> None:
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


def test_ui_graph_policy_hidden_definition_fixture_pins_cascade_guards() -> None:
    diagnostics_by_case = {
        case["id"]: [diagnostic["code"] for diagnostic in case["expected"]["diagnostics"]]
        for case in _corpus()["cases"]
    }
    assert diagnostics_by_case["unresolved-route-skips-hidden-definition"] == ["UI-POLICY-ROUTE-REF"]
    assert diagnostics_by_case["target-mismatch-skips-hidden-definition"] == ["UI-POLICY-SURFACE-TARGET"]


def test_ui_graph_policy_hidden_definition_fixtures_do_not_encode_path_identity_theme_or_auth() -> None:
    for key, value in _walk(_corpus()):
        assert key not in FORBIDDEN_KEYS, f"forbidden key {key}"
        if isinstance(value, str):
            assert "THEME-TOKEN-" not in value
            assert "TraceIndex" not in value
            for fragment in FORBIDDEN_STRING_FRAGMENTS:
                assert fragment not in value, f"forbidden string {fragment}"

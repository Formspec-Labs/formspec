"""Integrity checks for AppGraphValidator Component route target source fixtures."""

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
    / "component-route-targets.case.json"
)

REQUIRED_CASES = {
    "valid-route-target",
    "valid-bound-route-definition-form",
    "bound-controls-missing-target-definition",
    "bound-controls-route-missing-definition-form",
    "bound-controls-route-definition-mismatch",
    "bound-route-unresolved-skips-definition-form",
    "route-unresolved",
    "slot-unresolved",
    "duplicate-route-claim",
    "component-ref-missing",
    "component-membership-mismatch",
    "surface-unmanifested",
    "surface-unloaded",
    "surface-ambiguous",
    "fake-target-definition",
    "target-definition-unmanifested",
    "target-definition-unloaded",
    "surface-version-mismatch",
    "surface-range-deferred",
}

FORBIDDEN_KEYS = {
    "fixture",
    "filename",
    "localPath",
    "pathIdentity",
    "identityFromPath",
    "routePolicy",
    "fieldPolicy",
    "widgetPolicy",
    "permissions",
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


def test_component_route_fixture_corpus_covers_required_families() -> None:
    ids = {case["id"] for case in _corpus()["cases"]}
    assert REQUIRED_CASES <= ids


def test_component_route_fixture_handles_are_explicit_loaded_sources() -> None:
    corpus = _corpus()
    handles = corpus["handles"]
    for handle in handles.values():
        _assert_handle(handle)

    for case in corpus["cases"]:
        assert case["request"]["manifest"] in handles
        for group_refs in case["request"].get("artifacts", {}).values():
            for handle_ref in group_refs:
                assert handle_ref in handles


def test_component_route_fixture_expected_diagnostics_are_app_graph_owned() -> None:
    for case in _corpus()["cases"]:
        expected = case["expected"]
        assert isinstance(expected["ok"], bool)
        assert isinstance(expected["summary"], dict)
        assert set(expected["summary"]) == SUMMARY_KEYS
        for diagnostic in expected["diagnostics"]:
            assert diagnostic["code"].startswith("APP-GRAPH-COMPONENT-")
            source = diagnostic.get("primarySource")
            assert isinstance(source, dict)
            assert isinstance(source.get("artifactSlot"), str)
            assert isinstance(source.get("artifactKind"), str)
            assert isinstance(source.get("source"), str)
            assert isinstance(source.get("jsonPointer"), str)


def test_component_route_fixtures_do_not_encode_path_identity_or_auth_policy() -> None:
    for key, value in _walk(_corpus()):
        assert key not in FORBIDDEN_KEYS, f"forbidden key {key}"
        if isinstance(value, str):
            for fragment in FORBIDDEN_STRING_FRAGMENTS:
                assert fragment not in value, f"forbidden string {fragment}"

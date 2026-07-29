"""Integrity checks for the paired Surface vNext AppGraphValidator corpus."""

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
    / "surface-vnext-cross-artifact.case.json"
)

REQUIRED_CASES = {
    "complete-widget-graph-valid",
    "catalog-id-must-match-manifest-ref",
    "availability-route-requires-qualified-surface",
    "availability-route-identity-is-surface-qualified",
    "availability-slot-resolves-exact-qualified-slot",
    "availability-slot-rejects-missing-qualified-slot",
    "availability-module-requires-admitted-module",
    "widget-required-binding-rejects-missing-source",
    "widget-binding-rejects-undeclared-input",
    "definition-availability-does-not-cover-widget",
    "optional-source-payload-schema-is-admitted",
    "malformed-source-payload-schema-is-unavailable",
    "entry-surface-required-for-multiple-surfaces",
    "explicit-entry-surface-never-falls-back",
    "selected-surface-entry-must-resolve",
    "widget-action-output-must-be-declared",
    "widget-action-ref-must-resolve",
    "e611-credits-exact-widget-action-source",
    "e611-rejects-contribution-id-as-widget-name",
    "completed-widget-action-refuses-ambiguous-transition",
    "completed-widget-action-with-zero-transition-reports-stay",
    "locale-ref-and-app-target-are-coherent",
    "locale-reference-urls-are-unique",
    "locale-reference-tag-matches-loaded-document",
    "locale-target-must-be-loaded-app-or-definition",
    "locale-normalized-target-tuples-are-unique",
}

ALLOWED_CODES = {
    "APP-ENTRY-AMBIGUOUS",
    "APP-ENTRY-SURFACE-UNRESOLVED",
    "APP-GRAPH-LOCALE-DUPLICATE",
    "APP-GRAPH-LOCALE-REF",
    "APP-GRAPH-LOCALE-TARGET",
    "APP-GRAPH-WIDGET-ACTION-TRANSITION",
    "APP-GRAPH-WIDGET-DATA-BINDING",
    "DATA-SOURCE-AVAILABILITY-REF",
    "DATA-SOURCE-CATALOG-REF",
    "E611",
    "E612",
    "SURFACE-ENTRY-UNRESOLVED",
    "WIDGET-ACTION-TRANSITION-AMBIGUOUS",
    "WIDGET-DATA-REQUIRED-UNAVAILABLE",
}

FORBIDDEN_KEYS = {
    "authorizationRules",
    "filename",
    "fixture",
    "identityFromPath",
    "localPath",
    "pathIdentity",
    "payload",
    "runtimePlan",
    "sourcePath",
}

FORBIDDEN_STRING_FRAGMENTS = (
    "/Users/",
    "\\Users\\",
    "tests/conformance",
    ".case.json",
)


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


def test_surface_vnext_cross_artifact_fixture_covers_every_required_case() -> None:
    corpus = _corpus()
    assert {case["id"] for case in corpus["cases"]} == REQUIRED_CASES


def test_surface_vnext_cross_artifact_fixture_references_explicit_loaded_handles() -> None:
    corpus = _corpus()
    handles = corpus["handles"]
    for handle in handles.values():
        assert handle["status"] == "loaded"
        assert isinstance(handle["slot"], str)
        assert isinstance(handle["artifactKind"], str)
        assert isinstance(handle["source"], str)
        assert "document" in handle

    for case in corpus["cases"]:
        request = case["request"]
        assert request["manifest"] in handles
        for refs in request.get("artifacts", {}).values():
            for ref in refs:
                assert ref in handles


def test_surface_vnext_cross_artifact_fixture_uses_only_vnext_document_shapes() -> None:
    for handle in _corpus()["handles"].values():
        document = handle["document"]
        kind = handle["artifactKind"]
        if kind == "appManifest":
            assert document["$formspecBundle"] == "2.4"
        elif kind == "surface":
            assert document["$formspecSurface"] == "0.2"
        elif kind == "registry":
            assert document["$formspecRegistry"] == "1.1"
        elif kind == "locale":
            assert document["$formspecLocale"] == "2.0"


def test_surface_vnext_cross_artifact_fixture_pins_codes_reasons_and_severity() -> None:
    for case in _corpus()["cases"]:
        expected = case["expected"]
        assert isinstance(expected["ok"], bool)
        for diagnostic in expected["diagnostics"]:
            assert diagnostic["code"] in ALLOWED_CODES
            assert isinstance(diagnostic["reason"], str)
            if diagnostic["code"] == "E611":
                assert diagnostic["severity"] == "warning"
            if diagnostic["code"] == "APP-GRAPH-WIDGET-ACTION-TRANSITION":
                assert diagnostic["severity"] == "info"


def test_route_identity_control_has_same_local_route_id_on_two_surfaces() -> None:
    corpus = _corpus()
    case = next(
        case
        for case in corpus["cases"]
        if case["id"] == "availability-route-identity-is-surface-qualified"
    )
    surface_refs = case["request"]["artifacts"]["surfaces"]
    route_ids = [
        corpus["handles"][surface_ref]["document"]["routes"][0]["id"]
        for surface_ref in surface_refs
    ]

    assert route_ids == ["start", "start"]
    assert case["expected"]["diagnostics"] == []


def test_surface_vnext_cross_artifact_fixture_keeps_runtime_and_path_identity_out() -> None:
    for key, value in _walk(_corpus()):
        assert key not in FORBIDDEN_KEYS, f"forbidden key {key}"
        if isinstance(value, str):
            for fragment in FORBIDDEN_STRING_FRAGMENTS:
                assert fragment not in value, f"forbidden string {fragment}"

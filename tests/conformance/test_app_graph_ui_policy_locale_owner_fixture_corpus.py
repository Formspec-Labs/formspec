"""Integrity checks for executable UI Graph Policy Locale-owner fixtures."""

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
    / "ui-graph-policy-locale-owners.case.json"
)

REQUIRED_CASES = {
    "valid-locale-owner",
    "missing-locale-owner",
    "exact-prefix-collision",
    "overlap-prefix-collision",
    "same-module-overlap",
    "module-segment-mismatch",
    "non-module-locale-keys-ignored",
    "no-loaded-locales-no-missing-owner",
    "module-segment-mismatch-without-loaded-locales",
    "surface-target-mismatch-skips-locale-owner",
}

EXPECTED_CODES = {
    "missing-locale-owner": "LOCALE-KEY-OWNER",
    "exact-prefix-collision": "LOCALE-KEY-OWNER-COLLISION",
    "overlap-prefix-collision": "LOCALE-KEY-OWNER-COLLISION",
    "module-segment-mismatch": "LOCALE-KEY-OWNER-MODULE-MISMATCH",
    "module-segment-mismatch-without-loaded-locales": "LOCALE-KEY-OWNER-MODULE-MISMATCH",
    "surface-target-mismatch-skips-locale-owner": "UI-POLICY-SURFACE-TARGET",
}

FORBIDDEN_KEYS = {
    "$wireframeUiPolicy",
    "actor",
    "actors",
    "allowedActors",
    "authorization",
    "fieldPolicy",
    "filename",
    "identityFromPath",
    "localPath",
    "pathIdentity",
    "permission",
    "permissions",
    "routeAuthorization",
    "sourcePath",
    "trace",
    "traceIndex",
    "moduleResolution",
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

DEFERRED_CODES = {
    "THEME-TOKEN-WIDGET",
    "THEME-TOKEN-SLOT",
    "UI-POLICY-HIDDEN-DEFINITION-REF",
    "MODULE-RESOLVER-REF",
    "AUTHORIZATION-BOUNDARY",
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


def _case(case_id: str) -> dict[str, Any]:
    for case in _corpus()["cases"]:
        if case["id"] == case_id:
            return case
    raise AssertionError(f"missing case {case_id}")


def _assert_loaded_handle(handle: dict[str, Any]) -> None:
    assert handle["status"] == "loaded"
    assert isinstance(handle.get("slot"), str)
    assert isinstance(handle.get("artifactKind"), str)
    assert isinstance(handle.get("source"), str)
    assert "document" in handle
    if handle["artifactKind"] == "locale":
        assert handle["slot"].startswith("locales[")
        assert handle["document"]["$formspecLocale"] == "1.0"
        assert isinstance(handle["document"].get("strings"), dict)
        assert "ref" in handle


def _assert_policy_pointer(source: dict[str, Any]) -> None:
    assert source["artifactSlot"].startswith("hostEvidence.uiGraphPolicies[")
    assert set(source).issubset({"artifactSlot", "source", "jsonPointer"})
    assert isinstance(source.get("source"), str)
    assert isinstance(source.get("jsonPointer"), str)


def _assert_locale_pointer(source: dict[str, Any]) -> None:
    assert source["artifactSlot"].startswith("locales[")
    assert source["artifactKind"] == "locale"
    assert source["jsonPointer"].startswith("/strings/")
    assert "ref" in source
    assert "url" in source["ref"]


def test_ui_graph_policy_locale_owner_fixture_covers_required_cases() -> None:
    ids = {case["id"] for case in _corpus()["cases"]}
    assert ids == REQUIRED_CASES


def test_ui_graph_policy_locale_owner_fixture_sources_are_explicit() -> None:
    corpus = _corpus()
    handles = corpus["handles"]
    policies = corpus["policies"]
    for handle in handles.values():
        _assert_loaded_handle(handle)
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


def test_ui_graph_policy_locale_owner_expected_diagnostics_are_policy_owned() -> None:
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
            if primary["artifactSlot"].startswith("locales["):
                _assert_locale_pointer(primary)
            for related in diagnostic.get("relatedSources", []):
                if related["artifactSlot"].startswith("hostEvidence."):
                    _assert_policy_pointer(related)


def test_ui_graph_policy_locale_owner_fixture_keeps_deferred_families_out() -> None:
    emitted_codes = {
        diagnostic["code"]
        for case in _corpus()["cases"]
        for diagnostic in case["expected"]["diagnostics"]
    }
    assert emitted_codes.isdisjoint(DEFERRED_CODES)
    assert _case("module-segment-mismatch")["expected"]["diagnostics"][0]["code"] == (
        "LOCALE-KEY-OWNER-MODULE-MISMATCH"
    )
    assert _case("module-segment-mismatch-without-loaded-locales")["expected"]["diagnostics"][0]["code"] == (
        "LOCALE-KEY-OWNER-MODULE-MISMATCH"
    )


def test_ui_graph_policy_locale_owner_fixtures_do_not_encode_path_trace_or_auth() -> None:
    for key, value in _walk(_corpus()):
        assert key not in FORBIDDEN_KEYS, f"forbidden key {key}"
        if isinstance(value, str):
            for fragment in FORBIDDEN_STRING_FRAGMENTS:
                assert fragment not in value, f"forbidden string {fragment}"

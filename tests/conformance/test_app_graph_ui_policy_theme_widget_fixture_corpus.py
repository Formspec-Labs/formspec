"""Integrity checks for executable UI Graph Policy Theme widget fixtures."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from tests.unit.support.schema_fixtures import load_schema


ROOT = Path(__file__).resolve().parents[2]
FIXTURE_PATH = (
    ROOT
    / "tests"
    / "conformance"
    / "fixtures"
    / "app-graph-validator"
    / "ui-graph-policy-theme-widgets.case.json"
)

REQUIRED_CASES = {
    "valid-theme-widget-with-resolved-contribution",
    "undeclared-theme-token-slot",
    "missing-theme-token-slot-evidence",
    "missing-theme-widget-ref",
    "unadmitted-theme-widget-ref",
    "module-resolution-absent-skips-theme-widget",
    "module-resolution-not-run-skips-theme-widget",
    "module-resolution-skipped-skips-theme-widget",
    "surface-target-mismatch-skips-theme-widget",
    "widget-owner-module-mismatch",
}

EXPECTED_CODES = {
    "undeclared-theme-token-slot": ["THEME-TOKEN-SLOT"],
    "missing-theme-token-slot-evidence": ["THEME-TOKEN-SLOT"],
    "missing-theme-widget-ref": ["THEME-TOKEN-WIDGET"],
    "unadmitted-theme-widget-ref": [
        "MODULE-CONTRIBUTION-UNADMITTED",
        "THEME-TOKEN-WIDGET",
    ],
    "surface-target-mismatch-skips-theme-widget": ["UI-POLICY-SURFACE-TARGET"],
    "widget-owner-module-mismatch": ["THEME-TOKEN-WIDGET"],
}

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
    "uiPolicy",
    "widgetPolicy",
}

FORBIDDEN_STRING_FRAGMENTS = (
    "/Users/",
    "\\Users\\",
    "tests/conformance",
    ".case.json",
    ".fixture",
    "semantics.themeTokenSlots",
)

DEFERRED_CODES = {
    "AUTHORIZATION-BOUNDARY",
}

UI_POLICY_SCHEMA = load_schema("ui-graph-policy.schema.json")
UI_POLICY_VALIDATOR = Draft202012Validator(UI_POLICY_SCHEMA)
MODULE_REPORT_SCHEMA = load_schema("module-resolution-report.schema.json")
MODULE_REPORT_VALIDATOR = Draft202012Validator(MODULE_REPORT_SCHEMA)


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


def _assert_policy_pointer(source: dict[str, Any]) -> None:
    assert source["artifactSlot"].startswith("hostEvidence.uiGraphPolicies[")
    assert set(source).issubset({"artifactSlot", "source", "jsonPointer"})
    assert isinstance(source.get("source"), str)
    assert isinstance(source.get("jsonPointer"), str)


def _assert_surface_pointer(source: dict[str, Any]) -> None:
    assert source["artifactSlot"].startswith("surfaces[")
    assert source["artifactKind"] == "surface"
    assert "ref" in source
    assert "url" in source["ref"]


def _assert_registry_pointer(source: dict[str, Any]) -> None:
    assert source["artifactSlot"].startswith("registries[")
    assert source["artifactKind"] == "registry"
    assert "module" not in source
    assert isinstance(source.get("jsonPointer"), str)


def test_ui_graph_policy_theme_widget_fixture_covers_required_cases() -> None:
    ids = {case["id"] for case in _corpus()["cases"]}
    assert ids == REQUIRED_CASES


def test_ui_graph_policy_theme_widget_fixture_sources_are_explicit() -> None:
    corpus = _corpus()
    handles = corpus["handles"]
    policies = corpus["policies"]
    module_reports = corpus["moduleResolutionReports"]
    for handle in handles.values():
        assert handle["status"] == "loaded"
        assert isinstance(handle.get("slot"), str)
        assert isinstance(handle.get("artifactKind"), str)
        assert isinstance(handle.get("source"), str)
        assert "document" in handle
    for policy in policies.values():
        assert policy["schemaId"] == "https://formspec.org/schemas/uiGraphPolicy/0.1"
        assert policy["source"].startswith("host://policy/")
        UI_POLICY_VALIDATOR.validate(policy["document"])

    for case in corpus["cases"]:
        assert case["request"]["manifest"] in handles
        for group_refs in case["request"].get("artifacts", {}).values():
            for handle_ref in group_refs:
                assert handle_ref in handles
        for policy_ref in case["request"]["hostEvidence"]["uiGraphPolicies"]:
            assert policy_ref in policies
        module_report_ref = case["request"].get("moduleResolution")
        if module_report_ref is not None:
            assert module_report_ref in module_reports


def test_ui_graph_policy_theme_widget_module_resolution_reports_are_valid() -> None:
    for report in _corpus()["moduleResolutionReports"].values():
        MODULE_REPORT_VALIDATOR.validate(report)


def test_ui_graph_policy_theme_widget_fixtures_carry_token_slot_evidence() -> None:
    report = _corpus()["moduleResolutionReports"]["resolved-theme-widget"]
    token_slots = report["contributions"][0].get("widgetTokenSlots")
    assert token_slots == [
        {
            "name": "accent",
            "acceptedTokenCategories": ["color"],
            "source": {
                "artifactSlot": "registries[0]",
                "artifactKind": "registry",
                "source": "memory://registry",
                "jsonPointer": "/entries/1/widgetShape/tokenSlots/0",
            },
        }
    ]


def test_ui_graph_policy_theme_widget_slot_diagnostics_are_policy_owned() -> None:
    undeclared = _case("undeclared-theme-token-slot")["expected"]["diagnostics"][0]
    assert undeclared["code"] == "THEME-TOKEN-SLOT"
    assert undeclared["primarySource"]["jsonPointer"] == "/theme/assignments/0/slot"
    assert undeclared["details"] == {
        "moduleId": "x-reviewer",
        "widgetName": "x-review-panel",
        "slot": "surface",
        "reason": "undeclared-slot",
        "declaredSlots": ["accent"],
    }
    assert len(undeclared["relatedSources"]) == 1
    _assert_registry_pointer(undeclared["relatedSources"][0])

    missing_evidence = _case("missing-theme-token-slot-evidence")["expected"]["diagnostics"][0]
    assert missing_evidence["code"] == "THEME-TOKEN-SLOT"
    assert missing_evidence["primarySource"]["jsonPointer"] == "/theme/assignments/0/slot"
    assert "relatedSources" not in missing_evidence
    assert missing_evidence["details"] == {
        "moduleId": "x-reviewer",
        "widgetName": "x-review-panel",
        "slot": "accent",
        "reason": "no-token-slot-evidence",
    }


def test_ui_graph_policy_theme_widget_expected_diagnostics_are_policy_owned() -> None:
    for case in _corpus()["cases"]:
        expected = case["expected"]
        assert isinstance(expected["ok"], bool)
        assert isinstance(expected["summary"], dict)
        assert set(expected["summary"]) == SUMMARY_KEYS
        diagnostics = expected["diagnostics"]
        if case["id"] in EXPECTED_CODES:
            assert [diagnostic["code"] for diagnostic in diagnostics] == EXPECTED_CODES[case["id"]]
        else:
            assert diagnostics == []
        for diagnostic in diagnostics:
            origin = diagnostic.get("origin", "ui-graph-policy")
            phase = diagnostic.get("phase", "cross-artifact")
            if origin == "module-resolver":
                assert phase == "module-resolution"
            else:
                assert origin == "ui-graph-policy"
                assert phase == "cross-artifact"
            primary = diagnostic.get("primarySource")
            assert isinstance(primary, dict)
            if primary["artifactSlot"].startswith("hostEvidence."):
                _assert_policy_pointer(primary)
            for related in diagnostic.get("relatedSources", []):
                if related["artifactSlot"].startswith("hostEvidence."):
                    _assert_policy_pointer(related)
                if related["artifactSlot"].startswith("surfaces["):
                    _assert_surface_pointer(related)
                if related["artifactSlot"].startswith("registries["):
                    _assert_registry_pointer(related)


def test_ui_graph_policy_theme_widget_fixture_keeps_deferred_families_out() -> None:
    emitted_codes = {
        diagnostic["code"]
        for case in _corpus()["cases"]
        for diagnostic in case["expected"]["diagnostics"]
    }
    assert emitted_codes.isdisjoint(DEFERRED_CODES)
    assert _case("missing-theme-widget-ref")["expected"]["diagnostics"][0]["code"] == (
        "THEME-TOKEN-WIDGET"
    )
    for case in _corpus()["cases"]:
        for diagnostic in case["expected"]["diagnostics"]:
            if diagnostic["code"] == "THEME-TOKEN-WIDGET":
                assert "relatedSources" not in diagnostic
                assert diagnostic["primarySource"]["jsonPointer"].startswith("/theme/assignments/")
            if diagnostic["code"] == "THEME-TOKEN-SLOT":
                assert diagnostic["primarySource"]["jsonPointer"].startswith("/theme/assignments/")
                assert diagnostic["primarySource"]["jsonPointer"].endswith("/slot")
            if diagnostic["code"] == "MODULE-CONTRIBUTION-UNADMITTED":
                primary = diagnostic["primarySource"]
                assert set(primary).issubset({"artifactSlot", "source", "jsonPointer"})


def test_ui_graph_policy_theme_widget_fixtures_do_not_encode_path_trace_or_auth() -> None:
    for key, value in _walk(_corpus()):
        assert key not in FORBIDDEN_KEYS, f"forbidden key {key}"
        if isinstance(value, str):
            for fragment in FORBIDDEN_STRING_FRAGMENTS:
                assert fragment not in value, f"forbidden string {fragment}"

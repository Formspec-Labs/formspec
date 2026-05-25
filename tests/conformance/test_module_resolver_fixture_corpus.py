"""Integrity checks for ModuleResolver source fixture corpus."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from tests.unit.support.schema_fixtures import load_schema


ROOT = Path(__file__).resolve().parents[2]
FIXTURE_DIR = ROOT / "tests" / "conformance" / "fixtures" / "module-resolver"
REPORT_SCHEMA = load_schema("module-resolution-report.schema.json")
REPORT_VALIDATOR = Draft202012Validator(REPORT_SCHEMA)

REQUIRED_FAMILIES = {
    "valid-module-graph",
    "unresolved-app-module",
    "version-mismatch",
    "dependency-unresolved",
    "sibling-undeclared",
    "host-admission-denied",
    "contribution-missing",
    "contribution-category",
    "contribution-unowned",
    "contribution-conflict",
    "contribution-unadmitted",
    "payload-mismatch",
    "widget-token-slots",
    "token-category-conflict",
    "token-category-evidence",
    "token-category-shape-mismatch",
    "posture-module-admits-extra-provenance",
    "posture-module-not-in-allowlist",
}

FORBIDDEN_KEYS = {
    "fixture",
    "filename",
    "localPath",
    "pathIdentity",
    "identityFromPath",
    "authorization",
    "authz",
    "routePolicy",
    "routePolicies",
    "widgetPolicy",
    "widgetPolicies",
    "fieldPolicy",
    "fieldPolicies",
    "sourcePolicy",
    "sourcePolicies",
    "operationPolicy",
    "operationPolicies",
    "permissions",
}

FORBIDDEN_STRING_FRAGMENTS = (
    "/Users/",
    "\\Users\\",
    "tests/conformance",
    ".case.json",
    ".fixture",
)


def _fixture_cases() -> list[tuple[Path, dict[str, Any]]]:
    return [
        (path, json.loads(path.read_text()))
        for path in sorted(FIXTURE_DIR.glob("*.case.json"))
    ]


def _walk(value: Any) -> Any:
    if isinstance(value, dict):
        for key, child in value.items():
            yield key, child
            yield from _walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk(child)


def _diagnostics(report: dict[str, Any]) -> list[dict[str, Any]]:
    diagnostics: list[dict[str, Any]] = []
    diagnostics.extend(report.get("diagnostics", []))
    for key in ("modules", "documents", "contributions"):
        for entry in report.get(key, []):
            diagnostics.extend(entry.get("diagnostics", []))
    return diagnostics


def _widget_token_slots(report: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        token_slot
        for contribution in report.get("contributions", [])
        for token_slot in contribution.get("widgetTokenSlots", [])
    ]


def _token_categories(report: dict[str, Any]) -> list[dict[str, Any]]:
    return report.get("tokenCategories", [])


def _assert_summary_contains(report: dict[str, Any], expected: dict[str, Any]) -> None:
    for key, value in expected.items():
        assert report["summary"][key] == value


def test_fixture_corpus_covers_required_module_resolution_families() -> None:
    ids = {case["id"] for _, case in _fixture_cases()}
    assert REQUIRED_FAMILIES <= ids


def test_fixture_files_match_case_ids() -> None:
    for path, case in _fixture_cases():
        assert path.name == f"{case['id']}.case.json"


def test_expected_reports_validate_and_preserve_module_resolver_ownership() -> None:
    for _, case in _fixture_cases():
        report = case["expectedReport"]
        REPORT_VALIDATOR.validate(report)
        assert report["phase"]["phase"] == "module-resolution"

        diagnostics = _diagnostics(report)
        assert [
            {"code": diagnostic["code"], "severity": diagnostic["severity"]}
            for diagnostic in report["diagnostics"]
        ] == case.get("expectedDiagnostics", [])
        assert all(
            diagnostic["origin"] == "module-resolver"
            and diagnostic["phase"] == "module-resolution"
            for diagnostic in diagnostics
        )

        summary = case.get("expectedSummary")
        if summary is not None:
            _assert_summary_contains(report, summary)

        for token_slot in _widget_token_slots(report):
            assert isinstance(token_slot["name"], str)
            assert isinstance(token_slot["acceptedTokenCategories"], list)
            assert token_slot["acceptedTokenCategories"]
            _assert_source_pointer(token_slot["source"])

        for token_category in _token_categories(report):
            assert isinstance(token_category["prefix"], str)
            assert isinstance(token_category["status"], str)
            _assert_source_pointer(token_category["source"])


def test_fixtures_do_not_encode_path_identity_or_fine_grained_auth() -> None:
    for path, case in _fixture_cases():
        for key, value in _walk(case):
            assert key not in FORBIDDEN_KEYS, f"{path.name} contains forbidden key {key}"
            if isinstance(value, str):
                for fragment in FORBIDDEN_STRING_FRAGMENTS:
                    assert fragment not in value, f"{path.name} contains forbidden string {fragment}"


def test_fixture_inputs_remain_source_oriented_without_request_schema_claim() -> None:
    for _, case in _fixture_cases():
        inputs = case["inputs"]
        assert set(inputs) <= {"appModules", "documents", "registries", "admission", "support"}
        assert "posture" not in inputs
        assert "$schema" not in inputs


def _assert_source_pointer(source: Any, require_module: bool = False) -> None:
    assert isinstance(source, dict)
    assert isinstance(source.get("artifactSlot"), str)
    assert isinstance(source.get("artifactKind"), str)
    assert isinstance(source.get("source"), str)
    assert isinstance(source.get("jsonPointer"), str)
    if require_module:
        module = source.get("module")
        assert isinstance(module, dict)
        assert isinstance(module.get("id"), str)
        assert isinstance(module.get("version"), str)


def test_fixture_inputs_carry_explicit_source_evidence() -> None:
    for _, case in _fixture_cases():
        inputs = case["inputs"]

        for module in inputs.get("appModules", []):
            _assert_source_pointer(module.get("source"), require_module=True)

        support = inputs.get("support") or {}
        for module in support.get("defaultModules", []):
            _assert_source_pointer(module.get("source"), require_module=True)

        for registry in inputs.get("registries", []):
            assert isinstance(registry.get("artifactSlot"), str)
            assert isinstance(registry.get("artifactKind"), str)
            assert isinstance(registry.get("source"), str)

        for document in inputs.get("documents", []):
            assert isinstance(document.get("source"), str)
            for module in document.get("modules", []):
                _assert_source_pointer(module.get("source"), require_module=True)
            for use in document.get("uses", []):
                _assert_source_pointer(use.get("source"))
                if "payload" in use:
                    _assert_source_pointer(use.get("payloadSource"))

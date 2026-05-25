"""Integrity checks for UI Graph Policy semantic fixture evidence."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from tests.unit.support.schema_fixtures import load_schema


ROOT = Path(__file__).resolve().parents[2]
FIXTURE_DIR = ROOT / "tests" / "conformance" / "fixtures" / "ui-graph-policy" / "semantic"
POLICY_SCHEMA = load_schema("ui-graph-policy.schema.json")
POLICY_VALIDATOR = Draft202012Validator(
    POLICY_SCHEMA,
    format_checker=Draft202012Validator.FORMAT_CHECKER,
)

EXPECTED_FAMILIES = {
    "valid-policy-graph",
    "surface-target-mismatch",
    "missing-route-coverage",
    "duplicate-route-policy",
    "unresolved-route",
    "unresolved-responsive-slot",
    "unresolved-hidden-definition",
    "hidden-definition-not-route-local",
    "missing-locale-owner",
    "locale-owner-collision",
    "unresolved-unadmitted-widget",
    "undeclared-token-slot",
}

EXPECTED_CODES = {
    "surface-target-mismatch": "UI-POLICY-SURFACE-TARGET",
    "missing-route-coverage": "UI-POLICY-ROUTE-MISSING",
    "duplicate-route-policy": "UI-POLICY-ROUTE-COLLISION",
    "unresolved-route": "UI-POLICY-ROUTE-REF",
    "unresolved-responsive-slot": "UI-POLICY-RESPONSIVE-SLOT",
    "unresolved-hidden-definition": "UI-POLICY-HIDDEN-DEFINITION-REF",
    "hidden-definition-not-route-local": "UI-POLICY-HIDDEN-DEFINITION-REF",
    "missing-locale-owner": "LOCALE-KEY-OWNER",
    "locale-owner-collision": "LOCALE-KEY-OWNER-COLLISION",
    "unresolved-unadmitted-widget": "THEME-TOKEN-WIDGET",
    "undeclared-token-slot": "THEME-TOKEN-SLOT",
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

SOURCE_POINTER_KEYS = {"sourceId", "jsonPointer"}


def _load_cases() -> list[tuple[Path, dict[str, Any]]]:
    cases: list[tuple[Path, dict[str, Any]]] = []
    for path in sorted(FIXTURE_DIR.glob("*.case.json")):
        payload = json.loads(path.read_text())
        assert payload["version"] == "0.1"
        assert isinstance(payload.get("cases"), list) and payload["cases"]
        for case in payload["cases"]:
            cases.append((path, case))
    return cases


def _walk(value: Any) -> Any:
    if isinstance(value, dict):
        for key, child in value.items():
            yield key, child
            yield from _walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk(child)


def _source_ids(sources: dict[str, Any]) -> set[str]:
    ids = set(sources)
    for collection_name in ("locales", "definitions"):
        collection = sources.get(collection_name, [])
        assert isinstance(collection, list)
        for entry in collection:
            source_id = entry.get("sourceId")
            assert isinstance(source_id, str) and source_id
            ids.add(source_id)
    return ids


def _assert_source_pointer(value: Any, source_ids: set[str], label: str) -> None:
    assert isinstance(value, dict), f"{label}: source pointer must be an object"
    assert set(value).issubset(SOURCE_POINTER_KEYS), (
        f"{label}: source pointers must not carry artifactKind/ref/path-derived identity"
    )
    source_id = value.get("sourceId")
    assert source_id in source_ids, f"{label}: unknown sourceId {source_id!r}"
    json_pointer = value.get("jsonPointer")
    assert isinstance(json_pointer, str) and json_pointer.startswith("/"), (
        f"{label}: jsonPointer must be absolute"
    )


def test_ui_graph_policy_semantic_fixtures_cover_required_families() -> None:
    cases = _load_cases()
    families = {case.get("family") for _, case in cases}
    assert families == EXPECTED_FAMILIES
    assert len({case["caseId"] for _, case in cases}) == len(cases)


def test_ui_graph_policy_semantic_fixtures_use_structurally_valid_policies() -> None:
    for _, case in _load_cases():
        policy = case["sources"]["policy"]["document"]
        POLICY_VALIDATOR.validate(policy)


def test_ui_graph_policy_semantic_expected_diagnostics_are_local_fixture_shape() -> None:
    for _, case in _load_cases():
        family = case["family"]
        diagnostics = case.get("expectedDiagnostics")
        assert isinstance(diagnostics, list), f"{case['caseId']}: diagnostics must be a list"

        if family == "valid-policy-graph":
            assert diagnostics == []
            continue

        assert diagnostics, f"{case['caseId']}: expected diagnostic missing"
        source_ids = _source_ids(case["sources"])
        for diagnostic in diagnostics:
            assert diagnostic["code"] == EXPECTED_CODES[family]
            assert diagnostic["severity"] == "error"
            assert diagnostic["phase"] == "cross-artifact"
            assert diagnostic["origin"] == "ui-graph-policy"
            assert isinstance(diagnostic.get("message"), str) and diagnostic["message"]
            _assert_source_pointer(
                diagnostic.get("primarySource"),
                source_ids,
                f"{case['caseId']}.primarySource",
            )
            for index, related in enumerate(diagnostic.get("relatedSources", [])):
                _assert_source_pointer(
                    related,
                    source_ids,
                    f"{case['caseId']}.relatedSources[{index}]",
                )


def test_ui_graph_policy_semantic_fixtures_do_not_promote_forbidden_boundaries() -> None:
    for path, case in _load_cases():
        sources = case["sources"]
        assert "appManifest" not in sources
        for key, value in _walk(case):
            assert key not in FORBIDDEN_KEYS, (
                f"{path.name}/{case['caseId']}: forbidden key {key!r}"
            )
            if isinstance(value, str):
                for fragment in FORBIDDEN_STRING_FRAGMENTS:
                    assert fragment not in value, (
                        f"{path.name}/{case['caseId']}: forbidden string {fragment}"
                    )

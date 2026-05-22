"""Discovery + orchestration coverage for Response Actions and Validation
Mapping artifacts.

Before this lands, ``detect_document_type`` returned ``"response_actions"`` /
``"validation_mapping"`` for matching documents but the Python discovery
ladder had no branch for either — both landed in ``arts.unknown`` and the
validation orchestrator never ran lint over them. A schema-invalid Response
Actions doc therefore silently passed the Python conformance pipeline
because no pass owned it.
"""
from __future__ import annotations

import json
from pathlib import Path

from formspec.validate import (
    DiscoveredArtifacts,
    ResponseActionsArtifact,
    ValidationMappingArtifact,
    discover_artifacts,
    validate_all,
)


def _write(path: Path, doc: dict) -> None:
    path.write_text(json.dumps(doc), encoding="utf-8")


def _valid_response_actions() -> dict:
    return {
        "$formspecResponseActions": "1.0",
        "version": "1.0.0",
        "targetDefinition": {
            "url": "https://example.gov/forms/intake",
            "compatibleVersions": ">=1.0.0",
        },
        "actions": [
            {
                "id": "submit",
                "intent": "submit",
                "effects": [
                    {"type": "hostEvent", "eventName": "formspec-submit"},
                ],
            }
        ],
    }


def _valid_validation_mapping() -> dict:
    return {
        "$formspecValidationMapping": "1.0",
        "version": "1.0.0",
    }


def _pass_titles(report) -> list[str]:
    return [pr.title for pr in report.passes]


def test_response_actions_document_is_discovered_not_unknown(tmp_path: Path) -> None:
    _write(tmp_path / "response-actions.json", _valid_response_actions())

    artifacts = discover_artifacts(tmp_path)

    assert len(artifacts.response_actions) == 1, (
        f"Response Actions doc landed in: response_actions={artifacts.response_actions}, "
        f"unknown={artifacts.unknown}"
    )
    assert isinstance(artifacts.response_actions[0], ResponseActionsArtifact)
    assert artifacts.response_actions[0].target_def_url == (
        "https://example.gov/forms/intake"
    )
    assert not artifacts.unknown


def test_validation_mapping_document_is_discovered_not_unknown(tmp_path: Path) -> None:
    _write(tmp_path / "vm.json", _valid_validation_mapping())

    artifacts = discover_artifacts(tmp_path)

    assert len(artifacts.validation_mappings) == 1, (
        f"VM doc landed in: validation_mappings={artifacts.validation_mappings}, "
        f"unknown={artifacts.unknown}"
    )
    assert isinstance(artifacts.validation_mappings[0], ValidationMappingArtifact)
    assert not artifacts.unknown


def test_schema_invalid_response_actions_produces_finding(tmp_path: Path) -> None:
    # Missing required `effects` array (Action requires id, intent, effects).
    bad = {
        "$formspecResponseActions": "1.0",
        "version": "1.0.0",
        "targetDefinition": {"url": "https://example.gov/forms/intake"},
        "actions": [{"id": "submit", "intent": "submit"}],
    }
    _write(tmp_path / "ra.json", bad)

    report = validate_all(discover_artifacts(tmp_path))

    titles = _pass_titles(report)
    assert "Response Actions linting (with definition context)" in titles, titles
    ra_pass = next(
        p for p in report.passes
        if p.title == "Response Actions linting (with definition context)"
    )
    assert ra_pass.items, "Response Actions pass produced no item results"
    assert ra_pass.items[0].error_count > 0, (
        f"Schema-invalid Response Actions doc produced no errors: "
        f"diagnostics={[d.code for d in ra_pass.items[0].diagnostics]}"
    )


def test_response_actions_pass_skips_when_no_response_actions_present(
    tmp_path: Path,
) -> None:
    """The pass MUST mark `empty=True` (not produce noise) when there are no
    Response Actions documents in the discovery set.
    """
    artifacts = DiscoveredArtifacts()

    report = validate_all(artifacts)

    ra_pass = next(
        p for p in report.passes
        if p.title == "Response Actions linting (with definition context)"
    )
    assert ra_pass.empty is True

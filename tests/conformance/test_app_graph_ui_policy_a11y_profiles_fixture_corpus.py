"""Integrity checks for UI Graph Policy a11y profile AppGraphValidator fixtures."""

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
    / "ui-graph-policy-a11y-profiles.case.json"
)

REQUIRED_CASES = {
    "region-with-label-valid",
    "region-blank-label",
    "host-landmark-conflict-main",
}

EXPECTED_DIAGNOSTIC_COUNTS = {
    "region-with-label-valid": 0,
    "region-blank-label": 1,
    "host-landmark-conflict-main": 1,
}

EXPECTED_CODES = {
    "region-blank-label": "UI-POLICY-REGION-LABEL",
    "host-landmark-conflict-main": "UI-POLICY-HOST-LANDMARK-CONFLICT",
}


def _corpus() -> dict[str, Any]:
    return json.loads(FIXTURE_PATH.read_text())


def test_ui_graph_policy_a11y_fixture_covers_required_cases() -> None:
    ids = {case["id"] for case in _corpus()["cases"]}
    assert ids == REQUIRED_CASES


def test_ui_graph_policy_a11y_expected_diagnostics_match_codes() -> None:
    for case in _corpus()["cases"]:
        case_id = case["id"]
        diagnostics = case["expected"]["diagnostics"]
        assert len(diagnostics) == EXPECTED_DIAGNOSTIC_COUNTS[case_id]
        expected_code = EXPECTED_CODES.get(case_id)
        if expected_code:
            assert diagnostics[0]["code"] == expected_code
            assert diagnostics[0]["origin"] == "ui-graph-policy"

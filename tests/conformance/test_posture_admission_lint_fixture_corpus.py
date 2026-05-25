"""Lint conformance corpus for ADR 0150 §4.4 / §5.4 posture admission (E608/E609).

Fixtures live under tests/conformance/fixtures/posture-admission/*.case.json and
exercise the Rust lint pass via the Python bridge with an explicit
posture_declaration sidecar.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from formspec._rust import lint


ROOT = Path(__file__).resolve().parents[2]
FIXTURE_DIR = ROOT / "tests" / "conformance" / "fixtures" / "posture-admission"

REQUIRED_CASES = {
    "module-admits-extra-provenance",
    "module-lock-hash-mismatch",
    "module-not-in-allowlist",
    "actor-not-in-allowlist",
    "absent-posture-permissive",
}


def _fixture_cases() -> list[tuple[Path, dict[str, Any]]]:
    return [
        (path, json.loads(path.read_text(encoding="utf-8")))
        for path in sorted(FIXTURE_DIR.glob("*.case.json"))
    ]


def test_posture_admission_fixture_corpus_covers_required_cases() -> None:
    present = {case["id"] for _, case in _fixture_cases()}
    missing = REQUIRED_CASES - present
    assert not missing, f"missing posture-admission fixture cases: {sorted(missing)}"


@pytest.mark.parametrize(
    ("path", "case"),
    _fixture_cases(),
    ids=[case["id"] for _, case in _fixture_cases()],
)
def test_posture_admission_lint_fixture_corpus(path: Path, case: dict[str, Any]) -> None:
    document = case["document"]
    posture_declaration = case.get("postureDeclaration")
    expected_codes = set(case.get("expectedCodes", []))
    forbidden_codes = set(case.get("forbiddenCodes", []))

    diagnostics = lint(document, posture_declaration=posture_declaration)
    emitted = {diag.code for diag in diagnostics}

    assert expected_codes <= emitted, (
        f"{case['id']}: expected codes {sorted(expected_codes)} not all emitted; "
        f"got {sorted(emitted)} from {path.name}"
    )
    overlap = forbidden_codes & emitted
    assert not overlap, (
        f"{case['id']}: forbidden codes {sorted(overlap)} were emitted from {path.name}"
    )

"""Coverage predicate tests for the Experience companion spec.

Implements the static coverage predicate of Experience S8.1 in Python and
verifies it against PASS / FAIL fixtures.

This is the reference Python implementation; runtime implementations in Rust
(formspec-eval) and TS (formspec-engine) MAY arrive in follow-on tickets. The
fixtures pin behavior across implementations.
"""

import json
from pathlib import Path

import pytest


FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "experience"


def _load(name: str) -> dict:
    with (FIXTURES_DIR / name).open() as f:
        return json.load(f)


def _trimmed_literal(value) -> str | None:
    return value.strip() if isinstance(value, str) else None


def _join_path(prefix: str, item: dict) -> str:
    key = item["key"]
    if item.get("repeatable") is True:
        key = f"{key}[*]"
    return f"{prefix}.{key}" if prefix else key


def _field_items(definition: dict) -> dict[str, dict]:
    fields: dict[str, dict] = {}

    def walk(items: list[dict], prefix: str = "", inside_optional_repeat: bool = False):
        for item in items:
            path = _join_path(prefix, item)
            optional_repeat = inside_optional_repeat or (
                item.get("type") == "group"
                and item.get("repeatable") is True
                and item.get("minRepeat", 0) == 0
            )
            if item.get("type") == "field":
                fields[path] = {"item": item, "inside_optional_repeat": optional_repeat}
            if item.get("children"):
                walk(item["children"], path, optional_repeat)

    walk(definition.get("items", []))
    return fields


def _item_paths(definition: dict) -> set[str]:
    paths: set[str] = set()

    def walk(items: list[dict], prefix: str = ""):
        for item in items:
            path = _join_path(prefix, item)
            paths.add(path)
            if item.get("children"):
                walk(item["children"], path)

    walk(definition.get("items", []))
    return paths


def _has_static_false_relevance(path: str, binds_by_path: dict[str, dict]) -> bool:
    parts = path.split(".")
    candidates = [".".join(parts[:idx]) for idx in range(1, len(parts) + 1)]
    return any(
        _trimmed_literal(binds_by_path.get(candidate, {}).get("relevant")) == "false"
        for candidate in candidates
    )


def _required_visible_paths(definition: dict) -> set[str]:
    """Return paths required by literal true binds and not statically hidden."""
    fields = _field_items(definition)
    binds_by_path = {bind["path"]: bind for bind in definition.get("binds", [])}
    paths: set[str] = set()
    for bind in definition.get("binds", []):
        path = bind.get("path")
        field = fields.get(path)
        if not field:
            continue
        if _trimmed_literal(bind.get("required")) != "true":
            continue
        if field["inside_optional_repeat"]:
            continue
        if _has_static_false_relevance(path, binds_by_path):
            continue
        paths.add(path)
    return paths


def _covered_paths(experience: dict) -> set[str]:
    paths: set[str] = set()
    for unit in experience.get("units", []):
        for ref in unit.get("itemRefs", []):
            paths.add(ref["path"])
    return paths


def coverage_findings(definition: dict, experience: dict) -> list[dict]:
    """Compute EXP-COVERAGE-UNCOVERED-REQUIRED-ITEM findings per S8.2."""
    required = _required_visible_paths(definition)
    covered = _covered_paths(experience)
    uncovered = required - covered
    return [
        {
            "code": "EXP-COVERAGE-UNCOVERED-REQUIRED-ITEM",
            "severity": "warning",
            "path": p,
            "experienceId": experience.get("name", experience.get("title", "")),
            "message": f"Required visible item '{p}' is not referenced by any unit.itemRefs.",
        }
        for p in sorted(uncovered)
    ]


def unresolved_item_refs(definition: dict, experience: dict) -> list[dict]:
    """Compute EXP-ITEM-REF-UNRESOLVED findings per S10."""
    definition_paths = _item_paths(definition)
    findings: list[dict] = []
    for unit in experience.get("units", []):
        for ref in unit.get("itemRefs", []):
            if ref["path"] not in definition_paths:
                findings.append(
                    {
                        "code": "EXP-ITEM-REF-UNRESOLVED",
                        "severity": "warning",
                        "path": ref["path"],
                        "unitId": unit.get("id"),
                        "message": f"ItemRef.path '{ref['path']}' does not resolve in target Definition.",
                    }
                )
    return findings


@pytest.fixture(scope="module")
def definition_base():
    return _load("definition-base.json")


class TestExperienceCoverage:
    def test_coverage_pass_yields_no_findings(self, definition_base):
        experience = _load("coverage-pass.json")
        findings = coverage_findings(definition_base, experience)
        assert findings == [], f"Expected no findings, got: {findings}"

    def test_coverage_fail_yields_finding_for_uncovered_item(self, definition_base):
        experience = _load("coverage-fail.json")
        findings = coverage_findings(definition_base, experience)
        assert len(findings) == 1, findings
        finding = findings[0]
        assert finding["code"] == "EXP-COVERAGE-UNCOVERED-REQUIRED-ITEM"
        assert finding["path"] == "applicantName"
        assert finding["severity"] == "warning"


class TestExperienceReferentialIntegrity:
    def test_dangling_item_ref_produces_finding(self, definition_base):
        experience = _load("invalid-dangling-item-ref.json")
        findings = unresolved_item_refs(definition_base, experience)
        assert len(findings) == 1
        assert findings[0]["code"] == "EXP-ITEM-REF-UNRESOLVED"
        assert findings[0]["path"] == "nonexistentField"
        assert findings[0]["unitId"] == "ghost"

    def test_clean_experience_produces_no_finding(self, definition_base):
        experience = _load("coverage-pass.json")
        findings = unresolved_item_refs(definition_base, experience)
        assert findings == []

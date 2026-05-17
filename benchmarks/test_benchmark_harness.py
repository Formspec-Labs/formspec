"""Smoke tests for the benchmark harness.

These tests prove three things about the benchmark:
1. Every task directory has the required artifacts (requirement.md, reference/, meta.json).
2. Every task's reference artifact set validates cleanly against the Formspec validator —
   a dirty reference would make the benchmark score meaningless.
3. The runner's `score` and `list` subcommands work end-to-end.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
BENCHMARKS_DIR = Path(__file__).resolve().parent
TASKS_DIR = BENCHMARKS_DIR / "tasks"
RUNNER = BENCHMARKS_DIR / "run_benchmark.py"
REGISTRY = REPO_ROOT / "registries" / "formspec-common.registry.json"

REQUIRED_META_FIELDS = {"id", "difficulty", "feature_tags", "tiers_covered"}
VALID_DIFFICULTIES = {"novice", "intermediate", "expert"}


def _task_ids() -> list[str]:
    if not TASKS_DIR.is_dir():
        return []
    return sorted(p.name for p in TASKS_DIR.iterdir() if p.is_dir())


def _validate_directory(directory: Path) -> dict:
    """Run `python3 -m formspec.validate <dir> --json` and return the parsed report."""
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "formspec.validate",
            str(directory),
            "--registry",
            str(REGISTRY),
            "--json",
        ],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.stdout, f"validator produced no stdout; stderr={result.stderr!r}"
    return json.loads(result.stdout)


def test_tasks_directory_exists_and_is_populated():
    assert TASKS_DIR.is_dir(), f"missing tasks dir at {TASKS_DIR}"
    ids = _task_ids()
    assert ids, "no benchmark tasks defined yet"


@pytest.mark.parametrize("task_id", _task_ids())
def test_task_has_required_artifacts(task_id: str):
    task_dir = TASKS_DIR / task_id

    requirement = task_dir / "requirement.md"
    assert requirement.is_file(), f"{task_id}: missing requirement.md"
    assert requirement.read_text().strip(), f"{task_id}: requirement.md is empty"

    reference = task_dir / "reference"
    assert reference.is_dir(), f"{task_id}: missing reference/ directory"
    json_files = list(reference.glob("*.json"))
    assert json_files, f"{task_id}: reference/ has no JSON artifacts"

    meta_path = task_dir / "meta.json"
    assert meta_path.is_file(), f"{task_id}: missing meta.json"
    meta = json.loads(meta_path.read_text())
    missing = REQUIRED_META_FIELDS - set(meta.keys())
    assert not missing, f"{task_id}: meta.json missing fields {missing}"
    assert meta["id"] == task_id, f"{task_id}: meta.id mismatch ({meta['id']!r})"
    assert meta["difficulty"] in VALID_DIFFICULTIES, f"{task_id}: bad difficulty"
    assert isinstance(meta["feature_tags"], list) and meta["feature_tags"]
    assert isinstance(meta["tiers_covered"], list) and meta["tiers_covered"]


@pytest.mark.parametrize("task_id", _task_ids())
def test_reference_validates_cleanly(task_id: str):
    reference = TASKS_DIR / task_id / "reference"
    report = _validate_directory(reference)
    assert report["totalErrors"] == 0, (
        f"{task_id}: reference did not validate cleanly "
        f"({report['totalErrors']} error(s)). A reference that cannot pass validation "
        f"is not a valid benchmark target."
    )


@pytest.mark.parametrize("task_id", _task_ids())
def test_runner_scores_reference_against_itself(task_id: str):
    reference = TASKS_DIR / task_id / "reference"
    result = subprocess.run(
        [sys.executable, str(RUNNER), "score", task_id, str(reference)],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, f"runner failed: {result.stderr}"
    report = json.loads(result.stdout)
    assert report["taskId"] == task_id
    assert report["validates"] is True, f"reference should self-validate: {report}"
    assert report["score"] == 1.0, f"reference should score 1.0: {report}"


def test_definition_pass_title_constant_matches_validator_output():
    """Guard F5: the runner's `has_definition` check keys off a hardcoded-ish
    title. Assert the validator actually emits that exact title so a rename
    in validate/models.py breaks loudly here, not silently in score_task.
    """
    # Use the invoice task — any clean reference works for this probe.
    task_ids = _task_ids()
    assert task_ids, "need at least one task for this smoke"
    reference = TASKS_DIR / task_ids[0] / "reference"
    report = _validate_directory(reference)

    sys.path.insert(0, str(REPO_ROOT / "src"))
    from formspec.validate import DEFINITION_LINTING_TITLE  # noqa: E402

    titles = [p.get("title") for p in report.get("passes", [])]
    assert DEFINITION_LINTING_TITLE in titles, (
        f"validator did not emit expected pass title {DEFINITION_LINTING_TITLE!r}; "
        f"got {titles}. If the title was renamed intentionally, update the "
        f"constant in validate/models.py so the benchmark runner picks it up."
    )


def test_runner_list_enumerates_all_tasks():
    result = subprocess.run(
        [sys.executable, str(RUNNER), "list"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, f"list failed: {result.stderr}"
    output = result.stdout
    for task_id in _task_ids():
        assert task_id in output, f"{task_id!r} not listed in runner output"

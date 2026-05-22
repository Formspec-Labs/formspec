"""Benchmark reference fixtures regression guard.

Pins the post-Response-Actions-migration state of every
``benchmarks/tasks/<task>/reference/`` directory. The references are the
canonical "good answer" each benchmark task is scored against; if a schema
edit makes the references stop matching the schema, an LLM candidate that
faithfully copies the reference scores 0.0 for reasons unrelated to its
behaviour.

What this guard enforces TODAY (in scope of the Response Actions remediation):

1. No reference component document MAY use the retired ``SubmitButton``
   component. Every submit button MUST use ``ActionButton`` with an
   ``actionRef`` resolving to a Response Action declared in a sibling
   ``*.response-actions.json`` document.
2. Every ``ActionButton.actionRef`` in a reference component tree MUST
   resolve to an Action ``id`` in a sibling Response Actions document under
   the same task's ``reference/`` directory. Mirrors the Rust ``E1802``
   (error severity per Component §5.19 Resolver Invariants) at the
   conformance layer.

What this guard does NOT enforce yet (out of scope, tracked separately):

- ``score == 1.0`` against the validator. The references carry pre-existing
  schema drift unrelated to Response Actions (``Spacer`` missing a schema
  branch, ``Page`` body shape mismatch, ``presentation.layout.page`` removal,
  etc). Filed in ``TODO.md`` under "benchmark references — broader schema
  drift" so a future remediation can lift this gate to the full ``1.0`` bar.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterator

import pytest

BENCHMARKS_DIR = Path(__file__).resolve().parents[2] / "benchmarks" / "tasks"
TASK_IDS = sorted(p.name for p in BENCHMARKS_DIR.iterdir() if p.is_dir())


def _iter_components(tree: dict) -> Iterator[dict]:
    """Yield every component node in a Component ``tree``."""
    if not isinstance(tree, dict):
        return
    yield tree
    for child in tree.get("children", []) or []:
        yield from _iter_components(child)


def _reference_dir(task_id: str) -> Path:
    return BENCHMARKS_DIR / task_id / "reference"


def _component_documents(task_id: str) -> list[tuple[Path, dict]]:
    """All component-marker documents in the task's reference directory."""
    docs: list[tuple[Path, dict]] = []
    for path in sorted(_reference_dir(task_id).glob("*.json")):
        try:
            doc = json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        if isinstance(doc, dict) and "$formspecComponent" in doc:
            docs.append((path, doc))
    return docs


def _response_action_ids(task_id: str) -> set[str]:
    """All Action ids declared across response-actions sidecars in the task."""
    ids: set[str] = set()
    for path in sorted(_reference_dir(task_id).glob("*.json")):
        try:
            doc = json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        if not isinstance(doc, dict) or "$formspecResponseActions" not in doc:
            continue
        for action in doc.get("actions", []) or []:
            if isinstance(action, dict) and isinstance(action.get("id"), str):
                ids.add(action["id"])
    return ids


@pytest.mark.parametrize("task_id", TASK_IDS)
def test_reference_components_use_no_submit_button(task_id: str) -> None:
    """``SubmitButton`` was retired; every reference MUST have migrated."""
    offenders: list[str] = []
    for path, doc in _component_documents(task_id):
        for node in _iter_components(doc.get("tree", {})):
            if node.get("component") == "SubmitButton":
                offenders.append(path.name)
    assert not offenders, (
        f"{task_id}: SubmitButton found in {offenders}. "
        "Migrate to ActionButton + a sibling response-actions.json sidecar "
        "(Component §5.19, Response Actions §3)."
    )


@pytest.mark.parametrize("task_id", TASK_IDS)
def test_reference_action_buttons_resolve(task_id: str) -> None:
    """Every ``ActionButton.actionRef`` MUST resolve to a sibling Action id."""
    components = _component_documents(task_id)
    if not components:
        pytest.skip(f"{task_id}: no component documents in reference/")
    action_ids = _response_action_ids(task_id)
    unresolved: list[tuple[str, str]] = []
    for path, doc in components:
        for node in _iter_components(doc.get("tree", {})):
            if node.get("component") != "ActionButton":
                continue
            action_ref = node.get("actionRef")
            if isinstance(action_ref, str) and action_ref not in action_ids:
                unresolved.append((path.name, action_ref))
    assert not unresolved, (
        f"{task_id}: ActionButton actionRef did not resolve: {unresolved}. "
        f"Available action ids in this reference dir: {sorted(action_ids)}. "
        "Add the missing Action to the sibling response-actions.json."
    )

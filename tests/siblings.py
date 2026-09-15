"""What this suite reads from outside the repository, and how it behaves when that is absent.

Some tests read a sibling repository's fixtures (`../trellis`), assert that a contract's surfaces exist
across the stack (`../work-spec`, `../formspec-studio`), or shell out to a Node tool from `node_modules`.
A checkout of this repository alone — CI, or anyone cloning it — has none of those, and a missing sibling
is not a failure of the code under test. These helpers skip such a test with the reason spelled out; inside
the stack, or a developer's tree, everything is present and they run.
"""

from __future__ import annotations

from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]

# Every repository this suite reads from, beside this one.
SIBLINGS = ("trellis", "work-spec", "formspec-studio", "integrity-stack", "fel-core")


def sibling(name: str, *parts: str) -> Path:
    """A path inside the sibling repository `name`."""
    return REPO_ROOT.parent / name / Path(*parts) if parts else REPO_ROOT.parent / name


def requires(path: Path, what: str) -> pytest.MarkDecorator:
    """Skip the module or test when `path` is absent — `what` says which repository supplies it."""
    return pytest.mark.skipif(not path.exists(), reason=f"{what} is not checked out beside this repository")


def skip_without_sibling_path(rel_path: str, *, label: str) -> None:
    """Skip when `rel_path` reaches into a sibling repository that is not checked out."""
    if rel_path.startswith("../") and not (REPO_ROOT / rel_path).exists():
        sibling_name = rel_path.split("/", 2)[1]
        pytest.skip(f"{label}: {sibling_name} is not checked out beside this repository")


def requires_node_modules(*packages: str) -> pytest.MarkDecorator:
    """Skip when a Node package the test shells out to has not been installed."""
    missing = [p for p in packages if not (REPO_ROOT / "node_modules" / p).exists()]
    return pytest.mark.skipif(
        bool(missing),
        reason=f"node_modules/{', '.join(missing)} absent — run npm ci to include this test",
    )

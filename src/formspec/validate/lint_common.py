"""Shared lint() pass helpers for schema validation passes."""
from __future__ import annotations

from collections.abc import Callable
from typing import Any

from formspec._rust import lint

from formspec.validate.models import ArtifactFile, PassItemResult, PassResult


def walk_definition_items(items: list) -> list[dict]:
    """Recursively flatten a definition or component item tree."""
    result: list[dict] = []
    for item in items:
        result.append(item)
        result.extend(walk_definition_items(item.get("children", [])))
    return result


def artifact_target_def_url(artifact: ArtifactFile) -> str:
    url = getattr(artifact, "target_def_url", "")
    return url if isinstance(url, str) else ""


def lint_artifacts_pass(
    title: str,
    artifacts: list[ArtifactFile],
    *,
    all_defs: dict[str, ArtifactFile] | None = None,
    target_def_url: Callable[[ArtifactFile], str] | None = None,
    **lint_kwargs: Any,
) -> PassResult:
    """Run lint() on each artifact; optionally attach paired definition context."""
    if not artifacts:
        return PassResult(title=title, empty=True)

    pr = PassResult(title=title)
    for artifact in artifacts:
        kwargs = dict(lint_kwargs)
        label = artifact.path.name
        if all_defs is not None and target_def_url is not None:
            paired_def = all_defs.get(target_def_url(artifact))
            if paired_def:
                kwargs["component_definition"] = paired_def.doc
                label = f"{label} (def: {paired_def.path.name})"

        diags = lint(artifact.doc, **kwargs)
        errors = [d for d in diags if d.severity == "error"]
        warnings = [d for d in diags if d.severity == "warning"]
        pr.items.append(
            PassItemResult(
                label=label,
                error_count=len(errors),
                warning_count=len(warnings),
                diagnostics=diags,
            )
        )
    return pr


def lint_pass(
    title: str,
    artifacts: list[ArtifactFile],
    **lint_kwargs: Any,
) -> PassResult:
    """Run lint() on each artifact and collect results."""
    return lint_artifacts_pass(title, artifacts, **lint_kwargs)

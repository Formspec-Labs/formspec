"""Theme lint pass with paired definition context."""
from __future__ import annotations

from formspec.validate.lint_common import artifact_target_def_url, lint_artifacts_pass
from formspec.validate.models import DiscoveredArtifacts, PassResult


def pass_theme_linting(arts: DiscoveredArtifacts) -> PassResult:
    all_defs = {**arts.definitions, **arts.fragments}
    return lint_artifacts_pass(
        "Theme linting (with definition context)",
        arts.themes,
        all_defs=all_defs,
        target_def_url=artifact_target_def_url,
    )

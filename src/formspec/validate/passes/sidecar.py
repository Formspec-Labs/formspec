"""Mapping and changelog sidecar lint pass."""
from __future__ import annotations

from formspec.validate.lint_common import lint_pass
from formspec.validate.models import ArtifactFile, DiscoveredArtifacts, PassResult


def pass_sidecar_linting(arts: DiscoveredArtifacts) -> PassResult:
    sidecars: list[ArtifactFile] = []
    sidecars.extend(arts.mappings)
    sidecars.extend(arts.changelogs)
    return lint_pass("Sidecar document linting (mapping, changelog)", sidecars)

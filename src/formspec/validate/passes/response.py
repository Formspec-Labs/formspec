"""Response fixture schema validation pass."""
from __future__ import annotations

from formspec.validate.lint_common import lint_artifacts_pass
from formspec.validate.models import DiscoveredArtifacts, PassResult


def pass_response_schema(arts: DiscoveredArtifacts) -> PassResult:
    return lint_artifacts_pass("Response fixture schema validation", arts.responses)

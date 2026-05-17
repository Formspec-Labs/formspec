"""Intake handoff schema validation pass."""
from __future__ import annotations

from formspec.validate.lint_common import lint_artifacts_pass
from formspec.validate.models import DiscoveredArtifacts, PassResult


def pass_intake_handoff_schema(arts: DiscoveredArtifacts) -> PassResult:
    return lint_artifacts_pass("Intake handoff schema validation", arts.intake_handoffs)

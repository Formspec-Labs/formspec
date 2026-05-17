"""Run all validation passes and assemble a ValidationReport."""
from __future__ import annotations

from formspec.validate.models import DiscoveredArtifacts, ValidationReport
from formspec.validate.passes.changelog import pass_changelog_generation
from formspec.validate.passes.component import pass_component_linting
from formspec.validate.passes.definition import pass_definition_linting
from formspec.validate.passes.fel import pass_fel_expressions
from formspec.validate.passes.intake_handoff import pass_intake_handoff_schema
from formspec.validate.passes.mapping import pass_mapping_forward
from formspec.validate.passes.registry import pass_registry
from formspec.validate.passes.response import pass_response_schema
from formspec.validate.passes.runtime import pass_runtime_evaluation
from formspec.validate.passes.sidecar import pass_sidecar_linting
from formspec.validate.passes.signed_payload import pass_signed_payload_validation
from formspec.validate.passes.theme import pass_theme_linting


def validate_all(artifacts: DiscoveredArtifacts) -> ValidationReport:
    """Run all validation passes and return a structured report."""
    return ValidationReport(
        passes=[
            pass_definition_linting(artifacts),
            pass_sidecar_linting(artifacts),
            pass_theme_linting(artifacts),
            pass_component_linting(artifacts),
            pass_response_schema(artifacts),
            pass_intake_handoff_schema(artifacts),
            pass_signed_payload_validation(artifacts),
            pass_runtime_evaluation(artifacts),
            pass_mapping_forward(artifacts),
            pass_changelog_generation(artifacts),
            pass_registry(artifacts),
            pass_fel_expressions(artifacts),
        ]
    )

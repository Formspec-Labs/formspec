"""Auto-discover and validate all Formspec JSON artifacts in a directory.

CLI usage::

    python3 -m formspec.validate path/to/artifacts/
    python3 -m formspec.validate path/to/artifacts/ --registry common.registry.json
    python3 -m formspec.validate path/to/artifacts/ --title "My Project"

Library usage::

    from formspec.validate import discover_artifacts, validate_all, print_report
    artifacts = discover_artifacts(Path("my-project/"))
    sys.exit(print_report(validate_all(artifacts)))
"""
from __future__ import annotations

from formspec.validate.cli import main
from formspec.validate.discovery import discover_artifacts
from formspec.validate.models import (
    DEFINITION_LINTING_TITLE,
    SIGNED_PAYLOAD_VALIDATION_TITLE,
    ArtifactFile,
    ChangelogArtifact,
    ComponentArtifact,
    DefinitionArtifact,
    DiscoveredArtifacts,
    IntakeHandoffArtifact,
    MappingArtifact,
    PassItemResult,
    PassResult,
    ResponseArtifact,
    ThemeArtifact,
    ValidationReport,
)
from formspec.validate.orchestrator import validate_all
from formspec.validate.reporting import print_report, report_to_json

__all__ = [
    "DEFINITION_LINTING_TITLE",
    "SIGNED_PAYLOAD_VALIDATION_TITLE",
    "ArtifactFile",
    "ChangelogArtifact",
    "ComponentArtifact",
    "DefinitionArtifact",
    "DiscoveredArtifacts",
    "IntakeHandoffArtifact",
    "MappingArtifact",
    "PassItemResult",
    "PassResult",
    "ResponseArtifact",
    "ThemeArtifact",
    "ValidationReport",
    "discover_artifacts",
    "main",
    "print_report",
    "report_to_json",
    "validate_all",
]

"""Artifact discovery types, report models, and pass title constants."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from formspec._rust import LintDiagnostic

# Downstream consumers (benchmark runner, CI dashboards) match on these exact
# strings when they need to reason about a specific pass. Rename them here and
# downstream breaks loudly, not silently.

DEFINITION_LINTING_TITLE = "Definition linting"
SIGNED_PAYLOAD_VALIDATION_TITLE = "Signed payload cross-field invariant validation"


@dataclass
class ArtifactFile:
    path: Path
    doc: dict


@dataclass
class DefinitionArtifact(ArtifactFile):
    url: str = ""
    version: str = ""
    derived_from_url: str = ""


@dataclass
class ThemeArtifact(ArtifactFile):
    target_def_url: str = ""


@dataclass
class ComponentArtifact(ArtifactFile):
    target_def_url: str = ""


@dataclass
class MappingArtifact(ArtifactFile):
    definition_ref: str = ""


@dataclass
class ResponseArtifact(ArtifactFile):
    definition_url: str = ""
    definition_version: str = ""
    status: str = ""


@dataclass
class IntakeHandoffArtifact(ArtifactFile):
    handoff_id: str = ""
    initiation_mode: str = ""
    case_ref: str | None = None


@dataclass
class ChangelogArtifact(ArtifactFile):
    definition_url: str = ""


@dataclass
class DiscoveredArtifacts:
    definitions: dict[str, DefinitionArtifact] = field(default_factory=dict)
    definition_versions: dict[tuple[str, str], DefinitionArtifact] = field(
        default_factory=dict
    )
    fragments: dict[str, DefinitionArtifact] = field(default_factory=dict)
    components: list[ComponentArtifact] = field(default_factory=list)
    themes: list[ThemeArtifact] = field(default_factory=list)
    mappings: list[MappingArtifact] = field(default_factory=list)
    responses: list[ResponseArtifact] = field(default_factory=list)
    intake_handoffs: list[IntakeHandoffArtifact] = field(default_factory=list)
    changelogs: list[ChangelogArtifact] = field(default_factory=list)
    registries: list[ArtifactFile] = field(default_factory=list)
    changelog_pairs: list[tuple[DefinitionArtifact, DefinitionArtifact]] = field(
        default_factory=list
    )
    unknown: list[Path] = field(default_factory=list)


@dataclass
class PassItemResult:
    label: str
    error_count: int = 0
    warning_count: int = 0
    diagnostics: list[LintDiagnostic] = field(default_factory=list)
    runtime_results: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class PassResult:
    title: str
    items: list[PassItemResult] = field(default_factory=list)
    empty: bool = False


@dataclass
class ValidationReport:
    passes: list[PassResult] = field(default_factory=list)

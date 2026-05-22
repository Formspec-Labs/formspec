"""Response Actions + Validation Mapping sidecar lint pass.

Routes ResponseActions and ValidationMapping artifacts through the Rust
`lint()` bridge so schema, target-definition pairing, duplicate-id, invalid
override (E1803 / VMAP-INVALID-OVERRIDE), and ActionButton actionRef
resolution all fire in the Python conformance pipeline. Mirrors the
sidecar pass for mapping/changelog.
"""
from __future__ import annotations

from formspec.validate.lint_common import artifact_target_def_url, lint_artifacts_pass
from formspec.validate.models import (
    ArtifactFile,
    DiscoveredArtifacts,
    PassResult,
)


def pass_response_actions_linting(arts: DiscoveredArtifacts) -> PassResult:
    """Schema + semantic lint for Response Actions, paired with its Definition."""
    all_defs = {**arts.definitions, **arts.fragments}
    return lint_artifacts_pass(
        "Response Actions linting (with definition context)",
        list(arts.response_actions),
        all_defs=all_defs,
        target_def_url=artifact_target_def_url,
    )


def pass_validation_mapping_linting(arts: DiscoveredArtifacts) -> PassResult:
    """Schema lint for Validation Mapping. No paired-definition context — the
    document is a closed-vocabulary reference, not Definition-bound.
    """
    sidecars: list[ArtifactFile] = list(arts.validation_mappings)
    return lint_artifacts_pass(
        "Validation Mapping linting",
        sidecars,
    )

"""Definition and fragment lint pass."""
from __future__ import annotations

from formspec.validate.lint_common import lint_pass
from formspec.validate.models import DEFINITION_LINTING_TITLE, DiscoveredArtifacts, PassResult


def pass_definition_linting(arts: DiscoveredArtifacts) -> PassResult:
    all_defs = list(arts.definitions.values()) + list(arts.fragments.values())
    regs = [r.doc for r in arts.registries]
    return lint_pass(DEFINITION_LINTING_TITLE, all_defs, registry_documents=regs)

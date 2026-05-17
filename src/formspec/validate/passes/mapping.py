"""Mapping engine forward-transform pass."""
from __future__ import annotations

from formspec._rust import execute_mapping

from formspec.validate.models import DiscoveredArtifacts, PassItemResult, PassResult


def pass_mapping_forward(arts: DiscoveredArtifacts) -> PassResult:
    if not arts.mappings:
        return PassResult(title="Mapping engine (forward transform)", empty=True)

    pr = PassResult(title="Mapping engine (forward transform)")

    completed: dict[str, list] = {}
    for resp in arts.responses:
        if resp.status == "completed":
            completed.setdefault(resp.definition_url, []).append(resp)

    for mapping in arts.mappings:
        matching_responses = completed.get(mapping.definition_ref, [])
        if not matching_responses:
            pr.items.append(
                PassItemResult(
                    label=f"{mapping.path.name} (no matching completed responses)"
                )
            )
            continue

        for resp in matching_responses:
            data = resp.doc.get("data", {})
            try:
                result = execute_mapping(mapping.doc, data, "forward")
                keys = len(result.output)
                pr.items.append(
                    PassItemResult(
                        label=f"forward({resp.path.name}) via {mapping.path.name}",
                        runtime_results=[
                            {
                                "severity": "info",
                                "message": f"{keys} top-level keys in output",
                                "path": "",
                            }
                        ],
                    )
                )
            except Exception as e:
                pr.items.append(
                    PassItemResult(
                        label=f"forward({resp.path.name}) via {mapping.path.name}",
                        error_count=1,
                        runtime_results=[
                            {"severity": "error", "message": str(e), "path": ""}
                        ],
                    )
                )
    return pr

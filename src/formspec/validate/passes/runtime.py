"""Runtime evaluation pass for response fixtures."""
from __future__ import annotations

from formspec._rust import evaluate_definition

from formspec.validate.models import DiscoveredArtifacts, PassItemResult, PassResult


def pass_runtime_evaluation(arts: DiscoveredArtifacts) -> PassResult:
    if not arts.responses or not arts.definitions:
        return PassResult(title="Runtime evaluation", empty=True)

    pr = PassResult(title="Runtime evaluation")
    for resp in arts.responses:
        identity = (resp.definition_url, resp.definition_version)
        da = arts.definition_versions.get(identity)
        if not da:
            message = (
                "No definition found for pinned response "
                f"{resp.definition_url}@{resp.definition_version}"
            )
            available_versions = sorted(
                version
                for (url, version) in arts.definition_versions
                if url == resp.definition_url
            )
            if available_versions:
                message += f"; available versions: {', '.join(available_versions)}"

            pr.items.append(
                PassItemResult(
                    label=resp.path.name,
                    error_count=1,
                    runtime_results=[
                        {"severity": "error", "message": message, "path": ""}
                    ],
                )
            )
            continue

        data = resp.doc.get("data", {})
        result = evaluate_definition(da.doc, data)
        errors = [r for r in result.results if r.get("severity") == "error"]
        warnings = [r for r in result.results if r.get("severity") == "warning"]

        mode = "submit" if resp.status == "completed" else "continuous"
        if mode == "submit":
            pr.items.append(
                PassItemResult(
                    label=f"{resp.path.name} ({mode})",
                    error_count=len(errors),
                    warning_count=len(warnings),
                    runtime_results=result.results,
                )
            )
        else:
            summary = f"valid={result.valid}, {len(errors)} error(s), {len(warnings)} warning(s) (expected for in-progress)"
            pr.items.append(
                PassItemResult(
                    label=f"{resp.path.name} ({mode})",
                    runtime_results=[
                        {"severity": "info", "message": summary, "path": ""}
                    ],
                )
            )
    return pr

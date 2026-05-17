"""Changelog generation and schema validation pass."""
from __future__ import annotations

from formspec._rust import generate_changelog, lint

from formspec.validate.models import DiscoveredArtifacts, PassItemResult, PassResult


def pass_changelog_generation(arts: DiscoveredArtifacts) -> PassResult:
    if not arts.changelog_pairs:
        return PassResult(title="Changelog generation", empty=True)

    pr = PassResult(title="Changelog generation")

    for parent, child in arts.changelog_pairs:
        pair_label = f"{parent.path.name} → {child.path.name}"
        try:
            changelog = generate_changelog(
                parent.doc, child.doc, child.url, wire_style="camel"
            )
        except Exception as e:
            pr.items.append(
                PassItemResult(
                    label=f"generate_changelog({pair_label})",
                    error_count=1,
                    runtime_results=[
                        {"severity": "error", "message": str(e), "path": ""}
                    ],
                )
            )
            continue

        changes = changelog.get("changes", [])
        impact = changelog.get("semverImpact", "unknown")
        pr.items.append(
            PassItemResult(
                label=f"generate_changelog({pair_label})",
                runtime_results=[
                    {
                        "severity": "info",
                        "message": f"{len(changes)} change(s), semver_impact={impact}",
                        "path": "",
                    }
                ],
            )
        )

        diags = lint(changelog)
        errors = [d for d in diags if d.severity == "error"]
        warnings = [d for d in diags if d.severity == "warning"]
        pr.items.append(
            PassItemResult(
                label="generated changelog schema",
                error_count=len(errors),
                warning_count=len(warnings),
                diagnostics=diags,
            )
        )
    return pr

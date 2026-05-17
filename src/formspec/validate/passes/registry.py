"""Extension registry parse and definition cross-check pass."""
from __future__ import annotations

from formspec._rust import find_registry_entry, parse_registry

from formspec.validate.lint_common import walk_definition_items
from formspec.validate.models import DiscoveredArtifacts, PassItemResult, PassResult


def pass_registry(arts: DiscoveredArtifacts) -> PassResult:
    if not arts.registries:
        return PassResult(title="Extension registry", empty=True)

    all_defs = {**arts.definitions, **arts.fragments}
    pr = PassResult(title="Extension registry")

    for reg_file in arts.registries:
        try:
            info = parse_registry(reg_file.doc)
        except Exception as e:
            pr.items.append(
                PassItemResult(
                    label=f"Registry parse ({reg_file.path.name})",
                    error_count=1,
                    runtime_results=[
                        {"severity": "error", "message": str(e), "path": ""}
                    ],
                )
            )
            continue

        if info.validation_issues:
            pr.items.append(
                PassItemResult(
                    label=f"registry.validate() ({reg_file.path.name})",
                    error_count=len(info.validation_issues),
                    runtime_results=[
                        {"severity": "error", "message": issue, "path": ""}
                        for issue in info.validation_issues
                    ],
                )
            )
        else:
            pr.items.append(
                PassItemResult(
                    label=f"registry.validate() ({reg_file.path.name})",
                    runtime_results=[
                        {
                            "severity": "info",
                            "message": "0 consistency issues",
                            "path": "",
                        }
                    ],
                )
            )

    for da in all_defs.values():
        ext_names: set[str] = set()
        for item in walk_definition_items(da.doc.get("items", [])):
            for ext_key in item.get("extensions", {}).keys():
                ext_names.add(ext_key)

        if not ext_names:
            continue

        for ext_name in sorted(ext_names):
            found = False
            for reg_file in arts.registries:
                entry = find_registry_entry(reg_file.doc, ext_name)
                if entry:
                    version = entry.get("version", "?")
                    status = entry.get("status", "?")
                    pr.items.append(
                        PassItemResult(
                            label=f"{da.path.name}: {ext_name}",
                            runtime_results=[
                                {
                                    "severity": "info",
                                    "message": f"v{version} ({status})",
                                    "path": "",
                                }
                            ],
                        )
                    )
                    found = True
                    break
            if not found:
                pr.items.append(
                    PassItemResult(
                        label=f"{da.path.name}: {ext_name}",
                        error_count=1,
                        runtime_results=[
                            {
                                "severity": "error",
                                "message": "not found in registry",
                                "path": "",
                            }
                        ],
                    )
                )
    return pr

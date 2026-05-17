"""Glob and classify Formspec JSON artifacts in a directory."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from formspec._rust import detect_document_type

from formspec.validate.models import (
    ArtifactFile,
    ChangelogArtifact,
    ComponentArtifact,
    DefinitionArtifact,
    DiscoveredArtifacts,
    IntakeHandoffArtifact,
    MappingArtifact,
    ResponseArtifact,
    ThemeArtifact,
)


def find_refs(obj: Any) -> set[str]:
    """Walk a JSON tree and collect all $ref URL strings."""
    refs: set[str] = set()
    if isinstance(obj, dict):
        if "$ref" in obj and isinstance(obj["$ref"], str):
            url = obj["$ref"].split("#")[0]
            if url:
                refs.add(url)
        for v in obj.values():
            refs.update(find_refs(v))
    elif isinstance(obj, list):
        for v in obj:
            refs.update(find_refs(v))
    return refs


def discover_artifacts(
    directory: Path,
    *,
    fixture_subdirs: tuple[str, ...] = ("fixtures",),
    registry_paths: tuple[Path, ...] = (),
) -> DiscoveredArtifacts:
    """Glob *.json files, classify via schema detection, and pair by URL references."""
    arts = DiscoveredArtifacts()

    json_paths: list[Path] = sorted(directory.glob("*.json"))
    for subdir in fixture_subdirs:
        sub = directory / subdir
        if sub.is_dir():
            json_paths.extend(sorted(sub.glob("*.json")))

    for path in json_paths:
        try:
            doc = json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            arts.unknown.append(path)
            continue

        doc_type = detect_document_type(doc)
        if doc_type == "definition":
            url = doc.get("url", "")
            version = doc.get("version", "")
            derived = ""
            if isinstance(doc.get("derivedFrom"), dict):
                derived = doc["derivedFrom"].get("url", "")
            artifact = DefinitionArtifact(
                path=path, doc=doc, url=url, version=version, derived_from_url=derived
            )
            arts.definitions[url] = artifact
            arts.definition_versions[(url, version)] = artifact
        elif doc_type == "component":
            target = ""
            if isinstance(doc.get("targetDefinition"), dict):
                target = doc["targetDefinition"].get("url", "")
            arts.components.append(
                ComponentArtifact(path=path, doc=doc, target_def_url=target)
            )
        elif doc_type == "theme":
            target = ""
            if isinstance(doc.get("targetDefinition"), dict):
                target = doc["targetDefinition"].get("url", "")
            arts.themes.append(
                ThemeArtifact(path=path, doc=doc, target_def_url=target)
            )
        elif doc_type == "mapping":
            arts.mappings.append(
                MappingArtifact(
                    path=path, doc=doc, definition_ref=doc.get("definitionRef", "")
                )
            )
        elif doc_type == "response":
            arts.responses.append(
                ResponseArtifact(
                    path=path,
                    doc=doc,
                    definition_url=doc.get("definitionUrl", ""),
                    definition_version=doc.get("definitionVersion", ""),
                    status=doc.get("status", ""),
                )
            )
        elif doc_type == "intake_handoff":
            case_ref = doc.get("caseRef")
            arts.intake_handoffs.append(
                IntakeHandoffArtifact(
                    path=path,
                    doc=doc,
                    handoff_id=doc.get("handoffId", ""),
                    initiation_mode=doc.get("initiationMode", ""),
                    case_ref=case_ref if isinstance(case_ref, str) else None,
                )
            )
        elif doc_type == "changelog":
            arts.changelogs.append(
                ChangelogArtifact(
                    path=path,
                    doc=doc,
                    definition_url=doc.get("definitionUrl", ""),
                )
            )
        elif doc_type == "registry":
            arts.registries.append(ArtifactFile(path=path, doc=doc))
        else:
            arts.unknown.append(path)

    for rp in registry_paths:
        if rp.exists():
            try:
                doc = json.loads(rp.read_text())
                arts.registries.append(ArtifactFile(path=rp, doc=doc))
            except (json.JSONDecodeError, OSError):
                arts.unknown.append(rp)

    ref_targets: set[str] = set()
    for da in arts.definitions.values():
        ref_targets.update(find_refs(da.doc))

    for url in list(arts.definitions.keys()):
        if url and url in ref_targets:
            arts.fragments[url] = arts.definitions.pop(url)

    all_defs = {**arts.definitions, **arts.fragments}
    for da in arts.definitions.values():
        if da.derived_from_url and da.derived_from_url in all_defs:
            parent = all_defs[da.derived_from_url]
            arts.changelog_pairs.append((parent, da))

    return arts

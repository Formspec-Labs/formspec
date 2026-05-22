"""Reference resolver conformance for Component reference fields."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any, Iterable

import pytest


ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "tests" / "conformance" / "fixtures" / "component-reference-fields"
CODE = "COMP-REFERENTIAL-INTEGRITY"


def _load_fixture(name: str) -> dict[str, Any]:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _pointer_escape(segment: str) -> str:
    return segment.replace("~", "~0").replace("/", "~1")


def _node_key(node: dict[str, Any], path: str) -> str:
    node_id = node.get("id")
    return node_id if isinstance(node_id, str) and node_id else path


def _finding(
    *,
    kind: str,
    severity: str,
    node: dict[str, Any],
    node_path: str,
    message: str,
    **details: Any,
) -> dict[str, Any]:
    result = {
        "code": CODE,
        "kind": kind,
        "severity": severity,
        "message": message,
        "nodePath": node_path,
    }
    node_id = node.get("id")
    if isinstance(node_id, str) and node_id:
        result["nodeId"] = node_id
    result.update(details)
    return result


def _walk_items(items: Iterable[dict[str, Any]]) -> Iterable[dict[str, Any]]:
    for item in items:
        yield item
        children = item.get("children")
        if isinstance(children, list):
            yield from _walk_items(child for child in children if isinstance(child, dict))


def _definition_item_ids(definition: dict[str, Any] | None) -> set[str]:
    if definition is None:
        return set()
    ids = {
        item["key"]
        for item in _walk_items(definition.get("items", []))
        if isinstance(item.get("key"), str)
    }
    ids.update(
        bind["path"]
        for bind in definition.get("binds", [])
        if isinstance(bind, dict) and isinstance(bind.get("path"), str)
    )
    return ids


def _ids(document: dict[str, Any] | None, key: str) -> set[str]:
    if document is None:
        return set()
    return {
        entry["id"]
        for entry in document.get(key, [])
        if isinstance(entry, dict) and isinstance(entry.get("id"), str)
    }


def _registry_concept_ids(registry: dict[str, Any] | None) -> set[str]:
    if registry is None:
        return set()
    ids: set[str] = set()
    for entry in registry.get("entries", []):
        if not isinstance(entry, dict) or entry.get("category") != "concept":
            continue
        for field in ("name", "conceptUri"):
            value = entry.get(field)
            if isinstance(value, str):
                ids.add(value)
    return ids


def _ontology_concept_ids(ontology: dict[str, Any] | None) -> set[str]:
    if ontology is None:
        return set()
    ids: set[str] = set()
    concepts = ontology.get("concepts", {})
    if not isinstance(concepts, dict):
        return ids
    for key, concept in concepts.items():
        ids.add(key)
        if isinstance(concept, dict):
            for field in ("concept", "code", "system"):
                value = concept.get(field)
                if isinstance(value, str):
                    ids.add(value)
    return ids


def _component_nodes(component: dict[str, Any]) -> Iterable[tuple[str, dict[str, Any]]]:
    def walk(node: Any, path: str) -> Iterable[tuple[str, dict[str, Any]]]:
        if not isinstance(node, dict) or not isinstance(node.get("component"), str):
            return
        yield path, node
        children = node.get("children")
        if isinstance(children, list):
            for index, child in enumerate(children):
                yield from walk(child, f"{path}/children/{index}")

    yield from walk(component.get("tree"), "/tree")

    templates = component.get("components", {})
    if isinstance(templates, dict):
        for name in sorted(templates):
            template = templates[name]
            if isinstance(template, dict):
                path = f"/components/{_pointer_escape(name)}/tree"
                yield from walk(template.get("tree"), path)


def resolve_component_references(
    component: dict[str, Any],
    *,
    definition: dict[str, Any] | None = None,
    experience: dict[str, Any] | None = None,
    response_actions: dict[str, Any] | None = None,
    registry: dict[str, Any] | None = None,
    ontology: dict[str, Any] | None = None,
    host_policy: dict[str, Any] | None = None,
) -> dict[str, Any]:
    policy = host_policy or {}
    item_ids = _definition_item_ids(definition)
    unit_ids = _ids(experience, "units")
    task_ids = _ids(experience, "tasks")
    action_ids = _ids(response_actions, "actions")
    registry_concepts = _registry_concept_ids(registry)
    ontology_concepts = _ontology_concept_ids(ontology)
    external_concepts = set(policy.get("externalConceptIds", []))
    check_anchors = bool(policy.get("checkAnchors", False))

    findings: list[dict[str, Any]] = []
    annotations: dict[str, dict[str, Any]] = {}

    def resolve_concept(ref: dict[str, Any]) -> bool | None:
        source = ref.get("source")
        ref_id = ref.get("id")
        if not isinstance(ref_id, str):
            return False
        if source == "registry":
            return ref_id in registry_concepts if registry is not None else None
        if source == "ontology":
            return ref_id in ontology_concepts if ontology is not None else None
        if source == "external":
            return ref_id in external_concepts if external_concepts else None
        return False

    def anchor_resolves(anchor: str) -> bool:
        prefix, separator, suffix = anchor.partition(":")
        if not separator:
            return False
        if prefix == "item":
            return suffix in item_ids
        if prefix == "unit":
            return suffix in unit_ids
        if prefix == "task":
            return suffix in task_ids
        if prefix == "action":
            return suffix in action_ids
        if prefix == "concept":
            return (
                suffix in registry_concepts
                or suffix in ontology_concepts
                or suffix in external_concepts
            )
        return False

    for node_path, node in _component_nodes(component):
        key = _node_key(node, node_path)
        annotation: dict[str, Any] = {"nodePath": node_path}
        if key != node_path:
            annotation["nodeId"] = key

        if node.get("component") == "ActionButton":
            action_ref = node.get("actionRef")
            if isinstance(action_ref, str):
                if response_actions is None:
                    findings.append(
                        _finding(
                            kind="actionRef",
                            severity="error",
                            node=node,
                            node_path=node_path,
                            message=f"Action reference '{action_ref}' cannot be resolved without Response Actions.",
                            target=action_ref,
                            reason="no-response-actions-document",
                        )
                    )
                    annotation["actionRefResolved"] = False
                elif action_ref not in action_ids:
                    findings.append(
                        _finding(
                            kind="actionRef",
                            severity="error",
                            node=node,
                            node_path=node_path,
                            message=f"Action reference '{action_ref}' does not resolve.",
                            target=action_ref,
                        )
                    )
                    annotation["actionRefResolved"] = False
                else:
                    annotation["actionRefResolved"] = True

        unit_ref = node.get("unitRef")
        if isinstance(unit_ref, str):
            if experience is None:
                findings.append(
                    _finding(
                        kind="unitRef",
                        severity="info",
                        node=node,
                        node_path=node_path,
                        message=f"Unit reference '{unit_ref}' cannot be confirmed without Experience.",
                        unresolvedUnitId=unit_ref,
                        reason="no-experience-document",
                    )
                )
                annotation["unitRefResolved"] = False
            elif unit_ref not in unit_ids:
                findings.append(
                    _finding(
                        kind="unitRef",
                        severity="error",
                        node=node,
                        node_path=node_path,
                        message=f"Unit reference '{unit_ref}' does not resolve.",
                        unresolvedUnitId=unit_ref,
                    )
                )
                annotation["unitRefResolved"] = False
            else:
                annotation["resolvedUnitId"] = unit_ref
                annotation["unitRefResolved"] = True

        task_refs = node.get("taskRefs")
        if isinstance(task_refs, list):
            refs = [ref for ref in task_refs if isinstance(ref, str)]
            if experience is None:
                findings.append(
                    _finding(
                        kind="taskRefs",
                        severity="info",
                        node=node,
                        node_path=node_path,
                        message="Task references cannot be confirmed without Experience.",
                        unresolvedTaskIds=refs,
                        reason="no-experience-document",
                    )
                )
                annotation["taskRefsResolved"] = False
            else:
                missing = [ref for ref in refs if ref not in task_ids]
                if missing:
                    findings.append(
                        _finding(
                            kind="taskRefs",
                            severity="warning",
                            node=node,
                            node_path=node_path,
                            message="One or more task references do not resolve.",
                            unresolvedTaskIds=missing,
                        )
                    )
                    annotation["taskRefsResolved"] = False
                else:
                    annotation["resolvedTaskIds"] = refs
                    annotation["taskRefsResolved"] = True

        concept_refs = node.get("conceptRefs")
        if isinstance(concept_refs, list):
            unresolved = []
            attempted = False
            for ref in concept_refs:
                if not isinstance(ref, dict) or not isinstance(ref.get("id"), str):
                    continue
                resolved = resolve_concept(ref)
                if resolved is None:
                    continue
                attempted = True
                if resolved is False:
                    unresolved.append(ref["id"])
            if attempted and unresolved:
                findings.append(
                    _finding(
                        kind="conceptRefs",
                        severity="info",
                        node=node,
                        node_path=node_path,
                        message="One or more concept references do not resolve.",
                        unresolvedConceptIds=unresolved,
                    )
                )
                annotation["conceptRefsResolved"] = False
            elif attempted:
                annotation["resolvedConceptIds"] = [
                    ref["id"]
                    for ref in concept_refs
                    if isinstance(ref, dict) and isinstance(ref.get("id"), str)
                ]
                annotation["conceptRefsResolved"] = True

        generation = node.get("x-generation")
        anchors = generation.get("anchors") if isinstance(generation, dict) else None
        if check_anchors and isinstance(anchors, list):
            anchor_values = [anchor for anchor in anchors if isinstance(anchor, str)]
            unresolved_anchors = [
                anchor for anchor in anchor_values if not anchor_resolves(anchor)
            ]
            if unresolved_anchors:
                findings.append(
                    _finding(
                        kind="x-generation.anchors",
                        severity="info",
                        node=node,
                        node_path=node_path,
                        message="One or more generation anchors do not resolve.",
                        unresolvedAnchors=unresolved_anchors,
                    )
                )
                annotation["generationAnchorsResolved"] = False
            else:
                annotation["resolvedGenerationAnchors"] = anchor_values
                annotation["generationAnchorsResolved"] = True

        annotations[key] = annotation

    return {"findings": findings, "annotations": annotations}


def _base_context() -> dict[str, dict[str, Any]]:
    return {
        "definition": _load_fixture("definition-base.json"),
        "experience": _load_fixture("experience-base.json"),
        "response_actions": _load_fixture("response-actions-base.json"),
        "registry": _load_fixture("registry-base.json"),
        "ontology": _load_fixture("ontology-base.json"),
    }


def test_resolver_happy_path_has_no_findings_and_full_annotation_map() -> None:
    context = _base_context()
    component = _load_fixture("component-all-refs-resolved.json")

    report = resolve_component_references(
        component,
        **context,
        host_policy={"checkAnchors": True},
    )

    assert report["findings"] == []
    assert set(report["annotations"]) == {
        "applicantDetails",
        "applicantNameInput",
        "householdSizeInput",
        "saveDraftButton",
        "applicantSignatureInput",
        "submitButton",
    }
    assert report["annotations"]["applicantDetails"]["resolvedUnitId"] == "identity"
    assert report["annotations"]["saveDraftButton"]["actionRefResolved"] is True


@pytest.mark.parametrize(
    ("fixture_name", "context_overrides", "expected"),
    [
        (
            "component-unit-ref-unresolved.json",
            {},
            [
                {
                    "kind": "unitRef",
                    "severity": "error",
                    "nodeId": "missingUnitSection",
                    "nodePath": "/tree",
                    "unresolvedUnitId": "missingUnit",
                }
            ],
        ),
        (
            "component-task-refs-unresolved.json",
            {},
            [
                {
                    "kind": "taskRefs",
                    "severity": "warning",
                    "nodeId": "missingTasksSection",
                    "nodePath": "/tree",
                    "unresolvedTaskIds": ["missingTask", "anotherMissingTask"],
                }
            ],
        ),
        (
            "component-concept-refs-unresolved.json",
            {},
            [
                {
                    "kind": "conceptRefs",
                    "severity": "info",
                    "nodeId": "missingConceptsSection",
                    "nodePath": "/tree",
                    "unresolvedConceptIds": [
                        "x-example-missing-concept",
                        "https://example.gov/concepts/missing-concept",
                    ],
                }
            ],
        ),
        (
            "component-no-experience-document.json",
            {"experience": None},
            [
                {
                    "kind": "unitRef",
                    "severity": "info",
                    "nodeId": "noExperienceSection",
                    "nodePath": "/tree",
                    "unresolvedUnitId": "identity",
                    "reason": "no-experience-document",
                },
                {
                    "kind": "taskRefs",
                    "severity": "info",
                    "nodeId": "noExperienceSection",
                    "nodePath": "/tree",
                    "unresolvedTaskIds": ["identifyApplicant", "reviewHousehold"],
                    "reason": "no-experience-document",
                },
            ],
        ),
    ],
)
def test_resolver_fixtures_pin_reference_finding_severities(
    fixture_name: str,
    context_overrides: dict[str, Any],
    expected: list[dict[str, Any]],
) -> None:
    context = _base_context()
    context.update(context_overrides)

    report = resolve_component_references(_load_fixture(fixture_name), **context)

    assert [
        {key: finding[key] for key in expected_finding}
        for finding, expected_finding in zip(report["findings"], expected, strict=True)
    ] == expected
    assert len(report["findings"]) == len(expected)


def test_generation_anchor_resolution_reports_missing_anchors_per_node() -> None:
    context = _base_context()
    component = _load_fixture("x-generation-anchors-coverage.json")
    component["tree"]["x-generation"]["anchors"].extend(
        [
            "item:missingItem",
            "unit:missingUnit",
            "task:missingTask",
            "action:missingAction",
            "concept:missingConcept",
        ]
    )

    report = resolve_component_references(
        component,
        **context,
        host_policy={"checkAnchors": True},
    )

    assert report["findings"] == [
        {
            "code": CODE,
            "kind": "x-generation.anchors",
            "severity": "info",
            "message": "One or more generation anchors do not resolve.",
            "nodePath": "/tree",
            "nodeId": "generationCoverageSection",
            "unresolvedAnchors": [
                "item:missingItem",
                "unit:missingUnit",
                "task:missingTask",
                "action:missingAction",
                "concept:missingConcept",
            ],
        }
    ]


def test_resolver_is_deterministic_no_mutation_and_one_directional() -> None:
    context = _base_context()
    component = _load_fixture("component-all-refs-resolved.json")
    host_policy = {"checkAnchors": True}
    inputs = {"component": component, **context, "host_policy": host_policy}
    before = copy.deepcopy(inputs)

    report_one = resolve_component_references(
        component,
        **context,
        host_policy=host_policy,
    )
    report_two = resolve_component_references(
        component,
        **context,
        host_policy=host_policy,
    )

    assert report_one == report_two
    assert inputs == before


def test_node_without_id_uses_stable_json_pointer_annotation_key() -> None:
    context = _base_context()
    component = _load_fixture("component-no-refs.json")
    component["tree"]["unitRef"] = "identity"

    report = resolve_component_references(component, **context)

    assert "/tree" in report["annotations"]
    assert report["annotations"]["/tree"]["nodePath"] == "/tree"
    assert report["annotations"]["/tree"]["resolvedUnitId"] == "identity"
    assert "nodeId" not in report["annotations"]["/tree"]


def test_custom_template_trees_are_visited_in_lexical_order() -> None:
    component = {
        "$formspecComponent": "1.1",
        "version": "1.0.0",
        "targetDefinition": {
            "url": "https://example.gov/forms/component-reference-fields-base"
        },
        "components": {
            "BetaTemplate": {
                "tree": {
                    "component": "Section",
                    "id": "betaTemplate",
                    "title": "Beta",
                    "unitRef": "missingBeta",
                }
            },
            "AlphaTemplate": {
                "tree": {
                    "component": "Section",
                    "id": "alphaTemplate",
                    "title": "Alpha",
                    "unitRef": "missingAlpha",
                }
            },
        },
        "tree": {"component": "Section", "title": "Root"},
    }

    report = resolve_component_references(
        component,
        experience=_load_fixture("experience-base.json"),
    )

    assert [
        (finding["nodeId"], finding["nodePath"], finding["unresolvedUnitId"])
        for finding in report["findings"]
    ] == [
        ("alphaTemplate", "/components/AlphaTemplate/tree", "missingAlpha"),
        ("betaTemplate", "/components/BetaTemplate/tree", "missingBeta"),
    ]

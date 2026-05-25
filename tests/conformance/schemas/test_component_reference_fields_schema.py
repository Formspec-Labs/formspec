"""Schema tests for Component reference fields."""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

from tests.unit.support.schema_fixtures import build_schema_registry, load_schema


REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURES_DIR = REPO_ROOT / "tests" / "conformance" / "fixtures" / "component-reference-fields"

COMMON_SCHEMA = load_schema("common.schema.json")
COMPONENT_SCHEMA = load_schema("component.schema.json")
EXPERIENCE_SCHEMA = load_schema("experience.schema.json")
COMPONENT_REGISTRY = build_schema_registry(COMMON_SCHEMA, COMPONENT_SCHEMA, EXPERIENCE_SCHEMA)
COMPONENT_VALIDATOR = Draft202012Validator(
    COMPONENT_SCHEMA,
    registry=COMPONENT_REGISTRY,
    format_checker=Draft202012Validator.FORMAT_CHECKER,
)

EXPERIENCE_ID_PATTERN = "^[a-zA-Z][a-zA-Z0-9_]*$"
EXPERIENCE_CONCEPT_REF = "https://formspec.org/schemas/experience/1.0#/$defs/ConceptRef"


def _minimal_component_doc() -> dict:
    return {
        "$formspecComponent": "1.1",
        "version": "1.0.0",
        "targetDefinition": {"url": "https://example.gov/forms/component-reference-fields-base"},
        "tree": {"component": "Section", "title": "Reference fields"},
    }


def _assert_invalid(doc: dict) -> None:
    with pytest.raises(ValidationError):
        COMPONENT_VALIDATOR.validate(doc)


def test_component_schema_id_and_version_marker() -> None:
    assert COMPONENT_SCHEMA["$id"] == "https://formspec.org/schemas/component/1.2"

    marker = COMPONENT_SCHEMA["properties"]["$formspecComponent"]
    assert marker["type"] == "string"
    assert marker["enum"] == ["1.0", "1.1", "1.2"]
    assert "const" not in marker


def test_reference_fields_are_optional_component_base_properties() -> None:
    base = COMPONENT_SCHEMA["$defs"]["ComponentBase"]
    props = base["properties"]

    assert base["required"] == ["component"]
    assert "unevaluatedProperties" not in base
    assert base.get("additionalProperties") is not False

    for name in ["unitRef", "taskRefs", "conceptRefs", "x-generation"]:
        assert name in props
        assert name not in base["required"]


def test_reference_field_shapes() -> None:
    props = COMPONENT_SCHEMA["$defs"]["ComponentBase"]["properties"]

    assert props["unitRef"]["type"] == "string"
    assert props["unitRef"]["pattern"] == EXPERIENCE_ID_PATTERN

    task_refs = props["taskRefs"]
    assert task_refs["type"] == "array"
    assert task_refs["items"] == {"type": "string", "pattern": EXPERIENCE_ID_PATTERN}
    assert "uniqueItems" not in task_refs

    assert props["conceptRefs"]["type"] == "array"
    assert props["conceptRefs"]["items"] == {"$ref": EXPERIENCE_CONCEPT_REF}

    generation = props["x-generation"]
    assert generation["$ref"] == "https://formspec.org/schemas/common/1.0#/$defs/Generation"
    assert "type" not in generation

    common_generation = COMMON_SCHEMA["$defs"]["Generation"]
    assert common_generation["type"] == "object"
    assert "required" not in common_generation
    generation_props = common_generation["properties"]
    assert {"source", "strategy", "generatedBy", "generatedAt", "anchors"}.issubset(
        generation_props
    )
    assert generation_props["generatedAt"]["type"] == "string"
    assert "format" not in generation_props["generatedAt"]
    assert generation_props["anchors"]["type"] == "array"
    assert generation_props["anchors"]["items"] == {
        "type": "string",
        "pattern": "^(item|unit|task|action|concept):.+$",
    }


def test_existing_component_base_contracts_are_unchanged() -> None:
    props = COMPONENT_SCHEMA["$defs"]["ComponentBase"]["properties"]

    assert props["id"]["type"] == "string"
    assert props["id"]["pattern"] == "^[a-zA-Z][a-zA-Z0-9_\\-]*$"
    assert props["component"]["type"] == "string"
    assert props["component"]["minLength"] == 1
    assert props["when"]["type"] == "string"
    assert props["responsive"]["$ref"] == "#/$defs/ResponsiveOverrides"
    assert props["style"]["$ref"] == "#/$defs/StyleMap"
    assert props["accessibility"]["$ref"] == "#/$defs/AccessibilityBlock"
    assert props["cssClass"]["oneOf"] == [
        {"type": "string"},
        {"type": "array", "items": {"type": "string"}},
    ]
    assert props["layout"]["$ref"] == "#/$defs/ComponentLayout"


def test_reference_field_component_fixtures_validate() -> None:
    for path in sorted(FIXTURES_DIR.glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        if "$formspecComponent" not in doc:
            continue
        COMPONENT_VALIDATOR.validate(doc)


def test_component_version_rejects_unknown_marker() -> None:
    doc = _minimal_component_doc()
    doc["$formspecComponent"] = "1.3"

    _assert_invalid(doc)


def test_unit_ref_uses_experience_identifier_pattern() -> None:
    doc = _minimal_component_doc()
    doc["tree"]["unitRef"] = "bad-unit"

    _assert_invalid(doc)


def test_concept_refs_reuse_experience_concept_ref_shape() -> None:
    doc = _minimal_component_doc()
    doc["tree"]["conceptRefs"] = [{"source": "registry"}]

    _assert_invalid(doc)


def test_generation_anchor_prefix_is_constrained() -> None:
    doc = _minimal_component_doc()
    doc["tree"]["x-generation"] = {
        "source": "unit:identity",
        "anchors": ["unknown:identity"],
    }

    _assert_invalid(doc)


def test_generation_generated_at_is_not_format_enforced() -> None:
    doc = _minimal_component_doc()
    doc["tree"]["x-generation"] = {"generatedAt": "not an RFC 3339 timestamp"}

    COMPONENT_VALIDATOR.validate(copy.deepcopy(doc))


def test_generation_accepts_graph_wide_component_provenance() -> None:
    doc = _minimal_component_doc()
    doc["tree"]["x-generation"] = {
        "copiedFrom": {
            "component": {
                "handle": "reviewRoute",
                "url": "https://example.gov/apps/workspace/components/review-route",
                "version": "1.0.0",
            },
            "surface": {
                "url": "https://example.gov/apps/workspace/surfaces/respondent",
                "version": "1.0.0",
            },
            "route": "review",
            "nodePath": "/reviewLayout/submit",
            "id": "submitButton",
            "nodeId": "submitNode",
        },
        "movedFrom": {
            "component": {"handle": "reviewRoute"},
            "surface": {"url": "https://example.gov/apps/workspace/surfaces/respondent"},
            "route": "review",
            "nodePath": "/reviewLayout",
        },
    }

    COMPONENT_VALIDATOR.validate(copy.deepcopy(doc))


def test_generation_keeps_legacy_same_runtime_provenance_subset() -> None:
    doc = _minimal_component_doc()
    doc["tree"]["x-generation"] = {
        "copiedFrom": {"route": "review", "nodePath": "reviewLayout.submit"}
    }

    COMPONENT_VALIDATOR.validate(copy.deepcopy(doc))


def test_generation_rejects_graph_wide_provenance_with_relative_node_path() -> None:
    doc = _minimal_component_doc()
    doc["tree"]["x-generation"] = {
        "copiedFrom": {
            "component": {"handle": "reviewRoute"},
            "surface": {"url": "https://example.gov/apps/workspace/surfaces/respondent"},
            "route": "review",
            "nodePath": "reviewLayout",
        }
    }

    _assert_invalid(doc)

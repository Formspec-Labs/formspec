"""Conformance tests for ADR 0150 §4.7: ComponentBase gains `extensions` slot
for ^x-* payloads. Closes the spike's F2 finding where `x-generation` payload
extensions on a node had no typed home — propagation was blocked by the
`unevaluatedProperties: false` posture on each component variant.
"""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

SCHEMAS_DIR = Path(__file__).parents[2] / "schemas"
COMPONENT_SCHEMA = json.loads((SCHEMAS_DIR / "component.schema.json").read_text())
COMMON_SCHEMA = json.loads((SCHEMAS_DIR / "common.schema.json").read_text())
EXPERIENCE_SCHEMA = json.loads((SCHEMAS_DIR / "experience.schema.json").read_text())

_REF_REGISTRY = Registry().with_resources(
    [
        (COMMON_SCHEMA["$id"], Resource.from_contents(COMMON_SCHEMA, default_specification=DRAFT202012)),
        (COMPONENT_SCHEMA["$id"], Resource.from_contents(COMPONENT_SCHEMA, default_specification=DRAFT202012)),
        (EXPERIENCE_SCHEMA["$id"], Resource.from_contents(EXPERIENCE_SCHEMA, default_specification=DRAFT202012)),
    ]
)


def _validate_section(node: dict) -> None:
    """Validate a Section component variant (a concrete ComponentBase consumer
    with unevaluatedProperties: false — the strict-posture spike F2 case)."""
    validator = Draft202012Validator(
        {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "$defs": COMPONENT_SCHEMA["$defs"],
            "$ref": "#/$defs/Section",
        },
        registry=_REF_REGISTRY,
    )
    validator.validate(node)


def _minimal_section() -> dict:
    return {"component": "Section"}


# ─── extensions slot accepts x- payloads ─────────────────────────────────────


def test_extensions_accepts_x_payload():
    """x-foo payload lives inside `extensions` slot."""
    node = _minimal_section()
    node["extensions"] = {
        "x-formspec-ai-thinking": {"confidence": 0.92, "model": "claude-opus-4.7"},
    }
    _validate_section(node)


def test_extensions_accepts_multiple_x_keys():
    node = _minimal_section()
    node["extensions"] = {
        "x-formspec-ai-thinking": {},
        "x-acme-custom-data": {"foo": "bar"},
    }
    _validate_section(node)


def test_extensions_rejects_non_x_keys():
    """propertyNames.pattern: ^x- per common.schema.Extensions."""
    node = _minimal_section()
    node["extensions"] = {"not-x-prefixed": {}}
    with pytest.raises(ValidationError):
        _validate_section(node)


def test_extensions_accepts_empty_object():
    node = _minimal_section()
    node["extensions"] = {}
    _validate_section(node)


# ─── ComponentBase still enforces unevaluatedProperties on the variant ───────


def test_section_still_rejects_unknown_top_level_property():
    """unevaluatedProperties: false on the Section variant means random keys
    that don't appear in ComponentBase or Section are still rejected.
    Adding the `extensions` slot is additive, not a general-loosening."""
    node = _minimal_section()
    node["randomBogusKey"] = "should-fail"
    with pytest.raises(ValidationError):
        _validate_section(node)


def test_section_still_rejects_top_level_x_property():
    """The whole point of adding `extensions` is to give x-* a typed home;
    bare top-level x-foo should still fail under unevaluatedProperties: false."""
    node = _minimal_section()
    node["x-foo"] = "bar"
    with pytest.raises(ValidationError):
        _validate_section(node)


# ─── Regression: existing ComponentBase fields still work ────────────────────


def test_section_with_id_and_x_generation_still_works():
    """The pre-existing fields (id, x-generation, unitRef, taskRefs, conceptRefs)
    continue to validate alongside the new extensions slot."""
    node = _minimal_section()
    node["id"] = "applicant-section"
    node["x-generation"] = {
        "source": "unit:identity",
        "generatedBy": "studio-core/1.0.0",
        "anchors": ["unit:identity"],
    }
    node["unitRef"] = "identity"
    node["taskRefs"] = ["collectIdentity"]
    node["extensions"] = {"x-formspec-ai": {"reviewed": True}}
    _validate_section(node)


def test_section_without_extensions_validates():
    """extensions is OPTIONAL — existing Component documents that don't use
    the slot continue to validate identically."""
    node = _minimal_section()
    node["id"] = "applicant-section"
    _validate_section(node)

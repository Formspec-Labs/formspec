"""Access-Class Registry ↔ Definition `accessControl.class` conformance.

The registry (`access-class` entries in formspec-common.registry.json) is the
source; common.schema.json `AccessClass` mirrors its core tokens and registered prefixes
(extension-registry.md §3.2.3). These tests pin both directions and the drift.
"""
import copy
import json
import re
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

from tests.unit.support.helpers import (
    base_definition,
    minimal_display,
    minimal_field,
    minimal_group,
)
from tests.unit.support.schema_fixtures import build_schema_registry, load_schema

COMMON = load_schema("common.schema.json")
DEFINITION = load_schema("definition.schema.json")
REGISTRY_SCHEMA = load_schema("registry.schema.json")
REGISTRY_DOC = json.loads(
    (Path(__file__).resolve().parents[3] / "registries" / "formspec-common.registry.json")
    .read_text(encoding="utf-8")
)


def _validate_definition(doc):
    Draft202012Validator(
        DEFINITION, registry=build_schema_registry(COMMON, DEFINITION)
    ).validate(doc)


def _validate_registry_entry(entry):
    doc = copy.deepcopy(REGISTRY_DOC)
    doc["$formspecRegistry"] = "1.1"
    doc["entries"] = [entry]
    Draft202012Validator(
        REGISTRY_SCHEMA, registry=build_schema_registry(COMMON, REGISTRY_SCHEMA)
    ).validate(doc)


def _access_class_shapes():
    return [e["classShape"] for e in REGISTRY_DOC["entries"] if e["category"] == "access-class"]


def _field_with(access_control):
    return base_definition(items=[minimal_field(accessControl=access_control)])


class TestRegistryMirror:
    def test_schema_enum_and_pattern_rebuild_from_registry(self):
        shapes = _access_class_shapes()
        tokens = sorted(s["token"] for s in shapes if "token" in s)
        prefixes = sorted(s["prefix"] for s in shapes if "prefix" in s)
        assert tokens == ["protected", "unclassified"]
        assert prefixes == ["cui", "hipaa"]

        enum_branch, pattern_branch = COMMON["$defs"]["AccessClass"]["anyOf"]
        assert sorted(enum_branch["enum"]) == tokens
        alternation = re.match(r"^\^\(([^)]*)\)", pattern_branch["pattern"]).group(1)
        assert sorted(alternation.split("|")) == prefixes

    def test_registry_core_tokens_are_dot_free(self):
        for shape in _access_class_shapes():
            if "token" in shape:
                assert "." not in shape["token"]

    def test_common_registry_access_class_entries_validate(self):
        for entry in REGISTRY_DOC["entries"]:
            if entry["category"] == "access-class":
                _validate_registry_entry(entry)


class TestDefinitionAccessControl:
    @pytest.mark.parametrize("value", ["unclassified", "protected", "cui.privacy", "hipaa.phi", "cui.law-enforcement.sp"])
    def test_registry_and_prefixed_values_accepted(self, value):
        _validate_definition(_field_with({"class": value}))

    @pytest.mark.parametrize(
        "value",
        ["safe-address", "standard", "household-financial", "wos.reason", "cui", "cui.", "CUI.privacy", "protected.x", ""],
    )
    def test_unknown_values_and_unregistered_prefixes_refused(self, value):
        with pytest.raises(ValidationError):
            _validate_definition(_field_with({"class": value}))

    def test_group_may_declare_class(self):
        group = minimal_group(children=[minimal_field()], accessControl={"class": "protected"})
        _validate_definition(base_definition(items=[group]))

    def test_display_item_refuses_access_control(self):
        with pytest.raises(ValidationError):
            _validate_definition(base_definition(items=[minimal_display(accessControl={"class": "protected"})]))

    def test_subject_kind_is_closed(self):
        _validate_definition(_field_with({"class": "protected", "subjectKind": "employer"}))
        with pytest.raises(ValidationError):
            _validate_definition(_field_with({"class": "protected", "subjectKind": "household"}))

    def test_class_is_required_inside_access_control(self):
        with pytest.raises(ValidationError):
            _validate_definition(_field_with({"subjectKind": "address"}))


class TestRegistryClassShape:
    def _entry(self, **shape_and_overrides):
        entry = {
            "name": "x-acme-access-class-cui-privacy",
            "category": "access-class",
            "version": "1.0.0",
            "status": "stable",
            "description": "Deployment CUI privacy class.",
            "compatibility": {"formspecVersion": ">=1.0.0 <2.0.0"},
        }
        entry.update(shape_and_overrides)
        return entry

    def test_deployment_token_entry_valid(self):
        _validate_registry_entry(self._entry(classShape={"token": "cui.privacy", "maps": {"cui": ["PRVCY"]}}))

    def test_class_shape_required(self):
        with pytest.raises(ValidationError):
            _validate_registry_entry(self._entry())

    def test_token_and_prefix_are_exclusive(self):
        with pytest.raises(ValidationError):
            _validate_registry_entry(self._entry(classShape={"token": "cui.privacy", "prefix": "cui"}))

    def test_maps_are_closed(self):
        with pytest.raises(ValidationError):
            _validate_registry_entry(self._entry(classShape={"token": "cui.privacy", "maps": {"tlp": "AMBER"}}))

"""Access-Class Registry ↔ Definition `accessControl.class` conformance.

The registry (`access-class` entries in formspec-common.registry.json) is the
source; common.schema.json `AccessClass` mirrors its core tokens and registered
prefixes, and registry.schema.json `AccessClassShape.token` shares its segment
grammar (extension-registry.md §3.2.3). The JSON fixtures under
tests/conformance/fixtures/access-class/ are the portable cases; this module is
their Python runner and reference oracle (Core §4.2.1).
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

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "tests" / "conformance" / "fixtures" / "access-class"
COMMON = load_schema("common.schema.json")
DEFINITION = load_schema("definition.schema.json")
REGISTRY_SCHEMA = load_schema("registry.schema.json")
REGISTRY_DOC = json.loads((ROOT / "registries" / "formspec-common.registry.json").read_text("utf-8"))
CLASS_VALUES = json.loads((FIXTURES / "class-values.json").read_text("utf-8"))
EFFECTIVE = json.loads((FIXTURES / "effective-class.json").read_text("utf-8"))


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


def effective_classes(items, inherited="unclassified", prefix=""):
    """Reference oracle for Core §4.2.1: own class, else nearest Group's, else unclassified."""
    out = {}
    for item in items:
        if item["type"] == "display":
            continue
        path = f"{prefix}{item['key']}"
        cls = item.get("accessControl", {}).get("class", inherited)
        out[path] = cls
        out.update(effective_classes(item.get("children", []), cls, f"{path}."))
    return out


class TestRegistryMirror:
    def test_schema_enum_and_pattern_rebuild_from_registry(self):
        shapes = _access_class_shapes()
        tokens = sorted(s["token"] for s in shapes if "token" in s)
        prefixes = sorted(s["prefix"] for s in shapes if "prefix" in s)
        assert tokens == ["protected", "unclassified"]
        assert prefixes == ["cui", "hipaa"]

        enum_branch, pattern_branch = COMMON["$defs"]["AccessClass"]["anyOf"]
        assert sorted(enum_branch["enum"]) == tokens
        match = re.match(r"^\^\(([^)]*)\)", pattern_branch["pattern"])
        assert match, f"AccessClass pattern lost its prefix alternation: {pattern_branch['pattern']}"
        assert sorted(match.group(1).split("|")) == prefixes

    def test_token_segment_grammar_matches_registry_shape(self):
        """common AccessClass suffix segments and AccessClassShape.token share one grammar."""
        common = COMMON["$defs"]["AccessClass"]["anyOf"][1]["pattern"]
        match = re.fullmatch(r"\^\([^)]*\)\(\\\.(.+)\)\+\$", common)
        assert match, f"AccessClass prefixed-token pattern changed shape: {common}"
        segment = match.group(1)
        token = REGISTRY_SCHEMA["$defs"]["AccessClassShape"]["properties"]["token"]["pattern"]
        assert token == f"^{segment}(\\.{segment})*$"

    def test_registry_core_tokens_are_dot_free(self):
        for shape in _access_class_shapes():
            if "token" in shape:
                assert "." not in shape["token"]

    def test_common_registry_access_class_entries_validate(self):
        for entry in REGISTRY_DOC["entries"]:
            if entry["category"] == "access-class":
                _validate_registry_entry(entry)


class TestClassValuesFixture:
    @pytest.mark.parametrize("value", CLASS_VALUES["accepted"])
    def test_accepted(self, value):
        _validate_definition(_field_with({"class": value}))

    @pytest.mark.parametrize("value", CLASS_VALUES["refused"])
    def test_refused(self, value):
        with pytest.raises(ValidationError):
            _validate_definition(_field_with({"class": value}))


class TestEffectiveClassFixture:
    def test_fixture_definition_is_schema_valid(self):
        _validate_definition(EFFECTIVE["definition"])

    def test_effective_class_and_public_disclosure(self):
        actual = effective_classes(EFFECTIVE["definition"]["items"])
        expected = {row["path"]: row for row in EFFECTIVE["expected"]}
        assert actual == {path: row["effectiveClass"] for path, row in expected.items()}
        for path, row in expected.items():
            assert row["publicDisclosure"] is (actual[path] == "unclassified"), path


class TestDefinitionAccessControl:
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

    @pytest.mark.parametrize("value", ["unclassified", "cui.privacy"])
    def test_subject_kind_requires_protected(self, value):
        with pytest.raises(ValidationError):
            _validate_definition(_field_with({"class": value, "subjectKind": "address"}))

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

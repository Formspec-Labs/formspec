"""Conformance tests for registry.schema.json."""
import copy
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

from tests.unit.support.schema_fixtures import build_schema_registry, load_schema

COMMON_SCHEMA = load_schema("common.schema.json")
SCHEMA = load_schema("registry.schema.json")
SCHEMA_REGISTRY = build_schema_registry(COMMON_SCHEMA, SCHEMA)
REGISTRY_PATH = (
    Path(__file__).resolve().parents[3]
    / "registries"
    / "formspec-common.registry.json"
)


def _validate(instance):
    Draft202012Validator(SCHEMA, registry=SCHEMA_REGISTRY).validate(instance)


def _load_registry():
    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


def _find_entry(doc, *, category=None, status=None):
    for entry in doc["entries"]:
        if category is not None and entry.get("category") != category:
            continue
        if status is not None and entry.get("status") != status:
            continue
        return entry
    raise AssertionError(
        f"Could not find registry entry matching category={category!r} status={status!r}"
    )


# ---------------------------------------------------------------------------
# Reusable fixtures / helpers
# ---------------------------------------------------------------------------

def _minimal_registry(entries=None):
    """Return a minimal valid registry document."""
    return {
        "$formspecRegistry": "1.0",
        "publisher": {"name": "Acme Corp", "url": "https://acme.example.com"},
        "published": "2025-01-15T00:00:00Z",
        "entries": entries if entries is not None else [],
    }


def _minimal_entry(category="property", **overrides):
    """Return a minimal valid registry entry for the given *category*."""
    entry = {
        "name": "x-acme-widget",
        "category": category,
        "version": "1.0.0",
        "status": "draft",
        "description": "A test extension",
        "compatibility": {"formspecVersion": ">=1.0"},
    }
    # Conditional requirements per category
    if category == "dataType":
        entry["baseType"] = "string"
    elif category == "function":
        entry["parameters"] = [{"name": "input", "type": "string"}]
        entry["returns"] = "string"
    elif category == "constraint":
        entry["parameters"] = [{"name": "value", "type": "integer"}]
    entry.update(overrides)
    # Conditional requirement: deprecated status needs deprecationNotice
    if entry.get("status") == "deprecated" and "deprecationNotice" not in entry:
        entry["deprecationNotice"] = "This extension is deprecated."
    return entry


# ===================================================================
# TestRegistryMinimalValid
# ===================================================================
class TestRegistryMinimalValid:
    """A minimal valid registry document should pass validation."""

    def test_minimal_empty_entries(self):
        _validate(_minimal_registry())

    def test_registry_with_entries(self):
        entry = _minimal_entry("property")
        _validate(_minimal_registry(entries=[entry]))


# ===================================================================
# TestRegistryExtensions
# ===================================================================
class TestRegistryExtensions:

    def test_valid_x_prefixed_extension(self):
        doc = _minimal_registry()
        doc["extensions"] = {"x-custom": {"key": "value"}}
        _validate(doc)

    def test_non_x_prefixed_extension_fails(self):
        doc = _minimal_registry()
        doc["extensions"] = {"custom": {"key": "value"}}
        with pytest.raises(ValidationError):
            _validate(doc)


# ===================================================================
# TestEntryMinimalValid
# ===================================================================
class TestEntryMinimalValid:

    @pytest.mark.parametrize("category", [
        "dataType", "function", "constraint", "property",
    ])
    def test_minimal_entry(self, category):
        entry = _minimal_entry(category)
        _validate(_minimal_registry(entries=[entry]))


# ===================================================================
# TestEntryRequired
# ===================================================================
class TestEntryRequired:

    @pytest.mark.parametrize("field", [
        "name", "category", "version", "status", "description", "compatibility",
    ])
    def test_missing_required_field(self, field):
        entry = _minimal_entry("property")
        del entry[field]
        with pytest.raises(ValidationError):
            _validate(_minimal_registry(entries=[entry]))


# ===================================================================
# TestEntryName
# ===================================================================
class TestEntryName:

    @pytest.mark.parametrize("name", ["x-foo", "x-my-ext", "x-gov-grants-v2"])
    def test_valid_name(self, name):
        entry = _minimal_entry("property", name=name)
        _validate(_minimal_registry(entries=[entry]))

    @pytest.mark.parametrize("name", [
        "noprefix",       # no x- prefix
        "X-Upper",        # uppercase
        "x- spaces",      # spaces
        "x-trailing-",    # trailing hyphen
    ])
    def test_invalid_name(self, name):
        entry = _minimal_entry("property", name=name)
        with pytest.raises(ValidationError):
            _validate(_minimal_registry(entries=[entry]))


# ===================================================================
# TestEntryCategory
# ===================================================================
class TestEntryCategory:

    @pytest.mark.parametrize("category", [
        "dataType", "function", "constraint", "property",
    ])
    def test_valid_category(self, category):
        entry = _minimal_entry(category)
        _validate(_minimal_registry(entries=[entry]))

    def test_invalid_category(self):
        entry = _minimal_entry("property")
        entry["category"] = "invalid"
        with pytest.raises(ValidationError):
            _validate(_minimal_registry(entries=[entry]))


class TestWidgetShapeTokenSlots:

    def test_widget_shape_token_slots_are_valid_registry_evidence(self):
        entry = _minimal_entry(
            "widget",
            widgetShape={
                "props": {"type": "object"},
                "tokenSlots": [
                    {
                        "name": "accent",
                        "acceptedTokenCategories": ["color", "x-agency-color"],
                        "description": "Accent color slot",
                    }
                ],
            },
        )
        _validate(_minimal_registry(entries=[entry]))

    def test_widget_shape_token_slots_require_categories(self):
        entry = _minimal_entry(
            "widget",
            widgetShape={
                "tokenSlots": [
                    {
                        "name": "accent",
                        "acceptedTokenCategories": [],
                    }
                ],
            },
        )
        with pytest.raises(ValidationError):
            _validate(_minimal_registry(entries=[entry]))

    def test_widget_shape_token_slots_reject_unknown_slot_fields(self):
        entry = _minimal_entry(
            "widget",
            widgetShape={
                "tokenSlots": [
                    {
                        "name": "accent",
                        "acceptedTokenCategories": ["color"],
                        "semantics.themeTokenSlots": ["legacy"],
                    }
                ],
            },
        )
        with pytest.raises(ValidationError):
            _validate(_minimal_registry(entries=[entry]))


# ===================================================================
# TestEntryVersion
# ===================================================================
class TestEntryVersion:

    @pytest.mark.parametrize("ver", ["1.0.0", "0.1.0", "10.20.30"])
    def test_valid_semver(self, ver):
        entry = _minimal_entry("property", version=ver)
        _validate(_minimal_registry(entries=[entry]))

    @pytest.mark.parametrize("ver", ["1.0", "v1.0.0", "1"])
    def test_invalid_semver(self, ver):
        entry = _minimal_entry("property", version=ver)
        with pytest.raises(ValidationError):
            _validate(_minimal_registry(entries=[entry]))


# ===================================================================
# TestEntryStatus
# ===================================================================
class TestEntryStatus:

    @pytest.mark.parametrize("status", ["draft", "stable", "deprecated", "retired"])
    def test_valid_status(self, status):
        entry = _minimal_entry("property", status=status)
        _validate(_minimal_registry(entries=[entry]))

    def test_invalid_status(self):
        entry = _minimal_entry("property", status="unknown")
        with pytest.raises(ValidationError):
            _validate(_minimal_registry(entries=[entry]))


# ===================================================================
# TestEntryCompatibility
# ===================================================================
class TestEntryCompatibility:

    def test_valid_compatibility(self):
        entry = _minimal_entry("property",
                               compatibility={"formspecVersion": ">=1.0"})
        _validate(_minimal_registry(entries=[entry]))

    def test_missing_formspec_version(self):
        entry = _minimal_entry("property", compatibility={})
        with pytest.raises(ValidationError):
            _validate(_minimal_registry(entries=[entry]))

    def test_additional_properties_rejected(self):
        entry = _minimal_entry("property",
                               compatibility={
                                   "formspecVersion": ">=1.0",
                                   "extra": "nope",
                               })
        with pytest.raises(ValidationError):
            _validate(_minimal_registry(entries=[entry]))


# ===================================================================
# TestEntryCategoryConditionals
# ===================================================================
class TestEntryCategoryConditionals:
    """if/then conditionals based on category."""

    def test_datatype_requires_basetype(self):
        entry = _minimal_entry("dataType")
        del entry["baseType"]
        with pytest.raises(ValidationError):
            _validate(_minimal_registry(entries=[entry]))

    def test_function_requires_parameters(self):
        entry = _minimal_entry("function")
        del entry["parameters"]
        with pytest.raises(ValidationError):
            _validate(_minimal_registry(entries=[entry]))

    def test_function_requires_returns(self):
        entry = _minimal_entry("function")
        del entry["returns"]
        with pytest.raises(ValidationError):
            _validate(_minimal_registry(entries=[entry]))

    def test_constraint_requires_parameters(self):
        entry = _minimal_entry("constraint")
        del entry["parameters"]
        with pytest.raises(ValidationError):
            _validate(_minimal_registry(entries=[entry]))

    def test_property_no_extra_fields_required(self):
        entry = _minimal_entry("property")
        _validate(_minimal_registry(entries=[entry]))

    def test_module_requires_contributes(self):
        """ADR 0150 §4.1: module category replaces namespace; requires contributes[]."""
        entry = _minimal_entry("module")
        with pytest.raises(ValidationError):
            _validate(_minimal_registry(entries=[entry]))

    def test_module_with_contributes_validates(self):
        entry = _minimal_entry("module")
        entry["contributes"] = ["x-formspec-foo"]
        _validate(_minimal_registry(entries=[entry]))


# ===================================================================
# TestEntryBaseType
# ===================================================================
class TestEntryBaseType:

    @pytest.mark.parametrize("bt", [
        "string", "integer", "decimal", "boolean",
        "date", "dateTime", "time", "uri",
    ])
    def test_valid_basetype(self, bt):
        entry = _minimal_entry("dataType", baseType=bt)
        _validate(_minimal_registry(entries=[entry]))

    def test_invalid_basetype(self):
        entry = _minimal_entry("dataType", baseType="blob")
        with pytest.raises(ValidationError):
            _validate(_minimal_registry(entries=[entry]))


# ===================================================================
# TestEntryAdditionalProperties
# ===================================================================
class TestEntryAdditionalProperties:

    def test_unknown_entry_property_rejected(self):
        entry = _minimal_entry("property")
        entry["notAField"] = "bad"
        with pytest.raises(ValidationError):
            _validate(_minimal_registry(entries=[entry]))


# ===================================================================
# TestEntryLicense
# ===================================================================
class TestEntryLicense:
    """License field SPDX-like pattern."""

    @pytest.mark.parametrize("lic", ["MIT", "Apache-2.0", "GPL-3.0", "ISC"])
    def test_valid_spdx_ids(self, lic):
        entry = _minimal_entry("property", license=lic)
        _validate(_minimal_registry(entries=[entry]))

    @pytest.mark.parametrize("lic", ["-MIT", "MIT-", " MIT", ""])
    def test_invalid_license_patterns(self, lic):
        entry = _minimal_entry("property", license=lic)
        with pytest.raises(ValidationError):
            _validate(_minimal_registry(entries=[entry]))


# ===================================================================
# TestEntryDeprecationNotice
# ===================================================================
class TestEntryDeprecationNotice:
    """Deprecation conditional: deprecated status requires deprecationNotice."""

    def test_deprecated_with_notice(self):
        entry = _minimal_entry(
            "property",
            status="deprecated",
            deprecationNotice="Use x-acme-widget-v2 instead.",
        )
        _validate(_minimal_registry(entries=[entry]))

    def test_deprecated_without_notice_fails(self):
        entry = _minimal_entry("property", status="deprecated")
        del entry["deprecationNotice"]  # remove auto-added notice
        with pytest.raises(ValidationError):
            _validate(_minimal_registry(entries=[entry]))

    def test_stable_without_notice_valid(self):
        entry = _minimal_entry("property", status="stable")
        _validate(_minimal_registry(entries=[entry]))

    def test_draft_with_notice_valid(self):
        entry = _minimal_entry(
            "property",
            status="draft",
            deprecationNotice="Preemptive deprecation note.",
        )
        _validate(_minimal_registry(entries=[entry]))


# ===================================================================
# TestEntryUrls
# ===================================================================
class TestEntryUrls:
    """specUrl and schemaUrl on registry entries."""

    def test_entry_with_spec_url(self):
        entry = _minimal_entry(
            "property",
            specUrl="https://example.com/specs/x-acme-widget",
        )
        _validate(_minimal_registry(entries=[entry]))

    def test_entry_with_schema_url(self):
        entry = _minimal_entry(
            "property",
            schemaUrl="https://example.com/schemas/x-acme-widget.json",
        )
        _validate(_minimal_registry(entries=[entry]))


# ===================================================================
# TestRegistryConditionals
# ===================================================================
class TestRegistryConditionals:
    def test_registry_fixture_is_valid(self):
        _validate(_load_registry())

    @pytest.mark.parametrize(
        ("category", "status", "missing_field"),
        [
            ("dataType", None, "baseType"),
            ("function", None, "parameters"),
            ("function", None, "returns"),
            ("constraint", None, "parameters"),
        ],
    )
    def test_registry_missing_conditional_field_fails(
        self,
        category,
        status,
        missing_field,
    ):
        doc = _load_registry()
        entry = _find_entry(doc, category=category, status=status)
        entry.pop(missing_field, None)

        with pytest.raises(ValidationError) as exc_info:
            _validate(doc)
        assert missing_field in str(exc_info.value)

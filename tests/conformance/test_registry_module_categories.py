"""Conformance tests for ADR 0150 §4.1/§4.2 Registry rev: namespace→module
rename + six new contribution categories (unit-kind, widget, action-intent,
slot-type, validation-mapping-row, token-category).

Cross-module conflict (§4.6) is a cross-document check — out of schema scope;
covered by lint (E603 et al, Task 8).
"""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

SCHEMAS_DIR = Path(__file__).parents[2] / "schemas"
REGISTRY_SCHEMA = json.loads((SCHEMAS_DIR / "registry.schema.json").read_text())
COMMON_SCHEMA = json.loads((SCHEMAS_DIR / "common.schema.json").read_text())

# Build a referencing Registry so cross-schema $refs (e.g.
# https://formspec.org/schemas/common/1.0#/$defs/ModuleRef) resolve.
_REF_REGISTRY = Registry().with_resources(
    [
        (COMMON_SCHEMA["$id"], Resource.from_contents(COMMON_SCHEMA, default_specification=DRAFT202012)),
        (REGISTRY_SCHEMA["$id"], Resource.from_contents(REGISTRY_SCHEMA, default_specification=DRAFT202012)),
    ]
)


def _validate_entry(entry: dict) -> None:
    """Validate a single RegistryEntry, with cross-schema $refs resolved."""
    validator = Draft202012Validator(
        {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "$defs": REGISTRY_SCHEMA["$defs"],
            "$ref": "#/$defs/RegistryEntry",
        },
        registry=_REF_REGISTRY,
    )
    validator.validate(entry)


def _entry_validator():
    """Back-compat shim — returns a no-arg callable so we can keep the test
    bodies terse. Use _validate_entry directly for new tests."""
    raise RuntimeError("use _validate_entry(entry) instead")


def _common_fields(name: str, category: str) -> dict:
    return {
        "name": name,
        "category": category,
        "version": "1.0.0",
        "status": "stable",
        "description": f"Test entry for {category} category.",
        "compatibility": {"formspecVersion": ">=1.0.0 <2.0.0"},
        "license": "Apache-2.0",
    }


# ─── namespace category is RETIRED (greenfield rename, no alias) ─────────────


def test_namespace_category_now_rejected():
    """ADR §4.1: greenfield rename `namespace` → `module`. No alias."""
    entry = _common_fields("x-foo", "namespace")
    entry["members"] = ["x-foo-a"]
    with pytest.raises(ValidationError):
        _validate_entry(entry)


# ─── module category (replaces namespace) ────────────────────────────────────


def test_module_requires_contributes():
    entry = _common_fields("x-foo", "module")
    with pytest.raises(ValidationError):
        _validate_entry(entry)


def test_module_accepts_minimal_with_contributes():
    entry = _common_fields("x-foo", "module")
    entry["contributes"] = ["x-foo-widget-one"]
    _validate_entry(entry)


def test_module_accepts_dependencies():
    entry = _common_fields("x-foo", "module")
    entry["contributes"] = ["x-foo-widget-one"]
    entry["dependencies"] = [
        {"id": "x-formspec-core-task", "version": "^1.0.0"},
    ]
    _validate_entry(entry)


def test_module_rejects_bad_dependency_shape():
    entry = _common_fields("x-foo", "module")
    entry["contributes"] = ["x-foo-widget-one"]
    entry["dependencies"] = [{"id": "x-formspec-core-task"}]  # missing version
    with pytest.raises(ValidationError):
        _validate_entry(entry)


def test_members_field_retired():
    """`members` was the namespace-era aggregator. Renamed to `contributes`
    for modules. Schema MUST NOT accept top-level `members` on any entry."""
    entry = _common_fields("x-foo", "module")
    entry["contributes"] = ["x-foo-a"]
    entry["members"] = ["x-foo-b"]
    with pytest.raises(ValidationError):
        _validate_entry(entry)


# ─── unit-kind category (Experience.UnitKind) ────────────────────────────────


def test_unit_kind_requires_semantics():
    entry = _common_fields("x-formspec-presentation-gallery", "unit-kind")
    with pytest.raises(ValidationError):
        _validate_entry(entry)


def test_unit_kind_accepts_with_semantics():
    entry = _common_fields("x-formspec-presentation-gallery", "unit-kind")
    entry["semantics"] = {
        "processorObligation": "render-as-gallery",
        "rendererObligation": "media-grid",
    }
    _validate_entry(entry)


# ─── widget category (Component widget catalog) ──────────────────────────────


def test_widget_requires_widgetshape():
    entry = _common_fields("x-formspec-conversation-chat-thread", "widget")
    with pytest.raises(ValidationError):
        _validate_entry(entry)


def test_widget_accepts_with_widgetshape():
    entry = _common_fields("x-formspec-conversation-chat-thread", "widget")
    entry["widgetShape"] = {
        "props": {
            "type": "object",
            "properties": {"messages": {"type": "array"}},
        },
        "childrenPolicy": "no-children",
        "fallback": "Stack",
    }
    _validate_entry(entry)


# ─── action-intent category (Response Actions ActionIntent) ──────────────────


def test_action_intent_requires_validation():
    entry = _common_fields("x-formspec-payments-charge-card", "action-intent")
    with pytest.raises(ValidationError):
        _validate_entry(entry)


def test_action_intent_accepts_with_validation():
    entry = _common_fields("x-formspec-payments-charge-card", "action-intent")
    entry["validation"] = {
        "blocking": True,
        "sourceCanonical": ["error"],
        "actionEffectIfBlocked": "abort",
    }
    _validate_entry(entry)


# ─── slot-type category (Surface slot.type) ──────────────────────────────────


def test_slot_type_requires_slotshape():
    entry = _common_fields("x-formspec-surface-modal", "slot-type")
    with pytest.raises(ValidationError):
        _validate_entry(entry)


def test_slot_type_accepts_with_slotshape():
    entry = _common_fields("x-formspec-surface-modal", "slot-type")
    entry["slotShape"] = {
        "binds": "embed-route",
        "compositionRule": "one-route-per-slot",
    }
    _validate_entry(entry)


# ─── validation-mapping-row category (VM MasterTable rows) ───────────────────


def test_validation_mapping_row_requires_row():
    entry = _common_fields("x-formspec-core-actions-row-blocking", "validation-mapping-row")
    with pytest.raises(ValidationError):
        _validate_entry(entry)


def test_validation_mapping_row_accepts_with_row():
    entry = _common_fields("x-formspec-core-actions-row-blocking", "validation-mapping-row")
    entry["row"] = {
        "blocking": True,
        "sourceCanonical": ["error"],
        "targetSeverity": "error",
        "actionEffectIfBlocked": "abort",
    }
    _validate_entry(entry)


# ─── token-category category (Token Registry categories) ─────────────────────


def test_token_category_requires_categoryshape():
    entry = _common_fields("x-formspec-tokens-color", "token-category")
    with pytest.raises(ValidationError):
        _validate_entry(entry)


def test_token_category_accepts_with_categoryshape():
    entry = _common_fields("x-formspec-tokens-color", "token-category")
    entry["categoryShape"] = {
        "type": "object",
        "properties": {
            "name": {"type": "string"},
            "value": {"type": "string"},
        },
    }
    _validate_entry(entry)


# ─── Regression: existing categories still work ──────────────────────────────


def test_datatype_still_works():
    """Pre-existing dataType category continues to validate."""
    entry = _common_fields("x-acme-currency", "dataType")
    entry["baseType"] = "decimal"
    _validate_entry(entry)


def test_concept_still_works():
    """Pre-existing concept category continues to validate."""
    entry = _common_fields("x-vocab-icd10", "concept")
    entry["conceptUri"] = "https://example.org/icd10/A00"
    _validate_entry(entry)


def test_function_still_works():
    """Pre-existing function category continues to validate."""
    entry = _common_fields("x-acme-fiscal-year", "function")
    entry["parameters"] = [
        {"name": "date", "type": "date", "description": "input"}
    ]
    entry["returns"] = "integer"
    _validate_entry(entry)

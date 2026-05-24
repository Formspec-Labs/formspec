"""ADR 0150 §14 P2 Task 2.2 — x-formspec-presentation module v0.1 conformance.

Closes wireframe-generator spike gaps F1-F8: non-form unit kinds (gallery,
dashboard, viewer, chat-shell) + presentation widgets (Shell, Sidebar,
Breadcrumb, RouteList, Chip).
"""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

ROOT = Path(__file__).parents[3]
SCHEMAS_DIR = ROOT / "schemas"
REGISTRIES_DIR = ROOT / "registries"

REGISTRY_SCHEMA = json.loads((SCHEMAS_DIR / "registry.schema.json").read_text())
COMMON_SCHEMA = json.loads((SCHEMAS_DIR / "common.schema.json").read_text())

MODULE_ID = "x-formspec-presentation"

UNIT_KINDS = ("gallery", "dashboard", "viewer", "chat-shell")
WIDGETS = ("Shell", "Sidebar", "Breadcrumb", "RouteList", "Chip")

_REF_REGISTRY = Registry().with_resources(
    [
        (COMMON_SCHEMA["$id"], Resource.from_contents(COMMON_SCHEMA, default_specification=DRAFT202012)),
        (REGISTRY_SCHEMA["$id"], Resource.from_contents(REGISTRY_SCHEMA, default_specification=DRAFT202012)),
    ]
)


def _entry_validator():
    return Draft202012Validator(
        {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "$defs": REGISTRY_SCHEMA["$defs"],
            "$ref": "#/$defs/RegistryEntry",
        },
        registry=_REF_REGISTRY,
    )


def _common_registry_doc() -> dict:
    return json.loads((REGISTRIES_DIR / "formspec-common.registry.json").read_text())


def _get_entry(doc: dict, name: str) -> dict | None:
    for e in doc.get("entries", []):
        if e.get("name") == name:
            return e
    return None


def test_module_entry_validates():
    doc = _common_registry_doc()
    entry = _get_entry(doc, MODULE_ID)
    assert entry is not None
    assert entry["category"] == "module"
    _entry_validator().validate(entry)


def test_module_dependencies_resolve_to_p1_modules():
    doc = _common_registry_doc()
    entry = _get_entry(doc, MODULE_ID)
    dep_ids = {d["id"] for d in entry.get("dependencies", [])}
    assert dep_ids == {"x-formspec-core-task", "x-formspec-core-component"}


def test_module_contributes_cardinality():
    doc = _common_registry_doc()
    entry = _get_entry(doc, MODULE_ID)
    assert len(entry["contributes"]) == len(UNIT_KINDS) + len(WIDGETS)


@pytest.mark.parametrize("kind", UNIT_KINDS)
def test_unit_kind_contribution(kind):
    doc = _common_registry_doc()
    entry = _get_entry(doc, f"{MODULE_ID}-kind-{kind}")
    assert entry is not None
    assert entry["category"] == "unit-kind"
    assert entry["semantics"]["kindValue"] == kind
    _entry_validator().validate(entry)


@pytest.mark.parametrize("widget", WIDGETS)
def test_widget_contribution(widget):
    doc = _common_registry_doc()
    entry = _get_entry(doc, f"{MODULE_ID}-widget-{widget.lower()}")
    assert entry is not None
    assert entry["category"] == "widget"
    assert entry["widgetShape"]["widgetName"] == widget
    _entry_validator().validate(entry)

"""ADR 0150 §14 P2 Task 2.3 — x-formspec-conversation module v0.1 conformance.

Chat/conversation primitives: chat-thread unit-kind + ChatThread / MessageList /
MessageComposer widgets.
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

MODULE_ID = "x-formspec-conversation"
WIDGETS = ("ChatThread", "MessageList", "MessageComposer")

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
    _entry_validator().validate(entry)


def test_chat_thread_unit_kind_contribution():
    doc = _common_registry_doc()
    entry = _get_entry(doc, f"{MODULE_ID}-kind-chat-thread")
    assert entry is not None
    assert entry["category"] == "unit-kind"
    assert entry["semantics"]["kindValue"] == "chat-thread"
    _entry_validator().validate(entry)


@pytest.mark.parametrize("widget", WIDGETS)
def test_widget_contribution(widget):
    doc = _common_registry_doc()
    entry = _get_entry(doc, f"{MODULE_ID}-widget-{widget.lower()}")
    assert entry is not None
    assert entry["category"] == "widget"
    assert entry["widgetShape"]["widgetName"] == widget
    _entry_validator().validate(entry)


def test_module_cardinality():
    doc = _common_registry_doc()
    entry = _get_entry(doc, MODULE_ID)
    assert len(entry["contributes"]) == 1 + len(WIDGETS)

"""ADR 0150 §14 P1 Task 1.4 — x-formspec-core-trace module conformance.

Republishes Trace closed-core enum values as Registry `property` contributions
per ADR §4.9. Three enum sites:
- SourceEntry.kind closed-core: 5 values (definition, experience,
  responseActions, component, ontology).
- EdgeEntry.kind closed-core: 11 values.
- TypedEndpoint closed-core prefixes: 9 prefixes (item, unit, task, actor,
  action, concept, effect, precondition, componentNodePath).

Total: 25 contribution entries. Bucket-naming pinned per plan Task 1.4:
- x-formspec-core-trace-source-kind-<value>
- x-formspec-core-trace-edge-kind-<value>
- x-formspec-core-trace-endpoint-prefix-<value>

`property` category requires no payload (per registry.schema.json §category
allOf gates). Each entry carries Registry-required fields plus a
description tying the value to its closed-core enum site.

Closed-core lists verified at plan-r1 probe time against:
- schemas/trace-index.schema.json:73-74 (SourceEntry.kind)
- schemas/trace-index.schema.json:163-175 (EdgeEntry.kind)
- schemas/trace-index.schema.json:144-148 (TypedEndpoint regex, 9 prefixes)
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

CLOSED_CORE_SOURCE_KINDS = (
    "definition", "experience", "responseActions", "component", "ontology",
)
CLOSED_CORE_EDGE_KINDS = (
    "component-renders-item", "unit-collects-item", "trigger-invokes-action",
    "item-depends-on-item", "unit-serves-task", "task-involves-actor",
    "action-emits-effect", "action-has-precondition", "concept-refs-item",
    "concept-refs-component-node", "node-visibility-references-item",
)
CLOSED_CORE_ENDPOINT_PREFIXES = (
    "item", "unit", "task", "actor", "action", "concept", "effect",
    "precondition", "componentNodePath",
)

MODULE_ID = "x-formspec-core-trace"


def _name_segment(bucket: str, value: str) -> str:
    """Convert dotted/camelCase closed-core values to Registry-name-safe segments.
    TypedEndpoint prefix `componentNodePath` is camelCase → kebab-cased here."""
    # camelCase → kebab-case (componentNodePath → component-node-path)
    out = []
    for ch in value:
        if ch.isupper():
            out.append("-")
            out.append(ch.lower())
        else:
            out.append(ch)
    return "".join(out).lstrip("-")


def _entry_name(bucket: str, value: str) -> str:
    return f"{MODULE_ID}-{bucket}-{_name_segment(bucket, value)}"


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


# ─── Module entry ────────────────────────────────────────────────────────────


def test_module_entry_validates():
    doc = _common_registry_doc()
    entry = _get_entry(doc, MODULE_ID)
    assert entry is not None
    assert entry["category"] == "module"
    _entry_validator().validate(entry)


def test_module_contributes_has_twenty_five_entries():
    doc = _common_registry_doc()
    entry = _get_entry(doc, MODULE_ID)
    assert len(entry["contributes"]) == 25, (
        f"Expected 25 trace contributions (5 source-kind + 11 edge-kind + 9 endpoint-prefix), "
        f"got {len(entry['contributes'])}"
    )


def test_module_contributes_split_correctly_across_buckets():
    doc = _common_registry_doc()
    entry = _get_entry(doc, MODULE_ID)
    expected = (
        {_entry_name("source-kind", v) for v in CLOSED_CORE_SOURCE_KINDS}
        | {_entry_name("edge-kind", v) for v in CLOSED_CORE_EDGE_KINDS}
        | {_entry_name("endpoint-prefix", v) for v in CLOSED_CORE_ENDPOINT_PREFIXES}
    )
    assert set(entry["contributes"]) == expected


# ─── Per-bucket contribution validation ──────────────────────────────────────


@pytest.mark.parametrize("value", CLOSED_CORE_SOURCE_KINDS)
def test_source_kind_contribution(value):
    doc = _common_registry_doc()
    entry = _get_entry(doc, _entry_name("source-kind", value))
    assert entry is not None
    assert entry["category"] == "property"
    _entry_validator().validate(entry)


@pytest.mark.parametrize("value", CLOSED_CORE_EDGE_KINDS)
def test_edge_kind_contribution(value):
    doc = _common_registry_doc()
    entry = _get_entry(doc, _entry_name("edge-kind", value))
    assert entry is not None
    assert entry["category"] == "property"
    _entry_validator().validate(entry)


@pytest.mark.parametrize("value", CLOSED_CORE_ENDPOINT_PREFIXES)
def test_endpoint_prefix_contribution(value):
    doc = _common_registry_doc()
    entry = _get_entry(doc, _entry_name("endpoint-prefix", value))
    assert entry is not None
    assert entry["category"] == "property"
    _entry_validator().validate(entry)


def test_contributes_names_all_resolve_within_document():
    doc = _common_registry_doc()
    entry = _get_entry(doc, MODULE_ID)
    sibling_names = {e["name"] for e in doc["entries"]}
    for name in entry["contributes"]:
        assert name in sibling_names

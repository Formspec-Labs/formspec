"""ADR 0150 §14 P1 Task 1.5 — x-formspec-core-ledger module conformance.

Republishes Respondent-Ledger closed-core enum values as Registry `property`
contributions per ADR §4.9. Two enum sites:
- EventType closed-core: 27 values at execution-time re-probe (plan r1
  cited 20 floor; actual at probe = 27 — 7 newer values added between r1
  and execution: response.migrated, response.correction-recorded,
  field.edit-recorded, action.invoked, action.failed, action.deferred,
  action.replayed). EXCLUDED from this republishing: the ^x- and
  ^(ai|user)\\. lanes — P4 ships those.
- ChangeSetEntry.valueClass closed-core: 7 values (user-input, prepopulated,
  calculated, imported, attachment, system-derived, migration-derived).

Total: 27 + 7 = 34 contribution entries.

**Naming-translation (specs/registry/extension-registry.md §4.1 Rule 1):**
EventType closed-core values use `.` separators (e.g. `session.started`).
The Registry name regex forbids `.`, so the names translate dots to hyphens:
`x-formspec-core-ledger-event-type-session-started`. The contribution
payload's `description` carries the original dotted value verbatim so AI
tooling can resolve `eventType: 'session.started'` to this entry. valueClass
values are already hyphen-clean (`user-input`).

Bucket-naming pinned per plan Task 1.5:
- x-formspec-core-ledger-event-type-<value-with-dots-as-hyphens>
- x-formspec-core-ledger-value-class-<value>

`property` category requires no payload (matches Task 1.4 posture).
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
LEDGER_SCHEMA = json.loads((SCHEMAS_DIR / "respondent-ledger-event.schema.json").read_text())
REGISTRY_SCHEMA = json.loads((SCHEMAS_DIR / "registry.schema.json").read_text())
COMMON_SCHEMA = json.loads((SCHEMAS_DIR / "common.schema.json").read_text())

# Live re-probe at module-load (plan Task 1.5 Step 1) — catches schema drift
# between r1-write and execution.
CLOSED_CORE_EVENT_TYPES = tuple(LEDGER_SCHEMA["$defs"]["EventType"]["oneOf"][0]["enum"])
CLOSED_CORE_VALUE_CLASSES = tuple(LEDGER_SCHEMA["$defs"]["ChangeSetEntry"]["properties"]["valueClass"]["oneOf"][0]["enum"])

MODULE_ID = "x-formspec-core-ledger"


def _dots_to_hyphens(value: str) -> str:
    return value.replace(".", "-")


def _entry_name(bucket: str, value: str) -> str:
    return f"{MODULE_ID}-{bucket}-{_dots_to_hyphens(value)}"


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


def test_module_cardinality_matches_schema():
    """Cardinality MUST equal the schema's closed-core enum sizes at
    execution time (catches drift between r1 plan and the live schema)."""
    doc = _common_registry_doc()
    entry = _get_entry(doc, MODULE_ID)
    expected = len(CLOSED_CORE_EVENT_TYPES) + len(CLOSED_CORE_VALUE_CLASSES)
    assert len(entry["contributes"]) == expected, (
        f"Cardinality drift: schema has {len(CLOSED_CORE_EVENT_TYPES)} EventType "
        f"+ {len(CLOSED_CORE_VALUE_CLASSES)} valueClass = {expected} total; "
        f"Registry contributes[] has {len(entry['contributes'])}"
    )


def test_module_contributes_split_correctly_across_buckets():
    doc = _common_registry_doc()
    entry = _get_entry(doc, MODULE_ID)
    expected = (
        {_entry_name("event-type", v) for v in CLOSED_CORE_EVENT_TYPES}
        | {_entry_name("value-class", v) for v in CLOSED_CORE_VALUE_CLASSES}
    )
    assert set(entry["contributes"]) == expected


# ─── Per-bucket contribution validation ──────────────────────────────────────


@pytest.mark.parametrize("event_type", CLOSED_CORE_EVENT_TYPES)
def test_event_type_contribution(event_type):
    doc = _common_registry_doc()
    entry = _get_entry(doc, _entry_name("event-type", event_type))
    assert entry is not None, f"missing {_entry_name('event-type', event_type)}"
    assert entry["category"] == "property"
    _entry_validator().validate(entry)


@pytest.mark.parametrize("value_class", CLOSED_CORE_VALUE_CLASSES)
def test_value_class_contribution(value_class):
    doc = _common_registry_doc()
    entry = _get_entry(doc, _entry_name("value-class", value_class))
    assert entry is not None
    assert entry["category"] == "property"
    _entry_validator().validate(entry)


# ─── Dotted-translation invariant (per spec §4.1 Rule 1 + plan Task 1.5) ─────


@pytest.mark.parametrize("event_type", CLOSED_CORE_EVENT_TYPES)
def test_event_type_dotted_value_preserved_in_description(event_type):
    """The original dotted closed-core value MUST appear verbatim in the
    contribution entry's description so AI tooling can resolve
    `eventType: 'session.started'` to `x-formspec-core-ledger-event-type-session-started`."""
    doc = _common_registry_doc()
    entry = _get_entry(doc, _entry_name("event-type", event_type))
    assert event_type in entry["description"], (
        f"Original dotted value {event_type!r} missing from "
        f"{_entry_name('event-type', event_type)}.description"
    )


def test_contributes_names_all_resolve_within_document():
    doc = _common_registry_doc()
    entry = _get_entry(doc, MODULE_ID)
    sibling_names = {e["name"] for e in doc["entries"]}
    for name in entry["contributes"]:
        assert name in sibling_names

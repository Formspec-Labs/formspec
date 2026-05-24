"""ADR 0150 §14 P4 Task 4.1 — x-formspec-ai-runtime module + command family conformance.

Republishes the 9 baseline `ai.*` event values per ADR §8 across 3 families
(command, suggestion, proposal). This test covers the module entry + the
3-event command family; suggestion + proposal families ship in follow-on
P4 commits per the one-family-per-commit cadence.

The 9 events flow through respondent-ledger-event.schema.json's EventType
`^(ai|user)\\.` lane (P0 Task 6 Deviation log). Per spec §4.1 enforcement-
boundary rule, schema validation flows through the lane directly; the
Registry contributions are descriptive metadata consumed by posture
admission, AI tooling, and audit consumers.

Per spec §4.1 Rule 1 dotted-translation: Registry name translates `.` → `-`
(`ai.command-issued` → `x-formspec-ai-runtime-ai-command-issued`); the
original dotted value is preserved verbatim in extensions['x-formspec-kind-value'].
"""

import json
import re
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
LEDGER_EVENT_SCHEMA = json.loads((SCHEMAS_DIR / "respondent-ledger-event.schema.json").read_text())

MODULE_ID = "x-formspec-ai-runtime"
COMMAND_EVENTS = ("ai.command-issued", "ai.command-completed", "ai.command-failed")
SUGGESTION_EVENTS = ("ai.suggestion-offered", "ai.suggestion-accepted", "ai.suggestion-rejected")

# The EventType third lane MUST admit ai.* values.
EVENTTYPE_AI_USER_LANE_PATTERN = None
for branch in LEDGER_EVENT_SCHEMA["$defs"]["EventType"]["oneOf"]:
    pat = branch.get("pattern", "")
    if "ai" in pat and "user" in pat:
        EVENTTYPE_AI_USER_LANE_PATTERN = pat
        break


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


def test_module_dependencies_resolve():
    doc = _common_registry_doc()
    entry = _get_entry(doc, MODULE_ID)
    dep_ids = {d["id"] for d in entry.get("dependencies", [])}
    assert dep_ids == {"x-formspec-core-ledger", "x-formspec-core-actions"}, (
        "x-formspec-ai-runtime MUST depend on core-ledger (EventType lane source) "
        "and core-actions (intent values resolve there)"
    )


def test_command_family_cardinality_matches_baseline():
    """Per ADR §8: command family ships exactly 3 events."""
    doc = _common_registry_doc()
    entry = _get_entry(doc, MODULE_ID)
    command_contributions = [
        c for c in entry["contributes"] if c.startswith(f"{MODULE_ID}-ai-command-")
    ]
    assert len(command_contributions) == 3


@pytest.mark.parametrize("event", COMMAND_EVENTS)
def test_command_event_contribution_validates(event):
    doc = _common_registry_doc()
    name = f"{MODULE_ID}-{event.replace('.', '-')}"
    entry = _get_entry(doc, name)
    assert entry is not None, f"missing {name}"
    assert entry["category"] == "property"
    _entry_validator().validate(entry)


@pytest.mark.parametrize("event", COMMAND_EVENTS)
def test_command_event_carries_dotted_kind_value(event):
    """Per spec §4.1 Rule 1: original dotted value MUST appear in
    extensions['x-formspec-kind-value'] (the property-contribution
    machine-readable carrier added at P1 boundary remediation)."""
    doc = _common_registry_doc()
    name = f"{MODULE_ID}-{event.replace('.', '-')}"
    entry = _get_entry(doc, name)
    ext = entry.get("extensions", {})
    assert ext.get("x-formspec-kind-value") == event


@pytest.mark.parametrize("event", COMMAND_EVENTS)
def test_command_event_value_matches_ai_lane_pattern(event):
    """The 9 baseline events MUST match the EventType `^(ai|user)\\.` lane —
    NOT in the closed-core enum and NOT in the ^x- extension lane. They
    flow through their own dedicated authoring-namespace lane (P0 Task 6
    Deviation)."""
    assert EVENTTYPE_AI_USER_LANE_PATTERN is not None, "EventType ^(ai|user)\\. lane missing from schema"
    assert re.match(EVENTTYPE_AI_USER_LANE_PATTERN, event), (
        f"Event {event!r} does not match the EventType ^(ai|user)\\. lane pattern "
        f"{EVENTTYPE_AI_USER_LANE_PATTERN!r}"
    )


def test_contributes_names_all_resolve_within_document():
    doc = _common_registry_doc()
    entry = _get_entry(doc, MODULE_ID)
    sibling_names = {e["name"] for e in doc["entries"]}
    for name in entry["contributes"]:
        assert name in sibling_names


# ── Suggestion family (Task 4.2) ─────────────────────────────────────


def test_suggestion_family_cardinality_matches_baseline():
    """Per ADR §8: suggestion family ships exactly 3 events."""
    doc = _common_registry_doc()
    entry = _get_entry(doc, MODULE_ID)
    suggestion_contributions = [
        c for c in entry["contributes"] if c.startswith(f"{MODULE_ID}-ai-suggestion-")
    ]
    assert len(suggestion_contributions) == 3


@pytest.mark.parametrize("event", SUGGESTION_EVENTS)
def test_suggestion_event_contribution_validates(event):
    doc = _common_registry_doc()
    name = f"{MODULE_ID}-{event.replace('.', '-')}"
    entry = _get_entry(doc, name)
    assert entry is not None, f"missing {name}"
    assert entry["category"] == "property"
    _entry_validator().validate(entry)


@pytest.mark.parametrize("event", SUGGESTION_EVENTS)
def test_suggestion_event_carries_dotted_kind_value(event):
    doc = _common_registry_doc()
    name = f"{MODULE_ID}-{event.replace('.', '-')}"
    entry = _get_entry(doc, name)
    ext = entry.get("extensions", {})
    assert ext.get("x-formspec-kind-value") == event


@pytest.mark.parametrize("event", SUGGESTION_EVENTS)
def test_suggestion_event_value_matches_ai_lane_pattern(event):
    assert EVENTTYPE_AI_USER_LANE_PATTERN is not None
    assert re.match(EVENTTYPE_AI_USER_LANE_PATTERN, event), (
        f"Event {event!r} does not match the EventType ^(ai|user)\\. lane pattern"
    )

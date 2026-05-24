"""Conformance tests for optional Respondent Ledger action.* events."""

from copy import deepcopy
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

from tests.unit.support.schema_fixtures import ROOT_DIR, build_schema_registry, load_schema


EVENT_SCHEMA = load_schema("respondent-ledger-event.schema.json")
VALIDATION_RESULT_SCHEMA = load_schema("validation-result.schema.json")
_REGISTRY = build_schema_registry(EVENT_SCHEMA, VALIDATION_RESULT_SCHEMA)
_VALIDATOR = Draft202012Validator(EVENT_SCHEMA, registry=_REGISTRY)
_FIXTURE_DIR = ROOT_DIR / "tests/conformance/fixtures/respondent-ledger/action-events"


def _load_fixture(name: str) -> dict:
    with open(_FIXTURE_DIR / name) as f:
        return json.load(f)


@pytest.mark.parametrize(
    ("fixture_name", "event_type"),
    [
        ("action-invoked.json", "action.invoked"),
        ("action-failed.json", "action.failed"),
        ("action-deferred.json", "action.deferred"),
        ("action-replayed.json", "action.replayed"),
    ],
)
def test_action_event_fixtures_are_schema_valid(fixture_name: str, event_type: str):
    event = _load_fixture(fixture_name)

    _VALIDATOR.validate(event)

    assert event["eventType"] == event_type
    assert set(event["actionEvent"]) >= {"actionId", "invocationId"}


def test_action_event_kinds_are_published_in_event_type_enum():
    # EventType is `oneOf [closed-core enum, x-pattern]` per ADR 0150 §4.5;
    # the closed-core branch carries the canonical event-type set.
    event_type_def = EVENT_SCHEMA["$defs"]["EventType"]
    closed_branch = next(b for b in event_type_def["oneOf"] if "enum" in b)
    event_types = set(closed_branch["enum"])

    assert {
        "action.invoked",
        "action.failed",
        "action.deferred",
        "action.replayed",
    } <= event_types


@pytest.mark.parametrize("fixture_path", sorted(_FIXTURE_DIR.glob("*.json")))
def test_action_events_require_action_event_payload(fixture_path: Path):
    event = json.loads(fixture_path.read_text())
    event.pop("actionEvent")

    with pytest.raises(ValidationError):
        _VALIDATOR.validate(event)


@pytest.mark.parametrize("fixture_path", sorted(_FIXTURE_DIR.glob("*.json")))
def test_action_events_do_not_carry_material_changes_or_validation_snapshot(fixture_path: Path):
    base_event = json.loads(fixture_path.read_text())

    with_changes = deepcopy(base_event)
    with_changes["changes"] = [
        {
            "op": "set",
            "path": "status",
            "valueClass": "system-derived",
            "after": "completed",
        }
    ]
    with pytest.raises(ValidationError):
        _VALIDATOR.validate(with_changes)

    with_validation = deepcopy(base_event)
    with_validation["validationSnapshot"] = {"errors": 0, "warnings": 0, "infos": 0}
    with pytest.raises(ValidationError):
        _VALIDATOR.validate(with_validation)


def test_action_invoked_carries_no_terminal():
    event = _load_fixture("action-invoked.json")
    event["actionEvent"]["terminal"] = "failed"

    with pytest.raises(ValidationError):
        _VALIDATOR.validate(event)


@pytest.mark.parametrize(
    ("fixture_name", "required_field"),
    [
        ("action-failed.json", "causeRef"),
        ("action-deferred.json", "replayTokenRef"),
        ("action-replayed.json", "priorInvocationRef"),
    ],
)
def test_terminal_action_events_require_their_lineage_field(
    fixture_name: str, required_field: str
):
    event = _load_fixture(fixture_name)
    event["actionEvent"].pop(required_field)

    with pytest.raises(ValidationError):
        _VALIDATOR.validate(event)


@pytest.mark.parametrize(
    ("fixture_name", "terminal"),
    [
        ("action-failed.json", "failed"),
        ("action-deferred.json", "deferred"),
        ("action-replayed.json", "replayed"),
    ],
)
def test_terminal_action_events_pin_the_matching_terminal(
    fixture_name: str, terminal: str
):
    event = _load_fixture(fixture_name)

    assert event["actionEvent"]["terminal"] == terminal

    event["actionEvent"]["terminal"] = "failed" if terminal != "failed" else "deferred"
    with pytest.raises(ValidationError):
        _VALIDATOR.validate(event)


def test_action_replayed_supports_both_self_and_distinct_lineage():
    """`action-replayed.json` reuses `invocationId` as `priorInvocationRef`
    (the same invocation re-emitted after a host-side retry handshake), which
    is a permitted but limited lineage pattern. The sibling
    `action-replayed-distinct-lineage.json` exercises the more general case:
    a NEW invocationId whose `priorInvocationRef` points back at the original
    invocation. Both shapes MUST be schema-valid.
    """
    self_lineage = _load_fixture("action-replayed.json")
    distinct_lineage = _load_fixture("action-replayed-distinct-lineage.json")

    _VALIDATOR.validate(self_lineage)
    _VALIDATOR.validate(distinct_lineage)

    # Self-lineage: invocationId == priorInvocationRef.
    assert (
        self_lineage["actionEvent"]["invocationId"]
        == self_lineage["actionEvent"]["priorInvocationRef"]
    )
    # Distinct-lineage: invocationId != priorInvocationRef, and the prior
    # ref points back at the self-lineage fixture's invocationId so the
    # replay chain is traceable across both fixtures.
    assert (
        distinct_lineage["actionEvent"]["invocationId"]
        != distinct_lineage["actionEvent"]["priorInvocationRef"]
    )
    assert (
        distinct_lineage["actionEvent"]["priorInvocationRef"]
        == self_lineage["actionEvent"]["invocationId"]
    )

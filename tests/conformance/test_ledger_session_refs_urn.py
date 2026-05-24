"""Conformance tests for ADR 0150 §5.5: respondent-ledger `sessionRefs[]`
URN formalization.

Pre-change: `sessionRefs[]` items were `{ type: 'string', minLength: 1 }` —
implementation-specific free-form identifiers.

Post-change: items tighten to `{ type: 'string', pattern: '^urn:formspec:session:.+' }`.
Each URN resolves against the App Manifest's `sessions: SessionRef[]` index
(Task 7 adds the cross-ref target; Task 6 enforces the URN shape).
"""

from copy import deepcopy

import pytest
from jsonschema import Draft202012Validator, ValidationError

from tests.unit.support.schema_fixtures import (
    build_schema_registry,
    load_schema,
)

LEDGER_SCHEMA = load_schema("respondent-ledger.schema.json")
EVENT_SCHEMA = load_schema("respondent-ledger-event.schema.json")
VALIDATION_RESULT_SCHEMA = load_schema("validation-result.schema.json")
COMMON_SCHEMA = load_schema("common.schema.json")

_REGISTRY = build_schema_registry(
    LEDGER_SCHEMA, EVENT_SCHEMA, VALIDATION_RESULT_SCHEMA, COMMON_SCHEMA
)


def _validate(ledger: dict) -> None:
    Draft202012Validator(LEDGER_SCHEMA, registry=_REGISTRY).validate(ledger)


def _minimal_ledger() -> dict:
    return {
        "$formspecRespondentLedger": "0.1",
        "ledgerId": "led-test",
        "responseId": "resp-test",
        "definitionUrl": "https://example.test/def",
        "definitionVersion": "1.0.0",
        "status": "in-progress",
        "createdAt": "2026-05-23T00:00:00Z",
        "lastEventAt": "2026-05-23T00:00:00Z",
        "eventCount": 0,
    }


def test_ledger_without_session_refs_validates():
    """sessionRefs is OPTIONAL — backward-compat for ledgers that don't track sessions."""
    _validate(_minimal_ledger())


def test_session_refs_accepts_urn_pattern():
    doc = _minimal_ledger()
    doc["sessionRefs"] = [
        "urn:formspec:session:abc123",
        "urn:formspec:session:2026-05-23T10:00:00Z/draft-1",
    ]
    _validate(doc)


def test_session_refs_rejects_plain_string():
    doc = _minimal_ledger()
    doc["sessionRefs"] = ["plain-string-no-urn-prefix"]
    with pytest.raises(ValidationError):
        _validate(doc)


def test_session_refs_rejects_wrong_urn_scheme():
    doc = _minimal_ledger()
    doc["sessionRefs"] = ["urn:formspec:actor:wrong-scheme"]
    with pytest.raises(ValidationError):
        _validate(doc)


def test_session_refs_rejects_empty_urn_tail():
    doc = _minimal_ledger()
    doc["sessionRefs"] = ["urn:formspec:session:"]  # tail required by `.+`
    with pytest.raises(ValidationError):
        _validate(doc)


def test_session_refs_mixed_valid_and_invalid_rejects():
    doc = _minimal_ledger()
    doc["sessionRefs"] = ["urn:formspec:session:ok", "not-a-urn"]
    with pytest.raises(ValidationError):
        _validate(doc)


def test_session_refs_unique_items_still_enforced():
    """The existing uniqueItems invariant is preserved through the URN tightening."""
    doc = _minimal_ledger()
    doc["sessionRefs"] = [
        "urn:formspec:session:dup",
        "urn:formspec:session:dup",
    ]
    with pytest.raises(ValidationError):
        _validate(doc)


def test_session_refs_empty_array_validates():
    """An empty array is allowed (no sessions yet, but explicitly declared)."""
    doc = _minimal_ledger()
    doc["sessionRefs"] = []
    _validate(doc)

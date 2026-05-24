"""Conformance tests for ADR 0150 §5.4: respondent-ledger-event envelope-level
`authoredBy: AuthorActor` carrier-point.

Field-name resolution (per plan r2 + r2.1):
- ADR §5.4 prose says ledger events carry `actor: AuthorActor`, but the envelope
  already has `actor: { $ref: Actor }` holding respondent-identity. Overloading
  `actor` would collide with the existing Trellis fixture corpus.
- Resolution: add a NEW root-level envelope property `authoredBy: AuthorActor`.
  Envelope `actor` (respondent-identity) is untouched.
- `authoredBy` is REQUIRED when `eventType` matches `^(ai\\.|user\\.)`; optional
  otherwise. Pre-existing non-authoring events continue to validate without it.

Structural pin (per plan r2.1 Task 6 Step 4):
- The schema is FLAT — single root `properties` block, `additionalProperties: false`.
- `authoredBy` lands as a ROOT-level property parallel to `changes`,
  `attachmentBinding`, `actionEvent`. ADR §5.4's "payload field" phrase is
  informal — there is no payload sub-object.
- The if/then conditional uses the existing `allOf` block pattern at root.

Regression-proof: the existing Trellis fixture
`trellis/fixtures/vectors/append/018-attachment-bound/input-formspec-respondent-ledger-event.json`
(envelope `actor.kind: 'respondent'`, `eventType: 'attachment.added'`) MUST
continue to validate. The new `authoredBy` is not triggered by
`attachment.added`, so the fixture stays valid by construction.
"""

import json
from copy import deepcopy
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

from tests.unit.support.schema_fixtures import (
    ROOT_DIR,
    build_schema_registry,
    load_schema,
)

EVENT_SCHEMA = load_schema("respondent-ledger-event.schema.json")
COMMON_SCHEMA = load_schema("common.schema.json")
VALIDATION_RESULT_SCHEMA = load_schema("validation-result.schema.json")

_REGISTRY = build_schema_registry(EVENT_SCHEMA, COMMON_SCHEMA, VALIDATION_RESULT_SCHEMA)


def _validate(event: dict) -> None:
    Draft202012Validator(EVENT_SCHEMA, registry=_REGISTRY).validate(event)


def _ai_authoring_event() -> dict:
    """An `ai.command-issued` event — matches the `^(ai\\.|user\\.)` pattern,
    so `authoredBy` MUST be present."""
    return {
        "eventId": "evt-ai-0001",
        "sequence": 1,
        "eventType": "ai.command-issued",
        "occurredAt": "2026-05-23T10:00:00Z",
        "recordedAt": "2026-05-23T10:00:01Z",
        "responseId": "resp-test",
        "definitionUrl": "https://forms.example.gov/intake/test",
        "definitionVersion": "1.0.0",
        "actor": {
            "kind": "respondent",
            "id": "usr-17",
        },
        "source": {"kind": "web", "channelId": "public-portal"},
        "authoredBy": {
            "id": "urn:formspec:actor:ai-agent:wireframes-mcp",
            "kind": "ai-agent",
            "actChannel": "mcp",
        },
    }


def _user_authoring_event() -> dict:
    """A `user.command-issued` event — matches the pattern."""
    event = _ai_authoring_event()
    event["eventId"] = "evt-user-0001"
    event["eventType"] = "user.command-issued"
    event["authoredBy"] = {
        "id": "urn:formspec:actor:human:editor-99",
        "kind": "human",
        "actChannel": "human",
    }
    return event


def _trellis_attachment_event() -> dict:
    """Load the canonical Trellis fixture (regression-proof). Envelope `actor`
    is `kind: respondent`; `eventType: attachment.added` does NOT match the
    `^(ai\\.|user\\.)` pattern, so `authoredBy` is not required."""
    path = (
        ROOT_DIR.parent
        / "trellis"
        / "fixtures"
        / "vectors"
        / "append"
        / "018-attachment-bound"
        / "input-formspec-respondent-ledger-event.json"
    )
    return json.loads(path.read_text())


# ─── authoredBy is REQUIRED on ai.* / user.* events ─────────────────────────


def test_ai_event_with_authored_by_validates():
    _validate(_ai_authoring_event())


def test_user_event_with_authored_by_validates():
    _validate(_user_authoring_event())


def test_ai_event_missing_authored_by_rejects():
    event = _ai_authoring_event()
    event.pop("authoredBy")
    with pytest.raises(ValidationError):
        _validate(event)


def test_user_event_missing_authored_by_rejects():
    event = _user_authoring_event()
    event.pop("authoredBy")
    with pytest.raises(ValidationError):
        _validate(event)


# ─── authoredBy is OPTIONAL on non-authoring events ──────────────────────────


def test_attachment_added_event_without_authored_by_validates():
    """Non-authoring event (eventType doesn't match ^(ai\\.|user\\.)) — the
    field stays optional. This is the Trellis-fixture regression proof."""
    event = _trellis_attachment_event()
    assert "authoredBy" not in event
    _validate(event)


def test_attachment_added_event_with_authored_by_also_validates():
    """Non-authoring events MAY still carry authoredBy (optional, not forbidden)."""
    event = _trellis_attachment_event()
    event["authoredBy"] = {
        "id": "urn:formspec:actor:service:portal-backend",
        "kind": "service",
        "actChannel": "service",
    }
    _validate(event)


# ─── authoredBy must satisfy AuthorActor shape ───────────────────────────────


def test_authored_by_rejects_bad_kind():
    event = _ai_authoring_event()
    event["authoredBy"]["kind"] = "respondent"  # not in {human, ai-agent, service}
    with pytest.raises(ValidationError):
        _validate(event)


def test_authored_by_rejects_bad_act_channel():
    event = _ai_authoring_event()
    event["authoredBy"]["actChannel"] = "carrier-pigeon"
    with pytest.raises(ValidationError):
        _validate(event)


def test_authored_by_rejects_non_urn_id():
    event = _ai_authoring_event()
    event["authoredBy"]["id"] = "ai-agent-7"  # missing urn:formspec:actor: prefix
    with pytest.raises(ValidationError):
        _validate(event)


def test_authored_by_requires_id_kind_act_channel():
    for missing in ("id", "kind", "actChannel"):
        event = _ai_authoring_event()
        event["authoredBy"].pop(missing)
        with pytest.raises(ValidationError):
            _validate(event)


# ─── Envelope-level `actor` (respondent-identity) is unaffected ──────────────


def test_envelope_actor_unchanged_respondent_kind_still_valid():
    """The existing envelope `actor` still uses the local Actor $def with
    `kind: respondent|delegate|system|support-agent|unknown` — Trellis fixture
    must still validate."""
    event = _trellis_attachment_event()
    assert event["actor"]["kind"] == "respondent"
    _validate(event)


def test_envelope_actor_rejects_authoring_kind():
    """Envelope `actor.kind` is still respondent-side enum, not AuthorActor's
    {human, ai-agent, service}."""
    event = _trellis_attachment_event()
    event["actor"]["kind"] = "ai-agent"  # invalid for envelope actor
    with pytest.raises(ValidationError):
        _validate(event)


# ─── Module-contributed authoring events (^x- pattern) ───────────────────────


def test_x_prefixed_authoring_event_without_authored_by_validates():
    """An ^x- module-contributed event type that is NOT in ^(ai\\.|user\\.)
    pattern — the if/then guard doesn't fire; authoredBy stays optional. (Module
    contracts may layer their own require-rule on top via E603/lint.)"""
    event = _ai_authoring_event()
    event["eventId"] = "evt-x-0001"
    event["eventType"] = "x-formspec-conversation"
    event.pop("authoredBy")
    _validate(event)

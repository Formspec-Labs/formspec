"""Conformance tests for respondent-ledger schemas."""

from copy import deepcopy
import json

import pytest
from jsonschema import Draft202012Validator, ValidationError

from tests.unit.support.schema_fixtures import ROOT_DIR, build_schema_registry, load_schema


LEDGER_SCHEMA = load_schema("respondent-ledger.schema.json")
EVENT_SCHEMA = load_schema("respondent-ledger-event.schema.json")
VALIDATION_RESULT_SCHEMA = load_schema("validation-result.schema.json")

_REGISTRY = build_schema_registry(LEDGER_SCHEMA, EVENT_SCHEMA, VALIDATION_RESULT_SCHEMA)


def _validate_event(instance: dict) -> None:
    Draft202012Validator(EVENT_SCHEMA, registry=_REGISTRY).validate(instance)


def _validate_ledger(instance: dict) -> None:
    Draft202012Validator(LEDGER_SCHEMA, registry=_REGISTRY).validate(instance)


def _attachment_added_event() -> dict:
    with open(ROOT_DIR / "fixtures/respondent-ledger/attachment-added-binding.json") as f:
        return json.load(f)


def _attachment_removed_event() -> dict:
    event = _attachment_added_event()
    event["eventId"] = "evt-attachment-0002"
    event["sequence"] = 2
    event["eventType"] = "attachment.removed"
    event["priorEventHash"] = event["eventHash"]
    event["eventHash"] = "sha256:d63f1d5fe2a9f0d8a9b6e5f1234d7c3b2a1908776af4ed0d17b9f225e5c4cb01"
    event["priorAttachmentBindingHash"] = "sha256:b6a8a6f541534a1b2ce3f4dcaad106dd671e9b1b08fbde177a7fd9024adbd8fc"
    event.pop("attachmentBinding")
    event["changes"][0]["op"] = "remove"
    event["changes"][0].pop("afterHash", None)
    event["changes"][0].pop("displayAfter", None)
    event["changes"][0]["beforeHash"] = "sha256:1f74d3a1e85f2f7a6df1e7cf8a580f2e9b5c17231ce0a91d89d8e3bb18c3e19a"
    event["changes"][0]["displayBefore"] = "paystub-march.pdf"
    event["changes"][0]["reasonCode"] = "respondent-removal"
    return event


def test_attachment_added_fixture_is_schema_valid():
    _validate_event(_attachment_added_event())


def test_attachment_added_requires_binding():
    event = _attachment_added_event()
    event.pop("attachmentBinding")

    with pytest.raises(ValidationError):
        _validate_event(event)


def test_attachment_added_requires_null_prior_binding_hash():
    event = _attachment_added_event()
    event["attachmentBinding"]["prior_binding_hash"] = "sha256:b6a8a6f541534a1b2ce3f4dcaad106dd671e9b1b08fbde177a7fd9024adbd8fc"

    with pytest.raises(ValidationError):
        _validate_event(event)


def test_attachment_replaced_requires_prior_binding_hash():
    event = _attachment_added_event()
    event["eventType"] = "attachment.replaced"
    event["attachmentBinding"]["prior_binding_hash"] = "sha256:b6a8a6f541534a1b2ce3f4dcaad106dd671e9b1b08fbde177a7fd9024adbd8fc"
    _validate_event(event)

    missing_prior = deepcopy(event)
    missing_prior["attachmentBinding"]["prior_binding_hash"] = None
    with pytest.raises(ValidationError):
        _validate_event(missing_prior)


def test_attachment_removed_references_prior_binding_without_new_binding():
    _validate_event(_attachment_removed_event())


def test_attachment_removed_rejects_new_binding():
    event = _attachment_removed_event()
    event["attachmentBinding"] = _attachment_added_event()["attachmentBinding"]

    with pytest.raises(ValidationError):
        _validate_event(event)


def test_prior_event_hash_allows_null_for_first_trellis_wrapped_event():
    event = _attachment_added_event()
    event["priorEventHash"] = None
    _validate_event(event)


def test_chained_event_hashes_are_structurally_paired():
    event = _attachment_added_event()
    missing_prior = deepcopy(event)
    missing_prior.pop("priorEventHash")
    with pytest.raises(ValidationError):
        _validate_event(missing_prior)

    missing_current = deepcopy(event)
    missing_current.pop("eventHash")
    with pytest.raises(ValidationError):
        _validate_event(missing_current)


def _minimal_ledger_material() -> dict:
    return {
        "$formspecRespondentLedger": "0.1",
        "ledgerId": "led-test-material",
        "responseId": "resp-test",
        "definitionUrl": "https://example.test/def",
        "definitionVersion": "1.0.0",
        "status": "in-progress",
        "createdAt": "2026-04-28T00:00:00Z",
        "lastEventAt": "2026-04-28T00:00:00Z",
        "eventCount": 0,
    }


def _minimal_ledger_field_level() -> dict:
    doc = _minimal_ledger_material()
    doc["ledgerId"] = "led-test-field-level"
    doc["changelogMode"] = "field-level"
    doc["changelogBoundaries"] = ["save", "submit"]
    return doc


def test_field_level_ledger_requires_changelog_boundaries():
    doc = _minimal_ledger_field_level()
    doc.pop("changelogBoundaries")
    with pytest.raises(ValidationError):
        _validate_ledger(doc)


def test_field_level_ledger_rejects_empty_changelog_boundaries():
    doc = _minimal_ledger_field_level()
    doc["changelogBoundaries"] = []
    with pytest.raises(ValidationError):
        _validate_ledger(doc)


def test_field_level_ledger_with_boundaries_is_valid():
    _validate_ledger(_minimal_ledger_field_level())


def test_material_ledger_without_changelog_fields_is_valid():
    _validate_ledger(_minimal_ledger_material())


def _field_edit_recorded_event() -> dict:
    return {
        "eventId": "evt-field-edit-0001",
        "sequence": 1,
        "eventType": "field.edit-recorded",
        "occurredAt": "2026-04-28T12:00:00Z",
        "recordedAt": "2026-04-28T12:00:01Z",
        "responseId": "resp-8d0b1e85",
        "definitionUrl": "https://forms.example.gov/intake/housing-assistance",
        "definitionVersion": "2.3.0",
        "actor": {
            "kind": "respondent",
            "id": "usr-17",
            "subjectRef": "subj-pseudo-44",
        },
        "source": {"kind": "web", "channelId": "public-portal"},
        "priorEventHash": None,
        "eventHash": "sha256:72df6b4f6ff78ec1f41f43a5c68a1be2114e7338e25a7bde7a7258f5b8bb0fb9",
        "changes": [
            {
                "op": "set",
                "path": "household.monthlyIncome",
                "valueClass": "user-input",
                "itemKey": "household_monthly_income",
                "accessClass": "standard",
                "editBatchId": "batch-save-2026-04-28-001",
                "editSequence": 0,
                "before": 2400,
                "after": 2800,
                "reasonCode": "user-edit",
            }
        ],
    }


def test_field_edit_recorded_event_is_schema_valid():
    _validate_event(_field_edit_recorded_event())

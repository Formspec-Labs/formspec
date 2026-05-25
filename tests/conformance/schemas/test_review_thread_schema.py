"""Schema acceptance tests for the SC-6 Review Thread sidecar."""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

from tests.unit.support.schema_fixtures import build_schema_registry, load_schema


ROOT = Path(__file__).resolve().parents[3]
FIXTURES_DIR = ROOT / "tests" / "conformance" / "fixtures" / "review-thread"

COMMON_SCHEMA = load_schema("common.schema.json")
REVIEW_THREAD_SCHEMA = load_schema("review-thread.schema.json")

SCOPE_RANK = {
    "view": 0,
    "view+comment": 1,
    "view+comment+suggest": 2,
}


def _validator() -> Draft202012Validator:
    return Draft202012Validator(
        REVIEW_THREAD_SCHEMA,
        registry=build_schema_registry(COMMON_SCHEMA, REVIEW_THREAD_SCHEMA),
        format_checker=Draft202012Validator.FORMAT_CHECKER,
    )


def _fixture_doc(name: str) -> dict:
    with (FIXTURES_DIR / name).open(encoding="utf-8") as handle:
        return json.load(handle)


def _assert_review_thread_relationships(doc: dict) -> None:
    thread_id = doc["threadId"]
    shares = {}
    for share in doc.get("shares", []):
        if share["threadId"] != thread_id:
            raise AssertionError(f"share {share['shareId']!r} is bound to a different thread")
        shares[share["shareId"]] = share

    for event in doc.get("events", []):
        if event["threadId"] != thread_id:
            raise AssertionError(f"event {event['eventId']!r} is bound to a different thread")

        author = event["author"]
        if author["kind"] != "reviewer":
            continue

        share = shares.get(author["shareId"])
        if share is None:
            raise AssertionError(f"reviewer event {event['eventId']!r} references an unknown share")

        payload_type = event["payload"]["type"]
        required_scope = "view+comment+suggest" if payload_type == "suggestion-added" else "view+comment"
        if SCOPE_RANK[share["grantedScope"]] < SCOPE_RANK[required_scope]:
            raise AssertionError(
                f"reviewer event {event['eventId']!r} requires {required_scope}, "
                f"got {share['grantedScope']}"
            )


def test_schema_is_well_formed() -> None:
    Draft202012Validator.check_schema(REVIEW_THREAD_SCHEMA)


def test_schema_is_sidecar_not_response_extension() -> None:
    assert "$formspecReviewThread" in REVIEW_THREAD_SCHEMA["required"]
    assert "response" not in REVIEW_THREAD_SCHEMA["properties"]
    assert "authoredSignatures" not in REVIEW_THREAD_SCHEMA["properties"]


@pytest.mark.parametrize(
    "fixture_name",
    ["valid-suggest-thread.json", "valid-comment-thread.json"],
)
def test_valid_fixtures_pass(fixture_name: str) -> None:
    doc = _fixture_doc(fixture_name)

    _validator().validate(doc)
    _assert_review_thread_relationships(doc)


@pytest.mark.parametrize(
    "fixture_name",
    [
        "invalid-comment-policy-suggestion.json",
        "invalid-reviewer-accepts-suggestion.json",
        "invalid-respondent-adds-suggestion.json",
        "invalid-missing-reviewer-share.json",
        "invalid-forbidden-policy.json",
    ],
)
def test_invalid_fixtures_fail_schema(fixture_name: str) -> None:
    with pytest.raises(ValidationError):
        _validator().validate(_fixture_doc(fixture_name))


def test_suggestion_accepted_is_respondent_authored_only() -> None:
    doc = copy.deepcopy(_fixture_doc("valid-suggest-thread.json"))
    doc["events"][3]["author"] = {
        "kind": "reviewer",
        "shareId": "urn:formspec:review-share:demo:001",
        "displayName": "CPA reviewer",
    }

    with pytest.raises(ValidationError):
        _validator().validate(doc)


def test_comment_only_policy_rejects_suggestion_events() -> None:
    doc = copy.deepcopy(_fixture_doc("valid-comment-thread.json"))
    doc["events"].append(
        {
            "eventId": "urn:formspec:review-event:demo:comment-only-2",
            "threadId": "urn:formspec:review-thread:demo:comment-only",
            "occurredAt": "2026-05-25T16:25:00Z",
            "author": {
                "kind": "reviewer",
                "shareId": "urn:formspec:review-share:demo:comment-only",
                "displayName": "Family reviewer",
            },
            "payload": {
                "type": "suggestion-added",
                "anchor": {
                    "fieldPointer": "/mailingAddress"
                },
                "proposedValue": "New address",
            },
        }
    )

    with pytest.raises(ValidationError):
        _validator().validate(doc)


@pytest.mark.parametrize("payload_type", ["suggestion-added", "suggestion-accepted", "suggestion-declined"])
def test_comment_only_policy_rejects_all_suggestion_event_types(payload_type: str) -> None:
    doc = copy.deepcopy(_fixture_doc("valid-comment-thread.json"))
    author = {
        "kind": "reviewer",
        "shareId": "urn:formspec:review-share:demo:comment-only",
        "displayName": "Family reviewer",
    }
    payload = {"type": payload_type, "suggestionEventId": "urn:formspec:review-event:demo:comment-only-0"}
    if payload_type == "suggestion-added":
        payload = {
            "type": "suggestion-added",
            "anchor": {"fieldPointer": "/mailingAddress"},
            "proposedValue": "New address",
        }
    else:
        author = {"kind": "respondent", "displayName": "Applicant"}
    doc["events"].append(
        {
            "eventId": f"urn:formspec:review-event:demo:comment-only-{payload_type}",
            "threadId": "urn:formspec:review-thread:demo:comment-only",
            "occurredAt": "2026-05-25T16:25:00Z",
            "author": author,
            "payload": payload,
        }
    )

    with pytest.raises(ValidationError):
        _validator().validate(doc)


def test_reviewer_share_must_exist_and_match_thread() -> None:
    doc = copy.deepcopy(_fixture_doc("valid-suggest-thread.json"))
    doc["events"][1]["author"]["shareId"] = "urn:formspec:review-share:demo:unknown"

    _validator().validate(doc)
    with pytest.raises(AssertionError):
        _assert_review_thread_relationships(doc)

    doc = copy.deepcopy(_fixture_doc("valid-suggest-thread.json"))
    doc["shares"][0]["threadId"] = "urn:formspec:review-thread:demo:other"

    _validator().validate(doc)
    with pytest.raises(AssertionError):
        _assert_review_thread_relationships(doc)


def test_reviewer_suggestions_require_suggest_scope() -> None:
    doc = copy.deepcopy(_fixture_doc("valid-suggest-thread.json"))
    doc["shares"][0]["grantedScope"] = "view+comment"

    _validator().validate(doc)
    with pytest.raises(AssertionError):
        _assert_review_thread_relationships(doc)


def test_respondent_only_snapshot_rejects_raw_value() -> None:
    doc = copy.deepcopy(_fixture_doc("valid-suggest-thread.json"))
    doc["draftSnapshot"]["fields"][1]["value"] = "000-00-0000"

    with pytest.raises(ValidationError):
        _validator().validate(doc)


def test_share_record_rejects_live_capability_url() -> None:
    doc = copy.deepcopy(_fixture_doc("valid-suggest-thread.json"))
    doc["shares"][0]["capabilityUrl"] = "https://review.example.gov/r/demo-token"

    with pytest.raises(ValidationError):
        _validator().validate(doc)


@pytest.mark.parametrize(
    "mutate",
    [
        lambda doc: doc.update({"extensions": {"x-capability-url": "https://review.example.gov/r/demo-token"}}),
        lambda doc: doc["shares"][0].update(
            {"extensions": {"x-capability-url": "https://review.example.gov/r/demo-token"}}
        ),
        lambda doc: doc["events"][1].update(
            {"extensions": {"x-capability-url": "https://review.example.gov/r/demo-token"}}
        ),
        lambda doc: doc["events"][1]["payload"].update(
            {"extensions": {"x-capability-url": "https://review.example.gov/r/demo-token"}}
        ),
    ],
)
def test_review_thread_rejects_extension_payload_smuggling(mutate) -> None:
    doc = copy.deepcopy(_fixture_doc("valid-suggest-thread.json"))
    mutate(doc)

    with pytest.raises(ValidationError):
        _validator().validate(doc)

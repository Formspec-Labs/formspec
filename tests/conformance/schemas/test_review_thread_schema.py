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


def _validator() -> Draft202012Validator:
    return Draft202012Validator(
        REVIEW_THREAD_SCHEMA,
        registry=build_schema_registry(COMMON_SCHEMA, REVIEW_THREAD_SCHEMA),
        format_checker=Draft202012Validator.FORMAT_CHECKER,
    )


def _fixture_doc(name: str) -> dict:
    with (FIXTURES_DIR / name).open(encoding="utf-8") as handle:
        return json.load(handle)


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
    _validator().validate(_fixture_doc(fixture_name))


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

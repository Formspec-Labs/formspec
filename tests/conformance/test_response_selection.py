"""Shared Core Response selection and filing-unit identity vectors."""

from decimal import Decimal
import json
from pathlib import Path

import pytest

from formspec import select_responses_json, subject_id_json


FIXTURES = Path(__file__).parent / "fixtures"
SUITE = json.loads(
    (FIXTURES / "response-selection" / "selection.json").read_text(),
    parse_float=Decimal,
)
SUBJECT_IDS = json.loads((FIXTURES / "subject-id" / "vectors.json").read_text())


def exact_json(value):
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, list):
        return "[" + ",".join(map(exact_json, value)) + "]"
    if isinstance(value, dict):
        return "{" + ",".join(json.dumps(k) + ":" + exact_json(v) for k, v in value.items()) + "}"
    return json.dumps(value)


@pytest.mark.parametrize("case", SUITE["cases"], ids=lambda case: case["name"])
def test_response_selection(case):
    result = select_responses_json(
        exact_json([SUITE["records"][name] for name in case["records"]]),
        exact_json(SUITE["selection"] | case["selection"]),
        exact_json(SUITE["context"] | case["context"]),
    )
    assert json.loads(result, parse_float=Decimal) == case["expected"]


def test_missing_upstream_subject_is_a_wire_error():
    case = SUITE["missingUpstreamSubject"]
    with pytest.raises(ValueError, match=case["expectedError"]):
        select_responses_json(
            "[]",
            exact_json(SUITE["selection"] | case["selection"]),
            exact_json(case["context"]),
        )


@pytest.mark.parametrize("vector", SUBJECT_IDS["vectors"], ids=lambda vector: vector["name"])
def test_subject_id(vector):
    assert subject_id_json(vector["type"], json.dumps(vector["keys"])) == vector["id"]


@pytest.mark.parametrize("fixture", SUBJECT_IDS["refusals"], ids=lambda fixture: fixture["name"])
def test_subject_id_refuses_unsafe_integers(fixture):
    with pytest.raises(ValueError, match=fixture["expectedError"]):
        subject_id_json(fixture["type"], json.dumps(fixture["keys"]))

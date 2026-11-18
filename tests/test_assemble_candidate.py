"""The Python binding assembles the same exact Response as the browser."""

from decimal import Decimal
import json
from pathlib import Path

import pytest


FIXTURE = json.loads(
    Path(__file__).with_name("fixtures").joinpath("assemble-candidate.json").read_text(),
    parse_float=str,
)


def test_mapped_empty_fixture_matches_selector():
    from formspec import select_responses_json

    instance = FIXTURE["definition"]["instances"]["z_mapped_empty"]
    context = {
        "scope": "synthetic",
        "authorized": True,
        "source": "definition",
        "upstreamSubject": None,
        "projection": list(instance["schema"]),
        "fallback": instance["data"],
    }
    outcome = json.loads(select_responses_json("[]", json.dumps(instance["response"]), json.dumps(context)))
    assert outcome == {"status": "available", **FIXTURE["resolution"]["z_mapped_empty"]}


def test_assemble_candidate_preserves_exact_response_and_resolution():
    from formspec import assemble_candidate_json

    fixture = FIXTURE
    exact_number = fixture["response"]["data"]["exact"]
    response_json = json.dumps(fixture["response"]).replace(f'"{exact_number}"', exact_number)
    definition_json = json.dumps(fixture["definition"])
    resolution_json = json.dumps(fixture["resolution"])
    assembled_json = assemble_candidate_json(definition_json, response_json, "{}", resolution_json)
    assert json.loads(assembled_json, parse_float=Decimal) == {
        **fixture["response"],
        "data": {**fixture["response"]["data"], "exact": Decimal(exact_number)},
        "resolvedInstances": fixture["resolvedInstances"],
    }
    assert assemble_candidate_json(definition_json, assembled_json, "{}", resolution_json) == assembled_json


@pytest.mark.parametrize("case", FIXTURE["refusals"], ids=lambda case: case["message"])
def test_assemble_candidate_refuses_inconsistent_delivery(case):
    from formspec import assemble_candidate_json

    instance = case["instance"]
    resolution = {**FIXTURE["resolution"], instance: {**FIXTURE["resolution"][instance], **case["delivery"]}}
    with pytest.raises(ValueError) as exc:
        assemble_candidate_json(
            json.dumps(FIXTURE["definition"]), json.dumps(FIXTURE["response"]), "{}", json.dumps(resolution)
        )
    assert str(exc.value) == f"Response instance '{instance}' {case['message']}"

from __future__ import annotations

from copy import deepcopy
from pathlib import Path

from formspec.validate import discover_artifacts, validate_all


EXAMPLE_DIR = Path(__file__).resolve().parents[2] / "examples" / "signature-attestation"


def _pass(report, title: str):
    return next(pass_result for pass_result in report.passes if pass_result.title == title)


def test_signed_response_fixture_survives_server_side_revalidation_without_losing_authored_signatures() -> None:
    artifacts = discover_artifacts(EXAMPLE_DIR)
    assert len(artifacts.responses) == 1
    original = deepcopy(artifacts.responses[0].doc)

    report = validate_all(artifacts)

    schema_pass = _pass(report, "Response fixture schema validation")
    runtime_pass = _pass(report, "Runtime evaluation")

    assert schema_pass.items[0].error_count == 0
    assert runtime_pass.items[0].error_count == 0
    assert artifacts.responses[0].doc == original
    signed_payload = artifacts.responses[0].doc["authoredSignatures"][0]["signedPayload"]
    assert signed_payload["responseId"] == artifacts.responses[0].doc["id"]
    assert signed_payload["canonicalization"] == "formspec-response-signing-v1"

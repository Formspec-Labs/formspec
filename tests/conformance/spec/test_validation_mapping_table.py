"""Master mapping table pin.

Pins the machine-readable table and fixture semantics against the prose:

  tests/conformance/fixtures/validation-mapping/master-table.json  (developer-facing table)
  tests/conformance/fixtures/validation-mapping/closed-core-5-rows-jcs.json  (RFC 8785 byte-equality pin — post-ADR-0150 §4.2)
  Permitted-tuple predicate from §6.3.
  Validation Mapping fixture outcomes (profile filtering, reports, status transitions).

If any drifts, the test fails — the §9 row-3 promotion gate has been broken.

ADR 0150 §4.2/§10 demoted ``MasterTable.const`` (along with ``minItems``,
``maxItems``, ``uniqueItems``) so the schema no longer carries the canonical
5-row pin. Authority for the closed-core 5-row byte equality moved to the
JCS fixture; the demotion conformance lives in
``tests/conformance/test_validation_mapping_master_table_demotion.py``.
"""
import json
import re
from copy import deepcopy
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from tests.unit.support.schema_fixtures import build_schema_registry, load_schema

ROOT = Path(__file__).resolve().parents[3]
SCHEMA_PATH = ROOT / "schemas" / "validation-mapping.schema.json"
MASTER_FIXTURE = ROOT / "tests" / "conformance" / "fixtures" / "validation-mapping" / "master-table.json"
FIXTURES_DIR = ROOT / "tests" / "conformance" / "fixtures" / "validation-mapping"
INTENT_FIXTURES = [
    "intent-save-draft.json",
    "intent-submit-blocked.json",
    "intent-submit-warning-only.json",
    "intent-request-evidence.json",
    "intent-autosave-disabled.json",
]

EXPECTED_TABLE = [
    {"intent": "save-draft", "profile": "off", "blocking": "non-blocking", "persistence": "draft-checkpoint"},
    {"intent": "autosave", "profile": "off", "blocking": "non-blocking", "persistence": "draft-checkpoint"},
    {"intent": "review", "profile": "on-submit", "blocking": "non-blocking", "persistence": "none"},
    {"intent": "submit", "profile": "on-submit", "blocking": "block-on-error", "persistence": "complete-response"},
    {"intent": "request-evidence", "profile": "on-demand", "blocking": "non-blocking", "persistence": "draft-checkpoint"},
]


@pytest.fixture(scope="module")
def schema():
    with SCHEMA_PATH.open() as f:
        return json.load(f)


@pytest.fixture(scope="module")
def master_fixture():
    with MASTER_FIXTURE.open() as f:
        return json.load(f)


def _load_fixture(name: str) -> dict:
    with (FIXTURES_DIR / name).open() as f:
        return json.load(f)


@pytest.fixture(scope="module")
def definition_validator():
    definition_schema = load_schema("definition.schema.json")
    common_schema = load_schema("common.schema.json")
    return Draft202012Validator(
        definition_schema,
        registry=build_schema_registry(common_schema, definition_schema),
    )


@pytest.fixture(scope="module")
def response_validator():
    response_schema = load_schema("response.schema.json")
    validation_result_schema = load_schema("validation-result.schema.json")
    return Draft202012Validator(
        response_schema,
        registry=build_schema_registry(response_schema, validation_result_schema),
    )


@pytest.fixture(scope="module")
def validation_report_validator():
    validation_report_schema = load_schema("validation-report.schema.json")
    validation_result_schema = load_schema("validation-result.schema.json")
    return Draft202012Validator(
        validation_report_schema,
        registry=build_schema_registry(validation_report_schema, validation_result_schema),
    )


@pytest.fixture(scope="module")
def mapping_entry_validator(schema):
    entry_schema = {
        "$schema": schema["$schema"],
        "$defs": schema["$defs"],
        "$ref": "#/$defs/MappingEntry",
    }
    return Draft202012Validator(entry_schema)


def _shape_timings_for_profile(profile: str) -> set[str]:
    if profile == "off":
        return set()
    if profile == "live":
        return {"continuous"}
    if profile == "on-submit":
        return {"continuous", "submit"}
    if profile == "on-demand":
        return {"demand"}
    raise AssertionError(f"Unexpected profile: {profile}")


def _shape_fails(shape: dict, data: dict) -> bool:
    """Reference evaluator for this fixture corpus, not a general FEL evaluator."""
    shape_id = shape["id"]
    if shape_id == "phone-format-warning":
        value = data.get("phone")
        return not (value is None or re.fullmatch(r"\+?[0-9 ()-]{7,}", value or ""))
    if shape_id == "applicantName-min-length":
        value = data.get("applicantName")
        return not (value is None or len(value) >= 2)
    if shape_id == "submit-review-check":
        return data.get("applicantName") == "A"
    if shape_id == "duplicate-applicant-check":
        return True
    raise AssertionError(f"Unexpected shape: {shape_id}")


def _result_for(shape: dict) -> dict:
    return {
        "$formspecValidationResult": "1.0",
        "path": shape["target"],
        "severity": shape.get("severity", "error"),
        "constraintKind": "shape",
        "shapeId": shape["id"],
        "message": shape["message"],
    }


def _report_for(definition: dict, response: dict, profile: str) -> tuple[dict | None, list[str], list[str]]:
    fired_timings = _shape_timings_for_profile(profile)
    if not fired_timings:
        return None, [], [shape["id"] for shape in definition.get("shapes", [])]

    fired = []
    deferred = []
    results = []
    for shape in definition.get("shapes", []):
        if shape.get("timing", "continuous") not in fired_timings:
            deferred.append(shape["id"])
            continue
        fired.append(shape["id"])
        if _shape_fails(shape, response["data"]):
            results.append(_result_for(shape))

    counts = {
        "error": sum(1 for result in results if result["severity"] == "error"),
        "warning": sum(1 for result in results if result["severity"] == "warning"),
        "info": sum(1 for result in results if result["severity"] == "info"),
    }
    return {
        "$formspecValidationReport": "1.0",
        "valid": counts["error"] == 0,
        "results": results,
        "counts": counts,
        "timestamp": response["authored"],
    }, fired, deferred


def _evaluate_fixture(definition: dict, fixture: dict) -> dict:
    response = fixture["responseBefore"]
    action = fixture["action"]
    report, shapes_fired, shapes_deferred = _report_for(definition, response, action["profile"])
    outcome = {
        "statusAfter": response["status"],
        "validationReportProduced": report is not None,
    }
    if report is not None:
        outcome["validationReport"] = report
        outcome["shapesFired"] = shapes_fired
        outcome["shapesDeferred"] = shapes_deferred

    if action["persistence"] == "draft-checkpoint":
        outcome["persisted"] = True
        outcome["statusAfter"] = "in-progress"
    elif action["persistence"] == "complete-response":
        blocked = action["blocking"] == "block-on-error" and report is not None and not report["valid"]
        outcome["transitionBlocked"] = blocked
        if blocked:
            outcome["statusAfter"] = "in-progress"
            outcome["responseAfter"] = deepcopy(response)
            outcome["responseAfter"]["status"] = "in-progress"
            outcome["checkpointPersisted"] = True
            outcome["completedPersisted"] = False
            outcome["blockReason"] = "block-on-error: counts.error > 0"
        else:
            outcome["statusAfter"] = "completed"
            outcome["persisted"] = True
    return outcome


class TestMasterTablePin:
    """Post-ADR-0150 §4.2 demotion: schema no longer carries ``MasterTable.const``.

    Authority for the closed-core 5-row byte equality moved to the JCS fixture
    (``closed-core-5-rows-jcs.json``); the four-constraint demotion + JCS
    byte-equality conformance lives in
    ``tests/conformance/test_validation_mapping_master_table_demotion.py``.

    This class now pins only what the spec §6 prose ACTUALLY needs:
    (1) the developer-facing fixture (``master-table.json``) matches the §6
    table; (2) every row in the canonical table validates against the schema's
    open-cardinality ``MasterTable`` shape (per-row predicate still binds).
    """

    def test_fixture_matches_expected(self, master_fixture):
        assert master_fixture["table"] == EXPECTED_TABLE, "Fixture master-table.json drifted from §6 prose."

    def test_canonical_5_rows_validate_against_open_master_table(self, schema):
        """Post-§4.2 demotion: validate EXPECTED_TABLE through the (now
        open-cardinality) MasterTable $def. Closed-core 5-row membership is
        pinned at fixture authority — this just proves the row shape still
        binds. See test_validation_mapping_master_table_demotion.py for the
        byte-equality + four-constraint demotion conformance."""
        table_schema = {
            "$schema": schema["$schema"],
            "$defs": schema["$defs"],
            "$ref": "#/$defs/MasterTable",
        }
        validator = Draft202012Validator(table_schema)
        errors = list(validator.iter_errors(EXPECTED_TABLE))
        assert errors == [], [e.message for e in errors]


class TestPermittedTuplePredicate:
    """§6.3 predicate:
       permitted(profile, blocking, persistence) :=
           NOT (persistence == complete-response AND blocking != block-on-error)
         AND NOT (persistence == complete-response AND profile != on-submit)
         AND NOT (blocking == block-on-error AND persistence != complete-response)
         AND NOT (profile == off AND blocking == block-on-error)
    """

    @staticmethod
    def permitted(profile, blocking, persistence):
        if persistence == "complete-response" and blocking != "block-on-error":
            return False
        if persistence == "complete-response" and profile != "on-submit":
            return False
        if blocking == "block-on-error" and persistence != "complete-response":
            return False
        if profile == "off" and blocking == "block-on-error":
            return False
        return True

    def test_master_table_rows_all_permitted(self):
        for row in EXPECTED_TABLE:
            assert self.permitted(row["profile"], row["blocking"], row["persistence"]), (
                f"Master-table row violates §6.3 predicate: {row}"
            )

    def test_prohibited_override_examples_rejected(self):
        assert not self.permitted("on-submit", "non-blocking", "complete-response")
        assert not self.permitted("live", "block-on-error", "complete-response")
        assert not self.permitted("on-demand", "block-on-error", "complete-response")
        assert not self.permitted("off", "block-on-error", "complete-response")
        assert not self.permitted("on-submit", "block-on-error", "none")
        assert not self.permitted("on-submit", "block-on-error", "draft-checkpoint")
        assert not self.permitted("on-demand", "block-on-error", "draft-checkpoint")


class TestValidationMappingFixtureShape:
    def test_definition_base_is_schema_valid(self, definition_validator):
        errors = list(definition_validator.iter_errors(_load_fixture("definition-base.json")))
        assert errors == [], [error.message for error in errors]

    @pytest.mark.parametrize("fixture_name", INTENT_FIXTURES)
    def test_response_before_is_schema_valid(self, response_validator, fixture_name):
        fixture = _load_fixture(fixture_name)
        errors = list(response_validator.iter_errors(fixture["responseBefore"]))
        assert errors == [], [error.message for error in errors]

    @pytest.mark.parametrize("fixture_name", INTENT_FIXTURES)
    def test_action_tuple_matches_mapping_entry_schema(self, mapping_entry_validator, fixture_name):
        fixture = _load_fixture(fixture_name)
        errors = list(mapping_entry_validator.iter_errors(fixture["action"]))
        assert errors == [], [error.message for error in errors]

    def test_blocked_submit_fixture_distinguishes_checkpoint_from_completion(self):
        fixture = _load_fixture("intent-submit-blocked.json")
        expected = fixture["expected"]
        assert expected["responseAfter"]["data"] == fixture["responseBefore"]["data"]
        assert expected["responseAfter"]["status"] == "in-progress"
        assert expected["checkpointPersisted"] is True
        assert expected["completedPersisted"] is False

    def test_blocked_submit_response_after_is_schema_valid_and_preserves_data(self, response_validator):
        fixture = _load_fixture("intent-submit-blocked.json")
        response_after = fixture["expected"]["responseAfter"]
        errors = list(response_validator.iter_errors(response_after))
        assert errors == [], [error.message for error in errors]
        assert response_after["data"] == fixture["responseBefore"]["data"]

    @pytest.mark.parametrize("fixture_name", [
        "intent-submit-blocked.json",
        "intent-submit-warning-only.json",
        "intent-request-evidence.json",
    ])
    def test_expected_validation_report_is_schema_valid(self, validation_report_validator, fixture_name):
        fixture = _load_fixture(fixture_name)
        errors = list(validation_report_validator.iter_errors(fixture["expected"]["validationReport"]))
        assert errors == [], [error.message for error in errors]


class TestValidationMappingFixtureSemantics:
    @pytest.fixture(scope="class")
    def definition_base(self):
        return _load_fixture("definition-base.json")

    @pytest.mark.parametrize("fixture_name", INTENT_FIXTURES)
    def test_fixture_expected_outcome_matches_reference_evaluator(self, definition_base, fixture_name):
        fixture = _load_fixture(fixture_name)
        actual = _evaluate_fixture(definition_base, fixture)
        assert actual == fixture["expected"]

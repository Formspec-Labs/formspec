"""Schema acceptance tests for the Response Actions companion spec."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

from tests.unit.support.schema_fixtures import build_schema_registry, load_schema

ROOT = Path(__file__).resolve().parents[3]
FIXTURES_DIR = ROOT / "tests" / "conformance" / "fixtures" / "response-actions"
RESPONSE_ACTIONS_SCHEMA = load_schema("response-actions.schema.json")
VALIDATION_MAPPING_SCHEMA = load_schema("validation-mapping.schema.json")


def _validator() -> Draft202012Validator:
    return Draft202012Validator(
        RESPONSE_ACTIONS_SCHEMA,
        registry=build_schema_registry(RESPONSE_ACTIONS_SCHEMA, VALIDATION_MAPPING_SCHEMA),
        format_checker=Draft202012Validator.FORMAT_CHECKER,
    )


def _fixture_doc(name: str) -> dict:
    with (FIXTURES_DIR / name).open(encoding="utf-8") as handle:
        payload = json.load(handle)
    return payload["responseActions"]


def _base_doc() -> dict:
    return _fixture_doc("intent-submit-blocked.json")


class TestResponseActionsSchemaShape:
    def test_schema_has_expected_defs(self) -> None:
        defs = RESPONSE_ACTIONS_SCHEMA.get("$defs", {})
        for name in (
            "ActionIntent",
            "Action",
            "Precondition",
            "ValidationOverride",
            "EffectRequest",
            "MappingExecutionEffect",
            "LedgerAppendEffect",
            "HandoffAssemblyEffect",
            "EvidenceRequestEffect",
            "HostEventEffect",
        ):
            assert name in defs, f"Missing $def: {name}"

    @pytest.mark.parametrize(
        "fixture_name",
        [
            "intent-save-draft.json",
            "intent-submit-blocked.json",
            "intent-warning-only-submit.json",
            "intent-request-evidence-demand.json",
            "intent-disabled-no-validation.json",
            "effect-ordering.json",
            "effect-failure-no-rollback.json",
            "effect-deferred-evidence.json",
            "effect-evidence-default-defer.json",
            "effect-idempotent-replay.json",
            "precondition-bogus-binding-rejected.json",
            "precondition-fails-blocked.json",
            "precondition-fails-deferred.json",
            "cross-spec-intake-handoff-seam.json",
            "master-action-shapes.json",
        ],
    )
    def test_conformance_fixture_response_actions_validate(self, fixture_name: str) -> None:
        _validator().validate(_fixture_doc(fixture_name))

    def test_duplicate_action_id_fixture_is_schema_valid_but_semantically_invalid(self) -> None:
        _validator().validate(_fixture_doc("duplicate-action-id.json"))

    def test_duplicate_durable_idempotency_key_fixture_is_schema_valid_but_semantically_invalid(
        self,
    ) -> None:
        _validator().validate(_fixture_doc("duplicate-durable-idempotency-key.json"))


class TestResponseActionsValidationTuple:
    def test_x_intent_requires_explicit_full_validation_tuple(self) -> None:
        doc = _base_doc()
        action = doc["actions"][0]
        action["id"] = "custom-submit"
        action["intent"] = "x-custom-submit"
        action.pop("validation", None)

        with pytest.raises(ValidationError):
            _validator().validate(doc)

        action["validation"] = {
            "profile": "on-submit",
            "blocking": "block-on-error",
            "persistence": "complete-response",
        }
        _validator().validate(doc)

    def test_partial_validation_override_is_rejected(self) -> None:
        doc = _base_doc()
        doc["actions"][0]["validation"] = {"profile": "on-submit"}

        with pytest.raises(ValidationError):
            _validator().validate(doc)

    def test_unprefixed_unknown_intent_is_rejected(self) -> None:
        doc = _base_doc()
        doc["actions"][0]["intent"] = "quickSave"

        with pytest.raises(ValidationError):
            _validator().validate(doc)

    @pytest.mark.parametrize(
        "shadow_intent",
        [
            "x-save-draft",
            "x-autosave",
            "x-review",
            "x-submit",
            "x-request-evidence",
        ],
    )
    def test_x_intent_must_not_shadow_master_intent(self, shadow_intent: str) -> None:
        """x- intents MUST NOT collide with the 5 closed VM master-table names.

        Bare ``^x-`` would have admitted these as valid extension intents while
        the prose forbids shadowing; the pattern must reject them at the
        schema layer so static lint cannot quietly let them through.
        """
        doc = _base_doc()
        action = doc["actions"][0]
        action["id"] = "custom-action"
        action["intent"] = shadow_intent
        action["validation"] = {
            "profile": "on-submit",
            "blocking": "block-on-error",
            "persistence": "complete-response",
        }

        with pytest.raises(ValidationError):
            _validator().validate(doc)


class TestResponseActionsEffectTaxonomy:
    def test_host_event_must_not_carry_idempotency_key(self) -> None:
        doc = _base_doc()
        host_event = deepcopy(doc["actions"][0]["effects"][-1])
        host_event["idempotencyKey"] = "@invocation.id"
        doc["actions"][0]["effects"] = [host_event]

        with pytest.raises(ValidationError):
            _validator().validate(doc)

    def test_durable_effect_requires_idempotency_key(self) -> None:
        doc = _base_doc()
        durable_effect = deepcopy(doc["actions"][0]["effects"][0])
        durable_effect.pop("idempotencyKey", None)
        doc["actions"][0]["effects"] = [durable_effect]

        with pytest.raises(ValidationError):
            _validator().validate(doc)

    @pytest.mark.parametrize("event_kind", ["case.created", "case.updated", "action.started"])
    def test_ledger_effect_forbids_case_and_action_lifecycle_kinds(self, event_kind: str) -> None:
        doc = _base_doc()
        ledger_effect = {
            "type": "ledgerAppend",
            "eventKind": event_kind,
            "idempotencyKey": "@invocation.id",
        }
        doc["actions"][0]["effects"] = [ledger_effect]

        with pytest.raises(ValidationError):
            _validator().validate(doc)

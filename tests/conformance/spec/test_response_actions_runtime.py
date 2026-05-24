"""Reference harness for the Response Actions runtime contract."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
FIXTURES_DIR = ROOT / "tests" / "conformance" / "fixtures" / "response-actions"
# Per ADR 0150 §4.2/§10 — MasterTable four-constraint demotion: schema's
# MasterTable no longer carries `const`. Byte-equality authority for the
# canonical 5 rows moved to the JCS (RFC 8785) fixture.
JCS_MASTER_TABLE_FIXTURE = (
    ROOT
    / "tests"
    / "conformance"
    / "fixtures"
    / "validation-mapping"
    / "closed-core-5-rows-jcs.json"
)


def _load_master_table() -> dict[str, dict[str, str]]:
    """Derive the intent→(profile, blocking, persistence) map from the
    canonical JCS (RFC 8785) byte-equality fixture for the §6 closed-core 5
    rows. Per ADR 0150 §4.2/§10, this fixture replaced the schema's
    `MasterTable.const` as the single source of truth for closed-core row
    membership; duplicating the rows in this harness would break the §9
    row-3 promotion gate the moment §6 prose moved.
    """
    with JCS_MASTER_TABLE_FIXTURE.open(encoding="utf-8") as handle:
        rows = json.load(handle)
    return {
        row["intent"]: {
            "profile": row["profile"],
            "blocking": row["blocking"],
            "persistence": row["persistence"],
        }
        for row in rows
    }


MASTER_TABLE = _load_master_table()


def _fixture(name: str) -> dict:
    with (FIXTURES_DIR / name).open(encoding="utf-8") as handle:
        return json.load(handle)


def _action_for(fixture: dict) -> dict:
    action_id = fixture.get("invocation", {}).get("actionId")
    if not action_id:
        actions = fixture["responseActions"]["actions"]
        assert len(actions) == 1
        return actions[0]
    for action in fixture["responseActions"]["actions"]:
        if action["id"] == action_id:
            return action
    raise AssertionError(f"Fixture actionId did not resolve: {action_id}")


def _validation_tuple(action: dict) -> dict:
    if "validation" in action:
        assert set(action["validation"]) == {"profile", "blocking", "persistence"}
        return action["validation"]
    intent = action["intent"]
    if intent in MASTER_TABLE:
        return MASTER_TABLE[intent]
    if intent.startswith("x-"):
        raise AssertionError(f"x- intent {intent!r} must declare validation")
    raise AssertionError(f"Unknown unprefixed intent {intent!r}")


def _not_invoked(count: int) -> list[str]:
    return ["not-invoked"] * count


def _evaluate(fixture: dict) -> dict:
    action = _action_for(fixture)
    tuple_ = _validation_tuple(action)
    effects = action.get("effects", [])
    simulated = fixture.get("simulated", {})

    for precondition in action.get("preconditions", []):
        outcome = simulated.get("preconditions", {}).get(precondition["id"], True)
        if outcome is False:
            terminal = "blocked" if precondition["severity"] == "block" else "deferred"
            return {
                "terminal": terminal,
                "blockedCause": "precondition" if terminal == "blocked" else None,
                "blockedPreconditionId": precondition["id"] if terminal == "blocked" else None,
                "validationReportProduced": False,
                "effectStatuses": _not_invoked(len(effects)),
                "replayTokenIssued": terminal == "deferred",
            }

    validation_report_produced = tuple_["profile"] != "off"
    simulated_validation = simulated.get("validation")
    if (
        tuple_["blocking"] == "block-on-error"
        and simulated_validation is not None
        and simulated_validation.get("valid") is False
    ):
        return {
            "terminal": "blocked",
            "blockedCause": "validation",
            "persistence": "none",
            "statusAfter": fixture["responseBefore"]["status"],
            "validationReportProduced": validation_report_produced,
            "effectStatuses": _not_invoked(len(effects)),
        }

    effect_statuses: list[str] = []
    simulated_effects = simulated.get("effects", {})
    for index, effect in enumerate(effects):
        status = simulated_effects.get(str(index), "succeeded")
        effect_statuses.append(status)
        if status == "failed":
            # §6.5 default onError policy: evidenceRequest defaults to 'defer';
            # all other durable effects default to 'fail'. Mirrors
            # packages/formspec-engine/src/response-actions.ts effectErrorPolicy.
            default_policy = "defer" if effect.get("type") == "evidenceRequest" else "fail"
            on_error = effect.get("onError", default_policy)
            if on_error == "defer":
                effect_statuses.extend(_not_invoked(len(effects) - index - 1))
                return {
                    "terminal": "deferred",
                    "persistence": "none",
                    "statusAfter": fixture["responseBefore"]["status"],
                    "validationReportProduced": validation_report_produced,
                    "effectStatuses": effect_statuses,
                    "replayTokenIssued": True,
                }
            effect_statuses.extend(_not_invoked(len(effects) - index - 1))
            return {
                "terminal": "failed",
                "persistence": "none",
                "statusAfter": fixture["responseBefore"]["status"],
                "validationReportProduced": validation_report_produced,
                "effectStatuses": effect_statuses,
                "compensationsAttempted": False,
            }
        if status == "deferred":
            effect_statuses.extend(_not_invoked(len(effects) - index - 1))
            return {
                "terminal": "deferred",
                "persistence": "none",
                "statusAfter": fixture["responseBefore"]["status"],
                "validationReportProduced": validation_report_produced,
                "effectStatuses": effect_statuses,
                "replayTokenIssued": True,
            }

    status_after = fixture["responseBefore"]["status"]
    if tuple_["persistence"] == "draft-checkpoint":
        status_after = "in-progress"
    elif tuple_["persistence"] == "complete-response":
        status_after = "completed"

    return {
        "terminal": "completed",
        "persistence": tuple_["persistence"],
        "statusAfter": status_after,
        "validationReportProduced": validation_report_produced,
        "effectStatuses": effect_statuses,
        "ledgerEventKinds": [
            effect["eventKind"]
            for effect in effects
            if effect.get("type") == "ledgerAppend"
        ],
    }


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
        "precondition-fails-blocked.json",
        "precondition-fails-deferred.json",
    ],
)
def test_response_actions_fixture_outcomes(fixture_name: str) -> None:
    fixture = _fixture(fixture_name)
    observed = _evaluate(fixture)

    for key, expected_value in fixture["expected"].items():
        if key in observed:
            assert observed[key] == expected_value, f"{fixture_name}: {key}"


def test_master_action_shapes_resolve_to_validation_mapping_master_table() -> None:
    fixture = _fixture("master-action-shapes.json")

    observed = {
        action["intent"]: _validation_tuple(action)
        for action in fixture["responseActions"]["actions"]
    }

    assert observed == MASTER_TABLE


def test_effect_ordering_is_preserved() -> None:
    fixture = _fixture("effect-ordering.json")
    action = _action_for(fixture)

    assert [effect["type"] for effect in action["effects"]] == fixture["expected"]["effectTypes"]


def test_idempotent_replay_uses_frozen_effect_keys() -> None:
    fixture = _fixture("effect-idempotent-replay.json")
    action = _action_for(fixture)
    keys = [effect["idempotencyKey"] for effect in action["effects"]]

    assert len(keys) == len(set(keys))
    assert all("invocation.attempt" not in key for key in keys)
    assert fixture["expected"]["duplicateDurableEffects"] is False


def test_cross_spec_intake_handoff_does_not_author_case_created() -> None:
    fixture = _fixture("cross-spec-intake-handoff-seam.json")
    action = _action_for(fixture)
    ledger_kinds = [
        effect["eventKind"]
        for effect in action["effects"]
        if effect.get("type") == "ledgerAppend"
    ]

    assert "case.created" not in ledger_kinds
    assert not any(kind.startswith("case.") for kind in ledger_kinds)
    assert fixture["expected"]["caseCreatedEventEmitted"] is False

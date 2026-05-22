"""ActionButton binding contract (Component §5.19)."""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from tests.unit.support.schema_fixtures import build_schema_registry

ROOT = Path(__file__).resolve().parents[3]
COMPONENT_SCHEMA = ROOT / "schemas" / "component.schema.json"
COMMON_SCHEMA = ROOT / "schemas" / "common.schema.json"


def _load(path: Path) -> dict:
    return json.loads(path.read_text())


def _component_validator() -> Draft202012Validator:
    schema = _load(COMPONENT_SCHEMA)
    common = _load(COMMON_SCHEMA)
    return Draft202012Validator(
        schema,
        registry=build_schema_registry(schema, common),
    )


def _component_doc(tree: dict) -> dict:
    return {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": {"url": "https://example.test/form"},
        "tree": tree,
    }


def test_actionbutton_requires_actionref():
    schema = _load(COMPONENT_SCHEMA)
    actionbutton = schema["$defs"]["ActionButton"]
    assert "actionRef" in actionbutton["required"]


def test_actionbutton_rejects_legacy_mode_and_emit_event():
    schema = _load(COMPONENT_SCHEMA)
    actionbutton = schema["$defs"]["ActionButton"]
    props = actionbutton["properties"]
    assert "mode" not in props, "ActionButton MUST NOT carry legacy mode prop"
    assert "emitEvent" not in props, "ActionButton MUST NOT carry legacy emitEvent prop"
    assert actionbutton["unevaluatedProperties"] is False


def test_actionbutton_validates_with_minimal_fixture():
    validator = _component_validator()
    doc = _component_doc({"component": "ActionButton", "actionRef": "submit-application"})
    assert list(validator.iter_errors(doc)) == []


def test_actionbutton_rejects_missing_actionref():
    validator = _component_validator()
    doc = _component_doc({"component": "ActionButton", "label": {"literal": "Submit"}})
    assert list(validator.iter_errors(doc))


def test_actionbutton_rejects_legacy_mode_and_emit_event_at_document_level():
    validator = _component_validator()
    doc = _component_doc({
        "component": "ActionButton",
        "actionRef": "submit-application",
        "mode": "submit",
        "emitEvent": True,
    })
    assert list(validator.iter_errors(doc))


@pytest.mark.parametrize(
    "non_trigger_widget",
    [
        {"component": "TextInput", "bind": "name", "actionRef": "submit-application"},
        {"component": "Section", "actionRef": "submit-application", "children": []},
        {"component": "MoneyInput", "bind": "amount", "actionRef": "save-progress"},
    ],
)
def test_actionref_rejected_on_non_actionbutton_widgets(non_trigger_widget):
    validator = _component_validator()
    doc = _component_doc(non_trigger_widget)
    assert list(validator.iter_errors(doc))


def resolve_actionref(button: dict, response_actions: dict | None) -> dict:
    """Reference resolver output shape pinned by Component §5.19.4.1."""
    findings = []
    annotation = {}
    target = button.get("actionRef")

    if response_actions is None:
        if target:
            findings.append({
                "code": "COMP-REFERENTIAL-INTEGRITY",
                "severity": "error",
                "kind": "actionRef",
                "nodeId": button.get("id"),
                "target": target,
                "reason": "no-response-actions-document",
            })
        annotation["action-resolved"] = False
        return {"findings": findings, "annotation": annotation}

    action_ids = {action["id"] for action in response_actions.get("actions", [])}
    if target in action_ids:
        annotation["action-resolved"] = True
    else:
        findings.append({
            "code": "COMP-REFERENTIAL-INTEGRITY",
            "severity": "error",
            "kind": "actionRef",
            "nodeId": button.get("id"),
            "target": target,
        })
        annotation["action-resolved"] = False

    return {"findings": findings, "annotation": annotation}


def test_resolver_emits_comp_referential_integrity_on_unresolved_actionref():
    button = {"id": "submitFinal", "component": "ActionButton", "actionRef": "missing"}
    result = resolve_actionref(button, {"actions": [{"id": "save-progress"}]})
    assert result["findings"] == [{
        "code": "COMP-REFERENTIAL-INTEGRITY",
        "severity": "error",
        "kind": "actionRef",
        "nodeId": "submitFinal",
        "target": "missing",
    }]
    assert result["annotation"]["action-resolved"] is False


def test_resolver_emits_error_when_no_response_actions_document():
    button = {"id": "submitFinal", "component": "ActionButton", "actionRef": "submit-application"}
    result = resolve_actionref(button, response_actions=None)
    assert result["findings"][0]["reason"] == "no-response-actions-document"
    assert result["findings"][0]["severity"] == "error"


def test_resolver_no_silent_fallback():
    button = {"id": "submitFinal", "component": "ActionButton", "actionRef": "missing"}
    response_actions = {
        "actions": [{"id": "save-progress"}],
        "defaultSubmitActionRef": "save-progress",
    }
    result = resolve_actionref(button, response_actions)
    assert result["annotation"]["action-resolved"] is False
    assert "fallbackAction" not in result["annotation"]


def test_resolver_is_deterministic():
    button = {"id": "submitFinal", "component": "ActionButton", "actionRef": "submit"}
    response_actions = {"actions": [{"id": "submit"}]}
    assert resolve_actionref(button, response_actions) == resolve_actionref(button, response_actions)


def test_resolver_does_not_mutate_inputs():
    button = {"id": "submitFinal", "component": "ActionButton", "actionRef": "submit"}
    response_actions = {"actions": [{"id": "submit"}]}
    before = (copy.deepcopy(button), copy.deepcopy(response_actions))
    resolve_actionref(button, response_actions)
    assert (button, response_actions) == before

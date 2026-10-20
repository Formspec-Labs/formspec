"""The Python adapter carries native advisories without changing validity."""
from copy import deepcopy

import pytest

from formspec._rust import _lint_raw, lint


def definition():
    return {
        "$formspec": "1.0", "url": "urn:test:advisories", "version": "1.0.0",
        "status": "draft", "title": "Advisories",
        "items": [{"key": "value", "type": "field", "label": "Value", "dataType": "string"}],
        "binds": [{"path": "value", "required": "true", "readonly": "true"}],
    }


@pytest.mark.parametrize("mode", ["runtime", "authoring", "strict"])
def test_advisory_warning_does_not_invalidate_definition(mode):
    result = _lint_raw(definition(), mode=mode)
    assert result["valid"] is True
    assert [(d["code"], d["severity"], d["path"], d["pass"]) for d in result["diagnostics"]] == [
        ("W900", "warning", "value", 10)
    ]
    assert [(d.code, d.severity) for d in lint(definition(), mode=mode)] == [("W900", "warning")]


def test_calculation_info_preserves_empty_value_caveat_and_explicit_editability():
    document = definition()
    document["binds"][0] = {"path": "value", "required": "true", "calculate": "null"}
    result = _lint_raw(document, mode="strict")
    assert result["valid"] is True
    assert [(d["code"], d["severity"]) for d in result["diagnostics"]] == [("W902", "info")]
    assert "still applies" in result["diagnostics"][0]["message"]
    document["binds"][0]["readonly"] = "false"
    assert _lint_raw(document)["diagnostics"] == []


def test_prepopulation_warning_and_declared_empty_initial_source():
    document = definition()
    document["items"][0]["initialValue"] = None
    assert _lint_raw(document)["diagnostics"] == []
    document = deepcopy(document)
    document["items"][0]["prePopulate"] = {"instance": "source", "path": "value", "editable": True}
    document["instances"] = {"source": {"data": {"value": "seed"}}}
    document["binds"][0] = {"path": "value", "calculate": "null", "readonly": "false"}
    result = _lint_raw(document)
    assert result["valid"] is True
    assert [(d["code"], d["severity"]) for d in result["diagnostics"]] == [("W901", "warning")]

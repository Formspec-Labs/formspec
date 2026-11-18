"""Schema conformance for warning explanations and grouped acknowledgements."""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from tests.unit.support.schema_fixtures import build_schema_registry, load_schema

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "explanations"
DEFINITION = load_schema("definition.schema.json")
RESPONSE = load_schema("response.schema.json")
RESULT = load_schema("validation-result.schema.json")
LOCALE = load_schema("locale.schema.json")
REGISTRY = build_schema_registry(
    DEFINITION, RESPONSE, RESULT, LOCALE, load_schema("common.schema.json"),
)


def _fixture(name):
    return json.loads((FIXTURES / name).read_text())


def _errors(schema, document):
    validator = Draft202012Validator(
        schema, registry=REGISTRY, format_checker=Draft202012Validator.FORMAT_CHECKER,
    )
    return list(validator.iter_errors(document))


def test_both_response_entry_forms_are_valid():
    assert not _errors(RESPONSE, _fixture("valid-entries.response.json"))


def test_instance_confirmation_needs_no_text_and_allows_root():
    response = _fixture("valid-entries.response.json")
    entry = response["explanations"][0]
    del entry["text"]
    entry["path"] = "#"
    assert not _errors(RESPONSE, response)


def test_group_identifies_distinct_bound_parties():
    response = _fixture("valid-entries.response.json")
    group = response["explanations"][1]
    group["partyRef"] = "urn:example:party:1"
    response["explanations"].append({**group, "partyRef": "urn:example:party:2"})
    assert not _errors(RESPONSE, response)


@pytest.mark.parametrize("index,field,value", [
    (0, "group", False),
    (0, "code", "NOT_ANSWERED"),
    (0, "partyRef", "urn:example:party:1"),
    (0, "path", "lines[*].amount"),
    (0, "basis", "sha256:1234"),
    (0, "author", {"name": "Unidentified"}),
    (1, "group", False),
    (1, "shapeId", "variance"),
    (1, "text", "Not a grouped field"),
    (1, "paths", []),
    (1, "paths", ["narrative", "narrative"]),
    (1, "paths", ["lines[02].amount"]),
    (1, "partyRef", ""),
    (1, "partyRole", "coApplicant"),
    (1, "recorded", "yesterday"),
])
def test_invalid_explanation_entries(index, field, value):
    response = _fixture("valid-entries.response.json")
    response["explanations"][index][field] = value
    assert _errors(RESPONSE, response)


@pytest.mark.parametrize("index,field", [
    (0, "shapeId"), (0, "path"), (0, "basis"), (0, "author"), (0, "recorded"),
    (1, "code"), (1, "group"), (1, "paths"), (1, "basis"), (1, "author"), (1, "recorded"),
])
def test_explanation_fields_required_by_form(index, field):
    response = _fixture("valid-entries.response.json")
    del response["explanations"][index][field]
    assert _errors(RESPONSE, response)


@pytest.mark.parametrize("inherited", [False, True])
def test_acknowledge_shape_requires_explicit_code(inherited):
    definition = _fixture("invalid-acknowledge-without-code.definition.json")
    shape = definition["shapes"][0]
    if inherited:
        definition["warningExplanation"] = shape.pop("explanation")
    assert _errors(DEFINITION, definition)
    shape["code"] = ""
    assert _errors(DEFINITION, definition)
    shape["code"] = "NOT_ANSWERED"
    assert not _errors(DEFINITION, definition)


@pytest.mark.parametrize("mode", ["none", "confirm", "explain", "acknowledge"])
def test_warning_explanation_default_and_shape_override(mode):
    definition = _fixture("invalid-acknowledge-without-code.definition.json")
    definition["warningExplanation"] = mode
    definition["shapes"][0].update(explanation="none")
    assert not _errors(DEFINITION, definition)


@pytest.mark.parametrize("code,severity,location", [
    ("EXPLANATION_REQUIRED", "error", {"path": "lines[2].amount", "shapeId": "variance"}),
    ("EXPLANATION_STALE", "error", {"path": "#", "context": {"code": "NOT_ANSWERED"}}),
    ("EXPLANATION_UNUSED", "info", {"path": "#", "context": {"code": "NOT_ANSWERED"}}),
])
def test_explanation_validation_results(code, severity, location):
    result = {
        "$formspecValidationResult": "1.0", "severity": severity,
        "constraintKind": "explanation", "source": "shape", "code": code,
        "message": "Check warning follow-up.",
        **location,
    }
    assert not _errors(RESULT, result)
    assert _errors(RESULT, {**result, "severity": "warning"})
    if "context" in location:
        assert _errors(RESULT, {**result, "path": "narrative"})
        assert _errors(RESULT, {**result, "context": {}})
    del result["code"]
    assert _errors(RESULT, result)


@pytest.mark.parametrize("source", [{}, {"source": "external"}])
def test_explanation_results_require_shape_source(source):
    result = {
        "$formspecValidationResult": "1.0", "severity": "error",
        "constraintKind": "explanation", "code": "EXPLANATION_REQUIRED",
        "message": "Confirm the outstanding warnings.", "path": "#",
        "context": {"code": "NOT_ANSWERED"}, **source,
    }
    assert _errors(RESULT, result)


def test_group_explanation_result_identifies_only_the_code():
    result = {
        "$formspecValidationResult": "1.0", "severity": "error",
        "constraintKind": "explanation", "source": "shape", "code": "EXPLANATION_STALE",
        "message": "Confirm the outstanding warnings.", "path": "#",
        "context": {"code": "NOT_ANSWERED", "partyRef": "urn:example:party:1"},
    }
    assert _errors(RESULT, result)


def test_locale_accepts_explanation_prompt_key():
    locale = {
        "$formspecLocale": "2.0", "locale": "fr", "version": "1.0.0",
        "target": {"kind": "definition", "url": "https://example.org/forms/annual-report"},
        "strings": {"$shape.variance.explanationPrompt": "Expliquez cet écart."},
    }
    assert not _errors(LOCALE, locale)

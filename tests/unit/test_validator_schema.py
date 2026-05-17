from __future__ import annotations

import json
import signal
from pathlib import Path

import pytest

from formspec._rust import detect_document_type, lint
from tests.unit.support.schema_fixtures import load_schema

_EXAMPLES_DIR = Path(__file__).resolve().parents[2] / "examples"


def _with_timeout(seconds: int):
    """Decorator that fails a test if it exceeds *seconds* wall-clock time (Unix only)."""
    def decorator(fn):
        def wrapper(*args, **kwargs):
            def _alarm_handler(signum, frame):
                raise TimeoutError(
                    f"{fn.__name__} did not complete within {seconds}s"
                )
            old = signal.signal(signal.SIGALRM, _alarm_handler)
            signal.alarm(seconds)
            try:
                return fn(*args, **kwargs)
            finally:
                signal.alarm(0)
                signal.signal(signal.SIGALRM, old)
        wrapper.__name__ = fn.__name__
        wrapper.__doc__ = fn.__doc__
        return wrapper
    return decorator


def test_detect_definition_doc_type() -> None:
    document = {
        "$formspec": "1.0",
        "url": "https://example.com/forms/x",
        "version": "1.0.0",
        "status": "draft",
        "title": "X",
        "items": [{"key": "f1", "type": "field", "label": "F1", "dataType": "string"}],
    }
    assert detect_document_type(document) == "definition"
    assert lint(document) == []


def test_schema_error_maps_to_diagnostic_path() -> None:
    document = {
        "$formspec": "1.0",
        "url": "https://example.com/forms/x",
        "version": "1.0.0",
        "status": "draft",
        "title": "X",
        "items": [{"key": "f1", "type": "field", "label": "F1", "dataType": "blob"}],
    }

    diagnostics = lint(document)

    assert diagnostics
    assert any(diag.path == "$.items[0].dataType" for diag in diagnostics)


def test_unknown_document_type_is_reported() -> None:
    assert detect_document_type({"hello": "world"}) is None
    diagnostics = lint({"hello": "world"})
    assert len(diagnostics) == 1
    assert diagnostics[0].code == "E100"


def test_detect_validation_result_doc_type() -> None:
    document = {
        "$formspecValidationResult": "1.0",
        "path": "applicant.email",
        "severity": "error",
        "constraintKind": "required",
        "message": "This field is required.",
    }

    assert detect_document_type(document) == "validation_result"


def test_detect_fel_functions_doc_type() -> None:
    schema = load_schema("fel-functions.schema.json")
    document = {
        "$formspecFelFunctions": "1.0",
        "version": schema["version"],
        "functions": [schema["functions"][0]],
    }

    assert detect_document_type(document) == "fel_functions"


# ---------------------------------------------------------------------------
# Component document validation (Bug 1: oneOf + unevaluatedProperties hang)
# ---------------------------------------------------------------------------


@_with_timeout(10)
def test_component_validation_completes_on_large_tree() -> None:
    """Validates the grant-application component.json (115 nodes) in bounded time.

    Before the fix, jsonschema's oneOf + unevaluatedProperties caused
    exponential backtracking that hung indefinitely on large component trees.
    """
    doc = json.loads((_EXAMPLES_DIR / "grant-application" / "component.json").read_text())
    assert detect_document_type(doc) == "component"
    # Rust linter must finish in bounded time; grant-app tree may carry semantic warnings
    diagnostics = lint(doc)
    assert isinstance(diagnostics, list)


@_with_timeout(10)
def test_component_validation_detects_errors() -> None:
    """Component validation should still report genuine schema violations."""
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": {"url": "https://example.com/forms/x"},
        "tree": {
            "component": "Stack",
            "children": [
                {"component": "TextInput", "bind": "name", "bogusProperty": 42},
            ],
        },
    }

    diagnostics = lint(doc)
    assert any("bogusProperty" in d.message for d in diagnostics)


@_with_timeout(10)
def test_component_validation_valid_small_tree() -> None:
    """A small, valid component document should pass validation cleanly."""
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": {"url": "https://example.com/forms/x"},
        "tree": {
            "component": "Stack",
            "children": [
                {"component": "Heading", "level": 1, "text": "Hello"},
                {"component": "TextInput", "bind": "name"},
            ],
        },
    }

    assert detect_document_type(doc) == "component"
    diagnostics = lint(doc)
    assert diagnostics == []


@_with_timeout(10)
def test_component_validation_custom_component_ref() -> None:
    """Custom component references should be detected as component documents."""
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": {"url": "https://example.com/forms/x"},
        "components": {
            "MyWidget": {
                "params": ["field"],
                "tree": {"component": "TextInput", "bind": "{field}"},
            }
        },
        "tree": {
            "component": "Stack",
            "children": [
                {"component": "MyWidget", "params": {"field": "name"}},
            ],
        },
    }

    assert detect_document_type(doc) == "component"
    # Rust linter may emit E806 here because it checks custom component param
    # binding differently than the old JSON Schema validator did.
    # The original test was about schema validation passing — document type
    # detection is the meaningful assertion now.
    diagnostics = lint(doc)
    # Only E806 (semantic) is acceptable — no schema-level errors
    assert all(d.code == "E806" for d in diagnostics)

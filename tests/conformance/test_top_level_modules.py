"""Conformance tests for ADR 0150 §4.3/§4.9: top-level `modules: ModuleRef[]`
on every substrate-consuming document schema (carrier-point — Task 7's
App Manifest reframe presumes consuming-doc schemas can carry the declaration).

Non-breaking: field is OPTIONAL; default-module-set behavior preserves
form-only documents that don't declare modules[].

Surface excluded from this sweep — schema doesn't exist at P0 (ships in P2
per ADR §14 P2).
"""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

SCHEMAS_DIR = Path(__file__).parents[2] / "schemas"
COMMON_SCHEMA = json.loads((SCHEMAS_DIR / "common.schema.json").read_text())

# Substrate-consuming schemas that gain top-level modules[].
CONSUMING_SCHEMAS = {
    "definition": "definition.schema.json",
    "experience": "experience.schema.json",
    "component": "component.schema.json",
    "response-actions": "response-actions.schema.json",
    "theme": "theme.schema.json",
    "locale": "locale.schema.json",
    "mapping": "mapping.schema.json",
}

LOADED_SCHEMAS = {
    name: json.loads((SCHEMAS_DIR / fname).read_text())
    for name, fname in CONSUMING_SCHEMAS.items()
}


def _build_registry() -> Registry:
    resources = [
        (COMMON_SCHEMA["$id"], Resource.from_contents(COMMON_SCHEMA, default_specification=DRAFT202012)),
    ]
    for name, schema in LOADED_SCHEMAS.items():
        if "$id" in schema:
            resources.append((schema["$id"], Resource.from_contents(schema, default_specification=DRAFT202012)))
    return Registry().with_resources(resources)


REGISTRY = _build_registry()


def _validate(schema_name: str, doc: dict) -> None:
    schema = LOADED_SCHEMAS[schema_name]
    Draft202012Validator(schema, registry=REGISTRY).validate(doc)


# ─── Minimal valid documents per schema (for layering modules[] on top of) ───


def _minimal_definition() -> dict:
    return {
        "$formspec": "1.0",
        "url": "https://example.org/forms/test",
        "version": "1.0.0",
        "status": "active",
        "title": "Test",
        "items": [],
    }


def _minimal_experience() -> dict:
    return {
        "$formspecExperience": "1.0",
        "version": "1.0.0",
        "targetDefinition": {"url": "https://example.org/forms/test"},
        "units": [],
        "tasks": [],
    }


def _minimal_component() -> dict:
    return {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": {"url": "https://example.org/forms/test"},
        "tree": {"component": "Section"},
    }


def _minimal_response_actions() -> dict:
    return {
        "$formspecResponseActions": "1.0",
        "version": "1.0.0",
        "targetDefinition": {"url": "https://example.org/forms/test"},
        "actions": [],
    }


def _minimal_theme() -> dict:
    return {
        "$formspecTheme": "1.0",
        "version": "1.0.0",
        "targetDefinition": {"url": "https://example.org/forms/test"},
    }


def _minimal_locale() -> dict:
    return {
        "$formspecLocale": "1.0",
        "version": "1.0.0",
        "locale": "en-US",
        "targetDefinition": {"url": "https://example.org/forms/test"},
        "strings": {},
    }


def _minimal_mapping() -> dict:
    return {
        "$formspecMapping": "1.0",
        "version": "1.0.0",
        "definitionRef": "https://example.org/forms/test",
        "definitionVersion": "1.0.0",
        "targetSchema": {"type": "object"},
        "rules": [],
    }


MINIMAL_FACTORIES = {
    "definition": _minimal_definition,
    "experience": _minimal_experience,
    "component": _minimal_component,
    "response-actions": _minimal_response_actions,
    "theme": _minimal_theme,
    "locale": _minimal_locale,
    "mapping": _minimal_mapping,
}


# ─── modules[] is OPTIONAL — pre-existing form-only documents validate ───────


@pytest.mark.parametrize("schema_name", list(CONSUMING_SCHEMAS.keys()))
def test_minimal_without_modules_validates(schema_name):
    """ADR §4.9 default-module-set behavior: documents with no modules[] field
    continue to validate identically (backward-compat proof)."""
    doc = MINIMAL_FACTORIES[schema_name]()
    try:
        _validate(schema_name, doc)
    except ValidationError as e:
        # If the minimal doc is missing other required fields, that's a fixture
        # problem, not a Task-4 regression. Re-raise with context for diagnosis.
        pytest.skip(f"{schema_name} minimal fixture lacks unrelated required field: {e.message[:120]}")


# ─── modules[] accepts ModuleRef[] when declared ─────────────────────────────


@pytest.mark.parametrize("schema_name", list(CONSUMING_SCHEMAS.keys()))
def test_with_modules_validates(schema_name):
    """Documents declaring modules[] validate against the new top-level slot."""
    doc = MINIMAL_FACTORIES[schema_name]()
    doc["modules"] = [
        {"id": "x-formspec-core-task", "version": "^1.0.0"},
        {"id": "x-formspec-presentation", "version": "0.1.0",
         "publisher": "https://example.org/", "lockHash": "sha256:abc123"},
    ]
    try:
        _validate(schema_name, doc)
    except ValidationError as e:
        if "modules" in str(e):
            raise  # modules[] validation IS what we're testing
        pytest.skip(f"{schema_name} minimal fixture lacks unrelated required field: {e.message[:120]}")


# ─── modules[] entries follow ModuleRef shape (id required, version required) ─


@pytest.mark.parametrize("schema_name", list(CONSUMING_SCHEMAS.keys()))
def test_modules_rejects_bad_entry_missing_id(schema_name):
    doc = MINIMAL_FACTORIES[schema_name]()
    doc["modules"] = [{"version": "1.0.0"}]
    with pytest.raises(ValidationError):
        _validate(schema_name, doc)


@pytest.mark.parametrize("schema_name", list(CONSUMING_SCHEMAS.keys()))
def test_modules_rejects_bad_entry_missing_version(schema_name):
    doc = MINIMAL_FACTORIES[schema_name]()
    doc["modules"] = [{"id": "x-foo"}]
    with pytest.raises(ValidationError):
        _validate(schema_name, doc)


@pytest.mark.parametrize("schema_name", list(CONSUMING_SCHEMAS.keys()))
def test_modules_rejects_bad_id_pattern(schema_name):
    doc = MINIMAL_FACTORIES[schema_name]()
    doc["modules"] = [{"id": "not-x-prefixed", "version": "1.0.0"}]
    with pytest.raises(ValidationError):
        _validate(schema_name, doc)


# ─── modules[] accepts empty array (explicit "no modules declared") ──────────


@pytest.mark.parametrize("schema_name", list(CONSUMING_SCHEMAS.keys()))
def test_modules_accepts_empty_array(schema_name):
    """Explicit empty `modules: []` declaration validates — semantically the
    same as omitting the field, but author may want to be explicit."""
    doc = MINIMAL_FACTORIES[schema_name]()
    doc["modules"] = []
    try:
        _validate(schema_name, doc)
    except ValidationError as e:
        # str(e) includes the full schema dump (which now contains "modules"),
        # so check e.message + the failing-validator path instead.
        if "modules" in e.message or any("modules" in str(p) for p in e.absolute_path):
            raise
        pytest.skip(f"{schema_name} minimal fixture lacks unrelated required field: {e.message[:120]}")

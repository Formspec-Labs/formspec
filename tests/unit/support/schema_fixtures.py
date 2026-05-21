"""Shared schema fixtures and helpers for unit tests."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

ROOT_DIR = Path(__file__).resolve().parents[3]
SCHEMA_DIR = ROOT_DIR / "schemas"
SPEC_DIR = ROOT_DIR / "specs"


def load_schema(name: str) -> dict:
    """Load one schema file from /schemas."""
    path = SCHEMA_DIR / name
    with open(path) as f:
        return json.load(f)


def build_schema_registry(*schemas: dict) -> Registry:
    """Build a Draft 2020-12 registry for one or more schema documents."""
    resources = []
    for schema in schemas:
        schema_id = schema.get("$id")
        if not schema_id:
            raise ValueError("Schema must include an '$id' field")
        resources.append(
            (
                schema_id,
                Resource.from_contents(schema, default_specification=DRAFT202012),
            )
        )
    return Registry().with_resources(resources)


@pytest.fixture(scope="session")
def common_schema() -> dict:
    return load_schema("common.schema.json")


@pytest.fixture(scope="session")
def definition_schema() -> dict:
    return load_schema("definition.schema.json")


@pytest.fixture(scope="session")
def response_schema() -> dict:
    return load_schema("response.schema.json")


@pytest.fixture(scope="session")
def validation_report_schema() -> dict:
    return load_schema("validation-report.schema.json")


@pytest.fixture(scope="session")
def intake_handoff_schema() -> dict:
    return load_schema("intake-handoff.schema.json")


@pytest.fixture(scope="session")
def mapping_schema() -> dict:
    return load_schema("mapping.schema.json")


@pytest.fixture(scope="session")
def registry_schema() -> dict:
    return load_schema("registry.schema.json")


@pytest.fixture(scope="session")
def theme_schema() -> dict:
    return load_schema("theme.schema.json")


@pytest.fixture(scope="session")
def component_schema() -> dict:
    return load_schema("component.schema.json")


@pytest.fixture(scope="session")
def changelog_schema() -> dict:
    return load_schema("changelog.schema.json")


@pytest.fixture(scope="session")
def validation_result_schema() -> dict:
    return load_schema("validation-result.schema.json")


@pytest.fixture(scope="session")
def references_schema() -> dict:
    return load_schema("references.schema.json")


@pytest.fixture(scope="session")
def locale_schema() -> dict:
    return load_schema("locale.schema.json")


@pytest.fixture(scope="session")
def schema_registry(
    common_schema: dict,
    definition_schema: dict,
    response_schema: dict,
    intake_handoff_schema: dict,
    validation_report_schema: dict,
    validation_result_schema: dict,
    mapping_schema: dict,
    registry_schema: dict,
    theme_schema: dict,
    component_schema: dict,
    changelog_schema: dict,
    references_schema: dict,
    locale_schema: dict,
) -> Registry:
    return build_schema_registry(
        common_schema,
        definition_schema,
        response_schema,
        intake_handoff_schema,
        validation_report_schema,
        validation_result_schema,
        mapping_schema,
        registry_schema,
        theme_schema,
        component_schema,
        changelog_schema,
        references_schema,
        locale_schema,
    )

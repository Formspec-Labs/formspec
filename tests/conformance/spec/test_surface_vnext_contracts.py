"""Focused conformance gates for Surface 0.2 companion revisions.

These tests cover single-document schema and Registry semantic rules. They do
not implement AppGraphValidator; exact cross-artifact joins remain integration
work.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012


ROOT = Path(__file__).resolve().parents[3]
SCHEMAS = ROOT / "schemas"
FIXTURES = ROOT / "tests" / "conformance" / "fixtures"


def _schema(name: str) -> dict:
    return json.loads((SCHEMAS / name).read_text(encoding="utf-8"))


COMMON_SCHEMA = _schema("common.schema.json")
DEFINITION_SCHEMA = _schema("definition.schema.json")
SURFACE_SCHEMA = _schema("surface.schema.json")
REGISTRY_SCHEMA = _schema("registry.schema.json")
LOCALE_SCHEMA = _schema("locale.schema.json")

SCHEMA_REGISTRY = Registry().with_resources(
    [
        (
            schema["$id"],
            Resource.from_contents(schema, default_specification=DRAFT202012),
        )
        for schema in (
            COMMON_SCHEMA,
            DEFINITION_SCHEMA,
            SURFACE_SCHEMA,
            REGISTRY_SCHEMA,
            LOCALE_SCHEMA,
        )
    ]
)


def _validator(schema: dict) -> Draft202012Validator:
    return Draft202012Validator(
        schema,
        registry=SCHEMA_REGISTRY,
        format_checker=Draft202012Validator.FORMAT_CHECKER,
    )


def _surface_with_slot(slot: dict) -> dict:
    return {
        "$formspecSurface": "0.2",
        "id": "contract-cases",
        "entry": "home",
        "routes": [
            {
                "id": "home",
                "path": "/",
                "slots": [slot],
            }
        ],
    }


def test_surface_v0_2_binding_fixture_corpus() -> None:
    corpus = json.loads(
        (FIXTURES / "surface" / "surface-v0-2-contract.cases.json").read_text(
            encoding="utf-8"
        )
    )
    validator = _validator(SURFACE_SCHEMA)

    assert corpus["surfaceVersion"] == "0.2"
    for case in corpus["cases"]:
        doc = _surface_with_slot(case["slot"])
        errors = list(validator.iter_errors(doc))
        assert bool(errors) is not case["valid"], case["name"]
        if "expectedDom" in case:
            binding = case["slot"]["binding"]
            expected_dom = case["expectedDom"]
            assert binding["alt"] == expected_dom["alt"]
            assert expected_dom["decorative"] is (binding["alt"] == "")
            assert expected_dom["alt"] not in {
                case["slot"].get("title"),
                binding["content"],
            }
            assert case["forbiddenAltSources"] == [
                "slot.title",
                "binding.content",
                "url",
                "filename",
            ]


def _registry_with_widget_shape(widget_shape: dict) -> dict:
    return {
        "$formspecRegistry": "1.1",
        "publisher": {"name": "Conformance fixture"},
        "published": "2026-07-28T00:00:00Z",
        "entries": [
            {
                "name": "x-agency-case-summary",
                "category": "widget",
                "version": "1.0.0",
                "status": "draft",
                "description": "Widget channel conformance fixture.",
                "compatibility": {"formspecVersion": "^1.0.0"},
                "widgetShape": widget_shape,
            }
        ],
    }


def _widget_channel_name_errors(widget_shape: dict) -> list[str]:
    """Apply Registry 1.1's within-widget semantic uniqueness rule."""

    errors: list[str] = []
    for channel in ("dataInputs", "actionOutputs"):
        seen: set[str] = set()
        for declaration in widget_shape.get(channel, []):
            name = declaration["name"]
            if name in seen:
                errors.append(f"duplicate {channel} name: {name}")
            seen.add(name)
    return errors


def test_registry_v1_1_widget_channel_fixture_corpus() -> None:
    corpus = json.loads(
        (FIXTURES / "registry" / "widget-channels-v1-1.cases.json").read_text(
            encoding="utf-8"
        )
    )
    validator = _validator(REGISTRY_SCHEMA)

    assert corpus["registryVersion"] == "1.1"
    for case in corpus["cases"]:
        doc = _registry_with_widget_shape(case["widgetShape"])
        schema_errors = list(validator.iter_errors(doc))
        assert bool(schema_errors) is not case["schemaValid"], case["name"]

        semantic_errors = _widget_channel_name_errors(case["widgetShape"])
        assert bool(semantic_errors) is not case["semanticValid"], case["name"]
        if "semanticError" in case:
            assert case["semanticError"] in semantic_errors


def test_locale_v2_0_fixture_corpus() -> None:
    corpus = json.loads(
        (FIXTURES / "locale" / "locale-v2-0.cases.json").read_text(
            encoding="utf-8"
        )
    )
    validator = _validator(LOCALE_SCHEMA)

    assert corpus["localeVersion"] == "2.0"
    for case in corpus["cases"]:
        errors = list(validator.iter_errors(case["document"]))
        assert bool(errors) is not case["schemaValid"], case["name"]


def test_locale_shell_key_enum_matches_runtime_inventory_one_for_one() -> None:
    source = (
        ROOT / "packages" / "formspec-surface" / "src" / "strings.ts"
    ).read_text(encoding="utf-8")
    inventory = source.split("export const SURFACE_STRING_KEYS = [", 1)[1].split(
        "] as const;",
        1,
    )[0]
    runtime_suffixes = re.findall(r"'([A-Za-z][A-Za-z0-9]*)'", inventory)
    schema_keys = LOCALE_SCHEMA["$defs"]["SurfaceShellStringKey"]["enum"]
    schema_suffixes = [
        key.removeprefix("$module.x-formspec-surface.shell.")
        for key in schema_keys
    ]

    assert len(runtime_suffixes) == len(set(runtime_suffixes))
    assert len(schema_suffixes) == len(set(schema_suffixes))
    assert schema_suffixes == runtime_suffixes


def test_normative_prose_pins_cross_artifact_rules_without_a_test_validator() -> None:
    surface = (ROOT / "specs" / "surface" / "surface-spec.md").read_text(
        encoding="utf-8"
    )
    shell = (ROOT / "specs" / "surface" / "surface-shell-spec.md").read_text(
        encoding="utf-8"
    )
    manifest = (ROOT / "specs" / "bundle" / "app-manifest-spec.md").read_text(
        encoding="utf-8"
    )
    locale = (ROOT / "specs" / "locale" / "locale-spec.md").read_text(
        encoding="utf-8"
    )
    surface_words = " ".join(surface.split())
    shell_words = " ".join(shell.split())
    manifest_words = " ".join(manifest.split())
    locale_words = " ".join(locale.split())

    assert "Definition-only availability does not" in surface_words
    assert "The widget receives one capability: `emitAction(outputName)`" in shell_words
    assert "APP-ENTRY-AMBIGUOUS" in manifest_words
    assert "APP-ENTRY-SURFACE-UNRESOLVED" in manifest_words
    assert "MUST NOT move from an app to a Definition" in locale_words
    assert "former Surface-only replacement parser" in locale_words

"""Surface contract fixtures for ADR 0153 gate 2."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

from formspec._rust import lint


ROOT = Path(__file__).parents[3]
FIXTURES = ROOT / "tests" / "conformance" / "fixtures" / "surface"
SCHEMAS = ROOT / "schemas"

SURFACE_SCHEMA = json.loads((SCHEMAS / "surface.schema.json").read_text())
BUNDLE_SCHEMA = json.loads((SCHEMAS / "bundle-manifest.schema.json").read_text())
REGISTRY_SCHEMA = json.loads((SCHEMAS / "registry.schema.json").read_text())
COMMON_SCHEMA = json.loads((SCHEMAS / "common.schema.json").read_text())
DEFINITION_SCHEMA = json.loads((SCHEMAS / "definition.schema.json").read_text())
STRICT_REGISTRY = json.loads((FIXTURES / "strict-widget.registry.json").read_text())

REFS = Registry().with_resources(
    [
        (COMMON_SCHEMA["$id"], Resource.from_contents(COMMON_SCHEMA, default_specification=DRAFT202012)),
        (DEFINITION_SCHEMA["$id"], Resource.from_contents(DEFINITION_SCHEMA, default_specification=DRAFT202012)),
        (SURFACE_SCHEMA["$id"], Resource.from_contents(SURFACE_SCHEMA, default_specification=DRAFT202012)),
        (BUNDLE_SCHEMA["$id"], Resource.from_contents(BUNDLE_SCHEMA, default_specification=DRAFT202012)),
        (REGISTRY_SCHEMA["$id"], Resource.from_contents(REGISTRY_SCHEMA, default_specification=DRAFT202012)),
    ]
)


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


def surface_validator() -> Draft202012Validator:
    return Draft202012Validator(SURFACE_SCHEMA, registry=REFS)


def bundle_validator() -> Draft202012Validator:
    return Draft202012Validator(BUNDLE_SCHEMA, registry=REFS)


def registry_validator() -> Draft202012Validator:
    return Draft202012Validator(REGISTRY_SCHEMA, registry=REFS)


def codes(doc: dict, *, registries: list[dict] | None = None) -> set[str]:
    return {diag.code for diag in lint(doc, registry_documents=registries or [])}


def test_surface_publishable_fixture_validates_and_lints_clean() -> None:
    doc = load_fixture("publishable-workspace.surface.json")

    surface_validator().validate(doc)

    assert codes(doc, registries=[STRICT_REGISTRY]) == set()


@pytest.mark.parametrize(
    ("fixture", "expected"),
    [
        ("route-unreachable.surface.json", "E606"),
        ("embed-route-unresolved.surface.json", "E607"),
        ("transition-missing-route-param.surface.json", "E610"),
        ("embed-route-missing-route-param.surface.json", "E610"),
        ("module-widget-undeclared.surface.json", "E603"),
        ("module-widget-config-invalid.surface.json", "E604"),
    ],
)
def test_surface_fail_closed_fixtures_emit_expected_lint_codes(fixture: str, expected: str) -> None:
    doc = load_fixture(fixture)

    surface_validator().validate(doc)

    assert expected in codes(doc, registries=[STRICT_REGISTRY])


def test_surface_app_manifest_ref_uses_url_identity_not_fixture_path() -> None:
    manifest = load_fixture("app-manifest.surface-ref.json")

    bundle_validator().validate(manifest)

    surface_refs = manifest["surfaces"]
    assert surface_refs
    for ref in surface_refs:
        assert ref["url"].startswith("https://")
        assert "fixtures/" not in ref["url"]
        assert not ref["url"].endswith(".json")


def test_surface_strict_widget_registry_fixture_validates() -> None:
    registry_validator().validate(STRICT_REGISTRY)


def test_surface_schema_describes_draft_and_transition_authority() -> None:
    assert "Authoring drafts are not separate source artifacts" in SURFACE_SCHEMA["description"]
    route = SURFACE_SCHEMA["$defs"]["Route"]["properties"]
    transition = SURFACE_SCHEMA["$defs"]["Transition"]["properties"]
    assert "simple URI Template markers" in route["path"]["description"]
    assert "all declared params" in route["params"]["description"]
    assert "target route" in transition["params"]["description"]
    assert "Surface declares the navigation trigger" in transition["trigger"]["description"]
    assert "validated bundle-state bindings" in transition["when"]["description"]


def test_surface_spec_links_component_route_targets_without_ownership() -> None:
    content = (ROOT / "specs" / "surface" / "surface-spec.md").read_text(encoding="utf-8")

    assert "Component 1.2 documents MAY declare `targetSurfaceRoutes[]`" in content
    assert "Surface provides the route and slot namespace" in content
    assert "does not list mounted" in content
    assert "Components" in content
    assert "AppGraphValidator resolves Component route targets" in content

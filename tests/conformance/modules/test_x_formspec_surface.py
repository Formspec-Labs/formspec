"""ADR 0150 §14 P2 Task 2.1 — x-formspec-surface module v0.1 conformance.

Surface is the substrate-identity proof case: routes compose Definition forms,
Experience units, module widgets, static content, and nested route references
via 5 closed slot-types (ADR §6.2).

Tests verify:
1. The Registry module + 5 slot-type contributions are authored and validate.
2. surface.schema.json validates the canonical multi-route fixture.
3. The schema enforces per-slot-type binding shapes via allOf [if/then] gates.
4. screener.schema.json now admits the `surface:<route-id>` URI scheme in
   Route.target examples + description (B1 absorption).
5. The bundle-manifest already has `surfaces: SiblingRef[]` (plural) per P0
   Task 7; verify the Surface document URL resolves under the plural shape.
"""

import copy
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

ROOT = Path(__file__).parents[3]
SCHEMAS_DIR = ROOT / "schemas"
REGISTRIES_DIR = ROOT / "registries"
FIXTURES_DIR = ROOT / "tests" / "conformance" / "fixtures" / "modules" / "x-formspec-surface"

SURFACE_SCHEMA = json.loads((SCHEMAS_DIR / "surface.schema.json").read_text())
REGISTRY_SCHEMA = json.loads((SCHEMAS_DIR / "registry.schema.json").read_text())
COMMON_SCHEMA = json.loads((SCHEMAS_DIR / "common.schema.json").read_text())
DEFINITION_SCHEMA = json.loads((SCHEMAS_DIR / "definition.schema.json").read_text())
SCREENER_SCHEMA = json.loads((SCHEMAS_DIR / "screener.schema.json").read_text())
BUNDLE_MANIFEST_SCHEMA = json.loads((SCHEMAS_DIR / "bundle-manifest.schema.json").read_text())

MODULE_ID = "x-formspec-surface"
CONTRIBUTION_PREFIX = f"{MODULE_ID}-slot-type-"

CLOSED_SLOT_TYPES = (
    "definition-form",
    "experience-unit",
    "module-widget",
    "static-content",
    "embed-route",
)

_REF_REGISTRY = Registry().with_resources(
    [
        (COMMON_SCHEMA["$id"], Resource.from_contents(COMMON_SCHEMA, default_specification=DRAFT202012)),
        (REGISTRY_SCHEMA["$id"], Resource.from_contents(REGISTRY_SCHEMA, default_specification=DRAFT202012)),
        (SURFACE_SCHEMA["$id"], Resource.from_contents(SURFACE_SCHEMA, default_specification=DRAFT202012)),
        (DEFINITION_SCHEMA["$id"], Resource.from_contents(DEFINITION_SCHEMA, default_specification=DRAFT202012)),
        (SCREENER_SCHEMA["$id"], Resource.from_contents(SCREENER_SCHEMA, default_specification=DRAFT202012)),
        (BUNDLE_MANIFEST_SCHEMA["$id"], Resource.from_contents(BUNDLE_MANIFEST_SCHEMA, default_specification=DRAFT202012)),
    ]
)


def _surface_validator():
    return Draft202012Validator(SURFACE_SCHEMA, registry=_REF_REGISTRY)


def _entry_validator():
    return Draft202012Validator(
        {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "$defs": REGISTRY_SCHEMA["$defs"],
            "$ref": "#/$defs/RegistryEntry",
        },
        registry=_REF_REGISTRY,
    )


def _common_registry_doc() -> dict:
    return json.loads((REGISTRIES_DIR / "formspec-common.registry.json").read_text())


def _get_entry(doc: dict, name: str) -> dict | None:
    for e in doc.get("entries", []):
        if e.get("name") == name:
            return e
    return None


# ─── Registry module + slot-type contributions ───────────────────────────────


def test_module_entry_validates_and_has_dependencies():
    doc = _common_registry_doc()
    entry = _get_entry(doc, MODULE_ID)
    assert entry is not None, "x-formspec-surface module entry not found"
    assert entry["category"] == "module"
    assert entry["version"] == "0.1.0"
    _entry_validator().validate(entry)
    deps = entry.get("dependencies", [])
    dep_ids = {d["id"] for d in deps}
    assert dep_ids == {"x-formspec-core-task", "x-formspec-core-actions"}, (
        f"Surface MUST depend on x-formspec-core-task + x-formspec-core-actions per ADR §6.1; "
        f"got {dep_ids}"
    )


def test_module_contributes_has_five_slot_types():
    doc = _common_registry_doc()
    entry = _get_entry(doc, MODULE_ID)
    expected = {f"{CONTRIBUTION_PREFIX}{v}" for v in CLOSED_SLOT_TYPES}
    assert set(entry["contributes"]) == expected, (
        f"x-formspec-surface MUST contribute exactly the 5 closed v0.1 slot-types "
        f"(definition-form, experience-unit, module-widget, static-content, embed-route)"
    )


@pytest.mark.parametrize("slot_type", CLOSED_SLOT_TYPES)
def test_slot_type_contribution_validates(slot_type):
    doc = _common_registry_doc()
    entry = _get_entry(doc, f"{CONTRIBUTION_PREFIX}{slot_type}")
    assert entry is not None
    assert entry["category"] == "slot-type"
    assert "slotShape" in entry, f"{slot_type} missing slotShape payload"
    _entry_validator().validate(entry)
    assert entry["slotShape"]["kindValue"] == slot_type, (
        "slotShape.kindValue MUST equal the closed-core slot-type value "
        "(consistent with spec §4.1 Rule 3 kindValue convention)"
    )


# ─── Surface document schema validation ──────────────────────────────────────


def test_legal_workspace_surface_fixture_validates():
    """The multi-route fixture (modelled on the wireframe-generator spike's
    8-route Harvey-AI-style workspace, condensed to 5 routes that exercise
    every closed-core slot type) validates against surface.schema.json."""
    doc = json.loads((FIXTURES_DIR / "legal-workspace-surface.json").read_text())
    errors = list(_surface_validator().iter_errors(doc))
    assert errors == [], f"unexpected schema errors: {errors}"


def test_definition_form_requires_definition_url():
    """definition-form.definitionRef is a Definition URL, not a local handle."""
    doc = json.loads((FIXTURES_DIR / "legal-workspace-surface.json").read_text())
    invalid = copy.deepcopy(doc)
    invalid["routes"][2]["slots"][0]["binding"]["definitionRef"] = "matter-intake"

    errors = list(_surface_validator().iter_errors(invalid))
    assert any(error.json_path.endswith(".definitionRef") for error in errors)


def test_legal_workspace_surface_fixture_exercises_all_slot_types():
    doc = json.loads((FIXTURES_DIR / "legal-workspace-surface.json").read_text())
    seen = {
        slot["slotType"]
        for route in doc["routes"]
        for slot in route["slots"]
    }
    assert seen == set(CLOSED_SLOT_TYPES)


def test_surface_route_with_invalid_slot_type_fails():
    doc = {
        "$formspecSurface": "0.1",
        "id": "bad",
        "entry": "home",
        "routes": [{
            "id": "home", "path": "/",
            "slots": [{
                "id": "x", "slotType": "made-up-type", "binding": {}
            }]
        }]
    }
    with pytest.raises(ValidationError):
        _surface_validator().validate(doc)


@pytest.mark.parametrize("slot_type,bad_binding", [
    ("definition-form",  {}),  # missing definitionRef
    ("experience-unit",  {}),  # missing unitRef
    ("module-widget",    {"moduleId": "x-foo"}),  # missing widgetName
    ("static-content",   {"kind": "heading"}),  # missing content
    ("embed-route",      {}),  # missing routeRef
])
def test_slot_binding_shape_enforced_per_slot_type(slot_type, bad_binding):
    """allOf [if/then] gates pin per-slotType binding shape — each REQUIRED
    binding key MUST be present."""
    doc = {
        "$formspecSurface": "0.1",
        "id": "bad",
        "entry": "home",
        "routes": [{
            "id": "home", "path": "/",
            "slots": [{
                "id": "x", "slotType": slot_type, "binding": bad_binding
            }]
        }]
    }
    with pytest.raises(ValidationError):
        _surface_validator().validate(doc)


def test_p2_module_widget_binding_fixture_validates():
    """Per H-2 boundary-review absorption: a Surface fixture exercising
    a P2 module-widget slot binding (x-formspec-presentation / Shell;
    x-formspec-conversation / ChatThread) MUST validate. Closes the
    spike-fidelity gap where the legal-workspace fixture only used a P1
    Section widget for the module-widget slot."""
    doc = json.loads((FIXTURES_DIR / "p2-module-widget-binding.json").read_text())
    errors = list(_surface_validator().iter_errors(doc))
    assert errors == [], f"unexpected schema errors: {errors}"


def test_static_content_kind_is_closed_enum():
    doc = {
        "$formspecSurface": "0.1",
        "id": "bad",
        "entry": "home",
        "routes": [{
            "id": "home", "path": "/",
            "slots": [{
                "id": "x", "slotType": "static-content",
                "binding": { "kind": "video", "content": "https://example.com/v.mp4" }
            }]
        }]
    }
    with pytest.raises(ValidationError):
        _surface_validator().validate(doc)


# ─── Screener integration (B1 absorption) ────────────────────────────────────


def test_screener_target_description_documents_surface_uri_scheme():
    """B1: screener.schema.json:Route.target MUST mention the surface:<route-id>
    scheme as a 4th target category (was 3)."""
    target = SCREENER_SCHEMA["$defs"]["Route"]["properties"]["target"]
    assert "surface:" in target["description"], (
        "Route.target description must document the surface:<route-id> scheme"
    )
    assert "surface:" in str(target.get("examples", [])), (
        "Route.target examples must include a surface:<route-id> example"
    )
    assert "Four categories" in target["x-lm"]["intent"], (
        "Route.target x-lm.intent must enumerate 4 categories (was 3) including Surface route references"
    )


# ─── Bundle-manifest already plural per P0 Task 7 ────────────────────────────


def test_bundle_manifest_has_plural_surfaces_field():
    """H1: plan said `surface: SiblingRef` (singular); actual schema is
    `surfaces: SiblingRef[]` (plural). Fixtures use the plural form."""
    props = BUNDLE_MANIFEST_SCHEMA["properties"]
    assert "surfaces" in props, "bundle-manifest must have surfaces[] (plural)"
    assert props["surfaces"]["type"] == "array"

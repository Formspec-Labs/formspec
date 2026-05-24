"""ADR 0150 §14 P1 Task 1.3 — x-formspec-core-component module conformance.

Republishes the closed-core Component built-in widget catalog (33 widgets
sourced from specs/ui-policy.json) as a Registry module per ADR §4.9 / §4.2
with `widget` contribution entries. Each contribution carries:

- `widgetShape.props` — JSON Schema validating Theme `widgetConfig` for this
  widget. v1 default: permissive (`{type: object, additionalProperties: true}`).
  Per-widget tightening is a follow-on; the consuming Theme schema today
  carries `widgetConfig: { additionalProperties: true }` so the v1 permissive
  posture preserves existing behavior. Tighter typing surfaces via the E604
  lint pass landed in P0 Task 8 once per-widget prop schemas mature.
- `widgetShape.childrenPolicy` — one of `no-children | single-child |
  list-of-children`. Derived from each widget's natural composition shape
  (layout containers accept children; inputs do not).
- `widgetShape.fallback` — single widget name naming the Core-conformant
  fallback per Component §progressive-to-core. Sourced from
  `specs/ui-policy.json:fallbackPolicy.components.<name>.fallback` when
  present (16 of 33 widgets); omitted otherwise (the 17 Core-conformant
  primitives don't degrade).
- `widgetShape.widgetCategory` — `layout | input | display | container`, sourced
  from each widget's `category` field in `ui-policy.json`. Lands inside
  `widgetShape` (not at the Registry top level) per the plan Task 1.3 Step 5
  decision (registry.schema.json has no `tag` field; `widgetShape` is
  free-form per module).

Module-declaration-is-metadata equivalence (specs/registry/extension-registry.md
§4.1 Rule 2): Theme/Component documents using these widget names validate
identically with or without declaring the module — the closed-core schema
lanes handle validation directly.

Dual-authority mitigation choice (plan Task 1.3): `specs/ui-policy.json`
remains authoritative for widget validity inside the formspec-lint
widget-catalog pass (`crates/formspec-lint/src/ui_policy.rs`); Registry
contributions are descriptive metadata. After Task 1.3, both views describe
the same 33 widgets — a sync-drift assertion in this test catches future
maintenance gaps.
"""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

ROOT = Path(__file__).parents[3]
SCHEMAS_DIR = ROOT / "schemas"
REGISTRIES_DIR = ROOT / "registries"
UI_POLICY = ROOT / "specs" / "ui-policy.json"

REGISTRY_SCHEMA = json.loads((SCHEMAS_DIR / "registry.schema.json").read_text())
COMMON_SCHEMA = json.loads((SCHEMAS_DIR / "common.schema.json").read_text())

MODULE_ID = "x-formspec-core-component"
WIDGET_PREFIX = f"{MODULE_ID}-"

# Load the ui-policy.json widget set at module-load time so test parameters
# come from the source of truth (single point of cardinality maintenance).
_UI_POLICY = json.loads(UI_POLICY.read_text())
UI_POLICY_WIDGETS = tuple(c["name"] for c in _UI_POLICY["components"])
UI_POLICY_FALLBACKS = {
    name: info.get("fallback")
    for name, info in _UI_POLICY.get("fallbackPolicy", {}).get("components", {}).items()
}
UI_POLICY_CATEGORIES = {c["name"]: c["category"] for c in _UI_POLICY["components"]}

_REF_REGISTRY = Registry().with_resources(
    [
        (COMMON_SCHEMA["$id"], Resource.from_contents(COMMON_SCHEMA, default_specification=DRAFT202012)),
        (REGISTRY_SCHEMA["$id"], Resource.from_contents(REGISTRY_SCHEMA, default_specification=DRAFT202012)),
    ]
)


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


# ─── Module entry shape ──────────────────────────────────────────────────────


def test_module_entry_exists_and_validates():
    doc = _common_registry_doc()
    entry = _get_entry(doc, MODULE_ID)
    assert entry is not None
    assert entry["category"] == "module"
    _entry_validator().validate(entry)


def test_module_contributes_matches_ui_policy_cardinality():
    """The Registry contribution count MUST equal the ui-policy.json widget
    count. Catches dual-authority drift between Registry metadata and the
    authoritative widget-catalog source."""
    doc = _common_registry_doc()
    entry = _get_entry(doc, MODULE_ID)
    assert entry is not None
    assert len(entry["contributes"]) == len(UI_POLICY_WIDGETS), (
        f"Drift: ui-policy.json has {len(UI_POLICY_WIDGETS)} widgets, "
        f"Registry contributes[] has {len(entry['contributes'])}."
    )


def test_module_contributes_names_match_ui_policy():
    """Every ui-policy.json widget has a corresponding Registry contribution
    name (and vice versa)."""
    doc = _common_registry_doc()
    entry = _get_entry(doc, MODULE_ID)
    expected = {f"{WIDGET_PREFIX}{n.lower()}" for n in UI_POLICY_WIDGETS}
    actual = set(entry["contributes"])
    assert actual == expected, (
        f"Drift between ui-policy.json widgets and Registry contributions.\n"
        f"  in Registry not in ui-policy: {actual - expected}\n"
        f"  in ui-policy not in Registry: {expected - actual}"
    )


# ─── Per-widget contribution validation ──────────────────────────────────────


@pytest.mark.parametrize("widget_name", UI_POLICY_WIDGETS)
def test_widget_contribution_validates(widget_name):
    doc = _common_registry_doc()
    name = f"{WIDGET_PREFIX}{widget_name.lower()}"
    entry = _get_entry(doc, name)
    assert entry is not None, f"Contribution {name} not found"
    assert entry["category"] == "widget"
    assert "widgetShape" in entry, f"{name} missing widgetShape (REQUIRED for widget per ADR §4.2)"
    _entry_validator().validate(entry)


@pytest.mark.parametrize("widget_name", UI_POLICY_WIDGETS)
def test_widget_shape_has_required_keys(widget_name):
    """widgetShape convention (plan Task 1.3 Step 5): props REQUIRED,
    childrenPolicy REQUIRED, category REQUIRED (lives inside widgetShape).
    fallback OPTIONAL — present only for widgets that degrade (per
    ui-policy.json:fallbackPolicy)."""
    doc = _common_registry_doc()
    entry = _get_entry(doc, f"{WIDGET_PREFIX}{widget_name.lower()}")
    shape = entry["widgetShape"]
    for key in ("props", "childrenPolicy", "widgetCategory"):
        assert key in shape, f"{widget_name}.widgetShape missing REQUIRED {key!r}"


@pytest.mark.parametrize("widget_name", UI_POLICY_WIDGETS)
def test_widget_shape_props_is_json_schema_object(widget_name):
    """widgetShape.props validates Theme widgetConfig per ADR §4.2 → must
    be a JSON Schema object (at minimum, `{type: object}`-shaped)."""
    doc = _common_registry_doc()
    entry = _get_entry(doc, f"{WIDGET_PREFIX}{widget_name.lower()}")
    props = entry["widgetShape"]["props"]
    assert isinstance(props, dict), f"{widget_name}.widgetShape.props must be an object"
    assert props.get("type") == "object", f"{widget_name}.widgetShape.props.type must be 'object'"


@pytest.mark.parametrize("widget_name", UI_POLICY_WIDGETS)
def test_widget_shape_children_policy_is_closed_enum(widget_name):
    doc = _common_registry_doc()
    entry = _get_entry(doc, f"{WIDGET_PREFIX}{widget_name.lower()}")
    policy = entry["widgetShape"]["childrenPolicy"]
    assert policy in ("no-children", "single-child", "list-of-children"), (
        f"{widget_name}.widgetShape.childrenPolicy = {policy!r}; expected closed enum"
    )


@pytest.mark.parametrize("widget_name", UI_POLICY_WIDGETS)
def test_widget_shape_category_matches_ui_policy(widget_name):
    """widgetShape.widgetCategory MUST equal ui-policy.json's category for the
    same widget (dual-authority sync check)."""
    doc = _common_registry_doc()
    entry = _get_entry(doc, f"{WIDGET_PREFIX}{widget_name.lower()}")
    assert entry["widgetShape"]["widgetCategory"] == UI_POLICY_CATEGORIES[widget_name]


@pytest.mark.parametrize("widget_name", UI_POLICY_WIDGETS)
def test_widget_shape_fallback_matches_ui_policy(widget_name):
    """widgetShape.fallback MUST mirror ui-policy.json:fallbackPolicy.components.<name>.fallback
    when present. When absent in ui-policy (the 17 Core-conformant primitives),
    the Registry contribution omits the fallback key."""
    doc = _common_registry_doc()
    entry = _get_entry(doc, f"{WIDGET_PREFIX}{widget_name.lower()}")
    shape = entry["widgetShape"]
    expected_fallback = UI_POLICY_FALLBACKS.get(widget_name)
    if expected_fallback is None:
        assert "fallback" not in shape, (
            f"{widget_name} has no fallback in ui-policy.json but Registry "
            f"contribution carries widgetShape.fallback = {shape.get('fallback')!r}"
        )
    else:
        assert shape.get("fallback") == expected_fallback, (
            f"{widget_name} fallback drift: ui-policy={expected_fallback!r}, "
            f"Registry={shape.get('fallback')!r}"
        )


# ─── widgetName ↔ name-suffix consistency ────────────────────────────────────


@pytest.mark.parametrize("widget_name", UI_POLICY_WIDGETS)
def test_widget_kind_matches_name_suffix(widget_name):
    """The widgetShape's `kindValue` (if shipped) OR a `widgetName` field MUST
    equal the natural widget name from ui-policy. The Registry name suffix
    after the module-prefix is the lowercased widget name; the widgetShape
    carries the original-case name for tool-side resolution (same posture
    as Task 1.1 kindValue ↔ name-suffix consistency, adapted for widgets
    whose canonical case is PascalCase)."""
    doc = _common_registry_doc()
    entry = _get_entry(doc, f"{WIDGET_PREFIX}{widget_name.lower()}")
    shape = entry["widgetShape"]
    # We ship `widgetName` (original PascalCase) so tools resolve case-correctly
    # while preserving the lowercase Registry-name regex constraint.
    assert shape.get("widgetName") == widget_name, (
        f"widgetShape.widgetName missing or wrong: expected {widget_name!r}, "
        f"got {shape.get('widgetName')!r}"
    )


# ─── contributes[] ↔ entry existence ─────────────────────────────────────────


def test_contributes_names_all_resolve_within_document():
    doc = _common_registry_doc()
    entry = _get_entry(doc, MODULE_ID)
    sibling_names = {e["name"] for e in doc["entries"]}
    for name in entry["contributes"]:
        assert name in sibling_names


# ─── Negative-case template (per Task 1.1 AFTER MEDIUM-2 absorption) ─────────


def test_minimal_widget_entry_validates():
    """A minimal widget contribution carrying the schema-required fields
    plus widgetShape with the REQUIRED keys validates. Confirms no silent
    over-constraint."""
    minimal = {
        "name": "x-formspec-core-component-test-minimal",
        "category": "widget",
        "version": "1.0.0",
        "status": "stable",
        "description": "Minimal test entry.",
        "compatibility": {"formspecVersion": ">=1.0.0 <2.0.0"},
        "widgetShape": {
            "widgetName": "Stack",
            "props": {"type": "object", "additionalProperties": True},
            "childrenPolicy": "list-of-children",
            "widgetCategory": "layout",
        },
    }
    _entry_validator().validate(minimal)
